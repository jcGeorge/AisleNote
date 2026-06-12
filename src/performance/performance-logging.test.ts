import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { recordDiagnosticEvent } from '../diagnostics/diagnostic-logger'
import { logSlowOperation, resetSlowOperationDiagnosticRateLimitForTest } from './performance-logging'

vi.mock('../diagnostics/diagnostic-logger', () => ({
  recordDiagnosticEvent: vi.fn(),
}))

const recordDiagnosticEventMock = vi.mocked(recordDiagnosticEvent)

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  resetSlowOperationDiagnosticRateLimitForTest()
  recordDiagnosticEventMock.mockClear()
})

afterEach(() => {
  resetSlowOperationDiagnosticRateLimitForTest()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('slow operation diagnostics', () => {
  it('does not record operations below the slow threshold', () => {
    logSlowOperation('editor change', 12, 50)

    expect(recordDiagnosticEventMock).not.toHaveBeenCalled()
  })

  it('throttles repeated slow-operation diagnostics with the same label', () => {
    logSlowOperation('electron async app-state save', 75, 50)
    logSlowOperation('electron async app-state save', 80, 50)

    expect(recordDiagnosticEventMock).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(10_001)
    logSlowOperation('electron async app-state save', 60, 50)

    expect(recordDiagnosticEventMock).toHaveBeenCalledTimes(2)
    expect(recordDiagnosticEventMock).toHaveBeenNthCalledWith(2, 'performance', 'slow-operation', expect.objectContaining({
      details: expect.objectContaining({
        label: 'electron async app-state save',
        suppressedRepeatedDiagnostics: 1,
        maxSuppressedDurationMs: 80,
      }),
    }))
  })

  it('keeps separate throttle buckets for different slow-operation labels', () => {
    logSlowOperation('electron async app-state save', 75, 50)
    logSlowOperation('editor pending content flush', 90, 50)

    expect(recordDiagnosticEventMock).toHaveBeenCalledTimes(2)
  })
})
