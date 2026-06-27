import * as React from 'react'
import { useEffect, useRef } from 'react'
import { NEWLINE_OPERATION_LABELS } from '../../hotkeys/shortcuts'
import type { NewlineOperationId } from '../../types/app'
import { getShortcutMenuKeyboardAction } from './shortcut-menu-keyboard'

void React

type ShortcutMenuProps = {
  top: number
  left: number
  operations: NewlineOperationId[]
  activeIndex: number
  onHighlight: (index: number) => void
  onRun: (operation: NewlineOperationId) => void
  onClose?: () => void
}

function getShortcutLabel(index: number): string {
  return index === 9 ? '0' : String(index + 1)
}

export function ShortcutMenu({
  top,
  left,
  operations,
  activeIndex,
  onHighlight,
  onRun,
  onClose,
}: ShortcutMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    menuRef.current?.focus({ preventScroll: true })
  }, [])

  return (
    <div
      ref={menuRef}
      className="shortcut-menu"
      style={{ top: `${top}px`, left: `${left}px` }}
      role="menu"
      aria-label="Shortcut menu"
      tabIndex={-1}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        const action = getShortcutMenuKeyboardAction(event.nativeEvent, activeIndex, operations.length)
        if (action.type === 'none') return
        event.preventDefault()
        event.stopPropagation()
        if (action.type === 'close') {
          onClose?.()
          return
        }
        if (action.type === 'highlight') {
          onHighlight(action.index)
          return
        }
        const operation = operations[action.index]
        if (operation) onRun(operation)
      }}
    >
      {operations.length > 0 ? (
        operations.map((operation, index) => (
          <button
            key={operation}
            type="button"
            className={`shortcut-menu-item${index === activeIndex ? ' is-active' : ''}`}
            role="menuitem"
            aria-current={index === activeIndex ? 'true' : undefined}
            onMouseEnter={() => onHighlight(index)}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onRun(operation)
            }}
          >
            <span className="shortcut-menu-key">{getShortcutLabel(index)}</span>
            <span>{NEWLINE_OPERATION_LABELS[operation]}</span>
          </button>
        ))
      ) : (
        <div className="shortcut-menu-empty">no operations configured</div>
      )}
    </div>
  )
}
