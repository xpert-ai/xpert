#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { mkdir, access, cp } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
const { values } = parseArgs({ options: { python: { type: 'string', default: 'python3' } } })
if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Use Node.js 22 or newer')
const source = fileURLToPath(new URL('./', import.meta.url))
const root = join(homedir(), '.local/share/xpert/spreadsheets/runtime')
const python = join(root, 'venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
function run(command, args, cwd, env) {
  const result = spawnSync(command, args, { cwd, env: env ?? process.env, stdio: 'inherit' })
  if (result.error || result.status !== 0)
    throw new Error(`${command} failed: ${result.error?.message ?? result.status}`)
}
await mkdir(root, { recursive: true })
try {
  await access(python)
} catch {
  run(values.python, ['-m', 'venv', join(root, 'venv')])
}
run(python, ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', join(source, 'requirements.txt')])
for (const name of ['package.json', 'package-lock.json'])
  await cp(join(source, name), join(root, name), { recursive: true })
run(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'],
  root
)
run(process.execPath, [join(root, 'node_modules/@xpert-ai/artifact-tool/src/cli.mjs'), 'doctor'], root, {
  ...process.env,
  XPERT_SPREADSHEETS_PYTHON: python
})
console.log(`Spreadsheets runtime ready: ${root}`)
