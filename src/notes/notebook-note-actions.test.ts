import { describe, expect, it } from 'vitest'
import type { AppState, NoteBody } from '../types/app'
import {
  buildNotebookNoteReferenceInsertionText,
  decoupleNotebookNoteLocationsInState,
  getNotePreviewRenderMarkdown,
  getNotebookAisleDecoupleRows,
  getNotebookNoteDecoupleRows,
  replaceActiveNoteBodyFromTargetNote,
  replaceFocusedAisleFromTargetNote,
} from './notebook-note-actions'
import { findNotebookNote } from '../state/notebook'

function idSequence(ids: string[]) {
  let index = 0
  return () => ids[index++] ?? `id-${index}`
}

function createState(): AppState {
  return {
    theme: 'dark',
    notebook: {
      activeNoteId: 'note-active',
      items: [
        { type: 'note', id: 'note-active', title: 'Active', noteBodyId: 'body-active' },
        {
          type: 'folder',
          id: 'folder-work',
          title: 'Work',
          children: [{ type: 'note', id: 'note-target', title: 'Target', noteBodyId: 'body-target' }],
        },
      ],
      deletedItems: [],
      settings: { autoRemoveDeletedDays: 30 },
    },
    noteBodies: [
      {
        id: 'body-active',
        aisles: [
          { id: 'active-aisle-1', aisleBodyId: 'active-aisle-body-1' },
          { id: 'active-aisle-2', aisleBodyId: 'active-aisle-body-2' },
        ],
      },
      {
        id: 'body-target',
        aisles: [
          { id: 'target-aisle-1', aisleBodyId: 'target-aisle-body-1' },
          { id: 'target-aisle-2', aisleBodyId: 'target-aisle-body-2' },
        ],
      },
    ],
    noteAisleBodies: [
      { id: 'active-aisle-body-1', markdown: 'active one', tags: [], frontmatter: null, frontmatterStatus: 'none' },
      { id: 'active-aisle-body-2', markdown: 'active two', tags: [], frontmatter: null, frontmatterStatus: 'none' },
      { id: 'target-aisle-body-1', markdown: 'target one', tags: ['target'], frontmatter: null, frontmatterStatus: 'none' },
      { id: 'target-aisle-body-2', markdown: 'target two', tags: [], frontmatter: null, frontmatterStatus: 'none' },
    ],
    hotkeys: { shortcuts: {} as AppState['hotkeys']['shortcuts'], newlineShortcuts: { shortcuts: {} as never, menuOperations: [] } },
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

function noteBody(state: AppState, id: string): NoteBody {
  const body = state.noteBodies.find((candidate) => candidate.id === id)
  if (!body) throw new Error(`Missing body ${id}`)
  return body
}

describe('notebook note actions', () => {
  it('builds note link and preview insertion text with noteId targets', () => {
    const state = createState()

    expect(buildNotebookNoteReferenceInsertionText(state, { noteId: 'note-target' }, 'note-link')).toMatch(
      /^\[Target\]\(Target--[0-9a-f]{6}\)$/,
    )
    expect(buildNotebookNoteReferenceInsertionText(state, { noteId: 'note-target' }, 'note-preview')).toMatch(
      /^!\[Target\]\(<Target--[0-9a-f]{6}#aisle 1--[0-9a-f]{6}>\)$/,
    )
    expect(
      buildNotebookNoteReferenceInsertionText(state, { noteId: 'note-target' }, 'note-preview', {
        aisleId: 'target-aisle-2',
      }),
    ).toMatch(
      /^!\[Target\]\(<Target--[0-9a-f]{6}#aisle 2--[0-9a-f]{6}>\)$/,
    )
    expect(
      buildNotebookNoteReferenceInsertionText(state, { noteId: 'note-target' }, 'note-link', {
        aisleId: 'target-aisle-2',
      }),
    ).toMatch(
      /^\[Target\]\(Target--[0-9a-f]{6}\)$/,
    )
  })

  it('renders exactly one note preview aisle with fallback to the first aisle', () => {
    const state = createState()

    expect(getNotePreviewRenderMarkdown(state, { noteId: 'note-target' }).markdown).toBe('target one')
    expect(getNotePreviewRenderMarkdown(state, { noteId: 'note-target' }, '', ['target-aisle-2']).markdown).toBe(
      'target two',
    )
    expect(getNotePreviewRenderMarkdown(state, { noteId: 'note-target' }, '', ['deleted-aisle']).markdown).toBe(
      'target one',
    )
  })

  it('replaces the focused aisle with synced target aisles', () => {
    const result = replaceFocusedAisleFromTargetNote(createState(), {
      activeNoteId: 'note-active',
      focusedAisleId: 'active-aisle-1',
      targetNoteId: 'note-target',
      mode: 'synced',
      idGenerator: idSequence(['copy-aisle-1', 'copy-aisle-2']),
    })

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(noteBody(result.state, 'body-active').aisles).toEqual([
      { id: 'copy-aisle-1', aisleBodyId: 'target-aisle-body-1' },
      { id: 'copy-aisle-2', aisleBodyId: 'target-aisle-body-2' },
      { id: 'active-aisle-2', aisleBodyId: 'active-aisle-body-2' },
    ])
    expect(result.activeAisleId).toBe('copy-aisle-1')
  })

  it('replaces the focused aisle with independent target aisle bodies', () => {
    const result = replaceFocusedAisleFromTargetNote(createState(), {
      activeNoteId: 'note-active',
      focusedAisleId: 'active-aisle-2',
      targetNoteId: 'note-target',
      mode: 'independent',
      idGenerator: idSequence(['copy-body-1', 'copy-aisle-1', 'copy-body-2', 'copy-aisle-2']),
    })

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(noteBody(result.state, 'body-active').aisles).toEqual([
      { id: 'active-aisle-1', aisleBodyId: 'active-aisle-body-1' },
      { id: 'copy-aisle-1', aisleBodyId: 'copy-body-1' },
      { id: 'copy-aisle-2', aisleBodyId: 'copy-body-2' },
    ])
    expect(result.state.noteAisleBodies?.find((body) => body.id === 'copy-body-1')?.markdown).toBe('target one')
    expect(result.state.noteAisleBodies?.find((body) => body.id === 'copy-body-1')?.tags).toEqual(['target'])
  })

  it('replaces the active note body with a synced target body while preserving active note metadata', () => {
    const result = replaceActiveNoteBodyFromTargetNote(createState(), {
      activeNoteId: 'note-active',
      targetNoteId: 'note-target',
      mode: 'synced',
    })

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(findNotebookNote(result.state.notebook.items, 'note-active')?.note).toMatchObject({
      id: 'note-active',
      title: 'Active',
      noteBodyId: 'body-target',
    })
  })

  it('replaces the active note body with an independent cloned body', () => {
    const result = replaceActiveNoteBodyFromTargetNote(createState(), {
      activeNoteId: 'note-active',
      targetNoteId: 'note-target',
      mode: 'independent',
      idGenerator: idSequence(['clone-body-1', 'clone-aisle-1', 'clone-body-2', 'clone-aisle-2', 'clone-note-body']),
    })

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(findNotebookNote(result.state.notebook.items, 'note-active')?.note.noteBodyId).toBe('clone-note-body')
    expect(noteBody(result.state, 'clone-note-body').aisles).toEqual([
      { id: 'clone-aisle-1', aisleBodyId: 'clone-body-1' },
      { id: 'clone-aisle-2', aisleBodyId: 'clone-body-2' },
    ])
    expect(result.state.noteAisleBodies?.find((body) => body.id === 'clone-body-2')?.markdown).toBe('target two')
  })

  it('blocks focused copy when the replacement would exceed the note aisle limit', () => {
    const state = createState()
    const fullActive = {
      ...noteBody(state, 'body-active'),
      aisles: Array.from({ length: 8 }, (_, index) => ({
        id: `active-aisle-${index + 1}`,
        aisleBodyId: `active-aisle-body-${index + 1}`,
      })),
    }
    const result = replaceFocusedAisleFromTargetNote(
      {
        ...state,
        noteBodies: state.noteBodies.map((body) => (body.id === 'body-active' ? fullActive : body)),
      },
      {
        activeNoteId: 'note-active',
        focusedAisleId: 'active-aisle-1',
        targetNoteId: 'note-target',
        mode: 'synced',
      },
    )

    expect(result).toMatchObject({ status: 'blocked' })
  })

  it('collects notebook-only decouple rows for note bodies and aisle bodies', () => {
    const state = {
      ...createState(),
      notebook: {
        ...createState().notebook,
        items: [
          { type: 'note' as const, id: 'note-active', title: 'Active', noteBodyId: 'body-active' },
          {
            type: 'folder' as const,
            id: 'folder-work',
            title: 'Work',
            children: [
              { type: 'note' as const, id: 'note-linked', title: 'Linked', noteBodyId: 'body-active' },
              { type: 'note' as const, id: 'note-other', title: 'Other', noteBodyId: 'body-other' },
            ],
          },
        ],
      },
      noteBodies: [
        {
          id: 'body-active',
          aisles: [
            { id: 'active-aisle-1', aisleBodyId: 'shared-aisle-body' },
            { id: 'active-aisle-2', aisleBodyId: 'active-aisle-body-2' },
          ],
        },
        { id: 'body-other', aisles: [{ id: 'other-aisle-1', aisleBodyId: 'shared-aisle-body' }] },
      ],
    } satisfies AppState

    expect(getNotebookNoteDecoupleRows(state, 'body-active').map((row) => row.label)).toEqual(['Active', 'Work/Linked'])
    expect(getNotebookNoteDecoupleRows(state, 'body-active').map((row) => [row.primaryLabel, row.secondaryLabel])).toEqual([
      ['Notebook', 'Active'],
      ['Work', 'Linked'],
    ])
    expect(getNotebookAisleDecoupleRows(state, 'shared-aisle-body').map((row) => row.label)).toEqual([
      'Active / aisle 1',
      'Work > Other',
    ])
    expect(getNotebookAisleDecoupleRows(state, 'shared-aisle-body').map((row) => [row.primaryLabel, row.secondaryLabel])).toEqual([
      ['Notebook', 'Active / aisle 1'],
      ['Work', 'Other / aisle 1'],
    ])
  })

  it('de-couples selected note locations while preserving text when keep text is enabled', () => {
    const state = {
      ...createState(),
      notebook: {
        ...createState().notebook,
        items: [
          { type: 'note' as const, id: 'note-active', title: 'Active', noteBodyId: 'body-active' },
          { type: 'note' as const, id: 'note-linked', title: 'Linked', noteBodyId: 'body-active' },
        ],
      },
    } satisfies AppState

    const result = decoupleNotebookNoteLocationsInState(
      state,
      'body-active',
      new Set(['note-active']),
      true,
      idSequence(['cloned-aisle-body-1', 'cloned-aisle-1', 'cloned-aisle-body-2', 'cloned-aisle-2', 'cloned-body']),
    )

    expect(result.status).toBe('applied')
    if (result.status !== 'applied') throw new Error('expected note locations to de-couple')
    expect(findNotebookNote(result.state.notebook.items, 'note-active')?.note.noteBodyId).toBe('body-active')
    expect(findNotebookNote(result.state.notebook.items, 'note-linked')?.note.noteBodyId).toBe('cloned-body')
    expect(result.state.noteAisleBodies?.find((body) => body.id === 'cloned-aisle-body-1')?.markdown).toBe('active one')
    expect(result.state.noteAisleBodies?.find((body) => body.id === 'cloned-aisle-body-2')?.markdown).toBe('active two')
  })

  it('de-couples note locations with empty text when keep text is disabled', () => {
    const state = {
      ...createState(),
      notebook: {
        ...createState().notebook,
        items: [
          { type: 'note' as const, id: 'note-active', title: 'Active', noteBodyId: 'body-active' },
          { type: 'note' as const, id: 'note-linked', title: 'Linked', noteBodyId: 'body-active' },
        ],
      },
    } satisfies AppState

    const result = decoupleNotebookNoteLocationsInState(
      state,
      'body-active',
      new Set(['note-active']),
      false,
      idSequence(['empty-body', 'empty-aisle-body', 'empty-aisle']),
    )

    expect(result.status).toBe('applied')
    if (result.status !== 'applied') throw new Error('expected note locations to de-couple')
    expect(findNotebookNote(result.state.notebook.items, 'note-linked')?.note.noteBodyId).toBe('empty-body')
    expect(result.state.noteAisleBodies?.find((body) => body.id === 'empty-aisle-body')?.markdown).toBe('')
  })

  it('blocks note location de-couple when no synced note is retained', () => {
    const state = {
      ...createState(),
      notebook: {
        ...createState().notebook,
        items: [
          { type: 'note' as const, id: 'note-active', title: 'Active', noteBodyId: 'body-active' },
          { type: 'note' as const, id: 'note-linked', title: 'Linked', noteBodyId: 'body-active' },
        ],
      },
    } satisfies AppState

    expect(decoupleNotebookNoteLocationsInState(state, 'body-active', new Set(), true)).toMatchObject({
      status: 'blocked',
      message: 'Select at least one note to retain the information.',
    })
  })
})
