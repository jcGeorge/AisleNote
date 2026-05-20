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
  homeContent: '',
  activeSubTabId: 'sub-1',
  subTabs: [{ id: 'sub-1', title: 'Sub', noteBodyId: 'body-sub-1', content: '' }],
}

const workspace: WorkspaceData = {
  activeTabId: activeTab.id,
  tabs: [activeTab],
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
}

const noop = () => undefined

function renderTopBar(tooltipsDisabled: boolean) {
  return renderToStaticMarkup(
    <TopBar
      viewMode="main"
      workspace={workspace}
      activeTab={activeTab}
      editing={null}
      arrangeMode={arrangeMode}
      tooltipsDisabled={tooltipsDisabled}
      primaryTabRailRef={createRef<HTMLDivElement>()}
      isNoteWorkspaceView
      arrangeableParentTabClassName="is-arrangeable"
      draggingParentTabId={null}
      draggingSubTabId={null}
      arrangeTrashDropRef={createRef<HTMLButtonElement>()}
      isArrangeTrashDropTarget={false}
      trashParentTabs={[]}
      trashTabId=""
      menuOpen={false}
      onAutoSizeRenameInput={noop}
      onShouldSkipRenameBlur={() => false}
      onCommitRename={noop}
      onCancelRename={noop}
      onRenameDraftChange={noop}
      onClearRenameDraft={noop}
      onGetStageManagerParentSelection={createEmptyStageManagerParentSelection}
      onStageManagerParentClick={noop}
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
      onEndStageManager={noop}
      onCloseSettingsView={noop}
      onSetMenuOpen={noop}
      onOpenDomains={noop}
      onOpenSpaces={noop}
      onOpenStageManager={noop}
      onToggleTrash={noop}
      onOpenSettings={noop}
    />,
  )
}

function renderSubTabRail(tooltipsDisabled: boolean) {
  return renderToStaticMarkup(
    <SubTabRail
      viewMode="main"
      activeTab={activeTab}
      activeSubTabId="sub-1"
      editing={null}
      arrangeMode={arrangeMode}
      tooltipsDisabled={tooltipsDisabled}
      showParentHomeTab
      isNoteWorkspaceView
      selectedTrashTab={null}
      trashSubTabs={[]}
      selectedTrashSubTabId={null}
      subTabRailRef={createRef<HTMLDivElement>()}
      arrangeableSubTabClassName="is-arrangeable"
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
  })

  it('keeps sub-tab sort labels while omitting title tooltips when disabled', () => {
    const enabledHtml = renderSubTabRail(false)
    const disabledHtml = renderSubTabRail(true)

    expect(enabledHtml).toContain('title="sort sub-tabs"')
    expect(enabledHtml).toContain('title="home note"')
    expect(disabledHtml).not.toContain('title="sort sub-tabs"')
    expect(disabledHtml).not.toContain('title="home note"')
    expect(disabledHtml).toContain('aria-label="sort sub-tabs"')
  })
})
