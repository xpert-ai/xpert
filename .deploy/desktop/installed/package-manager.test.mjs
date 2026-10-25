import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { determinePackageManagerEnv } = require('app-builder-lib/out/node-module-collector')
const { prepare } = require('../dependencies.cjs')

test('plain Node packaging discovers the pnpm workspace from the Desktop app manifest', async (t) => {
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
  const appDir = join(workspace, 'apps/desktop')
  const result = await determinePackageManagerEnv({ projectDir: appDir, appDir }).value
  assert.equal(result.pm, 'pnpm')
  assert.equal(realpathSync(await result.workspaceRoot), realpathSync(workspace))
})
