import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadAppStateResult, saveAppState } from './app-state-storage.mjs'
import {
  NOTEBOOK_LIBRARY_CONFIG_FILE,
  createNotebookRecord,
  createNotebookRecordFromExistingFolder,
  createProfileFromNotebookLibrary,
  initializeNotebookLibrary,
  writeNotebookLibrary,
} from './notebook-library.mjs'
import {
  STORAGE_PROFILE_CONFIG_FILE,
  STORAGE_PROFILE_DEFAULT_NOTEBOOK_NAME,
} from './storage-profile.mjs'

const tempRoots = []

function tempRoot() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'tabs-notebook-library-'))
  tempRoots.push(root)
  return root
}

afterEach(() => {
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop(), { recursive: true, force: true })
  }
})

function appState(markdown = 'original markdown') {
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
      {
        id: 'aisle-body-root',
        markdown,
        tags: [],
        frontmatter: null,
        frontmatterStatus: 'none',
      },
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

function writeRawLibrary(userDataPath, library) {
  mkdirSync(userDataPath, { recursive: true })
  writeFileSync(
    path.join(userDataPath, NOTEBOOK_LIBRARY_CONFIG_FILE),
    `${JSON.stringify(library, null, 2)}\n`,
    'utf8',
  )
}

function readRawLibrary(userDataPath) {
  return JSON.parse(readFileSync(path.join(userDataPath, NOTEBOOK_LIBRARY_CONFIG_FILE), 'utf8'))
}

function readNotebookIndex(root) {
  return JSON.parse(readFileSync(path.join(root, '.tabs', 'notebook-index.json'), 'utf8'))
}

function getRootNotePath(root) {
  const note = readNotebookIndex(root).items.find((item) => item.id === 'note-root')
  expect(note?.type).toBe('note')
  return path.join(root, ...note.file.split('/'))
}

function getMarkdown(root) {
  const result = loadAppStateResult(root)
  expect(result.ok).toBe(true)
  const state = JSON.parse(result.serializedState)
  return state.noteAisleBodies.find((body) => body.id === 'aisle-body-root')?.markdown
}

describe('notebook library folders', () => {
  it('initializes a fresh desktop profile with no active notebook', () => {
    const root = tempRoot()
    const userDataPath = path.join(root, 'user-data')
    mkdirSync(userDataPath, { recursive: true })

    const library = initializeNotebookLibrary(userDataPath)
    const profile = createProfileFromNotebookLibrary(userDataPath, library)

    expect(library).toEqual({ version: 1, activeNotebookId: null, notebooks: [] })
    expect(profile).toMatchObject({
      setupRequired: true,
      profileRootPath: '',
      notebookPath: '',
      notebookId: null,
      notebookName: '',
      knownNotebookPaths: [],
    })
    expect(readRawLibrary(userDataPath)).toEqual(library)
  })

  it('creates notebook records directly in the selected notebook folder', () => {
    const root = tempRoot()
    const userDataPath = path.join(root, 'user-data')
    const notebookPath = path.join(root, 'Notebooks', 'Christianity')
    mkdirSync(userDataPath, { recursive: true })

    const record = createNotebookRecord(userDataPath, {
      notebookPath,
      serializedState: JSON.stringify(appState()),
    })
    const library = writeNotebookLibrary(userDataPath, {
      version: 1,
      activeNotebookId: record.id,
      notebooks: [record],
    })

    expect(record.notebookPath).toBe(path.resolve(notebookPath))
    expect(record).not.toHaveProperty('localMirrorPath')
    expect(record).not.toHaveProperty('syncTargetPath')
    expect(existsSync(path.join(notebookPath, 'manifest.json'))).toBe(true)
    expect(getMarkdown(notebookPath)).toBe('original markdown')
    expect(readRawLibrary(userDataPath).notebooks[0]).toEqual(library.notebooks[0])
  })

  it('cleans up the old app-private default notebook without migrating storage-profile.json', () => {
    const root = tempRoot()
    const userDataPath = path.join(root, 'user-data')
    const defaultNotebookPath = path.join(userDataPath, STORAGE_PROFILE_DEFAULT_NOTEBOOK_NAME)
    const externalNotebookPath = path.join(root, 'external-notebook')
    mkdirSync(userDataPath, { recursive: true })
    saveAppState(defaultNotebookPath, JSON.stringify(appState('old default markdown')), { userDataPath })
    saveAppState(externalNotebookPath, JSON.stringify(appState('external markdown')), {
      userDataPath,
      notebookId: 'external-notebook',
    })
    writeFileSync(
      path.join(userDataPath, STORAGE_PROFILE_CONFIG_FILE),
      `${JSON.stringify({ profileRootPath: externalNotebookPath }, null, 2)}\n`,
      'utf8',
    )

    const library = initializeNotebookLibrary(userDataPath)

    expect(library).toEqual({ version: 1, activeNotebookId: null, notebooks: [] })
    expect(existsSync(defaultNotebookPath)).toBe(false)
    expect(existsSync(path.join(userDataPath, STORAGE_PROFILE_CONFIG_FILE))).toBe(false)
    expect(existsSync(path.join(externalNotebookPath, 'manifest.json'))).toBe(true)
  })

  it('filters remembered records that point at the old app-private default folder', () => {
    const root = tempRoot()
    const userDataPath = path.join(root, 'user-data')
    const defaultNotebookPath = path.join(userDataPath, STORAGE_PROFILE_DEFAULT_NOTEBOOK_NAME)
    const externalNotebookPath = path.join(root, 'external-notebook')
    mkdirSync(userDataPath, { recursive: true })
    saveAppState(defaultNotebookPath, JSON.stringify(appState('old default markdown')), {
      userDataPath,
      notebookId: 'default-notebook',
    })
    saveAppState(externalNotebookPath, JSON.stringify(appState('external markdown')), {
      userDataPath,
      notebookId: 'external-notebook',
    })
    writeRawLibrary(userDataPath, {
      version: 1,
      activeNotebookId: 'default-notebook',
      notebooks: [
        {
          id: 'default-notebook',
          notebookPath: defaultNotebookPath,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'external-notebook',
          notebookPath: externalNotebookPath,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ],
    })

    const library = initializeNotebookLibrary(userDataPath)

    expect(library.activeNotebookId).toBe('external-notebook')
    expect(library.notebooks).toHaveLength(1)
    expect(library.notebooks[0]).toMatchObject({
      id: 'external-notebook',
      notebookPath: path.resolve(externalNotebookPath),
    })
    expect(existsSync(defaultNotebookPath)).toBe(false)
    expect(getMarkdown(externalNotebookPath)).toBe('external markdown')
  })

  it('opens an existing folder without a separate notebook name', () => {
    const root = tempRoot()
    const userDataPath = path.join(root, 'user-data')
    const notebookPath = path.join(root, 'Christianity')
    mkdirSync(userDataPath, { recursive: true })
    saveAppState(notebookPath, JSON.stringify(appState()), {
      userDataPath,
      notebookId: 'existing-notebook',
    })

    const result = createNotebookRecordFromExistingFolder(userDataPath, notebookPath)
    expect(result.ok).toBe(true)
    const library = writeNotebookLibrary(userDataPath, {
      version: 1,
      activeNotebookId: result.record.id,
      notebooks: [result.record],
    })
    const profile = createProfileFromNotebookLibrary(userDataPath, library)

    expect(result.record).toMatchObject({
      id: 'existing-notebook',
      notebookPath: path.resolve(notebookPath),
    })
    expect(profile.notebookName).toBe('Christianity')
    expect(readFileSync(getRootNotePath(notebookPath), 'utf8')).toBe('original markdown')
  })
})
