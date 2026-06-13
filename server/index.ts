// Vercel Functions 진입점 (Node.js 런타임)
//
// Vercel Node 런타임은 Node 표준 (req, res) => void 핸들러를 가장 안정적으로 인식한다.
// Web 표준 Request/Response 핸들러(ESM)는 환경에 따라 FUNCTION_INVOCATION_FAILED 가
// 발생할 수 있으므로, @hono/node-server 의 getRequestListener 로 Hono 앱을
// Node http 핸들러로 변환해 내보낸다.
//
// Cloudflare 와 달리 Vercel/Node 에서는 c.env 가 자동 주입되지 않으므로,
// DB/JWT_SECRET 주입은 src/lib/middleware.ts 의 envMiddleware(fallback) 가 담당한다.
import { getRequestListener } from '@hono/node-server'
import type { IncomingMessage, ServerResponse } from 'node:http'
import app from '../src/index'
import { createDb } from '../src/lib/db'

const listener = getRequestListener(app.fetch)

// DB 연결 진단용 엔드포인트: 실제 쿼리를 한 번 날려보고 결과/에러를 JSON 으로 반환한다.
// 비밀번호는 노출하지 않고 호스트/사용자/에러 메시지만 보여준다.
async function dbDiag(): Promise<any> {
  const raw = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || ''
  let host = '(none)', user = '(none)', port = '(none)'
  try {
    const u = new URL(raw)
    host = u.hostname
    user = u.username
    port = u.port
  } catch {}
  const info: any = { host, user, port, hasUrl: Boolean(raw) }
  try {
    const db = createDb(raw)
    const row = await db.prepare('SELECT count(*)::int AS n FROM users').first<{ n: number }>()
    info.ok = true
    info.userCount = row?.n ?? null
  } catch (e: any) {
    info.ok = false
    info.errorName = e?.name ?? null
    info.errorMessage = String(e?.message ?? e).slice(0, 300)
    info.errorCode = e?.code ?? null
  }
  return info
}

export default function handler(req: IncomingMessage, res: ServerResponse) {
  if ((req.url || '').startsWith('/__dbcheck')) {
    dbDiag().then((info) => {
      res.statusCode = 200
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(info, null, 2))
    })
    return
  }
  return listener(req, res)
}
