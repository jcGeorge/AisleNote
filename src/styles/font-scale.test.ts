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
    expect(css).toContain('--toolbar-button-scale: 1;')
    expect(css).not.toContain('--tooltip-scale')
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

  it('keeps modal option selectors on the compact picker button rhythm', () => {
    const css = readStyle('overlays.css')
    const modeButtonRule = extractRule(css, '.note-reference-mode-btn')

    expect(modeButtonRule).toContain('min-height: 1.85rem;')
    expect(modeButtonRule).toContain('border-radius: 0.42rem;')
    expect(modeButtonRule).toContain('padding: 0.24rem 0.55rem;')
    expect(modeButtonRule).toContain('font-size: 0.84em;')
    expect(modeButtonRule).toContain('line-height: 1.2;')
    expect(css).not.toContain('.note-copy-behavior-mode .note-reference-mode-btn')
  })

  it('top-anchors insert note reference modals without changing other modal positioning', () => {
    const css = readStyle('overlays.css')
    const backdropRule = extractRule(css, '.delete-modal-backdrop.insert-note-reference-backdrop')
    const shellRule = extractRule(css, '.settings-modal.note-picker-modal.insert-note-reference-modal-shell')
    const baseBackdropRule = extractRule(css, '.delete-modal-backdrop')

    expect(baseBackdropRule).toContain('align-items: center;')
    expect(baseBackdropRule).toContain('justify-content: center;')
    expect(backdropRule).toContain('align-items: flex-start;')
    expect(backdropRule).toContain('overflow-y: auto;')
    expect(backdropRule).toContain('box-sizing: border-box;')
    expect(backdropRule).toContain('padding: clamp(1.25rem, 8vh, 4rem) 1rem 1rem;')
    expect(shellRule).toContain('flex: 0 0 auto;')
  })

  it('uses a custom note aisle horizontal scrollbar instead of native scrollbar chrome', () => {
    const css = readStyle('editor-shell.css')
    const nativeScrollRule = extractRule(css, '.note-aisle-scroll')
    const nativeWebkitRule = extractRule(css, '.note-aisle-scroll::-webkit-scrollbar')
    const customBarRule = extractRule(css, '.note-aisle-horizontal-scrollbar')
    const customTrackRule = extractRule(css, '.note-aisle-horizontal-scrollbar-track')
    const customThumbRule = extractRule(css, '.note-aisle-horizontal-scrollbar-thumb')

    expect(nativeScrollRule).toContain('overflow-x: auto;')
    expect(nativeScrollRule).toContain('overflow-y: hidden;')
    expect(nativeScrollRule).toContain('scrollbar-width: none;')
    expect(nativeScrollRule).toContain('-ms-overflow-style: none;')
    expect(nativeWebkitRule).toContain('width: 0;')
    expect(nativeWebkitRule).toContain('height: 0;')
    expect(nativeWebkitRule).toContain('display: none;')
    expect(customBarRule).toContain('flex: 0 0 0.85rem;')
    expect(customBarRule).toContain('height: 0.85rem;')
    expect(customBarRule).toContain('border-top: 1px solid var(--app-border-muted);')
    expect(customBarRule).toContain('background: var(--app-surface);')
    expect(customTrackRule).toContain('cursor: pointer;')
    expect(customTrackRule).toContain('touch-action: none;')
    expect(customThumbRule).toContain('min-width: 3rem;')
    expect(customThumbRule).toContain('border: 0.2rem solid var(--app-surface);')
    expect(customThumbRule).toContain('background: var(--app-border);')
    expect(customThumbRule).toContain('cursor: grab;')
  })

  it('contains edit aisle horizontal overflow inside the modal', () => {
    const css = readStyle('editor-shell.css')
    const tabCss = readStyle('tabs.css')
    const topbarCss = readStyle('topbar.css')
    const modalRule = extractRule(css, '.aisle-edit-modal')
    const shellRule = extractRule(css, '.aisle-edit-scroll-shell')
    const listRule = extractRule(css, '.aisle-edit-list')
    const nativeWebkitRule = extractRule(css, '.aisle-edit-list::-webkit-scrollbar')
    const customBarRule = extractRule(css, '.aisle-edit-horizontal-scrollbar.note-aisle-horizontal-scrollbar')
    const editCardRule = extractRule(css, '.aisle-edit-card')
    const beforeDropRule = extractRule(css, '.aisle-edit-card.is-drop-target-before')
    const afterDropRule = extractRule(css, '.aisle-edit-card.is-drop-target-after')
    const beforeDropNeighborRule = extractRule(css, '.aisle-edit-card.is-drop-neighbor-before')
    const afterDropNeighborRule = extractRule(css, '.aisle-edit-card.is-drop-neighbor-after')
    const draggedDropNeighborRule = extractRule(css, '.aisle-edit-card.is-dragging.is-drop-neighbor-before')
    const parentNeighborRule = extractRule(tabCss, '.parent-tab-btn.is-arrange-neighbor-before')
    const subtabNeighborRule = extractRule(tabCss, '.subtab-btn.is-arrange-neighbor-after')
    const draggedTabNeighborRule = extractRule(tabCss, '.tab-btn.is-arrangeable.is-dragging.is-arrange-neighbor-before')
    const compactDomainNeighborRule = extractRule(topbarCss, '.compact-domain-btn.is-arrange-neighbor-before')
    const compactSpaceNeighborRule = extractRule(topbarCss, '.compact-space-btn.is-arrange-neighbor-after')
    const draggedCompactNeighborRule = extractRule(
      topbarCss,
      '.compact-scope-btn.is-arrangeable.is-dragging.is-arrange-neighbor-before',
    )

    expect(modalRule).toContain('max-width: calc(100vw - 2rem);')
    expect(modalRule).toContain('min-width: 0;')
    expect(modalRule).toContain('overflow: hidden;')
    expect(shellRule).toContain('min-width: 0;')
    expect(shellRule).toContain('width: 100%;')
    expect(shellRule).toContain('max-width: 100%;')
    expect(shellRule).toContain('overflow: hidden;')
    expect(listRule).toContain('min-width: 0;')
    expect(listRule).toContain('width: 100%;')
    expect(listRule).toContain('max-width: 100%;')
    expect(listRule).toContain('overflow-x: auto;')
    expect(listRule).toContain('scrollbar-width: none;')
    expect(nativeWebkitRule).toContain('display: none;')
    expect(customBarRule).toContain('overflow: hidden;')
    expect(editCardRule).toContain('--aisle-edit-drag-border-color: var(--settings-control-border);')
    expect(beforeDropRule).toContain('border-color: var(--aisle-edit-drag-border-color);')
    expect(beforeDropRule).toContain('inset 3px 0 0 var(--aisle-edit-drag-border-color)')
    expect(afterDropRule).toContain('border-color: var(--aisle-edit-drag-border-color);')
    expect(afterDropRule).toContain('inset -3px 0 0 var(--aisle-edit-drag-border-color)')
    expect(beforeDropNeighborRule).toContain('inset 1px 0 0 color-mix')
    expect(beforeDropNeighborRule).toContain('var(--aisle-edit-drag-border-color) 14%, transparent')
    expect(afterDropNeighborRule).toContain('inset -1px 0 0 color-mix')
    expect(draggedDropNeighborRule).toContain('inset 1px 0 0 color-mix')
    expect(beforeDropRule).not.toContain('var(--subtab-target-border)')
    expect(afterDropRule).not.toContain('var(--subtab-target-border)')
    expect(beforeDropNeighborRule).not.toContain('var(--subtab-target-border)')
    expect(afterDropNeighborRule).not.toContain('var(--subtab-target-border)')
    expect(draggedDropNeighborRule).not.toContain('var(--subtab-target-border)')
    expect(parentNeighborRule).toContain('inset 1px 0 0 color-mix')
    expect(subtabNeighborRule).toContain('inset -1px 0 0 color-mix')
    expect(draggedTabNeighborRule).toContain('inset 1px 0 0 color-mix')
    expect(compactDomainNeighborRule).toContain('inset 1px 0 0 color-mix')
    expect(compactSpaceNeighborRule).toContain('inset -1px 0 0 color-mix')
    expect(draggedCompactNeighborRule).toContain('inset 1px 0 0 color-mix')
    expect(css).not.toContain('.aisle-edit-card.is-drop-target {')
  })

  it('renders toolbar layout spacers as cumulative fixed-width gaps', () => {
    const baseCss = readStyle('base.css')
    const editorBaseCss = readStyle('editor-base.css')
    const editorShellCss = readStyle('editor-shell.css')
    const responsiveCss = readStyle('responsive.css')
    const appShellRule = extractRule(baseCss, '.app-shell')
    const toolbarRule = extractRule(editorBaseCss, '.toastui-editor-toolbar')
    const toolbarButtonRule = extractRule(
      editorBaseCss,
      '.toastui-editor-defaultUI-toolbar button,\n.toastui-editor-toolbar button',
    )
    const sharedToolbarRule = extractRule(editorShellCss, '.note-shared-toolbar')
    const groupRule = extractRule(editorShellCss, '.note-shared-toolbar .toastui-editor-toolbar-group')
    const spacerRule = extractRule(editorShellCss, '.note-toolbar-layout-spacer')

    expect(appShellRule).toContain('--editor-toolbar-button-size: max(26px, calc(26px * var(--toolbar-button-scale)));')
    expect(appShellRule).toContain('--editor-toolbar-min-height: calc(var(--editor-toolbar-button-size) + 6px);')
    expect(toolbarRule).toContain('min-height: var(--editor-toolbar-min-height) !important;')
    expect(toolbarRule).toContain('padding: calc(0.125rem * var(--toolbar-button-scale)) calc(0.25rem * var(--toolbar-button-scale)) !important;')
    expect(toolbarRule).not.toContain('--tab-button-scale')
    expect(toolbarButtonRule).toContain('width: var(--editor-toolbar-button-size) !important;')
    expect(toolbarButtonRule).toContain('height: var(--editor-toolbar-button-size) !important;')
    expect(editorBaseCss).toContain('.toolbar-tool-icon')
    expect(editorBaseCss).toContain('width: 20px;')
    expect(editorBaseCss).toContain('height: 20px;')
    expect(editorBaseCss).toContain('transform: scale(var(--toolbar-button-scale));')
    expect(editorBaseCss).not.toContain('transform: scale(var(--tab-button-scale));')
    expect(sharedToolbarRule).toContain('--editor-toolbar-spacer-width: 0.9rem;')
    expect(sharedToolbarRule).toContain('min-height: var(--editor-toolbar-min-height);')
    expect(groupRule).toContain('margin-right: 0 !important;')
    expect(spacerRule).toContain('flex: 0 0 var(--editor-toolbar-spacer-width);')
    expect(spacerRule).toContain('min-width: var(--editor-toolbar-spacer-width);')
    expect(spacerRule).toContain('height: var(--editor-toolbar-button-size);')
    expect(responsiveCss).toContain('--editor-toolbar-button-size: max(32px, calc(26px * var(--toolbar-button-scale)));')
    expect(responsiveCss).toContain('--editor-toolbar-spacer-width: 0.8rem;')
    expect(baseCss).not.toContain('--editor-toolbar-sprite-width')
    expect(editorBaseCss).not.toContain('background-size:')
    expect(editorBaseCss).not.toMatch(/background-(?:position|position-x|position-y|size):[^;{]*var\(--tab-button-scale\)/)
  })

  it('keeps app-owned tooltip popovers fixed-size and independent from toolbar or tab scale', () => {
    const editorBaseCss = readStyle('editor-base.css')
    const toastsCss = readStyle('toasts.css')
    const appTooltipRule = extractRule(toastsCss, '.app-tooltip')
    const toastUiTooltipHiddenRule = extractRule(editorBaseCss, '.app-shell .toastui-editor-tooltip,\nbody.app-tooltips-disabled .toastui-editor-tooltip')

    expect(toastsCss).toContain('.app-tooltip-layer')
    expect(appTooltipRule).toContain('font-size: 13px;')
    expect(appTooltipRule).toContain('padding: 4px 8px;')
    expect(appTooltipRule).toContain('border-radius: 0.28rem;')
    expect(appTooltipRule).not.toContain('--toolbar-button-scale')
    expect(appTooltipRule).not.toContain('--tab-button-scale')
    expect(appTooltipRule).not.toContain('--tooltip-scale')
    expect(appTooltipRule).not.toContain('--app-tooltip')
    expect(toastUiTooltipHiddenRule).toContain('display: none !important;')
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

  it('removes top margin only for first headings in note editor surfaces', () => {
    const css = readStyle('editor-content.css')
    const firstHeadingRule = extractRule(
      css,
      '.note-aisle-editor-shell .toastui-editor .ProseMirror > h1:first-child,\n.note-aisle-editor-shell .toastui-editor .ProseMirror > h2:first-child,\n.note-aisle-editor-shell .toastui-editor .ProseMirror > h3:first-child,\n.note-aisle-editor-shell .toastui-editor .ProseMirror > h4:first-child,\n.note-aisle-editor-shell .toastui-editor .ProseMirror > h5:first-child,\n.note-aisle-editor-shell .toastui-editor .ProseMirror > h6:first-child,\n.note-aisle-editor-shell .toastui-editor-contents > h1:first-child,\n.note-aisle-editor-shell .toastui-editor-contents > h2:first-child,\n.note-aisle-editor-shell .toastui-editor-contents > h3:first-child,\n.note-aisle-editor-shell .toastui-editor-contents > h4:first-child,\n.note-aisle-editor-shell .toastui-editor-contents > h5:first-child,\n.note-aisle-editor-shell .toastui-editor-contents > h6:first-child,\n.aisle-editor-preview-fallback > h1:first-child,\n.aisle-editor-preview-fallback > h2:first-child,\n.aisle-editor-preview-fallback > h3:first-child,\n.aisle-editor-preview-fallback > h4:first-child,\n.aisle-editor-preview-fallback > h5:first-child,\n.aisle-editor-preview-fallback > h6:first-child',
    )

    expect(firstHeadingRule).toContain('margin-top: 0 !important;')
  })
})

describe('editor list marker styles', () => {
  it('keeps ordered list markers wide enough for two-digit counters', () => {
    const css = readStyle('editor-content.css')
    const orderedListRule = extractRule(css, '.toastui-editor-contents ol,\n.toastui-editor .ProseMirror ol')
    const orderedMarkerRule = extractRule(
      css,
      '.toastui-editor-contents ol > li::before,\n.toastui-editor .ProseMirror ol > li::before',
    )

    expect(orderedListRule).toContain('padding-left: 4ch !important;')
    expect(orderedMarkerRule).toContain('width: 3.5ch !important;')
    expect(orderedMarkerRule).toContain('margin-left: -4ch !important;')
    expect(orderedMarkerRule).toContain('white-space: nowrap !important;')
    expect(orderedMarkerRule).toContain('text-align: right !important;')
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

  it('renders annotation arrows with the editor text color at full opacity', () => {
    const css = readStyle('editor-content.css')
    const lineArrowRule = extractRule(
      css,
      '.toastui-editor-contents p.tabs-annotation-line-arrow::before,\n.toastui-editor .ProseMirror p.tabs-annotation-line-arrow::before',
    )
    const inlineArrowContainerRule = extractRule(
      css,
      '.toastui-editor-contents .tabs-annotation-inline-arrow,\n.toastui-editor .ProseMirror .tabs-annotation-inline-arrow',
    )
    const inlineArrowShapeRule = extractRule(
      css,
      '.toastui-editor-contents .tabs-annotation-inline-arrow::before,\n.toastui-editor .ProseMirror .tabs-annotation-inline-arrow::before',
    )
    const inlineHorizontalPositionRule = extractRule(
      css,
      '.toastui-editor-contents .tabs-annotation-inline-arrow.tabs-annotation-line-arrow-right::before,\n.toastui-editor .ProseMirror .tabs-annotation-inline-arrow.tabs-annotation-line-arrow-right::before,\n.toastui-editor-contents .tabs-annotation-inline-arrow.tabs-annotation-line-arrow-left::before,\n.toastui-editor .ProseMirror .tabs-annotation-inline-arrow.tabs-annotation-line-arrow-left::before',
    )
    const lineHorizontalPositionRule = extractRule(
      css,
      '.toastui-editor-contents p.tabs-annotation-line-arrow-right::before,\n.toastui-editor .ProseMirror p.tabs-annotation-line-arrow-right::before,\n.toastui-editor-contents p.tabs-annotation-line-arrow-left::before,\n.toastui-editor .ProseMirror p.tabs-annotation-line-arrow-left::before',
    )
    const rightArrowMaskRule = extractRule(
      css,
      '.toastui-editor-contents p.tabs-annotation-line-arrow-right::before,\n.toastui-editor .ProseMirror p.tabs-annotation-line-arrow-right::before,\n.toastui-editor-contents .tabs-annotation-inline-arrow.tabs-annotation-line-arrow-right::before,\n.toastui-editor .ProseMirror .tabs-annotation-inline-arrow.tabs-annotation-line-arrow-right::before',
    )
    const leftArrowMaskRule = extractRule(
      css,
      '.toastui-editor-contents p.tabs-annotation-line-arrow-left::before,\n.toastui-editor .ProseMirror p.tabs-annotation-line-arrow-left::before,\n.toastui-editor-contents .tabs-annotation-inline-arrow.tabs-annotation-line-arrow-left::before,\n.toastui-editor .ProseMirror .tabs-annotation-inline-arrow.tabs-annotation-line-arrow-left::before',
    )
    const turnArrowCss = css.slice(
      css.indexOf('.toastui-editor-contents p.tabs-annotation-line-arrow-up::before'),
      css.indexOf('.toastui-editor-contents .tabs-annotation-line-marker,'),
    )
    const turnArrowCurveRule = extractRule(
      css,
      '.toastui-editor-contents p.tabs-annotation-line-arrow-up::before,\n.toastui-editor .ProseMirror p.tabs-annotation-line-arrow-up::before,\n.toastui-editor-contents p.tabs-annotation-line-arrow-down::before,\n.toastui-editor .ProseMirror p.tabs-annotation-line-arrow-down::before,\n.toastui-editor-contents .tabs-annotation-inline-arrow.tabs-annotation-line-arrow-up::before,\n.toastui-editor .ProseMirror .tabs-annotation-inline-arrow.tabs-annotation-line-arrow-up::before,\n.toastui-editor-contents .tabs-annotation-inline-arrow.tabs-annotation-line-arrow-down::before,\n.toastui-editor .ProseMirror .tabs-annotation-inline-arrow.tabs-annotation-line-arrow-down::before',
    )
    const turnArrowHeadRule = extractRule(
      css,
      '.toastui-editor-contents p.tabs-annotation-line-arrow-up::after,\n.toastui-editor .ProseMirror p.tabs-annotation-line-arrow-up::after,\n.toastui-editor-contents p.tabs-annotation-line-arrow-down::after,\n.toastui-editor .ProseMirror p.tabs-annotation-line-arrow-down::after,\n.toastui-editor-contents .tabs-annotation-inline-arrow.tabs-annotation-line-arrow-up::after,\n.toastui-editor .ProseMirror .tabs-annotation-inline-arrow.tabs-annotation-line-arrow-up::after,\n.toastui-editor-contents .tabs-annotation-inline-arrow.tabs-annotation-line-arrow-down::after,\n.toastui-editor .ProseMirror .tabs-annotation-inline-arrow.tabs-annotation-line-arrow-down::after',
    )
    const turnArrowSizingRule = extractRule(
      css,
      '.toastui-editor-contents p.tabs-annotation-line-arrow-up,\n.toastui-editor .ProseMirror p.tabs-annotation-line-arrow-up,\n.toastui-editor-contents p.tabs-annotation-line-arrow-down,\n.toastui-editor .ProseMirror p.tabs-annotation-line-arrow-down,\n.toastui-editor-contents .tabs-annotation-inline-arrow.tabs-annotation-line-arrow-up,\n.toastui-editor .ProseMirror .tabs-annotation-inline-arrow.tabs-annotation-line-arrow-up,\n.toastui-editor-contents .tabs-annotation-inline-arrow.tabs-annotation-line-arrow-down,\n.toastui-editor .ProseMirror .tabs-annotation-inline-arrow.tabs-annotation-line-arrow-down',
    )
    const inlineTurnSizingRule = extractLastRule(
      css,
      '.toastui-editor-contents .tabs-annotation-inline-arrow.tabs-annotation-line-arrow-up,\n.toastui-editor .ProseMirror .tabs-annotation-inline-arrow.tabs-annotation-line-arrow-up,\n.toastui-editor-contents .tabs-annotation-inline-arrow.tabs-annotation-line-arrow-down,\n.toastui-editor .ProseMirror .tabs-annotation-inline-arrow.tabs-annotation-line-arrow-down',
    )
    const upLineCurvePositionRule = extractRule(
      css,
      '.toastui-editor-contents p.tabs-annotation-line-arrow-up::before,\n.toastui-editor .ProseMirror p.tabs-annotation-line-arrow-up::before',
    )
    const upLineHeadPositionRule = extractRule(
      css,
      '.toastui-editor-contents p.tabs-annotation-line-arrow-up::after,\n.toastui-editor .ProseMirror p.tabs-annotation-line-arrow-up::after',
    )
    const upInlineTailLeftCurveRule = extractRule(
      css,
      '.toastui-editor-contents .tabs-annotation-inline-arrow.tabs-annotation-line-arrow-up.tabs-annotation-line-tail-left::before,\n.toastui-editor .ProseMirror .tabs-annotation-inline-arrow.tabs-annotation-line-arrow-up.tabs-annotation-line-tail-left::before',
    )
    const upInlineTailLeftHeadRule = extractRule(
      css,
      '.toastui-editor-contents .tabs-annotation-inline-arrow.tabs-annotation-line-arrow-up.tabs-annotation-line-tail-left::after,\n.toastui-editor .ProseMirror .tabs-annotation-inline-arrow.tabs-annotation-line-arrow-up.tabs-annotation-line-tail-left::after',
    )
    const upInlineTailRightCurveRule = extractRule(
      css,
      '.toastui-editor-contents .tabs-annotation-inline-arrow.tabs-annotation-line-arrow-up.tabs-annotation-line-tail-right::before,\n.toastui-editor .ProseMirror .tabs-annotation-inline-arrow.tabs-annotation-line-arrow-up.tabs-annotation-line-tail-right::before',
    )
    const downLineCurvePositionRule = extractRule(
      css,
      '.toastui-editor-contents p.tabs-annotation-line-arrow-down::before,\n.toastui-editor .ProseMirror p.tabs-annotation-line-arrow-down::before',
    )
    const downLineHeadPositionRule = extractRule(
      css,
      '.toastui-editor-contents p.tabs-annotation-line-arrow-down::after,\n.toastui-editor .ProseMirror p.tabs-annotation-line-arrow-down::after',
    )
    const downInlineTailLeftCurveRule = extractRule(
      css,
      '.toastui-editor-contents .tabs-annotation-inline-arrow.tabs-annotation-line-arrow-down.tabs-annotation-line-tail-left::before,\n.toastui-editor .ProseMirror .tabs-annotation-inline-arrow.tabs-annotation-line-arrow-down.tabs-annotation-line-tail-left::before',
    )
    const downInlineTailLeftHeadRule = extractRule(
      css,
      '.toastui-editor-contents .tabs-annotation-inline-arrow.tabs-annotation-line-arrow-down.tabs-annotation-line-tail-left::after,\n.toastui-editor .ProseMirror .tabs-annotation-inline-arrow.tabs-annotation-line-arrow-down.tabs-annotation-line-tail-left::after',
    )
    const downInlineTailRightCurveRule = extractRule(
      css,
      '.toastui-editor-contents .tabs-annotation-inline-arrow.tabs-annotation-line-arrow-down.tabs-annotation-line-tail-right::before,\n.toastui-editor .ProseMirror .tabs-annotation-inline-arrow.tabs-annotation-line-arrow-down.tabs-annotation-line-tail-right::before',
    )
    const wysiwygMarkerRule = extractRule(
      css,
      '.toastui-editor .ProseMirror .tabs-annotation-line-marker.tabs-annotation-inline-arrow',
    )
    const wysiwygMarkerPseudoRule = extractRule(
      css,
      '.toastui-editor .ProseMirror .tabs-annotation-line-marker.tabs-annotation-inline-arrow::before',
    )

    expect(turnArrowCss).not.toContain('mask-image')
    expect(turnArrowCss).not.toContain('-webkit-mask-image')
    expect(turnArrowCss).not.toContain('data:image/svg+xml')
    expect(turnArrowCss).not.toContain("content: '⤴';")
    expect(turnArrowCss).not.toContain("content: '⤵';")
    expect(turnArrowCss).not.toContain('font-weight: 700;')
    expect(turnArrowCss).not.toContain('font-size: 0.96em;')
    expect(turnArrowCss).not.toContain('display: flex;')
    expect(turnArrowCss).not.toContain('scaleX(-1)')
    expect(turnArrowCss).not.toContain('--annotation-arrow-down-offset')
    expect(lineArrowRule).toContain('color: var(--editor-text) !important;')
    expect(lineArrowRule).toContain('width: 1.116rem;')
    expect(lineArrowRule).toContain('height: 1.116rem;')
    expect(lineArrowRule).toContain('background: currentColor !important;')
    expect(lineArrowRule).toContain('opacity: 1;')
    expect(lineArrowRule).toContain('mask-size: contain;')
    expect(inlineArrowContainerRule).toContain('--annotation-arrow-size: 1.116rem;')
    expect(inlineArrowContainerRule).toContain('width: var(--annotation-arrow-size);')
    expect(inlineArrowContainerRule).toContain('height: 1em;')
    expect(inlineArrowContainerRule).toContain('color: var(--editor-text) !important;')
    expect(inlineArrowContainerRule).toContain('vertical-align: baseline;')
    expect(inlineArrowContainerRule).toContain('opacity: 1;')
    expect(inlineArrowShapeRule).toContain("content: '';")
    expect(inlineArrowShapeRule).toContain('width: var(--annotation-arrow-size);')
    expect(inlineArrowShapeRule).toContain('height: var(--annotation-arrow-size);')
    expect(inlineArrowShapeRule).toContain('color: var(--editor-text) !important;')
    expect(inlineArrowShapeRule).toContain('background: currentColor !important;')
    expect(inlineArrowShapeRule).toContain('opacity: 1;')
    expect(inlineHorizontalPositionRule).toContain('top: 82%;')
    expect(lineHorizontalPositionRule).toContain('top: 0.48em;')
    expect(rightArrowMaskRule).toContain('mask-image: url("data:image/svg+xml')
    expect(rightArrowMaskRule).toContain('-webkit-mask-image: url("data:image/svg+xml')
    expect(leftArrowMaskRule).toContain('mask-image: url("data:image/svg+xml')
    expect(leftArrowMaskRule).toContain('-webkit-mask-image: url("data:image/svg+xml')
    expect(turnArrowCurveRule).toContain('width: 0.48em;')
    expect(turnArrowCurveRule).toContain('height: 0.48em;')
    expect(turnArrowCurveRule).toContain('background: transparent !important;')
    expect(turnArrowCurveRule).toContain('border-color: currentColor;')
    expect(turnArrowCurveRule).toContain('border-style: solid;')
    expect(turnArrowCurveRule).toContain('border-radius: 0.18em;')
    expect(turnArrowCurveRule).toContain('color: var(--editor-text) !important;')
    expect(turnArrowCurveRule).toContain('opacity: 1;')
    expect(turnArrowHeadRule).toContain("content: '';")
    expect(turnArrowHeadRule).toContain('border-left: var(--annotation-arrow-head) solid transparent;')
    expect(turnArrowHeadRule).toContain('border-right: var(--annotation-arrow-head) solid transparent;')
    expect(turnArrowHeadRule).toContain('color: var(--editor-text) !important;')
    expect(turnArrowHeadRule).toContain('opacity: 1;')
    expect(turnArrowSizingRule).toContain('--annotation-arrow-stroke: 0.14em;')
    expect(turnArrowSizingRule).toContain('--annotation-arrow-head: 0.27em;')
    expect(turnArrowSizingRule).toContain('--annotation-turn-up-shift: 0.08em;')
    expect(turnArrowSizingRule).toContain('--annotation-turn-down-shift: 0.20em;')
    expect(inlineTurnSizingRule).toContain('width: 0.95em;')
    expect(inlineTurnSizingRule).toContain('vertical-align: -0.08em;')
    expect(upLineCurvePositionRule).toContain('top: calc(0.58em + var(--annotation-turn-up-shift));')
    expect(upLineHeadPositionRule).toContain('top: calc(0.39em + var(--annotation-turn-up-shift));')
    expect(upLineHeadPositionRule).toContain('border-bottom: 0.29em solid currentColor;')
    expect(upInlineTailLeftCurveRule).toContain('top: calc(0.32em + var(--annotation-turn-up-shift));')
    expect(upInlineTailLeftCurveRule).toContain('border-right-width: var(--annotation-arrow-stroke);')
    expect(upInlineTailLeftCurveRule).toContain('border-bottom-width: var(--annotation-arrow-stroke);')
    expect(upInlineTailLeftCurveRule).toContain('transform: none;')
    expect(upInlineTailLeftHeadRule).toContain('top: calc(0.13em + var(--annotation-turn-up-shift));')
    expect(upInlineTailLeftHeadRule).toContain(
      'border-bottom: calc(var(--annotation-arrow-head) * 1.08) solid currentColor;',
    )
    expect(upInlineTailRightCurveRule).toContain('right: 0.24em;')
    expect(upInlineTailRightCurveRule).toContain('border-left-width: var(--annotation-arrow-stroke);')
    expect(downLineCurvePositionRule).toContain('top: calc(0.38em + var(--annotation-turn-down-shift));')
    expect(downLineHeadPositionRule).toContain('top: calc(0.77em + var(--annotation-turn-down-shift));')
    expect(downLineHeadPositionRule).toContain('border-top: 0.29em solid currentColor;')
    expect(downInlineTailLeftCurveRule).toContain('top: calc(0.16em + var(--annotation-turn-down-shift));')
    expect(downInlineTailLeftCurveRule).toContain('border-right-width: var(--annotation-arrow-stroke);')
    expect(downInlineTailLeftCurveRule).toContain('border-top-width: var(--annotation-arrow-stroke);')
    expect(downInlineTailLeftCurveRule).toContain('transform: none;')
    expect(downInlineTailLeftHeadRule).toContain('top: calc(0.55em + var(--annotation-turn-down-shift));')
    expect(downInlineTailLeftHeadRule).toContain(
      'border-top: calc(var(--annotation-arrow-head) * 1.08) solid currentColor;',
    )
    expect(downInlineTailRightCurveRule).toContain('right: 0.24em;')
    expect(downInlineTailRightCurveRule).toContain('border-left-width: var(--annotation-arrow-stroke);')
    expect(wysiwygMarkerRule).toContain('vertical-align: baseline;')
    expect(wysiwygMarkerPseudoRule).toContain('color: var(--editor-text) !important;')
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

  it('sizes the built-in theme switch for the current theme count', () => {
    const settingsCss = readStyle('settings.css')
    const responsiveCss = readStyle('responsive.css')
    const themeSwitchRule = extractRule(settingsCss, '.theme-switch')
    const settingsSegmentedRule = extractRule(settingsCss, '.settings-segmented-control')

    expect(themeSwitchRule).toContain('grid-template-columns: repeat(3, minmax(0, 1fr));')
    expect(themeSwitchRule).toContain('--theme-switch-option-selected-bg: var(--settings-switch-checked-bg);')
    expect(settingsSegmentedRule).toContain('--settings-segmented-option-selected-bg: var(--settings-switch-checked-bg);')
    expect(themeSwitchRule).not.toContain('var(--subtab-rail-accent)')
    expect(settingsSegmentedRule).not.toContain('var(--subtab-rail-accent)')
    expect(themeSwitchRule).not.toContain('repeat(4')
    expect(responsiveCss).not.toContain('.theme-switch {\n    grid-template-columns:')
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

  it('keeps the scratchpad tag count on the inherited rail button typography', () => {
    const tabsCss = readStyle('tabs.css')
    const countRule = extractRule(tabsCss, '.scratchpad-rail-tag-count')

    expect(countRule).toContain('font-size: inherit;')
    expect(countRule).toContain('line-height: inherit;')
    expect(countRule).not.toContain('0.78rem')
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

    for (const themeFile of ['themes/light.css', 'themes/dawn.css']) {
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
    const arrangeDomainVarsRule = extractRule(topbarCss, '.compact-domain-btn.is-arrangeable')
    const arrangeSpaceVarsRule = extractRule(topbarCss, '.compact-space-btn.is-arrangeable')
    const arrangeActiveScopeRule = extractRule(
      topbarCss,
      '.compact-scope-btn.is-arrangeable.is-active,\n.compact-scope-btn.is-arrangeable.is-active:hover,\n.compact-scope-btn.is-arrangeable.is-active:focus,\n.compact-scope-btn.is-arrangeable.is-active:active,\n.compact-scope-btn.is-arrange-selected',
    )
    const draggedTabRule = extractRule(tabsCss, '.tab-btn.is-arrangeable.is-dragging')
    const draggedScopeRule = extractRule(topbarCss, '.compact-scope-btn.is-arrangeable.is-dragging')
    const arrangeUnselectedScopeRule = extractRule(
      topbarCss,
      '.compact-scope-btn.is-arrangeable:not(.is-active):not(.is-arrange-selected):not(.is-dragging),\n.compact-scope-btn.is-arrangeable:not(.is-active):not(.is-arrange-selected):not(.is-dragging):hover,\n.compact-scope-btn.is-arrangeable:not(.is-active):not(.is-arrange-selected):not(.is-dragging):focus,\n.compact-scope-btn.is-arrangeable:not(.is-active):not(.is-arrange-selected):not(.is-dragging):active',
    )
    const arrangeDraggingScopeRule = draggedScopeRule
    const arrangeUnselectedParentRule = extractRule(
      tabsCss,
      ".parent-tab-btn.is-arrangeable:not(.is-arrange-selected):not(.is-dragging):not([aria-selected='true']),\n.parent-tab-btn.is-arrangeable:not(.is-arrange-selected):not(.is-dragging):not([aria-selected='true']):hover,\n.parent-tab-btn.is-arrangeable:not(.is-arrange-selected):not(.is-dragging):not([aria-selected='true']):focus,\n.parent-tab-btn.is-arrangeable:not(.is-arrange-selected):not(.is-dragging):not([aria-selected='true']):active",
    )
    const arrangeSelectedParentRule = extractRule(
      tabsCss,
      ".parent-tab-btn.is-arrangeable.is-dragging,\n.parent-tab-btn.is-arrangeable.is-dragging:hover,\n.parent-tab-btn.is-arrangeable.is-dragging:focus,\n.parent-tab-btn.is-arrangeable.is-dragging:active,\n.parent-tab-btn.is-arrangeable[aria-selected='true'],\n.parent-tab-btn.is-arrangeable[aria-selected='true']:hover,\n.parent-tab-btn.is-arrangeable[aria-selected='true']:focus,\n.parent-tab-btn.is-arrangeable[aria-selected='true']:active,\n.parent-tab-btn.is-arrange-selected",
    )
    const arrangeSubTabPressedRule = extractRule(
      tabsCss,
      '.subtab-btn.is-arrangeable,\n.subtab-btn.is-arrangeable:hover,\n.subtab-btn.is-arrangeable:focus,\n.subtab-btn.is-arrangeable:active',
    )
    const arrangeSelectedSubTabRule = extractRule(
      tabsCss,
      ".subtab-btn.is-arrangeable[aria-selected='true'],\n.subtab-btn.is-arrangeable[aria-selected='true']:hover,\n.subtab-btn.is-arrangeable[aria-selected='true']:focus,\n.subtab-btn.is-arrangeable[aria-selected='true']:active,\n.subtab-btn.is-arrangeable[aria-selected='true'].is-dragging,\n.subtab-btn.is-arrangeable.is-dragging,\n.subtab-btn.is-arrangeable.is-dragging:hover,\n.subtab-btn.is-arrangeable.is-dragging:focus,\n.subtab-btn.is-arrangeable.is-dragging:active,\n.subtab-btn.is-arrangeable.is-arrange-selected",
    )
    const arrangeSubTabSelectedPressedRule = arrangeSelectedSubTabRule
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
    expect(arrangeDomainVarsRule).toContain('--compact-scope-arrange-shadow: var(--domain-rail-arrangeable-shadow);')
    expect(arrangeDomainVarsRule).toContain('--compact-scope-dragging-shadow: var(--domain-rail-dragging-shadow);')
    expect(arrangeActiveScopeRule).toContain('color: var(--rail-control-selected-text) !important;')
    expect(arrangeActiveScopeRule).toContain('background: var(--rail-control-selected-bg) !important;')
    expect(arrangeActiveScopeRule).toContain('border-color: var(--rail-control-selected-border) !important;')
    expect(arrangeActiveScopeRule).toContain('background-color: var(--rail-control-selected-bg) !important;')
    expect(arrangeActiveScopeRule).toContain('var(--compact-scope-arrange-shadow)')
    expect(arrangeUnselectedScopeRule).toContain('color: var(--rail-control-text) !important;')
    expect(arrangeUnselectedScopeRule).toContain('background: var(--rail-control-bg) !important;')
    expect(arrangeUnselectedScopeRule).toContain('border-color: var(--rail-control-border) !important;')
    expect(arrangeUnselectedScopeRule).toContain('var(--compact-scope-arrange-shadow)')
    expect(arrangeDraggingScopeRule).toContain('color: var(--rail-control-selected-text) !important;')
    expect(arrangeDraggingScopeRule).toContain('background: var(--rail-control-selected-bg) !important;')
    expect(arrangeDraggingScopeRule).toContain('border-color: var(--rail-control-selected-border) !important;')
    expect(arrangeDraggingScopeRule).toContain('var(--compact-scope-dragging-shadow)')

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
    expect(arrangeSpaceVarsRule).toContain('--compact-scope-arrange-shadow: var(--space-rail-arrangeable-shadow);')
    expect(arrangeSpaceVarsRule).toContain('--compact-scope-dragging-shadow: var(--space-rail-dragging-shadow);')
    expect(parentRule).toContain('--rail-control-text: var(--parent-rail-text);')
    expect(parentRule).toContain('--rail-control-bg: var(--parent-rail-bg);')
    expect(parentRule).toContain('--rail-control-border: var(--parent-rail-border);')
    expect(parentRule).toContain('--rail-control-selected-text: var(--parent-rail-selected-text);')
    expect(parentRule).toContain('--rail-control-selected-bg: var(--parent-rail-selected-bg);')
    expect(parentRule).toContain('--rail-control-selected-border: var(--parent-rail-selected-border);')
    expect(arrangeUnselectedParentRule).toContain('color: var(--tab-btn-text) !important;')
    expect(arrangeUnselectedParentRule).toContain('background: var(--tab-btn-bg) !important;')
    expect(arrangeUnselectedParentRule).toContain('border-color: var(--tab-btn-border) !important;')
    expect(arrangeUnselectedParentRule).toContain('var(--tab-arrangeable-shadow)')
    expect(arrangeSelectedParentRule).toContain('color: var(--parent-tab-selected-text) !important;')
    expect(arrangeSelectedParentRule).toContain('background: var(--parent-tab-selected-bg) !important;')
    expect(arrangeSelectedParentRule).toContain('border-color: var(--parent-tab-selected-border) !important;')
    expect(subtabRule).toContain('--rail-control-text: var(--subtab-rail-text);')
    expect(subtabRule).toContain('--rail-control-bg: var(--subtab-rail-bg);')
    expect(subtabRule).toContain('--rail-control-border: var(--subtab-rail-border);')
    expect(subtabRule).toContain('--rail-control-selected-text: var(--subtab-rail-selected-text);')
    expect(subtabRule).toContain('--rail-control-selected-bg: var(--subtab-rail-selected-bg);')
    expect(subtabRule).toContain('--rail-control-selected-border: var(--subtab-rail-selected-border);')
    expect(subtabRule).toContain('--bs-btn-active-color: var(--rail-control-selected-text);')
    expect(subtabRule).toContain('--bs-btn-active-bg: var(--rail-control-selected-bg);')
    expect(subtabRule).toContain('--bs-btn-active-border-color: var(--rail-control-selected-border);')
    expect(arrangeSelectedSubTabRule).toContain('color: var(--subtab-selected-text) !important;')
    expect(arrangeSelectedSubTabRule).toContain('background: var(--subtab-selected-bg) !important;')
    expect(arrangeSelectedSubTabRule).toContain('border-color: var(--subtab-selected-border) !important;')
    expect(arrangeSubTabPressedRule).toContain('color: var(--subtab-btn-text) !important;')
    expect(arrangeSubTabPressedRule).toContain('background-color: var(--subtab-btn-bg) !important;')
    expect(arrangeSubTabPressedRule).toContain('border-color: var(--subtab-btn-border) !important;')
    expect(arrangeSubTabSelectedPressedRule).toContain('color: var(--subtab-selected-text) !important;')
    expect(arrangeSubTabSelectedPressedRule).toContain('background-color: var(--subtab-selected-bg) !important;')
    expect(arrangeSubTabSelectedPressedRule).toContain('border-color: var(--subtab-selected-border) !important;')
    expect(draggedTabRule).toContain('cursor: grabbing;')
    expect(draggedTabRule).not.toContain('opacity:')
    expect(draggedScopeRule).toContain('cursor: grabbing;')
    expect(draggedScopeRule).not.toContain('opacity:')

    expect(addTabRule).toContain('color: var(--add-tab-text) !important;')
    expect(addTabRule).toContain('background-color: var(--add-tab-bg) !important;')
    expect(addTabRule).toContain('border-color: var(--add-tab-border) !important;')
    expect(addTabHoverRule).toContain('background-color: var(--add-tab-hover-bg) !important;')
    expect(addTabHoverRule).toContain('border-color: var(--add-tab-hover-border) !important;')

    expect(trashActiveRule).toContain('box-shadow: none;')
    expect(trashActiveRule).not.toContain('inset 0 0 0 2px')

    for (const themeFile of ['themes/light.css', 'themes/dawn.css']) {
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
    const searchMenuRule = extractRule(editorShellCss, '.note-mention-menu.is-search')
    const resultTitleRule = extractRule(editorShellCss, '.note-mention-result-title')
    const resultContextRule = extractRule(editorShellCss, '.note-mention-result-context')
    const resultContextChipRule = extractRule(editorShellCss, '.note-mention-result-context-chip')
    const resultSubtabChipRule = extractRule(editorShellCss, '.note-mention-result-context-chip.is-subtab')

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
    expectRailVariables('.note-mention-nav-row.is-aisle-row', 'subtab')
    expect(chipRule).toContain('--rail-control-max-width: 11rem;')
    expect(chipRule).toContain('--rail-control-min-width: 0;')
    expect(chipRule).not.toContain('--rail-control-font-size')
    expect(chipRule).not.toContain('--rail-control-height')
    expect(chipRule).not.toContain('--rail-control-padding')
    expect(searchMenuRule).toContain('width: min(45.6rem, calc(100vw - 1rem));')
    expect(resultTitleRule).toContain('font-weight: 400;')
    expect(resultContextRule).toContain('justify-content: flex-end;')
    expect(resultContextChipRule).toContain('direction: rtl;')
    expect(resultContextChipRule).toContain('text-align: left;')
    expect(resultSubtabChipRule).toContain('flex: 0 0 auto;')
    expect(editorShellCss).not.toContain('--note-mention-chip-')
  })

  it('uses pointer-follow multi-item arrange preview ghost cards and respects reduced motion', () => {
    const css = readStyle('tabs.css')
    const tabPreviewRule = extractRule(css, '.tab-arrange-preview')
    const tabPreviewLabelRule = extractRule(css, '.tab-arrange-preview span')
    const sharedCardRule = extractRule(
      css,
      '.arrange-preview-card.tab-arrange-preview,\n.arrange-preview-card.compact-scope-arrange-preview',
    )
    const ghostRule = extractRule(css, '.arrange-preview-card.arrange-preview-ghost')
    const primaryRule = extractRule(css, '.arrange-preview-card.arrange-preview-primary')
    const firstGhostRule = extractRule(css, '.arrange-preview-card.arrange-preview-ghost.is-ghost-1')
    const secondGhostRule = extractRule(css, '.arrange-preview-card.arrange-preview-ghost.is-ghost-2')
    const thirdGhostRule = extractRule(css, '.arrange-preview-card.arrange-preview-ghost.is-ghost-3')
    const fourthGhostRule = extractRule(css, '.arrange-preview-card.arrange-preview-ghost.is-ghost-4')
    const reducedMotionRule = css.match(
      /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.arrange-preview-card\.arrange-preview-ghost\s*\{[^}]+\}\s*\}/,
    )?.[0] ?? ''

    expect(css).toContain('.arrange-preview-stack')
    expect(css).toContain('.arrange-preview-card.arrange-preview-primary')
    expect(css).not.toContain('@keyframes arrangePreviewGhostFlyIn')
    expect(css).not.toContain('animation-delay:')
    expect(tabPreviewRule).toContain('border-radius: var(--rail-control-radius);')
    expect(tabPreviewRule).toContain('padding: var(--rail-control-padding);')
    expect(tabPreviewRule).toContain('font-size: var(--rail-control-font-size);')
    expect(tabPreviewRule).toContain('line-height: var(--rail-control-line-height);')
    expect(tabPreviewRule).toContain('white-space: nowrap;')
    expect(tabPreviewRule).not.toContain('font-size: calc(0.95rem * var(--tab-button-scale));')
    expect(tabPreviewRule).not.toContain('line-height: calc(1.1 * var(--tab-button-scale));')
    expect(tabPreviewLabelRule).toContain('overflow: hidden;')
    expect(tabPreviewLabelRule).toContain('text-overflow: ellipsis;')
    expect(sharedCardRule).toContain('width: 100%;')
    expect(sharedCardRule).toContain('height: 100%;')
    expect(primaryRule).toContain(
      'transform: translate(var(--arrange-preview-primary-x, 0px), var(--arrange-preview-primary-y, 0px));',
    )
    expect(primaryRule).toContain('will-change: transform;')
    expect(ghostRule).toContain('opacity: var(--arrange-preview-ghost-opacity, 1);')
    expect(ghostRule).toContain('transform-origin: center;')
    expect(ghostRule).toContain(
      'transform: translate(var(--arrange-preview-ghost-x, 0px), var(--arrange-preview-ghost-y, 0px))',
    )
    expect(ghostRule).toContain('rotate(var(--arrange-preview-ghost-rotation, 0deg));')
    expect(ghostRule).toContain('will-change: transform;')
    expect(ghostRule).not.toContain('animation:')
    expect(firstGhostRule).toContain('--arrange-preview-ghost-rotation: -8deg;')
    expect(firstGhostRule).toContain('--arrange-preview-ghost-opacity: 1;')
    expect(secondGhostRule).toContain('--arrange-preview-ghost-rotation: 8deg;')
    expect(secondGhostRule).toContain('--arrange-preview-ghost-opacity: 1;')
    expect(thirdGhostRule).toContain('--arrange-preview-ghost-rotation: -12deg;')
    expect(thirdGhostRule).toContain('--arrange-preview-ghost-opacity: 1;')
    expect(fourthGhostRule).toContain('--arrange-preview-ghost-rotation: 12deg;')
    expect(fourthGhostRule).toContain('--arrange-preview-ghost-opacity: 1;')
    expect(css).not.toContain('--arrange-preview-ghost-mid-x:')
    expect(css).not.toContain('scale(1.2)')
    expect(reducedMotionRule).toContain('@media (prefers-reduced-motion: reduce)')
    expect(reducedMotionRule).toContain('will-change: auto;')
    expect(reducedMotionRule).toContain(
      'transform: translate(var(--arrange-preview-ghost-x, 0px), var(--arrange-preview-ghost-y, 0px))',
    )
    expect(reducedMotionRule).toContain('rotate(var(--arrange-preview-ghost-rotation, 0deg));')
  })

  it('left-aligns find result chips so long labels truncate from the right', () => {
    const editorShellCss = readStyle('editor-shell.css')
    const chipRule = extractRule(
      editorShellCss,
      '.find-replace-context-chip.rail-control,\n.find-replace-context-chip.compact-scope-btn,\n.find-replace-context-chip.tab-btn',
    )

    expect(chipRule).toContain('justify-content: flex-start;')
    expect(chipRule).toContain('text-align: left;')
  })

  it('reuses rail button classes for context preview title buttons', () => {
    const editorShellCss = readStyle('editor-shell.css')
    const widgetSource = readFileSync(join(styleDir, '../editor/note-preview-widget.ts'), 'utf8')
    const previewWidgetRule = extractRule(editorShellCss, '.note-context-widget')
    const previewTopRule = extractRule(editorShellCss, '.note-context-widget .context-bar-top')
    const previewTitleGroupRule = extractRule(editorShellCss, '.note-context-widget .context-bar-title')
    const previewTitleOverflowRule = extractRule(editorShellCss, '.note-context-widget .context-bar-title.is-overflowing')
    const titleRule = extractRule(editorShellCss, '.context-preview-title-btn')
    const noteTitleRule = extractRule(editorShellCss, '.note-context-widget .context-preview-title-btn')
    const navigationRule = extractRule(editorShellCss, '.context-preview-navigation-widget')
    const navigationTitleRule = extractRule(editorShellCss, '.context-preview-navigation-title')
    const actionsRule = extractRule(editorShellCss, '.context-bar-actions')
    const deleteRule = extractRule(editorShellCss, '.context-bar-delete-btn')
    const deleteIconRule = extractRule(editorShellCss, '.context-bar-delete-icon')
    const titleEditorRule = extractRule(
      editorShellCss,
      '.toastui-editor .ProseMirror .note-context-widget .context-preview-title-btn,\n.toastui-editor .ProseMirror .context-preview-navigation-widget .context-preview-title-btn,\n.toastui-editor-contents .note-context-widget .context-preview-title-btn,\n.toastui-editor-contents .context-preview-navigation-widget .context-preview-title-btn',
    )

    expect(widgetSource).toContain("'rail-control context-preview-title-btn compact-scope-btn compact-domain-btn is-domain'")
    expect(widgetSource).toContain("'rail-control context-preview-title-btn compact-scope-btn compact-space-btn is-space'")
    expect(widgetSource).toContain("'rail-control context-preview-title-btn btn btn-sm tab-btn parent-tab-btn is-parent'")
    expect(widgetSource).toContain("'rail-control context-preview-title-btn btn btn-sm tab-btn subtab-btn is-subtab'")
    expect(previewWidgetRule).not.toContain('--context-preview-title-control-height')
    expect(previewTopRule).toContain('min-height: 0;')
    expect(previewTopRule).toContain('padding: 0.16rem 0.5rem;')
    expect(previewTitleGroupRule).toContain('flex-wrap: nowrap;')
    expect(previewTitleGroupRule).toContain('justify-content: flex-start;')
    expect(previewTitleGroupRule).toContain('overflow: hidden;')
    expect(previewTitleOverflowRule).toContain('-webkit-mask-image: linear-gradient(to right, #000 0, #000 calc(100% - 1.75rem), transparent 100%);')
    expect(previewTitleOverflowRule).toContain('mask-image: linear-gradient(to right, #000 0, #000 calc(100% - 1.75rem), transparent 100%);')
    expect(titleRule).toContain('--rail-control-flex: 0 1 auto;')
    expect(titleRule).toContain('--rail-control-max-width: min(calc(300px * var(--tab-button-scale)), 100%);')
    expect(titleRule).not.toContain('--rail-control-height:')
    expect(titleRule).not.toContain('--rail-control-padding:')
    expect(titleRule).toContain('--rail-control-font-weight: 400;')
    expect(titleRule).toContain('display: inline-flex;')
    expect(titleRule).toContain('align-items: center;')
    expect(titleRule).toContain('user-select: none;')
    expect(noteTitleRule).toContain('--rail-control-flex: 0 0 auto;')
    expect(noteTitleRule).toContain('flex: 0 0 auto;')
    expect(navigationRule).toContain('border: 1px solid var(--app-border);')
    expect(navigationRule).toContain('border-radius: 0.35rem;')
    expect(navigationRule).toContain('background: var(--app-bg);')
    expect(navigationRule).toContain('user-select: none;')
    expect(navigationTitleRule).toContain('width: fit-content;')
    expect(navigationTitleRule).toContain('justify-self: start;')
    expect(titleEditorRule).toContain('box-sizing: border-box !important;')
    expect(titleEditorRule).toContain('display: inline-flex !important;')
    expect(titleEditorRule).toContain('align-items: center !important;')
    expect(titleEditorRule).toContain('justify-content: center !important;')
    expect(titleEditorRule).toContain('height: var(--rail-control-height) !important;')
    expect(titleEditorRule).toContain('min-height: var(--rail-control-height) !important;')
    expect(titleEditorRule).toContain('max-height: var(--rail-control-height) !important;')
    expect(titleEditorRule).toContain('padding: var(--rail-control-padding) !important;')
    expect(titleEditorRule).toContain('color: var(--rail-control-text) !important;')
    expect(titleEditorRule).toContain('background: var(--rail-control-bg) !important;')
    expect(titleEditorRule).toContain('background-color: var(--rail-control-bg) !important;')
    expect(titleEditorRule).toContain('border: 1px solid var(--rail-control-border) !important;')
    expect(titleEditorRule).toContain('border-color: var(--rail-control-border) !important;')
    expect(titleEditorRule).toContain('outline: 0 !important;')
    expect(titleEditorRule).toContain('box-shadow: none !important;')
    expect(titleEditorRule).toContain('font-size: var(--rail-control-font-size) !important;')
    expect(titleEditorRule).toContain('font-weight: 400 !important;')
    expect(titleEditorRule).toContain('line-height: var(--rail-control-line-height) !important;')
    expect(titleEditorRule).toContain('border-radius: var(--rail-control-radius) !important;')
    const previewContentsRule = extractRule(editorShellCss, '.context-preview-editor-host .toastui-editor-contents')
    const previewProseMirrorRule = extractRule(editorShellCss, '.context-preview-editor-host .ProseMirror')
    expect(editorShellCss).toContain(
      '.context-preview-editor-host .toastui-editor-main,\n.context-preview-editor-host .toastui-editor-main-container,\n.context-preview-editor-host .toastui-editor-ww-container,\n.context-preview-editor-host .toastui-editor-ww-container > .toastui-editor {',
    )
    expect(editorShellCss).toContain('height: var(--note-preview-editor-height, 21.5rem) !important;')
    expect(previewContentsRule).toContain('min-height: 0 !important;')
    expect(previewContentsRule).toContain('height: 100% !important;')
    expect(previewContentsRule).toContain('overflow-y: auto !important;')
    expect(previewContentsRule).toContain('overflow-x: hidden !important;')
    expect(previewContentsRule).toContain('padding-top: 0 !important;')
    expect(previewContentsRule).toContain('user-select: text;')
    expect(previewProseMirrorRule).toContain('min-height: 0 !important;')
    expect(previewProseMirrorRule).toContain('height: 100% !important;')
    expect(previewProseMirrorRule).toContain('overflow-y: auto !important;')
    expect(previewProseMirrorRule).toContain('overflow-x: hidden !important;')
    expect(previewProseMirrorRule).not.toContain('height: auto !important;')
    expect(previewProseMirrorRule).toContain('padding-top: 0 !important;')
    expect(previewProseMirrorRule).toContain('user-select: text;')
    expect(editorShellCss).toContain('.context-preview-editor-host .ProseMirror p,')
    expect(editorShellCss).toContain('-webkit-user-select: text;')
    expect(editorShellCss).not.toContain(
      '.context-preview-editor-host .toastui-editor-main,\n.context-preview-editor-host .toastui-editor-ww-container,\n.context-preview-editor-host .toastui-editor-contents,\n.context-preview-editor-host .ProseMirror {',
    )
    expect(editorShellCss).toContain(
      '.context-preview-editor-host .toastui-editor-contents > :first-child,\n.context-preview-editor-host .ProseMirror > :first-child {',
    )
    expect(editorShellCss).toContain('margin-top: 0 !important;')
    expect(editorShellCss).toContain(
      '.context-preview-editor-host .toastui-editor-contents > :last-child,\n.context-preview-editor-host .ProseMirror > :last-child {',
    )
    expect(editorShellCss).toContain('margin-bottom: 0 !important;')
    expect(actionsRule).toContain('gap: 0.5rem;')
    expect(deleteRule).not.toContain('margin-left:')
    expect(deleteRule).toContain('border-color: var(--action-chip-border);')
    expect(deleteRule).toContain('border-radius: 0.25rem;')
    expect(deleteRule).toContain('background: var(--action-chip-bg);')
    expect(deleteIconRule).toContain('width: 1.2rem;')
    expect(deleteIconRule).toContain('height: 1.2rem;')
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

describe('theme editor selector deduplication', () => {
  it('moves repeated Toast UI editor selectors into shared editor styles', () => {
    const baseCss = readStyle('base.css')
    const editorBaseCss = readStyle('editor-base.css')
    const editorContentCss = readStyle('editor-content.css')
    const editorShellCss = readStyle('editor-shell.css')

    expect(baseCss).toContain('--editor-toolbar-icon-primary: #c8d0e1;')
    expect(baseCss).toContain('--editor-toolbar-icon-secondary: #6f7f98;')
    expect(baseCss).toContain('--editor-list-marker-opacity:')
    expect(baseCss).toContain('--editor-hr-opacity:')
    expect(baseCss).toContain('--editor-shell-bg:')
    expect(baseCss).toContain('--editor-trash-home-bg:')
    expect(baseCss).toContain('--custom-palette-tag-text: var(--custom-theme-tag-text, #06141a);')
    expect(baseCss).toContain('--custom-palette-tag-bg: var(--custom-theme-tag-bg, #22d3ee);')
    expect(baseCss).toContain('--custom-palette-tooltip-primary: var(--custom-theme-tooltip-primary, #c8d0e1);')
    expect(baseCss).toContain('--custom-palette-tooltip-secondary: var(--custom-theme-tooltip-secondary, #6f7f98);')
    expect(baseCss).toContain('--editor-tag-text: var(--custom-palette-tag-text);')
    expect(baseCss).toContain('--editor-tag-bg: var(--custom-palette-tag-bg);')
    expect(baseCss).toContain('--editor-toolbar-icon-primary: var(--custom-palette-tooltip-primary);')
    expect(baseCss).toContain('--editor-toolbar-icon-secondary: var(--custom-palette-tooltip-secondary);')
    expect(baseCss).toContain('--editor-tag-text: #06141a;')
    expect(baseCss).toContain('--editor-tag-bg: #22d3ee;')

    expect(editorBaseCss).toContain('.toast-editor-host,\n.toastui-editor-defaultUI,\n.toastui-editor-main,')
    expect(editorBaseCss).toContain('.toastui-editor-main .toastui-editor-md-splitter')
    expect(editorBaseCss).toContain('.toastui-editor-defaultUI .toastui-editor-md-tab-container,\n.toastui-editor-mode-switch')
    expect(editorBaseCss).toContain('.toastui-editor-md-tab-container .tab-item,\n.toastui-editor-mode-switch .tab-item')
    expect(editorBaseCss).toContain('.app-shell .toastui-editor-tooltip,\nbody.app-tooltips-disabled .toastui-editor-tooltip')
    expect(editorBaseCss).toContain('display: none !important;')
    expect(editorBaseCss).toContain('.toastui-editor-defaultUI-toolbar button.app-toolbar-tool-btn,')
    expect(editorBaseCss).toContain('.toolbar-tool-icon-primary')
    expect(editorBaseCss).toContain('.toolbar-tool-icon-primary-stroke')
    expect(editorBaseCss).toContain('.toolbar-tool-icon-primary-fill')
    expect(editorBaseCss).toContain('.toolbar-tool-icon-secondary')
    expect(editorBaseCss).toContain('.toolbar-tool-icon-secondary-stroke')
    expect(editorBaseCss).toContain('stroke: var(--editor-toolbar-icon-primary, #c8d0e1);')
    expect(editorBaseCss).toContain('stroke: var(--editor-toolbar-icon-secondary, #6f7f98);')
    expect(editorBaseCss).toContain('fill: var(--editor-toolbar-icon-primary, #c8d0e1);')
    expect(editorBaseCss).toContain('fill: var(--editor-toolbar-icon-secondary, #6f7f98);')
    expect(editorBaseCss).not.toContain('.toolbar-tool-sprite-icon')
    expect(editorBaseCss).not.toContain('.toastui-editor-toolbar-icons')
    expect(editorBaseCss).not.toContain('background-position-x:')
    expect(editorBaseCss).not.toContain('--editor-toolbar-icon-filter')
    expect(editorBaseCss).toContain('font-size: 14px !important;')
    expect(editorBaseCss).toContain('color: var(--editor-toolbar-icon-primary, #c8d0e1) !important;')
    expect(editorBaseCss).not.toContain('toolbar-custom-icon-color')
    expect(editorBaseCss).not.toContain('font-size: var(--editor-toolbar-icon-size) !important;')
    expect(editorBaseCss).not.toContain('toolbar-tool-svg-icon')

    expect(editorContentCss).toContain('opacity: var(--editor-list-marker-opacity, 1) !important;')
    expect(editorContentCss).toContain('.toastui-editor-contents ol > li::before,\n.toastui-editor .ProseMirror ol > li::before')
    expect(editorContentCss).toContain('opacity: var(--editor-hr-opacity, 0.74) !important;')
    expect(editorContentCss).toContain('background: var(--editor-pre-bg) !important;')
    expect(editorContentCss).toContain('border: 1px solid var(--editor-pre-border) !important;')
    const tagTokenRule = extractRule(
      editorContentCss,
      '.toastui-editor-contents .tabs-tag-token,\n.toastui-editor .ProseMirror .tabs-tag-token,\n.aisle-editor-preview-fallback .tabs-tag-token,\n.aisle-edit-preview .tabs-tag-token',
    )
    expect(tagTokenRule).toContain('color: var(--editor-tag-text, #06141a) !important;')
    expect(tagTokenRule).toContain(
      'background: var(--editor-tag-bg, #22d3ee) !important;',
    )
    expect(tagTokenRule).toContain('border: 0 !important;')
    expect(tagTokenRule).toContain('border-radius: 0.28em !important;')
    expect(tagTokenRule).toContain('padding: 0.02em 0.22em !important;')
    expect(tagTokenRule).toContain('font-size: inherit !important;')
    expect(tagTokenRule).toContain('font-weight: inherit !important;')
    expect(tagTokenRule).toContain('line-height: inherit !important;')
    expect(tagTokenRule).toContain('-webkit-box-decoration-break: clone;')
    expect(tagTokenRule).toContain('box-decoration-break: clone;')
    expect(tagTokenRule).not.toContain('font-weight: 600')
    expect(editorContentCss).toContain('.toastui-editor .ProseMirror .tabs-tag-token.tabs-tag-jump-target')
    expect(editorContentCss).toContain('@keyframes tabs-tag-jump-glow')
    expect(editorContentCss).toContain('var(--editor-tag-bg, #22d3ee)')

    expect(editorShellCss).toContain('background-color: var(--editor-shell-bg, var(--editor-bg));')
    expect(editorShellCss).toContain('background-color: var(--editor-trash-home-bg, var(--editor-bg));')
    expect(editorShellCss).toContain('.tag-autocomplete-menu')
    expect(editorShellCss).toContain('.tag-autocomplete-token.tabs-tag-token')
    expect(editorShellCss).toContain('color: var(--editor-tag-text);')
    expect(editorShellCss).toContain('background: var(--editor-tag-bg);')
  })

  it('keeps theme files focused on tokens and true exceptions', () => {
    const themeNames = ['light', 'dawn'] as const
    const removedTokenSelectorFragments = [
      '.editor-shell',
      '.trash-home-note',
      '.toast-editor-host',
      '.toastui-editor-defaultUI,',
      '.toastui-editor-main .toastui-editor-md-splitter',
      '.toastui-editor-defaultUI .toastui-editor-md-tab-container',
      '.toastui-editor-contents mark',
      '.toastui-editor-contents blockquote',
      ".toastui-editor-popup-body input[type='text']",
      '.toastui-editor-popup-add-table',
      '.toastui-editor-contents h1',
      '.toastui-editor-contents a',
      '.toastui-editor-contents hr',
      '.toastui-editor .ProseMirror pre',
      '.toastui-editor-tooltip',
    ]

    for (const themeName of themeNames) {
      const css = readStyle(`themes/${themeName}.css`)

      expect(css).toContain('--editor-toolbar-icon-primary: #555555;')
      expect(css).toContain('--editor-toolbar-icon-secondary:')
      expect(css).toContain('--editor-list-marker-opacity:')
      expect(css).toContain('--editor-hr-opacity:')
      expect(css).toContain('--editor-tag-text:')
      expect(css).toContain('--editor-tag-bg:')
      expect(css).toContain('--editor-shell-bg:')
      expect(css).toContain('--editor-trash-home-bg:')

      for (const selectorFragment of removedTokenSelectorFragments) {
        expect(css).not.toContain(`.theme-${themeName} ${selectorFragment}`)
      }

      expect(css).toContain(`.theme-${themeName} .toastui-editor-contents li.task-reorder-source`)
      expect(css).toContain(`.theme-${themeName} .task-reorder-ghost`)
      expect(css).toContain(`.theme-${themeName} .image-tools`)
      expect(css).toContain(`.theme-${themeName} .link-prompt`)
    }

    const dawnCss = readStyle('themes/dawn.css')
    const lightCss = readStyle('themes/light.css')

    expect(dawnCss).not.toContain('.theme-dawn .toastui-editor-toolbar-icons')
    expect(dawnCss).toContain('.theme-dawn .toastui-editor-contents .task-list-item.checked::before')
    expect(lightCss).not.toContain('.theme-light .toastui-editor-toolbar-icons.quote')
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
