import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const readOnlyMarkdownViewerSource = readFileSync(
  fileURLToPath(new URL('./ReadOnlyMarkdownViewer.tsx', import.meta.url)),
  'utf8',
)

describe('ReadOnlyMarkdownViewer source wiring', () => {
  it('uses sanitized Toast UI markdown without raw span preservation', () => {
    expect(readOnlyMarkdownViewerSource).toContain(
      "import { sanitizeEditorHtml } from '../../editor/editor-sanitizer'",
    )
    expect(readOnlyMarkdownViewerSource).toContain('customHTMLSanitizer: sanitizeEditorHtml')
    expect(readOnlyMarkdownViewerSource).not.toContain('AISLENOTE_TOAST_HTML_RENDERER')
    expect(readOnlyMarkdownViewerSource).not.toContain('customHTMLRenderer')
  })
})
