import { createId, createWorkspaceDataFromTabs } from '../state/workspace'
import type { StageManagerSelectionSnapshot, SubTab, Tab, WorkspaceData } from '../types/app'
import type { IdGenerator } from '../state/navigation-ids'

export function cloneSubTabForTransfer(subTab: SubTab): SubTab {
  return {
    ...subTab,
  }
}

export function cloneTabForTransfer(tab: Tab): Tab {
  return {
    ...tab,
    subTabs: tab.subTabs.map(cloneSubTabForTransfer),
  }
}

export function createPromotedParentTab(subTab: SubTab, generateId: IdGenerator = createId): Tab {
  return {
    id: generateId(),
    title: subTab.title,
    noteBodyId: subTab.noteBodyId,
    activeSubTabId: null,
    subTabs: [],
  }
}

export function createDemotedParentSubTab(tab: Tab, generateId: IdGenerator = createId): SubTab {
  return {
    id: generateId(),
    title: tab.title,
    noteBodyId: tab.noteBodyId,
  }
}

export function buildStageManagerLooseSelectionMap(snapshot: StageManagerSelectionSnapshot): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  for (const { parentTab, subTab } of snapshot.looseSubTabs) {
    const current = map.get(parentTab.id) ?? new Set<string>()
    current.add(subTab.id)
    map.set(parentTab.id, current)
  }
  return map
}

export function stripStageManagerSelectionsFromWorkspace(
  data: WorkspaceData,
  snapshot: StageManagerSelectionSnapshot,
  generateId: IdGenerator = createId,
): WorkspaceData {
  const looseMap = buildStageManagerLooseSelectionMap(snapshot)
  const nextTabs = data.tabs
    .filter((tab) => !snapshot.fullParentIds.has(tab.id))
    .map((tab) => {
      const selectedLooseIds = looseMap.get(tab.id)
      if (!selectedLooseIds || selectedLooseIds.size === 0) {
        return cloneTabForTransfer(tab)
      }

      return {
        ...tab,
        activeSubTabId: tab.activeSubTabId && selectedLooseIds.has(tab.activeSubTabId) ? null : tab.activeSubTabId,
        subTabs: tab.subTabs.filter((subTab) => !selectedLooseIds.has(subTab.id)).map(cloneSubTabForTransfer),
      }
    })

  return createWorkspaceDataFromTabs(nextTabs, {
    activeTabId: data.activeTabId,
    deletedTabs: data.deletedTabs,
    deletedSubTabs: data.deletedSubTabs,
    createId: generateId,
  })
}

export function appendSubTabsToParent(
  tabs: Tab[],
  parentId: string,
  appendedSubTabs: SubTab[],
  forceParentHomeOpen = false,
): Tab[] {
  return tabs.map((tab) =>
    tab.id !== parentId
      ? cloneTabForTransfer(tab)
      : {
          ...tab,
          activeSubTabId: forceParentHomeOpen ? null : tab.activeSubTabId,
          subTabs: [...tab.subTabs.map(cloneSubTabForTransfer), ...appendedSubTabs.map(cloneSubTabForTransfer)],
        },
  )
}

export function buildStageManagerMovedSubTabs(
  snapshot: StageManagerSelectionSnapshot,
  generateId: IdGenerator = createId,
): SubTab[] {
  const moved: SubTab[] = []

  for (const parentTab of snapshot.fullParents) {
    moved.push(createDemotedParentSubTab(parentTab, generateId))
    moved.push(...parentTab.subTabs.map(cloneSubTabForTransfer))
  }

  for (const { subTab } of snapshot.looseSubTabs) {
    moved.push(cloneSubTabForTransfer(subTab))
  }

  return moved
}
