import { describe, expect, it } from 'vitest'
import type { AppState, Domain, Space } from '../types/app'
import { buildPreviewToken } from './note-references'
import { getNotePreviewDataFromState } from './note-preview-data'

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
      activeSubTabId: null,
      subTabs: [],
    },
    {
      id: 'tab-b',
      title: 'Target',
      noteBodyId: 'target-body',
      activeSubTabId: 'sub-b',
      subTabs: [{ id: 'sub-b', title: 'Target child', noteBodyId: 'target-sub-body'}],
    },
  ])
  const crossSpace = space('space-b', 'Beta space', [
    {
      id: 'tab-c',
      title: 'Cross space',
      noteBodyId: 'cross-space-body',
      activeSubTabId: null,
      subTabs: [],
    },
  ])
  const crossDomainSpace = space('space-c', 'Gamma space', [
    {
      id: 'tab-d',
      title: 'Cross domain',
      noteBodyId: 'cross-domain-body',
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
      aisles: [{ id: `${bodyId}-aisle`, aisleBodyId: `${bodyId}-aisle-body` }],
    })),
    noteAisleBodies: bodyIds.map((bodyId) => ({
      id: `${bodyId}-aisle-body`,
      markdown: markdownByBody[bodyId] ?? `${bodyId} text`,
    })),
  } as unknown as AppState
}

describe('note preview data model', () => {
  it('returns ready data with rendered note labels and selected aisle markdown', () => {
    const state = createPreviewState({ 'target-body': '# Heading\n\nPreview text' })
    const data = getNotePreviewDataFromState(
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
    expect(data.selectedAisle?.id).toBe('target-body-aisle')
    expect(data.selectedAisle?.markdown).toBe('# Heading\n\nPreview text')
  })

  it('uses the first valid selected aisle for preview data', () => {
    const state = createPreviewState()
    const targetBody = state.noteBodies.find((body) => body.id === 'target-body')
    if (!targetBody) throw new Error('expected target body')
    targetBody.aisles = [
      { id: 'aisle-a', aisleBodyId: 'aisle-body-a' },
      { id: 'aisle-b', aisleBodyId: 'aisle-body-b' },
      { id: 'aisle-c', aisleBodyId: 'aisle-body-c' },
    ]
    state.noteAisleBodies = [
      ...(state.noteAisleBodies ?? []).filter((body) => !body.id.startsWith('aisle-body-')),
      { id: 'aisle-body-a', markdown: 'first aisle' },
      { id: 'aisle-body-b', markdown: 'second aisle' },
      { id: 'aisle-body-c', markdown: 'third aisle' },
    ]

    const data = getNotePreviewDataFromState(
      state,
      {
        id: 'preview-id',
        target: { domainId: 'domain-a', spaceId: 'space-a', tabId: 'tab-b', subTabId: null },
        aisleIds: ['missing-aisle', 'aisle-b', 'aisle-c'],
      },
      'source-body',
    )

    expect(data.selectedAisle?.id).toBe('aisle-b')
    expect(data.previewText).toBe('second aisle')
  })

  it('falls back to the first aisle when no preview aisle is serialized', () => {
    const state = createPreviewState()
    const targetBody = state.noteBodies.find((body) => body.id === 'target-body')
    if (!targetBody) throw new Error('expected target body')
    targetBody.aisles = [
      { id: 'aisle-a', aisleBodyId: 'aisle-body-a' },
      { id: 'aisle-b', aisleBodyId: 'aisle-body-b' },
    ]
    state.noteAisleBodies = [
      ...(state.noteAisleBodies ?? []).filter((body) => !body.id.startsWith('aisle-body-')),
      { id: 'aisle-body-a', markdown: 'first aisle' },
      { id: 'aisle-body-b', markdown: 'second aisle' },
    ]

    const data = getNotePreviewDataFromState(
      state,
      {
        id: 'preview-id',
        target: { domainId: 'domain-a', spaceId: 'space-a', tabId: 'tab-b', subTabId: null },
      },
      'source-body',
    )

    expect(data.selectedAisle?.id).toBe('aisle-a')
    expect(data.previewText).toBe('first aisle')
  })

  it('uses the saved target-note aisle and cursor for last-position previews', () => {
    const state = createPreviewState()
    const targetBody = state.noteBodies.find((body) => body.id === 'target-body')
    if (!targetBody) throw new Error('expected target body')
    targetBody.aisles = [
      { id: 'aisle-a', aisleBodyId: 'aisle-body-a' },
      { id: 'aisle-b', aisleBodyId: 'aisle-body-b' },
    ]
    state.noteAisleBodies = [
      ...(state.noteAisleBodies ?? []).filter((body) => !body.id.startsWith('aisle-body-')),
      { id: 'aisle-body-a', markdown: 'first aisle' },
      { id: 'aisle-body-b', markdown: 'saved aisle' },
    ]
    state.ui = {
      noteCursorLocations: {
        'domain-a::space-a::tab-b::__home__': {
          activeAisleId: 'aisle-b',
          aisles: {
            'aisle-b': { anchor: 4, head: 11, updatedAt: 99 },
          },
          updatedAt: 99,
        },
      },
    } as unknown as AppState['ui']

    const data = getNotePreviewDataFromState(
      state,
      {
        id: 'preview-id',
        target: { domainId: 'domain-a', spaceId: 'space-a', tabId: 'tab-b', subTabId: null },
        aisleIds: ['aisle-a'],
        previewStart: 'last-position',
      },
      'source-body',
    )

    expect(data.selectedAisle?.id).toBe('aisle-b')
    expect(data.previewText).toBe('saved aisle')
    expect(data.previewCursorSelection).toEqual({ anchor: 4, head: 11, updatedAt: 99 })
  })

  it('falls back to selected or first aisle for last-position previews without a saved cursor', () => {
    const state = createPreviewState()
    const targetBody = state.noteBodies.find((body) => body.id === 'target-body')
    if (!targetBody) throw new Error('expected target body')
    targetBody.aisles = [
      { id: 'aisle-a', aisleBodyId: 'aisle-body-a' },
      { id: 'aisle-b', aisleBodyId: 'aisle-body-b' },
    ]
    state.noteAisleBodies = [
      ...(state.noteAisleBodies ?? []).filter((body) => !body.id.startsWith('aisle-body-')),
      { id: 'aisle-body-a', markdown: 'first aisle' },
      { id: 'aisle-body-b', markdown: 'selected fallback' },
    ]

    const data = getNotePreviewDataFromState(
      state,
      {
        id: 'preview-id',
        target: { domainId: 'domain-a', spaceId: 'space-a', tabId: 'tab-b', subTabId: null },
        aisleIds: ['aisle-b'],
        previewStart: 'last-position',
      },
      'source-body',
    )

    expect(data.selectedAisle?.id).toBe('aisle-b')
    expect(data.previewText).toBe('selected fallback')
    expect(data.previewCursorSelection).toBeNull()
  })

  it('prefers the heading aisle over serialized aisle ids', () => {
    const state = createPreviewState()
    const targetBody = state.noteBodies.find((body) => body.id === 'target-body')
    if (!targetBody) throw new Error('expected target body')
    targetBody.aisles = [
      { id: 'aisle-a', aisleBodyId: 'aisle-body-a' },
      { id: 'aisle-b', aisleBodyId: 'aisle-body-b' },
    ]
    state.noteAisleBodies = [
      ...(state.noteAisleBodies ?? []).filter((body) => !body.id.startsWith('aisle-body-')),
      { id: 'aisle-body-a', markdown: '# First' },
      { id: 'aisle-body-b', markdown: '# Second' },
    ]

    const data = getNotePreviewDataFromState(
      state,
      {
        id: 'preview-id',
        target: { domainId: 'domain-a', spaceId: 'space-a', tabId: 'tab-b', subTabId: null },
        aisleIds: ['aisle-a'],
        heading: { aisleId: 'aisle-b', headingKey: 'aisle-b|h1|0|Second' },
      },
      'source-body',
    )

    expect(data.selectedAisle?.id).toBe('aisle-b')
    expect(data.previewText).toBe('# Second')
  })

  it('builds same-space sub-tab preview title buttons', () => {
    const data = getNotePreviewDataFromState(
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
    const crossSpace = getNotePreviewDataFromState(
      state,
      {
        id: 'preview-id',
        target: { domainId: 'domain-a', spaceId: 'space-b', tabId: 'tab-c', subTabId: null },
      },
      'source-body',
    )
    const crossDomain = getNotePreviewDataFromState(
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
      getNotePreviewDataFromState(
        emptyState,
        {
          id: 'preview-id',
          target: { domainId: 'domain-a', spaceId: 'space-a', tabId: 'tab-b', subTabId: null },
        },
        'source-body',
      ).status,
    ).toBe('empty')

    expect(
      getNotePreviewDataFromState(
        emptyState,
        {
          id: 'preview-id',
          target: { domainId: 'domain-a', spaceId: 'space-a', tabId: 'missing', subTabId: null },
        },
        'source-body',
      ).status,
    ).toBe('missing')

    expect(
      getNotePreviewDataFromState(
        emptyState,
        {
          id: 'preview-id',
          target: { domainId: 'domain-a', spaceId: 'space-a', tabId: 'tab-a', subTabId: null },
        },
        'source-body',
      ).status,
    ).toBe('blocked')

    const cyclicState = createPreviewState()
    const backRef = buildPreviewToken(cyclicState, {
        id: 'back-ref',
        target: { domainId: 'domain-a', spaceId: 'space-a', tabId: 'tab-a', subTabId: null },
    })
    cyclicState.noteAisleBodies = cyclicState.noteAisleBodies?.map((aisleBody) =>
      aisleBody.id === 'target-body-aisle-body' ? { ...aisleBody, markdown: backRef } : aisleBody,
    )
    expect(
      getNotePreviewDataFromState(
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
