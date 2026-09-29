import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
if (process.platform !== 'darwin') throw new Error('This native download fixture currently requires macOS')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
execFileSync(
  require('electron'),
  [fileURLToPath(new URL('../tests/fixtures/update-download.electron.cjs', import.meta.url))],
  { env, timeout: 45_000, stdio: 'inherit' }
)
