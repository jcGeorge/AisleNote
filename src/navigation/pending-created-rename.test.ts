import { describe, expect, it } from 'vitest'
import { DEFAULT_STATE } from '../state/app-state'
import { createDomainFromSpaces } from '../state/domains'
import type { AppState, Domain, Space } from '../types/app'
import {
  discardPendingCreatedDomainEdit,
  discardPendingCreatedSpaceEdit,
} from './pending-created-rename'

const makeSpace = (id: string): Space => ({
  id,
  name: id,
  settings: { autoRemoveDeletedDays: 7 },
  data: {
    activeTabId: 'tab-a',
    tabs: [],
    deletedTabs: [],
    deletedSubTabs: [],
  },
})

const makeState = (domains: Domain[], activeDomainId: string, activeSpaceId: string): AppState => ({
  ...DEFAULT_STATE,
  activeDomainId,
  activeSpaceId,
  spaces: domains.find((domain) => domain.id === activeDomainId)?.spaces ?? [],
  domains,
})

describe('pending created rename cancellation', () => {
  it('removes a pending compact/full-page space and restores the previous active space', () => {
    const originalSpace = makeSpace('space-a')
    const createdSpace = makeSpace('space-new')
    const otherSpace = makeSpace('space-b')
    const sourceDomain = createDomainFromSpaces('Domain A', [originalSpace, createdSpace], {
      id: 'domain-a',
      activeSpaceId: createdSpace.id,
    })
    const otherDomain = createDomainFromSpaces('Domain B', [otherSpace], {
      id: 'domain-b',
      activeSpaceId: otherSpace.id,
    })
    const state = makeState([sourceDomain, otherDomain], sourceDomain.id, createdSpace.id)

    const next = discardPendingCreatedSpaceEdit(state, {
      type: 'space',
      id: createdSpace.id,
      sourceDomainId: sourceDomain.id,
      previousActiveSpaceId: originalSpace.id,
    })

    expect(next.activeDomainId).toBe(sourceDomain.id)
    expect(next.activeSpaceId).toBe(originalSpace.id)
    expect(next.spaces.map((space) => space.id)).toEqual([originalSpace.id])
    expect(next.domains.find((domain) => domain.id === sourceDomain.id)?.spaces.map((space) => space.id)).toEqual([
      originalSpace.id,
    ])
  })

  it('removes a pending compact/full-page domain and restores the previous domain and space', () => {
    const originalSpace = makeSpace('space-a')
    const createdSpace = makeSpace('space-new')
    const originalDomain = createDomainFromSpaces('Domain A', [originalSpace], {
      id: 'domain-a',
      activeSpaceId: originalSpace.id,
    })
    const createdDomain = createDomainFromSpaces('domain', [createdSpace], {
      id: 'domain-new',
      activeSpaceId: createdSpace.id,
    })
    const state = makeState([originalDomain, createdDomain], createdDomain.id, createdSpace.id)

    const next = discardPendingCreatedDomainEdit(state, {
      type: 'domain',
      id: createdDomain.id,
      previousActiveDomainId: originalDomain.id,
      previousActiveSpaceId: originalSpace.id,
    })

    expect(next.activeDomainId).toBe(originalDomain.id)
    expect(next.activeSpaceId).toBe(originalSpace.id)
    expect(next.domains.map((domain) => domain.id)).toEqual([originalDomain.id])
    expect(next.spaces.map((space) => space.id)).toEqual([originalSpace.id])
  })
})
