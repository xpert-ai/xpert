// BrowserWindow focus changes represent native activation; DOM focus also changes across ChatKit frames.
function installWindowActivation(window) {
  let inactive = false
  const blur = () => {
    inactive = true
  }
  const focus = () => {
    if (!inactive) return
    inactive = false
    if (!window.webContents.isDestroyed()) window.webContents.send('xpert:window-activated')
  }
  window.on('blur', blur)
  window.on('focus', focus)
  window.once('closed', () => {
    window.removeListener('blur', blur)
    window.removeListener('focus', focus)
  })
}

module.exports = { installWindowActivation }
