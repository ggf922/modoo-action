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
    <div id="hero-external-links" class="relative z-20 flex flex-col sm:flex-row sm:flex-wrap sm:justify-end gap-2.5 mb-5 sm:mb-0 sm:absolute sm:top-6 sm:right-6 sm:max-w-[440px]">
      <a href="https://modoomodoo.fun/" target="_blank" rel="noopener noreferrer"
         class="inline-flex items-center justify-center gap-1.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold px-4 py-2.5 rounded-xl text-sm shadow-md hover:from-purple-600 hover:to-pink-600 transition whitespace-nowrap">
        <i class="fas fa-wand-magic-sparkles"></i> 낭만 Ai시리즈
      </a>
      <a href="https://modoomodoo.com/" target="_blank" rel="noopener noreferrer"
         class="inline-flex items-center justify-center gap-1.5 bg-white text-brand-orange font-bold px-4 py-2.5 rounded-xl text-sm shadow-md hover:bg-orange-50 transition whitespace-nowrap">
        <i class="fas fa-store"></i> 모두모두 쇼핑몰
      </a>
      <a href="https://www.all-live.shop" target="_blank" rel="noopener noreferrer"
         class="inline-flex items-center justify-center gap-1.5 bg-brand-dark text-white font-bold px-4 py-2.5 rounded-xl text-sm shadow-md hover:bg-black transition whitespace-nowrap">
        <i class="fas fa-bag-shopping"></i> 국내/국외 쇼핑몰
      </a>
    </div>
    <div class="relative z-10 max-w-2xl">
      <span class="inline-block bg-white/20 backdrop-blur px-3 py-1 rounded-full text-sm font-medium mb-3">🌍 세계 최초 전원 수익형 경매</span>
      <h1 class="text-3xl sm:text-4xl font-extrabold leading-tight mb-3">모두가 이익을 보는<br/>공동 구매 경매 쇼핑몰, 모두모두 🎁</h1>
      <p class="text-white/90 mb-6 text-sm sm:text-base">낙찰되면 시중가보다 훨씬 저렴하게 자동 구매!<br/>아쉽게 미낙찰돼도 보상 포인트를 드려요.</p>
      <div class="flex flex-wrap gap-3 text-sm">
        <div class="bg-white/15 backdrop-blur rounded-xl px-4 py-3"><div class="font-bold text-lg">🏆 낙찰자</div><div class="text-white/80">초저가 자동구매</div></div>
        <div class="bg-white/15 backdrop-blur rounded-xl px-4 py-3"><div class="font-bold text-lg">🎁 미낙찰자</div><div class="text-white/80">보상 포인트 지급</div></div>
        <div class="bg-white/15 backdrop-blur rounded-xl px-4 py-3"><div class="font-bold text-lg">👥 추천하면</div><div class="text-white/80">포인트 적립</div></div>
      </div>
    </div>
    <div class="absolute -right-8 -bottom-8 text-[160px] opacity-20 select-none">🎁</div>
  </section>`

  const openGrid = open.length ? `
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-xl font-bold"><i class="fas fa-fire text-brand-orange"></i> 진행 중인 경매</h2>
      <span class="text-sm text-gray-400">${open.length}개</span>
    </div>
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 gap-y-5 pt-3 mb-10">${open.map((p, i) => renderProductCard(p, i < 4)).join('')}</div>
  ` : `<div class="text-center py-16 text-gray-400">진행 중인 경매가 없습니다.</div>`

  const drawnGrid = drawn.length ? `
    <h2 class="text-xl font-bold mb-4"><i class="fas fa-flag-checkered text-gray-400"></i> 마감된 경매</h2>
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 opacity-80">${drawn.map(p => renderProductCard(p, false)).join('')}</div>
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
          <label class="block text-sm font-medium mb-1">이메일 또는 아이디</label>
          <input name="email" type="text" required class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-orange focus:ring-2 focus:ring-orange-100 outline-none" placeholder="이메일 또는 아이디 입력" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">비밀번호</label>
          <input name="password" type="password" required class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-orange focus:ring-2 focus:ring-orange-100 outline-none" placeholder="••••••••" />
        </div>
        <button type="submit" class="w-full bg-brand-orange text-white font-bold py-3 rounded-xl hover:bg-orange-600 transition">로그인</button>
      </form>
      <div class="mt-4 text-center text-sm">
        <a href="#/auth/forgot" class="text-gray-500 hover:text-brand-orange">비밀번호를 잊으셨나요?</a>
      </div>
      <div class="mt-2 text-center text-sm text-gray-500">
        계정이 없으신가요? <a href="#/auth/register" class="text-brand-orange font-semibold">회원가입</a>
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
          <p class="text-xs text-gray-400 mt-1">추천인에게 포인트 ${won(bonus)}P가 지급돼요 🎁</p></div>

        <div class="border-t border-gray-100 pt-3 mt-1">
          <div class="text-sm font-bold text-gray-700 mb-2"><i class="fas fa-building-columns text-brand-orange mr-1"></i> 출금 계좌 <span class="text-gray-400 font-normal text-xs">(선택 · 추후 등록·수정 가능)</span></div>
          <p class="text-xs text-gray-400 mb-2">미당첨 보상·추천 수당 등 경매포인트 출금을 위한 본인 명의 계좌입니다. 가입 후 마이페이지 → 출금에서도 등록/수정할 수 있어요.</p>
          <div class="grid grid-cols-3 gap-2">
            <input name="bankName" placeholder="은행" class="px-3 py-3 rounded-xl border border-gray-200 text-sm focus:border-brand-orange focus:ring-2 focus:ring-orange-100 outline-none" />
            <input name="bankAccount" placeholder="계좌번호 (- 없이)" class="col-span-2 px-3 py-3 rounded-xl border border-gray-200 text-sm focus:border-brand-orange focus:ring-2 focus:ring-orange-100 outline-none" />
          </div>
          <input name="accountHolder" placeholder="예금주 (회원 이름과 동일해야 출금 가능)" class="w-full mt-2 px-3 py-3 rounded-xl border border-gray-200 text-sm focus:border-brand-orange focus:ring-2 focus:ring-orange-100 outline-none" /></div>

        <div class="bg-gray-50 rounded-xl p-3 mt-1">
          <label class="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" name="privacyAgree" id="privacy-agree" class="mt-0.5 w-4 h-4 accent-brand-orange shrink-0" />
            <span class="text-sm text-gray-600">
              <b class="text-gray-800">[필수]</b> 개인정보 수집·이용에 동의합니다.
              <button type="button" onclick="openPrivacyPolicy()" class="text-brand-orange underline ml-1">정책 보기</button>
            </span>
          </label>
        </div>

        <button type="submit" class="w-full bg-brand-orange text-white font-bold py-3 rounded-xl hover:bg-orange-600 transition mt-2">가입하기</button>
      </form>
      <div class="mt-4 text-center text-sm text-gray-500">
        이미 계정이 있으신가요? <a href="#/auth/login" class="text-brand-orange font-semibold">로그인</a>
      </div>
    </div>
  </div>`)

  // 예금주가 비어 있으면 이름 입력값으로 자동 채워 편의 제공 (직접 수정 가능)
  const _regForm = document.getElementById('register-form')
  const _nameEl = _regForm.querySelector('[name="name"]')
  const _holderEl = _regForm.querySelector('[name="accountHolder"]')
  if (_nameEl && _holderEl) {
    _nameEl.addEventListener('blur', () => {
      if (!_holderEl.value.trim() && _nameEl.value.trim()) _holderEl.value = _nameEl.value.trim()
    })
  }

  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const fd = new FormData(e.target)
    if (!document.getElementById('privacy-agree').checked) {
      toast('개인정보 수집·이용에 동의해주세요.', 'warn'); return
    }
    const payload = Object.fromEntries(fd.entries())
    delete payload.privacyAgree
    try {
      const { data } = await api.post('/auth/register', payload)
      await Store.loadMe()
      toast(`가입 완료! 내 추천코드: ${data.referralCode} 🎉`, 'success')
      Router.navigate('/mypage')
      render()
    } catch (err) { toast(errMsg(err), 'error') }
  })
}

// 개인정보 처리방침 모달
function openPrivacyPolicy() {
  openModal(`
  <div class="p-6 max-h-[80vh] overflow-y-auto">
    <h3 class="text-lg font-extrabold mb-3"><i class="fas fa-shield-halved text-brand-orange mr-1"></i> 개인정보 수집·이용 동의</h3>
    <div class="text-sm text-gray-600 space-y-3 leading-relaxed">
      <div>
        <p class="font-bold text-gray-800">1. 수집하는 개인정보 항목</p>
        <p>이메일(아이디), 비밀번호, 이름, 닉네임, 휴대폰번호, 출금 계좌정보(은행·계좌번호·예금주)</p>
      </div>
      <div>
        <p class="font-bold text-gray-800">2. 수집·이용 목적</p>
        <p>회원 식별 및 관리, 경매 서비스 제공, 포인트 충전·출금 처리, 추천 보상 정산, 고객 문의 응대</p>
      </div>
      <div>
        <p class="font-bold text-gray-800">3. 보유·이용 기간</p>
        <p>회원 탈퇴 시까지 보유하며, 탈퇴 후에는 관계 법령에 따른 보존 의무가 없는 한 지체 없이 파기합니다.</p>
      </div>
      <div>
        <p class="font-bold text-gray-800">4. 동의 거부 권리</p>
        <p>귀하는 개인정보 수집·이용 동의를 거부할 권리가 있습니다. 다만 필수 항목 동의를 거부할 경우 회원가입이 제한됩니다.</p>
      </div>
      <p class="text-xs text-gray-400">* 본 방침은 모두모두 경매몰 MVP 데모용 약식 고지입니다.</p>
    </div>
    <button onclick="closeModal()" class="w-full bg-brand-orange text-white font-bold py-3 rounded-xl mt-5 hover:bg-orange-600">확인</button>
  </div>`)
}

// 비밀번호 찾기 (본인 확인 후 새 비밀번호로 재설정)
async function pageForgot() {
  if (Store.user) { Router.navigate('/'); return }
  document.getElementById('app').innerHTML = layout(`
  <div class="max-w-md mx-auto mt-6">
    <div class="bg-white rounded-2xl border border-gray-100 p-6 sm:p-8">
      <a href="#/auth/login" class="text-sm text-gray-400 hover:text-brand-orange"><i class="fas fa-chevron-left"></i> 로그인</a>
      <h1 class="text-2xl font-extrabold text-center mb-1 mt-2">비밀번호 찾기</h1>
      <p class="text-center text-gray-400 text-sm mb-6">가입 시 입력한 정보로 본인 확인 후<br/>새 비밀번호로 재설정할 수 있어요</p>
      <form id="forgot-form" class="space-y-3">
        <div><label class="block text-sm font-medium mb-1">이메일 또는 아이디 *</label>
          <input name="email" type="text" required class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-orange focus:ring-2 focus:ring-orange-100 outline-none" placeholder="가입한 이메일 또는 아이디" /></div>
        <div><label class="block text-sm font-medium mb-1">이름 *</label>
          <input name="name" required class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-orange focus:ring-2 focus:ring-orange-100 outline-none" placeholder="가입자 이름" /></div>
        <div><label class="block text-sm font-medium mb-1">휴대폰 *</label>
          <input name="phone" required class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-orange focus:ring-2 focus:ring-orange-100 outline-none" placeholder="010-0000-0000" /></div>
        <hr class="my-2 border-gray-100" />
        <div><label class="block text-sm font-medium mb-1">새 비밀번호 * <span class="text-gray-400 font-normal">(6자 이상)</span></label>
          <input name="newPassword" type="password" required minlength="6" class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-orange focus:ring-2 focus:ring-orange-100 outline-none" /></div>
        <div><label class="block text-sm font-medium mb-1">새 비밀번호 확인 *</label>
          <input name="newPasswordConfirm" type="password" required minlength="6" class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-orange focus:ring-2 focus:ring-orange-100 outline-none" /></div>
        <button type="submit" class="w-full bg-brand-orange text-white font-bold py-3 rounded-xl hover:bg-orange-600 transition mt-2">비밀번호 재설정</button>
      </form>
    </div>
  </div>`)

  document.getElementById('forgot-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const fd = new FormData(e.target)
    const newPassword = fd.get('newPassword')
    if (newPassword !== fd.get('newPasswordConfirm')) {
      toast('새 비밀번호가 일치하지 않습니다.', 'warn'); return
    }
    try {
      await api.post('/auth/reset-password', {
        email: fd.get('email'), name: fd.get('name'), phone: fd.get('phone'), newPassword,
      })
      toast('비밀번호가 재설정되었어요! 새 비밀번호로 로그인하세요 🔑', 'success')
      Router.navigate('/auth/login')
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
  const { product: p, participants, winners, myBid, myBidCount = 0 } = res.data
  const discount = Math.round((1 - p.startPrice / p.marketPrice) * 100)
  const isOpen = p.status === 'OPEN'
  const u = Store.user
  const remaining = Math.max(0, (p.maxParticipants || 0) - (participants.length || 0)) // 남은 정원

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
  } else {
    // 반복 참여 허용: 경매포인트가 있는 한 같은 경매에 여러 번 참여 가능
    const myCountBadge = myBidCount > 0
      ? `<div class="bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 mb-2 text-center text-sm text-green-700 font-bold">
          <i class="fas fa-check-circle"></i> 현재 ${myBidCount}회 참여 중입니다. 정원이 차면 자동 추첨돼요!</div>`
      : ''
    actionBtn = `${myCountBadge}
      <button onclick="joinAuction('${p.id}', ${p.entryFee})"
        class="w-full bg-brand-orange text-white font-bold py-4 rounded-xl hover:bg-orange-600 transition text-lg shadow-lg shadow-orange-200">
        <i class="fas fa-gavel"></i> ${won(p.startPrice)}P로 ${myBidCount > 0 ? '추가 ' : ''}경매 참여하기</button>
      <p class="text-xs text-gray-400 text-center mt-2">남은 정원 ${remaining}자리 · 경매포인트가 있는 한 반복 참여할 수 있어요</p>`
  }

  document.getElementById('app').innerHTML = layout(`
  <a href="#/" class="text-sm text-gray-400 hover:text-brand-orange"><i class="fas fa-chevron-left"></i> 목록으로</a>
  <div class="grid lg:grid-cols-2 gap-6 mt-3">
    <div>
      <div class="relative rounded-2xl overflow-hidden bg-gray-100 aspect-square max-w-[800px] mx-auto">
        <img src="${p.imageUrl}" class="w-full h-full object-cover" onerror="this.src='https://placehold.co/800x800/FF6B35/fff?text=모두모두'" />
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
      <div class="grid grid-cols-2 gap-2 mb-4 text-center text-sm">
        <div class="bg-blue-50 rounded-xl py-3"><div class="text-gray-500 text-xs">당첨</div><div class="font-bold text-blue-600">${p.winnersCount}명</div></div>
        <div class="bg-green-50 rounded-xl py-3"><div class="text-gray-500 text-xs">미당첨 보상</div><div class="font-bold text-green-600">${won(p.losingReward)}P</div></div>
      </div>
      <p class="text-gray-600 text-sm leading-relaxed mb-3">${p.description}</p>
      ${p.productUrl ? `<a href="${p.productUrl}" target="_blank" rel="noopener noreferrer"
        class="flex items-center justify-center gap-2 w-full mb-5 bg-white border-2 border-brand-orange text-brand-orange font-bold py-3 rounded-xl hover:bg-orange-50 transition">
        <i class="fas fa-arrow-up-right-from-square"></i> 제품 자세히 보기</a>` : '<div class="mb-5"></div>'}
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
