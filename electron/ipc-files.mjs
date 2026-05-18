import { writeFileSync } from 'node:fs'
import { buildAppStateExportArchive, getHybridStorageRoot } from './app-state-storage.mjs'

export function registerFileIpc({ ipcMain, dialog, storageSession = null }) {
  ipcMain.handle('save-file', async (_event, payload) => {
    const { defaultPath, data } = payload ?? {}
    if (!(data instanceof ArrayBuffer)) return { canceled: true, error: 'Invalid payload' }

    const saveResult = await dialog.showSaveDialog({
      defaultPath: typeof defaultPath === 'string' ? defaultPath : 'notes-export.zip',
      filters: [{ name: 'Zip Archive', extensions: ['zip'] }],
    })

    if (saveResult.canceled || !saveResult.filePath) return { canceled: true }

    const bytes = Buffer.from(new Uint8Array(data))
    writeFileSync(saveResult.filePath, bytes)
    return { canceled: false, filePath: saveResult.filePath }
  })

  ipcMain.handle('export-app-state', async (_event, payload) => {
    const { defaultPath, serializedState } = payload ?? {}
    if (typeof serializedState !== 'string') return { canceled: true, error: 'Invalid payload' }

    const saveResult = await dialog.showSaveDialog({
      defaultPath: typeof defaultPath === 'string' ? defaultPath : 'notes-export.zip',
      filters: [{ name: 'Zip Archive', extensions: ['zip'] }],
    })

    if (saveResult.canceled || !saveResult.filePath) return { canceled: true }

    try {
      const profileRootPath = storageSession?.getProfileRootPath?.()
      const bytes = await buildAppStateExportArchive(serializedState, {
        assetSourceRoot: profileRootPath ? getHybridStorageRoot(profileRootPath) : null,
      })
      writeFileSync(saveResult.filePath, bytes)
      return { canceled: false, filePath: saveResult.filePath }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { canceled: false, error: message }
    }
  })
}
