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
  const from = query.from || ''
  const to = query.to || ''
  const qs = []
  if (q) qs.push('q=' + encodeURIComponent(q))
  if (from) qs.push('from=' + encodeURIComponent(from))
  if (to) qs.push('to=' + encodeURIComponent(to))
  const { data } = await api.get('/admin/members' + (qs.length ? '?' + qs.join('&') : ''))
  const hasFilter = q || from || to
  document.getElementById('app').innerHTML = adminLayout('/admin/members', `
    <div class="flex items-center justify-between mb-3 gap-2 flex-wrap">
      <h2 class="font-bold">회원 목록 (${data.members.length})</h2>
      <a href="#/admin/network" class="bg-blue-600 text-white px-3 py-2 rounded-xl text-sm font-semibold whitespace-nowrap"><i class="fas fa-sitemap"></i> 조직도 보기</a>
    </div>
    <div class="bg-white rounded-2xl border border-gray-100 p-3 mb-4">
      <p class="text-xs text-gray-400 mb-2"><i class="fas fa-circle-info text-brand-orange"></i> 아이디/이름/닉네임으로 검색 후 <b class="text-brand-orange">지급/회수</b> 버튼으로 경매P를 지급하거나, 잘못 충전·지급한 포인트를 <b class="text-red-500">회수(복구)</b>할 수 있습니다.</p>
      <form id="member-search" class="flex gap-2 w-full mb-2">
        <input name="q" value="${q}" placeholder="아이디 · 이름 · 닉네임으로 검색" class="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-brand-orange" />
        <button type="submit" class="bg-brand-orange text-white px-5 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap"><i class="fas fa-search"></i> 검색</button>
      </form>
      <div class="flex flex-wrap items-end gap-2 pt-2 border-t border-gray-50">
        <div class="flex flex-col">
          <label class="text-xs text-gray-500 mb-1">가입 시작일</label>
          <input type="date" id="member-from" value="${from}" class="border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
        </div>
        <div class="flex flex-col">
          <label class="text-xs text-gray-500 mb-1">가입 종료일</label>
          <input type="date" id="member-to" value="${to}" class="border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
        </div>
        <button onclick="applyMemberDate()" class="px-3 py-1.5 rounded-lg bg-brand-orange text-white text-sm font-bold hover:opacity-90"><i class="fas fa-calendar-day"></i> 기간 조회</button>
        ${hasFilter ? `<a href="#/admin/members" class="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 text-sm hover:bg-gray-100 flex items-center"><i class="fas fa-rotate-left"></i> 초기화</a>` : ''}
        <div class="ml-auto flex gap-2">
          <button onclick="downloadMembers('csv')" class="px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm font-bold hover:opacity-90"><i class="fas fa-file-csv"></i> CSV</button>
          <button onclick="downloadMembers('xlsx')" class="px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-sm font-bold hover:opacity-90"><i class="fas fa-file-excel"></i> Excel</button>
        </div>
      </div>
      ${(from || to) ? `<p class="text-xs text-blue-600 mt-2"><i class="fas fa-filter"></i> 가입일 ${from || '처음'} ~ ${to || '오늘'} 기준</p>` : ''}
    </div>
    <div class="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
      <table class="w-full text-sm min-w-[640px]">
        <thead class="bg-gray-50 text-gray-500 text-xs"><tr>
          <th class="text-left px-3 py-2">회원</th><th class="px-3 py-2">등급</th><th class="px-3 py-2">상태</th><th class="px-3 py-2">추천인</th>
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
          <td class="px-3 py-2 text-center">${m.role==='ADMIN' ? '<span class="text-xs text-gray-300">-</span>' : (
            Number(m.active) === 0
              ? `<button onclick="toggleMemberActive('${m.id}', 1)" class="text-xs bg-red-50 text-red-500 px-2 py-1 rounded-full font-medium"><i class="fas fa-circle-xmark"></i> 비활성</button>`
              : `<button onclick="toggleMemberActive('${m.id}', 0)" class="text-xs bg-green-50 text-green-600 px-2 py-1 rounded-full font-medium"><i class="fas fa-circle-check"></i> 활성</button>`
          )}</td>
          <td class="px-3 py-2 text-center text-xs text-gray-500">${m.referrerNickname || '-'}</td>
          <td class="px-3 py-2 text-center font-medium text-brand-orange">${won(m.auctionPoint)}</td>
          <td class="px-3 py-2">
            <div class="flex gap-1 justify-center whitespace-nowrap">
              <button onclick="openMemberDetail('${m.id}')" class="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-lg font-medium"><i class="fas fa-id-card"></i> 상세</button>
              <button onclick="openAdjust('${m.id}','${m.nickname}', ${Number(m.auctionPoint) || 0})" class="text-xs bg-orange-50 text-brand-orange px-2 py-1 rounded-lg font-medium"><i class="fas fa-coins"></i> 지급/회수</button>
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
    const fromEl = document.getElementById('member-from')
    const toEl = document.getElementById('member-to')
    navMembers(q, fromEl ? fromEl.value : '', toEl ? toEl.value : '')
  })
}

// 회원목록 필터 쿼리로 이동
function navMembers(q, from, to) {
  const parts = []
  if (q) parts.push('q=' + encodeURIComponent(q))
  if (from) parts.push('from=' + encodeURIComponent(from))
  if (to) parts.push('to=' + encodeURIComponent(to))
  Router.navigate('/admin/members' + (parts.length ? '?' + parts.join('&') : ''))
}

// "기간 조회" — 현재 검색어 유지한 채 날짜 필터 적용
function applyMemberDate() {
  const qEl = document.querySelector('#member-search input[name="q"]')
  const fromEl = document.getElementById('member-from')
  const toEl = document.getElementById('member-to')
  const from = fromEl ? fromEl.value : ''
  const to = toEl ? toEl.value : ''
  if (from && to && from > to) { toast('시작일이 종료일보다 늦습니다.', 'error'); return }
  navMembers(qEl ? qEl.value : '', from, to)
}

// 현재 필터 기준 회원목록 전체를 CSV/Excel 로 다운로드
async function downloadMembers(format) {
  const qEl = document.querySelector('#member-search input[name="q"]')
  const fromEl = document.getElementById('member-from')
  const toEl = document.getElementById('member-to')
  const q = qEl ? qEl.value : ''
  const from = fromEl ? fromEl.value : ''
  const to = toEl ? toEl.value : ''
  const parts = []
  if (q) parts.push('q=' + encodeURIComponent(q))
  if (from) parts.push('from=' + encodeURIComponent(from))
  if (to) parts.push('to=' + encodeURIComponent(to))

  let data
  try {
    toast('다운로드 준비 중...', 'info')
    data = (await api.get('/admin/members' + (parts.length ? '?' + parts.join('&') : ''))).data
  } catch (err) { toast(errMsg(err), 'error'); return }

  const rows = data.members || []
  if (!rows.length) { toast('다운로드할 회원이 없습니다.', 'error'); return }

  const gradeLabel = (g, role) => role === 'ADMIN' ? '관리자' : (typeof gradeInfo === 'function' ? gradeInfo(g).label : g)
  const header = ['이름', '닉네임', '이메일', '추천코드', '등급', '상태', '추천인', '경매P', '가입일']
  const body = rows.map(m => [
    m.name, m.nickname, m.email, m.referralCode,
    gradeLabel(m.grade, m.role),
    m.role === 'ADMIN' ? '-' : (Number(m.active) === 0 ? '비활성' : '활성'),
    m.referrerNickname || '',
    Number(m.auctionPoint) || 0,
    fmtDateTime(m.createdAt),
  ])
  const range = (from || to) ? `_${from || '처음'}_${to || '오늘'}` : '_전체'
  await downloadTable(format, header, body, `회원목록${range}`, '회원목록')
}

// 회원 목록에서 등급 인라인 변경
async function changeGradeInline(userId, grade) {
  try {
    const { data } = await api.post('/admin/members/' + userId + '/grade', { grade })
    if (data && data.referralPaid) toast(gradeInfo(grade).label + ' 등급으로 변경되어 추천 보상이 지급되었습니다.', 'success')
    else toast(gradeInfo(grade).label + ' 등급으로 변경되었습니다.', 'success')
  } catch (err) { toast(errMsg(err), 'error'); Router.resolve() }
}

// 회원 활성/비활성 토글
async function toggleMemberActive(userId, next) {
  const label = next === 1 ? '활성' : '비활성'
  if (!confirm(`이 회원을 ${label} 상태로 변경하시겠습니까?`)) { Router.resolve(); return }
  try {
    const { data } = await api.post('/admin/members/' + userId + '/active', { active: next })
    if (data && data.referralPaid) toast(`${label} 처리되어 추천 보상이 지급되었습니다.`, 'success')
    else toast(`${label} 처리되었습니다.`, 'success')
    Router.resolve()
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
      <button onclick="closeModal();openAdjust('${m.id}','${m.nickname}', ${Number(m.auctionPoint) || 0})" class="flex-1 bg-orange-50 text-brand-orange py-2.5 rounded-xl font-bold text-sm"><i class="fas fa-coins"></i> 지급/회수</button>
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
function openAdjust(userId, nickname, currentPoint) {
  const balance = Number(currentPoint) || 0
  openModal(`<div class="p-6">
    <h3 class="font-extrabold text-lg mb-1"><i class="fas fa-coins text-brand-orange"></i> 포인트 지급 / 회수</h3>
    <p class="text-sm text-gray-400 mb-3">@${nickname} 회원의 경매포인트를 직접 지급하거나 회수(복구)합니다.</p>

    <div class="bg-gray-50 rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
      <span class="text-xs text-gray-500"><i class="fas fa-wallet text-brand-orange"></i> 현재 보유 경매P</span>
      <b id="adj-balance" class="text-brand-dark">${won(balance)} P</b>
    </div>

    <!-- 지급 / 회수 모드 선택 -->
    <div class="grid grid-cols-2 gap-2 mb-3">
      <button type="button" id="adj-mode-give" onclick="setAdjustMode('give')" class="py-2.5 rounded-xl font-bold text-sm border-2 border-brand-orange bg-orange-50 text-brand-orange transition"><i class="fas fa-plus-circle"></i> 지급</button>
      <button type="button" id="adj-mode-take" onclick="setAdjustMode('take')" class="py-2.5 rounded-xl font-bold text-sm border-2 border-gray-200 bg-white text-gray-500 transition"><i class="fas fa-rotate-left"></i> 회수(복구)</button>
    </div>

    <div class="space-y-3">
      <div><label class="block text-xs font-medium text-gray-500 mb-1">금액 (P) — 항상 양수로 입력</label>
        <input id="adj-amount" type="number" min="1" oninput="updateAdjustPreview(${balance})" placeholder="예: 20000" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-brand-orange" /></div>
      <div id="adj-preview" class="hidden text-sm rounded-xl px-4 py-2.5"></div>
      <div><label class="block text-xs font-medium text-gray-500 mb-1">사유 (선택)</label>
        <input id="adj-reason" placeholder="예: 충전 착오 정정 / 이벤트 지급" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-brand-orange" /></div>
    </div>
    <div class="flex gap-2 mt-5">
      <button onclick="closeModal()" class="flex-1 border border-gray-200 py-2.5 rounded-xl">취소</button>
      <button id="adj-submit" onclick="doAdjust('${userId}', ${balance})" class="flex-1 bg-brand-orange text-white py-2.5 rounded-xl font-bold"><i class="fas fa-plus-circle"></i> 지급하기</button>
    </div>
  </div>`)
  window._adjustMode = 'give'
}
function setAdjustMode(mode) {
  window._adjustMode = mode
  const give = document.getElementById('adj-mode-give')
  const take = document.getElementById('adj-mode-take')
  const submit = document.getElementById('adj-submit')
  const onCls = ['border-brand-orange', 'bg-orange-50', 'text-brand-orange']
  const offCls = ['border-gray-200', 'bg-white', 'text-gray-500']
  if (mode === 'give') {
    give.classList.add(...onCls); give.classList.remove(...offCls)
    take.classList.add(...offCls); take.classList.remove(...onCls)
    submit.className = 'flex-1 bg-brand-orange text-white py-2.5 rounded-xl font-bold'
    submit.innerHTML = '<i class="fas fa-plus-circle"></i> 지급하기'
  } else {
    take.classList.add('border-red-400', 'bg-red-50', 'text-red-500'); take.classList.remove(...offCls)
    give.classList.add(...offCls); give.classList.remove(...onCls)
    submit.className = 'flex-1 bg-red-500 text-white py-2.5 rounded-xl font-bold'
    submit.innerHTML = '<i class="fas fa-rotate-left"></i> 회수하기'
  }
  const amtEl = document.getElementById('adj-amount')
  updateAdjustPreview(Number(amtEl?.dataset.balance ?? 0) || window._adjustBalance || 0)
}
function updateAdjustPreview(balance) {
  window._adjustBalance = balance
  const amt = Math.abs(Number(document.getElementById('adj-amount').value) || 0)
  const prev = document.getElementById('adj-preview')
  if (!amt) { prev.classList.add('hidden'); return }
  prev.classList.remove('hidden')
  if (window._adjustMode === 'take') {
    const after = balance - amt
    if (after < 0) {
      prev.className = 'text-sm rounded-xl px-4 py-2.5 bg-red-50 text-red-600'
      prev.innerHTML = `<i class="fas fa-triangle-exclamation"></i> 보유 ${won(balance)}P 보다 많이 회수할 수 없습니다. (회수 후 음수 불가)`
    } else {
      prev.className = 'text-sm rounded-xl px-4 py-2.5 bg-red-50 text-red-600'
      prev.innerHTML = `<i class="fas fa-rotate-left"></i> <b>${won(amt)}P</b> 회수 → 잔액 <b>${won(after)}P</b>`
    }
  } else {
    prev.className = 'text-sm rounded-xl px-4 py-2.5 bg-orange-50 text-brand-orange'
    prev.innerHTML = `<i class="fas fa-plus-circle"></i> <b>${won(amt)}P</b> 지급 → 잔액 <b>${won(balance + amt)}P</b>`
  }
}
async function doAdjust(userId, balance) {
  const raw = Math.abs(Number(document.getElementById('adj-amount').value) || 0)
  const reason = document.getElementById('adj-reason').value
  if (!raw) { toast('금액을 입력해주세요.', 'warn'); return }
  const isTake = window._adjustMode === 'take'
  const amount = isTake ? -raw : raw
  if (isTake && (Number(balance) || 0) - raw < 0) {
    toast('보유 포인트보다 많이 회수할 수 없습니다.', 'warn'); return
  }
  const finalReason = reason || (isTake ? '관리자 회수(복구)' : '관리자 지급')
  if (!confirm(isTake
    ? `@회원에게서 ${won(raw)}P 를 회수(복구)합니다. 진행할까요?`
    : `@회원에게 ${won(raw)}P 를 지급합니다. 진행할까요?`)) return
  try {
    await api.post(`/admin/members/${userId}/adjust`, { amount, reason: finalReason })
    closeModal(); toast(isTake ? `${won(raw)}P 회수 완료 ↩️` : `${won(raw)}P 지급 완료 ✅`, 'success'); pageAdminMembers({}, getQuery())
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
    <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
      <h2 class="font-bold"><i class="fas fa-layer-group text-brand-orange"></i> 등급별 포인트 일괄 지급</h2>
      <button onclick="openGrantHistory()" class="bg-white border border-brand-orange text-brand-orange px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap hover:bg-orange-50"><i class="fas fa-clock-rotate-left"></i> 지급내역 보기</button>
    </div>

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

// 지급 내역 보기 — 관리자가 보낸 모든 지급/회수 이력
//  · 등급 일괄지급 / 월 구독료 수금(배치) + 개별 회원 지급·회수(건별)
//  · 페이지네이션(더 보기)로 대량 데이터 대비
const GRANT_HISTORY_PAGE = 20
let _grantHistoryOffset = 0
let _grantHistoryTotal = 0
let _grantHistoryLoading = false
let _grantHistoryFrom = ''   // YYYY-MM-DD (선택 시작일)
let _grantHistoryTo = ''     // YYYY-MM-DD (선택 종료일)

// 현재 선택된 날짜 필터를 쿼리스트링으로 (앞에 &from=..&to=.. 형태)
function grantHistoryDateQS() {
  let qs = ''
  if (_grantHistoryFrom) qs += `&from=${encodeURIComponent(_grantHistoryFrom)}`
  if (_grantHistoryTo) qs += `&to=${encodeURIComponent(_grantHistoryTo)}`
  return qs
}

// 내역 1건 → HTML 카드
function renderGrantHistoryItem(h) {
  const amt = Number(h.totalAmount)
  const amountColor = amt < 0 ? 'text-red-500' : 'text-green-600'
  const sign = amt < 0 ? '' : '+'
  let badge, sub
  if (h.kind === 'SUBSCRIPTION') {
    badge = '<span class="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-bold">구독료 수금</span>'
    sub = `대상 ${won(h.count)}명 · 1인당 ${won(Math.round(Math.abs(amt) / (h.count || 1)))}P`
  } else if (h.kind === 'GRANT') {
    badge = '<span class="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-bold">일괄 지급</span>'
    sub = `대상 ${won(h.count)}명 · 1인당 ${won(Math.round(Math.abs(amt) / (h.count || 1)))}P`
  } else {
    // 개별 회원 지급/회수
    badge = amt < 0
      ? '<span class="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-bold">개별 회수</span>'
      : '<span class="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold">개별 지급</span>'
    const who = h.userName ? `${h.userName}${h.userNickname ? '(@' + h.userNickname + ')' : ''}` : '(삭제된 회원)'
    sub = `대상 ${who}`
  }
  return `
    <div class="bg-gray-50 rounded-xl p-3">
      <div class="flex items-center justify-between gap-2 mb-1">
        <div class="flex items-center gap-2">${badge}<span class="text-xs text-gray-400">${fmtDateTime(h.createdAt)}</span></div>
        <div class="font-extrabold ${amountColor} whitespace-nowrap">${sign}${won(amt)}P</div>
      </div>
      <div class="text-sm text-gray-600">${h.description || '-'}</div>
      <div class="text-xs text-gray-400 mt-0.5">${sub}</div>
    </div>`
}

async function openGrantHistory() {
  _grantHistoryOffset = 0
  _grantHistoryTotal = 0
  _grantHistoryFrom = ''
  _grantHistoryTo = ''

  // 모달 뼈대(날짜 선택 + 다운로드 UI 포함)를 먼저 그리고, 목록은 reloadGrantHistory 로 채운다.
  openModal(`
    <div class="p-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-extrabold text-lg"><i class="fas fa-clock-rotate-left text-brand-orange"></i> 지급 내역 <span id="grant-history-count"></span></h3>
        <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times text-lg"></i></button>
      </div>
      <p class="text-xs text-gray-400 mb-3">등급 일괄 지급 · VIP 이상 월 구독료 수금 · 개별 회원 지급/회수 이력입니다. (최근순)</p>

      <div class="bg-gray-50 rounded-xl p-3 mb-3">
        <div class="flex flex-wrap items-end gap-2">
          <div class="flex flex-col">
            <label class="text-xs text-gray-500 mb-1">시작일</label>
            <input type="date" id="grant-history-from" class="border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
          </div>
          <div class="flex flex-col">
            <label class="text-xs text-gray-500 mb-1">종료일</label>
            <input type="date" id="grant-history-to" class="border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
          </div>
          <button onclick="applyGrantHistoryDate()" class="px-3 py-1.5 rounded-lg bg-brand-orange text-white text-sm font-bold hover:opacity-90"><i class="fas fa-magnifying-glass"></i> 조회</button>
          <button onclick="clearGrantHistoryDate()" class="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 text-sm hover:bg-gray-100"><i class="fas fa-rotate-left"></i> 초기화</button>
          <span class="ml-auto flex gap-2">
            <button onclick="downloadGrantHistory('csv')" class="px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm font-bold hover:opacity-90"><i class="fas fa-file-csv"></i> CSV</button>
            <button onclick="downloadGrantHistory('xlsx')" class="px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-sm font-bold hover:opacity-90"><i class="fas fa-file-excel"></i> Excel</button>
          </span>
        </div>
      </div>

      <div id="grant-history-list" class="space-y-2 max-h-[52vh] overflow-y-auto"><div class="p-6 text-center text-gray-400"><i class="fas fa-spinner fa-spin"></i> 불러오는 중...</div></div>
      <div id="grant-history-more" class="mt-3"></div>
    </div>`, { maxWidth: 'max-w-2xl' })

  await reloadGrantHistory()
}

// 날짜 조회 버튼: input 값을 읽어 필터 적용 후 재조회
async function applyGrantHistoryDate() {
  const fromEl = document.getElementById('grant-history-from')
  const toEl = document.getElementById('grant-history-to')
  const from = fromEl ? fromEl.value : ''
  const to = toEl ? toEl.value : ''
  if (from && to && from > to) { toast('시작일이 종료일보다 늦습니다.', 'error'); return }
  _grantHistoryFrom = from
  _grantHistoryTo = to
  await reloadGrantHistory()
}

// 날짜 초기화(전체 보기)
async function clearGrantHistoryDate() {
  _grantHistoryFrom = ''
  _grantHistoryTo = ''
  const fromEl = document.getElementById('grant-history-from')
  const toEl = document.getElementById('grant-history-to')
  if (fromEl) fromEl.value = ''
  if (toEl) toEl.value = ''
  await reloadGrantHistory()
}

// 현재 필터 기준 첫 페이지부터 목록 재조회
async function reloadGrantHistory() {
  _grantHistoryOffset = 0
  _grantHistoryTotal = 0
  const listEl = document.getElementById('grant-history-list')
  if (listEl) listEl.innerHTML = `<div class="p-6 text-center text-gray-400"><i class="fas fa-spinner fa-spin"></i> 불러오는 중...</div>`
  let data
  try { data = (await api.get(`/admin/grant-history?limit=${GRANT_HISTORY_PAGE}&offset=0${grantHistoryDateQS()}`)).data }
  catch (err) { toast(errMsg(err), 'error'); if (listEl) listEl.innerHTML = '<p class="text-center text-gray-400 py-10">불러오지 못했습니다.</p>'; return }

  const history = data.history || []
  _grantHistoryTotal = data.total || history.length
  _grantHistoryOffset = history.length

  const cntEl = document.getElementById('grant-history-count')
  if (cntEl) cntEl.textContent = `(${won(_grantHistoryTotal)})`

  if (listEl) {
    listEl.innerHTML = history.length
      ? history.map(renderGrantHistoryItem).join('')
      : `<p class="text-center text-gray-400 py-10">${(_grantHistoryFrom || _grantHistoryTo) ? '선택한 기간에 지급 내역이 없습니다.' : '아직 지급 내역이 없습니다.'}</p>`
  }
  updateGrantHistoryMore(data.hasMore)
}

// 현재 필터 기준으로 전체 데이터를 받아 CSV/Excel 로 다운로드
async function downloadGrantHistory(format) {
  let data
  try {
    toast('다운로드 준비 중...', 'info')
    data = (await api.get(`/admin/grant-history?all=1${grantHistoryDateQS()}`)).data
  } catch (err) { toast(errMsg(err), 'error'); return }

  const rows = data.history || []
  if (!rows.length) { toast('다운로드할 내역이 없습니다.', 'error'); return }

  const kindLabel = (h) => {
    if (h.kind === 'SUBSCRIPTION') return '구독료 수금'
    if (h.kind === 'GRANT') return '일괄 지급'
    return Number(h.totalAmount) < 0 ? '개별 회수' : '개별 지급'
  }
  const header = ['일시', '구분', '내용', '대상', '대상인원', '금액(P)']
  const body = rows.map(h => {
    const isIndividual = h.kind === 'INDIVIDUAL'
    const target = isIndividual
      ? (h.userName ? `${h.userName}${h.userNickname ? '(@' + h.userNickname + ')' : ''}` : '(삭제된 회원)')
      : ''
    return [
      fmtDateTime(h.createdAt),
      kindLabel(h),
      h.description || '',
      target,
      isIndividual ? '' : (h.count || ''),
      Number(h.totalAmount),
    ]
  })
  const range = (_grantHistoryFrom || _grantHistoryTo)
    ? `_${_grantHistoryFrom || '처음'}_${_grantHistoryTo || '오늘'}`
    : '_전체'
  await downloadTable(format, header, body, `지급내역${range}`, '지급내역')
}

// "더 보기" 버튼 갱신
function updateGrantHistoryMore(hasMore) {
  const el = document.getElementById('grant-history-more')
  if (!el) return
  if (hasMore) {
    el.innerHTML = `<button onclick="loadMoreGrantHistory()" class="w-full py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-500 hover:bg-gray-50">
      <i class="fas fa-angles-down"></i> 더 보기 (${won(_grantHistoryOffset)}/${won(_grantHistoryTotal)})</button>`
  } else {
    el.innerHTML = _grantHistoryTotal > 0
      ? `<p class="text-center text-xs text-gray-300 py-1">모든 내역을 불러왔습니다 (${won(_grantHistoryTotal)}건)</p>`
      : ''
  }
}

async function loadMoreGrantHistory() {
  if (_grantHistoryLoading) return
  _grantHistoryLoading = true
  const moreEl = document.getElementById('grant-history-more')
  if (moreEl) moreEl.innerHTML = `<div class="text-center text-gray-400 py-2"><i class="fas fa-spinner fa-spin"></i></div>`
  try {
    const data = (await api.get(`/admin/grant-history?limit=${GRANT_HISTORY_PAGE}&offset=${_grantHistoryOffset}${grantHistoryDateQS()}`)).data
    const history = data.history || []
    _grantHistoryTotal = data.total || _grantHistoryTotal
    _grantHistoryOffset += history.length
    const listEl = document.getElementById('grant-history-list')
    if (listEl) listEl.insertAdjacentHTML('beforeend', history.map(renderGrantHistoryItem).join(''))
    updateGrantHistoryMore(data.hasMore)
  } catch (err) {
    toast(errMsg(err), 'error')
    updateGrantHistoryMore(true)
  } finally { _grantHistoryLoading = false }
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
async function pageAdminCharges(params, query) {
  if (!adminGuard()) return
  const q = query || getQuery() || {}
  const from = q.from || ''
  const to = q.to || ''
  document.getElementById('app').innerHTML = renderLoading()
  const parts = []
  if (from) parts.push('from=' + encodeURIComponent(from))
  if (to) parts.push('to=' + encodeURIComponent(to))
  const { data } = await api.get('/admin/charge-requests' + (parts.length ? '?' + parts.join('&') : ''))
  const badge = (s) => {
    const map = { PENDING: ['승인 대기','bg-yellow-100 text-yellow-700'], COMPLETED: ['충전 완료','bg-green-100 text-green-700'], REJECTED: ['거절','bg-red-100 text-red-700'] }
    const [t, cls] = map[s] || [s,'bg-gray-100']; return `<span class="text-xs px-2 py-0.5 rounded-full ${cls}">${t}</span>`
  }
  document.getElementById('app').innerHTML = adminLayout('/admin/charges', `
    <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
      <h2 class="font-bold">충전 요청 관리 (${data.charges.length})</h2>
      <button onclick="openChargeHistory()" class="bg-white border border-brand-orange text-brand-orange px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap hover:bg-orange-50"><i class="fas fa-clock-rotate-left"></i> 충전내역 보기</button>
    </div>
    <div class="bg-white rounded-2xl border border-gray-100 p-3 mb-4">
      <div class="flex flex-wrap items-end gap-2">
        <div class="flex flex-col">
          <label class="text-xs text-gray-500 mb-1">요청 시작일</label>
          <input type="date" id="charge-from" value="${from}" class="border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
        </div>
        <div class="flex flex-col">
          <label class="text-xs text-gray-500 mb-1">요청 종료일</label>
          <input type="date" id="charge-to" value="${to}" class="border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
        </div>
        <button onclick="applyChargeDate()" class="px-3 py-1.5 rounded-lg bg-brand-orange text-white text-sm font-bold hover:opacity-90"><i class="fas fa-calendar-day"></i> 기간 조회</button>
        ${(from || to) ? `<a href="#/admin/charges" class="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 text-sm hover:bg-gray-100 flex items-center"><i class="fas fa-rotate-left"></i> 초기화</a>` : ''}
        <span class="ml-auto flex gap-2">
          <button onclick="downloadCharges('csv')" class="px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm font-bold hover:opacity-90"><i class="fas fa-file-csv"></i> CSV</button>
          <button onclick="downloadCharges('xlsx')" class="px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-sm font-bold hover:opacity-90"><i class="fas fa-file-excel"></i> Excel</button>
        </span>
      </div>
      ${(from || to) ? `<p class="text-xs text-blue-600 mt-2"><i class="fas fa-filter"></i> 요청일 ${from || '처음'} ~ ${to || '오늘'} 기준</p>` : ''}
    </div>
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
  try { await api.post(`/admin/charge-requests/${id}/process`, { action }); toast(action==='approve'?'충전 승인 완료':'거절 처리됨', 'success'); pageAdminCharges({}, getQuery()) }
  catch (err) { toast(errMsg(err), 'error') }
  finally { _chargeProcessing.delete(id) }
}

// 충전관리 기간 조회
function applyChargeDate() {
  const fromEl = document.getElementById('charge-from')
  const toEl = document.getElementById('charge-to')
  const from = fromEl ? fromEl.value : ''
  const to = toEl ? toEl.value : ''
  if (from && to && from > to) { toast('시작일이 종료일보다 늦습니다.', 'error'); return }
  const parts = []
  if (from) parts.push('from=' + encodeURIComponent(from))
  if (to) parts.push('to=' + encodeURIComponent(to))
  Router.navigate('/admin/charges' + (parts.length ? '?' + parts.join('&') : ''))
}

// 충전 요청 목록 CSV/Excel 다운로드 (현재 기간 필터 기준)
async function downloadCharges(format) {
  const fromEl = document.getElementById('charge-from')
  const toEl = document.getElementById('charge-to')
  const from = fromEl ? fromEl.value : ''
  const to = toEl ? toEl.value : ''
  const parts = []
  if (from) parts.push('from=' + encodeURIComponent(from))
  if (to) parts.push('to=' + encodeURIComponent(to))
  let data
  try {
    toast('다운로드 준비 중...', 'info')
    data = (await api.get('/admin/charge-requests' + (parts.length ? '?' + parts.join('&') : ''))).data
  } catch (err) { toast(errMsg(err), 'error'); return }
  const rows = data.charges || []
  if (!rows.length) { toast('다운로드할 충전 요청이 없습니다.', 'error'); return }
  const statLabel = (s) => ({ PENDING: '승인 대기', COMPLETED: '충전 완료', REJECTED: '거절' }[s] || s)
  const header = ['요청일', '상태', '금액(P)', '회원', '닉네임', '이메일', '입금자명', '처리일']
  const body = rows.map(r => [
    fmtDateTime(r.requestedAt),
    statLabel(r.status),
    Number(r.amount) || 0,
    r.name || '', r.nickname || '', r.email || '',
    r.depositor || '',
    r.status !== 'PENDING' ? fmtDateTime(r.processedAt) : '',
  ])
  const range = (from || to) ? `_${from || '처음'}_${to || '오늘'}` : '_전체'
  await downloadTable(format, header, body, `충전요청${range}`, '충전요청')
}

// 충전 내역 보기 — 지금까지의 충전 요청/처리 이력 전체 (완료·거절·대기 포함)
async function openChargeHistory() {
  openModal(`<div class="p-6 text-center text-gray-400"><i class="fas fa-spinner fa-spin"></i> 불러오는 중...</div>`, { maxWidth: 'max-w-2xl' })
  let charges = []
  try { charges = (await api.get('/admin/charge-requests')).data.charges || [] }
  catch (err) { toast(errMsg(err), 'error'); closeModal(); return }

  const badge = (s) => {
    const map = { PENDING: ['승인 대기','bg-yellow-100 text-yellow-700'], COMPLETED: ['충전 완료','bg-green-100 text-green-700'], REJECTED: ['거절','bg-red-100 text-red-700'] }
    const [t, cls] = map[s] || [s,'bg-gray-100 text-gray-600']; return `<span class="text-xs px-2 py-0.5 rounded-full ${cls} font-bold">${t}</span>`
  }
  // 완료 건 합계 요약
  const completed = charges.filter(r => r.status === 'COMPLETED')
  const completedSum = completed.reduce((s, r) => s + Number(r.amount || 0), 0)

  const rows = charges.length ? charges.map(r => `
    <div class="bg-gray-50 rounded-xl p-3">
      <div class="flex items-center justify-between gap-2 mb-1">
        <div class="flex items-center gap-2">${badge(r.status)}<span class="text-xs text-gray-400">${fmtDateTime(r.requestedAt)}</span></div>
        <div class="font-extrabold text-gray-700 whitespace-nowrap">${won(r.amount)}P</div>
      </div>
      <div class="text-sm text-gray-600">${r.name || '-'}(@${r.nickname || '-'}) · 입금자명 <b class="text-gray-700">${r.depositor || '-'}</b></div>
      ${r.status !== 'PENDING' ? `<div class="text-xs text-gray-400 mt-0.5">처리 ${fmtDateTime(r.processedAt)}</div>` : ''}
    </div>`).join('') : '<p class="text-center text-gray-400 py-10">아직 충전 내역이 없습니다.</p>'

  // 다운로드용 캐시
  _chargeHistoryCache = charges

  openModal(`
    <div class="p-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-extrabold text-lg"><i class="fas fa-clock-rotate-left text-brand-orange"></i> 충전 내역 (${charges.length})</h3>
        <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times text-lg"></i></button>
      </div>
      <div class="bg-green-50 rounded-xl p-3 mb-3 flex items-center justify-between">
        <span class="text-sm text-green-700 font-medium"><i class="fas fa-check-circle"></i> 충전 완료 ${completed.length}건</span>
        <span class="font-extrabold text-green-700">누적 ${won(completedSum)}P</span>
      </div>
      <div class="flex justify-end gap-2 mb-3">
        <button onclick="downloadChargeHistory('csv')" class="px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm font-bold hover:opacity-90"><i class="fas fa-file-csv"></i> CSV</button>
        <button onclick="downloadChargeHistory('xlsx')" class="px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-sm font-bold hover:opacity-90"><i class="fas fa-file-excel"></i> Excel</button>
      </div>
      <div class="space-y-2 max-h-[52vh] overflow-y-auto">${rows}</div>
    </div>`, { maxWidth: 'max-w-2xl' })
}

let _chargeHistoryCache = []
// 충전 내역(모달) CSV/Excel 다운로드
async function downloadChargeHistory(format) {
  const rows = _chargeHistoryCache || []
  if (!rows.length) { toast('다운로드할 충전 내역이 없습니다.', 'error'); return }
  const statLabel = (s) => ({ PENDING: '승인 대기', COMPLETED: '충전 완료', REJECTED: '거절' }[s] || s)
  const header = ['요청일', '상태', '금액(P)', '회원', '닉네임', '입금자명', '처리일']
  const body = rows.map(r => [
    fmtDateTime(r.requestedAt),
    statLabel(r.status),
    Number(r.amount) || 0,
    r.name || '', r.nickname || '',
    r.depositor || '',
    r.status !== 'PENDING' ? fmtDateTime(r.processedAt) : '',
  ])
  await downloadTable(format, header, body, '충전내역_전체', '충전내역')
}

// 구독 관리 — 구독료를 납부한 회원 목록 + 활성/비활성 토글
let _adminSubs = []   // 다운로드용 현재 목록 캐시(필터 적용 후)
async function pageAdminSubscriptions(params, query) {
  if (!adminGuard()) return
  const qq = query || getQuery() || {}
  const from = qq.from || ''
  const to = qq.to || ''
  document.getElementById('app').innerHTML = renderLoading()
  const { data } = await api.get('/admin/subscriptions')
  let subs = data.subscriptions || []
  // 최근 납부일(lastPaidAt) 기준 기간 필터 (클라이언트)
  if (from || to) {
    subs = subs.filter(s => {
      const d = (s.lastPaidAt || '').slice(0, 10)   // YYYY-MM-DD
      if (!d) return false                            // 납부 이력 없는 회원은 기간 필터 시 제외
      if (from && d < from) return false
      if (to && d > to) return false
      return true
    })
  }
  _adminSubs = subs
  const activeCount = subs.filter(s => s.subscriptionActive).length
  document.getElementById('app').innerHTML = adminLayout('/admin/subscriptions', `
    <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
      <h2 class="font-bold">구독 회원 관리 (${subs.length}명)</h2>
      <span class="text-sm text-gray-400">활성 <b class="text-green-600">${activeCount}</b> · 비활성 <b class="text-gray-500">${subs.length - activeCount}</b></span>
    </div>
    <div class="bg-white rounded-2xl border border-gray-100 p-3 mb-3">
      <div class="flex flex-wrap items-end gap-2">
        <div class="flex flex-col">
          <label class="text-xs text-gray-500 mb-1">최근납부 시작일</label>
          <input type="date" id="sub-from" value="${from}" class="border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
        </div>
        <div class="flex flex-col">
          <label class="text-xs text-gray-500 mb-1">최근납부 종료일</label>
          <input type="date" id="sub-to" value="${to}" class="border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
        </div>
        <button onclick="applySubDate()" class="px-3 py-1.5 rounded-lg bg-brand-orange text-white text-sm font-bold hover:opacity-90"><i class="fas fa-calendar-day"></i> 기간 조회</button>
        ${(from || to) ? `<a href="#/admin/subscriptions" class="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 text-sm hover:bg-gray-100 flex items-center"><i class="fas fa-rotate-left"></i> 초기화</a>` : ''}
        <span class="ml-auto flex gap-2">
          <button onclick="downloadSubscriptions('csv')" class="px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm font-bold hover:opacity-90"><i class="fas fa-file-csv"></i> CSV</button>
          <button onclick="downloadSubscriptions('xlsx')" class="px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-sm font-bold hover:opacity-90"><i class="fas fa-file-excel"></i> Excel</button>
        </span>
      </div>
      ${(from || to) ? `<p class="text-xs text-blue-600 mt-2"><i class="fas fa-filter"></i> 최근납부일 ${from || '처음'} ~ ${to || '오늘'} 기준 (납부 이력 있는 회원만)</p>` : ''}
    </div>
    <div class="bg-orange-50 rounded-2xl px-4 py-3 mb-4 text-xs text-gray-500">
      <i class="fas fa-circle-info text-brand-orange"></i> 월 구독료(10,000P)를 납부했거나 <b class="text-brand-orange">VIP 이상 등급 + 활성</b> 회원이 자동으로 목록에 표시됩니다. <b class="text-brand-orange">활성</b> 버튼을 누르면 구독 기간이 한 달 추가 연장되며, <b>비활성화</b>로 구독을 끌 수 있습니다.
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
      </div>`).join('') : `<p class="text-center text-gray-400 py-10">${(from || to) ? '선택한 기간에 납부한 구독 회원이 없습니다.' : '구독 대상 회원이 없습니다.'}</p>`}
    </div>`)
}

// 구독관리 기간 조회
function applySubDate() {
  const fromEl = document.getElementById('sub-from')
  const toEl = document.getElementById('sub-to')
  const from = fromEl ? fromEl.value : ''
  const to = toEl ? toEl.value : ''
  if (from && to && from > to) { toast('시작일이 종료일보다 늦습니다.', 'error'); return }
  const parts = []
  if (from) parts.push('from=' + encodeURIComponent(from))
  if (to) parts.push('to=' + encodeURIComponent(to))
  Router.navigate('/admin/subscriptions' + (parts.length ? '?' + parts.join('&') : ''))
}

// 구독 회원 목록 CSV/Excel 다운로드 (현재 화면 필터 기준 = _adminSubs)
async function downloadSubscriptions(format) {
  const rows = _adminSubs || []
  if (!rows.length) { toast('다운로드할 구독 회원이 없습니다.', 'error'); return }
  const gradeLabel = (g) => (typeof gradeInfo === 'function' ? gradeInfo(g).label : g)
  const header = ['이름', '닉네임', '이메일', '등급', '구독상태', '최근납부', '납부횟수', '구독만료', '보유경매P']
  const body = rows.map(s => [
    s.name || '', s.nickname || '', s.email || '',
    gradeLabel(s.grade),
    s.subscriptionActive ? '활성' : '비활성',
    s.lastPeriod || '',
    s.payCount || 0,
    s.subscriptionUntil || '',
    Number(s.auctionPoint) || 0,
  ])
  const qq = getQuery() || {}
  const range = (qq.from || qq.to) ? `_${qq.from || '처음'}_${qq.to || '오늘'}` : '_전체'
  await downloadTable(format, header, body, `구독회원${range}`, '구독회원')
}

const _subToggling = new Set()
async function toggleSubscription(userId, active) {
  if (_subToggling.has(userId)) return
  _subToggling.add(userId)
  try {
    await api.post(`/admin/subscriptions/${userId}/toggle`, { active })
    toast(active ? '구독을 활성화했습니다.' : '구독을 비활성화했습니다.', 'success')
    pageAdminSubscriptions({}, getQuery())
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
    pageAdminSubscriptions({}, getQuery())
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
    pageAdminSubscriptions({}, getQuery())
  } catch (err) { toast(errMsg(err), 'error') }
  finally { _subSettingUntil.delete(userId) }
}

// 배송 관리 (당첨 상품 배송) — 기간/상태 필터 + 엑셀 복사
// 현재 조회된 배송 목록을 모듈 변수에 보관(엑셀 복사용)
let _adminShipments = []
async function pageAdminShipments(params, query) {
  if (!adminGuard()) return
  const q = query || getQuery() || {}
  const from = q.from || ''
  const to = q.to || ''
  const stat = q.status || ''
  document.getElementById('app').innerHTML = renderLoading()

  const qs = new URLSearchParams()
  if (from) qs.set('from', from)
  if (to) qs.set('to', to)
  if (stat) qs.set('status', stat)
  const { data } = await api.get('/admin/shipments' + (qs.toString() ? '?' + qs.toString() : ''))
  _adminShipments = data.shipments

  const badge = (s) => {
    const map = {
      PENDING: ['배송정보 미입력','bg-red-100 text-red-600'],
      SUBMITTED: ['입력완료(발송대기)','bg-blue-100 text-blue-700'],
      SHIPPED: ['발송됨','bg-green-100 text-green-700'],
      DELIVERED: ['배송완료','bg-gray-100 text-gray-600'],
    }
    const [t, cls] = map[s] || [s,'bg-gray-100']; return `<span class="text-xs px-2 py-0.5 rounded-full ${cls}">${t}</span>`
  }
  const statOpt = (v, label) => `<option value="${v}" ${stat===v?'selected':''}>${label}</option>`

  // 엑셀에 붙여넣을 수 있는 건수(배송정보 입력된 건만)
  const copyableCount = data.shipments.filter(s => s.shippingStatus !== 'PENDING').length

  document.getElementById('app').innerHTML = adminLayout('/admin/shipments', `
    <h2 class="font-bold mb-1">당첨 상품 배송 관리 (${data.shipments.length})</h2>
    <p class="text-xs text-gray-400 mb-3"><i class="fas fa-circle-info"></i> 회원이 배송정보를 입력하면 <b>발송대기</b>로 표시됩니다. 발송 처리 후에는 회원이 정보를 수정할 수 없습니다. (당첨 상품은 반품 불가)</p>

    <!-- 기간/상태 필터 + 엑셀 복사 -->
    <div class="bg-white rounded-2xl border border-gray-100 p-4 mb-4">
      <div class="flex flex-wrap items-end gap-2">
        <div>
          <label class="block text-xs text-gray-500 mb-1">시작일</label>
          <input type="date" id="ship-from" value="${from}" class="px-3 py-2 rounded-xl border border-gray-200 outline-none focus:border-brand-orange text-sm" />
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1">종료일</label>
          <input type="date" id="ship-to" value="${to}" class="px-3 py-2 rounded-xl border border-gray-200 outline-none focus:border-brand-orange text-sm" />
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1">상태</label>
          <select id="ship-status" class="px-3 py-2 rounded-xl border border-gray-200 outline-none focus:border-brand-orange text-sm">
            ${statOpt('','전체')}${statOpt('SUBMITTED','발송대기')}${statOpt('SHIPPED','발송됨')}${statOpt('DELIVERED','배송완료')}${statOpt('PENDING','미입력')}
          </select>
        </div>
        <button onclick="applyShipFilter()" class="bg-brand-orange text-white font-bold px-4 py-2 rounded-xl text-sm"><i class="fas fa-filter"></i> 조회</button>
        <button onclick="resetShipFilter()" class="bg-gray-100 text-gray-600 font-bold px-4 py-2 rounded-xl text-sm">초기화</button>
        <div class="flex-1"></div>
        <button onclick="copyShipmentsExcel()" class="bg-green-600 text-white font-bold px-4 py-2 rounded-xl text-sm hover:bg-green-700">
          <i class="fas fa-copy"></i> 엑셀 복사 (${copyableCount}건)
        </button>
      </div>
      <p class="text-[11px] text-gray-400 mt-2"><i class="fas fa-lightbulb"></i> 기간은 <b>배송정보 입력일(미입력 시 당첨일)</b> 기준입니다. '엑셀 복사'를 누르면 배송정보가 입력된 건이 탭으로 구분되어 복사되며, 엑셀/구글시트에 바로 붙여넣기(Ctrl+V) 할 수 있습니다.</p>
    </div>

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
    }).join('') : '<p class="text-center text-gray-400 py-10">조건에 맞는 배송 건이 없습니다.</p>'}
    </div>`)
}

// 필터 적용 (해시 쿼리로 이동 후 재조회)
function applyShipFilter() {
  const from = document.getElementById('ship-from').value
  const to = document.getElementById('ship-to').value
  const stat = document.getElementById('ship-status').value
  const qs = new URLSearchParams()
  if (from) qs.set('from', from)
  if (to) qs.set('to', to)
  if (stat) qs.set('status', stat)
  Router.navigate('/admin/shipments' + (qs.toString() ? '?' + qs.toString() : ''))
}
function resetShipFilter() { Router.navigate('/admin/shipments') }

// 배송정보를 엑셀 붙여넣기용 TSV(탭 구분)로 클립보드에 복사
async function copyShipmentsExcel() {
  const rows = (_adminShipments || []).filter(s => s.shippingStatus !== 'PENDING')
  if (!rows.length) { toast('복사할 배송정보(입력 완료된 건)가 없습니다.', 'warn'); return }
  const statusLabel = { PENDING: '미입력', SUBMITTED: '발송대기', SHIPPED: '발송됨', DELIVERED: '배송완료' }
  const header = ['당첨일','상품명','받는분','연락처','우편번호','주소','상세주소','배송메모','회원명','닉네임','낙찰가','배송상태']
  const esc = (v) => String(v == null ? '' : v).replace(/[\t\r\n]/g, ' ').trim()
  const lines = [header.join('\t')]
  for (const s of rows) {
    lines.push([
      fmtDateTime(s.shippingSubmittedAt || s.drawnAt),
      esc(s.title), esc(s.recipientName), esc(s.recipientPhone),
      esc(s.postalCode), esc(s.address1), esc(s.address2), esc(s.deliveryMemo),
      esc(s.memberName), esc(s.nickname), esc(s.startPrice),
      statusLabel[s.shippingStatus] || s.shippingStatus,
    ].join('\t'))
  }
  const tsv = lines.join('\n')
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(tsv)
    } else {
      // 폴백: 임시 textarea + execCommand
      const ta = document.createElement('textarea')
      ta.value = tsv; ta.style.position = 'fixed'; ta.style.opacity = '0'
      document.body.appendChild(ta); ta.focus(); ta.select()
      document.execCommand('copy'); document.body.removeChild(ta)
    }
    toast(`${rows.length}건의 배송정보를 복사했어요! 엑셀에 붙여넣기(Ctrl+V) 하세요.`, 'success')
  } catch (err) {
    toast('복사에 실패했습니다. 브라우저 권한을 확인해주세요.', 'error')
  }
}

async function setShipStatus(id, status) {
  const labels = { SHIPPED: '발송 처리', DELIVERED: '배송완료 처리' }
  if (!confirm(`${labels[status]} 하시겠습니까?`)) return
  try { await api.post(`/admin/shipments/${id}/status`, { status }); toast('처리되었습니다.', 'success'); applyShipFilterReload() }
  catch (err) { toast(errMsg(err), 'error') }
}
// 상태 변경 후 현재 필터 유지하며 재조회
function applyShipFilterReload() { pageAdminShipments({}, getQuery()) }

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
let _adminNetworkData = null   // { members, summary, total, fullRoot } 캐시

async function pageAdminNetwork(params, query) {
  if (!adminGuard()) return
  document.getElementById('app').innerHTML = renderLoading()
  const { data } = await api.get('/admin/network')
  _adminNetworkData = { members: data.members, summary: data.summary, total: data.total, fullRoot: data.root }
  renderAdminNetwork((query && query.q) || '')
}

// 검색어(q)에 따라 루트를 정해 조직도를 그린다. q 없으면 전체(관리자 루트).
function renderAdminNetwork(q) {
  const { members, summary, total, fullRoot } = _adminNetworkData
  q = (q || '').trim()

  // 검색: 이름/닉네임/추천코드로 매칭되는 첫 회원을 루트로.
  let root = fullRoot
  let searchRoot = null
  if (q) {
    const lower = q.toLowerCase()
    searchRoot = members.find(m =>
      (m.name && m.name.toLowerCase().includes(lower)) ||
      (m.nickname && m.nickname.toLowerCase().includes(lower)) ||
      (m.referralCode && m.referralCode.toLowerCase().includes(lower))
    )
    if (searchRoot) root = searchRoot
  }

  // 추천 관계로 트리 구성 (referrerId 기준) — 전체 회원 기준으로 자식 맵 구성
  const byParent = {}
  members.forEach(m => {
    if (m.id === fullRoot.id) return
    const pid = m.referrerId || '__orphan__'
    ;(byParent[pid] = byParent[pid] || []).push(m)
  })
  // 추천인이 없는(전체 루트가 아닌) 회원은 전체 루트 아래에 묶어 표시
  const orphans = byParent['__orphan__'] || []
  if (orphans.length) {
    byParent[fullRoot.id] = (byParent[fullRoot.id] || []).concat(orphans)
  }

  // 검색 시: root(검색된 회원)와 그 후손만 남기도록 visible 집합 계산
  let visible = null
  if (searchRoot) {
    visible = new Set()
    const stack = [root.id]
    while (stack.length) {
      const id = stack.pop()
      if (visible.has(id)) continue
      visible.add(id)
      ;(byParent[id] || []).forEach(c => stack.push(c.id))
    }
  }
  const inView = (id) => !visible || visible.has(id)
  const viewMembers = visible ? members.filter(m => visible.has(m.id)) : members
  const descendantCount = visible ? (visible.size - 1) : (total - 1)

  const NODE_W = 158, NODE_H = 70, H_GAP = 26, V_GAP = 76
  // 서브트리 폭 기반 레이아웃 — 회원/추천인이 많아져도 노드가 겹치지 않음
  const { positions, svgW, svgH } = buildTreeLayout(root.id, byParent, { NODE_W, NODE_H, H_GAP, V_GAP })

  // 엣지 (검색 시엔 viewMembers = 루트+후손만)
  let edges = ''
  viewMembers.forEach(m => {
    if (m.id === root.id) return
    const pid = m.referrerId || fullRoot.id
    const p = positions[pid], cc = positions[m.id]
    if (!p || !cc) return
    const x1 = p.x + NODE_W/2, y1 = p.y + NODE_H
    const x2 = cc.x + NODE_W/2, y2 = cc.y
    const my = (y1 + y2) / 2
    edges += `<path d="M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}" stroke="#cbd5e0" stroke-width="2" fill="none"/>`
  })

  // 노드
  let nodeEls = ''
  viewMembers.forEach(m => {
    const pos = positions[m.id]
    if (!pos) return
    const isRoot = m.id === root.id
    const isAdmin = m.role === 'ADMIN'
    const gi = gradeInfo(m.grade)
    const fill = isRoot || isAdmin ? '#FFC107' : gi.color
    const s = summary[m.id] || { bids: 0, wins: 0 }
    const nodePayload = JSON.stringify({ ...m, ...s, isRoot }).replace(/'/g, '&#39;')
    // VIP 이상(일반회원 제외, 관리자 제외)만 활성/비활성 상태 점 표시
    const showStatus = !isAdmin && isVipOrAbove(m.grade)
    const statusDot = showStatus
      ? `<circle cx="14" cy="13" r="5" fill="${Number(m.active) === 0 ? '#ef4444' : '#22c55e'}" stroke="white" stroke-width="1.5"/>`
      : ''
    nodeEls += `<g transform="translate(${pos.x},${pos.y})" style="cursor:pointer" onclick='showAdminNodeDetail(${nodePayload})'>
      <rect width="${NODE_W}" height="${NODE_H}" rx="12" fill="white" stroke="${fill}" stroke-width="2.5"/>
      <rect width="6" height="${NODE_H}" rx="3" fill="${fill}"/>
      ${isAdmin ? '' : `<rect x="${NODE_W - 52}" y="8" width="44" height="17" rx="8.5" fill="${fill}"/><text x="${NODE_W - 30}" y="20" font-size="9.5" font-weight="700" fill="white" text-anchor="middle">${gi.label}</text>`}
      <text x="${showStatus ? 26 : 16}" y="22" font-size="14" font-weight="700" fill="#2D3748">${m.name}${isAdmin?' 👑':''}</text>
      <text x="16" y="40" font-size="11" fill="#718096">@${m.nickname} · ${m.referralCode}</text>
      <text x="16" y="56" font-size="10" fill="#a0aec0">참여${s.bids}/당첨${s.wins} · 경매${won(m.auctionPoint)}P</text>
      ${statusDot}
    </g>`
  })

  const notFound = q && !searchRoot
  const headTitle = searchRoot
    ? `${searchRoot.name} 님 하위 조직도`
    : '전체 조직도 (추천인 계보도)'
  const badge = searchRoot
    ? `<span class="text-sm bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full font-medium">본인 포함 ${(visible ? visible.size : 1)}명 (하위 ${descendantCount}명)</span>`
    : `<span class="text-sm bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full font-medium">전체 ${total}명</span>`

  document.getElementById('app').innerHTML = adminLayout('/admin/members', `
    <a href="#/admin/members" class="text-sm text-gray-400 hover:text-brand-orange"><i class="fas fa-chevron-left"></i> 회원목록</a>
    <div class="flex items-center justify-between mt-3 mb-3 flex-wrap gap-2">
      <h2 class="font-bold text-lg"><i class="fas fa-sitemap text-blue-600"></i> ${headTitle}</h2>
      ${badge}
    </div>
    <div class="bg-white rounded-2xl border border-gray-100 p-3 mb-4">
      <p class="text-xs text-gray-400 mb-2"><i class="fas fa-circle-info text-blue-600"></i> 이름·닉네임·추천코드로 검색하면 해당 회원을 <b class="text-blue-600">최상위</b>로 하는 하위 조직도만 볼 수 있습니다.</p>
      <form id="network-search" class="flex gap-2 w-full">
        <input name="q" value="${q ? q.replace(/"/g, '&quot;') : ''}" placeholder="이름 · 닉네임 · 추천코드로 검색" class="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-blue-500" />
        <button type="submit" class="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap"><i class="fas fa-search"></i> 검색</button>
        ${searchRoot ? `<button type="button" onclick="clearNetworkSearch()" class="bg-gray-100 text-gray-500 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap"><i class="fas fa-rotate-left"></i> 전체보기</button>` : ''}
      </form>
      ${notFound ? `<p class="text-xs text-red-500 mt-2"><i class="fas fa-triangle-exclamation"></i> "${q}" 와(과) 일치하는 회원을 찾지 못했습니다. 전체 조직도를 표시합니다.</p>` : ''}
    </div>
    <div class="grid lg:grid-cols-3 gap-4">
      <div class="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-4 overflow-auto">
        <div class="flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-gray-500 mb-3">
          <span><span class="inline-block w-3 h-3 rounded align-middle" style="background:#FFC107"></span> 회사(관리자)</span>
          ${GRADE_ORDER.map(g => `<span><span class="inline-block w-3 h-3 rounded align-middle" style="background:${gradeColor(g)}"></span> ${gradeInfo(g).label}</span>`).join('')}
          <span class="text-gray-300">|</span>
          <span><span class="inline-block w-2.5 h-2.5 rounded-full align-middle" style="background:#22c55e"></span> VIP↑ 활성</span>
          <span><span class="inline-block w-2.5 h-2.5 rounded-full align-middle" style="background:#ef4444"></span> VIP↑ 비활성</span>
        </div>
        <svg viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" style="min-width:${svgW}px">${edges}${nodeEls}</svg>
      </div>
      <div id="admin-node-detail" class="bg-white rounded-2xl border border-gray-100 p-5">
        <div class="text-center text-gray-400 py-8"><div class="text-3xl mb-2">👆</div><p class="text-sm">노드를 클릭하면<br/>회원 상세가 표시돼요</p></div>
      </div>
    </div>`)

  const sf = document.getElementById('network-search')
  if (sf) sf.addEventListener('submit', (e) => {
    e.preventDefault()
    const val = (new FormData(e.target).get('q') || '').trim()
    Router.navigate('/admin/network' + (val ? '?q=' + encodeURIComponent(val) : ''))
  })
}

function clearNetworkSearch() {
  Router.navigate('/admin/network')
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
      ${(!isAdmin && isVipOrAbove(n.grade)) ? `<div class="flex justify-between py-2 border-b border-gray-50"><span class="text-gray-400">상태</span>${
        Number(n.active) === 0
          ? '<span class="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600"><i class="fas fa-circle-xmark"></i> 비활성</span>'
          : '<span class="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700"><i class="fas fa-circle-check"></i> 활성</span>'
      }</div>` : ''}
      <div class="flex justify-between py-2 border-b border-gray-50"><span class="text-gray-400">가입일</span><span class="font-medium">${fmtDate(n.createdAt)}</span></div>
      <div class="flex justify-between py-2 border-b border-gray-50"><span class="text-gray-400">경매 참여</span><span class="font-medium">${n.bids}회</span></div>
      <div class="flex justify-between py-2 border-b border-gray-50"><span class="text-gray-400">낙찰</span><span class="font-medium text-brand-orange">${n.wins}회</span></div>
      <div class="flex justify-between py-2 border-b border-gray-50"><span class="text-gray-400">경매P</span><span class="font-medium text-brand-orange">${won(n.auctionPoint)}</span></div>
    </div>
    ${isAdmin ? '' : `<button onclick="openMemberEdit('${n.id}')" class="w-full mt-4 bg-gray-100 text-gray-700 py-2.5 rounded-xl text-sm font-medium"><i class="fas fa-pen"></i> 이 회원 수정</button>`}`
}
