import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const builderRequire = createRequire(require.resolve('electron-builder/package.json'))
const collectorRequire = createRequire(builderRequire.resolve('app-builder-lib/package.json'))
const builderUtil = collectorRequire('builder-util')
const { determinePackageManagerEnv } = builderRequire('app-builder-lib/out/node-module-collector')
const { prepare } = require('../dependencies.cjs')

for (const scenario of ['native path', 'missing pwd', 'MSYS path']) {
  test(`plain Node packaging discovers the pnpm workspace with ${scenario}`, async (t) => {
    const workspace = mkdtempSync(join(tmpdir(), 'bosi-pm-contract-'))
    t.after(() => rmSync(workspace, { recursive: true, force: true }))
    prepare(workspace)
    const environment = { ...process.env }
    for (const key of ['npm_config_user_agent', 'npm_execpath', 'npm_package_json', 'INIT_CWD']) delete process.env[key]
    t.after(() => {
      for (const key of ['npm_config_user_agent', 'npm_execpath', 'npm_package_json', 'INIT_CWD']) {
        if (environment[key] === undefined) delete process.env[key]
        else process.env[key] = environment[key]
      }
    })
    if (scenario !== 'native path') {
      const spawn = builderUtil.spawn
      t.mock.method(builderUtil, 'spawn', (command, args, ...rest) => {
        if (command === 'pnpm' && args.join(' ') === '--workspace-root exec pwd') {
          if (scenario === 'missing pwd') return Promise.reject(new Error('pwd is unavailable'))
          return Promise.resolve('/c/Users/runneradmin/AppData/Local/Temp/bosi-pm-contract')
        }
        return spawn(command, args, ...rest)
      })
    }
    const appDir = join(workspace, 'apps/desktop')
    const result = await determinePackageManagerEnv({ projectDir: appDir, appDir }).value
    assert.equal(result.pm, 'pnpm')
    assert.equal(realpathSync(await result.workspaceRoot), realpathSync(workspace))
  })
}
