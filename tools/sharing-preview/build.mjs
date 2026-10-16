import fs from 'node:fs/promises'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { compile } from '@tailwindcss/node'
import { Scanner } from '@tailwindcss/oxide'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const output = path.join(root, '.cache/sharing-preview')
await fs.mkdir(path.join(output, 'src'), { recursive: true })
const componentRoot = 'apps/cloud/src/app/features/xpert/xpert/authorization/'
let source = await fs.readFile(path.join(root, componentRoot, 'authorization.component.ts'), 'utf8')
source = source
  .replaceAll("'@xpert-ai/headless-ui'", "'../../../tools/sharing-preview/ui'")
  .replaceAll("'@cloud/app/@core/state'", "'../../../tools/sharing-preview/fixtures'")
  .replaceAll("'apps/cloud/src/app/@core'", "'../../../tools/sharing-preview/fixtures'")
  .replaceAll("'../xpert.component'", "'../../../tools/sharing-preview/fixtures'")
  .replaceAll("'apps/cloud/src/app/@shared/user'", "'./avatar'")
  .replace(
    "styleUrl: './authorization.component.css'",
    "styles: [':host { display:flex; height:100%; min-width:0; flex:1; flex-direction:column; background:var(--components-panel-bg); color:var(--foreground) }']"
  )
await fs.writeFile(path.join(output, 'src/authorization.component.ts'), source)
await fs.copyFile(
  path.join(root, componentRoot, 'authorization.component.html'),
  path.join(output, 'src/authorization.component.html')
)
const avatar = (
  await fs.readFile(path.join(root, 'apps/cloud/src/app/@shared/user/avatar/avatar.component.ts'), 'utf8')
).replace("from '../../../@core'", "from '@xpert-ai/contracts'")
await fs.writeFile(path.join(output, 'src/avatar.ts'), avatar)
await fs.writeFile(
  path.join(output, 'tsconfig.json'),
  JSON.stringify({
    extends: '../../tsconfig.base.json',
    compilerOptions: {
      outDir: './ngc',
      rootDir: '../..',
      declaration: false,
      types: [],
      moduleResolution: 'bundler',
      resolveJsonModule: true,
      esModuleInterop: true
    },
    angularCompilerOptions: { compilationMode: 'full' },
    files: ['../../tools/sharing-preview/main.ts'],
    include: []
  })
)
execFileSync('corepack', ['pnpm', 'exec', 'ngc', '-p', '.cache/sharing-preview/tsconfig.json'], {
  cwd: root,
  stdio: 'inherit'
})
await build({
  entryPoints: [path.join(output, 'ngc/tools/sharing-preview/main.js')],
  outfile: path.join(output, 'app.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  minify: true,
  define: { ngDevMode: 'false' }
})
const css = `@config '../../apps/cloud/tailwind.config.js';
@import '../../packages/ui/src/styles.css';
@import '../../apps/cloud/src/styles/theme/theme.tokens.css';
@import '../../apps/cloud/src/styles/theme/theme.primary.css';
@import '../../apps/cloud/src/styles/theme/theme.tailwind.css';
@import '@angular/cdk/overlay-prebuilt.css';
@source '../../packages/ui/src';
@source '../../apps/cloud/src/app/features/xpert/xpert/authorization';
@source '../../tools/sharing-preview';
html,body { margin:0; font-size:14px; font-family:var(--font-xp-sans); color:var(--foreground); background:var(--background); }
`
const compiler = await compile(css, { base: path.join(root, 'tools/sharing-preview'), onDependency() {} })
await fs.writeFile(path.join(output, 'app.css'), compiler.build(new Scanner({ sources: compiler.sources }).scan()))
await fs.cp(path.join(root, 'node_modules/remixicon/fonts'), path.join(output, 'fonts'), { recursive: true })
await fs.writeFile(
  path.join(output, 'index.html'),
  '<!doctype html><html lang="zh-Hans"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ClawXpert · 分享与访问</title><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/fonts/remixicon.css"></head><body><sharing-preview></sharing-preview><script type="module" src="/app.js"></script></body></html>'
)
console.log(`Sharing preview built at ${output}`)
