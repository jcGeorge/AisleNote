export type StorageSchemaVersion = 1

export type StorageEntityId = string
export type StorageTheme = 'dark' | 'light' | 'dawn' | 'blues'
export type StorageShortcutId =
  | 'toggleTabTrash'
  | 'openDomains'
  | 'openSpaces'
  | 'newTab'
  | 'newSubTab'
  | 'cycleSubTabNext'
  | 'cycleSubTabPrev'

export const STORAGE_SCHEMA_VERSION: StorageSchemaVersion = 1

export const STORAGE_ROOT_DIR = 'notes-data' as const
export const STORAGE_TOPICS_DIR = 'topics' as const
export const STORAGE_SPACES_DIR = 'spaces' as const
export const STORAGE_NOTES_DIR = 'notes' as const
export const STORAGE_NOTE_BODIES_DIR = 'note-bodies' as const
export const STORAGE_SUBTABS_DIR = 'subtabs' as const
export const STORAGE_AISLES_DIR = 'aisles' as const
export const STORAGE_ASSETS_DIR = 'assets' as const
export const STORAGE_TRASH_DIR = 'trash' as const
export const STORAGE_MANIFEST_FILE = 'manifest.json' as const
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
  | 'operationsMenu'
export type StorageNewlineShortcutId = 'controlEnter' | 'shiftEnter' | 'commandEnter'

export type StorageGlobalSettings = {
  theme: StorageTheme
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
    stageManagerOpenDestinationAfterApply: boolean
    tabButtonScale: number
    noteFontScale: number
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
  }
}

export type StorageTopicIndexEntry = {
  id: StorageEntityId
  title: string
}

export type StorageSpaceIndexEntry = {
  id: StorageEntityId
  title: string
}

export type StorageNoteAisleRecord = {
  id: StorageEntityId
  file: string
}

export type StorageNoteBodyRecord = {
  id: StorageEntityId
  aisles: StorageNoteAisleRecord[]
}

export type StorageRootManifest = {
  schemaVersion: StorageSchemaVersion
  globalSettings: StorageGlobalSettings
  topics: StorageTopicIndexEntry[]
  noteBodies?: StorageNoteBodyRecord[]
  activeTopicId: StorageEntityId
  lastOpened?: {
    topicId: StorageEntityId
    spaceId: StorageEntityId
    parentTabId: StorageEntityId | null
    subTabId: StorageEntityId | null
    viewMode: 'domains' | 'spaces' | 'main' | 'trash' | 'settings' | 'stage-manager'
  }
}

export type StorageTopicManifest = {
  id: StorageEntityId
  title: string
  spaces: StorageSpaceIndexEntry[]
  activeSpaceId: StorageEntityId
  createdAt?: number
  updatedAt?: number
}

export type StorageSpaceSettings = {
  autoRemoveDeletedDays: number
}

export type StorageSubTabRecord = {
  id: StorageEntityId
  title: string
  noteBodyId?: StorageEntityId
  file: string
  createdAt?: number
  updatedAt?: number
}

export type StorageTabRecord = {
  id: StorageEntityId
  title: string
  noteBodyId?: StorageEntityId
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
  file: string
  deletedAt: number
  parentTabTitle?: string
  activeSubTabId?: StorageEntityId | null
  subTabs?: StorageSubTabRecord[]
  original: {
    topicId: StorageEntityId
    spaceId: StorageEntityId
    parentTabId: StorageEntityId
    subTabId: StorageEntityId | null
  }
}

export type StorageTrashManifest = {
  items: StorageTrashItemRecord[]
}

export type StorageManifest =
  | StorageRootManifest
  | StorageTopicManifest
  | StorageSpaceManifest
  | StorageTrashManifest
