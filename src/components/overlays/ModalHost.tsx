import { useEffect, useState, type DragEvent } from 'react'
import { NoteLocationPicker, type NoteLocationPickerValue } from '../notes/NoteLocationPicker'
import {
  NEWLINE_MENU_ELIGIBLE_OPERATIONS,
  NEWLINE_OPERATION_LABELS,
} from '../../hotkeys/shortcuts'
import { buildNoteLocationKey, listNoteLocationsForBody } from '../../notes/note-locations'
import type { AppState, Domain, ModalState, NewlineOperationId, Space } from '../../types/app'
import { getModalText } from './modal-text'

type ModalHostProps = {
  modal: ModalState | null
  state: AppState
  activeSpace: Space
  domainsForPickers: Domain[]
  newlineMenuOperations: NewlineOperationId[]
  onModalChange: (modal: ModalState | null) => void
  onNewlineMenuOperationsChange: (operations: NewlineOperationId[]) => void
  onConfirm: () => void
}

const MENU_SLOT_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']
const NEWLINE_DRAG_MIME = 'application/x-tabs-newline-operation'

function NewlineMenuSettings({
  operations,
  onChange,
}: {
  operations: NewlineOperationId[]
  onChange: (operations: NewlineOperationId[]) => void
}) {
  const [draggedOperation, setDraggedOperation] = useState<NewlineOperationId | null>(null)
  const [dropTarget, setDropTarget] = useState<{ type: 'slot'; index: number } | { type: 'pool' } | null>(null)
  const selected = operations.filter((operation) => NEWLINE_MENU_ELIGIBLE_OPERATIONS.includes(operation))
  const available = NEWLINE_MENU_ELIGIBLE_OPERATIONS.filter((operation) => !selected.includes(operation))

  const moveOperationToSlot = (operation: NewlineOperationId, slotIndex: number) => {
    const next = selected.filter((candidate) => candidate !== operation)
    next.splice(Math.min(slotIndex, next.length), 0, operation)
    onChange(next.slice(0, MENU_SLOT_LABELS.length))
  }

  const removeOperation = (operation: NewlineOperationId) => {
    onChange(selected.filter((candidate) => candidate !== operation))
  }

  const getDraggedOperation = (event: DragEvent) => {
    const operation = event.dataTransfer.getData(NEWLINE_DRAG_MIME) || event.dataTransfer.getData('text/plain')
    return NEWLINE_MENU_ELIGIBLE_OPERATIONS.includes(operation as NewlineOperationId)
      ? (operation as NewlineOperationId)
      : null
  }

  const startDrag = (event: DragEvent, operation: NewlineOperationId) => {
    setDraggedOperation(operation)
    setDropTarget(null)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(NEWLINE_DRAG_MIME, operation)
    event.dataTransfer.setData('text/plain', operation)
  }

  const finishDrag = () => {
    setDraggedOperation(null)
    setDropTarget(null)
  }

  return (
    <div className="newline-menu-settings">
      <div className="newline-menu-slots" aria-label="New line menu order">
        {MENU_SLOT_LABELS.map((slotLabel, index) => {
          const operation = selected[index]
          const isDropTarget = dropTarget?.type === 'slot' && dropTarget.index === index
          const isDragSource = Boolean(draggedOperation && operation === draggedOperation)
          return (
            <div
              key={slotLabel}
              className={`newline-menu-slot ${operation ? 'has-operation' : ''} ${isDropTarget ? 'is-drop-target' : ''} ${
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
              <span className="newline-menu-slot-number">{slotLabel}</span>
              {operation ? (
                <button
                  type="button"
                  draggable
                  className={`newline-menu-operation-chip ${draggedOperation === operation ? 'is-dragging' : ''}`}
                  onDragStart={(event) => startDrag(event, operation)}
                  onDragEnd={finishDrag}
                  onClick={() => removeOperation(operation)}
                  title="Click to remove"
                >
                  {NEWLINE_OPERATION_LABELS[operation]}
                </button>
              ) : (
                <span className="newline-menu-empty-slot">unassigned</span>
              )}
            </div>
          )
        })}
      </div>
      <div
        className={`newline-menu-pool ${dropTarget?.type === 'pool' ? 'is-drop-target' : ''}`}
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
        <span className="newline-menu-pool-label">available</span>
        <div className="newline-menu-pool-items">
          {available.length > 0 ? (
            available.map((operation) => (
              <button
                key={operation}
                type="button"
                draggable
                className={`newline-menu-operation-chip ${draggedOperation === operation ? 'is-dragging' : ''}`}
                onDragStart={(event) => startDrag(event, operation)}
                onDragEnd={finishDrag}
                onClick={() => moveOperationToSlot(operation, selected.length)}
              >
                {NEWLINE_OPERATION_LABELS[operation]}
              </button>
            ))
          ) : (
            <span className="newline-menu-pool-empty">all operations are in the menu</span>
          )}
        </div>
      </div>
    </div>
  )
}

export function ModalHost({
  modal,
  state,
  activeSpace,
  domainsForPickers,
  newlineMenuOperations,
  onModalChange,
  onNewlineMenuOperationsChange,
  onConfirm,
}: ModalHostProps) {
  useEffect(() => {
    if (!modal) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation()
      }
      onModalChange(null)
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [modal, onModalChange])

  if (!modal) return null

  const modalText = getModalText(modal, state)
  const isPickerModal =
    modal.type === 'export-space' ||
    modal.type === 'copy-note' ||
    modal.type === 'deduplicate-note' ||
    modal.type === 'insert-note-reference' ||
    modal.type === 'newline-menu-settings'
  const isNotePickerModal = modal.type === 'copy-note' || modal.type === 'insert-note-reference'

  return (
    <div className="delete-modal-backdrop" onClick={() => onModalChange(null)}>
      <div
        className={`delete-modal ${isPickerModal ? 'settings-modal' : ''} ${isNotePickerModal ? 'note-picker-modal' : ''} ${
          modal.type === 'newline-menu-settings' ? 'newline-settings-modal' : ''
        }`}
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <h2>{modalText.title}</h2>
        <p>{modalText.body}</p>
        {modal.type === 'export-space' && (
          <label className="settings-modal-field">
            <span>space</span>
            <select
              className="settings-select-input"
              value={state.spaces.some((space) => space.id === modal.spaceId) ? modal.spaceId : activeSpace.id}
              onChange={(event) => onModalChange({ type: 'export-space', spaceId: event.target.value })}
            >
              {state.spaces.map((space) => (
                <option key={space.id} value={space.id}>
                  {space.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {modal.type === 'copy-note' && (
          <div className="note-copy-modal">
            <div className="note-reference-mode" role="group" aria-label="Copy type">
              <button
                type="button"
                className={`note-reference-mode-btn ${modal.mode === 'independent' ? 'is-active' : ''}`}
                onClick={() => onModalChange({ ...modal, mode: 'independent' })}
              >
                independent
              </button>
              <button
                type="button"
                className={`note-reference-mode-btn ${modal.mode === 'linked' ? 'is-active' : ''}`}
                onClick={() => onModalChange({ ...modal, mode: 'linked' })}
              >
                linked
              </button>
            </div>
            <NoteLocationPicker
              domains={domainsForPickers}
              noteBodies={state.noteBodies}
              value={modal.target}
              onChange={(target: NoteLocationPickerValue) => onModalChange({ ...modal, target })}
            />
          </div>
        )}
        {modal.type === 'deduplicate-note' && (
          <div className="duplicate-note-list">
            {listNoteLocationsForBody(state, modal.noteBodyId).map((location) => {
              const locationKey = buildNoteLocationKey(location)
              return (
                <label key={locationKey} className="duplicate-note-choice">
                  <input
                    type="checkbox"
                    checked={modal.keepLocationKeys.includes(locationKey)}
                    onChange={(event) => {
                      const keepLocationKeys = event.target.checked
                        ? [...modal.keepLocationKeys, locationKey]
                        : modal.keepLocationKeys.filter((key) => key !== locationKey)
                      onModalChange({ ...modal, keepLocationKeys })
                    }}
                  />
                  <span>{location.label}</span>
                </label>
              )
            })}
          </div>
        )}
        {modal.type === 'insert-note-reference' && (
          <div className="note-reference-modal">
            <div className="note-reference-mode" role="group" aria-label="Reference type">
              <button
                type="button"
                className={`note-reference-mode-btn ${modal.insertAs === 'link' ? 'is-active' : ''}`}
                onClick={() => onModalChange({ ...modal, insertAs: 'link', editingTokenId: undefined })}
                disabled={Boolean(modal.editingTokenId)}
              >
                link a note
              </button>
              <button
                type="button"
                className={`note-reference-mode-btn ${modal.insertAs === 'context' ? 'is-active' : ''}`}
                onClick={() => onModalChange({ ...modal, insertAs: 'context' })}
              >
                note preview
              </button>
            </div>
            <NoteLocationPicker
              domains={domainsForPickers}
              noteBodies={state.noteBodies}
              value={modal.target}
              includeAisles={modal.insertAs === 'context'}
              allowAllAisles
              onChange={(target: NoteLocationPickerValue) => onModalChange({ ...modal, target })}
            />
          </div>
        )}
        {modal.type === 'newline-menu-settings' && (
          <NewlineMenuSettings operations={newlineMenuOperations} onChange={onNewlineMenuOperationsChange} />
        )}
        <div className="delete-modal-actions">
          <button type="button" className="btn btn-sm btn-outline-light modal-cancel-btn" onClick={() => onModalChange(null)}>
            cancel
          </button>
          <button
            type="button"
            className={`btn btn-sm ${
              modal.type === 'delete-target' || modal.type === 'trash-delete-all' ? 'app-danger-btn' : 'modal-primary-btn'
            }`}
            disabled={modal.type === 'deduplicate-note' && modal.keepLocationKeys.length === 0}
            onClick={() => {
              if (modal.type === 'delete-target' && modal.target.type === 'space' && state.spaces.length <= 1) {
                onModalChange(null)
                return
              }
              onConfirm()
            }}
          >
            {modalText.action}
          </button>
        </div>
      </div>
    </div>
  )
}
