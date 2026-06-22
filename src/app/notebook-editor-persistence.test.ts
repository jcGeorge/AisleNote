import { describe, expect, it } from 'vitest'
import { DEFAULT_STATE } from '../state/app-state'
import { getEditorContentStateMutationVersion } from '../storage/persistence-scheduling'
import {
  applyNotebookEditorMarkdownSnapshotsToState,
  collapseNotebookEditorMarkdownSnapshots,
  commitNotebookAisleMarkdownInState,
} from './notebook-editor-persistence'

describe('notebook editor persistence commits', () => {
  it('marks editor-content mutations only when notebook markdown changes', () => {
    const aisleBodyId = DEFAULT_STATE.noteAisleBodies[0]?.id ?? ''
    const initialVersion = getEditorContentStateMutationVersion()

    const unchanged = commitNotebookAisleMarkdownInState(DEFAULT_STATE, aisleBodyId, '')
    expect(unchanged).toBe(DEFAULT_STATE)
    expect(getEditorContentStateMutationVersion()).toBe(initialVersion)

    const changed = commitNotebookAisleMarkdownInState(DEFAULT_STATE, aisleBodyId, 'persist me')
    expect(changed).not.toBe(DEFAULT_STATE)
    expect(getEditorContentStateMutationVersion()).toBe(initialVersion + 1)
  })

  it('applies mounted editor snapshots to a concrete next state', () => {
    const state = structuredClone(DEFAULT_STATE)
    const note = state.notebook.items.find((item) => item.type === 'note')
    if (!note || note.type !== 'note') throw new Error('default state note missing')
    const noteBody = state.noteBodies.find((body) => body.id === note.noteBodyId)
    const aisle = noteBody?.aisles[0]
    expect(noteBody).toBeDefined()
    expect(aisle).toBeDefined()

    const initialVersion = getEditorContentStateMutationVersion()
    const nextState = applyNotebookEditorMarkdownSnapshotsToState(state, [{
      noteId: note.id,
      noteBodyId: noteBody?.id ?? '',
      aisleId: aisle?.id ?? '',
      aisleBodyId: aisle?.aisleBodyId ?? '',
      markdown: 'snapshot markdown',
    }])

    expect(nextState).not.toBe(state)
    expect(nextState.noteAisleBodies?.find((body) => body.id === aisle?.aisleBodyId)?.markdown).toBe('snapshot markdown')
    expect(getEditorContentStateMutationVersion()).toBe(initialVersion + 1)
  })

  it('collapses synced aisle snapshots by shared body before applying them', () => {
    const state = structuredClone(DEFAULT_STATE)
    const note = state.notebook.items.find((item) => item.type === 'note')
    if (!note || note.type !== 'note') throw new Error('default state note missing')
    const noteBody = state.noteBodies.find((body) => body.id === note.noteBodyId)
    const aisle = noteBody?.aisles[0]
    expect(noteBody).toBeDefined()
    expect(aisle).toBeDefined()

    const initialVersion = getEditorContentStateMutationVersion()
    const nextState = applyNotebookEditorMarkdownSnapshotsToState(state, [
      {
        noteId: 'older-note',
        noteBodyId: 'older-body',
        aisleId: 'older-aisle',
        aisleBodyId: aisle?.aisleBodyId ?? '',
        markdown: 'older shared markdown',
        revision: 1,
      },
      {
        noteId: 'newer-note',
        noteBodyId: 'newer-body',
        aisleId: 'newer-aisle',
        aisleBodyId: aisle?.aisleBodyId ?? '',
        markdown: 'newer shared markdown',
        revision: 2,
      },
    ])

    expect(nextState.noteAisleBodies?.find((body) => body.id === aisle?.aisleBodyId)?.markdown).toBe('newer shared markdown')
    expect(getEditorContentStateMutationVersion()).toBe(initialVersion + 1)
  })

  it('prefers the active editor when synced snapshot revisions tie', () => {
    const snapshots = collapseNotebookEditorMarkdownSnapshots([
      {
        noteId: 'note-inactive',
        noteBodyId: 'body-inactive',
        aisleId: 'aisle-inactive',
        aisleBodyId: 'shared-body',
        markdown: 'inactive markdown',
        revision: 4,
      },
      {
        noteId: 'note-active',
        noteBodyId: 'body-active',
        aisleId: 'aisle-active',
        aisleBodyId: 'shared-body',
        markdown: 'active markdown',
        revision: 4,
        active: true,
      },
    ])

    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]?.markdown).toBe('active markdown')
  })

  it('uses a stable note body and aisle order when synced snapshot revisions and active state tie', () => {
    const snapshots = collapseNotebookEditorMarkdownSnapshots([
      {
        noteId: 'note-a',
        noteBodyId: 'body-a',
        aisleId: 'aisle-a',
        aisleBodyId: 'shared-body',
        markdown: 'stable lower markdown',
        revision: 5,
      },
      {
        noteId: 'note-z',
        noteBodyId: 'body-z',
        aisleId: 'aisle-z',
        aisleBodyId: 'shared-body',
        markdown: 'stable higher markdown',
        revision: 5,
      },
    ])

    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]?.markdown).toBe('stable higher markdown')
  })

  it('commits one synced aisle body change across every note body that references it', () => {
    const state = structuredClone(DEFAULT_STATE)
    state.noteBodies = [
      { id: 'body-a', updatedAt: 'before-a', aisles: [{ id: 'aisle-a', aisleBodyId: 'shared-body' }] },
      { id: 'body-b', updatedAt: 'before-b', aisles: [{ id: 'aisle-b', aisleBodyId: 'shared-body' }] },
      { id: 'body-c', updatedAt: 'before-c', aisles: [{ id: 'aisle-c', aisleBodyId: 'other-body' }] },
    ]
    state.noteAisleBodies = [
      { id: 'shared-body', markdown: 'old shared markdown' },
      { id: 'other-body', markdown: 'other markdown' },
    ]

    const nextState = applyNotebookEditorMarkdownSnapshotsToState(state, [{
      noteId: 'note-a',
      noteBodyId: 'body-a',
      aisleId: 'aisle-a',
      aisleBodyId: 'shared-body',
      markdown: 'new shared markdown',
      revision: 1,
    }])

    expect(nextState.noteAisleBodies?.find((body) => body.id === 'shared-body')?.markdown).toBe('new shared markdown')
    expect(nextState.noteBodies.find((body) => body.id === 'body-a')?.updatedAt).not.toBe('before-a')
    expect(nextState.noteBodies.find((body) => body.id === 'body-b')?.updatedAt).not.toBe('before-b')
    expect(nextState.noteBodies.find((body) => body.id === 'body-c')?.updatedAt).toBe('before-c')
  })
})
