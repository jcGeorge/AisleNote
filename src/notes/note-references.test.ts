import { describe, expect, it } from 'vitest'
import { buildContextToken, removeContextTokenById } from './note-references'
import type { NoteContextReferencePayload } from './note-references'

function payload(id: string): NoteContextReferencePayload {
  return {
    id,
    target: {
      domainId: 'domain',
      spaceId: 'space',
      tabId: 'tab',
      subTabId: null,
    },
  }
}

describe('note context references', () => {
  it('removes only the matching context token id', () => {
    const first = buildContextToken(payload('first'))
    const second = buildContextToken(payload('second'))
    const markdown = `before\n${first}\nmiddle\n${second}\nafter`

    expect(removeContextTokenById(markdown, 'first')).toBe(`before\n\nmiddle\n${second}\nafter`)
  })
})
