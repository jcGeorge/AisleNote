import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadAppStateResult, resolveNoteLocationRevealPath, saveAppState } from './app-state-storage.mjs'
import { reconcileNotebookLibraryForStartup, resolvePreferredNotebookRevealPath } from './ipc-storage.mjs'
import { createNotebookRecord } from './notebook-library.mjs'

const tempRoots = []

function tempRoot() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'tabs-ipc-storage-'))
  tempRoots.push(root)
  return root
}

afterEach(() => {
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop(), { recursive: true, force: true })
  }
})

function appState() {
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
      { id: 'aisle-body-root', markdown: 'markdown', tags: [], frontmatter: null, frontmatterStatus: 'none' },
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
  return JSON.parse(readFileSync(pathFromRoot(root, '.tabs/notebook-index.json'), 'utf8'))
}

function getRootNotePath(root) {
  const note = readNotebookIndex(root).items.find((item) => item.id === 'note-root')
  expect(note?.type).toBe('note')
  return pathFromRoot(root, note.file)
}

describe('preferred notebook reveal paths', () => {
  it('uses the sync target when reachable and falls back to the local mirror when offline', () => {
    const root = tempRoot()
    const localMirrorPath = path.join(root, 'mirror')
    const syncTargetPath = path.join(root, 'sync')
    const serializedState = JSON.stringify(appState())
    mkdirSync(localMirrorPath, { recursive: true })
    mkdirSync(syncTargetPath, { recursive: true })
    saveAppState(localMirrorPath, serializedState)
    saveAppState(syncTargetPath, serializedState)

    const synced = resolvePreferredNotebookRevealPath({
      profileRootPath: localMirrorPath,
      syncTargetPath,
      payload: { type: 'live-note', location: { noteId: 'note-root' } },
      resolvePath: resolveNoteLocationRevealPath,
    })
    expect(synced.ok).toBe(true)
    expect(synced.absolutePath.startsWith(syncTargetPath)).toBe(true)

    rmSync(syncTargetPath, { recursive: true, force: true })
    const offline = resolvePreferredNotebookRevealPath({
      profileRootPath: localMirrorPath,
      syncTargetPath,
      payload: { type: 'live-note', location: { noteId: 'note-root' } },
      resolvePath: resolveNoteLocationRevealPath,
    })
    expect(offline.ok).toBe(true)
    expect(offline.absolutePath.startsWith(localMirrorPath)).toBe(true)
  })
})

describe('startup notebook sync reconciliation', () => {
  it('loads closed-app sync target edits into the local mirror before startup state is read', () => {
    const root = tempRoot()
    const userDataPath = path.join(root, 'user-data')
    const syncTargetPath = path.join(root, 'sync')
    const serializedState = JSON.stringify(appState())
    mkdirSync(userDataPath, { recursive: true })

    const record = createNotebookRecord(userDataPath, {
      name: 'Synced',
      syncTargetPath,
      serializedState,
    })
    const library = {
      version: 1,
      activeNotebookId: record.id,
      notebooks: [record],
    }
    writeFileSync(getRootNotePath(syncTargetPath), 'closed app sync edit', 'utf8')

    const startup = reconcileNotebookLibraryForStartup(userDataPath, library)

    expect(startup.reconciliation?.ok).toBe(true)
    expect(startup.reconciliation?.changed).toBe(true)
    expect(readFileSync(getRootNotePath(record.localMirrorPath), 'utf8')).toBe('closed app sync edit')

    const loadResult = loadAppStateResult(record.localMirrorPath)
    expect(loadResult.ok).toBe(true)
    const loaded = JSON.parse(loadResult.serializedState)
    expect(loaded.noteAisleBodies.find((body) => body.id === 'aisle-body-root')?.markdown).toBe('closed app sync edit')
  })
})
