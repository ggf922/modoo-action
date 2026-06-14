import { Hono } from 'hono'
import type { Bindings, Variables, ProductRow, UserRow } from '../types'
import { requireAuth } from '../lib/middleware'
import { genId } from '../lib/auth'
import { drawWinners } from '../lib/draw'
import { cached, invalidate } from '../lib/cache'

const products = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// 상품 외부 링크(productUrl) 컬럼 런타임 보장 (프로덕션 Supabase 수동 마이그레이션 불가 대응)
let _productUrlReady = false
export async function ensureProductUrlColumn(DB: any) {
  if (_productUrlReady) return
  await DB.prepare(`ALTER TABLE products ADD COLUMN IF NOT EXISTS productUrl TEXT NOT NULL DEFAULT ''`).run()
  _productUrlReady = true
}

// 상품 목록 (각 상품의 참여자 수 포함)
// 성능:
//  1) participantCount 비정규화 컬럼 사용 (bids COUNT 서브쿼리 제거)
//  2) 사용자 무관 공개 데이터이므로 짧은 TTL(3초) 인메모리 캐싱 → DB 직격 감소
//     입찰/추첨/상품변경 시 invalidate('products') 로 즉시 갱신.
products.get('/', async (c) => {
  const status = c.req.query('status')
  const cacheKey = `products:${status || 'ALL'}`
  const rows = await cached(cacheKey, 3000, async () => {
    let sql = `SELECT p.*, p.participantCount AS participants FROM products p`
    const binds: any[] = []
    if (status) {
      sql += ' WHERE p.status = ?'
      binds.push(status)
    }
    sql += ' ORDER BY p.sortOrder ASC, p.createdAt DESC'
    return (await c.env.DB.prepare(sql).bind(...binds).all()).results
  })
  return c.json({ products: rows })
})

// 상품 상세 (참여자 목록 + 본인 참여여부)
products.get('/:id', async (c) => {
  const id = c.req.param('id')
  await ensureProductUrlColumn(c.env.DB)
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

  // 3. 정원 초과 차단 (비정규화 컬럼으로 사전 확인 — 빠른 거부)
  if (product.participantCount >= product.maxParticipants) {
    return c.json({ error: '정원이 모두 찼습니다.' }, 400)
  }

  // 4. 정원 원자적 증가 + 포인트 차감 + Bid 생성 + 내역 기록 (단일 트랜잭션)
  //    - 정원 UPDATE 를 조건부(< maxParticipants)로 +1 하고 .requireRows() 표시:
  //      0행이면(동시 입찰로 정원이 막 찼으면) 트랜잭션 전체가 롤백되어 bids/포인트도 취소된다.
  //      → 1만 동접 경매 마감 순간의 정원 초과/중복 차감을 DB 레벨에서 원자적으로 방지(낙관적 락).
  //    - UNIQUE(userId, productId) 제약이 동시 중복참여를 최종 차단한다.
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        'UPDATE products SET participantCount = participantCount + 1 WHERE id = ? AND participantCount < maxParticipants'
      ).bind(id).requireRows(),
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
  } catch (e: any) {
    // 정원 가드 실패 → 정원 마감. 그 외 에러(예: UNIQUE 중복참여)도 안전하게 안내.
    if (e?.name === 'BatchGuardError') {
      return c.json({ error: '정원이 모두 찼습니다.' }, 400)
    }
    if (String(e?.message || '').includes('bids_userId_productId') || e?.code === '23505') {
      return c.json({ error: '이미 참여한 경매입니다.' }, 409)
    }
    throw e
  }

  const newCount = product.participantCount + 1

  // 참여로 participantCount/상태가 바뀌었으므로 공개 목록 캐시 무효화
  invalidate('products')

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
