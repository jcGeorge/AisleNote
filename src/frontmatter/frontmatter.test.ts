import { describe, expect, it } from 'vitest'
import {
  applyFrontmatterTemplate,
  extractMarkdownFrontmatter,
  parseFrontmatterYaml,
  prependMarkdownFrontmatter,
  stringifyFrontmatterYaml,
} from './frontmatter'
import type { FrontmatterTemplate } from '../types/app'

const template: FrontmatterTemplate = {
  id: 'template',
  name: 'Template',
  fields: [
    { id: 'status', key: 'status', type: 'text', defaultValue: 'draft', computed: 'none' },
    { id: 'count', key: 'count', type: 'number', defaultValue: '3', computed: 'none' },
    { id: 'tags', key: 'tags', type: 'list', defaultValue: 'one, two', computed: 'none' },
    { id: 'created', key: 'created', type: 'date', defaultValue: '', computed: 'createdAt' },
    { id: 'updated', key: 'updated', type: 'datetime', defaultValue: '', computed: 'updatedAt' },
    { id: 'title', key: 'title', type: 'text', defaultValue: '', computed: 'noteTitle' },
  ],
}

describe('frontmatter parsing', () => {
  it('extracts YAML frontmatter from markdown and leaves the note body clean', () => {
    const extracted = extractMarkdownFrontmatter('---\ntags:\n  - alpha\nstatus: draft\n---\n# Note')

    expect(extracted.frontmatter).toEqual({ tags: ['alpha'], status: 'draft' })
    expect(extracted.markdown).toBe('# Note')
  })

  it('keeps markdown unchanged when the YAML block is invalid', () => {
    const markdown = '---\nkey: [unterminated\n---\nbody'
    const extracted = extractMarkdownFrontmatter(markdown)

    expect(extracted.frontmatter).toBeNull()
    expect(extracted.markdown).toBe(markdown)
  })

  it('round-trips YAML frontmatter for export', () => {
    const markdown = prependMarkdownFrontmatter('body', { status: 'draft', tags: ['one'] })

    expect(markdown).toBe('---\nstatus: draft\ntags:\n  - one\n---\nbody')
  })

  it('rejects non-mapping YAML', () => {
    expect(parseFrontmatterYaml('- item').ok).toBe(false)
  })
})

describe('frontmatter templates', () => {
  it('applies typed defaults and computed values', () => {
    const result = applyFrontmatterTemplate(
      null,
      template,
      {
        now: new Date('2026-05-15T12:30:00.000Z'),
        noteTitle: 'Roadmap',
        spaceName: 'Product',
        domainName: 'Tabs',
      },
      'merge',
    )

    expect(result).toEqual({
      status: 'draft',
      count: 3,
      tags: ['one', 'two'],
      created: '2026-05-15',
      updated: '2026-05-15T12:30:00.000Z',
      title: 'Roadmap',
    })
  })

  it('preserves an existing created date while updating changed fields', () => {
    const result = applyFrontmatterTemplate(
      { created: '2024-01-01', status: 'ready', extra: true },
      template,
      {
        now: new Date('2026-05-15T12:30:00.000Z'),
        noteTitle: 'Roadmap',
        spaceName: 'Product',
        domainName: 'Tabs',
      },
      'merge',
    )

    expect(result.created).toBe('2024-01-01')
    expect(result.status).toBe('ready')
    expect(result.extra).toBe(true)
    expect(result.updated).toBe('2026-05-15T12:30:00.000Z')
  })

  it('can replace frontmatter with only template fields', () => {
    const result = applyFrontmatterTemplate(
      { extra: true },
      template,
      {
        now: new Date('2026-05-15T12:30:00.000Z'),
        noteTitle: 'Roadmap',
        spaceName: 'Product',
        domainName: 'Tabs',
      },
      'replace',
    )

    expect(result.extra).toBeUndefined()
    expect(stringifyFrontmatterYaml(result)).toContain('status: draft')
  })
})
