import { describe, expect, it } from 'vitest'
import type { NoteAisle } from '../types/app'
import { TABLE_OF_CONTENTS_EMPTY_MESSAGE, buildTableOfContentsPanels } from './table-of-contents'

const aisles: NoteAisle[] = [
  { id: 'a', markdown: '# Alpha' },
  { id: 'b', markdown: 'body' },
]

describe('table of contents helpers', () => {
  it('builds per-aisle panels only for aisles with headings', () => {
    const panels = buildTableOfContentsPanels('body-1', aisles, (aisle) =>
      aisle.id === 'a'
        ? [{ aisleId: aisle.id, key: 'heading-a', level: 1, text: 'Alpha', occurrence: 0 }]
        : [],
    )

    expect(panels?.noteBodyId).toBe('body-1')
    expect(panels?.openAisleIds).toEqual(new Set(['a']))
    expect(Object.keys(panels?.headingsByAisle ?? {})).toEqual(['a'])
  })

  it('returns null and keeps exact empty ToC copy when no aisle has headings', () => {
    expect(buildTableOfContentsPanels('body-1', aisles, () => [])).toBeNull()
    expect(TABLE_OF_CONTENTS_EMPTY_MESSAGE).toBe(
      'add headers to your notes to navigate to them with table of contents',
    )
  })
})
