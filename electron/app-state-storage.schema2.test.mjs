import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
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
  const root = mkdtempSync(path.join(os.tmpdir(), 'aislenote-schema2-'))
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

function linkedAisleAppState() {
  const state = appState()
  return {
    ...state,
    notebook: {
      ...state.notebook,
      activeNoteId: 'note-linked-a',
      items: [
        { type: 'note', id: 'note-linked-a', title: 'Linked A', noteBodyId: 'body-linked-a' },
        { type: 'note', id: 'note-linked-b', title: 'Linked B', noteBodyId: 'body-linked-b' },
      ],
      deletedItems: [],
    },
    scratchpad: undefined,
    noteBodies: [
      { id: 'body-linked-a', aisles: [{ id: 'aisle-linked-a', aisleBodyId: 'aisle-body-shared' }] },
      { id: 'body-linked-b', aisles: [{ id: 'aisle-linked-b', aisleBodyId: 'aisle-body-shared' }] },
    ],
    noteAisleBodies: [
      {
        id: 'aisle-body-shared',
        markdown: 'shared markdown',
        tags: ['shared'],
        frontmatter: null,
        frontmatterStatus: 'none',
      },
    ],
  }
}

function loadState(root) {
  const result = loadAppStateResult(root)
  expect(result.ok).toBe(true)
  return JSON.parse(result.serializedState)
}

function pathFromRoot(root, relativePath) {
  return relativePath ? path.join(root, ...relativePath.split('/')) : root
}

function readNotebookIndex(root) {
  return JSON.parse(readFileSync(pathFromRoot(root, '.aislenote/notebook-index.json'), 'utf8'))
}

function findNotebookIndexItem(items, itemId) {
  for (const item of items ?? []) {
    if ((item.type === 'note' || item.type === 'folder') && item.id === itemId) return item
    if (item.type === 'folder') {
      const child = findNotebookIndexItem(item.children, itemId)
      if (child) return child
    }
  }
  return null
}

function findNotebookIndexNote(root, noteId) {
  const item = findNotebookIndexItem(readNotebookIndex(root).items, noteId)
  expect(item?.type).toBe('note')
  return item
}

function expectVisiblePathSegment(segment) {
  expect(segment).toMatch(/--[a-f0-9]{8}(?:[a-f0-9]{2}){0,4}(?:-\d+)?(?:\.md)?$/)
  expect(segment).not.toMatch(/[<>:"/\\|?*\u0000-\u001f]/)
  expect(segment.length).toBeLessThanOrEqual(96)
  expect(Buffer.byteLength(segment, 'utf8')).toBeLessThanOrEqual(180)
}

function expectVisiblePath(relativePath) {
  for (const segment of relativePath.split('/')) {
    expectVisiblePathSegment(segment)
  }
}

describe('schema 2 app-state storage', () => {
  it('saves and loads root notes, nested folders, duplicate names, multi-aisle folders, frontmatter, scratchpad, and trash', () => {
    const root = tempRoot()
    const state = appState()

    const saveResult = saveAppState(root, JSON.stringify(state))
    expect(saveResult.ok).toBe(true)
    expect(existsSync(path.join(root, '.aislenote', 'notebook-index.json'))).toBe(true)
    const index = readNotebookIndex(root)
    const inbox = findNotebookIndexItem(index.items, 'note-root')
    const projects = findNotebookIndexItem(index.items, 'folder-projects')
    const duplicateA = findNotebookIndexItem(index.items, 'note-duplicate-a')
    const duplicateB = findNotebookIndexItem(index.items, 'note-duplicate-b')
    const multi = findNotebookIndexItem(index.items, 'note-multi')

    expect(inbox.file).toMatch(/^Inbox--[a-f0-9]{8}\.md$/)
    expect(inbox.file).not.toContain('note-root')
    expect(projects.path).toMatch(/^Projects--[a-f0-9]{8}$/)
    expect(projects.path).not.toContain('folder-projects')
    expect(duplicateA.file).not.toBe(duplicateB.file)
    expectVisiblePath(inbox.file)
    expectVisiblePath(projects.path)
    expectVisiblePath(duplicateA.file)
    expectVisiblePath(duplicateB.file)
    expectVisiblePath(multi.aisleFiles[0].file)
    expect(readFileSync(pathFromRoot(root, inbox.file), 'utf8')).toContain('status: open')
    expect(existsSync(pathFromRoot(root, multi.aisleFiles[0].file))).toBe(true)
    expect(existsSync(pathFromRoot(root, duplicateA.file))).toBe(true)
    expect(existsSync(pathFromRoot(root, duplicateB.file))).toBe(true)

    const reloaded = loadState(root)
    expect(reloaded.notebook.items[1].children).toHaveLength(3)
    expect(reloaded.noteAisleBodies.find((body) => body.id === 'aisle-body-root').frontmatter).toEqual({ status: 'open' })
    expect(reloaded.noteAisleBodies.find((body) => body.id === 'aisle-body-deleted').markdown).toBe('deleted markdown')
    expect(reloaded.noteAisleBodies.find((body) => body.id === 'aisle-body-scratch').markdown).toBe('scratch markdown')
  })

  it('keeps exact titles in metadata while writing sanitized short-hash paths', () => {
    const root = tempRoot()
    const state = appState()
    const uuidNoteId = '550e8400-e29b-41d4-a716-446655440000'
    const uuidLongNoteId = '550e8400-e29b-41d4-a716-446655440001'
    const uuidMultiNoteId = '550e8400-e29b-41d4-a716-446655440002'
    const unicodeTitle = '2026/06/20: \u65e5\u672c\u8a9e * Notes?'

    state.notebook.items.push(
      { type: 'folder', id: '550e8400-e29b-41d4-a716-446655440003', title: 'Duplicate Folder', children: [] },
      { type: 'folder', id: '550e8400-e29b-41d4-a716-446655440004', title: 'Duplicate Folder', children: [] },
      { type: 'note', id: uuidNoteId, title: unicodeTitle, noteBodyId: 'body-unicode' },
      { type: 'note', id: uuidLongNoteId, title: 'Very Long Note Title '.repeat(12), noteBodyId: 'body-long-title' },
      { type: 'note', id: uuidMultiNoteId, title: 'Multi/UUID Note', noteBodyId: 'body-uuid-multi' },
    )
    state.noteBodies.push(
      { id: 'body-unicode', aisles: [{ id: 'aisle-unicode', aisleBodyId: 'aisle-body-unicode' }] },
      { id: 'body-long-title', aisles: [{ id: 'aisle-long-title', aisleBodyId: 'aisle-body-long-title' }] },
      {
        id: 'body-uuid-multi',
        aisles: [
          { id: '550e8400-e29b-41d4-a716-446655440005', aisleBodyId: 'aisle-body-uuid-multi-a' },
          { id: '550e8400-e29b-41d4-a716-446655440006', aisleBodyId: 'aisle-body-uuid-multi-b' },
        ],
      },
    )
    state.noteAisleBodies.push(
      { id: 'aisle-body-unicode', markdown: 'unicode markdown', tags: [], frontmatter: null, frontmatterStatus: 'none' },
      { id: 'aisle-body-long-title', markdown: 'long markdown', tags: [], frontmatter: null, frontmatterStatus: 'none' },
      { id: 'aisle-body-uuid-multi-a', markdown: 'multi a', tags: [], frontmatter: null, frontmatterStatus: 'none' },
      { id: 'aisle-body-uuid-multi-b', markdown: 'multi b', tags: [], frontmatter: null, frontmatterStatus: 'none' },
    )

    const saveResult = saveAppState(root, JSON.stringify(state))
    expect(saveResult.ok).toBe(true)
    const index = readNotebookIndex(root)
    const firstFolder = findNotebookIndexItem(index.items, '550e8400-e29b-41d4-a716-446655440003')
    const secondFolder = findNotebookIndexItem(index.items, '550e8400-e29b-41d4-a716-446655440004')
    const unicodeNote = findNotebookIndexItem(index.items, uuidNoteId)
    const longNote = findNotebookIndexItem(index.items, uuidLongNoteId)
    const multiNote = findNotebookIndexItem(index.items, uuidMultiNoteId)

    expect(firstFolder.path).not.toBe(secondFolder.path)
    expect(firstFolder.path).toMatch(/^Duplicate Folder--[a-f0-9]{8}$/)
    expect(secondFolder.path).toMatch(/^Duplicate Folder--[a-f0-9]{8}$/)
    expect(unicodeNote.title).toBe(unicodeTitle)
    expect(unicodeNote.file).toMatch(/^2026 06 20 \u65e5\u672c\u8a9e Notes--[a-f0-9]{8}\.md$/)
    expect(unicodeNote.file).not.toContain(uuidNoteId)
    expect(longNote.file).not.toContain(uuidLongNoteId)
    expect(path.posix.basename(longNote.file).length).toBeLessThanOrEqual(96)
    expect(multiNote.path).toMatch(/^Multi UUID Note--[a-f0-9]{8}$/)
    expect(multiNote.aisleFiles[0].file).toMatch(/\/aisle 1--[a-f0-9]{8}\.md$/)
    expect(multiNote.aisleFiles[1].file).toMatch(/\/aisle 2--[a-f0-9]{8}\.md$/)
    expectVisiblePath(firstFolder.path)
    expectVisiblePath(secondFolder.path)
    expectVisiblePath(unicodeNote.file)
    expectVisiblePath(longNote.file)
    expectVisiblePath(multiNote.aisleFiles[0].file)
    expect(readFileSync(pathFromRoot(root, unicodeNote.file), 'utf8')).toBe('unicode markdown')

    const reloaded = loadState(root)
    expect(reloaded.notebook.items.find((item) => item.id === uuidNoteId).title).toBe(unicodeTitle)
    expect(reloaded.noteAisleBodies.find((body) => body.id === 'aisle-body-uuid-multi-b').markdown).toBe('multi b')
  })

  it('updates a shared note body when only one linked mirror changes', () => {
    const root = tempRoot()
    saveAppState(root, JSON.stringify(appState()))
    const duplicateA = findNotebookIndexNote(root, 'note-duplicate-a')
    const duplicateB = findNotebookIndexNote(root, 'note-duplicate-b')
    writeFileSync(pathFromRoot(root, duplicateA.file), 'changed once')

    const reloaded = loadState(root)
    const linkedNotes = reloaded.notebook.items[1].children.filter((item) => item.title === 'Duplicate')
    expect(new Set(linkedNotes.map((item) => item.noteBodyId))).toEqual(new Set(['body-linked']))
    const linkedBodies = reloaded.noteAisleBodies.filter((body) => body.id === 'aisle-body-linked')
    expect(linkedBodies).toHaveLength(1)
    expect(linkedBodies[0].markdown).toBe('changed once')

    const saveResult = saveAppState(root, JSON.stringify(reloaded))
    expect(saveResult.ok).toBe(true)
    expect(readFileSync(pathFromRoot(root, duplicateA.file), 'utf8')).toBe('changed once')
    expect(readFileSync(pathFromRoot(root, duplicateB.file), 'utf8')).toBe('changed once')
  })

  it('keeps linked note mirrors and uses the newest changed mirror when multiple versions conflict', () => {
    const root = tempRoot()
    saveAppState(root, JSON.stringify(appState()))
    const duplicateA = findNotebookIndexNote(root, 'note-duplicate-a')
    const duplicateB = findNotebookIndexNote(root, 'note-duplicate-b')
    const older = new Date('2026-01-01T00:00:00.000Z')
    const newer = new Date('2026-01-01T00:00:10.000Z')
    writeFileSync(pathFromRoot(root, duplicateA.file), 'changed a')
    writeFileSync(pathFromRoot(root, duplicateB.file), 'changed b')
    utimesSync(pathFromRoot(root, duplicateA.file), older, older)
    utimesSync(pathFromRoot(root, duplicateB.file), newer, newer)

    const reloaded = loadState(root)
    const linkedNotes = reloaded.notebook.items[1].children.filter((item) => item.title === 'Duplicate')
    expect(new Set(linkedNotes.map((item) => item.noteBodyId))).toEqual(new Set(['body-linked']))
    expect(reloaded.noteAisleBodies.filter((body) => body.id === 'aisle-body-linked')).toHaveLength(1)
    expect(reloaded.noteAisleBodies.find((body) => body.id === 'aisle-body-linked').markdown).toBe('changed b')
    expect(reloaded.messages.some((message) => message.type === 'duplicate-auto-decoupled')).toBe(false)
  })

  it('updates linked aisle mirrors across different note bodies from one externally changed file', () => {
    const root = tempRoot()
    saveAppState(root, JSON.stringify(linkedAisleAppState()))
    const noteA = findNotebookIndexNote(root, 'note-linked-a')
    const noteB = findNotebookIndexNote(root, 'note-linked-b')
    writeFileSync(pathFromRoot(root, noteA.file), 'external aisle edit')

    const reloaded = loadState(root)
    expect(new Set(reloaded.noteBodies.flatMap((body) => body.aisles.map((aisle) => aisle.aisleBodyId))))
      .toEqual(new Set(['aisle-body-shared']))
    const sharedBodies = reloaded.noteAisleBodies.filter((body) => body.id === 'aisle-body-shared')
    expect(sharedBodies).toHaveLength(1)
    expect(sharedBodies[0].markdown).toBe('external aisle edit')

    const saveResult = saveAppState(root, JSON.stringify(reloaded))
    expect(saveResult.ok).toBe(true)
    expect(readFileSync(pathFromRoot(root, noteA.file), 'utf8')).toBe('external aisle edit')
    expect(readFileSync(pathFromRoot(root, noteB.file), 'utf8')).toBe('external aisle edit')
  })

  it('uses the newest changed linked aisle mirror without decoupling different note bodies', () => {
    const root = tempRoot()
    saveAppState(root, JSON.stringify(linkedAisleAppState()))
    const noteA = findNotebookIndexNote(root, 'note-linked-a')
    const noteB = findNotebookIndexNote(root, 'note-linked-b')
    const older = new Date('2026-01-01T00:00:00.000Z')
    const newer = new Date('2026-01-01T00:00:10.000Z')
    writeFileSync(pathFromRoot(root, noteA.file), 'older linked aisle edit')
    writeFileSync(pathFromRoot(root, noteB.file), 'newer linked aisle edit')
    utimesSync(pathFromRoot(root, noteA.file), older, older)
    utimesSync(pathFromRoot(root, noteB.file), newer, newer)

    const reloaded = loadState(root)
    expect(reloaded.noteBodies).toHaveLength(2)
    expect(new Set(reloaded.noteBodies.flatMap((body) => body.aisles.map((aisle) => aisle.aisleBodyId))))
      .toEqual(new Set(['aisle-body-shared']))
    expect(reloaded.noteAisleBodies.filter((body) => body.id === 'aisle-body-shared')).toHaveLength(1)
    expect(reloaded.noteAisleBodies.find((body) => body.id === 'aisle-body-shared').markdown).toBe('newer linked aisle edit')
    expect(reloaded.messages.some((message) => message.type === 'duplicate-auto-decoupled')).toBe(false)
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
    const inbox = findNotebookIndexNote(root, 'note-root')
    const multi = findNotebookIndexNote(root, 'note-multi')
    const aisleB = multi.aisleFiles.find((aisleFile) => aisleFile.aisleId === 'aisle-multi-b')
    const asset = writeAssetToProfile(root, Buffer.from('asset'), 'png')
    const reveal = resolveNoteLocationRevealPath(root, { type: 'live-note', location: { noteId: 'note-root' } })
    const aisleReveal = resolveNoteLocationRevealPath(root, {
      type: 'live-note',
      location: { noteId: 'note-multi' },
      aisleId: 'aisle-multi-b',
    })

    expect(asset.url).toContain('aislenote-asset:///assets/asset-')
    expect(existsSync(path.join(root, asset.assetPath))).toBe(true)
    expect(reveal).toMatchObject({ ok: true, rootRelativePath: inbox.file })
    expect(aisleReveal).toMatchObject({
      ok: true,
      rootRelativePath: aisleB.file,
    })
  })

  it('resolves notebook note and folder items for sidebar reveal actions', () => {
    const root = tempRoot()
    saveAppState(root, JSON.stringify(appState()))
    const inbox = findNotebookIndexNote(root, 'note-root')
    const projects = findNotebookIndexItem(readNotebookIndex(root).items, 'folder-projects')

    expect(resolveNotebookItemLocationRevealPath(root, { itemId: 'note-root', itemType: 'note' })).toMatchObject({
      ok: true,
      rootRelativePath: inbox.file,
    })
    expect(resolveNotebookItemLocationRevealPath(root, { itemId: 'folder-projects', itemType: 'folder' })).toMatchObject({
      ok: true,
      rootRelativePath: projects.path,
    })
    expect(resolveNotebookItemLocationRevealPath(root, { itemId: 'folder-projects', itemType: 'note' })).toMatchObject({
      ok: false,
    })
  })
})
