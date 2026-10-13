const { translate } = require('./i18n/index.mjs')
const branding = require('./branding.json')

function menuTemplate(
  locale,
  platform = process.platform,
  actions = {},
  { development = false, signedIn = false } = {}
) {
  const t = (key) => translate(locale, key)
  const role = (role, label) => ({ role, label: t(label) })
  const separator = { type: 'separator' }
  const mac = platform === 'darwin'
  const applicationActions = [
    { label: t('Settings'), accelerator: 'CmdOrCtrl+,', click: () => actions.settings?.() },
    { label: t('Check for updates…'), click: () => actions.checkForUpdates?.() },
    { label: t('Sign out'), enabled: signedIn, click: () => actions.signOut?.() }
  ]
  return [
    ...(mac
      ? [
          {
            label: branding.name,
            submenu: [
              role('about', 'About Bosi'),
              separator,
              ...applicationActions,
              separator,
              role('services', 'Services'),
              separator,
              role('hide', 'Hide Bosi'),
              role('hideOthers', 'Hide others'),
              role('unhide', 'Show all'),
              separator,
              role('quit', 'Quit Bosi')
            ]
          }
        ]
      : []),
    {
      label: t('File'),
      submenu: [
        { label: t('New group'), accelerator: 'CmdOrCtrl+Shift+G', click: () => actions.newGroup?.() },
        separator,
        ...(!mac ? [...applicationActions, separator] : []),
        role(mac ? 'close' : 'quit', mac ? 'Close window' : 'Quit Bosi')
      ]
    },
    {
      label: t('Edit'),
      submenu: [
        role('undo', 'Undo'),
        role('redo', 'Redo'),
        separator,
        role('cut', 'Cut'),
        role('copy', 'Copy'),
        role('paste', 'Paste'),
        role('selectAll', 'Select all')
      ]
    },
    {
      label: t('View'),
      submenu: [
        role('reload', 'Reload'),
        role('forceReload', 'Force reload'),
        { ...role('toggleDevTools', 'Developer tools'), enabled: development },
        separator,
        role('resetZoom', 'Actual size'),
        role('zoomIn', 'Zoom in'),
        role('zoomOut', 'Zoom out'),
        separator,
        role('togglefullscreen', 'Toggle full screen')
      ]
    },
    {
      label: t('Window'),
      submenu: [
        role('minimize', 'Minimize'),
        role('zoom', 'Zoom'),
        ...(mac ? [separator, role('front', 'Bring all to front')] : [])
      ]
    }
  ]
}

module.exports = { menuTemplate }
