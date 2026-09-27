const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('xpertDesktop', {
  invoke: (method, argument) => ipcRenderer.invoke('xpert:request', method, argument),
  openPlatform: (payload) => ipcRenderer.invoke('xpert:open-platform', payload),
  openWorkspace: () => ipcRenderer.invoke('xpert:open-workspace'),
  setSidebarCollapsed: (collapsed) => ipcRenderer.send('xpert:sidebar-collapsed', collapsed),
  platform: process.platform
})
