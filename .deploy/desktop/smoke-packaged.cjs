// Run using the packaged Electron's Node mode on every native target.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const { execFileSync } = require('node:child_process')
const [archive, version] = process.argv.slice(2)
const manifestPath = path.join(archive, 'package.json')
const packaged = createRequire(manifestPath)
assert.equal(packaged('./package.json').version, version)
assert.equal(typeof packaged('@xpert-ai/desktop-protocol').parseCommand, 'function')
assert.equal(typeof packaged('@xpert-ai/desktop-protocol').parseAudioCapturePayload, 'function')
assert.equal(typeof packaged('./electron/audio-capture/controller.cjs').AudioCaptureController, 'function')
if (process.platform === 'darwin') {
  const helper = path.join(`${archive}.unpacked`, 'resources/audio-capture/audio-capture')
  fs.accessSync(helper, fs.constants.X_OK)
  const capability = JSON.parse(execFileSync(helper, ['--check'], { encoding: 'utf8', timeout: 10000 }))
  assert.equal(capability.type, 'capability')
  assert.equal(typeof capability.supported, 'boolean')
}
assert.equal(typeof packaged('socket.io-client').io, 'function')
assert.equal(typeof packaged('electron-updater').AppUpdater, 'function')
assert.equal(typeof packaged('./electron/updates/controller.cjs').DesktopUpdater, 'function')
if (packaged('./package.json').desktopUpdates) {
  const updateConfig = fs.readFileSync(path.join(path.dirname(archive), 'app-update.yml'), 'utf8')
  assert.match(updateConfig, /provider: generic/)
  assert.ok(updateConfig.includes(`channel: desktop-${process.arch}`))
}
assert.equal(typeof packaged('./electron/service.cjs').DesktopService, 'function')
const { packagedConnection } = packaged('./electron/connection/defaults.cjs')
const { DesktopService } = packaged('./electron/service.cjs')
const connection = packagedConnection()
const service = new DesktopService({ defaultConfig: connection })
for (const key of ['apiUrl', 'webUrl', 'frameUrl']) assert.equal(service.config[key], connection[key])
assert.equal(typeof packaged('./electron/shell/controller.cjs').DesktopShellController, 'function')
assert.match(fs.readFileSync(path.join(archive, 'dist/index.html'), 'utf8'), /<div id="root">/)
console.log(
  `PASS: packaged Bosi ${version}, Electron ${process.versions.electron}, ${process.platform}/${process.arch}`
)
