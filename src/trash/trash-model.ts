import type { AppState, DeletedSpaceEntry, Domain, Space, TrashDomainBucket, TrashParentBucket, TrashSpaceBucket, WorkspaceData } from '../types/app'

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

function buildDeletedDomainParentBuckets(
  space: Space,
  deletedDomainEntryId: string,
  deletedSpaceEntryId: string | null,
  domainId: string,
): TrashParentBucket[] {
  return space.data.tabs.map((tab) => ({
    id: `deleted-domain-tab:${deletedDomainEntryId}:${space.id}:${tab.id}`,
    title: tab.title,
    source: 'deleted-domain-tab',
    deletedTabEntryId: null,
    deletedDomainEntryId,
    deletedSpaceEntryId,
    domainId,
    spaceId: space.id,
    parentTabId: tab.id,
    homeContent: tab.homeContent,
    subTabs: tab.subTabs,
  }))
}

function buildLiveSpaceBucket(domain: Domain, space: Space): TrashSpaceBucket {
  return {
    id: `live-space:${domain.id}:${space.id}`,
    title: space.name,
    source: 'live',
    domainId: domain.id,
    spaceId: space.id,
    deletedSpaceEntryId: null,
    deletedDomainEntryId: null,
    space,
    parentTabs: buildTrashParentBuckets(space.data),
  }
}

function buildDeletedSpaceBucket(
  entry: DeletedSpaceEntry,
  source: 'deleted-space' | 'deleted-domain-space',
  deletedDomainEntryId: string | null,
): TrashSpaceBucket {
  return {
    id:
      source === 'deleted-domain-space' && deletedDomainEntryId
        ? `deleted-domain-space:${deletedDomainEntryId}:${entry.id}`
        : `deleted-space:${entry.id}`,
    title: entry.space.name,
    source,
    domainId: entry.domainId,
    spaceId: entry.space.id,
    deletedSpaceEntryId: entry.id,
    deletedDomainEntryId,
    space: entry.space,
    parentTabs:
      source === 'deleted-domain-space' && deletedDomainEntryId
        ? buildDeletedDomainParentBuckets(entry.space, deletedDomainEntryId, entry.id, entry.domainId)
        : [],
  }
}

export function buildTrashDomainBuckets(appState: AppState): TrashDomainBucket[] {
  const liveDomains = appState.domains.map((domain) => ({
    id: `live-domain:${domain.id}`,
    title: domain.name,
    source: 'live' as const,
    domainId: domain.id,
    deletedDomainEntryId: null,
    spaces: [
      ...domain.spaces.map((space) => buildLiveSpaceBucket(domain, space)),
      ...(appState.deletedSpaces ?? [])
        .filter((entry) => entry.domainId === domain.id)
        .map((entry) => buildDeletedSpaceBucket(entry, 'deleted-space', null)),
    ],
  }))

  const deletedDomains = (appState.deletedDomains ?? []).map((entry) => ({
    id: `deleted-domain:${entry.id}`,
    title: entry.domain.name,
    source: 'deleted-domain' as const,
    domainId: entry.domain.id,
    deletedDomainEntryId: entry.id,
    spaces: [
      ...entry.domain.spaces.map((space) => ({
        id: `deleted-domain-live-space:${entry.id}:${space.id}`,
        title: space.name,
        source: 'deleted-domain-space' as const,
        domainId: entry.domain.id,
        spaceId: space.id,
        deletedSpaceEntryId: null,
        deletedDomainEntryId: entry.id,
        space,
        parentTabs: buildDeletedDomainParentBuckets(space, entry.id, null, entry.domain.id),
      })),
      ...entry.deletedSpaces.map((deletedSpace) => buildDeletedSpaceBucket(deletedSpace, 'deleted-domain-space', entry.id)),
    ],
  }))

  return [...liveDomains, ...deletedDomains]
}

export function resolveTrashContentDisplay({
  trashTabId,
  trashHomeContent,
  selectedTrashDomain,
  selectedTrashSpace,
  selectedTrashTab,
  selectedTrashSubTab,
}: {
  trashTabId: string
  trashHomeContent: string
  selectedTrashDomain?: TrashDomainBucket | null
  selectedTrashSpace?: TrashSpaceBucket | null
  selectedTrashTab: TrashParentBucket | null
  selectedTrashSubTab: TrashParentBucket['subTabs'][number] | null
}): TrashContentDisplay {
  if (trashTabId === TRASH_HOME_ID || !selectedTrashTab) {
    if (selectedTrashDomain?.source === 'deleted-domain') {
      return {
        mode: 'home',
        markdown: `# ${selectedTrashDomain.title}\n\nThis deleted domain is in Trash.\n\nRight-click the domain tab to restore it or delete it for real.`,
      }
    }
    if (selectedTrashSpace && selectedTrashSpace.source !== 'live') {
      return {
        mode: 'home',
        markdown: `# ${selectedTrashSpace?.title ?? 'Deleted space'}\n\nThis deleted space is in Trash.\n\nRight-click the space tab to restore it or delete it for real.`,
      }
    }
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
