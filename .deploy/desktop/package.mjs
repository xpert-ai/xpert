// Never let electron-builder publish implicitly. A single later job assembles all
// platforms into a draft release only after packaging and runtime checks succeed.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { platforms } from './release-plan.mjs'
const require = createRequire(import.meta.url)
export function packaging(plan, target, env = process.env) {
  assert.ok(plan.build && /^[a-f0-9]{40}$/.test(plan.sha), 'Changesets build plan required')
  assert.match(plan.version, /^\d+\.\d+\.\d+(?:-candidate\.(?:main|develop)\.[a-f0-9]{12})?$/)
  assert.ok(
    platforms.some(
      (entry) => entry.id === target.id && entry.platform === target.platform && entry.arch === target.arch
    )
  )
  const config = {
    extraMetadata: { version: plan.version },
    artifactName: 'Bosi-${version}-${os}-${arch}.${ext}',
    publish: null
  }
  let signing = 'unsigned'
  if (target.platform === 'mac') {
    const certificate = Boolean(env.CSC_LINK)
    const apple = [env.APPLE_ID, env.APPLE_APP_SPECIFIC_PASSWORD, env.APPLE_TEAM_ID]
    if (apple.some(Boolean) && (!certificate || !apple.every(Boolean)))
      throw new Error('macOS notarization requires a signing certificate and all three Apple credentials')
    const adhocEntitlements = resolve('.deploy/desktop/entitlements.adhoc.mac.plist')
    config.mac = {
      target: ['dmg', 'zip'],
      notarize: certificate && apple.every(Boolean),
      hardenedRuntime: true,
      ...(certificate ? {} : { identity: '-', entitlements: adhocEntitlements, entitlementsInherit: adhocEntitlements })
    }
    config.forceCodeSigning = certificate
    signing = certificate ? (config.mac.notarize ? 'signed-notarized' : 'signed') : 'ad-hoc'
  } else if (target.platform === 'win') {
    config.win = { target: ['nsis', 'zip'] }
    config.forceCodeSigning = Boolean(env.CSC_LINK)
    signing = env.CSC_LINK ? 'signed' : 'unsigned'
  } else config.linux = { target: ['AppImage', 'tar.gz'], executableName: 'bosi' }
  return { config, signing }
}
export function appPaths(target, directory) {
  if (target.platform === 'mac') {
    const app = join(directory, target.arch === 'arm64' ? 'mac-arm64' : 'mac', 'Bosi.app', 'Contents')
    return { executable: join(app, 'MacOS/Bosi'), archive: join(app, 'Resources/app.asar') }
  }
  const folder = `${target.platform === 'win' ? 'win' : 'linux'}${target.arch === 'x64' ? '' : '-arm64'}-unpacked`
  return {
    executable: join(directory, folder, target.platform === 'win' ? 'Bosi.exe' : 'bosi'),
    archive: join(directory, folder, 'resources/app.asar')
  }
}
export async function packageDesktop(plan, target) {
  assert.equal(process.arch, target.arch, 'Package on a native-architecture runner')
  assert.equal(process.platform, { mac: 'darwin', win: 'win32', linux: 'linux' }[target.platform])
  const appDirectory = resolve('apps/desktop')
  const { config, signing } = packaging(plan, target)
  const builder = require('electron-builder')
  const original = JSON.parse(readFileSync(join(appDirectory, 'package.json'), 'utf8'))
  const platform = { mac: builder.Platform.MAC, win: builder.Platform.WINDOWS, linux: builder.Platform.LINUX }[
    target.platform
  ]
  await builder.build({
    projectDir: appDirectory,
    targets: platform.createTarget(undefined, builder.Arch[target.arch]),
    config: {
      ...original.build,
      ...config,
      [target.platform]: { ...original.build[target.platform], ...config[target.platform] }
    },
    publish: 'never'
  })
  const paths = appPaths(target, join(appDirectory, 'release'))
  execFileSync(paths.executable, [resolve('.deploy/desktop/smoke-packaged.cjs'), paths.archive, plan.version], {
    stdio: 'inherit',
    timeout: 60_000,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  })
  const output = resolve('installers')
  mkdirSync(output, { recursive: true })
  const artifacts = []
  const extensions = { mac: ['.dmg', '.zip'], win: ['.exe', '.zip'], linux: ['.AppImage', '.tar.gz'] }[target.platform]
  for (const extension of extensions) {
    const filename = `Bosi-${plan.version}-${{ mac: 'mac', win: 'win', linux: 'linux' }[target.platform]}-${target.arch}${extension}`
    const source = join(appDirectory, 'release', filename)
    const sha256 = createHash('sha256').update(readFileSync(source)).digest('hex')
    copyFileSync(source, join(output, filename))
    artifacts.push({ file: filename, sha256 })
  }
  writeFileSync(
    join(output, `${target.id}.json`),
    JSON.stringify({ version: plan.version, sha: plan.sha, target: target.id, signing, artifacts }, null, 2) + '\n'
  )
  console.log(`Verified ${target.id}: ${artifacts.length} installers (${signing})`)
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = platforms.find((entry) => entry.id === process.env.DESKTOP_TARGET)
  assert.ok(target, 'Select a Desktop matrix target')
  await packageDesktop(JSON.parse(process.env.DESKTOP_RELEASE_PLAN ?? '{}'), target)
}
