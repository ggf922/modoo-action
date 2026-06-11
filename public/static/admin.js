// ===== 관리자 페이지 =====
function adminGuard() {
  if (!Store.user) { requireLoginRedirect(); return false }
  if (Store.user.role !== 'ADMIN') { toast('관리자 권한이 필요합니다.', 'error'); Router.navigate('/'); return false }
  return true
}

function adminLayout(active, content) {
  const tabs = [
    ['/admin', 'fa-gauge', '대시보드'],
    ['/admin/products', 'fa-box', '상품관리'],
    ['/admin/members', 'fa-users', '회원관리'],
    ['/admin/withdrawals', 'fa-money-bill-transfer', '출금관리'],
    ['/admin/config', 'fa-gear', '설정'],
  ]
  const nav = tabs.map(([href, icon, label]) =>
    `<a href="#${href}" class="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap ${active===href ? 'bg-brand-orange text-white' : 'text-gray-600 hover:bg-gray-100'}">
      <i class="fas ${icon}"></i> ${label}</a>`).join('')
  return layout(`
    <div class="flex items-center gap-2 mb-5">
      <span class="w-9 h-9 rounded-xl bg-brand-dark text-white flex items-center justify-center"><i class="fas fa-shield-halved"></i></span>
      <h1 class="text-xl font-extrabold">관리자 대시보드</h1>
    </div>
    <div class="flex gap-2 mb-6 overflow-x-auto pb-1">${nav}</div>
    <div>${content}</div>`)
}

// 대시보드
async function pageAdmin() {
  if (!adminGuard()) return
  document.getElementById('app').innerHTML = renderLoading()
  const { data } = await api.get('/admin/stats')

  const kpi = (icon, color, label, value, suffix='') => `
    <div class="bg-white rounded-2xl border border-gray-100 p-5">
      <div class="flex items-center gap-2 text-gray-400 text-sm mb-1"><i class="fas ${icon}" style="color:${color}"></i> ${label}</div>
      <div class="text-2xl font-extrabold">${won(value)}${suffix}</div>
    </div>`

  document.getElementById('app').innerHTML = adminLayout('/admin', `
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      ${kpi('fa-users', '#FF6B35', '전체 회원', data.totalUsers, '명')}
      ${kpi('fa-box', '#3b82f6', '경매 상품', data.totalProducts, '개')}
      ${kpi('fa-fire', '#22c55e', '진행중 경매', data.openProducts, '개')}
      ${kpi('fa-gavel', '#FFC107', '총 참여', data.totalBids, '회')}
      ${kpi('fa-trophy', '#FF6B35', '총 낙찰', data.totalWinners, '건')}
      ${kpi('fa-hourglass-half', '#ef4444', '대기 출금', data.pendingWithdrawals, '건')}
      ${kpi('fa-credit-card', '#3b82f6', '총 충전액', data.totalCharged, 'P')}
      ${kpi('fa-gift', '#22c55e', '총 보상지급', data.totalRewards, 'P')}
    </div>
    <div class="grid lg:grid-cols-2 gap-4">
      <div class="bg-white rounded-2xl border border-gray-100 p-5">
        <h3 class="font-bold mb-3 text-sm">카테고리별 상품</h3>
        <canvas id="chart-category" height="200"></canvas>
      </div>
      <div class="bg-white rounded-2xl border border-gray-100 p-5">
        <h3 class="font-bold mb-3 text-sm">일별 신규 가입 (최근 7일)</h3>
        <canvas id="chart-users" height="200"></canvas>
      </div>
    </div>`)

  await loadChartJs()
  const catData = data.byCategory
  new Chart(document.getElementById('chart-category'), {
    type: 'doughnut',
    data: { labels: catData.map(c => c.category), datasets: [{ data: catData.map(c => c.cnt),
      backgroundColor: ['#FF6B35','#FFC107','#3b82f6','#22c55e','#ef4444','#a855f7'] }] },
    options: { plugins: { legend: { position: 'bottom' } } }
  })
  const uData = [...data.recentUsers].reverse()
  new Chart(document.getElementById('chart-users'), {
    type: 'bar',
    data: { labels: uData.map(u => u.d?.slice(5)), datasets: [{ label: '가입자', data: uData.map(u => u.cnt), backgroundColor: '#FF6B35', borderRadius: 6 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
  })
}
let _chartLoaded = false
function loadChartJs() {
  if (_chartLoaded && window.Chart) return Promise.resolve()
  return new Promise((res) => {
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
    s.onload = () => { _chartLoaded = true; res() }
    document.head.appendChild(s)
  })
}

// 상품 관리 목록
async function pageAdminProducts() {
  if (!adminGuard()) return
  document.getElementById('app').innerHTML = renderLoading()
  const { data } = await api.get('/admin/products')
  document.getElementById('app').innerHTML = adminLayout('/admin/products', `
    <div class="flex items-center justify-between mb-4">
      <h2 class="font-bold">상품 목록 (${data.products.length})</h2>
      <a href="#/admin/products/new" class="bg-brand-orange text-white px-4 py-2 rounded-xl font-semibold text-sm"><i class="fas fa-plus"></i> 상품 등록</a>
    </div>
    <div class="bg-white rounded-2xl border border-gray-100 overflow-hidden divide-y divide-gray-50">
      ${data.products.map(p => `
        <div class="flex items-center gap-3 p-3">
          <img src="${p.imageUrl}" class="w-14 h-14 rounded-xl object-cover" onerror="this.src='https://placehold.co/56'" />
          <div class="flex-1 min-w-0">
            <div class="font-bold text-sm truncate">${p.title}</div>
            <div class="text-xs text-gray-400">${p.category} · 시작가 ${won(p.startPrice)}원 · 참여 ${p.participants}/${p.maxParticipants}</div>
          </div>
          <span class="text-xs px-2 py-0.5 rounded-full ${p.status==='OPEN'?'bg-green-100 text-green-700':'bg-gray-100 text-gray-500'}">${p.status==='OPEN'?'진행중':'마감'}</span>
          <div class="flex gap-1">
            ${p.status==='OPEN'?`<button onclick="adminDraw('${p.id}')" class="text-xs px-2 py-1.5 rounded-lg bg-brand-gold/20 text-yellow-700 font-medium">강제추첨</button>`:''}
            <a href="#/admin/products/${p.id}/edit" class="text-xs px-2 py-1.5 rounded-lg bg-gray-100 text-gray-600"><i class="fas fa-pen"></i></a>
            <button onclick="adminDeleteProduct('${p.id}')" class="text-xs px-2 py-1.5 rounded-lg bg-red-50 text-red-500"><i class="fas fa-trash"></i></button>
          </div>
        </div>`).join('')}
    </div>`)
}
async function adminDraw(id) {
  if (!confirm('지금 추첨하시겠습니까? (정원 미달이어도 진행됩니다)')) return
  try { await api.post(`/admin/products/${id}/draw`); toast('추첨이 완료되었습니다! 🎲', 'success'); pageAdminProducts() }
  catch (err) { toast(errMsg(err), 'error') }
}
async function adminDeleteProduct(id) {
  if (!confirm('정말 삭제하시겠습니까? 관련 참여/당첨 데이터도 삭제됩니다.')) return
  try { await api.delete('/admin/products/' + id); toast('삭제되었습니다.', 'success'); pageAdminProducts() }
  catch (err) { toast(errMsg(err), 'error') }
}

// 상품 등록/수정 폼
async function pageAdminProductForm(params) {
  if (!adminGuard()) return
  const id = params.id
  let p = { title:'', description:'', imageUrl:'', category:'전자기기', marketPrice:'', startPrice:'', entryFee:'', maxParticipants:10, winnersCount:1, losingReward:200, status:'OPEN' }
  if (id) {
    const { data } = await api.get('/admin/products/' + id)
    p = data.product
  } else {
    // 신규 등록: 전역 기본값(설정 페이지)을 불러와 자동 적용
    try {
      const { data } = await api.get('/admin/config')
      if (data.config) {
        p.winnersCount = data.config.defaultWinners
        p.losingReward = data.config.defaultLosingReward
      }
    } catch {}
  }
  const f = (name, label, type='text', extra='') => `
    <div><label class="block text-sm font-medium mb-1">${label}</label>
      <input name="${name}" type="${type}" value="${p[name] ?? ''}" ${extra} class="w-full px-4 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-brand-orange" /></div>`

  document.getElementById('app').innerHTML = adminLayout('/admin/products', `
    <a href="#/admin/products" class="text-sm text-gray-400 hover:text-brand-orange"><i class="fas fa-chevron-left"></i> 상품목록</a>
    <h2 class="font-bold text-lg mt-2 mb-4">${id ? '상품 수정' : '상품 등록'}</h2>
    <form id="product-form" class="bg-white rounded-2xl border border-gray-100 p-5 space-y-3 max-w-2xl">
      ${f('title', '상품명 *')}
      <div><label class="block text-sm font-medium mb-1">설명</label>
        <textarea name="description" rows="3" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-brand-orange">${p.description||''}</textarea></div>
      ${f('imageUrl', '이미지 URL *', 'url')}
      <div class="grid grid-cols-2 gap-3">
        <div><label class="block text-sm font-medium mb-1">카테고리 *</label>
          <select name="category" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-brand-orange">
            ${['전자기기','가전','생활용품','식품','패션','기타'].map(cat => `<option ${p.category===cat?'selected':''}>${cat}</option>`).join('')}
          </select></div>
        ${id ? `<div><label class="block text-sm font-medium mb-1">상태</label>
          <select name="status" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-brand-orange">
            <option value="OPEN" ${p.status==='OPEN'?'selected':''}>진행중</option>
            <option value="CLOSED" ${p.status==='CLOSED'?'selected':''}>마감</option>
            <option value="DRAWN" ${p.status==='DRAWN'?'selected':''}>추첨완료</option>
          </select></div>` : '<div></div>'}
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
        ${f('marketPrice', '시중가(원) *', 'number')}
        ${f('startPrice', '시작가(원) *', 'number')}
        ${f('entryFee', '참가비(P) *', 'number')}
        ${f('maxParticipants', '정원', 'number')}
        ${f('winnersCount', '당첨자수', 'number')}
        ${f('losingReward', '미당첨보상(P)', 'number')}
      </div>
      ${!id ? '<p class="text-xs text-gray-400"><i class="fas fa-circle-info"></i> 당첨자수·미당첨보상은 <b>사이트 전역 설정</b>의 기본값이 자동 적용되었어요. 필요시 수정하세요.</p>' : ''}
      <button type="submit" class="w-full bg-brand-orange text-white font-bold py-3 rounded-xl hover:bg-orange-600">${id?'수정하기':'등록하기'}</button>
    </form>`)

  document.getElementById('product-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const payload = Object.fromEntries(new FormData(e.target).entries())
    try {
      if (id) await api.put('/admin/products/' + id, payload)
      else await api.post('/admin/products', payload)
      toast(id ? '수정되었습니다.' : '상품이 등록되었습니다! 🎉', 'success')
      Router.navigate('/admin/products')
    } catch (err) { toast(errMsg(err), 'error') }
  })
}

// 회원 관리
async function pageAdminMembers(params, query) {
  if (!adminGuard()) return
  document.getElementById('app').innerHTML = renderLoading()
  const q = query.q || ''
  const { data } = await api.get('/admin/members' + (q ? '?q=' + encodeURIComponent(q) : ''))
  document.getElementById('app').innerHTML = adminLayout('/admin/members', `
    <div class="flex items-center justify-between mb-4 gap-2 flex-wrap">
      <h2 class="font-bold">회원 목록 (${data.members.length})</h2>
      <div class="flex gap-2 items-center">
        <a href="#/admin/network" class="bg-blue-600 text-white px-3 py-2 rounded-xl text-sm font-semibold whitespace-nowrap"><i class="fas fa-sitemap"></i> 조직도 보기</a>
        <form id="member-search" class="flex gap-2">
          <input name="q" value="${q}" placeholder="이름/이메일/닉네임 검색" class="px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-brand-orange" />
          <button class="bg-brand-dark text-white px-3 py-2 rounded-xl text-sm"><i class="fas fa-search"></i></button>
        </form>
      </div>
    </div>
    <div class="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
      <table class="w-full text-sm min-w-[640px]">
        <thead class="bg-gray-50 text-gray-500 text-xs"><tr>
          <th class="text-left px-3 py-2">회원</th><th class="px-3 py-2">추천인</th>
          <th class="px-3 py-2">경매P</th><th class="px-3 py-2">잔액P</th><th class="px-3 py-2">임금P</th><th class="px-3 py-2">관리</th>
        </tr></thead>
        <tbody class="divide-y divide-gray-50">
        ${data.members.map(m => `<tr>
          <td class="px-3 py-2"><div class="font-medium">${m.name} ${m.role==='ADMIN'?'<span class="text-xs bg-brand-dark text-white px-1.5 py-0.5 rounded">관리자</span>':''}</div>
            <div class="text-xs text-gray-400">@${m.nickname} · ${m.email}</div><div class="text-xs text-gray-300">코드 ${m.referralCode}</div></td>
          <td class="px-3 py-2 text-center text-xs text-gray-500">${m.referrerNickname || '-'}</td>
          <td class="px-3 py-2 text-center font-medium text-brand-orange">${won(m.auctionPoint)}</td>
          <td class="px-3 py-2 text-center font-medium text-green-600">${won(m.balancePoint)}</td>
          <td class="px-3 py-2 text-center font-medium text-blue-600">${won(m.wagePoint)}</td>
          <td class="px-3 py-2">
            <div class="flex gap-1 justify-center whitespace-nowrap">
              <button onclick="openAdjust('${m.id}','${m.nickname}')" class="text-xs bg-orange-50 text-brand-orange px-2 py-1 rounded-lg font-medium">조정</button>
              <button onclick="openMemberEdit('${m.id}')" class="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg font-medium"><i class="fas fa-pen"></i></button>
              ${m.role==='ADMIN' ? '' : `<button onclick="deleteMember('${m.id}','${m.nickname}')" class="text-xs bg-red-50 text-red-500 px-2 py-1 rounded-lg font-medium"><i class="fas fa-trash"></i></button>`}
            </div>
          </td>
        </tr>`).join('')}
        </tbody>
      </table>
    </div>`)
  document.getElementById('member-search').addEventListener('submit', (e) => {
    e.preventDefault()
    const q = new FormData(e.target).get('q')
    Router.navigate('/admin/members' + (q ? '?q=' + encodeURIComponent(q) : ''))
  })
}

// 회원 정보 수정 모달
async function openMemberEdit(userId) {
  let m
  try { m = (await api.get('/admin/members/' + userId)).data.member }
  catch (err) { toast(errMsg(err), 'error'); return }
  openModal(`<div class="p-6">
    <h3 class="font-extrabold text-lg mb-1">회원 정보 수정</h3>
    <p class="text-sm text-gray-400 mb-4">코드 ${m.referralCode}${m.role==='ADMIN'?' · <span class="text-brand-dark font-medium">관리자</span>':''}</p>
    <div class="space-y-3">
      <div><label class="block text-xs font-medium text-gray-500 mb-1">이름</label>
        <input id="me-name" value="${m.name||''}" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-brand-orange" /></div>
      <div><label class="block text-xs font-medium text-gray-500 mb-1">닉네임</label>
        <input id="me-nickname" value="${m.nickname||''}" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-brand-orange" /></div>
      <div><label class="block text-xs font-medium text-gray-500 mb-1">이메일</label>
        <input id="me-email" type="email" value="${m.email||''}" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-brand-orange" /></div>
      <div><label class="block text-xs font-medium text-gray-500 mb-1">연락처</label>
        <input id="me-phone" value="${m.phone||''}" placeholder="010-0000-0000" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-brand-orange" /></div>
      <div><label class="block text-xs font-medium text-gray-500 mb-1">추천인 코드 <span class="text-gray-300">(현재: ${m.referrerNickname ? '@'+m.referrerNickname : '없음'})</span></label>
        <input id="me-referrer" placeholder="변경 시 추천코드 입력 (비우면 추천인 없음)" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-brand-orange" />
        <p class="text-xs text-gray-300 mt-1">입력하지 않으면 추천인은 변경되지 않아요.</p></div>
    </div>
    <div class="flex gap-2 mt-5">
      <button onclick="closeModal()" class="flex-1 border border-gray-200 py-2.5 rounded-xl">취소</button>
      <button onclick="saveMemberEdit('${userId}')" class="flex-1 bg-brand-orange text-white py-2.5 rounded-xl font-bold">저장</button>
    </div>
  </div>`)
  // 추천인 변경칸: 사용자가 의도적으로 비우면 '추천인 없음'으로 인식해야 하므로 sentinel 처리
  window.__memberEditHadReferrer = !!m.referrerId
}
async function saveMemberEdit(userId) {
  const val = (id) => document.getElementById(id).value.trim()
  const payload = {
    name: val('me-name'),
    nickname: val('me-nickname'),
    email: val('me-email'),
    phone: val('me-phone'),
  }
  // 추천인 코드는 입력했을 때만 전송 (빈칸이면 변경 안 함)
  const refCode = val('me-referrer')
  if (refCode) payload.referrerCode = refCode
  try {
    await api.put('/admin/members/' + userId, payload)
    closeModal(); toast('회원 정보가 수정되었습니다. ✅', 'success'); pageAdminMembers({}, getQuery())
  } catch (err) { toast(errMsg(err), 'error') }
}
async function deleteMember(userId, nickname) {
  if (!confirm(`@${nickname} 회원을 삭제하시겠습니까?\n\n· 참여/당첨/출금/포인트 내역이 모두 삭제됩니다.\n· 하위 회원은 이 회원의 추천인에게 자동 승계됩니다.`)) return
  try {
    await api.delete('/admin/members/' + userId)
    toast('회원이 삭제되었습니다.', 'success'); pageAdminMembers({}, getQuery())
  } catch (err) { toast(errMsg(err), 'error') }
}
function openAdjust(userId, nickname) {
  openModal(`<div class="p-6">
    <h3 class="font-extrabold text-lg mb-1">포인트 조정</h3>
    <p class="text-sm text-gray-400 mb-4">@${nickname} 회원</p>
    <div class="space-y-3">
      <select id="adj-kind" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 outline-none">
        <option value="AUCTION">경매 참여 포인트</option>
        <option value="BALANCE">잔액 포인트</option>
        <option value="WAGE">임금 포인트</option>
      </select>
      <input id="adj-amount" type="number" placeholder="금액 (음수 가능, 예: -1000)" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 outline-none" />
      <input id="adj-reason" placeholder="사유 (선택)" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 outline-none" />
    </div>
    <div class="flex gap-2 mt-5">
      <button onclick="closeModal()" class="flex-1 border border-gray-200 py-2.5 rounded-xl">취소</button>
      <button onclick="doAdjust('${userId}')" class="flex-1 bg-brand-orange text-white py-2.5 rounded-xl font-bold">조정하기</button>
    </div>
  </div>`)
}
async function doAdjust(userId) {
  const kind = document.getElementById('adj-kind').value
  const amount = Number(document.getElementById('adj-amount').value)
  const reason = document.getElementById('adj-reason').value
  if (!amount) { toast('금액을 입력해주세요.', 'warn'); return }
  try {
    await api.post(`/admin/members/${userId}/adjust`, { kind, amount, reason })
    closeModal(); toast('포인트가 조정되었습니다.', 'success'); pageAdminMembers({}, getQuery())
  } catch (err) { toast(errMsg(err), 'error') }
}

// 출금 관리
async function pageAdminWithdrawals() {
  if (!adminGuard()) return
  document.getElementById('app').innerHTML = renderLoading()
  const { data } = await api.get('/admin/withdrawals')
  const badge = (s) => {
    const map = { PENDING: ['대기','bg-yellow-100 text-yellow-700'], COMPLETED: ['완료','bg-green-100 text-green-700'], REJECTED: ['거절','bg-red-100 text-red-700'], APPROVED:['승인','bg-blue-100 text-blue-700'] }
    const [t, cls] = map[s] || [s,'bg-gray-100']; return `<span class="text-xs px-2 py-0.5 rounded-full ${cls}">${t}</span>`
  }
  document.getElementById('app').innerHTML = adminLayout('/admin/withdrawals', `
    <h2 class="font-bold mb-4">출금 신청 관리 (${data.withdrawals.length})</h2>
    <div class="space-y-2">
    ${data.withdrawals.length ? data.withdrawals.map(w => `
      <div class="bg-white rounded-2xl border border-gray-100 p-4 flex flex-wrap items-center gap-3 justify-between">
        <div>
          <div class="font-bold">${won(w.amount)}P 출금 ${badge(w.status)}</div>
          <div class="text-xs text-gray-400 mt-0.5">${w.name}(@${w.nickname}) · ${w.bankName||'-'} ${w.bankAccount||''} (${w.accountHolder||'-'})</div>
          <div class="text-xs text-gray-300">신청 ${fmtDateTime(w.requestedAt)} · 보유 잔액${won(w.balancePoint)}/임금${won(w.wagePoint)}</div>
        </div>
        ${w.status==='PENDING' ? `<div class="flex gap-2">
          <button onclick="processWd('${w.id}','approve')" class="bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-bold">승인</button>
          <button onclick="processWd('${w.id}','reject')" class="bg-red-50 text-red-500 px-4 py-2 rounded-xl text-sm font-medium">거절</button>
        </div>` : `<div class="text-xs text-gray-400">${fmtDateTime(w.processedAt)} 처리</div>`}
      </div>`).join('') : '<p class="text-center text-gray-400 py-10">출금 신청이 없습니다.</p>'}
    </div>`)
}
async function processWd(id, action) {
  if (!confirm(action==='approve' ? '출금을 승인하시겠습니까? 포인트가 차감됩니다.' : '출금을 거절하시겠습니까?')) return
  try { await api.post(`/admin/withdrawals/${id}/process`, { action }); toast(action==='approve'?'승인 완료':'거절 처리됨', 'success'); pageAdminWithdrawals() }
  catch (err) { toast(errMsg(err), 'error') }
}

// 사이트 설정 + 상품별 개별 설정
async function pageAdminConfig() {
  if (!adminGuard()) return
  document.getElementById('app').innerHTML = renderLoading()
  const [cfgRes, prodRes] = await Promise.all([
    api.get('/admin/config'),
    api.get('/admin/products'),
  ])
  const c = cfgRes.data.config
  const products = prodRes.data.products
  const f = (name, label, val) => `<div><label class="block text-sm font-medium mb-1">${label}</label>
    <input name="${name}" type="number" value="${val}" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-brand-orange" /></div>`

  // 상품별 빠른 설정 행
  const productRow = (p) => `
    <tr class="border-t border-gray-50" data-pid="${p.id}">
      <td class="px-3 py-3">
        <div class="flex items-center gap-2">
          <img src="${p.imageUrl}" class="w-10 h-10 rounded-lg object-cover" onerror="this.src='https://placehold.co/40'" />
          <div class="min-w-0">
            <div class="font-medium text-sm truncate max-w-[140px]">${p.title}</div>
            <div class="text-xs text-gray-400">참여 ${p.participants}/${p.maxParticipants} · ${p.status==='OPEN'?'<span class="text-green-600">진행중</span>':'<span class="text-gray-400">마감</span>'}</div>
          </div>
        </div>
      </td>
      <td class="px-2 py-3"><input type="number" min="1" value="${p.winnersCount}" data-field="winnersCount" class="w-16 px-2 py-1.5 rounded-lg border border-gray-200 text-center text-sm outline-none focus:border-brand-orange" /></td>
      <td class="px-2 py-3"><input type="number" min="0" value="${p.losingReward}" data-field="losingReward" class="w-20 px-2 py-1.5 rounded-lg border border-gray-200 text-center text-sm outline-none focus:border-brand-orange" /></td>
      <td class="px-2 py-3"><input type="number" min="1" value="${p.maxParticipants}" data-field="maxParticipants" class="w-16 px-2 py-1.5 rounded-lg border border-gray-200 text-center text-sm outline-none focus:border-brand-orange" /></td>
      <td class="px-2 py-3 text-center">
        <button onclick="saveProductSettings('${p.id}')" class="text-xs bg-brand-orange text-white px-3 py-1.5 rounded-lg font-medium whitespace-nowrap"><i class="fas fa-floppy-disk"></i> 저장</button>
      </td>
    </tr>`

  document.getElementById('app').innerHTML = adminLayout('/admin/config', `
    <h2 class="font-bold text-lg mb-4">사이트 전역 설정</h2>
    <form id="config-form" class="bg-white rounded-2xl border border-gray-100 p-5 space-y-3 max-w-lg">
      <p class="text-xs text-gray-400 -mt-1 mb-1"><i class="fas fa-circle-info"></i> 기본 당첨자수·미당첨보상은 <b>새 상품 등록 시 자동으로 채워지는 기본값</b>입니다.</p>
      ${f('defaultWinners','기본 당첨자 수', c.defaultWinners)}
      ${f('defaultLosingReward','기본 미당첨 보상(P)', c.defaultLosingReward)}
      ${f('minWithdrawAmount','최소 출금 금액(P)', c.minWithdrawAmount)}
      ${f('referralBonus','추천 가입 보너스(P)', c.referralBonus)}
      <button type="submit" class="w-full bg-brand-orange text-white font-bold py-3 rounded-xl hover:bg-orange-600">전역 설정 저장</button>
    </form>

    <div class="flex items-center justify-between mt-8 mb-3">
      <h2 class="font-bold text-lg">상품별 개별 설정</h2>
      <a href="#/admin/products/new" class="text-sm text-brand-orange font-medium"><i class="fas fa-plus"></i> 새 상품</a>
    </div>
    <p class="text-xs text-gray-400 mb-3"><i class="fas fa-circle-info"></i> 각 상품의 당첨자수·미당첨보상·정원을 여기서 바로 수정할 수 있어요. (상세 항목은 상품 수정에서)</p>
    <div class="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
      <table class="w-full text-sm min-w-[520px]">
        <thead class="bg-gray-50 text-gray-500 text-xs">
          <tr>
            <th class="text-left px-3 py-2">상품</th>
            <th class="px-2 py-2">당첨자수</th>
            <th class="px-2 py-2">미당첨보상(P)</th>
            <th class="px-2 py-2">정원</th>
            <th class="px-2 py-2">저장</th>
          </tr>
        </thead>
        <tbody>
          ${products.length ? products.map(productRow).join('') : '<tr><td colspan="5" class="text-center text-gray-400 py-8">등록된 상품이 없습니다.</td></tr>'}
        </tbody>
      </table>
    </div>`)

  document.getElementById('config-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const payload = Object.fromEntries(new FormData(e.target).entries())
    try { await api.put('/admin/config', payload); toast('전역 설정이 저장되었습니다.', 'success') }
    catch (err) { toast(errMsg(err), 'error') }
  })
}

// 상품별 빠른 설정 저장 (인라인)
async function saveProductSettings(pid) {
  const row = document.querySelector(`tr[data-pid="${pid}"]`)
  if (!row) return
  const get = (field) => Number(row.querySelector(`input[data-field="${field}"]`).value)
  const payload = {
    winnersCount: get('winnersCount'),
    losingReward: get('losingReward'),
    maxParticipants: get('maxParticipants'),
  }
  try {
    await api.patch(`/admin/products/${pid}/settings`, payload)
    toast('상품 설정이 저장되었습니다. ✅', 'success')
    // 행 강조 효과
    row.style.transition = 'background .4s'
    row.style.background = '#FFF7ED'
    setTimeout(() => { row.style.background = '' }, 800)
  } catch (err) { toast(errMsg(err), 'error') }
}

// ===== 관리자 전체 조직도 (추천인 계보도) =====
async function pageAdminNetwork() {
  if (!adminGuard()) return
  document.getElementById('app').innerHTML = renderLoading()
  const { data } = await api.get('/admin/network')
  const { root, members, summary, total } = data

  // 추천 관계로 트리 구성 (referrerId 기준)
  const byParent = {}
  members.forEach(m => {
    if (m.id === root.id) return
    const pid = m.referrerId || '__orphan__'
    ;(byParent[pid] = byParent[pid] || []).push(m)
  })
  // 추천인이 없는(루트가 아닌) 회원은 루트 아래에 묶어 표시
  const orphans = byParent['__orphan__'] || []
  if (orphans.length) {
    byParent[root.id] = (byParent[root.id] || []).concat(orphans)
  }

  const NODE_W = 158, NODE_H = 70, H_GAP = 26, V_GAP = 76
  const positions = {}
  let leafX = 0
  function computeLayout(id, depth) {
    const children = byParent[id] || []
    if (children.length === 0) {
      const x = leafX * (NODE_W + H_GAP)
      positions[id] = { x, y: depth * (NODE_H + V_GAP), depth }
      leafX++
      return x
    }
    const childXs = children.map(ch => computeLayout(ch.id, depth + 1))
    const x = (Math.min(...childXs) + Math.max(...childXs)) / 2
    positions[id] = { x, y: depth * (NODE_H + V_GAP), depth }
    return x
  }
  computeLayout(root.id, 0)

  const maxX = Math.max(...Object.values(positions).map(p => p.x)) + NODE_W
  const maxY = Math.max(...Object.values(positions).map(p => p.y)) + NODE_H
  const svgW = Math.max(maxX + 20, 320)
  const svgH = maxY + 20

  // 엣지
  let edges = ''
  members.forEach(m => {
    if (m.id === root.id) return
    const pid = m.referrerId || root.id
    const p = positions[pid], cc = positions[m.id]
    if (!p || !cc) return
    const x1 = p.x + NODE_W/2, y1 = p.y + NODE_H
    const x2 = cc.x + NODE_W/2, y2 = cc.y
    const my = (y1 + y2) / 2
    edges += `<path d="M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}" stroke="#cbd5e0" stroke-width="2" fill="none"/>`
  })

  // 노드
  let nodeEls = ''
  members.forEach(m => {
    const pos = positions[m.id]
    if (!pos) return
    const isRoot = m.id === root.id
    const isAdmin = m.role === 'ADMIN'
    const fill = isRoot || isAdmin ? '#FFC107' : '#60a5fa'
    const s = summary[m.id] || { bids: 0, wins: 0 }
    const nodePayload = JSON.stringify({ ...m, ...s, isRoot }).replace(/'/g, '&#39;')
    nodeEls += `<g transform="translate(${pos.x},${pos.y})" style="cursor:pointer" onclick='showAdminNodeDetail(${nodePayload})'>
      <rect width="${NODE_W}" height="${NODE_H}" rx="12" fill="white" stroke="${fill}" stroke-width="2.5"/>
      <rect width="6" height="${NODE_H}" rx="3" fill="${fill}"/>
      <text x="16" y="22" font-size="14" font-weight="700" fill="#2D3748">${m.name}${isAdmin?' 👑':''}</text>
      <text x="16" y="40" font-size="11" fill="#718096">@${m.nickname} · ${m.referralCode}</text>
      <text x="16" y="56" font-size="10" fill="#a0aec0">참여${s.bids}/당첨${s.wins} · 임금${won(m.wagePoint)}P</text>
    </g>`
  })

  document.getElementById('app').innerHTML = adminLayout('/admin/members', `
    <a href="#/admin/members" class="text-sm text-gray-400 hover:text-brand-orange"><i class="fas fa-chevron-left"></i> 회원목록</a>
    <div class="flex items-center justify-between mt-3 mb-4 flex-wrap gap-2">
      <h2 class="font-bold text-lg"><i class="fas fa-sitemap text-blue-600"></i> 전체 조직도 (추천인 계보도)</h2>
      <span class="text-sm bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full font-medium">전체 ${total}명</span>
    </div>
    <div class="grid lg:grid-cols-3 gap-4">
      <div class="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-4 overflow-auto">
        <div class="flex gap-3 text-xs text-gray-500 mb-3">
          <span><span class="inline-block w-3 h-3 rounded bg-brand-gold align-middle"></span> 회사(관리자)</span>
          <span><span class="inline-block w-3 h-3 rounded bg-blue-400 align-middle"></span> 회원</span>
        </div>
        <svg viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" style="min-width:${svgW}px">${edges}${nodeEls}</svg>
      </div>
      <div id="admin-node-detail" class="bg-white rounded-2xl border border-gray-100 p-5">
        <div class="text-center text-gray-400 py-8"><div class="text-3xl mb-2">👆</div><p class="text-sm">노드를 클릭하면<br/>회원 상세가 표시돼요</p></div>
      </div>
    </div>`)
}

function showAdminNodeDetail(n) {
  const el = document.getElementById('admin-node-detail')
  const isAdmin = n.role === 'ADMIN'
  el.innerHTML = `
    <div class="text-center mb-4">
      <div class="w-16 h-16 rounded-full mx-auto flex items-center justify-center text-white text-2xl mb-2" style="background:${isAdmin ? '#FFC107' : '#60a5fa'}">
        ${isAdmin ? '👑' : '👤'}</div>
      <div class="font-extrabold text-lg">${n.name}</div>
      <div class="text-sm text-gray-400">@${n.nickname} · ${n.referralCode}</div>
    </div>
    <div class="space-y-2 text-sm">
      <div class="flex justify-between py-2 border-b border-gray-50"><span class="text-gray-400">가입일</span><span class="font-medium">${fmtDate(n.createdAt)}</span></div>
      <div class="flex justify-between py-2 border-b border-gray-50"><span class="text-gray-400">경매 참여</span><span class="font-medium">${n.bids}회</span></div>
      <div class="flex justify-between py-2 border-b border-gray-50"><span class="text-gray-400">낙찰</span><span class="font-medium text-brand-orange">${n.wins}회</span></div>
      <div class="flex justify-between py-2 border-b border-gray-50"><span class="text-gray-400">경매P</span><span class="font-medium text-brand-orange">${won(n.auctionPoint)}</span></div>
      <div class="flex justify-between py-2 border-b border-gray-50"><span class="text-gray-400">잔액P</span><span class="font-medium text-green-600">${won(n.balancePoint)}</span></div>
      <div class="flex justify-between py-2 border-b border-gray-50"><span class="text-gray-400">임금P</span><span class="font-medium text-blue-600">${won(n.wagePoint)}</span></div>
    </div>
    ${isAdmin ? '' : `<button onclick="openMemberEdit('${n.id}')" class="w-full mt-4 bg-gray-100 text-gray-700 py-2.5 rounded-xl text-sm font-medium"><i class="fas fa-pen"></i> 이 회원 수정</button>`}`
}
