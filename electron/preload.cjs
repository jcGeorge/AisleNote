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
  revealNoteLocation: (payload) => ipcRenderer.invoke('reveal-note-location', payload),
  readAsset: (payload) => ipcRenderer.invoke('read-asset', payload),
  getEditorSpellcheckContext: (payload) => ipcRenderer.invoke('get-editor-spellcheck-context', payload),
  replaceMisspelling: (payload) => ipcRenderer.invoke('replace-misspelling', payload),
  addWordToSpellCheckerDictionary: (payload) => ipcRenderer.invoke('add-word-to-spellchecker-dictionary', payload),
  showDefinitionForSelection: () => ipcRenderer.invoke('show-definition-for-selection'),
  onAppStateUpdated: (handler) => {
    const listener = (_event, payload) => handler(payload)
    ipcRenderer.on('app-state-updated', listener)
    return () => ipcRenderer.removeListener('app-state-updated', listener)
  },
  getStorageProfileStatus: () => ipcRenderer.invoke('get-storage-profile-status'),
  getUserSettingsLocationStatus: () => ipcRenderer.invoke('get-user-settings-location-status'),
  chooseNotebookLocation: () => ipcRenderer.invoke('choose-notebook-location'),
  createNotebook: (payload) => ipcRenderer.invoke('create-notebook', payload),
  resetLocalNotebookToBlank: () => ipcRenderer.invoke('reset-local-notebook-to-blank'),
  renameNotebook: (payload) => ipcRenderer.invoke('rename-notebook', payload),
  openNotebook: () => ipcRenderer.invoke('open-notebook'),
  switchNotebook: (payload) => ipcRenderer.invoke('switch-notebook', payload),
  forgetNotebook: (payload) => ipcRenderer.invoke('forget-notebook', payload),
  deleteNotebook: (payload) => ipcRenderer.invoke('delete-notebook', payload),
  attachNotebookSyncTarget: (payload) => ipcRenderer.invoke('attach-notebook-sync-target', payload),
  detachNotebookSyncTarget: (payload) => ipcRenderer.invoke('detach-notebook-sync-target', payload),
  reconnectNotebookSyncTarget: (payload) => ipcRenderer.invoke('reconnect-notebook-sync-target', payload),
  chooseStorageFolder: () => ipcRenderer.invoke('choose-storage-folder'),
  moveStorageProfile: () => ipcRenderer.invoke('move-storage-profile'),
  chooseUserSettingsFolder: () => ipcRenderer.invoke('choose-user-settings-folder'),
  resetUserSettingsFolder: () => ipcRenderer.invoke('reset-user-settings-folder'),
  resetUserSettingsToDefaults: () => ipcRenderer.invoke('reset-user-settings-to-defaults'),
  retryUserSettingsSync: () => ipcRenderer.invoke('retry-user-settings-sync'),
  revealUserSettingsFolder: () => ipcRenderer.invoke('reveal-user-settings-folder'),
  revealStorageProfile: () => ipcRenderer.invoke('reveal-storage-profile'),
  revealRecoveredNotebookLocation: (payload) => ipcRenderer.invoke('reveal-recovered-notebook-location', payload),
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
  appendDiagnosticLogEntry: (payload) => ipcRenderer.invoke('append-diagnostic-log-entry', payload),
  listDiagnosticLogDays: () => ipcRenderer.invoke('list-diagnostic-log-days'),
  readDiagnosticLogEntries: (payload) => ipcRenderer.invoke('read-diagnostic-log-entries', payload),
  openDiagnosticsFolder: () => ipcRenderer.invoke('open-diagnostics-folder'),
})
