import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  loadAppStateResult,
  resolveNotebookItemLocationRevealPath,
  resolveNoteLocationRevealPath,
  saveAppState,
  writeAssetToProfile,
} from './app-state-storage.mjs'

const tempRoots = []

function tempRoot() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'tabs-schema2-'))
  tempRoots.push(root)
  return root
}

afterEach(() => {
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop(), { recursive: true, force: true })
  }
})

function appState(overrides = {}) {
  return {
    theme: 'dawn',
    notebook: {
      activeNoteId: 'note-root',
      items: [
        {
          type: 'note',
          id: 'note-root',
          title: 'Inbox',
          noteBodyId: 'body-root',
        },
        {
          type: 'folder',
          id: 'folder-projects',
          title: 'Projects',
          children: [
            {
              type: 'note',
              id: 'note-duplicate-a',
              title: 'Duplicate',
              noteBodyId: 'body-linked',
            },
            {
              type: 'note',
              id: 'note-duplicate-b',
              title: 'Duplicate',
              noteBodyId: 'body-linked',
            },
            {
              type: 'note',
              id: 'note-multi',
              title: 'Aisle note',
              noteBodyId: 'body-multi',
            },
          ],
        },
      ],
      deletedItems: [
        {
          id: 'deleted-1',
          deletedAt: 100,
          item: { type: 'note', id: 'note-deleted', title: 'Deleted', noteBodyId: 'body-deleted' },
          originalParentFolderId: null,
          originalIndex: 1,
        },
      ],
      settings: {
        autoRemoveDeletedDays: 30,
      },
    },
    scratchpad: {
      noteBodyId: 'body-scratch',
      activeAisleId: 'aisle-scratch',
    },
    messages: [],
    toastHistory: [],
    noteBodies: [
      { id: 'body-root', aisles: [{ id: 'aisle-root', aisleBodyId: 'aisle-body-root' }] },
      { id: 'body-linked', aisles: [{ id: 'aisle-linked', aisleBodyId: 'aisle-body-linked' }] },
      {
        id: 'body-multi',
        aisles: [
          { id: 'aisle-multi-a', aisleBodyId: 'aisle-body-multi-a' },
          { id: 'aisle-multi-b', aisleBodyId: 'aisle-body-multi-b' },
        ],
      },
      { id: 'body-deleted', aisles: [{ id: 'aisle-deleted', aisleBodyId: 'aisle-body-deleted' }] },
      { id: 'body-scratch', aisles: [{ id: 'aisle-scratch', aisleBodyId: 'aisle-body-scratch' }] },
    ],
    noteAisleBodies: [
      {
        id: 'aisle-body-root',
        markdown: 'root markdown',
        tags: ['root'],
        frontmatter: { status: 'open' },
        frontmatterStatus: 'valid',
      },
      { id: 'aisle-body-linked', markdown: 'linked markdown', tags: [], frontmatter: null, frontmatterStatus: 'none' },
      { id: 'aisle-body-multi-a', markdown: 'left aisle', tags: [], frontmatter: null, frontmatterStatus: 'none' },
      { id: 'aisle-body-multi-b', markdown: 'right aisle', tags: [], frontmatter: null, frontmatterStatus: 'none' },
      { id: 'aisle-body-deleted', markdown: 'deleted markdown', tags: [], frontmatter: null, frontmatterStatus: 'none' },
      { id: 'aisle-body-scratch', markdown: 'scratch markdown', tags: [], frontmatter: null, frontmatterStatus: 'none' },
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
    ...overrides,
  }
}

function loadState(root) {
  const result = loadAppStateResult(root)
  expect(result.ok).toBe(true)
  return JSON.parse(result.serializedState)
}

describe('schema 2 app-state storage', () => {
  it('saves and loads root notes, nested folders, duplicate names, multi-aisle folders, frontmatter, scratchpad, and trash', () => {
    const root = tempRoot()
    const state = appState()

    const saveResult = saveAppState(root, JSON.stringify(state))
    expect(saveResult.ok).toBe(true)
    expect(existsSync(path.join(root, '.tabs', 'notebook-index.json'))).toBe(true)
    expect(readFileSync(path.join(root, 'Inbox--note-root.md'), 'utf8')).toContain('status: open')
    expect(existsSync(path.join(root, 'Projects--folder-projects', 'Aisle note--note-multi', 'aisle 1--aisle-multi-a.md'))).toBe(true)
    expect(existsSync(path.join(root, 'Projects--folder-projects', 'Duplicate--note-duplicate-a.md'))).toBe(true)
    expect(existsSync(path.join(root, 'Projects--folder-projects', 'Duplicate--note-duplicate-b.md'))).toBe(true)

    const reloaded = loadState(root)
    expect(reloaded.notebook.items[1].children).toHaveLength(3)
    expect(reloaded.noteAisleBodies.find((body) => body.id === 'aisle-body-root').frontmatter).toEqual({ status: 'open' })
    expect(reloaded.noteAisleBodies.find((body) => body.id === 'aisle-body-deleted').markdown).toBe('deleted markdown')
    expect(reloaded.noteAisleBodies.find((body) => body.id === 'aisle-body-scratch').markdown).toBe('scratch markdown')
  })

  it('updates a shared note body when only one linked mirror changes', () => {
    const root = tempRoot()
    saveAppState(root, JSON.stringify(appState()))
    writeFileSync(path.join(root, 'Projects--folder-projects', 'Duplicate--note-duplicate-a.md'), 'changed once')

    const reloaded = loadState(root)
    const linkedNotes = reloaded.notebook.items[1].children.filter((item) => item.title === 'Duplicate')
    expect(new Set(linkedNotes.map((item) => item.noteBodyId))).toEqual(new Set(['body-linked']))
    expect(reloaded.noteAisleBodies.find((body) => body.id === 'aisle-body-linked').markdown).toBe('changed once')
  })

  it('auto-decouples linked mirrors when multiple changed versions conflict', () => {
    const root = tempRoot()
    saveAppState(root, JSON.stringify(appState()))
    writeFileSync(path.join(root, 'Projects--folder-projects', 'Duplicate--note-duplicate-a.md'), 'changed a')
    writeFileSync(path.join(root, 'Projects--folder-projects', 'Duplicate--note-duplicate-b.md'), 'changed b')

    const reloaded = loadState(root)
    const linkedNotes = reloaded.notebook.items[1].children.filter((item) => item.title === 'Duplicate')
    expect(new Set(linkedNotes.map((item) => item.noteBodyId)).size).toBe(2)
    expect(reloaded.messages.some((message) => message.type === 'duplicate-auto-decoupled')).toBe(true)
  })

  it('rejects unsupported old schemas instead of converting them', () => {
    const root = tempRoot()
    writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ schemaVersion: 1 }))

    const result = loadAppStateResult(root)
    expect(result.ok).toBe(false)
    expect(result.issues?.[0]?.code).toBe('unsupported-schema')
  })

  it('writes assets and resolves visible note reveal paths', () => {
    const root = tempRoot()
    saveAppState(root, JSON.stringify(appState()))
    const asset = writeAssetToProfile(root, Buffer.from('asset'), 'png')
    const reveal = resolveNoteLocationRevealPath(root, { type: 'live-note', location: { noteId: 'note-root' } })
    const aisleReveal = resolveNoteLocationRevealPath(root, {
      type: 'live-note',
      location: { noteId: 'note-multi' },
      aisleId: 'aisle-multi-b',
    })

    expect(asset.url).toContain('tabs-asset:///assets/asset-')
    expect(existsSync(path.join(root, asset.assetPath))).toBe(true)
    expect(reveal).toMatchObject({ ok: true, rootRelativePath: 'Inbox--note-root.md' })
    expect(aisleReveal).toMatchObject({
      ok: true,
      rootRelativePath: 'Projects--folder-projects/Aisle note--note-multi/aisle 2--aisle-multi-b.md',
    })
  })

  it('resolves notebook note and folder items for sidebar reveal actions', () => {
    const root = tempRoot()
    saveAppState(root, JSON.stringify(appState()))

    expect(resolveNotebookItemLocationRevealPath(root, { itemId: 'note-root', itemType: 'note' })).toMatchObject({
      ok: true,
      rootRelativePath: 'Inbox--note-root.md',
    })
    expect(resolveNotebookItemLocationRevealPath(root, { itemId: 'folder-projects', itemType: 'folder' })).toMatchObject({
      ok: true,
      rootRelativePath: 'Projects--folder-projects',
    })
    expect(resolveNotebookItemLocationRevealPath(root, { itemId: 'folder-projects', itemType: 'note' })).toMatchObject({
      ok: false,
    })
  })
})
