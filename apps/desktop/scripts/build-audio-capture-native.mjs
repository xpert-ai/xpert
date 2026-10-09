import { mkdir, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
if (process.platform === 'darwin') {
  await mkdir(resolve(root, 'resources/audio-capture'), { recursive: true })
  const output = resolve(root, 'resources/audio-capture/audio-capture')
  const slices = ['arm64', 'x86_64'].map((arch) => `${output}-${arch}`)
  try {
    for (const [index, arch] of ['arm64', 'x86_64'].entries()) {
      execFileSync(
        'xcrun',
        [
          'swiftc',
          '-parse-as-library',
          '-O',
          '-target',
          `${arch}-apple-macosx15.0`,
          resolve(root, 'native/audio-capture/AudioCapture.swift'),
          '-o',
          slices[index]
        ],
        { stdio: 'inherit' }
      )
    }
    execFileSync('xcrun', ['lipo', '-create', ...slices, '-output', output], { stdio: 'inherit' })
  } finally {
    await Promise.all(slices.map((file) => rm(file, { force: true })))
  }
}
