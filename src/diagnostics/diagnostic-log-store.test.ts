import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DiagnosticLogEntry } from './diagnostic-log'
import {
  DIAGNOSTIC_LOG_MAX_ENTRIES_PER_DAY,
  DIAGNOSTIC_LOG_RETENTION_DAYS,
} from './diagnostic-log'
import {
  appendDiagnosticLogEntry,
  listDiagnosticLogDays,
  readDiagnosticLogEntries,
  writeBrowserDiagnosticLogEntriesForTest,
} from './diagnostic-log-store'

function createStorage() {
  const values = new Map<string, string>()
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key)
    }),
  }
}

function entry(dayKey: string, index: number): DiagnosticLogEntry {
  return {
    id: `${dayKey}-${index}`,
    createdAt: `${dayKey}T00:00:00.000Z`,
    dayKey,
    sessionId: 'session-1',
    level: 'info',
    area: 'runtime',
    event: `event-${index}`,
  }
}

describe('diagnostic log store', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses localStorage fallback with newest days first', async () => {
    const storage = createStorage()
    vi.stubGlobal('localStorage', storage)

    await appendDiagnosticLogEntry(entry('2026-06-01', 1))
    await appendDiagnosticLogEntry(entry('2026-06-03', 2))
    await appendDiagnosticLogEntry(entry('2026-06-02', 3))

    expect(await listDiagnosticLogDays()).toEqual(['2026-06-03', '2026-06-02', '2026-06-01'])
    expect((await readDiagnosticLogEntries('2026-06-03')).map((candidate) => candidate.id)).toEqual(['2026-06-03-2'])
  })

  it('retains the newest configured number of days', async () => {
    const storage = createStorage()
    vi.stubGlobal('localStorage', storage)

    for (let index = 1; index <= DIAGNOSTIC_LOG_RETENTION_DAYS + 2; index += 1) {
      await appendDiagnosticLogEntry(entry(`2026-06-${String(index).padStart(2, '0')}`, index))
    }

    const days = await listDiagnosticLogDays()
    expect(days).toHaveLength(DIAGNOSTIC_LOG_RETENTION_DAYS)
    expect(days[0]).toBe('2026-06-16')
    expect(days).not.toContain('2026-06-01')
  })

  it('caps localStorage day entries', async () => {
    const storage = createStorage()
    vi.stubGlobal('localStorage', storage)
    const entries = Array.from({ length: DIAGNOSTIC_LOG_MAX_ENTRIES_PER_DAY + 2 }, (_, index) =>
      entry('2026-06-06', index + 1),
    )

    writeBrowserDiagnosticLogEntriesForTest('2026-06-06', entries, storage as unknown as Storage)

    const readEntries = await readDiagnosticLogEntries('2026-06-06')
    expect(readEntries).toHaveLength(DIAGNOSTIC_LOG_MAX_ENTRIES_PER_DAY)
    expect(readEntries[0]?.id).toBe('2026-06-06-3')
  })
})
