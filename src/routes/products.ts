import { Hono } from 'hono'
import type { Bindings, Variables, ProductRow, UserRow } from '../types'
import { requireAuth } from '../lib/middleware'
import { genId } from '../lib/auth'
import { drawWinners } from '../lib/draw'

const products = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// 상품 목록 (각 상품의 참여자 수 포함)
products.get('/', async (c) => {
  const status = c.req.query('status')
  let sql = `SELECT p.*, (SELECT COUNT(*) FROM bids b WHERE b.productId = p.id) AS participants
             FROM products p`
  const binds: any[] = []
  if (status) {
    sql += ' WHERE p.status = ?'
    binds.push(status)
  }
  sql += ' ORDER BY p.sortOrder ASC, p.createdAt DESC'
  const rows = (await c.env.DB.prepare(sql).bind(...binds).all()).results
  return c.json({ products: rows })
})

// 상품 상세 (참여자 목록 + 본인 참여여부)
products.get('/:id', async (c) => {
  const id = c.req.param('id')
  const product = await c.env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(id).first<ProductRow>()
  if (!product) return c.json({ error: '상품을 찾을 수 없습니다.' }, 404)

  // 참여자(닉네임만 노출)
  const participants = (await c.env.DB.prepare(
    `SELECT b.userId, b.isWinner, b.createdAt, u.nickname
     FROM bids b JOIN users u ON u.id = b.userId
     WHERE b.productId = ? ORDER BY b.createdAt ASC`
  ).bind(id).all()).results

  // 당첨자
  const winners = (await c.env.DB.prepare(
    `SELECT w.userId, w.finalPrice, u.nickname FROM winners w JOIN users u ON u.id = w.userId WHERE w.productId = ?`
  ).bind(id).all()).results

  const user = c.get('user')
  let myBid = null
  if (user) {
    myBid = await c.env.DB.prepare('SELECT * FROM bids WHERE userId = ? AND productId = ?').bind(user.id, id).first()
  }

  return c.json({ product, participants, winners, myBid })
})

// 경매 참여 (트랜잭션 + 정원 도달 시 자동 추첨)
products.post('/:id/join', requireAuth, async (c) => {
  const id = c.req.param('id')
  const user = c.get('user')!

  const product = await c.env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(id).first<ProductRow>()
  if (!product) return c.json({ error: '상품을 찾을 수 없습니다.' }, 404)
  if (product.status !== 'OPEN') return c.json({ error: '이미 마감된 경매입니다.' }, 400)

  const dbUser = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first<UserRow>()
  if (!dbUser) return c.json({ error: '사용자 정보를 찾을 수 없습니다.' }, 404)

  // 1. 포인트 검증
  if (dbUser.auctionPoint < product.entryFee) {
    return c.json({ error: `경매 참여 포인트가 부족합니다. (필요: ${product.entryFee.toLocaleString()}P, 보유: ${dbUser.auctionPoint.toLocaleString()}P)` }, 400)
  }

  // 2. 중복 참여 차단
  const dup = await c.env.DB.prepare('SELECT id FROM bids WHERE userId = ? AND productId = ?').bind(user.id, id).first()
  if (dup) return c.json({ error: '이미 참여한 경매입니다.' }, 409)

  // 3. 정원 초과 차단
  const countRow = await c.env.DB.prepare('SELECT COUNT(*) AS cnt FROM bids WHERE productId = ?').bind(id).first<{ cnt: number }>()
  const currentCount = countRow?.cnt ?? 0
  if (currentCount >= product.maxParticipants) {
    return c.json({ error: '정원이 모두 찼습니다.' }, 400)
  }

  // 4. 포인트 차감 + Bid 생성 + 5. 내역 기록 (배치 트랜잭션)
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET auctionPoint = auctionPoint - ? WHERE id = ?').bind(product.entryFee, user.id),
    c.env.DB.prepare(
      `INSERT INTO bids (id, userId, productId, pointsUsed, isWinner, createdAt)
       VALUES (?, ?, ?, ?, 0, datetime('now'))`
    ).bind(genId('b-'), user.id, id, product.entryFee),
    c.env.DB.prepare(
      `INSERT INTO point_history (id, userId, type, pointKind, amount, description, createdAt)
       VALUES (?, ?, 'USE', 'AUCTION', ?, ?, datetime('now'))`
    ).bind(genId('ph-'), user.id, -product.entryFee, `경매 참여: ${product.title}`),
  ])

  const newCount = currentCount + 1

  // 6. 정원 도달 → 자동 추첨
  let drawResult = null
  if (newCount >= product.maxParticipants) {
    drawResult = await drawWinners(c.env.DB, product)
  }

  // 본인 당첨 여부 (추첨된 경우)
  let won: boolean | null = null
  if (drawResult) {
    won = drawResult.winners.includes(user.id)
  }

  return c.json({
    ok: true,
    joined: true,
    participants: newCount,
    drawn: !!drawResult,
    won,
    losingReward: product.losingReward,
    startPrice: product.startPrice,
    marketPrice: product.marketPrice,
    title: product.title,
  })
})

export default products
