import { describe, expect, it } from 'vitest'
import {
  buildContextToken,
  buildInternalNoteUrl,
  decodeContextPayload,
  parseContextReferences,
  parseInternalNoteReferenceUrl,
  parseInternalNoteUrl,
  removeContextReferencesForNoteLocationsFromAppState,
  removeContextReferencesForNoteLocationsFromMarkdown,
  removeContextTokenById,
} from './note-references'
import type { AppState, NoteLocation } from '../types/app'
import type { NoteContextReferencePayload } from './note-references'
import { getAisleMarkdown } from './note-markdown'

function targetLocation(tabId = 'tab', subTabId: string | null = null): NoteLocation {
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

describe('note context references', () => {
  it('builds and parses internal note links with optional heading anchors', () => {
    const target = {
      ...targetLocation('tab', 'sub'),
      heading: { aisleId: 'aisle-1', headingKey: 'aisle-1|h2|0|Subject' },
    }
    const href = buildInternalNoteUrl('body-1', target)

    expect(parseInternalNoteReferenceUrl(href)).toEqual(target)
    expect(parseInternalNoteUrl(href)).toEqual(targetLocation('tab', 'sub'))
  })

  it('parses old internal note links without heading anchors', () => {
    const href = '#tabs-note/body-1?domainId=domain&spaceId=space&tabId=tab'

    expect(parseInternalNoteReferenceUrl(href)).toEqual(targetLocation('tab', null))
  })

  it('round-trips context preview payload heading anchors', () => {
    const token = buildContextToken({
      ...payload('anchored'),
      heading: { aisleId: 'aisle-a', headingKey: 'aisle-a|h1|0|Intro' },
    })
    const encoded = token.match(/\{\{tabs-context:([A-Za-z0-9_-]+)\}\}/)?.[1] ?? ''

    expect(decodeContextPayload(encoded)?.heading).toEqual({ aisleId: 'aisle-a', headingKey: 'aisle-a|h1|0|Intro' })
    expect(parseContextReferences(token)[0]?.payload.heading).toEqual({ aisleId: 'aisle-a', headingKey: 'aisle-a|h1|0|Intro' })
  })

  it('removes only the matching context token id', () => {
    const first = buildContextToken(payload('first'))
    const second = buildContextToken(payload('second'))
    const markdown = `before\n${first}\nmiddle\n${second}\nafter`

    expect(removeContextTokenById(markdown, 'first')).toBe(`before\n\nmiddle\n${second}\nafter`)
  })

  it('removes context references for deleted sub-tabs without touching other previews or links', () => {
    const deleted = targetLocation('parent', 'deleted-sub')
    const retained = targetLocation('parent', 'retained-sub')
    const deletedToken = buildContextToken(payload('deleted', deleted))
    const retainedToken = buildContextToken(payload('retained', retained))
    const markdown = [
      'before',
      deletedToken,
      retainedToken,
      '[normal link](#tabs-note/body?domainId=domain&spaceId=space&tabId=parent&subTabId=deleted-sub)',
      'after',
    ].join('\n')

    expect(removeContextReferencesForNoteLocationsFromMarkdown(markdown, [deleted])).toBe(
      [
        'before',
        '',
        retainedToken,
        '[normal link](#tabs-note/body?domainId=domain&spaceId=space&tabId=parent&subTabId=deleted-sub)',
        'after',
      ].join('\n'),
    )
  })

  it('removes context references across multiple note bodies and aisles', () => {
    const deletedParent = targetLocation('deleted-parent', null)
    const deletedSubTab = targetLocation('deleted-parent', 'deleted-sub')
    const retained = targetLocation('other-parent', 'retained-sub')
    const parentToken = buildContextToken(payload('parent', deletedParent))
    const subTabToken = buildContextToken(payload('subtab', deletedSubTab))
    const retainedToken = buildContextToken(payload('retained', retained))
    const state = {
      noteBodies: [
        {
          id: 'body-1',
          aisles: [
            { id: 'aisle-1', aisleBodyId: 'aisle-body-1' },
            { id: 'aisle-2', aisleBodyId: 'aisle-body-2' },
          ],
        },
        {
          id: 'body-2',
          aisles: [{ id: 'aisle-3', aisleBodyId: 'aisle-body-3' }],
        },
      ],
      noteAisleBodies: [
        { id: 'aisle-body-1', markdown: `a\n${parentToken}` },
        { id: 'aisle-body-2', markdown: `${retainedToken}\nb` },
        { id: 'aisle-body-3', markdown: `${subTabToken}\nc` },
      ],
    } as unknown as AppState

    const next = removeContextReferencesForNoteLocationsFromAppState(state, [deletedParent, deletedSubTab])

    expect(getAisleMarkdown(next.noteBodies[0].aisles[0], next.noteAisleBodies)).toBe('a\n')
    expect(getAisleMarkdown(next.noteBodies[0].aisles[1], next.noteAisleBodies)).toBe(`${retainedToken}\nb`)
    expect(getAisleMarkdown(next.noteBodies[1].aisles[0], next.noteAisleBodies)).toBe('\nc')
  })
})
