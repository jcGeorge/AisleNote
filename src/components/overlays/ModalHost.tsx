import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { NoteLocationPicker, type NoteLocationPickerValue } from '../notes/NoteLocationPicker'
import {
  NEWLINE_OPERATION_LABELS,
  SHORTCUT_MENU_ELIGIBLE_OPERATIONS,
} from '../../hotkeys/shortcuts'
import { NAME_SORT_OPTIONS, TAB_SORT_OPTIONS } from '../../arrange/tab-sort'
import {
  FRONTMATTER_FIELD_TYPES,
  getFrontmatterDatePickerValue,
  getFrontmatterDatetimePickerValue,
  getFrontmatterDraftValueForType,
  getFrontmatterComputedValuesForFieldType,
  isFrontmatterComputedValueCompatibleWithFieldType,
} from '../../frontmatter/frontmatter'
import { buildFrontmatterModalDraftForAisle, buildFrontmatterRowsForAisle } from '../../frontmatter/frontmatter-state'
import { getDefaultNoteLinkLabel, listNoteLocationsForBody } from '../../notes/note-locations'
import { getAisleBodyId } from '../../notes/note-markdown'
import { normalizeNoteReferenceTarget, resolveNoteReferenceTarget } from '../../notes/note-reference-targets'
import { createId } from '../../state/workspace'
import type {
  AppState,
  Domain,
  FrontmatterRowDraft,
  LinkInsertMode,
  ModalState,
  NewlineOperationId,
  NoteCopyDestinationMode,
  NoteCopyMode,
  Space,
  TabSortMode,
  TabSortTarget,
} from '../../types/app'
import { shouldModalBackdropClose } from './modal-behavior'
import { shouldSubmitInsertNoteReferenceOnEnter } from './modal-keyboard'
import { makeFrontmatterRowsManual, normalizeFrontmatterModalRows } from './frontmatter-modal-state'
import { getModalText } from './modal-text'
import { getNoteCopyModeLabel } from '../../notes/copy-reference-labels'
import { DecoupleLocationCardStrip } from './DecoupleLocationCardStrip'

type ModalHostProps = {
  modal: ModalState | null
  state: AppState
  activeSpace: Space
  domainsForPickers: Domain[]
  shortcutMenuOperations: NewlineOperationId[]
  onModalChange: (modal: ModalState | null) => void
  onShortcutMenuOperationsChange: (operations: NewlineOperationId[]) => void
  onEditFrontmatterTemplate: (templateId: string) => void
  onWarn: (message: string) => void
  onError: (message: string) => void
  onApplyTabSort: (target: TabSortTarget, mode: TabSortMode) => void
  onLinkInsertModeChange: (mode: LinkInsertMode) => void
  onNoteCopyModeChange: (mode: NoteCopyMode) => void
  onDeduplicateKeepDataChange: (keepData: boolean) => void
  onConfirm: () => void
}

const MENU_SLOT_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']
const SHORTCUT_MENU_DRAG_MIME = 'application/x-tabs-shortcut-menu-operation'
const DECOUPLE_MODAL_MIN_WIDTH_REM = 20
const DECOUPLE_MODAL_SMALL_SET_MIN_WIDTH_REM = 30
const DECOUPLE_MODAL_MAX_WIDTH_REM = 70
const DECOUPLE_LOCATION_CARD_WIDTH_REM = 12
const DECOUPLE_LOCATION_CARD_GAP_REM = 0.55
const DECOUPLE_MODAL_HORIZONTAL_CHROME_REM = 2.1

function getDecoupleModalContentWidth(locationCount: number) {
  const cardCount = Math.max(1, locationCount)
  const cardStripWidth =
    cardCount * DECOUPLE_LOCATION_CARD_WIDTH_REM + Math.max(0, cardCount - 1) * DECOUPLE_LOCATION_CARD_GAP_REM
  const minimumWidth = cardCount <= 1 ? DECOUPLE_MODAL_MIN_WIDTH_REM : DECOUPLE_MODAL_SMALL_SET_MIN_WIDTH_REM
  const clampedWidth = Math.min(
    DECOUPLE_MODAL_MAX_WIDTH_REM,
    Math.max(minimumWidth, cardStripWidth + DECOUPLE_MODAL_HORIZONTAL_CHROME_REM),
  )
  return `${Number(clampedWidth.toFixed(2))}rem`
}

function ShortcutMenuSettings({
  operations,
  onChange,
}: {
  operations: NewlineOperationId[]
  onChange: (operations: NewlineOperationId[]) => void
}) {
  const [draggedOperation, setDraggedOperation] = useState<NewlineOperationId | null>(null)
  const [dropTarget, setDropTarget] = useState<{ type: 'slot'; index: number } | { type: 'pool' } | null>(null)
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
                  title="Click to remove"
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

export function ModalHost({
  modal,
  state,
  activeSpace,
  domainsForPickers,
  shortcutMenuOperations,
  onModalChange,
  onShortcutMenuOperationsChange,
  onEditFrontmatterTemplate,
  onWarn,
  onError,
  onApplyTabSort,
  onLinkInsertModeChange,
  onNoteCopyModeChange,
  onDeduplicateKeepDataChange,
  onConfirm,
}: ModalHostProps) {
  const enterSubmitPendingRef = useRef(false)

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

  useEffect(() => {
    enterSubmitPendingRef.current = false
  }, [modal])

  const runPrimaryModalAction = () => {
    if (!modal) return
    onConfirm()
  }

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = event.target instanceof HTMLElement ? event.target : null
    if (!shouldSubmitInsertNoteReferenceOnEnter({
      modalType: modal?.type ?? null,
      key: event.key,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      isComposing: event.nativeEvent.isComposing,
      targetTagName: target?.tagName,
      targetInputType: target instanceof HTMLInputElement ? target.type : undefined,
    })) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    if (enterSubmitPendingRef.current) return
    enterSubmitPendingRef.current = true
    runPrimaryModalAction()
    window.setTimeout(() => {
      enterSubmitPendingRef.current = false
    }, 0)
  }

  if (!modal) return null

  const modalText = getModalText(modal, state)
  const isPickerModal =
    modal.type === 'export-space' ||
    modal.type === 'copy-note' ||
    modal.type === 'deduplicate-note' ||
    modal.type === 'linked-aisle' ||
    modal.type === 'insert-note-reference' ||
    modal.type === 'frontmatter-note' ||
    modal.type === 'sort-tabs' ||
    modal.type === 'shortcut-menu-settings'
  const isNotePickerModal = modal.type === 'copy-note' || modal.type === 'insert-note-reference'
  const isNoteLevelDecoupleModal =
    modal.type === 'deduplicate-note' || (modal.type === 'linked-aisle' && modal.reason === 'note-body')
  const decoupleLocationCount = isNoteLevelDecoupleModal
    ? listNoteLocationsForBody(state, modal.noteBodyId).length
    : 0
  const modalStyle = isNoteLevelDecoupleModal
    ? ({
        '--decouple-modal-content-width': getDecoupleModalContentWidth(decoupleLocationCount),
      } as CSSProperties)
    : undefined

  const setLinkModalMode = (mode: LinkInsertMode) => {
    if (modal.type !== 'insert-note-reference' || modal.modeLocked) return
    onLinkInsertModeChange(mode)
    onModalChange({ ...modal, mode })
  }

  const setNoteReferenceInsertKind = (insertAs: Extract<ModalState, { type: 'insert-note-reference' }>['insertAs']) => {
    if (modal.type !== 'insert-note-reference') return
    onModalChange({
      ...modal,
      insertAs,
      editingTokenId: insertAs === 'link' ? undefined : modal.editingTokenId,
      target: normalizeNoteReferenceTarget(state, modal.target),
    })
  }

  const setCopyModalMode = (mode: NoteCopyMode) => {
    if (modal.type !== 'copy-note') return
    onNoteCopyModeChange(mode)
    onModalChange({ ...modal, mode })
  }

  const setCopyDestinationMode = (destinationMode: NoteCopyDestinationMode) => {
    if (modal.type !== 'copy-note') return
    onModalChange({ ...modal, destinationMode })
  }

  const setDeduplicateKeepData = (keepData: boolean) => {
    if (modal.type !== 'deduplicate-note') return
    onDeduplicateKeepDataChange(keepData)
    onModalChange({ ...modal, keepData })
  }

  const setLinkedAisleKeepData = (keepData: boolean) => {
    if (modal.type !== 'linked-aisle' || modal.reason !== 'note-body') return
    onDeduplicateKeepDataChange(keepData)
    onModalChange({ ...modal, keepData })
  }

  const updateLinkModalTarget = (target: NoteLocationPickerValue) => {
    if (modal.type !== 'insert-note-reference') return
    const normalizedTarget = normalizeNoteReferenceTarget(state, target)
    onModalChange({
      ...modal,
      target: normalizedTarget,
      noteLabel:
        modal.internalEdit || modal.noteLabelTouched || modal.insertAs !== 'link'
          ? modal.noteLabel
          : getDefaultNoteLinkLabel(state, modal.source, normalizedTarget),
    })
  }

  const setNoteReferenceHeading = (headingKey: string | null) => {
    if (modal.type !== 'insert-note-reference') return
    const resolved = resolveNoteReferenceTarget(state, modal.target)
    if (!resolved.selectedAisle) return
    onModalChange({
      ...modal,
      target: {
        ...resolved.target,
        heading: headingKey ? { aisleId: resolved.selectedAisle.id, headingKey } : undefined,
        previewStart: undefined,
      },
    })
  }

  const setNoteReferenceStart = (previewStart: 'top' | 'last-position') => {
    if (modal.type !== 'insert-note-reference') return
    const resolved = resolveNoteReferenceTarget(state, modal.target)
    if (!resolved.selectedAisle) return
    onModalChange({
      ...modal,
      target: {
        ...resolved.target,
        heading: undefined,
        previewStart: previewStart === 'last-position' ? 'last-position' : undefined,
      },
    })
  }

  const updateFrontmatterRows = (updater: (rows: FrontmatterRowDraft[]) => FrontmatterRowDraft[]) => {
    if (modal.type !== 'frontmatter-note') return
    onModalChange(normalizeFrontmatterModalRows(modal, updater(modal.rows)))
  }

  const updateFrontmatterRow = (rowId: string, patch: Partial<FrontmatterRowDraft>) => {
    updateFrontmatterRows((rows) => rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)))
  }

  const frontmatterModalBody = modal?.type === 'frontmatter-note'
    ? state.noteBodies.find((body) => body.id === modal.noteBodyId) ?? null
    : null
  const frontmatterModalAisles = frontmatterModalBody?.aisles ?? []

  const setFrontmatterAisle = (aisleId: string) => {
    if (modal.type !== 'frontmatter-note') return
    const aisle = frontmatterModalAisles.find((candidate) => candidate.id === aisleId) ?? null
    if (!aisle) return
    const aisleBodyId = getAisleBodyId(aisle)
    const aisleBody = (state.noteAisleBodies ?? []).find((body) => body.id === aisleBodyId) ?? null
    if (aisleBody?.frontmatterStatus === 'invalid') {
      onWarn('frontmatter YAML is invalid. fix the markdown block before using the frontmatter menu.')
      return
    }
    const draft = buildFrontmatterModalDraftForAisle(state, modal.noteBodyId, aisleBodyId, modal.location)
    onModalChange({
      ...modal,
      aisleId,
      aisleBodyId,
      rows: draft.rows,
      selectedTemplateId: draft.selectedTemplateId,
      templateDerived: draft.templateDerived,
      isTemplateSuggestionDraft: draft.isTemplateSuggestionDraft,
    })
  }

  const createFrontmatterRowKey = (rows: FrontmatterRowDraft[]) => {
    const existingKeys = new Set(rows.map((row) => row.key.trim()).filter(Boolean))
    let key = 'field'
    let index = 2
    while (existingKeys.has(key)) {
      key = `field ${index}`
      index += 1
    }
    return key
  }

  const isFrontmatterBooleanTrue = (value: string) => {
    const normalized = value.trim().toLowerCase()
    return normalized === 'true' || normalized === 'yes' || normalized === 'on' || normalized === '1'
  }

  const getFrontmatterRowValueInputType = (type: FrontmatterRowDraft['type']) => {
    if (type === 'number') return 'number'
    if (type === 'date') return 'date'
    if (type === 'datetime') return 'datetime-local'
    return 'text'
  }

  const getFrontmatterRowValueInputValue = (row: FrontmatterRowDraft) => {
    if (row.type === 'date') return getFrontmatterDatePickerValue(row.value)
    if (row.type === 'datetime') return getFrontmatterDatetimePickerValue(row.value)
    return row.value
  }

  const isComputedEnabled = (row: FrontmatterRowDraft) => row.computedEnabled ?? row.computed !== 'none'
  const isComputedLocked = (row: FrontmatterRowDraft) => Boolean(row.computedLocked || (row.derived && row.computed !== 'none'))
  const isDerivedNormalRow = (row: FrontmatterRowDraft) => Boolean(row.derived && row.computed === 'none')
  const getComputedLockedMessage = (row: FrontmatterRowDraft) => (
    row.derived
      ? 'computed fields that are derived can not be changed here, edit the fm template'
      : 'computed fields, once set, can not be changed'
  )

  const warnComputedLocked = (row: FrontmatterRowDraft) => {
    onWarn(getComputedLockedMessage(row))
  }

  const warnDerivedComputedBlocked = () => {
    onError('derived fields can not be made into computed fields, change the fm template to accomodate')
  }

  const warnDerivedKeyLocked = () => {
    onWarn('derived fields cannot have their names changed')
  }

  const warnReadOnlyRowName = (row: FrontmatterRowDraft) => {
    if (row.derived) warnDerivedKeyLocked()
    else if (isComputedLocked(row)) warnComputedLocked(row)
  }

  const handleComputedLockedMouseDown = (event: ReactMouseEvent, row: FrontmatterRowDraft) => {
    event.preventDefault()
    warnComputedLocked(row)
  }

  const renderFrontmatterValueControl = (row: FrontmatterRowDraft) => {
    const computedEnabled = isComputedEnabled(row)

    if (computedEnabled) {
      const computedOptions = getFrontmatterComputedValuesForFieldType(row.type).filter((computed) => computed !== 'none')
      return (
        <select
          className="settings-select-input frontmatter-row-value-input"
          value={row.computed !== 'none' && isFrontmatterComputedValueCompatibleWithFieldType(row.computed, row.type) ? row.computed : ''}
          aria-label="computed frontmatter value"
          title={isComputedLocked(row) ? getComputedLockedMessage(row) : undefined}
          onMouseDown={isComputedLocked(row) ? (event) => handleComputedLockedMouseDown(event, row) : undefined}
          onKeyDown={isComputedLocked(row) ? (event) => {
            event.preventDefault()
            warnComputedLocked(row)
          } : undefined}
          onChange={(event) => {
            if (isComputedLocked(row)) {
              warnComputedLocked(row)
              return
            }
            const computed = event.target.value === '' ? 'none' : event.target.value as FrontmatterRowDraft['computed']
            updateFrontmatterRow(row.id, {
              computed,
              locked: computed !== 'none',
            })
          }}
        >
          <option value="">computed value</option>
          {computedOptions.map((computed) => (
            <option key={computed} value={computed}>
              {computed}
            </option>
          ))}
        </select>
      )
    }

    if (row.type === 'boolean') {
      const checked = isFrontmatterBooleanTrue(row.value)
      return (
        <label className="frontmatter-boolean-switch form-check form-switch settings-switch frontmatter-row-value-input">
          <input
            className="form-check-input"
            type="checkbox"
            role="switch"
            checked={checked}
            aria-label="frontmatter boolean value"
            onChange={(event) => updateFrontmatterRow(row.id, { value: event.target.checked ? 'true' : 'false' })}
          />
          <span className="frontmatter-boolean-switch-label">{checked ? 'true' : 'false'}</span>
        </label>
      )
    }

    return (
      <input
        type={getFrontmatterRowValueInputType(row.type)}
        className="settings-text-input frontmatter-row-value-input"
        value={getFrontmatterRowValueInputValue(row)}
        aria-label="frontmatter value"
        placeholder={row.type === 'list' ? 'one, two' : 'value'}
        onChange={(event) => updateFrontmatterRow(row.id, { value: event.target.value })}
      />
    )
  }

  const renderFrontmatterComputedControl = (row: FrontmatterRowDraft) => {
    const checked = isComputedEnabled(row)
    const derivedComputedBlocked = isDerivedNormalRow(row) && !checked
    return (
      <label className="frontmatter-computed-switch form-check form-switch settings-switch">
        <input
          className="form-check-input"
          type="checkbox"
          role="switch"
          checked={checked}
          aria-label="frontmatter computed"
          title={isComputedLocked(row) ? getComputedLockedMessage(row) : undefined}
          onKeyDown={(event) => {
            if (isComputedLocked(row)) {
              event.preventDefault()
              warnComputedLocked(row)
              return
            }
            if (derivedComputedBlocked && (event.key === ' ' || event.key === 'Enter')) {
              event.preventDefault()
              warnDerivedComputedBlocked()
            }
          }}
          onChange={(event) => {
            if (isComputedLocked(row)) {
              warnComputedLocked(row)
              return
            }
            if (isDerivedNormalRow(row) && event.target.checked) {
              warnDerivedComputedBlocked()
              return
            }
            updateFrontmatterRow(row.id, {
              computedEnabled: event.target.checked,
              computed: event.target.checked ? row.computed : 'none',
              locked: event.target.checked,
            })
          }}
        />
      </label>
    )
  }

  const renderNoteReferenceHeadings = () => {
    if (modal.type !== 'insert-note-reference' || modal.mode !== 'note') return null
    const resolved = resolveNoteReferenceTarget(state, modal.target)
    if (!resolved.selectedAisle) return null
    const isPreviewReference = modal.insertAs === 'preview'
    if (!isPreviewReference) {
      return (
        <div className="note-reference-heading-picker" role="group" aria-label="Link start">
          <span className="note-reference-heading-label">link starts at</span>
          <div className="note-reference-heading-list">
            <button
              type="button"
              className={`note-reference-heading-btn ${
                !resolved.target.heading && resolved.target.previewStart !== 'last-position' ? 'is-active' : ''
              }`}
              onClick={() => setNoteReferenceStart('top')}
            >
              at the top
            </button>
            <button
              type="button"
              className={`note-reference-heading-btn ${resolved.target.previewStart === 'last-position' ? 'is-active' : ''}`}
              onClick={() => setNoteReferenceStart('last-position')}
            >
              last position
            </button>
            {resolved.headings.length > 0 && <span className="note-reference-heading-separator" aria-hidden="true" />}
            {resolved.headings.map((heading) => (
              <button
                key={heading.key}
                type="button"
                className={`note-reference-heading-btn ${
                  resolved.target.heading?.headingKey === heading.key ? 'is-active' : ''
                }`}
                style={{ '--note-reference-heading-indent': `${Math.max(0, heading.level - 1) * 0.78}rem` } as CSSProperties}
                onClick={() => setNoteReferenceHeading(heading.key)}
              >
                {heading.text || `heading ${heading.level}`}
              </button>
            ))}
          </div>
        </div>
      )
    }
    return (
      <div className="note-reference-heading-picker" role="group" aria-label="Preview start">
        <span className="note-reference-heading-label">preview starts at</span>
        <div className="note-reference-heading-list">
          <button
            type="button"
            className={`note-reference-heading-btn ${
              !resolved.target.heading && resolved.target.previewStart !== 'last-position' ? 'is-active' : ''
            }`}
            onClick={() => setNoteReferenceStart('top')}
          >
            at the top
          </button>
          <button
            type="button"
            className={`note-reference-heading-btn ${resolved.target.previewStart === 'last-position' ? 'is-active' : ''}`}
            onClick={() => setNoteReferenceStart('last-position')}
          >
            last position
          </button>
          {resolved.headings.length > 0 && <span className="note-reference-heading-separator" aria-hidden="true" />}
          {resolved.headings.map((heading) => (
            <button
              key={heading.key}
              type="button"
              className={`note-reference-heading-btn ${
                resolved.target.heading?.headingKey === heading.key ? 'is-active' : ''
              }`}
              style={{ '--note-reference-heading-indent': `${Math.max(0, heading.level - 1) * 0.78}rem` } as CSSProperties}
              onClick={() => setNoteReferenceHeading(heading.key)}
            >
              {heading.text || `heading ${heading.level}`}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      className={`delete-modal-backdrop ${modal.type === 'insert-note-reference' ? 'insert-note-reference-backdrop' : ''}`}
      onClick={() => {
        if (shouldModalBackdropClose(modal)) onModalChange(null)
      }}
    >
      <div
        className={`delete-modal ${isPickerModal ? 'settings-modal' : ''} ${isNotePickerModal ? 'note-picker-modal' : ''} ${
          modal.type === 'shortcut-menu-settings' ? 'shortcut-settings-modal' : ''
        } ${modal.type === 'sort-tabs' ? 'sort-modal' : ''} ${
          modal.type === 'insert-note-reference' ? 'insert-note-reference-modal-shell' : ''
        } ${isNoteLevelDecoupleModal ? 'decouple-note-modal-shell' : ''}`}
        role="dialog"
        aria-modal="true"
        style={modalStyle}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleDialogKeyDown}
      >
        <h2>{modalText.title}</h2>
        {modal.type === 'sort-tabs' && (
          <button type="button" className="modal-close-x-btn" onClick={() => onModalChange(null)} aria-label="close sort modal">
            X
          </button>
        )}
        {modalText.body ? <p>{modalText.body}</p> : null}
        {modal.type === 'scratchpad-about' && (
          <div className="scratchpad-about-modal">
            <p>scratchpad is a quick standalone place to put unsorted notes and spur of the moment thoughts.</p>
            <p>
              it is stored with your other notes, but it does not belong to a domain, space, parent, or tab.
            </p>
            <p>
              scratchpad results appear when searching your entire notebook, or when searching within scratchpad itself.
            </p>
            <p>
              scratchpad allows 16 aisles by default, adjustable up to 40 in the misc settings. new scratchpad aisles
              are added to the left by default, also adjustable in the settings.
            </p>
          </div>
        )}
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
            <div className="note-reference-option-strip">
              <div className="note-reference-mode" role="group" aria-label="Copy type">
                <button
                  type="button"
                  className={`note-reference-mode-btn ${modal.mode === 'independent' ? 'is-active' : ''}`}
                  onClick={() => setCopyModalMode('independent')}
                >
                  {getNoteCopyModeLabel('independent')}
                </button>
                <button
                  type="button"
                  className={`note-reference-mode-btn ${modal.mode === 'linked' ? 'is-active' : ''}`}
                  onClick={() => setCopyModalMode('linked')}
                >
                  {getNoteCopyModeLabel('linked')}
                </button>
              </div>
            </div>
            <div className="note-reference-picker-divider" aria-hidden="true" />
            <NoteLocationPicker
              domains={domainsForPickers}
              noteBodies={state.noteBodies}
              value={modal.target}
              includeAisles
              allowAllAisles
              onChange={(target: NoteLocationPickerValue) => onModalChange({ ...modal, target })}
            />
            <div className="note-copy-behavior-row">
              <span className="note-copy-behavior-label">copy behavior</span>
              <div className="note-reference-mode note-copy-behavior-mode" role="group" aria-label="Copy behavior">
                <button
                  type="button"
                  className={`note-reference-mode-btn ${modal.destinationMode === 'replace' ? 'is-active' : ''}`}
                  onClick={() => setCopyDestinationMode('replace')}
                >
                  replace this note
                </button>
                <button
                  type="button"
                  className={`note-reference-mode-btn ${modal.destinationMode === 'append' ? 'is-active' : ''}`}
                  onClick={() => setCopyDestinationMode('append')}
                >
                  append as aisles
                </button>
              </div>
            </div>
          </div>
        )}
        {modal.type === 'deduplicate-note' && (
          <div className="deduplicate-note-modal">
            <DecoupleLocationCardStrip
              state={state}
              noteBodyId={modal.noteBodyId}
              keepLocationKeys={modal.keepLocationKeys}
              onKeepLocationKeysChange={(keepLocationKeys) => onModalChange({ ...modal, keepLocationKeys })}
            />
            <div className="deduplicate-keep-data-switch form-check form-switch settings-switch">
              <span>keep data in de-coupled notes?</span>
              <input
                type="checkbox"
                className="form-check-input"
                role="switch"
                aria-label="keep data in de-coupled notes?"
                checked={modal.keepData}
                onChange={(event) => setDeduplicateKeepData(event.target.checked)}
              />
            </div>
          </div>
        )}
        {modal.type === 'linked-aisle' && (
          <div className="linked-aisle-modal">
            {modal.reason === 'note-body' ? (
              <>
                <DecoupleLocationCardStrip
                  state={state}
                  noteBodyId={modal.noteBodyId}
                  keepLocationKeys={modal.keepLocationKeys}
                  onKeepLocationKeysChange={(keepLocationKeys) => onModalChange({ ...modal, keepLocationKeys })}
                />
                <div className="deduplicate-keep-data-switch form-check form-switch settings-switch">
                  <span>keep data in de-coupled notes?</span>
                  <input
                    type="checkbox"
                    className="form-check-input"
                    role="switch"
                    aria-label="keep data in de-coupled notes?"
                    checked={modal.keepData}
                    onChange={(event) => setLinkedAisleKeepData(event.target.checked)}
                  />
                </div>
              </>
            ) : (
              <div className="linked-aisle-summary">
                <p>this aisle shares content with another aisle. de-couple this aisle to make it independent.</p>
              </div>
            )}
          </div>
        )}
        {modal.type === 'insert-note-reference' && (
          <div className="note-reference-modal">
            {(!modal.modeLocked || (modal.mode === 'note' && !modal.internalEdit && !modal.editingTokenId)) && (
              <div className="note-reference-option-strip note-reference-link-option-strip">
                {!modal.modeLocked && (
                  <div className="note-reference-mode" role="group" aria-label="Link type">
                    <button
                      type="button"
                      className={`note-reference-mode-btn ${modal.mode === 'note' ? 'is-active' : ''}`}
                      onClick={() => setLinkModalMode('note')}
                    >
                      note
                    </button>
                    <button
                      type="button"
                      className={`note-reference-mode-btn ${modal.mode === 'url' ? 'is-active' : ''}`}
                      onClick={() => setLinkModalMode('url')}
                    >
                      url
                    </button>
                  </div>
                )}
                {modal.mode === 'note' && !modal.internalEdit && !modal.editingTokenId && (
                  <div className="note-reference-mode" role="group" aria-label="Note reference type">
                    <button
                      type="button"
                      className={`note-reference-mode-btn ${modal.insertAs === 'link' ? 'is-active' : ''}`}
                      onClick={() => setNoteReferenceInsertKind('link')}
                    >
                      link
                    </button>
                    <button
                      type="button"
                      className={`note-reference-mode-btn ${modal.insertAs === 'preview' ? 'is-active' : ''}`}
                      onClick={() => setNoteReferenceInsertKind('preview')}
                    >
                      preview
                    </button>
                  </div>
                )}
              </div>
            )}
            {modal.mode === 'note' && (
              <>
                {(!modal.modeLocked || !modal.editingTokenId) && (
                  <div className="note-reference-picker-divider" aria-hidden="true" />
                )}
                <NoteLocationPicker
                  domains={domainsForPickers}
                  noteBodies={state.noteBodies}
                  value={modal.target}
                  includeAisles
                  aisleSelectionMode="single"
                  onChange={updateLinkModalTarget}
                />
                {renderNoteReferenceHeadings()}
                {modal.insertAs === 'link' && (
                  <label className="settings-modal-field">
                    <span>label</span>
                    <input
                      type="text"
                      className="settings-text-input"
                      value={modal.noteLabel}
                      onChange={(event) =>
                        onModalChange({
                          ...modal,
                          noteLabel: event.target.value,
                          noteLabelTouched: true,
                        })
                      }
                    />
                  </label>
                )}
              </>
            )}
            {modal.mode === 'url' && (
              <div className="url-reference-fields">
                <label className="settings-modal-field">
                  <span>url</span>
                  <input
                    type="text"
                    className="settings-text-input"
                    value={modal.url}
                    placeholder="https://example.com"
                    onChange={(event) => onModalChange({ ...modal, url: event.target.value })}
                  />
                </label>
                <label className="settings-modal-field">
                  <span>label</span>
                  <input
                    type="text"
                    className="settings-text-input"
                    value={modal.urlLabel}
                    onChange={(event) => onModalChange({ ...modal, urlLabel: event.target.value })}
                  />
                </label>
              </div>
            )}
          </div>
        )}
        {modal.type === 'shortcut-menu-settings' && (
          <ShortcutMenuSettings operations={shortcutMenuOperations} onChange={onShortcutMenuOperationsChange} />
        )}
        {modal.type === 'sort-tabs' && (
          <div className="sort-modal-options" role="group" aria-label={modalText.title}>
            {(modal.target === 'spaces' || modal.target === 'domains' ? NAME_SORT_OPTIONS : TAB_SORT_OPTIONS).map((option) => (
              <button
                key={option.mode}
                type="button"
                className="sort-modal-option-btn"
                onClick={() => {
                  onApplyTabSort(modal.target, option.mode)
                  onModalChange(null)
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
        {modal.type === 'frontmatter-note' && (
          <div className="frontmatter-note-modal">
            <div className="frontmatter-note-toolbar">
              {frontmatterModalAisles.length > 1 && (
                <select
                  className="settings-select-input"
                  value={modal.aisleId}
                  aria-label="frontmatter aisle"
                  onChange={(event) => setFrontmatterAisle(event.target.value)}
                >
                  {frontmatterModalAisles.map((aisle, index) => (
                    <option key={aisle.id} value={aisle.id}>
                      {`aisle ${index + 1}`}
                    </option>
                  ))}
                </select>
              )}
              <select
                className="settings-select-input"
                value={modal.selectedTemplateId}
                aria-label="frontmatter template"
                onChange={(event) => {
                  const templateId = event.target.value
                  const template = state.frontmatter.templates.find((candidate) => candidate.id === templateId) ?? null
                  if (!template) {
                    onModalChange({
                      ...modal,
                      selectedTemplateId: '',
                      templateDerived: false,
                      isTemplateSuggestionDraft: false,
                      rows: makeFrontmatterRowsManual(modal.rows),
                    })
                    return
                  }
                  onModalChange({
                    ...modal,
                    selectedTemplateId: templateId,
                    templateDerived: true,
                    isTemplateSuggestionDraft: modal.isTemplateSuggestionDraft,
                    rows: buildFrontmatterRowsForAisle(state, modal.noteBodyId, modal.aisleBodyId, modal.location, template, {
                      includeExisting: false,
                      derived: true,
                    }),
                  })
                }}
              >
                <option value="">no template</option>
                {state.frontmatter.templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-sm settings-action-btn"
                onClick={() => onEditFrontmatterTemplate(modal.selectedTemplateId)}
                disabled={!modal.selectedTemplateId}
              >
                edit template
              </button>
              <label className="frontmatter-derived-switch">
                <span>derived</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={Boolean(modal.selectedTemplateId && modal.templateDerived)}
                  disabled={!modal.selectedTemplateId}
                  aria-label="derive frontmatter from selected template"
                  onChange={(event) => {
                    const template = state.frontmatter.templates.find((candidate) => candidate.id === modal.selectedTemplateId) ?? null
                    if (!template) return
                    if (!event.target.checked) {
                      onModalChange({
                        ...modal,
                        templateDerived: false,
                        rows: makeFrontmatterRowsManual(modal.rows),
                      })
                      return
                    }
                    onModalChange({
                      ...modal,
                      templateDerived: true,
                      rows: buildFrontmatterRowsForAisle(state, modal.noteBodyId, modal.aisleBodyId, modal.location, template, {
                        includeExisting: true,
                        derived: true,
                      }),
                    })
                  }}
                />
              </label>
              <button
                type="button"
                className="btn btn-sm settings-action-btn"
                onClick={() =>
                  updateFrontmatterRows((rows) => [
                    ...rows,
                    {
                      id: createId(),
                      key: createFrontmatterRowKey(rows),
                      type: 'text',
                      value: '',
                      computed: 'none',
                      computedEnabled: false,
                      computedLocked: false,
                      locked: false,
                      derived: false,
                    },
                  ])
                }
              >
                add row
              </button>
            </div>
            {modal.isTemplateSuggestionDraft && modal.selectedTemplateId && (
              <div className="frontmatter-template-suggestion-banner" role="note">
                Suggested from &ldquo;{state.frontmatter.templates.find((template) => template.id === modal.selectedTemplateId)?.name ?? 'template'}&rdquo;. These rows are not saved on this note yet.
              </div>
            )}
            <div className="frontmatter-row-editor" aria-label="frontmatter rows">
              <div className="frontmatter-row frontmatter-row-header" aria-hidden="true">
                <span>key</span>
                <span>type</span>
                <span>value</span>
                <span>computed</span>
                <span>derived</span>
                <span>action</span>
              </div>
              {modal.rows.length > 0 ? (
                modal.rows.map((row) => {
                  const template = state.frontmatter.templates.find((candidate) => candidate.id === modal.selectedTemplateId) ?? null
                  const derivedTitle = row.derived && template ? template.name : undefined
                  return (
                    <div key={row.id} className={`frontmatter-row ${isComputedLocked(row) ? 'is-locked' : ''}`}>
                      <input
                        type="text"
                        className="settings-text-input frontmatter-row-key-input"
                        value={row.key}
                        aria-label="frontmatter key"
                        readOnly={Boolean(row.derived || isComputedLocked(row))}
                        onClick={() => warnReadOnlyRowName(row)}
                        onFocus={() => warnReadOnlyRowName(row)}
                        onKeyDown={(event) => {
                          if (!row.derived && !isComputedLocked(row)) return
                          event.preventDefault()
                          warnReadOnlyRowName(row)
                        }}
                        onChange={(event) => {
                          if (row.derived || isComputedLocked(row)) {
                            warnReadOnlyRowName(row)
                            return
                          }
                          updateFrontmatterRow(row.id, { key: event.target.value })
                        }}
                      />
                      <select
                        className="settings-select-input frontmatter-row-type-select"
                        value={row.type}
                        aria-label="frontmatter type"
                        onMouseDown={isComputedLocked(row) ? (event) => handleComputedLockedMouseDown(event, row) : undefined}
                        onKeyDown={isComputedLocked(row) ? (event) => {
                          event.preventDefault()
                          warnComputedLocked(row)
                        } : undefined}
                        onChange={(event) => {
                          if (isComputedLocked(row)) {
                            warnComputedLocked(row)
                            return
                          }
                          const nextType = event.target.value as FrontmatterRowDraft['type']
                          const nextComputed = isFrontmatterComputedValueCompatibleWithFieldType(row.computed, nextType)
                            ? row.computed
                            : 'none'
                          updateFrontmatterRow(row.id, {
                            type: nextType,
                            value: nextType === 'boolean'
                              ? (isFrontmatterBooleanTrue(row.value) ? 'true' : 'false')
                              : nextType === 'date' || nextType === 'datetime'
                                ? getFrontmatterDraftValueForType(nextType, row.value)
                              : row.value,
                            computed: nextComputed,
                            locked: isComputedEnabled(row),
                          })
                        }}
                      >
                        {FRONTMATTER_FIELD_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                      {renderFrontmatterValueControl(row)}
                      {renderFrontmatterComputedControl(row)}
                      <span
                        className={`frontmatter-derived-indicator ${row.derived ? 'is-derived' : ''}`}
                        title={derivedTitle}
                        aria-label={derivedTitle ? `derived from ${derivedTitle}` : 'not derived from a template'}
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(row.derived)}
                          readOnly
                          tabIndex={-1}
                          aria-label={derivedTitle ? `derived from ${derivedTitle}` : 'not derived from a template'}
                        />
                      </span>
                      <button
                        type="button"
                        className="btn btn-sm settings-action-btn"
                        onClick={() => updateFrontmatterRows((rows) => rows.filter((candidate) => candidate.id !== row.id))}
                      >
                        remove
                      </button>
                    </div>
                  )
                })
              ) : (
                <div className="frontmatter-empty-state">no frontmatter rows</div>
              )}
            </div>
          </div>
        )}
        {modal.type === 'scratchpad-about' ? (
          <div className="delete-modal-actions">
            <button type="button" className="btn btn-sm modal-primary-btn" onClick={() => onModalChange(null)}>
              {modalText.action}
            </button>
          </div>
        ) : modal.type !== 'sort-tabs' && (
          <div className="delete-modal-actions">
            <button type="button" className="btn btn-sm btn-outline-light modal-cancel-btn" onClick={() => onModalChange(null)}>
              cancel
            </button>
            <button
              type="button"
              className={`btn btn-sm ${
                modal.type === 'delete-target' || modal.type === 'trash-delete-all' ? 'app-danger-btn' : 'modal-primary-btn'
              }`}
              onClick={runPrimaryModalAction}
            >
              {modalText.action}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
