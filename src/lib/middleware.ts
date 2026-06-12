import { createMiddleware } from 'hono/factory'
import type { Bindings, Variables } from '../types'
import { getCookie, verifyToken } from './auth'
import { createDb } from './db'

// env 주입 미들웨어 (전역, 최우선) — fallback 안전망.
// 정상 경로에서는 api/index.ts 가 app.fetch(req, env) 로 DB/JWT_SECRET 을 주입한다.
// 그러나 일부 진입(예: 직접 app.fetch(req) 호출)에서 c.env 가 비어 있을 수 있으므로,
// DB 가 누락된 경우에만 process.env 로부터 보충한다.
let _dbSingleton: ReturnType<typeof createDb> | null = null
export const envMiddleware = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(
  async (c, next) => {
    const env = (c.env as any) ?? {}
    if (!env.DB) {
      if (!_dbSingleton) {
        const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || ''
        _dbSingleton = createDb(url)
      }
      env.DB = _dbSingleton
    }
    if (!env.JWT_SECRET) {
      env.JWT_SECRET = process.env.JWT_SECRET || 'dev-insecure-secret-change-me'
    }
    // c.env 가 존재하지 않았던 경우 새 객체를 바인딩
    if (!c.env) {
      ;(c as any).env = env
    }
    await next()
  }
)

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
