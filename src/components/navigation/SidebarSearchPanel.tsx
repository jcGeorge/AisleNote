import * as React from 'react'
import type { RefObject } from 'react'
import { AppIcon } from '../icons/AppIcon'
import type {
  SidebarSearchResult,
  SidebarSearchResultGroup,
  SidebarSearchSuggestion,
  SidebarSearchToken,
} from '../../filters/sidebar-search'

void React

type SidebarSearchPanelProps = {
  inputRef?: RefObject<HTMLInputElement | null>
  query: string
  active: boolean
  selectedTokens: SidebarSearchToken[]
  suggestions: SidebarSearchSuggestion[]
  resultGroups: SidebarSearchResultGroup[]
  onQueryChange: (query: string) => void
  onSelectSuggestion: (suggestion: SidebarSearchSuggestion) => void
  onRemoveToken: (token: SidebarSearchToken) => void
  onClear: () => void
  onOpenResult: (result: SidebarSearchResult) => void
}

function getTokenKindLabel(token: SidebarSearchToken): string {
  if (token.optionType === 'tag') return 'tag'
  if (token.optionType === 'frontmatter-template') return 'fm'
  if (token.optionType === 'frontmatter-property') return 'prop'
  if (token.optionType === 'synced-note') return token.prefix === 'duplicate' ? 'duplicate note' : 'synced note'
  if (token.optionType === 'synced-aisle') return token.prefix === 'duplicate' ? 'duplicate aisle' : 'synced aisle'
  return token.kind
}

function getTokenDisplayLabel(token: SidebarSearchToken): string {
  return token.optionType === 'tag' ? `#${token.label}` : token.label
}

function getResultCount(resultGroups: SidebarSearchResultGroup[]): number {
  return resultGroups.reduce((count, group) => count + group.results.length, 0)
}

export function SidebarSearchPanel({
  inputRef,
  query,
  active,
  selectedTokens,
  suggestions,
  resultGroups,
  onQueryChange,
  onSelectSuggestion,
  onRemoveToken,
  onClear,
  onOpenResult,
}: SidebarSearchPanelProps) {
  const resultCount = getResultCount(resultGroups)
  const canClear = query.trim().length > 0 || selectedTokens.length > 0

  return (
    <section className={`notebook-sidebar-search ${active ? 'is-active' : ''}`} aria-label="Notebook search">
      <label className="notebook-sidebar-search-field">
        <AppIcon iconId="search" className="notebook-sidebar-search-icon" />
        <input
          ref={inputRef}
          className="notebook-search-input"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search notes"
        />
        {canClear ? (
          <button
            type="button"
            className="notebook-sidebar-search-clear"
            aria-label="Clear search"
            data-app-tooltip="Clear search"
            onClick={onClear}
          >
            <AppIcon iconId="x" className="notebook-sidebar-search-clear-icon" />
          </button>
        ) : null}
      </label>

      {selectedTokens.length > 0 ? (
        <div className="notebook-sidebar-search-chips" aria-label="Selected filters">
          {selectedTokens.map((token) => (
            <button
              key={`${token.kind}:${token.key}`}
              type="button"
              className="notebook-sidebar-search-chip"
              aria-label={`Remove ${getTokenKindLabel(token)} filter ${getTokenDisplayLabel(token)}`}
              onClick={() => onRemoveToken(token)}
            >
              <span className="notebook-sidebar-search-chip-kind">{getTokenKindLabel(token)}</span>
              <span className="notebook-sidebar-search-chip-label">{getTokenDisplayLabel(token)}</span>
              <AppIcon iconId="x" className="notebook-sidebar-search-chip-remove" />
            </button>
          ))}
        </div>
      ) : null}

      {suggestions.length > 0 ? (
        <div className="notebook-sidebar-search-suggestions" role="listbox" aria-label="Search suggestions">
          {suggestions.map((suggestion) => (
            <button
              key={`${suggestion.kind}:${suggestion.key}`}
              type="button"
              className="notebook-sidebar-search-suggestion"
              role="option"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelectSuggestion(suggestion)}
            >
              <span className="notebook-sidebar-search-suggestion-token">{suggestion.tokenText}</span>
              <span className="notebook-sidebar-search-suggestion-count">
                {suggestion.count === 1 ? '1 match' : `${suggestion.count} matches`}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {active ? (
        <div className="notebook-sidebar-search-results" aria-label="Search results">
          <div className="notebook-sidebar-search-summary">
            {resultCount === 1 ? '1 result' : `${resultCount} results`}
          </div>
          {resultGroups.length > 0 ? (
            resultGroups.map((group) => (
              <section key={group.key} className="notebook-sidebar-search-result-group">
                <div className="notebook-sidebar-search-result-heading">
                  <span>{group.noteName}</span>
                  {group.folderPath ? <small>{group.folderPath}</small> : null}
                </div>
                {group.results.map((result) => (
                  <button
                    key={result.key}
                    type="button"
                    className="notebook-sidebar-search-result"
                    onClick={() => onOpenResult(result)}
                  >
                    <span className="notebook-sidebar-search-result-meta">
                      {result.aisleCount > 1 ? `Aisle ${result.aisleNumber}` : 'Note'}
                    </span>
                    <span className="notebook-sidebar-search-result-snippet">{result.snippet || group.noteName}</span>
                  </button>
                ))}
              </section>
            ))
          ) : (
            <div className="notebook-sidebar-search-empty">No matching notes</div>
          )}
        </div>
      ) : null}
    </section>
  )
}
