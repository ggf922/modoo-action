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
        ${u ? `
          ${isAdmin ? `<a href="#/admin" class="hidden sm:inline-flex items-center gap-1 px-3 py-2 rounded-lg text-brand-dark hover:bg-gray-100 font-medium"><i class="fas fa-shield-halved"></i> 관리자</a>` : ''}
          <a href="#/mypage" class="inline-flex items-center gap-1 px-2 sm:px-3 py-2 rounded-lg hover:bg-gray-100 font-medium">
            <i class="fas fa-coins text-brand-gold"></i>
            <span class="hidden sm:inline">${u.nickname}님</span>
          </a>
          <button onclick="doLogout()" class="px-2 sm:px-3 py-2 rounded-lg text-gray-500 hover:bg-gray-100 text-xs sm:text-sm">로그아웃</button>
        ` : `
          <a href="#/auth/login" class="px-3 py-2 rounded-lg hover:bg-gray-100 font-medium">로그인</a>
          <a href="#/auth/register" class="px-4 py-2 rounded-lg bg-brand-orange text-white font-semibold hover:bg-orange-600 transition">회원가입</a>
        `}
      </div>
    </nav>
    ${isAdmin ? `<div class="sm:hidden border-t border-gray-100 px-4 py-2 bg-orange-50"><a href="#/admin" class="text-brand-orange font-medium text-sm"><i class="fas fa-shield-halved"></i> 관리자 페이지</a></div>` : ''}
  </header>`
}

function renderFooter() {
  return `
  <footer class="mt-16 border-t border-gray-100 bg-white">
    <div class="max-w-6xl mx-auto px-4 py-8 text-center text-sm text-gray-400">
      <div class="text-brand-orange font-bold text-base mb-1">모두모두 🎁</div>
      <p>세계 최초 전원 수익형 공동 구매 경매 쇼핑몰 · 낙찰자는 저렴하게, 미낙찰자는 보상 포인트!</p>
      <p class="mt-2 text-xs">© 2026 ModooModoo Auction Mall. MVP Demo.</p>
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

// 상품 카드
function renderProductCard(p) {
  const discount = Math.round((1 - p.startPrice / p.marketPrice) * 100)
  const isDrawn = p.status === 'DRAWN'
  return `
  <a href="#/products/${p.id}" class="group bg-white rounded-2xl overflow-hidden border border-gray-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 block">
    <div class="relative aspect-[4/3] overflow-hidden bg-gray-100">
      <img src="${p.imageUrl}" alt="${p.title}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy"
           onerror="this.src='https://placehold.co/600x450/FF6B35/fff?text=모두모두'" />
      <span class="absolute top-3 left-3 bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow">${discount}% OFF</span>
      ${isDrawn ? '<span class="absolute top-3 right-3 bg-brand-dark text-white text-xs font-bold px-2.5 py-1 rounded-full">추첨완료</span>'
                : '<span class="absolute top-3 right-3 bg-green-500 text-white text-xs font-bold px-2.5 py-1 rounded-full animate-pulse">진행중</span>'}
    </div>
    <div class="p-4">
      <span class="text-xs text-gray-400">${p.category}</span>
      <h3 class="font-bold text-base mt-0.5 mb-2 line-clamp-1">${p.title}</h3>
      <div class="flex items-baseline gap-2">
        <span class="text-gray-400 text-sm line-through-soft">${won(p.marketPrice)}원</span>
      </div>
      <div class="flex items-baseline gap-1 mt-0.5">
        <span class="text-xs text-gray-500">시작가</span>
        <span class="text-brand-orange font-extrabold text-xl">${won(p.startPrice)}원</span>
      </div>
      ${renderMiniGauge(p.participants || 0, p.maxParticipants)}
      <div class="mt-3 flex items-center justify-end">
        <span class="text-sm font-bold text-white bg-brand-orange px-4 py-2 rounded-lg group-hover:bg-orange-600 transition">참여하기</span>
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
    <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-pop" onclick="event.stopPropagation()">
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
