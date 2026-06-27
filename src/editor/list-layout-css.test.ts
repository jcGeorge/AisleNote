import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const editorContentCss = readFileSync(new URL('../styles/editor-content.css', import.meta.url), 'utf8')

describe('editor list layout CSS', () => {
  it('keeps ordered lists close to bullet and dash list indentation', () => {
    expect(editorContentCss).toContain('.toastui-editor-contents ol,')
    expect(editorContentCss).toContain('padding-left: 2.75ch !important;')
    expect(editorContentCss).toContain('width: 2.45ch !important;')
    expect(editorContentCss).toContain('margin-left: -2.75ch !important;')
    expect(editorContentCss).not.toContain('padding-left: 4ch !important;')
    expect(editorContentCss).not.toContain('margin-left: -4ch !important;')
  })
})
