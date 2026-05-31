import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
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

  it('opens user settings from notebook folders with validation', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const missingFolder = path.join(userDataPath, 'missing-settings')
      const corruptFolder = path.join(userDataPath, 'corrupt-settings')
      const validFolder = path.join(userDataPath, 'valid-settings')
      const corruptSettingsPath = path.join(corruptFolder, 'settings', 'app-settings.json')
      const validSettingsPath = path.join(validFolder, 'settings', 'app-settings.json')
      const validSettings = `${JSON.stringify({
        theme: 'dawn',
        hotkeys: { shortcuts: {} },
        ui: {
          settingsSection: 'data',
          dataSettingsSection: 'settings',
        },
      }, null, 2)}\n`
      mkdirSync(missingFolder, { recursive: true })
      mkdirSync(path.dirname(corruptSettingsPath), { recursive: true })
      mkdirSync(path.dirname(validSettingsPath), { recursive: true })
      writeFileSync(corruptSettingsPath, '{', 'utf8')
      writeFileSync(validSettingsPath, validSettings, 'utf8')

      const showOpenDialog = vi
        .fn()
        .mockResolvedValueOnce({ canceled: true, filePaths: [] })
        .mockResolvedValueOnce({ canceled: false, filePaths: [missingFolder] })
        .mockResolvedValueOnce({ canceled: false, filePaths: [corruptFolder] })
        .mockResolvedValueOnce({ canceled: false, filePaths: [validFolder] })
      const ipcMain = createIpcMain()
      registerFileIpc({
        ipcMain,
        dialog: { showOpenDialog },
      })
      const handler = ipcMain.handlers.get('open-user-settings-from-notebook-folder')

      await expect(handler()).resolves.toEqual({ canceled: true })
      await expect(handler()).resolves.toMatchObject({
        canceled: false,
        ok: false,
        error: 'Notebook folder does not contain settings/app-settings.json.',
      })
      await expect(handler()).resolves.toMatchObject({
        canceled: false,
        ok: false,
        error: 'User settings file does not match app-settings.json structure.',
      })
      await expect(handler()).resolves.toEqual({
        canceled: false,
        ok: true,
        contents: validSettings,
        filePath: validSettingsPath,
      })
      expect(showOpenDialog).toHaveBeenCalledWith({
        title: 'Import user settings from notebook folder',
        properties: ['openDirectory'],
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

  it('returns canceled when notebook import source dialog is canceled', async () => {
    const ipcMain = createIpcMain()
    registerFileIpc({
      ipcMain,
      dialog: {
        showSaveDialog: vi.fn(),
        showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
      },
    })

    await expect(ipcMain.handlers.get('open-notebook-import-source')()).resolves.toEqual({ canceled: true })
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

      const result = await ipcMain.handlers.get('open-notebook-import-source')()
      expect(result).toMatchObject({ canceled: false, ok: true, kind: 'zip', filePath: archivePath })
      expect(Buffer.from(result.bytes)).toEqual(Buffer.from([80, 75, 3, 4]))
      expect(loadAppStateResult(userDataPath).source).toBe('empty')
    }))

  it('classifies unified notebook import sources', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const archivePath = path.join(userDataPath, 'notebook.zip')
      const notebookRoot = path.join(userDataPath, 'source-notebook')
      const markdownRoot = path.join(userDataPath, 'markdown-import')
      const homePath = path.join(markdownRoot, 'Domain', 'Space', 'Parent', 'home.md')
      writeFileSync(archivePath, Buffer.from([80, 75, 3, 4]))
      saveAppState(notebookRoot, serializedAppState(), { userDataPath })
      mkdirSync(path.dirname(homePath), { recursive: true })
      writeFileSync(homePath, '# Home', 'utf8')
      const showOpenDialog = vi
        .fn()
        .mockResolvedValueOnce({ canceled: false, filePaths: [archivePath] })
        .mockResolvedValueOnce({ canceled: false, filePaths: [notebookRoot] })
        .mockResolvedValueOnce({ canceled: false, filePaths: [markdownRoot] })
      const ipcMain = createIpcMain()
      registerFileIpc({
        ipcMain,
        dialog: { showOpenDialog },
      })
      const handler = ipcMain.handlers.get('open-notebook-import-source')

      const zipResult = await handler()
      expect(zipResult).toMatchObject({ canceled: false, ok: true, kind: 'zip', filePath: archivePath })
      expect(Buffer.from(zipResult.bytes)).toEqual(Buffer.from([80, 75, 3, 4]))

      await expect(handler()).resolves.toMatchObject({
        canceled: false,
        ok: true,
        kind: 'notebook-folder',
        folderPath: notebookRoot,
        serializedState: expect.any(String),
      })

      await expect(handler()).resolves.toMatchObject({
        canceled: false,
        ok: true,
        kind: 'markdown-folder',
        folderPath: markdownRoot,
        files: [{ relativePath: 'Domain/Space/Parent/home.md', markdown: '# Home' }],
      })
    }))

  it('opens existing notebook folders for non-mutating import and scopes asset reads', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const sourceRoot = path.join(userDataPath, 'source-notebook')
      saveAppState(sourceRoot, serializedAppState(), { userDataPath })
      const assetPath = path.join(sourceRoot, 'notes', 'assets', 'source.txt')
      mkdirSync(path.dirname(assetPath), { recursive: true })
      writeFileSync(assetPath, 'asset bytes', 'utf8')
      const ipcMain = createIpcMain()
      registerFileIpc({
        ipcMain,
        dialog: {
          showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [sourceRoot] })),
        },
      })

      const result = await ipcMain.handlers.get('open-notebook-import-source')()
      expect(result).toMatchObject({
        canceled: false,
        ok: true,
        kind: 'notebook-folder',
        folderPath: sourceRoot,
      })
      expect(typeof result.sourceId).toBe('string')
      expect(typeof result.serializedState).toBe('string')
      expect(loadAppStateResult(userDataPath).source).toBe('empty')

      const assetResult = await ipcMain.handlers.get('read-folder-import-asset')(null, {
        sourceId: result.sourceId,
        relativePath: 'assets/source.txt',
      })
      expect(assetResult).toMatchObject({
        ok: true,
        fileName: 'source.txt',
        mimeType: 'application/octet-stream',
      })
      expect(Buffer.from(assetResult.bytes).toString('utf8')).toBe('asset bytes')

      await expect(
        ipcMain.handlers.get('read-folder-import-asset')(null, {
          sourceId: result.sourceId,
          relativePath: '../source.txt',
        }),
      ).resolves.toMatchObject({ ok: false, error: 'Invalid import asset path.' })
    }))

  it('rejects import folders without readable notebook or Markdown content', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const sourceRoot = path.join(userDataPath, 'not-a-notebook')
      mkdirSync(sourceRoot, { recursive: true })
      const ipcMain = createIpcMain()
      registerFileIpc({
        ipcMain,
        dialog: {
          showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [sourceRoot] })),
        },
      })

      await expect(ipcMain.handlers.get('open-notebook-import-source')()).resolves.toMatchObject({
        canceled: false,
        ok: false,
        error: 'Folder does not contain Markdown files.',
      })
    }))

  it('opens markdown folder imports and rejects symlinks', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const markdownRoot = path.join(userDataPath, 'markdown-import')
      const homePath = path.join(markdownRoot, 'Domain', 'Space', 'Parent', 'home.md')
      const assetPath = path.join(markdownRoot, 'Domain', 'Space', 'Parent', 'image.png')
      mkdirSync(path.dirname(homePath), { recursive: true })
      writeFileSync(homePath, '# Home', 'utf8')
      writeFileSync(assetPath, Buffer.from([1, 2, 3]))
      const ipcMain = createIpcMain()
      registerFileIpc({
        ipcMain,
        dialog: {
          showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [markdownRoot] })),
        },
      })

      const result = await ipcMain.handlers.get('open-notebook-import-source')()
      expect(result).toMatchObject({
        canceled: false,
        ok: true,
        kind: 'markdown-folder',
        folderPath: markdownRoot,
        files: [{ relativePath: 'Domain/Space/Parent/home.md', markdown: '# Home' }],
      })

      const assetResult = await ipcMain.handlers.get('read-folder-import-asset')(null, {
        sourceId: result.sourceId,
        relativePath: 'Domain/Space/Parent/image.png',
      })
      expect(assetResult).toMatchObject({ ok: true, fileName: 'image.png', mimeType: 'image/png' })
      expect(Buffer.from(assetResult.bytes)).toEqual(Buffer.from([1, 2, 3]))

      const symlinkRoot = path.join(userDataPath, 'symlink-import')
      mkdirSync(symlinkRoot, { recursive: true })
      writeFileSync(path.join(userDataPath, 'outside.md'), '# Outside', 'utf8')
      let symlinkCreated = false
      try {
        symlinkSync(path.join(userDataPath, 'outside.md'), path.join(symlinkRoot, 'linked.md'))
        symlinkCreated = true
      } catch {
        symlinkCreated = false
      }
      if (symlinkCreated) {
        const symlinkIpcMain = createIpcMain()
        registerFileIpc({
          ipcMain: symlinkIpcMain,
          dialog: {
            showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [symlinkRoot] })),
          },
        })

        await expect(symlinkIpcMain.handlers.get('open-notebook-import-source')()).resolves.toMatchObject({
          canceled: false,
          ok: false,
          error: expect.stringContaining('does not allow symlinks'),
        })
      }
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
      await expect(ipcMain.handlers.get('get-user-settings-location-status')()).resolves.toMatchObject({
        status: 'ready',
        settingsRootPath: userDataPath,
        settingsPath: path.join(userDataPath, 'settings', 'app-settings.json'),
        localSettingsPath: path.join(userDataPath, 'settings', 'app-settings.json'),
        isDefault: true,
        syncStatus: 'local',
      })
      await expect(ipcMain.handlers.get('get-notebook-backup-status')()).resolves.toMatchObject({
        status: 'disabled',
        enabled: false,
        destinationRootPath: null,
        managedFolderPath: null,
      })
    }))

  it('chooses, writes, reveals, and resets notebook backup folders', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const destinationRoot = mkdtempSync(path.join(os.tmpdir(), 'tabs-notebook-backups-'))
      const shell = { openPath: vi.fn(async () => '') }
      try {
        const ipcMain = createIpcMain()
        registerStorageIpc({
          ipcMain,
          app: { getPath: () => userDataPath },
          BrowserWindow: createBrowserWindow(),
          shell,
          dialog: {
            showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [destinationRoot] })),
          },
        })

        await expect(ipcMain.handlers.get('choose-notebook-backup-folder')()).resolves.toMatchObject({
          ok: true,
          status: {
            enabled: true,
            destinationRootPath: destinationRoot,
          },
        })
        const backupBytes = Buffer.from('notebook zip')
        await expect(
          ipcMain.handlers.get('run-notebook-backup-now')(null, {
            data: backupBytes.buffer.slice(backupBytes.byteOffset, backupBytes.byteOffset + backupBytes.byteLength),
            trigger: 'manual',
          }),
        ).resolves.toMatchObject({
          ok: true,
          status: {
            enabled: true,
            status: 'ready',
          },
        })
        const backupStatus = await ipcMain.handlers.get('get-notebook-backup-status')()
        expect(readFileSync(backupStatus.lastBackupPath, 'utf8')).toBe('notebook zip')

        await expect(ipcMain.handlers.get('reveal-notebook-backup-folder')()).resolves.toEqual({ ok: true })
        expect(shell.openPath).toHaveBeenCalledWith(backupStatus.managedFolderPath)

        await expect(ipcMain.handlers.get('reset-notebook-backup-folder')()).resolves.toMatchObject({
          ok: true,
          status: {
            enabled: false,
            status: 'disabled',
          },
        })
      } finally {
        rmSync(destinationRoot, { recursive: true, force: true })
      }
    }))

  it('handles canceled and rejected notebook backup folder selection', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const ipcMain = createIpcMain()
      const showOpenDialog = vi
        .fn()
        .mockResolvedValueOnce({ canceled: true, filePaths: [] })
        .mockResolvedValueOnce({ canceled: false, filePaths: [userDataPath] })
        .mockResolvedValueOnce({ canceled: false, filePaths: [path.join(userDataPath, 'notes', 'backups')] })
      registerStorageIpc({
        ipcMain,
        app: { getPath: () => userDataPath },
        BrowserWindow: createBrowserWindow(),
        dialog: { showOpenDialog },
      })

      await expect(ipcMain.handlers.get('choose-notebook-backup-folder')()).resolves.toMatchObject({
        canceled: true,
      })
      await expect(ipcMain.handlers.get('choose-notebook-backup-folder')()).resolves.toMatchObject({
        ok: false,
        error: 'The active notebook folder cannot be used as its backup folder. Choose a different folder.',
      })
      await expect(ipcMain.handlers.get('choose-notebook-backup-folder')()).resolves.toMatchObject({
        ok: false,
        error: 'Backup folders cannot be inside the active notes folder. Choose a different folder.',
      })
    }))

  it('rejects notebook folders as live user settings folders', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const otherNotebookRoot = mkdtempSync(path.join(os.tmpdir(), 'tabs-settings-notebook-'))
      try {
        mkdirSync(path.join(otherNotebookRoot, 'notes'), { recursive: true })
        writeFileSync(path.join(otherNotebookRoot, 'notes', 'manifest.json'), '{"schemaVersion":1}', 'utf8')
        const showOpenDialog = vi
          .fn()
          .mockResolvedValueOnce({ canceled: false, filePaths: [userDataPath] })
          .mockResolvedValueOnce({ canceled: false, filePaths: [otherNotebookRoot] })
        const ipcMain = createIpcMain()
        registerStorageIpc({
          ipcMain,
          app: { getPath: () => userDataPath },
          BrowserWindow: createBrowserWindow(),
          dialog: { showOpenDialog },
        })

        await expect(ipcMain.handlers.get('choose-user-settings-folder')()).resolves.toMatchObject({
          ok: false,
          error: 'Notebook folders cannot be used as the live settings folder. Choose a different folder.',
        })
        await expect(ipcMain.handlers.get('choose-user-settings-folder')()).resolves.toMatchObject({
          ok: false,
          error: 'This folder contains a notebook. Choose a folder that only stores user settings.',
        })
      } finally {
        rmSync(otherNotebookRoot, { recursive: true, force: true })
      }
    }))

  it('initializes an empty live user settings folder from current settings', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const settingsRoot = mkdtempSync(path.join(os.tmpdir(), 'tabs-live-settings-'))
      try {
        const ipcMain = createIpcMain()
        registerStorageIpc({
          ipcMain,
          app: { getPath: () => userDataPath },
          BrowserWindow: createBrowserWindow(),
          dialog: {
            showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [settingsRoot] })),
          },
        })

        const saveEvent = { sender: { id: 1 }, returnValue: null }
        ipcMain.listeners.get('save-app-state')(saveEvent, { serializedState: serializedAppState('blues'), baseRevision: 0 })

        await expect(ipcMain.handlers.get('choose-user-settings-folder')()).resolves.toMatchObject({
          ok: true,
          status: {
            settingsRootPath: settingsRoot,
            isDefault: false,
            syncStatus: 'synced',
          },
        })
        expect(JSON.parse(readFileSync(path.join(settingsRoot, 'settings', 'app-settings.json'), 'utf8')).theme).toBe('blues')
        expect(JSON.parse(readFileSync(path.join(userDataPath, 'settings', 'app-settings.json'), 'utf8')).theme).toBe('blues')
      } finally {
        rmSync(settingsRoot, { recursive: true, force: true })
      }
    }))

  it('applies valid live user settings after confirmation', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const settingsRoot = mkdtempSync(path.join(os.tmpdir(), 'tabs-live-settings-'))
      try {
        saveAppState(settingsRoot, serializedAppState('light'))
        rmSync(path.join(settingsRoot, 'notes'), { recursive: true, force: true })
        const window = {
          isDestroyed: vi.fn(() => false),
          webContents: { id: 2, send: vi.fn() },
        }
        const ipcMain = createIpcMain()
        registerStorageIpc({
          ipcMain,
          app: { getPath: () => userDataPath },
          BrowserWindow: createBrowserWindow([window]),
          dialog: {
            showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [settingsRoot] })),
            showMessageBox: vi.fn(async () => ({ response: 0 })),
          },
        })

        const saveEvent = { sender: { id: 1 }, returnValue: null }
        ipcMain.listeners.get('save-app-state')(saveEvent, { serializedState: serializedAppState('dawn'), baseRevision: 0 })
        window.webContents.send.mockClear()

        await expect(ipcMain.handlers.get('choose-user-settings-folder')()).resolves.toMatchObject({
          ok: true,
          status: {
            settingsRootPath: settingsRoot,
            syncStatus: 'synced',
          },
        })
        expect(JSON.parse(readFileSync(path.join(userDataPath, 'settings', 'app-settings.json'), 'utf8')).theme).toBe('light')
        const updateCall = window.webContents.send.mock.calls.find(([channel]) => channel === 'app-state-updated')
        expect(updateCall).toBeDefined()
        expect(JSON.parse(updateCall[1].serializedState).theme).toBe('light')
      } finally {
        rmSync(settingsRoot, { recursive: true, force: true })
      }
    }))

  it('rejects invalid live user settings folders', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const settingsRoot = mkdtempSync(path.join(os.tmpdir(), 'tabs-invalid-settings-'))
      try {
        mkdirSync(path.join(settingsRoot, 'settings'), { recursive: true })
        writeFileSync(path.join(settingsRoot, 'settings', 'app-settings.json'), '{"theme":"dawn"}\n', 'utf8')
        const ipcMain = createIpcMain()
        registerStorageIpc({
          ipcMain,
          app: { getPath: () => userDataPath },
          BrowserWindow: createBrowserWindow(),
          dialog: {
            showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [settingsRoot] })),
          },
        })

        await expect(ipcMain.handlers.get('choose-user-settings-folder')()).resolves.toMatchObject({
          ok: false,
          error: "The folder selected doesn't contain an app-settings.json file that matches this project's structure.",
          status: {
            status: 'error',
          },
        })
      } finally {
        rmSync(settingsRoot, { recursive: true, force: true })
      }
    }))

  it('retries missing live user settings by recreating the cloud file and supports reset/reveal', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const settingsRoot = mkdtempSync(path.join(os.tmpdir(), 'tabs-live-settings-'))
      const shell = { openPath: vi.fn(async () => '') }
      try {
        const ipcMain = createIpcMain()
        registerStorageIpc({
          ipcMain,
          app: { getPath: () => userDataPath },
          BrowserWindow: createBrowserWindow(),
          shell,
          dialog: {
            showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [settingsRoot] })),
          },
        })
        const saveEvent = { sender: { id: 1 }, returnValue: null }
        ipcMain.listeners.get('save-app-state')(saveEvent, { serializedState: serializedAppState('custom1'), baseRevision: 0 })
        await ipcMain.handlers.get('choose-user-settings-folder')()
        rmSync(path.join(settingsRoot, 'settings', 'app-settings.json'), { force: true })

        await expect(ipcMain.handlers.get('retry-user-settings-sync')()).resolves.toMatchObject({
          ok: true,
          status: {
            event: 'settings-sync-recreated',
            syncStatus: 'synced',
          },
        })
        expect(JSON.parse(readFileSync(path.join(settingsRoot, 'settings', 'app-settings.json'), 'utf8')).theme).toBe('custom1')

        await expect(ipcMain.handlers.get('reveal-user-settings-folder')()).resolves.toEqual({ ok: true })
        expect(shell.openPath).toHaveBeenCalledWith(settingsRoot)

        await expect(ipcMain.handlers.get('reset-user-settings-folder')()).resolves.toMatchObject({
          ok: true,
          status: {
            settingsRootPath: userDataPath,
            isDefault: true,
            syncStatus: 'local',
          },
        })
      } finally {
        rmSync(settingsRoot, { recursive: true, force: true })
      }
    }))

  it('resets user settings to defaults without changing notebook content', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const settingsRoot = mkdtempSync(path.join(os.tmpdir(), 'tabs-reset-settings-'))
      try {
        const window = {
          isDestroyed: vi.fn(() => false),
          webContents: { id: 2, send: vi.fn() },
        }
        const ipcMain = createIpcMain()
        registerStorageIpc({
          ipcMain,
          app: { getPath: () => userDataPath },
          BrowserWindow: createBrowserWindow([window]),
          dialog: {
            showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [settingsRoot] })),
          },
        })

        const darkState = JSON.parse(serializedAppState('custom1'))
        darkState.domains[0].name = 'Kept Domain'
        const saveEvent = { sender: { id: 1 }, returnValue: null }
        ipcMain.listeners.get('save-app-state')(saveEvent, { serializedState: JSON.stringify(darkState), baseRevision: 0 })
        await ipcMain.handlers.get('choose-user-settings-folder')()
        window.webContents.send.mockClear()

        await expect(ipcMain.handlers.get('reset-user-settings-to-defaults')()).resolves.toMatchObject({
          ok: true,
          status: {
            event: 'settings-reset-defaults',
            syncStatus: 'synced',
          },
        })

        expect(JSON.parse(readFileSync(path.join(userDataPath, 'settings', 'app-settings.json'), 'utf8')).theme).toBe('dawn')
        expect(JSON.parse(readFileSync(path.join(settingsRoot, 'settings', 'app-settings.json'), 'utf8')).theme).toBe('dawn')
        const updateCall = window.webContents.send.mock.calls.find(([channel]) => channel === 'app-state-updated')
        expect(updateCall).toBeDefined()
        const resetState = JSON.parse(updateCall[1].serializedState)
        expect(resetState.theme).toBe('dawn')
        expect(resetState.domains[0].name).toBe('Kept Domain')
      } finally {
        rmSync(settingsRoot, { recursive: true, force: true })
      }
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
        expect(loadAppStateResult(targetRoot, { userSettingsRoot: userDataPath }).ok).toBe(true)
        expect(existsSync(path.join(targetRoot, 'settings', 'app-settings.json'))).toBe(false)
        expect(JSON.parse(readFileSync(path.join(userDataPath, 'settings', 'app-settings.json'), 'utf8')).theme).toBe('dawn')
      } finally {
        rmSync(targetRoot, { recursive: true, force: true })
      }
    }))

  it('switches notebooks while preserving global user settings', async () =>
    withTempUserDataPath(async (userDataPath) => {
      const targetRoot = mkdtempSync(path.join(os.tmpdir(), 'tabs-switch-target-'))
      try {
        const targetState = JSON.parse(serializedAppState('light'))
        targetState.domains[0].name = 'Target Domain'
        saveAppState(targetRoot, JSON.stringify(targetState))

        const ipcMain = createIpcMain()
        const window = {
          isDestroyed: vi.fn(() => false),
          webContents: { id: 2, send: vi.fn() },
        }
        registerStorageIpc({
          ipcMain,
          app: { getPath: () => userDataPath },
          BrowserWindow: createBrowserWindow([window]),
          dialog: {
            showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [targetRoot] })),
          },
        })

        const saveEvent = { sender: { id: 1 }, returnValue: null }
        ipcMain.listeners.get('save-app-state')(saveEvent, { serializedState: serializedAppState('dawn'), baseRevision: 0 })
        window.webContents.send.mockClear()

        await expect(ipcMain.handlers.get('switch-notebook')()).resolves.toMatchObject({
          ok: true,
          status: {
            profileRootPath: targetRoot,
            isDefault: false,
          },
        })

        const updateCall = window.webContents.send.mock.calls.find(([channel]) => channel === 'app-state-updated')
        expect(updateCall).toBeDefined()
        const switchedState = JSON.parse(updateCall[1].serializedState)
        expect(switchedState.theme).toBe('dawn')
        expect(switchedState.domains[0].name).toBe('Target Domain')
      } finally {
        rmSync(targetRoot, { recursive: true, force: true })
      }
    }))

  it('rejects switching to a folder without a notebook', async () =>
    withTempUserDataPath(async (userDataPath) => {
      const targetRoot = mkdtempSync(path.join(os.tmpdir(), 'tabs-switch-empty-'))
      try {
        const ipcMain = createIpcMain()
        registerStorageIpc({
          ipcMain,
          app: { getPath: () => userDataPath },
          BrowserWindow: createBrowserWindow(),
          dialog: {
            showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [targetRoot] })),
          },
        })

        await expect(ipcMain.handlers.get('switch-notebook')()).resolves.toMatchObject({
          ok: false,
          error: 'This folder does not contain a notebook. Use new notebook to create one.',
        })
      } finally {
        rmSync(targetRoot, { recursive: true, force: true })
      }
    }))

  it('creates a new notebook without folder-local user settings', async () =>
    withTempUserDataPath(async (userDataPath) => {
      const targetRoot = mkdtempSync(path.join(os.tmpdir(), 'tabs-new-notebook-'))
      try {
        const ipcMain = createIpcMain()
        registerStorageIpc({
          ipcMain,
          app: { getPath: () => userDataPath },
          BrowserWindow: createBrowserWindow(),
          dialog: {
            showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [targetRoot] })),
          },
        })

        const saveEvent = { sender: { id: 1 }, returnValue: null }
        ipcMain.listeners.get('save-app-state')(saveEvent, { serializedState: serializedAppState('dawn'), baseRevision: 0 })

        await expect(
          ipcMain.handlers.get('create-notebook')(null, { serializedState: serializedAppState('dawn') }),
        ).resolves.toMatchObject({
          ok: true,
          status: {
            profileRootPath: targetRoot,
            isDefault: false,
          },
        })
        expect(existsSync(path.join(targetRoot, 'notes', 'manifest.json'))).toBe(true)
        expect(existsSync(path.join(targetRoot, 'settings', 'app-settings.json'))).toBe(false)
        expect(JSON.parse(readFileSync(path.join(userDataPath, 'settings', 'app-settings.json'), 'utf8')).theme).toBe('dawn')
      } finally {
        rmSync(targetRoot, { recursive: true, force: true })
      }
    }))

  it('rejects new notebooks in existing notebook folders', async () =>
    withTempUserDataPath(async (userDataPath) => {
      const targetRoot = mkdtempSync(path.join(os.tmpdir(), 'tabs-existing-notebook-'))
      try {
        saveAppState(targetRoot, serializedAppState('light'))

        const ipcMain = createIpcMain()
        registerStorageIpc({
          ipcMain,
          app: { getPath: () => userDataPath },
          BrowserWindow: createBrowserWindow(),
          dialog: {
            showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [targetRoot] })),
          },
        })

        await expect(
          ipcMain.handlers.get('create-notebook')(null, { serializedState: serializedAppState('dawn') }),
        ).resolves.toMatchObject({
          ok: false,
          error: 'This folder already contains a notebook. Use switch notebook instead.',
        })
      } finally {
        rmSync(targetRoot, { recursive: true, force: true })
      }
    }))

  it('handles canceled notebook create and switch dialogs', async () =>
    withTempUserDataPath(async (userDataPath) => {
      const ipcMain = createIpcMain()
      registerStorageIpc({
        ipcMain,
        app: { getPath: () => userDataPath },
        BrowserWindow: createBrowserWindow(),
        dialog: {
          showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
        },
      })

      await expect(
        ipcMain.handlers.get('create-notebook')(null, { serializedState: serializedAppState('dawn') }),
      ).resolves.toMatchObject({ canceled: true })
      await expect(ipcMain.handlers.get('switch-notebook')()).resolves.toMatchObject({ canceled: true })
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

        const targetResult = loadAppStateResult(targetRoot, { userSettingsRoot: userDataPath })
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
        serializedState: expect.stringContaining('"light"'),
        revision: 2,
      })
    }))
})
