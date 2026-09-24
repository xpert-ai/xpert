const { app, BrowserWindow, ipcMain, safeStorage, shell, session, Menu } = require('electron')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { DesktopService, webUrl } = require('./service.cjs')
const { createStorage } = require('./storage.cjs')
const { dispatch } = require('./dispatch.cjs')
const { menuTemplate } = require('./menu.cjs')
const { translate } = require('./i18n/index.mjs')

app.setName('Xpert')
const devUrl = !app.isPackaged ? process.env.XPERT_DESKTOP_DEV_URL : null
const rendererUrl = devUrl || pathToFileURL(path.join(__dirname, '../dist/index.html')).href
let window
let service

function trusted(event) {
  return (
    event.sender === window?.webContents &&
    event.senderFrame === window.webContents.mainFrame &&
    event.senderFrame.url === rendererUrl
  )
}

function openExternal(url) {
  try {
    webUrl(url.split('#')[0].split('?')[0])
    void shell.openExternal(url)
  } catch {
    /* Reject non-web schemes. */
  }
}

function allowClipboardWrite(contents, permission, source) {
  if (contents !== window?.webContents || permission !== 'clipboard-sanitized-write') return false
  try {
    return source === rendererUrl || new URL(source).origin === new URL(service.config.frameUrl).origin
  } catch {
    return false
  }
}

function createWindow() {
  window = new BrowserWindow({
    width: 1440,
    height: 1024,
    minWidth: 860,
    minHeight: 640,
    title: 'Xpert',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== rendererUrl) {
      event.preventDefault()
      openExternal(url)
    }
  })
  window.webContents.on('will-attach-webview', (event) => event.preventDefault())
  window.loadURL(rendererUrl)
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => {
    if (window?.isMinimized()) window.restore()
    window?.focus()
  })
  app.whenReady().then(async () => {
    let localLogin
    if (!app.isPackaged && process.env.XPERT_DESKTOP_LOCAL_LOGIN === '1') {
      localLogin = (await import('../scripts/local-credentials.mjs')).readLocalCredentials
    }
    const encryption = {
      isEncryptionAvailable: () =>
        safeStorage.isEncryptionAvailable() &&
        (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text'),
      encryptString: (value) => safeStorage.encryptString(value),
      decryptString: (value) => safeStorage.decryptString(value)
    }
    service = new DesktopService({ storage: createStorage(app.getPath('userData'), encryption), localLogin })
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) =>
      callback(allowClipboardWrite(contents, permission, details.requestingUrl))
    )
    session.defaultSession.setPermissionCheckHandler((contents, permission, origin) =>
      allowClipboardWrite(contents, permission, origin)
    )
    Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate(service.config.locale)))
    ipcMain.handle('xpert:request', async (event, method, argument) => {
      if (!trusted(event))
        return {
          ok: false,
          key: 'Request origin is not allowed.',
          message: translate(service.config.locale, 'Request origin is not allowed.'),
          status: 403
        }
      const result = await dispatch(service, method, argument)
      if (method === 'configure' && result.ok)
        Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate(service.config.locale)))
      return result
    })
    ipcMain.handle('xpert:open-workspace', (event) => {
      if (trusted(event)) openExternal(service.config.webUrl)
    })
    ipcMain.on('xpert:sidebar-collapsed', (event, collapsed) => {
      if (trusted(event) && typeof collapsed === 'boolean' && process.platform === 'darwin') {
        window.setWindowButtonPosition({ x: collapsed ? 6 : 16, y: 18 })
      }
    })
    createWindow()
    app.on('activate', () => {
      if (!BrowserWindow.getAllWindows().length) createWindow()
    })
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
