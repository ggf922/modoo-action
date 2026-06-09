import { SignJWT, jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'
import type { SessionUser } from '../types'

const enc = new TextEncoder()

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export async function createToken(user: SessionUser, secret: string): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(enc.encode(secret))
}

export async function verifyToken(token: string, secret: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, enc.encode(secret))
    return {
      id: payload.id as string,
      email: payload.email as string,
      name: payload.name as string,
      nickname: payload.nickname as string,
      role: payload.role as 'MEMBER' | 'ADMIN',
    }
  } catch {
    return null
  }
}

// 쿠키 파싱
export function getCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null
  const match = cookieHeader.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
  return match ? decodeURIComponent(match[1]) : null
}

// cuid 유사 ID 생성 (엣지 호환)
export function genId(prefix = ''): string {
  const ts = Date.now().toString(36)
  const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
  return `${prefix}${ts}${rand}`
}

// 8자리 영숫자 대문자 추천코드
export function genReferralCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = ''
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  for (let i = 0; i < 8; i++) {
    code += chars[bytes[i] % chars.length]
  }
  return code
}
