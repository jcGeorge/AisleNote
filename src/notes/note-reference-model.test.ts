import { describe, expect, it } from 'vitest'
import type { AppState, Domain, NoteLocation, Space } from '../types/app'
import { getHeadingOutlineFromMarkdown } from '../editor/heading-outline'
import { buildPreviewToken, parsePreviewToken } from './note-references'
import {
  buildDefaultNoteReferenceDraft,
  buildExternalLinkEditDraft,
  buildInternalNoteLinkEditDraft,
  buildUrlLinkShortcutDraft,
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

  it('uses default labels and wiki syntax for local, same-space, and cross-space note links', () => {
    const state = createReferenceState()
    const sameTab = getNoteReferenceLinkSpec(state, source, { ...source, subTabId: 'sub-b' })
    const sameSpace = getNoteReferenceLinkSpec(state, source, { domainId: 'domain-a', spaceId: 'space-a', tabId: 'tab-b', subTabId: null })
    const crossSpace = getNoteReferenceLinkSpec(state, source, { domainId: 'domain-b', spaceId: 'space-c', tabId: 'tab-d', subTabId: null })

    expect(sameTab).toMatchObject({ ok: true, label: 'Beta sub' })
    expect(sameSpace).toMatchObject({ ok: true, label: 'Beta prime > home' })
    expect(crossSpace).toMatchObject({ ok: true, label: 'Gamma space > Elsewhere > home' })
    if (!sameTab.ok || !sameSpace.ok || !crossSpace.ok) throw new Error('expected valid link specs')
    expect(sameTab.href).toMatch(/^\[\[Beta sub--[0-9a-f]{6}\]\]$/)
    expect(sameSpace.href).toMatch(/^\[\[Beta prime--[0-9a-f]{6}\]\]$/)
    expect(crossSpace.href).toMatch(/^\[\[Elsewhere--[0-9a-f]{6}\]\]$/)
    expect(sameSpace.href).not.toContain('#')
    expect(sameSpace.target.startAt).toBe('top')
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
    expect(noHeader.href).not.toContain('#')

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
    expect(anchored.href).toMatch(/^\[\[Beta prime--[0-9a-f]{6}#Details--[0-9a-f]{6}\]\]$/)

    const lastPosition = getNoteReferenceLinkSpec(
      state,
      source,
      {
        domainId: 'domain-a',
        spaceId: 'space-a',
        tabId: 'tab-b',
        subTabId: null,
        previewStart: 'last-position',
      },
    )
    expect(lastPosition.ok).toBe(true)
    if (!lastPosition.ok) throw new Error('expected valid last-position link')
    expect(lastPosition.href).toMatch(/^\[\[Beta prime--[0-9a-f]{6}#last position\]\]$/)
    expect(lastPosition.target.startAt).toBe('last-position')
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
        href: '[[Beta prime--123abc|Linked]]',
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
    expect(getUrlReferenceLinkSpec('example.com', '')).toMatchObject({
      handled: true,
      url: 'https://example.com/',
      label: 'example.com',
    })
    expect(getUrlReferenceLinkSpec('example.com/docs', '')).toMatchObject({
      handled: true,
      url: 'https://example.com/docs',
      label: 'example.com/docs',
    })
    expect(getUrlReferenceLinkSpec('example.net', '')).toMatchObject({
      handled: true,
      url: 'https://example.net/',
      label: 'example.net',
    })
    expect(getUrlReferenceLinkSpec('docs.example.dev/path', '')).toMatchObject({
      handled: true,
      url: 'https://docs.example.dev/path',
      label: 'docs.example.dev/path',
    })
    expect(getUrlReferenceLinkSpec('www.example.org/a', '')).toMatchObject({
      handled: true,
      url: 'https://www.example.org/a',
      label: 'www.example.org/a',
    })
    expect(getUrlReferenceLinkSpec('ftp://example.com', '')).toMatchObject({
      handled: false,
      toast: { message: 'enter a valid web link.', tone: 'warning' },
    })
    expect(getUrlReferenceLinkSpec('not a url', '')).toMatchObject({
      handled: false,
      toast: { message: 'enter a valid web link.', tone: 'warning' },
    })
  })

  it('builds command-k URL drafts from selected text', () => {
    const state = createReferenceState()

    expect(buildUrlLinkShortcutDraft(state, source, '')).toMatchObject({
      mode: 'url',
      insertAs: 'link',
      url: '',
      urlLabel: '',
      urlInitialFocus: 'url',
    })
    expect(buildUrlLinkShortcutDraft(state, source, 'The docs')).toMatchObject({
      mode: 'url',
      url: '',
      urlLabel: 'The docs',
      urlInitialFocus: 'url',
    })
    expect(buildUrlLinkShortcutDraft(state, source, 'The docs', 'context-menu')).toMatchObject({
      mode: 'url',
      sourceKind: 'context-menu',
      url: '',
      urlLabel: 'The docs',
      urlInitialFocus: 'url',
    })
    expect(buildUrlLinkShortcutDraft(state, source, 'example.com/docs')).toMatchObject({
      mode: 'url',
      url: 'example.com/docs',
      urlLabel: '',
      urlInitialFocus: 'label',
    })
    expect(buildUrlLinkShortcutDraft(state, source, 'https://example.com/path')).toMatchObject({
      mode: 'url',
      url: 'https://example.com/path',
      urlLabel: '',
      urlInitialFocus: 'label',
    })
  })

  it('validates preview insertion and serializes wiki embed tokens', () => {
    const state = createReferenceState()
    const preview = getNoteReferencePreviewSpec(
      state,
      'body-sub-a',
      { domainId: 'domain-a', spaceId: 'space-a', tabId: 'tab-b', subTabId: null },
      'preview-id',
    )
    expect(preview.ok).toBe(true)
    if (!preview.ok) throw new Error('expected valid preview')
    expect(preview.token).toMatch(/^!\[\[Beta prime--[0-9a-f]{6}\]\]$/)
    expect(parsePreviewToken(preview.token, state)).toMatchObject({
      target: preview.payload.target,
    })

    const lastPositionPreview = getNoteReferencePreviewSpec(
      state,
      'body-sub-a',
      { domainId: 'domain-a', spaceId: 'space-a', tabId: 'tab-b', subTabId: null, previewStart: 'last-position' },
      'preview-id',
    )
    expect(lastPositionPreview.ok).toBe(true)
    if (!lastPositionPreview.ok) throw new Error('expected valid last-position preview')
    expect(lastPositionPreview.token).toMatch(/^!\[\[Beta prime--[0-9a-f]{6}#last position\]\]$/)
    expect(parsePreviewToken(lastPositionPreview.token, state)).toMatchObject({
      previewStart: 'last-position',
    })
    expect(parsePreviewToken(lastPositionPreview.token, state)?.heading).toBeUndefined()

    expect(getNoteReferencePreviewSpec(state, 'body-sub-a', source)).toEqual({
      ok: false,
      message: 'a note cannot preview itself.',
    })
  })

  it('blocks preview cycles through the shared validation path', () => {
    const cyclicState = createReferenceState()
    const backRef = buildPreviewToken(cyclicState, {
        id: 'back-ref',
        target: { domainId: 'domain-a', spaceId: 'space-b', tabId: 'tab-c', subTabId: null },
    })
    cyclicState.noteAisleBodies = cyclicState.noteAisleBodies?.map((aisleBody) =>
      aisleBody.id === 'body-sub-a-aisle' ? { ...aisleBody, markdown: backRef } : aisleBody,
    )
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
