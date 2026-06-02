import { describe, expect, it } from 'vitest'
import {
  extractFrontmatterTags,
  extractMarkdownTagRanges,
  extractMarkdownTags,
  getAisleBodyTags,
  migrateAisleTags,
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

describe('tag migration', () => {
  it('imports non-computed frontmatter tags into the top of the markdown body', () => {
    const result = migrateAisleTags({
      markdown: 'Body text',
      frontmatter: { tags: ['Card', 'Unfinished'] },
      frontmatterMeta: undefined,
    })

    expect(result.markdown).toBe('#Card #Unfinished\n\nBody text')
    expect(result.tags).toEqual(['Card', 'Unfinished'])
    expect(result.frontmatter).toEqual({ tags: ['Card', 'Unfinished'] })
    expect(result.frontmatterMeta).toMatchObject({ computedFields: { tags: 'tags' } })
  })

  it('uses visible tags instead of re-importing stale computed frontmatter tags', () => {
    const result = migrateAisleTags({
      markdown: 'Body without tags',
      frontmatter: { tags: ['Old'] },
      frontmatterMeta: { computedFields: { tags: 'tags' } },
    })

    expect(result.markdown).toBe('Body without tags')
    expect(result.tags).toEqual([])
    expect(result.frontmatter).toEqual({ tags: [] })
  })
})
