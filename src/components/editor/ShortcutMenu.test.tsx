import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ShortcutMenu } from './ShortcutMenu'

describe('ShortcutMenu block quote and block indent labels', () => {
  it('renders blockQuote and blockIndent as separate operations', () => {
    const html = renderToStaticMarkup(
      <ShortcutMenu
        top={0}
        left={0}
        operations={['blockQuote', 'blockIndent']}
        activeIndex={0}
        onHighlight={vi.fn()}
        onRun={vi.fn()}
      />,
    )

    expect(html).toContain('block quote')
    expect(html).toContain('block indent')
    expect(html).not.toContain('block tab indent')
  })
})
