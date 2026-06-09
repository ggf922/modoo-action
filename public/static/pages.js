// ===== 페이지 렌더러 =====

// 메인
async function pageHome() {
  const appEl = document.getElementById('app')
  appEl.innerHTML = renderLoading()
  const { data } = await api.get('/products')
  const products = data.products
  const open = products.filter(p => p.status === 'OPEN')
  const drawn = products.filter(p => p.status !== 'OPEN')

  const hero = `
  <section id="hero" class="relative rounded-3xl overflow-hidden mb-8 bg-gradient-to-br from-brand-orange to-red-500 text-white p-8 sm:p-12">
    <div class="relative z-10 max-w-2xl">
      <span class="inline-block bg-white/20 backdrop-blur px-3 py-1 rounded-full text-sm font-medium mb-3">🌍 세계 최초 전원 수익형 경매</span>
      <h1 class="text-3xl sm:text-4xl font-extrabold leading-tight mb-3">모두가 이익을 보는<br/>공동 구매 경매 쇼핑몰, 모두모두 🎁</h1>
      <p class="text-white/90 mb-6 text-sm sm:text-base">낙찰되면 시중가보다 훨씬 저렴하게 자동 구매!<br/>아쉽게 미낙찰돼도 보상 포인트를 드려요.</p>
      <div class="flex flex-wrap gap-3 text-sm">
        <div class="bg-white/15 backdrop-blur rounded-xl px-4 py-3"><div class="font-bold text-lg">🏆 낙찰자</div><div class="text-white/80">초저가 자동구매</div></div>
        <div class="bg-white/15 backdrop-blur rounded-xl px-4 py-3"><div class="font-bold text-lg">🎁 미낙찰자</div><div class="text-white/80">보상 포인트 지급</div></div>
        <div class="bg-white/15 backdrop-blur rounded-xl px-4 py-3"><div class="font-bold text-lg">👥 추천하면</div><div class="text-white/80">임금 포인트 적립</div></div>
      </div>
    </div>
    <div class="absolute -right-8 -bottom-8 text-[160px] opacity-20 select-none">🎁</div>
  </section>`

  const openGrid = open.length ? `
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-xl font-bold"><i class="fas fa-fire text-brand-orange"></i> 진행 중인 경매</h2>
      <span class="text-sm text-gray-400">${open.length}개</span>
    </div>
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">${open.map(renderProductCard).join('')}</div>
  ` : `<div class="text-center py-16 text-gray-400">진행 중인 경매가 없습니다.</div>`

  const drawnGrid = drawn.length ? `
    <h2 class="text-xl font-bold mb-4"><i class="fas fa-flag-checkered text-gray-400"></i> 마감된 경매</h2>
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 opacity-80">${drawn.map(renderProductCard).join('')}</div>
  ` : ''

  appEl.innerHTML = layout(hero + openGrid + drawnGrid)
}

// 로그인
async function pageLogin() {
  if (Store.user) { Router.navigate('/'); return }
  document.getElementById('app').innerHTML = layout(`
  <div class="max-w-md mx-auto mt-6">
    <div class="bg-white rounded-2xl border border-gray-100 p-6 sm:p-8">
      <h1 class="text-2xl font-extrabold text-center mb-1">로그인</h1>
      <p class="text-center text-gray-400 text-sm mb-6">모두모두 🎁 에 오신 걸 환영해요</p>
      <form id="login-form" class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1">이메일</label>
          <input name="email" type="email" required class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-orange focus:ring-2 focus:ring-orange-100 outline-none" placeholder="admin@modoo.com" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">비밀번호</label>
          <input name="password" type="password" required class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-orange focus:ring-2 focus:ring-orange-100 outline-none" placeholder="••••••••" />
        </div>
        <button type="submit" class="w-full bg-brand-orange text-white font-bold py-3 rounded-xl hover:bg-orange-600 transition">로그인</button>
      </form>
      <div class="mt-4 text-center text-sm text-gray-500">
        계정이 없으신가요? <a href="#/auth/register" class="text-brand-orange font-semibold">회원가입</a>
      </div>
      <div class="mt-6 bg-orange-50 rounded-xl p-4 text-xs text-gray-600 space-y-1">
        <div class="font-bold text-brand-orange mb-1">🔑 데모 계정</div>
        <button onclick="fillLogin('admin@modoo.com','Admin1234!')" class="block hover:underline">👑 관리자: admin@modoo.com / Admin1234!</button>
        <button onclick="fillLogin('user1@test.com','Test1234!')" class="block hover:underline">👤 회원: user1@test.com / Test1234!</button>
      </div>
    </div>
  </div>`)

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const fd = new FormData(e.target)
    try {
      await api.post('/auth/login', { email: fd.get('email'), password: fd.get('password') })
      await Store.loadMe()
      toast('로그인 성공! 환영합니다 🎉', 'success')
      Router.navigate(Store.user.role === 'ADMIN' ? '/admin' : '/')
      render()
    } catch (err) { toast(errMsg(err), 'error') }
  })
}
function fillLogin(email, pw) {
  document.querySelector('#login-form [name=email]').value = email
  document.querySelector('#login-form [name=password]').value = pw
}

// 회원가입
async function pageRegister(params, query) {
  if (Store.user) { Router.navigate('/'); return }
  await Store.loadConfig()
  const bonus = Store.config?.referralBonus ?? 500
  const refFromUrl = query.ref || ''
  document.getElementById('app').innerHTML = layout(`
  <div class="max-w-md mx-auto mt-6">
    <div class="bg-white rounded-2xl border border-gray-100 p-6 sm:p-8">
      <h1 class="text-2xl font-extrabold text-center mb-1">회원가입</h1>
      <p class="text-center text-gray-400 text-sm mb-6">지금 가입하고 경매에 참여하세요</p>
      <form id="register-form" class="space-y-3">
        <div><label class="block text-sm font-medium mb-1">이메일 *</label>
          <input name="email" type="email" required class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-orange focus:ring-2 focus:ring-orange-100 outline-none" /></div>
        <div><label class="block text-sm font-medium mb-1">비밀번호 * <span class="text-gray-400 font-normal">(6자 이상)</span></label>
          <input name="password" type="password" required minlength="6" class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-orange focus:ring-2 focus:ring-orange-100 outline-none" /></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="block text-sm font-medium mb-1">이름 *</label>
            <input name="name" required class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-orange focus:ring-2 focus:ring-orange-100 outline-none" /></div>
          <div><label class="block text-sm font-medium mb-1">닉네임 *</label>
            <input name="nickname" required class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-orange focus:ring-2 focus:ring-orange-100 outline-none" /></div>
        </div>
        <div><label class="block text-sm font-medium mb-1">휴대폰</label>
          <input name="phone" class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-orange focus:ring-2 focus:ring-orange-100 outline-none" placeholder="010-0000-0000" /></div>
        <div><label class="block text-sm font-medium mb-1">추천코드 <span class="text-gray-400 font-normal">(선택)</span></label>
          <input name="referralCode" value="${refFromUrl}" class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-orange focus:ring-2 focus:ring-orange-100 outline-none uppercase" placeholder="USER0001" />
          <p class="text-xs text-gray-400 mt-1">추천인에게 임금 포인트 ${won(bonus)}P가 지급돼요 🎁</p></div>
        <button type="submit" class="w-full bg-brand-orange text-white font-bold py-3 rounded-xl hover:bg-orange-600 transition mt-2">가입하기</button>
      </form>
      <div class="mt-4 text-center text-sm text-gray-500">
        이미 계정이 있으신가요? <a href="#/auth/login" class="text-brand-orange font-semibold">로그인</a>
      </div>
    </div>
  </div>`)

  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const fd = new FormData(e.target)
    const payload = Object.fromEntries(fd.entries())
    try {
      const { data } = await api.post('/auth/register', payload)
      await Store.loadMe()
      toast(`가입 완료! 내 추천코드: ${data.referralCode} 🎉`, 'success')
      Router.navigate('/mypage')
      render()
    } catch (err) { toast(errMsg(err), 'error') }
  })
}

// 상품 상세
async function pageProduct(params) {
  const id = params.id
  document.getElementById('app').innerHTML = renderLoading()
  let res
  try { res = await api.get('/products/' + id) }
  catch { document.getElementById('app').innerHTML = renderNotFound(); return }
  const { product: p, participants, winners, myBid } = res.data
  const discount = Math.round((1 - p.startPrice / p.marketPrice) * 100)
  const isOpen = p.status === 'OPEN'
  const u = Store.user

  const participantBadges = participants.length
    ? participants.map(pt => `<span class="inline-flex items-center gap-1 text-xs bg-gray-100 px-2.5 py-1 rounded-full ${pt.isWinner ? 'bg-brand-gold/30 font-bold' : ''}">
        ${pt.isWinner ? '👑' : '👤'} ${pt.nickname}</span>`).join('')
    : '<span class="text-sm text-gray-400">아직 참여자가 없어요. 첫 참여자가 되어보세요!</span>'

  let actionBtn = ''
  if (!isOpen) {
    const iWon = winners.find(w => u && w.userId === u.id)
    actionBtn = `<div class="bg-gray-100 rounded-xl p-4 text-center">
      <p class="font-bold text-gray-600 mb-1">🏁 추첨이 완료된 경매입니다</p>
      ${winners.length ? `<p class="text-sm text-gray-500">당첨자: ${winners.map(w => '👑 ' + w.nickname).join(', ')}</p>` : ''}
      ${iWon ? '<p class="text-brand-orange font-bold mt-2">🎉 회원님이 당첨되셨습니다!</p>' : ''}
    </div>`
  } else if (myBid) {
    actionBtn = `<div class="bg-green-50 border border-green-200 rounded-xl p-4 text-center text-green-700 font-bold">
      <i class="fas fa-check-circle"></i> 이미 참여한 경매입니다. 정원이 차면 자동 추첨돼요!</div>`
  } else {
    actionBtn = `<button onclick="joinAuction('${p.id}', ${p.entryFee})"
      class="w-full bg-brand-orange text-white font-bold py-4 rounded-xl hover:bg-orange-600 transition text-lg shadow-lg shadow-orange-200">
      <i class="fas fa-gavel"></i> ${won(p.entryFee)}P로 경매 참여하기</button>`
  }

  document.getElementById('app').innerHTML = layout(`
  <a href="#/" class="text-sm text-gray-400 hover:text-brand-orange"><i class="fas fa-chevron-left"></i> 목록으로</a>
  <div class="grid lg:grid-cols-2 gap-6 mt-3">
    <div>
      <div class="relative rounded-2xl overflow-hidden bg-gray-100 aspect-[4/3]">
        <img src="${p.imageUrl}" class="w-full h-full object-cover" onerror="this.src='https://placehold.co/600x450/FF6B35/fff?text=모두모두'" />
        <span class="absolute top-4 left-4 bg-red-500 text-white text-sm font-bold px-3 py-1.5 rounded-full shadow">${discount}% OFF</span>
      </div>
    </div>
    <div>
      <span class="text-sm text-gray-400">${p.category}</span>
      <h1 class="text-2xl font-extrabold mt-1 mb-3">${p.title}</h1>
      <div class="flex items-baseline gap-3 mb-1">
        <span class="text-gray-400 line-through-soft">시중가 ${won(p.marketPrice)}원</span>
      </div>
      <div class="flex items-baseline gap-2 mb-4">
        <span class="text-gray-500 text-sm">낙찰가</span>
        <span class="text-brand-orange font-extrabold text-3xl">${won(p.startPrice)}원</span>
      </div>
      <div class="grid grid-cols-3 gap-2 mb-4 text-center text-sm">
        <div class="bg-orange-50 rounded-xl py-3"><div class="text-gray-500 text-xs">참가비</div><div class="font-bold text-brand-orange">${won(p.entryFee)}P</div></div>
        <div class="bg-blue-50 rounded-xl py-3"><div class="text-gray-500 text-xs">당첨</div><div class="font-bold text-blue-600">${p.winnersCount}명</div></div>
        <div class="bg-green-50 rounded-xl py-3"><div class="text-gray-500 text-xs">미당첨 보상</div><div class="font-bold text-green-600">${won(p.losingReward)}P</div></div>
      </div>
      <p class="text-gray-600 text-sm leading-relaxed mb-5">${p.description}</p>
      ${actionBtn}
    </div>
  </div>

  <section class="mt-8">
    <h2 class="text-lg font-bold mb-3"><i class="fas fa-users text-brand-orange"></i> 참여 현황</h2>
    ${renderGauge(participants.length, p.maxParticipants, p.winnersCount)}
    <div class="mt-4 bg-white rounded-2xl border border-gray-100 p-4">
      <div class="text-sm font-medium mb-2 text-gray-600">참여자 목록</div>
      <div class="flex flex-wrap gap-2">${participantBadges}</div>
    </div>
  </section>`)
}
