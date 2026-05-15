import type { WorkspaceData } from '../types/app'

function resolveRememberedSubTabId(tab: WorkspaceData['tabs'][number], subTabId: string | null | undefined): string | null {
  return subTabId && tab.subTabs.some((subTab) => subTab.id === subTabId) ? subTabId : null
}

export function normalizeWorkspaceNavigationMemory(data: WorkspaceData): WorkspaceData {
  if (data.tabs.length === 0) return data
  const activeTabId = data.tabs.some((tab) => tab.id === data.activeTabId) ? data.activeTabId : data.tabs[0].id
  let changed = activeTabId !== data.activeTabId
  const tabs = data.tabs.map((tab) => {
    const activeSubTabId = resolveRememberedSubTabId(tab, tab.activeSubTabId)
    if (activeSubTabId === tab.activeSubTabId) return tab
    changed = true
    return { ...tab, activeSubTabId }
  })

  return changed ? { ...data, activeTabId, tabs } : data
}

export function selectPrimeTabWithMemory(data: WorkspaceData, tabId: string): WorkspaceData {
  const normalized = normalizeWorkspaceNavigationMemory(data)
  if (!normalized.tabs.some((tab) => tab.id === tabId)) return normalized

  if (normalized.activeTabId === tabId) {
    const activeTab = normalized.tabs.find((tab) => tab.id === tabId)
    if (!activeTab?.activeSubTabId) return normalized
    return {
      ...normalized,
      tabs: normalized.tabs.map((tab) => (tab.id === tabId ? { ...tab, activeSubTabId: null } : tab)),
    }
  }

  return normalized.activeTabId === tabId ? normalized : { ...normalized, activeTabId: tabId }
}

export function selectSubTabWithMemory(data: WorkspaceData, subTabId: string): WorkspaceData {
  const normalized = normalizeWorkspaceNavigationMemory(data)
  const activeTab = normalized.tabs.find((tab) => tab.id === normalized.activeTabId)
  if (!activeTab || !activeTab.subTabs.some((subTab) => subTab.id === subTabId)) return normalized
  if (activeTab.activeSubTabId === subTabId) return normalized
  return {
    ...normalized,
    tabs: normalized.tabs.map((tab) =>
      tab.id === activeTab.id ? { ...tab, activeSubTabId: subTabId } : tab,
    ),
  }
}

export function selectActivePrimeTabHome(data: WorkspaceData): WorkspaceData {
  const normalized = normalizeWorkspaceNavigationMemory(data)
  const activeTab = normalized.tabs.find((tab) => tab.id === normalized.activeTabId)
  if (!activeTab?.activeSubTabId) return normalized
  return {
    ...normalized,
    tabs: normalized.tabs.map((tab) =>
      tab.id === activeTab.id ? { ...tab, activeSubTabId: null } : tab,
    ),
  }
}

export function applyWorkspaceNavigationLocation(
  data: WorkspaceData,
  tabId: string,
  subTabId: string | null,
): WorkspaceData {
  const normalized = normalizeWorkspaceNavigationMemory(data)
  if (normalized.tabs.length === 0) return normalized
  const activeTabId = normalized.tabs.some((tab) => tab.id === tabId) ? tabId : normalized.tabs[0].id
  return {
    ...normalized,
    activeTabId,
    tabs: normalized.tabs.map((tab) =>
      tab.id === activeTabId
        ? { ...tab, activeSubTabId: resolveRememberedSubTabId(tab, subTabId) }
        : tab,
    ),
  }
}
