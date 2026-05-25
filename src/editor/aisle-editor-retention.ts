import type { PendingContent, ResolvedNoteAisle } from '../types/app'
import { getAisleBodyId } from '../notes/aisle-body-state'

export const AISLE_EDITOR_INTERSECTION_ROOT_MARGIN = '0px 100% 0px 100%'
export const AISLE_EDITOR_IDLE_UNMOUNT_MS = 2000
export const AISLE_EDITOR_RECENT_CACHE_SIZE = 2
export const AISLE_EDITOR_ADJACENT_OVERSCAN = 1

export type AisleEditorRetentionInput = {
  aisleIds: string[]
  activeAisleId: string
  nearVisibleAisleIds?: Iterable<string>
  recentAisleIds?: Iterable<string>
  adjacentOverscan?: number
}

export function updateRecentAisleIds(
  currentIds: readonly string[],
  aisleId: string,
  maxSize = AISLE_EDITOR_RECENT_CACHE_SIZE,
): string[] {
  if (!aisleId || maxSize <= 0) return []
  return [aisleId, ...currentIds.filter((candidate) => candidate !== aisleId)].slice(0, maxSize)
}

export function buildRetainedAisleEditorIds({
  aisleIds,
  activeAisleId,
  nearVisibleAisleIds = [],
  recentAisleIds = [],
  adjacentOverscan = AISLE_EDITOR_ADJACENT_OVERSCAN,
}: AisleEditorRetentionInput): Set<string> {
  const validIds = new Set(aisleIds)
  const retainedIds = new Set<string>()
  const adjacentAnchorIds = new Set<string>()

  const addIfValid = (aisleId: string) => {
    if (validIds.has(aisleId)) retainedIds.add(aisleId)
  }

  if (activeAisleId) {
    addIfValid(activeAisleId)
    adjacentAnchorIds.add(activeAisleId)
  }

  for (const aisleId of nearVisibleAisleIds) {
    addIfValid(aisleId)
    adjacentAnchorIds.add(aisleId)
  }

  for (const aisleId of recentAisleIds) {
    addIfValid(aisleId)
  }

  if (adjacentOverscan > 0) {
    for (const anchorId of adjacentAnchorIds) {
      const anchorIndex = aisleIds.indexOf(anchorId)
      if (anchorIndex < 0) continue
      for (let offset = 1; offset <= adjacentOverscan; offset += 1) {
        addIfValid(aisleIds[anchorIndex - offset])
        addIfValid(aisleIds[anchorIndex + offset])
      }
    }
  }

  return retainedIds
}

export function getAislePreviewMarkdown({
  aisle,
  pendingContent,
  lastEditorMarkdownByAisle,
}: {
  aisle: ResolvedNoteAisle
  pendingContent: Map<string, PendingContent>
  lastEditorMarkdownByAisle: Map<string, string>
}): string {
  const aisleBodyId = getAisleBodyId(aisle)
  const pending = pendingContent.get(aisleBodyId)
  if (pending?.aisleBodyId === aisleBodyId || pending?.aisleId === aisle.id) return pending.markdown
  return lastEditorMarkdownByAisle.get(aisleBodyId) ?? aisle.markdown
}
