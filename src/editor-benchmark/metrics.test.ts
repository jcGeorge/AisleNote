import { describe, expect, it } from 'vitest'
import { SLOW_TABLE_LINK_MARKDOWN } from './fixtures'
import { assessMarkdownRoundTrip, summarizeDurations } from './metrics'

describe('editor benchmark metrics', () => {
  it('summarizes empty and populated duration sets', () => {
    expect(summarizeDurations([])).toEqual({ count: 0, p50: 0, p95: 0, max: 0, total: 0 })
    expect(summarizeDurations([10, 30, 20])).toEqual({ count: 3, p50: 20, p95: 30, max: 30, total: 60 })
  })

  it('accepts the shared slow fixture as a passing Markdown round trip', () => {
    expect(assessMarkdownRoundTrip(SLOW_TABLE_LINK_MARKDOWN).status).toBe('pass')
  })

  it('fails round trip output that drops required external links', () => {
    expect(assessMarkdownRoundTrip('# Completed items\n\nNo links remain.').status).toBe('fail')
  })
})
