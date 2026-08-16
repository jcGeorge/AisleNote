import { describe, expect, it } from 'vitest'
import {
  applyFrontmatterTemplate,
  coerceFrontmatterFieldValue,
  extractMarkdownFrontmatter,
  getFrontmatterDatetimePickerValue,
  getFrontmatterDraftValueForType,
  normalizeFrontmatterFixedListOptions,
  parseFrontmatterImportData,
  parseFrontmatterTemplateImport,
  parseFrontmatterYaml,
  prependMarkdownFrontmatter,
  normalizeFrontmatterSettings,
  resolveFrontmatterFixedListValues,
  stringifyFrontmatterYaml,
} from './frontmatter'
import type { FrontmatterTemplate } from '../types/app'

const context = {
  now: new Date('2026-05-15T12:30:00.000Z'),
  noteBodyId: 'body-1',
  noteCreatedAt: '2024-01-01T08:00:00.000Z',
  noteUpdatedAt: '2026-05-14T09:30:00.000Z',
  noteTitle: 'Roadmap',
  isLinked: true,
  tags: ['Planning', 'Client/Acme'],
  noteId: 'note-1',
  folderName: 'Product',
  folderPath: 'Vault / Product',
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
    { id: 'linked', key: 'linked', type: 'boolean', defaultValue: 'false', computed: 'isLinked' },
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

  it('writes empty list frontmatter compactly', () => {
    expect(prependMarkdownFrontmatter('body', { tags: [] })).toBe('---\ntags: []\n---\nbody')
  })

  it('rejects non-mapping YAML', () => {
    expect(parseFrontmatterYaml('- item').ok).toBe(false)
  })

  it('parses shared frontmatter import text from wrapped markdown and bare YAML', () => {
    expect(parseFrontmatterImportData('status: draft\ntags:\n  - launch')).toEqual({
      ok: true,
      data: { status: 'draft', tags: ['launch'] },
    })
    expect(parseFrontmatterImportData('---\nstatus: ready\n---\n# Body')).toEqual({
      ok: true,
      data: { status: 'ready' },
    })
  })

  it('reports empty and invalid shared frontmatter import text', () => {
    expect(parseFrontmatterImportData('')).toEqual({ ok: false, message: 'No frontmatter fields found.' })
    expect(parseFrontmatterImportData('{}')).toEqual({ ok: false, message: 'No frontmatter fields found.' })
    expect(parseFrontmatterImportData('- item').ok).toBe(false)
    expect(parseFrontmatterImportData('---\nkey: [unterminated\n---\nbody').ok).toBe(false)
  })

  it('imports template fields from a full Markdown frontmatter block and ignores the body', () => {
    const result = parseFrontmatterTemplateImport(`---
status: draft
tags:
  - launch
nested:
  title: Launch
---
# Body
body: ignored`)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.fields).toMatchObject([
      { key: 'status', type: 'text', defaultValue: 'draft', computed: 'none' },
      { key: 'tags', type: 'list', defaultValue: 'launch', computed: 'none' },
      { key: 'nested', type: 'text', defaultValue: 'title: Launch', computed: 'none' },
    ])
    expect(result.fields.some((field) => field.key === 'body')).toBe(false)
  })

  it('imports template fields from bare YAML with inferred plain defaults', () => {
    const result = parseFrontmatterTemplateImport(`status: published
count: 3
featured: true
publishDate: 1/10/2026
publishAt: 2026-06-28T10:30:00
tags:
  - launch
  - customer`)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.fields).toMatchObject([
      { key: 'status', type: 'text', defaultValue: 'published', computed: 'none' },
      { key: 'count', type: 'number', defaultValue: '3', computed: 'none' },
      { key: 'featured', type: 'boolean', defaultValue: 'true', computed: 'none' },
      { key: 'publishDate', type: 'date', defaultValue: '2026-01-10', computed: 'none' },
      { key: 'publishAt', type: 'datetime', defaultValue: '2026-06-28T10:30', computed: 'none' },
      { key: 'tags', type: 'list', defaultValue: 'launch, customer', computed: 'none' },
    ])
    expect(result.fields.every((field) => field.computed === 'none')).toBe(true)
  })

  it('rejects invalid or empty frontmatter template imports', () => {
    expect(parseFrontmatterTemplateImport('').ok).toBe(false)
    expect(parseFrontmatterTemplateImport('{}')).toEqual({ ok: false, message: 'No frontmatter fields found.' })
    expect(parseFrontmatterTemplateImport('- item').ok).toBe(false)
    expect(parseFrontmatterTemplateImport('---\nkey: [unterminated\n---\nbody').ok).toBe(false)
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
            { id: 'linked', key: 'linked', type: 'boolean', defaultValue: 'false', computed: 'isLinked' },
            { id: 'created', key: 'created', type: 'date', defaultValue: '', computed: 'createdAt' },
            { id: 'title', key: 'title', type: 'text', defaultValue: '', computed: 'noteTitle' },
            { id: 'bad-linked', key: 'badLinked', type: 'text', defaultValue: '', computed: 'isLinked' },
            { id: 'bad-tags', key: 'badTags', type: 'text', defaultValue: '', computed: 'tags' },
            { id: 'computed-tags', key: 'computedTags', type: 'list', defaultValue: '', computed: 'tags' },
          ],
        },
      ],
    })

    expect(normalized.templates[0]?.fields.map((field) => field.computed)).toEqual([
      'none',
      'isLinked',
      'createdAt',
      'noteTitle',
      'none',
      'none',
      'tags',
    ])
  })

  it('normalizes fixed list options and drops invalid defaults', () => {
    const normalized = normalizeFrontmatterSettings({
      templates: [
        {
          id: 'fixed-template',
          name: 'Fixed',
          fields: [
            {
              id: 'status',
              key: 'status',
              type: 'fixedList',
              defaultValue: 'archived',
              computed: 'tags',
              options: ['draft', 'published', 'draft', ' '],
            },
          ],
        },
      ],
    })

    expect(normalizeFrontmatterFixedListOptions('draft, published\ndraft')).toEqual(['draft', 'published'])
    expect(normalized.templates[0]?.fields[0]).toMatchObject({
      type: 'fixedList',
      defaultValue: '',
      computed: 'none',
      options: ['draft', 'published'],
    })
  })

  it('resolves fixed list values as ordered allowed selections', () => {
    const options = ['draft', 'published', 'archived']

    expect(resolveFrontmatterFixedListValues(options, 'published')).toEqual(['published'])
    expect(resolveFrontmatterFixedListValues(options, ['archived', 'draft', 'draft'])).toEqual(['draft', 'archived'])
    expect(resolveFrontmatterFixedListValues(options, 'archived, missing, draft')).toEqual(['draft', 'archived'])
    expect(resolveFrontmatterFixedListValues(options, 'missing', 'published')).toEqual(['published'])
    expect(resolveFrontmatterFixedListValues(options, [])).toEqual([])
  })

  it('applies fixed list templates as allowed value arrays', () => {
    const fixedTemplate: FrontmatterTemplate = {
      id: 'fixed-template',
      name: 'Fixed',
      fields: [
        {
          id: 'status',
          key: 'status',
          type: 'fixedList',
          defaultValue: 'draft',
          computed: 'none',
          options: ['draft', 'published'],
        },
      ],
    }

    expect(applyFrontmatterTemplate(null, fixedTemplate, context)).toEqual({ status: ['draft'] })
    expect(applyFrontmatterTemplate({ status: 'published' }, fixedTemplate, context)).toEqual({ status: ['published'] })
    expect(applyFrontmatterTemplate({ status: ['published', 'draft'] }, fixedTemplate, context)).toEqual({
      status: ['draft', 'published'],
    })
    expect(applyFrontmatterTemplate({ status: 'archived' }, fixedTemplate, context)).toEqual({ status: ['draft'] })
    expect(applyFrontmatterTemplate({ status: [] }, fixedTemplate, context)).toEqual({ status: [] })
    expect(coerceFrontmatterFieldValue('fixedList', 'published')).toEqual(['published'])
  })

  it('applies computed tags to list fields', () => {
    const result = applyFrontmatterTemplate(null, {
      id: 'tags-template',
      name: 'Tags',
      fields: [
        { id: 'tags', key: 'tags', type: 'list', defaultValue: '', computed: 'tags' },
      ],
    }, context)

    expect(result).toEqual({ tags: ['Planning', 'Client/Acme'] })
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
      linked: true,
    })
  })

  it('coerces blank date and datetime values to null', () => {
    expect(coerceFrontmatterFieldValue('date', '')).toBeNull()
    expect(coerceFrontmatterFieldValue('datetime', '')).toBeNull()
    expect(coerceFrontmatterFieldValue('date', null)).toBeNull()
    expect(coerceFrontmatterFieldValue('datetime', null)).toBeNull()
  })

  it('coerces picker date and datetime values', () => {
    expect(coerceFrontmatterFieldValue('date', '2026-05-15')).toBe('2026-05-15')
    expect(coerceFrontmatterFieldValue('date', '1/10/2026')).toBe('2026-01-10')
    expect(getFrontmatterDraftValueForType('date', '1/10/2026')).toBe('2026-01-10')
    expect(getFrontmatterDraftValueForType('date', 'not a date')).toBe('')
    expect(coerceFrontmatterFieldValue('datetime', '2026-05-15')).toBe(
      new Date(2026, 4, 15, 15, 0, 0, 0).toISOString(),
    )
    expect(getFrontmatterDatetimePickerValue('2026-05-15')).toBe('2026-05-15T15:00')
    expect(getFrontmatterDatetimePickerValue('1/10/2026')).toBe('2026-01-10T15:00')
    expect(getFrontmatterDraftValueForType('datetime', '2026-05-15')).toBe('2026-05-15T15:00')
  })

  it('applies blank date and datetime template defaults as null', () => {
    const result = applyFrontmatterTemplate(
      null,
      {
        id: 'dates-template',
        name: 'Dates',
        fields: [
          { id: 'due', key: 'due', type: 'date', defaultValue: '', computed: 'none' },
          { id: 'starts', key: 'starts', type: 'datetime', defaultValue: '', computed: 'none' },
        ],
      },
      context,
    )

    expect(result).toEqual({
      due: null,
      starts: null,
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

  it('coerces matching existing frontmatter values into editable template field types', () => {
    const typedTemplate: FrontmatterTemplate = {
      id: 'typed-template',
      name: 'Typed',
      fields: [
        { id: 'series-order', key: 'seriesOrder', type: 'number', defaultValue: '1', computed: 'none' },
        { id: 'draft', key: 'draft', type: 'boolean', defaultValue: 'true', computed: 'none' },
        { id: 'publish-date', key: 'publishDate', type: 'date', defaultValue: '', computed: 'none' },
        { id: 'misc-tags', key: 'miscTags', type: 'list', defaultValue: '', computed: 'none' },
        {
          id: 'status',
          key: 'status',
          type: 'fixedList',
          defaultValue: 'draft',
          computed: 'none',
          options: ['draft', 'published', 'archived'],
        },
      ],
    }

    const result = applyFrontmatterTemplate(
      {
        seriesOrder: '2',
        draft: 'false',
        publishDate: '1/10/2026',
        miscTags: 'yes, yes1, yes2',
        status: ['missing', 'published'],
      },
      typedTemplate,
      context,
    )

    expect(result).toEqual({
      seriesOrder: 2,
      draft: false,
      publishDate: '2026-01-10',
      miscTags: ['yes', 'yes1', 'yes2'],
      status: ['published'],
    })
  })

  it('falls back to template defaults when matching existing values cannot be coerced', () => {
    const typedTemplate: FrontmatterTemplate = {
      id: 'fallback-template',
      name: 'Fallback',
      fields: [
        { id: 'series-order', key: 'seriesOrder', type: 'number', defaultValue: '1', computed: 'none' },
        { id: 'draft', key: 'draft', type: 'boolean', defaultValue: 'true', computed: 'none' },
        { id: 'publish-date', key: 'publishDate', type: 'date', defaultValue: '', computed: 'none' },
      ],
    }

    expect(applyFrontmatterTemplate(
      { seriesOrder: 'two', draft: 'maybe', publishDate: 'not a date' },
      typedTemplate,
      context,
    )).toEqual({
      seriesOrder: 1,
      draft: true,
      publishDate: null,
    })
  })

  it('applies frontmatter as template fields only', () => {
    const result = applyFrontmatterTemplate({ extra: true }, template, context)

    expect(result.extra).toBeUndefined()
    expect(stringifyFrontmatterYaml(result)).toContain('status: draft')
  })
})
