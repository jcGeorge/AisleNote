import { describe, expect, it } from 'vitest'
import {
  getEditorDisplayRewriteDiagnosticDetails,
  getEditorMarkdownSyncSnapshot,
  shouldApplyEditorDisplayRewrite,
} from './editor-markdown-sync'

describe('editor markdown sync', () => {
  const normalizeForPersistence = (markdown: string) =>
    markdown
      .replace(/\(([^()\s]*%20[^()]*)\)/g, (_match, href) => `(<${decodeURIComponent(href)}>)`)
      .replace(/\s+/g, ' ')
      .trim()

  const normalizeForDisplay = (markdown: string) =>
    markdown.replace(/\(<([^>]*)>\)/g, (_match, href) => `(${encodeURI(href)})`)

  it('treats canonical and editor-safe display note link forms as the same sync content', () => {
    const expected = getEditorMarkdownSyncSnapshot('[link th](<link that remains--14eeb9>)', {
      normalizeForPersistence,
      normalizeForDisplay,
    })
    const current = normalizeForPersistence('[link th](link%20that%20remains--14eeb9)')

    expect(expected).toEqual({
      canonicalMarkdown: '[link th](<link that remains--14eeb9>)',
      displayMarkdown: '[link th](link%20that%20remains--14eeb9)',
    })
    expect(shouldApplyEditorDisplayRewrite({
      currentCanonicalMarkdown: current,
      expectedCanonicalMarkdown: expected.canonicalMarkdown,
    })).toBe(false)
  })

  it('still requests a rewrite for real canonical content changes', () => {
    expect(shouldApplyEditorDisplayRewrite({
      currentCanonicalMarkdown: '[old](<link that remains--14eeb9>)',
      expectedCanonicalMarkdown: '[new](<link that remains--14eeb9>)',
    })).toBe(true)
  })

  it('reports rewrite diagnostics without storing note text', () => {
    expect(getEditorDisplayRewriteDiagnosticDetails({
      aisleId: 'aisle-1',
      reason: 'mounted-aisle-sync',
      currentCanonicalMarkdown: '[old](<link that remains--14eeb9>)',
      expectedCanonicalMarkdown: '[new](<link that remains--14eeb9>)',
      expectedDisplayMarkdown: '[new](link%20that%20remains--14eeb9)',
    })).toEqual({
      aisleId: 'aisle-1',
      reason: 'mounted-aisle-sync',
      currentCanonicalLength: 34,
      expectedCanonicalLength: 34,
      expectedDisplayLength: 36,
      canonicalMismatch: true,
      displayDiffersFromCanonical: true,
    })
  })
})
