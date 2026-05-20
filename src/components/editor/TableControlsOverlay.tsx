import type { MouseEvent, PointerEvent } from 'react'
import type { TableControlsOverlayState } from '../../editor/table-editing'

type TableControlsOverlayProps = {
  visible: boolean
  tableControls: TableControlsOverlayState
  onAddRow: () => void
  onRemoveRow: () => void
  onAddColumn: () => void
  onRemoveColumn: () => void
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
      title={label}
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
  onAddRow,
  onRemoveRow,
  onAddColumn,
  onRemoveColumn,
}: TableControlsOverlayProps) {
  if (!visible || !tableControls.visible) return null

  const stopPointerEvent = (event: PointerEvent<HTMLElement>) => {
    event.stopPropagation()
  }

  const stopMouseEvent = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <>
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
    </>
  )
}
