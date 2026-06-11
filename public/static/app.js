// ===== 라우터 등록 & 부트스트랩 =====
Router.add('/', pageHome)
Router.add('/auth/login', pageLogin)
Router.add('/auth/register', pageRegister)
Router.add('/auth/forgot', pageForgot)
Router.add('/products/:id', pageProduct)

Router.add('/mypage', pageMypage)
Router.add('/mypage/charge', pageCharge)
Router.add('/mypage/withdraw', pageWithdraw)
Router.add('/mypage/history', pageHistory)
Router.add('/mypage/bids', pageBids)
Router.add('/mypage/network', pageNetwork)
Router.add('/mypage/password', pagePassword)

Router.add('/admin', pageAdmin)
Router.add('/admin/products', pageAdminProducts)
Router.add('/admin/products/new', pageAdminProductForm)
Router.add('/admin/products/:id/edit', pageAdminProductForm)
Router.add('/admin/members', pageAdminMembers)
Router.add('/admin/network', pageAdminNetwork)
Router.add('/admin/withdrawals', pageAdminWithdrawals)
Router.add('/admin/config', pageAdminConfig)

// 현재 라우트 다시 렌더 (헤더 갱신 등)
function render() { Router.resolve() }

window.addEventListener('hashchange', () => Router.resolve())

// 최초 부트: 세션 로드 후 라우팅
;(async () => {
  await Store.loadMe()
  if (!window.location.hash) window.location.hash = '/'
  Router.resolve()
})()
