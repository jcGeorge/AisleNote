import type { ToastHistoryEntry, ToastState } from '../../types/app'

export const MAX_VISIBLE_TOASTS = 4
export const MAX_TOAST_HISTORY_ENTRIES = 70

export function appendToastToStack(
  toasts: ToastState[],
  toast: ToastState,
  maxVisibleToasts = MAX_VISIBLE_TOASTS,
) {
  return [...toasts, toast].slice(-maxVisibleToasts)
}

export function orderToastsForDisplay(toasts: ToastState[]) {
  return [...toasts].reverse()
}

export function appendToastToHistory(
  toastHistory: ToastHistoryEntry[],
  toast: ToastHistoryEntry,
  maxEntries = MAX_TOAST_HISTORY_ENTRIES,
) {
  const previousToast = toastHistory.at(-1)
  if (previousToast?.message === toast.message) return toastHistory
  return [...toastHistory, toast].slice(-maxEntries)
}

export function orderToastHistoryForDisplay(toastHistory: ToastHistoryEntry[]) {
  return [...toastHistory].reverse()
}
