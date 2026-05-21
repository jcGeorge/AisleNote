import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { TIP_DEFINITIONS } from '../../tips/tips'
import { TipHost } from './TipHost'

describe('TipHost', () => {
  it('renders nothing without tips', () => {
    const html = renderToStaticMarkup(<TipHost tips={[]} onDismissTip={() => undefined} />)

    expect(html).toBe('')
  })

  it('renders persistent stacked tips with dismiss buttons', () => {
    const html = renderToStaticMarkup(<TipHost tips={TIP_DEFINITIONS} onDismissTip={vi.fn()} />)

    expect(html).toContain('app-tip-layer')
    expect(html).toContain('app-tip-card')
    expect(html).toContain('Dismiss task undo tip')
    expect(html).toContain('Dismiss tab creation tip')
    expect(html).toContain('Cmd+Z')
    expect(html).toContain('press Tab')
  })
})
