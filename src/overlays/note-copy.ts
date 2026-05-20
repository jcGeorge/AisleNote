import { cloneNoteBodyAsIndependentCopy } from '../notes/note-markdown'
import { getLocationInfo, updateNoteLocationBody } from '../notes/note-locations'
import type { AppState, NoteCopyMode, NoteLocation } from '../types/app'

export type ApplyNoteCopyResult =
  | { status: 'applied'; state: AppState; mode: NoteCopyMode }
  | { status: 'already-linked'; state: AppState; mode: NoteCopyMode }
  | { status: 'missing-target'; state: AppState; mode: NoteCopyMode }

export function applyNoteCopyToState(
  sourceState: AppState,
  source: NoteLocation,
  target: NoteLocation,
  mode: NoteCopyMode,
): ApplyNoteCopyResult {
  const sourceInfo = getLocationInfo(sourceState, source)
  const targetInfo = getLocationInfo(sourceState, target)
  if (!targetInfo.noteBodyId) {
    return { status: 'missing-target', state: sourceState, mode }
  }

  if (mode === 'linked') {
    if (sourceInfo.noteBodyId && sourceInfo.noteBodyId === targetInfo.noteBodyId) {
      return { status: 'already-linked', state: sourceState, mode }
    }

    return {
      status: 'applied',
      state: updateNoteLocationBody(sourceState, source, targetInfo.noteBodyId),
      mode,
    }
  }

  const targetBody = sourceState.noteBodies.find((candidate) => candidate.id === targetInfo.noteBodyId) ?? null
  if (!targetBody) {
    return { status: 'missing-target', state: sourceState, mode }
  }

  const copiedBody = cloneNoteBodyAsIndependentCopy(targetBody)
  return {
    status: 'applied',
    state: updateNoteLocationBody(
      {
        ...sourceState,
        noteBodies: [...sourceState.noteBodies, copiedBody],
      },
      source,
      copiedBody.id,
    ),
    mode,
  }
}
