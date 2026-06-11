// ===== 경매 참여 + 당첨 결과 모달 =====
async function joinAuction(productId, entryFee) {
  if (!Store.user) { requireLoginRedirect(); return }

  // 잔액(경매 참여 포인트) 부족 시 → 명확한 안내 모달 (부족 금액 + 현재 잔액 + 충전 유도)
  const balance = Store.user.auctionPoint ?? 0
  if (balance < entryFee) {
    const shortage = entryFee - balance
    openModal(`<div class="p-7 text-center">
      <div class="text-5xl mb-3">😢</div>
      <h3 class="text-lg font-extrabold mb-1 text-red-500">잔액 포인트가 부족합니다</h3>
      <p class="text-sm text-gray-500 mb-4">경매에 참여하려면 포인트를 충전해주세요.</p>
      <div class="bg-gray-50 rounded-xl p-4 text-sm space-y-2 mb-5 text-left">
        <div class="flex justify-between"><span class="text-gray-500">필요 포인트</span><b class="text-brand-dark">${won(entryFee)}P</b></div>
        <div class="flex justify-between"><span class="text-gray-500">보유 포인트</span><b class="text-brand-dark">${won(balance)}P</b></div>
        <div class="border-t border-gray-200 pt-2 flex justify-between"><span class="text-gray-600 font-medium">부족 포인트</span><b class="text-red-500">${won(shortage)}P</b></div>
      </div>
      <div class="flex gap-2">
        <button onclick="closeModal()" class="flex-1 bg-gray-100 text-gray-600 font-bold py-3 rounded-xl hover:bg-gray-200">닫기</button>
        <button onclick="closeModal();Router.navigate('/mypage/charge')" class="flex-1 bg-brand-orange text-white font-bold py-3 rounded-xl hover:bg-orange-600"><i class="fas fa-bolt"></i> 충전하기</button>
      </div>
    </div>`)
    return
  }

  openModal(`<div class="p-8 text-center">
    <div class="text-5xl mb-4" style="animation:spin360 1s ease infinite"><i class="fas fa-gavel text-brand-orange"></i></div>
    <p class="font-bold">경매 참여 처리 중...</p>
    <p class="text-sm text-gray-400 mt-1">${won(entryFee)}P가 차감됩니다</p>
  </div>`, { dismissable: false })

  try {
    const { data } = await api.post(`/products/${productId}/join`)
    await Store.loadMe()
    if (data.drawn) {
      showDrawResult(data)
    } else {
      openModal(`<div class="p-8 text-center">
        <div class="text-6xl mb-4 animate-pop">✅</div>
        <h3 class="text-xl font-extrabold mb-2">참여 완료!</h3>
        <p class="text-gray-500 mb-1">현재 <b class="text-brand-orange">${data.participants}명</b>이 참여 중이에요.</p>
        <p class="text-sm text-gray-400 mb-3">정원이 모두 차면 자동으로 추첨됩니다 🎲</p>
        <div class="bg-orange-50 rounded-xl p-3 text-sm mb-5 flex items-center justify-between">
          <span class="text-gray-500"><i class="fas fa-minus-circle text-brand-orange"></i> 차감 포인트</span>
          <span><b class="text-brand-orange">${won(entryFee)}P</b> <span class="text-gray-400">→ 잔액 ${won(Store.user.auctionPoint ?? 0)}P</span></span>
        </div>
        <button onclick="closeModal();render()" class="w-full bg-brand-orange text-white font-bold py-3 rounded-xl hover:bg-orange-600">확인</button>
      </div>`)
    }
  } catch (err) {
    closeModal()
    toast(errMsg(err), 'error')
  }
}

// 당첨 결과 모달 (룰렛/슬롯 애니메이션 후 결과)
function showDrawResult(data) {
  // 1단계: 추첨 애니메이션
  openModal(`<div class="p-10 text-center">
    <p class="text-sm text-gray-400 mb-4">🎲 정원이 다 찼어요! 추첨을 진행합니다...</p>
    <div id="slot" class="text-7xl mb-2" style="animation:spin360 .6s linear infinite">🎰</div>
    <p class="font-bold text-brand-orange">두구두구...</p>
  </div>`, { dismissable: false })

  setTimeout(() => {
    if (data.won) {
      // 폭죽
      launchConfetti()
      openModal(`<div class="p-8 text-center relative overflow-hidden">
        <div class="text-7xl mb-3 animate-pop">🎉</div>
        <h3 class="text-2xl font-extrabold text-brand-orange mb-2">축하합니다!</h3>
        <p class="text-gray-700 font-medium mb-1">${data.title} 낙찰 🏆</p>
        <p class="text-gray-500 text-sm mb-1">자동 구매 처리되었습니다.</p>
        <div class="bg-orange-50 rounded-xl p-4 my-4">
          <p class="text-sm text-gray-500">낙찰가</p>
          <p class="text-2xl font-extrabold text-brand-orange">${won(data.startPrice)}원</p>
          <p class="text-xs text-gray-400 mt-1">시중가 ${won(data.marketPrice)}원 대비 ${Math.round((1-data.startPrice/data.marketPrice)*100)}% 절약!</p>
        </div>
        <button onclick="closeModal();render()" class="w-full bg-brand-orange text-white font-bold py-3 rounded-xl hover:bg-orange-600">확인</button>
      </div>`)
    } else {
      openModal(`<div class="p-8 text-center">
        <div class="text-6xl mb-3 animate-pop">🎁</div>
        <h3 class="text-xl font-extrabold mb-2">아쉽지만 다음 기회에!</h3>
        <p class="text-gray-600 mb-1">미당첨되셨지만 걱정 마세요.</p>
        <div class="bg-green-50 rounded-xl p-4 my-4">
          <p class="text-sm text-gray-500">보상 포인트 지급</p>
          <p class="text-2xl font-extrabold text-green-600">+${won(data.losingReward)}P</p>
          <p class="text-xs text-gray-400 mt-1">잔액 포인트로 적립되어 출금 가능해요!</p>
        </div>
        <button onclick="closeModal();render()" class="w-full bg-brand-dark text-white font-bold py-3 rounded-xl hover:bg-gray-700">확인</button>
      </div>`)
    }
  }, 1800)
}

function launchConfetti() {
  const colors = ['#FF6B35', '#FFC107', '#ef4444', '#22c55e', '#3b82f6']
  const root = document.getElementById('toast-root')
  for (let i = 0; i < 60; i++) {
    const c = document.createElement('div')
    c.style.cssText = `position:fixed;top:-10px;left:${Math.random()*100}vw;width:10px;height:14px;
      background:${colors[i%colors.length]};z-index:200;border-radius:2px;
      animation:confetti-fall ${1+Math.random()*1.5}s ease-in ${Math.random()*0.5}s forwards;`
    document.body.appendChild(c)
    setTimeout(() => c.remove(), 3500)
  }
}

// ===== 마이페이지 =====
async function pageMypage() {
  if (!Store.user) { requireLoginRedirect(); return }
  document.getElementById('app').innerHTML = renderLoading()
  await Store.loadMe()
  const u = Store.user
  const total = (u.auctionPoint || 0) + (u.balancePoint || 0) + (u.wagePoint || 0)

  const card = (icon, color, label, value, desc, btn) => `
    <div class="bg-white rounded-2xl border border-gray-100 p-5">
      <div class="flex items-center justify-between mb-2">
        <span class="w-10 h-10 rounded-xl flex items-center justify-center text-white" style="background:${color}"><i class="fas ${icon}"></i></span>
        ${btn || ''}
      </div>
      <div class="text-sm text-gray-400">${label}</div>
      <div class="text-2xl font-extrabold" style="color:${color}">${won(value)}<span class="text-base font-bold text-gray-400">P</span></div>
      <div class="text-xs text-gray-400 mt-1">${desc}</div>
    </div>`

  document.getElementById('app').innerHTML = layout(`
  <div class="flex items-center justify-between mb-5">
    <div>
      <h1 class="text-2xl font-extrabold">${u.nickname}님의 마이페이지</h1>
      <div class="flex flex-wrap items-center gap-2 mt-1.5">
        <span class="text-sm text-gray-400">내 추천코드:</span>
        <button onclick="copyCode('${u.referralCode}')" class="inline-flex items-center gap-1 text-sm font-bold text-brand-orange bg-orange-50 px-2.5 py-1 rounded-lg hover:bg-orange-100 transition">
          ${u.referralCode} <i class="fas fa-copy text-xs"></i>
        </button>
        <button onclick="copyReferralLink('${u.referralCode}')" class="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg hover:bg-blue-100 transition">
          <i class="fas fa-link text-xs"></i> 추천 링크 복사
        </button>
      </div>
    </div>
  </div>

  <div class="bg-gradient-to-br from-brand-orange to-red-500 text-white rounded-2xl p-6 mb-4">
    <div class="text-sm text-white/80">총 보유 포인트</div>
    <div class="text-4xl font-extrabold mt-1">${won(total)}<span class="text-xl">P</span></div>
  </div>

  <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
    ${card('fa-gavel', '#FF6B35', '경매 참여 포인트', u.auctionPoint, '경매 참여에 사용 (충전 가능)',
      `<a href="#/mypage/charge" class="text-xs bg-brand-orange text-white px-3 py-1.5 rounded-lg font-medium">충전하기</a>`)}
    ${card('fa-wallet', '#22c55e', '잔액 포인트', u.balancePoint, '미당첨 보상 누적 (출금 가능)',
      `<a href="#/mypage/withdraw" class="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg font-medium">출금하기</a>`)}
    ${card('fa-hand-holding-dollar', '#3b82f6', '임금 포인트', u.wagePoint, '추천 수당 (출금 가능)',
      `<a href="#/mypage/withdraw" class="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-medium">출금하기</a>`)}
  </div>

  <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
    ${menuTile('#/mypage/bids', 'fa-gavel', '내 참여 내역')}
    ${menuTile('#/mypage/history', 'fa-clock-rotate-left', '포인트 내역')}
    ${menuTile('#/mypage/network', 'fa-sitemap', '내 조직도')}
    ${menuTile('#/mypage/charge', 'fa-plus-circle', '포인트 충전')}
    ${menuTile('#/mypage/password', 'fa-key', '비밀번호 변경')}
  </div>`)
}
function menuTile(href, icon, label) {
  return `<a href="${href}" class="bg-white rounded-2xl border border-gray-100 p-5 text-center hover:shadow-md hover:-translate-y-0.5 transition">
    <div class="text-2xl text-brand-orange mb-2"><i class="fas ${icon}"></i></div>
    <div class="text-sm font-medium">${label}</div></a>`
}
// 추천코드만 복사
function copyCode(code) {
  copyToClipboard(code)
  toast('추천코드가 복사되었어요! 📋', 'success')
}
// 추천 가입 링크 복사 (회원가입 시 추천코드 자동 기입됨)
function copyReferralLink(code) {
  const link = location.origin + '/#/auth/register?ref=' + code
  copyToClipboard(link)
  toast('추천 링크가 복사되었어요! 이 링크로 가입하면 추천코드가 자동 입력돼요 🔗', 'success')
}
// 클립보드 복사 (구형 브라우저/비보안 컨텍스트 폴백 포함)
function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text))
  } else {
    fallbackCopy(text)
  }
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.focus(); ta.select()
  try { document.execCommand('copy') } catch {}
  document.body.removeChild(ta)
}

// 비밀번호 변경
async function pagePassword() {
  if (!Store.user) { requireLoginRedirect(); return }
  document.getElementById('app').innerHTML = layout(`
  <a href="#/mypage" class="text-sm text-gray-400 hover:text-brand-orange"><i class="fas fa-chevron-left"></i> 마이페이지</a>
  <div class="max-w-md mx-auto mt-3">
    <div class="bg-white rounded-2xl border border-gray-100 p-6">
      <h1 class="text-xl font-extrabold mb-1"><i class="fas fa-key text-brand-orange mr-1"></i> 비밀번호 변경</h1>
      <p class="text-sm text-gray-400 mb-5">현재 비밀번호 확인 후 새 비밀번호로 변경할 수 있어요</p>
      <form id="password-form" class="space-y-3">
        <div><label class="block text-sm font-medium mb-1">현재 비밀번호 *</label>
          <input name="currentPassword" type="password" required class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-orange focus:ring-2 focus:ring-orange-100 outline-none" /></div>
        <div><label class="block text-sm font-medium mb-1">새 비밀번호 * <span class="text-gray-400 font-normal">(6자 이상)</span></label>
          <input name="newPassword" type="password" required minlength="6" class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-orange focus:ring-2 focus:ring-orange-100 outline-none" /></div>
        <div><label class="block text-sm font-medium mb-1">새 비밀번호 확인 *</label>
          <input name="newPasswordConfirm" type="password" required minlength="6" class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-orange focus:ring-2 focus:ring-orange-100 outline-none" /></div>
        <button type="submit" class="w-full bg-brand-orange text-white font-bold py-3 rounded-xl hover:bg-orange-600 transition mt-2">변경하기</button>
      </form>
    </div>
  </div>`)

  document.getElementById('password-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const fd = new FormData(e.target)
    const newPassword = fd.get('newPassword')
    if (newPassword !== fd.get('newPasswordConfirm')) {
      toast('새 비밀번호가 일치하지 않습니다.', 'warn'); return
    }
    try {
      await api.post('/auth/change-password', { currentPassword: fd.get('currentPassword'), newPassword })
      toast('비밀번호가 변경되었어요! 🔑', 'success')
      Router.navigate('/mypage')
      render()
    } catch (err) { toast(errMsg(err), 'error') }
  })
}

// 입금 계좌 정보 (고정)
const DEPOSIT_BANK = '케이뱅크'
const DEPOSIT_ACCOUNT = '100-300-095256'
const DEPOSIT_HOLDER = '큰바구니(임몽규)'

// 포인트 충전 (계좌 입금 후 관리자 승인 방식)
async function pageCharge() {
  if (!Store.user) { requireLoginRedirect(); return }
  document.getElementById('app').innerHTML = renderLoading()
  await Store.loadMe()
  const { data: crData } = await api.get('/me/charge-requests')

  const badge = (s) => {
    const map = { PENDING: ['승인 대기','bg-yellow-100 text-yellow-700'], COMPLETED: ['충전 완료','bg-green-100 text-green-700'], REJECTED: ['거절','bg-red-100 text-red-700'] }
    const [t, cls] = map[s] || [s, 'bg-gray-100']
    return `<span class="text-xs px-2 py-0.5 rounded-full ${cls}">${t}</span>`
  }

  document.getElementById('app').innerHTML = layout(`
  <a href="#/mypage" class="text-sm text-gray-400 hover:text-brand-orange"><i class="fas fa-chevron-left"></i> 마이페이지</a>
  <div class="max-w-md mx-auto mt-3 space-y-4">
    <div class="bg-white rounded-2xl border border-gray-100 p-6">
      <h1 class="text-xl font-extrabold mb-1">포인트 충전</h1>
      <p class="text-sm text-gray-400 mb-4">현재 경매 포인트: <b class="text-brand-orange">${won(Store.user.auctionPoint)}P</b></p>

      <!-- 입금 계좌 안내 -->
      <div class="bg-orange-50 border border-orange-100 rounded-xl p-4 mb-4">
        <div class="text-sm font-bold text-brand-dark mb-2"><i class="fas fa-building-columns text-brand-orange mr-1"></i> 아래 계좌로 입금해주세요</div>
        <div class="bg-white rounded-lg p-3 text-sm space-y-1">
          <div class="flex justify-between"><span class="text-gray-400">은행</span><span class="font-bold">${DEPOSIT_BANK}</span></div>
          <div class="flex justify-between items-center"><span class="text-gray-400">계좌번호</span>
            <span class="font-bold">${DEPOSIT_ACCOUNT}
              <button onclick="copyToClipboard('${DEPOSIT_ACCOUNT.replace(/-/g,'')}');toast('계좌번호가 복사되었어요! 📋','success')" class="text-brand-orange ml-1"><i class="fas fa-copy text-xs"></i></button>
            </span></div>
          <div class="flex justify-between"><span class="text-gray-400">예금주</span><span class="font-bold">${DEPOSIT_HOLDER}</span></div>
        </div>
        <p class="text-xs text-gray-500 mt-2">입금 후 아래에서 <b>충전 요청</b>을 보내면, 관리자 확인 후 포인트가 지급돼요.</p>
      </div>

      <div class="grid grid-cols-3 gap-2 mb-3">
        ${[5000,10000,30000,50000,100000,300000].map(v => `
          <button onclick="setCharge(${v})" class="border border-gray-200 rounded-xl py-3 text-sm font-medium hover:border-brand-orange hover:bg-orange-50 transition">${won(v)}P</button>`).join('')}
      </div>
      <label class="block text-sm font-medium mb-1">충전 요청 금액 (입금하신 금액)</label>
      <input id="charge-amount" type="number" min="1" placeholder="직접 입력 (원)" class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-orange outline-none mb-3" />
      <label class="block text-sm font-medium mb-1">입금자명</label>
      <input id="charge-depositor" type="text" value="${Store.user.name || ''}" placeholder="실제 입금하신 분의 이름" class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-orange outline-none mb-3" />
      <button onclick="doCharge()" class="w-full bg-brand-orange text-white font-bold py-3 rounded-xl hover:bg-orange-600">
        <i class="fas fa-paper-plane"></i> 충전 요청 보내기</button>
      <p class="text-xs text-gray-400 text-center mt-3">* 관리자가 입금을 확인한 후 포인트가 지급됩니다.</p>
    </div>

    <div class="bg-white rounded-2xl border border-gray-100 p-5">
      <h2 class="font-bold mb-3 text-sm">충전 요청 내역</h2>
      ${crData.chargeRequests.length ? crData.chargeRequests.map(r => `
        <div class="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
          <div><div class="font-semibold text-sm">${won(r.amount)}P <span class="text-xs text-gray-400">· ${r.depositor||'-'}</span></div>
            <div class="text-xs text-gray-400">${fmtDateTime(r.requestedAt)}</div></div>
          ${badge(r.status)}
        </div>`).join('') : '<p class="text-sm text-gray-400 text-center py-4">충전 요청 내역이 없습니다.</p>'}
    </div>
  </div>`)
}
function setCharge(v) { document.getElementById('charge-amount').value = v }
async function doCharge() {
  const amount = Number(document.getElementById('charge-amount').value)
  const depositor = document.getElementById('charge-depositor').value.trim()
  if (!amount || amount <= 0) { toast('충전 요청 금액을 입력해주세요.', 'warn'); return }
  if (!depositor) { toast('입금자명을 입력해주세요.', 'warn'); return }
  openModal(`<div class="p-8 text-center">
    <div class="text-5xl mb-4">🏦</div>
    <h3 class="text-lg font-bold mb-1">${won(amount)}P 충전 요청</h3>
    <p class="text-sm text-gray-400 mb-6">입금자명 <b>${depositor}</b><br/>위 계좌로 입금을 완료하셨나요?</p>
    <div class="flex gap-2">
      <button onclick="closeModal()" class="flex-1 border border-gray-200 py-3 rounded-xl font-medium">취소</button>
      <button onclick="confirmCharge(${amount}, '${depositor.replace(/'/g, "\\'")}')" class="flex-1 bg-brand-orange text-white py-3 rounded-xl font-bold">요청 보내기</button>
    </div>
  </div>`)
}
async function confirmCharge(amount, depositor) {
  try {
    await api.post('/me/charge', { amount, depositor })
    closeModal()
    toast('충전 요청이 접수되었어요! 관리자 확인 후 지급됩니다 🎉', 'success')
    pageCharge()
  } catch (err) { closeModal(); toast(errMsg(err), 'error') }
}

// 출금 신청
async function pageWithdraw() {
  if (!Store.user) { requireLoginRedirect(); return }
  document.getElementById('app').innerHTML = renderLoading()
  await Store.loadMe()
  await Store.loadConfig()
  const u = Store.user
  const min = Store.config?.minWithdrawAmount ?? 10000
  const withdrawable = (u.balancePoint || 0) + (u.wagePoint || 0)
  const { data: wdData } = await api.get('/me/withdrawals')
  const hasAccount = u.bankName && u.bankAccount

  const statusBadge = (s) => {
    const map = { PENDING: ['대기', 'bg-yellow-100 text-yellow-700'], APPROVED: ['승인', 'bg-blue-100 text-blue-700'], REJECTED: ['거절', 'bg-red-100 text-red-700'], COMPLETED: ['완료', 'bg-green-100 text-green-700'] }
    const [t, cls] = map[s] || [s, 'bg-gray-100']
    return `<span class="text-xs px-2 py-0.5 rounded-full ${cls}">${t}</span>`
  }

  document.getElementById('app').innerHTML = layout(`
  <a href="#/mypage" class="text-sm text-gray-400 hover:text-brand-orange"><i class="fas fa-chevron-left"></i> 마이페이지</a>
  <div class="max-w-md mx-auto mt-3 space-y-4">
    <div class="bg-white rounded-2xl border border-gray-100 p-6">
      <h1 class="text-xl font-extrabold mb-1">출금 신청</h1>
      <p class="text-sm text-gray-400 mb-4">출금 가능 포인트: <b class="text-green-600">${won(withdrawable)}P</b> <span class="text-xs">(잔액 ${won(u.balancePoint)} + 임금 ${won(u.wagePoint)})</span></p>

      <div class="mb-4">
        <div class="text-sm font-medium mb-2">출금 계좌 ${hasAccount ? '<span class="text-green-600 text-xs">✓ 등록됨</span>' : '<span class="text-red-500 text-xs">미등록</span>'}</div>
        <div class="grid grid-cols-3 gap-2">
          <input id="bankName" value="${u.bankName||''}" placeholder="은행" class="px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-brand-orange" />
          <input id="bankAccount" value="${u.bankAccount||''}" placeholder="계좌번호" class="col-span-2 px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-brand-orange" />
        </div>
        <input id="accountHolder" value="${u.accountHolder||''}" placeholder="예금주" class="w-full mt-2 px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-brand-orange" />
        <button onclick="saveBank()" class="mt-2 text-xs text-brand-orange font-medium">계좌 정보 저장</button>
      </div>

      <label class="block text-sm font-medium mb-1">출금 금액 <span class="text-gray-400 font-normal">(최소 ${won(min)}P)</span></label>
      <input id="withdraw-amount" type="number" min="${min}" placeholder="${won(min)}" class="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none focus:border-brand-orange mb-3" />
      <button onclick="doWithdraw()" class="w-full bg-green-600 text-white font-bold py-3 rounded-xl hover:bg-green-700"><i class="fas fa-money-bill-transfer"></i> 출금 신청</button>
    </div>

    <div class="bg-white rounded-2xl border border-gray-100 p-5">
      <h2 class="font-bold mb-3 text-sm">출금 신청 내역</h2>
      ${wdData.withdrawals.length ? wdData.withdrawals.map(w => `
        <div class="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
          <div><div class="font-semibold text-sm">${won(w.amount)}P</div><div class="text-xs text-gray-400">${fmtDateTime(w.requestedAt)}</div></div>
          ${statusBadge(w.status)}
        </div>`).join('') : '<p class="text-sm text-gray-400 text-center py-4">출금 내역이 없습니다.</p>'}
    </div>
  </div>`)
}
async function saveBank() {
  const bankName = document.getElementById('bankName').value
  const bankAccount = document.getElementById('bankAccount').value
  const accountHolder = document.getElementById('accountHolder').value
  try {
    await api.post('/me/bank', { bankName, bankAccount, accountHolder })
    await Store.loadMe()
    toast('계좌 정보가 저장되었어요.', 'success')
  } catch (err) { toast(errMsg(err), 'error') }
}
async function doWithdraw() {
  const amount = Number(document.getElementById('withdraw-amount').value)
  if (!amount) { toast('출금 금액을 입력해주세요.', 'warn'); return }
  try {
    await api.post('/me/withdraw', { amount })
    toast('출금 신청이 접수되었어요! 관리자 승인 후 처리됩니다.', 'success')
    pageWithdraw()
  } catch (err) { toast(errMsg(err), 'error') }
}

// 포인트 내역
async function pageHistory(params, query) {
  if (!Store.user) { requireLoginRedirect(); return }
  document.getElementById('app').innerHTML = renderLoading()
  const kind = query.kind || ''
  const { data } = await api.get('/me/history' + (kind ? '?kind=' + kind : ''))

  const typeLabel = { CHARGE: '충전', USE: '사용', REWARD: '보상', REFERRAL: '추천수당', WITHDRAW: '출금', ADMIN_ADJ: '관리자조정' }
  const kindLabel = { AUCTION: '경매', BALANCE: '잔액', WAGE: '임금' }
  const filterBtn = (k, label) => `<a href="#/mypage/history${k ? '?kind='+k : ''}" class="px-3 py-1.5 rounded-full text-sm font-medium ${kind===k ? 'bg-brand-orange text-white' : 'bg-gray-100 text-gray-600'}">${label}</a>`

  document.getElementById('app').innerHTML = layout(`
  <a href="#/mypage" class="text-sm text-gray-400 hover:text-brand-orange"><i class="fas fa-chevron-left"></i> 마이페이지</a>
  <h1 class="text-xl font-extrabold mt-3 mb-4">포인트 내역</h1>
  <div class="flex gap-2 mb-4 flex-wrap">
    ${filterBtn('', '전체')}${filterBtn('AUCTION', '경매')}${filterBtn('BALANCE', '잔액')}${filterBtn('WAGE', '임금')}
  </div>
  <div class="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
    ${data.history.length ? data.history.map(h => `
      <div class="flex items-center justify-between px-4 py-3">
        <div>
          <div class="font-medium text-sm">${h.description}</div>
          <div class="text-xs text-gray-400 mt-0.5">${fmtDateTime(h.createdAt)} · ${typeLabel[h.type]||h.type} · ${kindLabel[h.pointKind]||h.pointKind}</div>
        </div>
        <div class="font-extrabold text-sm ${h.amount >= 0 ? 'text-green-600' : 'text-red-500'}">${h.amount >= 0 ? '+' : ''}${won(h.amount)}P</div>
      </div>`).join('') : '<p class="text-center text-gray-400 py-10">내역이 없습니다.</p>'}
  </div>`)
}

// 내 참여 내역
async function pageBids(params, query) {
  if (!Store.user) { requireLoginRedirect(); return }
  document.getElementById('app').innerHTML = renderLoading()
  const { data } = await api.get('/me/bids')
  const tab = query.tab || 'all'
  let bids = data.bids
  if (tab === 'win') bids = bids.filter(b => b.isWinner)
  if (tab === 'lose') bids = bids.filter(b => !b.isWinner && b.productStatus === 'DRAWN')

  const tabBtn = (t, label) => `<a href="#/mypage/bids?tab=${t}" class="px-4 py-2 rounded-full text-sm font-medium ${tab===t ? 'bg-brand-orange text-white' : 'bg-gray-100 text-gray-600'}">${label}</a>`

  document.getElementById('app').innerHTML = layout(`
  <a href="#/mypage" class="text-sm text-gray-400 hover:text-brand-orange"><i class="fas fa-chevron-left"></i> 마이페이지</a>
  <h1 class="text-xl font-extrabold mt-3 mb-4">내 참여 내역</h1>
  <div class="flex gap-2 mb-4">${tabBtn('all','전체')}${tabBtn('win','🏆 당첨')}${tabBtn('lose','미당첨')}</div>
  <div class="grid sm:grid-cols-2 gap-3">
    ${bids.length ? bids.map(b => {
      const status = b.productStatus === 'OPEN' ? '<span class="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">진행중</span>'
        : b.isWinner ? '<span class="text-xs bg-brand-gold/30 text-yellow-800 px-2 py-0.5 rounded-full font-bold">🏆 당첨</span>'
        : '<span class="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">미당첨</span>'
      return `<a href="#/products/${b.productId}" class="bg-white rounded-2xl border border-gray-100 p-3 flex gap-3 hover:shadow-md transition">
        <img src="${b.imageUrl}" class="w-20 h-20 rounded-xl object-cover" onerror="this.src='https://placehold.co/80'" />
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-2"><h3 class="font-bold text-sm truncate">${b.title}</h3>${status}</div>
          <div class="text-xs text-gray-400 mt-1">참여 ${won(b.pointsUsed)}P · ${fmtDate(b.createdAt)}</div>
          ${b.isWinner ? `<div class="text-xs text-brand-orange font-medium mt-1">낙찰가 ${won(b.startPrice)}원에 자동구매</div>`
            : (b.productStatus==='DRAWN' ? `<div class="text-xs text-green-600 font-medium mt-1">보상 +${won(b.losingReward)}P 지급</div>` : '')}
        </div>
      </a>`
    }).join('') : '<p class="text-center text-gray-400 py-10 sm:col-span-2">참여 내역이 없습니다.</p>'}
  </div>`)
}
