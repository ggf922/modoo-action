// Vercel Functions 진입점 (Node.js 런타임)
//
// Vercel Node 런타임은 Node 표준 (req, res) => void 핸들러를 가장 안정적으로 인식한다.
// Web 표준 Request/Response 핸들러(ESM)는 환경에 따라 FUNCTION_INVOCATION_FAILED 가
// 발생할 수 있으므로, @hono/node-server 의 getRequestListener 로 Hono 앱을
// Node http 핸들러로 변환해 내보낸다.
//
// Cloudflare 와 달리 Vercel/Node 에서는 c.env 가 자동 주입되지 않으므로,
// DB/JWT_SECRET 주입은 src/lib/middleware.ts 의 envMiddleware(fallback) 가 담당한다.
//
// DB 연결: Supabase Shared(Session) Pooler 사용 — IPv4 프록시 지원.
//   호스트 예) aws-1-ap-northeast-2.pooler.supabase.com:5432
//   사용자  예) postgres.<project-ref>
//   ⚠️ DEDICATED POOLER(db.<ref>.supabase.co)는 IPv6 전용이라 Vercel 에서 ENOTFOUND 발생.
import { getRequestListener } from '@hono/node-server'
import type { IncomingMessage, ServerResponse } from 'node:http'
import app from '../src/index'

const listener = getRequestListener(app.fetch)

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return listener(req, res)
}
