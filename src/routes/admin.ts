import { Hono } from 'hono'
import type { Bindings, Variables, ProductRow, UserRow } from '../types'
import type { D1PreparedStatement } from '../lib/db'
import { BatchGuardError } from '../lib/db'
import { requireAdmin } from '../lib/middleware'
import { genId } from '../lib/auth'
import { drawWinners } from '../lib/draw'
import { invalidate } from '../lib/cache'
import { ensureSubscriptionSchema, extendOneMonth, ensureWithdrawalAccountColumns } from './me'
import { ensureProductUrlColumn, ensureBuyNowPriceColumn } from './products'
import { ensureMemberFlags, maybePayReferralReward, maybePromoteToVVIP, recalcVVIP } from '../lib/referral'

const admin = new Hono<{ Bindings: Bindings; Variables: Variables }>()
admin.use('*', requireAdmin)

// winners.bidId 컬럼 런타임 보장 (즉시구매 vs 경매당첨 구분용, 부작용 없는 경량 보장)
let _winnerBidIdReady = false
async function ensureBidRoundSafe(DB: any) {
  if (_winnerBidIdReady) return
  await DB.prepare(`ALTER TABLE winners ADD COLUMN IF NOT EXISTS bidId TEXT`).run()
  _winnerBidIdReady = true
}

// point_history 되돌리기(원상복구) 지원용 컬럼 런타임 보장
//  · reversedAt : 이 이력이 되돌려진 시각 (null이면 아직 되돌려지지 않음)
//  · reversalOf : 이 이력이 "어떤 이력을 되돌린 상쇄 기록인지" 원본 id (되돌리기로 생성된 상쇄 이력에만 존재)
let _phReversalReady = false
async function ensurePointReversalColumns(DB: any) {
  if (_phReversalReady) return
  await DB.prepare(`ALTER TABLE point_history ADD COLUMN IF NOT EXISTS reversedAt TEXT`).run()
  await DB.prepare(`ALTER TABLE point_history ADD COLUMN IF NOT EXISTS reversalOf TEXT`).run()
  _phReversalReady = true
}

// 대시보드 KPI
admin.get('/stats', async (c) => {
  const db = c.env.DB
  const totalUsers = (await db.prepare("SELECT COUNT(*) AS c FROM users WHERE role='MEMBER'").first<{ c: number }>())?.c ?? 0
  const totalProducts = (await db.prepare('SELECT COUNT(*) AS c FROM products').first<{ c: number }>())?.c ?? 0
  const openProducts = (await db.prepare("SELECT COUNT(*) AS c FROM products WHERE status='OPEN'").first<{ c: number }>())?.c ?? 0
  const totalBids = (await db.prepare('SELECT COUNT(*) AS c FROM bids').first<{ c: number }>())?.c ?? 0
  const totalWinners = (await db.prepare('SELECT COUNT(*) AS c FROM winners').first<{ c: number }>())?.c ?? 0
  const pendingWithdrawals = (await db.prepare("SELECT COUNT(*) AS c FROM withdrawals WHERE status='PENDING'").first<{ c: number }>())?.c ?? 0
  const pendingCharges = (await db.prepare("SELECT COUNT(*) AS c FROM charge_requests WHERE status='PENDING'").first<{ c: number }>())?.c ?? 0
  const pendingShipments = (await db.prepare("SELECT COUNT(*) AS c FROM winners WHERE shippingStatus IN ('SUBMITTED')").first<{ c: number }>())?.c ?? 0
  const totalCharged = (await db.prepare("SELECT COALESCE(SUM(amount),0) AS s FROM point_history WHERE type='CHARGE'").first<{ s: number }>())?.s ?? 0
  const totalRewards = (await db.prepare("SELECT COALESCE(SUM(amount),0) AS s FROM point_history WHERE type='REWARD' AND amount > 0").first<{ s: number }>())?.s ?? 0

  // 카테고리별 상품 수 (차트용) — 고정 카테고리 6종
  const FIXED_CATEGORIES = ['가전', '건강식품', '화장품', '식품', '생활용품', '기타']
  const catRows = (await db.prepare('SELECT category, COUNT(*) AS cnt FROM products GROUP BY category').all<{ category: string; cnt: number }>()).results
  const catMap: Record<string, number> = {}
  for (const cat of FIXED_CATEGORIES) catMap[cat] = 0
  for (const r of catRows) {
    if (catMap[r.category] !== undefined) catMap[r.category] += r.cnt
    else catMap['기타'] += r.cnt
  }
  const byCategory = FIXED_CATEGORIES.map((cat) => ({ category: cat, cnt: catMap[cat] }))

  // 제품별 경매 참여(입찰) 횟수 (차트용) — 참여가 많은 순
  const byProductBids = (await db.prepare(
    `SELECT p.title AS title, COUNT(b.id) AS cnt
     FROM products p LEFT JOIN bids b ON b.productId = p.id
     GROUP BY p.id ORDER BY cnt DESC LIMIT 10`
  ).all<{ title: string; cnt: number }>()).results
  // 최근 7일 가입자 (차트용)
  const recentUsers = (await db.prepare(
    `SELECT date(createdAt) AS d, COUNT(*) AS cnt FROM users WHERE role='MEMBER' GROUP BY date(createdAt) ORDER BY d DESC LIMIT 7`
  ).all()).results

  return c.json({
    totalUsers, totalProducts, openProducts, totalBids, totalWinners,
    pendingWithdrawals, pendingCharges, pendingShipments, totalCharged, totalRewards, byCategory, byProductBids, recentUsers,
  })
})

// ===== 상품 CRUD =====
admin.get('/products', async (c) => {
  const rows = (await c.env.DB.prepare(
    `SELECT p.*, (SELECT COUNT(*) FROM bids b WHERE b.productId=p.id) AS participants
     FROM products p ORDER BY p.sortOrder ASC, p.createdAt DESC`
  ).all()).results
  return c.json({ products: rows })
})

admin.post('/products', async (c) => {
  const b = await c.req.json().catch(() => null)
  if (!b) return c.json({ error: '잘못된 요청입니다.' }, 400)
  const required = ['title', 'imageUrl', 'category', 'marketPrice', 'startPrice']
  for (const k of required) {
    if (b[k] === undefined || b[k] === null || b[k] === '') return c.json({ error: `${k} 항목이 필요합니다.` }, 400)
  }
  const mp = Number(b.marketPrice), sp = Number(b.startPrice)
  if (mp <= 0) return c.json({ error: '시중가는 0보다 커야 합니다.' }, 400)
  if (sp <= 0) return c.json({ error: '시작가는 0보다 커야 합니다.' }, 400)
  if (sp > mp) return c.json({ error: '시작가는 시중가보다 클 수 없습니다.' }, 400)
  // 참가비는 시작가와 동일하게 자동 설정
  const entryFee = sp
  // 즉시구매가(방안 B): 입력 시 사용, 미입력/0 이면 즉시구매 비활성(0)
  const buyNowPrice = Math.max(0, Math.floor(Number(b.buyNowPrice ?? 0) || 0))
  const id = genId('p-')
  await ensureProductUrlColumn(c.env.DB)
  await ensureBuyNowPriceColumn(c.env.DB)
  // 새 상품은 목록 맨 뒤로 (현재 최대 sortOrder + 1)
  const maxOrder = (await c.env.DB.prepare('SELECT COALESCE(MAX(sortOrder), -1) AS m FROM products').first<{ m: number }>())?.m ?? -1
  await c.env.DB.prepare(
    `INSERT INTO products (id, title, description, imageUrl, category, marketPrice, startPrice, entryFee, maxParticipants, winnersCount, losingReward, status, sortOrder, productUrl, buyNowPrice, startAt, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, datetime('now'), datetime('now'))`
  ).bind(
    id, b.title, b.description ?? '', b.imageUrl, b.category,
    mp, sp, entryFee,
    Number(b.maxParticipants ?? 10), Number(b.winnersCount ?? 1), Number(b.losingReward ?? 200),
    maxOrder + 1, (b.productUrl ?? '').trim(), buyNowPrice
  ).run()
  invalidate('products')
  return c.json({ ok: true, id })
})

admin.get('/products/:id', async (c) => {
  await ensureProductUrlColumn(c.env.DB)
  await ensureBuyNowPriceColumn(c.env.DB)
  const product = await c.env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(c.req.param('id')).first()
  if (!product) return c.json({ error: '상품을 찾을 수 없습니다.' }, 404)
  return c.json({ product })
})

admin.put('/products/:id', async (c) => {
  const id = c.req.param('id')
  const b = await c.req.json().catch(() => null)
  if (!b) return c.json({ error: '잘못된 요청입니다.' }, 400)
  const mp = Number(b.marketPrice), sp = Number(b.startPrice)
  if (mp <= 0) return c.json({ error: '시중가는 0보다 커야 합니다.' }, 400)
  if (sp <= 0) return c.json({ error: '시작가는 0보다 커야 합니다.' }, 400)
  if (sp > mp) return c.json({ error: '시작가는 시중가보다 클 수 없습니다.' }, 400)
  // 참가비는 시작가와 동일하게 자동 설정
  const entryFee = sp
  // 즉시구매가(방안 B): 입력 시 사용, 미입력/0 이면 즉시구매 비활성(0)
  const buyNowPrice = Math.max(0, Math.floor(Number(b.buyNowPrice ?? 0) || 0))
  await ensureProductUrlColumn(c.env.DB)
  await ensureBuyNowPriceColumn(c.env.DB)
  await c.env.DB.prepare(
    `UPDATE products SET title=?, description=?, imageUrl=?, category=?, marketPrice=?, startPrice=?, entryFee=?, maxParticipants=?, winnersCount=?, losingReward=?, status=?, productUrl=?, buyNowPrice=? WHERE id=?`
  ).bind(
    b.title, b.description ?? '', b.imageUrl, b.category,
    mp, sp, entryFee,
    Number(b.maxParticipants), Number(b.winnersCount), Number(b.losingReward),
    b.status ?? 'OPEN', (b.productUrl ?? '').trim(), buyNowPrice, id
  ).run()
  invalidate('products')
  return c.json({ ok: true })
})

admin.delete('/products/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM winners WHERE productId = ?').bind(id),
    c.env.DB.prepare('DELETE FROM bids WHERE productId = ?').bind(id),
    c.env.DB.prepare('DELETE FROM products WHERE id = ?').bind(id),
  ])
  invalidate('products')
  return c.json({ ok: true })
})

// 상품 노출 순서 변경 (인접 상품과 sortOrder 교환)
admin.post('/products/:id/move', async (c) => {
  const id = c.req.param('id')
  const b = await c.req.json().catch(() => null)
  const dir = b?.direction as 'up' | 'down'
  if (dir !== 'up' && dir !== 'down') return c.json({ error: 'direction은 up 또는 down이어야 합니다.' }, 400)

  const cur = await c.env.DB.prepare('SELECT id, sortOrder, createdAt FROM products WHERE id = ?').bind(id).first<{ id: string; sortOrder: number; createdAt: string }>()
  if (!cur) return c.json({ error: '상품을 찾을 수 없습니다.' }, 404)

  // 정렬 기준: sortOrder ASC, createdAt DESC (목록과 동일)
  // up = 더 앞으로(작은 sortOrder), down = 더 뒤로(큰 sortOrder)
  let neighbor
  if (dir === 'up') {
    neighbor = await c.env.DB.prepare(
      `SELECT id, sortOrder FROM products
       WHERE (sortOrder < ?) OR (sortOrder = ? AND createdAt > ?)
       ORDER BY sortOrder DESC, createdAt ASC LIMIT 1`
    ).bind(cur.sortOrder, cur.sortOrder, cur.createdAt).first<{ id: string; sortOrder: number }>()
  } else {
    neighbor = await c.env.DB.prepare(
      `SELECT id, sortOrder FROM products
       WHERE (sortOrder > ?) OR (sortOrder = ? AND createdAt < ?)
       ORDER BY sortOrder ASC, createdAt DESC LIMIT 1`
    ).bind(cur.sortOrder, cur.sortOrder, cur.createdAt).first<{ id: string; sortOrder: number }>()
  }

  if (!neighbor) return c.json({ ok: true, moved: false, message: '더 이상 이동할 수 없습니다.' })

  // sortOrder가 같을 경우(초기값 동일) 교환만으로는 순서가 안 바뀌므로 보정
  let curOrder = cur.sortOrder
  let neighborOrder = neighbor.sortOrder
  if (curOrder === neighborOrder) {
    if (dir === 'up') { curOrder = neighborOrder - 1 } else { curOrder = neighborOrder + 1 }
    await c.env.DB.prepare('UPDATE products SET sortOrder = ? WHERE id = ?').bind(curOrder, cur.id).run()
    invalidate('products')
    return c.json({ ok: true, moved: true })
  }

  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE products SET sortOrder = ? WHERE id = ?').bind(neighborOrder, cur.id),
    c.env.DB.prepare('UPDATE products SET sortOrder = ? WHERE id = ?').bind(curOrder, neighbor.id),
  ])
  invalidate('products')
  return c.json({ ok: true, moved: true })
})

// 수동 강제 추첨 (정원 미달이어도 관리자가 마감 가능)
admin.post('/products/:id/draw', async (c) => {
  const product = await c.env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(c.req.param('id')).first<ProductRow>()
  if (!product) return c.json({ error: '상품을 찾을 수 없습니다.' }, 404)
  if (product.status !== 'OPEN') return c.json({ error: '이미 마감된 경매입니다.' }, 400)
  const result = await drawWinners(c.env.DB, product)
  invalidate('products')
  return c.json({ ok: true, ...result })
})

// 상품별 빠른 설정 (당첨자수/미당첨보상/정원만 부분 수정) — 설정 페이지용
admin.patch('/products/:id/settings', async (c) => {
  const id = c.req.param('id')
  const b = await c.req.json().catch(() => null)
  if (!b) return c.json({ error: '잘못된 요청입니다.' }, 400)

  const product = await c.env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(id).first<ProductRow>()
  if (!product) return c.json({ error: '상품을 찾을 수 없습니다.' }, 404)

  const winnersCount = Number(b.winnersCount ?? product.winnersCount)
  const losingReward = Number(b.losingReward ?? product.losingReward)
  const maxParticipants = Number(b.maxParticipants ?? product.maxParticipants)

  if (winnersCount < 1) return c.json({ error: '당첨자 수는 1명 이상이어야 합니다.' }, 400)
  if (losingReward < 0) return c.json({ error: '미당첨 보상은 0 이상이어야 합니다.' }, 400)
  if (maxParticipants < 1) return c.json({ error: '정원은 1명 이상이어야 합니다.' }, 400)
  if (winnersCount > maxParticipants) return c.json({ error: '당첨자 수는 정원보다 클 수 없습니다.' }, 400)

  // 이미 참여한 인원보다 정원을 작게 설정할 수 없음
  const cnt = (await c.env.DB.prepare('SELECT COUNT(*) AS c FROM bids WHERE productId = ?').bind(id).first<{ c: number }>())?.c ?? 0
  if (maxParticipants < cnt) {
    return c.json({ error: `이미 ${cnt}명이 참여했습니다. 정원을 ${cnt}명 미만으로 줄일 수 없습니다.` }, 400)
  }

  await c.env.DB.prepare(
    'UPDATE products SET winnersCount = ?, losingReward = ?, maxParticipants = ? WHERE id = ?'
  ).bind(winnersCount, losingReward, maxParticipants, id).run()
  invalidate('products')

  return c.json({ ok: true, winnersCount, losingReward, maxParticipants })
})

// ===== 회원 관리 =====
admin.get('/members', async (c) => {
  await ensureMemberFlags(c.env.DB)
  const q = c.req.query('q')
  // 가입일(createdAt) 날짜 필터 (YYYY-MM-DD)
  const dateRe = /^\d{4}-\d{2}-\d{2}$/
  const fromRaw = (c.req.query('from') || '').trim()
  const toRaw = (c.req.query('to') || '').trim()
  const from = dateRe.test(fromRaw) ? fromRaw : ''
  const to = dateRe.test(toRaw) ? toRaw : ''

  let sql = `SELECT u.id, u.email, u.name, u.nickname, u.role, u.grade, u.auctionPoint, u.balancePoint, u.wagePoint,
                    u.referralCode, u.referrerId, u.active, u.createdAt,
                    r.nickname AS "referrerNickname"
             FROM users u LEFT JOIN users r ON r.id = u.referrerId`
  const conds: string[] = []
  const binds: any[] = []
  if (q) {
    conds.push('(u.email LIKE ? OR u.name LIKE ? OR u.nickname LIKE ?)')
    binds.push(`%${q}%`, `%${q}%`, `%${q}%`)
  }
  if (from) { conds.push('u.createdAt >= ?'); binds.push(`${from} 00:00:00`) }
  if (to) { conds.push('u.createdAt <= ?'); binds.push(`${to} 23:59:59.999`) }
  if (conds.length) sql += ' WHERE ' + conds.join(' AND ')
  sql += ' ORDER BY u.createdAt DESC'
  const rows = (await c.env.DB.prepare(sql).bind(...binds).all()).results
  return c.json({ members: rows })
})

// 회원 포인트 조정
admin.post('/members/:id/adjust', async (c) => {
  const id = c.req.param('id')
  const b = await c.req.json().catch(() => null)
  const amount = Number(b?.amount)
  const reason = b?.reason ?? '관리자 조정'
  if (!amount || isNaN(amount)) return c.json({ error: '조정 금액을 입력해주세요.' }, 400)

  const target = await c.env.DB.prepare('SELECT auctionPoint AS v FROM users WHERE id = ?').bind(id).first<{ v: number }>()
  if (!target) return c.json({ error: '회원을 찾을 수 없습니다.' }, 404)
  if (target.v + amount < 0) return c.json({ error: '포인트가 음수가 될 수 없습니다.' }, 400)

  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET auctionPoint = auctionPoint + ? WHERE id = ?').bind(amount, id),
    c.env.DB.prepare(
      `INSERT INTO point_history (id, userId, type, pointKind, amount, description, createdAt)
       VALUES (?, ?, 'ADMIN_ADJ', 'AUCTION', ?, ?, datetime('now'))`
    ).bind(genId('ph-'), id, amount, `관리자 조정: ${reason}`),
  ])
  return c.json({ ok: true })
})

// 포인트 이력 되돌리기(이전 상태로 원상복구)
//  · 해당 이력의 amount 를 반대로 상쇄하는 역방향 조정을 적용하고,
//    잔액을 되돌리기 전 상태로 복구한다.
//  · 원본 이력에는 reversedAt 을 기록해 "되돌림 처리됨"으로 표시하고,
//    상쇄 기록(reversalOf=원본id)을 새로 남겨 감사 추적을 보장한다.
//  · 이미 되돌려진 이력, 또는 되돌리기로 생성된 상쇄 기록 자체는 다시 되돌릴 수 없다.
admin.post('/members/:mid/point-history/:phid/revert', async (c) => {
  const mid = c.req.param('mid')
  const phid = c.req.param('phid')
  await ensurePointReversalColumns(c.env.DB)

  // 대상 이력 조회 (해당 회원 소유인지 함께 확인)
  const ph = await c.env.DB.prepare(
    `SELECT id, userId, type, amount, description, reversedAt, reversalOf
     FROM point_history WHERE id = ? AND userId = ?`
  ).bind(phid, mid).first<{ id: string; userId: string; type: string; amount: number; description: string; reversedAt: string | null; reversalOf: string | null }>()
  if (!ph) return c.json({ error: '포인트 이력을 찾을 수 없습니다.' }, 404)
  if (ph.reversedAt) return c.json({ error: '이미 되돌린 내역입니다.' }, 400)
  if (ph.reversalOf) return c.json({ error: '되돌리기로 생성된 상쇄 내역은 다시 되돌릴 수 없습니다.' }, 400)

  const amount = Number(ph.amount || 0)
  if (!amount) return c.json({ error: '되돌릴 포인트가 없습니다.' }, 400)
  const revertAmount = -amount // 반대 방향으로 상쇄

  // 현재 잔액 확인 (되돌린 뒤 음수가 되면 안 됨)
  const target = await c.env.DB.prepare('SELECT auctionPoint AS v FROM users WHERE id = ?').bind(mid).first<{ v: number }>()
  if (!target) return c.json({ error: '회원을 찾을 수 없습니다.' }, 404)
  if (Number(target.v) + revertAmount < 0) {
    return c.json({ error: '되돌리면 포인트가 음수가 되어 처리할 수 없습니다. (현재 보유 포인트 부족)' }, 400)
  }

  try {
    await c.env.DB.batch([
      // 1) 잔액을 되돌리기 전으로 복구
      c.env.DB.prepare('UPDATE users SET auctionPoint = auctionPoint + ? WHERE id = ? AND auctionPoint + ? >= 0')
        .bind(revertAmount, mid, revertAmount).requireRows(),
      // 2) 원본 이력을 "되돌림 처리됨"으로 표시
      c.env.DB.prepare("UPDATE point_history SET reversedAt = datetime('now') WHERE id = ?").bind(phid),
      // 3) 상쇄 기록 추가 (감사 추적용)
      c.env.DB.prepare(
        `INSERT INTO point_history (id, userId, type, pointKind, amount, description, reversalOf, createdAt)
         VALUES (?, ?, 'ADMIN_ADJ', 'AUCTION', ?, ?, ?, datetime('now'))`
      ).bind(genId('ph-'), mid, revertAmount, `되돌리기: ${ph.description || ''}`, phid),
    ])
  } catch (e: any) {
    if (e?.name === 'BatchGuardError') return c.json({ error: '되돌리면 포인트가 음수가 되어 처리할 수 없습니다.' }, 400)
    throw e
  }
  return c.json({ ok: true, revertAmount })
})

// 회원 등급 변경/승인
const GRADES = ['NORMAL', 'VIP', 'VVIP', 'AGENCY', 'DISTRIBUTOR', 'DIRECTOR']
admin.post('/members/:id/grade', async (c) => {
  const id = c.req.param('id')
  const b = await c.req.json().catch(() => null)
  const grade = String(b?.grade ?? '')
  if (!GRADES.includes(grade)) return c.json({ error: '올바르지 않은 등급입니다.' }, 400)

  const target = await c.env.DB.prepare('SELECT id, role, referrerId FROM users WHERE id = ?').bind(id).first<{ id: string; role: string; referrerId: string | null }>()
  if (!target) return c.json({ error: '회원을 찾을 수 없습니다.' }, 404)

  await c.env.DB.prepare("UPDATE users SET grade = ?, updatedAt = datetime('now') WHERE id = ?").bind(grade, id).run()

  // VIP 이상 + 활성이 되면 추천인에게 추천 보상 1회 지급 (이미 지급됐으면 무시)
  const referralPaid = await maybePayReferralReward(c.env.DB, id)

  // 이 회원이 VIP 이상이 됐다면, 추천인의 "직속 VIP 이상 5명" 조건을 확인해 자동 VVIP 승급
  let vvipPromoted = false
  if (['VIP', 'VVIP', 'AGENCY', 'DISTRIBUTOR', 'DIRECTOR'].includes(grade)) {
    vvipPromoted = await maybePromoteToVVIP(c.env.DB, target.referrerId)
  }
  return c.json({ ok: true, grade, referralPaid, vvipPromoted })
})

// 회원 활성/비활성 설정
admin.post('/members/:id/active', async (c) => {
  await ensureMemberFlags(c.env.DB)
  const id = c.req.param('id')
  const b = await c.req.json().catch(() => null)
  const active = b?.active === 1 || b?.active === true ? 1 : 0

  const target = await c.env.DB.prepare('SELECT id, role FROM users WHERE id = ?')
    .bind(id).first<{ id: string; role: string }>()
  if (!target) return c.json({ error: '회원을 찾을 수 없습니다.' }, 404)
  if (target.role === 'ADMIN') return c.json({ error: '관리자 계정은 비활성화할 수 없습니다.' }, 400)

  await c.env.DB.prepare("UPDATE users SET active = ?, updatedAt = datetime('now') WHERE id = ?")
    .bind(active, id).run()

  // 활성으로 전환되면서 VIP 이상이면 추천 보상 1회 지급 (이미 지급됐으면 무시)
  const referralPaid = active === 1 ? await maybePayReferralReward(c.env.DB, id) : false
  return c.json({ ok: true, active, referralPaid })
})

// 등급별 포인트 일괄 지급
admin.post('/members/grade-grant', async (c) => {
  const b = await c.req.json().catch(() => null)
  const grade = String(b?.grade ?? '')
  const amount = Number(b?.amount)
  const reason = b?.reason ? String(b.reason).trim() : '등급별 일괄 지급'

  if (!GRADES.includes(grade)) return c.json({ error: '올바르지 않은 등급입니다.' }, 400)
  if (!amount || isNaN(amount) || amount <= 0) return c.json({ error: '지급 금액을 올바르게 입력해주세요.' }, 400)

  // 대상 회원(해당 등급, 일반 회원만 — 관리자 제외)
  const targets = (await c.env.DB.prepare(
    "SELECT id FROM users WHERE grade = ? AND role = 'MEMBER'"
  ).bind(grade).all<{ id: string }>()).results

  if (!targets.length) return c.json({ ok: true, count: 0, message: '해당 등급의 회원이 없습니다.' })

  const stmts: D1PreparedStatement[] = []
  for (const t of targets) {
    stmts.push(c.env.DB.prepare('UPDATE users SET auctionPoint = auctionPoint + ? WHERE id = ?').bind(amount, t.id))
    stmts.push(c.env.DB.prepare(
      `INSERT INTO point_history (id, userId, type, pointKind, amount, description, createdAt)
       VALUES (?, ?, 'ADMIN_ADJ', 'AUCTION', ?, ?, datetime('now'))`
    ).bind(genId('ph-'), t.id, amount, `등급 일괄지급(${grade}): ${reason}`))
  }
  await c.env.DB.batch(stmts)
  return c.json({ ok: true, count: targets.length, amount, grade })
})

// VVIP 자동 승급 재계산 (기존 회원 소급 적용)
// "직속 VIP 이상 5명" 조건을 충족한 NORMAL/VIP 회원을 일괄 VVIP 로 승급한다.
admin.post('/members/recalc-vvip', async (c) => {
  const promoted = await recalcVVIP(c.env.DB)
  return c.json({ ok: true, promoted })
})

// 등급별 회원 수 통계 (일괄 지급 화면용)
admin.get('/members/grade-stats', async (c) => {
  const rows = (await c.env.DB.prepare(
    "SELECT grade, COUNT(*) AS cnt FROM users WHERE role = 'MEMBER' GROUP BY grade"
  ).all<{ grade: string; cnt: number }>()).results
  const stats: Record<string, number> = {}
  for (const g of GRADES) stats[g] = 0
  for (const r of rows) stats[r.grade] = r.cnt
  return c.json({ stats })
})

// VIP 이상 등급 회원에게서 월 구독료를 경매포인트에서 일괄 차감
// 대상: VIP, VVIP, 대리점(AGENCY), 총판(DISTRIBUTOR), 이사(DIRECTOR) — 일반회원 제외
// 목적: 구독료 명목으로 회사가 일괄 수금 → 해당 회원의 경매포인트에서 차감(음수)
const VIP_PLUS_GRADES = ['VIP', 'VVIP', 'AGENCY', 'DISTRIBUTOR', 'DIRECTOR']
admin.post('/members/grant-vip-auction', async (c) => {
  const b = await c.req.json().catch(() => null)
  const amount = Number(b?.amount)
  const reason = b?.reason ? String(b.reason).trim() : '월 구독료'
  if (!amount || isNaN(amount) || amount <= 0) return c.json({ error: '구독료 금액을 올바르게 입력해주세요.' }, 400)

  const placeholders = VIP_PLUS_GRADES.map(() => '?').join(',')
  const targets = (await c.env.DB.prepare(
    `SELECT id, auctionPoint FROM users WHERE role = 'MEMBER' AND grade IN (${placeholders})`
  ).bind(...VIP_PLUS_GRADES).all<{ id: string; auctionPoint: number }>()).results
  if (!targets.length) return c.json({ ok: true, count: 0, message: 'VIP 이상 등급 회원이 없습니다.' })

  const stmts: D1PreparedStatement[] = []
  let charged = 0
  let totalDeducted = 0
  for (const t of targets) {
    // 잔액 범위 내에서만 차감 (음수 방지)
    const deduct = Math.min(amount, t.auctionPoint)
    if (deduct <= 0) continue
    charged++
    totalDeducted += deduct
    stmts.push(c.env.DB.prepare('UPDATE users SET auctionPoint = auctionPoint - ? WHERE id = ?').bind(deduct, t.id))
    stmts.push(c.env.DB.prepare(
      `INSERT INTO point_history (id, userId, type, pointKind, amount, description, createdAt)
       VALUES (?, ?, 'ADMIN_ADJ', 'AUCTION', ?, ?, datetime('now'))`
    ).bind(genId('ph-'), t.id, -deduct, `월 구독료 차감: ${reason}`))
  }
  if (stmts.length) await c.env.DB.batch(stmts)
  return c.json({ ok: true, count: charged, total: targets.length, amount, totalDeducted })
})

// VIP 이상 등급 회원 수 (강제 지급 화면용)
admin.get('/members/vip-plus-count', async (c) => {
  const placeholders = VIP_PLUS_GRADES.map(() => '?').join(',')
  const row = await c.env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM users WHERE role = 'MEMBER' AND grade IN (${placeholders})`
  ).bind(...VIP_PLUS_GRADES).first<{ cnt: number }>()
  return c.json({ count: row?.cnt ?? 0 })
})

// 지급 내역 보기 — 관리자가 지금까지 보낸 모든 포인트 지급/회수 이력
//  · 등급별 일괄 지급  (description LIKE '등급 일괄지급%')   → 배치 단위 그룹핑
//  · VIP 이상 월 구독료 수금 (description LIKE '월 구독료 차감%') → 배치 단위 그룹핑
//  · 개별 회원 지급/회수    (그 외 ADMIN_ADJ, 예: '관리자 조정: ...') → 회원명과 함께 건별 표시
// 대량 데이터 대비: 그룹핑 후 offset/limit 로 페이지네이션하여 반환한다.
admin.get('/grant-history', async (c) => {
  const url = new URL(c.req.url)
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), 100)
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0)
  const all = url.searchParams.get('all') === '1'   // 전체 export 모드(페이지네이션 무시)
  // 날짜 필터(YYYY-MM-DD). from은 그 날 00:00:00부터, to는 그 날 23:59:59까지 포함.
  const fromRaw = (url.searchParams.get('from') || '').trim()
  const toRaw = (url.searchParams.get('to') || '').trim()
  const dateRe = /^\d{4}-\d{2}-\d{2}$/
  const from = dateRe.test(fromRaw) ? fromRaw : ''
  const to = dateRe.test(toRaw) ? toRaw : ''

  // 날짜 조건 SQL 조립 (createdAt 은 TIMESTAMPTZ)
  const conds: string[] = [`ph.type = 'ADMIN_ADJ'`]
  const binds: string[] = []
  if (from) { conds.push(`ph.createdAt >= ?`); binds.push(`${from} 00:00:00`) }
  if (to) { conds.push(`ph.createdAt <= ?`); binds.push(`${to} 23:59:59.999`) }
  const whereSql = conds.join(' AND ')

  // ADMIN_ADJ(관리자 지급/회수) 전체를 회원명과 함께 최근순으로 조회.
  // (일괄 배치는 같은 초에 다수 행이 생기므로, 그룹핑을 위해 상한을 넉넉히 둔다.)
  const rows = (await c.env.DB.prepare(
    `SELECT ph.id, ph.userId, ph.amount, ph.description, ph.createdAt,
            u.name AS "userName", u.nickname AS "userNickname"
     FROM point_history ph
     LEFT JOIN users u ON u.id = ph.userId
     WHERE ${whereSql}
     ORDER BY ph.createdAt DESC
     LIMIT 20000`
  ).bind(...binds).all<{ id: string; userId: string; amount: number; description: string; createdAt: string; userName: string; userNickname: string }>()).results

  type Item = {
    kind: 'GRANT' | 'SUBSCRIPTION' | 'INDIVIDUAL'
    description: string; createdAt: string; count: number; totalAmount: number
    userName?: string; userNickname?: string
  }
  const batches = new Map<string, Item>()  // 일괄/구독료 배치 그룹
  const items: Item[] = []                  // 최종 목록(개별 + 배치)

  for (const r of rows) {
    const amt = Number(r.amount)
    const desc = String(r.description || '')
    const isGrant = desc.startsWith('등급 일괄지급')
    const isSub = desc.startsWith('월 구독료')
    if (isGrant || isSub) {
      // 같은 배치(설명+초 단위 시각)로 그룹핑
      const sec = String(r.createdAt).slice(0, 19)
      const key = `${desc}||${sec}`
      const g = batches.get(key)
      if (g) { g.count++; g.totalAmount += amt }
      else {
        const item: Item = { kind: isSub ? 'SUBSCRIPTION' : 'GRANT', description: desc, createdAt: r.createdAt, count: 1, totalAmount: amt }
        batches.set(key, item)
        items.push(item)   // 배치의 첫 등장 위치(최근순)에 삽입 → 순서 유지
      }
    } else {
      // 개별 회원 지급/회수 — 건별 표시(회원명 포함)
      items.push({
        kind: 'INDIVIDUAL', description: desc, createdAt: r.createdAt,
        count: 1, totalAmount: amt, userName: r.userName, userNickname: r.userNickname,
      })
    }
  }

  // rows 가 이미 최근순이므로 items 도 최근순.
  const total = items.length
  if (all) {
    // 전체 export(다운로드용) — 페이지네이션 없이 필터된 전체 반환
    return c.json({ history: items, total, from, to })
  }
  // 페이지 분할.
  const history = items.slice(offset, offset + limit)
  return c.json({ history, total, limit, offset, hasMore: offset + limit < total, from, to })
})

// 단일 회원 상세 (수정 폼용)
admin.get('/members/:id', async (c) => {
  const uid = c.req.param('id')
  const m = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.nickname, u.phone, u.role, u.grade,
            u.auctionPoint, u.balancePoint, u.wagePoint, u.referralCode, u.referrerId,
            u.bankName, u.bankAccount, u.accountHolder, u.createdAt,
            r.nickname AS "referrerNickname", r.name AS "referrerName"
     FROM users u LEFT JOIN users r ON r.id = u.referrerId
     WHERE u.id = ?`
  ).bind(uid).first()
  if (!m) return c.json({ error: '회원을 찾을 수 없습니다.' }, 404)

  // ===== 누적 내역 조회 (경매당첨/당첨경품/출금신청/충전입금/포인트 이력) =====
  //   즉시구매 여부는 winners.bidId 로 구분 (bidId 없으면 방안 B 즉시구매)
  await ensureBidRoundSafe(c.env.DB)
  await ensurePointReversalColumns(c.env.DB)

  // 1) 당첨/구매 경품 (배송 상태 포함)
  const winnings = (await c.env.DB.prepare(
    `SELECT w.id, w.finalPrice, w.drawnAt, w.shippingStatus, w.bidId,
            p.title, p.imageUrl, p.marketPrice
     FROM winners w JOIN products p ON p.id = w.productId
     WHERE w.userId = ? ORDER BY w.drawnAt DESC`
  ).bind(uid).all()).results

  // 2) 출금 신청 내역
  const withdrawals = (await c.env.DB.prepare(
    `SELECT id, amount, status, requestedAt, processedAt
     FROM withdrawals WHERE userId = ? ORDER BY requestedAt DESC`
  ).bind(uid).all()).results

  // 3) 충전/입금 신청 내역
  const charges = (await c.env.DB.prepare(
    `SELECT id, amount, depositor, status, requestedAt, processedAt
     FROM charge_requests WHERE userId = ? ORDER BY requestedAt DESC`
  ).bind(uid).all()).results

  // 4) 포인트 이력 (참여/보상/충전/출금/관리자조정 등 전체)
  const pointHistory = (await c.env.DB.prepare(
    `SELECT id, type, pointKind, amount, description, createdAt, reversedAt, reversalOf
     FROM point_history WHERE userId = ? ORDER BY createdAt DESC`
  ).bind(uid).all()).results

  // 요약 집계
  const summary = {
    winCount: winnings.length,
    winTotal: winnings.reduce((s: number, w: any) => s + Number(w.finalPrice || 0), 0),
    withdrawCount: withdrawals.length,
    withdrawTotal: withdrawals.filter((w: any) => w.status === 'COMPLETED' || w.status === 'APPROVED').reduce((s: number, w: any) => s + Number(w.amount || 0), 0),
    chargeCount: charges.length,
    chargeTotal: charges.filter((ch: any) => ch.status === 'COMPLETED').reduce((s: number, ch: any) => s + Number(ch.amount || 0), 0),
  }

  return c.json({ member: m, winnings, withdrawals, charges, pointHistory, summary })
})

// 회원 정보 수정 (이름/닉네임/연락처/이메일/추천인)
admin.put('/members/:id', async (c) => {
  const id = c.req.param('id')
  const b = await c.req.json().catch(() => null)
  if (!b) return c.json({ error: '잘못된 요청입니다.' }, 400)

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>()
  if (!user) return c.json({ error: '회원을 찾을 수 없습니다.' }, 404)

  const name = String(b.name ?? user.name).trim()
  const nickname = String(b.nickname ?? user.nickname).trim()
  const email = String(b.email ?? user.email).trim()
  const phone = b.phone !== undefined ? (b.phone === '' ? null : String(b.phone).trim()) : user.phone
  if (!name || !nickname || !email) return c.json({ error: '이름·닉네임·이메일은 필수입니다.' }, 400)

  // 이메일/닉네임 중복 검사 (본인 제외)
  const dup = await c.env.DB.prepare(
    'SELECT id FROM users WHERE (email = ? OR nickname = ?) AND id != ?'
  ).bind(email, nickname, id).first()
  if (dup) return c.json({ error: '이미 사용 중인 이메일 또는 닉네임입니다.' }, 409)

  // 추천인 변경 (추천코드로 지정, 비우면 변경 안 함)
  let referrerId = user.referrerId
  if (b.referrerCode !== undefined) {
    const code = String(b.referrerCode).trim().toUpperCase()
    if (code === '') {
      referrerId = null
    } else {
      const ref = await c.env.DB.prepare('SELECT id FROM users WHERE referralCode = ?').bind(code).first<{ id: string }>()
      if (!ref) return c.json({ error: '존재하지 않는 추천코드입니다.' }, 400)
      if (ref.id === id) return c.json({ error: '자기 자신을 추천인으로 지정할 수 없습니다.' }, 400)
      // 순환 참조 방지: 지정하려는 추천인이 본인의 하위면 거부
      let cursor: string | null = ref.id
      for (let i = 0; i < 50 && cursor; i++) {
        if (cursor === id) return c.json({ error: '하위 회원을 추천인으로 지정할 수 없습니다 (순환 참조).' }, 400)
        const up: { referrerId: string | null } | null = await c.env.DB.prepare('SELECT referrerId FROM users WHERE id = ?').bind(cursor).first<{ referrerId: string | null }>()
        cursor = up?.referrerId ?? null
      }
      referrerId = ref.id
    }
  }

  await c.env.DB.prepare(
    "UPDATE users SET name = ?, nickname = ?, email = ?, phone = ?, referrerId = ?, updatedAt = datetime('now') WHERE id = ?"
  ).bind(name, nickname, email, phone, referrerId, id).run()
  return c.json({ ok: true })
})

// 회원 삭제 (하위 회원은 삭제 회원의 추천인에게 승계)
admin.delete('/members/:id', async (c) => {
  const id = c.req.param('id')
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>()
  if (!user) return c.json({ error: '회원을 찾을 수 없습니다.' }, 404)
  if (user.role === 'ADMIN') return c.json({ error: '관리자 계정은 삭제할 수 없습니다.' }, 400)

  // subscription_payments 테이블이 아직 생성되지 않은 환경(구독 기능 미사용)에서도
  // 아래 DELETE 가 "relation does not exist" 로 트랜잭션 전체를 롤백시키지 않도록 보장.
  await c.env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS subscription_payments (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      amount INTEGER NOT NULL,
      period TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PAID',
      paidAt TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  ).run()

  // 하위 회원(직속)을 삭제 대상의 추천인에게 승계 (조직도 단절 방지)
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET referrerId = ? WHERE referrerId = ?').bind(user.referrerId ?? null, id),
    // 삭제 회원이 참여한 상품의 participantCount 를 -1 (정합성 유지). bids 삭제보다 먼저 실행.
    c.env.DB.prepare(
      `UPDATE products SET participantCount = participantCount - 1
       WHERE id IN (SELECT productId FROM bids WHERE userId = ?) AND participantCount > 0`
    ).bind(id),
    c.env.DB.prepare('DELETE FROM winners WHERE userId = ?').bind(id),
    c.env.DB.prepare('DELETE FROM bids WHERE userId = ?').bind(id),
    c.env.DB.prepare('DELETE FROM withdrawals WHERE userId = ?').bind(id),
    c.env.DB.prepare('DELETE FROM point_history WHERE userId = ?').bind(id),
    c.env.DB.prepare('DELETE FROM charge_requests WHERE userId = ?').bind(id),
    c.env.DB.prepare('DELETE FROM subscription_payments WHERE userId = ?').bind(id),
    c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id),
  ])
  return c.json({ ok: true })
})

// 전체 조직도 (관리자 전용) — 관리자 루트 기준 전체 트리
admin.get('/network', async (c) => {
  const db = c.env.DB
  await ensureMemberFlags(db)
  // 전체 회원(관리자 포함)
  const all = (await db.prepare(
    `SELECT id, name, nickname, role, grade, active, referrerId, referralCode, createdAt,
            auctionPoint, wagePoint
     FROM users`
  ).all<any>()).results

  // 활동 요약 (참여/당첨)
  const summary: Record<string, { bids: number; wins: number }> = {}
  for (const u of all) summary[u.id] = { bids: 0, wins: 0 }
  const bidRows = (await db.prepare('SELECT userId, COUNT(*) AS cnt FROM bids GROUP BY userId').all<{ userId: string; cnt: number }>()).results
  const winRows = (await db.prepare('SELECT userId, COUNT(*) AS cnt FROM winners GROUP BY userId').all<{ userId: string; cnt: number }>()).results
  for (const r of bidRows) if (summary[r.userId]) summary[r.userId].bids = r.cnt
  for (const r of winRows) if (summary[r.userId]) summary[r.userId].wins = r.cnt

  // 루트(관리자) 식별
  const root = all.find((u) => u.role === 'ADMIN') ?? all.find((u) => !u.referrerId) ?? all[0]

  return c.json({ root, members: all, summary, total: all.length })
})

// ===== 충전 요청 관리 =====
admin.get('/charge-requests', async (c) => {
  // 요청일(requestedAt) 날짜 필터 (YYYY-MM-DD)
  const dateRe = /^\d{4}-\d{2}-\d{2}$/
  const fromRaw = (c.req.query('from') || '').trim()
  const toRaw = (c.req.query('to') || '').trim()
  const from = dateRe.test(fromRaw) ? fromRaw : ''
  const to = dateRe.test(toRaw) ? toRaw : ''

  let sql = `SELECT cr.*, u.name, u.nickname, u.email, u.auctionPoint
     FROM charge_requests cr JOIN users u ON u.id = cr.userId`
  const conds: string[] = []
  const binds: any[] = []
  if (from) { conds.push('cr.requestedAt >= ?'); binds.push(`${from} 00:00:00`) }
  if (to) { conds.push('cr.requestedAt <= ?'); binds.push(`${to} 23:59:59.999`) }
  if (conds.length) sql += ' WHERE ' + conds.join(' AND ')
  sql += ` ORDER BY CASE cr.status WHEN 'PENDING' THEN 0 ELSE 1 END, cr.requestedAt DESC`
  const rows = (await c.env.DB.prepare(sql).bind(...binds).all()).results
  return c.json({ charges: rows })
})

// 충전 요청 승인(경매 포인트 지급) / 거절
admin.post('/charge-requests/:id/process', async (c) => {
  const id = c.req.param('id')
  const b = await c.req.json().catch(() => null)
  const action = b?.action as 'approve' | 'reject'

  const cr = await c.env.DB.prepare('SELECT * FROM charge_requests WHERE id = ?').bind(id).first<any>()
  if (!cr) return c.json({ error: '충전 요청을 찾을 수 없습니다.' }, 404)
  if (cr.status !== 'PENDING') return c.json({ error: '이미 처리된 요청입니다.' }, 400)

  if (action === 'reject') {
    await c.env.DB.prepare("UPDATE charge_requests SET status='REJECTED', processedAt=datetime('now') WHERE id=?").bind(id).run()
    return c.json({ ok: true, status: 'REJECTED' })
  }

  // 승인 → 요청 상태를 원자적으로 PENDING→COMPLETED 전환(중복 승인/동시 클릭 방어) +
  //        경매 포인트 지급 + 내역 기록.
  //   상태 전환 UPDATE를 가드(requireRows)로 두어, 동시에 들어온 두 번째 요청은
  //   0행이 되어 BatchGuardError로 전체 롤백 → 포인트가 두 번 적립되지 않음.
  try {
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE charge_requests SET status='COMPLETED', processedAt=datetime('now') WHERE id=? AND status='PENDING'").bind(id).requireRows(),
      c.env.DB.prepare('UPDATE users SET auctionPoint = auctionPoint + ? WHERE id = ?').bind(cr.amount, cr.userId),
      c.env.DB.prepare(
        `INSERT INTO point_history (id, userId, type, pointKind, amount, description, createdAt)
         VALUES (?, ?, 'CHARGE', 'AUCTION', ?, ?, datetime('now'))`
      ).bind(genId('ph-'), cr.userId, cr.amount, `포인트 충전 승인 (입금자: ${cr.depositor ?? '-'})`),
    ])
  } catch (e) {
    if (e instanceof BatchGuardError) return c.json({ error: '이미 처리된 요청입니다.' }, 400)
    throw e
  }
  return c.json({ ok: true, status: 'COMPLETED' })
})

// ===== 배송(당첨 상품) 관리 =====
//   기간 필터: ?from=YYYY-MM-DD&to=YYYY-MM-DD (배송정보 제출일 shippingSubmittedAt 기준, 미제출은 당첨일 drawnAt)
//   status 필터: ?status=SUBMITTED|PENDING|SHIPPED|DELIVERED
admin.get('/shipments', async (c) => {
  const from = c.req.query('from')
  const to = c.req.query('to')
  const statusFilter = c.req.query('status')

  let sql =
    `SELECT w.*, u.name AS "memberName", u.nickname, u.phone AS "memberPhone",
            p.title, p.imageUrl, p.startPrice, p.marketPrice
     FROM winners w
     JOIN users u ON u.id = w.userId
     JOIN products p ON p.id = w.productId
     WHERE 1=1`
  const binds: any[] = []
  // 기준일 = 배송정보 제출일이 있으면 그것, 없으면 당첨일
  if (from) { sql += ` AND COALESCE(w.shippingSubmittedAt, w.drawnAt) >= ?`; binds.push(from + ' 00:00:00') }
  if (to)   { sql += ` AND COALESCE(w.shippingSubmittedAt, w.drawnAt) <= ?`; binds.push(to + ' 23:59:59') }
  if (statusFilter) { sql += ` AND w.shippingStatus = ?`; binds.push(statusFilter) }
  sql +=
    ` ORDER BY CASE w.shippingStatus
                WHEN 'SUBMITTED' THEN 0 WHEN 'PENDING' THEN 1
                WHEN 'SHIPPED' THEN 2 ELSE 3 END,
              w.drawnAt DESC`

  const rows = (await c.env.DB.prepare(sql).bind(...binds).all()).results
  return c.json({ shipments: rows })
})

// 배송 상태 변경 (발송/배송완료 처리)
admin.post('/shipments/:id/status', async (c) => {
  const id = c.req.param('id')
  const b = await c.req.json().catch(() => null)
  const status = b?.status as string
  const allowed = ['PENDING', 'SUBMITTED', 'SHIPPED', 'DELIVERED']
  if (!allowed.includes(status)) return c.json({ error: '잘못된 배송 상태입니다.' }, 400)

  const w = await c.env.DB.prepare('SELECT * FROM winners WHERE id = ?').bind(id).first<any>()
  if (!w) return c.json({ error: '당첨 내역을 찾을 수 없습니다.' }, 404)
  if ((status === 'SHIPPED' || status === 'DELIVERED') && w.shippingStatus === 'PENDING') {
    return c.json({ error: '회원이 배송 정보를 입력해야 발송 처리할 수 있습니다.' }, 400)
  }

  await c.env.DB.prepare('UPDATE winners SET shippingStatus = ? WHERE id = ?').bind(status, id).run()
  return c.json({ ok: true, status })
})

// 관리자가 대신 배송지 주소 입력/수정 (전화로 받은 경우 등)
// 회원용 /me/winners/:id/shipping 과 동일하게 winners 행을 갱신하되, 소유자 확인 없이 관리자 권한으로 처리.
admin.post('/shipments/:id/shipping', async (c) => {
  const id = c.req.param('id')
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

  const w = await c.env.DB.prepare('SELECT * FROM winners WHERE id = ?').bind(id).first<any>()
  if (!w) return c.json({ error: '당첨 내역을 찾을 수 없습니다.' }, 404)
  // 이미 발송/배송완료된 건은 주소 변경 불가 (배송상태는 유지)
  if (w.shippingStatus === 'SHIPPED' || w.shippingStatus === 'DELIVERED') {
    return c.json({ error: '이미 발송 처리된 주문은 주소를 수정할 수 없습니다.' }, 400)
  }

  await c.env.DB.prepare(
    `UPDATE winners
     SET recipientName = ?, recipientPhone = ?, postalCode = ?, address1 = ?, address2 = ?,
         deliveryMemo = ?, shippingStatus = 'SUBMITTED', shippingSubmittedAt = datetime('now')
     WHERE id = ?`
  ).bind(recipientName, recipientPhone, postalCode, address1, address2, deliveryMemo, id).run()

  return c.json({ ok: true })
})

// ===== 출금 관리 =====
admin.get('/withdrawals', async (c) => {
  // 신청 시점 계좌 스냅샷 컬럼 보장 (없으면 조회에서 에러날 수 있으므로 먼저 생성)
  await ensureWithdrawalAccountColumns(c.env.DB)
  // 계좌 표시는 "신청건에 저장된 스냅샷 우선, 없으면 회원의 현재 계좌" 순으로 사용.
  //   (기존 신청건은 스냅샷이 비어 있으므로 users 계좌로 폴백 → 호환 유지)
  const rows = (await c.env.DB.prepare(
    `SELECT w.id, w.userId, w.amount, w.status, w.requestedAt, w.processedAt,
            u.name, u.nickname, u.email, u.auctionPoint,
            COALESCE(NULLIF(w.bankName, ''), u.bankName)           AS bankName,
            COALESCE(NULLIF(w.bankAccount, ''), u.bankAccount)     AS bankAccount,
            COALESCE(NULLIF(w.accountHolder, ''), u.accountHolder) AS accountHolder
     FROM withdrawals w JOIN users u ON u.id = w.userId
     ORDER BY CASE w.status WHEN 'PENDING' THEN 0 ELSE 1 END, w.requestedAt DESC`
  ).all()).results
  return c.json({ withdrawals: rows })
})

// 출금 승인 (경매포인트에서 차감) / 거절
admin.post('/withdrawals/:id/process', async (c) => {
  const id = c.req.param('id')
  const b = await c.req.json().catch(() => null)
  const action = b?.action as 'approve' | 'reject'

  const wd = await c.env.DB.prepare('SELECT * FROM withdrawals WHERE id = ?').bind(id).first<any>()
  if (!wd) return c.json({ error: '출금 신청을 찾을 수 없습니다.' }, 404)
  if (wd.status !== 'PENDING') return c.json({ error: '이미 처리된 신청입니다.' }, 400)

  if (action === 'reject') {
    await c.env.DB.prepare("UPDATE withdrawals SET status='REJECTED', processedAt=datetime('now') WHERE id=?").bind(id).run()
    return c.json({ ok: true, status: 'REJECTED' })
  }

  // 승인 → 경매포인트에서 차감 (출금은 경매P 기준)
  const u = await c.env.DB.prepare('SELECT auctionPoint FROM users WHERE id = ?').bind(wd.userId).first<{ auctionPoint: number }>()
  if (!u) return c.json({ error: '회원을 찾을 수 없습니다.' }, 404)
  if (u.auctionPoint < wd.amount) {
    return c.json({ error: '회원의 출금 가능 경매포인트가 부족합니다.' }, 400)
  }

  const stmts: D1PreparedStatement[] = [
    c.env.DB.prepare('UPDATE users SET auctionPoint = auctionPoint - ? WHERE id = ?').bind(wd.amount, wd.userId),
    c.env.DB.prepare("UPDATE withdrawals SET status='COMPLETED', processedAt=datetime('now') WHERE id=?").bind(id),
    c.env.DB.prepare(
      `INSERT INTO point_history (id, userId, type, pointKind, amount, description, createdAt) VALUES (?, ?, 'WITHDRAW', 'AUCTION', ?, ?, datetime('now'))`
    ).bind(genId('ph-'), wd.userId, -wd.amount, `출금 승인 (경매P)`),
  ]
  await c.env.DB.batch(stmts)
  return c.json({ ok: true, status: 'COMPLETED' })
})

// ===== 구독 관리 =====
// 구독 회원 목록 — 다음 중 하나라도 해당하면 자동으로 표시된다.
//   ① 구독료 납부 이력이 있는 회원, 또는
//   ② VIP 이상 등급 + 활성 회원 (납부 이력이 없어도 구독 대상이므로 자동 노출)
admin.get('/subscriptions', async (c) => {
  await ensureSubscriptionSchema(c.env.DB)
  await ensureMemberFlags(c.env.DB)
  const rows = (await c.env.DB.prepare(
    `SELECT u.id, u.name, u.nickname, u.email, u.grade,
            u.subscriptionActive, u.subscriptionUntil, u.auctionPoint,
            sp_last.period AS "lastPeriod", sp_last.paidAt AS "lastPaidAt",
            sp_cnt.cnt AS "payCount"
     FROM users u
     LEFT JOIN (SELECT DISTINCT userId FROM subscription_payments) s ON s.userId = u.id
     LEFT JOIN (
       SELECT sp1.userId, sp1.period, sp1.paidAt FROM subscription_payments sp1
       JOIN (SELECT userId, MAX(paidAt) AS mx FROM subscription_payments GROUP BY userId) m
         ON m.userId = sp1.userId AND m.mx = sp1.paidAt
     ) sp_last ON sp_last.userId = u.id
     LEFT JOIN (SELECT userId, COUNT(*) AS cnt FROM subscription_payments GROUP BY userId) sp_cnt
       ON sp_cnt.userId = u.id
     WHERE u.role = 'MEMBER'
       AND (
         s.userId IS NOT NULL
         OR (u.grade IN ('VIP', 'VVIP', 'AGENCY', 'DISTRIBUTOR', 'DIRECTOR') AND u.active = 1)
       )
     ORDER BY u.subscriptionActive DESC, sp_last.paidAt DESC`
  ).all()).results
  return c.json({ subscriptions: rows })
})

// 회원 구독 활성/비활성 토글
admin.post('/subscriptions/:userId/toggle', async (c) => {
  const userId = c.req.param('userId')
  const b = await c.req.json().catch(() => null)
  const active = b?.active ? 1 : 0
  const u = await c.env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first()
  if (!u) return c.json({ error: '회원을 찾을 수 없습니다.' }, 404)
  await c.env.DB.prepare('UPDATE users SET subscriptionActive = ? WHERE id = ?')
    .bind(active, userId).run()
  return c.json({ ok: true, active: !!active })
})

// 회원 구독 한 달 추가 활성화(기간 연장)
// 관리자가 "활성" 버튼을 누르면 구독 만료일을 현재 만료일(또는 오늘) 기준 한 달 연장하고 활성화한다.
admin.post('/subscriptions/:userId/extend', async (c) => {
  await ensureSubscriptionSchema(c.env.DB)
  const userId = c.req.param('userId')
  const u = await c.env.DB.prepare('SELECT id, subscriptionUntil FROM users WHERE id = ?')
    .bind(userId).first<{ id: string; subscriptionUntil: string | null }>()
  if (!u) return c.json({ error: '회원을 찾을 수 없습니다.' }, 404)

  const newUntil = extendOneMonth(u.subscriptionUntil ?? null)
  await c.env.DB.prepare(
    'UPDATE users SET subscriptionActive = 1, subscriptionUntil = ? WHERE id = ?'
  ).bind(newUntil, userId).run()
  return c.json({ ok: true, until: newUntil })
})

// 회원 구독 만료일 직접 설정 (관리자가 날짜를 임의 지정)
// 예: "2026-10-30" → "2026-07-31" 로 수정
admin.post('/subscriptions/:userId/set-until', async (c) => {
  await ensureSubscriptionSchema(c.env.DB)
  const userId = c.req.param('userId')
  const b = await c.req.json().catch(() => null)
  const until = b?.until ? String(b.until).trim() : ''

  // 날짜 형식 검증 (YYYY-MM-DD) + 유효한 실제 날짜인지 확인
  if (!/^\d{4}-\d{2}-\d{2}$/.test(until)) {
    return c.json({ error: '날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)' }, 400)
  }
  const [y, m, d] = until.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return c.json({ error: '존재하지 않는 날짜입니다.' }, 400)
  }

  const u = await c.env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first()
  if (!u) return c.json({ error: '회원을 찾을 수 없습니다.' }, 404)

  // 오늘(KST) 기준으로 만료일이 미래/오늘이면 활성, 과거면 비활성으로 자동 설정
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const today = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`
  const active = until >= today ? 1 : 0

  await c.env.DB.prepare(
    'UPDATE users SET subscriptionUntil = ?, subscriptionActive = ? WHERE id = ?'
  ).bind(until, active, userId).run()
  return c.json({ ok: true, until, active: !!active })
})

// ===== 사이트 설정 =====
admin.get('/config', async (c) => {
  const config = await c.env.DB.prepare('SELECT * FROM site_config LIMIT 1').first()
  return c.json({ config })
})

admin.put('/config', async (c) => {
  const b = await c.req.json().catch(() => null)
  if (!b) return c.json({ error: '잘못된 요청입니다.' }, 400)
  await c.env.DB.prepare(
    `UPDATE site_config SET defaultWinners=?, defaultLosingReward=?, minWithdrawAmount=?, referralBonus=?, updatedAt=datetime('now')`
  ).bind(
    Number(b.defaultWinners), Number(b.defaultLosingReward),
    Number(b.minWithdrawAmount), Number(b.referralBonus)
  ).run()
  invalidate('config:public')
  return c.json({ ok: true })
})

export default admin
