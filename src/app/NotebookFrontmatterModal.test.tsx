import React from 'react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { FrontmatterTemplate } from '../types/app'
import type { NotebookFrontmatterModalState } from './NotebookApp'

let NotebookFrontmatterModal: typeof import('./NotebookApp').NotebookFrontmatterModal
const notebookAppSource = readFileSync(new URL('./NotebookApp.tsx', import.meta.url), 'utf8')
const overlaysCss = readFileSync(new URL('../styles/overlays.css', import.meta.url), 'utf8')

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
      onFilterTemplate={vi.fn()}
      onCopyFrontmatter={vi.fn(async () => null)}
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
    expect(html).not.toContain('Filter on template')
    expect(html).not.toContain('frontmatter-template-suggestion-chip')
    expect(html).not.toContain('>suggested</span>')
  })

  it('offers template filtering from saved derived frontmatter', () => {
    const html = renderModal()

    expect(html).toContain('Filter on template')
    expect(html).toContain('frontmatter-filter-template-btn')
  })

  it('renders the frontmatter copy action in the modal header', () => {
    const html = renderModal()

    expect(html).toContain('>Copy FM</button>')
    expect(html).toContain('frontmatter-copy-btn')
    expect(html).not.toContain('frontmatter-paste-btn')
  })

  it('renders row actions as trash icon buttons', () => {
    const html = renderModal()

    expect(html).toContain('frontmatter-row-remove-btn')
    expect(html).toContain('data-app-icon="trash"')
    expect(html).toContain('aria-label="Remove status"')
    expect(html).not.toContain('>Remove</button>')
  })

  it('renders row reorder handles as draggable grip buttons', () => {
    const html = renderModal()

    expect(html).toContain('frontmatter-row-drag-handle')
    expect(html).toContain('data-app-icon="gripVertical"')
    expect(html).toContain('aria-label="Reorder status"')
    expect(html).toContain('draggable="true"')
  })

  it('uses container-level row drop indexes for frontmatter row reordering', () => {
    expect(notebookAppSource).toContain('frontmatterRowDropIndex')
    expect(notebookAppSource).toContain('data-frontmatter-row-id')
    expect(notebookAppSource).toContain('reorderFrontmatterItemsByTargetIndex(rows, sourceRowId, targetIndex)')
    expect(notebookAppSource).not.toContain('dropFrontmatterRow(event, row.id)')
  })

  it('defines stable row drag handle and drop indicator styles', () => {
    expect(overlaysCss).toContain('grid-template-columns: 2.35rem')
    expect(overlaysCss).toContain('.frontmatter-row.is-drop-index-before::before')
    expect(overlaysCss).toContain('.frontmatter-row.is-drop-index-after::after')
    expect(overlaysCss).toContain('.frontmatter-row-drag-handle')
  })

  it('renders fixed list template values as a checkbox dropdown', () => {
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

    expect(html).toContain('frontmatter-fixed-list-dropdown')
    expect(html).toContain('frontmatter-fixed-list-trigger')
    expect(html).toContain('aria-label="frontmatter fixed list values"')
    expect(html).toContain('aria-label="frontmatter fixed list options"')
    expect(html).toContain('<span class="frontmatter-fixed-list-trigger-label">published</span>')
    expect(html).toContain('frontmatter-fixed-list-choice')
    expect(html).toContain('<span>draft</span>')
    expect(html).toContain('<span>published</span>')
    expect(html).not.toContain('aria-label="frontmatter fixed list value"')
    expect(html).not.toContain('<option value="">no options</option>')
  })

  it('prompts empty fixed list values to select from the dropdown', () => {
    const html = renderModal(
      modal({
        rows: [
          {
            id: 'template:status',
            key: 'status',
            type: 'fixedList',
            value: '',
            computed: 'none',
            computedEnabled: false,
            locked: true,
            templateFieldId: 'status',
            derived: true,
            fixedListOptions: ['draft', 'published'],
          },
        ],
      }),
    )

    expect(html).toContain('<span class="frontmatter-fixed-list-trigger-label">select from drop-down</span>')
  })
})
