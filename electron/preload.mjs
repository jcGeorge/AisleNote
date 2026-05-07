import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  saveFile: (payload) => ipcRenderer.invoke('save-file', payload),
})
