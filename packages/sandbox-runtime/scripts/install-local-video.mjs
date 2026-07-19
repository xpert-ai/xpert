import { execFile } from 'node:child_process'
import { access } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { promisify } from 'node:util'

const requireFromRuntime = createRequire(import.meta.url)
const packageJsonPath = requireFromRuntime.resolve('ffmpeg-ffprobe-static/package.json')
const packageRoot = path.dirname(packageJsonPath)
const ffmpeg = requireFromRuntime('ffmpeg-ffprobe-static')
const ffmpegPath = ffmpeg?.ffmpegPath

if (typeof ffmpegPath !== 'string' || !ffmpegPath) {
  throw new Error('Local Browser Video Runtime does not support FFmpeg on this platform.')
}
await access(ffmpegPath).catch(async () => {
  await promisify(execFile)(process.execPath, [path.join(packageRoot, 'install.js')], {
    cwd: packageRoot,
    maxBuffer: 10 * 1024 * 1024
  })
})
