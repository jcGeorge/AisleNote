export type AppTheme = 'dark' | 'light' | 'dawn' | 'blues' | 'custom'
export type CustomThemePaletteSlot =
  | 'canvas'
  | 'page'
  | 'surface'
  | 'surfaceRaised'
  | 'text'
  | 'mutedText'
  | 'border'
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'warning'
  | 'success'
export type CustomThemePalette = Record<CustomThemePaletteSlot, string>
export type ViewMode = 'domains' | 'spaces' | 'main' | 'trash' | 'settings' | 'stage-manager'
export type ShortcutId =
  | 'toggleTabTrash'
  | 'openDomains'
  | 'openSpaces'
  | 'newTab'
  | 'newSubTab'
  | 'formatStrikethrough'
  | 'cycleParentTabNext'
  | 'cycleParentTabPrev'
  | 'cycleSubTabNext'
  | 'cycleSubTabPrev'
export type SettingsSection = 'hotkeys' | 'shortcuts' | 'data' | 'visuals' | 'frontmatter'

export type NewlineOperationId =
  | 'normalNewLine'
  | 'task'
  | 'dashList'
  | 'bulletList'
  | 'numberedList'
  | 'aisle'
  | 'horizontalLine'
  | 'codeBlock'
  | 'inlineCode'
  | 'blockQuote'
  | 'blockIndent'
  | 'strikethrough'
  | 'operationsMenu'

export type NewlineShortcutId = 'controlEnter' | 'shiftEnter' | 'commandEnter'

export type NewlineShortcutSettings = {
  shortcuts: Record<NewlineShortcutId, NewlineOperationId>
  menuOperations: NewlineOperationId[]
}

export type NoteAisle = {
  id: string
  markdown: string
}

export type FrontmatterValue = unknown
export type FrontmatterData = Record<string, FrontmatterValue>
export type FrontmatterFieldType = 'text' | 'number' | 'boolean' | 'date' | 'datetime' | 'list'
export type FrontmatterComputedValue = 'none' | 'createdAt' | 'updatedAt' | 'noteTitle' | 'spaceName' | 'domainName'

export type FrontmatterTemplateField = {
  id: string
  key: string
  type: FrontmatterFieldType
  defaultValue: string
  computed: FrontmatterComputedValue
}

export type FrontmatterTemplate = {
  id: string
  name: string
  fields: FrontmatterTemplateField[]
}

export type FrontmatterSettings = {
  templates: FrontmatterTemplate[]
  settingsTemplateId: string
  lastAppliedTemplateId: string
}

export type FrontmatterFieldOrigin = {
  templateId: string
  fieldId: string
}

export type FrontmatterFieldOriginMap = Record<string, FrontmatterFieldOrigin>
export type FrontmatterComputedFieldMap = Record<string, FrontmatterComputedValue>

export type FrontmatterSaveOptions = {
  templateId: string | null
  templateDerived: boolean
  templateFieldOrigins: FrontmatterFieldOriginMap
  templateRemovedFieldIds?: string[]
  computedFields?: FrontmatterComputedFieldMap
}

export type NoteBody = {
  id: string
  createdAt?: string
  updatedAt?: string
  aisles: NoteAisle[]
  frontmatter: FrontmatterData | null
  frontmatterTemplateId?: string
  frontmatterTemplateDerived?: boolean
  frontmatterTemplateFieldOrigins?: FrontmatterFieldOriginMap
  frontmatterTemplateRemovedFieldIds?: string[]
  frontmatterComputedFields?: FrontmatterComputedFieldMap
  /** Legacy row-level template behavior. Ignored by the current frontmatter modal. */
  frontmatterTemplateDetachedKeys?: string[]
}

export type FrontmatterRowDraft = {
  id: string
  key: string
  type: FrontmatterFieldType
  value: string
  computed: FrontmatterComputedValue
  computedEnabled?: boolean
  computedLocked?: boolean
  locked: boolean
  templateFieldId?: string
  derived?: boolean
}

export type NoteLocation = {
  domainId: string
  spaceId: string
  tabId: string
  subTabId: string | null
}

export type NoteCursorEndpoint = {
  blockIndex: number
  offset: number
}

export type NoteCursorSelection = {
  anchor: number
  head: number
  anchorBlock?: NoteCursorEndpoint
  headBlock?: NoteCursorEndpoint
  updatedAt: number
}

export type NoteCursorLocation = {
  activeAisleId: string
  aisles: Record<string, NoteCursorSelection>
  updatedAt: number
}

export type SubTab = {
  id: string
  title: string
  noteBodyId: string
  /** Legacy mirror for older persisted states and export fallbacks. */
  content: string
}

export type Tab = {
  id: string
  title: string
  noteBodyId: string
  /** Legacy mirror for older persisted states and export fallbacks. */
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
  noteBodies: NoteBody[]
  /** Transitional projection of the active domain. Remove after App.tsx is fully domain-scoped. */
  activeSpaceId: string
  /** Transitional projection of the active domain. Remove after App.tsx is fully domain-scoped. */
  spaces: Space[]
  hotkeys: {
    shortcuts: Record<ShortcutId, string>
    newlineShortcuts: NewlineShortcutSettings
    enableMouseBackForward: boolean
    enableGenericHistoryHotkeys: boolean
  }
  frontmatter: FrontmatterSettings
  ui: {
    showParentHomeTab: boolean
    stageManagerOpenDestinationAfterApply: boolean
    lastLinkInsertMode?: LinkInsertMode
    tabButtonScale: number
    noteFontScale: number
    settingsSection: SettingsSection
    customThemePalette: CustomThemePalette | null
    noteCursorLocations: Record<string, NoteCursorLocation>
  }
}

export type PendingContent = {
  spaceId: string
  tabId: string
  subTabId: string | null
  aisleId: string
  markdown: string
}

export type PendingCreatedEdit =
  | { type: 'tab'; id: string; previousTabId: string }
  | { type: 'subtab'; id: string; parentTabId: string; previousSubTabId: string | null }

export type ArrangeSource = 'context' | 'press'
export type ArrangeInsertPosition = 'before' | 'after'
export type ArrangeScope = 'tabs' | 'spaces'
export type TabSortMode = 'alpha-asc' | 'alpha-desc' | 'created-asc' | 'created-desc' | 'updated-asc' | 'updated-desc'
export type StageManagerDestinationSortMode = 'default' | TabSortMode
export type TabSortTarget = 'parents' | 'subtabs'
export type LinkInsertMode = 'note' | 'url'
export type NoteReferenceInsertKind = 'link' | 'context'

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
export type StageManagerAction = 'migrate' | 'promote' | 'demote' | 'frontmatter' | 'mass-delete'
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
  promoteDomainId: string
  promoteSpaceMode: StageManagerPromoteSpaceMode
  promoteSpaceId: string
  newSpaceName: string
  demoteDomainId: string
  demoteSpaceId: string
  demoteParentMode: StageManagerDestinationParentMode
  demoteParentId: string
  demoteNewParentName: string
  migrateTarget: StageManagerMigrateTarget
  migrateDomainId: string
  migrateSpaceMode: StageManagerDestinationSpaceMode
  migrateSpaceId: string
  migrateParentDomainId: string
  migrateParentSpaceMode: StageManagerMigrateParentSpaceMode
  migrateParentSpaceId: string
  migrateParentMode: StageManagerDestinationParentMode
  migrateParentId: string
  migrateNewParentName: string
  strayHandlingMode: StageManagerStrayHandlingMode
  straySelectedParentId: string
  strayExistingParentId: string
  strayNewParentName: string
  destinationSortMode: StageManagerDestinationSortMode
  frontmatterTemplateId: string
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

export type StorageProfileStatus = {
  status: 'ready' | 'error'
  health?: 'healthy' | 'warning' | 'error'
  issues?: Array<{
    code: string
    severity: 'warning' | 'error'
    path?: string
    message: string
  }>
  event?: string
  profileRootPath: string
  notesDataPath: string
  isDefault: boolean
  hasProfile: boolean
  canWrite: boolean
  source?: 'hybrid' | 'legacy' | 'empty'
  schemaVersion?: number | null
  conflicts?: string[]
  revision?: number
  recoverySnapshotCount?: number
  latestRecoverySnapshotPath?: string
  error?: string
}

export type ImageToolsState = {
  visible: boolean
  menuMode: 'start' | 'transform'
  toolbarTop: number
  toolbarLeft: number
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
  urlEditable?: boolean
  editRange?: {
    from: number
    to: number
    href: string
  } | null
}

export type LinkEditRange = {
  from: number
  to: number
  href: string
}

export type InternalNoteLinkEdit = {
  label: string
  href: string
  target: NoteLocation
  from?: number
  to?: number
  occurrence?: number
  range?: LinkEditRange | null
}

export type MultiLineEditState = {
  anchorBlockIndex: number
  headBlockIndex: number
  columnOffset: number
  columnOffsets?: Record<number, number>
  cursorBlockIndices?: number[]
  selectionAnchorOffsets?: Record<number, number>
  activeInlineFormats?: MultiLineInlineFormat[]
}

export type MultiLineInlineFormat = 'bold' | 'italic' | 'strike'

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
  | { x: number; y: number; type: 'home-tab'; tabId: string }
  | { x: number; y: number; type: 'image' }
  | {
      x: number
      y: number
      type: 'internal-note-link'
      label: string
      href: string
      target: NoteLocation
      from: number
      to: number
      occurrence: number
    }
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

export type NoteCopyMode = 'independent' | 'linked'

export type ModalState =
  | { type: 'delete-target'; target: DeleteTarget; permanent: boolean }
  | { type: 'trash-delete-all' }
  | { type: 'trash-restore-all' }
  | { type: 'export-space'; spaceId: string }
  | {
      type: 'copy-note'
      mode: NoteCopyMode
      source: NoteLocation
      target: NoteLocation & { aisleIds?: string[] }
    }
  | {
      type: 'deduplicate-note'
      noteBodyId: string
      keepLocationKeys: string[]
    }
  | {
      type: 'insert-note-reference'
      mode: LinkInsertMode
      modeLocked?: boolean
      insertAs: NoteReferenceInsertKind
      source: NoteLocation
      target: NoteLocation & { aisleIds?: string[] }
      noteLabel: string
      noteLabelTouched?: boolean
      url: string
      urlLabel: string
      urlEditRange?: LinkEditRange | null
      internalEdit?: InternalNoteLinkEdit | null
      editingTokenId?: string
    }
  | {
      type: 'frontmatter-note'
      noteBodyId: string
      location: NoteLocation
      rows: FrontmatterRowDraft[]
      selectedTemplateId: string
      templateDerived: boolean
      isTemplateSuggestionDraft: boolean
    }
  | { type: 'sort-tabs'; target: TabSortTarget }
  | { type: 'shortcut-menu-settings' }

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
