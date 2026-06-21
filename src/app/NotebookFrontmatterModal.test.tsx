import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { FrontmatterTemplate } from '../types/app'
import type { NotebookFrontmatterModalState } from './NotebookApp'

let NotebookFrontmatterModal: typeof import('./NotebookApp').NotebookFrontmatterModal

beforeAll(async () => {
  if (typeof globalThis.Element === 'undefined') {
    Object.defineProperty(globalThis, 'Element', {
      value: class Element {},
      configurable: true,
    })
  }
  ;({ NotebookFrontmatterModal } = await import('./NotebookApp'))
})

const template: FrontmatterTemplate = {
  id: 'template-1',
  name: 'template',
  fields: [
    { id: 'status', key: 'status', type: 'text', defaultValue: 'draft', computed: 'none' },
  ],
}

function modal(overrides: Partial<NotebookFrontmatterModalState> = {}): NotebookFrontmatterModalState {
  return {
    noteBodyId: 'body-1',
    aisleId: 'aisle-1',
    aisleBodyId: 'aisle-body-1',
    location: { noteId: 'note-1' },
    aisles: [
      { id: 'aisle-1', aisleBodyId: 'aisle-body-1', label: 'aisle 1' },
      { id: 'aisle-2', aisleBodyId: 'aisle-body-2', label: 'aisle 2' },
    ],
    rows: [
      {
        id: 'template:status',
        key: 'status',
        type: 'text',
        value: 'ready',
        computed: 'none',
        computedEnabled: false,
        locked: true,
        templateFieldId: 'status',
        derived: true,
      },
    ],
    selectedTemplateId: template.id,
    templateDerived: true,
    isTemplateSuggestionDraft: false,
    ...overrides,
  }
}

function renderModal(state = modal(), templateList: FrontmatterTemplate[] = [template]) {
  return renderToStaticMarkup(
    <NotebookFrontmatterModal
      modal={state}
      templates={templateList}
      onCancel={vi.fn()}
      onChange={vi.fn()}
      onSave={vi.fn(() => null)}
      onSelectAisle={vi.fn((current) => current)}
      onSelectTemplate={vi.fn((current) => current)}
      onToggleTemplateDerived={vi.fn((current) => current)}
      onEditTemplate={vi.fn()}
    />,
  )
}

function getControlTag(html: string, className: string): string {
  return html.match(new RegExp(`<[^>]+${className}[^>]*>`))?.[0] ?? ''
}

describe('NotebookFrontmatterModal', () => {
  it('renders structured frontmatter rows instead of a raw YAML textarea', () => {
    const html = renderModal()

    expect(html).toContain('aria-label="frontmatter rows"')
    expect(html).toContain('frontmatter-row-editor')
    expect(html).toContain('aria-label="frontmatter key"')
    expect(html).toContain('aria-label="frontmatter type"')
    expect(html).not.toContain('<textarea')
  })

  it('locks template-owned key and type while keeping normal values editable', () => {
    const html = renderModal()

    expect(html).toMatch(/frontmatter-row-key-input[^>]+readOnly/)
    expect(html).toMatch(/frontmatter-row-type-select[^>]+disabled/)
    expect(html).toMatch(/frontmatter-row-value-input[^>]+value="ready"/)
    expect(html).not.toMatch(/frontmatter-row-value-input[^>]+disabled/)
  })

  it('keeps manual computed key, type, and computed value controls editable', () => {
    const html = renderModal(modal({
      selectedTemplateId: '',
      templateDerived: false,
      rows: [
        {
          id: 'existing:reviewed',
          key: 'reviewed',
          type: 'datetime',
          value: '2026-05-15T12:30',
          computed: 'createdAt',
          computedEnabled: true,
          computedLocked: false,
          locked: false,
          derived: false,
        },
      ],
    }))

    expect(getControlTag(html, 'frontmatter-row-key-input')).not.toContain('readOnly')
    expect(getControlTag(html, 'frontmatter-row-type-select')).not.toContain('disabled')
    expect(html.match(/<select[^>]+aria-label="computed frontmatter value"[^>]*>/)?.[0] ?? '').not.toContain('disabled')
  })

  it('renders the multi-aisle selector', () => {
    const html = renderModal()

    expect(html).toContain('aria-label="frontmatter aisle"')
    expect(html).toContain('>aisle 1</option>')
    expect(html).toContain('>aisle 2</option>')
  })

  it('labels unsaved template suggestions with an add-frontmatter action', () => {
    const html = renderModal(modal({ isTemplateSuggestionDraft: true }))

    expect(html).toContain('Suggested from')
    expect(html).toContain('>Add frontmatter</button>')
  })

  it('renders fixed list template values as a dropdown', () => {
    const fixedTemplate: FrontmatterTemplate = {
      id: 'fixed-template',
      name: 'fixed',
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
    const html = renderModal(
      modal({
        selectedTemplateId: fixedTemplate.id,
        rows: [
          {
            id: 'template:status',
            key: 'status',
            type: 'fixedList',
            value: 'published',
            computed: 'none',
            computedEnabled: false,
            locked: true,
            templateFieldId: 'status',
            derived: true,
            fixedListOptions: ['draft', 'published'],
          },
        ],
      }),
      [fixedTemplate],
    )

    expect(html).toContain('aria-label="frontmatter fixed list value"')
    expect(html).toContain('<option value="draft">draft</option>')
    expect(html).toContain('<option value="published" selected="">published</option>')
  })
})
