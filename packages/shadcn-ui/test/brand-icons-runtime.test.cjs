const { test } = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')
const ts = require('typescript')

const packageRoot = path.resolve(__dirname, '..')
const workspaceRoot = path.resolve(packageRoot, '../..')
const catalogModule = '@xpert-ai/shadcn-ui/brand-icons'

function runNode(args, options = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: workspaceRoot,
    encoding: 'utf8',
    timeout: 30_000,
    ...options
  })
  assert.ifError(result.error)
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return JSON.parse(result.stdout)
}

test('the API ts-node loader can synchronously load coding tool branding', () => {
  const brand = runNode([
    require.resolve('ts-node/dist/bin.js'),
    '--project',
    'apps/api/tsconfig.app.json',
    '-r',
    'tsconfig-paths/register',
    '-e',
    `console.log(JSON.stringify(require('./packages/server-ai/src/shared/coding-tools/branding').codingToolBrand({ provider: 'codex-computer' })))`
  ])
  assert.equal(brand.id, 'codex')
  assert.equal(brand.name, 'Codex')
  assert.match(brand.svg, /^<svg\b/)
})

test('the compiled brand-icons package entry supports both require and import', () => {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'xpert-brand-icons-'))
  try {
    const outputRoot = path.join(temporaryRoot, 'node_modules/@xpert-ai/shadcn-ui')
    mkdirSync(outputRoot, { recursive: true })
    const manifest = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'))
    writeFileSync(path.join(outputRoot, 'package.json'), JSON.stringify(manifest))

    const formatHost = {
      getCanonicalFileName: (file) => file,
      getCurrentDirectory: () => workspaceRoot,
      getNewLine: () => '\n'
    }
    const configHost = {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        assert.fail(ts.formatDiagnostics([diagnostic], formatHost))
      }
    }
    const apiConfig = ts.getParsedCommandLineOfConfigFile(
      path.join(workspaceRoot, 'apps/api/tsconfig.app.json'),
      {},
      configHost
    )
    const libraryConfig = ts.getParsedCommandLineOfConfigFile(
      path.join(packageRoot, 'tsconfig.lib.json'),
      {},
      configHost
    )
    const source = ts.resolveModuleName(
      catalogModule,
      path.join(workspaceRoot, 'packages/server-ai/src/shared/coding-tools/branding.ts'),
      apiConfig.options,
      ts.sys
    ).resolvedModule
    assert.ok(source, 'the API must resolve the shared catalog')
    const program = ts.createProgram([source.resolvedFileName], {
      ...libraryConfig.options,
      outDir: outputRoot,
      noEmit: false
    })
    const emitted = program.emit()
    assert.equal(emitted.emitSkipped, false)
    assert.equal(
      ts.formatDiagnostics(
        [...apiConfig.errors, ...libraryConfig.errors, ...ts.getPreEmitDiagnostics(program), ...emitted.diagnostics],
        formatHost
      ),
      ''
    )

    const renderCatalog = `
      console.log(JSON.stringify(['codex', 'opencode', 'aider', 'claude', 'qwen', 'kimi', 'codebuddy']
        .map(id => getBrandIcon(id))))
    `
    const commonjs = runNode(['-e', `const { getBrandIcon } = require('${catalogModule}'); ${renderCatalog}`], {
      cwd: temporaryRoot
    })
    const esm = runNode(
      ['--input-type=module', '-e', `import { getBrandIcon } from '${catalogModule}'; ${renderCatalog}`],
      {
        cwd: temporaryRoot
      }
    )
    assert.deepEqual(esm, commonjs)
    for (const brand of commonjs) {
      assert.ok(brand.id)
      assert.ok(brand.name)
      assert.match(brand.svg, /^<svg\b/)
    }
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})
