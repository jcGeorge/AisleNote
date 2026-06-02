import { describe, expect, it } from 'vitest'
import { parseSavedState } from '../state/app-state'
import { SCRATCHPAD_FIND_LOCATION } from '../notes/find-replace'
import {
  appendTagFilterCount,
  buildTagFilterIndex,
  getFirstMatchingLocationForDomain,
  getFirstMatchingLocationForParent,
  getFirstMatchingLocationForSpace,
  getPrimaryTagOccurrencesForLocation,
  getTagFilterCountLabel,
  getTagFilterParentKey,
  getTagFilterSpaceKey,
  sortTagFilterTags,
} from './tag-filter'

function createState() {
  return parseSavedState(JSON.stringify({
    domains: [
      {
        id: 'domain-a',
        name: 'Domain A',
        activeSpaceId: 'space-a',
        spaces: [
          {
            id: 'space-a',
            name: 'Space A',
            settings: { autoRemoveDeletedDays: 7 },
            data: {
              activeTabId: 'parent-a',
              tabs: [
                {
                  id: 'parent-a',
                  title: 'Parent A',
                  noteBodyId: 'body-home',
                  activeSubTabId: 'sub-a',
                  subTabs: [
                    { id: 'sub-a', title: 'Sub A', noteBodyId: 'body-sub' },
                    { id: 'sub-linked', title: 'Sub Linked', noteBodyId: 'body-home' },
                  ],
                },
              ],
              deletedTabs: [],
              deletedSubTabs: [],
            },
          },
        ],
      },
      {
        id: 'domain-b',
        name: 'Domain B',
        activeSpaceId: 'space-b',
        spaces: [
          {
            id: 'space-b',
            name: 'Space B',
            settings: { autoRemoveDeletedDays: 7 },
            data: {
              activeTabId: 'parent-b',
              tabs: [
                {
                  id: 'parent-b',
                  title: 'Parent B',
                  noteBodyId: 'body-other',
                  activeSubTabId: null,
                  subTabs: [],
                },
              ],
              deletedTabs: [],
              deletedSubTabs: [],
            },
          },
        ],
      },
    ],
    activeDomainId: 'domain-a',
    activeSpaceId: 'space-a',
    spaces: [
      {
        id: 'space-a',
        name: 'Space A',
        settings: { autoRemoveDeletedDays: 7 },
        data: {
          activeTabId: 'parent-a',
          tabs: [
            {
              id: 'parent-a',
              title: 'Parent A',
              noteBodyId: 'body-home',
              activeSubTabId: 'sub-a',
              subTabs: [
                { id: 'sub-a', title: 'Sub A', noteBodyId: 'body-sub' },
                { id: 'sub-linked', title: 'Sub Linked', noteBodyId: 'body-home' },
              ],
            },
          ],
          deletedTabs: [],
          deletedSubTabs: [],
        },
      },
    ],
    noteBodies: [
      {
        id: 'body-home',
        aisles: [{ id: 'aisle-home', aisleBodyId: 'aisle-body-home' }],
      },
      {
        id: 'body-sub',
        aisles: [{ id: 'aisle-sub', aisleBodyId: 'aisle-body-sub' }],
      },
      {
        id: 'body-other',
        aisles: [{ id: 'aisle-other', aisleBodyId: 'aisle-body-other' }],
      },
      {
        id: 'body-scratch',
        aisles: [{ id: 'aisle-scratch', aisleBodyId: 'aisle-body-scratch' }],
      },
    ],
    scratchpad: { noteBodyId: 'body-scratch', activeAisleId: 'aisle-scratch' },
    noteAisleBodies: [
      { id: 'aisle-body-home', markdown: '#Tag #tag home `#Ignored`' },
      { id: 'aisle-body-sub', markdown: 'sub #Other #Tag' },
      { id: 'aisle-body-other', markdown: 'other #other' },
      { id: 'aisle-body-scratch', markdown: 'scratch #Tag #Scratch' },
    ],
  }))
}

describe('tag filter index', () => {
  it('counts visible occurrences, preserves first casing, and ignores code', () => {
    const index = buildTagFilterIndex(createState(), ['tag'])

    expect(index.availableTags).toEqual([
      { key: 'other', label: 'Other', count: 2 },
      { key: 'scratch', label: 'Scratch', count: 1 },
      { key: 'tag', label: 'Tag', count: 6 },
    ])
    expect(index.selectedOccurrences).toHaveLength(6)
    expect(index.domainCounts.get('domain-a')).toBe(5)
    expect(index.domainCounts.get('domain-b')).toBeUndefined()
    expect(index.spaceCounts.get(getTagFilterSpaceKey('domain-a', 'space-a'))).toBe(5)
    expect(index.parentCounts.get(getTagFilterParentKey('domain-a', 'space-a', 'parent-a'))).toBe(5)
    expect(index.scratchpadCount).toBe(1)
  })

  it('counts linked duplicate note bodies per visible location', () => {
    const index = buildTagFilterIndex(createState(), ['tag'])

    expect(index.noteCounts.get('domain-a::space-a::parent-a::__home__')).toBe(2)
    expect(index.noteCounts.get('domain-a::space-a::parent-a::sub-linked')).toBe(2)
  })

  it('matches any selected tag and exposes first matching descendants in rail order', () => {
    const index = buildTagFilterIndex(createState(), ['other', 'tag'])

    expect(index.domainCounts.get('domain-a')).toBe(6)
    expect(index.domainCounts.get('domain-b')).toBe(1)
    expect(getFirstMatchingLocationForDomain(index, 'domain-a')).toEqual({
      domainId: 'domain-a',
      spaceId: 'space-a',
      tabId: 'parent-a',
      subTabId: null,
    })
    expect(getFirstMatchingLocationForSpace(index, 'domain-a', 'space-a')).toEqual({
      domainId: 'domain-a',
      spaceId: 'space-a',
      tabId: 'parent-a',
      subTabId: null,
    })
    expect(getFirstMatchingLocationForParent(index, 'domain-a', 'space-a', 'parent-a')).toEqual({
      domainId: 'domain-a',
      spaceId: 'space-a',
      tabId: 'parent-a',
      subTabId: null,
    })
  })

  it('returns primary tag occurrences independently from selected tag counts', () => {
    const index = buildTagFilterIndex(createState(), ['other', 'tag'])
    const subLocation = { domainId: 'domain-a', spaceId: 'space-a', tabId: 'parent-a', subTabId: 'sub-a' }

    expect(index.noteCounts.get('domain-a::space-a::parent-a::sub-a')).toBe(2)
    expect(getPrimaryTagOccurrencesForLocation(index, subLocation)).toHaveLength(1)
    expect(getPrimaryTagOccurrencesForLocation(index, SCRATCHPAD_FIND_LOCATION)).toHaveLength(0)
  })

  it('tracks repeated primary tag ordinals within an aisle', () => {
    const state = createState()
    const nextState = {
      ...state,
      noteAisleBodies: (state.noteAisleBodies ?? []).map((body) =>
        body.id === 'aisle-body-home'
          ? { ...body, markdown: '#asdf\n\n#asdf\nyup' }
          : body,
      ),
    }
    const index = buildTagFilterIndex(nextState, ['asdf'])
    const occurrences = getPrimaryTagOccurrencesForLocation(index, {
      domainId: 'domain-a',
      spaceId: 'space-a',
      tabId: 'parent-a',
      subTabId: null,
    })

    expect(occurrences.map((occurrence) => occurrence.tagOrdinalInAisle)).toEqual([0, 1])
    expect(occurrences.map((occurrence) => occurrence.text)).toEqual(['#asdf', '#asdf'])
  })

  it('sorts and formats tag counts', () => {
    const tags = [
      { key: 'beta', label: 'Beta', count: 2 },
      { key: 'alpha', label: 'alpha', count: 5 },
      { key: 'aardvark', label: 'Aardvark', count: 5 },
    ]

    expect(sortTagFilterTags(tags, 'az').map((tag) => tag.key)).toEqual(['aardvark', 'alpha', 'beta'])
    expect(sortTagFilterTags(tags, 'occurrences').map((tag) => tag.key)).toEqual(['aardvark', 'alpha', 'beta'])
    expect(getTagFilterCountLabel(100)).toBe('>99')
    expect(appendTagFilterCount('home', 101)).toBe('home (>99)')
    expect(appendTagFilterCount('home', 0)).toBe('home')
  })
})
