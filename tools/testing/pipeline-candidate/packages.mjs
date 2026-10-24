// Candidate packages are built only from this checkout. Keep runtime and declaration
// entry points aligned, and resolve workspace/catalog ranges before packing.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { transform } from '@swc/core'
import { parse } from 'yaml'
const require = createRequire(import.meta.url)
const output = path.resolve(process.argv[2])
const sha = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).trim()
const version = `4.0.0-pipeline.0.${sha}`
const catalog = parse(fs.readFileSync('pnpm-workspace.yaml', 'utf8')).catalog
fs.mkdirSync(output, { recursive: true })
const run = (args) =>
  execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), ...args], { stdio: 'inherit' })
for (const name of ['contracts', 'plugin-sdk']) {
  const base = `packages/${name}`
  const dist = path.resolve(base, 'dist')
  fs.rmSync(dist, { recursive: true, force: true })
  fs.mkdirSync(dist, { recursive: true })
  const options = JSON.parse(fs.readFileSync(`${base}/project.json`)).targets.build.options
  const entries = [options.main, ...(options.additionalEntryPoints ?? [])]
  if (name === 'plugin-sdk' && entries.length === 1) {
    for (const key of Object.keys(JSON.parse(fs.readFileSync(`${base}/package.json`)).exports))
      if (key !== '.' && key !== './package.json') entries.push(`${base}/src/${key.slice(2)}.ts`)
  }
  const manifest = JSON.parse(fs.readFileSync(`${base}/package.json`))
  manifest.version = version
  delete manifest.publishConfig.directory
  delete manifest.scripts
  manifest.main = './index.cjs'
  manifest.module = './index.esm.js'
  manifest.types = './src/index.d.ts'
  manifest.exports = { './package.json': './package.json' }
  for (const entry of entries) {
    const stem = path.basename(entry, '.ts')
    manifest.exports[stem === 'index' ? '.' : `./${stem}`] = {
      types: `./src/${stem}.d.ts`,
      module: `./${stem}.esm.js`,
      import: `./${stem}.mjs`,
      require: `./${stem}.cjs`,
      default: `./${stem}.cjs`
    }
    for (const format of ['cjs', 'esm']) {
      const result = await build({
        metafile: true,
        entryPoints: [entry],
        bundle: true,
        platform: 'node',
        format,
        packages: 'external',
        external: ['@xpert-ai/contracts'],
        outfile: `${dist}/${stem}.${format === 'cjs' ? 'cjs' : 'esm.js'}`,
        // Keep host DI decorator metadata; esbuild's TypeScript transform alone omits it.
        plugins:
          name === 'plugin-sdk'
            ? [
                {
                  name: 'decorator-metadata',
                  setup(api) {
                    api.onLoad({ filter: /\.ts$/ }, async ({ path: file }) => ({
                      contents: (
                        await transform(fs.readFileSync(file, 'utf8'), {
                          filename: file,
                          jsc: {
                            parser: { syntax: 'typescript', decorators: true },
                            target: 'es2022',
                            transform: { legacyDecorator: true, decoratorMetadata: true }
                          },
                          module: { type: 'es6' }
                        })
                      ).code,
                      loader: 'js',
                      resolveDir: path.dirname(file)
                    }))
                  }
                }
              ]
            : []
      })
      if (format === 'esm') {
        // Native Node shares the CJS instance; bundlers use the tree-shakable module condition.
        const names = Object.values(result.metafile.outputs).flatMap((output) => output.exports)
        const exports = names
          .filter((name) => name !== 'default')
          .map((name) => `export const ${name} = cjs.${name};`)
          .join('\n')
        fs.writeFileSync(`${dist}/${stem}.mjs`, `import cjs from './${stem}.cjs';\n${exports}\nexport default cjs;\n`)
      }
    }
  }
  for (const section of ['dependencies', 'peerDependencies'])
    for (const [dep, range] of Object.entries(manifest[section] ?? {})) {
      if (range.startsWith('workspace:'))
        manifest[section][dep] =
          dep === '@xpert-ai/contracts'
            ? version
            : JSON.parse(fs.readFileSync(`node_modules/${dep}/package.json`)).version
      if (range === 'catalog:') manifest[section][dep] = catalog[dep]
    }
  fs.writeFileSync(`${dist}/package.json`, JSON.stringify(manifest, null, 2) + '\n')
  const config = path.join(output, `${name}.tsconfig.json`)
  fs.writeFileSync(
    config,
    JSON.stringify({
      extends: path.resolve(base, 'tsconfig.lib.json'),
      compilerOptions: {
        rootDir: path.resolve(base, 'src'),
        outDir: `${dist}/src`,
        emitDeclarationOnly: true,
        incremental: false,
        noEmitOnError: true,
        paths: { '@xpert-ai/contracts': [path.resolve('packages/contracts/dist/src/index.d.ts')] }
      },
      include: [path.resolve(base, 'src/**/*.ts')],
      exclude: [path.resolve(base, 'src/**/*.spec.ts'), path.resolve(base, 'src/**/*.test.ts')]
    })
  )
  run(['-p', config])
  if (name === 'contracts') run(['-p', `${base}/tsconfig.pipeline.json`])
  fs.writeFileSync(`${dist}/index.d.ts`, "export * from './src/index'\n")
  if (fs.existsSync(`${base}/README.md`)) fs.copyFileSync(`${base}/README.md`, `${dist}/README.md`)
  if (fs.existsSync(`${base}/docs`)) fs.cpSync(`${base}/docs`, `${dist}/docs`, { recursive: true })
  execFileSync('corepack', ['pnpm', 'pack', '--pack-destination', output], { cwd: dist, stdio: 'inherit' })
}
console.log(`Candidate package pair: ${version}`)
