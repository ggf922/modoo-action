import type { ProductRow } from '../types'
import { genId } from './auth'

type BidRow = { id: string; userId: string; productId: string; pointsUsed: number }

// Fisher-Yates 셔플 (crypto 기반)
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor((crypto.getRandomValues(new Uint32Array(1))[0] / 0xffffffff) * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * 추첨 로직 (정원 도달 시 자동 호출)
 * 1. 모든 Bid 랜덤 셔플
 * 2. 앞에서 winnersCount명 → 당첨자
 * 3. 나머지 → 미당첨자
 * 4. 당첨자: isWinner=true + Winner 레코드 + 자동 구매 처리
 * 5. 미당첨자: balancePoint += losingReward + 내역
 * 6. product.status = DRAWN, endAt = now()
 */
export async function drawWinners(DB: D1Database, product: ProductRow): Promise<{
  winners: string[]
  losers: string[]
}> {
  const bids = (await DB.prepare('SELECT * FROM bids WHERE productId = ?').bind(product.id).all<BidRow>()).results

  const shuffled = shuffle(bids)
  const winnerBids = shuffled.slice(0, product.winnersCount)
  const loserBids = shuffled.slice(product.winnersCount)

  const stmts: D1PreparedStatement[] = []

  // 당첨자 처리
  for (const wb of winnerBids) {
    stmts.push(DB.prepare('UPDATE bids SET isWinner = 1 WHERE id = ?').bind(wb.id))
    stmts.push(
      DB.prepare(
        `INSERT INTO winners (id, userId, productId, finalPrice, drawnAt)
         VALUES (?, ?, ?, ?, datetime('now'))`
      ).bind(genId('w-'), wb.userId, product.id, product.startPrice)
    )
    // 자동 구매 처리(시중가 대비 절감을 내역에 기록) — 별도 차감 없이 낙찰 확정
    stmts.push(
      DB.prepare(
        `INSERT INTO point_history (id, userId, type, pointKind, amount, description, createdAt)
         VALUES (?, ?, 'REWARD', 'BALANCE', 0, ?, datetime('now'))`
      ).bind(
        genId('ph-'),
        wb.userId,
        `🎉 낙찰! ${product.title} 자동구매 (낙찰가 ${product.startPrice.toLocaleString()}원 / 시중가 ${product.marketPrice.toLocaleString()}원)`
      )
    )
  }

  // 미당첨자 보상
  if (product.losingReward > 0) {
    for (const lb of loserBids) {
      stmts.push(DB.prepare('UPDATE users SET balancePoint = balancePoint + ? WHERE id = ?').bind(product.losingReward, lb.userId))
      stmts.push(
        DB.prepare(
          `INSERT INTO point_history (id, userId, type, pointKind, amount, description, createdAt)
           VALUES (?, ?, 'REWARD', 'BALANCE', ?, ?, datetime('now'))`
        ).bind(genId('ph-'), lb.userId, product.losingReward, `미당첨 보상: ${product.title}`)
      )
    }
  }

  // 상품 상태 변경
  stmts.push(DB.prepare(`UPDATE products SET status = 'DRAWN', endAt = datetime('now') WHERE id = ?`).bind(product.id))

  await DB.batch(stmts)

  return {
    winners: winnerBids.map((b) => b.userId),
    losers: loserBids.map((b) => b.userId),
  }
}
