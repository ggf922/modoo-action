// ============================================================
// 초간단 인메모리 TTL 캐시 (서버리스 함수 인스턴스 스코프)
// 목적: 거의 변하지 않는 읽기 트래픽(config, 공개 상품목록)을 짧은 TTL로 캐싱하여
//       동시접속 1만 규모에서 DB(Supabase) 직격 쿼리를 대폭 감소시킨다.
//
// 특성:
//  - Vercel 함수 인스턴스마다 독립 캐시 → 인스턴스가 살아있는 동안(수초~수분) 재사용.
//  - TTL 이 짧아(수초) 데이터 신선도와 DB 부하 절감의 균형을 맞춘다.
//  - 쓰기(상품 변경/설정 변경) 시 invalidate() 로 즉시 무효화 가능.
// ============================================================

type Entry = { value: any; expires: number }

const store = new Map<string, Entry>()

/** 캐시에서 가져오거나, 없으면 loader 실행 후 ttlMs 동안 캐싱 */
export async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const hit = store.get(key)
  if (hit && hit.expires > now) {
    return hit.value as T
  }
  const value = await loader()
  store.set(key, { value, expires: now + ttlMs })
  return value
}

/** 특정 키(또는 prefix로 시작하는 모든 키) 무효화 */
export function invalidate(keyOrPrefix: string): void {
  if (store.has(keyOrPrefix)) {
    store.delete(keyOrPrefix)
    return
  }
  // prefix 매칭 무효화 (예: 'products' → 'products', 'products:OPEN' 등 모두)
  for (const k of store.keys()) {
    if (k.startsWith(keyOrPrefix)) store.delete(k)
  }
}

/** 전체 캐시 비우기 */
export function clearCache(): void {
  store.clear()
}
