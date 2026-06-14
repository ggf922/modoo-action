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

/** batch 트랜잭션에서 requireRows 조건이 깨졌을 때 던지는 가드 에러(롤백 유도) */
export class BatchGuardError extends Error {
  constructor(public code: string) {
    super(code)
    this.name = 'BatchGuardError'
  }
}

// SQLite 식별자(따옴표 없는 camelCase 컬럼)를 PostgreSQL용 "큰따옴표" 식별자로 변환하기 위한
// 실제 DB 컬럼명 목록. PostgreSQL은 따옴표가 없으면 대문자를 소문자로 접기 때문에 필요하다.
const QUOTED_COLUMNS = [
  // users
  'auctionPoint', 'balancePoint', 'wagePoint', 'referrerId', 'referralCode',
  'bankName', 'bankAccount', 'accountHolder', 'createdAt', 'updatedAt',
  'subscriptionActive', 'subscriptionUntil',
  // subscription_payments
  'paidAt',
  // products
  'imageUrl', 'marketPrice', 'startPrice', 'entryFee', 'maxParticipants',
  'winnersCount', 'losingReward', 'sortOrder', 'participantCount', 'startAt', 'endAt',
  'productUrl',
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
  // 대규모 동시접속(목표 1만) 대비 서버리스 풀 설정.
  //  - max:1        : Vercel 함수 인스턴스당 연결 1개. 실제 풀링은 Supabase Pooler가 담당.
  //                   (함수가 동시 N개 뜨면 Pooler 연결도 N개 — 그래서 Transaction Pooler 6543 필수)
  //  - prepare:false: Transaction Pooler(6543) 및 Session Pooler(5432) 모두 호환.
  //  - idle_timeout : 서버리스에서 좀비 연결 방지(짧게).
  //  - connect_timeout: 풀러 혼잡 시 빠른 실패 → 재시도/에러 전파.
  //  - max_lifetime : 장수명 연결 누수 방지.
  //
  // ⚠️ 운영(1만 동접) 권장 DATABASE_URL: Transaction Pooler(포트 6543)
  //    예) postgresql://postgres.<ref>:<pw>@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres
  //    Transaction Pooler 는 짧은 트랜잭션 단위로 연결을 재활용 → 동시 처리량이 Session(5432)보다 훨씬 큼.
  const isTransactionPooler = /:6543\//.test(connectionString)
  _sql = postgres(connectionString, {
    max: 1,
    idle_timeout: isTransactionPooler ? 10 : 20,
    connect_timeout: 10,
    max_lifetime: 60 * 30,  // 30분
    prepare: false,
    // ⚠️ 중요: PostgreSQL BIGINT(int8, OID 20)는 postgres.js 기본값이 "문자열"이다.
    //   포인트/가격 컬럼이 모두 BIGINT 라서, 문자열로 받으면 `auctionPoint < entryFee`
    //   같은 비교가 사전순 문자열 비교가 되어 ("10000" < "500" === true) 치명적 버그가 난다.
    //   포인트/가격 값은 JS 안전정수 범위(2^53) 내이므로 number 로 파싱한다.
    types: {
      bigint: {
        to: 20,
        from: [20],
        serialize: (v: number | bigint) => v.toString(),
        parse: (v: string) => Number(v),
      },
    },
  })
  return _sql
}

/** D1PreparedStatement 호환 객체 */
export class PreparedStatement {
  private params: any[] = []
  // batch(트랜잭션) 내에서 이 statement 의 affected rows 가 0이면 트랜잭션 전체를 롤백한다.
  // (예: 정원 조건부 UPDATE 가 0행 → 정원 초과로 입찰 실패 → bids INSERT 등 모두 취소)
  _requireRows = false
  constructor(
    private sql: ReturnType<typeof postgres>,
    private query: string
  ) {}

  /** batch 내에서 영향받은 행이 0이면 트랜잭션을 롤백하도록 표시 */
  requireRows(): PreparedStatement {
    this._requireRows = true
    return this
  }

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
        // requireRows 표시된 statement 가 0행이면 트랜잭션 롤백(전체 취소)
        if (st._requireRows && (rows.count ?? 0) === 0) {
          throw new BatchGuardError('REQUIRE_ROWS_FAILED')
        }
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
