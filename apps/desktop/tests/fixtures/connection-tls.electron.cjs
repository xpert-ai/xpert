// Real Chromium verification: changing policy must not reuse cached TLS decisions.
const { app, BrowserWindow, session } = require('electron')
const assert = require('node:assert/strict')
const { createConnectionSession } = require('../../electron/connection/tls.cjs')
const { DesktopService, DEFAULT_CONFIG } = require('../../electron/service.cjs')
app.setPath('userData', process.env.BOSI_TLS_TEST_PROFILE)
app.on('window-all-closed', () => {})
app
  .whenReady()
  .then(async () => {
    const url = process.env.BOSI_TLS_TEST_URL
    const partitions = []
    for (const allowed of [false, true, false]) {
      const config = {
        ...DEFAULT_CONFIG,
        apiUrl: `${url}/api`,
        webUrl: url,
        frameUrl: `${url}/chatkit`,
        allowUntrustedCertificates: allowed
      }
      const network = createConnectionSession(session, config)
      partitions.push(network)
      const service = new DesktopService({
        defaultConfig: config,
        fetcher: (target, options) => network.fetch(target, options)
      })
      const input = { email: 'fixture@example.test', password: 'fixture-only' }
      if (!allowed) {
        await assert.rejects(service.login(input), (error) => error.key.includes('certificate is not trusted'))
        console.log('PASS: strict API login rejects self-signed certificate')
        continue
      }
      assert.equal((await service.login(input)).profile.user.id, 'fixture-user')
      console.log('PASS: enabled policy permits API login and bootstrap')
      const otherHost = url.replace('127.0.0.1', 'localhost')
      await assert.rejects(network.fetch(`${otherHost}/api/ping`), /ERR_CERT_AUTHORITY_INVALID/)
      console.log('PASS: unconfigured host remains protected')
      const window = new BrowserWindow({
        show: false,
        webPreferences: { session: network, sandbox: true, contextIsolation: true, nodeIntegration: false }
      })
      await window.loadURL('data:text/html,<iframe id="chat" style="width:100%;height:100%"></iframe>')
      const embedded = await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('ChatKit fixture did not load')), 10000);
      addEventListener('message', (event) => { if(event.origin === ${JSON.stringify(url)} && event.data === 'chatkit-ready') {clearTimeout(timeout);resolve(event.data);} });
      document.querySelector('#chat').src = ${JSON.stringify(`${url}/chatkit`)};
    })`)
      assert.equal(embedded, 'chatkit-ready')
      console.log('PASS: embedded ChatKit loads and performs HTTPS requests')
      window.destroy()
    }
    assert.equal(new Set(partitions).size, 3)
    for (const network of partitions) await network.closeAllConnections()
    app.quit()
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
