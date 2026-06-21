import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SidebarSearchPanel } from './SidebarSearchPanel'
import type { SidebarSearchResultGroup, SidebarSearchSuggestion, SidebarSearchToken } from '../../filters/sidebar-search'

const noop = () => undefined

const tagToken: SidebarSearchToken = {
  kind: 'tags',
  key: 'calvin',
  label: 'Calvin',
  optionType: 'tag',
  prefix: 'tag',
}

const suggestion: SidebarSearchSuggestion = {
  kind: 'frontmatter',
  key: 'fm-template:sermon',
  label: 'Sermon',
  optionType: 'frontmatter-template',
  prefix: 'fm',
  count: 3,
  tokenText: 'fm:Sermon',
}

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

describe('SidebarSearchPanel', () => {
  it('renders chips, suggestions, and grouped aisle-level results', () => {
    const html = renderToStaticMarkup(
      <SidebarSearchPanel
        query="fm:Ser"
        active
        selectedTokens={[tagToken]}
        suggestions={[suggestion]}
        resultGroups={resultGroups}
        onQueryChange={noop}
        onSelectSuggestion={noop}
        onRemoveToken={noop}
        onClear={noop}
        onOpenResult={noop}
      />,
    )

    expect(html).toContain('data-app-icon="search"')
    expect(html).toContain('tag')
    expect(html).toContain('#Calvin')
    expect(html).toContain('fm:Sermon')
    expect(html).toContain('3 matches')
    expect(html).toContain('1 result')
    expect(html).toContain('Calvin sermon')
    expect(html).toContain('Theology')
    expect(html).toContain('Aisle 2')
    expect(html).toContain('grace sermon body')
  })

  it('renders an empty state for active searches without results', () => {
    const html = renderToStaticMarkup(
      <SidebarSearchPanel
        query="missing"
        active
        selectedTokens={[]}
        suggestions={[]}
        resultGroups={[]}
        onQueryChange={noop}
        onSelectSuggestion={noop}
        onRemoveToken={noop}
        onClear={noop}
        onOpenResult={noop}
      />,
    )

    expect(html).toContain('0 results')
    expect(html).toContain('No matching notes')
  })
})
