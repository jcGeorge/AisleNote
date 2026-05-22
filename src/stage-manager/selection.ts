import type {
  SelectionClickModifiers,
  StageManagerDraft,
  StageManagerIdSelection,
  StageManagerParentSelection,
  StageManagerSelectionAnchor,
  StageManagerSelectionSnapshot,
  StageManagerSelectionState,
  SubTab,
  Tab,
} from '../types/app'
import { getContiguousRangeIds, isSelectionModifier, orderIds } from '../arrange/arrange-selection'

export function createEmptyStageManagerParentSelection(): StageManagerParentSelection {
  return {
    mode: 'none',
    selectedSubTabIds: [],
    cachedPartialSubTabIds: null,
    partialDirection: null,
  }
}

export function createStageManagerSelectionState(tabs: Tab[]): StageManagerSelectionState {
  return Object.fromEntries(tabs.map((tab) => [tab.id, createEmptyStageManagerParentSelection()]))
}

export function createEmptyStageManagerIdSelection(): StageManagerIdSelection {
  return { selectedIds: [], anchorId: null }
}

export function createDefaultStageManagerDraft(): StageManagerDraft {
  return {
    promoteDomainId: '',
    promoteSpaceMode: 'existing',
    promoteSpaceId: '',
    newSpaceName: '',
    demoteDomainId: '',
    demoteSpaceId: '',
    demoteParentMode: 'existing',
    demoteParentId: '',
    demoteNewParentName: '',
    migrateTarget: null,
    migrateDomainId: '',
    migrateSpaceMode: 'existing',
    migrateSpaceId: '',
    migrateParentDomainId: '',
    migrateParentSpaceMode: 'current',
    migrateParentSpaceId: '',
    migrateParentMode: 'existing',
    migrateParentId: '',
    migrateNewParentName: '',
    strayHandlingMode: 'promote',
    straySelectedParentId: '',
    strayExistingParentId: '',
    strayNewParentName: '',
    destinationSortMode: 'default',
    frontmatterTemplateId: '',
    massDeleteMode: 'trash',
  }
}

export function applyStageManagerIdModifierClick({
  orderedIds,
  selection,
  activeId,
  clickedId,
  modifiers,
}: {
  orderedIds: string[]
  selection: StageManagerIdSelection
  activeId: string
  clickedId: string
  modifiers: SelectionClickModifiers
}): StageManagerIdSelection {
  if (!orderedIds.includes(clickedId)) return selection

  if (!isSelectionModifier(modifiers)) {
    return { selectedIds: [clickedId], anchorId: clickedId }
  }

  if (modifiers.shiftKey) {
    const anchorId =
      selection.anchorId && orderedIds.includes(selection.anchorId)
        ? selection.anchorId
        : orderedIds.includes(activeId)
          ? activeId
          : clickedId
    return {
      selectedIds: getContiguousRangeIds(orderedIds, anchorId, clickedId),
      anchorId,
    }
  }

  const selectedIds = new Set(selection.selectedIds.filter((id) => orderedIds.includes(id)))
  if (selectedIds.size === 0 && activeId !== clickedId && orderedIds.includes(activeId)) {
    selectedIds.add(activeId)
  }

  if (selectedIds.has(clickedId)) {
    selectedIds.delete(clickedId)
  } else {
    selectedIds.add(clickedId)
  }

  return {
    selectedIds: orderIds(orderedIds, selectedIds),
    anchorId: clickedId,
  }
}

export function orderStageManagerSubTabIds(tab: Tab, subTabIds: string[]): string[] {
  const idSet = new Set(subTabIds)
  return tab.subTabs.filter((subTab) => idSet.has(subTab.id)).map((subTab) => subTab.id)
}

export function createStageManagerFullParentSelection(tab: Tab): StageManagerParentSelection {
  return {
    mode: 'full',
    selectedSubTabIds: tab.subTabs.map((subTab) => subTab.id),
    cachedPartialSubTabIds: null,
    partialDirection: null,
  }
}

export function createStageManagerSelectionFromSubTabIds(
  tab: Tab,
  subTabIds: string[],
  previousSelection?: StageManagerParentSelection,
): StageManagerParentSelection {
  const normalizedPreviousSelection = normalizeStageManagerParentSelection(tab, previousSelection)
  const orderedSelectedIds = orderStageManagerSubTabIds(tab, subTabIds)

  if (orderedSelectedIds.length === 0) {
    return {
      mode: 'none',
      selectedSubTabIds: [],
      cachedPartialSubTabIds:
        normalizedPreviousSelection.selectedSubTabIds.length > 0
          ? normalizedPreviousSelection.selectedSubTabIds
          : normalizedPreviousSelection.cachedPartialSubTabIds,
      partialDirection: null,
    }
  }

  if (orderedSelectedIds.length >= tab.subTabs.length) {
    return {
      mode: 'full',
      selectedSubTabIds: tab.subTabs.map((subTab) => subTab.id),
      cachedPartialSubTabIds:
        normalizedPreviousSelection.mode === 'partial' && normalizedPreviousSelection.selectedSubTabIds.length > 0
          ? normalizedPreviousSelection.selectedSubTabIds
          : normalizedPreviousSelection.cachedPartialSubTabIds,
      partialDirection: null,
    }
  }

  return {
    mode: 'partial',
    selectedSubTabIds: orderedSelectedIds,
    cachedPartialSubTabIds: orderedSelectedIds,
    partialDirection: 'toward-all',
  }
}

type ApplyStageManagerParentModifierClickOptions = {
  tabs: Tab[]
  selections: StageManagerSelectionState
  activeTabId: string
  clickedTabId: string
  modifiers: SelectionClickModifiers
  anchor: StageManagerSelectionAnchor | null
}

type ApplyStageManagerSubTabModifierClickOptions = {
  tabs: Tab[]
  selections: StageManagerSelectionState
  parentTabId: string
  clickedSubTabId: string
  modifiers: SelectionClickModifiers
  anchor: StageManagerSelectionAnchor | null
}

export function applyStageManagerParentModifierClick({
  tabs,
  selections,
  activeTabId,
  clickedTabId,
  modifiers,
  anchor,
}: ApplyStageManagerParentModifierClickOptions): {
  selections: StageManagerSelectionState
  anchor: StageManagerSelectionAnchor | null
} {
  if (!isSelectionModifier(modifiers) || !tabs.some((tab) => tab.id === clickedTabId)) {
    return { selections, anchor }
  }

  const orderedParentIds = tabs.map((tab) => tab.id)
  const nextSelections: StageManagerSelectionState = { ...selections }

  if (modifiers.shiftKey) {
    const anchorTabId =
      anchor?.kind === 'parent' && orderedParentIds.includes(anchor.tabId)
        ? anchor.tabId
        : orderedParentIds.includes(activeTabId)
          ? activeTabId
          : clickedTabId
    for (const tabId of getContiguousRangeIds(orderedParentIds, anchorTabId, clickedTabId)) {
      const tab = tabs.find((candidate) => candidate.id === tabId)
      if (tab) nextSelections[tabId] = createStageManagerFullParentSelection(tab)
    }
    return {
      selections: nextSelections,
      anchor: { kind: 'parent', tabId: anchorTabId },
    }
  }

  const selectionSnapshot = buildStageManagerSelectionSnapshot(tabs, selections)
  if (!selectionSnapshot.hasSelection && activeTabId !== clickedTabId) {
    const activeTab = tabs.find((tab) => tab.id === activeTabId)
    if (activeTab) nextSelections[activeTab.id] = createStageManagerFullParentSelection(activeTab)
  }

  const clickedTab = tabs.find((tab) => tab.id === clickedTabId)
  if (!clickedTab) return { selections, anchor }
  const clickedSelection = normalizeStageManagerParentSelection(clickedTab, nextSelections[clickedTabId])
  nextSelections[clickedTabId] =
    clickedSelection.mode === 'full' ? createEmptyStageManagerParentSelection() : createStageManagerFullParentSelection(clickedTab)

  return {
    selections: nextSelections,
    anchor: { kind: 'parent', tabId: clickedTabId },
  }
}

export function applyStageManagerSubTabModifierClick({
  tabs,
  selections,
  parentTabId,
  clickedSubTabId,
  modifiers,
  anchor,
}: ApplyStageManagerSubTabModifierClickOptions): {
  selections: StageManagerSelectionState
  anchor: StageManagerSelectionAnchor | null
} {
  const parentTab = tabs.find((tab) => tab.id === parentTabId)
  if (!parentTab || !isSelectionModifier(modifiers) || !parentTab.subTabs.some((subTab) => subTab.id === clickedSubTabId)) {
    return { selections, anchor }
  }

  const orderedSubTabIds = parentTab.subTabs.map((subTab) => subTab.id)
  const currentSelection = normalizeStageManagerParentSelection(parentTab, selections[parentTabId])

  if (modifiers.shiftKey) {
    const anchorSubTabId =
      anchor?.kind === 'subtab' &&
      anchor.parentTabId === parentTabId &&
      orderedSubTabIds.includes(anchor.subTabId)
        ? anchor.subTabId
        : parentTab.activeSubTabId && orderedSubTabIds.includes(parentTab.activeSubTabId)
          ? parentTab.activeSubTabId
          : clickedSubTabId
    const selectedSubTabIds = getContiguousRangeIds(orderedSubTabIds, anchorSubTabId, clickedSubTabId)
    return {
      selections: {
        ...selections,
        [parentTabId]: createStageManagerSelectionFromSubTabIds(parentTab, selectedSubTabIds, currentSelection),
      },
      anchor: { kind: 'subtab', parentTabId, subTabId: anchorSubTabId },
    }
  }

  const selectedSubTabIds = new Set(
    currentSelection.mode === 'full' ? orderedSubTabIds : currentSelection.selectedSubTabIds,
  )
  const selectionSnapshot = buildStageManagerSelectionSnapshot(tabs, selections)
  if (!selectionSnapshot.hasSelection && parentTab.activeSubTabId && parentTab.activeSubTabId !== clickedSubTabId) {
    selectedSubTabIds.add(parentTab.activeSubTabId)
  }

  if (selectedSubTabIds.has(clickedSubTabId)) {
    selectedSubTabIds.delete(clickedSubTabId)
  } else {
    selectedSubTabIds.add(clickedSubTabId)
  }

  const orderedSelectedSubTabIds = orderIds(orderedSubTabIds, selectedSubTabIds)
  return {
    selections: {
      ...selections,
      [parentTabId]: createStageManagerSelectionFromSubTabIds(parentTab, orderedSelectedSubTabIds, currentSelection),
    },
    anchor: { kind: 'subtab', parentTabId, subTabId: clickedSubTabId },
  }
}

export function cycleStageManagerParentSelection(tab: Tab, selection?: StageManagerParentSelection): StageManagerParentSelection {
  const normalizedSelection = normalizeStageManagerParentSelection(tab, selection)
  const allSubTabIds = tab.subTabs.map((subTab) => subTab.id)
  const cachedPartial =
    normalizedSelection.mode === 'partial'
      ? normalizedSelection.selectedSubTabIds
      : normalizedSelection.cachedPartialSubTabIds

  if (normalizedSelection.mode === 'none') {
    if (cachedPartial && cachedPartial.length > 0) {
      return {
        mode: 'partial',
        selectedSubTabIds: orderStageManagerSubTabIds(tab, cachedPartial),
        cachedPartialSubTabIds: orderStageManagerSubTabIds(tab, cachedPartial),
        partialDirection: 'toward-all',
      }
    }

    return {
      mode: 'full',
      selectedSubTabIds: allSubTabIds,
      cachedPartialSubTabIds: null,
      partialDirection: null,
    }
  }

  if (normalizedSelection.mode === 'full') {
    if (cachedPartial && cachedPartial.length > 0) {
      return {
        mode: 'partial',
        selectedSubTabIds: orderStageManagerSubTabIds(tab, cachedPartial),
        cachedPartialSubTabIds: orderStageManagerSubTabIds(tab, cachedPartial),
        partialDirection: 'toward-none',
      }
    }

    return createEmptyStageManagerParentSelection()
  }

  if (normalizedSelection.partialDirection === 'toward-none') {
    return {
      mode: 'none',
      selectedSubTabIds: [],
      cachedPartialSubTabIds: normalizedSelection.selectedSubTabIds,
      partialDirection: null,
    }
  }

  return {
    mode: 'full',
    selectedSubTabIds: allSubTabIds,
    cachedPartialSubTabIds: normalizedSelection.selectedSubTabIds,
    partialDirection: null,
  }
}

export function toggleStageManagerSubTabSelection(
  tab: Tab,
  selection: StageManagerParentSelection | undefined,
  subTabId: string,
): StageManagerParentSelection {
  const normalizedSelection = normalizeStageManagerParentSelection(tab, selection)
  const allSubTabIds = tab.subTabs.map((subTab) => subTab.id)
  const selectedIds = new Set(
    normalizedSelection.mode === 'full' ? allSubTabIds : normalizedSelection.selectedSubTabIds,
  )
  const wasSelected = selectedIds.has(subTabId)
  const selectionBeforeChange = Array.from(selectedIds)

  if (wasSelected) {
    selectedIds.delete(subTabId)
  } else {
    selectedIds.add(subTabId)
  }

  const orderedSelectedIds = orderStageManagerSubTabIds(tab, Array.from(selectedIds))

  if (orderedSelectedIds.length === 0) {
    return {
      mode: 'none',
      selectedSubTabIds: [],
      cachedPartialSubTabIds:
        selectionBeforeChange.length > 0
          ? orderStageManagerSubTabIds(tab, selectionBeforeChange)
          : normalizedSelection.cachedPartialSubTabIds,
      partialDirection: null,
    }
  }

  if (orderedSelectedIds.length >= allSubTabIds.length) {
    return {
      mode: 'full',
      selectedSubTabIds: allSubTabIds,
      cachedPartialSubTabIds:
        selectionBeforeChange.length > 0 && selectionBeforeChange.length < allSubTabIds.length
          ? orderStageManagerSubTabIds(tab, selectionBeforeChange)
          : normalizedSelection.cachedPartialSubTabIds,
      partialDirection: null,
    }
  }

  return {
    mode: 'partial',
    selectedSubTabIds: orderedSelectedIds,
    cachedPartialSubTabIds: orderedSelectedIds,
    partialDirection: wasSelected ? 'toward-none' : 'toward-all',
  }
}

export function normalizeStageManagerParentSelection(
  tab: Tab,
  selection?: StageManagerParentSelection,
): StageManagerParentSelection {
  const base = selection ?? createEmptyStageManagerParentSelection()
  const orderedSelectedIds = orderStageManagerSubTabIds(tab, base.selectedSubTabIds)
  const orderedCachedIds =
    base.cachedPartialSubTabIds && base.cachedPartialSubTabIds.length > 0
      ? orderStageManagerSubTabIds(tab, base.cachedPartialSubTabIds)
      : null

  if (tab.subTabs.length === 0) {
    return base.mode === 'full'
      ? {
          mode: 'full',
          selectedSubTabIds: [],
          cachedPartialSubTabIds: null,
          partialDirection: null,
        }
      : createEmptyStageManagerParentSelection()
  }

  if (base.mode === 'full' || orderedSelectedIds.length >= tab.subTabs.length) {
    return {
      mode: 'full',
      selectedSubTabIds: tab.subTabs.map((subTab) => subTab.id),
      cachedPartialSubTabIds: orderedCachedIds && orderedCachedIds.length > 0 ? orderedCachedIds : null,
      partialDirection: null,
    }
  }

  if (orderedSelectedIds.length === 0) {
    return {
      mode: 'none',
      selectedSubTabIds: [],
      cachedPartialSubTabIds: orderedCachedIds && orderedCachedIds.length > 0 ? orderedCachedIds : null,
      partialDirection: null,
    }
  }

  return {
    mode: 'partial',
    selectedSubTabIds: orderedSelectedIds,
    cachedPartialSubTabIds: orderedCachedIds && orderedCachedIds.length > 0 ? orderedCachedIds : orderedSelectedIds,
    partialDirection: base.partialDirection === 'toward-none' ? 'toward-none' : 'toward-all',
  }
}

export function buildStageManagerSelectionSnapshot(
  tabs: Tab[],
  selections: StageManagerSelectionState,
): StageManagerSelectionSnapshot {
  const fullParents: Tab[] = []
  const partialParents: Array<{ tab: Tab; selectedSubTabs: SubTab[] }> = []
  const looseSubTabs: Array<{ parentTab: Tab; subTab: SubTab }> = []

  for (const tab of tabs) {
    const selection = normalizeStageManagerParentSelection(tab, selections[tab.id])
    if (selection.mode === 'full') {
      fullParents.push(tab)
      continue
    }

    if (selection.mode !== 'partial') continue

    const selectedIdSet = new Set(selection.selectedSubTabIds)
    const selectedSubTabs = tab.subTabs.filter((subTab) => selectedIdSet.has(subTab.id))
    partialParents.push({ tab, selectedSubTabs })
    for (const subTab of selectedSubTabs) {
      looseSubTabs.push({ parentTab: tab, subTab })
    }
  }

  return {
    fullParents,
    partialParents,
    looseSubTabs,
    fullParentIds: new Set(fullParents.map((tab) => tab.id)),
    hasSelection: fullParents.length > 0 || looseSubTabs.length > 0,
  }
}
