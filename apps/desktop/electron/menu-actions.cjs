// Native menus remain available after the macOS window closes. Queue actions until
// the recreated renderer has subscribed, and only accept readiness from that window.
function createMenuActions({ ipcMain, isTrusted, showWindow }) {
  let readyContents
  let pending
  ipcMain.on('xpert:menu-ready', (event) => {
    if (!isTrusted(event)) return
    readyContents = event.sender
    if (pending) {
      readyContents.send('xpert:menu-action', pending)
      pending = undefined
    }
  })
  return {
    reset() {
      readyContents = undefined
    },
    send(action) {
      const window = showWindow()
      if (readyContents === window.webContents) window.webContents.send('xpert:menu-action', action)
      else pending = action
    }
  }
}

module.exports = { createMenuActions }
