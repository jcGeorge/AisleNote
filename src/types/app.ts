export type CustomThemeId = 'custom1' | 'custom2' | 'custom3'
export type AppTheme = 'dark' | 'light' | 'dawn' | CustomThemeId
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
  | 'tagText'
  | 'tagBg'
  | 'tooltipPrimary'
  | 'tooltipSecondary'
  | 'domainRail'
  | 'spaceRail'
  | 'parentRail'
  | 'subtabRail'
export type CustomThemePalette = Record<CustomThemePaletteSlot, string>
export type ThemePaletteOverrides = Partial<Record<AppTheme, CustomThemePalette>>
export type ViewMode = 'main' | 'trash' | 'settings' | 'messages' | 'about'
export type AboutSection = 'home' | 'donation'
export type MessagesSection = 'inbox' | 'toast-history' | 'diagnostics' | 'editor-dev'
export type ShortcutId =
  | 'toggleNotesTrash'
  | 'toggleNotesScratchpad'
  | 'toggleNotesFilter'
  | 'openDomains'
  | 'openSpaces'
  | 'newTab'
  | 'newSubTab'
  | 'formatStrikethrough'
  | 'cycleParentTabNext'
  | 'cycleParentTabPrev'
  | 'cycleSubTabNext'
  | 'cycleSubTabPrev'
  | 'cycleAislePrev'
  | 'cycleAisleNext'
export type SettingsSection =
  | 'data'
  | 'frontmatter'
  | 'hotkeys'
  | 'misc'
  | 'shortcuts'
  | 'tips'
  | 'toolbar'
  | 'visuals'
export type DataSettingsSection = 'transfer' | 'storage' | 'trash'
export type VisualsSettingsSection = 'theming' | 'otherVisuals'
export type TableControlTargetMode = 'active-cell' | 'bottom-right'
export type TableOfContentsScope = 'all-aisles' | 'focused-aisle'
export type NewAislePlacement = 'end' | 'left-of-focus' | 'right-of-focus'
export type ScratchpadNewAisleSide = 'left' | 'right'
export type TabRenameEnterBehavior = 'goes-to-note' | 'creates-another-tab'
export type TipId = 'task-undo' | 'delete-active-aisle-shortcut' | 'trash-delete-confirmation-setting' | 'aisle-width-reset'
export type FindReplaceScope = 'note' | 'parent' | 'space' | 'domain' | 'notebook'
export type NoteFilterKind = 'tags' | 'synced' | 'frontmatter' | 'media'
export type NoteFilterTagSortMode = 'az' | 'occurrences'
export type NoteFilterSettings = {
  active: boolean
  kind: NoteFilterKind
  tags: {
    selectedKeys: string[]
    sortMode: NoteFilterTagSortMode
  }
  synced: {
    selectedKeys: string[]
  }
  frontmatter: {
    selectedKeys: string[]
  }
  media: {
    selectedKeys: string[]
  }
}

export type NewlineOperationId =
  | 'normalNewLine'
  | 'task'
  | 'dashList'
  | 'bulletList'
  | 'numberedList'
  | 'aisleLeft'
  | 'aisleRight'
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
  aisleBodyId: string
}

export type ResolvedNoteAisle = NoteAisle & {
  markdown: string
}

export type NoteAisleBody = {
  id: string
  createdAt?: string
  updatedAt?: string
  markdown: string
  tags?: string[]
  frontmatter?: FrontmatterData | null
  frontmatterStatus?: FrontmatterParseStatus
  frontmatterParseError?: string
  frontmatterRaw?: string
  frontmatterMeta?: FrontmatterMeta
}

export type FrontmatterValue = unknown
export type FrontmatterData = Record<string, FrontmatterValue>
export type FrontmatterParseStatus = 'none' | 'valid' | 'invalid'
export type FrontmatterFieldType = 'text' | 'number' | 'boolean' | 'date' | 'datetime' | 'list'
export type FrontmatterComputedValue =
  | 'none'
  | 'createdAt'
  | 'updatedAt'
  | 'noteTitle'
  | 'spaceName'
  | 'domainName'
  | 'isLinked'
  | 'tags'

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

export type FrontmatterMeta = {
  templateId?: string
  templateDerived?: boolean
  templateFieldOrigins?: FrontmatterFieldOriginMap
  templateRemovedFieldIds?: string[]
  computedFields?: FrontmatterComputedFieldMap
}

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
}

export type ScratchpadState = {
  noteBodyId: string
  activeAisleId?: string
}

export type ResolvedNoteBody = Omit<NoteBody, 'aisles'> & {
  aisles: ResolvedNoteAisle[]
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

export type AppMessageAffectedLocation = {
  label: string
  path?: string
  noteBodyId?: string
  aisleBodyId?: string
  location?: NoteLocation
}

export type AppMessage = {
  id: string
  type: 'duplicate-auto-decoupled' | 'storage-notebook-recovered'
  status: 'unread' | 'acknowledged' | 'dismissed'
  createdAt: string
  signature: string
  title: string
  body: string
  anchorPath?: string
  decoupledPaths?: string[]
  affectedLocations?: AppMessageAffectedLocation[]
  failedNotebookPath?: string
  failedNotebookAvailable?: boolean
  activeNotebookPath?: string
  activeNotebookName?: string
  recoveryMode?: 'disconnected-to-local' | 'created-local' | 'reset-default'
  issueSummary?: string[]
}

export type NoteHeadingAnchor = {
  aisleId: string
  headingKey: string
}

export type NotePreviewStart = 'last-position'
export type NoteNavigationStart = 'top' | 'last-position'

export type NoteNavigationTarget = NoteLocation & {
  aisleIds?: string[]
  heading?: NoteHeadingAnchor
  aisleId?: string
  startAt?: NoteNavigationStart
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

export type HeadingCollapseState = Record<string, Record<string, string[]>>

export type ToolbarToolId =
  | 'copy'
  | 'frontmatter'
  | 'tableOfContents'
  | 'aisles'
  | 'findReplace'
  | 'undo'
  | 'redo'
  | 'heading'
  | 'bold'
  | 'italic'
  | 'highlight'
  | 'strike'
  | 'taskList'
  | 'bulletList'
  | 'orderedList'
  | 'dashList'
  | 'blockQuote'
  | 'blockIndent'
  | 'removeBlockIndent'
  | 'hr'
  | 'link'
  | 'image'
  | 'table'
  | 'code'
  | 'codeBlock'
  | 'clear'

export type ToolbarLayoutItem =
  | {
      id: string
      type: 'tool'
      toolId: ToolbarToolId
    }
  | {
      id: string
      type: 'spacer'
    }

export type ToolbarLayout = {
  id: string
  name: string
  items: ToolbarLayoutItem[]
}

export type SubTab = {
  id: string
  title: string
  noteBodyId: string
}

export type Tab = {
  id: string
  title: string
  noteBodyId: string
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

export type DeletedSpaceEntry = {
  id: string
  domainId: string
  domainName: string
  space: Space
  deletedAt: number
}

export type DeletedDomainEntry = {
  id: string
  domain: Domain
  deletedSpaces: DeletedSpaceEntry[]
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
  deletedDomains?: DeletedDomainEntry[]
  deletedSpaces?: DeletedSpaceEntry[]
  scratchpad?: ScratchpadState
  messages?: AppMessage[]
  toastHistory?: ToastHistoryEntry[]
  noteBodies: NoteBody[]
  noteAisleBodies?: NoteAisleBody[]
  /** Transitional projection of the active domain. Remove after App.tsx is fully domain-scoped. */
  activeSpaceId: string
  /** Transitional projection of the active domain. Remove after App.tsx is fully domain-scoped. */
  spaces: Space[]
  hotkeys: {
    shortcuts: Record<ShortcutId, string>
    newlineShortcuts: NewlineShortcutSettings
  }
  frontmatter: FrontmatterSettings
  ui: {
    alwaysShowSpaces?: boolean
    alwaysShowDomains?: boolean
    lastLinkInsertMode?: LinkInsertMode
    lastNoteCopyMode?: NoteCopyMode
    findCaseSensitive?: boolean
    findWholeWord?: boolean
    findRegex?: boolean
    findReplaceMode?: 'find' | 'replace'
    findReplaceScope?: FindReplaceScope
    removeNoteReferencesOnTrash?: boolean
    noteMentionCopyRequiresConfirmation?: boolean
    deleteActiveAisleShortcutEnabled?: boolean
    scratchpadAisleLimit?: number
    scratchpadNewAisleSide?: ScratchpadNewAisleSide
    tabRenameEnterBehavior?: TabRenameEnterBehavior
    decoupledItemsKeepData?: boolean
    trashDeleteForRealRequiresConfirmation?: boolean
    noteFilter?: NoteFilterSettings
    tableAddTargetMode: TableControlTargetMode
    tableDeleteTargetMode: TableControlTargetMode
    tableOfContentsScope?: TableOfContentsScope
    tabButtonScale: number
    noteFontScale: number
    toolbarButtonScale?: number
    settingsSection: SettingsSection
    dataSettingsSection?: DataSettingsSection
    visualsSettingsSection?: VisualsSettingsSection
    selectedCustomTheme?: CustomThemeId
    themePalettes?: ThemePaletteOverrides
    noteCursorLocations: Record<string, NoteCursorLocation>
    headingCollapseState: HeadingCollapseState
    aisleWidths?: Record<string, Record<string, number>>
    toolbarLayouts?: ToolbarLayout[]
    toolbarEditorShowNames?: boolean
    seenTipIds: TipId[]
    disabledTipIds: TipId[]
  }
}

export type PendingContent = {
  noteBodyId: string
  spaceId: string
  tabId: string
  subTabId: string | null
  aisleId: string
  aisleBodyId: string
  markdown: string
}

export type PendingCreatedEdit =
  | { type: 'tab'; id: string; previousTabId: string }
  | { type: 'subtab'; id: string; parentTabId: string; previousSubTabId: string | null }
  | { type: 'space'; id: string; sourceDomainId: string; previousActiveSpaceId: string }
  | { type: 'domain'; id: string; previousActiveDomainId: string; previousActiveSpaceId: string }

export type ArrangeSource = 'context' | 'press'
export type ArrangeInsertPosition = 'before' | 'after'
export type ArrangeScope = 'tabs' | 'spaces' | 'domains'
export type TabSortMode = 'alpha-asc' | 'alpha-desc' | 'created-asc' | 'created-desc' | 'updated-asc' | 'updated-desc'
export type TabSortTarget = 'parents' | 'subtabs' | 'spaces' | 'domains'
export type LinkInsertMode = 'note' | 'url'
export type NoteReferenceInsertKind = 'link' | 'preview'

export type ArrangeDragItem =
  | { type: 'tab'; tabId: string }
  | { type: 'subtab'; parentTabId: string; subTabId: string }
  | { type: 'space'; spaceId: string }
  | { type: 'domain'; domainId: string }

export type TabArrangeDragItem = Extract<ArrangeDragItem, { type: 'tab' | 'subtab' }>
export type ArrangeHierarchyDropRequest = {
  sourceDomainId: string
  sourceSpaceId: string
  item:
    | { type: 'parent'; parentTabIds: string[] }
    | { type: 'subtab'; parentTabId: string; subTabIds: string[] }
  target:
    | { type: 'space'; domainId: string; spaceId: string }
    | { type: 'domain'; domainId: string }
}
export type ArrangeSelectionKind = 'parent' | 'subtab' | 'domain' | 'space'
export type ArrangeSelectionState = {
  kind: ArrangeSelectionKind | null
  parentTabId: string | null
  domainId: string | null
  selectedIds: string[]
  anchorId: string | null
}
export type SelectionClickModifiers = {
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
}

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
  overDomainId: string | null
  overDomainInsert: ArrangeInsertPosition | null
}

export type ArrangeTapCandidate =
  | { key: string; type: 'tab'; tabId: string; startX: number; startY: number; dragged: boolean }
  | { key: string; type: 'subtab'; subTabId: string; startX: number; startY: number; dragged: boolean }
  | { key: string; type: 'space'; spaceId: string; startX: number; startY: number; dragged: boolean }
  | { key: string; type: 'domain'; domainId: string; startX: number; startY: number; dragged: boolean }
  | { key: string; type: 'home'; startX: number; startY: number; dragged: boolean }

export type ArrangeTapCandidateSeed =
  | { key: string; type: 'tab'; tabId: string }
  | { key: string; type: 'subtab'; subTabId: string }
  | { key: string; type: 'space'; spaceId: string }
  | { key: string; type: 'domain'; domainId: string }
  | { key: string; type: 'home' }

export type ArrangeDragSeed = {
  key: string
  startX: number
  startY: number
}

export type ArrangePreviewGhostItem = {
  id: string
  label: string
  x: number
  y: number
  width: number
  height: number
}

export type SpaceArrangeDragPreview = {
  spaceId: string
  sourceDomainId: string
  selectedSpaceIds?: string[]
  dragCount?: number
  ghostItems?: ArrangePreviewGhostItem[]
  label: string
  currentX: number
  currentY: number
  offsetX: number
  offsetY: number
  width: number
  height: number
}

export type DomainArrangeDragPreview = {
  domainId: string
  selectedDomainIds?: string[]
  dragCount?: number
  ghostItems?: ArrangePreviewGhostItem[]
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
  dragCount?: number
  ghostItems?: ArrangePreviewGhostItem[]
  currentX: number
  currentY: number
  offsetX: number
  offsetY: number
  width: number
  height: number
}

export type ToastTone = 'success' | 'warning' | 'error'

export type ToastState = {
  id: number
  message: string
  tone: ToastTone
  durationMs: number
}

export type ToastHistoryEntry = {
  id: number
  createdAt: string
  message: string
  tone: ToastTone
}

export type StorageProfileIssue = {
  code: string
  severity: 'warning' | 'error'
  path?: string
  message: string
  aisleBodyId?: string
  anchorPath?: string
  decoupledPaths?: string[]
  candidateCount?: number
  changedVersionCount?: number
}

export type StorageProfileRecovery = {
  event: 'notebook-auto-recovered'
  mode: 'disconnected-to-local' | 'created-local' | 'reset-default'
  failedNotebookPath: string
  failedNotebookName: string
  failedNotebookAvailable?: boolean
  activeNotebookPath: string
  activeNotebookName: string
  originalError?: string
  issueSummary?: string[]
  issues?: StorageProfileIssue[]
  createdAt: string
}

export type KnownNotebook = {
  notebookPath: string
  notebookName: string
  isActive: boolean
  isDefault: boolean
  exists: boolean
  hasManifest: boolean
  available: boolean
}

export type StorageProfileStatus = {
  status: 'ready' | 'error'
  health?: 'healthy' | 'warning' | 'error'
  issues?: StorageProfileIssue[]
  event?: string
  profileRootPath: string
  notebookPath: string
  notebookName: string
  isDefault: boolean
  hasProfile: boolean
  canWrite: boolean
  source?: 'hybrid' | 'empty'
  schemaVersion?: number | null
  conflicts?: string[]
  revision?: number
  error?: string
  recovery?: StorageProfileRecovery
  knownNotebooks?: KnownNotebook[]
}

export type UserSettingsLocationStatus = {
  status: 'ready' | 'warning' | 'error'
  event?: string
  settingsRootPath: string
  settingsPath: string
  localSettingsPath: string
  isDefault: boolean
  canWrite: boolean
  syncStatus: 'local' | 'synced' | 'fallback'
  source: 'local-cache' | 'settings-folder'
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
  ratioPresetId: string
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
  aisleIds?: string[]
  heading?: NoteHeadingAnchor
  startAt?: NoteNavigationStart
  from?: number
  to?: number
  occurrence?: number
  range?: LinkEditRange | null
}

export type NotePreviewEdit = {
  label: string
  href: string
  target: NoteLocation
  aisleIds?: string[]
  heading?: NoteHeadingAnchor
  previewStart?: NotePreviewStart
  sourceRange?: {
    from: number
    to: number
  }
  tokenId?: string
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

export type MultiLineInlineFormat = 'bold' | 'italic' | 'strike' | 'highlight'

export type EditorTextLineRange = {
  start: number
  end: number
  length: number
  text: string
  nodeType?: string
}

export type EditorDictionaryContext = {
  suggestions: string[]
  misspelledWord: string
  selectionText: string
  canLookUpSelection: boolean
}

export type ContextMenuState =
  | { x: number; y: number; type: 'tab'; tabId: string }
  | { x: number; y: number; type: 'subtab'; tabId: string; subTabId: string }
  | { x: number; y: number; type: 'home-tab'; tabId: string }
  | { x: number; y: number; type: 'image' }
  | { x: number; y: number; type: 'media'; kind: 'audio' | 'video'; source: string }
  | {
      x: number
      y: number
      type: 'editor'
      dictionary?: EditorDictionaryContext
      link?:
        | { type: 'external'; label: string; href: string; range: LinkEditRange | null }
        | (InternalNoteLinkEdit & { type: 'internal'; range?: LinkEditRange | null; previewEdit?: NotePreviewEdit | null })
    }
  | {
      x: number
      y: number
      type: 'internal-note-link'
      label: string
      href: string
      target: NoteLocation
      aisleIds?: string[]
      heading?: NoteHeadingAnchor
      startAt?: NoteNavigationStart
      from: number
      to: number
      occurrence: number
      range?: LinkEditRange | null
    }
  | {
      x: number
      y: number
      type: 'trash-tab'
      source: 'deleted-tab' | 'subtabs-only' | 'deleted-domain-tab'
      deletedTabEntryId: string | null
      deletedDomainEntryId?: string | null
      deletedSpaceEntryId?: string | null
      domainId?: string
      spaceId?: string
      parentTabId: string
    }
  | {
      x: number
      y: number
      type: 'trash-subtab'
      source: 'deleted-tab' | 'subtabs-only' | 'deleted-domain-tab'
      deletedTabEntryId: string | null
      deletedDomainEntryId?: string | null
      deletedSpaceEntryId?: string | null
      domainId?: string
      spaceId?: string
      parentTabId: string
      subTabId: string
    }
  | { x: number; y: number; type: 'trash-domain'; deletedDomainEntryId: string; domainId: string }
  | { x: number; y: number; type: 'trash-selection' }
  | {
      x: number
      y: number
      type: 'trash-space'
      source: 'deleted-space' | 'deleted-domain-space'
      deletedSpaceEntryId?: string | null
      deletedDomainEntryId?: string
      domainId: string
      spaceId: string
    }
  | { x: number; y: number; type: 'space'; spaceId: string }
  | { x: number; y: number; type: 'domain'; domainId: string }
  | { x: number; y: number; type: 'scratchpad' }

export type DeleteTarget =
  | { type: 'tab'; tabId: string }
  | { type: 'subtab'; tabId: string; subTabId: string }
  | {
      type: 'trash-tab'
      source: 'deleted-tab' | 'subtabs-only' | 'deleted-domain-tab'
      deletedTabEntryId: string | null
      deletedDomainEntryId?: string | null
      deletedSpaceEntryId?: string | null
      domainId?: string
      spaceId?: string
      parentTabId: string
    }
  | {
      type: 'trash-subtab'
      source: 'deleted-tab' | 'subtabs-only' | 'deleted-domain-tab'
      deletedTabEntryId: string | null
      deletedDomainEntryId?: string | null
      deletedSpaceEntryId?: string | null
      domainId?: string
      spaceId?: string
      parentTabId: string
      subTabId: string
    }
  | { type: 'trash-domain'; deletedDomainEntryId: string; domainId: string }
  | {
      type: 'trash-space'
      source: 'deleted-space' | 'deleted-domain-space'
      deletedSpaceEntryId?: string | null
      deletedDomainEntryId?: string
      domainId: string
      spaceId: string
    }
  | { type: 'space'; spaceId: string }
  | { type: 'domain'; domainId: string }

export type NoteCopyMode = 'independent' | 'linked'
export type NoteCopyDestinationMode = 'replace' | 'append'
export type LinkedAisleReason = 'aisle-body' | 'note-body'

export type ModalState =
  | { type: 'delete-target'; target: DeleteTarget; permanent: boolean }
  | { type: 'delete-trash-targets'; targets: DeleteTarget[] }
  | { type: 'trash-delete-all' }
  | { type: 'trash-restore-all' }
  | { type: 'export-space'; spaceId: string }
  | { type: 'create-notebook'; name: string; locationPath: string; error?: string }
  | { type: 'rename-notebook'; name: string; error?: string }
  | { type: 'scratchpad-about' }
  | {
      type: 'copy-note'
      mode: NoteCopyMode
      destinationMode: NoteCopyDestinationMode
      source: NoteLocation
      target: NoteLocation & { aisleIds?: string[] }
    }
  | {
      type: 'confirm-synced-note-paste'
      source: NoteLocation
      destination: NoteLocation
      destinationAisleId: string
      sourceAisleId?: string
    }
  | {
      type: 'confirm-independent-note-paste-reclaim'
      source: NoteLocation
      destination: NoteLocation
      destinationAisleId: string
      placement: NewAislePlacement
    }
  | {
      type: 'deduplicate-note'
      noteBodyId: string
      location: NoteLocation
      keepLocationKeys: string[]
      keepData: boolean
    }
  | {
      type: 'linked-aisle'
      reason: 'aisle-body'
      noteBodyId: string
      aisleId: string
      aisleBodyId: string
      location: NoteLocation
      keepAisleSlotKeys: string[]
      keepData: boolean
    }
  | {
      type: 'linked-aisle'
      reason: 'note-body'
      noteBodyId: string
      aisleId: string
      aisleBodyId: string
      location: NoteLocation
      keepLocationKeys: string[]
      keepData: boolean
    }
  | {
      type: 'insert-note-reference'
      mode: LinkInsertMode
      modeLocked?: boolean
      insertAs: NoteReferenceInsertKind
      source: NoteLocation
      target: NoteLocation & { aisleIds?: string[]; heading?: NoteHeadingAnchor; previewStart?: NotePreviewStart }
      noteLabel: string
      noteLabelTouched?: boolean
      url: string
      urlLabel: string
      urlInitialFocus?: 'url' | 'label'
      urlEditRange?: LinkEditRange | null
      internalEdit?: InternalNoteLinkEdit | null
      previewEdit?: NotePreviewEdit | null
      editingTokenId?: string
    }
  | {
      type: 'frontmatter-note'
      noteBodyId: string
      aisleId: string
      aisleBodyId: string
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
  source: 'deleted-tab' | 'subtabs-only' | 'deleted-domain-tab'
  deletedTabEntryId: string | null
  deletedDomainEntryId?: string | null
  deletedSpaceEntryId?: string | null
  domainId?: string
  spaceId?: string
  parentTabId: string
  homeContent: string
  subTabs: Array<SubTab & { content: string }>
}

export type TrashSpaceBucket = {
  id: string
  title: string
  source: 'live' | 'deleted-space' | 'deleted-domain-space'
  domainId: string
  spaceId: string
  deletedSpaceEntryId: string | null
  deletedDomainEntryId: string | null
  space: Space
  parentTabs: TrashParentBucket[]
}

export type TrashDomainBucket = {
  id: string
  title: string
  source: 'live' | 'deleted-domain'
  domainId: string
  deletedDomainEntryId: string | null
  spaces: TrashSpaceBucket[]
}

export type NavLocation = {
  viewMode: ViewMode
  activeSpaceId: string
  mainTabId: string
  mainSubTabId: string | null
  trashTabId: string
  trashSubTabId: string | null
}
