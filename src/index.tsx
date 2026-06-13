import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Bindings, Variables } from './types'
import { envMiddleware, sessionMiddleware } from './lib/middleware'
import authRoutes from './routes/auth'
import productRoutes from './routes/products'
import meRoutes from './routes/me'
import adminRoutes from './routes/admin'
import { renderApp } from './views/app'
import { cached } from './lib/cache'

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

app.use('/api/*', cors())
app.use('*', envMiddleware)      // DB/JWT_SECRET 주입 (최우선)
app.use('*', sessionMiddleware)

// ===== API =====
const api = new Hono<{ Bindings: Bindings; Variables: Variables }>()

api.route('/auth', authRoutes)
api.route('/products', productRoutes)
api.route('/me', meRoutes)
api.route('/admin', adminRoutes)

// 공개 설정 (회원가입 추천 보너스 표시 등)
// 거의 변하지 않는 전역 설정 — 30초 TTL 캐싱으로 DB 부하 절감.
// 관리자 설정 변경 시 admin 라우트에서 invalidate('config:public') 로 즉시 갱신.
api.get('/config/public', async (c) => {
  const config = await cached('config:public', 30000, async () =>
    c.env.DB.prepare(
      'SELECT defaultLosingReward, minWithdrawAmount, referralBonus FROM site_config LIMIT 1'
    ).first()
  )
  return c.json({ config })
})

app.route('/api', api)

// ===== 프론트엔드: 모든 비-API 경로는 SPA 셸 반환 =====
app.get('*', (c) => {
  return c.html(renderApp())
})

export default app
