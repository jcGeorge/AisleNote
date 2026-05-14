import { type MouseEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Editor } from '@toast-ui/editor'
import '@toast-ui/editor/dist/toastui-editor.css'
import './App.css'
import { useArrangeMode } from './arrange/useArrangeMode'
import { DomainsPage } from './components/domains/DomainsPage'
import { ImageToolsOverlay } from './components/editor/ImageToolsOverlay'
import { LegacyEditorShell } from './components/editor/LegacyEditorShell'
import { NewlineOperationsMenu } from './components/editor/NewlineOperationsMenu'
import {
  getNewlineMenuKeyboardAction,
  isNewlineMenuKeyboardKey,
} from './components/editor/newline-menu-keyboard'
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
import { buildAisleEditorKey } from './editor/aisle-editor'
import { applyListToolbarCommand, type ToolbarListCommand } from './editor/list-marker-commands'
import { applyEditorNewlineOperation } from './editor/newline-operations'
import { useLegacyEditor } from './editor/useLegacyEditor'
import {
  getEditorCursorSelection,
  getCommandCapableEditor,
  getInternalNoteLinkHitAtDocPosition,
  getWysiwygView,
  restoreEditorCursorSelection,
} from './editor/prosemirror-utils'
import { useAisleEditors } from './editor/useAisleEditors'
import { useEditorDomEvents } from './editor/useEditorDomEvents'
import { useEditorToolbarLayer } from './editor/useEditorToolbarLayer'
import { useEditorToolbarState } from './editor/useEditorToolbarState'
import { useImageTools } from './editor/useImageTools'
import { useMultilineEditing } from './editor/useMultilineEditing'
import {
  COMPLETED_TASK_UNDO_HINT_COOLDOWN_MS,
  COMPLETED_TASK_UNDO_HINT_DETECTION_MS,
  COMPLETED_TASK_UNDO_HINT_MESSAGE,
  COMPLETED_TASK_UNDO_HINT_TOAST_DURATION_MS,
} from './editor/task-behavior'
import { exportAppData, type ExportScope } from './export/export-data'
import { useGlobalHotkeys } from './hotkeys/useGlobalHotkeys'
import {
  mergeLeadingIndentsFromWysiwyg,
  normalizeEmptyHeadingMarkersFromWysiwyg,
  normalizeMarkdownForPersistence,
} from './markdown/markdown-utils'
import { useNavigationHistory } from './navigation/useNavigationHistory'
import {
  buildNoteCursorLocationKey,
  clampNoteCursorSelection,
  noteCursorSelectionsEqual,
  pruneNoteCursorLocations,
} from './notes/note-cursors'
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
  type NoteContextReferencePayload,
  parseContextReferences,
  replaceInternalNoteLinkByOccurrence,
  replaceContextTokenById,
  removeContextTokenById,
  wouldCreateContextCycle,
} from './notes/note-references'
import { useSettingsController } from './settings/useSettingsController'
import { applyAutoPurgeToAppState, applyMarkdownToAppState, ensureNoteBodiesForAppState } from './state/app-state'
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
import { usePersistentAppState } from './storage/usePersistentAppState'
import { TRASH_HOME_ID } from './trash/trash-model'
import { useTrashSelection } from './trash/useTrashSelection'
import type {
  AppState,
  ContextMenuState,
  DeleteTarget,
  LinkPromptState,
  ModalState,
  NewlineOperationId,
  NoteAisle,
  NoteBody,
  NoteCursorLocation,
  NoteCursorSelection,
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

type NewlineOperationsMenuState = {
  top: number
  left: number
  operations: NewlineOperationId[]
}

type AisleStructuralSnapshot = {
  location: NoteLocation
  locationKey: string
  noteBodyId: string
  aisles: NoteAisle[]
  activeAisleId: string
  cursorLocation: NoteCursorLocation | null
}

type AisleStructuralHistoryEntry = {
  type: 'add-aisle' | 'delete-aisle'
  noteBodyId: string
  before: AisleStructuralSnapshot
  after: AisleStructuralSnapshot
  beforeSignature: string
  afterSignature: string
}

type PendingCursorRestore = {
  noteLocationKey: string
  aisleId: string
  selection: NoteCursorSelection | null
}

const AISLE_DELETE_CONFIRMATION_WIDTH_PX = 248
const AISLE_DELETE_CONFIRMATION_HEIGHT_PX = 104

const DEFAULT_TOAST_DURATION_MS = 3000
const HOVERED_TOAST_DURATION_MS = 2000

type EditableEntityType = 'tab' | 'subtab' | 'space' | 'domain'

let renameInputMeasureContext: CanvasRenderingContext2D | null = null

function App() {
  const { state, setState, stateRef, storageHydrated } = usePersistentAppState()
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
  const [aisleDeleteConfirmation, setAisleDeleteConfirmation] = useState<AisleDeleteConfirmationState | null>(null)
  const [aisleDeleteMode, setAisleDeleteMode] = useState(false)
  const linkPromptInputRef = useRef<HTMLInputElement | null>(null)
  const aisleDeleteConfirmButtonRef = useRef<HTMLButtonElement | null>(null)

  const editorMountRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<Editor | null>(null)
  const aisleScrollRef = useRef<HTMLDivElement | null>(null)
  const aisleHorizontalScrollByBodyRef = useRef<Map<string, number>>(new Map())
  const pendingScrollToAisleIdRef = useRef<string | null>(null)
  const pendingFocusToAisleIdRef = useRef<string | null>(null)
  const editorEventRootRef = useRef<HTMLElement | null>(null)
  const runNewlineOperationFromMenuRef = useRef<(operation: NewlineOperationId) => void>(() => {})
  const deleteContextPreviewRef = useRef<(tokenId: string) => void>(() => {})
  const pendingContentRef = useRef<PendingContent | null>(null)
  const pendingCreatedEditRef = useRef<PendingCreatedEdit | null>(null)
  const skipRenameBlurRef = useRef<{ type: EditableEntityType; id: string } | null>(null)
  const saveTimerRef = useRef<number | null>(null)
  const toastTimerRef = useRef<number | null>(null)
  const closeImageToolsRef = useRef<() => void>(() => {})
  const closeImageToolsIfSelectedImageMissingRef = useRef<() => void>(() => {})
  const normalizingContentRef = useRef(false)
  const completedTaskDeleteUndoCandidateRef = useRef<{ beforeMarkdown: string; deletedAt: number } | null>(null)
  const completedTaskUndoToastAtRef = useRef(0)
  const lastEditorMarkdownRef = useRef('')
  const lastEditorMarkdownByAisleRef = useRef<Map<string, string>>(new Map())
  const normalizingAisleIdsRef = useRef<Set<string>>(new Set())
  const structuralUndoStackRef = useRef<AisleStructuralHistoryEntry[]>([])
  const structuralRedoStackRef = useRef<AisleStructuralHistoryEntry[]>([])
  const runAisleStructuralHistoryRef = useRef<(direction: 'undo' | 'redo') => boolean>(() => false)
  const activeSpaceIdRef = useRef<string>('')
  const activeDomainIdRef = useRef<string>('')
  const activeTabIdRef = useRef<string>('')
  const activeSubTabIdRef = useRef<string | null>(null)
  const activeAisleIdRef = useRef<string>('')
  const activeNoteLocationKeyRef = useRef<string>('')
  const previousNoteLocationKeyRef = useRef<string>('')
  const pendingCursorRestoreRef = useRef<PendingCursorRestore | null>(null)
  const isMainViewRef = useRef(true)

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
  const activeNoteAisles = useMemo(() => activeNoteBody?.aisles ?? [], [activeNoteBody?.aisles])
  const activeNoteLocation = useMemo<NoteLocation>(
    () => ({
      domainId: state.activeDomainId,
      spaceId: activeSpace.id,
      tabId: activeTab.id,
      subTabId: activeSubTab?.id ?? null,
    }),
    [state.activeDomainId, activeSpace.id, activeTab.id, activeSubTab?.id],
  )
  const activeNoteLocationKey = buildNoteCursorLocationKey(activeNoteLocation)
  const savedCursorLocation = state.ui.noteCursorLocations[activeNoteLocationKey] ?? null
  const savedActiveAisleId =
    savedCursorLocation && activeNoteAisles.some((aisle) => aisle.id === savedCursorLocation.activeAisleId)
      ? savedCursorLocation.activeAisleId
      : ''
  const resolvedActiveAisleId =
    activeNoteAisles.some((aisle) => aisle.id === activeAisleId)
      ? activeAisleId
      : savedActiveAisleId || (activeNoteAisles[0]?.id ?? '')
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
    if (viewMode !== 'main' || !activeNoteBodyId) return
    if (previousNoteLocationKeyRef.current === activeNoteLocationKey) return
    previousNoteLocationKeyRef.current = activeNoteLocationKey

    const savedLocation = state.ui.noteCursorLocations[activeNoteLocationKey] ?? null
    const preferredAisleId =
      savedLocation && activeNoteAisles.some((aisle) => aisle.id === savedLocation.activeAisleId)
        ? savedLocation.activeAisleId
        : activeNoteAisles[0]?.id ?? ''
    if (!preferredAisleId) {
      pendingCursorRestoreRef.current = null
      return
    }

    pendingCursorRestoreRef.current = {
      noteLocationKey: activeNoteLocationKey,
      aisleId: preferredAisleId,
      selection: savedLocation?.aisles[preferredAisleId] ?? null,
    }
    pendingScrollToAisleIdRef.current = preferredAisleId
    if (preferredAisleId !== activeAisleId) {
      setActiveAisleId(preferredAisleId)
    }
  }, [viewMode, activeNoteBodyId, activeNoteLocationKey, activeNoteAisles, activeAisleId, state.ui.noteCursorLocations])

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

  const cloneAisles = (aisles: NoteAisle[]): NoteAisle[] =>
    aisles.map((aisle) => ({ id: aisle.id, markdown: normalizeMarkdownForPersistence(aisle.markdown) }))

  const getAisleSignature = (aisles: NoteAisle[]) =>
    JSON.stringify(aisles.map((aisle) => [aisle.id, normalizeMarkdownForPersistence(aisle.markdown)]))

  const syncNoteBodyAislesInState = (previous: AppState, noteBodyId: string, aisles: NoteAisle[]): AppState => {
    const normalizedAisles = cloneAisles(aisles)
    const firstMarkdown = normalizedAisles[0]?.markdown ?? ''
    const syncTabs = (tabs: typeof previous.spaces[number]['data']['tabs']) =>
      tabs.map((tab) => ({
        ...tab,
        homeContent: tab.noteBodyId === noteBodyId ? firstMarkdown : tab.homeContent,
        subTabs: tab.subTabs.map((subTab) =>
          subTab.noteBodyId === noteBodyId ? { ...subTab, content: firstMarkdown } : subTab,
        ),
      }))
    const syncSpace = (space: typeof previous.spaces[number]) => ({
      ...space,
      data: {
        ...space.data,
        tabs: syncTabs(space.data.tabs),
        deletedTabs: space.data.deletedTabs.map((entry) => ({
          ...entry,
          tab: {
            ...entry.tab,
            homeContent: entry.tab.noteBodyId === noteBodyId ? firstMarkdown : entry.tab.homeContent,
            subTabs: entry.tab.subTabs.map((subTab) =>
              subTab.noteBodyId === noteBodyId ? { ...subTab, content: firstMarkdown } : subTab,
            ),
          },
        })),
        deletedSubTabs: space.data.deletedSubTabs.map((entry) => ({
          ...entry,
          subTab:
            entry.subTab.noteBodyId === noteBodyId ? { ...entry.subTab, content: firstMarkdown } : entry.subTab,
        })),
      },
    })

    return {
      ...previous,
      noteBodies: previous.noteBodies.map((body) =>
        body.id === noteBodyId ? { ...body, aisles: normalizedAisles } : body,
      ),
      domains: previous.domains.map((domain) => ({
        ...domain,
        spaces: domain.spaces.map(syncSpace),
      })),
      spaces: previous.spaces.map(syncSpace),
    }
  }

  const applyNoteLocationToState = (previous: AppState, location: NoteLocation): AppState => {
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
  }

  const updateCursorLocationInState = (
    previous: AppState,
    noteLocationKey: string,
    aisleId: string,
    selection: NoteCursorSelection | null,
    now = Date.now(),
  ): AppState => {
    if (!noteLocationKey || !aisleId) return previous
    const current = previous.ui.noteCursorLocations[noteLocationKey]
    const currentSelection = current?.aisles[aisleId] ?? null
    const nextSelection = selection ? { ...selection, updatedAt: now } : currentSelection
    const nextAisles = nextSelection ? { ...(current?.aisles ?? {}), [aisleId]: nextSelection } : current?.aisles ?? {}
    const nextLocation: NoteCursorLocation = {
      activeAisleId: aisleId,
      aisles: nextAisles,
      updatedAt: now,
    }

    if (
      current &&
      current.activeAisleId === nextLocation.activeAisleId &&
      noteCursorSelectionsEqual(currentSelection, nextSelection)
    ) {
      return previous
    }

    return {
      ...previous,
      ui: {
        ...previous.ui,
        noteCursorLocations: pruneNoteCursorLocations({
          ...previous.ui.noteCursorLocations,
          [noteLocationKey]: nextLocation,
        }),
      },
    }
  }

  const applyActiveCursorToState = (previous: AppState): AppState => {
    if (!isMainViewRef.current) return previous
    const currentEditor = editorRef.current
    const view = getWysiwygView(currentEditor)
    const aisleId = activeAisleIdRef.current
    const noteLocationKey = activeNoteLocationKeyRef.current
    if (!currentEditor || !view || !aisleId || !noteLocationKey) return previous

    const rawSelection = getEditorCursorSelection(currentEditor)
    const selection = rawSelection
      ? clampNoteCursorSelection({ ...rawSelection, updatedAt: Date.now() }, view.state.doc.content.size)
      : null
    return updateCursorLocationInState(previous, noteLocationKey, aisleId, selection)
  }

  const saveActiveCursorLocation = () => {
    setState((previous) => applyActiveCursorToState(previous))
  }

  const saveActiveCursorBeforeNavigation = () => {
    saveActiveCursorLocation()
    flushPendingContent()
  }

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
      return applyActiveCursorToState(applyAutoPurgeToAppState(
        applyMarkdownToAppState(
          nextState,
          pending.spaceId,
          pending.tabId,
          pending.subTabId,
          pending.aisleId,
          pending.markdown,
        ),
      ))
    }

    if (!isMainViewRef.current) return applyAutoPurgeToAppState(nextState)

    if (!editorRef.current) return applyActiveCursorToState(applyAutoPurgeToAppState(nextState))
    const markdown = lastEditorMarkdownRef.current

    nextState = applyMarkdownToAppState(
      nextState,
      activeSpaceIdRef.current,
      activeTabIdRef.current,
      activeSubTabIdRef.current,
      activeAisleIdRef.current,
      markdown,
    )
    return applyActiveCursorToState(applyAutoPurgeToAppState(nextState))
  }

  const captureActiveAisleStructuralSnapshot = (sourceState = buildStateWithLatestEditorContent()): AisleStructuralSnapshot | null => {
    const location: NoteLocation = {
      domainId: activeDomainIdRef.current,
      spaceId: activeSpaceIdRef.current,
      tabId: activeTabIdRef.current,
      subTabId: activeSubTabIdRef.current,
    }
    const locationInfo = getLocationInfo(sourceState, location)
    const body = sourceState.noteBodies.find((candidate) => candidate.id === locationInfo.noteBodyId) ?? null
    if (!locationInfo.noteBodyId || !body) return null
    const locationKey = buildNoteCursorLocationKey(location)
    return {
      location,
      locationKey,
      noteBodyId: locationInfo.noteBodyId,
      aisles: cloneAisles(body.aisles),
      activeAisleId: activeAisleIdRef.current,
      cursorLocation: sourceState.ui.noteCursorLocations[locationKey] ?? null,
    }
  }

  const pushAisleStructuralHistory = (
    type: AisleStructuralHistoryEntry['type'],
    before: AisleStructuralSnapshot,
    after: AisleStructuralSnapshot,
  ) => {
    if (before.noteBodyId !== after.noteBodyId) return
    structuralUndoStackRef.current = [
      ...structuralUndoStackRef.current.slice(-99),
      {
        type,
        noteBodyId: before.noteBodyId,
        before,
        after,
        beforeSignature: getAisleSignature(before.aisles),
        afterSignature: getAisleSignature(after.aisles),
      },
    ]
    structuralRedoStackRef.current = []
  }

  const getCurrentAisleSignature = (entry: AisleStructuralHistoryEntry) => {
    const body = stateRef.current.noteBodies.find((candidate) => candidate.id === entry.noteBodyId) ?? null
    return body ? getAisleSignature(body.aisles) : ''
  }

  const canApplyAisleStructuralEntry = (entry: AisleStructuralHistoryEntry, direction: 'undo' | 'redo') => {
    const expectedSignature = direction === 'undo' ? entry.afterSignature : entry.beforeSignature
    return getCurrentAisleSignature(entry) === expectedSignature
  }

  const applyCursorLocationSnapshot = (
    previous: AppState,
    snapshot: AisleStructuralSnapshot,
  ): AppState => {
    if (!snapshot.cursorLocation) return previous
    return {
      ...previous,
      ui: {
        ...previous.ui,
        noteCursorLocations: pruneNoteCursorLocations({
          ...previous.ui.noteCursorLocations,
          [snapshot.locationKey]: snapshot.cursorLocation,
        }),
      },
    }
  }

  const applyAisleStructuralEntry = (entry: AisleStructuralHistoryEntry, direction: 'undo' | 'redo') => {
    if (!canApplyAisleStructuralEntry(entry, direction)) return false
    saveActiveCursorLocation()

    const target = direction === 'undo' ? entry.before : entry.after
    const source = direction === 'undo' ? entry.after : entry.before
    setState((previous) => {
      const body = previous.noteBodies.find((candidate) => candidate.id === entry.noteBodyId) ?? null
      if (!body || getAisleSignature(body.aisles) !== getAisleSignature(source.aisles)) return previous
      const withAisles = syncNoteBodyAislesInState(previous, entry.noteBodyId, target.aisles)
      const withLocation = applyNoteLocationToState(withAisles, target.location)
      return applyCursorLocationSnapshot(withLocation, target)
    })

    setViewMode('main')
    setActiveAisleId(target.activeAisleId)
    pendingScrollToAisleIdRef.current = target.activeAisleId
    pendingFocusToAisleIdRef.current = target.activeAisleId
    pendingCursorRestoreRef.current = {
      noteLocationKey: target.locationKey,
      aisleId: target.activeAisleId,
      selection: target.cursorLocation?.aisles[target.activeAisleId] ?? null,
    }
    setContextMenu(null)
    setMenuOpen(false)
    setEditing(null)
    exitAisleDeleteMode()
    return true
  }

  const runAisleStructuralHistory = (direction: 'undo' | 'redo') => {
    const sourceStack = direction === 'undo' ? structuralUndoStackRef.current : structuralRedoStackRef.current
    const entry = sourceStack[sourceStack.length - 1]
    if (!entry || !applyAisleStructuralEntry(entry, direction)) return false
    if (direction === 'undo') {
      structuralUndoStackRef.current = structuralUndoStackRef.current.slice(0, -1)
      structuralRedoStackRef.current = [...structuralRedoStackRef.current, entry]
    } else {
      structuralRedoStackRef.current = structuralRedoStackRef.current.slice(0, -1)
      structuralUndoStackRef.current = [...structuralUndoStackRef.current, entry]
    }
    return true
  }
  runAisleStructuralHistoryRef.current = runAisleStructuralHistory

  const scheduleAisleStructuralHistoryFallback = (direction: 'undo' | 'redo') => {
    const noteHistoryKey = getActiveNoteHistoryKey()
    const editorAtStart = editorRef.current
    const beforeMarkdown = editorAtStart ? getNormalizedEditorMarkdown(editorAtStart) : null
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (noteHistoryKey !== getActiveNoteHistoryKey()) return
        const editorAfter = editorRef.current
        const afterMarkdown = editorAfter ? getNormalizedEditorMarkdown(editorAfter) : null
        if (beforeMarkdown !== null && afterMarkdown !== beforeMarkdown) return
        runAisleStructuralHistoryRef.current(direction)
      })
    })
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
    flushPendingContent: saveActiveCursorBeforeNavigation,
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

  const addAisleToActiveNote = (
    markdown = '',
    options: { beforeSnapshot?: AisleStructuralSnapshot | null; recordHistory?: boolean } = {},
  ) => {
    if (!activeNoteBodyId) return
    const currentAisleCount = activeNoteBody?.aisles.length ?? 0
    if (currentAisleCount <= 0) return
    if (currentAisleCount >= MAX_NOTE_AISLES) {
      pushToast(`notes can have at most ${MAX_NOTE_AISLES} aisles.`, 'warning')
      return
    }

    const beforeSnapshot = options.beforeSnapshot ?? captureActiveAisleStructuralSnapshot()
    if (!beforeSnapshot) return
    const newAisle: NoteAisle = { id: createId(), markdown: normalizeMarkdownForPersistence(markdown) }
    const latestBeforeAddState = buildStateWithLatestEditorContent()
    const latestBeforeAddBody =
      latestBeforeAddState.noteBodies.find((candidate) => candidate.id === beforeSnapshot.noteBodyId) ?? null
    const baseAisles = latestBeforeAddBody ? cloneAisles(latestBeforeAddBody.aisles) : beforeSnapshot.aisles
    flushPendingContent()
    const afterAisles = [...baseAisles, newAisle]
    const afterCursorLocation: NoteCursorLocation = {
      activeAisleId: newAisle.id,
      aisles: {
        ...(beforeSnapshot.cursorLocation?.aisles ?? {}),
        [newAisle.id]: {
          anchor: 1,
          head: 1,
          updatedAt: Date.now(),
        },
      },
      updatedAt: Date.now(),
    }
    const afterSnapshot: AisleStructuralSnapshot = {
      ...beforeSnapshot,
      aisles: afterAisles,
      activeAisleId: newAisle.id,
      cursorLocation: afterCursorLocation,
    }
    setState((previous) => {
      const body = previous.noteBodies.find((candidate) => candidate.id === activeNoteBodyId)
      if (!body) return previous
      if (body.aisles.length >= MAX_NOTE_AISLES) return previous
      const withAisles = syncNoteBodyAislesInState(previous, activeNoteBodyId, [...body.aisles, newAisle])
      return applyCursorLocationSnapshot(withAisles, afterSnapshot)
    })
    if (options.recordHistory !== false) {
      pushAisleStructuralHistory('add-aisle', beforeSnapshot, afterSnapshot)
    }
    setActiveAisleId(newAisle.id)
    pendingScrollToAisleIdRef.current = newAisle.id
    pendingFocusToAisleIdRef.current = newAisle.id
    exitAisleDeleteMode()
  }

  const deleteAisleFromActiveNote = (aisleId: string) => {
    if (!activeNoteBody) return
    if (activeNoteBody.aisles.length <= 1) {
      pushToast('a note must keep at least one aisle.', 'warning')
      return
    }

    if (!activeNoteBody.aisles.some((candidate) => candidate.id === aisleId)) return
    const beforeSnapshot = captureActiveAisleStructuralSnapshot()
    if (!beforeSnapshot) return
    flushPendingContent()
    const fallbackAisleId =
      beforeSnapshot.activeAisleId === aisleId
        ? beforeSnapshot.aisles.find((candidate) => candidate.id !== aisleId)?.id ?? ''
        : beforeSnapshot.activeAisleId
    const afterAisles = beforeSnapshot.aisles.filter((candidate) => candidate.id !== aisleId)
    const afterAisleCursors = { ...(beforeSnapshot.cursorLocation?.aisles ?? {}) }
    delete afterAisleCursors[aisleId]
    const afterCursorLocation: NoteCursorLocation = {
      activeAisleId: fallbackAisleId,
      aisles: afterAisleCursors,
      updatedAt: Date.now(),
    }
    const afterSnapshot: AisleStructuralSnapshot = {
      ...beforeSnapshot,
      aisles: afterAisles,
      activeAisleId: fallbackAisleId,
      cursorLocation: afterCursorLocation,
    }
    setAisleDeleteConfirmation(null)
    setState((previous) => {
      const body = previous.noteBodies.find((candidate) => candidate.id === activeNoteBody.id)
      if (!body || body.aisles.length <= 1) return previous
      const withAisles = syncNoteBodyAislesInState(
        previous,
        activeNoteBody.id,
        body.aisles.filter((candidate) => candidate.id !== aisleId),
      )
      return applyCursorLocationSnapshot(withAisles, afterSnapshot)
    })
    pushAisleStructuralHistory('delete-aisle', beforeSnapshot, afterSnapshot)
    if (activeAisleIdRef.current === aisleId) {
      setActiveAisleId(fallbackAisleId)
      pendingScrollToAisleIdRef.current = fallbackAisleId
      pendingFocusToAisleIdRef.current = fallbackAisleId
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
      if (!runAisleStructuralHistoryRef.current(direction)) return
      event.preventDefault()
      event.stopPropagation()
    }

    window.addEventListener('keydown', handleStructuralHistoryKeydown, true)
    return () => window.removeEventListener('keydown', handleStructuralHistoryKeydown, true)
  }, [viewMode, getEditorHistoryDirection])

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
  const closeToolbarPopovers = editorToolbar.closeToolbarPopovers
  const getToolbarFormatShortcut = editorToolbar.getToolbarFormatShortcut
  const queueToolbarShortcutFeedback = editorToolbar.queueToolbarShortcutFeedback
  const syncToolbarFormatState = editorToolbar.syncToolbarFormatState
  const scheduleToolbarFormatStateSync = editorToolbar.scheduleToolbarFormatStateSync

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

  const aisleEditors = useAisleEditors({
    viewMode,
    activeNoteBodyId,
    activeNoteAisles,
    resolvedActiveAisleId,
    activeAisleId,
    setActiveAisleId,
    editorRef,
    multiLineCursorPluginKeyRef,
    lastEditorMarkdownRef,
    lastEditorMarkdownByAisleRef,
    normalizingContentRef,
    normalizingAisleIdsRef,
    pendingContentRef,
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

  useEffect(() => {
    const pendingAisleId = pendingFocusToAisleIdRef.current
    const pendingCursorRestore = pendingCursorRestoreRef.current
    const restoreAisleId =
      pendingCursorRestore?.noteLocationKey === activeNoteLocationKey ? pendingCursorRestore.aisleId : ''
    const targetAisleId = pendingAisleId || restoreAisleId
    if (viewMode !== 'main' || !activeNoteBodyId || !targetAisleId) return
    if (pendingCreatedEditRef.current) return

    const animationFrame = window.requestAnimationFrame(() => {
      const editorKey = buildAisleEditorKey(activeNoteBodyId, targetAisleId)
      if (activateAisleEditor(editorKey, { focus: true })) {
        if (pendingFocusToAisleIdRef.current === targetAisleId) {
          pendingFocusToAisleIdRef.current = null
        }
        const pending = pendingCursorRestoreRef.current
        if (pending?.noteLocationKey === activeNoteLocationKey && pending.aisleId === targetAisleId) {
          if (pending.selection) {
            restoreEditorCursorSelection(editorRef.current, pending.selection)
          }
          pendingCursorRestoreRef.current = null
        }
      }
    })

    return () => window.cancelAnimationFrame(animationFrame)
  }, [viewMode, activeNoteBodyId, activeNoteAisles.length, resolvedActiveAisleId, activeNoteLocationKey, editing])

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
  closeImageToolsRef.current = closeImageTools
  closeImageToolsIfSelectedImageMissingRef.current = closeImageToolsIfSelectedImageMissing

  const runActiveEditorCommand = (command: string, payload?: Record<string, unknown>) => {
    const currentEditor = editorRef.current
    if (!currentEditor) return false
    currentEditor.focus()
    if (command === 'dashList' || command === 'bulletList' || command === 'orderedList' || command === 'taskList') {
      applyListToolbarCommand(currentEditor, command as ToolbarListCommand)
    } else {
      getCommandCapableEditor(currentEditor).exec(command, payload)
    }
    window.setTimeout(() => {
      if (editorRef.current === currentEditor) {
        commitActiveEditorMarkdownNow(currentEditor)
        syncToolbarFormatState()
      }
    }, 0)
    return true
  }

  const runActiveNewlineOperation = (operation: NewlineOperationId) => {
    const currentEditor = editorRef.current
    if (!currentEditor) return false
    if (operation === 'operationsMenu') {
      openNewlineOperationsMenu()
      return true
    }
    if (operation === 'aisle' && activeNoteAisles.length >= MAX_NOTE_AISLES) {
      pushToast(`notes can have at most ${MAX_NOTE_AISLES} aisles.`, 'warning')
      return false
    }

    const beforeAisleSnapshot = operation === 'aisle' ? captureActiveAisleStructuralSnapshot() : null
    const result = applyEditorNewlineOperation(currentEditor, operation)
    if (!result.handled) return false

    commitActiveEditorMarkdownNow(currentEditor)
    syncToolbarFormatState()
    if (operation === 'aisle') {
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

  const runNewlineOperationFromMenu = (operation: NewlineOperationId) => {
    setNewlineOperationsMenuActiveIndex(0)
    setNewlineOperationsMenu(null)
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
        setNewlineOperationsMenuActiveIndex(0)
        setNewlineOperationsMenu(null)
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
      setNewlineOperationsMenuActiveIndex(0)
      setNewlineOperationsMenu(null)
    }

    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('pointerdown', handlePointerDown, true)
    }
  }, [newlineOperationsMenu, newlineOperationsMenuActiveIndex])

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

  const deleteContextPreview = (tokenId: string) => {
    const markdown = getActiveEditorMarkdown()
    const nextMarkdown = removeContextTokenById(markdown, tokenId)
    if (nextMarkdown === markdown) {
      pushToast('note preview not found.', 'warning')
      return
    }
    replaceActiveEditorMarkdown(nextMarkdown)
    pushToast('note preview deleted.', 'success')
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
    getEditorHistoryDirection,
    onEditorSelectionChange: saveActiveCursorLocation,
    onEditorHistoryFallback: scheduleAisleStructuralHistoryFallback,
    onRunNewlineOperation: runActiveNewlineOperation,
    onOpenNewlineOperationsMenu: openNewlineOperationsMenu,
    scheduleMultiLineHistoryRestore,
    tryExpandMultilineSelection,
    tryApplyMultiLineEditInput,
    tryApplyMultiLineTabInput,
    tryMoveMultiLineCursors,
    tryApplyMultilineIndent,
    copyMultiLineSelectionToClipboard,
    cutMultiLineSelectionToClipboard,
  })

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
      }
    }
  }, [])

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
    saveActiveCursorBeforeNavigation()
    pendingFocusToAisleIdRef.current = null
    pendingCursorRestoreRef.current = null
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
    saveActiveCursorBeforeNavigation()
    pendingFocusToAisleIdRef.current = null
    pendingCursorRestoreRef.current = null
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
    saveActiveCursorBeforeNavigation()
    closeImageTools()
    updateActiveSpaceData((data) => ({
      ...data,
      activeTabId: tabId,
      tabs: data.tabs.map((tab) => (tab.id === tabId ? { ...tab, activeSubTabId: null } : tab)),
    }))
  }

  const selectSubTab = (subTabId: string) => {
    if (activeTab.activeSubTabId === subTabId) return
    saveActiveCursorBeforeNavigation()
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
    saveActiveCursorBeforeNavigation()
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
    flushPendingContent: saveActiveCursorBeforeNavigation,
    exitArrangeMode,
    returnToLastTabLikeView,
    selectTab,
    buildStateWithLatestEditorContent,
    pushToast,
  })

  const openSpace = (spaceId: string) => {
    saveActiveCursorBeforeNavigation()
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
    saveActiveCursorBeforeNavigation()
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
    saveActiveCursorBeforeNavigation()
    if (arrangeMode.active) {
      exitArrangeMode()
    }
    setViewMode('spaces')
    setMenuOpen(false)
    setContextMenu(null)
  }

  const openDomainsView = () => {
    saveActiveCursorBeforeNavigation()
    if (arrangeMode.active) {
      exitArrangeMode()
    }
    setViewMode('domains')
    setMenuOpen(false)
    setContextMenu(null)
    setEditing(null)
  }

  const openDomain = (domainId: string) => {
    saveActiveCursorBeforeNavigation()
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
    saveActiveCursorBeforeNavigation()
    const newDomain = createDomain('New Domain')
    setState((previous) => addDomain(previous, newDomain))
    setViewMode('domains')
    setEditing({ type: 'domain', id: newDomain.id })
    setMenuOpen(false)
    setContextMenu(null)
  }

  const toggleTrashView = () => {
    saveActiveCursorBeforeNavigation()
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
    saveActiveCursorBeforeNavigation()
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
    saveActiveCursorBeforeNavigation()
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
    saveActiveCursorBeforeNavigation()
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
    saveActiveCursorBeforeNavigation()
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
    saveActiveCursorBeforeNavigation()
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
    aisleDeleteMode,
    aisleDeleteConfirmation,
    activeNoteAisles,
    aisleDeleteConfirmButtonRef,
    setNoteToolsOpen,
    setHeadingMenuOpen,
    setToolbarPopoverPosition,
    setAisleDeleteMode,
    setAisleDeleteConfirmation,
    refreshToolbarPopoverPosition,
    runActiveEditorCommand,
    commitActiveEditorMarkdownNow,
    insertLinkIntoActiveEditor,
    clearActiveNoteContent,
    openNoteReferenceModal,
    addAisleToActiveNote,
    deleteAisleFromActiveNote,
    pushToast,
  })

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
        onCloseNotePopovers={closeToolbarPopovers}
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
          newlineShortcutDrafts={settingsController.newlineShortcutDrafts}
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
          onNewlineShortcutChange={settingsController.updateNewlineShortcutSetting}
          onOpenNewlineMenuSettings={() => setModal({ type: 'newline-menu-settings' })}
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
              toolbar={editorToolbarLayer.toolbar}
              headingPopover={editorToolbarLayer.popovers}
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
              onActivateAisle={(editorKey) => {
                pendingCursorRestoreRef.current = null
                activateAisleEditor(editorKey, { flushPrevious: true })
              }}
              onRegisterAisleEditorRoot={registerAisleEditorRoot}
              onRequestDeleteAisle={requestDeleteAisleFromActiveNote}
            />
          ) : (
            renderEditorShell()
          )}
        </>
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
        newlineMenuOperations={settingsController.newlineMenuOperationsDraft}
        onModalChange={setModal}
        onNewlineMenuOperationsChange={settingsController.updateNewlineMenuOperationsSetting}
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
