import type { TrashParentBucket, WorkspaceData } from '../types/app'

export const TRASH_HOME_ID = '__trash_home__'

export type TrashContentDisplay = {
  mode: 'home' | 'deleted-parent' | 'deleted-subtab' | 'subtabs-only-parent'
  markdown: string
}

export function buildTrashParentBuckets(workspace: WorkspaceData): TrashParentBucket[] {
  const buckets: TrashParentBucket[] = workspace.deletedTabs.map((entry) => ({
    id: entry.id,
    title: entry.tab.title,
    source: 'deleted-tab',
    deletedTabEntryId: entry.id,
    parentTabId: entry.tab.id,
    homeContent: entry.tab.homeContent,
    subTabs: entry.tab.subTabs,
  }))

  const deletedParentIds = new Set(workspace.deletedTabs.map((entry) => entry.tab.id))
  const subtabsOnlyMap = new Map<string, { title: string; entries: WorkspaceData['deletedSubTabs'] }>()
  for (const entry of workspace.deletedSubTabs) {
    if (deletedParentIds.has(entry.parentTabId)) continue
    if (!subtabsOnlyMap.has(entry.parentTabId)) {
      subtabsOnlyMap.set(entry.parentTabId, { title: entry.parentTabTitle, entries: [] })
    }
    subtabsOnlyMap.get(entry.parentTabId)?.entries.push(entry)
  }

  for (const [parentTabId, group] of subtabsOnlyMap.entries()) {
    buckets.push({
      id: `subtabs-only-${parentTabId}`,
      title: group.title,
      source: 'subtabs-only',
      deletedTabEntryId: null,
      parentTabId,
      homeContent: `# ${group.title}\n\ndeleted sub-tabs from this tab are shown below.`,
      subTabs: group.entries.map((entry) => ({
        id: entry.id,
        title: entry.subTab.title,
        noteBodyId: entry.subTab.noteBodyId,
        content: entry.subTab.content,
      })),
    })
  }

  return buckets
}

export function resolveTrashContentDisplay({
  trashTabId,
  trashHomeContent,
  selectedTrashTab,
  selectedTrashSubTab,
}: {
  trashTabId: string
  trashHomeContent: string
  selectedTrashTab: TrashParentBucket | null
  selectedTrashSubTab: TrashParentBucket['subTabs'][number] | null
}): TrashContentDisplay {
  if (trashTabId === TRASH_HOME_ID || !selectedTrashTab) {
    return { mode: 'home', markdown: trashHomeContent }
  }

  if (selectedTrashSubTab) {
    return { mode: 'deleted-subtab', markdown: selectedTrashSubTab.content }
  }

  return {
    mode: selectedTrashTab.source === 'subtabs-only' ? 'subtabs-only-parent' : 'deleted-parent',
    markdown: selectedTrashTab.homeContent,
  }
}
