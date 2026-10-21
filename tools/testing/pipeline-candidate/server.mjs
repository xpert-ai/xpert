// Compile the complete API dependency closure with TypeScript decorator metadata.
// The portable archive excludes local dependency links; its runtime lock is retained.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const root = process.cwd()
const destination = path.resolve(process.argv[2], 'api')
fs.mkdirSync(destination, { recursive: true })
const config = path.resolve(process.argv[2], 'api.tsconfig.json')
const base = JSON.parse(fs.readFileSync('tsconfig.base.json'))
fs.writeFileSync(
  config,
  JSON.stringify({
    extends: path.resolve('apps/api/tsconfig.app.json'),
    include: [
      path.resolve('apps/api/src/**/*.ts'),
      path.resolve('packages/plugins/cli-model-profiles/src/**/*.ts'),
      path.resolve('packages/plugins/draft/src/**/*.ts'),
      path.resolve('packages/plugins/github-integration/src/**/*.ts'),
      path.resolve('packages/plugins/vlm-default/src/**/*.ts')
    ],
    exclude: [path.resolve('**/*.spec.ts'), path.resolve('**/*.test.ts')],
    compilerOptions: {
      rootDir: root,
      outDir: destination,
      incremental: false,
      declaration: false,
      noEmitOnError: true,
      paths: {
        ...base.compilerOptions.paths,
        '@xpert-ai/contracts': [path.resolve('packages/contracts/dist/src/index.d.ts')],
        '@xpert-ai/plugin-sdk': [path.resolve('packages/plugin-sdk/dist/src/index.d.ts')]
      }
    }
  })
)
execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', config], { stdio: 'inherit' })
function assets(source, dest) {
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const file = path.join(source, entry.name),
      target = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      fs.mkdirSync(target, { recursive: true })
      assets(file, target)
    } else if (!/\.(?:tsx?|cts|mts)$/.test(entry.name)) fs.copyFileSync(file, target)
  }
}
const packages = [
  'auth',
  'common',
  'config',
  'server',
  'server-ai',
  'plugins/cli-model-profiles',
  'plugins/draft',
  'plugins/github-integration',
  'plugins/vlm-default'
]
for (const name of packages) {
  const source = `packages/${name}`,
    dest = path.join(destination, source)
  if (!fs.existsSync(`${dest}/src/index.js`)) continue
  assets(`${source}/src`, `${dest}/src`)
  fs.writeFileSync(
    `${dest}/package.json`,
    JSON.stringify({ ...JSON.parse(fs.readFileSync(`${source}/package.json`)), main: './src/index.js' }, null, 2)
  )
}
for (const name of ['contracts', 'plugin-sdk'])
  fs.cpSync(`packages/${name}/dist`, `${destination}/packages/${name}`, { recursive: true })
fs.cpSync('apps/api/src/assets', `${destination}/apps/api/src/assets`, { recursive: true })
fs.cpSync('packages/desktop-protocol', `${destination}/packages/desktop-protocol`, {
  recursive: true,
  filter: (file) => !file.split(path.sep).includes('node_modules')
})
const brand = `${destination}/packages/shadcn-ui`
fs.writeFileSync(
  `${brand}/package.json`,
  JSON.stringify({
    ...JSON.parse(fs.readFileSync('packages/shadcn-ui/package.json')),
    main: './src/brand-icons/index.cjs',
    exports: { './brand-icons': './src/brand-icons/index.cjs' }
  })
)
for (const file of ['pnpm-lock.yaml', 'package-prod.json'])
  fs.copyFileSync(
    file === 'pnpm-lock.yaml' ? '.deploy/api/pnpm-lock.production.yaml' : `.deploy/api/${file}`,
    `${destination}/${file}`
  )
fs.copyFileSync('pnpm-workspace.yaml', `${destination}/pnpm-workspace.yaml`)
const runtime = JSON.parse(fs.readFileSync(`${destination}/package-prod.json`))
runtime.scripts = { start: 'node apps/api/src/main.js' }
for (const name of [...packages, 'desktop-protocol', 'shadcn-ui']) {
  const manifest = JSON.parse(fs.readFileSync(`${destination}/packages/${name}/package.json`))
  runtime.dependencies[manifest.name] = 'workspace:*'
}
fs.writeFileSync(`${destination}/package.json`, JSON.stringify(runtime, null, 2))
fs.copyFileSync('.npmrc', `${destination}/.npmrc`)
fs.appendFileSync(`${destination}/.npmrc`, '\nlink-workspace-packages=true\n')
console.log('API JS closure, native DI metadata, assets and runtime lock built')
