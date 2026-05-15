import {
  STORAGE_ASSETS_DIR,
  STORAGE_AISLES_DIR,
  STORAGE_HOME_NOTE_FILE,
  STORAGE_MANIFEST_FILE,
  STORAGE_NOTE_BODIES_DIR,
  STORAGE_NOTES_DIR,
  STORAGE_ROOT_DIR,
  STORAGE_SCHEMA_VERSION,
  STORAGE_SPACES_DIR,
  STORAGE_SUBTABS_DIR,
  STORAGE_TOPICS_DIR,
  STORAGE_TRASH_DIR,
} from '../types/storage-schema'
import { splitImageResizeMetadataFromUrl } from '../markdown/image-metadata'
import {
  storageError,
  storageReadOk,
  storageWriteOk,
  type StorageBackend,
  type StorageFileEntry,
} from './storage-backend'
import { migrateStorageRootManifest } from './storage-migrations'
import {
  DEFAULT_AUTO_REMOVE_DAYS,
  DEFAULT_DOMAIN_NAME,
  DEFAULT_TOPIC_ID,
  DEFAULT_TOPIC_TITLE,
  IMAGE_MARKDOWN_PATTERN,
  ensureArray,
  getActiveDomainFromAppState,
  getActiveSpaceFromDomain,
  getDomainId,
  getDomainTitle,
  getDomainsFromAppState,
  getExtensionFromMimeType,
  getMimeTypeFromExtension,
  getNoteBodiesFromAppState,
  getNoteBodyFirstMarkdown,
  getThemeForStorage,
  isRecord,
  normalizeImageExtension,
  normalizeStorageTheme,
} from './hybrid-storage-core.js'

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
    const { imageUrl, metadataFragment } = splitImageResizeMetadataFromUrl(src)
    if (!imageUrl.startsWith('data:image/')) return fullMatch
    const decoded = decodeDataUrl(imageUrl)
    if (!decoded) return fullMatch

    const assetRelativePath = addAssetToBank(assetBank, decoded.bytes, decoded.extension)
    const noteDirectory = dirnamePosix(noteFileRelative)
    const nextSrc = relativePosix(noteDirectory, assetRelativePath)
    return `![${altText}](${nextSrc}${metadataFragment})`
  })
}

function inlineMarkdownImages(markdown: string, notePath: string, fileMap: Map<string, BrowserStoredFile>): string {
  return markdown.replace(IMAGE_MARKDOWN_PATTERN, (fullMatch, altText: string, srcRaw: string) => {
    const src = srcRaw.trim()
    if (!src || src.startsWith('data:')) return fullMatch
    const { imageUrl, metadataFragment } = splitImageResizeMetadataFromUrl(src)
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(imageUrl) && !imageUrl.startsWith('file://')) return fullMatch

    const assetPath = normalizePosixPath(joinPosix(dirnamePosix(notePath), imageUrl))
    const assetBytes = getBinaryFile(fileMap, assetPath)
    if (!assetBytes) return fullMatch

    const extension = normalizeImageExtension(assetPath.split('.').pop() ?? 'png')
    return `![${altText}](${encodeDataUrl(assetBytes, extension)}${metadataFragment})`
  })
}

function buildRootManifest(appState: Record<string, unknown>) {
  const domains = getDomainsFromAppState(appState)
  const noteBodies = getNoteBodiesFromAppState(appState)
  const activeDomain = getActiveDomainFromAppState(appState, domains)
  const activeSpace = getActiveSpaceFromDomain(activeDomain, appState.activeSpaceId)
  const activeSpaceData = isRecord(activeSpace?.data) ? activeSpace.data : null
  const activeTabs = ensureArray<Record<string, unknown>>(activeSpaceData?.tabs)
  const activeTab = activeTabs.find((tab) => tab.id === activeSpaceData?.activeTabId) ?? activeTabs[0] ?? null
  const activeDomainId = activeDomain ? getDomainId(activeDomain) : DEFAULT_TOPIC_ID

  return {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    globalSettings: {
      theme: getThemeForStorage(appState),
      hotkeys:
        isRecord(appState.hotkeys)
          ? appState.hotkeys
          : {
              shortcuts: {},
              enableMouseBackForward: true,
              enableGenericHistoryHotkeys: true,
            },
      ui:
        isRecord(appState.ui)
          ? appState.ui
          : {
              showParentHomeTab: true,
              stageManagerOpenDestinationAfterApply: true,
              tabButtonScale: 1,
              noteFontScale: 1,
              noteCursorLocations: {},
            },
    },
    topics:
      domains.length > 0
        ? domains.map((domain) => ({
            id: getDomainId(domain),
            title: getDomainTitle(domain),
          }))
        : [{ id: DEFAULT_TOPIC_ID, title: DEFAULT_TOPIC_TITLE }],
    noteBodies: noteBodies.map((body) => {
      const bodyId = typeof body.id === 'string' ? body.id : ''
      return {
        id: bodyId,
        aisles: ensureArray<Record<string, unknown>>(body.aisles).map((aisle) => {
          const aisleId = typeof aisle.id === 'string' ? aisle.id : ''
          return {
            id: aisleId,
            file: joinPosix(STORAGE_NOTE_BODIES_DIR, bodyId, STORAGE_AISLES_DIR, `${aisleId}.md`),
          }
        }),
      }
    }),
    activeTopicId: activeDomainId,
    lastOpened: activeSpace
      ? {
          topicId: activeDomainId,
          spaceId: typeof activeSpace.id === 'string' ? activeSpace.id : '',
          parentTabId: typeof activeTab?.id === 'string' ? activeTab.id : null,
          subTabId: typeof activeTab?.activeSubTabId === 'string' ? activeTab.activeSubTabId : null,
          viewMode: 'main',
        }
      : undefined,
  }
}

function buildTopicManifest(domain: Record<string, unknown>) {
  const spaces = ensureArray<Record<string, unknown>>(domain.spaces)
  const domainId = getDomainId(domain)
  return {
    id: domainId,
    title: getDomainTitle(domain),
    spaces: spaces.map((space) => ({
      id: typeof space.id === 'string' ? space.id : '',
      title: typeof space.name === 'string' ? space.name : 'Untitled Space',
    })),
    activeSpaceId:
      typeof domain.activeSpaceId === 'string' && spaces.some((space) => space.id === domain.activeSpaceId)
        ? domain.activeSpaceId
        : (typeof spaces[0]?.id === 'string' ? spaces[0].id : ''),
  }
}

function writeAssetBank(fileMap: Map<string, BrowserStoredFile>, basePath: string, assetBank: AssetBank) {
  for (const [relativePath, bytes] of assetBank.files.entries()) {
    setBinaryFile(fileMap, joinPosix(basePath, relativePath), bytes)
  }
}

function writeNoteBodyFiles(fileMap: Map<string, BrowserStoredFile>, noteBodies: Array<Record<string, unknown>>) {
  const assetBank = createAssetBank(STORAGE_ASSETS_DIR)
  noteBodies.forEach((body) => {
    const bodyId = typeof body.id === 'string' ? body.id : ''
    if (!bodyId) return
    ensureArray<Record<string, unknown>>(body.aisles).forEach((aisle) => {
      const aisleId = typeof aisle.id === 'string' ? aisle.id : ''
      if (!aisleId) return
      const file = joinPosix(STORAGE_NOTE_BODIES_DIR, bodyId, STORAGE_AISLES_DIR, `${aisleId}.md`)
      const markdown = typeof aisle.markdown === 'string' ? aisle.markdown : ''
      setTextFile(fileMap, joinPosix(STORAGE_ROOT_DIR, file), externalizeMarkdownImages(markdown, file, assetBank))
    })
  })
  writeAssetBank(fileMap, STORAGE_ROOT_DIR, assetBank)
}

function writeSpaceFiles(
  fileMap: Map<string, BrowserStoredFile>,
  topicId: string,
  space: Record<string, unknown>,
  noteBodyMap: Map<string, Record<string, unknown>>,
) {
  const spaceId = typeof space.id === 'string' ? space.id : ''
  if (!spaceId) return

  const spaceRoot = joinPosix(
    STORAGE_ROOT_DIR,
    STORAGE_TOPICS_DIR,
    topicId,
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
    const homeContent = getNoteBodyFirstMarkdown(
      noteBodyMap,
      tab.noteBodyId,
      typeof tab.homeContent === 'string' ? tab.homeContent : '',
    )
    setTextFile(
      fileMap,
      joinPosix(spaceRoot, homeNoteFile),
      externalizeMarkdownImages(homeContent, homeNoteFile, activeAssetBank),
    )

    const subTabs = ensureArray<Record<string, unknown>>(tab.subTabs).map((subTab) => {
      const subTabId = typeof subTab.id === 'string' ? subTab.id : ''
      const file = joinPosix(STORAGE_NOTES_DIR, tabId, STORAGE_SUBTABS_DIR, `${subTabId}.md`)
      const content = getNoteBodyFirstMarkdown(
        noteBodyMap,
        subTab.noteBodyId,
        typeof subTab.content === 'string' ? subTab.content : '',
      )
      setTextFile(fileMap, joinPosix(spaceRoot, file), externalizeMarkdownImages(content, file, activeAssetBank))
      return {
        id: subTabId,
        title: typeof subTab.title === 'string' ? subTab.title : 'tab',
        noteBodyId: typeof subTab.noteBodyId === 'string' ? subTab.noteBodyId : '',
        file,
      }
    })

    return {
      id: tabId,
      title: typeof tab.title === 'string' ? tab.title : 'tab',
      noteBodyId: typeof tab.noteBodyId === 'string' ? tab.noteBodyId : '',
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
        getNoteBodyFirstMarkdown(
          noteBodyMap,
          deletedTab.noteBodyId,
          typeof deletedTab.homeContent === 'string' ? deletedTab.homeContent : '',
        ),
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
        externalizeMarkdownImages(
          getNoteBodyFirstMarkdown(
            noteBodyMap,
            subTab.noteBodyId,
            typeof subTab.content === 'string' ? subTab.content : '',
          ),
          file,
          trashAssetBank,
        ),
      )
      return {
        id: subTabId,
        title: typeof subTab.title === 'string' ? subTab.title : 'tab',
        noteBodyId: typeof subTab.noteBodyId === 'string' ? subTab.noteBodyId : '',
        file,
      }
    })

    trashItems.push({
      id: entryId,
      type: 'parent-tab',
      title: typeof deletedTab.title === 'string' ? deletedTab.title : 'deleted tab',
      noteBodyId: typeof deletedTab.noteBodyId === 'string' ? deletedTab.noteBodyId : '',
      file: homeNoteFile,
      deletedAt: typeof entry.deletedAt === 'number' ? entry.deletedAt : Date.now(),
      original: {
        topicId,
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
      externalizeMarkdownImages(
        getNoteBodyFirstMarkdown(noteBodyMap, subTab.noteBodyId, typeof subTab.content === 'string' ? subTab.content : ''),
        file,
        trashAssetBank,
      ),
    )

    trashItems.push({
      id: entryId,
      type: 'subtab',
      title: typeof subTab.title === 'string' ? subTab.title : 'deleted note',
      noteBodyId: typeof subTab.noteBodyId === 'string' ? subTab.noteBodyId : '',
      file,
      deletedAt: typeof entry.deletedAt === 'number' ? entry.deletedAt : Date.now(),
      parentTabTitle: typeof entry.parentTabTitle === 'string' ? entry.parentTabTitle : 'Unknown Tab',
      original: {
        topicId,
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
  const domains = getDomainsFromAppState(parsed)
  const noteBodies = getNoteBodiesFromAppState(parsed)
  const noteBodyMap = new Map(noteBodies.map((body) => [typeof body.id === 'string' ? body.id : '', body]))

  setTextFile(fileMap, joinPosix(STORAGE_ROOT_DIR, STORAGE_MANIFEST_FILE), JSON.stringify(buildRootManifest(parsed), null, 2))
  writeNoteBodyFiles(fileMap, noteBodies)
  domains.forEach((domain) => {
    const domainId = getDomainId(domain)
    setTextFile(
      fileMap,
      joinPosix(STORAGE_ROOT_DIR, STORAGE_TOPICS_DIR, domainId, STORAGE_MANIFEST_FILE),
      JSON.stringify(buildTopicManifest(domain), null, 2),
    )

    ensureArray<Record<string, unknown>>(domain.spaces).forEach((space) => {
      writeSpaceFiles(fileMap, domainId, space, noteBodyMap)
    })
  })

  return fileMap
}

function readTextFileWithInlinedImages(fileMap: Map<string, BrowserStoredFile>, path: string): string {
  const text = getTextFile(fileMap, path) ?? ''
  return inlineMarkdownImages(text, path, fileMap)
}

function readNoteBodiesFromRootManifest(
  fileMap: Map<string, BrowserStoredFile>,
  rootManifest: Record<string, unknown>,
): Array<Record<string, unknown>> {
  const noteBodies: Array<Record<string, unknown>> = []
  for (const body of ensureArray<Record<string, unknown>>(rootManifest.noteBodies)) {
    const bodyId = typeof body.id === 'string' ? body.id : ''
    if (!bodyId) continue
    const aisles: Array<Record<string, unknown>> = []
    for (const aisle of ensureArray<Record<string, unknown>>(body.aisles)) {
      const aisleId = typeof aisle.id === 'string' ? aisle.id : ''
      if (!aisleId) continue
      const file =
        typeof aisle.file === 'string'
          ? aisle.file
          : joinPosix(STORAGE_NOTE_BODIES_DIR, bodyId, STORAGE_AISLES_DIR, `${aisleId}.md`)
      aisles.push({
        id: aisleId,
        markdown: readTextFileWithInlinedImages(fileMap, joinPosix(STORAGE_ROOT_DIR, file)),
      })
    }
    noteBodies.push({ id: bodyId, aisles })
  }
  return noteBodies
}

function readSpaceFromHybridFileMap(
  fileMap: Map<string, BrowserStoredFile>,
  topicId: string,
  spaceEntry: Record<string, unknown>,
): Record<string, unknown> | null {
  const spaceId = typeof spaceEntry.id === 'string' ? spaceEntry.id : ''
  if (!spaceId) return null

  const spaceRoot = joinPosix(STORAGE_ROOT_DIR, STORAGE_TOPICS_DIR, topicId, STORAGE_SPACES_DIR, spaceId)
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
      noteBodyId: typeof tabRecord.noteBodyId === 'string' ? tabRecord.noteBodyId : '',
      homeContent: readTextFileWithInlinedImages(fileMap, joinPosix(spaceRoot, homeNoteFile)),
      activeSubTabId: typeof tabRecord.activeSubTabId === 'string' ? tabRecord.activeSubTabId : null,
      subTabs: ensureArray<Record<string, unknown>>(tabRecord.subTabs).map((subTabRecord) => ({
        id: typeof subTabRecord.id === 'string' ? subTabRecord.id : '',
        title: typeof subTabRecord.title === 'string' ? subTabRecord.title : 'tab',
        noteBodyId: typeof subTabRecord.noteBodyId === 'string' ? subTabRecord.noteBodyId : '',
        content: readTextFileWithInlinedImages(
          fileMap,
          joinPosix(spaceRoot, typeof subTabRecord.file === 'string' ? subTabRecord.file : ''),
        ),
      })),
    }
  })

  const trashManifestRaw = getTextFile(
    fileMap,
    joinPosix(
      spaceRoot,
      typeof spaceManifest.trashManifestFile === 'string'
        ? spaceManifest.trashManifestFile
        : `${STORAGE_TRASH_DIR}/${STORAGE_MANIFEST_FILE}`,
    ),
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
        noteBodyId: typeof item.noteBodyId === 'string' ? item.noteBodyId : '',
        homeContent: readTextFileWithInlinedImages(
          fileMap,
          joinPosix(trashRoot, typeof item.file === 'string' ? item.file : ''),
        ),
        activeSubTabId: typeof item.activeSubTabId === 'string' ? item.activeSubTabId : null,
        subTabs: ensureArray<Record<string, unknown>>(item.subTabs).map((subTabRecord) => ({
          id: typeof subTabRecord.id === 'string' ? subTabRecord.id : '',
          title: typeof subTabRecord.title === 'string' ? subTabRecord.title : 'tab',
          noteBodyId: typeof subTabRecord.noteBodyId === 'string' ? subTabRecord.noteBodyId : '',
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
        noteBodyId: typeof item.noteBodyId === 'string' ? item.noteBodyId : '',
        content: readTextFileWithInlinedImages(
          fileMap,
          joinPosix(trashRoot, typeof item.file === 'string' ? item.file : ''),
        ),
      },
    }))

  return {
    id: typeof spaceManifest.id === 'string' ? spaceManifest.id : spaceId,
    name:
      typeof spaceManifest.title === 'string'
        ? spaceManifest.title
        : typeof spaceEntry.title === 'string'
          ? spaceEntry.title
          : 'Untitled Space',
    settings: isRecord(spaceManifest.settings)
      ? spaceManifest.settings
      : { autoRemoveDeletedDays: DEFAULT_AUTO_REMOVE_DAYS },
    data: {
      activeTabId:
        typeof spaceManifest.activeTabId === 'string' && tabs.some((tab) => tab.id === spaceManifest.activeTabId)
          ? spaceManifest.activeTabId
          : typeof tabs[0]?.id === 'string'
            ? tabs[0].id
            : '',
      tabs,
      deletedTabs,
      deletedSubTabs,
    },
  }
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

  const manifestMigration = migrateStorageRootManifest(rootManifest, STORAGE_SCHEMA_VERSION)
  if (!manifestMigration.ok) return null
  rootManifest = manifestMigration.manifest

  const noteBodies = readNoteBodiesFromRootManifest(fileMap, rootManifest)
  const topicEntries = ensureArray<Record<string, unknown>>(rootManifest.topics)
  const readableTopicEntries =
    topicEntries.length > 0 ? topicEntries : [{ id: DEFAULT_TOPIC_ID, title: DEFAULT_TOPIC_TITLE }]
  const lastOpened = isRecord(rootManifest.lastOpened) ? rootManifest.lastOpened : null

  const domains = readableTopicEntries
    .map((topicEntry): Record<string, unknown> | null => {
      const topicId = typeof topicEntry.id === 'string' && topicEntry.id ? topicEntry.id : DEFAULT_TOPIC_ID
      const topicManifestRaw = getTextFile(
        fileMap,
        joinPosix(STORAGE_ROOT_DIR, STORAGE_TOPICS_DIR, topicId, STORAGE_MANIFEST_FILE),
      )
      if (!topicManifestRaw) return null

      let topicManifest: Record<string, unknown>
      try {
        topicManifest = JSON.parse(topicManifestRaw) as Record<string, unknown>
      } catch {
        return null
      }

      const spaces = ensureArray<Record<string, unknown>>(topicManifest.spaces)
        .map((spaceEntry) => readSpaceFromHybridFileMap(fileMap, topicId, spaceEntry))
        .filter((space): space is Record<string, unknown> => space !== null)

      if (spaces.length === 0) return null

      const lastOpenedSpaceId =
        lastOpened &&
        lastOpened.topicId === topicId &&
        typeof lastOpened.spaceId === 'string'
          ? lastOpened.spaceId
          : null
      const activeSpaceId =
        lastOpenedSpaceId && spaces.some((space) => space.id === lastOpenedSpaceId)
          ? lastOpenedSpaceId
          : typeof topicManifest.activeSpaceId === 'string' &&
              spaces.some((space) => space.id === topicManifest.activeSpaceId)
            ? topicManifest.activeSpaceId
            : typeof spaces[0]?.id === 'string'
              ? spaces[0].id
              : ''

      const domainName =
        typeof topicManifest.title === 'string'
          ? topicManifest.title
          : typeof topicEntry.title === 'string'
            ? topicEntry.title
            : DEFAULT_DOMAIN_NAME

      return {
        id: typeof topicManifest.id === 'string' ? topicManifest.id : topicId,
        name: topicId === DEFAULT_TOPIC_ID && domainName === DEFAULT_TOPIC_TITLE ? DEFAULT_DOMAIN_NAME : domainName,
        activeSpaceId,
        spaces,
      }
    })
    .filter((domain): domain is Record<string, unknown> => domain !== null)

  if (domains.length === 0) return null

  const lastOpenedDomainId =
    lastOpened && typeof lastOpened.topicId === 'string'
      ? lastOpened.topicId
      : null
  const activeDomainId =
    lastOpenedDomainId && domains.some((domain) => domain.id === lastOpenedDomainId)
      ? lastOpenedDomainId
      : typeof rootManifest.activeTopicId === 'string' && domains.some((domain) => domain.id === rootManifest.activeTopicId)
        ? rootManifest.activeTopicId
        : typeof domains[0]?.id === 'string'
          ? domains[0].id
          : ''
  const activeDomain = domains.find((domain) => domain.id === activeDomainId) ?? domains[0]
  const activeSpaces = ensureArray<Record<string, unknown>>(activeDomain.spaces)
  const activeSpaceId =
    lastOpened &&
    lastOpened.topicId === activeDomainId &&
    typeof lastOpened.spaceId === 'string' &&
    activeSpaces.some((space) => space.id === lastOpened.spaceId)
      ? lastOpened.spaceId
      : typeof activeDomain.activeSpaceId === 'string'
        ? activeDomain.activeSpaceId
        : typeof activeSpaces[0]?.id === 'string'
          ? activeSpaces[0].id
          : ''
  const globalSettings = isRecord(rootManifest.globalSettings) ? rootManifest.globalSettings : {}
  const theme = normalizeStorageTheme(globalSettings.theme)

  return JSON.stringify({
    theme,
    activeDomainId,
    domains,
    noteBodies,
    activeSpaceId,
    spaces: activeSpaces,
    hotkeys: isRecord(rootManifest.globalSettings) ? rootManifest.globalSettings.hotkeys : undefined,
    ui: isRecord(rootManifest.globalSettings) ? rootManifest.globalSettings.ui : undefined,
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

class BrowserIndexedDbStorageBackend implements StorageBackend {
  async readTextFile(path: string) {
    try {
      const record = await this.getRecord(path)
      const value = record?.kind === 'text' && typeof record.data === 'string' ? record.data : null
      return storageReadOk<string>(value)
    } catch (error) {
      return storageError(error)
    }
  }

  async writeTextFile(path: string, contents: string) {
    try {
      await this.putRecord({ path, kind: 'text', data: contents })
      return storageWriteOk()
    } catch (error) {
      return storageError(error)
    }
  }

  async readBinaryFile(path: string) {
    try {
      const record = await this.getRecord(path)
      const value = record?.kind === 'binary' && record.data instanceof ArrayBuffer ? record.data : null
      return storageReadOk<ArrayBuffer>(value)
    } catch (error) {
      return storageError(error)
    }
  }

  async writeBinaryFile(path: string, contents: ArrayBuffer) {
    try {
      await this.putRecord({ path, kind: 'binary', data: contents })
      return storageWriteOk()
    } catch (error) {
      return storageError(error)
    }
  }

  async listFiles(prefix = '') {
    try {
      const records = await this.getAllRecords()
      return storageReadOk<StorageFileEntry[]>(
        records
          .filter((record) => !prefix || record.path.startsWith(prefix))
          .map((record) => ({ path: record.path, kind: record.kind })),
      )
    } catch (error) {
      return storageError(error)
    }
  }

  async deleteFile(path: string) {
    try {
      const database = await openDatabase()
      try {
        const transaction = database.transaction(BROWSER_FILE_STORE, 'readwrite')
        transaction.objectStore(BROWSER_FILE_STORE).delete(path)
        await waitForTransaction(transaction)
      } finally {
        database.close()
      }
      return storageWriteOk()
    } catch (error) {
      return storageError(error)
    }
  }

  async exists(path: string) {
    try {
      return storageReadOk(Boolean(await this.getRecord(path)))
    } catch (error) {
      return storageError(error)
    }
  }

  private async getRecord(path: string): Promise<BrowserStorageRecord | null> {
    const database = await openDatabase()
    try {
      const transaction = database.transaction(BROWSER_FILE_STORE, 'readonly')
      const request = transaction.objectStore(BROWSER_FILE_STORE).get(path)
      const record = await new Promise<BrowserStorageRecord | undefined>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result as BrowserStorageRecord | undefined)
        request.onerror = () => reject(request.error ?? new Error('IndexedDB get failed'))
      })
      await waitForTransaction(transaction)
      return record ?? null
    } finally {
      database.close()
    }
  }

  private async getAllRecords(): Promise<BrowserStorageRecord[]> {
    const database = await openDatabase()
    try {
      const transaction = database.transaction(BROWSER_FILE_STORE, 'readonly')
      const request = transaction.objectStore(BROWSER_FILE_STORE).getAll()
      const records = await new Promise<BrowserStorageRecord[]>((resolve, reject) => {
        request.onsuccess = () => resolve((request.result as BrowserStorageRecord[]) ?? [])
        request.onerror = () => reject(request.error ?? new Error('IndexedDB getAll failed'))
      })
      await waitForTransaction(transaction)
      return records
    } finally {
      database.close()
    }
  }

  private async putRecord(record: BrowserStorageRecord): Promise<void> {
    const database = await openDatabase()
    try {
      const transaction = database.transaction(BROWSER_FILE_STORE, 'readwrite')
      transaction.objectStore(BROWSER_FILE_STORE).put(record)
      await waitForTransaction(transaction)
    } finally {
      database.close()
    }
  }
}

export async function readFileMapFromStorageBackend(backend: StorageBackend): Promise<Map<string, BrowserStoredFile>> {
  const listed = await backend.listFiles()
  if (!listed.ok) throw new Error(listed.error)
  const fileMap = new Map<string, BrowserStoredFile>()
  for (const entry of listed.value ?? []) {
    if (entry.kind === 'text') {
      const result = await backend.readTextFile(entry.path)
      if (result.ok && result.value !== null) {
        fileMap.set(entry.path, { path: entry.path, kind: 'text', text: result.value })
      }
      continue
    }

    const result = await backend.readBinaryFile(entry.path)
    if (result.ok && result.value !== null) {
      fileMap.set(entry.path, { path: entry.path, kind: 'binary', bytes: new Uint8Array(result.value) })
    }
  }
  return fileMap
}

export async function writeFileMapToStorageBackend(
  backend: StorageBackend,
  fileMap: Map<string, BrowserStoredFile>,
): Promise<void> {
  const listed = await backend.listFiles()
  if (!listed.ok) throw new Error(listed.error)
  await Promise.all((listed.value ?? []).map((entry) => backend.deleteFile(entry.path)))

  for (const entry of fileMap.values()) {
    const result =
      entry.kind === 'text'
        ? await backend.writeTextFile(entry.path, entry.text)
        : await backend.writeBinaryFile(entry.path, toArrayBuffer(entry.bytes))
    if (!result.ok) throw new Error(result.error)
  }
}

export class BrowserHybridStateAdapter {
  private readonly backend: StorageBackend
  private saveQueue: Promise<void> = Promise.resolve()

  constructor(backend: StorageBackend = new BrowserIndexedDbStorageBackend()) {
    this.backend = backend
  }

  async loadSerializedState(): Promise<string | null> {
    try {
      const fileMap = await readFileMapFromStorageBackend(this.backend)
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
        await writeFileMapToStorageBackend(this.backend, fileMap)
      })

    return this.saveQueue
  }
}
