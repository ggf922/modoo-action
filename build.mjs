// esbuild 번들 스크립트
// server/index.ts 와 그 안의 모든 src/* import 를 하나의 자체완결 파일로 묶어
// api/index.js 로 출력한다. 이렇게 하면 Vercel 함수 런타임에서
// '../src/index' 같은 미해결 import (ERR_MODULE_NOT_FOUND) 가 발생하지 않는다.
import { build } from 'esbuild'
import { mkdirSync } from 'node:fs'

mkdirSync('api', { recursive: true })

await build({
  entryPoints: ['server/index.ts'],
  outfile: 'api/index.js',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  // 네이티브/대형 의존성은 외부로 두지 않고 모두 번들에 포함 (자체완결 함수)
  // postgres, hono, jose, bcryptjs 모두 순수 JS 라 번들 가능
  banner: {
    // ESM 번들에서 일부 패키지가 require/__dirname 을 참조할 때를 대비한 shim
    js: `import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url); import { fileURLToPath as __ftp } from 'url'; import { dirname as __dn } from 'path'; const __filename = __ftp(import.meta.url); const __dirname = __dn(__filename);`,
  },
  logLevel: 'info',
})

console.log('✅ Bundled server/index.ts -> api/index.js')
