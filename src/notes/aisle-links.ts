import { listSearchableNoteLocations } from './note-locations'
import { getAisleBodyId, getAisleMarkdown } from './note-markdown'
import { createId } from '../state/workspace'
import type { AppState, NoteAisle } from '../types/app'

function getLocatedNoteBodyIds(state: AppState): Set<string> {
  return new Set(listSearchableNoteLocations(state).map((entry) => entry.noteBodyId))
}

export function getLinkedAisleIdsForNoteBody(state: AppState, noteBodyId: string): Set<string> {
  const noteBody = state.noteBodies.find((body) => body.id === noteBodyId) ?? null
  if (!noteBody) return new Set()

  const locatedNoteBodyIds = getLocatedNoteBodyIds(state)
  if (!locatedNoteBodyIds.has(noteBodyId)) return new Set()

  const slotCountByAisleBodyId = new Map<string, number>()
  for (const body of state.noteBodies) {
    if (!locatedNoteBodyIds.has(body.id)) continue
    for (const aisle of body.aisles) {
      const aisleBodyId = getAisleBodyId(aisle)
      slotCountByAisleBodyId.set(aisleBodyId, (slotCountByAisleBodyId.get(aisleBodyId) ?? 0) + 1)
    }
  }

  return new Set(
    noteBody.aisles
      .filter((aisle) => (slotCountByAisleBodyId.get(getAisleBodyId(aisle)) ?? 0) > 1)
      .map((aisle) => aisle.id),
  )
}

export function materializeDecoupledAisleCopies(
  state: AppState,
  aisles: NoteAisle[],
  decoupleAisleIds: Iterable<string>,
): NoteAisle[] {
  const decoupleIds = new Set(decoupleAisleIds)
  if (decoupleIds.size === 0) return aisles
  return aisles.map((aisle) => {
    if (!decoupleIds.has(aisle.id)) return aisle
    const markdown = getAisleMarkdown(aisle, state.noteAisleBodies)
    const aisleBodyId = createId()
    return {
      ...aisle,
      aisleBodyId,
      markdown,
    }
  })
}
