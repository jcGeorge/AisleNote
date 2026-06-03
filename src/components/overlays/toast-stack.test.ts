import { describe, expect, it } from 'vitest'
import type { ToastHistoryEntry, ToastState } from '../../types/app'
import {
  MAX_TOAST_HISTORY_ENTRIES,
  MAX_VISIBLE_TOASTS,
  appendToastToHistory,
  appendToastToStack,
  orderToastHistoryForDisplay,
  orderToastsForDisplay,
} from './toast-stack'

function toast(id: number, message = `toast ${id}`): ToastState {
  return {
    id,
    message,
    tone: 'warning',
    durationMs: 3000,
  }
}

function historyToast(id: number, message = `toast ${id}`): ToastHistoryEntry {
  return {
    id,
    createdAt: `2026-06-01T00:00:${String(id).padStart(2, '0')}.000Z`,
    message,
    tone: 'warning',
  }
}

describe('toast stack', () => {
  it('keeps multiple toasts from the same action', () => {
    const warning = toast(1, 'computed field must have a computed value, status reverted to normal field')
    const success = { ...toast(2, 'frontmatter saved.'), tone: 'success' as const }

    const toasts = appendToastToStack(appendToastToStack([], warning), success)

    expect(toasts).toEqual([warning, success])
  })

  it('keeps only the newest visible toasts', () => {
    const toasts = Array.from({ length: MAX_VISIBLE_TOASTS + 2 }, (_, index) => toast(index + 1))
      .reduce((stack, nextToast) => appendToastToStack(stack, nextToast), [] as ToastState[])

    expect(toasts.map((candidate) => candidate.id)).toEqual([3, 4, 5, 6])
  })

  it('orders newest toasts first for display', () => {
    expect(orderToastsForDisplay([toast(1), toast(2), toast(3)]).map((candidate) => candidate.id)).toEqual([3, 2, 1])
  })

  it('keeps only the newest persisted toast history entries', () => {
    const toastHistory = Array.from({ length: MAX_TOAST_HISTORY_ENTRIES + 2 }, (_, index) => historyToast(index + 1))
      .reduce((history, nextToast) => appendToastToHistory(history, nextToast), [] as ToastHistoryEntry[])

    expect(toastHistory.map((candidate) => candidate.id)).toEqual(
      Array.from({ length: MAX_TOAST_HISTORY_ENTRIES }, (_, index) => index + 3),
    )
  })

  it('does not store consecutive toast history entries with identical text', () => {
    const first = historyToast(1, 'clipboard paste is unavailable here.')
    const duplicate = historyToast(2, 'clipboard paste is unavailable here.')

    const toastHistory = appendToastToHistory(appendToastToHistory([], first), duplicate)

    expect(toastHistory).toEqual([first])
  })

  it('stores repeated toast history entries when they are not consecutive', () => {
    const first = historyToast(1, 'open a note before pasting.')
    const second = historyToast(2, 'clipboard paste is unavailable here.')
    const third = historyToast(3, 'open a note before pasting.')

    const toastHistory = [first, second, third].reduce(
      (history, nextToast) => appendToastToHistory(history, nextToast),
      [] as ToastHistoryEntry[],
    )

    expect(toastHistory).toEqual([first, second, third])
  })

  it('orders newest persisted toast history first for display', () => {
    expect(orderToastHistoryForDisplay([historyToast(1), historyToast(2), historyToast(3)]).map((candidate) => candidate.id)).toEqual([3, 2, 1])
  })
})
