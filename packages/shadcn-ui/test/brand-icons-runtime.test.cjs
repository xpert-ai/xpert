const { test } = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const { mkdtempSync, mkdirSync, readFileSync, realpathSync, writeFileSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')
const ts = require('typescript')
const { computeCompilerOptionsPaths } = require('@nx/js/src/utils/buildable-libs-utils')
const { CopyAssetsHandler } = require('@nx/js/src/utils/assets/copy-assets-handler')

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

test('the compiled brand-icons entry supports Node loaders and Nx TypeScript consumers', async () => {
  const temporaryRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'xpert-brand-icons-')))
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

    // Exercise Nx's real asset copying and secondary-entry path remapping, as used by server-ai:build.
    const project = JSON.parse(readFileSync(path.join(packageRoot, 'project.json'), 'utf8'))
    await new CopyAssetsHandler({
      rootDir: workspaceRoot,
      projectDir: packageRoot,
      outputDir: outputRoot,
      assets: project.targets.build.options.assets
    }).processAllAssetsOnce()
    const consumerConfigPath = path.join(workspaceRoot, 'packages/server-ai/tsconfig.lib.json')
    const consumerConfig = ts.getParsedCommandLineOfConfigFile(consumerConfigPath, {}, configHost)
    const consumerOptions = {
      ...consumerConfig.options,
      rootDir: undefined,
      noEmit: true,
      paths: computeCompilerOptionsPaths(consumerConfigPath, [
        {
          name: manifest.name,
          outputs: [outputRoot],
          node: {
            name: project.name,
            type: 'lib',
            data: { root: path.relative(workspaceRoot, packageRoot) }
          }
        }
      ])
    }
    const consumerFile = path.join(workspaceRoot, 'packages/server-ai/src/shared/coding-tools/branding.ts')
    const declaration = ts.resolveModuleName(catalogModule, consumerFile, consumerOptions, ts.sys).resolvedModule
    assert.equal(declaration?.resolvedFileName, path.join(outputRoot, 'src/brand-icons/index.d.cts'))
    const typeCheckFile = path.join(temporaryRoot, 'brand-icons-types.ts')
    writeFileSync(
      typeCheckFile,
      `
      import { type BrandIconId } from '${catalogModule}'
      const valid: BrandIconId = 'codex'
      // @ts-expect-error Unknown brands must remain type errors, not silently become any.
      const invalid: BrandIconId = '__unknown_brand__'
    `
    )
    const consumer = ts.createProgram([consumerFile, typeCheckFile], consumerOptions)
    assert.equal(
      ts.formatDiagnostics([...consumerConfig.errors, ...ts.getPreEmitDiagnostics(consumer)], formatHost),
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
