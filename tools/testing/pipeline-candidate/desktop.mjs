// Package a local ad-hoc candidate without publishing, installing or launching a user session.
import path from 'node:path'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { packaging, appPaths } from '../../../.deploy/desktop/package.mjs'
const require = createRequire(import.meta.url)
const builder = require('electron-builder')
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const version = `0.3.7-candidate.develop.${sha.slice(0, 12)}`
const target = { id: 'mac-arm64', platform: 'mac', arch: 'arm64' }
const directory = path.resolve(process.argv[2], 'desktop')
const appDirectory = path.resolve(process.argv[2], 'desktop-stage/apps/desktop')
const { config } = packaging({ build: true, sha, version, stable: false }, target, {}, appDirectory)
config.directories = { ...config.directories, output: directory }
// Explicit local identity prevents ambient release credentials being selected.
for (const key of ['CSC_LINK', 'CSC_KEY_PASSWORD', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID'])
  delete process.env[key]
process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false'
await builder.build({
  projectDir: appDirectory,
  targets: builder.Platform.MAC.createTarget(['dir'], builder.Arch.arm64),
  config,
  publish: 'never'
})
const paths = appPaths(target, directory)
execFileSync(paths.executable, [path.resolve('.deploy/desktop/smoke-packaged.cjs'), paths.archive, version], {
  stdio: 'inherit',
  timeout: 60000,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
})
