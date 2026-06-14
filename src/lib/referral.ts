import { genId } from './auth'

// ── 활성/추천보상 관련 스키마 보정 (Supabase 수동 마이그레이션 불가 → 런타임 ensure) ──
//   active            : 회원 활성(1)/비활성(0). 관리자가 회원관리에서 토글한다. 기본 1(활성).
//   referralRewardPaid: 이 회원으로 인한 "추천 보상"이 추천인에게 이미 지급됐는지(1) 여부.
//                       VIP 이상 + 활성이 되는 최초 1회에만 지급되고, 이후 구독을 반복해도 재지급되지 않는다.
let _memberFlagsReady = false
export async function ensureMemberFlags(DB: any) {
  if (_memberFlagsReady) return
  // 신규 컬럼 추가 여부를 컬럼 존재 검사로 판별(이미 있으면 일회성 보정을 건너뛴다)
  const col = await DB.prepare(
    `SELECT 1 AS exists FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'referralrewardpaid' LIMIT 1`
  ).first<{ exists: number }>().catch(() => null)
  const firstTime = !col

  await DB.prepare(`ALTER TABLE users ADD COLUMN IF NOT EXISTS active INTEGER NOT NULL DEFAULT 1`).run()
  await DB.prepare(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referralRewardPaid INTEGER NOT NULL DEFAULT 0`).run()

  // ── 일회성 보정 ──
  //   이 컬럼이 처음 생성되는 순간에만 실행한다.
  //   새 정책 도입 이전(가입 즉시 추천 보상 지급) 회원 중 "이미 VIP 이상"인 회원은
  //   과거에 가입 보상을 이미 받았다고 보고 referralRewardPaid=1 로 막아 중복 지급을 방지한다.
  if (firstTime) {
    await DB.prepare(
      `UPDATE users SET referralRewardPaid = 1
       WHERE grade IN ('VIP', 'VVIP', 'AGENCY', 'DISTRIBUTOR', 'DIRECTOR')`
    ).run()
  }

  _memberFlagsReady = true
}

// VIP 이상으로 간주하는 등급(추천 보상 지급 조건). NORMAL(일반회원)만 제외.
const VIP_OR_ABOVE = ['VIP', 'VVIP', 'AGENCY', 'DISTRIBUTOR', 'DIRECTOR']

/**
 * 피추천자(memberId)가 "VIP 이상 + 활성" 상태가 됐을 때, 추천인에게 추천 보상을 단 1회만 지급한다.
 * - 이미 지급된 적이 있으면(referralRewardPaid=1) 아무 것도 하지 않는다(구독 반복·재승급에도 재지급 없음).
 * - 추천인이 없거나, 조건 미충족이면 지급하지 않는다.
 * 등급 변경 / 활성 토글 / 구독 활성화 등 상태가 바뀌는 시점마다 호출하면 된다.
 * @returns 지급했으면 true, 아니면 false
 */
export async function maybePayReferralReward(DB: any, memberId: string): Promise<boolean> {
  await ensureMemberFlags(DB)

  const m = await DB.prepare(
    `SELECT id, nickname, grade, active, referralRewardPaid, referrerId FROM users WHERE id = ?`
  ).bind(memberId).first<{
    id: string; nickname: string; grade: string;
    active: number; referralRewardPaid: number; referrerId: string | null
  }>()
  if (!m) return false

  // 조건: 아직 미지급 + VIP 이상 + 활성 + 추천인 존재
  if (m.referralRewardPaid === 1) return false
  if (!VIP_OR_ABOVE.includes(String(m.grade))) return false
  if (Number(m.active) !== 1) return false
  if (!m.referrerId) return false

  // 추천인 존재 확인
  const referrer = await DB.prepare(`SELECT id FROM users WHERE id = ?`).bind(m.referrerId).first<{ id: string }>()
  if (!referrer) {
    // 추천인이 사라진 경우라도 더 이상 시도하지 않도록 지급 플래그만 세워둔다.
    await DB.prepare(`UPDATE users SET referralRewardPaid = 1 WHERE id = ?`).bind(memberId).run()
    return false
  }

  // 추천 보상 금액 (사이트 설정의 referralBonus 사용)
  const config = await DB.prepare(`SELECT referralBonus FROM site_config LIMIT 1`).first<{ referralBonus: number }>()
  const referralBonus = config?.referralBonus ?? 500

  // 멱등 보장: referralRewardPaid 0 → 1 로 바뀌는 단 한 번만 지급되도록 조건부 UPDATE 사용
  const flagSet = await DB.prepare(
    `UPDATE users SET referralRewardPaid = 1 WHERE id = ? AND referralRewardPaid = 0`
  ).bind(memberId).run()
  // 동시 호출로 이미 다른 곳에서 지급 처리됐다면(changes=0) 중복 지급하지 않는다.
  const changed = flagSet?.meta?.changes ?? flagSet?.changes ?? 0
  if (changed === 0) return false

  await DB.batch([
    DB.prepare(`UPDATE users SET auctionPoint = auctionPoint + ? WHERE id = ?`).bind(referralBonus, referrer.id),
    DB.prepare(
      `INSERT INTO point_history (id, userId, type, pointKind, amount, description, createdAt)
       VALUES (?, ?, 'REFERRAL', 'AUCTION', ?, ?, datetime('now'))`
    ).bind(genId('ph-'), referrer.id, referralBonus, `추천 보상 (VIP 승급: ${m.nickname})`),
  ])

  return true
}
