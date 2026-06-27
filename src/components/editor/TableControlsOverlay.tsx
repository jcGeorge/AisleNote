import React from 'react'
import type { MouseEvent, PointerEvent } from 'react'
import type { TableControlsOverlayState, TableReorderAxis, TableSelectionOverlayState } from '../../editor/table-editing'

type TableControlsOverlayProps = {
  visible: boolean
  tableControls: TableControlsOverlayState
  tableSelectionOverlay: TableSelectionOverlayState
  onAddRow: () => void
  onRemoveRow: () => void
  onAddColumn: () => void
  onRemoveColumn: () => void
  onBeginSelectorGesture: (
    axis: TableReorderAxis,
    index: number,
    tableStart: number | null,
    event: MouseEvent<HTMLButtonElement>,
  ) => void
}

function TableControlButton({
  label,
  children,
  onClick,
}: {
  label: string
  children: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="table-tool-btn"
      aria-label={label}
      data-app-tooltip={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.preventDefault()
        onClick()
      }}
    >
      {children}
    </button>
  )
}

export function TableControlsOverlay({
  visible,
  tableControls,
  tableSelectionOverlay,
  onAddRow,
  onRemoveRow,
  onAddColumn,
  onRemoveColumn,
  onBeginSelectorGesture,
}: TableControlsOverlayProps) {
  if (!visible || !tableControls.visible) return null

  const stopPointerEvent = (event: PointerEvent<HTMLElement>) => {
    event.stopPropagation()
  }

  const stopMouseEvent = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
  }

  const handleSelectorMouseDown = (
    event: MouseEvent<HTMLButtonElement>,
    callback: (event: MouseEvent<HTMLButtonElement>) => void,
  ) => {
    event.preventDefault()
    event.stopPropagation()
    callback(event)
  }

  return (
    <div className="table-controls-overlay-layer">
      {tableSelectionOverlay.visible && (
        <React.Fragment>
          {tableSelectionOverlay.columns.map((column) => (
            <button
              key={`table-column-selector-${tableSelectionOverlay.tableStart}-${column.index}`}
              type="button"
              className={`table-selector-segment table-selector-column-segment${column.selected ? ' is-selected' : ''}`}
              aria-label={`Select column ${column.index + 1}`}
              data-app-tooltip={`Select column ${column.index + 1}`}
              style={{
                top: `${column.top}px`,
                left: `${column.left}px`,
                width: `${column.width}px`,
                height: `${column.height}px`,
              }}
              onPointerDown={stopPointerEvent}
              onMouseDown={(event) =>
                handleSelectorMouseDown(event, (nextEvent) =>
                  onBeginSelectorGesture('column', column.index, tableSelectionOverlay.tableStart, nextEvent),
                )
              }
              onClick={stopMouseEvent}
            />
          ))}
          {tableSelectionOverlay.rows.map((row) => (
            <button
              key={`table-row-selector-${tableSelectionOverlay.tableStart}-${row.index}`}
              type="button"
              className={`table-selector-segment table-selector-row-segment${row.selected ? ' is-selected' : ''}`}
              aria-label={`Select row ${row.index + 1}`}
              data-app-tooltip={`Select row ${row.index + 1}`}
              style={{
                top: `${row.top}px`,
                left: `${row.left}px`,
                width: `${row.width}px`,
                height: `${row.height}px`,
              }}
              onPointerDown={stopPointerEvent}
              onMouseDown={(event) =>
                handleSelectorMouseDown(event, (nextEvent) =>
                  onBeginSelectorGesture('row', row.index, tableSelectionOverlay.tableStart, nextEvent),
                )
              }
              onClick={stopMouseEvent}
            />
          ))}
          {tableSelectionOverlay.selectionRect && (
            <div
              className={`table-selection-rect table-selection-rect-${tableSelectionOverlay.mode ?? 'cells'}`}
              aria-hidden="true"
              style={{
                top: `${tableSelectionOverlay.selectionRect.top}px`,
                left: `${tableSelectionOverlay.selectionRect.left}px`,
                width: `${tableSelectionOverlay.selectionRect.width}px`,
                height: `${tableSelectionOverlay.selectionRect.height}px`,
              }}
            />
          )}
        </React.Fragment>
      )}
      <div
        className="table-tools table-tools-columns"
        style={{
          top: `${tableControls.columnTop}px`,
          left: `${tableControls.columnLeft}px`,
        }}
        onPointerDown={stopPointerEvent}
        onMouseDown={stopMouseEvent}
        onClick={stopMouseEvent}
      >
        <TableControlButton label="Remove column" onClick={onRemoveColumn}>
          -
        </TableControlButton>
        <TableControlButton label="Add column" onClick={onAddColumn}>
          +
        </TableControlButton>
      </div>
      <div
        className="table-tools table-tools-rows"
        style={{
          top: `${tableControls.rowTop}px`,
          left: `${tableControls.rowLeft}px`,
        }}
        onPointerDown={stopPointerEvent}
        onMouseDown={stopMouseEvent}
        onClick={stopMouseEvent}
      >
        <TableControlButton label="Remove row" onClick={onRemoveRow}>
          -
        </TableControlButton>
        <TableControlButton label="Add row" onClick={onAddRow}>
          +
        </TableControlButton>
      </div>
    </div>
  )
}
