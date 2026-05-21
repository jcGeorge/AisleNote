import type { FindReplaceMatch, FindReplaceScope } from '../../notes/find-replace'

type FindReplacePanelProps = {
  query: string
  replacement: string
  scope: FindReplaceScope
  caseSensitive: boolean
  wholeWord: boolean
  matches: FindReplaceMatch[]
  activeIndex: number
  onQueryChange: (query: string) => void
  onReplacementChange: (replacement: string) => void
  onScopeChange: (scope: FindReplaceScope) => void
  onCaseSensitiveChange: (checked: boolean) => void
  onWholeWordChange: (checked: boolean) => void
  onPrevious: () => void
  onNext: () => void
  onSelectMatch: (index: number) => void
  onReplaceCurrent: () => void
  onReplaceAll: () => void
  onClose: () => void
}

const FIND_SCOPES: Array<{ id: FindReplaceScope; label: string }> = [
  { id: 'note', label: 'note' },
  { id: 'parent', label: 'parent' },
  { id: 'space', label: 'space' },
  { id: 'domain', label: 'domain' },
  { id: 'project', label: 'project' },
]

export function FindReplacePanel({
  query,
  replacement,
  scope,
  caseSensitive,
  wholeWord,
  matches,
  activeIndex,
  onQueryChange,
  onReplacementChange,
  onScopeChange,
  onCaseSensitiveChange,
  onWholeWordChange,
  onPrevious,
  onNext,
  onSelectMatch,
  onReplaceCurrent,
  onReplaceAll,
  onClose,
}: FindReplacePanelProps) {
  const hasMatches = matches.length > 0
  const activeMatch = hasMatches ? matches[Math.max(0, Math.min(activeIndex, matches.length - 1))] : null

  return (
    <section
      className="find-replace-panel"
      role="dialog"
      aria-label="Find and replace"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="find-replace-header">
        <strong>find & replace</strong>
        <button type="button" className="find-replace-icon-btn" aria-label="Close find and replace" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="find-replace-fields">
        <label className="find-replace-field">
          <span>find</span>
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                onNext()
              }
            }}
          />
        </label>
        <label className="find-replace-field">
          <span>replace</span>
          <input value={replacement} onChange={(event) => onReplacementChange(event.target.value)} />
        </label>
      </div>
      <div className="find-replace-row">
        <select value={scope} onChange={(event) => onScopeChange(event.target.value as FindReplaceScope)}>
          {FIND_SCOPES.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.label}
            </option>
          ))}
        </select>
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
      </div>
      <div className="find-replace-actions">
        <span className="find-replace-count">
          {query.trim() ? (hasMatches ? `${activeIndex + 1} of ${matches.length}` : '0 matches') : 'enter text'}
        </span>
        <button type="button" onClick={onPrevious} disabled={!hasMatches}>
          prev
        </button>
        <button type="button" onClick={onNext} disabled={!hasMatches}>
          next
        </button>
        <button type="button" onClick={onReplaceCurrent} disabled={!activeMatch}>
          replace
        </button>
        <button type="button" onClick={onReplaceAll} disabled={!hasMatches}>
          replace all
        </button>
      </div>
      <div className="find-replace-results" aria-label="Find results">
        {matches.slice(0, 80).map((match, index) => (
          <button
            key={match.id}
            type="button"
            className={`find-replace-result ${index === activeIndex ? 'is-active' : ''}`}
            aria-current={index === activeIndex ? 'true' : undefined}
            onClick={() => onSelectMatch(index)}
          >
            <span className="find-replace-result-label">{match.label}</span>
            <span className="find-replace-result-snippet">{match.snippet}</span>
          </button>
        ))}
        {matches.length > 80 && <div className="find-replace-more">{matches.length - 80} more matches</div>}
      </div>
    </section>
  )
}
