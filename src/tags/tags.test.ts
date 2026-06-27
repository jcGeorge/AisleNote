import { describe, expect, it } from 'vitest'
import {
  extractFrontmatterTags,
  extractMarkdownTagRanges,
  extractMarkdownTags,
  getAisleBodyTags,
  isRecognizedMarkdownTagLabel,
  normalizeAisleTagsWithFrontmatter,
} from './tags.js'

describe('tag extraction', () => {
  it('extracts simple, hyphenated, and nested markdown tags', () => {
    expect(extractMarkdownTags('#Sermon #multi-word #nested/tag')).toEqual([
      'Sermon',
      'multi-word',
      'nested/tag',
    ])
  })

  it('extracts visible tag token ranges for styling every authored tag', () => {
    expect(extractMarkdownTagRanges('#Tag-3 and #asdf')).toEqual([
      { from: 0, to: 6, text: '#Tag-3', tag: 'Tag-3' },
      { from: 11, to: 16, text: '#asdf', tag: 'asdf' },
    ])
  })

  it('requires at least one letter after normalization for markdown tags', () => {
    expect(isRecognizedMarkdownTagLabel('123')).toBe(false)
    expect(isRecognizedMarkdownTagLabel('4-5')).toBe(false)
    expect(isRecognizedMarkdownTagLabel('4word')).toBe(true)
    expect(isRecognizedMarkdownTagLabel('2024-q1')).toBe(true)

    expect(extractMarkdownTags('#1 #1.2 #2024 #4-5')).toEqual([])
    expect(extractMarkdownTags('#4word #2024-q1 #4/word #Tag')).toEqual([
      '4word',
      '2024-q1',
      '4/word',
      'Tag',
    ])
    expect(extractMarkdownTagRanges('#1 #4word #4-5 #2024-q1')).toEqual([
      { from: 3, to: 9, text: '#4word', tag: '4word' },
      { from: 15, to: 23, text: '#2024-q1', tag: '2024-q1' },
    ])
  })

  it('matches case-insensitively while preserving the first visible casing', () => {
    expect(extractMarkdownTags('#Sermon #sermon #SERMON #Notes')).toEqual(['Sermon', 'Notes'])
  })

  it('handles punctuation boundaries without matching embedded fragments', () => {
    expect(extractMarkdownTags('(#Card), C# is not a tag, https://example.test/#anchor is not #Final.')).toEqual([
      'Card',
      'Final',
    ])
    expect(extractMarkdownTagRanges('C# and https://example.test/#anchor ignore #Visible.')).toEqual([
      { from: 43, to: 51, text: '#Visible', tag: 'Visible' },
    ])
  })

  it('ignores inline code and fenced code', () => {
    expect(extractMarkdownTags([
      'visible #Tag',
      '`#Inline`',
      '```',
      '#Fenced',
      '```',
      'after #After',
    ].join('\n'))).toEqual(['Tag', 'After'])
    expect(extractMarkdownTagRanges('visible #Tag `#Inline`')).toEqual([
      { from: 8, to: 12, text: '#Tag', tag: 'Tag' },
    ])
  })

  it('normalizes frontmatter tag values', () => {
    expect(extractFrontmatterTags({ tags: ['#Card', 'unfinished', 'nested/tag', 'Card'] })).toEqual([
      'Card',
      'unfinished',
      'nested/tag',
    ])
  })

  it('treats markdown as the source of truth over cached tags', () => {
    expect(getAisleBodyTags({ markdown: '#Fresh', tags: ['Stale'] })).toEqual(['Fresh'])
  })
})

describe('frontmatter tag normalization', () => {
  it('imports non-computed frontmatter tags into visible markdown tags', () => {
    const result = normalizeAisleTagsWithFrontmatter({
      markdown: 'Body text',
      frontmatter: { tags: ['Card', 'Unfinished'] },
      frontmatterMeta: undefined,
    })

    expect(result.markdown).toBe('#Card #Unfinished\n\nBody text')
    expect(result.tags).toEqual(['Card', 'Unfinished'])
    expect(result.frontmatter).toEqual({ tags: ['Card', 'Unfinished'] })
    expect(result.frontmatterMeta).toMatchObject({ computedFields: { tags: 'tags' } })
    expect(result.importedFrontmatterTags).toBe(true)
  })

  it('updates computed frontmatter tags from visible markdown tags', () => {
    const result = normalizeAisleTagsWithFrontmatter({
      markdown: 'Body without tags',
      frontmatter: { tags: ['Old'] },
      frontmatterMeta: { computedFields: { tags: 'tags' } },
    })

    expect(result.markdown).toBe('Body without tags')
    expect(result.tags).toEqual([])
    expect(result.frontmatter).toEqual({ tags: [] })
    expect(result.importedFrontmatterTags).toBe(false)
  })
})
