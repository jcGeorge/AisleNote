import React from 'react'
import type { ToastState } from '../../types/app'
import { orderToastsForDisplay } from './toast-stack'

void React

type ToastHostProps = {
  toasts: ToastState[]
  onToastMouseEnter: () => void
  onToastMouseLeave: () => void
}

export function ToastHost({ toasts, onToastMouseEnter, onToastMouseLeave }: ToastHostProps) {
  if (toasts.length === 0) return null

  return (
    <div
      className="app-toast-layer"
      aria-live="polite"
      aria-atomic="false"
      onMouseEnter={onToastMouseEnter}
      onMouseLeave={onToastMouseLeave}
    >
      {orderToastsForDisplay(toasts).map((toast) => (
        <div key={toast.id} className={`app-toast app-toast-${toast.tone}`}>
          {toast.message}
        </div>
      ))}
    </div>
  )
}
