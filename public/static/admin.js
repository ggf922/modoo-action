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
    ['/admin/grade-grant', 'fa-layer-group', '등급지급'],
    ['/admin/charges', 'fa-coins', '충전관리'],
    ['/admin/subscriptions', 'fa-crown', '구독관리'],
    ['/admin/shipments', 'fa-truck-fast', '배송관리'],
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
      ${kpi('fa-coins', '#f59e0b', '대기 충전', data.pendingCharges, '건')}
      ${kpi('fa-truck-fast', '#8b5cf6', '발송 대기', data.pendingShipments, '건')}
      ${kpi('fa-credit-card', '#3b82f6', '총 충전액', data.totalCharged, 'P')}
      ${kpi('fa-gift', '#22c55e', '총 보상지급', data.totalRewards, 'P')}
    </div>
    <div class="grid lg:grid-cols-2 gap-4 mb-4">
      <div class="bg-white rounded-2xl border border-gray-100 p-5">
        <h3 class="font-bold mb-3 text-sm">상품별 경매 참여 횟수</h3>
        <canvas id="chart-product-bids" height="220"></canvas>
      </div>
      <div class="bg-white rounded-2xl border border-gray-100 p-5">
        <h3 class="font-bold mb-3 text-sm">카테고리별 상품</h3>
        <canvas id="chart-category" height="220"></canvas>
      </div>
    </div>
    <div class="bg-white rounded-2xl border border-gray-100 p-5">
      <h3 class="font-bold mb-3 text-sm">일별 신규 가입 (최근 7일)</h3>
      <canvas id="chart-users" height="120"></canvas>
    </div>`)

  await loadChartJs()
  // 상품별 경매 참여(입찰) 횟수 — 가로 막대 (참여 많은 순)
  const pbData = data.byProductBids || []
  new Chart(document.getElementById('chart-product-bids'), {
    type: 'bar',
    data: { labels: pbData.map(p => p.title), datasets: [{ label: '참여 횟수', data: pbData.map(p => p.cnt),
      backgroundColor: '#FF6B35', borderRadius: 6 }] },
    options: { indexAxis: 'y', plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } }
  })
  // 카테고리별 상품 — 도넛 (고정 6종)
  const catData = data.byCategory
  new Chart(document.getElementById('chart-category'), {
    type: 'doughnut',
    data: { labels: catData.map(c => c.category), datasets: [{ data: catData.map(c => c.cnt),
      backgroundColor: ['#FF6B35','#22c55e','#ec4899','#3b82f6','#FFC107','#94a3b8'] }] },
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
    <p class="text-xs text-gray-400 mb-2"><i class="fas fa-circle-info"></i> 위/아래 화살표로 고객에게 노출되는 상품 순서를 변경할 수 있어요.</p>
    <div class="bg-white rounded-2xl border border-gray-100 overflow-hidden divide-y divide-gray-50">
      ${data.products.map((p, i) => `
        <div class="flex items-center gap-3 p-3">
          <div class="flex flex-col gap-0.5">
            <button onclick="moveProduct('${p.id}','up')" ${i===0?'disabled':''} class="w-7 h-7 rounded-lg flex items-center justify-center ${i===0?'text-gray-200 cursor-not-allowed':'bg-gray-100 text-gray-600 hover:bg-brand-orange/10 hover:text-brand-orange'}" title="위로"><i class="fas fa-chevron-up text-xs"></i></button>
            <button onclick="moveProduct('${p.id}','down')" ${i===data.products.length-1?'disabled':''} class="w-7 h-7 rounded-lg flex items-center justify-center ${i===data.products.length-1?'text-gray-200 cursor-not-allowed':'bg-gray-100 text-gray-600 hover:bg-brand-orange/10 hover:text-brand-orange'}" title="아래로"><i class="fas fa-chevron-down text-xs"></i></button>
          </div>
          <span class="text-xs font-bold text-gray-300 w-5 text-center">${i+1}</span>
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
async function moveProduct(id, direction) {
  try {
    const { data } = await api.post(`/admin/products/${id}/move`, { direction })
    if (data.moved === false) { toast(data.message || '더 이상 이동할 수 없습니다.', 'info'); return }
    await pageAdminProducts()
  } catch (err) { toast(errMsg(err), 'error') }
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

      <div><label class="block text-sm font-medium mb-1">제품 링크 <span class="text-gray-400 font-normal">— 상세페이지 "제품 자세히 보기" 버튼</span></label>
        <input name="productUrl" type="url" value="${(p.productUrl ?? '').replace(/"/g, '&quot;')}" placeholder="예: https://nangman.waveon.me/" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-brand-orange" />
        <p class="text-xs text-gray-400 mt-1"><i class="fas fa-circle-info"></i> 입력하면 상품 상세페이지 설명 아래에 외부 링크 버튼이 표시됩니다. 비워두면 표시되지 않아요.</p></div>

      <!-- 상품 상세 이미지 업로드 (로컬 파일 → 자동 압축 → Base64) -->
      <div>
        <label class="block text-sm font-medium mb-1">상품 상세 이미지 *</label>
        <input type="hidden" name="imageUrl" id="img-data" value="${(p.imageUrl ?? '').replace(/"/g, '&quot;')}" />
        <div class="flex items-start gap-4">
          <div id="img-preview-box" class="w-32 h-32 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
            ${p.imageUrl ? `<img id="img-preview" src="${p.imageUrl}" class="w-full h-full object-cover" />` : `<span id="img-placeholder" class="text-gray-300 text-center text-xs px-2"><i class="fas fa-image text-2xl block mb-1"></i>미리보기</span>`}
          </div>
          <div class="flex-1 min-w-0">
            <label class="inline-block cursor-pointer bg-brand-dark text-white px-4 py-2.5 rounded-xl text-sm font-medium">
              <i class="fas fa-upload"></i> 파일 선택
              <input type="file" accept="image/*" class="hidden" onchange="handleProductImage(this)" />
            </label>
            <div id="img-info" class="text-xs text-gray-400 mt-2 leading-relaxed">
              JPG · PNG · WebP 지원<br/>
              업로드 시 <b>800 × 800 정사각형 · 품질 80%</b>로 자동 변환됩니다.<br/>
              어떤 비율의 이미지든 <b>중앙 기준 정사각 크롭</b> 후 800×800으로 맞춰져요.
            </div>
          </div>
        </div>
      </div>

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
      <!-- 가격 설정 (취소선 시중가 + 시작가 직접 입력) -->
      <div class="rounded-2xl border-2 border-orange-100 bg-orange-50/40 p-4">
        <div class="flex items-center gap-2 mb-3">
          <span class="w-7 h-7 rounded-lg bg-brand-orange text-white flex items-center justify-center text-sm"><i class="fas fa-tag"></i></span>
          <h3 class="font-bold text-sm">가격 설정</h3>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-medium mb-1">시중가(원) * <span class="text-gray-400 font-normal">— 취소선 가격</span></label>
            <input name="marketPrice" type="number" min="0" value="${p.marketPrice ?? ''}" oninput="updatePricePreview()" placeholder="예: 250000" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-brand-orange" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">시작가(원) * <span class="text-brand-orange font-normal">— 실제 판매가</span></label>
            <input name="startPrice" type="number" min="0" value="${p.startPrice ?? ''}" oninput="updatePricePreview()" placeholder="예: 50000" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-brand-orange" />
          </div>
        </div>
        <!-- 실시간 미리보기 -->
        <div id="price-preview" class="mt-3 flex items-center justify-between bg-white rounded-xl border border-gray-100 px-4 py-3">
          <div>
            <div id="pv-market" class="text-gray-400 text-sm line-through-soft">- 원</div>
            <div id="pv-start" class="text-brand-orange font-extrabold text-xl">- 원</div>
          </div>
          <span id="pv-discount" class="bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">- % OFF</span>
        </div>
        <p class="text-xs text-gray-400 mt-2"><i class="fas fa-circle-info"></i> 할인율은 시중가·시작가로 자동 계산되어 상품 카드에 <b>"○○% OFF"</b>로 표시됩니다.</p>
        <div class="mt-2 flex items-center gap-2 text-sm bg-orange-100/60 rounded-xl px-3 py-2">
          <i class="fas fa-gavel text-brand-orange"></i>
          <span class="text-gray-600">경매 참여 시 차감 포인트는 시작가와 동일합니다 →</span>
          <b id="pv-entryfee" class="text-brand-orange">- P</b>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-3">
        ${f('maxParticipants', '정원', 'number')}
        ${f('winnersCount', '당첨자수', 'number')}
        ${f('losingReward', '미당첨보상(P)', 'number')}
      </div>
      ${!id ? '<p class="text-xs text-gray-400"><i class="fas fa-circle-info"></i> 당첨자수·미당첨보상은 <b>사이트 전역 설정</b>의 기본값이 자동 적용되었어요. 필요시 수정하세요.</p>' : ''}
      <button type="submit" class="w-full bg-brand-orange text-white font-bold py-3 rounded-xl hover:bg-orange-600">${id?'수정하기':'등록하기'}</button>
    </form>`)

  updatePricePreview() // 초기 렌더

  document.getElementById('product-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const payload = Object.fromEntries(new FormData(e.target).entries())
    // 가격 유효성 검사
    const mp = Number(payload.marketPrice), sp = Number(payload.startPrice)
    if (!mp || mp <= 0) { toast('시중가를 올바르게 입력해주세요.', 'warn'); return }
    if (!sp || sp <= 0) { toast('시작가를 올바르게 입력해주세요.', 'warn'); return }
    if (sp > mp) { toast('시작가는 시중가보다 클 수 없습니다.', 'warn'); return }
    if (!payload.imageUrl) { toast('상품 상세 이미지를 업로드해주세요.', 'warn'); return }
    try {
      if (id) await api.put('/admin/products/' + id, payload)
      else await api.post('/admin/products', payload)
      toast(id ? '수정되었습니다.' : '상품이 등록되었습니다! 🎉', 'success')
      Router.navigate('/admin/products')
    } catch (err) { toast(errMsg(err), 'error') }
  })
}

// 로컬 이미지 업로드 → 브라우저에서 리사이즈/압축 → Base64 변환
function handleProductImage(input) {
  const file = input.files && input.files[0]
  if (!file) return
  if (!file.type.startsWith('image/')) { toast('이미지 파일만 업로드할 수 있어요.', 'warn'); return }
  // 원본이 너무 크면 경고 (압축은 하지만 메모리 보호)
  if (file.size > 15 * 1024 * 1024) { toast('15MB 이하 이미지를 올려주세요.', 'warn'); return }

  const SIZE = 800        // 최종 800×800 정사각형
  const QUALITY = 0.8     // JPEG 품질 80%
  const reader = new FileReader()
  reader.onload = (ev) => {
    const img = new Image()
    img.onload = () => {
      // 800×800 정사각 캔버스 — 원본을 비율 유지하며 중앙 기준 cover 크롭
      const canvas = document.createElement('canvas')
      canvas.width = SIZE; canvas.height = SIZE
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff' // 투명 PNG → 흰 배경
      ctx.fillRect(0, 0, SIZE, SIZE)

      const iw = img.width, ih = img.height
      // 짧은 변을 기준으로 정사각 영역을 잘라 800×800에 꽉 채움(cover)
      const side = Math.min(iw, ih)
      const sx = Math.round((iw - side) / 2)
      const sy = Math.round((ih - side) / 2)
      ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE)

      const dataUrl = canvas.toDataURL('image/jpeg', QUALITY)

      // hidden input에 저장 + 미리보기 갱신
      document.getElementById('img-data').value = dataUrl
      const box = document.getElementById('img-preview-box')
      box.innerHTML = `<img id="img-preview" src="${dataUrl}" class="w-full h-full object-cover" />`

      // 용량 표시
      const kb = Math.round((dataUrl.length * 3 / 4) / 1024)
      const info = document.getElementById('img-info')
      const warn = kb > 300 ? ' <span class="text-amber-600">(권장 300KB 초과 — 더 작은 이미지를 권장)</span>' : ' <span class="text-green-600">✓ 최적화됨</span>'
      info.innerHTML = `변환 결과: <b>800×800px · 약 ${kb}KB</b>${warn}<br/>다른 이미지로 교체하려면 다시 "파일 선택"을 누르세요.`
      toast('이미지가 800×800으로 변환되어 적용되었어요. ✅', 'success')
    }
    img.onerror = () => toast('이미지를 읽을 수 없어요.', 'error')
    img.src = ev.target.result
  }
  reader.readAsDataURL(file)
}

// 가격 입력 실시간 미리보기 (시중가/시작가 → 할인율)
function updatePricePreview() {
  const mpEl = document.querySelector('input[name="marketPrice"]')
  const spEl = document.querySelector('input[name="startPrice"]')
  if (!mpEl || !spEl) return
  const mp = Number(mpEl.value), sp = Number(spEl.value)
  const pvMarket = document.getElementById('pv-market')
  const pvStart = document.getElementById('pv-start')
  const pvDiscount = document.getElementById('pv-discount')
  if (!pvMarket) return
  pvMarket.textContent = mp > 0 ? `${won(mp)}원` : '- 원'
  pvStart.textContent = sp > 0 ? `${won(sp)}원` : '- 원'
  const pvEntry = document.getElementById('pv-entryfee')
  if (pvEntry) pvEntry.textContent = sp > 0 ? `${won(sp)} P` : '- P'
  if (mp > 0 && sp > 0 && sp <= mp) {
    const discount = Math.round((1 - sp / mp) * 100)
    pvDiscount.textContent = `${discount}% OFF`
    pvDiscount.style.background = '#ef4444'
  } else if (mp > 0 && sp > mp) {
    pvDiscount.textContent = '시작가 > 시중가 ⚠️'
    pvDiscount.style.background = '#f59e0b'
  } else {
    pvDiscount.textContent = '- % OFF'
    pvDiscount.style.background = '#cbd5e0'
  }
}

// 회원 관리
async function pageAdminMembers(params, query) {
  if (!adminGuard()) return
  document.getElementById('app').innerHTML = renderLoading()
  const q = query.q || ''
  const { data } = await api.get('/admin/members' + (q ? '?q=' + encodeURIComponent(q) : ''))
  document.getElementById('app').innerHTML = adminLayout('/admin/members', `
    <div class="flex items-center justify-between mb-3 gap-2 flex-wrap">
      <h2 class="font-bold">회원 목록 (${data.members.length})</h2>
      <a href="#/admin/network" class="bg-blue-600 text-white px-3 py-2 rounded-xl text-sm font-semibold whitespace-nowrap"><i class="fas fa-sitemap"></i> 조직도 보기</a>
    </div>
    <div class="bg-white rounded-2xl border border-gray-100 p-3 mb-4">
      <p class="text-xs text-gray-400 mb-2"><i class="fas fa-circle-info text-brand-orange"></i> 아이디/이름/닉네임으로 검색 후 <b class="text-brand-orange">포인트발송</b> 버튼으로 개별 경매P를 보낼 수 있습니다. (회수 시 음수 입력)</p>
      <form id="member-search" class="flex gap-2 w-full">
        <input name="q" value="${q}" placeholder="아이디 · 이름 · 닉네임으로 검색" class="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-brand-orange" />
        <button type="submit" class="bg-brand-orange text-white px-5 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap"><i class="fas fa-search"></i> 검색</button>
        ${q ? `<a href="#/admin/members" class="bg-gray-100 text-gray-500 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap flex items-center">초기화</a>` : ''}
      </form>
    </div>
    <div class="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
      <table class="w-full text-sm min-w-[640px]">
        <thead class="bg-gray-50 text-gray-500 text-xs"><tr>
          <th class="text-left px-3 py-2">회원</th><th class="px-3 py-2">등급</th><th class="px-3 py-2">추천인</th>
          <th class="px-3 py-2">경매P</th><th class="px-3 py-2">관리</th>
        </tr></thead>
        <tbody class="divide-y divide-gray-50">
        ${data.members.map(m => `<tr>
          <td class="px-3 py-2"><div class="font-medium">${m.name} ${m.role==='ADMIN'?'<span class="text-xs bg-brand-dark text-white px-1.5 py-0.5 rounded">관리자</span>':''}</div>
            <div class="text-xs text-gray-400">@${m.nickname} · ${m.email}</div><div class="text-xs text-gray-300">코드 ${m.referralCode}</div></td>
          <td class="px-3 py-2 text-center">${m.role==='ADMIN' ? '<span class="text-xs text-gray-300">-</span>' : `
            <select onchange="changeGradeInline('${m.id}', this.value)" class="text-xs border border-gray-200 rounded-lg px-1.5 py-1 outline-none focus:border-brand-orange bg-white">
              ${GRADE_ORDER.map(g => `<option value="${g}" ${g===m.grade?'selected':''}>${gradeInfo(g).label}</option>`).join('')}
            </select>`}</td>
          <td class="px-3 py-2 text-center text-xs text-gray-500">${m.referrerNickname || '-'}</td>
          <td class="px-3 py-2 text-center font-medium text-brand-orange">${won(m.auctionPoint)}</td>
          <td class="px-3 py-2">
            <div class="flex gap-1 justify-center whitespace-nowrap">
              <button onclick="openMemberDetail('${m.id}')" class="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-lg font-medium"><i class="fas fa-id-card"></i> 상세</button>
              <button onclick="openAdjust('${m.id}','${m.nickname}')" class="text-xs bg-orange-50 text-brand-orange px-2 py-1 rounded-lg font-medium"><i class="fas fa-paper-plane"></i> 포인트발송</button>
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

// 회원 목록에서 등급 인라인 변경
async function changeGradeInline(userId, grade) {
  try {
    await api.post('/admin/members/' + userId + '/grade', { grade })
    toast(gradeInfo(grade).label + ' 등급으로 변경되었습니다.', 'success')
  } catch (err) { toast(errMsg(err), 'error'); Router.resolve() }
}

// 회원 등급 변경/승인
async function changeGrade(userId) {
  const sel = document.getElementById('grade-select')
  if (!sel) return
  const grade = sel.value
  try {
    await api.post('/admin/members/' + userId + '/grade', { grade })
    toast(gradeInfo(grade).label + ' 등급으로 변경되었습니다.', 'success')
    closeModal()
    if (location.hash.startsWith('#/admin/members')) Router.resolve()
  } catch (err) { toast(errMsg(err), 'error') }
}

// 회원 상세 정보 (가입 시 입력 항목 전체를 항목별로 정리)
async function openMemberDetail(userId) {
  let m
  try { m = (await api.get('/admin/members/' + userId)).data.member }
  catch (err) { toast(errMsg(err), 'error'); return }

  const fmtDateTime = (s) => { try { return new Date(s).toLocaleString('ko-KR') } catch { return s || '-' } }
  const row = (label, value, icon) =>
    `<div class="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
       <div class="w-28 shrink-0 text-xs text-gray-400 flex items-center gap-1.5"><i class="fas ${icon} text-gray-300"></i> ${label}</div>
       <div class="flex-1 text-sm font-medium text-gray-700 break-all">${value ?? '-'}</div>
     </div>`
  const isAdmin = m.role === 'ADMIN'

  openModal(`<div class="p-6 max-h-[80vh] overflow-y-auto">
    <div class="flex items-center gap-3 mb-4">
      <div class="w-12 h-12 rounded-full bg-gradient-to-br from-brand-orange to-brand-gold flex items-center justify-center text-white text-xl font-bold shrink-0">${(m.name||'?').charAt(0)}</div>
      <div>
        <h3 class="font-extrabold text-lg leading-tight">${m.name} ${isAdmin?'<span class="text-xs bg-brand-dark text-white px-1.5 py-0.5 rounded align-middle">관리자</span>':''}</h3>
        <p class="text-sm text-gray-400 flex items-center gap-2">@${m.nickname} ${isAdmin ? '' : gradeBadge(m.grade)}</p>
      </div>
    </div>

    ${isAdmin ? '' : `
    <div class="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1 mt-2">회원 등급 (승인/변경)</div>
    <div class="bg-amber-50 rounded-xl px-4 py-3 mb-4">
      <div class="flex items-center gap-2 mb-2 text-sm text-gray-600">현재 등급: ${gradeBadge(m.grade)}</div>
      <div class="flex gap-2">
        <select id="grade-select" class="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-brand-orange bg-white">
          ${GRADE_ORDER.map(g => `<option value="${g}" ${g===m.grade?'selected':''}>${gradeInfo(g).label}</option>`).join('')}
        </select>
        <button onclick="changeGrade('${m.id}')" class="bg-brand-orange text-white px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap"><i class="fas fa-check"></i> 등급 적용</button>
      </div>
    </div>`}

    <div class="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1 mt-2">가입 정보</div>
    <div class="bg-gray-50 rounded-xl px-4 py-1 mb-4">
      ${row('이메일/아이디', m.email, 'fa-envelope')}
      ${row('이름', m.name, 'fa-user')}
      ${row('닉네임', '@' + m.nickname, 'fa-at')}
      ${row('휴대폰', m.phone || '<span class="text-gray-300">미입력</span>', 'fa-phone')}
      ${row('내 추천코드', '<span class="font-mono">' + m.referralCode + '</span>', 'fa-ticket')}
      ${row('추천인', m.referrerNickname ? `@${m.referrerNickname} (${m.referrerName||''})` : '<span class="text-gray-300">없음</span>', 'fa-user-plus')}
      ${row('가입일시', fmtDateTime(m.createdAt), 'fa-calendar')}
    </div>

    <div class="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">보유 포인트</div>
    <div class="grid grid-cols-1 gap-2 mb-4 text-center">
      <div class="bg-orange-50 rounded-xl py-3"><div class="text-xs text-gray-400">경매포인트</div><div class="font-bold text-brand-orange text-lg">${won(m.auctionPoint)} P</div></div>
    </div>

    <div class="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">출금 계좌</div>
    <div class="bg-gray-50 rounded-xl px-4 py-1 mb-5">
      ${row('은행', m.bankName || '<span class="text-gray-300">미등록</span>', 'fa-building-columns')}
      ${row('계좌번호', m.bankAccount || '<span class="text-gray-300">미등록</span>', 'fa-money-check')}
      ${row('예금주', m.accountHolder || '<span class="text-gray-300">미등록</span>', 'fa-id-badge')}
    </div>

    <div class="flex gap-2">
      <button onclick="closeModal();openMemberEdit('${m.id}')" class="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-xl font-bold text-sm"><i class="fas fa-pen"></i> 수정</button>
      <button onclick="closeModal();openAdjust('${m.id}','${m.nickname}')" class="flex-1 bg-orange-50 text-brand-orange py-2.5 rounded-xl font-bold text-sm"><i class="fas fa-coins"></i> 포인트 조정</button>
      ${isAdmin ? '' : `<button onclick="closeModal();deleteMember('${m.id}','${m.nickname}')" class="flex-1 bg-red-50 text-red-500 py-2.5 rounded-xl font-bold text-sm"><i class="fas fa-trash"></i> 삭제</button>`}
    </div>
  </div>`)
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
      <div><label class="block text-xs font-medium text-gray-500 mb-1">이메일/아이디</label>
        <input id="me-email" type="text" value="${m.email||''}" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-brand-orange" /></div>
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
    <h3 class="font-extrabold text-lg mb-1"><i class="fas fa-paper-plane text-brand-orange"></i> 개별 포인트 발송</h3>
    <p class="text-sm text-gray-400 mb-4">@${nickname} 회원에게 직접 포인트를 보냅니다.</p>
    <div class="space-y-3">
      <div class="bg-orange-50 rounded-xl px-4 py-2.5 text-xs text-gray-500"><i class="fas fa-coins text-brand-orange"></i> 경매포인트를 발송합니다. (회수 시 음수 입력)</div>
      <div><label class="block text-xs font-medium text-gray-500 mb-1">금액 (P)</label>
        <input id="adj-amount" type="number" placeholder="보낼 금액 (회수 시 음수, 예: -1000)" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 outline-none" /></div>
      <div><label class="block text-xs font-medium text-gray-500 mb-1">사유 (선택)</label>
        <input id="adj-reason" placeholder="예: 이벤트 지급" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 outline-none" /></div>
    </div>
    <div class="flex gap-2 mt-5">
      <button onclick="closeModal()" class="flex-1 border border-gray-200 py-2.5 rounded-xl">취소</button>
      <button onclick="doAdjust('${userId}')" class="flex-1 bg-brand-orange text-white py-2.5 rounded-xl font-bold"><i class="fas fa-paper-plane"></i> 발송하기</button>
    </div>
  </div>`)
}
async function doAdjust(userId) {
  const amount = Number(document.getElementById('adj-amount').value)
  const reason = document.getElementById('adj-reason').value
  if (!amount) { toast('금액을 입력해주세요.', 'warn'); return }
  try {
    await api.post(`/admin/members/${userId}/adjust`, { amount, reason })
    closeModal(); toast('포인트가 조정되었습니다.', 'success'); pageAdminMembers({}, getQuery())
  } catch (err) { toast(errMsg(err), 'error') }
}

// ===== 등급별 포인트 일괄 지급 =====
async function pageAdminGradeGrant() {
  if (!adminGuard()) return
  document.getElementById('app').innerHTML = renderLoading()
  let stats = {}, vipPlus = 0
  try {
    stats = (await api.get('/admin/members/grade-stats')).data.stats || {}
    vipPlus = (await api.get('/admin/members/vip-plus-count')).data.count || 0
  } catch (err) { toast(errMsg(err), 'error') }

  document.getElementById('app').innerHTML = adminLayout('/admin/grade-grant', `
    <h2 class="font-bold mb-4"><i class="fas fa-layer-group text-brand-orange"></i> 등급별 포인트 일괄 지급</h2>

    <div class="bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-2xl p-5 mb-4">
      <div class="flex items-center justify-between mb-2">
        <div class="font-extrabold text-lg"><i class="fas fa-receipt"></i> VIP 이상 경매P 월 구독료</div>
        <span class="bg-white/20 px-3 py-1 rounded-full text-sm font-bold">대상 ${vipPlus}명</span>
      </div>
      <p class="text-sm text-white/80 mb-3">VIP·VVIP·대리점·총판·이사 등급 회원 전원의 <b>경매포인트에서 월 구독료를 차감</b>하여 회사가 일괄 수금합니다. (일반회원 제외 · 잔액 부족 시 보유액 범위 내 차감)</p>
      <div class="flex flex-col sm:flex-row gap-2">
        <input id="vip-amount" type="number" min="1" placeholder="1인당 구독료 (예: 50000)" class="flex-1 px-4 py-2.5 rounded-xl text-gray-800 outline-none" />
        <input id="vip-reason" placeholder="사유 (선택, 예: 6월 구독료)" class="flex-1 px-4 py-2.5 rounded-xl text-gray-800 outline-none" />
        <button onclick="doGrantVipAuction()" class="bg-brand-dark text-white px-5 py-2.5 rounded-xl font-bold whitespace-nowrap"><i class="fas fa-money-bill-wave"></i> 구독료 수금</button>
      </div>
    </div>

    <div class="bg-white rounded-2xl border border-gray-100 p-5 mb-4">
      <div class="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">등급별 회원 수</div>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
        ${GRADE_ORDER.map(g => `
          <div class="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5">
            <div>${gradeBadge(g)}</div>
            <div class="font-extrabold text-gray-700">${stats[g] || 0}<span class="text-xs font-normal text-gray-400">명</span></div>
          </div>`).join('')}
      </div>
    </div>

    <div class="bg-white rounded-2xl border border-gray-100 p-5">
      <div class="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">일괄 지급 설정</div>
      <div class="space-y-3">
        <div>
          <label class="block text-xs font-medium text-gray-500 mb-1">대상 등급</label>
          <select id="gg-grade" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-brand-orange bg-white">
            ${GRADE_ORDER.map(g => `<option value="${g}">${gradeInfo(g).label} (${stats[g] || 0}명)</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-500 mb-1">1인당 지급 금액 (P)</label>
          <input id="gg-amount" type="number" min="1" placeholder="예: 10000" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-brand-orange" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-500 mb-1">사유 (선택)</label>
          <input id="gg-reason" placeholder="예: 6월 등급별 정기 지급" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-brand-orange" />
        </div>
      </div>
      <button onclick="doGradeGrant()" class="w-full mt-4 bg-brand-orange text-white py-3 rounded-xl font-bold"><i class="fas fa-paper-plane"></i> 해당 등급 회원에게 일괄 지급</button>
      <p class="text-xs text-gray-400 mt-2 text-center">선택한 등급의 모든 회원에게 동일한 금액이 일괄 지급됩니다.</p>
    </div>`)
}

async function doGradeGrant() {
  const grade = document.getElementById('gg-grade').value
  const amount = Number(document.getElementById('gg-amount').value)
  const reason = document.getElementById('gg-reason').value
  if (!amount || amount <= 0) { toast('지급 금액을 올바르게 입력해주세요.', 'warn'); return }
  if (!confirm(`[${gradeInfo(grade).label}] 등급 회원에게 경매P ${won(amount)}을(를) 일괄 지급하시겠습니까?`)) return
  try {
    const { data } = await api.post('/admin/members/grade-grant', { grade, amount, reason })
    if (data.count === 0) { toast(data.message || '해당 등급의 회원이 없습니다.', 'warn'); return }
    toast(`${data.count}명에게 ${won(amount)} 일괄 지급 완료`, 'success')
    pageAdminGradeGrant()
  } catch (err) { toast(errMsg(err), 'error') }
}

// VIP 이상 경매P 월 구독료 차감(수금)
async function doGrantVipAuction() {
  const amount = Number(document.getElementById('vip-amount').value)
  const reason = document.getElementById('vip-reason').value
  if (!amount || amount <= 0) { toast('구독료 금액을 올바르게 입력해주세요.', 'warn'); return }
  if (!confirm(`VIP 이상 등급 회원 전원의 경매포인트에서 월 구독료 ${won(amount)}P를 차감(수금)하시겠습니까?`)) return
  try {
    const { data } = await api.post('/admin/members/grant-vip-auction', { amount, reason })
    if (data.total === 0) { toast(data.message || 'VIP 이상 등급 회원이 없습니다.', 'warn'); return }
    toast(`VIP 이상 ${data.count}명에게서 총 ${won(data.totalDeducted || 0)}P 수금 완료`, 'success')
    pageAdminGradeGrant()
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
          <div class="text-xs text-gray-300">신청 ${fmtDateTime(w.requestedAt)} · 보유 경매P ${won(w.auctionPoint)}</div>
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

// 충전 관리 (입금 → 관리자 승인)
async function pageAdminCharges() {
  if (!adminGuard()) return
  document.getElementById('app').innerHTML = renderLoading()
  const { data } = await api.get('/admin/charge-requests')
  const badge = (s) => {
    const map = { PENDING: ['승인 대기','bg-yellow-100 text-yellow-700'], COMPLETED: ['충전 완료','bg-green-100 text-green-700'], REJECTED: ['거절','bg-red-100 text-red-700'] }
    const [t, cls] = map[s] || [s,'bg-gray-100']; return `<span class="text-xs px-2 py-0.5 rounded-full ${cls}">${t}</span>`
  }
  document.getElementById('app').innerHTML = adminLayout('/admin/charges', `
    <h2 class="font-bold mb-4">충전 요청 관리 (${data.charges.length})</h2>
    <div class="space-y-2">
    ${data.charges.length ? data.charges.map(r => `
      <div class="bg-white rounded-2xl border border-gray-100 p-4 flex flex-wrap items-center gap-3 justify-between">
        <div>
          <div class="font-bold">${won(r.amount)}P 충전 요청 ${badge(r.status)}</div>
          <div class="text-xs text-gray-400 mt-0.5">${r.name}(@${r.nickname}) · 입금자명 <b class="text-gray-600">${r.depositor||'-'}</b></div>
          <div class="text-xs text-gray-300">요청 ${fmtDateTime(r.requestedAt)} · 보유 경매P ${won(r.auctionPoint)}</div>
        </div>
        ${r.status==='PENDING' ? `<div class="flex gap-2">
          <button onclick="processCharge('${r.id}','approve')" class="bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-bold">승인(지급)</button>
          <button onclick="processCharge('${r.id}','reject')" class="bg-red-50 text-red-500 px-4 py-2 rounded-xl text-sm font-medium">거절</button>
        </div>` : `<div class="text-xs text-gray-400">${fmtDateTime(r.processedAt)} 처리</div>`}
      </div>`).join('') : '<p class="text-center text-gray-400 py-10">충전 요청이 없습니다.</p>'}
    </div>`)
}
const _chargeProcessing = new Set()
async function processCharge(id, action) {
  if (_chargeProcessing.has(id)) return // 중복 클릭(동시 요청) 방지
  if (!confirm(action==='approve' ? '충전을 승인하시겠습니까? 회원에게 포인트가 지급됩니다.' : '충전 요청을 거절하시겠습니까?')) return
  _chargeProcessing.add(id)
  try { await api.post(`/admin/charge-requests/${id}/process`, { action }); toast(action==='approve'?'충전 승인 완료':'거절 처리됨', 'success'); pageAdminCharges() }
  catch (err) { toast(errMsg(err), 'error') }
  finally { _chargeProcessing.delete(id) }
}

// 구독 관리 — 구독료를 납부한 회원 목록 + 활성/비활성 토글
async function pageAdminSubscriptions() {
  if (!adminGuard()) return
  document.getElementById('app').innerHTML = renderLoading()
  const { data } = await api.get('/admin/subscriptions')
  const subs = data.subscriptions || []
  const activeCount = subs.filter(s => s.subscriptionActive).length
  document.getElementById('app').innerHTML = adminLayout('/admin/subscriptions', `
    <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
      <h2 class="font-bold">구독 회원 관리 (${subs.length}명)</h2>
      <span class="text-sm text-gray-400">활성 <b class="text-green-600">${activeCount}</b> · 비활성 <b class="text-gray-500">${subs.length - activeCount}</b></span>
    </div>
    <div class="bg-orange-50 rounded-2xl px-4 py-3 mb-4 text-xs text-gray-500">
      <i class="fas fa-circle-info text-brand-orange"></i> 회원이 월 구독료(10,000P)를 납부하면 목록에 표시됩니다. <b class="text-brand-orange">활성</b> 버튼을 누르면 구독 기간이 한 달 추가 연장되며, <b>비활성화</b>로 구독을 끌 수 있습니다.
    </div>
    <div class="space-y-2">
    ${subs.length ? subs.map(s => `
      <div class="bg-white rounded-2xl border border-gray-100 p-4 flex flex-wrap items-center gap-3 justify-between">
        <div>
          <div class="font-bold flex items-center gap-2">
            ${s.name}<span class="text-gray-400 font-normal">(@${s.nickname})</span>
            ${s.subscriptionActive
              ? '<span class="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">활성</span>'
              : '<span class="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">비활성</span>'}
          </div>
          <div class="text-xs text-gray-400 mt-0.5">
            최근 납부 ${s.lastPeriod || '-'} · 총 ${s.payCount || 0}회
          </div>
          <div class="flex items-center gap-1.5 mt-1 flex-wrap">
            <span class="text-xs text-gray-500">구독만료</span>
            <input type="date" id="sub-until-${s.id}" value="${s.subscriptionUntil || ''}"
                   class="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:border-brand-orange focus:ring-1 focus:ring-orange-100 outline-none" />
            <button onclick="setSubscriptionUntil('${s.id}')" class="text-xs bg-blue-50 text-blue-600 font-semibold px-2.5 py-1 rounded-lg hover:bg-blue-100 transition"><i class="fas fa-pen"></i> 변경</button>
          </div>
          <div class="text-xs text-gray-300 mt-0.5">${s.email} · 보유 경매P ${won(s.auctionPoint || 0)}</div>
        </div>
        <div class="flex gap-2">
          ${s.subscriptionActive
            ? `<button onclick="extendSubscription('${s.id}')" class="bg-brand-orange text-white px-4 py-2 rounded-xl text-sm font-bold"><i class="fas fa-crown"></i> 활성</button>
               <button onclick="toggleSubscription('${s.id}', false)" class="bg-gray-100 text-gray-600 px-4 py-2 rounded-xl text-sm font-medium">비활성화</button>`
            : `<button onclick="extendSubscription('${s.id}')" class="bg-brand-orange text-white px-4 py-2 rounded-xl text-sm font-bold"><i class="fas fa-crown"></i> 활성</button>
               <button onclick="toggleSubscription('${s.id}', true)" class="bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-bold">활성화</button>`}
        </div>
      </div>`).join('') : '<p class="text-center text-gray-400 py-10">구독료를 납부한 회원이 없습니다.</p>'}
    </div>`)
}
const _subToggling = new Set()
async function toggleSubscription(userId, active) {
  if (_subToggling.has(userId)) return
  _subToggling.add(userId)
  try {
    await api.post(`/admin/subscriptions/${userId}/toggle`, { active })
    toast(active ? '구독을 활성화했습니다.' : '구독을 비활성화했습니다.', 'success')
    pageAdminSubscriptions()
  } catch (err) { toast(errMsg(err), 'error') }
  finally { _subToggling.delete(userId) }
}
// 구독 한 달 추가 활성화(기간 연장)
const _subExtending = new Set()
async function extendSubscription(userId) {
  if (_subExtending.has(userId)) return
  if (!confirm('이 회원의 구독 기간을 한 달 추가 연장하시겠습니까?')) return
  _subExtending.add(userId)
  try {
    const { data } = await api.post(`/admin/subscriptions/${userId}/extend`, {})
    toast(`구독이 한 달 연장되었습니다. (만료일 ${data.until})`, 'success')
    pageAdminSubscriptions()
  } catch (err) { toast(errMsg(err), 'error') }
  finally { _subExtending.delete(userId) }
}
// 구독 만료일 직접 설정 (관리자가 날짜를 지정)
const _subSettingUntil = new Set()
async function setSubscriptionUntil(userId) {
  if (_subSettingUntil.has(userId)) return
  const input = document.getElementById('sub-until-' + userId)
  const until = input ? input.value : ''
  if (!until) { toast('만료일을 선택해주세요.', 'error'); return }
  if (!confirm(`구독 만료일을 ${until} 로 변경하시겠습니까?`)) return
  _subSettingUntil.add(userId)
  try {
    const { data } = await api.post(`/admin/subscriptions/${userId}/set-until`, { until })
    toast(`구독 만료일이 ${data.until}(으)로 변경되었습니다.${data.active ? '' : ' (만료일이 지나 비활성 처리됨)'}`, 'success')
    pageAdminSubscriptions()
  } catch (err) { toast(errMsg(err), 'error') }
  finally { _subSettingUntil.delete(userId) }
}

// 배송 관리 (당첨 상품 배송)
async function pageAdminShipments() {
  if (!adminGuard()) return
  document.getElementById('app').innerHTML = renderLoading()
  const { data } = await api.get('/admin/shipments')
  const badge = (s) => {
    const map = {
      PENDING: ['배송정보 미입력','bg-red-100 text-red-600'],
      SUBMITTED: ['입력완료(발송대기)','bg-blue-100 text-blue-700'],
      SHIPPED: ['발송됨','bg-green-100 text-green-700'],
      DELIVERED: ['배송완료','bg-gray-100 text-gray-600'],
    }
    const [t, cls] = map[s] || [s,'bg-gray-100']; return `<span class="text-xs px-2 py-0.5 rounded-full ${cls}">${t}</span>`
  }
  document.getElementById('app').innerHTML = adminLayout('/admin/shipments', `
    <h2 class="font-bold mb-1">당첨 상품 배송 관리 (${data.shipments.length})</h2>
    <p class="text-xs text-gray-400 mb-4"><i class="fas fa-circle-info"></i> 회원이 배송정보를 입력하면 <b>발송대기</b>로 표시됩니다. 발송 처리 후에는 회원이 정보를 수정할 수 없습니다. (당첨 상품은 반품 불가)</p>
    <div class="space-y-2">
    ${data.shipments.length ? data.shipments.map(s => {
      const hasAddr = s.shippingStatus !== 'PENDING'
      return `<div class="bg-white rounded-2xl border border-gray-100 p-4">
        <div class="flex items-start gap-3">
          <img src="${s.imageUrl}" class="w-14 h-14 rounded-xl object-cover" onerror="this.src='https://placehold.co/56'" />
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-2 flex-wrap">
              <div class="font-bold text-sm truncate">${s.title}</div>${badge(s.shippingStatus)}
            </div>
            <div class="text-xs text-gray-400 mt-0.5">${s.memberName}(@${s.nickname}) · 낙찰가 ${won(s.startPrice)}원 · ${fmtDateTime(s.drawnAt)}</div>
            ${hasAddr ? `<div class="text-xs text-gray-600 mt-2 bg-gray-50 rounded-lg p-2 space-y-0.5">
              <div><b>받는분</b> ${s.recipientName || '-'} · ${s.recipientPhone || '-'}</div>
              <div><b>주소</b> ${s.postalCode ? '('+s.postalCode+') ' : ''}${s.address1 || '-'} ${s.address2 || ''}</div>
              ${s.deliveryMemo ? `<div><b>메모</b> ${s.deliveryMemo}</div>` : ''}
            </div>` : `<div class="text-xs text-red-400 mt-2">회원이 아직 배송정보를 입력하지 않았습니다.</div>`}
          </div>
        </div>
        ${hasAddr ? `<div class="flex gap-2 mt-3 justify-end">
          ${s.shippingStatus === 'SUBMITTED' ? `<button onclick="setShipStatus('${s.id}','SHIPPED')" class="bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-bold">🚚 발송 처리</button>` : ''}
          ${s.shippingStatus === 'SHIPPED' ? `<button onclick="setShipStatus('${s.id}','DELIVERED')" class="bg-brand-dark text-white px-4 py-2 rounded-xl text-sm font-bold">✅ 배송완료</button>` : ''}
        </div>` : ''}
      </div>`
    }).join('') : '<p class="text-center text-gray-400 py-10">당첨 상품이 없습니다.</p>'}
    </div>`)
}
async function setShipStatus(id, status) {
  const labels = { SHIPPED: '발송 처리', DELIVERED: '배송완료 처리' }
  if (!confirm(`${labels[status]} 하시겠습니까?`)) return
  try { await api.post(`/admin/shipments/${id}/status`, { status }); toast('처리되었습니다.', 'success'); pageAdminShipments() }
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
    <h2 class="font-bold text-lg mb-4">관리자 비밀번호 변경</h2>
    <form id="pw-form" class="bg-white rounded-2xl border border-gray-100 p-5 space-y-3 max-w-lg mb-8">
      <p class="text-xs text-gray-400 -mt-1 mb-1"><i class="fas fa-shield-halved"></i> 보안을 위해 기본 비밀번호(admin123)는 반드시 변경하세요.</p>
      <div>
        <label class="block text-sm font-medium mb-1">현재 비밀번호</label>
        <input name="currentPassword" type="password" autocomplete="current-password" required class="w-full px-4 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-brand-orange" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">새 비밀번호 <span class="text-gray-400 font-normal">(6자 이상)</span></label>
        <input name="newPassword" type="password" autocomplete="new-password" minlength="6" required class="w-full px-4 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-brand-orange" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">새 비밀번호 확인</label>
        <input name="newPasswordConfirm" type="password" autocomplete="new-password" minlength="6" required class="w-full px-4 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-brand-orange" />
      </div>
      <button type="submit" class="w-full bg-brand-dark text-white font-bold py-3 rounded-xl hover:bg-gray-800"><i class="fas fa-key mr-1"></i> 비밀번호 변경</button>
    </form>

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

  // 관리자 비밀번호 변경
  document.getElementById('pw-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const fd = new FormData(e.target)
    const currentPassword = String(fd.get('currentPassword') || '')
    const newPassword = String(fd.get('newPassword') || '')
    const newPasswordConfirm = String(fd.get('newPasswordConfirm') || '')

    if (newPassword.length < 6) { toast('새 비밀번호는 6자 이상이어야 합니다.', 'error'); return }
    if (newPassword !== newPasswordConfirm) { toast('새 비밀번호 확인이 일치하지 않습니다.', 'error'); return }

    const btn = e.target.querySelector('button[type="submit"]')
    const orig = btn.innerHTML
    btn.disabled = true
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> 변경 중...'
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword })
      toast('비밀번호가 변경되었습니다. ✅', 'success')
      e.target.reset()
    } catch (err) {
      toast(errMsg(err), 'error')
    } finally {
      btn.disabled = false
      btn.innerHTML = orig
    }
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
  // 서브트리 폭 기반 레이아웃 — 회원/추천인이 많아져도 노드가 겹치지 않음
  const { positions, svgW, svgH } = buildTreeLayout(root.id, byParent, { NODE_W, NODE_H, H_GAP, V_GAP })

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
    const gi = gradeInfo(m.grade)
    const fill = isRoot || isAdmin ? '#FFC107' : gi.color
    const s = summary[m.id] || { bids: 0, wins: 0 }
    const nodePayload = JSON.stringify({ ...m, ...s, isRoot }).replace(/'/g, '&#39;')
    nodeEls += `<g transform="translate(${pos.x},${pos.y})" style="cursor:pointer" onclick='showAdminNodeDetail(${nodePayload})'>
      <rect width="${NODE_W}" height="${NODE_H}" rx="12" fill="white" stroke="${fill}" stroke-width="2.5"/>
      <rect width="6" height="${NODE_H}" rx="3" fill="${fill}"/>
      ${isAdmin ? '' : `<rect x="${NODE_W - 52}" y="8" width="44" height="17" rx="8.5" fill="${fill}"/><text x="${NODE_W - 30}" y="20" font-size="9.5" font-weight="700" fill="white" text-anchor="middle">${gi.label}</text>`}
      <text x="16" y="22" font-size="14" font-weight="700" fill="#2D3748">${m.name}${isAdmin?' 👑':''}</text>
      <text x="16" y="40" font-size="11" fill="#718096">@${m.nickname} · ${m.referralCode}</text>
      <text x="16" y="56" font-size="10" fill="#a0aec0">참여${s.bids}/당첨${s.wins} · 경매${won(m.auctionPoint)}P</text>
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
        <div class="flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-gray-500 mb-3">
          <span><span class="inline-block w-3 h-3 rounded align-middle" style="background:#FFC107"></span> 회사(관리자)</span>
          ${GRADE_ORDER.map(g => `<span><span class="inline-block w-3 h-3 rounded align-middle" style="background:${gradeColor(g)}"></span> ${gradeInfo(g).label}</span>`).join('')}
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
      <div class="mt-1.5">${isAdmin ? '<span class="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800"><i class="fas fa-crown"></i> 관리자</span>' : gradeBadge(n.grade)}</div>
    </div>
    <div class="space-y-2 text-sm">
      ${isAdmin ? '' : `<div class="flex justify-between py-2 border-b border-gray-50"><span class="text-gray-400">등급</span><span class="font-medium">${gradeInfo(n.grade).label}</span></div>`}
      <div class="flex justify-between py-2 border-b border-gray-50"><span class="text-gray-400">가입일</span><span class="font-medium">${fmtDate(n.createdAt)}</span></div>
      <div class="flex justify-between py-2 border-b border-gray-50"><span class="text-gray-400">경매 참여</span><span class="font-medium">${n.bids}회</span></div>
      <div class="flex justify-between py-2 border-b border-gray-50"><span class="text-gray-400">낙찰</span><span class="font-medium text-brand-orange">${n.wins}회</span></div>
      <div class="flex justify-between py-2 border-b border-gray-50"><span class="text-gray-400">경매P</span><span class="font-medium text-brand-orange">${won(n.auctionPoint)}</span></div>
    </div>
    ${isAdmin ? '' : `<button onclick="openMemberEdit('${n.id}')" class="w-full mt-4 bg-gray-100 text-gray-700 py-2.5 rounded-xl text-sm font-medium"><i class="fas fa-pen"></i> 이 회원 수정</button>`}`
}
