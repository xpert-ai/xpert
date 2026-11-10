// Build a local validation kit beside an unpacked Windows app; never install or publish it.
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const app = path.resolve(process.argv[2] || '')
if (!process.argv[2] || !fs.statSync(path.join(app, 'Bosi.exe')).isFile())
  throw new Error('Pass an unpacked Windows Bosi app directory')
const destination = path.join(app, 'shell-validation')
fs.mkdirSync(destination) // Do not overwrite an existing kit.
const files = [
  'apps/desktop/electron/shell/engine.cjs',
  'apps/desktop/electron/shell/platform.cjs',
  'apps/desktop/electron/shell/windows-execution.cjs',
  'apps/desktop/electron/shell/windows-supervisor.cs',
  'apps/desktop/electron/shell/controller.cjs',
  'apps/desktop/electron/shell/delivery.cjs',
  'apps/desktop/electron/connection/urls.mjs',
  'apps/desktop/tests/windows-shell-engine.test.cjs',
  'apps/desktop/tests/shell-platform.test.cjs',
  'apps/desktop/tests/shell-controller.test.cjs',
  'apps/desktop/tests/shell-delivery.test.cjs',
  'apps/desktop/tests/fixtures/windows-shell-worker.cjs',
  'packages/desktop-protocol/test/protocol.test.cjs'
]
const manifest = []
const copy = (source, target) => {
  const content = fs.readFileSync(path.join(root, source))
  const filename = path.join(destination, target)
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(filename, content)
  manifest.push({ source, target, sha256: createHash('sha256').update(content).digest('hex') })
}
for (const file of files) copy(file, file)
for (const file of ['index.js', 'audio-capture.js', 'process-supervisor.js'])
  copy(`packages/desktop-protocol/${file}`, `node_modules/@xpert-ai/desktop-protocol/${file}`)
// The protocol's own tests resolve require('..'); retain the same runtime files there too.
for (const file of ['index.js', 'audio-capture.js'])
  copy(`packages/desktop-protocol/${file}`, `packages/desktop-protocol/${file}`)
fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
fs.writeFileSync(
  path.join(destination, 'run.cjs'),
  `
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
if (process.platform !== 'win32') throw new Error('Run this kit on native Windows')
const tests = ${JSON.stringify(files.filter((name) => name.endsWith('.test.cjs')))}
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...tests], {
  cwd: __dirname, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1',
    BOSI_SHELL_TEST_APP_ROOT: path.join(__dirname, '../resources/app.asar/electron') }
})
const output = (result.stdout || '') + (result.stderr || '')
fs.writeFileSync(path.join(__dirname, 'results.tap'), output)
process.stdout.write(output)
if (result.error) console.error(result.error)
process.exitCode = result.status === 0 ? 0 : 1
`
)
fs.writeFileSync(
  path.join(app, 'Run Shell Tests.cmd'),
  [
    '@echo off',
    'setlocal',
    'cd /d "%~dp0"',
    'set ELECTRON_RUN_AS_NODE=1',
    '"Bosi.exe" "shell-validation\\run.cjs"',
    'set result=%ERRORLEVEL%',
    'echo.',
    'echo Results: shell-validation\\results.tap',
    'pause',
    'exit /b %result%',
    ''
  ].join('\r\n')
)
console.log(`Created Windows shell validation kit: ${destination}`)
