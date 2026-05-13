import { createPortal } from 'react-dom'
import type { RefObject } from 'react'
import { MAX_NOTE_AISLES } from '../../state/workspace'
import type { NoteAisle } from '../../types/app'

type ToolbarPopoverPosition = {
  top: number
  left: number
}

type AisleDeleteConfirmationState = {
  aisleId: string
  aisleIndex: number
  top: number
  left: number
}

type EditorToolbarPopoversProps = {
  headingMenuOpen: boolean
  noteToolsOpen: boolean
  toolbarPopoverPosition: {
    heading: ToolbarPopoverPosition | null
    aisles: ToolbarPopoverPosition | null
  }
  aisleDeleteMode: boolean
  aisleDeleteConfirmation: AisleDeleteConfirmationState | null
  activeNoteAisles: NoteAisle[]
  aisleDeleteConfirmButtonRef: RefObject<HTMLButtonElement | null>
  onExecuteToolbarCommand: (command: string, payload?: Record<string, unknown>) => void
  onCloseAislePopover: () => void
  onAddAisle: () => void
  onEnterAisleDeleteMode: () => void
  onCancelAisleDeleteConfirmation: () => void
  onDeleteAisle: (aisleId: string) => void
  onWarn: (message: string) => void
}

export function EditorToolbarPopovers({
  headingMenuOpen,
  noteToolsOpen,
  toolbarPopoverPosition,
  aisleDeleteMode,
  aisleDeleteConfirmation,
  activeNoteAisles,
  aisleDeleteConfirmButtonRef,
  onExecuteToolbarCommand,
  onCloseAislePopover,
  onAddAisle,
  onEnterAisleDeleteMode,
  onCancelAisleDeleteConfirmation,
  onDeleteAisle,
  onWarn,
}: EditorToolbarPopoversProps) {
  if (typeof document === 'undefined') return null
  const portalRoot = document.querySelector('.app-shell') ?? document.body
  const headingPopover =
    headingMenuOpen && toolbarPopoverPosition.heading
      ? createPortal(
          <div
            className="note-toolbar-heading-popover"
            role="menu"
            style={{
              top: `${toolbarPopoverPosition.heading.top}px`,
              left: `${toolbarPopoverPosition.heading.left}px`,
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => event.stopPropagation()}
          >
            {[1, 2, 3, 4, 5, 6].map((level) => (
              <button
                key={level}
                type="button"
                className="note-tools-item"
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  onExecuteToolbarCommand('heading', { level })
                }}
              >
                heading {level}
              </button>
            ))}
            <button
              type="button"
              className="note-tools-item"
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onExecuteToolbarCommand('heading', { level: 0 })
              }}
            >
              paragraph
            </button>
          </div>,
          portalRoot,
        )
      : null

  const aislePopover =
    noteToolsOpen && toolbarPopoverPosition.aisles
      ? createPortal(
          <div
            className="note-toolbar-aisle-popover"
            role="menu"
            style={{
              top: `${toolbarPopoverPosition.aisles.top}px`,
              left: `${toolbarPopoverPosition.aisles.left}px`,
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="note-tools-item"
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onCloseAislePopover()
                onAddAisle()
              }}
              disabled={activeNoteAisles.length >= MAX_NOTE_AISLES}
            >
              add aisle
            </button>
            <button
              type="button"
              className="note-tools-item"
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onCloseAislePopover()
                if (activeNoteAisles.length <= 1) {
                  onWarn('a note must keep at least one aisle.')
                  return
                }
                onEnterAisleDeleteMode()
              }}
              disabled={activeNoteAisles.length <= 1}
            >
              delete aisle
            </button>
          </div>,
          portalRoot,
        )
      : null

  const deleteConfirmation =
    aisleDeleteMode && aisleDeleteConfirmation
      ? (() => {
          const aisle = activeNoteAisles.find((candidate) => candidate.id === aisleDeleteConfirmation.aisleId)
          if (!aisle) return null
          return createPortal(
            <div
              className="note-aisle-delete-confirmation"
              role="dialog"
              aria-modal="false"
              aria-label={`Confirm delete aisle ${aisleDeleteConfirmation.aisleIndex + 1}`}
              style={{ top: `${aisleDeleteConfirmation.top}px`, left: `${aisleDeleteConfirmation.left}px` }}
              onPointerDown={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
            >
              <p>this delete is permanent</p>
              <div className="note-aisle-delete-confirmation-actions">
                <button type="button" className="btn btn-sm btn-outline-light" onClick={onCancelAisleDeleteConfirmation}>
                  cancel
                </button>
                <button
                  ref={aisleDeleteConfirmButtonRef}
                  type="button"
                  className="btn btn-sm app-danger-btn"
                  onClick={() => onDeleteAisle(aisle.id)}
                >
                  delete
                </button>
              </div>
            </div>,
            portalRoot,
          )
        })()
      : null

  return (
    <>
      {headingPopover}
      {aislePopover}
      {deleteConfirmation}
    </>
  )
}
