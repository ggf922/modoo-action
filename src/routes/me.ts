import { Hono } from 'hono'
import type { Bindings, Variables, UserRow } from '../types'
import { requireAuth } from '../lib/middleware'
import { genId } from '../lib/auth'
import { ensureBidRound } from '../lib/draw'
import { maybePayReferralReward, ensureMemberFlags } from '../lib/referral'

const me = new Hono<{ Bindings: Bindings; Variables: Variables }>()
me.use('*', requireAuth)

// 포인트 충전 요청 (회원이 계좌 입금 후 신청 → 관리자 승인 시 지급)
me.post('/charge', async (c) => {
  const user = c.get('user')!
  const body = await c.req.json().catch(() => null)
  const amount = Number(body?.amount)
  const depositor = body?.depositor ? String(body.depositor).trim() : null
  if (!amount || amount <= 0) return c.json({ error: '충전 금액을 올바르게 입력해주세요.' }, 400)
  if (amount > 10000000) return c.json({ error: '1회 최대 충전 요청 금액은 10,000,000P입니다.' }, 400)
  if (!depositor) return c.json({ error: '입금자명을 입력해주세요.' }, 400)

  // PENDING 충전 요청만 생성 (실제 포인트 지급은 관리자 승인 시)
  await c.env.DB.prepare(
    `INSERT INTO charge_requests (id, userId, amount, depositor, status, requestedAt)
     VALUES (?, ?, ?, ?, 'PENDING', datetime('now'))`
  ).bind(genId('cr-'), user.id, amount, depositor).run()

  return c.json({ ok: true, amount })
})

// 내 충전 요청 목록
me.get('/charge-requests', async (c) => {
  const user = c.get('user')!
  const rows = (await c.env.DB.prepare(
    'SELECT * FROM charge_requests WHERE userId = ? ORDER BY requestedAt DESC LIMIT 50'
  ).bind(user.id).all()).results
  return c.json({ chargeRequests: rows })
})

// 포인트 내역 (필터: kind, type)
me.get('/history', async (c) => {
  const user = c.get('user')!
  const kind = c.req.query('kind') // AUCTION | BALANCE | WAGE
  const type = c.req.query('type')
  let sql = 'SELECT * FROM point_history WHERE userId = ?'
  const binds: any[] = [user.id]
  if (kind) { sql += ' AND pointKind = ?'; binds.push(kind) }
  if (type) { sql += ' AND type = ?'; binds.push(type) }
  sql += ' ORDER BY createdAt DESC LIMIT 200'
  const rows = (await c.env.DB.prepare(sql).bind(...binds).all()).results
  return c.json({ history: rows })
})

// 내 참여 내역 (당첨/미당첨)
//   반복 참여로 같은 제품에 여러 번 참여/당첨될 수 있으므로, 당첨건은 winners.bidId 로 1:1 매칭한다.
me.get('/bids', async (c) => {
  const user = c.get('user')!
  await ensureBidRound(c.env.DB)
  const rows = (await c.env.DB.prepare(
    `SELECT b.*, p.title, p.imageUrl, p.marketPrice, p.startPrice, p.losingReward, p.status AS productStatus,
            w.id AS "winnerId", w.finalPrice, w.shippingStatus,
            w.recipientName, w.recipientPhone, w.postalCode, w.address1, w.address2, w.deliveryMemo
     FROM bids b
     JOIN products p ON p.id = b.productId
     LEFT JOIN winners w ON w.bidId = b.id
     WHERE b.userId = ? ORDER BY b.createdAt DESC`
  ).bind(user.id).all()).results
  return c.json({ bids: rows })
})

// 당첨 상품 배송 정보 입력/수정 (당첨 제품은 반품 불가)
me.post('/winners/:id/shipping', async (c) => {
  const user = c.get('user')!
  const winnerId = c.req.param('id')
  const body = await c.req.json().catch(() => null)
  const recipientName = String(body?.recipientName ?? '').trim()
  const recipientPhone = String(body?.recipientPhone ?? '').trim()
  const postalCode = String(body?.postalCode ?? '').trim()
  const address1 = String(body?.address1 ?? '').trim()
  const address2 = String(body?.address2 ?? '').trim()
  const deliveryMemo = body?.deliveryMemo ? String(body.deliveryMemo).trim() : null

  if (!recipientName) return c.json({ error: '받는 분 이름을 입력해주세요.' }, 400)
  if (!recipientPhone) return c.json({ error: '연락처를 입력해주세요.' }, 400)
  if (!address1) return c.json({ error: '주소를 입력해주세요.' }, 400)

  // 본인의 당첨 건인지 확인
  const w = await c.env.DB.prepare('SELECT * FROM winners WHERE id = ? AND userId = ?')
    .bind(winnerId, user.id).first<any>()
  if (!w) return c.json({ error: '당첨 내역을 찾을 수 없습니다.' }, 404)
  // 이미 발송된 건은 수정 불가
  if (w.shippingStatus === 'SHIPPED' || w.shippingStatus === 'DELIVERED') {
    return c.json({ error: '이미 발송 처리된 주문은 배송 정보를 수정할 수 없습니다.' }, 400)
  }

  await c.env.DB.prepare(
    `UPDATE winners
     SET recipientName = ?, recipientPhone = ?, postalCode = ?, address1 = ?, address2 = ?,
         deliveryMemo = ?, shippingStatus = 'SUBMITTED', shippingSubmittedAt = datetime('now')
     WHERE id = ?`
  ).bind(recipientName, recipientPhone, postalCode, address1, address2, deliveryMemo, winnerId).run()

  return c.json({ ok: true })
})

// 출금 신청
me.post('/withdraw', async (c) => {
  const user = c.get('user')!
  const body = await c.req.json().catch(() => null)
  const amount = Number(body?.amount)
  if (!amount || amount <= 0) return c.json({ error: '출금 금액을 올바르게 입력해주세요.' }, 400)

  const dbUser = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first<UserRow>()
  if (!dbUser) return c.json({ error: '사용자 정보를 찾을 수 없습니다.' }, 404)

  const config = await c.env.DB.prepare('SELECT minWithdrawAmount FROM site_config LIMIT 1').first<{ minWithdrawAmount: number }>()
  const minAmount = config?.minWithdrawAmount ?? 10000

  if (amount < minAmount) {
    return c.json({ error: `최소 출금 금액은 ${minAmount.toLocaleString()}P입니다.` }, 400)
  }

  const withdrawable = dbUser.auctionPoint
  if (amount > withdrawable) {
    return c.json({ error: `출금 가능 경매포인트가 부족합니다. (가능: ${withdrawable.toLocaleString()}P)` }, 400)
  }

  // 출금 계좌 등록 여부와 무관하게 출금 신청을 허용한다.
  //   (계좌 정보는 관리자 처리 시 참고용이며, 미등록이어도 신청 가능)

  // PENDING 신청만 생성 (실제 차감은 관리자 승인 시)
  await c.env.DB.prepare(
    `INSERT INTO withdrawals (id, userId, amount, status, requestedAt)
     VALUES (?, ?, ?, 'PENDING', datetime('now'))`
  ).bind(genId('wd-'), user.id, amount).run()

  return c.json({ ok: true, amount })
})

// 내 출금 신청 목록
me.get('/withdrawals', async (c) => {
  const user = c.get('user')!
  const rows = (await c.env.DB.prepare(
    'SELECT * FROM withdrawals WHERE userId = ? ORDER BY requestedAt DESC'
  ).bind(user.id).all()).results
  return c.json({ withdrawals: rows })
})

// 계좌 정보 등록/수정
me.post('/bank', async (c) => {
  const user = c.get('user')!
  const body = await c.req.json().catch(() => null)
  const { bankName, bankAccount, accountHolder } = body ?? {}
  if (!bankName || !bankAccount || !accountHolder) {
    return c.json({ error: '계좌 정보를 모두 입력해주세요.' }, 400)
  }
  await c.env.DB.prepare(
    'UPDATE users SET bankName = ?, bankAccount = ?, accountHolder = ?, updatedAt = datetime(\'now\') WHERE id = ?'
  ).bind(bankName, bankAccount, accountHolder, user.id).run()
  return c.json({ ok: true })
})

// ===== 월 구독료 납부 =====
const SUBSCRIPTION_FEE = 10000 // 월 구독료(경매 포인트)

// 구독 스키마 자동 보장 (production Supabase에 수동 마이그레이션 없이 안전하게 적용)
// PostgreSQL의 IF NOT EXISTS 로 멱등 보장. 콜드스타트 간 1회만 시도.
let _subSchemaReady = false
export async function ensureSubscriptionSchema(DB: any) {
  if (_subSchemaReady) return
  try {
    await DB.prepare(`ALTER TABLE users ADD COLUMN IF NOT EXISTS subscriptionActive INTEGER NOT NULL DEFAULT 0`).run()
    await DB.prepare(`ALTER TABLE users ADD COLUMN IF NOT EXISTS subscriptionUntil TEXT`).run()
    await DB.prepare(
      `CREATE TABLE IF NOT EXISTS subscription_payments (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        amount INTEGER NOT NULL,
        period TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PAID',
        paidAt TEXT NOT NULL DEFAULT (datetime('now'))
      )`
    ).run()
    await DB.prepare(`CREATE INDEX IF NOT EXISTS idx_subscription_payments_user ON subscription_payments(userId)`).run()
    await DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS uq_subscription_user_period ON subscription_payments(userId, period)`).run()
    _subSchemaReady = true
  } catch (e) {
    // 스키마 보장 실패는 치명적이지 않게 로깅만 (다음 요청에서 재시도)
    console.error('ensureSubscriptionSchema 실패:', e)
  }
}

// 현재 월(KST) "YYYY-MM" 및 해당 월 말일 "YYYY-MM-DD" 계산
function currentPeriodKST() {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000) // UTC+9
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth() // 0-based
  const period = `${y}-${String(m + 1).padStart(2, '0')}`
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate() // 해당 월 말일
  const until = `${period}-${String(lastDay).padStart(2, '0')}`
  const label = `${m + 1}월` // "6월"
  return { period, until, label }
}

// 오늘(KST) 날짜 "YYYY-MM-DD"
function todayKST(): string {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`
}

// 기준일에서 한 달 연장한 날짜 "YYYY-MM-DD" 반환.
// baseUntil 이 없거나 오늘보다 과거이면 오늘을 기준으로 한 달 연장한다.
// (말일 보정: 1/31 + 1개월 → 2월말 등 자연스럽게 처리)
export function extendOneMonth(baseUntil: string | null): string {
  const today = todayKST()
  const base = (baseUntil && baseUntil >= today) ? baseUntil : today
  const [y, m, d] = base.split('-').map(Number)
  // 다음 달 같은 날. 다음 달에 해당 일이 없으면 그 달 말일로 보정.
  const targetMonthLast = new Date(Date.UTC(y, m, 0)).getUTCDate() // 현재 달 말일(참고용)
  const nextMonthLast = new Date(Date.UTC(y, m + 1, 0)).getUTCDate() // 다음 달 말일
  const day = Math.min(d, nextMonthLast)
  const dt = new Date(Date.UTC(y, m, day)) // m은 0-based 기준 다음 달
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

// 내 구독 상태
me.get('/subscription', async (c) => {
  const user = c.get('user')!
  await ensureSubscriptionSchema(c.env.DB)
  const u = await c.env.DB.prepare(
    'SELECT subscriptionActive, subscriptionUntil FROM users WHERE id = ?'
  ).bind(user.id).first<{ subscriptionActive: number; subscriptionUntil: string | null }>()
  const { period } = currentPeriodKST()
  const paid = await c.env.DB.prepare(
    'SELECT id FROM subscription_payments WHERE userId = ? AND period = ?'
  ).bind(user.id, period).first()
  const payments = (await c.env.DB.prepare(
    'SELECT * FROM subscription_payments WHERE userId = ? ORDER BY paidAt DESC LIMIT 24'
  ).bind(user.id).all()).results
  return c.json({
    active: !!(u?.subscriptionActive),
    until: u?.subscriptionUntil ?? null,
    paidThisMonth: !!paid,
    period,
    fee: SUBSCRIPTION_FEE,
    payments,
  })
})

// 구독료 납부 (경매 포인트 10,000P 차감 → 당월 구독 활성화)
me.post('/subscription', async (c) => {
  const user = c.get('user')!
  await ensureSubscriptionSchema(c.env.DB)
  const { period, until, label } = currentPeriodKST()

  // 이미 당월 납부했는지 확인
  const exist = await c.env.DB.prepare(
    'SELECT id FROM subscription_payments WHERE userId = ? AND period = ?'
  ).bind(user.id, period).first()
  if (exist) return c.json({ error: `이미 ${label} 구독료를 납부하셨습니다.` }, 400)

  // 잔액 확인
  const dbUser = await c.env.DB.prepare('SELECT auctionPoint FROM users WHERE id = ?')
    .bind(user.id).first<{ auctionPoint: number }>()
  if (!dbUser) return c.json({ error: '사용자 정보를 찾을 수 없습니다.' }, 404)
  if (dbUser.auctionPoint < SUBSCRIPTION_FEE) {
    return c.json({ error: `경매 포인트가 부족합니다. 구독료는 ${SUBSCRIPTION_FEE.toLocaleString()}P이며 현재 보유 ${dbUser.auctionPoint.toLocaleString()}P 입니다.` }, 400)
  }

  // batch: 납부기록(유니크로 중복방지) + 포인트 차감 + 구독 활성화 + 내역 기록
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO subscription_payments (id, userId, amount, period, status, paidAt)
         VALUES (?, ?, ?, ?, 'PAID', datetime('now'))`
      ).bind(genId('sub-'), user.id, SUBSCRIPTION_FEE, period),
      c.env.DB.prepare('UPDATE users SET auctionPoint = auctionPoint - ? WHERE id = ? AND auctionPoint >= ?')
        .bind(SUBSCRIPTION_FEE, user.id, SUBSCRIPTION_FEE).requireRows(),
      c.env.DB.prepare("UPDATE users SET subscriptionActive = 1, subscriptionUntil = ? WHERE id = ?")
        .bind(until, user.id),
      c.env.DB.prepare(
        `INSERT INTO point_history (id, userId, type, pointKind, amount, description, createdAt)
         VALUES (?, ?, 'USE', 'AUCTION', ?, ?, datetime('now'))`
      ).bind(genId('ph-'), user.id, -SUBSCRIPTION_FEE, `${label} 월 구독료 납부`),
    ])
  } catch (e: any) {
    // 동시 클릭으로 잔액 부족 가드(requireRows) 또는 유니크 충돌
    const msg = String(e?.message || e)
    if (e?.name === 'BatchGuardError' || /unique|uq_subscription/i.test(msg)) {
      return c.json({ error: '구독료 납부 처리 중 오류가 발생했습니다. (중복 또는 잔액 부족)' }, 400)
    }
    throw e
  }

  // 구독으로 활성 상태가 됐고 이미 VIP 이상이라면 추천 보상 1회 지급 (이미 지급됐으면 무시)
  await maybePayReferralReward(c.env.DB, user.id)

  return c.json({ ok: true, period, label, fee: SUBSCRIPTION_FEE })
})

// 조직도 (본인 산하만, 최대 5단계) — 상위(referrer) 절대 노출 금지
me.get('/network', async (c) => {
  const user = c.get('user')!
  await ensureMemberFlags(c.env.DB)

  // 본인 노드
  const root = await c.env.DB.prepare(
    'SELECT id, name, nickname, grade, active, createdAt, referralCode FROM users WHERE id = ?'
  ).bind(user.id).first()

  // BFS로 산하 5단계 수집
  type Node = { id: string; name: string; nickname: string; grade: string; active: number; createdAt: string; referrerId: string; level: number }
  const nodes: Node[] = []
  let currentLevel = [user.id]
  for (let depth = 1; depth <= 5; depth++) {
    if (currentLevel.length === 0) break
    const placeholders = currentLevel.map(() => '?').join(',')
    const children = (await c.env.DB.prepare(
      `SELECT id, name, nickname, grade, active, createdAt, referrerId FROM users WHERE referrerId IN (${placeholders})`
    ).bind(...currentLevel).all<Node>()).results
    for (const ch of children) {
      nodes.push({ ...ch, level: depth })
    }
    currentLevel = children.map((ch) => ch.id)
  }

  // 각 노드 활동 요약 (참여수, 당첨수)
  const allIds = [user.id, ...nodes.map((n) => n.id)]
  const summary: Record<string, { bids: number; wins: number }> = {}
  if (allIds.length > 0) {
    const ph = allIds.map(() => '?').join(',')
    const bidRows = (await c.env.DB.prepare(
      `SELECT userId, COUNT(*) AS cnt FROM bids WHERE userId IN (${ph}) GROUP BY userId`
    ).bind(...allIds).all<{ userId: string; cnt: number }>()).results
    const winRows = (await c.env.DB.prepare(
      `SELECT userId, COUNT(*) AS cnt FROM winners WHERE userId IN (${ph}) GROUP BY userId`
    ).bind(...allIds).all<{ userId: string; cnt: number }>()).results
    for (const id of allIds) summary[id] = { bids: 0, wins: 0 }
    for (const r of bidRows) summary[r.userId].bids = r.cnt
    for (const r of winRows) summary[r.userId].wins = r.cnt
  }

  return c.json({ root, nodes, summary, totalDownline: nodes.length })
})

export default me
