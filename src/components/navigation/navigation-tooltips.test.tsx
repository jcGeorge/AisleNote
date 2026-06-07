import { createRef, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ArrangeModeState, MessagesSection, SettingsSection, Tab, TrashParentBucket, ViewMode, WorkspaceData } from '../../types/app'
import type { DiagnosticLogDisplayLimit, DiagnosticLogLevelFilter, DiagnosticLogMode } from '../../diagnostics/diagnostic-log'
import { SubTabRail } from './SubTabRail'
import { TopBar } from './TopBar'

const activeTab: Tab = {
  id: 'tab-1',
  title: 'Alpha',
  noteBodyId: 'body-1',
  activeSubTabId: 'sub-1',
  subTabs: [
    { id: 'sub-1', title: 'Sub', noteBodyId: 'body-sub-1' },
    { id: 'sub-2', title: 'Sub Two', noteBodyId: 'body-sub-2' },
    { id: 'sub-3', title: 'Sub Three', noteBodyId: 'body-sub-3' },
  ],
}

const workspace: WorkspaceData = {
  activeTabId: activeTab.id,
  tabs: [
    activeTab,
    { ...activeTab, id: 'tab-2', title: 'Beta', noteBodyId: 'body-2', activeSubTabId: 'sub-4', subTabs: [] },
    { ...activeTab, id: 'tab-3', title: 'Gamma', noteBodyId: 'body-3', activeSubTabId: 'sub-5', subTabs: [] },
  ],
  deletedTabs: [],
  deletedSubTabs: [],
}

const arrangeMode: ArrangeModeState = {
  active: true,
  scope: 'tabs',
  source: 'context',
  dragItem: null,
  overParentTabId: null,
  overParentInsert: null,
  overSubTabId: null,
  overSubTabInsert: null,
  overSpaceId: null,
  overSpaceInsert: null,
  overDomainId: null,
  overDomainInsert: null,
}

const noop = () => undefined

type TestElement = ReactElement<Record<string, unknown> & { children?: ReactNode }>
type TestHandler = (event: Record<string, unknown>) => void
type TopBarTestCallbacks = Partial<
  Pick<
    Parameters<typeof TopBar>[0],
    'onBeginEdit' | 'onExitArrangeMode' | 'onOpenContextMenuForTab' | 'onStartArrangeDragSeed'
  >
>
type SubTabRailTestCallbacks = Partial<
  Pick<
    Parameters<typeof SubTabRail>[0],
    | 'onBeginEdit'
    | 'onExitArrangeMode'
    | 'onOpenContextMenuForHomeTab'
    | 'onOpenContextMenuForSubTab'
    | 'onStartArrangeDragSeed'
  >
>

function findElementByProp(node: ReactNode, propName: string, propValue: unknown): TestElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findElementByProp(child, propName, propValue)
      if (match) return match
    }
    return null
  }
  if (!isValidElement(node)) return null
  const element = node as TestElement
  if (element.props[propName] === propValue) return element
  return findElementByProp(element.props.children, propName, propValue)
}

function renderFunctionComponent<P>(element: ReactElement<P>): ReactNode {
  return (element.type as (props: P) => ReactNode)(element.props)
}

function createTopBarElement(
  tooltipsDisabled: boolean,
  arrangeModeOverride: Partial<ArrangeModeState> = {},
  arrangeControlsDisabled = false,
  options: {
    viewMode?: ViewMode
    settingsSection?: SettingsSection
    messagesSection?: MessagesSection
    messagesCount?: number
    toastHistoryCount?: number
    diagnosticLogCount?: number
    diagnosticLevelFilter?: DiagnosticLogLevelFilter
    diagnosticDisplayLimit?: DiagnosticLogDisplayLimit
    diagnosticMode?: DiagnosticLogMode
    tagFilterActive?: boolean
  } = {},
  callbacks: TopBarTestCallbacks = {},
) {
  const viewMode = options.viewMode ?? 'main'
  return (
    <TopBar
      viewMode={viewMode}
      workspace={workspace}
      activeTab={activeTab}
      editing={null}
      arrangeMode={{ ...arrangeMode, ...arrangeModeOverride }}
      tooltipsDisabled={tooltipsDisabled}
      tagFilterActive={options.tagFilterActive}
      settingsSection={options.settingsSection ?? 'hotkeys'}
      primaryTabRailRef={createRef<HTMLDivElement>()}
      isNoteWorkspaceView={viewMode === 'main'}
      arrangeableParentTabClassName="is-arrangeable"
      arrangeControlsDisabled={arrangeControlsDisabled}
      draggingParentTabId={null}
      draggingSubTabId={null}
      arrangeTrashDropRef={createRef<HTMLButtonElement>()}
      isArrangeTrashDropTarget={false}
      trashParentTabs={[]}
      trashTabId=""
      menuOpen={false}
      spaceRailVisible={false}
      domainRailVisible={false}
      onAutoSizeRenameInput={noop}
      onShouldSkipRenameBlur={() => false}
      onCommitRename={noop}
      onCancelRename={noop}
      onRenameDraftChange={noop}
      onClearRenameDraft={noop}
      arrangeSelectedParentIds={new Set()}
      onHandleArrangeParentSelectionClick={() => false}
      onClearArrangeSelection={noop}
      onConsumeArrangeClickSuppression={() => false}
      onSelectTab={noop}
      onBeginEdit={callbacks.onBeginEdit ?? noop}
      onOpenContextMenuForTab={callbacks.onOpenContextMenuForTab ?? noop}
      onStartArrangeDragSeed={callbacks.onStartArrangeDragSeed ?? noop}
      onStartArrangeTapCandidate={noop}
      onStartArrangePress={noop}
      onHandleArrangeTabPointerMove={noop}
      onHandleArrangeTabPointerUp={noop}
      onClearArrangePressTimer={noop}
      onCancelArrangeTabPointerDrag={noop}
      onSetTrashTabId={noop}
      onSetTrashSubTabId={noop}
      onOpenContextMenuForTrashTab={noop}
      onAddTab={noop}
      onOpenParentSortModal={vi.fn()}
      onExitArrangeMode={callbacks.onExitArrangeMode ?? noop}
      onAdvanceArrangeHierarchyReveal={noop}
      onCloseSettingsView={noop}
      onSetMenuOpen={noop}
      onToggleSpaceRail={noop}
      onToggleDomainRail={noop}
      onToggleTrash={noop}
      onOpenMessages={noop}
      onOpenSettings={noop}
      onOpenAbout={noop}
      onOpenFilter={noop}
      onSettingsSectionChange={noop}
      messagesSection={options.messagesSection}
      messagesCount={options.messagesCount ?? 0}
      toastHistoryCount={options.toastHistoryCount ?? 0}
      diagnosticLogCount={options.diagnosticLogCount ?? 0}
      diagnosticLevelFilter={options.diagnosticLevelFilter}
      diagnosticDisplayLimit={options.diagnosticDisplayLimit}
      diagnosticMode={options.diagnosticMode}
      onMessagesSectionChange={noop}
    />
  )
}

function renderTopBar(
  tooltipsDisabled: boolean,
  arrangeModeOverride: Partial<ArrangeModeState> = {},
  arrangeControlsDisabled = false,
  options: {
    viewMode?: ViewMode
    settingsSection?: SettingsSection
    messagesSection?: MessagesSection
    messagesCount?: number
    toastHistoryCount?: number
    diagnosticLogCount?: number
    diagnosticLevelFilter?: DiagnosticLogLevelFilter
    diagnosticDisplayLimit?: DiagnosticLogDisplayLimit
    diagnosticMode?: DiagnosticLogMode
  } = {},
) {
  return renderToStaticMarkup(createTopBarElement(tooltipsDisabled, arrangeModeOverride, arrangeControlsDisabled, options))
}

function createSubTabRailElement(
  tooltipsDisabled: boolean,
  arrangeModeOverride: Partial<ArrangeModeState> = {},
  arrangeControlsDisabled = false,
  callbacks: SubTabRailTestCallbacks = {},
  options: {
    viewMode?: ViewMode
    showNoteWorkspaceTabs?: boolean
    showHomeTab?: boolean
    isNoteWorkspaceView?: boolean
    tagFilterActive?: boolean
    scratchpadActive?: boolean
    scratchpadTagCountLabel?: string
    selectedTrashTab?: TrashParentBucket | null
    trashSubTabs?: TrashParentBucket['subTabs']
    selectedTrashSubTabId?: string | null
  } = {},
) {
  return (
    <SubTabRail
      viewMode={options.viewMode ?? 'main'}
      activeTab={activeTab}
      activeSubTabId="sub-1"
      editing={null}
      arrangeMode={{ ...arrangeMode, ...arrangeModeOverride }}
      tooltipsDisabled={tooltipsDisabled}
      tagFilterActive={options.tagFilterActive}
      showNoteWorkspaceTabs={options.showNoteWorkspaceTabs}
      showHomeTab={options.showHomeTab}
      isNoteWorkspaceView={options.isNoteWorkspaceView ?? true}
      selectedTrashTab={options.selectedTrashTab ?? null}
      trashSubTabs={options.trashSubTabs ?? []}
      selectedTrashSubTabId={options.selectedTrashSubTabId ?? null}
      subTabRailRef={createRef<HTMLDivElement>()}
      arrangeableSubTabClassName="is-arrangeable"
      arrangeControlsDisabled={arrangeControlsDisabled}
      draggingSubTabId={null}
      onAutoSizeRenameInput={noop}
      onShouldSkipRenameBlur={() => false}
      onCommitRename={noop}
      onCancelRename={noop}
      onRenameDraftChange={noop}
      onClearRenameDraft={noop}
      arrangeSelectedSubTabIds={new Set()}
      onHandleArrangeSubTabSelectionClick={() => false}
      onClearArrangeSelection={noop}
      onConsumeArrangeClickSuppression={() => false}
      onSelectParentHomeTab={noop}
      onSelectSubTab={noop}
      onBeginEdit={callbacks.onBeginEdit ?? noop}
      onOpenContextMenuForHomeTab={callbacks.onOpenContextMenuForHomeTab ?? noop}
      onOpenContextMenuForSubTab={callbacks.onOpenContextMenuForSubTab ?? noop}
      onExitArrangeMode={callbacks.onExitArrangeMode ?? noop}
      onStartArrangeDragSeed={callbacks.onStartArrangeDragSeed ?? noop}
      onStartArrangeTapCandidate={noop}
      onStartArrangePress={noop}
      onFinalizeArrangeTapCandidate={noop}
      onHandleArrangeTabPointerMove={noop}
      onHandleArrangeTabPointerUp={noop}
      onClearArrangePressTimer={noop}
      onClearArrangeTapCandidate={noop}
      onCancelArrangeTabPointerDrag={noop}
      onSetTrashSubTabId={noop}
      onOpenContextMenuForTrashSubTab={noop}
      onAddSubTab={noop}
      onOpenSubTabSortModal={vi.fn()}
      scratchpadActive={options.scratchpadActive}
      scratchpadTagCountLabel={options.scratchpadTagCountLabel}
    />
  )
}

function renderSubTabRail(
  tooltipsDisabled: boolean,
  arrangeModeOverride: Partial<ArrangeModeState> = {},
  arrangeControlsDisabled = false,
) {
  return renderToStaticMarkup(createSubTabRailElement(tooltipsDisabled, arrangeModeOverride, arrangeControlsDisabled))
}

describe('navigation arrange tooltips', () => {
  it('keeps parent sort labels while omitting app tooltips when disabled', () => {
    const enabledHtml = renderTopBar(false)
    const disabledHtml = renderTopBar(true)

    expect(enabledHtml).toContain('data-app-tooltip="sort parents"')
    expect(enabledHtml).toContain('app-icon-filter')
    expect(enabledHtml).toContain('data-app-icon="filter"')
    expect(disabledHtml).not.toContain('data-app-tooltip="sort parents"')
    expect(disabledHtml).toContain('aria-label="sort parents"')
    expect(enabledHtml.indexOf('Alpha')).toBeLessThan(enabledHtml.indexOf('aria-label="sort parents"'))
  })

  it('renders settings section buttons in the primary rail', () => {
    const html = renderTopBar(false, { active: false }, false, {
      viewMode: 'settings',
      settingsSection: 'toolbar',
    })

    expect(html).toContain('aria-label="settings sections"')
    expect(html.indexOf('>data</button>')).toBeLessThan(html.indexOf('>frontmatter</button>'))
    expect(html.indexOf('>frontmatter</button>')).toBeLessThan(html.indexOf('>hotkeys</button>'))
    expect(html.indexOf('>tips</button>')).toBeLessThan(html.indexOf('>toolbar</button>'))
    expect(html.indexOf('>toolbar</button>')).toBeLessThan(html.indexOf('>visuals</button>'))
    expect(html).toContain('aria-selected="true" class="btn btn-sm btn-primary tab-btn parent-tab-btn settings-section-rail-btn">toolbar</button>')
    expect(html).toMatch(/topbar-context-btn[^"]*">settings<\/button>/)
  })

  it('renders messages and about as selected utility rail buttons', () => {
    const messagesHtml = renderTopBar(false, { active: false }, false, {
      viewMode: 'messages',
      messagesCount: 2,
      toastHistoryCount: 3,
    })
    const toastHistoryHtml = renderTopBar(false, { active: false }, false, {
      viewMode: 'messages',
      messagesSection: 'toast-history',
      messagesCount: 2,
      toastHistoryCount: 3,
      diagnosticLogCount: 4,
    })
    const diagnosticsHtml = renderTopBar(false, { active: false }, false, {
      viewMode: 'messages',
      messagesSection: 'diagnostics',
      messagesCount: 2,
      toastHistoryCount: 3,
      diagnosticLogCount: 4,
      diagnosticLevelFilter: 'warning',
      diagnosticDisplayLimit: 1000,
      diagnosticMode: 'all',
    })
    const aboutHtml = renderTopBar(false, { active: false }, false, { viewMode: 'about' })

    expect(messagesHtml).toContain('aria-label="utility pages"')
    expect(messagesHtml).toContain('aria-selected="true" class="btn btn-sm btn-primary tab-btn parent-tab-btn utility-view-rail-btn">inbox (2)</button>')
    expect(messagesHtml).toContain('aria-selected="false" class="btn btn-sm btn-outline-secondary tab-btn parent-tab-btn utility-view-rail-btn">toast history (3)</button>')
    expect(messagesHtml).toContain('aria-selected="false" class="btn btn-sm btn-outline-secondary tab-btn parent-tab-btn utility-view-rail-btn">diagnostics</button>')
    expect(toastHistoryHtml).toContain('aria-selected="false" class="btn btn-sm btn-outline-secondary tab-btn parent-tab-btn utility-view-rail-btn">inbox (2)</button>')
    expect(toastHistoryHtml).toContain('aria-selected="true" class="btn btn-sm btn-primary tab-btn parent-tab-btn utility-view-rail-btn">toast history (3)</button>')
    expect(toastHistoryHtml).toContain('aria-selected="false" class="btn btn-sm btn-outline-secondary tab-btn parent-tab-btn utility-view-rail-btn">diagnostics (4)</button>')
    expect(diagnosticsHtml).toContain('aria-selected="true" class="btn btn-sm btn-primary tab-btn parent-tab-btn utility-view-rail-btn">diagnostics (4)</button>')
    expect(diagnosticsHtml).toContain('aria-label="diagnostic filters"')
    expect(diagnosticsHtml).toContain('aria-label="diagnostic mode"')
    expect(diagnosticsHtml).toContain('<option value="all" selected="">all logs</option>')
    expect(diagnosticsHtml).toContain('aria-label="diagnostic message type"')
    expect(diagnosticsHtml).toContain('<option value="warning" selected="">warning</option>')
    expect(diagnosticsHtml).toContain('aria-label="diagnostic message count"')
    expect(diagnosticsHtml).toContain('<option value="1000" selected="">1,000</option>')
    expect(messagesHtml).toMatch(/topbar-context-btn[^"]*">messages \(2\)<\/button>/)
    expect(aboutHtml).toContain('aria-selected="true" class="btn btn-sm btn-primary tab-btn parent-tab-btn utility-view-rail-btn">about</button>')
    expect(aboutHtml).toMatch(/topbar-context-btn[^"]*">about<\/button>/)
  })

  it('keeps parent and sub-tab sort controls visible while arranging spaces or domains', () => {
    expect(renderTopBar(true, { scope: 'spaces', dragItem: { type: 'space', spaceId: 'space-a' } })).toContain(
      'aria-label="sort parents"',
    )
    expect(renderTopBar(true, { scope: 'domains', dragItem: { type: 'domain', domainId: 'domain-a' } })).toContain(
      'aria-label="sort parents"',
    )
    expect(renderSubTabRail(true, { scope: 'spaces', dragItem: { type: 'space', spaceId: 'space-a' } })).toContain(
      'aria-label="sort sub-tabs"',
    )
    expect(renderSubTabRail(true, { scope: 'domains', dragItem: { type: 'domain', domainId: 'domain-a' } })).toContain(
      'aria-label="sort sub-tabs"',
    )
  })

  it('keeps parent and sub-tab sort controls visible but disabled during guided carry', () => {
    const parentHtml = renderTopBar(true, {}, true)
    const subTabHtml = renderSubTabRail(true, {}, true)

    expect(parentHtml).toContain('aria-label="sort parents"')
    expect(parentHtml).toContain('disabled=""')
    expect(subTabHtml).toContain('aria-label="sort sub-tabs"')
    expect(subTabHtml).toContain('disabled=""')
  })

  it('renders dual-sided parent and sub-tab placement cues while arranging', () => {
    const parentHtml = renderTopBar(true, {
      dragItem: { type: 'tab', tabId: 'tab-3' },
      overParentTabId: 'tab-2',
      overParentInsert: 'before',
    })
    const subTabHtml = renderSubTabRail(true, {
      dragItem: { type: 'subtab', parentTabId: activeTab.id, subTabId: 'sub-3' },
      overSubTabId: 'sub-2',
      overSubTabInsert: 'before',
    })

    expect(parentHtml).toContain('is-arrange-neighbor-after')
    expect(parentHtml).toContain('is-arrange-target-before')
    expect(subTabHtml).toContain('is-arrange-neighbor-after')
    expect(subTabHtml).toContain('is-arrange-target-before')
  })

  it('cancels active arrangement before opening parent and sub-tab context menus', () => {
    const parentCalls: string[] = []
    const subTabCalls: string[] = []
    const onExitParentArrangeMode = vi.fn(() => parentCalls.push('cancel'))
    const onExitSubTabArrangeMode = vi.fn(() => subTabCalls.push('cancel'))
    const onOpenContextMenuForTab = vi.fn(() => parentCalls.push('menu'))
    const onOpenContextMenuForSubTab = vi.fn(() => subTabCalls.push('menu'))
    const onStartParentArrangeDragSeed = vi.fn()
    const onStartSubTabArrangeDragSeed = vi.fn()
    const topBarTree = renderFunctionComponent(
      createTopBarElement(true, {}, false, {}, {
        onExitArrangeMode: onExitParentArrangeMode,
        onOpenContextMenuForTab,
        onStartArrangeDragSeed: onStartParentArrangeDragSeed,
      }),
    )
    const subTabRailTree = renderFunctionComponent(
      createSubTabRailElement(true, {}, false, {
        onExitArrangeMode: onExitSubTabArrangeMode,
        onOpenContextMenuForSubTab,
        onStartArrangeDragSeed: onStartSubTabArrangeDragSeed,
      }),
    )
    const parentButton = findElementByProp(topBarTree, 'aria-selected', true)
    const subTabButton = findElementByProp(subTabRailTree, 'aria-selected', true)

    expect(parentButton).not.toBeNull()
    expect(subTabButton).not.toBeNull()
    ;(parentButton?.props.onPointerDown as TestHandler)({ button: 2 })
    ;(subTabButton?.props.onPointerDown as TestHandler)({ button: 2 })
    ;(parentButton?.props.onContextMenu as TestHandler)({})
    ;(subTabButton?.props.onContextMenu as TestHandler)({})

    expect(parentCalls).toEqual(['cancel', 'menu'])
    expect(subTabCalls).toEqual(['cancel', 'menu'])
    expect(onOpenContextMenuForTab).toHaveBeenCalledWith(expect.anything(), activeTab.id, { force: true })
    expect(onOpenContextMenuForSubTab).toHaveBeenCalledWith(expect.anything(), activeTab.id, 'sub-1', { force: true })
    expect(onStartParentArrangeDragSeed).not.toHaveBeenCalled()
    expect(onStartSubTabArrangeDragSeed).not.toHaveBeenCalled()
  })

  it('keeps parent and sub-tab context menus unchanged when arrangement is inactive', () => {
    const onExitArrangeMode = vi.fn()
    const onOpenContextMenuForTab = vi.fn()
    const onOpenContextMenuForSubTab = vi.fn()
    const topBarTree = renderFunctionComponent(
      createTopBarElement(false, { active: false }, false, {}, { onExitArrangeMode, onOpenContextMenuForTab }),
    )
    const subTabRailTree = renderFunctionComponent(
      createSubTabRailElement(false, { active: false }, false, { onExitArrangeMode, onOpenContextMenuForSubTab }),
    )
    const parentButton = findElementByProp(topBarTree, 'aria-selected', true)
    const subTabButton = findElementByProp(subTabRailTree, 'aria-selected', true)

    expect(parentButton).not.toBeNull()
    expect(subTabButton).not.toBeNull()
    ;(parentButton?.props.onContextMenu as TestHandler)({})
    ;(subTabButton?.props.onContextMenu as TestHandler)({})

    expect(onExitArrangeMode).not.toHaveBeenCalled()
    expect(onOpenContextMenuForTab).toHaveBeenCalledWith(expect.anything(), activeTab.id, undefined)
    expect(onOpenContextMenuForSubTab).toHaveBeenCalledWith(expect.anything(), activeTab.id, 'sub-1', undefined)
  })

  it('keeps sub-tab sort labels while omitting app tooltips when disabled', () => {
    const enabledHtml = renderSubTabRail(false)
    const disabledHtml = renderSubTabRail(true)

    expect(enabledHtml).toContain('data-app-tooltip="sort sub-tabs"')
    expect(enabledHtml).toContain('app-icon-filter')
    expect(enabledHtml).toContain('data-app-icon="filter"')
    expect(enabledHtml).not.toContain('data-app-tooltip="home note"')
    expect(disabledHtml).not.toContain('data-app-tooltip="sort sub-tabs"')
    expect(disabledHtml).not.toContain('data-app-tooltip="home note"')
    expect(disabledHtml).toContain('aria-label="sort sub-tabs"')
    expect(enabledHtml.indexOf('Sub')).toBeLessThan(enabledHtml.indexOf('aria-label="sort sub-tabs"'))
  })

  it('blocks parent and sub-tab double-click rename while filtering', () => {
    const onBeginParentEdit = vi.fn()
    const onBeginSubTabEdit = vi.fn()
    const parentTree = renderFunctionComponent(
      createTopBarElement(false, { active: false }, false, { tagFilterActive: true }, { onBeginEdit: onBeginParentEdit }),
    )
    const subTabTree = renderFunctionComponent(
      createSubTabRailElement(false, { active: false }, false, { onBeginEdit: onBeginSubTabEdit }, { tagFilterActive: true }),
    )
    const parentButton = findElementByProp(parentTree, 'aria-selected', true)
    const subTabButton = findElementByProp(subTabTree, 'aria-selected', true)

    expect(parentButton).not.toBeNull()
    expect(subTabButton).not.toBeNull()
    ;(parentButton?.props.onDoubleClick as TestHandler)({})
    ;(subTabButton?.props.onDoubleClick as TestHandler)({})

    expect(onBeginParentEdit).not.toHaveBeenCalled()
    expect(onBeginSubTabEdit).not.toHaveBeenCalled()
  })

  it('can hide the home button independently while keeping live sub-tabs', () => {
    const html = renderToStaticMarkup(
      createSubTabRailElement(false, { active: false }, false, {}, {
        showHomeTab: false,
      }),
    )

    expect(html).not.toContain('home-subtab-btn')
    expect(html).toContain('data-arrange-subtab-id="sub-1"')
    expect(html).toContain('aria-label="scratchpad"')
  })

  it('shows trash home only when the deleted parent home is in trash', () => {
    const deletedParent: TrashParentBucket = {
      id: 'deleted-parent-entry',
      title: 'Deleted Parent',
      source: 'deleted-tab',
      deletedTabEntryId: 'deleted-parent-entry',
      parentTabId: 'deleted-parent',
      homeContent: 'deleted parent home',
      subTabs: [{ id: 'deleted-sub-entry', title: 'Deleted Sub', noteBodyId: 'body-sub', content: 'deleted sub' }],
    }
    const subtabOnlyParent: TrashParentBucket = {
      ...deletedParent,
      id: 'subtabs-only-parent',
      source: 'subtabs-only',
      deletedTabEntryId: null,
      homeContent: '',
    }

    const deletedParentHtml = renderToStaticMarkup(
      createSubTabRailElement(false, { active: false }, false, {}, {
        viewMode: 'trash',
        isNoteWorkspaceView: false,
        selectedTrashTab: deletedParent,
        trashSubTabs: deletedParent.subTabs,
        selectedTrashSubTabId: null,
      }),
    )
    const subtabOnlyHtml = renderToStaticMarkup(
      createSubTabRailElement(false, { active: false }, false, {}, {
        viewMode: 'trash',
        isNoteWorkspaceView: false,
        selectedTrashTab: subtabOnlyParent,
        trashSubTabs: subtabOnlyParent.subTabs,
        selectedTrashSubTabId: 'deleted-sub-entry',
      }),
    )

    expect(deletedParentHtml).toContain('trash-parent-home-subtab-btn')
    expect(deletedParentHtml).toContain('>home</button>')
    expect(subtabOnlyHtml).not.toContain('trash-parent-home-subtab-btn')
    expect(subtabOnlyHtml).not.toContain('>home</button>')
    expect(subtabOnlyHtml).toContain('data-trash-subtab-id="deleted-sub-entry"')
  })

  it('renders app plus icons for parent and sub-tab add buttons', () => {
    const parentHtml = renderTopBar(false, { active: false })
    const subTabHtml = renderSubTabRail(false, { active: false })

    expect(parentHtml).toContain('aria-label="Add tab"')
    expect(parentHtml).toContain('app-icon-plus')
    expect(parentHtml).toContain('data-app-icon="plus"')
    expect(parentHtml).not.toContain('>+</button>')
    expect(subTabHtml).toContain('aria-label="Add note tab"')
    expect(subTabHtml).toContain('app-icon-plus')
    expect(subTabHtml).toContain('data-app-icon="plus"')
    expect(subTabHtml).not.toContain('>+</button>')
  })

  it('renders the normalized scratchpad rail svg icon', () => {
    const html = renderSubTabRail(false)

    expect(html).toContain('aria-label="scratchpad"')
    expect(html).toContain('class="scratchpad-rail-icon"')
    expect(html).toContain('viewBox="0 0 100 100"')
    expect(html).toContain('fill="currentColor"')
    expect(html).not.toContain('fill="#010101"')
    expect(html).not.toContain('<?xml')
    expect(html).not.toContain('<!DOCTYPE')
    expect(html).not.toContain('xmlns:xlink')
  })

  it('can hide live note tabs while keeping the scratchpad filter match button', () => {
    const html = renderToStaticMarkup(
      createSubTabRailElement(false, { active: false }, false, {}, {
        showNoteWorkspaceTabs: false,
        scratchpadActive: true,
        scratchpadTagCountLabel: '1',
      }),
    )

    expect(html).not.toContain('home-subtab-btn')
    expect(html).not.toContain('data-arrange-subtab-id="sub-1"')
    expect(html).not.toContain('aria-label="Add note tab"')
    expect(html).toContain('aria-label="scratchpad"')
    expect(html).toContain('aria-selected="true"')
    expect(html).toContain('scratchpad-rail-tag-count')
    expect(html).toContain('(1)')
  })
})
