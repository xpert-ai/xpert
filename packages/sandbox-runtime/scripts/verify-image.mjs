import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const image = argument('--image')
const family = argument('--family')
const platform = optionalArgument('--platform') ?? 'linux/amd64'
if (family !== 'browser') throw new Error(`Unsupported image family: ${family}`)
if (!/^linux\/(amd64|arm64)$/.test(platform)) throw new Error(`Unsupported smoke platform: ${platform}`)

const sandboxFlags = [
  'run',
  '--rm',
  `--platform=${platform}`,
  '--network=none',
  '--read-only',
  '--cap-drop=ALL',
  '--security-opt=no-new-privileges',
  '--tmpfs',
  '/tmp:rw,noexec,nosuid,size=256m,mode=1777',
  '--tmpfs',
  '/workspace:rw,noexec,nosuid,size=512m,mode=1777'
]
const common = [...sandboxFlags, image]
const manifest = await docker([...common, '--manifest'])
const value = JSON.parse(manifest.trim())
if (value.imageFamily !== family || value.profileName !== 'browser/playwright-1.61/v1')
  throw new Error('Runtime manifest does not match image family.')
const identity = await docker([
  ...sandboxFlags,
  '--entrypoint',
  'sh',
  image,
  '-c',
  'test "$(id -u)" != 0 && test -w /workspace && test ! -w /opt/xpert/sandbox-runtime'
])
void identity
await docker([...common, '--browser-smoke'])
process.stdout.write(`verified ${image}\n`)

async function docker(args) {
  const result = await execFileAsync('docker', args, { maxBuffer: 10 * 1024 * 1024 })
  return result.stdout
}
function argument(name) {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : ''
  if (!value) throw new Error(`${name} is required.`)
  return value
}
function optionalArgument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}
