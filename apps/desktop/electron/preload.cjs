const { contextBridge, ipcRenderer } = require('electron')
let avatarPointerSubscribers = 0
contextBridge.exposeInMainWorld('xpertDesktop', {
  onAvatarPointer: (callback) => {
    const listener = (_event, point) => {
      if (point === null || (Number.isFinite(point?.x) && Number.isFinite(point?.y))) callback(point)
    }
    ipcRenderer.on('xpert:avatar-pointer', listener)
    if (++avatarPointerSubscribers === 1) ipcRenderer.send('xpert:avatar-pointer-tracking', true)
    let active = true
    return () => {
      if (!active) return
      active = false
      ipcRenderer.removeListener('xpert:avatar-pointer', listener)
      if (--avatarPointerSubscribers === 0) ipcRenderer.send('xpert:avatar-pointer-tracking', false)
    }
  },
  invoke: (method, argument) => ipcRenderer.invoke('xpert:request', method, argument),
  openPlatform: (payload) => ipcRenderer.invoke('xpert:open-platform', payload),
  openWorkspace: () => ipcRenderer.invoke('xpert:open-workspace'),
  setSidebarCollapsed: (collapsed) => ipcRenderer.send('xpert:sidebar-collapsed', collapsed),
  platform: process.platform
})
