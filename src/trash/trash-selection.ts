import type { ContextMenuState, DeleteTarget, TrashDomainBucket, TrashParentBucket, TrashSpaceBucket } from '../types/app'

export type TrashSelectionKind = 'domain' | 'space' | 'parent' | 'subtab'

export type TrashSelectionState =
  | {
      kind: null
      ids: []
      anchorId: null
      scopeId: null
    }
  | {
      kind: TrashSelectionKind
      ids: string[]
      anchorId: string
      scopeId: string | null
    }

export type TrashSelectionClickModifiers = {
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
}

type TrashSelectionContextOptions = {
  selection: TrashSelectionState
  kind: TrashSelectionKind
  scopeId: string | null
}

type TrashSelectionActiveReplacementOptions = {
  previousSelection: TrashSelectionState
  nextSelection: TrashSelectionState
  kind: TrashSelectionKind
  itemId: string
  currentId: string | null
  scopeId?: string | null
  modifiers: TrashSelectionClickModifiers
}

export const EMPTY_TRASH_SELECTION: TrashSelectionState = {
  kind: null,
  ids: [],
  anchorId: null,
  scopeId: null,
}

export function hasTrashSelectionModifier(modifiers: TrashSelectionClickModifiers) {
  return modifiers.shiftKey || modifiers.ctrlKey || modifiers.metaKey
}

function orderSelectedIds(ids: Iterable<string>, orderedIds: readonly string[]) {
  const selected = new Set(ids)
  return orderedIds.filter((id) => selected.has(id))
}

function rangeIds(orderedIds: readonly string[], startId: string, endId: string) {
  const start = orderedIds.indexOf(startId)
  const end = orderedIds.indexOf(endId)
  if (start < 0 || end < 0) return [endId]
  const [from, to] = start <= end ? [start, end] : [end, start]
  return orderedIds.slice(from, to + 1)
}

function isTrashSelectionContext({ selection, kind, scopeId }: TrashSelectionContextOptions) {
  return selection.kind === kind && selection.scopeId === scopeId
}

export function updateTrashSelectionForClick({
  selection,
  kind,
  itemId,
  orderedIds,
  currentId,
  scopeId = null,
  modifiers,
}: {
  selection: TrashSelectionState
  kind: TrashSelectionKind
  itemId: string
  orderedIds: readonly string[]
  currentId?: string | null
  scopeId?: string | null
  modifiers: TrashSelectionClickModifiers
}): TrashSelectionState {
  if (!hasTrashSelectionModifier(modifiers) || !orderedIds.includes(itemId)) return EMPTY_TRASH_SELECTION

  const sameSelectionScope = isTrashSelectionContext({ selection, kind, scopeId })
  const currentIdIsValid = Boolean(currentId && orderedIds.includes(currentId))
  const anchorId =
    sameSelectionScope && selection.anchorId && orderedIds.includes(selection.anchorId)
      ? selection.anchorId
      : currentIdIsValid && currentId
        ? currentId
        : itemId

  if (modifiers.shiftKey) {
    const ids = orderSelectedIds(rangeIds(orderedIds, anchorId, itemId), orderedIds)
    return ids.length > 0 ? { kind, ids, anchorId, scopeId } : EMPTY_TRASH_SELECTION
  }

  if (modifiers.ctrlKey || modifiers.metaKey) {
    const selected = new Set(sameSelectionScope ? orderSelectedIds(selection.ids, orderedIds) : [])
    if (selected.size === 0 && currentIdIsValid && currentId) {
      selected.add(currentId)
    }
    if (selected.has(itemId)) {
      selected.delete(itemId)
    } else {
      selected.add(itemId)
    }
    const ids = orderSelectedIds(selected, orderedIds)
    return ids.length > 0 ? { kind, ids, anchorId: itemId, scopeId } : EMPTY_TRASH_SELECTION
  }

  return { kind, ids: [itemId], anchorId: itemId, scopeId }
}

export function getTrashSelectionActiveReplacementId({
  previousSelection,
  nextSelection,
  kind,
  itemId,
  currentId,
  scopeId = null,
  modifiers,
}: TrashSelectionActiveReplacementOptions): string | null {
  if (modifiers.shiftKey || (!modifiers.ctrlKey && !modifiers.metaKey)) return null
  if (!currentId || itemId !== currentId) return null
  if (!isTrashSelectionContext({ selection: previousSelection, kind, scopeId })) return null
  if (previousSelection.kind === null) return null
  if (!previousSelection.ids.includes(currentId)) return null
  if (!isTrashSelectionContext({ selection: nextSelection, kind, scopeId })) return null
  if (nextSelection.kind === null) return null
  if (nextSelection.ids.includes(currentId)) return null

  return nextSelection.ids.at(-1) ?? null
}

export function getTrashDomainTarget(domain: TrashDomainBucket): DeleteTarget | null {
  if (domain.source !== 'deleted-domain' || !domain.deletedDomainEntryId) return null
  return {
    type: 'trash-domain',
    deletedDomainEntryId: domain.deletedDomainEntryId,
    domainId: domain.domainId,
  }
}

export function getTrashSpaceTarget(space: TrashSpaceBucket): DeleteTarget | null {
  if (space.source === 'live') return null
  return {
    type: 'trash-space',
    source: space.source,
    deletedSpaceEntryId: space.deletedSpaceEntryId ?? undefined,
    deletedDomainEntryId: space.deletedDomainEntryId ?? undefined,
    domainId: space.domainId,
    spaceId: space.spaceId,
  }
}

export function getTrashParentTarget(parent: TrashParentBucket): DeleteTarget {
  return {
    type: 'trash-tab',
    source: parent.source,
    deletedTabEntryId: parent.deletedTabEntryId,
    deletedDomainEntryId: parent.deletedDomainEntryId,
    deletedSpaceEntryId: parent.deletedSpaceEntryId,
    domainId: parent.domainId,
    spaceId: parent.spaceId,
    parentTabId: parent.parentTabId,
  }
}

export function getTrashSubTabTarget(parent: TrashParentBucket, subTabId: string): DeleteTarget {
  return {
    type: 'trash-subtab',
    source: parent.source,
    deletedTabEntryId: parent.deletedTabEntryId,
    deletedDomainEntryId: parent.deletedDomainEntryId,
    deletedSpaceEntryId: parent.deletedSpaceEntryId,
    domainId: parent.domainId,
    spaceId: parent.spaceId,
    parentTabId: parent.parentTabId,
    subTabId,
  }
}

export function getTrashTargetSelectionId(target: DeleteTarget): string | null {
  if (target.type === 'trash-domain') return `deleted-domain:${target.deletedDomainEntryId}`
  if (target.type === 'trash-space') {
    if (target.source === 'deleted-space') {
      return target.deletedSpaceEntryId ? `deleted-space:${target.deletedSpaceEntryId}` : null
    }
    if (!target.deletedDomainEntryId) return null
    return target.deletedSpaceEntryId
      ? `deleted-domain-space:${target.deletedDomainEntryId}:${target.deletedSpaceEntryId}`
      : `deleted-domain-live-space:${target.deletedDomainEntryId}:${target.spaceId}`
  }
  if (target.type === 'trash-tab') {
    if (target.source === 'deleted-tab') return target.deletedTabEntryId
    if (target.source === 'subtabs-only') return `subtabs-only-${target.parentTabId}`
    if (target.deletedDomainEntryId && target.spaceId) {
      return `deleted-domain-tab:${target.deletedDomainEntryId}:${target.spaceId}:${target.parentTabId}`
    }
  }
  if (target.type === 'trash-subtab') return target.subTabId
  return null
}

export function getTrashTargetScopeId(target: DeleteTarget): string | null {
  if (target.type !== 'trash-subtab') return null
  if (target.source === 'deleted-tab') return target.deletedTabEntryId ?? null
  if (target.source === 'subtabs-only') return `subtabs-only-${target.parentTabId}`
  if (target.deletedDomainEntryId && target.spaceId) {
    return `deleted-domain-tab:${target.deletedDomainEntryId}:${target.spaceId}:${target.parentTabId}`
  }
  return null
}

export function getTrashTargetsForSelection({
  selection,
  domains,
  spaces,
  parents,
  selectedParent,
}: {
  selection: TrashSelectionState
  domains: readonly TrashDomainBucket[]
  spaces: readonly TrashSpaceBucket[]
  parents: readonly TrashParentBucket[]
  selectedParent: TrashParentBucket | null
}): DeleteTarget[] {
  if (selection.kind === null || selection.ids.length === 0) return []
  const selectedIds = new Set(selection.ids)

  if (selection.kind === 'domain') {
    return domains
      .filter((domain) => selectedIds.has(domain.id))
      .map(getTrashDomainTarget)
      .filter((target): target is DeleteTarget => Boolean(target))
  }

  if (selection.kind === 'space') {
    return spaces
      .filter((space) => selectedIds.has(space.id))
      .map(getTrashSpaceTarget)
      .filter((target): target is DeleteTarget => Boolean(target))
  }

  if (selection.kind === 'parent') {
    return parents.filter((parent) => selectedIds.has(parent.id)).map(getTrashParentTarget)
  }

  if (!selectedParent || selection.scopeId !== selectedParent.id) return []
  return selectedParent.subTabs
    .filter((subTab) => selectedIds.has(subTab.id))
    .map((subTab) => getTrashSubTabTarget(selectedParent, subTab.id))
}

export function getTrashTargetFromContextMenu(contextMenu: ContextMenuState | null): DeleteTarget | null {
  if (!contextMenu) return null
  if (contextMenu.type === 'trash-domain') {
    return {
      type: 'trash-domain',
      deletedDomainEntryId: contextMenu.deletedDomainEntryId,
      domainId: contextMenu.domainId,
    }
  }
  if (contextMenu.type === 'trash-space') {
    return {
      type: 'trash-space',
      source: contextMenu.source,
      deletedSpaceEntryId: contextMenu.deletedSpaceEntryId,
      deletedDomainEntryId: contextMenu.deletedDomainEntryId,
      domainId: contextMenu.domainId,
      spaceId: contextMenu.spaceId,
    }
  }
  if (contextMenu.type === 'trash-tab') {
    return {
      type: 'trash-tab',
      source: contextMenu.source,
      deletedTabEntryId: contextMenu.deletedTabEntryId,
      deletedDomainEntryId: contextMenu.deletedDomainEntryId,
      deletedSpaceEntryId: contextMenu.deletedSpaceEntryId,
      domainId: contextMenu.domainId,
      spaceId: contextMenu.spaceId,
      parentTabId: contextMenu.parentTabId,
    }
  }
  if (contextMenu.type === 'trash-subtab') {
    return {
      type: 'trash-subtab',
      source: contextMenu.source,
      deletedTabEntryId: contextMenu.deletedTabEntryId,
      deletedDomainEntryId: contextMenu.deletedDomainEntryId,
      deletedSpaceEntryId: contextMenu.deletedSpaceEntryId,
      domainId: contextMenu.domainId,
      spaceId: contextMenu.spaceId,
      parentTabId: contextMenu.parentTabId,
      subTabId: contextMenu.subTabId,
    }
  }
  return null
}

export function getEffectiveTrashContextTargets(
  contextTarget: DeleteTarget | null,
  selectedTargets: readonly DeleteTarget[],
  selection: TrashSelectionState,
) {
  if (!contextTarget) return []
  const contextId = getTrashTargetSelectionId(contextTarget)
  if (!contextId || selection.kind === null || !selection.ids.includes(contextId)) return [contextTarget]
  const contextScopeId = getTrashTargetScopeId(contextTarget)
  if (contextScopeId !== null && selection.scopeId !== contextScopeId) return [contextTarget]
  return selectedTargets.length > 0 ? [...selectedTargets] : [contextTarget]
}
