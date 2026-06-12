// Vercel Functions 진입점 (Node.js 런타임)
// 모든 요청을 Hono 앱으로 위임한다.
// Cloudflare 와 달리 Vercel/Node 에서는 c.env 가 자동 주입되지 않으므로,
// app.fetch 의 두 번째 인자(env)로 DB/JWT_SECRET 을 직접 전달한다.
import app from '../src/index'
import { createDb } from '../src/lib/db'

export const config = {
  runtime: 'nodejs',
}

// postgres.js 클라이언트는 createDb 내부(모듈 스코프)에 캐시되어 콜드스타트 간 재사용된다.
let _db: ReturnType<typeof createDb> | null = null
function getEnv() {
  if (!_db) {
    const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || ''
    _db = createDb(url)
  }
  return {
    DB: _db,
    JWT_SECRET: process.env.JWT_SECRET || 'dev-insecure-secret-change-me',
  }
}

export default function handler(req: Request) {
  return app.fetch(req, getEnv())
}
