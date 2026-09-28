// Run using the packaged Electron's Node mode on every native target.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const [archive, version] = process.argv.slice(2)
const manifestPath = path.join(archive, 'package.json')
const packaged = createRequire(manifestPath)
assert.equal(packaged('./package.json').version, version)
assert.equal(typeof packaged('@xpert-ai/desktop-protocol').parseCommand, 'function')
assert.equal(typeof packaged('socket.io-client').io, 'function')
assert.equal(typeof packaged('./electron/service.cjs').DesktopService, 'function')
assert.equal(typeof packaged('./electron/shell/controller.cjs').DesktopShellController, 'function')
assert.match(fs.readFileSync(path.join(archive, 'dist/index.html'), 'utf8'), /<div id="root">/)
console.log(
  `PASS: packaged Bosi ${version}, Electron ${process.versions.electron}, ${process.platform}/${process.arch}`
)
