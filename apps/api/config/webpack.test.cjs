const { test } = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const { mkdtempSync, readFileSync, realpathSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')

const workspaceRoot = path.resolve(__dirname, '../../..')

function runNode(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: workspaceRoot,
    encoding: 'utf8',
    timeout: 30_000
  })
  assert.ifError(result.error)
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return JSON.parse(result.stdout)
}

test('the API webpack configuration bundles the CommonJS brand catalog', async () => {
  const webpack = require('webpack')
  const configureApi = require(path.join(workspaceRoot, 'apps/api/config/webpack.config.js'))
  const project = JSON.parse(readFileSync(path.join(workspaceRoot, 'apps/api/project.json'), 'utf8'))
  const temporaryRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'xpert-brand-icons-webpack-')))
  try {
    const config = await configureApi(
      { output: { path: temporaryRoot } },
      {
        options: {
          ...project.targets.build.options,
          projectRoot: 'apps/api',
          sourceRoot: project.sourceRoot,
          tsConfig: path.join(workspaceRoot, project.targets.build.options.tsConfig),
          main: 'packages/server-ai/src/shared/coding-tools/branding.ts',
          outputPath: temporaryRoot,
          assets: [],
          buildLibsFromSource: true,
          generatePackageJson: false,
          typeCheckOptions: false,
          externalDependencies: []
        },
        context: { root: workspaceRoot, projectName: project.name, targetName: 'build' }
      }
    )
    const compiler = webpack(config)
    await new Promise((resolve, reject) => {
      compiler.run((error, stats) => {
        compiler.close((closeError) => {
          if (error || closeError) return reject(error || closeError)
          if (stats.hasErrors()) return reject(new Error(stats.toString({ all: false, errors: true })))
          resolve()
        })
      })
    })
    const brand = runNode([
      '-e',
      `
      const { codingToolBrand } = require(${JSON.stringify(path.join(temporaryRoot, 'main.js'))})
      console.log(JSON.stringify(codingToolBrand({ provider: 'codex-computer' })))
    `
    ])
    assert.equal(brand.id, 'codex')
    assert.equal(brand.name, 'Codex')
    assert.match(brand.svg, /^<svg\b/)
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})
