// The platform owns one immutable environment per Python version and dependency lock.
// Health is read-only; installing is an explicit development command, never a Job side effect.
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const execute = promisify(execFile)
const family = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../images/document-python')
const manifestPath = path.join(family, 'runtime/manifest.json')
const requirementsPath = path.join(family, 'requirements.txt')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const requirements = await readFile(requirementsPath)
if (createHash('sha256').update(requirements).digest('hex') !== manifest.requirementsSha256) {
  throw new Error('Document Python Runtime dependency lock does not match its manifest.')
}
const cache = process.env.XDG_CACHE_HOME?.trim() || path.join(homedir(), '.cache')
const root = path.join(
  cache,
  'xpert',
  'sandbox-runtime',
  'document-python',
  manifest.pythonVersion,
  manifest.requirementsSha256
)
const python = path.join(root, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python3')
const verify = () =>
  execute(python, ['-I', path.join(family, 'runtime/verify-python.py'), manifestPath, requirementsPath], {
    timeout: 60000
  })
try {
  await verify()
} catch (error) {
  if (process.argv.includes('--verify-only'))
    throw new Error(
      'Document Python Runtime is unavailable. Run corepack pnpm --filter @xpert-ai/sandbox-runtime install:document-python.',
      { cause: error }
    )
  await mkdir(path.dirname(root), { recursive: true })
  // uv selects/downloads the pinned interpreter; callers never configure a plugin-specific Python path.
  await execute('uv', ['venv', '--python', manifest.pythonVersion, root], { timeout: 300000, maxBuffer: 1024 * 1024 })
  await execute('uv', ['pip', 'sync', '--native-tls', '--require-hashes', '--python', python, requirementsPath], {
    timeout: 300000,
    maxBuffer: 1024 * 1024
  })
  await verify()
}
process.stdout.write(`${JSON.stringify({ profile: manifest.profileName, python, verified: true })}\n`)
