import type { PgDatabase } from './lib/db'

// 앱 바인딩 타입 (Vercel/Node 환경에서 미들웨어가 주입)
// PgDatabase 는 D1Database 호환 인터페이스(prepare/bind/first/all/run/batch)를 제공한다.
export type Bindings = {
  DB: PgDatabase
  JWT_SECRET: string
}

export type Variables = {
  user: SessionUser | null
}

export type SessionUser = {
  id: string
  email: string
  name: string
  nickname: string
  role: 'MEMBER' | 'ADMIN'
}

export type MemberGrade = 'NORMAL' | 'VIP' | 'VVIP' | 'AGENCY' | 'DISTRIBUTOR' | 'DIRECTOR'

export type UserRow = {
  id: string
  email: string
  password: string
  name: string
  phone: string | null
  nickname: string
  role: 'MEMBER' | 'ADMIN'
  grade: MemberGrade
  auctionPoint: number
  balancePoint: number
  wagePoint: number
  referrerId: string | null
  referralCode: string
  bankName: string | null
  bankAccount: string | null
  accountHolder: string | null
  createdAt: string
  updatedAt: string
}

export type ProductRow = {
  id: string
  title: string
  description: string
  imageUrl: string
  category: string
  marketPrice: number
  startPrice: number
  entryFee: number
  maxParticipants: number
  winnersCount: number
  losingReward: number
  status: 'OPEN' | 'CLOSED' | 'DRAWN'
  sortOrder: number
  participantCount: number
  startAt: string
  endAt: string | null
  createdAt: string
}
