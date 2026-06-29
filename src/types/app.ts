export type CustomThemeId = 'custom1' | 'custom2' | 'custom3'
export type AppTheme = 'dark' | 'light' | 'cheese' | CustomThemeId
export type ViewMode = 'main' | 'trash' | 'settings' | 'messages' | 'about'

export type VaultTreeItem = VaultFolder | VaultNote

export type VaultFolder = {
  type: 'folder'
  id: string
  title: string
  children: VaultTreeItem[]
}

export type VaultNote = {
  type: 'note'
  id: string
  title: string
  noteBodyId: string
}

export type VaultTabStatus = 'temporary' | 'retained'

export type VaultTab = {
  noteId: string
  status: VaultTabStatus
}

export type DeletedVaultItem = {
  id: string
  deletedAt: number
  item: VaultTreeItem
  originalParentFolderId: string | null
  originalIndex: number
}

export type VaultState = {
  activeNoteId: string
  openTabs?: VaultTab[]
  items: VaultTreeItem[]
  deletedItems: DeletedVaultItem[]
  settings: {
    autoRemoveDeletedDays: number
  }
}

export type NoteLocation = {
  noteId: string
}

export type NoteAisle = {
  id: string
  aisleBodyId: string
}

export type ResolvedNoteAisle = NoteAisle & {
  markdown: string
}

export type FrontmatterValue = unknown
export type FrontmatterData = Record<string, FrontmatterValue>
export type FrontmatterParseStatus = 'none' | 'valid' | 'invalid'
export type FrontmatterFieldType = 'text' | 'number' | 'boolean' | 'date' | 'datetime' | 'list' | 'fixedList'
export type FrontmatterComputedValue =
  | 'none'
  | 'createdAt'
  | 'updatedAt'
  | 'noteTitle'
  | 'folderName'
  | 'folderPath'
  | 'isLinked'
  | 'tags'

export type FrontmatterTemplateField = {
  id: string
  key: string
  type: FrontmatterFieldType
  defaultValue: string
  computed: FrontmatterComputedValue
  options?: string[]
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

export type NoteBody = {
  id: string
  createdAt?: string
  updatedAt?: string
  aisles: NoteAisle[]
}

export type ResolvedNoteBody = Omit<NoteBody, 'aisles'> & {
  aisles: ResolvedNoteAisle[]
}

export type ScratchpadState = {
  noteBodyId: string
  activeAisleId?: string
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

export type EditorTextLineRange = {
  start: number
  end: number
  length: number
  text: string
  nodeType?: string
}

export type MultiLineInlineFormat = 'bold' | 'italic' | 'strike' | 'highlight'

export type MultiLineEditState = {
  anchorBlockIndex: number
  headBlockIndex: number
  columnOffset: number
  columnOffsets?: Record<number, number>
  cursorBlockIndices?: number[]
  selectionAnchorOffsets?: Record<number, number>
  selectionHeadOffsets?: Record<number, number>
  activeInlineFormats?: MultiLineInlineFormat[]
}

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

export type ShortcutId =
  | 'openSettings'
  | 'toggleNotesTrash'
  | 'toggleNotesScratchpad'
  | 'newNote'
  | 'newFolder'
  | 'closeCurrentNote'
  | 'cyclePinnedNoteTabNext'
  | 'cyclePinnedNoteTabPrev'
  | 'reopenClosedNoteTab'
  | 'formatStrikethrough'
  | 'formatHighlight'
  | 'pastePlainText'
  | 'cycleAislePrev'
  | 'cycleAisleNext'

export type SettingsSection = 'data' | 'frontmatter' | 'hotkeys' | 'misc' | 'shortcuts' | 'tips' | 'toolbar' | 'visuals'
export type DataSettingsSection = 'transfer' | 'storage' | 'trash'
export type VisualsSettingsSection = 'theming' | 'otherVisuals'
export type MessagesSection = 'inbox' | 'toast-history' | 'diagnostics' | 'editor-dev'
export type AboutSection = 'home' | 'tooltip-sources'
export type FindReplaceScope = 'note' | 'folder' | 'vault'
export type TableControlTargetMode = 'active-cell' | 'bottom-right'
export type TableOfContentsScope = 'all-aisles' | 'focused-aisle'
export type TabColorIndicatorPlacement = 'bottom' | 'top'
export type NewAislePlacement = 'end' | 'left-of-focus' | 'right-of-focus'
export type ScratchpadNewAisleSide = 'left' | 'right'
export type TipId = 'task-undo' | 'delete-active-aisle-shortcut' | 'trash-delete-confirmation-setting' | 'aisle-width-reset'
export type LinkInsertMode = 'url' | 'note-link' | 'note-preview'
export type NoteCopyMode = 'independent' | 'synced'

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
  | 'tableOfContents'
  | 'operationsMenu'

export type NewlineShortcutId = 'controlEnter' | 'shiftEnter' | 'commandEnter'

export type NewlineShortcutSettings = {
  shortcuts: Record<NewlineShortcutId, NewlineOperationId>
  menuOperations: NewlineOperationId[]
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
  type: 'duplicate-auto-decoupled' | 'storage-vault-recovered'
  status: 'unread' | 'acknowledged' | 'dismissed'
  createdAt: string
  signature: string
  title: string
  body: string
  anchorPath?: string
  decoupledPaths?: string[]
  affectedLocations?: AppMessageAffectedLocation[]
  failedVaultPath?: string
  failedVaultAvailable?: boolean
  activeVaultPath?: string
  activeVaultName?: string
  recoveryMode?: 'disconnected-to-local' | 'created-local' | 'reset-default'
  issueSummary?: string[]
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

export type CustomThemePaletteSlot =
  | 'canvas'
  | 'page'
  | 'panel'
  | 'raised'
  | 'button'
  | 'text'
  | 'mutedText'
  | 'border'
  | 'primary'
  | 'danger'
  | 'warning'
  | 'success'
  | 'tagText'
  | 'tagBg'
  | 'sidebar'

export type CustomThemePalette = Record<CustomThemePaletteSlot, string>
export type ThemePaletteOverrides = Partial<Record<AppTheme, CustomThemePalette>>

export type AppState = {
  theme: AppTheme
  vault: VaultState
  scratchpad?: ScratchpadState
  messages?: AppMessage[]
  toastHistory?: ToastHistoryEntry[]
  noteBodies: NoteBody[]
  noteAisleBodies?: NoteAisleBody[]
  hotkeys: {
    shortcuts: Record<ShortcutId, string>
    newlineShortcuts: NewlineShortcutSettings
  }
  frontmatter: FrontmatterSettings
  ui: {
    sidebarCollapsed: boolean
    sidebarWidth: number
    collapsedFolderIds: string[]
    lastLinkInsertMode?: LinkInsertMode
    lastNoteCopyMode?: NoteCopyMode
    findCaseSensitive?: boolean
    findWholeWord?: boolean
    findRegex?: boolean
    findReplaceMode?: 'find' | 'replace'
    findReplaceScope?: FindReplaceScope
    removeNoteReferencesOnTrash?: boolean
    noteMentionCopyRequiresConfirmation?: boolean
    scratchpadNewAisleSide?: ScratchpadNewAisleSide
    decoupledItemsKeepData?: boolean
    trashDeleteForRealRequiresConfirmation?: boolean
    noteFilter?: NoteFilterSettings
    tableAddTargetMode: TableControlTargetMode
    tableDeleteTargetMode: TableControlTargetMode
    tableOfContentsScope?: TableOfContentsScope
    tabColorIndicatorPlacement?: TabColorIndicatorPlacement
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
    noteDropAutoExpandsFolders?: boolean
    seenTipIds: TipId[]
    disabledTipIds: TipId[]
  }
}

export type PendingContent = {
  noteBodyId: string
  noteId: string
  aisleId: string
  aisleBodyId: string
  markdown: string
}

export type PendingCreatedEdit =
  | { type: 'note'; id: string; previousNoteId: string }
  | { type: 'folder'; id: string; parentFolderId: string | null }

export type ArrangeSource = 'context' | 'press'
export type ArrangeInsertPosition = 'before' | 'after'
export type ArrangeScope = 'vault'
export type TabSortMode = 'alpha-asc' | 'alpha-desc' | 'created-asc' | 'created-desc' | 'updated-asc' | 'updated-desc'
export type TabSortTarget = 'notes' | 'folders'
export type NoteReferenceInsertKind = 'link' | 'preview'
export type ArrangeDragItem = { type: 'note'; noteId: string } | { type: 'folder'; folderId: string }
export type TabArrangeDragItem = Extract<ArrangeDragItem, { type: 'note' }>
export type ArrangeHierarchyDropRequest = {
  item: { type: 'note'; noteIds: string[] } | { type: 'folder'; folderIds: string[] }
  target: { type: 'folder'; folderId: string | null }
}
export type ArrangeSelectionKind = 'note' | 'folder'
export type ArrangeSelectionState = {
  kind: ArrangeSelectionKind | null
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
}
export type ArrangeTapCandidate = {
  key: string
  type: 'note' | 'folder' | 'home'
  id?: string
  startX: number
  startY: number
  dragged: boolean
}
export type ArrangeTapCandidateSeed = { key: string; type: 'note' | 'folder' | 'home'; id?: string }
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
export type SpaceArrangeDragPreview = never
export type DomainArrangeDragPreview = never
export type TabArrangeDragPreview = {
  item: TabArrangeDragItem
  label: string
  variant: 'note'
  dragCount?: number
  ghostItems?: ArrangePreviewGhostItem[]
  currentX: number
  currentY: number
  offsetX: number
  offsetY: number
  width: number
  height: number
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
  event: 'vault-auto-recovered'
  mode: 'disconnected-to-local' | 'created-local' | 'reset-default'
  failedVaultPath: string
  failedVaultName: string
  failedVaultAvailable?: boolean
  activeVaultPath: string
  activeVaultName: string
  originalError?: string
  issueSummary?: string[]
  issues?: StorageProfileIssue[]
  createdAt: string
}

export type KnownVault = {
  vaultId?: string | null
  vaultPath: string
  vaultName: string
  isActive: boolean
  exists: boolean
  hasManifest: boolean
  available: boolean
}

export type StorageProfileStatus = {
  status: 'ready' | 'error' | 'setup-required'
  health?: 'healthy' | 'warning' | 'error'
  issues?: StorageProfileIssue[]
  event?: string
  profileRootPath: string
  activeVaultId?: string | null
  vaultPath: string
  vaultName: string
  hasProfile: boolean
  canWrite: boolean
  source?: 'hybrid' | 'empty'
  schemaVersion?: number | null
  conflicts?: string[]
  revision?: number
  error?: string
  recovery?: StorageProfileRecovery
  knownVaults?: KnownVault[]
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
  centered?: boolean
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
}
