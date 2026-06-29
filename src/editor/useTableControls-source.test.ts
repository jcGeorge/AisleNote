import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getTableCellPointerMoveDecision } from './useTableControls'

const source = readFileSync(new URL('./useTableControls.ts', import.meta.url), 'utf8')
const getFunctionSource = (name: string) => {
  const start = source.indexOf(`function ${name}`)
  expect(start).toBeGreaterThanOrEqual(0)
  const nextFunction = source.indexOf('\n  function ', start + 1)
  return source.slice(start, nextFunction === -1 ? undefined : nextFunction)
}

describe('table controls interaction wiring', () => {
  it('classifies cell pointer movement with deliberate drag slop', () => {
    expect(getTableCellPointerMoveDecision(5, 0, false)).toBe('plain-click')
    expect(getTableCellPointerMoveDecision(6, 0, false)).toBe('native-text-selection')
    expect(getTableCellPointerMoveDecision(5, 0, true)).toBe('plain-click')
    expect(getTableCellPointerMoveDecision(6, 0, true)).toBe('cell-selection')
  })

  it('clears stale table selection on cell mousedown before starting a fresh cell interaction', () => {
    expect(source).toContain('setCurrentTableSelection(null)')
    expect(source).toContain('lockedTableControlsRef.current = null')
    expect(source).toContain("kind: 'cell-selection'")
  })

  it('does not let capture-phase workspace mousedown clear selector overlay gestures', () => {
    const handleMouseDownSource = getFunctionSource('handleMouseDown')
    expect(source).toContain('function isTableOverlayTarget(target: Element | null)')
    expect(handleMouseDownSource).toContain('if (isTableOverlayTarget(target)) return')
    expect(handleMouseDownSource.indexOf('if (isTableOverlayTarget(target)) return')).toBeLessThan(
      handleMouseDownSource.indexOf('setCurrentTableSelection(null)'),
    )
  })

  it('keeps plain cell mousedown caret-friendly until the pointer reaches another cell', () => {
    const handleMouseDownSource = getFunctionSource('handleMouseDown')
    expect(handleMouseDownSource).toContain('sourceCell,')
    expect(handleMouseDownSource).toContain('suppressingSelection: false')
    expect(handleMouseDownSource).toContain('nativeTextSelection: false')
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
    expect(source).toContain("if (interactionState.kind === 'cell-selection')")
    expect(source).toContain('if (interactionState.selecting)')
    expect(source).toContain('scheduleTableCellClickRepair(editor, coords, sourceCell)')
    expect(source).not.toContain('if (interactionState.suppressingSelection || (interactionState.kind ===')
  })

  it('keeps visible table controls targeted to the table they are locked over', () => {
    expect(source).toContain('const tableControlsTargetRef = useRef<ActiveTableContext | null>(null)')
    expect(source).toContain('const lockedTableControlsTargetRef = useRef<ActiveTableContext | null>(null)')
    expect(source).toContain('tableControlsTargetRef.current = lockedTableControlsTargetRef.current ?? tableDomContext.context')
    expect(source).toContain('lockedTableControlsTargetRef.current = shouldLockControls ? nextActiveTable : null')
    expect(source).toContain('applyTableControlOperationToView(view, operation, targetMode, operationContext)')
  })

  it('repairs table-control caret jumps back to the operated table', () => {
    expect(source).toContain('function scheduleTableControlCaretRepair(editor: Editor, expectedContext: ActiveTableContext)')
    expect(source).toContain('if (activeContext?.tableStart === lockedTarget.tableStart) return')
    expect(source).toContain('selectTableCellAtPosition(view, lockedTarget.tableStart, lockedTarget.rowIndex, lockedTarget.columnIndex)')
    expect(source).toContain('scheduleTableControlCaretRepair(currentEditor, nextActiveTable)')
  })

  it('does not promote same-cell movement into a custom rectangle selection', () => {
    const handleCellSelectionMoveSource = getFunctionSource('handleCellSelectionMove')
    expect(handleCellSelectionMoveSource).toContain('targetCell !== interactionState.sourceCell')
    expect(handleCellSelectionMoveSource).toContain('targetContext.rowIndex !== interactionState.context.rowIndex')
    expect(handleCellSelectionMoveSource).toContain('targetContext.columnIndex !== interactionState.context.columnIndex')
    expect(handleCellSelectionMoveSource).toContain('if (interactionState.nativeTextSelection && !isDifferentCell) return')
    expect(handleCellSelectionMoveSource).toContain("if (decision === 'native-text-selection')")
    expect(handleCellSelectionMoveSource).toContain('interactionState.nativeTextSelection = true')
    expect(handleCellSelectionMoveSource).not.toContain('if (interactionState.nativeTextSelection) return')
  })

  it('repairs click-like table exits after the browser selection pass', () => {
    expect(source).toContain("kind: 'outside-table-click'")
    expect(source).toContain('const activeTableRange = getActiveTableRange(view)')
    expect(source).toContain('scheduleOutsideTableClickRepair(editor, range, coords, target)')
    expect(source).toContain('placeCaretOutsideTableAtCoords(view, coords, range, target)')
  })

  it('does not suppress native dragstart for plain pending cell clicks or outside-table clicks', () => {
    const handleNativeDragStartSource = getFunctionSource('handleNativeDragStart')
    expect(handleNativeDragStartSource).toContain('const shouldSuppress =')
    expect(handleNativeDragStartSource).toContain("interactionState.kind === 'cell-selection'")
    expect(handleNativeDragStartSource).toContain("interactionState.kind === 'selector-gesture'")
    expect(handleNativeDragStartSource).toContain("interactionState.kind === 'range-reorder'")
    expect(handleNativeDragStartSource).toContain('if (!shouldSuppress) return')
    expect(handleNativeDragStartSource).not.toContain("interactionState.kind === 'outside-table-click'")
  })

  it('handles plain Enter inside tables without touching modified Enter shortcuts', () => {
    const handleKeyDownSource = getFunctionSource('handleKeyDown')
    expect(handleKeyDownSource).toContain("event.key === 'Enter'")
    expect(handleKeyDownSource).toContain('!event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey')
    expect(handleKeyDownSource).toContain('moveTableCellSelectionByEnter(view)')
    expect(handleKeyDownSource).toContain('event.preventDefault()')
    expect(handleKeyDownSource).toContain('if (editor && result.changed)')
  })

  it('routes row and column rail gestures through click-to-select or drag-to-reorder selector state', () => {
    expect(source).toContain("kind: 'selector-gesture'")
    expect(source).toContain('const beginTableSelectorGesture = useCallback(')
    expect(source).toContain('getSelectedAxisRangeForGesture(')
    expect(source).toContain('targetTableStart')
    expect(source).toContain('getTableDomContextForTableStart(view, targetTableStart) ?? getActiveTableDomContext(view)')
    expect(source).toContain('setCurrentTableSelection(sourceSelection)')
    expect(source).toContain('updateTableSelectionOverlay(')
    expect(source).toContain('createSelectionOverlayState(table, tableStart, next)')
    expect(source).toContain('createAxisSelection(interactionState.context.tableStart, interactionState.axis, interactionState.index, interactionState.index)')
    expect(source).toContain("interactionState.kind === 'selector-gesture'")
  })

  it('suppresses Toast UI table context menus from table cells', () => {
    expect(source).toContain('function handleTableContextMenu(event: MouseEvent)')
    expect(source).toContain("element?.closest('td, th')")
    expect(source).toContain("root?.addEventListener('contextmenu', handleTableContextMenu, true)")
    expect(source).toContain('event.stopImmediatePropagation()')
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
