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
import type { NotebookNoteCopyMode, NotebookNoteReferenceActionKind } from '../../notes/notebook-note-actions'

void React

export type NotebookNoteActionPickerAction =
  | NotebookNoteReferenceActionKind
  | 'independent-copy'
  | 'synced-copy'

export type NotebookNoteActionPickerAnchor = {
  top: number
  left: number
}

export type NoteActionPickerActiveRegion = 'results' | 'actions'

export type NotebookNoteActionPickerKeyboardIntent =
  | 'close'
  | 'previous-result'
  | 'next-result'
  | 'select-result'
  | 'previous-action'
  | 'next-action'
  | 'run-action'

const ACTION_LABELS: Record<NotebookNoteActionPickerAction, string> = {
  'note-link': 'note link',
  'note-preview': 'note preview',
  'independent-copy': 'independent copy',
  'synced-copy': 'synced copy',
}

function toCopyMode(action: NotebookNoteActionPickerAction): NotebookNoteCopyMode | null {
  if (action === 'independent-copy') return 'independent'
  if (action === 'synced-copy') return 'synced'
  return null
}

export function getCopyModeForNoteAction(action: NotebookNoteActionPickerAction): NotebookNoteCopyMode | null {
  return toCopyMode(action)
}

export function getReferenceKindForNoteAction(action: NotebookNoteActionPickerAction): NotebookNoteReferenceActionKind | null {
  return action === 'note-link' || action === 'note-preview' ? action : null
}

export function getNotebookNoteActionPickerKeyboardIntent({
  key,
  activeRegion,
  hasSelectedEntry,
}: {
  key: string
  activeRegion: NoteActionPickerActiveRegion
  hasSelectedEntry: boolean
}): NotebookNoteActionPickerKeyboardIntent | null {
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

export function NotebookNoteActionPicker({
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
}: {
  title: string
  entries: NoteSearchEntry[]
  query: string
  showSearchInput?: boolean
  showHeader?: boolean
  actions: NotebookNoteActionPickerAction[]
  anchor?: NotebookNoteActionPickerAnchor | null
  initialSelectedNoteId?: string
  urlValue?: string
  urlEnabled?: boolean
  onQueryChange: (query: string) => void
  onSubmitUrl?: (url: string) => void
  onAction: (action: NotebookNoteActionPickerAction, noteId: string) => void
  onClose: () => void
}) {
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [highlightedActionIndex, setHighlightedActionIndex] = useState(0)
  const [activeRegion, setActiveRegion] = useState<NoteActionPickerActiveRegion>('results')
  const [selectedNoteId, setSelectedNoteId] = useState(initialSelectedNoteId)
  const [urlDraft, setUrlDraft] = useState(urlValue)
  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.noteId === selectedNoteId) ?? null,
    [entries, selectedNoteId],
  )

  useEffect(() => {
    setHighlightedIndex(0)
    setHighlightedActionIndex(0)
    setActiveRegion('results')
    setSelectedNoteId('')
  }, [query])

  useEffect(() => {
    if (!selectedNoteId) return
    if (entries.some((entry) => entry.noteId === selectedNoteId)) return
    setSelectedNoteId('')
    setActiveRegion('results')
  }, [entries, selectedNoteId])

  useEffect(() => {
    setUrlDraft(urlValue)
  }, [urlValue])

  const panelStyle: CSSProperties | undefined = anchor
    ? { top: `${anchor.top}px`, left: `${anchor.left}px` }
    : undefined

  const chooseHighlighted = useCallback(() => {
    const entry = entries[Math.max(0, Math.min(highlightedIndex, entries.length - 1))]
    if (!entry) return
    setSelectedNoteId(entry.noteId)
    setHighlightedActionIndex(0)
    setActiveRegion('actions')
  }, [entries, highlightedIndex])

  const runHighlightedAction = useCallback(() => {
    if (!selectedEntry || actions.length <= 0) return
    const action = actions[Math.max(0, Math.min(highlightedActionIndex, actions.length - 1))]
    if (action) onAction(action, selectedEntry.noteId)
  }, [actions, highlightedActionIndex, onAction, selectedEntry])

  const handleNavigationKey = useCallback(
    (event: Pick<KeyboardEvent | ReactKeyboardEvent<HTMLDivElement>, 'key' | 'preventDefault'>) => {
      if ('isComposing' in event && event.isComposing) return false
      const intent = getNotebookNoteActionPickerKeyboardIntent({
        key: event.key,
        activeRegion,
        hasSelectedEntry: Boolean(selectedEntry),
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
        setHighlightedActionIndex((current) => (actions.length > 0 ? Math.min(actions.length - 1, current + 1) : 0))
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
    [actions.length, activeRegion, chooseHighlighted, entries.length, onClose, runHighlightedAction, selectedEntry],
  )

  useEffect(() => {
    const onWindowKeyDown = (event: KeyboardEvent) => {
      const activeElement = document.activeElement
      if (activeElement instanceof HTMLInputElement && activeElement.getAttribute('aria-label') === 'URL') return
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
    if (handleNavigationKey(event)) event.stopPropagation()
  }

  return (
    <div className="notebook-note-action-layer" onPointerDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section
        className={`notebook-note-action-picker ${anchor ? 'is-anchored' : 'is-modal'}`}
        role="dialog"
        aria-label={title}
        style={panelStyle}
        onKeyDown={handleKeyDown}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {showHeader ? (
          <header className="notebook-note-action-header">
            <h2>{title}</h2>
            <button type="button" className="notebook-note-action-close" aria-label="Close note actions" onClick={onClose}>
              x
            </button>
          </header>
        ) : null}
        {!showSearchInput ? (
          <div className="notebook-note-action-query" aria-label="Current note search">
            @{query}
          </div>
        ) : null}
        {urlEnabled && (
          <form
            className="notebook-note-action-url"
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
            className="notebook-note-action-search"
            value={query}
            placeholder="Search notes"
            autoFocus
            onChange={(event) => onQueryChange(event.target.value)}
          />
        )}
        <div className="notebook-note-action-results" role="listbox" aria-label="Notebook notes">
          {entries.length > 0 ? entries.map((entry, index) => {
            const highlighted = index === highlightedIndex
            const selected = entry.noteId === selectedNoteId
            return (
              <button
                key={entry.noteId}
                type="button"
                role="option"
                aria-selected={highlighted || selected}
                className={`notebook-note-action-result ${highlighted ? 'is-highlighted' : ''} ${
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
                }}
              >
                <span>{entry.noteName}</span>
                <small>{entry.folderPath || 'Notebook'}</small>
              </button>
            )
          }) : (
            <p className="notebook-note-action-empty">No matching notes</p>
          )}
        </div>
        {selectedEntry && (
          <div className="notebook-note-action-choices" aria-label={`Actions for ${selectedEntry.noteName}`}>
            <div>
              <strong>{selectedEntry.noteName}</strong>
              <small>{selectedEntry.label}</small>
            </div>
            <div className="notebook-note-action-choice-row">
              {actions.map((action, index) => (
                <button
                  key={action}
                  type="button"
                  className={`notebook-note-action-choice ${
                    activeRegion === 'actions' && index === highlightedActionIndex ? 'is-highlighted' : ''
                  }`}
                  onMouseEnter={() => {
                    setActiveRegion('actions')
                    setHighlightedActionIndex(index)
                  }}
                  onClick={() => onAction(action, selectedEntry.noteId)}
                >
                  {ACTION_LABELS[action]}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
