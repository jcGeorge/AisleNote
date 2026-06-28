import { describe, expect, it } from 'vitest'
import type { AppState, VaultState } from '../types/app'
import {
  createDefaultVaultState,
  createVaultFolderInState,
  createVaultNoteInState,
  decoupleVaultAisleBodyInState,
  decoupleVaultNoteBodyInState,
  deleteVaultItemInState,
  deleteVaultItemsInState,
  findVaultFolder,
  findVaultNote,
  focusVaultOpenTab,
  getClosedVaultTab,
  getFolderNotesRecursive,
  getVaultNotePathLabel,
  getVaultRetainedTabCycleTarget,
  listVaultNotes,
  materializeSyncedNoteBodiesInState,
  moveVaultItem,
  moveVaultItems,
  openVaultRetainedTab,
  openVaultTemporaryTab,
  closeVaultTab,
  promoteVaultTemporaryTab,
  renameVaultItem,
  reorderVaultTabs,
  replaceVaultNoteBodyId,
  restoreClosedVaultTab,
  restoreDeletedVaultItemInState,
  sortVaultItemsInScope,
} from './vault'

function idSequence(ids: string[]) {
  let index = 0
  return () => ids[index++] ?? `id-${index}`
}

function createState(): AppState {
  const defaults = createDefaultVaultState(idSequence(['body-1', 'aisle-body-1', 'aisle-1', 'note-1']))
  return {
    theme: 'cheese',
    vault: defaults.vault,
    messages: [],
    toastHistory: [],
    noteBodies: defaults.noteBodies,
    noteAisleBodies: defaults.noteAisleBodies,
    hotkeys: {
      shortcuts: {
        toggleNotesTrash: '',
        toggleNotesScratchpad: '',
        toggleNotesFilter: '',
        newNote: 'mod+n',
        newFolder: 'mod+shift+n',
        closeCurrentNote: 'mod+w',
        cyclePinnedNoteTabNext: 'ctrl+tab',
        cyclePinnedNoteTabPrev: 'ctrl+shift+tab',
        reopenClosedNoteTab: 'mod+shift+t',
        formatStrikethrough: '',
        formatHighlight: 'mod+shift+h',
        pastePlainText: 'mod+shift+v',
        cycleAislePrev: '',
        cycleAisleNext: '',
      },
      newlineShortcuts: {
        shortcuts: {
          controlEnter: 'normalNewLine',
          shiftEnter: 'normalNewLine',
          commandEnter: 'operationsMenu',
        },
        menuOperations: [],
      },
    },
    frontmatter: {
      templates: [],
      settingsTemplateId: '',
      lastAppliedTemplateId: '',
    },
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

function createTabVault(): VaultState {
  return {
    activeNoteId: 'note-a',
    openTabs: [],
    items: [
      { type: 'note', id: 'note-a', title: 'A', noteBodyId: 'body-a' },
      { type: 'note', id: 'note-b', title: 'B', noteBodyId: 'body-b' },
      { type: 'note', id: 'note-c', title: 'C', noteBodyId: 'body-c' },
    ],
    deletedItems: [],
    settings: { autoRemoveDeletedDays: 30 },
  }
}

describe('vault tree helpers', () => {
  it('creates new vaults with a seven-day trash auto-remove default', () => {
    const defaults = createDefaultVaultState(idSequence(['body-1', 'aisle-body-1', 'aisle-1', 'note-1']))

    expect(defaults.vault.settings.autoRemoveDeletedDays).toBe(7)
  })

  it('creates notes and folders inside the active folder', () => {
    const folderResult = createVaultFolderInState(createState(), 'Projects', null, idSequence(['folder-1']))
    const noteResult = createVaultNoteInState(
      { ...folderResult.state, vault: { ...folderResult.state.vault, activeNoteId: '' } },
      'Plan',
      'folder-1',
      'markdown',
      idSequence(['body-2', 'aisle-body-2', 'aisle-2', 'note-2']),
    )

    expect(getVaultNotePathLabel(noteResult.state.vault.items, noteResult.noteId)).toBe('Projects/Plan')
    expect(noteResult.state.noteAisleBodies?.find((body) => body.id === noteResult.aisleBodyId)?.markdown).toBe('markdown')
  })

  it('creates notes and folders at requested sibling indexes', () => {
    const folderResult = createVaultFolderInState(createState(), 'Projects', null, idSequence(['folder-1']), 0)
    expect(folderResult.state.vault.items.map((item) => item.id)).toEqual(['folder-1', 'note-1'])

    const noteResult = createVaultNoteInState(
      folderResult.state,
      'Plan',
      null,
      '',
      idSequence(['body-2', 'aisle-body-2', 'aisle-2', 'note-2']),
      1,
    )
    expect(noteResult.state.vault.items.map((item) => item.id)).toEqual(['folder-1', 'note-2', 'note-1'])
  })

  it('renames items without changing ids or note body links', () => {
    const state = createState()
    const renamed = renameVaultItem(state.vault, 'note-1', 'Daily')
    const note = findVaultNote(renamed.items, 'note-1')

    expect(note?.note.title).toBe('Daily')
    expect(note?.note.noteBodyId).toBe('body-1')
  })

  it('moves notes between root and folder positions without changing note links', () => {
    let state = createState()
    const folderResult = createVaultFolderInState(state, 'Projects', null, idSequence(['folder-1']))
    state = folderResult.state
    const second = createVaultNoteInState(
      state,
      'Second',
      null,
      '',
      idSequence(['body-2', 'aisle-body-2', 'aisle-2', 'note-2']),
    )
    state = second.state
    const third = createVaultNoteInState(
      state,
      'Third',
      null,
      '',
      idSequence(['body-3', 'aisle-body-3', 'aisle-3', 'note-3']),
    )
    state = third.state

    const reordered = moveVaultItem(state.vault, 'note-3', null, 1)
    expect(reordered.items.map((item) => item.id)).toEqual(['note-1', 'note-3', 'folder-1', 'note-2'])

    const nested = moveVaultItem(reordered, 'note-3', 'folder-1', 0)
    expect(getVaultNotePathLabel(nested.items, 'note-3')).toBe('Projects/Third')
    expect(findVaultNote(nested.items, 'note-3')?.note.noteBodyId).toBe('body-3')

    const rooted = moveVaultItem(nested, 'note-3', null, nested.items.length)
    expect(getVaultNotePathLabel(rooted.items, 'note-3')).toBe('Third')
    expect(rooted.items.map((item) => item.id)).toEqual(['note-1', 'folder-1', 'note-2', 'note-3'])
  })

  it('moves multiple notes as a note-only batch while preserving tree order', () => {
    let state = createState()
    state = createVaultFolderInState(state, 'Projects', null, idSequence(['folder-1'])).state
    state = createVaultNoteInState(
      state,
      'Second',
      null,
      '',
      idSequence(['body-2', 'aisle-body-2', 'aisle-2', 'note-2']),
    ).state
    state = createVaultNoteInState(
      state,
      'Third',
      null,
      '',
      idSequence(['body-3', 'aisle-body-3', 'aisle-3', 'note-3']),
    ).state
    state = createVaultNoteInState(
      state,
      'Nested',
      'folder-1',
      '',
      idSequence(['body-4', 'aisle-body-4', 'aisle-4', 'note-4']),
    ).state

    const nested = moveVaultItems(state.vault, ['note-3', 'note-2'], 'folder-1', 0)
    expect(findVaultFolder(nested.items, 'folder-1')?.folder.children.map((item) => item.id)).toEqual([
      'note-2',
      'note-3',
      'note-4',
    ])
    expect(getVaultNotePathLabel(nested.items, 'note-2')).toBe('Projects/Second')
    expect(getVaultNotePathLabel(nested.items, 'note-3')).toBe('Projects/Third')

    const reordered = moveVaultItems(nested, ['note-2', 'note-3'], 'folder-1', 3)
    expect(findVaultFolder(reordered.items, 'folder-1')?.folder.children.map((item) => item.id)).toEqual([
      'note-4',
      'note-2',
      'note-3',
    ])
  })

  it('does not batch-move folders with note selections', () => {
    const folderResult = createVaultFolderInState(createState(), 'Projects', null, idSequence(['folder-1']))

    const moved = moveVaultItems(folderResult.state.vault, ['note-1', 'folder-1'], null, 0)

    expect(moved).toBe(folderResult.state.vault)
  })

  it('does not move a folder into itself or its descendant', () => {
    const folderResult = createVaultFolderInState(createState(), 'Projects', null, idSequence(['folder-1']))
    const nestedFolderResult = createVaultFolderInState(
      folderResult.state,
      'Nested',
      'folder-1',
      idSequence(['folder-2']),
    )

    const blockedSelf = moveVaultItem(nestedFolderResult.state.vault, 'folder-1', 'folder-1', 0)
    expect(blockedSelf.items).toEqual(nestedFolderResult.state.vault.items)

    const blockedDescendant = moveVaultItem(nestedFolderResult.state.vault, 'folder-1', 'folder-2', 0)
    expect(blockedDescendant.items).toEqual(nestedFolderResult.state.vault.items)
  })

  it('sorts root items by name without sorting folder descendants', () => {
    const state = createState()
    const vault = {
      ...state.vault,
      items: [
        {
          type: 'folder' as const,
          id: 'folder-work',
          title: 'Work',
          children: [
            { type: 'note' as const, id: 'note-z', title: 'Zulu', noteBodyId: 'body-z' },
            { type: 'note' as const, id: 'note-a-nested', title: 'Alpha nested', noteBodyId: 'body-a-nested' },
          ],
        },
        { type: 'note' as const, id: 'note-alpha', title: 'Alpha', noteBodyId: 'body-alpha' },
      ],
    }

    const sorted = sortVaultItemsInScope(vault, null, 'alpha-asc', state.noteBodies)
    const folder = sorted.items.find((item) => item.id === 'folder-work')

    expect(sorted.items.map((item) => item.id)).toEqual(['note-alpha', 'folder-work'])
    expect(folder?.type === 'folder' ? folder.children.map((item) => item.id) : []).toEqual([
      'note-z',
      'note-a-nested',
    ])
  })

  it('sorts only the selected folder direct children', () => {
    const state = createState()
    const vault = {
      ...state.vault,
      items: [
        { type: 'note' as const, id: 'note-root', title: 'Root', noteBodyId: 'body-root' },
        {
          type: 'folder' as const,
          id: 'folder-project',
          title: 'Project',
          children: [
            {
              type: 'folder' as const,
              id: 'folder-nested',
              title: 'Nested',
              children: [{ type: 'note' as const, id: 'note-beta', title: 'Beta', noteBodyId: 'body-beta' }],
            },
            { type: 'note' as const, id: 'note-delta', title: 'Delta', noteBodyId: 'body-delta' },
            { type: 'note' as const, id: 'note-alpha', title: 'Alpha', noteBodyId: 'body-alpha' },
          ],
        },
      ],
    }

    const sorted = sortVaultItemsInScope(vault, 'folder-project', 'alpha-asc', state.noteBodies)
    const project = sorted.items.find((item) => item.id === 'folder-project')
    const nested = project?.type === 'folder'
      ? project.children.find((item) => item.id === 'folder-nested')
      : null

    expect(sorted.items.map((item) => item.id)).toEqual(['note-root', 'folder-project'])
    expect(project?.type === 'folder' ? project.children.map((item) => item.id) : []).toEqual([
      'note-alpha',
      'note-delta',
      'folder-nested',
    ])
    expect(nested?.type === 'folder' ? nested.children.map((item) => item.id) : []).toEqual(['note-beta'])
  })

  it('sorts notes by note body modified timestamps', () => {
    const state = createState()
    const vault = {
      ...state.vault,
      items: [
        { type: 'note' as const, id: 'note-old', title: 'Old', noteBodyId: 'body-old' },
        { type: 'note' as const, id: 'note-missing', title: 'Missing', noteBodyId: 'body-missing' },
        { type: 'note' as const, id: 'note-new', title: 'New', noteBodyId: 'body-new' },
      ],
    }
    const noteBodies = [
      { id: 'body-old', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-02T00:00:00.000Z', aisles: [] },
      { id: 'body-new', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z', aisles: [] },
    ]

    const sorted = sortVaultItemsInScope(vault, null, 'updated-desc', noteBodies)

    expect(sorted.items.map((item) => item.id)).toEqual(['note-new', 'note-old', 'note-missing'])
  })

  it('uses descendant note dates for folder date sorts', () => {
    const state = createState()
    const vault = {
      ...state.vault,
      items: [
        {
          type: 'folder' as const,
          id: 'folder-old',
          title: 'Old folder',
          children: [
            { type: 'note' as const, id: 'note-later-created', title: 'Later', noteBodyId: 'body-later-created' },
            { type: 'note' as const, id: 'note-earlier-created', title: 'Earlier', noteBodyId: 'body-earlier-created' },
          ],
        },
        { type: 'note' as const, id: 'note-middle', title: 'Middle', noteBodyId: 'body-middle' },
        {
          type: 'folder' as const,
          id: 'folder-new',
          title: 'New folder',
          children: [
            {
              type: 'folder' as const,
              id: 'folder-nested',
              title: 'Nested',
              children: [{ type: 'note' as const, id: 'note-newest', title: 'Newest', noteBodyId: 'body-newest' }],
            },
          ],
        },
      ],
    }
    const noteBodies = [
      { id: 'body-later-created', createdAt: '2022-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z', aisles: [] },
      { id: 'body-earlier-created', createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2023-01-01T00:00:00.000Z', aisles: [] },
      { id: 'body-middle', createdAt: '2021-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z', aisles: [] },
      { id: 'body-newest', createdAt: '2023-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', aisles: [] },
    ]

    const createdSorted = sortVaultItemsInScope(vault, null, 'created-asc', noteBodies)
    const updatedSorted = sortVaultItemsInScope(vault, null, 'updated-desc', noteBodies)

    expect(createdSorted.items.map((item) => item.id)).toEqual(['folder-old', 'note-middle', 'folder-new'])
    expect(updatedSorted.items.map((item) => item.id)).toEqual(['folder-new', 'note-middle', 'folder-old'])
  })

  it('keeps empty and missing-date items stable after dated items', () => {
    const state = createState()
    const vault = {
      ...state.vault,
      items: [
        { type: 'folder' as const, id: 'folder-empty', title: 'Empty', children: [] },
        { type: 'note' as const, id: 'note-missing', title: 'Missing', noteBodyId: 'body-missing' },
        { type: 'note' as const, id: 'note-dated-b', title: 'Dated B', noteBodyId: 'body-dated-b' },
        { type: 'note' as const, id: 'note-invalid', title: 'Invalid', noteBodyId: 'body-invalid' },
        { type: 'note' as const, id: 'note-dated-a', title: 'Dated A', noteBodyId: 'body-dated-a' },
      ],
    }
    const noteBodies = [
      { id: 'body-dated-b', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z', aisles: [] },
      { id: 'body-invalid', createdAt: 'not a date', updatedAt: 'not a date', aisles: [] },
      { id: 'body-dated-a', createdAt: '2023-01-01T00:00:00.000Z', updatedAt: '2023-01-01T00:00:00.000Z', aisles: [] },
    ]

    const sorted = sortVaultItemsInScope(vault, null, 'created-asc', noteBodies)

    expect(sorted.items.map((item) => item.id)).toEqual([
      'note-dated-a',
      'note-dated-b',
      'folder-empty',
      'note-missing',
      'note-invalid',
    ])
  })

  it('moves deleted items to trash, falls back active note, and restores to original index', () => {
    let state = createState()
    const created = createVaultNoteInState(state, 'Second', null, '', idSequence(['body-2', 'aisle-body-2', 'aisle-2', 'note-2']))
    state = created.state

    const deleted = deleteVaultItemInState(state, 'note-1', idSequence(['deleted-1']))
    expect(deleted.vault.activeNoteId).toBe('note-2')
    expect(deleted.vault.deletedItems).toHaveLength(1)

    const restored = restoreDeletedVaultItemInState(deleted, 'deleted-1')
    expect(listVaultNotes(restored.vault.items).map((entry) => entry.note.id)).toEqual(['note-1', 'note-2'])
    expect(restored.vault.activeNoteId).toBe('note-1')
  })

  it('moves multiple deleted items to trash in one state update', () => {
    let state = createState()
    state = createVaultNoteInState(
      state,
      'Second',
      null,
      '',
      idSequence(['body-2', 'aisle-body-2', 'aisle-2', 'note-2']),
    ).state
    state = createVaultNoteInState(
      state,
      'Third',
      null,
      '',
      idSequence(['body-3', 'aisle-body-3', 'aisle-3', 'note-3']),
    ).state

    const deleted = deleteVaultItemsInState(state, ['note-1', 'note-2', 'note-1'], idSequence(['deleted-1', 'deleted-2']))

    expect(listVaultNotes(deleted.vault.items).map((entry) => entry.note.id)).toEqual(['note-3'])
    expect(deleted.vault.activeNoteId).toBe('note-3')
    expect(deleted.vault.deletedItems.map((entry) => entry.id)).toEqual(['deleted-2', 'deleted-1'])
    expect(deleted.vault.deletedItems.map((entry) => entry.item.id)).toEqual(['note-2', 'note-1'])
  })

  it('opens one replaceable temporary tab and keeps retained tabs', () => {
    let vault = createTabVault()

    vault = openVaultTemporaryTab(vault, 'note-a')
    expect(vault.activeNoteId).toBe('note-a')
    expect(vault.openTabs).toEqual([{ noteId: 'note-a', status: 'temporary' }])

    vault = openVaultRetainedTab(vault, 'note-b')
    expect(vault.activeNoteId).toBe('note-b')
    expect(vault.openTabs).toEqual([
      { noteId: 'note-a', status: 'temporary' },
      { noteId: 'note-b', status: 'retained' },
    ])

    vault = openVaultTemporaryTab(vault, 'note-c')
    expect(vault.activeNoteId).toBe('note-c')
    expect(vault.openTabs).toEqual([
      { noteId: 'note-c', status: 'temporary' },
      { noteId: 'note-b', status: 'retained' },
    ])
  })

  it('focuses retained tabs without replacing the current temporary tab', () => {
    let vault = createTabVault()

    vault = openVaultTemporaryTab(vault, 'note-a')
    vault = openVaultRetainedTab(vault, 'note-b')
    vault = openVaultTemporaryTab(vault, 'note-c')
    expect(vault.activeNoteId).toBe('note-c')
    expect(vault.openTabs).toEqual([
      { noteId: 'note-c', status: 'temporary' },
      { noteId: 'note-b', status: 'retained' },
    ])

    vault = focusVaultOpenTab(vault, 'note-b')
    expect(vault.activeNoteId).toBe('note-b')
    expect(vault.openTabs).toEqual([
      { noteId: 'note-c', status: 'temporary' },
      { noteId: 'note-b', status: 'retained' },
    ])
  })

  it('promotes temporary tabs and retained opens promote existing temporary tabs', () => {
    let vault = openVaultTemporaryTab(createTabVault(), 'note-a')

    vault = promoteVaultTemporaryTab(vault, 'note-a')
    expect(vault.openTabs).toEqual([{ noteId: 'note-a', status: 'retained' }])

    vault = openVaultTemporaryTab(vault, 'note-b')
    vault = openVaultRetainedTab(vault, 'note-b')
    expect(vault.openTabs).toEqual([
      { noteId: 'note-a', status: 'retained' },
      { noteId: 'note-b', status: 'retained' },
    ])
  })

  it('closes active tabs to next, previous, then first-note temporary fallback', () => {
    let vault = {
      ...createTabVault(),
      activeNoteId: 'note-b',
      openTabs: [
        { noteId: 'note-a', status: 'retained' as const },
        { noteId: 'note-b', status: 'retained' as const },
        { noteId: 'note-c', status: 'retained' as const },
      ],
    }

    vault = closeVaultTab(vault, 'note-b')
    expect(vault.activeNoteId).toBe('note-c')
    expect(vault.openTabs?.map((tab) => tab.noteId)).toEqual(['note-a', 'note-c'])

    vault = closeVaultTab(vault, 'note-c')
    expect(vault.activeNoteId).toBe('note-a')
    expect(vault.openTabs).toEqual([{ noteId: 'note-a', status: 'retained' }])

    vault = closeVaultTab(vault, 'note-a')
    expect(vault.activeNoteId).toBe('note-a')
    expect(vault.openTabs).toEqual([{ noteId: 'note-a', status: 'temporary' }])
  })

  it('cycles retained note tabs in tab-strip order and skips temporary tabs', () => {
    const vault = {
      ...createTabVault(),
      activeNoteId: 'note-b',
      openTabs: [
        { noteId: 'note-a', status: 'retained' as const },
        { noteId: 'note-b', status: 'temporary' as const },
        { noteId: 'note-c', status: 'retained' as const },
      ],
    }

    expect(getVaultRetainedTabCycleTarget(vault, 1)).toBe('note-c')
    expect(getVaultRetainedTabCycleTarget(vault, -1)).toBe('note-a')
    expect(getVaultRetainedTabCycleTarget({ ...vault, activeNoteId: 'note-c' }, 1)).toBe('note-a')
    expect(getVaultRetainedTabCycleTarget({ ...vault, activeNoteId: 'note-a' }, -1)).toBe('note-c')
  })

  it('captures and restores retained tabs at their prior index', () => {
    let vault = {
      ...createTabVault(),
      activeNoteId: 'note-b',
      openTabs: [
        { noteId: 'note-a', status: 'retained' as const },
        { noteId: 'note-b', status: 'retained' as const },
        { noteId: 'note-c', status: 'retained' as const },
      ],
    }
    const closedTab = getClosedVaultTab(vault, 'note-b')
    expect(closedTab).toEqual({ noteId: 'note-b', status: 'retained', index: 1 })

    vault = closeVaultTab(vault, 'note-b')
    expect(vault.openTabs?.map((tab) => tab.noteId)).toEqual(['note-a', 'note-c'])

    vault = restoreClosedVaultTab(vault, closedTab!)
    expect(vault.activeNoteId).toBe('note-b')
    expect(vault.openTabs).toEqual([
      { noteId: 'note-a', status: 'retained' },
      { noteId: 'note-b', status: 'retained' },
      { noteId: 'note-c', status: 'retained' },
    ])
  })

  it('restores temporary tabs without creating a second temporary tab', () => {
    const vault = {
      ...createTabVault(),
      activeNoteId: 'note-c',
      openTabs: [
        { noteId: 'note-a', status: 'retained' as const },
        { noteId: 'note-c', status: 'temporary' as const },
      ],
    }
    const restored = restoreClosedVaultTab(vault, { noteId: 'note-b', status: 'temporary', index: 1 })

    expect(restored.activeNoteId).toBe('note-b')
    expect(restored.openTabs).toEqual([
      { noteId: 'note-a', status: 'retained' },
      { noteId: 'note-b', status: 'temporary' },
    ])
  })

  it('skips restore records for deleted notes', () => {
    const vault = {
      ...createTabVault(),
      activeNoteId: 'note-a',
      openTabs: [{ noteId: 'note-a', status: 'retained' as const }],
      items: [
        { type: 'note' as const, id: 'note-a', title: 'A', noteBodyId: 'body-a' },
        { type: 'note' as const, id: 'note-c', title: 'C', noteBodyId: 'body-c' },
      ],
    }

    const restored = restoreClosedVaultTab(vault, { noteId: 'note-b', status: 'retained', index: 1 })
    expect(restored).toBe(vault)
  })

  it('reorders tabs and prunes stale tabs when notes are deleted', () => {
    let vault = {
      ...createTabVault(),
      openTabs: [
        { noteId: 'note-a', status: 'retained' as const },
        { noteId: 'note-b', status: 'temporary' as const },
        { noteId: 'note-c', status: 'retained' as const },
      ],
    }

    vault = reorderVaultTabs(vault, 'note-a', 3)
    expect(vault.openTabs?.map((tab) => tab.noteId)).toEqual(['note-b', 'note-c', 'note-a'])

    const deleted = deleteVaultItemInState(
      {
        ...createState(),
        vault,
        noteBodies: [],
        noteAisleBodies: [],
      },
      'note-b',
      idSequence(['deleted-b']),
    )
    expect(deleted.vault.openTabs).toEqual([
      { noteId: 'note-c', status: 'retained' },
      { noteId: 'note-a', status: 'retained' },
    ])
  })

  it('replaces one visible note body while keeping synced siblings linked', () => {
    const state = createState()
    const linked = {
      ...state.vault,
      items: [
        ...state.vault.items,
        { type: 'note' as const, id: 'note-2', title: 'Linked', noteBodyId: 'body-1' },
      ],
    }

    const replaced = replaceVaultNoteBodyId(linked, 'note-2', 'body-2')
    expect(findVaultNote(replaced.items, 'note-1')?.note.noteBodyId).toBe('body-1')
    expect(findVaultNote(replaced.items, 'note-2')?.note.noteBodyId).toBe('body-2')
  })

  it('materializes synced note bodies as separate notes with synced aisles', () => {
    const state: AppState = {
      ...createState(),
      vault: {
        ...createState().vault,
        items: [
          { type: 'note', id: 'note-1', title: 'Original', noteBodyId: 'body-1' },
          { type: 'note', id: 'note-2', title: 'Linked', noteBodyId: 'body-1' },
        ],
      },
      noteBodies: [
        {
          id: 'body-1',
          aisles: [
            { id: 'aisle-1', aisleBodyId: 'shared-aisle-body-1' },
            { id: 'aisle-2', aisleBodyId: 'shared-aisle-body-2' },
          ],
        },
      ],
    }

    const materialized = materializeSyncedNoteBodiesInState(
      state,
      idSequence(['body-2', 'aisle-3', 'aisle-4']),
    )

    expect(findVaultNote(materialized.vault.items, 'note-1')?.note.noteBodyId).toBe('body-1')
    expect(findVaultNote(materialized.vault.items, 'note-2')?.note.noteBodyId).toBe('body-2')
    expect(materialized.noteBodies.find((body) => body.id === 'body-2')?.aisles).toEqual([
      { id: 'aisle-3', aisleBodyId: 'shared-aisle-body-1' },
      { id: 'aisle-4', aisleBodyId: 'shared-aisle-body-2' },
    ])
  })

  it('traverses folders recursively for folder-scoped operations', () => {
    const state = createState()
    const folderResult = createVaultFolderInState(state, 'Folder', null, idSequence(['folder-1']))
    const noteResult = createVaultNoteInState(
      folderResult.state,
      'Nested',
      'folder-1',
      '',
      idSequence(['body-2', 'aisle-body-2', 'aisle-2', 'note-2']),
    )

    expect(getFolderNotesRecursive(noteResult.state.vault.items, 'folder-1').map((entry) => entry.note.id)).toEqual(['note-2'])
    expect(getFolderNotesRecursive(noteResult.state.vault.items, null).map((entry) => entry.note.id)).toEqual(['note-1', 'note-2'])
  })

  it('decouples only the selected visible note body', () => {
    const state: AppState = {
      ...createState(),
      vault: {
        ...createState().vault,
        items: [
          { type: 'note', id: 'note-1', title: 'Original', noteBodyId: 'body-1' },
          { type: 'note', id: 'note-2', title: 'Linked', noteBodyId: 'body-1' },
        ],
        activeNoteId: 'note-2',
      },
      noteAisleBodies: [
        {
          id: 'aisle-body-1',
          markdown: 'linked markdown',
          tags: [],
          frontmatter: null,
          frontmatterStatus: 'none',
        },
      ],
    }

    const decoupled = decoupleVaultNoteBodyInState(
      state,
      'note-2',
      idSequence(['aisle-body-2', 'aisle-2', 'body-2']),
    )

    expect(findVaultNote(decoupled.vault.items, 'note-1')?.note.noteBodyId).toBe('body-1')
    expect(findVaultNote(decoupled.vault.items, 'note-2')?.note.noteBodyId).toBe('body-2')
    expect(decoupled.noteBodies.map((body) => body.id)).toContain('body-2')
    expect(decoupled.noteAisleBodies?.find((body) => body.id === 'aisle-body-2')?.markdown).toBe('linked markdown')
  })

  it('decouples only the selected shared aisle body', () => {
    const state: AppState = {
      ...createState(),
      vault: {
        ...createState().vault,
        items: [
          { type: 'note', id: 'note-1', title: 'Original', noteBodyId: 'body-1' },
          { type: 'note', id: 'note-2', title: 'Other', noteBodyId: 'body-2' },
        ],
      },
      noteBodies: [
        {
          id: 'body-1',
          aisles: [
            { id: 'aisle-1', aisleBodyId: 'shared-aisle-body' },
            { id: 'aisle-2', aisleBodyId: 'unique-aisle-body' },
          ],
        },
        {
          id: 'body-2',
          aisles: [{ id: 'aisle-3', aisleBodyId: 'shared-aisle-body' }],
        },
      ],
      noteAisleBodies: [
        {
          id: 'shared-aisle-body',
          markdown: 'shared markdown',
          tags: [],
          frontmatter: null,
          frontmatterStatus: 'none',
        },
        {
          id: 'unique-aisle-body',
          markdown: 'unique markdown',
          tags: [],
          frontmatter: null,
          frontmatterStatus: 'none',
        },
      ],
    }

    const decoupled = decoupleVaultAisleBodyInState(state, 'note-1', 'aisle-1', idSequence(['cloned-aisle-body']))
    const bodyOne = decoupled.noteBodies.find((body) => body.id === 'body-1')
    const bodyTwo = decoupled.noteBodies.find((body) => body.id === 'body-2')

    expect(bodyOne?.aisles.find((aisle) => aisle.id === 'aisle-1')?.aisleBodyId).toBe('cloned-aisle-body')
    expect(bodyOne?.aisles.find((aisle) => aisle.id === 'aisle-2')?.aisleBodyId).toBe('unique-aisle-body')
    expect(bodyTwo?.aisles.find((aisle) => aisle.id === 'aisle-3')?.aisleBodyId).toBe('shared-aisle-body')
    expect(decoupled.noteAisleBodies?.find((body) => body.id === 'cloned-aisle-body')?.markdown).toBe('shared markdown')
  })
})
