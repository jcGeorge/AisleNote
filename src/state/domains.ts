import { clampAutoRemoveDays, DEFAULT_AUTO_REMOVE_DAYS } from '../settings/defaults'
import type { AppState, ArrangeInsertPosition, Domain, Space, SpaceSettings, WorkspaceData } from '../types/app'
import {
  applyAutoPurgeToWorkspace,
  createDefaultWorkspaceData,
  createId,
  createSpace,
  normalizeWorkspaceData,
} from './workspace'

export const DEFAULT_DOMAIN_ID = 'humble-beginnings-domain'
export const DEFAULT_DOMAIN_NAME = 'humble beginnings'

export function createDefaultSpace(): Space {
  return {
    id: 'getting-started-space',
    name: 'Getting Started',
    settings: { autoRemoveDeletedDays: DEFAULT_AUTO_REMOVE_DAYS },
    data: createDefaultWorkspaceData(),
  }
}

export function createDomainFromSpaces(
  name: string,
  spaces: Space[],
  options?: {
    id?: string
    activeSpaceId?: string
  },
): Domain {
  const safeSpaces = spaces.length > 0 ? spaces : [createSpace('Getting Started')]
  const activeSpaceId =
    options?.activeSpaceId && safeSpaces.some((space) => space.id === options.activeSpaceId)
      ? options.activeSpaceId
      : safeSpaces[0].id

  return {
    id: options?.id ?? createId(),
    name: name.trim() || 'domain',
    activeSpaceId,
    spaces: safeSpaces,
  }
}

export function createDomain(name = 'New Domain'): Domain {
  const initialSpace = createSpace('Getting Started')
  return createDomainFromSpaces(name, [initialSpace], {
    activeSpaceId: initialSpace.id,
  })
}

export function createDefaultDomain(): Domain {
  const defaultSpace = createDefaultSpace()
  return createDomainFromSpaces(DEFAULT_DOMAIN_NAME, [defaultSpace], {
    id: DEFAULT_DOMAIN_ID,
    activeSpaceId: defaultSpace.id,
  })
}

export function createDuplicateDomainName(name: string, existingNames: string[]): string {
  const baseName = `${name} copy`
  if (!existingNames.includes(baseName)) return baseName

  let suffix = 2
  while (existingNames.includes(`${baseName} ${suffix}`)) {
    suffix += 1
  }
  return `${baseName} ${suffix}`
}

export function createLegacyWrappedDomain(spaces: Space[], activeSpaceId: string | null): Domain {
  return createDomainFromSpaces(DEFAULT_DOMAIN_NAME, spaces, {
    id: DEFAULT_DOMAIN_ID,
    activeSpaceId: activeSpaceId ?? undefined,
  })
}

export function normalizeSpace(raw: unknown, index: number): Space | null {
  if (!raw || typeof raw !== 'object') return null
  const space = raw as Record<string, unknown>
  const id = typeof space.id === 'string' ? space.id : `space-${index}-${createId()}`
  const name = typeof space.name === 'string' && space.name.trim() ? space.name : `Space ${index + 1}`
  const rawSettings =
    space.settings && typeof space.settings === 'object' ? (space.settings as Record<string, unknown>) : {}
  const settings: SpaceSettings = {
    autoRemoveDeletedDays: clampAutoRemoveDays(
      typeof rawSettings.autoRemoveDeletedDays === 'number'
        ? rawSettings.autoRemoveDeletedDays
        : DEFAULT_AUTO_REMOVE_DAYS,
    ),
  }
  const data = applyAutoPurgeToWorkspace(normalizeWorkspaceData(space.data), settings.autoRemoveDeletedDays)

  return {
    id,
    name,
    settings,
    data,
  }
}

export function normalizeSpaces(raw: unknown): Space[] {
  if (!Array.isArray(raw)) return []
  return raw.map((space, index) => normalizeSpace(space, index)).filter((space): space is Space => space !== null)
}

export function normalizeDomain(raw: unknown, index: number): Domain | null {
  if (!raw || typeof raw !== 'object') return null
  const domain = raw as Record<string, unknown>
  const spaces = normalizeSpaces(domain.spaces)
  const id = typeof domain.id === 'string' ? domain.id : `domain-${index}-${createId()}`
  const name = typeof domain.name === 'string' && domain.name.trim() ? domain.name : `Domain ${index + 1}`
  const activeSpaceId = typeof domain.activeSpaceId === 'string' ? domain.activeSpaceId : null

  return createDomainFromSpaces(name, spaces, {
    id,
    activeSpaceId: activeSpaceId ?? undefined,
  })
}

export function normalizeDomains(raw: unknown): Domain[] {
  if (!Array.isArray(raw)) return []
  return raw.map((domain, index) => normalizeDomain(domain, index)).filter((domain): domain is Domain => domain !== null)
}

export function getActiveDomain(appState: AppState): Domain {
  return appState.domains.find((domain) => domain.id === appState.activeDomainId) ?? appState.domains[0] ?? createDefaultDomain()
}

export function getActiveSpace(domain: Domain): Space {
  return domain.spaces.find((space) => space.id === domain.activeSpaceId) ?? domain.spaces[0] ?? createDefaultSpace()
}

export function getActiveDomainSpaces(appState: AppState): Space[] {
  return getActiveDomain(projectActiveDomainState(appState)).spaces
}

export function getActiveSpaceFromAppState(appState: AppState): Space {
  return getActiveSpace(getActiveDomain(projectActiveDomainState(appState)))
}

export function projectActiveDomainState(appState: AppState): AppState {
  const fallbackDomain = createLegacyWrappedDomain(appState.spaces, appState.activeSpaceId)
  const domains = appState.domains.length > 0 ? appState.domains : [fallbackDomain]
  const activeDomain = domains.find((domain) => domain.id === appState.activeDomainId) ?? domains[0]
  const projectedSpaces = appState.spaces.length > 0 ? appState.spaces : activeDomain.spaces
  const activeSpaceId =
    appState.activeSpaceId && projectedSpaces.some((space) => space.id === appState.activeSpaceId)
      ? appState.activeSpaceId
      : activeDomain.activeSpaceId && projectedSpaces.some((space) => space.id === activeDomain.activeSpaceId)
        ? activeDomain.activeSpaceId
        : projectedSpaces[0]?.id ?? ''
  const projectedDomain: Domain = {
    ...activeDomain,
    activeSpaceId,
    spaces: projectedSpaces,
  }
  const activeDomainAlreadyProjected =
    activeDomain.activeSpaceId === projectedDomain.activeSpaceId && activeDomain.spaces === projectedDomain.spaces
  const projectedDomains = activeDomainAlreadyProjected
    ? domains
    : domains.map((domain) => (domain.id === projectedDomain.id ? projectedDomain : domain))

  if (
    appState.activeDomainId === projectedDomain.id &&
    appState.activeSpaceId === activeSpaceId &&
    appState.spaces === projectedSpaces &&
    appState.domains === projectedDomains
  ) {
    return appState
  }

  return {
    ...appState,
    activeDomainId: projectedDomain.id,
    activeSpaceId,
    spaces: projectedSpaces,
    domains: projectedDomains,
  }
}

export function updateActiveDomain(appState: AppState, updater: (domain: Domain) => Domain): AppState {
  const projected = projectActiveDomainState(appState)
  const activeDomain = getActiveDomain(projected)
  const nextDomain = updater(activeDomain)
  const nextDomains = projected.domains.map((domain) => (domain.id === activeDomain.id ? nextDomain : domain))

  return projectActiveDomainState({
    ...projected,
    activeDomainId: nextDomain.id,
    activeSpaceId: nextDomain.activeSpaceId,
    spaces: nextDomain.spaces,
    domains: nextDomains,
  })
}

export function updateActiveDomainSpaces(
  appState: AppState,
  spaces: Space[],
  activeSpaceId: string = appState.activeSpaceId,
): AppState {
  return updateActiveDomain(appState, (domain) =>
    createDomainFromSpaces(domain.name, spaces, {
      id: domain.id,
      activeSpaceId,
    }),
  )
}

export function setActiveDomain(appState: AppState, domainId: string): AppState {
  const projected = projectActiveDomainState(appState)
  const nextDomain = projected.domains.find((domain) => domain.id === domainId)
  if (!nextDomain) return projected
  if (projected.activeDomainId === nextDomain.id && projected.spaces === nextDomain.spaces) return projected

  return projectActiveDomainState({
    ...projected,
    activeDomainId: nextDomain.id,
    activeSpaceId: nextDomain.activeSpaceId,
    spaces: nextDomain.spaces,
  })
}

export function addDomain(appState: AppState, domain: Domain, makeActive = true): AppState {
  const projected = projectActiveDomainState(appState)
  const domains = [...projected.domains, domain]
  if (!makeActive) {
    return {
      ...projected,
      domains,
    }
  }

  return projectActiveDomainState({
    ...projected,
    activeDomainId: domain.id,
    activeSpaceId: domain.activeSpaceId,
    spaces: domain.spaces,
    domains,
  })
}

export function renameDomain(appState: AppState, domainId: string, name: string): AppState {
  const projected = projectActiveDomainState(appState)
  let changed = false
  const domains = projected.domains.map((domain) => {
    if (domain.id !== domainId || domain.name === name) return domain
    changed = true
    return { ...domain, name }
  })

  return changed ? projectActiveDomainState({ ...projected, domains }) : projected
}

export function setActiveSpaceInActiveDomain(appState: AppState, spaceId: string): AppState {
  const projected = projectActiveDomainState(appState)
  if (!projected.spaces.some((space) => space.id === spaceId)) return projected
  if (projected.activeSpaceId === spaceId) return projected
  return updateActiveDomainSpaces(projected, projected.spaces, spaceId)
}

export function addSpaceToActiveDomain(appState: AppState, space: Space, makeActive = true): AppState {
  const projected = projectActiveDomainState(appState)
  return updateActiveDomainSpaces(
    projected,
    [...projected.spaces, space],
    makeActive ? space.id : projected.activeSpaceId,
  )
}

export function insertSpaceAfterInActiveDomain(appState: AppState, sourceSpaceId: string, insertedSpace: Space): AppState {
  const projected = projectActiveDomainState(appState)
  const sourceIndex = projected.spaces.findIndex((space) => space.id === sourceSpaceId)
  if (sourceIndex < 0) return projected
  const spaces = [...projected.spaces]
  spaces.splice(sourceIndex + 1, 0, insertedSpace)
  return updateActiveDomainSpaces(projected, spaces, insertedSpace.id)
}

export function removeSpaceFromActiveDomain(appState: AppState, spaceId: string): AppState {
  const projected = projectActiveDomainState(appState)
  if (projected.spaces.length <= 1) return projected
  const spaces = projected.spaces.filter((space) => space.id !== spaceId)
  if (spaces.length === projected.spaces.length) return projected
  const activeSpaceId =
    projected.activeSpaceId === spaceId ? spaces[0]?.id ?? projected.activeSpaceId : projected.activeSpaceId
  return updateActiveDomainSpaces(projected, spaces, activeSpaceId)
}

export function updateSpaceInActiveDomain(
  appState: AppState,
  spaceId: string,
  updater: (space: Space) => Space,
): AppState {
  const projected = projectActiveDomainState(appState)
  let changed = false
  const spaces = projected.spaces.map((space) => {
    if (space.id !== spaceId) return space
    const nextSpace = updater(space)
    if (nextSpace === space) return space
    changed = true
    return nextSpace
  })

  return changed ? updateActiveDomainSpaces(projected, spaces, projected.activeSpaceId) : projected
}

export function updateActiveSpaceInActiveDomain(appState: AppState, updater: (space: Space) => Space): AppState {
  const projected = projectActiveDomainState(appState)
  return updateSpaceInActiveDomain(projected, projected.activeSpaceId, updater)
}

export function updateActiveSpaceDataInActiveDomain(
  appState: AppState,
  updater: (data: WorkspaceData) => WorkspaceData,
): AppState {
  return updateActiveSpaceInActiveDomain(appState, (space) => ({
    ...space,
    data: applyAutoPurgeToWorkspace(updater(space.data), space.settings.autoRemoveDeletedDays),
  }))
}

export function renameSpaceInActiveDomain(appState: AppState, spaceId: string, name: string): AppState {
  return updateSpaceInActiveDomain(appState, spaceId, (space) => (space.name === name ? space : { ...space, name }))
}

function moveItemByInsertion<T>(
  items: T[],
  fromIndex: number,
  targetIndex: number,
  position: ArrangeInsertPosition,
): T[] {
  if (fromIndex < 0 || targetIndex < 0 || fromIndex === targetIndex) return items
  const nextItems = [...items]
  const [movedItem] = nextItems.splice(fromIndex, 1)
  const rawInsertIndex = targetIndex + (position === 'after' ? 1 : 0)
  const insertIndex = fromIndex < rawInsertIndex ? rawInsertIndex - 1 : rawInsertIndex
  nextItems.splice(insertIndex, 0, movedItem)
  return nextItems
}

export function moveSpaceWithinActiveDomain(
  appState: AppState,
  draggedSpaceId: string,
  targetSpaceId: string,
  position: ArrangeInsertPosition,
): AppState {
  const projected = projectActiveDomainState(appState)
  const fromIndex = projected.spaces.findIndex((space) => space.id === draggedSpaceId)
  const toIndex = projected.spaces.findIndex((space) => space.id === targetSpaceId)
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return projected
  return updateActiveDomainSpaces(
    projected,
    moveItemByInsertion(projected.spaces, fromIndex, toIndex, position),
    projected.activeSpaceId,
  )
}
