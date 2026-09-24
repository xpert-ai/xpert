const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { packages, prepareManifestWorkspace, prepareRuntime, runtimeManifest } = require('./dependencies.cjs')

test('runtime dependencies retain source protocols and compiler entry points', () => {
  const source = {
    name: 'example',
    version: '1.0.0',
    dependencies: { chatkit: 'catalog:', local: 'workspace:*' },
    devDependencies: { compiler: '1.0.0' },
    peerDependencies: { react: '>=18' },
    peerDependenciesMeta: { react: { optional: true } }
  }
  const built = {
    name: 'example',
    version: '1.0.0',
    main: './src/index.js',
    exports: { '.': './src/index.js' },
    dependencies: { chatkit: '0.6.3', local: '1.0.0' }
  }
  const result = runtimeManifest(source, built)
  assert.deepEqual(result.dependencies, source.dependencies)
  assert.deepEqual(result.devDependencies, source.devDependencies)
  assert.deepEqual(result.peerDependenciesMeta, source.peerDependenciesMeta)
  assert.deepEqual(result.exports, built.exports)
  assert.equal(result.main, built.main)
  assert.equal(result.optionalDependencies, undefined)
  assert.equal(built.dependencies.chatkit, '0.6.3')
})

test('mismatched build artifacts fail before assembly', () => {
  const source = { name: 'example', version: '1.0.0' }
  assert.throws(() => runtimeManifest(source, { ...source, version: '0.9.0' }), /Rebuild example/)
  assert.throws(() => runtimeManifest(source, { ...source, name: 'other' }), /Rebuild example/)
})

test('compiler-added dependencies require a source declaration and lock update', () => {
  const source = { name: 'example', version: '1.0.0' }
  assert.throws(
    () => runtimeManifest(source, { ...source, optionalDependencies: { newRuntime: '1.0.0' } }),
    /Declare example optionalDependencies.newRuntime/
  )
})

function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'api-dependency-test-'))
  t.after(() => fs.rmSync(base, { recursive: true, force: true }))
  const root = path.join(base, 'source')
  const write = (name, data) => {
    const file = path.join(root, name)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data))
  }
  for (const dir of packages) {
    const nested = ['packages/contracts', 'packages/plugin-sdk'].includes(dir)
    const source = { name: dir, version: '1.0.0', dependencies: { chatkit: 'catalog:' } }
    if (nested) source.publishConfig = { directory: 'dist' }
    if (dir === 'packages/desktop-protocol') source.files = ['index.js', 'index.d.ts']
    write(`${dir}/package.json`, source)
    if (source.files) {
      for (const file of source.files) write(`${dir}/${file}`, '// protocol')
    } else {
      const output = nested ? `${dir}/dist` : `dist/${dir}`
      write(`${dir}/project.json`, { targets: { build: { options: { outputPath: output } } } })
      write(`${output}/package.json`, { ...source, main: './index.js', dependencies: { chatkit: '0.6.3' } })
      write(`${output}/index.js`, '// compiled')
    }
  }
  write('.deploy/api/package.json', { name: 'api-build', dependencies: { compiler: '1.0.0' } })
  write('apps/api/package.json', { name: 'api', dependencies: { core: '1.0.0' } })
  write('.deploy/api/package-prod.json', { name: 'api-production', dependencies: { chatkit: 'catalog:' } })
  write('.deploy/api/pnpm-lock.build.yaml', 'build-lock')
  write('.deploy/api/pnpm-lock.production.yaml', 'production-lock')
  write('dist/apps/api/main.js', '// API')
  write('dist/apps/api/node_modules/stale/index.js', '// must not copy')
  write('pnpm-workspace.yaml', 'catalog: {}')
  write('.npmrc', 'node-linker=hoisted')
  write('tsconfig.base.json', {})
  return { root, destination: path.join(base, 'runtime'), write }
}

test('each installation profile selects its own manifest and lock', (t) => {
  const { root, destination } = fixture(t)
  for (const stage of ['build', 'production']) {
    const target = path.join(destination, stage)
    prepareManifestWorkspace(stage, target, root)
    assert.equal(JSON.parse(fs.readFileSync(path.join(target, 'package.json'))).name, `api-${stage}`)
    assert.equal(fs.readFileSync(path.join(target, 'pnpm-lock.yaml'), 'utf8'), `${stage}-lock`)
    for (const dir of packages) assert.ok(fs.existsSync(path.join(target, dir, 'package.json')))
    assert.equal(fs.existsSync(path.join(target, 'apps/api/package.json')), stage === 'build')
  }
})

test('runtime assembly preserves nested publish roots, legacy paths, and direct JS packages', (t) => {
  const { root, destination } = fixture(t)
  prepareRuntime(destination, root)
  assert.equal(fs.readFileSync(path.join(destination, 'pnpm-lock.yaml'), 'utf8'), 'production-lock')
  assert.ok(!fs.existsSync(path.join(destination, 'node_modules')))
  for (const file of [
    'main.js',
    'packages/contracts/dist/index.js',
    'packages/plugin-sdk/dist/index.js',
    'packages/server-ai/index.js',
    'dist/packages/server-ai/index.js',
    'packages/desktop-protocol/index.js'
  ]) {
    assert.ok(fs.existsSync(path.join(destination, file)), file)
  }
  for (const dir of packages) {
    const manifest = JSON.parse(fs.readFileSync(path.join(destination, dir, 'package.json')))
    assert.equal(manifest.dependencies.chatkit, 'catalog:')
  }
  assert.throws(() => prepareRuntime(destination, root), /must not exist/)
})

test('missing compiler output is rejected instead of shipping source-only packages', (t) => {
  const { root, destination } = fixture(t)
  fs.rmSync(path.join(root, 'dist/packages/server-ai'), { recursive: true })
  assert.throws(() => prepareRuntime(destination, root), /ENOENT/)
})
