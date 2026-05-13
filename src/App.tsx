import { type MouseEvent, type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Editor } from '@toast-ui/editor'
import '@toast-ui/editor/dist/toastui-editor.css'
import './App.css'
import {
  ARRANGE_DRAG_START_SLOP_PX,
  ARRANGE_PRESS_DELAY_MS,
  ARRANGE_TAP_SLOP_PX,
  DEFAULT_ARRANGE_MODE,
  getArrangeRailInsertionTarget,
  isPointInsideElement,
  moveItemByInsertion,
} from './arrange/arrange-utils'
import { DomainsPage } from './components/domains/DomainsPage'
import { EditorToolbarPopovers } from './components/editor/EditorToolbarPopovers'
import { ImageToolsOverlay, type InlineCropDragMode } from './components/editor/ImageToolsOverlay'
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
import {
  COMPLETED_TASK_UNDO_HINT_COOLDOWN_MS,
  COMPLETED_TASK_UNDO_HINT_DETECTION_MS,
  COMPLETED_TASK_UNDO_HINT_MESSAGE,
  COMPLETED_TASK_UNDO_HINT_TOAST_DURATION_MS,
  installCompletedTaskCheckboxBehavior,
  installTaskTextReorderBehavior,
} from './editor/task-behavior'
import { exportAppData, sanitizeName, type ExportScope } from './export/export-data'
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
  normalizeHeadingMarkers,
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
import { DEFAULT_AUTO_REMOVE_DAYS } from './settings/defaults'
import { useSettingsController } from './settings/useSettingsController'
import { applyAutoPurgeToAppState, applyMarkdownToAppState, ensureNoteBodiesForAppState, parseSavedState } from './state/app-state'
import {
  addDomain,
  addSpaceToActiveDomain,
  createDomain,
  insertSpaceAfterInActiveDomain,
  moveSpaceWithinActiveDomain,
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
  createWorkspaceDataFromTabs,
  duplicateSpace,
  MAX_NOTE_AISLES,
} from './state/workspace'
import {
  buildStageManagerSelectionSnapshot,
  createDefaultStageManagerDraft,
  createEmptyStageManagerParentSelection,
  createStageManagerSelectionState,
  normalizeStageManagerParentSelection,
  orderStageManagerSubTabIds,
} from './stage-manager/selection'
import {
  appendSubTabsToParent,
  buildStageManagerMovedSubTabs,
  cloneTabForTransfer,
  cloneSubTabForTransfer,
  createPromotedParentTab,
  stripStageManagerSelectionsFromWorkspace,
} from './stage-manager/transforms'
import { appStateStore } from './storage/app-state-store'
import { buildTrashParentBuckets, resolveTrashContentDisplay, TRASH_HOME_ID } from './trash/trash-model'
import type {
  AppState,
  ArrangeDragItem,
  ArrangeDragSeed,
  ArrangeInsertPosition,
  ArrangeModeState,
  ArrangeScope,
  ArrangeSource,
  ArrangeTapCandidate,
  ArrangeTapCandidateSeed,
  ContextMenuState,
  DeleteTarget,
  Domain,
  ImageToolsState,
  InlineCropState,
  LinkPromptState,
  ModalState,
  MultiLineEditState,
  NoteAisle,
  NoteBody,
  NoteLocation,
  PendingContent,
  PendingCreatedEdit,
  Space,
  SpaceArrangeDragPreview,
  StageManagerAction,
  StageManagerDraft,
  StageManagerParentSelection,
  StageManagerSelectionSnapshot,
  StageManagerSelectionState,
  StageManagerStep,
  Tab,
  TabArrangeDragItem,
  TabArrangeDragPreview,
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
  const [arrangeMode, setArrangeMode] = useState<ArrangeModeState>(DEFAULT_ARRANGE_MODE)
  const [stageManagerStep, setStageManagerStep] = useState<StageManagerStep>('select')
  const [stageManagerAction, setStageManagerAction] = useState<StageManagerAction | null>(null)
  const [stageManagerSelections, setStageManagerSelections] = useState<StageManagerSelectionState>({})
  const [stageManagerDraft, setStageManagerDraft] = useState<StageManagerDraft>(createDefaultStageManagerDraft)
  const [activeAisleId, setActiveAisleId] = useState<string>('')
  const [arrangeDraggingItem, setArrangeDraggingItem] = useState<ArrangeDragItem | null>(null)
  const [spaceArrangeDragPreview, setSpaceArrangeDragPreview] = useState<SpaceArrangeDragPreview | null>(null)
  const [tabArrangeDragPreview, setTabArrangeDragPreview] = useState<TabArrangeDragPreview | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [toastHovered, setToastHovered] = useState(false)
  const [toastWasHovered, setToastWasHovered] = useState(false)
  const [imageTools, setImageTools] = useState<ImageToolsState>({
    visible: false,
    cropTop: 0,
    cropLeft: 0,
    resizeTop: 0,
    resizeLeft: 0,
  })
  const [inlineCrop, setInlineCrop] = useState<InlineCropState>({
    active: false,
    relX: 0,
    relY: 0,
    relWidth: 1,
    relHeight: 1,
    top: 0,
    left: 0,
    width: 0,
    height: 0,
  })
  const inlineCropRef = useRef<InlineCropState>(inlineCrop)
  const updateInlineCrop = (updater: InlineCropState | ((previous: InlineCropState) => InlineCropState)) => {
    const previous = inlineCropRef.current
    const nextInlineCrop =
      typeof updater === 'function'
        ? (updater as (previous: InlineCropState) => InlineCropState)(previous)
        : updater
    inlineCropRef.current = nextInlineCrop
    setInlineCrop(nextInlineCrop)
    return nextInlineCrop
  }
  const resetInlineCropDrag = () => {
    inlineCropDragRef.current = {
      mode: null,
      startX: 0,
      startY: 0,
      startRelX: 0,
      startRelY: 0,
      startRelWidth: 1,
      startRelHeight: 1,
    }
  }
  const startInlineCropDrag = (mode: InlineCropDragMode, clientX: number, clientY: number) => {
    const crop = inlineCropRef.current
    if (!crop.active) return false
    inlineCropDragRef.current = {
      mode,
      startX: clientX,
      startY: clientY,
      startRelX: crop.relX,
      startRelY: crop.relY,
      startRelWidth: crop.relWidth,
      startRelHeight: crop.relHeight,
    }
    return true
  }
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
  const primaryTabRailRef = useRef<HTMLDivElement | null>(null)
  const subTabRailRef = useRef<HTMLDivElement | null>(null)
  const spacesGridRef = useRef<HTMLDivElement | null>(null)
  const activeImageRef = useRef<HTMLImageElement | null>(null)
  const imageResizeRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const inlineCropDragRef = useRef<{
    mode: InlineCropDragMode | null
    startX: number
    startY: number
    startRelX: number
    startRelY: number
    startRelWidth: number
    startRelHeight: number
  }>({ mode: null, startX: 0, startY: 0, startRelX: 0, startRelY: 0, startRelWidth: 1, startRelHeight: 1 })

  const pendingContentRef = useRef<PendingContent | null>(null)
  const pendingCreatedEditRef = useRef<PendingCreatedEdit | null>(null)
  const skipRenameBlurRef = useRef<{ type: EditableEntityType; id: string } | null>(null)
  const arrangePressTimerRef = useRef<number | null>(null)
  const arrangeTapCandidateRef = useRef<ArrangeTapCandidate | null>(null)
  const arrangeDragSeedRef = useRef<ArrangeDragSeed | null>(null)
  const spaceArrangeDragRef = useRef<SpaceArrangeDragPreview | null>(null)
  const tabArrangeDragRef = useRef<TabArrangeDragPreview | null>(null)
  const suppressArrangeClickRef = useRef<Set<string>>(new Set())
  const suppressNextSpaceArrangeExitRef = useRef(false)
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

  const getStageManagerParentSelection = (tab: Tab) => normalizeStageManagerParentSelection(tab, stageManagerSelections[tab.id])

  const updateStageManagerSelectionForTab = (
    tab: Tab,
    updater: (selection: StageManagerParentSelection) => StageManagerParentSelection,
  ) => {
    setStageManagerSelections((previous) => {
      const currentSelection = normalizeStageManagerParentSelection(tab, previous[tab.id])
      return {
        ...previous,
        [tab.id]: normalizeStageManagerParentSelection(tab, updater(currentSelection)),
      }
    })
  }

  const resetStageManagerState = (tabs: Tab[] = workspace.tabs) => {
    setStageManagerStep('select')
    setStageManagerAction(null)
    setStageManagerSelections(createStageManagerSelectionState(tabs))
    setStageManagerDraft(createDefaultStageManagerDraft())
  }

  const updateStageManagerDraft = (patch: Partial<StageManagerDraft>) => {
    setStageManagerDraft((previous) => ({
      ...previous,
      ...patch,
    }))
  }

  const selectAllStageManagerItems = () => {
    setStageManagerSelections(
      Object.fromEntries(
        workspace.tabs.map((tab) => [
          tab.id,
          {
            mode: 'full',
            selectedSubTabIds: tab.subTabs.map((subTab) => subTab.id),
            cachedPartialSubTabIds: null,
            partialDirection: null,
          } satisfies StageManagerParentSelection,
        ]),
      ),
    )
  }

  const deselectAllStageManagerItems = () => {
    setStageManagerSelections(createStageManagerSelectionState(workspace.tabs))
  }

  const cycleStageManagerParentSelection = (tab: Tab) => {
    updateStageManagerSelectionForTab(tab, (selection) => {
      const allSubTabIds = tab.subTabs.map((subTab) => subTab.id)
      const cachedPartial = selection.mode === 'partial' ? selection.selectedSubTabIds : selection.cachedPartialSubTabIds

      if (selection.mode === 'none') {
        if (cachedPartial && cachedPartial.length > 0) {
          return {
            mode: 'partial',
            selectedSubTabIds: cachedPartial,
            cachedPartialSubTabIds: cachedPartial,
            partialDirection: 'toward-all',
          }
        }

        return {
          mode: 'full',
          selectedSubTabIds: allSubTabIds,
          cachedPartialSubTabIds: null,
          partialDirection: null,
        }
      }

      if (selection.mode === 'full') {
        if (cachedPartial && cachedPartial.length > 0) {
          return {
            mode: 'partial',
            selectedSubTabIds: cachedPartial,
            cachedPartialSubTabIds: cachedPartial,
            partialDirection: 'toward-none',
          }
        }

        return createEmptyStageManagerParentSelection()
      }

      if (selection.partialDirection === 'toward-none') {
        return {
          mode: 'none',
          selectedSubTabIds: [],
          cachedPartialSubTabIds: selection.selectedSubTabIds,
          partialDirection: null,
        }
      }

      return {
        mode: 'full',
        selectedSubTabIds: allSubTabIds,
        cachedPartialSubTabIds: selection.selectedSubTabIds,
        partialDirection: null,
      }
    })
  }

  const toggleStageManagerSubTabSelection = (tab: Tab, subTabId: string) => {
    updateStageManagerSelectionForTab(tab, (selection) => {
      const allSubTabIds = tab.subTabs.map((subTab) => subTab.id)
      const selectedIds = new Set(selection.mode === 'full' ? allSubTabIds : selection.selectedSubTabIds)
      const wasSelected = selectedIds.has(subTabId)
      const selectionBeforeChange = Array.from(selectedIds)

      if (wasSelected) {
        selectedIds.delete(subTabId)
      } else {
        selectedIds.add(subTabId)
      }

      const orderedSelectedIds = orderStageManagerSubTabIds(tab, Array.from(selectedIds))

      if (orderedSelectedIds.length === 0) {
        return {
          mode: 'none',
          selectedSubTabIds: [],
          cachedPartialSubTabIds:
            selectionBeforeChange.length > 0 ? orderStageManagerSubTabIds(tab, selectionBeforeChange) : selection.cachedPartialSubTabIds,
          partialDirection: null,
        }
      }

      if (orderedSelectedIds.length >= allSubTabIds.length) {
        return {
          mode: 'full',
          selectedSubTabIds: allSubTabIds,
          cachedPartialSubTabIds:
            selectionBeforeChange.length > 0 && selectionBeforeChange.length < allSubTabIds.length
              ? orderStageManagerSubTabIds(tab, selectionBeforeChange)
              : selection.cachedPartialSubTabIds,
          partialDirection: null,
        }
      }

      return {
        mode: 'partial',
        selectedSubTabIds: orderedSelectedIds,
        cachedPartialSubTabIds: orderedSelectedIds,
        partialDirection: wasSelected ? 'toward-none' : 'toward-all',
      }
    })
  }

  const getStageManagerActionValidation = (
    action: StageManagerAction,
    snapshot: StageManagerSelectionSnapshot = buildStageManagerSelectionSnapshot(workspace.tabs, stageManagerSelections),
  ) => {
    if (!snapshot.hasSelection) {
      return {
        valid: false,
        message: 'select at least one parent or sub-tab before choosing an action.',
      }
    }

    if (action === 'promote' && snapshot.fullParents.length > 1) {
      return {
        valid: false,
        message: 'multiple parent tabs cannot be promoted at the same time.',
      }
    }

    if (action === 'demote' && snapshot.fullParents.length === 0) {
      return {
        valid: false,
        message: 'demote requires at least one fully selected parent tab.',
      }
    }

    return {
      valid: true,
      message: '',
    }
  }

  const selectStageManagerAction = (action: StageManagerAction) => {
    const snapshot = buildStageManagerSelectionSnapshot(workspace.tabs, stageManagerSelections)
    const validation = getStageManagerActionValidation(action, snapshot)
    if (!validation.valid) {
      setStageManagerAction(null)
      pushToast(validation.message, 'warning')
      return
    }

    setStageManagerAction(action)

    if (action === 'promote' && snapshot.fullParents.length === 1 && stageManagerDraft.newSpaceName.trim().length === 0) {
      updateStageManagerDraft({ newSpaceName: snapshot.fullParents[0].title })
    }
  }

  const clearArrangePressTimer = () => {
    if (arrangePressTimerRef.current !== null) {
      window.clearTimeout(arrangePressTimerRef.current)
      arrangePressTimerRef.current = null
    }
  }

  const clearArrangeTapCandidate = () => {
    arrangeTapCandidateRef.current = null
  }

  const clearArrangeDragSeed = () => {
    arrangeDragSeedRef.current = null
  }

  const startArrangeDragSeed = (key: string, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    arrangeDragSeedRef.current = {
      key,
      startX: event.clientX,
      startY: event.clientY,
    }
  }

  const startArrangeTapCandidate = (candidate: ArrangeTapCandidateSeed, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!arrangeMode.active || event.button !== 0) return
    arrangeTapCandidateRef.current = {
      ...candidate,
      startX: event.clientX,
      startY: event.clientY,
      dragged: false,
    }
  }

  const markArrangeTapDragged = (key: string) => {
    const candidate = arrangeTapCandidateRef.current
    if (!candidate || candidate.key !== key) return
    arrangeTapCandidateRef.current = {
      ...candidate,
      dragged: true,
    }
  }

  const finalizeArrangeTapCandidate = (
    key: string,
    event: ReactPointerEvent<HTMLButtonElement>,
    onActivate: () => void,
  ) => {
    if (!arrangeMode.active) return
    const candidate = arrangeTapCandidateRef.current
    arrangeTapCandidateRef.current = null
    if (!candidate || candidate.key !== key || candidate.dragged) return
    const deltaX = event.clientX - candidate.startX
    const deltaY = event.clientY - candidate.startY
    if (Math.hypot(deltaX, deltaY) > ARRANGE_TAP_SLOP_PX) return
    if (consumeArrangeClickSuppression(key)) return
    onActivate()
  }

  const markArrangeClickSuppressed = (...keys: string[]) => {
    keys.forEach((key) => suppressArrangeClickRef.current.add(key))
  }

  const consumeArrangeClickSuppression = (key: string) => {
    if (!suppressArrangeClickRef.current.has(key)) return false
    suppressArrangeClickRef.current.delete(key)
    return true
  }

  const exitAisleDeleteMode = () => {
    setAisleDeleteMode(false)
    setAisleDeleteConfirmation(null)
  }

  const enterArrangeMode = (source: ArrangeSource, dragItem: ArrangeDragItem | null = null, suppressClickKey?: string) => {
    flushPendingContent()
    clearArrangePressTimer()
    clearArrangeDragSeed()
    setMenuOpen(false)
    setContextMenu(null)
    setEditing(null)
    exitAisleDeleteMode()
    if (suppressClickKey) {
      markArrangeClickSuppressed(suppressClickKey)
    }
    const scope: ArrangeScope | null = viewMode === 'spaces' ? 'spaces' : viewMode === 'main' ? 'tabs' : null
    setArrangeMode({
      active: true,
      scope,
      source,
      dragItem,
      overParentTabId: null,
      overParentInsert: null,
      overSubTabId: null,
      overSubTabInsert: null,
      overSpaceId: null,
      overSpaceInsert: null,
    })
  }

  const exitArrangeMode = () => {
    clearArrangePressTimer()
    clearArrangeTapCandidate()
    clearArrangeDragSeed()
    suppressArrangeClickRef.current.clear()
    spaceArrangeDragRef.current = null
    tabArrangeDragRef.current = null
    suppressNextSpaceArrangeExitRef.current = false
    setArrangeDraggingItem(null)
    setSpaceArrangeDragPreview(null)
    setTabArrangeDragPreview(null)
    setArrangeMode(DEFAULT_ARRANGE_MODE)
  }

  const startArrangePress = (
    event: ReactPointerEvent<HTMLButtonElement>,
    dragItem: ArrangeDragItem | null,
    suppressClickKey: string,
  ) => {
    if ((viewMode !== 'main' && viewMode !== 'spaces') || editing || arrangeMode.active) return
    if (event.button !== 0) return
    clearArrangePressTimer()
    arrangePressTimerRef.current = window.setTimeout(() => {
      arrangePressTimerRef.current = null
      enterArrangeMode('press', dragItem, suppressClickKey)
    }, ARRANGE_PRESS_DELAY_MS)
  }

  const buildArrangeDragItemFromContextMenu = (): ArrangeDragItem | null => {
    if (!contextMenu) return null
    if (contextMenu.type === 'tab') {
      return { type: 'tab', tabId: contextMenu.tabId }
    }
    if (contextMenu.type === 'subtab') {
      return {
        type: 'subtab',
        parentTabId: contextMenu.tabId,
        subTabId: contextMenu.subTabId,
      }
    }
    if (contextMenu.type === 'space') {
      return { type: 'space', spaceId: contextMenu.spaceId }
    }
    return null
  }

  const enterArrangeModeFromContext = () => {
    const dragItem = buildArrangeDragItemFromContextMenu()
    if (!dragItem) return
    enterArrangeMode('context', dragItem)
  }

  const prepareArrangeModeForDrag = (dragItem: ArrangeDragItem) => {
    flushPendingContent()
    clearArrangePressTimer()
    clearArrangeTapCandidate()
    clearArrangeDragSeed()
    setMenuOpen(false)
    setContextMenu(null)
    setEditing(null)
    setArrangeDraggingItem(dragItem)
    const scope: ArrangeScope = dragItem.type === 'space' ? 'spaces' : 'tabs'
    setArrangeMode({
      active: true,
      scope,
      source: 'press',
      dragItem,
      overParentTabId: dragItem.type === 'tab' ? dragItem.tabId : null,
      overParentInsert: dragItem.type === 'tab' ? 'after' : null,
      overSubTabId: dragItem.type === 'subtab' ? dragItem.subTabId : null,
      overSubTabInsert: dragItem.type === 'subtab' ? 'after' : null,
      overSpaceId: dragItem.type === 'space' ? dragItem.spaceId : null,
      overSpaceInsert: dragItem.type === 'space' ? 'after' : null,
    })
  }

  const getArrangeSpaceInsertionTargetFromPoint = (clientX: number, clientY: number) => {
    const grid = spacesGridRef.current
    if (!grid) return null
    return getArrangeRailInsertionTarget(
      grid,
      '[data-arrange-space-id]',
      'data-arrange-space-id',
      clientX,
      clientY,
    )
  }

  const clearArrangeSpaceDropTarget = () => {
    setArrangeMode((previous) =>
      previous.active
        ? {
            ...previous,
            overSpaceId: null,
            overSpaceInsert: null,
          }
        : previous,
    )
  }

  const updateArrangeSpaceDropTarget = (clientX: number, clientY: number) => {
    const insertionTarget = getArrangeSpaceInsertionTargetFromPoint(clientX, clientY)
    if (!insertionTarget) {
      clearArrangeSpaceDropTarget()
      return null
    }

    setArrangeMode((previous) =>
      previous.overSpaceId === insertionTarget.targetId && previous.overSpaceInsert === insertionTarget.position
        ? previous
        : {
            ...previous,
            overParentTabId: null,
            overParentInsert: null,
            overSubTabId: null,
            overSubTabInsert: null,
            overSpaceId: insertionTarget.targetId,
            overSpaceInsert: insertionTarget.position,
          },
    )
    return insertionTarget
  }

  const clearArrangeSpacePointerDrag = () => {
    spaceArrangeDragRef.current = null
    setSpaceArrangeDragPreview(null)
  }

  const suppressNextSpaceArrangeExitClick = () => {
    suppressNextSpaceArrangeExitRef.current = true
    window.setTimeout(() => {
      suppressNextSpaceArrangeExitRef.current = false
    }, 0)
  }

  const startArrangeSpacePointerDrag = (event: ReactPointerEvent<HTMLButtonElement>, space: Space) => {
    if (viewMode !== 'spaces') return
    const rect = event.currentTarget.getBoundingClientRect()
    const nextDrag: SpaceArrangeDragPreview = {
      spaceId: space.id,
      label: space.name,
      currentX: event.clientX,
      currentY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    }

    clearArrangePressTimer()
    markArrangeTapDragged(`space:${space.id}`)
    prepareArrangeModeForDrag({ type: 'space', spaceId: space.id })
    spaceArrangeDragRef.current = nextDrag
    setSpaceArrangeDragPreview(nextDrag)
    updateArrangeSpaceDropTarget(event.clientX, event.clientY)
  }

  const updateArrangeSpacePointerDrag = (clientX: number, clientY: number) => {
    const drag = spaceArrangeDragRef.current
    if (!drag) return
    const nextDrag: SpaceArrangeDragPreview = {
      ...drag,
      currentX: clientX,
      currentY: clientY,
    }
    spaceArrangeDragRef.current = nextDrag
    setSpaceArrangeDragPreview(nextDrag)
    updateArrangeSpaceDropTarget(clientX, clientY)
  }

  const moveArrangeSpaceToTarget = (
    draggedSpaceId: string,
    insertionTarget: { targetId: string; position: ArrangeInsertPosition },
  ) => {
    if (draggedSpaceId === insertionTarget.targetId) return
    setState((previous) =>
      moveSpaceWithinActiveDomain(previous, draggedSpaceId, insertionTarget.targetId, insertionTarget.position),
    )
  }

  const finishArrangeSpacePointerDrag = (clientX: number, clientY: number) => {
    const drag = spaceArrangeDragRef.current
    if (!drag) return false

    const insertionTarget = getArrangeSpaceInsertionTargetFromPoint(clientX, clientY)
    markArrangeClickSuppressed(`space:${drag.spaceId}`)
    if (insertionTarget) {
      markArrangeClickSuppressed(`space:${insertionTarget.targetId}`)
      moveArrangeSpaceToTarget(drag.spaceId, insertionTarget)
    }

    suppressNextSpaceArrangeExitClick()
    clearArrangeSpacePointerDrag()
    clearArrangeTapCandidate()
    clearArrangeDragSeed()
    setArrangeDraggingItem(null)
    setArrangeMode((previous) =>
      previous.active
        ? {
            ...previous,
            dragItem: null,
            overParentTabId: null,
            overParentInsert: null,
            overSubTabId: null,
            overSubTabInsert: null,
            overSpaceId: null,
            overSpaceInsert: null,
          }
        : previous,
    )
    return true
  }

  const cancelArrangeSpacePointerDrag = () => {
    clearArrangeSpacePointerDrag()
    clearArrangeTapCandidate()
    clearArrangeDragSeed()
    clearArrangePressTimer()
    setArrangeDraggingItem(null)
    setArrangeMode((previous) =>
      previous.active
        ? {
            ...previous,
            dragItem: null,
            overSpaceId: null,
            overSpaceInsert: null,
          }
        : previous,
    )
  }

  const handleArrangeSpacePointerMove = (event: ReactPointerEvent<HTMLButtonElement>, space: Space) => {
    if (event.buttons !== 1) return

    const activeDrag = spaceArrangeDragRef.current
    if (activeDrag?.spaceId === space.id) {
      event.preventDefault()
      markArrangeTapDragged(`space:${space.id}`)
      updateArrangeSpacePointerDrag(event.clientX, event.clientY)
      return
    }

    const seed = arrangeDragSeedRef.current
    if (!seed || seed.key !== `space:${space.id}`) return
    const deltaX = event.clientX - seed.startX
    const deltaY = event.clientY - seed.startY
    if (Math.hypot(deltaX, deltaY) < ARRANGE_DRAG_START_SLOP_PX) return

    event.preventDefault()
    startArrangeSpacePointerDrag(event, space)
  }

  const handleArrangeSpacePointerUp = (event: ReactPointerEvent<HTMLButtonElement>, spaceId: string) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    if (finishArrangeSpacePointerDrag(event.clientX, event.clientY)) {
      event.preventDefault()
      event.stopPropagation()
      return
    }

    clearArrangeDragSeed()
    if (arrangeMode.active && arrangeMode.scope === 'spaces') {
      finalizeArrangeTapCandidate(`space:${spaceId}`, event, exitArrangeMode)
      return
    }
    clearArrangePressTimer()
  }

  const getArrangeParentInsertionTargetFromPoint = (clientX: number, clientY: number) => {
    const rail = primaryTabRailRef.current
    if (!rail || !isPointInsideElement(rail, clientX, clientY, 14)) return null
    return getArrangeRailInsertionTarget(rail, '[data-arrange-tab-id]', 'data-arrange-tab-id', clientX, clientY)
  }

  const getArrangeSubTabInsertionTargetFromPoint = (clientX: number, clientY: number) => {
    const rail = subTabRailRef.current
    if (!rail || !isPointInsideElement(rail, clientX, clientY, 14)) return null
    return getArrangeRailInsertionTarget(rail, '[data-arrange-subtab-id]', 'data-arrange-subtab-id', clientX, clientY)
  }

  const clearArrangeTabDropTarget = () => {
    setArrangeMode((previous) =>
      previous.active
        ? {
            ...previous,
            overParentTabId: null,
            overParentInsert: null,
            overSubTabId: null,
            overSubTabInsert: null,
          }
        : previous,
    )
  }

  const updateArrangeTabDropTarget = (item: TabArrangeDragItem, clientX: number, clientY: number) => {
    if (item.type === 'tab') {
      const parentTarget = getArrangeParentInsertionTargetFromPoint(clientX, clientY)
      if (!parentTarget) {
        clearArrangeTabDropTarget()
        return null
      }

      setArrangeMode((previous) =>
        previous.overParentTabId === parentTarget.targetId && previous.overParentInsert === parentTarget.position
          ? previous
          : {
              ...previous,
              overParentTabId: parentTarget.targetId,
              overParentInsert: parentTarget.position,
              overSubTabId: null,
              overSubTabInsert: null,
            },
      )
      return { type: 'parent' as const, target: parentTarget }
    }

    if (item.type === 'subtab') {
      const parentTarget = getArrangeParentInsertionTargetFromPoint(clientX, clientY)
      if (parentTarget) {
        setArrangeMode((previous) =>
          previous.overParentTabId === parentTarget.targetId &&
          previous.overParentInsert === null &&
          previous.overSubTabId === null &&
          previous.overSubTabInsert === null
            ? previous
            : {
                ...previous,
                overParentTabId: parentTarget.targetId,
                overParentInsert: null,
                overSubTabId: null,
                overSubTabInsert: null,
              },
        )
        return { type: 'parent' as const, target: parentTarget }
      }

      const subTabTarget = getArrangeSubTabInsertionTargetFromPoint(clientX, clientY)
      if (subTabTarget && item.parentTabId === activeTab.id) {
        setArrangeMode((previous) =>
          previous.overSubTabId === subTabTarget.targetId && previous.overSubTabInsert === subTabTarget.position
            ? previous
            : {
                ...previous,
                overParentTabId: null,
                overParentInsert: null,
                overSubTabId: subTabTarget.targetId,
                overSubTabInsert: subTabTarget.position,
              },
        )
        return { type: 'subtab' as const, target: subTabTarget }
      }
    }

    clearArrangeTabDropTarget()
    return null
  }

  const clearArrangeTabPointerDrag = () => {
    tabArrangeDragRef.current = null
    setTabArrangeDragPreview(null)
  }

  const startArrangeTabPointerDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    item: TabArrangeDragItem,
    label: string,
    variant: TabArrangeDragPreview['variant'],
  ) => {
    if (viewMode !== 'main') return
    const rect = event.currentTarget.getBoundingClientRect()
    const nextDrag: TabArrangeDragPreview = {
      item,
      label,
      variant,
      currentX: event.clientX,
      currentY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    }

    clearArrangePressTimer()
    markArrangeTapDragged(item.type === 'tab' ? `tab:${item.tabId}` : `subtab:${item.subTabId}`)
    prepareArrangeModeForDrag(item)
    tabArrangeDragRef.current = nextDrag
    setTabArrangeDragPreview(nextDrag)
    updateArrangeTabDropTarget(item, event.clientX, event.clientY)
  }

  const updateArrangeTabPointerDrag = (clientX: number, clientY: number) => {
    const drag = tabArrangeDragRef.current
    if (!drag) return
    const nextDrag: TabArrangeDragPreview = {
      ...drag,
      currentX: clientX,
      currentY: clientY,
    }
    tabArrangeDragRef.current = nextDrag
    setTabArrangeDragPreview(nextDrag)
    updateArrangeTabDropTarget(drag.item, clientX, clientY)
  }

  const moveArrangeParentTabToTarget = (
    draggedTabId: string,
    insertionTarget: { targetId: string; position: ArrangeInsertPosition },
  ) => {
    if (draggedTabId === insertionTarget.targetId) return
    updateActiveSpaceData((data) => {
      const fromIndex = data.tabs.findIndex((tab) => tab.id === draggedTabId)
      const toIndex = data.tabs.findIndex((tab) => tab.id === insertionTarget.targetId)
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return data
      return {
        ...data,
        tabs: moveItemByInsertion(data.tabs, fromIndex, toIndex, insertionTarget.position),
      }
    })
  }

  const moveArrangeSubTabToParent = (sourceParentTabId: string, subTabId: string, targetParentTabId: string) => {
    if (sourceParentTabId === targetParentTabId) return
    updateActiveSpaceData((data) => {
      const sourceParent = data.tabs.find((tab) => tab.id === sourceParentTabId)
      const targetParent = data.tabs.find((tab) => tab.id === targetParentTabId)
      if (!sourceParent || !targetParent) return data
      const movedSubTab = sourceParent.subTabs.find((subTab) => subTab.id === subTabId)
      if (!movedSubTab || targetParent.subTabs.some((subTab) => subTab.id === subTabId)) return data

      return {
        ...data,
        tabs: data.tabs.map((tab) => {
          if (tab.id === sourceParentTabId) {
            return {
              ...tab,
              activeSubTabId: tab.activeSubTabId === subTabId ? null : tab.activeSubTabId,
              subTabs: tab.subTabs.filter((subTab) => subTab.id !== subTabId),
            }
          }
          if (tab.id === targetParentTabId) {
            return {
              ...tab,
              subTabs: [...tab.subTabs, movedSubTab],
            }
          }
          return tab
        }),
      }
    })
  }

  const moveArrangeSubTabToTarget = (
    parentTabId: string,
    subTabId: string,
    insertionTarget: { targetId: string; position: ArrangeInsertPosition },
  ) => {
    if (subTabId === insertionTarget.targetId) return
    updateActiveSpaceData((data) => ({
      ...data,
      tabs: data.tabs.map((tab) => {
        if (tab.id !== parentTabId) return tab
        const fromIndex = tab.subTabs.findIndex((subTab) => subTab.id === subTabId)
        const toIndex = tab.subTabs.findIndex((subTab) => subTab.id === insertionTarget.targetId)
        if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return tab
        return {
          ...tab,
          subTabs: moveItemByInsertion(tab.subTabs, fromIndex, toIndex, insertionTarget.position),
        }
      }),
    }))
  }

  const finishArrangeTabPointerDrag = (clientX: number, clientY: number) => {
    const drag = tabArrangeDragRef.current
    if (!drag) return false

    const { item } = drag
    if (item.type === 'tab') {
      const parentTarget = getArrangeParentInsertionTargetFromPoint(clientX, clientY)
      markArrangeClickSuppressed(`tab:${item.tabId}`)
      if (parentTarget) {
        markArrangeClickSuppressed(`tab:${parentTarget.targetId}`)
        moveArrangeParentTabToTarget(item.tabId, parentTarget)
      }
    } else if (item.type === 'subtab') {
      const parentTarget = getArrangeParentInsertionTargetFromPoint(clientX, clientY)
      markArrangeClickSuppressed(`subtab:${item.subTabId}`)
      if (parentTarget) {
        markArrangeClickSuppressed(`tab:${parentTarget.targetId}`)
        moveArrangeSubTabToParent(item.parentTabId, item.subTabId, parentTarget.targetId)
      } else {
        const subTabTarget = getArrangeSubTabInsertionTargetFromPoint(clientX, clientY)
        if (subTabTarget && item.parentTabId === activeTab.id) {
          markArrangeClickSuppressed(`subtab:${subTabTarget.targetId}`)
          moveArrangeSubTabToTarget(item.parentTabId, item.subTabId, subTabTarget)
        }
      }
    }

    clearArrangeTabPointerDrag()
    clearArrangeTapCandidate()
    clearArrangeDragSeed()
    setArrangeDraggingItem(null)
    setArrangeMode((previous) =>
      previous.active
        ? {
            ...previous,
            dragItem: null,
            overParentTabId: null,
            overParentInsert: null,
            overSubTabId: null,
            overSubTabInsert: null,
            overSpaceId: null,
            overSpaceInsert: null,
          }
        : previous,
    )
    return true
  }

  const cancelArrangeTabPointerDrag = () => {
    clearArrangeTabPointerDrag()
    clearArrangeTapCandidate()
    clearArrangeDragSeed()
    clearArrangePressTimer()
    setArrangeDraggingItem(null)
    setArrangeMode((previous) =>
      previous.active
        ? {
            ...previous,
            dragItem: null,
            overParentTabId: null,
            overParentInsert: null,
            overSubTabId: null,
            overSubTabInsert: null,
          }
        : previous,
    )
  }

  const handleArrangeTabPointerMove = (
    event: ReactPointerEvent<HTMLButtonElement>,
    item: TabArrangeDragItem,
    label: string,
    variant: TabArrangeDragPreview['variant'],
  ) => {
    if (event.buttons !== 1) return

    const activeDrag = tabArrangeDragRef.current
    if (activeDrag) {
      event.preventDefault()
      const key = activeDrag.item.type === 'tab' ? `tab:${activeDrag.item.tabId}` : `subtab:${activeDrag.item.subTabId}`
      markArrangeTapDragged(key)
      updateArrangeTabPointerDrag(event.clientX, event.clientY)
      return
    }

    const key = item.type === 'tab' ? `tab:${item.tabId}` : `subtab:${item.subTabId}`
    const seed = arrangeDragSeedRef.current
    if (!seed || seed.key !== key) return
    const deltaX = event.clientX - seed.startX
    const deltaY = event.clientY - seed.startY
    if (Math.hypot(deltaX, deltaY) < ARRANGE_DRAG_START_SLOP_PX) return

    event.preventDefault()
    startArrangeTabPointerDrag(event, item, label, variant)
  }

  const handleArrangeTabPointerUp = (
    event: ReactPointerEvent<HTMLButtonElement>,
    key: string,
    onTapWhileArranging: () => void,
  ) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    if (finishArrangeTabPointerDrag(event.clientX, event.clientY)) {
      event.preventDefault()
      event.stopPropagation()
      return
    }

    clearArrangeDragSeed()
    if (arrangeMode.active) {
      finalizeArrangeTapCandidate(key, event, onTapWhileArranging)
      return
    }
    clearArrangePressTimer()
  }

  useEffect(() => () => clearArrangePressTimer(), [])

  useEffect(() => {
    if (viewMode === 'main') return
    setArrangeMode((previous) => (previous.active ? DEFAULT_ARRANGE_MODE : previous))
  }, [viewMode])

  useEffect(() => {
    if (viewMode === 'stage-manager') return
    setStageManagerStep('select')
    setStageManagerAction(null)
    setStageManagerSelections({})
    setStageManagerDraft(createDefaultStageManagerDraft())
  }, [viewMode])

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

  const stageManagerSelectionSnapshot = useMemo(
    () => buildStageManagerSelectionSnapshot(workspace.tabs, stageManagerSelections),
    [workspace.tabs, stageManagerSelections],
  )
  const stageManagerSelectionCounts = useMemo(
    () => ({
      fullParentCount: stageManagerSelectionSnapshot.fullParents.length,
      partialParentCount: stageManagerSelectionSnapshot.partialParents.length,
      selectedSubTabCount:
        stageManagerSelectionSnapshot.fullParents.reduce((count, tab) => count + tab.subTabs.length, 0) +
        stageManagerSelectionSnapshot.looseSubTabs.length,
      hasSelection: stageManagerSelectionSnapshot.hasSelection,
    }),
    [stageManagerSelectionSnapshot],
  )
  const getDraftDomainId = (draftDomainId: string) =>
    draftDomainId && state.domains.some((domain) => domain.id === draftDomainId) ? draftDomainId : state.activeDomainId
  const getDomainSpaces = (domainId: string) => state.domains.find((domain) => domain.id === domainId)?.spaces ?? []
  const stageManagerPromoteDomainId = getDraftDomainId(stageManagerDraft.promoteDomainId)
  const stageManagerDemoteDomainId = getDraftDomainId(stageManagerDraft.demoteDomainId)
  const stageManagerMigrateDomainId = getDraftDomainId(stageManagerDraft.migrateDomainId)
  const stageManagerMigrateParentDomainId = getDraftDomainId(stageManagerDraft.migrateParentDomainId)
  const stageManagerPromoteDestinationSpaces = getDomainSpaces(stageManagerPromoteDomainId)
  const stageManagerDemoteSpaces = getDomainSpaces(stageManagerDemoteDomainId)
  const stageManagerMigrateParentSpaces = getDomainSpaces(stageManagerMigrateParentDomainId)
  const stageManagerDemoteSpace =
    stageManagerDemoteSpaces.find((space) => space.id === stageManagerDraft.demoteSpaceId) ??
    (stageManagerDemoteDomainId === state.activeDomainId ? activeSpace : stageManagerDemoteSpaces[0]) ??
    null
  const stageManagerOtherSpaces = useMemo(
    () =>
      getDomainSpaces(stageManagerMigrateDomainId).filter(
        (space) => !(stageManagerMigrateDomainId === state.activeDomainId && space.id === activeSpace.id),
      ),
    [activeSpace.id, stageManagerMigrateDomainId, state.activeDomainId, state.domains],
  )
  const stageManagerDemoteParentOptions = useMemo(
    () =>
      (stageManagerDemoteSpace?.data.tabs ?? []).filter(
        (tab) =>
          !(stageManagerDemoteDomainId === state.activeDomainId && stageManagerDemoteSpace?.id === activeSpace.id) ||
          !stageManagerSelectionSnapshot.fullParentIds.has(tab.id),
      ),
    [
      activeSpace.id,
      stageManagerDemoteDomainId,
      stageManagerDemoteSpace,
      stageManagerSelectionSnapshot.fullParentIds,
      state.activeDomainId,
    ],
  )
  const stageManagerSelectedPromoteSpace =
    stageManagerDraft.promoteSpaceMode === 'existing'
      ? stageManagerPromoteDestinationSpaces.find((space) => space.id === stageManagerDraft.promoteSpaceId) ?? null
      : null
  const stageManagerSelectedMigrateSpace =
    stageManagerDraft.migrateSpaceMode === 'existing'
      ? stageManagerOtherSpaces.find((space) => space.id === stageManagerDraft.migrateSpaceId) ?? null
      : null
  const stageManagerSelectedMigrateParentSpace =
    stageManagerDraft.migrateParentSpaceMode === 'current'
      ? activeSpace
      : stageManagerDraft.migrateParentSpaceMode === 'existing'
        ? stageManagerMigrateParentSpaces.find((space) => space.id === stageManagerDraft.migrateParentSpaceId) ?? null
        : null
  const stageManagerMigrateParentOptions = useMemo(() => {
    const destinationSpace = stageManagerSelectedMigrateParentSpace
    if (!destinationSpace) return []
    return destinationSpace.data.tabs.filter(
      (tab) => destinationSpace.id !== activeSpace.id || !stageManagerSelectionSnapshot.fullParentIds.has(tab.id),
    )
  }, [activeSpace.id, stageManagerSelectedMigrateParentSpace, stageManagerSelectionSnapshot.fullParentIds])
  const stageManagerStrayExistingParentOptions = useMemo(() => {
    const destinationSpace = stageManagerSelectedMigrateSpace
    if (!destinationSpace) return []
    return destinationSpace.data.tabs
  }, [stageManagerSelectedMigrateSpace])
  const stageManagerStrayHandlingSelectValue =
    stageManagerDraft.strayHandlingMode === 'selected-parent'
      ? `selected-parent:${stageManagerDraft.straySelectedParentId}`
      : stageManagerDraft.strayHandlingMode

  useEffect(() => {
    if (viewMode !== 'stage-manager') return

    setStageManagerDraft((previous) => {
      let changed = false
      let next = previous

      if (previous.promoteSpaceId && !stageManagerPromoteDestinationSpaces.some((space) => space.id === previous.promoteSpaceId)) {
        next = { ...next, promoteSpaceId: '' }
        changed = true
      }

      if (!previous.promoteDomainId) {
        next = { ...next, promoteDomainId: state.activeDomainId }
        changed = true
      }

      if (!previous.demoteDomainId) {
        next = { ...next, demoteDomainId: state.activeDomainId, demoteSpaceId: activeSpace.id }
        changed = true
      }

      if (previous.demoteSpaceId && !stageManagerDemoteSpaces.some((space) => space.id === previous.demoteSpaceId)) {
        next = { ...next, demoteSpaceId: stageManagerDemoteSpaces[0]?.id ?? '' }
        changed = true
      }

      if (previous.demoteParentId && !stageManagerDemoteParentOptions.some((tab) => tab.id === previous.demoteParentId)) {
        next = { ...next, demoteParentId: '' }
        changed = true
      }

      if (!previous.migrateDomainId) {
        next = { ...next, migrateDomainId: state.activeDomainId }
        changed = true
      }

      if (previous.migrateSpaceId && !stageManagerOtherSpaces.some((space) => space.id === previous.migrateSpaceId)) {
        next = { ...next, migrateSpaceId: '' }
        changed = true
      }

      if (
        previous.migrateParentSpaceId &&
        previous.migrateParentSpaceMode === 'existing' &&
        !stageManagerMigrateParentSpaces.some((space) => space.id === previous.migrateParentSpaceId)
      ) {
        next = { ...next, migrateParentSpaceId: '' }
        changed = true
      }

      if (!previous.migrateParentDomainId) {
        next = { ...next, migrateParentDomainId: state.activeDomainId }
        changed = true
      }

      if (previous.migrateParentId && !stageManagerMigrateParentOptions.some((tab) => tab.id === previous.migrateParentId)) {
        next = { ...next, migrateParentId: '' }
        changed = true
      }

      if (
        previous.straySelectedParentId &&
        !stageManagerSelectionSnapshot.fullParents.some((tab) => tab.id === previous.straySelectedParentId)
      ) {
        next = {
          ...next,
          straySelectedParentId: '',
          strayHandlingMode: previous.strayHandlingMode === 'selected-parent' ? 'promote' : previous.strayHandlingMode,
        }
        changed = true
      }

      if (
        previous.strayExistingParentId &&
        !stageManagerStrayExistingParentOptions.some((tab) => tab.id === previous.strayExistingParentId)
      ) {
        next = { ...next, strayExistingParentId: '' }
        changed = true
      }

      return changed ? next : previous
    })
  }, [
    viewMode,
    stageManagerDemoteParentOptions,
    stageManagerDemoteSpaces,
    stageManagerMigrateParentOptions,
    stageManagerOtherSpaces,
    stageManagerPromoteDestinationSpaces,
    stageManagerMigrateParentSpaces,
    stageManagerSelectionSnapshot.fullParents,
    stageManagerStrayExistingParentOptions,
    state.activeDomainId,
    activeSpace.id,
  ])

  useEffect(() => {
    if (!arrangeMode.active || arrangeMode.scope !== 'tabs' || viewMode !== 'main') return

    setArrangeMode((previous) => {
      if (!previous.active) return previous

      const validParentTabIds = new Set(workspace.tabs.map((tab) => tab.id))
      let nextDragItem = previous.dragItem
      let nextOverParentTabId = previous.overParentTabId
      let nextOverParentInsert = previous.overParentInsert
      let nextOverSubTabId = previous.overSubTabId
      let nextOverSubTabInsert = previous.overSubTabInsert

      if (nextDragItem?.type === 'tab' && !validParentTabIds.has(nextDragItem.tabId)) {
        nextDragItem = null
      }

      const currentDragItem = nextDragItem
      if (currentDragItem?.type === 'subtab') {
        const sourceParent = workspace.tabs.find((tab) => tab.id === currentDragItem.parentTabId)
        if (!sourceParent || !sourceParent.subTabs.some((subTab) => subTab.id === currentDragItem.subTabId)) {
          nextDragItem = null
        }
      }

      if (nextOverParentTabId && !validParentTabIds.has(nextOverParentTabId)) {
        nextOverParentTabId = null
        nextOverParentInsert = null
      }

      if (nextOverSubTabId && !activeTab.subTabs.some((subTab) => subTab.id === nextOverSubTabId)) {
        nextOverSubTabId = null
        nextOverSubTabInsert = null
      }

      if (nextDragItem?.type !== 'tab' && nextOverParentInsert) {
        nextOverParentInsert = null
      }

      if (nextDragItem?.type !== 'subtab' && nextOverSubTabInsert) {
        nextOverSubTabInsert = null
      }

      if (
        nextDragItem === previous.dragItem &&
        nextOverParentTabId === previous.overParentTabId &&
        nextOverParentInsert === previous.overParentInsert &&
        nextOverSubTabId === previous.overSubTabId &&
        nextOverSubTabInsert === previous.overSubTabInsert
      ) {
        return previous
      }

      return {
        ...previous,
        dragItem: nextDragItem,
        overParentTabId: nextOverParentTabId,
        overParentInsert: nextOverParentInsert,
        overSubTabId: nextOverSubTabId,
        overSubTabInsert: nextOverSubTabInsert,
      }
    })
  }, [arrangeMode.active, arrangeMode.scope, viewMode, workspace.tabs, activeTab.subTabs])

  useEffect(() => {
    if (!arrangeMode.active || arrangeMode.scope !== 'spaces' || viewMode !== 'spaces') return

    setArrangeMode((previous) => {
      if (!previous.active || previous.scope !== 'spaces') return previous

      const validSpaceIds = new Set(state.spaces.map((space) => space.id))
      let nextDragItem = previous.dragItem
      let nextOverSpaceId = previous.overSpaceId
      let nextOverSpaceInsert = previous.overSpaceInsert

      if (nextDragItem?.type === 'space' && !validSpaceIds.has(nextDragItem.spaceId)) {
        nextDragItem = null
      }

      if (nextOverSpaceId && !validSpaceIds.has(nextOverSpaceId)) {
        nextOverSpaceId = null
        nextOverSpaceInsert = null
      }

      if (nextDragItem?.type !== 'space' && nextOverSpaceInsert) {
        nextOverSpaceInsert = null
      }

      if (
        nextDragItem === previous.dragItem &&
        nextOverSpaceId === previous.overSpaceId &&
        nextOverSpaceInsert === previous.overSpaceInsert
      ) {
        return previous
      }

      return {
        ...previous,
        dragItem: nextDragItem,
        overSpaceId: nextOverSpaceId,
        overSpaceInsert: nextOverSpaceInsert,
      }
    })
  }, [arrangeMode.active, arrangeMode.scope, viewMode, state.spaces])

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
    normalizeMarkdownForPersistence(mergeLeadingIndentsFromWysiwyg(editor, editor.getMarkdown()))

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

    const normalized = normalizeHeadingMarkers(markdown)
    if (normalized !== markdown) {
      lastEditorMarkdownRef.current = normalized
      lastEditorMarkdownByAisleRef.current.set(aisleId, normalized)
      scheduleContentCommit(
        normalized,
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

  const closeImageTools = () => {
    activeImageRef.current = null
    imageResizeRef.current = null
    resetInlineCropDrag()
    updateInlineCrop({ active: false, relX: 0, relY: 0, relWidth: 1, relHeight: 1, top: 0, left: 0, width: 0, height: 0 })
    setImageTools({ visible: false, cropTop: 0, cropLeft: 0, resizeTop: 0, resizeLeft: 0 })
  }

  const closeImageToolsIfSelectedImageMissing = () => {
    const image = activeImageRef.current
    if (!image) return
    const editorRoot = editorEventRootRef.current
    if (!image.isConnected || (editorRoot && !editorRoot.contains(image))) {
      closeImageTools()
    }
  }

  const refreshImageToolsPosition = () => {
    const image = activeImageRef.current
    if (!image || !image.isConnected) {
      closeImageTools()
      return
    }
    const rect = image.getBoundingClientRect()
    setImageTools({
      visible: true,
      cropTop: Math.max(8, rect.top + 4),
      cropLeft: Math.max(8, rect.left + 4),
      resizeTop: Math.max(8, rect.bottom - 2),
      resizeLeft: Math.max(8, rect.right - 2),
    })

    updateInlineCrop((previous) => {
      if (!previous.active) return previous
      const width = Math.max(24, previous.relWidth * rect.width)
      const height = Math.max(24, previous.relHeight * rect.height)
      const x = Math.max(0, Math.min(rect.width - width, previous.relX * rect.width))
      const y = Math.max(0, Math.min(rect.height - height, previous.relY * rect.height))
      return {
        ...previous,
        relX: rect.width > 0 ? x / rect.width : 0,
        relY: rect.height > 0 ? y / rect.height : 0,
        relWidth: rect.width > 0 ? width / rect.width : previous.relWidth,
        relHeight: rect.height > 0 ? height / rect.height : previous.relHeight,
        top: rect.top + y,
        left: rect.left + x,
        width,
        height,
      }
    })
  }

  const selectImageForTools = (image: HTMLImageElement) => {
    activeImageRef.current = image
    activateEditorFromEventTarget(image)
    editorRef.current?.focus()
    refreshImageToolsPosition()
  }

  const buildClipboardImagePayload = async (image: HTMLImageElement) => {
    if (!image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error('image load failed'))
      })
    }

    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height
    if (width <= 0 || height <= 0) return null

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return null

    context.drawImage(image, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((nextBlob) => resolve(nextBlob), 'image/png')
    })
    if (!blob) return null

    return {
      blob,
      dataUrl: canvas.toDataURL('image/png'),
    }
  }

  const copySelectedImageToClipboard = async () => {
    const image = activeImageRef.current
    if (!image) {
      pushToast('no image selected to copy.', 'warning')
      return false
    }

    try {
      const payload = await buildClipboardImagePayload(image)
      if (!payload) throw new Error('clipboard image payload failed')

      if (window.electronAPI?.copyImageDataUrl) {
        const result = await window.electronAPI.copyImageDataUrl(payload.dataUrl)
        if (!result?.ok) {
          throw new Error(result?.error ?? 'clipboard write failed')
        }
      } else if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ [payload.blob.type]: payload.blob })])
      } else {
        throw new Error('clipboard image write unsupported')
      }

      pushToast('image copied.', 'success')
      return true
    } catch {
      pushToast('could not copy image.', 'warning')
      return false
    }
  }

  const findImageNodeHitForElement = (view: any, image: HTMLImageElement): { node: any; pos: number } | null => {
    if (!view?.dom?.contains(image)) return null
    const docSize = view.state.doc.content.size
    const clampPos = (pos: number) => Math.max(0, Math.min(docSize, pos))
    const inspectPos = (rawPos: number) => {
      const pos = clampPos(rawPos)
      const nodeAt = view.state.doc.nodeAt(pos)
      if (nodeAt?.type?.name === 'image') return { node: nodeAt, pos }

      const resolved = view.state.doc.resolve(pos)
      if (resolved.nodeAfter?.type?.name === 'image') return { node: resolved.nodeAfter, pos }
      if (resolved.nodeBefore?.type?.name === 'image') {
        return { node: resolved.nodeBefore, pos: Math.max(0, pos - resolved.nodeBefore.nodeSize) }
      }
      return null
    }

    try {
      const domPos = view.posAtDOM(image, 0)
      for (const candidatePos of [domPos, domPos - 1, domPos + 1]) {
        const hit = inspectPos(candidatePos)
        if (hit) return hit
      }
    } catch {
      // Fall back to matching below.
    }

    const imageUrl = image.getAttribute('src') ?? ''
    const altText = image.getAttribute('alt') ?? ''
    let fallback: { node: any; pos: number } | null = null
    view.state.doc.descendants((node: any, pos: number) => {
      if (fallback || node?.type?.name !== 'image') return
      const attrs = node.attrs ?? {}
      if ((attrs.imageUrl ?? '') === imageUrl && (attrs.altText ?? '') === altText) {
        fallback = { node, pos }
      }
    })
    return fallback
  }

  const updateActiveEditorImageNode = (image: HTMLImageElement, attrs: { imageUrl?: string; altText?: string | null }) => {
    activateEditorFromEventTarget(image)
    const currentEditor = editorRef.current
    const view = getWysiwygView(currentEditor)
    if (!currentEditor || !view) return false

    const hit = findImageNodeHitForElement(view, image)
    if (!hit) return false

    view.dispatch(
      view.state.tr
        .setNodeMarkup(hit.pos, null, {
          ...(hit.node.attrs ?? {}),
          ...attrs,
        })
        .scrollIntoView(),
    )
    commitActiveEditorMarkdownNow(currentEditor)
    return true
  }

  const deleteActiveEditorImageNode = () => {
    const image = activeImageRef.current
    if (!image || !image.isConnected) return false
    activateEditorFromEventTarget(image)
    const currentEditor = editorRef.current
    const view = getWysiwygView(currentEditor)
    if (!currentEditor || !view) return false

    const hit = findImageNodeHitForElement(view, image)
    if (!hit) return false

    view.dispatch(view.state.tr.delete(hit.pos, hit.pos + hit.node.nodeSize).scrollIntoView())
    commitActiveEditorMarkdownNow(currentEditor)
    closeImageTools()
    return true
  }

  const renderImageToDataUrl = async (image: HTMLImageElement, width: number, height: number) => {
    const sourceImage = new Image()
    sourceImage.src = image.src
    await new Promise<void>((resolve, reject) => {
      sourceImage.onload = () => resolve()
      sourceImage.onerror = () => reject(new Error('image load failed'))
    })

    const outputWidth = Math.max(8, Math.round(width))
    const outputHeight = Math.max(8, Math.round(height))
    const canvas = document.createElement('canvas')
    canvas.width = outputWidth
    canvas.height = outputHeight
    const context = canvas.getContext('2d')
    if (!context) return null

    context.drawImage(sourceImage, 0, 0, outputWidth, outputHeight)
    return canvas.toDataURL('image/png')
  }

  const commitResizedActiveImageToEditor = async () => {
    const image = activeImageRef.current
    if (!image || !image.isConnected) {
      commitCurrentEditorContent()
      return
    }

    const rect = image.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) {
      commitCurrentEditorContent()
      return
    }

    try {
      const nextDataUrl = await renderImageToDataUrl(image, rect.width, rect.height)
      if (!nextDataUrl) {
        commitCurrentEditorContent()
        return
      }
      if (!updateActiveEditorImageNode(image, { imageUrl: nextDataUrl, altText: image.alt || null })) {
        image.src = nextDataUrl
        commitCurrentEditorContent()
      }
      refreshImageToolsPosition()
    } catch {
      commitCurrentEditorContent()
    }
  }

  const beginImageResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (inlineCrop.active) return
    const image = activeImageRef.current
    if (!image || !image.isConnected) return
    imageResizeRef.current = {
      startX: event.clientX,
      startWidth: image.getBoundingClientRect().width || image.width || image.naturalWidth || 160,
    }
  }

  const continueImageResize = (clientX: number) => {
    const image = activeImageRef.current
    const resize = imageResizeRef.current
    if (!image || !resize) return
    const nextWidth = Math.max(80, Math.round(resize.startWidth + (clientX - resize.startX)))
    image.style.width = `${nextWidth}px`
    image.style.maxWidth = '100%'
    image.style.height = 'auto'
    image.setAttribute('width', String(nextWidth))
    refreshImageToolsPosition()
  }

  const startInlineCrop = () => {
    const image = activeImageRef.current
    if (!image || !image.isConnected) return
    const rect = image.getBoundingClientRect()
    const width = Math.max(24, rect.width * 0.8)
    const height = Math.max(24, rect.height * 0.8)
    const left = rect.left + (rect.width - width) / 2
    const top = rect.top + (rect.height - height) / 2
    const nextInlineCrop = {
      active: true,
      relX: rect.width > 0 ? (left - rect.left) / rect.width : 0,
      relY: rect.height > 0 ? (top - rect.top) / rect.height : 0,
      relWidth: rect.width > 0 ? width / rect.width : 0.8,
      relHeight: rect.height > 0 ? height / rect.height : 0.8,
      top,
      left,
      width,
      height,
    }
    updateInlineCrop(nextInlineCrop)
  }

  const cancelInlineCrop = () => {
    resetInlineCropDrag()
    updateInlineCrop((previous) => ({ ...previous, active: false, top: 0, left: 0, width: 0, height: 0 }))
  }

  const applyInlineCrop = async () => {
    const image = activeImageRef.current
    const crop = inlineCropRef.current
    if (!image || !crop.active || !image.src) return

    const sourceImage = new Image()
    sourceImage.src = image.src
    await new Promise<void>((resolve, reject) => {
      sourceImage.onload = () => resolve()
      sourceImage.onerror = () => reject(new Error('image load failed'))
    })

    const naturalWidth = sourceImage.naturalWidth
    const naturalHeight = sourceImage.naturalHeight
    if (naturalWidth <= 0 || naturalHeight <= 0) return

    const rect = image.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return

    const widthPx = crop.width
    const heightPx = crop.height
    const xPx = crop.left - rect.left
    const yPx = crop.top - rect.top

    const sourceLeft = Math.max(0, Math.min(naturalWidth, (xPx / rect.width) * naturalWidth))
    const sourceTop = Math.max(0, Math.min(naturalHeight, (yPx / rect.height) * naturalHeight))
    const sourceRight = Math.max(sourceLeft, Math.min(naturalWidth, ((xPx + widthPx) / rect.width) * naturalWidth))
    const sourceBottom = Math.max(sourceTop, Math.min(naturalHeight, ((yPx + heightPx) / rect.height) * naturalHeight))
    const sourceX = Math.max(0, Math.min(naturalWidth - 1, Math.floor(sourceLeft)))
    const sourceY = Math.max(0, Math.min(naturalHeight - 1, Math.floor(sourceTop)))
    const sourceEndX = Math.max(sourceX + 1, Math.min(naturalWidth, Math.ceil(sourceRight)))
    const sourceEndY = Math.max(sourceY + 1, Math.min(naturalHeight, Math.ceil(sourceBottom)))
    const sourceWidth = sourceEndX - sourceX
    const sourceHeight = sourceEndY - sourceY
    const renderedWidth = Math.max(8, Math.round(crop.width))
    const renderedHeight = Math.max(8, Math.round(crop.height))
    const outputWidth = sourceWidth
    const outputHeight = sourceHeight

    const canvas = document.createElement('canvas')
    canvas.width = outputWidth
    canvas.height = outputHeight
    const context = canvas.getContext('2d')
    if (!context) return

    context.imageSmoothingEnabled = false
    context.drawImage(sourceImage, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, outputWidth, outputHeight)
    const nextDataUrl = canvas.toDataURL('image/png')

    if (!updateActiveEditorImageNode(image, { imageUrl: nextDataUrl, altText: image.alt || null })) {
      image.src = nextDataUrl
      commitCurrentEditorContent()
    }
    image.style.width = `${renderedWidth}px`
    image.style.height = `${renderedHeight}px`
    image.setAttribute('width', String(renderedWidth))
    image.setAttribute('height', String(renderedHeight))
    image.style.maxWidth = 'none'
    cancelInlineCrop()
    refreshImageToolsPosition()
  }

  const beginInlineCropMouseDrag = (mode: InlineCropDragMode, event: MouseEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    startInlineCropDrag(mode, event.clientX, event.clientY)
  }

  useEffect(() => {
    const stopCropMouseEvent = (event: globalThis.MouseEvent) => {
      if (event.cancelable) {
        event.preventDefault()
      }
      event.stopPropagation()
      event.stopImmediatePropagation()
    }

    const applyInlineCropDrag = (clientX: number, clientY: number) => {
      const drag = inlineCropDragRef.current
      const crop = inlineCropRef.current
      if (!drag.mode || !crop.active) return false

      const image = activeImageRef.current
      if (!image || !image.isConnected) return false
      const rect = image.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return false

      const startX = drag.startRelX * rect.width
      const startY = drag.startRelY * rect.height
      const startWidth = Math.max(24, drag.startRelWidth * rect.width)
      const startHeight = Math.max(24, drag.startRelHeight * rect.height)
      const dx = clientX - drag.startX
      const dy = clientY - drag.startY

      const commitCropPixels = (x: number, y: number, width: number, height: number) => {
        const nextX = Math.max(0, Math.min(rect.width - width, x))
        const nextY = Math.max(0, Math.min(rect.height - height, y))
        const nextWidth = Math.max(24, Math.min(width, rect.width - nextX))
        const nextHeight = Math.max(24, Math.min(height, rect.height - nextY))
        updateInlineCrop((previous) => ({
          ...previous,
          relX: rect.width > 0 ? nextX / rect.width : 0,
          relY: rect.height > 0 ? nextY / rect.height : 0,
          relWidth: rect.width > 0 ? nextWidth / rect.width : previous.relWidth,
          relHeight: rect.height > 0 ? nextHeight / rect.height : previous.relHeight,
          top: rect.top + nextY,
          left: rect.left + nextX,
          width: nextWidth,
          height: nextHeight,
        }))
      }

      if (drag.mode === 'move') {
        const nextX = Math.max(0, Math.min(rect.width - startWidth, startX + dx))
        const nextY = Math.max(0, Math.min(rect.height - startHeight, startY + dy))
        commitCropPixels(nextX, nextY, startWidth, startHeight)
        return true
      }

      if (drag.mode === 'resize-e') {
        commitCropPixels(startX, startY, startWidth + dx, startHeight)
        return true
      }

      if (drag.mode === 'resize-s') {
        commitCropPixels(startX, startY, startWidth, startHeight + dy)
        return true
      }

      if (drag.mode === 'resize-se') {
        commitCropPixels(startX, startY, startWidth + dx, startHeight + dy)
        return true
      }

      if (drag.mode === 'resize-w') {
        const nextX = Math.max(0, Math.min(startX + startWidth - 24, startX + dx))
        commitCropPixels(nextX, startY, startWidth + startX - nextX, startHeight)
        return true
      }

      if (drag.mode === 'resize-n') {
        const nextY = Math.max(0, Math.min(startY + startHeight - 24, startY + dy))
        commitCropPixels(startX, nextY, startWidth, startHeight + startY - nextY)
        return true
      }

      return true
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (imageResizeRef.current) {
        continueImageResize(event.clientX)
      }
    }

    const handlePointerUp = () => {
      if (imageResizeRef.current) {
        imageResizeRef.current = null
        void commitResizedActiveImageToEditor()
      }
    }

    const handleMouseMove = (event: globalThis.MouseEvent) => {
      if (applyInlineCropDrag(event.clientX, event.clientY)) {
        stopCropMouseEvent(event)
      }
    }

    const handleMouseUp = (event: globalThis.MouseEvent) => {
      const hadCropDrag = Boolean(inlineCropDragRef.current.mode && inlineCropRef.current.active)
      if (hadCropDrag) {
        stopCropMouseEvent(event)
      }
      resetInlineCropDrag()
    }

    const listenerOptions: AddEventListenerOptions = { capture: true }
    document.addEventListener('pointermove', handlePointerMove, listenerOptions)
    document.addEventListener('pointerup', handlePointerUp, listenerOptions)
    document.addEventListener('pointercancel', handlePointerUp, listenerOptions)
    document.addEventListener('mousemove', handleMouseMove, listenerOptions)
    document.addEventListener('mouseup', handleMouseUp, listenerOptions)
    return () => {
      document.removeEventListener('pointermove', handlePointerMove, listenerOptions)
      document.removeEventListener('pointerup', handlePointerUp, listenerOptions)
      document.removeEventListener('pointercancel', handlePointerUp, listenerOptions)
      document.removeEventListener('mousemove', handleMouseMove, listenerOptions)
      document.removeEventListener('mouseup', handleMouseUp, listenerOptions)
    }
  }, [])

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
          const markdown = normalizeMarkdownForPersistence(
            mergeLeadingIndentsFromWysiwyg(currentEditor, currentEditor.getMarkdown()),
          )
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

          const normalized = normalizeHeadingMarkers(markdown)
          if (normalized !== markdown) {
            lastEditorMarkdownRef.current = normalized
            scheduleContentCommit(
              normalized,
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
        closeImageTools()
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
      closeImageTools()
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

  const openStageManager = () => {
    if (viewMode !== 'main') return
    flushPendingContent()
    setMenuOpen(false)
    setContextMenu(null)
    setEditing(null)
    exitArrangeMode()
    resetStageManagerState()
    setViewMode('stage-manager')
  }

  const endStageManager = () => {
    resetStageManagerState()
    returnToLastTabLikeView()
  }

  const closeSettingsView = () => {
    returnToLastTabLikeView()
  }

  const handleStageManagerParentClick = (tab: Tab) => {
    if (stageManagerStep !== 'select') {
      pushToast('go back to the selection step to change selected items.', 'error')
      return
    }

    if (workspace.activeTabId !== tab.id) {
      selectTab(tab.id)
      return
    }

    cycleStageManagerParentSelection(tab)
  }

  const handleStageManagerSubTabClick = (tab: Tab, subTabId: string) => {
    if (stageManagerStep !== 'select') {
      pushToast('go back to the selection step to change selected items.', 'error')
      return
    }

    toggleStageManagerSubTabSelection(tab, subTabId)
  }

  const handleStageManagerHomeClick = () => {
    if (stageManagerStep !== 'select') {
      pushToast('go back to the selection step to change selected items.', 'error')
      return
    }

    pushToast('home is selected automatically when the parent tab is fully selected.', 'error')
  }

  const getStageManagerConfigureValidation = () => {
    if (!stageManagerAction) {
      return {
        valid: false,
        message: 'choose a director action before continuing.',
      }
    }

    if (stageManagerAction === 'promote') {
      if (stageManagerSelectionSnapshot.fullParents.length === 1) {
        if (!stageManagerDraft.newSpaceName.trim()) {
          return {
            valid: false,
            message: 'name the new space for this promoted parent tab before continuing.',
          }
        }

        return { valid: true, message: '' }
      }

      if (stageManagerDraft.promoteSpaceMode === 'existing') {
        if (!stageManagerSelectedPromoteSpace) {
          return {
            valid: false,
            message: 'choose the destination space for the promoted sub-tabs before continuing.',
          }
        }
      } else if (!stageManagerDraft.newSpaceName.trim()) {
        return {
          valid: false,
          message: 'name the new destination space for the promoted sub-tabs before continuing.',
        }
      }

      return { valid: true, message: '' }
    }

    if (stageManagerAction === 'demote') {
      if (stageManagerDraft.demoteParentMode === 'existing') {
        if (!stageManagerDraft.demoteParentId) {
          return {
            valid: false,
            message: 'choose the parent tab that will receive the demoted items before continuing.',
          }
        }

        if (!stageManagerDemoteParentOptions.some((tab) => tab.id === stageManagerDraft.demoteParentId)) {
          return {
            valid: false,
            message: 'choose a valid destination parent for the demoted items before continuing.',
          }
        }

        if (stageManagerSelectionSnapshot.fullParentIds.has(stageManagerDraft.demoteParentId)) {
          return {
            valid: false,
            message: 'a selected parent tab cannot receive demoted items. choose a different destination parent.',
          }
        }
      } else if (!stageManagerDraft.demoteNewParentName.trim()) {
        return {
          valid: false,
          message: 'name the new parent tab that will receive the demoted items before continuing.',
        }
      }

      return { valid: true, message: '' }
    }

    if (stageManagerAction === 'migrate') {
      if (stageManagerDraft.migrateTarget === 'space') {
        if (stageManagerDraft.migrateSpaceMode === 'existing') {
          if (!stageManagerSelectedMigrateSpace) {
            return {
              valid: false,
              message: 'choose the destination space for this migration before continuing.',
            }
          }
        } else if (!stageManagerDraft.newSpaceName.trim()) {
          return {
            valid: false,
            message: 'name the new destination space before continuing.',
          }
        }

        if (stageManagerSelectionSnapshot.looseSubTabs.length > 0) {
          if (stageManagerDraft.strayHandlingMode === 'selected-parent') {
            if (!stageManagerDraft.straySelectedParentId || !stageManagerSelectionSnapshot.fullParentIds.has(stageManagerDraft.straySelectedParentId)) {
              return {
                valid: false,
                message: 'choose which selected parent should receive the stray sub-tabs before continuing.',
              }
            }
          } else if (stageManagerDraft.strayHandlingMode === 'existing-parent') {
            if (stageManagerDraft.migrateSpaceMode !== 'existing') {
              return {
                valid: false,
                message: 'existing destination parents are only available when migrating into an existing space.',
              }
            }
            if (
              !stageManagerDraft.strayExistingParentId ||
              !stageManagerStrayExistingParentOptions.some((tab) => tab.id === stageManagerDraft.strayExistingParentId)
            ) {
              return {
                valid: false,
                message: 'choose the destination parent for the stray sub-tabs before continuing.',
              }
            }
          } else if (stageManagerDraft.strayHandlingMode === 'new-parent' && !stageManagerDraft.strayNewParentName.trim()) {
            return {
              valid: false,
              message: 'name the new destination parent for the stray sub-tabs before continuing.',
            }
          }
        }

        return { valid: true, message: '' }
      }

      if (stageManagerDraft.migrateParentSpaceMode === 'existing' && !stageManagerDraft.migrateParentSpaceId) {
        return {
          valid: false,
          message: 'choose the destination space that contains the target parent before continuing.',
        }
      }

      if (stageManagerDraft.migrateParentSpaceMode === 'new') {
        if (!stageManagerDraft.newSpaceName.trim()) {
          return {
            valid: false,
            message: 'name the new destination space before continuing.',
          }
        }

        if (!stageManagerDraft.migrateNewParentName.trim()) {
          return {
            valid: false,
            message: 'name the new destination parent before continuing.',
          }
        }

        return { valid: true, message: '' }
      }

      if (stageManagerDraft.migrateParentMode === 'existing') {
        if (!stageManagerDraft.migrateParentId) {
          return {
            valid: false,
            message: 'choose the destination parent before continuing.',
          }
        }

        if (!stageManagerMigrateParentOptions.some((tab) => tab.id === stageManagerDraft.migrateParentId)) {
          return {
            valid: false,
            message: 'choose a valid destination parent before continuing.',
          }
        }

        if (
          stageManagerSelectedMigrateParentSpace?.id === activeSpace.id &&
          stageManagerSelectionSnapshot.fullParentIds.has(stageManagerDraft.migrateParentId)
        ) {
          return {
            valid: false,
            message: 'a selected parent tab cannot receive migrated items. choose a different destination parent.',
          }
        }
      } else if (!stageManagerDraft.migrateNewParentName.trim()) {
        return {
          valid: false,
          message: 'name the new destination parent before continuing.',
        }
      }

      return { valid: true, message: '' }
    }

    return { valid: true, message: '' }
  }

  const getStageManagerReviewDetails = () => {
    if (!stageManagerAction) return ['action: none selected']

    const details = [
      `selected parent tabs: ${stageManagerSelectionCounts.fullParentCount}`,
      `selected sub-tabs: ${stageManagerSelectionCounts.selectedSubTabCount}`,
      `action: ${stageManagerAction.replace('-', ' ')}`,
    ]

    if (stageManagerAction === 'promote') {
      if (stageManagerSelectionSnapshot.fullParents.length === 1) {
        details.push(`new space: ${sanitizeName(stageManagerDraft.newSpaceName || stageManagerSelectionSnapshot.fullParents[0].title)}`)
      } else if (stageManagerDraft.promoteSpaceMode === 'existing') {
        details.push(`destination space: ${stageManagerSelectedPromoteSpace?.name ?? 'none selected'}`)
      } else {
        details.push(`new space: ${sanitizeName(stageManagerDraft.newSpaceName || 'untitled')}`)
      }
    } else if (stageManagerAction === 'demote') {
      if (stageManagerDraft.demoteParentMode === 'existing') {
        details.push(
          `destination parent: ${
            stageManagerDemoteParentOptions.find((tab) => tab.id === stageManagerDraft.demoteParentId)?.title ?? 'none selected'
          }`,
        )
      } else {
        details.push(`new parent: ${sanitizeName(stageManagerDraft.demoteNewParentName || 'untitled')}`)
      }
    } else if (stageManagerAction === 'migrate') {
      if (stageManagerDraft.migrateTarget === 'space') {
        if (stageManagerDraft.migrateSpaceMode === 'existing') {
          details.push(`destination space: ${stageManagerSelectedMigrateSpace?.name ?? 'none selected'}`)
        } else {
          details.push(`new space: ${sanitizeName(stageManagerDraft.newSpaceName || 'untitled')}`)
        }
        if (stageManagerSelectionSnapshot.looseSubTabs.length > 0) {
          if (stageManagerDraft.strayHandlingMode === 'promote') {
            details.push('stray sub-tabs: promote to own prime tabs')
          } else if (stageManagerDraft.strayHandlingMode === 'selected-parent') {
            details.push(
              `stray sub-tabs: include under ${
                stageManagerSelectionSnapshot.fullParents.find((tab) => tab.id === stageManagerDraft.straySelectedParentId)?.title ??
                'selected parent'
              }`,
            )
          } else if (stageManagerDraft.strayHandlingMode === 'existing-parent') {
            details.push(
              `stray sub-tabs: include under ${
                stageManagerStrayExistingParentOptions.find((tab) => tab.id === stageManagerDraft.strayExistingParentId)?.title ??
                'existing parent'
              }`,
            )
          } else {
            details.push(`stray sub-tabs: include under new parent ${sanitizeName(stageManagerDraft.strayNewParentName || 'untitled')}`)
          }
        }
      } else {
        if (stageManagerDraft.migrateParentSpaceMode === 'current') {
          details.push(`destination space: ${activeSpace.name}`)
        } else if (stageManagerDraft.migrateParentSpaceMode === 'existing') {
          details.push(
            `destination space: ${
              state.spaces.find((space) => space.id === stageManagerDraft.migrateParentSpaceId)?.name ?? 'none selected'
            }`,
          )
        } else {
          details.push(`new space: ${sanitizeName(stageManagerDraft.newSpaceName || 'untitled')}`)
        }

        if (stageManagerDraft.migrateParentSpaceMode === 'new' || stageManagerDraft.migrateParentMode === 'new') {
          details.push(`destination parent: ${sanitizeName(stageManagerDraft.migrateNewParentName || 'untitled')}`)
        } else {
          details.push(
            `destination parent: ${
              stageManagerMigrateParentOptions.find((tab) => tab.id === stageManagerDraft.migrateParentId)?.title ?? 'none selected'
            }`,
          )
        }
      }
    } else if (stageManagerAction === 'mass-delete') {
      details.push(`mode: ${stageManagerDraft.massDeleteMode === 'trash' ? 'move to trash' : 'delete for real'}`)
    }

    return details
  }

  const getStageManagerReviewWarning = () => {
    if (stageManagerAction === 'mass-delete' && stageManagerDraft.massDeleteMode === 'permanent') {
      return 'This will permanently delete the current selection.'
    }
    if (stageManagerAction === 'migrate' && stageManagerDraft.migrateTarget === 'parent') {
      return 'Moving a parent into another parent demotes it into a sub-tab under that destination parent.'
    }
    if (stageManagerAction === 'demote') {
      return 'Each demoted parent becomes one sub-tab whose content comes from that parent home note.'
    }
    return ''
  }

  const getStageManagerApplyToastMessage = () => {
    if (stageManagerAction === 'mass-delete') {
      return stageManagerDraft.massDeleteMode === 'trash' ? 'selected items have been moved to trash.' : 'selected items have been deleted.'
    }
    if (stageManagerAction === 'promote') return 'selected items have been promoted.'
    if (stageManagerAction === 'demote') return 'selected items have been demoted.'
    if (stageManagerAction === 'migrate') return 'selected items have been migrated.'
    return 'director changes applied.'
  }

  const finishStageManagerApply = (nextState: AppState, toastMessage: string, tone: ToastTone = 'success') => {
    const sanitizedState = applyAutoPurgeToAppState(nextState)
    stateRef.current = sanitizedState
    setState(sanitizedState)
    if (storageHydrated) {
      appStateStore.save(JSON.stringify(sanitizedState))
    }
    setViewMode('main')
    setMenuOpen(false)
    setContextMenu(null)
    setEditing(null)
    setToast({
      id: Date.now(),
      message: toastMessage,
      tone,
      durationMs: DEFAULT_TOAST_DURATION_MS,
    })
  }

  const handleStageManagerApply = () => {
    if (!stageManagerAction) {
      pushToast('choose a director action before applying.', 'warning')
      return
    }

    const validation = getStageManagerConfigureValidation()
    if (!validation.valid) {
      pushToast(validation.message, 'warning')
      return
    }

    const latestState = buildStateWithLatestEditorContent()
    const currentSpace = latestState.spaces.find((space) => space.id === latestState.activeSpaceId)
    if (!currentSpace) return
    const projectedDomains = latestState.domains.map((domain) =>
      domain.id === latestState.activeDomainId
        ? { ...domain, activeSpaceId: latestState.activeSpaceId, spaces: latestState.spaces }
        : domain,
    )
    const getSpacesFromDomains = (domains: Domain[], domainId: string) =>
      domains.find((domain) => domain.id === domainId)?.spaces ?? []
    const replaceDomainSpaces = (domains: Domain[], domainId: string, spaces: Space[], activeSpaceId?: string) =>
      domains.map((domain) =>
        domain.id === domainId
          ? {
              ...domain,
              spaces,
              activeSpaceId:
                activeSpaceId && spaces.some((space) => space.id === activeSpaceId)
                  ? activeSpaceId
                  : spaces.some((space) => space.id === domain.activeSpaceId)
                    ? domain.activeSpaceId
                    : spaces[0]?.id ?? domain.activeSpaceId,
            }
          : domain,
      )
    const buildDomainAwareState = (domains: Domain[], activeDomainId = latestState.activeDomainId, activeSpaceId = latestState.activeSpaceId) => {
      const activeDomain = domains.find((domain) => domain.id === activeDomainId) ?? domains[0]
      const spaces = activeDomain?.spaces ?? []
      const resolvedSpaceId = spaces.some((space) => space.id === activeSpaceId) ? activeSpaceId : activeDomain?.activeSpaceId ?? spaces[0]?.id ?? ''
      return {
        ...latestState,
        activeDomainId: activeDomain?.id ?? latestState.activeDomainId,
        activeSpaceId: resolvedSpaceId,
        spaces,
        domains,
      }
    }

    const snapshot = buildStageManagerSelectionSnapshot(currentSpace.data.tabs, stageManagerSelections)
    if (!snapshot.hasSelection) {
      pushToast('select at least one parent or sub-tab before applying director.', 'warning')
      return
    }

    if (stageManagerAction === 'mass-delete') {
      const nextSpaces = latestState.spaces.map((space) => {
        if (space.id !== latestState.activeSpaceId) return space

        const deletedTabs =
          stageManagerDraft.massDeleteMode === 'trash'
            ? [
                ...space.data.deletedTabs.map((entry) => ({ ...entry, tab: cloneTabForTransfer(entry.tab) })),
                ...snapshot.fullParents.map((tab) => ({
                  id: createId(),
                  tab: cloneTabForTransfer(tab),
                  deletedAt: Date.now(),
                })),
              ]
            : space.data.deletedTabs.map((entry) => ({ ...entry, tab: cloneTabForTransfer(entry.tab) }))

        const deletedSubTabs =
          stageManagerDraft.massDeleteMode === 'trash'
            ? [
                ...space.data.deletedSubTabs.map((entry) => ({ ...entry, subTab: cloneSubTabForTransfer(entry.subTab) })),
                ...snapshot.looseSubTabs.map(({ parentTab, subTab }) => ({
                  id: createId(),
                  parentTabId: parentTab.id,
                  parentTabTitle: parentTab.title,
                  subTab: cloneSubTabForTransfer(subTab),
                  deletedAt: Date.now(),
                })),
              ]
            : space.data.deletedSubTabs.map((entry) => ({ ...entry, subTab: cloneSubTabForTransfer(entry.subTab) }))

        const stripped = stripStageManagerSelectionsFromWorkspace(space.data, snapshot)
        return {
          ...space,
          data: createWorkspaceDataFromTabs(stripped.tabs, {
            activeTabId: stripped.activeTabId,
            deletedTabs,
            deletedSubTabs,
          }),
        }
      })

      finishStageManagerApply(
        {
          ...latestState,
          spaces: nextSpaces,
        },
        getStageManagerApplyToastMessage(),
      )
      return
    }

    if (stageManagerAction === 'promote') {
      const loosePromotedTabs = snapshot.looseSubTabs.map(({ subTab }) => createPromotedParentTab(subTab))
      const strippedCurrentData = stripStageManagerSelectionsFromWorkspace(currentSpace.data, snapshot)
      const nextSpaces = latestState.spaces.map((space) =>
        space.id === currentSpace.id ? { ...space, data: strippedCurrentData } : space,
      )

      if (snapshot.fullParents.length === 1) {
        const promotedParent = snapshot.fullParents[0]
        const mainTab: Tab = {
          id: createId(),
          title: 'main',
          noteBodyId: promotedParent.noteBodyId,
          homeContent: promotedParent.homeContent,
          activeSubTabId: null,
          subTabs: [],
        }
        const movedTabs = [
          mainTab,
          ...promotedParent.subTabs.map((subTab) => createPromotedParentTab(subTab)),
          ...loosePromotedTabs,
        ]
        const newSpaceId = createId()
        const newSpace: Space = {
          id: newSpaceId,
          name: sanitizeName(stageManagerDraft.newSpaceName || promotedParent.title),
          settings: { autoRemoveDeletedDays: DEFAULT_AUTO_REMOVE_DAYS },
          data: createWorkspaceDataFromTabs(movedTabs, { activeTabId: mainTab.id }),
        }
        const destinationDomainId = stageManagerPromoteDomainId
        let nextDomains = replaceDomainSpaces(projectedDomains, latestState.activeDomainId, nextSpaces, latestState.activeSpaceId)
        const destinationBaseSpaces =
          destinationDomainId === latestState.activeDomainId ? nextSpaces : getSpacesFromDomains(nextDomains, destinationDomainId)
        const destinationSpaces = [...destinationBaseSpaces, newSpace]
        nextDomains = replaceDomainSpaces(nextDomains, destinationDomainId, destinationSpaces, newSpace.id)

        finishStageManagerApply(
          buildDomainAwareState(
            nextDomains,
            state.ui.stageManagerOpenDestinationAfterApply ? destinationDomainId : latestState.activeDomainId,
            state.ui.stageManagerOpenDestinationAfterApply ? newSpace.id : latestState.activeSpaceId,
          ),
          getStageManagerApplyToastMessage(),
        )
        return
      }

      if (stageManagerDraft.promoteSpaceMode === 'new') {
        const firstTabId = loosePromotedTabs[0]?.id ?? null
        const newSpace: Space = {
          id: createId(),
          name: sanitizeName(stageManagerDraft.newSpaceName || 'untitled'),
          settings: { autoRemoveDeletedDays: DEFAULT_AUTO_REMOVE_DAYS },
          data: createWorkspaceDataFromTabs(loosePromotedTabs, { activeTabId: firstTabId ?? undefined }),
        }
        const destinationDomainId = stageManagerPromoteDomainId
        let nextDomains = replaceDomainSpaces(projectedDomains, latestState.activeDomainId, nextSpaces, latestState.activeSpaceId)
        const destinationBaseSpaces =
          destinationDomainId === latestState.activeDomainId ? nextSpaces : getSpacesFromDomains(nextDomains, destinationDomainId)
        const destinationSpaces = [...destinationBaseSpaces, newSpace]
        nextDomains = replaceDomainSpaces(nextDomains, destinationDomainId, destinationSpaces, newSpace.id)

        finishStageManagerApply(
          buildDomainAwareState(
            nextDomains,
            state.ui.stageManagerOpenDestinationAfterApply ? destinationDomainId : latestState.activeDomainId,
            state.ui.stageManagerOpenDestinationAfterApply ? newSpace.id : latestState.activeSpaceId,
          ),
          getStageManagerApplyToastMessage(),
        )
        return
      }

      const destinationDomainId = stageManagerPromoteDomainId
      const destinationSpaceId = stageManagerDraft.promoteSpaceId
      const destinationFirstTabId = loosePromotedTabs[0]?.id ?? null
      const domainsWithSource = replaceDomainSpaces(projectedDomains, latestState.activeDomainId, nextSpaces, latestState.activeSpaceId)
      const destinationSpaces = getSpacesFromDomains(domainsWithSource, destinationDomainId).map((space) => {
        if (space.id !== destinationSpaceId) return space
        const destinationTabs = [...space.data.tabs.map(cloneTabForTransfer), ...loosePromotedTabs]
        return {
          ...space,
          data: createWorkspaceDataFromTabs(destinationTabs, {
            activeTabId:
              state.ui.stageManagerOpenDestinationAfterApply && destinationFirstTabId
                ? destinationFirstTabId
                : space.data.activeTabId,
            deletedTabs: space.data.deletedTabs,
            deletedSubTabs: space.data.deletedSubTabs,
          }),
        }
      })
      const nextDomains = replaceDomainSpaces(domainsWithSource, destinationDomainId, destinationSpaces, destinationSpaceId)
      finishStageManagerApply(
        buildDomainAwareState(
          nextDomains,
          state.ui.stageManagerOpenDestinationAfterApply && destinationSpaceId ? destinationDomainId : latestState.activeDomainId,
          state.ui.stageManagerOpenDestinationAfterApply && destinationSpaceId ? destinationSpaceId : latestState.activeSpaceId,
        ),
        getStageManagerApplyToastMessage(),
      )
      return
    }

    if (stageManagerAction === 'demote') {
      const movedSubTabs = buildStageManagerMovedSubTabs(snapshot)
      const strippedCurrentData = stripStageManagerSelectionsFromWorkspace(currentSpace.data, snapshot)
      const destinationDomainId = stageManagerDemoteDomainId
      const destinationSpaceId = stageManagerDemoteSpace?.id ?? latestState.activeSpaceId
      const sameDestinationSpace = destinationDomainId === latestState.activeDomainId && destinationSpaceId === currentSpace.id

      let destinationParentId: string
      let destinationTabs: Tab[]
      const destinationSourceTabs = sameDestinationSpace
        ? strippedCurrentData.tabs
        : getSpacesFromDomains(projectedDomains, destinationDomainId).find((space) => space.id === destinationSpaceId)?.data.tabs ?? []
      if (stageManagerDraft.demoteParentMode === 'new') {
        destinationParentId = createId()
        const newParent: Tab = {
          id: destinationParentId,
          title: sanitizeName(stageManagerDraft.demoteNewParentName || 'untitled'),
          noteBodyId: createId(),
          homeContent: '',
          activeSubTabId: null,
          subTabs: movedSubTabs.map(cloneSubTabForTransfer),
        }
        destinationTabs = [...destinationSourceTabs.map(cloneTabForTransfer), newParent]
      } else {
        destinationParentId = stageManagerDraft.demoteParentId
        destinationTabs = appendSubTabsToParent(
          destinationSourceTabs,
          destinationParentId,
          movedSubTabs,
          state.ui.stageManagerOpenDestinationAfterApply,
        )
      }
      const sourceSpaces = latestState.spaces.map((space) =>
        space.id !== currentSpace.id ? space : { ...space, data: strippedCurrentData },
      )
      let nextDomains = replaceDomainSpaces(projectedDomains, latestState.activeDomainId, sourceSpaces, latestState.activeSpaceId)
      const destinationSpaces = getSpacesFromDomains(nextDomains, destinationDomainId).map((space) =>
        space.id !== destinationSpaceId
          ? space
          : {
              ...space,
              data: createWorkspaceDataFromTabs(destinationTabs, {
                activeTabId:
                  state.ui.stageManagerOpenDestinationAfterApply && destinationParentId
                    ? destinationParentId
                    : sameDestinationSpace
                      ? strippedCurrentData.activeTabId
                      : space.data.activeTabId,
                deletedTabs: space.data.deletedTabs,
                deletedSubTabs: space.data.deletedSubTabs,
              }),
            },
      )
      nextDomains = replaceDomainSpaces(nextDomains, destinationDomainId, destinationSpaces, destinationSpaceId)

      finishStageManagerApply(
        buildDomainAwareState(
          nextDomains,
          state.ui.stageManagerOpenDestinationAfterApply ? destinationDomainId : latestState.activeDomainId,
          state.ui.stageManagerOpenDestinationAfterApply ? destinationSpaceId : latestState.activeSpaceId,
        ),
        getStageManagerApplyToastMessage(),
      )
      return
    }

    const strippedCurrentData = stripStageManagerSelectionsFromWorkspace(currentSpace.data, snapshot)
    const movedParentTabs = snapshot.fullParents.map(cloneTabForTransfer)
    const looseMovedSubTabs = snapshot.looseSubTabs.map(({ subTab }) => cloneSubTabForTransfer(subTab))

    if (stageManagerDraft.migrateTarget === 'space') {
      const movedParentCopies = movedParentTabs.map(cloneTabForTransfer)
      const additionalDestinationTabs: Tab[] = []

      if (snapshot.looseSubTabs.length > 0) {
        if (stageManagerDraft.strayHandlingMode === 'promote') {
          additionalDestinationTabs.push(...looseMovedSubTabs.map((subTab) => createPromotedParentTab(subTab)))
        } else if (stageManagerDraft.strayHandlingMode === 'selected-parent') {
          const targetParentId = stageManagerDraft.straySelectedParentId
          const targetIndex = movedParentCopies.findIndex((tab) => tab.id === targetParentId)
          if (targetIndex >= 0) {
            movedParentCopies[targetIndex] = {
              ...movedParentCopies[targetIndex],
              subTabs: [...movedParentCopies[targetIndex].subTabs, ...looseMovedSubTabs.map(cloneSubTabForTransfer)],
            }
          }
        } else if (stageManagerDraft.strayHandlingMode === 'new-parent') {
          additionalDestinationTabs.push({
            id: createId(),
            title: sanitizeName(stageManagerDraft.strayNewParentName || 'untitled'),
            noteBodyId: createId(),
            homeContent: '',
            activeSubTabId: null,
            subTabs: looseMovedSubTabs.map(cloneSubTabForTransfer),
          })
        }
      }

      if (stageManagerDraft.migrateSpaceMode === 'new') {
        const newSpaceId = createId()
        const destinationTabs =
          stageManagerDraft.strayHandlingMode === 'existing-parent'
            ? [...movedParentCopies]
            : [...movedParentCopies, ...additionalDestinationTabs]
        const fallbackTab = destinationTabs[0]?.id
        const newSpace: Space = {
          id: newSpaceId,
          name: sanitizeName(stageManagerDraft.newSpaceName || 'untitled'),
          settings: { autoRemoveDeletedDays: DEFAULT_AUTO_REMOVE_DAYS },
          data: createWorkspaceDataFromTabs(destinationTabs, { activeTabId: fallbackTab }),
        }
        const destinationDomainId = stageManagerMigrateDomainId
        const sourceSpaces = latestState.spaces.map((space) =>
          space.id === currentSpace.id ? { ...space, data: strippedCurrentData } : space,
        )
        let nextDomains = replaceDomainSpaces(projectedDomains, latestState.activeDomainId, sourceSpaces, latestState.activeSpaceId)
        const destinationBaseSpaces =
          destinationDomainId === latestState.activeDomainId ? sourceSpaces : getSpacesFromDomains(nextDomains, destinationDomainId)
        const destinationSpaces = [...destinationBaseSpaces, newSpace]
        nextDomains = replaceDomainSpaces(nextDomains, destinationDomainId, destinationSpaces, newSpace.id)

        finishStageManagerApply(
          buildDomainAwareState(
            nextDomains,
            state.ui.stageManagerOpenDestinationAfterApply ? destinationDomainId : latestState.activeDomainId,
            state.ui.stageManagerOpenDestinationAfterApply ? newSpace.id : latestState.activeSpaceId,
          ),
          getStageManagerApplyToastMessage(),
        )
        return
      }

      const destinationDomainId = stageManagerMigrateDomainId
      const destinationSpaceId = stageManagerDraft.migrateSpaceId
      const sourceSpaces = latestState.spaces.map((space) =>
        space.id === currentSpace.id ? { ...space, data: strippedCurrentData } : space,
      )
      let nextDomains = replaceDomainSpaces(projectedDomains, latestState.activeDomainId, sourceSpaces, latestState.activeSpaceId)
      const destinationSpaces = getSpacesFromDomains(nextDomains, destinationDomainId).map((space) => {
        if (space.id !== destinationSpaceId) return space

        let destinationTabs = [...space.data.tabs.map(cloneTabForTransfer), ...movedParentCopies]
        let destinationActiveTabId = state.ui.stageManagerOpenDestinationAfterApply
          ? movedParentCopies[0]?.id ?? additionalDestinationTabs[0]?.id ?? space.data.activeTabId
          : space.data.activeTabId

        if (stageManagerDraft.strayHandlingMode === 'existing-parent') {
          destinationTabs = appendSubTabsToParent(
            destinationTabs,
            stageManagerDraft.strayExistingParentId,
            looseMovedSubTabs,
            state.ui.stageManagerOpenDestinationAfterApply,
          )
          if (state.ui.stageManagerOpenDestinationAfterApply) {
            destinationActiveTabId = stageManagerDraft.strayExistingParentId
          }
        } else {
          destinationTabs = [...destinationTabs, ...additionalDestinationTabs]
        }

        return {
          ...space,
          data: createWorkspaceDataFromTabs(destinationTabs, {
            activeTabId: destinationActiveTabId,
            deletedTabs: space.data.deletedTabs,
            deletedSubTabs: space.data.deletedSubTabs,
          }),
        }
      })
      nextDomains = replaceDomainSpaces(nextDomains, destinationDomainId, destinationSpaces, destinationSpaceId)
      finishStageManagerApply(
        buildDomainAwareState(
          nextDomains,
          state.ui.stageManagerOpenDestinationAfterApply && destinationSpaceId ? destinationDomainId : latestState.activeDomainId,
          state.ui.stageManagerOpenDestinationAfterApply && destinationSpaceId ? destinationSpaceId : latestState.activeSpaceId,
        ),
        getStageManagerApplyToastMessage(),
      )
      return
    }

    const movedSubTabs = buildStageManagerMovedSubTabs(snapshot)

    if (stageManagerDraft.migrateParentSpaceMode === 'current') {
      let destinationParentId: string
      let destinationTabs: Tab[]
      if (stageManagerDraft.migrateParentMode === 'new') {
        destinationParentId = createId()
        const newParent: Tab = {
          id: destinationParentId,
          title: sanitizeName(stageManagerDraft.migrateNewParentName || 'untitled'),
          noteBodyId: createId(),
          homeContent: '',
          activeSubTabId: null,
          subTabs: movedSubTabs.map(cloneSubTabForTransfer),
        }
        destinationTabs = [...strippedCurrentData.tabs.map(cloneTabForTransfer), newParent]
      } else {
        destinationParentId = stageManagerDraft.migrateParentId
        destinationTabs = appendSubTabsToParent(
          strippedCurrentData.tabs,
          destinationParentId,
          movedSubTabs,
          state.ui.stageManagerOpenDestinationAfterApply,
        )
      }

      finishStageManagerApply(
        {
          ...latestState,
          spaces: latestState.spaces.map((space) =>
            space.id !== currentSpace.id
              ? space
              : {
                  ...space,
                  data: createWorkspaceDataFromTabs(destinationTabs, {
                    activeTabId:
                      state.ui.stageManagerOpenDestinationAfterApply && destinationParentId
                        ? destinationParentId
                        : strippedCurrentData.activeTabId,
                    deletedTabs: strippedCurrentData.deletedTabs,
                    deletedSubTabs: strippedCurrentData.deletedSubTabs,
                  }),
                },
          ),
        },
        getStageManagerApplyToastMessage(),
      )
      return
    }

    if (stageManagerDraft.migrateParentSpaceMode === 'new') {
      const destinationParentId = createId()
      const newSpaceId = createId()
      const destinationDomainId = stageManagerMigrateParentDomainId
      const newParent: Tab = {
        id: destinationParentId,
        title: sanitizeName(stageManagerDraft.migrateNewParentName || 'untitled'),
        noteBodyId: createId(),
        homeContent: '',
        activeSubTabId: null,
        subTabs: movedSubTabs.map(cloneSubTabForTransfer),
      }
      const newSpace: Space = {
        id: newSpaceId,
        name: sanitizeName(stageManagerDraft.newSpaceName || 'untitled'),
        settings: { autoRemoveDeletedDays: DEFAULT_AUTO_REMOVE_DAYS },
        data: createWorkspaceDataFromTabs([newParent], { activeTabId: destinationParentId }),
      }
      const sourceSpaces = latestState.spaces.map((space) =>
        space.id === currentSpace.id ? { ...space, data: strippedCurrentData } : space,
      )
      let nextDomains = replaceDomainSpaces(projectedDomains, latestState.activeDomainId, sourceSpaces, latestState.activeSpaceId)
      const destinationBaseSpaces =
        destinationDomainId === latestState.activeDomainId ? sourceSpaces : getSpacesFromDomains(nextDomains, destinationDomainId)
      nextDomains = replaceDomainSpaces(nextDomains, destinationDomainId, [...destinationBaseSpaces, newSpace], newSpace.id)

      finishStageManagerApply(
        buildDomainAwareState(
          nextDomains,
          state.ui.stageManagerOpenDestinationAfterApply ? destinationDomainId : latestState.activeDomainId,
          state.ui.stageManagerOpenDestinationAfterApply ? newSpace.id : latestState.activeSpaceId,
        ),
        getStageManagerApplyToastMessage(),
      )
      return
    }

    const destinationDomainId = stageManagerMigrateParentDomainId
    const destinationSpaceId = stageManagerDraft.migrateParentSpaceId
    const sourceSpaces = latestState.spaces.map((space) =>
      space.id === currentSpace.id ? { ...space, data: strippedCurrentData } : space,
    )
    let nextDomains = replaceDomainSpaces(projectedDomains, latestState.activeDomainId, sourceSpaces, latestState.activeSpaceId)
    const destinationSpaces = getSpacesFromDomains(nextDomains, destinationDomainId).map((space) => {
      if (space.id !== destinationSpaceId) return space

      let destinationParentId: string
      let destinationTabs: Tab[]
      if (stageManagerDraft.migrateParentMode === 'new') {
        destinationParentId = createId()
        const newParent: Tab = {
          id: destinationParentId,
          title: sanitizeName(stageManagerDraft.migrateNewParentName || 'untitled'),
          noteBodyId: createId(),
          homeContent: '',
          activeSubTabId: null,
          subTabs: movedSubTabs.map(cloneSubTabForTransfer),
        }
        destinationTabs = [...space.data.tabs.map(cloneTabForTransfer), newParent]
      } else {
        destinationParentId = stageManagerDraft.migrateParentId
        destinationTabs = appendSubTabsToParent(
          space.data.tabs,
          destinationParentId,
          movedSubTabs,
          state.ui.stageManagerOpenDestinationAfterApply,
        )
      }

      return {
        ...space,
        data: createWorkspaceDataFromTabs(destinationTabs, {
          activeTabId:
            state.ui.stageManagerOpenDestinationAfterApply && destinationParentId
              ? destinationParentId
              : space.data.activeTabId,
          deletedTabs: space.data.deletedTabs,
          deletedSubTabs: space.data.deletedSubTabs,
        }),
      }
    })
    nextDomains = replaceDomainSpaces(nextDomains, destinationDomainId, destinationSpaces, destinationSpaceId)
    finishStageManagerApply(
      buildDomainAwareState(
        nextDomains,
        state.ui.stageManagerOpenDestinationAfterApply && destinationSpaceId ? destinationDomainId : latestState.activeDomainId,
        state.ui.stageManagerOpenDestinationAfterApply && destinationSpaceId ? destinationSpaceId : latestState.activeSpaceId,
      ),
      getStageManagerApplyToastMessage(),
    )
  }

  const handleStageManagerPrevious = () => {
    if (stageManagerStep === 'select') return
    if (stageManagerStep === 'action') {
      setStageManagerStep('select')
      return
    }
    if (stageManagerStep === 'configure') {
      setStageManagerStep('action')
      return
    }
    setStageManagerStep('configure')
  }

  const handleStageManagerNext = () => {
    if (stageManagerStep === 'select') {
      if (!stageManagerSelectionSnapshot.hasSelection) {
        pushToast('select at least one parent or sub-tab before continuing.', 'warning')
        return
      }
      setStageManagerStep('action')
      return
    }

    if (stageManagerStep === 'action') {
      if (!stageManagerAction) {
        pushToast('choose a director action before continuing.', 'warning')
        return
      }
      const validation = getStageManagerActionValidation(stageManagerAction, stageManagerSelectionSnapshot)
      if (!validation.valid) {
        setStageManagerAction(null)
        pushToast(validation.message, 'warning')
        return
      }
      setStageManagerStep('configure')
      return
    }

    if (stageManagerStep === 'configure') {
      const validation = getStageManagerConfigureValidation()
      if (!validation.valid) {
        pushToast(validation.message, 'warning')
        return
      }
      setStageManagerStep('review')
      return
    }

    pushToast('director execution will be added in the next chunk.', 'warning')
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
        onGetStageManagerParentSelection={getStageManagerParentSelection}
        onStageManagerParentClick={handleStageManagerParentClick}
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
        onEndStageManager={endStageManager}
        onCloseSettingsView={closeSettingsView}
        onSetMenuOpen={setMenuOpen}
        onSetContextMenu={setContextMenu}
        onCloseNotePopovers={() => {
          setNoteToolsOpen(false)
          setHeadingMenuOpen(false)
        }}
        onOpenDomains={openDomainsView}
        onOpenSpaces={openSpacesView}
        onOpenStageManager={openStageManager}
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
            onGetStageManagerParentSelection={getStageManagerParentSelection}
            onStageManagerHomeClick={handleStageManagerHomeClick}
            onStageManagerSubTabClick={handleStageManagerSubTabClick}
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
              step={stageManagerStep}
              action={stageManagerAction}
              draft={stageManagerDraft}
              selectionSnapshot={stageManagerSelectionSnapshot}
              selectionCounts={stageManagerSelectionCounts}
              promoteDomainId={stageManagerPromoteDomainId}
              promoteDestinationSpaces={stageManagerPromoteDestinationSpaces}
              demoteDomainId={stageManagerDemoteDomainId}
              demoteSpaces={stageManagerDemoteSpaces}
              demoteSpace={stageManagerDemoteSpace}
              demoteParentOptions={stageManagerDemoteParentOptions}
              migrateDomainId={stageManagerMigrateDomainId}
              otherSpaces={stageManagerOtherSpaces}
              strayHandlingSelectValue={stageManagerStrayHandlingSelectValue}
              strayExistingParentOptions={stageManagerStrayExistingParentOptions}
              migrateParentDomainId={stageManagerMigrateParentDomainId}
              migrateParentSpaces={stageManagerMigrateParentSpaces}
              migrateParentOptions={stageManagerMigrateParentOptions}
              openDestinationAfterApply={state.ui.stageManagerOpenDestinationAfterApply}
              reviewDetails={getStageManagerReviewDetails()}
              reviewWarning={getStageManagerReviewWarning()}
              onSelectAll={selectAllStageManagerItems}
              onDeselectAll={deselectAllStageManagerItems}
              onSelectAction={selectStageManagerAction}
              onDraftChange={updateStageManagerDraft}
              onOpenDestinationChange={settingsController.updateStageManagerOpenDestinationSetting}
              onPrevious={handleStageManagerPrevious}
              onNext={handleStageManagerNext}
              onApply={handleStageManagerApply}
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
