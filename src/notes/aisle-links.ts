import { getAisleMarkdown } from './aisle-body-state'
import { createId } from '../state/workspace'
import type { AppState, ResolvedNoteAisle } from '../types/app'
export { getLinkedAisleIdsForNoteBody } from './link-status'

export function materializeDecoupledAisleCopies(
  state: AppState,
  aisles: ResolvedNoteAisle[],
  decoupleAisleIds: Iterable<string>,
): ResolvedNoteAisle[] {
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
