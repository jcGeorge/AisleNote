import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const baseCss = readFileSync(new URL('./base.css', import.meta.url), 'utf8')
const overlaysCss = readFileSync(new URL('./overlays.css', import.meta.url), 'utf8')
const editorShellCss = readFileSync(new URL('./editor-shell.css', import.meta.url), 'utf8')
const settingsCss = readFileSync(new URL('./settings.css', import.meta.url), 'utf8')
const appCss = readFileSync(new URL('../App.css', import.meta.url), 'utf8')

function extractRule(css: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return css.match(new RegExp(`${escapedSelector}\\s*\\{[^}]+\\}`))?.[0] ?? ''
}

function expectRule(css: string, selector: string, snippets: string[]) {
  const rule = extractRule(css, selector)
  expect(rule, `Missing CSS rule for ${selector}`).not.toBe('')
  snippets.forEach((snippet) => expect(rule).toContain(snippet))
  expect(rule).not.toMatch(/font-size:\s*(?:0\.\d+(?:em|rem)|var\(--ui-font-(?:2xs|xs|compact|small|hint|muted|menu|control|label|caption)\))/)
}

describe('readable interactive font styles', () => {
  it('keeps the app body font token aligned with note paragraph size', () => {
    expect(baseCss).toContain('--app-text-scale: var(--note-font-scale, 1);')
    expect(baseCss).toContain('--ui-font-body: calc(1rem * var(--app-text-scale, 1));')
  })

  it('uses body-sized text for shared menu and modal form controls', () => {
    [
      ['.tab-context-delete', ['font-size: 1em;']],
      ['.delete-ack-row', ['font-size: 1em;']],
      ['.delete-modal-actions .btn', ['font-size: 1em;']],
      ['.sort-modal-option-btn', ['font-size: 1em;']],
      ['.settings-modal-field', ['font-size: 1em;']],
      ['.settings-select-input', ['font-size: 1em;']],
      ['.frontmatter-derived-switch', ['font-size: 1em;']],
      ['.note-location-picker-chip', ['--rail-control-font-size: 1em;']],
      ['.note-picker-aisle-choice', ['font-size: 1em;']],
      ['.note-reference-heading-label', ['font-size: 1em;']],
      ['.note-reference-heading-btn', ['font-size: 1em;']],
      ['.note-copy-behavior-label', ['font-size: 1em;']],
      ['.note-reference-mode-btn', ['font-size: 1em;']],
      ['.shortcut-menu-operation-chip', ['font-size: 1em;']],
    ].forEach(([selector, snippets]) => expectRule(overlaysCss, selector as string, snippets as string[]))
  })

  it('uses body-sized text for editor popovers, menus, prompts, and form controls', () => {
    [
      ['.context-preview-action-menu', ['font-size: var(--ui-font-body);']],
      ['.context-preview-action-menu-item', ['font: inherit;', 'font-size: 1em;']],
      ['.note-tools-item', ['font-size: 1em;']],
      ['.note-heading-choice-level-5', ['font-size: 1em;']],
      ['.note-heading-choice-level-6', ['font-size: 1em;']],
      ['.note-heading-choice-paragraph', ['font-size: 1em;']],
      ['.aisle-toc-heading-btn,\n.aisle-toc-link-open-btn', ['font-size: 1em;']],
      ['.aisle-edit-modal .btn', ['font-size: 1em;']],
      ['.shortcut-menu-item', ['font-size: 1em;']],
      ['.tag-autocomplete-item', ['font-size: 1em;']],
      [
        '.find-replace-field span,\n.find-replace-check,\n.find-replace-count,\n.find-replace-scope-title,\n.find-replace-error',
        ['font-size: 1em;'],
      ],
      ['.find-replace-scope-button', ['font-size: 1em;']],
      ['.find-replace-actions button', ['font-size: 1em;']],
      ['.table-tool-btn', ['font-size: 1em;']],
      ['.link-prompt-title', ['font-size: 1em;']],
      ['.link-prompt-field', ['font-size: 1em;']],
      ['.link-prompt-input', ['font-size: 1em;']],
      ['.link-prompt-btn', ['font-size: 1em;']],
    ].forEach(([selector, snippets]) => expectRule(editorShellCss, selector as string, snippets as string[]))
  })

  it('uses body-sized text for settings controls', () => {
    [
      ['.settings-text-input', ['font-size: 1em;']],
      ['.settings-section-tab', ['font-size: 1em;']],
      ['.frontmatter-boolean-switch-label', ['font-size: 1em;']],
      ['.theme-switch-option', ['font-size: 1em;']],
      ['.settings-segmented-option', ['font-size: 1em;']],
      ['.custom-theme-slot-label', ['font-size: 1em;']],
      ['.settings-shortcut-btn', ['font-size: 1em;']],
      ['.settings-shortcut-select', ['font-size: 1em;']],
    ].forEach(([selector, snippets]) => expectRule(settingsCss, selector as string, snippets as string[]))
  })

  it('uses body-sized text for note action picker controls', () => {
    [
      ['.notebook-note-action-picker,\n.notebook-decouple-dialog', ['font-size: var(--ui-font-body);']],
      ['.notebook-note-action-url input,\n.notebook-note-action-search', ['font: inherit;']],
      ['.notebook-note-action-query', ['font: inherit;', 'line-height: 1.35;']],
      [
        '.notebook-note-action-url button,\n.notebook-note-action-choice,\n.notebook-decouple-actions button',
        ['font: inherit;'],
      ],
      ['.notebook-note-action-preview-aisle,\n.notebook-note-action-preview-insert', ['font: inherit;']],
    ].forEach(([selector, snippets]) => expectRule(appCss, selector as string, snippets as string[]))
  })
})
