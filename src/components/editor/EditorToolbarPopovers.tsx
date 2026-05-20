import { createPortal } from 'react-dom'
import type { NoteAisle } from '../../types/app'
import type { ToolbarHeadingLevel } from './toolbar-state'

type ToolbarPopoverPosition = {
  top: number
  left: number
}

type EditorToolbarPopoversProps = {
  disabled?: boolean
  headingMenuOpen: boolean
  noteToolsOpen: boolean
  activeHeadingLevel: ToolbarHeadingLevel
  toolbarPopoverPosition: {
    heading: ToolbarPopoverPosition | null
    aisles: ToolbarPopoverPosition | null
  }
  activeNoteAisles: NoteAisle[]
  onExecuteToolbarCommand: (command: string, payload?: Record<string, unknown>) => void
  onCloseAislePopover: () => void
  onAddAisle: () => void
  onOpenAisleEditModal: () => void
}

export function AisleToolbarMenu({
  onCloseAislePopover,
  onAddAisle,
  onOpenAisleEditModal,
}: Pick<
  EditorToolbarPopoversProps,
  'onCloseAislePopover' | 'onAddAisle' | 'onOpenAisleEditModal'
>) {
  return (
    <>
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
          onOpenAisleEditModal()
        }}
      >
        edit aisles
      </button>
    </>
  )
}

export function EditorToolbarPopovers({
  disabled = false,
  headingMenuOpen,
  noteToolsOpen,
  activeHeadingLevel,
  toolbarPopoverPosition,
  onExecuteToolbarCommand,
  onCloseAislePopover,
  onAddAisle,
  onOpenAisleEditModal,
}: EditorToolbarPopoversProps) {
  if (typeof document === 'undefined') return null
  if (disabled) return null
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
                className={`note-tools-item note-heading-choice note-heading-choice-level-${level} ${
                  activeHeadingLevel === level ? 'is-active-heading-choice' : ''
                }`}
                aria-current={activeHeadingLevel === level ? 'true' : undefined}
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
              className={`note-tools-item note-heading-choice note-heading-choice-paragraph ${
                activeHeadingLevel === 0 ? 'is-active-heading-choice' : ''
              }`}
              aria-current={activeHeadingLevel === 0 ? 'true' : undefined}
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
            <AisleToolbarMenu
              onCloseAislePopover={onCloseAislePopover}
              onAddAisle={onAddAisle}
              onOpenAisleEditModal={onOpenAisleEditModal}
            />
          </div>,
          portalRoot,
        )
      : null

  return (
    <>
      {headingPopover}
      {aislePopover}
    </>
  )
}
