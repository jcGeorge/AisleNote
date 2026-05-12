export type AppTheme = 'dark' | 'light' | 'dusk'
export type ViewMode = 'domains' | 'spaces' | 'main' | 'trash' | 'settings' | 'stage-manager'
export type ShortcutId =
  | 'toggleTabTrash'
  | 'openDomains'
  | 'openSpaces'
  | 'newTab'
  | 'newSubTab'
  | 'cycleSubTabNext'
  | 'cycleSubTabPrev'
export type SettingsSection = 'hotkeys' | 'data' | 'visuals'

export type SubTab = {
  id: string
  title: string
  content: string
}

export type Tab = {
  id: string
  title: string
  homeContent: string
  activeSubTabId: string | null
  subTabs: SubTab[]
}

export type DeletedSubTabEntry = {
  id: string
  parentTabId: string
  parentTabTitle: string
  subTab: SubTab
  deletedAt: number
}

export type DeletedTabEntry = {
  id: string
  tab: Tab
  deletedAt: number
}

export type WorkspaceData = {
  activeTabId: string
  tabs: Tab[]
  deletedTabs: DeletedTabEntry[]
  deletedSubTabs: DeletedSubTabEntry[]
}

export type SpaceSettings = {
  autoRemoveDeletedDays: number
}

export type Space = {
  id: string
  name: string
  settings: SpaceSettings
  data: WorkspaceData
}

export type Domain = {
  id: string
  name: string
  activeSpaceId: string
  spaces: Space[]
}

export type AppState = {
  theme: AppTheme
  activeDomainId: string
  domains: Domain[]
  /** Transitional projection of the active domain. Remove after App.tsx is fully domain-scoped. */
  activeSpaceId: string
  /** Transitional projection of the active domain. Remove after App.tsx is fully domain-scoped. */
  spaces: Space[]
  hotkeys: {
    shortcuts: Record<ShortcutId, string>
    enableMouseBackForward: boolean
    enableGenericHistoryHotkeys: boolean
  }
  ui: {
    showParentHomeTab: boolean
    stageManagerOpenDestinationAfterApply: boolean
    tabButtonScale: number
    noteFontScale: number
  }
}

export type PendingContent = {
  spaceId: string
  tabId: string
  subTabId: string | null
  markdown: string
}

export type PendingCreatedEdit =
  | { type: 'tab'; id: string; previousTabId: string }
  | { type: 'subtab'; id: string; parentTabId: string; previousSubTabId: string | null }

export type ArrangeSource = 'context' | 'press'
export type ArrangeInsertPosition = 'before' | 'after'
export type ArrangeScope = 'tabs' | 'spaces'

export type ArrangeDragItem =
  | { type: 'tab'; tabId: string }
  | { type: 'subtab'; parentTabId: string; subTabId: string }
  | { type: 'space'; spaceId: string }

export type TabArrangeDragItem = Exclude<ArrangeDragItem, { type: 'space' }>

export type ArrangeModeState = {
  active: boolean
  scope: ArrangeScope | null
  source: ArrangeSource | null
  dragItem: ArrangeDragItem | null
  overParentTabId: string | null
  overParentInsert: ArrangeInsertPosition | null
  overSubTabId: string | null
  overSubTabInsert: ArrangeInsertPosition | null
  overSpaceId: string | null
  overSpaceInsert: ArrangeInsertPosition | null
}

export type ArrangeTapCandidate =
  | { key: string; type: 'tab'; tabId: string; startX: number; startY: number; dragged: boolean }
  | { key: string; type: 'subtab'; subTabId: string; startX: number; startY: number; dragged: boolean }
  | { key: string; type: 'space'; spaceId: string; startX: number; startY: number; dragged: boolean }
  | { key: string; type: 'home'; startX: number; startY: number; dragged: boolean }

export type ArrangeTapCandidateSeed =
  | { key: string; type: 'tab'; tabId: string }
  | { key: string; type: 'subtab'; subTabId: string }
  | { key: string; type: 'space'; spaceId: string }
  | { key: string; type: 'home' }

export type ArrangeDragSeed = {
  key: string
  startX: number
  startY: number
}

export type SpaceArrangeDragPreview = {
  spaceId: string
  label: string
  currentX: number
  currentY: number
  offsetX: number
  offsetY: number
  width: number
  height: number
}

export type TabArrangeDragPreview = {
  item: TabArrangeDragItem
  label: string
  variant: 'parent' | 'subtab'
  currentX: number
  currentY: number
  offsetX: number
  offsetY: number
  width: number
  height: number
}

export type StageManagerStep = 'select' | 'action' | 'configure' | 'review'
export type StageManagerAction = 'migrate' | 'promote' | 'demote' | 'mass-delete'
export type StageManagerPartialDirection = 'toward-none' | 'toward-all'
export type StageManagerParentSelectionMode = 'none' | 'partial' | 'full'
export type StageManagerPromoteSpaceMode = 'existing' | 'new'
export type StageManagerDestinationSpaceMode = 'existing' | 'new'
export type StageManagerDestinationParentMode = 'existing' | 'new'
export type StageManagerMigrateTarget = 'space' | 'parent'
export type StageManagerMigrateParentSpaceMode = 'current' | 'existing' | 'new'
export type StageManagerStrayHandlingMode = 'promote' | 'selected-parent' | 'existing-parent' | 'new-parent'
export type StageManagerMassDeleteMode = 'trash' | 'permanent'

export type StageManagerParentSelection = {
  mode: StageManagerParentSelectionMode
  selectedSubTabIds: string[]
  cachedPartialSubTabIds: string[] | null
  partialDirection: StageManagerPartialDirection | null
}

export type StageManagerSelectionState = Record<string, StageManagerParentSelection>

export type StageManagerDraft = {
  promoteSpaceMode: StageManagerPromoteSpaceMode
  promoteSpaceId: string
  newSpaceName: string
  demoteParentMode: StageManagerDestinationParentMode
  demoteParentId: string
  demoteNewParentName: string
  migrateTarget: StageManagerMigrateTarget
  migrateSpaceMode: StageManagerDestinationSpaceMode
  migrateSpaceId: string
  migrateParentSpaceMode: StageManagerMigrateParentSpaceMode
  migrateParentSpaceId: string
  migrateParentMode: StageManagerDestinationParentMode
  migrateParentId: string
  migrateNewParentName: string
  strayHandlingMode: StageManagerStrayHandlingMode
  straySelectedParentId: string
  strayExistingParentId: string
  strayNewParentName: string
  massDeleteMode: StageManagerMassDeleteMode
}

export type StageManagerSelectionSnapshot = {
  fullParents: Tab[]
  partialParents: Array<{ tab: Tab; selectedSubTabs: SubTab[] }>
  looseSubTabs: Array<{ parentTab: Tab; subTab: SubTab }>
  fullParentIds: Set<string>
  hasSelection: boolean
}

export type ToastTone = 'success' | 'warning' | 'error'

export type ToastState = {
  id: number
  message: string
  tone: ToastTone
  durationMs: number
}

export type ImageToolsState = {
  visible: boolean
  cropTop: number
  cropLeft: number
  resizeTop: number
  resizeLeft: number
}

export type InlineCropState = {
  active: boolean
  relX: number
  relY: number
  relWidth: number
  relHeight: number
  top: number
  left: number
  width: number
  height: number
}

export type LinkPromptState = {
  open: boolean
  top: number
  left: number
  url: string
  text: string
}

export type MultiLineEditState = {
  anchorBlockIndex: number
  headBlockIndex: number
  columnOffset: number
  columnOffsets?: Record<number, number>
  cursorBlockIndices?: number[]
  selectionAnchorOffsets?: Record<number, number>
}

export type EditorTextLineRange = {
  start: number
  end: number
  length: number
  text: string
  nodeType?: string
}

export type ContextMenuState =
  | { x: number; y: number; type: 'tab'; tabId: string }
  | { x: number; y: number; type: 'subtab'; tabId: string; subTabId: string }
  | { x: number; y: number; type: 'image' }
  | {
      x: number
      y: number
      type: 'trash-tab'
      source: 'deleted-tab' | 'subtabs-only'
      deletedTabEntryId: string | null
      parentTabId: string
    }
  | {
      x: number
      y: number
      type: 'trash-subtab'
      source: 'deleted-tab' | 'subtabs-only'
      deletedTabEntryId: string | null
      parentTabId: string
      subTabId: string
    }
  | { x: number; y: number; type: 'space'; spaceId: string }
  | { x: number; y: number; type: 'domain'; domainId: string }

export type DeleteTarget =
  | { type: 'tab'; tabId: string }
  | { type: 'subtab'; tabId: string; subTabId: string }
  | { type: 'trash-tab'; source: 'deleted-tab' | 'subtabs-only'; deletedTabEntryId: string | null; parentTabId: string }
  | {
      type: 'trash-subtab'
      source: 'deleted-tab' | 'subtabs-only'
      deletedTabEntryId: string | null
      parentTabId: string
      subTabId: string
    }
  | { type: 'space'; spaceId: string }

export type ModalState =
  | { type: 'delete-target'; target: DeleteTarget; permanent: boolean }
  | { type: 'trash-delete-all' }
  | { type: 'trash-restore-all' }
  | { type: 'export-space'; spaceId: string }

export type TrashParentBucket = {
  id: string
  title: string
  source: 'deleted-tab' | 'subtabs-only'
  deletedTabEntryId: string | null
  parentTabId: string
  homeContent: string
  subTabs: SubTab[]
}

export type NavLocation = {
  viewMode: ViewMode
  activeSpaceId: string
  mainTabId: string
  mainSubTabId: string | null
  trashTabId: string
  trashSubTabId: string | null
}
