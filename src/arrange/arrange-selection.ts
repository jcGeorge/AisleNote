import { createId, createTab } from '../state/workspace'
import type {
  ArrangeInsertPosition,
  ArrangeSelectionKind,
  ArrangeSelectionState,
  SelectionClickModifiers,
  SubTab,
  Tab,
  WorkspaceData,
} from '../types/app'

export const EMPTY_ARRANGE_SELECTION: ArrangeSelectionState = {
  kind: null,
  parentTabId: null,
  selectedIds: [],
  anchorId: null,
}

type UpdateArrangeSelectionForClickOptions = {
  selection: ArrangeSelectionState
  kind: ArrangeSelectionKind
  parentTabId?: string | null
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
}

type MoveSelectedItemsToTrashOptions = {
  deletedAt?: number
  createDeletedEntryId?: () => string
  createFallbackTab?: () => Tab
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
  itemId,
  orderedIds,
  currentId,
  modifiers,
}: UpdateArrangeSelectionForClickOptions): ArrangeSelectionState {
  if (!isSelectionModifier(modifiers) || !orderedIds.includes(itemId)) {
    return EMPTY_ARRANGE_SELECTION
  }

  const selectionParentTabId = kind === 'subtab' ? parentTabId : null
  const isSameSelection =
    selection.kind === kind && (kind === 'parent' || selection.parentTabId === selectionParentTabId)
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
        selectedIds: orderedSelectedIds,
        anchorId: itemId,
      }
}

export function normalizeArrangeSelection({
  selection,
  orderedParentIds,
  activeParentTabId,
  orderedActiveSubTabIds,
}: NormalizeArrangeSelectionOptions): ArrangeSelectionState {
  if (selection.kind === 'parent') {
    const selectedIds = orderIds(orderedParentIds, selection.selectedIds)
    if (selectedIds.length === 0) return EMPTY_ARRANGE_SELECTION
    return {
      kind: 'parent',
      parentTabId: null,
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
      selectedIds,
      anchorId: selection.anchorId && orderedActiveSubTabIds.includes(selection.anchorId) ? selection.anchorId : selectedIds[0],
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
