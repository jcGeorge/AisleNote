import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  handleNoteMentionSearchAisleClick,
  handleNoteMentionSearchResultClick,
  handleNoteMentionSearchResultDoubleClick,
  handleNoteMentionSearchResultHover,
} from './note-mention-menu-events'
import {
  NoteMentionMenu,
} from './NoteMentionMenu'

const handlers = {
  onActiveRowChange: vi.fn(),
  onSelectNavigatorItem: vi.fn(),
  onSelectSearchResult: vi.fn(),
  onSelectSearchAisle: vi.fn(),
  onHighlightSearch: vi.fn(),
  onFocusAction: vi.fn(),
  onChooseAction: vi.fn(),
  onConfirmCopyAction: vi.fn(),
  onCancelCopyAction: vi.fn(),
  onChooseSearchEntry: vi.fn(),
  onChooseTarget: vi.fn(),
}

const menuStateProps = {
  searchFocusStage: 'typing' as const,
  keyboardFocusVisible: false,
  focusedAisleIndex: 0,
  focusedActionIndex: 0,
  focusedConfirmIndex: 0,
  pendingCopyAction: null,
}

const searchEntry = {
  domainId: 'domain',
  spaceId: 'space',
  tabId: 'tab',
  subTabId: 'sub',
  noteBodyId: 'body',
  domainName: 'Humble beginnings',
  spaceName: 'mySpace',
  parentName: 'codex',
  noteName: 'ref',
  label: 'Humble beginnings > mySpace > codex > ref',
  searchText: 'humble beginnings myspace codex ref',
}

const searchEntryDetails = [
  {
    key: 'domain:space:tab:sub',
    aisleCount: 2,
    contextChips: [
      { kind: 'domain' as const, label: 'Humble beginnings' },
      { kind: 'space' as const, label: 'mySpace' },
      { kind: 'parent' as const, label: 'codex' },
      { kind: 'note' as const, label: 'ref' },
    ],
  },
]

function createPointerEventStub() {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  }
}

describe('NoteMentionMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders four navigator rows with active and selected states', () => {
    const html = renderToStaticMarkup(
      <NoteMentionMenu
        top={10}
        left={12}
        query=""
        activeRow="space"
        activeSearchIndex={0}
        selectedSearchIndex={null}
        searchAisleItems={[]}
        selectedSearchAisleId=""
        searchEntries={[]}
        searchEntryDetails={[]}
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
        {...menuStateProps}
        {...handlers}
      />,
    )

    expect(html).toContain('aria-label="Note navigator"')
    expect(html).toContain('aria-label="domains"')
    expect(html).toContain('aria-label="spaces"')
    expect(html).toContain('aria-label="prime tabs"')
    expect(html).toContain('aria-label="notes"')
    expect(html).toContain('note-mention-nav-row is-domain-row')
    expect(html).toContain('note-mention-nav-row is-space-row is-active-row')
    expect(html).toContain('note-mention-nav-row is-tab-row')
    expect(html).toContain('note-mention-nav-row is-note-row')
    expect(html).not.toContain('note-mention-row-label')
    expect(html).not.toContain('>domains</button>')
    expect(html).not.toContain('>spaces</button>')
    expect(html).not.toContain('>prime tabs</button>')
    expect(html).not.toContain('>notes</button>')
    expect(html).toContain('rail-control note-mention-nav-chip is-selected')
    expect(html).toContain('note link')
    expect(html).toContain('note preview')
    expect(html).toContain('independent copy')
    expect(html).toContain('synced copy')
    expect(html).not.toContain('data-focused="true"')
    expect(html).not.toContain('make independent copy')
    expect(html).not.toContain('tabIndex')
  })

  it('shows navigator chip focus only after keyboard focus is engaged', () => {
    const baseProps = {
      top: 10,
      left: 12,
      query: '',
      activeRow: 'space' as const,
      activeSearchIndex: 0,
      selectedSearchIndex: null,
      searchAisleItems: [],
      selectedSearchAisleId: '',
      searchEntries: [],
      searchEntryDetails: [],
      navigatorRows: [
        { id: 'domain' as const, label: 'domains', selectedId: 'domain', items: [{ id: 'domain', label: 'Humble beginnings' }] },
        { id: 'space' as const, label: 'spaces', selectedId: 'space', items: [{ id: 'space', label: 'mySpace' }] },
      ],
    }
    const hiddenHtml = renderToStaticMarkup(
      <NoteMentionMenu {...baseProps} {...menuStateProps} {...handlers} />,
    )
    const visibleHtml = renderToStaticMarkup(
      <NoteMentionMenu {...baseProps} {...menuStateProps} keyboardFocusVisible {...handlers} />,
    )

    expect(hiddenHtml).not.toContain('data-focused="true"')
    expect(visibleHtml).toMatch(/is-space-row is-active-row[\s\S]*data-focused="true"[\s\S]*>mySpace<\/button>/)
    expect(visibleHtml).not.toMatch(/is-domain-row[\s\S]*data-focused="true"[\s\S]*>Humble beginnings<\/button>/)
  })

  it('renders compact one-line search results and empty state', () => {
    const html = renderToStaticMarkup(
      <NoteMentionMenu
        top={10}
        left={12}
        query="codex"
        activeRow="space"
        activeSearchIndex={0}
        selectedSearchIndex={null}
        searchAisleItems={[]}
        selectedSearchAisleId=""
        navigatorRows={[]}
        searchEntries={[{ ...searchEntry, subTabId: null, noteName: 'home', label: 'Humble beginnings > mySpace > codex > home' }]}
        searchEntryDetails={[{ ...searchEntryDetails[0], aisleCount: 1, contextChips: searchEntryDetails[0].contextChips.map((chip) => chip.kind === 'note' ? { ...chip, label: 'home' } : chip) }]}
        {...menuStateProps}
        {...handlers}
      />,
    )

    expect(html).toContain('aria-label="Note search"')
    expect(html).toContain('note-mention-result-card is-active')
    expect(html).toContain('note-mention-result-count')
    expect(html).toContain('note-mention-result-title')
    expect(html).toContain('>home</span>')
    expect(html).toContain('note-mention-result-context')
    expect(html).toContain('compact-domain-btn is-domain')
    expect(html).toContain('compact-space-btn is-space')
    expect(html).toContain('parent-tab-btn is-parent')
    expect(html).toContain('subtab-btn is-subtab')
    expect(html).not.toContain('note-mention-result-breadcrumb')
    expect(html).not.toContain('Humble beginnings / mySpace / codex / home')
    expect(html).toContain('note preview')
    expect(html).toContain('independent copy')
    expect(html).toContain('synced copy')
    expect(html).not.toContain('data-focused="true"')
    expect(html).not.toContain('make independent copy')

    const emptyHtml = renderToStaticMarkup(
      <NoteMentionMenu
        top={10}
        left={12}
        query="missing"
        activeRow="space"
        activeSearchIndex={0}
        selectedSearchIndex={null}
        searchAisleItems={[]}
        selectedSearchAisleId=""
        navigatorRows={[]}
        searchEntries={[]}
        searchEntryDetails={[]}
        {...menuStateProps}
        {...handlers}
      />,
    )
    expect(emptyHtml).toContain('no matching notes')
    expect(emptyHtml).not.toContain('note-mention-preview')
  })

  it('renders the selected aisle preview with shared aisle markdown rendering', () => {
    const html = renderToStaticMarkup(
      <NoteMentionMenu
        top={10}
        left={12}
        query=""
        activeRow="aisle"
        activeSearchIndex={0}
        selectedSearchIndex={null}
        searchAisleItems={[]}
        selectedSearchAisleId=""
        searchEntries={[]}
        searchEntryDetails={[]}
        preview={{
          aisleId: 'aisle-2',
          markdown: '# Selected aisle\n\nsecond aisle only',
          targetLabel: 'Humble beginnings > mySpace > codex > ref',
        }}
        previewLayout="left"
        selectorHeight={216}
        navigatorRows={[
          { id: 'domain', label: 'domains', selectedId: 'domain', items: [{ id: 'domain', label: 'Humble beginnings' }] },
          { id: 'space', label: 'spaces', selectedId: 'space', items: [{ id: 'space', label: 'mySpace' }] },
          { id: 'tab', label: 'prime tabs', selectedId: 'tab', items: [{ id: 'tab', label: 'codex' }] },
          {
            id: 'note',
            label: 'notes',
            selectedId: 'sub',
            items: [{ id: 'sub', label: 'ref', target: { domainId: 'domain', spaceId: 'space', tabId: 'tab', subTabId: 'sub' } }],
          },
          {
            id: 'aisle',
            label: 'aisles',
            selectedId: 'aisle-2',
            items: [
              { id: 'aisle-1', label: 'aisle 1', target: { domainId: 'domain', spaceId: 'space', tabId: 'tab', subTabId: 'sub', aisleIds: ['aisle-1'] } },
              { id: 'aisle-2', label: 'aisle 2', target: { domainId: 'domain', spaceId: 'space', tabId: 'tab', subTabId: 'sub', aisleIds: ['aisle-2'] } },
            ],
          },
        ]}
        {...menuStateProps}
        {...handlers}
      />,
    )

    expect(html).toContain('note-mention-popover is-navigator has-preview is-preview-left')
    expect(html).toContain('aria-label="Aisle preview for Humble beginnings &gt; mySpace &gt; codex &gt; ref"')
    expect(html).toContain('style="height:216px"')
    expect(html).toContain('aisle-edit-preview note-mention-preview-body')
    expect(html).toContain('<h1>Selected aisle</h1>')
    expect(html).toContain('second aisle only')
    expect(html).not.toContain('first aisle')
  })

  it('renders typed search previews to the left of the selector', () => {
    const html = renderToStaticMarkup(
      <NoteMentionMenu
        top={10}
        left={12}
        query="ref"
        activeRow="space"
        activeSearchIndex={0}
        selectedSearchIndex={0}
        searchAisleItems={[]}
        selectedSearchAisleId=""
        navigatorRows={[]}
        searchEntries={[searchEntry]}
        searchEntryDetails={searchEntryDetails}
        preview={{ aisleId: 'aisle-1', markdown: 'search preview text', targetLabel: searchEntry.label }}
        previewLayout="left"
        selectorHeight={180}
        {...menuStateProps}
        {...handlers}
      />,
    )

    expect(html).toContain('note-mention-popover is-search has-preview is-preview-left')
    expect(html).toContain('style="height:180px"')
    expect(html).toContain('search preview text')
  })

  it('renders aisle selection for navigator and search targets', () => {
    const target = { domainId: 'domain', spaceId: 'space', tabId: 'tab', subTabId: 'sub', aisleIds: ['aisle-2'] }
    const navigatorHtml = renderToStaticMarkup(
      <NoteMentionMenu
        top={10}
        left={12}
        query=""
        activeRow="aisle"
        activeSearchIndex={0}
        selectedSearchIndex={null}
        searchAisleItems={[]}
        selectedSearchAisleId=""
        searchEntries={[]}
        searchEntryDetails={[]}
        navigatorRows={[
          { id: 'domain', label: 'domains', selectedId: 'domain', items: [{ id: 'domain', label: 'Humble beginnings' }] },
          { id: 'space', label: 'spaces', selectedId: 'space', items: [{ id: 'space', label: 'mySpace' }] },
          { id: 'tab', label: 'prime tabs', selectedId: 'tab', items: [{ id: 'tab', label: 'codex' }] },
          {
            id: 'note',
            label: 'notes',
            selectedId: 'sub',
            items: [{ id: 'sub', label: 'ref', target: { domainId: 'domain', spaceId: 'space', tabId: 'tab', subTabId: 'sub' } }],
          },
          {
            id: 'aisle',
            label: 'aisles',
            selectedId: 'aisle-2',
            items: [
              { id: 'aisle-1', label: 'aisle 1', target: { ...target, aisleIds: ['aisle-1'] } },
              { id: 'aisle-2', label: 'aisle 2', target },
            ],
          },
        ]}
        {...menuStateProps}
        {...handlers}
      />,
    )

    expect(navigatorHtml).toContain('aria-label="aisles"')
    expect(navigatorHtml).toContain('note-mention-nav-row is-aisle-row is-active-row')
    expect(navigatorHtml).toContain('>aisle 2</button>')

    const searchHtml = renderToStaticMarkup(
      <NoteMentionMenu
        top={10}
        left={12}
        query="ref"
        activeRow="space"
        activeSearchIndex={0}
        selectedSearchIndex={0}
        searchAisleItems={[
          { id: 'aisle-1', label: 'aisle 1', target: { ...target, aisleIds: ['aisle-1'] } },
          { id: 'aisle-2', label: 'aisle 2', target },
        ]}
        selectedSearchAisleId="aisle-2"
        navigatorRows={[]}
        searchEntries={[searchEntry]}
        searchEntryDetails={searchEntryDetails}
        {...menuStateProps}
        {...handlers}
      />,
    )

    expect(searchHtml).toContain('aria-label="aisles"')
    expect(searchHtml).toContain('aria-selected="true"')
    expect(searchHtml).toContain('rail-control note-mention-nav-chip is-selected')
    expect(searchHtml).toContain('>aisle 2</button>')
  })

  it('shows search result, aisle, and action focus only for the active keyboard stage', () => {
    const resultHtml = renderToStaticMarkup(
      <NoteMentionMenu
        top={10}
        left={12}
        query="ref"
        activeRow="space"
        activeSearchIndex={0}
        selectedSearchIndex={null}
        searchAisleItems={[]}
        selectedSearchAisleId=""
        searchFocusStage="results"
        keyboardFocusVisible
        focusedAisleIndex={0}
        focusedActionIndex={0}
        focusedConfirmIndex={0}
        pendingCopyAction={null}
        navigatorRows={[]}
        searchEntries={[searchEntry]}
        searchEntryDetails={searchEntryDetails}
        {...handlers}
      />,
    )

    expect(resultHtml).toMatch(/note-mention-result-card is-active" data-focused="true"/)
    expect(resultHtml).not.toContain('note-mention-action-btn is-focused')

    const aisleHtml = renderToStaticMarkup(
      <NoteMentionMenu
        top={10}
        left={12}
        query="ref"
        activeRow="space"
        activeSearchIndex={0}
        selectedSearchIndex={0}
        searchAisleItems={[
          { id: 'aisle-1', label: 'aisle 1', target: { domainId: 'domain', spaceId: 'space', tabId: 'tab', subTabId: 'sub', aisleIds: ['aisle-1'] } },
          { id: 'aisle-2', label: 'aisle 2', target: { domainId: 'domain', spaceId: 'space', tabId: 'tab', subTabId: 'sub', aisleIds: ['aisle-2'] } },
        ]}
        selectedSearchAisleId="aisle-2"
        searchFocusStage="aisles"
        keyboardFocusVisible
        focusedAisleIndex={1}
        focusedActionIndex={0}
        focusedConfirmIndex={0}
        pendingCopyAction={null}
        navigatorRows={[]}
        searchEntries={[searchEntry]}
        searchEntryDetails={searchEntryDetails}
        {...handlers}
      />,
    )

    expect(aisleHtml).toMatch(/data-focused="true"[\s\S]*>aisle 2<\/button>/)
    expect(aisleHtml).not.toMatch(/data-focused="true"[\s\S]*>aisle 1<\/button>/)

    const actionHtml = renderToStaticMarkup(
      <NoteMentionMenu
        top={10}
        left={12}
        query="ref"
        activeRow="space"
        activeSearchIndex={0}
        selectedSearchIndex={0}
        searchAisleItems={[]}
        selectedSearchAisleId=""
        searchFocusStage="actions"
        keyboardFocusVisible
        focusedAisleIndex={0}
        focusedActionIndex={2}
        focusedConfirmIndex={0}
        pendingCopyAction={null}
        navigatorRows={[]}
        searchEntries={[searchEntry]}
        searchEntryDetails={searchEntryDetails}
        {...handlers}
      />,
    )

    expect(actionHtml).toMatch(/data-focused="true"[\s\S]*>independent copy<\/button>/)
    expect(actionHtml).not.toMatch(/data-focused="true"[\s\S]*>note link<\/button>/)
  })

  it('renders copy confirmation controls inside typed search actions', () => {
    const html = renderToStaticMarkup(
      <NoteMentionMenu
        top={10}
        left={12}
        query="ref"
        activeRow="space"
        activeSearchIndex={0}
        selectedSearchIndex={0}
        searchAisleItems={[]}
        selectedSearchAisleId=""
        searchFocusStage="copy-confirm"
        keyboardFocusVisible
        focusedAisleIndex={0}
        focusedActionIndex={2}
        focusedConfirmIndex={1}
        pendingCopyAction="independent-copy"
        navigatorRows={[]}
        searchEntries={[searchEntry]}
        searchEntryDetails={searchEntryDetails}
        {...handlers}
      />,
    )

    expect(html).toContain('this operation will replace this aisle')
    expect(html).toContain('>proceed</button>')
    expect(html).toContain('>nevermind</button>')
    expect(html).toContain('is-pending-copy')
    expect(html).toMatch(/data-focused="true"[\s\S]*>nevermind<\/button>/)
  })

  it('inserts search result links only on double click', () => {
    const doubleClickEvent = createPointerEventStub()
    handleNoteMentionSearchResultDoubleClick(doubleClickEvent, searchEntry, handlers.onChooseSearchEntry)

    expect(doubleClickEvent.preventDefault).toHaveBeenCalledTimes(1)
    expect(doubleClickEvent.stopPropagation).toHaveBeenCalledTimes(1)
    expect(handlers.onChooseSearchEntry).toHaveBeenCalledWith(searchEntry, 'link')
  })

  it('selects search results on click without inserting', () => {
    const clickEvent = createPointerEventStub()

    handleNoteMentionSearchResultClick(clickEvent, 2, handlers.onSelectSearchResult)

    expect(clickEvent.preventDefault).toHaveBeenCalledTimes(1)
    expect(clickEvent.stopPropagation).toHaveBeenCalledTimes(1)
    expect(handlers.onSelectSearchResult).toHaveBeenCalledWith(2)
    expect(handlers.onChooseSearchEntry).not.toHaveBeenCalled()
  })

  it('keeps search hover and aisle click selection behavior', () => {
    const aisleClickEvent = createPointerEventStub()

    handleNoteMentionSearchResultHover(1, handlers.onHighlightSearch)
    handleNoteMentionSearchAisleClick(aisleClickEvent, 'aisle-2', handlers.onSelectSearchAisle)

    expect(handlers.onHighlightSearch).toHaveBeenCalledWith(1)
    expect(aisleClickEvent.preventDefault).toHaveBeenCalledTimes(1)
    expect(aisleClickEvent.stopPropagation).toHaveBeenCalledTimes(1)
    expect(handlers.onSelectSearchAisle).toHaveBeenCalledWith('aisle-2')
  })
})
