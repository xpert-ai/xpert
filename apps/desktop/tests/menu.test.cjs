const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { menuTemplate } = require('../electron/menu.cjs')
const { createMenuActions } = require('../electron/menu-actions.cjs')
const { createUpdateMenuAction } = require('../electron/updates/menu.cjs')
const { DesktopUpdater } = require('../electron/updates/controller.cjs')
const { translate } = require('../electron/i18n/index.mjs')

test('native app actions are localized, placed on each platform and disabled when signed out', () => {
  for (const platform of ['darwin', 'win32', 'linux']) {
    const calls = []
    const actions = Object.fromEntries(
      ['settings', 'checkForUpdates', 'signOut'].map((key) => [key, () => calls.push(key)])
    )
    const menu = menuTemplate('zh-Hans', platform, actions, { signedIn: true })
    const items = menu[0].submenu
    const settings = items.find((item) => item.label === '设置')
    assert.equal(settings.accelerator, 'CmdOrCtrl+,')
    settings.click()
    items.find((item) => item.label === '检查更新…').click()
    const signOut = items.find((item) => item.label === '退出登录')
    assert.equal(signOut.enabled, true)
    signOut.click()
    assert.deepEqual(calls, ['settings', 'checkForUpdates', 'signOut'])
    assert.equal(menuTemplate('en', platform)[0].submenu.find((item) => item.label === 'Sign out').enabled, false)
    for (const development of [false, true]) {
      const view = menuTemplate('en', platform, {}, { development }).find((item) => item.label === 'View')
      assert.equal(view.submenu.find((item) => item.role === 'toggleDevTools').enabled, development)
    }
  }
})

test('menu actions wait for the main renderer after window recreation and reject other frames', () => {
  const ipcMain = new EventEmitter()
  const sent = []
  let window = { webContents: { send: (...args) => sent.push(args) } }
  const actions = createMenuActions({
    ipcMain,
    isTrusted: (event) => event.sender === window.webContents && event.mainFrame,
    showWindow: () => window
  })
  actions.send('settings')
  ipcMain.emit('xpert:menu-ready', { sender: window.webContents, mainFrame: false })
  assert.equal(sent.length, 0)
  ipcMain.emit('xpert:menu-ready', { sender: window.webContents, mainFrame: true })
  assert.deepEqual(sent, [['xpert:menu-action', 'settings']])
  actions.send('sign-out')
  assert.equal(sent.at(-1)[1], 'sign-out')
  const previous = window
  window = { webContents: { send: (...args) => sent.push(args) } }
  actions.reset()
  actions.send('settings')
  ipcMain.emit('xpert:menu-ready', { sender: previous.webContents, mainFrame: true })
  assert.equal(sent.length, 2)
  ipcMain.emit('xpert:menu-ready', { sender: window.webContents, mainFrame: true })
  assert.equal(sent.at(-1)[1], 'settings')
})

function updaterFixture(t, { enabled = true, available = false, fail = false } = {}) {
  const updater = new EventEmitter()
  const calls = []
  updater.setFeedURL = () => {}
  updater.checkForUpdates = async () => {
    calls.push('check')
    if (fail) throw new Error('private feed URL')
    updater.emit(available ? 'update-available' : 'update-not-available', { version: '1.1.0' })
  }
  updater.downloadUpdate = async () => {
    calls.push('download')
    updater.emit('update-downloaded', { version: '1.1.0' })
  }
  updater.quitAndInstall = () => calls.push('install')
  const updates = new DesktopUpdater({ updater, enabled, currentVersion: '1.0.0', resolveFeed: async () => ({}) })
  t.after(() => updates.dispose())
  return { updater, updates, calls }
}

test('manual checks report latest, disabled and failed states without downloading', async (t) => {
  for (const [options, message] of [
    [{}, 'Bosi is up to date.'],
    [{ enabled: false }, 'Updates are not available in this build.'],
    [{ fail: true }, 'Could not check for updates. Check your connection and retry.']
  ]) {
    const { updates, calls } = updaterFixture(t, options)
    const check = createUpdateMenuAction({
      updates,
      t: (key, params) => translate('en', key, params),
      showMessageBox: async (dialog) => {
        assert.equal(dialog.message, message)
        assert.equal(dialog.detail, 'Current version: 1.0.0')
        assert.deepEqual(dialog.buttons, ['Close'])
        return { response: 0 }
      }
    })
    await check()
    assert.ok(calls.every((call) => call === 'check'))
  }
})

test('manual checks coalesce, wait for background checks and require explicit download and restart', async (t) => {
  const { updater, updates, calls } = updaterFixture(t, { available: true })
  let finishCheck
  updater.checkForUpdates = () =>
    new Promise((resolve) => {
      finishCheck = resolve
    })
  const background = updates.check()
  await Promise.resolve()
  const dialogs = []
  let response = 0
  const check = createUpdateMenuAction({
    updates,
    t: (key, params) => translate('en', key, params),
    showMessageBox: async (dialog) => {
      dialogs.push(dialog)
      return { response }
    }
  })
  const first = check()
  assert.equal(check(), first)
  assert.equal(dialogs.length, 0)
  updater.emit('update-available', { version: '1.1.0' })
  finishCheck()
  await Promise.all([first, background])
  assert.equal(dialogs.length, 1)
  assert.equal(dialogs[0].message, 'Bosi 1.1.0 is available.')
  assert.deepEqual(calls, [])
  response = 1
  await check()
  assert.deepEqual(calls, ['download'])
  await check()
  assert.deepEqual(dialogs.at(-1).buttons, ['Close', 'Install and restart'])
  assert.deepEqual(calls, ['download', 'install'])
})
