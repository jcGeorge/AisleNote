import { createId } from '../state/workspace'
import type { DeleteTarget, SubTab, Tab, WorkspaceData } from '../types/app'

export type TrashRestoreTarget =
  | Extract<DeleteTarget, { type: 'trash-tab' }>
  | Extract<DeleteTarget, { type: 'trash-subtab' }>

type RestoreTrashTargetOptions = {
  createParentNoteBodyId?: () => string
}

function createParentNoteBodyId(options: RestoreTrashTargetOptions) {
  return options.createParentNoteBodyId?.() ?? createId()
}

function appendMissingSubTabs(existingSubTabs: SubTab[], restoredSubTabs: SubTab[]) {
  const existingIds = new Set(existingSubTabs.map((subTab) => subTab.id))
  return [...existingSubTabs, ...restoredSubTabs.filter((subTab) => !existingIds.has(subTab.id))]
}

function restoreParentTab(tabs: Tab[], restoredTab: Tab): Tab[] {
  const existingIndex = tabs.findIndex((tab) => tab.id === restoredTab.id)
  if (existingIndex < 0) return [...tabs, restoredTab]

  return tabs.map((tab) =>
    tab.id === restoredTab.id
      ? {
          ...restoredTab,
          activeSubTabId: tab.activeSubTabId ?? restoredTab.activeSubTabId,
          subTabs: appendMissingSubTabs(tab.subTabs, restoredTab.subTabs),
        }
      : tab,
  )
}

function restoreSubTabToParent(
  tabs: Tab[],
  parentTabId: string,
  parentTabTitle: string,
  subTab: SubTab,
  options: RestoreTrashTargetOptions,
): Tab[] {
  const existingIndex = tabs.findIndex((tab) => tab.id === parentTabId)
  if (existingIndex < 0) {
    return [
      ...tabs,
      {
        id: parentTabId,
        title: parentTabTitle,
        noteBodyId: createParentNoteBodyId(options),
        activeSubTabId: subTab.id,
        subTabs: [subTab],
      },
    ]
  }

  return tabs.map((tab) => {
    if (tab.id !== parentTabId || tab.subTabs.some((candidate) => candidate.id === subTab.id)) return tab
    return {
      ...tab,
      activeSubTabId: tab.activeSubTabId ?? subTab.id,
      subTabs: [...tab.subTabs, subTab],
    }
  })
}

export function restoreTrashTarget(
  data: WorkspaceData,
  target: TrashRestoreTarget,
  options: RestoreTrashTargetOptions = {},
): WorkspaceData {
  if (target.type === 'trash-tab') {
    if (target.source === 'deleted-tab') {
      const deletedTab = data.deletedTabs.find((entry) => entry.id === target.deletedTabEntryId)
      if (!deletedTab) return data

      const tabs = restoreParentTab(data.tabs, deletedTab.tab)
      return {
        ...data,
        activeTabId: tabs.some((tab) => tab.id === data.activeTabId) ? data.activeTabId : deletedTab.tab.id,
        tabs,
        deletedTabs: data.deletedTabs.filter((entry) => entry.id !== target.deletedTabEntryId),
      }
    }

    const restoredSubTabs = data.deletedSubTabs.filter((entry) => entry.parentTabId === target.parentTabId)
    if (restoredSubTabs.length === 0) return data

    const tabs = restoredSubTabs.reduce(
      (nextTabs, entry) =>
        restoreSubTabToParent(nextTabs, entry.parentTabId, entry.parentTabTitle, entry.subTab, options),
      data.tabs,
    )

    return {
      ...data,
      tabs,
      deletedSubTabs: data.deletedSubTabs.filter((entry) => entry.parentTabId !== target.parentTabId),
    }
  }

  if (target.source === 'deleted-tab' && target.deletedTabEntryId) {
    const deletedTab = data.deletedTabs.find((entry) => entry.id === target.deletedTabEntryId)
    const subTab = deletedTab?.tab.subTabs.find((candidate) => candidate.id === target.subTabId)
    if (!deletedTab || !subTab) return data

    return {
      ...data,
      tabs: restoreSubTabToParent(data.tabs, deletedTab.tab.id, deletedTab.tab.title, subTab, options),
      deletedTabs: data.deletedTabs.map((entry) =>
        entry.id === target.deletedTabEntryId
          ? {
              ...entry,
              tab: {
                ...entry.tab,
                activeSubTabId: entry.tab.activeSubTabId === target.subTabId ? null : entry.tab.activeSubTabId,
                subTabs: entry.tab.subTabs.filter((candidate) => candidate.id !== target.subTabId),
              },
            }
          : entry,
      ),
    }
  }

  const deletedSubTab = data.deletedSubTabs.find((entry) => entry.id === target.subTabId)
  if (!deletedSubTab) return data

  return {
    ...data,
    tabs: restoreSubTabToParent(
      data.tabs,
      deletedSubTab.parentTabId,
      deletedSubTab.parentTabTitle,
      deletedSubTab.subTab,
      options,
    ),
    deletedSubTabs: data.deletedSubTabs.filter((entry) => entry.id !== target.subTabId),
  }
}
