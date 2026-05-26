import {
  STORAGE_ASSETS_DIR,
  STORAGE_DOMAINS_DIR,
  STORAGE_HOME_NOTE_FILE,
  STORAGE_MANIFEST_FILE,
  STORAGE_ROOT_DIR,
  STORAGE_SCHEMA_VERSION,
  STORAGE_TRASH_DIR,
} from '../types/storage-schema'
import { normalizeImageResizeMetadataFragment, splitImageResizeMetadataFromUrl } from '../markdown/image-metadata'
import { normalizeContextReferenceTokensForMarkdown } from '../markdown/note-context-tokens.js'
import {
  buildImageAssetUrl,
  MARKDOWN_LINK_PATTERN,
  normalizeImageAssetPath,
  parseImageAssetUrl,
} from '../markdown/image-asset-refs.js'
import { composeMarkdownFrontmatter } from '../frontmatter/frontmatter'
import {
  getRegisteredAssetBytes,
  registerAssetBytes,
} from '../markdown/image-asset-registry'
import {
  storageError,
  storageReadOk,
  storageWriteOk,
  type StorageBackend,
  type StorageFileEntry,
} from './storage-backend'
import {
  DEFAULT_AUTO_REMOVE_DAYS,
  DEFAULT_DOMAIN_ID,
  DEFAULT_DOMAIN_NAME,
  collectReferencedNoteBodyIdsFromAppState,
  ensureArray,
  getActiveDomainFromAppState,
  getDomainId,
  getDomainTitle,
  getDomainsFromAppState,
  getExtensionFromMimeType,
  getMimeTypeFromExtension,
  getNoteBodiesFromAppState,
  isRecord,
  normalizeAssetExtension,
  normalizeStorageTheme,
} from './hybrid-storage-core.js'
import {
  buildStoragePathFileName,
  createStoragePathAllocator,
  createStoragePathFileNameAllocator,
} from './storage-path-segments.js'
import {
  buildSyncedSettingsFromSplitFiles,
  extractAppSettings,
  extractEditorState,
  extractFrontmatterSettings,
  pruneAppStateEditorLocations,
  ROOT_SPLIT_FILES,
} from './settings-partition.js'

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
const SUPPORTED_STORAGE_SCHEMA_VERSIONS = new Set<number>([STORAGE_SCHEMA_VERSION])

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
  const normalizedExtension = normalizeAssetExtension(extension)
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
  return markdown.replace(MARKDOWN_LINK_PATTERN, (fullMatch, imageBang: string, label: string, srcRaw: string) => {
    const src = srcRaw.trim()
    const { imageUrl, metadataFragment } = splitImageResizeMetadataFromUrl(src)
    const normalizedMetadataFragment = normalizeImageResizeMetadataFragment(metadataFragment)
    let assetRelativePath = parseImageAssetUrl(imageUrl)

    if (assetRelativePath) {
      assetRelativePath = normalizeImageAssetPath(assetRelativePath)
      const bytes = getRegisteredAssetBytes(assetRelativePath)
      if (bytes) {
        assetBank.files.set(assetRelativePath, bytes)
      }
    } else if (imageBang === '!' && imageUrl.startsWith('data:image/')) {
      const decoded = decodeDataUrl(imageUrl)
      if (!decoded) return fullMatch
      assetRelativePath = addAssetToBank(assetBank, decoded.bytes, decoded.extension)
    } else {
      return fullMatch
    }

    const noteDirectory = dirnamePosix(noteFileRelative)
    const nextSrc = relativePosix(noteDirectory, assetRelativePath)
    return `${imageBang}[${label}](${nextSrc}${normalizedMetadataFragment})`
  })
}

function referenceMarkdownImages(markdown: string, notePath: string, fileMap: Map<string, BrowserStoredFile>): string {
  return markdown.replace(MARKDOWN_LINK_PATTERN, (fullMatch, imageBang: string, label: string, srcRaw: string) => {
    const src = srcRaw.trim()
    if (!src) return fullMatch
    const { imageUrl, metadataFragment } = splitImageResizeMetadataFromUrl(src)
    const normalizedMetadataFragment = normalizeImageResizeMetadataFragment(metadataFragment)
    if (parseImageAssetUrl(imageUrl)) return fullMatch
    if (imageBang === '!' && imageUrl.startsWith('data:image/')) {
      const decoded = decodeDataUrl(imageUrl)
      if (!decoded) return fullMatch
      const assetPath = joinPosix(STORAGE_ASSETS_DIR, `asset-${createAssetHash(decoded.bytes)}.${normalizeAssetExtension(decoded.extension)}`)
      setBinaryFile(fileMap, joinPosix(STORAGE_ROOT_DIR, assetPath), decoded.bytes)
      registerAssetBytes(assetPath, decoded.bytes, getMimeTypeFromExtension(decoded.extension))
      return `${imageBang}[${label}](${buildImageAssetUrl(assetPath)}${normalizedMetadataFragment})`
    }
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(imageUrl) && !imageUrl.startsWith('file://')) return fullMatch

    const assetPath = normalizePosixPath(joinPosix(dirnamePosix(notePath), imageUrl))
    const rootRelativeAssetPath = normalizeImageAssetPath(assetPath.replace(new RegExp(`^${STORAGE_ROOT_DIR}/`), ''))
    if (!imageBang && !rootRelativeAssetPath.startsWith(`${STORAGE_ASSETS_DIR}/`)) return fullMatch
    const assetBytes = getBinaryFile(fileMap, assetPath)
    if (!assetBytes) return fullMatch

    const extension = normalizeAssetExtension(assetPath.split('.').pop() ?? 'bin')
    registerAssetBytes(rootRelativeAssetPath, assetBytes, getMimeTypeFromExtension(extension))
    return `${imageBang}[${label}](${buildImageAssetUrl(rootRelativeAssetPath)}${normalizedMetadataFragment})`
  })
}

function setJsonFile(fileMap: Map<string, BrowserStoredFile>, path: string, value: Record<string, unknown>) {
  setTextFile(fileMap, path, `${JSON.stringify(value, null, 2)}\n`)
}

function buildNavigationState(appState: Record<string, unknown>) {
  const activeDomain = getActiveDomainFromAppState(appState, getDomainsFromAppState(appState))
  const activeDomainId = activeDomain ? getDomainId(activeDomain) : DEFAULT_DOMAIN_ID
  return {
    activeDomainId,
    ...(isRecord(appState.lastOpened) ? { lastOpened: appState.lastOpened } : {}),
  }
}

function buildRootManifest() {
  return {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    files: ROOT_SPLIT_FILES,
  }
}

function buildDomainManifest(domain: Record<string, unknown>, spaceEntries: Array<Record<string, unknown>>) {
  const spaces = ensureArray<Record<string, unknown>>(domain.spaces)
  const domainId = getDomainId(domain)
  return {
    id: domainId,
    title: getDomainTitle(domain),
    spaces: spaceEntries,
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

function buildNoteBodyManifestRecord(body: Record<string, unknown>, aisles: Array<Record<string, unknown>>) {
  return {
    id: typeof body.id === 'string' ? body.id : '',
    createdAt: typeof body.createdAt === 'string' ? body.createdAt : undefined,
    updatedAt: typeof body.updatedAt === 'string' ? body.updatedAt : undefined,
    aisles,
  }
}

function composeAisleMarkdownForStorage(markdown: string, aisleBody: Record<string, unknown> | undefined): string {
  if (aisleBody?.frontmatterStatus === 'invalid') return markdown
  return composeMarkdownFrontmatter(markdown, isRecord(aisleBody?.frontmatter) ? aisleBody.frontmatter : null)
}

function getAisleBodyForStorage(
  aisleIndex: number,
  aisleBody: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  void aisleIndex
  return aisleBody
}

function buildNoteAisleBodyManifestRecord(
  aisleBodyId: string,
  file: string,
  aisleBody: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return {
    id: aisleBodyId,
    file,
    frontmatterMeta: isRecord(aisleBody?.frontmatterMeta) ? aisleBody.frontmatterMeta : undefined,
  }
}

function writeNoteBodyAtPath({
  fileMap,
  noteBodyMap,
  noteAisleBodyMap,
  noteBodyRecords,
  noteAisleBodyRecords,
  noteBodyId,
  primaryFileRelative,
  multiAisleRootRelative,
  assetBank,
  appState,
}: {
  fileMap: Map<string, BrowserStoredFile>
  noteBodyMap: Map<string, Record<string, unknown>>
  noteAisleBodyMap: Map<string, Record<string, unknown>>
  noteBodyRecords: Map<string, Record<string, unknown>>
  noteAisleBodyRecords: Map<string, Record<string, unknown>>
  noteBodyId: unknown
  primaryFileRelative: string
  multiAisleRootRelative: string
  assetBank: AssetBank
  appState: Record<string, unknown>
}) {
  const bodyId = typeof noteBodyId === 'string' ? noteBodyId : ''
  const body = bodyId ? noteBodyMap.get(bodyId) : null
  const sourceAisles = ensureArray<Record<string, unknown>>(body?.aisles)
  const usesAisleFolder = sourceAisles.length > 1
  const notePath = usesAisleFolder ? multiAisleRootRelative : primaryFileRelative

  const getAisleFile = (index: number, aisleId: string) => joinPosix(
    multiAisleRootRelative,
    buildStoragePathFileName(`aisle ${index + 1}`, aisleId, 'aisle', '.md'),
  )

  if (body && noteBodyRecords.has(bodyId)) {
    const firstAisle = sourceAisles[0]
    const firstAisleId =
      typeof firstAisle?.id === 'string' && firstAisle.id ? firstAisle.id : `${bodyId}-aisle-1`
    const firstAisleBodyId =
      typeof firstAisle?.aisleBodyId === 'string' && firstAisle.aisleBodyId
        ? firstAisle.aisleBodyId
        : firstAisleId
    const sourceAisleBody = getAisleBodyForStorage(0, firstAisleBodyId ? noteAisleBodyMap.get(firstAisleBodyId) : undefined)
    const sharedMarkdown = sourceAisleBody?.markdown
    const markdown = typeof sharedMarkdown === 'string' ? sharedMarkdown : ''
    const primaryFile = usesAisleFolder ? getAisleFile(0, firstAisleId) : primaryFileRelative
    setTextFile(
      fileMap,
      joinPosix(STORAGE_ROOT_DIR, primaryFile),
      externalizeMarkdownImages(
        normalizeContextReferenceTokensForMarkdown(composeAisleMarkdownForStorage(markdown, sourceAisleBody), appState),
        primaryFile,
        assetBank,
      ),
    )
    return { primaryFile, notePath }
  }

  if (!body || sourceAisles.length === 0) {
    setTextFile(
      fileMap,
      joinPosix(STORAGE_ROOT_DIR, primaryFileRelative),
      externalizeMarkdownImages('', primaryFileRelative, assetBank),
    )
    if (body && bodyId) {
      const aisleId = `${bodyId}-home`
      noteBodyRecords.set(bodyId, buildNoteBodyManifestRecord(body, [{ id: aisleId, aisleBodyId: aisleId, file: primaryFileRelative }]))
      if (!noteAisleBodyRecords.has(aisleId)) {
        noteAisleBodyRecords.set(aisleId, buildNoteAisleBodyManifestRecord(aisleId, primaryFileRelative, undefined))
      }
    }
    return { primaryFile: primaryFileRelative, notePath: primaryFileRelative }
  }

  const aisleRecords: Array<Record<string, unknown>> = []
  sourceAisles.forEach((aisle, index) => {
    const aisleId = typeof aisle.id === 'string' && aisle.id ? aisle.id : `${bodyId}-aisle-${index + 1}`
    const aisleBodyId = typeof aisle.aisleBodyId === 'string' && aisle.aisleBodyId ? aisle.aisleBodyId : aisleId
    const file = usesAisleFolder ? getAisleFile(index, aisleId) : primaryFileRelative
    const sourceAisleBody = getAisleBodyForStorage(index, noteAisleBodyMap.get(aisleBodyId))
    const sharedMarkdown = sourceAisleBody?.markdown
    const markdown = typeof sharedMarkdown === 'string' ? sharedMarkdown : ''
    setTextFile(
      fileMap,
      joinPosix(STORAGE_ROOT_DIR, file),
      externalizeMarkdownImages(
        normalizeContextReferenceTokensForMarkdown(composeAisleMarkdownForStorage(markdown, sourceAisleBody), appState),
        file,
        assetBank,
      ),
    )
    aisleRecords.push({ id: aisleId, aisleBodyId, file })
    if (!noteAisleBodyRecords.has(aisleBodyId)) {
      noteAisleBodyRecords.set(aisleBodyId, buildNoteAisleBodyManifestRecord(aisleBodyId, file, sourceAisleBody))
    }
  })
  noteBodyRecords.set(bodyId, buildNoteBodyManifestRecord(body, aisleRecords))
  return { primaryFile: String(aisleRecords[0]?.file ?? primaryFileRelative), notePath }
}

function writeSpaceFiles(
  fileMap: Map<string, BrowserStoredFile>,
  spaceRoot: string,
  space: Record<string, unknown>,
  noteBodyMap: Map<string, Record<string, unknown>>,
  noteAisleBodyMap: Map<string, Record<string, unknown>>,
  noteBodyRecords: Map<string, Record<string, unknown>>,
  noteAisleBodyRecords: Map<string, Record<string, unknown>>,
  assetBank: AssetBank,
  appState: Record<string, unknown>,
) {
  const spaceId = typeof space.id === 'string' ? space.id : ''
  if (!spaceId) return null

  const trashRoot = joinPosix(spaceRoot, STORAGE_TRASH_DIR)
  const tabs = ensureArray<Record<string, unknown>>(isRecord(space.data) ? space.data.tabs : [])
  const tabPathForTitle = createStoragePathAllocator()

  const tabManifest = tabs.map((tab) => {
    const tabId = typeof tab.id === 'string' ? tab.id : ''
    const tabPath = tabPathForTitle(typeof tab.title === 'string' ? tab.title : 'tab', tabId, 'tab')
    const homeWrite = writeNoteBodyAtPath({
      fileMap,
      noteBodyMap,
      noteAisleBodyMap,
      noteBodyRecords,
      noteAisleBodyRecords,
      noteBodyId: tab.noteBodyId,
      primaryFileRelative: joinPosix(spaceRoot, tabPath, STORAGE_HOME_NOTE_FILE),
      multiAisleRootRelative: joinPosix(spaceRoot, tabPath, 'home'),
      assetBank,
      appState,
    })
    const homeNoteFile = relativePosix(spaceRoot, homeWrite.primaryFile)

    const subTabPathForTitle = createStoragePathAllocator()
    const subTabFileForTitle = createStoragePathFileNameAllocator('.md')
    const subTabs = ensureArray<Record<string, unknown>>(tab.subTabs).map((subTab) => {
      const subTabId = typeof subTab.id === 'string' ? subTab.id : ''
      const subTabSegment = subTabPathForTitle(typeof subTab.title === 'string' ? subTab.title : 'tab', subTabId, 'tab')
      const subTabFileName = subTabFileForTitle(typeof subTab.title === 'string' ? subTab.title : 'tab', subTabId, 'tab')
      const subTabRoot = joinPosix(spaceRoot, tabPath, subTabSegment)
      const subTabWrite = writeNoteBodyAtPath({
        fileMap,
        noteBodyMap,
        noteAisleBodyMap,
        noteBodyRecords,
        noteAisleBodyRecords,
        noteBodyId: subTab.noteBodyId,
        primaryFileRelative: joinPosix(spaceRoot, tabPath, subTabFileName),
        multiAisleRootRelative: subTabRoot,
        assetBank,
        appState,
      })
      return {
        id: subTabId,
        title: typeof subTab.title === 'string' ? subTab.title : 'tab',
        path: relativePosix(spaceRoot, subTabWrite.notePath),
        noteBodyId: typeof subTab.noteBodyId === 'string' ? subTab.noteBodyId : '',
        file: relativePosix(spaceRoot, subTabWrite.primaryFile),
      }
    })

    return {
      id: tabId,
      title: typeof tab.title === 'string' ? tab.title : 'tab',
      path: tabPath,
      noteBodyId: typeof tab.noteBodyId === 'string' ? tab.noteBodyId : '',
      homeNoteFile,
      subTabs,
      activeSubTabId: typeof tab.activeSubTabId === 'string' ? tab.activeSubTabId : null,
    }
  })

  const deletedTabs = ensureArray<Record<string, unknown>>(isRecord(space.data) ? space.data.deletedTabs : [])
  const deletedSubTabs = ensureArray<Record<string, unknown>>(isRecord(space.data) ? space.data.deletedSubTabs : [])
  const trashItems: Array<Record<string, unknown>> = []
  const trashPathForTitle = createStoragePathAllocator()

  deletedTabs.forEach((entry) => {
    const deletedTab = isRecord(entry.tab) ? entry.tab : {}
    const entryId = typeof entry.id === 'string' ? entry.id : ''
    const deletedPath = trashPathForTitle(typeof deletedTab.title === 'string' ? deletedTab.title : 'deleted tab', entryId, 'deleted tab')
    const deletedHomeWrite = writeNoteBodyAtPath({
      fileMap,
      noteBodyMap,
      noteAisleBodyMap,
      noteBodyRecords,
      noteAisleBodyRecords,
      noteBodyId: deletedTab.noteBodyId,
      primaryFileRelative: joinPosix(trashRoot, deletedPath, STORAGE_HOME_NOTE_FILE),
      multiAisleRootRelative: joinPosix(trashRoot, deletedPath, 'home'),
      assetBank,
      appState,
    })
    const homeNoteFile = relativePosix(trashRoot, deletedHomeWrite.primaryFile)

    const deletedSubTabPathForTitle = createStoragePathAllocator()
    const deletedSubTabFileForTitle = createStoragePathFileNameAllocator('.md')
    const subTabs = ensureArray<Record<string, unknown>>(deletedTab.subTabs).map((subTab) => {
      const subTabId = typeof subTab.id === 'string' ? subTab.id : ''
      const subTabSegment = deletedSubTabPathForTitle(typeof subTab.title === 'string' ? subTab.title : 'tab', subTabId, 'tab')
      const subTabFileName = deletedSubTabFileForTitle(typeof subTab.title === 'string' ? subTab.title : 'tab', subTabId, 'tab')
      const subTabRoot = joinPosix(trashRoot, deletedPath, subTabSegment)
      const subTabWrite = writeNoteBodyAtPath({
        fileMap,
        noteBodyMap,
        noteAisleBodyMap,
        noteBodyRecords,
        noteAisleBodyRecords,
        noteBodyId: subTab.noteBodyId,
        primaryFileRelative: joinPosix(trashRoot, deletedPath, subTabFileName),
        multiAisleRootRelative: subTabRoot,
        assetBank,
        appState,
      })
      return {
        id: subTabId,
        title: typeof subTab.title === 'string' ? subTab.title : 'tab',
        path: relativePosix(trashRoot, subTabWrite.notePath),
        noteBodyId: typeof subTab.noteBodyId === 'string' ? subTab.noteBodyId : '',
        file: relativePosix(trashRoot, subTabWrite.primaryFile),
      }
    })

    trashItems.push({
      id: entryId,
      type: 'parent-tab',
      title: typeof deletedTab.title === 'string' ? deletedTab.title : 'deleted tab',
      path: deletedPath,
      noteBodyId: typeof deletedTab.noteBodyId === 'string' ? deletedTab.noteBodyId : '',
      file: homeNoteFile,
      deletedAt: typeof entry.deletedAt === 'number' ? entry.deletedAt : Date.now(),
      original: {
        primeTabId: typeof deletedTab.id === 'string' ? deletedTab.id : entryId,
        subTabId: null,
      },
      activeSubTabId: typeof deletedTab.activeSubTabId === 'string' ? deletedTab.activeSubTabId : null,
      subTabs,
    })
  })

  const trashFileForTitle = createStoragePathFileNameAllocator('.md')
  deletedSubTabs.forEach((entry) => {
    const subTab = isRecord(entry.subTab) ? entry.subTab : {}
    const entryId = typeof entry.id === 'string' ? entry.id : ''
    const deletedPath = trashPathForTitle(typeof subTab.title === 'string' ? subTab.title : 'deleted note', entryId, 'deleted note')
    const deletedFileName = trashFileForTitle(typeof subTab.title === 'string' ? subTab.title : 'deleted note', entryId, 'deleted note')
    const deletedWrite = writeNoteBodyAtPath({
      fileMap,
      noteBodyMap,
      noteAisleBodyMap,
      noteBodyRecords,
      noteAisleBodyRecords,
      noteBodyId: subTab.noteBodyId,
      primaryFileRelative: joinPosix(trashRoot, deletedFileName),
      multiAisleRootRelative: joinPosix(trashRoot, deletedPath),
      assetBank,
      appState,
    })

    trashItems.push({
      id: entryId,
      type: 'subtab',
      title: typeof subTab.title === 'string' ? subTab.title : 'deleted note',
      path: relativePosix(trashRoot, deletedWrite.notePath),
      noteBodyId: typeof subTab.noteBodyId === 'string' ? subTab.noteBodyId : '',
      file: relativePosix(trashRoot, deletedWrite.primaryFile),
      deletedAt: typeof entry.deletedAt === 'number' ? entry.deletedAt : Date.now(),
      parentTabTitle: typeof entry.parentTabTitle === 'string' ? entry.parentTabTitle : 'Unknown Tab',
      original: {
        primeTabId: typeof entry.parentTabId === 'string' ? entry.parentTabId : '',
        subTabId: typeof subTab.id === 'string' ? subTab.id : null,
      },
    })
  })

  const activeTabId =
    isRecord(space.data) && typeof space.data.activeTabId === 'string'
      ? space.data.activeTabId
      : (typeof tabManifest[0]?.id === 'string' ? tabManifest[0].id : '')

  setJsonFile(
    fileMap,
    joinPosix(STORAGE_ROOT_DIR, spaceRoot, STORAGE_MANIFEST_FILE),
    {
      id: spaceId,
      title: typeof space.name === 'string' ? space.name : 'Untitled Space',
      settings: isRecord(space.settings) ? space.settings : { autoRemoveDeletedDays: DEFAULT_AUTO_REMOVE_DAYS },
      tabs: tabManifest,
      activeTabId,
      trashManifestFile: `${STORAGE_TRASH_DIR}/${STORAGE_MANIFEST_FILE}`,
    },
  )

  setJsonFile(
    fileMap,
    joinPosix(STORAGE_ROOT_DIR, trashRoot, STORAGE_MANIFEST_FILE),
    { items: trashItems },
  )

  return {
    id: spaceId,
    title: typeof space.name === 'string' ? space.name : 'Untitled Space',
  }
}

export function buildHybridFileMapFromSerializedState(serializedState: string): Map<string, BrowserStoredFile> {
  const parsed = JSON.parse(serializedState) as Record<string, unknown>
  const fileMap = new Map<string, BrowserStoredFile>()
  const domains = getDomainsFromAppState(parsed)
  const noteBodies = getNoteBodiesFromAppState(parsed)
  const referencedNoteBodyIds = collectReferencedNoteBodyIdsFromAppState(parsed)
  const noteAisleBodies = ensureArray<Record<string, unknown>>(parsed.noteAisleBodies).filter(isRecord)
  const noteBodyMap = new Map(noteBodies.map((body) => [typeof body.id === 'string' ? body.id : '', body]))
  const noteAisleBodyMap = new Map(noteAisleBodies.map((body) => [typeof body.id === 'string' ? body.id : '', body]))
  const noteBodyRecords = new Map<string, Record<string, unknown>>()
  const noteAisleBodyRecords = new Map<string, Record<string, unknown>>()
  const orphanNoteBodyIds = new Set<string>()
  const assetBank = createAssetBank(STORAGE_ASSETS_DIR)
  const domainPathForTitle = createStoragePathAllocator()
  const domainEntries: Array<Record<string, unknown>> = []

  domains.forEach((domain) => {
    const domainId = getDomainId(domain)
    const domainPath = domainPathForTitle(getDomainTitle(domain), domainId, 'domain')
    const domainRoot = joinPosix(STORAGE_DOMAINS_DIR, domainPath)
    const spacePathForTitle = createStoragePathAllocator()
    const spaceEntries: Array<Record<string, unknown>> = []

    ensureArray<Record<string, unknown>>(domain.spaces).forEach((space) => {
      const spaceId = typeof space.id === 'string' ? space.id : ''
      if (!spaceId) return
      const spacePath = spacePathForTitle(typeof space.name === 'string' ? space.name : 'Untitled Space', spaceId, 'space')
      const spaceEntry = writeSpaceFiles(
        fileMap,
        joinPosix(domainRoot, spacePath),
        space,
        noteBodyMap,
        noteAisleBodyMap,
        noteBodyRecords,
        noteAisleBodyRecords,
        assetBank,
        parsed,
      )
      if (spaceEntry) spaceEntries.push({ ...spaceEntry, path: spacePath })
    })

    setJsonFile(
      fileMap,
      joinPosix(STORAGE_ROOT_DIR, domainRoot, STORAGE_MANIFEST_FILE),
      buildDomainManifest(domain, spaceEntries),
    )

    domainEntries.push({
      id: domainId,
      title: getDomainTitle(domain),
      path: domainPath,
    })
  })

  const orphanPathForId = createStoragePathAllocator()
  const orphanFileForId = createStoragePathFileNameAllocator('.md')
  noteBodies.forEach((body) => {
    const bodyId = typeof body.id === 'string' ? body.id : ''
    if (!bodyId || noteBodyRecords.has(bodyId) || !referencedNoteBodyIds.has(bodyId)) return
    orphanNoteBodyIds.add(bodyId)
    const orphanFileName = orphanFileForId('Orphan Note Body', bodyId, 'orphan note body')
    const orphanSegment = orphanPathForId('Orphan Note Body', bodyId, 'orphan note body')
    writeNoteBodyAtPath({
      fileMap,
      noteBodyMap,
      noteAisleBodyMap,
      noteBodyRecords,
      noteAisleBodyRecords,
      noteBodyId: bodyId,
      primaryFileRelative: joinPosix('_internal', 'orphan-bodies', orphanFileName),
      multiAisleRootRelative: joinPosix('_internal', 'orphan-bodies', orphanSegment),
      assetBank,
      appState: parsed,
    })
  })

  writeAssetBank(fileMap, STORAGE_ROOT_DIR, assetBank)
  const allNoteBodyEntries = noteBodies
    .map((body) => (typeof body.id === 'string' ? noteBodyRecords.get(body.id) : null))
    .filter((body): body is Record<string, unknown> => body != null)
  const attachedNoteBodyEntries = allNoteBodyEntries.filter((body) => {
    const bodyId = typeof body.id === 'string' ? body.id : ''
    return !orphanNoteBodyIds.has(bodyId)
  })
  const noteBodyEntries = allNoteBodyEntries.map((body) => {
    const bodyId = typeof body.id === 'string' ? body.id : ''
    return orphanNoteBodyIds.has(bodyId) ? { ...body, storageStatus: 'unlinked' } : body
  })
  const liveAisleBodyIds = new Set<string>()
  attachedNoteBodyEntries.forEach((body) => {
    ensureArray<Record<string, unknown>>(body.aisles).forEach((aisle) => {
      const aisleBodyId =
        typeof aisle.aisleBodyId === 'string' && aisle.aisleBodyId
          ? aisle.aisleBodyId
          : typeof aisle.id === 'string'
            ? aisle.id
            : ''
      if (aisleBodyId) liveAisleBodyIds.add(aisleBodyId)
    })
  })
  const aisleBodyEntries = Array.from(noteAisleBodyRecords.values()).map((body) => {
    const bodyId = typeof body.id === 'string' ? body.id : ''
    return bodyId && liveAisleBodyIds.has(bodyId) ? body : { ...body, storageStatus: 'unlinked' }
  })
  setJsonFile(
    fileMap,
    joinPosix(STORAGE_ROOT_DIR, ROOT_SPLIT_FILES.workspaceIndex),
    { domains: domainEntries },
  )
  setJsonFile(
    fileMap,
    joinPosix(STORAGE_ROOT_DIR, ROOT_SPLIT_FILES.navigationState),
    buildNavigationState(parsed),
  )
  setJsonFile(
    fileMap,
    joinPosix(STORAGE_ROOT_DIR, ROOT_SPLIT_FILES.appSettings),
    extractAppSettings(parsed),
  )
  setJsonFile(
    fileMap,
    joinPosix(STORAGE_ROOT_DIR, ROOT_SPLIT_FILES.frontmatterSettings),
    extractFrontmatterSettings(parsed),
  )
  setJsonFile(
    fileMap,
    joinPosix(STORAGE_ROOT_DIR, ROOT_SPLIT_FILES.editorState),
    extractEditorState(parsed),
  )
  setJsonFile(
    fileMap,
    joinPosix(STORAGE_ROOT_DIR, ROOT_SPLIT_FILES.deletedWorkspace),
    {
      deletedDomains: ensureArray<Record<string, unknown>>(parsed.deletedDomains).filter(isRecord),
      deletedSpaces: ensureArray<Record<string, unknown>>(parsed.deletedSpaces).filter(isRecord),
    },
  )
  setJsonFile(
    fileMap,
    joinPosix(STORAGE_ROOT_DIR, ROOT_SPLIT_FILES.noteRegistry),
    { noteBodies: noteBodyEntries, aisleBodies: aisleBodyEntries },
  )
  setJsonFile(
    fileMap,
    joinPosix(STORAGE_ROOT_DIR, STORAGE_MANIFEST_FILE),
    buildRootManifest(),
  )

  return fileMap
}

function readTextFileWithReferencedImages(fileMap: Map<string, BrowserStoredFile>, path: string): string {
  const text = getTextFile(fileMap, path) ?? ''
  return referenceMarkdownImages(text, path, fileMap)
}

function readNoteBodiesFromRootManifest(rootManifest: Record<string, unknown>): Array<Record<string, unknown>> {
  const noteBodies: Array<Record<string, unknown>> = []
  for (const body of ensureArray<Record<string, unknown>>(rootManifest.noteBodies)) {
    const bodyId = typeof body.id === 'string' ? body.id : ''
    if (!bodyId) continue
    const aisles: Array<Record<string, unknown>> = []
    for (const aisle of ensureArray<Record<string, unknown>>(body.aisles)) {
      const aisleId = typeof aisle.id === 'string' ? aisle.id : ''
      const aisleBodyId = typeof aisle.aisleBodyId === 'string' ? aisle.aisleBodyId : ''
      const file = typeof aisle.file === 'string' ? aisle.file : ''
      if (!aisleId || !file) continue
      aisles.push({
        id: aisleId,
        aisleBodyId: aisleBodyId || aisleId,
      })
    }
    noteBodies.push({
      id: bodyId,
      createdAt: typeof body.createdAt === 'string' ? body.createdAt : undefined,
      updatedAt: typeof body.updatedAt === 'string' ? body.updatedAt : undefined,
      aisles,
    })
  }
  return noteBodies
}

function readNoteAisleBodiesFromRootManifest(
  fileMap: Map<string, BrowserStoredFile>,
  rootManifest: Record<string, unknown>,
): Array<Record<string, unknown>> {
  const aisleBodies: Array<Record<string, unknown>> = []
  const seen = new Set<string>()
  for (const body of ensureArray<Record<string, unknown>>(rootManifest.noteAisleBodies)) {
    const bodyId = typeof body.id === 'string' ? body.id : ''
    const file = typeof body.file === 'string' ? body.file : ''
    if (!bodyId || !file || seen.has(bodyId)) continue
    seen.add(bodyId)
    aisleBodies.push({
      id: bodyId,
      markdown: readTextFileWithReferencedImages(fileMap, joinPosix(STORAGE_ROOT_DIR, file)),
      frontmatterMeta: isRecord(body.frontmatterMeta) ? body.frontmatterMeta : undefined,
    })
  }
  return aisleBodies
}

function isRootSplitFileName(value: string): boolean {
  return value.trim().length > 0 && !value.includes('/') && !value.includes('\\') && value !== '.' && value !== '..'
}

function getRootSplitFileName(rootManifest: Record<string, unknown>, key: string, required: boolean): string | null {
  const files = isRecord(rootManifest.files) ? rootManifest.files : null
  if (!files) return null
  const value = files[key]
  if (typeof value !== 'string' || !isRootSplitFileName(value)) {
    return required ? null : ROOT_SPLIT_FILES[key as keyof typeof ROOT_SPLIT_FILES]
  }
  return value
}

function readRootSplitJsonFile(
  fileMap: Map<string, BrowserStoredFile>,
  rootManifest: Record<string, unknown>,
  key: string,
  required: boolean,
): Record<string, unknown> | null {
  const fileName = getRootSplitFileName(rootManifest, key, required)
  if (!fileName) return required ? null : {}
  const raw = getTextFile(fileMap, joinPosix(STORAGE_ROOT_DIR, fileName))
  if (!raw) return required ? null : {}
  try {
    const parsed = JSON.parse(raw) as unknown
    return isRecord(parsed) ? parsed : required ? null : {}
  } catch {
    return required ? null : {}
  }
}

function readCurrentRootParts(
  fileMap: Map<string, BrowserStoredFile>,
  rootManifest: Record<string, unknown>,
) {
  if (!isRecord(rootManifest.files)) return null
  const splitFiles: Record<string, Record<string, unknown>> = {}
  const requiredKeys = ['workspaceIndex', 'navigationState', 'appSettings', 'frontmatterSettings', 'deletedWorkspace', 'noteRegistry']
  for (const key of requiredKeys) {
    const file = readRootSplitJsonFile(fileMap, rootManifest, key, true)
    if (!file) return null
    splitFiles[key] = file
  }
  splitFiles.editorState = readRootSplitJsonFile(fileMap, rootManifest, 'editorState', false) ?? {}
  const noteRegistry = splitFiles.noteRegistry

  return {
    syncedSettings: buildSyncedSettingsFromSplitFiles(splitFiles),
    noteBodiesRoot: {
      noteBodies: ensureArray<Record<string, unknown>>(noteRegistry.noteBodies),
    },
    noteAisleBodiesRoot: {
      noteAisleBodies: ensureArray<Record<string, unknown>>(noteRegistry.aisleBodies),
    },
    domainEntries: ensureArray<Record<string, unknown>>(splitFiles.workspaceIndex.domains),
    deletedDomains: ensureArray<Record<string, unknown>>(splitFiles.deletedWorkspace.deletedDomains).filter(isRecord),
    deletedSpaces: ensureArray<Record<string, unknown>>(splitFiles.deletedWorkspace.deletedSpaces).filter(isRecord),
    activeDomainId:
      typeof splitFiles.navigationState.activeDomainId === 'string'
        ? splitFiles.navigationState.activeDomainId
        : DEFAULT_DOMAIN_ID,
    lastOpened: isRecord(splitFiles.navigationState.lastOpened) ? splitFiles.navigationState.lastOpened : null,
  }
}

function readSpaceFromHybridFileMap(
  fileMap: Map<string, BrowserStoredFile>,
  spaceRoot: string,
  spaceEntry: Record<string, unknown>,
): Record<string, unknown> | null {
  const spaceId = typeof spaceEntry.id === 'string' ? spaceEntry.id : ''
  if (!spaceId) return null

  const spaceManifestRaw = getTextFile(fileMap, joinPosix(STORAGE_ROOT_DIR, spaceRoot, STORAGE_MANIFEST_FILE))
  if (!spaceManifestRaw) return null

  let spaceManifest: Record<string, unknown>
  try {
    spaceManifest = JSON.parse(spaceManifestRaw) as Record<string, unknown>
  } catch {
    return null
  }

  const tabs = ensureArray<Record<string, unknown>>(spaceManifest.tabs).map((tabRecord) => {
    const tabId = typeof tabRecord.id === 'string' ? tabRecord.id : ''
    return {
      id: tabId,
      title: typeof tabRecord.title === 'string' ? tabRecord.title : 'tab',
      noteBodyId: typeof tabRecord.noteBodyId === 'string' ? tabRecord.noteBodyId : '',
      activeSubTabId: typeof tabRecord.activeSubTabId === 'string' ? tabRecord.activeSubTabId : null,
      subTabs: ensureArray<Record<string, unknown>>(tabRecord.subTabs).map((subTabRecord) => ({
        id: typeof subTabRecord.id === 'string' ? subTabRecord.id : '',
        title: typeof subTabRecord.title === 'string' ? subTabRecord.title : 'tab',
        noteBodyId: typeof subTabRecord.noteBodyId === 'string' ? subTabRecord.noteBodyId : '',
      })),
    }
  })

  const trashManifestRaw = getTextFile(
    fileMap,
    joinPosix(
      STORAGE_ROOT_DIR,
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

  const deletedTabs = trashItems
    .filter((item) => item.type === 'parent-tab')
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : '',
      deletedAt: typeof item.deletedAt === 'number' ? item.deletedAt : Date.now(),
      tab: {
        id: isRecord(item.original) && typeof item.original.primeTabId === 'string' ? item.original.primeTabId : '',
        title: typeof item.title === 'string' ? item.title : 'deleted tab',
        noteBodyId: typeof item.noteBodyId === 'string' ? item.noteBodyId : '',
        activeSubTabId: typeof item.activeSubTabId === 'string' ? item.activeSubTabId : null,
        subTabs: ensureArray<Record<string, unknown>>(item.subTabs).map((subTabRecord) => ({
          id: typeof subTabRecord.id === 'string' ? subTabRecord.id : '',
          title: typeof subTabRecord.title === 'string' ? subTabRecord.title : 'tab',
          noteBodyId: typeof subTabRecord.noteBodyId === 'string' ? subTabRecord.noteBodyId : '',
        })),
      },
    }))

  const deletedSubTabs = trashItems
    .filter((item) => item.type === 'subtab')
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : '',
      parentTabId:
        isRecord(item.original) && typeof item.original.primeTabId === 'string' ? item.original.primeTabId : '',
      parentTabTitle: typeof item.parentTabTitle === 'string' ? item.parentTabTitle : 'Unknown Tab',
      deletedAt: typeof item.deletedAt === 'number' ? item.deletedAt : Date.now(),
      subTab: {
        id: isRecord(item.original) && typeof item.original.subTabId === 'string' ? item.original.subTabId : '',
        title: typeof item.title === 'string' ? item.title : 'deleted note',
        noteBodyId: typeof item.noteBodyId === 'string' ? item.noteBodyId : '',
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

  if (
    !isRecord(rootManifest) ||
    typeof rootManifest.schemaVersion !== 'number' ||
    !SUPPORTED_STORAGE_SCHEMA_VERSIONS.has(rootManifest.schemaVersion)
  ) {
    return null
  }

  const rootParts = readCurrentRootParts(fileMap, rootManifest)
  if (!rootParts) return null

  const noteBodies = readNoteBodiesFromRootManifest(rootParts.noteBodiesRoot)
  const noteAisleBodies = readNoteAisleBodiesFromRootManifest(fileMap, rootParts.noteAisleBodiesRoot)
  const domainEntries = rootParts.domainEntries
  const lastOpened = rootParts.lastOpened

  const domains = domainEntries
    .map((domainEntry): Record<string, unknown> | null => {
      const domainId = typeof domainEntry.id === 'string' ? domainEntry.id : ''
      const domainPath = typeof domainEntry.path === 'string' ? domainEntry.path : ''
      if (!domainId || !domainPath) return null
      const domainRoot = joinPosix(STORAGE_DOMAINS_DIR, domainPath)
      const domainManifestRaw = getTextFile(
        fileMap,
        joinPosix(STORAGE_ROOT_DIR, domainRoot, STORAGE_MANIFEST_FILE),
      )
      if (!domainManifestRaw) return null

      let domainManifest: Record<string, unknown>
      try {
        domainManifest = JSON.parse(domainManifestRaw) as Record<string, unknown>
      } catch {
        return null
      }

      const spaces = ensureArray<Record<string, unknown>>(domainManifest.spaces)
        .map((spaceEntry) => {
          const spacePath = typeof spaceEntry.path === 'string' ? spaceEntry.path : ''
          return spacePath ? readSpaceFromHybridFileMap(fileMap, joinPosix(domainRoot, spacePath), spaceEntry) : null
        })
        .filter((space): space is Record<string, unknown> => space !== null)

      if (spaces.length === 0) return null

      const lastOpenedSpaceId =
        lastOpened &&
        lastOpened.domainId === domainId &&
        typeof lastOpened.spaceId === 'string'
          ? lastOpened.spaceId
          : null
      const activeSpaceId =
        lastOpenedSpaceId && spaces.some((space) => space.id === lastOpenedSpaceId)
          ? lastOpenedSpaceId
          : typeof domainManifest.activeSpaceId === 'string' &&
              spaces.some((space) => space.id === domainManifest.activeSpaceId)
            ? domainManifest.activeSpaceId
            : typeof spaces[0]?.id === 'string'
              ? spaces[0].id
              : ''

      const domainName =
        typeof domainManifest.title === 'string'
          ? domainManifest.title
          : typeof domainEntry.title === 'string'
            ? domainEntry.title
            : DEFAULT_DOMAIN_NAME

      return {
        id: typeof domainManifest.id === 'string' ? domainManifest.id : domainId,
        name: domainName,
        activeSpaceId,
        spaces,
      }
    })
    .filter((domain): domain is Record<string, unknown> => domain !== null)

  if (domains.length === 0) return null

  const lastOpenedDomainId =
    lastOpened && typeof lastOpened.domainId === 'string'
      ? lastOpened.domainId
      : null
  const activeDomainId =
    lastOpenedDomainId && domains.some((domain) => domain.id === lastOpenedDomainId)
      ? lastOpenedDomainId
      : domains.some((domain) => domain.id === rootParts.activeDomainId)
        ? rootParts.activeDomainId
        : typeof domains[0]?.id === 'string'
          ? domains[0].id
          : ''
  const activeDomain = domains.find((domain) => domain.id === activeDomainId) ?? domains[0]
  const activeSpaces = ensureArray<Record<string, unknown>>(activeDomain.spaces)
  const activeSpaceId =
    lastOpened &&
    lastOpened.domainId === activeDomainId &&
    typeof lastOpened.spaceId === 'string' &&
    activeSpaces.some((space) => space.id === lastOpened.spaceId)
      ? lastOpened.spaceId
      : typeof activeDomain.activeSpaceId === 'string'
        ? activeDomain.activeSpaceId
        : typeof activeSpaces[0]?.id === 'string'
          ? activeSpaces[0].id
          : ''
  const theme = normalizeStorageTheme(rootParts.syncedSettings.theme)

  return JSON.stringify(pruneAppStateEditorLocations({
    theme,
    activeDomainId,
    domains,
    deletedDomains: rootParts.deletedDomains,
    deletedSpaces: rootParts.deletedSpaces,
    noteBodies,
    noteAisleBodies,
    activeSpaceId,
    spaces: activeSpaces,
    hotkeys: rootParts.syncedSettings.hotkeys,
    frontmatter: rootParts.syncedSettings.frontmatter,
    ui: rootParts.syncedSettings.ui,
  }))
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
