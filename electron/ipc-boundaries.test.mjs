import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import { registerClipboardIpc } from './ipc-clipboard.mjs'
import { registerFileIpc } from './ipc-files.mjs'
import { registerStorageIpc } from './ipc-storage.mjs'
import { registerUpdateIpc } from './ipc-updates.mjs'
import { loadAppStateResult, saveAppState, writeAssetToProfile } from './app-state-storage.mjs'
import { createNoopUpdateService } from './update-service.mjs'
import {
  USER_SETTINGS_LOCATION_CONFIG_FILE,
  writeUserSettingsLocationConfig,
} from './user-settings-location.mjs'
import { STORAGE_PROFILE_DEFAULT_NOTEBOOK_NAME, writeStorageProfileConfig } from './storage-profile.mjs'
import { createDefaultAppState } from '../src/state/default-app-state.js'

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

function defaultNotebookRoot(userDataPath) {
  return path.join(userDataPath, STORAGE_PROFILE_DEFAULT_NOTEBOOK_NAME)
}

function testNotebookIdForRoot(rootPath) {
  return `notebook-test-${createHash('sha256').update(path.resolve(rootPath)).digest('hex').slice(0, 32)}`
}

function saveTestNotebook(rootPath, serializedState, userDataPath = path.dirname(rootPath)) {
  return saveAppState(rootPath, serializedState, {
    userSettingsRoot: userDataPath,
    notebookId: testNotebookIdForRoot(rootPath),
    syncMetadata: {
      version: 1,
      event: 'test-seed',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  })
}

function saveDefaultTestNotebook(userDataPath, serializedState = serializedAppState('dawn')) {
  return saveTestNotebook(defaultNotebookRoot(userDataPath), serializedState, userDataPath)
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

async function writeNotebookZipFromFolder(filePath, notebookRootPath, prefix = '') {
  const zip = new JSZip()
  const root = notebookRootPath
  const archivePrefix = String(prefix ?? '').replace(/^\/+|\/+$/g, '')

  function visit(directoryPath) {
    for (const entry of readdirSync(directoryPath)) {
      const absolutePath = path.join(directoryPath, entry)
      const stats = statSync(absolutePath)
      if (stats.isDirectory()) {
        visit(absolutePath)
        continue
      }
      if (!stats.isFile()) continue
      const relativePath = path.relative(notebookRootPath, absolutePath).split(path.sep).join('/')
      zip.file(archivePrefix ? path.posix.join(archivePrefix, relativePath) : relativePath, readFileSync(absolutePath))
    }
  }

  visit(root)
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
    noteBodies: [{ id: 'body-1', aisles: [{ id: 'aisle-1', aisleBodyId: 'aisle-body-1' }] }],
    noteAisleBodies: [
      {
        id: 'aisle-body-1',
        markdown: 'hello',
        tags: [],
        frontmatter: null,
        frontmatterStatus: 'none',
      },
    ],
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

  it('opens Markdown ZIP bytes as the notebook ZIP fallback without mutating storage', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const archivePath = path.join(userDataPath, 'notebook.zip')
      await writeZipArchive(archivePath, { 'Domain/Space/Home.md': '# Home' })
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
      expect(Buffer.from(result.bytes).byteLength).toBeGreaterThan(0)
      expect(result.nativeNotebookError).toBeTruthy()
      expect(loadAppStateResult(defaultNotebookRoot(userDataPath)).source).toBe('empty')
    }))

  it('classifies unified notebook import sources', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const archivePath = path.join(userDataPath, 'notebook.zip')
      const archiveSourceRoot = path.join(userDataPath, 'source-notebook-zip')
      const notebookRoot = path.join(userDataPath, 'source-notebook')
      const markdownRoot = path.join(userDataPath, 'markdown-import')
      const homePath = path.join(markdownRoot, 'Domain', 'Space', 'Parent', 'home.md')
      saveAppState(archiveSourceRoot, serializedAppState('light'), { userDataPath })
      await writeNotebookZipFromFolder(archivePath, archiveSourceRoot)
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
      expect(zipResult).toMatchObject({
        canceled: false,
        ok: true,
        kind: 'notebook-zip',
        filePath: archivePath,
        serializedState: expect.stringContaining('"hello"'),
      })

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
      const assetPath = path.join(sourceRoot, 'assets', 'source.txt')
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
      expect(loadAppStateResult(defaultNotebookRoot(userDataPath)).source).toBe('empty')

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

  it('treats old parent folders containing notes as Markdown imports, not notebook roots', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const oldParentRoot = path.join(userDataPath, 'old-parent')
      const legacyMarkdownPath = path.join(oldParentRoot, 'notes', 'legacy.md')
      mkdirSync(path.dirname(legacyMarkdownPath), { recursive: true })
      writeFileSync(path.join(oldParentRoot, 'notes', 'manifest.json'), '{"schemaVersion":1}', 'utf8')
      writeFileSync(legacyMarkdownPath, '# Legacy', 'utf8')
      const ipcMain = createIpcMain()
      registerFileIpc({
        ipcMain,
        dialog: {
          showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [oldParentRoot] })),
        },
      })

      await expect(ipcMain.handlers.get('open-notebook-import-source')()).resolves.toMatchObject({
        canceled: false,
        ok: true,
        kind: 'markdown-folder',
        folderPath: oldParentRoot,
        files: [{ relativePath: 'notes/legacy.md', markdown: '# Legacy' }],
      })
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
      const audioAssetPath = path.join(markdownRoot, 'Domain', 'Space', 'Parent', 'mix.flac')
      const videoAssetPath = path.join(markdownRoot, 'Domain', 'Space', 'Parent', 'clip.m4v')
      mkdirSync(path.dirname(homePath), { recursive: true })
      writeFileSync(homePath, '# Home', 'utf8')
      writeFileSync(assetPath, Buffer.from([1, 2, 3]))
      writeFileSync(audioAssetPath, Buffer.from([4, 5, 6]))
      writeFileSync(videoAssetPath, Buffer.from([7, 8, 9]))
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

      await expect(
        ipcMain.handlers.get('read-folder-import-asset')(null, {
          sourceId: result.sourceId,
          relativePath: 'Domain/Space/Parent/mix.flac',
        }),
      ).resolves.toMatchObject({ ok: true, fileName: 'mix.flac', mimeType: 'audio/flac' })
      await expect(
        ipcMain.handlers.get('read-folder-import-asset')(null, {
          sourceId: result.sourceId,
          relativePath: 'Domain/Space/Parent/clip.m4v',
        }),
      ).resolves.toMatchObject({ ok: true, fileName: 'clip.m4v', mimeType: 'video/mp4' })

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

  it('rejects invalid notebook import ZIPs', async () =>
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

      await expect(ipcMain.handlers.get('open-notebook-import-source')()).resolves.toMatchObject({
        canceled: false,
        ok: false,
        issues: [expect.objectContaining({ code: 'invalid-archive', severity: 'error' })],
      })
    }))

  it('rejects native notebook ZIPs with path traversal entries', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const archivePath = path.join(userDataPath, 'traversal.zip')
      await writeZipArchive(archivePath, {
        'manifest.json': JSON.stringify({ schemaVersion: 1, files: {} }),
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

      await expect(ipcMain.handlers.get('open-notebook-import-source')()).resolves.toMatchObject({
        canceled: false,
        ok: false,
        issues: [expect.objectContaining({ code: 'unsafe-archive-entry', severity: 'error' })],
      })
    }))

  it('rejects native notebook ZIPs with unsupported schemas', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const archivePath = path.join(userDataPath, 'unsupported.zip')
      await writeZipArchive(archivePath, {
        'manifest.json': JSON.stringify({ schemaVersion: 999, files: {} }),
      })
      const ipcMain = createIpcMain()
      registerFileIpc({
        ipcMain,
        dialog: {
          showSaveDialog: vi.fn(),
          showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [archivePath] })),
        },
      })

      await expect(ipcMain.handlers.get('open-notebook-import-source')()).resolves.toMatchObject({
        canceled: false,
        ok: false,
        issues: [expect.objectContaining({ code: 'unsupported-schema', severity: 'error' })],
      })
    }))

  it('loads valid native notebook ZIPs without mutating the current profile', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const archivePath = path.join(userDataPath, 'notebook.zip')
      const sourceRoot = path.join(userDataPath, 'source-notebook')
      saveAppState(sourceRoot, serializedAppState('light'), { userDataPath })
      await writeNotebookZipFromFolder(archivePath, sourceRoot)
      const zip = await JSZip.loadAsync(readFileSync(archivePath))
      expect(zip.file('manifest.json')).not.toBeNull()
      expect(zip.file('settings/app-settings.json')).toBeNull()
      const ipcMain = createIpcMain()
      registerFileIpc({
        ipcMain,
        dialog: {
          showSaveDialog: vi.fn(),
          showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [archivePath] })),
        },
      })

      await expect(ipcMain.handlers.get('open-notebook-import-source')()).resolves.toMatchObject({
        canceled: false,
        ok: true,
        kind: 'notebook-zip',
        serializedState: expect.stringContaining('"hello"'),
      })
      expect(loadAppStateResult(defaultNotebookRoot(userDataPath)).source).toBe('empty')
    }))

  it('loads native notebook ZIPs with a single top-level folder wrapper', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const archivePath = path.join(userDataPath, 'wrapped-notebook.zip')
      const sourceRoot = path.join(userDataPath, 'source-notebook')
      saveAppState(sourceRoot, serializedAppState('light'), { userDataPath })
      await writeNotebookZipFromFolder(archivePath, sourceRoot, 'Wrapped Notebook')
      const zip = await JSZip.loadAsync(readFileSync(archivePath))
      expect(zip.file('Wrapped Notebook/manifest.json')).not.toBeNull()
      const ipcMain = createIpcMain()
      registerFileIpc({
        ipcMain,
        dialog: {
          showSaveDialog: vi.fn(),
          showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [archivePath] })),
        },
      })

      await expect(ipcMain.handlers.get('open-notebook-import-source')()).resolves.toMatchObject({
        canceled: false,
        ok: true,
        kind: 'notebook-zip',
        serializedState: expect.stringContaining('"hello"'),
      })
      expect(loadAppStateResult(defaultNotebookRoot(userDataPath)).source).toBe('empty')
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

  it('blocks a corrupt app-support notebook instead of resetting it silently', () =>
    withTempUserDataPath((userDataPath) => {
      const root = defaultNotebookRoot(userDataPath)
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

      expect(loadEvent.returnValue).toMatchObject({
        ok: false,
        source: 'empty',
        revision: 0,
        error: 'Notebook setup is required before saves can start.',
      })
      expect(readFileSync(path.join(root, 'manifest.json'), 'utf8')).toBe('{nope')
      expect(storageSession.canWriteAppState()).toBe(false)
      expect(storageSession.getStorageProfileStatus()).toMatchObject({
        status: 'error',
        event: 'notebook-setup-required',
        profileRootPath: root,
        knownNotebooks: [],
      })
      const saveEvent = { returnValue: null }
      ipcMain.listeners.get('save-app-state')(saveEvent, { serializedState: serializedAppState('dawn'), baseRevision: 0 })
      expect(saveEvent.returnValue).toMatchObject({
        ok: false,
        reason: 'load-failed',
      })
    }))

  it('resets the active notebook local mirror to blank without deleting library records', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const externalRoot = mkdtempSync(path.join(os.tmpdir(), 'tabs-linked-notebook-'))
      try {
        saveDefaultTestNotebook(userDataPath, serializedAppState('dawn'))
        saveTestNotebook(externalRoot, serializedAppState('light'), userDataPath)
        writeStorageProfileConfig(userDataPath, externalRoot)
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

        await expect(ipcMain.handlers.get('reset-local-notebook-to-blank')()).resolves.toMatchObject({
          ok: true,
          status: {
            event: 'notebook-reset-local',
            syncStatus: 'pending',
            knownNotebooks: expect.arrayContaining([
              expect.objectContaining({
                notebookPath: externalRoot,
                isActive: true,
              }),
            ]),
          },
        })

        expect(storageSession.getProfileRootPath()).toBe(storageSession.getStorageProfileStatus().localMirrorPath)
        const localLoad = loadAppStateResult(storageSession.getProfileRootPath(), { userSettingsRoot: userDataPath })
        expect(localLoad.ok).toBe(true)
        const localState = JSON.parse(localLoad.serializedState)
        expect(localState).not.toHaveProperty('domains')
        expect(localState.notebook.items[0]).toMatchObject({ type: 'note', title: 'Welcome' })
        expect(localState.noteAisleBodies[0].markdown).toBe('')
        expect(storageSession.getStorageProfileStatus().knownNotebooks).toHaveLength(2)
        expect(window.webContents.send).toHaveBeenCalledWith(
          'app-state-updated',
          expect.objectContaining({
            serializedState: expect.stringContaining('Welcome'),
          }),
        )
      } finally {
        rmSync(externalRoot, { recursive: true, force: true })
      }
    }))

  it('backs up an unsupported active local mirror and seeds schema 2 so saves continue', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const shell = { openPath: vi.fn(async () => '') }
      let initialSession = null
      let recoveredSession = null
      try {
        saveTestNotebook(defaultNotebookRoot(userDataPath), JSON.stringify(createDefaultAppState()), userDataPath)
        initialSession = registerStorageIpc({
          ipcMain: createIpcMain(),
          app: { getPath: () => userDataPath },
          BrowserWindow: createBrowserWindow(),
        })
        initialSession.close()

        const localMirrorPath = defaultNotebookRoot(userDataPath)
        writeFileSync(path.join(localMirrorPath, 'manifest.json'), JSON.stringify({ schemaVersion: 999 }), 'utf8')
        writeFileSync(path.join(localMirrorPath, 'legacy-marker.txt'), 'legacy data', 'utf8')

        const ipcMain = createIpcMain()
        recoveredSession = registerStorageIpc({
          ipcMain,
          app: { getPath: () => userDataPath },
          BrowserWindow: createBrowserWindow(),
          shell,
        })

        const backupFolder = readdirSync(userDataPath)
          .find((entry) => entry.startsWith(`${STORAGE_PROFILE_DEFAULT_NOTEBOOK_NAME}.unsupported-`))
        expect(backupFolder).toBeTruthy()
        const backupPath = path.join(userDataPath, backupFolder)
        expect(readFileSync(path.join(backupPath, 'legacy-marker.txt'), 'utf8')).toBe('legacy data')

        const loadEvent = { returnValue: null }
        ipcMain.listeners.get('load-app-state-result')(loadEvent)
        expect(loadEvent.returnValue).toMatchObject({ ok: true, schemaVersion: 2 })
        expect(loadEvent.returnValue.serializedState).toContain('storage-notebook-recovered')
        expect(recoveredSession.canWriteAppState()).toBe(true)

        const recoveredState = JSON.parse(loadEvent.returnValue.serializedState)
        expect(recoveredState).not.toHaveProperty('domains')
        recoveredState.noteAisleBodies[0].markdown = 'saved after recovery'
        const saveEvent = { sender: { id: 1 }, returnValue: null }
        ipcMain.listeners.get('save-app-state')(saveEvent, {
          serializedState: JSON.stringify(recoveredState),
          baseRevision: loadEvent.returnValue.revision,
        })
        expect(saveEvent.returnValue).toMatchObject({ ok: true })

        const reloadedState = JSON.parse(loadAppStateResult(localMirrorPath, { userSettingsRoot: userDataPath }).serializedState)
        expect(reloadedState.noteAisleBodies[0].markdown).toBe('saved after recovery')

        await expect(ipcMain.handlers.get('reveal-recovered-notebook-location')()).resolves.toEqual({ ok: true })
        expect(shell.openPath).toHaveBeenCalledWith(backupPath)
      } finally {
        initialSession?.close()
        recoveredSession?.close()
      }
    }))

  it('saves locally while the sync target is unavailable and reconnect pushes pending changes', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const externalRoot = mkdtempSync(path.join(os.tmpdir(), 'tabs-offline-save-target-'))
      try {
        saveTestNotebook(externalRoot, serializedAppState('light'), userDataPath)
        writeStorageProfileConfig(userDataPath, externalRoot)
        const ipcMain = createIpcMain()
        const storageSession = registerStorageIpc({
          ipcMain,
          app: { getPath: () => userDataPath },
          BrowserWindow: createBrowserWindow(),
        })
        const localMirrorPath = storageSession.getProfileRootPath()
        rmSync(externalRoot, { recursive: true, force: true })

        const pendingState = JSON.parse(serializedAppState('dawn'))
        pendingState.domains[0].name = 'Pending Local'
        const saveEvent = { sender: { id: 1 }, returnValue: null }
        ipcMain.listeners.get('save-app-state')(saveEvent, {
          serializedState: JSON.stringify(pendingState),
          baseRevision: 1,
        })

        expect(saveEvent.returnValue).toMatchObject({ ok: true, revision: 2 })
        expect(storageSession.getStorageProfileStatus()).toMatchObject({
          status: 'ready',
          syncStatus: 'offline',
          syncPending: true,
          syncTargetPath: externalRoot,
        })
        expect(JSON.parse(loadAppStateResult(localMirrorPath, { userSettingsRoot: userDataPath }).serializedState).domains[0].name).toBe('Pending Local')

        mkdirSync(externalRoot, { recursive: true })
        await expect(ipcMain.handlers.get('reconnect-notebook-sync-target')()).resolves.toMatchObject({
          ok: true,
          status: {
            syncStatus: 'synced',
            syncPending: false,
            syncTargetPath: externalRoot,
          },
        })
        expect(JSON.parse(loadAppStateResult(externalRoot, { userSettingsRoot: userDataPath }).serializedState).domains[0].name).toBe('Pending Local')
        storageSession.close()
      } finally {
        rmSync(externalRoot, { recursive: true, force: true })
      }
    }))

  it('deletes the active notebook by trashing its local mirror and returning to setup', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      saveDefaultTestNotebook(userDataPath, serializedAppState('light'))
      const localRoot = defaultNotebookRoot(userDataPath)
      const trashItem = vi.fn(async (targetPath) => {
        rmSync(targetPath, { recursive: true, force: true })
      })
      const ipcMain = createIpcMain()
      registerStorageIpc({
        ipcMain,
        app: { getPath: () => userDataPath },
        BrowserWindow: createBrowserWindow(),
        shell: { trashItem },
      })

      await expect(
        ipcMain.handlers.get('delete-notebook')(null, { notebookPath: localRoot, skipConfirmation: true }),
      ).resolves.toMatchObject({
        ok: true,
        status: {
          status: 'error',
          event: 'notebook-setup-required',
          knownNotebooks: [],
        },
      })
      expect(trashItem).toHaveBeenCalledWith(localRoot)
      expect(existsSync(localRoot)).toBe(false)
    }))

  it('broadcasts successful revisioned app-state saves to other windows', () =>
    withTempUserDataPath((userDataPath) => {
      saveDefaultTestNotebook(userDataPath, serializedAppState('light'))
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
      ipcMain.listeners.get('save-app-state')(saveEvent, { serializedState: '{"theme":"dawn"}', baseRevision: 1 })

      expect(saveEvent.returnValue).toMatchObject({
        ok: true,
        serializedState: '{"theme":"dawn"}',
        revision: 2,
      })
      expect(saveEvent.returnValue.saveMetrics).toMatchObject({
        counts: expect.objectContaining({ generatedFiles: expect.any(Number) }),
        phases: expect.objectContaining({ fingerprint: expect.any(Number) }),
      })
      expect(sourceWindow.webContents.send).not.toHaveBeenCalledWith('app-state-updated', expect.anything())
      expect(otherWindow.webContents.send).toHaveBeenCalledWith('app-state-updated', {
        serializedState: '{"theme":"dawn"}',
        revision: 2,
      })
    }))

  it('handles async app-state saves and broadcasts them to other windows', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      saveDefaultTestNotebook(userDataPath, serializedAppState('light'))
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
          { serializedState: '{"theme":"dawn"}', baseRevision: 1 },
        ),
      ).resolves.toMatchObject({
        ok: true,
        serializedState: '{"theme":"dawn"}',
        revision: 2,
        saveMetrics: {
          counts: expect.objectContaining({ generatedFiles: expect.any(Number) }),
          phases: expect.objectContaining({ fingerprint: expect.any(Number) }),
        },
      })
      expect(sourceWindow.webContents.send).not.toHaveBeenCalledWith('app-state-updated', expect.anything())
      expect(otherWindow.webContents.send).toHaveBeenCalledWith('app-state-updated', {
        serializedState: '{"theme":"dawn"}',
        revision: 2,
      })
    }))

  it('reports setup-required storage status when no notebooks exist', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const ipcMain = createIpcMain()
      registerStorageIpc({
        ipcMain,
        app: { getPath: () => userDataPath },
        BrowserWindow: createBrowserWindow(),
      })

      await expect(ipcMain.handlers.get('get-storage-profile-status')()).resolves.toMatchObject({
        status: 'error',
        event: 'notebook-setup-required',
        profileRootPath: defaultNotebookRoot(userDataPath),
        notebookPath: defaultNotebookRoot(userDataPath),
        notebookName: STORAGE_PROFILE_DEFAULT_NOTEBOOK_NAME,
        isDefault: false,
        canWrite: false,
        source: 'empty',
        knownNotebooks: [],
      })
      await expect(ipcMain.handlers.get('get-user-settings-location-status')()).resolves.toMatchObject({
        status: 'ready',
        settingsRootPath: userDataPath,
        settingsPath: path.join(userDataPath, 'settings', 'app-settings.json'),
        localSettingsPath: path.join(userDataPath, 'settings', 'app-settings.json'),
        isDefault: true,
        syncStatus: 'local',
      })
    }))

  it('blocks startup setup when the only remembered external notebook is corrupt', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const externalRoot = mkdtempSync(path.join(os.tmpdir(), 'tabs-corrupt-external-'))
      try {
        writeFileSync(path.join(externalRoot, 'manifest.json'), '{nope', 'utf8')
        writeStorageProfileConfig(userDataPath, externalRoot)

        const shell = { openPath: vi.fn(async () => '') }
        const ipcMain = createIpcMain()
        registerStorageIpc({
          ipcMain,
          app: { getPath: () => userDataPath },
          BrowserWindow: createBrowserWindow(),
          shell,
        })

        const status = await ipcMain.handlers.get('get-storage-profile-status')()
        expect(status).toMatchObject({
          status: 'error',
          event: 'notebook-setup-required',
          profileRootPath: defaultNotebookRoot(userDataPath),
          notebookPath: defaultNotebookRoot(userDataPath),
          notebookName: STORAGE_PROFILE_DEFAULT_NOTEBOOK_NAME,
          isDefault: false,
          knownNotebooks: [],
        })
        expect(readFileSync(path.join(externalRoot, 'manifest.json'), 'utf8')).toBe('{nope')
        expect(existsSync(path.join(defaultNotebookRoot(userDataPath), 'manifest.json'))).toBe(false)

        const loadEvent = { returnValue: null }
        ipcMain.listeners.get('load-app-state-result')(loadEvent)
        expect(loadEvent.returnValue).toMatchObject({ ok: false, source: 'empty' })

        await expect(ipcMain.handlers.get('reveal-recovered-notebook-location')()).resolves.toEqual({
          ok: false,
          error: 'No recovered notebook folder is available.',
        })
        expect(shell.openPath).not.toHaveBeenCalled()
      } finally {
        rmSync(externalRoot, { recursive: true, force: true })
      }
    }))

  it('blocks startup setup when the only remembered external notebook folder is missing', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const externalRoot = mkdtempSync(path.join(os.tmpdir(), 'tabs-missing-external-'))
      rmSync(externalRoot, { recursive: true, force: true })
      writeStorageProfileConfig(userDataPath, externalRoot)

      const shell = { openPath: vi.fn(async () => '') }
      const ipcMain = createIpcMain()
      registerStorageIpc({
        ipcMain,
        app: { getPath: () => userDataPath },
        BrowserWindow: createBrowserWindow(),
        shell,
      })

      const status = await ipcMain.handlers.get('get-storage-profile-status')()
      expect(status).toMatchObject({
        status: 'error',
        event: 'notebook-setup-required',
        profileRootPath: defaultNotebookRoot(userDataPath),
        knownNotebooks: [],
      })

      const loadEvent = { returnValue: null }
      ipcMain.listeners.get('load-app-state-result')(loadEvent)
      expect(loadEvent.returnValue).toMatchObject({ ok: false, source: 'empty' })

      await expect(ipcMain.handlers.get('reveal-recovered-notebook-location')()).resolves.toEqual({
        ok: false,
        error: 'No recovered notebook folder is available.',
      })
      expect(shell.openPath).not.toHaveBeenCalled()
    }))

  it('keeps the local mirror available and marks a missing sync target offline on restart', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const externalRoot = mkdtempSync(path.join(os.tmpdir(), 'tabs-offline-sync-target-'))
      let firstSession = null
      try {
        saveTestNotebook(externalRoot, serializedAppState('light'), userDataPath)
        writeStorageProfileConfig(userDataPath, externalRoot)

        const firstIpcMain = createIpcMain()
        firstSession = registerStorageIpc({
          ipcMain: firstIpcMain,
          app: { getPath: () => userDataPath },
          BrowserWindow: createBrowserWindow(),
        })
        expect(firstSession.getStorageProfileStatus()).toMatchObject({
          status: 'ready',
          notebookPath: externalRoot,
          syncTargetPath: externalRoot,
          syncStatus: 'synced',
        })
        const localMirrorPath = firstSession.getStorageProfileStatus().localMirrorPath

        firstSession.close()
        firstSession = null
        rmSync(externalRoot, { recursive: true, force: true })

        const secondIpcMain = createIpcMain()
        const secondSession = registerStorageIpc({
          ipcMain: secondIpcMain,
          app: { getPath: () => userDataPath },
          BrowserWindow: createBrowserWindow(),
        })

        expect(secondSession.getStorageProfileStatus()).toMatchObject({
          status: 'ready',
          health: 'warning',
          profileRootPath: localMirrorPath,
          notebookPath: externalRoot,
          syncTargetPath: externalRoot,
          syncStatus: 'offline',
          syncPending: true,
        })
        const loadEvent = { returnValue: null }
        secondIpcMain.listeners.get('load-app-state-result')(loadEvent)
        expect(JSON.parse(loadEvent.returnValue.serializedState).theme).toBe('light')
        secondSession.close()
      } finally {
        firstSession?.close()
        rmSync(externalRoot, { recursive: true, force: true })
      }
    }))

  it('preserves a healthy local notebook when disconnecting from a corrupt external notebook', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const externalRoot = mkdtempSync(path.join(os.tmpdir(), 'tabs-corrupt-external-'))
      try {
        const localState = JSON.parse(serializedAppState('dawn'))
        localState.domains[0].name = 'Local Domain'
        saveDefaultTestNotebook(userDataPath, JSON.stringify(localState))
        writeFileSync(path.join(externalRoot, 'manifest.json'), '{nope', 'utf8')
        writeStorageProfileConfig(userDataPath, externalRoot)

        const ipcMain = createIpcMain()
        registerStorageIpc({
          ipcMain,
          app: { getPath: () => userDataPath },
          BrowserWindow: createBrowserWindow(),
        })

        const loadEvent = { returnValue: null }
        ipcMain.listeners.get('load-app-state-result')(loadEvent)
        const state = JSON.parse(loadEvent.returnValue.serializedState)
        expect(state.domains[0].name).toBe('Local Domain')
        expect(state.messages ?? []).toEqual([])
        expect(loadAppStateResult(defaultNotebookRoot(userDataPath), { userSettingsRoot: userDataPath })).toMatchObject({
          ok: true,
          source: 'hybrid',
        })
        expect(readFileSync(path.join(externalRoot, 'manifest.json'), 'utf8')).toBe('{nope')
      } finally {
        rmSync(externalRoot, { recursive: true, force: true })
      }
    }))

  it('exports a native notebook folder without settings and copies active assets', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const destinationRoot = mkdtempSync(path.join(os.tmpdir(), 'tabs-notebook-export-'))
      try {
        const assetBytes = Buffer.from('asset bytes')
        const asset = writeAssetToProfile(userDataPath, assetBytes, 'pdf')
        const state = JSON.parse(serializedAppState('light'))
        state.noteAisleBodies[0].markdown = `[report](${asset.url})`
        const ipcMain = createIpcMain()
        registerFileIpc({
          ipcMain,
          dialog: {
            showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [destinationRoot] })),
          },
          storageSession: {
            getProfileRootPath: () => userDataPath,
          },
        })

        const result = await ipcMain.handlers.get('export-notebook-folder')(null, {
          serializedState: JSON.stringify(state),
        })
        expect(result).toMatchObject({
          canceled: false,
          ok: true,
          profileRootPath: destinationRoot,
          notebookPath: destinationRoot,
          notebookName: path.basename(destinationRoot),
        })
        expect(existsSync(path.join(destinationRoot, 'manifest.json'))).toBe(true)
        expect(existsSync(path.join(destinationRoot, 'settings', 'app-settings.json'))).toBe(false)
        expect(readFileSync(path.join(destinationRoot, asset.assetPath))).toEqual(assetBytes)
      } finally {
        rmSync(destinationRoot, { recursive: true, force: true })
      }
    }))

  it('rejects notebook folder export destinations that are active, non-empty, or already contain notebooks', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const existingNotebookRoot = mkdtempSync(path.join(os.tmpdir(), 'tabs-existing-notebook-'))
      const nonEmptyRoot = mkdtempSync(path.join(os.tmpdir(), 'tabs-non-empty-export-'))
      try {
        writeFileSync(path.join(existingNotebookRoot, 'manifest.json'), '{"schemaVersion":1}', 'utf8')
        writeFileSync(path.join(nonEmptyRoot, 'readme.txt'), 'keep me', 'utf8')
        const ipcMain = createIpcMain()
        const showOpenDialog = vi
          .fn()
          .mockResolvedValueOnce({ canceled: true, filePaths: [] })
          .mockResolvedValueOnce({ canceled: false, filePaths: [userDataPath] })
          .mockResolvedValueOnce({ canceled: false, filePaths: [existingNotebookRoot] })
          .mockResolvedValueOnce({ canceled: false, filePaths: [nonEmptyRoot] })
        registerFileIpc({
          ipcMain,
          dialog: { showOpenDialog },
          storageSession: {
            getProfileRootPath: () => userDataPath,
          },
        })
        const handler = ipcMain.handlers.get('export-notebook-folder')
        const payload = { serializedState: serializedAppState() }

        await expect(handler(null, payload)).resolves.toMatchObject({
          canceled: true,
        })
        await expect(handler(null, payload)).resolves.toMatchObject({
          ok: false,
          error: 'Choose a folder outside the active notebook folder.',
        })
        await expect(handler(null, payload)).resolves.toMatchObject({
          ok: false,
          error: 'Destination folder already contains a notebook.',
        })
        await expect(handler(null, payload)).resolves.toMatchObject({
          ok: false,
          error: 'Destination notebook folder must be empty.',
        })
      } finally {
        rmSync(existingNotebookRoot, { recursive: true, force: true })
        rmSync(nonEmptyRoot, { recursive: true, force: true })
      }
    }))

  it('rejects notebook folders as live user settings folders', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      saveDefaultTestNotebook(userDataPath)
      const otherNotebookRoot = mkdtempSync(path.join(os.tmpdir(), 'tabs-settings-notebook-'))
      try {
        mkdirSync(otherNotebookRoot, { recursive: true })
        writeFileSync(path.join(otherNotebookRoot, 'manifest.json'), '{"schemaVersion":1}', 'utf8')
        const showOpenDialog = vi
          .fn()
          .mockResolvedValueOnce({ canceled: false, filePaths: [defaultNotebookRoot(userDataPath)] })
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
      saveDefaultTestNotebook(userDataPath)
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
        ipcMain.listeners.get('save-app-state')(saveEvent, { serializedState: serializedAppState('light'), baseRevision: 1 })

        await expect(ipcMain.handlers.get('choose-user-settings-folder')()).resolves.toMatchObject({
          ok: true,
          status: {
            settingsRootPath: settingsRoot,
            isDefault: false,
            syncStatus: 'synced',
          },
        })
        expect(JSON.parse(readFileSync(path.join(settingsRoot, 'settings', 'app-settings.json'), 'utf8')).theme).toBe('light')
        expect(JSON.parse(readFileSync(path.join(userDataPath, 'settings', 'app-settings.json'), 'utf8')).theme).toBe('light')
      } finally {
        rmSync(settingsRoot, { recursive: true, force: true })
      }
    }))

  it('applies valid live user settings after confirmation', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      saveDefaultTestNotebook(userDataPath)
      const settingsRoot = mkdtempSync(path.join(os.tmpdir(), 'tabs-live-settings-'))
      try {
        saveAppState(settingsRoot, serializedAppState('light'))
        for (const entry of readdirSync(settingsRoot)) {
          if (entry !== 'settings') rmSync(path.join(settingsRoot, entry), { recursive: true, force: true })
        }
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
        ipcMain.listeners.get('save-app-state')(saveEvent, { serializedState: serializedAppState('dawn'), baseRevision: 1 })
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

  it('switches startup to local settings when the configured settings folder was deleted', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const settingsRoot = mkdtempSync(path.join(os.tmpdir(), 'tabs-deleted-settings-'))
      writeUserSettingsLocationConfig(userDataPath, settingsRoot)
      rmSync(settingsRoot, { recursive: true, force: true })

      const ipcMain = createIpcMain()
      registerStorageIpc({
        ipcMain,
        app: { getPath: () => userDataPath },
        BrowserWindow: createBrowserWindow(),
      })

      await expect(ipcMain.handlers.get('get-user-settings-location-status')()).resolves.toMatchObject({
        status: 'warning',
        event: 'settings-folder-unreachable-reset',
        settingsRootPath: userDataPath,
        isDefault: true,
        syncStatus: 'local',
        source: 'local-cache',
        canWrite: true,
        error: 'Settings folder could not be reached. Switched to local app settings.',
      })
      expect(existsSync(path.join(userDataPath, USER_SETTINGS_LOCATION_CONFIG_FILE))).toBe(false)
      expect(existsSync(path.join(userDataPath, 'settings', 'app-settings.json'))).toBe(true)
    }))

  it('does not emit repeated fallback statuses after startup detaches a deleted settings folder', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      saveDefaultTestNotebook(userDataPath)
      const settingsRoot = mkdtempSync(path.join(os.tmpdir(), 'tabs-deleted-settings-'))
      writeUserSettingsLocationConfig(userDataPath, settingsRoot)
      rmSync(settingsRoot, { recursive: true, force: true })
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
      window.webContents.send.mockClear()

      const saveEvent = { sender: { id: 1 }, returnValue: null }
      ipcMain.listeners.get('save-app-state')(saveEvent, {
        serializedState: serializedAppState('custom1'),
        baseRevision: 1,
      })
      const secondSaveEvent = { sender: { id: 1 }, returnValue: null }
      ipcMain.listeners.get('save-app-state')(secondSaveEvent, {
        serializedState: serializedAppState('light'),
        baseRevision: saveEvent.returnValue.revision,
      })

      const userSettingsUpdates = window.webContents.send.mock.calls.filter(
        ([channel]) => channel === 'user-settings-location-status-updated',
      )
      expect(userSettingsUpdates).toHaveLength(0)
      expect(existsSync(settingsRoot)).toBe(false)
      expect(JSON.parse(readFileSync(path.join(userDataPath, 'settings', 'app-settings.json'), 'utf8')).theme).toBe(
        'light',
      )
    }))

  it('detaches a deleted live settings folder during save without repeated fallback broadcasts', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      saveDefaultTestNotebook(userDataPath)
      const settingsRoot = mkdtempSync(path.join(os.tmpdir(), 'tabs-live-settings-'))
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
        const initialSaveEvent = { sender: { id: 1 }, returnValue: null }
        ipcMain.listeners.get('save-app-state')(initialSaveEvent, {
          serializedState: serializedAppState('custom1'),
          baseRevision: 1,
        })
        await ipcMain.handlers.get('choose-user-settings-folder')()
        window.webContents.send.mockClear()
        rmSync(settingsRoot, { recursive: true, force: true })

        const detachSaveEvent = { sender: { id: 1 }, returnValue: null }
        ipcMain.listeners.get('save-app-state')(detachSaveEvent, {
          serializedState: serializedAppState('custom2'),
          baseRevision: initialSaveEvent.returnValue.revision,
        })
        const localSaveEvent = { sender: { id: 1 }, returnValue: null }
        ipcMain.listeners.get('save-app-state')(localSaveEvent, {
          serializedState: serializedAppState('light'),
          baseRevision: detachSaveEvent.returnValue.revision,
        })

        const userSettingsUpdates = window.webContents.send.mock.calls.filter(
          ([channel]) => channel === 'user-settings-location-status-updated',
        )
        expect(userSettingsUpdates).toHaveLength(1)
        expect(userSettingsUpdates[0][1]).toMatchObject({
          status: 'warning',
          event: 'settings-folder-unreachable-reset',
          settingsRootPath: userDataPath,
          isDefault: true,
          syncStatus: 'local',
          source: 'local-cache',
        })
        expect(existsSync(settingsRoot)).toBe(false)
        expect(existsSync(path.join(userDataPath, USER_SETTINGS_LOCATION_CONFIG_FILE))).toBe(false)
        expect(JSON.parse(readFileSync(path.join(userDataPath, 'settings', 'app-settings.json'), 'utf8')).theme).toBe(
          'light',
        )
      } finally {
        rmSync(settingsRoot, { recursive: true, force: true })
      }
    }))

  it('retries a deleted live user settings folder by switching back to local settings', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      saveDefaultTestNotebook(userDataPath)
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
        ipcMain.listeners.get('save-app-state')(saveEvent, {
          serializedState: serializedAppState('custom1'),
          baseRevision: 1,
        })
        await ipcMain.handlers.get('choose-user-settings-folder')()
        rmSync(settingsRoot, { recursive: true, force: true })

        await expect(ipcMain.handlers.get('retry-user-settings-sync')()).resolves.toMatchObject({
          ok: true,
          status: {
            status: 'warning',
            event: 'settings-folder-unreachable-reset',
            settingsRootPath: userDataPath,
            isDefault: true,
            syncStatus: 'local',
            source: 'local-cache',
          },
        })
        expect(existsSync(settingsRoot)).toBe(false)
        expect(existsSync(path.join(userDataPath, USER_SETTINGS_LOCATION_CONFIG_FILE))).toBe(false)
        expect(JSON.parse(readFileSync(path.join(userDataPath, 'settings', 'app-settings.json'), 'utf8')).theme).toBe(
          'custom1',
        )

        await expect(ipcMain.handlers.get('reveal-user-settings-folder')()).resolves.toEqual({ ok: true })
        expect(shell.openPath).toHaveBeenCalledWith(userDataPath)
      } finally {
        rmSync(settingsRoot, { recursive: true, force: true })
      }
    }))

  it('retries missing live user settings by recreating the cloud file and supports reset/reveal', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      saveDefaultTestNotebook(userDataPath)
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
        ipcMain.listeners.get('save-app-state')(saveEvent, { serializedState: serializedAppState('custom1'), baseRevision: 1 })
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
      saveDefaultTestNotebook(userDataPath)
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
        ipcMain.listeners.get('save-app-state')(saveEvent, { serializedState: JSON.stringify(darkState), baseRevision: 1 })
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
      saveDefaultTestNotebook(userDataPath)
      const activeRoot = defaultNotebookRoot(userDataPath)
      const ipcMain = createIpcMain()
      const shell = { openPath: vi.fn(async () => ''), showItemInFolder: vi.fn() }
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
      expect(readFileSync(path.join(activeRoot, imported.assetPath))).toEqual(Buffer.from([1, 2, 3]))

      await expect(ipcMain.handlers.get('read-asset')(null, { url: imported.url })).resolves.toMatchObject({
        ok: true,
        bytes: expect.any(ArrayBuffer),
      })
      const readResult = await ipcMain.handlers.get('read-asset')(null, { assetPath: imported.assetPath })
      expect(readResult.ok).toBe(true)
      expect(Buffer.from(readResult.bytes)).toEqual(Buffer.from([1, 2, 3]))

      await expect(ipcMain.handlers.get('open-asset')(null, { url: imported.url })).resolves.toEqual({ ok: true })
      expect(shell.openPath).toHaveBeenCalledWith(path.join(activeRoot, imported.assetPath))
      await expect(
        ipcMain.handlers.get('reveal-asset')(null, { url: `${imported.url}#tabs-media=speed=1.5` }),
      ).resolves.toEqual({ ok: true })
      expect(shell.showItemInFolder).toHaveBeenCalledWith(path.join(activeRoot, imported.assetPath))
      await expect(ipcMain.handlers.get('reveal-asset')(null, { url: 'tabs-asset:///assets/missing.mp3' })).resolves.toEqual({
        ok: false,
        error: 'Asset does not exist.',
      })
    } finally {
      rmSync(userDataPath, { recursive: true, force: true })
    }
  })

  it('reveals committed note locations through storage ipc', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const activeRoot = defaultNotebookRoot(userDataPath)
      saveDefaultTestNotebook(userDataPath, serializedAppState())
      const ipcMain = createIpcMain()
      const shell = { openPath: vi.fn(async () => ''), showItemInFolder: vi.fn() }
      registerStorageIpc({
        ipcMain,
        app: { getPath: () => userDataPath },
        BrowserWindow: createBrowserWindow(),
        shell,
      })

      await expect(
        ipcMain.handlers.get('reveal-note-location')(null, {
          type: 'live-note',
          location: { domainId: 'domain-1', spaceId: 'space-1', tabId: 'tab-1', subTabId: null },
        }),
      ).resolves.toEqual({ ok: true })
      expect(shell.showItemInFolder).toHaveBeenCalledWith(expect.stringMatching(/\.md$/))
      await expect(
        ipcMain.handlers.get('reveal-note-location')(null, {
          type: 'live-note',
          location: { domainId: 'domain-1', spaceId: 'space-1', tabId: 'missing-tab', subTabId: null },
        }),
      ).resolves.toMatchObject({ ok: false })
    }))

  it('moves current app data into a chosen sync folder without deleting the source profile', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      saveDefaultTestNotebook(userDataPath, serializedAppState('light'))
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
        ipcMain.listeners.get('save-app-state')(saveEvent, { serializedState: serializedAppState('dawn'), baseRevision: 1 })

        await expect(ipcMain.handlers.get('move-storage-profile')()).resolves.toMatchObject({
          ok: true,
          status: {
            profileRootPath: defaultNotebookRoot(userDataPath),
            notebookPath: targetRoot,
            syncTargetPath: targetRoot,
            isDefault: false,
            knownNotebooks: [
              expect.objectContaining({ notebookPath: targetRoot, isActive: true }),
            ],
          },
        })

        expect(loadAppStateResult(defaultNotebookRoot(userDataPath)).ok).toBe(true)
        expect(loadAppStateResult(targetRoot, { userSettingsRoot: userDataPath }).ok).toBe(true)
        expect(existsSync(path.join(targetRoot, 'settings', 'app-settings.json'))).toBe(false)
        expect(JSON.parse(readFileSync(path.join(userDataPath, 'settings', 'app-settings.json'), 'utf8')).theme).toBe('dawn')
      } finally {
        rmSync(targetRoot, { recursive: true, force: true })
      }
    }))

  it('moves current app data into a same-named child when the selected location is non-empty', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      saveDefaultTestNotebook(userDataPath, serializedAppState('light'))
      const targetLocation = mkdtempSync(path.join(os.tmpdir(), 'tabs-non-empty-location-'))
      const targetRoot = path.join(targetLocation, STORAGE_PROFILE_DEFAULT_NOTEBOOK_NAME)
      try {
        writeFileSync(path.join(targetLocation, 'readme.txt'), 'keep me', 'utf8')
        const ipcMain = createIpcMain()
        const showMessageBox = vi.fn(async () => ({ response: 0 }))
        registerStorageIpc({
          ipcMain,
          app: { getPath: () => userDataPath },
          BrowserWindow: createBrowserWindow(),
          dialog: {
            showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [targetLocation] })),
            showMessageBox,
          },
        })

        const saveEvent = { returnValue: null }
        ipcMain.listeners.get('save-app-state')(saveEvent, { serializedState: serializedAppState('dawn'), baseRevision: 1 })

        await expect(ipcMain.handlers.get('move-storage-profile')()).resolves.toMatchObject({
          ok: true,
          status: {
            profileRootPath: defaultNotebookRoot(userDataPath),
            notebookPath: targetRoot,
            syncTargetPath: targetRoot,
            knownNotebooks: [
              expect.objectContaining({ notebookPath: targetRoot, isActive: true }),
            ],
          },
        })
        expect(showMessageBox).toHaveBeenCalledWith(expect.objectContaining({
          buttons: ['Keep old copy', 'Move old copy to Trash', 'Cancel'],
        }))
        expect(readFileSync(path.join(targetLocation, 'readme.txt'), 'utf8')).toBe('keep me')
        expect(loadAppStateResult(targetRoot, { userSettingsRoot: userDataPath }).ok).toBe(true)
      } finally {
        rmSync(targetLocation, { recursive: true, force: true })
      }
    }))

  it('prompts to replace a same-named child notebook inside a selected parent location', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      saveDefaultTestNotebook(userDataPath, serializedAppState('light'))
      const targetLocation = mkdtempSync(path.join(os.tmpdir(), 'tabs-child-notebook-location-'))
      const targetRoot = path.join(targetLocation, STORAGE_PROFILE_DEFAULT_NOTEBOOK_NAME)
      try {
        saveTestNotebook(targetRoot, serializedAppState('light'), userDataPath)
        const ipcMain = createIpcMain()
        const showMessageBox = vi.fn(async () => ({ response: 0 }))
        registerStorageIpc({
          ipcMain,
          app: { getPath: () => userDataPath },
          BrowserWindow: createBrowserWindow(),
          dialog: {
            showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [targetLocation] })),
            showMessageBox,
          },
        })

        const saveEvent = { returnValue: null }
        ipcMain.listeners.get('save-app-state')(saveEvent, { serializedState: serializedAppState('dawn'), baseRevision: 1 })

        await expect(ipcMain.handlers.get('move-storage-profile')()).resolves.toMatchObject({
          ok: true,
          status: { profileRootPath: defaultNotebookRoot(userDataPath), notebookPath: targetRoot },
        })
        expect(showMessageBox).toHaveBeenCalledWith(expect.objectContaining({
          buttons: ['Replace and keep old copy', 'Replace and move old copy to Trash', 'Cancel'],
        }))
        const targetResult = loadAppStateResult(targetRoot, { userSettingsRoot: userDataPath })
        expect(targetResult.ok).toBe(true)
        expect(JSON.parse(targetResult.serializedState).theme).toBe('dawn')
      } finally {
        rmSync(targetLocation, { recursive: true, force: true })
      }
    }))

  it('rejects moving current app data when the same-named child is non-empty without a notebook manifest', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      saveDefaultTestNotebook(userDataPath, serializedAppState('light'))
      const targetLocation = mkdtempSync(path.join(os.tmpdir(), 'tabs-invalid-child-location-'))
      const targetRoot = path.join(targetLocation, STORAGE_PROFILE_DEFAULT_NOTEBOOK_NAME)
      try {
        mkdirSync(targetRoot)
        writeFileSync(path.join(targetRoot, 'readme.txt'), 'keep me', 'utf8')
        const ipcMain = createIpcMain()
        const showMessageBox = vi.fn(async () => ({ response: 0 }))
        registerStorageIpc({
          ipcMain,
          app: { getPath: () => userDataPath },
          BrowserWindow: createBrowserWindow(),
          dialog: {
            showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [targetLocation] })),
            showMessageBox,
          },
        })

        const saveEvent = { returnValue: null }
        ipcMain.listeners.get('save-app-state')(saveEvent, { serializedState: serializedAppState('dawn'), baseRevision: 1 })

        await expect(ipcMain.handlers.get('move-storage-profile')()).resolves.toMatchObject({
          ok: false,
          error: 'Notebook folder must be empty or contain manifest.json.',
        })
        expect(showMessageBox).not.toHaveBeenCalled()
        expect(readFileSync(path.join(targetRoot, 'readme.txt'), 'utf8')).toBe('keep me')
      } finally {
        rmSync(targetLocation, { recursive: true, force: true })
      }
    }))

  it('moves the old notebook folder to Trash after the new notebook loads when requested', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const sourceRoot = mkdtempSync(path.join(os.tmpdir(), 'tabs-trash-move-source-'))
      const targetRoot = mkdtempSync(path.join(os.tmpdir(), 'tabs-trash-move-target-'))
      try {
        saveTestNotebook(sourceRoot, serializedAppState('light'), userDataPath)
        writeStorageProfileConfig(userDataPath, sourceRoot)
        const trashItem = vi.fn(async (sourcePath) => {
          expect(loadAppStateResult(targetRoot, { userSettingsRoot: userDataPath }).ok).toBe(true)
          rmSync(sourcePath, { recursive: true, force: true })
        })
        const ipcMain = createIpcMain()
        registerStorageIpc({
          ipcMain,
          app: { getPath: () => userDataPath },
          BrowserWindow: createBrowserWindow(),
          dialog: {
            showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [targetRoot] })),
            showMessageBox: vi.fn(async () => ({ response: 1 })),
          },
          shell: { trashItem },
        })

        const saveEvent = { returnValue: null }
        ipcMain.listeners.get('save-app-state')(saveEvent, { serializedState: serializedAppState('dawn'), baseRevision: 1 })

        await expect(ipcMain.handlers.get('move-storage-profile')()).resolves.toMatchObject({
          ok: true,
          status: { notebookPath: targetRoot },
        })
        expect(trashItem).toHaveBeenCalledWith(sourceRoot)
        expect(existsSync(sourceRoot)).toBe(false)
        expect(loadAppStateResult(targetRoot, { userSettingsRoot: userDataPath }).ok).toBe(true)
      } finally {
        rmSync(sourceRoot, { recursive: true, force: true })
        rmSync(targetRoot, { recursive: true, force: true })
      }
    }))

  it('keeps a successful move when trashing the old notebook folder fails', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const sourceRoot = mkdtempSync(path.join(os.tmpdir(), 'tabs-trash-warning-source-'))
      const targetRoot = mkdtempSync(path.join(os.tmpdir(), 'tabs-trash-warning-target-'))
      try {
        saveTestNotebook(sourceRoot, serializedAppState('light'), userDataPath)
        writeStorageProfileConfig(userDataPath, sourceRoot)
        const trashItem = vi.fn(async () => {
          throw new Error('permission denied')
        })
        const ipcMain = createIpcMain()
        registerStorageIpc({
          ipcMain,
          app: { getPath: () => userDataPath },
          BrowserWindow: createBrowserWindow(),
          dialog: {
            showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [targetRoot] })),
            showMessageBox: vi.fn(async () => ({ response: 1 })),
          },
          shell: { trashItem },
        })

        const saveEvent = { returnValue: null }
        ipcMain.listeners.get('save-app-state')(saveEvent, { serializedState: serializedAppState('dawn'), baseRevision: 1 })

        await expect(ipcMain.handlers.get('move-storage-profile')()).resolves.toMatchObject({
          ok: true,
          status: { notebookPath: targetRoot },
          warning: 'Old notebook folder was kept because it could not be moved to Trash: permission denied',
        })
        expect(trashItem).toHaveBeenCalledWith(sourceRoot)
        expect(existsSync(sourceRoot)).toBe(true)
        expect(loadAppStateResult(targetRoot, { userSettingsRoot: userDataPath }).ok).toBe(true)
      } finally {
        rmSync(sourceRoot, { recursive: true, force: true })
        rmSync(targetRoot, { recursive: true, force: true })
      }
    }))

  it('opens notebooks while preserving global user settings and remembering the folder', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      saveDefaultTestNotebook(userDataPath, serializedAppState('light'))
      const targetRoot = mkdtempSync(path.join(os.tmpdir(), 'tabs-switch-target-'))
      try {
        const targetState = JSON.parse(serializedAppState('light'))
        targetState.domains[0].name = 'Target Domain'
        saveTestNotebook(targetRoot, JSON.stringify(targetState), userDataPath)

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
        ipcMain.listeners.get('save-app-state')(saveEvent, { serializedState: serializedAppState('dawn'), baseRevision: 1 })
        window.webContents.send.mockClear()

        await expect(ipcMain.handlers.get('open-notebook')()).resolves.toMatchObject({
          ok: true,
          status: {
            notebookPath: targetRoot,
            syncTargetPath: targetRoot,
            isDefault: false,
            knownNotebooks: [
              expect.objectContaining({ notebookPath: defaultNotebookRoot(userDataPath), isDefault: false }),
              expect.objectContaining({ notebookPath: targetRoot, isActive: true }),
            ],
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

  it('rejects opening a folder without a notebook', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
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

        await expect(ipcMain.handlers.get('open-notebook')()).resolves.toMatchObject({
          ok: false,
          error: 'Notebook folder could not be loaded.',
        })
      } finally {
        rmSync(targetRoot, { recursive: true, force: true })
      }
    }))

  it('switches only to remembered notebooks and forgets inactive notebooks', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const targetRoot = mkdtempSync(path.join(os.tmpdir(), 'tabs-remembered-target-'))
      const unknownRoot = mkdtempSync(path.join(os.tmpdir(), 'tabs-unknown-target-'))
      try {
        saveDefaultTestNotebook(userDataPath, serializedAppState('dawn'))
        saveTestNotebook(targetRoot, serializedAppState('light'), userDataPath)
        saveTestNotebook(unknownRoot, serializedAppState('light'), userDataPath)
        writeStorageProfileConfig(userDataPath, defaultNotebookRoot(userDataPath), { rememberPaths: [targetRoot] })

        const ipcMain = createIpcMain()
        registerStorageIpc({
          ipcMain,
          app: { getPath: () => userDataPath },
          BrowserWindow: createBrowserWindow(),
        })

        await expect(ipcMain.handlers.get('switch-notebook')(null, { notebookPath: unknownRoot })).resolves.toMatchObject({
          ok: false,
          error: 'Notebook is not in the notebook library.',
        })

        await expect(ipcMain.handlers.get('switch-notebook')(null, { notebookPath: targetRoot })).resolves.toMatchObject({
          ok: true,
          status: {
            notebookPath: targetRoot,
            knownNotebooks: [
              expect.objectContaining({ notebookPath: defaultNotebookRoot(userDataPath), isActive: false }),
              expect.objectContaining({ notebookPath: targetRoot, isActive: true }),
            ],
          },
        })

        await expect(ipcMain.handlers.get('forget-notebook')(null, { notebookPath: targetRoot })).resolves.toMatchObject({
          ok: false,
          error: 'The active notebook cannot be removed from the list.',
        })

        await expect(ipcMain.handlers.get('switch-notebook')(null, { notebookPath: defaultNotebookRoot(userDataPath) })).resolves.toMatchObject({
          ok: true,
          status: { profileRootPath: defaultNotebookRoot(userDataPath) },
        })
        await expect(ipcMain.handlers.get('forget-notebook')(null, { notebookPath: targetRoot })).resolves.toMatchObject({
          ok: true,
          status: {
            knownNotebooks: [
              expect.objectContaining({ notebookPath: defaultNotebookRoot(userDataPath) }),
            ],
          },
        })
        const status = await ipcMain.handlers.get('get-storage-profile-status')()
        expect(status.knownNotebooks.map((notebook) => notebook.notebookPath)).not.toContain(targetRoot)
      } finally {
        rmSync(targetRoot, { recursive: true, force: true })
        rmSync(unknownRoot, { recursive: true, force: true })
      }
    }))

  it('creates a new notebook without folder-local user settings', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const targetLocation = mkdtempSync(path.join(os.tmpdir(), 'tabs-new-notebook-location-'))
      const notebookName = 'Project Notes'
      const targetRoot = path.join(targetLocation, notebookName)
      try {
        const ipcMain = createIpcMain()
        registerStorageIpc({
          ipcMain,
          app: { getPath: () => userDataPath },
          BrowserWindow: createBrowserWindow(),
        })

        await expect(
          ipcMain.handlers.get('create-notebook')(null, {
            name: notebookName,
            locationPath: targetLocation,
            serializedState: serializedAppState('dawn'),
          }),
        ).resolves.toMatchObject({
          ok: true,
          status: {
            notebookPath: targetRoot,
            syncTargetPath: targetRoot,
            notebookName,
            isDefault: false,
            knownNotebooks: [
              expect.objectContaining({ notebookPath: targetRoot, isActive: true }),
            ],
          },
        })
        expect(existsSync(path.join(targetRoot, 'manifest.json'))).toBe(true)
        expect(existsSync(path.join(targetRoot, 'settings', 'app-settings.json'))).toBe(false)
        expect(JSON.parse(readFileSync(path.join(userDataPath, 'settings', 'app-settings.json'), 'utf8')).theme).toBe('dawn')
      } finally {
        rmSync(targetLocation, { recursive: true, force: true })
      }
    }))

  it('rejects new notebooks in existing notebook folders', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const targetLocation = mkdtempSync(path.join(os.tmpdir(), 'tabs-existing-notebook-location-'))
      const notebookName = 'Existing Notebook'
      const targetRoot = path.join(targetLocation, notebookName)
      try {
        saveAppState(targetRoot, serializedAppState('light'))

        const ipcMain = createIpcMain()
        registerStorageIpc({
          ipcMain,
          app: { getPath: () => userDataPath },
          BrowserWindow: createBrowserWindow(),
        })

        await expect(
          ipcMain.handlers.get('create-notebook')(null, {
            name: notebookName,
            locationPath: targetLocation,
            serializedState: serializedAppState('dawn'),
          }),
        ).resolves.toMatchObject({
          ok: false,
          error: 'This folder already exists. Choose a different notebook name.',
        })
      } finally {
        rmSync(targetLocation, { recursive: true, force: true })
      }
    }))

  it('handles canceled notebook location and open dialogs', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      const ipcMain = createIpcMain()
      registerStorageIpc({
        ipcMain,
        app: { getPath: () => userDataPath },
        BrowserWindow: createBrowserWindow(),
        dialog: {
          showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
        },
      })

      await expect(ipcMain.handlers.get('choose-notebook-location')()).resolves.toMatchObject({ canceled: true })
      await expect(ipcMain.handlers.get('open-notebook')()).resolves.toMatchObject({ canceled: true })
    }))

  it('uses the renderer app-state snapshot when choosing a folder before storage has current app state', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
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

        const sender = {
          id: 1,
          executeJavaScript: vi.fn(async () => serializedAppState('light')),
        }

        await expect(ipcMain.handlers.get('choose-storage-folder')({ sender })).resolves.toMatchObject({
          ok: true,
          status: {
            status: 'ready',
            notebookPath: targetRoot,
            syncTargetPath: targetRoot,
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
    withTempUserDataPathAsync(async (userDataPath) => {
      const targetRoot = mkdtempSync(path.join(os.tmpdir(), 'tabs-sync-target-'))
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
    withTempUserDataPathAsync(async (userDataPath) => {
      saveDefaultTestNotebook(userDataPath, serializedAppState('light'))
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
      ipcMain.listeners.get('save-app-state')(saveEvent, { serializedState: serializedAppState('dawn'), baseRevision: 1 })
      const externalState = JSON.parse(serializedAppState('dawn'))
      externalState.domains[0].name = 'External Domain'
      saveDefaultTestNotebook(userDataPath, JSON.stringify(externalState))

      await expect(ipcMain.handlers.get('retry-storage-profile')()).resolves.toMatchObject({
        ok: true,
        status: {
          status: 'ready',
          event: 'retry-loaded',
        },
      })
      expect(window.webContents.send).toHaveBeenCalledWith('app-state-updated', {
        serializedState: expect.stringContaining('External Domain'),
        revision: 3,
      })
    }))

  it('does not broadcast unchanged profile reloads on retry', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      saveDefaultTestNotebook(userDataPath, serializedAppState('light'))
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
      ipcMain.listeners.get('save-app-state')(saveEvent, { serializedState: serializedAppState('dawn'), baseRevision: 1 })
      window.webContents.send.mockClear()

      await expect(ipcMain.handlers.get('retry-storage-profile')()).resolves.toMatchObject({
        ok: true,
        status: {
          status: 'ready',
          event: 'retry-loaded',
          revision: 2,
        },
      })
      expect(window.webContents.send).not.toHaveBeenCalledWith('app-state-updated', expect.anything())
    }))

  it('keeps the local mirror when the active sync target becomes corrupt while running', () =>
    withTempUserDataPath((userDataPath) => {
      vi.useFakeTimers()
      vi.setSystemTime(1_000)
      const externalRoot = mkdtempSync(path.join(os.tmpdir(), 'tabs-runtime-corrupt-'))
      const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
      let storageSession = null
      try {
        saveTestNotebook(externalRoot, serializedAppState('dawn'), userDataPath)
        writeStorageProfileConfig(userDataPath, externalRoot)
        const window = {
          isDestroyed: vi.fn(() => false),
          webContents: { id: 2, send: vi.fn() },
        }
        const ipcMain = createIpcMain()
        storageSession = registerStorageIpc({
          ipcMain,
          app: { getPath: () => userDataPath },
          BrowserWindow: createBrowserWindow([window]),
        })
        const localMirrorPath = storageSession.getProfileRootPath()

        window.webContents.send.mockClear()
        writeFileSync(path.join(externalRoot, 'manifest.json'), '{nope', 'utf8')
        storageSession.scanStorageProfile()
        vi.advanceTimersByTime(400)

        expect(storageSession.getProfileRootPath()).toBe(localMirrorPath)
        expect(window.webContents.send).toHaveBeenCalledWith(
          'storage-profile-status-updated',
          expect.objectContaining({
            event: 'external-error',
            profileRootPath: localMirrorPath,
            notebookPath: externalRoot,
            syncStatus: 'error',
          }),
        )
        expect(window.webContents.send).not.toHaveBeenCalledWith('app-state-updated', expect.anything())
        expect(consoleInfoSpy).not.toHaveBeenCalledWith('[tabs:storage] notebook-auto-recovered:external-error')
      } finally {
        storageSession?.close()
        rmSync(externalRoot, { recursive: true, force: true })
        consoleInfoSpy.mockRestore()
        vi.useRealTimers()
      }
    }))

  it('marks the sync target offline when the active external notebook folder disappears', async () =>
    withTempUserDataPathAsync(async (userDataPath) => {
      vi.useFakeTimers()
      vi.setSystemTime(1_000)
      const externalRoot = mkdtempSync(path.join(os.tmpdir(), 'tabs-runtime-missing-'))
      const shell = { openPath: vi.fn(async () => '') }
      let storageSession = null
      try {
        saveTestNotebook(externalRoot, serializedAppState('dawn'), userDataPath)
        writeStorageProfileConfig(userDataPath, externalRoot)
        const ipcMain = createIpcMain()
        storageSession = registerStorageIpc({
          ipcMain,
          app: { getPath: () => userDataPath },
          BrowserWindow: createBrowserWindow(),
          shell,
        })
        const localMirrorPath = storageSession.getProfileRootPath()

        rmSync(externalRoot, { recursive: true, force: true })
        storageSession.scanStorageProfile()
        vi.advanceTimersByTime(400)

        const status = storageSession.getStorageProfileStatus()
        expect(status).toMatchObject({
          event: 'sync-target-offline',
          profileRootPath: localMirrorPath,
          notebookPath: externalRoot,
          syncTargetPath: externalRoot,
          syncStatus: 'offline',
          syncPending: true,
        })

        const loadEvent = { returnValue: null }
        ipcMain.listeners.get('load-app-state-result')(loadEvent)
        const state = JSON.parse(loadEvent.returnValue.serializedState)
        expect(state.messages ?? []).toEqual([])

        await expect(ipcMain.handlers.get('reveal-recovered-notebook-location')()).resolves.toEqual({
          ok: false,
          error: 'No recovered notebook folder is available.',
        })
        expect(shell.openPath).not.toHaveBeenCalled()
      } finally {
        storageSession?.close()
        rmSync(externalRoot, { recursive: true, force: true })
        vi.useRealTimers()
      }
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
      saveDefaultTestNotebook(userDataPath, serializedAppState('light'))
      const storageSession = registerStorageIpc({
        ipcMain,
        app: { getPath: () => userDataPath },
        BrowserWindow: createBrowserWindow([window]),
      })

      try {
        const withDomainName = (theme, name) => {
          const state = JSON.parse(serializedAppState(theme))
          state.domains[0].name = name
          return JSON.stringify(state)
        }
        const firstSerializedState = withDomainName('dawn', 'Domain One')
        const secondSerializedState = withDomainName('light', 'Domain Two')
        const firstSave = { sender: { id: 1 }, returnValue: null }
        ipcMain.listeners.get('save-app-state')(firstSave, {
          serializedState: firstSerializedState,
          baseRevision: 1,
        })
        const secondSave = { sender: { id: 1 }, returnValue: null }
        ipcMain.listeners.get('save-app-state')(secondSave, {
          serializedState: secondSerializedState,
          baseRevision: 2,
        })
        window.webContents.send.mockClear()

        vi.setSystemTime(10_000)
        writeFileSync(path.join(defaultNotebookRoot(userDataPath), '.DS_Store'), 'metadata', 'utf8')
        storageSession.scanStorageProfile()
        vi.advanceTimersByTime(400)

        expect(window.webContents.send).not.toHaveBeenCalledWith('storage-profile-status-updated', expect.anything())
        expect(window.webContents.send).not.toHaveBeenCalledWith('app-state-updated', expect.anything())
        expect(consoleInfoSpy).not.toHaveBeenCalledWith('[tabs:storage] external-error')
      } finally {
        storageSession.close()
        consoleInfoSpy.mockRestore()
        vi.useRealTimers()
      }
    }))

})
