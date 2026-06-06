import { describe, expect, it } from 'vitest'
import {
  DIAGNOSTIC_LOG_MAX_ENTRIES_PER_DAY,
  createDiagnosticEntry,
  getDiagnosticDayKey,
  normalizeDiagnosticLogEntry,
  orderDiagnosticDaysForDisplay,
  orderDiagnosticEntriesForDisplay,
} from './diagnostic-log'

describe('diagnostic log normalization', () => {
  it('creates local day keys and orders days newest first', () => {
    expect(getDiagnosticDayKey(new Date(2026, 5, 6, 12))).toBe('2026-06-06')
    expect(orderDiagnosticDaysForDisplay(['bad', '2026-06-01', '2026-06-03', '2026-06-01'])).toEqual([
      '2026-06-03',
      '2026-06-01',
    ])
  })

  it('sanitizes details and redacts content-like fields', () => {
    const entry = normalizeDiagnosticLogEntry({
      id: 'entry-1',
      createdAt: '2026-06-06T12:00:00.000Z',
      dayKey: '2026-06-06',
      sessionId: 'session-1',
      level: 'warning',
      area: 'image-tools',
      event: 'crop-start',
      durationMs: 12.345,
      details: {
        markdown: '# secret',
        noteBodyId: 'body-1',
        imageDataUrl: 'data:image/png;base64,secret',
        nested: { clipboardText: 'secret', ok: true },
      },
    })

    expect(entry).toMatchObject({
      durationMs: 12.3,
      details: {
        markdown: '[redacted]',
        noteBodyId: 'body-1',
        imageDataUrl: '[redacted]',
        nested: { clipboardText: '[redacted]', ok: true },
      },
    })
  })

  it('orders diagnostic entries newest first', () => {
    const first = createDiagnosticEntry({
      sessionId: 'session',
      area: 'runtime',
      event: 'first',
      now: new Date('2026-06-06T00:00:00.000Z'),
    })
    const second = createDiagnosticEntry({
      sessionId: 'session',
      area: 'runtime',
      event: 'second',
      now: new Date('2026-06-06T00:01:00.000Z'),
    })

    expect(orderDiagnosticEntriesForDisplay([first, second]).map((entry) => entry.event)).toEqual(['second', 'first'])
  })

  it('exports the default per-day cap', () => {
    expect(DIAGNOSTIC_LOG_MAX_ENTRIES_PER_DAY).toBe(5000)
  })
})
