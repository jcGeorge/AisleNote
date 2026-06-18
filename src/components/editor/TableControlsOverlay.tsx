import React from 'react'
import type { MouseEvent, PointerEvent } from 'react'
import type { TableControlsOverlayState, TableSelectionOverlayState } from '../../editor/table-editing'

type TableControlsOverlayProps = {
  visible: boolean
  tableControls: TableControlsOverlayState
  tableSelectionOverlay: TableSelectionOverlayState
  onAddRow: () => void
  onRemoveRow: () => void
  onAddColumn: () => void
  onRemoveColumn: () => void
  onSelectRow: (rowIndex: number, event: MouseEvent<HTMLButtonElement>) => void
  onSelectColumn: (columnIndex: number, event: MouseEvent<HTMLButtonElement>) => void
  onMoveRows: (event: MouseEvent<HTMLButtonElement>) => void
  onMoveColumns: (event: MouseEvent<HTMLButtonElement>) => void
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
  onSelectRow,
  onSelectColumn,
  onMoveRows,
  onMoveColumns,
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
    <React.Fragment>
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
              onMouseDown={(event) => handleSelectorMouseDown(event, (nextEvent) => onSelectColumn(column.index, nextEvent))}
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
              onMouseDown={(event) => handleSelectorMouseDown(event, (nextEvent) => onSelectRow(row.index, nextEvent))}
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
          {tableSelectionOverlay.columnHandle && (
            <button
              type="button"
              className="table-selection-handle table-selection-column-handle"
              aria-label="Move selected columns"
              data-app-tooltip="Move selected columns"
              style={{
                top: `${tableSelectionOverlay.columnHandle.top}px`,
                left: `${tableSelectionOverlay.columnHandle.left}px`,
                width: `${tableSelectionOverlay.columnHandle.width}px`,
                height: `${tableSelectionOverlay.columnHandle.height}px`,
              }}
              onPointerDown={stopPointerEvent}
              onMouseDown={(event) => handleSelectorMouseDown(event, onMoveColumns)}
              onClick={stopMouseEvent}
            />
          )}
          {tableSelectionOverlay.rowHandle && (
            <button
              type="button"
              className="table-selection-handle table-selection-row-handle"
              aria-label="Move selected rows"
              data-app-tooltip="Move selected rows"
              style={{
                top: `${tableSelectionOverlay.rowHandle.top}px`,
                left: `${tableSelectionOverlay.rowHandle.left}px`,
                width: `${tableSelectionOverlay.rowHandle.width}px`,
                height: `${tableSelectionOverlay.rowHandle.height}px`,
              }}
              onPointerDown={stopPointerEvent}
              onMouseDown={(event) => handleSelectorMouseDown(event, onMoveRows)}
              onClick={stopMouseEvent}
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
    </React.Fragment>
  )
}
