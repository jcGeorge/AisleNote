import * as React from 'react'
import type { RefObject } from 'react'
import { AppIcon } from '../icons/AppIcon'
import type {
  SidebarSearchResult,
  SidebarSearchResultGroup,
  SidebarSearchSuggestion,
} from '../../filters/sidebar-search'

void React

type SidebarSearchPanelProps = {
  inputRef?: RefObject<HTMLInputElement | null>
  query: string
  active: boolean
  metadataSearchActive: boolean
  suggestions: SidebarSearchSuggestion[]
  searchOptions: SidebarSearchOption[]
  searchHistory: string[]
  resultGroups: SidebarSearchResultGroup[]
  onQueryChange: (query: string) => void
  onSelectSuggestion: (suggestion: SidebarSearchSuggestion) => void
  onSelectSearchOption: (option: SidebarSearchOption) => void
  onSelectHistory: (query: string) => void
  onClearHistory: () => void
  onClear: () => void
  onClearButtonClick?: () => void
  onCloseMode?: () => void
  onOpenResult: (result: SidebarSearchResult, mode?: SidebarSearchResultOpenMode) => void
}

export type SidebarSearchOption = {
  tokenText: string
  description: string
  insertText: string
}

export type SidebarSearchResultOpenMode = 'temporary' | 'retained'

function getResultCount(resultGroups: SidebarSearchResultGroup[]): number {
  return resultGroups.reduce((count, group) => count + group.results.length, 0)
}

type SidebarSearchFolderSection = {
  key: string
  folderPath: string
  groups: SidebarSearchResultGroup[]
}

function getFolderSectionLabel(folderPath: string): string {
  return folderPath.trim() || 'Local vault'
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
  onOpenResult: (result: SidebarSearchResult, mode?: SidebarSearchResultOpenMode) => void
}) {
  return (
    <button
      type="button"
      className="vault-sidebar-search-result"
      onClick={() => onOpenResult(result)}
      onMouseDown={(event) => {
        if (event.button !== 1) return
        event.preventDefault()
        event.stopPropagation()
        onOpenResult(result, 'retained')
      }}
      onAuxClick={(event) => {
        if (event.button !== 1) return
        event.preventDefault()
        event.stopPropagation()
      }}
      onDoubleClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
        event.preventDefault()
        event.stopPropagation()
        onOpenResult(result, 'retained')
      }}
    >
      <span className="vault-sidebar-search-result-meta">
        {result.aisleCount > 1 ? `${result.aisleNumber})` : 'Note'}
      </span>
      <span className="vault-sidebar-search-result-snippet">{result.snippet || group.noteName}</span>
    </button>
  )
}

function SearchResultGroupHeading({
  group,
  showFolderPath = false,
  onOpenResult,
}: {
  group: SidebarSearchResultGroup
  showFolderPath?: boolean
  onOpenResult: (result: SidebarSearchResult, mode?: SidebarSearchResultOpenMode) => void
}) {
  const firstResult = group.results[0]
  const content = (
    <>
      <span>{group.noteName}</span>
      {showFolderPath && group.folderPath ? <small>{group.folderPath}</small> : null}
    </>
  )

  if (!firstResult) {
    return <div className="vault-sidebar-search-result-heading">{content}</div>
  }

  return (
    <button
      type="button"
      className="vault-sidebar-search-result-heading vault-sidebar-search-result-heading-button"
      onClick={() => onOpenResult(firstResult)}
      onMouseDown={(event) => {
        if (event.button !== 1) return
        event.preventDefault()
        event.stopPropagation()
        onOpenResult(firstResult, 'retained')
      }}
      onAuxClick={(event) => {
        if (event.button !== 1) return
        event.preventDefault()
        event.stopPropagation()
      }}
      onDoubleClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
        event.preventDefault()
        event.stopPropagation()
        onOpenResult(firstResult, 'retained')
      }}
    >
      {content}
    </button>
  )
}

export function SidebarSearchPanel({
  inputRef,
  query,
  active,
  metadataSearchActive,
  suggestions,
  searchOptions,
  searchHistory,
  resultGroups,
  onQueryChange,
  onSelectSuggestion,
  onSelectSearchOption,
  onSelectHistory,
  onClearHistory,
  onClear,
  onClearButtonClick,
  onCloseMode,
  onOpenResult,
}: SidebarSearchPanelProps) {
  const [focused, setFocused] = React.useState(false)
  const resultCount = getResultCount(resultGroups)
  const canClear = query.trim().length > 0
  const textOnlySearchActive = query.trim().length > 0 && !metadataSearchActive
  const folderSections = textOnlySearchActive ? getFolderResultSections(resultGroups) : []
  const showSearchMenu = focused && query.trim().length <= 0
  const showSuggestions = focused && suggestions.length > 0

  return (
    <section className={`vault-sidebar-search ${active ? 'is-active' : ''}`} aria-label="Vault search">
      <div className="vault-sidebar-search-field-shell">
        <label className="vault-sidebar-search-field">
          <AppIcon iconId="search" className="vault-sidebar-search-icon" />
          <input
            ref={inputRef}
            className="vault-search-input"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
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
              className="vault-sidebar-search-clear"
              aria-label="Clear search"
              data-app-tooltip="Clear search"
              onClick={onClearButtonClick ?? onClear}
            >
              <AppIcon iconId="x" className="vault-sidebar-search-clear-icon" />
            </button>
          ) : null}
        </label>

        {showSuggestions ? (
          <div
            className="vault-sidebar-search-dropdown vault-sidebar-search-suggestions"
            role="listbox"
            aria-label="Search suggestions"
          >
            {suggestions.map((suggestion) => (
              <button
                key={`${suggestion.kind}:${suggestion.key}`}
                type="button"
                className="vault-sidebar-search-suggestion"
                role="option"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onSelectSuggestion(suggestion)}
              >
                <span className="vault-sidebar-search-suggestion-token">{suggestion.tokenText}</span>
                <span className="vault-sidebar-search-suggestion-count">
                  {suggestion.count === 1 ? '1 match' : `${suggestion.count} matches`}
                </span>
              </button>
            ))}
          </div>
        ) : showSearchMenu ? (
          <div className="vault-sidebar-search-dropdown vault-sidebar-search-menu" aria-label="Search options">
            <div className="vault-sidebar-search-menu-section">
              <div className="vault-sidebar-search-menu-heading">Search options</div>
              {searchOptions.map((option) => (
                <button
                  key={option.tokenText}
                  type="button"
                  className="vault-sidebar-search-menu-row"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onSelectSearchOption(option)}
                >
                  <span className="vault-sidebar-search-menu-token">{option.tokenText}</span>
                  <span className="vault-sidebar-search-menu-description">{option.description}</span>
                </button>
              ))}
            </div>
            {searchHistory.length > 0 ? (
              <div className="vault-sidebar-search-menu-section">
                <div className="vault-sidebar-search-history-heading">
                  <span>History</span>
                  <button
                    type="button"
                    className="vault-sidebar-search-history-clear"
                    aria-label="Clear search history"
                    data-app-tooltip="Clear search history"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={onClearHistory}
                  >
                    <AppIcon iconId="x" className="vault-sidebar-search-history-clear-icon" />
                  </button>
                </div>
                {searchHistory.map((historyQuery) => (
                  <button
                    key={historyQuery}
                    type="button"
                    className="vault-sidebar-search-history-row"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onSelectHistory(historyQuery)}
                  >
                    {historyQuery}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {active ? (
        <div className="vault-sidebar-search-results" aria-label="Search results">
          <div className="vault-sidebar-search-summary">
            {resultCount === 1 ? '1 result' : `${resultCount} results`}
          </div>
          {resultGroups.length > 0 && textOnlySearchActive ? (
            folderSections.map((section) => (
              <section key={section.key} className="vault-sidebar-search-folder-section">
                <div className="vault-sidebar-search-folder-heading">
                  {getFolderSectionLabel(section.folderPath)}
                </div>
                {section.groups.map((group) => (
                  <section key={group.key} className="vault-sidebar-search-result-group">
                    <SearchResultGroupHeading group={group} onOpenResult={onOpenResult} />
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
              <section key={group.key} className="vault-sidebar-search-result-group">
                <SearchResultGroupHeading group={group} showFolderPath onOpenResult={onOpenResult} />
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
            <div className="vault-sidebar-search-empty">No matching notes</div>
          )}
        </div>
      ) : null}
    </section>
  )
}
