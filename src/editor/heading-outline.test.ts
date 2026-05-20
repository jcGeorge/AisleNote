import { describe, expect, it } from 'vitest'
import {
  getHeadingBoundaryGapsFromMarkdown,
  getHeadingCollapseBlocksFromDoc,
  getHeadingCollapseSections,
  getHeadingOutlineFromMarkdown,
} from './heading-outline'

function docForBlocks(
  blocks: Array<{ type: string; text?: string; level?: number; size?: number }>,
) {
  return {
    forEach(callback: (node: unknown, offset: number) => void) {
      let offset = 0
      blocks.forEach((block) => {
        const nodeSize = block.size ?? Math.max(2, (block.text ?? '').length + 2)
        callback(
          {
            type: { name: block.type },
            attrs: block.level ? { level: block.level } : {},
            textContent: block.text ?? '',
            nodeSize,
          },
          offset,
        )
        offset += nodeSize
      })
    },
  }
}

describe('heading outline helpers', () => {
  it('extracts markdown headings per aisle', () => {
    const first = getHeadingOutlineFromMarkdown('aisle-a', '# Alpha\n\ntext\n\n## Beta')
    const second = getHeadingOutlineFromMarkdown('aisle-b', '### Gamma')

    expect(first.map((heading) => [heading.aisleId, heading.level, heading.text])).toEqual([
      ['aisle-a', 1, 'Alpha'],
      ['aisle-a', 2, 'Beta'],
    ])
    expect(second.map((heading) => [heading.aisleId, heading.level, heading.text])).toEqual([
      ['aisle-b', 3, 'Gamma'],
    ])
  })

  it('ignores markdown headings inside fenced code blocks', () => {
    const headings = getHeadingOutlineFromMarkdown('aisle-a', '# Real\n\n```\n## Code\n```\n\n## Also real')

    expect(headings.map((heading) => heading.text)).toEqual(['Real', 'Also real'])
  })

  it('uses occurrence numbers to distinguish duplicate heading fingerprints', () => {
    const headings = getHeadingOutlineFromMarkdown('aisle-a', '## Repeat\n\n## Repeat\n\n## Repeat')

    expect(headings.map((heading) => heading.occurrence)).toEqual([0, 1, 2])
    expect(new Set(headings.map((heading) => heading.key)).size).toBe(3)
  })

  it('tracks markdown blank-line gaps before headings outside fenced code', () => {
    const markdown = '# Alpha\n\ntext\n\n\n## Beta\n\n```\n\n## Code\n```\n\n## Gamma'
    const headings = getHeadingOutlineFromMarkdown('aisle-a', markdown)
    const gaps = getHeadingBoundaryGapsFromMarkdown('aisle-a', markdown)

    expect(gaps.get(headings[0].key)).toBeUndefined()
    expect(gaps.get(headings[1].key)).toBe(2)
    expect(gaps.get(headings[2].key)).toBe(1)
    expect(Array.from(gaps.keys())).toHaveLength(2)
  })

  it('collapses until the next heading at the same or higher level', () => {
    const blocks = getHeadingCollapseBlocksFromDoc(
      'aisle-a',
      docForBlocks([
        { type: 'heading', text: 'Top', level: 1, size: 5 },
        { type: 'paragraph', text: 'intro', size: 7 },
        { type: 'heading', text: 'Child', level: 2, size: 7 },
        { type: 'paragraph', text: 'child body', size: 12 },
        { type: 'heading', text: 'Next top', level: 1, size: 10 },
        { type: 'paragraph', text: 'outside', size: 9 },
      ]),
    )
    const topHeadingKey = blocks[0].heading?.key ?? ''

    const sections = getHeadingCollapseSections(blocks, new Set([topHeadingKey]))

    expect(sections).toHaveLength(1)
    expect(sections[0].hiddenRanges).toEqual([
      { from: 5, to: 12 },
      { from: 12, to: 19 },
      { from: 19, to: 31 },
    ])
  })

  it('keeps blank paragraphs before the next heading outside collapsed ranges', () => {
    const blocks = getHeadingCollapseBlocksFromDoc(
      'aisle-a',
      docForBlocks([
        { type: 'heading', text: 'Subject', level: 2, size: 9 },
        { type: 'paragraph', text: '', size: 2 },
        { type: 'paragraph', text: 'some text', size: 11 },
        { type: 'paragraph', text: '', size: 2 },
        { type: 'paragraph', text: '', size: 2 },
        { type: 'heading', text: 'Different subject', level: 2, size: 19 },
      ]),
    )
    const subjectKey = blocks[0].heading?.key ?? ''

    const sections = getHeadingCollapseSections(blocks, new Set([subjectKey]))

    expect(sections[0].hiddenRanges).toEqual([
      { from: 9, to: 11 },
      { from: 11, to: 22 },
    ])
  })
})
