import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { TableControlsOverlay } from './TableControlsOverlay'

const overlaySource = readFileSync(new URL('./TableControlsOverlay.tsx', import.meta.url), 'utf8')
const editorShellCss = readFileSync(new URL('../../styles/editor-shell.css', import.meta.url), 'utf8')

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
      onBeginSelectorGesture={vi.fn()}
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

  it('renders table selector rails without selected range move handles', () => {
    const html = renderOverlay({ selectionVisible: true })

    expect(html).toContain('table-controls-overlay-layer')
    expect(html).toContain('table-selector-column-segment is-selected')
    expect(html).toContain('table-selector-row-segment is-selected')
    expect(html).toContain('aria-label="Select column 1"')
    expect(html).toContain('aria-label="Select row 2"')
    expect(html).toContain('table-selection-rect table-selection-rect-rows')
    expect(html).not.toContain('table-selection-handle')
    expect(html).not.toContain('Move selected rows')
    expect(html).not.toContain('Move selected columns')
  })

  it('routes selector rails through one click-or-drag gesture callback and hides rails until hover or selection', () => {
    expect(overlaySource).toContain("onBeginSelectorGesture('row', row.index, nextEvent)")
    expect(overlaySource).toContain("onBeginSelectorGesture('column', column.index, nextEvent)")
    expect(overlaySource).not.toContain('onMoveRows')
    expect(overlaySource).not.toContain('onMoveColumns')

    expect(editorShellCss).toContain('.table-selector-segment.is-selected')
    expect(editorShellCss).toContain('opacity: 0;')
    expect(editorShellCss).toContain(':has(.table-selector-column-segment:hover) .table-tools-columns')
    expect(editorShellCss).not.toContain('.table-selection-handle {')
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
