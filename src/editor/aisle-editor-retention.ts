import type { PendingContent, ResolvedNoteAisle } from '../types/app'
import { getAisleBodyId } from '../notes/aisle-body-state'
import type { ActiveEditorCore } from './editor-core'

export const AISLE_EDITOR_INTERSECTION_ROOT_MARGIN = '0px 100% 0px 100%'

export type AisleEditorRetentionInput = {
  aisleIds: string[]
  activeAisleId: string
  backgroundAisleIds?: Iterable<string>
  nearVisibleAisleIds?: Iterable<string>
  recentAisleIds?: Iterable<string>
  retainNearVisibleAisles?: boolean
}

export type AisleEditorCoreRetentionInput = {
  editorCore: ActiveEditorCore
  aisleIds: string[]
  activeAisleId: string
  backgroundAisleIds?: Iterable<string>
  nearVisibleAisleIds?: Iterable<string>
  recentAisleIds?: Iterable<string>
  toastRecentRetainLimit: number
  smallNoteLiveLimit: number
}

function takeIterableValues(values: Iterable<string>, limit: number) {
  if (limit <= 0) return []
  const selected: string[] = []
  for (const value of values) {
    selected.push(value)
    if (selected.length >= limit) break
  }
  return selected
}

export function buildRetainedAisleEditorIds({
  aisleIds,
  activeAisleId,
  backgroundAisleIds = [],
  nearVisibleAisleIds = [],
  recentAisleIds = [],
  retainNearVisibleAisles = false,
}: AisleEditorRetentionInput): Set<string> {
  const validIds = new Set(aisleIds)
  const retainedIds = new Set<string>()

  const addIfValid = (aisleId: string) => {
    if (validIds.has(aisleId)) retainedIds.add(aisleId)
  }

  if (activeAisleId) {
    addIfValid(activeAisleId)
  }

  if (retainNearVisibleAisles) {
    for (const aisleId of nearVisibleAisleIds) {
      addIfValid(aisleId)
    }
  }

  for (const aisleId of backgroundAisleIds) {
    addIfValid(aisleId)
  }

  for (const aisleId of recentAisleIds) {
    addIfValid(aisleId)
  }

  return retainedIds
}

export function buildRetainedAisleEditorIdsForCore({
  editorCore,
  aisleIds,
  activeAisleId,
  backgroundAisleIds = [],
  nearVisibleAisleIds = [],
  recentAisleIds = [],
  toastRecentRetainLimit,
  smallNoteLiveLimit,
}: AisleEditorCoreRetentionInput): Set<string> {
  if (editorCore === 'codemirror') {
    return buildRetainedAisleEditorIds({
      aisleIds,
      activeAisleId,
    })
  }

  return buildRetainedAisleEditorIds({
    aisleIds,
    activeAisleId,
    backgroundAisleIds: aisleIds.length <= smallNoteLiveLimit ? backgroundAisleIds : [],
    nearVisibleAisleIds,
    recentAisleIds: takeIterableValues(recentAisleIds, toastRecentRetainLimit),
    retainNearVisibleAisles: aisleIds.length > smallNoteLiveLimit,
  })
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
