export function renderApp(): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>모두모두 🎁 경매몰 — 전원 수익형 경매</title>
  <meta name="description" content="낙찰자는 저렴하게, 미낙찰자는 보상 포인트! 모두가 이익을 보는 세계 최초 전원 수익형 공동 구매 경매 쇼핑몰" />

  <!-- ===== 링크 공유 미리보기 (Open Graph / 카카오톡·페이스북 등) ===== -->
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="모두모두 경매몰" />
  <meta property="og:title" content="모두가 이익을 보는 공동 구매 경매 쇼핑몰, 모두모두 🎁" />
  <meta property="og:description" content="낙찰되면 시중가보다 훨씬 저렴하게 자동 구매! 아쉽게 미낙찰돼도 보상 포인트를 드려요." />
  <meta property="og:image" content="https://modoo.auction/static/og-image.jpg" />
  <meta property="og:image:secure_url" content="https://modoo.auction/static/og-image.jpg" />
  <meta property="og:image:type" content="image/jpeg" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="모두모두 경매몰 — 모두가 이익을 보는 공동 구매 경매 쇼핑몰" />
  <meta property="og:url" content="https://modoo.auction/" />
  <meta property="og:locale" content="ko_KR" />

  <!-- ===== 트위터(X) 카드 ===== -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="모두가 이익을 보는 공동 구매 경매 쇼핑몰, 모두모두 🎁" />
  <meta name="twitter:description" content="낙찰되면 시중가보다 훨씬 저렴하게 자동 구매! 아쉽게 미낙찰돼도 보상 포인트를 드려요." />
  <meta name="twitter:image" content="https://modoo.auction/static/og-image.jpg" />

  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://cdn.jsdelivr.net" />
  <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css" rel="stylesheet" />
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet" />
  <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            brand: { orange: '#FF6B35', gold: '#FFC107', dark: '#2D3748' },
          },
          fontFamily: { sans: ['Pretendard', 'system-ui', 'sans-serif'] },
        },
      },
    }
  </script>
  <style>
    body { font-family: 'Pretendard', system-ui, sans-serif; -webkit-tap-highlight-color: transparent; }
    @keyframes pop { 0% { transform: scale(0); opacity: 0; } 70% { transform: scale(1.15); } 100% { transform: scale(1); opacity: 1; } }
    @keyframes fadeup { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes spin360 { to { transform: rotate(720deg); } }
    @keyframes confetti-fall { to { transform: translateY(120vh) rotate(720deg); opacity: 0; } }
    .animate-pop { animation: pop .4s cubic-bezier(.2,.8,.3,1.2) both; }
    .animate-fadeup { animation: fadeup .4s ease both; }
    .gauge-icon { transition: all .3s ease; }
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-thumb { background: #cbd5e0; border-radius: 4px; }
    .line-through-soft { text-decoration: line-through; text-decoration-color: #cbd5e0; }
  </style>
</head>
<body class="bg-gray-50 text-brand-dark min-h-screen">
  <div id="app"></div>
  <div id="modal-root"></div>
  <div id="toast-root" class="fixed top-4 right-4 z-[100] flex flex-col gap-2"></div>
  <script src="/static/api.js"></script>
  <script src="/static/components.js"></script>
  <script src="/static/pages.js"></script>
  <script src="/static/mypage.js"></script>
  <script src="/static/network.js"></script>
  <script src="/static/admin.js"></script>
  <script src="/static/app.js"></script>
</body>
</html>`
}
