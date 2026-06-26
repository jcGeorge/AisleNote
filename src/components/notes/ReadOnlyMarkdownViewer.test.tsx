import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const readOnlyMarkdownViewerSource = readFileSync(
  fileURLToPath(new URL('./ReadOnlyMarkdownViewer.tsx', import.meta.url)),
  'utf8',
)

describe('ReadOnlyMarkdownViewer source wiring', () => {
  it('uses the shared Toast UI inline HTML renderer', () => {
    expect(readOnlyMarkdownViewerSource).toContain(
      "import { AISLENOTE_TOAST_HTML_RENDERER } from '../../editor/toast-inline-html-renderer'",
    )
    expect(readOnlyMarkdownViewerSource).toContain('customHTMLRenderer: AISLENOTE_TOAST_HTML_RENDERER')
  })
})
