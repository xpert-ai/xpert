#!/usr/bin/env node
// Installs a dedicated desktop environment; never changes system Python or Codex.
import { spawnSync } from 'node:child_process'
import { mkdir, access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const { values } = parseArgs({ options: { python: { type: 'string', default: 'python3' } } })
const root = join(homedir(), '.local/share/xpert/documents')
const venv = join(root, 'venv')
const python = join(venv, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
function run(file, args) {
  const result = spawnSync(file, args, { stdio: 'inherit' })
  if (result.error || result.status !== 0)
    throw new Error(`${file} failed; ${result.error?.message ?? `exit ${result.status}`}`)
}
await mkdir(root, { recursive: true })
try {
  await access(python)
} catch {
  run(values.python, ['-m', 'venv', venv])
}
run(python, [
  '-m',
  'pip',
  'install',
  '--disable-pip-version-check',
  '-r',
  fileURLToPath(new URL('requirements.txt', import.meta.url))
])
run(python, ['-c', 'import docx, lxml, PIL, pypdfium2; print("Documents Python dependencies ready")'])
console.log(`Python: ${python}`)
console.log(
  'Install LibreOffice Writer separately. Run the Documents Skill doctor through the actual sandbox before use.'
)
