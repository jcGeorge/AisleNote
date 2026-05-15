import { createId, createTab } from '../state/workspace'
import type { Tab, TabArrangeDragItem, WorkspaceData } from '../types/app'

type MoveArrangeItemToTrashOptions = {
  deletedAt?: number
  createDeletedEntryId?: () => string
  createFallbackTab?: () => Tab
}

function getDeletedEntryId(options: MoveArrangeItemToTrashOptions) {
  return options.createDeletedEntryId?.() ?? createId()
}

function getDeletedAt(options: MoveArrangeItemToTrashOptions) {
  return options.deletedAt ?? Date.now()
}

export function moveArrangeItemToTrash(
  data: WorkspaceData,
  item: TabArrangeDragItem,
  options: MoveArrangeItemToTrashOptions = {},
): WorkspaceData {
  if (item.type === 'tab') {
    const tabToDelete = data.tabs.find((tab) => tab.id === item.tabId)
    if (!tabToDelete) return data

    const remaining = data.tabs.filter((tab) => tab.id !== item.tabId)
    const deletedTabs = [
      ...data.deletedTabs,
      {
        id: getDeletedEntryId(options),
        tab: tabToDelete,
        deletedAt: getDeletedAt(options),
      },
    ]

    if (remaining.length === 0) {
      const fallback = options.createFallbackTab?.() ?? createTab('tab')
      return {
        ...data,
        activeTabId: fallback.id,
        tabs: [fallback],
        deletedTabs,
      }
    }

    const nextActiveId = data.activeTabId === item.tabId ? remaining[0].id : data.activeTabId
    return {
      ...data,
      activeTabId: nextActiveId,
      tabs: remaining.map((tab) => (tab.id === nextActiveId ? { ...tab, activeSubTabId: null } : tab)),
      deletedTabs,
    }
  }

  const parent = data.tabs.find((tab) => tab.id === item.parentTabId)
  if (!parent) return data
  const subToDelete = parent.subTabs.find((subTab) => subTab.id === item.subTabId)
  if (!subToDelete) return data

  return {
    ...data,
    tabs: data.tabs.map((tab) =>
      tab.id === item.parentTabId
        ? {
            ...tab,
            activeSubTabId: tab.activeSubTabId === item.subTabId ? null : tab.activeSubTabId,
            subTabs: tab.subTabs.filter((subTab) => subTab.id !== item.subTabId),
          }
        : tab,
    ),
    deletedSubTabs: [
      ...data.deletedSubTabs,
      {
        id: getDeletedEntryId(options),
        parentTabId: parent.id,
        parentTabTitle: parent.title,
        subTab: subToDelete,
        deletedAt: getDeletedAt(options),
      },
    ],
  }
}
