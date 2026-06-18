import { describe, expect, it } from 'vitest'
import type { AppState, NoteLocation } from '../types/app'
import { getHeadingOutlineFromMarkdown } from '../editor/heading-outline'
import {
  buildInternalNoteLinkToken,
  buildPreviewToken,
  parsePreviewReferences,
  parsePreviewToken,
  removeNoteReferencesForNoteLocationsFromMarkdown,
  removePreviewReferencesForNoteLocationsFromMarkdown,
  resolveMarkdownNoteReferenceToken,
} from './note-references'

function createReferenceState(): AppState {
  return {
    theme: 'dark',
    notebook: {
      activeNoteId: 'note-a',
      items: [
        { type: 'note', id: 'note-a', title: 'Alpha', noteBodyId: 'body-a' },
        {
          type: 'folder',
          id: 'folder-work',
          title: 'Work',
          children: [{ type: 'note', id: 'note-b', title: 'Specs', noteBodyId: 'body-b' }],
        },
      ],
      deletedItems: [],
      settings: { autoRemoveDeletedDays: 30 },
    },
    noteBodies: [
      { id: 'body-a', aisles: [{ id: 'aisle-a', aisleBodyId: 'aisle-body-a' }] },
      { id: 'body-b', aisles: [{ id: 'aisle-b', aisleBodyId: 'aisle-body-b' }] },
    ],
    noteAisleBodies: [
      { id: 'aisle-body-a', markdown: 'Alpha text' },
      { id: 'aisle-body-b', markdown: '# Intro\n\nSpecs text' },
    ],
    hotkeys: { shortcuts: {} as AppState['hotkeys']['shortcuts'], newlineShortcuts: { shortcuts: {} as never, menuOperations: [] } },
    frontmatter: { templates: [], settingsTemplateId: '', lastAppliedTemplateId: '' },
    ui: {
      sidebarCollapsed: false,
      sidebarWidth: 280,
      collapsedFolderIds: [],
      tableAddTargetMode: 'active-cell',
      tableDeleteTargetMode: 'active-cell',
      noteFontScale: 1,
      settingsSection: 'data',
      noteCursorLocations: {},
      headingCollapseState: {},
      seenTipIds: [],
      disabledTipIds: [],
    },
  }
}

const specsLocation: NoteLocation = { noteId: 'note-b' }

describe('notebook note references', () => {
  it('builds and resolves markdown note links with noteId targets', () => {
    const state = createReferenceState()
    const token = buildInternalNoteLinkToken(state, specsLocation)
    const resolved = resolveMarkdownNoteReferenceToken(state, token)

    expect(token).toMatch(/^\[Specs\]\(Specs--[0-9a-f]{6}\)$/)
    expect(resolved?.payload.target).toEqual(specsLocation)
    expect(resolved?.target).toMatchObject({ noteId: 'note-b', startAt: 'top' })
  })

  it('round-trips preview tokens with heading anchors', () => {
    const state = createReferenceState()
    const heading = getHeadingOutlineFromMarkdown('aisle-b', '# Intro\n\nSpecs text')[0]
    const payload = {
      id: 'preview:specs',
      target: specsLocation,
      heading: { aisleId: heading.aisleId, headingKey: heading.key },
    }
    const token = buildPreviewToken(state, payload)

    expect(token).toMatch(/^!\[Intro\]\(Specs--[0-9a-f]{6}#Intro--[0-9a-f]{6}\)$/)
    expect(parsePreviewToken(token, state)).toMatchObject({
      target: payload.target,
      heading: payload.heading,
    })
    expect(parsePreviewReferences(`before ${token} after`, state)[0]?.payload).toMatchObject({
      target: payload.target,
      heading: payload.heading,
    })
  })

  it('removes links and previews for deleted notebook note locations', () => {
    const state = createReferenceState()
    const link = buildInternalNoteLinkToken(state, specsLocation)
    const preview = buildPreviewToken(state, { id: 'preview:specs', target: specsLocation })
    const markdown = `${link}\n${preview}\n[external](https://example.com)`

    expect(removeNoteReferencesForNoteLocationsFromMarkdown(markdown, state, [specsLocation])).toBe(
      '\n\n[external](https://example.com)',
    )
    expect(removePreviewReferencesForNoteLocationsFromMarkdown(markdown, state, [specsLocation])).toBe(
      `${link}\n\n[external](https://example.com)`,
    )
  })
})
