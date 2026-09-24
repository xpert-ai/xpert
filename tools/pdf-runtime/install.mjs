#!/usr/bin/env node
// PDF dependencies stay separate from system Python and the Documents venv.
import { spawnSync } from 'node:child_process'
import { mkdir, access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const { values } = parseArgs({ options: { python: { type: 'string', default: 'python3' } } })
const root = join(homedir(), '.local/share/xpert/pdf')
const python = join(root, 'venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
const file = (name) => fileURLToPath(new URL(name, import.meta.url))
function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.error || result.status !== 0)
    throw new Error(`${command} failed; ${result.error?.message ?? result.status}`)
}
await mkdir(root, { recursive: true })
try {
  await access(python)
} catch {
  run(values.python, ['-m', 'venv', join(root, 'venv')])
}
run(python, ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', file('requirements.txt')])
run(python, [file('install-font.py'), '--destination', join(root, 'fonts')])
run(python, ['-c', 'import reportlab, pypdf, pdfplumber, pypdfium2; print("PDF Python dependencies ready")'])
console.log(`Python: ${python}`)
console.log('Run the PDF Skill doctor through the actual sandbox before use.')
