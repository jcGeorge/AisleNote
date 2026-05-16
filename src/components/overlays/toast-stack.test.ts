import { describe, expect, it } from 'vitest'
import type { ToastState } from '../../types/app'
import { MAX_VISIBLE_TOASTS, appendToastToStack, orderToastsForDisplay } from './toast-stack'

function toast(id: number, message = `toast ${id}`): ToastState {
  return {
    id,
    message,
    tone: 'warning',
    durationMs: 3000,
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
})
