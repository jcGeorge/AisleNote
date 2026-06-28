import * as React from 'react'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import type { NoteSearchEntry } from '../../notes/note-locations'
import type { VaultNoteCopyMode, VaultNoteReferenceActionKind } from '../../notes/vault-note-actions'
import { AppIcon } from '../icons/AppIcon'

void React

export type VaultNoteActionPickerAction =
  | VaultNoteReferenceActionKind
  | 'independent-copy'
  | 'synced-copy'

export type VaultNoteActionPickerAnchor = {
  top: number
  left: number
}

export type VaultNoteActionPickerAisleOption = {
  id: string
  label: string
}

export type VaultNoteActionPickerActionOptions = {
  aisleId?: string
}

export type NoteActionPickerActiveRegion = 'results' | 'actions'

export type VaultNoteActionPickerKeyboardIntent =
  | 'close'
  | 'previous-result'
  | 'next-result'
  | 'select-result'
  | 'previous-action'
  | 'next-action'
  | 'run-action'

const ACTION_LABELS: Record<VaultNoteActionPickerAction, string> = {
  'note-link': 'link',
  'note-preview': 'preview',
  'independent-copy': 'independent copy',
  'synced-copy': 'synced copy',
}

export function getVaultNoteActionPickerActionIntent(
  action: VaultNoteActionPickerAction,
  aisleCount: number,
): 'run-action' | 'choose-preview-aisle' {
  return action === 'note-preview' && aisleCount > 1 ? 'choose-preview-aisle' : 'run-action'
}

function toCopyMode(action: VaultNoteActionPickerAction): VaultNoteCopyMode | null {
  if (action === 'independent-copy') return 'independent'
  if (action === 'synced-copy') return 'synced'
  return null
}

export function getCopyModeForNoteAction(action: VaultNoteActionPickerAction): VaultNoteCopyMode | null {
  return toCopyMode(action)
}

export function getReferenceKindForNoteAction(action: VaultNoteActionPickerAction): VaultNoteReferenceActionKind | null {
  return action === 'note-link' || action === 'note-preview' ? action : null
}

export function getVaultNoteActionPickerKeyboardIntent({
  key,
  activeRegion,
  hasSelectedEntry,
}: {
  key: string
  activeRegion: NoteActionPickerActiveRegion
  hasSelectedEntry: boolean
}): VaultNoteActionPickerKeyboardIntent | null {
  if (key === 'Escape') return 'close'

  const actionsActive = activeRegion === 'actions' && hasSelectedEntry
  if (key === 'Enter') return actionsActive ? 'run-action' : 'select-result'
  if (key === 'ArrowDown') return actionsActive ? 'next-action' : 'next-result'
  if (key === 'ArrowUp') return actionsActive ? 'previous-action' : 'previous-result'
  if (!actionsActive) return null
  if (key === 'ArrowRight') return 'next-action'
  if (key === 'ArrowLeft') return 'previous-action'
  return null
}

function consumeNavigationEvent(event: Pick<KeyboardEvent | ReactKeyboardEvent<HTMLDivElement>, 'preventDefault'>) {
  event.preventDefault()
  const nativeEvent = 'nativeEvent' in event ? event.nativeEvent : event
  ;(event as { stopPropagation?: () => void }).stopPropagation?.()
  ;(nativeEvent as { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.()
}

export function VaultNoteActionPicker({
  title,
  entries,
  query,
  showSearchInput = true,
  showHeader = true,
  actions,
  anchor,
  initialSelectedNoteId = '',
  urlValue = '',
  urlEnabled = false,
  onQueryChange,
  onSubmitUrl,
  onAction,
  onClose,
  getActionsForNote = () => actions,
  getAislesForNote = () => [],
}: {
  title: string
  entries: NoteSearchEntry[]
  query: string
  showSearchInput?: boolean
  showHeader?: boolean
  actions: VaultNoteActionPickerAction[]
  anchor?: VaultNoteActionPickerAnchor | null
  initialSelectedNoteId?: string
  urlValue?: string
  urlEnabled?: boolean
  onQueryChange: (query: string) => void
  onSubmitUrl?: (url: string) => void
  onAction: (
    action: VaultNoteActionPickerAction,
    noteId: string,
    options?: VaultNoteActionPickerActionOptions,
  ) => void
  onClose: () => void
  getActionsForNote?: (noteId: string) => VaultNoteActionPickerAction[]
  getAislesForNote?: (noteId: string) => VaultNoteActionPickerAisleOption[]
}) {
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [highlightedActionIndex, setHighlightedActionIndex] = useState(0)
  const [activeRegion, setActiveRegion] = useState<NoteActionPickerActiveRegion>('results')
  const [selectedNoteId, setSelectedNoteId] = useState(initialSelectedNoteId)
  const [urlDraft, setUrlDraft] = useState(urlValue)
  const [previewAisleNoteId, setPreviewAisleNoteId] = useState('')
  const [selectedPreviewAisleId, setSelectedPreviewAisleId] = useState('')
  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.noteId === selectedNoteId) ?? null,
    [entries, selectedNoteId],
  )
  const selectedActions = useMemo(
    () => (selectedEntry ? getActionsForNote(selectedEntry.noteId) : actions),
    [actions, getActionsForNote, selectedEntry],
  )
  const previewAisleOptions = useMemo(
    () => (selectedEntry && previewAisleNoteId === selectedEntry.noteId ? getAislesForNote(selectedEntry.noteId) : []),
    [getAislesForNote, previewAisleNoteId, selectedEntry],
  )
  const showingPreviewAisleStep = Boolean(selectedEntry && previewAisleNoteId === selectedEntry.noteId && previewAisleOptions.length > 1)

  useEffect(() => {
    setHighlightedIndex(0)
    setHighlightedActionIndex(0)
    setActiveRegion('results')
    setSelectedNoteId('')
    setPreviewAisleNoteId('')
    setSelectedPreviewAisleId('')
  }, [query])

  useEffect(() => {
    if (!selectedNoteId) return
    if (entries.some((entry) => entry.noteId === selectedNoteId)) return
    setSelectedNoteId('')
    setActiveRegion('results')
    setPreviewAisleNoteId('')
    setSelectedPreviewAisleId('')
  }, [entries, selectedNoteId])

  useEffect(() => {
    setUrlDraft(urlValue)
  }, [urlValue])

  useEffect(() => {
    if (!previewAisleNoteId || previewAisleNoteId === selectedNoteId) return
    setPreviewAisleNoteId('')
    setSelectedPreviewAisleId('')
  }, [previewAisleNoteId, selectedNoteId])

  useEffect(() => {
    if (!previewAisleNoteId) return
    const fallbackAisleId = previewAisleOptions[0]?.id ?? ''
    if (previewAisleOptions.some((aisle) => aisle.id === selectedPreviewAisleId)) return
    setSelectedPreviewAisleId(fallbackAisleId)
  }, [previewAisleNoteId, previewAisleOptions, selectedPreviewAisleId])

  const panelStyle: CSSProperties | undefined = anchor
    ? { top: `${anchor.top}px`, left: `${anchor.left}px` }
    : undefined

  const chooseHighlighted = useCallback(() => {
    const entry = entries[Math.max(0, Math.min(highlightedIndex, entries.length - 1))]
    if (!entry) return
    setSelectedNoteId(entry.noteId)
    setHighlightedActionIndex(0)
    setActiveRegion('actions')
    setPreviewAisleNoteId('')
    setSelectedPreviewAisleId('')
  }, [entries, highlightedIndex])

  const runAction = useCallback(
    (action: VaultNoteActionPickerAction, noteId: string) => {
      const aisleOptions = getAislesForNote(noteId)
      const intent = getVaultNoteActionPickerActionIntent(action, aisleOptions.length)
      if (intent === 'choose-preview-aisle') {
        setPreviewAisleNoteId(noteId)
        setSelectedPreviewAisleId(aisleOptions[0]?.id ?? '')
        setActiveRegion('actions')
        return
      }

      setPreviewAisleNoteId('')
      setSelectedPreviewAisleId('')
      onAction(action, noteId, action === 'note-preview' ? { aisleId: aisleOptions[0]?.id } : undefined)
    },
    [getAislesForNote, onAction],
  )

  const runHighlightedAction = useCallback(() => {
    if (!selectedEntry || selectedActions.length <= 0) return
    const action = selectedActions[Math.max(0, Math.min(highlightedActionIndex, selectedActions.length - 1))]
    if (action) runAction(action, selectedEntry.noteId)
  }, [highlightedActionIndex, runAction, selectedActions, selectedEntry])

  const insertSelectedPreviewAisle = useCallback(() => {
    if (!selectedEntry) return
    const aisleId = selectedPreviewAisleId || previewAisleOptions[0]?.id
    onAction('note-preview', selectedEntry.noteId, aisleId ? { aisleId } : undefined)
  }, [onAction, previewAisleOptions, selectedEntry, selectedPreviewAisleId])

  const handleNavigationKey = useCallback(
    (event: Pick<KeyboardEvent | ReactKeyboardEvent<HTMLDivElement>, 'key' | 'preventDefault'>) => {
      if ('isComposing' in event && event.isComposing) return false
      const intent = getVaultNoteActionPickerKeyboardIntent({
        key: event.key,
        activeRegion,
        hasSelectedEntry: Boolean(selectedEntry && selectedActions.length > 0),
      })
      if (!intent) return false

      consumeNavigationEvent(event)
      if (intent === 'close') {
        onClose()
        return true
      }
      if (intent === 'next-result') {
        setHighlightedIndex((current) => (entries.length > 0 ? Math.min(entries.length - 1, current + 1) : 0))
        return true
      }
      if (intent === 'previous-result') {
        setHighlightedIndex((current) => Math.max(0, current - 1))
        return true
      }
      if (intent === 'select-result') {
        chooseHighlighted()
        return true
      }
      if (intent === 'next-action') {
        setHighlightedActionIndex((current) =>
          selectedActions.length > 0 ? Math.min(selectedActions.length - 1, current + 1) : 0,
        )
        return true
      }
      if (intent === 'previous-action') {
        setHighlightedActionIndex((current) => Math.max(0, current - 1))
        return true
      }
      if (intent === 'run-action') {
        runHighlightedAction()
        return true
      }
      return false
    },
    [activeRegion, chooseHighlighted, entries.length, onClose, runHighlightedAction, selectedActions.length, selectedEntry],
  )

  useEffect(() => {
    const onWindowKeyDown = (event: KeyboardEvent) => {
      const activeElement = document.activeElement
      if (activeElement instanceof HTMLInputElement && activeElement.getAttribute('aria-label') === 'URL') return
      if (activeElement instanceof HTMLElement && activeElement.closest('.vault-note-action-preview-aisles')) return
      handleNavigationKey(event)
    }
    window.addEventListener('keydown', onWindowKeyDown, true)
    return () => window.removeEventListener('keydown', onWindowKeyDown, true)
  }, [handleNavigationKey])

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null
    if (target instanceof HTMLInputElement && target.getAttribute('aria-label') === 'URL') {
      event.stopPropagation()
      return
    }
    if (target?.closest('.vault-note-action-preview-aisles')) {
      event.stopPropagation()
      return
    }
    if (handleNavigationKey(event)) event.stopPropagation()
  }

  return (
    <div className="vault-note-action-layer" onPointerDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section
        className={`vault-note-action-picker ${anchor ? 'is-anchored' : 'is-modal'}`}
        role="dialog"
        aria-label={title}
        style={panelStyle}
        onKeyDown={handleKeyDown}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {showHeader ? (
          <header className="vault-note-action-header">
            <h2>{title}</h2>
            <button
              type="button"
              className="vault-note-action-close app-close-button"
              aria-label="Close note actions"
              onClick={onClose}
            >
              <AppIcon iconId="x" className="app-close-button-icon" />
            </button>
          </header>
        ) : null}
        {!showSearchInput ? (
          <div className="vault-note-action-query" aria-label="Current note search">
            @{query}
          </div>
        ) : null}
        {urlEnabled && (
          <form
            className="vault-note-action-url"
            onSubmit={(event) => {
              event.preventDefault()
              onSubmitUrl?.(urlDraft)
            }}
          >
            <input
              type="url"
              value={urlDraft}
              placeholder="https://example.com"
              aria-label="URL"
              onChange={(event) => setUrlDraft(event.target.value)}
            />
            <button type="submit">url link</button>
          </form>
        )}
        {showSearchInput && (
          <input
            className="vault-note-action-search"
            value={query}
            placeholder="Search notes"
            autoFocus
            onChange={(event) => onQueryChange(event.target.value)}
          />
        )}
        <div className="vault-note-action-results" role="listbox" aria-label="Vault notes">
          {entries.length > 0 ? entries.map((entry, index) => {
            const highlighted = index === highlightedIndex
            const selected = entry.noteId === selectedNoteId
            return (
              <button
                key={entry.noteId}
                type="button"
                role="option"
                aria-selected={highlighted || selected}
                className={`vault-note-action-result ${highlighted ? 'is-highlighted' : ''} ${
                  selected ? 'is-selected' : ''
                }`}
                onMouseEnter={() => {
                  setActiveRegion('results')
                  setHighlightedIndex(index)
                }}
                onClick={() => {
                  setSelectedNoteId(entry.noteId)
                  setHighlightedActionIndex(0)
                  setActiveRegion('actions')
                  setPreviewAisleNoteId('')
                  setSelectedPreviewAisleId('')
                }}
              >
                <span>{entry.noteName}</span>
                <small>{entry.folderPath || 'Vault'}</small>
              </button>
            )
          }) : (
            <p className="vault-note-action-empty">No matching notes</p>
          )}
        </div>
        {selectedEntry && selectedActions.length > 0 && (
          <div className="vault-note-action-choices" aria-label={`Actions for ${selectedEntry.noteName}`}>
            <div className="vault-note-action-selected-note">
              <strong>{selectedEntry.noteName}</strong>
              <small className="vault-note-action-selected-path">{selectedEntry.folderPath || 'Vault'}</small>
            </div>
            <div className="vault-note-action-choice-row">
              {selectedActions.map((action, index) => (
                <button
                  key={action}
                  type="button"
                  className={`vault-note-action-choice ${
                    activeRegion === 'actions' && index === highlightedActionIndex ? 'is-highlighted' : ''
                  }`}
                  onMouseEnter={() => {
                    setActiveRegion('actions')
                    setHighlightedActionIndex(index)
                  }}
                  onClick={() => runAction(action, selectedEntry.noteId)}
                >
                  {ACTION_LABELS[action]}
                </button>
              ))}
            </div>
            {showingPreviewAisleStep ? (
              <div className="vault-note-action-preview-aisles" aria-label={`Preview aisle for ${selectedEntry.noteName}`}>
                <span className="vault-note-action-preview-aisle-label">preview aisle</span>
                <div className="vault-note-action-preview-aisle-row">
                  {previewAisleOptions.map((aisle) => (
                    <button
                      key={aisle.id}
                      type="button"
                      className={`vault-note-action-preview-aisle ${
                        aisle.id === selectedPreviewAisleId ? 'is-selected' : ''
                      }`}
                      aria-pressed={aisle.id === selectedPreviewAisleId}
                      onClick={() => setSelectedPreviewAisleId(aisle.id)}
                    >
                      {aisle.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="vault-note-action-preview-insert"
                  onClick={insertSelectedPreviewAisle}
                >
                  insert preview
                </button>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  )
}
