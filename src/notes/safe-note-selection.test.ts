import { describe, expect, it } from 'vitest'
import { DEFAULT_STATE, ensureNoteBodiesForAppState } from '../state/app-state'
import type { AppState, Domain, NoteLocation, Space, Tab } from '../types/app'
import {
  DEFAULT_SAFE_NOTE_LOCATION,
  getSafeNoteSelection,
  selectSafeNoteLocation,
} from './safe-note-selection'
import { getLocationInfo } from './note-locations'

const importedLocation: NoteLocation = {
  domainId: 'imported-domain',
  spaceId: 'imported-space',
  tabId: 'imported-tab',
  subTabId: 'imported-subtab',
}

function tab(id: string, title: string, noteBodyId: string, subTabId?: string): Tab {
  return {
    id,
    title,
    noteBodyId,
    activeSubTabId: subTabId ?? null,
    subTabs: subTabId
      ? [
          {
            id: subTabId,
            title: 'Office Equipment Desiring to Buy',
            noteBodyId: `${noteBodyId}-sub`,
          },
        ]
      : [],
  }
}

function space(id: string, name: string, sourceTab: Tab): Space {
  return {
    id,
    name,
    settings: { autoRemoveDeletedDays: 30 },
    data: {
      activeTabId: sourceTab.id,
      tabs: [sourceTab],
      deletedTabs: [],
      deletedSubTabs: [],
    },
  }
}

function domain(id: string, name: string, sourceSpace: Space): Domain {
  return {
    id,
    name,
    activeSpaceId: sourceSpace.id,
    spaces: [sourceSpace],
  }
}

function createImportedState(): AppState {
  const base = structuredClone(DEFAULT_STATE)
  const importedSpace = space(
    importedLocation.spaceId,
    'Ministry',
    tab(importedLocation.tabId, 'Equipment', 'imported-note-body', importedLocation.subTabId ?? undefined),
  )
  const importedDomain = domain(importedLocation.domainId, 'imported domain 1', importedSpace)
  return ensureNoteBodiesForAppState({
    ...base,
    activeDomainId: importedDomain.id,
    activeSpaceId: importedSpace.id,
    spaces: importedDomain.spaces,
    domains: [...base.domains, importedDomain],
  })
}

describe('safe note selection', () => {
  it('prefers the default welcome note when it exists', () => {
    const state = createImportedState()
    const selection = getSafeNoteSelection(state, {
      excludedLocation: importedLocation,
    })

    expect(selection?.location.domainId).toBe(DEFAULT_SAFE_NOTE_LOCATION.domainId)
    expect(selection?.location.spaceId).toBe(DEFAULT_SAFE_NOTE_LOCATION.spaceId)
    expect(selection?.location.subTabId).toBeNull()
    expect(selection ? getLocationInfo(state, selection.location).title : '').toBe('welcome')
    expect(selection?.reason).toBe('preferred')
  })

  it('falls back to the first valid note when the default note is unavailable', () => {
    const state = createImportedState()
    const importedDomain = state.domains.find((candidate) => candidate.id === importedLocation.domainId)!
    const withoutDefault = {
      ...state,
      activeDomainId: importedDomain.id,
      activeSpaceId: importedDomain.activeSpaceId,
      spaces: importedDomain.spaces,
      domains: [importedDomain],
    }

    const selection = getSafeNoteSelection(withoutDefault, {
      excludedLocation: importedLocation,
    })

    expect(selection?.location).toEqual({
      domainId: importedLocation.domainId,
      spaceId: importedLocation.spaceId,
      tabId: importedLocation.tabId,
      subTabId: null,
    })
    expect(selection?.reason).toBe('first-valid')
  })

  it('clears the active subtab when selecting the safe parent note', () => {
    const state = createImportedState()
    const safeLocation = getSafeNoteSelection(state, { excludedLocation: importedLocation })!.location
    const defaultDomain = state.domains.find((candidate) => candidate.id === DEFAULT_SAFE_NOTE_LOCATION.domainId)!
    const defaultSpace = defaultDomain.spaces.find((candidate) => candidate.id === DEFAULT_SAFE_NOTE_LOCATION.spaceId)!
    const defaultSubTabId = defaultSpace.data.tabs[0].subTabs[0]?.id ?? null
    const stateWithDefaultSubtab = {
      ...state,
      domains: state.domains.map((candidate) =>
        candidate.id === defaultDomain.id
          ? {
              ...candidate,
              spaces: candidate.spaces.map((candidateSpace) =>
                candidateSpace.id === defaultSpace.id
                  ? {
                      ...candidateSpace,
                      data: {
                        ...candidateSpace.data,
                        tabs: candidateSpace.data.tabs.map((candidateTab) =>
                          candidateTab.id === safeLocation.tabId
                            ? { ...candidateTab, activeSubTabId: defaultSubTabId }
                            : candidateTab,
                        ),
                      },
                    }
                  : candidateSpace,
              ),
            }
          : candidate,
      ),
    }

    const next = selectSafeNoteLocation(stateWithDefaultSubtab, safeLocation)
    const selectedTab = next.spaces
      .find((candidate) => candidate.id === safeLocation.spaceId)
      ?.data.tabs.find((candidate) => candidate.id === safeLocation.tabId)

    expect(next.activeDomainId).toBe(safeLocation.domainId)
    expect(next.activeSpaceId).toBe(safeLocation.spaceId)
    expect(selectedTab?.activeSubTabId).toBeNull()
  })

  it('preserves imported domains while changing the active note selection', () => {
    const state = createImportedState()
    const next = selectSafeNoteLocation(state, DEFAULT_SAFE_NOTE_LOCATION)

    expect(next.domains.some((candidate) => candidate.id === importedLocation.domainId)).toBe(true)
    expect(
      next.domains
        .find((candidate) => candidate.id === importedLocation.domainId)
        ?.spaces.find((candidate) => candidate.id === importedLocation.spaceId)
        ?.data.tabs.find((candidate) => candidate.id === importedLocation.tabId)
        ?.activeSubTabId,
    ).toBe(importedLocation.subTabId)
  })
})
