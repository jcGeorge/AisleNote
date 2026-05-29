import { readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { buildAppStateExportArchive, getHybridStorageRoot, importAppStateArchive } from './app-state-storage.mjs'

const USER_SETTINGS_MAX_BYTES = 1024 * 1024

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

  ipcMain.handle('save-user-settings-file', async (_event, payload) => {
    const { defaultPath, contents } = payload ?? {}
    if (typeof contents !== 'string') return { canceled: true, error: 'Invalid payload' }

    const saveResult = await dialog.showSaveDialog({
      defaultPath: typeof defaultPath === 'string' ? defaultPath : 'app-settings.json',
      filters: [{ name: 'JSON File', extensions: ['json'] }],
    })

    if (saveResult.canceled || !saveResult.filePath) return { canceled: true }

    try {
      writeFileSync(saveResult.filePath, contents, 'utf8')
      return { canceled: false, filePath: saveResult.filePath }
    } catch (error) {
      return {
        canceled: false,
        error: error instanceof Error ? error.message : 'User settings could not be saved.',
      }
    }
  })

  ipcMain.handle('import-app-state-archive', async () => {
    const openResult = await dialog.showOpenDialog({
      filters: [{ name: 'Zip Archive', extensions: ['zip'] }],
      properties: ['openFile'],
    })

    if (openResult.canceled || !openResult.filePaths?.[0]) return { canceled: true }

    const result = await importAppStateArchive(openResult.filePaths[0])
    return { canceled: false, ...result }
  })

  ipcMain.handle('open-notebook-archive', async () => {
    const openResult = await dialog.showOpenDialog({
      filters: [{ name: 'Zip Archive', extensions: ['zip'] }],
      properties: ['openFile'],
    })

    if (openResult.canceled || !openResult.filePaths?.[0]) return { canceled: true }

    try {
      const bytes = readFileSync(openResult.filePaths[0])
      return {
        canceled: false,
        ok: true,
        bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        filePath: openResult.filePaths[0],
      }
    } catch (error) {
      return {
        canceled: false,
        ok: false,
        error: error instanceof Error ? error.message : 'Notebook archive could not be opened.',
      }
    }
  })

  ipcMain.handle('open-user-settings-file', async () => {
    const openResult = await dialog.showOpenDialog({
      filters: [{ name: 'JSON File', extensions: ['json'] }],
      properties: ['openFile'],
    })

    if (openResult.canceled || !openResult.filePaths?.[0]) return { canceled: true }

    const filePath = openResult.filePaths[0]
    if (path.extname(filePath).toLowerCase() !== '.json') {
      return { canceled: false, ok: false, error: 'User settings file must be a .json file.' }
    }

    try {
      const stats = statSync(filePath)
      if (stats.size > USER_SETTINGS_MAX_BYTES) {
        return { canceled: false, ok: false, error: 'User settings file is too large.' }
      }
      return {
        canceled: false,
        ok: true,
        contents: readFileSync(filePath, 'utf8'),
        filePath,
      }
    } catch (error) {
      return {
        canceled: false,
        ok: false,
        error: error instanceof Error ? error.message : 'User settings file could not be opened.',
      }
    }
  })
}
