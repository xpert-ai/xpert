// Cross-package checks run before isolation; Desktop must not depend on SDK sources or packages.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, dirname } = require('node:path')
const { AGENT_PROCESS_SUPERVISOR } = require('../../packages/desktop-protocol/process-supervisor')

const root = join(__dirname, '../..')
const sdkPath = 'packages/plugin-sdk/src/lib/agent/runtime/process-supervisor.ts'

test('SDK supervisor loads without package imports and matches the device supervisor', async () => {
  const source = readFileSync(join(root, sdkPath), 'utf8')
  // A data URL has no package resolution context: the SDK payload must be self-contained.
  const sdk = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
  assert.equal(sdk.AGENT_PROCESS_SUPERVISOR, AGENT_PROCESS_SUPERVISOR)
})

test('the repository parity gate rejects supervisor drift without installing the SDK', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'desktop-supervisor-parity-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const gate = '.deploy/desktop/supervisor-parity.test.cjs'
  for (const file of [gate, sdkPath, 'packages/desktop-protocol/process-supervisor.js']) {
    const target = join(directory, file)
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(join(root, file), target)
  }
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  const run = () =>
    spawnSync(process.execPath, ['--test', '--test-name-pattern=SDK supervisor', gate], {
      cwd: directory,
      encoding: 'utf8',
      env
    })
  const matching = run()
  assert.equal(matching.status, 0, matching.stdout + matching.stderr)
  assert.match(matching.stdout, /SDK supervisor loads/)
  const source = join(directory, sdkPath)
  writeFileSync(
    source,
    readFileSync(source, 'utf8').replace(
      'export const AGENT_PROCESS_SUPERVISOR =',
      'export const AGENT_PROCESS_SUPERVISOR = "drift" +'
    )
  )
  const mismatched = run()
  assert.notEqual(mismatched.status, 0)
  assert.match(mismatched.stdout + mismatched.stderr, /ERR_ASSERTION/)
})
