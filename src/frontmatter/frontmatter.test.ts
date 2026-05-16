import { describe, expect, it } from 'vitest'
import {
  applyFrontmatterTemplate,
  extractMarkdownFrontmatter,
  parseFrontmatterYaml,
  prependMarkdownFrontmatter,
  normalizeFrontmatterSettings,
  stringifyFrontmatterYaml,
} from './frontmatter'
import type { FrontmatterTemplate } from '../types/app'

const context = {
  now: new Date('2026-05-15T12:30:00.000Z'),
  noteBodyId: 'body-1',
  noteCreatedAt: '2024-01-01T08:00:00.000Z',
  noteUpdatedAt: '2026-05-14T09:30:00.000Z',
  noteTitle: 'Roadmap',
  tabId: 'tab-1',
  subTabId: null,
  spaceId: 'space-1',
  spaceName: 'Product',
  domainId: 'domain-1',
  domainName: 'Tabs',
}

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
  it('splits settings template selection from last applied template history', () => {
    expect(normalizeFrontmatterSettings(null).settingsTemplateId).toBe('')
    expect(normalizeFrontmatterSettings(null).lastAppliedTemplateId).toBe('')
    expect(
      normalizeFrontmatterSettings({
        settingsTemplateId: 'template',
        lastAppliedTemplateId: 'template',
        templates: [template],
      }),
    ).toMatchObject({
      settingsTemplateId: 'template',
      lastAppliedTemplateId: 'template',
    })
    expect(
      normalizeFrontmatterSettings({
        activeTemplateId: 'template',
        templates: [template],
      }).settingsTemplateId,
    ).toBe('template')
    expect(
      normalizeFrontmatterSettings({
        activeTemplateId: 'template',
        templates: [template],
      }).lastAppliedTemplateId,
    ).toBe('')
    expect(
      normalizeFrontmatterSettings({
        activeTemplateId: '',
        templates: [template],
      }).settingsTemplateId,
    ).toBe('')
  })

  it('normalizes computed values that do not match the field type', () => {
    const normalized = normalizeFrontmatterSettings({
      templates: [
        {
          id: 'bad-template',
          name: 'Bad',
          fields: [
            { id: 'flag', key: 'flag', type: 'boolean', defaultValue: '', computed: 'createdAt' },
            { id: 'created', key: 'created', type: 'date', defaultValue: '', computed: 'createdAt' },
            { id: 'title', key: 'title', type: 'text', defaultValue: '', computed: 'noteTitle' },
          ],
        },
      ],
    })

    expect(normalized.templates[0]?.fields.map((field) => field.computed)).toEqual([
      'none',
      'createdAt',
      'noteTitle',
    ])
  })

  it('applies typed defaults and computed values', () => {
    const result = applyFrontmatterTemplate(null, template, context)

    expect(result).toEqual({
      status: 'draft',
      count: 3,
      tags: ['one', 'two'],
      created: '2024-01-01',
      updated: '2026-05-14T09:30:00.000Z',
      title: { id: 'body-1', title: 'Roadmap' },
    })
  })

  it('preserves compatible existing values for editable template fields', () => {
    const result = applyFrontmatterTemplate(
      { created: '2024-01-01', status: 'ready', extra: true },
      template,
      context,
    )

    expect(result.status).toBe('ready')
    expect(result.extra).toBeUndefined()
    expect(result.created).toBe('2024-01-01')
    expect(result.updated).toBe('2026-05-14T09:30:00.000Z')
  })

  it('applies frontmatter as template fields only', () => {
    const result = applyFrontmatterTemplate({ extra: true }, template, context)

    expect(result.extra).toBeUndefined()
    expect(stringifyFrontmatterYaml(result)).toContain('status: draft')
  })
})
