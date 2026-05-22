import { projectActiveDomainState, setActiveSpaceInActiveDomain } from '../state/domains'
import type { AppState, ArrangeHierarchyDropRequest, ArrangeInsertPosition, Domain, SubTab, Tab } from '../types/app'
import {
  moveSelectedParentTabsToTrash,
  moveSelectedSubTabsToTrash,
} from './arrange-selection'

type MoveParentTabsToSpaceOptions = {
  createFallbackTab: () => Tab
  placement?: {
    targetParentTabId: string
    position: ArrangeInsertPosition
  }
}

type MoveHierarchyDropRequestItemToTrashOptions = {
  createDeletedEntryId: () => string
  createFallbackTab: () => Tab
}

export type HierarchyDropTrashResult = {
  state: AppState
  moved:
    | {
        kind: 'parent tab' | 'tab'
        name: string
      }
    | null
}

function orderTabs(tabs: Tab[], tabIds: string[]) {
  const idSet = new Set(tabIds)
  return tabs.filter((tab) => idSet.has(tab.id))
}

function orderSubTabs(subTabs: SubTab[], subTabIds: string[]) {
  const idSet = new Set(subTabIds)
  return subTabs.filter((subTab) => idSet.has(subTab.id))
}

function removeDuplicateTabs(targetTabs: Tab[], movedTabs: Tab[]) {
  const existingIds = new Set(targetTabs.map((tab) => tab.id))
  return movedTabs.filter((tab) => !existingIds.has(tab.id))
}

function removeDuplicateSubTabs(targetSubTabs: SubTab[], movedSubTabs: SubTab[]) {
  const existingIds = new Set(targetSubTabs.map((subTab) => subTab.id))
  return movedSubTabs.filter((subTab) => !existingIds.has(subTab.id))
}

function insertTabsByPlacement(targetTabs: Tab[], movedTabs: Tab[], placement: MoveParentTabsToSpaceOptions['placement']) {
  if (!placement) return [...targetTabs, ...movedTabs]
  if (movedTabs.some((tab) => tab.id === placement.targetParentTabId)) return targetTabs

  const targetIndex = targetTabs.findIndex((tab) => tab.id === placement.targetParentTabId)
  if (targetIndex < 0) return [...targetTabs, ...movedTabs]

  const insertIndex = targetIndex + (placement.position === 'after' ? 1 : 0)
  const nextTabs = [...targetTabs]
  nextTabs.splice(insertIndex, 0, ...movedTabs)
  return nextTabs
}

function activateTargetSpace(appState: AppState, targetDomainId: string, targetSpaceId: string) {
  const targetDomain = appState.domains.find((domain) => domain.id === targetDomainId)
  return setActiveSpaceInActiveDomain(
    projectActiveDomainState({
      ...appState,
      activeDomainId: targetDomainId,
      activeSpaceId: targetDomain?.activeSpaceId ?? targetSpaceId,
      spaces: targetDomain?.spaces ?? appState.spaces,
    }),
    targetSpaceId,
  )
}

export function moveParentTabsToSpace(
  appState: AppState,
  sourceDomainId: string,
  sourceSpaceId: string,
  parentTabIds: string[],
  targetDomainId: string,
  targetSpaceId: string,
  options: MoveParentTabsToSpaceOptions,
): AppState {
  if (sourceDomainId === targetDomainId && sourceSpaceId === targetSpaceId) return appState

  const projected = projectActiveDomainState(appState)
  const sourceDomain = projected.domains.find((domain) => domain.id === sourceDomainId)
  const targetDomain = projected.domains.find((domain) => domain.id === targetDomainId)
  const sourceSpace = sourceDomain?.spaces.find((space) => space.id === sourceSpaceId)
  const targetSpace = targetDomain?.spaces.find((space) => space.id === targetSpaceId)
  if (!sourceSpace || !targetSpace) return projected

  const movedTabs = orderTabs(sourceSpace.data.tabs, parentTabIds)
  const tabsToAppend = removeDuplicateTabs(targetSpace.data.tabs, movedTabs)
  if (movedTabs.length === 0 || tabsToAppend.length === 0) return projected
  const movedIdSet = new Set(movedTabs.map((tab) => tab.id))

  const nextDomains: Domain[] = projected.domains.map((domain) => {
    if (domain.id !== sourceDomainId && domain.id !== targetDomainId) return domain

    return {
      ...domain,
      spaces: domain.spaces.map((space) => {
        if (domain.id === sourceDomainId && space.id === sourceSpaceId) {
          const remainingTabs = space.data.tabs.filter((tab) => !movedIdSet.has(tab.id))
          const nextTabs = remainingTabs.length > 0 ? remainingTabs : [options.createFallbackTab()]
          const activeTabMoved = movedIdSet.has(space.data.activeTabId)
          const activeTabId = activeTabMoved ? nextTabs[0].id : space.data.activeTabId
          return {
            ...space,
            data: {
              ...space.data,
              activeTabId,
              tabs: nextTabs.map((tab) => (activeTabMoved && tab.id === activeTabId ? { ...tab, activeSubTabId: null } : tab)),
            },
          }
        }

        if (domain.id === targetDomainId && space.id === targetSpaceId) {
          return {
            ...space,
            data: {
              ...space.data,
              activeTabId: tabsToAppend[0].id,
              tabs: insertTabsByPlacement(space.data.tabs, tabsToAppend, options.placement),
            },
          }
        }

        return space
      }),
    }
  })

  return activateTargetSpace({ ...projected, domains: nextDomains }, targetDomainId, targetSpaceId)
}

export function moveSubTabsToParentInSpace(
  appState: AppState,
  sourceDomainId: string,
  sourceSpaceId: string,
  sourceParentTabId: string,
  subTabIds: string[],
  targetDomainId: string,
  targetSpaceId: string,
  targetParentTabId: string,
): AppState {
  if (
    sourceDomainId === targetDomainId &&
    sourceSpaceId === targetSpaceId &&
    sourceParentTabId === targetParentTabId
  ) {
    return appState
  }

  const projected = projectActiveDomainState(appState)
  const sourceDomain = projected.domains.find((domain) => domain.id === sourceDomainId)
  const targetDomain = projected.domains.find((domain) => domain.id === targetDomainId)
  const sourceSpace = sourceDomain?.spaces.find((space) => space.id === sourceSpaceId)
  const targetSpace = targetDomain?.spaces.find((space) => space.id === targetSpaceId)
  const sourceParent = sourceSpace?.data.tabs.find((tab) => tab.id === sourceParentTabId)
  const targetParent = targetSpace?.data.tabs.find((tab) => tab.id === targetParentTabId)
  if (!sourceParent || !targetParent) return projected

  const movedSubTabs = orderSubTabs(sourceParent.subTabs, subTabIds)
  const subTabsToAppend = removeDuplicateSubTabs(targetParent.subTabs, movedSubTabs)
  if (movedSubTabs.length === 0 || subTabsToAppend.length === 0) return projected
  const movedSubTabIds = movedSubTabs.map((subTab) => subTab.id)
  const movedIdSet = new Set(movedSubTabIds)

  const nextDomains = projected.domains.map((domain) => {
    if (domain.id !== sourceDomainId && domain.id !== targetDomainId) return domain

    return {
      ...domain,
      spaces: domain.spaces.map((space) => {
        if (domain.id === sourceDomainId && space.id === sourceSpaceId) {
          return {
            ...space,
            data: {
              ...space.data,
              tabs: space.data.tabs.map((tab) => {
                if (tab.id !== sourceParentTabId) return tab
                return {
                  ...tab,
                  activeSubTabId: tab.activeSubTabId && movedIdSet.has(tab.activeSubTabId) ? null : tab.activeSubTabId,
                  subTabs: tab.subTabs.filter((subTab) => !movedIdSet.has(subTab.id)),
                }
              }),
            },
          }
        }

        if (domain.id === targetDomainId && space.id === targetSpaceId) {
          return {
            ...space,
            data: {
              ...space.data,
              activeTabId: targetParentTabId,
              tabs: space.data.tabs.map((tab) => {
                if (tab.id !== targetParentTabId) return tab
                return {
                  ...tab,
                  activeSubTabId: subTabsToAppend[0].id,
                  subTabs: [...tab.subTabs, ...subTabsToAppend],
                }
              }),
            },
          }
        }

        return space
      }),
    }
  })

  return activateTargetSpace({ ...projected, domains: nextDomains }, targetDomainId, targetSpaceId)
}

export function moveHierarchyDropRequestItemToTrash(
  appState: AppState,
  request: ArrangeHierarchyDropRequest,
  options: MoveHierarchyDropRequestItemToTrashOptions,
): HierarchyDropTrashResult {
  const projected = projectActiveDomainState(appState)
  const sourceDomain = projected.domains.find((domain) => domain.id === request.sourceDomainId)
  const sourceSpace = sourceDomain?.spaces.find((space) => space.id === request.sourceSpaceId)
  if (!sourceDomain || !sourceSpace) return { state: projected, moved: null }

  const moved =
    request.item.type === 'parent'
      ? sourceSpace.data.tabs.find((tab) => request.item.type === 'parent' && request.item.parentTabIds.includes(tab.id))
      : sourceSpace.data.tabs
          .find((tab) => request.item.type === 'subtab' && tab.id === request.item.parentTabId)
          ?.subTabs.find((subTab) => request.item.type === 'subtab' && request.item.subTabIds.includes(subTab.id))

  if (!moved) return { state: projected, moved: null }

  const nextData =
    request.item.type === 'parent'
      ? moveSelectedParentTabsToTrash(sourceSpace.data, request.item.parentTabIds, options)
      : moveSelectedSubTabsToTrash(sourceSpace.data, request.item.parentTabId, request.item.subTabIds, options)

  if (nextData === sourceSpace.data) return { state: projected, moved: null }

  const nextDomains = projected.domains.map((domain) => {
    if (domain.id !== sourceDomain.id) return domain
    return {
      ...domain,
      spaces: domain.spaces.map((space) => (space.id === sourceSpace.id ? { ...space, data: nextData } : space)),
    }
  })
  const nextActiveDomain = nextDomains.find((domain) => domain.id === projected.activeDomainId)

  return {
    state: projectActiveDomainState({
      ...projected,
      domains: nextDomains,
      spaces: projected.activeDomainId === sourceDomain.id && nextActiveDomain ? nextActiveDomain.spaces : projected.spaces,
    }),
    moved: {
      kind: request.item.type === 'parent' ? 'parent tab' : 'tab',
      name: moved.title,
    },
  }
}
