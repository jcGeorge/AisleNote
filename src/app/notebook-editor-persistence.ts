import type { AppState } from '../types/app'
import { syncNoteAisleBodyMarkdownInState } from '../notes/aisle-body-state'
import { markEditorContentStateMutation } from '../storage/persistence-scheduling'

export type NotebookEditorMarkdownSnapshot = {
  noteId: string
  noteBodyId: string
  aisleId: string
  aisleBodyId: string
  markdown: string
}

export function commitNotebookAisleMarkdownInState(
  previous: AppState,
  aisleBodyId: string,
  markdown: string,
): AppState {
  const nextState = syncNoteAisleBodyMarkdownInState(previous, aisleBodyId, markdown)
  if (nextState !== previous) markEditorContentStateMutation()
  return nextState
}

export function applyNotebookEditorMarkdownSnapshotsToState(
  previous: AppState,
  snapshots: NotebookEditorMarkdownSnapshot[],
): AppState {
  return snapshots.reduce(
    (nextState, snapshot) => commitNotebookAisleMarkdownInState(nextState, snapshot.aisleBodyId, snapshot.markdown),
    previous,
  )
}
