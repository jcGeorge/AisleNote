import type { ToastState } from '../../types/app'

export const MAX_VISIBLE_TOASTS = 4

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
