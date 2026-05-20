import type { AppState, Domain, Space } from '../types/app'

export function projectStageManagerDomains(appState: AppState): Domain[] {
  return appState.domains.map((domain) =>
    domain.id === appState.activeDomainId
      ? { ...domain, activeSpaceId: appState.activeSpaceId, spaces: appState.spaces }
      : domain,
  )
}

export function getStageManagerDomainSpaces(domains: Domain[], domainId: string): Space[] {
  return domains.find((domain) => domain.id === domainId)?.spaces ?? []
}

export function getStageManagerMigrateDestinationSpaces({
  domains,
  migrateDomainId,
  activeDomainId,
  activeSpaceId,
}: {
  domains: Domain[]
  migrateDomainId: string
  activeDomainId: string
  activeSpaceId: string
}): Space[] {
  return getStageManagerDomainSpaces(domains, migrateDomainId).filter(
    (space) => !(migrateDomainId === activeDomainId && space.id === activeSpaceId),
  )
}

export function replaceStageManagerDomainSpaces(
  domains: Domain[],
  domainId: string,
  spaces: Space[],
  activeSpaceId?: string,
): Domain[] {
  return domains.map((domain) =>
    domain.id === domainId
      ? {
          ...domain,
          spaces,
          activeSpaceId:
            activeSpaceId && spaces.some((space) => space.id === activeSpaceId)
              ? activeSpaceId
              : spaces.some((space) => space.id === domain.activeSpaceId)
                ? domain.activeSpaceId
                : spaces[0]?.id ?? domain.activeSpaceId,
        }
      : domain,
  )
}

export function buildStageManagerDomainAwareState(
  latestState: AppState,
  domains: Domain[],
  activeDomainId = latestState.activeDomainId,
  activeSpaceId = latestState.activeSpaceId,
): AppState {
  const activeDomain = domains.find((domain) => domain.id === activeDomainId) ?? domains[0]
  const spaces = activeDomain?.spaces ?? []
  const resolvedSpaceId = spaces.some((space) => space.id === activeSpaceId)
    ? activeSpaceId
    : activeDomain?.activeSpaceId ?? spaces[0]?.id ?? ''

  return {
    ...latestState,
    activeDomainId: activeDomain?.id ?? latestState.activeDomainId,
    activeSpaceId: resolvedSpaceId,
    spaces,
    domains,
  }
}
