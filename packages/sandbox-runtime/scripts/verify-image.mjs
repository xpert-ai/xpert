import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const image = argument('--image')
const family = argument('--family')
const platform = optionalArgument('--platform') ?? 'linux/amd64'
if (!/^linux\/(amd64|arm64)$/.test(platform)) throw new Error(`Unsupported smoke platform: ${platform}`)
const catalog = JSON.parse(await readFile(new URL('../images/catalog.json', import.meta.url), 'utf8'))
const catalogEntry = catalog.images.find((entry) => entry.family === family)
if (!catalogEntry) throw new Error(`Unsupported image family: ${family}`)
const definition = JSON.parse(await readFile(new URL(`../${catalogEntry.definition}`, import.meta.url), 'utf8'))

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
if (value.imageFamily !== family || value.profileName !== definition.profileName)
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
if (family === 'browser-video') {
  const mediaTools = await docker([
    ...sandboxFlags,
    '--entrypoint',
    'sh',
    image,
    '-c',
    'test "$(node --version)" = "v22.17.1" && ffmpeg -version | grep -q "ffmpeg version 6.1"'
  ])
  void mediaTools
}
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
