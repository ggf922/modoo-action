// ===== 조직도 (SVG 트리 시각화) =====
async function pageNetwork() {
  if (!Store.user) { requireLoginRedirect(); return }
  document.getElementById('app').innerHTML = renderLoading()
  const { data } = await api.get('/me/network')
  const { root, nodes, summary, totalDownline } = data

  // 트리 구조 빌드
  const byParent = {}
  nodes.forEach(n => { (byParent[n.referrerId] = byParent[n.referrerId] || []).push(n) })

  // 레벨별 레이아웃 계산 (서브트리 폭 기반 — 겹침 없음)
  const NODE_W = 150, NODE_H = 64, H_GAP = 24, V_GAP = 70
  const { positions, svgW, svgH } = buildTreeLayout(root.id, byParent, { NODE_W, NODE_H, H_GAP, V_GAP })

  const allNodes = [{ ...root, level: 0 }, ...nodes]

  // 엣지(연결선)
  let edges = ''
  nodes.forEach(n => {
    const p = positions[n.referrerId], c = positions[n.id]
    if (!p || !c) return
    const x1 = p.x + NODE_W/2, y1 = p.y + NODE_H
    const x2 = c.x + NODE_W/2, y2 = c.y
    const my = (y1 + y2) / 2
    edges += `<path d="M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}" stroke="#cbd5e0" stroke-width="2" fill="none"/>`
  })

  // 노드
  let nodeEls = ''
  allNodes.forEach(n => {
    const pos = positions[n.id]
    if (!pos) return
    const isRoot = n.id === root.id
    const gi = gradeInfo(n.grade)
    const fill = isRoot ? '#FFC107' : gi.color
    const s = summary[n.id] || { bids: 0, wins: 0 }
    nodeEls += `<g transform="translate(${pos.x},${pos.y})" style="cursor:pointer"
                   onclick='showNodeDetail(${JSON.stringify({ ...n, ...s, isRoot }).replace(/'/g, "&#39;")})'>
      <rect width="${NODE_W}" height="${NODE_H}" rx="12" fill="white" stroke="${fill}" stroke-width="2.5"/>
      <rect width="6" height="${NODE_H}" rx="3" fill="${fill}"/>
      <rect x="${NODE_W - 52}" y="9" width="44" height="17" rx="8.5" fill="${fill}"/>
      <text x="${NODE_W - 30}" y="21" font-size="9.5" font-weight="700" fill="white" text-anchor="middle">${gi.label}</text>
      <text x="16" y="24" font-size="14" font-weight="700" fill="#2D3748">${n.name}</text>
      <text x="16" y="42" font-size="11" fill="#718096">@${n.nickname}</text>
      <text x="16" y="57" font-size="10" fill="#a0aec0">${fmtDate(n.createdAt)} · 참여${s.bids}/당첨${s.wins}</text>
    </g>`
  })

  document.getElementById('app').innerHTML = layout(`
  <a href="#/mypage" class="text-sm text-gray-400 hover:text-brand-orange"><i class="fas fa-chevron-left"></i> 마이페이지</a>
  <div class="flex items-center justify-between mt-3 mb-4">
    <h1 class="text-xl font-extrabold">내 조직도</h1>
    <span class="text-sm bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full font-medium">총 산하 ${totalDownline}명</span>
  </div>
  <div class="grid lg:grid-cols-3 gap-4">
    <div class="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-4 overflow-auto">
      <div class="flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-gray-500 mb-3">
        <span><span class="inline-block w-3 h-3 rounded align-middle" style="background:#FFC107"></span> 본인</span>
        ${GRADE_ORDER.map(g => `<span><span class="inline-block w-3 h-3 rounded align-middle" style="background:${gradeColor(g)}"></span> ${gradeInfo(g).label}</span>`).join('')}
      </div>
      ${totalDownline === 0
        ? `<div class="text-center py-16 text-gray-400"><div class="text-4xl mb-3">🌱</div><p>아직 추천한 회원이 없어요.</p><p class="text-sm mt-1">추천코드 <b class="text-brand-orange">${root.referralCode}</b>를 공유해보세요!</p></div>`
        : `<svg viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" style="min-width:${svgW}px">${edges}${nodeEls}</svg>`}
    </div>
    <div id="node-detail" class="bg-white rounded-2xl border border-gray-100 p-5">
      <div class="text-center text-gray-400 py-8"><div class="text-3xl mb-2">👆</div><p class="text-sm">노드를 클릭하면<br/>활동 요약이 표시돼요</p></div>
    </div>
  </div>`)
}

function showNodeDetail(n) {
  const el = document.getElementById('node-detail')
  el.innerHTML = `
    <div class="text-center mb-4">
      <div class="w-16 h-16 rounded-full mx-auto flex items-center justify-center text-white text-2xl mb-2" style="background:${n.isRoot ? '#FFC107' : '#60a5fa'}">
        ${n.isRoot ? '👑' : '👤'}</div>
      <div class="font-extrabold text-lg">${n.name}</div>
      <div class="text-sm text-gray-400">@${n.nickname}</div>
      <div class="mt-1.5">${n.isRoot ? '<span class="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800"><i class="fas fa-crown"></i> 본인</span>' : gradeBadge(n.grade)}</div>
    </div>
    <div class="space-y-2 text-sm">
      <div class="flex justify-between py-2 border-b border-gray-50"><span class="text-gray-400">등급</span><span class="font-medium">${gradeInfo(n.grade).label}</span></div>
      <div class="flex justify-between py-2 border-b border-gray-50"><span class="text-gray-400">가입일</span><span class="font-medium">${fmtDate(n.createdAt)}</span></div>
      <div class="flex justify-between py-2 border-b border-gray-50"><span class="text-gray-400">경매 참여</span><span class="font-medium">${n.bids}회</span></div>
      <div class="flex justify-between py-2 border-b border-gray-50"><span class="text-gray-400">낙찰</span><span class="font-medium text-brand-orange">${n.wins}회</span></div>
      ${n.level !== undefined ? `<div class="flex justify-between py-2"><span class="text-gray-400">단계</span><span class="font-medium">${n.isRoot ? '본인' : n.level + '단계 하위'}</span></div>` : ''}
    </div>`
}
