import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  configureDiagnosticLogging,
  createMainThreadHeartbeat,
  recordDiagnosticEvent,
} from './diagnostic-logger'
import { appendDiagnosticLogEntry } from './diagnostic-log-store'

vi.mock('./diagnostic-log-store', () => ({
  appendDiagnosticLogEntry: vi.fn(() => Promise.resolve({ ok: true })),
}))

const appendDiagnosticLogEntryMock = vi.mocked(appendDiagnosticLogEntry)

beforeEach(() => {
  appendDiagnosticLogEntryMock.mockClear()
})

afterEach(() => {
  configureDiagnosticLogging(() => ({}))()
})

describe('diagnostic logger capture', () => {
  it('does not create or append entries while capture is disabled', () => {
    const contextProvider = vi.fn(() => ({ viewMode: 'main' }))
    const cleanup = configureDiagnosticLogging(contextProvider, () => false)

    const entry = recordDiagnosticEvent('runtime', 'window-focus')

    cleanup()
    expect(entry).toBeNull()
    expect(contextProvider).not.toHaveBeenCalled()
    expect(appendDiagnosticLogEntryMock).not.toHaveBeenCalled()
  })

  it('creates and appends entries when capture is enabled again', () => {
    const cleanup = configureDiagnosticLogging(() => ({ viewMode: 'main' }), () => true)

    const entry = recordDiagnosticEvent('runtime', 'window-focus')

    cleanup()
    expect(entry).toMatchObject({
      area: 'runtime',
      event: 'window-focus',
      details: { viewMode: 'main' },
    })
    expect(appendDiagnosticLogEntryMock).toHaveBeenCalledTimes(1)
    expect(appendDiagnosticLogEntryMock).toHaveBeenCalledWith(entry)
  })
})

describe('diagnostic logger heartbeat', () => {
  it('records main-thread stalls when interval delay exceeds threshold', () => {
    let intervalHandler: (() => void) | null = null
    let currentTime = 0
    const record = vi.fn()
    const heartbeat = createMainThreadHeartbeat({
      record,
      intervalMs: 1000,
      stallThresholdMs: 1500,
      now: () => currentTime,
      timerApi: {
        setInterval: (handler: () => void) => {
          intervalHandler = handler
          return 1
        },
        clearInterval: vi.fn(),
      },
    })

    heartbeat.start()
    currentTime = 1200
    expect(intervalHandler).not.toBeNull()
    const tick = intervalHandler as unknown as () => void
    tick()
    currentTime = 3800
    tick()

    expect(record).toHaveBeenCalledTimes(1)
    expect(record).toHaveBeenCalledWith('runtime', 'main-thread-stall', expect.objectContaining({
      durationMs: 1600,
      level: 'warning',
    }))
  })

  it('throttles repeated main-thread stall records', () => {
    let intervalHandler: (() => void) | null = null
    let currentTime = 0
    const record = vi.fn()
    const heartbeat = createMainThreadHeartbeat({
      record,
      intervalMs: 250,
      stallThresholdMs: 750,
      throttleMs: 2000,
      now: () => currentTime,
      timerApi: {
        setInterval: (handler: () => void) => {
          intervalHandler = handler
          return 1
        },
        clearInterval: vi.fn(),
      },
    })

    heartbeat.start()
    const tick = intervalHandler as unknown as () => void
    currentTime = 1200
    tick()
    currentTime = 2300
    tick()
    currentTime = 4700
    tick()

    expect(record).toHaveBeenCalledTimes(2)
    expect(record).toHaveBeenNthCalledWith(1, 'runtime', 'main-thread-stall', expect.objectContaining({
      durationMs: 950,
    }))
    expect(record).toHaveBeenNthCalledWith(2, 'runtime', 'main-thread-stall', expect.objectContaining({
      durationMs: 2150,
    }))
  })
})
