import { createId, createTab } from '../state/workspace'
import { createDomainFromSpaces, projectActiveDomainState } from '../state/domains'
import { moveDomainToTrash, moveSpaceToTrash } from '../trash/domain-space-trash'
import type {
  AppState,
  ArrangeInsertPosition,
  ArrangeSelectionKind,
  ArrangeSelectionState,
  Domain,
  SelectionClickModifiers,
  Space,
  SubTab,
  Tab,
  WorkspaceData,
} from '../types/app'

export const EMPTY_ARRANGE_SELECTION: ArrangeSelectionState = {
  kind: null,
  parentTabId: null,
  domainId: null,
  selectedIds: [],
  anchorId: null,
}

type UpdateArrangeSelectionForClickOptions = {
  selection: ArrangeSelectionState
  kind: ArrangeSelectionKind
  parentTabId?: string | null
  domainId?: string | null
  itemId: string
  orderedIds: string[]
  currentId: string | null
  modifiers: SelectionClickModifiers
}

type NormalizeArrangeSelectionOptions = {
  selection: ArrangeSelectionState
  orderedParentIds: string[]
  activeParentTabId: string | null
  orderedActiveSubTabIds: string[]
  orderedDomainIds: string[]
  activeDomainId: string | null
  orderedActiveDomainSpaceIds: string[]
}

type MoveSelectedItemsToTrashOptions = {
  deletedAt?: number
  createDeletedEntryId?: () => string
  createFallbackTab?: () => Tab
}

export type ArrangeDomainSpaceMutationResult = {
  state: AppState
  changed: boolean
  reason?:
    | 'missing-domain'
    | 'missing-source-domain'
    | 'missing-target-domain'
    | 'missing-space'
    | 'last-domain'
    | 'last-space'
    | 'same-domain'
}

function getDeletedEntryId(options: MoveSelectedItemsToTrashOptions) {
  return options.createDeletedEntryId?.() ?? createId()
}

function getDeletedAt(options: MoveSelectedItemsToTrashOptions) {
  return options.deletedAt ?? Date.now()
}

function hasSameIds(left: string[], right: string[]) {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

export function isSelectionModifier(modifiers: SelectionClickModifiers): boolean {
  return modifiers.shiftKey || modifiers.ctrlKey || modifiers.metaKey
}

export function orderIds(orderedIds: string[], ids: Iterable<string>): string[] {
  const idSet = new Set(ids)
  return orderedIds.filter((id) => idSet.has(id))
}

export function getContiguousRangeIds(orderedIds: string[], anchorId: string, targetId: string): string[] {
  const anchorIndex = orderedIds.indexOf(anchorId)
  const targetIndex = orderedIds.indexOf(targetId)
  if (anchorIndex < 0 || targetIndex < 0) return targetIndex < 0 ? [] : [targetId]

  const start = Math.min(anchorIndex, targetIndex)
  const end = Math.max(anchorIndex, targetIndex)
  return orderedIds.slice(start, end + 1)
}

export function updateArrangeSelectionForClick({
  selection,
  kind,
  parentTabId = null,
  domainId = null,
  itemId,
  orderedIds,
  currentId,
  modifiers,
}: UpdateArrangeSelectionForClickOptions): ArrangeSelectionState {
  if (!isSelectionModifier(modifiers) || !orderedIds.includes(itemId)) {
    return EMPTY_ARRANGE_SELECTION
  }

  const selectionParentTabId = kind === 'subtab' ? parentTabId : null
  const selectionDomainId = kind === 'space' ? domainId : null
  const isSameSelection =
    selection.kind === kind &&
    (kind === 'parent' ||
      kind === 'domain' ||
      (kind === 'subtab' && selection.parentTabId === selectionParentTabId) ||
      (kind === 'space' && selection.domainId === selectionDomainId))
  const currentIdIsValid = Boolean(currentId && orderedIds.includes(currentId))
  const fallbackAnchorId =
    isSameSelection && selection.anchorId && orderedIds.includes(selection.anchorId)
      ? selection.anchorId
      : currentIdIsValid && currentId
        ? currentId
        : itemId

  if (modifiers.shiftKey) {
    const selectedIds = getContiguousRangeIds(orderedIds, fallbackAnchorId, itemId)
    return selectedIds.length === 0
      ? EMPTY_ARRANGE_SELECTION
      : {
          kind,
          parentTabId: selectionParentTabId,
          domainId: selectionDomainId,
          selectedIds,
          anchorId: fallbackAnchorId,
        }
  }

  const selectedIds = new Set(isSameSelection ? orderIds(orderedIds, selection.selectedIds) : [])
  if (selectedIds.size === 0 && currentIdIsValid && currentId) {
    selectedIds.add(currentId)
  }

  if (selectedIds.has(itemId)) {
    selectedIds.delete(itemId)
  } else {
    selectedIds.add(itemId)
  }

  const orderedSelectedIds = orderIds(orderedIds, selectedIds)
  return orderedSelectedIds.length === 0
    ? EMPTY_ARRANGE_SELECTION
    : {
        kind,
        parentTabId: selectionParentTabId,
        domainId: selectionDomainId,
        selectedIds: orderedSelectedIds,
        anchorId: itemId,
      }
}

export function normalizeArrangeSelection({
  selection,
  orderedParentIds,
  activeParentTabId,
  orderedActiveSubTabIds,
  orderedDomainIds,
  activeDomainId,
  orderedActiveDomainSpaceIds,
}: NormalizeArrangeSelectionOptions): ArrangeSelectionState {
  if (selection.kind === 'parent') {
    const selectedIds = orderIds(orderedParentIds, selection.selectedIds)
    if (selectedIds.length === 0) return EMPTY_ARRANGE_SELECTION
    return {
      kind: 'parent',
      parentTabId: null,
      domainId: null,
      selectedIds,
      anchorId: selection.anchorId && orderedParentIds.includes(selection.anchorId) ? selection.anchorId : selectedIds[0],
    }
  }

  if (selection.kind === 'subtab') {
    if (!activeParentTabId || selection.parentTabId !== activeParentTabId) return EMPTY_ARRANGE_SELECTION
    const selectedIds = orderIds(orderedActiveSubTabIds, selection.selectedIds)
    if (selectedIds.length === 0) return EMPTY_ARRANGE_SELECTION
    return {
      kind: 'subtab',
      parentTabId: activeParentTabId,
      domainId: null,
      selectedIds,
      anchorId: selection.anchorId && orderedActiveSubTabIds.includes(selection.anchorId) ? selection.anchorId : selectedIds[0],
    }
  }

  if (selection.kind === 'domain') {
    const selectedIds = orderIds(orderedDomainIds, selection.selectedIds)
    if (selectedIds.length === 0) return EMPTY_ARRANGE_SELECTION
    return {
      kind: 'domain',
      parentTabId: null,
      domainId: null,
      selectedIds,
      anchorId: selection.anchorId && orderedDomainIds.includes(selection.anchorId) ? selection.anchorId : selectedIds[0],
    }
  }

  if (selection.kind === 'space') {
    if (!activeDomainId || selection.domainId !== activeDomainId) return EMPTY_ARRANGE_SELECTION
    const selectedIds = orderIds(orderedActiveDomainSpaceIds, selection.selectedIds)
    if (selectedIds.length === 0) return EMPTY_ARRANGE_SELECTION
    return {
      kind: 'space',
      parentTabId: null,
      domainId: activeDomainId,
      selectedIds,
      anchorId: selection.anchorId && orderedActiveDomainSpaceIds.includes(selection.anchorId) ? selection.anchorId : selectedIds[0],
    }
  }

  return EMPTY_ARRANGE_SELECTION
}

export function moveSelectedItemsByInsertion<T extends { id: string }>(
  items: T[],
  selectedIds: string[],
  targetId: string,
  position: ArrangeInsertPosition,
): T[] {
  const selectedIdSet = new Set(selectedIds)
  if (selectedIdSet.has(targetId)) return items

  const selectedItems = items.filter((item) => selectedIdSet.has(item.id))
  if (selectedItems.length === 0) return items

  const remainingItems = items.filter((item) => !selectedIdSet.has(item.id))
  const targetIndex = remainingItems.findIndex((item) => item.id === targetId)
  if (targetIndex < 0) return items

  const insertIndex = targetIndex + (position === 'after' ? 1 : 0)
  const nextItems = [...remainingItems]
  nextItems.splice(insertIndex, 0, ...selectedItems)

  return hasSameIds(
    items.map((item) => item.id),
    nextItems.map((item) => item.id),
  )
    ? items
    : nextItems
}

function hasSameOrderedEntityIds<T extends { id: string }>(left: T[], right: T[]) {
  return hasSameIds(
    left.map((item) => item.id),
    right.map((item) => item.id),
  )
}

function orderDomains(domains: Domain[], domainIds: Iterable<string>): Domain[] {
  const selectedIdSet = new Set(domainIds)
  return domains.filter((domain) => selectedIdSet.has(domain.id))
}

function orderSpaces(spaces: Space[], spaceIds: Iterable<string>): Space[] {
  const selectedIdSet = new Set(spaceIds)
  return spaces.filter((space) => selectedIdSet.has(space.id))
}

export function moveSelectedDomainsByInsertion(
  appState: AppState,
  selectedDomainIds: string[],
  targetDomainId: string,
  position: ArrangeInsertPosition,
): AppState {
  const projected = projectActiveDomainState(appState)
  const nextDomains = moveSelectedItemsByInsertion(projected.domains, selectedDomainIds, targetDomainId, position)
  if (nextDomains === projected.domains || hasSameOrderedEntityIds(projected.domains, nextDomains)) return projected
  return projectActiveDomainState({
    ...projected,
    domains: nextDomains,
  })
}

export function moveSelectedSpacesWithinDomain(
  appState: AppState,
  sourceDomainId: string,
  selectedSpaceIds: string[],
  targetSpaceId: string,
  position: ArrangeInsertPosition,
): AppState {
  const projected = projectActiveDomainState(appState)
  const sourceDomain = projected.domains.find((domain) => domain.id === sourceDomainId)
  if (!sourceDomain) return projected
  const nextSpaces = moveSelectedItemsByInsertion(sourceDomain.spaces, selectedSpaceIds, targetSpaceId, position)
  if (nextSpaces === sourceDomain.spaces || hasSameOrderedEntityIds(sourceDomain.spaces, nextSpaces)) return projected

  const nextDomain = createDomainFromSpaces(sourceDomain.name, nextSpaces, {
    id: sourceDomain.id,
    activeSpaceId: sourceDomain.activeSpaceId,
  })
  const nextDomains = projected.domains.map((domain) => (domain.id === sourceDomain.id ? nextDomain : domain))

  return projectActiveDomainState({
    ...projected,
    activeDomainId: projected.activeDomainId,
    activeSpaceId: projected.activeSpaceId,
    spaces: projected.activeDomainId === sourceDomain.id ? nextDomain.spaces : projected.spaces,
    domains: nextDomains,
  })
}

export function moveSelectedSpacesToDomain(
  appState: AppState,
  sourceDomainId: string,
  selectedSpaceIds: string[],
  targetDomainId: string,
): ArrangeDomainSpaceMutationResult {
  const projected = projectActiveDomainState(appState)
  if (sourceDomainId === targetDomainId) return { state: projected, changed: false, reason: 'same-domain' }

  const sourceDomain = projected.domains.find((domain) => domain.id === sourceDomainId)
  const targetDomain = projected.domains.find((domain) => domain.id === targetDomainId)
  if (!sourceDomain) return { state: projected, changed: false, reason: 'missing-source-domain' }
  if (!targetDomain) return { state: projected, changed: false, reason: 'missing-target-domain' }

  const movedSpaces = orderSpaces(sourceDomain.spaces, selectedSpaceIds)
  if (movedSpaces.length === 0) return { state: projected, changed: false, reason: 'missing-space' }
  if (sourceDomain.spaces.length - movedSpaces.length < 1) return { state: projected, changed: false, reason: 'last-space' }

  const movedIdSet = new Set(movedSpaces.map((space) => space.id))
  const sourceSpaces = sourceDomain.spaces.filter((space) => !movedIdSet.has(space.id))
  const nextSourceDomain = createDomainFromSpaces(sourceDomain.name, sourceSpaces, {
    id: sourceDomain.id,
    activeSpaceId: sourceDomain.activeSpaceId && !movedIdSet.has(sourceDomain.activeSpaceId)
      ? sourceDomain.activeSpaceId
      : sourceSpaces[0]?.id,
  })
  const targetSpaces = [
    ...targetDomain.spaces,
    ...movedSpaces.filter((space) => !targetDomain.spaces.some((candidate) => candidate.id === space.id)),
  ]
  const focusSpaceId = movedSpaces[0]?.id ?? targetDomain.activeSpaceId
  const nextTargetDomain = createDomainFromSpaces(targetDomain.name, targetSpaces, {
    id: targetDomain.id,
    activeSpaceId: focusSpaceId,
  })
  const nextDomains = projected.domains.map((domain) => {
    if (domain.id === sourceDomain.id) return nextSourceDomain
    if (domain.id === targetDomain.id) return nextTargetDomain
    return domain
  })

  return {
    changed: true,
    state: projectActiveDomainState({
      ...projected,
      activeDomainId: nextTargetDomain.id,
      activeSpaceId: focusSpaceId,
      spaces: nextTargetDomain.spaces,
      domains: nextDomains,
    }),
  }
}

export function moveSelectedDomainsToTrash(
  appState: AppState,
  selectedDomainIds: string[],
  createDeletedEntryId?: () => string,
): ArrangeDomainSpaceMutationResult {
  const projected = projectActiveDomainState(appState)
  const movedDomains = orderDomains(projected.domains, selectedDomainIds)
  if (movedDomains.length === 0) return { state: projected, changed: false, reason: 'missing-domain' }
  if (projected.domains.length - movedDomains.length < 1) return { state: projected, changed: false, reason: 'last-domain' }

  let nextState = projected
  for (const domain of movedDomains) {
    const result = moveDomainToTrash(nextState, domain.id, createDeletedEntryId)
    if (!result.changed) return { state: projected, changed: false, reason: result.reason ?? 'missing-domain' }
    nextState = result.state
  }

  return { state: nextState, changed: true }
}

export function moveSelectedSpacesToTrash(
  appState: AppState,
  sourceDomainId: string,
  selectedSpaceIds: string[],
  createDeletedEntryId?: () => string,
): ArrangeDomainSpaceMutationResult {
  const projected = projectActiveDomainState(appState)
  const sourceDomain = projected.domains.find((domain) => domain.id === sourceDomainId)
  if (!sourceDomain) return { state: projected, changed: false, reason: 'missing-domain' }

  const movedSpaces = orderSpaces(sourceDomain.spaces, selectedSpaceIds)
  if (movedSpaces.length === 0) return { state: projected, changed: false, reason: 'missing-space' }
  if (sourceDomain.spaces.length - movedSpaces.length < 1) return { state: projected, changed: false, reason: 'last-space' }

  let nextState = projected
  for (const space of movedSpaces) {
    const result = moveSpaceToTrash(nextState, sourceDomainId, space.id, createDeletedEntryId)
    if (!result.changed) return { state: projected, changed: false, reason: result.reason ?? 'missing-space' }
    nextState = result.state
  }

  return { state: nextState, changed: true }
}

export function moveSelectedSubTabsToParentTab(
  data: WorkspaceData,
  sourceParentTabId: string,
  subTabIds: string[],
  targetParentTabId: string,
): WorkspaceData {
  if (sourceParentTabId === targetParentTabId) return data

  const sourceParent = data.tabs.find((tab) => tab.id === sourceParentTabId)
  const targetParent = data.tabs.find((tab) => tab.id === targetParentTabId)
  if (!sourceParent || !targetParent) return data

  const movedSubTabs = orderSubTabs(sourceParent.subTabs, subTabIds)
  if (movedSubTabs.length === 0) return data
  if (movedSubTabs.some((subTab) => targetParent.subTabs.some((targetSubTab) => targetSubTab.id === subTab.id))) {
    return data
  }

  const movedIdSet = new Set(movedSubTabs.map((subTab) => subTab.id))
  const firstMovedSubTabId = movedSubTabs[0].id

  return {
    ...data,
    activeTabId: targetParentTabId,
    tabs: data.tabs.map((tab) => {
      if (tab.id === sourceParentTabId) {
        return {
          ...tab,
          activeSubTabId: tab.activeSubTabId && movedIdSet.has(tab.activeSubTabId) ? null : tab.activeSubTabId,
          subTabs: tab.subTabs.filter((subTab) => !movedIdSet.has(subTab.id)),
        }
      }
      if (tab.id === targetParentTabId) {
        return {
          ...tab,
          activeSubTabId: firstMovedSubTabId,
          subTabs: [...tab.subTabs, ...movedSubTabs],
        }
      }
      return tab
    }),
  }
}

export function moveSelectedParentTabsToTrash(
  data: WorkspaceData,
  parentTabIds: string[],
  options: MoveSelectedItemsToTrashOptions = {},
): WorkspaceData {
  const selectedIdSet = new Set(parentTabIds)
  const movedTabs = data.tabs.filter((tab) => selectedIdSet.has(tab.id))
  if (movedTabs.length === 0) return data

  const deletedAt = getDeletedAt(options)
  const remainingTabs = data.tabs.filter((tab) => !selectedIdSet.has(tab.id))
  const deletedTabs = [
    ...data.deletedTabs,
    ...movedTabs.map((tab) => ({
      id: getDeletedEntryId(options),
      tab,
      deletedAt,
    })),
  ]

  if (remainingTabs.length === 0) {
    const fallback = options.createFallbackTab?.() ?? createTab('tab')
    return {
      ...data,
      activeTabId: fallback.id,
      tabs: [fallback],
      deletedTabs,
    }
  }

  const activeTabWasMoved = selectedIdSet.has(data.activeTabId)
  const nextActiveTabId = activeTabWasMoved ? remainingTabs[0].id : data.activeTabId
  return {
    ...data,
    activeTabId: nextActiveTabId,
    tabs: remainingTabs.map((tab) =>
      activeTabWasMoved && tab.id === nextActiveTabId ? { ...tab, activeSubTabId: null } : tab,
    ),
    deletedTabs,
  }
}

export function moveSelectedSubTabsToTrash(
  data: WorkspaceData,
  parentTabId: string,
  subTabIds: string[],
  options: MoveSelectedItemsToTrashOptions = {},
): WorkspaceData {
  const parent = data.tabs.find((tab) => tab.id === parentTabId)
  if (!parent) return data

  const movedSubTabs = orderSubTabs(parent.subTabs, subTabIds)
  if (movedSubTabs.length === 0) return data

  const deletedAt = getDeletedAt(options)
  const movedIdSet = new Set(movedSubTabs.map((subTab) => subTab.id))

  return {
    ...data,
    tabs: data.tabs.map((tab) =>
      tab.id === parentTabId
        ? {
            ...tab,
            activeSubTabId: tab.activeSubTabId && movedIdSet.has(tab.activeSubTabId) ? null : tab.activeSubTabId,
            subTabs: tab.subTabs.filter((subTab) => !movedIdSet.has(subTab.id)),
          }
        : tab,
    ),
    deletedSubTabs: [
      ...data.deletedSubTabs,
      ...movedSubTabs.map((subTab) => ({
        id: getDeletedEntryId(options),
        parentTabId: parent.id,
        parentTabTitle: parent.title,
        subTab,
        deletedAt,
      })),
    ],
  }
}

function orderSubTabs(subTabs: SubTab[], subTabIds: string[]): SubTab[] {
  const selectedIdSet = new Set(subTabIds)
  return subTabs.filter((subTab) => selectedIdSet.has(subTab.id))
}
