import { REQUIRED_ROUND_TRIP_TOKENS } from './fixtures'
import type { RoundTripStatus } from './types'

export type DurationSummary = {
  count: number
  p50: number
  p95: number
  max: number
  total: number
}

export type RoundTripAssessment = {
  status: RoundTripStatus
  notes: string[]
}

export function summarizeDurations(values: number[]): DurationSummary {
  if (values.length === 0) {
    return { count: 0, p50: 0, p95: 0, max: 0, total: 0 }
  }

  const sorted = [...values].sort((a, b) => a - b)
  const total = values.reduce((sum, value) => sum + value, 0)
  return {
    count: values.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted[sorted.length - 1] ?? 0,
    total,
  }
}

export function roundMs(value: number): number {
  return Math.round(value * 10) / 10
}

export function assessMarkdownRoundTrip(markdown: string): RoundTripAssessment {
  const notes: string[] = []
  const missingTokens = REQUIRED_ROUND_TRIP_TOKENS.filter((token) => !markdown.includes(token))
  if (missingTokens.length > 0) {
    notes.push(`Missing required fixture tokens: ${missingTokens.join(', ')}`)
  }

  const hasMarkdownTableShape = markdown.includes('|') && markdown.includes('---')
  const hasHtmlTableShape = /<table[\s>]/i.test(markdown)
  if (!hasMarkdownTableShape && !hasHtmlTableShape) {
    notes.push('Serialized output no longer has a recognizable table shape.')
  } else if (!hasMarkdownTableShape && hasHtmlTableShape) {
    notes.push('Serialized output kept table content as HTML instead of Markdown table syntax.')
  }

  const status: RoundTripStatus = missingTokens.length > 0
    ? 'fail'
    : notes.length > 0
      ? 'warn'
      : 'pass'

  return {
    status,
    notes: notes.length > 0 ? notes : ['Fixture heading, table shape, and sampled external links survived.'],
  }
}

function percentile(sortedValues: number[], percentileValue: number): number {
  if (sortedValues.length === 0) return 0
  const index = Math.min(sortedValues.length - 1, Math.ceil(sortedValues.length * percentileValue) - 1)
  return sortedValues[index] ?? 0
}
