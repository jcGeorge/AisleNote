import React, { type DragEvent } from 'react'
import {
  NEWLINE_OPERATION_LABELS,
  SHORTCUT_MENU_ELIGIBLE_OPERATIONS,
} from '../../hotkeys/shortcuts'
import type { NewlineOperationId } from '../../types/app'

const MENU_SLOT_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']
const SHORTCUT_MENU_DRAG_MIME = 'application/x-tabs-shortcut-menu-operation'

export function ShortcutMenuSettingsPanel({
  operations,
  onChange,
}: {
  operations: NewlineOperationId[]
  onChange: (operations: NewlineOperationId[]) => void
}) {
  const [draggedOperation, setDraggedOperation] = React.useState<NewlineOperationId | null>(null)
  const [dropTarget, setDropTarget] = React.useState<{ type: 'slot'; index: number } | { type: 'pool' } | null>(null)
  const selected = operations.filter((operation) => SHORTCUT_MENU_ELIGIBLE_OPERATIONS.includes(operation))
  const available = SHORTCUT_MENU_ELIGIBLE_OPERATIONS.filter((operation) => !selected.includes(operation))

  const moveOperationToSlot = (operation: NewlineOperationId, slotIndex: number) => {
    const next = selected.filter((candidate) => candidate !== operation)
    next.splice(Math.min(slotIndex, next.length), 0, operation)
    onChange(next.slice(0, MENU_SLOT_LABELS.length))
  }

  const removeOperation = (operation: NewlineOperationId) => {
    onChange(selected.filter((candidate) => candidate !== operation))
  }

  const getDraggedOperation = (event: DragEvent) => {
    const operation = event.dataTransfer.getData(SHORTCUT_MENU_DRAG_MIME) || event.dataTransfer.getData('text/plain')
    return SHORTCUT_MENU_ELIGIBLE_OPERATIONS.includes(operation as NewlineOperationId)
      ? (operation as NewlineOperationId)
      : null
  }

  const startDrag = (event: DragEvent, operation: NewlineOperationId) => {
    setDraggedOperation(operation)
    setDropTarget(null)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(SHORTCUT_MENU_DRAG_MIME, operation)
    event.dataTransfer.setData('text/plain', operation)
  }

  const finishDrag = () => {
    setDraggedOperation(null)
    setDropTarget(null)
  }

  return (
    <div className="shortcut-menu-settings">
      <div className="shortcut-menu-slots" aria-label="Shortcut menu order">
        {MENU_SLOT_LABELS.map((slotLabel, index) => {
          const operation = selected[index]
          const isDropTarget = dropTarget?.type === 'slot' && dropTarget.index === index
          const isDragSource = Boolean(draggedOperation && operation === draggedOperation)
          return (
            <div
              key={slotLabel}
              className={`shortcut-menu-slot ${operation ? 'has-operation' : ''} ${isDropTarget ? 'is-drop-target' : ''} ${
                isDragSource ? 'is-drag-source' : ''
              }`}
              onDragEnter={() => setDropTarget({ type: 'slot', index })}
              onDragOver={(event) => {
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                setDropTarget({ type: 'slot', index })
              }}
              onDrop={(event) => {
                event.preventDefault()
                const draggedOperation = getDraggedOperation(event)
                if (draggedOperation) moveOperationToSlot(draggedOperation, index)
                finishDrag()
              }}
            >
              <span className="shortcut-menu-slot-number">{slotLabel}</span>
              {operation ? (
                <button
                  type="button"
                  draggable
                  className={`shortcut-menu-operation-chip ${draggedOperation === operation ? 'is-dragging' : ''}`}
                  onDragStart={(event) => startDrag(event, operation)}
                  onDragEnd={finishDrag}
                  onClick={() => removeOperation(operation)}
                  aria-label={`Remove ${NEWLINE_OPERATION_LABELS[operation]}`}
                  data-app-tooltip="Click to remove"
                >
                  {NEWLINE_OPERATION_LABELS[operation]}
                </button>
              ) : (
                <span className="shortcut-menu-empty-slot">unassigned</span>
              )}
            </div>
          )
        })}
      </div>
      <div
        className={`shortcut-menu-pool ${dropTarget?.type === 'pool' ? 'is-drop-target' : ''}`}
        onDragEnter={() => setDropTarget({ type: 'pool' })}
        onDragOver={(event) => {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
          setDropTarget({ type: 'pool' })
        }}
        onDrop={(event) => {
          event.preventDefault()
          const operation = getDraggedOperation(event)
          if (operation) removeOperation(operation)
          finishDrag()
        }}
      >
        <span className="shortcut-menu-pool-label">available</span>
        <div className="shortcut-menu-pool-items">
          {available.length > 0 ? (
            available.map((operation) => (
              <button
                key={operation}
                type="button"
                draggable
                className={`shortcut-menu-operation-chip ${draggedOperation === operation ? 'is-dragging' : ''}`}
                onDragStart={(event) => startDrag(event, operation)}
                onDragEnd={finishDrag}
                onClick={() => moveOperationToSlot(operation, selected.length)}
              >
                {NEWLINE_OPERATION_LABELS[operation]}
              </button>
            ))
          ) : (
            <span className="shortcut-menu-pool-empty">all operations are in the menu</span>
          )}
        </div>
      </div>
    </div>
  )
}
