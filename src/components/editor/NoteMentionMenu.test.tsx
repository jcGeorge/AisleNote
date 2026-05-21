import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { NoteMentionMenu } from './NoteMentionMenu'

const handlers = {
  onActiveRowChange: vi.fn(),
  onSelectNavigatorItem: vi.fn(),
  onHighlightSearch: vi.fn(),
  onChooseSearchEntry: vi.fn(),
  onChooseTarget: vi.fn(),
}

describe('NoteMentionMenu', () => {
  it('renders four navigator rows with active and selected states', () => {
    const html = renderToStaticMarkup(
      <NoteMentionMenu
        top={10}
        left={12}
        query=""
        activeRow="space"
        activeSearchIndex={0}
        modifierLabel="Cmd"
        searchEntries={[]}
        navigatorRows={[
          { id: 'domain', label: 'domains', selectedId: 'domain', items: [{ id: 'domain', label: 'Humble beginnings' }] },
          { id: 'space', label: 'spaces', selectedId: 'space', items: [{ id: 'space', label: 'mySpace' }] },
          { id: 'tab', label: 'prime tabs', selectedId: 'tab', items: [{ id: 'tab', label: 'codex' }] },
          {
            id: 'note',
            label: 'notes',
            selectedId: '__home__',
            items: [{ id: '__home__', label: 'home', target: { domainId: 'domain', spaceId: 'space', tabId: 'tab', subTabId: null } }],
          },
        ]}
        {...handlers}
      />,
    )

    expect(html).toContain('aria-label="Note navigator"')
    expect(html).toContain('note-mention-nav-row is-active-row')
    expect(html).toContain('>domains</button>')
    expect(html).toContain('>spaces</button>')
    expect(html).toContain('>prime tabs</button>')
    expect(html).toContain('>notes</button>')
    expect(html).toContain('note-mention-nav-chip is-selected')
    expect(html).toContain('Enter link')
    expect(html).toContain('Cmd+Enter preview')
    expect(html).not.toContain('tabIndex')
  })

  it('renders compact one-line search results and empty state', () => {
    const html = renderToStaticMarkup(
      <NoteMentionMenu
        top={10}
        left={12}
        query="codex"
        activeRow="space"
        activeSearchIndex={0}
        modifierLabel="Ctrl"
        navigatorRows={[]}
        searchEntries={[
          {
            domainId: 'domain',
            spaceId: 'space',
            tabId: 'tab',
            subTabId: null,
            noteBodyId: 'body',
            domainName: 'Humble beginnings',
            spaceName: 'mySpace',
            parentName: 'codex',
            noteName: 'home',
            label: 'Humble beginnings > mySpace > codex > home',
            searchText: 'humble beginnings myspace codex home',
          },
        ]}
        {...handlers}
      />,
    )

    expect(html).toContain('aria-label="Note search"')
    expect(html).toContain('note-mention-result-card is-active')
    expect(html).toContain('note-mention-result-title')
    expect(html).toContain('>home</span>')
    expect(html).toContain('note-mention-result-breadcrumb')
    expect(html).toContain('Humble beginnings / mySpace / codex / home')
    expect(html).toContain('Ctrl+Enter preview')

    const emptyHtml = renderToStaticMarkup(
      <NoteMentionMenu
        top={10}
        left={12}
        query="missing"
        activeRow="space"
        activeSearchIndex={0}
        modifierLabel="Cmd"
        navigatorRows={[]}
        searchEntries={[]}
        {...handlers}
      />,
    )
    expect(emptyHtml).toContain('no matching notes')
  })
})
