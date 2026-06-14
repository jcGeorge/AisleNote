import type { AppState, NoteLocation } from '../types/app'
import {
  projectActiveDomainState,
  setActiveDomain,
  setActiveSpaceInActiveDomain,
  updateSpaceInActiveDomain,
} from '../state/domains'
import { buildNoteLocationKey, getLocationInfo } from './note-locations'

export const DEFAULT_SAFE_NOTE_LOCATION: NoteLocation = {
  domainId: 'humble-beginnings-domain',
  spaceId: 'getting-started-space',
  tabId: 'c67fb87e-a207-430e-9727-3cda68424c49',
  subTabId: null,
}

export type SafeNoteSelection = {
  location: NoteLocation
  noteBodyId: string
  reason: 'preferred' | 'first-valid' | 'preferred-only'
}

type SafeNoteSelectionOptions = {
  preferredLocation?: NoteLocation
  excludedLocation?: NoteLocation | null
}

function getDomainsForSelection(sourceState: AppState) {
  const projected = projectActiveDomainState(sourceState)
  return projected.domains.map((domain) =>
    domain.id === projected.activeDomainId
      ? { ...domain, activeSpaceId: projected.activeSpaceId, spaces: projected.spaces }
      : domain,
  )
}

function getResolvedSelection(
  sourceState: AppState,
  location: NoteLocation,
  reason: SafeNoteSelection['reason'],
): SafeNoteSelection | null {
  const info = getLocationInfo(sourceState, location)
  if (!info.domain || !info.space || !info.tab || (location.subTabId && !info.subTab)) return null
  return {
    location,
    noteBodyId: info.noteBodyId,
    reason,
  }
}

function isExcluded(location: NoteLocation, excludedLocation: NoteLocation | null | undefined): boolean {
  return excludedLocation ? buildNoteLocationKey(location) === buildNoteLocationKey(excludedLocation) : false
}

export function getSafeNoteSelection(
  sourceState: AppState,
  options: SafeNoteSelectionOptions = {},
): SafeNoteSelection | null {
  const projected = projectActiveDomainState(sourceState)
  const preferredLocation = options.preferredLocation ?? DEFAULT_SAFE_NOTE_LOCATION
  const preferredSelection = getResolvedSelection(projected, preferredLocation, 'preferred')
  if (preferredSelection && !isExcluded(preferredSelection.location, options.excludedLocation)) {
    return preferredSelection
  }
  const domains = getDomainsForSelection(projected)
  const defaultDomain = domains.find((domain) => domain.id === DEFAULT_SAFE_NOTE_LOCATION.domainId)
  const defaultSpace = defaultDomain?.spaces.find((space) => space.id === DEFAULT_SAFE_NOTE_LOCATION.spaceId)
  const defaultTab =
    defaultSpace?.data.tabs.find((tab) => tab.id === DEFAULT_SAFE_NOTE_LOCATION.tabId) ??
    defaultSpace?.data.tabs.find((tab) => tab.title.trim().toLowerCase() === 'welcome') ??
    defaultSpace?.data.tabs[0] ??
    null
  if (defaultDomain && defaultSpace && defaultTab) {
    const defaultLocation: NoteLocation = {
      domainId: defaultDomain.id,
      spaceId: defaultSpace.id,
      tabId: defaultTab.id,
      subTabId: null,
    }
    if (!isExcluded(defaultLocation, options.excludedLocation)) {
      return {
        location: defaultLocation,
        noteBodyId: defaultTab.noteBodyId,
        reason: 'preferred',
      }
    }
  }

  for (const domain of domains) {
    for (const space of domain.spaces) {
      for (const tab of space.data.tabs) {
        const homeLocation: NoteLocation = {
          domainId: domain.id,
          spaceId: space.id,
          tabId: tab.id,
          subTabId: null,
        }
        if (!isExcluded(homeLocation, options.excludedLocation)) {
          return {
            location: homeLocation,
            noteBodyId: tab.noteBodyId,
            reason: 'first-valid',
          }
        }
        for (const subTab of tab.subTabs) {
          const subTabLocation: NoteLocation = {
            domainId: domain.id,
            spaceId: space.id,
            tabId: tab.id,
            subTabId: subTab.id,
          }
          if (!isExcluded(subTabLocation, options.excludedLocation)) {
            return {
              location: subTabLocation,
              noteBodyId: subTab.noteBodyId,
              reason: 'first-valid',
            }
          }
        }
      }
    }
  }

  return preferredSelection ? { ...preferredSelection, reason: 'preferred-only' } : null
}

export function selectSafeNoteLocation(sourceState: AppState, location: NoteLocation): AppState {
  const domainState = setActiveDomain(sourceState, location.domainId)
  const spaceState = setActiveSpaceInActiveDomain(domainState, location.spaceId)
  return updateSpaceInActiveDomain(spaceState, location.spaceId, (space) => ({
    ...space,
    data: {
      ...space.data,
      activeTabId: location.tabId,
      tabs: space.data.tabs.map((tab) =>
        tab.id === location.tabId ? { ...tab, activeSubTabId: location.subTabId ?? null } : tab,
      ),
    },
  }))
}
