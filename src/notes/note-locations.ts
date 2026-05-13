import type { AppState, Domain, NoteLocation, Space, SubTab, Tab } from '../types/app'

export type NoteLocationInfo = {
  domain: Domain | null
  space: Space | null
  tab: Tab | null
  subTab: SubTab | null
  noteBodyId: string
  title: string
}

export type NoteLocationListEntry = NoteLocation & {
  title: string
  label: string
}

export function buildNoteLocationKey(location: NoteLocation): string {
  return [location.domainId, location.spaceId, location.tabId, location.subTabId ?? '__home__'].join('::')
}

function getDomainsWithActiveProjection(sourceState: AppState): Domain[] {
  return sourceState.domains.map((domain) =>
    domain.id === sourceState.activeDomainId
      ? { ...domain, activeSpaceId: sourceState.activeSpaceId, spaces: sourceState.spaces }
      : domain,
  )
}

export function getLocationInfo(sourceState: AppState, location: NoteLocation): NoteLocationInfo {
  const activeDomain = sourceState.domains.find((candidate) => candidate.id === sourceState.activeDomainId) ?? null
  const domain =
    location.domainId === sourceState.activeDomainId && activeDomain
      ? { ...activeDomain, activeSpaceId: sourceState.activeSpaceId, spaces: sourceState.spaces }
      : sourceState.domains.find((candidate) => candidate.id === location.domainId) ?? null
  const space = domain?.spaces.find((candidate) => candidate.id === location.spaceId) ?? null
  const tab = space?.data.tabs.find((candidate) => candidate.id === location.tabId) ?? null
  const subTab = location.subTabId && tab ? tab.subTabs.find((candidate) => candidate.id === location.subTabId) ?? null : null
  const noteBodyId = subTab?.noteBodyId ?? tab?.noteBodyId ?? ''
  const title = subTab?.title ?? tab?.title ?? 'note'
  return { domain, space, tab, subTab, noteBodyId, title }
}

export function getFirstNoteLocation(
  sourceState: AppState,
  excludedLocation?: NoteLocation,
  fallbackLocation?: NoteLocation,
): NoteLocation {
  const excludedKey = excludedLocation ? buildNoteLocationKey(excludedLocation) : ''
  let fallback: NoteLocation | null = null
  for (const domain of getDomainsWithActiveProjection(sourceState)) {
    for (const space of domain.spaces) {
      for (const tab of space.data.tabs) {
        const homeLocation = { domainId: domain.id, spaceId: space.id, tabId: tab.id, subTabId: null }
        fallback ??= homeLocation
        if (buildNoteLocationKey(homeLocation) !== excludedKey) return homeLocation
        for (const subTab of tab.subTabs) {
          const subTabLocation = { domainId: domain.id, spaceId: space.id, tabId: tab.id, subTabId: subTab.id }
          if (buildNoteLocationKey(subTabLocation) !== excludedKey) return subTabLocation
        }
      }
    }
  }
  return fallback ?? fallbackLocation ?? { domainId: '', spaceId: '', tabId: '', subTabId: null }
}

export function getDefaultNoteReferenceTarget(
  sourceState: AppState,
  source: NoteLocation,
  fallbackLocation: NoteLocation = source,
): NoteLocation {
  const sourceInfo = getLocationInfo(sourceState, source)
  if (!sourceInfo.domain || !sourceInfo.space || !sourceInfo.tab) {
    return getFirstNoteLocation(sourceState, source, fallbackLocation)
  }

  const candidates: NoteLocation[] = [
    {
      domainId: source.domainId,
      spaceId: source.spaceId,
      tabId: source.tabId,
      subTabId: null,
    },
    ...sourceInfo.tab.subTabs.map((subTab) => ({
      domainId: source.domainId,
      spaceId: source.spaceId,
      tabId: source.tabId,
      subTabId: subTab.id,
    })),
  ]
  const sourceKey = buildNoteLocationKey(source)
  return candidates.find((candidate) => buildNoteLocationKey(candidate) !== sourceKey) ?? source
}

export function listNoteLocationsForBody(sourceState: AppState, noteBodyId: string): NoteLocationListEntry[] {
  const locations: NoteLocationListEntry[] = []
  for (const domain of getDomainsWithActiveProjection(sourceState)) {
    for (const space of domain.spaces) {
      for (const tab of space.data.tabs) {
        if (tab.noteBodyId === noteBodyId) {
          locations.push({
            domainId: domain.id,
            spaceId: space.id,
            tabId: tab.id,
            subTabId: null,
            title: tab.title,
            label: `${domain.name} / ${space.name} / ${tab.title} / home`,
          })
        }
        for (const subTab of tab.subTabs) {
          if (subTab.noteBodyId !== noteBodyId) continue
          locations.push({
            domainId: domain.id,
            spaceId: space.id,
            tabId: tab.id,
            subTabId: subTab.id,
            title: subTab.title,
            label: `${domain.name} / ${space.name} / ${tab.title} / ${subTab.title}`,
          })
        }
      }
    }
  }
  return locations
}

export function noteLocationHasContent(sourceState: AppState, location: NoteLocation): boolean {
  const noteBodyId = getLocationInfo(sourceState, location).noteBodyId
  const body = noteBodyId ? sourceState.noteBodies.find((candidate) => candidate.id === noteBodyId) : null
  return Boolean(body?.aisles.some((aisle) => aisle.markdown.trim().length > 0))
}

export function updateNoteLocationBody(sourceState: AppState, location: NoteLocation, noteBodyId: string): AppState {
  const domains = getDomainsWithActiveProjection(sourceState)
  const nextDomains = domains.map((domain) => {
    if (domain.id !== location.domainId) return domain
    return {
      ...domain,
      spaces: domain.spaces.map((space) => {
        if (space.id !== location.spaceId) return space
        return {
          ...space,
          data: {
            ...space.data,
            tabs: space.data.tabs.map((tab) => {
              if (tab.id !== location.tabId) return tab
              if (location.subTabId === null) return { ...tab, noteBodyId }
              return {
                ...tab,
                subTabs: tab.subTabs.map((subTab) =>
                  subTab.id === location.subTabId ? { ...subTab, noteBodyId } : subTab,
                ),
              }
            }),
          },
        }
      }),
    }
  })
  const activeDomain = nextDomains.find((domain) => domain.id === sourceState.activeDomainId) ?? nextDomains[0]
  return {
    ...sourceState,
    domains: nextDomains,
    spaces: activeDomain?.spaces ?? sourceState.spaces,
    activeSpaceId: activeDomain?.activeSpaceId ?? sourceState.activeSpaceId,
  }
}
