// Build contracts from source in the isolated workspace; never reuse local dist files.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { build } from 'esbuild'
const require = createRequire(import.meta.url)
const run = (file, args, cwd = process.cwd()) =>
  execFileSync(process.execPath, [file, ...args], { cwd, stdio: 'inherit' })
run(require.resolve('typescript/bin/tsc'), ['--project', '.deploy/desktop/tsconfig.contracts.json'])
for (const [format, output] of [
  ['cjs', 'index.cjs.js'],
  ['esm', 'index.esm.js']
]) {
  await build({
    entryPoints: ['packages/contracts/src/index.ts'],
    bundle: true,
    platform: 'node',
    format,
    packages: 'external',
    outfile: `packages/contracts/dist/${output}`
  })
}
const manifest = JSON.parse(readFileSync('packages/contracts/package.json', 'utf8'))
writeFileSync(
  'packages/contracts/dist/package.json',
  JSON.stringify({ ...manifest, types: './index.d.ts' }, null, 2) + '\n'
)
run('apps/desktop/scripts/build-audio-capture-native.mjs', [])
const testDirectories = ['packages/desktop-protocol/test', 'apps/desktop/tests', 'apps/desktop/tests/audio-capture']
if (process.platform === 'darwin') testDirectories.push('apps/desktop/native/audio-capture')
const tests = testDirectories.flatMap((dir) =>
  readdirSync(dir)
    .filter((file) => file.endsWith('.test.cjs') && !(process.platform === 'win32' && file === 'shell-engine.test.cjs'))
    .map((file) => `${dir}/${file}`)
)
// The Bash engine suite runs on macOS/Linux; Windows still runs all portable suites.
run('--test', tests)
run(require.resolve('typescript/bin/tsc'), ['--noEmit', '--project', 'apps/desktop/tsconfig.json'])
run(
  join(dirname(require.resolve('vite/package.json')), 'bin/vite.js'),
  ['build'],
  new URL('../../apps/desktop', import.meta.url)
)
