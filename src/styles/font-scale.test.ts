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
      'rail-controls.css',
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

describe('editor heading styles', () => {
  it('keeps editor heading font sizes explicit and descending', () => {
    const css = readStyle('editor-content.css')

    expect(css).toContain(
      '.toastui-editor-contents h1,\n.toastui-editor .ProseMirror h1 {\n  font-size: calc(1.35rem * var(--note-font-scale, 1)) !important;',
    )
    expect(css).toContain(
      '.toastui-editor-contents h2,\n.toastui-editor .ProseMirror h2 {\n  font-size: calc(1.2rem * var(--note-font-scale, 1)) !important;',
    )
    expect(css).toContain(
      '.toastui-editor-contents h3,\n.toastui-editor .ProseMirror h3 {\n  font-size: calc(1.08rem * var(--note-font-scale, 1)) !important;',
    )
    expect(css).toContain(
      '.toastui-editor-contents h4,\n.toastui-editor .ProseMirror h4 {\n  font-size: calc(1rem * var(--note-font-scale, 1)) !important;',
    )
    expect(css).toContain(
      '.toastui-editor-contents h5,\n.toastui-editor .ProseMirror h5 {\n  font-size: calc(0.92rem * var(--note-font-scale, 1)) !important;',
    )
    expect(css).toContain(
      '.toastui-editor-contents h6,\n.toastui-editor .ProseMirror h6 {\n  font-size: calc(0.86rem * var(--note-font-scale, 1)) !important;',
    )
  })
})

describe('editor annotation styles', () => {
  it('positions the double-dash annotation marker below the text midline', () => {
    const css = readStyle('editor-content.css')

    expect(css).toContain(
      '.toastui-editor-contents p.tabs-annotation-line::before,\n.toastui-editor .ProseMirror p.tabs-annotation-line::before {',
    )
    expect(css).toContain('top: 1.18em;')
  })
})

describe('compact scope tab scaling styles', () => {
  it('uses one shared rail control sizing contract for rail buttons', () => {
    const appCss = readStyle('../App.css')
    const railCss = readStyle('rail-controls.css')
    const railControlRule = extractRule(railCss, '.rail-control,\n.compact-scope-btn,\n.tab-btn,\n.add-tab-btn')

    expect(appCss.indexOf("@import './styles/base.css';")).toBeLessThan(
      appCss.indexOf("@import './styles/rail-controls.css';"),
    )
    expect(appCss.indexOf("@import './styles/rail-controls.css';")).toBeLessThan(
      appCss.indexOf("@import './styles/topbar.css';"),
    )
    expect(railControlRule).toContain('--rail-control-flex: 0 0 auto;')
    expect(railControlRule).toContain('--rail-control-max-width: calc(300px * var(--tab-button-scale));')
    expect(railControlRule).toContain('--rail-control-min-width: calc(56px * var(--tab-button-scale));')
    expect(railControlRule).toContain('--rail-control-height: var(--tab-control-height);')
    expect(railControlRule).toContain('--rail-control-padding: calc(0.2rem * var(--tab-button-scale)) calc(0.5rem * var(--tab-button-scale));')
    expect(railControlRule).toContain('--rail-control-radius: calc(0.42rem * var(--tab-button-scale));')
    expect(railControlRule).toContain('--rail-control-font-size: calc(0.95rem * var(--tab-button-scale) * var(--app-text-scale, 1));')
    expect(railControlRule).toContain('--rail-control-line-height: calc(1.1 * var(--tab-button-scale));')
    expect(railControlRule).toContain('flex: var(--rail-control-flex);')
    expect(railControlRule).toContain('max-width: var(--rail-control-max-width);')
    expect(railControlRule).toContain('min-width: var(--rail-control-min-width);')
    expect(railControlRule).toContain('min-height: var(--rail-control-height);')
    expect(railControlRule).toContain('padding: var(--rail-control-padding);')
    expect(railControlRule).toContain('border: 1px solid var(--rail-control-border, transparent);')
    expect(railControlRule).toContain('border-radius: var(--rail-control-radius);')
    expect(railControlRule).toContain('font-family: inherit;')
    expect(railControlRule).toContain('font-size: var(--rail-control-font-size);')
    expect(railControlRule).toContain('line-height: var(--rail-control-line-height);')
    expect(railControlRule).not.toContain('--rail-control-text:')
    expect(railControlRule).not.toContain('--rail-control-bg:')
    expect(railControlRule).not.toContain('--rail-control-border:')
  })

  it('lets theme preview rail samples inherit settings font scaling', () => {
    const settingsCss = readStyle('settings.css')
    const previewCanvasRule = extractRule(settingsCss, '.visuals-preview-canvas')
    const previewRailRowRule = extractRule(settingsCss, '.visuals-preview-rail-row')
    const previewPanelRule = extractRule(settingsCss, '.visuals-preview-panel')
    const previewButtonRule = extractRule(settingsCss, '.visuals-preview-pill')

    expect(previewCanvasRule).not.toContain('box-shadow:')
    expect(previewCanvasRule).toContain('gap: 0;')
    expect(previewCanvasRule).toContain('overflow: hidden;')
    expect(previewCanvasRule).toContain('border: 1px solid var(--visuals-preview-border);')
    expect(previewCanvasRule).toContain('border-radius: 0.42rem;')
    expect(previewCanvasRule).toContain('padding: 0;')
    expect(previewCanvasRule).toContain('background: transparent;')
    expect(previewRailRowRule).toContain('display: flex;')
    expect(previewRailRowRule).not.toContain('grid-template-columns')
    expect(previewRailRowRule).toContain('gap: 0.25rem;')
    expect(previewRailRowRule).toContain('row-gap: 0.35rem;')
    expect(previewRailRowRule).toContain('padding: 0.24rem 0.5rem;')
    expect(previewRailRowRule).toContain('border-bottom: 1px solid var(--nav-rail-border);')
    expect(previewRailRowRule).toContain('background: var(--nav-rail-bg);')
    expect(previewPanelRule).not.toContain('border: 1px solid var(--visuals-preview-border);')
    expect(previewButtonRule).toContain('font-size: calc(0.95em * var(--tab-button-scale));')
    expect(previewButtonRule).not.toContain('width: 100%;')
    expect(previewButtonRule).not.toContain('max-width: none;')
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

  it('keeps every note-page sort button on the shared rail control color', () => {
    const tabsCss = readStyle('tabs.css')
    const topbarCss = readStyle('topbar.css')
    const parentSortRule = extractRule(tabsCss, '.tabbar .tab-sort-btn')
    const subtabSortRule = extractRule(tabsCss, '.subtabbar .tab-sort-btn')
    const compactSortRule = extractRule(topbarCss, '.compact-scope-rail .compact-scope-sort-btn')

    expect(parentSortRule).toContain('color: var(--rail-control-text);')
    expect(subtabSortRule).toContain('color: var(--rail-control-text);')
    expect(subtabSortRule).not.toContain('var(--subtab-btn-text)')
    expect(compactSortRule).toContain('color: var(--rail-control-text);')
  })

  it('uses one shared nav rail background surface for all note-page rows', () => {
    const baseCss = readStyle('base.css')
    const topbarCss = readStyle('topbar.css')
    const tabRowsRule = extractLastRule(topbarCss, '.tabbar,\n.subtabbar')
    const compactRailRule = extractRule(topbarCss, '.compact-scope-rail')

    expect(baseCss).toContain('--nav-rail-bg:')
    expect(baseCss).toContain('--nav-rail-border:')
    expect(baseCss).toContain('--tabbar-border: var(--nav-rail-border);')
    expect(baseCss).toContain('--tabbar-bg: var(--nav-rail-bg);')
    expect(baseCss).toContain('--subtabbar-bg: var(--nav-rail-bg);')

    for (const themeFile of ['themes/light.css', 'themes/dawn.css', 'themes/blues.css']) {
      const themeCss = readStyle(themeFile)
      expect(themeCss).toContain('--nav-rail-bg:')
      expect(themeCss).toContain('--nav-rail-border:')
      expect(themeCss).toContain('--tabbar-border: var(--nav-rail-border);')
      expect(themeCss).toContain('--tabbar-bg: var(--nav-rail-bg);')
      expect(themeCss).toContain('--subtabbar-bg: var(--nav-rail-bg);')
    }

    expect(tabRowsRule).toContain('background: var(--nav-rail-bg);')
    expect(compactRailRule).toContain('background: var(--nav-rail-bg);')
    expect(topbarCss).toContain('border-bottom: 1px solid var(--nav-rail-border);')
    expect(topbarCss).not.toContain('background: var(--tabbar-bg);')
    expect(topbarCss).not.toContain('background: var(--subtabbar-bg);')
    expect(topbarCss).not.toContain('border-bottom: 1px solid var(--tabbar-border);')
  })

  it('uses shared semantic rail colors for compact scope buttons', () => {
    const baseCss = readStyle('base.css')
    const railCss = readStyle('rail-controls.css')
    const tabsCss = readStyle('tabs.css')
    const topbarCss = readStyle('topbar.css')
    const hoverRule = extractRule(railCss, '.rail-control:hover,\n.compact-scope-btn:hover,\n.tab-btn:hover')
    const selectedRule = extractRule(
      railCss,
      ".rail-control.is-selected,\n.rail-control.is-active,\n.rail-control[aria-selected='true'],\n.rail-control[aria-pressed='true'],\n.compact-scope-btn.is-active,\n.compact-scope-btn.is-selected,\n.compact-scope-btn[aria-selected='true'],\n.compact-scope-btn[aria-pressed='true'],\n.tab-btn.is-selected,\n.tab-btn[aria-selected='true'],\n.tab-btn[aria-pressed='true']",
    )
    const domainRule = extractRule(railCss, '.rail-control.is-domain,\n.compact-domain-btn')
    const spaceRule = extractRule(railCss, '.rail-control.is-space,\n.compact-space-btn')
    const parentRule = extractRule(railCss, '.rail-control.is-parent,\n.parent-tab-btn')
    const subtabRule = extractRule(railCss, '.rail-control.is-subtab,\n.subtab-btn')
    const arrangeSelectedDomainRule = extractRule(topbarCss, '.compact-domain-btn.is-arrange-selected')
    const arrangeSelectedSpaceRule = extractRule(topbarCss, '.compact-space-btn.is-arrange-selected')
    const arrangeSelectedParentRule = extractRule(tabsCss, '.parent-tab-btn.is-arrange-selected')
    const arrangeSelectedSubTabRule = extractRule(tabsCss, '.subtab-btn.is-arrange-selected')
    const addTabRule = extractLastRule(tabsCss, '.add-tab-btn')
    const addTabHoverRule = extractRule(tabsCss, '.add-tab-btn:hover')
    const trashActiveRule = extractRule(topbarCss, '.trash-domain-btn.is-active,\n.trash-space-btn.is-active')

    expect(baseCss).toContain('--domain-rail-accent: #a95429;')
    expect(baseCss).toContain('--space-rail-accent: #997b28;')
    expect(baseCss).toContain('--parent-rail-accent: #2f5da8;')
    expect(baseCss).toContain('--subtab-rail-accent: #2f8a5f;')
    expect(baseCss).toContain('--domain-rail-accent: var(--custom-palette-domain-rail);')
    expect(baseCss).toContain('--space-rail-accent: var(--custom-palette-space-rail);')
    expect(baseCss).toContain('--parent-rail-accent: var(--custom-palette-parent-rail);')
    expect(baseCss).toContain('--subtab-rail-accent: var(--custom-palette-subtab-rail);')
    expect(baseCss).toContain('--domain-rail-text: color-mix(in srgb, var(--domain-rail-accent) 16%, var(--app-text-bright));')
    expect(baseCss).toContain('--space-rail-text: color-mix(in srgb, var(--space-rail-accent) 18%, var(--app-text-bright));')
    expect(baseCss).toContain('--parent-rail-text: color-mix(in srgb, var(--parent-rail-accent) 18%, var(--app-text-bright));')
    expect(baseCss).toContain('--subtab-rail-text: color-mix(in srgb, var(--subtab-rail-accent) 20%, var(--app-text-bright));')
    expect(baseCss).toContain('--domain-rail-bg: color-mix(in srgb, var(--nav-rail-bg) 58%, var(--domain-rail-accent));')
    expect(baseCss).toContain('--space-rail-bg: color-mix(in srgb, var(--nav-rail-bg) 58%, var(--space-rail-accent));')
    expect(baseCss).toContain('--parent-rail-bg: color-mix(in srgb, var(--nav-rail-bg) 58%, var(--parent-rail-accent));')
    expect(baseCss).toContain('--subtab-rail-bg: color-mix(in srgb, var(--nav-rail-bg) 58%, var(--subtab-rail-accent));')
    expect(baseCss).toContain('--domain-rail-border: color-mix(in srgb, var(--domain-rail-accent) 72%, var(--app-text-muted));')
    expect(baseCss).toContain('--space-rail-border: color-mix(in srgb, var(--space-rail-accent) 72%, var(--app-text-muted));')
    expect(baseCss).toContain('--parent-rail-border: color-mix(in srgb, var(--parent-rail-accent) 72%, var(--app-text-muted));')
    expect(baseCss).toContain('--subtab-rail-border: color-mix(in srgb, var(--subtab-rail-accent) 72%, var(--app-text-muted));')
    expect(baseCss).toContain('--domain-rail-hover-bg: color-mix(in srgb, var(--nav-rail-bg) 46%, var(--domain-rail-accent));')
    expect(baseCss).toContain('--space-rail-hover-bg: color-mix(in srgb, var(--nav-rail-bg) 46%, var(--space-rail-accent));')
    expect(baseCss).toContain('--parent-rail-hover-bg: color-mix(in srgb, var(--nav-rail-bg) 46%, var(--parent-rail-accent));')
    expect(baseCss).toContain('--subtab-rail-hover-bg: color-mix(in srgb, var(--nav-rail-bg) 46%, var(--subtab-rail-accent));')
    expect(baseCss).toContain('--domain-rail-hover-border: color-mix(in srgb, var(--domain-rail-accent) 72%, var(--app-text-bright));')
    expect(baseCss).toContain('--space-rail-hover-border: color-mix(in srgb, var(--space-rail-accent) 72%, var(--app-text-bright));')
    expect(baseCss).toContain('--parent-rail-hover-border: color-mix(in srgb, var(--parent-rail-accent) 72%, var(--app-text-bright));')
    expect(baseCss).toContain('--subtab-rail-hover-border: color-mix(in srgb, var(--subtab-rail-accent) 72%, var(--app-text-bright));')
    expect(baseCss).toContain('color-mix(in srgb, var(--domain-rail-accent) 82%, white) 0%')
    expect(baseCss).toContain('color-mix(in srgb, var(--space-rail-accent) 82%, white) 0%')
    expect(baseCss).toContain('color-mix(in srgb, var(--parent-rail-accent) 82%, white) 0%')
    expect(baseCss).toContain('color-mix(in srgb, var(--subtab-rail-accent) 82%, white) 0%')
    expect(baseCss).toContain('--rail-control-text: var(--app-text-soft);')
    expect(baseCss).toContain('--add-tab-text: var(--rail-control-text);')
    expect(baseCss).toContain('--add-tab-bg: transparent;')
    expect(baseCss).toContain('--add-tab-border: transparent;')
    expect(baseCss).toContain('--add-tab-hover-bg: transparent;')
    expect(baseCss).toContain('--add-tab-hover-border: transparent;')
    expect(baseCss).not.toContain('--rail-chip-light-text:')
    expect(baseCss).not.toContain('--domain-rail-selected-shadow:')
    expect(baseCss).not.toContain('inset 0 -2px 0 var(--domain-rail-selected-border)')

    expect(baseCss).toContain('--tab-btn-text: var(--parent-rail-text);')
    expect(baseCss).toContain('--tab-btn-bg: var(--parent-rail-bg);')
    expect(baseCss).toContain('--tab-btn-border: var(--parent-rail-border);')
    expect(baseCss).toContain('--subtab-btn-text: var(--subtab-rail-text);')
    expect(baseCss).toContain('--subtab-btn-bg: var(--subtab-rail-bg);')
    expect(baseCss).toContain('--subtab-btn-border: var(--subtab-rail-border);')
    expect(baseCss).toContain('--tab-arrange-preview-bg: var(--parent-rail-selected-bg);')
    expect(baseCss).toContain('--tab-arrange-preview-border: var(--parent-rail-selected-border);')
    expect(baseCss).toContain('--tab-arrange-preview-text: var(--parent-rail-selected-text);')
    expect(baseCss).toContain('--space-arrange-preview-bg: var(--space-rail-selected-bg);')

    expect(hoverRule).toContain('border-color: var(--rail-control-hover-border, var(--rail-control-border, transparent));')
    expect(hoverRule).toContain('background: var(--rail-control-hover-bg, var(--rail-control-bg, transparent));')
    expect(hoverRule).toContain('color: var(--rail-control-hover-text, var(--rail-control-text, currentColor));')
    expect(selectedRule).toContain(
      'border-color: var(--rail-control-selected-border, var(--rail-control-border, transparent)) !important;',
    )
    expect(selectedRule).toContain(
      'background: var(--rail-control-selected-bg, var(--rail-control-bg, transparent)) !important;',
    )
    expect(selectedRule).toContain(
      'color: var(--rail-control-selected-text, var(--rail-control-text, currentColor)) !important;',
    )
    expect(domainRule).toContain('--rail-control-text: var(--domain-rail-text);')
    expect(domainRule).toContain('--rail-control-bg: var(--domain-rail-bg);')
    expect(domainRule).toContain('--rail-control-border: var(--domain-rail-border);')
    expect(domainRule).toContain('--rail-control-hover-text: var(--domain-rail-hover-text);')
    expect(domainRule).toContain('--rail-control-hover-bg: var(--domain-rail-hover-bg);')
    expect(domainRule).toContain('--rail-control-hover-border: var(--domain-rail-hover-border);')
    expect(domainRule).toContain('--rail-control-selected-text: var(--domain-rail-selected-text);')
    expect(domainRule).toContain('--rail-control-selected-bg: var(--domain-rail-selected-bg);')
    expect(domainRule).toContain('--rail-control-selected-border: var(--domain-rail-selected-border);')
    expect(domainRule).not.toContain('--trash-parent')
    expect(arrangeSelectedDomainRule).toContain('color: var(--domain-rail-selected-text) !important;')
    expect(arrangeSelectedDomainRule).toContain('background: var(--domain-rail-selected-bg) !important;')
    expect(arrangeSelectedDomainRule).toContain('border-color: var(--domain-rail-selected-border) !important;')

    expect(spaceRule).toContain('--rail-control-text: var(--space-rail-text);')
    expect(spaceRule).toContain('--rail-control-bg: var(--space-rail-bg);')
    expect(spaceRule).toContain('--rail-control-border: var(--space-rail-border);')
    expect(spaceRule).toContain('--rail-control-hover-text: var(--space-rail-hover-text);')
    expect(spaceRule).toContain('--rail-control-hover-bg: var(--space-rail-hover-bg);')
    expect(spaceRule).toContain('--rail-control-hover-border: var(--space-rail-hover-border);')
    expect(spaceRule).toContain('--rail-control-selected-text: var(--space-rail-selected-text);')
    expect(spaceRule).toContain('--rail-control-selected-bg: var(--space-rail-selected-bg);')
    expect(spaceRule).toContain('--rail-control-selected-border: var(--space-rail-selected-border);')
    expect(spaceRule).not.toContain('#d6bd71')
    expect(spaceRule).not.toContain('#1b170d')
    expect(spaceRule).not.toContain('#72591e')
    expect(arrangeSelectedSpaceRule).toContain('color: var(--space-rail-selected-text) !important;')
    expect(arrangeSelectedSpaceRule).toContain('background: var(--space-rail-selected-bg) !important;')
    expect(arrangeSelectedSpaceRule).toContain('border-color: var(--space-rail-selected-border) !important;')
    expect(parentRule).toContain('--rail-control-text: var(--parent-rail-text);')
    expect(parentRule).toContain('--rail-control-bg: var(--parent-rail-bg);')
    expect(parentRule).toContain('--rail-control-border: var(--parent-rail-border);')
    expect(parentRule).toContain('--rail-control-selected-text: var(--parent-rail-selected-text);')
    expect(parentRule).toContain('--rail-control-selected-bg: var(--parent-rail-selected-bg);')
    expect(parentRule).toContain('--rail-control-selected-border: var(--parent-rail-selected-border);')
    expect(arrangeSelectedParentRule).toContain('color: var(--parent-tab-selected-text) !important;')
    expect(arrangeSelectedParentRule).toContain('background: var(--parent-tab-selected-bg) !important;')
    expect(arrangeSelectedParentRule).toContain('border-color: var(--parent-tab-selected-border) !important;')
    expect(subtabRule).toContain('--rail-control-text: var(--subtab-rail-text);')
    expect(subtabRule).toContain('--rail-control-bg: var(--subtab-rail-bg);')
    expect(subtabRule).toContain('--rail-control-border: var(--subtab-rail-border);')
    expect(subtabRule).toContain('--rail-control-selected-text: var(--subtab-rail-selected-text);')
    expect(subtabRule).toContain('--rail-control-selected-bg: var(--subtab-rail-selected-bg);')
    expect(subtabRule).toContain('--rail-control-selected-border: var(--subtab-rail-selected-border);')
    expect(arrangeSelectedSubTabRule).toContain('color: var(--subtab-selected-text) !important;')
    expect(arrangeSelectedSubTabRule).toContain('background: var(--subtab-selected-bg) !important;')
    expect(arrangeSelectedSubTabRule).toContain('border-color: var(--subtab-selected-border) !important;')

    expect(addTabRule).toContain('color: var(--add-tab-text) !important;')
    expect(addTabRule).toContain('background-color: var(--add-tab-bg) !important;')
    expect(addTabRule).toContain('border-color: var(--add-tab-border) !important;')
    expect(addTabHoverRule).toContain('background-color: var(--add-tab-hover-bg) !important;')
    expect(addTabHoverRule).toContain('border-color: var(--add-tab-hover-border) !important;')

    expect(trashActiveRule).toContain('box-shadow: none;')
    expect(trashActiveRule).not.toContain('inset 0 0 0 2px')

    for (const themeFile of ['themes/light.css', 'themes/dawn.css', 'themes/blues.css']) {
      const themeCss = readStyle(themeFile)
      expect(themeCss).not.toContain('--domain-rail-accent:')
      expect(themeCss).not.toContain('--space-rail-accent:')
      expect(themeCss).not.toContain('--parent-rail-accent:')
      expect(themeCss).not.toContain('--subtab-rail-accent:')
      expect(themeCss).not.toContain('--rail-control-text:')
      expect(themeCss).not.toContain('--add-tab-text:')
      expect(themeCss).not.toContain('--add-tab-bg:')
      expect(themeCss).not.toContain('--add-tab-border:')
      expect(themeCss).not.toContain('--add-tab-hover-bg:')
      expect(themeCss).not.toContain('--add-tab-hover-border:')
    }
  })

  it('uses semantic rail colors for note mention navigator chips', () => {
    const editorShellCss = readStyle('editor-shell.css')
    const menuSource = readFileSync(join(styleDir, '../components/editor/NoteMentionMenu.tsx'), 'utf8')
    const chipRule = extractRule(editorShellCss, '.note-mention-nav-chip')

    const expectRailVariables = (selector: string, rail: string) => {
      const rule = extractRule(editorShellCss, selector)

      expect(rule).toContain(`--rail-control-text: var(--${rail}-rail-text);`)
      expect(rule).toContain(`--rail-control-bg: var(--${rail}-rail-bg);`)
      expect(rule).toContain(`--rail-control-border: var(--${rail}-rail-border);`)
      expect(rule).toContain(`--rail-control-hover-text: var(--${rail}-rail-hover-text);`)
      expect(rule).toContain(`--rail-control-hover-bg: var(--${rail}-rail-hover-bg);`)
      expect(rule).toContain(`--rail-control-hover-border: var(--${rail}-rail-hover-border);`)
      expect(rule).toContain(`--rail-control-selected-text: var(--${rail}-rail-selected-text);`)
      expect(rule).toContain(`--rail-control-selected-bg: var(--${rail}-rail-selected-bg);`)
      expect(rule).toContain(`--rail-control-selected-border: var(--${rail}-rail-selected-border);`)
    }

    expect(menuSource).toContain('className={`rail-control note-mention-nav-chip')
    expect(editorShellCss).not.toContain('note-mention-row-label')
    expectRailVariables('.note-mention-nav-row.is-domain-row', 'domain')
    expectRailVariables('.note-mention-nav-row.is-space-row', 'space')
    expectRailVariables('.note-mention-nav-row.is-tab-row', 'parent')
    expectRailVariables('.note-mention-nav-row.is-note-row', 'subtab')
    expect(chipRule).toContain('--rail-control-max-width: 11rem;')
    expect(chipRule).toContain('--rail-control-min-width: 0;')
    expect(chipRule).not.toContain('--rail-control-font-size')
    expect(chipRule).not.toContain('--rail-control-height')
    expect(chipRule).not.toContain('--rail-control-padding')
    expect(editorShellCss).not.toContain('--note-mention-chip-')
  })

  it('reuses rail button classes for context preview title buttons', () => {
    const editorShellCss = readStyle('editor-shell.css')
    const widgetSource = readFileSync(join(styleDir, '../editor/note-preview-widget.ts'), 'utf8')
    const previewWidgetRule = extractRule(editorShellCss, '.note-context-widget')
    const previewTopRule = extractRule(editorShellCss, '.note-context-widget .context-bar-top')
    const titleRule = extractRule(editorShellCss, '.context-preview-title-btn')
    const titleEditorRule = extractRule(
      editorShellCss,
      '.toastui-editor .ProseMirror .note-context-widget .context-preview-title-btn,\n.toastui-editor-contents .note-context-widget .context-preview-title-btn',
    )

    expect(widgetSource).toContain("'rail-control context-preview-title-btn compact-scope-btn compact-domain-btn is-domain'")
    expect(widgetSource).toContain("'rail-control context-preview-title-btn compact-scope-btn compact-space-btn is-space'")
    expect(widgetSource).toContain("'rail-control context-preview-title-btn btn btn-sm tab-btn parent-tab-btn is-parent'")
    expect(widgetSource).toContain("'rail-control context-preview-title-btn btn btn-sm tab-btn subtab-btn is-subtab'")
    expect(previewWidgetRule).toContain('--context-preview-title-control-height: calc(30px * var(--tab-button-scale));')
    expect(previewTopRule).toContain('min-height: 0;')
    expect(previewTopRule).toContain('padding: 0.16rem 0.5rem;')
    expect(titleRule).toContain('--rail-control-flex: 0 1 auto;')
    expect(titleRule).toContain('--rail-control-max-width: min(calc(300px * var(--tab-button-scale)), 100%);')
    expect(titleRule).toContain('--rail-control-height: var(--context-preview-title-control-height);')
    expect(titleRule).toContain('--rail-control-padding: calc(0.14rem * var(--tab-button-scale)) calc(0.5rem * var(--tab-button-scale));')
    expect(titleRule).toContain('--rail-control-font-weight: 400;')
    expect(titleEditorRule).toContain('height: auto !important;')
    expect(titleEditorRule).toContain('min-height: var(--rail-control-height) !important;')
    expect(titleEditorRule).toContain('padding: var(--rail-control-padding) !important;')
    expect(titleEditorRule).toContain('color: var(--rail-control-text) !important;')
    expect(titleEditorRule).toContain('background: var(--rail-control-bg) !important;')
    expect(titleEditorRule).toContain('background-color: var(--rail-control-bg) !important;')
    expect(titleEditorRule).toContain('border: 1px solid var(--rail-control-border) !important;')
    expect(titleEditorRule).toContain('border-color: var(--rail-control-border) !important;')
    expect(titleEditorRule).toContain('outline: 1px solid var(--rail-control-border) !important;')
    expect(titleEditorRule).toContain('outline-offset: -1px !important;')
    expect(titleEditorRule).toContain('box-shadow: inset 0 0 0 1px var(--rail-control-border) !important;')
    expect(titleEditorRule).toContain('font-size: var(--rail-control-font-size) !important;')
    expect(titleEditorRule).toContain('font-weight: 400 !important;')
    expect(titleEditorRule).toContain('line-height: var(--rail-control-line-height) !important;')
    expect(titleEditorRule).toContain('border-radius: var(--rail-control-radius) !important;')
    expect(editorShellCss).not.toContain('.context-preview-title-btn.is-domain')
    expect(editorShellCss).not.toContain('.context-preview-title-btn.is-space')
    expect(editorShellCss).not.toContain('.context-preview-title-btn.parent-tab-btn,\n.toastui-editor-contents')
    expect(editorShellCss).not.toContain('.context-preview-title-btn.subtab-btn,\n.toastui-editor-contents')
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
