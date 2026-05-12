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
    promoteSpaceMode: 'existing',
    promoteSpaceId: '',
    newSpaceName: '',
    demoteParentMode: 'existing',
    demoteParentId: '',
    demoteNewParentName: '',
    migrateTarget: 'space',
    migrateSpaceMode: 'existing',
    migrateSpaceId: '',
    migrateParentSpaceMode: 'current',
    migrateParentSpaceId: '',
    migrateParentMode: 'existing',
    migrateParentId: '',
    migrateNewParentName: '',
    strayHandlingMode: 'promote',
    straySelectedParentId: '',
    strayExistingParentId: '',
    strayNewParentName: '',
    massDeleteMode: 'trash',
  }
}

export function orderStageManagerSubTabIds(tab: Tab, subTabIds: string[]): string[] {
  const idSet = new Set(subTabIds)
  return tab.subTabs.filter((subTab) => idSet.has(subTab.id)).map((subTab) => subTab.id)
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
