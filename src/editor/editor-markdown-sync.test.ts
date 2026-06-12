import { describe, expect, it } from 'vitest'
import {
  chooseLazyContentCommitFallbackMarkdown,
  getEditorDisplayRewriteDiagnosticDetails,
  getEditorMarkdownSyncSnapshot,
  shouldApplyEditorDisplayRewrite,
  shouldScheduleContentCommitForEditorChange,
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

  it('does not schedule commits for unchanged programmatic display changes', () => {
    expect(shouldScheduleContentCommitForEditorChange({
      isProgrammaticDisplayChange: true,
      currentCanonicalMarkdown: 'Intro\n\nBody',
      nextCanonicalMarkdown: 'Intro\n\nBody',
    })).toBe(false)
  })

  it('schedules commits for real user edits', () => {
    expect(shouldScheduleContentCommitForEditorChange({
      isProgrammaticDisplayChange: false,
      currentCanonicalMarkdown: 'Intro',
      nextCanonicalMarkdown: 'Intro',
    })).toBe(true)
  })

  it('schedules explicit programmatic canonical markdown changes', () => {
    expect(shouldScheduleContentCommitForEditorChange({
      isProgrammaticDisplayChange: true,
      currentCanonicalMarkdown: 'Intro',
      nextCanonicalMarkdown: 'Intro updated',
    })).toBe(true)
  })

  it('keeps repeated unchanged programmatic display repair non-dirty', () => {
    const repair = {
      isProgrammaticDisplayChange: true,
      currentCanonicalMarkdown: '[link th](<link that remains--14eeb9>)',
      nextCanonicalMarkdown: '[link th](<link that remains--14eeb9>)',
    }

    expect(shouldScheduleContentCommitForEditorChange(repair)).toBe(false)
    expect(shouldScheduleContentCommitForEditorChange(repair)).toBe(false)
  })

  it('chooses lazy commit fallback markdown without display normalization', () => {
    expect(chooseLazyContentCommitFallbackMarkdown({
      pendingMarkdown: 'pending draft',
      cachedMarkdown: 'cached',
      committedMarkdown: 'committed',
    })).toBe('pending draft')
    expect(chooseLazyContentCommitFallbackMarkdown({
      pendingMarkdown: null,
      cachedMarkdown: 'cached',
      committedMarkdown: 'committed',
    })).toBe('cached')
    expect(chooseLazyContentCommitFallbackMarkdown({
      pendingMarkdown: undefined,
      cachedMarkdown: null,
      committedMarkdown: 'committed',
    })).toBe('committed')
  })
})
