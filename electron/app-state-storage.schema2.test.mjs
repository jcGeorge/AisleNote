import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  getUserSettingsFilePath,
  loadAppStateResult,
  resolveVaultItemLocationRevealPath,
  resolveNoteLocationRevealPath,
  saveAppState,
  writeAssetToProfile,
  writeAppSettingsForState,
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
    theme: 'cheese',
    vault: {
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
    vault: {
      ...state.vault,
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

function readVaultIndex(root) {
  return JSON.parse(readFileSync(pathFromRoot(root, '.aislenote/vault-index.json'), 'utf8'))
}

function writeLegacyPortableSettingsToEditorState(root, state) {
  const editorStatePath = pathFromRoot(root, '.aislenote/editor-state.json')
  const editorState = JSON.parse(readFileSync(editorStatePath, 'utf8'))
  writeFileSync(
    editorStatePath,
    `${JSON.stringify({
      ...editorState,
      theme: state.theme,
      hotkeys: state.hotkeys,
      ui: {
        ...(editorState.ui ?? {}),
        ...(state.ui ?? {}),
      },
    }, null, 2)}\n`,
    'utf8',
  )
}

function findVaultIndexItem(items, itemId) {
  for (const item of items ?? []) {
    if ((item.type === 'note' || item.type === 'folder') && item.id === itemId) return item
    if (item.type === 'folder') {
      const child = findVaultIndexItem(item.children, itemId)
      if (child) return child
    }
  }
  return null
}

function findVaultIndexNote(root, noteId) {
  const item = findVaultIndexItem(readVaultIndex(root).items, noteId)
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
    state.vault.openTabs = [
      { noteId: 'note-root', status: 'retained' },
      { noteId: 'note-duplicate-a', status: 'temporary' },
    ]

    const saveResult = saveAppState(root, JSON.stringify(state))
    expect(saveResult.ok).toBe(true)
    expect(existsSync(path.join(root, '.aislenote', 'vault-index.json'))).toBe(true)
    const index = readVaultIndex(root)
    const inbox = findVaultIndexItem(index.items, 'note-root')
    const projects = findVaultIndexItem(index.items, 'folder-projects')
    const duplicateA = findVaultIndexItem(index.items, 'note-duplicate-a')
    const duplicateB = findVaultIndexItem(index.items, 'note-duplicate-b')
    const multi = findVaultIndexItem(index.items, 'note-multi')

    expect(index.openTabs).toEqual([
      { noteId: 'note-root', status: 'retained' },
      { noteId: 'note-duplicate-a', status: 'temporary' },
    ])
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
    expect(reloaded.vault.openTabs).toEqual(index.openTabs)
    expect(reloaded.vault.items[1].children).toHaveLength(3)
    expect(reloaded.noteAisleBodies.find((body) => body.id === 'aisle-body-root').frontmatter).toEqual({ status: 'open' })
    expect(reloaded.noteAisleBodies.find((body) => body.id === 'aisle-body-deleted').markdown).toBe('deleted markdown')
    expect(reloaded.noteAisleBodies.find((body) => body.id === 'aisle-body-scratch').markdown).toBe('scratch markdown')
  })

  it('loads older vault indexes without open tab state', () => {
    const root = tempRoot()
    const state = appState()
    const saveResult = saveAppState(root, JSON.stringify(state))
    expect(saveResult.ok).toBe(true)

    const indexPath = pathFromRoot(root, '.aislenote/vault-index.json')
    const index = JSON.parse(readFileSync(indexPath, 'utf8'))
    delete index.openTabs
    writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8')

    const reloaded = loadState(root)
    expect(reloaded.vault.openTabs).toEqual([{ noteId: 'note-root', status: 'temporary' }])
  })

  it('overlays app-support user settings when loading different vaults', () => {
    const root = tempRoot()
    const userDataPath = path.join(root, 'user-data')
    const vaultAPath = path.join(root, 'vault-a')
    const vaultBPath = path.join(root, 'vault-b')
    const vaultA = appState()
    vaultA.theme = 'light'
    vaultA.hotkeys.shortcuts.openSettings = 'Ctrl+Alt+,'
    vaultA.ui = {
      ...vaultA.ui,
      sidebarWidth: 333,
      settingsSection: 'data',
    }
    const vaultB = appState()
    vaultB.theme = 'cheese'
    vaultB.ui = {
      ...vaultB.ui,
      sidebarWidth: 444,
      settingsSection: 'hotkeys',
    }
    const appSettingsState = appState()
    appSettingsState.theme = 'custom1'
    appSettingsState.hotkeys.shortcuts.openSettings = 'Ctrl+,'
    appSettingsState.ui = {
      ...appSettingsState.ui,
      settingsSection: 'visuals',
      selectedCustomTheme: 'custom2',
      toolbarLayouts: [{ id: 'main', name: 'Main', items: [] }],
    }

    saveAppState(vaultAPath, JSON.stringify(vaultA))
    saveAppState(vaultBPath, JSON.stringify(vaultB))
    writeLegacyPortableSettingsToEditorState(vaultAPath, vaultA)
    writeLegacyPortableSettingsToEditorState(vaultBPath, vaultB)
    writeAppSettingsForState(userDataPath, JSON.stringify(appSettingsState))

    const loadedA = JSON.parse(loadAppStateResult(vaultAPath, { userSettingsRoot: userDataPath }).serializedState)
    const loadedB = JSON.parse(loadAppStateResult(vaultBPath, { userSettingsRoot: userDataPath }).serializedState)
    const rawA = JSON.parse(loadAppStateResult(vaultAPath, {
      userSettingsRoot: userDataPath,
      includeUserSettings: false,
    }).serializedState)

    expect(loadedA.theme).toBe('custom1')
    expect(loadedB.theme).toBe('custom1')
    expect(loadedA.hotkeys.shortcuts.openSettings).toBe('Ctrl+,')
    expect(loadedA.ui.settingsSection).toBe('visuals')
    expect(loadedA.ui.selectedCustomTheme).toBe('custom2')
    expect(loadedA.ui.toolbarLayouts).toEqual([{ id: 'main', name: 'Main', items: [] }])
    expect(loadedA.ui.sidebarWidth).toBe(333)
    expect(loadedB.ui.sidebarWidth).toBe(444)
    expect(rawA.theme).toBe('light')
    expect(rawA.hotkeys.shortcuts.openSettings).toBe('Ctrl+Alt+,')
    expect(rawA.ui.settingsSection).toBe('data')
  })

  it('writes portable app settings outside the vault and keeps editor-state vault-local', () => {
    const root = tempRoot()
    const userDataPath = path.join(root, 'user-data')
    const state = appState()
    state.theme = 'custom1'
    state.hotkeys.shortcuts.openSettings = 'Ctrl+,'
    state.scratchpad = { noteBodyId: 'body-scratch', activeAisleId: 'aisle-scratch' }
    state.ui = {
      ...state.ui,
      sidebarCollapsed: true,
      sidebarWidth: 321,
      collapsedFolderIds: ['folder-projects'],
      settingsSection: 'visuals',
      selectedCustomTheme: 'custom2',
      toolbarLayouts: [{ id: 'main', name: 'Main', items: [] }],
      noteCursorLocations: {
        'note-root': {
          activeAisleId: 'aisle-root',
          aisles: {
            'aisle-root': {
              blockIndex: 0,
              offset: 3,
              anchor: 3,
              head: 3,
              updatedAt: 10,
            },
          },
          updatedAt: 10,
        },
      },
      headingCollapseState: {
        'body-root': {
          'aisle-root': ['Heading'],
        },
      },
      aisleWidths: {
        'note-multi': {
          'aisle-multi-a': 260,
          'aisle-multi-b': 360,
        },
      },
    }

    const saveResult = saveAppState(root, JSON.stringify(state), { userSettingsRoot: userDataPath })
    const editorState = JSON.parse(readFileSync(pathFromRoot(root, '.aislenote/editor-state.json'), 'utf8'))
    const appSettings = JSON.parse(readFileSync(getUserSettingsFilePath(userDataPath), 'utf8'))

    expect(saveResult.ok).toBe(true)
    expect(editorState).not.toHaveProperty('theme')
    expect(editorState).not.toHaveProperty('hotkeys')
    expect(editorState.ui).not.toHaveProperty('settingsSection')
    expect(editorState.ui).not.toHaveProperty('selectedCustomTheme')
    expect(editorState.ui).not.toHaveProperty('toolbarLayouts')
    expect(editorState.scratchpad).toEqual(state.scratchpad)
    expect(editorState.ui.sidebarCollapsed).toBe(true)
    expect(editorState.ui.sidebarWidth).toBe(321)
    expect(editorState.ui.collapsedFolderIds).toEqual(['folder-projects'])
    expect(editorState.ui.noteCursorLocations).toEqual(state.ui.noteCursorLocations)
    expect(editorState.ui.headingCollapseState).toEqual(state.ui.headingCollapseState)
    expect(editorState.ui.aisleWidths).toEqual(state.ui.aisleWidths)
    expect(appSettings).not.toHaveProperty('schemaVersion')
    expect(appSettings).not.toHaveProperty('frontmatter')
    expect(appSettings.theme).toBe('custom1')
    expect(appSettings.hotkeys.shortcuts.openSettings).toBe('Ctrl+,')
    expect(appSettings.ui.settingsSection).toBe('visuals')
    expect(appSettings.ui.toolbarLayouts).toEqual([{ id: 'main', name: 'Main', items: [] }])
  })

  it('keeps exact titles in metadata while writing sanitized short-hash paths', () => {
    const root = tempRoot()
    const state = appState()
    const uuidNoteId = '550e8400-e29b-41d4-a716-446655440000'
    const uuidLongNoteId = '550e8400-e29b-41d4-a716-446655440001'
    const uuidMultiNoteId = '550e8400-e29b-41d4-a716-446655440002'
    const unicodeTitle = '2026/06/20: \u65e5\u672c\u8a9e * Notes?'

    state.vault.items.push(
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
    const index = readVaultIndex(root)
    const firstFolder = findVaultIndexItem(index.items, '550e8400-e29b-41d4-a716-446655440003')
    const secondFolder = findVaultIndexItem(index.items, '550e8400-e29b-41d4-a716-446655440004')
    const unicodeNote = findVaultIndexItem(index.items, uuidNoteId)
    const longNote = findVaultIndexItem(index.items, uuidLongNoteId)
    const multiNote = findVaultIndexItem(index.items, uuidMultiNoteId)

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
    expect(reloaded.vault.items.find((item) => item.id === uuidNoteId).title).toBe(unicodeTitle)
    expect(reloaded.noteAisleBodies.find((body) => body.id === 'aisle-body-uuid-multi-b').markdown).toBe('multi b')
  })

  it('updates a shared note body when only one linked mirror changes', () => {
    const root = tempRoot()
    saveAppState(root, JSON.stringify(appState()))
    const duplicateA = findVaultIndexNote(root, 'note-duplicate-a')
    const duplicateB = findVaultIndexNote(root, 'note-duplicate-b')
    writeFileSync(pathFromRoot(root, duplicateA.file), 'changed once')

    const reloaded = loadState(root)
    const linkedNotes = reloaded.vault.items[1].children.filter((item) => item.title === 'Duplicate')
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
    const duplicateA = findVaultIndexNote(root, 'note-duplicate-a')
    const duplicateB = findVaultIndexNote(root, 'note-duplicate-b')
    const older = new Date('2026-01-01T00:00:00.000Z')
    const newer = new Date('2026-01-01T00:00:10.000Z')
    writeFileSync(pathFromRoot(root, duplicateA.file), 'changed a')
    writeFileSync(pathFromRoot(root, duplicateB.file), 'changed b')
    utimesSync(pathFromRoot(root, duplicateA.file), older, older)
    utimesSync(pathFromRoot(root, duplicateB.file), newer, newer)

    const reloaded = loadState(root)
    const linkedNotes = reloaded.vault.items[1].children.filter((item) => item.title === 'Duplicate')
    expect(new Set(linkedNotes.map((item) => item.noteBodyId))).toEqual(new Set(['body-linked']))
    expect(reloaded.noteAisleBodies.filter((body) => body.id === 'aisle-body-linked')).toHaveLength(1)
    expect(reloaded.noteAisleBodies.find((body) => body.id === 'aisle-body-linked').markdown).toBe('changed b')
    expect(reloaded.messages.some((message) => message.type === 'duplicate-auto-decoupled')).toBe(false)
  })

  it('updates linked aisle mirrors across different note bodies from one externally changed file', () => {
    const root = tempRoot()
    saveAppState(root, JSON.stringify(linkedAisleAppState()))
    const noteA = findVaultIndexNote(root, 'note-linked-a')
    const noteB = findVaultIndexNote(root, 'note-linked-b')
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
    const noteA = findVaultIndexNote(root, 'note-linked-a')
    const noteB = findVaultIndexNote(root, 'note-linked-b')
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
    const inbox = findVaultIndexNote(root, 'note-root')
    const multi = findVaultIndexNote(root, 'note-multi')
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

  it('resolves vault note and folder items for sidebar reveal actions', () => {
    const root = tempRoot()
    saveAppState(root, JSON.stringify(appState()))
    const inbox = findVaultIndexNote(root, 'note-root')
    const projects = findVaultIndexItem(readVaultIndex(root).items, 'folder-projects')

    expect(resolveVaultItemLocationRevealPath(root, { itemId: 'note-root', itemType: 'note' })).toMatchObject({
      ok: true,
      rootRelativePath: inbox.file,
    })
    expect(resolveVaultItemLocationRevealPath(root, { itemId: 'folder-projects', itemType: 'folder' })).toMatchObject({
      ok: true,
      rootRelativePath: projects.path,
    })
    expect(resolveVaultItemLocationRevealPath(root, { itemId: 'folder-projects', itemType: 'note' })).toMatchObject({
      ok: false,
    })
  })
})
