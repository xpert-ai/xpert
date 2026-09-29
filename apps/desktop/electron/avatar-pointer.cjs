// Only the focused, visible Desktop window receives local cursor coordinates.
// A single opt-in sampler also covers cross-origin ChatKit frames without exposing screen positions.
function installAvatarPointer(window, { ipcMain, screen, isTrusted, timers = { setInterval, clearInterval } }) {
  const contents = window.webContents
  let enabled = false
  let timer = null
  let last = undefined
  const send = (point) => {
    if (contents.isDestroyed() || (last === null && point === null)) return
    if (last && point && last.x === point.x && last.y === point.y) return
    last = point
    contents.send('xpert:avatar-pointer', point)
  }
  const sample = () => {
    const bounds = window.getContentBounds()
    const point = screen.getCursorScreenPoint()
    const x = point.x - bounds.x
    const y = point.y - bounds.y
    const zoom = contents.getZoomFactor()
    send(x >= 0 && y >= 0 && x < bounds.width && y < bounds.height ? { x: x / zoom, y: y / zoom } : null)
  }
  const update = () => {
    if (enabled && !window.isDestroyed() && window.isFocused() && window.isVisible() && !window.isMinimized()) {
      if (timer === null) timer = timers.setInterval(sample, 1000 / 30)
      sample()
    } else {
      if (timer !== null) timers.clearInterval(timer)
      timer = null
      send(null)
    }
  }
  const request = (event, value) => {
    if (!isTrusted(event) || typeof value !== 'boolean') return
    enabled = value
    if (enabled) last = undefined
    update()
  }
  const navigate = (event) => {
    if (event.isMainFrame && !event.isSameDocument) {
      enabled = false
      update()
    }
  }
  const events = ['focus', 'blur', 'show', 'hide', 'minimize', 'restore']
  ipcMain.on('xpert:avatar-pointer-tracking', request)
  for (const event of events) window.on(event, update)
  contents.on('did-start-navigation', navigate)
  window.once('closed', () => {
    if (timer !== null) timers.clearInterval(timer)
    ipcMain.removeListener('xpert:avatar-pointer-tracking', request)
    contents.removeListener('did-start-navigation', navigate)
    for (const event of events) window.removeListener(event, update)
  })
}

module.exports = { installAvatarPointer }
