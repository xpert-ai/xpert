// Exercise the real host and preload against an isolated local HTTPS fixture.
const { app, safeStorage } = require('electron')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

process.env.XPERT_DESKTOP_USER_DATA = process.env.BOSI_TLS_TEST_PROFILE
process.env.XPERT_DESKTOP_API_URL = `${process.env.BOSI_TLS_TEST_URL}/api`
process.env.XPERT_DESKTOP_WEB_URL = process.env.BOSI_TLS_TEST_URL
process.env.XPERT_DESKTOP_CHATKIT_URL = `${process.env.BOSI_TLS_TEST_URL}/chatkit`
delete process.env.XPERT_DESKTOP_CONNECTION_FILE
delete process.env.XPERT_DESKTOP_DEV_URL
delete process.env.XPERT_DESKTOP_LOCAL_LOGIN
// Never access the machine's Keychain for fake fixture credentials.
safeStorage.isEncryptionAvailable = () => false
let step = 0
app.on('browser-window-created', (_event, window) => {
  window.hide()
  const current = step++
  window.webContents.once('did-finish-load', async () => {
    const invoke = (method, value) =>
      window.webContents.executeJavaScript(
        `window.xpertDesktop.invoke(${JSON.stringify(method)}, ${JSON.stringify(value)})`
      )
    try {
      const state = await invoke('state')
      assert.equal(state.ok, true)
      assert.equal(state.value.config.allowUntrustedCertificates, current === 1)
      assert.equal(state.value.profile, null)
      const certificates = await invoke('checkConnectionCertificates', state.value.config)
      assert.equal(certificates.ok, true)
      assert.equal(certificates.value.length, 1)
      assert.equal(certificates.value[0].status, 'untrusted')
      assert.equal(certificates.value[0].reason, 'authority')
      console.log('PASS: actual certificate warning remains visible even when exceptions are enabled')
      const login = await invoke('login', { email: 'fixture@example.test', password: 'fixture-only' })
      assert.equal(login.ok, current === 1)
      if (current !== 1) assert.match(login.key, /certificate is not trusted/)
      console.log(`PASS: native window ${current + 1} uses the saved certificate policy`)
      if (current === 2) {
        const saved = JSON.parse(readFileSync(join(process.env.BOSI_TLS_TEST_PROFILE, 'desktop-state.json'), 'utf8'))
        assert.equal(saved.config.allowUntrustedCertificates, false)
        assert.equal(saved.encrypted, null)
        app.quit()
        return
      }
      const saved = await invoke('configure', { ...state.value.config, allowUntrustedCertificates: current === 0 })
      assert.equal(saved.ok, true)
      assert.equal(saved.reloadConnection, true)
      console.log('PASS: saving through the native bridge reloads the connection')
    } catch (error) {
      console.error(error)
      app.exit(1)
    }
  })
})
require('../../electron/main.cjs')
