import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
if (process.platform === 'darwin') {
  const directory = fileURLToPath(new URL('../resources/computer-use/', import.meta.url))
  const source = fileURLToPath(new URL('../native/computer-use/WindowControl.swift', import.meta.url))
  mkdirSync(directory, { recursive: true })
  const binary = directory + 'window-control'
  const slices = ['arm64', 'x86_64'].map((arch) => binary + '-' + arch)
  try {
    for (const [i, arch] of ['arm64', 'x86_64'].entries()) {
      execFileSync(
        'xcrun',
        ['swiftc', '-parse-as-library', '-O', '-target', arch + '-apple-macosx14.0', source, '-o', slices[i]],
        { stdio: 'inherit' }
      )
    }
    execFileSync('xcrun', ['lipo', '-create', ...slices, '-output', binary], { stdio: 'inherit' })
  } finally {
    for (const file of slices) rmSync(file, { force: true })
  }
}
