import { describe, expect, it } from 'vitest'
import type { AppState } from '../../types/app'
import { buildPreviewToken } from '../../notes/note-references'
import { getAislePreviewSegments } from './aisle-markdown-preview-segments'

function createState(): AppState {
  return {
    theme: 'dark',
    notebook: {
      activeNoteId: 'note-a',
      items: [
        { type: 'note', id: 'note-a', title: 'Alpha', noteBodyId: 'body-a' },
        { type: 'note', id: 'note-b', title: 'Beta', noteBodyId: 'body-b' },
      ],
      deletedItems: [],
      settings: { autoRemoveDeletedDays: 30 },
    },
    noteBodies: [
      { id: 'body-a', aisles: [{ id: 'aisle-a', aisleBodyId: 'aisle-body-a' }] },
      { id: 'body-b', aisles: [{ id: 'aisle-b', aisleBodyId: 'aisle-body-b' }] },
    ],
    noteAisleBodies: [
      { id: 'aisle-body-a', markdown: 'Alpha' },
      { id: 'aisle-body-b', markdown: 'Beta body' },
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

describe('aisle markdown preview segments', () => {
  it('splits valid note preview tokens into preview segments when app state is available', () => {
    const state = createState()
    const token = buildPreviewToken(state, { id: 'preview:beta', target: { noteId: 'note-b' } })

    expect(getAislePreviewSegments(`before\n${token}\nafter`, state)).toMatchObject([
      { type: 'markdown', markdown: 'before\n' },
      { type: 'note-preview', payload: { target: { noteId: 'note-b' } } },
      { type: 'markdown', markdown: '\nafter' },
    ])
  })

  it('keeps raw markdown when no app state is supplied', () => {
    expect(getAislePreviewSegments('![Beta](Beta--123abc)')).toEqual([
      { type: 'markdown', markdown: '![Beta](Beta--123abc)' },
    ])
  })

  it('repairs escaped markdown links before preview rendering', () => {
    expect(getAislePreviewSegments(String.raw`\[strike\]\(https://lucide\.dev/icons/strikethrough\)`)).toEqual([
      { type: 'markdown', markdown: '[strike](https://lucide.dev/icons/strikethrough)' },
    ])
  })

  it('splits escaped note preview tokens into preview segments', () => {
    const state = createState()
    const token = buildPreviewToken(state, { id: 'preview:beta', target: { noteId: 'note-b' } })
    const escaped = token
      .replace('!', String.raw`\!`)
      .replaceAll('[', String.raw`\[`)
      .replaceAll(']', String.raw`\]`)
      .replaceAll('(', String.raw`\(`)
      .replaceAll(')', String.raw`\)`)

    expect(getAislePreviewSegments(escaped, state)).toMatchObject([
      { type: 'note-preview', payload: { target: { noteId: 'note-b' } } },
    ])
  })
})
