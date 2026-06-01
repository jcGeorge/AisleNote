import type { MouseEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { TRASH_HOME_ID } from '../../trash/trash-model'
import type {
  ArrangeDragItem,
  ArrangeInsertPosition,
  ArrangeModeState,
  ArrangeTapCandidateSeed,
  SelectionClickModifiers,
  StageManagerParentSelection,
  Tab,
  TabArrangeDragItem,
  TabArrangeDragPreview,
  TrashParentBucket,
  ViewMode,
  WorkspaceData,
} from '../../types/app'
import { getPlacementNeighborId } from '../../arrange/arrange-utils'
import { getRenameInputKeyAction } from '../../navigation/rename-draft'
import { NavigationRailControls, type NavigationRailAction } from './NavigationRailControls'
import { SortIcon } from './SortIcon'

type EditableEntityType = 'tab' | 'subtab' | 'space' | 'domain'

type TopBarProps = {
  viewMode: ViewMode
  workspace: WorkspaceData
  activeTab: Tab
  editing: { type: EditableEntityType; id: string } | null
  arrangeMode: ArrangeModeState
  tooltipsDisabled?: boolean
  showGlobalControls?: boolean
  isDraggingArrangeItem?: boolean
  primaryTabRailRef: RefObject<HTMLDivElement | null>
  isNoteWorkspaceView: boolean
  arrangeableParentTabClassName: string
  guidedParentRailTarget?: { targetId: string; position: ArrangeInsertPosition | null } | null
  arrangeControlsDisabled?: boolean
  draggingParentTabId: string | null
  draggingSubTabId: string | null
  arrangeTrashDropRef: RefObject<HTMLButtonElement | null>
  isArrangeTrashDropTarget: boolean
  trashParentTabs: TrashParentBucket[]
  trashTabId: string
  menuOpen: boolean
  spaceRailVisible: boolean
  domainRailVisible: boolean
  onAutoSizeRenameInput: (input: HTMLInputElement) => void
  onShouldSkipRenameBlur: (type: EditableEntityType, id: string) => boolean
  onCommitRename: (type: EditableEntityType, id: string, name: string) => void
  onCancelRename: (type: EditableEntityType, id: string) => void
  onRenameDraftChange: (type: EditableEntityType, id: string, value: string) => void
  onClearRenameDraft: (type: EditableEntityType, id: string) => void
  onGetStageManagerParentSelection: (tab: Tab) => StageManagerParentSelection
  onStageManagerParentClick: (tab: Tab, modifiers: SelectionClickModifiers) => void
  arrangeSelectedParentIds: ReadonlySet<string>
  onHandleArrangeParentSelectionClick: (tabId: string, modifiers: SelectionClickModifiers) => boolean
  onClearArrangeSelection: () => void
  onConsumeArrangeClickSuppression: (key: string) => boolean
  onSelectTab: (tabId: string, event?: MouseEvent<HTMLButtonElement> | ReactPointerEvent<HTMLButtonElement>) => void
  onBeginEdit: (editing: { type: EditableEntityType; id: string }) => void
  onOpenContextMenuForTab: (event: MouseEvent<HTMLButtonElement>, tabId: string) => void
  onStartArrangeDragSeed: (key: string, event: ReactPointerEvent<HTMLButtonElement>) => void
  onStartArrangeTapCandidate: (candidate: ArrangeTapCandidateSeed, event: ReactPointerEvent<HTMLButtonElement>) => void
  onStartArrangePress: (
    event: ReactPointerEvent<HTMLButtonElement>,
    dragItem: ArrangeDragItem | null,
    suppressClickKey: string,
  ) => void
  onHandleArrangeTabPointerMove: (
    event: ReactPointerEvent<HTMLButtonElement>,
    item: TabArrangeDragItem,
    label: string,
    variant: TabArrangeDragPreview['variant'],
  ) => void
  onGuidedParentPointerMove?: (tabId: string, event: ReactPointerEvent<HTMLButtonElement>) => void
  onGuidedParentPointerLeave?: (tabId: string) => void
  onHandleArrangeTabPointerUp: (
    event: ReactPointerEvent<HTMLButtonElement>,
    key: string,
    onTapWhileArranging: () => void,
  ) => void
  onClearArrangePressTimer: () => void
  onCancelArrangeTabPointerDrag: () => void
  onSetTrashTabId: (tabId: string) => void
  onSetTrashSubTabId: (subTabId: string | null) => void
  onOpenContextMenuForTrashTab: (event: MouseEvent<HTMLButtonElement>, trashParent: TrashParentBucket) => void
  onAddTab: () => void
  onOpenParentSortModal: () => void
  onExitArrangeMode: () => void
  onAdvanceArrangeHierarchyReveal: () => void
  onEndStageManager: () => void
  onCloseSettingsView: () => void
  onSetMenuOpen: (updater: boolean | ((open: boolean) => boolean)) => void
  onToggleSpaceRail: () => void
  onToggleDomainRail: () => void
  onOpenStageManager: () => void
  onToggleTrash: () => void
  onOpenMain: () => void
  onOpenMessages: () => void
  onOpenSettings: () => void
  messagesCount?: number
}

function getSelectionClickModifiers(event: MouseEvent | ReactPointerEvent<HTMLButtonElement>): SelectionClickModifiers {
  return {
    shiftKey: event.shiftKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
  }
}

function hasSelectionClickModifier(event: MouseEvent | ReactPointerEvent<HTMLButtonElement>) {
  return event.shiftKey || event.ctrlKey || event.metaKey
}

export function TopBar({
  viewMode,
  workspace,
  activeTab,
  editing,
  arrangeMode,
  tooltipsDisabled = false,
  showGlobalControls = true,
  isDraggingArrangeItem = false,
  primaryTabRailRef,
  isNoteWorkspaceView,
  arrangeableParentTabClassName,
  guidedParentRailTarget = null,
  arrangeControlsDisabled = false,
  draggingParentTabId,
  arrangeTrashDropRef,
  isArrangeTrashDropTarget,
  trashParentTabs,
  trashTabId,
  menuOpen,
  spaceRailVisible,
  domainRailVisible,
  onAutoSizeRenameInput,
  onShouldSkipRenameBlur,
  onCommitRename,
  onCancelRename,
  onRenameDraftChange,
  onClearRenameDraft,
  onGetStageManagerParentSelection,
  onStageManagerParentClick,
  arrangeSelectedParentIds,
  onHandleArrangeParentSelectionClick,
  onClearArrangeSelection,
  onConsumeArrangeClickSuppression,
  onSelectTab,
  onBeginEdit,
  onOpenContextMenuForTab,
  onStartArrangeDragSeed,
  onStartArrangeTapCandidate,
  onStartArrangePress,
  onHandleArrangeTabPointerMove,
  onGuidedParentPointerMove = () => undefined,
  onGuidedParentPointerLeave = () => undefined,
  onHandleArrangeTabPointerUp,
  onClearArrangePressTimer,
  onCancelArrangeTabPointerDrag,
  onSetTrashTabId,
  onSetTrashSubTabId,
  onOpenContextMenuForTrashTab,
  onAddTab,
  onOpenParentSortModal,
  onExitArrangeMode,
  onAdvanceArrangeHierarchyReveal,
  onEndStageManager,
  onCloseSettingsView,
  onSetMenuOpen,
  onToggleSpaceRail,
  onToggleDomainRail,
  onOpenStageManager,
  onToggleTrash,
  onOpenMain,
  onOpenMessages,
  onOpenSettings,
  messagesCount = 0,
}: TopBarProps) {
  const primaryTablistProps =
    viewMode === 'settings'
      ? {}
      : ({
          role: 'tablist',
          'aria-label': 'Primary tabs',
        } as const)

  const topbarActions: NavigationRailAction[] = [
    ...(viewMode === 'trash'
      ? [
          {
            key: 'trash-home',
            label: 'trash',
            selected: trashTabId === TRASH_HOME_ID,
            className: 'btn btn-sm tab-btn trash-home-tab topbar-action-btn',
            onClick: () => {
              onSetTrashTabId(TRASH_HOME_ID)
              onSetTrashSubTabId(null)
            },
          },
        ]
      : []),
    ...(viewMode === 'settings'
      ? [
          {
            key: 'settings-view',
            label: 'settings',
            selected: false,
            className: 'btn btn-sm tab-btn topbar-action-btn topbar-context-btn',
            onClick: () => undefined,
          },
        ]
      : []),
    ...(viewMode === 'messages'
      ? [
          {
            key: 'messages-view',
            label: 'messages',
            selected: false,
            className: 'btn btn-sm tab-btn topbar-action-btn topbar-context-btn',
            onClick: () => undefined,
          },
        ]
      : []),
    ...(viewMode === 'stage-manager'
      ? [
          {
            key: 'end-stage-manager',
            label: 'director',
            selected: false,
            className: 'btn btn-sm tab-btn topbar-action-btn topbar-context-btn',
            onClick: () => undefined,
          },
        ]
      : []),
    ...(arrangeMode.active && viewMode === 'main'
      ? [
          {
            key: 'end-arrangement',
            label: 'arrangements',
            visibleLabel: isDraggingArrangeItem ? 'trash' : 'arrangements',
            sizeLabel: 'arrangements',
            selected: false,
            className: `btn btn-sm tab-btn topbar-action-btn topbar-context-btn topbar-arrange-trash-btn ${
              isDraggingArrangeItem ? 'is-trash-mode' : ''
            } ${isArrangeTrashDropTarget ? 'is-trash-drop-target' : ''}`,
            buttonRef: arrangeTrashDropRef,
            onClick: () => {
              if (isDraggingArrangeItem) return
              onAdvanceArrangeHierarchyReveal()
            },
          },
        ]
      : []),
  ]
  const topbarShowsCloseControl =
    viewMode === 'settings' ||
    viewMode === 'messages' ||
    viewMode === 'stage-manager' ||
    (arrangeMode.active && viewMode === 'main')
  const parentPlacementTargetId =
    arrangeMode.active && arrangeMode.dragItem?.type === 'tab'
      ? arrangeMode.overParentTabId
      : guidedParentRailTarget?.position
        ? guidedParentRailTarget.targetId
        : null
  const parentPlacementPosition =
    arrangeMode.active && arrangeMode.dragItem?.type === 'tab'
      ? arrangeMode.overParentInsert
      : guidedParentRailTarget?.position ?? null
  const parentPlacementNeighborId = getPlacementNeighborId(
    workspace.tabs.map((tab) => tab.id),
    parentPlacementTargetId,
    parentPlacementPosition,
    arrangeMode.dragItem?.type === 'tab' ? arrangeMode.dragItem.tabId : draggingParentTabId,
  )

  return (
    <header className={`tabbar ${arrangeMode.active && viewMode === 'main' ? 'is-arranging' : ''}`}>
      <div className="tabbar-row">
        <div ref={primaryTabRailRef} className="tabbar-scroll tabbar-primary" {...primaryTablistProps}>
          {isNoteWorkspaceView &&
            workspace.tabs.map((tab) =>
              editing?.type === 'tab' && editing.id === tab.id ? (
                <input
                  key={tab.id}
                  className="tab-rename-input"
                  defaultValue={tab.title}
                  autoFocus
                  onFocus={(event) => {
                    onRenameDraftChange('tab', tab.id, event.currentTarget.value)
                    onAutoSizeRenameInput(event.currentTarget)
                    event.currentTarget.select()
                  }}
                  onInput={(event) => {
                    onRenameDraftChange('tab', tab.id, event.currentTarget.value)
                    onAutoSizeRenameInput(event.currentTarget)
                  }}
                  onBlur={(event) => {
                    if (onShouldSkipRenameBlur('tab', tab.id)) {
                      onClearRenameDraft('tab', tab.id)
                      return
                    }
                    onCommitRename('tab', tab.id, event.target.value)
                  }}
                  onKeyDown={(event) => {
                    const action = getRenameInputKeyAction(event)
                    if (action === 'commit') {
                      event.preventDefault()
                      onCommitRename('tab', tab.id, event.currentTarget.value)
                    }
                    if (action === 'commit-and-create') {
                      event.preventDefault()
                      onAddTab()
                    }
                    if (action === 'cancel') {
                      event.preventDefault()
                      onCancelRename('tab', tab.id)
                    }
                  }}
                />
              ) : (
                (() => {
                  const stageManagerSelection = viewMode === 'stage-manager' ? onGetStageManagerParentSelection(tab) : null
                  const isArrangeMoveTarget =
                    (arrangeMode.active &&
                      arrangeMode.dragItem?.type === 'subtab' &&
                      arrangeMode.overParentTabId === tab.id) ||
                    (guidedParentRailTarget?.targetId === tab.id && guidedParentRailTarget.position === null)
                  const isArrangeBeforeTarget =
                    (arrangeMode.active &&
                      arrangeMode.dragItem?.type === 'tab' &&
                      arrangeMode.overParentTabId === tab.id &&
                      arrangeMode.overParentInsert === 'before') ||
                    (guidedParentRailTarget?.targetId === tab.id && guidedParentRailTarget.position === 'before')
                  const isArrangeAfterTarget =
                    (arrangeMode.active &&
                      arrangeMode.dragItem?.type === 'tab' &&
                      arrangeMode.overParentTabId === tab.id &&
                      arrangeMode.overParentInsert === 'after') ||
                    (guidedParentRailTarget?.targetId === tab.id && guidedParentRailTarget.position === 'after')
                  const isArrangeBeforeNeighbor =
                    parentPlacementNeighborId === tab.id && parentPlacementPosition === 'after'
                  const isArrangeAfterNeighbor =
                    parentPlacementNeighborId === tab.id && parentPlacementPosition === 'before'
                  const isArrangeSelected = arrangeSelectedParentIds.has(tab.id)
                  return (
                    <button
                      key={tab.id}
                      data-arrange-tab-id={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={tab.id === activeTab.id}
                      draggable={false}
                      className={`btn btn-sm ${tab.id === activeTab.id ? 'btn-primary' : 'btn-outline-secondary'} tab-btn parent-tab-btn ${arrangeableParentTabClassName} ${isArrangeSelected ? 'is-arrange-selected' : ''} ${isArrangeMoveTarget ? 'is-arrange-target' : ''} ${isArrangeBeforeTarget ? 'is-arrange-target-before' : ''} ${isArrangeAfterTarget ? 'is-arrange-target-after' : ''} ${isArrangeBeforeNeighbor ? 'is-arrange-neighbor-before' : ''} ${isArrangeAfterNeighbor ? 'is-arrange-neighbor-after' : ''} ${draggingParentTabId === tab.id ? 'is-dragging' : ''} ${
                        stageManagerSelection?.mode === 'partial' ? 'stage-manager-parent-partial' : ''
                      } ${stageManagerSelection?.mode === 'full' ? 'stage-manager-parent-full' : ''}`}
                      onClick={(event) => {
                        const modifiers = getSelectionClickModifiers(event)
                        if (viewMode === 'stage-manager') {
                          onStageManagerParentClick(tab, modifiers)
                          return
                        }
                        if (onConsumeArrangeClickSuppression(`tab:${tab.id}`)) return
                        if (onHandleArrangeParentSelectionClick(tab.id, modifiers)) {
                          event.preventDefault()
                          return
                        }
                        onClearArrangeSelection()
                        onSelectTab(tab.id, event)
                      }}
                      onDoubleClick={() => {
                        if (viewMode !== 'main' || arrangeMode.active) return
                        onBeginEdit({ type: 'tab', id: tab.id })
                      }}
                      onContextMenu={(event) => {
                        if (viewMode !== 'main') return
                        onOpenContextMenuForTab(event, tab.id)
                      }}
                      onPointerDown={(event) => {
                        if (viewMode !== 'main') return
                        if (hasSelectionClickModifier(event)) {
                          onClearArrangePressTimer()
                          return
                        }
                        if (event.button === 0) {
                          event.currentTarget.setPointerCapture(event.pointerId)
                        }
                        onStartArrangeDragSeed(`tab:${tab.id}`, event)
                        if (arrangeMode.active) {
                          onStartArrangeTapCandidate({ key: `tab:${tab.id}`, type: 'tab', tabId: tab.id }, event)
                          return
                        }
                        onStartArrangePress(event, { type: 'tab', tabId: tab.id }, `tab:${tab.id}`)
                      }}
                      onPointerMove={(event) => {
                        onGuidedParentPointerMove(tab.id, event)
                        onHandleArrangeTabPointerMove(event, { type: 'tab', tabId: tab.id }, tab.title, 'parent')
                      }}
                      onPointerUp={(event) => {
                        if (viewMode !== 'main') return
                        onHandleArrangeTabPointerUp(event, `tab:${tab.id}`, () => {
                          onClearArrangeSelection()
                          onSelectTab(tab.id, event)
                        })
                      }}
                      onPointerLeave={() => {
                        if (viewMode !== 'main') return
                        onGuidedParentPointerLeave(tab.id)
                        if (!arrangeMode.active) {
                          onClearArrangePressTimer()
                        }
                      }}
                      onPointerCancel={() => {
                        if (viewMode !== 'main') return
                        onCancelArrangeTabPointerDrag()
                      }}
                    >
                      {tab.title}
                    </button>
                  )
                })()
              ),
            )}

          {viewMode === 'trash' && (
            <>
              {trashParentTabs.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  aria-selected={trashTabId === entry.id}
                  className={`btn btn-sm tab-btn trash-parent-tab ${trashTabId === entry.id ? 'is-selected' : ''}`}
                  onClick={() => {
                    onSetTrashTabId(entry.id)
                    onSetTrashSubTabId(null)
                  }}
                  onContextMenu={(event) => onOpenContextMenuForTrashTab(event, entry)}
                >
                  {entry.title}
                </button>
              ))}
            </>
          )}

          {viewMode === 'main' && arrangeMode.active ? (
            <button
              type="button"
              className="tab-sort-btn"
              onClick={() => {
                if (arrangeControlsDisabled) return
                onOpenParentSortModal()
              }}
              title={tooltipsDisabled ? undefined : 'sort parents'}
              aria-label="sort parents"
              aria-disabled={arrangeControlsDisabled}
              disabled={arrangeControlsDisabled}
            >
              <SortIcon />
            </button>
          ) : viewMode === 'main' && !arrangeMode.active ? (
            <button
              type="button"
              className="btn btn-sm btn-outline-light add-tab-btn"
              onClick={onAddTab}
              title={tooltipsDisabled ? undefined : 'Add tab'}
            >
              +
            </button>
          ) : null}
        </div>

        {showGlobalControls && (
          <NavigationRailControls
            actions={topbarActions}
            menuOpen={menuOpen}
            showCloseControl={topbarShowsCloseControl}
            viewMode={viewMode}
            spaceRailVisible={spaceRailVisible}
            domainRailVisible={domainRailVisible}
            onCloseAction={() => {
              if (arrangeMode.active) {
                onExitArrangeMode()
                return
              }
              if (viewMode === 'stage-manager') {
                onEndStageManager()
                return
              }
              if (viewMode === 'settings') {
                onCloseSettingsView()
                return
              }
              if (viewMode === 'messages') {
                onOpenMain()
              }
            }}
            onSetMenuOpen={onSetMenuOpen}
            onToggleSpaceRail={onToggleSpaceRail}
            onToggleDomainRail={onToggleDomainRail}
            onOpenStageManager={onOpenStageManager}
            onToggleTrash={onToggleTrash}
            onOpenMessages={onOpenMessages}
            onOpenSettings={onOpenSettings}
            messagesCount={messagesCount}
          />
        )}
      </div>
    </header>
  )
}
