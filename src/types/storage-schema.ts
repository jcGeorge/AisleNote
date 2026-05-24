export type StorageSchemaVersion = 1 | 2 | 3

export type StorageEntityId = string
export type StorageCustomThemeId = 'custom1' | 'custom2' | 'custom3'
export type StorageTheme = 'dark' | 'light' | 'dawn' | 'blues' | StorageCustomThemeId
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
  | 'domainRail'
  | 'spaceRail'
  | 'parentRail'
  | 'subtabRail'
export type StorageShortcutId =
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

export const STORAGE_SCHEMA_VERSION: StorageSchemaVersion = 3

export const STORAGE_ROOT_DIR = 'notes-data' as const
export const STORAGE_DOMAINS_DIR = 'domains' as const
export const STORAGE_ASSETS_DIR = 'assets' as const
export const STORAGE_TRASH_DIR = 'trash' as const
export const STORAGE_MANIFEST_FILE = 'manifest.json' as const
export const STORAGE_PROFILE_SETTINGS_FILE = 'profile-settings.json' as const
export const STORAGE_WORKSPACE_INDEX_FILE = 'workspace-index.json' as const
export const STORAGE_NAVIGATION_STATE_FILE = 'navigation-state.json' as const
export const STORAGE_APP_SETTINGS_FILE = 'app-settings.json' as const
export const STORAGE_APPEARANCE_SETTINGS_FILE = 'appearance-settings.json' as const
export const STORAGE_SHORTCUT_SETTINGS_FILE = 'shortcut-settings.json' as const
export const STORAGE_FRONTMATTER_SETTINGS_FILE = 'frontmatter-settings.json' as const
export const STORAGE_UI_PREFERENCES_FILE = 'ui-preferences.json' as const
export const STORAGE_EDITOR_STATE_FILE = 'editor-state.json' as const
export const STORAGE_DELETED_WORKSPACE_FILE = 'deleted-workspace.json' as const
export const STORAGE_NOTE_BODIES_FILE = 'note-bodies.json' as const
export const STORAGE_AISLE_BODIES_FILE = 'aisle-bodies.json' as const
export const STORAGE_ORPHAN_NOTE_BODIES_FILE = 'orphan-note-bodies.json' as const
export const STORAGE_ORPHAN_AISLE_BODIES_FILE = 'orphan-aisle-bodies.json' as const
export const STORAGE_NOTE_REGISTRY_FILE = 'note-registry.json' as const
export const STORAGE_HOME_NOTE_FILE = 'home.md' as const

export type StorageShortcutMap = Record<StorageShortcutId, string>
export type StorageNewlineOperationId =
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
export type StorageVisualsSettingsSection = 'theming' | 'otherVisuals'
export type StorageTableControlTargetMode = 'active-cell' | 'bottom-right'
export type StorageTipId = 'task-undo' | 'tab-create-after-rename'

export type StorageGlobalSettings = {
  theme: StorageTheme
  frontmatter?: Record<string, unknown>
  hotkeys: {
    shortcuts: StorageShortcutMap
    newlineShortcuts?: {
      shortcuts: Record<StorageNewlineShortcutId, StorageNewlineOperationId>
      menuOperations: StorageNewlineOperationId[]
    }
    enableMouseBackForward: boolean
    enableGenericHistoryHotkeys: boolean
  }
  ui: {
    showParentHomeTab: boolean
    alwaysShowSpaces?: boolean
    alwaysShowDomains?: boolean
    stageManagerOpenDestinationAfterApply: boolean
    lastLinkInsertMode?: 'note' | 'url'
    lastNoteCopyMode?: 'independent' | 'linked'
    decoupledItemsKeepData?: boolean
    tableAddTargetMode?: StorageTableControlTargetMode
    tableDeleteTargetMode?: StorageTableControlTargetMode
    tabButtonScale?: number
    noteFontScale?: number
    settingsSection?: StorageSettingsSection
    selectedCustomTheme?: StorageCustomThemeId
    customThemePalette?: Partial<Record<StorageCustomThemePaletteSlot, string>> | null
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
  frontmatterMeta?: {
    templateId?: string
    templateDerived?: boolean
    templateFieldOrigins?: Record<string, { templateId: string; fieldId: string }>
    templateRemovedFieldIds?: string[]
    computedFields?: Record<string, unknown>
    templateDetachedKeys?: string[]
  }
}

export type StorageRootFileMap = {
  workspaceIndex: string
  navigationState: string
  appSettings: string
  frontmatterSettings: string
  editorState: string
  deletedWorkspace: string
  noteRegistry: string
}

export type StorageSchema3RootManifest = {
  schemaVersion: 3
  files: StorageRootFileMap
}

export type StorageLegacyRootManifest = {
  schemaVersion: 1 | 2
  globalSettings: StorageGlobalSettings
  domains: StorageDomainIndexEntry[]
  deletedDomains?: unknown[]
  deletedSpaces?: unknown[]
  noteBodies?: StorageNoteBodyRecord[]
  noteAisleBodies?: StorageNoteAisleBodyRecord[]
  activeDomainId: StorageEntityId
  lastOpened?: {
    domainId: StorageEntityId
    spaceId: StorageEntityId
    primeTabId?: StorageEntityId | null
    subTabId: StorageEntityId | null
    viewMode: 'domains' | 'spaces' | 'main' | 'trash' | 'settings' | 'stage-manager'
  }
}

export type StorageRootManifest = StorageSchema3RootManifest | StorageLegacyRootManifest

export type StorageWorkspaceIndex = {
  domains: StorageDomainIndexEntry[]
}

export type StorageNavigationState = {
  activeDomainId: StorageEntityId
  lastOpened?: StorageLegacyRootManifest['lastOpened']
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

export type StorageProfileSettings = {
  schemaVersion: 1
  settings: StorageGlobalSettings
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
