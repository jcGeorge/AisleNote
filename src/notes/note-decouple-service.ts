import { buildNoteLocationKey, listNoteLocationsForBody, updateNoteLocationBody } from './note-locations'
import { cloneNoteBodyAsIndependentCopy } from './aisle-body-state'
import { ensureNoteBodiesForAppState } from '../state/app-state'
import { createId, createTimestamp } from '../state/workspace'
import type { AppState, NoteAisleBody, NoteBody } from '../types/app'

function createEmptyDecoupledNoteBody(): { body: NoteBody; aisleBodies: NoteAisleBody[] } {
  const timestamp = createTimestamp()
  const aisleBodyId = createId()
  const body: NoteBody = {
    id: createId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    aisles: [{ id: createId(), aisleBodyId }],
  }
  return {
    body,
    aisleBodies: [{ id: aisleBodyId, createdAt: timestamp, updatedAt: timestamp, markdown: '' }],
  }
}

export function decoupleNoteLocationsInState(
  sourceState: AppState,
  noteBodyId: string,
  keepLocationKeys: Set<string>,
  keepData: boolean,
): AppState {
  const workingState = ensureNoteBodiesForAppState(sourceState)
  const locations = listNoteLocationsForBody(workingState, noteBodyId)
  const originalBody = workingState.noteBodies.find((body) => body.id === noteBodyId) ?? null
  let nextState = workingState
  const newBodies: NoteBody[] = []
  const newAisleBodies: NoteAisleBody[] = []

  for (const location of locations) {
    if (keepLocationKeys.has(buildNoteLocationKey(location))) continue
    const copied = keepData && originalBody
      ? cloneNoteBodyAsIndependentCopy(originalBody, workingState.noteAisleBodies)
      : createEmptyDecoupledNoteBody()
    newBodies.push(copied.body)
    newAisleBodies.push(...copied.aisleBodies)
    nextState = updateNoteLocationBody(nextState, location, copied.body.id)
  }

  if (newBodies.length === 0 && newAisleBodies.length === 0) return nextState
  return {
    ...nextState,
    noteBodies: [...nextState.noteBodies, ...newBodies],
    noteAisleBodies: [...(nextState.noteAisleBodies ?? []), ...newAisleBodies],
  }
}
