// ============================================================
// D1 → Supabase(PostgreSQL) 어댑터
// 기존 코드의 c.env.DB.prepare().bind().first()/.all()/.run() 및
// DB.batch([...]) 인터페이스를 그대로 흉내내어 PostgreSQL에 연결한다.
// 이를 통해 라우트/로직 코드(190여 곳)를 거의 수정하지 않고 마이그레이션한다.
//
// 드라이버: postgres (postgres.js) — Vercel Functions(서버리스)에서
// Supabase Transaction Pooler(포트 6543)에 연결.
// ============================================================
import postgres from 'postgres'

// SQLite 식별자(따옴표 없는 camelCase 컬럼)를 PostgreSQL용 "큰따옴표" 식별자로 변환하기 위한
// 실제 DB 컬럼명 목록. PostgreSQL은 따옴표가 없으면 대문자를 소문자로 접기 때문에 필요하다.
const QUOTED_COLUMNS = [
  // users
  'auctionPoint', 'balancePoint', 'wagePoint', 'referrerId', 'referralCode',
  'bankName', 'bankAccount', 'accountHolder', 'createdAt', 'updatedAt',
  // products
  'imageUrl', 'marketPrice', 'startPrice', 'entryFee', 'maxParticipants',
  'winnersCount', 'losingReward', 'sortOrder', 'startAt', 'endAt',
  // bids
  'userId', 'productId', 'pointsUsed', 'isWinner',
  // winners
  'finalPrice', 'drawnAt', 'recipientName', 'recipientPhone', 'postalCode',
  'deliveryMemo', 'shippingStatus', 'shippingSubmittedAt',
  // point_history
  'pointKind',
  // withdrawals / charge_requests
  'requestedAt', 'processedAt',
  // site_config
  'defaultWinners', 'defaultLosingReward', 'minWithdrawAmount', 'referralBonus',
]
// 길이 긴 것부터 치환(부분 일치 방지)
const COLUMN_RE = new RegExp(
  `\\b(${[...QUOTED_COLUMNS].sort((a, b) => b.length - a.length).join('|')})\\b`,
  'g'
)

/**
 * SQLite SQL 문자열을 PostgreSQL 호환으로 변환한다.
 *  - ?            → $1, $2, ...  (순서대로)
 *  - datetime('now')            → now()
 *  - date(x)                    → date(x)  (식별자만 따옴표 처리됨)
 *  - LIKE                       → ILIKE    (대소문자 무시 검색)
 *  - camelCase 컬럼             → "camelCase"
 */
function translate(sql: string): string {
  let out = sql

  // datetime('now') → now()  (작은따옴표/큰따옴표 모두 대응)
  out = out.replace(/datetime\(\s*['"]now['"]\s*\)/gi, 'now()')

  // LIKE → ILIKE (대소문자 무시). 이미 ILIKE인 경우는 건드리지 않음.
  out = out.replace(/(?<![A-Za-z])LIKE(?![A-Za-z])/g, 'ILIKE')

  // camelCase 컬럼명 → "camelCase"  (이미 따옴표가 있으면 중복 방지)
  out = out.replace(COLUMN_RE, (m) => `"${m}"`)
  out = out.replace(/""([A-Za-z]+)""/g, '"$1"') // 혹시 중복된 따옴표 정리

  // ? 플레이스홀더 → $1, $2, ...
  let i = 0
  out = out.replace(/\?/g, () => `$${++i}`)

  return out
}

// ---- D1 호환 결과 타입 ----
export interface D1Result<T = any> {
  results: T[]
  success: boolean
  meta: { changes?: number; duration?: number }
}

// postgres.js 클라이언트는 모듈 스코프에 캐시 (서버리스 콜드스타트 간 재사용)
let _sql: ReturnType<typeof postgres> | null = null
function getSql(connectionString: string) {
  if (_sql) return _sql
  if (!connectionString) {
    // DB 미사용 경로(정적 SPA 셸 등)는 여기까지 오지 않는다.
    // 실제 쿼리가 필요한 시점에 URL 이 없으면 의미 있는 에러를 던진다.
    throw new Error('DATABASE_URL 환경변수가 설정되지 않았습니다. (Vercel → Settings → Environment Variables)')
  }
  _sql = postgres(connectionString, {
    max: 1,                 // 서버리스: 함수당 연결 1개 (Supabase Pooler가 풀링 담당)
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,         // Transaction Pooler 호환 (prepared statement 비활성)
  })
  return _sql
}

/** D1PreparedStatement 호환 객체 */
export class PreparedStatement {
  private params: any[] = []
  constructor(
    private sql: ReturnType<typeof postgres>,
    private query: string
  ) {}

  bind(...params: any[]): PreparedStatement {
    this.params = params.map((p) => (p === undefined ? null : p))
    return this
  }

  // 변환된 쿼리 + 파라미터 (batch 트랜잭션에서 사용)
  _compiled(): { text: string; params: any[] } {
    return { text: translate(this.query), params: this.params }
  }

  async first<T = any>(): Promise<T | null> {
    const { text, params } = this._compiled()
    const rows = await this.sql.unsafe(text, params)
    return (rows[0] as T) ?? null
  }

  async all<T = any>(): Promise<D1Result<T>> {
    const { text, params } = this._compiled()
    const rows = await this.sql.unsafe(text, params)
    return { results: rows as unknown as T[], success: true, meta: { changes: rows.count } }
  }

  async run<T = any>(): Promise<D1Result<T>> {
    const { text, params } = this._compiled()
    const rows = await this.sql.unsafe(text, params)
    return { results: rows as unknown as T[], success: true, meta: { changes: rows.count } }
  }
}

/** D1Database 호환 객체 */
export class PgDatabase {
  // 연결 문자열만 보관하고, 실제 sql 클라이언트는 첫 쿼리 시점에 lazy 하게 생성한다.
  constructor(private connectionString: string) {}

  private get sql(): ReturnType<typeof postgres> {
    return getSql(this.connectionString)
  }

  prepare(query: string): PreparedStatement {
    return new PreparedStatement(this.sql, query)
  }

  /** D1.batch([...]) 호환 — 단일 트랜잭션으로 순차 실행 */
  async batch<T = any>(statements: PreparedStatement[]): Promise<D1Result<T>[]> {
    return this.sql.begin(async (tx) => {
      const out: D1Result<T>[] = []
      for (const st of statements) {
        const { text, params } = st._compiled()
        const rows = await tx.unsafe(text, params)
        out.push({ results: rows as unknown as T[], success: true, meta: { changes: rows.count } })
      }
      return out
    }) as Promise<D1Result<T>[]>
  }
}

/** 환경변수(DATABASE_URL)로 D1 호환 DB 인스턴스 생성
 *  URL 이 비어 있어도 여기서 throw 하지 않는다(정적 SPA 셸 등 DB 미사용 경로 허용).
 *  실제 쿼리 시점(getSql)에 URL 이 없으면 의미 있는 에러를 던진다. */
export function createDb(connectionString: string): PgDatabase {
  return new PgDatabase(connectionString)
}

// ---- D1 호환 타입 별칭 (기존 코드의 D1Database/D1PreparedStatement 참조 대체) ----
export type D1Database = PgDatabase
export type D1PreparedStatement = PreparedStatement
