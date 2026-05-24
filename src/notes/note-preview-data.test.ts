import { describe, expect, it } from 'vitest'
import type { AppState, Domain, Space } from '../types/app'
import { buildContextToken } from './note-references'
import { getContextPreviewDataFromState } from './note-preview-data'

function space(id: string, name: string, tabs: Space['data']['tabs']): Space {
  return {
    id,
    name,
    settings: { autoRemoveDeletedDays: 30 },
    data: {
      activeTabId: tabs[0]?.id ?? '',
      tabs,
      deletedTabs: [],
      deletedSubTabs: [],
    },
  }
}

function createPreviewState(markdownByBody: Record<string, string> = {}): AppState {
  const previewSpace = space('space-a', 'Alpha space', [
    {
      id: 'tab-a',
      title: 'Source',
      noteBodyId: 'source-body',
      homeContent: '',
      activeSubTabId: null,
      subTabs: [],
    },
    {
      id: 'tab-b',
      title: 'Target',
      noteBodyId: 'target-body',
      homeContent: '',
      activeSubTabId: 'sub-b',
      subTabs: [{ id: 'sub-b', title: 'Target child', noteBodyId: 'target-sub-body', content: '' }],
    },
  ])
  const crossSpace = space('space-b', 'Beta space', [
    {
      id: 'tab-c',
      title: 'Cross space',
      noteBodyId: 'cross-space-body',
      homeContent: '',
      activeSubTabId: null,
      subTabs: [],
    },
  ])
  const crossDomainSpace = space('space-c', 'Gamma space', [
    {
      id: 'tab-d',
      title: 'Cross domain',
      noteBodyId: 'cross-domain-body',
      homeContent: '',
      activeSubTabId: null,
      subTabs: [],
    },
  ])
  const domains: Domain[] = [
    { id: 'domain-a', name: 'Domain', activeSpaceId: previewSpace.id, spaces: [previewSpace, crossSpace] },
    { id: 'domain-b', name: 'Other domain', activeSpaceId: crossDomainSpace.id, spaces: [crossDomainSpace] },
  ]
  const bodyIds = ['source-body', 'target-body', 'target-sub-body', 'cross-space-body', 'cross-domain-body']
  return {
    activeDomainId: 'domain-a',
    activeSpaceId: 'space-a',
    domains,
    spaces: [previewSpace, crossSpace],
    noteBodies: bodyIds.map((bodyId) => ({
      id: bodyId,
      aisles: [{ id: `${bodyId}-aisle`, markdown: markdownByBody[bodyId] ?? `${bodyId} text` }],
    })),
    noteAisleBodies: [],
  } as unknown as AppState
}

describe('note preview data model', () => {
  it('returns ready data with rendered note labels and selected aisle markdown', () => {
    const state = createPreviewState({ 'target-body': '# Heading\n\nPreview text' })
    const data = getContextPreviewDataFromState(
      state,
      {
        id: 'preview-id',
        target: { domainId: 'domain-a', spaceId: 'space-a', tabId: 'tab-b', subTabId: null },
      },
      'source-body',
    )

    expect(data.status).toBe('ready')
    expect(data.locationLabel).toBe('Domain / Alpha space / Target / home')
    expect(data.titleButtons).toEqual([
      { kind: 'parent', label: 'Target' },
      { kind: 'subtab', label: 'home' },
    ])
    expect(data.previewText).toBe('# Heading\n\nPreview text')
    expect(data.selectedAisles).toHaveLength(1)
  })

  it('builds same-space sub-tab preview title buttons', () => {
    const data = getContextPreviewDataFromState(
      createPreviewState(),
      {
        id: 'preview-id',
        target: { domainId: 'domain-a', spaceId: 'space-a', tabId: 'tab-b', subTabId: 'sub-b' },
      },
      'source-body',
    )

    expect(data.locationLabel).toBe('Domain / Alpha space / Target / Target child')
    expect(data.titleButtons).toEqual([
      { kind: 'parent', label: 'Target' },
      { kind: 'subtab', label: 'Target child' },
    ])
  })

  it('adds space and domain preview title buttons only when the target leaves the source scope', () => {
    const state = createPreviewState()
    const crossSpace = getContextPreviewDataFromState(
      state,
      {
        id: 'preview-id',
        target: { domainId: 'domain-a', spaceId: 'space-b', tabId: 'tab-c', subTabId: null },
      },
      'source-body',
    )
    const crossDomain = getContextPreviewDataFromState(
      state,
      {
        id: 'preview-id',
        target: { domainId: 'domain-b', spaceId: 'space-c', tabId: 'tab-d', subTabId: null },
      },
      'source-body',
    )

    expect(crossSpace.titleButtons).toEqual([
      { kind: 'space', label: 'Beta space' },
      { kind: 'parent', label: 'Cross space' },
      { kind: 'subtab', label: 'home' },
    ])
    expect(crossDomain.titleButtons).toEqual([
      { kind: 'domain', label: 'Other domain' },
      { kind: 'space', label: 'Gamma space' },
      { kind: 'parent', label: 'Cross domain' },
      { kind: 'subtab', label: 'home' },
    ])
  })

  it('distinguishes missing, self, empty, and cyclic previews', () => {
    const emptyState = createPreviewState({ 'target-body': '   ' })
    expect(
      getContextPreviewDataFromState(
        emptyState,
        {
          id: 'preview-id',
          target: { domainId: 'domain-a', spaceId: 'space-a', tabId: 'tab-b', subTabId: null },
        },
        'source-body',
      ).status,
    ).toBe('empty')

    expect(
      getContextPreviewDataFromState(
        emptyState,
        {
          id: 'preview-id',
          target: { domainId: 'domain-a', spaceId: 'space-a', tabId: 'missing', subTabId: null },
        },
        'source-body',
      ).status,
    ).toBe('missing')

    expect(
      getContextPreviewDataFromState(
        emptyState,
        {
          id: 'preview-id',
          target: { domainId: 'domain-a', spaceId: 'space-a', tabId: 'tab-a', subTabId: null },
        },
        'source-body',
      ).status,
    ).toBe('blocked')

    const cyclicState = createPreviewState({
      'target-body': buildContextToken({
        id: 'back-ref',
        target: { domainId: 'domain-a', spaceId: 'space-a', tabId: 'tab-a', subTabId: null },
      }),
    })
    expect(
      getContextPreviewDataFromState(
        cyclicState,
        {
          id: 'preview-id',
          target: { domainId: 'domain-a', spaceId: 'space-a', tabId: 'tab-b', subTabId: null },
        },
        'source-body',
      ).status,
    ).toBe('blocked')
  })
})
