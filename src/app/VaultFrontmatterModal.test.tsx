import React from 'react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { FrontmatterTemplate } from '../types/app'
import type { VaultFrontmatterModalState } from './VaultApp'

let VaultFrontmatterModal: typeof import('./VaultApp').VaultFrontmatterModal
const vaultAppSource = readFileSync(new URL('./VaultApp.tsx', import.meta.url), 'utf8')
const overlaysCss = readFileSync(new URL('../styles/overlays.css', import.meta.url), 'utf8')
const settingsCss = readFileSync(new URL('../styles/settings.css', import.meta.url), 'utf8')
const appCss = readFileSync(new URL('../App.css', import.meta.url), 'utf8')

beforeAll(async () => {
  if (typeof globalThis.Element === 'undefined') {
    Object.defineProperty(globalThis, 'Element', {
      value: class Element {},
      configurable: true,
    })
  }
  ;({ VaultFrontmatterModal } = await import('./VaultApp'))
})

const template: FrontmatterTemplate = {
  id: 'template-1',
  name: 'template',
  fields: [
    { id: 'status', key: 'status', type: 'text', defaultValue: 'draft', computed: 'none' },
  ],
}

function modal(overrides: Partial<VaultFrontmatterModalState> = {}): VaultFrontmatterModalState {
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

function renderModal(
  state = modal(),
  templateList: FrontmatterTemplate[] = [template],
  options: { hasUnsavedChanges?: boolean } = {},
) {
  return renderToStaticMarkup(
    <VaultFrontmatterModal
      modal={state}
      templates={templateList}
      hasUnsavedChanges={options.hasUnsavedChanges ?? false}
      onCancel={vi.fn()}
      onChange={vi.fn()}
      onSave={vi.fn(() => null)}
      onCopyBlocked={vi.fn()}
      onSelectAisle={vi.fn((current) => current)}
      onSelectTemplate={vi.fn((current) => current)}
      onToggleTemplateDerived={vi.fn((current) => current)}
      onEditTemplate={vi.fn()}
      onFilterTemplate={vi.fn()}
      onImportFrontmatterText={vi.fn((current) => ({ modal: current, warnings: [] }))}
      onCopyFrontmatter={vi.fn(async () => null)}
    />,
  )
}

function getControlTag(html: string, className: string): string {
  return html.match(new RegExp(`<[^>]+${className}[^>]*>`))?.[0] ?? ''
}

function getCssRule(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) return ''
  return css.slice(start, css.indexOf('}', start) + 1)
}

describe('VaultFrontmatterModal', () => {
  it('renders structured frontmatter rows instead of a raw YAML textarea', () => {
    const html = renderModal()

    expect(html).toContain('aria-label="frontmatter rows"')
    expect(html).toContain('frontmatter-row-editor')
    expect(html).toContain('aria-label="frontmatter key"')
    expect(html).toContain('aria-label="frontmatter type"')
    expect(html).not.toContain('<textarea')
  })

  it('renders as a modeless note-content overlay dialog', () => {
    const html = renderModal()

    expect(html).toContain('frontmatter-note-modal-backdrop')
    expect(html).toContain('role="dialog"')
    expect(html).not.toContain('aria-modal="true"')
    expect(appCss).toContain('.note-content-overlay-region .frontmatter-note-modal-backdrop')
    expect(appCss).toContain('.note-content-overlay-region .vault-frontmatter-modal.frontmatter-note-modal')
    expect(appCss).toContain('top: 70px;')
    expect(appCss).toContain('max-height: calc(100% - 210px);')
    expect(appCss).toContain('display: flex;\n  flex-direction: column;')
    expect(appCss).toContain('transform: translateX(-50%);')
    expect(appCss).toContain('overflow: auto;')
    expect(appCss).toMatch(
      /\.note-content-overlay-region \.frontmatter-note-modal-backdrop \{[\s\S]*?background: color-mix\(in srgb, var\(--app-bg\) 46%, transparent\);/,
    )
  })

  it('uses a translucent frontmatter surface tint for other modal backdrops', () => {
    const vaultBackdropRule = getCssRule(appCss, '.vault-modal-backdrop')
    const bootstrapVaultBackdropRule = getCssRule(appCss, '.modal-backdrop.vault-modal-backdrop')
    const deleteBackdropRule = getCssRule(overlaysCss, '.delete-modal-backdrop')

    expect(vaultBackdropRule).toContain('background: color-mix(in srgb, var(--modal-bg) 72%, transparent);')
    expect(vaultBackdropRule).toContain('background-color: color-mix(in srgb, var(--modal-bg) 72%, transparent);')
    expect(vaultBackdropRule).toContain('opacity: 1;')
    expect(vaultBackdropRule).not.toContain('rgba(4, 9, 16, 0.58)')
    expect(bootstrapVaultBackdropRule).toContain('--bs-backdrop-bg: transparent;')
    expect(bootstrapVaultBackdropRule).toContain('background-color: color-mix(in srgb, var(--modal-bg) 72%, transparent);')
    expect(deleteBackdropRule).toContain('background: color-mix(in srgb, var(--modal-bg) 72%, transparent);')
    expect(deleteBackdropRule).toContain('background-color: color-mix(in srgb, var(--modal-bg) 72%, transparent);')
    expect(deleteBackdropRule).not.toContain('rgba(4, 9, 16, 0.58)')
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

  it('uses an add-frontmatter action for unsaved template suggestions', () => {
    const html = renderModal(modal({ isTemplateSuggestionDraft: true }))

    expect(html).not.toContain('Suggested from')
    expect(html).not.toContain('These rows are not saved on this aisle yet.')
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

    expect(html).toContain('>Import fm</button>')
    expect(html).toContain('>Copy fm</button>')
    expect(html.indexOf('>Import fm</button>')).toBeLessThan(html.indexOf('>Copy fm</button>'))
    expect(html).toContain('frontmatter-import-btn')
    expect(html).toContain('frontmatter-copy-btn')
    expect(html).not.toContain('>Copy FM</button>')
    expect(html).not.toContain('frontmatter-note-import-textarea')
    expect(html).not.toContain('frontmatter-paste-btn')
  })

  it('marks copy unavailable and shows save actions while frontmatter has unsaved changes', () => {
    const html = renderModal(modal(), [template], { hasUnsavedChanges: true })

    expect(html).toContain('frontmatter-copy-btn is-disabled')
    expect(html).toContain('aria-disabled="true"')
    expect(html).toContain('data-app-tooltip="Save changes before copying frontmatter."')
    expect(getControlTag(html, 'frontmatter-copy-btn')).not.toMatch(/\sdisabled(?:=|\s|>)/)
    expect(html).toContain('frontmatter-note-unsaved-status')
    expect(html).toContain('You have unsaved changes')
    expect(html).toContain('>Save</button>')
    expect(html).toContain('modal-primary-btn')
    expect(html).toContain('>Save &amp; Exit</button>')
    expect(html).toContain('class="btn btn-sm settings-action-btn modal-primary-btn"')
  })

  it('uses polished frontmatter toolbar labels and primary actions', () => {
    const html = renderModal()

    expect(html).toContain('>Derived</span>')
    expect(html).toContain('frontmatter-add-row-btn')
    expect(html).toMatch(/frontmatter-add-row-btn[^"]*modal-primary-btn|modal-primary-btn[^"]*frontmatter-add-row-btn/)
    expect(overlaysCss).toContain('grid-template-columns: auto auto auto auto minmax(0, 1fr);')
    expect(overlaysCss).toContain('.frontmatter-note-toolbar .frontmatter-add-row-btn')
    expect(settingsCss).toContain('.settings-action-btn.modal-primary-btn:not(:disabled):not([aria-disabled="true"])')
    expect(appCss).toContain('.vault-frontmatter-body .frontmatter-note-toolbar {\n  justify-content: stretch;')
    expect(appCss).not.toContain('grid-template-columns: repeat(auto-fit, minmax(128px, max-content));')
  })

  it('positions the import dialog outside the frontmatter modal bounds', () => {
    const importBackdropRule = getCssRule(overlaysCss, '.frontmatter-note-import-modal-backdrop')
    const importModalRule = getCssRule(overlaysCss, '.frontmatter-note-import-modal')

    expect(vaultAppSource).toContain(
      'className="modal-backdrop vault-modal-backdrop frontmatter-note-modal-backdrop"\n      role="presentation"\n      style={modalStyle}',
    )
    expect(vaultAppSource).not.toContain('aria-label="Frontmatter"\n        style={modalStyle}')
    expect(importBackdropRule).toContain('position: absolute;')
    expect(importBackdropRule).toContain('inset: 0;')
    expect(importBackdropRule).not.toContain('place-items: center;')
    expect(importModalRule).toContain('position: absolute;')
    expect(importModalRule).toContain('left: var(--frontmatter-note-modal-left, 50%);')
    expect(importModalRule).toContain('width: min(36rem, var(--frontmatter-note-modal-width, calc(100% - 32px)));')
    expect(importModalRule).toContain('transform: translate(-50%, -50%);')
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
    expect(vaultAppSource).toContain('frontmatterRowDropIndex')
    expect(vaultAppSource).toContain('data-frontmatter-row-id')
    expect(vaultAppSource).toContain('reorderFrontmatterItemsByTargetIndex(rows, sourceRowId, targetIndex)')
    expect(vaultAppSource).not.toContain('dropFrontmatterRow(event, row.id)')
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
