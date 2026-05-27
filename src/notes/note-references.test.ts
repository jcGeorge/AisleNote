import { describe, expect, it } from 'vitest'
import {
  buildContextToken,
  buildInternalNoteLinkToken,
  parseContextReferences,
  parseContextToken,
  parseWikiReferenceToken,
  normalizeContextReferenceTokensForMarkdown,
  removeContextReferencesForNoteLocationsFromAppState,
  removeContextReferencesForNoteLocationsFromMarkdown,
  removeNoteReferencesForNoteLocationsFromMarkdown,
  removeNoteReferencesForNoteLocationsFromAppState,
  removeContextTokenById,
  resolveWikiReferenceToken,
} from './note-references'
import type { AppState, NoteLocation } from '../types/app'
import type { NoteContextReferencePayload } from './note-references'
import { getAisleMarkdown } from './note-markdown'
import { getHeadingOutlineFromMarkdown } from '../editor/heading-outline'

function targetLocation(tabId = 'parent', subTabId: string | null = null): NoteLocation {
  return {
    domainId: 'domain',
    spaceId: 'space',
    tabId,
    subTabId,
  }
}

function payload(id: string, target: NoteLocation = targetLocation()): NoteContextReferencePayload {
  return {
    id,
    target,
  }
}

function createReferenceState(markdownByBody: Record<string, string> = {}): AppState {
  const bodyIds = ['body-parent', 'body-sub', 'body-retained', 'body-other', 'body-deleted-parent']
  return {
    activeDomainId: 'domain',
    activeSpaceId: 'space',
    domains: [
      {
        id: 'domain',
        name: 'Domain',
        activeSpaceId: 'space',
        spaces: [
          {
            id: 'space',
            name: 'Space',
            settings: { autoRemoveDeletedDays: 30 },
            data: {
              activeTabId: 'parent',
              deletedTabs: [],
              deletedSubTabs: [],
              tabs: [
                {
                  id: 'parent',
                  title: 'Parent tab',
                  noteBodyId: 'body-parent',
                  activeSubTabId: 'sub',
                  subTabs: [
                    { id: 'sub', title: 'Sub note', noteBodyId: 'body-sub' },
                    { id: 'retained-sub', title: 'Retained note', noteBodyId: 'body-retained' },
                  ],
                },
                {
                  id: 'other-parent',
                  title: 'Other parent',
                  noteBodyId: 'body-other',
                  activeSubTabId: null,
                  subTabs: [],
                },
                {
                  id: 'deleted-parent',
                  title: 'Deleted parent',
                  noteBodyId: 'body-deleted-parent',
                  activeSubTabId: null,
                  subTabs: [{ id: 'deleted-sub', title: 'Deleted sub', noteBodyId: 'body-sub' }],
                },
              ],
            },
          },
        ],
      },
    ],
    spaces: [],
    noteBodies: bodyIds.map((bodyId) => ({
      id: bodyId,
      aisles: [{ id: `${bodyId}-aisle`, aisleBodyId: `${bodyId}-aisle-body` }],
    })),
    noteAisleBodies: bodyIds.map((bodyId) => ({
      id: `${bodyId}-aisle-body`,
      markdown: markdownByBody[bodyId] ?? `${bodyId} text`,
    })),
    ui: {},
  } as unknown as AppState
}

describe('note context references', () => {
  it('builds and resolves wiki note links with optional heading anchors', () => {
    const state = createReferenceState({ 'body-sub': '# Intro\n\nBody' })
    const heading = getHeadingOutlineFromMarkdown('body-sub-aisle', '# Intro\n\nBody')[0]
    const target = {
      ...targetLocation('parent', 'sub'),
      heading: { aisleId: heading.aisleId, headingKey: heading.key },
    }
    const href = buildInternalNoteLinkToken(state, target)

    expect(href).toMatch(/^\[\[Sub note--[0-9a-f]{6}#Intro--[0-9a-f]{6}\]\]$/)
    expect(resolveWikiReferenceToken(state, href)?.target).toEqual(target)
    expect(parseWikiReferenceToken('[old](#tabs-note/body-1?domainId=domain&spaceId=space&tabId=parent)')).toBeNull()
  })

  it('builds aliases only for custom note link labels', () => {
    const state = createReferenceState()

    expect(buildInternalNoteLinkToken(state, targetLocation('parent', 'sub'))).toMatch(/^\[\[Sub note--[0-9a-f]{6}\]\]$/)
    expect(buildInternalNoteLinkToken(state, targetLocation('parent', 'sub'), 'see me')).toMatch(
      /^\[\[Sub note--[0-9a-f]{6}\|see me\]\]$/,
    )
  })

  it('builds aisle-specific links that navigate to the aisle', () => {
    const state = createReferenceState()
    const aisleId = 'body-sub-aisle'
    const href = buildInternalNoteLinkToken(state, { ...targetLocation('parent', 'sub'), aisleIds: [aisleId] }, 'aisle 1')
    const resolved = resolveWikiReferenceToken(state, href)

    expect(href).toMatch(/^\[\[Sub note--[0-9a-f]{6}#aisle 1--[0-9a-f]{6}\|aisle 1\]\]$/)
    expect(resolved?.payload.aisleIds).toEqual([aisleId])
    expect(resolved?.target).toMatchObject({ ...targetLocation('parent', 'sub'), aisleId })
  })

  it('normalizes stale wiki handle names by stable short hash suffixes', () => {
    const state = createReferenceState()
    const currentLink = buildInternalNoteLinkToken(state, targetLocation('parent', 'sub'))
    const staleLink = currentLink.replace('Sub note--', 'Old sub name--')
    const currentPreview = buildContextToken(state, payload('preview', targetLocation('parent', null)))
    const stalePreview = currentPreview.replace('Parent tab--', 'Old parent name--')

    expect(normalizeContextReferenceTokensForMarkdown(`${staleLink}\n${stalePreview}`, state)).toBe(
      `${currentLink}\n${currentPreview}`,
    )
    expect(currentPreview).toMatch(/^!\[\[Parent tab--[0-9a-f]{6}\]\]$/)
  })

  it('round-trips wiki preview payload heading anchors', () => {
    const state = createReferenceState({ 'body-sub': '# Intro\n\nBody' })
    const heading = getHeadingOutlineFromMarkdown('body-sub-aisle', '# Intro\n\nBody')[0]
    const previewPayload = {
      ...payload('anchored', targetLocation('parent', 'sub')),
      heading: { aisleId: heading.aisleId, headingKey: heading.key },
    }
    const token = buildContextToken(state, previewPayload)

    expect(token).toMatch(/^!\[\[Sub note--[0-9a-f]{6}#Intro--[0-9a-f]{6}\]\]$/)
    expect(parseContextToken(token, state)?.heading).toEqual(heading ? { aisleId: heading.aisleId, headingKey: heading.key } : undefined)
    expect(parseContextReferences(token, state)[0]?.payload.heading).toEqual({ aisleId: heading.aisleId, headingKey: heading.key })
  })

  it('round-trips wiki preview and note-link last-position starts', () => {
    const state = createReferenceState()
    const previewPayload = {
      ...payload('last-position', targetLocation('parent', 'sub')),
      previewStart: 'last-position' as const,
    }
    const token = buildContextToken(state, previewPayload)
    const link = buildInternalNoteLinkToken(state, { ...targetLocation('parent', 'sub'), startAt: 'last-position' })
    const staleToken = token.replace('#last position', '#LAST   POSITION')

    expect(token).toMatch(/^!\[\[Sub note--[0-9a-f]{6}#last position\]\]$/)
    expect(link).toMatch(/^\[\[Sub note--[0-9a-f]{6}#last position\]\]$/)
    expect(parseContextToken(token, state)).toMatchObject({
      target: previewPayload.target,
      previewStart: 'last-position',
    })
    expect(resolveWikiReferenceToken(state, link)?.target).toMatchObject({
      ...targetLocation('parent', 'sub'),
      startAt: 'last-position',
    })
    expect(resolveWikiReferenceToken(state, token)?.canonicalToken).toBe(token)
    expect(resolveWikiReferenceToken(state, staleToken)?.canonicalToken).toBe(token)
    expect(resolveWikiReferenceToken(state, token.slice(1))?.target.startAt).toBe('last-position')
  })

  it('does not parse old encoded or directive context preview tokens', () => {
    const state = createReferenceState()

    expect(parseContextReferences('{{tabs-context:abc}}', state)).toEqual([])
    expect(parseContextToken('{{tabs-preview label="x" id="y"}}', state)).toBeNull()
  })

  it('removes only the matching context token id', () => {
    const state = createReferenceState()
    const first = buildContextToken(state, payload('first', targetLocation('parent', 'sub')))
    const second = buildContextToken(state, payload('second', targetLocation('other-parent', null)))
    const firstId = parseContextToken(first, state)?.id ?? ''
    const markdown = `before\n${first}\nmiddle\n${second}\nafter`

    expect(removeContextTokenById(markdown, state, firstId)).toBe(`before\n\nmiddle\n${second}\nafter`)
  })

  it('removes context references for deleted sub-tabs without touching other previews or external links', () => {
    const state = createReferenceState()
    const deleted = targetLocation('deleted-parent', 'deleted-sub')
    const retained = targetLocation('parent', 'retained-sub')
    const deletedToken = buildContextToken(state, payload('deleted', deleted))
    const retainedToken = buildContextToken(state, payload('retained', retained))
    const markdown = [
      'before',
      deletedToken,
      retainedToken,
      '[normal link](https://example.com)',
      'after',
    ].join('\n')

    expect(removeContextReferencesForNoteLocationsFromMarkdown(markdown, state, [deleted])).toBe(
      [
        'before',
        '',
        retainedToken,
        '[normal link](https://example.com)',
        'after',
      ].join('\n'),
    )
  })

  it('removes context references across multiple note bodies and aisles', () => {
    const state = createReferenceState()
    const deletedParent = targetLocation('deleted-parent', null)
    const deletedSubTab = targetLocation('deleted-parent', 'deleted-sub')
    const retained = targetLocation('other-parent', null)
    const parentToken = buildContextToken(state, payload('parent', deletedParent))
    const subTabToken = buildContextToken(state, payload('subtab', deletedSubTab))
    const retainedToken = buildContextToken(state, payload('retained', retained))
    state.noteAisleBodies = [
      { id: 'body-parent-aisle-body', markdown: `a\n${parentToken}` },
      { id: 'body-retained-aisle-body', markdown: `${retainedToken}\nb` },
      { id: 'body-sub-aisle-body', markdown: `${subTabToken}\nc` },
      { id: 'body-other-aisle-body', markdown: '' },
      { id: 'body-deleted-parent-aisle-body', markdown: '' },
    ]

    const next = removeContextReferencesForNoteLocationsFromAppState(state, [deletedParent, deletedSubTab])

    expect(getAisleMarkdown(next.noteBodies[0].aisles[0], next.noteAisleBodies)).toBe('a\n')
    expect(getAisleMarkdown(next.noteBodies[2].aisles[0], next.noteAisleBodies)).toBe(`${retainedToken}\nb`)
    expect(getAisleMarkdown(next.noteBodies[1].aisles[0], next.noteAisleBodies)).toBe('\nc')
  })

  it('removes note links and previews for deleted note locations using a pre-delete resolver state', () => {
    const resolverState = createReferenceState()
    const deleted = targetLocation('parent', 'sub')
    const retained = targetLocation('parent', 'retained-sub')
    const deletedLink = buildInternalNoteLinkToken(resolverState, deleted)
    const deletedPreview = buildContextToken(resolverState, payload('deleted', deleted))
    const retainedLink = buildInternalNoteLinkToken(resolverState, retained)
    const markdown = `${deletedLink}\n${deletedPreview}\n${retainedLink}\n[external](https://example.com)\n[[missing--abc123]]`
    const sourceState = createReferenceState()
    sourceState.domains[0].spaces[0].data.tabs[0].subTabs = sourceState.domains[0].spaces[0].data.tabs[0].subTabs.filter(
      (subTab) => subTab.id !== 'sub',
    )

    expect(removeNoteReferencesForNoteLocationsFromMarkdown(markdown, sourceState, [deleted], resolverState)).toBe(
      `\n\n${retainedLink}\n[external](https://example.com)\n[[missing--abc123]]`,
    )
  })

  it('removes note links and previews across app state', () => {
    const state = createReferenceState()
    const deleted = targetLocation('parent', 'sub')
    const deletedLink = buildInternalNoteLinkToken(state, deleted)
    const deletedPreview = buildContextToken(state, payload('deleted', deleted))
    state.noteAisleBodies = [
      { id: 'body-parent-aisle-body', markdown: `${deletedLink}\n${deletedPreview}` },
      { id: 'body-sub-aisle-body', markdown: 'target' },
      { id: 'body-retained-aisle-body', markdown: '' },
      { id: 'body-other-aisle-body', markdown: '' },
      { id: 'body-deleted-parent-aisle-body', markdown: '' },
    ]

    const next = removeNoteReferencesForNoteLocationsFromAppState(state, [deleted], state)

    expect(getAisleMarkdown(next.noteBodies[0].aisles[0], next.noteAisleBodies)).toBe('\n')
  })
})
