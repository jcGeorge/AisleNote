import { describe, expect, it } from 'vitest'
import type { AppState } from '../types/app'
import {
  createDefaultNotebookState,
  createNotebookFolderInState,
  createNotebookNoteInState,
  decoupleNotebookAisleBodyInState,
  decoupleNotebookNoteBodyInState,
  deleteNotebookItemInState,
  findNotebookNote,
  getFolderNotesRecursive,
  getNotebookNotePathLabel,
  listNotebookNotes,
  moveNotebookItem,
  renameNotebookItem,
  replaceNotebookNoteBodyId,
  restoreDeletedNotebookItemInState,
} from './notebook'

function idSequence(ids: string[]) {
  let index = 0
  return () => ids[index++] ?? `id-${index}`
}

function createState(): AppState {
  const defaults = createDefaultNotebookState(idSequence(['body-1', 'aisle-body-1', 'aisle-1', 'note-1']))
  return {
    theme: 'dawn',
    notebook: defaults.notebook,
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
        formatStrikethrough: '',
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

describe('notebook tree helpers', () => {
  it('creates notes and folders inside the active folder', () => {
    const folderResult = createNotebookFolderInState(createState(), 'Projects', null, idSequence(['folder-1']))
    const noteResult = createNotebookNoteInState(
      { ...folderResult.state, notebook: { ...folderResult.state.notebook, activeNoteId: '' } },
      'Plan',
      'folder-1',
      'markdown',
      idSequence(['body-2', 'aisle-body-2', 'aisle-2', 'note-2']),
    )

    expect(getNotebookNotePathLabel(noteResult.state.notebook.items, noteResult.noteId)).toBe('Projects/Plan')
    expect(noteResult.state.noteAisleBodies?.find((body) => body.id === noteResult.aisleBodyId)?.markdown).toBe('markdown')
  })

  it('creates notes and folders at requested sibling indexes', () => {
    const folderResult = createNotebookFolderInState(createState(), 'Projects', null, idSequence(['folder-1']), 0)
    expect(folderResult.state.notebook.items.map((item) => item.id)).toEqual(['folder-1', 'note-1'])

    const noteResult = createNotebookNoteInState(
      folderResult.state,
      'Plan',
      null,
      '',
      idSequence(['body-2', 'aisle-body-2', 'aisle-2', 'note-2']),
      1,
    )
    expect(noteResult.state.notebook.items.map((item) => item.id)).toEqual(['folder-1', 'note-2', 'note-1'])
  })

  it('renames items without changing ids or note body links', () => {
    const state = createState()
    const renamed = renameNotebookItem(state.notebook, 'note-1', 'Daily')
    const note = findNotebookNote(renamed.items, 'note-1')

    expect(note?.note.title).toBe('Daily')
    expect(note?.note.noteBodyId).toBe('body-1')
  })

  it('moves notes between root and folder positions without changing note links', () => {
    let state = createState()
    const folderResult = createNotebookFolderInState(state, 'Projects', null, idSequence(['folder-1']))
    state = folderResult.state
    const second = createNotebookNoteInState(
      state,
      'Second',
      null,
      '',
      idSequence(['body-2', 'aisle-body-2', 'aisle-2', 'note-2']),
    )
    state = second.state
    const third = createNotebookNoteInState(
      state,
      'Third',
      null,
      '',
      idSequence(['body-3', 'aisle-body-3', 'aisle-3', 'note-3']),
    )
    state = third.state

    const reordered = moveNotebookItem(state.notebook, 'note-3', null, 1)
    expect(reordered.items.map((item) => item.id)).toEqual(['note-1', 'note-3', 'folder-1', 'note-2'])

    const nested = moveNotebookItem(reordered, 'note-3', 'folder-1', 0)
    expect(getNotebookNotePathLabel(nested.items, 'note-3')).toBe('Projects/Third')
    expect(findNotebookNote(nested.items, 'note-3')?.note.noteBodyId).toBe('body-3')

    const rooted = moveNotebookItem(nested, 'note-3', null, nested.items.length)
    expect(getNotebookNotePathLabel(rooted.items, 'note-3')).toBe('Third')
    expect(rooted.items.map((item) => item.id)).toEqual(['note-1', 'folder-1', 'note-2', 'note-3'])
  })

  it('does not move a folder into itself or its descendant', () => {
    const folderResult = createNotebookFolderInState(createState(), 'Projects', null, idSequence(['folder-1']))
    const nestedFolderResult = createNotebookFolderInState(
      folderResult.state,
      'Nested',
      'folder-1',
      idSequence(['folder-2']),
    )

    const blockedSelf = moveNotebookItem(nestedFolderResult.state.notebook, 'folder-1', 'folder-1', 0)
    expect(blockedSelf.items).toEqual(nestedFolderResult.state.notebook.items)

    const blockedDescendant = moveNotebookItem(nestedFolderResult.state.notebook, 'folder-1', 'folder-2', 0)
    expect(blockedDescendant.items).toEqual(nestedFolderResult.state.notebook.items)
  })

  it('moves deleted items to trash, falls back active note, and restores to original index', () => {
    let state = createState()
    const created = createNotebookNoteInState(state, 'Second', null, '', idSequence(['body-2', 'aisle-body-2', 'aisle-2', 'note-2']))
    state = created.state

    const deleted = deleteNotebookItemInState(state, 'note-1', idSequence(['deleted-1']))
    expect(deleted.notebook.activeNoteId).toBe('note-2')
    expect(deleted.notebook.deletedItems).toHaveLength(1)

    const restored = restoreDeletedNotebookItemInState(deleted, 'deleted-1')
    expect(listNotebookNotes(restored.notebook.items).map((entry) => entry.note.id)).toEqual(['note-1', 'note-2'])
    expect(restored.notebook.activeNoteId).toBe('note-1')
  })

  it('replaces one visible note body while keeping synced siblings linked', () => {
    const state = createState()
    const linked = {
      ...state.notebook,
      items: [
        ...state.notebook.items,
        { type: 'note' as const, id: 'note-2', title: 'Linked', noteBodyId: 'body-1' },
      ],
    }

    const replaced = replaceNotebookNoteBodyId(linked, 'note-2', 'body-2')
    expect(findNotebookNote(replaced.items, 'note-1')?.note.noteBodyId).toBe('body-1')
    expect(findNotebookNote(replaced.items, 'note-2')?.note.noteBodyId).toBe('body-2')
  })

  it('traverses folders recursively for folder-scoped operations', () => {
    const state = createState()
    const folderResult = createNotebookFolderInState(state, 'Folder', null, idSequence(['folder-1']))
    const noteResult = createNotebookNoteInState(
      folderResult.state,
      'Nested',
      'folder-1',
      '',
      idSequence(['body-2', 'aisle-body-2', 'aisle-2', 'note-2']),
    )

    expect(getFolderNotesRecursive(noteResult.state.notebook.items, 'folder-1').map((entry) => entry.note.id)).toEqual(['note-2'])
    expect(getFolderNotesRecursive(noteResult.state.notebook.items, null).map((entry) => entry.note.id)).toEqual(['note-1', 'note-2'])
  })

  it('decouples only the selected visible note body', () => {
    const state: AppState = {
      ...createState(),
      notebook: {
        ...createState().notebook,
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

    const decoupled = decoupleNotebookNoteBodyInState(
      state,
      'note-2',
      idSequence(['aisle-body-2', 'aisle-2', 'body-2']),
    )

    expect(findNotebookNote(decoupled.notebook.items, 'note-1')?.note.noteBodyId).toBe('body-1')
    expect(findNotebookNote(decoupled.notebook.items, 'note-2')?.note.noteBodyId).toBe('body-2')
    expect(decoupled.noteBodies.map((body) => body.id)).toContain('body-2')
    expect(decoupled.noteAisleBodies?.find((body) => body.id === 'aisle-body-2')?.markdown).toBe('linked markdown')
  })

  it('decouples only the selected shared aisle body', () => {
    const state: AppState = {
      ...createState(),
      notebook: {
        ...createState().notebook,
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

    const decoupled = decoupleNotebookAisleBodyInState(state, 'note-1', 'aisle-1', idSequence(['cloned-aisle-body']))
    const bodyOne = decoupled.noteBodies.find((body) => body.id === 'body-1')
    const bodyTwo = decoupled.noteBodies.find((body) => body.id === 'body-2')

    expect(bodyOne?.aisles.find((aisle) => aisle.id === 'aisle-1')?.aisleBodyId).toBe('cloned-aisle-body')
    expect(bodyOne?.aisles.find((aisle) => aisle.id === 'aisle-2')?.aisleBodyId).toBe('unique-aisle-body')
    expect(bodyTwo?.aisles.find((aisle) => aisle.id === 'aisle-3')?.aisleBodyId).toBe('shared-aisle-body')
    expect(decoupled.noteAisleBodies?.find((body) => body.id === 'cloned-aisle-body')?.markdown).toBe('shared markdown')
  })
})
