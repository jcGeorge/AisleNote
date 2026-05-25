import { describe, expect, it } from 'vitest'
import type { AppState, Domain, NoteLocation, Space } from '../types/app'
import { getHeadingOutlineFromMarkdown } from '../editor/heading-outline'
import { buildContextToken, decodeContextPayload } from './note-references'
import {
  buildDefaultNoteReferenceDraft,
  buildExternalLinkEditDraft,
  buildInternalNoteLinkEditDraft,
  getNoteReferenceLinkSpec,
  getNoteReferencePreviewSpec,
  getUrlReferenceLinkSpec,
} from './note-reference-model'

function space(id: string, name: string, activeTabId: string, tabs: Space['data']['tabs']): Space {
  return {
    id,
    name,
    settings: { autoRemoveDeletedDays: 30 },
    data: {
      activeTabId,
      tabs,
      deletedTabs: [],
      deletedSubTabs: [],
    },
  }
}

function createReferenceState(markdownByBody: Record<string, string> = {}): AppState {
  const activeSpace = space('space-a', 'Alpha space', 'tab-a', [
    {
      id: 'tab-a',
      title: 'Alpha prime',
      noteBodyId: 'body-a',
      activeSubTabId: 'sub-a',
      subTabs: [
        { id: 'sub-a', title: 'Alpha sub', noteBodyId: 'body-sub-a'},
        { id: 'sub-b', title: 'Beta sub', noteBodyId: 'body-sub-b'},
      ],
    },
    {
      id: 'tab-b',
      title: 'Beta prime',
      noteBodyId: 'body-b',
      activeSubTabId: null,
      subTabs: [],
    },
  ])
  const otherSpace = space('space-b', 'Beta space', 'tab-c', [
    {
      id: 'tab-c',
      title: 'Codex',
      noteBodyId: 'body-c',
      activeSubTabId: null,
      subTabs: [],
    },
  ])
  const otherDomainSpace = space('space-c', 'Gamma space', 'tab-d', [
    {
      id: 'tab-d',
      title: 'Elsewhere',
      noteBodyId: 'body-d',
      activeSubTabId: null,
      subTabs: [],
    },
  ])
  const domains: Domain[] = [
    { id: 'domain-a', name: 'Humble beginnings', activeSpaceId: activeSpace.id, spaces: [activeSpace, otherSpace] },
    { id: 'domain-b', name: 'Other domain', activeSpaceId: otherDomainSpace.id, spaces: [otherDomainSpace] },
  ]
  const bodyIds = ['body-a', 'body-sub-a', 'body-sub-b', 'body-b', 'body-c', 'body-d']
  return {
    activeDomainId: 'domain-a',
    activeSpaceId: activeSpace.id,
    domains,
    spaces: [activeSpace, otherSpace],
    noteBodies: bodyIds.map((bodyId) => ({
      id: bodyId,
      aisles: [{ id: `${bodyId}-aisle`, aisleBodyId: `${bodyId}-aisle` }],
    })),
    noteAisleBodies: bodyIds.map((bodyId) => ({
      id: `${bodyId}-aisle`,
      markdown: markdownByBody[bodyId] ?? `${bodyId} text`,
    })),
    ui: { lastLinkInsertMode: 'note' },
  } as unknown as AppState
}

describe('note reference model', () => {
  const source: NoteLocation = {
    domainId: 'domain-a',
    spaceId: 'space-a',
    tabId: 'tab-a',
    subTabId: 'sub-a',
  }

  it('uses the same default labels and href builder for local, same-space, and cross-space note links', () => {
    const state = createReferenceState()
    const sameTab = getNoteReferenceLinkSpec(state, source, { ...source, subTabId: 'sub-b' })
    const sameSpace = getNoteReferenceLinkSpec(state, source, { domainId: 'domain-a', spaceId: 'space-a', tabId: 'tab-b', subTabId: null })
    const crossSpace = getNoteReferenceLinkSpec(state, source, { domainId: 'domain-b', spaceId: 'space-c', tabId: 'tab-d', subTabId: null })

    expect(sameTab).toMatchObject({ ok: true, label: 'Beta sub' })
    expect(sameSpace).toMatchObject({ ok: true, label: 'Beta prime > home' })
    expect(crossSpace).toMatchObject({ ok: true, label: 'Gamma space > Elsewhere > home' })
    if (!sameTab.ok || !sameSpace.ok || !crossSpace.ok) throw new Error('expected valid link specs')
    expect(sameTab.href).toContain('#tabs-note/body-sub-b?')
    expect(sameSpace.href).toContain('#tabs-note/body-b?')
    expect(crossSpace.href).toContain('#tabs-note/body-d?')
    expect(sameSpace.href).not.toContain('aisleId=')
    expect(sameSpace.href).not.toContain('headingKey=')
  })

  it('keeps @-style no-heading links unanchored and serializes edited heading anchors', () => {
    const state = createReferenceState({ 'body-b': '# Overview\n\n## Details' })
    const noHeader = getNoteReferenceLinkSpec(
      state,
      source,
      { domainId: 'domain-a', spaceId: 'space-a', tabId: 'tab-b', subTabId: null },
    )
    expect(noHeader.ok).toBe(true)
    if (!noHeader.ok) throw new Error('expected valid no-header link')
    expect(noHeader.href).not.toContain('aisleId=')
    expect(noHeader.href).not.toContain('headingKey=')

    const heading = getHeadingOutlineFromMarkdown('body-b-aisle', '# Overview\n\n## Details')[1]
    const anchored = getNoteReferenceLinkSpec(
      state,
      source,
      {
        domainId: 'domain-a',
        spaceId: 'space-a',
        tabId: 'tab-b',
        subTabId: null,
        aisleIds: ['body-b-aisle'],
        heading: { aisleId: heading.aisleId, headingKey: heading.key },
      },
    )
    expect(anchored.ok).toBe(true)
    if (!anchored.ok) throw new Error('expected valid anchored link')
    expect(anchored.href).toContain('aisleId=body-b-aisle')
    expect(anchored.href).toContain(`headingKey=${encodeURIComponent(heading.key)}`)
  })

  it('builds modal defaults and locked edit drafts without duplicating setup in App', () => {
    const state = createReferenceState()
    const defaultDraft = buildDefaultNoteReferenceDraft(state, source, 'note', '', 'toolbar')
    expect(defaultDraft.sourceKind).toBe('toolbar')
    expect(defaultDraft.mode).toBe('note')
    expect(defaultDraft.noteLabel).toBe('Alpha prime')

    expect(buildExternalLinkEditDraft(state, source, 'example.com', 'Example', null)).toMatchObject({
      mode: 'url',
      modeLocked: true,
      url: 'example.com',
      urlLabel: 'Example',
    })
    expect(
      buildInternalNoteLinkEditDraft(state, source, {
        label: 'Linked',
        href: '#tabs-note/body-b?domainId=domain-a&spaceId=space-a&tabId=tab-b',
        target: { domainId: 'domain-a', spaceId: 'space-a', tabId: 'tab-b', subTabId: null },
        from: 0,
        to: 6,
        occurrence: 0,
      }),
    ).toMatchObject({
      mode: 'note',
      modeLocked: true,
      noteLabel: 'Linked',
      noteLabelTouched: true,
    })
  })

  it('normalizes URL link input once for toolbar and context-menu flows', () => {
    expect(getUrlReferenceLinkSpec('example.com/docs', '')).toMatchObject({
      handled: true,
      url: 'https://example.com/docs',
      label: 'example.com/docs',
    })
    expect(getUrlReferenceLinkSpec('not a url', '')).toMatchObject({
      handled: false,
      toast: { message: 'enter a valid web link.', tone: 'warning' },
    })
  })

  it('validates preview insertion and serializes the existing context token format', () => {
    const state = createReferenceState()
    const preview = getNoteReferencePreviewSpec(
      state,
      'body-sub-a',
      { domainId: 'domain-a', spaceId: 'space-a', tabId: 'tab-b', subTabId: null },
      'preview-id',
    )
    expect(preview.ok).toBe(true)
    if (!preview.ok) throw new Error('expected valid preview')
    expect(preview.token).toMatch(/^\{\{tabs-context:/)
    expect(decodeContextPayload(preview.token.replace(/^\{\{tabs-context:|\}\}$/g, ''))).toEqual(preview.payload)

    expect(getNoteReferencePreviewSpec(state, 'body-sub-a', source)).toEqual({
      ok: false,
      message: 'a note cannot preview itself.',
    })
  })

  it('blocks preview cycles through the shared validation path', () => {
    const cyclicState = createReferenceState({
      'body-sub-a': buildContextToken({
        id: 'back-ref',
        target: { domainId: 'domain-a', spaceId: 'space-b', tabId: 'tab-c', subTabId: null },
      }),
    })
    expect(
      getNoteReferencePreviewSpec(
        cyclicState,
        'body-c',
        { domainId: 'domain-a', spaceId: 'space-a', tabId: 'tab-a', subTabId: 'sub-a' },
      ),
    ).toEqual({
      ok: false,
      message: 'note preview blocked to prevent recursion.',
    })
  })
})
