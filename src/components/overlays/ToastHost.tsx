import type { ToastState } from '../../types/app'

type ToastHostProps = {
  toast: ToastState | null
  onToastMouseEnter: () => void
  onToastMouseLeave: () => void
}

export function ToastHost({ toast, onToastMouseEnter, onToastMouseLeave }: ToastHostProps) {
  if (!toast) return null

  return (
    <div className="app-toast-layer" aria-live="polite" aria-atomic="true">
      <div
        key={toast.id}
        className={`app-toast app-toast-${toast.tone}`}
        onMouseEnter={onToastMouseEnter}
        onMouseLeave={onToastMouseLeave}
      >
        {toast.message}
      </div>
    </div>
  )
}
