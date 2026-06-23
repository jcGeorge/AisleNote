import { describe, expect, it } from 'vitest'
import type { AppState, NoteBody } from '../types/app'
import {
  applyNotebookStructureClipboardPayload,
  buildNotebookStructureClipboardPayload,
  parseNotebookStructureClipboardPayload,
  readNotebookStructureClipboardPayloadFromNavigator,
  readNotebookStructureClipboardPayloadFromDataTransfer,
  rememberNotebookStructureClipboardPayload,
  serializeNotebookStructureClipboardPayload,
  AISLENOTE_NOTEBOOK_STRUCTURE_CLIPBOARD_MIME,
} from './notebook-structure-clipboard'

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
          children: [{ type: 'note', id: 'note-source', title: 'Source', noteBodyId: 'body-source' }],
        },
      ],
      deletedItems: [],
      settings: { autoRemoveDeletedDays: 30 },
    },
    noteBodies: [
      {
        id: 'body-active',
        aisles: [
          { id: 'active-aisle-1', aisleBodyId: 'active-body-1' },
          { id: 'active-aisle-2', aisleBodyId: 'active-body-2' },
        ],
      },
      {
        id: 'body-source',
        aisles: [
          { id: 'source-aisle-1', aisleBodyId: 'source-body-1' },
          { id: 'source-aisle-2', aisleBodyId: 'source-body-2' },
        ],
      },
    ],
    noteAisleBodies: [
      { id: 'active-body-1', markdown: 'active one', tags: [], frontmatter: null, frontmatterStatus: 'none' },
      { id: 'active-body-2', markdown: 'active two', tags: [], frontmatter: null, frontmatterStatus: 'none' },
      { id: 'source-body-1', markdown: 'source one', tags: ['copy'], frontmatter: null, frontmatterStatus: 'none' },
      { id: 'source-body-2', markdown: 'source two', tags: [], frontmatter: null, frontmatterStatus: 'none' },
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

describe('notebook structure clipboard', () => {
  it('serializes and parses a whole-note synced payload with clean markdown fallback', () => {
    const result = buildNotebookStructureClipboardPayload(createState(), {
      activeNoteId: 'note-source',
      kind: 'note',
      mode: 'synced',
    })

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.markdown).toBe('source one\n\nsource two')
    expect(result.payload).toMatchObject({
      version: 1,
      kind: 'note',
      mode: 'synced',
      source: { noteId: 'note-source', noteTitle: 'Source', noteBodyId: 'body-source' },
    })
    expect(parseNotebookStructureClipboardPayload(serializeNotebookStructureClipboardPayload(result.payload))).toEqual(
      result.payload,
    )
  })

  it('recovers a remembered payload from clean text clipboard data', () => {
    const result = buildNotebookStructureClipboardPayload(createState(), {
      activeNoteId: 'note-source',
      kind: 'aisle',
      mode: 'independent',
      aisleId: 'source-aisle-1',
    })

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    rememberNotebookStructureClipboardPayload(result.payload, result.markdown)
    const payload = readNotebookStructureClipboardPayloadFromDataTransfer({
      getData: (type: string) => (type === 'text/plain' ? result.markdown : ''),
    })
    expect(payload).toEqual(result.payload)
  })

  it('reads async clipboard custom MIME and clean-text fallback payloads', async () => {
    const result = buildNotebookStructureClipboardPayload(createState(), {
      activeNoteId: 'note-source',
      kind: 'note',
      mode: 'synced',
    })
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return

    const serialized = serializeNotebookStructureClipboardPayload(result.payload)
    await expect(
      readNotebookStructureClipboardPayloadFromNavigator({
        read: async () => [
          {
            types: [AISLENOTE_NOTEBOOK_STRUCTURE_CLIPBOARD_MIME],
            getType: async () => new Blob([serialized], { type: AISLENOTE_NOTEBOOK_STRUCTURE_CLIPBOARD_MIME }),
          },
        ],
      } as unknown as Clipboard),
    ).resolves.toEqual(result.payload)

    rememberNotebookStructureClipboardPayload(result.payload, result.markdown)
    await expect(
      readNotebookStructureClipboardPayloadFromNavigator({
        readText: async () => result.markdown,
      } as unknown as Clipboard),
    ).resolves.toEqual(result.payload)
  })

  it('pastes a whole-note independent copy by replacing the focused aisle with cloned source aisles', () => {
    const state = createState()
    const copy = buildNotebookStructureClipboardPayload(state, {
      activeNoteId: 'note-source',
      kind: 'note',
      mode: 'independent',
    })
    expect(copy.status).toBe('ok')
    if (copy.status !== 'ok') return

    const result = applyNotebookStructureClipboardPayload(state, {
      activeNoteId: 'note-active',
      focusedAisleId: 'active-aisle-1',
      payload: copy.payload,
      idGenerator: idSequence(['clone-body-1', 'clone-aisle-1', 'clone-body-2', 'clone-aisle-2']),
    })

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(noteBody(result.state, 'body-active').aisles).toEqual([
      { id: 'clone-aisle-1', aisleBodyId: 'clone-body-1' },
      { id: 'clone-aisle-2', aisleBodyId: 'clone-body-2' },
      { id: 'active-aisle-2', aisleBodyId: 'active-body-2' },
    ])
    expect(result.state.noteAisleBodies?.find((body) => body.id === 'clone-body-1')?.markdown).toBe('source one')
    expect(result.state.noteAisleBodies?.find((body) => body.id === 'clone-body-1')?.tags).toEqual(['copy'])
  })

  it('pastes a whole-note synced copy by sharing source aisle body ids', () => {
    const state = createState()
    const copy = buildNotebookStructureClipboardPayload(state, {
      activeNoteId: 'note-source',
      kind: 'note',
      mode: 'synced',
    })
    expect(copy.status).toBe('ok')
    if (copy.status !== 'ok') return

    const result = applyNotebookStructureClipboardPayload(state, {
      activeNoteId: 'note-active',
      focusedAisleId: 'active-aisle-2',
      payload: copy.payload,
      idGenerator: idSequence(['synced-aisle-1', 'synced-aisle-2']),
    })

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(noteBody(result.state, 'body-active').aisles).toEqual([
      { id: 'active-aisle-1', aisleBodyId: 'active-body-1' },
      { id: 'synced-aisle-1', aisleBodyId: 'source-body-1' },
      { id: 'synced-aisle-2', aisleBodyId: 'source-body-2' },
    ])
  })

  it('pastes an aisle copy by replacing only the focused aisle', () => {
    const state = createState()
    const copy = buildNotebookStructureClipboardPayload(state, {
      activeNoteId: 'note-source',
      kind: 'aisle',
      mode: 'synced',
      aisleId: 'source-aisle-2',
    })
    expect(copy.status).toBe('ok')
    if (copy.status !== 'ok') return

    const result = applyNotebookStructureClipboardPayload(state, {
      activeNoteId: 'note-active',
      focusedAisleId: 'active-aisle-1',
      payload: copy.payload,
      idGenerator: idSequence(['synced-aisle']),
    })

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(noteBody(result.state, 'body-active').aisles).toEqual([
      { id: 'synced-aisle', aisleBodyId: 'source-body-2' },
      { id: 'active-aisle-2', aisleBodyId: 'active-body-2' },
    ])
  })

  it('blocks stale synced payloads instead of creating broken references', () => {
    const state = createState()
    const copy = buildNotebookStructureClipboardPayload(state, {
      activeNoteId: 'note-source',
      kind: 'note',
      mode: 'synced',
    })
    expect(copy.status).toBe('ok')
    if (copy.status !== 'ok') return

    const result = applyNotebookStructureClipboardPayload(
      {
        ...state,
        noteAisleBodies: state.noteAisleBodies?.filter((body) => body.id !== 'source-body-1'),
      },
      {
        activeNoteId: 'note-active',
        focusedAisleId: 'active-aisle-1',
        payload: copy.payload,
      },
    )

    expect(result).toMatchObject({ status: 'blocked' })
  })

  it('blocks structural paste when it would exceed the note aisle limit', () => {
    const state = createState()
    const copy = buildNotebookStructureClipboardPayload(state, {
      activeNoteId: 'note-source',
      kind: 'note',
      mode: 'synced',
    })
    expect(copy.status).toBe('ok')
    if (copy.status !== 'ok') return

    const fullActive = {
      ...noteBody(state, 'body-active'),
      aisles: Array.from({ length: 8 }, (_, index) => ({
        id: `active-aisle-${index + 1}`,
        aisleBodyId: `active-body-${index + 1}`,
      })),
    }
    const result = applyNotebookStructureClipboardPayload(
      {
        ...state,
        noteBodies: state.noteBodies.map((body) => (body.id === 'body-active' ? fullActive : body)),
      },
      {
        activeNoteId: 'note-active',
        focusedAisleId: 'active-aisle-1',
        payload: copy.payload,
      },
    )

    expect(result).toMatchObject({ status: 'blocked' })
  })
})
