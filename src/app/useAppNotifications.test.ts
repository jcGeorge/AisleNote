import { afterEach, describe, expect, it, vi } from 'vitest'
import { createToastTimerManager } from './useAppNotifications'

const timerApi = {
  setTimeout: (handler: () => void, timeout: number) =>
    setTimeout(handler, timeout) as unknown as number,
  clearTimeout: (timerId: number) => clearTimeout(timerId as unknown as ReturnType<typeof setTimeout>),
}

afterEach(() => {
  vi.useRealTimers()
})

describe('createToastTimerManager', () => {
  it('dismisses a scheduled toast after the requested delay', () => {
    vi.useFakeTimers()
    const dismissed: number[] = []
    const timers = new Map<number, number>()
    const manager = createToastTimerManager({
      timers,
      dismissToast: (toastId) => dismissed.push(toastId),
      timerApi,
    })

    manager.scheduleToastDismiss(10, 500)

    expect(timers.size).toBe(1)
    vi.advanceTimersByTime(499)
    expect(dismissed).toEqual([])
    vi.advanceTimersByTime(1)
    expect(dismissed).toEqual([10])
  })

  it('reschedules an existing toast by clearing the previous timer', () => {
    vi.useFakeTimers()
    const dismissed: number[] = []
    const timers = new Map<number, number>()
    const manager = createToastTimerManager({
      timers,
      dismissToast: (toastId) => dismissed.push(toastId),
      timerApi,
    })

    manager.scheduleToastDismiss(10, 500)
    manager.scheduleToastDismiss(10, 800)

    expect(timers.size).toBe(1)
    vi.advanceTimersByTime(500)
    expect(dismissed).toEqual([])
    vi.advanceTimersByTime(300)
    expect(dismissed).toEqual([10])
  })

  it('clears all pending toast timers', () => {
    vi.useFakeTimers()
    const dismissed: number[] = []
    const timers = new Map<number, number>()
    const manager = createToastTimerManager({
      timers,
      dismissToast: (toastId) => dismissed.push(toastId),
      timerApi,
    })

    manager.scheduleToastDismiss(10, 500)
    manager.scheduleToastDismiss(11, 600)
    manager.clearToastTimers()

    expect(timers.size).toBe(0)
    vi.advanceTimersByTime(600)
    expect(dismissed).toEqual([])
  })
})
