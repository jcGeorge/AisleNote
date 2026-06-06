export type StorageSchemaVersion = 1

export type StorageEntityId = string
export type StorageCustomThemeId = 'custom1' | 'custom2' | 'custom3'
export type StorageTheme = 'dark' | 'light' | 'dawn' | StorageCustomThemeId
export type StorageCustomThemePaletteSlot =
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
export type StorageShortcutId =
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

export const STORAGE_SCHEMA_VERSION: StorageSchemaVersion = 1

export const STORAGE_ROOT_DIR = 'notes' as const
export const STORAGE_SETTINGS_DIR = 'settings' as const
export const STORAGE_DOMAINS_DIR = 'domains' as const
export const STORAGE_ASSETS_DIR = 'assets' as const
export const STORAGE_TRASH_DIR = 'trash' as const
export const STORAGE_MANIFEST_FILE = 'manifest.json' as const
export const STORAGE_WORKSPACE_INDEX_FILE = 'workspace-index.json' as const
export const STORAGE_NAVIGATION_STATE_FILE = 'navigation-state.json' as const
export const STORAGE_APP_SETTINGS_FILE = 'app-settings.json' as const
export const STORAGE_FRONTMATTER_SETTINGS_FILE = 'frontmatter-settings.json' as const
export const STORAGE_EDITOR_STATE_FILE = 'editor-state.json' as const
export const STORAGE_DELETED_WORKSPACE_FILE = 'deleted-workspace.json' as const
export const STORAGE_NOTE_REGISTRY_FILE = 'note-registry.json' as const
export const STORAGE_HOME_NOTE_FILE = 'home.md' as const

export type StorageShortcutMap = Record<StorageShortcutId, string>
export type StorageNewlineOperationId =
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
export type StorageNewlineShortcutId = 'controlEnter' | 'shiftEnter' | 'commandEnter'
export type StorageSettingsSection =
  | 'data'
  | 'frontmatter'
  | 'hotkeys'
  | 'misc'
  | 'shortcuts'
  | 'tips'
  | 'toolbar'
  | 'visuals'
export type StorageDataSettingsSection = 'transfer' | 'storage' | 'trash'
export type StorageVisualsSettingsSection = 'theming' | 'otherVisuals'
export type StorageTableControlTargetMode = 'active-cell' | 'bottom-right'
export type StorageTableOfContentsScope = 'all-aisles' | 'focused-aisle'
export type StorageScratchpadNewAisleSide = 'left' | 'right'
export type StorageTabRenameEnterBehavior = 'goes-to-note' | 'creates-another-tab'
export type StorageFindReplaceMode = 'find' | 'replace'
export type StorageTipId =
  | 'task-undo'
  | 'delete-active-aisle-shortcut'
  | 'trash-delete-confirmation-setting'
  | 'aisle-width-reset'
export type StorageNoteFilterKind = 'tags' | 'synced' | 'frontmatter' | 'media'
export type StorageNoteFilterSettings = {
  active?: boolean
  kind?: StorageNoteFilterKind
  tags?: {
    selectedKeys?: string[]
    sortMode?: 'az' | 'occurrences'
  }
  synced?: {
    selectedKeys?: string[]
  }
  frontmatter?: {
    selectedKeys?: string[]
  }
  media?: {
    selectedKeys?: string[]
  }
}

export type StorageGlobalSettings = {
  theme: StorageTheme
  frontmatter?: Record<string, unknown>
  hotkeys: {
    shortcuts: StorageShortcutMap
    newlineShortcuts?: {
      shortcuts: Record<StorageNewlineShortcutId, StorageNewlineOperationId>
      menuOperations: StorageNewlineOperationId[]
    }
  }
  ui: {
    alwaysShowSpaces?: boolean
    alwaysShowDomains?: boolean
    lastLinkInsertMode?: 'note' | 'url'
    lastNoteCopyMode?: 'independent' | 'linked'
    findCaseSensitive?: boolean
    findWholeWord?: boolean
    findRegex?: boolean
    findReplaceMode?: StorageFindReplaceMode
    removeNoteReferencesOnTrash?: boolean
    noteMentionCopyRequiresConfirmation?: boolean
    deleteActiveAisleShortcutEnabled?: boolean
    scratchpadAisleLimit?: number
    scratchpadNewAisleSide?: StorageScratchpadNewAisleSide
    tabRenameEnterBehavior?: StorageTabRenameEnterBehavior
    decoupledItemsKeepData?: boolean
    trashDeleteForRealRequiresConfirmation?: boolean
    noteFilter?: StorageNoteFilterSettings
    tableAddTargetMode?: StorageTableControlTargetMode
    tableDeleteTargetMode?: StorageTableControlTargetMode
    tableOfContentsScope?: StorageTableOfContentsScope
    tabButtonScale?: number
    noteFontScale?: number
    toolbarButtonScale?: number
    settingsSection?: StorageSettingsSection
    dataSettingsSection?: StorageDataSettingsSection
    selectedCustomTheme?: StorageCustomThemeId
    themePalettes?: Partial<Record<StorageTheme, Partial<Record<StorageCustomThemePaletteSlot, string>>>>
    noteCursorLocations?: Record<
      string,
      {
        activeAisleId: StorageEntityId
        aisles: Record<
          StorageEntityId,
          {
            anchor: number
            head: number
            anchorBlock?: {
              blockIndex: number
              offset: number
            }
            headBlock?: {
              blockIndex: number
              offset: number
            }
            updatedAt: number
          }
        >
        updatedAt: number
      }
    >
    headingCollapseState?: Record<StorageEntityId, Record<StorageEntityId, string[]>>
    aisleWidths?: Record<string, Record<StorageEntityId, number>>
    seenTipIds?: StorageTipId[]
    disabledTipIds?: StorageTipId[]
  }
}

export type StorageDomainIndexEntry = {
  id: StorageEntityId
  title: string
  path: string
}

export type StorageSpaceIndexEntry = {
  id: StorageEntityId
  title: string
  path: string
}

export type StorageNoteAisleRecord = {
  id: StorageEntityId
  aisleBodyId?: StorageEntityId
  file: string
  contentHash?: string
  tags?: string[]
}

export type StorageNoteBodyRecord = {
  id: StorageEntityId
  storageStatus?: 'unlinked'
  createdAt?: string
  updatedAt?: string
  aisles: StorageNoteAisleRecord[]
}

export type StorageNoteAisleBodyRecord = {
  id: StorageEntityId
  storageStatus?: 'unlinked'
  file: string
  contentHash?: string
  tags?: string[]
  frontmatterMeta?: {
    templateId?: string
    templateDerived?: boolean
    templateFieldOrigins?: Record<string, { templateId: string; fieldId: string }>
    templateRemovedFieldIds?: string[]
    computedFields?: Record<string, unknown>
  }
}

export type StorageRootFileMap = {
  workspaceIndex: string
  navigationState: string
  frontmatterSettings: string
  editorState: string
  messages?: string
  deletedWorkspace: string
  noteRegistry: string
}

export type StorageRootManifest = {
  schemaVersion: StorageSchemaVersion
  files: StorageRootFileMap
}

export type StorageLastOpened = {
  domainId: StorageEntityId
  spaceId: StorageEntityId
  primeTabId?: StorageEntityId | null
  subTabId: StorageEntityId | null
  viewMode: 'main' | 'trash' | 'settings' | 'messages' | 'about'
}

export type StorageWorkspaceIndex = {
  domains: StorageDomainIndexEntry[]
  scratchpad?: {
    noteBodyId: StorageEntityId
    activeAisleId?: StorageEntityId
  }
}

export type StorageNavigationState = {
  activeDomainId: StorageEntityId
  lastOpened?: StorageLastOpened
}

export type StorageDeletedWorkspace = {
  deletedDomains?: unknown[]
  deletedSpaces?: unknown[]
}

export type StorageNoteBodiesRegistry = {
  noteBodies: StorageNoteBodyRecord[]
}

export type StorageAisleBodiesRegistry = {
  noteAisleBodies: StorageNoteAisleBodyRecord[]
}

export type StorageNoteRegistry = {
  noteBodies: StorageNoteBodyRecord[]
  aisleBodies: StorageNoteAisleBodyRecord[]
}

export type StorageSpaceSettings = {
  autoRemoveDeletedDays: number
}

export type StorageSubTabRecord = {
  id: StorageEntityId
  title: string
  noteBodyId?: StorageEntityId
  /** Single-aisle notes point to a .md file; multi-aisle notes point to the containing folder. */
  path: string
  /** Primary Markdown file for the sub-tab, usually the single .md file or aisle 1 in a folder. */
  file: string
  createdAt?: number
  updatedAt?: number
}

export type StorageTabRecord = {
  id: StorageEntityId
  title: string
  noteBodyId?: StorageEntityId
  path: string
  /** Primary Markdown file for the parent home note: home.md or home/aisle 1--<id>.md. */
  homeNoteFile: string
  subTabs: StorageSubTabRecord[]
  activeSubTabId: StorageEntityId | null
  createdAt?: number
  updatedAt?: number
}

export type StorageSpaceManifest = {
  id: StorageEntityId
  title: string
  settings: StorageSpaceSettings
  tabs: StorageTabRecord[]
  activeTabId: StorageEntityId
  trashManifestFile: string
  createdAt?: number
  updatedAt?: number
}

export type StorageTrashItemType = 'parent-tab' | 'tab-home' | 'subtab'

export type StorageTrashItemRecord = {
  id: StorageEntityId
  type: StorageTrashItemType
  title: string
  path: string
  file: string
  deletedAt: number
  parentTabTitle?: string
  activeSubTabId?: StorageEntityId | null
  subTabs?: StorageSubTabRecord[]
  original: {
    primeTabId: StorageEntityId
    subTabId: StorageEntityId | null
  }
}

export type StorageTrashManifest = {
  items: StorageTrashItemRecord[]
}

export type StorageManifest =
  | StorageRootManifest
  | StorageSpaceManifest
  | StorageTrashManifest
