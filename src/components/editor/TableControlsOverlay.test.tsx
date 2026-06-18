import React from 'react'
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

const hiddenSelectionOverlay = {
  visible: false,
  tableStart: null,
  mode: null,
  rows: [],
  columns: [],
  selectionRect: null,
  rowHandle: null,
  columnHandle: null,
}

const visibleSelectionOverlay = {
  visible: true,
  tableStart: 0,
  mode: 'rows' as const,
  rows: [
    { index: 0, top: 50, left: 100, width: 14, height: 24, selected: false },
    { index: 1, top: 74, left: 100, width: 14, height: 24, selected: true },
  ],
  columns: [
    { index: 0, top: 30, left: 120, width: 80, height: 14, selected: true },
    { index: 1, top: 30, left: 200, width: 80, height: 14, selected: false },
  ],
  selectionRect: { index: 0, top: 74, left: 120, width: 160, height: 24 },
  rowHandle: { index: 1, top: 74, left: 78, width: 18, height: 24 },
  columnHandle: null,
}

function renderOverlay(options: { controlsVisible?: boolean; globalVisible?: boolean; selectionVisible?: boolean } = {}) {
  return renderToStaticMarkup(
    <TableControlsOverlay
      visible={options.globalVisible ?? true}
      tableControls={{ ...visibleControls, visible: options.controlsVisible ?? true }}
      tableSelectionOverlay={options.selectionVisible ? visibleSelectionOverlay : hiddenSelectionOverlay}
      onAddRow={vi.fn()}
      onRemoveRow={vi.fn()}
      onAddColumn={vi.fn()}
      onRemoveColumn={vi.fn()}
      onSelectRow={vi.fn()}
      onSelectColumn={vi.fn()}
      onMoveRows={vi.fn()}
      onMoveColumns={vi.fn()}
    />,
  )
}

describe('TableControlsOverlay', () => {
  it('renders four table controls outside the table', () => {
    const html = renderOverlay()

    expect(html).toContain('table-tools-columns')
    expect(html).toContain('table-tools-rows')
    expect(html).toContain('aria-label="Add column"')
    expect(html).toContain('aria-label="Remove column"')
    expect(html).toContain('aria-label="Add row"')
    expect(html).toContain('aria-label="Remove row"')
    expect(html.match(/class="table-tool-btn"/g)).toHaveLength(4)
    expect(html).toContain(
      'aria-label="Remove column" data-app-tooltip="Remove column">-</button><button type="button" class="table-tool-btn" aria-label="Add column"',
    )
    expect(html).toContain(
      'aria-label="Remove row" data-app-tooltip="Remove row">-</button><button type="button" class="table-tool-btn" aria-label="Add row"',
    )
  })

  it('renders table selector rails and selected range move handles', () => {
    const html = renderOverlay({ selectionVisible: true })

    expect(html).toContain('table-selector-column-segment is-selected')
    expect(html).toContain('table-selector-row-segment is-selected')
    expect(html).toContain('aria-label="Select column 1"')
    expect(html).toContain('aria-label="Select row 2"')
    expect(html).toContain('table-selection-rect table-selection-rect-rows')
    expect(html).toContain('table-selection-handle table-selection-row-handle')
    expect(html).toContain('aria-label="Move selected rows"')
    expect(html).not.toContain('aria-label="Move selected columns"')
  })

  it('renders nothing when inactive', () => {
    const html = renderOverlay({ controlsVisible: false })

    expect(html).toBe('')
  })

  it('renders nothing when globally hidden', () => {
    const html = renderOverlay({ globalVisible: false })

    expect(html).toBe('')
  })
})
