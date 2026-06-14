import type { MouseEvent, PointerEvent as ReactPointerEvent, ReactNode, RefObject } from 'react'
import { TRASH_HOME_ID } from '../../trash/trash-model'
import type {
  AboutSection,
  ArrangeDragItem,
  ArrangeInsertPosition,
  ArrangeModeState,
  ArrangeTapCandidateSeed,
  MessagesSection,
  SelectionClickModifiers,
  SettingsSection,
  Tab,
  TabRenameEnterBehavior,
  TabArrangeDragItem,
  TabArrangeDragPreview,
  TrashParentBucket,
  ViewMode,
  WorkspaceData,
} from '../../types/app'
import { getPlacementNeighborId } from '../../arrange/arrange-utils'
import { getRenameInputKeyAction, shouldCreateAnotherTabAfterRenameEnter } from '../../navigation/rename-draft'
import { SETTINGS_SECTIONS } from '../../settings/defaults'
import { isEditorAblationEnabled } from '../../editor/editor-ablation'
import {
  getArrangeRailContextMenuPolicy,
  getArrangeRailPointerDownAction,
  getSelectionClickModifiers,
} from './arrange-rail-events'
import { NavigationRailControls, type NavigationRailAction } from './NavigationRailControls'
import { SortIcon } from './SortIcon'
import { AppIcon } from '../icons/AppIcon'

type EditableEntityType = 'tab' | 'subtab' | 'space' | 'domain'
type NavigationContextMenuOptions = {
  force?: boolean
}

type TopBarProps = {
  viewMode: ViewMode
  workspace: WorkspaceData
  activeTab: Tab
  editing: { type: EditableEntityType; id: string } | null
  arrangeMode: ArrangeModeState
  tooltipsDisabled?: boolean
  showGlobalControls?: boolean
  isDraggingArrangeItem?: boolean
  tagFilterActive?: boolean
  tagFilterControl?: ReactNode
  getTabLabel?: (tab: Tab) => ReactNode
  settingsSection: SettingsSection
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
  onIsPendingCreatedRename?: (type: 'tab' | 'subtab', id: string) => boolean
  onCommitRename: (type: EditableEntityType, id: string, name: string) => void
  onCancelRename: (type: EditableEntityType, id: string) => void
  onRenameDraftChange: (type: EditableEntityType, id: string, value: string) => void
  onClearRenameDraft: (type: EditableEntityType, id: string) => void
  arrangeSelectedParentIds: ReadonlySet<string>
  trashSelectedParentIds?: ReadonlySet<string>
  onHandleArrangeParentSelectionClick: (tabId: string, modifiers: SelectionClickModifiers) => boolean
  onHandleTrashParentSelectionClick?: (
    event: MouseEvent<HTMLButtonElement>,
    trashParent: TrashParentBucket,
    orderedIds: readonly string[],
  ) => boolean
  onConsumeTrashClickSuppression?: () => boolean
  onClearArrangeSelection: () => void
  onConsumeArrangeClickSuppression: (key: string) => boolean
  onSelectTab: (tabId: string, event?: MouseEvent<HTMLButtonElement> | ReactPointerEvent<HTMLButtonElement>) => void
  onBeginEdit: (editing: { type: EditableEntityType; id: string }) => void
  onOpenContextMenuForTab: (
    event: MouseEvent<HTMLButtonElement>,
    tabId: string,
    options?: NavigationContextMenuOptions,
  ) => void
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
  onTrashParentPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>, trashParent: TrashParentBucket) => void
  onTrashParentPointerMove?: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onTrashParentPointerUp?: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onTrashParentPointerCancel?: () => void
  onAddTab: () => void
  tabRenameEnterBehavior?: TabRenameEnterBehavior
  onOpenParentSortModal: () => void
  onExitArrangeMode: () => void
  onAdvanceArrangeHierarchyReveal: () => void
  onCloseSettingsView: () => void
  onSetMenuOpen: (updater: boolean | ((open: boolean) => boolean)) => void
  onToggleSpaceRail: () => void
  onToggleDomainRail: () => void
  onToggleTrash: () => void
  onOpenMessages: () => void
  onOpenSettings: () => void
  onOpenEtCetera: () => void
  onOpenAbout: () => void
  onOpenFilter: () => void
  onSettingsSectionChange: (section: SettingsSection) => void
  onExitTagFilterMode?: () => void
  aboutSection?: AboutSection
  onAboutSectionChange?: (section: AboutSection) => void
  messagesSection?: MessagesSection
  messagesCount?: number
  toastHistoryCount?: number
  diagnosticLogCount?: number
  onMessagesSectionChange?: (section: MessagesSection) => void
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
  tagFilterActive = false,
  tagFilterControl = null,
  getTabLabel = (tab) => tab.title,
  settingsSection,
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
  onIsPendingCreatedRename = () => false,
  onCommitRename,
  onCancelRename,
  onRenameDraftChange,
  onClearRenameDraft,
  arrangeSelectedParentIds,
  trashSelectedParentIds,
  onHandleArrangeParentSelectionClick,
  onHandleTrashParentSelectionClick,
  onConsumeTrashClickSuppression = () => false,
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
  onTrashParentPointerDown = () => undefined,
  onTrashParentPointerMove = () => undefined,
  onTrashParentPointerUp = () => undefined,
  onTrashParentPointerCancel = () => undefined,
  onAddTab,
  tabRenameEnterBehavior = 'goes-to-note',
  onOpenParentSortModal,
  onExitArrangeMode,
  onAdvanceArrangeHierarchyReveal,
  onCloseSettingsView,
  onSetMenuOpen,
  onToggleSpaceRail,
  onToggleDomainRail,
  onToggleTrash,
  onOpenMessages,
  onOpenSettings,
  onOpenEtCetera,
  onOpenAbout,
  onOpenFilter,
  onSettingsSectionChange,
  onExitTagFilterMode = () => undefined,
  aboutSection = 'home',
  onAboutSectionChange = () => undefined,
  messagesSection = 'inbox',
  messagesCount = 0,
  toastHistoryCount = 0,
  diagnosticLogCount = 0,
  onMessagesSectionChange = () => undefined,
}: TopBarProps) {
  const isUtilityView = viewMode === 'settings' || viewMode === 'messages' || viewMode === 'about'
  const primaryTablistProps =
    isUtilityView
        ? ({
            role: 'tablist',
            'aria-label': 'utility sections',
          } as const)
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
            className: 'btn btn-sm tab-btn trash-home-tab topbar-action-btn topbar-context-btn topbar-arrange-trash-btn',
            onClick: () => {
              onSetTrashTabId(TRASH_HOME_ID)
              onSetTrashSubTabId(null)
            },
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
    ...(isUtilityView
      ? [
          {
            key: 'et-cetera',
            label: 'et cetera',
            selected: false,
            className: 'btn btn-sm tab-btn topbar-action-btn topbar-context-btn',
            onClick: onOpenEtCetera,
          },
        ]
      : []),
  ]
  const topbarShowsCloseControl =
    viewMode === 'settings' ||
    viewMode === 'messages' ||
    viewMode === 'about' ||
    (tagFilterActive && viewMode === 'main') ||
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
  const renderUtilityParentButton = (
    targetViewMode: Extract<ViewMode, 'about' | 'messages' | 'settings'>,
    label: string,
    onClick: () => void,
  ) => (
    <button
      key={targetViewMode}
      type="button"
      role="tab"
      aria-selected={viewMode === targetViewMode}
      className={`btn btn-sm ${
        viewMode === targetViewMode ? 'btn-primary' : 'btn-outline-secondary'
      } tab-btn parent-tab-btn utility-parent-rail-btn`}
      onClick={onClick}
    >
      {label}
    </button>
  )
  const renderUtilityChildRail = () => {
    if (!isUtilityView) return null
    const childRailLabel =
      viewMode === 'settings' ? 'settings sections' : viewMode === 'messages' ? 'messages sections' : 'about sections'

    return (
      <div className="tabbar-row utility-child-tabbar-row">
        <div className="tabbar-scroll tabbar-secondary utility-child-rail" role="tablist" aria-label={childRailLabel}>
          {viewMode === 'about' && (
            <>
              <button
                type="button"
                role="tab"
                aria-selected={aboutSection === 'home'}
                className={`btn btn-sm ${
                  aboutSection === 'home' ? 'btn-primary' : 'btn-outline-secondary'
                } tab-btn subtab-btn utility-view-rail-btn utility-child-rail-btn`}
                onClick={() => onAboutSectionChange('home')}
              >
                home
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={aboutSection === 'tooltip-sources'}
                className={`btn btn-sm ${
                  aboutSection === 'tooltip-sources' ? 'btn-primary' : 'btn-outline-secondary'
                } tab-btn subtab-btn utility-view-rail-btn utility-child-rail-btn`}
                onClick={() => onAboutSectionChange('tooltip-sources')}
              >
                tooltip sources
              </button>
            </>
          )}

          {viewMode === 'messages' && (
            <>
              <button
                type="button"
                role="tab"
                aria-selected={messagesSection === 'inbox'}
                className={`btn btn-sm ${
                  messagesSection === 'inbox' ? 'btn-primary' : 'btn-outline-secondary'
                } tab-btn subtab-btn utility-view-rail-btn utility-child-rail-btn`}
                onClick={() => onMessagesSectionChange('inbox')}
              >
                inbox{messagesCount > 0 ? ` (${messagesCount})` : ''}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={messagesSection === 'toast-history'}
                className={`btn btn-sm ${
                  messagesSection === 'toast-history' ? 'btn-primary' : 'btn-outline-secondary'
                } tab-btn subtab-btn utility-view-rail-btn utility-child-rail-btn`}
                onClick={() => onMessagesSectionChange('toast-history')}
              >
                toast history{toastHistoryCount > 0 ? ` (${toastHistoryCount})` : ''}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={messagesSection === 'diagnostics'}
                className={`btn btn-sm ${
                  messagesSection === 'diagnostics' ? 'btn-primary' : 'btn-outline-secondary'
                } tab-btn subtab-btn utility-view-rail-btn utility-child-rail-btn`}
                onClick={() => onMessagesSectionChange('diagnostics')}
              >
                diagnostics{diagnosticLogCount > 0 ? ` (${diagnosticLogCount})` : ''}
              </button>
              {isEditorAblationEnabled() && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={messagesSection === 'editor-dev'}
                  className={`btn btn-sm ${
                    messagesSection === 'editor-dev' ? 'btn-primary' : 'btn-outline-secondary'
                  } tab-btn subtab-btn utility-view-rail-btn utility-child-rail-btn`}
                  onClick={() => onMessagesSectionChange('editor-dev')}
                >
                  editor dev
                </button>
              )}
            </>
          )}

          {viewMode === 'settings' &&
            SETTINGS_SECTIONS.map((section) => (
              <button
                key={section}
                type="button"
                role="tab"
                aria-selected={settingsSection === section}
                className={`btn btn-sm ${
                  settingsSection === section ? 'btn-primary' : 'btn-outline-secondary'
                } tab-btn subtab-btn settings-section-rail-btn utility-child-rail-btn`}
                onClick={() => onSettingsSectionChange(section)}
              >
                {section}
              </button>
            ))}
        </div>
      </div>
    )
  }

  return (
    <header className={`tabbar ${arrangeMode.active && viewMode === 'main' ? 'is-arranging' : ''}`}>
      <div className="tabbar-row">
        <div ref={primaryTabRailRef} className="tabbar-scroll tabbar-primary" {...primaryTablistProps}>
          {isUtilityView && (
            <>
              {renderUtilityParentButton('about', 'about', onOpenAbout)}
              {renderUtilityParentButton(
                'messages',
                messagesCount > 0 ? `messages (${messagesCount})` : 'messages',
                onOpenMessages,
              )}
              {renderUtilityParentButton('settings', 'settings', onOpenSettings)}
            </>
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
                      if (
                        shouldCreateAnotherTabAfterRenameEnter({
                          type: 'tab',
                          isPendingCreated: onIsPendingCreatedRename('tab', tab.id),
                          tabRenameEnterBehavior,
                          tagFilterActive,
                        })
                      ) {
                        onRenameDraftChange('tab', tab.id, event.currentTarget.value)
                        onAddTab()
                        return
                      }
                      onCommitRename('tab', tab.id, event.currentTarget.value)
                    }
                    if (action === 'commit-and-create') {
                      event.preventDefault()
                      if (!tagFilterActive) onAddTab()
                    }
                    if (action === 'cancel') {
                      event.preventDefault()
                      onCancelRename('tab', tab.id)
                    }
                  }}
                />
              ) : (
                (() => {
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
                      className={`btn btn-sm ${tab.id === activeTab.id ? 'btn-primary' : 'btn-outline-secondary'} tab-btn parent-tab-btn ${arrangeableParentTabClassName} ${isArrangeSelected ? 'is-arrange-selected' : ''} ${isArrangeMoveTarget ? 'is-arrange-target' : ''} ${isArrangeBeforeTarget ? 'is-arrange-target-before' : ''} ${isArrangeAfterTarget ? 'is-arrange-target-after' : ''} ${isArrangeBeforeNeighbor ? 'is-arrange-neighbor-before' : ''} ${isArrangeAfterNeighbor ? 'is-arrange-neighbor-after' : ''} ${draggingParentTabId === tab.id ? 'is-dragging' : ''}`}
                      onClick={(event) => {
                        const modifiers = getSelectionClickModifiers(event)
                        if (onConsumeArrangeClickSuppression(`tab:${tab.id}`)) return
                        if (onHandleArrangeParentSelectionClick(tab.id, modifiers)) {
                          event.preventDefault()
                          return
                        }
                        onClearArrangeSelection()
                        onSelectTab(tab.id, event)
                      }}
                      onDoubleClick={() => {
                        if (viewMode !== 'main' || arrangeMode.active || tagFilterActive) return
                        onBeginEdit({ type: 'tab', id: tab.id })
                      }}
                      onContextMenu={(event) => {
                        const contextPolicy = getArrangeRailContextMenuPolicy({
                          disabled: viewMode !== 'main',
                          arrangeActive: arrangeMode.active,
                        })
                        if (contextPolicy.action === 'ignore') return
                        if (contextPolicy.cancelArrange) onExitArrangeMode()
                        onOpenContextMenuForTab(
                          event,
                          tab.id,
                          contextPolicy.forceMenu ? { force: true } : undefined,
                        )
                      }}
                      onPointerDown={(event) => {
                        const pointerAction = getArrangeRailPointerDownAction({
                          button: event.button,
                          shiftKey: event.shiftKey,
                          ctrlKey: event.ctrlKey,
                          metaKey: event.metaKey,
                          disabled: viewMode !== 'main' || tagFilterActive,
                        })
                        if (pointerAction === 'ignore') return
                        if (pointerAction === 'clear-press-timer') {
                          onClearArrangePressTimer()
                          return
                        }
                        event.currentTarget.setPointerCapture(event.pointerId)
                        onStartArrangeDragSeed(`tab:${tab.id}`, event)
                        if (arrangeMode.active) {
                          onStartArrangeTapCandidate({ key: `tab:${tab.id}`, type: 'tab', tabId: tab.id }, event)
                          return
                        }
                        onStartArrangePress(event, { type: 'tab', tabId: tab.id }, `tab:${tab.id}`)
                      }}
                      onPointerMove={(event) => {
                        if (tagFilterActive) return
                        onGuidedParentPointerMove(tab.id, event)
                        onHandleArrangeTabPointerMove(event, { type: 'tab', tabId: tab.id }, tab.title, 'parent')
                      }}
                      onPointerUp={(event) => {
                        if (viewMode !== 'main') return
                        if (tagFilterActive) return
                        onHandleArrangeTabPointerUp(event, `tab:${tab.id}`, () => {
                          onClearArrangeSelection()
                          onSelectTab(tab.id, event)
                        })
                      }}
                      onPointerLeave={() => {
                        if (viewMode !== 'main') return
                        if (tagFilterActive) return
                        onGuidedParentPointerLeave(tab.id)
                        if (!arrangeMode.active) {
                          onClearArrangePressTimer()
                        }
                      }}
                      onPointerCancel={() => {
                        if (viewMode !== 'main') return
                        if (tagFilterActive) return
                        onCancelArrangeTabPointerDrag()
                      }}
                    >
                      {getTabLabel(tab)}
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
                  data-trash-parent-id={entry.id}
                  aria-selected={trashTabId === entry.id}
                  className={`btn btn-sm tab-btn trash-parent-tab is-trash-selectable ${
                    trashTabId === entry.id ? 'is-selected' : ''
                  } ${
                    trashSelectedParentIds?.has(entry.id) ? 'is-trash-selected' : ''
                  }`}
                  onClick={(event) => {
                    if (onConsumeTrashClickSuppression()) return
                    if (onHandleTrashParentSelectionClick?.(event, entry, trashParentTabs.map((parent) => parent.id))) {
                      return
                    }
                    onSetTrashTabId(entry.id)
                    onSetTrashSubTabId(null)
                  }}
                  onContextMenu={(event) => onOpenContextMenuForTrashTab(event, entry)}
                  onPointerDown={(event) => onTrashParentPointerDown(event, entry)}
                  onPointerMove={onTrashParentPointerMove}
                  onPointerUp={onTrashParentPointerUp}
                  onPointerCancel={onTrashParentPointerCancel}
                >
                  {entry.title}
                </button>
              ))}
            </>
          )}

          {!tagFilterActive && viewMode === 'main' && arrangeMode.active ? (
            <button
              type="button"
              className="tab-sort-btn"
              onClick={() => {
                if (arrangeControlsDisabled) return
                onOpenParentSortModal()
              }}
              aria-label="sort parents"
              data-app-tooltip={tooltipsDisabled ? undefined : 'sort parents'}
              aria-disabled={arrangeControlsDisabled}
              disabled={arrangeControlsDisabled}
            >
              <SortIcon />
            </button>
          ) : !tagFilterActive && viewMode === 'main' && !arrangeMode.active ? (
            <button
              type="button"
              className="btn btn-sm btn-outline-light add-tab-btn"
              onClick={onAddTab}
              aria-label="Add tab"
              data-app-tooltip={tooltipsDisabled ? undefined : 'Add tab'}
            >
              <AppIcon iconId="plus" className="add-tab-icon" />
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
              if (tagFilterActive && viewMode === 'main') {
                onExitTagFilterMode()
                return
              }
              if (arrangeMode.active) {
                onExitArrangeMode()
                return
              }
              if (viewMode === 'settings' || viewMode === 'messages' || viewMode === 'about') {
                onCloseSettingsView()
              }
            }}
            onSetMenuOpen={onSetMenuOpen}
            onToggleSpaceRail={onToggleSpaceRail}
            onToggleDomainRail={onToggleDomainRail}
            onToggleTrash={onToggleTrash}
            onOpenEtCetera={onOpenEtCetera}
            onOpenFilter={onOpenFilter}
            tagFilterControl={tagFilterControl}
          />
        )}
      </div>
      {renderUtilityChildRail()}
    </header>
  )
}
