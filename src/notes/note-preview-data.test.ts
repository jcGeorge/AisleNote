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
      activeSubTabId: null,
      subTabs: [],
    },
  ])
  const domains: Domain[] = [
    { id: 'domain-a', name: 'Domain', activeSpaceId: previewSpace.id, spaces: [previewSpace] },
  ]
  return {
    activeDomainId: 'domain-a',
    activeSpaceId: 'space-a',
    domains,
    spaces: [previewSpace],
    noteBodies: ['source-body', 'target-body'].map((bodyId) => ({
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
    expect(data.displayTitle).toBe('Target > index')
    expect(data.locationLabel).toBe('Domain / Alpha space / Target / index')
    expect(data.previewText).toBe('# Heading\n\nPreview text')
    expect(data.selectedAisles).toHaveLength(1)
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
