import type { MouseEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { TRASH_HOME_ID } from '../../trash/trash-model'
import type {
  ArrangeDragItem,
  ArrangeModeState,
  ArrangeTapCandidateSeed,
  StageManagerParentSelection,
  Tab,
  TabArrangeDragItem,
  TabArrangeDragPreview,
  TrashParentBucket,
  ViewMode,
  WorkspaceData,
} from '../../types/app'
import { getRenameInputKeyAction } from '../../navigation/rename-draft'
import { SortIcon } from './SortIcon'

type EditableEntityType = 'tab' | 'subtab' | 'space' | 'domain'

type TopBarProps = {
  viewMode: ViewMode
  workspace: WorkspaceData
  activeTab: Tab
  editing: { type: EditableEntityType; id: string } | null
  arrangeMode: ArrangeModeState
  tooltipsDisabled?: boolean
  primaryTabRailRef: RefObject<HTMLDivElement | null>
  isNoteWorkspaceView: boolean
  arrangeableParentTabClassName: string
  draggingParentTabId: string | null
  draggingSubTabId: string | null
  arrangeTrashDropRef: RefObject<HTMLButtonElement | null>
  isArrangeTrashDropTarget: boolean
  trashParentTabs: TrashParentBucket[]
  trashTabId: string
  menuOpen: boolean
  onAutoSizeRenameInput: (input: HTMLInputElement) => void
  onShouldSkipRenameBlur: (type: EditableEntityType, id: string) => boolean
  onCommitRename: (type: EditableEntityType, id: string, name: string) => void
  onCancelRename: (type: EditableEntityType, id: string) => void
  onRenameDraftChange: (type: EditableEntityType, id: string, value: string) => void
  onClearRenameDraft: (type: EditableEntityType, id: string) => void
  onGetStageManagerParentSelection: (tab: Tab) => StageManagerParentSelection
  onStageManagerParentClick: (tab: Tab) => void
  onConsumeArrangeClickSuppression: (key: string) => boolean
  onSelectTab: (tabId: string) => void
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
  onEndStageManager: () => void
  onCloseSettingsView: () => void
  onSetMenuOpen: (updater: boolean | ((open: boolean) => boolean)) => void
  onOpenDomains: () => void
  onOpenSpaces: () => void
  onOpenStageManager: () => void
  onToggleTrash: () => void
  onOpenSettings: () => void
}

type TopbarAction = {
  key: string
  label: string
  visibleLabel?: string
  sizeLabel?: string
  selected: boolean
  className: string
  buttonRef?: RefObject<HTMLButtonElement | null>
  onClick: () => void
}

export function TopBar({
  viewMode,
  workspace,
  activeTab,
  editing,
  arrangeMode,
  tooltipsDisabled = false,
  primaryTabRailRef,
  isNoteWorkspaceView,
  arrangeableParentTabClassName,
  draggingParentTabId,
  draggingSubTabId,
  arrangeTrashDropRef,
  isArrangeTrashDropTarget,
  trashParentTabs,
  trashTabId,
  menuOpen,
  onAutoSizeRenameInput,
  onShouldSkipRenameBlur,
  onCommitRename,
  onCancelRename,
  onRenameDraftChange,
  onClearRenameDraft,
  onGetStageManagerParentSelection,
  onStageManagerParentClick,
  onConsumeArrangeClickSuppression,
  onSelectTab,
  onBeginEdit,
  onOpenContextMenuForTab,
  onStartArrangeDragSeed,
  onStartArrangeTapCandidate,
  onStartArrangePress,
  onHandleArrangeTabPointerMove,
  onHandleArrangeTabPointerUp,
  onClearArrangePressTimer,
  onCancelArrangeTabPointerDrag,
  onSetTrashTabId,
  onSetTrashSubTabId,
  onOpenContextMenuForTrashTab,
  onAddTab,
  onOpenParentSortModal,
  onExitArrangeMode,
  onEndStageManager,
  onCloseSettingsView,
  onSetMenuOpen,
  onOpenDomains,
  onOpenSpaces,
  onOpenStageManager,
  onToggleTrash,
  onOpenSettings,
}: TopBarProps) {
  if (viewMode === 'spaces' || viewMode === 'domains') return null

  const primaryTablistProps =
    viewMode === 'settings'
      ? {}
      : ({
          role: 'tablist',
          'aria-label': 'Primary tabs',
        } as const)

  const isDraggingTabArrangeItem = Boolean(draggingParentTabId || draggingSubTabId)
  const topbarActions: TopbarAction[] = [
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
    ...(arrangeMode.active && arrangeMode.scope === 'tabs'
      ? [
          {
            key: 'end-arrangement',
            label: 'arrangements',
            visibleLabel: isDraggingTabArrangeItem ? 'trash' : 'arrangements',
            sizeLabel: 'arrangements',
            selected: false,
            className: `btn btn-sm tab-btn topbar-action-btn topbar-context-btn topbar-arrange-trash-btn ${
              isDraggingTabArrangeItem ? 'is-trash-mode' : ''
            } ${isArrangeTrashDropTarget ? 'is-trash-drop-target' : ''}`,
            buttonRef: arrangeTrashDropRef,
            onClick: onExitArrangeMode,
          },
        ]
      : []),
  ]
  const topbarShowsCloseControl =
    viewMode === 'settings' ||
    viewMode === 'stage-manager' ||
    (arrangeMode.active && arrangeMode.scope === 'tabs')

  return (
    <header className={`tabbar ${arrangeMode.active && viewMode === 'main' ? 'is-arranging' : ''}`}>
      <div className="tabbar-row">
        <div ref={primaryTabRailRef} className="tabbar-scroll tabbar-primary" {...primaryTablistProps}>
          {arrangeMode.active && arrangeMode.scope === 'tabs' && viewMode === 'main' && (
            <button
              type="button"
              className="tab-sort-btn"
              onClick={onOpenParentSortModal}
              title={tooltipsDisabled ? undefined : 'sort parents'}
              aria-label="sort parents"
            >
              <SortIcon />
            </button>
          )}
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
                    arrangeMode.active &&
                    arrangeMode.dragItem?.type === 'subtab' &&
                    arrangeMode.overParentTabId === tab.id
                  const isArrangeBeforeTarget =
                    arrangeMode.active &&
                    arrangeMode.dragItem?.type === 'tab' &&
                    arrangeMode.overParentTabId === tab.id &&
                    arrangeMode.overParentInsert === 'before'
                  const isArrangeAfterTarget =
                    arrangeMode.active &&
                    arrangeMode.dragItem?.type === 'tab' &&
                    arrangeMode.overParentTabId === tab.id &&
                    arrangeMode.overParentInsert === 'after'
                  return (
                    <button
                      key={tab.id}
                      data-arrange-tab-id={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={tab.id === activeTab.id}
                      draggable={false}
                      className={`btn btn-sm ${tab.id === activeTab.id ? 'btn-primary' : 'btn-outline-secondary'} tab-btn parent-tab-btn ${arrangeableParentTabClassName} ${isArrangeMoveTarget ? 'is-arrange-target' : ''} ${isArrangeBeforeTarget ? 'is-arrange-target-before' : ''} ${isArrangeAfterTarget ? 'is-arrange-target-after' : ''} ${draggingParentTabId === tab.id ? 'is-dragging' : ''} ${
                        stageManagerSelection?.mode === 'partial' ? 'stage-manager-parent-partial' : ''
                      } ${stageManagerSelection?.mode === 'full' ? 'stage-manager-parent-full' : ''}`}
                      onClick={() => {
                        if (viewMode === 'stage-manager') {
                          onStageManagerParentClick(tab)
                          return
                        }
                        if (onConsumeArrangeClickSuppression(`tab:${tab.id}`)) return
                        onSelectTab(tab.id)
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
                      onPointerMove={(event) =>
                        onHandleArrangeTabPointerMove(event, { type: 'tab', tabId: tab.id }, tab.title, 'parent')
                      }
                      onPointerUp={(event) => {
                        if (viewMode !== 'main') return
                        onHandleArrangeTabPointerUp(event, `tab:${tab.id}`, () => onSelectTab(tab.id))
                      }}
                      onPointerLeave={() => {
                        if (viewMode !== 'main') return
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

          {viewMode === 'main' && !arrangeMode.active && (
            <button
              type="button"
              className="btn btn-sm btn-outline-light add-tab-btn"
              onClick={onAddTab}
              title={tooltipsDisabled ? undefined : 'Add tab'}
            >
              +
            </button>
          )}
        </div>

        <div className="tabbar-controls">
          {topbarActions.length > 0 && (
            <div className="topbar-actions" role="group" aria-label="Top bar actions">
              {topbarActions.map((action) => (
                <button
                  key={action.key}
                  ref={action.buttonRef}
                  type="button"
                  aria-pressed={action.selected}
                  className={`${action.className} ${action.selected ? 'is-selected' : ''}`}
                  onClick={action.onClick}
                >
                  {action.sizeLabel ? (
                    <>
                      <span className="topbar-action-size-label" aria-hidden="true">
                        {action.sizeLabel}
                      </span>
                      <span className="topbar-action-visible-label">{action.visibleLabel ?? action.label}</span>
                    </>
                  ) : (
                    action.label
                  )}
                </button>
              ))}
            </div>
          )}

          <div className="menu-wrap" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className={`menu-btn ${topbarShowsCloseControl ? 'is-close' : ''}`}
              onClick={() => {
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
                onSetMenuOpen((open) => !open)
              }}
              aria-label={topbarShowsCloseControl ? 'Close' : 'Menu'}
            >
              <span className="menu-btn-line" />
              <span className="menu-btn-line" />
            </button>
            {!topbarShowsCloseControl && menuOpen && (
              <div className="menu-dropdown">
                <button type="button" className="menu-item" onClick={onOpenDomains}>
                  domains
                </button>
                <button type="button" className="menu-item" onClick={onOpenSpaces}>
                  spaces
                </button>
                {viewMode === 'main' && (
                  <button type="button" className="menu-item" onClick={onOpenStageManager}>
                    director
                  </button>
                )}
                <button type="button" className="menu-item" onClick={onToggleTrash}>
                  {viewMode === 'trash' ? 'tabs' : 'trash'}
                </button>
                <button type="button" className="menu-item" onClick={onOpenSettings}>
                  settings
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
