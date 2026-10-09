const { allowVoicePermission } = require('./voice-permission.cjs')
const {
  app,
  BrowserWindow,
  ipcMain,
  safeStorage,
  shell,
  session,
  Menu,
  screen,
  dialog,
  powerMonitor,
  Tray,
  nativeImage
} = require('electron')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { DesktopService, webUrl } = require('./service.cjs')
const { connectionDefaults, packagedConnection } = require('./connection/defaults.cjs')
const { connectionPolicyKey, createConnectionSession } = require('./connection/tls.cjs')
const { probeCertificate } = require('./connection/certificates.cjs')
const { createStorage } = require('./storage.cjs')
const { dispatch } = require('./dispatch.cjs')
const { menuTemplate } = require('./menu.cjs')
const { DesktopShellController } = require('./shell/controller.cjs')
const { translate } = require('./i18n/index.mjs')
const { platformCommandUrl } = require('./workbench-platform.mjs')
const { installAvatarPointer } = require('./avatar-pointer.cjs')
const { installWindowActivation } = require('./window-activation.cjs')
const { DesktopUpdater, registerUpdateIpc } = require('./updates/controller.cjs')
const { findRelease } = require('./updates/release.cjs')
const { isWorkspaceFileDownload, downloadWorkspaceFile } = require('./workspace-file-download.cjs')
const { AudioCaptureController } = require('./audio-capture/controller.cjs')
const { registerAudioCaptureIpc, dispatchWithAudioCapture } = require('./audio-capture/lifecycle.cjs')

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
let connectionSession
let connectionReloadPending = false
let audioCaptureTray
function showAudioCaptureIndicator(recording) {
  audioCaptureTray?.destroy()
  audioCaptureTray = undefined
  if (!recording) return
  const icon = nativeImage.createFromPath(appIcon).resize({ width: 18, height: 18 })
  audioCaptureTray = new Tray(icon)
  const t = (key) => translate(service.config.locale, key)
  audioCaptureTray.setToolTip(`${branding.name} · ${t('Recording')}`)
  audioCaptureTray.setContextMenu(
    Menu.buildFromTemplate([
      { label: t('Recording'), enabled: false },
      {
        label: t('End recording'),
        click: () => {
          void service.audioCapture.stop('user')
        }
      }
    ])
  )
}

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

function resetConnectionSession() {
  connectionSession = createConnectionSession(session, service.config)
  connectionSession.setPermissionRequestHandler((contents, permission, callback, details) =>
    callback(
      allowClipboardWrite(contents, permission, details.requestingUrl) ||
        allowVoicePermission({
          contents,
          mainContents: window?.webContents,
          permission,
          source: details.requestingUrl,
          rendererUrl,
          details
        })
    )
  )
  connectionSession.setPermissionCheckHandler(
    (contents, permission, origin, details) =>
      allowClipboardWrite(contents, permission, origin) ||
      allowVoicePermission({
        contents,
        mainContents: window?.webContents,
        permission,
        source: origin,
        rendererUrl,
        details,
        check: true
      })
  )
}

function createWindow(bounds = {}) {
  window = new BrowserWindow({
    width: 1440,
    height: 1024,
    ...bounds,
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
      webSecurity: true,
      session: connectionSession
    }
  })
  const createdWindow = window
  window.on('closed', () => {
    if (window === createdWindow) window = undefined
    void service.audioCapture?.stop('interrupted')
  })
  installAvatarPointer(window, { ipcMain, screen, isTrusted: trusted })
  installWindowActivation(window)
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isWorkspaceFileDownload(url, service.config.apiUrl)) {
      void downloadWorkspaceFile(url, service, async (fileName) => {
        const result = await dialog.showSaveDialog(createdWindow, {
          title: translate(service.config.locale, 'Download'),
          defaultPath: fileName
        })
        return result.canceled ? null : result.filePath
      }).catch(() => {
        if (!createdWindow.isDestroyed())
          void dialog.showMessageBox(createdWindow, {
            type: 'error',
            message: translate(service.config.locale, 'Could not load the delivered file.')
          })
      })
    } else openExternal(url)
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
    service = new DesktopService({
      storage: createStorage(app.getPath('userData'), encryption),
      localLogin,
      certificateProbe: (origin) => probeCertificate(session, origin),
      fetcher: (url, options) => connectionSession.fetch(url, { ...options, credentials: 'omit' }),
      defaultConfig: app.isPackaged ? packagedConnection() : connectionDefaults(),
      systemLanguages: [...app.getPreferredSystemLanguages(), app.getLocale()]
    })
    service.shell = new DesktopShellController(service, path.join(app.getPath('userData'), 'desktop-shell'))
    service.audioCapture = new AudioCaptureController(service, {
      root: path.join(app.getPath('userData'), 'audio-capture'),
      encryption,
      helper: path
        .join(__dirname, '../resources/audio-capture/audio-capture')
        .replace('app.asar/', 'app.asar.unpacked/'),
      onRecording: showAudioCaptureIndicator
    })
    powerMonitor.on('suspend', () => {
      void service.audioCapture.stop('sleep')
    })
    resetConnectionSession()
    updateApplicationMenu()
    const updatesEnabled =
      app.isPackaged &&
      require('../package.json').desktopUpdates === true &&
      (process.platform !== 'linux' || Boolean(process.env.APPIMAGE))
    const updates = new DesktopUpdater({
      updater: updatesEnabled ? require('electron-updater').autoUpdater : null,
      enabled: updatesEnabled,
      currentVersion: app.getVersion(),
      resolveFeed: () => findRelease({ platform: process.platform, arch: process.arch }),
      beforeInstall: async () => {
        // Drain local tools before the updater takes ownership of quitting/restarting.
        await service.audioCapture.shutdown('quit')
        await service.shell.disable()
        shellShutdownComplete = true
      }
    })
    registerUpdateIpc(ipcMain, updates, trusted)
    updates.on('state', (state) => {
      if (state.status === 'error' && state.operation === 'install') shellShutdownComplete = false
      if (window && !window.isDestroyed()) window.webContents.send('xpert:update-state', state)
    })
    updates.start()
    app.once('will-quit', () => updates.dispose())
    registerAudioCaptureIpc(ipcMain, service.audioCapture, trusted)
    ipcMain.handle('xpert:request', async (event, method, argument) => {
      if (!trusted(event))
        return {
          ok: false,
          key: 'Request origin is not allowed.',
          message: translate(service.config.locale, 'Request origin is not allowed.'),
          status: 403
        }
      const previousPolicy = connectionPolicyKey(service.config)
      const previousLocale = service.config.locale
      const result = await dispatchWithAudioCapture(service, dispatch, method, argument, translate)
      if (previousLocale !== service.config.locale) updateApplicationMenu()
      // Only a host-verified, live connection attempt may bring Desktop back from browser authorization.
      if (
        ['checkPluginConnection', 'bosiCheckConnection'].includes(method) &&
        result.ok &&
        result.value.status === 'connected'
      ) {
        if (window?.isMinimized()) window.restore()
        window?.show()
        app.focus({ steal: true })
        window?.focus()
      }
      if (method === 'configure' && result.ok) {
        if (previousPolicy !== connectionPolicyKey(service.config)) {
          const previousSession = connectionSession
          resetConnectionSession()
          await previousSession.closeAllConnections()
          connectionReloadPending = true
          return { ...result, reloadConnection: true }
        }
      }
      return result
    })
    ipcMain.on('xpert:reload-connection', (event) => {
      if (!trusted(event) || !connectionReloadPending) return
      connectionReloadPending = false
      const previousWindow = window
      const maximized = previousWindow.isMaximized()
      createWindow(previousWindow.getBounds())
      if (maximized) window.maximize()
      previousWindow.destroy()
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
  void Promise.all([service.shell.disable(), service.audioCapture?.shutdown('quit')]).finally(() => {
    shellShutdownComplete = true
    app.quit()
  })
})
