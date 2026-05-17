import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { registerClipboardIpc } from './ipc-clipboard.mjs'
import { registerFileIpc } from './ipc-files.mjs'
import { registerStorageIpc } from './ipc-storage.mjs'
import { registerUpdateIpc } from './ipc-updates.mjs'
import { loadAppStateResult, saveAppState } from './app-state-storage.mjs'
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

function serializedAppState(theme = 'dawn') {
  const space = {
    id: 'space-1',
    name: 'Space',
    settings: { autoRemoveDeletedDays: 7 },
    data: {
      activeTabId: 'tab-1',
      tabs: [
        {
          id: 'tab-1',
          title: 'Tab',
          noteBodyId: 'body-1',
          homeContent: 'hello',
          activeSubTabId: null,
          subTabs: [],
        },
      ],
      deletedTabs: [],
      deletedSubTabs: [],
    },
  }

  return JSON.stringify({
    theme,
    activeDomainId: 'domain-1',
    domains: [
      {
        id: 'domain-1',
        name: 'Domain',
        activeSpaceId: space.id,
        spaces: [space],
      },
    ],
    noteBodies: [{ id: 'body-1', aisles: [{ id: 'aisle-1', markdown: 'hello' }] }],
    activeSpaceId: space.id,
    spaces: [space],
  })
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
      expect(sourceWindow.webContents.send).not.toHaveBeenCalledWith('app-state-updated', expect.anything())
      expect(otherWindow.webContents.send).toHaveBeenCalledWith('app-state-updated', {
        serializedState: '{"theme":"dawn"}',
        revision: 1,
      })
    }))

  it('reports the default storage profile status', async () =>
    withTempUserDataPath(async (userDataPath) => {
      const ipcMain = createIpcMain()
      registerStorageIpc({
        ipcMain,
        app: { getPath: () => userDataPath },
        BrowserWindow: createBrowserWindow(),
      })

      await expect(ipcMain.handlers.get('get-storage-profile-status')()).resolves.toMatchObject({
        status: 'ready',
        profileRootPath: userDataPath,
        notesDataPath: path.join(userDataPath, 'notes-data'),
        isDefault: true,
        canWrite: true,
        source: 'empty',
      })
    }))

  it('moves current app data into a chosen sync folder without deleting the source profile', async () =>
    withTempUserDataPath(async (userDataPath) => {
      const targetRoot = mkdtempSync(path.join(os.tmpdir(), 'tabs-sync-target-'))
      try {
        const ipcMain = createIpcMain()
        registerStorageIpc({
          ipcMain,
          app: { getPath: () => userDataPath },
          BrowserWindow: createBrowserWindow(),
          dialog: {
            showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [targetRoot] })),
            showMessageBox: vi.fn(async () => ({ response: 0 })),
          },
        })

        const saveEvent = { returnValue: null }
        ipcMain.listeners.get('save-app-state')(saveEvent, { serializedState: serializedAppState('dawn'), baseRevision: 0 })

        await expect(ipcMain.handlers.get('move-storage-profile')()).resolves.toMatchObject({
          ok: true,
          status: {
            profileRootPath: targetRoot,
            isDefault: false,
          },
        })

        expect(loadAppStateResult(userDataPath).ok).toBe(true)
        expect(loadAppStateResult(targetRoot).ok).toBe(true)
      } finally {
        rmSync(targetRoot, { recursive: true, force: true })
      }
    }))

  it('reloads valid external profile changes and broadcasts them to windows on retry', async () =>
    withTempUserDataPath(async (userDataPath) => {
      const window = {
        isDestroyed: vi.fn(() => false),
        webContents: { id: 2, send: vi.fn() },
      }
      const ipcMain = createIpcMain()
      registerStorageIpc({
        ipcMain,
        app: { getPath: () => userDataPath },
        BrowserWindow: createBrowserWindow([window]),
      })

      const saveEvent = { sender: { id: 1 }, returnValue: null }
      ipcMain.listeners.get('save-app-state')(saveEvent, { serializedState: serializedAppState('dawn'), baseRevision: 0 })
      saveAppState(userDataPath, serializedAppState('light'))

      await expect(ipcMain.handlers.get('retry-storage-profile')()).resolves.toMatchObject({
        ok: true,
        status: {
          status: 'ready',
          event: 'retry-loaded',
        },
      })
      expect(window.webContents.send).toHaveBeenCalledWith('app-state-updated', {
        serializedState: expect.stringContaining('"light"'),
        revision: 2,
      })
    }))

  it('does not broadcast unchanged profile reloads on retry', async () =>
    withTempUserDataPath(async (userDataPath) => {
      const window = {
        isDestroyed: vi.fn(() => false),
        webContents: { id: 2, send: vi.fn() },
      }
      const ipcMain = createIpcMain()
      registerStorageIpc({
        ipcMain,
        app: { getPath: () => userDataPath },
        BrowserWindow: createBrowserWindow([window]),
      })

      const saveEvent = { sender: { id: 1 }, returnValue: null }
      ipcMain.listeners.get('save-app-state')(saveEvent, { serializedState: serializedAppState('dawn'), baseRevision: 0 })
      window.webContents.send.mockClear()

      await expect(ipcMain.handlers.get('retry-storage-profile')()).resolves.toMatchObject({
        ok: true,
        status: {
          status: 'ready',
          event: 'retry-loaded',
          revision: 1,
        },
      })
      expect(window.webContents.send).not.toHaveBeenCalledWith('app-state-updated', expect.anything())
    }))
})
