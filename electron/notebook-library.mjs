import { createHash, randomUUID } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import {
  getHybridStorageRoot,
  loadAppStateResult,
  saveAppState,
} from './app-state-storage.mjs'
import {
  getDefaultStorageProfileRoot,
  getStorageProfileNotebookName,
  STORAGE_PROFILE_CONFIG_FILE,
} from './storage-profile.mjs'

export const NOTEBOOK_LIBRARY_CONFIG_FILE = 'notebook-library.json'
export const NOTEBOOK_MIRRORS_DIR = 'notebooks'

function nowIso() {
  return new Date().toISOString()
}

function readJsonFile(filePath) {
  try {
    if (!existsSync(filePath)) return null
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function writeJsonFile(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function normalizePath(value) {
  return typeof value === 'string' && value.trim() ? path.resolve(value) : null
}

function uniquePaths(paths) {
  const seen = new Set()
  const normalized = []
  paths.forEach((candidate) => {
    const normalizedPath = normalizePath(candidate)
    if (!normalizedPath || seen.has(normalizedPath)) return
    seen.add(normalizedPath)
    normalized.push(normalizedPath)
  })
  return normalized
}

function isPathInside(parentPath, candidatePath) {
  const parent = path.resolve(parentPath)
  const candidate = path.resolve(candidatePath)
  const relative = path.relative(parent, candidate)
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
}

function getNotebookLibraryConfigPath(userDataPath) {
  return path.join(userDataPath, NOTEBOOK_LIBRARY_CONFIG_FILE)
}

export function getNotebookMirrorRoot(userDataPath, notebookId) {
  return path.join(userDataPath, NOTEBOOK_MIRRORS_DIR, notebookId)
}

export function readNotebookRootManifest(notebookRootPath) {
  return readJsonFile(path.join(getHybridStorageRoot(notebookRootPath), 'manifest.json'))
}

function createNotebookId() {
  return `notebook-${randomUUID()}`
}

function readLegacyStorageProfileConfig(userDataPath) {
  const config = readJsonFile(path.join(userDataPath, STORAGE_PROFILE_CONFIG_FILE))
  return {
    profileRootPath: normalizePath(config?.profileRootPath),
    knownNotebookPaths: uniquePaths(Array.isArray(config?.knownNotebooks) ? config.knownNotebooks : []),
  }
}

function createSyncMetadata(event, extra = {}) {
  return {
    version: 1,
    event,
    updatedAt: nowIso(),
    ...extra,
  }
}

export function ensureNotebookFolderIdentity(userDataPath, notebookRootPath, requestedNotebookId = null) {
  const rootPath = path.resolve(notebookRootPath)
  const manifest = readNotebookRootManifest(rootPath)
  const existingNotebookId = typeof manifest?.notebookId === 'string' && manifest.notebookId.trim()
    ? manifest.notebookId.trim()
    : ''
  if (existingNotebookId) {
    return { ok: true, notebookId: existingNotebookId, upgraded: false }
  }

  const notebookId = typeof requestedNotebookId === 'string' && requestedNotebookId.trim()
    ? requestedNotebookId.trim()
    : createNotebookId()
  const loadResult = loadAppStateResult(rootPath, { userSettingsRoot: userDataPath })
  if (!loadResult.ok || typeof loadResult.serializedState !== 'string') {
    return {
      ok: false,
      error: loadResult.error ?? 'Notebook folder could not be loaded.',
    }
  }

  saveAppState(rootPath, loadResult.serializedState, {
    userDataPath,
    userSettingsRoot: userDataPath,
    notebookId,
    assetSourceRoot: rootPath,
    syncMetadata: createSyncMetadata('schema-upgraded'),
  })
  return { ok: true, notebookId, upgraded: true }
}

function normalizeNotebookRecord(userDataPath, record) {
  const id = typeof record?.id === 'string' && record.id.trim() ? record.id.trim() : ''
  const localMirrorPath = normalizePath(record?.localMirrorPath)
  if (!id || !localMirrorPath) return null
  const syncTargetPath = normalizePath(record?.syncTargetPath)
  return {
    id,
    name: typeof record?.name === 'string' && record.name.trim()
      ? record.name.trim()
      : getStorageProfileNotebookName(syncTargetPath ?? localMirrorPath),
    localMirrorPath,
    ...(syncTargetPath ? { syncTargetPath } : {}),
    createdAt: typeof record?.createdAt === 'string' ? record.createdAt : nowIso(),
    updatedAt: typeof record?.updatedAt === 'string' ? record.updatedAt : nowIso(),
    syncStatus: typeof record?.syncStatus === 'string' ? record.syncStatus : (syncTargetPath ? 'synced' : 'local-only'),
    syncPending: Boolean(record?.syncPending),
    syncFiles: normalizeNotebookSyncFiles(record?.syncFiles),
    lastSyncedAt: typeof record?.lastSyncedAt === 'string' ? record.lastSyncedAt : undefined,
    lastSyncError: typeof record?.lastSyncError === 'string' ? record.lastSyncError : undefined,
    isLocalOnlyMigration:
      record?.isLocalOnlyMigration === true ||
      localMirrorPath === getDefaultStorageProfileRoot(userDataPath),
  }
}

function normalizeNotebookLibrary(userDataPath, rawLibrary) {
  const records = Array.isArray(rawLibrary?.notebooks)
    ? rawLibrary.notebooks.map((record) => normalizeNotebookRecord(userDataPath, record)).filter(Boolean)
    : []
  const seen = new Set()
  const notebooks = records.filter((record) => {
    if (seen.has(record.id)) return false
    seen.add(record.id)
    return true
  })
  const activeNotebookId =
    typeof rawLibrary?.activeNotebookId === 'string' &&
    notebooks.some((record) => record.id === rawLibrary.activeNotebookId)
      ? rawLibrary.activeNotebookId
      : notebooks[0]?.id ?? null
  return {
    version: 1,
    activeNotebookId,
    notebooks,
  }
}

export function readNotebookLibrary(userDataPath) {
  const rawLibrary = readJsonFile(getNotebookLibraryConfigPath(userDataPath))
  return rawLibrary ? normalizeNotebookLibrary(userDataPath, rawLibrary) : null
}

export function writeNotebookLibrary(userDataPath, library) {
  const normalized = normalizeNotebookLibrary(userDataPath, library)
  writeJsonFile(getNotebookLibraryConfigPath(userDataPath), normalized)
  return normalized
}

function buildNotebookRecordFromFolder(userDataPath, notebookRootPath, options = {}) {
  const rootPath = path.resolve(notebookRootPath)
  const loadResult = loadAppStateResult(rootPath, { userSettingsRoot: userDataPath })
  if (!loadResult.ok || typeof loadResult.serializedState !== 'string') return null

  const identity = ensureNotebookFolderIdentity(userDataPath, rootPath)
  if (!identity.ok) return null
  const notebookId = identity.notebookId
  const defaultRoot = getDefaultStorageProfileRoot(userDataPath)
  const isAppSupportNotebook = rootPath === defaultRoot || isPathInside(path.join(userDataPath, NOTEBOOK_MIRRORS_DIR), rootPath)
  const localMirrorPath = isAppSupportNotebook ? rootPath : getNotebookMirrorRoot(userDataPath, notebookId)
  const syncTargetPath = isAppSupportNotebook ? null : rootPath

  if (!existsSync(path.join(localMirrorPath, 'manifest.json'))) {
    saveAppState(localMirrorPath, loadResult.serializedState, {
      userDataPath,
      userSettingsRoot: userDataPath,
      notebookId,
      assetSourceRoot: rootPath,
      syncMetadata: createSyncMetadata('mirror-created'),
    })
  }

  const timestamp = nowIso()
  return {
    id: notebookId,
    name: options.name ?? getStorageProfileNotebookName(rootPath),
    localMirrorPath,
    ...(syncTargetPath ? { syncTargetPath } : {}),
    createdAt: timestamp,
    updatedAt: timestamp,
    syncStatus: syncTargetPath ? 'synced' : 'local-only',
    syncPending: false,
    syncFiles: syncTargetPath ? normalizeNotebookSyncFiles(loadResult.storageFiles) : [],
    lastSyncedAt: syncTargetPath ? timestamp : undefined,
    isLocalOnlyMigration: rootPath === defaultRoot,
  }
}

function migrateLegacyStorageProfile(userDataPath) {
  const legacyConfig = readLegacyStorageProfileConfig(userDataPath)
  const defaultRoot = getDefaultStorageProfileRoot(userDataPath)
  const candidates = uniquePaths([
    legacyConfig.profileRootPath,
    ...legacyConfig.knownNotebookPaths,
    existsSync(path.join(defaultRoot, 'manifest.json')) ? defaultRoot : null,
  ])
  const records = []
  const seenIds = new Set()
  for (const candidate of candidates) {
    const record = buildNotebookRecordFromFolder(userDataPath, candidate)
    if (!record || seenIds.has(record.id)) continue
    seenIds.add(record.id)
    records.push(record)
  }
  const activeRecord = records.find((record) => {
    const legacyActive = legacyConfig.profileRootPath ?? defaultRoot
    return record.localMirrorPath === legacyActive || record.syncTargetPath === legacyActive
  }) ?? records[0] ?? null
  return {
    version: 1,
    activeNotebookId: activeRecord?.id ?? null,
    notebooks: records,
  }
}

export function initializeNotebookLibrary(userDataPath) {
  const existing = readNotebookLibrary(userDataPath)
  if (existing) return existing
  return writeNotebookLibrary(userDataPath, migrateLegacyStorageProfile(userDataPath))
}

export function getActiveNotebookRecord(library) {
  return library.notebooks.find((record) => record.id === library.activeNotebookId) ?? null
}

export function upsertNotebookRecord(userDataPath, library, record, options = {}) {
  const nextRecord = normalizeNotebookRecord(userDataPath, {
    ...record,
    updatedAt: nowIso(),
  })
  if (!nextRecord) return library
  const notebooks = library.notebooks.some((candidate) => candidate.id === nextRecord.id)
    ? library.notebooks.map((candidate) => (candidate.id === nextRecord.id ? nextRecord : candidate))
    : [...library.notebooks, nextRecord]
  return writeNotebookLibrary(userDataPath, {
    version: 1,
    activeNotebookId: options.activate === false ? library.activeNotebookId : nextRecord.id,
    notebooks,
  })
}

export function removeNotebookRecord(userDataPath, library, notebookId) {
  const notebooks = library.notebooks.filter((record) => record.id !== notebookId)
  const activeNotebookId = library.activeNotebookId === notebookId
    ? notebooks[0]?.id ?? null
    : library.activeNotebookId
  return writeNotebookLibrary(userDataPath, {
    version: 1,
    activeNotebookId,
    notebooks,
  })
}

export function setActiveNotebookId(userDataPath, library, notebookId) {
  if (!library.notebooks.some((record) => record.id === notebookId)) return library
  return writeNotebookLibrary(userDataPath, {
    ...library,
    activeNotebookId: notebookId,
  })
}

export function createNotebookRecord(userDataPath, { name, syncTargetPath, serializedState }) {
  const notebookId = createNotebookId()
  const localMirrorPath = getNotebookMirrorRoot(userDataPath, notebookId)
  const timestamp = nowIso()
  saveAppState(localMirrorPath, serializedState, {
    userDataPath,
    userSettingsRoot: userDataPath,
    notebookId,
    syncMetadata: createSyncMetadata('notebook-created'),
  })
  const syncSaveResult = saveAppState(syncTargetPath, serializedState, {
    userDataPath,
    userSettingsRoot: userDataPath,
    notebookId,
    assetSourceRoot: localMirrorPath,
    syncMetadata: createSyncMetadata('notebook-created'),
  })
  return {
    id: notebookId,
    name,
    localMirrorPath,
    syncTargetPath: path.resolve(syncTargetPath),
    createdAt: timestamp,
    updatedAt: timestamp,
    syncStatus: 'synced',
    syncPending: false,
    syncFiles: normalizeNotebookSyncFiles(syncSaveResult?.storageFiles),
    lastSyncedAt: timestamp,
  }
}

export function createNotebookRecordFromExistingFolder(userDataPath, notebookRootPath) {
  const rootPath = path.resolve(notebookRootPath)
  const record = buildNotebookRecordFromFolder(userDataPath, rootPath)
  if (!record) return { ok: false, error: 'Notebook folder could not be loaded.' }
  return { ok: true, record }
}

function isIgnoredNotebookFile(fileName) {
  return (
    fileName.startsWith('.') ||
    fileName === 'desktop.ini' ||
    fileName === 'Thumbs.db' ||
    fileName.endsWith('~')
  )
}

function hashBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function listNotebookFileEntries(rootPath, currentPath = rootPath, entries = new Map()) {
  let directoryEntries
  try {
    directoryEntries = readdirSync(currentPath, { withFileTypes: true })
  } catch {
    return null
  }
  for (const entry of directoryEntries) {
    if (isIgnoredNotebookFile(entry.name)) continue
    const absolutePath = path.join(currentPath, entry.name)
    const relativePath = path.relative(rootPath, absolutePath).split(path.sep).join('/')
    if (entry.isDirectory()) {
      const nested = listNotebookFileEntries(rootPath, absolutePath, entries)
      if (nested === null) return null
      continue
    }
    if (!entry.isFile()) continue
    try {
      const bytes = readFileSync(absolutePath)
      const stat = statSync(absolutePath)
      entries.set(relativePath, {
        path: relativePath,
        absolutePath,
        bytes,
        contentHash: hashBytes(bytes),
        byteLength: bytes.length,
        mtimeMs: stat.mtimeMs,
      })
    } catch {
      return null
    }
  }
  return entries
}

function copyEntry(rootPath, relativePath, entry) {
  const absolutePath = path.resolve(rootPath, ...relativePath.split('/').filter(Boolean))
  if (!absolutePath.startsWith(path.resolve(rootPath) + path.sep)) return
  if (!entry) {
    rmSync(absolutePath, { force: true })
    return
  }
  mkdirSync(path.dirname(absolutePath), { recursive: true })
  copyFileSync(entry.absolutePath, absolutePath)
}

function createSyncFiles(entries) {
  return Array.from(entries.values())
    .map((entry) => ({
      path: entry.path,
      contentHash: entry.contentHash,
      byteLength: entry.byteLength,
    }))
    .sort((left, right) => left.path.localeCompare(right.path))
}

export function normalizeNotebookSyncFiles(value) {
  const entries = Array.isArray(value)
    ? value
    : Array.isArray(value?.entries)
      ? value.entries
      : []
  return entries
    .flatMap((entry) => {
      const filePath = typeof entry?.path === 'string'
        ? entry.path
        : typeof entry?.relativePath === 'string'
          ? entry.relativePath
          : ''
      const contentHash = typeof entry?.contentHash === 'string'
        ? entry.contentHash
        : typeof entry?.hash === 'string'
          ? entry.hash
          : ''
      const byteLength = Number.isFinite(entry?.byteLength)
        ? entry.byteLength
        : Number.isFinite(entry?.size)
          ? entry.size
          : null
      return filePath && contentHash && byteLength !== null
        ? [{ path: filePath, contentHash, byteLength }]
        : []
    })
    .sort((left, right) => left.path.localeCompare(right.path))
}

function getCheckpointHash(syncFiles, relativePath) {
  const entry = Array.isArray(syncFiles)
    ? syncFiles.find((candidate) => candidate?.path === relativePath)
    : null
  return typeof entry?.contentHash === 'string' ? entry.contentHash : null
}

function getEntryChangeMtime(rootPath, relativePath, entry) {
  if (entry && Number.isFinite(entry.mtimeMs)) return entry.mtimeMs
  const root = path.resolve(rootPath)
  let directoryPath = path.dirname(path.resolve(root, ...relativePath.split('/').filter(Boolean)))
  while (directoryPath === root || isPathInside(root, directoryPath)) {
    try {
      if (existsSync(directoryPath)) return statSync(directoryPath).mtimeMs
    } catch {
      return 0
    }
    const parentPath = path.dirname(directoryPath)
    if (parentPath === directoryPath) break
    directoryPath = parentPath
  }
  return 0
}

export function reconcileNotebookMirrorWithTarget(record) {
  if (!record?.syncTargetPath) return { ok: true, changed: false, record: { ...record, syncStatus: 'local-only', syncPending: false } }
  if (!existsSync(record.syncTargetPath)) {
    return {
      ok: true,
      changed: false,
      record: {
        ...record,
        syncStatus: 'offline',
        syncPending: true,
        lastSyncError: 'Sync target is unavailable.',
      },
    }
  }
  const targetLoadResult = loadAppStateResult(record.syncTargetPath)
  if (!targetLoadResult.ok || typeof targetLoadResult.serializedState !== 'string') {
    return {
      ok: false,
      error: targetLoadResult.error ?? 'Sync target could not be loaded.',
      record: {
        ...record,
        syncStatus: 'error',
        syncPending: true,
        lastSyncError: targetLoadResult.error ?? 'Sync target could not be loaded.',
      },
    }
  }
  const localEntries = listNotebookFileEntries(record.localMirrorPath)
  const targetEntries = listNotebookFileEntries(record.syncTargetPath)
  if (localEntries === null || targetEntries === null) {
    return {
      ok: false,
      error: 'Notebook files could not be read for sync.',
      record: {
        ...record,
        syncStatus: 'error',
        syncPending: true,
        lastSyncError: 'Notebook files could not be read for sync.',
      },
    }
  }

  const paths = new Set([...localEntries.keys(), ...targetEntries.keys()])
  let changed = false
  let tieConflictCount = 0
  for (const relativePath of paths) {
    if (relativePath === '_internal/sync-state.json') continue
    const localEntry = localEntries.get(relativePath) ?? null
    const targetEntry = targetEntries.get(relativePath) ?? null
    const checkpointHash = getCheckpointHash(record.syncFiles, relativePath)
    const localHash = localEntry?.contentHash ?? null
    const targetHash = targetEntry?.contentHash ?? null
    if (localHash === targetHash) continue

    const localChanged = localHash !== checkpointHash
    const targetChanged = targetHash !== checkpointHash
    if (!localChanged && !targetChanged) continue

    let winner = null
    if (localChanged && !targetChanged) {
      winner = 'local'
    } else if (!localChanged && targetChanged) {
      winner = 'target'
    } else {
      const localMtime = getEntryChangeMtime(record.localMirrorPath, relativePath, localEntry)
      const targetMtime = getEntryChangeMtime(record.syncTargetPath, relativePath, targetEntry)
      winner = localMtime >= targetMtime ? 'local' : 'target'
      if (localMtime === targetMtime) tieConflictCount += 1
    }

    if (winner === 'local') {
      copyEntry(record.syncTargetPath, relativePath, localEntry)
    } else {
      copyEntry(record.localMirrorPath, relativePath, targetEntry)
    }
    changed = true
  }

  const nextEntries = listNotebookFileEntries(record.localMirrorPath) ?? new Map()
  const timestamp = nowIso()
  return {
    ok: true,
    changed,
    warning: tieConflictCount > 0 ? `${tieConflictCount} sync conflict${tieConflictCount === 1 ? '' : 's'} kept local changes.` : undefined,
    record: {
      ...record,
      syncStatus: tieConflictCount > 0 ? 'warning' : 'synced',
      syncPending: false,
      syncFiles: createSyncFiles(nextEntries),
      lastSyncedAt: timestamp,
      lastSyncError: undefined,
      updatedAt: timestamp,
    },
  }
}

export function createProfileFromNotebookLibrary(userDataPath, library) {
  const activeRecord = getActiveNotebookRecord(library)
  if (!activeRecord) {
    return {
      setupRequired: true,
      userDataPath,
      profileRootPath: getDefaultStorageProfileRoot(userDataPath),
      notebookPath: '',
      notebookId: null,
      notebookName: '',
      localMirrorPath: '',
      isDefault: false,
      knownNotebookPaths: [],
      notebooks: library.notebooks,
    }
  }
  const syncTargetMissing = Boolean(activeRecord.syncTargetPath && !existsSync(activeRecord.syncTargetPath))
  return {
    userDataPath,
    profileRootPath: activeRecord.localMirrorPath,
    notebookPath: activeRecord.syncTargetPath ?? activeRecord.localMirrorPath,
    notebookId: activeRecord.id,
    notebookName: activeRecord.name,
    localMirrorPath: activeRecord.localMirrorPath,
    syncTargetPath: activeRecord.syncTargetPath,
    syncStatus: syncTargetMissing ? 'offline' : activeRecord.syncStatus,
    syncPending: syncTargetMissing ? true : activeRecord.syncPending,
    lastSyncError: activeRecord.lastSyncError,
    isDefault: false,
    knownNotebookPaths: library.notebooks.map((record) => record.syncTargetPath ?? record.localMirrorPath),
    notebooks: library.notebooks,
  }
}
