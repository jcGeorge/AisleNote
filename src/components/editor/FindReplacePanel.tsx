import React, { useEffect, useRef } from 'react'
import type { FindReplaceMatch, FindReplaceScope } from '../../notes/find-replace'
import { AppIcon } from '../icons/AppIcon'

type FindReplacePanelProps = {
  replaceMode: boolean
  focusRequestId: number
  query: string
  replacement: string
  scope: FindReplaceScope
  caseSensitive: boolean
  wholeWord: boolean
  regex: boolean
  queryError: string | null
  matches: FindReplaceMatch[]
  activeIndex: number
  onReplaceModeChange: (enabled: boolean) => void
  onQueryChange: (query: string) => void
  onReplacementChange: (replacement: string) => void
  onScopeChange: (scope: FindReplaceScope) => void
  onCaseSensitiveChange: (checked: boolean) => void
  onWholeWordChange: (checked: boolean) => void
  onRegexChange: (checked: boolean) => void
  onPrevious: () => void
  onNext: () => void
  onSelectMatch: (index: number) => void
  onReplaceCurrent: () => void
  onReplaceAll: () => void
  onClose: () => void
}

const FIND_SCOPES: Array<{ id: FindReplaceScope; label: string }> = [
  { id: 'note', label: 'note' },
  { id: 'folder', label: 'folder' },
  { id: 'notebook', label: 'notebook' },
]

type FindReplaceResultItem = {
  match: FindReplaceMatch
  index: number
}

type FindReplaceResultRow =
  | { type: 'header'; key: string; level: number; chips: FindReplaceChip[] }
  | { type: 'separator'; key: string }
  | { type: 'match'; key: string; level: number; item: FindReplaceResultItem }

type FindReplaceChip = {
  kind: 'folder' | 'note' | 'scratchpad' | 'aisle'
  label: string
}

function groupResultItems(items: FindReplaceResultItem[], getKey: (item: FindReplaceResultItem) => string) {
  const groups: Array<{ key: string; items: FindReplaceResultItem[] }> = []
  const groupsByKey = new Map<string, FindReplaceResultItem[]>()
  items.forEach((item) => {
    const key = getKey(item)
    const groupItems = groupsByKey.get(key)
    if (groupItems) {
      groupItems.push(item)
      return
    }
    const nextItems = [item]
    groupsByKey.set(key, nextItems)
    groups.push({ key, items: nextItems })
  })
  return groups
}

function pushMatchRows(rows: FindReplaceResultRow[], items: FindReplaceResultItem[], level: number) {
  items.forEach((item) => {
    rows.push({
      type: 'match',
      key: `match:${item.index}:${item.match.id}`,
      level,
      item,
    })
  })
}

function buildGroupedNormalResultRows(items: FindReplaceResultItem[]): FindReplaceResultRow[] {
  const rows: FindReplaceResultRow[] = []
  const folderGroups = groupResultItems(items, (item) => item.match.context.folderId ?? '__root__')
  folderGroups.forEach((folderGroup) => {
    const firstFolderMatch = folderGroup.items[0]?.match
    if (!firstFolderMatch) return
    rows.push({
      type: 'header',
      key: `folder:${folderGroup.key}`,
      level: 0,
      chips: [{ kind: 'folder', label: firstFolderMatch.context.folderPath || 'Notebook root' }],
    })
    pushMatchRows(rows, folderGroup.items, 1)
  })
  return rows
}

function buildFindReplaceResultRows(matches: FindReplaceMatch[], limit: number): FindReplaceResultRow[] {
  const items = matches.slice(0, limit).map((match, index) => ({ match, index }))
  const normalItems = items.filter((item) => item.match.context.noteKind !== 'scratchpad')
  const scratchpadItems = items.filter((item) => item.match.context.noteKind === 'scratchpad')

  if (scratchpadItems.length === 0) return buildGroupedNormalResultRows(normalItems)
  if (normalItems.length === 0) {
    const rows: FindReplaceResultRow[] = []
    pushMatchRows(rows, scratchpadItems, 0)
    return rows
  }

  const normalRows = buildGroupedNormalResultRows(normalItems)
  const scratchpadRows: FindReplaceResultRow[] = []
  pushMatchRows(scratchpadRows, scratchpadItems, 0)

  return [
    ...normalRows,
    { type: 'separator', key: 'normal-scratchpad-separator' },
    ...scratchpadRows,
  ]
}

function getContextChipClassName(kind: FindReplaceChip['kind']) {
  return [
    'find-replace-context-chip',
    kind === 'aisle' ? 'find-replace-aisle-chip' : '',
    `is-${kind}`,
  ].filter(Boolean).join(' ')
}

function renderContextChips(chips: FindReplaceChip[]) {
  return chips.map((chip, index) => (
    <span key={`${chip.kind}:${chip.label}:${index}`} className={getContextChipClassName(chip.kind)}>
      {chip.label}
    </span>
  ))
}

function getMatchContextChips(match: FindReplaceMatch): FindReplaceChip[] {
  const chips: FindReplaceChip[] = [
    {
      kind: match.context.noteKind === 'scratchpad' ? 'scratchpad' : 'note',
      label: match.context.noteName,
    },
  ]
  if (match.aisleCount > 1) {
    chips.push({ kind: 'aisle', label: String(match.aisleNumber) })
  }
  return chips
}

function getResultLevelClassName(level: number) {
  return `find-replace-result-level-${Math.max(0, Math.min(3, level))}`
}

export function FindReplacePanel({
  replaceMode,
  focusRequestId,
  query,
  replacement,
  scope,
  caseSensitive,
  wholeWord,
  regex,
  queryError,
  matches,
  activeIndex,
  onReplaceModeChange,
  onQueryChange,
  onReplacementChange,
  onScopeChange,
  onCaseSensitiveChange,
  onWholeWordChange,
  onRegexChange,
  onPrevious,
  onNext,
  onSelectMatch,
  onReplaceCurrent,
  onReplaceAll,
  onClose,
}: FindReplacePanelProps) {
  const findInputRef = useRef<HTMLInputElement | null>(null)
  const hasMatches = matches.length > 0
  const activeMatch = hasMatches ? matches[Math.max(0, Math.min(activeIndex, matches.length - 1))] : null
  const resultRows = buildFindReplaceResultRows(matches, 80)

  useEffect(() => {
    const input = findInputRef.current
    if (!input) return
    const timeoutId = window.setTimeout(() => {
      input.focus()
      input.select()
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [focusRequestId])

  return (
    <section
      className="find-replace-panel"
      role="dialog"
      aria-label={replaceMode ? 'Find and replace' : 'Find'}
      onKeyDownCapture={(event) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="find-replace-header">
        <strong>{replaceMode ? 'find & replace' : 'find'}</strong>
        <label className="find-replace-check find-replace-mode-check">
          <input
            type="checkbox"
            checked={replaceMode}
            onChange={(event) => onReplaceModeChange(event.target.checked)}
          />
          <span>and replace</span>
        </label>
        <button
          type="button"
          className="find-replace-icon-btn app-close-button"
          aria-label="Close find"
          data-app-tooltip="Close find"
          onClick={onClose}
        >
          <AppIcon iconId="x" className="app-close-button-icon" />
        </button>
      </div>
      <div className={`find-replace-fields ${replaceMode ? 'has-replace' : 'is-find-only'}`}>
        <label className="find-replace-field">
          <span>find</span>
          <input
            ref={findInputRef}
            value={query}
            aria-invalid={queryError ? 'true' : undefined}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                onNext()
              }
            }}
          />
        </label>
        {replaceMode && (
          <label className="find-replace-field">
            <span>replace</span>
            <input value={replacement} onChange={(event) => onReplacementChange(event.target.value)} />
          </label>
        )}
      </div>
      <div className="find-replace-scope-group">
        <span className="find-replace-scope-title">search for results within this:</span>
        <div className="find-replace-scope-buttons" role="radiogroup" aria-label="search for results within this">
          {FIND_SCOPES.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              className={`find-replace-scope-button ${scope === candidate.id ? 'is-active' : ''}`}
              aria-pressed={scope === candidate.id}
              onClick={() => onScopeChange(candidate.id)}
            >
              {candidate.label}
            </button>
          ))}
        </div>
      </div>
      <div className="find-replace-row">
        <label className="find-replace-check">
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(event) => onCaseSensitiveChange(event.target.checked)}
          />
          <span>case</span>
        </label>
        <label className="find-replace-check">
          <input type="checkbox" checked={wholeWord} onChange={(event) => onWholeWordChange(event.target.checked)} />
          <span>word</span>
        </label>
        <label className="find-replace-check">
          <input type="checkbox" checked={regex} onChange={(event) => onRegexChange(event.target.checked)} />
          <span>regex</span>
        </label>
      </div>
      {queryError && <div className="find-replace-error">{queryError}</div>}
      <div className="find-replace-actions">
        <span className="find-replace-count">
          {queryError
            ? queryError
            : query.trim()
              ? (hasMatches ? `${activeIndex + 1} of ${matches.length}` : '0 matches')
              : 'enter text'}
        </span>
        <button type="button" onClick={onPrevious} disabled={!hasMatches}>
          prev
        </button>
        <button type="button" onClick={onNext} disabled={!hasMatches}>
          next
        </button>
        {replaceMode && (
          <>
            <button type="button" onClick={onReplaceCurrent} disabled={!activeMatch || Boolean(queryError)}>
              replace
            </button>
            <button type="button" onClick={onReplaceAll} disabled={!hasMatches || Boolean(queryError)}>
              replace all
            </button>
          </>
        )}
      </div>
      <div className="find-replace-results" aria-label="Find results">
        {resultRows.map((row) => {
          if (row.type === 'header') {
            return (
              <div
                key={row.key}
                className={`find-replace-result-group ${getResultLevelClassName(row.level)}`}
              >
                {renderContextChips(row.chips)}
              </div>
            )
          }
          if (row.type === 'separator') {
            return <div key={row.key} className="find-replace-result-separator" aria-hidden="true" />
          }
          const { match, index } = row.item
          return (
            <button
              key={row.key}
              type="button"
              className={`find-replace-result ${getResultLevelClassName(row.level)} ${index === activeIndex ? 'is-active' : ''}`}
              aria-current={index === activeIndex ? 'true' : undefined}
              onClick={() => onSelectMatch(index)}
            >
              <span className="find-replace-result-context">
                {renderContextChips(getMatchContextChips(match))}
              </span>
              <span className="find-replace-result-snippet">{match.snippet}</span>
            </button>
          )
        })}
        {matches.length > 80 && <div className="find-replace-more">{matches.length - 80} more matches</div>}
      </div>
    </section>
  )
}
