const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  loadAppState: () => ipcRenderer.sendSync('load-app-state'),
  loadAppStateResult: () => ipcRenderer.sendSync('load-app-state-result'),
  saveAppState: (payload) => ipcRenderer.sendSync('save-app-state', payload),
  saveAppStateAsync: (payload) => ipcRenderer.invoke('save-app-state-async', payload),
  importAsset: (payload) => ipcRenderer.invoke('import-asset', payload),
  importImageAsset: (payload) => ipcRenderer.invoke('import-image-asset', payload),
  openAsset: (payload) => ipcRenderer.invoke('open-asset', payload),
  revealAsset: (payload) => ipcRenderer.invoke('reveal-asset', payload),
  readAsset: (payload) => ipcRenderer.invoke('read-asset', payload),
  onAppStateUpdated: (handler) => {
    const listener = (_event, payload) => handler(payload)
    ipcRenderer.on('app-state-updated', listener)
    return () => ipcRenderer.removeListener('app-state-updated', listener)
  },
  getStorageProfileStatus: () => ipcRenderer.invoke('get-storage-profile-status'),
  getUserSettingsLocationStatus: () => ipcRenderer.invoke('get-user-settings-location-status'),
  chooseNotebookLocation: () => ipcRenderer.invoke('choose-notebook-location'),
  createNotebook: (payload) => ipcRenderer.invoke('create-notebook', payload),
  renameNotebook: (payload) => ipcRenderer.invoke('rename-notebook', payload),
  switchNotebook: () => ipcRenderer.invoke('switch-notebook'),
  chooseStorageFolder: () => ipcRenderer.invoke('choose-storage-folder'),
  moveStorageProfile: () => ipcRenderer.invoke('move-storage-profile'),
  chooseUserSettingsFolder: () => ipcRenderer.invoke('choose-user-settings-folder'),
  resetUserSettingsFolder: () => ipcRenderer.invoke('reset-user-settings-folder'),
  resetUserSettingsToDefaults: () => ipcRenderer.invoke('reset-user-settings-to-defaults'),
  retryUserSettingsSync: () => ipcRenderer.invoke('retry-user-settings-sync'),
  revealUserSettingsFolder: () => ipcRenderer.invoke('reveal-user-settings-folder'),
  revealStorageProfile: () => ipcRenderer.invoke('reveal-storage-profile'),
  retryStorageProfile: () => ipcRenderer.invoke('retry-storage-profile'),
  onStorageProfileStatusUpdated: (handler) => {
    const listener = (_event, payload) => handler(payload)
    ipcRenderer.on('storage-profile-status-updated', listener)
    return () => ipcRenderer.removeListener('storage-profile-status-updated', listener)
  },
  onUserSettingsLocationStatusUpdated: (handler) => {
    const listener = (_event, payload) => handler(payload)
    ipcRenderer.on('user-settings-location-status-updated', listener)
    return () => ipcRenderer.removeListener('user-settings-location-status-updated', listener)
  },
  exportNotebookFolder: (payload) => ipcRenderer.invoke('export-notebook-folder', payload),
  openNotebookImportSource: () => ipcRenderer.invoke('open-notebook-import-source'),
  readFolderImportAsset: (payload) => ipcRenderer.invoke('read-folder-import-asset', payload),
  openUserSettingsFile: () => ipcRenderer.invoke('open-user-settings-file'),
  openUserSettingsFromNotebookFolder: () => ipcRenderer.invoke('open-user-settings-from-notebook-folder'),
  saveUserSettingsFile: (payload) => ipcRenderer.invoke('save-user-settings-file', payload),
  saveFile: (payload) => ipcRenderer.invoke('save-file', payload),
  copyImageDataUrl: (dataUrl) => ipcRenderer.invoke('copy-image-data-url', dataUrl),
  openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),
  getRuntimeInfo: () => ipcRenderer.invoke('get-runtime-info'),
  getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
})
