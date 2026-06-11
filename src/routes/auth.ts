import { Hono } from 'hono'
import { setCookie, deleteCookie } from 'hono/cookie'
import type { Bindings, Variables, UserRow } from '../types'
import { hashPassword, verifyPassword, createToken, genId, genReferralCode } from '../lib/auth'
import { requireAuth } from '../lib/middleware'

const auth = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// 회원가입
auth.post('/register', async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body) return c.json({ error: '잘못된 요청입니다.' }, 400)

  const { email, password, name, nickname, phone, referralCode } = body

  if (!email || !password || !name || !nickname) {
    return c.json({ error: '필수 항목을 모두 입력해주세요.' }, 400)
  }
  if (String(password).length < 6) {
    return c.json({ error: '비밀번호는 6자 이상이어야 합니다.' }, 400)
  }

  // 중복 검사
  const exists = await c.env.DB.prepare(
    'SELECT id FROM users WHERE email = ? OR nickname = ?'
  ).bind(email, nickname).first()
  if (exists) {
    return c.json({ error: '이미 사용 중인 이메일 또는 닉네임입니다.' }, 409)
  }

  // 추천인 조회 (선택)
  let referrer: UserRow | null = null
  if (referralCode && String(referralCode).trim()) {
    referrer = await c.env.DB.prepare(
      'SELECT * FROM users WHERE referralCode = ?'
    ).bind(String(referralCode).trim().toUpperCase()).first<UserRow>()
    if (!referrer) {
      return c.json({ error: '존재하지 않는 추천코드입니다.' }, 400)
    }
  }

  // 추천인이 없으면 회사(관리자)를 기본 추천인으로 자동 적용
  let isCompanyReferral = false
  if (!referrer) {
    referrer = await c.env.DB.prepare(
      "SELECT * FROM users WHERE role = 'ADMIN' ORDER BY createdAt ASC LIMIT 1"
    ).first<UserRow>()
    isCompanyReferral = true
  }

  // 사이트 설정(추천 보너스)
  const config = await c.env.DB.prepare('SELECT referralBonus FROM site_config LIMIT 1').first<{ referralBonus: number }>()
  const referralBonus = config?.referralBonus ?? 500

  const hashed = await hashPassword(password)
  const userId = genId('u-')

  // 고유 추천코드 발급 (충돌 회피)
  let newCode = genReferralCode()
  for (let i = 0; i < 5; i++) {
    const dup = await c.env.DB.prepare('SELECT id FROM users WHERE referralCode = ?').bind(newCode).first()
    if (!dup) break
    newCode = genReferralCode()
  }

  // 트랜잭션(batch)으로 처리: 신규 회원 생성 + 추천인 보너스 + 내역
  const stmts: D1PreparedStatement[] = []

  stmts.push(
    c.env.DB.prepare(
      `INSERT INTO users (id, email, password, name, phone, nickname, role, auctionPoint, balancePoint, wagePoint, referrerId, referralCode, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 'MEMBER', 0, 0, 0, ?, ?, datetime('now'), datetime('now'))`
    ).bind(userId, email, hashed, name, phone ?? null, nickname, referrer?.id ?? null, newCode)
  )

  if (referrer) {
    stmts.push(
      c.env.DB.prepare('UPDATE users SET wagePoint = wagePoint + ? WHERE id = ?').bind(referralBonus, referrer.id)
    )
    const bonusDesc = isCompanyReferral
      ? `회사 추천 가입 보너스 (${nickname})`
      : `추천 가입 보너스 (${nickname})`
    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO point_history (id, userId, type, pointKind, amount, description, createdAt)
         VALUES (?, ?, 'REFERRAL', 'WAGE', ?, ?, datetime('now'))`
      ).bind(genId('ph-'), referrer.id, referralBonus, bonusDesc)
    )
  }

  await c.env.DB.batch(stmts)

  // 이메일 발송은 콘솔 로그로 대체
  console.log(`[EMAIL] 가입 환영 메일 발송 → ${email}`)

  const sessionUser = { id: userId, email, name, nickname, role: 'MEMBER' as const }
  const token = await createToken(sessionUser, c.env.JWT_SECRET)
  setCookie(c, 'token', token, { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 * 7, sameSite: 'Lax' })

  return c.json({ ok: true, user: sessionUser, referralCode: newCode })
})

// 로그인
auth.post('/login', async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body) return c.json({ error: '잘못된 요청입니다.' }, 400)
  const { email, password } = body
  if (!email || !password) return c.json({ error: '이메일과 비밀번호를 입력해주세요.' }, 400)

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>()
  if (!user) return c.json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, 401)

  const valid = await verifyPassword(password, user.password)
  if (!valid) return c.json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, 401)

  const sessionUser = { id: user.id, email: user.email, name: user.name, nickname: user.nickname, role: user.role }
  const token = await createToken(sessionUser, c.env.JWT_SECRET)
  setCookie(c, 'token', token, { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 * 7, sameSite: 'Lax' })

  return c.json({ ok: true, user: sessionUser })
})

// 비밀번호 찾기 (본인 확인 후 새 비밀번호로 즉시 재설정)
// MVP: 이메일 발송 인프라가 없으므로 이메일/아이디 + 이름 + 휴대폰 일치 확인 후 재설정
auth.post('/reset-password', async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body) return c.json({ error: '잘못된 요청입니다.' }, 400)
  const { email, name, phone, newPassword } = body

  if (!email || !name || !phone || !newPassword) {
    return c.json({ error: '모든 항목을 입력해주세요.' }, 400)
  }
  if (String(newPassword).length < 6) {
    return c.json({ error: '새 비밀번호는 6자 이상이어야 합니다.' }, 400)
  }

  // 이메일(또는 아이디) 기준 사용자 조회
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(String(email).trim()).first<UserRow>()
  if (!user) return c.json({ error: '일치하는 계정 정보를 찾을 수 없습니다.' }, 404)

  // 본인 확인: 이름 + 휴대폰 일치
  const inputPhone = String(phone).replace(/[^0-9]/g, '')
  const dbPhone = String(user.phone ?? '').replace(/[^0-9]/g, '')
  if (String(user.name).trim() !== String(name).trim() || dbPhone !== inputPhone) {
    return c.json({ error: '계정 정보(이름·휴대폰)가 일치하지 않습니다.' }, 401)
  }

  const hashed = await hashPassword(String(newPassword))
  await c.env.DB.prepare(
    "UPDATE users SET password = ?, updatedAt = datetime('now') WHERE id = ?"
  ).bind(hashed, user.id).run()

  console.log(`[PASSWORD RESET] ${user.email} 비밀번호 재설정 완료`)
  return c.json({ ok: true })
})

// 비밀번호 변경 (로그인 상태에서 현재 비밀번호 확인 후 변경)
auth.post('/change-password', requireAuth, async (c) => {
  const sessionUser = c.get('user')!
  const body = await c.req.json().catch(() => null)
  if (!body) return c.json({ error: '잘못된 요청입니다.' }, 400)
  const { currentPassword, newPassword } = body

  if (!currentPassword || !newPassword) {
    return c.json({ error: '현재 비밀번호와 새 비밀번호를 입력해주세요.' }, 400)
  }
  if (String(newPassword).length < 6) {
    return c.json({ error: '새 비밀번호는 6자 이상이어야 합니다.' }, 400)
  }

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(sessionUser.id).first<UserRow>()
  if (!user) return c.json({ error: '사용자 정보를 찾을 수 없습니다.' }, 404)

  const valid = await verifyPassword(String(currentPassword), user.password)
  if (!valid) return c.json({ error: '현재 비밀번호가 올바르지 않습니다.' }, 401)

  const same = await verifyPassword(String(newPassword), user.password)
  if (same) return c.json({ error: '새 비밀번호가 기존 비밀번호와 동일합니다.' }, 400)

  const hashed = await hashPassword(String(newPassword))
  await c.env.DB.prepare(
    "UPDATE users SET password = ?, updatedAt = datetime('now') WHERE id = ?"
  ).bind(hashed, user.id).run()

  return c.json({ ok: true })
})

// 로그아웃
auth.post('/logout', (c) => {
  deleteCookie(c, 'token', { path: '/' })
  return c.json({ ok: true })
})

// 현재 사용자 정보 (전체 포인트 포함)
auth.get('/me', requireAuth, async (c) => {
  const sessionUser = c.get('user')!
  const user = await c.env.DB.prepare(
    `SELECT id, email, name, phone, nickname, role, auctionPoint, balancePoint, wagePoint,
            referralCode, referrerId, bankName, bankAccount, accountHolder, createdAt
     FROM users WHERE id = ?`
  ).bind(sessionUser.id).first()
  return c.json({ user })
})

export default auth
