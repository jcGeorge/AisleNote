import type { AppState, NoteBody, NoteAisle } from '../types/app'
import { listNoteLocationsForBody, listSearchableNoteLocations } from './note-locations'
import { getAisleBodyId } from './aisle-body-state'

export type AisleLinkScope = 'slot' | 'cross-note'

function getLocatedNoteBodyIds(state: AppState): Set<string> {
  return new Set(listSearchableNoteLocations(state).map((entry) => entry.noteBodyId))
}

function getLocatedNoteBodies(state: AppState): NoteBody[] {
  const locatedNoteBodyIds = getLocatedNoteBodyIds(state)
  return state.noteBodies.filter((body) => locatedNoteBodyIds.has(body.id))
}

type AisleBodyUsage = {
  slotCount: number
  noteBodyIds: Set<string>
}

export function buildAisleBodyUsageByLocatedSlot(state: AppState): Map<string, AisleBodyUsage> {
  const usageByAisleBodyId = new Map<string, AisleBodyUsage>()
  for (const body of getLocatedNoteBodies(state)) {
    for (const aisle of body.aisles) {
      const aisleBodyId = getAisleBodyId(aisle)
      if (!aisleBodyId) continue
      const usage = usageByAisleBodyId.get(aisleBodyId) ?? { slotCount: 0, noteBodyIds: new Set<string>() }
      usage.slotCount += 1
      usage.noteBodyIds.add(body.id)
      usageByAisleBodyId.set(aisleBodyId, usage)
    }
  }
  return usageByAisleBodyId
}

function isAisleLinkedByScope(usage: AisleBodyUsage | undefined, noteBodyId: string, scope: AisleLinkScope): boolean {
  if (!usage) return false
  if (scope === 'slot') return usage.slotCount > 1
  return [...usage.noteBodyIds].some((bodyId) => bodyId !== noteBodyId)
}

export function getLinkedAisleIdsForNoteBody(
  state: AppState,
  noteBodyId: string,
  options: { scope?: AisleLinkScope } = {},
): Set<string> {
  const noteBody = state.noteBodies.find((body) => body.id === noteBodyId) ?? null
  if (!noteBody) return new Set()

  const locatedNoteBodyIds = getLocatedNoteBodyIds(state)
  if (!locatedNoteBodyIds.has(noteBodyId)) return new Set()

  const scope = options.scope ?? 'slot'
  const usageByAisleBodyId = buildAisleBodyUsageByLocatedSlot(state)
  return new Set(
    noteBody.aisles
      .filter((aisle: NoteAisle) =>
        isAisleLinkedByScope(usageByAisleBodyId.get(getAisleBodyId(aisle)), noteBodyId, scope),
      )
      .map((aisle) => aisle.id),
  )
}

export function isNoteBodyLinked(state: AppState, noteBodyId: string): boolean {
  if (!noteBodyId) return false
  if (listNoteLocationsForBody(state, noteBodyId).length > 1) return true
  return getLinkedAisleIdsForNoteBody(state, noteBodyId, { scope: 'cross-note' }).size > 0
}
