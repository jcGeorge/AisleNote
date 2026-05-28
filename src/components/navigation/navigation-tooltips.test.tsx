import { createRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { createEmptyStageManagerParentSelection } from '../../stage-manager/selection'
import type { ArrangeModeState, Tab, WorkspaceData } from '../../types/app'
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
) {
  return renderToStaticMarkup(
    <TopBar
      viewMode="main"
      workspace={workspace}
      activeTab={activeTab}
      editing={null}
      arrangeMode={{ ...arrangeMode, ...arrangeModeOverride }}
      tooltipsDisabled={tooltipsDisabled}
      primaryTabRailRef={createRef<HTMLDivElement>()}
      isNoteWorkspaceView
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
      onOpenSettings={noop}
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
