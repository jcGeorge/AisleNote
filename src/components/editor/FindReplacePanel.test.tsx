import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { FindReplaceMatch } from '../../notes/find-replace'
import { FindReplacePanel } from './FindReplacePanel'

function match(id: string, snippet = 'matching text'): FindReplaceMatch {
  return {
    id,
    location: { noteId: 'note-a' },
    label: 'Note A',
    context: {
      folderId: 'folder-a',
      folderName: 'Folder A',
      folderPath: 'Notebook / Folder A',
      noteId: 'note-a',
      noteName: 'Note A',
      noteKind: 'note',
    },
    noteBodyId: `body-${id}`,
    aisleId: `aisle-${id}`,
    aisleIndex: 0,
    aisleNumber: 1,
    aisleCount: 1,
    aisleBodyId: `aisle-body-${id}`,
    markdownFrom: 0,
    markdownTo: 5,
    visibleFrom: 0,
    visibleTo: 5,
    snippet,
    matchedText: 'match',
  }
}

function renderPanel(overrides: Partial<Parameters<typeof FindReplacePanel>[0]> = {}) {
  const noop = vi.fn()
  return renderToStaticMarkup(
    <FindReplacePanel
      focusRequestId={0}
      query="bear"
      replacement="cat"
      caseSensitive={false}
      wholeWord={false}
      regex={false}
      queryError={null}
      matches={[]}
      activeIndex={0}
      onQueryChange={noop}
      onReplacementChange={noop}
      onCaseSensitiveChange={noop}
      onWholeWordChange={noop}
      onRegexChange={noop}
      onPrevious={noop}
      onNext={noop}
      onReplaceCurrent={noop}
      onReplaceAll={noop}
      onClose={noop}
      {...overrides}
    />,
  )
}

describe('FindReplacePanel', () => {
  it('renders compact always-on find and replace controls', () => {
    const html = renderPanel()

    expect(html).toContain('aria-label="Find and replace"')
    expect(html).toContain('placeholder="Find"')
    expect(html).toContain('placeholder="Replace"')
    expect(html).toContain('aria-label="Previous match"')
    expect(html).toContain('aria-label="Next match"')
    expect(html).toContain('aria-label="Replace"')
    expect(html).toContain('aria-label="Replace all"')
    expect(html).toContain('aria-label="Close find and replace"')
    expect(html).not.toContain('<span>and replace</span>')
    expect(html).not.toContain('find-replace-mode-check')
    expect(html).not.toContain('search for results within this')
    expect(html).not.toContain('find-replace-results')
  })

  it('renders compact option toggles without checkbox labels', () => {
    const html = renderPanel({ caseSensitive: true, wholeWord: true, regex: true })

    expect(html).toContain('aria-label="Match case"')
    expect(html).toContain('aria-label="Whole word"')
    expect(html).toContain('aria-label="Regex"')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('>Aa</button>')
    expect(html).toContain('>ab</button>')
    expect(html).toContain('>.*</button>')
    expect(html).not.toContain('>case</span>')
    expect(html).not.toContain('>word</span>')
    expect(html).not.toContain('>regex</span>')
    expect(html).not.toContain('type="checkbox"')
  })

  it('shows match position as a count instead of a result list', () => {
    const html = renderPanel({
      matches: [match('one'), match('two')],
      activeIndex: 1,
    })

    expect(html).toContain('2 of 2')
    expect(html).not.toContain('matching text')
    expect(html).not.toContain('Notebook / Folder A')
    expect(html).not.toContain('find-replace-result')
  })

  it('shows no-results and invalid query states inline', () => {
    const emptyHtml = renderPanel({ query: '', matches: [] })
    const invalidHtml = renderPanel({ regex: true, queryError: 'invalid regex' })

    expect(emptyHtml).toContain('No results')
    expect(invalidHtml).toContain('aria-invalid="true"')
    expect(invalidHtml).toContain('invalid regex')
  })
})
