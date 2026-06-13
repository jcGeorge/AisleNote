import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type CSSProperties,
} from 'react'
import type { Editor } from '@toast-ui/editor'
import { TextSelection } from 'prosemirror-state'
import '@toast-ui/editor/dist/toastui-editor.css'
import type { AppController } from './AppShell'
import {
  cancelScheduledAisleFocusScroll,
  scheduleFocusedAisleScroll,
  type ScheduledAisleFocusScroll,
} from './focused-aisle-scroll'
import {
  STORAGE_NOTEBOOK_RECOVERED_MESSAGE_TYPE,
  buildStorageAlerts,
  shouldShowStorageAlerts,
  shouldShowTipOverlays,
} from './storage-alerts'
import { useActiveNoteModel } from './useActiveNoteModel'
import { useAppNotifications } from './useAppNotifications'
import {
  getArrangeDestinationPromptMessage,
  promptAllowsSpaceSelection,
  type ArrangeDestinationPromptState,
} from '../arrange/arrange-guided-prompt'
import {
  areArrangeRailControlsDisabled,
  areNavigationContextMenusDisabled,
  getArrangeInteractionState,
  isArrangeGuidedCarryActive,
  isArrangeLiveDragActive,
  isArrangeTrashActionActive,
} from '../arrange/arrange-interaction-state'
import {
  resolveArrangeDomainDestination,
  resolveArrangeHierarchyDrop,
  resolveArrangePromptDomainConfirmation,
  resolveArrangePromptSpaceSelection,
  type ArrangeGuidedTransferResolution,
} from '../arrange/arrange-guided-transfer'
import {
  moveHierarchyDropRequestItemToTrash,
  moveParentTabsToSpace,
  moveSubTabsToParentInSpace,
} from '../arrange/arrange-hierarchy'
import { formatArrangeCrossDomainMoveToast, type ArrangeCrossDomainMoveKind } from '../arrange/arrange-move-toast'
import { sortNamedItems, sortSubTabs, sortTabs } from '../arrange/tab-sort'
import { getArrangePreviewGhostItems, useArrangeMode } from '../arrange/useArrangeMode'
import { getToggledRailVisibilitySettings, type RailVisibilityTarget } from '../navigation/rail-visibility'
import { ImageToolsOverlay } from '../components/editor/ImageToolsOverlay'
import { MediaToolsOverlay } from '../components/editor/MediaToolsOverlay'
import { FindReplacePanel } from '../components/editor/FindReplacePanel'
import { NoteMentionMenu } from '../components/editor/NoteMentionMenu'
import { ShortcutMenu } from '../components/editor/ShortcutMenu'
import { TagAutocompleteMenu } from '../components/editor/TagAutocompleteMenu'
import { TableControlsOverlay } from '../components/editor/TableControlsOverlay'
import { getFindReplaceShortcutMode } from '../components/editor/find-replace-shortcuts'
import {
  getShortcutMenuKeyboardAction,
  isShortcutMenuKeyboardKey,
} from '../components/editor/shortcut-menu-keyboard'
import { AisleEditModal } from '../components/notes/AisleEditModal'
import { MessagesView } from '../components/messages/MessagesView'
import { NoteWorkspace } from '../components/notes/NoteWorkspace'
import { scrollAislePaneIntoHorizontalView } from '../components/notes/aisle-horizontal-scroll'
import { SubTabRail } from '../components/navigation/SubTabRail'
import {
  CompactDomainRail,
  CompactScopeDragPreview,
  CompactSpaceRail,
  TrashDomainRail,
  TrashSpaceRail,
} from '../components/navigation/CompactScopeRails'
import { NavigationRailControls, type NavigationRailAction } from '../components/navigation/NavigationRailControls'
import { NoteFilterControl } from '../components/navigation/NoteFilterControl'
import {
  GuidedTabArrangeCarryPreview,
  TabArrangeDragPreviewOverlay,
} from '../components/navigation/TabArrangeDragPreviewOverlay'
import {
  TrashRailDragPreviewOverlay,
  type TrashRailDragPreview,
} from '../components/navigation/TrashRailDragPreviewOverlay'
import {
  getArrangeDragPreviewBelowPointerTop,
  getArrangeDragPreviewCenteredLeft,
} from '../components/navigation/arrange-drag-preview-style'
import { TopBar } from '../components/navigation/TopBar'
import { ArrangeDestinationPrompt } from '../components/overlays/ArrangeDestinationPrompt'
import { AppTooltipLayer } from '../components/overlays/AppTooltipLayer'
import {
  ContextMenuHost,
  type EditorAisleInsertSide,
  type EditorClipboardAction,
  type EditorPasteDestination,
} from '../components/overlays/ContextMenuHost'
import { ModalHost } from '../components/overlays/ModalHost'
import { StorageAlertHost, type StorageAlert } from '../components/overlays/StorageAlertHost'
import { TipHost } from '../components/overlays/TipHost'
import { ToastHost } from '../components/overlays/ToastHost'
import {
  shouldDismissContextMenuFromKey,
  shouldDismissContextMenuFromPointerTarget,
} from '../components/overlays/context-menu-dismissal'
import { SettingsPage } from '../components/settings/SettingsPage'
import { TrashHomeNote } from '../components/trash/TrashHomeNote'
import { TrashMarkdownPreview } from '../components/trash/TrashMarkdownPreview'
import { AboutView } from '../components/about/AboutView'
import { applyListToolbarCommand, type ToolbarListCommand } from '../editor/list-marker-commands'
import {
  applyEditorNewlineOperation,
  getAislePlacementForNewlineOperation,
  isAisleNewlineOperation,
} from '../editor/newline-operations'
import {
  finishEditorOperation,
  insertEditorTextOperation,
  replaceSelectedTextWithTableOperation,
  runEditorCommandOperation,
  type EditorOperationRuntime,
} from '../editor/editor-operation-runner'
import { closeEditorEphemera, type CloseEditorEphemeraOptions } from '../editor/editor-ephemera'
import {
  deleteFocusedAisleFromDraft,
  getAislesForNewAisle,
  isEmptyAisleMarkdown,
  MAX_AISLE_WARNING_MESSAGE,
} from '../editor/aisle-edit-draft'
import type { AisleStructuralSnapshot } from '../editor/aisle-structural-history'
import {
  buildFocusedAisleStructuralPasteReplacement,
  getCopyAsNewAislePasteFocusedAisleReplacementMode,
  getCopyAsPasteHereFocusedAisleReplacementMode,
  type FocusedAisleStructuralPasteMode,
} from '../editor/aisle-copy-paste'
import {
  insertNewAisles,
  insertNewAislesWithReclaimedSlots,
  replaceFocusedAisleWithNewAisles,
} from '../editor/aisle-insertion'
import { getAisleIdFromAisleEditorKey } from '../editor/aisle-editor'
import {
  getActiveAisleRefSyncValue,
  shouldDeferAisleCycleForMouseActivation,
  shouldFocusAislePointerActivation,
  type AisleActivationSource,
} from '../editor/aisle-activation'
import { useAisleController } from '../editor/useAisleController'
import {
  getTagDecorationRanges,
  TAG_JUMP_GLOW_DURATION_MS,
  TAG_JUMP_HIGHLIGHT_META,
  TAG_JUMP_TARGET_CLASS_NAME,
} from '../editor/editor-setup'
import { useLegacyEditor } from '../editor/useLegacyEditor'
import { isHeadingCollapsed, setHeadingCollapsed } from '../editor/heading-collapse-state'
import {
  TABLE_OF_CONTENTS_EMPTY_MESSAGE,
  buildTableOfContentsPanels,
  type TableOfContentsPanelsState,
} from '../editor/table-of-contents'
import type { TableOfContentsLinkItem } from '../editor/table-of-contents-links'
import {
  installAisleEditorPerfStateWindowHelpers,
  runAisleEditorPerfTiming,
} from '../perf/aisle-editor-perf-state'
import {
  getCommandCapableEditor,
  collectProseMirrorTextPositions,
  getWysiwygView,
  runWysiwygHistory,
  type WysiwygHistoryDirection,
  type WysiwygHistoryResult,
} from '../editor/prosemirror-utils'
import { useAisleEditors } from '../editor/useAisleEditors'
import { isCodeMirrorMarkdownEditor } from '../editor/codemirror-markdown-editor'
import { useEditorDomEvents } from '../editor/useEditorDomEvents'
import { useEditorPersistence } from '../editor/useEditorPersistence'
import { useEditorToolbarLayer } from '../editor/useEditorToolbarLayer'
import { useEditorToolbarState } from '../editor/useEditorToolbarState'
import { readClipboardMarkdown } from '../editor/clipboard-paste-markdown'
import { insertVisualClipboardMarkdownIntoView, insertVisualClipboardTextIntoView } from '../editor/visual-clipboard'
import { DEFAULT_TOOLBAR_LAYOUT_ID, resolveToolbarLayout } from '../editor/toolbar-layouts'
import { useImageTools } from '../editor/useImageTools'
import { useMediaTools } from '../editor/useMediaTools'
import { useTableControls } from '../editor/useTableControls'
import { selectFirstTableCellAfterPosition } from '../editor/table-editing'
import { clearEditorMarkdownForDisplay, getEditorMarkdownForPersistence, setEditorMarkdownForDisplay } from '../editor/editor-markdown-display'
import {
  configureDiagnosticLogging,
  createMainThreadHeartbeat,
  getDiagnosticSessionId,
  recordDiagnosticEvent,
} from '../diagnostics/diagnostic-logger'
import {
  listDiagnosticLogDays,
  readDiagnosticLogEntries,
  subscribeDiagnosticLogChanges,
} from '../diagnostics/diagnostic-log-store'
import {
  DIAGNOSTIC_LOG_MAX_ENTRIES_PER_DAY,
  type DiagnosticLogDisplayLimit,
  type DiagnosticLogEntry,
  type DiagnosticLogLevelFilter,
  type DiagnosticLogMode,
  orderDiagnosticDaysForDisplay,
} from '../diagnostics/diagnostic-log'
import { withDefaultInsertedImageDisplayWidth } from '../editor/image-insertion'
import { buildMediaMarkdownLink, insertAssetLinksIntoWysiwygView } from '../editor/media-file-insertion'
import type { MultiLineHeadingLevel } from '../editor/multiline-format-operations'
import type { MultiLineListOperation } from '../editor/multiline-list-operations'
import { useMultilineEditing } from '../editor/useMultilineEditing'
import { useNoteCursorPersistence, usePendingNoteCursorRestore } from '../editor/useNoteCursorPersistence'
import {
  COMPLETED_TASK_UNDO_HINT_COOLDOWN_MS,
  COMPLETED_TASK_UNDO_HINT_DETECTION_MS,
} from '../editor/task-behavior'
import { buildFrontmatterModalDraftForAisle } from '../frontmatter/frontmatter-state'
import { getCycledAisleTarget, useGlobalHotkeys } from '../hotkeys/useGlobalHotkeys'
import { normalizeHotkeySettings } from '../hotkeys/shortcuts'
import { normalizeMarkdownForPersistence } from '../markdown/markdown-utils'
import { importBlobAsAssetUrl, importImageBlobAsAssetUrl, revealAssetUrl } from '../markdown/image-asset-registry'
import {
  MEDIA_REVEAL_CONTEXT_MENU_EVENT,
  type MediaRevealContextMenuDetail,
} from '../media/media-context-menu'
import { useNavigationHistory } from '../navigation/useNavigationHistory'
import { getNotesFilterToggleIntent, isNotesFilterModeActive } from '../navigation/toggle-notes-filter'
import { getNextNotesTrashToggleState } from '../navigation/toggle-notes-trash'
import { getNextNotesScratchpadToggleState } from '../navigation/toggle-notes-scratchpad'
import { useAppNavigationActions } from '../navigation/useAppNavigationActions'
import { getNextUtilityChildSelection } from '../navigation/utility-child-cycle'
import {
  clearRenameDraftIfMatching,
  createRenameDraft,
  type RenameDraft,
  type RenameEntityType,
} from '../navigation/rename-draft'
import { buildNoteLocationKey, getLocationInfo, listNoteLocationsForBody } from '../notes/note-locations'
import {
  buildAisleSlotKey,
  decoupleAisleSlotsInState,
  getLinkedAisleIdsForNoteBody,
  listLinkedAisleSlotsForAisleBody,
} from '../notes/aisle-links'
import { openExternalWebUrl } from '../notes/external-links'
import {
  buildDefaultNoteReferenceDraft,
  buildExternalLinkEditDraft,
  buildInternalNoteLinkEditDraft,
  buildUrlLinkShortcutDraft,
  type NoteReferenceSource,
} from '../notes/note-reference-model'
import {
  buildCopyAsClipboardData,
  buildScratchpadAisleCopyAsClipboardData,
  getCopyAsAisleIdForNoteContext,
  getCopyAsPasteSuccessMessage,
  getCopyAsSuccessMessage,
  getScratchpadStructuralPastePayload,
  isScratchpadCopyAsSource,
  isCopyAsClipboardTextMarker,
  parseCopyAsTextMarker,
  readCopyAsPayloadFromClipboard,
  type CopyAsAction,
  type CopyAsClipboardPayload,
  type CopyAsScope,
  writeCopyAsClipboardData,
} from '../notes/copy-as-clipboard'
import { buildCopyAsPasteCommand, getNoteBodyPreviewMarkdowns } from '../notes/note-reference-commands'
import {
  normalizeMarkdownNoteReferencesForEditor,
  prepareMarkdownNoteReferencesForEditor,
  type NotePreviewDeleteRequest,
} from '../notes/note-references'
import { useNoteMentionController } from '../notes/useNoteMentionController'
import {
  applyNoteCopyToState,
  materializeStructuralAisleCopiesForInsertion,
} from '../notes/note-copy-service'
import { getNoteMentionAisleCopyTarget } from '../notes/note-mention-picker'
import { getAisleBodyId } from '../notes/note-markdown'
import { cloneAisles, getAisleMarkdown } from '../notes/aisle-body-state'
import { resetAisleWidthForLocation, setAisleWidthForLocation } from '../notes/aisle-widths'
import {
  applyFindReplacementToState,
  SCRATCHPAD_FIND_LOCATION,
  findVisibleMatches,
  getFindReplaceQueryError,
  isScratchpadFindLocation,
  type FindReplaceScope,
} from '../notes/find-replace'
import { useNoteReferenceActions } from '../notes/useNoteReferenceActions'
import {
  LAST_DOMAIN_TOAST,
  LAST_PARENT_TAB_TOAST,
  LAST_SPACE_TOAST,
  formatMovedToTrashToast,
  useAppOverlayActions,
} from '../overlays/useAppOverlayActions'
import { decoupleNoteLocationsInState } from '../overlays/note-decouple'
import { measureSlowOperation } from '../performance/performance-logging'
import { getRuntimeDataCapabilities } from '../platform/data-platform'
import {
  ALWAYS_SHOW_DOMAINS_WITHOUT_SPACES_MESSAGE,
  DEFAULT_UI_SETTINGS,
  clampToolbarButtonScale,
  getThemePaletteForTheme,
  isCustomTheme,
} from '../settings/defaults'
import { useSettingsController } from '../settings/useSettingsController'
import {
  getBuiltInThemeOverrideCssVariables,
  getCustomThemeCssVariables,
  getThemeShellCustomClassName,
} from '../settings/theme-css-variables'
import { applyPortableAppSettings } from '../storage/settings-partition.js'
import { DEFAULT_STATE, applyAutoPurgeToAppState, ensureNoteBodiesForAppState, parseSavedState } from '../state/app-state'
import { useNotebookTransferActions } from '../import/useNotebookTransferActions'
import { useUserSettingsTransferActions } from '../settings/useUserSettingsTransferActions'
import {
  DEFAULT_SCRATCHPAD_AISLE_LIMIT,
  SCRATCHPAD_CONTENT_TARGET_ID,
  SCRATCHPAD_CURSOR_LOCATION_KEY,
  clampScratchpadAisleLimit,
  getScratchpadActiveAisleId,
  getScratchpadNoteBody,
  setScratchpadActiveAisleId,
} from '../state/scratchpad'
import {
  projectActiveDomainState,
  addDomain,
  addSpaceToActiveDomain,
  createDomain,
  setActiveDomain,
  setActiveSpaceInActiveDomain,
  updateActiveDomainSpaces,
  updateActiveSpaceDataInActiveDomain,
  updateSpaceInActiveDomain,
} from '../state/domains'
import {
  createTab,
  createSpace,
  MAX_NOTE_AISLES,
} from '../state/workspace'
import { collectAppNavigationEntityIds, createReservedIdAllocator } from '../state/navigation-ids'
import {
  appendVisibleNoteFilterCount,
  getVisibleNoteFilterCountLabel,
} from './note-filter-display'
import {
  getNoteFilterRailVisibility,
  getNoteFilterNavigationTarget,
  reconcileActiveNoteFilterSettings,
} from './note-filter-state'
import {
  buildNoteFilterIndex,
  getFirstMatchingNoteFilterLocationForDomain,
  getFirstMatchingNoteFilterLocationForParent,
  getFirstMatchingNoteFilterLocationForSpace,
  getFrontmatterPropertyFilterKey,
  getFrontmatterTemplateFilterKey,
  getNoteFilterOccurrencesForLocation,
  getNoteFilterParentKey,
  getNoteFilterSpaceKey,
  getPrimaryNoteFilterOccurrencesForLocation,
  getSyncedAisleFilterKey,
  getSyncedNoteFilterKey,
  sortNoteFilterOptions,
  type NoteFilterOccurrence,
} from '../filters/note-filter'
import {
  normalizeTagKey,
  type TagFilterOccurrence,
} from '../tags/tag-filter'
import { normalizeTagAutocompleteRecentKeys } from '../tags/tag-autocomplete'
import { useTagAutocompleteController } from '../tags/useTagAutocompleteController'
import { usePersistentAppState } from '../storage/usePersistentAppState'
import {
  loadDeviceSettings,
  saveActiveToolbarLayoutId,
  saveDeviceLastOpened,
  savePartialDeviceSettings,
  shouldRestoreScratchpadWorkspace,
  type DeviceEtCeteraViewMode,
  type DeviceSettings,
} from '../storage/device-settings-store'
import { useStorageProfileController } from '../storage/useStorageProfileController'
import { useUserSettingsLocationController } from '../storage/useUserSettingsLocationController'
import {
  TRASH_DELETE_CONFIRMATION_TIP_ID,
  shouldConfirmTrashDeleteForReal,
  shouldShowTrashDeleteConfirmationTip,
} from '../trash/trash-delete-confirmation'
import { getDefaultTrashSubTabIdForParent, TRASH_HOME_ID } from '../trash/trash-model'
import { useTrashSelection } from '../trash/useTrashSelection'
import {
  EMPTY_TRASH_SELECTION,
  getEffectiveTrashContextTargets,
  getTrashDomainTargets,
  getTrashParentTarget,
  getTrashSelectionActiveReplacementId,
  getTrashSpaceTargets,
  getTrashSubTabTarget,
  getTrashTargetFromContextMenu,
  getTrashTargetsForSelection,
  hasTrashSelectionModifier,
  isTrashDomainSelectable,
  isTrashSpaceSelectable,
  updateTrashSelectionForClick,
  type TrashSelectionClickModifiers,
  type TrashSelectionKind,
  type TrashSelectionState,
} from '../trash/trash-selection'
import type {
  AboutSection,
  AppMessage,
  AppState,
  ArrangeHierarchyDropRequest,
  ArrangeInsertPosition,
  ContextMenuState,
  DeleteTarget,
  InternalNoteLinkEdit,
  LinkEditRange,
  LinkInsertMode,
  MessagesSection,
  ModalState,
  MultiLineInlineFormat,
  NewAislePlacement,
  NewlineOperationId,
  NoteFilterKind,
  NoteFilterSettings,
  NoteBody,
  NoteAisleBody,
  NoteCopyMode,
  NoteLocation,
  NoteNavigationTarget,
  NotePreviewEdit,
  PendingCreatedEdit,
  ResolvedNoteAisle,
  StorageProfileStatus,
  TabSortMode,
  TabSortTarget,
  TabArrangeDragPreview,
  ViewMode,
  WorkspaceData,
  ToastTone,
} from '../types/app'
import type { ElectronNoteRevealPayload } from '../types/electron-api'

type EtCeteraViewMode = DeviceEtCeteraViewMode

function isEtCeteraViewMode(viewMode: ViewMode): viewMode is EtCeteraViewMode {
  return viewMode === 'about' || viewMode === 'messages' || viewMode === 'settings'
}

type ShortcutMenuState = {
  top: number
  left: number
  operations: NewlineOperationId[]
}

type FindReplacePanelState = {
  open: boolean
  replaceMode: boolean
  focusRequestId: number
  query: string
  replacement: string
  scope: FindReplaceScope
  caseSensitive: boolean
  wholeWord: boolean
  regex: boolean
  activeIndex: number
}

type CopyAsMenuItemState = {
  available: boolean
  reason?: string
  visible?: boolean
}

type CopyAsMenuState = {
  note?: Record<CopyAsAction, CopyAsMenuItemState>
  aisle?: Record<CopyAsAction, CopyAsMenuItemState>
}

const COPY_AS_MENU_ACTIONS: CopyAsAction[] = ['copy', 'duplicate', 'link', 'preview']
const SCRATCHPAD_COPY_AISLE_LIMIT_MESSAGE =
  'This copy operation would exceed the number of available aisles in scratchpad. Please increase the number of aisles for scratchpad in misc settings or delete unused scratchpad aisles.'

const TOOLBAR_LIST_COMMAND_TO_MULTILINE_OPERATION: Partial<Record<ToolbarListCommand, MultiLineListOperation>> = {
  taskList: 'task',
  dashList: 'dashList',
  bulletList: 'bulletList',
  orderedList: 'numberedList',
}

function getMultiLineListOperationForNewlineOperation(
  operation: NewlineOperationId,
): MultiLineListOperation | null {
  if (
    operation === 'task' ||
    operation === 'dashList' ||
    operation === 'bulletList' ||
    operation === 'numberedList'
  ) {
    return operation
  }
  return null
}

type EditableEntityType = 'tab' | 'subtab' | 'space' | 'domain'

let renameInputMeasureContext: CanvasRenderingContext2D | null = null

function getCurrentTimestamp() {
  return Date.now()
}

function getElementForDomPositionNode(node: Node | null): Element | null {
  if (!node) return null
  if (typeof Element !== 'undefined' && node instanceof Element) return node
  return node.parentElement ?? null
}

type ProseMirrorDomView = {
  dom: Element
  domAtPos: (position: number) => { node: Node | null }
}

function isProseMirrorDomView(value: unknown): value is ProseMirrorDomView {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'dom' in value &&
      typeof Element !== 'undefined' &&
      (value as { dom?: unknown }).dom instanceof Element &&
      typeof (value as { domAtPos?: unknown }).domAtPos === 'function',
  )
}

function scrollProseMirrorTagRangeIntoView(view: unknown, from: number): void {
  if (!isProseMirrorDomView(view)) return
  const highlighted = view.dom.querySelector?.(`.${TAG_JUMP_TARGET_CLASS_NAME}`) ?? null
  if (typeof Element !== 'undefined' && highlighted instanceof Element) {
    highlighted.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
    return
  }
  try {
    getElementForDomPositionNode(view.domAtPos(from).node)?.scrollIntoView({
      block: 'center',
      inline: 'nearest',
      behavior: 'smooth',
    })
  } catch {
    // The glow is still useful even when a transient editor remount prevents range scrolling.
  }
}

function shouldRecordStorageProfileDiagnostic(status: StorageProfileStatus): boolean {
  if (status.status === 'error' || status.health === 'error') return true
  const event = status.event ?? 'ready'
  if (event === 'external-loaded' || event === 'external-error') return true
  if (event.startsWith('notebook-auto-recovered') || event === 'notebook-recovery-error') return true
  if (status.health === 'warning') {
    return event !== 'ready' && event !== 'saved' && event !== 'external-echo-ignored'
  }
  return false
}

export function useAppController(): AppController {
  const dataCapabilities = useMemo(() => getRuntimeDataCapabilities(), [])
  const initialDeviceSettingsRef = useRef<DeviceSettings | null>(null)
  if (initialDeviceSettingsRef.current === null) {
    initialDeviceSettingsRef.current = loadDeviceSettings()
  }
  const { state, setState, stateRef, flushPendingPersistence, commitAppStateNow } = usePersistentAppState()
  const [viewMode, setViewMode] = useState<ViewMode>(() => initialDeviceSettingsRef.current?.lastOpened?.viewMode ?? 'main')
  const lastEtCeteraViewModeRef = useRef<EtCeteraViewMode>(
    isEtCeteraViewMode(viewMode)
      ? viewMode
      : initialDeviceSettingsRef.current?.lastEtCeteraViewMode ?? 'settings',
  )
  const [scratchpadActive, setScratchpadActive] = useState(() =>
    shouldRestoreScratchpadWorkspace(initialDeviceSettingsRef.current?.lastOpened),
  )
  const toggleViewModeRef = useRef<ViewMode>(viewMode)
  const toggleScratchpadActiveRef = useRef(scratchpadActive)
  const [editing, setEditing] = useState<{ type: EditableEntityType; id: string } | null>(null)
  const beginEdit = useCallback((target: { type: EditableEntityType; id: string }) => {
    measureSlowOperation('navigation beginEdit', () => setEditing(target))
  }, [])
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [modal, setModal] = useState<ModalState | null>(null)
  const insertNoteReferenceModalOpen = modal?.type === 'insert-note-reference'
  const [shortcutMenu, setShortcutMenu] = useState<ShortcutMenuState | null>(null)
  const [shortcutMenuActiveIndex, setShortcutMenuActiveIndex] = useState(0)
  const [tableOfContentsPanels, setTableOfContentsPanels] = useState<TableOfContentsPanelsState | null>(null)
  const [findReplacePanel, setFindReplacePanel] = useState<FindReplacePanelState>({
    open: false,
    replaceMode: state.ui.findReplaceMode === 'replace',
    focusRequestId: 0,
    query: initialDeviceSettingsRef.current?.lastFindQuery ?? '',
    replacement: '',
    scope: state.ui.findReplaceScope ?? 'note',
    caseSensitive: state.ui.findCaseSensitive ?? false,
    wholeWord: state.ui.findWholeWord ?? false,
    regex: state.ui.findRegex ?? false,
    activeIndex: 0,
  })
  const [noteFilterMenuOpen, setNoteFilterMenuOpen] = useState(false)
  const [noteFilterCycleByLocation, setNoteFilterCycleByLocation] = useState<Record<string, number>>({})
  const [noteFilterCycleByOption, setNoteFilterCycleByOption] = useState<Record<string, number>>({})
  const [tagAutocompleteRecentKeys, setTagAutocompleteRecentKeys] = useState<string[]>(() =>
    normalizeTagAutocompleteRecentKeys(initialDeviceSettingsRef.current?.tagAutocompleteRecentKeys),
  )
  const [arrangeDestinationPrompt, setArrangeDestinationPrompt] =
    useState<ArrangeDestinationPromptState | null>(null)
  const [guidedParentRailTarget, setGuidedParentRailTarget] =
    useState<{ targetId: string; position: ArrangeInsertPosition | null } | null>(null)
  const isMacPlatform = typeof navigator !== 'undefined' ? /mac/i.test(navigator.platform) : false
  const [menuOpen, setMenuOpen] = useState(false)
  const [messagesSection, setMessagesSectionState] = useState<MessagesSection>(
    () => initialDeviceSettingsRef.current?.messagesSection ?? 'inbox',
  )
  const [aboutSection, setAboutSectionState] = useState<AboutSection>(
    () => initialDeviceSettingsRef.current?.aboutSection ?? 'home',
  )
  const [diagnosticLogDays, setDiagnosticLogDays] = useState<string[]>([])
  const [selectedDiagnosticDay, setSelectedDiagnosticDay] = useState<string>('')
  const [diagnosticLogEntries, setDiagnosticLogEntries] = useState<DiagnosticLogEntry[]>([])
  const [diagnosticLevelFilter, setDiagnosticLevelFilter] = useState<DiagnosticLogLevelFilter>('all')
  const [diagnosticDisplayLimit, setDiagnosticDisplayLimit] = useState<DiagnosticLogDisplayLimit>(500)
  const [diagnosticMode, setDiagnosticMode] = useState<DiagnosticLogMode>('actionable')
  const [diagnosticCaptureEnabled, setDiagnosticCaptureEnabledState] = useState(
    () => initialDeviceSettingsRef.current?.captureDiagnostics ?? true,
  )
  const diagnosticCaptureEnabledRef = useRef(diagnosticCaptureEnabled)
  const [trashDomainId, setTrashDomainId] = useState<string>('')
  const [trashSpaceId, setTrashSpaceId] = useState<string>('')
  const [trashTabId, setTrashTabId] = useState<string>(TRASH_HOME_ID)
  const [trashSubTabId, setTrashSubTabId] = useState<string | null>(null)
  const [trashSelection, setTrashSelection] = useState<TrashSelectionState>(EMPTY_TRASH_SELECTION)
  const [trashDragTargets, setTrashDragTargets] = useState<DeleteTarget[]>([])
  const [trashDragPreview, setTrashDragPreviewState] = useState<TrashRailDragPreview | null>(null)
  const [isDraggingOverTrashDrop, setIsDraggingOverTrashDrop] = useState(false)
  const [activeAisleId, setActiveAisleId] = useState<string>('')
  const [activeToolbarLayoutId, setActiveToolbarLayoutIdState] = useState<string>(
    () => initialDeviceSettingsRef.current?.activeToolbarLayoutId ?? DEFAULT_TOOLBAR_LAYOUT_ID,
  )
  const [dismissedStorageAlertSignatures, setDismissedStorageAlertSignatures] = useState<string[]>([])

  useEffect(() => {
    if (isEtCeteraViewMode(viewMode)) {
      lastEtCeteraViewModeRef.current = viewMode
      savePartialDeviceSettings({ lastEtCeteraViewMode: viewMode })
    }
  }, [viewMode])

  const setMessagesSection = useCallback((section: MessagesSection) => {
    setMessagesSectionState(section)
    savePartialDeviceSettings({ messagesSection: section, lastEtCeteraViewMode: 'messages' })
  }, [])

  const setAboutSection = useCallback((section: AboutSection) => {
    setAboutSectionState(section)
    savePartialDeviceSettings({ aboutSection: section, lastEtCeteraViewMode: 'about' })
  }, [])

  const editorMountRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<Editor | null>(null)
  const aisleScrollRef = useRef<HTMLDivElement | null>(null)
  const aisleHorizontalScrollByBodyRef = useRef<Map<string, number>>(new Map())
  const pendingScrollToAisleIdRef = useRef<string | null>(null)
  const pendingAisleFocusScrollRef = useRef<ScheduledAisleFocusScroll>({
    firstFrameId: null,
    followupFrameId: null,
  })
  const pendingFocusToAisleIdRef = useRef<string | null>(null)
  const trashDragCandidateRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    kind: TrashRailDragPreview['kind']
    scopeId: string | null
    draggedId: string
    selectedIds: string[]
    targets: DeleteTarget[]
    label: string
    rail: HTMLElement | null
    selector: string
    attributeName: string
    getLabel: (id: string) => string | undefined
    sourceRect: {
      left: number
      top: number
      width: number
      height: number
    }
  } | null>(null)
  const trashDragPreviewRef = useRef<TrashRailDragPreview | null>(null)
  const trashDragWindowCleanupRef = useRef<(() => void) | null>(null)
  const requestDeleteTrashTargetsForRealRef = useRef<(targets: readonly DeleteTarget[]) => void>((targets) => {
    if (targets.length === 0) return
    setModal({ type: 'delete-trash-targets', targets: [...targets] })
  })
  const suppressTrashClickRef = useRef(false)
  const pendingMouseAisleActivationRef = useRef<{ aisleId: string; settled: boolean } | null>(null)
  const pendingMouseAisleCycleFrameRef = useRef<number | null>(null)
  const pendingNavigationHeadingRef = useRef<NonNullable<NoteNavigationTarget['heading']> | null>(null)
  const pendingNavigationAisleIdRef = useRef<string | null>(null)
  const pendingNavigationTopAisleIdRef = useRef<string | null>(null)
  const pendingTagOccurrenceRef = useRef<TagFilterOccurrence | null>(null)
  const tagJumpClearTimerRef = useRef<number | null>(null)
  const tagJumpRequestIdRef = useRef(0)
  const activeAisleIdsRef = useRef<string[]>([])
  const activeNoteBodyIdRef = useRef<string>('')
  const editorEventRootRef = useRef<HTMLElement | null>(null)
  const closeShortcutMenuRef = useRef<(options?: { restoreEditorFocus?: boolean }) => void>(() => {})
  const runShortcutOperationFromMenuRef = useRef<(operation: NewlineOperationId) => void>(() => {})
  const deleteNotePreviewRef = useRef<(request: NotePreviewDeleteRequest) => void>(() => {})
  const pendingCreatedEditRef = useRef<PendingCreatedEdit | null>(null)
  const editingRef = useRef<{ type: EditableEntityType; id: string } | null>(null)
  const renameDraftRef = useRef<RenameDraft | null>(null)
  const skipRenameBlurRef = useRef<{ type: EditableEntityType; id: string } | null>(null)
  const closeImageToolsRef = useRef<() => void>(() => {})
  const closeImageToolsIfSelectedImageMissingRef = useRef<() => void>(() => {})
  const closeMediaToolsRef = useRef<() => void>(() => {})
  const closeTableControlsRef = useRef<() => void>(() => {})
  const closeEditorEphemeraRef = useRef<(options?: CloseEditorEphemeraOptions) => void>(() => {})
  const activateAisleEditorRef = useRef<
    (
      editorKey: string,
      options?: {
        focus?: boolean
        flushPrevious?: boolean
        allowDuringPendingRename?: boolean
        source?: AisleActivationSource
      },
    ) => boolean
  >(() => false)
  const completedTaskDeleteUndoCandidateRef = useRef<{ beforeMarkdown: string; deletedAt: number } | null>(null)
  const completedTaskUndoToastAtRef = useRef(0)
  const activeSpaceIdRef = useRef<string>('')
  const activeDomainIdRef = useRef<string>('')
  const activeTabIdRef = useRef<string>('')
  const activeSubTabIdRef = useRef<string | null>(null)
  const activeAisleIdRef = useRef<string>('')
  const activeEditorAisleIdRef = useRef<string>('')
  const activeNoteLocationKeyRef = useRef<string>('')
  const isMainViewRef = useRef(true)
  const flushStorageActionStateRef = useRef<() => Promise<void> | void>(() => {})
  const messagesSectionRef = useRef<MessagesSection>(messagesSection)
  const selectedDiagnosticDayRef = useRef(selectedDiagnosticDay)

  useEffect(() => {
    if (!import.meta.env?.DEV) return
    installAisleEditorPerfStateWindowHelpers()
  }, [])

  useEffect(() => {
    const closeOverlays = () => {
      setContextMenu(null)
      setMenuOpen(false)
    }
    window.addEventListener('click', closeOverlays)
    window.addEventListener('resize', closeOverlays)
    window.addEventListener('scroll', closeOverlays, true)
    return () => {
      window.removeEventListener('click', closeOverlays)
      window.removeEventListener('resize', closeOverlays)
      window.removeEventListener('scroll', closeOverlays, true)
    }
  }, [])

  useEffect(() => {
    if (!contextMenu) return
    const closeContextMenuOnOutsidePointerDown = (event: PointerEvent) => {
      if (shouldDismissContextMenuFromPointerTarget(event.target)) {
        setContextMenu(null)
      }
    }
    const closeContextMenuOnEscape = (event: KeyboardEvent) => {
      if (shouldDismissContextMenuFromKey(event.key)) {
        setContextMenu(null)
      }
    }
    document.addEventListener('pointerdown', closeContextMenuOnOutsidePointerDown, true)
    document.addEventListener('keydown', closeContextMenuOnEscape, true)
    return () => {
      document.removeEventListener('pointerdown', closeContextMenuOnOutsidePointerDown, true)
      document.removeEventListener('keydown', closeContextMenuOnEscape, true)
    }
  }, [contextMenu])

  useEffect(() => {
    const openMediaContextMenu = (event: Event) => {
      const detail = (event as CustomEvent<MediaRevealContextMenuDetail>).detail
      if (!detail?.source) return
      closeEditorEphemeraRef.current()
      setMenuOpen(false)
      setContextMenu({
        type: 'media',
        x: detail.x,
        y: detail.y,
        kind: detail.kind,
        source: detail.source,
      })
    }
    window.addEventListener(MEDIA_REVEAL_CONTEXT_MENU_EVENT, openMediaContextMenu)
    return () => window.removeEventListener(MEDIA_REVEAL_CONTEXT_MENU_EVENT, openMediaContextMenu)
  }, [])

  useEffect(() => () => {
    cancelScheduledAisleFocusScroll(pendingAisleFocusScrollRef.current, window)
    if (pendingMouseAisleCycleFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingMouseAisleCycleFrameRef.current)
      pendingMouseAisleCycleFrameRef.current = null
    }
    if (tagJumpClearTimerRef.current !== null) {
      window.clearTimeout(tagJumpClearTimerRef.current)
      tagJumpClearTimerRef.current = null
    }
  }, [])

  const loadDiagnosticEntriesForDay = useCallback(async (dayKey: string) => {
    const entries = dayKey ? await readDiagnosticLogEntries(dayKey) : []
    setDiagnosticLogEntries(entries)
  }, [])

  const refreshDiagnosticLogs = useCallback(async (preferredDay = selectedDiagnosticDayRef.current) => {
    const days = await listDiagnosticLogDays()
    const nextDay = preferredDay && days.includes(preferredDay) ? preferredDay : days[0] ?? ''
    selectedDiagnosticDayRef.current = nextDay
    setDiagnosticLogDays(days)
    setSelectedDiagnosticDay(nextDay)
    await loadDiagnosticEntriesForDay(nextDay)
  }, [loadDiagnosticEntriesForDay])

  const changeDiagnosticDay = useCallback((dayKey: string) => {
    selectedDiagnosticDayRef.current = dayKey
    setSelectedDiagnosticDay(dayKey)
    void loadDiagnosticEntriesForDay(dayKey)
  }, [loadDiagnosticEntriesForDay])

  useEffect(() => {
    messagesSectionRef.current = messagesSection
    if (messagesSection === 'diagnostics') {
      void refreshDiagnosticLogs()
    }
  }, [messagesSection, refreshDiagnosticLogs])

  useEffect(() => {
    selectedDiagnosticDayRef.current = selectedDiagnosticDay
  }, [selectedDiagnosticDay])

  useEffect(
    () =>
      subscribeDiagnosticLogChanges((entry) => {
        if (messagesSectionRef.current !== 'diagnostics') return
        setDiagnosticLogDays((currentDays) => orderDiagnosticDaysForDisplay([entry.dayKey, ...currentDays]))
        const selectedDay = selectedDiagnosticDayRef.current
        if (!selectedDay) {
          selectedDiagnosticDayRef.current = entry.dayKey
          setSelectedDiagnosticDay(entry.dayKey)
          setDiagnosticLogEntries([entry])
          return
        }
        if (selectedDay === entry.dayKey) {
          setDiagnosticLogEntries((currentEntries) =>
            [...currentEntries, entry].slice(-DIAGNOSTIC_LOG_MAX_ENTRIES_PER_DAY),
          )
        }
      }),
    [],
  )

  useEffect(
    () =>
      configureDiagnosticLogging(() => ({
        viewMode: toggleViewModeRef.current,
        scratchpadActive: toggleScratchpadActiveRef.current,
        activeDomainId: activeDomainIdRef.current,
        activeSpaceId: activeSpaceIdRef.current,
        activeTabId: activeTabIdRef.current,
        activeSubTabId: activeSubTabIdRef.current,
        activeNoteBodyId: activeNoteBodyIdRef.current,
        activeAisleId: activeAisleIdRef.current,
        activeEditorAisleId: activeEditorAisleIdRef.current,
        activeAisleCount: activeAisleIdsRef.current.length,
        pendingScrollToAisleId: pendingScrollToAisleIdRef.current,
        pendingFocusToAisleId: pendingFocusToAisleIdRef.current,
        pendingMouseAisleActivation: pendingMouseAisleActivationRef.current?.aisleId ?? null,
        pendingMouseAisleActivationSettled: pendingMouseAisleActivationRef.current?.settled ?? null,
        visibilityState: typeof document === 'undefined' ? 'unknown' : document.visibilityState,
        windowFocused: typeof document !== 'undefined' && typeof document.hasFocus === 'function'
          ? document.hasFocus()
          : null,
      }), () => diagnosticCaptureEnabledRef.current),
    [],
  )

  useEffect(() => {
    recordDiagnosticEvent('runtime', 'session-start', {
      details: {
        sessionId: getDiagnosticSessionId(),
        platform: typeof navigator === 'undefined' ? 'unknown' : navigator.platform,
        userAgent: typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent,
      },
    })

    const heartbeat = createMainThreadHeartbeat()
    heartbeat.start()

    const recordWindowFocus = () => recordDiagnosticEvent('runtime', 'window-focus')
    const recordWindowBlur = () => recordDiagnosticEvent('runtime', 'window-blur')
    const recordVisibilityChange = () => recordDiagnosticEvent('runtime', 'visibility-change')
    const recordUnhandledError = (event: ErrorEvent) => {
      recordDiagnosticEvent('runtime', 'unhandled-error', {
        level: 'error',
        message: event.message,
        details: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: event.error instanceof Error ? event.error.stack : undefined,
        },
      })
    }
    const recordUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason
      recordDiagnosticEvent('runtime', 'unhandled-rejection', {
        level: 'error',
        message: reason instanceof Error ? reason.message : String(reason ?? 'unknown rejection'),
        details: {
          stack: reason instanceof Error ? reason.stack : undefined,
        },
      })
    }

    window.addEventListener('focus', recordWindowFocus)
    window.addEventListener('blur', recordWindowBlur)
    document.addEventListener('visibilitychange', recordVisibilityChange)
    window.addEventListener('error', recordUnhandledError)
    window.addEventListener('unhandledrejection', recordUnhandledRejection)

    return () => {
      heartbeat.stop()
      window.removeEventListener('focus', recordWindowFocus)
      window.removeEventListener('blur', recordWindowBlur)
      document.removeEventListener('visibilitychange', recordVisibilityChange)
      window.removeEventListener('error', recordUnhandledError)
      window.removeEventListener('unhandledrejection', recordUnhandledRejection)
    }
  }, [])

  const trackRenameDraft = (type: RenameEntityType, id: string, value: string) => {
    renameDraftRef.current = createRenameDraft(type, id, value)
  }

  const clearRenameDraft = (type: RenameEntityType, id: string) => {
    renameDraftRef.current = clearRenameDraftIfMatching(renameDraftRef.current, type, id)
  }

  useEffect(() => {
    editingRef.current = editing
    const draft = renameDraftRef.current
    if (!draft) return
    if (editing && editing.type === draft.type && editing.id === draft.id) return
    renameDraftRef.current = null
  }, [editing])

  const {
    activeSpace,
    workspace,
    activeTab,
    activeSubTab,
    activeNoteBodyId,
    activeNoteBody,
    activeNoteAisles,
    activeNoteLocation,
    activeNoteLocationKey,
    resolvedActiveAisleId,
    domainsForPickers,
    activeContent,
  } = useActiveNoteModel({
    state,
    activeAisleId,
    scratchpadActive: viewMode === 'main' && scratchpadActive,
  })
  const scratchpadWorkspaceActive = viewMode === 'main' && scratchpadActive
  const activeNoteLocations = useMemo(
    () => (activeNoteBodyId ? listNoteLocationsForBody(state, activeNoteBodyId) : []),
    [activeNoteBodyId, state],
  )
  const activeAisleIds = useMemo(() => activeNoteAisles.map((aisle) => aisle.id), [activeNoteAisles])
  const activeAisleWidths = state.ui.aisleWidths?.[activeNoteLocationKey] ?? {}
  const activeNoteDuplicateCount = activeNoteLocations.length
  const contextMenuNoteLocation = useMemo<NoteLocation | null>(() => {
    if (!contextMenu) return null
    if (contextMenu.type === 'editor') return scratchpadWorkspaceActive ? null : activeNoteLocation
    if (contextMenu.type !== 'tab' && contextMenu.type !== 'subtab' && contextMenu.type !== 'home-tab') return null
    return {
      domainId: state.activeDomainId,
      spaceId: activeSpace.id,
      tabId: contextMenu.tabId,
      subTabId: contextMenu.type === 'subtab' ? contextMenu.subTabId : null,
    }
  }, [activeNoteLocation, activeSpace.id, contextMenu, scratchpadWorkspaceActive, state.activeDomainId])
  const editorNoteRevealLabel = useMemo(() => {
    if (typeof window === 'undefined') return null
    if (typeof window.electronAPI?.revealNoteLocation !== 'function') return null
    return window.electronAPI.platform === 'darwin' ? 'reveal in finder' : 'show in folder'
  }, [])
  const copyAsMenu = useMemo<CopyAsMenuState | null>(() => {
    if (scratchpadWorkspaceActive && contextMenu?.type === 'editor') {
      const body = getScratchpadNoteBody(state)
      const aisle = body?.aisles.find((candidate) => candidate.id === resolvedActiveAisleId) ?? body?.aisles[0] ?? null
      if (!aisle) return null
      return {
        aisle: Object.fromEntries(
          COPY_AS_MENU_ACTIONS.map((action) => [
            action,
            action === 'copy'
              ? { available: true }
              : {
                  available: false,
                  visible: false,
                  reason: 'Scratchpad can only copy independent aisles.',
                },
          ]),
        ) as Record<CopyAsAction, CopyAsMenuItemState>,
      }
    }
    const source = contextMenuNoteLocation
    if (!source) return null
    const info = getLocationInfo(state, source)
    const body = info.noteBodyId ? state.noteBodies.find((candidate) => candidate.id === info.noteBodyId) ?? null : null
    if (!body) return null
    const missingReason = 'Note not found.'
    const notePreviewReason = 'Copy a specific aisle as preview for notes with multiple aisles.'
    const note = Object.fromEntries(
      COPY_AS_MENU_ACTIONS.map((action) => [
        action,
        {
          available: action !== 'preview' || body.aisles.length <= 1,
          reason: action === 'preview' && body.aisles.length > 1 ? notePreviewReason : missingReason,
        },
      ]),
    ) as Record<CopyAsAction, CopyAsMenuItemState>

    if (body.aisles.length <= 0 || contextMenu?.type === 'subtab') return { note }
    const sourceKey = buildNoteLocationKey(source)
    const activeSourceKey = buildNoteLocationKey(activeNoteLocation)
    const focusedAisle = sourceKey === activeSourceKey
      ? body.aisles.find((aisle) => aisle.id === resolvedActiveAisleId) ?? null
      : null
    const aisle = focusedAisle ?? body.aisles[0] ?? null
    if (!aisle) return { note }
    return {
      note,
      aisle: Object.fromEntries(
        COPY_AS_MENU_ACTIONS.map((action) => [action, { available: true }]),
      ) as Record<CopyAsAction, CopyAsMenuItemState>,
    }
  }, [activeNoteLocation, contextMenu?.type, contextMenuNoteLocation, resolvedActiveAisleId, scratchpadWorkspaceActive, state])
  const findReplaceCurrentLocation = scratchpadWorkspaceActive ? SCRATCHPAD_FIND_LOCATION : activeNoteLocation
  const findReplaceMatches = useMemo(
    () =>
      findReplacePanel.open
        ? findVisibleMatches(
            state,
            findReplaceCurrentLocation,
            findReplacePanel.scope,
            findReplacePanel.query,
            {
              caseSensitive: findReplacePanel.caseSensitive,
              wholeWord: findReplacePanel.wholeWord,
              regex: findReplacePanel.regex,
            },
          )
        : [],
    [
      findReplaceCurrentLocation,
      findReplacePanel.caseSensitive,
      findReplacePanel.open,
      findReplacePanel.query,
      findReplacePanel.regex,
      findReplacePanel.scope,
      findReplacePanel.wholeWord,
      state,
    ],
  )
  const findReplaceQueryError = useMemo(
    () =>
      getFindReplaceQueryError(findReplacePanel.query, {
        caseSensitive: findReplacePanel.caseSensitive,
        wholeWord: findReplacePanel.wholeWord,
        regex: findReplacePanel.regex,
      }),
    [findReplacePanel.caseSensitive, findReplacePanel.query, findReplacePanel.regex, findReplacePanel.wholeWord],
  )
  const defaultNoteFilter = DEFAULT_UI_SETTINGS.noteFilter as NoteFilterSettings
  const noteFilter = state.ui.noteFilter ?? defaultNoteFilter
  const noteFilterKind = noteFilter.kind
  const noteFilterSelectedKeys =
    noteFilterKind === 'synced'
      ? noteFilter.synced.selectedKeys
      : noteFilterKind === 'frontmatter'
        ? noteFilter.frontmatter.selectedKeys
        : noteFilterKind === 'media'
          ? noteFilter.media.selectedKeys
          : noteFilter.tags.selectedKeys
  const tagFilterActive = noteFilter.active
  const noteFilterSelectedKey = noteFilterSelectedKeys.join('\u0000')
  const noteFilterIndex = useMemo(() => {
    const selectedKeys = noteFilterSelectedKey ? noteFilterSelectedKey.split('\u0000') : []
    if (import.meta.env?.DEV) {
      return runAisleEditorPerfTiming(
        (perfState, durationMs) => {
          perfState.noteFilterIndexBuildCount += 1
          perfState.lastNoteFilterIndexBuildDurationMs = durationMs
        },
        () => buildNoteFilterIndex(state, noteFilterKind, selectedKeys),
      )
    }
    return buildNoteFilterIndex(state, noteFilterKind, selectedKeys)
  }, [noteFilterKind, noteFilterSelectedKey, state])
  const sortedNoteFilterOptions = useMemo(
    () => sortNoteFilterOptions(noteFilterIndex.availableOptions, noteFilter.tags.sortMode),
    [noteFilter.tags.sortMode, noteFilterIndex.availableOptions],
  )
  const tagAutocompleteFilterIndex = useMemo(() => {
    if (import.meta.env?.DEV) {
      return runAisleEditorPerfTiming(
        (perfState, durationMs) => {
          perfState.tagAutocompleteFilterIndexBuildCount += 1
          perfState.lastTagAutocompleteFilterIndexBuildDurationMs = durationMs
        },
        () => buildNoteFilterIndex(state, 'tags', []),
      )
    }
    return buildNoteFilterIndex(state, 'tags', [])
  }, [state])

  const updateNoteFilter = (updater: (current: NoteFilterSettings) => NoteFilterSettings) => {
    setState((previous) => {
      const current = previous.ui.noteFilter ?? defaultNoteFilter
      const nextFilter = updater(current)
      return {
        ...previous,
        ui: {
          ...previous.ui,
          noteFilter: nextFilter,
        },
      }
    })
  }

  useEffect(() => {
    setFindReplacePanel((current) => {
      if (current.open) return current
      const caseSensitive = state.ui.findCaseSensitive ?? false
      const wholeWord = state.ui.findWholeWord ?? false
      const regex = state.ui.findRegex ?? false
      const replaceMode = state.ui.findReplaceMode === 'replace'
      const scope = state.ui.findReplaceScope ?? 'note'
      return current.caseSensitive === caseSensitive &&
        current.wholeWord === wholeWord &&
        current.regex === regex &&
        current.replaceMode === replaceMode &&
        current.scope === scope
        ? current
        : { ...current, caseSensitive, wholeWord, regex, replaceMode, scope }
    })
  }, [
    state.ui.findCaseSensitive,
    state.ui.findRegex,
    state.ui.findReplaceMode,
    state.ui.findReplaceScope,
    state.ui.findWholeWord,
  ])

  useEffect(() => {
    setFindReplacePanel((current) => {
      if (!current.open) return current
      const maxIndex = Math.max(0, findReplaceMatches.length - 1)
      return current.activeIndex <= maxIndex ? current : { ...current, activeIndex: maxIndex }
    })
  }, [findReplaceMatches.length])
  const activeLinkedAisleIds = useMemo(
    () => (activeNoteBodyId ? getLinkedAisleIdsForNoteBody(state, activeNoteBodyId) : new Set<string>()),
    [activeNoteBodyId, state],
  )
  const activeFrontmatterAisleIds = useMemo(() => {
    const aisleBodyById = new Map((state.noteAisleBodies ?? []).map((body) => [body.id, body]))
    return new Set(
      activeNoteAisles
        .filter((aisle) => {
          const aisleBody = aisleBodyById.get(getAisleBodyId(aisle))
          return aisleBody?.frontmatterStatus === 'valid' && aisleBody.frontmatter !== null && aisleBody.frontmatter !== undefined
        })
        .map((aisle) => aisle.id),
    )
  }, [activeNoteAisles, state.noteAisleBodies])
  const activeToolbarLayout = resolveToolbarLayout(state.ui.toolbarLayouts, activeToolbarLayoutId)
  const normalizedHotkeys = useMemo(() => normalizeHotkeySettings(state.hotkeys), [state.hotkeys])

  const setActiveToolbarLayoutId = useCallback((layoutId: string) => {
    const nextLayoutId = layoutId.trim() || DEFAULT_TOOLBAR_LAYOUT_ID
    setActiveToolbarLayoutIdState(nextLayoutId)
    saveActiveToolbarLayoutId(nextLayoutId)
  }, [])

  const settingsController = useSettingsController({
    state,
    setState,
    stateRef,
    commitAppStateNow,
    activeSpace,
    viewMode,
    activeToolbarLayoutId,
    onActiveToolbarLayoutIdChange: setActiveToolbarLayoutId,
  })

  const {
    toasts,
    visibleTipDefinitions,
    pushToast,
    showTip,
    dismissTip,
    pauseToastDismissals,
    resumeToastDismissals,
  } = useAppNotifications({
    state,
    stateRef,
    setState,
    isMacPlatform,
  })

  const setDiagnosticCaptureEnabled = useCallback((enabled: boolean) => {
    diagnosticCaptureEnabledRef.current = enabled
    setDiagnosticCaptureEnabledState(enabled)
    savePartialDeviceSettings({ captureDiagnostics: enabled })
  }, [])

  const openDiagnosticsFolder = useCallback(async () => {
    try {
      const result = await window.electronAPI?.openDiagnosticsFolder?.()
      if (!result?.ok) pushToast('Could not open diagnostics folder.', 'warning')
    } catch {
      pushToast('Could not open diagnostics folder.', 'warning')
    }
  }, [pushToast])

  const diagnosticsFolderAvailable =
    typeof window !== 'undefined' && typeof window.electronAPI?.openDiagnosticsFolder === 'function'

  const pushArrangeCrossDomainMoveToast = (
    kind: ArrangeCrossDomainMoveKind,
    itemNames: string[],
    targetDomainName: string | null | undefined,
  ) => {
    const message = formatArrangeCrossDomainMoveToast(kind, itemNames, targetDomainName)
    if (message) pushToast(message, 'success')
  }

  const resizeAisleWidth = useCallback(
    (aisleId: string, width: number) => {
      const locationKey = activeNoteLocationKey
      if (!locationKey || !aisleId) return
      setState((previous) => {
        const previousAisleWidths = previous.ui.aisleWidths ?? {}
        const aisleWidths = setAisleWidthForLocation(previousAisleWidths, locationKey, aisleId, width)
        if (aisleWidths === previousAisleWidths) return previous
        return {
          ...previous,
          ui: {
            ...previous.ui,
            aisleWidths,
          },
        }
      })
    },
    [activeNoteLocationKey, setState],
  )

  const resetAisleWidth = useCallback(
    (aisleId: string) => {
      const locationKey = activeNoteLocationKey
      if (!locationKey || !aisleId) return
      setState((previous) => {
        const previousAisleWidths = previous.ui.aisleWidths ?? {}
        const aisleWidths = resetAisleWidthForLocation(previousAisleWidths, locationKey, aisleId)
        if (aisleWidths === previousAisleWidths) return previous
        return {
          ...previous,
          ui: {
            ...previous.ui,
            aisleWidths,
          },
        }
      })
    },
    [activeNoteLocationKey, setState],
  )

  const storageProfileController = useStorageProfileController({
    pushToast,
    beforeStorageAction: () => flushStorageActionStateRef.current(),
  })
  const storageProfileStatus = storageProfileController.storageProfileStatus
  const userSettingsLocationController = useUserSettingsLocationController({
    pushToast,
    beforeUserSettingsLocationAction: () => flushStorageActionStateRef.current(),
  })
  const userSettingsLocationStatus = userSettingsLocationController.userSettingsLocationStatus

  useEffect(() => {
    if (!storageProfileStatus) return
    if (!shouldRecordStorageProfileDiagnostic(storageProfileStatus)) return
    recordDiagnosticEvent('storage', 'profile-status', {
      level:
        storageProfileStatus.status === 'error'
          ? 'error'
          : storageProfileStatus.health === 'warning'
            ? 'warning'
            : 'info',
      details: {
        status: storageProfileStatus.status,
        health: storageProfileStatus.health,
        event: storageProfileStatus.event,
        source: storageProfileStatus.source,
        schemaVersion: storageProfileStatus.schemaVersion,
        canWrite: storageProfileStatus.canWrite,
        isDefault: storageProfileStatus.isDefault,
        revision: storageProfileStatus.revision,
        issueCount: storageProfileStatus.issues?.length ?? 0,
      },
    })
  }, [storageProfileStatus])

  const trackCompletedTaskQuickDelete = (beforeMarkdown: string) => {
    completedTaskDeleteUndoCandidateRef.current = {
      beforeMarkdown: normalizeMarkdownForPersistence(beforeMarkdown),
      deletedAt: getCurrentTimestamp(),
    }
  }

  const maybeShowCompletedTaskUndoHint = (markdown: string) => {
    const candidate = completedTaskDeleteUndoCandidateRef.current
    if (!candidate) return

    const now = getCurrentTimestamp()
    if (now - candidate.deletedAt > COMPLETED_TASK_UNDO_HINT_DETECTION_MS) {
      completedTaskDeleteUndoCandidateRef.current = null
      return
    }

    if (normalizeMarkdownForPersistence(markdown) !== candidate.beforeMarkdown) return

    completedTaskDeleteUndoCandidateRef.current = null
    if (now - completedTaskUndoToastAtRef.current < COMPLETED_TASK_UNDO_HINT_COOLDOWN_MS) return

    completedTaskUndoToastAtRef.current = now
    showTip('task-undo')
  }

  useEffect(() => {
    closeEditorEphemeraRef.current()
  }, [activeSpace.id, activeTab.id, activeSubTab?.id, activeNoteBodyId, scratchpadWorkspaceActive, viewMode])

  const syncActiveAisleSelection = useCallback((aisleId: string) => {
    if (!aisleId || !activeAisleIdsRef.current.includes(aisleId)) {
      return false
    }
    activeAisleIdRef.current = aisleId
    setActiveAisleId(aisleId)
    if (scratchpadWorkspaceActive) {
      setState((previous) =>
        previous.scratchpad?.activeAisleId === aisleId ? previous : setScratchpadActiveAisleId(previous, aisleId),
      )
    }
    return true
  }, [scratchpadWorkspaceActive, setState])

  const getAisleIdFromCurrentDomFocus = useCallback(() => {
    if (typeof document === 'undefined') return ''
    const candidates: Array<Node | null> = []
    candidates.push(document.activeElement)
    const selectionNode = window.getSelection?.()?.anchorNode ?? null
    candidates.push(selectionNode)
    for (const candidate of candidates) {
      const element = candidate instanceof Element ? candidate : candidate?.parentElement ?? null
      const editorHost = element?.closest?.('[data-aisle-editor-key]')
      if (!(editorHost instanceof HTMLElement)) continue
      const aisleId = getAisleIdFromAisleEditorKey(editorHost.dataset.aisleEditorKey ?? '')
      if (aisleId && activeAisleIdsRef.current.includes(aisleId)) return aisleId
    }
    return ''
  }, [])

  const markMouseAisleActivationSettled = useCallback(() => {
    const pending = pendingMouseAisleActivationRef.current
    if (!pending) return
    const focusedAisleId = getAisleIdFromCurrentDomFocus()
    if (!focusedAisleId || focusedAisleId === pending.aisleId) {
      pendingMouseAisleActivationRef.current = null
    }
  }, [getAisleIdFromCurrentDomFocus])

  useEffect(() => {
    if (resolvedActiveAisleId && resolvedActiveAisleId !== activeAisleId) {
      syncActiveAisleSelection(resolvedActiveAisleId)
    }
  }, [activeAisleId, resolvedActiveAisleId, syncActiveAisleSelection])

  useEffect(() => {
    if (!scratchpadWorkspaceActive || !resolvedActiveAisleId) return
    if (state.scratchpad?.activeAisleId === resolvedActiveAisleId) return
    setState((previous) => setScratchpadActiveAisleId(previous, resolvedActiveAisleId))
  }, [resolvedActiveAisleId, scratchpadWorkspaceActive, state.scratchpad?.activeAisleId, setState])

  const scrollAisleIntoHorizontalView = useCallback((aisleId: string) => {
    const scrollNode = aisleScrollRef.current
    if (!scrollNode || !activeNoteBodyId) {
      recordDiagnosticEvent('aisle', 'horizontal-scroll-missing-root', {
        level: 'warning',
        details: { aisleId, hasScrollNode: Boolean(scrollNode), activeNoteBodyId },
      })
      return false
    }
    const beforeScrollLeft = scrollNode.scrollLeft
    if (!scrollAislePaneIntoHorizontalView(scrollNode, aisleId)) {
      recordDiagnosticEvent('aisle', 'horizontal-scroll-missing-aisle', {
        level: 'warning',
        details: { aisleId, activeNoteBodyId },
      })
      return false
    }
    aisleHorizontalScrollByBodyRef.current.set(activeNoteBodyId, scrollNode.scrollLeft)
    if (pendingScrollToAisleIdRef.current === aisleId) {
      pendingScrollToAisleIdRef.current = null
    }
    recordDiagnosticEvent('aisle', 'horizontal-scroll-attempt', {
      details: {
        aisleId,
        activeNoteBodyId,
        beforeScrollLeft,
        afterScrollLeft: scrollNode.scrollLeft,
      },
    })
    return true
  }, [activeNoteBodyId])

  const scheduleAisleFocusScroll = useCallback((aisleId: string, options?: { onInvalidAisle?: (aisleId: string) => void }) => {
    const scheduledNoteBodyId = activeNoteBodyIdRef.current || activeNoteBodyId
    if (!scheduledNoteBodyId) {
      recordDiagnosticEvent('aisle', 'focus-scroll-schedule-skipped', {
        level: 'warning',
        details: { aisleId, reason: 'missing-note-body' },
      })
      return
    }
    pendingScrollToAisleIdRef.current = aisleId
    recordDiagnosticEvent('aisle', 'focus-scroll-scheduled', {
      details: {
        aisleId,
        noteBodyId: scheduledNoteBodyId,
        activeAisleId: activeAisleIdRef.current,
      },
    })
    scheduleFocusedAisleScroll({
      scheduled: pendingAisleFocusScrollRef.current,
      aisleId,
      noteBodyId: scheduledNoteBodyId,
      scheduler: window,
      getCurrentNoteBodyId: () => activeNoteBodyIdRef.current,
      hasAisle: (targetAisleId) => activeAisleIdsRef.current.includes(targetAisleId),
      scrollAisleIntoHorizontalView,
      onInvalidAisle: options?.onInvalidAisle,
    })
  }, [activeNoteBodyId, scrollAisleIntoHorizontalView])

  useEffect(() => {
    const scrollNode = aisleScrollRef.current
    if (viewMode !== 'main' || !activeNoteBodyId || !scrollNode) return

    const animationFrame = window.requestAnimationFrame(() => {
      const pendingAisleId = pendingScrollToAisleIdRef.current
      if (pendingAisleId) {
        if (scrollAisleIntoHorizontalView(pendingAisleId)) {
          return
        }
        pendingScrollToAisleIdRef.current = null
      }

      scrollNode.scrollLeft = aisleHorizontalScrollByBodyRef.current.get(activeNoteBodyId) ?? 0
    })

    return () => window.cancelAnimationFrame(animationFrame)
  }, [viewMode, activeNoteBodyId, activeNoteAisles.length, scrollAisleIntoHorizontalView])

  useEffect(() => {
    if (!activeNoteBodyId || activeNoteBody) return
    setState((previous) => ensureNoteBodiesForAppState(previous))
  }, [activeNoteBody, activeNoteBodyId, setState])

  const {
    trashDomains,
    selectedTrashDomain,
    trashSpaces,
    selectedTrashSpace,
    trashParentTabs,
    selectedTrashTab,
    trashSubTabs,
    selectedTrashSubTab,
    trashDisplay,
  } = useTrashSelection({
    state,
    viewMode,
    trashDomainId,
    setTrashDomainId,
    trashSpaceId,
    setTrashSpaceId,
    trashTabId,
    setTrashTabId,
    trashSubTabId,
    setTrashSubTabId,
  })

  const trashSelectedDomainIds = useMemo(
    () => (trashSelection.kind === 'domain' ? new Set(trashSelection.ids) : new Set<string>()),
    [trashSelection],
  )
  const trashSelectedSpaceIds = useMemo(
    () => (trashSelection.kind === 'space' ? new Set(trashSelection.ids) : new Set<string>()),
    [trashSelection],
  )
  const trashSelectedParentIds = useMemo(
    () => (trashSelection.kind === 'parent' ? new Set(trashSelection.ids) : new Set<string>()),
    [trashSelection],
  )
  const trashSelectedSubTabIds = useMemo(
    () =>
      trashSelection.kind === 'subtab' && selectedTrashTab && trashSelection.scopeId === selectedTrashTab.id
        ? new Set(trashSelection.ids)
        : new Set<string>(),
    [selectedTrashTab, trashSelection],
  )
  const selectedTrashTargets = useMemo(
    () =>
      getTrashTargetsForSelection({
        selection: trashSelection,
        domains: trashDomains,
        spaces: trashSpaces,
        parents: trashParentTabs,
        selectedParent: selectedTrashTab,
      }),
    [selectedTrashTab, trashDomains, trashParentTabs, trashSelection, trashSpaces],
  )
  const trashContextTarget = useMemo(() => getTrashTargetFromContextMenu(contextMenu), [contextMenu])
  const trashContextTargets = useMemo(
    () =>
      contextMenu?.type === 'trash-selection'
        ? selectedTrashTargets
        : getEffectiveTrashContextTargets(trashContextTarget, selectedTrashTargets, trashSelection),
    [contextMenu?.type, selectedTrashTargets, trashContextTarget, trashSelection],
  )

  const clearTrashSelection = useCallback(() => {
    setTrashSelection(EMPTY_TRASH_SELECTION)
  }, [])

  const getTrashSelectionClickModifiers = (
    event: ReactMouseEvent<HTMLButtonElement> | ReactPointerEvent<HTMLButtonElement>,
  ): TrashSelectionClickModifiers => ({
    shiftKey: event.shiftKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
  })

  const handleTrashSelectionClick = (
    kind: TrashSelectionKind,
    itemId: string,
    orderedIds: readonly string[],
    scopeId: string | null,
    currentId: string | null,
    modifiers: TrashSelectionClickModifiers,
    onReplacement?: (replacementId: string) => void,
  ) => {
    if (!hasTrashSelectionModifier(modifiers)) return false
    const nextSelection = updateTrashSelectionForClick({
      selection: trashSelection,
      kind,
      itemId,
      orderedIds,
      currentId,
      scopeId,
      modifiers,
    })
    const replacementId = getTrashSelectionActiveReplacementId({
      previousSelection: trashSelection,
      nextSelection,
      kind,
      itemId,
      currentId,
      scopeId,
      modifiers,
    })
    setTrashSelection(nextSelection)
    if (replacementId) onReplacement?.(replacementId)
    return true
  }

  useEffect(() => {
    if (trashSelection.kind === null) return
    const validIds =
      trashSelection.kind === 'domain'
        ? trashDomains.filter(isTrashDomainSelectable).map((domain) => domain.id)
        : trashSelection.kind === 'space'
          ? selectedTrashDomain && trashSelection.scopeId === selectedTrashDomain.id
            ? trashSpaces.filter(isTrashSpaceSelectable).map((space) => space.id)
            : []
        : trashSelection.kind === 'parent'
          ? selectedTrashSpace && trashSelection.scopeId === selectedTrashSpace.id
            ? trashParentTabs.map((parent) => parent.id)
            : []
        : selectedTrashTab && trashSelection.scopeId === selectedTrashTab.id
          ? selectedTrashTab.subTabs.map((subTab) => subTab.id)
          : []
    const validIdSet = new Set(validIds)
    const ids = trashSelection.ids.filter((id) => validIdSet.has(id))
    if (ids.length === trashSelection.ids.length) return
    setTrashSelection(
      ids.length > 0
        ? {
            ...trashSelection,
            ids,
            anchorId: ids.includes(trashSelection.anchorId) ? trashSelection.anchorId : ids[0],
          }
        : EMPTY_TRASH_SELECTION,
    )
  }, [selectedTrashDomain, selectedTrashSpace, selectedTrashTab, trashDomains, trashParentTabs, trashSelection, trashSpaces])

  const normalizeEditorMarkdownForPersistence = (markdown: string) =>
    normalizeMarkdownNoteReferencesForEditor(markdown, stateRef.current)

  const normalizeEditorMarkdownForDisplay = (markdown: string) =>
    prepareMarkdownNoteReferencesForEditor(markdown, stateRef.current)

  const displayContent = normalizeEditorMarkdownForDisplay(activeContent)

  activeDomainIdRef.current = state.activeDomainId
  activeSpaceIdRef.current = scratchpadWorkspaceActive ? SCRATCHPAD_CONTENT_TARGET_ID : activeSpace.id
  activeTabIdRef.current = scratchpadWorkspaceActive ? SCRATCHPAD_CONTENT_TARGET_ID : activeTab.id
  activeSubTabIdRef.current = scratchpadWorkspaceActive ? null : activeSubTab?.id ?? null
  activeAisleIdsRef.current = activeAisleIds
  activeAisleIdRef.current = getActiveAisleRefSyncValue({
    currentAisleId: activeAisleIdRef.current,
    resolvedActiveAisleId,
    activeAisleIds,
  })
  activeNoteBodyIdRef.current = activeNoteBodyId
  activeNoteLocationKeyRef.current = activeNoteLocationKey
  isMainViewRef.current = viewMode === 'main'
  toggleViewModeRef.current = viewMode
  toggleScratchpadActiveRef.current = scratchpadActive

  useEffect(() => {
    saveDeviceLastOpened({
      domainId: state.activeDomainId,
      spaceId: activeSpace.id,
      primeTabId: activeTab.id,
      subTabId: activeSubTab?.id ?? null,
      viewMode,
      scratchpadActive: scratchpadWorkspaceActive,
    })
  }, [activeSpace.id, activeSubTab?.id, activeTab.id, scratchpadWorkspaceActive, state.activeDomainId, viewMode])

  const updateActiveSpaceData = (updater: (data: WorkspaceData) => WorkspaceData) => {
    setState((previous) => {
      const sanitizedPrevious = applyAutoPurgeToAppState(previous)
      return updateActiveSpaceDataInActiveDomain(sanitizedPrevious, updater)
    })
  }

  const getCurrentNoteLocation = (): NoteLocation => activeNoteLocation

  const getNormalizedEditorMarkdown = (editor: Editor) =>
    measureSlowOperation('editor markdown normalization', () =>
      normalizeEditorMarkdownForPersistence(getEditorMarkdownForPersistence(editor)),
    )

  const cursorPersistence = useNoteCursorPersistence({
    setState,
    editorRef,
    activeEditorAisleIdRef,
    viewMode,
    activeNoteBodyId,
    activeNoteLocationKey,
    activeNoteAisles,
    activeAisleId,
    activeAisleIdRef,
    activeNoteLocationKeyRef,
    isMainViewRef,
    noteCursorLocations: state.ui.noteCursorLocations,
    pendingScrollToAisleIdRef,
    setActiveAisleId,
  })
  const pendingCursorRestoreRef = cursorPersistence.pendingCursorRestoreRef
  const applyActiveCursorToState = cursorPersistence.applyActiveCursorToState
  const saveActiveCursorLocation = cursorPersistence.saveActiveCursorLocation

  const editorPersistence = useEditorPersistence({
    stateRef,
    setState,
    editorRef,
    activeSpaceIdRef,
    activeTabIdRef,
    activeSubTabIdRef,
    activeAisleIdRef,
    isMainViewRef,
    activeNoteBody,
    resolvedActiveAisleId,
    getNormalizedEditorMarkdown,
    applyActiveCursorToState,
  })
  const pendingContentRef = editorPersistence.pendingContentRef
  const saveTimerRef = editorPersistence.saveTimerRef
  const lastEditorMarkdownRef = editorPersistence.lastEditorMarkdownRef
  const lastEditorMarkdownByAisleRef = editorPersistence.lastEditorMarkdownByAisleRef
  const normalizingContentRef = editorPersistence.normalizingContentRef
  const normalizingAisleIdsRef = editorPersistence.normalizingAisleIdsRef
  const buildStateWithLatestEditorContent = editorPersistence.buildStateWithLatestEditorContent
  const flushPendingContent = editorPersistence.flushPendingContent
  const scheduleContentCommit = editorPersistence.scheduleContentCommit
  const commitCurrentEditorContent = editorPersistence.commitCurrentEditorContent
  const commitActiveEditorMarkdownNow = editorPersistence.commitActiveEditorMarkdownNow
  const replaceActiveEditorMarkdown = editorPersistence.replaceActiveEditorMarkdown
  const getActiveEditorMarkdown = editorPersistence.getActiveEditorMarkdown
  const registerMountedEditorSnapshotProvider = editorPersistence.registerMountedEditorSnapshotProvider
  const persistLatestStateSnapshot = editorPersistence.persistLatestStateSnapshot

  flushStorageActionStateRef.current = async () => {
    await flushPendingPersistence({ preferSync: true })
    persistLatestStateSnapshot()
  }

  const saveActiveCursorBeforeNavigation = () => {
    saveActiveCursorLocation()
    flushPendingContent({ captureActiveTableEditorSnapshot: true })
  }

  const getActiveNoteHistoryKey = () =>
    [
      activeSpaceIdRef.current,
      activeTabIdRef.current,
      activeSubTabIdRef.current ?? '__home__',
      activeAisleIdRef.current,
    ].join('::')

  const aisleController = useAisleController({
    setState,
    viewMode,
    activeNoteBodyId,
    activeNoteBody,
    activeNoteAisles,
    activeDomainIdRef,
    activeSpaceIdRef,
    activeTabIdRef,
    activeSubTabIdRef,
    activeAisleIdRef,
    structuralScope: scratchpadWorkspaceActive ? 'scratchpad' : 'note',
    maxAisles: scratchpadWorkspaceActive ? getScratchpadAisleLimit() : MAX_NOTE_AISLES,
    maxAislesWarningMessage: scratchpadWorkspaceActive
      ? 'Scratchpad aisle limit reached. You can raise it to 40 in misc settings.'
      : MAX_AISLE_WARNING_MESSAGE,
    editorRef,
    pendingScrollToAisleIdRef,
    pendingFocusToAisleIdRef,
    pendingCursorRestoreRef,
    setViewMode,
    setActiveAisleId,
    setContextMenu,
    setMenuOpen,
    setEditing,
    buildStateWithLatestEditorContent,
    flushPendingContent,
    saveActiveCursorLocation,
    getNormalizedEditorMarkdown,
    pushToast,
  })
  const aisleEditModalOpen = aisleController.aisleEditModalOpen
  const openAisleEditModal = aisleController.openAisleEditModal
  const closeAisleEditModal = aisleController.closeAisleEditModal
  const captureActiveAisleStructuralSnapshot = aisleController.captureActiveAisleStructuralSnapshot
  const runAisleStructuralHistory = aisleController.runAisleStructuralHistory
  const shouldRunAisleStructuralHistoryBeforeEditorHistory =
    aisleController.shouldRunAisleStructuralHistoryBeforeEditorHistory
  const addAisleToActiveNote = aisleController.addAisleToActiveNote
  const applyAisleEditDraftToActiveNote = aisleController.applyAisleEditDraftToActiveNote

  const getFocusedAisleIdForShortcut = (aisleIds: string[]) => {
    const pendingMouseActivation = pendingMouseAisleActivationRef.current
    if (pendingMouseActivation && !pendingMouseActivation.settled && aisleIds.includes(pendingMouseActivation.aisleId)) {
      return pendingMouseActivation.aisleId
    }
    const focusedAisleId = getAisleIdFromCurrentDomFocus()
    if (focusedAisleId && aisleIds.includes(focusedAisleId)) return focusedAisleId
    if (activeAisleIdRef.current && aisleIds.includes(activeAisleIdRef.current)) return activeAisleIdRef.current
    return aisleIds[0] ?? ''
  }

  const deleteFocusedAisleFromBody = (body: NoteBody, latestState: AppState) => {
    if (body.aisles.length <= 1) return false
    const currentAisles = cloneAisles(body.aisles, latestState.noteAisleBodies)
    const focusedAisleId = getFocusedAisleIdForShortcut(currentAisles.map((aisle) => aisle.id))
    const result = deleteFocusedAisleFromDraft(currentAisles, focusedAisleId)
    if (!result) return false
    if (focusedAisleId !== activeAisleIdRef.current) {
      syncActiveAisleSelection(focusedAisleId)
    }
    applyAisleEditDraftToActiveNote(result.aisles, { activeAisleId: result.activeAisleId })
    return true
  }

  function getScratchpadAisleLimit() {
    return clampScratchpadAisleLimit(stateRef.current.ui.scratchpadAisleLimit ?? DEFAULT_SCRATCHPAD_AISLE_LIMIT)
  }

  const showScratchpadAisleLimitToast = () => {
    pushToast('Scratchpad aisle limit reached. You can raise it to 40 in misc settings.', 'warning')
  }

  const addScratchpadAisle = (
    markdown = '',
    options: { beforeSnapshot?: AisleStructuralSnapshot | null; placement?: NewAislePlacement } = {},
  ) => {
    if (!scratchpadWorkspaceActive) return false
    const latestState = buildStateWithLatestEditorContent()
    const body = getScratchpadNoteBody(latestState)
    if (!body) return false
    const side = latestState.ui.scratchpadNewAisleSide ?? 'left'
    return addAisleToActiveNote(markdown, {
      beforeSnapshot: options.beforeSnapshot,
      placement: options.placement ?? (side === 'right' ? 'right-of-focus' : 'left-of-focus'),
      reclaimEmptyAisleAtLimit: true,
    })
  }

  const deleteScratchpadActiveAisle = () => {
    if (!scratchpadWorkspaceActive) return false
    const latestState = buildStateWithLatestEditorContent()
    const body = getScratchpadNoteBody(latestState)
    if (!body) return false
    if (body.aisles.length <= 1) {
      pushToast('Scratchpad must keep at least one aisle.', 'warning')
      return false
    }
    return deleteFocusedAisleFromBody(body, latestState)
  }

  const navigateToNoteLocation = (location: NoteNavigationTarget) => {
    saveActiveCursorBeforeNavigation()
    const targetInfo = getLocationInfo(stateRef.current, location)
    if (!targetInfo.domain || !targetInfo.space || !targetInfo.tab || (location.subTabId && !targetInfo.subTab)) {
      pushToast('That note no longer exists.', 'warning')
      return
    }
    closeEditorEphemeraRef.current()
    pendingNavigationHeadingRef.current = location.heading ?? null
    pendingNavigationTopAisleIdRef.current = null
    if (location.heading) {
      pendingNavigationAisleIdRef.current = null
    } else if (location.startAt === 'top') {
      const targetBody = targetInfo.noteBodyId
        ? stateRef.current.noteBodies.find((body) => body.id === targetInfo.noteBodyId) ?? null
        : null
      const topAisleId = location.aisleId ?? location.aisleIds?.[0] ?? targetBody?.aisles[0]?.id ?? null
      pendingNavigationAisleIdRef.current = topAisleId
      pendingNavigationTopAisleIdRef.current = topAisleId
    } else {
      pendingNavigationAisleIdRef.current = location.aisleId ?? null
    }

    if (arrangeMode.active) {
      exitArrangeMode()
    }

    setScratchpadActive(false)
    setState((previous) => {
      const domainState = setActiveDomain(previous, location.domainId)
      const spaceState = setActiveSpaceInActiveDomain(domainState, location.spaceId)
      return updateSpaceInActiveDomain(spaceState, location.spaceId, (space) => ({
        ...space,
        data: {
          ...space.data,
          activeTabId: location.tabId,
          tabs: space.data.tabs.map((tab) =>
            tab.id === location.tabId ? { ...tab, activeSubTabId: location.subTabId ?? null } : tab,
          ),
        },
      }))
    })
    setViewMode('main')
    setMenuOpen(false)
    setEditing(null)
  }

  const exitTagFilterMode = () => {
    pendingTagOccurrenceRef.current = null
    setNoteFilterMenuOpen(false)
    setNoteFilterCycleByLocation({})
    setNoteFilterCycleByOption({})
    updateNoteFilter((current) => ({ ...current, active: false }))
  }

  const openMessagesView = () => {
    closeEditorEphemeraRef.current()
    if (arrangeMode.active) exitArrangeMode()
    exitTagFilterMode()
    setScratchpadActive(false)
    setViewMode('messages')
    setMenuOpen(false)
    setEditing(null)
  }

  const openAboutView = () => {
    closeEditorEphemeraRef.current()
    if (arrangeMode.active) exitArrangeMode()
    exitTagFilterMode()
    setScratchpadActive(false)
    setViewMode('about')
    setMenuOpen(false)
    setEditing(null)
  }

  const dismissMessage = (messageId: string) => {
    setState((previous) => ({
      ...previous,
      messages: (previous.messages ?? []).map((message) =>
        message.id === messageId ? { ...message, status: 'dismissed' } : message,
      ),
    }))
  }

  const acknowledgeMessage = (messageId: string) => {
    setState((previous) => ({
      ...previous,
      messages: (previous.messages ?? []).map((message) =>
        message.id === messageId && message.status !== 'dismissed'
          ? { ...message, status: 'acknowledged' }
          : message,
      ),
    }))
  }

  const openMessageLocation = (location: NoteLocation) => {
    navigateToNoteLocation({ ...location, startAt: 'top' })
  }

  const openRecoveredNotebookLocationFromMessage = (message: AppMessage) => {
    if (message.type !== STORAGE_NOTEBOOK_RECOVERED_MESSAGE_TYPE) return
    acknowledgeMessage(message.id)
    void storageProfileController.revealRecoveredNotebookLocation({
      messageId: message.id,
      signature: message.signature,
    })
  }

  const applyArrangeParentMoveToSpace = (
    request: ArrangeHierarchyDropRequest,
    targetDomainId: string,
    targetSpaceId: string,
    placement?: { targetParentTabId: string; position: ArrangeInsertPosition },
  ) => {
    if (request.item.type !== 'parent') return
    const item = request.item
    const projected = projectActiveDomainState(stateRef.current)
    const sourceDomain = projected.domains.find((domain) => domain.id === request.sourceDomainId)
    const sourceSpace = sourceDomain?.spaces.find((space) => space.id === request.sourceSpaceId)
    const targetDomain = projected.domains.find((domain) => domain.id === targetDomainId)
    const targetSpace = targetDomain?.spaces.find((space) => space.id === targetSpaceId)
    const movedIds = new Set(item.parentTabIds)
    const targetParentTabIds = new Set(targetSpace?.data.tabs.map((tab) => tab.id) ?? [])
    const movedParentTabNames =
      request.sourceDomainId !== targetDomainId && sourceSpace && targetSpace
        ? sourceSpace.data.tabs
            .filter((tab) => movedIds.has(tab.id) && !targetParentTabIds.has(tab.id))
            .map((tab) => tab.title)
        : []
    saveActiveCursorBeforeNavigation()
    setState((previous) => {
      const createEntityId = createReservedIdAllocator(collectAppNavigationEntityIds(previous))
      return moveParentTabsToSpace(
        previous,
        request.sourceDomainId,
        request.sourceSpaceId,
        item.parentTabIds,
        targetDomainId,
        targetSpaceId,
        {
          createFallbackTab: () => createTab('tab', createEntityId),
          placement,
        },
      )
    })
    setViewMode('main')
    closeEditorEphemeraRef.current()
    setMenuOpen(false)
    setEditing(null)
    setArrangeDestinationPrompt(null)
    setGuidedParentRailTarget(null)
    pushArrangeCrossDomainMoveToast('parent', movedParentTabNames, targetDomain?.name)
  }

  const applyArrangeSubTabsMoveToParent = (
    request: ArrangeHierarchyDropRequest,
    targetDomainId: string,
    targetSpaceId: string,
    targetParentTabId: string,
  ) => {
    if (request.item.type !== 'subtab') return
    const item = request.item
    const projected = projectActiveDomainState(stateRef.current)
    const sourceDomain = projected.domains.find((domain) => domain.id === request.sourceDomainId)
    const sourceSpace = sourceDomain?.spaces.find((space) => space.id === request.sourceSpaceId)
    const sourceParent = sourceSpace?.data.tabs.find((tab) => tab.id === item.parentTabId)
    const targetDomain = projected.domains.find((domain) => domain.id === targetDomainId)
    const targetSpace = targetDomain?.spaces.find((space) => space.id === targetSpaceId)
    const targetParent = targetSpace?.data.tabs.find((tab) => tab.id === targetParentTabId)
    const movedIds = new Set(item.subTabIds)
    const targetSubTabIds = new Set(targetParent?.subTabs.map((subTab) => subTab.id) ?? [])
    const movedSubTabNames =
      request.sourceDomainId !== targetDomainId && sourceParent && targetParent
        ? sourceParent.subTabs
            .filter((subTab) => movedIds.has(subTab.id) && !targetSubTabIds.has(subTab.id))
            .map((subTab) => subTab.title)
        : []
    saveActiveCursorBeforeNavigation()
    setState((previous) =>
      moveSubTabsToParentInSpace(
        previous,
        request.sourceDomainId,
        request.sourceSpaceId,
        item.parentTabId,
        item.subTabIds,
        targetDomainId,
        targetSpaceId,
        targetParentTabId,
      ),
    )
    setViewMode('main')
    closeEditorEphemeraRef.current()
    setMenuOpen(false)
    setEditing(null)
    setArrangeDestinationPrompt(null)
    setGuidedParentRailTarget(null)
    pushArrangeCrossDomainMoveToast('subtab', movedSubTabNames, targetDomain?.name)
  }

  const focusArrangeDestinationSpace = (targetDomainId: string, targetSpaceId: string) => {
    setState((previous) => setActiveSpaceInActiveDomain(setActiveDomain(previous, targetDomainId), targetSpaceId))
    setViewMode('main')
    closeEditorEphemeraRef.current()
    setMenuOpen(false)
    setEditing(null)
  }

  const applyArrangeGuidedTransferResolution = (resolution: ArrangeGuidedTransferResolution) => {
    if (resolution.type === 'none') return
    if (resolution.type === 'move-parent-to-space') {
      applyArrangeParentMoveToSpace(
        resolution.request,
        resolution.targetDomainId,
        resolution.targetSpaceId,
        resolution.placement,
      )
      return
    }
    if (resolution.type === 'move-subtabs-to-parent') {
      applyArrangeSubTabsMoveToParent(
        resolution.request,
        resolution.targetDomainId,
        resolution.targetSpaceId,
        resolution.targetParentTabId,
      )
      return
    }

    focusArrangeDestinationSpace(resolution.focus.domainId, resolution.focus.spaceId)
    setGuidedParentRailTarget(null)
    setArrangeDestinationPrompt(resolution.prompt)
  }

  const handleArrangeHierarchyDrop = (
    request: ArrangeHierarchyDropRequest,
    carriedPreview: TabArrangeDragPreview,
  ) => {
    closeEditorEphemeraRef.current()
    setMenuOpen(false)
    setEditing(null)
    applyArrangeGuidedTransferResolution(resolveArrangeHierarchyDrop(stateRef.current, request, carriedPreview))
  }

  const selectArrangeDestinationSpace = (spaceId: string) => {
    const prompt = arrangeDestinationPrompt
    if (!prompt) return
    applyArrangeGuidedTransferResolution(resolveArrangePromptSpaceSelection(stateRef.current, prompt, spaceId))
  }

  const selectArrangeDestinationParent = (parentTabId: string) => {
    const prompt = arrangeDestinationPrompt
    if (!prompt || prompt.request.item.type !== 'subtab') return
    applyArrangeSubTabsMoveToParent(prompt.request, prompt.targetDomainId, prompt.targetSpaceId, parentTabId)
  }

  const selectArrangeDestinationParentPlacement = (
    parentTabId: string,
    position: ArrangeInsertPosition,
  ) => {
    const prompt = arrangeDestinationPrompt
    if (!prompt || prompt.request.item.type !== 'parent') return
    applyArrangeParentMoveToSpace(prompt.request, prompt.targetDomainId, prompt.targetSpaceId, {
      targetParentTabId: parentTabId,
      position,
    })
  }

  const arrange = useArrangeMode({
    state,
    setState,
    viewMode,
    editing,
    contextMenu,
    workspace,
    activeTab,
    flushPendingContent: saveActiveCursorBeforeNavigation,
    updateActiveSpaceData,
    setMenuOpen,
    setContextMenu,
    setEditing,
    closeAisleEditModal,
    onArrangeHierarchyDrop: handleArrangeHierarchyDrop,
    onArrangeDomainMoveBlocked: (reason) => {
      if (reason === 'last-domain') pushToast(LAST_DOMAIN_TOAST, 'warning')
    },
    onArrangeSpaceMoveBlocked: (reason) => {
      if (reason === 'last-space') pushToast(LAST_SPACE_TOAST, 'warning')
    },
    onArrangeSpaceMovedAcrossDomains: (spaceNames, targetDomainName) => {
      pushArrangeCrossDomainMoveToast('space', spaceNames, targetDomainName)
    },
    onArrangeParentMoveBlocked: () => pushToast(LAST_PARENT_TAB_TOAST, 'warning'),
  })
  const arrangeMode = arrange.mode
  const arrangeHierarchyRevealLevel = arrange.hierarchyRevealLevel
  const arrangeDraggingItem = arrange.draggingItem
  const arrangeInteraction = getArrangeInteractionState(arrangeDraggingItem, arrangeDestinationPrompt)
  const isDraggingArrangeItem = isArrangeLiveDragActive(arrangeInteraction)
  const isGuidedArrangeCarryActive = isArrangeGuidedCarryActive(arrangeInteraction)
  const arrangeTrashActionActive = isArrangeTrashActionActive(arrangeInteraction)
  const arrangeControlsDisabled = areArrangeRailControlsDisabled(arrangeInteraction)
  const navigationContextMenusDisabled = areNavigationContextMenusDisabled(arrangeInteraction)
  const domainArrangeDragPreview = arrange.domainDragPreview
  const spaceArrangeDragPreview = arrange.spaceDragPreview
  const tabArrangeDragPreview = arrange.tabDragPreview
  const primaryTabRailRef = arrange.primaryTabRailRef
  const subTabRailRef = arrange.subTabRailRef
  const domainsGridRef = arrange.domainsGridRef
  const spacesGridRef = arrange.spacesGridRef
  const arrangeTrashDropRef = arrange.trashDropRef
  const isDraggingOverArrangeTrashDrop = arrange.isDraggingOverTrashDrop
  const isTrashDropTargetActive = isDraggingOverArrangeTrashDrop || isDraggingOverTrashDrop
  const arrangeSelection = arrange.selection
  const clearArrangePressTimer = arrange.clearPressTimer
  const clearArrangeTapCandidate = arrange.clearTapCandidate
  const clearArrangeSelection = arrange.clearSelection
  const consumeArrangeClickSuppression = arrange.consumeClickSuppression
  const enterArrangeModeFromContext = arrange.enterFromContext
  const exitArrangeMode = arrange.exit
  const setTrashDragPreview = (preview: TrashRailDragPreview | null) => {
    trashDragPreviewRef.current = preview
    setTrashDragPreviewState(preview)
  }

  const detachTrashDragWindowListeners = () => {
    trashDragWindowCleanupRef.current?.()
    trashDragWindowCleanupRef.current = null
  }

  const finishTrashDrag = () => {
    detachTrashDragWindowListeners()
    trashDragCandidateRef.current = null
    setTrashDragTargets([])
    setTrashDragPreview(null)
    setIsDraggingOverTrashDrop(false)
  }

  const updateTrashDropTargetFromPointer = (clientX: number, clientY: number) => {
    const rect = arrangeTrashDropRef.current?.getBoundingClientRect()
    const overTrash = Boolean(
      rect && clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom,
    )
    setIsDraggingOverTrashDrop(overTrash)
    return overTrash
  }

  const startTrashDragCandidate = (
    event: ReactPointerEvent<HTMLButtonElement>,
    options: {
      kind: TrashRailDragPreview['kind']
      scopeId: string | null
      draggedId: string
      selectedIds: string[]
      targets: readonly DeleteTarget[]
      label: string
      rail: HTMLElement | null
      selector: string
      attributeName: string
      getLabel: (id: string) => string | undefined
    },
  ) => {
    const { targets } = options
    if (event.button !== 0 || targets.length === 0) return
    detachTrashDragWindowListeners()
    const rect = event.currentTarget.getBoundingClientRect()
    trashDragCandidateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      kind: options.kind,
      scopeId: options.scopeId,
      draggedId: options.draggedId,
      selectedIds: [...options.selectedIds],
      targets: [...targets],
      label: options.label,
      rail: options.rail,
      selector: options.selector,
      attributeName: options.attributeName,
      getLabel: options.getLabel,
      sourceRect: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      },
    }
    const handleWindowPointerMove = (pointerEvent: PointerEvent) => {
      updateTrashDragPointerMove(pointerEvent.pointerId, pointerEvent.clientX, pointerEvent.clientY)
    }
    const handleWindowPointerUp = (pointerEvent: PointerEvent) => {
      finishTrashDragPointer(pointerEvent.pointerId, pointerEvent.clientX, pointerEvent.clientY)
    }
    const handleWindowPointerCancel = (pointerEvent: PointerEvent) => {
      if (trashDragCandidateRef.current?.pointerId !== pointerEvent.pointerId) return
      finishTrashDrag()
    }
    window.addEventListener('pointermove', handleWindowPointerMove, true)
    window.addEventListener('pointerup', handleWindowPointerUp, true)
    window.addEventListener('pointercancel', handleWindowPointerCancel, true)
    trashDragWindowCleanupRef.current = () => {
      window.removeEventListener('pointermove', handleWindowPointerMove, true)
      window.removeEventListener('pointerup', handleWindowPointerUp, true)
      window.removeEventListener('pointercancel', handleWindowPointerCancel, true)
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const updateTrashDragPointerMove = (pointerId: number, clientX: number, clientY: number) => {
    const candidate = trashDragCandidateRef.current
    if (!candidate || candidate.pointerId !== pointerId) return
    const distance = Math.hypot(clientX - candidate.startX, clientY - candidate.startY)
    const currentPreview = trashDragPreviewRef.current
    if (distance < 5 && !currentPreview) return
    suppressTrashClickRef.current = true
    if (!currentPreview) {
      const rect = candidate.sourceRect
      const previewLeft = getArrangeDragPreviewCenteredLeft(clientX, rect.width)
      const previewTop = getArrangeDragPreviewBelowPointerTop(clientY, rect.height)
      setTrashSelection({
        kind: candidate.kind,
        ids: candidate.selectedIds,
        anchorId: candidate.draggedId,
        scopeId: candidate.scopeId,
      })
      const nextPreview: TrashRailDragPreview = {
        kind: candidate.kind,
        draggedId: candidate.draggedId,
        selectedIds: candidate.selectedIds,
        targets: candidate.targets,
        label: candidate.label,
        dragCount: candidate.selectedIds.length,
        ghostItems: getArrangePreviewGhostItems({
          rail: candidate.rail,
          selector: candidate.selector,
          attributeName: candidate.attributeName,
          selectedIds: candidate.selectedIds,
          draggedId: candidate.draggedId,
          getLabel: candidate.getLabel,
          previewLeft,
          previewTop,
          fallbackWidth: rect.width,
          fallbackHeight: rect.height,
        }),
        currentX: clientX,
        currentY: clientY,
        offsetX: clientX - rect.left,
        offsetY: clientY - rect.top,
        width: rect.width,
        height: rect.height,
      }
      setTrashDragTargets(candidate.targets)
      setTrashDragPreview(nextPreview)
    } else {
      setTrashDragPreview({
        ...currentPreview,
        currentX: clientX,
        currentY: clientY,
      })
    }
    updateTrashDropTargetFromPointer(clientX, clientY)
  }

  const finishTrashDragPointer = (pointerId: number, clientX: number, clientY: number) => {
    const candidate = trashDragCandidateRef.current
    if (!candidate || candidate.pointerId !== pointerId) return
    const currentPreview = trashDragPreviewRef.current
    const targets = currentPreview?.targets ?? candidate.targets
    const droppedOnTrash = Boolean(currentPreview) && updateTrashDropTargetFromPointer(clientX, clientY)
    finishTrashDrag()
    if (droppedOnTrash && targets.length > 0) {
      requestDeleteTrashTargetsForRealRef.current(targets)
    }
  }

  const handleTrashDragPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    updateTrashDragPointerMove(event.pointerId, event.clientX, event.clientY)
  }

  const handleTrashDragPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    finishTrashDragPointer(event.pointerId, event.clientX, event.clientY)
  }

  const handleTrashDragPointerCancel = () => {
    finishTrashDrag()
  }

  useEffect(() => () => detachTrashDragWindowListeners(), [])

  const consumeTrashClickSuppression = () => {
    if (!suppressTrashClickRef.current) return false
    suppressTrashClickRef.current = false
    return true
  }

  const openTrashSelectionContextMenu = (
    event: ReactMouseEvent<HTMLButtonElement>,
    kind: TrashSelectionKind,
    itemId: string,
    scopeId: string | null,
  ) => {
    event.preventDefault()
    setMenuOpen(false)
    const itemAlreadySelected =
      trashSelection.kind === kind && trashSelection.scopeId === scopeId && trashSelection.ids.includes(itemId)
    if (!itemAlreadySelected) {
      setTrashSelection({
        kind,
        ids: [itemId],
        anchorId: itemId,
        scopeId,
      })
    }
    setContextMenu({ type: 'trash-selection', x: event.clientX, y: event.clientY })
  }

  const openTrashHomeNote = () => {
    clearTrashSelection()
    setTrashDomainId('')
    setTrashSpaceId('')
    setTrashTabId(TRASH_HOME_ID)
    setTrashSubTabId(null)
  }

  const moveGuidedArrangeCarryToTrash = () => {
    const prompt = arrangeDestinationPrompt
    if (!prompt) return
    const currentState = stateRef.current
    if (prompt.request.item.type === 'parent') {
      const projected = projectActiveDomainState(currentState)
      const sourceDomain = projected.domains.find((domain) => domain.id === prompt.request.sourceDomainId)
      const sourceSpace = sourceDomain?.spaces.find((space) => space.id === prompt.request.sourceSpaceId)
      const movedIds = new Set(prompt.request.item.parentTabIds)
      if (sourceSpace && sourceSpace.data.tabs.length > 0 && sourceSpace.data.tabs.every((tab) => movedIds.has(tab.id))) {
        pushToast(LAST_PARENT_TAB_TOAST, 'warning')
        return
      }
    }
    saveActiveCursorBeforeNavigation()
    const createEntityId = createReservedIdAllocator(collectAppNavigationEntityIds(currentState))
    const result = moveHierarchyDropRequestItemToTrash(currentState, prompt.request, {
      createDeletedEntryId: createEntityId,
      createFallbackTab: () => createTab('tab', createEntityId),
    })
    setState(result.state)
    setArrangeDestinationPrompt(null)
    setGuidedParentRailTarget(null)
    clearArrangeSelection()
    closeEditorEphemeraRef.current()
    setEditing(null)
    if (result.moved) {
      pushToast(formatMovedToTrashToast(result.moved.kind, result.moved.name), 'success')
    }
  }
  const cancelArrangeDestinationPrompt = () => {
    setArrangeDestinationPrompt(null)
    setGuidedParentRailTarget(null)
    pushToast('Arrangement cancelled.', 'warning')
    exitArrangeMode()
  }
  const advanceArrangeHierarchyReveal = arrange.advanceHierarchyReveal
  const startArrangeDragSeed = arrange.startDragSeed
  const startArrangeTapCandidate = arrange.startTapCandidate
  const startArrangePress = arrange.startPress
  const handleArrangeParentSelectionClick = arrange.handleParentSelectionClick
  const handleArrangeSubTabSelectionClick = arrange.handleSubTabSelectionClick
  const handleArrangeDomainSelectionClick = arrange.handleDomainSelectionClick
  const handleArrangeSpaceSelectionClick = arrange.handleSpaceSelectionClick
  const finalizeArrangeTapCandidate = arrange.finalizeTapCandidate
  const handleArrangeDomainPointerMove = arrange.handleDomainPointerMove
  const handleArrangeDomainPointerUp = arrange.handleDomainPointerUp
  const cancelArrangeDomainPointerDrag = arrange.cancelDomainPointerDrag
  const handleArrangeSpacePointerMove = arrange.handleSpacePointerMove
  const handleArrangeSpacePointerUp = arrange.handleSpacePointerUp
  const cancelArrangeSpacePointerDrag = arrange.cancelSpacePointerDrag
  const handleArrangeTabPointerMove = arrange.handleTabPointerMove
  const handleArrangeTabPointerUp = arrange.handleTabPointerUp
  const cancelArrangeTabPointerDrag = arrange.cancelTabPointerDrag

  useEffect(() => {
    if (arrangeMode.active && viewMode === 'main') return
    setArrangeDestinationPrompt(null)
    setGuidedParentRailTarget(null)
  }, [arrangeMode.active, viewMode])

  useEffect(() => {
    if (arrangeDestinationPrompt) return
    setGuidedParentRailTarget(null)
  }, [arrangeDestinationPrompt])

  const navigationActions = useAppNavigationActions({
    state,
    setState,
    viewMode,
    setViewMode,
    contextMenu,
    setMenuOpen,
    setEditing,
    editingRef,
    renameDraftRef,
    workspace,
    activeTab,
    activeNoteBodyId,
    resolvedActiveAisleId,
    editorRef,
    pendingCreatedEditRef,
    skipRenameBlurRef,
    pendingFocusToAisleIdRef,
    pendingCursorRestoreRef,
    closeEditorEphemeraRef,
    activateAisleEditorRef,
    arrangeModeActive: arrangeMode.active,
    exitArrangeMode,
    saveActiveCursorBeforeNavigation,
    updateActiveSpaceData,
  })
  const commitRename = navigationActions.commitRename
  const shouldSkipRenameBlur = navigationActions.shouldSkipRenameBlur
  const isPendingCreatedRename = (type: 'tab' | 'subtab', id: string) =>
    pendingCreatedEditRef.current?.type === type && pendingCreatedEditRef.current.id === id
  const tabRenameEnterBehavior =
    state.ui.tabRenameEnterBehavior ?? DEFAULT_UI_SETTINGS.tabRenameEnterBehavior ?? 'goes-to-note'
  const cancelRename = navigationActions.cancelRename
  const addTab = navigationActions.addTab
  const addSubTab = navigationActions.addSubTab
  const selectTab = navigationActions.selectTab
  const selectSubTab = navigationActions.selectSubTab
  const selectParentHomeTab = navigationActions.selectParentHomeTab
  const duplicateSpaceFromContext = navigationActions.duplicateSpaceFromContext
  const toggleTrashView = () => {
    exitTagFilterMode()
    setTrashDomainId('')
    setTrashSpaceId('')
    navigationActions.toggleTrashView()
  }
  const openSettings = navigationActions.openSettings
  const toggleRailVisibility = (target: RailVisibilityTarget) => {
    setState((previous) => ({
      ...previous,
      ui: {
        ...previous.ui,
        ...getToggledRailVisibilitySettings(previous.ui, target),
      },
    }))
    closeEditorEphemeraRef.current()
    setMenuOpen(false)
  }
  const toggleSpaceRailVisibility = () => toggleRailVisibility('space')
  const toggleDomainRailVisibility = () => toggleRailVisibility('domain')

  const addSpaceFromCompactRail = () => {
    saveActiveCursorBeforeNavigation()
    const previousState = stateRef.current
    const createEntityId = createReservedIdAllocator(collectAppNavigationEntityIds(previousState))
    const newSpace = createSpace('space', createEntityId)
    setScratchpadActive(false)
    setState((previous) => ensureNoteBodiesForAppState(addSpaceToActiveDomain(previous, newSpace)))
    pendingCreatedEditRef.current = {
      type: 'space',
      id: newSpace.id,
      sourceDomainId: previousState.activeDomainId,
      previousActiveSpaceId: previousState.activeSpaceId,
    }
    setViewMode('main')
    closeEditorEphemeraRef.current()
    setMenuOpen(false)
    setEditing({ type: 'space', id: newSpace.id })
  }

  const addDomainFromCompactRail = () => {
    saveActiveCursorBeforeNavigation()
    const previousState = stateRef.current
    const createEntityId = createReservedIdAllocator(collectAppNavigationEntityIds(previousState))
    const newDomain = createDomain('domain', createEntityId)
    setScratchpadActive(false)
    setState((previous) => ensureNoteBodiesForAppState(addDomain(previous, newDomain)))
    pendingCreatedEditRef.current = {
      type: 'domain',
      id: newDomain.id,
      previousActiveDomainId: previousState.activeDomainId,
      previousActiveSpaceId: previousState.activeSpaceId,
    }
    setViewMode('main')
    closeEditorEphemeraRef.current()
    setMenuOpen(false)
    setEditing({ type: 'domain', id: newDomain.id })
  }

  const openSpaceFromCompactRail = (spaceId: string) => {
    if (arrangeDestinationPrompt) {
      if (!promptAllowsSpaceSelection(arrangeDestinationPrompt)) return
      selectArrangeDestinationSpace(spaceId)
      return
    }
    saveActiveCursorBeforeNavigation()
    closeEditorEphemeraRef.current()
    setScratchpadActive(false)
    setState((previous) => setActiveSpaceInActiveDomain(previous, spaceId))
    setViewMode('main')
    setMenuOpen(false)
    setEditing(null)
  }

  const openDomainFromCompactRail = (domainId: string) => {
    if (arrangeDestinationPrompt) {
      saveActiveCursorBeforeNavigation()
      closeEditorEphemeraRef.current()
      const resolution =
        domainId === arrangeDestinationPrompt.targetDomainId
          ? resolveArrangePromptDomainConfirmation(stateRef.current, arrangeDestinationPrompt, domainId)
          : resolveArrangeDomainDestination(
              stateRef.current,
              arrangeDestinationPrompt.request,
              arrangeDestinationPrompt.carriedPreview,
              domainId,
            )
      applyArrangeGuidedTransferResolution(resolution)
      return
    }
    saveActiveCursorBeforeNavigation()
    closeEditorEphemeraRef.current()
    setScratchpadActive(false)
    setState((previous) => setActiveDomain(previous, domainId))
    setViewMode('main')
    setMenuOpen(false)
    setEditing(null)
  }

  const getParentPlacementPositionFromEvent = (
    event?: ReactMouseEvent<HTMLButtonElement> | ReactPointerEvent<HTMLButtonElement>,
  ): ArrangeInsertPosition => {
    if (!event) return guidedParentRailTarget?.targetId ? guidedParentRailTarget.position ?? 'after' : 'after'
    const rect = event.currentTarget.getBoundingClientRect()
    return event.clientX < rect.left + rect.width / 2 ? 'before' : 'after'
  }

  const selectParentTabFromTopBar = (
    tabId: string,
    event?: ReactMouseEvent<HTMLButtonElement> | ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (arrangeDestinationPrompt) {
      if (
        arrangeDestinationPrompt.targetDomainId === state.activeDomainId &&
        arrangeDestinationPrompt.targetSpaceId === activeSpace.id
      ) {
        if (arrangeDestinationPrompt.request.item.type === 'parent') {
          selectArrangeDestinationParentPlacement(tabId, getParentPlacementPositionFromEvent(event))
        } else {
          selectArrangeDestinationParent(tabId)
        }
      }
      return
    }
    setScratchpadActive(false)
    selectTab(tabId)
  }

  const updateGuidedParentRailTarget = (tabId: string, event: ReactPointerEvent<HTMLButtonElement>) => {
    const prompt = arrangeDestinationPrompt
    if (
      !prompt ||
      prompt.targetDomainId !== state.activeDomainId ||
      prompt.targetSpaceId !== activeSpace.id
    ) {
      setGuidedParentRailTarget(null)
      return
    }

    if (prompt.request.item.type === 'parent') {
      const rect = event.currentTarget.getBoundingClientRect()
      const position: ArrangeInsertPosition = event.clientX < rect.left + rect.width / 2 ? 'before' : 'after'
      setGuidedParentRailTarget((previous) =>
        previous?.targetId === tabId && previous.position === position ? previous : { targetId: tabId, position },
      )
      return
    }

    setGuidedParentRailTarget((previous) =>
      previous?.targetId === tabId && previous.position === null ? previous : { targetId: tabId, position: null },
    )
  }

  const clearGuidedParentRailTarget = (tabId: string) => {
    setGuidedParentRailTarget((previous) => (previous?.targetId === tabId ? null : previous))
  }

  const selectSubTabFromRail = (subTabId: string) => {
    if (arrangeDestinationPrompt) return
    setScratchpadActive(false)
    selectSubTab(subTabId)
  }

  const selectParentHomeTabFromRail = () => {
    if (arrangeDestinationPrompt) return
    setScratchpadActive(false)
    selectParentHomeTab()
  }

  const openScratchpadFromRail = () => {
    if (mainArrangementActive || arrangeDestinationPrompt) {
      pushToast('Scratchpad cannot be used in this mode.', 'warning')
      return false
    }
    saveActiveCursorBeforeNavigation()
    closeEditorEphemeraRef.current()
    setViewMode('main')
    setScratchpadActive(true)
    setMenuOpen(false)
    setEditing(null)
    return true
  }

  const openContextMenuForScratchpad = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (viewMode !== 'main') return
    event.preventDefault()
    event.stopPropagation()
    setMenuOpen(false)
    closeEditorEphemeraRef.current()
    setContextMenu({ type: 'scratchpad', x: event.clientX, y: event.clientY })
  }

  const openScratchpadAboutModal = () => {
    closeEditorEphemeraRef.current()
    setModal({ type: 'scratchpad-about' })
  }

  const { navigateHistoryBy, returnToLastTabLikeView } = useNavigationHistory({
    viewMode,
    activeSpaceId: activeSpace.id,
    mainTabId: workspace.activeTabId,
    mainSubTabId: activeTab.activeSubTabId,
    trashTabId,
    trashSubTabId,
    setState,
    setViewMode,
    setTrashTabId,
    setTrashSubTabId,
    flushPendingContent,
    clearTransientUi: () => {
      closeEditorEphemeraRef.current()
      setMenuOpen(false)
      setEditing(null)
    },
  })

  const isTrashHomeSelected = viewMode === 'trash' && trashDisplay.mode === 'home'
  const isEditorView = viewMode === 'main'

  const focusEditorAtDocumentStart = () => {
    const currentEditor = editorRef.current
    const view = getWysiwygView(currentEditor)
    if (!currentEditor || !view) {
      currentEditor?.focus()
      return
    }

    const firstPos = Math.min(1, Math.max(0, view.state.doc.content.size))
    const SelectionCtor = view.state.selection.constructor as {
      create?: (doc: unknown, anchor: number, head?: number) => unknown
    }

    if (typeof SelectionCtor.create === 'function') {
      const nextSelection = SelectionCtor.create(view.state.doc, firstPos, firstPos)
      view.dispatch(view.state.tr.setSelection(nextSelection).scrollIntoView())
    }

    currentEditor.focus()
  }

  const clearActiveNoteContent = () => {
    if (!isMainViewRef.current) return
    const currentEditor = editorRef.current
    if (!currentEditor) return

    closeEditorEphemeraRef.current()
    closeLinkPrompt()
    clearMultiLineEdit(false)

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }

    normalizingContentRef.current = false
    normalizingAisleIdsRef.current.delete(activeAisleIdRef.current)
    lastEditorMarkdownRef.current = ''
    const activeAisle = activeNoteAisles.find((aisle) => aisle.id === activeAisleIdRef.current)
    const activeAisleBodyId = activeAisle ? getAisleBodyId(activeAisle) : activeAisleIdRef.current
    pendingContentRef.current.delete(activeAisleBodyId)
    lastEditorMarkdownByAisleRef.current.set(activeAisleBodyId, '')
    clearEditorMarkdownForDisplay(currentEditor)
    scheduleContentCommit(
      '',
      activeSpaceIdRef.current,
      activeTabIdRef.current,
      activeSubTabIdRef.current,
      activeAisleIdRef.current,
    )

    window.requestAnimationFrame(() => {
      focusEditorAtDocumentStart()
    })
  }

  const multilineEditing = useMultilineEditing({
    editorRef,
    lastEditorMarkdownRef,
    activeSpaceIdRef,
    activeTabIdRef,
    activeSubTabIdRef,
    activeAisleIdRef,
    isEditorView,
    shortcutDependency: resolvedActiveAisleId,
    getActiveNoteHistoryKey,
    getNormalizedEditorMarkdown,
    scheduleContentCommit,
  })
  const multiLineEditRef = multilineEditing.editStateRef
  const multiLineCursorPluginKeyRef = multilineEditing.pluginKeyRef
  const clearMultiLineEdit = multilineEditing.clear
  const tryApplyMultilineIndent = multilineEditing.tryApplyIndent
  const tryExpandMultilineSelection = multilineEditing.tryExpandSelection
  const tryApplyMultiLineEditInput = multilineEditing.tryApplyInput
  const tryApplyMultiLineTabInput = multilineEditing.tryApplyTabInput
  const tryApplyMultiLineListOperation = multilineEditing.tryApplyListOperation
  const tryApplyMultiLineListMarkerShortcut = multilineEditing.tryApplyListMarkerShortcut
  const tryApplyMultiLineHeadingOperation = multilineEditing.tryApplyHeadingOperation
  const tryApplyBlockQuoteOperation = multilineEditing.tryApplyBlockQuoteOperation
  const tryApplyBlockIndentOperation = multilineEditing.tryApplyBlockIndentOperation
  const tryRemoveBlockIndentOperation = multilineEditing.tryRemoveBlockIndentOperation
  const tryApplyMultiLineCodeBlockOperation = multilineEditing.tryApplyCodeBlockOperation
  const tryApplyMultiLineInlineFormat = multilineEditing.tryApplyInlineFormat
  const tryApplyMultiLineBlockMarkerShortcut = multilineEditing.tryApplyBlockMarkerShortcut
  const tryApplyMultiLineInlineMarkerShortcut = multilineEditing.tryApplyInlineMarkerShortcut
  const tryMoveMultiLineCursors = multilineEditing.tryMoveCursors
  const copyMultiLineSelectionToClipboard = multilineEditing.copySelectionToClipboard
  const cutMultiLineSelectionToClipboard = multilineEditing.cutSelectionToClipboard
  const scheduleMultiLineHistoryRestore = multilineEditing.scheduleHistoryRestore
  const getEditorHistoryDirection = multilineEditing.getEditorHistoryDirection

  useEffect(() => {
    const handleStructuralHistoryKeydown = (event: KeyboardEvent) => {
      if (viewMode !== 'main') return
      if (insertNoteReferenceModalOpen) return
      const direction = getEditorHistoryDirection(event)
      if (!direction) return
      const target = event.target instanceof Node ? event.target : null
      if (target && editorEventRootRef.current?.contains(target)) return
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"], .link-prompt')) {
        return
      }
      if (!runAisleStructuralHistory(direction)) return
      event.preventDefault()
      event.stopPropagation()
    }

    window.addEventListener('keydown', handleStructuralHistoryKeydown, true)
    return () => window.removeEventListener('keydown', handleStructuralHistoryKeydown, true)
  }, [viewMode, insertNoteReferenceModalOpen, getEditorHistoryDirection, runAisleStructuralHistory])

  const isPendingCreatedRenameActive = () => {
    return Boolean(pendingCreatedEditRef.current)
  }

  const editorToolbar = useEditorToolbarState({
    viewMode,
    isMacPlatform,
    editorRef,
    stateRef,
  })
  const copyToolbarButtonRef = editorToolbar.copyToolbarButtonRef
  const headingToolbarButtonRef = editorToolbar.headingToolbarButtonRef
  const aisleToolbarButtonRef = editorToolbar.aisleToolbarButtonRef
  const toolbarFormatState = editorToolbar.toolbarFormatState
  const activeHeadingLevel = editorToolbar.activeHeadingLevel
  const toolbarShortcutFeedback = editorToolbar.toolbarShortcutFeedback
  const copyMenuOpen = editorToolbar.copyMenuOpen
  const headingMenuOpen = editorToolbar.headingMenuOpen
  const toolbarPopoverPosition = editorToolbar.toolbarPopoverPosition
  const setCopyMenuOpen = editorToolbar.setCopyMenuOpen
  const setHeadingMenuOpen = editorToolbar.setHeadingMenuOpen
  const setToolbarPopoverPosition = editorToolbar.setToolbarPopoverPosition
  const refreshToolbarPopoverPosition = editorToolbar.refreshToolbarPopoverPosition
  const getToolbarFormatShortcut = editorToolbar.getToolbarFormatShortcut
  const queueToolbarShortcutFeedback = editorToolbar.queueToolbarShortcutFeedback
  const syncToolbarFormatState = editorToolbar.syncToolbarFormatState
  const scheduleToolbarFormatStateSync = editorToolbar.scheduleToolbarFormatStateSync

  const noteReferenceActions = useNoteReferenceActions({
    stateRef,
    contextMenu,
    setContextMenu,
    setModal,
    editorRef,
    activeNoteBodyId,
    activeAisleIdRef,
    getCurrentNoteLocation,
    getActiveEditorMarkdown,
    replaceActiveEditorMarkdown,
    commitActiveEditorMarkdownNow,
    saveActiveCursorBeforeNavigation,
    navigateToNoteLocation,
    pushToast,
  })
  const getNotePreviewData = noteReferenceActions.getNotePreviewData
  const resolvePreviewToken = noteReferenceActions.resolvePreviewToken
  const resolveInternalNoteReferenceToken = noteReferenceActions.resolveInternalNoteReferenceToken
  const insertLinkIntoActiveEditor = noteReferenceActions.insertLinkIntoActiveEditor
  const insertNoteReference = noteReferenceActions.insertNoteReference
  const deleteNotePreview = noteReferenceActions.deleteNotePreview
  const openNotePreviewContextMenu = noteReferenceActions.openNotePreviewContextMenu
  const openInternalNoteLinkFromContext = noteReferenceActions.openInternalNoteLinkFromContext
  const renameInternalNoteLinkFromContext = noteReferenceActions.renameInternalNoteLinkFromContext
  const replaceCurrentNoteFromMention = ({
    target,
    mode,
  }: {
    target: NoteNavigationTarget
    mode: NoteCopyMode
  }) => {
    if (viewMode !== 'main') {
      const message = 'Open a note before making a copy.'
      pushToast(message, 'warning')
      return { handled: false, toast: { message, tone: 'warning' as const } }
    }
    const latestState = buildStateWithLatestEditorContent()
    if (scratchpadWorkspaceActive) {
      if (mode === 'linked') {
        const message = 'Scratchpad cannot receive synced copies.'
        pushToast(message, 'warning')
        return { handled: false, toast: { message, tone: 'warning' as const } }
      }
    }

    const copyTarget = getNoteMentionAisleCopyTarget(latestState, target)
    if (!copyTarget) {
      const message = 'Selected aisle could not be copied.'
      pushToast(message, 'warning')
      return { handled: false, toast: { message, tone: 'warning' as const } }
    }
    const action = mode === 'linked' ? 'duplicate' : 'copy'
    const payload: CopyAsClipboardPayload = {
      version: 1,
      scope: 'aisle',
      action,
      source: copyTarget.source,
      aisleId: copyTarget.aisleId,
    }
    const result = buildFocusedAisleStructuralPasteReplacement({
      appState: latestState,
      payload,
      beforeSnapshot: captureActiveAisleStructuralSnapshot(latestState),
      mode: 'always',
      maxAisles: scratchpadWorkspaceActive ? getScratchpadAisleLimit() : MAX_NOTE_AISLES,
    })
    if (result.status !== 'applied') {
      const message = result.status === 'blocked' ? result.message : 'Selected aisle could not be copied.'
      if (message === 'Maximum aisle count reached.') {
        if (scratchpadWorkspaceActive) {
          showScratchpadAisleLimitToast()
        } else {
          pushToast(MAX_AISLE_WARNING_MESSAGE, 'warning')
        }
        return { handled: false, toast: { message, tone: 'warning' as const } }
      }
      pushToast(message, 'warning')
      return { handled: false, toast: { message, tone: 'warning' as const } }
    }

    if (!result.activeAisleId) {
      const message = 'Copied aisle no longer exists.'
      pushToast(message, 'warning')
      return { handled: false, toast: { message, tone: 'warning' as const } }
    }

    applyAisleEditDraftToActiveNote(result.aisles, {
      activeAisleId: result.activeAisleId,
      additionalAisleBodies: result.aisleBodies,
    })
    closeEditorEphemeraRef.current()
    pushToast(getCopyAsPasteSuccessMessage('aisle', payload.action), 'success')
    return { handled: true }
  }
  const noteMention = useNoteMentionController({
    viewMode,
    state,
    stateRef,
    activeNoteLocation,
    editorRef,
    editorEventRootRef,
    activeAisleIdRef,
    getCurrentNoteLocation,
    insertNoteReferenceFromMention: noteReferenceActions.insertNoteReferenceFromMention,
    replaceCurrentNoteFromMention,
    requireCopyConfirmation: state.ui.noteMentionCopyRequiresConfirmation ?? true,
    syncToolbarFormatState,
  })
  const tagAutocomplete = useTagAutocompleteController({
    viewMode,
    availableTags: tagAutocompleteFilterIndex.availableOptions,
    recentTagKeys: tagAutocompleteRecentKeys,
    onRecentTagKeysChange: (keys) => {
      const normalizedKeys = normalizeTagAutocompleteRecentKeys(keys)
      setTagAutocompleteRecentKeys(normalizedKeys)
      savePartialDeviceSettings({ tagAutocompleteRecentKeys: normalizedKeys })
    },
    editorRef,
    editorEventRootRef,
    activeAisleIdRef,
    commitActiveEditorMarkdownNow,
    syncToolbarFormatState,
  })
  const openSettingsView = () => {
    closeEditorEphemeraRef.current()
    exitTagFilterMode()
    openSettings()
  }
  const openEtCeteraView = () => {
    const targetViewMode = lastEtCeteraViewModeRef.current
    if (targetViewMode === 'messages') {
      openMessagesView()
      return
    }
    if (targetViewMode === 'about') {
      openAboutView()
      return
    }
    openSettingsView()
  }

  const toggleHeadingCollapse = (aisleId: string, headingKey: string) => {
    if (!activeNoteBodyId) return
    setState((previous) => {
      const nextCollapsed = !isHeadingCollapsed(previous.ui.headingCollapseState, activeNoteBodyId, aisleId, headingKey)
      const nextHeadingCollapseState = setHeadingCollapsed(
        previous.ui.headingCollapseState,
        activeNoteBodyId,
        aisleId,
        headingKey,
        nextCollapsed,
      )
      if (nextHeadingCollapseState === previous.ui.headingCollapseState) return previous
      return {
        ...previous,
        ui: {
          ...previous.ui,
          headingCollapseState: nextHeadingCollapseState,
        },
      }
    })
  }

  const expandHeadingCollapse = (aisleId: string, headingKey: string) => {
    if (!activeNoteBodyId) return
    setState((previous) => {
      const nextHeadingCollapseState = setHeadingCollapsed(
        previous.ui.headingCollapseState,
        activeNoteBodyId,
        aisleId,
        headingKey,
        false,
      )
      if (nextHeadingCollapseState === previous.ui.headingCollapseState) return previous
      return {
        ...previous,
        ui: {
          ...previous.ui,
          headingCollapseState: nextHeadingCollapseState,
        },
      }
    })
  }

  const aisleEditors = useAisleEditors({
    viewMode,
    activeNoteBodyId,
    activeNoteAisles,
    resolvedActiveAisleId,
    activeAisleId,
    setActiveAisleId,
    aisleScrollRef,
    editorRef,
    multiLineCursorPluginKeyRef,
    lastEditorMarkdownRef,
    lastEditorMarkdownByAisleRef,
    normalizingContentRef,
    normalizingAisleIdsRef,
    pendingContentRef,
    pendingCursorRestoreRef,
    pendingFocusToAisleIdRef,
    activeSpaceIdRef,
    activeTabIdRef,
    activeSubTabIdRef,
    activeAisleIdRef,
    activeEditorAisleIdRef,
    isMainViewRef,
    closeImageToolsRef,
    closeImageToolsIfSelectedImageMissingRef,
    isPendingCreatedRenameActive,
    saveActiveCursorLocation,
    flushPendingContent,
    clearMultiLineEdit,
    getNormalizedEditorMarkdown,
    normalizeEditorMarkdownForPersistence,
    normalizeEditorMarkdownForDisplay,
    scheduleContentCommit,
    scheduleLazyContentCommit: editorPersistence.scheduleLazyContentCommit,
    registerMountedEditorSnapshotProvider,
    commitCurrentEditorContent,
    pushToast,
    maybeShowCompletedTaskUndoHint,
    trackCompletedTaskQuickDelete,
    tryExpandMultilineSelection,
    scheduleToolbarFormatStateSync,
    headingCollapseState: state.ui.headingCollapseState,
    onToggleHeadingCollapse: toggleHeadingCollapse,
    onExpandHeadingCollapse: expandHeadingCollapse,
    getNotePreviewData,
    resolvePreviewToken,
    resolveInternalNoteReferenceToken,
    navigateToNoteLocation,
    deleteNotePreview: (request) => deleteNotePreviewRef.current(request),
    openNotePreviewContextMenu,
  })
  const activateAisleEditor = aisleEditors.activateAisleEditor
  const activateEditorFromEventTarget = aisleEditors.activateEditorFromEventTarget
  const registerAisleEditorRoot = aisleEditors.registerAisleEditorRoot
  const registerAislePaneRoot = aisleEditors.registerAislePaneRoot
  const mountedAisleIds = aisleEditors.mountedAisleIds
  const getHeadingOutlineForAisle = aisleEditors.getHeadingOutlineForAisle
  const getTableOfContentsLinksForAisle = aisleEditors.getTableOfContentsLinksForAisle
  const scrollToAisleHeading = aisleEditors.scrollToAisleHeading
  const scrollToAisleLink = aisleEditors.scrollToAisleLink
  const getPreviewMarkdownForAisle = aisleEditors.getPreviewMarkdownForAisle
  activateAisleEditorRef.current = activateAisleEditor

  const openTableOfContents = () => {
    closeEditorEphemeraRef.current()
    if (!activeNoteBodyId) {
      pushToast('Open a note before using table of contents.', 'warning')
      return
    }

    const nextTableOfContentsPanels = buildTableOfContentsPanels(
      activeNoteBodyId,
      activeNoteAisles,
      getHeadingOutlineForAisle,
      {
        scope: state.ui.tableOfContentsScope ?? 'all-aisles',
        focusedAisleId: resolvedActiveAisleId,
        getLinksForAisle: getTableOfContentsLinksForAisle,
      },
    )

    if (!nextTableOfContentsPanels) {
      pushToast(TABLE_OF_CONTENTS_EMPTY_MESSAGE, 'warning')
      setTableOfContentsPanels(null)
      return
    }

    setTableOfContentsPanels(nextTableOfContentsPanels)
  }

  const closeTableOfContentsAisle = (aisleId: string) => {
    setTableOfContentsPanels((current) => {
      if (!current || !current.openAisleIds.has(aisleId)) return current
      const nextOpenAisleIds = new Set(current.openAisleIds)
      nextOpenAisleIds.delete(aisleId)
      return nextOpenAisleIds.size > 0 ? { ...current, openAisleIds: nextOpenAisleIds } : null
    })
  }

  const selectTableOfContentsHeading = (aisleId: string, headingKey: string) => {
    closeTableOfContentsAisle(aisleId)
    scrollToAisleHeading(aisleId, headingKey)
  }

  const selectTableOfContentsLink = (aisleId: string, linkKey: string) => {
    closeTableOfContentsAisle(aisleId)
    scrollToAisleLink(aisleId, linkKey)
  }

  const openTableOfContentsLinkTarget = (aisleId: string, link: TableOfContentsLinkItem) => {
    closeTableOfContentsAisle(aisleId)
    if (link.kind === 'url-link' && link.href) {
      openExternalWebUrl(link.href)
      return
    }
    if (link.target) {
      navigateToNoteLocation(link.target)
    }
  }

  useEffect(() => {
    const pending = pendingNavigationHeadingRef.current
    if (!pending || viewMode !== 'main' || !activeNoteBodyId) return
    const targetAisle = activeNoteAisles.find((aisle) => aisle.id === pending.aisleId) ?? null
    if (!targetAisle) {
      pendingNavigationHeadingRef.current = null
      return
    }
    const headingExists = getHeadingOutlineForAisle(targetAisle).some((heading) => heading.key === pending.headingKey)
    if (!headingExists) {
      pendingNavigationHeadingRef.current = null
      return
    }
    pendingCursorRestoreRef.current = null
    pendingScrollToAisleIdRef.current = pending.aisleId
    pendingFocusToAisleIdRef.current = pending.aisleId
    if (activeAisleId !== pending.aisleId) {
      syncActiveAisleSelection(pending.aisleId)
    }
    scrollToAisleHeading(pending.aisleId, pending.headingKey)
    pendingNavigationHeadingRef.current = null
  }, [
    activeAisleId,
    activeNoteAisles,
    activeNoteBodyId,
    getHeadingOutlineForAisle,
    pendingCursorRestoreRef,
    pendingFocusToAisleIdRef,
    pendingScrollToAisleIdRef,
    scrollToAisleHeading,
    syncActiveAisleSelection,
    viewMode,
  ])

  useEffect(() => {
    const pendingAisleId = pendingNavigationAisleIdRef.current
    if (!pendingAisleId || viewMode !== 'main' || !activeNoteBodyId) return
    if (!activeNoteAisles.some((aisle) => aisle.id === pendingAisleId)) {
      pendingNavigationAisleIdRef.current = null
      return
    }
    pendingCursorRestoreRef.current = null
    pendingScrollToAisleIdRef.current = pendingAisleId
    pendingFocusToAisleIdRef.current = pendingAisleId
    if (activeAisleId !== pendingAisleId) {
      syncActiveAisleSelection(pendingAisleId)
    }
    pendingNavigationAisleIdRef.current = null
  }, [
    activeAisleId,
    activeNoteAisles,
    activeNoteBodyId,
    pendingCursorRestoreRef,
    pendingFocusToAisleIdRef,
    pendingScrollToAisleIdRef,
    syncActiveAisleSelection,
    viewMode,
  ])

  usePendingNoteCursorRestore({
    viewMode,
    activeNoteBodyId,
    activeNoteAisles,
    resolvedActiveAisleId,
    activeNoteLocationKey,
    editing,
    editorRef,
    pendingCreatedEditRef,
    pendingFocusToAisleIdRef,
    pendingCursorRestoreRef,
    pendingNavigationTopAisleIdRef,
    suppressSavedCursorRestoreRef: pendingTagOccurrenceRef,
    activateAisleEditor,
  })

  const closeLinkPrompt = () => undefined

  const getLastLinkInsertMode = (): LinkInsertMode => stateRef.current.ui.lastLinkInsertMode ?? 'note'

  const setLastLinkInsertMode = (mode: LinkInsertMode) => {
    const nextState = {
      ...stateRef.current,
      ui: {
        ...stateRef.current.ui,
        lastLinkInsertMode: mode,
      },
    }
    stateRef.current = nextState
    setState(nextState)
  }

  const buildDefaultLinkModal = (mode: LinkInsertMode, selectedText = ''): Extract<ModalState, { type: 'insert-note-reference' }> => {
    const source = getCurrentNoteLocation()
    return buildDefaultNoteReferenceDraft(stateRef.current, source, mode, selectedText, 'modal')
  }

  const openSharedLinkModal = (selectedText = '', initialMode: LinkInsertMode = getLastLinkInsertMode()) => {
    closeEditorEphemeraRef.current()
    saveActiveCursorBeforeNavigation()
    setModal(buildDefaultLinkModal(initialMode, selectedText))
  }

  const openUrlLinkModalFromSelection = (selectedText = '', sourceKind: NoteReferenceSource = 'modal') => {
    closeEditorEphemeraRef.current()
    saveActiveCursorBeforeNavigation()
    setModal(buildUrlLinkShortcutDraft(stateRef.current, getCurrentNoteLocation(), selectedText, sourceKind))
  }

  const openUrlLinkModalFromShortcut = () => openUrlLinkModalFromSelection(getActiveEditorSelectedText())

  const openExternalLinkEditModal = (href: string, label: string, range: LinkEditRange | null) => {
    closeEditorEphemeraRef.current()
    saveActiveCursorBeforeNavigation()
    setModal(buildExternalLinkEditDraft(stateRef.current, getCurrentNoteLocation(), href, label, range))
  }

  const openInternalNoteLinkEditModal = (edit: InternalNoteLinkEdit & { previewEdit?: NotePreviewEdit | null }) => {
    closeEditorEphemeraRef.current()
    saveActiveCursorBeforeNavigation()
    setModal(buildInternalNoteLinkEditDraft(stateRef.current, getCurrentNoteLocation(), edit))
  }

  const imageToolsController = useImageTools({
    editorRef,
    editorEventRootRef,
    activateEditorFromEventTarget,
    commitCurrentEditorContent,
    commitActiveEditorMarkdownNow,
    pushToast,
  })
  const imageTools = imageToolsController.imageTools
  const inlineCrop = imageToolsController.inlineCrop
  const activeImageRef = imageToolsController.activeImageRef
  const isImageCropActive = imageToolsController.isCropActive
  const closeImageTools = imageToolsController.close
  const closeImageToolsIfSelectedImageMissing = imageToolsController.closeIfSelectedImageMissing
  const refreshImageToolsPosition = imageToolsController.refreshPosition
  const selectImageForTools = imageToolsController.select
  const copySelectedImageToClipboard = imageToolsController.copySelectedToClipboard
  const deleteActiveEditorImageNode = imageToolsController.deleteSelectedImage
  const beginImageResize = imageToolsController.beginResize
  const startInlineCrop = imageToolsController.startCrop
  const openImageTransformMenu = imageToolsController.openTransformMenu
  const returnToImageToolsMenu = imageToolsController.returnToStartMenu
  const transformSelectedImage = imageToolsController.transformSelectedImage
  const cancelInlineCrop = imageToolsController.cancelCrop
  const setInlineCropRatio = imageToolsController.setCropRatio
  const applyInlineCrop = imageToolsController.applyCrop
  const beginInlineCropMouseDrag = imageToolsController.beginCropMouseDrag
  closeImageToolsRef.current = closeImageTools
  closeImageToolsIfSelectedImageMissingRef.current = closeImageToolsIfSelectedImageMissing

  const mediaToolsController = useMediaTools({
    editorRef,
    editorEventRootRef,
    activateEditorFromEventTarget,
    commitCurrentEditorContent,
    commitActiveEditorMarkdownNow,
  })
  const mediaTools = mediaToolsController.mediaTools
  const activeMediaRef = mediaToolsController.activeMediaRef
  const closeMediaTools = mediaToolsController.close
  const refreshMediaToolsPosition = mediaToolsController.refreshPosition
  const selectMediaForTools = mediaToolsController.select
  const beginMediaResize = mediaToolsController.beginResize
  const openMediaTransformMenu = mediaToolsController.openTransformMenu
  const returnToMediaToolsMenu = mediaToolsController.returnToStartMenu
  const transformSelectedMedia = mediaToolsController.transformSelectedMedia
  closeMediaToolsRef.current = closeMediaTools

  const tableControlsController = useTableControls({
    visible: viewMode === 'main' && !aisleEditModalOpen,
    editorRef,
    editorEventRootRef,
    commitActiveEditorMarkdownNow,
    syncToolbarFormatState,
  })
  const tableControls = tableControlsController.tableControls
  const closeTableControls = tableControlsController.close
  const runTableControlOperation = tableControlsController.runTableControlOperation
  closeTableControlsRef.current = closeTableControls
  closeEditorEphemeraRef.current = (options: CloseEditorEphemeraOptions = {}) => {
    closeEditorEphemera(
      {
        dismissMentionMenu: noteMention.dismissCurrentQuery,
        dismissTagAutocomplete: tagAutocomplete.dismissCurrentQuery,
        closeToolbarPopovers: () => {
          setCopyMenuOpen(false)
          setHeadingMenuOpen(false)
          setToolbarPopoverPosition({ copy: null, heading: null })
        },
        closeContextMenu: () => setContextMenu(null),
        closeImageTools: () => {
          closeImageToolsRef.current()
          closeMediaToolsRef.current()
        },
        closeTableTools: () => closeTableControlsRef.current(),
        closeTableOfContents: () => setTableOfContentsPanels(null),
        closeShortcutMenu: (shortcutOptions) => closeShortcutMenuRef.current(shortcutOptions),
      },
      options,
    )
  }

  const editorOperationRuntime: EditorOperationRuntime = {
    editorRef,
    commitActiveEditorMarkdownNow,
    syncToolbarFormatState,
    pushToast,
  }

  const scheduleActiveEditorCommandCommit = (currentEditor: Editor) => {
    finishEditorOperation(editorOperationRuntime, currentEditor, { commitMode: 'deferred', syncToolbar: true })
  }

  const runActiveEditorFormatCommand = (format: MultiLineInlineFormat) => {
    const currentEditor = editorRef.current
    if (!currentEditor) return false
    currentEditor.focus()
    if (multiLineEditRef.current) {
      if (tryApplyMultiLineInlineFormat(format)) {
        scheduleActiveEditorCommandCommit(currentEditor)
      }
      return true
    }
    return runEditorCommandOperation(editorOperationRuntime, format, undefined, {
      commitMode: 'deferred',
      syncToolbar: true,
    }).handled
  }

  const runActiveEditorCommand = (command: string, payload?: Record<string, unknown>) => {
    const currentEditor = editorRef.current
    if (!currentEditor) return false
    currentEditor.focus()
    const tableInsertAnchor = command === 'addTable'
      ? (getWysiwygView(currentEditor)?.state?.selection?.from ?? 0)
      : null
    if (command === 'addTable') {
      const tableSelectionResult = replaceSelectedTextWithTableOperation(editorOperationRuntime, {
        commitMode: 'none',
        syncToolbar: false,
      })
      if (tableSelectionResult.handled) {
        scheduleActiveEditorCommandCommit(currentEditor)
        return true
      }
    }
    if (command === 'bold' || command === 'italic' || command === 'strike' || command === 'highlight') {
      return runActiveEditorFormatCommand(command)
    }
    if (command === 'heading' && multiLineEditRef.current) {
      const level = typeof payload?.level === 'number' ? payload.level : null
      if (level !== null && level >= 0 && level <= 6) {
        if (tryApplyMultiLineHeadingOperation(level as MultiLineHeadingLevel)) {
          scheduleActiveEditorCommandCommit(currentEditor)
        }
        return true
      }
    }
    if (command === 'blockIndent') {
      if (tryApplyBlockIndentOperation()) {
        scheduleActiveEditorCommandCommit(currentEditor)
      }
      return true
    }
    if (command === 'removeBlockIndent') {
      if (tryRemoveBlockIndentOperation()) {
        scheduleActiveEditorCommandCommit(currentEditor)
      }
      return true
    }
    if (command === 'blockQuote') {
      if (tryApplyBlockQuoteOperation()) {
        scheduleActiveEditorCommandCommit(currentEditor)
        return true
      }
      if (multiLineEditRef.current) return true
    }
    if (command === 'codeBlock' && multiLineEditRef.current) {
      if (tryApplyMultiLineCodeBlockOperation()) {
        scheduleActiveEditorCommandCommit(currentEditor)
      }
      return true
    }
    if (command === 'dashList' || command === 'bulletList' || command === 'orderedList' || command === 'taskList') {
      const listCommand = command as ToolbarListCommand
      const multiLineOperation = TOOLBAR_LIST_COMMAND_TO_MULTILINE_OPERATION[listCommand] ?? null
      if (!multiLineEditRef.current || !multiLineOperation || !tryApplyMultiLineListOperation(multiLineOperation)) {
        if (multiLineEditRef.current) return true
        applyListToolbarCommand(currentEditor, listCommand)
      }
    } else {
      runEditorCommandOperation(editorOperationRuntime, command, payload, {
        commitMode: 'none',
        syncToolbar: false,
      })
    }
    if (tableInsertAnchor !== null) {
      window.requestAnimationFrame(() => {
        const view = getWysiwygView(currentEditor)
        if (view) {
          selectFirstTableCellAfterPosition(view, tableInsertAnchor)
        }
      })
    }
    scheduleActiveEditorCommandCommit(currentEditor)
    return true
  }

  const getActiveEditorSelectedText = useCallback(() => {
    const currentEditor = editorRef.current
    if (!currentEditor) return ''
    try {
      return getCommandCapableEditor(currentEditor).getSelectedText().trim()
    } catch {
      return ''
    }
  }, [])

  const runEditorContextCommand = (command: string, payload?: Record<string, unknown>) => {
    closeEditorEphemeraRef.current()
    if (!runActiveEditorCommand(command, payload)) {
      pushToast('Open a note before using the editor menu.', 'warning')
    }
  }

  const getCopyAsSourceAisleId = (latestState: AppState, source: NoteLocation) => {
    return getCopyAsAisleIdForNoteContext(latestState, source, getCurrentNoteLocation(), activeAisleIdRef.current)
  }

  const shouldConfirmSyncedNotePaste = (
    latestState: AppState,
    payload: CopyAsClipboardPayload,
    destination: NoteLocation,
  ): boolean => {
    if (payload.scope !== 'note' || payload.action !== 'duplicate') return false
    if (isScratchpadCopyAsSource(payload.source)) return false
    const sourceInfo = getLocationInfo(latestState, payload.source)
    const destinationInfo = getLocationInfo(latestState, destination)
    if (!sourceInfo.noteBodyId || !destinationInfo.noteBodyId) return false
    if (sourceInfo.noteBodyId === destinationInfo.noteBodyId) return false
    const destinationBody = latestState.noteBodies.find((body) => body.id === destinationInfo.noteBodyId) ?? null
    return Boolean(destinationBody && destinationBody.aisles.length > 1)
  }

  const getSingleAisleIdForSyncedNotePaste = (latestState: AppState, source: NoteLocation): string | undefined => {
    const sourceInfo = getLocationInfo(latestState, source)
    const sourceBody = sourceInfo.noteBodyId
      ? latestState.noteBodies.find((candidate) => candidate.id === sourceInfo.noteBodyId) ?? null
      : null
    return sourceBody?.aisles.length === 1 ? sourceBody.aisles[0]?.id : undefined
  }

  const getDestinationAisleIdForSyncedNotePaste = (latestState: AppState, destination: NoteLocation): string => {
    const destinationInfo = getLocationInfo(latestState, destination)
    const destinationBody = destinationInfo.noteBodyId
      ? latestState.noteBodies.find((candidate) => candidate.id === destinationInfo.noteBodyId) ?? null
      : null
    const activeAisleId = activeAisleIdRef.current
    return destinationBody?.aisles.some((aisle) => aisle.id === activeAisleId)
      ? activeAisleId
      : destinationBody?.aisles[0]?.id ?? ''
  }

  const replaceFocusedAisleWithStructuralCopy = (
    latestState: AppState,
    payload: CopyAsClipboardPayload,
    beforeSnapshot: AisleStructuralSnapshot | null = captureActiveAisleStructuralSnapshot(latestState),
    mode: FocusedAisleStructuralPasteMode = 'blank-only',
    successToast?: { message: string; tone?: ToastTone },
  ): boolean => {
    const maxAisles = scratchpadWorkspaceActive ? getScratchpadAisleLimit() : MAX_NOTE_AISLES
    const result = buildFocusedAisleStructuralPasteReplacement({
      appState: latestState,
      payload,
      beforeSnapshot,
      mode,
      maxAisles,
    })
    if (result.status === 'not-applicable') return false
    if (result.status === 'blocked') {
      if (result.message === 'Maximum aisle count reached.') {
        if (scratchpadWorkspaceActive) {
          showScratchpadAisleLimitToast()
        } else {
          pushToast(MAX_AISLE_WARNING_MESSAGE, 'warning')
        }
        return true
      }
      if (mode === 'always') {
        pushToast(result.message, 'warning')
        return true
      }
      return false
    }

    if (!result.activeAisleId) {
      pushToast('Copied aisle no longer exists.', 'warning')
      return true
    }

    applyAisleEditDraftToActiveNote(result.aisles, {
      activeAisleId: result.activeAisleId,
      additionalAisleBodies: result.aisleBodies,
    })
    closeEditorEphemeraRef.current()
    pushToast(successToast?.message ?? getCopyAsPasteSuccessMessage(payload.scope, payload.action), successToast?.tone ?? 'success')
    return true
  }

  const insertScratchpadAisleCopiesWithCapacity = (
    latestState: AppState,
    newAisles: ResolvedNoteAisle[],
    activeAisleId: string | null | undefined,
    placement: NewAislePlacement,
    additionalAisleBodies: NoteAisleBody[] = [],
  ): boolean => {
    const body = getScratchpadNoteBody(latestState)
    if (!body) {
      pushToast('Open a note before pasting.', 'warning')
      return false
    }
    const baseAisles = cloneAisles(body.aisles, latestState.noteAisleBodies)
    const result = insertNewAislesWithReclaimedSlots(
      baseAisles,
      newAisles,
      activeAisleId,
      placement,
      getScratchpadAisleLimit(),
      (aisle) => isEmptyAisleMarkdown(aisle.markdown),
    )
    if (result.status === 'blocked') {
      pushToast(SCRATCHPAD_COPY_AISLE_LIMIT_MESSAGE, 'warning')
      return false
    }
    applyAisleEditDraftToActiveNote(result.aisles, {
      activeAisleId: newAisles[0]?.id,
      additionalAisleBodies,
    })
    return true
  }

  const pasteIndependentNoteCopyAsAisles = (
    payload: CopyAsClipboardPayload,
    options: {
      destination: NoteLocation
      placement: NewAislePlacement
      destinationAisleId: string
      allowReclaim?: boolean
    },
  ): boolean => {
    if (payload.scope !== 'note' || payload.action !== 'copy' || isScratchpadCopyAsSource(payload.source)) return false
    const latestState = buildStateWithLatestEditorContent()
    if (buildNoteLocationKey(payload.source) === buildNoteLocationKey(options.destination)) {
      pushToast('Choose a different note to paste this independent copy.', 'warning')
      return true
    }
    const destinationInfo = getLocationInfo(latestState, options.destination)
    const destinationBody = destinationInfo.noteBodyId
      ? latestState.noteBodies.find((candidate) => candidate.id === destinationInfo.noteBodyId) ?? null
      : null
    if (!destinationInfo.noteBodyId || !destinationBody) {
      pushToast('Open a note before pasting.', 'warning')
      return true
    }
    if (!destinationBody.aisles.some((aisle) => aisle.id === options.destinationAisleId)) {
      pushToast('Destination aisle no longer exists.', 'warning')
      return true
    }

    const result = materializeStructuralAisleCopiesForInsertion(latestState, {
      scope: payload.scope,
      action: payload.action,
      source: payload.source,
      aisleId: payload.aisleId,
    })
    if (result.status !== 'applied') {
      pushToast(result.message, 'warning')
      return true
    }

    const baseAisles = cloneAisles(destinationBody.aisles, latestState.noteAisleBodies)
    const insertResult = insertNewAislesWithReclaimedSlots(
      baseAisles,
      result.aisles,
      options.destinationAisleId,
      options.placement,
      MAX_NOTE_AISLES,
      (aisle) => isEmptyAisleMarkdown(aisle.markdown),
    )
    if (insertResult.status === 'blocked') {
      pushToast(MAX_AISLE_WARNING_MESSAGE, 'warning')
      return true
    }
    if (insertResult.reclaimedCount > 0 && !options.allowReclaim) {
      closeEditorEphemeraRef.current()
      setModal({
        type: 'confirm-independent-note-paste-reclaim',
        source: payload.source,
        destination: options.destination,
        destinationAisleId: options.destinationAisleId,
        placement: options.placement,
      })
      return true
    }

    const beforeSnapshot = captureActiveAisleStructuralSnapshot(latestState)
    if (!beforeSnapshot || beforeSnapshot.noteBodyId !== destinationInfo.noteBodyId) {
      pushToast('Open the destination note before pasting.', 'warning')
      return true
    }
    applyAisleEditDraftToActiveNote(insertResult.aisles, {
      activeAisleId: result.aisles[0]?.id,
      additionalAisleBodies: result.aisleBodies,
    })
    closeEditorEphemeraRef.current()
    pushToast(getCopyAsPasteSuccessMessage(payload.scope, payload.action), 'success')
    return true
  }

  const pasteCopyAsPayload = (payload: CopyAsClipboardPayload): boolean => {
    if (viewMode !== 'main') {
      pushToast('Open a note before pasting.', 'warning')
      return true
    }

    const latestState = buildStateWithLatestEditorContent()
    const scratchpadStructuralPaste = scratchpadWorkspaceActive
      ? getScratchpadStructuralPastePayload(payload)
      : { payload, convertedFromSynced: false as const }
    const pastePayload = scratchpadStructuralPaste.payload
    const conversionToast = scratchpadStructuralPaste.warningMessage
      ? { message: scratchpadStructuralPaste.warningMessage, tone: 'warning' as const }
      : undefined
    const pasteHereReplacementMode = getCopyAsPasteHereFocusedAisleReplacementMode(pastePayload)
    if (pasteHereReplacementMode) {
      if (replaceFocusedAisleWithStructuralCopy(latestState, pastePayload, undefined, pasteHereReplacementMode, conversionToast)) return true
    }
    if (scratchpadWorkspaceActive && isScratchpadCopyAsSource(pastePayload.source) && pastePayload.scope === 'aisle' && pastePayload.action === 'copy') {
      const result = materializeStructuralAisleCopiesForInsertion(latestState, {
        scope: pastePayload.scope,
        action: pastePayload.action,
        source: pastePayload.source,
        aisleId: pastePayload.aisleId,
      })
      if (result.status !== 'applied') {
        pushToast(result.message, 'warning')
        return true
      }
      if (insertScratchpadAisleCopiesWithCapacity(
        latestState,
        result.aisles,
        getScratchpadActiveAisleId(latestState, resolvedActiveAisleId),
        'right-of-focus',
        result.aisleBodies,
      )) {
        closeEditorEphemeraRef.current()
        pushToast(getCopyAsPasteSuccessMessage(pastePayload.scope, pastePayload.action), 'success')
      }
      return true
    }
    if (scratchpadWorkspaceActive && (pastePayload.action === 'copy' || pastePayload.action === 'duplicate')) {
      if (isScratchpadCopyAsSource(pastePayload.source)) {
        pushToast('Copied aisle no longer exists.', 'warning')
        return true
      }
      const sourceInfo = getLocationInfo(latestState, pastePayload.source)
      const sourceBody = sourceInfo.noteBodyId
        ? latestState.noteBodies.find((candidate) => candidate.id === sourceInfo.noteBodyId) ?? null
        : null
      const sourceAisleCount =
        pastePayload.scope === 'aisle'
          ? pastePayload.aisleId && sourceBody?.aisles.some((aisle) => aisle.id === pastePayload.aisleId)
            ? 1
            : 0
          : sourceBody?.aisles.length ?? 0
      const scratchpadBody = getScratchpadNoteBody(latestState)
      if (!sourceBody || sourceAisleCount <= 0) {
        pushToast(pastePayload.scope === 'aisle' ? 'Copied aisle no longer exists.' : 'Copied note no longer exists.', 'warning')
        return true
      }
      if (!scratchpadBody) {
        pushToast('Open a note before pasting.', 'warning')
        return true
      }
      const result = materializeStructuralAisleCopiesForInsertion(latestState, {
        scope: pastePayload.scope,
        action: 'copy',
        source: pastePayload.source,
        aisleId: pastePayload.aisleId,
      })
      if (result.status !== 'applied') {
        pushToast(result.message, 'warning')
        return true
      }
      if (insertScratchpadAisleCopiesWithCapacity(
        latestState,
        result.aisles,
        getScratchpadActiveAisleId(latestState, resolvedActiveAisleId),
        'right-of-focus',
        result.aisleBodies,
      )) {
        closeEditorEphemeraRef.current()
        pushToast(conversionToast?.message ?? getCopyAsPasteSuccessMessage(pastePayload.scope, pastePayload.action), conversionToast?.tone ?? 'success')
      }
      return true
    }
    const destination = getCurrentNoteLocation()
    if (!scratchpadWorkspaceActive) {
      const destinationAisleId = getDestinationAisleIdForSyncedNotePaste(latestState, destination)
      if (
        pasteIndependentNoteCopyAsAisles(pastePayload, {
          destination,
          destinationAisleId,
          placement: 'right-of-focus',
        })
      ) {
        return true
      }
    }
    if (!isScratchpadCopyAsSource(payload.source) && shouldConfirmSyncedNotePaste(latestState, payload, destination)) {
      closeEditorEphemeraRef.current()
      setModal({
        type: 'confirm-synced-note-paste',
        source: payload.source,
        destination,
        destinationAisleId: getDestinationAisleIdForSyncedNotePaste(latestState, destination),
        sourceAisleId: getSingleAisleIdForSyncedNotePaste(latestState, payload.source),
      })
      return true
    }
    const activeInfo = getLocationInfo(latestState, destination)
    const command = buildCopyAsPasteCommand({
      appState: latestState,
      destination,
      payload,
      activeNoteBodyId: activeInfo.noteBodyId,
      previewMarkdowns: activeInfo.noteBodyId ? getNoteBodyPreviewMarkdowns(latestState, activeInfo.noteBodyId) : [],
      maxAisles: MAX_NOTE_AISLES,
    })

    if (command.status === 'blocked') {
      const message = command.message === 'Maximum aisle count reached.' ? MAX_AISLE_WARNING_MESSAGE : command.message
      pushToast(message, command.tone ?? 'warning')
      return true
    }

    if (command.status === 'structural') {
      stateRef.current = command.state
      setState(command.state)
      closeEditorEphemeraRef.current()
      pushToast(command.toast.message, command.toast.tone ?? 'success')
      return true
    }

    if (!insertEditorTextOperation(editorOperationRuntime, command.text).handled) {
      pushToast('Open a note before pasting.', 'warning')
      return true
    }
    closeEditorEphemeraRef.current()
    pushToast(command.toast.message, command.toast.tone ?? 'success')
    return true
  }

  const copyContextMenuItemAs = (scope: CopyAsScope, action: CopyAsAction) => {
    closeEditorEphemeraRef.current()
    if (scratchpadWorkspaceActive) {
      if (scope !== 'aisle' || action !== 'copy') {
        pushToast('Scratchpad can only copy independent aisles.', 'warning')
        return
      }
      const latestState = buildStateWithLatestEditorContent()
      const aisleId = getScratchpadActiveAisleId(latestState, resolvedActiveAisleId)
      const data = buildScratchpadAisleCopyAsClipboardData(latestState, aisleId)
      if (!data.ok) {
        pushToast(data.message, 'warning')
        return
      }
      void writeCopyAsClipboardData(data).then((result) => {
        if (!result.ok) {
          pushToast('Clipboard copy is unavailable here.', 'warning')
          return
        }
        pushToast(getCopyAsSuccessMessage(scope, action), 'success')
      })
      return
    }

    const source = contextMenuNoteLocation
    if (!source) {
      pushToast('Note not found.', 'warning')
      return
    }
    const latestState = buildStateWithLatestEditorContent()
    const aisleId = scope === 'aisle' ? getCopyAsSourceAisleId(latestState, source) : undefined
    const data = buildCopyAsClipboardData(latestState, source, scope, action, aisleId)
    if (!data.ok) {
      pushToast(data.message, 'warning')
      return
    }
    void writeCopyAsClipboardData(data).then((result) => {
      if (!result.ok) {
        pushToast('Clipboard copy is unavailable here.', 'warning')
        return
      }
      pushToast(getCopyAsSuccessMessage(scope, action), 'success')
    })
  }

  const getEditorPasteAislePlacement = (
    destination: Exclude<EditorPasteDestination, 'here'>,
  ): NewAislePlacement => destination === 'new-aisle-left' ? 'left-of-focus' : 'right-of-focus'

  const addMarkdownAisleFromClipboardPaste = (
    markdown: string,
    destination: Exclude<EditorPasteDestination, 'here'>,
    beforeSnapshot: AisleStructuralSnapshot,
  ): boolean => {
    const placement = getEditorPasteAislePlacement(destination)
    return scratchpadWorkspaceActive
      ? addScratchpadAisle(markdown, { beforeSnapshot, placement })
      : addAisleToActiveNote(markdown, { beforeSnapshot, placement })
  }

  const insertAislesFromClipboardPaste = (
    newAisles: ResolvedNoteAisle[],
    destination: Exclude<EditorPasteDestination, 'here'>,
    beforeSnapshot: AisleStructuralSnapshot,
    additionalAisleBodies: NoteAisleBody[] = [],
  ): boolean => {
    if (newAisles.length <= 0) return false
    const latestState = buildStateWithLatestEditorContent()
    const body = latestState.noteBodies.find((candidate) => candidate.id === beforeSnapshot.noteBodyId)
    if (!body) {
      pushToast('Open a note before pasting.', 'warning')
      return false
    }
    if (scratchpadWorkspaceActive) {
      return insertScratchpadAisleCopiesWithCapacity(
        latestState,
        newAisles,
        beforeSnapshot.activeAisleId,
        getEditorPasteAislePlacement(destination),
        additionalAisleBodies,
      )
    }
    const baseAisles = cloneAisles(body.aisles, latestState.noteAisleBodies)
    const nextAisleCount = baseAisles.length + newAisles.length
    if (nextAisleCount > MAX_NOTE_AISLES) {
      pushToast(MAX_AISLE_WARNING_MESSAGE, 'warning')
      return false
    }
    const nextAisles = insertNewAisles(
      baseAisles,
      newAisles,
      beforeSnapshot.activeAisleId,
      getEditorPasteAislePlacement(destination),
    )
    applyAisleEditDraftToActiveNote(nextAisles, {
      activeAisleId: newAisles[0]?.id,
      additionalAisleBodies,
    })
    return true
  }

  const pasteCopyAsPayloadIntoNewAisle = (
    payload: CopyAsClipboardPayload,
    destination: Exclude<EditorPasteDestination, 'here'>,
    beforeSnapshot: AisleStructuralSnapshot,
  ): boolean => {
    const latestState = buildStateWithLatestEditorContent()
    const scratchpadStructuralPaste = scratchpadWorkspaceActive
      ? getScratchpadStructuralPastePayload(payload)
      : { payload, convertedFromSynced: false as const }
    const pastePayload = scratchpadStructuralPaste.payload
    const conversionToast = scratchpadStructuralPaste.warningMessage
      ? { message: scratchpadStructuralPaste.warningMessage, tone: 'warning' as const }
      : undefined

    if (!scratchpadWorkspaceActive && pastePayload.scope === 'note' && pastePayload.action === 'copy') {
      const currentDestination = getCurrentNoteLocation()
      if (
        pasteIndependentNoteCopyAsAisles(pastePayload, {
          destination: currentDestination,
          destinationAisleId: beforeSnapshot.activeAisleId,
          placement: getEditorPasteAislePlacement(destination),
        })
      ) {
        return true
      }
    }

    if (pastePayload.action === 'copy' || pastePayload.action === 'duplicate') {
      const replacementMode = scratchpadWorkspaceActive
        ? null
        : getCopyAsNewAislePasteFocusedAisleReplacementMode(pastePayload)
      if (replacementMode && replaceFocusedAisleWithStructuralCopy(latestState, pastePayload, beforeSnapshot, replacementMode, conversionToast)) {
        return true
      }
      const structuralAction: 'copy' | 'duplicate' = pastePayload.action
      const result = materializeStructuralAisleCopiesForInsertion(latestState, {
        scope: pastePayload.scope,
        action: structuralAction,
        source: pastePayload.source,
        aisleId: pastePayload.aisleId,
      })
      if (result.status !== 'applied') {
        pushToast(result.message, 'warning')
        return true
      }
      if (insertAislesFromClipboardPaste(result.aisles, destination, beforeSnapshot, result.aisleBodies)) {
        pushToast(conversionToast?.message ?? getCopyAsPasteSuccessMessage(pastePayload.scope, pastePayload.action), conversionToast?.tone ?? 'success')
      }
      return true
    }

    const currentDestination = getCurrentNoteLocation()
    const activeInfo = getLocationInfo(latestState, currentDestination)
    const command = buildCopyAsPasteCommand({
      appState: latestState,
      destination: currentDestination,
      payload,
      activeNoteBodyId: activeInfo.noteBodyId,
      previewMarkdowns: activeInfo.noteBodyId ? getNoteBodyPreviewMarkdowns(latestState, activeInfo.noteBodyId) : [],
      maxAisles: scratchpadWorkspaceActive ? getScratchpadAisleLimit() : MAX_NOTE_AISLES,
    })

    if (command.status === 'blocked') {
      const message = command.message === 'Maximum aisle count reached.' ? MAX_AISLE_WARNING_MESSAGE : command.message
      pushToast(message, command.tone ?? 'warning')
      return true
    }

    if (command.status === 'structural') {
      pushToast('Clipboard paste is unavailable here.', 'warning')
      return true
    }

    if (addMarkdownAisleFromClipboardPaste(command.text, destination, beforeSnapshot)) {
      pushToast(command.toast.message, command.toast.tone ?? 'success')
    }
    return true
  }

  const pasteClipboardIntoNewAisle = async (
    action: Extract<EditorClipboardAction, 'paste' | 'pastePlainText'>,
    destination: Exclude<EditorPasteDestination, 'here'>,
    beforeSnapshot: AisleStructuralSnapshot,
  ) => {
    const payload = await readCopyAsPayloadFromClipboard().catch(() => null)
    if (payload) {
      pasteCopyAsPayloadIntoNewAisle(payload, destination, beforeSnapshot)
      return
    }

    const result = await readClipboardMarkdown({
      mode: action === 'paste' ? 'rich' : 'plainText',
      importImageBlobAsAssetUrl,
      importBlobAsAssetUrl,
    })
    if (!result.ok) {
      if (result.reason === 'unavailable') {
        pushToast('Clipboard paste is unavailable here.', 'warning')
      }
      return
    }
    if (result.text && isCopyAsClipboardTextMarker(result.text)) {
      pushToast('Clipboard copy command is invalid.', 'warning')
      return
    }
    addMarkdownAisleFromClipboardPaste(result.markdown, destination, beforeSnapshot)
  }

  const runEditorContextClipboardAction = (
    action: EditorClipboardAction,
    destination: EditorPasteDestination = 'here',
  ) => {
    closeEditorEphemeraRef.current()
    const currentEditor = editorRef.current
    if (!currentEditor) {
      pushToast('Open a note before using the editor menu.', 'warning')
      return
    }
    currentEditor.focus()

    if (action === 'cut' || action === 'copy') {
      document.execCommand(action)
      return
    }

    const pasteText = (text: string) => {
      if (!text) return
      const copyAsPayload = parseCopyAsTextMarker(text)
      if (copyAsPayload) {
        pasteCopyAsPayload(copyAsPayload)
        return
      }
      if (isCopyAsClipboardTextMarker(text)) {
        pushToast('Clipboard copy command is invalid.', 'warning')
        return
      }
      const view = getWysiwygView(currentEditor)
      if (insertVisualClipboardTextIntoView(view, text)) {
        commitActiveEditorMarkdownNow(currentEditor)
        syncToolbarFormatState()
        return
      }
      insertEditorTextOperation(editorOperationRuntime, text)
    }

    const pasteMarkdownHere = async (mode: 'rich' | 'plainText') => {
      const payload = await readCopyAsPayloadFromClipboard().catch(() => null)
      if (payload) {
        pasteCopyAsPayload(payload)
        return
      }

      const result = await readClipboardMarkdown({
        mode,
        importImageBlobAsAssetUrl,
        importBlobAsAssetUrl,
      })
      if (!result.ok) {
        if (result.reason === 'unavailable') {
          pushToast('Clipboard paste is unavailable here.', 'warning')
        }
        return
      }
      if (result.text && isCopyAsClipboardTextMarker(result.text)) {
        pushToast('Clipboard copy command is invalid.', 'warning')
        return
      }
      if (result.source === 'plain-text') {
        pasteText(result.markdown)
        return
      }
      const view = getWysiwygView(currentEditor)
      if (insertVisualClipboardMarkdownIntoView(view, result.markdown)) {
        commitActiveEditorMarkdownNow(currentEditor)
        syncToolbarFormatState()
        return
      }
      pasteText(result.markdown)
    }

    if (destination !== 'here') {
      const beforeSnapshot = captureActiveAisleStructuralSnapshot()
      if (!beforeSnapshot) {
        pushToast('Open a note before using the editor menu.', 'warning')
        return
      }
      void pasteClipboardIntoNewAisle(action, destination, beforeSnapshot)
        .catch(() => pushToast('Clipboard paste is unavailable here.', 'warning'))
      return
    }

    if (action === 'paste') {
      void pasteMarkdownHere('rich').catch(() => pushToast('Clipboard paste is unavailable here.', 'warning'))
      return
    }

    void pasteMarkdownHere('plainText').catch(() => pushToast('Clipboard paste is unavailable here.', 'warning'))
  }

  const openEditorContextLinkModal = (mode: LinkInsertMode | null) => {
    const selectedText = getActiveEditorSelectedText()
    if (mode === 'note') {
      openSharedLinkModal(selectedText, 'note')
      return
    }
    openUrlLinkModalFromSelection(selectedText, 'context-menu')
  }

  const insertAttachmentFromEditorContext = () => {
    closeEditorEphemeraRef.current()
    const currentEditor = editorRef.current
    if (!currentEditor) {
      pushToast('Open a note before inserting an attachment.', 'warning')
      return
    }

    const input = document.createElement('input')
    input.type = 'file'
    input.accept = [
      'image/*',
      'application/pdf',
      'audio/*',
      'video/*',
      '.pdf',
      '.mp3',
      '.wav',
      '.m4a',
      '.ogg',
      '.webm',
      '.mp4',
      '.mov',
    ].join(',')
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const insertImageAttachment = async () => {
        const assetUrl = await importImageBlobAsAssetUrl(file, file.name)
        if (!assetUrl) {
          pushToast('Could not import attachment.', 'warning')
          return
        }
        const view = getWysiwygView(currentEditor)
        const displayUrl = await withDefaultInsertedImageDisplayWidth(
          assetUrl,
          file,
          view?.dom instanceof HTMLElement ? view.dom : null,
        )
        currentEditor.focus()
        runEditorCommandOperation(editorOperationRuntime, 'addImage', { imageUrl: displayUrl, altText: file.name })
      }

      const insertLinkedAttachment = async () => {
        const assetUrl = await importBlobAsAssetUrl(file, file.name)
        if (!assetUrl) {
          pushToast('Could not import attachment.', 'warning')
          return
        }
        currentEditor.focus()
        if (insertAssetLinksIntoWysiwygView(getWysiwygView(currentEditor), [
          { label: file.name.trim() || 'attachment', url: assetUrl },
        ])) {
          commitActiveEditorMarkdownNow(currentEditor)
          return
        }
        insertEditorTextOperation(editorOperationRuntime, buildMediaMarkdownLink(file.name.trim() || 'attachment', assetUrl))
      }

      void (file.type.startsWith('image/') ? insertImageAttachment() : insertLinkedAttachment())
    }
    input.click()
  }

  const revealMediaFileFromContext = () => {
    if (!contextMenu || contextMenu.type !== 'media') return
    const source = contextMenu.source
    setContextMenu(null)
    closeEditorEphemeraRef.current()
    void revealAssetUrl(source).then((result) => {
      if (result.ok) return
      pushToast(result.error || 'Could not reveal file.', 'warning')
    })
  }

  const getActiveEditorNoteRevealPayload = (): ElectronNoteRevealPayload | null => {
    if (scratchpadWorkspaceActive) return { type: 'scratchpad' }
    if (!activeNoteLocation) return null
    return { type: 'live-note', location: activeNoteLocation }
  }

  const replaceEditorMisspellingFromContext = (word: string) => {
    closeEditorEphemeraRef.current()
    if (!word || typeof window.electronAPI?.replaceMisspelling !== 'function') return
    void window.electronAPI.replaceMisspelling({ word })
  }

  const addEditorWordToDictionaryFromContext = (word: string) => {
    closeEditorEphemeraRef.current()
    if (!word || typeof window.electronAPI?.addWordToSpellCheckerDictionary !== 'function') return
    void window.electronAPI.addWordToSpellCheckerDictionary({ word })
  }

  const lookUpEditorSelectionFromContext = () => {
    closeEditorEphemeraRef.current()
    if (typeof window.electronAPI?.showDefinitionForSelection !== 'function') return
    void window.electronAPI.showDefinitionForSelection()
  }

  const revealNoteLocationFromEditorContext = () => {
    if (!contextMenu || contextMenu.type !== 'editor') return
    const revealNoteLocation = window.electronAPI?.revealNoteLocation
    const payload = getActiveEditorNoteRevealPayload()
    closeEditorEphemeraRef.current()
    if (typeof revealNoteLocation !== 'function' || !payload) {
      pushToast('Could not reveal note file.', 'warning')
      return
    }
    void Promise.resolve(flushStorageActionStateRef.current())
      .then(() => revealNoteLocation(payload))
      .then((result) => {
        if (result.ok) return
        pushToast('Could not reveal note file.', 'warning')
      })
      .catch(() => pushToast('Could not reveal note file.', 'warning'))
  }

  const openEditorContextLink = () => {
    if (!contextMenu || contextMenu.type !== 'editor' || !contextMenu.link) return
    const link = contextMenu.link
    closeEditorEphemeraRef.current()
    if (link.type === 'internal') {
      navigateToNoteLocation({
        ...link.target,
        heading: link.heading,
        aisleId: link.heading ? undefined : link.aisleIds?.[0],
        startAt: link.startAt,
      })
      return
    }
    openExternalWebUrl(link.href)
  }

  const editEditorContextLink = () => {
    if (!contextMenu || contextMenu.type !== 'editor' || !contextMenu.link) return
    const link = contextMenu.link
    closeEditorEphemeraRef.current()
    if (link.type === 'internal') {
      openInternalNoteLinkEditModal({
        label: link.label,
        href: link.href,
        target: link.target,
        aisleIds: link.aisleIds,
        heading: link.heading,
        startAt: link.startAt,
        from: link.from,
        to: link.to,
        occurrence: link.occurrence,
        range: link.range,
        previewEdit: link.previewEdit,
      })
      return
    }
    openExternalLinkEditModal(link.href, link.label, link.range)
  }

  const selectActiveEditorFindMatch = (match = findReplaceMatches[findReplacePanel.activeIndex]) => {
    if (!match || match.aisleId !== activeAisleIdRef.current) return
    const currentEditor = editorRef.current
    const view = getWysiwygView(currentEditor)
    if (!currentEditor || !view) return
    const docText = collectProseMirrorTextPositions(view.state.doc)
    const sourcePositions = docText.positions.slice(match.visibleFrom, match.visibleTo).filter((position) => position >= 0)
    if (sourcePositions.length === 0) return
    try {
      view.dispatch(
        view.state.tr
          .setSelection(TextSelection.create(view.state.doc, sourcePositions[0], sourcePositions[sourcePositions.length - 1] + 1))
          .scrollIntoView(),
      )
      currentEditor.focus()
    } catch {
      currentEditor.focus()
    }
  }

  const clearActiveTagJumpGlow = useCallback(() => {
    if (tagJumpClearTimerRef.current !== null) {
      window.clearTimeout(tagJumpClearTimerRef.current)
      tagJumpClearTimerRef.current = null
    }
    const view = getWysiwygView(editorRef.current)
    if (!view) return
    try {
      view.dispatch(view.state.tr.setMeta(TAG_JUMP_HIGHLIGHT_META, null))
    } catch {
      // The editor may have remounted between a jump and its scheduled clear.
    }
  }, [])

  const glowActiveEditorTagOccurrence = useCallback((occurrence: TagFilterOccurrence) => {
    if (occurrence.aisleId !== activeAisleIdRef.current) return false
    const view = getWysiwygView(editorRef.current)
    if (!view) return false
    const renderedTagRanges = getTagDecorationRanges(view.state.doc).filter(
      (range) => normalizeTagKey(range.tag) === occurrence.key,
    )
    const range = renderedTagRanges[occurrence.tagOrdinalInAisle] ?? null
    if (!range || range.to <= range.from) return false
    try {
      if (tagJumpClearTimerRef.current !== null) {
        window.clearTimeout(tagJumpClearTimerRef.current)
        tagJumpClearTimerRef.current = null
      }
      const requestId = tagJumpRequestIdRef.current + 1
      tagJumpRequestIdRef.current = requestId
      view.dispatch(
        view.state.tr.setMeta(TAG_JUMP_HIGHLIGHT_META, {
          from: range.from,
          to: range.to,
          requestId,
        }),
      )
      scrollProseMirrorTagRangeIntoView(view, range.from)
      tagJumpClearTimerRef.current = window.setTimeout(() => {
        tagJumpClearTimerRef.current = null
        const latestView = getWysiwygView(editorRef.current)
        if (!latestView) return
        try {
          latestView.dispatch(latestView.state.tr.setMeta(TAG_JUMP_HIGHLIGHT_META, null))
        } catch {
          // The editor may have remounted between a jump and its scheduled clear.
        }
      }, TAG_JUMP_GLOW_DURATION_MS)
      return true
    } catch {
      return false
    }
  }, [])

  const getCurrentTagFilterLocationKey = useCallback(
    () => (scratchpadWorkspaceActive ? buildNoteLocationKey(SCRATCHPAD_FIND_LOCATION) : activeNoteLocationKey),
    [activeNoteLocationKey, scratchpadWorkspaceActive],
  )

  const trySelectPendingTagOccurrence = useCallback(() => {
    const pending = pendingTagOccurrenceRef.current
    if (!pending || viewMode !== 'main') return false
    if (buildNoteLocationKey(pending.location) !== getCurrentTagFilterLocationKey()) return false
    if (pending.aisleId !== activeAisleIdRef.current) {
      if (!activeAisleIdsRef.current.includes(pending.aisleId)) return false
      activeAisleIdRef.current = pending.aisleId
      setActiveAisleId(pending.aisleId)
      scheduleAisleFocusScroll(pending.aisleId)
      if (scratchpadWorkspaceActive) {
        setState((previous) => setScratchpadActiveAisleId(previous, pending.aisleId))
      }
      return false
    }
    if (!glowActiveEditorTagOccurrence(pending)) return false
    pendingTagOccurrenceRef.current = null
    return true
  }, [
    getCurrentTagFilterLocationKey,
    glowActiveEditorTagOccurrence,
    scheduleAisleFocusScroll,
    scratchpadWorkspaceActive,
    setState,
    viewMode,
  ])

  const schedulePendingTagOccurrenceSelection = useCallback(() => {
    window.setTimeout(() => {
      if (trySelectPendingTagOccurrence()) return
      window.requestAnimationFrame(() => {
        if (trySelectPendingTagOccurrence()) return
        window.setTimeout(() => trySelectPendingTagOccurrence(), 50)
      })
    }, 0)
  }, [trySelectPendingTagOccurrence])

  useEffect(() => {
    if (!pendingTagOccurrenceRef.current) return
    schedulePendingTagOccurrenceSelection()
  }, [activeAisleId, schedulePendingTagOccurrenceSelection])

  const openTagOccurrence = (occurrence: TagFilterOccurrence) => {
    clearActiveTagJumpGlow()
    pendingTagOccurrenceRef.current = occurrence
    closeEditorEphemeraRef.current()
    setMenuOpen(false)
    setEditing(null)

    if (buildNoteLocationKey(occurrence.location) === buildNoteLocationKey(SCRATCHPAD_FIND_LOCATION)) {
      saveActiveCursorBeforeNavigation()
      if (arrangeMode.active) exitArrangeMode()
      setViewMode('main')
      setScratchpadActive(true)
      setActiveAisleId(occurrence.aisleId)
      activeAisleIdRef.current = occurrence.aisleId
      if (scratchpadWorkspaceActive) {
        scheduleAisleFocusScroll(occurrence.aisleId)
      } else {
        pendingScrollToAisleIdRef.current = occurrence.aisleId
      }
      setState((previous) => setScratchpadActiveAisleId(previous, occurrence.aisleId))
      schedulePendingTagOccurrenceSelection()
      return
    }

    if (
      scratchpadWorkspaceActive ||
      buildNoteLocationKey(occurrence.location) !== activeNoteLocationKey
    ) {
      navigateToNoteLocation(occurrence.location)
      schedulePendingTagOccurrenceSelection()
      return
    }

    if (occurrence.aisleId !== activeAisleIdRef.current) {
      setActiveAisleId(occurrence.aisleId)
      activeAisleIdRef.current = occurrence.aisleId
      scheduleAisleFocusScroll(occurrence.aisleId)
      schedulePendingTagOccurrenceSelection()
      return
    }

    schedulePendingTagOccurrenceSelection()
  }

  const openNoteFilterOccurrence = (occurrence: NoteFilterOccurrence) => {
    if (occurrence.tagOccurrence) {
      openTagOccurrence(occurrence.tagOccurrence)
      return
    }

    clearActiveTagJumpGlow()
    pendingTagOccurrenceRef.current = null
    closeEditorEphemeraRef.current()
    setMenuOpen(false)
    setEditing(null)

    if (buildNoteLocationKey(occurrence.location) === buildNoteLocationKey(SCRATCHPAD_FIND_LOCATION)) {
      saveActiveCursorBeforeNavigation()
      if (arrangeMode.active) exitArrangeMode()
      setViewMode('main')
      setScratchpadActive(true)
      setActiveAisleId(occurrence.aisleId)
      activeAisleIdRef.current = occurrence.aisleId
      if (scratchpadWorkspaceActive) {
        scheduleAisleFocusScroll(occurrence.aisleId)
      } else {
        pendingScrollToAisleIdRef.current = occurrence.aisleId
      }
      setState((previous) => setScratchpadActiveAisleId(previous, occurrence.aisleId))
      return
    }

    if (
      scratchpadWorkspaceActive ||
      buildNoteLocationKey(occurrence.location) !== activeNoteLocationKey
    ) {
      navigateToNoteLocation({ ...occurrence.location, aisleId: occurrence.aisleId })
      return
    }

    if (occurrence.aisleId !== activeAisleIdRef.current) {
      setActiveAisleId(occurrence.aisleId)
      activeAisleIdRef.current = occurrence.aisleId
      scheduleAisleFocusScroll(occurrence.aisleId)
    }
  }

  const openTagLocation = (location: NoteLocation) => {
    const locationKey = buildNoteLocationKey(location)
    const primaryOccurrences = getPrimaryNoteFilterOccurrencesForLocation(noteFilterIndex, location)
    const matchingOccurrences = primaryOccurrences.length > 0
      ? primaryOccurrences
      : getNoteFilterOccurrencesForLocation(noteFilterIndex, location)
    if (matchingOccurrences.length > 0) {
      const currentLocationKey = getCurrentTagFilterLocationKey()
      const storedIndex = noteFilterCycleByLocation[locationKey] ?? 0
      const occurrenceIndex = currentLocationKey === locationKey
        ? storedIndex % matchingOccurrences.length
        : 0
      const occurrence = matchingOccurrences[occurrenceIndex]
      const nextIndex = (occurrenceIndex + 1) % matchingOccurrences.length
      setNoteFilterCycleByLocation((current) => ({ ...current, [locationKey]: nextIndex }))
      openNoteFilterOccurrence(occurrence)
      return
    }

    if (locationKey === buildNoteLocationKey(SCRATCHPAD_FIND_LOCATION)) {
      openScratchpadFromRail()
      return
    }

    if (scratchpadWorkspaceActive || activeNoteLocationKey !== locationKey) {
      navigateToNoteLocation(location)
    }
  }

  const activateNoteFilter = (kind: NoteFilterKind, selectedKeys: string[] = []) => {
    pendingTagOccurrenceRef.current = null
    setNoteFilterMenuOpen(false)
    setNoteFilterCycleByLocation({})
    setNoteFilterCycleByOption({})
    updateNoteFilter((current) => ({
      ...current,
      active: true,
      kind,
      [kind]: {
        ...current[kind],
        selectedKeys,
      },
    }))
  }

  const openTagFilterForTag = (tag: string) => {
    const key = normalizeTagKey(tag)
    if (!key) return
    const latestState = buildStateWithLatestEditorContent()
    stateRef.current = latestState
    setState(latestState)
    if (arrangeMode.active) exitArrangeMode()
    closeEditorEphemeraRef.current()
    setViewMode('main')
    setMenuOpen(false)
    setEditing(null)
    activateNoteFilter('tags', [key])
  }

  const closeTagFilterMenu = () => {
    setNoteFilterMenuOpen(false)
  }

  const toggleTagFilterMenu = () => {
    setNoteFilterMenuOpen((open) => !open)
  }

  const openNoteFilterFromMenu = () => {
    closeEditorEphemeraRef.current()
    if (arrangeMode.active) exitArrangeMode()
    setViewMode('main')
    setMenuOpen(false)
    setEditing(null)
    setNoteFilterCycleByLocation({})
    setNoteFilterCycleByOption({})
    setNoteFilterMenuOpen(true)
    updateNoteFilter((current) => ({ ...current, active: true }))
  }

  const getCurrentNotesFilterModeState = () => ({
    viewMode: toggleViewModeRef.current,
    filterActive: tagFilterActive,
    filterMenuOpen: noteFilterMenuOpen,
  })

  const exitNotesFilterFromToggleShortcut = () => {
    if (!isNotesFilterModeActive(getCurrentNotesFilterModeState())) return false
    exitTagFilterMode()
    return true
  }

  const returnToNotesFromToggleShortcut = () => {
    const currentViewMode = toggleViewModeRef.current
    toggleViewModeRef.current = 'main'
    toggleScratchpadActiveRef.current = false
    setScratchpadActive(false)

    if (currentViewMode === 'trash') {
      toggleTrashView()
      return
    }

    closeEditorEphemeraRef.current()
    setViewMode('main')
    setMenuOpen(false)
    setEditing(null)
  }

  const toggleNotesTrashFromShortcut = () => {
    if (exitNotesFilterFromToggleShortcut()) return

    const currentToggleState = {
      viewMode: toggleViewModeRef.current,
      scratchpadActive: toggleScratchpadActiveRef.current,
    }
    const nextToggleState = getNextNotesTrashToggleState(currentToggleState)

    if (
      nextToggleState.viewMode === currentToggleState.viewMode &&
      nextToggleState.scratchpadActive === currentToggleState.scratchpadActive
    ) {
      return
    }

    if (nextToggleState.viewMode === 'trash') {
      toggleViewModeRef.current = nextToggleState.viewMode
      toggleScratchpadActiveRef.current = nextToggleState.scratchpadActive
      setScratchpadActive(false)
      toggleTrashView()
      return
    }

    returnToNotesFromToggleShortcut()
  }

  const toggleNotesScratchpadFromShortcut = () => {
    if (exitNotesFilterFromToggleShortcut()) return

    const currentToggleState = {
      viewMode: toggleViewModeRef.current,
      scratchpadActive: toggleViewModeRef.current === 'main' && toggleScratchpadActiveRef.current,
    }
    const nextToggleState = getNextNotesScratchpadToggleState(currentToggleState)

    if (nextToggleState.scratchpadActive) {
      if (openScratchpadFromRail()) {
        toggleViewModeRef.current = nextToggleState.viewMode
        toggleScratchpadActiveRef.current = nextToggleState.scratchpadActive
      }
      return
    }

    returnToNotesFromToggleShortcut()
  }

  const toggleNotesFilterFromShortcut = () => {
    if (getNotesFilterToggleIntent(getCurrentNotesFilterModeState()) === 'exit-filter') {
      exitTagFilterMode()
      return
    }

    openNoteFilterFromMenu()
  }

  const setNoteFilterKind = (kind: NoteFilterKind) => {
    setNoteFilterCycleByLocation({})
    setNoteFilterCycleByOption({})
    updateNoteFilter((current) => ({ ...current, active: true, kind }))
  }

  const clearCurrentNoteFilter = () => {
    pendingTagOccurrenceRef.current = null
    setNoteFilterCycleByLocation({})
    setNoteFilterCycleByOption({})
    updateNoteFilter((current) => ({
      ...current,
      active: true,
      [current.kind]: {
        ...current[current.kind],
        selectedKeys: [],
      },
    }))
  }

  const toggleNoteFilterOption = (key: string) => {
    setNoteFilterCycleByLocation({})
    if (noteFilterKind === 'media') {
      const matchingOccurrences = noteFilterIndex.allOccurrences.filter((occurrence) => occurrence.key === key)
      const selected = noteFilter.media.selectedKeys[0] === key
      const occurrenceIndex = selected && matchingOccurrences.length > 0
        ? (noteFilterCycleByOption[key] ?? 0) % matchingOccurrences.length
        : 0
      const occurrence = matchingOccurrences[occurrenceIndex]
      const nextIndex = matchingOccurrences.length > 0 ? (occurrenceIndex + 1) % matchingOccurrences.length : 0
      setNoteFilterCycleByOption(matchingOccurrences.length > 0 ? { [key]: nextIndex } : {})
      updateNoteFilter((current) => ({
        ...current,
        active: true,
        kind: 'media',
        media: {
          ...current.media,
          selectedKeys: [key],
        },
      }))
      if (occurrence) openNoteFilterOccurrence(occurrence)
      return
    }
    setNoteFilterCycleByOption({})
    updateNoteFilter((current) => {
      const currentKind = current.kind
      const selectedKeys = current[currentKind].selectedKeys
      const nextKeys = selectedKeys.includes(key)
        ? selectedKeys.filter((candidate) => candidate !== key)
        : [...selectedKeys, key]
      return {
        ...current,
        active: true,
        [currentKind]: {
          ...current[currentKind],
          selectedKeys: nextKeys,
        },
      }
    })
  }

  const setTagFilterSortMode = (sortMode: NoteFilterSettings['tags']['sortMode']) => {
    updateNoteFilter((current) => ({
      ...current,
      tags: {
        ...current.tags,
        sortMode,
      },
    }))
  }

  const getNoteTagFilterCount = (location: NoteLocation) =>
    noteFilterIndex.noteCounts.get(buildNoteLocationKey(location)) ?? 0

  const openDomainFromTagFilter = (domainId: string) => {
    if (!scratchpadWorkspaceActive && activeNoteLocation.domainId === domainId && getNoteTagFilterCount(activeNoteLocation) > 0) {
      openTagLocation(activeNoteLocation)
      return
    }
    const firstMatch = getFirstMatchingNoteFilterLocationForDomain(noteFilterIndex, domainId)
    if (firstMatch) openTagLocation(firstMatch)
  }

  const openSpaceFromTagFilter = (spaceId: string) => {
    const domainId = state.activeDomainId
    if (
      !scratchpadWorkspaceActive &&
      activeNoteLocation.domainId === domainId &&
      activeNoteLocation.spaceId === spaceId &&
      getNoteTagFilterCount(activeNoteLocation) > 0
    ) {
      openTagLocation(activeNoteLocation)
      return
    }
    const firstMatch = getFirstMatchingNoteFilterLocationForSpace(noteFilterIndex, domainId, spaceId)
    if (firstMatch) openTagLocation(firstMatch)
  }

  const openParentFromTagFilter = (tabId: string) => {
    const homeLocation: NoteLocation = {
      domainId: state.activeDomainId,
      spaceId: activeSpace.id,
      tabId,
      subTabId: null,
    }
    if (getNoteTagFilterCount(homeLocation) > 0) {
      openTagLocation(homeLocation)
      return
    }
    const firstMatch = getFirstMatchingNoteFilterLocationForParent(noteFilterIndex, state.activeDomainId, activeSpace.id, tabId)
    if (firstMatch) openTagLocation(firstMatch)
  }

  const selectParentHomeFromTagFilter = () => {
    openTagLocation({
      domainId: state.activeDomainId,
      spaceId: activeSpace.id,
      tabId: activeTab.id,
      subTabId: null,
    })
  }

  const selectSubTabFromTagFilter = (subTabId: string) => {
    openTagLocation({
      domainId: state.activeDomainId,
      spaceId: activeSpace.id,
      tabId: activeTab.id,
      subTabId,
    })
  }

  const openScratchpadFromTagFilter = () => {
    openTagLocation(SCRATCHPAD_FIND_LOCATION)
  }

  useEffect(() => {
    if (!tagFilterActive) return

    const reconciliation = reconcileActiveNoteFilterSettings(noteFilter, noteFilterIndex)
    if (reconciliation.changed) {
      pendingTagOccurrenceRef.current = null
      setNoteFilterCycleByLocation({})
      setNoteFilterCycleByOption({})
      if (!reconciliation.filter.active) setNoteFilterMenuOpen(false)
      updateNoteFilter(() => reconciliation.filter)
      return
    }

    const currentLocation = scratchpadWorkspaceActive ? SCRATCHPAD_FIND_LOCATION : activeNoteLocation
    const navigationTarget = getNoteFilterNavigationTarget(noteFilterIndex, currentLocation)
    if (navigationTarget) openTagLocation(navigationTarget)
  }, [
    activeNoteLocation,
    noteFilter,
    noteFilterIndex,
    scratchpadWorkspaceActive,
    tagFilterActive,
  ])

  const openFindReplacePanel = useCallback(() => {
    closeEditorEphemeraRef.current()
    flushPendingContent()
    const selectedText = getActiveEditorSelectedText()
    const lastFindQuery = loadDeviceSettings().lastFindQuery
    const replaceMode = state.ui.findReplaceMode === 'replace'
    const scope = state.ui.findReplaceScope ?? 'note'
    if (!lastFindQuery && selectedText.trim()) savePartialDeviceSettings({ lastFindQuery: selectedText })
    setFindReplacePanel((current) => ({
      ...current,
      open: true,
      replaceMode,
      scope,
      focusRequestId: current.focusRequestId + 1,
      query: lastFindQuery || current.query || selectedText,
      activeIndex: 0,
    }))
  }, [flushPendingContent, getActiveEditorSelectedText, state.ui.findReplaceMode, state.ui.findReplaceScope])

  const setFindReplaceActiveIndex = (index: number) => {
    const safeIndex = Math.max(0, Math.min(Math.max(0, findReplaceMatches.length - 1), index))
    setFindReplacePanel((current) => ({ ...current, activeIndex: safeIndex }))
    const match = findReplaceMatches[safeIndex]
    if (!match) return
    if (isScratchpadFindLocation(match.location)) {
      if (!scratchpadWorkspaceActive) {
        setViewMode('main')
        setScratchpadActive(true)
      }
      if (match.aisleId !== activeAisleIdRef.current) {
        setActiveAisleId(match.aisleId)
        activeAisleIdRef.current = match.aisleId
        pendingScrollToAisleIdRef.current = match.aisleId
        pendingFocusToAisleIdRef.current = match.aisleId
      }
      window.setTimeout(() => selectActiveEditorFindMatch(match), 0)
      return
    }
    if (
      scratchpadWorkspaceActive ||
      match.location.domainId !== activeNoteLocation.domainId ||
      match.location.spaceId !== activeNoteLocation.spaceId ||
      match.location.tabId !== activeNoteLocation.tabId ||
      match.location.subTabId !== activeNoteLocation.subTabId
    ) {
      navigateToNoteLocation(match.location)
      return
    }
    if (match.aisleId !== activeAisleIdRef.current) {
      setActiveAisleId(match.aisleId)
      activeAisleIdRef.current = match.aisleId
      pendingScrollToAisleIdRef.current = match.aisleId
      pendingFocusToAisleIdRef.current = match.aisleId
      window.setTimeout(() => selectActiveEditorFindMatch(match), 0)
      return
    }
    selectActiveEditorFindMatch(match)
  }

  const moveFindReplaceMatch = (delta: number) => {
    if (findReplaceMatches.length === 0) return
    const nextIndex = (findReplacePanel.activeIndex + delta + findReplaceMatches.length) % findReplaceMatches.length
    setFindReplaceActiveIndex(nextIndex)
  }

  const syncActiveEditorAfterFindReplace = (nextState: AppState, changedAisleBodyIds: Set<string>) => {
    changedAisleBodyIds.forEach((aisleBodyId) => {
      pendingContentRef.current.delete(aisleBodyId)
      const updatedBody = nextState.noteAisleBodies?.find((candidate) => candidate.id === aisleBodyId)
      lastEditorMarkdownByAisleRef.current.set(aisleBodyId, updatedBody?.markdown ?? '')
    })
    const currentEditor = editorRef.current
    const activeInfo = scratchpadWorkspaceActive ? null : getLocationInfo(nextState, activeNoteLocation)
    const activeBody = scratchpadWorkspaceActive
      ? getScratchpadNoteBody(nextState)
      : nextState.noteBodies.find((body) => body.id === activeInfo?.noteBodyId)
    const activeAisle = activeBody?.aisles.find((aisle) => aisle.id === activeAisleIdRef.current)
    if (!currentEditor || !activeAisle) return
    const activeAisleBodyId = getAisleBodyId(activeAisle)
    if (!changedAisleBodyIds.has(activeAisleBodyId)) return
    const nextMarkdown = getAisleMarkdown(activeAisle, nextState.noteAisleBodies)
    lastEditorMarkdownRef.current = nextMarkdown
    lastEditorMarkdownByAisleRef.current.set(activeAisleBodyId, nextMarkdown)
    try {
      if (getNormalizedEditorMarkdown(currentEditor) === nextMarkdown) return
    } catch {
      // If the editor cannot be read, still push the known replacement result into it.
    }
    normalizingAisleIdsRef.current.add(activeAisle.id)
    if (isCodeMirrorMarkdownEditor(currentEditor)) {
      currentEditor.setMarkdown(nextMarkdown, false)
    } else {
      setEditorMarkdownForDisplay(currentEditor, nextMarkdown, false)
    }
  }

  const applyFindReplacement = (mode: 'current' | 'all') => {
    if (findReplaceQueryError) return
    const selectedMatches =
      mode === 'current'
        ? findReplaceMatches[findReplacePanel.activeIndex]
          ? [findReplaceMatches[findReplacePanel.activeIndex]]
          : []
        : findReplaceMatches
    if (selectedMatches.length === 0) return
    if (
      mode === 'all' &&
      findReplacePanel.scope !== 'note' &&
      !window.confirm(`replace ${selectedMatches.length} matches in ${findReplacePanel.scope}?`)
    ) {
      return
    }
    const latestState = buildStateWithLatestEditorContent()
    const latestMatches = findVisibleMatches(latestState, findReplaceCurrentLocation, findReplacePanel.scope, findReplacePanel.query, {
      caseSensitive: findReplacePanel.caseSensitive,
      wholeWord: findReplacePanel.wholeWord,
      regex: findReplacePanel.regex,
    })
    const targetIds = new Set(selectedMatches.map((match) => match.id))
    const matchesToApply = mode === 'all' ? latestMatches : latestMatches.filter((match) => targetIds.has(match.id))
    const result = applyFindReplacementToState(latestState, matchesToApply, findReplacePanel.replacement)
    stateRef.current = result.state
    setState(result.state)
    syncActiveEditorAfterFindReplace(result.state, result.changedAisleBodyIds)
    setFindReplacePanel((current) => ({
      ...current,
      activeIndex: Math.max(0, Math.min(current.activeIndex, Math.max(0, findReplaceMatches.length - result.replacementCount - 1))),
    }))
    pushToast(`Replaced ${result.replacementCount} ${result.replacementCount === 1 ? 'match' : 'matches'}.`, 'success')
  }

  useEffect(() => {
    const handleFindShortcut = (event: KeyboardEvent) => {
      const shortcutMode = getFindReplaceShortcutMode(event, isMacPlatform)
      if (!shortcutMode || viewMode !== 'main' || insertNoteReferenceModalOpen) return
      event.preventDefault()
      event.stopPropagation()
      openFindReplacePanel()
    }
    document.addEventListener('keydown', handleFindShortcut, true)
    return () => document.removeEventListener('keydown', handleFindShortcut, true)
  }, [isMacPlatform, viewMode, insertNoteReferenceModalOpen, openFindReplacePanel])

  useEffect(() => {
    if (!findReplacePanel.open) return undefined
    const handleFindPanelEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setFindReplacePanel((current) => ({ ...current, open: false }))
    }
    document.addEventListener('keydown', handleFindPanelEscape, true)
    return () => document.removeEventListener('keydown', handleFindPanelEscape, true)
  }, [findReplacePanel.open])

  const runEditorHistoryOnly = (direction: WysiwygHistoryDirection): WysiwygHistoryResult => {
    const currentEditor = editorRef.current
    if (!currentEditor) return 'unavailable'
    const result = runWysiwygHistory(currentEditor, direction, {
      beforeDispatch: () => {
        scheduleMultiLineHistoryRestore(direction)
      },
    })
    if (result === 'applied') {
      finishEditorOperation(editorOperationRuntime, currentEditor, { commitMode: 'deferred', syncToolbar: true })
    }
    return result
  }

  const runActiveEditorHistory = (direction: WysiwygHistoryDirection) => {
    const currentEditor = editorRef.current
    if (!currentEditor) return false
    currentEditor.focus()
    if (shouldRunAisleStructuralHistoryBeforeEditorHistory(direction) && runAisleStructuralHistory(direction)) return true
    const result = runEditorHistoryOnly(direction)
    if (result !== 'unavailable') return true
    if (runAisleStructuralHistory(direction)) return true
    return true
  }

  const runActiveNewlineOperation = (operation: NewlineOperationId) => {
    const currentEditor = editorRef.current
    if (!currentEditor) return false
    if (operation === 'operationsMenu') {
      openShortcutMenu()
      return true
    }
    if (operation === 'strikethrough') {
      return runActiveEditorFormatCommand('strike')
    }
    const aislePlacement = getAislePlacementForNewlineOperation(operation)
    if (
      aislePlacement &&
      scratchpadWorkspaceActive &&
      !getAislesForNewAisle(activeNoteAisles, getScratchpadAisleLimit(), true)
    ) {
      showScratchpadAisleLimitToast()
      return false
    }
    if (aislePlacement && !scratchpadWorkspaceActive && activeNoteAisles.length >= MAX_NOTE_AISLES) {
      pushToast(MAX_AISLE_WARNING_MESSAGE, 'warning')
      return false
    }

    const multiLineOperation = getMultiLineListOperationForNewlineOperation(operation)
    if (operation === 'blockIndent') {
      if (tryApplyBlockIndentOperation()) {
        finishEditorOperation(editorOperationRuntime, currentEditor, { syncToolbar: true })
      }
      return true
    }
    if (multiLineEditRef.current && (operation === 'blockQuote' || operation === 'codeBlock')) {
      const handled =
        operation === 'blockQuote'
          ? tryApplyBlockQuoteOperation()
          : tryApplyMultiLineCodeBlockOperation()
      if (handled) {
        finishEditorOperation(editorOperationRuntime, currentEditor, { syncToolbar: true })
      }
      return true
    }
    if (multiLineEditRef.current && multiLineOperation) {
      if (tryApplyMultiLineListOperation(multiLineOperation)) {
        finishEditorOperation(editorOperationRuntime, currentEditor, { syncToolbar: true })
      }
      return true
    }

    const beforeAisleSnapshot = isAisleNewlineOperation(operation) ? captureActiveAisleStructuralSnapshot() : null
    const result = applyEditorNewlineOperation(currentEditor, operation)
    if (!result.handled) return false

    finishEditorOperation(editorOperationRuntime, currentEditor, { syncToolbar: true })
    if (aislePlacement) {
      closeEditorEphemeraRef.current()
      if (scratchpadWorkspaceActive) {
        addScratchpadAisle(result.aisleMarkdown ?? '', { beforeSnapshot: beforeAisleSnapshot, placement: aislePlacement })
      } else {
        addAisleToActiveNote(result.aisleMarkdown ?? '', {
          beforeSnapshot: beforeAisleSnapshot,
          placement: aislePlacement,
        })
      }
    }
    return true
  }

  const insertAisleFromEditorContext = (side: EditorAisleInsertSide = 'right') => {
    closeEditorEphemeraRef.current()
    if (!editorRef.current) {
      pushToast('Open a note before using the editor menu.', 'warning')
      return
    }
    runActiveNewlineOperation(side === 'left' ? 'aisleLeft' : 'aisleRight')
  }

  const getShortcutMenuPosition = (operationCount: number): Pick<ShortcutMenuState, 'top' | 'left'> => {
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight
    const estimatedHeight = Math.min(380, Math.max(48, operationCount * 36 + 18))
    const menuWidth = Math.min(256, Math.max(0, viewportWidth - 16))
    const view = getWysiwygView(editorRef.current)

    try {
      const position = view?.state?.selection?.from
      const coords = typeof position === 'number' ? view?.coordsAtPos?.(position) : null
      if (coords) {
        return {
          top: Math.max(8, Math.min(viewportHeight - estimatedHeight - 8, coords.top - estimatedHeight - 8)),
          left: Math.max(8, Math.min(viewportWidth - menuWidth - 8, coords.left)),
        }
      }
    } catch {
      // Fall back to the active aisle pane below.
    }

    const escapedAisleId =
      typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(activeAisleIdRef.current) : activeAisleIdRef.current
    const activePane = editorEventRootRef.current?.querySelector<HTMLElement>(`[data-aisle-id="${escapedAisleId}"]`)
    const rect = activePane?.getBoundingClientRect()
    return {
      top: Math.max(8, Math.min(viewportHeight - estimatedHeight - 8, (rect?.top ?? 84) + 12)),
      left: Math.max(8, Math.min(viewportWidth - menuWidth - 8, (rect?.left ?? 16) + 12)),
    }
  }

  const openShortcutMenu = () => {
    if (viewMode !== 'main' || !editorRef.current) return
    const operations = normalizeHotkeySettings(stateRef.current.hotkeys).newlineShortcuts.menuOperations
    closeEditorEphemeraRef.current()
    setShortcutMenuActiveIndex(0)
    setShortcutMenu({
      ...getShortcutMenuPosition(operations.length),
      operations,
    })
  }

  const closeShortcutMenu = (options: { restoreEditorFocus?: boolean } = {}) => {
    const editorToRestore = options.restoreEditorFocus ? editorRef.current : null
    setShortcutMenuActiveIndex(0)
    setShortcutMenu(null)
    if (!editorToRestore) return

    window.requestAnimationFrame(() => {
      if (editorRef.current !== editorToRestore) return
      editorToRestore.focus()
      syncToolbarFormatState()
    })
  }
  closeShortcutMenuRef.current = closeShortcutMenu

  const runShortcutOperationFromMenu = (operation: NewlineOperationId) => {
    closeEditorEphemeraRef.current()
    runActiveNewlineOperation(operation)
  }
  runShortcutOperationFromMenuRef.current = runShortcutOperationFromMenu

  useEffect(() => {
    if (!shortcutMenu) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isShortcutMenuKeyboardKey(event)) return
      event.preventDefault()
      event.stopPropagation()

      const action = getShortcutMenuKeyboardAction(
        event,
        shortcutMenuActiveIndex,
        shortcutMenu.operations.length,
      )
      if (action.type === 'close') {
        closeShortcutMenuRef.current({ restoreEditorFocus: true })
        return
      }
      if (action.type === 'highlight') {
        setShortcutMenuActiveIndex(action.index)
        return
      }
      if (action.type === 'run') {
        const operation = shortcutMenu.operations[action.index]
        if (operation) runShortcutOperationFromMenuRef.current(operation)
      }
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('.shortcut-menu')) return
      closeShortcutMenuRef.current()
    }

    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('pointerdown', handlePointerDown, true)
    }
  }, [shortcutMenu, shortcutMenuActiveIndex])

  deleteNotePreviewRef.current = deleteNotePreview

  useLegacyEditor({
    viewMode,
    isEditorView,
    displayContent,
    syncKey: [
      scratchpadWorkspaceActive ? SCRATCHPAD_CURSOR_LOCATION_KEY : '',
      activeSpace.id,
      activeTab.id,
      activeSubTab?.id ?? '',
      resolvedActiveAisleId,
      trashDomainId,
      trashSpaceId,
      trashTabId,
      trashSubTabId ?? '',
    ].join('::'),
    editorMountRef,
    editorRef,
    multiLineCursorPluginKeyRef,
    lastEditorMarkdownRef,
    normalizingContentRef,
    activeSpaceIdRef,
    activeTabIdRef,
    activeSubTabIdRef,
    activeAisleIdRef,
    isMainViewRef,
    getNormalizedEditorMarkdown,
    scheduleContentCommit,
    commitCurrentEditorContent,
    clearActiveNoteContent,
    flushPendingContent,
    closeImageTools: () => {
      closeImageTools()
      closeMediaTools()
    },
    pushToast,
    maybeShowCompletedTaskUndoHint,
    trackCompletedTaskQuickDelete,
    tryExpandMultilineSelection,
  })

  useEditorDomEvents({
    viewMode,
    displayContent,
    activeNoteAisleCount: activeNoteAisles.length,
    hotkeys: normalizedHotkeys,
    isMacPlatform,
    editorEventRootRef,
    editorRef,
    activeImageRef,
    activeMediaRef,
    multiLineEditRef,
    activateEditorFromEventTarget,
    clearMultiLineEdit,
    closeImageTools,
    closeMediaTools,
    closeLinkPrompt,
    isLinkPromptOpen: () => false,
    isImageCropActive,
    selectImageForTools,
    selectMediaForTools,
    refreshImageToolsPosition,
    refreshMediaToolsPosition,
    copySelectedImageToClipboard,
    deleteActiveEditorImageNode,
    commitActiveEditorMarkdownNow,
    setMenuOpen,
    setContextMenu,
    onDismissEditorEphemeraBeforeContextMenu: () => closeEditorEphemeraRef.current(),
    resolveInternalNoteReferenceToken,
    navigateToNoteLocation,
    openExternalLink: openExternalWebUrl,
    insertPastedUrlAsLink: (label, url) => insertLinkIntoActiveEditor(label, url),
    onPasteCopyAsPayload: pasteCopyAsPayload,
    onPasteInvalidCopyAsPayload: () => {
      pushToast('Clipboard copy command is invalid.', 'warning')
      return true
    },
    getToolbarFormatShortcut,
    queueToolbarShortcutFeedback,
    syncToolbarFormatState,
    onRunFormatCommand: runActiveEditorFormatCommand,
    getEditorHistoryDirection,
    onEditorSelectionChange: saveActiveCursorLocation,
    onEditorSelectionSettled: markMouseAisleActivationSettled,
    onEditorMentionQueryChange: () => {
      noteMention.refreshQuery()
      tagAutocomplete.refreshQuery()
    },
    onRunStructuralHistory: runAisleStructuralHistory,
    onRunEditorHistory: runEditorHistoryOnly,
    shouldRunStructuralHistoryBeforeEditorHistory: shouldRunAisleStructuralHistoryBeforeEditorHistory,
    onRunNewlineOperation: runActiveNewlineOperation,
    onOpenShortcutMenu: openShortcutMenu,
    onOpenUrlLinkShortcut: openUrlLinkModalFromShortcut,
    tryExpandMultilineSelection,
    tryApplyMultiLineEditInput,
    tryApplyMultiLineListMarkerShortcut,
    tryApplyMultiLineBlockMarkerShortcut,
    tryApplyMultiLineInlineMarkerShortcut,
    tryApplyMultiLineTabInput,
    tryMoveMultiLineCursors,
    tryApplyMultilineIndent,
    copyMultiLineSelectionToClipboard,
    cutMultiLineSelectionToClipboard,
  })

  const closeSettingsView = () => {
    returnToLastTabLikeView()
  }

  const buildBlankNotebookSerializedState = () => {
    const latestState = buildStateWithLatestEditorContent()
    const blankState = parseSavedState(JSON.stringify(DEFAULT_STATE))
    return JSON.stringify(applyPortableAppSettings(blankState, latestState))
  }

  const getNotebookParentLocation = () => {
    const notebookPath = storageProfileStatus?.notebookPath ?? storageProfileStatus?.profileRootPath ?? ''
    const separatorIndex = Math.max(notebookPath.lastIndexOf('/'), notebookPath.lastIndexOf('\\'))
    return separatorIndex > 0 ? notebookPath.slice(0, separatorIndex) : ''
  }

  const openCreateNotebookModal = () => {
    setModal({
      type: 'create-notebook',
      name: '',
      locationPath: getNotebookParentLocation(),
    })
  }

  const openRenameNotebookModal = () => {
    setModal({
      type: 'rename-notebook',
      name: storageProfileStatus?.notebookName ?? '',
    })
  }

  const confirmCreateNotebookModal = async (currentModal: Extract<ModalState, { type: 'create-notebook' }>) => {
    const name = currentModal.name
    const locationPath = currentModal.locationPath.trim()
    if (!name.trim()) {
      setModal({ ...currentModal, error: 'Notebook name is required.' })
      return
    }
    if (!locationPath) {
      setModal({ ...currentModal, error: 'Notebook location is required.' })
      return
    }
    const ok = await storageProfileController.createNotebook({
      name,
      locationPath,
      serializedState: buildBlankNotebookSerializedState,
    })
    if (ok) setModal(null)
  }

  const confirmRenameNotebookModal = async (currentModal: Extract<ModalState, { type: 'rename-notebook' }>) => {
    const name = currentModal.name
    if (!name.trim()) {
      setModal({ ...currentModal, error: 'Notebook name is required.' })
      return
    }
    const ok = await storageProfileController.renameNotebook(name)
    if (ok) setModal(null)
  }

  const notebookTransferActions = useNotebookTransferActions({
    getLatestState: buildStateWithLatestEditorContent,
    commitAppStateNow,
    flushStorageActionState: () => flushStorageActionStateRef.current(),
    setExportStatus: settingsController.setExportStatus,
    setImportStatus: settingsController.setImportStatus,
  })

  const userSettingsTransferActions = useUserSettingsTransferActions({
    getLatestState: buildStateWithLatestEditorContent,
    commitAppStateNow,
    setExportStatus: settingsController.setExportStatus,
    setImportStatus: settingsController.setImportStatus,
    pushToast,
  })

  const openFrontmatterModalForAisle = (aisleId: string | null = null) => {
    if (scratchpadWorkspaceActive) {
      pushToast('Scratchpad does not use frontmatter.', 'warning')
      return
    }
    if (viewMode !== 'main' || !activeNoteBodyId) return
    saveActiveCursorBeforeNavigation()
    const latestState = stateRef.current
    const latestBody = latestState.noteBodies.find((body) => body.id === activeNoteBodyId) ?? activeNoteBody
    const targetAisle =
      (aisleId ? latestBody?.aisles.find((aisle) => aisle.id === aisleId) : null) ??
      latestBody?.aisles.find((aisle) => aisle.id === resolvedActiveAisleId) ??
      latestBody?.aisles[0] ??
      null
    if (!targetAisle) return
    const aisleBodyId = getAisleBodyId(targetAisle)
    const aisleBody = (latestState.noteAisleBodies ?? []).find((body) => body.id === aisleBodyId) ?? null
    if (aisleBody?.frontmatterStatus === 'invalid') {
      pushToast('Frontmatter YAML is invalid. Fix the markdown block before using the frontmatter menu.', 'warning')
      return
    }
    const draft = buildFrontmatterModalDraftForAisle(latestState, activeNoteBodyId, aisleBodyId, activeNoteLocation)
    setModal({
      type: 'frontmatter-note',
      noteBodyId: activeNoteBodyId,
      aisleId: targetAisle.id,
      aisleBodyId,
      location: activeNoteLocation,
      rows: draft.rows,
      selectedTemplateId: draft.selectedTemplateId,
      templateDerived: draft.templateDerived,
      isTemplateSuggestionDraft: draft.isTemplateSuggestionDraft,
    })
  }

  const openFrontmatterModalForActiveNote = () => {
    closeEditorEphemeraRef.current()
    openFrontmatterModalForAisle()
  }

  const openLinkedAisleModal = (aisleId: string) => {
    if (scratchpadWorkspaceActive) {
      pushToast('Scratchpad aisles cannot be linked copies.', 'warning')
      return
    }
    if (viewMode !== 'main' || !activeNoteBodyId) return
    saveActiveCursorBeforeNavigation()
    const latestState = stateRef.current
    const latestBody = latestState.noteBodies.find((body) => body.id === activeNoteBodyId) ?? activeNoteBody
    const targetAisle = latestBody?.aisles.find((aisle) => aisle.id === aisleId) ?? null
    if (!targetAisle) return

    const aisleBodyId = getAisleBodyId(targetAisle)
    const latestLocations = listNoteLocationsForBody(latestState, activeNoteBodyId)
    if (latestLocations.length > 1) {
      setModal({
        type: 'linked-aisle',
        reason: 'note-body',
        noteBodyId: activeNoteBodyId,
        aisleId,
        aisleBodyId,
        location: activeNoteLocation,
        keepLocationKeys: latestLocations.map((location) => buildNoteLocationKey(location)),
        keepData: latestState.ui.decoupledItemsKeepData ?? true,
      })
      return
    }

    const latestLinkedAisleIds = getLinkedAisleIdsForNoteBody(latestState, activeNoteBodyId)
    if (!latestLinkedAisleIds.has(aisleId)) return
    const linkedAisleSlots = listLinkedAisleSlotsForAisleBody(latestState, aisleBodyId)
    setModal({
      type: 'linked-aisle',
      reason: 'aisle-body',
      noteBodyId: activeNoteBodyId,
      aisleId,
      aisleBodyId,
      location: activeNoteLocation,
      keepAisleSlotKeys:
        linkedAisleSlots.length > 0
          ? linkedAisleSlots.map((slot) => slot.key)
          : [buildAisleSlotKey(activeNoteBodyId, aisleId)],
      keepData: latestState.ui.decoupledItemsKeepData ?? true,
    })
  }

  const openFrontmatterFilterForAisle = (aisleId: string) => {
    if (scratchpadWorkspaceActive) {
      pushToast('Scratchpad does not use frontmatter.', 'warning')
      return false
    }
    if (viewMode !== 'main' || !activeNoteBodyId) return false
    const latestState = stateRef.current
    const latestBody = latestState.noteBodies.find((body) => body.id === activeNoteBodyId) ?? activeNoteBody
    const targetAisle = latestBody?.aisles.find((aisle) => aisle.id === aisleId) ?? null
    if (!targetAisle) return false
    const aisleBodyId = getAisleBodyId(targetAisle)
    const aisleBody = (latestState.noteAisleBodies ?? []).find((body) => body.id === aisleBodyId) ?? null
    const frontmatter = aisleBody?.frontmatter
    if (aisleBody?.frontmatterStatus !== 'valid' || !frontmatter || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) {
      pushToast('Frontmatter filter needs valid frontmatter.', 'warning')
      return false
    }

    const templateId = aisleBody.frontmatterMeta?.templateId ?? ''
    const selectedKeys = templateId && latestState.frontmatter.templates.some((template) => template.id === templateId)
      ? [getFrontmatterTemplateFilterKey(templateId)]
      : Object.keys(frontmatter).map(getFrontmatterPropertyFilterKey).filter(Boolean)
    if (selectedKeys.length === 0) {
      pushToast('Frontmatter filter needs a template or property.', 'warning')
      return false
    }

    closeEditorEphemeraRef.current()
    if (arrangeMode.active) exitArrangeMode()
    setViewMode('main')
    setMenuOpen(false)
    setEditing(null)
    activateNoteFilter('frontmatter', selectedKeys)
    return true
  }

  const openSyncedFilterFromLinkedModal = () => {
    if (!modal || modal.type !== 'linked-aisle') return
    const selectedKey = modal.reason === 'note-body'
      ? getSyncedNoteFilterKey(modal.noteBodyId)
      : getSyncedAisleFilterKey(modal.aisleBodyId)
    setModal(null)
    activateNoteFilter('synced', [selectedKey])
  }

  const openFrontmatterFilterFromModal = () => {
    if (!modal || modal.type !== 'frontmatter-note') return
    if (openFrontmatterFilterForAisle(modal.aisleId)) {
      setModal(null)
    }
  }

  const openFrontmatterTemplateSettings = (templateId: string) => {
    settingsController.setSettingsFrontmatterTemplate(templateId)
    settingsController.changeSection('frontmatter')
    setModal(null)
    openSettingsView()
  }

  const applyArrangeTabSort = (target: TabSortTarget, mode: TabSortMode) => {
    saveActiveCursorBeforeNavigation()
    if (target === 'spaces') {
      if (mode !== 'alpha-asc' && mode !== 'alpha-desc') return
      setState((previous) => {
        const projected = projectActiveDomainState(previous)
        return updateActiveDomainSpaces(projected, sortNamedItems(projected.spaces, mode), projected.activeSpaceId)
      })
      return
    }

    if (target === 'domains') {
      if (mode !== 'alpha-asc' && mode !== 'alpha-desc') return
      setState((previous) => {
        const projected = projectActiveDomainState(previous)
        return projectActiveDomainState({
          ...projected,
          domains: sortNamedItems(projected.domains, mode),
        })
      })
      return
    }

    const noteBodies = stateRef.current.noteBodies
    if (target === 'parents') {
      updateActiveSpaceData((data) => ({
        ...data,
        tabs: sortTabs(data.tabs, noteBodies, mode),
      }))
      return
    }

    const parentTabId = activeTabIdRef.current
    updateActiveSpaceData((data) => ({
      ...data,
      tabs: data.tabs.map((tab) =>
        tab.id === parentTabId
          ? {
              ...tab,
              subTabs: sortSubTabs(tab.subTabs, noteBodies, mode),
            }
          : tab,
      ),
    }))
  }

  const overlayActions = useAppOverlayActions({
    state,
    stateRef,
    setState,
    viewMode,
    navigationContextMenusDisabled,
    contextMenu,
    setContextMenu,
    modal,
    setModal,
    setMenuOpen,
    setEditing,
    activeSpaceId: activeSpace.id,
    activeNoteLocation,
    updateActiveSpaceData,
    saveActiveCursorBeforeNavigation,
    setTrashTabId,
    setTrashSubTabId,
    setTrashDomainId,
    setTrashSpaceId,
    insertNoteReference,
    exportSpace: notebookTransferActions.exportSpace,
    pushToast,
  })
  const openContextMenuForTab = overlayActions.openContextMenuForTab
  const openContextMenuForSubTab = overlayActions.openContextMenuForSubTab
  const openContextMenuForHomeTab = overlayActions.openContextMenuForHomeTab
  const openContextMenuForTrashTab = overlayActions.openContextMenuForTrashTab
  const openContextMenuForTrashSubTab = overlayActions.openContextMenuForTrashSubTab
  const openContextMenuForTrashDomain = overlayActions.openContextMenuForTrashDomain
  const openContextMenuForTrashSpace = overlayActions.openContextMenuForTrashSpace
  const openContextMenuForSpace = overlayActions.openContextMenuForSpace
  const openContextMenuForDomain = overlayActions.openContextMenuForDomain
  const deleteFromContext = overlayActions.deleteFromContext
  const deleteTarget = overlayActions.deleteTarget
  const restoreFromContext = overlayActions.restoreFromContext
  const restoreTrashTargets = overlayActions.restoreTrashTargets
  const openCopyModalFromContext = overlayActions.openCopyModalFromContext
  const openCopyModalForActiveNote = overlayActions.openCopyModalForActiveNote
  const openDeduplicateModalForActiveNote = overlayActions.openDeduplicateModalForActiveNote
  const setLastNoteCopyMode = overlayActions.setLastNoteCopyMode
  const setDecoupledItemsKeepData = overlayActions.setDecoupledItemsKeepData
  const openDeduplicateModalFromContext = overlayActions.openDeduplicateModalFromContext
  const getCurrentDuplicateCount = overlayActions.getCurrentDuplicateCount
  const beginRenameSpaceFromContext = overlayActions.beginRenameSpaceFromContext
  const beginRenameDomainFromContext = overlayActions.beginRenameDomainFromContext

  const maybeShowTrashDeleteConfirmationTip = () => {
    if (!shouldShowTrashDeleteConfirmationTip(stateRef.current.ui)) return
    showTip(TRASH_DELETE_CONFIRMATION_TIP_ID)
  }

  const deleteTrashTargetsForRealNow = (targets: readonly DeleteTarget[]) => {
    if (targets.length === 0) return
    overlayActions.deleteTrashTargetsForReal(targets)
    clearTrashSelection()
    maybeShowTrashDeleteConfirmationTip()
  }

  const requestDeleteTrashTargetsForReal = (targets: readonly DeleteTarget[]) => {
    if (targets.length === 0) return
    const nextTargets = [...targets]
    if (shouldConfirmTrashDeleteForReal(stateRef.current.ui)) {
      setModal({ type: 'delete-trash-targets', targets: nextTargets })
      return
    }
    deleteTrashTargetsForRealNow(nextTargets)
  }

  requestDeleteTrashTargetsForRealRef.current = requestDeleteTrashTargetsForReal

  const restoreTrashTargetsFromContext = () => {
    if (trashContextTargets.length === 0) {
      restoreFromContext()
      return
    }
    setContextMenu(null)
    restoreTrashTargets(trashContextTargets)
    clearTrashSelection()
  }

  const deleteTrashTargetsFromContext = () => {
    if (trashContextTargets.length === 0) return
    setContextMenu(null)
    requestDeleteTrashTargetsForReal(trashContextTargets)
  }

  const pasteSyncedNoteAsAisleFromModal = () => {
    if (!modal || modal.type !== 'confirm-synced-note-paste' || !modal.sourceAisleId) return
    if (scratchpadWorkspaceActive) {
      pushToast('Scratchpad cannot receive synced copies.', 'warning')
      return
    }

    const latestState = buildStateWithLatestEditorContent()
    const sourceInfo = getLocationInfo(latestState, modal.source)
    const sourceBody = sourceInfo.noteBodyId
      ? latestState.noteBodies.find((candidate) => candidate.id === sourceInfo.noteBodyId) ?? null
      : null
    if (!sourceBody || sourceBody.aisles.length !== 1 || sourceBody.aisles[0]?.id !== modal.sourceAisleId) {
      pushToast('Copied note no longer has one aisle.', 'warning')
      return
    }

    const destinationInfo = getLocationInfo(latestState, modal.destination)
    const destinationBody = destinationInfo.noteBodyId
      ? latestState.noteBodies.find((candidate) => candidate.id === destinationInfo.noteBodyId) ?? null
      : null
    if (!destinationInfo.noteBodyId || !destinationBody) {
      pushToast('Open a note before pasting.', 'warning')
      return
    }
    if (!destinationBody.aisles.some((aisle) => aisle.id === modal.destinationAisleId)) {
      pushToast('Destination aisle no longer exists.', 'warning')
      return
    }

    const beforeSnapshot = captureActiveAisleStructuralSnapshot(latestState)
    if (!beforeSnapshot || beforeSnapshot.noteBodyId !== destinationInfo.noteBodyId) {
      pushToast('Open the destination note before pasting.', 'warning')
      return
    }

    const result = materializeStructuralAisleCopiesForInsertion(latestState, {
      scope: 'aisle',
      action: 'duplicate',
      source: modal.source,
      aisleId: modal.sourceAisleId,
    })
    if (result.status !== 'applied') {
      pushToast(result.message, 'warning')
      return
    }

    const baseAisles = cloneAisles(destinationBody.aisles, latestState.noteAisleBodies)
    const nextAisles = replaceFocusedAisleWithNewAisles(
      baseAisles,
      result.aisles,
      modal.destinationAisleId,
      () => true,
    )
    if (!nextAisles) {
      pushToast('Destination aisle no longer exists.', 'warning')
      return
    }

    applyAisleEditDraftToActiveNote(nextAisles, {
      activeAisleId: result.aisles[0]?.id,
      additionalAisleBodies: result.aisleBodies,
    })
    setModal(null)
    closeEditorEphemeraRef.current()
    pushToast(getCopyAsPasteSuccessMessage('aisle', 'duplicate'), 'success')
  }

  const confirmModal = () => {
    if (!modal) return

    if (modal.type === 'create-notebook') {
      void confirmCreateNotebookModal(modal)
      return
    }

    if (modal.type === 'rename-notebook') {
      void confirmRenameNotebookModal(modal)
      return
    }

    if (modal.type === 'confirm-independent-note-paste-reclaim') {
      const currentModal = modal
      setModal(null)
      pasteIndependentNoteCopyAsAisles(
        {
          version: 1,
          scope: 'note',
          action: 'copy',
          source: currentModal.source,
        },
        {
          destination: currentModal.destination,
          destinationAisleId: currentModal.destinationAisleId,
          placement: currentModal.placement,
          allowReclaim: true,
        },
      )
      return
    }

    if (modal.type === 'confirm-synced-note-paste') {
      const latestState = buildStateWithLatestEditorContent()
      const result = applyNoteCopyToState(latestState, modal.destination, modal.source, 'linked', 'replace')
      setModal(null)
      if (result.status === 'self-copy') {
        pushToast('Choose a different note to paste this synced copy.', 'warning')
        return
      }
      if (result.status === 'already-linked') {
        pushToast('Destination already links to copied note.', 'warning')
        return
      }
      if (result.status !== 'applied') {
        pushToast('Copied note no longer exists.', 'warning')
        return
      }
      stateRef.current = result.state
      setState(result.state)
      closeEditorEphemeraRef.current()
      pushToast(getCopyAsPasteSuccessMessage('note', 'duplicate'), 'success')
      return
    }

    if (modal.type === 'delete-trash-targets') {
      const targets = modal.targets
      setModal(null)
      deleteTrashTargetsForRealNow(targets)
      return
    }

    if (modal.type !== 'linked-aisle') {
      overlayActions.confirmModal()
      return
    }

    if (modal.reason === 'aisle-body') {
      setDecoupledItemsKeepData(modal.keepData)
      const keepSlotKeys = new Set(modal.keepAisleSlotKeys)
      const result = decoupleAisleSlotsInState(stateRef.current, modal.aisleBodyId, keepSlotKeys, modal.keepData)
      if (result.status === 'blocked') {
        pushToast(result.message, 'error')
        return
      }
      if (result.state !== stateRef.current) {
        stateRef.current = result.state
        setState(result.state)
      }
      setModal(null)
      pushToast('Aisles de-coupled.', 'success')
      return
    }

    setDecoupledItemsKeepData(modal.keepData)
    const keepKeys = new Set(modal.keepLocationKeys)
    if (keepKeys.size === 0) {
      pushToast('Select at least one note to retain the information.', 'error')
      return
    }
    const appliedState = decoupleNoteLocationsInState(stateRef.current, modal.noteBodyId, keepKeys, modal.keepData)
    stateRef.current = appliedState
    setState(appliedState)
    setModal(null)
    pushToast('Notes de-coupled.', 'success')
  }

  const deleteActiveAisleFromShortcut = () => {
    closeEditorEphemeraRef.current()
    const latestState = buildStateWithLatestEditorContent()
    const activeBody = activeNoteBodyId
      ? latestState.noteBodies.find((candidate) => candidate.id === activeNoteBodyId) ?? null
      : null
    if (activeBody && activeBody.aisles.length > 1 && deleteFocusedAisleFromBody(activeBody, latestState)) {
      return
    }

    const activeSubTabId = activeTab.activeSubTabId
    if (!activeSubTabId) {
      pushToast('Home tabs cannot be deleted.', 'warning')
      return
    }
    deleteTarget({ type: 'subtab', tabId: activeTab.id, subTabId: activeSubTabId }, false)
  }

  const cycleActiveAisle = useCallback((direction: -1 | 1, options: { allowMouseActivationDefer?: boolean } = {}) => {
    const currentAisleIds = activeAisleIdsRef.current
    if (viewMode !== 'main' || arrangeMode.active || currentAisleIds.length <= 1) {
      return
    }
    const pendingMouseActivation = pendingMouseAisleActivationRef.current
    const focusedAisleId = pendingMouseActivation && !pendingMouseActivation.settled
      ? pendingMouseActivation.aisleId
      : getAisleIdFromCurrentDomFocus()
    if (focusedAisleId && focusedAisleId !== activeAisleIdRef.current) {
      syncActiveAisleSelection(focusedAisleId)
    }
    const currentAisleId = focusedAisleId || activeAisleIdRef.current
    if (
      options.allowMouseActivationDefer !== false &&
      shouldDeferAisleCycleForMouseActivation(pendingMouseActivation, currentAisleId)
    ) {
      if (pendingMouseAisleCycleFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingMouseAisleCycleFrameRef.current)
      }
      pendingMouseAisleCycleFrameRef.current = window.requestAnimationFrame(() => {
        pendingMouseAisleCycleFrameRef.current = null
        pendingMouseAisleActivationRef.current = null
        cycleActiveAisle(direction, { allowMouseActivationDefer: false })
      })
      return
    }
    const targetAisleId = getCycledAisleTarget(currentAisleIds, currentAisleId, direction)
    if (!targetAisleId || targetAisleId === currentAisleId || !currentAisleIds.includes(targetAisleId)) {
      return
    }

    closeEditorEphemeraRef.current()
    saveActiveCursorLocation()
    flushPendingContent({ captureActiveTableEditorSnapshot: true })

    const noteLocationKey = scratchpadWorkspaceActive
      ? SCRATCHPAD_CURSOR_LOCATION_KEY
      : activeNoteLocationKeyRef.current || activeNoteLocationKey
    const savedLocation = stateRef.current.ui.noteCursorLocations[noteLocationKey] ?? null
    pendingCursorRestoreRef.current = {
      noteLocationKey,
      aisleId: targetAisleId,
      selection: savedLocation?.aisles[targetAisleId] ?? null,
      focusIntent: 'aisle-activation',
    }
    pendingFocusToAisleIdRef.current = targetAisleId
    syncActiveAisleSelection(targetAisleId)
    scheduleAisleFocusScroll(targetAisleId, {
      onInvalidAisle: () => {
        if (pendingFocusToAisleIdRef.current === targetAisleId) pendingFocusToAisleIdRef.current = null
        if (pendingScrollToAisleIdRef.current === targetAisleId) pendingScrollToAisleIdRef.current = null
        const pending = pendingCursorRestoreRef.current
        if (pending?.noteLocationKey === noteLocationKey && pending.aisleId === targetAisleId) {
          pendingCursorRestoreRef.current = null
        }
      },
    })
  }, [
    activeNoteLocationKey,
    arrangeMode.active,
    flushPendingContent,
    getAisleIdFromCurrentDomFocus,
    pendingCursorRestoreRef,
    saveActiveCursorLocation,
    scratchpadWorkspaceActive,
    scheduleAisleFocusScroll,
    stateRef,
    syncActiveAisleSelection,
    viewMode,
  ])

  const autoSizeRenameInput = (input: HTMLInputElement) => {
    if (!renameInputMeasureContext) {
      renameInputMeasureContext = document.createElement('canvas').getContext('2d')
    }

    const computed = window.getComputedStyle(input)
    const minWidth = Number.parseFloat(computed.minWidth) || 0
    const maxWidth = Number.parseFloat(computed.maxWidth) || Number.POSITIVE_INFINITY
    const horizontalChrome =
      (Number.parseFloat(computed.paddingLeft) || 0) +
      (Number.parseFloat(computed.paddingRight) || 0) +
      (Number.parseFloat(computed.borderLeftWidth) || 0) +
      (Number.parseFloat(computed.borderRightWidth) || 0)

    const value = input.value || ' '
    const context = renameInputMeasureContext
    if (!context) {
      input.style.width = `${Math.max(minWidth, 0)}px`
      return
    }

    context.font = computed.font
    const letterSpacing = Number.parseFloat(computed.letterSpacing)
    const extraLetterSpacing = Number.isFinite(letterSpacing) ? Math.max(0, value.length - 1) * letterSpacing : 0
    const textWidth = context.measureText(value).width + extraLetterSpacing
    const nextWidth = Math.min(maxWidth, Math.max(minWidth, Math.ceil(textWidth + horizontalChrome + 2)))
    input.style.width = `${nextWidth}px`
  }

  const editorReadOnly = viewMode !== 'main'
  const mainArrangementActive = !tagFilterActive && arrangeMode.active && viewMode === 'main'

  useEffect(() => {
    if (!mainArrangementActive) return
    closeEditorEphemeraRef.current()
  }, [mainArrangementActive])

  const editorToolbarLayer = useEditorToolbarLayer({
    editorRef,
    copyToolbarButtonRef,
    headingToolbarButtonRef,
    aisleToolbarButtonRef,
    toolbarFormatState,
    activeHeadingLevel,
    toolbarShortcutFeedback,
    tooltipsDisabled: mainArrangementActive,
    interactionDisabled: mainArrangementActive,
    copyMenuOpen,
    headingMenuOpen,
    toolbarPopoverPosition,
    activeNoteDuplicateCount,
    activeToolbarLayout,
    setCopyMenuOpen,
    setHeadingMenuOpen,
    setToolbarPopoverPosition,
    refreshToolbarPopoverPosition,
    runActiveEditorCommand,
    runActiveEditorHistory,
    commitActiveEditorMarkdownNow,
    openSharedLinkModal,
    clearActiveNoteContent,
    openCopyModalForActiveNote: () => {
      closeEditorEphemeraRef.current()
      if (scratchpadWorkspaceActive) {
        pushToast('Scratchpad cannot be used as a copy source.', 'warning')
        return
      }
      openCopyModalForActiveNote()
    },
    openDeduplicateModalForActiveNote: () => {
      closeEditorEphemeraRef.current()
      if (scratchpadWorkspaceActive) {
        pushToast('Scratchpad cannot be used as a synced copy.', 'warning')
        return
      }
      openDeduplicateModalForActiveNote()
    },
    openFrontmatterModalForActiveNote,
    openTableOfContents,
    openAisleEditModal: () => {
      closeEditorEphemeraRef.current()
      openAisleEditModal()
    },
    openFindReplace: openFindReplacePanel,
    pushToast,
    onDisabledToolbarInteraction: exitArrangeMode,
    dismissEditorEphemera: () => closeEditorEphemeraRef.current(),
  })

  const renderImageToolsOverlay = () => (
    <>
      <ImageToolsOverlay
        visible={viewMode === 'main' && !aisleEditModalOpen && !mainArrangementActive}
        imageTools={imageTools}
        inlineCrop={inlineCrop}
        onStartCrop={startInlineCrop}
        onOpenTransform={openImageTransformMenu}
        onCopyImage={copySelectedImageToClipboard}
        onReturnToStart={returnToImageToolsMenu}
        onTransformImage={transformSelectedImage}
        onApplyCrop={applyInlineCrop}
        onCancelCrop={cancelInlineCrop}
        onSetCropRatio={setInlineCropRatio}
        onBeginResize={beginImageResize}
        onBeginCropDrag={beginInlineCropMouseDrag}
      />
      <MediaToolsOverlay
        visible={viewMode === 'main' && !aisleEditModalOpen && !mainArrangementActive}
        mediaTools={mediaTools}
        onOpenTransform={openMediaTransformMenu}
        onReturnToStart={returnToMediaToolsMenu}
        onTransformMedia={transformSelectedMedia}
        onBeginResize={beginMediaResize}
      />
    </>
  )

  const renderTableControlsOverlay = () => (
    <TableControlsOverlay
      visible={viewMode === 'main' && !aisleEditModalOpen && !mainArrangementActive}
      tableControls={tableControls}
      onAddRow={() => runTableControlOperation('add-row', state.ui.tableAddTargetMode)}
      onRemoveRow={() => runTableControlOperation('remove-row', state.ui.tableDeleteTargetMode)}
      onAddColumn={() => runTableControlOperation('add-column', state.ui.tableAddTargetMode)}
      onRemoveColumn={() => runTableControlOperation('remove-column', state.ui.tableDeleteTargetMode)}
    />
  )

  const canDeleteSpace = state.spaces.length > 1
  const canDeleteDomain = state.domains.length > 1
  const cycleUtilityChild = (direction: -1 | 1) => {
    const nextSelection = getNextUtilityChildSelection({
      viewMode,
      settingsSection: settingsController.section,
      messagesSection,
      aboutSection,
      direction,
    })
    if (!nextSelection) return
    if (nextSelection.viewMode === 'settings') {
      settingsController.changeSection(nextSelection.section)
      return
    }
    if (nextSelection.viewMode === 'messages') {
      setMessagesSection(nextSelection.section)
      return
    }
    setAboutSection(nextSelection.section)
  }

  useGlobalHotkeys({
    viewMode,
    activeTab,
    primeTabs: workspace.tabs,
    arrangeMode,
    hotkeys: normalizedHotkeys,
    deleteActiveAisleShortcutEnabled: state.ui.deleteActiveAisleShortcutEnabled ?? false,
    scratchpadActive: scratchpadWorkspaceActive,
    shortcutsSuspended: insertNoteReferenceModalOpen,
    isMacPlatform,
    editingShortcut: settingsController.editingShortcut,
    setEditingShortcut: settingsController.setEditingShortcut,
    updateShortcutSetting: settingsController.updateShortcutSetting,
    exitArrangeMode,
    openSettings: openEtCeteraView,
    toggleSpaceRail: toggleSpaceRailVisibility,
    toggleDomainRail: toggleDomainRailVisibility,
    toggleNotesTrash: toggleNotesTrashFromShortcut,
    toggleNotesScratchpad: toggleNotesScratchpadFromShortcut,
    toggleNotesFilter: toggleNotesFilterFromShortcut,
    navigateHistoryBy,
    showTip,
    cycleUtilityChild,
    addTab: () => {
      if (!tagFilterActive) addTab()
    },
    addSubTab: () => {
      if (!tagFilterActive) addSubTab()
    },
    addScratchpadAisle: () => {
      closeEditorEphemeraRef.current()
      addScratchpadAisle('')
    },
    deleteActiveAisle: deleteActiveAisleFromShortcut,
    deleteScratchpadAisle: () => {
      closeEditorEphemeraRef.current()
      deleteScratchpadActiveAisle()
    },
    cycleAisle: cycleActiveAisle,
    formatStrikethrough: () => runActiveEditorFormatCommand('strike'),
    selectTab: (tabId) => {
      setScratchpadActive(false)
      selectTab(tabId)
    },
    selectSubTab: (subTabId) => {
      setScratchpadActive(false)
      selectSubTab(subTabId)
    },
  })

  const persistedHierarchyLevel = state.ui.alwaysShowDomains ? 2 : state.ui.alwaysShowSpaces ? 1 : 0
  const promptHierarchyLevel = arrangeDestinationPrompt?.revealHierarchyLevel ?? 0
  const effectiveHierarchyLevel =
    viewMode === 'main'
      ? tagFilterActive
        ? 2
        : Math.max(
            persistedHierarchyLevel,
            mainArrangementActive ? arrangeHierarchyRevealLevel : 0,
            promptHierarchyLevel,
          )
      : 0
  const showCompactSpaces = effectiveHierarchyLevel >= 1
  const showCompactDomains = effectiveHierarchyLevel >= 2
  const isNoteWorkspaceView = viewMode === 'main'
  const promptTargetsActiveSpace =
    Boolean(arrangeDestinationPrompt) &&
    arrangeDestinationPrompt?.targetDomainId === state.activeDomainId &&
    arrangeDestinationPrompt?.targetSpaceId === activeSpace.id
  const canArrangeParentTabs =
    mainArrangementActive &&
    (!arrangeDestinationPrompt || promptTargetsActiveSpace)
  const arrangeableParentTabClassName = canArrangeParentTabs ? 'is-arrangeable' : ''
  const arrangeableSubTabClassName = mainArrangementActive && !arrangeDestinationPrompt ? 'is-arrangeable' : ''
  const arrangeSelectedParentIds = useMemo(
    () => (arrangeSelection.kind === 'parent' ? new Set(arrangeSelection.selectedIds) : new Set<string>()),
    [arrangeSelection],
  )
  const arrangeSelectedSubTabIds = useMemo(
    () =>
      arrangeSelection.kind === 'subtab' && arrangeSelection.parentTabId === activeTab.id
        ? new Set(arrangeSelection.selectedIds)
        : new Set<string>(),
    [activeTab.id, arrangeSelection],
  )
  const arrangeSelectedDomainIds = useMemo(
    () => (arrangeSelection.kind === 'domain' ? new Set(arrangeSelection.selectedIds) : new Set<string>()),
    [arrangeSelection],
  )
  const arrangeSelectedSpaceIds = useMemo(
    () =>
      arrangeSelection.kind === 'space' && arrangeSelection.domainId === state.activeDomainId
        ? new Set(arrangeSelection.selectedIds)
        : new Set<string>(),
    [arrangeSelection, state.activeDomainId],
  )
  const draggingParentTabId =
    arrangeMode.active && arrangeDraggingItem?.type === 'tab' ? arrangeDraggingItem.tabId : null
  const draggingSubTabId =
    arrangeMode.active && arrangeDraggingItem?.type === 'subtab' ? arrangeDraggingItem.subTabId : null
  const arrangeableSpaceClassName =
    mainArrangementActive &&
    (!arrangeDestinationPrompt || promptAllowsSpaceSelection(arrangeDestinationPrompt)) &&
    showCompactSpaces
      ? 'is-arrangeable'
      : ''
  const arrangeableDomainClassName =
    mainArrangementActive &&
    showCompactDomains
      ? 'is-arrangeable'
      : ''
  const draggingDomainId =
    arrangeMode.active && arrangeDraggingItem?.type === 'domain' ? arrangeDraggingItem.domainId : null
  const draggingSpaceId =
    arrangeMode.active && arrangeDraggingItem?.type === 'space' ? arrangeDraggingItem.spaceId : null
  const topVisibleMainRail = showCompactDomains ? 'domains' : showCompactSpaces ? 'spaces' : 'parents'
  const noteFilterRailVisibility = getNoteFilterRailVisibility({
    filterActive: tagFilterActive,
    index: noteFilterIndex,
    showCompactDomains,
    showCompactSpaces,
  })
  const tagFilteredDomains = tagFilterActive
    ? state.domains.filter((domain) => (noteFilterIndex.domainCounts.get(domain.id) ?? 0) > 0)
    : state.domains
  const visibleTagFilteredDomains = noteFilterRailVisibility.scratchpadOnlyFilterActive ? [] : tagFilteredDomains
  const tagFilteredSpaces = tagFilterActive
    ? state.spaces.filter(
        (space) => (noteFilterIndex.spaceCounts.get(getNoteFilterSpaceKey(state.activeDomainId, space.id)) ?? 0) > 0,
      )
    : state.spaces
  const visibleTagFilteredSpaces = noteFilterRailVisibility.scratchpadOnlyFilterActive ? [] : tagFilteredSpaces
  const tagFilteredWorkspace = tagFilterActive
    ? {
        ...workspace,
        tabs: workspace.tabs.filter(
          (tab) =>
            (noteFilterIndex.parentCounts.get(getNoteFilterParentKey(state.activeDomainId, activeSpace.id, tab.id)) ?? 0) > 0,
        ),
      }
    : workspace
  const visibleTagFilteredWorkspace = noteFilterRailVisibility.scratchpadOnlyFilterActive
    ? { ...tagFilteredWorkspace, tabs: [] }
    : tagFilteredWorkspace
  const activeHomeTagLocation: NoteLocation = {
    domainId: state.activeDomainId,
    spaceId: activeSpace.id,
    tabId: activeTab.id,
    subTabId: null,
  }
  const activeHomeTagCount = noteFilterIndex.noteCounts.get(buildNoteLocationKey(activeHomeTagLocation)) ?? 0
  const tagFilteredActiveTab = tagFilterActive
    ? {
        ...activeTab,
        subTabs: activeTab.subTabs.filter((subTab) => {
          const location: NoteLocation = {
            domainId: state.activeDomainId,
            spaceId: activeSpace.id,
            tabId: activeTab.id,
            subTabId: subTab.id,
          }
          return (noteFilterIndex.noteCounts.get(buildNoteLocationKey(location)) ?? 0) > 0
        }),
      }
    : activeTab
  const tagFilterControl = tagFilterActive ? (
    <NoteFilterControl
      open={noteFilterMenuOpen}
      kind={noteFilterKind}
      options={sortedNoteFilterOptions}
      selectedKeys={noteFilterSelectedKeys}
      sortMode={noteFilter.tags.sortMode}
      onToggleOpen={toggleTagFilterMenu}
      onClose={closeTagFilterMenu}
      onKindChange={setNoteFilterKind}
      onClear={clearCurrentNoteFilter}
      onToggleOption={toggleNoteFilterOption}
      onSortModeChange={setTagFilterSortMode}
    />
  ) : null
  const mainTopRailActions: NavigationRailAction[] = mainArrangementActive
    ? [
        {
          key: 'end-arrangement',
          label: 'arrangements',
          visibleLabel: arrangeTrashActionActive ? 'trash' : 'arrangements',
          sizeLabel: 'arrangements',
          selected: false,
          className: `btn btn-sm tab-btn topbar-action-btn topbar-context-btn topbar-arrange-trash-btn ${
            arrangeTrashActionActive ? 'is-trash-mode' : ''
          } ${isDraggingOverArrangeTrashDrop ? 'is-trash-drop-target' : ''}`,
          buttonRef: arrangeTrashDropRef,
          onClick: () => {
            if (isDraggingArrangeItem) return
            if (isGuidedArrangeCarryActive) {
              moveGuidedArrangeCarryToTrash()
              return
            }
            advanceArrangeHierarchyReveal()
          },
        },
      ]
    : []
  const renderTopRailControls = (viewForMenu: ViewMode = viewMode) => (
    <NavigationRailControls
      actions={
        viewForMenu === 'trash'
          ? [
              {
                key: 'trash-home',
                label: 'trash',
                ariaLabel: trashDragTargets.length > 0 ? 'delete' : 'trash',
                visibleLabel: trashDragTargets.length > 0 ? 'delete' : 'trash',
                sizeLabel: 'delete',
                selected: trashTabId === TRASH_HOME_ID,
                className: `btn btn-sm tab-btn topbar-action-btn topbar-context-btn topbar-arrange-trash-btn ${
                  trashDragTargets.length > 0 ? 'is-trash-mode' : ''
                } ${isTrashDropTargetActive ? 'is-trash-drop-target' : ''}`,
                buttonRef: arrangeTrashDropRef,
                onClick: openTrashHomeNote,
              },
            ]
          : mainTopRailActions
      }
      menuOpen={menuOpen}
      showCloseControl={mainArrangementActive || (viewForMenu === 'main' && tagFilterActive)}
      viewMode={viewForMenu}
      spaceRailVisible={state.ui.alwaysShowSpaces ?? false}
      domainRailVisible={state.ui.alwaysShowDomains ?? false}
      onCloseAction={() => {
        if (tagFilterActive) {
          exitTagFilterMode()
          return
        }
        exitArrangeMode()
      }}
      onSetMenuOpen={setMenuOpen}
      onToggleSpaceRail={toggleSpaceRailVisibility}
      onToggleDomainRail={toggleDomainRailVisibility}
      onToggleTrash={toggleTrashView}
      onOpenEtCetera={openEtCeteraView}
      onOpenFilter={openNoteFilterFromMenu}
      tagFilterControl={viewForMenu === 'main' ? tagFilterControl : null}
    />
  )
  const activeThemePalette = getThemePaletteForTheme(state.theme, state.ui.themePalettes)
  const activeThemeIsCustom = isCustomTheme(state.theme)
  const builtInThemeOverride = activeThemeIsCustom ? null : state.ui.themePalettes?.[state.theme] ?? null
  const themeStyleVariables = activeThemeIsCustom
    ? getCustomThemeCssVariables(activeThemePalette)
    : getBuiltInThemeOverrideCssVariables(state.theme, builtInThemeOverride)
  const customThemeClassName = getThemeShellCustomClassName(state.theme, activeThemePalette)
  const visibleMessages = (state.messages ?? []).filter((message) => message.status !== 'dismissed')
  const unreadMessages = visibleMessages.filter((message) => message.status === 'unread')
  const unresolvedMessageCount = unreadMessages.length
  const toastHistoryCount = state.toastHistory?.length ?? 0
  const storageAlerts = useMemo<StorageAlert[]>(
    () => buildStorageAlerts(unreadMessages, dismissedStorageAlertSignatures),
    [dismissedStorageAlertSignatures, unreadMessages],
  )
  const tipOverlaysVisible = shouldShowTipOverlays(viewMode)
  const storageAlertsVisible = shouldShowStorageAlerts(viewMode)
  const dismissStorageAlert = (signature: string) => {
    const message = unreadMessages.find((candidate) => (candidate.signature || candidate.id) === signature)
    if (message?.type === STORAGE_NOTEBOOK_RECOVERED_MESSAGE_TYPE) {
      acknowledgeMessage(message.id)
      return
    }
    setDismissedStorageAlertSignatures((currentSignatures) =>
      currentSignatures.includes(signature) ? currentSignatures : [...currentSignatures, signature],
    )
  }
  const handleStorageAlertAction = (signature: string) => {
    const message = unreadMessages.find((candidate) => (candidate.signature || candidate.id) === signature)
    if (message?.type === STORAGE_NOTEBOOK_RECOVERED_MESSAGE_TYPE) {
      acknowledgeMessage(message.id)
      void storageProfileController.revealRecoveredNotebookLocation({
        messageId: message.id,
        signature: message.signature,
      })
      return
    }
    setMessagesSection('inbox')
    openMessagesView()
  }
  const activeTableOfContentsPanels =
    tableOfContentsPanels?.noteBodyId === activeNoteBodyId ? tableOfContentsPanels : null
  const noteMentionMenu = noteMention.menu
  const noteMentionNavigatorRows = noteMention.navigatorRows
  const noteMentionSearchEntries = noteMention.searchEntries
  const noteMentionSearchActiveIndex = noteMention.activeSearchIndex
  const tagAutocompleteMenu = tagAutocomplete.menu
  return {
    shell: (
      <main
      className={`app-shell theme-${state.theme} ${customThemeClassName} view-${viewMode} ${mainArrangementActive ? 'tooltips-disabled' : ''}`}
      style={
        {
          '--tab-button-scale': String(state.ui.tabButtonScale),
          '--toolbar-button-scale': String(
            clampToolbarButtonScale(state.ui.toolbarButtonScale ?? DEFAULT_UI_SETTINGS.toolbarButtonScale ?? 1),
          ),
          '--note-font-scale': String(state.ui.noteFontScale),
          ...themeStyleVariables,
        } as CSSProperties
      }
    >
      {viewMode === 'main' && noteFilterRailVisibility.renderCompactDomainRail && (
        <CompactDomainRail
          domains={visibleTagFilteredDomains}
          activeDomainId={state.activeDomainId}
          editing={editing}
          arrangeMode={arrangeMode}
          arrangeableDomainClassName={arrangeableDomainClassName}
          draggingDomainId={draggingDomainId}
          guidedDestinationActive={Boolean(arrangeDestinationPrompt)}
          arrangeSelectedDomainIds={arrangeSelectedDomainIds}
          domainsGridRef={domainsGridRef}
          controlsSlot={topVisibleMainRail === 'domains' ? renderTopRailControls('main') : null}
          tooltipsDisabled={mainArrangementActive}
          arrangeControlsDisabled={arrangeControlsDisabled}
          tagFilterActive={tagFilterActive}
          getDomainLabel={(domain) =>
            appendVisibleNoteFilterCount(tagFilterActive, domain.name, noteFilterIndex.domainCounts.get(domain.id) ?? 0)
          }
          onOpenDomain={tagFilterActive ? openDomainFromTagFilter : openDomainFromCompactRail}
          onHandleArrangeDomainSelectionClick={handleArrangeDomainSelectionClick}
          onClearArrangeSelection={clearArrangeSelection}
          onOpenContextMenu={openContextMenuForDomain}
          onCancelArrangeMode={exitArrangeMode}
          onShouldSkipRenameBlur={shouldSkipRenameBlur}
          onCommitRename={commitRename}
          onCancelRename={cancelRename}
          onRenameDraftChange={trackRenameDraft}
          onBeginEdit={beginEdit}
          onAutoSizeRenameInput={autoSizeRenameInput}
          onClearRenameDraft={clearRenameDraft}
          onAddDomain={addDomainFromCompactRail}
          onOpenDomainSortModal={() => setModal({ type: 'sort-tabs', target: 'domains' })}
          onConsumeArrangeClickSuppression={consumeArrangeClickSuppression}
          onStartArrangeDragSeed={startArrangeDragSeed}
          onStartArrangeTapCandidate={startArrangeTapCandidate}
          onStartArrangePress={startArrangePress}
          onHandleArrangeDomainPointerMove={handleArrangeDomainPointerMove}
          onHandleArrangeDomainPointerUp={handleArrangeDomainPointerUp}
          onClearArrangePressTimer={clearArrangePressTimer}
          onCancelArrangeDomainPointerDrag={cancelArrangeDomainPointerDrag}
        />
      )}

      {viewMode === 'main' && noteFilterRailVisibility.renderCompactSpaceRail && (
        <CompactSpaceRail
          spaces={visibleTagFilteredSpaces}
          activeSpaceId={state.activeSpaceId}
          editing={editing}
          arrangeMode={arrangeMode}
          arrangeableSpaceClassName={arrangeableSpaceClassName}
          draggingSpaceId={draggingSpaceId}
          guidedDestinationActive={Boolean(
            arrangeDestinationPrompt && promptAllowsSpaceSelection(arrangeDestinationPrompt),
          )}
          arrangeSelectedSpaceIds={arrangeSelectedSpaceIds}
          spacesGridRef={spacesGridRef}
          controlsSlot={topVisibleMainRail === 'spaces' ? renderTopRailControls('main') : null}
          tooltipsDisabled={mainArrangementActive}
          arrangeControlsDisabled={arrangeControlsDisabled}
          tagFilterActive={tagFilterActive}
          getSpaceLabel={(space) =>
            appendVisibleNoteFilterCount(
              tagFilterActive,
              space.name,
              noteFilterIndex.spaceCounts.get(getNoteFilterSpaceKey(state.activeDomainId, space.id)) ?? 0,
            )
          }
          onOpenSpace={tagFilterActive ? openSpaceFromTagFilter : openSpaceFromCompactRail}
          onHandleArrangeSpaceSelectionClick={handleArrangeSpaceSelectionClick}
          onClearArrangeSelection={clearArrangeSelection}
          onOpenContextMenu={openContextMenuForSpace}
          onCancelArrangeMode={exitArrangeMode}
          onShouldSkipRenameBlur={shouldSkipRenameBlur}
          onCommitRename={commitRename}
          onCancelRename={cancelRename}
          onRenameDraftChange={trackRenameDraft}
          onBeginEdit={beginEdit}
          onAutoSizeRenameInput={autoSizeRenameInput}
          onClearRenameDraft={clearRenameDraft}
          onAddSpace={addSpaceFromCompactRail}
          onOpenSpaceSortModal={() => setModal({ type: 'sort-tabs', target: 'spaces' })}
          onConsumeArrangeClickSuppression={consumeArrangeClickSuppression}
          onStartArrangeDragSeed={startArrangeDragSeed}
          onStartArrangeTapCandidate={startArrangeTapCandidate}
          onStartArrangePress={startArrangePress}
          onHandleArrangeSpacePointerMove={handleArrangeSpacePointerMove}
          onHandleArrangeSpacePointerUp={handleArrangeSpacePointerUp}
          onClearArrangePressTimer={clearArrangePressTimer}
          onCancelArrangeSpacePointerDrag={cancelArrangeSpacePointerDrag}
        />
      )}

      {viewMode === 'trash' && (
        <>
          <TrashDomainRail
            domains={trashDomains}
            selectedDomainId={selectedTrashDomain?.id ?? null}
            trashSelectedDomainIds={trashSelectedDomainIds}
            domainsGridRef={domainsGridRef}
            controlsSlot={renderTopRailControls('trash')}
            onSelectDomain={(domainBucketId) => {
              if (consumeTrashClickSuppression()) return
              clearTrashSelection()
              const domain = trashDomains.find((candidate) => candidate.id === domainBucketId)
              if (domain?.source === 'live') {
                setState((previous) => setActiveDomain(previous, domain.domainId))
              }
              setTrashDomainId(domainBucketId)
              setTrashSpaceId('')
              setTrashTabId(TRASH_HOME_ID)
              setTrashSubTabId(null)
            }}
            onSelectDeletedDomain={(event, domain, orderedIds) =>
              handleTrashSelectionClick(
                'domain',
                domain.id,
                orderedIds,
                null,
                selectedTrashDomain?.id ?? null,
                getTrashSelectionClickModifiers(event),
                (replacementId) => {
                  setTrashDomainId(replacementId)
                  setTrashSpaceId('')
                  setTrashTabId(TRASH_HOME_ID)
                  setTrashSubTabId(null)
                },
              )
            }
            onOpenDeletedDomainContextMenu={(event, domain) => {
              if (domain.deletedDomainEntryId) {
                openContextMenuForTrashDomain(event, domain.deletedDomainEntryId, domain.domainId)
                return
              }
              openTrashSelectionContextMenu(event, 'domain', domain.id, null)
            }}
            onDeletedDomainPointerDown={(event, domain) => {
              const itemTargets = getTrashDomainTargets(domain)
              if (itemTargets.length === 0) return
              const selected = trashSelection.kind === 'domain' && trashSelection.ids.includes(domain.id)
              const selectedIds = selected ? trashSelection.ids : [domain.id]
              const targets = selected && selectedTrashTargets.length > 0 ? selectedTrashTargets : itemTargets
              startTrashDragCandidate(event, {
                kind: 'domain',
                scopeId: null,
                draggedId: domain.id,
                selectedIds,
                targets,
                label: domain.title,
                rail: domainsGridRef.current,
                selector: '[data-trash-domain-id]',
                attributeName: 'data-trash-domain-id',
                getLabel: (id) => trashDomains.find((entry) => entry.id === id)?.title,
              })
            }}
            onDeletedDomainPointerMove={handleTrashDragPointerMove}
            onDeletedDomainPointerUp={handleTrashDragPointerUp}
            onDeletedDomainPointerCancel={handleTrashDragPointerCancel}
          />
          {selectedTrashDomain && (
            <TrashSpaceRail
              spaces={trashSpaces}
              selectedSpaceId={selectedTrashSpace?.id ?? null}
              trashSelectedSpaceIds={trashSelectedSpaceIds}
              spacesGridRef={spacesGridRef}
              onSelectSpace={(spaceBucketId) => {
                if (consumeTrashClickSuppression()) return
                clearTrashSelection()
                const space = trashSpaces.find((candidate) => candidate.id === spaceBucketId)
                if (space?.source === 'live') {
                  setState((previous) => setActiveSpaceInActiveDomain(setActiveDomain(previous, space.domainId), space.spaceId))
                }
                setTrashSpaceId(spaceBucketId)
                setTrashTabId(TRASH_HOME_ID)
                setTrashSubTabId(null)
              }}
              onSelectDeletedSpace={(event, space, orderedIds) =>
                handleTrashSelectionClick(
                  'space',
                  space.id,
                  orderedIds,
                  selectedTrashDomain.id,
                  selectedTrashSpace?.id ?? null,
                  getTrashSelectionClickModifiers(event),
                  (replacementId) => {
                    setTrashSpaceId(replacementId)
                    setTrashTabId(TRASH_HOME_ID)
                    setTrashSubTabId(null)
                  },
                )
              }
              onOpenDeletedSpaceContextMenu={(event, space) => {
                if (space.source === 'live') {
                  openTrashSelectionContextMenu(event, 'space', space.id, selectedTrashDomain.id)
                  return
                }
                if (space.source === 'deleted-space' && !space.deletedSpaceEntryId) return
                openContextMenuForTrashSpace(event, {
                  source: space.source,
                  deletedSpaceEntryId: space.deletedSpaceEntryId ?? undefined,
                  deletedDomainEntryId: space.deletedDomainEntryId ?? undefined,
                  domainId: space.domainId,
                  spaceId: space.spaceId,
                })
              }}
              onDeletedSpacePointerDown={(event, space) => {
                const itemTargets = getTrashSpaceTargets(space)
                if (itemTargets.length === 0) return
                const selected =
                  trashSelection.kind === 'space' &&
                  trashSelection.scopeId === selectedTrashDomain.id &&
                  trashSelection.ids.includes(space.id)
                const selectedIds = selected ? trashSelection.ids : [space.id]
                const targets = selected && selectedTrashTargets.length > 0 ? selectedTrashTargets : itemTargets
                startTrashDragCandidate(event, {
                  kind: 'space',
                  scopeId: selectedTrashDomain.id,
                  draggedId: space.id,
                  selectedIds,
                  targets,
                  label: space.title,
                  rail: spacesGridRef.current,
                  selector: '[data-trash-space-id]',
                  attributeName: 'data-trash-space-id',
                  getLabel: (id) => trashSpaces.find((entry) => entry.id === id)?.title,
                })
              }}
              onDeletedSpacePointerMove={handleTrashDragPointerMove}
              onDeletedSpacePointerUp={handleTrashDragPointerUp}
              onDeletedSpacePointerCancel={handleTrashDragPointerCancel}
            />
          )}
        </>
      )}

      {(viewMode !== 'main' || noteFilterRailVisibility.renderParentRail) && (
        <TopBar
          viewMode={viewMode}
          workspace={visibleTagFilteredWorkspace}
          activeTab={activeTab}
          editing={editing}
          arrangeMode={arrangeMode}
          tooltipsDisabled={mainArrangementActive}
          tagFilterActive={tagFilterActive}
          tagFilterControl={topVisibleMainRail === 'parents' ? tagFilterControl : null}
          getTabLabel={(tab) =>
            appendVisibleNoteFilterCount(
              tagFilterActive,
              tab.title,
              noteFilterIndex.parentCounts.get(getNoteFilterParentKey(state.activeDomainId, activeSpace.id, tab.id)) ?? 0,
            )
          }
          showGlobalControls={
            viewMode === 'main'
              ? topVisibleMainRail === 'parents'
              : viewMode === 'trash'
                ? false
                : true
          }
          isDraggingArrangeItem={isDraggingArrangeItem}
          primaryTabRailRef={primaryTabRailRef}
          isNoteWorkspaceView={isNoteWorkspaceView}
          arrangeableParentTabClassName={arrangeableParentTabClassName}
          guidedParentRailTarget={guidedParentRailTarget}
          arrangeControlsDisabled={arrangeControlsDisabled}
          draggingParentTabId={draggingParentTabId}
          draggingSubTabId={draggingSubTabId}
          arrangeTrashDropRef={arrangeTrashDropRef}
          isArrangeTrashDropTarget={isDraggingOverArrangeTrashDrop}
          trashParentTabs={trashParentTabs}
          trashTabId={trashTabId}
          menuOpen={menuOpen}
          spaceRailVisible={state.ui.alwaysShowSpaces ?? false}
          domainRailVisible={state.ui.alwaysShowDomains ?? false}
          onAutoSizeRenameInput={autoSizeRenameInput}
          onShouldSkipRenameBlur={shouldSkipRenameBlur}
          onIsPendingCreatedRename={isPendingCreatedRename}
          onCommitRename={commitRename}
          onCancelRename={cancelRename}
          onRenameDraftChange={trackRenameDraft}
          onClearRenameDraft={clearRenameDraft}
          arrangeSelectedParentIds={arrangeSelectedParentIds}
          trashSelectedParentIds={trashSelectedParentIds}
          onHandleArrangeParentSelectionClick={handleArrangeParentSelectionClick}
          onHandleTrashParentSelectionClick={(event, trashParent, orderedIds) =>
            handleTrashSelectionClick(
              'parent',
              trashParent.id,
              orderedIds,
              selectedTrashSpace?.id ?? null,
              selectedTrashTab?.id ?? null,
              getTrashSelectionClickModifiers(event),
              (replacementId) => {
                const replacementParent = trashParentTabs.find((parent) => parent.id === replacementId) ?? null
                setTrashTabId(replacementId)
                setTrashSubTabId(getDefaultTrashSubTabIdForParent(replacementParent))
              },
            )
          }
          onConsumeTrashClickSuppression={consumeTrashClickSuppression}
          onClearArrangeSelection={clearArrangeSelection}
          onConsumeArrangeClickSuppression={consumeArrangeClickSuppression}
          onSelectTab={(tabId, event) => {
            if (tagFilterActive) {
              openParentFromTagFilter(tabId)
              return
            }
            selectParentTabFromTopBar(tabId, event)
          }}
          onBeginEdit={beginEdit}
          onOpenContextMenuForTab={openContextMenuForTab}
          onStartArrangeDragSeed={startArrangeDragSeed}
          onStartArrangeTapCandidate={startArrangeTapCandidate}
          onStartArrangePress={startArrangePress}
          onHandleArrangeTabPointerMove={handleArrangeTabPointerMove}
          onGuidedParentPointerMove={updateGuidedParentRailTarget}
          onGuidedParentPointerLeave={clearGuidedParentRailTarget}
          onHandleArrangeTabPointerUp={handleArrangeTabPointerUp}
          onClearArrangePressTimer={clearArrangePressTimer}
          onCancelArrangeTabPointerDrag={cancelArrangeTabPointerDrag}
          onSetTrashTabId={(tabId) => {
            clearTrashSelection()
            const trashParent = trashParentTabs.find((parent) => parent.id === tabId) ?? null
            setTrashTabId(tabId)
            setTrashSubTabId(getDefaultTrashSubTabIdForParent(trashParent))
          }}
          onSetTrashSubTabId={(subTabId) => {
            clearTrashSelection()
            setTrashSubTabId(subTabId)
          }}
          onOpenContextMenuForTrashTab={openContextMenuForTrashTab}
          onTrashParentPointerDown={(event, trashParent) => {
            const target = getTrashParentTarget(trashParent)
            const selected =
              trashSelection.kind === 'parent' &&
              trashSelection.scopeId === (selectedTrashSpace?.id ?? null) &&
              trashSelection.ids.includes(trashParent.id)
            const selectedIds =
              selected ? trashSelection.ids : [trashParent.id]
            const targets = selected && selectedTrashTargets.length > 0 ? selectedTrashTargets : [target]
            startTrashDragCandidate(event, {
              kind: 'parent',
              scopeId: selectedTrashSpace?.id ?? null,
              draggedId: trashParent.id,
              selectedIds,
              targets,
              label: trashParent.title,
              rail: primaryTabRailRef.current,
              selector: '[data-trash-parent-id]',
              attributeName: 'data-trash-parent-id',
              getLabel: (id) => trashParentTabs.find((entry) => entry.id === id)?.title,
            })
          }}
          onTrashParentPointerMove={handleTrashDragPointerMove}
          onTrashParentPointerUp={handleTrashDragPointerUp}
          onTrashParentPointerCancel={handleTrashDragPointerCancel}
          onAddTab={tagFilterActive ? () => undefined : addTab}
          tabRenameEnterBehavior={tabRenameEnterBehavior}
          onOpenParentSortModal={() => setModal({ type: 'sort-tabs', target: 'parents' })}
          onExitArrangeMode={exitArrangeMode}
          onAdvanceArrangeHierarchyReveal={advanceArrangeHierarchyReveal}
          onCloseSettingsView={closeSettingsView}
          onSetMenuOpen={setMenuOpen}
          onToggleSpaceRail={toggleSpaceRailVisibility}
          onToggleDomainRail={toggleDomainRailVisibility}
          onToggleTrash={toggleTrashView}
          onOpenMessages={openMessagesView}
          onOpenSettings={openSettingsView}
          onOpenEtCetera={openEtCeteraView}
          onOpenAbout={openAboutView}
          onOpenFilter={openNoteFilterFromMenu}
          settingsSection={settingsController.section}
          onSettingsSectionChange={settingsController.changeSection}
          onExitTagFilterMode={exitTagFilterMode}
          aboutSection={aboutSection}
          onAboutSectionChange={setAboutSection}
          messagesSection={messagesSection}
          messagesCount={unresolvedMessageCount}
          toastHistoryCount={toastHistoryCount}
          diagnosticLogCount={diagnosticLogEntries.length}
          onMessagesSectionChange={setMessagesSection}
        />
      )}

      {tabArrangeDragPreview && <TabArrangeDragPreviewOverlay preview={tabArrangeDragPreview} />}

      {trashDragPreview && <TrashRailDragPreviewOverlay preview={trashDragPreview} />}

      {arrangeDestinationPrompt && (
        <GuidedTabArrangeCarryPreview preview={arrangeDestinationPrompt.carriedPreview} />
      )}

      {viewMode === 'main' && domainArrangeDragPreview && (
        <CompactScopeDragPreview
          type="domain"
          preview={domainArrangeDragPreview}
          active={domainArrangeDragPreview.domainId === state.activeDomainId}
        />
      )}

      {viewMode === 'main' && spaceArrangeDragPreview && (
        <CompactScopeDragPreview
          type="space"
          preview={spaceArrangeDragPreview}
          active={spaceArrangeDragPreview.spaceId === state.activeSpaceId}
        />
      )}

      {viewMode === 'settings' ? (
        <SettingsPage
          state={state}
          section={settingsController.section}
          dataSection={settingsController.dataSection}
          visualsSection={settingsController.visualsSection}
          isMacPlatform={isMacPlatform}
          shortcutDrafts={settingsController.shortcutDrafts}
          newlineShortcutDrafts={settingsController.newlineShortcutDrafts}
          editingShortcut={settingsController.editingShortcut}
          settingsDaysDraft={settingsController.settingsDaysDraft}
          exportStatus={settingsController.exportStatus}
          importStatus={settingsController.importStatus}
          tabButtonScaleDraft={settingsController.tabButtonScaleDraft}
          noteFontScaleDraft={settingsController.noteFontScaleDraft}
          toolbarButtonScaleDraft={settingsController.toolbarButtonScaleDraft}
          selectedCustomTheme={settingsController.selectedCustomTheme}
          customThemePaletteDraft={settingsController.customThemePaletteDraft}
          alwaysShowSpacesDraft={settingsController.alwaysShowSpacesDraft}
          alwaysShowDomainsDraft={settingsController.alwaysShowDomainsDraft}
          tableAddTargetModeDraft={settingsController.tableAddTargetModeDraft}
          tableDeleteTargetModeDraft={settingsController.tableDeleteTargetModeDraft}
          tableOfContentsScopeDraft={settingsController.tableOfContentsScopeDraft}
          scratchpadAisleLimitDraft={settingsController.scratchpadAisleLimitDraft}
          scratchpadNewAisleSideDraft={settingsController.scratchpadNewAisleSideDraft}
          tabRenameEnterBehaviorDraft={settingsController.tabRenameEnterBehaviorDraft}
          trashDeleteForRealRequiresConfirmation={settingsController.trashDeleteForRealRequiresConfirmation}
          miscSyncedUiBooleanSettings={settingsController.miscSyncedUiBooleanSettings}
          frontmatterDraft={settingsController.frontmatterDraft}
          frontmatterDraftDirty={settingsController.frontmatterDraftDirty}
          toolbarLayouts={settingsController.toolbarLayouts}
          toolbarEditorLayoutId={settingsController.toolbarEditorLayoutId}
          toolbarEditorShowNames={settingsController.toolbarEditorShowNames}
          dataCapabilities={dataCapabilities}
          storageProfileStatus={storageProfileStatus}
          userSettingsLocationStatus={userSettingsLocationStatus}
          onDataSectionChange={settingsController.changeDataSection}
          onVisualsSectionChange={settingsController.changeVisualsSection}
          onToggleShortcutEdit={settingsController.toggleShortcutEdit}
          onNewlineShortcutChange={settingsController.updateNewlineShortcutSetting}
          onOpenShortcutMenuSettings={() => setModal({ type: 'shortcut-menu-settings' })}
          onAutoRemoveDaysChange={settingsController.updateAutoRemoveDaysSetting}
          onExportUserSettings={userSettingsTransferActions.exportUserSettings}
          onImportNotebook={notebookTransferActions.importNotebook}
          onImportUserSettings={userSettingsTransferActions.importUserSettings}
          onImportUserSettingsFromNotebookFolder={userSettingsTransferActions.importUserSettingsFromNotebookFolder}
          onRevealUserSettingsFolder={userSettingsLocationController.revealUserSettingsFolder}
          onResetUserSettingsFolder={userSettingsLocationController.resetUserSettingsFolder}
          onResetUserSettingsToDefaults={userSettingsTransferActions.resetUserSettingsToDefaults}
          onThemeChange={settingsController.updateThemeSetting}
          onSelectedCustomThemeChange={settingsController.updateSelectedCustomThemeSetting}
          onCustomThemePaletteChange={settingsController.updateCustomThemePaletteSetting}
          onCustomThemePaletteImport={settingsController.importCustomThemePaletteSetting}
          onCustomThemePaletteReset={settingsController.resetCustomThemePaletteSetting}
          onCustomThemePaletteSeedFromCurrentTheme={settingsController.seedCustomThemePaletteFromCurrentTheme}
          onTabButtonScaleChange={settingsController.updateTabButtonScaleSetting}
          onNoteFontScaleChange={settingsController.updateNoteFontScaleSetting}
          onToolbarButtonScaleChange={settingsController.updateToolbarButtonScaleSetting}
          onAlwaysShowSpacesChange={settingsController.updateAlwaysShowSpacesSetting}
          onAlwaysShowDomainsChange={(enabled) => {
            if (!settingsController.updateAlwaysShowDomainsSetting(enabled)) {
              pushToast(ALWAYS_SHOW_DOMAINS_WITHOUT_SPACES_MESSAGE, 'error')
            }
          }}
          onTableAddTargetModeChange={settingsController.updateTableAddTargetModeSetting}
          onTableDeleteTargetModeChange={settingsController.updateTableDeleteTargetModeSetting}
          onTableOfContentsScopeChange={settingsController.updateTableOfContentsScopeSetting}
          onScratchpadAisleLimitChange={settingsController.updateScratchpadAisleLimitSetting}
          onScratchpadNewAisleSideChange={settingsController.updateScratchpadNewAisleSideSetting}
          onTabRenameEnterBehaviorChange={settingsController.updateTabRenameEnterBehaviorSetting}
          onSyncedUiBooleanSettingChange={settingsController.updateSyncedUiBooleanSetting}
          onTipEnabledChange={settingsController.updateTipEnabledSetting}
          onSelectToolbarLayout={settingsController.selectToolbarLayoutForEditing}
          onCreateToolbarLayout={settingsController.createToolbarLayoutSetting}
          onDuplicateToolbarLayout={settingsController.duplicateToolbarLayoutSetting}
          onRenameToolbarLayout={settingsController.renameToolbarLayoutSetting}
          onDeleteToolbarLayout={settingsController.deleteToolbarLayoutSetting}
          onAddToolbarTool={settingsController.addToolbarToolSetting}
          onAddToolbarSpacer={settingsController.addToolbarSpacerSetting}
          onRemoveToolbarItem={settingsController.removeToolbarItemSetting}
          onMoveToolbarItem={settingsController.moveToolbarItemSetting}
          onMoveToolbarItemToIndex={settingsController.moveToolbarItemToIndexSetting}
          onToolbarEditorShowNamesChange={settingsController.updateToolbarEditorShowNamesSetting}
          onReadOnlyToolbarEditAttempt={() => pushToast('Duplicate the default or create a new layout to edit.')}
          onSettingsFrontmatterTemplateChange={settingsController.setSettingsFrontmatterTemplate}
          onCreateFrontmatterTemplate={settingsController.createFrontmatterTemplate}
          onUpdateFrontmatterTemplate={settingsController.updateFrontmatterTemplate}
          onDeleteFrontmatterTemplate={settingsController.deleteFrontmatterTemplate}
          onAddFrontmatterTemplateField={settingsController.addFrontmatterTemplateField}
          onUpdateFrontmatterTemplateField={settingsController.updateFrontmatterTemplateField}
          onDeleteFrontmatterTemplateField={settingsController.deleteFrontmatterTemplateField}
          onSaveFrontmatterTemplates={settingsController.saveFrontmatterTemplates}
          onDiscardFrontmatterTemplateChanges={settingsController.discardFrontmatterTemplateChanges}
          onCreateNotebook={openCreateNotebookModal}
          onRenameNotebook={openRenameNotebookModal}
          onOpenNotebook={storageProfileController.openNotebook}
          onSwitchNotebook={storageProfileController.switchNotebook}
          onForgetNotebook={storageProfileController.forgetNotebook}
          onMoveStorageProfile={storageProfileController.moveStorageProfile}
          onRevealStorageProfile={storageProfileController.revealStorageProfile}
          onRetryStorageProfile={storageProfileController.retryStorageProfile}
        />
      ) : (
        <>
          <SubTabRail
            viewMode={viewMode}
            activeTab={tagFilteredActiveTab}
            activeSubTabId={scratchpadWorkspaceActive ? null : activeSubTab?.id ?? null}
            editing={editing}
            arrangeMode={arrangeMode}
            tooltipsDisabled={mainArrangementActive}
            tagFilterActive={tagFilterActive}
            showNoteWorkspaceTabs={noteFilterRailVisibility.showNoteWorkspaceTabs}
            showHomeTab={!(tagFilterActive && activeHomeTagCount <= 0)}
            getHomeLabel={() => appendVisibleNoteFilterCount(tagFilterActive, 'home', activeHomeTagCount)}
            getSubTabLabel={(subTab) => {
              const location: NoteLocation = {
                domainId: state.activeDomainId,
                spaceId: activeSpace.id,
                tabId: activeTab.id,
                subTabId: subTab.id,
              }
              return appendVisibleNoteFilterCount(
                tagFilterActive,
                subTab.title,
                noteFilterIndex.noteCounts.get(buildNoteLocationKey(location)) ?? 0,
              )
            }}
            scratchpadTagCountLabel={getVisibleNoteFilterCountLabel(tagFilterActive, noteFilterIndex.scratchpadCount)}
            isNoteWorkspaceView={isNoteWorkspaceView}
            selectedTrashTab={selectedTrashTab}
            trashSubTabs={trashSubTabs}
            selectedTrashSubTabId={selectedTrashSubTab?.id ?? null}
            subTabRailRef={subTabRailRef}
            arrangeableSubTabClassName={arrangeableSubTabClassName}
            arrangeControlsDisabled={arrangeControlsDisabled}
            draggingSubTabId={draggingSubTabId}
            onAutoSizeRenameInput={autoSizeRenameInput}
            onShouldSkipRenameBlur={shouldSkipRenameBlur}
            onIsPendingCreatedRename={isPendingCreatedRename}
            onCommitRename={commitRename}
            onCancelRename={cancelRename}
            onRenameDraftChange={trackRenameDraft}
            onClearRenameDraft={clearRenameDraft}
            arrangeSelectedSubTabIds={arrangeSelectedSubTabIds}
            trashSelectedSubTabIds={trashSelectedSubTabIds}
            onHandleArrangeSubTabSelectionClick={handleArrangeSubTabSelectionClick}
            onHandleTrashSubTabSelectionClick={(event, trashParent, subTabId, orderedIds) =>
              handleTrashSelectionClick(
                'subtab',
                subTabId,
                orderedIds,
                trashParent.id,
                selectedTrashSubTab?.id ?? null,
                getTrashSelectionClickModifiers(event),
                (replacementId) => setTrashSubTabId(replacementId),
              )
            }
            onClearArrangeSelection={clearArrangeSelection}
            onConsumeArrangeClickSuppression={consumeArrangeClickSuppression}
            onSelectParentHomeTab={tagFilterActive ? selectParentHomeFromTagFilter : selectParentHomeTabFromRail}
            onSelectSubTab={tagFilterActive ? selectSubTabFromTagFilter : selectSubTabFromRail}
            onBeginEdit={beginEdit}
            onOpenContextMenuForHomeTab={openContextMenuForHomeTab}
            onOpenContextMenuForSubTab={openContextMenuForSubTab}
            onExitArrangeMode={exitArrangeMode}
            onStartArrangeDragSeed={startArrangeDragSeed}
            onStartArrangeTapCandidate={startArrangeTapCandidate}
            onStartArrangePress={startArrangePress}
            onFinalizeArrangeTapCandidate={finalizeArrangeTapCandidate}
            onHandleArrangeTabPointerMove={handleArrangeTabPointerMove}
            onHandleArrangeTabPointerUp={handleArrangeTabPointerUp}
            onClearArrangePressTimer={clearArrangePressTimer}
            onClearArrangeTapCandidate={clearArrangeTapCandidate}
            onCancelArrangeTabPointerDrag={cancelArrangeTabPointerDrag}
            onSetTrashSubTabId={(subTabId) => {
              if (consumeTrashClickSuppression()) return
              clearTrashSelection()
              setTrashSubTabId(subTabId)
            }}
            onOpenContextMenuForTrashTab={openContextMenuForTrashTab}
            onOpenContextMenuForTrashSubTab={openContextMenuForTrashSubTab}
            onTrashSubTabPointerDown={(event, trashParent, subTabId) => {
              const target = getTrashSubTabTarget(trashParent, subTabId)
              const selected =
                trashSelection.kind === 'subtab' &&
                trashSelection.scopeId === trashParent.id &&
                trashSelection.ids.includes(subTabId)
              const selectedIds =
                selected ? trashSelection.ids : [subTabId]
              const targets = selected && selectedTrashTargets.length > 0 ? selectedTrashTargets : [target]
              startTrashDragCandidate(event, {
                kind: 'subtab',
                scopeId: trashParent.id,
                draggedId: subTabId,
                selectedIds,
                targets,
                label: trashParent.subTabs.find((subTab) => subTab.id === subTabId)?.title ?? 'tab',
                rail: subTabRailRef.current,
                selector: '[data-trash-subtab-id]',
                attributeName: 'data-trash-subtab-id',
                getLabel: (id) => trashParent.subTabs.find((subTab) => subTab.id === id)?.title,
              })
            }}
            onTrashSubTabPointerMove={handleTrashDragPointerMove}
            onTrashSubTabPointerUp={handleTrashDragPointerUp}
            onTrashSubTabPointerCancel={handleTrashDragPointerCancel}
            onAddSubTab={() => {
              if (tagFilterActive) return
              setScratchpadActive(false)
              addSubTab()
            }}
            tabRenameEnterBehavior={tabRenameEnterBehavior}
            onOpenSubTabSortModal={() => setModal({ type: 'sort-tabs', target: 'subtabs' })}
            scratchpadActive={scratchpadWorkspaceActive}
            onOpenScratchpad={tagFilterActive ? openScratchpadFromTagFilter : openScratchpadFromRail}
            onOpenContextMenuForScratchpad={openContextMenuForScratchpad}
          />

          {isTrashHomeSelected ? (
            <TrashHomeNote
              onRestoreAll={() => setModal({ type: 'trash-restore-all' })}
              onDeleteAll={() => setModal({ type: 'trash-delete-all' })}
            />
          ) : viewMode === 'messages' ? (
            <MessagesView
              section={messagesSection}
              messages={state.messages ?? []}
              toastHistory={state.toastHistory ?? []}
              diagnosticDays={diagnosticLogDays}
              selectedDiagnosticDay={selectedDiagnosticDay}
              diagnosticEntries={diagnosticLogEntries}
              diagnosticLevelFilter={diagnosticLevelFilter}
              diagnosticDisplayLimit={diagnosticDisplayLimit}
              diagnosticMode={diagnosticMode}
              diagnosticCaptureEnabled={diagnosticCaptureEnabled}
              onDiagnosticDayChange={changeDiagnosticDay}
              onDiagnosticLevelFilterChange={setDiagnosticLevelFilter}
              onDiagnosticDisplayLimitChange={setDiagnosticDisplayLimit}
              onDiagnosticModeChange={setDiagnosticMode}
              onDiagnosticCaptureEnabledChange={setDiagnosticCaptureEnabled}
              onOpenDiagnosticsFolder={diagnosticsFolderAvailable ? openDiagnosticsFolder : undefined}
              onDismissMessage={dismissMessage}
              onOpenRecoveredNotebookLocation={openRecoveredNotebookLocationFromMessage}
              onOpenLocation={openMessageLocation}
            />
          ) : viewMode === 'about' ? (
            <AboutView section={aboutSection} />
          ) : viewMode === 'main' ? (
            <NoteWorkspace
              noteBodyId={activeNoteBodyId}
              aisles={activeNoteAisles}
              activeAisleId={resolvedActiveAisleId}
              editorReadOnly={editorReadOnly}
              arrangeModeActive={mainArrangementActive}
              frontmatterAisleIds={activeFrontmatterAisleIds}
              linkedAisleIds={activeLinkedAisleIds}
              wholeNoteLinked={activeNoteDuplicateCount > 1}
              scratchpadAisleControls={
                scratchpadWorkspaceActive
                  ? {
                      canDeleteActiveAisle: activeNoteAisles.length > 1,
                      onAddAisleLeft: () => {
                        closeEditorEphemeraRef.current()
                        addScratchpadAisle('', { placement: 'left-of-focus' })
                      },
                      onAddAisleRight: () => {
                        closeEditorEphemeraRef.current()
                        addScratchpadAisle('', { placement: 'right-of-focus' })
                      },
                      onDeleteActiveAisle: () => {
                        closeEditorEphemeraRef.current()
                        deleteScratchpadActiveAisle()
                      },
                    }
                  : undefined
              }
              aisleScrollRef={aisleScrollRef}
              toolbar={editorToolbarLayer.toolbar}
              headingPopover={editorToolbarLayer.popovers}
              imageToolsOverlay={renderImageToolsOverlay()}
              tableControlsOverlay={renderTableControlsOverlay()}
              arrangeDestinationPrompt={
                arrangeDestinationPrompt ? (
                  <ArrangeDestinationPrompt
                    message={getArrangeDestinationPromptMessage(arrangeDestinationPrompt.mode)}
                    onCancel={cancelArrangeDestinationPrompt}
                  />
                ) : null
              }
              tableOfContentsHeadingsByAisle={activeTableOfContentsPanels?.headingsByAisle ?? {}}
              tableOfContentsLinksByAisle={activeTableOfContentsPanels?.linksByAisle ?? {}}
              openTableOfContentsAisleIds={activeTableOfContentsPanels?.openAisleIds ?? new Set<string>()}
              aisleWidths={activeAisleWidths}
              onRootChange={(node) => {
                editorEventRootRef.current = node
              }}
              onExitArrangeMode={exitArrangeMode}
              onAisleScroll={(scrollLeft) => {
                if (!activeNoteBodyId) return
                aisleHorizontalScrollByBodyRef.current.set(activeNoteBodyId, scrollLeft)
              }}
              onActivateAisle={(editorKey) => {
                const targetAisleId = getAisleIdFromAisleEditorKey(editorKey)
                if (!targetAisleId || !activeAisleIdsRef.current.includes(targetAisleId) || isPendingCreatedRenameActive()) {
                  recordDiagnosticEvent('aisle', 'pointer-activation-blocked', {
                    level: 'warning',
                    details: {
                      editorKey,
                      targetAisleId,
                      activeAisleIds: activeAisleIdsRef.current,
                      pendingCreatedRename: isPendingCreatedRenameActive(),
                    },
                  })
                  return
                }
                pendingMouseAisleActivationRef.current = { aisleId: targetAisleId, settled: false }
                const shouldFocus = shouldFocusAislePointerActivation(activeAisleIdRef.current, targetAisleId)
                pendingFocusToAisleIdRef.current = null
                pendingCursorRestoreRef.current = null
                recordDiagnosticEvent('aisle', 'pointer-activation', {
                  details: {
                    editorKey,
                    targetAisleId,
                    previousAisleId: activeAisleIdRef.current,
                    shouldFocus,
                  },
                })
                activateAisleEditor(editorKey, {
                  flushPrevious: true,
                  focus: shouldFocus,
                  source: 'pointer',
                })
                syncActiveAisleSelection(targetAisleId)
                scheduleAisleFocusScroll(targetAisleId)
              }}
              onResizeAisleWidth={resizeAisleWidth}
              onResetAisleWidth={resetAisleWidth}
              onAisleWidthDragCommitted={() => showTip('aisle-width-reset')}
              mountedAisleIds={mountedAisleIds}
              suppressActiveAislePreviewFallback
              deferInactivePreviewFallbacks={activeNoteAisles.length > 4}
              getPreviewMarkdownForAisle={getPreviewMarkdownForAisle}
              onCloseTableOfContentsAisle={closeTableOfContentsAisle}
              onSelectTableOfContentsHeading={selectTableOfContentsHeading}
              onSelectTableOfContentsLink={selectTableOfContentsLink}
              onOpenTableOfContentsLink={openTableOfContentsLinkTarget}
              onOpenAisleFrontmatter={openFrontmatterModalForAisle}
              onOpenAisleLink={openLinkedAisleModal}
              onOpenTagFilter={openTagFilterForTag}
              onRegisterAislePaneRoot={registerAislePaneRoot}
              onRegisterAisleEditorRoot={registerAisleEditorRoot}
            />
          ) : viewMode === 'trash' ? (
            <TrashMarkdownPreview markdown={trashDisplay.markdown} />
          ) : (
            null
          )}
        </>
      )}

      {storageProfileStatus?.status === 'error' && (
        <div className="storage-status-banner" role="alert">
          <span>{storageProfileStatus.error ?? 'Notebook folder could not be loaded. Saves are paused.'}</span>
          <button type="button" className="btn btn-sm settings-action-btn" onClick={storageProfileController.revealStorageProfile}>
            reveal folder
          </button>
        </div>
      )}

      {shortcutMenu && (
        <ShortcutMenu
          top={shortcutMenu.top}
          left={shortcutMenu.left}
          operations={shortcutMenu.operations}
          activeIndex={Math.max(
            0,
            Math.min(shortcutMenu.operations.length - 1, shortcutMenuActiveIndex),
          )}
          onHighlight={setShortcutMenuActiveIndex}
          onRun={runShortcutOperationFromMenu}
        />
      )}

      {tagAutocompleteMenu && (
        <TagAutocompleteMenu
          top={tagAutocompleteMenu.top}
          left={tagAutocompleteMenu.left}
          suggestions={tagAutocompleteMenu.suggestions}
          activeIndex={tagAutocompleteMenu.activeIndex}
          onHighlight={tagAutocomplete.setActiveIndex}
          onChoose={tagAutocomplete.acceptSuggestion}
        />
      )}

      {noteMentionMenu && (
        <NoteMentionMenu
          top={noteMentionMenu.top}
          left={noteMentionMenu.left}
          query={noteMentionMenu.query.query}
          navigatorRows={noteMentionNavigatorRows}
          activeRow={noteMentionMenu.activeRow}
          searchEntries={noteMentionSearchEntries}
          searchEntryDetails={noteMention.searchEntryDetails}
          activeSearchIndex={noteMentionSearchActiveIndex}
          selectedSearchIndex={noteMention.selectedSearchIndex}
          searchAisleItems={noteMention.searchAisleItems}
          selectedSearchAisleId={noteMention.selectedSearchAisleId}
          preview={noteMention.preview}
          previewLayout={noteMention.previewLayout}
          selectorHeight={noteMention.selectorHeight}
          searchFocusStage={noteMention.searchFocusStage}
          keyboardFocusVisible={noteMention.keyboardFocusVisible}
          focusedAisleIndex={noteMention.focusedAisleIndex}
          focusedActionIndex={noteMention.focusedActionIndex}
          focusedConfirmIndex={noteMention.focusedConfirmIndex}
          pendingCopyAction={noteMention.pendingCopyAction}
          onActiveRowChange={noteMention.setActiveRow}
          onSelectNavigatorItem={noteMention.selectNavigatorItem}
          onSelectSearchResult={noteMention.selectSearchResult}
          onSelectSearchAisle={noteMention.selectSearchAisle}
          onHighlightSearch={noteMention.setActiveSearchIndex}
          onFocusAction={noteMention.setFocusedAction}
          onChooseAction={noteMention.chooseFocusedSearchAction}
          onConfirmCopyAction={noteMention.confirmPendingCopyAction}
          onCancelCopyAction={noteMention.cancelPendingCopyAction}
          onChooseSearchEntry={noteMention.chooseSearchEntry}
          onChooseTarget={noteMention.chooseTarget}
        />
      )}

      {findReplacePanel.open && (
        <FindReplacePanel
          replaceMode={findReplacePanel.replaceMode}
          focusRequestId={findReplacePanel.focusRequestId}
          query={findReplacePanel.query}
          replacement={findReplacePanel.replacement}
          scope={findReplacePanel.scope}
          caseSensitive={findReplacePanel.caseSensitive}
          wholeWord={findReplacePanel.wholeWord}
          regex={findReplacePanel.regex}
          queryError={findReplaceQueryError}
          matches={findReplaceMatches}
          activeIndex={Math.max(0, Math.min(findReplacePanel.activeIndex, Math.max(0, findReplaceMatches.length - 1)))}
          onReplaceModeChange={(replaceMode) => {
            setFindReplacePanel((current) => ({ ...current, replaceMode }))
            setState((previous) => ({
              ...previous,
              ui: {
                ...previous.ui,
                findReplaceMode: replaceMode ? 'replace' : 'find',
              },
            }))
          }}
          onQueryChange={(query) => {
            setFindReplacePanel((current) => ({ ...current, query, activeIndex: 0 }))
            if (query.trim()) savePartialDeviceSettings({ lastFindQuery: query })
          }}
          onReplacementChange={(replacement) => setFindReplacePanel((current) => ({ ...current, replacement }))}
          onScopeChange={(scope) => {
            setFindReplacePanel((current) => ({ ...current, scope, activeIndex: 0 }))
            setState((previous) => ({
              ...previous,
              ui: {
                ...previous.ui,
                findReplaceScope: scope,
              },
            }))
          }}
          onCaseSensitiveChange={(caseSensitive) => {
            setFindReplacePanel((current) => ({ ...current, caseSensitive, activeIndex: 0 }))
            setState((previous) => ({
              ...previous,
              ui: {
                ...previous.ui,
                findCaseSensitive: caseSensitive,
              },
            }))
          }}
          onWholeWordChange={(wholeWord) => {
            setFindReplacePanel((current) => ({ ...current, wholeWord, activeIndex: 0 }))
            setState((previous) => ({
              ...previous,
              ui: {
                ...previous.ui,
                findWholeWord: wholeWord,
              },
            }))
          }}
          onRegexChange={(regex) => {
            setFindReplacePanel((current) => ({ ...current, regex, activeIndex: 0 }))
            setState((previous) => ({
              ...previous,
              ui: {
                ...previous.ui,
                findRegex: regex,
              },
            }))
          }}
          onPrevious={() => moveFindReplaceMatch(-1)}
          onNext={() => moveFindReplaceMatch(1)}
          onSelectMatch={setFindReplaceActiveIndex}
          onReplaceCurrent={() => applyFindReplacement('current')}
          onReplaceAll={() => applyFindReplacement('all')}
          onClose={() => setFindReplacePanel((current) => ({ ...current, open: false }))}
        />
      )}

      <ContextMenuHost
        contextMenu={contextMenu}
        canDeleteSpace={canDeleteSpace}
        canDeleteDomain={canDeleteDomain}
        duplicateCount={getCurrentDuplicateCount()}
        tagFilterActive={tagFilterActive}
        onClose={() => closeEditorEphemeraRef.current()}
        onEnterArrangeMode={enterArrangeModeFromContext}
        onDuplicateSpace={duplicateSpaceFromContext}
        onRenameSpace={beginRenameSpaceFromContext}
        onRenameDomain={beginRenameDomainFromContext}
        onCopyImage={() => {
          setContextMenu(null)
          void copySelectedImageToClipboard()
        }}
        onRevealMediaFile={revealMediaFileFromContext}
        onOpenInternalNoteLink={openInternalNoteLinkFromContext}
        onRenameInternalNoteLink={renameInternalNoteLinkFromContext}
        onOpenDeduplicateModal={openDeduplicateModalFromContext}
        onOpenCopyModal={() => {
          if (contextMenu?.type === 'editor') {
            closeEditorEphemeraRef.current()
            if (scratchpadWorkspaceActive) {
              pushToast('Scratchpad cannot be used as a copy source.', 'warning')
              return
            }
            openCopyModalForActiveNote()
            return
          }
          openCopyModalFromContext()
        }}
        onMoveToTrash={deleteFromContext}
        onRestoreFromTrash={restoreTrashTargetsFromContext}
        onDeleteFromTrash={deleteTrashTargetsFromContext}
        trashContextTargetCount={Math.max(1, trashContextTargets.length)}
        onEditorClipboard={runEditorContextClipboardAction}
        onEditorCommand={runEditorContextCommand}
        onEditorInsertLink={openEditorContextLinkModal}
        onEditorInsertAisle={insertAisleFromEditorContext}
        onEditorInsertAttachment={insertAttachmentFromEditorContext}
        onEditorFindReplace={openFindReplacePanel}
        onEditorOpenContextLink={openEditorContextLink}
        onEditorEditContextLink={editEditorContextLink}
        onEditorReplaceMisspelling={replaceEditorMisspellingFromContext}
        onEditorAddWordToDictionary={addEditorWordToDictionaryFromContext}
        onEditorLookUpSelection={lookUpEditorSelectionFromContext}
        onRevealNoteLocation={revealNoteLocationFromEditorContext}
        editorNoteRevealLabel={editorNoteRevealLabel}
        onOpenScratchpadAbout={openScratchpadAboutModal}
        copyAsMenu={copyAsMenu}
        onCopyAs={copyContextMenuItemAs}
        onCopyAsUnavailable={(message) => {
          closeEditorEphemeraRef.current()
          pushToast(message, 'warning')
        }}
      />

      <ModalHost
        modal={modal}
        state={state}
        activeSpace={activeSpace}
        domainsForPickers={domainsForPickers}
        shortcutMenuOperations={settingsController.shortcutMenuOperationsDraft}
        onModalChange={setModal}
        onShortcutMenuOperationsChange={settingsController.updateShortcutMenuOperationsSetting}
        onEditFrontmatterTemplate={openFrontmatterTemplateSettings}
        onWarn={(message) => pushToast(message, 'warning')}
        onError={(message) => pushToast(message, 'error')}
        onApplyTabSort={applyArrangeTabSort}
        onLinkInsertModeChange={setLastLinkInsertMode}
        onNoteCopyModeChange={(mode: NoteCopyMode) => setLastNoteCopyMode(mode)}
        onDeduplicateKeepDataChange={setDecoupledItemsKeepData}
        onPasteSyncedNoteAsAisle={pasteSyncedNoteAsAisleFromModal}
        onOpenSyncedFilter={openSyncedFilterFromLinkedModal}
        onOpenFrontmatterFilter={openFrontmatterFilterFromModal}
        onChooseNotebookLocation={storageProfileController.chooseNotebookLocation}
        onConfirm={confirmModal}
      />

      <AisleEditModal
        open={aisleEditModalOpen && viewMode === 'main'}
        aisles={activeNoteAisles}
        linkedAisleIds={activeLinkedAisleIds}
        frontmatterAisleIds={activeFrontmatterAisleIds}
        maxAisles={scratchpadWorkspaceActive ? getScratchpadAisleLimit() : MAX_NOTE_AISLES}
        maxAislesWarningMessage={
          scratchpadWorkspaceActive
            ? 'Scratchpad aisle limit reached. You can raise it to 40 in misc settings.'
            : MAX_AISLE_WARNING_MESSAGE
        }
        reclaimEmptyAisleAtLimit={scratchpadWorkspaceActive}
        onCancel={closeAisleEditModal}
        onApply={applyAisleEditDraftToActiveNote}
        onWarn={(message) => pushToast(message, 'warning')}
      />

      {tipOverlaysVisible && <TipHost tips={visibleTipDefinitions} onDismissTip={dismissTip} />}
      <AppTooltipLayer disabled={mainArrangementActive} />
      {storageAlertsVisible && (
        <StorageAlertHost
          alerts={storageAlerts}
          onDismissAlert={dismissStorageAlert}
          onAlertAction={handleStorageAlertAction}
        />
      )}

      <ToastHost
        toasts={toasts}
        onToastMouseEnter={pauseToastDismissals}
        onToastMouseLeave={resumeToastDismissals}
      />

      </main>
    ),
  }
}
