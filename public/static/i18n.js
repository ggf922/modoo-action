// ===== 다국어(i18n) 자동 번역 레이어 =====
// 기존 페이지 로직을 일절 수정하지 않고, 렌더된 DOM의 한국어 텍스트를
// 선택 언어로 자동 치환한다. 상품 이미지(<img>)는 텍스트 노드가 아니므로 제외된다.

const I18N = {
  lang: 'ko',
  // 지원 언어 (ko 기본)
  langs: [
    { code: 'ko', label: '한국어', flag: '🇰🇷' },
    { code: 'en', label: 'English', flag: '🇺🇸' },
    { code: 'zh', label: '中文', flag: '🇨🇳' },
    { code: 'ja', label: '日本語', flag: '🇯🇵' },
    { code: 'ar', label: 'العربية', flag: '🇸🇦' },
    { code: 'es', label: 'Español', flag: '🇪🇸' },
    { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  ],
  rtl: ['ar'],
  dict: {}, // dict[targetLang][koText] = translatedText
  _observer: null,

  init() {
    try { this.lang = localStorage.getItem('lang') || 'ko' } catch { this.lang = 'ko' }
    if (!this.langs.some(l => l.code === this.lang)) this.lang = 'ko'
    this.applyDir()
    this.startObserver()
    // 최초 1회 + 폰트/레이아웃 안정화 후 한 번 더
    this.translateAll()
    setTimeout(() => this.translateAll(), 300)
  },

  setLang(code) {
    if (!this.langs.some(l => l.code === code)) return
    this.lang = code
    try { localStorage.setItem('lang', code) } catch {}
    this.applyDir()
    // 언어 변경 시 현재 화면을 다시 렌더해 원문(한국어) 기준으로 재번역
    if (typeof Router !== 'undefined' && Router.resolve) Router.resolve()
    setTimeout(() => this.translateAll(), 50)
  },

  applyDir() {
    const isRtl = this.rtl.includes(this.lang)
    document.documentElement.setAttribute('lang', this.lang)
    document.documentElement.setAttribute('dir', isRtl ? 'rtl' : 'ltr')
  },

  startObserver() {
    if (this._observer) return
    this._observer = new MutationObserver((muts) => {
      if (this.lang === 'ko') return
      for (const m of muts) {
        for (const n of m.addedNodes) this.translateNode(n)
        if (m.type === 'characterData' && m.target) this.translateTextNode(m.target)
      }
    })
    this._observer.observe(document.body, { childList: true, subtree: true, characterData: true })
  },

  translateAll() {
    if (this.lang === 'ko') return
    this.translateNode(document.body)
  },

  translateNode(node) {
    if (this.lang === 'ko' || !node) return
    if (node.nodeType === Node.TEXT_NODE) { this.translateTextNode(node); return }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    // 스크립트/스타일/이미지/입력 영역은 건드리지 않음
    const tag = node.tagName
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'IMG' || tag === 'SVG' || tag === 'TEXTAREA') return
    // placeholder 번역
    if (node.hasAttribute && node.hasAttribute('placeholder')) {
      const t = this.lookup(node.getAttribute('placeholder'))
      if (t) node.setAttribute('placeholder', t)
    }
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        const p = n.parentNode
        if (!p) return NodeFilter.FILTER_REJECT
        const pt = p.tagName
        if (pt === 'SCRIPT' || pt === 'STYLE' || pt === 'TEXTAREA') return NodeFilter.FILTER_REJECT
        return NodeFilter.FILTER_ACCEPT
      },
    })
    const nodes = []
    let cur
    while ((cur = walker.nextNode())) nodes.push(cur)
    nodes.forEach(n => this.translateTextNode(n))
  },

  translateTextNode(n) {
    if (this.lang === 'ko' || !n || n.nodeType !== Node.TEXT_NODE) return
    const raw = n.nodeValue
    if (!raw || !raw.trim()) return
    const t = this.lookup(raw)
    if (t != null && t !== raw) n.nodeValue = t
  },

  // 공백/줄바꿈을 보존하며 핵심 문구를 매핑
  lookup(text) {
    const d = this.dict[this.lang]
    if (!d) return null
    const trimmed = text.trim()
    if (!trimmed) return null
    // 정확 일치 우선
    if (d[trimmed] != null) {
      // 앞뒤 공백 보존
      const pre = text.match(/^\s*/)[0]
      const post = text.match(/\s*$/)[0]
      return pre + d[trimmed] + post
    }
    return null
  },
}
