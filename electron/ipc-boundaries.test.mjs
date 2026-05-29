import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import { registerClipboardIpc } from './ipc-clipboard.mjs'
import { registerFileIpc } from './ipc-files.mjs'
import { registerStorageIpc } from './ipc-storage.mjs'
import { registerUpdateIpc } from './ipc-updates.mjs'
import { buildAppStateExportArchive, loadAppStateResult, saveAppState } from './app-state-storage.mjs'
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

async function withTempUserDataPathAsync(run) {
  const userDataPath = mkdtempSync(path.join(os.tmpdir(), 'tabs-ipc-user-data-'))
  try {
    return await run(userDataPath)
  } finally {
    rmSync(userDataPath, { recursive: true, force: true })
  }
}

async function writeZipArchive(filePath, entries) {
  const zip = new JSZip()
  Object.entries(entries).forEach(([entryPath, contents]) => {
    zip.file(entryPath, contents)
  })
  writeFileSync(filePath, await zip.generateAsync({ type: 'nodebuffer' }))
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

  it('saves user settings json files', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const settingsPath = path.join(userDataPath, 'app-settings.json')
      const ipcMain = createIpcMain()
      registerFileIpc({
        ipcMain,
        dialog: {
          showSaveDialog: vi.fn(async () => ({ canceled: false, filePath: settingsPath })),
        },
      })

      await expect(
        ipcMain.handlers.get('save-user-settings-file')(null, {
          defaultPath: 'app-settings.json',
          contents: '{"theme":"light"}\n',
        }),
      ).resolves.toEqual({ canceled: false, filePath: settingsPath })
      expect(readFileSync(settingsPath, 'utf8')).toBe('{"theme":"light"}\n')
    }))

  it('rejects invalid user settings save payloads and handles open cancelation', async () => {
    const ipcMain = createIpcMain()
    registerFileIpc({
      ipcMain,
      dialog: {
        showSaveDialog: vi.fn(),
        showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
      },
    })

    await expect(ipcMain.handlers.get('save-user-settings-file')(null, { contents: 42 })).resolves.toEqual({
      canceled: true,
      error: 'Invalid payload',
    })
    await expect(ipcMain.handlers.get('open-user-settings-file')()).resolves.toEqual({ canceled: true })
  })

  it('opens user settings json files with extension and size validation', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const settingsPath = path.join(userDataPath, 'app-settings.json')
      const textPath = path.join(userDataPath, 'app-settings.txt')
      const hugePath = path.join(userDataPath, 'huge.json')
      writeFileSync(settingsPath, '{"theme":"light"}\n', 'utf8')
      writeFileSync(textPath, '{"theme":"light"}\n', 'utf8')
      writeFileSync(hugePath, 'x'.repeat(1024 * 1024 + 1), 'utf8')
      const showOpenDialog = vi
        .fn()
        .mockResolvedValueOnce({ canceled: false, filePaths: [settingsPath] })
        .mockResolvedValueOnce({ canceled: false, filePaths: [textPath] })
        .mockResolvedValueOnce({ canceled: false, filePaths: [hugePath] })
      const ipcMain = createIpcMain()
      registerFileIpc({
        ipcMain,
        dialog: {
          showOpenDialog,
        },
      })
      const handler = ipcMain.handlers.get('open-user-settings-file')

      await expect(handler()).resolves.toEqual({
        canceled: false,
        ok: true,
        contents: '{"theme":"light"}\n',
        filePath: settingsPath,
      })
      await expect(handler()).resolves.toMatchObject({
        canceled: false,
        ok: false,
        error: 'User settings file must be a .json file.',
      })
      await expect(handler()).resolves.toMatchObject({
        canceled: false,
        ok: false,
        error: 'User settings file is too large.',
      })
    }))

  it('returns canceled when backup import dialog is canceled', async () => {
    const ipcMain = createIpcMain()
    registerFileIpc({
      ipcMain,
      dialog: {
        showSaveDialog: vi.fn(),
        showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
      },
    })

    await expect(ipcMain.handlers.get('import-app-state-archive')()).resolves.toEqual({ canceled: true })
  })

  it('returns canceled when notebook archive dialog is canceled', async () => {
    const ipcMain = createIpcMain()
    registerFileIpc({
      ipcMain,
      dialog: {
        showSaveDialog: vi.fn(),
        showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
      },
    })

    await expect(ipcMain.handlers.get('open-notebook-archive')()).resolves.toEqual({ canceled: true })
  })

  it('opens notebook archive bytes without parsing or mutating storage', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const archivePath = path.join(userDataPath, 'notebook.zip')
      writeFileSync(archivePath, Buffer.from([80, 75, 3, 4]))
      const ipcMain = createIpcMain()
      registerFileIpc({
        ipcMain,
        dialog: {
          showSaveDialog: vi.fn(),
          showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [archivePath] })),
        },
      })

      const result = await ipcMain.handlers.get('open-notebook-archive')()
      expect(result).toMatchObject({ canceled: false, ok: true, filePath: archivePath })
      expect(Buffer.from(result.bytes)).toEqual(Buffer.from([80, 75, 3, 4]))
      expect(loadAppStateResult(userDataPath).source).toBe('empty')
    }))

  it('rejects invalid backup import zips', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const archivePath = path.join(userDataPath, 'bad.zip')
      writeFileSync(archivePath, 'not a zip', 'utf8')
      const ipcMain = createIpcMain()
      registerFileIpc({
        ipcMain,
        dialog: {
          showSaveDialog: vi.fn(),
          showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [archivePath] })),
        },
      })

      await expect(ipcMain.handlers.get('import-app-state-archive')()).resolves.toMatchObject({
        canceled: false,
        ok: false,
        issues: [expect.objectContaining({ code: 'invalid-archive', severity: 'error' })],
      })
    }))

  it('rejects backup import archives with path traversal entries', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const archivePath = path.join(userDataPath, 'traversal.zip')
      await writeZipArchive(archivePath, {
        'notes/manifest.json': JSON.stringify({ schemaVersion: 1, files: {} }),
        '../outside.txt': 'bad',
      })
      const ipcMain = createIpcMain()
      registerFileIpc({
        ipcMain,
        dialog: {
          showSaveDialog: vi.fn(),
          showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [archivePath] })),
        },
      })

      await expect(ipcMain.handlers.get('import-app-state-archive')()).resolves.toMatchObject({
        canceled: false,
        ok: false,
        issues: [expect.objectContaining({ code: 'unsafe-archive-entry', severity: 'error' })],
      })
    }))

  it('rejects backup import archives missing notes/manifest.json', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const archivePath = path.join(userDataPath, 'missing-manifest.zip')
      await writeZipArchive(archivePath, { 'notes/readme.txt': 'missing' })
      const ipcMain = createIpcMain()
      registerFileIpc({
        ipcMain,
        dialog: {
          showSaveDialog: vi.fn(),
          showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [archivePath] })),
        },
      })

      await expect(ipcMain.handlers.get('import-app-state-archive')()).resolves.toMatchObject({
        canceled: false,
        ok: false,
        issues: [expect.objectContaining({ code: 'missing-root-manifest', severity: 'error' })],
      })
    }))

  it('rejects backup import archives with unsupported schemas', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const archivePath = path.join(userDataPath, 'unsupported.zip')
      await writeZipArchive(archivePath, {
        'notes/manifest.json': JSON.stringify({ schemaVersion: 999, files: {} }),
      })
      const ipcMain = createIpcMain()
      registerFileIpc({
        ipcMain,
        dialog: {
          showSaveDialog: vi.fn(),
          showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [archivePath] })),
        },
      })

      await expect(ipcMain.handlers.get('import-app-state-archive')()).resolves.toMatchObject({
        canceled: false,
        ok: false,
        issues: [expect.objectContaining({ code: 'unsupported-root-manifest', severity: 'error' })],
      })
    }))

  it('loads valid backup import archives without mutating the current profile', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const archivePath = path.join(userDataPath, 'backup.zip')
      const archiveBytes = await buildAppStateExportArchive(serializedAppState('light'))
      const zip = await JSZip.loadAsync(archiveBytes)
      expect(zip.file('settings/app-settings.json')).not.toBeNull()
      expect(zip.file('notes/app-settings.json')).toBeNull()
      writeFileSync(archivePath, archiveBytes)
      const ipcMain = createIpcMain()
      registerFileIpc({
        ipcMain,
        dialog: {
          showSaveDialog: vi.fn(),
          showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [archivePath] })),
        },
      })

      await expect(ipcMain.handlers.get('import-app-state-archive')()).resolves.toMatchObject({
        canceled: false,
        ok: true,
        serializedState: expect.stringContaining('"light"'),
      })
      expect(loadAppStateResult(userDataPath).source).toBe('empty')
    }))

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
      const root = path.join(userDataPath, 'notes')
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

  it('handles async app-state saves and broadcasts them to other windows', async () =>
    withTempUserDataPath(async (userDataPath) => {
      const ipcMain = createIpcMain()
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

      await expect(
        ipcMain.handlers.get('save-app-state-async')(
          { sender: { id: 1 } },
          { serializedState: '{"theme":"dawn"}', baseRevision: 0, snapshotMode: 'skip' },
        ),
      ).resolves.toEqual({
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
        notesPath: path.join(userDataPath, 'notes'),
        isDefault: true,
        canWrite: true,
        source: 'empty',
      })
    }))

  it('imports, reads, and opens generic assets through storage ipc', async () => {
    const userDataPath = mkdtempSync(path.join(os.tmpdir(), 'tabs-ipc-user-data-'))
    try {
      const ipcMain = createIpcMain()
      const shell = { openPath: vi.fn(async () => '') }
      registerStorageIpc({
        ipcMain,
        app: { getPath: () => userDataPath },
        BrowserWindow: createBrowserWindow(),
        shell,
      })

      const imported = await ipcMain.handlers.get('import-asset')(null, {
        bytes: new Uint8Array([1, 2, 3]).buffer,
        name: 'recording.mp4',
        type: 'video/mp4',
      })

      expect(imported).toMatchObject({
        ok: true,
        assetPath: expect.stringMatching(/^assets\/asset-[a-f0-9]+\.mp4$/),
        url: expect.stringMatching(/^tabs-asset:\/\/\/assets\/asset-[a-f0-9]+\.mp4$/),
      })
      expect(readFileSync(path.join(userDataPath, 'notes', imported.assetPath))).toEqual(Buffer.from([1, 2, 3]))

      await expect(ipcMain.handlers.get('read-asset')(null, { url: imported.url })).resolves.toMatchObject({
        ok: true,
        bytes: expect.any(ArrayBuffer),
      })
      const readResult = await ipcMain.handlers.get('read-asset')(null, { assetPath: imported.assetPath })
      expect(readResult.ok).toBe(true)
      expect(Buffer.from(readResult.bytes)).toEqual(Buffer.from([1, 2, 3]))

      await expect(ipcMain.handlers.get('open-asset')(null, { url: imported.url })).resolves.toEqual({ ok: true })
      expect(shell.openPath).toHaveBeenCalledWith(path.join(userDataPath, 'notes', imported.assetPath))
    } finally {
      rmSync(userDataPath, { recursive: true, force: true })
    }
  })

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

  it('uses the renderer app-state snapshot when choosing a folder after the current profile failed to load', async () =>
    withTempUserDataPath(async (userDataPath) => {
      const targetRoot = mkdtempSync(path.join(os.tmpdir(), 'tabs-sync-target-'))
      try {
        mkdirSync(path.join(userDataPath, 'notes'), { recursive: true })
        writeFileSync(
          path.join(userDataPath, 'notes', 'manifest.json'),
          `${JSON.stringify({ schemaVersion: 3, files: {} }, null, 2)}\n`,
          'utf8',
        )

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

        const sender = {
          id: 1,
          executeJavaScript: vi.fn(async () => serializedAppState('light')),
        }

        await expect(ipcMain.handlers.get('choose-storage-folder')({ sender })).resolves.toMatchObject({
          ok: true,
          status: {
            status: 'ready',
            profileRootPath: targetRoot,
            isDefault: false,
          },
        })

        const targetResult = loadAppStateResult(targetRoot)
        expect(targetResult.ok).toBe(true)
        expect(JSON.parse(targetResult.serializedState).theme).toBe('light')
        expect(sender.executeJavaScript).toHaveBeenCalledWith(expect.stringContaining('__tabsGetLatestAppState'), true)
      } finally {
        rmSync(targetRoot, { recursive: true, force: true })
      }
    }))

  it('keeps move blocked when neither storage nor renderer has current app state', async () =>
    withTempUserDataPath(async (userDataPath) => {
      const targetRoot = mkdtempSync(path.join(os.tmpdir(), 'tabs-sync-target-'))
      try {
        mkdirSync(path.join(userDataPath, 'notes'), { recursive: true })
        writeFileSync(
          path.join(userDataPath, 'notes', 'manifest.json'),
          `${JSON.stringify({ schemaVersion: 3, files: {} }, null, 2)}\n`,
          'utf8',
        )

        const ipcMain = createIpcMain()
        registerStorageIpc({
          ipcMain,
          app: { getPath: () => userDataPath },
          BrowserWindow: createBrowserWindow(),
          dialog: {
            showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [targetRoot] })),
          },
        })

        await expect(ipcMain.handlers.get('move-storage-profile')()).resolves.toMatchObject({
          ok: false,
          error: 'Current app state is not ready to move.',
        })
        expect(loadAppStateResult(targetRoot).source).toBe('empty')
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

  it('ignores cloud-style echoes of recent app-owned saves without broadcasting app state', () =>
    withTempUserDataPath((userDataPath) => {
      vi.useFakeTimers()
      vi.setSystemTime(1_000)
      const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
      const window = {
        isDestroyed: vi.fn(() => false),
        webContents: { id: 2, send: vi.fn() },
      }
      const ipcMain = createIpcMain()
      const storageSession = registerStorageIpc({
        ipcMain,
        app: { getPath: () => userDataPath },
        BrowserWindow: createBrowserWindow([window]),
      })

      try {
        const firstSave = { sender: { id: 1 }, returnValue: null }
        ipcMain.listeners.get('save-app-state')(firstSave, {
          serializedState: serializedAppState('dawn'),
          baseRevision: 0,
        })
        const secondSave = { sender: { id: 1 }, returnValue: null }
        ipcMain.listeners.get('save-app-state')(secondSave, {
          serializedState: serializedAppState('light'),
          baseRevision: 1,
        })
        window.webContents.send.mockClear()

        vi.setSystemTime(10_000)
        saveAppState(userDataPath, serializedAppState('dawn'))
        storageSession.scanStorageProfile()
        vi.advanceTimersByTime(400)

        expect(window.webContents.send).toHaveBeenCalledWith(
          'storage-profile-status-updated',
          expect.objectContaining({
            event: 'external-echo-ignored',
            revision: 2,
          }),
        )
        expect(window.webContents.send).not.toHaveBeenCalledWith('app-state-updated', expect.anything())
        expect(consoleInfoSpy).toHaveBeenCalledWith('[tabs:storage] external-echo-ignored')
      } finally {
        storageSession.close()
        consoleInfoSpy.mockRestore()
        vi.useRealTimers()
      }
    }))

  it('restores the latest recovery snapshot through storage IPC', async () =>
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

      const firstSaveEvent = { sender: { id: 1 }, returnValue: null }
      ipcMain.listeners.get('save-app-state')(firstSaveEvent, {
        serializedState: serializedAppState('dawn'),
        baseRevision: 0,
      })
      const secondSaveEvent = { sender: { id: 1 }, returnValue: null }
      ipcMain.listeners.get('save-app-state')(secondSaveEvent, {
        serializedState: serializedAppState('light'),
        baseRevision: 1,
      })
      window.webContents.send.mockClear()

      await expect(ipcMain.handlers.get('restore-storage-recovery-snapshot')()).resolves.toMatchObject({
        ok: true,
        status: {
          status: 'ready',
          event: 'recovery-restored',
          recoverySnapshotCount: expect.any(Number),
        },
      })
      expect(window.webContents.send).toHaveBeenCalledWith('app-state-updated', {
        serializedState: expect.stringContaining('"dawn"'),
        revision: 3,
      })
    }))
})
