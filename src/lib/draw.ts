import type { ProductRow } from '../types'
import type { D1Database, D1PreparedStatement } from './db'
import { genId } from './auth'

type BidRow = { id: string; userId: string; productId: string; pointsUsed: number; round: number }

// Fisher-Yates 셔플 (crypto 기반)
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor((crypto.getRandomValues(new Uint32Array(1))[0] / 0xffffffff) * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// bids 회차(round) 컬럼 런타임 보장 (프로덕션 Supabase 수동 마이그레이션 불가 대응)
//   round = 추첨이 끝난 회차 번호. 0 = 현재 진행 중(미정산) 회차.
//   추첨이 끝나면 그 회차의 bids 들을 round = (이번 회차 번호)로 올려 "정산 완료"로 표시하고,
//   제품은 마감하지 않고 participantCount 만 0으로 리셋 → 같은 순서 자리에서 다음 회차가 계속 순환된다.
let _bidRoundReady = false
export async function ensureBidRound(DB: any) {
  if (_bidRoundReady) return
  await DB.prepare(`ALTER TABLE bids ADD COLUMN IF NOT EXISTS round INTEGER NOT NULL DEFAULT 0`).run()
  // 제품별 진행 회차(다음 추첨이 몇 번째 회차인지). 0부터 시작.
  await DB.prepare(`ALTER TABLE products ADD COLUMN IF NOT EXISTS roundNo INTEGER NOT NULL DEFAULT 0`).run()
  // winners ↔ bids 1:1 연결 (반복 참여로 같은 회원이 같은 제품에 여러 번 당첨될 수 있으므로)
  await DB.prepare(`ALTER TABLE winners ADD COLUMN IF NOT EXISTS bidId TEXT`).run()
  _bidRoundReady = true
}

/**
 * 추첨 로직 (정원 도달 시 자동 호출)
 * 1. 현재 회차(round=0, 미정산) Bid 만 랜덤 셔플
 * 2. 앞에서 winnersCount명 → 당첨자
 * 3. 나머지 → 미당첨자
 * 4. 당첨자: isWinner=true + Winner 레코드 + 자동 구매 처리 (참여 시 차감한 낙찰가로 제품 구매 확정)
 * 5. 미당첨자: auctionPoint += (참가비 원금 pointsUsed + losingReward) 환급
 *            → 미당첨분은 참가비를 돌려받고 추가로 미당첨 보상까지 받아 경매포인트로 재참여 가능
 * 6. ★ 제품을 마감(DRAWN)하지 않고, 이번 회차 bids 의 round 를 올려 정산완료 처리 +
 *      participantCount=0 으로 리셋 + roundNo+1 + status 는 OPEN 유지
 *      → 관리자가 직접 마감/순서이동하지 않는 한, 제품은 원래 sortOrder 자리에서 계속 반복 참여 가능
 */
export async function drawWinners(DB: D1Database, product: ProductRow): Promise<{
  winners: string[]
  losers: string[]
}> {
  await ensureBidRound(DB)
  // 현재 진행 회차 번호 (다음 회차로 올릴 때 사용). roundNo 가 없을 수 있어 product 에서 읽되 기본 0.
  const nextRound = ((product as any).roundNo ?? 0) + 1
  // 아직 정산되지 않은(round=0) 이번 회차 bids 만 추첨 대상으로 한다.
  const bids = (await DB.prepare('SELECT * FROM bids WHERE productId = ? AND round = 0').bind(product.id).all<BidRow>()).results

  const shuffled = shuffle(bids)
  const winnerBids = shuffled.slice(0, product.winnersCount)
  const loserBids = shuffled.slice(product.winnersCount)

  const stmts: D1PreparedStatement[] = []

  // 당첨자 처리 (이번 회차로 정산 표시: round = nextRound)
  for (const wb of winnerBids) {
    stmts.push(DB.prepare('UPDATE bids SET isWinner = 1, round = ? WHERE id = ?').bind(nextRound, wb.id))
    stmts.push(
      DB.prepare(
        `INSERT INTO winners (id, userId, productId, finalPrice, drawnAt, bidId)
         VALUES (?, ?, ?, ?, datetime('now'), ?)`
      ).bind(genId('w-'), wb.userId, product.id, product.startPrice, wb.id)
    )
    // 자동 구매 처리(시중가 대비 절감을 내역에 기록) — 별도 차감 없이 낙찰 확정
    stmts.push(
      DB.prepare(
        `INSERT INTO point_history (id, userId, type, pointKind, amount, description, createdAt)
         VALUES (?, ?, 'REWARD', 'AUCTION', 0, ?, datetime('now'))`
      ).bind(
        genId('ph-'),
        wb.userId,
        `🎉 낙찰! ${product.title} 자동구매 (낙찰가 ${product.startPrice.toLocaleString()}원 / 시중가 ${product.marketPrice.toLocaleString()}원)`
      )
    )
  }

  // 미당첨자 정산 — 참가비 원금 환급 + 미당첨 보상(둘 다 경매포인트로 환급 → 다시 경매에 사용 가능)
  for (const lb of loserBids) {
    // 이번 회차로 정산 표시 (다음 회차 추첨 대상에서 제외)
    stmts.push(DB.prepare('UPDATE bids SET round = ? WHERE id = ?').bind(nextRound, lb.id))
    const refund = lb.pointsUsed              // 참가비 원금 환급
    const reward = product.losingReward       // 미당첨 보상
    const total = refund + reward
    if (total > 0) {
      stmts.push(DB.prepare('UPDATE users SET auctionPoint = auctionPoint + ? WHERE id = ?').bind(total, lb.userId))
    }
    // 원금 환급 내역
    if (refund > 0) {
      stmts.push(
        DB.prepare(
          `INSERT INTO point_history (id, userId, type, pointKind, amount, description, createdAt)
           VALUES (?, ?, 'REWARD', 'AUCTION', ?, ?, datetime('now'))`
        ).bind(genId('ph-'), lb.userId, refund, `미당첨 참가비 환급: ${product.title}`)
      )
    }
    // 미당첨 보상 내역
    if (reward > 0) {
      stmts.push(
        DB.prepare(
          `INSERT INTO point_history (id, userId, type, pointKind, amount, description, createdAt)
           VALUES (?, ?, 'REWARD', 'AUCTION', ?, ?, datetime('now'))`
        ).bind(genId('ph-'), lb.userId, reward, `미당첨 보상(경매P 환급): ${product.title}`)
      )
    }
  }

  // ★ 제품 순환: 마감(DRAWN)하지 않고 다음 회차로 리셋한다.
  //   - status = 'OPEN' 유지 (관리자가 직접 마감하지 않는 한 계속 노출/참여 가능)
  //   - participantCount = 0 으로 리셋 → 다음 회차 정원이 0부터 다시 채워짐
  //   - roundNo = nextRound 로 올려 다음 추첨 회차 번호를 기록
  //   - sortOrder 는 건드리지 않으므로 원래 노출 순서 자리에 그대로 남는다.
  stmts.push(
    DB.prepare(
      `UPDATE products SET status = 'OPEN', participantCount = 0, roundNo = ? WHERE id = ?`
    ).bind(nextRound, product.id)
  )

  await DB.batch(stmts)

  return {
    winners: winnerBids.map((b) => b.userId),
    losers: loserBids.map((b) => b.userId),
  }
}
