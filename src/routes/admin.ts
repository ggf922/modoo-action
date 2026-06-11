import { Hono } from 'hono'
import type { Bindings, Variables, ProductRow, UserRow } from '../types'
import { requireAdmin } from '../lib/middleware'
import { genId } from '../lib/auth'
import { drawWinners } from '../lib/draw'

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
  const totalCharged = (await db.prepare("SELECT COALESCE(SUM(amount),0) AS s FROM point_history WHERE type='CHARGE'").first<{ s: number }>())?.s ?? 0
  const totalRewards = (await db.prepare("SELECT COALESCE(SUM(amount),0) AS s FROM point_history WHERE type='REWARD' AND pointKind='BALANCE'").first<{ s: number }>())?.s ?? 0

  // 카테고리별 상품 수 (차트용)
  const byCategory = (await db.prepare('SELECT category, COUNT(*) AS cnt FROM products GROUP BY category').all()).results
  // 최근 7일 가입자 (차트용)
  const recentUsers = (await db.prepare(
    `SELECT date(createdAt) AS d, COUNT(*) AS cnt FROM users WHERE role='MEMBER' GROUP BY date(createdAt) ORDER BY d DESC LIMIT 7`
  ).all()).results

  return c.json({
    totalUsers, totalProducts, openProducts, totalBids, totalWinners,
    pendingWithdrawals, totalCharged, totalRewards, byCategory, recentUsers,
  })
})

// ===== 상품 CRUD =====
admin.get('/products', async (c) => {
  const rows = (await c.env.DB.prepare(
    `SELECT p.*, (SELECT COUNT(*) FROM bids b WHERE b.productId=p.id) AS participants
     FROM products p ORDER BY p.createdAt DESC`
  ).all()).results
  return c.json({ products: rows })
})

admin.post('/products', async (c) => {
  const b = await c.req.json().catch(() => null)
  if (!b) return c.json({ error: '잘못된 요청입니다.' }, 400)
  const required = ['title', 'imageUrl', 'category', 'marketPrice', 'startPrice', 'entryFee']
  for (const k of required) {
    if (b[k] === undefined || b[k] === null || b[k] === '') return c.json({ error: `${k} 항목이 필요합니다.` }, 400)
  }
  const id = genId('p-')
  await c.env.DB.prepare(
    `INSERT INTO products (id, title, description, imageUrl, category, marketPrice, startPrice, entryFee, maxParticipants, winnersCount, losingReward, status, startAt, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', datetime('now'), datetime('now'))`
  ).bind(
    id, b.title, b.description ?? '', b.imageUrl, b.category,
    Number(b.marketPrice), Number(b.startPrice), Number(b.entryFee),
    Number(b.maxParticipants ?? 10), Number(b.winnersCount ?? 1), Number(b.losingReward ?? 200)
  ).run()
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
  await c.env.DB.prepare(
    `UPDATE products SET title=?, description=?, imageUrl=?, category=?, marketPrice=?, startPrice=?, entryFee=?, maxParticipants=?, winnersCount=?, losingReward=?, status=? WHERE id=?`
  ).bind(
    b.title, b.description ?? '', b.imageUrl, b.category,
    Number(b.marketPrice), Number(b.startPrice), Number(b.entryFee),
    Number(b.maxParticipants), Number(b.winnersCount), Number(b.losingReward),
    b.status ?? 'OPEN', id
  ).run()
  return c.json({ ok: true })
})

admin.delete('/products/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM winners WHERE productId = ?').bind(id),
    c.env.DB.prepare('DELETE FROM bids WHERE productId = ?').bind(id),
    c.env.DB.prepare('DELETE FROM products WHERE id = ?').bind(id),
  ])
  return c.json({ ok: true })
})

// 수동 강제 추첨 (정원 미달이어도 관리자가 마감 가능)
admin.post('/products/:id/draw', async (c) => {
  const product = await c.env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(c.req.param('id')).first<ProductRow>()
  if (!product) return c.json({ error: '상품을 찾을 수 없습니다.' }, 404)
  if (product.status !== 'OPEN') return c.json({ error: '이미 마감된 경매입니다.' }, 400)
  const result = await drawWinners(c.env.DB, product)
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

  return c.json({ ok: true, winnersCount, losingReward, maxParticipants })
})

// ===== 회원 관리 =====
admin.get('/members', async (c) => {
  const q = c.req.query('q')
  let sql = `SELECT u.id, u.email, u.name, u.nickname, u.role, u.auctionPoint, u.balancePoint, u.wagePoint,
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
  const kind = b?.kind as 'AUCTION' | 'BALANCE' | 'WAGE'
  const amount = Number(b?.amount)
  const reason = b?.reason ?? '관리자 조정'
  if (!['AUCTION', 'BALANCE', 'WAGE'].includes(kind)) return c.json({ error: '포인트 종류가 올바르지 않습니다.' }, 400)
  if (!amount || isNaN(amount)) return c.json({ error: '조정 금액을 입력해주세요.' }, 400)

  const col = kind === 'AUCTION' ? 'auctionPoint' : kind === 'BALANCE' ? 'balancePoint' : 'wagePoint'
  const target = await c.env.DB.prepare(`SELECT ${col} AS v FROM users WHERE id = ?`).bind(id).first<{ v: number }>()
  if (!target) return c.json({ error: '회원을 찾을 수 없습니다.' }, 404)
  if (target.v + amount < 0) return c.json({ error: '포인트가 음수가 될 수 없습니다.' }, 400)

  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE users SET ${col} = ${col} + ? WHERE id = ?`).bind(amount, id),
    c.env.DB.prepare(
      `INSERT INTO point_history (id, userId, type, pointKind, amount, description, createdAt)
       VALUES (?, ?, 'ADMIN_ADJ', ?, ?, ?, datetime('now'))`
    ).bind(genId('ph-'), id, kind, amount, `관리자 조정: ${reason}`),
  ])
  return c.json({ ok: true })
})

// ===== 출금 관리 =====
admin.get('/withdrawals', async (c) => {
  const rows = (await c.env.DB.prepare(
    `SELECT w.*, u.name, u.nickname, u.email, u.bankName, u.bankAccount, u.accountHolder,
            u.balancePoint, u.wagePoint
     FROM withdrawals w JOIN users u ON u.id = w.userId
     ORDER BY CASE w.status WHEN 'PENDING' THEN 0 ELSE 1 END, w.requestedAt DESC`
  ).all()).results
  return c.json({ withdrawals: rows })
})

// 출금 승인 (잔액→임금 순으로 차감) / 거절
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

  // 승인 → 차감 (잔액 우선, 부족분 임금에서)
  const u = await c.env.DB.prepare('SELECT balancePoint, wagePoint FROM users WHERE id = ?').bind(wd.userId).first<{ balancePoint: number; wagePoint: number }>()
  if (!u) return c.json({ error: '회원을 찾을 수 없습니다.' }, 404)
  if (u.balancePoint + u.wagePoint < wd.amount) {
    return c.json({ error: '회원의 출금 가능 포인트가 부족합니다.' }, 400)
  }
  const fromBalance = Math.min(u.balancePoint, wd.amount)
  const fromWage = wd.amount - fromBalance

  const stmts: D1PreparedStatement[] = [
    c.env.DB.prepare('UPDATE users SET balancePoint = balancePoint - ?, wagePoint = wagePoint - ? WHERE id = ?').bind(fromBalance, fromWage, wd.userId),
    c.env.DB.prepare("UPDATE withdrawals SET status='COMPLETED', processedAt=datetime('now') WHERE id=?").bind(id),
  ]
  if (fromBalance > 0) {
    stmts.push(c.env.DB.prepare(
      `INSERT INTO point_history (id, userId, type, pointKind, amount, description, createdAt) VALUES (?, ?, 'WITHDRAW', 'BALANCE', ?, ?, datetime('now'))`
    ).bind(genId('ph-'), wd.userId, -fromBalance, `출금 승인 (잔액)`))
  }
  if (fromWage > 0) {
    stmts.push(c.env.DB.prepare(
      `INSERT INTO point_history (id, userId, type, pointKind, amount, description, createdAt) VALUES (?, ?, 'WITHDRAW', 'WAGE', ?, ?, datetime('now'))`
    ).bind(genId('ph-'), wd.userId, -fromWage, `출금 승인 (임금)`))
  }
  await c.env.DB.batch(stmts)
  return c.json({ ok: true, status: 'COMPLETED' })
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
  return c.json({ ok: true })
})

export default admin
