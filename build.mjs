// esbuild 번들 스크립트
// server/index.ts 와 그 안의 모든 src/* import 를 하나의 자체완결 파일로 묶어
// api/index.js 로 출력한다. 이렇게 하면 Vercel 함수 런타임에서
// '../src/index' 같은 미해결 import (ERR_MODULE_NOT_FOUND) 가 발생하지 않는다.
//
// 출력 포맷은 CommonJS(cjs) 로 한다. Vercel Node 런타임은 CJS 함수를 가장 안정적으로
// 실행하며, ESM 번들 시 발생하던 FUNCTION_INVOCATION_FAILED 를 피할 수 있다.
// 루트 package.json 이 "type":"module" 이므로, api/ 디렉토리에 별도의
// package.json({"type":"commonjs"}) 를 두어 api/index.js 를 CJS 로 강제 해석시킨다.
import { build } from 'esbuild'
import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('api', { recursive: true })

await build({
  entryPoints: ['server/index.ts'],
  outfile: 'api/index.js',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  logLevel: 'info',
})

// api/index.js 를 CommonJS 로 해석하도록 api/package.json 생성
writeFileSync('api/package.json', JSON.stringify({ type: 'commonjs' }, null, 2) + '\n')

console.log('✅ Bundled server/index.ts -> api/index.js (cjs)')
