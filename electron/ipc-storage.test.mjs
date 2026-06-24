import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadAppStateResult, resolveNoteLocationRevealPath, saveAppState } from './app-state-storage.mjs'
import { reconcileNotebookLibraryForStartup, registerStorageIpc, resolvePreferredNotebookRevealPath } from './ipc-storage.mjs'
import { NOTEBOOK_LIBRARY_CONFIG_FILE, createNotebookRecord } from './notebook-library.mjs'
import { STORAGE_PROFILE_CONFIG_FILE, STORAGE_PROFILE_DEFAULT_NOTEBOOK_NAME } from './storage-profile.mjs'

const tempRoots = []
const storageSessions = []

function tempRoot() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'aislenote-ipc-storage-'))
  tempRoots.push(root)
  return root
}

afterEach(() => {
  while (storageSessions.length > 0) {
    storageSessions.pop()?.close?.()
  }
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop(), { recursive: true, force: true })
  }
})

function appState(markdown = 'markdown') {
  return {
    theme: 'dawn',
    notebook: {
      activeNoteId: 'note-root',
      items: [{ type: 'note', id: 'note-root', title: 'Inbox', noteBodyId: 'body-root' }],
      deletedItems: [],
      settings: { autoRemoveDeletedDays: 30 },
    },
    messages: [],
    toastHistory: [],
    noteBodies: [{ id: 'body-root', aisles: [{ id: 'aisle-root', aisleBodyId: 'aisle-body-root' }] }],
    noteAisleBodies: [
      { id: 'aisle-body-root', markdown, tags: [], frontmatter: null, frontmatterStatus: 'none' },
    ],
    hotkeys: { shortcuts: {}, newlineShortcuts: { shortcuts: {}, menuOperations: [] } },
    frontmatter: { templates: [], settingsTemplateId: '', lastAppliedTemplateId: '' },
    ui: {
      sidebarCollapsed: false,
      sidebarWidth: 280,
      collapsedFolderIds: [],
      tableAddTargetMode: 'active-cell',
      tableDeleteTargetMode: 'active-cell',
      noteFontScale: 1,
      settingsSection: 'data',
      noteCursorLocations: {},
      headingCollapseState: {},
      seenTipIds: [],
      disabledTipIds: [],
    },
  }
}

function pathFromRoot(root, relativePath) {
  return relativePath ? path.join(root, ...relativePath.split('/')) : root
}

function readNotebookIndex(root) {
  return JSON.parse(readFileSync(pathFromRoot(root, '.aislenote/notebook-index.json'), 'utf8'))
}

function getRootNotePath(root) {
  const note = readNotebookIndex(root).items.find((item) => item.id === 'note-root')
  expect(note?.type).toBe('note')
  return pathFromRoot(root, note.file)
}

function createIpcMain() {
  const handlers = new Map()
  const listeners = new Map()
  return {
    handlers,
    listeners,
    handle: (channel, handler) => {
      handlers.set(channel, handler)
    },
    on: (channel, handler) => {
      listeners.set(channel, handler)
    },
  }
}

function createStorageSession(userDataPath, options = {}) {
  const ipcMain = createIpcMain()
  const session = registerStorageIpc({
    ipcMain,
    app: {
      getPath: (name) => {
        expect(name).toBe('userData')
        return userDataPath
      },
    },
    BrowserWindow: { getAllWindows: () => [] },
    dialog: options.dialog ?? null,
    shell: options.shell ?? { trashItem: vi.fn(async (folderPath) => rmSync(folderPath, { recursive: true, force: true })) },
  })
  storageSessions.push(session)
  return { ipcMain, session }
}

async function callHandler(ipcMain, channel, payload) {
  return ipcMain.handlers.get(channel)?.(null, payload)
}

function callSyncListener(ipcMain, channel, payload) {
  const event = { returnValue: undefined, sender: { id: 1 } }
  ipcMain.listeners.get(channel)?.(event, payload)
  return event.returnValue
}

describe('preferred notebook reveal paths', () => {
  it('uses the active notebook folder as the reveal source', () => {
    const root = tempRoot()
    const notebookPath = path.join(root, 'notebook')
    const otherNotebookPath = path.join(root, 'other-notebook')
    const serializedState = JSON.stringify(appState())
    mkdirSync(notebookPath, { recursive: true })
    mkdirSync(otherNotebookPath, { recursive: true })
    saveAppState(notebookPath, serializedState)
    saveAppState(otherNotebookPath, serializedState)

    const resolved = resolvePreferredNotebookRevealPath({
      profileRootPath: notebookPath,
      payload: { type: 'live-note', location: { noteId: 'note-root' } },
      resolvePath: resolveNoteLocationRevealPath,
    })

    expect(resolved.ok).toBe(true)
    expect(resolved.absolutePath.startsWith(notebookPath)).toBe(true)
    expect(resolved.absolutePath.startsWith(otherNotebookPath)).toBe(false)
  })
})

describe('startup notebook folder loading', () => {
  it('leaves folder-only notebook records unchanged and loads closed-app edits from the notebook folder', () => {
    const root = tempRoot()
    const userDataPath = path.join(root, 'user-data')
    const notebookPath = path.join(root, 'Christianity')
    mkdirSync(userDataPath, { recursive: true })

    const record = createNotebookRecord(userDataPath, {
      notebookPath,
      serializedState: JSON.stringify(appState()),
    })
    const library = {
      version: 1,
      activeNotebookId: record.id,
      notebooks: [record],
    }
    writeFileSync(getRootNotePath(notebookPath), 'closed app folder edit', 'utf8')

    const startup = reconcileNotebookLibraryForStartup(userDataPath, library)

    expect(startup.reconciliation).toBe(null)
    expect(startup.library).toEqual(library)

    const loadResult = loadAppStateResult(record.notebookPath)
    expect(loadResult.ok).toBe(true)
    const loaded = JSON.parse(loadResult.serializedState)
    expect(loaded.noteAisleBodies.find((body) => body.id === 'aisle-body-root')?.markdown).toBe('closed app folder edit')
  })
})

describe('notebook folder IPC operations', () => {
  it('starts fresh desktop profiles in setup-required state and blocks app-state saves', async () => {
    const root = tempRoot()
    const userDataPath = path.join(root, 'user-data')
    mkdirSync(userDataPath, { recursive: true })
    writeFileSync(
      path.join(userDataPath, STORAGE_PROFILE_CONFIG_FILE),
      `${JSON.stringify({ profileRootPath: path.join(root, 'legacy-external') }, null, 2)}\n`,
      'utf8',
    )
    saveAppState(path.join(userDataPath, STORAGE_PROFILE_DEFAULT_NOTEBOOK_NAME), JSON.stringify(appState('legacy default')), {
      userDataPath,
    })

    const { ipcMain, session } = createStorageSession(userDataPath)

    const status = await callHandler(ipcMain, 'get-storage-profile-status')
    expect(status).toMatchObject({
      status: 'setup-required',
      profileRootPath: '',
      notebookPath: '',
      notebookName: '',
      activeNotebookId: null,
      hasProfile: false,
      canWrite: false,
    })
    const loadResult = callSyncListener(ipcMain, 'load-app-state-result')
    expect(loadResult).toMatchObject({
      ok: false,
      serializedState: null,
      source: 'empty',
    })
    const saveResult = callSyncListener(ipcMain, 'save-app-state', {
      serializedState: JSON.stringify(appState('blocked')),
      baseRevision: 0,
    })
    expect(saveResult.ok).toBe(false)
    expect(session.canWriteAppState()).toBe(false)
    expect(existsSync(path.join(userDataPath, NOTEBOOK_LIBRARY_CONFIG_FILE))).toBe(true)
    expect(existsSync(path.join(userDataPath, STORAGE_PROFILE_CONFIG_FILE))).toBe(false)
    expect(existsSync(path.join(userDataPath, STORAGE_PROFILE_DEFAULT_NOTEBOOK_NAME))).toBe(false)
  })

  it('creates notebooks directly in selected folders and removes inactive notebooks from the list without deleting files', async () => {
    const root = tempRoot()
    const userDataPath = path.join(root, 'user-data')
    const notebooksRoot = path.join(root, 'notebooks')
    mkdirSync(userDataPath, { recursive: true })
    mkdirSync(notebooksRoot, { recursive: true })
    const { ipcMain } = createStorageSession(userDataPath)

    const first = await callHandler(ipcMain, 'create-notebook', {
      name: 'Christianity',
      locationPath: notebooksRoot,
    })
    expect(first.ok).toBe(true)
    const firstPath = path.join(notebooksRoot, 'Christianity')
    expect(first.status.notebookPath).toBe(firstPath)
    expect(existsSync(path.join(firstPath, 'manifest.json'))).toBe(true)

    const second = await callHandler(ipcMain, 'create-notebook', {
      name: 'Research',
      locationPath: notebooksRoot,
    })
    expect(second.ok).toBe(true)
    expect(second.status.notebookPath).toBe(path.join(notebooksRoot, 'Research'))

    const switched = await callHandler(ipcMain, 'switch-notebook', { notebookPath: firstPath })
    expect(switched.ok).toBe(true)
    expect(switched.status.notebookName).toBe('Christianity')

    const forgotten = await callHandler(ipcMain, 'forget-notebook', { notebookPath: path.join(notebooksRoot, 'Research') })
    expect(forgotten.ok).toBe(true)
    expect(existsSync(path.join(notebooksRoot, 'Research', 'manifest.json'))).toBe(true)
    expect(forgotten.status.knownNotebooks.map((notebook) => notebook.notebookName)).toEqual(['Christianity'])
  })

  it('creates a notebook from the native create dialog target path', async () => {
    const root = tempRoot()
    const userDataPath = path.join(root, 'user-data')
    const notebooksRoot = path.join(root, 'notebooks')
    const notebookPath = path.join(notebooksRoot, 'Daily Notes')
    mkdirSync(userDataPath, { recursive: true })
    mkdirSync(notebooksRoot, { recursive: true })
    const dialog = {
      showSaveDialog: vi.fn(async () => ({ canceled: false, filePath: notebookPath })),
    }
    const { ipcMain } = createStorageSession(userDataPath, { dialog })

    const created = await callHandler(ipcMain, 'create-notebook')

    expect(dialog.showSaveDialog).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Create notebook',
      buttonLabel: 'Create',
      properties: expect.arrayContaining(['createDirectory', 'showOverwriteConfirmation']),
    }))
    expect(created.ok).toBe(true)
    expect(created.status.notebookName).toBe('Daily Notes')
    expect(created.status.notebookPath).toBe(notebookPath)
    expect(existsSync(path.join(notebookPath, 'manifest.json'))).toBe(true)
  })

  it('leaves setup state unchanged when native notebook creation is canceled', async () => {
    const root = tempRoot()
    const userDataPath = path.join(root, 'user-data')
    mkdirSync(userDataPath, { recursive: true })
    const dialog = {
      showSaveDialog: vi.fn(async () => ({ canceled: true })),
    }
    const { ipcMain } = createStorageSession(userDataPath, { dialog })

    const created = await callHandler(ipcMain, 'create-notebook')

    expect(created).toMatchObject({
      canceled: true,
      status: {
        status: 'setup-required',
        notebookPath: '',
        canWrite: false,
      },
    })
  })

  it('renames the underlying notebook folder and updates the remembered path', async () => {
    const root = tempRoot()
    const userDataPath = path.join(root, 'user-data')
    const notebooksRoot = path.join(root, 'notebooks')
    mkdirSync(userDataPath, { recursive: true })
    mkdirSync(notebooksRoot, { recursive: true })
    const { ipcMain } = createStorageSession(userDataPath)

    const created = await callHandler(ipcMain, 'create-notebook', {
      name: 'Old Name',
      locationPath: notebooksRoot,
    })
    expect(created.ok).toBe(true)

    const renamed = await callHandler(ipcMain, 'rename-notebook', { name: 'New Name' })

    expect(renamed.ok).toBe(true)
    expect(renamed.status.notebookName).toBe('New Name')
    expect(renamed.status.notebookPath).toBe(path.join(notebooksRoot, 'New Name'))
    expect(existsSync(path.join(notebooksRoot, 'Old Name'))).toBe(false)
    expect(existsSync(path.join(notebooksRoot, 'New Name', 'manifest.json'))).toBe(true)
  })

  it('rejects creating or opening nested notebook folders', async () => {
    const root = tempRoot()
    const userDataPath = path.join(root, 'user-data')
    const notebooksRoot = path.join(root, 'notebooks')
    mkdirSync(userDataPath, { recursive: true })
    mkdirSync(notebooksRoot, { recursive: true })
    const dialog = {
      showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [notebooksRoot] })),
    }
    const { ipcMain } = createStorageSession(userDataPath, { dialog })

    const created = await callHandler(ipcMain, 'create-notebook', {
      name: 'Parent',
      locationPath: notebooksRoot,
    })
    expect(created.ok).toBe(true)
    const parentPath = path.join(notebooksRoot, 'Parent')

    const nestedCreate = await callHandler(ipcMain, 'create-notebook', {
      name: 'Child',
      locationPath: parentPath,
    })
    expect(nestedCreate.ok).toBe(false)
    expect(nestedCreate.error).toContain('Notebook folders cannot be nested')

    const parentOpen = await callHandler(ipcMain, 'open-notebook')
    expect(parentOpen.ok).toBe(false)
    expect(parentOpen.error).toContain('Notebook folders cannot be nested')
  })

  it('rejects opening non-AisleNote Markdown folders with import guidance', async () => {
    const root = tempRoot()
    const userDataPath = path.join(root, 'user-data')
    const markdownFolder = path.join(root, 'Christianity')
    mkdirSync(markdownFolder, { recursive: true })
    writeFileSync(path.join(markdownFolder, 'Sermon.md'), '# Sermon\n', 'utf8')
    const dialog = {
      showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [markdownFolder] })),
    }
    const { ipcMain } = createStorageSession(userDataPath, { dialog })

    const opened = await callHandler(ipcMain, 'open-notebook')

    expect(opened.ok).toBe(false)
    expect(opened.error).toContain('not an AisleNote notebook')
    expect(opened.error).toContain('Markdown import')
  })

  it('returns to setup-required after deleting the last notebook without creating a default folder', async () => {
    const root = tempRoot()
    const userDataPath = path.join(root, 'user-data')
    const notebooksRoot = path.join(root, 'notebooks')
    mkdirSync(notebooksRoot, { recursive: true })
    const { ipcMain } = createStorageSession(userDataPath)

    const created = await callHandler(ipcMain, 'create-notebook', {
      name: 'Only Notebook',
      locationPath: notebooksRoot,
    })
    expect(created.ok).toBe(true)
    const notebookPath = path.join(notebooksRoot, 'Only Notebook')

    const deleted = await callHandler(ipcMain, 'delete-notebook', { skipConfirmation: true })

    expect(deleted.ok).toBe(true)
    expect(deleted.status).toMatchObject({
      status: 'setup-required',
      profileRootPath: '',
      notebookPath: '',
      notebookName: '',
      activeNotebookId: null,
      canWrite: false,
    })
    expect(existsSync(notebookPath)).toBe(false)
    expect(existsSync(path.join(userDataPath, STORAGE_PROFILE_DEFAULT_NOTEBOOK_NAME))).toBe(false)
  })
})
