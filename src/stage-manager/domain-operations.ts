import { createDomainFromSpaces, projectActiveDomainState } from '../state/domains'
import { moveDomainToTrash, moveSpaceToTrash } from '../trash/domain-space-trash'
import type { IdGenerator } from '../state/navigation-ids'
import type {
  AppState,
  DeletedSpaceEntry,
  Domain,
  Space,
  StageManagerDomainSelectionSnapshot,
  StageManagerSpaceSelectionSnapshot,
} from '../types/app'

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

type StageManagerHierarchyMutationReason =
  | 'missing-domain'
  | 'missing-space'
  | 'same-domain'
  | 'last-domain'
  | 'last-space'
  | 'invalid-target'
  | 'multi-space-domain'

export type StageManagerHierarchyMutationResult = {
  state: AppState
  changed: boolean
  reason?: StageManagerHierarchyMutationReason
  focus?: {
    domainId: string
    spaceId: string
  }
}

function orderedSelectedSpaces(sourceDomain: Domain, selectedSpaceIds: Iterable<string>): Space[] {
  const selectedIds = new Set(selectedSpaceIds)
  return sourceDomain.spaces.filter((space) => selectedIds.has(space.id))
}

function orderedSelectedDomains(domains: Domain[], selectedDomainIds: Iterable<string>): Domain[] {
  const selectedIds = new Set(selectedDomainIds)
  return domains.filter((domain) => selectedIds.has(domain.id))
}

function cloneSpaceForTransfer(space: Space): Space {
  return {
    ...space,
    data: {
      ...space.data,
      tabs: space.data.tabs.map((tab) => ({
        ...tab,
        subTabs: tab.subTabs.map((subTab) => ({ ...subTab })),
      })),
      deletedTabs: space.data.deletedTabs.map((entry) => ({
        ...entry,
        tab: {
          ...entry.tab,
          subTabs: entry.tab.subTabs.map((subTab) => ({ ...subTab })),
        },
      })),
      deletedSubTabs: space.data.deletedSubTabs.map((entry) => ({
        ...entry,
        subTab: { ...entry.subTab },
      })),
    },
  }
}

function remapDeletedSpaceEntryToDomain(entry: DeletedSpaceEntry, domain: Domain): DeletedSpaceEntry {
  return {
    ...entry,
    domainId: domain.id,
    domainName: domain.name,
  }
}

export function buildStageManagerSpaceSelectionSnapshot(
  domains: Domain[],
  sourceDomainId: string,
  selectedSpaceIds: Iterable<string>,
): StageManagerSpaceSelectionSnapshot {
  const sourceDomain = domains.find((domain) => domain.id === sourceDomainId)
  if (!sourceDomain) {
    return {
      sourceDomainId,
      sourceDomainName: '',
      spaces: [],
      hasSelection: false,
    }
  }
  const spaces = orderedSelectedSpaces(sourceDomain, selectedSpaceIds).map(cloneSpaceForTransfer)
  return {
    sourceDomainId,
    sourceDomainName: sourceDomain.name,
    spaces,
    hasSelection: spaces.length > 0,
  }
}

export function buildStageManagerDomainSelectionSnapshot(
  domains: Domain[],
  selectedDomainIds: Iterable<string>,
): StageManagerDomainSelectionSnapshot {
  const selectedDomains = orderedSelectedDomains(domains, selectedDomainIds).map((domain) => ({
    ...domain,
    spaces: domain.spaces.map(cloneSpaceForTransfer),
  }))
  return {
    domains: selectedDomains,
    domainIds: new Set(selectedDomains.map((domain) => domain.id)),
    hasSelection: selectedDomains.length > 0,
  }
}

export function migrateStageManagerSpacesToDomain(
  appState: AppState,
  sourceDomainId: string,
  selectedSpaceIds: Iterable<string>,
  targetDomainId: string,
): StageManagerHierarchyMutationResult {
  const projected = projectActiveDomainState(appState)
  if (sourceDomainId === targetDomainId) return { state: projected, changed: false, reason: 'same-domain' }

  const sourceDomain = projected.domains.find((domain) => domain.id === sourceDomainId)
  const targetDomain = projected.domains.find((domain) => domain.id === targetDomainId)
  if (!sourceDomain || !targetDomain) return { state: projected, changed: false, reason: 'missing-domain' }

  const movedSpaces = orderedSelectedSpaces(sourceDomain, selectedSpaceIds)
  if (movedSpaces.length === 0) return { state: projected, changed: false, reason: 'missing-space' }
  if (sourceDomain.spaces.length - movedSpaces.length < 1) return { state: projected, changed: false, reason: 'last-space' }

  const movedSpaceIds = new Set(movedSpaces.map((space) => space.id))
  const sourceSpaces = sourceDomain.spaces.filter((space) => !movedSpaceIds.has(space.id))
  const nextSourceDomain = createDomainFromSpaces(sourceDomain.name, sourceSpaces, {
    id: sourceDomain.id,
    activeSpaceId: sourceDomain.activeSpaceId && !movedSpaceIds.has(sourceDomain.activeSpaceId)
      ? sourceDomain.activeSpaceId
      : sourceSpaces[0]?.id,
  })
  const appendedSpaces = movedSpaces.filter((space) => !targetDomain.spaces.some((candidate) => candidate.id === space.id))
  const targetSpaces = [...targetDomain.spaces, ...appendedSpaces.map(cloneSpaceForTransfer)]
  const focusSpaceId = appendedSpaces[0]?.id ?? targetDomain.activeSpaceId
  const nextTargetDomain = createDomainFromSpaces(targetDomain.name, targetSpaces, {
    id: targetDomain.id,
    activeSpaceId: focusSpaceId,
  })
  const domains = projected.domains.map((domain) => {
    if (domain.id === sourceDomain.id) return nextSourceDomain
    if (domain.id === targetDomain.id) return nextTargetDomain
    return domain
  })

  return {
    changed: true,
    state: buildStageManagerDomainAwareState(projected, domains, nextTargetDomain.id, focusSpaceId),
    focus: { domainId: nextTargetDomain.id, spaceId: focusSpaceId },
  }
}

export function promoteStageManagerSpacesToDomains(
  appState: AppState,
  sourceDomainId: string,
  selectedSpaceIds: Iterable<string>,
  createId: IdGenerator,
): StageManagerHierarchyMutationResult {
  const projected = projectActiveDomainState(appState)
  const sourceDomain = projected.domains.find((domain) => domain.id === sourceDomainId)
  if (!sourceDomain) return { state: projected, changed: false, reason: 'missing-domain' }

  const movedSpaces = orderedSelectedSpaces(sourceDomain, selectedSpaceIds)
  if (movedSpaces.length === 0) return { state: projected, changed: false, reason: 'missing-space' }
  if (sourceDomain.spaces.length - movedSpaces.length < 1) return { state: projected, changed: false, reason: 'last-space' }

  const movedSpaceIds = new Set(movedSpaces.map((space) => space.id))
  const sourceSpaces = sourceDomain.spaces.filter((space) => !movedSpaceIds.has(space.id))
  const nextSourceDomain = createDomainFromSpaces(sourceDomain.name, sourceSpaces, {
    id: sourceDomain.id,
    activeSpaceId: sourceDomain.activeSpaceId && !movedSpaceIds.has(sourceDomain.activeSpaceId)
      ? sourceDomain.activeSpaceId
      : sourceSpaces[0]?.id,
  })
  const promotedDomains = movedSpaces.map((space) => {
    const promotedSpace = {
      ...cloneSpaceForTransfer(space),
      name: 'main',
    }
    return createDomainFromSpaces(space.name, [promotedSpace], {
      id: createId(),
      activeSpaceId: promotedSpace.id,
      createId,
    })
  })
  const domains = projected.domains.flatMap((domain) =>
    domain.id === sourceDomain.id ? [nextSourceDomain, ...promotedDomains] : [domain],
  )
  const firstPromotedDomain = promotedDomains[0]
  const focusSpaceId = firstPromotedDomain.activeSpaceId

  return {
    changed: true,
    state: buildStageManagerDomainAwareState(projected, domains, firstPromotedDomain.id, focusSpaceId),
    focus: { domainId: firstPromotedDomain.id, spaceId: focusSpaceId },
  }
}

export function demoteStageManagerDomainsToSpaces(
  appState: AppState,
  selectedDomainIds: Iterable<string>,
  targetDomainId: string,
): StageManagerHierarchyMutationResult {
  const projected = projectActiveDomainState(appState)
  const selectedIds = new Set(selectedDomainIds)
  if (selectedIds.size === 0) return { state: projected, changed: false, reason: 'missing-domain' }
  if (selectedIds.has(targetDomainId)) return { state: projected, changed: false, reason: 'invalid-target' }
  if (projected.domains.length - selectedIds.size < 1) return { state: projected, changed: false, reason: 'last-domain' }

  const targetDomain = projected.domains.find((domain) => domain.id === targetDomainId)
  if (!targetDomain) return { state: projected, changed: false, reason: 'missing-domain' }

  const selectedDomains = orderedSelectedDomains(projected.domains, selectedIds)
  if (selectedDomains.length !== selectedIds.size) return { state: projected, changed: false, reason: 'missing-domain' }
  if (selectedDomains.some((domain) => domain.spaces.length !== 1)) {
    return { state: projected, changed: false, reason: 'multi-space-domain' }
  }

  const demotedSpaces = selectedDomains.map((domain) => ({
    ...cloneSpaceForTransfer(domain.spaces[0]),
    name: domain.name,
  }))
  const nextTargetDomain = createDomainFromSpaces(targetDomain.name, [...targetDomain.spaces, ...demotedSpaces], {
    id: targetDomain.id,
    activeSpaceId: demotedSpaces[0]?.id ?? targetDomain.activeSpaceId,
  })
  const domains = projected.domains.flatMap((domain) => {
    if (selectedIds.has(domain.id)) return []
    if (domain.id === targetDomain.id) return [nextTargetDomain]
    return [domain]
  })
  const deletedSpaces = (projected.deletedSpaces ?? []).map((entry) =>
    selectedIds.has(entry.domainId) ? remapDeletedSpaceEntryToDomain(entry, nextTargetDomain) : entry,
  )
  const focusSpaceId = demotedSpaces[0]?.id ?? nextTargetDomain.activeSpaceId

  return {
    changed: true,
    state: buildStageManagerDomainAwareState({ ...projected, deletedSpaces }, domains, nextTargetDomain.id, focusSpaceId),
    focus: { domainId: nextTargetDomain.id, spaceId: focusSpaceId },
  }
}

export function moveStageManagerSpacesToTrash(
  appState: AppState,
  sourceDomainId: string,
  selectedSpaceIds: Iterable<string>,
  createDeletedEntryId?: () => string,
): StageManagerHierarchyMutationResult {
  const projected = projectActiveDomainState(appState)
  const sourceDomain = projected.domains.find((domain) => domain.id === sourceDomainId)
  if (!sourceDomain) return { state: projected, changed: false, reason: 'missing-domain' }
  const movedSpaces = orderedSelectedSpaces(sourceDomain, selectedSpaceIds)
  if (movedSpaces.length === 0) return { state: projected, changed: false, reason: 'missing-space' }
  if (sourceDomain.spaces.length - movedSpaces.length < 1) return { state: projected, changed: false, reason: 'last-space' }

  let nextState = projected
  for (const space of movedSpaces) {
    const result = moveSpaceToTrash(nextState, sourceDomainId, space.id, createDeletedEntryId)
    if (!result.changed) return { state: projected, changed: false, reason: result.reason ?? 'missing-space' }
    nextState = result.state
  }

  return { state: nextState, changed: true }
}

export function moveStageManagerDomainsToTrash(
  appState: AppState,
  selectedDomainIds: Iterable<string>,
  createDeletedEntryId?: () => string,
): StageManagerHierarchyMutationResult {
  const projected = projectActiveDomainState(appState)
  const selectedDomains = orderedSelectedDomains(projected.domains, selectedDomainIds)
  if (selectedDomains.length === 0) return { state: projected, changed: false, reason: 'missing-domain' }
  if (projected.domains.length - selectedDomains.length < 1) return { state: projected, changed: false, reason: 'last-domain' }

  let nextState = projected
  for (const domain of selectedDomains) {
    const result = moveDomainToTrash(nextState, domain.id, createDeletedEntryId)
    if (!result.changed) return { state: projected, changed: false, reason: result.reason ?? 'missing-domain' }
    nextState = result.state
  }

  return { state: nextState, changed: true }
}
