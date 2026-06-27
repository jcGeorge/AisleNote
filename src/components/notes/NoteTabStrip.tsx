import * as React from 'react'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react'
import { AppIcon } from '../icons/AppIcon'
import type { VaultTabStatus } from '../../types/app'

void React

export const NOTE_TAB_RENAME_LONG_PRESS_MS = 500
const NOTE_TAB_LONG_PRESS_MOVE_TOLERANCE_PX = 6
const NOTE_TAB_DRAG_MIME = 'application/x-aislenote-note-tab'

export type NoteTabStripItem = {
  noteId: string
  title: string
  status: VaultTabStatus
  active: boolean
}

type NoteTabDropTarget = {
  noteId: string
  index: number
  position: 'before' | 'after'
}

export type NoteTabRenameCommitSource = 'enter' | 'blur'

type NoteTabStripProps = {
  tabs: NoteTabStripItem[]
  renamingNoteId?: string
  renameDraft?: string
  onSelectTab: (noteId: string) => void
  onCloseTab: (noteId: string) => void
  onPromoteTab: (noteId: string) => void
  onReorderTabs: (sourceNoteId: string, targetIndex: number) => void
  onStartRenameTab: (noteId: string, title: string) => void
  onRenameDraftChange: (title: string) => void
  onCommitRenameTab: (source: NoteTabRenameCommitSource) => void
  onCancelRenameTab: () => void
}

function getTabDropTarget(event: DragEvent<HTMLElement>, noteId: string, index: number): NoteTabDropTarget {
  const rect = event.currentTarget.getBoundingClientRect()
  const position = event.clientX < rect.left + rect.width / 2 ? 'before' : 'after'
  return {
    noteId,
    index: position === 'before' ? index : index + 1,
    position,
  }
}

export function NoteTabStrip({
  tabs,
  renamingNoteId = '',
  renameDraft = '',
  onSelectTab,
  onCloseTab,
  onPromoteTab,
  onReorderTabs,
  onStartRenameTab,
  onRenameDraftChange,
  onCommitRenameTab,
  onCancelRenameTab,
}: NoteTabStripProps) {
  const [draggingNoteId, setDraggingNoteId] = useState('')
  const [dropTarget, setDropTarget] = useState<NoteTabDropTarget | null>(null)
  const longPressRef = useRef<{
    pointerId: number
    noteId: string
    startX: number
    startY: number
    timerId: number
  } | null>(null)
  const suppressNextClickRef = useRef(false)

  const clearLongPress = useCallback(() => {
    if (!longPressRef.current) return
    window.clearTimeout(longPressRef.current.timerId)
    longPressRef.current = null
  }, [])

  useEffect(() => clearLongPress, [clearLongPress])

  const startLongPressRename = (event: PointerEvent<HTMLButtonElement>, tab: NoteTabStripItem) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
    clearLongPress()
    const pointerId = event.pointerId
    const startX = event.clientX
    const startY = event.clientY
    const timerId = window.setTimeout(() => {
      longPressRef.current = null
      suppressNextClickRef.current = true
      onStartRenameTab(tab.noteId, tab.title)
    }, NOTE_TAB_RENAME_LONG_PRESS_MS)
    longPressRef.current = {
      pointerId,
      noteId: tab.noteId,
      startX,
      startY,
      timerId,
    }
  }

  const updateLongPressRename = (event: PointerEvent<HTMLButtonElement>) => {
    const pending = longPressRef.current
    if (!pending || pending.pointerId !== event.pointerId) return
    const moved =
      Math.abs(event.clientX - pending.startX) > NOTE_TAB_LONG_PRESS_MOVE_TOLERANCE_PX ||
      Math.abs(event.clientY - pending.startY) > NOTE_TAB_LONG_PRESS_MOVE_TOLERANCE_PX
    if (moved) clearLongPress()
  }

  const finishLongPressRename = (event: PointerEvent<HTMLButtonElement>) => {
    if (longPressRef.current?.pointerId === event.pointerId) clearLongPress()
  }

  const closeFromMiddleClick = (event: MouseEvent<HTMLElement>, noteId: string) => {
    if (event.button !== 1) return false
    event.preventDefault()
    event.stopPropagation()
    clearLongPress()
    onCloseTab(noteId)
    return true
  }

  const finishDrag = () => {
    setDraggingNoteId('')
    setDropTarget(null)
  }

  return (
    <nav className="note-tab-strip" aria-label="Open notes">
      {tabs.map((tab, index) => {
        const active = tab.active
        const renaming = tab.noteId === renamingNoteId
        const dragging = draggingNoteId === tab.noteId
        const dropPosition = dropTarget?.noteId === tab.noteId ? dropTarget.position : null
        return (
          <div
            key={tab.noteId}
            className={[
              'note-tab',
              active ? 'is-active' : '',
              tab.status === 'temporary' ? 'is-temporary' : 'is-retained',
              renaming ? 'is-renaming' : '',
              dragging ? 'is-dragging' : '',
              dropPosition === 'before' ? 'is-drop-before' : '',
              dropPosition === 'after' ? 'is-drop-after' : '',
            ].filter(Boolean).join(' ')}
            draggable={!renaming}
            onDragStart={(event) => {
              if (renaming) {
                event.preventDefault()
                return
              }
              clearLongPress()
              setDraggingNoteId(tab.noteId)
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData(NOTE_TAB_DRAG_MIME, tab.noteId)
              event.dataTransfer.setData('text/plain', tab.noteId)
            }}
            onDragOver={(event) => {
              const sourceNoteId = draggingNoteId || event.dataTransfer.getData(NOTE_TAB_DRAG_MIME)
              if (!sourceNoteId || sourceNoteId === tab.noteId) return
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              setDropTarget(getTabDropTarget(event, tab.noteId, index))
            }}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
              if (dropTarget?.noteId === tab.noteId) setDropTarget(null)
            }}
            onDrop={(event) => {
              event.preventDefault()
              event.stopPropagation()
              const sourceNoteId = draggingNoteId || event.dataTransfer.getData(NOTE_TAB_DRAG_MIME)
              const target = dropTarget?.noteId === tab.noteId ? dropTarget : getTabDropTarget(event, tab.noteId, index)
              if (sourceNoteId && sourceNoteId !== tab.noteId) onReorderTabs(sourceNoteId, target.index)
              finishDrag()
            }}
            onDragEnd={finishDrag}
            onMouseDown={(event) => {
              closeFromMiddleClick(event, tab.noteId)
            }}
            onAuxClick={(event) => {
              closeFromMiddleClick(event, tab.noteId)
            }}
          >
            {renaming ? (
              <div className="note-tab-main is-renaming">
                <input
                  className="note-tab-rename-input"
                  value={renameDraft}
                  autoFocus
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) => onRenameDraftChange(event.target.value)}
                  onBlur={() => onCommitRenameTab('blur')}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      onCommitRenameTab('enter')
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      onCancelRenameTab()
                    }
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                  aria-label={`Rename ${tab.title}`}
                />
              </div>
            ) : (
              <button
                type="button"
                className="note-tab-main"
                aria-current={active ? 'page' : undefined}
                title={tab.title}
                onPointerDown={(event) => startLongPressRename(event, tab)}
                onPointerMove={updateLongPressRename}
                onPointerUp={finishLongPressRename}
                onPointerCancel={finishLongPressRename}
                onPointerLeave={finishLongPressRename}
                onDoubleClick={(event) => {
                  if (tab.status !== 'temporary' || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
                    return
                  }
                  event.preventDefault()
                  event.stopPropagation()
                  clearLongPress()
                  onPromoteTab(tab.noteId)
                }}
                onClick={(event) => {
                  if (suppressNextClickRef.current) {
                    suppressNextClickRef.current = false
                    event.preventDefault()
                    return
                  }
                  onSelectTab(tab.noteId)
                }}
              >
                <span className="note-tab-label">{tab.title}</span>
              </button>
            )}
            <button
              type="button"
              className="note-tab-close"
              aria-label={`Close ${tab.title}`}
              data-app-tooltip="Close"
              onPointerDown={(event) => {
                event.stopPropagation()
                clearLongPress()
              }}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onCloseTab(tab.noteId)
              }}
            >
              <AppIcon iconId="x" className="note-tab-close-icon" />
            </button>
          </div>
        )
      })}
    </nav>
  )
}
