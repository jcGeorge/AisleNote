import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadAppStateResult } from './app-state-storage.mjs'
import {
  NOTEBOOK_LIBRARY_CONFIG_FILE,
  createNotebookRecord,
  normalizeNotebookSyncFiles,
  reconcileNotebookMirrorWithTarget,
  writeNotebookLibrary,
} from './notebook-library.mjs'

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
      {
        id: 'aisle-body-root',
        markdown: 'original markdown',
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

describe('notebook library sync checkpoints', () => {
  it('normalizes storage snapshots and legacy entries into sync-file checkpoints', () => {
    expect(normalizeNotebookSyncFiles({
      entries: [{ relativePath: 'Inbox.md', hash: 'abc123', size: 12 }],
    })).toEqual([{ path: 'Inbox.md', contentHash: 'abc123', byteLength: 12 }])

    expect(normalizeNotebookSyncFiles([
      { path: 'Inbox.md', contentHash: 'abc123', byteLength: 12 },
    ])).toEqual([{ path: 'Inbox.md', contentHash: 'abc123', byteLength: 12 }])
  })

  it('creates synced notebook records with array checkpoints', () => {
    const root = tempRoot()
    const userDataPath = path.join(root, 'user-data')
    const syncTargetPath = path.join(root, 'sync-target')
    mkdirSync(userDataPath, { recursive: true })

    const record = createNotebookRecord(userDataPath, {
      name: 'Synced',
      syncTargetPath,
      serializedState: JSON.stringify(appState()),
    })
    const library = writeNotebookLibrary(userDataPath, {
      version: 1,
      activeNotebookId: record.id,
      notebooks: [record],
    })

    expect(Array.isArray(record.syncFiles)).toBe(true)
    expect(record.syncFiles.some((entry) => entry.path.endsWith('.md'))).toBe(true)
    expect(JSON.parse(readFileSync(path.join(userDataPath, NOTEBOOK_LIBRARY_CONFIG_FILE), 'utf8')).notebooks[0].syncFiles)
      .toEqual(library.notebooks[0].syncFiles)
  })

  it('keeps local-mirror Markdown edits and copies them to the sync target', () => {
    const root = tempRoot()
    const userDataPath = path.join(root, 'user-data')
    const syncTargetPath = path.join(root, 'sync-target')
    mkdirSync(userDataPath, { recursive: true })
    const record = createNotebookRecord(userDataPath, {
      name: 'Synced',
      syncTargetPath,
      serializedState: JSON.stringify(appState()),
    })

    writeFileSync(getRootNotePath(record.localMirrorPath), 'local external markdown', 'utf8')

    const reconciliation = reconcileNotebookMirrorWithTarget(record)

    expect(reconciliation.ok).toBe(true)
    expect(reconciliation.changed).toBe(true)
    expect(readFileSync(getRootNotePath(syncTargetPath), 'utf8')).toBe('local external markdown')
    expect(getMarkdown(record.localMirrorPath)).toBe('local external markdown')
    expect(reconciliation.record.syncFiles.some((entry) => entry.path.endsWith('.md'))).toBe(true)
  })

  it('keeps sync-target Markdown edits and copies them to the local mirror', () => {
    const root = tempRoot()
    const userDataPath = path.join(root, 'user-data')
    const syncTargetPath = path.join(root, 'sync-target')
    mkdirSync(userDataPath, { recursive: true })
    const record = createNotebookRecord(userDataPath, {
      name: 'Synced',
      syncTargetPath,
      serializedState: JSON.stringify(appState()),
    })

    writeFileSync(getRootNotePath(syncTargetPath), 'target external markdown', 'utf8')

    const reconciliation = reconcileNotebookMirrorWithTarget(record)

    expect(reconciliation.ok).toBe(true)
    expect(reconciliation.changed).toBe(true)
    expect(readFileSync(getRootNotePath(record.localMirrorPath), 'utf8')).toBe('target external markdown')
    expect(getMarkdown(record.localMirrorPath)).toBe('target external markdown')
    expect(existsSync(getRootNotePath(syncTargetPath))).toBe(true)
  })
})
