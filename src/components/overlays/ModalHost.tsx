import { NoteLocationPicker, type NoteLocationPickerValue } from '../notes/NoteLocationPicker'
import { buildNoteLocationKey, listNoteLocationsForBody } from '../../notes/note-locations'
import type { AppState, Domain, ModalState, Space } from '../../types/app'
import { getModalText } from './modal-text'

type ModalHostProps = {
  modal: ModalState | null
  state: AppState
  activeSpace: Space
  domainsForPickers: Domain[]
  onModalChange: (modal: ModalState | null) => void
  onConfirm: () => void
}

export function ModalHost({
  modal,
  state,
  activeSpace,
  domainsForPickers,
  onModalChange,
  onConfirm,
}: ModalHostProps) {
  if (!modal) return null

  const modalText = getModalText(modal, state)
  const isPickerModal =
    modal.type === 'export-space' ||
    modal.type === 'duplicate-note' ||
    modal.type === 'copy-note' ||
    modal.type === 'deduplicate-note' ||
    modal.type === 'insert-note-reference'
  const isNotePickerModal =
    modal.type === 'duplicate-note' || modal.type === 'copy-note' || modal.type === 'insert-note-reference'

  return (
    <div className="delete-modal-backdrop" onClick={() => onModalChange(null)}>
      <div
        className={`delete-modal ${isPickerModal ? 'settings-modal' : ''} ${isNotePickerModal ? 'note-picker-modal' : ''}`}
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
        {modal.type === 'duplicate-note' && (
          <NoteLocationPicker
            domains={domainsForPickers}
            noteBodies={state.noteBodies}
            value={modal.target}
            onChange={(target: NoteLocationPickerValue) => onModalChange({ ...modal, target })}
          />
        )}
        {modal.type === 'copy-note' && (
          <NoteLocationPicker
            domains={domainsForPickers}
            noteBodies={state.noteBodies}
            value={modal.target}
            onChange={(target: NoteLocationPickerValue) => onModalChange({ ...modal, target })}
          />
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
