import { useEffect, useRef } from 'react'
import type { FindReplaceMatch, FindReplaceScope } from '../../notes/find-replace'

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
  { id: 'note', label: 'tab' },
  { id: 'parent', label: 'parent' },
  { id: 'space', label: 'space' },
  { id: 'domain', label: 'domain' },
  { id: 'project', label: 'project' },
]

type FindReplaceResultItem = {
  match: FindReplaceMatch
  index: number
}

type FindReplaceResultRow =
  | { type: 'header'; key: string; level: number; chips: FindReplaceChip[] }
  | { type: 'match'; key: string; level: number; item: FindReplaceResultItem }

type FindReplaceChip = {
  kind: 'domain' | 'space' | 'parent' | 'subtab'
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

function buildFindReplaceResultRows(matches: FindReplaceMatch[], limit: number): FindReplaceResultRow[] {
  const rows: FindReplaceResultRow[] = []
  const items = matches.slice(0, limit).map((match, index) => ({ match, index }))
  const domainGroups = groupResultItems(items, (item) => item.match.context.domainId)
  domainGroups.forEach((domainGroup) => {
    const firstDomainMatch = domainGroup.items[0]?.match
    if (!firstDomainMatch) return
    const spaceGroups = groupResultItems(domainGroup.items, (item) => item.match.context.spaceId)
    const domainChips: FindReplaceChip[] = [
      { kind: 'domain', label: firstDomainMatch.context.domainName },
    ]
    if (spaceGroups.length === 1) {
      const firstSpaceMatch = spaceGroups[0]?.items[0]?.match
      if (firstSpaceMatch) domainChips.push({ kind: 'space', label: firstSpaceMatch.context.spaceName })
      const parentGroups = groupResultItems(spaceGroups[0]?.items ?? [], (item) => item.match.context.parentId)
      if (parentGroups.length === 1) {
        const firstParentMatch = parentGroups[0]?.items[0]?.match
        if (firstParentMatch) domainChips.push({ kind: 'parent', label: firstParentMatch.context.parentName })
        rows.push({ type: 'header', key: `domain:${domainGroup.key}`, level: 0, chips: domainChips })
        pushMatchRows(rows, domainGroup.items, 1)
        return
      }

      rows.push({ type: 'header', key: `domain:${domainGroup.key}`, level: 0, chips: domainChips })
      parentGroups.forEach((parentGroup) => {
        const firstParentMatch = parentGroup.items[0]?.match
        if (!firstParentMatch) return
        rows.push({
          type: 'header',
          key: `parent:${domainGroup.key}:${parentGroup.key}`,
          level: 1,
          chips: [{ kind: 'parent', label: firstParentMatch.context.parentName }],
        })
        pushMatchRows(rows, parentGroup.items, 2)
      })
      return
    }

    rows.push({ type: 'header', key: `domain:${domainGroup.key}`, level: 0, chips: domainChips })
    spaceGroups.forEach((spaceGroup) => {
      const firstSpaceMatch = spaceGroup.items[0]?.match
      if (!firstSpaceMatch) return
      const parentGroups = groupResultItems(spaceGroup.items, (item) => item.match.context.parentId)
      const spaceChips: FindReplaceChip[] = [{ kind: 'space', label: firstSpaceMatch.context.spaceName }]
      if (parentGroups.length === 1) {
        const firstParentMatch = parentGroups[0]?.items[0]?.match
        if (firstParentMatch) spaceChips.push({ kind: 'parent', label: firstParentMatch.context.parentName })
        rows.push({
          type: 'header',
          key: `space:${domainGroup.key}:${spaceGroup.key}`,
          level: 1,
          chips: spaceChips,
        })
        pushMatchRows(rows, spaceGroup.items, 2)
        return
      }

      rows.push({
        type: 'header',
        key: `space:${domainGroup.key}:${spaceGroup.key}`,
        level: 1,
        chips: spaceChips,
      })
      parentGroups.forEach((parentGroup) => {
        const firstParentMatch = parentGroup.items[0]?.match
        if (!firstParentMatch) return
        rows.push({
          type: 'header',
          key: `parent:${domainGroup.key}:${spaceGroup.key}:${parentGroup.key}`,
          level: 2,
          chips: [{ kind: 'parent', label: firstParentMatch.context.parentName }],
        })
        pushMatchRows(rows, parentGroup.items, 3)
      })
    })
  })
  return rows
}

function getContextChipClassName(kind: FindReplaceChip['kind']) {
  if (kind === 'domain') {
    return 'find-replace-context-chip rail-control context-preview-title-btn compact-scope-btn compact-domain-btn is-domain'
  }
  if (kind === 'space') {
    return 'find-replace-context-chip rail-control context-preview-title-btn compact-scope-btn compact-space-btn is-space'
  }
  if (kind === 'parent') {
    return 'find-replace-context-chip rail-control context-preview-title-btn btn btn-sm tab-btn parent-tab-btn is-parent'
  }
  return 'find-replace-context-chip rail-control context-preview-title-btn btn btn-sm tab-btn subtab-btn is-subtab'
}

function renderContextChips(chips: FindReplaceChip[]) {
  return chips.map((chip, index) => (
    <span key={`${chip.kind}:${chip.label}:${index}`} className={getContextChipClassName(chip.kind)}>
      {chip.label}
    </span>
  ))
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
        <button type="button" className="find-replace-icon-btn" aria-label="Close find" onClick={onClose}>
          ×
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
                {renderContextChips([
                  {
                    kind: match.context.noteKind === 'subtab' ? 'subtab' : 'parent',
                    label: match.context.noteName,
                  },
                ])}
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
