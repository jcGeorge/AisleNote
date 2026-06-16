import { describe, expect, it } from 'vitest'
import { DEFAULT_STATE } from '../state/app-state'
import { getEditorContentStateMutationVersion } from '../storage/persistence-scheduling'
import {
  applyNotebookEditorMarkdownSnapshotsToState,
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
})
