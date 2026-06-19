import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ShortcutMenu } from './ShortcutMenu'

describe('ShortcutMenu block quote and block indent labels', () => {
  it('renders blockQuote, blockIndent, and aisle direction operations as separate labels', () => {
    const html = renderToStaticMarkup(
      <ShortcutMenu
        top={0}
        left={0}
        operations={['blockQuote', 'blockIndent', 'aisleLeft', 'aisleRight']}
        activeIndex={0}
        onHighlight={vi.fn()}
        onRun={vi.fn()}
      />,
    )

    expect(html).toContain('block quote')
    expect(html).toContain('block indent')
    expect(html).toContain('aisle to the left')
    expect(html).toContain('aisle to the right')
    expect(html).not.toContain('block tab indent')
    expect(html).not.toContain('>aisle</')
  })
})
