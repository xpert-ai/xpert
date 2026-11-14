// Each screen has its own panel and pointer state. Only its own sandboxed main frame may operate it.
function displayPanels({ ipcMain, channel, page, targets, create }) {
  const panels = new Map()
  let disposed = false
  function sync() {
    if (disposed) return
    const screens = targets()
    for (const [id, panel] of panels) {
      if (!screens.some((d) => d.id === id)) {
        panels.delete(id)
        panel.dispose()
      }
    }
    for (const display of screens) {
      if (!panels.has(display.id)) panels.set(display.id, create(display.id))
      panels.get(display.id).sync(display)
    }
  }
  ipcMain.handle(channel, (event, ...args) => {
    if (
      disposed ||
      !event.senderFrame ||
      event.senderFrame !== event.sender.mainFrame ||
      event.senderFrame.url !== page
    )
      return false
    for (const panel of panels.values()) {
      if (panel.owns(event.sender)) return panel.action(event, ...args)
    }
    return false
  })
  return {
    sync,
    each(callback) {
      for (const panel of panels.values()) callback(panel)
    },
    dispose() {
      disposed = true
      ipcMain.removeHandler?.(channel)
      for (const panel of panels.values()) panel.dispose()
      panels.clear()
    }
  }
}
module.exports = { displayPanels }
