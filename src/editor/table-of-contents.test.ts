import { describe, expect, it } from 'vitest'
import type { ResolvedNoteAisle } from '../types/app'
import { TABLE_OF_CONTENTS_EMPTY_MESSAGE, buildTableOfContentsPanels } from './table-of-contents'

const aisles: ResolvedNoteAisle[] = [
  { id: 'a', aisleBodyId: 'a', markdown: '# Alpha' },
  { id: 'b', aisleBodyId: 'b', markdown: '# Beta' },
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
    expect(panels?.linksByAisle).toEqual({})
  })

  it('limits panels to the focused aisle when the scope is focused aisle', () => {
    const panels = buildTableOfContentsPanels(
      'body-1',
      aisles,
      (aisle) => [
        { aisleId: aisle.id, key: `heading-${aisle.id}`, level: 1, text: aisle.markdown, occurrence: 0 },
      ],
      { scope: 'focused-aisle', focusedAisleId: 'b' },
    )

    expect(panels?.openAisleIds).toEqual(new Set(['b']))
    expect(Object.keys(panels?.headingsByAisle ?? {})).toEqual(['b'])
  })

  it('returns null in focused-aisle scope when the focused aisle has no headings', () => {
    expect(buildTableOfContentsPanels(
      'body-1',
      aisles,
      (aisle) =>
        aisle.id === 'a'
          ? [{ aisleId: aisle.id, key: 'heading-a', level: 1, text: 'Alpha', occurrence: 0 }]
          : [],
      { scope: 'focused-aisle', focusedAisleId: 'b' },
    )).toBeNull()
  })

  it('builds panels for aisles with links even when they have no headings', () => {
    const panels = buildTableOfContentsPanels(
      'body-1',
      aisles,
      () => [],
      {
        getLinksForAisle: (aisle) =>
          aisle.id === 'b'
            ? [{
                aisleId: aisle.id,
                key: 'b|link|0',
                kind: 'url-link',
                label: 'site',
                href: 'https://example.com',
              }]
            : [],
      },
    )

    expect(panels?.openAisleIds).toEqual(new Set(['b']))
    expect(panels?.headingsByAisle).toEqual({})
    expect(Object.keys(panels?.linksByAisle ?? {})).toEqual(['b'])
  })

  it('returns null and keeps exact empty ToC copy when no aisle has headings', () => {
    expect(buildTableOfContentsPanels('body-1', aisles, () => [])).toBeNull()
    expect(TABLE_OF_CONTENTS_EMPTY_MESSAGE).toBe(
      'add headers or links to your notes to navigate via table of contents',
    )
  })
})
