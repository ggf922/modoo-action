import { Hono } from 'hono'
import type { Bindings, Variables, ProductRow, UserRow } from '../types'
import type { D1PreparedStatement } from '../lib/db'
import { BatchGuardError } from '../lib/db'
import { requireAdmin } from '../lib/middleware'
import { genId } from '../lib/auth'
import { drawWinners } from '../lib/draw'
import { invalidate } from '../lib/cache'
import { ensureSubscriptionSchema, extendOneMonth } from './me'

const admin = new Hono<{ Bindings: Bindings; Variables: Variables }>()
admin.use('*', requireAdmin)

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
  const id = genId('p-')
  // 새 상품은 목록 맨 뒤로 (현재 최대 sortOrder + 1)
  const maxOrder = (await c.env.DB.prepare('SELECT COALESCE(MAX(sortOrder), -1) AS m FROM products').first<{ m: number }>())?.m ?? -1
  await c.env.DB.prepare(
    `INSERT INTO products (id, title, description, imageUrl, category, marketPrice, startPrice, entryFee, maxParticipants, winnersCount, losingReward, status, sortOrder, startAt, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, datetime('now'), datetime('now'))`
  ).bind(
    id, b.title, b.description ?? '', b.imageUrl, b.category,
    mp, sp, entryFee,
    Number(b.maxParticipants ?? 10), Number(b.winnersCount ?? 1), Number(b.losingReward ?? 200),
    maxOrder + 1
  ).run()
  invalidate('products')
  return c.json({ ok: true, id })
})

admin.get('/products/:id', async (c) => {
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
  await c.env.DB.prepare(
    `UPDATE products SET title=?, description=?, imageUrl=?, category=?, marketPrice=?, startPrice=?, entryFee=?, maxParticipants=?, winnersCount=?, losingReward=?, status=? WHERE id=?`
  ).bind(
    b.title, b.description ?? '', b.imageUrl, b.category,
    mp, sp, entryFee,
    Number(b.maxParticipants), Number(b.winnersCount), Number(b.losingReward),
    b.status ?? 'OPEN', id
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
  const q = c.req.query('q')
  let sql = `SELECT u.id, u.email, u.name, u.nickname, u.role, u.grade, u.auctionPoint, u.balancePoint, u.wagePoint,
                    u.referralCode, u.referrerId, u.createdAt,
                    r.nickname AS referrerNickname
             FROM users u LEFT JOIN users r ON r.id = u.referrerId`
  const binds: any[] = []
  if (q) {
    sql += ' WHERE u.email LIKE ? OR u.name LIKE ? OR u.nickname LIKE ?'
    binds.push(`%${q}%`, `%${q}%`, `%${q}%`)
  }
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

// 회원 등급 변경/승인
const GRADES = ['NORMAL', 'VIP', 'VVIP', 'AGENCY', 'DISTRIBUTOR', 'DIRECTOR']
admin.post('/members/:id/grade', async (c) => {
  const id = c.req.param('id')
  const b = await c.req.json().catch(() => null)
  const grade = String(b?.grade ?? '')
  if (!GRADES.includes(grade)) return c.json({ error: '올바르지 않은 등급입니다.' }, 400)

  const target = await c.env.DB.prepare('SELECT id, role FROM users WHERE id = ?').bind(id).first<{ id: string; role: string }>()
  if (!target) return c.json({ error: '회원을 찾을 수 없습니다.' }, 404)

  await c.env.DB.prepare("UPDATE users SET grade = ?, updatedAt = datetime('now') WHERE id = ?").bind(grade, id).run()
  return c.json({ ok: true, grade })
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

// 단일 회원 상세 (수정 폼용)
admin.get('/members/:id', async (c) => {
  const m = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.nickname, u.phone, u.role, u.grade,
            u.auctionPoint, u.balancePoint, u.wagePoint, u.referralCode, u.referrerId,
            u.bankName, u.bankAccount, u.accountHolder, u.createdAt,
            r.nickname AS referrerNickname, r.name AS referrerName
     FROM users u LEFT JOIN users r ON r.id = u.referrerId
     WHERE u.id = ?`
  ).bind(c.req.param('id')).first()
  if (!m) return c.json({ error: '회원을 찾을 수 없습니다.' }, 404)
  return c.json({ member: m })
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
    c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id),
  ])
  return c.json({ ok: true })
})

// 전체 조직도 (관리자 전용) — 관리자 루트 기준 전체 트리
admin.get('/network', async (c) => {
  const db = c.env.DB
  // 전체 회원(관리자 포함)
  const all = (await db.prepare(
    `SELECT id, name, nickname, role, grade, referrerId, referralCode, createdAt,
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
  const rows = (await c.env.DB.prepare(
    `SELECT cr.*, u.name, u.nickname, u.email, u.auctionPoint
     FROM charge_requests cr JOIN users u ON u.id = cr.userId
     ORDER BY CASE cr.status WHEN 'PENDING' THEN 0 ELSE 1 END, cr.requestedAt DESC`
  ).all()).results
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
admin.get('/shipments', async (c) => {
  const rows = (await c.env.DB.prepare(
    `SELECT w.*, u.name AS memberName, u.nickname, u.phone AS memberPhone,
            p.title, p.imageUrl, p.startPrice
     FROM winners w
     JOIN users u ON u.id = w.userId
     JOIN products p ON p.id = w.productId
     ORDER BY CASE w.shippingStatus
                WHEN 'SUBMITTED' THEN 0 WHEN 'PENDING' THEN 1
                WHEN 'SHIPPED' THEN 2 ELSE 3 END,
              w.drawnAt DESC`
  ).all()).results
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

// ===== 출금 관리 =====
admin.get('/withdrawals', async (c) => {
  const rows = (await c.env.DB.prepare(
    `SELECT w.*, u.name, u.nickname, u.email, u.bankName, u.bankAccount, u.accountHolder,
            u.auctionPoint
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
// 구독 신청(납부)한 회원 목록 — 회원별 최근 납부 내역과 활성 상태
admin.get('/subscriptions', async (c) => {
  await ensureSubscriptionSchema(c.env.DB)
  const rows = (await c.env.DB.prepare(
    `SELECT u.id, u.name, u.nickname, u.email, u.grade,
            u.subscriptionActive, u.subscriptionUntil, u.auctionPoint,
            sp_last.period AS lastPeriod, sp_last.paidAt AS lastPaidAt,
            sp_cnt.cnt AS payCount
     FROM users u
     JOIN (SELECT DISTINCT userId FROM subscription_payments) s ON s.userId = u.id
     LEFT JOIN (
       SELECT sp1.userId, sp1.period, sp1.paidAt FROM subscription_payments sp1
       JOIN (SELECT userId, MAX(paidAt) AS mx FROM subscription_payments GROUP BY userId) m
         ON m.userId = sp1.userId AND m.mx = sp1.paidAt
     ) sp_last ON sp_last.userId = u.id
     LEFT JOIN (SELECT userId, COUNT(*) AS cnt FROM subscription_payments GROUP BY userId) sp_cnt
       ON sp_cnt.userId = u.id
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
