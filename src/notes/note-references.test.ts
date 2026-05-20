import { describe, expect, it } from 'vitest'
import {
  buildContextToken,
  removeContextReferencesForNoteLocationsFromAppState,
  removeContextReferencesForNoteLocationsFromMarkdown,
  removeContextTokenById,
} from './note-references'
import type { AppState, NoteLocation } from '../types/app'
import type { NoteContextReferencePayload } from './note-references'

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
          frontmatter: null,
          aisles: [
            { id: 'aisle-1', markdown: `a\n${parentToken}` },
            { id: 'aisle-2', markdown: `${retainedToken}\nb` },
          ],
        },
        {
          id: 'body-2',
          frontmatter: null,
          aisles: [{ id: 'aisle-3', markdown: `${subTabToken}\nc` }],
        },
      ],
    } as AppState

    const next = removeContextReferencesForNoteLocationsFromAppState(state, [deletedParent, deletedSubTab])

    expect(next.noteBodies[0].aisles[0].markdown).toBe('a\n')
    expect(next.noteBodies[0].aisles[1].markdown).toBe(`${retainedToken}\nb`)
    expect(next.noteBodies[1].aisles[0].markdown).toBe('\nc')
  })
})
