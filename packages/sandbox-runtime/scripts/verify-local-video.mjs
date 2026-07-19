import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { promisify } from 'node:util'

const requireFromRuntime = createRequire(import.meta.url)
const execFileAsync = promisify(execFile)

if (process.versions.node !== '22.17.1') {
  throw new Error(`Local Browser Video Runtime requires Node 22.17.1; received ${process.versions.node}.`)
}

const ffmpegPath = requireFromRuntime('ffmpeg-ffprobe-static')?.ffmpegPath
if (typeof ffmpegPath !== 'string' || !ffmpegPath) {
  throw new Error('Local Browser Video Runtime could not resolve ffmpeg-ffprobe-static.')
}
const { stdout } = await execFileAsync(ffmpegPath, ['-version'], { maxBuffer: 1024 * 1024 })
if (!/^ffmpeg version n?6\.1(?:\.|\s)/m.test(stdout)) {
  throw new Error('Local Browser Video Runtime requires FFmpeg 6.1.x.')
}

process.stdout.write(`${JSON.stringify({ nodeVersion: process.versions.node, ffmpeg: stdout.split(/\r?\n/)[0] })}\n`)
