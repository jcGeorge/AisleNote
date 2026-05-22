import { createHash } from 'node:crypto'
import {
  cpSync,
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
import {
  DEFAULT_AUTO_REMOVE_DAYS,
  DEFAULT_DOMAIN_ID,
  DEFAULT_DOMAIN_NAME,
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
} from '../src/storage/hybrid-storage-core.js'
import { buildStoragePathFileName, createStoragePathAllocator } from '../src/storage/storage-path-segments.js'
import {
  STORAGE_PROFILE_SETTINGS_FILE,
  extractSyncedGlobalSettings,
  extractSyncedProfileSettings,
  getSyncedProfileSettingsForLoad,
} from '../src/storage/settings-partition.js'
import {
  buildImageAssetUrl,
  MARKDOWN_LINK_PATTERN,
  normalizeImageAssetPath,
  parseImageAssetUrl,
} from '../src/markdown/image-asset-refs.js'
import { migrateStorageRootManifest } from './storage-migrations.mjs'

const LEGACY_APP_STATE_RELATIVE_PATH = path.join('data', 'notes', 'index.json')
export const HYBRID_ROOT_DIR = 'notes-data'
const SCHEMA_VERSION = 3
const DOMAINS_DIR = 'domains'
const STORAGE_RECOVERY_DIR = 'storage-recovery'
export const RECOVERY_SNAPSHOT_MAX_ACTIVE_DAYS = 30
export const RECOVERY_SNAPSHOT_MAX_PER_DAY = 2
export const STORAGE_SNAPSHOT_MODES = Object.freeze({
  FORCE: 'force',
  DEBOUNCED: 'debounced',
  SKIP: 'skip',
})
const IMAGE_METADATA_FRAGMENT_PREFIX = '#tabs-image='
const INTERNAL_INDENT_TOKEN = '\u2060\u2003\u2003'
const EDITOR_BLANK_LINE_PLACEHOLDER = '\u200b'
const EXPORT_TAB_SPACES = '    '

function createStorageIssue(code, severity, pathValue, message) {
  return {
    code,
    severity,
    ...(pathValue ? { path: pathValue } : {}),
    message,
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

function splitImageMetadataFromUrl(url) {
  const source = String(url ?? '')
  const index = source.indexOf(IMAGE_METADATA_FRAGMENT_PREFIX)
  if (index < 0) {
    return { imageUrl: source, metadataFragment: '' }
  }
  return {
    imageUrl: source.slice(0, index),
    metadataFragment: source.slice(index),
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
    noteBodies: ensureArray(appState?.noteBodies).map((body) => ({
      ...body,
      aisles: ensureArray(body?.aisles).map((aisle) => ({
        ...aisle,
        markdown: convertInternalTabsForExport(aisle?.markdown),
      })),
    })),
    spaces: ensureArray(appState?.spaces).map((space) => ({
      ...space,
      data: {
        ...space?.data,
        tabs: ensureArray(space?.data?.tabs).map((tab) => ({
          ...tab,
          homeContent: convertInternalTabsForExport(tab?.homeContent),
          subTabs: ensureArray(tab?.subTabs).map((subTab) => ({
            ...subTab,
            content: convertInternalTabsForExport(subTab?.content),
          })),
        })),
        deletedTabs: ensureArray(space?.data?.deletedTabs).map((entry) => ({
          ...entry,
          tab: {
            ...entry?.tab,
            homeContent: convertInternalTabsForExport(entry?.tab?.homeContent),
            subTabs: ensureArray(entry?.tab?.subTabs).map((subTab) => ({
              ...subTab,
              content: convertInternalTabsForExport(subTab?.content),
            })),
          },
        })),
        deletedSubTabs: ensureArray(space?.data?.deletedSubTabs).map((entry) => ({
          ...entry,
          subTab: {
            ...entry?.subTab,
            content: convertInternalTabsForExport(entry?.subTab?.content),
          },
        })),
      },
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

function buildTrashDataFromManifestItems(trashItems, trashRoot, issues = null, issueRootPath = null) {
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
        homeContent: typeof item.file === 'string' ? readMarkdownFile(trashRoot, item.file, issues, issueRootPath) : '',
        activeSubTabId: typeof item.activeSubTabId === 'string' ? item.activeSubTabId : null,
        subTabs: ensureArray(item.subTabs).map((subTabRecord) => ({
          id: typeof subTabRecord?.id === 'string' ? subTabRecord.id : '',
          title: typeof subTabRecord?.title === 'string' ? subTabRecord.title : 'tab',
          noteBodyId: typeof subTabRecord?.noteBodyId === 'string' ? subTabRecord.noteBodyId : '',
          content: typeof subTabRecord?.file === 'string' ? readMarkdownFile(trashRoot, subTabRecord.file, issues, issueRootPath) : '',
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
        content: typeof item.file === 'string' ? readMarkdownFile(trashRoot, item.file, issues, issueRootPath) : '',
      },
    }))
    .filter((entry) => entry.id && entry.parentTabId && entry.subTab.id)

  return { deletedTabs, deletedSubTabs }
}

function readTrashData(spaceRoot, trashManifestFile, issues = null, issueRootPath = null) {
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
  return buildTrashDataFromManifestItems(trashManifest.items, trashRoot, issues, issueRootPath)
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

function externalizeMarkdownImages(markdown, noteFileRelative, assetBank) {
  return String(markdown ?? '').replace(MARKDOWN_LINK_PATTERN, (fullMatch, imageBang, label, srcRaw) => {
    const src = String(srcRaw ?? '').trim()
    if (!src) return fullMatch
    const { imageUrl, metadataFragment } = splitImageMetadataFromUrl(src)

    let decoded = null
    let assetRelativePath = parseImageAssetUrl(imageUrl)

    if (assetRelativePath) {
      assetRelativePath = normalizeImageAssetPath(assetRelativePath)
      if (assetBank.existingRoot) {
        const existingAssetPath = path.join(assetBank.existingRoot, assetRelativePath)
        if (existsSync(existingAssetPath)) {
          assetBank.files.set(assetRelativePath, readFileSync(existingAssetPath))
        }
      }
    } else if (imageBang === '!' && imageUrl.startsWith('data:image/')) {
      decoded = decodeImageDataUrl(imageUrl)
    } else if (imageUrl.startsWith('file://')) {
      try {
        const absolutePath = fileURLToPath(imageUrl)
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
    return `${imageBang}[${label}](${nextSrc}${metadataFragment})`
  })
}

function referenceMarkdownImages(markdown, noteFilePath, issues = null, issueRootPath = null) {
  return String(markdown ?? '').replace(MARKDOWN_LINK_PATTERN, (fullMatch, imageBang, label, srcRaw) => {
    const src = String(srcRaw ?? '').trim()
    if (!src) return fullMatch
    const { imageUrl, metadataFragment } = splitImageMetadataFromUrl(src)
    if (parseImageAssetUrl(imageUrl)) return fullMatch
    if (imageBang === '!' && imageUrl.startsWith('data:image/')) {
      const decoded = decodeImageDataUrl(imageUrl)
      if (!decoded || !issueRootPath) return fullMatch
      const assetPath = addAssetToNotesRoot(issueRootPath, decoded.bytes, decoded.extension)
      return `${imageBang}[${label}](${buildImageAssetUrl(assetPath)}${metadataFragment})`
    }
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(imageUrl) && !imageUrl.startsWith('file://')) return fullMatch

    let absolutePath = null
    if (imageUrl.startsWith('file://')) {
      try {
        absolutePath = fileURLToPath(imageUrl)
      } catch {
        absolutePath = null
      }
    } else {
      absolutePath = path.resolve(path.dirname(noteFilePath), imageUrl)
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
      return `${imageBang}[${label}](${buildImageAssetUrl(rootRelativePath)}${metadataFragment})`
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

function getLegacyAppStatePath(profileRootPath) {
  return path.join(profileRootPath, LEGACY_APP_STATE_RELATIVE_PATH)
}

export function getHybridStorageRoot(profileRootPath) {
  return path.join(profileRootPath, HYBRID_ROOT_DIR)
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
  mkdirSync(path.dirname(absolutePath), { recursive: true })
  const tempPath = path.join(
    path.dirname(absolutePath),
    `.${path.basename(absolutePath)}.${process.pid}.${Date.now()}.tmp`,
  )
  writeFileSync(tempPath, contents)
  renameSync(tempPath, absolutePath)
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
    /^notes-data(?: \d+)?\.bak$/i.test(name) ||
    /^notes-data \d+$/i.test(name) ||
    /^(topics|domains|note-bodies|assets|trash|manifest)(?: \d+)$/i.test(name) ||
    /\.bak$/i.test(name)
  )
}

function detectStorageConflicts(profileRootPath, rootPath) {
  const conflicts = []
  for (const entry of listDirectoryEntries(profileRootPath)) {
    if (entry.name === HYBRID_ROOT_DIR) continue
    if (hasCloudConflictName(entry.name)) conflicts.push(entry.name)
  }
  for (const entry of listDirectoryEntries(rootPath)) {
    if (hasCloudConflictName(entry.name)) conflicts.push(path.posix.join(HYBRID_ROOT_DIR, entry.name))
  }
  return conflicts
}

function removeStorageConflictPaths(profileRootPath, rootPath) {
  for (const entry of listDirectoryEntries(profileRootPath)) {
    if (entry.name === HYBRID_ROOT_DIR) continue
    if (hasCloudConflictName(entry.name)) rmSync(path.join(profileRootPath, entry.name), { recursive: true, force: true })
  }
  for (const entry of listDirectoryEntries(rootPath)) {
    if (hasCloudConflictName(entry.name)) rmSync(path.join(rootPath, entry.name), { recursive: true, force: true })
  }
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

function createRecoverySnapshot(rootPath, userDataPath) {
  if (!existsSync(rootPath)) return null
  const recoveryParent = path.join(userDataPath, STORAGE_RECOVERY_DIR)
  mkdirSync(recoveryParent, { recursive: true })
  const snapshotPath = path.join(recoveryParent, `${HYBRID_ROOT_DIR}-${Date.now()}`)
  measureSlowMainOperation('storage recovery snapshot', () => {
    cpSync(rootPath, snapshotPath, { recursive: true, force: true })
  })
  return snapshotPath
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

function getRecoverySnapshotDayKey(snapshot) {
  const date = new Date(snapshot.createdAt || snapshot.modifiedAt || 0)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function pruneStorageRecoverySnapshots(
  userDataPath,
  {
    maxActiveDays = RECOVERY_SNAPSHOT_MAX_ACTIVE_DAYS,
    maxPerDay = RECOVERY_SNAPSHOT_MAX_PER_DAY,
  } = {},
) {
  const snapshots = listStorageRecoverySnapshots(userDataPath)
  if (snapshots.length === 0) return { removed: 0, kept: 0 }

  const snapshotsByDay = new Map()
  snapshots.forEach((snapshot) => {
    const dayKey = getRecoverySnapshotDayKey(snapshot)
    const daySnapshots = snapshotsByDay.get(dayKey) ?? []
    daySnapshots.push(snapshot)
    snapshotsByDay.set(dayKey, daySnapshots)
  })

  const keptPaths = new Set()
  const activeDayKeys = Array.from(snapshotsByDay.entries())
    .map(([dayKey, daySnapshots]) => ({
      dayKey,
      latestModifiedAt: Math.max(...daySnapshots.map((snapshot) => snapshot.modifiedAt)),
    }))
    .sort((left, right) => right.latestModifiedAt - left.latestModifiedAt)
    .slice(0, Math.max(0, maxActiveDays))
    .map((entry) => entry.dayKey)

  activeDayKeys.forEach((dayKey) => {
    const daySnapshots = [...(snapshotsByDay.get(dayKey) ?? [])].sort((left, right) => left.modifiedAt - right.modifiedAt)
    if (daySnapshots.length <= maxPerDay) {
      daySnapshots.forEach((snapshot) => keptPaths.add(path.resolve(snapshot.path)))
      return
    }

    const earliestSnapshot = daySnapshots[0]
    const latestSnapshot = daySnapshots[daySnapshots.length - 1]
    if (maxPerDay >= 1 && earliestSnapshot) keptPaths.add(path.resolve(earliestSnapshot.path))
    if (maxPerDay >= 2 && latestSnapshot) keptPaths.add(path.resolve(latestSnapshot.path))
  })

  let removed = 0
  snapshots.forEach((snapshot) => {
    if (keptPaths.has(path.resolve(snapshot.path))) return
    rmSync(snapshot.path, { recursive: true, force: true })
    removed += 1
  })

  return { removed, kept: keptPaths.size }
}

export function listStorageRecoverySnapshots(userDataPath) {
  const recoveryParent = path.join(userDataPath, STORAGE_RECOVERY_DIR)
  return listDirectoryEntries(recoveryParent)
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(`${HYBRID_ROOT_DIR}-`))
    .map((entry) => {
      const snapshotPath = path.join(recoveryParent, entry.name)
      const timestamp = Number(entry.name.slice(`${HYBRID_ROOT_DIR}-`.length))
      let modifiedAt = Number.isFinite(timestamp) ? timestamp : 0
      try {
        modifiedAt = Math.max(modifiedAt, Math.round(statSync(snapshotPath).mtimeMs))
      } catch {
        // Keep a stable best-effort timestamp for snapshots with unreadable metadata.
      }
      return {
        name: entry.name,
        path: snapshotPath,
        createdAt: Number.isFinite(timestamp) ? timestamp : modifiedAt,
        modifiedAt,
      }
    })
    .sort((left, right) => right.modifiedAt - left.modifiedAt)
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
    frontmatter: isRecord(body?.frontmatter) ? body.frontmatter : null,
    frontmatterTemplateId: typeof body?.frontmatterTemplateId === 'string' ? body.frontmatterTemplateId : undefined,
    frontmatterTemplateDerived:
      typeof body?.frontmatterTemplateDerived === 'boolean' ? body.frontmatterTemplateDerived : undefined,
    frontmatterTemplateFieldOrigins: isRecord(body?.frontmatterTemplateFieldOrigins)
      ? body.frontmatterTemplateFieldOrigins
      : undefined,
    frontmatterTemplateRemovedFieldIds: ensureArray(body?.frontmatterTemplateRemovedFieldIds).filter(
      (fieldId) => typeof fieldId === 'string' && fieldId.trim().length > 0,
    ),
    frontmatterComputedFields: isRecord(body?.frontmatterComputedFields) ? body.frontmatterComputedFields : undefined,
    frontmatterTemplateDetachedKeys: ensureArray(body?.frontmatterTemplateDetachedKeys).filter(
      (key) => typeof key === 'string' && key.trim().length > 0,
    ),
    aisles,
  }
}

function writeNoteBodyAtPath({
  fileMap,
  noteBodyMap,
  noteAisleBodyMap,
  noteBodyRecords,
  noteAisleBodyRecords,
  noteBodyId,
  fallbackMarkdown,
  noteRootRelative,
  assetBank,
}) {
  const posixPath = path.posix
  const body = typeof noteBodyId === 'string' && noteBodyId ? noteBodyMap.get(noteBodyId) : null
  const sourceAisles = ensureArray(body?.aisles)
  const homeFile = posixPath.join(noteRootRelative, 'home.md')

  if (body && noteBodyRecords.has(noteBodyId)) {
    const firstAisle = ensureArray(body.aisles)[0]
    const firstAisleBodyId =
      typeof firstAisle?.aisleBodyId === 'string' && firstAisle.aisleBodyId
        ? firstAisle.aisleBodyId
        : typeof firstAisle?.id === 'string'
          ? firstAisle.id
          : ''
    const sharedMarkdown = firstAisleBodyId ? noteAisleBodyMap.get(firstAisleBodyId)?.markdown : undefined
    const markdown =
      typeof sharedMarkdown === 'string'
        ? sharedMarkdown
        : typeof firstAisle?.markdown === 'string'
          ? firstAisle.markdown
          : fallbackMarkdown
    setStorageTextFile(fileMap, homeFile, externalizeMarkdownImages(markdown, homeFile, assetBank))
    return homeFile
  }

  if (!body || sourceAisles.length === 0) {
    setStorageTextFile(fileMap, homeFile, externalizeMarkdownImages(fallbackMarkdown, homeFile, assetBank))
    if (body && noteBodyId) {
      const aisleId = `${noteBodyId}-home`
      noteBodyRecords.set(noteBodyId, buildNoteBodyManifestRecord(body, [{ id: aisleId, aisleBodyId: aisleId, file: homeFile }]))
      if (!noteAisleBodyRecords.has(aisleId)) {
        noteAisleBodyRecords.set(aisleId, { id: aisleId, file: homeFile })
      }
    }
    return homeFile
  }

  const aisleRecords = []
  sourceAisles.forEach((aisle, index) => {
    const aisleId = typeof aisle?.id === 'string' && aisle.id ? aisle.id : `${noteBodyId}-aisle-${index + 1}`
    const aisleBodyId = typeof aisle?.aisleBodyId === 'string' && aisle.aisleBodyId ? aisle.aisleBodyId : aisleId
    const file =
      index === 0
        ? homeFile
        : posixPath.join(noteRootRelative, 'aisles', buildStoragePathFileName(`Aisle ${index + 1}`, aisleId, 'Aisle', '.md'))
    const sharedMarkdown = noteAisleBodyMap.get(aisleBodyId)?.markdown
    const markdown =
      typeof sharedMarkdown === 'string'
        ? sharedMarkdown
        : typeof aisle?.markdown === 'string'
          ? aisle.markdown
          : index === 0
            ? fallbackMarkdown
            : ''
    setStorageTextFile(fileMap, file, externalizeMarkdownImages(markdown, file, assetBank))
    aisleRecords.push({ id: aisleId, aisleBodyId, file })
    if (!noteAisleBodyRecords.has(aisleBodyId)) {
      noteAisleBodyRecords.set(aisleBodyId, { id: aisleBodyId, file })
    }
  })
  noteBodyRecords.set(noteBodyId, buildNoteBodyManifestRecord(body, aisleRecords))
  return homeFile
}

function buildRootManifestV2(appState, domainEntries, noteBodyEntries, noteAisleBodyEntries) {
  const activeDomain = getActiveDomainFromAppState(appState, getDomainsFromAppState(appState))
  const activeDomainId = activeDomain ? getDomainId(activeDomain) : DEFAULT_DOMAIN_ID

  return {
    schemaVersion: SCHEMA_VERSION,
    globalSettings: extractSyncedGlobalSettings(appState),
    domains: domainEntries,
    deletedDomains: ensureArray(appState.deletedDomains).filter(isRecord),
    deletedSpaces: ensureArray(appState.deletedSpaces).filter(isRecord),
    noteBodies: noteBodyEntries,
    noteAisleBodies: noteAisleBodyEntries,
    activeDomainId,
  }
}

function buildDomainManifestV2(domain, spaceEntries) {
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

function buildSpaceFilesV2({
  fileMap,
  spaceRoot,
  space,
  noteBodyMap,
  noteAisleBodyMap,
  noteBodyRecords,
  noteAisleBodyRecords,
  assetBank,
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
    const homeNoteFile = posixPath.relative(spaceRoot, posixPath.join(tabRoot, 'home.md'))
    writeNoteBodyAtPath({
      fileMap,
      noteBodyMap,
      noteAisleBodyMap,
      noteBodyRecords,
      noteAisleBodyRecords,
      noteBodyId: tab.noteBodyId,
      fallbackMarkdown: typeof tab.homeContent === 'string' ? tab.homeContent : '',
      noteRootRelative: tabRoot,
      assetBank,
    })

    const subTabPathForTitle = createStoragePathAllocator()
    const subTabs = ensureArray(tab.subTabs).map((subTab) => {
      const subTabId = typeof subTab?.id === 'string' ? subTab.id : ''
      const subTabSegment = subTabPathForTitle(typeof subTab?.title === 'string' ? subTab.title : 'tab', subTabId, 'tab')
      const subTabRoot = posixPath.join(tabRoot, subTabSegment)
      const file = posixPath.relative(spaceRoot, posixPath.join(subTabRoot, 'home.md'))
      writeNoteBodyAtPath({
        fileMap,
        noteBodyMap,
        noteAisleBodyMap,
        noteBodyRecords,
        noteAisleBodyRecords,
        noteBodyId: subTab.noteBodyId,
        fallbackMarkdown: typeof subTab.content === 'string' ? subTab.content : '',
        noteRootRelative: subTabRoot,
        assetBank,
      })
      return {
        id: subTabId,
        title: typeof subTab.title === 'string' ? subTab.title : 'tab',
        path: posixPath.relative(spaceRoot, subTabRoot),
        noteBodyId: typeof subTab.noteBodyId === 'string' ? subTab.noteBodyId : '',
        file,
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
    const homeNoteFile = posixPath.relative(trashRoot, posixPath.join(deletedRoot, 'home.md'))
    writeNoteBodyAtPath({
      fileMap,
      noteBodyMap,
      noteAisleBodyMap,
      noteBodyRecords,
      noteAisleBodyRecords,
      noteBodyId: deletedTab.noteBodyId,
      fallbackMarkdown: typeof deletedTab.homeContent === 'string' ? deletedTab.homeContent : '',
      noteRootRelative: deletedRoot,
      assetBank,
    })

    const deletedSubTabPathForTitle = createStoragePathAllocator()
    const subTabs = ensureArray(deletedTab.subTabs).map((subTab) => {
      const subTabId = typeof subTab?.id === 'string' ? subTab.id : ''
      const subTabSegment = deletedSubTabPathForTitle(typeof subTab?.title === 'string' ? subTab.title : 'tab', subTabId, 'tab')
      const subTabRoot = posixPath.join(deletedRoot, subTabSegment)
      const file = posixPath.relative(trashRoot, posixPath.join(subTabRoot, 'home.md'))
      writeNoteBodyAtPath({
        fileMap,
        noteBodyMap,
        noteAisleBodyMap,
        noteBodyRecords,
        noteAisleBodyRecords,
        noteBodyId: subTab.noteBodyId,
        fallbackMarkdown: typeof subTab.content === 'string' ? subTab.content : '',
        noteRootRelative: subTabRoot,
        assetBank,
      })
      return {
        id: subTabId,
        title: typeof subTab.title === 'string' ? subTab.title : 'tab',
        path: posixPath.relative(trashRoot, subTabRoot),
        noteBodyId: typeof subTab.noteBodyId === 'string' ? subTab.noteBodyId : '',
        file,
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

  for (const entry of deletedSubTabs) {
    const subTab = entry?.subTab ?? {}
    const entryId = typeof entry?.id === 'string' ? entry.id : ''
    const deletedSegment = trashPathForTitle(typeof subTab.title === 'string' ? subTab.title : 'deleted note', entryId, 'deleted note')
    const deletedRoot = posixPath.join(trashRoot, deletedSegment)
    const file = posixPath.relative(trashRoot, posixPath.join(deletedRoot, 'home.md'))
    writeNoteBodyAtPath({
      fileMap,
      noteBodyMap,
      noteAisleBodyMap,
      noteBodyRecords,
      noteAisleBodyRecords,
      noteBodyId: subTab.noteBodyId,
      fallbackMarkdown: typeof subTab.content === 'string' ? subTab.content : '',
      noteRootRelative: deletedRoot,
      assetBank,
    })
    trashItems.push({
      id: entryId,
      type: 'subtab',
      title: typeof subTab.title === 'string' ? subTab.title : 'deleted note',
      path: deletedSegment,
      noteBodyId: typeof subTab.noteBodyId === 'string' ? subTab.noteBodyId : '',
      file,
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
  const noteAisleBodies = ensureArray(parsedState.noteAisleBodies).filter(isRecord)
  const noteBodyMap = new Map(noteBodies.map((body) => [typeof body.id === 'string' ? body.id : '', body]))
  const noteAisleBodyMap = new Map(noteAisleBodies.map((body) => [typeof body.id === 'string' ? body.id : '', body]))
  const noteBodyRecords = new Map()
  const noteAisleBodyRecords = new Map()
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
      const spaceEntry = buildSpaceFilesV2({
        fileMap,
        spaceRoot,
        space,
        noteBodyMap,
        noteAisleBodyMap,
        noteBodyRecords,
        noteAisleBodyRecords,
        assetBank,
      })
      spaceEntries.push({ ...spaceEntry, path: spaceSegment })
    }

    setStorageJsonFile(fileMap, posixPath.join(domainRoot, 'manifest.json'), buildDomainManifestV2(domain, spaceEntries))
    domainEntries.push({
      id: domainId,
      title: getDomainTitle(domain),
      path: domainSegment,
    })
  }

  const orphanPathForId = createStoragePathAllocator()
  for (const body of noteBodies) {
    const bodyId = typeof body?.id === 'string' ? body.id : ''
    if (!bodyId || noteBodyRecords.has(bodyId)) continue
    const orphanSegment = orphanPathForId('Orphan Note Body', bodyId, 'orphan note body')
    writeNoteBodyAtPath({
      fileMap,
      noteBodyMap,
      noteAisleBodyMap,
      noteBodyRecords,
      noteAisleBodyRecords,
      noteBodyId: bodyId,
      fallbackMarkdown: '',
      noteRootRelative: posixPath.join('_internal', 'orphan-bodies', orphanSegment),
      assetBank,
    })
  }

  addAssetBankToStorageFileMap(fileMap, assetBank)
  const noteBodyEntries = noteBodies
    .map((body) => (typeof body?.id === 'string' ? noteBodyRecords.get(body.id) : null))
    .filter(Boolean)
  const noteAisleBodyEntries = Array.from(noteAisleBodyRecords.values())
  setStorageJsonFile(fileMap, STORAGE_PROFILE_SETTINGS_FILE, extractSyncedProfileSettings(parsedState))
  setStorageJsonFile(fileMap, 'manifest.json', buildRootManifestV2(parsedState, domainEntries, noteBodyEntries, noteAisleBodyEntries))

  mkdirSync(tempRoot, { recursive: true })
  for (const [relativeFile, entry] of fileMap.entries()) {
    if (relativeFile === 'manifest.json') continue
    if (entry.kind === 'text') writeTextFileAtomic(tempRoot, relativeFile, entry.contents)
    else writeBinaryFileAtomic(tempRoot, relativeFile, entry.contents)
  }
  const rootManifest = fileMap.get('manifest.json')
  writeTextFileAtomic(tempRoot, 'manifest.json', rootManifest.contents)
  pruneStorageRoot(tempRoot, fileMap.keys())
}

function readNoteBodiesFromRoot(rootPath, rootManifest, issues = null) {
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
            markdown: readMarkdownFile(rootPath, file, issues, rootPath),
          }
        })
        .filter(Boolean)
      return {
        id: bodyId,
        createdAt: typeof body.createdAt === 'string' ? body.createdAt : undefined,
        updatedAt: typeof body.updatedAt === 'string' ? body.updatedAt : undefined,
        frontmatter: isRecord(body.frontmatter) ? body.frontmatter : null,
        frontmatterTemplateId: typeof body.frontmatterTemplateId === 'string' ? body.frontmatterTemplateId : undefined,
        frontmatterTemplateDerived:
          typeof body.frontmatterTemplateDerived === 'boolean' ? body.frontmatterTemplateDerived : undefined,
        frontmatterTemplateFieldOrigins: isRecord(body.frontmatterTemplateFieldOrigins)
          ? body.frontmatterTemplateFieldOrigins
          : undefined,
        frontmatterTemplateRemovedFieldIds: ensureArray(body.frontmatterTemplateRemovedFieldIds).filter(
          (fieldId) => typeof fieldId === 'string' && fieldId.trim().length > 0,
        ),
        frontmatterComputedFields: isRecord(body.frontmatterComputedFields)
          ? body.frontmatterComputedFields
          : undefined,
        frontmatterTemplateDetachedKeys: ensureArray(body.frontmatterTemplateDetachedKeys).filter(
          (key) => typeof key === 'string' && key.trim().length > 0,
        ),
        aisles,
      }
    })
    .filter(Boolean)
}

function readNoteAisleBodiesFromRoot(rootPath, rootManifest, issues = null) {
  const aisleBodies = []
  const seen = new Set()
  for (const body of ensureArray(rootManifest?.noteAisleBodies)) {
    const bodyId = typeof body?.id === 'string' ? body.id : ''
    const file = typeof body?.file === 'string' ? body.file : ''
    if (!bodyId || !file || seen.has(bodyId)) continue
    seen.add(bodyId)
    aisleBodies.push({
      id: bodyId,
      markdown: readMarkdownFile(rootPath, file, issues, rootPath),
    })
  }
  return aisleBodies
}

function addDirectoryToZip(zip, directoryPath, zipPrefix) {
  const entries = readdirSync(directoryPath, { withFileTypes: true })
  for (const entry of entries) {
    const absolutePath = path.join(directoryPath, entry.name)
    const relativePath = zipPrefix ? path.posix.join(zipPrefix, entry.name) : entry.name
    if (entry.isDirectory()) {
      addDirectoryToZip(zip, absolutePath, relativePath)
      continue
    }
    zip.file(relativePath, readFileSync(absolutePath))
  }
}

function readV2Space(rootPath, spaceRootRelative, spaceEntry, issues = null) {
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

  const tabs = ensureArray(spaceManifest.tabs)
    .map((tabRecord) => ({
      id: typeof tabRecord?.id === 'string' ? tabRecord.id : '',
      title: typeof tabRecord?.title === 'string' ? tabRecord.title : 'tab',
      noteBodyId: typeof tabRecord?.noteBodyId === 'string' ? tabRecord.noteBodyId : '',
      homeContent:
        typeof tabRecord?.homeNoteFile === 'string' ? readMarkdownFile(spaceRoot, tabRecord.homeNoteFile, issues, rootPath) : '',
      activeSubTabId: typeof tabRecord?.activeSubTabId === 'string' ? tabRecord.activeSubTabId : null,
      subTabs: ensureArray(tabRecord?.subTabs).map((subTabRecord) => ({
        id: typeof subTabRecord?.id === 'string' ? subTabRecord.id : '',
        title: typeof subTabRecord?.title === 'string' ? subTabRecord.title : 'tab',
        noteBodyId: typeof subTabRecord?.noteBodyId === 'string' ? subTabRecord.noteBodyId : '',
        content: typeof subTabRecord?.file === 'string' ? readMarkdownFile(spaceRoot, subTabRecord.file, issues, rootPath) : '',
      })),
    }))
    .filter((tab) => tab.id)

  const { deletedTabs, deletedSubTabs } = readTrashData(
    spaceRoot,
    typeof spaceManifest.trashManifestFile === 'string' ? spaceManifest.trashManifestFile : null,
    issues,
    rootPath,
  )

  return {
    id: typeof spaceManifest.id === 'string' ? spaceManifest.id : spaceEntry.id,
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

function readV2HybridAppStateFromRoot(rootPath, rootManifest, issues = null) {
  const profileSettings = readJsonFileIfExists(path.join(rootPath, STORAGE_PROFILE_SETTINGS_FILE), issues, {
    rootPath,
    parseCode: 'corrupt-profile-settings',
    severity: 'warning',
    parseMessage: 'Profile settings are corrupt; using root manifest settings.',
  })
  const syncedSettings = getSyncedProfileSettingsForLoad(rootManifest, profileSettings)
  const noteBodies = readNoteBodiesFromRoot(rootPath, rootManifest, issues)
  const noteAisleBodies = readNoteAisleBodiesFromRoot(rootPath, rootManifest, issues)
  const domainEntries = ensureArray(rootManifest.domains)
  if (domainEntries.length === 0) {
    addStorageIssue(issues, 'missing-domain-index', 'error', path.posix.join(HYBRID_ROOT_DIR, 'manifest.json'), 'Root manifest has no domains.')
    return null
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
      const space = readV2Space(rootPath, path.posix.join(domainRootRelative, spacePath), spaceEntry, issues)
      if (!space) continue
      spaces.push(space)
    }
    if (spaces.length === 0) {
      addStorageIssue(
        issues,
        'domain-has-no-readable-spaces',
        'warning',
        path.posix.join(HYBRID_ROOT_DIR, domainRootRelative, 'manifest.json'),
        'Domain has no readable spaces and was skipped.',
      )
      continue
    }

    const lastOpened = isRecord(rootManifest.lastOpened) ? rootManifest.lastOpened : null
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
      spaces[0].id

    domains.push({
      id: typeof domainManifest.id === 'string' ? domainManifest.id : domainId,
      name:
        typeof domainManifest.title === 'string'
          ? domainManifest.title
          : typeof domainEntry.title === 'string'
            ? domainEntry.title
            : DEFAULT_DOMAIN_NAME,
      activeSpaceId,
      spaces,
    })
  }

  if (domains.length === 0) {
    addStorageIssue(issues, 'no-readable-domains', 'error', path.posix.join(HYBRID_ROOT_DIR, 'manifest.json'), 'No readable domains were found.')
    return null
  }

  const lastOpened = isRecord(rootManifest.lastOpened) ? rootManifest.lastOpened : null
  const lastOpenedDomainId =
    lastOpened && typeof lastOpened.domainId === 'string'
      ? lastOpened.domainId
      : null
  const activeDomainId =
    (lastOpenedDomainId && domains.some((domain) => domain.id === lastOpenedDomainId) && lastOpenedDomainId) ||
    (typeof rootManifest.activeDomainId === 'string' &&
      domains.some((domain) => domain.id === rootManifest.activeDomainId) &&
      rootManifest.activeDomainId) ||
    domains[0].id
  const activeDomain = domains.find((domain) => domain.id === activeDomainId) ?? domains[0]
  const theme = ['dark', 'light', 'dawn', 'blues', 'custom'].includes(syncedSettings?.theme)
    ? syncedSettings.theme
    : 'dawn'

  return JSON.stringify({
    theme,
    activeDomainId,
    domains,
    deletedDomains: ensureArray(rootManifest?.deletedDomains).filter(isRecord),
    deletedSpaces: ensureArray(rootManifest?.deletedSpaces).filter(isRecord),
    noteBodies,
    noteAisleBodies,
    activeSpaceId: activeDomain.activeSpaceId,
    spaces: activeDomain.spaces,
    hotkeys: syncedSettings?.hotkeys,
    frontmatter: syncedSettings?.frontmatter,
    ui: syncedSettings?.ui,
  })
}

function readHybridAppStateResultFromRoot(rootPath) {
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
  const rootManifestMigration = migrateStorageRootManifest(rawRootManifest, SCHEMA_VERSION)
  if (!rootManifestMigration.ok) {
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
  const rootManifest = rootManifestMigration.manifest
  if (rootManifest.schemaVersion === SCHEMA_VERSION) {
    return {
      serializedState: readV2HybridAppStateFromRoot(rootPath, rootManifest, issues),
      schemaVersion: rootManifest.schemaVersion,
      issues,
    }
  }
  addStorageIssue(
    issues,
    'unsupported-root-manifest',
    'error',
    path.posix.join(HYBRID_ROOT_DIR, 'manifest.json'),
    'Root manifest schema is unsupported.',
  )
  return { serializedState: null, schemaVersion: rootManifest.schemaVersion, issues }
}

function readHybridAppStateFromRoot(rootPath) {
  return readHybridAppStateResultFromRoot(rootPath).serializedState
}

export function loadAppState(profileRootPath) {
  const result = loadAppStateResult(profileRootPath)
  return result.ok ? result.serializedState : null
}

export function loadAppStateResult(profileRootPath) {
  const finalRoot = getHybridStorageRoot(profileRootPath)
  const legacyPath = getLegacyAppStatePath(profileRootPath)
  const finalExists = existsSync(finalRoot)
  const legacyExists = existsSync(legacyPath)
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

  const hybridResult = readHybridAppStateResultFromRoot(finalRoot)
  if (hybridResult.serializedState !== null) {
    return withStorageHealth({
      ok: true,
      serializedState: hybridResult.serializedState,
      source: 'hybrid',
      schemaVersion: hybridResult.schemaVersion,
    }, hybridResult.issues)
  }

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

  const legacyState = readTextFileIfExists(legacyPath)
  if (legacyState !== null) {
    return { ok: true, serializedState: legacyState, source: 'legacy' }
  }

  if (!legacyExists) {
    return { ok: true, serializedState: null, source: 'empty' }
  }

  return {
    ok: false,
    serializedState: null,
    source: finalExists ? 'hybrid' : 'legacy',
    error: 'Existing app state could not be loaded.',
  }
}

export function saveAppState(profileRootPath, serializedState, options = {}) {
  const finalRoot = getHybridStorageRoot(profileRootPath)
  const recoveryRoot = typeof options.userDataPath === 'string' ? options.userDataPath : profileRootPath
  const snapshotMode = Object.values(STORAGE_SNAPSHOT_MODES).includes(options.snapshotMode)
    ? options.snapshotMode
    : STORAGE_SNAPSHOT_MODES.FORCE

  if (options.replaceExisting === true) {
    removeStorageConflictPaths(profileRootPath, finalRoot)
    rmSync(finalRoot, { recursive: true, force: true })
  } else if (snapshotMode === STORAGE_SNAPSHOT_MODES.FORCE) {
    createRecoverySnapshot(finalRoot, recoveryRoot)
    pruneStorageRecoverySnapshots(recoveryRoot)
  }

  measureSlowMainOperation('hybrid app-state write', () =>
    writeHybridStorage(finalRoot, serializedState, {
      assetSourceRoot: typeof options.assetSourceRoot === 'string' ? options.assetSourceRoot : finalRoot,
    }),
  )

  if (options.replaceExisting !== true && snapshotMode === STORAGE_SNAPSHOT_MODES.DEBOUNCED) {
    createRecoverySnapshot(finalRoot, recoveryRoot)
    pruneStorageRecoverySnapshots(recoveryRoot)
  }
}

export function restoreStorageRecoverySnapshot(profileRootPath, userDataPath, snapshotPath = null) {
  const snapshots = listStorageRecoverySnapshots(userDataPath)
  const selectedSnapshot = snapshotPath
    ? snapshots.find((snapshot) => path.resolve(snapshot.path) === path.resolve(snapshotPath))
    : snapshots[0]

  if (!selectedSnapshot) {
    return { ok: false, error: 'No recovery snapshot is available.' }
  }

  const snapshotResult = readHybridAppStateResultFromRoot(selectedSnapshot.path)
  if (snapshotResult.serializedState === null) {
    return { ok: false, error: 'Recovery snapshot could not be loaded.', snapshot: selectedSnapshot }
  }

  const finalRoot = getHybridStorageRoot(profileRootPath)
  createRecoverySnapshot(finalRoot, userDataPath)
  rmSync(finalRoot, { recursive: true, force: true })
  cpSync(selectedSnapshot.path, finalRoot, { recursive: true, force: true })
  pruneStorageRecoverySnapshots(userDataPath)
  return { ok: true, snapshot: selectedSnapshot, loadResult: loadAppStateResult(profileRootPath) }
}

export function createPreWriteStorageSnapshot(finalRoot, backupRoot) {
  if (!existsSync(finalRoot)) return false
  rmSync(backupRoot, { recursive: true, force: true })
  renameSync(finalRoot, backupRoot)
  return true
}

export async function buildAppStateExportArchive(serializedState, options = {}) {
  const tempParent = mkdtempSync(path.join(os.tmpdir(), 'tabs-export-'))
  const exportRoot = path.join(tempParent, HYBRID_ROOT_DIR)

  try {
    const parsedState = JSON.parse(serializedState)
    const exportState = normalizeAppStateForExport(parsedState)
    writeHybridStorage(exportRoot, JSON.stringify(exportState), {
      assetSourceRoot: typeof options.assetSourceRoot === 'string' ? options.assetSourceRoot : null,
    })
    const zip = new JSZip()
    addDirectoryToZip(zip, exportRoot, HYBRID_ROOT_DIR)
    return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  } finally {
    rmSync(tempParent, { recursive: true, force: true })
  }
}
