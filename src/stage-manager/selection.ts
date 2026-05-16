import type {
  StageManagerDraft,
  StageManagerParentSelection,
  StageManagerSelectionSnapshot,
  StageManagerSelectionState,
  SubTab,
  Tab,
} from '../types/app'

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
    migrateTarget: 'space',
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
    frontmatterTemplateId: '',
    massDeleteMode: 'trash',
  }
}

export function orderStageManagerSubTabIds(tab: Tab, subTabIds: string[]): string[] {
  const idSet = new Set(subTabIds)
  return tab.subTabs.filter((subTab) => idSet.has(subTab.id)).map((subTab) => subTab.id)
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
