import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { TableControlsOverlay } from './TableControlsOverlay'

const visibleControls = {
  visible: true,
  columnTop: 10,
  columnLeft: 20,
  rowTop: 40,
  rowLeft: 6,
}

describe('TableControlsOverlay', () => {
  it('renders four table controls outside the table', () => {
    const html = renderToStaticMarkup(
      <TableControlsOverlay
        visible
        tableControls={visibleControls}
        onAddRow={vi.fn()}
        onRemoveRow={vi.fn()}
        onAddColumn={vi.fn()}
        onRemoveColumn={vi.fn()}
      />,
    )

    expect(html).toContain('table-tools-columns')
    expect(html).toContain('table-tools-rows')
    expect(html).toContain('aria-label="Add column"')
    expect(html).toContain('aria-label="Remove column"')
    expect(html).toContain('aria-label="Add row"')
    expect(html).toContain('aria-label="Remove row"')
    expect(html.match(/class="table-tool-btn"/g)).toHaveLength(4)
  })

  it('renders nothing when inactive', () => {
    const html = renderToStaticMarkup(
      <TableControlsOverlay
        visible
        tableControls={{ ...visibleControls, visible: false }}
        onAddRow={vi.fn()}
        onRemoveRow={vi.fn()}
        onAddColumn={vi.fn()}
        onRemoveColumn={vi.fn()}
      />,
    )

    expect(html).toBe('')
  })

  it('renders nothing when globally hidden', () => {
    const html = renderToStaticMarkup(
      <TableControlsOverlay
        visible={false}
        tableControls={visibleControls}
        onAddRow={vi.fn()}
        onRemoveRow={vi.fn()}
        onAddColumn={vi.fn()}
        onRemoveColumn={vi.fn()}
      />,
    )

    expect(html).toBe('')
  })
})
