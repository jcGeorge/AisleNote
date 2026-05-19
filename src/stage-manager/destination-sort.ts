import { sortSubTabs, sortTabs } from '../arrange/tab-sort'
import type { NoteBody, StageManagerDestinationSortMode, SubTab, Tab } from '../types/app'

export function applyDestinationTabSort(
  tabs: Tab[],
  noteBodies: NoteBody[],
  sortMode: StageManagerDestinationSortMode,
): Tab[] {
  return sortMode === 'default' ? tabs : sortTabs(tabs, noteBodies, sortMode)
}

export function applyDestinationSubTabSort(
  subTabs: SubTab[],
  noteBodies: NoteBody[],
  sortMode: StageManagerDestinationSortMode,
): SubTab[] {
  return sortMode === 'default' ? subTabs : sortSubTabs(subTabs, noteBodies, sortMode)
}

export function applyDestinationParentSubTabSort(
  tabs: Tab[],
  parentId: string,
  noteBodies: NoteBody[],
  sortMode: StageManagerDestinationSortMode,
): Tab[] {
  if (sortMode === 'default') return tabs
  return tabs.map((tab) =>
    tab.id === parentId
      ? {
          ...tab,
          subTabs: sortSubTabs(tab.subTabs, noteBodies, sortMode),
        }
      : tab,
  )
}
