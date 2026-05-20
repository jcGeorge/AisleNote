import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const styleDir = dirname(fileURLToPath(import.meta.url))

function readStyle(fileName: string): string {
  return readFileSync(join(styleDir, fileName), 'utf8')
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
