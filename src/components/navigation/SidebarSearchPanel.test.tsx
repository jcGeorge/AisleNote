import React from 'react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SidebarSearchPanel } from './SidebarSearchPanel'
import type { SidebarSearchResultGroup, SidebarSearchSuggestion, SidebarSearchToken } from '../../filters/sidebar-search'

const noop = () => undefined
const source = readFileSync(new URL('./SidebarSearchPanel.tsx', import.meta.url), 'utf8')

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
    expect(html).toContain('2)')
    expect(html).not.toContain('Aisle 2')
    expect(html).toContain('grace sermon body')
  })

  it('groups plain text search results under folder headings instead of repeating paths on each note', () => {
    const html = renderToStaticMarkup(
      <SidebarSearchPanel
        query="cool"
        active
        selectedTokens={[]}
        suggestions={[]}
        resultGroups={textResultGroups}
        onQueryChange={noop}
        onSelectSuggestion={noop}
        onRemoveToken={noop}
        onClear={noop}
        onOpenResult={noop}
      />,
    )

    expect(html).toContain('3 results')
    expect(html).toContain('notebook-sidebar-search-folder-heading')
    expect(html.match(/Theology/g)?.length).toBe(1)
    expect(html).toContain('Calvin sermon')
    expect(html).toContain('Grace notes')
    expect(html).toContain('Local notebook')
    expect(html).toContain('Loose note')
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

  it('clears active searches before closing search mode on Escape', () => {
    expect(source).toContain("if (event.key !== 'Escape') return")
    expect(source).toContain('if (canClear) onClear()')
    expect(source).toContain('else onCloseMode?.()')
  })
})
