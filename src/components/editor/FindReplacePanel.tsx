import React from 'react'
import type { FindReplaceMatch } from '../../notes/find-replace'
import { AppIcon } from '../icons/AppIcon'

type FindReplacePanelProps = {
  focusRequestId: number
  query: string
  replacement: string
  caseSensitive: boolean
  wholeWord: boolean
  regex: boolean
  queryError: string | null
  matches: FindReplaceMatch[]
  activeIndex: number
  onQueryChange: (query: string) => void
  onReplacementChange: (replacement: string) => void
  onCaseSensitiveChange: (checked: boolean) => void
  onWholeWordChange: (checked: boolean) => void
  onRegexChange: (checked: boolean) => void
  onPrevious: () => void
  onNext: () => void
  onReplaceCurrent: () => void
  onReplaceAll: () => void
  onClose: () => void
}

export function FindReplacePanel({
  focusRequestId,
  query,
  replacement,
  caseSensitive,
  wholeWord,
  regex,
  queryError,
  matches,
  activeIndex,
  onQueryChange,
  onReplacementChange,
  onCaseSensitiveChange,
  onWholeWordChange,
  onRegexChange,
  onPrevious,
  onNext,
  onReplaceCurrent,
  onReplaceAll,
  onClose,
}: FindReplacePanelProps) {
  const findInputRef = React.useRef<HTMLInputElement | null>(null)
  const restoreTimerRef = React.useRef<number | null>(null)
  const restoreFrameRef = React.useRef<number | null>(null)
  const hasQuery = query.trim().length > 0
  const hasMatches = matches.length > 0
  const activeMatch = hasMatches ? matches[Math.max(0, Math.min(activeIndex, matches.length - 1))] : null
  const statusText = queryError ?? (hasQuery ? (hasMatches ? `${activeIndex + 1} of ${matches.length}` : 'No results') : 'No results')

  const focusFindInputAfterNavigation = () => {
    if (restoreTimerRef.current !== null) window.clearTimeout(restoreTimerRef.current)
    if (restoreFrameRef.current !== null) window.cancelAnimationFrame(restoreFrameRef.current)
    restoreTimerRef.current = window.setTimeout(() => {
      restoreTimerRef.current = null
      restoreFrameRef.current = window.requestAnimationFrame(() => {
        restoreFrameRef.current = null
        findInputRef.current?.focus({ preventScroll: true })
      })
    }, 0)
  }

  const goPrevious = () => {
    onPrevious()
    focusFindInputAfterNavigation()
  }

  const goNext = () => {
    onNext()
    focusFindInputAfterNavigation()
  }

  React.useEffect(() => {
    const input = findInputRef.current
    if (!input) return
    const timeoutId = window.setTimeout(() => {
      input.focus()
      input.select()
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [focusRequestId])

  React.useEffect(() => () => {
    if (restoreTimerRef.current !== null) window.clearTimeout(restoreTimerRef.current)
    if (restoreFrameRef.current !== null) window.cancelAnimationFrame(restoreFrameRef.current)
  }, [])

  return (
    <section
      className="find-replace-panel"
      role="dialog"
      aria-label="Find and replace"
      onKeyDownCapture={(event) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="find-replace-bar">
        <input
          ref={findInputRef}
          className="find-replace-input find-replace-query-input"
          value={query}
          placeholder="Find"
          aria-label="Find"
          aria-invalid={queryError ? 'true' : undefined}
          aria-describedby="find-replace-status"
          spellCheck={false}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            event.stopPropagation()
            if (event.shiftKey) {
              goPrevious()
              return
            }
            goNext()
          }}
        />
        <span
          id="find-replace-status"
          className={`find-replace-count ${queryError ? 'is-error' : ''}`}
          aria-live="polite"
        >
          {statusText}
        </span>
        <div className="find-replace-options" aria-label="Find options">
          <button
            type="button"
            className="find-replace-option-btn"
            aria-label="Match case"
            aria-pressed={caseSensitive}
            data-app-tooltip="Match case"
            onClick={() => onCaseSensitiveChange(!caseSensitive)}
          >
            Aa
          </button>
          <button
            type="button"
            className="find-replace-option-btn"
            aria-label="Whole word"
            aria-pressed={wholeWord}
            data-app-tooltip="Whole word"
            onClick={() => onWholeWordChange(!wholeWord)}
          >
            ab
          </button>
          <button
            type="button"
            className="find-replace-option-btn"
            aria-label="Regex"
            aria-pressed={regex}
            data-app-tooltip="Regex"
            onClick={() => onRegexChange(!regex)}
          >
            .*
          </button>
        </div>
        <button
          type="button"
          className="find-replace-icon-btn app-close-button"
          aria-label="Close find and replace"
          data-app-tooltip="Close"
          onClick={onClose}
        >
          <AppIcon iconId="x" className="app-close-button-icon" />
        </button>
        <input
          className="find-replace-input find-replace-replacement-input"
          value={replacement}
          placeholder="Replace"
          aria-label="Replace"
          spellCheck={false}
          onChange={(event) => onReplacementChange(event.target.value)}
        />
        <div className="find-replace-replace-controls" aria-label="Replace controls">
          <button
            type="button"
            className="find-replace-icon-btn"
            aria-label="Previous match"
            data-app-tooltip="Previous"
            onClick={goPrevious}
            disabled={!hasMatches || Boolean(queryError)}
          >
            <AppIcon iconId="minimize" className="find-replace-button-icon" />
          </button>
          <button
            type="button"
            className="find-replace-icon-btn"
            aria-label="Next match"
            data-app-tooltip="Next"
            onClick={goNext}
            disabled={!hasMatches || Boolean(queryError)}
          >
            <AppIcon iconId="maximize" className="find-replace-button-icon" />
          </button>
          <button
            type="button"
            className="find-replace-icon-btn find-replace-action-btn"
            aria-label="Replace"
            data-app-tooltip="Replace"
            onClick={onReplaceCurrent}
            disabled={!activeMatch || Boolean(queryError)}
          >
            <AppIcon iconId="replace" className="find-replace-button-icon" />
          </button>
          <button
            type="button"
            className="find-replace-icon-btn find-replace-action-btn"
            aria-label="Replace all"
            data-app-tooltip="Replace all"
            onClick={onReplaceAll}
            disabled={!hasMatches || Boolean(queryError)}
          >
            <AppIcon iconId="replaceAll" className="find-replace-button-icon" />
          </button>
        </div>
      </div>
    </section>
  )
}
