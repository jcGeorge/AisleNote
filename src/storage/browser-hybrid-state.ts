import {
  STORAGE_ASSETS_DIR,
  STORAGE_HOME_NOTE_FILE,
  STORAGE_MANIFEST_FILE,
  STORAGE_NOTES_DIR,
  STORAGE_ROOT_DIR,
  STORAGE_SCHEMA_VERSION,
  STORAGE_SPACES_DIR,
  STORAGE_SUBTABS_DIR,
  STORAGE_TOPICS_DIR,
  STORAGE_TRASH_DIR,
} from '../types/storage-schema'

type BrowserStoredFile =
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

type AssetBank = {
  assetRootRelative: string
  files: Map<string, Uint8Array>
  keys: Map<string, string>
}

const BROWSER_DB_NAME = 'tabs-hybrid-storage'
const BROWSER_DB_VERSION = 1
const BROWSER_FILE_STORE = 'files'
const DEFAULT_TOPIC_ID = 'default-topic'
const DEFAULT_TOPIC_TITLE = 'Default'
const DEFAULT_AUTO_REMOVE_DAYS = 7
const IMAGE_MARKDOWN_PATTERN = /!\[([^\]]*)\]\(([^)]+)\)/g

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function ensureArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function normalizePosixPath(value: string): string {
  const isAbsolute = value.startsWith('/')
  const segments = value
    .split('/')
    .filter((segment) => segment.length > 0 && segment !== '.')
    .reduce<string[]>((acc, segment) => {
      if (segment === '..') {
        if (acc.length > 0) acc.pop()
        return acc
      }
      acc.push(segment)
      return acc
    }, [])
  const normalized = segments.join('/')
  if (!normalized) return isAbsolute ? '/' : ''
  return isAbsolute ? `/${normalized}` : normalized
}

function joinPosix(...parts: string[]): string {
  return normalizePosixPath(parts.filter((part) => part.length > 0).join('/'))
}

function dirnamePosix(value: string): string {
  const normalized = normalizePosixPath(value)
  const index = normalized.lastIndexOf('/')
  return index >= 0 ? normalized.slice(0, index) : ''
}

function basenamePosix(value: string): string {
  const normalized = normalizePosixPath(value)
  const index = normalized.lastIndexOf('/')
  return index >= 0 ? normalized.slice(index + 1) : normalized
}

function relativePosix(fromDirectory: string, toPath: string): string {
  const fromParts = normalizePosixPath(fromDirectory)
    .split('/')
    .filter((part) => part.length > 0)
  const toParts = normalizePosixPath(toPath)
    .split('/')
    .filter((part) => part.length > 0)

  let commonLength = 0
  while (
    commonLength < fromParts.length &&
    commonLength < toParts.length &&
    fromParts[commonLength] === toParts[commonLength]
  ) {
    commonLength += 1
  }

  const upParts = Array.from({ length: fromParts.length - commonLength }, () => '..')
  const downParts = toParts.slice(commonLength)
  const relative = [...upParts, ...downParts].join('/')
  return relative.length > 0 ? relative : basenamePosix(toPath)
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

function normalizeImageExtension(raw: string): string {
  const normalized = raw.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (normalized === 'jpeg') return 'jpg'
  return normalized || 'png'
}

function getExtensionFromMimeType(mimeType: string): string {
  if (!mimeType.startsWith('image/')) return 'png'
  return normalizeImageExtension(mimeType.slice('image/'.length))
}

function getMimeTypeFromExtension(extension: string): string {
  const normalized = normalizeImageExtension(extension)
  if (normalized === 'jpg') return 'image/jpeg'
  if (normalized === 'svg') return 'image/svg+xml'
  return `image/${normalized}`
}

function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; extension: string } | null {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/)
  if (!match) return null
  try {
    const binary = atob(match[2])
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    return {
      bytes,
      extension: getExtensionFromMimeType(match[1]),
    }
  } catch {
    return null
  }
}

function encodeDataUrl(bytes: Uint8Array, extension: string): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index])
  }
  return `data:${getMimeTypeFromExtension(extension)};base64,${btoa(binary)}`
}

function createAssetHash(bytes: Uint8Array): string {
  let hashA = 2166136261
  let hashB = 16777619
  for (let index = 0; index < bytes.length; index += 1) {
    hashA ^= bytes[index]
    hashA = Math.imul(hashA, 16777619) >>> 0
    hashB ^= Math.imul(bytes[index] + index + 1, 1315423911) >>> 0
    hashB = Math.imul(hashB, 2246822519) >>> 0
  }
  return `${hashA.toString(16).padStart(8, '0')}${hashB.toString(16).padStart(8, '0')}`
}

function createAssetBank(assetRootRelative = STORAGE_ASSETS_DIR): AssetBank {
  return {
    assetRootRelative,
    files: new Map<string, Uint8Array>(),
    keys: new Map<string, string>(),
  }
}

function addAssetToBank(assetBank: AssetBank, bytes: Uint8Array, extension: string): string {
  const normalizedExtension = normalizeImageExtension(extension)
  const hash = createAssetHash(bytes)
  const key = `${hash}.${normalizedExtension}`
  const existing = assetBank.keys.get(key)
  if (existing) return existing

  const relativePath = joinPosix(assetBank.assetRootRelative, `asset-${hash}.${normalizedExtension}`)
  assetBank.keys.set(key, relativePath)
  assetBank.files.set(relativePath, bytes)
  return relativePath
}

function setTextFile(fileMap: Map<string, BrowserStoredFile>, path: string, text: string) {
  fileMap.set(path, { path, kind: 'text', text })
}

function setBinaryFile(fileMap: Map<string, BrowserStoredFile>, path: string, bytes: Uint8Array) {
  fileMap.set(path, { path, kind: 'binary', bytes })
}

function getTextFile(fileMap: Map<string, BrowserStoredFile>, path: string): string | null {
  const entry = fileMap.get(path)
  return entry?.kind === 'text' ? entry.text : null
}

function getBinaryFile(fileMap: Map<string, BrowserStoredFile>, path: string): Uint8Array | null {
  const entry = fileMap.get(path)
  return entry?.kind === 'binary' ? entry.bytes : null
}

function externalizeMarkdownImages(markdown: string, noteFileRelative: string, assetBank: AssetBank): string {
  return markdown.replace(IMAGE_MARKDOWN_PATTERN, (fullMatch, altText: string, srcRaw: string) => {
    const src = srcRaw.trim()
    if (!src.startsWith('data:image/')) return fullMatch
    const decoded = decodeDataUrl(src)
    if (!decoded) return fullMatch

    const assetRelativePath = addAssetToBank(assetBank, decoded.bytes, decoded.extension)
    const noteDirectory = dirnamePosix(noteFileRelative)
    const nextSrc = relativePosix(noteDirectory, assetRelativePath)
    return `![${altText}](${nextSrc})`
  })
}

function inlineMarkdownImages(markdown: string, notePath: string, fileMap: Map<string, BrowserStoredFile>): string {
  return markdown.replace(IMAGE_MARKDOWN_PATTERN, (fullMatch, altText: string, srcRaw: string) => {
    const src = srcRaw.trim()
    if (!src || src.startsWith('data:')) return fullMatch
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(src) && !src.startsWith('file://')) return fullMatch

    const assetPath = normalizePosixPath(joinPosix(dirnamePosix(notePath), src))
    const assetBytes = getBinaryFile(fileMap, assetPath)
    if (!assetBytes) return fullMatch

    const extension = normalizeImageExtension(assetPath.split('.').pop() ?? 'png')
    return `![${altText}](${encodeDataUrl(assetBytes, extension)})`
  })
}

function buildRootManifest(appState: Record<string, unknown>) {
  const spaces = ensureArray<Record<string, unknown>>(appState.spaces)
  const activeSpace = spaces.find((space) => space.id === appState.activeSpaceId) ?? spaces[0] ?? null
  const activeSpaceData = isRecord(activeSpace?.data) ? activeSpace.data : null
  const activeTabs = ensureArray<Record<string, unknown>>(activeSpaceData?.tabs)
  const activeTab = activeTabs.find((tab) => tab.id === activeSpaceData?.activeTabId) ?? activeTabs[0] ?? null

  return {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    globalSettings: {
      theme: appState.theme === 'light' ? 'light' : 'dark',
      hotkeys:
        isRecord(appState.hotkeys)
          ? appState.hotkeys
          : {
              shortcuts: {},
              enableMouseBackForward: true,
              enableGenericHistoryHotkeys: true,
            },
    },
    topics: [{ id: DEFAULT_TOPIC_ID, title: DEFAULT_TOPIC_TITLE }],
    activeTopicId: DEFAULT_TOPIC_ID,
    lastOpened: activeSpace
      ? {
          topicId: DEFAULT_TOPIC_ID,
          spaceId: typeof activeSpace.id === 'string' ? activeSpace.id : '',
          parentTabId: typeof activeTab?.id === 'string' ? activeTab.id : null,
          subTabId: typeof activeTab?.activeSubTabId === 'string' ? activeTab.activeSubTabId : null,
          viewMode: 'main',
        }
      : undefined,
  }
}

function buildTopicManifest(appState: Record<string, unknown>) {
  const spaces = ensureArray<Record<string, unknown>>(appState.spaces)
  return {
    id: DEFAULT_TOPIC_ID,
    title: DEFAULT_TOPIC_TITLE,
    spaces: spaces.map((space) => ({
      id: typeof space.id === 'string' ? space.id : '',
      title: typeof space.name === 'string' ? space.name : 'Untitled Space',
    })),
    activeSpaceId:
      typeof appState.activeSpaceId === 'string' && spaces.some((space) => space.id === appState.activeSpaceId)
        ? appState.activeSpaceId
        : (typeof spaces[0]?.id === 'string' ? spaces[0].id : ''),
  }
}

function writeAssetBank(fileMap: Map<string, BrowserStoredFile>, basePath: string, assetBank: AssetBank) {
  for (const [relativePath, bytes] of assetBank.files.entries()) {
    setBinaryFile(fileMap, joinPosix(basePath, relativePath), bytes)
  }
}

function writeSpaceFiles(fileMap: Map<string, BrowserStoredFile>, space: Record<string, unknown>) {
  const spaceId = typeof space.id === 'string' ? space.id : ''
  if (!spaceId) return

  const spaceRoot = joinPosix(
    STORAGE_ROOT_DIR,
    STORAGE_TOPICS_DIR,
    DEFAULT_TOPIC_ID,
    STORAGE_SPACES_DIR,
    spaceId,
  )
  const trashRoot = joinPosix(spaceRoot, STORAGE_TRASH_DIR)
  const tabs = ensureArray<Record<string, unknown>>(isRecord(space.data) ? space.data.tabs : [])
  const activeAssetBank = createAssetBank(STORAGE_ASSETS_DIR)
  const trashAssetBank = createAssetBank(STORAGE_ASSETS_DIR)

  const tabManifest = tabs.map((tab) => {
    const tabId = typeof tab.id === 'string' ? tab.id : ''
    const homeNoteFile = joinPosix(STORAGE_NOTES_DIR, tabId, STORAGE_HOME_NOTE_FILE)
    const homeContent = typeof tab.homeContent === 'string' ? tab.homeContent : ''
    setTextFile(
      fileMap,
      joinPosix(spaceRoot, homeNoteFile),
      externalizeMarkdownImages(homeContent, homeNoteFile, activeAssetBank),
    )

    const subTabs = ensureArray<Record<string, unknown>>(tab.subTabs).map((subTab) => {
      const subTabId = typeof subTab.id === 'string' ? subTab.id : ''
      const file = joinPosix(STORAGE_NOTES_DIR, tabId, STORAGE_SUBTABS_DIR, `${subTabId}.md`)
      const content = typeof subTab.content === 'string' ? subTab.content : ''
      setTextFile(fileMap, joinPosix(spaceRoot, file), externalizeMarkdownImages(content, file, activeAssetBank))
      return {
        id: subTabId,
        title: typeof subTab.title === 'string' ? subTab.title : 'tab',
        file,
      }
    })

    return {
      id: tabId,
      title: typeof tab.title === 'string' ? tab.title : 'tab',
      homeNoteFile,
      subTabs,
      activeSubTabId: typeof tab.activeSubTabId === 'string' ? tab.activeSubTabId : null,
    }
  })

  const deletedTabs = ensureArray<Record<string, unknown>>(isRecord(space.data) ? space.data.deletedTabs : [])
  const deletedSubTabs = ensureArray<Record<string, unknown>>(isRecord(space.data) ? space.data.deletedSubTabs : [])
  const trashItems: Array<Record<string, unknown>> = []

  deletedTabs.forEach((entry) => {
    const deletedTab = isRecord(entry.tab) ? entry.tab : {}
    const entryId = typeof entry.id === 'string' ? entry.id : ''
    const homeNoteFile = joinPosix(STORAGE_NOTES_DIR, entryId, STORAGE_HOME_NOTE_FILE)
    setTextFile(
      fileMap,
      joinPosix(trashRoot, homeNoteFile),
      externalizeMarkdownImages(
        typeof deletedTab.homeContent === 'string' ? deletedTab.homeContent : '',
        homeNoteFile,
        trashAssetBank,
      ),
    )

    const subTabs = ensureArray<Record<string, unknown>>(deletedTab.subTabs).map((subTab) => {
      const subTabId = typeof subTab.id === 'string' ? subTab.id : ''
      const file = joinPosix(STORAGE_NOTES_DIR, entryId, STORAGE_SUBTABS_DIR, `${subTabId}.md`)
      setTextFile(
        fileMap,
        joinPosix(trashRoot, file),
        externalizeMarkdownImages(typeof subTab.content === 'string' ? subTab.content : '', file, trashAssetBank),
      )
      return {
        id: subTabId,
        title: typeof subTab.title === 'string' ? subTab.title : 'tab',
        file,
      }
    })

    trashItems.push({
      id: entryId,
      type: 'parent-tab',
      title: typeof deletedTab.title === 'string' ? deletedTab.title : 'deleted tab',
      file: homeNoteFile,
      deletedAt: typeof entry.deletedAt === 'number' ? entry.deletedAt : Date.now(),
      original: {
        topicId: DEFAULT_TOPIC_ID,
        spaceId,
        parentTabId: typeof deletedTab.id === 'string' ? deletedTab.id : entryId,
        subTabId: null,
      },
      activeSubTabId: typeof deletedTab.activeSubTabId === 'string' ? deletedTab.activeSubTabId : null,
      subTabs,
    })
  })

  deletedSubTabs.forEach((entry) => {
    const subTab = isRecord(entry.subTab) ? entry.subTab : {}
    const entryId = typeof entry.id === 'string' ? entry.id : ''
    const file = joinPosix(STORAGE_NOTES_DIR, `${entryId}.md`)
    setTextFile(
      fileMap,
      joinPosix(trashRoot, file),
      externalizeMarkdownImages(typeof subTab.content === 'string' ? subTab.content : '', file, trashAssetBank),
    )

    trashItems.push({
      id: entryId,
      type: 'subtab',
      title: typeof subTab.title === 'string' ? subTab.title : 'deleted note',
      file,
      deletedAt: typeof entry.deletedAt === 'number' ? entry.deletedAt : Date.now(),
      parentTabTitle: typeof entry.parentTabTitle === 'string' ? entry.parentTabTitle : 'Unknown Tab',
      original: {
        topicId: DEFAULT_TOPIC_ID,
        spaceId,
        parentTabId: typeof entry.parentTabId === 'string' ? entry.parentTabId : '',
        subTabId: typeof subTab.id === 'string' ? subTab.id : null,
      },
    })
  })

  writeAssetBank(fileMap, spaceRoot, activeAssetBank)
  writeAssetBank(fileMap, trashRoot, trashAssetBank)

  setTextFile(
    fileMap,
    joinPosix(spaceRoot, STORAGE_MANIFEST_FILE),
    JSON.stringify(
      {
        id: spaceId,
        title: typeof space.name === 'string' ? space.name : 'Untitled Space',
        settings:
          isRecord(space.settings) ? space.settings : { autoRemoveDeletedDays: DEFAULT_AUTO_REMOVE_DAYS },
        tabs: tabManifest,
        activeTabId:
          isRecord(space.data) && typeof space.data.activeTabId === 'string'
            ? space.data.activeTabId
            : (typeof tabManifest[0]?.id === 'string' ? tabManifest[0].id : ''),
        trashManifestFile: `${STORAGE_TRASH_DIR}/${STORAGE_MANIFEST_FILE}`,
      },
      null,
      2,
    ),
  )

  setTextFile(
    fileMap,
    joinPosix(trashRoot, STORAGE_MANIFEST_FILE),
    JSON.stringify({ items: trashItems }, null, 2),
  )
}

export function buildHybridFileMapFromSerializedState(serializedState: string): Map<string, BrowserStoredFile> {
  const parsed = JSON.parse(serializedState) as Record<string, unknown>
  const fileMap = new Map<string, BrowserStoredFile>()

  setTextFile(fileMap, joinPosix(STORAGE_ROOT_DIR, STORAGE_MANIFEST_FILE), JSON.stringify(buildRootManifest(parsed), null, 2))
  setTextFile(
    fileMap,
    joinPosix(STORAGE_ROOT_DIR, STORAGE_TOPICS_DIR, DEFAULT_TOPIC_ID, STORAGE_MANIFEST_FILE),
    JSON.stringify(buildTopicManifest(parsed), null, 2),
  )

  ensureArray<Record<string, unknown>>(parsed.spaces).forEach((space) => {
    writeSpaceFiles(fileMap, space)
  })

  return fileMap
}

function readTextFileWithInlinedImages(fileMap: Map<string, BrowserStoredFile>, path: string): string {
  const text = getTextFile(fileMap, path) ?? ''
  return inlineMarkdownImages(text, path, fileMap)
}

export function readSerializedStateFromHybridFileMap(fileMap: Map<string, BrowserStoredFile>): string | null {
  const rootManifestRaw = getTextFile(fileMap, joinPosix(STORAGE_ROOT_DIR, STORAGE_MANIFEST_FILE))
  if (!rootManifestRaw) return null

  let rootManifest: Record<string, unknown>
  try {
    rootManifest = JSON.parse(rootManifestRaw) as Record<string, unknown>
  } catch {
    return null
  }

  if (rootManifest.schemaVersion !== STORAGE_SCHEMA_VERSION) return null

  const topicManifestRaw = getTextFile(
    fileMap,
    joinPosix(STORAGE_ROOT_DIR, STORAGE_TOPICS_DIR, DEFAULT_TOPIC_ID, STORAGE_MANIFEST_FILE),
  )
  if (!topicManifestRaw) return null

  let topicManifest: Record<string, unknown>
  try {
    topicManifest = JSON.parse(topicManifestRaw) as Record<string, unknown>
  } catch {
    return null
  }

  const spaces = ensureArray<Record<string, unknown>>(topicManifest.spaces)
    .map((spaceEntry) => {
      const spaceId = typeof spaceEntry.id === 'string' ? spaceEntry.id : ''
      if (!spaceId) return null

      const spaceRoot = joinPosix(STORAGE_ROOT_DIR, STORAGE_TOPICS_DIR, DEFAULT_TOPIC_ID, STORAGE_SPACES_DIR, spaceId)
      const spaceManifestRaw = getTextFile(fileMap, joinPosix(spaceRoot, STORAGE_MANIFEST_FILE))
      if (!spaceManifestRaw) return null

      let spaceManifest: Record<string, unknown>
      try {
        spaceManifest = JSON.parse(spaceManifestRaw) as Record<string, unknown>
      } catch {
        return null
      }

      const tabs = ensureArray<Record<string, unknown>>(spaceManifest.tabs).map((tabRecord) => {
        const tabId = typeof tabRecord.id === 'string' ? tabRecord.id : ''
        const homeNoteFile = typeof tabRecord.homeNoteFile === 'string' ? tabRecord.homeNoteFile : ''
        return {
          id: tabId,
          title: typeof tabRecord.title === 'string' ? tabRecord.title : 'tab',
          homeContent: readTextFileWithInlinedImages(fileMap, joinPosix(spaceRoot, homeNoteFile)),
          activeSubTabId: typeof tabRecord.activeSubTabId === 'string' ? tabRecord.activeSubTabId : null,
          subTabs: ensureArray<Record<string, unknown>>(tabRecord.subTabs).map((subTabRecord) => ({
            id: typeof subTabRecord.id === 'string' ? subTabRecord.id : '',
            title: typeof subTabRecord.title === 'string' ? subTabRecord.title : 'tab',
            content: readTextFileWithInlinedImages(
              fileMap,
              joinPosix(spaceRoot, typeof subTabRecord.file === 'string' ? subTabRecord.file : ''),
            ),
          })),
        }
      })

      const trashManifestRaw = getTextFile(
        fileMap,
        joinPosix(spaceRoot, typeof spaceManifest.trashManifestFile === 'string' ? spaceManifest.trashManifestFile : `${STORAGE_TRASH_DIR}/${STORAGE_MANIFEST_FILE}`),
      )

      let trashItems: Array<Record<string, unknown>> = []
      if (trashManifestRaw) {
        try {
          const parsedTrash = JSON.parse(trashManifestRaw) as Record<string, unknown>
          trashItems = ensureArray<Record<string, unknown>>(parsedTrash.items)
        } catch {
          trashItems = []
        }
      }

      const trashRoot = joinPosix(spaceRoot, STORAGE_TRASH_DIR)
      const deletedTabs = trashItems
        .filter((item) => item.type === 'parent-tab')
        .map((item) => ({
          id: typeof item.id === 'string' ? item.id : '',
          deletedAt: typeof item.deletedAt === 'number' ? item.deletedAt : Date.now(),
          tab: {
            id: isRecord(item.original) && typeof item.original.parentTabId === 'string' ? item.original.parentTabId : '',
            title: typeof item.title === 'string' ? item.title : 'deleted tab',
            homeContent: readTextFileWithInlinedImages(
              fileMap,
              joinPosix(trashRoot, typeof item.file === 'string' ? item.file : ''),
            ),
            activeSubTabId: typeof item.activeSubTabId === 'string' ? item.activeSubTabId : null,
            subTabs: ensureArray<Record<string, unknown>>(item.subTabs).map((subTabRecord) => ({
              id: typeof subTabRecord.id === 'string' ? subTabRecord.id : '',
              title: typeof subTabRecord.title === 'string' ? subTabRecord.title : 'tab',
              content: readTextFileWithInlinedImages(
                fileMap,
                joinPosix(trashRoot, typeof subTabRecord.file === 'string' ? subTabRecord.file : ''),
              ),
            })),
          },
        }))

      const deletedSubTabs = trashItems
        .filter((item) => item.type === 'subtab')
        .map((item) => ({
          id: typeof item.id === 'string' ? item.id : '',
          parentTabId:
            isRecord(item.original) && typeof item.original.parentTabId === 'string' ? item.original.parentTabId : '',
          parentTabTitle: typeof item.parentTabTitle === 'string' ? item.parentTabTitle : 'Unknown Tab',
          deletedAt: typeof item.deletedAt === 'number' ? item.deletedAt : Date.now(),
          subTab: {
            id: isRecord(item.original) && typeof item.original.subTabId === 'string' ? item.original.subTabId : '',
            title: typeof item.title === 'string' ? item.title : 'deleted note',
            content: readTextFileWithInlinedImages(
              fileMap,
              joinPosix(trashRoot, typeof item.file === 'string' ? item.file : ''),
            ),
          },
        }))

      return {
        id: typeof spaceManifest.id === 'string' ? spaceManifest.id : spaceId,
        name: typeof spaceManifest.title === 'string' ? spaceManifest.title : typeof spaceEntry.title === 'string' ? spaceEntry.title : 'Untitled Space',
        settings:
          isRecord(spaceManifest.settings)
            ? spaceManifest.settings
            : { autoRemoveDeletedDays: DEFAULT_AUTO_REMOVE_DAYS },
        data: {
          activeTabId:
            typeof spaceManifest.activeTabId === 'string' && tabs.some((tab) => tab.id === spaceManifest.activeTabId)
              ? spaceManifest.activeTabId
              : (typeof tabs[0]?.id === 'string' ? tabs[0].id : ''),
          tabs,
          deletedTabs,
          deletedSubTabs,
        },
      }
    })
    .filter((space) => space !== null)

  if (spaces.length === 0) return null

  const activeSpaceId =
    isRecord(rootManifest.lastOpened) && typeof rootManifest.lastOpened.spaceId === 'string'
      ? rootManifest.lastOpened.spaceId
      : typeof topicManifest.activeSpaceId === 'string'
        ? topicManifest.activeSpaceId
        : typeof spaces[0]?.id === 'string'
          ? spaces[0].id
          : ''

  return JSON.stringify({
    theme: isRecord(rootManifest.globalSettings) && rootManifest.globalSettings.theme === 'light' ? 'light' : 'dark',
    activeSpaceId,
    spaces,
    hotkeys: isRecord(rootManifest.globalSettings) ? rootManifest.globalSettings.hotkeys : undefined,
  })
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(BROWSER_DB_NAME, BROWSER_DB_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(BROWSER_FILE_STORE)) {
        database.createObjectStore(BROWSER_FILE_STORE, { keyPath: 'path' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'))
  })
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
  })
}

async function readFileMapFromIndexedDb(): Promise<Map<string, BrowserStoredFile>> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(BROWSER_FILE_STORE, 'readonly')
    const store = transaction.objectStore(BROWSER_FILE_STORE)
    const request = store.getAll()

    const records = await new Promise<BrowserStorageRecord[]>((resolve, reject) => {
      request.onsuccess = () => resolve((request.result as BrowserStorageRecord[]) ?? [])
      request.onerror = () => reject(request.error ?? new Error('IndexedDB getAll failed'))
    })
    await waitForTransaction(transaction)

    const fileMap = new Map<string, BrowserStoredFile>()
    records.forEach((record) => {
      if (record.kind === 'text' && typeof record.data === 'string') {
        fileMap.set(record.path, { path: record.path, kind: 'text', text: record.data })
        return
      }
      if (record.kind === 'binary' && record.data instanceof ArrayBuffer) {
        fileMap.set(record.path, { path: record.path, kind: 'binary', bytes: new Uint8Array(record.data) })
      }
    })
    return fileMap
  } finally {
    database.close()
  }
}

async function writeFileMapToIndexedDb(fileMap: Map<string, BrowserStoredFile>): Promise<void> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(BROWSER_FILE_STORE, 'readwrite')
    const store = transaction.objectStore(BROWSER_FILE_STORE)
    store.clear()

    fileMap.forEach((entry) => {
      const record: BrowserStorageRecord =
        entry.kind === 'text'
          ? { path: entry.path, kind: 'text', data: entry.text }
          : { path: entry.path, kind: 'binary', data: toArrayBuffer(entry.bytes) }
      store.put(record)
    })

    await waitForTransaction(transaction)
  } finally {
    database.close()
  }
}

export class BrowserHybridStateAdapter {
  private saveQueue: Promise<void> = Promise.resolve()

  async loadSerializedState(): Promise<string | null> {
    try {
      const fileMap = await readFileMapFromIndexedDb()
      if (fileMap.size === 0) return null
      return readSerializedStateFromHybridFileMap(fileMap)
    } catch {
      return null
    }
  }

  async saveSerializedState(serializedState: string): Promise<void> {
    this.saveQueue = this.saveQueue
      .catch(() => undefined)
      .then(async () => {
        const fileMap = buildHybridFileMapFromSerializedState(serializedState)
        await writeFileMapToIndexedDb(fileMap)
      })

    return this.saveQueue
  }
}
