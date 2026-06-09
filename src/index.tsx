import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Bindings, Variables } from './types'
import { sessionMiddleware } from './lib/middleware'
import authRoutes from './routes/auth'
import productRoutes from './routes/products'
import meRoutes from './routes/me'
import adminRoutes from './routes/admin'
import { renderApp } from './views/app'

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

app.use('/api/*', cors())
app.use('*', sessionMiddleware)

// ===== API =====
const api = new Hono<{ Bindings: Bindings; Variables: Variables }>()

api.route('/auth', authRoutes)
api.route('/products', productRoutes)
api.route('/me', meRoutes)
api.route('/admin', adminRoutes)

// 공개 설정 (회원가입 추천 보너스 표시 등)
api.get('/config/public', async (c) => {
  const config = await c.env.DB.prepare(
    'SELECT defaultLosingReward, minWithdrawAmount, referralBonus FROM site_config LIMIT 1'
  ).first()
  return c.json({ config })
})

app.route('/api', api)

// ===== 프론트엔드: 모든 비-API 경로는 SPA 셸 반환 =====
app.get('*', (c) => {
  return c.html(renderApp())
})

export default app
