import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./useTableControls.ts', import.meta.url), 'utf8')
const getFunctionSource = (name: string) => {
  const start = source.indexOf(`function ${name}`)
  expect(start).toBeGreaterThanOrEqual(0)
  const nextFunction = source.indexOf('\n  function ', start + 1)
  return source.slice(start, nextFunction === -1 ? undefined : nextFunction)
}

describe('table controls interaction wiring', () => {
  it('clears stale table selection on cell mousedown before starting a fresh cell interaction', () => {
    expect(source).toContain('setCurrentTableSelection(null)')
    expect(source).toContain('lockedTableControlsRef.current = null')
    expect(source).toContain("kind: 'cell-selection'")
  })

  it('keeps plain cell mousedown caret-friendly until the pointer reaches another cell', () => {
    const handleMouseDownSource = getFunctionSource('handleMouseDown')
    expect(handleMouseDownSource).toContain('sourceCell,')
    expect(handleMouseDownSource).toContain('suppressingSelection: false')
    expect(handleMouseDownSource).not.toContain('selectionSuppressionRef.current.begin()')
    expect(handleMouseDownSource).not.toContain('root?.classList.add(TABLE_REORDER_PENDING_CLASS)')
  })

  it('starts table no-select suppression only after a cross-cell rectangle selection begins', () => {
    const handleCellSelectionMoveSource = getFunctionSource('handleCellSelectionMove')
    expect(handleCellSelectionMoveSource).toContain('const isDifferentCell =')
    expect(handleCellSelectionMoveSource).toContain('interactionState.suppressingSelection = true')
    expect(handleCellSelectionMoveSource).toContain('root.classList.add(TABLE_REORDER_PENDING_CLASS)')
    expect(handleCellSelectionMoveSource).toContain('selectionSuppressionRef.current.begin()')
  })

  it('does not block mouseup for a single-cell click that never becomes a rectangle selection', () => {
    expect(source).toContain("if (interactionState.kind === 'cell-selection' && interactionState.selecting)")
    expect(source).not.toContain('if (interactionState.suppressingSelection || (interactionState.kind ===')
  })

  it('does not promote same-cell movement into a custom rectangle selection', () => {
    expect(source).toContain('targetCell !== interactionState.sourceCell')
    expect(source).toContain('targetContext.rowIndex !== interactionState.context.rowIndex')
    expect(source).toContain('targetContext.columnIndex !== interactionState.context.columnIndex')
    expect(source).toContain('if (!interactionState.selecting && !isDifferentCell)')
  })

  it('routes row and column rail gestures through click-to-select or drag-to-reorder selector state', () => {
    expect(source).toContain("kind: 'selector-gesture'")
    expect(source).toContain('const beginTableSelectorGesture = useCallback(')
    expect(source).toContain('getSelectedAxisRangeForGesture(')
    expect(source).toContain('setCurrentTableSelection(sourceSelection)')
    expect(source).toContain('updateTableSelectionOverlay(')
    expect(source).toContain('createSelectionOverlayState(table, tableStart, next)')
    expect(source).toContain('createAxisSelection(interactionState.context.tableStart, interactionState.axis, interactionState.index, interactionState.index)')
    expect(source).toContain("interactionState.kind === 'selector-gesture'")
  })

  it('preserves table selection through modifier-only keys and copy shortcuts', () => {
    expect(source).toContain("event.key === 'Meta'")
    expect(source).toContain("(event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c'")
  })

  it('handles custom table selection copy and paste before generic editor clipboard behavior', () => {
    expect(source).toContain('serializeTableSelectionForClipboard(view, tableSelectionRef.current)')
    expect(source).toContain('writeTableSelectionClipboardData(event.clipboardData, serialization)')
    expect(source).toContain('readTableSelectionClipboardPayloadFromDataTransfer(event.clipboardData)')
    expect(source).toContain('insertTableSelectionClipboardPayloadIntoView(view, payload)')
  })
})
