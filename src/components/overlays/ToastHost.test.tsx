import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ToastState } from '../../types/app'
import { ToastHost } from './ToastHost'

const toasts: ToastState[] = [
  { id: 1, message: 'first warning', tone: 'warning', durationMs: 3000 },
  { id: 2, message: 'second success', tone: 'success', durationMs: 3000 },
  { id: 3, message: 'third error', tone: 'error', durationMs: 3000 },
]

describe('ToastHost', () => {
  it('renders nothing without toasts', () => {
    const html = renderToStaticMarkup(
      <ToastHost toasts={[]} onToastMouseEnter={() => undefined} onToastMouseLeave={() => undefined} />,
    )

    expect(html).toBe('')
  })

  it('renders stacked toasts newest first with tone classes', () => {
    const html = renderToStaticMarkup(
      <ToastHost toasts={toasts} onToastMouseEnter={() => undefined} onToastMouseLeave={() => undefined} />,
    )

    expect(html.indexOf('third error')).toBeLessThan(html.indexOf('second success'))
    expect(html.indexOf('second success')).toBeLessThan(html.indexOf('first warning'))
    expect(html).toContain('app-toast-warning')
    expect(html).toContain('app-toast-success')
    expect(html).toContain('app-toast-error')
  })
})
