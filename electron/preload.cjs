const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  loadAppState: () => ipcRenderer.sendSync('load-app-state'),
  loadAppStateResult: () => ipcRenderer.sendSync('load-app-state-result'),
  saveAppState: (payload) => ipcRenderer.sendSync('save-app-state', payload),
  onAppStateUpdated: (handler) => {
    const listener = (_event, payload) => handler(payload)
    ipcRenderer.on('app-state-updated', listener)
    return () => ipcRenderer.removeListener('app-state-updated', listener)
  },
  getStorageProfileStatus: () => ipcRenderer.invoke('get-storage-profile-status'),
  chooseStorageFolder: () => ipcRenderer.invoke('choose-storage-folder'),
  moveStorageProfile: () => ipcRenderer.invoke('move-storage-profile'),
  revealStorageProfile: () => ipcRenderer.invoke('reveal-storage-profile'),
  retryStorageProfile: () => ipcRenderer.invoke('retry-storage-profile'),
  onStorageProfileStatusUpdated: (handler) => {
    const listener = (_event, payload) => handler(payload)
    ipcRenderer.on('storage-profile-status-updated', listener)
    return () => ipcRenderer.removeListener('storage-profile-status-updated', listener)
  },
  exportAppState: (payload) => ipcRenderer.invoke('export-app-state', payload),
  saveFile: (payload) => ipcRenderer.invoke('save-file', payload),
  copyImageDataUrl: (dataUrl) => ipcRenderer.invoke('copy-image-data-url', dataUrl),
  getRuntimeInfo: () => ipcRenderer.invoke('get-runtime-info'),
  getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
})
