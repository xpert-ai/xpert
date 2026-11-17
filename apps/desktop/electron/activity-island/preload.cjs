const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('bosiIsland', {
  subscribe(callback, onPointer, onHidden) {
    ipcRenderer.on('island:pointer', (_event, point) => onPointer(point))
    ipcRenderer.on('island:hidden', () => onHidden())
    ipcRenderer.on('island:state', (_event, state) => callback(state))
    return ipcRenderer.invoke('island:action', 'ready')
  },
  stop: (id) => ipcRenderer.invoke('island:action', 'stop', id),
  interactive: (inside) => ipcRenderer.invoke('island:action', 'interactive', inside),
  expand: (value) => ipcRenderer.invoke('island:action', 'expand', value),
  running: (id) => ipcRenderer.invoke('island:action', 'running', id),
  review: (id) => ipcRenderer.invoke('island:action', 'review', id)
})
