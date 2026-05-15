import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { registerClipboardIpc } from './ipc-clipboard.mjs'
import { registerFileIpc } from './ipc-files.mjs'
import { registerStorageIpc } from './ipc-storage.mjs'
import { registerUpdateIpc } from './ipc-updates.mjs'
import { createNoopUpdateService } from './update-service.mjs'

function createIpcMain() {
  const handlers = new Map()
  const listeners = new Map()
  return {
    on: vi.fn((name, listener) => {
      listeners.set(name, listener)
    }),
    handle: vi.fn((name, handler) => {
      handlers.set(name, handler)
    }),
    handlers,
    listeners,
  }
}

function createBrowserWindow(windows = []) {
  return {
    getAllWindows: vi.fn(() => windows),
  }
}

function withTempUserDataPath(run) {
  const userDataPath = mkdtempSync(path.join(os.tmpdir(), 'tabs-ipc-user-data-'))
  try {
    return run(userDataPath)
  } finally {
    rmSync(userDataPath, { recursive: true, force: true })
  }
}

describe('electron ipc boundaries', () => {
  it('keeps save-file invalid payload behavior unchanged', async () => {
    const ipcMain = createIpcMain()
    registerFileIpc({
      ipcMain,
      dialog: { showSaveDialog: vi.fn() },
    })

    await expect(ipcMain.handlers.get('save-file')(null, { defaultPath: 'x.zip', data: 'bad' })).resolves.toEqual({
      canceled: true,
      error: 'Invalid payload',
    })
  })

  it('keeps clipboard invalid payload behavior unchanged', async () => {
    const ipcMain = createIpcMain()
    registerClipboardIpc({
      ipcMain,
      clipboard: { writeImage: vi.fn() },
      nativeImage: { createFromDataURL: vi.fn() },
    })

    await expect(ipcMain.handlers.get('copy-image-data-url')(null, 'bad')).resolves.toEqual({
      ok: false,
      error: 'Invalid image payload',
    })
  })

  it('registers no-op update handlers without enabling updater behavior', async () => {
    const ipcMain = createIpcMain()
    const updateService = createNoopUpdateService({ getVersion: () => '1.2.3' })
    registerUpdateIpc({ ipcMain, updateService })

    await expect(ipcMain.handlers.get('get-runtime-info')()).resolves.toEqual({
      version: '1.2.3',
      platform: process.platform,
    })
    await expect(ipcMain.handlers.get('check-for-updates')()).resolves.toEqual({ status: 'not-available' })
  })

  it('blocks app-state writes after a failed load result', () =>
    withTempUserDataPath((userDataPath) => {
      const root = path.join(userDataPath, 'notes-data')
      mkdirSync(root, { recursive: true })
      writeFileSync(path.join(root, 'manifest.json'), '{nope', 'utf8')

      const ipcMain = createIpcMain()
      const storageSession = registerStorageIpc({
        ipcMain,
        app: { getPath: () => userDataPath },
        BrowserWindow: createBrowserWindow(),
      })

      const loadEvent = { returnValue: null }
      ipcMain.listeners.get('load-app-state-result')(loadEvent)

      const saveEvent = { returnValue: null }
      ipcMain.listeners.get('save-app-state')(saveEvent, { serializedState: '{"theme":"dawn"}', baseRevision: 0 })

      expect(loadEvent.returnValue.ok).toBe(false)
      expect(storageSession.canWriteAppState()).toBe(false)
      expect(saveEvent.returnValue).toEqual({
        ok: false,
        reason: 'load-failed',
        error: 'App state did not load; refusing to overwrite existing data.',
        currentRevision: 0,
        serializedState: null,
      })
    }))

  it('broadcasts successful revisioned app-state saves to other windows', () =>
    withTempUserDataPath((userDataPath) => {
      const ipcMain = createIpcMain()
      const sourceSender = { id: 1 }
      const sourceWindow = {
        isDestroyed: vi.fn(() => false),
        webContents: { id: 1, send: vi.fn() },
      }
      const otherWindow = {
        isDestroyed: vi.fn(() => false),
        webContents: { id: 2, send: vi.fn() },
      }
      registerStorageIpc({
        ipcMain,
        app: { getPath: () => userDataPath },
        BrowserWindow: createBrowserWindow([sourceWindow, otherWindow]),
      })

      const saveEvent = { sender: sourceSender, returnValue: null }
      ipcMain.listeners.get('save-app-state')(saveEvent, { serializedState: '{"theme":"dawn"}', baseRevision: 0 })

      expect(saveEvent.returnValue).toEqual({
        ok: true,
        serializedState: '{"theme":"dawn"}',
        revision: 1,
      })
      expect(sourceWindow.webContents.send).not.toHaveBeenCalled()
      expect(otherWindow.webContents.send).toHaveBeenCalledWith('app-state-updated', {
        serializedState: '{"theme":"dawn"}',
        revision: 1,
      })
    }))
})
