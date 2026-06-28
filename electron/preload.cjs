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
  revealVaultItemLocation: (payload) => ipcRenderer.invoke('reveal-vault-item-location', payload),
  printAisle: (payload) => ipcRenderer.invoke('print-aisle', payload),
  exportPrintPdf: (payload) => ipcRenderer.invoke('export-print-pdf', payload),
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
  chooseVaultLocation: () => ipcRenderer.invoke('choose-vault-location'),
  createVault: (payload) => ipcRenderer.invoke('create-vault', payload),
  renameVault: (payload) => ipcRenderer.invoke('rename-vault', payload),
  openVault: () => ipcRenderer.invoke('open-vault'),
  switchVault: (payload) => ipcRenderer.invoke('switch-vault', payload),
  forgetVault: (payload) => ipcRenderer.invoke('forget-vault', payload),
  deleteVault: (payload) => ipcRenderer.invoke('delete-vault', payload),
  moveStorageProfile: () => ipcRenderer.invoke('move-storage-profile'),
  chooseUserSettingsFolder: () => ipcRenderer.invoke('choose-user-settings-folder'),
  resetUserSettingsFolder: () => ipcRenderer.invoke('reset-user-settings-folder'),
  resetUserSettingsToDefaults: () => ipcRenderer.invoke('reset-user-settings-to-defaults'),
  retryUserSettingsSync: () => ipcRenderer.invoke('retry-user-settings-sync'),
  revealUserSettingsFolder: () => ipcRenderer.invoke('reveal-user-settings-folder'),
  revealStorageProfile: () => ipcRenderer.invoke('reveal-storage-profile'),
  revealRecoveredVaultLocation: (payload) => ipcRenderer.invoke('reveal-recovered-vault-location', payload),
  retryStorageProfile: () => ipcRenderer.invoke('retry-storage-profile'),
  onStorageProfileStatusUpdated: (handler) => {
    const listener = (_event, payload) => handler(payload)
    ipcRenderer.on('storage-profile-status-updated', listener)
    return () => ipcRenderer.removeListener('storage-profile-status-updated', listener)
  },
  onOpenVaultManager: (handler) => {
    const listener = () => handler()
    ipcRenderer.on('open-vault-manager', listener)
    return () => ipcRenderer.removeListener('open-vault-manager', listener)
  },
  onPrintActiveAisleRequested: (handler) => {
    const listener = () => handler()
    ipcRenderer.on('print-active-aisle-requested', listener)
    return () => ipcRenderer.removeListener('print-active-aisle-requested', listener)
  },
  onPrintAislePayload: (handler) => {
    const listener = (_event, payload) => handler(payload)
    ipcRenderer.on('print-aisle-payload', listener)
    return () => ipcRenderer.removeListener('print-aisle-payload', listener)
  },
  notifyPrintAislePayloadReady: () => ipcRenderer.send('print-aisle-payload-ready'),
  notifyPrintAisleRenderReady: () => ipcRenderer.send('print-aisle-render-ready'),
  onAppZoomChanged: (handler) => {
    const listener = (_event, payload) => handler(payload)
    ipcRenderer.on('app-zoom-changed', listener)
    return () => ipcRenderer.removeListener('app-zoom-changed', listener)
  },
  onUserSettingsLocationStatusUpdated: (handler) => {
    const listener = (_event, payload) => handler(payload)
    ipcRenderer.on('user-settings-location-status-updated', listener)
    return () => ipcRenderer.removeListener('user-settings-location-status-updated', listener)
  },
  exportVaultFolder: (payload) => ipcRenderer.invoke('export-vault-folder', payload),
  openVaultImportSource: () => ipcRenderer.invoke('open-vault-import-source'),
  readFolderImportAsset: (payload) => ipcRenderer.invoke('read-folder-import-asset', payload),
  openUserSettingsFile: () => ipcRenderer.invoke('open-user-settings-file'),
  openUserSettingsFromVaultFolder: () => ipcRenderer.invoke('open-user-settings-from-vault-folder'),
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
