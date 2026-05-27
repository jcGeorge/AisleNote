import { describe, expect, it } from 'vitest'
import { getHeadingOutlineFromMarkdown } from '../editor/heading-outline'
import type { AppState, NoteLocation, Space } from '../types/app'
import { getAisleMarkdown } from './note-markdown'
import {
  buildCopyAsPasteCommand,
  buildNoteReferenceCommand,
  getNoteBodyPreviewMarkdowns,
  removeNoteReferencesForDeletedLocations,
} from './note-reference-commands'
import { buildInternalNoteLinkToken, buildPreviewToken, parsePreviewToken } from './note-references'
import { getLocationInfo } from './note-locations'

const sourceLocation: NoteLocation = {
  domainId: 'domain-1',
  spaceId: 'space-1',
  tabId: 'tab-source',
  subTabId: null,
}

const targetLocation: NoteLocation = {
  domainId: 'domain-1',
  spaceId: 'space-1',
  tabId: 'tab-target',
  subTabId: null,
}

const otherLocation: NoteLocation = {
  domainId: 'domain-1',
  spaceId: 'space-1',
  tabId: 'tab-other',
  subTabId: null,
}

function createCommandState(markdownByAisle: Record<string, string> = {}): AppState {
  const space: Space = {
    id: 'space-1',
    name: 'Space',
    settings: { autoRemoveDeletedDays: 30 },
    data: {
      activeTabId: 'tab-target',
      tabs: [
        {
          id: 'tab-source',
          title: 'Source',
          noteBodyId: 'body-source',
          activeSubTabId: null,
          subTabs: [],
        },
        {
          id: 'tab-target',
          title: 'Target',
          noteBodyId: 'body-target',
          activeSubTabId: null,
          subTabs: [],
        },
        {
          id: 'tab-other',
          title: 'Other',
          noteBodyId: 'body-other',
          activeSubTabId: null,
          subTabs: [],
        },
      ],
      deletedTabs: [],
      deletedSubTabs: [],
    },
  }

  return {
    activeDomainId: 'domain-1',
    activeSpaceId: 'space-1',
    domains: [{ id: 'domain-1', name: 'Domain', activeSpaceId: 'space-1', spaces: [space] }],
    spaces: [space],
    noteBodies: [
      {
        id: 'body-source',
        aisles: [
          { id: 'aisle-source-1', aisleBodyId: 'aisle-source-1' },
          { id: 'aisle-source-2', aisleBodyId: 'aisle-source-2' },
        ],
      },
      { id: 'body-target', aisles: [{ id: 'aisle-target-1', aisleBodyId: 'aisle-target-1' }] },
      { id: 'body-other', aisles: [{ id: 'aisle-other-1', aisleBodyId: 'aisle-other-1' }] },
    ],
    noteAisleBodies: [
      {
        id: 'aisle-source-1',
        markdown: markdownByAisle['aisle-source-1'] ?? '# Start\n\nsource one',
        frontmatterStatus: 'none',
      },
      {
        id: 'aisle-source-2',
        markdown: markdownByAisle['aisle-source-2'] ?? 'source two',
        frontmatterStatus: 'none',
      },
      {
        id: 'aisle-target-1',
        markdown: markdownByAisle['aisle-target-1'] ?? 'target text',
        frontmatterStatus: 'none',
      },
      {
        id: 'aisle-other-1',
        markdown: markdownByAisle['aisle-other-1'] ?? 'other text',
        frontmatterStatus: 'none',
      },
    ],
    ui: {},
  } as unknown as AppState
}

describe('note reference commands', () => {
  it('builds the same note-link syntax for direct and copy-as reference paths', () => {
    const state = createCommandState()
    const command = buildNoteReferenceCommand({
      appState: state,
      source: targetLocation,
      target: sourceLocation,
      action: 'link',
    })
    const copyAs = buildCopyAsPasteCommand({
      appState: state,
      destination: targetLocation,
      payload: { version: 1, scope: 'note', action: 'link', source: sourceLocation },
    })

    expect(command).toMatchObject({ ok: true })
    expect(copyAs).toMatchObject({ status: 'reference' })
    if (!command.ok || copyAs.status !== 'reference') throw new Error('expected link command results')
    expect(command.insertText).toMatch(/^\[\[Source--[0-9a-f]{6}\]\]$/)
    expect(copyAs.text).toBe(command.insertText)
  })

  it('builds aisle-specific links and previews through copy-as routing', () => {
    const state = createCommandState()
    const link = buildCopyAsPasteCommand({
      appState: state,
      destination: targetLocation,
      payload: {
        version: 1,
        scope: 'aisle',
        action: 'link',
        source: sourceLocation,
        aisleId: 'aisle-source-2',
      },
    })
    const preview = buildCopyAsPasteCommand({
      appState: state,
      destination: targetLocation,
      activeNoteBodyId: 'body-target',
      previewMarkdowns: getNoteBodyPreviewMarkdowns(state, 'body-target'),
      payload: {
        version: 1,
        scope: 'aisle',
        action: 'preview',
        source: sourceLocation,
        aisleId: 'aisle-source-2',
      },
    })

    expect(link).toMatchObject({ status: 'reference' })
    expect(preview).toMatchObject({ status: 'reference' })
    if (link.status !== 'reference' || preview.status !== 'reference') {
      throw new Error('expected reference command results')
    }
    expect(link.text).toMatch(/^\[\[Source--[0-9a-f]{6}#aisle 2--[0-9a-f]{6}\|aisle 2\]\]$/)
    expect(preview.text).toMatch(/^\n\n!\[\[Source--[0-9a-f]{6}#aisle 2--[0-9a-f]{6}\]\]\n\n$/)
  })

  it('normalizes top, last-position, and heading targets from one command path', () => {
    const state = createCommandState({ 'aisle-source-1': '# Start\n\n## Details' })
    const heading = getHeadingOutlineFromMarkdown('aisle-source-1', '# Start\n\n## Details')[1]

    const top = buildNoteReferenceCommand({
      appState: state,
      source: targetLocation,
      target: sourceLocation,
      action: 'link',
    })
    const lastPosition = buildNoteReferenceCommand({
      appState: state,
      source: targetLocation,
      target: { ...sourceLocation, previewStart: 'last-position' },
      action: 'link',
    })
    const anchored = buildNoteReferenceCommand({
      appState: state,
      source: targetLocation,
      target: {
        ...sourceLocation,
        aisleIds: ['aisle-source-1'],
        heading: { aisleId: heading.aisleId, headingKey: heading.key },
      },
      action: 'preview',
      activeNoteBodyId: 'body-target',
    })

    expect(top).toMatchObject({ ok: true })
    expect(lastPosition).toMatchObject({ ok: true })
    expect(anchored).toMatchObject({ ok: true })
    if (!top.ok || !lastPosition.ok || !anchored.ok) throw new Error('expected target command results')
    expect(top.syntax).toMatch(/^\[\[Source--[0-9a-f]{6}\]\]$/)
    expect(lastPosition.syntax).toMatch(/^\[\[Source--[0-9a-f]{6}#last position\]\]$/)
    expect(anchored.syntax).toMatch(/^!\[\[Source--[0-9a-f]{6}#Details--[0-9a-f]{6}\]\]$/)
  })

  it('blocks stale, recursive, self, duplicate, and invalid whole-note preview commands', () => {
    const state = createCommandState()
    const duplicate = buildPreviewToken(state, { id: 'existing', target: otherLocation })
    const sourcePreviewingTarget = buildPreviewToken(state, { id: 'cycle', target: targetLocation })
    const cycleState = createCommandState({ 'aisle-source-1': sourcePreviewingTarget })

    expect(
      buildNoteReferenceCommand({
        appState: state,
        source: targetLocation,
        target: { ...targetLocation, tabId: 'missing' },
        action: 'link',
      }),
    ).toEqual({ ok: false, message: 'choose an existing note.' })
    expect(
      buildNoteReferenceCommand({
        appState: state,
        source: sourceLocation,
        target: sourceLocation,
        action: 'preview',
        activeNoteBodyId: 'body-source',
      }),
    ).toEqual({ ok: false, message: 'a note cannot preview itself.' })
    expect(
      buildNoteReferenceCommand({
        appState: cycleState,
        source: targetLocation,
        target: sourceLocation,
        action: 'preview',
        activeNoteBodyId: 'body-target',
      }),
    ).toEqual({ ok: false, message: 'note preview blocked to prevent recursion.' })
    expect(
      buildNoteReferenceCommand({
        appState: state,
        source: targetLocation,
        target: otherLocation,
        action: 'preview',
        activeNoteBodyId: 'body-target',
        previewMarkdowns: [duplicate],
      }),
    ).toEqual({ ok: false, message: 'that note preview already exists in this note.' })
    expect(
      buildCopyAsPasteCommand({
        appState: state,
        destination: targetLocation,
        activeNoteBodyId: 'body-target',
        payload: { version: 1, scope: 'note', action: 'preview', source: sourceLocation },
      }),
    ).toEqual({
      status: 'blocked',
      message: 'copy a specific aisle as preview for notes with multiple aisles.',
      tone: 'warning',
    })
  })

  it('excludes the edited preview token from duplicate checks', () => {
    const state = createCommandState()
    const existing = buildPreviewToken(state, { id: 'existing', target: otherLocation })
    const existingId = parsePreviewToken(existing, state)?.id ?? ''

    const command = buildNoteReferenceCommand({
      appState: state,
      source: targetLocation,
      target: otherLocation,
      action: 'preview',
      activeNoteBodyId: 'body-target',
      editingTokenId: existingId,
      previewMarkdowns: [existing],
    })

    expect(command).toMatchObject({ ok: true })
  })

  it('routes copy-as structural actions through the copy service', () => {
    const state = createCommandState()
    const independent = buildCopyAsPasteCommand({
      appState: state,
      destination: targetLocation,
      payload: { version: 1, scope: 'note', action: 'copy', source: sourceLocation },
    })
    const synced = buildCopyAsPasteCommand({
      appState: state,
      destination: targetLocation,
      payload: { version: 1, scope: 'note', action: 'duplicate', source: sourceLocation },
    })

    expect(independent).toMatchObject({ status: 'structural', toast: { message: 'independent note copy created.' } })
    expect(synced).toMatchObject({ status: 'structural', toast: { message: 'synced note copy created.' } })
    if (independent.status !== 'structural' || synced.status !== 'structural') {
      throw new Error('expected structural command results')
    }
    const independentBodyId = getLocationInfo(independent.state, targetLocation).noteBodyId
    const independentBody = independent.state.noteBodies.find((body) => body.id === independentBodyId)
    expect(independentBodyId).not.toBe('body-source')
    expect(independentBody?.aisles.map((aisle) => getAisleMarkdown(aisle, independent.state.noteAisleBodies))).toEqual([
      '# Start\n\nsource one',
      'source two',
    ])
    expect(getLocationInfo(synced.state, targetLocation).noteBodyId).toBe('body-source')
  })

  it('removes note links and previews for deleted locations through the cleanup boundary', () => {
    const resolverState = createCommandState()
    const sourceLink = buildInternalNoteLinkToken(resolverState, sourceLocation)
    const sourcePreview = buildPreviewToken(resolverState, { id: 'deleted', target: sourceLocation })
    const otherLink = buildInternalNoteLinkToken(resolverState, otherLocation)
    const sourceState = createCommandState({
      'aisle-target-1': `${sourceLink}\n${sourcePreview}\n${otherLink}`,
    })

    const next = removeNoteReferencesForDeletedLocations(sourceState, [sourceLocation], resolverState)

    expect(getAisleMarkdown(next.noteBodies[1].aisles[0], next.noteAisleBodies)).toBe(`\n\n${otherLink}`)
  })
})
