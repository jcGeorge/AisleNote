import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const styleDir = dirname(fileURLToPath(import.meta.url))

function readStyle(fileName: string): string {
  return readFileSync(join(styleDir, fileName), 'utf8')
}

function extractRule(css: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return css.match(new RegExp(`${escapedSelector}\\s*\\{[^}]+\\}`))?.[0] ?? ''
}

function extractLastRule(css: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return css.match(new RegExp(`${escapedSelector}\\s*\\{[^}]+\\}`, 'g'))?.at(-1) ?? ''
}

describe('menu font scaling styles', () => {
  it('defines shared ui font tokens from the note font scale', () => {
    const css = readStyle('base.css')

    expect(css).toContain('--app-text-scale: var(--note-font-scale, 1);')
    expect(css).toContain('--ui-font-body: calc(1rem * var(--app-text-scale, 1));')
    expect(css).toContain('--ui-font-muted: calc(0.86rem * var(--app-text-scale, 1));')
  })

  it('keeps menu and overlay font-size declarations tied to scale variables or inherited sizing', () => {
    const files = [
      'editor-base.css',
      'editor-content.css',
      'editor-shell.css',
      'editor-tasks.css',
      'overlays.css',
      'settings.css',
      'stage-manager.css',
      'topbar.css',
      'toasts.css',
    ]
    const unscaledDeclarations = files.flatMap((fileName) => {
      const css = readStyle(fileName)
      return (css.match(/font-size:\s*[^;]+;/g) ?? [])
        .filter((declaration) => declaration.includes('rem') && !declaration.includes('var('))
        .map((declaration) => `${fileName}: ${declaration}`)
    })

    expect(unscaledDeclarations).toEqual([])
  })
})

describe('compact scope tab scaling styles', () => {
  it('uses the parent and sub-tab sizing contract for compact space/domain buttons', () => {
    const topbarCss = readStyle('topbar.css')
    const compactButtonRule = extractRule(topbarCss, '.compact-scope-btn')

    expect(compactButtonRule).toContain('max-width: calc(300px * var(--tab-button-scale));')
    expect(compactButtonRule).toContain('min-width: calc(56px * var(--tab-button-scale));')
    expect(compactButtonRule).toContain('min-height: var(--tab-control-height);')
    expect(compactButtonRule).toContain('padding: calc(0.2rem * var(--tab-button-scale)) calc(0.5rem * var(--tab-button-scale));')
    expect(compactButtonRule).toContain('font-size: calc(0.95rem * var(--tab-button-scale));')
    expect(compactButtonRule).toContain('line-height: calc(1.1 * var(--tab-button-scale));')
    expect(compactButtonRule).toContain('border-radius: calc(0.42rem * var(--tab-button-scale));')
  })

  it('uses parent/sub-tab rename input styling for compact space/domain rename inputs', () => {
    const topbarCss = readStyle('topbar.css')
    const compactScopeRailsSource = readFileSync(
      join(styleDir, '../components/navigation/CompactScopeRails.tsx'),
      'utf8',
    )

    expect(topbarCss).not.toContain('.space-rename-input.compact-scope-rename-input')
    expect(compactScopeRailsSource).toContain('className="tab-rename-input compact-scope-rename-input"')
    expect(compactScopeRailsSource).not.toContain('className="space-rename-input compact-scope-rename-input"')
  })

  it('applies the mobile tab sizing overrides to compact scope controls', () => {
    const responsiveCss = readStyle('responsive.css')
    const mobileMinHeightRule = responsiveCss.match(
      /\.tab-btn,[\s\S]*?min-height: var\(--tab-control-height\);/,
    )?.[0] ?? ''
    const mobileMaxWidthRule = responsiveCss.match(
      /\.tab-btn,[\s\S]*?max-width: min\(calc\(220px \* var\(--tab-button-scale\)\), 68vw\);/,
    )?.[0] ?? ''

    expect(mobileMinHeightRule).toContain('.compact-scope-btn,')
    expect(mobileMinHeightRule).not.toContain('.space-rename-input.compact-scope-rename-input')
    expect(mobileMaxWidthRule).toContain('.compact-scope-btn,')
    expect(mobileMaxWidthRule).not.toContain('.space-rename-input.compact-scope-rename-input')
  })

  it('keeps every note-page sort button on the parent-tab text color', () => {
    const tabsCss = readStyle('tabs.css')
    const topbarCss = readStyle('topbar.css')
    const parentSortRule = extractRule(tabsCss, '.tabbar .tab-sort-btn')
    const subtabSortRule = extractRule(tabsCss, '.subtabbar .tab-sort-btn')
    const compactSortRule = extractRule(topbarCss, '.compact-scope-rail .compact-scope-sort-btn')

    expect(parentSortRule).toContain('color: var(--tab-btn-text);')
    expect(subtabSortRule).toContain('color: var(--tab-btn-text);')
    expect(subtabSortRule).not.toContain('var(--subtab-btn-text)')
    expect(compactSortRule).toContain('color: var(--tab-btn-text);')
  })

  it('uses trash-red domain tabs and gold space tabs with selected states', () => {
    const topbarCss = readStyle('topbar.css')
    const domainRule = extractRule(topbarCss, '.compact-domain-btn')
    const domainHoverRule = extractRule(topbarCss, '.compact-domain-btn:hover')
    const spaceRule = extractRule(topbarCss, '.compact-space-btn')
    const activeDomainRule = extractLastRule(topbarCss, '.compact-domain-btn.is-active')
    const activeSpaceRule = extractLastRule(topbarCss, '.compact-space-btn.is-active')
    const trashActiveRule = extractRule(topbarCss, '.trash-domain-btn.is-active,\n.trash-space-btn.is-active')

    expect(domainRule).toContain('color: var(--trash-parent-text);')
    expect(domainRule).toContain('background: var(--trash-parent-bg);')
    expect(domainRule).toContain('border-color: var(--trash-parent-border);')
    expect(domainHoverRule).toContain('color: var(--trash-parent-hover-text);')
    expect(domainHoverRule).toContain('background: var(--trash-parent-hover-bg);')
    expect(domainHoverRule).toContain('border-color: var(--trash-parent-hover-border);')
    expect(activeDomainRule).toContain('color: var(--trash-parent-selected-text) !important;')
    expect(activeDomainRule).toContain('background: var(--trash-parent-selected-bg) !important;')
    expect(activeDomainRule).toContain('border-color: var(--trash-parent-selected-border) !important;')
    expect(activeDomainRule).toContain('box-shadow: none;')
    expect(activeDomainRule).not.toContain('inset 0 0 0 2px')

    expect(spaceRule).toContain('color: #d6bd71;')
    expect(spaceRule).toContain('background: #1b170d;')
    expect(spaceRule).toContain('border-color: #72591e;')
    expect(activeSpaceRule).toContain('color: #1b1506 !important;')
    expect(activeSpaceRule).toContain('background: linear-gradient(180deg, #d7b34e 0%, #b98e31 100%) !important;')
    expect(activeSpaceRule).toContain('border-color: #ebcf77 !important;')
    expect(activeSpaceRule).toContain('box-shadow: none;')
    expect(activeSpaceRule).not.toContain('inset 0 0 0 2px')

    expect(trashActiveRule).toContain('box-shadow: none;')
    expect(trashActiveRule).not.toContain('inset 0 0 0 2px')
  })
})

describe('table cell styles', () => {
  it('normalizes table header cells to body cell text styling', () => {
    const baseCss = readStyle('base.css')
    const editorContentCss = readStyle('editor-content.css')
    const editorShellCss = readStyle('editor-shell.css')

    expect(baseCss).toContain('--editor-table-grid-border:')
    expect(baseCss).toContain(
      '--editor-table-grid-border: color-mix(in srgb, var(--custom-palette-border) 62%, var(--custom-palette-text));',
    )
    expect(editorContentCss).toContain('.toastui-editor-contents table,\n.toastui-editor .ProseMirror table')
    expect(editorContentCss).toContain('border: 1px solid var(--editor-table-grid-border) !important;')
    expect(editorContentCss).toContain('.toastui-editor-contents th,\n.toastui-editor .ProseMirror th')
    expect(editorContentCss).toContain('font-style: inherit !important;')
    expect(editorContentCss).toContain('font-weight: inherit !important;')
    expect(editorContentCss).toContain('text-align: inherit !important;')
    expect(editorShellCss).toContain('border: 1px solid var(--editor-table-grid-border);')
    expect(editorShellCss).toContain('.aisle-edit-preview th')
    expect(editorShellCss).toContain('font-style: inherit;')
    expect(editorShellCss).toContain('font-weight: inherit;')
    expect(editorShellCss).toContain('text-align: inherit;')
  })
})

describe('table of contents panel styles', () => {
  it('centers the per-aisle table of contents panel without adding a backdrop', () => {
    const editorShellCss = readStyle('editor-shell.css')
    const layerRule = editorShellCss.match(/\.aisle-toc-panel-layer\s*\{[^}]+\}/)?.[0] ?? ''

    expect(layerRule).toContain('align-items: center;')
    expect(layerRule).toContain('justify-content: center;')
    expect(layerRule).toContain('background: transparent;')
  })
})
