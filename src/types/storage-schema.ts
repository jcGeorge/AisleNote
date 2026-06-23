import type {
  AppMessage,
  AppState,
  AppTheme,
  FrontmatterSettings,
  NoteAisleBody,
  NoteBody,
  NotebookState,
  NotebookTreeItem,
  NoteCursorLocation,
} from './app'

export type StorageSchemaVersion = 1
export type StorageEntityId = string

export const STORAGE_SCHEMA_VERSION: StorageSchemaVersion = 1
export const STORAGE_ROOT_DIR = 'notes' as const
export const STORAGE_SETTINGS_DIR = 'settings' as const
export const STORAGE_ASSETS_DIR = 'assets' as const
export const STORAGE_INTERNAL_DIR = '.aislenote' as const
export const STORAGE_MANIFEST_FILE = 'manifest.json' as const
export const STORAGE_NOTEBOOK_INDEX_FILE = '.aislenote/notebook-index.json' as const
export const STORAGE_NOTE_REGISTRY_FILE = '.aislenote/note-registry.json' as const
export const STORAGE_TRASH_INDEX_FILE = '.aislenote/trash-index.json' as const
export const STORAGE_EDITOR_STATE_FILE = '.aislenote/editor-state.json' as const
export const STORAGE_FRONTMATTER_SETTINGS_FILE = '.aislenote/frontmatter-settings.json' as const
export const STORAGE_APP_STATE_FILE = '.aislenote/app-state.json' as const
export const STORAGE_APP_SETTINGS_FILE = 'app-settings.json' as const

export type StorageRootFileMap = {
  appState: typeof STORAGE_APP_STATE_FILE
  notebookIndex: typeof STORAGE_NOTEBOOK_INDEX_FILE
  noteRegistry: typeof STORAGE_NOTE_REGISTRY_FILE
  trashIndex: typeof STORAGE_TRASH_INDEX_FILE
  editorState: typeof STORAGE_EDITOR_STATE_FILE
  frontmatterSettings: typeof STORAGE_FRONTMATTER_SETTINGS_FILE
  appSettings: `${typeof STORAGE_SETTINGS_DIR}/${typeof STORAGE_APP_SETTINGS_FILE}` | typeof STORAGE_APP_SETTINGS_FILE
}

export type StorageRootManifest = {
  schemaVersion: StorageSchemaVersion
  files: StorageRootFileMap
}

export type StorageNotebookIndex = {
  activeNoteId: StorageEntityId
  items: NotebookTreeItem[]
  settings: NotebookState['settings']
}

export type StorageTrashIndex = {
  deletedItems: NotebookState['deletedItems']
}

export type StorageNoteRegistry = {
  noteBodies: NoteBody[]
  noteAisleBodies: NoteAisleBody[]
}

export type StorageEditorState = {
  noteCursorLocations?: Record<StorageEntityId, NoteCursorLocation>
  headingCollapseState?: Record<StorageEntityId, Record<StorageEntityId, string[]>>
  aisleWidths?: Record<StorageEntityId, Record<StorageEntityId, number>>
}

export type StorageAppSettings = {
  theme: AppTheme
  hotkeys: AppState['hotkeys']
  ui?: Record<string, unknown>
  messages?: AppMessage[]
  scratchpad?: unknown
}

export type StorageFrontmatterSettings = FrontmatterSettings

export type StorageManifest =
  | StorageRootManifest
  | StorageNotebookIndex
  | StorageTrashIndex
  | StorageNoteRegistry
  | StorageEditorState
  | StorageAppSettings
  | StorageFrontmatterSettings
