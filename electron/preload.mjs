import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  loadAppState: () => ipcRenderer.sendSync('load-app-state'),
  saveAppState: (serializedState) => ipcRenderer.sendSync('save-app-state', serializedState),
  exportAppState: (payload) => ipcRenderer.invoke('export-app-state', payload),
  saveFile: (payload) => ipcRenderer.invoke('save-file', payload),
})
