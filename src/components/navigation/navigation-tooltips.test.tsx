import { createRef, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { createEmptyStageManagerParentSelection } from '../../stage-manager/selection'
import type { ArrangeModeState, SettingsSection, Tab, ViewMode, WorkspaceData } from '../../types/app'
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

function renderTopBar(
  tooltipsDisabled: boolean,
  arrangeModeOverride: Partial<ArrangeModeState> = {},
  arrangeControlsDisabled = false,
  options: {
    viewMode?: ViewMode
    settingsSection?: SettingsSection
    messagesCount?: number
    visualizerFilterControl?: ReactNode
  } = {},
) {
  const viewMode = options.viewMode ?? 'main'
  return renderToStaticMarkup(
    <TopBar
      viewMode={viewMode}
      workspace={workspace}
      activeTab={activeTab}
      editing={null}
      arrangeMode={{ ...arrangeMode, ...arrangeModeOverride }}
      tooltipsDisabled={tooltipsDisabled}
      settingsSection={options.settingsSection ?? 'hotkeys'}
      primaryTabRailRef={createRef<HTMLDivElement>()}
      isNoteWorkspaceView={viewMode === 'main' || viewMode === 'stage-manager'}
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
      onGetStageManagerParentSelection={createEmptyStageManagerParentSelection}
      onStageManagerParentClick={noop}
      arrangeSelectedParentIds={new Set()}
      onHandleArrangeParentSelectionClick={() => false}
      onClearArrangeSelection={noop}
      onConsumeArrangeClickSuppression={() => false}
      onSelectTab={noop}
      onBeginEdit={noop}
      onOpenContextMenuForTab={noop}
      onStartArrangeDragSeed={noop}
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
      onExitArrangeMode={noop}
      onAdvanceArrangeHierarchyReveal={noop}
      onEndStageManager={noop}
      onCloseSettingsView={noop}
      onSetMenuOpen={noop}
      onToggleSpaceRail={noop}
      onToggleDomainRail={noop}
      onOpenStageManager={noop}
      onToggleTrash={noop}
      onOpenMessages={noop}
      onOpenVisualizer={noop}
      onOpenVisualizerSettings={noop}
      onOpenSettings={noop}
      onOpenAbout={noop}
      onSettingsSectionChange={noop}
      messagesCount={options.messagesCount ?? 0}
      visualizerFilterControl={options.visualizerFilterControl}
    />,
  )
}

function renderSubTabRail(
  tooltipsDisabled: boolean,
  arrangeModeOverride: Partial<ArrangeModeState> = {},
  arrangeControlsDisabled = false,
) {
  return renderToStaticMarkup(
    <SubTabRail
      viewMode="main"
      activeTab={activeTab}
      activeSubTabId="sub-1"
      editing={null}
      arrangeMode={{ ...arrangeMode, ...arrangeModeOverride }}
      tooltipsDisabled={tooltipsDisabled}
      showParentHomeTab
      isNoteWorkspaceView
      selectedTrashTab={null}
      trashSubTabs={[]}
      selectedTrashSubTabId={null}
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
      onGetStageManagerParentSelection={createEmptyStageManagerParentSelection}
      onStageManagerHomeClick={noop}
      onStageManagerSubTabClick={noop}
      arrangeSelectedSubTabIds={new Set()}
      onHandleArrangeSubTabSelectionClick={() => false}
      onClearArrangeSelection={noop}
      onConsumeArrangeClickSuppression={() => false}
      onSelectParentHomeTab={noop}
      onSelectSubTab={noop}
      onBeginEdit={noop}
      onOpenContextMenuForHomeTab={noop}
      onOpenContextMenuForSubTab={noop}
      onStartArrangeDragSeed={noop}
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
    />,
  )
}

describe('navigation arrange tooltips', () => {
  it('keeps parent sort labels while omitting title tooltips when disabled', () => {
    const enabledHtml = renderTopBar(false)
    const disabledHtml = renderTopBar(true)

    expect(enabledHtml).toContain('title="sort parents"')
    expect(disabledHtml).not.toContain('title="sort parents"')
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

  it('renders messages and about as selected utility rail buttons while visualizer uses filter controls', () => {
    const messagesHtml = renderTopBar(false, { active: false }, false, {
      viewMode: 'messages',
      messagesCount: 2,
    })
    const visualizerHtml = renderTopBar(false, { active: false }, false, {
      viewMode: 'visualizer',
      visualizerFilterControl: (
        <>
          <button type="button" className="visualizer-filter-btn">duplicates</button>
          <button type="button" className="visualizer-filter-btn">tags</button>
          <button type="button" className="visualizer-filter-btn">front matter</button>
          <button type="button" className="visualizer-filter-btn">clear filter</button>
        </>
      ),
    })
    const aboutHtml = renderTopBar(false, { active: false }, false, { viewMode: 'about' })

    expect(messagesHtml).toContain('aria-label="utility pages"')
    expect(messagesHtml).toContain('aria-selected="true" class="btn btn-sm btn-primary tab-btn parent-tab-btn utility-view-rail-btn">messages (2)</button>')
    expect(messagesHtml).toMatch(/topbar-context-btn[^"]*">messages \(2\)<\/button>/)
    expect(visualizerHtml).toContain('aria-label="visualizer filters"')
    expect(visualizerHtml).toContain('>duplicates</button>')
    expect(visualizerHtml).toContain('>tags</button>')
    expect(visualizerHtml).toContain('>front matter</button>')
    expect(visualizerHtml).toContain('>clear filter</button>')
    expect(visualizerHtml).not.toContain('utility-view-rail-btn">visualizer</button>')
    expect(visualizerHtml).toContain('aria-label="visualizer settings"')
    expect(visualizerHtml.indexOf('aria-label="visualizer settings"')).toBeLessThan(visualizerHtml.indexOf('>visualizer</button>'))
    expect(visualizerHtml).toMatch(/topbar-context-btn[^"]*">visualizer<\/button>/)
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

  it('keeps sub-tab sort labels while omitting title tooltips when disabled', () => {
    const enabledHtml = renderSubTabRail(false)
    const disabledHtml = renderSubTabRail(true)

    expect(enabledHtml).toContain('title="sort sub-tabs"')
    expect(enabledHtml).toContain('title="home note"')
    expect(disabledHtml).not.toContain('title="sort sub-tabs"')
    expect(disabledHtml).not.toContain('title="home note"')
    expect(disabledHtml).toContain('aria-label="sort sub-tabs"')
    expect(enabledHtml.indexOf('Sub')).toBeLessThan(enabledHtml.indexOf('aria-label="sort sub-tabs"'))
  })
})
