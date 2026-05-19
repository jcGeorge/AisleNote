import { useEffect, useRef } from 'react'
import type { NoteSearchEntry } from '../../notes/note-locations'

type NoteMentionAction = 'link' | 'context'

type NoteMentionMenuProps =
  | {
      type: 'search'
      top: number
      left: number
      entries: NoteSearchEntry[]
      activeIndex: number
      onHighlight: (index: number) => void
      onChoose: (entry: NoteSearchEntry) => void
    }
  | {
      type: 'action'
      top: number
      left: number
      activeIndex: number
      onHighlight: (index: number) => void
      onChoose: (action: NoteMentionAction) => void
    }

const ACTIONS: Array<{ action: NoteMentionAction; label: string }> = [
  { action: 'link', label: 'link' },
  { action: 'context', label: 'preview' },
]

function getShortcutLabel(index: number): string {
  return index === 9 ? '0' : String(index + 1)
}

export function NoteMentionMenu(props: NoteMentionMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    menuRef.current?.focus({ preventScroll: true })
  }, [])

  return (
    <div
      ref={menuRef}
      className="shortcut-menu note-mention-menu"
      style={{ top: `${props.top}px`, left: `${props.left}px` }}
      role="menu"
      aria-label={props.type === 'search' ? 'Note search' : 'Note reference type'}
      tabIndex={-1}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {props.type === 'search' ? (
        props.entries.length > 0 ? (
          props.entries.map((entry, index) => (
            <button
              key={`${entry.domainId}:${entry.spaceId}:${entry.tabId}:${entry.subTabId ?? 'home'}`}
              type="button"
              className={`shortcut-menu-item note-mention-result${index === props.activeIndex ? ' is-active' : ''}`}
              role="menuitem"
              aria-current={index === props.activeIndex ? 'true' : undefined}
              onMouseEnter={() => props.onHighlight(index)}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                props.onChoose(entry)
              }}
            >
              <span>{entry.label}</span>
            </button>
          ))
        ) : (
          <div className="shortcut-menu-empty">no matching notes</div>
        )
      ) : (
        ACTIONS.map((item, index) => (
          <button
            key={item.action}
            type="button"
            className={`shortcut-menu-item${index === props.activeIndex ? ' is-active' : ''}`}
            role="menuitem"
            aria-current={index === props.activeIndex ? 'true' : undefined}
            onMouseEnter={() => props.onHighlight(index)}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              props.onChoose(item.action)
            }}
          >
            <span className="shortcut-menu-key">{getShortcutLabel(index)}</span>
            <span>{item.label}</span>
          </button>
        ))
      )}
    </div>
  )
}

export type { NoteMentionAction }
