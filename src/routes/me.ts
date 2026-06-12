import { Hono } from 'hono'
import type { Bindings, Variables, UserRow } from '../types'
import { requireAuth } from '../lib/middleware'
import { genId } from '../lib/auth'

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
me.get('/bids', async (c) => {
  const user = c.get('user')!
  const rows = (await c.env.DB.prepare(
    `SELECT b.*, p.title, p.imageUrl, p.marketPrice, p.startPrice, p.losingReward, p.status AS productStatus,
            w.id AS winnerId, w.finalPrice, w.shippingStatus,
            w.recipientName, w.recipientPhone, w.postalCode, w.address1, w.address2, w.deliveryMemo
     FROM bids b
     JOIN products p ON p.id = b.productId
     LEFT JOIN winners w ON w.productId = b.productId AND w.userId = b.userId
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

  // 계좌 정보 확인
  if (!dbUser.bankName || !dbUser.bankAccount || !dbUser.accountHolder) {
    return c.json({ error: '출금 계좌 정보(은행·계좌번호·예금주)를 먼저 등록해주세요.' }, 400)
  }

  // 회원 정보와 출금 정보 일치 검증: 예금주명이 회원 이름과 일치해야 함 (공백 제거 후 비교)
  const norm = (s: string | null) => String(s ?? '').replace(/\s+/g, '')
  if (norm(dbUser.accountHolder) !== norm(dbUser.name)) {
    return c.json({ error: `출금 계좌의 예금주(${dbUser.accountHolder})가 회원 이름(${dbUser.name})과 일치하지 않습니다. 본인 명의 계좌로만 출금할 수 있습니다.` }, 400)
  }

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

// 조직도 (본인 산하만, 최대 5단계) — 상위(referrer) 절대 노출 금지
me.get('/network', async (c) => {
  const user = c.get('user')!

  // 본인 노드
  const root = await c.env.DB.prepare(
    'SELECT id, name, nickname, grade, createdAt, referralCode FROM users WHERE id = ?'
  ).bind(user.id).first()

  // BFS로 산하 5단계 수집
  type Node = { id: string; name: string; nickname: string; grade: string; createdAt: string; referrerId: string; level: number }
  const nodes: Node[] = []
  let currentLevel = [user.id]
  for (let depth = 1; depth <= 5; depth++) {
    if (currentLevel.length === 0) break
    const placeholders = currentLevel.map(() => '?').join(',')
    const children = (await c.env.DB.prepare(
      `SELECT id, name, nickname, grade, createdAt, referrerId FROM users WHERE referrerId IN (${placeholders})`
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
