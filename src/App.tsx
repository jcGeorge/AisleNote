import { useEffect, useRef, useState } from 'react'
import { Editor } from '@toast-ui/editor'
import '@toast-ui/editor/dist/toastui-editor.css'
import './App.css'
import { useActiveNoteModel } from './app/useActiveNoteModel'
import { useArrangeMode } from './arrange/useArrangeMode'
import { DomainsPage } from './components/domains/DomainsPage'
import { ImageToolsOverlay } from './components/editor/ImageToolsOverlay'
import { LegacyEditorShell } from './components/editor/LegacyEditorShell'
import { NewlineOperationsMenu } from './components/editor/NewlineOperationsMenu'
import {
  getNewlineMenuKeyboardAction,
  isNewlineMenuKeyboardKey,
} from './components/editor/newline-menu-keyboard'
import { AisleEditModal } from './components/notes/AisleEditModal'
import { NoteWorkspace } from './components/notes/NoteWorkspace'
import { SubTabRail } from './components/navigation/SubTabRail'
import { TopBar } from './components/navigation/TopBar'
import { ContextMenuHost } from './components/overlays/ContextMenuHost'
import { ModalHost } from './components/overlays/ModalHost'
import { ToastHost } from './components/overlays/ToastHost'
import { appendToastToStack } from './components/overlays/toast-stack'
import { SettingsPage } from './components/settings/SettingsPage'
import { SpacesPage } from './components/spaces/SpacesPage'
import { StageManagerView } from './components/stage-manager/StageManagerView'
import { TrashHomeNote } from './components/trash/TrashHomeNote'
import { applyListToolbarCommand, type ToolbarListCommand } from './editor/list-marker-commands'
import { applyEditorNewlineOperation } from './editor/newline-operations'
import { MAX_AISLE_WARNING_MESSAGE } from './editor/aisle-edit-draft'
import { useAisleController } from './editor/useAisleController'
import { useLegacyEditor } from './editor/useLegacyEditor'
import {
  getCommandCapableEditor,
  getWysiwygView,
} from './editor/prosemirror-utils'
import { useAisleEditors } from './editor/useAisleEditors'
import { useEditorDomEvents } from './editor/useEditorDomEvents'
import { useEditorPersistence } from './editor/useEditorPersistence'
import { useEditorToolbarLayer } from './editor/useEditorToolbarLayer'
import { useEditorToolbarState } from './editor/useEditorToolbarState'
import { useImageTools } from './editor/useImageTools'
import type { MultiLineHeadingLevel } from './editor/multiline-format-operations'
import type { MultiLineListOperation } from './editor/multiline-list-operations'
import { useMultilineEditing } from './editor/useMultilineEditing'
import { useNoteCursorPersistence, usePendingNoteCursorRestore } from './editor/useNoteCursorPersistence'
import {
  COMPLETED_TASK_UNDO_HINT_COOLDOWN_MS,
  COMPLETED_TASK_UNDO_HINT_DETECTION_MS,
  COMPLETED_TASK_UNDO_HINT_MESSAGE,
  COMPLETED_TASK_UNDO_HINT_TOAST_DURATION_MS,
} from './editor/task-behavior'
import { exportAppData, type ExportScope } from './export/export-data'
import { buildFrontmatterModalDraftForNote } from './frontmatter/frontmatter-state'
import { useGlobalHotkeys } from './hotkeys/useGlobalHotkeys'
import {
  mergeLeadingIndentsFromWysiwyg,
  normalizeEmptyHeadingMarkersFromWysiwyg,
  normalizeMarkdownForPersistence,
  preserveBlankParagraphsFromWysiwyg,
} from './markdown/markdown-utils'
import { normalizeMarkdownImageSourcesForPersistence } from './markdown/image-asset-registry'
import { useNavigationHistory } from './navigation/useNavigationHistory'
import { useAppNavigationActions } from './navigation/useAppNavigationActions'
import {
  clearRenameDraftIfMatching,
  createRenameDraft,
  type RenameDraft,
  type RenameEntityType,
} from './navigation/rename-draft'
import {
  getLocationInfo,
} from './notes/note-locations'
import { useNoteReferenceActions } from './notes/useNoteReferenceActions'
import { useAppOverlayActions } from './overlays/useAppOverlayActions'
import { measureSlowOperation } from './performance/performance-logging'
import { DEFAULT_CUSTOM_THEME_PALETTE, getCustomThemePaletteSeedMatch } from './settings/defaults'
import { useSettingsController } from './settings/useSettingsController'
import { applyAutoPurgeToAppState, ensureNoteBodiesForAppState } from './state/app-state'
import {
  setActiveDomain,
  setActiveSpaceInActiveDomain,
  updateActiveSpaceDataInActiveDomain,
  updateSpaceInActiveDomain,
} from './state/domains'
import {
  MAX_NOTE_AISLES,
} from './state/workspace'
import { useStageManagerController } from './stage-manager/useStageManagerController'
import { usePersistentAppState } from './storage/usePersistentAppState'
import { useStorageProfileController } from './storage/useStorageProfileController'
import { TRASH_HOME_ID } from './trash/trash-model'
import { useTrashSelection } from './trash/useTrashSelection'
import type {
  ContextMenuState,
  LinkPromptState,
  ModalState,
  MultiLineInlineFormat,
  NewlineOperationId,
  NoteLocation,
  PendingCreatedEdit,
  ToastState,
  ToastTone,
  ViewMode,
  WorkspaceData,
} from './types/app'
import type { AppStateSnapshotMode } from './storage/persistence-debounce'

type NewlineOperationsMenuState = {
  top: number
  left: number
  operations: NewlineOperationId[]
}

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

function App() {
  const { state, setState, stateRef, flushPendingPersistence, commitAppStateNow } = usePersistentAppState()
  const [viewMode, setViewMode] = useState<ViewMode>('main')
  const [editing, setEditing] = useState<{ type: EditableEntityType; id: string } | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [modal, setModal] = useState<ModalState | null>(null)
  const [newlineOperationsMenu, setNewlineOperationsMenu] = useState<NewlineOperationsMenuState | null>(null)
  const [newlineOperationsMenuActiveIndex, setNewlineOperationsMenuActiveIndex] = useState(0)
  const isMacPlatform = typeof navigator !== 'undefined' ? /mac/i.test(navigator.platform) : false
  const [menuOpen, setMenuOpen] = useState(false)
  const [trashTabId, setTrashTabId] = useState<string>(TRASH_HOME_ID)
  const [trashSubTabId, setTrashSubTabId] = useState<string | null>(null)
  const [activeAisleId, setActiveAisleId] = useState<string>('')
  const [toasts, setToasts] = useState<ToastState[]>([])
  const [linkPrompt, setLinkPrompt] = useState<LinkPromptState>({
    open: false,
    top: 0,
    left: 0,
    url: '',
    text: '',
  })
  const linkPromptInputRef = useRef<HTMLInputElement | null>(null)

  const editorMountRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<Editor | null>(null)
  const aisleScrollRef = useRef<HTMLDivElement | null>(null)
  const aisleHorizontalScrollByBodyRef = useRef<Map<string, number>>(new Map())
  const pendingScrollToAisleIdRef = useRef<string | null>(null)
  const pendingFocusToAisleIdRef = useRef<string | null>(null)
  const editorEventRootRef = useRef<HTMLElement | null>(null)
  const closeNewlineOperationsMenuRef = useRef<(options?: { restoreEditorFocus?: boolean }) => void>(() => {})
  const runNewlineOperationFromMenuRef = useRef<(operation: NewlineOperationId) => void>(() => {})
  const deleteContextPreviewRef = useRef<(tokenId: string) => void>(() => {})
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
  const activateAisleEditorRef = useRef<
    (
      editorKey: string,
      options?: { focus?: boolean; flushPrevious?: boolean; allowDuringPendingRename?: boolean },
    ) => boolean
  >(() => false)
  const completedTaskDeleteUndoCandidateRef = useRef<{ beforeMarkdown: string; deletedAt: number } | null>(null)
  const completedTaskUndoToastAtRef = useRef(0)
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
    const id = Math.max(Date.now(), toastIdRef.current + 1)
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

  const settingsController = useSettingsController({
    state,
    stateRef,
    commitAppStateNow,
    activeSpace,
    viewMode,
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

  const storageProfileController = useStorageProfileController({
    pushToast,
    beforeStorageAction: () => flushStorageActionStateRef.current(),
  })
  const storageProfileStatus = storageProfileController.storageProfileStatus

  const trackCompletedTaskQuickDelete = (beforeMarkdown: string) => {
    completedTaskDeleteUndoCandidateRef.current = {
      beforeMarkdown: normalizeMarkdownForPersistence(beforeMarkdown),
      deletedAt: Date.now(),
    }
  }

  const maybeShowCompletedTaskUndoHint = (markdown: string) => {
    const candidate = completedTaskDeleteUndoCandidateRef.current
    if (!candidate) return

    const now = Date.now()
    if (now - candidate.deletedAt > COMPLETED_TASK_UNDO_HINT_DETECTION_MS) {
      completedTaskDeleteUndoCandidateRef.current = null
      return
    }

    if (normalizeMarkdownForPersistence(markdown) !== candidate.beforeMarkdown) return

    completedTaskDeleteUndoCandidateRef.current = null
    if (now - completedTaskUndoToastAtRef.current < COMPLETED_TASK_UNDO_HINT_COOLDOWN_MS) return

    completedTaskUndoToastAtRef.current = now
    pushToast(COMPLETED_TASK_UNDO_HINT_MESSAGE, 'warning', COMPLETED_TASK_UNDO_HINT_TOAST_DURATION_MS)
  }

  useEffect(() => {
    closeImageToolsRef.current()
  }, [activeSpace.id, activeTab.id, activeSubTab?.id, activeNoteBodyId, viewMode])

  useEffect(() => {
    if (resolvedActiveAisleId && resolvedActiveAisleId !== activeAisleId) {
      setActiveAisleId(resolvedActiveAisleId)
    }
  }, [activeAisleId, resolvedActiveAisleId])

  useEffect(() => {
    const scrollNode = aisleScrollRef.current
    if (viewMode !== 'main' || !activeNoteBodyId || !scrollNode) return

    const animationFrame = window.requestAnimationFrame(() => {
      const pendingAisleId = pendingScrollToAisleIdRef.current
      if (pendingAisleId) {
        const escapedAisleId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(pendingAisleId) : pendingAisleId
        const pendingPane = scrollNode.querySelector<HTMLElement>(`[data-aisle-id="${escapedAisleId}"]`)
        if (pendingPane) {
          pendingPane.scrollIntoView({ block: 'nearest', inline: 'end' })
          aisleHorizontalScrollByBodyRef.current.set(activeNoteBodyId, scrollNode.scrollLeft)
          pendingScrollToAisleIdRef.current = null
          return
        }
        pendingScrollToAisleIdRef.current = null
      }

      scrollNode.scrollLeft = aisleHorizontalScrollByBodyRef.current.get(activeNoteBodyId) ?? 0
    })

    return () => window.cancelAnimationFrame(animationFrame)
  }, [viewMode, activeNoteBodyId, activeNoteAisles.length])

  useEffect(() => {
    if (!activeNoteBodyId || activeNoteBody) return
    setState((previous) => ensureNoteBodiesForAppState(previous))
  }, [activeNoteBody, activeNoteBodyId, setState])

  const {
    trashParentTabs,
    selectedTrashTab,
    trashSubTabs,
    selectedTrashSubTab,
    trashDisplay,
  } = useTrashSelection({
    workspace,
    viewMode,
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

  const updateActiveSpaceData = (updater: (data: WorkspaceData) => WorkspaceData) => {
    setState((previous) => {
      const sanitizedPrevious = applyAutoPurgeToAppState(previous)
      return updateActiveSpaceDataInActiveDomain(sanitizedPrevious, updater)
    })
  }

  const getCurrentNoteLocation = (): NoteLocation => activeNoteLocation

  const getNormalizedEditorMarkdown = (editor: Editor) =>
    measureSlowOperation('editor markdown normalization', () =>
      normalizeMarkdownImageSourcesForPersistence(
        normalizeEmptyHeadingMarkersFromWysiwyg(
          editor,
          preserveBlankParagraphsFromWysiwyg(
            editor,
            normalizeMarkdownForPersistence(mergeLeadingIndentsFromWysiwyg(editor, editor.getMarkdown())),
          ),
        ),
      ),
    )

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
  const scheduleAisleStructuralHistoryFallback = aisleController.scheduleAisleStructuralHistoryFallback
  const addAisleToActiveNote = aisleController.addAisleToActiveNote
  const applyAisleEditDraftToActiveNote = aisleController.applyAisleEditDraftToActiveNote

  const navigateToNoteLocation = (location: NoteLocation) => {
    saveActiveCursorBeforeNavigation()
    const targetInfo = getLocationInfo(stateRef.current, location)
    if (!targetInfo.domain || !targetInfo.space || !targetInfo.tab || (location.subTabId && !targetInfo.subTab)) {
      pushToast('that note no longer exists.', 'warning')
      return
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
    setContextMenu(null)
    setEditing(null)
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
  })
  const arrangeMode = arrange.mode
  const arrangeDraggingItem = arrange.draggingItem
  const spaceArrangeDragPreview = arrange.spaceDragPreview
  const tabArrangeDragPreview = arrange.tabDragPreview
  const primaryTabRailRef = arrange.primaryTabRailRef
  const subTabRailRef = arrange.subTabRailRef
  const spacesGridRef = arrange.spacesGridRef
  const arrangeTrashDropRef = arrange.trashDropRef
  const isDraggingOverArrangeTrashDrop = arrange.isDraggingOverTrashDrop
  const suppressNextSpaceArrangeExitRef = arrange.suppressNextSpaceArrangeExitRef
  const clearArrangePressTimer = arrange.clearPressTimer
  const clearArrangeTapCandidate = arrange.clearTapCandidate
  const consumeArrangeClickSuppression = arrange.consumeClickSuppression
  const enterArrangeModeFromContext = arrange.enterFromContext
  const exitArrangeMode = arrange.exit
  const startArrangeDragSeed = arrange.startDragSeed
  const startArrangeTapCandidate = arrange.startTapCandidate
  const startArrangePress = arrange.startPress
  const finalizeArrangeTapCandidate = arrange.finalizeTapCandidate
  const handleArrangeSpacePointerMove = arrange.handleSpacePointerMove
  const handleArrangeSpacePointerUp = arrange.handleSpacePointerUp
  const cancelArrangeSpacePointerDrag = arrange.cancelSpacePointerDrag
  const handleArrangeTabPointerMove = arrange.handleTabPointerMove
  const handleArrangeTabPointerUp = arrange.handleTabPointerUp
  const cancelArrangeTabPointerDrag = arrange.cancelTabPointerDrag

  const navigationActions = useAppNavigationActions({
    state,
    setState,
    viewMode,
    setViewMode,
    contextMenu,
    setContextMenu,
    setMenuOpen,
    setEditing,
    editingRef,
    renameDraftRef,
    workspace,
    activeTab,
    activeNoteBodyId,
    resolvedActiveAisleId,
    activeSpaceIdRef,
    editorRef,
    pendingContentRef,
    pendingCreatedEditRef,
    skipRenameBlurRef,
    saveTimerRef,
    lastEditorMarkdownRef,
    pendingFocusToAisleIdRef,
    pendingCursorRestoreRef,
    closeImageToolsRef,
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
  const openSpace = navigationActions.openSpace
  const addSpace = navigationActions.addSpace
  const duplicateSpaceFromContext = navigationActions.duplicateSpaceFromContext
  const openSpacesView = navigationActions.openSpacesView
  const openDomainsView = navigationActions.openDomainsView
  const openDomain = navigationActions.openDomain
  const addDomainFromPage = navigationActions.addDomainFromPage
  const toggleTrashView = navigationActions.toggleTrashView
  const openSettings = navigationActions.openSettings

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
      setMenuOpen(false)
      setContextMenu(null)
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

    closeImageTools()
    closeLinkPrompt()
    clearMultiLineEdit(false)
    setContextMenu(null)

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }

    pendingContentRef.current = null
    normalizingContentRef.current = false
    normalizingAisleIdsRef.current.delete(activeAisleIdRef.current)
    lastEditorMarkdownRef.current = ''
    lastEditorMarkdownByAisleRef.current.set(activeAisleIdRef.current, '')
    currentEditor.setMarkdown('', false)
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
  const tryApplyMultiLineBlockQuoteOperation = multilineEditing.tryApplyBlockQuoteOperation
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
  const headingToolbarButtonRef = editorToolbar.headingToolbarButtonRef
  const aisleToolbarButtonRef = editorToolbar.aisleToolbarButtonRef
  const toolbarFormatState = editorToolbar.toolbarFormatState
  const activeHeadingLevel = editorToolbar.activeHeadingLevel
  const toolbarShortcutFeedback = editorToolbar.toolbarShortcutFeedback
  const noteToolsOpen = editorToolbar.noteToolsOpen
  const headingMenuOpen = editorToolbar.headingMenuOpen
  const toolbarPopoverPosition = editorToolbar.toolbarPopoverPosition
  const setNoteToolsOpen = editorToolbar.setNoteToolsOpen
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
  const getContextPreviewData = noteReferenceActions.getContextPreviewData
  const insertLinkIntoActiveEditor = noteReferenceActions.insertLinkIntoActiveEditor
  const insertNoteReference = noteReferenceActions.insertNoteReference
  const deleteContextPreview = noteReferenceActions.deleteContextPreview
  const openNoteReferenceModal = noteReferenceActions.openNoteReferenceModal
  const openInternalNoteLinkFromContext = noteReferenceActions.openInternalNoteLinkFromContext
  const renameInternalNoteLinkFromContext = noteReferenceActions.renameInternalNoteLinkFromContext

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
    commitCurrentEditorContent,
    pushToast,
    maybeShowCompletedTaskUndoHint,
    trackCompletedTaskQuickDelete,
    tryExpandMultilineSelection,
    scheduleToolbarFormatStateSync,
    getContextPreviewData,
    navigateToNoteLocation,
    deleteContextPreview: (tokenId) => deleteContextPreviewRef.current(tokenId),
  })
  const activateAisleEditor = aisleEditors.activateAisleEditor
  const activateEditorFromEventTarget = aisleEditors.activateEditorFromEventTarget
  const registerAisleEditorRoot = aisleEditors.registerAisleEditorRoot
  const registerAislePaneRoot = aisleEditors.registerAislePaneRoot
  const mountedAisleIds = aisleEditors.mountedAisleIds
  const getPreviewMarkdownForAisle = aisleEditors.getPreviewMarkdownForAisle
  activateAisleEditorRef.current = activateAisleEditor

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
    activateAisleEditor,
  })

  const openLinkPrompt = (url: string, top: number, left: number, text?: string) => {
    setLinkPrompt({
      open: true,
      top,
      left,
      url,
      text: text && text.trim().length > 0 ? text : '',
    })
    window.setTimeout(() => {
      const input = linkPromptInputRef.current
      if (!input) return
      input.focus()
      input.select()
    }, 10)
  }

  const closeLinkPrompt = () => {
    setLinkPrompt({ open: false, top: 0, left: 0, url: '', text: '' })
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

  const scheduleActiveEditorCommandCommit = (currentEditor: Editor) => {
    window.setTimeout(() => {
      if (editorRef.current === currentEditor) {
        commitActiveEditorMarkdownNow(currentEditor)
        syncToolbarFormatState()
      }
    }, 0)
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
    getCommandCapableEditor(currentEditor).exec(format)
    scheduleActiveEditorCommandCommit(currentEditor)
    return true
  }

  const runActiveEditorCommand = (command: string, payload?: Record<string, unknown>) => {
    const currentEditor = editorRef.current
    if (!currentEditor) return false
    currentEditor.focus()
    if (command === 'bold' || command === 'italic' || command === 'strike') {
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
    if (command === 'blockQuote' && multiLineEditRef.current) {
      if (tryApplyMultiLineBlockQuoteOperation()) {
        scheduleActiveEditorCommandCommit(currentEditor)
      }
      return true
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
      getCommandCapableEditor(currentEditor).exec(command, payload)
    }
    scheduleActiveEditorCommandCommit(currentEditor)
    return true
  }

  const runActiveNewlineOperation = (operation: NewlineOperationId) => {
    const currentEditor = editorRef.current
    if (!currentEditor) return false
    if (operation === 'operationsMenu') {
      openNewlineOperationsMenu()
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
    if (multiLineEditRef.current && (operation === 'blockQuote' || operation === 'codeBlock')) {
      const handled =
        operation === 'blockQuote'
          ? tryApplyMultiLineBlockQuoteOperation()
          : tryApplyMultiLineCodeBlockOperation()
      if (handled) {
        commitActiveEditorMarkdownNow(currentEditor)
        syncToolbarFormatState()
      }
      return true
    }
    if (multiLineEditRef.current && multiLineOperation) {
      if (tryApplyMultiLineListOperation(multiLineOperation)) {
        commitActiveEditorMarkdownNow(currentEditor)
        syncToolbarFormatState()
      }
      return true
    }

    const beforeAisleSnapshot = operation === 'aisle' ? captureActiveAisleStructuralSnapshot() : null
    const result = applyEditorNewlineOperation(currentEditor, operation)
    if (!result.handled) return false

    commitActiveEditorMarkdownNow(currentEditor)
    syncToolbarFormatState()
    if (operation === 'aisle') {
      closeImageTools()
      addAisleToActiveNote(result.aisleMarkdown ?? '', { beforeSnapshot: beforeAisleSnapshot })
    }
    return true
  }

  const getNewlineOperationsMenuPosition = (operationCount: number): Pick<NewlineOperationsMenuState, 'top' | 'left'> => {
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

  const openNewlineOperationsMenu = () => {
    if (viewMode !== 'main' || !editorRef.current) return
    const operations = stateRef.current.hotkeys.newlineShortcuts.menuOperations
    setNewlineOperationsMenuActiveIndex(0)
    setNewlineOperationsMenu({
      ...getNewlineOperationsMenuPosition(operations.length),
      operations,
    })
  }

  const closeNewlineOperationsMenu = (options: { restoreEditorFocus?: boolean } = {}) => {
    const editorToRestore = options.restoreEditorFocus ? editorRef.current : null
    setNewlineOperationsMenuActiveIndex(0)
    setNewlineOperationsMenu(null)
    if (!editorToRestore) return

    window.requestAnimationFrame(() => {
      if (editorRef.current !== editorToRestore) return
      editorToRestore.focus()
      syncToolbarFormatState()
    })
  }
  closeNewlineOperationsMenuRef.current = closeNewlineOperationsMenu

  const runNewlineOperationFromMenu = (operation: NewlineOperationId) => {
    closeNewlineOperationsMenu()
    runActiveNewlineOperation(operation)
  }
  runNewlineOperationFromMenuRef.current = runNewlineOperationFromMenu

  useEffect(() => {
    if (!newlineOperationsMenu) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isNewlineMenuKeyboardKey(event)) return
      event.preventDefault()
      event.stopPropagation()

      const action = getNewlineMenuKeyboardAction(
        event,
        newlineOperationsMenuActiveIndex,
        newlineOperationsMenu.operations.length,
      )
      if (action.type === 'close') {
        closeNewlineOperationsMenuRef.current({ restoreEditorFocus: true })
        return
      }
      if (action.type === 'highlight') {
        setNewlineOperationsMenuActiveIndex(action.index)
        return
      }
      if (action.type === 'run') {
        const operation = newlineOperationsMenu.operations[action.index]
        if (operation) runNewlineOperationFromMenuRef.current(operation)
      }
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('.newline-operations-menu')) return
      closeNewlineOperationsMenuRef.current()
    }

    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('pointerdown', handlePointerDown, true)
    }
  }, [newlineOperationsMenu, newlineOperationsMenuActiveIndex])

  const insertNamedLinkFromPrompt = () => {
    if (!linkPrompt.url) return
    const label = linkPrompt.text.trim() || linkPrompt.url
    insertLinkIntoActiveEditor(label, linkPrompt.url)
    closeLinkPrompt()
  }

  deleteContextPreviewRef.current = deleteContextPreview

  useLegacyEditor({
    viewMode,
    isEditorView,
    displayContent,
    syncKey: [
      activeSpace.id,
      activeTab.id,
      activeSubTab?.id ?? '',
      resolvedActiveAisleId,
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
    isImageCropActive,
    selectImageForTools,
    refreshImageToolsPosition,
    copySelectedImageToClipboard,
    deleteActiveEditorImageNode,
    setMenuOpen,
    setContextMenu,
    navigateToNoteLocation,
    openLinkPrompt,
    getToolbarFormatShortcut,
    queueToolbarShortcutFeedback,
    syncToolbarFormatState,
    onRunFormatCommand: runActiveEditorFormatCommand,
    getEditorHistoryDirection,
    onEditorSelectionChange: saveActiveCursorLocation,
    onRunStructuralHistory: runAisleStructuralHistory,
    onEditorHistoryFallback: scheduleAisleStructuralHistoryFallback,
    onRunNewlineOperation: runActiveNewlineOperation,
    onOpenNewlineOperationsMenu: openNewlineOperationsMenu,
    scheduleMultiLineHistoryRestore,
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

  const openFrontmatterModalForActiveNote = () => {
    if (viewMode !== 'main' || !activeNoteBodyId) return
    saveActiveCursorBeforeNavigation()
    const latestState = stateRef.current
    const draft = buildFrontmatterModalDraftForNote(latestState, activeNoteBodyId, activeNoteLocation)
    setModal({
      type: 'frontmatter-note',
      noteBodyId: activeNoteBodyId,
      location: activeNoteLocation,
      rows: draft.rows,
      selectedTemplateId: draft.selectedTemplateId,
      templateDerived: draft.templateDerived,
      isTemplateSuggestionDraft: draft.isTemplateSuggestionDraft,
    })
  }

  const openFrontmatterTemplateSettings = (templateId: string) => {
    settingsController.setSettingsFrontmatterTemplate(templateId)
    settingsController.changeSection('frontmatter')
    setModal(null)
    openSettings()
  }

  const overlayActions = useAppOverlayActions({
    state,
    stateRef,
    setState,
    viewMode,
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
    insertNoteReference,
    exportData,
    pushToast,
  })
  const openContextMenuForTab = overlayActions.openContextMenuForTab
  const openContextMenuForSubTab = overlayActions.openContextMenuForSubTab
  const openContextMenuForHomeTab = overlayActions.openContextMenuForHomeTab
  const openContextMenuForTrashTab = overlayActions.openContextMenuForTrashTab
  const openContextMenuForTrashSubTab = overlayActions.openContextMenuForTrashSubTab
  const openContextMenuForSpace = overlayActions.openContextMenuForSpace
  const openContextMenuForDomain = overlayActions.openContextMenuForDomain
  const openDeleteModalFromContext = overlayActions.openDeleteModalFromContext
  const deleteFromContext = overlayActions.deleteFromContext
  const openCopyModalFromContext = overlayActions.openCopyModalFromContext
  const openCopyModalForActiveNote = overlayActions.openCopyModalForActiveNote
  const openDeduplicateModalFromContext = overlayActions.openDeduplicateModalFromContext
  const getCurrentDuplicateCount = overlayActions.getCurrentDuplicateCount
  const beginRenameSpaceFromContext = overlayActions.beginRenameSpaceFromContext
  const beginRenameDomainFromContext = overlayActions.beginRenameDomainFromContext
  const confirmModal = overlayActions.confirmModal

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

  const editorToolbarLayer = useEditorToolbarLayer({
    editorRef,
    headingToolbarButtonRef,
    aisleToolbarButtonRef,
    toolbarFormatState,
    activeHeadingLevel,
    toolbarShortcutFeedback,
    noteToolsOpen,
    headingMenuOpen,
    toolbarPopoverPosition,
    activeNoteAisles,
    setNoteToolsOpen,
    setHeadingMenuOpen,
    setToolbarPopoverPosition,
    refreshToolbarPopoverPosition,
    runActiveEditorCommand,
    commitActiveEditorMarkdownNow,
    insertLinkIntoActiveEditor,
    clearActiveNoteContent,
    openNoteReferenceModal,
    openCopyModalForActiveNote,
    openFrontmatterModalForActiveNote,
    addAisleToActiveNote: () => {
      closeImageTools()
      addAisleToActiveNote()
    },
    openAisleEditModal: () => {
      closeImageTools()
      openAisleEditModal()
    },
    pushToast,
  })

  const renderImageToolsOverlay = () => (
    <ImageToolsOverlay
      visible={viewMode === 'main' && !aisleEditModalOpen}
      imageTools={imageTools}
      inlineCrop={inlineCrop}
      onStartCrop={startInlineCrop}
      onOpenTransform={openImageTransformMenu}
      onReturnToStart={returnToImageToolsMenu}
      onTransformImage={transformSelectedImage}
      onApplyCrop={applyInlineCrop}
      onCancelCrop={cancelInlineCrop}
      onBeginResize={beginImageResize}
      onBeginCropDrag={beginInlineCropMouseDrag}
    />
  )

  const renderEditorShell = () => (
    <LegacyEditorShell
      viewMode={viewMode}
      editorReadOnly={editorReadOnly}
      editorMountRef={editorMountRef}
      linkPromptInputRef={linkPromptInputRef}
      linkPrompt={linkPrompt}
      imageToolsOverlay={renderImageToolsOverlay()}
      onOpenNoteReference={openNoteReferenceModal}
      onLinkPromptTextChange={(text) => setLinkPrompt((previous) => ({ ...previous, text }))}
      onInsertNamedLink={insertNamedLinkFromPrompt}
      onCloseLinkPrompt={closeLinkPrompt}
    />
  )

  const canDeleteSpace = state.spaces.length > 1

  useGlobalHotkeys({
    viewMode,
    activeTab,
    primeTabs: workspace.tabs,
    arrangeMode,
    hotkeys: state.hotkeys,
    isMacPlatform,
    editingShortcut: settingsController.editingShortcut,
    setEditingShortcut: settingsController.setEditingShortcut,
    updateShortcutSetting: settingsController.updateShortcutSetting,
    exitArrangeMode,
    openSettings,
    openSpacesView,
    openDomainsView,
    toggleTrashView,
    returnToLastTabLikeView,
    navigateHistoryBy,
    addTab,
    addSubTab,
    formatStrikethrough: () => runActiveEditorFormatCommand('strike'),
    selectTab,
    selectSubTab,
  })

  const isNoteWorkspaceView = viewMode === 'main' || viewMode === 'stage-manager'
  const arrangeableParentTabClassName = arrangeMode.active && arrangeMode.scope === 'tabs' && viewMode === 'main' ? 'is-arrangeable' : ''
  const arrangeableSubTabClassName = arrangeMode.active && arrangeMode.scope === 'tabs' && viewMode === 'main' ? 'is-arrangeable' : ''
  const draggingParentTabId =
    arrangeMode.active && arrangeDraggingItem?.type === 'tab' ? arrangeDraggingItem.tabId : null
  const draggingSubTabId =
    arrangeMode.active && arrangeDraggingItem?.type === 'subtab' ? arrangeDraggingItem.subTabId : null
  const arrangeableSpaceClassName = arrangeMode.active && arrangeMode.scope === 'spaces' && viewMode === 'spaces' ? 'is-arrangeable' : ''
  const draggingSpaceId =
    arrangeMode.active && arrangeDraggingItem?.type === 'space' ? arrangeDraggingItem.spaceId : null
  const customThemePalette = state.theme === 'custom'
    ? state.ui.customThemePalette ?? DEFAULT_CUSTOM_THEME_PALETTE
    : null
  const customThemeSeedSource = getCustomThemePaletteSeedMatch(customThemePalette)
  const customThemeClassName = customThemePalette
    ? customThemeSeedSource
      ? `theme-custom-seed-${customThemeSeedSource} ${
          customThemeSeedSource === 'dark' ? '' : `theme-${customThemeSeedSource}`
        }`
      : 'theme-custom-derived'
    : ''

  return (
    <main
      className={`app-shell theme-${state.theme} ${customThemeClassName} view-${viewMode} ${
        viewMode === 'stage-manager' ? 'view-stage-manager' : ''
      }`}
      style={
        {
          '--tab-button-scale': String(state.ui.tabButtonScale),
          '--note-font-scale': String(state.ui.noteFontScale),
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
              }
            : {}),
        } as React.CSSProperties
      }
    >
      <TopBar
        viewMode={viewMode}
        workspace={workspace}
        activeTab={activeTab}
        editing={editing}
        arrangeMode={arrangeMode}
        primaryTabRailRef={primaryTabRailRef}
        isNoteWorkspaceView={isNoteWorkspaceView}
        arrangeableParentTabClassName={arrangeableParentTabClassName}
        draggingParentTabId={draggingParentTabId}
        draggingSubTabId={draggingSubTabId}
        arrangeTrashDropRef={arrangeTrashDropRef}
        isArrangeTrashDropTarget={isDraggingOverArrangeTrashDrop}
        trashParentTabs={trashParentTabs}
        trashTabId={trashTabId}
        menuOpen={menuOpen}
        onAutoSizeRenameInput={autoSizeRenameInput}
        onShouldSkipRenameBlur={shouldSkipRenameBlur}
        onCommitRename={commitRename}
        onCancelRename={cancelRename}
        onRenameDraftChange={trackRenameDraft}
        onClearRenameDraft={clearRenameDraft}
        onGetStageManagerParentSelection={stageManager.getParentSelection}
        onStageManagerParentClick={stageManager.handleParentClick}
        onConsumeArrangeClickSuppression={consumeArrangeClickSuppression}
        onSelectTab={selectTab}
        onBeginEdit={setEditing}
        onOpenContextMenuForTab={openContextMenuForTab}
        onStartArrangeDragSeed={startArrangeDragSeed}
        onStartArrangeTapCandidate={startArrangeTapCandidate}
        onStartArrangePress={startArrangePress}
        onHandleArrangeTabPointerMove={handleArrangeTabPointerMove}
        onHandleArrangeTabPointerUp={handleArrangeTabPointerUp}
        onClearArrangePressTimer={clearArrangePressTimer}
        onCancelArrangeTabPointerDrag={cancelArrangeTabPointerDrag}
        onSetTrashTabId={setTrashTabId}
        onSetTrashSubTabId={setTrashSubTabId}
        onOpenContextMenuForTrashTab={openContextMenuForTrashTab}
        onAddTab={addTab}
        onExitArrangeMode={exitArrangeMode}
        onEndStageManager={stageManager.end}
        onCloseSettingsView={closeSettingsView}
        onSetMenuOpen={setMenuOpen}
        onOpenDomains={openDomainsView}
        onOpenSpaces={openSpacesView}
        onOpenStageManager={stageManager.open}
        onToggleTrash={toggleTrashView}
        onOpenSettings={openSettings}
      />

      {tabArrangeDragPreview && (
        <div
          className={`tab-arrange-preview ${tabArrangeDragPreview.variant === 'subtab' ? 'is-subtab' : 'is-parent'}`}
          style={{
            left: `${tabArrangeDragPreview.currentX - tabArrangeDragPreview.offsetX}px`,
            top: `${tabArrangeDragPreview.currentY - tabArrangeDragPreview.offsetY}px`,
            width: `${tabArrangeDragPreview.width}px`,
            height: `${tabArrangeDragPreview.height}px`,
          }}
        >
          <span>{tabArrangeDragPreview.label}</span>
        </div>
      )}

      {viewMode === 'domains' ? (
        <DomainsPage
          domains={state.domains}
          activeDomainId={state.activeDomainId}
          editingDomainId={editing?.type === 'domain' ? editing.id : null}
          onAddDomain={addDomainFromPage}
          onOpenDomain={openDomain}
          onCommitRename={(domainId, name) => commitRename('domain', domainId, name)}
          onCancelRename={(domainId) => cancelRename('domain', domainId)}
          onShouldSkipRenameBlur={(domainId) => shouldSkipRenameBlur('domain', domainId)}
          onRenameDraftChange={(domainId, value) => trackRenameDraft('domain', domainId, value)}
          onOpenContextMenu={openContextMenuForDomain}
        />
      ) : viewMode === 'spaces' ? (
        <SpacesPage
          spaces={state.spaces}
          activeSpaceId={state.activeSpaceId}
          editingSpaceId={editing?.type === 'space' ? editing.id : null}
          arrangeMode={arrangeMode}
          arrangeableSpaceClassName={arrangeableSpaceClassName}
          draggingSpaceId={draggingSpaceId}
          spaceArrangeDragPreview={spaceArrangeDragPreview}
          spacesGridRef={spacesGridRef}
          onBackgroundClick={() => {
            if (arrangeMode.active && arrangeMode.scope === 'spaces') {
              if (suppressNextSpaceArrangeExitRef.current) {
                suppressNextSpaceArrangeExitRef.current = false
                return
              }
              exitArrangeMode()
            }
          }}
          onOpenDomains={openDomainsView}
          onOpenSpace={openSpace}
          onAddSpace={addSpace}
          onExitArrangeMode={exitArrangeMode}
          onCommitRename={(spaceId, name) => commitRename('space', spaceId, name)}
          onCancelRename={(spaceId) => cancelRename('space', spaceId)}
          onShouldSkipRenameBlur={(spaceId) => shouldSkipRenameBlur('space', spaceId)}
          onRenameDraftChange={(spaceId, value) => trackRenameDraft('space', spaceId, value)}
          onOpenContextMenu={openContextMenuForSpace}
          onConsumeArrangeClickSuppression={consumeArrangeClickSuppression}
          onStartArrangeDragSeed={startArrangeDragSeed}
          onStartArrangeTapCandidate={startArrangeTapCandidate}
          onStartArrangePress={startArrangePress}
          onHandleArrangeSpacePointerMove={handleArrangeSpacePointerMove}
          onHandleArrangeSpacePointerUp={handleArrangeSpacePointerUp}
          onClearArrangePressTimer={clearArrangePressTimer}
          onCancelArrangeSpacePointerDrag={cancelArrangeSpacePointerDrag}
        />
      ) : viewMode === 'settings' ? (
        <SettingsPage
          state={state}
          section={settingsController.section}
          isMacPlatform={isMacPlatform}
          shortcutDrafts={settingsController.shortcutDrafts}
          newlineShortcutDrafts={settingsController.newlineShortcutDrafts}
          editingShortcut={settingsController.editingShortcut}
          mouseBackForwardEnabled={settingsController.mouseBackForwardEnabledDraft}
          genericHistoryHotkeysEnabled={settingsController.genericHistoryHotkeysEnabledDraft}
          settingsDaysDraft={settingsController.settingsDaysDraft}
          activeSpaceId={activeSpace.id}
          exportStatus={settingsController.exportStatus}
          tabButtonScaleDraft={settingsController.tabButtonScaleDraft}
          noteFontScaleDraft={settingsController.noteFontScaleDraft}
          customThemePaletteDraft={settingsController.customThemePaletteDraft}
          showParentHomeTabDraft={settingsController.showParentHomeTabDraft}
          frontmatterDraft={settingsController.frontmatterDraft}
          frontmatterDraftDirty={settingsController.frontmatterDraftDirty}
          storageProfileStatus={storageProfileStatus}
          onSectionChange={settingsController.changeSection}
          onToggleShortcutEdit={settingsController.toggleShortcutEdit}
          onNewlineShortcutChange={settingsController.updateNewlineShortcutSetting}
          onOpenNewlineMenuSettings={() => setModal({ type: 'newline-menu-settings' })}
          onMouseBackForwardChange={settingsController.updateMouseBackForwardSetting}
          onGenericHistoryHotkeysChange={settingsController.updateGenericHistoryHotkeysSetting}
          onAutoRemoveDaysChange={settingsController.updateAutoRemoveDaysSetting}
          onExportSpace={(spaceId) => setModal({ type: 'export-space', spaceId })}
          onExportAll={() => exportData('all')}
          onThemeChange={settingsController.updateThemeSetting}
          onCustomThemePaletteChange={settingsController.updateCustomThemePaletteSetting}
          onCustomThemePaletteReset={settingsController.resetCustomThemePaletteSetting}
          onCustomThemePaletteSeedFromCurrentTheme={settingsController.seedCustomThemePaletteFromCurrentTheme}
          onTabButtonScaleChange={settingsController.updateTabButtonScaleSetting}
          onNoteFontScaleChange={settingsController.updateNoteFontScaleSetting}
          onShowParentHomeTabChange={settingsController.updateShowParentHomeTabSetting}
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
            showParentHomeTab={state.ui.showParentHomeTab}
            isNoteWorkspaceView={isNoteWorkspaceView}
            selectedTrashTab={selectedTrashTab}
            trashSubTabs={trashSubTabs}
            selectedTrashSubTabId={selectedTrashSubTab?.id ?? null}
            subTabRailRef={subTabRailRef}
            arrangeableSubTabClassName={arrangeableSubTabClassName}
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
            onConsumeArrangeClickSuppression={consumeArrangeClickSuppression}
            onSelectParentHomeTab={selectParentHomeTab}
            onSelectSubTab={selectSubTab}
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
          />

          {viewMode === 'stage-manager' ? (
            <StageManagerView
              domains={state.domains}
              step={stageManager.step}
              action={stageManager.action}
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
              otherSpaces={stageManager.otherSpaces}
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
              aisleScrollRef={aisleScrollRef}
              toolbar={editorToolbarLayer.toolbar}
              headingPopover={editorToolbarLayer.popovers}
              imageToolsOverlay={renderImageToolsOverlay()}
              onRootChange={(node) => {
                editorEventRootRef.current = node
              }}
              onAisleScroll={(scrollLeft) => {
                if (!activeNoteBodyId) return
                aisleHorizontalScrollByBodyRef.current.set(activeNoteBodyId, scrollLeft)
              }}
              onActivateAisle={(editorKey) => {
                pendingCursorRestoreRef.current = null
                activateAisleEditor(editorKey, { flushPrevious: true, focus: true })
              }}
              mountedAisleIds={mountedAisleIds}
              getPreviewMarkdownForAisle={getPreviewMarkdownForAisle}
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

      {newlineOperationsMenu && (
        <NewlineOperationsMenu
          top={newlineOperationsMenu.top}
          left={newlineOperationsMenu.left}
          operations={newlineOperationsMenu.operations}
          activeIndex={Math.max(
            0,
            Math.min(newlineOperationsMenu.operations.length - 1, newlineOperationsMenuActiveIndex),
          )}
          onHighlight={setNewlineOperationsMenuActiveIndex}
          onRun={runNewlineOperationFromMenu}
        />
      )}

      <ContextMenuHost
        contextMenu={contextMenu}
        canDeleteSpace={canDeleteSpace}
        duplicateCount={getCurrentDuplicateCount()}
        onClose={() => setContextMenu(null)}
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
        onOpenCopyModal={openCopyModalFromContext}
        onMoveToTrash={deleteFromContext}
      />

      <ModalHost
        modal={modal}
        state={state}
        activeSpace={activeSpace}
        domainsForPickers={domainsForPickers}
        newlineMenuOperations={settingsController.newlineMenuOperationsDraft}
        onModalChange={setModal}
        onNewlineMenuOperationsChange={settingsController.updateNewlineMenuOperationsSetting}
        onEditFrontmatterTemplate={openFrontmatterTemplateSettings}
        onWarn={(message) => pushToast(message, 'warning')}
        onError={(message) => pushToast(message, 'error')}
        onConfirm={confirmModal}
      />

      <AisleEditModal
        open={aisleEditModalOpen && viewMode === 'main'}
        aisles={activeNoteAisles}
        onCancel={closeAisleEditModal}
        onApply={applyAisleEditDraftToActiveNote}
        onWarn={(message) => pushToast(message, 'warning')}
      />

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
