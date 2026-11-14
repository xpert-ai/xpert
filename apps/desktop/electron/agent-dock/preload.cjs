const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('bosiDock', {
  subscribe(state, position, cancelDrag) {
    ipcRenderer.on('dock:state', (_e, value) => state(value))
    ipcRenderer.on('dock:position', (_e, value) => position(value))
    ipcRenderer.on('dock:cancel-drag', () => cancelDrag())
    return ipcRenderer.invoke('dock:action', 'ready')
  },
  manage: () => ipcRenderer.invoke('dock:action', 'manage'),
  drag: (phase, screenY) => ipcRenderer.invoke('dock:action', 'drag', phase, screenY),
  nudge: (key) => ipcRenderer.invoke('dock:action', 'nudge', key),
  toggle: (token) => ipcRenderer.invoke('dock:action', 'toggle', token),
  openResult: (token) => ipcRenderer.invoke('dock:action', 'open-result', token),
  open: (token) => ipcRenderer.invoke('dock:action', 'open', token)
})
