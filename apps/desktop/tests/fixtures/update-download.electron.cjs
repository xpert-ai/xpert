// Exercise the real macOS updater's HTTP download/cache/checksum path in a temporary
// profile. No native installation is attempted; the install call is recorded only.
const assert = require('node:assert/strict')
const { app } = require('electron')
const { createServer } = require('node:http')
const { createHash } = require('node:crypto')
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { MacUpdater, NoOpLogger } = require('electron-updater')
const { ElectronAppAdapter } = require('electron-updater/out/ElectronAppAdapter')
const { ElectronHttpExecutor } = require('electron-updater/out/electronHttpExecutor')
const { DesktopUpdater } = require('../../electron/updates/controller.cjs')
const { metadataName } = require('../../electron/updates/config.cjs')
const directory = mkdtempSync(join(tmpdir(), 'bosi-update-download-'))
app.setPath('userData', directory)
app.setName('Bosi update test')
let server, updater, controller
app
  .whenReady()
  .then(async () => {
    const bytes = Buffer.alloc(2 * 1024 * 1024, 'fixture')
    let corrupt = true,
      requests = 0,
      installed = false,
      drained = false
    const filename = `Bosi-999.0.0-mac-${process.arch}.zip`
    const sha512 = createHash('sha512').update(bytes).digest('base64')
    server = createServer((request, response) => {
      if (request.url.startsWith('/' + metadataName('darwin', process.arch))) {
        response.setHeader('Content-Type', 'application/yaml')
        response.end(
          JSON.stringify({
            version: '999.0.0',
            files: [{ url: filename, sha512, size: bytes.length }],
            path: filename,
            sha512
          })
        )
        return
      }
      if (request.url.startsWith('/' + filename)) {
        requests++
        response.setHeader('Content-Length', bytes.length)
        const body = corrupt ? Buffer.alloc(bytes.length, 'corrupt') : bytes
        let offset = 0
        const timer = setInterval(() => {
          response.write(body.subarray(offset, offset + 65536))
          offset += 65536
          if (offset >= body.length) {
            clearInterval(timer)
            response.end()
          }
        }, 40)
        response.on('close', () => clearInterval(timer))
        return
      }
      response.writeHead(404).end()
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const feed = {
      provider: 'generic',
      url: `http://127.0.0.1:${server.address().port}/`,
      channel: `desktop-${process.arch}`
    }
    const configPath = join(directory, 'app-update.yml')
    writeFileSync(configPath, JSON.stringify({ ...feed, updaterCacheDirName: 'update-cache' }))
    class TestAdapter extends ElectronAppAdapter {
      get version() {
        return '0.1.0'
      }
      get isPackaged() {
        return true
      }
      get baseCachePath() {
        return directory
      }
      get appUpdateConfigPath() {
        return configPath
      }
    }
    updater = new MacUpdater(null, new TestAdapter(app))
    updater.httpExecutor = new ElectronHttpExecutor()
    updater.logger = new NoOpLogger()
    updater.quitAndInstall = () => {
      assert.equal(drained, true)
      installed = true
    }
    controller = new DesktopUpdater({
      updater,
      enabled: true,
      currentVersion: '0.1.0',
      resolveFeed: async () => feed,
      beforeInstall: async () => {
        drained = true
      }
    })
    const progress = []
    controller.on('state', (state) => {
      if (state.status === 'downloading') progress.push(state.percent)
    })
    await controller.check()
    assert.equal(controller.snapshot().status, 'available')
    assert.equal(requests, 0, 'checking must not download')
    await controller.download()
    assert.equal(controller.snapshot().status, 'error', 'checksum mismatch must reject the download')
    assert.equal(controller.snapshot().operation, 'download')
    await controller.install()
    assert.equal(installed, false)
    corrupt = false
    await controller.download()
    assert.equal(controller.snapshot().status, 'downloaded')
    assert.ok(
      progress.some((percent) => percent > 0 && percent < 100),
      'real network download must produce intermediate progress'
    )
    assert.equal(installed, false, 'completion must wait for confirmation')
    assert.equal(requests, 2)
    await controller.install()
    assert.equal(installed, true)
    console.log(
      'PASS: real Electron updater feed, download progress, SHA-512 rejection, retry and explicit install handoff'
    )
  })
  .then(
    () => finish(0),
    (error) => {
      console.error(error)
      finish(1)
    }
  )
function finish(code) {
  controller?.dispose()
  updater?.closeServerIfExists()
  server?.close()
  rmSync(directory, { recursive: true, force: true })
  app.exit(code)
}
