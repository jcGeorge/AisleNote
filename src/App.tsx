import { type MouseEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Editor } from '@toast-ui/editor'
import '@toast-ui/editor/dist/toastui-editor.css'
import './App.css'
import { useArrangeMode } from './arrange/useArrangeMode'
import { DomainsPage } from './components/domains/DomainsPage'
import { EditorToolbarPopovers } from './components/editor/EditorToolbarPopovers'
import { ImageToolsOverlay } from './components/editor/ImageToolsOverlay'
import { LegacyEditorShell } from './components/editor/LegacyEditorShell'
import { SharedEditorToolbar } from './components/editor/SharedEditorToolbar'
import { DEFAULT_TOOLBAR_FORMAT_STATE, type ToolbarFormatKey, type ToolbarFormatState } from './components/editor/toolbar-state'
import { NoteWorkspace } from './components/notes/NoteWorkspace'
import { SubTabRail } from './components/navigation/SubTabRail'
import { TopBar } from './components/navigation/TopBar'
import { ContextMenuHost } from './components/overlays/ContextMenuHost'
import { ModalHost } from './components/overlays/ModalHost'
import { ToastHost } from './components/overlays/ToastHost'
import { SettingsPage } from './components/settings/SettingsPage'
import { SpacesPage } from './components/spaces/SpacesPage'
import { StageManagerView } from './components/stage-manager/StageManagerView'
import { TrashHomeNote } from './components/trash/TrashHomeNote'
import { buildAisleEditorKey, type AisleEditorMeta } from './editor/aisle-editor'
import {
  EDITOR_TOOLBAR_ITEMS,
  getMultilineSelectionShortcutDirection,
  headingSpaceShortcutPlugin,
  installClearToolbarButton,
  installHeadingPopupActiveState,
  multiLineSelectionShortcutPlugin,
  thematicBreakShortcutPlugin,
} from './editor/editor-setup'
import {
  CODE_BLOCK_INDENT_TEXT,
  getCodeBlockOutdentRemoveLength,
  getCommandCapableEditor,
  getElementFromEventTarget,
  getInternalNoteLinkHitAtDocPosition,
  getWysiwygView,
} from './editor/prosemirror-utils'
import { createContextPreviewPlugin } from './editor/note-preview-plugin'
import { useImageTools } from './editor/useImageTools'
import {
  COMPLETED_TASK_UNDO_HINT_COOLDOWN_MS,
  COMPLETED_TASK_UNDO_HINT_DETECTION_MS,
  COMPLETED_TASK_UNDO_HINT_MESSAGE,
  COMPLETED_TASK_UNDO_HINT_TOAST_DURATION_MS,
  installCompletedTaskCheckboxBehavior,
  installTaskTextReorderBehavior,
} from './editor/task-behavior'
import { exportAppData, type ExportScope } from './export/export-data'
import {
  buildSplitLineMultiLineState,
  cloneMultiLineEditState,
  findNextWordColumn,
  findPreviousWordColumn,
  getMultiLineColumnOffset,
  getMultiLineHeadColumnOffset,
  getMultiLineSelectionRange,
  getMultiLineSelectionRanges,
  getMultiLineSelectedBlockIndices,
  getMultiLineSplitPlan,
  moveMultiLineCursorState,
  type MultiLineCursorMovement,
  type MultiLineEditInput,
} from './editor/multiline-edit'
import {
  findEditorTextLineRangeIndex,
  getEditorTextLineRanges,
  isCodeBlockTextLineRange,
} from './editor/multiline-ranges'
import { eventMatchesShortcut } from './hotkeys/shortcuts'
import { useGlobalHotkeys } from './hotkeys/useGlobalHotkeys'
import {
  getIndentPrefixLength,
  getTrailingIndentPrefixLength,
  INDENT_TOKEN,
  materializeHorizontalRuleShortcut,
  mergeLeadingIndentsFromWysiwyg,
  normalizeEmptyHeadingMarkersFromWysiwyg,
  normalizeMarkdownForPersistence,
} from './markdown/markdown-utils'
import { useNavigationHistory } from './navigation/useNavigationHistory'
import { cloneNoteBodyAsIndependentCopy, getNoteBodyMarkdown } from './notes/note-markdown'
import {
  buildNoteLocationKey,
  getDefaultNoteReferenceTarget,
  getLocationInfo,
  listNoteLocationsForBody,
  updateNoteLocationBody,
} from './notes/note-locations'
import {
  buildContextToken,
  buildInternalNoteUrl,
  escapeMarkdownLinkLabel,
  getContextReferenceSignature,
  type InternalNoteLinkHit,
  type NoteContextReferencePayload,
  parseContextReferences,
  parseInternalNoteUrl,
  replaceInternalNoteLinkByOccurrence,
  replaceContextTokenById,
  wouldCreateContextCycle,
} from './notes/note-references'
import { useSettingsController } from './settings/useSettingsController'
import { applyAutoPurgeToAppState, applyMarkdownToAppState, ensureNoteBodiesForAppState, parseSavedState } from './state/app-state'
import {
  addDomain,
  addSpaceToActiveDomain,
  createDomain,
  insertSpaceAfterInActiveDomain,
  removeSpaceFromActiveDomain,
  renameDomain,
  renameSpaceInActiveDomain,
  setActiveDomain,
  setActiveSpaceInActiveDomain,
  updateActiveSpaceDataInActiveDomain,
  updateSpaceInActiveDomain,
} from './state/domains'
import {
  createId,
  createNoteBody,
  createSpace,
  createSubTab,
  createTab,
  duplicateSpace,
  MAX_NOTE_AISLES,
} from './state/workspace'
import { useStageManagerController } from './stage-manager/useStageManagerController'
import { appStateStore } from './storage/app-state-store'
import { buildTrashParentBuckets, resolveTrashContentDisplay, TRASH_HOME_ID } from './trash/trash-model'
import type {
  AppState,
  ContextMenuState,
  DeleteTarget,
  LinkPromptState,
  ModalState,
  MultiLineEditState,
  NoteAisle,
  NoteBody,
  NoteLocation,
  PendingContent,
  PendingCreatedEdit,
  ToastState,
  ToastTone,
  TrashParentBucket,
  ViewMode,
  WorkspaceData,
} from './types/app'

type AisleDeleteConfirmationState = {
  aisleId: string
  aisleIndex: number
  top: number
  left: number
}

type ToolbarPopoverKind = 'heading' | 'aisles'

type ToolbarPopoverPosition = {
  top: number
  left: number
}

const TOOLBAR_POPOVER_WIDTH_PX = 168
const TOOLBAR_POPOVER_VIEWPORT_MARGIN_PX = 8
const AISLE_DELETE_CONFIRMATION_WIDTH_PX = 248
const AISLE_DELETE_CONFIRMATION_HEIGHT_PX = 104

const DEFAULT_TOAST_DURATION_MS = 3000
const HOVERED_TOAST_DURATION_MS = 2000

type EditableEntityType = 'tab' | 'subtab' | 'space' | 'domain'

type MultiLineEditHistoryEntry = {
  noteKey: string
  beforeMarkdown: string
  afterMarkdown: string
  beforeState: MultiLineEditState
  afterState: MultiLineEditState
}

let renameInputMeasureContext: CanvasRenderingContext2D | null = null

function App() {
  const initialSerializedState = useMemo(() => appStateStore.load(), [])
  const [state, setState] = useState<AppState>(() => applyAutoPurgeToAppState(parseSavedState(initialSerializedState)))
  const [storageHydrated, setStorageHydrated] = useState(() => typeof appStateStore.hydrate !== 'function')
  const [viewMode, setViewMode] = useState<ViewMode>('main')
  const [editing, setEditing] = useState<{ type: EditableEntityType; id: string } | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [modal, setModal] = useState<ModalState | null>(null)
  const isMacPlatform = typeof navigator !== 'undefined' ? /mac/i.test(navigator.platform) : false
  const [menuOpen, setMenuOpen] = useState(false)
  const [trashTabId, setTrashTabId] = useState<string>(TRASH_HOME_ID)
  const [trashSubTabId, setTrashSubTabId] = useState<string | null>(null)
  const [activeAisleId, setActiveAisleId] = useState<string>('')
  const [toast, setToast] = useState<ToastState | null>(null)
  const [toastHovered, setToastHovered] = useState(false)
  const [toastWasHovered, setToastWasHovered] = useState(false)
  const [linkPrompt, setLinkPrompt] = useState<LinkPromptState>({
    open: false,
    top: 0,
    left: 0,
    url: '',
    text: '',
  })
  const [toolbarFormatState, setToolbarFormatState] = useState<ToolbarFormatState>(DEFAULT_TOOLBAR_FORMAT_STATE)
  const [toolbarShortcutFeedback, setToolbarShortcutFeedback] = useState<ToolbarFormatKey | null>(null)
  const [noteToolsOpen, setNoteToolsOpen] = useState(false)
  const [headingMenuOpen, setHeadingMenuOpen] = useState(false)
  const [aisleDeleteConfirmation, setAisleDeleteConfirmation] = useState<AisleDeleteConfirmationState | null>(null)
  const [toolbarPopoverPosition, setToolbarPopoverPosition] = useState<Record<ToolbarPopoverKind, ToolbarPopoverPosition | null>>({
    heading: null,
    aisles: null,
  })
  const [aisleDeleteMode, setAisleDeleteMode] = useState(false)
  const linkPromptInputRef = useRef<HTMLInputElement | null>(null)
  const aisleDeleteConfirmButtonRef = useRef<HTMLButtonElement | null>(null)

  const editorMountRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<Editor | null>(null)
  const headingToolbarButtonRef = useRef<HTMLButtonElement | null>(null)
  const aisleToolbarButtonRef = useRef<HTMLButtonElement | null>(null)
  const aisleScrollRef = useRef<HTMLDivElement | null>(null)
  const aisleHorizontalScrollByBodyRef = useRef<Map<string, number>>(new Map())
  const pendingScrollToAisleIdRef = useRef<string | null>(null)
  const editorEventRootRef = useRef<HTMLElement | null>(null)
  const aisleEditorRootsRef = useRef<Map<string, HTMLElement>>(new Map())
  const aisleEditorMetaRef = useRef<Map<string, AisleEditorMeta>>(new Map())
  const pendingContentRef = useRef<PendingContent | null>(null)
  const pendingCreatedEditRef = useRef<PendingCreatedEdit | null>(null)
  const skipRenameBlurRef = useRef<{ type: EditableEntityType; id: string } | null>(null)
  const saveTimerRef = useRef<number | null>(null)
  const toastTimerRef = useRef<number | null>(null)
  const toolbarShortcutFeedbackTimerRef = useRef<number | null>(null)
  const normalizingContentRef = useRef(false)
  const completedTaskDeleteUndoCandidateRef = useRef<{ beforeMarkdown: string; deletedAt: number } | null>(null)
  const completedTaskUndoToastAtRef = useRef(0)
  const lastEditorMarkdownRef = useRef('')
  const lastEditorMarkdownByAisleRef = useRef<Map<string, string>>(new Map())
  const normalizingAisleIdsRef = useRef<Set<string>>(new Set())
  const multiLineEditRef = useRef<MultiLineEditState | null>(null)
  const multiLineCursorPluginKeyRef = useRef<any>(null)
  const multiLineEditHistoryRef = useRef<MultiLineEditHistoryEntry[]>([])
  const stateRef = useRef(state)
  const initialStateJsonRef = useRef<string>(JSON.stringify(parseSavedState(initialSerializedState)))
  const stateDirtySinceBootRef = useRef(false)

  const activeSpaceIdRef = useRef<string>('')
  const activeTabIdRef = useRef<string>('')
  const activeSubTabIdRef = useRef<string | null>(null)
  const activeAisleIdRef = useRef<string>('')
  const isMainViewRef = useRef(true)
  stateRef.current = state

  const getToolbarPopoverButton = (kind: ToolbarPopoverKind) =>
    kind === 'aisles' ? aisleToolbarButtonRef.current : headingToolbarButtonRef.current

  const getToolbarPopoverPosition = (kind: ToolbarPopoverKind): ToolbarPopoverPosition | null => {
    const button = getToolbarPopoverButton(kind)
    if (!button || !button.isConnected) return null
    const rect = button.getBoundingClientRect()
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth
    const maxLeft = Math.max(TOOLBAR_POPOVER_VIEWPORT_MARGIN_PX, viewportWidth - TOOLBAR_POPOVER_WIDTH_PX - TOOLBAR_POPOVER_VIEWPORT_MARGIN_PX)
    return {
      top: rect.bottom + 6,
      left: Math.min(Math.max(TOOLBAR_POPOVER_VIEWPORT_MARGIN_PX, rect.left), maxLeft),
    }
  }

  const refreshToolbarPopoverPosition = (kind: ToolbarPopoverKind) => {
    const position = getToolbarPopoverPosition(kind)
    if (!position) {
      setHeadingMenuOpen(false)
      setNoteToolsOpen(false)
      return
    }
    setToolbarPopoverPosition((previous) => ({ ...previous, [kind]: position }))
  }

  const closeToolbarPopovers = () => {
    setHeadingMenuOpen(false)
    setNoteToolsOpen(false)
  }

  useEffect(() => {
    const openPopoverKind: ToolbarPopoverKind | null = noteToolsOpen ? 'aisles' : headingMenuOpen ? 'heading' : null
    if (!openPopoverKind) return

    const refreshPosition = () => refreshToolbarPopoverPosition(openPopoverKind)
    const handlePointerDown = (event: PointerEvent) => {
      const target = getElementFromEventTarget(event.target)
      const button = getToolbarPopoverButton(openPopoverKind)
      if (
        target?.closest('.note-toolbar-heading-popover, .note-toolbar-aisle-popover') ||
        (button && event.target instanceof Node && button.contains(event.target))
      ) {
        return
      }
      closeToolbarPopovers()
    }

    refreshPosition()
    window.addEventListener('resize', refreshPosition)
    window.addEventListener('scroll', refreshPosition, true)
    window.addEventListener('pointerdown', handlePointerDown, true)
    return () => {
      window.removeEventListener('resize', refreshPosition)
      window.removeEventListener('scroll', refreshPosition, true)
      window.removeEventListener('pointerdown', handlePointerDown, true)
    }
  }, [headingMenuOpen, noteToolsOpen, viewMode])

  useEffect(() => {
    if (typeof appStateStore.hydrate !== 'function') return

    let disposed = false
    Promise.resolve(
      appStateStore.hydrate((serializedState) => {
        if (disposed || stateDirtySinceBootRef.current) return
        const nextState = applyAutoPurgeToAppState(parseSavedState(serializedState))
        const nextSerializedState = JSON.stringify(nextState)
        initialStateJsonRef.current = nextSerializedState
        if (nextSerializedState === JSON.stringify(stateRef.current)) return
        setState(nextState)
      }),
    ).finally(() => {
      if (!disposed) {
        setStorageHydrated(true)
      }
    })

    return () => {
      disposed = true
    }
  }, [])

  useEffect(() => {
    const sanitizedState = applyAutoPurgeToAppState(state)
    if (sanitizedState !== state) {
      stateRef.current = sanitizedState
      setState(sanitizedState)
      return
    }
    const serializedState = JSON.stringify(sanitizedState)
    stateDirtySinceBootRef.current = serializedState !== initialStateJsonRef.current
    if (!storageHydrated) return
    appStateStore.save(serializedState)
  }, [state, storageHydrated])

  useEffect(() => {
    const runAutoPurgeSweep = () => {
      setState((previous) => applyAutoPurgeToAppState(previous))
    }

    const intervalId = window.setInterval(runAutoPurgeSweep, 60_000)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        runAutoPurgeSweep()
      }
    }

    window.addEventListener('focus', runAutoPurgeSweep)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', runAutoPurgeSweep)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
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
    if (!toast) return
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current)
      toastTimerRef.current = null
    }
    if (toastHovered) return

    const durationMs = toastWasHovered ? HOVERED_TOAST_DURATION_MS : toast.durationMs
    toastTimerRef.current = window.setTimeout(() => {
      toastTimerRef.current = null
      setToast(null)
    }, durationMs)

    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current)
        toastTimerRef.current = null
      }
    }
  }, [toast, toastHovered, toastWasHovered])

  useEffect(() => {
    if (!toast) return
    setToastHovered(false)
    setToastWasHovered(false)
  }, [toast?.id])

  const activeSpace = useMemo(
    () => state.spaces.find((space) => space.id === state.activeSpaceId) ?? state.spaces[0],
    [state.activeSpaceId, state.spaces],
  )

  const workspace = activeSpace.data
  const settingsController = useSettingsController({
    state,
    stateRef,
    setState,
    activeSpace,
    viewMode,
    storageHydrated,
  })

  const pushToast = (message: string, tone: ToastTone = 'warning', durationMs = DEFAULT_TOAST_DURATION_MS) => {
    setToast({
      id: Date.now(),
      message,
      tone,
      durationMs,
    })
  }

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

  const exitAisleDeleteMode = () => {
    setAisleDeleteMode(false)
    setAisleDeleteConfirmation(null)
  }

  const activeTab = useMemo(
    () => workspace.tabs.find((tab) => tab.id === workspace.activeTabId) ?? workspace.tabs[0],
    [workspace.activeTabId, workspace.tabs],
  )

  const activeSubTab = useMemo(
    () =>
      activeTab.activeSubTabId
        ? activeTab.subTabs.find((sub) => sub.id === activeTab.activeSubTabId) ?? null
        : null,
    [activeTab],
  )
  const activeNoteBodyId = activeSubTab?.noteBodyId ?? activeTab.noteBodyId
  const activeNoteBody = useMemo(
    () => state.noteBodies.find((body) => body.id === activeNoteBodyId) ?? null,
    [activeNoteBodyId, state.noteBodies],
  )
  const activeNoteAisles = activeNoteBody?.aisles ?? []
  const resolvedActiveAisleId =
    activeNoteAisles.some((aisle) => aisle.id === activeAisleId) ? activeAisleId : activeNoteAisles[0]?.id ?? ''
  const domainsForPickers = useMemo(
    () => state.domains.map((domain) => (domain.id === state.activeDomainId ? { ...domain, spaces: state.spaces } : domain)),
    [state.activeDomainId, state.domains, state.spaces],
  )

  useEffect(() => {
    closeImageTools()
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
  }, [activeNoteBody, activeNoteBodyId])

  const activeContent = getNoteBodyMarkdown(activeNoteBody, resolvedActiveAisleId)

  const trashParentTabs = useMemo(
    () => buildTrashParentBuckets(workspace),
    [workspace.deletedTabs, workspace.deletedSubTabs],
  )

  const selectedTrashTab = useMemo(
    () => (trashTabId === TRASH_HOME_ID ? null : trashParentTabs.find((entry) => entry.id === trashTabId) ?? null),
    [trashTabId, trashParentTabs],
  )

  const trashSubTabs = useMemo(() => (selectedTrashTab ? selectedTrashTab.subTabs : []), [selectedTrashTab])

  const selectedTrashSubTab = useMemo(
    () => (trashSubTabId ? trashSubTabs.find((sub) => sub.id === trashSubTabId) ?? null : null),
    [trashSubTabId, trashSubTabs],
  )

  const trashHomeContent = `# Trash\n\nItems moved here are pending deletion.\n\n- Use **Restore All** to move everything back into notes.\n- Use **delete all** to permanently remove all items in Trash.\n- This Trash note is read-only.`

  const trashDisplay = resolveTrashContentDisplay({
    trashTabId,
    trashHomeContent,
    selectedTrashTab,
    selectedTrashSubTab,
  })

  const displayContent = viewMode === 'trash' ? trashDisplay.markdown : activeContent

  activeSpaceIdRef.current = activeSpace.id
  activeTabIdRef.current = activeTab.id
  activeSubTabIdRef.current = activeSubTab?.id ?? null
  activeAisleIdRef.current = resolvedActiveAisleId
  isMainViewRef.current = viewMode === 'main'

  const updateActiveSpaceData = (updater: (data: WorkspaceData) => WorkspaceData) => {
    setState((previous) => {
      const sanitizedPrevious = applyAutoPurgeToAppState(previous)
      return updateActiveSpaceDataInActiveDomain(sanitizedPrevious, updater)
    })
  }

  const getCurrentNoteLocation = (): NoteLocation => ({
    domainId: state.activeDomainId,
    spaceId: activeSpace.id,
    tabId: activeTab.id,
    subTabId: activeSubTab?.id ?? null,
  })

  const navigateToNoteLocation = (location: NoteLocation) => {
    flushPendingContent()
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

  const applyContentToTarget = (
    spaceId: string,
    tabId: string,
    subTabId: string | null,
    aisleId: string,
    markdown: string,
  ) => {
    setState((previous) => applyMarkdownToAppState(previous, spaceId, tabId, subTabId, aisleId, markdown))
  }

  const buildStateWithLatestEditorContent = () => {
    let nextState = stateRef.current
    const pending = pendingContentRef.current
    if (pending) {
      return applyAutoPurgeToAppState(
        applyMarkdownToAppState(
          nextState,
          pending.spaceId,
          pending.tabId,
          pending.subTabId,
          pending.aisleId,
          pending.markdown,
        ),
      )
    }

    if (!isMainViewRef.current) return applyAutoPurgeToAppState(nextState)

    if (!editorRef.current) return applyAutoPurgeToAppState(nextState)
    const markdown = lastEditorMarkdownRef.current

    nextState = applyMarkdownToAppState(
      nextState,
      activeSpaceIdRef.current,
      activeTabIdRef.current,
      activeSubTabIdRef.current,
      activeAisleIdRef.current,
      markdown,
    )
    return applyAutoPurgeToAppState(nextState)
  }

  const persistLatestStateSnapshot = () => {
    const latestState = buildStateWithLatestEditorContent()
    appStateStore.save(JSON.stringify(latestState))
  }

  useEffect(() => {
    window.__tabsGetLatestAppState = () => JSON.stringify(buildStateWithLatestEditorContent())
    return () => {
      delete window.__tabsGetLatestAppState
    }
  }, [])

  const flushPendingContent = () => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }

    if (pendingContentRef.current) {
      const pending = pendingContentRef.current
      pendingContentRef.current = null
      applyContentToTarget(pending.spaceId, pending.tabId, pending.subTabId, pending.aisleId, pending.markdown)
      return
    }

    if (!isMainViewRef.current) return

    if (!editorRef.current) return
    const markdown = lastEditorMarkdownRef.current
    applyContentToTarget(
      activeSpaceIdRef.current,
      activeTabIdRef.current,
      activeSubTabIdRef.current,
      activeAisleIdRef.current,
      markdown,
    )
  }

  const arrange = useArrangeMode({
    state,
    setState,
    viewMode,
    editing,
    contextMenu,
    workspace,
    activeTab,
    flushPendingContent,
    updateActiveSpaceData,
    setMenuOpen,
    setContextMenu,
    setEditing,
    exitAisleDeleteMode,
  })
  const arrangeMode = arrange.mode
  const arrangeDraggingItem = arrange.draggingItem
  const spaceArrangeDragPreview = arrange.spaceDragPreview
  const tabArrangeDragPreview = arrange.tabDragPreview
  const primaryTabRailRef = arrange.primaryTabRailRef
  const subTabRailRef = arrange.subTabRailRef
  const spacesGridRef = arrange.spacesGridRef
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

  const scheduleContentCommit = (
    markdown: string,
    spaceId: string,
    tabId: string,
    subTabId: string | null,
    aisleId: string,
  ) => {
    const normalizedMarkdown = normalizeMarkdownForPersistence(markdown)
    if (aisleId === activeAisleIdRef.current) {
      lastEditorMarkdownRef.current = normalizedMarkdown
    }
    pendingContentRef.current = { spaceId, tabId, subTabId, aisleId, markdown: normalizedMarkdown }

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
    }

    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null
      if (!pendingContentRef.current) return
      const next = pendingContentRef.current
      pendingContentRef.current = null
      applyContentToTarget(next.spaceId, next.tabId, next.subTabId, next.aisleId, next.markdown)
    }, 180)
  }

  const addAisleToActiveNote = () => {
    if (!activeNoteBodyId) return
    const currentAisleCount = activeNoteBody?.aisles.length ?? 0
    if (currentAisleCount <= 0) return
    if (currentAisleCount >= MAX_NOTE_AISLES) {
      pushToast(`notes can have at most ${MAX_NOTE_AISLES} aisles.`, 'warning')
      return
    }

    const newAisle: NoteAisle = { id: createId(), markdown: '' }
    flushPendingContent()
    setState((previous) => {
      const body = previous.noteBodies.find((candidate) => candidate.id === activeNoteBodyId)
      if (!body) return previous
      if (body.aisles.length >= MAX_NOTE_AISLES) return previous
      return {
        ...previous,
        noteBodies: previous.noteBodies.map((candidate) =>
          candidate.id === activeNoteBodyId ? { ...candidate, aisles: [...candidate.aisles, newAisle] } : candidate,
        ),
      }
    })
    setActiveAisleId(newAisle.id)
    pendingScrollToAisleIdRef.current = newAisle.id
    exitAisleDeleteMode()
  }

  const deleteAisleFromActiveNote = (aisleId: string) => {
    if (!activeNoteBody) return
    if (activeNoteBody.aisles.length <= 1) {
      pushToast('a note must keep at least one aisle.', 'warning')
      return
    }

    if (!activeNoteBody.aisles.some((candidate) => candidate.id === aisleId)) return
    flushPendingContent()
    const fallbackAisleId = activeNoteBody.aisles.find((candidate) => candidate.id !== aisleId)?.id ?? ''
    setAisleDeleteConfirmation(null)
    setState((previous) => ({
      ...previous,
      noteBodies: previous.noteBodies.map((body) =>
        body.id === activeNoteBody.id
          ? { ...body, aisles: body.aisles.filter((candidate) => candidate.id !== aisleId) }
          : body,
      ),
    }))
    if (activeAisleIdRef.current === aisleId) {
      setActiveAisleId(fallbackAisleId)
    }
  }

  const getAisleDeleteConfirmationPosition = (anchor: HTMLElement): Pick<AisleDeleteConfirmationState, 'top' | 'left'> => {
    const rect = anchor.getBoundingClientRect()
    const margin = 8
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight
    return {
      top: Math.max(
        margin,
        Math.min(viewportHeight - AISLE_DELETE_CONFIRMATION_HEIGHT_PX - margin, rect.bottom + margin),
      ),
      left: Math.max(
        margin,
        Math.min(viewportWidth - AISLE_DELETE_CONFIRMATION_WIDTH_PX - margin, rect.right - AISLE_DELETE_CONFIRMATION_WIDTH_PX),
      ),
    }
  }

  const requestDeleteAisleFromActiveNote = (aisle: NoteAisle, aisleIndex: number, anchor: HTMLElement) => {
    if (!activeNoteBody || activeNoteBody.aisles.length <= 1) {
      pushToast('a note must keep at least one aisle.', 'warning')
      return
    }

    if (aisle.markdown.trim().length <= 0) {
      deleteAisleFromActiveNote(aisle.id)
      return
    }

    setAisleDeleteConfirmation({
      aisleId: aisle.id,
      aisleIndex,
      ...getAisleDeleteConfirmationPosition(anchor),
    })
    window.requestAnimationFrame(() => {
      aisleDeleteConfirmButtonRef.current?.focus()
    })
  }

  useEffect(() => {
    if ((viewMode !== 'main' || activeNoteAisles.length <= 1) && aisleDeleteMode) {
      exitAisleDeleteMode()
      return
    }
    if (aisleDeleteConfirmation && !activeNoteAisles.some((aisle) => aisle.id === aisleDeleteConfirmation.aisleId)) {
      setAisleDeleteConfirmation(null)
    }
  }, [activeNoteAisles, aisleDeleteConfirmation, aisleDeleteMode, viewMode])

  useEffect(() => {
    if (viewMode !== 'trash') return

    if (trashTabId === TRASH_HOME_ID) {
      if (trashSubTabId !== null) setTrashSubTabId(null)
      return
    }

    if (!selectedTrashTab) {
      setTrashTabId(TRASH_HOME_ID)
      setTrashSubTabId(null)
      return
    }

    if (trashSubTabId && !selectedTrashSubTab) {
      setTrashSubTabId(null)
    }
  }, [viewMode, trashTabId, trashSubTabId, selectedTrashTab, selectedTrashSubTab])

  const isTrashHomeSelected = viewMode === 'trash' && trashDisplay.mode === 'home'
  const isEditorView = viewMode === 'main' || (viewMode === 'trash' && !isTrashHomeSelected)

  const commitCurrentEditorContent = () => {
    if (!isMainViewRef.current) return
    const currentEditor = editorRef.current
    if (!currentEditor) return
    const markdown = getNormalizedEditorMarkdown(currentEditor)
    lastEditorMarkdownRef.current = markdown
    lastEditorMarkdownByAisleRef.current.set(activeAisleIdRef.current, markdown)
    scheduleContentCommit(
      markdown,
      activeSpaceIdRef.current,
      activeTabIdRef.current,
      activeSubTabIdRef.current,
      activeAisleIdRef.current,
    )
  }

  const focusEditorAtDocumentStart = () => {
    const currentEditor = editorRef.current as
      | (Editor & {
          wwEditor?: {
            view?: any
          }
        })
      | null

    const view = currentEditor?.wwEditor?.view
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

  const getActiveNoteHistoryKey = () =>
    [
      activeSpaceIdRef.current,
      activeTabIdRef.current,
      activeSubTabIdRef.current ?? '__home__',
      activeAisleIdRef.current,
    ].join('::')

  const getNormalizedEditorMarkdown = (editor: Editor) =>
    normalizeEmptyHeadingMarkersFromWysiwyg(
      editor,
      normalizeMarkdownForPersistence(mergeLeadingIndentsFromWysiwyg(editor, editor.getMarkdown())),
    )

  const isPendingCreatedRenameActive = () => {
    return Boolean(pendingCreatedEditRef.current)
  }

  const areToolbarFormatStatesEqual = (first: ToolbarFormatState, second: ToolbarFormatState) =>
    first.bold === second.bold && first.italic === second.italic && first.strike === second.strike

  const hasActiveEditorMark = (view: any, markName: string) => {
    const markType = view?.state?.schema?.marks?.[markName]
    if (!markType) return false

    const { state } = view
    const { selection } = state
    if (selection.empty) {
      const marks = state.storedMarks ?? selection.$from?.marks?.() ?? []
      return marks.some((mark: any) => mark?.type === markType)
    }

    return state.doc.rangeHasMark(selection.from, selection.to, markType)
  }

  const getCurrentToolbarFormatState = (): ToolbarFormatState => {
    const view = getWysiwygView(editorRef.current)
    if (!view) return DEFAULT_TOOLBAR_FORMAT_STATE
    return {
      bold: hasActiveEditorMark(view, 'strong'),
      italic: hasActiveEditorMark(view, 'emph'),
      strike: hasActiveEditorMark(view, 'strike'),
    }
  }

  const syncToolbarFormatState = () => {
    const nextState = getCurrentToolbarFormatState()
    setToolbarFormatState((previous) => (areToolbarFormatStatesEqual(previous, nextState) ? previous : nextState))
  }

  const scheduleToolbarFormatStateSync = () => {
    window.requestAnimationFrame(syncToolbarFormatState)
  }

  const getToolbarFormatShortcut = (event: KeyboardEvent): ToolbarFormatKey | null => {
    const key = event.key.toLowerCase()
    const isMod = isMacPlatform ? event.metaKey : event.ctrlKey
    if (!isMod || event.altKey) return null
    if (key === 'b') return 'bold'
    if (key === 'i') return 'italic'
    if (key === 's' && !eventMatchesShortcut(event, stateRef.current.hotkeys.shortcuts.openSpaces, isMacPlatform)) return 'strike'
    return null
  }

  const queueToolbarShortcutFeedback = (format: ToolbarFormatKey) => {
    if (toolbarShortcutFeedbackTimerRef.current !== null) {
      window.clearTimeout(toolbarShortcutFeedbackTimerRef.current)
    }
    setToolbarShortcutFeedback(format)
    toolbarShortcutFeedbackTimerRef.current = window.setTimeout(() => {
      toolbarShortcutFeedbackTimerRef.current = null
      setToolbarShortcutFeedback((current) => (current === format ? null : current))
    }, 650)
  }

  const activateAisleEditor = (
    editorKey: string,
    options: { flushPrevious?: boolean; focus?: boolean; allowDuringPendingRename?: boolean } = {},
  ) => {
    if (isPendingCreatedRenameActive() && !options.allowDuringPendingRename) return false
    const meta = aisleEditorMetaRef.current.get(editorKey)
    if (!meta) return false

    const switchingAisle = activeAisleIdRef.current !== meta.aisleId
    if (switchingAisle && options.flushPrevious) {
      flushPendingContent()
      clearMultiLineEdit(false)
      closeImageTools()
    }

    editorRef.current = meta.editor
    activeAisleIdRef.current = meta.aisleId
    multiLineCursorPluginKeyRef.current = meta.pluginKey
    const markdown = getNormalizedEditorMarkdown(meta.editor)
    lastEditorMarkdownRef.current = markdown
    lastEditorMarkdownByAisleRef.current.set(meta.aisleId, markdown)
    if (activeAisleId !== meta.aisleId) {
      setActiveAisleId(meta.aisleId)
    }
    if (options.focus) {
      meta.editor.focus()
    }
    scheduleToolbarFormatStateSync()
    return true
  }

  const activateEditorFromEventTarget = (target: EventTarget | null) => {
    const element = getElementFromEventTarget(target)
    if (!element) return false
    const host = element.closest('[data-aisle-editor-key]')
    if (!(host instanceof HTMLElement)) return false
    const editorKey = host.dataset.aisleEditorKey
    return editorKey ? activateAisleEditor(editorKey, { flushPrevious: true }) : false
  }

  const registerAisleEditorRoot = (editorKey: string, node: HTMLElement | null) => {
    if (node) {
      aisleEditorRootsRef.current.set(editorKey, node)
    } else {
      aisleEditorRootsRef.current.delete(editorKey)
    }
  }

  const recordMultiLineEditHistory = (
    beforeMarkdown: string,
    beforeState: MultiLineEditState,
    afterMarkdown: string,
    afterState: MultiLineEditState,
  ) => {
    if (beforeMarkdown === afterMarkdown) return
    multiLineEditHistoryRef.current = [
      ...multiLineEditHistoryRef.current.slice(-99),
      {
        noteKey: getActiveNoteHistoryKey(),
        beforeMarkdown,
        afterMarkdown,
        beforeState: cloneMultiLineEditState(beforeState),
        afterState: cloneMultiLineEditState(afterState),
      },
    ]
  }

  const scheduleMultiLineHistoryRestore = (direction: 'undo' | 'redo') => {
    const noteKey = getActiveNoteHistoryKey()
    window.requestAnimationFrame(() => {
      if (noteKey !== getActiveNoteHistoryKey()) return
      const currentEditor = editorRef.current
      if (!currentEditor) return

      const markdown = getNormalizedEditorMarkdown(currentEditor)
      const entries = multiLineEditHistoryRef.current
      const entry = [...entries]
        .reverse()
        .find((candidate) =>
          candidate.noteKey === noteKey &&
          (direction === 'undo' ? candidate.beforeMarkdown === markdown : candidate.afterMarkdown === markdown),
        )
      if (!entry) return

      multiLineEditRef.current = cloneMultiLineEditState(direction === 'undo' ? entry.beforeState : entry.afterState)
      syncMultiLineEditVisualSelection()
    })
  }

  const getEditorHistoryDirection = (event: KeyboardEvent): 'undo' | 'redo' | null => {
    const key = event.key.toLowerCase()
    const isMod = isMacPlatform ? event.metaKey : event.ctrlKey
    if (!isMod || event.altKey) return null
    if (key === 'z' && !event.shiftKey) return 'undo'
    if (key === 'z' && event.shiftKey) return 'redo'
    if (!isMacPlatform && key === 'y' && !event.shiftKey) return 'redo'
    return null
  }

  useEffect(() => {
    const flushOnExit = () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      persistLatestStateSnapshot()
    }

    window.addEventListener('beforeunload', flushOnExit)
    window.addEventListener('pagehide', flushOnExit)
    return () => {
      window.removeEventListener('beforeunload', flushOnExit)
      window.removeEventListener('pagehide', flushOnExit)
    }
  }, [])

  const tryApplyMultilineIndent = (outdent: boolean) => {
    const currentEditor = editorRef.current as
      | (Editor & {
          wwEditor?: {
            view?: any
          }
        })
      | null

    const view = currentEditor?.wwEditor?.view
    if (!currentEditor || !view) {
      return false
    }

    const { state } = view
    const { from, to, $from } = state.selection
    const isCollapsedSelection = from === to
    const selectedText = state.doc.textBetween(from, to, '\n')
    const selectionFrom = Math.min(from, to)
    const selectionTo = Math.max(from, to)
    const touchedLineRanges = getEditorTextLineRanges(view).filter((range) =>
      isCollapsedSelection
        ? selectionFrom >= range.start && selectionFrom <= range.end + 1
        : range.start <= selectionTo && range.end >= selectionFrom,
    )
    const codeBlockLineRanges = touchedLineRanges.filter(isCodeBlockTextLineRange)

    if (!isCollapsedSelection && codeBlockLineRanges.length > 1 && codeBlockLineRanges.length === touchedLineRanges.length) {
      const targets = codeBlockLineRanges
        .map((range) => ({
          pos: range.start,
          removeLength: outdent ? getCodeBlockOutdentRemoveLength(range.text) : 0,
        }))
        .filter((target) => !outdent || target.removeLength > 0)

      if (targets.length === 0) return false

      let tr: any = state.tr
      for (const target of [...targets].sort((a, b) => b.pos - a.pos)) {
        tr = outdent
          ? tr.delete(target.pos, target.pos + target.removeLength)
          : tr.insertText(CODE_BLOCK_INDENT_TEXT, target.pos)
      }

      const nextFrom = tr.mapping.map(from, outdent ? -1 : 1)
      const nextTo = tr.mapping.map(to, outdent ? -1 : 1)
      view.dispatch(tr)
      const markdownAfterCodeIndent = normalizeMarkdownForPersistence(
        mergeLeadingIndentsFromWysiwyg(currentEditor, currentEditor.getMarkdown()),
      )
      lastEditorMarkdownRef.current = markdownAfterCodeIndent
      scheduleContentCommit(
        markdownAfterCodeIndent,
        activeSpaceIdRef.current,
        activeTabIdRef.current,
        activeSubTabIdRef.current,
        activeAisleIdRef.current,
      )
      window.requestAnimationFrame(() => {
        ;(currentEditor as any).setSelection?.(nextFrom, nextTo)
        currentEditor.focus()
      })
      return true
    }

    if (!selectedText.includes('\n')) {
      let tr: any = state.tr

      if (outdent) {
        const parentText = $from.parent.textContent ?? ''
        const parentStart = $from.start()
        const offsetInParent = Math.max(0, from - parentStart)
        const beforeCursor = parentText.slice(0, offsetInParent)
        const inlinePrefixLength = getTrailingIndentPrefixLength(beforeCursor)
        if (inlinePrefixLength > 0) {
          tr = tr.delete(from - inlinePrefixLength, from)
        } else {
          const linePrefixLength = getIndentPrefixLength(parentText)
          if (linePrefixLength <= 0) return false
          tr = tr.delete(parentStart, parentStart + linePrefixLength)
        }
      } else if (isCollapsedSelection) {
        tr = tr.insertText(INDENT_TOKEN, from)
      } else {
        tr = tr.insertText(INDENT_TOKEN, from)
      }

      const nextCaret = tr.mapping.map(from, 1)
      const nextFrom = tr.mapping.map(from, 1)
      const nextTo = tr.mapping.map(to, 1)
      view.dispatch(tr)
      const markdownAfterInlineIndent = normalizeMarkdownForPersistence(
        mergeLeadingIndentsFromWysiwyg(currentEditor, currentEditor.getMarkdown()),
      )
      lastEditorMarkdownRef.current = markdownAfterInlineIndent
      scheduleContentCommit(
        markdownAfterInlineIndent,
        activeSpaceIdRef.current,
        activeTabIdRef.current,
        activeSubTabIdRef.current,
        activeAisleIdRef.current,
      )
      window.requestAnimationFrame(() => {
        if (isCollapsedSelection) {
          ;(currentEditor as any).setSelection?.(nextCaret, nextCaret)
        } else {
          ;(currentEditor as any).setSelection?.(nextFrom, nextTo)
        }
        currentEditor.focus()
      })
      return true
    }

    const blockTargets: Array<{ pos: number; removeLength: number }> = []
    const seenBlockPositions = new Set<number>()
    const addBlockTarget = (node: any, contentStartPos: number) => {
      if (!node?.isTextblock || seenBlockPositions.has(contentStartPos)) return
      seenBlockPositions.add(contentStartPos)
      const text = node.textContent ?? ''
      const removeLength = outdent ? getIndentPrefixLength(text) : 0
      if (!outdent || removeLength > 0) {
        blockTargets.push({ pos: contentStartPos, removeLength })
      }
    }

    if (from === to) {
      addBlockTarget($from.parent, $from.start())
    } else {
      state.doc.nodesBetween(from, to, (node: any, pos: number) => {
        if (!node.isTextblock) return
        addBlockTarget(node, pos + 1)
        return false
      })
      if (blockTargets.length === 0) {
        addBlockTarget($from.parent, $from.start())
      }
    }

    if (blockTargets.length === 0) return false

    let tr: any = state.tr
    for (const target of [...blockTargets].sort((a, b) => b.pos - a.pos)) {
      tr = outdent ? tr.delete(target.pos, target.pos + target.removeLength) : tr.insertText(INDENT_TOKEN, target.pos)
    }

    const nextFrom = tr.mapping.map(from, -1)
    const nextTo = tr.mapping.map(to, 1)
    const nextCaret = tr.mapping.map(from, outdent ? -1 : 1)
    view.dispatch(tr)
    const markdownAfterIndent = normalizeMarkdownForPersistence(
      mergeLeadingIndentsFromWysiwyg(currentEditor, currentEditor.getMarkdown()),
    )
    lastEditorMarkdownRef.current = markdownAfterIndent
    scheduleContentCommit(
      markdownAfterIndent,
      activeSpaceIdRef.current,
      activeTabIdRef.current,
      activeSubTabIdRef.current,
      activeAisleIdRef.current,
    )
    window.requestAnimationFrame(() => {
      if (isCollapsedSelection) {
        ;(currentEditor as any).setSelection?.(nextCaret, nextCaret)
      } else {
        ;(currentEditor as any).setSelection?.(nextFrom, nextTo)
      }
      currentEditor.focus()
    })
    return true
  }

  const setMultiLineCursorWidgets = (view: any, positions: number[], selections: Array<{ from: number; to: number }> = []) => {
    const pluginKey = multiLineCursorPluginKeyRef.current
    if (!pluginKey) return
    view.dispatch(view.state.tr.setMeta(pluginKey, { cursors: positions, selections }).setMeta('addToHistory', false))
  }

  const clearMultiLineEdit = (collapseToHead = false) => {
    const currentEditor = editorRef.current as
      | (Editor & {
          wwEditor?: {
            view?: any
          }
        })
      | null
    const view = currentEditor?.wwEditor?.view
    const previous = multiLineEditRef.current
    multiLineEditRef.current = null
    if (view) {
      setMultiLineCursorWidgets(view, [])
    }
    if (!collapseToHead || !view || !previous) return

    const blockRanges = getEditorTextLineRanges(view)
    const clampedHeadIndex = Math.max(0, Math.min(blockRanges.length - 1, previous.headBlockIndex))
    const headRange = blockRanges[clampedHeadIndex]
    if (!headRange) return
    const caretPos = Math.min(headRange.end, headRange.start + getMultiLineColumnOffset(previous, clampedHeadIndex, headRange))
    const SelectionCtor = view.state.selection.constructor as {
      create?: (doc: unknown, anchor: number, head?: number) => unknown
    }
    if (typeof SelectionCtor.create !== 'function') return
    const nextSelection = SelectionCtor.create(view.state.doc, caretPos, caretPos)
    view.dispatch(view.state.tr.setSelection(nextSelection).scrollIntoView())
  }

  const syncMultiLineEditVisualSelection = () => {
    const currentEditor = editorRef.current as
      | (Editor & {
          wwEditor?: {
            view?: any
          }
        })
      | null
    const view = currentEditor?.wwEditor?.view
    const multiLineEdit = multiLineEditRef.current
    if (!currentEditor || !view || !multiLineEdit) return false

    const blockRanges = getEditorTextLineRanges(view)
    if (blockRanges.length === 0) {
      multiLineEditRef.current = null
      return false
    }

    const selectedIndices = getMultiLineSelectedBlockIndices(multiLineEdit, blockRanges)
    if (selectedIndices.length === 0) {
      multiLineEditRef.current = null
      setMultiLineCursorWidgets(view, [])
      return false
    }

    const anchorIndex = selectedIndices.includes(multiLineEdit.anchorBlockIndex)
      ? multiLineEdit.anchorBlockIndex
      : selectedIndices[0]
    const headIndex = selectedIndices.includes(multiLineEdit.headBlockIndex)
      ? multiLineEdit.headBlockIndex
      : selectedIndices[selectedIndices.length - 1]
    const anchorRange = blockRanges[anchorIndex]
    const headRange = blockRanges[headIndex]
    if (!anchorRange || !headRange) {
      multiLineEditRef.current = null
      return false
    }

    if (selectedIndices.length < 2) {
      multiLineEditRef.current = null
      setMultiLineCursorWidgets(view, [])
      const caretPos = Math.min(headRange.end, headRange.start + getMultiLineColumnOffset(multiLineEdit, headIndex, headRange))
      const SelectionCtor = view.state.selection.constructor as {
        create?: (doc: unknown, anchor: number, head?: number) => unknown
      }
      if (typeof SelectionCtor.create !== 'function') return false
      const nextSelection = SelectionCtor.create(view.state.doc, caretPos, caretPos)
      view.dispatch(view.state.tr.setSelection(nextSelection).scrollIntoView())
      return false
    }

    const selectionAnchorOffsets = selectedIndices.reduce<Record<number, number>>((acc, blockIndex) => {
      const rawOffset = multiLineEdit.selectionAnchorOffsets?.[blockIndex]
      const range = blockRanges[blockIndex]
      if (typeof rawOffset === 'number' && range) {
        acc[blockIndex] = Math.max(0, Math.min(range.length, rawOffset))
      }
      return acc
    }, {})
    const normalizedMultiLineEdit: MultiLineEditState = {
      ...multiLineEdit,
      anchorBlockIndex: anchorIndex,
      headBlockIndex: headIndex,
      cursorBlockIndices: multiLineEdit.cursorBlockIndices ? selectedIndices : undefined,
      selectionAnchorOffsets: Object.keys(selectionAnchorOffsets).length > 0 ? selectionAnchorOffsets : undefined,
    }
    multiLineEditRef.current = normalizedMultiLineEdit

    const headOffset = getMultiLineColumnOffset(normalizedMultiLineEdit, headIndex, headRange)
    const headPos = Math.min(headRange.end, headRange.start + headOffset)
    const cursorPositions = selectedIndices
      .map((blockIndex) => {
        const range = blockRanges[blockIndex]
        return range ? Math.min(range.end, range.start + getMultiLineColumnOffset(normalizedMultiLineEdit, blockIndex, range)) : null
      })
      .filter((pos): pos is number => typeof pos === 'number' && pos !== headPos)
    const selectionDecorations = getMultiLineSelectionRanges(normalizedMultiLineEdit, selectedIndices, blockRanges).map(
      ({ from, to }) => ({ from, to }),
    )

    const SelectionCtor = view.state.selection.constructor as {
      create?: (doc: unknown, anchor: number, head?: number) => unknown
    }
    if (typeof SelectionCtor.create !== 'function') return false
    const nextSelection = SelectionCtor.create(view.state.doc, headPos, headPos)
    let tr = view.state.tr.setSelection(nextSelection).setMeta('addToHistory', false).scrollIntoView()
    const pluginKey = multiLineCursorPluginKeyRef.current
    if (pluginKey) {
      tr = tr.setMeta(pluginKey, { cursors: cursorPositions, selections: selectionDecorations })
    }
    view.dispatch(tr)
    currentEditor.focus()
    return true
  }

  const tryExpandMultilineSelection = (direction: 'up' | 'down') => {
    const currentEditor = editorRef.current as
      | (Editor & {
          wwEditor?: {
            view?: any
          }
          setSelection?: (start: number, end: number) => void
        })
      | null

    const view = currentEditor?.wwEditor?.view
    if (!currentEditor || !view) {
      return false
    }

    const { state } = view
    const blockRanges = getEditorTextLineRanges(view)
    if (blockRanges.length === 0) return false

    const existing = multiLineEditRef.current
    if (existing) {
      if (existing.cursorBlockIndices?.length) {
        const existingIndices = getMultiLineSelectedBlockIndices(existing, blockRanges)
        const nextHeadIndex =
          direction === 'down'
            ? Math.min(blockRanges.length - 1, existing.headBlockIndex + 1)
            : Math.max(0, existing.headBlockIndex - 1)
        if (nextHeadIndex === existing.headBlockIndex || existingIndices.includes(nextHeadIndex)) return false
        const nextHeadRange = blockRanges[nextHeadIndex]
        if (!nextHeadRange) return false
        const nextColumn = Math.min(nextHeadRange.length, getMultiLineHeadColumnOffset(existing, blockRanges))
        multiLineEditRef.current = {
          ...existing,
          headBlockIndex: nextHeadIndex,
          columnOffset: nextColumn,
          columnOffsets: {
            ...(existing.columnOffsets ?? {}),
            [nextHeadIndex]: nextColumn,
          },
          cursorBlockIndices: [...existingIndices, nextHeadIndex].sort((a, b) => a - b),
        }
        return syncMultiLineEditVisualSelection()
      }

      const nextHeadIndex =
        direction === 'down'
          ? Math.min(blockRanges.length - 1, existing.headBlockIndex + 1)
          : Math.max(0, existing.headBlockIndex - 1)
      if (nextHeadIndex === existing.headBlockIndex) return false
      multiLineEditRef.current = {
        ...existing,
        headBlockIndex: nextHeadIndex,
      }
      return syncMultiLineEditVisualSelection()
    }

    const headBlockIndex = findEditorTextLineRangeIndex(blockRanges, state.selection.head)
    if (headBlockIndex < 0) return false

    const targetIndex =
      direction === 'down'
        ? Math.min(blockRanges.length - 1, headBlockIndex + 1)
        : Math.max(0, headBlockIndex - 1)
    if (targetIndex === headBlockIndex) return false

    const currentHeadBlock = blockRanges[headBlockIndex]
    const columnOffset = Math.max(0, Math.min(currentHeadBlock.length, state.selection.head - currentHeadBlock.start))
    multiLineEditRef.current = {
      anchorBlockIndex: headBlockIndex,
      headBlockIndex: targetIndex,
      columnOffset,
    }
    return syncMultiLineEditVisualSelection()
  }

  useEffect(() => {
    window.__tabsHandleMultilineShortcut = (direction) => {
      if (!isEditorView) return false
      return tryExpandMultilineSelection(direction)
    }
    return () => {
      if (window.__tabsHandleMultilineShortcut) {
        delete window.__tabsHandleMultilineShortcut
      }
    }
  }, [isEditorView, resolvedActiveAisleId])

  const tryApplyMultiLineEditInput = (input: MultiLineEditInput) => {
    const currentEditor = editorRef.current as
      | (Editor & {
          wwEditor?: {
            view?: any
          }
        })
      | null
    const view = currentEditor?.wwEditor?.view
    const multiLineEdit = multiLineEditRef.current
    if (!currentEditor || !view || !multiLineEdit) return false

    const blockRanges = getEditorTextLineRanges(view)
    if (blockRanges.length === 0) {
      multiLineEditRef.current = null
      return false
    }

    const selectedIndices = getMultiLineSelectedBlockIndices(multiLineEdit, blockRanges)
    if (selectedIndices.length < 2) {
      clearMultiLineEdit(true)
      return false
    }

    const beforeMarkdown = getNormalizedEditorMarkdown(currentEditor)
    const beforeState = cloneMultiLineEditState(multiLineEdit)
    let tr = view.state.tr
    let changed = false
    const nextColumnOffsets: Record<number, number> = { ...(multiLineEdit.columnOffsets ?? {}) }

    for (const blockIndex of [...selectedIndices].sort((a, b) => b - a)) {
      const range = blockRanges[blockIndex]
      if (!range) continue
      const currentOffset = getMultiLineColumnOffset(multiLineEdit, blockIndex, range)
      const cursorPos = Math.min(range.end, range.start + currentOffset)
      const selectionRange = getMultiLineSelectionRange(multiLineEdit, blockIndex, range)

      if (selectionRange && input.type !== 'split-line') {
        const mappedFrom = tr.mapping.map(selectionRange.from, -1)
        const mappedTo = tr.mapping.map(selectionRange.to, 1)
        if (input.type === 'insert-text') {
          tr = tr.insertText(input.text, mappedFrom, mappedTo)
          nextColumnOffsets[blockIndex] = selectionRange.fromOffset + input.text.length
        } else {
          tr = tr.delete(mappedFrom, mappedTo)
          nextColumnOffsets[blockIndex] = selectionRange.fromOffset
        }
        changed = true
        continue
      }

      if (input.type === 'insert-text') {
        tr = tr.insertText(input.text, cursorPos, cursorPos)
        nextColumnOffsets[blockIndex] = currentOffset + input.text.length
        changed = true
        continue
      }

      if (input.type === 'backspace') {
        if (cursorPos <= range.start) continue
        tr = tr.delete(cursorPos - 1, cursorPos)
        nextColumnOffsets[blockIndex] = Math.max(0, currentOffset - 1)
        changed = true
        continue
      }

      if (input.type === 'delete') {
        if (cursorPos >= range.end) continue
        tr = tr.delete(cursorPos, cursorPos + 1)
        changed = true
        continue
      }

      if (input.type === 'delete-word-backward') {
        const nextOffset = findPreviousWordColumn(range.text, currentOffset)
        if (nextOffset === currentOffset) continue
        tr = tr.delete(range.start + nextOffset, cursorPos)
        nextColumnOffsets[blockIndex] = nextOffset
        changed = true
        continue
      }

      if (input.type === 'delete-word-forward') {
        const nextOffset = findNextWordColumn(range.text, currentOffset)
        if (nextOffset === currentOffset) continue
        tr = tr.delete(cursorPos, range.start + nextOffset)
        changed = true
        continue
      }

      if (input.type === 'delete-to-line-start') {
        if (currentOffset <= 0) continue
        tr = tr.delete(range.start, cursorPos)
        nextColumnOffsets[blockIndex] = 0
        changed = true
        continue
      }

      if (input.type === 'delete-to-line-end') {
        if (currentOffset >= range.length) continue
        tr = tr.delete(cursorPos, range.end)
        changed = true
        continue
      }

      if (input.type === 'split-line') {
        const splitPos = selectionRange?.from ?? cursorPos
        const splitOffset = selectionRange?.fromOffset ?? currentOffset
        if (selectionRange) {
          const mappedFrom = tr.mapping.map(selectionRange.from, -1)
          const mappedTo = tr.mapping.map(selectionRange.to, 1)
          tr = tr.delete(mappedFrom, mappedTo)
          nextColumnOffsets[blockIndex] = splitOffset
        }
        const mappedPos = tr.mapping.map(splitPos, 1)
        if (isCodeBlockTextLineRange(range)) {
          tr = tr.insertText('\n', mappedPos, mappedPos)
          changed = true
          continue
        }
        const splitPlan = getMultiLineSplitPlan(tr.doc, mappedPos)
        if (!splitPlan) continue
        tr = tr.split(mappedPos, splitPlan.depth, splitPlan.typesAfter)
        changed = true
      }
    }

    if (!changed) return false

    let nextMultiLineEditState: MultiLineEditState | null = null
    view.dispatch(tr.scrollIntoView())
    if (input.type === 'split-line') {
      nextMultiLineEditState = buildSplitLineMultiLineState(multiLineEdit, selectedIndices)
    } else {
      nextMultiLineEditState = {
        ...multiLineEdit,
        columnOffset: nextColumnOffsets[multiLineEdit.headBlockIndex] ?? multiLineEdit.columnOffset,
        columnOffsets: nextColumnOffsets,
        selectionAnchorOffsets: undefined,
      }
    }

    multiLineEditRef.current = nextMultiLineEditState
    syncMultiLineEditVisualSelection()
    const markdownAfterMultiLineEdit = getNormalizedEditorMarkdown(currentEditor)
    lastEditorMarkdownRef.current = markdownAfterMultiLineEdit
    scheduleContentCommit(
      markdownAfterMultiLineEdit,
      activeSpaceIdRef.current,
      activeTabIdRef.current,
      activeSubTabIdRef.current,
      activeAisleIdRef.current,
    )
    if (multiLineEditRef.current) {
      recordMultiLineEditHistory(beforeMarkdown, beforeState, markdownAfterMultiLineEdit, multiLineEditRef.current)
    }
    currentEditor.focus()
    return true
  }

  const tryMoveMultiLineCursors = (movement: MultiLineCursorMovement, extendSelection = false) => {
    const currentEditor = editorRef.current as
      | (Editor & {
          wwEditor?: {
            view?: any
          }
        })
      | null
    const view = currentEditor?.wwEditor?.view
    const multiLineEdit = multiLineEditRef.current
    if (!currentEditor || !view || !multiLineEdit) return false

    const blockRanges = getEditorTextLineRanges(view)
    if (blockRanges.length === 0) {
      multiLineEditRef.current = null
      return false
    }

    const selectedIndices = getMultiLineSelectedBlockIndices(multiLineEdit, blockRanges)
    if (selectedIndices.length < 2) {
      clearMultiLineEdit(true)
      return false
    }

    const nextState = moveMultiLineCursorState(multiLineEdit, selectedIndices, blockRanges, movement, { extendSelection })
    if (!nextState) return false
    multiLineEditRef.current = nextState
    syncMultiLineEditVisualSelection()
    return true
  }

  const getActiveMultiLineSelectionContext = () => {
    const currentEditor = editorRef.current as
      | (Editor & {
          wwEditor?: {
            view?: any
          }
        })
      | null
    const view = currentEditor?.wwEditor?.view
    const multiLineEdit = multiLineEditRef.current
    if (!currentEditor || !view || !multiLineEdit) return null

    const blockRanges = getEditorTextLineRanges(view)
    if (blockRanges.length === 0) return null
    const selectedIndices = getMultiLineSelectedBlockIndices(multiLineEdit, blockRanges)
    if (selectedIndices.length < 2) return null
    const selectionRanges = getMultiLineSelectionRanges(multiLineEdit, selectedIndices, blockRanges)
    if (selectionRanges.length === 0) return null

    return {
      currentEditor,
      view,
      multiLineEdit,
      selectedIndices,
      selectionRanges,
    }
  }

  const writeClipboardText = (clipboardData: DataTransfer | null, text: string) => {
    if (clipboardData) {
      clipboardData.setData('text/plain', text)
      return true
    }
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text)
      return true
    }
    return false
  }

  const copyMultiLineSelectionToClipboard = (clipboardData: DataTransfer | null) => {
    const context = getActiveMultiLineSelectionContext()
    if (!context) return false

    const text = context.selectionRanges.map((range) => range.text).join('\n')
    return writeClipboardText(clipboardData, text)
  }

  const cutMultiLineSelectionToClipboard = (clipboardData: DataTransfer | null) => {
    const context = getActiveMultiLineSelectionContext()
    if (!context) return false

    const text = context.selectionRanges.map((range) => range.text).join('\n')
    if (!writeClipboardText(clipboardData, text)) return false

    const { currentEditor, view, multiLineEdit, selectionRanges } = context
    const beforeMarkdown = getNormalizedEditorMarkdown(currentEditor)
    const beforeState = cloneMultiLineEditState(multiLineEdit)
    const nextColumnOffsets: Record<number, number> = { ...(multiLineEdit.columnOffsets ?? {}) }
    let tr = view.state.tr

    for (const selectionRange of [...selectionRanges].sort((a, b) => b.from - a.from)) {
      const mappedFrom = tr.mapping.map(selectionRange.from, -1)
      const mappedTo = tr.mapping.map(selectionRange.to, 1)
      tr = tr.delete(mappedFrom, mappedTo)
      nextColumnOffsets[selectionRange.blockIndex] = selectionRange.fromOffset
    }

    view.dispatch(tr.scrollIntoView())
    multiLineEditRef.current = {
      ...multiLineEdit,
      columnOffset: nextColumnOffsets[multiLineEdit.headBlockIndex] ?? multiLineEdit.columnOffset,
      columnOffsets: nextColumnOffsets,
      selectionAnchorOffsets: undefined,
    }
    syncMultiLineEditVisualSelection()

    const markdownAfterCut = getNormalizedEditorMarkdown(currentEditor)
    lastEditorMarkdownRef.current = markdownAfterCut
    scheduleContentCommit(
      markdownAfterCut,
      activeSpaceIdRef.current,
      activeTabIdRef.current,
      activeSubTabIdRef.current,
      activeAisleIdRef.current,
    )
    if (multiLineEditRef.current) {
      recordMultiLineEditHistory(beforeMarkdown, beforeState, markdownAfterCut, multiLineEditRef.current)
    }
    currentEditor.focus()
    return true
  }

  const isLikelyUrl = (value: string) => {
    try {
      const normalized = value.trim()
      const url = new URL(normalized)
      return url.protocol === 'http:' || url.protocol === 'https:'
    } catch {
      return false
    }
  }

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

  const commitActiveEditorMarkdownNow = (editor: Editor) => {
    const normalized = getNormalizedEditorMarkdown(editor)
    lastEditorMarkdownRef.current = normalized
    lastEditorMarkdownByAisleRef.current.set(activeAisleIdRef.current, normalized)
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    pendingContentRef.current = null
    applyContentToTarget(
      activeSpaceIdRef.current,
      activeTabIdRef.current,
      activeSubTabIdRef.current,
      activeAisleIdRef.current,
      normalized,
    )
    return normalized
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
  const cancelInlineCrop = imageToolsController.cancelCrop
  const applyInlineCrop = imageToolsController.applyCrop
  const beginInlineCropMouseDrag = imageToolsController.beginCropMouseDrag

  const runActiveEditorCommand = (command: string, payload?: Record<string, unknown>) => {
    const currentEditor = editorRef.current
    if (!currentEditor) return false
    currentEditor.focus()
    getCommandCapableEditor(currentEditor).exec(command, payload)
    window.setTimeout(() => {
      if (editorRef.current === currentEditor) {
        commitActiveEditorMarkdownNow(currentEditor)
        syncToolbarFormatState()
      }
    }, 0)
    return true
  }

  const insertLinkIntoActiveEditor = (label: string, url: string) => {
    const currentEditor = editorRef.current
    if (!currentEditor) return false
    currentEditor.focus()
    getCommandCapableEditor(currentEditor).exec('addLink', { linkUrl: url, linkText: label })
    commitActiveEditorMarkdownNow(currentEditor)
    return true
  }

  const insertNamedLinkFromPrompt = () => {
    if (!linkPrompt.url) return
    const label = linkPrompt.text.trim() || linkPrompt.url
    insertLinkIntoActiveEditor(label, linkPrompt.url)
    closeLinkPrompt()
  }

  const insertTextIntoActiveEditor = (text: string) => {
    const currentEditor = editorRef.current
    if (!currentEditor) return false
    currentEditor.focus()
    getCommandCapableEditor(currentEditor).insertText(text)
    commitActiveEditorMarkdownNow(currentEditor)
    return true
  }

  const replaceActiveEditorMarkdown = (markdown: string) => {
    const normalized = normalizeMarkdownForPersistence(markdown)
    lastEditorMarkdownRef.current = normalized
    const currentEditor = editorRef.current
    currentEditor?.setMarkdown(normalized, false)
    if (currentEditor) {
      commitActiveEditorMarkdownNow(currentEditor)
      return
    }
    scheduleContentCommit(
      normalized,
      activeSpaceIdRef.current,
      activeTabIdRef.current,
      activeSubTabIdRef.current,
      activeAisleIdRef.current,
    )
  }

  const getActiveEditorMarkdown = () =>
    editorRef.current ? getNormalizedEditorMarkdown(editorRef.current) : getNoteBodyMarkdown(activeNoteBody, resolvedActiveAisleId)

  const insertNoteReference = (modalState: Extract<ModalState, { type: 'insert-note-reference' }>) => {
    const latestState = stateRef.current
    const targetInfo = getLocationInfo(latestState, modalState.target)
    if (!targetInfo.domain || !targetInfo.space || !targetInfo.tab || !targetInfo.noteBodyId) {
      pushToast('choose an existing note.', 'warning')
      return false
    }

    if (modalState.insertAs === 'link') {
      if (!insertLinkIntoActiveEditor(targetInfo.title, buildInternalNoteUrl(targetInfo.noteBodyId, modalState.target))) {
        pushToast('open a note before inserting a link.', 'warning')
        return false
      }
      pushToast('note link inserted.', 'success')
      return true
    }

    if (!activeNoteBodyId || targetInfo.noteBodyId === activeNoteBodyId) {
      pushToast('a note cannot preview itself.', 'warning')
      return false
    }

    if (wouldCreateContextCycle(latestState, targetInfo.noteBodyId, activeNoteBodyId)) {
      pushToast('note preview blocked to prevent recursion.', 'warning')
      return false
    }

    const markdown = getActiveEditorMarkdown()
    const nextPayload: NoteContextReferencePayload = {
      id: modalState.editingTokenId ?? createId(),
      target: {
        domainId: modalState.target.domainId,
        spaceId: modalState.target.spaceId,
        tabId: modalState.target.tabId,
        subTabId: modalState.target.subTabId,
      },
      aisleIds: modalState.target.aisleIds && modalState.target.aisleIds.length > 0 ? modalState.target.aisleIds : undefined,
    }
    const nextSignature = getContextReferenceSignature(latestState, nextPayload)
    const activeBody = latestState.noteBodies.find((body) => body.id === activeNoteBodyId) ?? null
    const noteMarkdowns = activeBody
      ? activeBody.aisles.map((aisle) => (aisle.id === activeAisleIdRef.current ? markdown : aisle.markdown))
      : [markdown]
    const duplicateReference = noteMarkdowns.flatMap(parseContextReferences).find(
      (reference) =>
        reference.payload.id !== modalState.editingTokenId &&
        getContextReferenceSignature(latestState, reference.payload) === nextSignature,
    )
    if (duplicateReference) {
      pushToast('that note preview already exists in this note.', 'warning')
      return false
    }

    const token = buildContextToken(nextPayload)
    if (modalState.editingTokenId) {
      replaceActiveEditorMarkdown(replaceContextTokenById(markdown, modalState.editingTokenId, token))
      pushToast('note preview settings updated.', 'success')
      return true
    }

    if (!insertTextIntoActiveEditor(`\n\n${token}\n\n`)) {
      pushToast('open a note before inserting a note preview.', 'warning')
      return false
    }
    pushToast('note preview inserted.', 'success')
    return true
  }

  const handleAisleEditorChange = (editorKey: string, aisleId: string, editor: Editor) => {
    if (!isMainViewRef.current) return
    activateAisleEditor(editorKey)
    closeImageToolsIfSelectedImageMissing()
    const markdown = getNormalizedEditorMarkdown(editor)
    const previousMarkdown = lastEditorMarkdownByAisleRef.current.get(aisleId) ?? ''

    if (normalizingAisleIdsRef.current.has(aisleId)) {
      normalizingAisleIdsRef.current.delete(aisleId)
      const normalizedMarkdown = lastEditorMarkdownByAisleRef.current.get(aisleId) ?? markdown
      lastEditorMarkdownRef.current = normalizedMarkdown
      scheduleContentCommit(
        normalizedMarkdown,
        activeSpaceIdRef.current,
        activeTabIdRef.current,
        activeSubTabIdRef.current,
        aisleId,
      )
      return
    }

    if (normalizingContentRef.current && activeAisleIdRef.current === aisleId) {
      normalizingContentRef.current = false
      const normalizedMarkdown = lastEditorMarkdownRef.current
      lastEditorMarkdownByAisleRef.current.set(aisleId, normalizedMarkdown)
      scheduleContentCommit(
        normalizedMarkdown,
        activeSpaceIdRef.current,
        activeTabIdRef.current,
        activeSubTabIdRef.current,
        aisleId,
      )
      return
    }

    const materializedHorizontalRule = materializeHorizontalRuleShortcut(previousMarkdown, markdown)
    if (materializedHorizontalRule && materializedHorizontalRule !== markdown) {
      normalizingAisleIdsRef.current.add(aisleId)
      lastEditorMarkdownRef.current = materializedHorizontalRule
      lastEditorMarkdownByAisleRef.current.set(aisleId, materializedHorizontalRule)
      editor.setMarkdown(materializedHorizontalRule, false)
      return
    }

    maybeShowCompletedTaskUndoHint(markdown)
    lastEditorMarkdownRef.current = markdown
    lastEditorMarkdownByAisleRef.current.set(aisleId, markdown)
    scheduleContentCommit(
      markdown,
      activeSpaceIdRef.current,
      activeTabIdRef.current,
      activeSubTabIdRef.current,
      aisleId,
    )
  }

  const getContextPreviewData = (payload: NoteContextReferencePayload, sourceNoteBodyId: string) => {
    const latestState = stateRef.current
    const targetInfo = getLocationInfo(latestState, payload.target)
    const targetBody = latestState.noteBodies.find((body) => body.id === targetInfo.noteBodyId) ?? null
    const selectedAisles =
      targetBody && payload.aisleIds && payload.aisleIds.length > 0
        ? targetBody.aisles.filter((aisle) => payload.aisleIds?.includes(aisle.id))
        : targetBody?.aisles ?? []
    const recursiveBlocked =
      !targetBody ||
      !targetInfo.noteBodyId ||
      targetInfo.noteBodyId === sourceNoteBodyId ||
      wouldCreateContextCycle(latestState, targetInfo.noteBodyId, sourceNoteBodyId)
    const previewText = selectedAisles
      .map((aisle) => aisle.markdown.trim())
      .filter(Boolean)
      .join('\n\n')
    const locationLabel = targetInfo.domain && targetInfo.space && targetInfo.tab
      ? `${targetInfo.domain.name} / ${targetInfo.space.name} / ${targetInfo.tab.title}${targetInfo.subTab ? ` / ${targetInfo.subTab.title}` : ' / index'}`
      : 'missing note'
    const displayTitle = targetInfo.tab
      ? `${targetInfo.tab.title} > ${targetInfo.subTab ? targetInfo.subTab.title : 'index'}`
      : targetInfo.title

    return { targetInfo, targetBody, selectedAisles, recursiveBlocked, previewText, locationLabel, displayTitle }
  }

  const destroyAisleEditor = (editorKey: string) => {
    const meta = aisleEditorMetaRef.current.get(editorKey)
    if (!meta) return
    meta.cleanup()
    aisleEditorMetaRef.current.delete(editorKey)
    lastEditorMarkdownByAisleRef.current.delete(meta.aisleId)
    normalizingAisleIdsRef.current.delete(meta.aisleId)
    if (editorRef.current === meta.editor) {
      editorRef.current = null
      multiLineCursorPluginKeyRef.current = null
    }
  }

  const destroyAllAisleEditors = () => {
    Array.from(aisleEditorMetaRef.current.keys()).forEach((editorKey) => destroyAisleEditor(editorKey))
  }

  useEffect(() => {
    if (viewMode !== 'main' || !activeNoteBodyId) {
      destroyAllAisleEditors()
      return
    }

    const expectedKeys = new Set(activeNoteAisles.map((aisle) => buildAisleEditorKey(activeNoteBodyId, aisle.id)))

    for (const editorKey of Array.from(aisleEditorMetaRef.current.keys())) {
      if (!expectedKeys.has(editorKey)) {
        destroyAisleEditor(editorKey)
      }
    }

    for (const aisle of activeNoteAisles) {
      const editorKey = buildAisleEditorKey(activeNoteBodyId, aisle.id)
      const root = aisleEditorRootsRef.current.get(editorKey)
      if (!root || aisleEditorMetaRef.current.has(editorKey)) continue

      let pluginKey: unknown = null
      let editor: Editor
      editor = new Editor({
        el: root,
        initialValue: aisle.markdown,
        initialEditType: 'wysiwyg',
        previewStyle: 'tab',
        hideModeSwitch: true,
        toolbarItems: EDITOR_TOOLBAR_ITEMS,
        height: '100%',
        autofocus: false,
        usageStatistics: false,
        plugins: [
          headingSpaceShortcutPlugin,
          thematicBreakShortcutPlugin,
          (context: any) =>
            createContextPreviewPlugin(context, {
              sourceNoteBodyId: activeNoteBodyId,
              getContextPreviewData,
              navigateToNoteLocation,
            }),
          (context: {
            pmState: {
              PluginKey: new (name?: string) => {
                getState: (state: unknown) =>
                  | {
                      cursors: number[]
                      selections: Array<{ from: number; to: number }>
                    }
                  | undefined
              }
              Plugin: new (spec: {
                key?: unknown
                state?: {
                  init: () => {
                    cursors: number[]
                    selections: Array<{ from: number; to: number }>
                  }
                  apply: (
                    tr: { getMeta: (key: unknown) => unknown },
                    previous: {
                      cursors: number[]
                      selections: Array<{ from: number; to: number }>
                    },
                  ) => {
                    cursors: number[]
                    selections: Array<{ from: number; to: number }>
                  }
                }
                props?: {
                  decorations?: (state: unknown) => unknown
                  handleDOMEvents?: {
                    keydown?: (view: unknown, event: KeyboardEvent) => boolean
                  }
                }
              }) => unknown
            }
            pmView: {
              Decoration: {
                inline: (from: number, to: number, attrs: Record<string, string>, spec?: Record<string, unknown>) => unknown
                widget: (pos: number, toDOM: () => HTMLElement, spec?: Record<string, unknown>) => unknown
              }
              DecorationSet: {
                create: (doc: unknown, decorations: unknown[]) => unknown
              }
            }
            pmKeymap: { keymap: (bindings: Record<string, unknown>) => unknown }
          }) =>
            multiLineSelectionShortcutPlugin({
              ...context,
              onExpand: tryExpandMultilineSelection,
              onPluginKeyReady: (nextPluginKey) => {
                pluginKey = nextPluginKey
              },
            }),
        ],
        hooks: {
          addImageBlobHook: (blob: Blob | File, callback: (url: string, text?: string) => void) => {
            const reader = new FileReader()
            reader.onload = () => {
              const dataUrl = typeof reader.result === 'string' ? reader.result : ''
              if (!dataUrl) return
              callback(dataUrl, blob instanceof File ? blob.name : 'image')
              window.setTimeout(() => commitCurrentEditorContent(), 30)
            }
            reader.readAsDataURL(blob)
          },
        },
        events: {
          change: () => handleAisleEditorChange(editorKey, aisle.id, editor),
          focus: () => activateAisleEditor(editorKey, { flushPrevious: true }),
        },
      })

      const activate = () => activateAisleEditor(editorKey, { flushPrevious: true })
      root.addEventListener('focusin', activate)
      root.addEventListener('pointerdown', activate, true)
      const cleanupHeadingPopupActiveState = installHeadingPopupActiveState(root, () => editor)
      const cleanupCompletedTaskCheckboxBehavior = installCompletedTaskCheckboxBehavior(
        root,
        () => editor,
        trackCompletedTaskQuickDelete,
      )
      const cleanupTaskTextReorderBehavior = installTaskTextReorderBehavior(root, () => editor)

      aisleEditorMetaRef.current.set(editorKey, {
        editor,
        root,
        aisleId: aisle.id,
        pluginKey,
        cleanup: () => {
          cleanupTaskTextReorderBehavior()
          cleanupCompletedTaskCheckboxBehavior()
          cleanupHeadingPopupActiveState()
          root.removeEventListener('focusin', activate)
          root.removeEventListener('pointerdown', activate, true)
          try {
            editor.destroy()
          } catch {
            // Toast UI can throw during teardown if the toolbar DOM was customized.
          }
          root.innerHTML = ''
        },
      })
      lastEditorMarkdownByAisleRef.current.set(aisle.id, normalizeMarkdownForPersistence(aisle.markdown))
    }

    const activeEditorKey = buildAisleEditorKey(activeNoteBodyId, resolvedActiveAisleId)
    if (aisleEditorMetaRef.current.has(activeEditorKey)) {
      activateAisleEditor(activeEditorKey)
    }
  }, [viewMode, activeNoteBodyId, activeNoteAisles, resolvedActiveAisleId])

  useEffect(() => () => destroyAllAisleEditors(), [])

  useEffect(() => {
    if (viewMode !== 'main' || !activeNoteBodyId) return
    for (const aisle of activeNoteAisles) {
      const editorKey = buildAisleEditorKey(activeNoteBodyId, aisle.id)
      const meta = aisleEditorMetaRef.current.get(editorKey)
      if (!meta) continue
      const pending = pendingContentRef.current
      const pendingMatches =
        pending &&
        pending.spaceId === activeSpaceIdRef.current &&
        pending.tabId === activeTabIdRef.current &&
        pending.subTabId === activeSubTabIdRef.current &&
        pending.aisleId === aisle.id
      const expectedMarkdown = pendingMatches ? pending.markdown : aisle.markdown
      const currentMarkdown = getNormalizedEditorMarkdown(meta.editor)
      if (currentMarkdown !== expectedMarkdown) {
        lastEditorMarkdownByAisleRef.current.set(aisle.id, normalizeMarkdownForPersistence(expectedMarkdown))
        if (activeAisleIdRef.current === aisle.id) {
          lastEditorMarkdownRef.current = normalizeMarkdownForPersistence(expectedMarkdown)
        }
        meta.editor.setMarkdown(expectedMarkdown, false)
      }
    }
  }, [viewMode, activeNoteBodyId, activeNoteAisles, activeSpace.id, activeTab.id, activeSubTab?.id])

  useEffect(() => {
    if (viewMode === 'main') return
    if (!isEditorView) return
    if (!editorMountRef.current || editorRef.current) return

    lastEditorMarkdownRef.current = displayContent
    editorRef.current = new Editor({
      el: editorMountRef.current,
      initialValue: displayContent,
      initialEditType: 'wysiwyg',
      previewStyle: 'tab',
      hideModeSwitch: true,
      toolbarItems: EDITOR_TOOLBAR_ITEMS,
      height: '100%',
      usageStatistics: false,
      plugins: [
        headingSpaceShortcutPlugin,
        thematicBreakShortcutPlugin,
        (context: {
          pmState: {
            PluginKey: new (name?: string) => {
              getState: (state: unknown) =>
                | {
                    cursors: number[]
                    selections: Array<{ from: number; to: number }>
                  }
                | undefined
            }
            Plugin: new (spec: {
              key?: unknown
              state?: {
                init: () => {
                  cursors: number[]
                  selections: Array<{ from: number; to: number }>
                }
                apply: (
                  tr: { getMeta: (key: unknown) => unknown },
                  previous: {
                    cursors: number[]
                    selections: Array<{ from: number; to: number }>
                  },
                ) => {
                  cursors: number[]
                  selections: Array<{ from: number; to: number }>
                }
              }
              props?: {
                decorations?: (state: unknown) => unknown
                handleDOMEvents?: {
                  keydown?: (view: unknown, event: KeyboardEvent) => boolean
                }
              }
            }) => unknown
          }
          pmView: {
            Decoration: {
              inline: (from: number, to: number, attrs: Record<string, string>, spec?: Record<string, unknown>) => unknown
              widget: (pos: number, toDOM: () => HTMLElement, spec?: Record<string, unknown>) => unknown
            }
            DecorationSet: {
              create: (doc: unknown, decorations: unknown[]) => unknown
            }
          }
          pmKeymap: { keymap: (bindings: Record<string, unknown>) => unknown }
        }) =>
          multiLineSelectionShortcutPlugin({
            ...context,
            onExpand: tryExpandMultilineSelection,
            onPluginKeyReady: (pluginKey) => {
              multiLineCursorPluginKeyRef.current = pluginKey
            },
          }),
      ],
      hooks: {
        addImageBlobHook: (blob: Blob | File, callback: (url: string, text?: string) => void) => {
          const reader = new FileReader()
          reader.onload = () => {
            const dataUrl = typeof reader.result === 'string' ? reader.result : ''
            if (!dataUrl) return
            callback(dataUrl, blob instanceof File ? blob.name : 'image')
            window.setTimeout(() => commitCurrentEditorContent(), 30)
          }
          reader.readAsDataURL(blob)
        },
      },
      events: {
        change: () => {
          if (!isMainViewRef.current) return
          const currentEditor = editorRef.current
          if (!currentEditor) return
          const markdown = getNormalizedEditorMarkdown(currentEditor)
          const previousMarkdown = lastEditorMarkdownRef.current

          if (normalizingContentRef.current) {
            normalizingContentRef.current = false
            const normalizedMarkdown = lastEditorMarkdownRef.current
            scheduleContentCommit(
              normalizedMarkdown,
              activeSpaceIdRef.current,
              activeTabIdRef.current,
              activeSubTabIdRef.current,
              activeAisleIdRef.current,
            )
            return
          }

          const materializedHorizontalRule = materializeHorizontalRuleShortcut(previousMarkdown, markdown)
          if (materializedHorizontalRule && materializedHorizontalRule !== markdown) {
            normalizingContentRef.current = true
            lastEditorMarkdownRef.current = materializedHorizontalRule
            currentEditor.setMarkdown(materializedHorizontalRule, false)
            return
          }

          maybeShowCompletedTaskUndoHint(markdown)
          lastEditorMarkdownRef.current = markdown
          scheduleContentCommit(
            markdown,
            activeSpaceIdRef.current,
            activeTabIdRef.current,
            activeSubTabIdRef.current,
            activeAisleIdRef.current,
          )
        },
      },
    })

    installClearToolbarButton(editorMountRef.current, clearActiveNoteContent)
    const cleanupHeadingPopupActiveState = installHeadingPopupActiveState(editorMountRef.current, () => editorRef.current)
    const cleanupCompletedTaskCheckboxBehavior = installCompletedTaskCheckboxBehavior(
      editorMountRef.current,
      () => editorRef.current,
      trackCompletedTaskQuickDelete,
    )
    const cleanupTaskTextReorderBehavior = installTaskTextReorderBehavior(editorMountRef.current, () => editorRef.current)

    return () => {
      cleanupTaskTextReorderBehavior()
      cleanupCompletedTaskCheckboxBehavior()
      cleanupHeadingPopupActiveState()
      flushPendingContent()
      closeImageTools()
      try {
        editorRef.current?.destroy()
      } catch {
        // Toast UI can throw during teardown if the toolbar DOM was customized.
      }
      editorRef.current = null
      multiLineCursorPluginKeyRef.current = null
      if (editorMountRef.current) {
        editorMountRef.current.innerHTML = ''
      }
    }
  }, [isEditorView, viewMode])

  useEffect(() => {
    if (viewMode !== 'main') {
      clearMultiLineEdit(false)
      closeImageTools()
      closeLinkPrompt()
      return
    }

    const root = viewMode === 'main' ? editorEventRootRef.current : editorMountRef.current
    if (!root) return

    let internalLinkHandledOnPointerDown = false

    const isPrimaryMouseActivation = (event: Event) => !(event instanceof MouseEvent) || event.button === 0

    const handleAnchorInteraction = (event: Event, target: Element, allowExternalPrompt: boolean) => {
      if (!isPrimaryMouseActivation(event)) return false
      const anchor = target.closest('a')
      if (!(anchor instanceof HTMLAnchorElement)) return false

      const href = anchor.getAttribute('href') || anchor.href
      const internalLocation = parseInternalNoteUrl(href) ?? parseInternalNoteUrl(anchor.href)
      if (internalLocation) {
        event.preventDefault()
        event.stopPropagation()
        internalLinkHandledOnPointerDown = event.type === 'pointerdown'
        navigateToNoteLocation(internalLocation)
        return true
      }

      if (!allowExternalPrompt) return false
      event.preventDefault()
      event.stopPropagation()
      const rect = anchor.getBoundingClientRect()
      const text = anchor.textContent ?? ''
      openLinkPrompt(href, Math.max(8, rect.bottom + 6), Math.max(8, rect.left), text)
      return true
    }

    const getInternalLinkHitAtPointerPosition = (event: Event): InternalNoteLinkHit | null => {
      if (!(event instanceof MouseEvent)) return null
      const view = getWysiwygView(editorRef.current)
      const coords = view?.posAtCoords?.({ left: event.clientX, top: event.clientY })
      if (!view || !coords) return null
      return getInternalNoteLinkHitAtDocPosition(view.state.doc, coords.pos)
    }

    const handleInternalLinkAtPointerPosition = (event: Event) => {
      if (!isPrimaryMouseActivation(event)) return false
      const internalLinkHit = getInternalLinkHitAtPointerPosition(event)
      if (!internalLinkHit) return false
      event.preventDefault()
      event.stopPropagation()
      internalLinkHandledOnPointerDown = event.type === 'pointerdown'
      navigateToNoteLocation(internalLinkHit.target)
      return true
    }

    const handlePointerDown = (event: Event) => {
      const target = getElementFromEventTarget(event.target)
      if (!target) {
        if (!isImageCropActive()) {
          closeImageTools()
        }
        closeLinkPrompt()
        return
      }
      activateEditorFromEventTarget(target)
      clearMultiLineEdit(false)
      if (
        target.closest('.image-tools') ||
        target.closest('.image-resize-handle') ||
        target.closest('.inline-crop-box') ||
        target.closest('.inline-crop-edge-handle') ||
        target.closest('.inline-crop-resize-handle') ||
        target.closest('.link-prompt')
      ) {
        return
      }
      const image = target.closest('img')
      if (image instanceof HTMLImageElement) {
        selectImageForTools(image)
        return
      }
      if (handleAnchorInteraction(event, target, true)) return
      if (handleInternalLinkAtPointerPosition(event)) return
      if (!isImageCropActive()) {
        closeImageTools()
      }
      closeLinkPrompt()
    }

    const handleClick = (event: Event) => {
      const target = getElementFromEventTarget(event.target)
      if (!target) return
      if (internalLinkHandledOnPointerDown) {
        internalLinkHandledOnPointerDown = false
        event.preventDefault()
        event.stopPropagation()
        return
      }
      if (handleAnchorInteraction(event, target, false)) return
      handleInternalLinkAtPointerPosition(event)
    }

    const handleContextMenu = (event: Event) => {
      const mouseEvent = event as globalThis.MouseEvent
      const target = getElementFromEventTarget(mouseEvent.target)
      if (!target) return
      activateEditorFromEventTarget(target)
      const internalLinkHit = getInternalLinkHitAtPointerPosition(mouseEvent)
      if (internalLinkHit) {
        mouseEvent.preventDefault()
        mouseEvent.stopPropagation()
        closeImageTools()
        closeLinkPrompt()
        setMenuOpen(false)
        setContextMenu({
          type: 'internal-note-link',
          x: mouseEvent.clientX,
          y: mouseEvent.clientY,
          label: internalLinkHit.label,
          href: internalLinkHit.href,
          target: internalLinkHit.target,
          from: internalLinkHit.from,
          to: internalLinkHit.to,
          occurrence: internalLinkHit.occurrence,
        })
        return
      }
      const image = target.closest('img')
      if (!(image instanceof HTMLImageElement)) return
      mouseEvent.preventDefault()
      selectImageForTools(image)
      setContextMenu({
        type: 'image',
        x: mouseEvent.clientX,
        y: mouseEvent.clientY,
      })
    }

    const handleScrollOrResize = () => {
      if (!activeImageRef.current) return
      refreshImageToolsPosition()
    }

    const handlePaste = (event: Event) => {
      const pasteEvent = event as ClipboardEvent
      activateEditorFromEventTarget(pasteEvent.target)
      if (multiLineEditRef.current) {
        const text = pasteEvent.clipboardData?.getData('text/plain') ?? ''
        if (text.length > 0 && tryApplyMultiLineEditInput({ type: 'insert-text', text })) {
          pasteEvent.preventDefault()
          return
        }
      }
      const text = pasteEvent.clipboardData?.getData('text/plain')?.trim() ?? ''
      if (!text || !isLikelyUrl(text)) return

      const selection = window.getSelection()
      if (!selection || !selection.rangeCount) return
      const rangeRect = selection.getRangeAt(0).getBoundingClientRect()
      pasteEvent.preventDefault()
      openLinkPrompt(
        text,
        Math.max(8, rangeRect.bottom + 8),
        Math.max(8, rangeRect.left),
        '',
      )
    }

    const handleCopy = (event: Event) => {
      const clipboardEvent = event as ClipboardEvent
      activateEditorFromEventTarget(clipboardEvent.target)
      if (copyMultiLineSelectionToClipboard(clipboardEvent.clipboardData)) {
        clipboardEvent.preventDefault()
        return
      }
      const selection = window.getSelection()
      const hasTextSelection = Boolean(selection && selection.toString().trim().length > 0)
      if (!activeImageRef.current || hasTextSelection) return
      clipboardEvent.preventDefault()
      void copySelectedImageToClipboard()
    }

    const handleCut = (event: Event) => {
      const clipboardEvent = event as ClipboardEvent
      activateEditorFromEventTarget(clipboardEvent.target)
      if (!cutMultiLineSelectionToClipboard(clipboardEvent.clipboardData)) return
      clipboardEvent.preventDefault()
      clipboardEvent.stopPropagation()
    }

    const handleKeyDown = (event: Event) => {
      const keyboardEvent = event as KeyboardEvent
      activateEditorFromEventTarget(keyboardEvent.target)
      const toolbarFormatShortcut = getToolbarFormatShortcut(keyboardEvent)
      if (toolbarFormatShortcut) {
        queueToolbarShortcutFeedback(toolbarFormatShortcut)
        window.setTimeout(syncToolbarFormatState, 0)
      }
      const editorHistoryDirection = getEditorHistoryDirection(keyboardEvent)
      if (editorHistoryDirection) {
        scheduleMultiLineHistoryRestore(editorHistoryDirection)
      }

      const targetElement = getElementFromEventTarget(keyboardEvent.target)
      const isTextInputTarget = Boolean(targetElement?.closest('input, textarea, select, .link-prompt'))
      if (!isTextInputTarget && (keyboardEvent.key === 'Backspace' || keyboardEvent.key === 'Delete') && activeImageRef.current) {
        if (deleteActiveEditorImageNode()) {
          keyboardEvent.preventDefault()
          keyboardEvent.stopPropagation()
          return
        }
      }

      const multiLineDirection = getMultilineSelectionShortcutDirection(keyboardEvent)
      if (multiLineDirection) {
        const handled = tryExpandMultilineSelection(multiLineDirection)
        if (handled) {
          keyboardEvent.preventDefault()
          keyboardEvent.stopPropagation()
        }
        return
      }
      if (multiLineEditRef.current) {
        let handled = false
        if (keyboardEvent.key === 'Backspace') {
          if (keyboardEvent.metaKey) {
            handled = tryApplyMultiLineEditInput({ type: 'delete-to-line-start' }) || true
          } else if (keyboardEvent.altKey) {
            handled = tryApplyMultiLineEditInput({ type: 'delete-word-backward' }) || true
          } else {
            handled = tryApplyMultiLineEditInput({ type: 'backspace' }) || true
          }
        } else if (keyboardEvent.key === 'Delete') {
          if (keyboardEvent.metaKey) {
            handled = tryApplyMultiLineEditInput({ type: 'delete-to-line-end' }) || true
          } else if (keyboardEvent.altKey) {
            handled = tryApplyMultiLineEditInput({ type: 'delete-word-forward' }) || true
          } else {
            handled = tryApplyMultiLineEditInput({ type: 'delete' }) || true
          }
        } else if (keyboardEvent.key === 'Enter') {
          handled = tryApplyMultiLineEditInput({ type: 'split-line' })
        } else if (keyboardEvent.key === 'Escape') {
          clearMultiLineEdit(true)
          handled = true
        } else if (keyboardEvent.key === 'Tab' && !keyboardEvent.metaKey && !keyboardEvent.ctrlKey && !keyboardEvent.altKey) {
          handled = keyboardEvent.shiftKey
            ? tryApplyMultiLineEditInput({ type: 'backspace' })
            : tryApplyMultiLineEditInput({ type: 'insert-text', text: INDENT_TOKEN })
        } else if (keyboardEvent.key === 'ArrowLeft') {
          handled = tryMoveMultiLineCursors(
            keyboardEvent.altKey ? 'word-left' : keyboardEvent.metaKey || keyboardEvent.ctrlKey ? 'line-start' : 'left',
            keyboardEvent.shiftKey,
          )
        } else if (keyboardEvent.key === 'ArrowRight') {
          handled = tryMoveMultiLineCursors(
            keyboardEvent.altKey ? 'word-right' : keyboardEvent.metaKey || keyboardEvent.ctrlKey ? 'line-end' : 'right',
            keyboardEvent.shiftKey,
          )
        } else if (keyboardEvent.key === 'ArrowUp') {
          handled = tryMoveMultiLineCursors('up')
        } else if (keyboardEvent.key === 'ArrowDown') {
          handled = tryMoveMultiLineCursors('down')
        } else if (keyboardEvent.key === 'Home') {
          handled = tryMoveMultiLineCursors('line-start', keyboardEvent.shiftKey)
        } else if (keyboardEvent.key === 'End') {
          handled = tryMoveMultiLineCursors('line-end', keyboardEvent.shiftKey)
        } else if (
          keyboardEvent.key.length === 1 &&
          !keyboardEvent.metaKey &&
          !keyboardEvent.ctrlKey &&
          !keyboardEvent.altKey
        ) {
          handled = tryApplyMultiLineEditInput({ type: 'insert-text', text: keyboardEvent.key })
        } else if (keyboardEvent.key === 'PageUp' || keyboardEvent.key === 'PageDown') {
          handled = true
        }
        if (handled) {
          keyboardEvent.preventDefault()
          keyboardEvent.stopPropagation()
          return
        }
      }
      if (keyboardEvent.key !== 'Tab' || keyboardEvent.altKey || keyboardEvent.ctrlKey || keyboardEvent.metaKey) return
      const handled = tryApplyMultilineIndent(keyboardEvent.shiftKey)
      if (!handled) return
      keyboardEvent.preventDefault()
      keyboardEvent.stopPropagation()
    }

    const handleBeforeInput = (event: Event) => {
      const inputEvent = event as InputEvent
      activateEditorFromEventTarget(inputEvent.target)
      if (inputEvent.inputType === 'historyUndo' || inputEvent.inputType === 'historyRedo') {
        scheduleMultiLineHistoryRestore(inputEvent.inputType === 'historyUndo' ? 'undo' : 'redo')
        return
      }
      if (!multiLineEditRef.current) return
      if (inputEvent.isComposing) return
      if (inputEvent.inputType === 'insertText' || inputEvent.inputType === 'insertCompositionText') {
        const text = inputEvent.data ?? ''
        if (!text) return
        const handled = tryApplyMultiLineEditInput({ type: 'insert-text', text })
        if (!handled) return
        inputEvent.preventDefault()
        inputEvent.stopPropagation()
      }
    }

    const handleToolbarSelectionSync = () => {
      scheduleToolbarFormatStateSync()
    }

    root.addEventListener('pointerdown', handlePointerDown, true)
    root.addEventListener('click', handleClick, true)
    root.addEventListener('contextmenu', handleContextMenu, true)
    root.addEventListener('paste', handlePaste, true)
    root.addEventListener('copy', handleCopy, true)
    root.addEventListener('cut', handleCut, true)
    root.addEventListener('keydown', handleKeyDown, true)
    root.addEventListener('beforeinput', handleBeforeInput, true)
    root.addEventListener('keyup', handleToolbarSelectionSync, true)
    root.addEventListener('mouseup', handleToolbarSelectionSync, true)
    root.addEventListener('focusin', handleToolbarSelectionSync, true)
    window.addEventListener('scroll', handleScrollOrResize, true)
    window.addEventListener('resize', handleScrollOrResize)
    return () => {
      root.removeEventListener('pointerdown', handlePointerDown, true)
      root.removeEventListener('click', handleClick, true)
      root.removeEventListener('contextmenu', handleContextMenu, true)
      root.removeEventListener('paste', handlePaste, true)
      root.removeEventListener('copy', handleCopy, true)
      root.removeEventListener('cut', handleCut, true)
      root.removeEventListener('keydown', handleKeyDown, true)
      root.removeEventListener('beforeinput', handleBeforeInput, true)
      root.removeEventListener('keyup', handleToolbarSelectionSync, true)
      root.removeEventListener('mouseup', handleToolbarSelectionSync, true)
      root.removeEventListener('focusin', handleToolbarSelectionSync, true)
      window.removeEventListener('scroll', handleScrollOrResize, true)
      window.removeEventListener('resize', handleScrollOrResize)
    }
  }, [viewMode, displayContent, activeNoteAisles.length])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
      }
      if (toolbarShortcutFeedbackTimerRef.current !== null) {
        window.clearTimeout(toolbarShortcutFeedbackTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (viewMode === 'main') return
    const instance = editorRef.current
    if (!instance) return

    const existing = instance.getMarkdown()
    if (existing !== displayContent) {
      lastEditorMarkdownRef.current = displayContent
      instance.setMarkdown(displayContent, false)
    }
  }, [displayContent, viewMode, activeSpace.id, activeTab.id, activeSubTab?.id, resolvedActiveAisleId, trashTabId, trashSubTabId])

  const commitRename = (type: EditableEntityType, id: string, nextTitle: string) => {
    const isPendingCreatedRename =
      (type === 'tab' || type === 'subtab') &&
      pendingCreatedEditRef.current?.type === type &&
      pendingCreatedEditRef.current.id === id

    if ((type === 'tab' || type === 'subtab') && !isPendingCreatedRename) {
      flushPendingContent()
    }
    const title = nextTitle.trim()
    setEditing(null)
    if (isPendingCreatedRename) {
      pendingCreatedEditRef.current = null
    }
    if (!title) return

    if (type === 'domain') {
      setState((previous) => renameDomain(previous, id, title))
      return
    }

    if (type === 'space') {
      setState((previous) => renameSpaceInActiveDomain(previous, id, title))
      return
    }

    const focusEditorSoon = () => {
      if (viewMode !== 'main') return
      window.requestAnimationFrame(() => {
        const editorKey =
          activeNoteBodyId && resolvedActiveAisleId ? buildAisleEditorKey(activeNoteBodyId, resolvedActiveAisleId) : ''
        if (editorKey && activateAisleEditor(editorKey, { focus: true, allowDuringPendingRename: true })) return
        editorRef.current?.focus()
      })
    }

    if (type === 'tab') {
      updateActiveSpaceData((data) => ({
        ...data,
        tabs: data.tabs.map((tab) => (tab.id === id ? { ...tab, title } : tab)),
      }))
      focusEditorSoon()
      return
    }

    updateActiveSpaceData((data) => ({
      ...data,
      tabs: data.tabs.map((tab) => {
        if (tab.id !== data.activeTabId) return tab
        return {
          ...tab,
          subTabs: tab.subTabs.map((sub) => {
            if (sub.id !== id) return sub
            const pending = pendingContentRef.current
            const pendingMatches =
              pending &&
              pending.spaceId === activeSpaceIdRef.current &&
              pending.tabId === data.activeTabId &&
              pending.subTabId === id
            const latest = pendingMatches ? pending.markdown : editorRef.current ? lastEditorMarkdownRef.current : sub.content
            return { ...sub, title, content: latest }
          }),
        }
      }),
    }))

    pendingContentRef.current = null
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }

    focusEditorSoon()
  }

  const shouldSkipRenameBlur = (type: EditableEntityType, id: string) => {
    const next = skipRenameBlurRef.current
    if (!next || next.type !== type || next.id !== id) return false
    skipRenameBlurRef.current = null
    return true
  }

  const discardPendingCreatedEdit = (type: 'tab' | 'subtab', id: string) => {
    const pending = pendingCreatedEditRef.current
    if (!pending || pending.type !== type || pending.id !== id) {
      setEditing(null)
      return
    }

    pendingCreatedEditRef.current = null
    setEditing(null)

    if (pending.type === 'tab') {
      updateActiveSpaceData((data) => {
        const remainingTabs = data.tabs.filter((tab) => tab.id !== id)
        const fallbackTabId =
          remainingTabs.find((tab) => tab.id === pending.previousTabId)?.id ?? remainingTabs[0]?.id ?? data.activeTabId
        return {
          ...data,
          activeTabId: fallbackTabId,
          tabs: remainingTabs,
        }
      })
      return
    }

    updateActiveSpaceData((data) => ({
      ...data,
      tabs: data.tabs.map((tab) => {
        if (tab.id !== pending.parentTabId) return tab
        const remainingSubTabs = tab.subTabs.filter((subTab) => subTab.id !== id)
        const fallbackSubTabId =
          remainingSubTabs.find((subTab) => subTab.id === pending.previousSubTabId)?.id ?? null
        return {
          ...tab,
          activeSubTabId: fallbackSubTabId,
          subTabs: remainingSubTabs,
        }
      }),
    }))
  }

  const cancelRename = (type: EditableEntityType, id: string) => {
    skipRenameBlurRef.current = { type, id }
    if (type === 'space' || type === 'domain') {
      setEditing(null)
      return
    }
    discardPendingCreatedEdit(type, id)
  }

  const addTab = () => {
    flushPendingContent()
    const noteBody = createNoteBody('')
    const newTab = {
      ...createTab('tab'),
      noteBodyId: noteBody.id,
      homeContent: '',
    }

    setState((previous) => {
      const sanitizedPrevious = applyAutoPurgeToAppState(previous)
      const next = updateActiveSpaceDataInActiveDomain(sanitizedPrevious, (data) => ({
        ...data,
        activeTabId: newTab.id,
        tabs: [...data.tabs, newTab],
      }))
      return {
        ...next,
        noteBodies: next.noteBodies.some((body) => body.id === noteBody.id) ? next.noteBodies : [...next.noteBodies, noteBody],
      }
    })

    pendingCreatedEditRef.current = { type: 'tab', id: newTab.id, previousTabId: workspace.activeTabId }
    setEditing({ type: 'tab', id: newTab.id })
  }

  const addSubTab = () => {
    flushPendingContent()
    const noteBody = createNoteBody('')
    const newSubTab = { ...createSubTab('tab', ''), noteBodyId: noteBody.id }

    setState((previous) => {
      const sanitizedPrevious = applyAutoPurgeToAppState(previous)
      const next = updateActiveSpaceDataInActiveDomain(sanitizedPrevious, (data) => ({
        ...data,
        tabs: data.tabs.map((tab) =>
          tab.id === data.activeTabId
            ? { ...tab, activeSubTabId: newSubTab.id, subTabs: [...tab.subTabs, newSubTab] }
            : tab,
        ),
      }))
      return {
        ...next,
        noteBodies: next.noteBodies.some((body) => body.id === noteBody.id) ? next.noteBodies : [...next.noteBodies, noteBody],
      }
    })

    pendingCreatedEditRef.current = {
      type: 'subtab',
      id: newSubTab.id,
      parentTabId: activeTab.id,
      previousSubTabId: activeTab.activeSubTabId,
    }
    setEditing({ type: 'subtab', id: newSubTab.id })
  }

  const selectTab = (tabId: string) => {
    if (activeTab.id === tabId && activeTab.activeSubTabId === null) return
    flushPendingContent()
    closeImageTools()
    updateActiveSpaceData((data) => ({
      ...data,
      activeTabId: tabId,
      tabs: data.tabs.map((tab) => (tab.id === tabId ? { ...tab, activeSubTabId: null } : tab)),
    }))
  }

  const selectSubTab = (subTabId: string) => {
    if (activeTab.activeSubTabId === subTabId) return
    flushPendingContent()
    closeImageTools()
    updateActiveSpaceData((data) => ({
      ...data,
      tabs: data.tabs.map((tab) =>
        tab.id === data.activeTabId ? { ...tab, activeSubTabId: subTabId } : tab,
      ),
    }))
  }

  const selectParentHomeTab = () => {
    if (activeTab.activeSubTabId === null) return
    flushPendingContent()
    closeImageTools()
    updateActiveSpaceData((data) => ({
      ...data,
      tabs: data.tabs.map((tab) =>
        tab.id === data.activeTabId ? { ...tab, activeSubTabId: null } : tab,
      ),
    }))
  }

  const stageManager = useStageManagerController({
    state,
    stateRef,
    setState,
    storageHydrated,
    activeSpace,
    workspace,
    viewMode,
    setViewMode,
    setMenuOpen,
    setContextMenu,
    setEditing,
    flushPendingContent,
    exitArrangeMode,
    returnToLastTabLikeView,
    selectTab,
    buildStateWithLatestEditorContent,
    pushToast,
  })

  const openSpace = (spaceId: string) => {
    flushPendingContent()
    closeImageTools()
    if (arrangeMode.active) {
      exitArrangeMode()
    }
    setState((previous) => setActiveSpaceInActiveDomain(previous, spaceId))
    setViewMode('main')
    setMenuOpen(false)
    setContextMenu(null)
    setEditing(null)
  }

  const addSpace = () => {
    flushPendingContent()
    const newSpace = createSpace('New Space')
    setState((previous) => addSpaceToActiveDomain(previous, newSpace))
    setViewMode('spaces')
    setEditing({ type: 'space', id: newSpace.id })
    setMenuOpen(false)
  }

  const duplicateSpaceFromContext = () => {
    if (!contextMenu || contextMenu.type !== 'space') return
    const sourceSpace = state.spaces.find((space) => space.id === contextMenu.spaceId)
    if (!sourceSpace) {
      setContextMenu(null)
      return
    }

    const duplicatedSpace = duplicateSpace(sourceSpace, state.spaces.map((space) => space.name))

    setState((previous) => insertSpaceAfterInActiveDomain(previous, sourceSpace.id, duplicatedSpace))

    setViewMode('spaces')
    setEditing({ type: 'space', id: duplicatedSpace.id })
    setMenuOpen(false)
    setContextMenu(null)
  }

  const openSpacesView = () => {
    flushPendingContent()
    if (arrangeMode.active) {
      exitArrangeMode()
    }
    setViewMode('spaces')
    setMenuOpen(false)
    setContextMenu(null)
  }

  const openDomainsView = () => {
    flushPendingContent()
    if (arrangeMode.active) {
      exitArrangeMode()
    }
    setViewMode('domains')
    setMenuOpen(false)
    setContextMenu(null)
    setEditing(null)
  }

  const openDomain = (domainId: string) => {
    flushPendingContent()
    if (arrangeMode.active) {
      exitArrangeMode()
    }
    setState((previous) => setActiveDomain(previous, domainId))
    setViewMode('spaces')
    setMenuOpen(false)
    setContextMenu(null)
    setEditing(null)
  }

  const addDomainFromPage = () => {
    flushPendingContent()
    const newDomain = createDomain('New Domain')
    setState((previous) => addDomain(previous, newDomain))
    setViewMode('domains')
    setEditing({ type: 'domain', id: newDomain.id })
    setMenuOpen(false)
    setContextMenu(null)
  }

  const toggleTrashView = () => {
    flushPendingContent()
    setMenuOpen(false)
    setContextMenu(null)

    setViewMode((previous) => {
      if (previous === 'trash') return 'main'
      setTrashTabId(TRASH_HOME_ID)
      setTrashSubTabId(null)
      return 'trash'
    })
  }

  const openSettings = () => {
    if (viewMode === 'spaces' || viewMode === 'domains') return
    flushPendingContent()
    setMenuOpen(false)
    setContextMenu(null)
    setViewMode('settings')
  }

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

  const openContextMenuForTab = (event: MouseEvent<HTMLButtonElement>, tabId: string) => {
    if (viewMode !== 'main') return
    event.preventDefault()
    setMenuOpen(false)
    setContextMenu({ type: 'tab', tabId, x: event.clientX, y: event.clientY })
  }

  const openContextMenuForSubTab = (event: MouseEvent<HTMLButtonElement>, tabId: string, subTabId: string) => {
    if (viewMode !== 'main') return
    event.preventDefault()
    setMenuOpen(false)
    setContextMenu({ type: 'subtab', tabId, subTabId, x: event.clientX, y: event.clientY })
  }

  const openContextMenuForTrashTab = (event: MouseEvent<HTMLButtonElement>, trashParent: TrashParentBucket) => {
    if (viewMode !== 'trash') return
    event.preventDefault()
    setMenuOpen(false)
    setContextMenu({
      type: 'trash-tab',
      source: trashParent.source,
      deletedTabEntryId: trashParent.deletedTabEntryId,
      parentTabId: trashParent.parentTabId,
      x: event.clientX,
      y: event.clientY,
    })
  }

  const openContextMenuForTrashSubTab = (
    event: MouseEvent<HTMLButtonElement>,
    trashParent: TrashParentBucket,
    currentSubTabId: string,
  ) => {
    if (viewMode !== 'trash') return
    event.preventDefault()
    setMenuOpen(false)
    setContextMenu({
      type: 'trash-subtab',
      source: trashParent.source,
      deletedTabEntryId: trashParent.deletedTabEntryId,
      parentTabId: trashParent.parentTabId,
      subTabId: currentSubTabId,
      x: event.clientX,
      y: event.clientY,
    })
  }

  const openContextMenuForSpace = (event: MouseEvent<HTMLButtonElement>, spaceId: string) => {
    if (viewMode !== 'spaces') return
    event.preventDefault()
    setMenuOpen(false)
    setContextMenu({ type: 'space', spaceId, x: event.clientX, y: event.clientY })
  }

  const openContextMenuForDomain = (event: MouseEvent<HTMLButtonElement>, domainId: string) => {
    if (viewMode !== 'domains') return
    event.preventDefault()
    setMenuOpen(false)
    setContextMenu({ type: 'domain', domainId, x: event.clientX, y: event.clientY })
  }

  const buildDeleteTargetFromContextMenu = (): DeleteTarget | null => {
    if (!contextMenu) return null
    return contextMenu.type === 'tab'
      ? { type: 'tab', tabId: contextMenu.tabId }
      : contextMenu.type === 'subtab'
        ? { type: 'subtab', tabId: contextMenu.tabId, subTabId: contextMenu.subTabId }
        : contextMenu.type === 'image' || contextMenu.type === 'domain' || contextMenu.type === 'internal-note-link'
          ? null
        : contextMenu.type === 'trash-tab'
          ? {
              type: 'trash-tab',
              source: contextMenu.source,
              deletedTabEntryId: contextMenu.deletedTabEntryId,
              parentTabId: contextMenu.parentTabId,
            }
          : contextMenu.type === 'trash-subtab'
            ? {
                type: 'trash-subtab',
                source: contextMenu.source,
                deletedTabEntryId: contextMenu.deletedTabEntryId,
                parentTabId: contextMenu.parentTabId,
                subTabId: contextMenu.subTabId,
              }
            : { type: 'space', spaceId: contextMenu.spaceId }
  }

  const openDeleteModalFromContext = (permanent: boolean) => {
    const target = buildDeleteTargetFromContextMenu()
    if (!target) return
    setModal({ type: 'delete-target', target, permanent })
    setContextMenu(null)
  }

  const deleteFromContext = () => {
    const target = buildDeleteTargetFromContextMenu()
    if (!target) return
    setContextMenu(null)
    deleteTarget(target, false)
  }

  const openDuplicateModalFromContext = () => {
    if (!contextMenu || (contextMenu.type !== 'tab' && contextMenu.type !== 'subtab')) return
    flushPendingContent()
    const source: NoteLocation = {
      domainId: state.activeDomainId,
      spaceId: activeSpace.id,
      tabId: contextMenu.tabId,
      subTabId: contextMenu.type === 'subtab' ? contextMenu.subTabId : null,
    }
    const target = getDefaultNoteReferenceTarget(state, source)
    setModal({
      type: 'duplicate-note',
      source,
      target,
    })
    setContextMenu(null)
  }

  const openCopyModalFromContext = () => {
    if (!contextMenu || (contextMenu.type !== 'tab' && contextMenu.type !== 'subtab')) return
    flushPendingContent()
    const source: NoteLocation = {
      domainId: state.activeDomainId,
      spaceId: activeSpace.id,
      tabId: contextMenu.tabId,
      subTabId: contextMenu.type === 'subtab' ? contextMenu.subTabId : null,
    }
    const target = getDefaultNoteReferenceTarget(state, source)
    setModal({
      type: 'copy-note',
      source,
      target,
    })
    setContextMenu(null)
  }

  const openDeduplicateModalFromContext = () => {
    if (!contextMenu || (contextMenu.type !== 'tab' && contextMenu.type !== 'subtab')) return
    const source: NoteLocation = {
      domainId: state.activeDomainId,
      spaceId: activeSpace.id,
      tabId: contextMenu.tabId,
      subTabId: contextMenu.type === 'subtab' ? contextMenu.subTabId : null,
    }
    const noteBodyId = getLocationInfo(state, source).noteBodyId
    if (!noteBodyId) return
    const locations = listNoteLocationsForBody(state, noteBodyId)
    setModal({
      type: 'deduplicate-note',
      noteBodyId,
      keepLocationKeys: locations.map((location) => buildNoteLocationKey(location)),
    })
    setContextMenu(null)
  }

  const getCurrentDuplicateCount = () => {
    const location = contextMenu && (contextMenu.type === 'tab' || contextMenu.type === 'subtab')
      ? {
          domainId: state.activeDomainId,
          spaceId: activeSpace.id,
          tabId: contextMenu.tabId,
          subTabId: contextMenu.type === 'subtab' ? contextMenu.subTabId : null,
        }
      : null
    if (!location) return 0
    const noteBodyId = getLocationInfo(state, location).noteBodyId
    return noteBodyId ? listNoteLocationsForBody(state, noteBodyId).length : 0
  }

  const openNoteReferenceModal = () => {
    flushPendingContent()
    const source = getCurrentNoteLocation()
    const target = getDefaultNoteReferenceTarget(stateRef.current, source)
    setModal({
      type: 'insert-note-reference',
      insertAs: 'link',
      target,
    })
  }

  const openInternalNoteLinkFromContext = () => {
    if (!contextMenu || contextMenu.type !== 'internal-note-link') return
    const target = contextMenu.target
    setContextMenu(null)
    navigateToNoteLocation(target)
  }

  const renameInternalNoteLinkFromContext = () => {
    if (!contextMenu || contextMenu.type !== 'internal-note-link') return
    const linkContext = contextMenu
    const nextLabel = window.prompt('link name', linkContext.label)?.trim()
    if (!nextLabel || nextLabel === linkContext.label) {
      setContextMenu(null)
      return
    }

    const nextSyntax = `[${escapeMarkdownLinkLabel(nextLabel)}](${linkContext.href})`
    const currentEditor = editorRef.current
    const view = getWysiwygView(currentEditor)

    if (currentEditor && view) {
      try {
        const currentHit = getInternalNoteLinkHitAtDocPosition(view.state.doc, linkContext.from)
        const from = currentHit?.href === linkContext.href ? currentHit.from : linkContext.from
        const to = currentHit?.href === linkContext.href ? currentHit.to : linkContext.to
        view.dispatch(view.state.tr.insertText(nextSyntax, from, to).scrollIntoView())
        currentEditor.focus()
        commitActiveEditorMarkdownNow(currentEditor)
        setContextMenu(null)
        return
      } catch {
        // Fall back to markdown replacement below if the document position shifted.
      }
    }

    replaceActiveEditorMarkdown(replaceInternalNoteLinkByOccurrence(getActiveEditorMarkdown(), linkContext, nextSyntax))
    setContextMenu(null)
  }

  const beginRenameSpaceFromContext = () => {
    if (!contextMenu || contextMenu.type !== 'space') return
    setEditing({ type: 'space', id: contextMenu.spaceId })
    setContextMenu(null)
  }

  const beginRenameDomainFromContext = () => {
    if (!contextMenu || contextMenu.type !== 'domain') return
    setEditing({ type: 'domain', id: contextMenu.domainId })
    setContextMenu(null)
  }

  const deleteSpace = (spaceId: string) => {
    setState((previous) => removeSpaceFromActiveDomain(previous, spaceId))
  }

  const deleteTarget = (target: DeleteTarget, permanent: boolean) => {
    flushPendingContent()
    let nextToastMessage: string | null = null

    if (target.type === 'space') {
      deleteSpace(target.spaceId)
      return
    }

    updateActiveSpaceData((data) => {
      if (target.type === 'trash-tab') {
        if (target.source === 'subtabs-only') {
          return {
            ...data,
            deletedSubTabs: data.deletedSubTabs.filter((entry) => entry.parentTabId !== target.parentTabId),
          }
        }

        return {
          ...data,
          deletedTabs: data.deletedTabs.filter((entry) => entry.id !== target.deletedTabEntryId),
        }
      }

      if (target.type === 'trash-subtab') {
        if (target.source === 'deleted-tab' && target.deletedTabEntryId) {
          return {
            ...data,
            deletedTabs: data.deletedTabs.map((entry) =>
              entry.id !== target.deletedTabEntryId
                ? entry
                : {
                    ...entry,
                    tab: {
                      ...entry.tab,
                      subTabs: entry.tab.subTabs.filter((sub) => sub.id !== target.subTabId),
                    },
                  },
            ),
          }
        }

        return {
          ...data,
          deletedSubTabs: data.deletedSubTabs.filter((entry) => entry.id !== target.subTabId),
        }
      }

      if (target.type === 'tab') {
        const tabToDelete = data.tabs.find((tab) => tab.id === target.tabId)
        if (!tabToDelete) return data
        if (!permanent) {
          nextToastMessage = 'tab has been moved to trash.'
        }

        const remaining = data.tabs.filter((tab) => tab.id !== target.tabId)
        const deletedTabs = permanent
          ? data.deletedTabs
          : [
              ...data.deletedTabs,
              {
                id: createId(),
                tab: tabToDelete,
                deletedAt: Date.now(),
              },
            ]

        if (remaining.length === 0) {
          const fallback = createTab('tab')
          return {
            ...data,
            activeTabId: fallback.id,
            tabs: [fallback],
            deletedTabs,
          }
        }

        const nextActiveId = data.activeTabId === target.tabId ? remaining[0].id : data.activeTabId
        return {
          ...data,
          activeTabId: nextActiveId,
          tabs: remaining.map((tab) => (tab.id === nextActiveId ? { ...tab, activeSubTabId: null } : tab)),
          deletedTabs,
        }
      }

      const parent = data.tabs.find((tab) => tab.id === target.tabId)
      if (!parent) return data
      const subToDelete = parent.subTabs.find((sub) => sub.id === target.subTabId)
      if (!subToDelete) return data
      if (!permanent) {
        nextToastMessage = 'tab has been moved to trash.'
      }

      return {
        ...data,
        tabs: data.tabs.map((tab) =>
          tab.id === target.tabId
            ? {
                ...tab,
                activeSubTabId: tab.activeSubTabId === target.subTabId ? null : tab.activeSubTabId,
                subTabs: tab.subTabs.filter((sub) => sub.id !== target.subTabId),
              }
            : tab,
        ),
        deletedSubTabs: permanent
          ? data.deletedSubTabs
          : [
              ...data.deletedSubTabs,
              {
                id: createId(),
                parentTabId: parent.id,
                parentTabTitle: parent.title,
                subTab: subToDelete,
                deletedAt: Date.now(),
              },
            ],
      }
    })
    if (target.type === 'trash-tab') {
      setTrashTabId(TRASH_HOME_ID)
      setTrashSubTabId(null)
    }
    if (target.type === 'trash-subtab') {
      setTrashSubTabId(null)
    }
    if (nextToastMessage) {
      setToast({
        id: Date.now(),
        message: nextToastMessage,
        tone: 'success',
        durationMs: DEFAULT_TOAST_DURATION_MS,
      })
    }
  }

  const restoreAllTrash = () => {
    updateActiveSpaceData((data) => {
      let tabs = [...data.tabs]
      for (const entry of data.deletedTabs) {
        if (tabs.some((tab) => tab.id === entry.tab.id)) continue
        tabs = [...tabs, entry.tab]
      }

      for (const entry of data.deletedSubTabs) {
        const parentIndex = tabs.findIndex((tab) => tab.id === entry.parentTabId)
        if (parentIndex >= 0) {
          const parent = tabs[parentIndex]
          if (!parent.subTabs.some((sub) => sub.id === entry.subTab.id)) {
            tabs[parentIndex] = { ...parent, subTabs: [...parent.subTabs, entry.subTab] }
          }
        } else {
          tabs = [
            ...tabs,
            {
              id: entry.parentTabId,
              title: entry.parentTabTitle,
              noteBodyId: createId(),
              homeContent: '',
              activeSubTabId: null,
              subTabs: [entry.subTab],
            },
          ]
        }
      }

      return {
        ...data,
        activeTabId: tabs.some((tab) => tab.id === data.activeTabId) ? data.activeTabId : tabs[0].id,
        tabs,
        deletedTabs: [],
        deletedSubTabs: [],
      }
    })

    setTrashTabId(TRASH_HOME_ID)
    setTrashSubTabId(null)
  }

  const deleteAllTrash = () => {
    updateActiveSpaceData((data) => ({ ...data, deletedTabs: [], deletedSubTabs: [] }))
    setTrashTabId(TRASH_HOME_ID)
    setTrashSubTabId(null)
  }

  const confirmModal = () => {
    if (!modal) return

    if (modal.type === 'export-space') {
      const spaceId = modal.spaceId
      setModal(null)
      void exportData('space', spaceId)
      return
    }

    if (modal.type === 'duplicate-note') {
      const targetInfo = getLocationInfo(stateRef.current, modal.target)
      if (!targetInfo.noteBodyId) {
        setModal(null)
        return
      }
      setState((previous) => updateNoteLocationBody(previous, modal.source, targetInfo.noteBodyId))
      setModal(null)
      pushToast('note duplicate linked.', 'success')
      return
    }

    if (modal.type === 'copy-note') {
      const targetInfo = getLocationInfo(stateRef.current, modal.target)
      const targetBody = targetInfo.noteBodyId
        ? stateRef.current.noteBodies.find((candidate) => candidate.id === targetInfo.noteBodyId)
        : null
      if (!targetBody) {
        setModal(null)
        pushToast('choose an existing note.', 'warning')
        return
      }

      setState((previous) => {
        const latestTargetInfo = getLocationInfo(previous, modal.target)
        const targetBody = latestTargetInfo.noteBodyId
          ? previous.noteBodies.find((candidate) => candidate.id === latestTargetInfo.noteBodyId)
          : null
        if (!targetBody) return previous
        const copiedBody = cloneNoteBodyAsIndependentCopy(targetBody)
        return updateNoteLocationBody(
          {
            ...previous,
            noteBodies: [...previous.noteBodies, copiedBody],
          },
          modal.source,
          copiedBody.id,
        )
      })
      setModal(null)
      pushToast('note copied.', 'success')
      return
    }

    if (modal.type === 'deduplicate-note') {
      const keepKeys = new Set(modal.keepLocationKeys)
      if (keepKeys.size === 0) {
        pushToast('keep at least one duplicate linked.', 'warning')
        return
      }
      const locations = listNoteLocationsForBody(stateRef.current, modal.noteBodyId)
      let nextState = stateRef.current
      const newBodies: NoteBody[] = []
      for (const location of locations) {
        if (keepKeys.has(buildNoteLocationKey(location))) continue
        const emptyBody: NoteBody = {
          id: createId(),
          aisles: [{ id: createId(), markdown: '' }],
        }
        newBodies.push(emptyBody)
        nextState = updateNoteLocationBody(nextState, location, emptyBody.id)
      }
      setState({ ...nextState, noteBodies: [...nextState.noteBodies, ...newBodies] })
      setModal(null)
      pushToast('duplicates updated.', 'success')
      return
    }

    if (modal.type === 'insert-note-reference') {
      if (insertNoteReference(modal)) {
        setModal(null)
      }
      return
    }

    if (modal.type === 'delete-target') {
      deleteTarget(modal.target, modal.permanent)
    }

    if (modal.type === 'trash-restore-all') restoreAllTrash()
    if (modal.type === 'trash-delete-all') deleteAllTrash()

    setModal(null)
  }

  const editorReadOnly = viewMode !== 'main'

  const executeToolbarCommand = (command: string, payload?: Record<string, unknown>) => {
    setHeadingMenuOpen(false)
    setNoteToolsOpen(false)
    if (!runActiveEditorCommand(command, payload)) {
      pushToast('open a note before using the toolbar.', 'warning')
    }
  }

  const insertImageFromToolbar = () => {
    setHeadingMenuOpen(false)
    setNoteToolsOpen(false)
    const currentEditor = editorRef.current
    if (!currentEditor) {
      pushToast('open a note before inserting an image.', 'warning')
      return
    }

    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = typeof reader.result === 'string' ? reader.result : ''
        if (!dataUrl) return
        currentEditor.focus()
        getCommandCapableEditor(currentEditor).exec('addImage', { imageUrl: dataUrl, altText: file.name })
        commitActiveEditorMarkdownNow(currentEditor)
      }
      reader.readAsDataURL(file)
    }
    input.click()
  }

  const insertWebLinkFromToolbar = () => {
    setHeadingMenuOpen(false)
    setNoteToolsOpen(false)
    const currentEditor = editorRef.current
    if (!currentEditor) {
      pushToast('open a note before inserting a link.', 'warning')
      return
    }
    const url = window.prompt('link url')
    if (!url) return
    const selectedText = getCommandCapableEditor(currentEditor).getSelectedText().trim()
    const label = window.prompt('link text', selectedText || url)
    insertLinkIntoActiveEditor((label ?? '').trim() || url, url)
  }

  const renderEditorToolbarPopovers = () => (
    <EditorToolbarPopovers
      headingMenuOpen={headingMenuOpen}
      noteToolsOpen={noteToolsOpen}
      toolbarPopoverPosition={toolbarPopoverPosition}
      aisleDeleteMode={aisleDeleteMode}
      aisleDeleteConfirmation={aisleDeleteConfirmation}
      activeNoteAisles={activeNoteAisles}
      aisleDeleteConfirmButtonRef={aisleDeleteConfirmButtonRef}
      onExecuteToolbarCommand={executeToolbarCommand}
      onCloseAislePopover={() => {
        setNoteToolsOpen(false)
        setHeadingMenuOpen(false)
      }}
      onAddAisle={addAisleToActiveNote}
      onEnterAisleDeleteMode={() => {
        setAisleDeleteConfirmation(null)
        setAisleDeleteMode(true)
      }}
      onCancelAisleDeleteConfirmation={() => setAisleDeleteConfirmation(null)}
      onDeleteAisle={deleteAisleFromActiveNote}
      onWarn={(message) => pushToast(message, 'warning')}
    />
  )

  const openNoteReferenceFromToolbar = () => {
    setHeadingMenuOpen(false)
    setNoteToolsOpen(false)
    setToolbarPopoverPosition({ heading: null, aisles: null })
    openNoteReferenceModal()
  }

  const toggleAisleToolbarPopover = () => {
    setHeadingMenuOpen(false)
    setToolbarPopoverPosition((previous) => ({ ...previous, heading: null }))
    const nextOpen = !noteToolsOpen
    setNoteToolsOpen(nextOpen)
    if (nextOpen) {
      refreshToolbarPopoverPosition('aisles')
    } else {
      setToolbarPopoverPosition((previous) => ({ ...previous, aisles: null }))
    }
  }

  const toggleHeadingToolbarPopover = () => {
    setNoteToolsOpen(false)
    setToolbarPopoverPosition((previous) => ({ ...previous, aisles: null }))
    const nextOpen = !headingMenuOpen
    setHeadingMenuOpen(nextOpen)
    if (nextOpen) {
      refreshToolbarPopoverPosition('heading')
    } else {
      setToolbarPopoverPosition((previous) => ({ ...previous, heading: null }))
    }
  }

  const clearActiveNoteFromToolbar = () => {
    setHeadingMenuOpen(false)
    setNoteToolsOpen(false)
    clearActiveNoteContent()
  }

  const renderSharedToolbar = () => (
    <SharedEditorToolbar
      headingButtonRef={headingToolbarButtonRef}
      aisleButtonRef={aisleToolbarButtonRef}
      toolbarFormatState={toolbarFormatState}
      toolbarShortcutFeedback={toolbarShortcutFeedback}
      onOpenNoteReference={openNoteReferenceFromToolbar}
      onToggleAisles={toggleAisleToolbarPopover}
      onToggleHeading={toggleHeadingToolbarPopover}
      onCommand={executeToolbarCommand}
      onInsertImage={insertImageFromToolbar}
      onInsertWebLink={insertWebLinkFromToolbar}
      onClear={clearActiveNoteFromToolbar}
    />
  )

  const renderImageToolsOverlay = () => (
    <ImageToolsOverlay
      visible={viewMode === 'main'}
      imageTools={imageTools}
      inlineCrop={inlineCrop}
      onStartCrop={startInlineCrop}
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

  return (
    <main
      className={`app-shell theme-${state.theme} view-${viewMode} ${
        viewMode === 'stage-manager' ? 'view-stage-manager' : ''
      }`}
      style={
        {
          '--tab-button-scale': String(state.ui.tabButtonScale),
          '--note-font-scale': String(state.ui.noteFontScale),
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
        trashParentTabs={trashParentTabs}
        trashTabId={trashTabId}
        menuOpen={menuOpen}
        aisleDeleteMode={aisleDeleteMode}
        onAutoSizeRenameInput={autoSizeRenameInput}
        onShouldSkipRenameBlur={shouldSkipRenameBlur}
        onCommitRename={commitRename}
        onCancelRename={cancelRename}
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
        onExitAisleDeleteMode={exitAisleDeleteMode}
        onEndStageManager={stageManager.end}
        onCloseSettingsView={closeSettingsView}
        onSetMenuOpen={setMenuOpen}
        onSetContextMenu={setContextMenu}
        onCloseNotePopovers={() => {
          setNoteToolsOpen(false)
          setHeadingMenuOpen(false)
        }}
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
          editingShortcut={settingsController.editingShortcut}
          mouseBackForwardEnabled={settingsController.mouseBackForwardEnabledDraft}
          genericHistoryHotkeysEnabled={settingsController.genericHistoryHotkeysEnabledDraft}
          settingsDaysDraft={settingsController.settingsDaysDraft}
          activeSpaceId={activeSpace.id}
          exportStatus={settingsController.exportStatus}
          tabButtonScaleDraft={settingsController.tabButtonScaleDraft}
          noteFontScaleDraft={settingsController.noteFontScaleDraft}
          showParentHomeTabDraft={settingsController.showParentHomeTabDraft}
          onSectionChange={settingsController.changeSection}
          onToggleShortcutEdit={settingsController.toggleShortcutEdit}
          onMouseBackForwardChange={settingsController.updateMouseBackForwardSetting}
          onGenericHistoryHotkeysChange={settingsController.updateGenericHistoryHotkeysSetting}
          onAutoRemoveDaysChange={settingsController.updateAutoRemoveDaysSetting}
          onExportSpace={(spaceId) => setModal({ type: 'export-space', spaceId })}
          onExportAll={() => exportData('all')}
          onThemeChange={settingsController.updateThemeSetting}
          onTabButtonScaleChange={settingsController.updateTabButtonScaleSetting}
          onNoteFontScaleChange={settingsController.updateNoteFontScaleSetting}
          onShowParentHomeTabChange={settingsController.updateShowParentHomeTabSetting}
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
            onGetStageManagerParentSelection={stageManager.getParentSelection}
            onStageManagerHomeClick={stageManager.handleHomeClick}
            onStageManagerSubTabClick={stageManager.handleSubTabClick}
            onConsumeArrangeClickSuppression={consumeArrangeClickSuppression}
            onSelectParentHomeTab={selectParentHomeTab}
            onSelectSubTab={selectSubTab}
            onBeginEdit={setEditing}
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
              aisleDeleteMode={aisleDeleteMode}
              aisleScrollRef={aisleScrollRef}
              toolbar={renderSharedToolbar()}
              headingPopover={renderEditorToolbarPopovers()}
              aislePopover={null}
              deleteConfirmation={null}
              imageToolsOverlay={renderImageToolsOverlay()}
              onRootChange={(node) => {
                editorEventRootRef.current = node
              }}
              onAisleScroll={(scrollLeft) => {
                if (!activeNoteBodyId) return
                aisleHorizontalScrollByBodyRef.current.set(activeNoteBodyId, scrollLeft)
              }}
              onActivateAisle={(editorKey) => activateAisleEditor(editorKey, { flushPrevious: true })}
              onRegisterAisleEditorRoot={registerAisleEditorRoot}
              onRequestDeleteAisle={requestDeleteAisleFromActiveNote}
            />
          ) : (
            renderEditorShell()
          )}
        </>
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
        onOpenDuplicateModal={openDuplicateModalFromContext}
        onOpenDeduplicateModal={openDeduplicateModalFromContext}
        onOpenCopyModal={openCopyModalFromContext}
        onMoveToTrash={deleteFromContext}
      />

      <ModalHost
        modal={modal}
        state={state}
        activeSpace={activeSpace}
        domainsForPickers={domainsForPickers}
        onModalChange={setModal}
        onConfirm={confirmModal}
      />

      <ToastHost
        toast={toast}
        onToastMouseEnter={() => {
          setToastHovered(true)
          setToastWasHovered(true)
        }}
        onToastMouseLeave={() => {
          setToastHovered(false)
          setToastWasHovered(true)
        }}
      />

    </main>
  )
}

export default App
