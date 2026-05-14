import { NEWLINE_OPERATION_LABELS } from '../../hotkeys/shortcuts'
import type { NewlineOperationId } from '../../types/app'

type NewlineOperationsMenuProps = {
  top: number
  left: number
  operations: NewlineOperationId[]
  onRun: (operation: NewlineOperationId) => void
}

function getShortcutLabel(index: number): string {
  return index === 9 ? '0' : String(index + 1)
}

export function NewlineOperationsMenu({
  top,
  left,
  operations,
  onRun,
}: NewlineOperationsMenuProps) {
  return (
    <div
      className="newline-operations-menu"
      style={{ top: `${top}px`, left: `${left}px` }}
      role="menu"
      aria-label="New line menu"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {operations.length > 0 ? (
        operations.map((operation, index) => (
          <button
            key={operation}
            type="button"
            className="newline-operations-menu-item"
            role="menuitem"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onRun(operation)
            }}
          >
            <span className="newline-operations-menu-key">{getShortcutLabel(index)}</span>
            <span>{NEWLINE_OPERATION_LABELS[operation]}</span>
          </button>
        ))
      ) : (
        <div className="newline-operations-menu-empty">no operations configured</div>
      )}
    </div>
  )
}
