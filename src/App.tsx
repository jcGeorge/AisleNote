import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Editor } from '@toast-ui/editor'
import { TextSelection } from 'prosemirror-state'
import '@toast-ui/editor/dist/toastui-editor.css'
import './App.css'
import { useActiveNoteModel } from './app/useActiveNoteModel'
import {
  getArrangeDestinationPromptMessage,
  promptAllowsSpaceSelection,
  type ArrangeDestinationPromptState,
} from './arrange/arrange-guided-prompt'
import {
  areArrangeRailControlsDisabled,
  areNavigationContextMenusDisabled,
  getArrangeInteractionState,
  isArrangeGuidedCarryActive,
  isArrangeLiveDragActive,
  isArrangeTrashActionActive,
} from './arrange/arrange-interaction-state'
import {
  resolveArrangeDomainDestination,
  resolveArrangeHierarchyDrop,
  resolveArrangePromptDomainConfirmation,
  resolveArrangePromptSpaceSelection,
  type ArrangeGuidedTransferResolution,
} from './arrange/arrange-guided-transfer'
import {
  moveHierarchyDropRequestItemToTrash,
  moveParentTabsToSpace,
  moveSubTabsToParentInSpace,
} from './arrange/arrange-hierarchy'
import { sortNamedItems, sortSubTabs, sortTabs } from './arrange/tab-sort'
import { useArrangeMode } from './arrange/useArrangeMode'
import { getToggledRailVisibilitySettings, type RailVisibilityTarget } from './navigation/rail-visibility'
import { ImageToolsOverlay } from './components/editor/ImageToolsOverlay'
import { FindReplacePanel } from './components/editor/FindReplacePanel'
import { LegacyEditorShell } from './components/editor/LegacyEditorShell'
import { NoteMentionMenu } from './components/editor/NoteMentionMenu'
import { ShortcutMenu } from './components/editor/ShortcutMenu'
import { TableControlsOverlay } from './components/editor/TableControlsOverlay'
import { getFindReplaceShortcutMode } from './components/editor/find-replace-shortcuts'
import {
  getShortcutMenuKeyboardAction,
  isShortcutMenuKeyboardKey,
} from './components/editor/shortcut-menu-keyboard'
import { AisleEditModal } from './components/notes/AisleEditModal'
import { NoteWorkspace } from './components/notes/NoteWorkspace'
import { scrollAislePaneIntoHorizontalView } from './components/notes/aisle-horizontal-scroll'
import { SubTabRail } from './components/navigation/SubTabRail'
import {
  CompactDomainRail,
  CompactScopeDragPreview,
  CompactSpaceRail,
  TrashDomainRail,
  TrashSpaceRail,
} from './components/navigation/CompactScopeRails'
import { NavigationRailControls, type NavigationRailAction } from './components/navigation/NavigationRailControls'
import {
  GuidedTabArrangeCarryPreview,
  TabArrangeDragPreviewOverlay,
} from './components/navigation/TabArrangeDragPreviewOverlay'
import { TopBar } from './components/navigation/TopBar'
import { ArrangeDestinationPrompt } from './components/overlays/ArrangeDestinationPrompt'
import { ContextMenuHost } from './components/overlays/ContextMenuHost'
import { ModalHost } from './components/overlays/ModalHost'
import { TipHost } from './components/overlays/TipHost'
import { ToastHost } from './components/overlays/ToastHost'
import { appendToastToStack } from './components/overlays/toast-stack'
import { SettingsPage } from './components/settings/SettingsPage'
import { StageManagerView } from './components/stage-manager/StageManagerView'
import { TrashHomeNote } from './components/trash/TrashHomeNote'
import { applyListToolbarCommand, type ToolbarListCommand } from './editor/list-marker-commands'
import { applyEditorNewlineOperation } from './editor/newline-operations'
import {
  finishEditorOperation,
  insertEditorTextOperation,
  runEditorCommandOperation,
  type EditorOperationRuntime,
} from './editor/editor-operation-runner'
import { closeEditorEphemera, type CloseEditorEphemeraOptions } from './editor/editor-ephemera'
import { MAX_AISLE_WARNING_MESSAGE } from './editor/aisle-edit-draft'
import { getAisleIdFromAisleEditorKey } from './editor/aisle-editor'
import { shouldFocusAislePointerActivation } from './editor/aisle-activation'
import { useAisleController } from './editor/useAisleController'
import { useLegacyEditor } from './editor/useLegacyEditor'
import { isHeadingCollapsed, setHeadingCollapsed } from './editor/heading-collapse-state'
import {
  TABLE_OF_CONTENTS_EMPTY_MESSAGE,
  buildTableOfContentsPanels,
  type TableOfContentsPanelsState,
} from './editor/table-of-contents'
import type { TableOfContentsLinkItem } from './editor/table-of-contents-links'
import {
  getCommandCapableEditor,
  collectProseMirrorTextPositions,
  getWysiwygView,
  runWysiwygHistory,
  type WysiwygHistoryDirection,
  type WysiwygHistoryResult,
} from './editor/prosemirror-utils'
import { useAisleEditors } from './editor/useAisleEditors'
import { useEditorDomEvents } from './editor/useEditorDomEvents'
import { useEditorPersistence } from './editor/useEditorPersistence'
import { useEditorToolbarLayer } from './editor/useEditorToolbarLayer'
import { useEditorToolbarState } from './editor/useEditorToolbarState'
import { DEFAULT_TOOLBAR_LAYOUT_ID, resolveToolbarLayout } from './editor/toolbar-layouts'
import { useImageTools } from './editor/useImageTools'
import { useTableControls } from './editor/useTableControls'
import { selectFirstTableCellAfterPosition } from './editor/table-editing'
import { clearEditorMarkdownForDisplay, getEditorMarkdownForPersistence, setEditorMarkdownForDisplay } from './editor/editor-markdown-display'
import type { MultiLineHeadingLevel } from './editor/multiline-format-operations'
import type { MultiLineListOperation } from './editor/multiline-list-operations'
import { useMultilineEditing } from './editor/useMultilineEditing'
import { useNoteCursorPersistence, usePendingNoteCursorRestore } from './editor/useNoteCursorPersistence'
import {
  COMPLETED_TASK_UNDO_HINT_COOLDOWN_MS,
  COMPLETED_TASK_UNDO_HINT_DETECTION_MS,
} from './editor/task-behavior'
import { exportAppData, type ExportScope } from './export/export-data'
import { buildFrontmatterModalDraftForAisle } from './frontmatter/frontmatter-state'
import { useGlobalHotkeys } from './hotkeys/useGlobalHotkeys'
import { normalizeMarkdownForPersistence } from './markdown/markdown-utils'
import { importBlobAsAssetUrl } from './markdown/image-asset-registry'
import { useNavigationHistory } from './navigation/useNavigationHistory'
import { useAppNavigationActions } from './navigation/useAppNavigationActions'
import {
  clearRenameDraftIfMatching,
  createRenameDraft,
  type RenameDraft,
  type RenameEntityType,
} from './navigation/rename-draft'
import { buildNoteLocationKey, getLocationInfo, listNoteLocationsForBody } from './notes/note-locations'
import { getLinkedAisleIdsForNoteBody } from './notes/aisle-links'
import { openExternalWebUrl } from './notes/external-links'
import { escapeMarkdownLinkLabel } from './notes/note-references'
import { getNoteCopyCreatedToast } from './notes/copy-reference-labels'
import {
  buildDefaultNoteReferenceDraft,
  buildExternalLinkEditDraft,
  buildInternalNoteLinkEditDraft,
} from './notes/note-reference-model'
import {
  buildCopyAsClipboardData,
  getCopyAsAisleIdForNoteContext,
  getCopyAsSuccessMessage,
  isCopyAsClipboardTextMarker,
  parseCopyAsTextMarker,
  readCopyAsPayloadFromClipboard,
  type CopyAsAction,
  type CopyAsClipboardPayload,
  type CopyAsScope,
  writeCopyAsClipboardData,
} from './notes/copy-as-clipboard'
import { buildCopyAsPasteCommand, getNoteBodyPreviewMarkdowns } from './notes/note-reference-commands'
import { useNoteMentionController } from './notes/useNoteMentionController'
import { applyNoteCopyToState } from './notes/note-copy-service'
import { getAisleBodyId } from './notes/note-markdown'
import { getAisleMarkdown } from './notes/aisle-body-state'
import {
  applyFindReplacementToState,
  findVisibleMatches,
  getFindReplaceQueryError,
  type FindReplaceScope,
} from './notes/find-replace'
import { useNoteReferenceActions } from './notes/useNoteReferenceActions'
import { formatMovedToTrashToast, useAppOverlayActions } from './overlays/useAppOverlayActions'
import { decoupleNoteLocationsInState } from './overlays/note-decouple'
import { measureSlowOperation } from './performance/performance-logging'
import {
  ALWAYS_SHOW_DOMAINS_WITHOUT_SPACES_MESSAGE,
  getCustomThemePaletteSeedMatch,
  getThemePaletteForTheme,
  isCustomTheme,
  isThemePaletteSeed,
} from './settings/defaults'
import { useSettingsController } from './settings/useSettingsController'
import { applyAutoPurgeToAppState, ensureNoteBodiesForAppState } from './state/app-state'
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
} from './state/domains'
import {
  createTab,
  createSpace,
  MAX_NOTE_AISLES,
} from './state/workspace'
import { collectAppNavigationEntityIds, createReservedIdAllocator } from './state/navigation-ids'
import { useStageManagerController } from './stage-manager/useStageManagerController'
import { usePersistentAppState } from './storage/usePersistentAppState'
import {
  loadDeviceSettings,
  saveActiveToolbarLayoutId,
  saveDeviceLastOpened,
  savePartialDeviceSettings,
  type DeviceSettings,
} from './storage/device-settings-store'
import { useStorageProfileController } from './storage/useStorageProfileController'
import { getTipDefinition } from './tips/tips'
import { TRASH_HOME_ID } from './trash/trash-model'
import { useTrashSelection } from './trash/useTrashSelection'
import type {
  AppState,
  ArrangeHierarchyDropRequest,
  ArrangeInsertPosition,
  ContextMenuState,
  InternalNoteLinkEdit,
  LinkEditRange,
  LinkInsertMode,
  ModalState,
  MultiLineInlineFormat,
  NewlineOperationId,
  NoteCopyMode,
  NoteLocation,
  NoteNavigationTarget,
  PendingCreatedEdit,
  TabSortMode,
  TabSortTarget,
  TabArrangeDragPreview,
  TipId,
  ToastState,
  ToastTone,
  ViewMode,
  WorkspaceData,
} from './types/app'
import type { AppStateSnapshotMode } from './storage/persistence-debounce'

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
}

type CopyAsMenuState = {
  note: Record<CopyAsAction, CopyAsMenuItemState>
  aisle?: Record<CopyAsAction, CopyAsMenuItemState>
}

const COPY_AS_MENU_ACTIONS: CopyAsAction[] = ['copy', 'duplicate', 'link', 'preview']

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

const DEFAULT_TOAST_DURATION_MS = 3000
const HOVERED_TOAST_DURATION_MS = 2000

type EditableEntityType = 'tab' | 'subtab' | 'space' | 'domain'

let renameInputMeasureContext: CanvasRenderingContext2D | null = null

function getCurrentTimestamp() {
  return Date.now()
}

function App() {
  const initialDeviceSettingsRef = useRef<DeviceSettings | null>(null)
  if (initialDeviceSettingsRef.current === null) {
    initialDeviceSettingsRef.current = loadDeviceSettings()
  }
  const { state, setState, stateRef, flushPendingPersistence, commitAppStateNow } = usePersistentAppState()
  const [viewMode, setViewMode] = useState<ViewMode>(() => initialDeviceSettingsRef.current?.lastOpened?.viewMode ?? 'main')
  const [editing, setEditing] = useState<{ type: EditableEntityType; id: string } | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [modal, setModal] = useState<ModalState | null>(null)
  const [shortcutMenu, setShortcutMenu] = useState<ShortcutMenuState | null>(null)
  const [shortcutMenuActiveIndex, setShortcutMenuActiveIndex] = useState(0)
  const [tableOfContentsPanels, setTableOfContentsPanels] = useState<TableOfContentsPanelsState | null>(null)
  const [findReplacePanel, setFindReplacePanel] = useState<FindReplacePanelState>({
    open: false,
    replaceMode: state.ui.findReplaceMode === 'replace',
    focusRequestId: 0,
    query: initialDeviceSettingsRef.current?.lastFindQuery ?? '',
    replacement: '',
    scope: 'note',
    caseSensitive: state.ui.findCaseSensitive ?? false,
    wholeWord: state.ui.findWholeWord ?? false,
    regex: state.ui.findRegex ?? false,
    activeIndex: 0,
  })
  const [arrangeDestinationPrompt, setArrangeDestinationPrompt] =
    useState<ArrangeDestinationPromptState | null>(null)
  const [guidedParentRailTarget, setGuidedParentRailTarget] =
    useState<{ targetId: string; position: ArrangeInsertPosition | null } | null>(null)
  const isMacPlatform = typeof navigator !== 'undefined' ? /mac/i.test(navigator.platform) : false
  const [menuOpen, setMenuOpen] = useState(false)
  const [trashDomainId, setTrashDomainId] = useState<string>('')
  const [trashSpaceId, setTrashSpaceId] = useState<string>('')
  const [trashTabId, setTrashTabId] = useState<string>(TRASH_HOME_ID)
  const [trashSubTabId, setTrashSubTabId] = useState<string | null>(null)
  const [activeAisleId, setActiveAisleId] = useState<string>('')
  const [activeToolbarLayoutId, setActiveToolbarLayoutIdState] = useState<string>(
    () => initialDeviceSettingsRef.current?.activeToolbarLayoutId ?? DEFAULT_TOOLBAR_LAYOUT_ID,
  )
  const [toasts, setToasts] = useState<ToastState[]>([])
  const [visibleTips, setVisibleTips] = useState<TipId[]>([])

  const editorMountRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<Editor | null>(null)
  const aisleScrollRef = useRef<HTMLDivElement | null>(null)
  const aisleHorizontalScrollByBodyRef = useRef<Map<string, number>>(new Map())
  const pendingScrollToAisleIdRef = useRef<string | null>(null)
  const pendingFocusToAisleIdRef = useRef<string | null>(null)
  const pendingNavigationHeadingRef = useRef<NonNullable<NoteNavigationTarget['heading']> | null>(null)
  const pendingNavigationAisleIdRef = useRef<string | null>(null)
  const pendingNavigationTopAisleIdRef = useRef<string | null>(null)
  const editorEventRootRef = useRef<HTMLElement | null>(null)
  const closeShortcutMenuRef = useRef<(options?: { restoreEditorFocus?: boolean }) => void>(() => {})
  const runShortcutOperationFromMenuRef = useRef<(operation: NewlineOperationId) => void>(() => {})
  const deleteNotePreviewRef = useRef<(tokenId: string) => void>(() => {})
  const pendingCreatedEditRef = useRef<PendingCreatedEdit | null>(null)
  const editingRef = useRef<{ type: EditableEntityType; id: string } | null>(null)
  const renameDraftRef = useRef<RenameDraft | null>(null)
  const skipRenameBlurRef = useRef<{ type: EditableEntityType; id: string } | null>(null)
  const toastTimersRef = useRef<Map<number, number>>(new Map())
  const toastHoveredRef = useRef(false)
  const toastIdRef = useRef(0)
  const toastsRef = useRef<ToastState[]>([])
  const closeImageToolsRef = useRef<() => void>(() => {})
  const closeImageToolsIfSelectedImageMissingRef = useRef<() => void>(() => {})
  const closeTableControlsRef = useRef<() => void>(() => {})
  const closeEditorEphemeraRef = useRef<(options?: CloseEditorEphemeraOptions) => void>(() => {})
  const activateAisleEditorRef = useRef<
    (
      editorKey: string,
      options?: { focus?: boolean; flushPrevious?: boolean; allowDuringPendingRename?: boolean },
    ) => boolean
  >(() => false)
  const completedTaskDeleteUndoCandidateRef = useRef<{ beforeMarkdown: string; deletedAt: number } | null>(null)
  const completedTaskUndoToastAtRef = useRef(0)
  const dismissedTipIdsThisSessionRef = useRef<Set<TipId>>(new Set())
  const activeSpaceIdRef = useRef<string>('')
  const activeDomainIdRef = useRef<string>('')
  const activeTabIdRef = useRef<string>('')
  const activeSubTabIdRef = useRef<string | null>(null)
  const activeAisleIdRef = useRef<string>('')
  const activeNoteLocationKeyRef = useRef<string>('')
  const isMainViewRef = useRef(true)
  const flushStorageActionStateRef = useRef<
    (options?: { snapshotMode?: Extract<AppStateSnapshotMode, 'force' | 'skip'> }) => Promise<void> | void
  >(() => {})

  function clearToastTimer(toastId: number) {
    const timer = toastTimersRef.current.get(toastId)
    if (timer === undefined) return
    window.clearTimeout(timer)
    toastTimersRef.current.delete(toastId)
  }

  function clearToastTimers() {
    toastTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    toastTimersRef.current.clear()
  }

  function dismissToast(toastId: number) {
    clearToastTimer(toastId)
    setToasts((currentToasts) => {
      const nextToasts = currentToasts.filter((toast) => toast.id !== toastId)
      toastsRef.current = nextToasts
      return nextToasts
    })
  }

  function scheduleToastDismiss(toastId: number, durationMs: number) {
    clearToastTimer(toastId)
    const timer = window.setTimeout(() => dismissToast(toastId), durationMs)
    toastTimersRef.current.set(toastId, timer)
  }

  function createToastId() {
    const id = Math.max(getCurrentTimestamp(), toastIdRef.current + 1)
    toastIdRef.current = id
    return id
  }

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

  useEffect(() => () => {
    toastTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    toastTimersRef.current.clear()
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
  })
  const activeNoteLocations = useMemo(
    () => (activeNoteBodyId ? listNoteLocationsForBody(state, activeNoteBodyId) : []),
    [activeNoteBodyId, state],
  )
  const activeNoteDuplicateCount = activeNoteLocations.length
  const contextMenuNoteLocation = useMemo<NoteLocation | null>(() => {
    if (!contextMenu) return null
    if (contextMenu.type === 'editor') return activeNoteLocation
    if (contextMenu.type !== 'tab' && contextMenu.type !== 'subtab' && contextMenu.type !== 'home-tab') return null
    return {
      domainId: state.activeDomainId,
      spaceId: activeSpace.id,
      tabId: contextMenu.tabId,
      subTabId: contextMenu.type === 'subtab' ? contextMenu.subTabId : null,
    }
  }, [activeNoteLocation, activeSpace.id, contextMenu, state.activeDomainId])
  const copyAsMenu = useMemo<CopyAsMenuState | null>(() => {
    const source = contextMenuNoteLocation
    if (!source) return null
    const info = getLocationInfo(state, source)
    const body = info.noteBodyId ? state.noteBodies.find((candidate) => candidate.id === info.noteBodyId) ?? null : null
    if (!body) return null
    const missingReason = 'note not found.'
    const notePreviewReason = 'copy a specific aisle as preview for notes with multiple aisles.'
    const note = Object.fromEntries(
      COPY_AS_MENU_ACTIONS.map((action) => [
        action,
        {
          available: action !== 'preview' || body.aisles.length <= 1,
          reason: action === 'preview' && body.aisles.length > 1 ? notePreviewReason : missingReason,
        },
      ]),
    ) as Record<CopyAsAction, CopyAsMenuItemState>

    if (body.aisles.length <= 1) return { note }
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
  }, [activeNoteLocation, contextMenuNoteLocation, resolvedActiveAisleId, state])
  const findReplaceMatches = useMemo(
    () =>
      findReplacePanel.open
        ? findVisibleMatches(
            state,
            activeNoteLocation,
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
      activeNoteLocation,
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

  useEffect(() => {
    setFindReplacePanel((current) => {
      if (current.open) return current
      const caseSensitive = state.ui.findCaseSensitive ?? false
      const wholeWord = state.ui.findWholeWord ?? false
      const regex = state.ui.findRegex ?? false
      const replaceMode = state.ui.findReplaceMode === 'replace'
      return current.caseSensitive === caseSensitive &&
        current.wholeWord === wholeWord &&
        current.regex === regex &&
        current.replaceMode === replaceMode
        ? current
        : { ...current, caseSensitive, wholeWord, regex, replaceMode }
    })
  }, [state.ui.findCaseSensitive, state.ui.findRegex, state.ui.findReplaceMode, state.ui.findWholeWord])

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

  const pushToast = (message: string, tone: ToastTone = 'warning', durationMs = DEFAULT_TOAST_DURATION_MS) => {
    const nextToast = {
      id: createToastId(),
      message,
      tone,
      durationMs,
    }

    setToasts((currentToasts) => {
      const nextToasts = appendToastToStack(currentToasts, nextToast)
      const nextToastIds = new Set(nextToasts.map((toast) => toast.id))
      currentToasts.forEach((toast) => {
        if (!nextToastIds.has(toast.id)) clearToastTimer(toast.id)
      })
      toastsRef.current = nextToasts
      return nextToasts
    })

    if (!toastHoveredRef.current) {
      scheduleToastDismiss(nextToast.id, durationMs)
    }
  }

  const showTip = (tipId: TipId) => {
    const currentState = stateRef.current
    if (currentState.ui.disabledTipIds.includes(tipId)) return
    if (dismissedTipIdsThisSessionRef.current.has(tipId)) return

    setVisibleTips((currentTips) => (currentTips.includes(tipId) ? currentTips : [...currentTips, tipId]))

    if (currentState.ui.seenTipIds.includes(tipId)) return
    setState((previous) => {
      if (previous.ui.seenTipIds.includes(tipId)) return previous
      return {
        ...previous,
        ui: {
          ...previous.ui,
          seenTipIds: [...previous.ui.seenTipIds, tipId],
        },
      }
    })
  }

  const dismissTip = (tipId: TipId) => {
    dismissedTipIdsThisSessionRef.current.add(tipId)
    setVisibleTips((currentTips) => currentTips.filter((id) => id !== tipId))
  }

  useEffect(() => {
    setVisibleTips((currentTips) => currentTips.filter((tipId) => !state.ui.disabledTipIds.includes(tipId)))
  }, [state.ui.disabledTipIds])

  const storageProfileController = useStorageProfileController({
    pushToast,
    beforeStorageAction: () => flushStorageActionStateRef.current(),
  })
  const storageProfileStatus = storageProfileController.storageProfileStatus

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
  }, [activeSpace.id, activeTab.id, activeSubTab?.id, activeNoteBodyId, viewMode])

  useEffect(() => {
    if (resolvedActiveAisleId && resolvedActiveAisleId !== activeAisleId) {
      setActiveAisleId(resolvedActiveAisleId)
    }
  }, [activeAisleId, resolvedActiveAisleId])

  const scrollAisleIntoHorizontalView = useCallback((aisleId: string) => {
    const scrollNode = aisleScrollRef.current
    if (!scrollNode || !activeNoteBodyId) return false
    if (!scrollAislePaneIntoHorizontalView(scrollNode, aisleId)) return false
    aisleHorizontalScrollByBodyRef.current.set(activeNoteBodyId, scrollNode.scrollLeft)
    if (pendingScrollToAisleIdRef.current === aisleId) {
      pendingScrollToAisleIdRef.current = null
    }
    return true
  }, [activeNoteBodyId])

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

  const displayContent = viewMode === 'trash' ? trashDisplay.markdown : activeContent

  activeDomainIdRef.current = state.activeDomainId
  activeSpaceIdRef.current = activeSpace.id
  activeTabIdRef.current = activeTab.id
  activeSubTabIdRef.current = activeSubTab?.id ?? null
  activeAisleIdRef.current = resolvedActiveAisleId
  activeNoteLocationKeyRef.current = activeNoteLocationKey
  isMainViewRef.current = viewMode === 'main'

  useEffect(() => {
    saveDeviceLastOpened({
      domainId: state.activeDomainId,
      spaceId: activeSpace.id,
      primeTabId: activeTab.id,
      subTabId: activeSubTab?.id ?? null,
      viewMode,
    })
  }, [activeSpace.id, activeSubTab?.id, activeTab.id, state.activeDomainId, viewMode])

  const updateActiveSpaceData = (updater: (data: WorkspaceData) => WorkspaceData) => {
    setState((previous) => {
      const sanitizedPrevious = applyAutoPurgeToAppState(previous)
      return updateActiveSpaceDataInActiveDomain(sanitizedPrevious, updater)
    })
  }

  const getCurrentNoteLocation = (): NoteLocation => activeNoteLocation

  const getNormalizedEditorMarkdown = (editor: Editor) =>
    measureSlowOperation('editor markdown normalization', () => getEditorMarkdownForPersistence(editor))

  const cursorPersistence = useNoteCursorPersistence({
    setState,
    editorRef,
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

  flushStorageActionStateRef.current = async (options = {}) => {
    const snapshotMode = options.snapshotMode ?? 'force'
    await flushPendingPersistence({ snapshotMode, preferSync: true })
    persistLatestStateSnapshot({ snapshotMode })
  }

  const saveActiveCursorBeforeNavigation = () => {
    saveActiveCursorLocation()
    flushPendingContent()
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

  const navigateToNoteLocation = (location: NoteNavigationTarget) => {
    saveActiveCursorBeforeNavigation()
    const targetInfo = getLocationInfo(stateRef.current, location)
    if (!targetInfo.domain || !targetInfo.space || !targetInfo.tab || (location.subTabId && !targetInfo.subTab)) {
      pushToast('that note no longer exists.', 'warning')
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

  const applyArrangeParentMoveToSpace = (
    request: ArrangeHierarchyDropRequest,
    targetDomainId: string,
    targetSpaceId: string,
    placement?: { targetParentTabId: string; position: ArrangeInsertPosition },
  ) => {
    if (request.item.type !== 'parent') return
    const item = request.item
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
  }

  const applyArrangeSubTabsMoveToParent = (
    request: ArrangeHierarchyDropRequest,
    targetDomainId: string,
    targetSpaceId: string,
    targetParentTabId: string,
  ) => {
    if (request.item.type !== 'subtab') return
    const item = request.item
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
      if (reason === 'last-domain') pushToast('at least one domain must remain.', 'warning')
    },
    onArrangeSpaceMoveBlocked: (reason) => {
      if (reason === 'last-space') pushToast('at least one space must remain.', 'warning')
    },
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
  const arrangeSelection = arrange.selection
  const clearArrangePressTimer = arrange.clearPressTimer
  const clearArrangeTapCandidate = arrange.clearTapCandidate
  const clearArrangeSelection = arrange.clearSelection
  const consumeArrangeClickSuppression = arrange.consumeClickSuppression
  const enterArrangeModeFromContext = arrange.enterFromContext
  const exitArrangeMode = arrange.exit
  const moveGuidedArrangeCarryToTrash = () => {
    const prompt = arrangeDestinationPrompt
    if (!prompt) return
    saveActiveCursorBeforeNavigation()
    const currentState = stateRef.current
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
    pushToast('arrangement cancelled', 'warning')
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
    setTrashTabId,
    setTrashSubTabId,
  })
  const commitRename = navigationActions.commitRename
  const shouldSkipRenameBlur = navigationActions.shouldSkipRenameBlur
  const cancelRename = navigationActions.cancelRename
  const addTab = navigationActions.addTab
  const addSubTab = navigationActions.addSubTab
  const selectTab = navigationActions.selectTab
  const selectSubTab = navigationActions.selectSubTab
  const selectParentHomeTab = navigationActions.selectParentHomeTab
  const duplicateSpaceFromContext = navigationActions.duplicateSpaceFromContext
  const toggleTrashView = () => {
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
    setState((previous) => addSpaceToActiveDomain(previous, newSpace))
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
    setState((previous) => addDomain(previous, newDomain))
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
    selectSubTab(subTabId)
  }

  const selectParentHomeTabFromRail = () => {
    if (arrangeDestinationPrompt) return
    selectParentHomeTab()
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
  const isEditorView = viewMode === 'main' || (viewMode === 'trash' && !isTrashHomeSelected)

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
  }, [viewMode, getEditorHistoryDirection, runAisleStructuralHistory])

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
      const message = 'open a note before making a copy.'
      pushToast(message, 'warning')
      return { handled: false, toast: { message, tone: 'warning' as const } }
    }
    const latestState = buildStateWithLatestEditorContent()
    const destination = getCurrentNoteLocation()
    const result = applyNoteCopyToState(latestState, destination, target, mode, 'replace')
    if (result.status !== 'applied') {
      const message =
        result.status === 'self-copy' || result.status === 'already-linked'
          ? 'choose a different note to copy from.'
          : 'selected note could not be copied.'
      pushToast(message, 'warning')
      return { handled: false, toast: { message, tone: 'warning' as const } }
    }
    stateRef.current = result.state
    setState(result.state)
    pushToast(getNoteCopyCreatedToast(mode), 'success')
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
  const openSettingsWithoutMentionMenu = () => {
    closeEditorEphemeraRef.current()
    openSettings()
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
    activeSpaceIdRef,
    activeTabIdRef,
    activeSubTabIdRef,
    activeAisleIdRef,
    isMainViewRef,
    closeImageToolsRef,
    closeImageToolsIfSelectedImageMissingRef,
    isPendingCreatedRenameActive,
    saveActiveCursorLocation,
    flushPendingContent,
    clearMultiLineEdit,
    getNormalizedEditorMarkdown,
    scheduleContentCommit,
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
    deleteNotePreview: (tokenId) => deleteNotePreviewRef.current(tokenId),
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
      pushToast('open a note before using table of contents.', 'warning')
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
      setActiveAisleId(pending.aisleId)
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
    setActiveAisleId,
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
      setActiveAisleId(pendingAisleId)
    }
    pendingNavigationAisleIdRef.current = null
  }, [
    activeAisleId,
    activeNoteAisles,
    activeNoteBodyId,
    pendingCursorRestoreRef,
    pendingFocusToAisleIdRef,
    pendingScrollToAisleIdRef,
    setActiveAisleId,
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

  const openExternalLinkEditModal = (href: string, label: string, range: LinkEditRange | null) => {
    closeEditorEphemeraRef.current()
    saveActiveCursorBeforeNavigation()
    setModal(buildExternalLinkEditDraft(stateRef.current, getCurrentNoteLocation(), href, label, range))
  }

  const openInternalNoteLinkEditModal = (edit: InternalNoteLinkEdit) => {
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
  const applyInlineCrop = imageToolsController.applyCrop
  const beginInlineCropMouseDrag = imageToolsController.beginCropMouseDrag
  closeImageToolsRef.current = closeImageTools
  closeImageToolsIfSelectedImageMissingRef.current = closeImageToolsIfSelectedImageMissing

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
        closeToolbarPopovers: () => {
          setCopyMenuOpen(false)
          setHeadingMenuOpen(false)
          setToolbarPopoverPosition({ copy: null, heading: null })
        },
        closeContextMenu: () => setContextMenu(null),
        closeImageTools: () => closeImageToolsRef.current(),
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
      pushToast('open a note before using the editor menu.', 'warning')
    }
  }

  const getCopyAsSourceAisleId = (latestState: AppState, source: NoteLocation) => {
    return getCopyAsAisleIdForNoteContext(latestState, source, getCurrentNoteLocation(), activeAisleIdRef.current)
  }

  const pasteCopyAsPayload = (payload: CopyAsClipboardPayload): boolean => {
    if (viewMode !== 'main') {
      pushToast('open a note before pasting.', 'warning')
      return true
    }

    const latestState = buildStateWithLatestEditorContent()
    const destination = getCurrentNoteLocation()
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
      const message = command.message === 'maximum aisle count reached.' ? MAX_AISLE_WARNING_MESSAGE : command.message
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
      pushToast('open a note before pasting.', 'warning')
      return true
    }
    closeEditorEphemeraRef.current()
    pushToast(command.toast.message, command.toast.tone ?? 'success')
    return true
  }

  const copyContextMenuItemAs = (scope: CopyAsScope, action: CopyAsAction) => {
    const source = contextMenuNoteLocation
    closeEditorEphemeraRef.current()
    if (!source) {
      pushToast('note not found.', 'warning')
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
        pushToast('clipboard copy is unavailable here.', 'warning')
        return
      }
      pushToast(getCopyAsSuccessMessage(scope, action), 'success')
    })
  }

  const runEditorContextClipboardAction = (action: 'cut' | 'copy' | 'paste' | 'pastePlainText') => {
    closeEditorEphemeraRef.current()
    const currentEditor = editorRef.current
    if (!currentEditor) {
      pushToast('open a note before using the editor menu.', 'warning')
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
        pushToast('clipboard copy command is invalid.', 'warning')
        return
      }
      insertEditorTextOperation(editorOperationRuntime, text)
    }

    if (action === 'paste') {
      void readCopyAsPayloadFromClipboard()
        .then((payload) => {
          if (payload && pasteCopyAsPayload(payload)) return
          const nativeHandled = document.execCommand('paste')
          if (nativeHandled) {
            window.setTimeout(() => commitActiveEditorMarkdownNow(currentEditor), 0)
            return
          }
          void navigator.clipboard?.readText?.()
            .then(pasteText)
            .catch(() => pushToast('clipboard paste is unavailable here.', 'warning'))
        })
        .catch(() => {
          const nativeHandled = document.execCommand('paste')
          if (nativeHandled) {
            window.setTimeout(() => commitActiveEditorMarkdownNow(currentEditor), 0)
            return
          }
          void navigator.clipboard?.readText?.()
            .then(pasteText)
            .catch(() => pushToast('clipboard paste is unavailable here.', 'warning'))
        })
      return
    }

    void navigator.clipboard?.readText?.()
      .then(pasteText)
      .catch(() => pushToast('clipboard paste is unavailable here.', 'warning'))
  }

  const openEditorContextLinkModal = (mode: LinkInsertMode | null) => {
    closeEditorEphemeraRef.current()
    openSharedLinkModal(getActiveEditorSelectedText(), mode ?? getLastLinkInsertMode())
  }

  const insertAttachmentFromEditorContext = () => {
    closeEditorEphemeraRef.current()
    const currentEditor = editorRef.current
    if (!currentEditor) {
      pushToast('open a note before inserting an attachment.', 'warning')
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
      void importBlobAsAssetUrl(file, file.name).then((assetUrl) => {
        if (!assetUrl) {
          pushToast('could not import attachment.', 'warning')
          return
        }
        currentEditor.focus()
        if (file.type.startsWith('image/')) {
          runEditorCommandOperation(editorOperationRuntime, 'addImage', { imageUrl: assetUrl, altText: file.name })
        } else {
          const label = escapeMarkdownLinkLabel(file.name.trim() || 'attachment')
          insertEditorTextOperation(editorOperationRuntime, `[${label}](${assetUrl})`)
        }
      })
    }
    input.click()
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

  const openFindReplacePanel = useCallback(() => {
    closeEditorEphemeraRef.current()
    flushPendingContent()
    const selectedText = getActiveEditorSelectedText()
    const lastFindQuery = loadDeviceSettings().lastFindQuery
    const replaceMode = state.ui.findReplaceMode === 'replace'
    if (!lastFindQuery && selectedText.trim()) savePartialDeviceSettings({ lastFindQuery: selectedText })
    setFindReplacePanel((current) => ({
      ...current,
      open: true,
      replaceMode,
      focusRequestId: current.focusRequestId + 1,
      query: lastFindQuery || current.query || selectedText,
      activeIndex: 0,
    }))
  }, [flushPendingContent, getActiveEditorSelectedText, state.ui.findReplaceMode])

  const setFindReplaceActiveIndex = (index: number) => {
    const safeIndex = Math.max(0, Math.min(Math.max(0, findReplaceMatches.length - 1), index))
    setFindReplacePanel((current) => ({ ...current, activeIndex: safeIndex }))
    const match = findReplaceMatches[safeIndex]
    if (!match) return
    if (
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
    const activeInfo = getLocationInfo(nextState, activeNoteLocation)
    const activeBody = nextState.noteBodies.find((body) => body.id === activeInfo.noteBodyId)
    const activeAisle = activeBody?.aisles.find((aisle) => aisle.id === activeAisleIdRef.current)
    if (!currentEditor || !activeAisle) return
    const activeAisleBodyId = getAisleBodyId(activeAisle)
    if (!changedAisleBodyIds.has(activeAisleBodyId)) return
    const nextMarkdown = getAisleMarkdown(activeAisle, nextState.noteAisleBodies)
    lastEditorMarkdownRef.current = nextMarkdown
    lastEditorMarkdownByAisleRef.current.set(activeAisleBodyId, nextMarkdown)
    setEditorMarkdownForDisplay(currentEditor, nextMarkdown, false)
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
    const latestMatches = findVisibleMatches(latestState, activeNoteLocation, findReplacePanel.scope, findReplacePanel.query, {
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
    pushToast(`replaced ${result.replacementCount} ${result.replacementCount === 1 ? 'match' : 'matches'}.`, 'success')
  }

  useEffect(() => {
    const handleFindShortcut = (event: KeyboardEvent) => {
      const shortcutMode = getFindReplaceShortcutMode(event, isMacPlatform)
      if (!shortcutMode || viewMode !== 'main') return
      event.preventDefault()
      event.stopPropagation()
      openFindReplacePanel()
    }
    document.addEventListener('keydown', handleFindShortcut, true)
    return () => document.removeEventListener('keydown', handleFindShortcut, true)
  }, [isMacPlatform, viewMode, openFindReplacePanel])

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
    if (operation === 'aisle' && activeNoteAisles.length >= MAX_NOTE_AISLES) {
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

    const beforeAisleSnapshot = operation === 'aisle' ? captureActiveAisleStructuralSnapshot() : null
    const result = applyEditorNewlineOperation(currentEditor, operation)
    if (!result.handled) return false

    finishEditorOperation(editorOperationRuntime, currentEditor, { syncToolbar: true })
    if (operation === 'aisle') {
      closeEditorEphemeraRef.current()
      addAisleToActiveNote(result.aisleMarkdown ?? '', {
        beforeSnapshot: beforeAisleSnapshot,
        placement: stateRef.current.ui.newAislePlacement ?? 'end',
      })
    }
    return true
  }

  const insertAisleFromEditorContext = () => {
    closeEditorEphemeraRef.current()
    if (!editorRef.current) {
      pushToast('open a note before using the editor menu.', 'warning')
      return
    }
    runActiveNewlineOperation('aisle')
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
    const operations = stateRef.current.hotkeys.newlineShortcuts.menuOperations
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
    closeImageTools,
    pushToast,
    maybeShowCompletedTaskUndoHint,
    trackCompletedTaskQuickDelete,
    tryExpandMultilineSelection,
  })

  useEditorDomEvents({
    viewMode,
    displayContent,
    activeNoteAisleCount: activeNoteAisles.length,
    hotkeys: state.hotkeys,
    isMacPlatform,
    editorEventRootRef,
    editorRef,
    activeImageRef,
    multiLineEditRef,
    activateEditorFromEventTarget,
    clearMultiLineEdit,
    closeImageTools,
    closeLinkPrompt,
    isLinkPromptOpen: () => false,
    isImageCropActive,
    selectImageForTools,
    refreshImageToolsPosition,
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
      pushToast('clipboard copy command is invalid.', 'warning')
      return true
    },
    getToolbarFormatShortcut,
    queueToolbarShortcutFeedback,
    syncToolbarFormatState,
    onRunFormatCommand: runActiveEditorFormatCommand,
    getEditorHistoryDirection,
    onEditorSelectionChange: saveActiveCursorLocation,
    onEditorMentionQueryChange: noteMention.refreshQuery,
    onRunStructuralHistory: runAisleStructuralHistory,
    onRunEditorHistory: runEditorHistoryOnly,
    shouldRunStructuralHistoryBeforeEditorHistory: shouldRunAisleStructuralHistoryBeforeEditorHistory,
    onRunNewlineOperation: runActiveNewlineOperation,
    onOpenShortcutMenu: openShortcutMenu,
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

  const stageManager = useStageManagerController({
    state,
    setState,
    commitAppStateNow,
    activeSpace,
    workspace,
    viewMode,
    setViewMode,
    setMenuOpen,
    setContextMenu,
    setEditing,
    flushPendingContent: saveActiveCursorBeforeNavigation,
    exitArrangeMode,
    returnToLastTabLikeView,
    selectTab,
    buildStateWithLatestEditorContent,
    pushToast,
  })

  const closeSettingsView = () => {
    returnToLastTabLikeView()
  }

  const exportData = (scope: ExportScope, spaceId?: string) =>
    exportAppData({
      scope,
      spaceId,
      getLatestState: buildStateWithLatestEditorContent,
      setStatus: settingsController.setExportStatus,
    })

  const openFrontmatterModalForAisle = (aisleId: string | null = null) => {
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
      pushToast('frontmatter YAML is invalid. fix the markdown block before using the frontmatter menu.', 'warning')
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
    setModal({
      type: 'linked-aisle',
      reason: 'aisle-body',
      noteBodyId: activeNoteBodyId,
      aisleId,
      aisleBodyId,
      location: activeNoteLocation,
    })
  }

  const openFrontmatterTemplateSettings = (templateId: string) => {
    settingsController.setSettingsFrontmatterTemplate(templateId)
    settingsController.changeSection('frontmatter')
    setModal(null)
    openSettingsWithoutMentionMenu()
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
    exportData,
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
  const openDeleteModalFromContext = overlayActions.openDeleteModalFromContext
  const deleteFromContext = overlayActions.deleteFromContext
  const deleteTarget = overlayActions.deleteTarget
  const restoreFromContext = overlayActions.restoreFromContext
  const openCopyModalFromContext = overlayActions.openCopyModalFromContext
  const openCopyModalForActiveNote = overlayActions.openCopyModalForActiveNote
  const openDeduplicateModalForActiveNote = overlayActions.openDeduplicateModalForActiveNote
  const setLastNoteCopyMode = overlayActions.setLastNoteCopyMode
  const setDecoupledItemsKeepData = overlayActions.setDecoupledItemsKeepData
  const openDeduplicateModalFromContext = overlayActions.openDeduplicateModalFromContext
  const getCurrentDuplicateCount = overlayActions.getCurrentDuplicateCount
  const beginRenameSpaceFromContext = overlayActions.beginRenameSpaceFromContext
  const beginRenameDomainFromContext = overlayActions.beginRenameDomainFromContext
  const confirmModal = () => {
    if (!modal || modal.type !== 'linked-aisle') {
      overlayActions.confirmModal()
      return
    }

    if (modal.reason === 'aisle-body') {
      applyAisleEditDraftToActiveNote(activeNoteAisles, { decoupleAisleIds: [modal.aisleId] })
      setModal(null)
      pushToast('aisle de-coupled.', 'success')
      return
    }

    setDecoupledItemsKeepData(modal.keepData)
    const keepKeys = new Set(modal.keepLocationKeys)
    if (keepKeys.size === 0) {
      pushToast('select at least one note to retain the information', 'error')
      return
    }
    const appliedState = decoupleNoteLocationsInState(stateRef.current, modal.noteBodyId, keepKeys, modal.keepData)
    stateRef.current = appliedState
    setState(appliedState)
    setModal(null)
    pushToast('notes de-coupled.', 'success')
  }

  const deleteFocusedSubTabFromShortcut = () => {
    closeEditorEphemeraRef.current()
    const activeSubTabId = activeTab.activeSubTabId
    if (!activeSubTabId) {
      pushToast('home tabs cannot be deleted', 'warning')
      return
    }
    deleteTarget({ type: 'subtab', tabId: activeTab.id, subTabId: activeSubTabId }, false)
  }

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
  const mainArrangementActive = arrangeMode.active && viewMode === 'main'

  useEffect(() => {
    if (!mainArrangementActive) return
    closeEditorEphemeraRef.current()
  }, [mainArrangementActive])

  useEffect(() => {
    if (!mainArrangementActive || typeof document === 'undefined') return

    document.body.classList.add('app-tooltips-disabled')
    const strippedTitles = new Map<HTMLElement, string>()
    const stripTitles = () => {
      document.querySelectorAll<HTMLElement>('.app-shell [title]').forEach((element) => {
        const title = element.getAttribute('title')
        if (!title) return
        if (!strippedTitles.has(element)) {
          strippedTitles.set(element, title)
        }
        element.removeAttribute('title')
      })
    }

    stripTitles()
    const appShell = document.querySelector('.app-shell')
    const observer = new MutationObserver(stripTitles)
    if (appShell) {
      observer.observe(appShell, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['title'],
      })
    }

    return () => {
      observer.disconnect()
      document.body.classList.remove('app-tooltips-disabled')
      strippedTitles.forEach((title, element) => {
        if (element.isConnected && !element.hasAttribute('title')) {
          element.setAttribute('title', title)
        }
      })
    }
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
      openCopyModalForActiveNote()
    },
    openDeduplicateModalForActiveNote: () => {
      closeEditorEphemeraRef.current()
      openDeduplicateModalForActiveNote()
    },
    openFrontmatterModalForActiveNote,
    openTableOfContents,
    openAisleEditModal: () => {
      closeEditorEphemeraRef.current()
      openAisleEditModal()
    },
    openDirector: () => {
      closeEditorEphemeraRef.current()
      stageManager.open()
    },
    openFindReplace: openFindReplacePanel,
    pushToast,
    onDisabledToolbarInteraction: exitArrangeMode,
    dismissEditorEphemera: () => closeEditorEphemeraRef.current(),
  })

  const renderImageToolsOverlay = () => (
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
      onBeginResize={beginImageResize}
      onBeginCropDrag={beginInlineCropMouseDrag}
    />
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

  const renderEditorShell = () => (
    <LegacyEditorShell
      editorReadOnly={editorReadOnly}
      editorMountRef={editorMountRef}
      imageToolsOverlay={renderImageToolsOverlay()}
      tableControlsOverlay={renderTableControlsOverlay()}
    />
  )

  const canDeleteSpace = state.spaces.length > 1
  const canDeleteDomain = state.domains.length > 1

  useGlobalHotkeys({
    viewMode,
    activeTab,
    primeTabs: workspace.tabs,
    arrangeMode,
    hotkeys: state.hotkeys,
    deleteSubtabShortcutEnabled: state.ui.deleteSubtabShortcutEnabled ?? false,
    isMacPlatform,
    editingShortcut: settingsController.editingShortcut,
    setEditingShortcut: settingsController.setEditingShortcut,
    updateShortcutSetting: settingsController.updateShortcutSetting,
    exitArrangeMode,
    openSettings: openSettingsWithoutMentionMenu,
    toggleSpaceRail: toggleSpaceRailVisibility,
    toggleDomainRail: toggleDomainRailVisibility,
    toggleTrashView,
    returnToLastTabLikeView,
    navigateHistoryBy,
    showTip,
    warnHomeSubtabDelete: () => pushToast('home tabs cannot be deleted', 'warning'),
    addTab,
    addSubTab,
    deleteFocusedSubTab: deleteFocusedSubTabFromShortcut,
    formatStrikethrough: () => runActiveEditorFormatCommand('strike'),
    selectTab,
    selectSubTab,
  })

  const persistedHierarchyLevel = state.ui.alwaysShowDomains ? 2 : state.ui.alwaysShowSpaces ? 1 : 0
  const promptHierarchyLevel = arrangeDestinationPrompt?.revealHierarchyLevel ?? 0
  const effectiveHierarchyLevel =
    viewMode === 'main'
      ? Math.max(
          persistedHierarchyLevel,
          mainArrangementActive ? arrangeHierarchyRevealLevel : 0,
          promptHierarchyLevel,
        )
      : 0
  const showCompactSpaces = effectiveHierarchyLevel >= 1
  const showCompactDomains = effectiveHierarchyLevel >= 2
  const isNoteWorkspaceView = viewMode === 'main' || viewMode === 'stage-manager'
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
    arrangeMode.active &&
    (!arrangeDestinationPrompt || promptAllowsSpaceSelection(arrangeDestinationPrompt)) &&
    arrangeMode.scope === 'spaces' &&
    viewMode === 'main' &&
    showCompactSpaces
      ? 'is-arrangeable'
      : ''
  const arrangeableDomainClassName =
    arrangeMode.active &&
    arrangeMode.scope === 'domains' &&
    viewMode === 'main' &&
    showCompactDomains
      ? 'is-arrangeable'
      : ''
  const draggingDomainId =
    arrangeMode.active && arrangeDraggingItem?.type === 'domain' ? arrangeDraggingItem.domainId : null
  const draggingSpaceId =
    arrangeMode.active && arrangeDraggingItem?.type === 'space' ? arrangeDraggingItem.spaceId : null
  const topVisibleMainRail = showCompactDomains ? 'domains' : showCompactSpaces ? 'spaces' : 'parents'
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
  const stageManagerTopRailActions: NavigationRailAction[] = [
    {
      key: 'end-stage-manager',
      label: 'director',
      selected: false,
      className: 'btn btn-sm tab-btn topbar-action-btn topbar-context-btn',
      onClick: () => undefined,
    },
  ]
  const renderTopRailControls = (viewForMenu: ViewMode = viewMode) => (
    <NavigationRailControls
      actions={viewForMenu === 'stage-manager' ? stageManagerTopRailActions : mainTopRailActions}
      menuOpen={menuOpen}
      showCloseControl={viewForMenu === 'stage-manager' || mainArrangementActive}
      viewMode={viewForMenu}
      spaceRailVisible={state.ui.alwaysShowSpaces ?? false}
      domainRailVisible={state.ui.alwaysShowDomains ?? false}
      onCloseAction={viewForMenu === 'stage-manager' ? stageManager.end : exitArrangeMode}
      onSetMenuOpen={setMenuOpen}
      onToggleSpaceRail={toggleSpaceRailVisibility}
      onToggleDomainRail={toggleDomainRailVisibility}
      onOpenStageManager={stageManager.open}
      onToggleTrash={toggleTrashView}
      onOpenSettings={openSettingsWithoutMentionMenu}
    />
  )
  const activeThemePalette = getThemePaletteForTheme(state.theme, state.ui.themePalettes, state.ui.customThemePalette)
  const activeThemeIsCustom = isCustomTheme(state.theme)
  const customThemeSeedSource = activeThemeIsCustom ? getCustomThemePaletteSeedMatch(activeThemePalette) : null
  const builtInThemeOverride = activeThemeIsCustom ? null : state.ui.themePalettes?.[state.theme] ?? null
  const customThemePalette =
    activeThemeIsCustom
      ? activeThemePalette
      : builtInThemeOverride && !isThemePaletteSeed(state.theme, builtInThemeOverride)
        ? builtInThemeOverride
        : null
  const customThemeClassName =
    activeThemeIsCustom
      ? customThemeSeedSource
        ? `theme-custom-seed-${customThemeSeedSource} ${
            customThemeSeedSource === 'dark' ? '' : `theme-${customThemeSeedSource}`
          }`
        : 'theme-custom-derived'
      : customThemePalette
        ? 'theme-custom-derived'
        : ''
  const visibleTipDefinitions = visibleTips
    .filter((tipId) => !state.ui.disabledTipIds.includes(tipId))
    .map((tipId) => getTipDefinition(tipId, { isMacPlatform }))
  const activeTableOfContentsPanels =
    tableOfContentsPanels?.noteBodyId === activeNoteBodyId ? tableOfContentsPanels : null
  const noteMentionMenu = noteMention.menu
  const noteMentionNavigatorRows = noteMention.navigatorRows
  const noteMentionSearchEntries = noteMention.searchEntries
  const noteMentionSearchActiveIndex = noteMention.activeSearchIndex
  const stageManagerActiveDomain = stageManager.domains.find((domain) => domain.id === state.activeDomainId) ?? stageManager.domains[0]
  const stageManagerSpaces = stageManagerActiveDomain?.spaces ?? state.spaces
  return (
    <main
      className={`app-shell theme-${state.theme} ${customThemeClassName} view-${viewMode} ${
        viewMode === 'stage-manager' ? 'view-stage-manager' : ''
      } ${mainArrangementActive ? 'tooltips-disabled' : ''}`}
      style={
        {
          '--tab-button-scale': String(state.ui.tabButtonScale),
          '--note-font-scale': String(state.ui.noteFontScale),
          '--tooltip-scale': String(state.ui.tooltipScale ?? 1),
          ...(customThemePalette
            ? {
                '--custom-theme-canvas': customThemePalette.canvas,
                '--custom-theme-page': customThemePalette.page,
                '--custom-theme-surface': customThemePalette.surface,
                '--custom-theme-surface-raised': customThemePalette.surfaceRaised,
                '--custom-theme-text': customThemePalette.text,
                '--custom-theme-muted-text': customThemePalette.mutedText,
                '--custom-theme-border': customThemePalette.border,
                '--custom-theme-primary': customThemePalette.primary,
                '--custom-theme-secondary': customThemePalette.secondary,
                '--custom-theme-danger': customThemePalette.danger,
                '--custom-theme-warning': customThemePalette.warning,
                '--custom-theme-success': customThemePalette.success,
                '--custom-theme-domain-rail': customThemePalette.domainRail,
                '--custom-theme-space-rail': customThemePalette.spaceRail,
                '--custom-theme-parent-rail': customThemePalette.parentRail,
                '--custom-theme-subtab-rail': customThemePalette.subtabRail,
              }
            : {}),
        } as React.CSSProperties
      }
    >
      {viewMode === 'stage-manager' && (
        <CompactDomainRail
          domains={stageManager.domains}
          activeDomainId={state.activeDomainId}
          editing={null}
          arrangeMode={arrangeMode}
          arrangeableDomainClassName=""
          draggingDomainId={null}
          domainsGridRef={domainsGridRef}
          controlsSlot={renderTopRailControls('stage-manager')}
          stageManagerMode
          stageManagerSelectedDomainIds={stageManager.selectedDomainIds}
          onStageManagerDomainClick={stageManager.handleDomainClick}
          onStageManagerDomainDoubleClick={stageManager.handleDomainDoubleClick}
          onOpenDomain={openDomainFromCompactRail}
          onOpenContextMenu={openContextMenuForDomain}
          onShouldSkipRenameBlur={shouldSkipRenameBlur}
          onCommitRename={commitRename}
          onCancelRename={cancelRename}
          onRenameDraftChange={trackRenameDraft}
          onBeginEdit={setEditing}
          onAutoSizeRenameInput={autoSizeRenameInput}
          onClearRenameDraft={clearRenameDraft}
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

      {viewMode === 'stage-manager' && (
        <CompactSpaceRail
          spaces={stageManagerSpaces}
          activeSpaceId={state.activeSpaceId}
          editing={null}
          arrangeMode={arrangeMode}
          arrangeableSpaceClassName=""
          draggingSpaceId={null}
          spacesGridRef={spacesGridRef}
          stageManagerMode
          stageManagerSelectedSpaceIds={stageManager.selectedSpaceIds}
          onStageManagerSpaceClick={stageManager.handleSpaceClick}
          onStageManagerSpaceDoubleClick={stageManager.handleSpaceDoubleClick}
          onOpenSpace={openSpaceFromCompactRail}
          onOpenContextMenu={openContextMenuForSpace}
          onShouldSkipRenameBlur={shouldSkipRenameBlur}
          onCommitRename={commitRename}
          onCancelRename={cancelRename}
          onRenameDraftChange={trackRenameDraft}
          onBeginEdit={setEditing}
          onAutoSizeRenameInput={autoSizeRenameInput}
          onClearRenameDraft={clearRenameDraft}
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

      {viewMode === 'main' && showCompactDomains && (
        <CompactDomainRail
          domains={state.domains}
          activeDomainId={state.activeDomainId}
          editing={editing}
          arrangeMode={arrangeMode}
          arrangeableDomainClassName={arrangeableDomainClassName}
          draggingDomainId={draggingDomainId}
          arrangeSelectedDomainIds={arrangeSelectedDomainIds}
          domainsGridRef={domainsGridRef}
          controlsSlot={topVisibleMainRail === 'domains' ? renderTopRailControls('main') : null}
          tooltipsDisabled={mainArrangementActive}
          arrangeControlsDisabled={arrangeControlsDisabled}
          onOpenDomain={openDomainFromCompactRail}
          onHandleArrangeDomainSelectionClick={handleArrangeDomainSelectionClick}
          onClearArrangeSelection={clearArrangeSelection}
          onOpenContextMenu={openContextMenuForDomain}
          onShouldSkipRenameBlur={shouldSkipRenameBlur}
          onCommitRename={commitRename}
          onCancelRename={cancelRename}
          onRenameDraftChange={trackRenameDraft}
          onBeginEdit={setEditing}
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

      {viewMode === 'main' && showCompactSpaces && (
        <CompactSpaceRail
          spaces={state.spaces}
          activeSpaceId={state.activeSpaceId}
          editing={editing}
          arrangeMode={arrangeMode}
          arrangeableSpaceClassName={arrangeableSpaceClassName}
          draggingSpaceId={draggingSpaceId}
          arrangeSelectedSpaceIds={arrangeSelectedSpaceIds}
          spacesGridRef={spacesGridRef}
          controlsSlot={topVisibleMainRail === 'spaces' ? renderTopRailControls('main') : null}
          tooltipsDisabled={mainArrangementActive}
          arrangeControlsDisabled={arrangeControlsDisabled}
          onOpenSpace={openSpaceFromCompactRail}
          onHandleArrangeSpaceSelectionClick={handleArrangeSpaceSelectionClick}
          onClearArrangeSelection={clearArrangeSelection}
          onOpenContextMenu={openContextMenuForSpace}
          onShouldSkipRenameBlur={shouldSkipRenameBlur}
          onCommitRename={commitRename}
          onCancelRename={cancelRename}
          onRenameDraftChange={trackRenameDraft}
          onBeginEdit={setEditing}
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
            controlsSlot={renderTopRailControls('trash')}
            onSelectDomain={(domainBucketId) => {
              const domain = trashDomains.find((candidate) => candidate.id === domainBucketId)
              if (domain?.source === 'live') {
                setState((previous) => setActiveDomain(previous, domain.domainId))
              }
              setTrashDomainId(domainBucketId)
              setTrashSpaceId('')
              setTrashTabId(TRASH_HOME_ID)
              setTrashSubTabId(null)
            }}
            onOpenDeletedDomainContextMenu={(event, domain) => {
              if (!domain.deletedDomainEntryId) return
              openContextMenuForTrashDomain(event, domain.deletedDomainEntryId, domain.domainId)
            }}
          />
          {selectedTrashDomain && (
            <TrashSpaceRail
              spaces={trashSpaces}
              selectedSpaceId={selectedTrashSpace?.id ?? null}
              onSelectSpace={(spaceBucketId) => {
                const space = trashSpaces.find((candidate) => candidate.id === spaceBucketId)
                if (space?.source === 'live') {
                  setState((previous) => setActiveSpaceInActiveDomain(setActiveDomain(previous, space.domainId), space.spaceId))
                }
                setTrashSpaceId(spaceBucketId)
                setTrashTabId(TRASH_HOME_ID)
                setTrashSubTabId(null)
              }}
              onOpenDeletedSpaceContextMenu={(event, space) => {
                if (space.source === 'live') return
                if (space.source === 'deleted-space' && !space.deletedSpaceEntryId) return
                openContextMenuForTrashSpace(event, {
                  source: space.source,
                  deletedSpaceEntryId: space.deletedSpaceEntryId ?? undefined,
                  deletedDomainEntryId: space.deletedDomainEntryId ?? undefined,
                  domainId: space.domainId,
                  spaceId: space.spaceId,
                })
              }}
            />
          )}
        </>
      )}

      <TopBar
        viewMode={viewMode}
        workspace={workspace}
        activeTab={activeTab}
        editing={editing}
        arrangeMode={arrangeMode}
        tooltipsDisabled={mainArrangementActive}
        showGlobalControls={
          viewMode === 'main'
            ? topVisibleMainRail === 'parents'
            : viewMode === 'trash'
              ? false
              : viewMode !== 'stage-manager'
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
        onCommitRename={commitRename}
        onCancelRename={cancelRename}
        onRenameDraftChange={trackRenameDraft}
        onClearRenameDraft={clearRenameDraft}
        onGetStageManagerParentSelection={stageManager.getParentSelection}
        onStageManagerParentClick={stageManager.handleParentClick}
        arrangeSelectedParentIds={arrangeSelectedParentIds}
        onHandleArrangeParentSelectionClick={handleArrangeParentSelectionClick}
        onClearArrangeSelection={clearArrangeSelection}
        onConsumeArrangeClickSuppression={consumeArrangeClickSuppression}
        onSelectTab={selectParentTabFromTopBar}
        onBeginEdit={setEditing}
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
        onSetTrashTabId={setTrashTabId}
        onSetTrashSubTabId={setTrashSubTabId}
        onOpenContextMenuForTrashTab={openContextMenuForTrashTab}
        onAddTab={addTab}
        onOpenParentSortModal={() => setModal({ type: 'sort-tabs', target: 'parents' })}
        onExitArrangeMode={exitArrangeMode}
        onAdvanceArrangeHierarchyReveal={advanceArrangeHierarchyReveal}
        onEndStageManager={stageManager.end}
        onCloseSettingsView={closeSettingsView}
        onSetMenuOpen={setMenuOpen}
        onToggleSpaceRail={toggleSpaceRailVisibility}
        onToggleDomainRail={toggleDomainRailVisibility}
        onOpenStageManager={stageManager.open}
        onToggleTrash={toggleTrashView}
        onOpenSettings={openSettingsWithoutMentionMenu}
      />

      {tabArrangeDragPreview && <TabArrangeDragPreviewOverlay preview={tabArrangeDragPreview} />}

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
          tabButtonScaleDraft={settingsController.tabButtonScaleDraft}
          noteFontScaleDraft={settingsController.noteFontScaleDraft}
          tooltipScaleDraft={settingsController.tooltipScaleDraft}
          selectedCustomTheme={settingsController.selectedCustomTheme}
          customThemePaletteDraft={settingsController.customThemePaletteDraft}
          showParentHomeTabDraft={settingsController.showParentHomeTabDraft}
          alwaysShowSpacesDraft={settingsController.alwaysShowSpacesDraft}
          alwaysShowDomainsDraft={settingsController.alwaysShowDomainsDraft}
          tableAddTargetModeDraft={settingsController.tableAddTargetModeDraft}
          tableDeleteTargetModeDraft={settingsController.tableDeleteTargetModeDraft}
          tableOfContentsScopeDraft={settingsController.tableOfContentsScopeDraft}
          newAislePlacementDraft={settingsController.newAislePlacementDraft}
          miscSyncedUiBooleanSettings={settingsController.miscSyncedUiBooleanSettings}
          frontmatterDraft={settingsController.frontmatterDraft}
          frontmatterDraftDirty={settingsController.frontmatterDraftDirty}
          toolbarLayouts={settingsController.toolbarLayouts}
          toolbarEditorLayoutId={settingsController.toolbarEditorLayoutId}
          toolbarEditorShowNames={settingsController.toolbarEditorShowNames}
          storageProfileStatus={storageProfileStatus}
          onSectionChange={settingsController.changeSection}
          onDataSectionChange={settingsController.changeDataSection}
          onVisualsSectionChange={settingsController.changeVisualsSection}
          onToggleShortcutEdit={settingsController.toggleShortcutEdit}
          onNewlineShortcutChange={settingsController.updateNewlineShortcutSetting}
          onOpenShortcutMenuSettings={() => setModal({ type: 'shortcut-menu-settings' })}
          onAutoRemoveDaysChange={settingsController.updateAutoRemoveDaysSetting}
          onExportAll={() => exportData('all')}
          onThemeChange={settingsController.updateThemeSetting}
          onSelectedCustomThemeChange={settingsController.updateSelectedCustomThemeSetting}
          onCustomThemePaletteChange={settingsController.updateCustomThemePaletteSetting}
          onCustomThemePaletteImport={settingsController.importCustomThemePaletteSetting}
          onCustomThemePaletteReset={settingsController.resetCustomThemePaletteSetting}
          onCustomThemePaletteSeedFromCurrentTheme={settingsController.seedCustomThemePaletteFromCurrentTheme}
          onTabButtonScaleChange={settingsController.updateTabButtonScaleSetting}
          onNoteFontScaleChange={settingsController.updateNoteFontScaleSetting}
          onTooltipScaleChange={settingsController.updateTooltipScaleSetting}
          onShowParentHomeTabChange={settingsController.updateShowParentHomeTabSetting}
          onAlwaysShowSpacesChange={settingsController.updateAlwaysShowSpacesSetting}
          onAlwaysShowDomainsChange={(enabled) => {
            if (!settingsController.updateAlwaysShowDomainsSetting(enabled)) {
              pushToast(ALWAYS_SHOW_DOMAINS_WITHOUT_SPACES_MESSAGE, 'error')
            }
          }}
          onTableAddTargetModeChange={settingsController.updateTableAddTargetModeSetting}
          onTableDeleteTargetModeChange={settingsController.updateTableDeleteTargetModeSetting}
          onTableOfContentsScopeChange={settingsController.updateTableOfContentsScopeSetting}
          onNewAislePlacementChange={settingsController.updateNewAislePlacementSetting}
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
          onReadOnlyToolbarEditAttempt={() => pushToast('duplicate the default or create a new layout to edit')}
          onSettingsFrontmatterTemplateChange={settingsController.setSettingsFrontmatterTemplate}
          onCreateFrontmatterTemplate={settingsController.createFrontmatterTemplate}
          onUpdateFrontmatterTemplate={settingsController.updateFrontmatterTemplate}
          onDeleteFrontmatterTemplate={settingsController.deleteFrontmatterTemplate}
          onAddFrontmatterTemplateField={settingsController.addFrontmatterTemplateField}
          onUpdateFrontmatterTemplateField={settingsController.updateFrontmatterTemplateField}
          onDeleteFrontmatterTemplateField={settingsController.deleteFrontmatterTemplateField}
          onSaveFrontmatterTemplates={settingsController.saveFrontmatterTemplates}
          onDiscardFrontmatterTemplateChanges={settingsController.discardFrontmatterTemplateChanges}
          onChooseStorageFolder={storageProfileController.chooseStorageFolder}
          onMoveStorageProfile={storageProfileController.moveStorageProfile}
          onRevealStorageProfile={storageProfileController.revealStorageProfile}
          onRetryStorageProfile={storageProfileController.retryStorageProfile}
          onRestoreStorageRecoverySnapshot={storageProfileController.restoreStorageRecoverySnapshot}
        />
      ) : (
        <>
          <SubTabRail
            viewMode={viewMode}
            activeTab={activeTab}
            activeSubTabId={activeSubTab?.id ?? null}
            editing={editing}
            arrangeMode={arrangeMode}
            tooltipsDisabled={mainArrangementActive}
            showParentHomeTab={state.ui.showParentHomeTab}
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
            onCommitRename={commitRename}
            onCancelRename={cancelRename}
            onRenameDraftChange={trackRenameDraft}
            onClearRenameDraft={clearRenameDraft}
            onGetStageManagerParentSelection={stageManager.getParentSelection}
            onStageManagerHomeClick={stageManager.handleHomeClick}
            onStageManagerSubTabClick={stageManager.handleSubTabClick}
            arrangeSelectedSubTabIds={arrangeSelectedSubTabIds}
            onHandleArrangeSubTabSelectionClick={handleArrangeSubTabSelectionClick}
            onClearArrangeSelection={clearArrangeSelection}
            onConsumeArrangeClickSuppression={consumeArrangeClickSuppression}
            onSelectParentHomeTab={selectParentHomeTabFromRail}
            onSelectSubTab={selectSubTabFromRail}
            onBeginEdit={setEditing}
            onOpenContextMenuForHomeTab={openContextMenuForHomeTab}
            onOpenContextMenuForSubTab={openContextMenuForSubTab}
            onStartArrangeDragSeed={startArrangeDragSeed}
            onStartArrangeTapCandidate={startArrangeTapCandidate}
            onStartArrangePress={startArrangePress}
            onFinalizeArrangeTapCandidate={finalizeArrangeTapCandidate}
            onHandleArrangeTabPointerMove={handleArrangeTabPointerMove}
            onHandleArrangeTabPointerUp={handleArrangeTabPointerUp}
            onClearArrangePressTimer={clearArrangePressTimer}
            onClearArrangeTapCandidate={clearArrangeTapCandidate}
            onCancelArrangeTabPointerDrag={cancelArrangeTabPointerDrag}
            onSetTrashSubTabId={setTrashSubTabId}
            onOpenContextMenuForTrashSubTab={openContextMenuForTrashSubTab}
            onAddSubTab={addSubTab}
            onOpenSubTabSortModal={() => setModal({ type: 'sort-tabs', target: 'subtabs' })}
          />

          {viewMode === 'stage-manager' ? (
            <StageManagerView
              domains={stageManager.domains}
              step={stageManager.step}
              action={stageManager.action}
              selectionKind={stageManager.selectionKind}
              availableActions={stageManager.availableActions}
              draft={stageManager.draft}
              selectionSnapshot={stageManager.selectionSnapshot}
              selectionCounts={stageManager.selectionCounts}
              promoteDomainId={stageManager.promoteDomainId}
              promoteDestinationSpaces={stageManager.promoteDestinationSpaces}
              demoteDomainId={stageManager.demoteDomainId}
              demoteSpaces={stageManager.demoteSpaces}
              demoteSpace={stageManager.demoteSpace}
              demoteParentOptions={stageManager.demoteParentOptions}
              migrateDomainId={stageManager.migrateDomainId}
              migrateDestinationSpaces={stageManager.migrateDestinationSpaces}
              strayHandlingSelectValue={stageManager.strayHandlingSelectValue}
              strayExistingParentOptions={stageManager.strayExistingParentOptions}
              migrateParentDomainId={stageManager.migrateParentDomainId}
              migrateParentSpaces={stageManager.migrateParentSpaces}
              migrateParentOptions={stageManager.migrateParentOptions}
              frontmatterTemplates={state.frontmatter.templates}
              openDestinationAfterApply={state.ui.stageManagerOpenDestinationAfterApply}
              reviewDetails={stageManager.reviewDetails}
              reviewWarning={stageManager.reviewWarning}
              onSelectAll={stageManager.selectAll}
              onDeselectAll={stageManager.deselectAll}
              onSelectAction={stageManager.selectAction}
              onDraftChange={stageManager.updateDraft}
              onOpenDestinationChange={settingsController.updateStageManagerOpenDestinationSetting}
              onPrevious={stageManager.previous}
              onNext={stageManager.next}
              onApply={stageManager.apply}
            />
          ) : isTrashHomeSelected ? (
            <TrashHomeNote
              onRestoreAll={() => setModal({ type: 'trash-restore-all' })}
              onDeleteAll={() => setModal({ type: 'trash-delete-all' })}
            />
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
                pendingCursorRestoreRef.current = null
                pendingScrollToAisleIdRef.current = targetAisleId
                activateAisleEditor(editorKey, {
                  flushPrevious: true,
                  focus: shouldFocusAislePointerActivation(activeAisleIdRef.current, targetAisleId),
                })
                window.requestAnimationFrame(() => {
                  scrollAisleIntoHorizontalView(targetAisleId)
                })
              }}
              mountedAisleIds={mountedAisleIds}
              getPreviewMarkdownForAisle={getPreviewMarkdownForAisle}
              onCloseTableOfContentsAisle={closeTableOfContentsAisle}
              onSelectTableOfContentsHeading={selectTableOfContentsHeading}
              onSelectTableOfContentsLink={selectTableOfContentsLink}
              onOpenTableOfContentsLink={openTableOfContentsLinkTarget}
              onOpenAisleFrontmatter={openFrontmatterModalForAisle}
              onOpenAisleLink={openLinkedAisleModal}
              onRegisterAislePaneRoot={registerAislePaneRoot}
              onRegisterAisleEditorRoot={registerAisleEditorRoot}
            />
          ) : (
            renderEditorShell()
          )}
        </>
      )}

      {storageProfileStatus?.status === 'error' && (
        <div className="storage-status-banner" role="alert">
          <span>{storageProfileStatus.error ?? 'storage profile could not be loaded. saves are paused.'}</span>
          <button type="button" className="btn btn-sm settings-action-btn" onClick={storageProfileController.retryStorageProfile}>
            retry
          </button>
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
          searchFocusStage={noteMention.searchFocusStage}
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
          onScopeChange={(scope) => setFindReplacePanel((current) => ({ ...current, scope, activeIndex: 0 }))}
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
        onClose={() => closeEditorEphemeraRef.current()}
        onEnterArrangeMode={enterArrangeModeFromContext}
        onDuplicateSpace={duplicateSpaceFromContext}
        onRenameSpace={beginRenameSpaceFromContext}
        onRenameDomain={beginRenameDomainFromContext}
        onCopyImage={() => {
          setContextMenu(null)
          void copySelectedImageToClipboard()
        }}
        onOpenInternalNoteLink={openInternalNoteLinkFromContext}
        onRenameInternalNoteLink={renameInternalNoteLinkFromContext}
        onOpenDeleteModal={openDeleteModalFromContext}
        onOpenDeduplicateModal={openDeduplicateModalFromContext}
        onOpenCopyModal={() => {
          if (contextMenu?.type === 'editor') {
            closeEditorEphemeraRef.current()
            openCopyModalForActiveNote()
            return
          }
          openCopyModalFromContext()
        }}
        onMoveToTrash={deleteFromContext}
        onRestoreFromTrash={restoreFromContext}
        onEditorClipboard={runEditorContextClipboardAction}
        onEditorCommand={runEditorContextCommand}
        onEditorInsertLink={openEditorContextLinkModal}
        onEditorInsertAisle={insertAisleFromEditorContext}
        onEditorInsertAttachment={insertAttachmentFromEditorContext}
        onEditorFindReplace={openFindReplacePanel}
        onEditorOpenContextLink={openEditorContextLink}
        onEditorEditContextLink={editEditorContextLink}
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
        onConfirm={confirmModal}
      />

      <AisleEditModal
        open={aisleEditModalOpen && viewMode === 'main'}
        aisles={activeNoteAisles}
        linkedAisleIds={activeLinkedAisleIds}
        onCancel={closeAisleEditModal}
        onApply={applyAisleEditDraftToActiveNote}
        onWarn={(message) => pushToast(message, 'warning')}
      />

      <TipHost tips={visibleTipDefinitions} onDismissTip={dismissTip} />

      <ToastHost
        toasts={toasts}
        onToastMouseEnter={() => {
          toastHoveredRef.current = true
          clearToastTimers()
        }}
        onToastMouseLeave={() => {
          toastHoveredRef.current = false
          toastsRef.current.forEach((toast) => scheduleToastDismiss(toast.id, HOVERED_TOAST_DURATION_MS))
        }}
      />

    </main>
  )
}

export default App
