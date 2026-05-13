import type { MouseEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { TRASH_HOME_ID } from '../../trash/trash-model'
import type {
  ArrangeDragItem,
  ArrangeModeState,
  ArrangeTapCandidateSeed,
  ContextMenuState,
  StageManagerParentSelection,
  Tab,
  TabArrangeDragItem,
  TabArrangeDragPreview,
  TrashParentBucket,
  ViewMode,
  WorkspaceData,
} from '../../types/app'

type EditableEntityType = 'tab' | 'subtab' | 'space' | 'domain'

type TopBarProps = {
  viewMode: ViewMode
  workspace: WorkspaceData
  activeTab: Tab
  editing: { type: EditableEntityType; id: string } | null
  arrangeMode: ArrangeModeState
  primaryTabRailRef: RefObject<HTMLDivElement | null>
  isNoteWorkspaceView: boolean
  arrangeableParentTabClassName: string
  draggingParentTabId: string | null
  trashParentTabs: TrashParentBucket[]
  trashTabId: string
  menuOpen: boolean
  aisleDeleteMode: boolean
  onAutoSizeRenameInput: (input: HTMLInputElement) => void
  onShouldSkipRenameBlur: (type: EditableEntityType, id: string) => boolean
  onCommitRename: (type: EditableEntityType, id: string, name: string) => void
  onCancelRename: (type: EditableEntityType, id: string) => void
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
  onExitArrangeMode: () => void
  onExitAisleDeleteMode: () => void
  onEndStageManager: () => void
  onCloseSettingsView: () => void
  onSetMenuOpen: (updater: boolean | ((open: boolean) => boolean)) => void
  onSetContextMenu: (contextMenu: ContextMenuState | null) => void
  onCloseNotePopovers: () => void
  onOpenDomains: () => void
  onOpenSpaces: () => void
  onOpenStageManager: () => void
  onToggleTrash: () => void
  onOpenSettings: () => void
}

export function TopBar({
  viewMode,
  workspace,
  activeTab,
  editing,
  arrangeMode,
  primaryTabRailRef,
  isNoteWorkspaceView,
  arrangeableParentTabClassName,
  draggingParentTabId,
  trashParentTabs,
  trashTabId,
  menuOpen,
  aisleDeleteMode,
  onAutoSizeRenameInput,
  onShouldSkipRenameBlur,
  onCommitRename,
  onCancelRename,
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
  onExitArrangeMode,
  onExitAisleDeleteMode,
  onEndStageManager,
  onCloseSettingsView,
  onSetMenuOpen,
  onSetContextMenu,
  onCloseNotePopovers,
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

  const topbarActions = [
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
            label: 'end arrangement',
            selected: false,
            className: 'btn btn-sm tab-btn topbar-action-btn topbar-context-btn',
            onClick: onExitArrangeMode,
          },
        ]
      : []),
    ...(viewMode === 'main' && !arrangeMode.active && aisleDeleteMode
      ? [
          {
            key: 'end-delete-aisle',
            label: 'end delete',
            selected: false,
            className: 'btn btn-sm tab-btn topbar-action-btn topbar-context-btn',
            onClick: () => {
              onSetMenuOpen(false)
              onSetContextMenu(null)
              onCloseNotePopovers()
              onExitAisleDeleteMode()
            },
          },
        ]
      : []),
  ]
  const topbarShowsCloseControl =
    viewMode === 'settings' ||
    viewMode === 'stage-manager' ||
    (arrangeMode.active && arrangeMode.scope === 'tabs') ||
    aisleDeleteMode

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
                    onAutoSizeRenameInput(event.currentTarget)
                    event.currentTarget.select()
                  }}
                  onInput={(event) => onAutoSizeRenameInput(event.currentTarget)}
                  onBlur={(event) => {
                    if (onShouldSkipRenameBlur('tab', tab.id)) return
                    onCommitRename('tab', tab.id, event.target.value)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') onCommitRename('tab', tab.id, (event.target as HTMLInputElement).value)
                    if (event.key === 'Escape') {
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
            <button type="button" className="btn btn-sm btn-outline-light add-tab-btn" onClick={onAddTab} title="Add tab">
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
                  type="button"
                  aria-pressed={action.selected}
                  className={`${action.className} ${action.selected ? 'is-selected' : ''}`}
                  onClick={action.onClick}
                >
                  {action.label}
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
                if (aisleDeleteMode) {
                  onExitAisleDeleteMode()
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
