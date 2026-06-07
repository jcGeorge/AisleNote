import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { parseDocument, stringify as stringifyYaml } from 'yaml'
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
  createStorageContentHash,
  normalizeAssetExtension,
  reconcileNotebookStorageState,
} from '../src/storage/hybrid-storage-core.js'
import {
  buildStoragePathFileName,
  createStoragePathAllocator,
  createStoragePathFileNameAllocator,
} from '../src/storage/storage-path-segments.js'
import {
  ROOT_SPLIT_FILES,
  USER_SETTINGS_DIR,
  USER_SETTINGS_FILE_PATH,
  buildSyncedSettingsFromSplitFiles,
  extractAppSettings,
  extractEditorState,
  extractFrontmatterSettings,
  pruneAppStateEditorLocations,
} from '../src/storage/settings-partition.js'
import {
  buildImageAssetUrl,
  MARKDOWN_LINK_PATTERN,
  normalizeImageAssetPath,
  parseImageAssetUrl,
} from '../src/markdown/image-asset-refs.js'
import { splitAssetMetadataFromUrl } from '../src/markdown/asset-metadata.js'
import { normalizePreviewReferenceTokensForMarkdown } from '../src/markdown/note-context-tokens.js'
import {
  extractMarkdownTags,
  materializeComputedFrontmatterTags,
  migrateAisleTags,
} from '../src/tags/tags.js'

export const HYBRID_ROOT_DIR = ''
const SCHEMA_VERSION = 1
const SUPPORTED_SCHEMA_VERSIONS = new Set([SCHEMA_VERSION])
const DOMAINS_DIR = 'domains'
const FRONTMATTER_OPEN_RE = /^---[ \t]*(?:\r?\n|$)/
const FRONTMATTER_CLOSE_RE = /(?:^|\r?\n)---[ \t]*(?:\r?\n|$)/
const INTERNAL_INDENT_TOKEN = '\u2060\u2003\u2003'
const EDITOR_BLANK_LINE_PLACEHOLDER = '\u200b'
const EXPORT_TAB_SPACES = '    '
const LINKED_AISLE_MIRROR_AUTO_DECOUPLED_CODE = 'linked-aisle-mirror-auto-decoupled'

function createStorageIssue(code, severity, pathValue, message, details = undefined) {
  return {
    code,
    severity,
    ...(pathValue ? { path: pathValue } : {}),
    message,
    ...(isRecord(details) ? details : {}),
  }
}

function getStorageHealth(issues) {
  if (issues.some((issue) => issue?.severity === 'error')) return 'error'
  if (issues.length > 0) return 'warning'
  return 'healthy'
}

function addStorageIssue(issues, code, severity, pathValue, message) {
  if (!Array.isArray(issues)) return
  issues.push(createStorageIssue(code, severity, pathValue, message))
}

function addStorageIssueWithDetails(issues, code, severity, pathValue, message, details) {
  if (!Array.isArray(issues)) return
  issues.push(createStorageIssue(code, severity, pathValue, message, details))
}

function formatStorageIssuePath(rootPath, absolutePath) {
  const relativePath = path.relative(rootPath, absolutePath).split(path.sep).join(path.posix.sep)
  return relativePath && !relativePath.startsWith('..') ? path.posix.join(HYBRID_ROOT_DIR, relativePath) : absolutePath
}

function withStorageHealth(result, issues) {
  const normalizedIssues = Array.isArray(issues) ? issues : []
  return {
    ...result,
    health: result.ok === false ? 'error' : getStorageHealth(normalizedIssues),
    issues: normalizedIssues,
  }
}

function addNotebookReconciliationIssues(issues, repairs) {
  if (!Array.isArray(issues)) return
  for (const repair of ensureArray(repairs)) {
    if (!repair || typeof repair.code !== 'string') continue
    addStorageIssue(
      issues,
      repair.code,
      'warning',
      path.posix.join(HYBRID_ROOT_DIR, 'manifest.json'),
      typeof repair.message === 'string' ? repair.message : 'Notebook storage was repaired.',
    )
  }
}

function getMimeTypeFromFilePath(filePath) {
  const ext = path.extname(filePath).slice(1)
  return getMimeTypeFromExtension(ext)
}

function decodeImageDataUrl(dataUrl) {
  const match = String(dataUrl).match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/)
  if (!match) return null

  try {
    return {
      bytes: Buffer.from(match[2], 'base64'),
      extension: getExtensionFromMimeType(match[1]),
    }
  } catch {
    return null
  }
}

function buildImageDataUrl(bytes, sourceFilePath) {
  const mimeType = getMimeTypeFromFilePath(sourceFilePath)
  return `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`
}

function convertInternalTabsForExport(markdown) {
  return String(markdown ?? '')
    .split('\n')
    .map((line) => {
      const withoutPlaceholder = line.replaceAll(EDITOR_BLANK_LINE_PLACEHOLDER, '')
      return withoutPlaceholder.trim().length === 0 && line.includes(EDITOR_BLANK_LINE_PLACEHOLDER) ? '' : line
    })
    .join('\n')
    .replaceAll(INTERNAL_INDENT_TOKEN, EXPORT_TAB_SPACES)
    .replaceAll('\u2003\u2003', EXPORT_TAB_SPACES)
    .replaceAll('\u00A0', ' ')
}

function normalizeAppStateForExport(appState) {
  return {
    ...appState,
    noteAisleBodies: ensureArray(appState?.noteAisleBodies).map((body) => ({
      ...body,
      markdown: convertInternalTabsForExport(body?.markdown),
    })),
  }
}

function createAssetBank(assetRootRelative = 'assets', existingRoot = null) {
  return {
    assetRootRelative,
    existingRoot,
    files: new Map(),
    keys: new Map(),
  }
}

function listDirectoryEntries(directoryPath) {
  try {
    if (!existsSync(directoryPath)) return []
    return readdirSync(directoryPath, { withFileTypes: true })
  } catch {
    return []
  }
}

function buildTrashDataFromManifestItems(trashItems) {
  const deletedTabs = ensureArray(trashItems)
    .filter((item) => item?.type === 'parent-tab')
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : '',
      deletedAt: typeof item.deletedAt === 'number' ? item.deletedAt : Date.now(),
      tab: {
        id:
          typeof item?.original?.primeTabId === 'string'
            ? item.original.primeTabId
            : typeof item.id === 'string'
              ? item.id
              : '',
        title: typeof item.title === 'string' ? item.title : 'deleted tab',
        noteBodyId: typeof item.noteBodyId === 'string' ? item.noteBodyId : '',
        activeSubTabId: typeof item.activeSubTabId === 'string' ? item.activeSubTabId : null,
        subTabs: ensureArray(item.subTabs).map((subTabRecord) => ({
          id: typeof subTabRecord?.id === 'string' ? subTabRecord.id : '',
          title: typeof subTabRecord?.title === 'string' ? subTabRecord.title : 'tab',
          noteBodyId: typeof subTabRecord?.noteBodyId === 'string' ? subTabRecord.noteBodyId : '',
        })),
      },
    }))
    .filter((entry) => entry.id && entry.tab.id)

  const deletedSubTabs = ensureArray(trashItems)
    .filter((item) => item?.type === 'subtab')
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : '',
      parentTabId: typeof item?.original?.primeTabId === 'string' ? item.original.primeTabId : '',
      parentTabTitle: typeof item.parentTabTitle === 'string' ? item.parentTabTitle : 'Unknown Tab',
      deletedAt: typeof item.deletedAt === 'number' ? item.deletedAt : Date.now(),
      subTab: {
        id: typeof item?.original?.subTabId === 'string' ? item.original.subTabId : typeof item.id === 'string' ? item.id : '',
        title: typeof item.title === 'string' ? item.title : 'deleted note',
        noteBodyId: typeof item.noteBodyId === 'string' ? item.noteBodyId : '',
      },
    }))
    .filter((entry) => entry.id && entry.parentTabId && entry.subTab.id)

  return { deletedTabs, deletedSubTabs }
}

function pushVisibleNoteFileRef(visibleNoteFileRefs, noteBodyId, rootRelativeFile, details = {}) {
  if (!Array.isArray(visibleNoteFileRefs)) return
  const bodyId = typeof noteBodyId === 'string' ? noteBodyId : ''
  const file = typeof rootRelativeFile === 'string' ? rootRelativeFile : ''
  if (!bodyId || !file) return
  visibleNoteFileRefs.push({
    noteBodyId: bodyId,
    file,
    ...(isRecord(details) ? details : {}),
  })
}

function collectVisibleNoteFileRefsFromSpaceManifest(spaceRootRelative, spaceManifest, visibleNoteFileRefs, details = {}) {
  if (!Array.isArray(visibleNoteFileRefs)) return
  const domainId = typeof details.domainId === 'string' ? details.domainId : ''
  const spaceId = typeof details.spaceId === 'string' ? details.spaceId : ''
  ensureArray(spaceManifest?.tabs).forEach((tabRecord) => {
    const tabId = typeof tabRecord?.id === 'string' ? tabRecord.id : ''
    const noteBodyId = typeof tabRecord?.noteBodyId === 'string' ? tabRecord.noteBodyId : ''
    const homeNoteFile = typeof tabRecord?.homeNoteFile === 'string' ? tabRecord.homeNoteFile : ''
    if (noteBodyId && homeNoteFile) {
      pushVisibleNoteFileRef(visibleNoteFileRefs, noteBodyId, path.posix.join(spaceRootRelative, homeNoteFile), {
        location: domainId && spaceId && tabId
          ? { domainId, spaceId, tabId, subTabId: null }
          : undefined,
      })
    }
    ensureArray(tabRecord?.subTabs).forEach((subTabRecord) => {
      const subTabId = typeof subTabRecord?.id === 'string' ? subTabRecord.id : ''
      const subTabNoteBodyId = typeof subTabRecord?.noteBodyId === 'string' ? subTabRecord.noteBodyId : ''
      const subTabFile = typeof subTabRecord?.file === 'string' ? subTabRecord.file : ''
      if (subTabNoteBodyId && subTabFile) {
        pushVisibleNoteFileRef(visibleNoteFileRefs, subTabNoteBodyId, path.posix.join(spaceRootRelative, subTabFile), {
          location: domainId && spaceId && tabId && subTabId
            ? { domainId, spaceId, tabId, subTabId }
            : undefined,
        })
      }
    })
  })
}

function collectVisibleNoteFileRefsFromTrashItems(trashRootRelative, trashItems, visibleNoteFileRefs) {
  if (!Array.isArray(visibleNoteFileRefs)) return
  ensureArray(trashItems).forEach((item) => {
    const noteBodyId = typeof item?.noteBodyId === 'string' ? item.noteBodyId : ''
    const file = typeof item?.file === 'string' ? item.file : ''
    if (noteBodyId && file) {
      pushVisibleNoteFileRef(visibleNoteFileRefs, noteBodyId, path.posix.join(trashRootRelative, file))
    }
    ensureArray(item?.subTabs).forEach((subTabRecord) => {
      const subTabNoteBodyId = typeof subTabRecord?.noteBodyId === 'string' ? subTabRecord.noteBodyId : ''
      const subTabFile = typeof subTabRecord?.file === 'string' ? subTabRecord.file : ''
      if (subTabNoteBodyId && subTabFile) {
        pushVisibleNoteFileRef(visibleNoteFileRefs, subTabNoteBodyId, path.posix.join(trashRootRelative, subTabFile))
      }
    })
  })
}

function readTrashData(spaceRoot, trashManifestFile, issues = null, issueRootPath = null, options = {}) {
  const trashRoot = path.join(spaceRoot, 'trash')
  const trashManifestPath = trashManifestFile
    ? path.join(spaceRoot, trashManifestFile)
    : path.join(trashRoot, 'manifest.json')
  const trashManifest = readJsonFileIfExists(trashManifestPath, issues, {
    rootPath: issueRootPath,
    missingCode: 'missing-trash-manifest',
    parseCode: 'corrupt-trash-manifest',
    severity: 'warning',
    missingMessage: 'Trash manifest is missing; trash was loaded as empty for this space.',
    parseMessage: 'Trash manifest is corrupt; trash was loaded as empty for this space.',
  })
  if (!trashManifest || typeof trashManifest !== 'object') {
    return { deletedTabs: [], deletedSubTabs: [] }
  }
  collectVisibleNoteFileRefsFromTrashItems(options.trashRootRelative, trashManifest.items, options.visibleNoteFileRefs)
  return buildTrashDataFromManifestItems(trashManifest.items)
}

function addAssetToBank(assetBank, bytes, extension) {
  const ext = normalizeAssetExtension(extension)
  const buffer = Buffer.from(bytes)
  const hash = createHash('sha1').update(buffer).digest('hex').slice(0, 16)
  const key = `${hash}.${ext}`
  const existing = assetBank.keys.get(key)
  if (existing) return existing

  const relativeAssetPath = path.posix.join(assetBank.assetRootRelative, `asset-${hash}.${ext}`)
  assetBank.keys.set(key, relativeAssetPath)
  assetBank.files.set(relativeAssetPath, buffer)
  return relativeAssetPath
}

function addAssetToNotesRoot(notesRootPath, bytes, extension) {
  const ext = normalizeAssetExtension(extension)
  const buffer = Buffer.from(bytes)
  const hash = createHash('sha1').update(buffer).digest('hex').slice(0, 16)
  const relativeAssetPath = path.posix.join('assets', `asset-${hash}.${ext}`)
  writeBinaryFileAtomic(notesRootPath, relativeAssetPath, buffer)
  return relativeAssetPath
}

export function writeImageAssetToProfile(profileRootPath, bytes, extension) {
  return writeAssetToProfile(profileRootPath, bytes, extension)
}

export function writeAssetToProfile(profileRootPath, bytes, extension) {
  const notesRootPath = getHybridStorageRoot(profileRootPath)
  const assetPath = addAssetToNotesRoot(notesRootPath, bytes, extension)
  return {
    assetPath,
    url: buildImageAssetUrl(assetPath),
  }
}

function readStorageJsonFile(rootPath, rootRelativeFile) {
  if (typeof rootRelativeFile !== 'string' || !rootRelativeFile.trim()) return null
  return readJsonFileIfExists(path.join(rootPath, ...rootRelativeFile.split('/').filter(Boolean)))
}

function resolveStorageAbsolutePath(rootPath, rootRelativePath) {
  if (typeof rootRelativePath !== 'string' || !rootRelativePath.trim()) return null
  const absolutePath = path.resolve(rootPath, ...rootRelativePath.split('/').filter(Boolean))
  return absolutePath === rootPath || absolutePath.startsWith(rootPath + path.sep) ? absolutePath : null
}

function getRootSplitJson(rootPath, rootManifest, key) {
  const files = isRecord(rootManifest?.files) ? rootManifest.files : null
  return readStorageJsonFile(rootPath, typeof files?.[key] === 'string' ? files[key] : '')
}

function getStoredNoteBodyAisleCount(noteRegistry, noteBodyId) {
  if (typeof noteBodyId !== 'string' || !noteBodyId) return 0
  const noteBody = ensureArray(noteRegistry?.noteBodies).find((body) => body?.id === noteBodyId)
  return ensureArray(noteBody?.aisles).length
}

function getStoredRootParts(rootPath) {
  const rootManifest = readJsonFileIfExists(path.join(rootPath, 'manifest.json'))
  if (!isRecord(rootManifest)) return null
  const workspaceIndex = getRootSplitJson(rootPath, rootManifest, 'workspaceIndex')
  const noteRegistry = getRootSplitJson(rootPath, rootManifest, 'noteRegistry')
  if (!isRecord(workspaceIndex) || !isRecord(noteRegistry)) return null
  return { workspaceIndex, noteRegistry }
}

function getLiveNoteRevealRelativePath(rootPath, rootParts, location) {
  if (!isRecord(location)) return null
  const domainId = typeof location.domainId === 'string' ? location.domainId : ''
  const spaceId = typeof location.spaceId === 'string' ? location.spaceId : ''
  const tabId = typeof location.tabId === 'string' ? location.tabId : ''
  const subTabId = typeof location.subTabId === 'string' ? location.subTabId : null
  if (!domainId || !spaceId || !tabId) return null

  const domainEntry = ensureArray(rootParts.workspaceIndex.domains).find((entry) => entry?.id === domainId)
  const domainPath = typeof domainEntry?.path === 'string' ? domainEntry.path : ''
  if (!domainPath) return null
  const domainRoot = path.posix.join(DOMAINS_DIR, domainPath)
  const domainManifest = readStorageJsonFile(rootPath, path.posix.join(domainRoot, 'manifest.json'))
  const spaceEntry = ensureArray(domainManifest?.spaces).find((entry) => entry?.id === spaceId)
  const spacePath = typeof spaceEntry?.path === 'string' ? spaceEntry.path : ''
  if (!spacePath) return null
  const spaceRoot = path.posix.join(domainRoot, spacePath)
  const spaceManifest = readStorageJsonFile(rootPath, path.posix.join(spaceRoot, 'manifest.json'))
  const tab = ensureArray(spaceManifest?.tabs).find((entry) => entry?.id === tabId)
  if (!tab) return null

  if (subTabId === null) {
    const homeNoteFile = typeof tab.homeNoteFile === 'string' ? tab.homeNoteFile : ''
    const noteBodyId = typeof tab.noteBodyId === 'string' ? tab.noteBodyId : ''
    if (!homeNoteFile) return null
    return path.posix.join(
      spaceRoot,
      getStoredNoteBodyAisleCount(rootParts.noteRegistry, noteBodyId) > 1
        ? path.posix.dirname(homeNoteFile)
        : homeNoteFile,
    )
  }

  const subTab = ensureArray(tab.subTabs).find((entry) => entry?.id === subTabId)
  const noteBodyId = typeof subTab?.noteBodyId === 'string' ? subTab.noteBodyId : ''
  const subTabFile = typeof subTab?.file === 'string' ? subTab.file : ''
  const subTabPath = typeof subTab?.path === 'string' ? subTab.path : ''
  if (!subTabFile && !subTabPath) return null
  return path.posix.join(
    spaceRoot,
    getStoredNoteBodyAisleCount(rootParts.noteRegistry, noteBodyId) > 1 ? subTabPath : subTabFile,
  )
}

function getScratchpadRevealRelativePath(rootParts) {
  const scratchpad = isRecord(rootParts.workspaceIndex.scratchpad) ? rootParts.workspaceIndex.scratchpad : null
  const noteBodyId = typeof scratchpad?.noteBodyId === 'string' ? scratchpad.noteBodyId : ''
  if (!noteBodyId) return null
  return getStoredNoteBodyAisleCount(rootParts.noteRegistry, noteBodyId) > 1
    ? 'scratchpad'
    : path.posix.join('scratchpad', 'scratchpad.md')
}

export function resolveNoteLocationRevealPath(profileRootPath, payload = {}) {
  const rootPath = getHybridStorageRoot(profileRootPath)
  const rootParts = getStoredRootParts(rootPath)
  if (!rootParts) return { ok: false, error: 'Notebook data could not be read.' }

  const rootRelativePath =
    payload?.type === 'scratchpad'
      ? getScratchpadRevealRelativePath(rootParts)
      : payload?.type === 'live-note'
        ? getLiveNoteRevealRelativePath(rootPath, rootParts, payload.location)
        : null
  if (!rootRelativePath) return { ok: false, error: 'Note file could not be resolved.' }

  const absolutePath = resolveStorageAbsolutePath(rootPath, rootRelativePath)
  if (!absolutePath) return { ok: false, error: 'Note file path is invalid.' }
  return { ok: true, absolutePath, rootRelativePath }
}

function externalizeMarkdownImages(markdown, noteFileRelative, assetBank) {
  return String(markdown ?? '').replace(MARKDOWN_LINK_PATTERN, (fullMatch, imageBang, label, srcRaw) => {
    const src = String(srcRaw ?? '').trim()
    if (!src) return fullMatch
    const { assetUrl, metadataFragment: normalizedMetadataFragment } = splitAssetMetadataFromUrl(src)

    let decoded = null
    let assetRelativePath = parseImageAssetUrl(assetUrl)

    if (assetRelativePath) {
      assetRelativePath = normalizeImageAssetPath(assetRelativePath)
      if (assetBank.existingRoot) {
        const existingAssetPath = path.join(assetBank.existingRoot, assetRelativePath)
        if (existsSync(existingAssetPath)) {
          assetBank.files.set(assetRelativePath, readFileSync(existingAssetPath))
        }
      }
    } else if (imageBang === '!' && assetUrl.startsWith('data:image/')) {
      decoded = decodeImageDataUrl(assetUrl)
    } else if (assetUrl.startsWith('file://')) {
      try {
        const absolutePath = fileURLToPath(assetUrl)
        if (existsSync(absolutePath)) {
          decoded = {
            bytes: readFileSync(absolutePath),
            extension: normalizeAssetExtension(path.extname(absolutePath).slice(1)),
          }
        }
      } catch {
        decoded = null
      }
    }

    if (!assetRelativePath && decoded) {
      assetRelativePath = addAssetToBank(assetBank, decoded.bytes, decoded.extension)
    }

    if (!assetRelativePath) return fullMatch
    const noteDirectory = path.posix.dirname(noteFileRelative)
    const nextSrc = path.posix.relative(noteDirectory, assetRelativePath) || path.posix.basename(assetRelativePath)
    return `${imageBang}[${label}](${nextSrc}${normalizedMetadataFragment})`
  })
}

function referenceMarkdownImages(markdown, noteFilePath, issues = null, issueRootPath = null) {
  return String(markdown ?? '').replace(MARKDOWN_LINK_PATTERN, (fullMatch, imageBang, label, srcRaw) => {
    const src = String(srcRaw ?? '').trim()
    if (!src) return fullMatch
    const { assetUrl, metadataFragment: normalizedMetadataFragment } = splitAssetMetadataFromUrl(src)
    if (parseImageAssetUrl(assetUrl)) return fullMatch
    if (imageBang === '!' && assetUrl.startsWith('data:image/')) {
      const decoded = decodeImageDataUrl(assetUrl)
      if (!decoded || !issueRootPath) return fullMatch
      const assetPath = addAssetToNotesRoot(issueRootPath, decoded.bytes, decoded.extension)
      return `${imageBang}[${label}](${buildImageAssetUrl(assetPath)}${normalizedMetadataFragment})`
    }
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(assetUrl) && !assetUrl.startsWith('file://')) return fullMatch

    let absolutePath = null
    if (assetUrl.startsWith('file://')) {
      try {
        absolutePath = fileURLToPath(assetUrl)
      } catch {
        absolutePath = null
      }
    } else {
      absolutePath = path.resolve(path.dirname(noteFilePath), assetUrl)
    }

    if (!imageBang && !absolutePath) return fullMatch
    if (!imageBang && issueRootPath) {
      const candidateRootRelativePath = normalizeImageAssetPath(
        path.relative(issueRootPath, absolutePath).split(path.sep).join(path.posix.sep),
      )
      if (!candidateRootRelativePath.startsWith('assets/')) return fullMatch
    } else if (!imageBang) {
      return fullMatch
    }

    if (!absolutePath || !existsSync(absolutePath)) {
      addStorageIssue(
        issues,
        'missing-asset',
        'warning',
        absolutePath && issueRootPath ? formatStorageIssuePath(issueRootPath, absolutePath) : absolutePath,
        'Referenced asset is missing; the Markdown reference was kept unchanged.',
      )
      return fullMatch
    }

    try {
      const rootRelativePath = issueRootPath
        ? normalizeImageAssetPath(path.relative(issueRootPath, absolutePath).split(path.sep).join(path.posix.sep))
        : normalizeImageAssetPath(path.basename(absolutePath))
      if (!imageBang && !rootRelativePath.startsWith('assets/')) return fullMatch
      return `${imageBang}[${label}](${buildImageAssetUrl(rootRelativePath)}${normalizedMetadataFragment})`
    } catch {
      addStorageIssue(
        issues,
        'unreadable-asset',
        'warning',
        issueRootPath ? formatStorageIssuePath(issueRootPath, absolutePath) : absolutePath,
        'Referenced asset could not be read; the Markdown reference was kept unchanged.',
      )
      return fullMatch
    }
  })
}

export function getHybridStorageRoot(profileRootPath) {
  return path.resolve(profileRootPath)
}

export function getUserSettingsFilePath(profileRootPath) {
  return path.join(profileRootPath, USER_SETTINGS_FILE_PATH)
}

function readTextFileIfExists(filePath, issues = null, issueOptions = {}) {
  try {
    if (!existsSync(filePath)) {
      if (issueOptions.missingCode) {
        addStorageIssue(
          issues,
          issueOptions.missingCode,
          issueOptions.severity ?? 'warning',
          issueOptions.rootPath ? formatStorageIssuePath(issueOptions.rootPath, filePath) : filePath,
          issueOptions.missingMessage ?? 'Expected storage file is missing.',
        )
      }
      return null
    }
    return readFileSync(filePath, 'utf8')
  } catch {
    if (issueOptions.readCode) {
      addStorageIssue(
        issues,
        issueOptions.readCode,
        issueOptions.severity ?? 'warning',
        issueOptions.rootPath ? formatStorageIssuePath(issueOptions.rootPath, filePath) : filePath,
        issueOptions.readMessage ?? 'Storage file could not be read.',
      )
    }
    return null
  }
}

function readJsonFileIfExists(filePath, issues = null, issueOptions = {}) {
  const raw = readTextFileIfExists(filePath, issues, issueOptions)
  if (raw === null) return null
  try {
    return JSON.parse(raw)
  } catch {
    if (issueOptions.parseCode) {
      addStorageIssue(
        issues,
        issueOptions.parseCode,
        issueOptions.severity ?? 'warning',
        issueOptions.rootPath ? formatStorageIssuePath(issueOptions.rootPath, filePath) : filePath,
        issueOptions.parseMessage ?? 'Storage JSON could not be parsed.',
      )
    }
    return null
  }
}

function writeTextFileAtomic(rootPath, relativeFile, contents) {
  const absolutePath = path.join(rootPath, relativeFile)
  try {
    if (readFileSync(absolutePath, 'utf8') === contents) return
  } catch {
    // Missing or unreadable files are rewritten below.
  }
  mkdirSync(path.dirname(absolutePath), { recursive: true })
  const tempPath = path.join(
    path.dirname(absolutePath),
    `.${path.basename(absolutePath)}.${process.pid}.${Date.now()}.tmp`,
  )
  writeFileSync(tempPath, contents, 'utf8')
  renameSync(tempPath, absolutePath)
}

function writeBinaryFileAtomic(rootPath, relativeFile, contents) {
  const absolutePath = path.join(rootPath, relativeFile)
  try {
    const existing = readFileSync(absolutePath)
    if (existing.length === contents.length && existing.equals(Buffer.from(contents))) return
  } catch {
    // Missing or unreadable files are rewritten below.
  }
  mkdirSync(path.dirname(absolutePath), { recursive: true })
  const tempPath = path.join(
    path.dirname(absolutePath),
    `.${path.basename(absolutePath)}.${process.pid}.${Date.now()}.tmp`,
  )
  writeFileSync(tempPath, contents)
  renameSync(tempPath, absolutePath)
}

export function writeAppSettingsForState(userSettingsRoot, serializedState) {
  const parsedState = JSON.parse(serializedState)
  writeTextFileAtomic(
    userSettingsRoot,
    USER_SETTINGS_FILE_PATH,
    `${JSON.stringify(extractAppSettings(parsedState), null, 2)}\n`,
  )
}

function readMarkdownFile(baseDirectory, relativeFile, issues = null, issueRootPath = null) {
  const absolutePath = path.join(baseDirectory, relativeFile)
  const markdown = readTextFileIfExists(absolutePath, issues, {
    rootPath: issueRootPath,
    missingCode: 'missing-markdown',
    readCode: 'unreadable-markdown',
    severity: 'warning',
    missingMessage: 'Markdown file is missing; this note was loaded as empty.',
    readMessage: 'Markdown file could not be read; this note was loaded as empty.',
  }) ?? ''
  return referenceMarkdownImages(markdown, absolutePath, issues, issueRootPath)
}

function hasCloudConflictName(name) {
  return (
    /^notes(?: \d+)?\.bak$/i.test(name) ||
    /^notes \d+$/i.test(name) ||
    /^(topics|domains|note-bodies|assets|trash|manifest)(?: \d+)$/i.test(name) ||
    /\.bak$/i.test(name)
  )
}

function detectStorageConflicts(profileRootPath, rootPath) {
  const conflicts = []
  const seen = new Set()
  for (const entry of listDirectoryEntries(rootPath)) {
    if (!hasCloudConflictName(entry.name) || seen.has(entry.name)) continue
    seen.add(entry.name)
    conflicts.push(entry.name)
  }
  void profileRootPath
  return conflicts
}

function removeStorageConflictPaths(profileRootPath, rootPath) {
  for (const entry of listDirectoryEntries(rootPath)) {
    if (hasCloudConflictName(entry.name)) rmSync(path.join(rootPath, entry.name), { recursive: true, force: true })
  }
  void profileRootPath
}

function pruneStorageRoot(rootPath, expectedRelativeFiles) {
  const expected = new Set(expectedRelativeFiles)

  function pruneDirectory(currentPath) {
    for (const entry of listDirectoryEntries(currentPath)) {
      const absolutePath = path.join(currentPath, entry.name)
      const relativePath = path.relative(rootPath, absolutePath).split(path.sep).join(path.posix.sep)
      if (entry.isDirectory()) {
        pruneDirectory(absolutePath)
        try {
          if (readdirSync(absolutePath).length === 0) rmSync(absolutePath, { recursive: true, force: true })
        } catch {
          // Ignore cloud-provider races while pruning stale paths.
        }
        continue
      }
      if (!entry.isFile()) continue
      if (!expected.has(relativePath)) rmSync(absolutePath, { force: true })
    }
  }

  if (existsSync(rootPath)) pruneDirectory(rootPath)
}

function isMainPerformanceLoggingEnabled() {
  return Boolean(process.env.VITE_DEV_SERVER_URL || process.env.TABS_PERF_LOG === '1')
}

function measureSlowMainOperation(label, operation, thresholdMs = 75) {
  const startedAt = Date.now()
  try {
    return operation()
  } finally {
    const durationMs = Date.now() - startedAt
    if (isMainPerformanceLoggingEnabled() && durationMs >= thresholdMs) {
      console.warn(`[tabs perf] ${label} took ${durationMs.toFixed(1)}ms`)
    }
  }
}

function setStorageTextFile(fileMap, relativeFile, contents) {
  fileMap.set(relativeFile, { kind: 'text', contents: String(contents ?? '') })
}

function setStorageJsonFile(fileMap, relativeFile, value) {
  setStorageTextFile(fileMap, relativeFile, `${JSON.stringify(value, null, 2)}\n`)
}

function setStorageBinaryFile(fileMap, relativeFile, contents) {
  fileMap.set(relativeFile, { kind: 'binary', contents: Buffer.from(contents) })
}

function addAssetBankToStorageFileMap(fileMap, assetBank) {
  for (const [relativeFile, bytes] of assetBank.files.entries()) {
    setStorageBinaryFile(fileMap, relativeFile, bytes)
  }
}

function buildNoteBodyManifestRecord(body, aisles) {
  return {
    id: typeof body?.id === 'string' ? body.id : '',
    createdAt: typeof body?.createdAt === 'string' ? body.createdAt : undefined,
    updatedAt: typeof body?.updatedAt === 'string' ? body.updatedAt : undefined,
    aisles,
  }
}

function stringifyFrontmatterYaml(frontmatter) {
  if (!isRecord(frontmatter) || Object.keys(frontmatter).length === 0) return ''
  return stringifyYaml(frontmatter, {
    collectionStyle: 'block',
    lineWidth: 0,
  })
    .trimEnd()
    .replace(/^([ \t]*[^:\n]+:)[ \t]*\r?\n[ \t]+\[\]$/gm, '$1 []')
}

function parseFrontmatterYaml(rawYaml) {
  const trimmed = String(rawYaml ?? '').trim()
  if (!trimmed) return { ok: true, data: null }
  const document = parseDocument(trimmed, { prettyErrors: false })
  if (document.errors.length > 0) {
    return { ok: false, message: document.errors[0]?.message || 'Frontmatter YAML is invalid.' }
  }
  const parsed = document.toJS()
  if (parsed == null) return { ok: true, data: null }
  if (!isRecord(parsed) || Array.isArray(parsed)) {
    return { ok: false, message: 'Frontmatter must be a YAML mapping.' }
  }
  return { ok: true, data: parsed }
}

function splitMarkdownFrontmatterForStorage(markdown) {
  if (!FRONTMATTER_OPEN_RE.test(markdown)) {
    return { markdown, frontmatter: null, frontmatterStatus: 'none' }
  }
  const openMatch = markdown.match(FRONTMATTER_OPEN_RE)
  const bodyStart = openMatch?.[0].length ?? 0
  const remainder = markdown.slice(bodyStart)
  const closeMatch = remainder.match(FRONTMATTER_CLOSE_RE)
  if (!closeMatch || closeMatch.index == null) {
    return {
      markdown,
      frontmatter: null,
      frontmatterStatus: 'invalid',
      frontmatterParseError: 'Frontmatter YAML block is missing a closing delimiter.',
      frontmatterRaw: remainder,
    }
  }
  const rawYaml = remainder.slice(0, closeMatch.index)
  const closeEnd = closeMatch.index + closeMatch[0].length
  const parsed = parseFrontmatterYaml(rawYaml)
  if (!parsed.ok) {
    return {
      markdown,
      frontmatter: null,
      frontmatterStatus: 'invalid',
      frontmatterParseError: parsed.message,
      frontmatterRaw: rawYaml,
    }
  }
  return {
    markdown: remainder.slice(closeEnd).replace(/^\r?\n/, ''),
    frontmatter: parsed.data,
    frontmatterStatus: 'valid',
    frontmatterRaw: rawYaml,
  }
}

function readMarkdownBodyFile(baseDirectory, relativeFile, issues = null, issueRootPath = null) {
  return splitMarkdownFrontmatterForStorage(readMarkdownFile(baseDirectory, relativeFile, issues, issueRootPath)).markdown
}

function normalizeAisleStorageContentForHash(content) {
  const frontmatterStatus = content?.frontmatterStatus === 'valid' || content?.frontmatterStatus === 'invalid'
    ? content.frontmatterStatus
    : 'none'
  const markdown = typeof content?.markdown === 'string' ? content.markdown : ''
  const tags = extractMarkdownTags(markdown)
  const frontmatter = materializeComputedFrontmatterTags(content?.frontmatter, content?.frontmatterMeta, tags)
  return {
    markdown,
    frontmatterStatus,
    frontmatter: frontmatterStatus === 'valid' && isRecord(frontmatter) ? frontmatter : null,
    frontmatterParseError: frontmatterStatus === 'invalid' && typeof content?.frontmatterParseError === 'string'
      ? content.frontmatterParseError
      : undefined,
    frontmatterRaw: frontmatterStatus === 'invalid' && typeof content?.frontmatterRaw === 'string'
      ? content.frontmatterRaw
      : undefined,
  }
}

function getAisleStorageContentHash(content) {
  return createStorageContentHash(normalizeAisleStorageContentForHash(content))
}

function composeAisleMarkdownForStorage(markdown, aisleBody) {
  if (aisleBody?.frontmatterStatus === 'invalid') return markdown
  const tags = extractMarkdownTags(markdown)
  const frontmatter = materializeComputedFrontmatterTags(aisleBody?.frontmatter, aisleBody?.frontmatterMeta, tags)
  const yaml = stringifyFrontmatterYaml(frontmatter)
  return yaml ? `---\n${yaml}\n---\n${markdown}` : markdown
}

function buildNoteAisleBodyManifestRecord(aisleBodyId, file, aisleBody) {
  return {
    id: aisleBodyId,
    file,
    contentHash: getAisleStorageContentHash(aisleBody),
    tags: extractMarkdownTags(String(aisleBody?.markdown ?? '')),
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
}) {
  const posixPath = path.posix
  const bodyId = typeof noteBodyId === 'string' ? noteBodyId : ''
  const body = bodyId ? noteBodyMap.get(bodyId) : null
  const sourceAisles = ensureArray(body?.aisles)
  const usesAisleFolder = sourceAisles.length > 1
  const notePath = usesAisleFolder ? multiAisleRootRelative : primaryFileRelative

  const getAisleFile = (index, aisleId) => {
    const aisleFileName = buildStoragePathFileName(`aisle ${index + 1}`, aisleId, 'aisle', '.md')
    return posixPath.join(multiAisleRootRelative, aisleFileName)
  }

  if (body && noteBodyRecords.has(bodyId)) {
    const firstAisle = sourceAisles[0]
    const firstAisleId = typeof firstAisle?.id === 'string' && firstAisle.id ? firstAisle.id : `${bodyId}-aisle-1`
    const firstAisleBodyId =
      typeof firstAisle?.aisleBodyId === 'string' && firstAisle.aisleBodyId
        ? firstAisle.aisleBodyId
        : firstAisleId
    const sourceAisleBody = firstAisleBodyId ? noteAisleBodyMap.get(firstAisleBodyId) : undefined
    const sharedMarkdown = sourceAisleBody?.markdown
    const markdown = typeof sharedMarkdown === 'string' ? sharedMarkdown : ''
    const primaryFile = usesAisleFolder
      ? getAisleFile(0, firstAisleId)
      : primaryFileRelative
    setStorageTextFile(
      fileMap,
      primaryFile,
      externalizeMarkdownImages(
        normalizePreviewReferenceTokensForMarkdown(composeAisleMarkdownForStorage(markdown, sourceAisleBody), appState),
        primaryFile,
        assetBank,
      ),
    )
    return { primaryFile, notePath }
  }

  if (!body || sourceAisles.length === 0) {
    setStorageTextFile(fileMap, primaryFileRelative, externalizeMarkdownImages('', primaryFileRelative, assetBank))
    if (body && bodyId) {
      const aisleId = `${bodyId}-home`
      noteBodyRecords.set(bodyId, buildNoteBodyManifestRecord(body, [
        {
          id: aisleId,
          aisleBodyId: aisleId,
          file: primaryFileRelative,
          contentHash: getAisleStorageContentHash(undefined),
          tags: [],
        },
      ]))
      if (!noteAisleBodyRecords.has(aisleId)) {
        noteAisleBodyRecords.set(aisleId, buildNoteAisleBodyManifestRecord(aisleId, primaryFileRelative, undefined))
      }
    }
    return { primaryFile: primaryFileRelative, notePath: primaryFileRelative }
  }

  const aisleRecords = []
  sourceAisles.forEach((aisle, index) => {
    const aisleId = typeof aisle?.id === 'string' && aisle.id ? aisle.id : `${bodyId}-aisle-${index + 1}`
    const aisleBodyId = typeof aisle?.aisleBodyId === 'string' && aisle.aisleBodyId ? aisle.aisleBodyId : aisleId
    const file = usesAisleFolder ? getAisleFile(index, aisleId) : primaryFileRelative
    const sourceAisleBody = noteAisleBodyMap.get(aisleBodyId)
    const sharedMarkdown = sourceAisleBody?.markdown
    const markdown = typeof sharedMarkdown === 'string' ? sharedMarkdown : ''
    setStorageTextFile(
      fileMap,
      file,
      externalizeMarkdownImages(
        normalizePreviewReferenceTokensForMarkdown(composeAisleMarkdownForStorage(markdown, sourceAisleBody), appState),
        file,
        assetBank,
      ),
    )
    aisleRecords.push({
      id: aisleId,
      aisleBodyId,
      file,
      contentHash: getAisleStorageContentHash(sourceAisleBody),
      tags: extractMarkdownTags(String(sourceAisleBody?.markdown ?? '')),
    })
    if (!noteAisleBodyRecords.has(aisleBodyId)) {
      noteAisleBodyRecords.set(aisleBodyId, buildNoteAisleBodyManifestRecord(aisleBodyId, file, sourceAisleBody))
    }
  })
  noteBodyRecords.set(bodyId, buildNoteBodyManifestRecord(body, aisleRecords))
  return { primaryFile: aisleRecords[0]?.file ?? primaryFileRelative, notePath }
}

function buildNavigationState(appState) {
  const activeDomain = getActiveDomainFromAppState(appState, getDomainsFromAppState(appState))
  const activeDomainId = activeDomain ? getDomainId(activeDomain) : DEFAULT_DOMAIN_ID
  return {
    activeDomainId,
    ...(isRecord(appState?.lastOpened) ? { lastOpened: appState.lastOpened } : {}),
  }
}

function buildRootManifest() {
  return {
    schemaVersion: SCHEMA_VERSION,
    files: ROOT_SPLIT_FILES,
  }
}

function buildDomainManifest(domain, spaceEntries) {
  const spaces = ensureArray(domain?.spaces)
  return {
    id: getDomainId(domain),
    title: getDomainTitle(domain),
    spaces: spaceEntries,
    activeSpaceId:
      typeof domain?.activeSpaceId === 'string' && spaces.some((space) => space?.id === domain.activeSpaceId)
        ? domain.activeSpaceId
        : spaces[0]?.id ?? '',
  }
}

function buildSpaceFiles({
  fileMap,
  spaceRoot,
  space,
  noteBodyMap,
  noteAisleBodyMap,
  noteBodyRecords,
  noteAisleBodyRecords,
  assetBank,
  appState,
}) {
  const posixPath = path.posix
  const tabs = ensureArray(space?.data?.tabs)
  const tabPathForTitle = createStoragePathAllocator()
  const tabManifest = []

  for (const tab of tabs) {
    const tabId = typeof tab?.id === 'string' ? tab.id : ''
    if (!tabId) continue
    const tabSegment = tabPathForTitle(typeof tab.title === 'string' ? tab.title : 'tab', tabId, 'tab')
    const tabRoot = posixPath.join(spaceRoot, tabSegment)
    const homeWrite = writeNoteBodyAtPath({
      fileMap,
      noteBodyMap,
      noteAisleBodyMap,
      noteBodyRecords,
      noteAisleBodyRecords,
      noteBodyId: tab.noteBodyId,
      primaryFileRelative: posixPath.join(tabRoot, 'home.md'),
      multiAisleRootRelative: posixPath.join(tabRoot, 'home'),
      assetBank,
      appState,
    })
    const homeNoteFile = posixPath.relative(spaceRoot, homeWrite.primaryFile)

    const subTabPathForTitle = createStoragePathAllocator()
    const subTabFileForTitle = createStoragePathFileNameAllocator('.md')
    const subTabs = ensureArray(tab.subTabs).map((subTab) => {
      const subTabId = typeof subTab?.id === 'string' ? subTab.id : ''
      const subTabSegment = subTabPathForTitle(typeof subTab?.title === 'string' ? subTab.title : 'tab', subTabId, 'tab')
      const subTabFileName = subTabFileForTitle(typeof subTab?.title === 'string' ? subTab.title : 'tab', subTabId, 'tab')
      const subTabRoot = posixPath.join(tabRoot, subTabSegment)
      const subTabWrite = writeNoteBodyAtPath({
        fileMap,
        noteBodyMap,
        noteAisleBodyMap,
        noteBodyRecords,
        noteAisleBodyRecords,
        noteBodyId: subTab.noteBodyId,
        primaryFileRelative: posixPath.join(tabRoot, subTabFileName),
        multiAisleRootRelative: subTabRoot,
        assetBank,
        appState,
      })
      return {
        id: subTabId,
        title: typeof subTab.title === 'string' ? subTab.title : 'tab',
        path: posixPath.relative(spaceRoot, subTabWrite.notePath),
        noteBodyId: typeof subTab.noteBodyId === 'string' ? subTab.noteBodyId : '',
        file: posixPath.relative(spaceRoot, subTabWrite.primaryFile),
      }
    })

    tabManifest.push({
      id: tabId,
      title: typeof tab.title === 'string' ? tab.title : 'tab',
      path: tabSegment,
      noteBodyId: typeof tab.noteBodyId === 'string' ? tab.noteBodyId : '',
      homeNoteFile,
      subTabs,
      activeSubTabId: typeof tab.activeSubTabId === 'string' ? tab.activeSubTabId : null,
    })
  }

  const trashRoot = posixPath.join(spaceRoot, 'trash')
  const trashItems = []
  const deletedTabs = ensureArray(space?.data?.deletedTabs)
  const deletedSubTabs = ensureArray(space?.data?.deletedSubTabs)
  const trashPathForTitle = createStoragePathAllocator()

  for (const entry of deletedTabs) {
    const deletedTab = entry?.tab ?? {}
    const entryId = typeof entry?.id === 'string' ? entry.id : ''
    const deletedTabId = typeof deletedTab?.id === 'string' ? deletedTab.id : entryId
    const deletedSegment = trashPathForTitle(typeof deletedTab.title === 'string' ? deletedTab.title : 'deleted tab', entryId, 'deleted tab')
    const deletedRoot = posixPath.join(trashRoot, deletedSegment)
    const deletedHomeWrite = writeNoteBodyAtPath({
      fileMap,
      noteBodyMap,
      noteAisleBodyMap,
      noteBodyRecords,
      noteAisleBodyRecords,
      noteBodyId: deletedTab.noteBodyId,
      primaryFileRelative: posixPath.join(deletedRoot, 'home.md'),
      multiAisleRootRelative: posixPath.join(deletedRoot, 'home'),
      assetBank,
      appState,
    })
    const homeNoteFile = posixPath.relative(trashRoot, deletedHomeWrite.primaryFile)

    const deletedSubTabPathForTitle = createStoragePathAllocator()
    const deletedSubTabFileForTitle = createStoragePathFileNameAllocator('.md')
    const subTabs = ensureArray(deletedTab.subTabs).map((subTab) => {
      const subTabId = typeof subTab?.id === 'string' ? subTab.id : ''
      const subTabSegment = deletedSubTabPathForTitle(typeof subTab?.title === 'string' ? subTab.title : 'tab', subTabId, 'tab')
      const subTabFileName = deletedSubTabFileForTitle(typeof subTab?.title === 'string' ? subTab.title : 'tab', subTabId, 'tab')
      const subTabRoot = posixPath.join(deletedRoot, subTabSegment)
      const subTabWrite = writeNoteBodyAtPath({
        fileMap,
        noteBodyMap,
        noteAisleBodyMap,
        noteBodyRecords,
        noteAisleBodyRecords,
        noteBodyId: subTab.noteBodyId,
        primaryFileRelative: posixPath.join(deletedRoot, subTabFileName),
        multiAisleRootRelative: subTabRoot,
        assetBank,
        appState,
      })
      return {
        id: subTabId,
        title: typeof subTab.title === 'string' ? subTab.title : 'tab',
        path: posixPath.relative(trashRoot, subTabWrite.notePath),
        noteBodyId: typeof subTab.noteBodyId === 'string' ? subTab.noteBodyId : '',
        file: posixPath.relative(trashRoot, subTabWrite.primaryFile),
      }
    })

    trashItems.push({
      id: entryId,
      type: 'parent-tab',
      title: typeof deletedTab.title === 'string' ? deletedTab.title : 'deleted tab',
      path: deletedSegment,
      noteBodyId: typeof deletedTab.noteBodyId === 'string' ? deletedTab.noteBodyId : '',
      file: homeNoteFile,
      deletedAt: typeof entry.deletedAt === 'number' ? entry.deletedAt : Date.now(),
      original: {
        primeTabId: deletedTabId,
        subTabId: null,
      },
      activeSubTabId: typeof deletedTab.activeSubTabId === 'string' ? deletedTab.activeSubTabId : null,
      subTabs,
    })
  }

  const trashFileForTitle = createStoragePathFileNameAllocator('.md')
  for (const entry of deletedSubTabs) {
    const subTab = entry?.subTab ?? {}
    const entryId = typeof entry?.id === 'string' ? entry.id : ''
    const deletedSegment = trashPathForTitle(typeof subTab.title === 'string' ? subTab.title : 'deleted note', entryId, 'deleted note')
    const deletedFileName = trashFileForTitle(typeof subTab.title === 'string' ? subTab.title : 'deleted note', entryId, 'deleted note')
    const deletedRoot = posixPath.join(trashRoot, deletedSegment)
    const deletedWrite = writeNoteBodyAtPath({
      fileMap,
      noteBodyMap,
      noteAisleBodyMap,
      noteBodyRecords,
      noteAisleBodyRecords,
      noteBodyId: subTab.noteBodyId,
      primaryFileRelative: posixPath.join(trashRoot, deletedFileName),
      multiAisleRootRelative: deletedRoot,
      assetBank,
      appState,
    })
    trashItems.push({
      id: entryId,
      type: 'subtab',
      title: typeof subTab.title === 'string' ? subTab.title : 'deleted note',
      path: posixPath.relative(trashRoot, deletedWrite.notePath),
      noteBodyId: typeof subTab.noteBodyId === 'string' ? subTab.noteBodyId : '',
      file: posixPath.relative(trashRoot, deletedWrite.primaryFile),
      deletedAt: typeof entry.deletedAt === 'number' ? entry.deletedAt : Date.now(),
      parentTabTitle: typeof entry.parentTabTitle === 'string' ? entry.parentTabTitle : 'Unknown Tab',
      original: {
        primeTabId: typeof entry.parentTabId === 'string' ? entry.parentTabId : '',
        subTabId: typeof subTab.id === 'string' ? subTab.id : null,
      },
    })
  }

  setStorageJsonFile(fileMap, posixPath.join(spaceRoot, 'manifest.json'), {
    id: space.id,
    title: typeof space.name === 'string' ? space.name : 'Untitled Space',
    settings: space.settings ?? { autoRemoveDeletedDays: 7 },
    tabs: tabManifest,
    activeTabId:
      typeof space?.data?.activeTabId === 'string' && tabs.some((tab) => tab?.id === space.data.activeTabId)
        ? space.data.activeTabId
        : tabManifest[0]?.id ?? '',
    trashManifestFile: 'trash/manifest.json',
  })
  setStorageJsonFile(fileMap, posixPath.join(trashRoot, 'manifest.json'), { items: trashItems })

  return {
    id: typeof space.id === 'string' ? space.id : '',
    title: typeof space.name === 'string' ? space.name : 'Untitled Space',
  }
}

function writeHybridStorage(tempRoot, serializedState, options = {}) {
  const posixPath = path.posix
  const parsedState = JSON.parse(serializedState)
  const domains = getDomainsFromAppState(parsedState)
  const noteBodies = getNoteBodiesFromAppState(parsedState)
  const referencedNoteBodyIds = collectReferencedNoteBodyIdsFromAppState(parsedState)
  const noteAisleBodies = ensureArray(parsedState.noteAisleBodies).filter(isRecord)
  const noteBodyMap = new Map(noteBodies.map((body) => [typeof body.id === 'string' ? body.id : '', body]))
  const noteAisleBodyMap = new Map(noteAisleBodies.map((body) => [typeof body.id === 'string' ? body.id : '', body]))
  const noteBodyRecords = new Map()
  const noteAisleBodyRecords = new Map()
  const orphanNoteBodyIds = new Set()
  const fileMap = new Map()
  const assetBank = createAssetBank('assets', typeof options.assetSourceRoot === 'string' ? options.assetSourceRoot : tempRoot)
  const domainPathForTitle = createStoragePathAllocator()
  const domainEntries = []

  for (const domain of domains) {
    const domainId = getDomainId(domain)
    const domainSegment = domainPathForTitle(getDomainTitle(domain), domainId, 'domain')
    const domainRoot = posixPath.join(DOMAINS_DIR, domainSegment)
    const spacePathForTitle = createStoragePathAllocator()
    const spaceEntries = []

    for (const space of ensureArray(domain.spaces)) {
      if (!space || typeof space.id !== 'string' || space.id.length === 0) continue
      const spaceSegment = spacePathForTitle(typeof space.name === 'string' ? space.name : 'Untitled Space', space.id, 'space')
      const spaceRoot = posixPath.join(domainRoot, spaceSegment)
      const spaceEntry = buildSpaceFiles({
        fileMap,
        spaceRoot,
        space,
        noteBodyMap,
        noteAisleBodyMap,
        noteBodyRecords,
        noteAisleBodyRecords,
        assetBank,
        appState: parsedState,
      })
      spaceEntries.push({ ...spaceEntry, path: spaceSegment })
    }

    setStorageJsonFile(fileMap, posixPath.join(domainRoot, 'manifest.json'), buildDomainManifest(domain, spaceEntries))
    domainEntries.push({
      id: domainId,
      title: getDomainTitle(domain),
      path: domainSegment,
    })
  }

  const scratchpad = isRecord(parsedState.scratchpad) ? parsedState.scratchpad : null
  const scratchpadNoteBodyId =
    scratchpad && typeof scratchpad.noteBodyId === 'string' && scratchpad.noteBodyId ? scratchpad.noteBodyId : ''
  const scratchpadEntry = scratchpadNoteBodyId
    ? {
        noteBodyId: scratchpadNoteBodyId,
        ...(typeof scratchpad?.activeAisleId === 'string' && scratchpad.activeAisleId
          ? { activeAisleId: scratchpad.activeAisleId }
          : {}),
      }
    : null
  if (scratchpadNoteBodyId) {
    writeNoteBodyAtPath({
      fileMap,
      noteBodyMap,
      noteAisleBodyMap,
      noteBodyRecords,
      noteAisleBodyRecords,
      noteBodyId: scratchpadNoteBodyId,
      primaryFileRelative: posixPath.join('scratchpad', 'scratchpad.md'),
      multiAisleRootRelative: 'scratchpad',
      assetBank,
      appState: parsedState,
    })
  }

  const orphanPathForId = createStoragePathAllocator()
  const orphanFileForId = createStoragePathFileNameAllocator('.md')
  for (const body of noteBodies) {
    const bodyId = typeof body?.id === 'string' ? body.id : ''
    if (!bodyId || noteBodyRecords.has(bodyId) || !referencedNoteBodyIds.has(bodyId)) continue
    orphanNoteBodyIds.add(bodyId)
    const orphanSegment = orphanPathForId('Orphan Note Body', bodyId, 'orphan note body')
    const orphanFileName = orphanFileForId('Orphan Note Body', bodyId, 'orphan note body')
    writeNoteBodyAtPath({
      fileMap,
      noteBodyMap,
      noteAisleBodyMap,
      noteBodyRecords,
      noteAisleBodyRecords,
      noteBodyId: bodyId,
      primaryFileRelative: posixPath.join('_internal', 'orphan-bodies', orphanFileName),
      multiAisleRootRelative: posixPath.join('_internal', 'orphan-bodies', orphanSegment),
      assetBank,
      appState: parsedState,
    })
  }

  addAssetBankToStorageFileMap(fileMap, assetBank)
  const allNoteBodyEntries = noteBodies
    .map((body) => (typeof body?.id === 'string' ? noteBodyRecords.get(body.id) : null))
    .filter(Boolean)
  const attachedNoteBodyEntries = allNoteBodyEntries.filter((body) => {
    const bodyId = typeof body?.id === 'string' ? body.id : ''
    return !orphanNoteBodyIds.has(bodyId)
  })
  const noteBodyEntries = allNoteBodyEntries.map((body) => {
    const bodyId = typeof body?.id === 'string' ? body.id : ''
    return orphanNoteBodyIds.has(bodyId) ? { ...body, storageStatus: 'unlinked' } : body
  })
  const liveAisleBodyIds = new Set()
  for (const body of attachedNoteBodyEntries) {
    for (const aisle of ensureArray(body?.aisles)) {
      const aisleBodyId =
        typeof aisle?.aisleBodyId === 'string' && aisle.aisleBodyId
          ? aisle.aisleBodyId
          : typeof aisle?.id === 'string'
            ? aisle.id
            : ''
      if (aisleBodyId) liveAisleBodyIds.add(aisleBodyId)
    }
  }
  const aisleBodyEntries = []
  for (const body of noteAisleBodyRecords.values()) {
    const bodyId = typeof body?.id === 'string' ? body.id : ''
    aisleBodyEntries.push(bodyId && liveAisleBodyIds.has(bodyId) ? body : { ...body, storageStatus: 'unlinked' })
  }

  setStorageJsonFile(fileMap, ROOT_SPLIT_FILES.workspaceIndex, {
    domains: domainEntries,
    ...(scratchpadEntry ? { scratchpad: scratchpadEntry } : {}),
  })
  setStorageJsonFile(fileMap, ROOT_SPLIT_FILES.navigationState, buildNavigationState(parsedState))
  setStorageJsonFile(fileMap, ROOT_SPLIT_FILES.frontmatterSettings, extractFrontmatterSettings(parsedState))
  setStorageJsonFile(fileMap, ROOT_SPLIT_FILES.editorState, extractEditorState(parsedState))
  setStorageJsonFile(fileMap, ROOT_SPLIT_FILES.messages, {
    messages: ensureArray(parsedState.messages).filter(isRecord),
    toastHistory: ensureArray(parsedState.toastHistory).filter(isRecord),
  })
  setStorageJsonFile(fileMap, ROOT_SPLIT_FILES.deletedWorkspace, {
    deletedDomains: ensureArray(parsedState.deletedDomains).filter(isRecord),
    deletedSpaces: ensureArray(parsedState.deletedSpaces).filter(isRecord),
  })
  setStorageJsonFile(fileMap, ROOT_SPLIT_FILES.noteRegistry, { noteBodies: noteBodyEntries, aisleBodies: aisleBodyEntries })
  setStorageJsonFile(fileMap, 'manifest.json', buildRootManifest())

  mkdirSync(tempRoot, { recursive: true })
  for (const [relativeFile, entry] of fileMap.entries()) {
    if (relativeFile === 'manifest.json') continue
    if (entry.kind === 'text') writeTextFileAtomic(tempRoot, relativeFile, entry.contents)
    else writeBinaryFileAtomic(tempRoot, relativeFile, entry.contents)
  }
  const rootManifest = fileMap.get('manifest.json')
  writeTextFileAtomic(tempRoot, 'manifest.json', rootManifest.contents)
  const expectedFiles = new Set(fileMap.keys())
  if (typeof options.userSettingsRoot === 'string' && path.resolve(options.userSettingsRoot) === path.resolve(tempRoot)) {
    expectedFiles.add(USER_SETTINGS_FILE_PATH)
  }
  pruneStorageRoot(tempRoot, expectedFiles)
  if (typeof options.userSettingsRoot === 'string') {
    writeAppSettingsForState(options.userSettingsRoot, serializedState)
  }
}

function readNoteBodiesFromRoot(rootManifest) {
  return ensureArray(rootManifest?.noteBodies)
    .map((body) => {
      const bodyId = typeof body?.id === 'string' ? body.id : ''
      if (!bodyId) return null
      const aisles = ensureArray(body.aisles)
        .map((aisle) => {
          const aisleId = typeof aisle?.id === 'string' ? aisle.id : ''
          const aisleBodyId = typeof aisle?.aisleBodyId === 'string' ? aisle.aisleBodyId : ''
          const file = typeof aisle?.file === 'string' ? aisle.file : ''
          if (!aisleId || !file) return null
          return {
            id: aisleId,
            aisleBodyId: aisleBodyId || aisleId,
          }
        })
        .filter(Boolean)
      return {
        id: bodyId,
        createdAt: typeof body.createdAt === 'string' ? body.createdAt : undefined,
        updatedAt: typeof body.updatedAt === 'string' ? body.updatedAt : undefined,
        aisles,
      }
    })
    .filter(Boolean)
}

function getRegistryContentHash(record) {
  return typeof record?.contentHash === 'string' && record.contentHash ? record.contentHash : ''
}

function getFileMtimeMs(filePath) {
  try {
    return statSync(filePath).mtimeMs
  } catch {
    return 0
  }
}

function readMarkdownCandidate(rootPath, relativeFile, issues = null, bodyRecord = null) {
  const absolutePath = path.join(rootPath, relativeFile)
  const rawMarkdown = readTextFileIfExists(absolutePath, issues, {
    rootPath,
    missingCode: 'missing-markdown',
    readCode: 'unreadable-markdown',
    severity: 'warning',
    missingMessage: 'Markdown file is missing; this note was loaded as empty.',
    readMessage: 'Markdown file could not be read; this note was loaded as empty.',
  })
  if (rawMarkdown === null) return null
  const markdown = referenceMarkdownImages(rawMarkdown, absolutePath, issues, rootPath)
  const parsedMarkdown = splitMarkdownFrontmatterForStorage(markdown)
  const migrated = parsedMarkdown.frontmatterStatus === 'valid'
    ? migrateAisleTags({
        markdown: parsedMarkdown.markdown,
        frontmatter: parsedMarkdown.frontmatter,
        frontmatterMeta: isRecord(bodyRecord?.frontmatterMeta) ? bodyRecord.frontmatterMeta : undefined,
      })
    : {
        markdown: parsedMarkdown.markdown,
        frontmatter: parsedMarkdown.frontmatter,
        frontmatterMeta: isRecord(bodyRecord?.frontmatterMeta) ? bodyRecord.frontmatterMeta : undefined,
        tags: extractMarkdownTags(parsedMarkdown.markdown),
      }
  const normalizedContent = normalizeAisleStorageContentForHash({
    ...parsedMarkdown,
    markdown: migrated.markdown,
    frontmatter: migrated.frontmatter,
    frontmatterMeta: migrated.frontmatterMeta,
    tags: migrated.tags,
  })
  const content = {
    ...normalizedContent,
    tags: migrated.tags,
    frontmatterMeta: migrated.frontmatterMeta,
  }
  return {
    file: relativeFile,
    issuePath: path.posix.join(HYBRID_ROOT_DIR, relativeFile),
    mtimeMs: getFileMtimeMs(absolutePath),
    content,
    contentHash: createStorageContentHash(normalizedContent),
    parsedMarkdown,
  }
}

function getCandidateSortPath(candidate) {
  return candidate?.file ?? ''
}

function chooseNewestCandidate(candidates) {
  return [...candidates].sort((left, right) => {
    const mtimeDelta = right.mtimeMs - left.mtimeMs
    if (mtimeDelta !== 0) return mtimeDelta
    if (left.canonical !== right.canonical) return left.canonical ? -1 : 1
    return getCandidateSortPath(left).localeCompare(getCandidateSortPath(right))
  })[0] ?? null
}

function addAisleCandidateRef(candidateRefsByAisleBodyId, aisleBodyId, file, options = {}) {
  const bodyId = typeof aisleBodyId === 'string' ? aisleBodyId : ''
  const relativeFile = typeof file === 'string' ? file : ''
  if (!bodyId || !relativeFile) return
  const refs = candidateRefsByAisleBodyId.get(bodyId) ?? []
  refs.push({
    file: relativeFile,
    expectedHash: typeof options.expectedHash === 'string' ? options.expectedHash : '',
    canonical: Boolean(options.canonical),
    noteBodyId: typeof options.noteBodyId === 'string' ? options.noteBodyId : '',
    aisleId: typeof options.aisleId === 'string' ? options.aisleId : '',
    location: isRecord(options.location) ? options.location : null,
  })
  candidateRefsByAisleBodyId.set(bodyId, refs)
}

function getAisleBodyIdFromRecord(aisle) {
  return typeof aisle?.aisleBodyId === 'string' && aisle.aisleBodyId
    ? aisle.aisleBodyId
    : typeof aisle?.id === 'string'
      ? aisle.id
      : ''
}

function getExpandedVisibleAisleFile(ref, aisle, aisles) {
  const refFile = typeof ref?.file === 'string' ? ref.file : ''
  const aisleFile = typeof aisle?.file === 'string' ? aisle.file : ''
  if (!refFile || !aisleFile) return ''
  if (aisles.length <= 1) return refFile
  return path.posix.join(path.posix.dirname(refFile), path.posix.basename(aisleFile))
}

function buildAisleCandidateRefs(noteBodiesRoot, noteAisleBodiesRoot, visibleNoteFileRefs) {
  const candidateRefsByAisleBodyId = new Map()
  const aisleBodyRecordsById = new Map()
  ensureArray(noteAisleBodiesRoot?.noteAisleBodies).forEach((body) => {
    const bodyId = typeof body?.id === 'string' ? body.id : ''
    if (bodyId && !aisleBodyRecordsById.has(bodyId)) aisleBodyRecordsById.set(bodyId, body)
  })

  const noteBodyRecordsById = new Map()
  ensureArray(noteBodiesRoot?.noteBodies).forEach((body) => {
    const bodyId = typeof body?.id === 'string' ? body.id : ''
    if (!bodyId || noteBodyRecordsById.has(bodyId)) return
    noteBodyRecordsById.set(bodyId, body)
    ensureArray(body?.aisles).forEach((aisle) => {
      const aisleBodyId = getAisleBodyIdFromRecord(aisle)
      const file = typeof aisle?.file === 'string' ? aisle.file : ''
      const bodyRecord = aisleBodyRecordsById.get(aisleBodyId)
      addAisleCandidateRef(candidateRefsByAisleBodyId, aisleBodyId, file, {
        expectedHash: getRegistryContentHash(aisle) || getRegistryContentHash(bodyRecord),
        canonical: bodyRecord?.file === file,
        noteBodyId: bodyId,
        aisleId: typeof aisle?.id === 'string' ? aisle.id : '',
      })
    })
  })

  ensureArray(visibleNoteFileRefs).forEach((ref) => {
    const bodyId = typeof ref?.noteBodyId === 'string' ? ref.noteBodyId : ''
    const bodyRecord = noteBodyRecordsById.get(bodyId)
    const aisles = ensureArray(bodyRecord?.aisles)
    aisles.forEach((aisle) => {
      const aisleBodyId = getAisleBodyIdFromRecord(aisle)
      const file = getExpandedVisibleAisleFile(ref, aisle, aisles)
      const aisleBodyRecord = aisleBodyRecordsById.get(aisleBodyId)
      addAisleCandidateRef(candidateRefsByAisleBodyId, aisleBodyId, file, {
        expectedHash: getRegistryContentHash(aisle) || getRegistryContentHash(aisleBodyRecord),
        canonical: aisleBodyRecord?.file === file,
        noteBodyId: bodyId,
        aisleId: typeof aisle?.id === 'string' ? aisle.id : '',
        location: ref.location,
      })
    })
  })

  ensureArray(noteAisleBodiesRoot?.noteAisleBodies).forEach((body) => {
    const bodyId = typeof body?.id === 'string' ? body.id : ''
    const file = typeof body?.file === 'string' ? body.file : ''
    addAisleCandidateRef(candidateRefsByAisleBodyId, bodyId, file, {
      expectedHash: getRegistryContentHash(body),
      canonical: true,
    })
  })
  return candidateRefsByAisleBodyId
}

function dedupeAisleCandidateRefs(refs) {
  const byFile = new Map()
  refs.forEach((ref) => {
    if (!ref.file) return
    const existing = byFile.get(ref.file)
    if (!existing) {
      byFile.set(ref.file, ref)
      return
    }
    byFile.set(ref.file, {
      file: ref.file,
      expectedHash: existing.expectedHash || ref.expectedHash,
      canonical: existing.canonical || ref.canonical,
      noteBodyId: existing.noteBodyId || ref.noteBodyId,
      aisleId: existing.aisleId || ref.aisleId,
      location: existing.location || ref.location,
    })
  })
  return Array.from(byFile.values())
}

function reconcileAisleBodyCandidates(rootPath, aisleBodyId, bodyRecord, candidateRefs, issues = null) {
  const refs = dedupeAisleCandidateRefs(candidateRefs)
  const candidates = refs
    .map((ref) => {
      const candidate = readMarkdownCandidate(rootPath, ref.file, issues, bodyRecord)
      if (!candidate) return null
      const expectedHash = ref.expectedHash || getRegistryContentHash(bodyRecord)
      return {
        ...candidate,
        expectedHash,
        canonical: Boolean(ref.canonical),
        noteBodyId: ref.noteBodyId,
        aisleId: ref.aisleId,
        location: ref.location,
        changed: Boolean(expectedHash && candidate.contentHash !== expectedHash),
      }
    })
    .filter(Boolean)

  const fallback = candidates.find((candidate) => candidate.canonical) ?? candidates[0] ?? null
  if (!fallback) {
    return { content: normalizeAisleStorageContentForHash({ markdown: '' }), decouples: [], messages: [] }
  }

  if (!candidates.some((candidate) => candidate.expectedHash)) {
    return { content: fallback.content, decouples: [], messages: [] }
  }

  const changedCandidates = candidates.filter((candidate) => candidate.changed)
  if (changedCandidates.length === 0) {
    return { content: fallback.content, decouples: [], messages: [] }
  }

  const changedHashes = new Set(changedCandidates.map((candidate) => candidate.contentHash))
  if (changedHashes.size <= 1) {
    return { content: chooseNewestCandidate(changedCandidates)?.content ?? changedCandidates[0].content, decouples: [], messages: [] }
  }

  const winner = chooseNewestCandidate(changedCandidates) ?? changedCandidates[0]
  const decouples = changedCandidates
    .filter((candidate) => candidate.contentHash !== winner.contentHash)
    .map((candidate) => ({
      sourceAisleBodyId: aisleBodyId,
      sourceNoteBodyId: candidate.noteBodyId,
      sourceAisleId: candidate.aisleId,
      file: candidate.file,
      issuePath: candidate.issuePath,
      content: candidate.content,
      contentHash: candidate.contentHash,
      location: candidate.location,
      winnerPath: winner.issuePath,
      winnerHash: winner.contentHash,
    }))
  const decoupledPaths = decouples.map((candidate) => candidate.issuePath)
  addStorageIssueWithDetails(
    issues,
    LINKED_AISLE_MIRROR_AUTO_DECOUPLED_CODE,
    'warning',
    winner.issuePath,
    'Linked duplicate files were edited differently outside the app. The newest version stayed linked and other changed versions were de-coupled.',
    {
      aisleBodyId,
      anchorPath: winner.issuePath,
      decoupledPaths,
      candidateCount: changedCandidates.length,
      changedVersionCount: changedHashes.size,
    },
  )
  return {
    content: winner.content,
    decouples,
    messages: [{
      sourceAisleBodyId: aisleBodyId,
      anchorPath: winner.issuePath,
      anchorHash: winner.contentHash,
      anchorNoteBodyId: winner.noteBodyId,
      anchorLocation: winner.location,
      decoupledPaths,
      decoupledHashes: Array.from(new Set(decouples.map((candidate) => candidate.contentHash))).sort(),
    }],
  }
}

function readNoteAisleBodiesFromRoot(rootPath, noteAisleBodiesRoot, noteBodiesRoot, visibleNoteFileRefs, issues = null) {
  const aisleBodies = []
  const decouples = []
  const messages = []
  const seen = new Set()
  const candidateRefsByAisleBodyId = buildAisleCandidateRefs(noteBodiesRoot, noteAisleBodiesRoot, visibleNoteFileRefs)
  for (const body of ensureArray(noteAisleBodiesRoot?.noteAisleBodies)) {
    const bodyId = typeof body?.id === 'string' ? body.id : ''
    if (!bodyId || seen.has(bodyId)) continue
    seen.add(bodyId)
    const result = reconcileAisleBodyCandidates(
      rootPath,
      bodyId,
      body,
      candidateRefsByAisleBodyId.get(bodyId) ?? [],
      issues,
    )
    const content = result.content
    decouples.push(...result.decouples)
    messages.push(...result.messages)
    aisleBodies.push({
      id: bodyId,
      markdown: content.markdown,
      tags: content.tags,
      frontmatter: content.frontmatter,
      frontmatterStatus: content.frontmatterStatus,
      frontmatterParseError: content.frontmatterParseError,
      frontmatterRaw: content.frontmatterRaw,
      frontmatterMeta: isRecord(content.frontmatterMeta)
        ? content.frontmatterMeta
        : isRecord(body.frontmatterMeta)
          ? body.frontmatterMeta
          : undefined,
    })
  }
  return { aisleBodies, decouples, messages }
}

function createStorageGeneratedId(prefix, parts, usedIds) {
  const hash = createHash('sha256')
    .update(JSON.stringify(parts))
    .digest('hex')
    .slice(0, 16)
  const base = `${prefix}-${hash}`
  let candidate = base
  let suffix = 2
  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix}`
    suffix += 1
  }
  usedIds.add(candidate)
  return candidate
}

function getDecoupleLocationKey(decouple) {
  const location = decouple?.location
  if (!isRecord(location)) return ''
  const subTabId = typeof location.subTabId === 'string' ? location.subTabId : '__home__'
  return [location.domainId, location.spaceId, location.tabId, subTabId].join('::')
}

function countLiveNoteBodyLocations(domains) {
  const counts = new Map()
  ensureArray(domains).forEach((domain) => {
    ensureArray(domain?.spaces).forEach((space) => {
      ensureArray(space?.data?.tabs).forEach((tab) => {
        const noteBodyId = typeof tab?.noteBodyId === 'string' ? tab.noteBodyId : ''
        if (noteBodyId) counts.set(noteBodyId, (counts.get(noteBodyId) ?? 0) + 1)
        ensureArray(tab?.subTabs).forEach((subTab) => {
          const subTabNoteBodyId = typeof subTab?.noteBodyId === 'string' ? subTab.noteBodyId : ''
          if (subTabNoteBodyId) counts.set(subTabNoteBodyId, (counts.get(subTabNoteBodyId) ?? 0) + 1)
        })
      })
    })
  })
  return counts
}

function updateLiveNoteLocationBody(domains, location, noteBodyId) {
  if (!isRecord(location) || typeof noteBodyId !== 'string' || !noteBodyId) return domains
  return ensureArray(domains).map((domain) => {
    if (domain?.id !== location.domainId) return domain
    return {
      ...domain,
      spaces: ensureArray(domain.spaces).map((space) => {
        if (space?.id !== location.spaceId) return space
        return {
          ...space,
          data: {
            ...space.data,
            tabs: ensureArray(space?.data?.tabs).map((tab) => {
              if (tab?.id !== location.tabId) return tab
              if (location.subTabId === null) return { ...tab, noteBodyId }
              return {
                ...tab,
                subTabs: ensureArray(tab.subTabs).map((subTab) =>
                  subTab?.id === location.subTabId ? { ...subTab, noteBodyId } : subTab,
                ),
              }
            }),
          },
        }
      }),
    }
  })
}

function aisleContentToBodyRecord(id, content, sourceBody = null) {
  return {
    ...(isRecord(sourceBody) ? sourceBody : {}),
    id,
    markdown: typeof content?.markdown === 'string' ? content.markdown : '',
    tags: Array.isArray(content?.tags) ? content.tags : extractMarkdownTags(content?.markdown ?? ''),
    frontmatter: content?.frontmatter,
    frontmatterStatus: content?.frontmatterStatus,
    frontmatterParseError: content?.frontmatterParseError,
    frontmatterRaw: content?.frontmatterRaw,
    frontmatterMeta: isRecord(content?.frontmatterMeta) ? content.frontmatterMeta : sourceBody?.frontmatterMeta,
  }
}

function collectUsedContentIds(noteBodies, noteAisleBodies, messages) {
  const usedIds = new Set()
  ensureArray(noteBodies).forEach((body) => {
    if (typeof body?.id === 'string') usedIds.add(body.id)
    ensureArray(body?.aisles).forEach((aisle) => {
      if (typeof aisle?.id === 'string') usedIds.add(aisle.id)
      if (typeof aisle?.aisleBodyId === 'string') usedIds.add(aisle.aisleBodyId)
    })
  })
  ensureArray(noteAisleBodies).forEach((body) => {
    if (typeof body?.id === 'string') usedIds.add(body.id)
  })
  ensureArray(messages).forEach((message) => {
    if (typeof message?.id === 'string') usedIds.add(message.id)
  })
  return usedIds
}

function buildAutoDecoupleMessage(messagePlan, decouples, usedIds) {
  const decoupledPaths = Array.from(new Set(decouples.map((decouple) => decouple.issuePath).filter(Boolean))).sort()
  const signature = [
    'duplicate-auto-decoupled',
    messagePlan.sourceAisleBodyId,
    messagePlan.anchorHash,
    messagePlan.anchorPath,
    messagePlan.decoupledHashes.join('|'),
    decoupledPaths.join('|'),
  ].join('::')
  return {
    id: createStorageGeneratedId('message', [signature], usedIds),
    type: 'duplicate-auto-decoupled',
    status: 'unread',
    createdAt: new Date().toISOString(),
    signature,
    title: 'duplicate files de-coupled',
    body: `${decoupledPaths.length} changed duplicate ${decoupledPaths.length === 1 ? 'file was' : 'files were'} de-coupled because linked files had different outside edits.`,
    anchorPath: messagePlan.anchorPath,
    decoupledPaths,
    affectedLocations: [
      {
        label: 'stayed linked',
        path: messagePlan.anchorPath,
        noteBodyId: messagePlan.anchorNoteBodyId,
        aisleBodyId: messagePlan.sourceAisleBodyId,
        ...(isRecord(messagePlan.anchorLocation) ? { location: messagePlan.anchorLocation } : {}),
      },
      ...decouples.map((decouple) => ({
        label: 'de-coupled',
        path: decouple.issuePath,
        noteBodyId: decouple.sourceNoteBodyId,
        aisleBodyId: decouple.sourceAisleBodyId,
        ...(isRecord(decouple.location) ? { location: decouple.location } : {}),
      })),
    ],
  }
}

function applyLinkedMirrorDecouples({ domains, noteBodies, noteAisleBodies, existingMessages, decouples, messagePlans }) {
  if (decouples.length === 0) {
    return { domains, noteBodies, noteAisleBodies, messages: existingMessages }
  }

  let nextDomains = domains
  let nextNoteBodies = ensureArray(noteBodies).map((body) => ({ ...body, aisles: ensureArray(body?.aisles).map((aisle) => ({ ...aisle })) }))
  const nextAisleBodies = ensureArray(noteAisleBodies).map((body) => ({ ...body }))
  const messages = ensureArray(existingMessages).filter(isRecord).map((message) => ({ ...message }))
  const usedIds = collectUsedContentIds(nextNoteBodies, nextAisleBodies, messages)
  const noteBodyMap = new Map(nextNoteBodies.map((body) => [body.id, body]))
  const aisleBodyMap = new Map(nextAisleBodies.map((body) => [body.id, body]))
  const locationCounts = countLiveNoteBodyLocations(domains)
  const noteDecouplesByLocation = new Map()
  const aisleDecouples = []

  for (const decouple of decouples) {
    if (!decouple.sourceNoteBodyId || !decouple.sourceAisleId) continue
    const locationKey = getDecoupleLocationKey(decouple)
    if (locationKey && (locationCounts.get(decouple.sourceNoteBodyId) ?? 0) > 1) {
      const existing = noteDecouplesByLocation.get(locationKey) ?? {
        noteBodyId: decouple.sourceNoteBodyId,
        location: decouple.location,
        decouples: [],
      }
      existing.decouples.push(decouple)
      noteDecouplesByLocation.set(locationKey, existing)
      continue
    }
    aisleDecouples.push(decouple)
  }

  for (const entry of noteDecouplesByLocation.values()) {
    const originalBody = noteBodyMap.get(entry.noteBodyId)
    if (!originalBody || !isRecord(entry.location)) continue
    const decoupleByAisleId = new Map(entry.decouples.map((decouple) => [decouple.sourceAisleId, decouple]))
    const newBodyId = createStorageGeneratedId('note-body', [entry.noteBodyId, getDecoupleLocationKey(entry), entry.decouples.map((decouple) => decouple.contentHash).sort()], usedIds)
    const newAisles = ensureArray(originalBody.aisles).map((aisle) => {
      const originalAisleBodyId = getAisleBodyIdFromRecord(aisle)
      const decouple = decoupleByAisleId.get(aisle.id)
      const sourceBody = aisleBodyMap.get(originalAisleBodyId)
      const newAisleBodyId = createStorageGeneratedId('aisle-body', [newBodyId, aisle.id, decouple?.contentHash ?? originalAisleBodyId], usedIds)
      const newAisleId = createStorageGeneratedId('aisle', [newBodyId, aisle.id], usedIds)
      nextAisleBodies.push(aisleContentToBodyRecord(newAisleBodyId, decouple?.content ?? sourceBody, sourceBody))
      return { id: newAisleId, aisleBodyId: newAisleBodyId }
    })
    const newBody = {
      ...originalBody,
      id: newBodyId,
      aisles: newAisles,
    }
    nextNoteBodies.push(newBody)
    noteBodyMap.set(newBodyId, newBody)
    nextDomains = updateLiveNoteLocationBody(nextDomains, entry.location, newBodyId)
  }

  for (const decouple of aisleDecouples) {
    const originalBody = noteBodyMap.get(decouple.sourceNoteBodyId)
    if (!originalBody) continue
    const sourceBody = aisleBodyMap.get(decouple.sourceAisleBodyId)
    const newAisleBodyId = createStorageGeneratedId('aisle-body', [decouple.sourceNoteBodyId, decouple.sourceAisleId, decouple.contentHash, decouple.file], usedIds)
    const newAisleBody = aisleContentToBodyRecord(newAisleBodyId, decouple.content, sourceBody)
    nextAisleBodies.push(newAisleBody)
    aisleBodyMap.set(newAisleBodyId, newAisleBody)
    const nextBody = {
      ...originalBody,
      aisles: ensureArray(originalBody.aisles).map((aisle) =>
        aisle.id === decouple.sourceAisleId ? { ...aisle, aisleBodyId: newAisleBodyId } : aisle,
      ),
    }
    nextNoteBodies = nextNoteBodies.map((body) => (body.id === nextBody.id ? nextBody : body))
    noteBodyMap.set(nextBody.id, nextBody)
  }

  const existingSignatures = new Set(messages.map((message) => message.signature).filter(Boolean))
  for (const messagePlan of messagePlans) {
    const relatedDecouples = decouples.filter((decouple) => decouple.sourceAisleBodyId === messagePlan.sourceAisleBodyId)
    const message = buildAutoDecoupleMessage(messagePlan, relatedDecouples, usedIds)
    if (existingSignatures.has(message.signature)) continue
    messages.push(message)
    existingSignatures.add(message.signature)
  }

  return { domains: nextDomains, noteBodies: nextNoteBodies, noteAisleBodies: nextAisleBodies, messages }
}

function isRootSplitFileName(value) {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    !value.includes('/') &&
    !value.includes('\\') &&
    value !== '.' &&
    value !== '..'
  )
}

function getRootSplitFileName(rootManifest, key, required, issues = null) {
  const manifestIssuePath = path.posix.join(HYBRID_ROOT_DIR, 'manifest.json')
  const files = isRecord(rootManifest?.files) ? rootManifest.files : null
  if (!files) {
    if (required) {
      addStorageIssue(
        issues,
        'missing-root-split-files-map',
        'error',
        manifestIssuePath,
        'Root manifest is missing its schema file map.',
      )
    }
    return null
  }
  const configuredFile = files[key]
  if (configuredFile === undefined && !required) return ROOT_SPLIT_FILES[key]
  if (!isRootSplitFileName(configuredFile)) {
    addStorageIssue(
      issues,
      'invalid-root-split-file-entry',
      required ? 'error' : 'warning',
      manifestIssuePath,
      `Root manifest has an invalid file pointer for ${key}.`,
    )
    return required ? null : ROOT_SPLIT_FILES[key]
  }
  return configuredFile
}

function readRootSplitJsonFile(rootPath, rootManifest, key, required, issues = null) {
  const fileName = getRootSplitFileName(rootManifest, key, required, issues)
  if (!fileName) return required ? null : {}
  const filePath = path.join(rootPath, fileName)
  const parsed = readJsonFileIfExists(filePath, issues, {
    rootPath,
    ...(required
      ? {
          missingCode: 'missing-root-split-file',
          missingMessage: `Required root split file ${fileName} is missing.`,
          severity: 'error',
        }
      : {}),
    parseCode: 'corrupt-root-split-file',
    parseMessage: `Root split file ${fileName} is corrupt.`,
    severity: required ? 'error' : 'warning',
  })
  if (parsed === null) return required ? null : {}
  if (!isRecord(parsed)) {
    addStorageIssue(
      issues,
      'invalid-root-split-file',
      required ? 'error' : 'warning',
      formatStorageIssuePath(rootPath, filePath),
      `Root split file ${fileName} does not contain a JSON object.`,
    )
    return required ? null : {}
  }
  return parsed
}

function readAppSettingsJsonFile(filePath, issuePath, issues = null) {
  const parsed = readJsonFileIfExists(filePath, issues, {
    rootPath: path.dirname(path.dirname(filePath)),
    missingCode: 'missing-app-settings',
    missingMessage: `Portable app settings file ${issuePath} is missing. Default user settings were used.`,
    parseCode: 'corrupt-app-settings',
    parseMessage: `Portable app settings file ${issuePath} is corrupt. Default user settings were used.`,
    severity: 'warning',
  })
  if (parsed === null) return {}
  if (!isRecord(parsed) || Array.isArray(parsed)) {
    addStorageIssue(
      issues,
      'invalid-app-settings',
      'warning',
      issuePath,
      `Portable app settings file ${issuePath} does not contain a JSON object. Default user settings were used.`,
    )
    return {}
  }
  return parsed
}

function readAppSettingsForProfile(profileRootPath, issues = null) {
  const userSettingsPath = getUserSettingsFilePath(profileRootPath)
  return readAppSettingsJsonFile(userSettingsPath, USER_SETTINGS_FILE_PATH, issues)
}

function getUserSettingsRoot(profileRootPath, options = {}) {
  return typeof options.userSettingsRoot === 'string' ? options.userSettingsRoot : profileRootPath
}

function readCurrentRootParts(rootPath, rootManifest, issues = null, profileRootPath = path.dirname(rootPath), options = {}) {
  if (!isRecord(rootManifest?.files)) {
    addStorageIssue(
      issues,
      'missing-root-split-files-map',
      'error',
      path.posix.join(HYBRID_ROOT_DIR, 'manifest.json'),
      'Root manifest is missing its schema file map.',
    )
    return null
  }
  const splitFiles = {}
  const requiredKeys = ['workspaceIndex', 'navigationState', 'frontmatterSettings', 'deletedWorkspace', 'noteRegistry']
  for (const key of requiredKeys) {
    const file = readRootSplitJsonFile(rootPath, rootManifest, key, true, issues)
    if (!file) return null
    splitFiles[key] = file
  }
  splitFiles.appSettings =
    options.includeUserSettings === false
      ? {}
      : readAppSettingsForProfile(getUserSettingsRoot(profileRootPath, options), issues)
  splitFiles.editorState = readRootSplitJsonFile(rootPath, rootManifest, 'editorState', false, issues) ?? {}
  splitFiles.messages = readRootSplitJsonFile(rootPath, rootManifest, 'messages', false, issues) ?? {}
  const noteRegistry = splitFiles.noteRegistry

  return {
    syncedSettings: buildSyncedSettingsFromSplitFiles(splitFiles),
    noteBodiesRoot: {
      noteBodies: ensureArray(noteRegistry.noteBodies),
    },
    noteAisleBodiesRoot: {
      noteAisleBodies: ensureArray(noteRegistry.aisleBodies),
    },
    domainEntries: ensureArray(splitFiles.workspaceIndex?.domains),
    scratchpad: isRecord(splitFiles.workspaceIndex?.scratchpad) ? splitFiles.workspaceIndex.scratchpad : undefined,
    messages: ensureArray(splitFiles.messages?.messages).filter(isRecord),
    toastHistory: ensureArray(splitFiles.messages?.toastHistory).filter(isRecord),
    deletedDomains: ensureArray(splitFiles.deletedWorkspace?.deletedDomains).filter(isRecord),
    deletedSpaces: ensureArray(splitFiles.deletedWorkspace?.deletedSpaces).filter(isRecord),
    activeDomainId:
      typeof splitFiles.navigationState?.activeDomainId === 'string'
        ? splitFiles.navigationState.activeDomainId
        : DEFAULT_DOMAIN_ID,
    lastOpened: isRecord(splitFiles.navigationState?.lastOpened) ? splitFiles.navigationState.lastOpened : null,
  }
}

function readSpace(rootPath, spaceRootRelative, spaceEntry, issues = null, visibleNoteFileRefs = null, options = {}) {
  const spaceRoot = path.join(rootPath, spaceRootRelative)
  const spaceManifest = readJsonFileIfExists(path.join(spaceRoot, 'manifest.json'), issues, {
    rootPath,
    missingCode: 'missing-space-manifest',
    parseCode: 'corrupt-space-manifest',
    severity: 'warning',
    missingMessage: 'Space manifest is missing; this space was skipped.',
    parseMessage: 'Space manifest is corrupt; this space was skipped.',
  })
  if (!spaceManifest || typeof spaceManifest !== 'object') return null
  const spaceId = typeof spaceManifest.id === 'string' ? spaceManifest.id : spaceEntry.id
  collectVisibleNoteFileRefsFromSpaceManifest(spaceRootRelative, spaceManifest, visibleNoteFileRefs, {
    domainId: options.domainId,
    spaceId,
  })

  const tabs = ensureArray(spaceManifest.tabs)
    .map((tabRecord) => ({
      id: typeof tabRecord?.id === 'string' ? tabRecord.id : '',
      title: typeof tabRecord?.title === 'string' ? tabRecord.title : 'tab',
      noteBodyId: typeof tabRecord?.noteBodyId === 'string' ? tabRecord.noteBodyId : '',
      activeSubTabId: typeof tabRecord?.activeSubTabId === 'string' ? tabRecord.activeSubTabId : null,
      subTabs: ensureArray(tabRecord?.subTabs).map((subTabRecord) => ({
        id: typeof subTabRecord?.id === 'string' ? subTabRecord.id : '',
        title: typeof subTabRecord?.title === 'string' ? subTabRecord.title : 'tab',
        noteBodyId: typeof subTabRecord?.noteBodyId === 'string' ? subTabRecord.noteBodyId : '',
      })),
    }))
    .filter((tab) => tab.id)

  const { deletedTabs, deletedSubTabs } = readTrashData(
    spaceRoot,
    typeof spaceManifest.trashManifestFile === 'string' ? spaceManifest.trashManifestFile : null,
    issues,
    rootPath,
    {
      trashRootRelative: path.posix.join(spaceRootRelative, 'trash'),
      visibleNoteFileRefs,
    },
  )

  return {
    id: spaceId,
    name:
      typeof spaceManifest.title === 'string'
        ? spaceManifest.title
        : typeof spaceEntry.title === 'string'
          ? spaceEntry.title
          : 'Untitled Space',
    settings:
      spaceManifest.settings && typeof spaceManifest.settings === 'object'
        ? spaceManifest.settings
        : { autoRemoveDeletedDays: 7 },
    data: {
      activeTabId:
        typeof spaceManifest.activeTabId === 'string' && tabs.some((tab) => tab.id === spaceManifest.activeTabId)
          ? spaceManifest.activeTabId
          : tabs[0]?.id ?? '',
      tabs,
      deletedTabs,
      deletedSubTabs,
    },
  }
}

function readHybridAppStateFromRootManifest(rootPath, rootManifest, issues = null, profileRootPath = path.dirname(rootPath), options = {}) {
  const rootParts = readCurrentRootParts(rootPath, rootManifest, issues, profileRootPath, options)
  if (!rootParts) return null

  const noteBodies = readNoteBodiesFromRoot(rootParts.noteBodiesRoot)
  const visibleNoteFileRefs = []
  const domainEntries = rootParts.domainEntries
  if (domainEntries.length === 0) {
    addStorageIssue(issues, 'missing-domain-index', 'warning', path.posix.join(HYBRID_ROOT_DIR, 'manifest.json'), 'Root manifest has no domains; a blank notebook was created.')
  }

  const domains = []
  for (const domainEntry of domainEntries) {
    const domainId = typeof domainEntry?.id === 'string' ? domainEntry.id : ''
    const domainPath = typeof domainEntry?.path === 'string' ? domainEntry.path : ''
    if (!domainId || !domainPath) {
      addStorageIssue(issues, 'invalid-domain-entry', 'warning', path.posix.join(HYBRID_ROOT_DIR, 'manifest.json'), 'Invalid domain entry was skipped.')
      continue
    }
    const domainRootRelative = path.posix.join(DOMAINS_DIR, domainPath)
    const domainManifest = readJsonFileIfExists(path.join(rootPath, domainRootRelative, 'manifest.json'), issues, {
      rootPath,
      missingCode: 'missing-domain-manifest',
      parseCode: 'corrupt-domain-manifest',
      severity: 'warning',
      missingMessage: 'Domain manifest is missing; this domain was skipped.',
      parseMessage: 'Domain manifest is corrupt; this domain was skipped.',
    })
    if (!domainManifest || typeof domainManifest !== 'object') continue

    const spaceEntries = ensureArray(domainManifest.spaces)
    const spaces = []
    for (const spaceEntry of spaceEntries) {
      const spaceId = typeof spaceEntry?.id === 'string' ? spaceEntry.id : ''
      const spacePath = typeof spaceEntry?.path === 'string' ? spaceEntry.path : ''
      if (!spaceId || !spacePath) {
        addStorageIssue(
          issues,
          'invalid-space-entry',
          'warning',
          path.posix.join(HYBRID_ROOT_DIR, domainRootRelative, 'manifest.json'),
          'Invalid space entry was skipped.',
        )
        continue
      }
      const space = readSpace(rootPath, path.posix.join(domainRootRelative, spacePath), spaceEntry, issues, visibleNoteFileRefs, {
        domainId,
      })
      if (!space) continue
      spaces.push(space)
    }
    const lastOpened = rootParts.lastOpened
    const lastOpenedSpaceId =
      lastOpened &&
      lastOpened.domainId === domainId &&
      typeof lastOpened.spaceId === 'string'
        ? lastOpened.spaceId
        : null
    const activeSpaceId =
      (lastOpenedSpaceId && spaces.some((space) => space.id === lastOpenedSpaceId) && lastOpenedSpaceId) ||
      (typeof domainManifest.activeSpaceId === 'string' &&
        spaces.some((space) => space.id === domainManifest.activeSpaceId) &&
        domainManifest.activeSpaceId) ||
      spaces[0]?.id ||
      ''

    domains.push({
      id: typeof domainManifest.id === 'string' ? domainManifest.id : domainId,
      name:
        typeof domainManifest.title === 'string'
          ? domainManifest.title
          : typeof domainEntry.title === 'string'
            ? domainEntry.title
            : DEFAULT_DOMAIN_NAME,
      activeSpaceId: spaces.length > 0 ? activeSpaceId : '',
      spaces,
    })
  }
  const aisleReadResult = readNoteAisleBodiesFromRoot(
    rootPath,
    rootParts.noteAisleBodiesRoot,
    rootParts.noteBodiesRoot,
    visibleNoteFileRefs,
    issues,
  )
  const decoupledState = applyLinkedMirrorDecouples({
    domains,
    noteBodies,
    noteAisleBodies: aisleReadResult.aisleBodies,
    existingMessages: rootParts.messages,
    decouples: aisleReadResult.decouples,
    messagePlans: aisleReadResult.messages,
  })

  const lastOpened = rootParts.lastOpened
  const lastOpenedDomainId =
    lastOpened && typeof lastOpened.domainId === 'string'
      ? lastOpened.domainId
      : null
  const candidateActiveDomainId =
    (lastOpenedDomainId && decoupledState.domains.some((domain) => domain.id === lastOpenedDomainId) && lastOpenedDomainId) ||
    (decoupledState.domains.some((domain) => domain.id === rootParts.activeDomainId) && rootParts.activeDomainId) ||
    decoupledState.domains[0]?.id ||
    ''
  const theme = rootParts.syncedSettings?.theme === 'custom'
    ? 'custom1'
    : ['dark', 'light', 'dawn', 'custom1', 'custom2', 'custom3'].includes(rootParts.syncedSettings?.theme)
      ? rootParts.syncedSettings.theme
      : 'dawn'

  const reconciled = reconcileNotebookStorageState({
    theme,
    activeDomainId: candidateActiveDomainId,
    domains: decoupledState.domains,
    deletedDomains: rootParts.deletedDomains,
    deletedSpaces: rootParts.deletedSpaces,
    scratchpad: rootParts.scratchpad,
    messages: decoupledState.messages,
    toastHistory: rootParts.toastHistory,
    noteBodies: decoupledState.noteBodies,
    noteAisleBodies: decoupledState.noteAisleBodies,
    activeSpaceId: '',
    spaces: [],
    hotkeys: rootParts.syncedSettings?.hotkeys,
    frontmatter: rootParts.syncedSettings?.frontmatter,
    ui: rootParts.syncedSettings?.ui,
  })
  addNotebookReconciliationIssues(issues, reconciled.repairs)

  return JSON.stringify(pruneAppStateEditorLocations(reconciled.state))
}

function readHybridAppStateResultFromRoot(rootPath, profileRootPath = path.dirname(rootPath), options = {}) {
  const issues = []
  if (!existsSync(rootPath)) return { serializedState: null, schemaVersion: null, issues }

  const rawRootManifest = readJsonFileIfExists(path.join(rootPath, 'manifest.json'), issues, {
    rootPath,
    missingCode: 'missing-root-manifest',
    parseCode: 'corrupt-root-manifest',
    severity: 'error',
    missingMessage: 'Root manifest is missing.',
    parseMessage: 'Root manifest is corrupt.',
  })
  if (
    !isRecord(rawRootManifest) ||
    typeof rawRootManifest.schemaVersion !== 'number' ||
    !SUPPORTED_SCHEMA_VERSIONS.has(rawRootManifest.schemaVersion)
  ) {
    if (issues.length === 0) {
      addStorageIssue(
        issues,
        'unsupported-root-manifest',
        'error',
        path.posix.join(HYBRID_ROOT_DIR, 'manifest.json'),
        'Root manifest schema is unsupported.',
      )
    }
    return {
      serializedState: null,
      schemaVersion: typeof rawRootManifest?.schemaVersion === 'number' ? rawRootManifest.schemaVersion : null,
      issues,
    }
  }

  return {
    serializedState: readHybridAppStateFromRootManifest(rootPath, rawRootManifest, issues, profileRootPath, options),
    schemaVersion: rawRootManifest.schemaVersion,
    issues,
  }
}

function readHybridAppStateFromRoot(rootPath, profileRootPath = path.dirname(rootPath), options = {}) {
  return readHybridAppStateResultFromRoot(rootPath, profileRootPath, options).serializedState
}

export function loadAppState(profileRootPath, options = {}) {
  const result = loadAppStateResult(profileRootPath, options)
  return result.ok ? result.serializedState : null
}

export function loadAppStateResult(profileRootPath, options = {}) {
  const finalRoot = getHybridStorageRoot(profileRootPath)
  const finalExists = existsSync(finalRoot)
  const finalRootEntries = finalExists ? listDirectoryEntries(finalRoot) : []
  const conflicts = detectStorageConflicts(profileRootPath, finalRoot)

  if (conflicts.length > 0) {
    return withStorageHealth({
      ok: false,
      serializedState: null,
      source: 'hybrid',
      error: `Storage profile contains cloud conflict folders: ${conflicts.join(', ')}`,
      conflicts,
    }, conflicts.map((conflictPath) =>
      createStorageIssue(
        'cloud-conflict',
        'error',
        conflictPath,
        'Storage profile contains a cloud-provider conflict path.',
      ),
    ))
  }

  const hybridResult = readHybridAppStateResultFromRoot(finalRoot, profileRootPath, options)
  if (hybridResult.serializedState !== null) {
    return withStorageHealth({
      ok: true,
      serializedState: hybridResult.serializedState,
      source: 'hybrid',
      schemaVersion: hybridResult.schemaVersion,
    }, hybridResult.issues)
  }

  if (!finalExists || finalRootEntries.length === 0) return { ok: true, serializedState: null, source: 'empty' }

  if (finalExists) {
    const issues = hybridResult.issues.length > 0
      ? hybridResult.issues
      : [createStorageIssue('unreadable-profile', 'error', HYBRID_ROOT_DIR, 'Existing app state could not be loaded.')]
    return withStorageHealth({
      ok: false,
      serializedState: null,
      source: 'hybrid',
      error: 'Existing app state could not be loaded.',
      schemaVersion: hybridResult.schemaVersion,
    }, issues)
  }

  return {
    ok: false,
    serializedState: null,
    source: 'hybrid',
    error: 'Existing app state could not be loaded.',
  }
}

export function saveAppState(profileRootPath, serializedState, options = {}) {
  const finalRoot = getHybridStorageRoot(profileRootPath)
  const userSettingsRoot =
    typeof options.userSettingsRoot === 'string'
      ? options.userSettingsRoot
      : typeof options.userDataPath === 'string'
        ? options.userDataPath
        : profileRootPath

  if (options.replaceExisting === true) {
    removeStorageConflictPaths(profileRootPath, finalRoot)
    rmSync(finalRoot, { recursive: true, force: true })
  }

  measureSlowMainOperation('hybrid app-state write', () =>
    writeHybridStorage(finalRoot, serializedState, {
      assetSourceRoot: typeof options.assetSourceRoot === 'string' ? options.assetSourceRoot : finalRoot,
      userSettingsRoot,
    }),
  )
}

export function writeNotebookFolderExport(destinationRootPath, serializedState, options = {}) {
  if (typeof destinationRootPath !== 'string' || !destinationRootPath.trim()) {
    throw new Error('Destination folder is invalid.')
  }
  const profileRootPath = path.resolve(destinationRootPath)
  const finalRoot = getHybridStorageRoot(profileRootPath)
  if (existsSync(path.join(finalRoot, 'manifest.json'))) {
    throw new Error('Destination folder already contains a notebook.')
  }
  if (existsSync(finalRoot) && listDirectoryEntries(finalRoot).length > 0) {
    throw new Error('Destination notebook folder must be empty.')
  }
  const parsedState = JSON.parse(serializedState)
  const exportState = normalizeAppStateForExport(parsedState)
  writeHybridStorage(finalRoot, JSON.stringify(exportState), {
    assetSourceRoot: typeof options.assetSourceRoot === 'string' ? options.assetSourceRoot : null,
  })
  return {
    profileRootPath,
    notebookPath: finalRoot,
    notebookName: path.basename(finalRoot),
  }
}

function normalizeArchiveEntryName(entry) {
  const rawName = String(entry?.unsafeOriginalName ?? entry?.name ?? '')
  if (!rawName) {
    return {
      ok: false,
      issue: createStorageIssue('unsafe-archive-entry', 'error', undefined, 'Archive contains an empty file path.'),
    }
  }
  if (rawName.includes('\\') || /^[a-zA-Z]:/.test(rawName)) {
    return {
      ok: false,
      issue: createStorageIssue('unsafe-archive-entry', 'error', rawName, 'Archive contains an unsafe file path.'),
    }
  }
  const rawParts = rawName.split('/').filter(Boolean)
  const normalized = path.posix.normalize(rawName).replace(/\/+$/, '')
  const parts = normalized.split('/').filter(Boolean)
  if (
    path.posix.isAbsolute(rawName) ||
    normalized === '.' ||
    normalized.startsWith('../') ||
    rawParts.includes('..') ||
    parts.includes('..')
  ) {
    return {
      ok: false,
      issue: createStorageIssue('unsafe-archive-entry', 'error', rawName, 'Archive contains a path traversal entry.'),
    }
  }
  return { ok: true, name: normalized }
}

function getNotebookArchiveRootPrefix(entryNames) {
  const names = entryNames.filter((name) => name !== USER_SETTINGS_DIR && !name.startsWith(`${USER_SETTINGS_DIR}/`))
  if (names.includes('manifest.json')) return ''
  const topLevelNames = new Set(names.map((name) => name.split('/')[0]).filter(Boolean))
  if (topLevelNames.size !== 1) return null
  const [prefix] = Array.from(topLevelNames)
  return names.includes(path.posix.join(prefix, 'manifest.json')) ? prefix : null
}

function stripNotebookArchiveRootPrefix(entryName, rootPrefix) {
  if (!rootPrefix) return entryName
  if (entryName === rootPrefix) return ''
  return entryName.startsWith(`${rootPrefix}/`) ? entryName.slice(rootPrefix.length + 1) : null
}

function isPathInside(parent, child) {
  const parentPath = path.resolve(parent)
  const childPath = path.resolve(child)
  return childPath === parentPath || childPath.startsWith(`${parentPath}${path.sep}`)
}

function failedImportArchiveResult(error, issues = []) {
  return withStorageHealth({
    ok: false,
    serializedState: null,
    error,
  }, issues)
}

function listNotebookImportAssetPayloads(notesRootPath) {
  const assetsRoot = path.join(notesRootPath, 'assets')
  const assets = []

  function visit(directoryPath) {
    for (const entry of listDirectoryEntries(directoryPath)) {
      const absolutePath = path.join(directoryPath, entry.name)
      if (entry.isDirectory()) {
        visit(absolutePath)
        continue
      }
      if (!entry.isFile()) continue
      const relativePath = normalizeImageAssetPath(
        path.relative(notesRootPath, absolutePath).split(path.sep).join(path.posix.sep),
      )
      if (!relativePath.startsWith('assets/')) continue
      const bytes = readFileSync(absolutePath)
      const fileName = path.basename(absolutePath)
      assets.push({
        relativePath,
        bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        fileName,
        name: fileName,
        mimeType: getMimeTypeFromFilePath(absolutePath),
        extension: path.extname(fileName).slice(1).toLowerCase(),
      })
    }
  }

  visit(assetsRoot)
  return assets
}

export async function importNotebookZipArchive(archivePath) {
  if (typeof archivePath !== 'string' || !archivePath.trim()) {
    return failedImportArchiveResult('Invalid archive path.', [
      createStorageIssue('invalid-archive-path', 'error', undefined, 'Archive path is invalid.'),
    ])
  }

  let zip
  try {
    zip = await JSZip.loadAsync(readFileSync(archivePath))
  } catch {
    return failedImportArchiveResult('Archive is not a readable zip file.', [
      createStorageIssue('invalid-archive', 'error', archivePath, 'Archive is not a readable zip file.'),
    ])
  }

  const tempParent = mkdtempSync(path.join(os.tmpdir(), 'tabs-import-'))
  const writtenFiles = new Set()

  try {
    const normalizedEntries = []
    for (const entry of Object.values(zip.files)) {
      const normalized = normalizeArchiveEntryName(entry)
      if (!normalized.ok) {
        return failedImportArchiveResult(normalized.issue.message, [normalized.issue])
      }
      normalizedEntries.push({ entry, name: normalized.name })
    }

    const archiveRootPrefix = getNotebookArchiveRootPrefix(normalizedEntries.map((entry) => entry.name))
    if (archiveRootPrefix === null) {
      const issue = createStorageIssue(
        'missing-root-manifest',
        'error',
        'manifest.json',
        'Archive is missing manifest.json.',
      )
      return failedImportArchiveResult(issue.message, [issue])
    }

    for (const { entry, name } of normalizedEntries) {
      if (entry.dir) continue
      if (name === USER_SETTINGS_DIR || name.startsWith(`${USER_SETTINGS_DIR}/`)) continue
      const strippedName = stripNotebookArchiveRootPrefix(name, archiveRootPrefix)
      if (strippedName === null) {
        const issue = createStorageIssue('unexpected-archive-entry', 'error', name, 'Archive contains files outside the notebook folder.')
        return failedImportArchiveResult(issue.message, [issue])
      }
      if (!strippedName) {
        const issue = createStorageIssue('unsafe-archive-entry', 'error', name, 'Archive contains an invalid directory file.')
        return failedImportArchiveResult(issue.message, [issue])
      }
      if (writtenFiles.has(strippedName)) {
        const issue = createStorageIssue('duplicate-archive-entry', 'error', strippedName, 'Archive contains duplicate file entries.')
        return failedImportArchiveResult(issue.message, [issue])
      }
      writtenFiles.add(strippedName)
      const destination = path.join(tempParent, ...strippedName.split('/'))
      if (!isPathInside(tempParent, destination)) {
        const issue = createStorageIssue('unsafe-archive-entry', 'error', strippedName, 'Archive entry escapes the import directory.')
        return failedImportArchiveResult(issue.message, [issue])
      }
      mkdirSync(path.dirname(destination), { recursive: true })
      writeFileSync(destination, await entry.async('nodebuffer'))
    }

    const result = loadAppStateResult(tempParent, { includeUserSettings: false })
    if (!result.ok) {
      return failedImportArchiveResult(result.error ?? 'Imported archive could not be loaded.', result.issues ?? [])
    }
    return withStorageHealth({
      ok: true,
      serializedState: result.serializedState,
      schemaVersion: result.schemaVersion ?? null,
      assets: listNotebookImportAssetPayloads(getHybridStorageRoot(tempParent)),
    }, result.issues ?? [])
  } finally {
    rmSync(tempParent, { recursive: true, force: true })
  }
}
