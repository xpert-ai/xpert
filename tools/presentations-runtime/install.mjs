#!/usr/bin/env node
// Keep presentation dependencies out of system Python and the plugin archive.
import { spawnSync } from 'node:child_process'
import { mkdir, access, copyFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const { values } = parseArgs({ options: { python: { type: 'string', default: 'python3' } } })
if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Use Node.js 22 or newer')
const root = join(homedir(), '.local/share/xpert/presentations')
const python = join(root, 'venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
const file = (name) => fileURLToPath(new URL(name, import.meta.url))
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' })
  if (result.error || result.status !== 0)
    throw new Error(`${command} failed: ${result.error?.message ?? result.status}`)
}
await mkdir(root, { recursive: true })
try {
  await access(python)
} catch {
  run(values.python, ['-m', 'venv', join(root, 'venv')])
}
run(python, ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', file('requirements.txt')])
for (const name of ['package.json', 'package-lock.json']) await copyFile(file(name), join(root, name))
run(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'],
  root
)
run(python, ['-c', 'import pptx, lxml, PIL, pypdfium2; print("Presentations Python dependencies ready")'])
console.log(`Runtime: ${root}`)
console.log('Install LibreOffice (Impress) and Noto Sans CJK SC, then run the Skill doctor in the actual sandbox.')
