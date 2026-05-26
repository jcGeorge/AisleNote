import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { FindReplaceMatch } from '../../notes/find-replace'
import { FindReplacePanel } from './FindReplacePanel'

function match(
  id: string,
  context: FindReplaceMatch['context'],
  snippet = 'matching text',
): FindReplaceMatch {
  return {
    id,
    location: {
      domainId: context.domainId,
      spaceId: context.spaceId,
      tabId: context.parentId,
      subTabId: context.noteKind === 'subtab' ? context.noteId : null,
    },
    label: `${context.domainName} > ${context.spaceName} > ${context.parentName} > ${context.noteName}`,
    context,
    noteBodyId: `body-${id}`,
    aisleId: `aisle-${id}`,
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
      replaceMode={false}
      focusRequestId={0}
      query="bear"
      replacement="cat"
      scope="note"
      caseSensitive={false}
      wholeWord={false}
      regex={false}
      queryError={null}
      matches={[]}
      activeIndex={0}
      onReplaceModeChange={noop}
      onQueryChange={noop}
      onReplacementChange={noop}
      onScopeChange={noop}
      onCaseSensitiveChange={noop}
      onWholeWordChange={noop}
      onRegexChange={noop}
      onPrevious={noop}
      onNext={noop}
      onSelectMatch={noop}
      onReplaceCurrent={noop}
      onReplaceAll={noop}
      onClose={noop}
      {...overrides}
    />,
  )
}

describe('FindReplacePanel', () => {
  it('renders find-only mode with scope buttons and regex option', () => {
    const html = renderPanel()

    expect(html).toContain('aria-label="Find"')
    expect(html).toContain('and replace')
    expect(html).not.toContain('<span>replace</span>')
    expect(html).toContain('search for results within this:')
    expect(html).toContain('>tab</button>')
    expect(html).toContain('>parent</button>')
    expect(html).toContain('>space</button>')
    expect(html).toContain('>domain</button>')
    expect(html).toContain('>project</button>')
    expect(html).toContain('>regex</span>')
  })

  it('renders replace controls only when replace mode is enabled', () => {
    const html = renderPanel({ replaceMode: true })

    expect(html).toContain('aria-label="Find and replace"')
    expect(html).toContain('<span>replace</span>')
    expect(html).toContain('>replace</button>')
    expect(html).toContain('>replace all</button>')
  })

  it('renders grouped context chips instead of breadcrumb result labels', () => {
    const html = renderPanel({
      matches: [
        match('one', {
          domainId: 'domain-a',
          domainName: 'Domain A',
          spaceId: 'space-a',
          spaceName: 'Space A',
          parentId: 'parent-a',
          parentName: 'Parent A',
          noteId: 'sub-a',
          noteName: 'Sub A',
          noteKind: 'subtab',
        }),
      ],
    })

    expect(html).toContain('find-replace-context-chip')
    expect(html).toContain('compact-domain-btn')
    expect(html).toContain('compact-space-btn')
    expect(html).toContain('parent-tab-btn')
    expect(html).toContain('subtab-btn')
    expect(html).toContain('>Sub A</span>')
    expect(html).not.toContain('Domain A &gt; Space A &gt; Parent A &gt; Sub A')
  })

  it('shows an inline invalid regex state', () => {
    const html = renderPanel({ regex: true, queryError: 'invalid regex' })

    expect(html).toContain('aria-invalid="true"')
    expect(html).toContain('find-replace-error')
    expect(html).toContain('invalid regex')
  })
})
