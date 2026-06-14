// ===== 공통 UI 컴포넌트 =====

// 헤더
function renderHeader() {
  const u = Store.user
  const isAdmin = u && u.role === 'ADMIN'
  return `
  <header class="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-gray-100">
    <nav class="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
      <a href="#/" class="flex items-center gap-1 text-xl font-extrabold text-brand-orange shrink-0">
        모두모두 <span>🎁</span>
      </a>
      <div class="flex items-center gap-1 sm:gap-2 text-sm">
        ${renderLangSelector()}
        ${u ? `
          ${isAdmin ? `<a href="#/admin" class="hidden sm:inline-flex items-center gap-1 px-3 py-2 rounded-lg text-brand-dark hover:bg-gray-100 font-medium"><i class="fas fa-shield-halved"></i> 관리자</a>` : ''}
          <a href="#/mypage" class="inline-flex items-center gap-1 px-2 sm:px-3 py-2 rounded-lg hover:bg-gray-100 font-medium">
            <i class="fas fa-coins text-brand-gold"></i>
            <span class="hidden sm:inline">${u.nickname}님</span>
          </a>
          <button onclick="doLogout()" class="px-2 sm:px-3 py-2 rounded-lg text-gray-500 hover:bg-gray-100 text-xs sm:text-sm">로그아웃</button>
        ` : `
          <a href="#/auth/login" onclick="event.preventDefault(); Router.navigate('/auth/login')" class="px-3 py-2 rounded-lg hover:bg-gray-100 font-medium cursor-pointer">로그인</a>
          <a href="#/auth/register" onclick="event.preventDefault(); Router.navigate('/auth/register')" class="px-4 py-2 rounded-lg bg-brand-orange text-white font-semibold hover:bg-orange-600 transition cursor-pointer">회원가입</a>
        `}
      </div>
    </nav>
    ${isAdmin ? `<div class="sm:hidden border-t border-gray-100 px-4 py-2 bg-orange-50"><a href="#/admin" class="text-brand-orange font-medium text-sm"><i class="fas fa-shield-halved"></i> 관리자 페이지</a></div>` : ''}
  </header>`
}

// 언어 선택 드롭다운
function renderLangSelector() {
  const cur = (typeof I18N !== 'undefined' ? I18N.langs.find(l => l.code === I18N.lang) : null) || { flag: '🇰🇷', code: 'ko' }
  const items = (typeof I18N !== 'undefined' ? I18N.langs : []).map(l => `
    <button onclick="event.stopPropagation(); selectLang('${l.code}')"
      class="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 ${l.code === cur.code ? 'font-bold text-brand-orange' : 'text-gray-700'}">
      <span>${l.flag}</span> <span>${l.label}</span>
    </button>`).join('')
  return `
  <div class="relative" id="lang-wrap">
    <button onclick="event.stopPropagation(); toggleLangMenu()" aria-label="Language"
      class="inline-flex items-center gap-1 px-2 py-2 rounded-lg hover:bg-gray-100 text-gray-600">
      <i class="fas fa-globe"></i><span class="hidden sm:inline text-xs">${cur.flag}</span>
      <i class="fas fa-chevron-down text-[10px] opacity-60"></i>
    </button>
    <div id="lang-menu" class="hidden absolute end-0 mt-1 w-36 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50 max-h-72 overflow-y-auto">
      ${items}
    </div>
  </div>`
}
function toggleLangMenu() {
  const m = document.getElementById('lang-menu')
  if (!m) return
  m.classList.toggle('hidden')
  if (!m.classList.contains('hidden')) {
    setTimeout(() => document.addEventListener('click', _closeLangMenuOnce, { once: true }), 0)
  }
}
function _closeLangMenuOnce() {
  const m = document.getElementById('lang-menu')
  if (m) m.classList.add('hidden')
}
function selectLang(code) {
  _closeLangMenuOnce()
  if (typeof I18N !== 'undefined') I18N.setLang(code)
}

function renderFooter() {
  return `
  <footer class="mt-16 border-t border-gray-100 bg-white">
    <div class="max-w-6xl mx-auto px-4 py-8 text-center text-sm text-gray-400">
      <div class="text-brand-orange font-bold text-base mb-1">모두모두 🎁</div>
      <p>세계 최초 전원 수익형 공동 구매 경매 쇼핑몰 · 낙찰자는 저렴하게, 미낙찰자는 보상 포인트!</p>
      <div class="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-400 leading-relaxed">
        <p class="font-semibold text-gray-500">큰바구니</p>
        <p>주소 : 경기도 시흥시 역전로 304, 504호(정왕동)</p>
        <p>사업자등록번호 : 806-58-00641</p>
        <p>통신판매업신고번호 : 제 2024 경기시흥 1913호</p>
      </div>
      <p class="mt-4 text-xs">© 2026 ModooModoo Auction Mall. MVP Demo.</p>
    </div>
  </footer>`
}

function layout(content) {
  return renderHeader() + `<main class="max-w-6xl mx-auto px-4 py-6 min-h-[60vh]">${content}</main>` + renderFooter()
}

// ===== 참여자 게이지 (핵심 컴포넌트) =====
function renderGauge(current, max, winnersCount, opts = {}) {
  const size = opts.size || 'lg' // lg | sm
  const pct = Math.round((current / max) * 100)
  const iconSize = size === 'sm' ? 'text-base w-7 h-7' : 'text-xl w-10 h-10 sm:w-12 sm:h-12'
  const cols = size === 'sm' ? 'grid-cols-10' : 'grid-cols-5 sm:grid-cols-10'

  let icons = ''
  for (let i = 0; i < max; i++) {
    const on = i < current
    // 오렌지→레드 그라데이션 (참여순서에 따라)
    const ratio = i / Math.max(max - 1, 1)
    const hue = 24 - ratio * 24 // 24(오렌지) → 0(레드)
    const style = on
      ? `background:hsl(${hue},90%,55%);color:#fff;box-shadow:0 2px 8px hsla(${hue},90%,55%,.4)`
      : 'background:#f1f5f9;color:#cbd5e0'
    icons += `<div class="gauge-icon ${iconSize} rounded-full flex items-center justify-center animate-pop"
                   style="${style};animation-delay:${i * 0.04}s">
                <i class="fas fa-user"></i>
              </div>`
  }

  return `
  <div class="${opts.wrap === false ? '' : 'bg-white rounded-2xl p-4 sm:p-5 border border-gray-100'}">
    <div class="grid ${cols} gap-1.5 sm:gap-2 justify-items-center mb-3">${icons}</div>
    <div class="flex items-center justify-between text-sm mb-1.5">
      <span class="font-bold text-brand-orange">${current} / ${max} 명 참여 중 <span class="text-gray-400 font-normal">(${pct}%)</span></span>
      <span class="text-xs text-gray-500">🏆 당첨 ${winnersCount}명 / 정원 ${max}명</span>
    </div>
    <div class="h-2.5 bg-gray-100 rounded-full overflow-hidden">
      <div class="h-full rounded-full transition-all duration-500"
           style="width:${pct}%;background:linear-gradient(90deg,#FF6B35,#ef4444)"></div>
    </div>
  </div>`
}

// 미니 게이지 (카드용)
function renderMiniGauge(current, max) {
  const pct = Math.round((current / max) * 100)
  return `
  <div class="mt-2">
    <div class="flex items-center justify-between text-xs mb-1">
      <span class="text-brand-orange font-semibold"><i class="fas fa-users"></i> 현재 ${current}명 참여 중</span>
      <span class="text-gray-400">${pct}%</span>
    </div>
    <div class="h-2 bg-gray-100 rounded-full overflow-hidden">
      <div class="h-full rounded-full transition-all" style="width:${pct}%;background:linear-gradient(90deg,#FF6B35,#ef4444)"></div>
    </div>
  </div>`
}

// 상품 카드 (featured=true 이면 '추천 제품'으로 강하게 강조)
function renderProductCard(p, featured) {
  const discount = Math.round((1 - p.startPrice / p.marketPrice) * 100)
  const isDrawn = p.status === 'DRAWN'
  // 추천 카드: 주황 링 + 강한 그림자 + 상단 추천 배지
  const featuredWrap = featured
    ? 'ring-2 ring-brand-orange shadow-lg shadow-orange-200/60 relative'
    : 'border border-gray-100'
  return `
  <a href="#/products/${p.id}" class="group bg-white rounded-2xl overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300 block ${featuredWrap}">
    ${featured ? `<div class="absolute z-20 top-0 left-1/2 -translate-x-1/2 bg-gradient-to-r from-brand-orange to-red-500 text-white text-xs font-extrabold px-3 py-1 rounded-b-lg shadow-md flex items-center gap-1 whitespace-nowrap"><i class="fas fa-star animate-pulse"></i> 추천 제품</div>` : ''}
    <div class="relative aspect-square overflow-hidden bg-gray-100">
      <img src="${p.imageUrl}" alt="${p.title}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy"
           onerror="this.src='https://placehold.co/800x800/FF6B35/fff?text=모두모두'" />
      <span class="absolute top-3 left-3 bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow">${discount}% OFF</span>
      ${isDrawn ? '<span class="absolute top-3 right-3 bg-brand-dark text-white text-xs font-bold px-2.5 py-1 rounded-full">추첨완료</span>'
                : '<span class="absolute top-3 right-3 bg-green-500 text-white text-xs font-bold px-2.5 py-1 rounded-full animate-pulse">진행중</span>'}
    </div>
    <div class="p-4">
      <span class="text-sm text-gray-400">${p.category}</span>
      <h3 class="font-bold text-lg mt-0.5 mb-2 line-clamp-1">${featured ? '<i class="fas fa-crown text-brand-orange mr-1"></i>' : ''}${p.title}</h3>
      <div class="flex items-baseline gap-2">
        <span class="text-gray-400 text-base line-through-soft">${won(p.marketPrice)}원</span>
      </div>
      <div class="flex items-baseline gap-1 mt-1">
        <span class="text-sm text-gray-500">시작가</span>
        <span class="text-brand-orange font-extrabold text-3xl leading-tight">${won(p.startPrice)}원</span>
      </div>
      ${renderMiniGauge(p.participants || 0, p.maxParticipants)}
      <div class="mt-4 flex items-center justify-center">
        <span class="text-base font-bold text-white bg-brand-orange px-10 py-3 rounded-xl group-hover:bg-orange-600 transition">참여하기</span>
      </div>
    </div>
  </a>`
}

// ===== 모달 =====
function openModal(html, opts = {}) {
  const root = document.getElementById('modal-root')
  root.innerHTML = `
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4" onclick="${opts.dismissable === false ? '' : 'closeModal(event)'}">
    <div class="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fadeup"></div>
    <div class="relative bg-white rounded-2xl shadow-2xl w-full ${opts.maxWidth || 'max-w-md'} max-h-[90vh] overflow-y-auto animate-pop" onclick="event.stopPropagation()">
      ${html}
    </div>
  </div>`
}
function closeModal(e) {
  if (e && e.target !== e.currentTarget) return
  document.getElementById('modal-root').innerHTML = ''
}

async function doLogout() {
  await api.post('/auth/logout')
  Store.user = null
  toast('로그아웃 되었습니다.', 'info')
  Router.navigate('/')
  render()
}

function renderNotFound() {
  return layout(`<div class="text-center py-24">
    <div class="text-6xl mb-4">🔍</div>
    <h2 class="text-xl font-bold mb-2">페이지를 찾을 수 없어요</h2>
    <a href="#/" class="text-brand-orange font-medium">← 홈으로 돌아가기</a>
  </div>`)
}

function renderLoading() {
  return layout(`<div class="flex flex-col items-center justify-center py-32 text-gray-400">
    <i class="fas fa-spinner fa-spin text-3xl text-brand-orange mb-3"></i>
    <p>불러오는 중...</p>
  </div>`)
}

function requireLoginRedirect() {
  toast('로그인이 필요합니다.', 'warn')
  Router.navigate('/auth/login')
}

// ===== 회원 등급 (일반회원/VIP/VVIP/대리점/총판/이사) =====
const GRADE_INFO = {
  NORMAL:      { label: '일반회원', icon: 'fa-user',            cls: 'bg-gray-100 text-gray-600',     color: '#94a3b8' },
  VIP:         { label: 'VIP',      icon: 'fa-star',            cls: 'bg-amber-100 text-amber-700',   color: '#f59e0b' },
  VVIP:        { label: 'VVIP',     icon: 'fa-crown',           cls: 'bg-yellow-100 text-yellow-800', color: '#eab308' },
  AGENCY:      { label: '대리점',   icon: 'fa-store',           cls: 'bg-blue-100 text-blue-700',     color: '#3b82f6' },
  DISTRIBUTOR: { label: '총판',     icon: 'fa-warehouse',       cls: 'bg-purple-100 text-purple-700', color: '#a855f7' },
  DIRECTOR:    { label: '이사',     icon: 'fa-user-tie',        cls: 'bg-rose-100 text-rose-700',     color: '#f43f5e' },
}
const GRADE_ORDER = ['NORMAL', 'VIP', 'VVIP', 'AGENCY', 'DISTRIBUTOR', 'DIRECTOR']
function gradeInfo(g) { return GRADE_INFO[g] || GRADE_INFO.NORMAL }
// VIP 이상 등급(일반회원 NORMAL 제외) 여부 — 조직도 활성/비활성 구분 표시 대상 판정
function isVipOrAbove(g) { return ['VIP', 'VVIP', 'AGENCY', 'DISTRIBUTOR', 'DIRECTOR'].includes(String(g)) }
// 등급별 색상(hex) — SVG 조직도 등에 사용
function gradeColor(g) { return gradeInfo(g).color }
// 등급 뱃지 (작은 라벨)
function gradeBadge(g) {
  const i = gradeInfo(g)
  return `<span class="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${i.cls}"><i class="fas ${i.icon}"></i> ${i.label}</span>`
}

// ===== 조직도 트리 레이아웃 (서브트리 폭 기반 — 노드/추천인 수가 많아도 절대 겹치지 않음) =====
// rootId 부터 byParent[parentId] = [children...] 를 따라가며 각 노드의 {x,y,depth} 좌표 계산.
// 핵심: 각 서브트리가 차지하는 가로 폭(leaf 수 기준)을 먼저 구하고, 형제 서브트리를
// 폭만큼 좌→우로 나란히 배치 → 부모는 자식 묶음의 중앙. 어떤 트리 모양에서도 충돌 없음.
function buildTreeLayout(rootId, byParent, opts) {
  const NODE_W = opts.NODE_W, NODE_H = opts.NODE_H
  const H_GAP = opts.H_GAP, V_GAP = opts.V_GAP
  const stepX = NODE_W + H_GAP            // leaf 한 칸이 차지하는 가로 간격
  const positions = {}
  let cursor = 0                          // 다음 leaf 가 놓일 칸 인덱스

  // 재귀: 노드 서브트리를 배치하고, 그 노드의 가로 중심 칸(centerSlot)을 반환
  function place(id, depth) {
    const children = byParent[id] || []
    let centerSlot
    if (children.length === 0) {
      centerSlot = cursor
      cursor += 1                         // leaf 는 한 칸 점유
    } else {
      const childSlots = children.map(ch => place(ch.id, depth + 1))
      // 부모는 첫/마지막 자식 중심의 평균(자식 묶음 중앙)
      centerSlot = (childSlots[0] + childSlots[childSlots.length - 1]) / 2
    }
    positions[id] = {
      x: centerSlot * stepX,
      y: depth * (NODE_H + V_GAP),
      depth,
    }
    return centerSlot
  }
  place(rootId, 0)

  const xs = Object.values(positions).map(p => p.x)
  const ys = Object.values(positions).map(p => p.y)
  const maxX = (xs.length ? Math.max(...xs) : 0) + NODE_W
  const maxY = (ys.length ? Math.max(...ys) : 0) + NODE_H
  const svgW = Math.max(maxX + 20, 320)
  const svgH = maxY + 20
  return { positions, svgW, svgH }
}
