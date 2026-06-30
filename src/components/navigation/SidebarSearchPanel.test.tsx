import React from 'react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SidebarSearchPanel } from './SidebarSearchPanel'
import type { SidebarSearchOption } from './SidebarSearchPanel'
import type { SidebarSearchResultGroup, SidebarSearchSuggestion } from '../../filters/sidebar-search'

const noop = () => undefined
const source = readFileSync(new URL('./SidebarSearchPanel.tsx', import.meta.url), 'utf8')

const suggestion: SidebarSearchSuggestion = {
  kind: 'frontmatter',
  key: 'fm-template:sermon',
  label: 'Sermon',
  optionType: 'frontmatter-template',
  prefix: 'fm',
  count: 3,
  tokenText: 'fm:Sermon',
}

const searchOptions: SidebarSearchOption[] = [
  { tokenText: 'tag:name', description: 'search tags', insertText: 'tag:' },
  { tokenText: 'fm:key', description: 'search frontmatter keys, templates, and values', insertText: 'fm:' },
]

const resultGroups: SidebarSearchResultGroup[] = [
  {
    key: 'note-a',
    noteId: 'note-a',
    noteName: 'Calvin sermon',
    folderPath: 'Theology',
    results: [
      {
        key: 'note-a:aisle-a:body-a',
        location: { noteId: 'note-a' },
        noteId: 'note-a',
        noteBodyId: 'body-a',
        aisleId: 'aisle-a',
        aisleBodyId: 'body-a',
        aisleNumber: 2,
        aisleCount: 3,
        noteName: 'Calvin sermon',
        folderPath: 'Theology',
        snippet: 'grace sermon body',
      },
    ],
  },
]

const textResultGroups: SidebarSearchResultGroup[] = [
  resultGroups[0],
  {
    key: 'note-b',
    noteId: 'note-b',
    noteName: 'Grace notes',
    folderPath: 'Theology',
    results: [
      {
        key: 'note-b:aisle-b:body-b',
        location: { noteId: 'note-b' },
        noteId: 'note-b',
        noteBodyId: 'body-b',
        aisleId: 'aisle-b',
        aisleBodyId: 'body-b',
        aisleNumber: 1,
        aisleCount: 1,
        noteName: 'Grace notes',
        folderPath: 'Theology',
        snippet: 'cooler study notes',
      },
    ],
  },
  {
    key: 'note-c',
    noteId: 'note-c',
    noteName: 'Loose note',
    folderPath: '',
    results: [
      {
        key: 'note-c:aisle-c:body-c',
        location: { noteId: 'note-c' },
        noteId: 'note-c',
        noteBodyId: 'body-c',
        aisleId: 'aisle-c',
        aisleBodyId: 'body-c',
        aisleNumber: 1,
        aisleCount: 1,
        noteName: 'Loose note',
        folderPath: '',
        snippet: 'cool loose note',
      },
    ],
  },
]

describe('SidebarSearchPanel', () => {
  it('renders query-token searches without selected-filter chips', () => {
    const html = renderToStaticMarkup(
      <SidebarSearchPanel
        query="fm:Ser"
        active
        metadataSearchActive
        suggestions={[suggestion]}
        searchOptions={searchOptions}
        searchHistory={['tag:#Calvin']}
        resultGroups={resultGroups}
        onQueryChange={noop}
        onSelectSuggestion={noop}
        onSelectSearchOption={noop}
        onSelectHistory={noop}
        onClearHistory={noop}
        onClear={noop}
        onOpenResult={noop}
      />,
    )

    expect(html).toContain('data-app-icon="search"')
    expect(html).not.toContain('vault-sidebar-search-chip')
    expect(html).not.toContain('#Calvin')
    expect(html).toContain('aria-label="1 search result"')
    expect(html).toContain('vault-sidebar-search-result-count')
    expect(html).not.toContain('1 result')
    expect(html).toContain('Calvin sermon')
    expect(html).toContain('Theology')
    expect(html).toContain('2)')
    expect(html).not.toContain('Aisle 2')
    expect(html).toContain('grace sermon body')
  })

  it('groups plain text search results under folder headings instead of repeating paths on each note', () => {
    const html = renderToStaticMarkup(
      <SidebarSearchPanel
        query="cool"
        active
        metadataSearchActive={false}
        suggestions={[]}
        searchOptions={searchOptions}
        searchHistory={[]}
        resultGroups={textResultGroups}
        onQueryChange={noop}
        onSelectSuggestion={noop}
        onSelectSearchOption={noop}
        onSelectHistory={noop}
        onClearHistory={noop}
        onClear={noop}
        onOpenResult={noop}
      />,
    )

    expect(html).toContain('aria-label="3 search results"')
    expect(html).toContain('>3</div>')
    expect(html).not.toContain('3 results')
    expect(html).toContain('vault-sidebar-search-folder-heading')
    expect(html.match(/Theology/g)?.length).toBe(1)
    expect(html).toContain('Calvin sermon')
    expect(html).toContain('Grace notes')
    expect(html).toContain('Local vault')
    expect(html).toContain('Loose note')
  })

  it('renders an empty state for active searches without results', () => {
    const html = renderToStaticMarkup(
      <SidebarSearchPanel
        query="missing"
        active
        metadataSearchActive={false}
        suggestions={[]}
        searchOptions={searchOptions}
        searchHistory={[]}
        resultGroups={[]}
        onQueryChange={noop}
        onSelectSuggestion={noop}
        onSelectSearchOption={noop}
        onSelectHistory={noop}
        onClearHistory={noop}
        onClear={noop}
        onOpenResult={noop}
      />,
    )

    expect(html).toContain('aria-label="0 search results"')
    expect(html).toContain('>0</div>')
    expect(html).not.toContain('0 results')
    expect(html).toContain('No matching notes')
  })

  it('renders persisted display switches and hides folder or aisle match rows when disabled', () => {
    const html = renderToStaticMarkup(
      <SidebarSearchPanel
        query="cool"
        active
        metadataSearchActive={false}
        suggestions={[]}
        searchOptions={searchOptions}
        searchHistory={[]}
        resultGroups={textResultGroups}
        showFolderNames={false}
        showAisleMatches={false}
        onQueryChange={noop}
        onSelectSuggestion={noop}
        onSelectSearchOption={noop}
        onSelectHistory={noop}
        onClearHistory={noop}
        onShowFolderNamesChange={noop}
        onShowAisleMatchesChange={noop}
        onClear={noop}
        onOpenResult={noop}
      />,
    )

    expect(html).toContain('Show folders in search results')
    expect(html).toContain('Show aisle matches in search results')
    expect(html).toContain('data-app-icon="folder"')
    expect(html).toContain('data-app-icon="aisleRight"')
    expect(html).toContain('Calvin sermon')
    expect(html).toContain('Grace notes')
    expect(html).toContain('Loose note')
    expect(html).not.toContain('Theology')
    expect(html).not.toContain('Local vault')
    expect(html).not.toContain('grace sermon body')
    expect(html).not.toContain('cooler study notes')
    expect(html).not.toContain('cool loose note')
    expect(html).not.toContain('vault-sidebar-search-result-meta')
  })

  it('marks the active note and active aisle when they appear in search results', () => {
    const html = renderToStaticMarkup(
      <SidebarSearchPanel
        query="fm:true"
        active
        metadataSearchActive
        suggestions={[]}
        searchOptions={searchOptions}
        searchHistory={[]}
        resultGroups={resultGroups}
        activeNoteId="note-a"
        activeAisleId="aisle-a"
        onQueryChange={noop}
        onSelectSuggestion={noop}
        onSelectSearchOption={noop}
        onSelectHistory={noop}
        onClearHistory={noop}
        onClear={noop}
        onOpenResult={noop}
      />,
    )

    expect(html).toContain('vault-sidebar-search-result-heading vault-sidebar-search-result-heading-button is-active')
    expect(html).toContain('vault-sidebar-search-result is-active')
    expect(html.match(/aria-current="true"/g)?.length).toBe(2)
  })

  it('clears active searches before closing search mode on Escape', () => {
    expect(source).toContain("if (event.key !== 'Escape') return")
    expect(source).toContain('if (canClear) onClear()')
    expect(source).toContain('else onCloseMode?.()')
  })

  it('lets the clear button be wired independently from Escape behavior', () => {
    expect(source).toContain('onClearButtonClick?: () => void')
    expect(source).toContain('onClick={onClearButtonClick ?? onClear}')
  })

  it('shows focus-driven suggestions or search options with history', () => {
    expect(source).toContain('const showSearchMenu = focused && query.trim().length <= 0')
    expect(source).toContain('const showSuggestions = focused && suggestions.length > 0')
    expect(source).toContain('onFocus={() => setFocused(true)}')
    expect(source).toContain('vault-sidebar-search-field-shell')
    expect(source).toContain('vault-sidebar-search-dropdown vault-sidebar-search-suggestions')
    expect(source).toContain('vault-sidebar-search-dropdown vault-sidebar-search-menu')
    expect(source).toContain('vault-sidebar-search-menu-heading')
    expect(source).toContain('Search options')
    expect(source).toContain('vault-sidebar-search-history-row')
    expect(source).toContain('onClick={onClearHistory}')
    expect(source).toContain('onClick={() => onSelectSuggestion(suggestion)}')
  })

  it('opens the first result from clickable result group headings', () => {
    expect(source).toContain('function SearchResultGroupHeading')
    expect(source).toContain('const firstResult = group.results[0]')
    expect(source).toContain('onClick={() => onOpenResult(firstResult)}')
    expect(source).toContain("onOpenResult(firstResult, 'retained')")
    expect(source).toContain('active={isActiveGroup(group)}')
    expect(source).toContain('active={isActiveResult(result)}')
    expect(source).toContain('showFolderPath={showFolderNames && !textOnlySearchActive}')
    expect(source).toContain('vault-sidebar-search-result-heading-button')
  })

  it('opens search results as retained tabs on unmodified double-click or middle-click', () => {
    expect(source).toContain('onClick={() => onOpenResult(result)}')
    expect(source).toContain('onDoubleClick={(event) => {')
    expect(source).toContain('event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey')
    expect(source).toContain("onOpenResult(result, 'retained')")
    expect(source).toContain('onMouseDown={(event) => {')
    expect(source).toContain('if (event.button !== 1) return')
    expect(source).toContain('onAuxClick={(event) => {')
    expect(source).toContain('event.preventDefault()')
    expect(source).toContain('event.stopPropagation()')
  })
})
