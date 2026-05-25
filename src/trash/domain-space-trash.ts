import {
  createDomainFromSpaces,
  projectActiveDomainState,
  setActiveDomain,
  updateActiveDomain,
} from '../state/domains'
import { createId } from '../state/workspace'
import type { AppState, DeleteTarget, DeletedDomainEntry, DeletedSpaceEntry, Domain, Space, SubTab, Tab } from '../types/app'

type TrashMutationResult = {
  state: AppState
  changed: boolean
  reason?: 'missing-domain' | 'missing-space' | 'last-domain' | 'last-space'
}

type IdFactory = () => string

function makeDeletedEntryId(createDeletedEntryId?: IdFactory) {
  return createDeletedEntryId?.() ?? createId()
}

function appendUniqueSpace(spaces: Space[], restoredSpace: Space): Space[] {
  if (spaces.some((space) => space.id === restoredSpace.id)) return spaces
  return [...spaces, restoredSpace]
}

function appendUniqueDomain(domains: Domain[], restoredDomain: Domain): Domain[] {
  if (domains.some((domain) => domain.id === restoredDomain.id)) return domains
  return [...domains, restoredDomain]
}

function domainWithSpaces(domain: Domain, spaces: Space[], activeSpaceId = domain.activeSpaceId): Domain {
  return createDomainFromSpaces(domain.name, spaces, {
    id: domain.id,
    activeSpaceId,
  })
}

function appendUniqueById<T extends { id: string }>(items: T[], addedItems: T[]): T[] {
  const existingIds = new Set(items.map((item) => item.id))
  return [...items, ...addedItems.filter((item) => !existingIds.has(item.id))]
}

function appendMissingSubTabs(existingSubTabs: SubTab[], restoredSubTabs: SubTab[]) {
  return appendUniqueById(existingSubTabs, restoredSubTabs)
}

function restoreParentTab(tabs: Tab[], restoredTab: Tab): Tab[] {
  const existingIndex = tabs.findIndex((tab) => tab.id === restoredTab.id)
  if (existingIndex < 0) return [...tabs, restoredTab]

  return tabs.map((tab) =>
    tab.id === restoredTab.id
      ? {
          ...tab,
          noteBodyId: tab.noteBodyId || restoredTab.noteBodyId,
          activeSubTabId: tab.activeSubTabId ?? restoredTab.activeSubTabId,
          subTabs: appendMissingSubTabs(tab.subTabs, restoredTab.subTabs),
        }
      : tab,
  )
}

function mergeSpace(existingSpace: Space, restoredSpace: Space): Space {
  const tabs = restoredSpace.data.tabs.reduce((nextTabs, tab) => restoreParentTab(nextTabs, tab), existingSpace.data.tabs)
  const activeTabId = tabs.some((tab) => tab.id === restoredSpace.data.activeTabId)
    ? restoredSpace.data.activeTabId
    : existingSpace.data.activeTabId

  return {
    ...restoredSpace,
    data: {
      ...restoredSpace.data,
      activeTabId,
      tabs,
      deletedTabs: appendUniqueById(existingSpace.data.deletedTabs, restoredSpace.data.deletedTabs),
      deletedSubTabs: appendUniqueById(existingSpace.data.deletedSubTabs, restoredSpace.data.deletedSubTabs),
    },
  }
}

function mergeSpaceIntoDomain(domain: Domain, restoredSpace: Space): Domain {
  const existingSpace = domain.spaces.find((space) => space.id === restoredSpace.id)
  const spaces = existingSpace
    ? domain.spaces.map((space) => (space.id === restoredSpace.id ? mergeSpace(space, restoredSpace) : space))
    : [...domain.spaces, restoredSpace]

  return domainWithSpaces(domain, spaces, restoredSpace.id)
}

function restoreSpaceIntoDomain(appState: AppState, deletedDomain: Domain, restoredSpace: Space): AppState {
  const projected = projectActiveDomainState(appState)
  const liveDomain = projected.domains.find((domain) => domain.id === deletedDomain.id)
  const restoredDomain = liveDomain
    ? mergeSpaceIntoDomain(liveDomain, restoredSpace)
    : domainWithSpaces(deletedDomain, [restoredSpace], restoredSpace.id)
  const domains = liveDomain
    ? projected.domains.map((domain) => (domain.id === restoredDomain.id ? restoredDomain : domain))
    : [...projected.domains, restoredDomain]

  return projectActiveDomainState({
    ...projected,
    activeDomainId: restoredDomain.id,
    activeSpaceId: restoredSpace.id,
    spaces: restoredDomain.spaces,
    domains,
  })
}

function spaceHasTrashContent(space: Space) {
  return (
    space.data.tabs.length > 0 ||
    space.data.deletedTabs.length > 0 ||
    space.data.deletedSubTabs.length > 0
  )
}

function removeSpaceFromDeletedDomainEntry(
  entry: DeletedDomainEntry,
  target: { spaceId: string; deletedSpaceEntryId?: string | null },
): DeletedDomainEntry | null {
  const deletedSpaceEntry = target.deletedSpaceEntryId
    ? entry.deletedSpaces.find((spaceEntry) => spaceEntry.id === target.deletedSpaceEntryId)
    : null

  const domainSpaces = deletedSpaceEntry
    ? entry.domain.spaces
    : entry.domain.spaces.filter((space) => space.id !== target.spaceId)
  const deletedSpaces = deletedSpaceEntry
    ? entry.deletedSpaces.filter((spaceEntry) => spaceEntry.id !== target.deletedSpaceEntryId)
    : entry.deletedSpaces

  if (domainSpaces.length === 0 && deletedSpaces.length === 0) return null

  return {
    ...entry,
    domain: {
      ...entry.domain,
      activeSpaceId: domainSpaces.some((space) => space.id === entry.domain.activeSpaceId)
        ? entry.domain.activeSpaceId
        : domainSpaces[0]?.id ?? '',
      spaces: domainSpaces,
    },
    deletedSpaces,
  }
}

function updateSpaceInDeletedDomainEntry(
  entry: DeletedDomainEntry,
  target: { spaceId: string; deletedSpaceEntryId?: string | null },
  updater: (space: Space) => Space | null,
): DeletedDomainEntry | null {
  const updatesDeletedSpace = Boolean(
    target.deletedSpaceEntryId && entry.deletedSpaces.some((spaceEntry) => spaceEntry.id === target.deletedSpaceEntryId),
  )
  let removedSpace = false

  const domainSpaces = updatesDeletedSpace
    ? entry.domain.spaces
    : entry.domain.spaces.flatMap((space) => {
        if (space.id !== target.spaceId) return [space]
        const nextSpace = updater(space)
        if (!nextSpace || !spaceHasTrashContent(nextSpace)) {
          removedSpace = true
          return []
        }
        return [nextSpace]
      })

  const deletedSpaces = updatesDeletedSpace
    ? entry.deletedSpaces.flatMap((spaceEntry) => {
        if (spaceEntry.id !== target.deletedSpaceEntryId) return [spaceEntry]
        const nextSpace = updater(spaceEntry.space)
        if (!nextSpace || !spaceHasTrashContent(nextSpace)) {
          removedSpace = true
          return []
        }
        return [{ ...spaceEntry, space: nextSpace }]
      })
    : entry.deletedSpaces

  if (!removedSpace && domainSpaces === entry.domain.spaces && deletedSpaces === entry.deletedSpaces) return entry
  if (domainSpaces.length === 0 && deletedSpaces.length === 0) return null

  return {
    ...entry,
    domain: {
      ...entry.domain,
      activeSpaceId: domainSpaces.some((space) => space.id === entry.domain.activeSpaceId)
        ? entry.domain.activeSpaceId
        : domainSpaces[0]?.id ?? '',
      spaces: domainSpaces,
    },
    deletedSpaces,
  }
}

function updateDeletedDomainEntry(
  deletedDomains: DeletedDomainEntry[],
  deletedDomainEntryId: string,
  updater: (entry: DeletedDomainEntry) => DeletedDomainEntry | null,
): DeletedDomainEntry[] {
  return deletedDomains.flatMap((entry) => {
    if (entry.id !== deletedDomainEntryId) return [entry]
    const nextEntry = updater(entry)
    return nextEntry ? [nextEntry] : []
  })
}

function findDeletedDomainSpace(
  entry: DeletedDomainEntry,
  target: { spaceId: string; deletedSpaceEntryId?: string | null },
) {
  const deletedSpaceEntry = target.deletedSpaceEntryId
    ? entry.deletedSpaces.find((spaceEntry) => spaceEntry.id === target.deletedSpaceEntryId)
    : null
  if (deletedSpaceEntry) return deletedSpaceEntry.space
  return entry.domain.spaces.find((space) => space.id === target.spaceId) ?? null
}

function makeSpaceWithParent(space: Space, parentTab: Tab): Space {
  return {
    ...space,
    data: {
      ...space.data,
      activeTabId: parentTab.id,
      tabs: [parentTab],
      deletedTabs: [],
      deletedSubTabs: [],
    },
  }
}

function makeSpaceWithSubTab(space: Space, parentTab: Tab, subTab: SubTab): Space {
  return makeSpaceWithParent(space, {
    ...parentTab,
    activeSubTabId: subTab.id,
    subTabs: [subTab],
  })
}

type DeletedDomainTrashItemTarget =
  | Extract<DeleteTarget, { type: 'trash-space' }>
  | Extract<DeleteTarget, { type: 'trash-tab' }>
  | Extract<DeleteTarget, { type: 'trash-subtab' }>

export function moveDomainToTrash(
  appState: AppState,
  domainId: string,
  createDeletedEntryId?: IdFactory,
): TrashMutationResult {
  const projected = projectActiveDomainState(appState)
  if (projected.domains.length <= 1) return { state: projected, changed: false, reason: 'last-domain' }

  const domain = projected.domains.find((candidate) => candidate.id === domainId)
  if (!domain) return { state: projected, changed: false, reason: 'missing-domain' }

  const currentDeletedSpaces = projected.deletedSpaces ?? []
  const currentDeletedDomains = projected.deletedDomains ?? []
  const nestedDeletedSpaces = currentDeletedSpaces.filter((entry) => entry.domainId === domainId)
  const deletedSpaces = currentDeletedSpaces.filter((entry) => entry.domainId !== domainId)
  const deletedDomain: DeletedDomainEntry = {
    id: makeDeletedEntryId(createDeletedEntryId),
    domain,
    deletedSpaces: nestedDeletedSpaces,
    deletedAt: Date.now(),
  }
  const domains = projected.domains.filter((candidate) => candidate.id !== domainId)
  const activeDomain =
    projected.activeDomainId === domainId
      ? domains[0]
      : domains.find((candidate) => candidate.id === projected.activeDomainId) ?? domains[0]

  return {
    changed: true,
    state: projectActiveDomainState({
      ...projected,
      activeDomainId: activeDomain.id,
      activeSpaceId: activeDomain.activeSpaceId,
      spaces: activeDomain.spaces,
      domains,
      deletedDomains: [...currentDeletedDomains, deletedDomain],
      deletedSpaces,
    }),
  }
}

export function moveSpaceToTrash(
  appState: AppState,
  domainId: string,
  spaceId: string,
  createDeletedEntryId?: IdFactory,
): TrashMutationResult {
  const projected = projectActiveDomainState(appState)
  const domain = projected.domains.find((candidate) => candidate.id === domainId)
  if (!domain) return { state: projected, changed: false, reason: 'missing-domain' }
  if (domain.spaces.length <= 1) return { state: projected, changed: false, reason: 'last-space' }

  const space = domain.spaces.find((candidate) => candidate.id === spaceId)
  if (!space) return { state: projected, changed: false, reason: 'missing-space' }

  const nextSpaces = domain.spaces.filter((candidate) => candidate.id !== spaceId)
  const activeSpaceId = domain.activeSpaceId === spaceId ? nextSpaces[0].id : domain.activeSpaceId
  const nextDomain = domainWithSpaces(domain, nextSpaces, activeSpaceId)
  const domains = projected.domains.map((candidate) => (candidate.id === domainId ? nextDomain : candidate))
  const currentDeletedSpaces = projected.deletedSpaces ?? []
  const deletedSpace: DeletedSpaceEntry = {
    id: makeDeletedEntryId(createDeletedEntryId),
    domainId,
    domainName: domain.name,
    space,
    deletedAt: Date.now(),
  }

  return {
    changed: true,
    state: projectActiveDomainState({
      ...projected,
      activeDomainId: projected.activeDomainId,
      activeSpaceId: projected.activeDomainId === domainId ? activeSpaceId : projected.activeSpaceId,
      spaces: projected.activeDomainId === domainId ? nextSpaces : projected.spaces,
      domains,
      deletedSpaces: [...currentDeletedSpaces, deletedSpace],
    }),
  }
}

export function permanentlyDeleteTrashDomain(appState: AppState, deletedDomainEntryId: string): AppState {
  const projected = projectActiveDomainState(appState)
  return {
    ...projected,
    deletedDomains: (projected.deletedDomains ?? []).filter((entry) => entry.id !== deletedDomainEntryId),
  }
}

export function permanentlyDeleteTrashSpace(
  appState: AppState,
  target: {
    source: 'deleted-space' | 'deleted-domain-space'
    deletedSpaceEntryId?: string | null
    deletedDomainEntryId?: string
    spaceId?: string
  },
): AppState {
  const projected = projectActiveDomainState(appState)
  if (target.source === 'deleted-domain-space' && target.deletedDomainEntryId) {
    return {
      ...projected,
      deletedDomains: updateDeletedDomainEntry(projected.deletedDomains ?? [], target.deletedDomainEntryId, (entry) =>
        removeSpaceFromDeletedDomainEntry(entry, {
          spaceId: target.spaceId ?? target.deletedSpaceEntryId ?? '',
          deletedSpaceEntryId: target.deletedSpaceEntryId,
        }),
      ),
    }
  }

  if (!target.deletedSpaceEntryId) return projected

  return {
    ...projected,
    deletedSpaces: (projected.deletedSpaces ?? []).filter((entry) => entry.id !== target.deletedSpaceEntryId),
  }
}

export function restoreTrashDomain(appState: AppState, deletedDomainEntryId: string): TrashMutationResult {
  const projected = projectActiveDomainState(appState)
  const currentDeletedDomains = projected.deletedDomains ?? []
  const currentDeletedSpaces = projected.deletedSpaces ?? []
  const entry = currentDeletedDomains.find((candidate) => candidate.id === deletedDomainEntryId)
  if (!entry) return { state: projected, changed: false, reason: 'missing-domain' }

  const liveDomain = projected.domains.find((domain) => domain.id === entry.domain.id)
  const restoredDomain = liveDomain
    ? entry.domain.spaces.reduce((domain, space) => mergeSpaceIntoDomain(domain, space), liveDomain)
    : entry.domain
  const domains = liveDomain
    ? projected.domains.map((domain) => (domain.id === restoredDomain.id ? restoredDomain : domain))
    : appendUniqueDomain(projected.domains, restoredDomain)
  return {
    changed: true,
    state: projectActiveDomainState({
      ...projected,
      activeDomainId: restoredDomain.id,
      activeSpaceId: restoredDomain.activeSpaceId,
      spaces: restoredDomain.spaces,
      domains,
      deletedDomains: currentDeletedDomains.filter((candidate) => candidate.id !== deletedDomainEntryId),
      deletedSpaces: [...currentDeletedSpaces, ...entry.deletedSpaces],
    }),
  }
}

export function restoreDeletedDomainTrashItem(
  appState: AppState,
  target: DeletedDomainTrashItemTarget,
): TrashMutationResult {
  const projected = projectActiveDomainState(appState)
  const deletedDomainEntryId = target.deletedDomainEntryId ?? null
  if (!deletedDomainEntryId || !target.spaceId) return { state: projected, changed: false, reason: 'missing-domain' }

  const entry = (projected.deletedDomains ?? []).find((candidate) => candidate.id === deletedDomainEntryId)
  if (!entry) return { state: projected, changed: false, reason: 'missing-domain' }

  const sourceSpace = findDeletedDomainSpace(entry, {
    spaceId: target.spaceId,
    deletedSpaceEntryId: target.deletedSpaceEntryId,
  })
  if (!sourceSpace) return { state: projected, changed: false, reason: 'missing-space' }

  let restoredSpace: Space
  let nextDeletedDomains: DeletedDomainEntry[] = projected.deletedDomains ?? []

  if (target.type === 'trash-space') {
    restoredSpace = sourceSpace
    nextDeletedDomains = updateDeletedDomainEntry(nextDeletedDomains, deletedDomainEntryId, (domainEntry) =>
      removeSpaceFromDeletedDomainEntry(domainEntry, {
        spaceId: target.spaceId,
        deletedSpaceEntryId: target.deletedSpaceEntryId,
      }),
    )
  } else if (target.type === 'trash-tab') {
    const parentTab = sourceSpace.data.tabs.find((tab) => tab.id === target.parentTabId)
    if (!parentTab) return { state: projected, changed: false, reason: 'missing-space' }
    restoredSpace = makeSpaceWithParent(sourceSpace, parentTab)
    nextDeletedDomains = updateDeletedDomainEntry(nextDeletedDomains, deletedDomainEntryId, (domainEntry) =>
      updateSpaceInDeletedDomainEntry(
        domainEntry,
        {
          spaceId: target.spaceId ?? sourceSpace.id,
          deletedSpaceEntryId: target.deletedSpaceEntryId,
        },
        (space) => ({
          ...space,
          data: {
            ...space.data,
            activeTabId:
              space.data.activeTabId === parentTab.id
                ? space.data.tabs.find((tab) => tab.id !== parentTab.id)?.id ?? space.data.activeTabId
                : space.data.activeTabId,
            tabs: space.data.tabs.filter((tab) => tab.id !== parentTab.id),
          },
        }),
      ),
    )
  } else {
    const parentTab = sourceSpace.data.tabs.find((tab) => tab.id === target.parentTabId)
    const subTab = parentTab?.subTabs.find((candidate) => candidate.id === target.subTabId)
    if (!parentTab || !subTab) return { state: projected, changed: false, reason: 'missing-space' }
    restoredSpace = makeSpaceWithSubTab(sourceSpace, parentTab, subTab)
    nextDeletedDomains = updateDeletedDomainEntry(nextDeletedDomains, deletedDomainEntryId, (domainEntry) =>
      updateSpaceInDeletedDomainEntry(
        domainEntry,
        {
          spaceId: target.spaceId ?? sourceSpace.id,
          deletedSpaceEntryId: target.deletedSpaceEntryId,
        },
        (space) => ({
          ...space,
          data: {
            ...space.data,
            tabs: space.data.tabs.flatMap((tab) => {
              if (tab.id !== parentTab.id) return [tab]
              const subTabs = tab.subTabs.filter((candidate) => candidate.id !== subTab.id)
              if (subTabs.length === 0) return []
              return [
                {
                  ...tab,
                  activeSubTabId: tab.activeSubTabId === subTab.id ? subTabs[0]?.id ?? null : tab.activeSubTabId,
                  subTabs,
                },
              ]
            }),
          },
        }),
      ),
    )
  }

  const restoredState = restoreSpaceIntoDomain(projected, entry.domain, restoredSpace)
  return {
    changed: true,
    state: projectActiveDomainState({
      ...restoredState,
      deletedDomains: nextDeletedDomains,
    }),
  }
}

export function permanentlyDeleteDeletedDomainTrashItem(
  appState: AppState,
  target: Extract<DeleteTarget, { type: 'trash-tab' }> | Extract<DeleteTarget, { type: 'trash-subtab' }>,
): AppState {
  const projected = projectActiveDomainState(appState)
  const deletedDomainEntryId = target.deletedDomainEntryId ?? null
  if (!deletedDomainEntryId || !target.spaceId) return projected

  return {
    ...projected,
    deletedDomains: updateDeletedDomainEntry(projected.deletedDomains ?? [], deletedDomainEntryId, (domainEntry) =>
      updateSpaceInDeletedDomainEntry(
        domainEntry,
        {
          spaceId: target.spaceId ?? '',
          deletedSpaceEntryId: target.deletedSpaceEntryId,
        },
        (space) => {
          if (target.type === 'trash-tab') {
            return {
              ...space,
              data: {
                ...space.data,
                tabs: space.data.tabs.filter((tab) => tab.id !== target.parentTabId),
              },
            }
          }

          return {
            ...space,
            data: {
              ...space.data,
              tabs: space.data.tabs.map((tab) =>
                tab.id === target.parentTabId
                  ? {
                      ...tab,
                      subTabs: tab.subTabs.filter((subTab) => subTab.id !== target.subTabId),
                    }
                  : tab,
              ),
            },
          }
        },
      ),
    ),
  }
}

export function restoreTrashSpace(
  appState: AppState,
  target: {
    source: 'deleted-space' | 'deleted-domain-space'
    deletedSpaceEntryId?: string | null
    deletedDomainEntryId?: string
    domainId: string
    spaceId?: string
  },
): TrashMutationResult {
  const projected = projectActiveDomainState(appState)
  if (target.source === 'deleted-domain-space') {
    return restoreDeletedDomainTrashItem(projected, {
      type: 'trash-space',
      source: target.source,
      deletedSpaceEntryId: target.deletedSpaceEntryId,
      deletedDomainEntryId: target.deletedDomainEntryId,
      domainId: target.domainId,
      spaceId: target.spaceId ?? target.deletedSpaceEntryId ?? '',
    })
  }

  const liveDomain = projected.domains.find((domain) => domain.id === target.domainId)
  if (!liveDomain) return { state: projected, changed: false, reason: 'missing-domain' }
  if (!target.deletedSpaceEntryId) return { state: projected, changed: false, reason: 'missing-space' }

  const entry = (projected.deletedSpaces ?? []).find((spaceEntry) => spaceEntry.id === target.deletedSpaceEntryId)
  if (!entry) return { state: projected, changed: false, reason: 'missing-space' }

  const restoredDomain = domainWithSpaces(
    liveDomain,
    appendUniqueSpace(liveDomain.spaces, entry.space),
    entry.space.id,
  )
  let nextState = updateActiveDomain(setActiveDomain(projected, liveDomain.id), () => restoredDomain)

  nextState = {
    ...nextState,
    deletedSpaces: (nextState.deletedSpaces ?? []).filter((spaceEntry) => spaceEntry.id !== target.deletedSpaceEntryId),
  }

  return { state: projectActiveDomainState(nextState), changed: true }
}

export function restoreAllTrashInAppState(appState: AppState): AppState {
  let next = projectActiveDomainState(appState)
  for (const entry of [...(next.deletedDomains ?? [])]) {
    next = restoreTrashDomain(next, entry.id).state
  }
  for (const entry of [...(next.deletedSpaces ?? [])]) {
    const restored = restoreTrashSpace(next, {
      source: 'deleted-space',
      deletedSpaceEntryId: entry.id,
      domainId: entry.domainId,
    })
    next = restored.state
  }
  return next
}

export function deleteAllDomainAndSpaceTrash(appState: AppState): AppState {
  const projected = projectActiveDomainState(appState)
  return {
    ...projected,
    deletedDomains: [],
    deletedSpaces: [],
  }
}
