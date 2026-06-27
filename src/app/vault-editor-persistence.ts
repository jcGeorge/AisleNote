import type { AppState } from '../types/app'
import { syncNoteAisleBodyMarkdownInState } from '../notes/aisle-body-state'
import { markEditorContentStateMutation } from '../storage/persistence-scheduling'

export type VaultEditorMarkdownSnapshot = {
  noteId: string
  noteBodyId: string
  aisleId: string
  aisleBodyId: string
  markdown: string
  revision?: number
  active?: boolean
}

function getSnapshotRevision(snapshot: VaultEditorMarkdownSnapshot): number {
  return typeof snapshot.revision === 'number' && Number.isFinite(snapshot.revision)
    ? snapshot.revision
    : 0
}

function getSnapshotTieBreakerKey(snapshot: VaultEditorMarkdownSnapshot): string {
  return `${snapshot.noteBodyId}\0${snapshot.aisleId}\0${snapshot.noteId}`
}

function isPreferredVaultEditorSnapshot(
  candidate: VaultEditorMarkdownSnapshot,
  current: VaultEditorMarkdownSnapshot,
): boolean {
  const candidateRevision = getSnapshotRevision(candidate)
  const currentRevision = getSnapshotRevision(current)
  if (candidateRevision !== currentRevision) return candidateRevision > currentRevision
  if (candidate.active !== current.active) return candidate.active === true
  return getSnapshotTieBreakerKey(candidate) > getSnapshotTieBreakerKey(current)
}

export function collapseVaultEditorMarkdownSnapshots(
  snapshots: VaultEditorMarkdownSnapshot[],
): VaultEditorMarkdownSnapshot[] {
  const snapshotByAisleBodyId = new Map<string, VaultEditorMarkdownSnapshot>()
  snapshots.forEach((snapshot) => {
    if (!snapshot.aisleBodyId) return
    const current = snapshotByAisleBodyId.get(snapshot.aisleBodyId)
    if (!current || isPreferredVaultEditorSnapshot(snapshot, current)) {
      snapshotByAisleBodyId.set(snapshot.aisleBodyId, snapshot)
    }
  })
  return Array.from(snapshotByAisleBodyId.values())
}

export function commitVaultAisleMarkdownInState(
  previous: AppState,
  aisleBodyId: string,
  markdown: string,
): AppState {
  const nextState = syncNoteAisleBodyMarkdownInState(previous, aisleBodyId, markdown)
  if (nextState !== previous) markEditorContentStateMutation()
  return nextState
}

export function applyVaultEditorMarkdownSnapshotsToState(
  previous: AppState,
  snapshots: VaultEditorMarkdownSnapshot[],
): AppState {
  return collapseVaultEditorMarkdownSnapshots(snapshots).reduce(
    (nextState, snapshot) => commitVaultAisleMarkdownInState(nextState, snapshot.aisleBodyId, snapshot.markdown),
    previous,
  )
}
