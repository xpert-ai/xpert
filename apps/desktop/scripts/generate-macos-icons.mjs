import { execFile } from 'node:child_process'
import { copyFile, mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

if (process.platform !== 'darwin') throw new Error('Generating macOS icons requires Apple sips and iconutil.')

const run = promisify(execFile)
const resources = fileURLToPath(new URL('../resources/', import.meta.url))
const master = path.join(resources, 'icon-macos.png')
const iconset = path.join(resources, 'Xpert.iconset')
const source = await readFile(master)
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
if (
  !source.subarray(0, 8).equals(signature) ||
  source.readUInt32BE(16) !== 1024 ||
  source.readUInt32BE(20) !== 1024 ||
  source[25] !== 6
) {
  throw new Error('icon-macos.png must be a 1024 x 1024 RGBA PNG with transparent outer margins.')
}

await mkdir(iconset, { recursive: true })
for (const points of [16, 32, 128, 256, 512]) {
  for (const scale of [1, 2]) {
    const pixels = points * scale
    const output = path.join(iconset, `icon_${points}x${points}${scale === 2 ? '@2x' : ''}.png`)
    if (pixels === 1024) await copyFile(master, output)
    else await run('/usr/bin/sips', ['-z', String(pixels), String(pixels), master, '--out', output])
  }
}
await run('/usr/bin/iconutil', ['-c', 'icns', '-o', path.join(resources, 'Xpert.icns'), iconset])
console.log('Generated Xpert.iconset (10 standard/Retina PNGs) and Xpert.icns.')
