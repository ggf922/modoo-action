// Cloudflare 바인딩 타입
export type Bindings = {
  DB: D1Database
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

export type UserRow = {
  id: string
  email: string
  password: string
  name: string
  phone: string | null
  nickname: string
  role: 'MEMBER' | 'ADMIN'
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
  startAt: string
  endAt: string | null
  createdAt: string
}
