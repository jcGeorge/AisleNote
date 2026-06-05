import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ArrangeDestinationPrompt } from './ArrangeDestinationPrompt'

describe('arrange destination prompt', () => {
  it('renders the space selection prompt without an in-modal cancel action', () => {
    const html = renderToStaticMarkup(
      <ArrangeDestinationPrompt
        message="now select a space or parent tab"
        onCancel={vi.fn()}
      />,
    )

    expect(html).toContain('now select a space or parent tab')
    expect(html).toContain('<h2 class="arrange-destination-title">now select a space or parent tab</h2>')
    expect(html).not.toContain('cancel')
    expect(html).not.toContain('arrange-destination-cancel')
    expect(html).not.toContain('arrange-destination-options')
  })

  it('renders the parent tab selection prompt', () => {
    const html = renderToStaticMarkup(
      <ArrangeDestinationPrompt
        message="now select a parent tab"
        onCancel={vi.fn()}
      />,
    )

    expect(html).toContain('now select a parent tab')
    expect(html).not.toContain('cancel')
    expect(html).not.toContain('arrange-destination-cancel')
  })
})
