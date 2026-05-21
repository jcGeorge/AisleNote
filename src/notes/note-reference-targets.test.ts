import { describe, expect, it } from 'vitest'
import type { AppState } from '../types/app'
import { normalizeNoteReferenceTarget, resolveNoteReferenceTarget } from './note-reference-targets'

function createReferenceState(): AppState {
  const space = {
    id: 'space',
    name: 'Space',
    settings: { autoRemoveDeletedDays: 30 },
    data: {
      activeTabId: 'tab',
      tabs: [
        {
          id: 'tab',
          title: 'Tab',
          noteBodyId: 'body',
          homeContent: '',
          activeSubTabId: null,
          subTabs: [],
        },
      ],
      deletedTabs: [],
      deletedSubTabs: [],
    },
  }
  return {
    activeDomainId: 'domain',
    activeSpaceId: 'space',
    domains: [
      {
        id: 'domain',
        name: 'Domain',
        activeSpaceId: 'space',
        spaces: [space],
      },
    ],
    spaces: [space],
    noteBodies: [
      {
        id: 'body',
        frontmatter: null,
        aisles: [
          { id: 'aisle-a', markdown: '# Alpha\n\n## Beta' },
          { id: 'aisle-b', markdown: '# Other' },
        ],
      },
    ],
  } as unknown as AppState
}

describe('note reference target helpers', () => {
  const location = { domainId: 'domain', spaceId: 'space', tabId: 'tab', subTabId: null }

  it('defaults to the first aisle and extracts headings from that aisle', () => {
    const resolved = resolveNoteReferenceTarget(createReferenceState(), location)

    expect(resolved.selectedAisle?.id).toBe('aisle-a')
    expect(resolved.target.aisleIds).toEqual(['aisle-a'])
    expect(resolved.headings.map((heading) => heading.text)).toEqual(['Alpha', 'Beta'])
  })

  it('keeps a valid selected heading on the selected aisle', () => {
    const target = normalizeNoteReferenceTarget(createReferenceState(), {
      ...location,
      aisleIds: ['aisle-b'],
      heading: { aisleId: 'aisle-b', headingKey: 'aisle-b|h1|0|Other' },
    })

    expect(target).toMatchObject({
      aisleIds: ['aisle-b'],
      heading: { aisleId: 'aisle-b', headingKey: 'aisle-b|h1|0|Other' },
    })
  })

  it('clears stale heading keys while retaining page-level navigation', () => {
    const target = normalizeNoteReferenceTarget(createReferenceState(), {
      ...location,
      aisleIds: ['aisle-a'],
      heading: { aisleId: 'aisle-a', headingKey: 'missing-heading' },
    })

    expect(target.aisleIds).toEqual(['aisle-a'])
    expect(target.heading).toBeUndefined()
  })
})
