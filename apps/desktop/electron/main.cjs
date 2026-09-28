const { app, BrowserWindow, ipcMain, safeStorage, shell, session, Menu, screen } = require('electron')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { DesktopService, webUrl } = require('./service.cjs')
const { createStorage } = require('./storage.cjs')
const { dispatch } = require('./dispatch.cjs')
const { menuTemplate } = require('./menu.cjs')
const { DesktopShellController } = require('./shell/controller.cjs')
const { translate } = require('./i18n/index.mjs')
const { platformCommandUrl } = require('./workbench-platform.mjs')
const { installAvatarPointer } = require('./avatar-pointer.cjs')

const branding = require('./branding.json')

// Keep the existing profile and OS encryption identity when changing the display brand.
app.setName(branding.storageName)
// A separate profile supports local acceptance without touching the daily app account.
if (process.env.XPERT_DESKTOP_USER_DATA) app.setPath('userData', path.resolve(process.env.XPERT_DESKTOP_USER_DATA))
const devUrl = !app.isPackaged ? process.env.XPERT_DESKTOP_DEV_URL : null
const rendererUrl = devUrl || pathToFileURL(path.join(__dirname, '../dist/index.html')).href
const appIcon = path.join(__dirname, '../resources', process.platform === 'darwin' ? 'icon-macos.png' : 'logo.png')
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

function updateApplicationMenu() {
  const locale = service.config.locale
  app.setAboutPanelOptions({
    applicationName: branding.fullName,
    applicationVersion: app.getVersion(),
    iconPath: appIcon,
    credits: `${translate(locale, 'Your AI team leader.')}\n${translate(locale, 'You set the goal. Bosi leads the team.')}`
  })
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate(locale)))
}

function createWindow() {
  window = new BrowserWindow({
    width: 1440,
    height: 1024,
    minWidth: 860,
    minHeight: 640,
    title: branding.name,
    icon: appIcon,
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
  window.on('closed', () => {
    window = undefined
  })
  installAvatarPointer(window, { ipcMain, screen, isTrusted: trusted })
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
    if (!window || window.isDestroyed()) {
      if (app.isReady()) createWindow()
      return
    }
    if (window?.isMinimized()) window.restore()
    window?.focus()
  })
  app.whenReady().then(async () => {
    // Packaged macOS apps use the bundle's ICNS; development runs in Electron's bundle.
    if (process.platform === 'darwin' && !app.isPackaged) app.dock.setIcon(appIcon)
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
    service.shell = new DesktopShellController(service, path.join(app.getPath('userData'), 'desktop-shell'))
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) =>
      callback(allowClipboardWrite(contents, permission, details.requestingUrl))
    )
    session.defaultSession.setPermissionCheckHandler((contents, permission, origin) =>
      allowClipboardWrite(contents, permission, origin)
    )
    updateApplicationMenu()
    ipcMain.handle('xpert:request', async (event, method, argument) => {
      if (!trusted(event))
        return {
          ok: false,
          key: 'Request origin is not allowed.',
          message: translate(service.config.locale, 'Request origin is not allowed.'),
          status: 403
        }
      const result = await dispatch(service, method, argument)
      // Only a host-verified, live connection attempt may bring Desktop back from browser authorization.
      if (method === 'checkPluginConnection' && result.ok && result.value.status === 'connected') {
        if (window?.isMinimized()) window.restore()
        window?.show()
        app.focus({ steal: true })
        window?.focus()
      }
      if (method === 'configure' && result.ok) updateApplicationMenu()
      return result
    })
    ipcMain.handle('xpert:open-workspace', (event) => {
      if (trusted(event)) openExternal(service.config.webUrl)
    })
    ipcMain.handle('xpert:open-platform', async (event, payload) => {
      if (!trusted(event)) return false
      const url = platformCommandUrl(service.config.webUrl, payload)
      if (!url) return false
      try {
        await shell.openExternal(url)
        return true
      } catch {
        return false
      }
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

let shellShutdownComplete = false
app.on('before-quit', (event) => {
  if (!service?.shell || shellShutdownComplete) return
  event.preventDefault()
  void service.shell.disable().finally(() => {
    shellShutdownComplete = true
    app.quit()
  })
})
