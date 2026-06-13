// ===== API 헬퍼 & 전역 상태 =====
const api = axios.create({ baseURL: '/api' })

const Store = {
  user: null, // 현재 로그인 사용자 (포인트 포함)
  config: null,
  async loadMe() {
    try {
      const { data } = await api.get('/auth/me')
      this.user = data.user
    } catch {
      this.user = null
    }
    return this.user
  },
  async loadConfig() {
    try {
      const { data } = await api.get('/config/public')
      this.config = data.config
    } catch {}
    return this.config
  },
}

// 숫자 포맷
function won(n) { return Number(n || 0).toLocaleString('ko-KR') }
function fmtDate(s) {
  if (!s) return '-'
  const d = new Date(s.replace(' ', 'T') + (s.includes('T') ? '' : 'Z'))
  if (isNaN(d)) return s
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
}
function fmtDateTime(s) {
  if (!s) return '-'
  const d = new Date(s.replace(' ', 'T') + (s.includes('T') ? '' : 'Z'))
  if (isNaN(d)) return s
  return d.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// 토스트
function toast(msg, type = 'info') {
  const root = document.getElementById('toast-root')
  const colors = {
    info: 'bg-brand-dark', success: 'bg-green-600', error: 'bg-red-500', warn: 'bg-brand-orange',
  }
  const el = document.createElement('div')
  el.className = `${colors[type] || colors.info} text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium animate-fadeup max-w-xs`
  el.innerHTML = msg
  root.appendChild(el)
  setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300) }, 2800)
}

// 라우터 (해시 기반)
const Router = {
  routes: [],
  add(pattern, handler) { this.routes.push({ pattern, handler }) },
  navigate(path) {
    const target = '#' + path
    // 목표 해시가 현재와 동일하면 hashchange가 발생하지 않으므로 직접 다시 렌더
    if (window.location.hash === target) this.resolve()
    else window.location.hash = path
  },
  async resolve() {
    const hash = window.location.hash.slice(1) || '/'
    const [path] = hash.split('?')
    for (const r of this.routes) {
      const m = matchRoute(r.pattern, path)
      if (m) {
        window.scrollTo(0, 0)
        await r.handler(m.params, getQuery())
        return
      }
    }
    document.getElementById('app').innerHTML = renderNotFound()
  },
}
function matchRoute(pattern, path) {
  const pp = pattern.split('/').filter(Boolean)
  const pa = path.split('/').filter(Boolean)
  if (pp.length !== pa.length) return null
  const params = {}
  for (let i = 0; i < pp.length; i++) {
    if (pp[i].startsWith(':')) params[pp[i].slice(1)] = decodeURIComponent(pa[i])
    else if (pp[i] !== pa[i]) return null
  }
  return { params }
}
function getQuery() {
  const hash = window.location.hash.slice(1)
  const qi = hash.indexOf('?')
  if (qi === -1) return {}
  return Object.fromEntries(new URLSearchParams(hash.slice(qi + 1)))
}

function errMsg(e) {
  return e?.response?.data?.error || '오류가 발생했습니다. 다시 시도해주세요.'
}
