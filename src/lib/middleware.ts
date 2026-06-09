import { createMiddleware } from 'hono/factory'
import type { Bindings, Variables } from '../types'
import { getCookie, verifyToken } from './auth'

// 세션 로드 미들웨어 (전역) — 쿠키에서 사용자 로드
export const sessionMiddleware = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(
  async (c, next) => {
    const token = getCookie(c.req.header('Cookie') ?? null, 'token')
    let user = null
    if (token) {
      user = await verifyToken(token, c.env.JWT_SECRET)
    }
    c.set('user', user)
    await next()
  }
)

// 로그인 필수 (API)
export const requireAuth = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(
  async (c, next) => {
    const user = c.get('user')
    if (!user) {
      return c.json({ error: '로그인이 필요합니다.' }, 401)
    }
    await next()
  }
)

// 관리자 필수 (API)
export const requireAdmin = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(
  async (c, next) => {
    const user = c.get('user')
    if (!user) {
      return c.json({ error: '로그인이 필요합니다.' }, 401)
    }
    if (user.role !== 'ADMIN') {
      return c.json({ error: '관리자 권한이 필요합니다.' }, 403)
    }
    await next()
  }
)
