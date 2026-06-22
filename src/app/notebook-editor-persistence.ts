import type { AppState } from '../types/app'
import { syncNoteAisleBodyMarkdownInState } from '../notes/aisle-body-state'
import { markEditorContentStateMutation } from '../storage/persistence-scheduling'

export type NotebookEditorMarkdownSnapshot = {
  noteId: string
  noteBodyId: string
  aisleId: string
  aisleBodyId: string
  markdown: string
  revision?: number
  active?: boolean
}

function getSnapshotRevision(snapshot: NotebookEditorMarkdownSnapshot): number {
  return typeof snapshot.revision === 'number' && Number.isFinite(snapshot.revision)
    ? snapshot.revision
    : 0
}

function getSnapshotTieBreakerKey(snapshot: NotebookEditorMarkdownSnapshot): string {
  return `${snapshot.noteBodyId}\0${snapshot.aisleId}\0${snapshot.noteId}`
}

function isPreferredNotebookEditorSnapshot(
  candidate: NotebookEditorMarkdownSnapshot,
  current: NotebookEditorMarkdownSnapshot,
): boolean {
  const candidateRevision = getSnapshotRevision(candidate)
  const currentRevision = getSnapshotRevision(current)
  if (candidateRevision !== currentRevision) return candidateRevision > currentRevision
  if (candidate.active !== current.active) return candidate.active === true
  return getSnapshotTieBreakerKey(candidate) > getSnapshotTieBreakerKey(current)
}

export function collapseNotebookEditorMarkdownSnapshots(
  snapshots: NotebookEditorMarkdownSnapshot[],
): NotebookEditorMarkdownSnapshot[] {
  const snapshotByAisleBodyId = new Map<string, NotebookEditorMarkdownSnapshot>()
  snapshots.forEach((snapshot) => {
    if (!snapshot.aisleBodyId) return
    const current = snapshotByAisleBodyId.get(snapshot.aisleBodyId)
    if (!current || isPreferredNotebookEditorSnapshot(snapshot, current)) {
      snapshotByAisleBodyId.set(snapshot.aisleBodyId, snapshot)
    }
  })
  return Array.from(snapshotByAisleBodyId.values())
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
  return collapseNotebookEditorMarkdownSnapshots(snapshots).reduce(
    (nextState, snapshot) => commitNotebookAisleMarkdownInState(nextState, snapshot.aisleBodyId, snapshot.markdown),
    previous,
  )
}
