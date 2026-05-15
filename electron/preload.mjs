import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  loadAppState: () => ipcRenderer.sendSync('load-app-state'),
  loadAppStateResult: () => ipcRenderer.sendSync('load-app-state-result'),
  saveAppState: (serializedState) => ipcRenderer.sendSync('save-app-state', serializedState),
  onAppStateUpdated: (handler) => {
    const listener = (_event, payload) => handler(payload)
    ipcRenderer.on('app-state-updated', listener)
    return () => ipcRenderer.removeListener('app-state-updated', listener)
  },
  exportAppState: (payload) => ipcRenderer.invoke('export-app-state', payload),
  saveFile: (payload) => ipcRenderer.invoke('save-file', payload),
  copyImageDataUrl: (dataUrl) => ipcRenderer.invoke('copy-image-data-url', dataUrl),
  getRuntimeInfo: () => ipcRenderer.invoke('get-runtime-info'),
  getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
})
