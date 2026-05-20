import type { WorkspaceData } from '../types/app'

export function moveSubTabToParentTab(
  data: WorkspaceData,
  sourceParentTabId: string,
  subTabId: string,
  targetParentTabId: string,
): WorkspaceData {
  if (sourceParentTabId === targetParentTabId) return data

  const sourceParent = data.tabs.find((tab) => tab.id === sourceParentTabId)
  const targetParent = data.tabs.find((tab) => tab.id === targetParentTabId)
  if (!sourceParent || !targetParent) return data

  const movedSubTab = sourceParent.subTabs.find((subTab) => subTab.id === subTabId)
  if (!movedSubTab || targetParent.subTabs.some((subTab) => subTab.id === subTabId)) return data

  return {
    ...data,
    activeTabId: targetParentTabId,
    tabs: data.tabs.map((tab) => {
      if (tab.id === sourceParentTabId) {
        return {
          ...tab,
          activeSubTabId: tab.activeSubTabId === subTabId ? null : tab.activeSubTabId,
          subTabs: tab.subTabs.filter((subTab) => subTab.id !== subTabId),
        }
      }
      if (tab.id === targetParentTabId) {
        return {
          ...tab,
          activeSubTabId: subTabId,
          subTabs: [...tab.subTabs, movedSubTab],
        }
      }
      return tab
    }),
  }
}
