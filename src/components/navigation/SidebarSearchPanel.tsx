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
  onCloseMode?: () => void
  onOpenResult: (result: SidebarSearchResult) => void
}

function getTokenKindLabel(token: SidebarSearchToken): string {
  if (token.optionType === 'tag') return 'tag'
  if (token.optionType === 'frontmatter-template') return 'fm'
  if (token.optionType === 'frontmatter-property') return 'prop'
  if (token.optionType === 'synced-aisle') return token.prefix === 'duplicate' ? 'duplicate aisle' : 'synced aisle'
  return token.kind
}

function getTokenDisplayLabel(token: SidebarSearchToken): string {
  return token.optionType === 'tag' ? `#${token.label}` : token.label
}

function getResultCount(resultGroups: SidebarSearchResultGroup[]): number {
  return resultGroups.reduce((count, group) => count + group.results.length, 0)
}

type SidebarSearchFolderSection = {
  key: string
  folderPath: string
  groups: SidebarSearchResultGroup[]
}

function getFolderSectionLabel(folderPath: string): string {
  return folderPath.trim() || 'Local notebook'
}

function getFolderResultSections(resultGroups: SidebarSearchResultGroup[]): SidebarSearchFolderSection[] {
  const sections: SidebarSearchFolderSection[] = []
  const sectionsByFolderPath = new Map<string, SidebarSearchFolderSection>()
  resultGroups.forEach((group) => {
    const folderPath = group.folderPath.trim()
    const key = folderPath || '__root__'
    const section = sectionsByFolderPath.get(key) ?? {
      key,
      folderPath,
      groups: [],
    }
    if (!sectionsByFolderPath.has(key)) {
      sectionsByFolderPath.set(key, section)
      sections.push(section)
    }
    section.groups.push(group)
  })
  return sections
}

function SearchResultButton({
  group,
  result,
  onOpenResult,
}: {
  group: SidebarSearchResultGroup
  result: SidebarSearchResult
  onOpenResult: (result: SidebarSearchResult) => void
}) {
  return (
    <button
      type="button"
      className="notebook-sidebar-search-result"
      onClick={() => onOpenResult(result)}
    >
      <span className="notebook-sidebar-search-result-meta">
        {result.aisleCount > 1 ? `${result.aisleNumber})` : 'Note'}
      </span>
      <span className="notebook-sidebar-search-result-snippet">{result.snippet || group.noteName}</span>
    </button>
  )
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
  onCloseMode,
  onOpenResult,
}: SidebarSearchPanelProps) {
  const resultCount = getResultCount(resultGroups)
  const canClear = query.trim().length > 0 || selectedTokens.length > 0
  const textOnlySearchActive = query.trim().length > 0 && selectedTokens.length === 0
  const folderSections = textOnlySearchActive ? getFolderResultSections(resultGroups) : []

  return (
    <section className={`notebook-sidebar-search ${active ? 'is-active' : ''}`} aria-label="Notebook search">
      <label className="notebook-sidebar-search-field">
        <AppIcon iconId="search" className="notebook-sidebar-search-icon" />
        <input
          ref={inputRef}
          className="notebook-search-input"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return
            event.preventDefault()
            event.stopPropagation()
            if (canClear) onClear()
            else onCloseMode?.()
          }}
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
          {resultGroups.length > 0 && textOnlySearchActive ? (
            folderSections.map((section) => (
              <section key={section.key} className="notebook-sidebar-search-folder-section">
                <div className="notebook-sidebar-search-folder-heading">
                  {getFolderSectionLabel(section.folderPath)}
                </div>
                {section.groups.map((group) => (
                  <section key={group.key} className="notebook-sidebar-search-result-group">
                    <div className="notebook-sidebar-search-result-heading">
                      <span>{group.noteName}</span>
                    </div>
                    {group.results.map((result) => (
                      <SearchResultButton
                        key={result.key}
                        group={group}
                        result={result}
                        onOpenResult={onOpenResult}
                      />
                    ))}
                  </section>
                ))}
              </section>
            ))
          ) : resultGroups.length > 0 ? (
            resultGroups.map((group) => (
              <section key={group.key} className="notebook-sidebar-search-result-group">
                <div className="notebook-sidebar-search-result-heading">
                  <span>{group.noteName}</span>
                  {group.folderPath ? <small>{group.folderPath}</small> : null}
                </div>
                {group.results.map((result) => (
                  <SearchResultButton
                    key={result.key}
                    group={group}
                    result={result}
                    onOpenResult={onOpenResult}
                  />
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
