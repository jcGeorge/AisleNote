import { createDefaultAppState } from '../state/default-app-state.js'
import {
  storageError,
  storageReadOk,
  storageWriteOk,
  type StorageBackend,
  type StorageFileEntry,
  type StorageReadResult,
  type StorageWriteResult,
} from './storage-backend'

export type BrowserStoredFile =
  | {
      path: string
      kind: 'text'
      text: string
    }
  | {
      path: string
      kind: 'binary'
      bytes: Uint8Array
    }

type BrowserStorageRecord = {
  path: string
  kind: 'text' | 'binary'
  data: string | ArrayBuffer
}

const BROWSER_DB_NAME = 'aislenote-notebook-storage'
const BROWSER_DB_VERSION = 1
const BROWSER_FILE_STORE = 'files'

const NOTEBOOK_ROOT_DIR = 'notes'
const NOTEBOOK_INTERNAL_DIR = `${NOTEBOOK_ROOT_DIR}/.aislenote`
const SETTINGS_DIR = 'settings'
const MANIFEST_FILE = `${NOTEBOOK_ROOT_DIR}/manifest.json`
const NOTEBOOK_APP_STATE_FILE = `${NOTEBOOK_INTERNAL_DIR}/app-state.json`
const NOTEBOOK_INDEX_FILE = `${NOTEBOOK_INTERNAL_DIR}/notebook-index.json`
const NOTE_REGISTRY_FILE = `${NOTEBOOK_INTERNAL_DIR}/note-registry.json`
const TRASH_INDEX_FILE = `${NOTEBOOK_INTERNAL_DIR}/trash-index.json`
const EDITOR_STATE_FILE = `${NOTEBOOK_INTERNAL_DIR}/editor-state.json`
const FRONTMATTER_SETTINGS_FILE = `${NOTEBOOK_INTERNAL_DIR}/frontmatter-settings.json`
const APP_SETTINGS_FILE = `${SETTINGS_DIR}/app-settings.json`

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseJsonRecord(value: string | null): Record<string, unknown> | null {
  if (value === null) return null
  try {
    const parsed = JSON.parse(value)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function textFile(path: string, value: unknown): BrowserStoredFile {
  return {
    path,
    kind: 'text',
    text: typeof value === 'string' ? value : stringifyJson(value),
  }
}

function getTextFile(fileMap: Map<string, BrowserStoredFile>, path: string): string | null {
  const entry = fileMap.get(path)
  return entry?.kind === 'text' ? entry.text : null
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

function toUint8Array(value: ArrayBuffer): Uint8Array {
  return new Uint8Array(value.slice(0))
}

function buildManifest() {
  return {
    schemaVersion: 1,
    files: {
      appState: NOTEBOOK_APP_STATE_FILE.slice(`${NOTEBOOK_ROOT_DIR}/`.length),
      notebookIndex: NOTEBOOK_INDEX_FILE.slice(`${NOTEBOOK_ROOT_DIR}/`.length),
      noteRegistry: NOTE_REGISTRY_FILE.slice(`${NOTEBOOK_ROOT_DIR}/`.length),
      trashIndex: TRASH_INDEX_FILE.slice(`${NOTEBOOK_ROOT_DIR}/`.length),
      editorState: EDITOR_STATE_FILE.slice(`${NOTEBOOK_ROOT_DIR}/`.length),
      frontmatterSettings: FRONTMATTER_SETTINGS_FILE.slice(`${NOTEBOOK_ROOT_DIR}/`.length),
      appSettings: APP_SETTINGS_FILE,
    },
  }
}

export function buildHybridFileMapFromSerializedState(serializedState: string): Map<string, BrowserStoredFile> {
  const appState = parseJsonRecord(serializedState)
  if (!appState) return new Map()

  const notebook = isRecord(appState.notebook) ? appState.notebook : {}
  const ui = isRecord(appState.ui) ? appState.ui : {}
  const fileMap = new Map<string, BrowserStoredFile>()
  const noteBodies = Array.isArray(appState.noteBodies) ? appState.noteBodies : []
  const noteAisleBodies = Array.isArray(appState.noteAisleBodies) ? appState.noteAisleBodies : []

  fileMap.set(MANIFEST_FILE, textFile(MANIFEST_FILE, buildManifest()))
  fileMap.set(NOTEBOOK_APP_STATE_FILE, textFile(NOTEBOOK_APP_STATE_FILE, serializedState))
  fileMap.set(NOTEBOOK_INDEX_FILE, textFile(NOTEBOOK_INDEX_FILE, {
    activeNoteId: typeof notebook.activeNoteId === 'string' ? notebook.activeNoteId : '',
    openTabs: Array.isArray(notebook.openTabs) ? notebook.openTabs : [],
    items: Array.isArray(notebook.items) ? notebook.items : [],
    settings: isRecord(notebook.settings) ? notebook.settings : { autoRemoveDeletedDays: 30 },
  }))
  fileMap.set(NOTE_REGISTRY_FILE, textFile(NOTE_REGISTRY_FILE, {
    noteBodies,
    noteAisleBodies,
  }))
  fileMap.set(TRASH_INDEX_FILE, textFile(TRASH_INDEX_FILE, {
    deletedItems: Array.isArray(notebook.deletedItems) ? notebook.deletedItems : [],
  }))
  fileMap.set(EDITOR_STATE_FILE, textFile(EDITOR_STATE_FILE, {
    noteCursorLocations: isRecord(ui.noteCursorLocations) ? ui.noteCursorLocations : {},
    headingCollapseState: isRecord(ui.headingCollapseState) ? ui.headingCollapseState : {},
    aisleWidths: isRecord(ui.aisleWidths) ? ui.aisleWidths : {},
  }))
  fileMap.set(FRONTMATTER_SETTINGS_FILE, textFile(FRONTMATTER_SETTINGS_FILE, appState.frontmatter ?? {}))
  fileMap.set(APP_SETTINGS_FILE, textFile(APP_SETTINGS_FILE, {
    theme: appState.theme,
    hotkeys: appState.hotkeys,
    ui,
    messages: Array.isArray(appState.messages) ? appState.messages : [],
    scratchpad: appState.scratchpad,
  }))

  return fileMap
}

export function readSerializedStateFromHybridFileMap(fileMap: Map<string, BrowserStoredFile>): string | null {
  const cachedState = getTextFile(fileMap, NOTEBOOK_APP_STATE_FILE)
  if (cachedState && parseJsonRecord(cachedState)) return cachedState

  const manifest = parseJsonRecord(getTextFile(fileMap, MANIFEST_FILE))
  if (!manifest) return null
  const notebookIndex = parseJsonRecord(getTextFile(fileMap, NOTEBOOK_INDEX_FILE))
  const noteRegistry = parseJsonRecord(getTextFile(fileMap, NOTE_REGISTRY_FILE))
  if (!notebookIndex || !noteRegistry) return null

  const trashIndex = parseJsonRecord(getTextFile(fileMap, TRASH_INDEX_FILE)) ?? {}
  const appSettings = parseJsonRecord(getTextFile(fileMap, APP_SETTINGS_FILE)) ?? {}
  const editorState = parseJsonRecord(getTextFile(fileMap, EDITOR_STATE_FILE)) ?? {}
  const frontmatterSettings = parseJsonRecord(getTextFile(fileMap, FRONTMATTER_SETTINGS_FILE)) ?? {}
  const defaultState = createDefaultAppState() as Record<string, unknown>
  const defaultNotebook = isRecord(defaultState.notebook) ? defaultState.notebook : {}
  const defaultUi = isRecord(defaultState.ui) ? defaultState.ui : {}

  return JSON.stringify({
    ...defaultState,
    theme: appSettings.theme ?? defaultState.theme,
    hotkeys: appSettings.hotkeys ?? defaultState.hotkeys,
    scratchpad: appSettings.scratchpad ?? defaultState.scratchpad,
    messages: Array.isArray(appSettings.messages) ? appSettings.messages : defaultState.messages,
    frontmatter: Object.keys(frontmatterSettings).length > 0 ? frontmatterSettings : defaultState.frontmatter,
    notebook: {
      ...defaultNotebook,
      activeNoteId: typeof notebookIndex.activeNoteId === 'string' ? notebookIndex.activeNoteId : '',
      openTabs: Array.isArray(notebookIndex.openTabs) ? notebookIndex.openTabs : [],
      items: Array.isArray(notebookIndex.items) ? notebookIndex.items : [],
      deletedItems: Array.isArray(trashIndex.deletedItems) ? trashIndex.deletedItems : [],
      settings: isRecord(notebookIndex.settings) ? notebookIndex.settings : { autoRemoveDeletedDays: 30 },
    },
    noteBodies: Array.isArray(noteRegistry.noteBodies) ? noteRegistry.noteBodies : [],
    noteAisleBodies: Array.isArray(noteRegistry.noteAisleBodies) ? noteRegistry.noteAisleBodies : [],
    ui: {
      ...defaultUi,
      ...(isRecord(appSettings.ui) ? appSettings.ui : {}),
      noteCursorLocations: isRecord(editorState.noteCursorLocations) ? editorState.noteCursorLocations : {},
      headingCollapseState: isRecord(editorState.headingCollapseState) ? editorState.headingCollapseState : {},
      aisleWidths: isRecord(editorState.aisleWidths) ? editorState.aisleWidths : {},
    },
  })
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'))
  })
}

export class BrowserIndexedDbStorageBackend implements StorageBackend {
  private databasePromise: Promise<IDBDatabase> | null = null

  private openDatabase(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise
    this.databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(BROWSER_DB_NAME, BROWSER_DB_VERSION)
      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains(BROWSER_FILE_STORE)) {
          database.createObjectStore(BROWSER_FILE_STORE, { keyPath: 'path' })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed.'))
    })
    return this.databasePromise
  }

  private async getRecord(path: string): Promise<BrowserStorageRecord | null> {
    const database = await this.openDatabase()
    const transaction = database.transaction(BROWSER_FILE_STORE, 'readonly')
    const store = transaction.objectStore(BROWSER_FILE_STORE)
    const record = await requestToPromise<BrowserStorageRecord | undefined>(store.get(path))
    return record ?? null
  }

  async readTextFile(path: string): Promise<StorageReadResult<string>> {
    try {
      const record = await this.getRecord(path)
      return storageReadOk(record?.kind === 'text' && typeof record.data === 'string' ? record.data : null)
    } catch (error) {
      return storageError(error)
    }
  }

  async writeTextFile(path: string, contents: string): Promise<StorageWriteResult> {
    try {
      const database = await this.openDatabase()
      const transaction = database.transaction(BROWSER_FILE_STORE, 'readwrite')
      transaction.objectStore(BROWSER_FILE_STORE).put({ path, kind: 'text', data: contents } satisfies BrowserStorageRecord)
      await transactionDone(transaction)
      return storageWriteOk()
    } catch (error) {
      return storageError(error)
    }
  }

  async readBinaryFile(path: string): Promise<StorageReadResult<ArrayBuffer>> {
    try {
      const record = await this.getRecord(path)
      return storageReadOk(record?.kind === 'binary' && record.data instanceof ArrayBuffer ? record.data : null)
    } catch (error) {
      return storageError(error)
    }
  }

  async writeBinaryFile(path: string, contents: ArrayBuffer): Promise<StorageWriteResult> {
    try {
      const database = await this.openDatabase()
      const transaction = database.transaction(BROWSER_FILE_STORE, 'readwrite')
      transaction.objectStore(BROWSER_FILE_STORE).put({ path, kind: 'binary', data: contents } satisfies BrowserStorageRecord)
      await transactionDone(transaction)
      return storageWriteOk()
    } catch (error) {
      return storageError(error)
    }
  }

  async listFiles(prefix = ''): Promise<StorageReadResult<StorageFileEntry[]>> {
    try {
      const database = await this.openDatabase()
      const transaction = database.transaction(BROWSER_FILE_STORE, 'readonly')
      const records = await requestToPromise<BrowserStorageRecord[]>(transaction.objectStore(BROWSER_FILE_STORE).getAll())
      return storageReadOk(
        records
          .filter((record) => !prefix || record.path === prefix || record.path.startsWith(`${prefix}/`))
          .map((record) => ({ path: record.path, kind: record.kind })),
      )
    } catch (error) {
      return storageError(error)
    }
  }

  async deleteFile(path: string): Promise<StorageWriteResult> {
    try {
      const database = await this.openDatabase()
      const transaction = database.transaction(BROWSER_FILE_STORE, 'readwrite')
      transaction.objectStore(BROWSER_FILE_STORE).delete(path)
      await transactionDone(transaction)
      return storageWriteOk()
    } catch (error) {
      return storageError(error)
    }
  }

  async exists(path: string): Promise<StorageReadResult<boolean>> {
    try {
      return storageReadOk((await this.getRecord(path)) !== null)
    } catch (error) {
      return storageError(error)
    }
  }
}

export async function readFileMapFromStorageBackend(backend: StorageBackend): Promise<Map<string, BrowserStoredFile>> {
  const listed = await backend.listFiles()
  const fileMap = new Map<string, BrowserStoredFile>()
  if (!listed.ok) return fileMap
  for (const entry of listed.value ?? []) {
    if (entry.kind === 'text') {
      const result = await backend.readTextFile(entry.path)
      if (result.ok && typeof result.value === 'string') {
        fileMap.set(entry.path, { path: entry.path, kind: 'text', text: result.value })
      }
      continue
    }
    const result = await backend.readBinaryFile(entry.path)
    if (result.ok && result.value instanceof ArrayBuffer) {
      fileMap.set(entry.path, { path: entry.path, kind: 'binary', bytes: toUint8Array(result.value) })
    }
  }
  return fileMap
}

export async function writeFileMapToStorageBackend(
  backend: StorageBackend,
  fileMap: Map<string, BrowserStoredFile>,
): Promise<void> {
  const listed = await backend.listFiles()
  if (listed.ok) {
    await Promise.all((listed.value ?? []).map((entry) => (fileMap.has(entry.path) ? undefined : backend.deleteFile(entry.path))))
  }

  for (const entry of fileMap.values()) {
    const result = entry.kind === 'text'
      ? await backend.writeTextFile(entry.path, entry.text)
      : await backend.writeBinaryFile(entry.path, toArrayBuffer(entry.bytes))
    if (!result.ok) throw new Error(result.error)
  }
}

export class BrowserHybridStateAdapter {
  private readonly backend: StorageBackend

  constructor(backend: StorageBackend = new BrowserIndexedDbStorageBackend()) {
    this.backend = backend
  }

  async loadSerializedState(): Promise<string | null> {
    try {
      const fileMap = await readFileMapFromStorageBackend(this.backend)
      return readSerializedStateFromHybridFileMap(fileMap)
    } catch {
      return null
    }
  }

  async saveSerializedState(serializedState: string): Promise<void> {
    try {
      const fileMap = buildHybridFileMapFromSerializedState(serializedState)
      if (fileMap.size === 0) return
      await writeFileMapToStorageBackend(this.backend, fileMap)
    } catch {
      // Browser and Capacitor persistence mirror local cache state; failures must remain non-fatal.
    }
  }
}
