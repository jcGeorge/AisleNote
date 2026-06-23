import { randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
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

function getNotebookLibraryConfigPath(userDataPath) {
  return path.join(userDataPath, NOTEBOOK_LIBRARY_CONFIG_FILE)
}

export function readNotebookRootManifest(notebookRootPath) {
  return readJsonFile(path.join(getHybridStorageRoot(notebookRootPath), 'manifest.json'))
}

function createNotebookId() {
  return `notebook-${randomUUID()}`
}

function cleanupLegacyAppPrivateNotebook(userDataPath) {
  const defaultRoot = getDefaultStorageProfileRoot(userDataPath)
  try {
    rmSync(defaultRoot, { recursive: true, force: true })
  } catch {
    // Best-effort cleanup only; external notebook folders are never touched here.
  }
  try {
    rmSync(path.join(userDataPath, STORAGE_PROFILE_CONFIG_FILE), { force: true })
  } catch {
    // Best-effort cleanup only.
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

function hasNotebookManifest(notebookPath) {
  return Boolean(notebookPath && existsSync(path.join(getHybridStorageRoot(notebookPath), 'manifest.json')))
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

function chooseNotebookPathForLegacyRecord(record) {
  const directPath = normalizePath(record?.notebookPath)
  if (directPath) return directPath

  const syncTargetPath = normalizePath(record?.syncTargetPath)
  if (hasNotebookManifest(syncTargetPath)) return syncTargetPath

  const localMirrorPath = normalizePath(record?.localMirrorPath)
  if (hasNotebookManifest(localMirrorPath)) return localMirrorPath

  return syncTargetPath ?? localMirrorPath
}

function normalizeNotebookRecord(_userDataPath, record) {
  const id = typeof record?.id === 'string' && record.id.trim() ? record.id.trim() : ''
  const notebookPath = chooseNotebookPathForLegacyRecord(record)
  if (!id || !notebookPath) return null
  return {
    id,
    notebookPath,
    createdAt: typeof record?.createdAt === 'string' ? record.createdAt : nowIso(),
    updatedAt: typeof record?.updatedAt === 'string' ? record.updatedAt : nowIso(),
    lastOpenedAt: typeof record?.lastOpenedAt === 'string' ? record.lastOpenedAt : undefined,
    lastError: typeof record?.lastError === 'string' ? record.lastError : undefined,
  }
}

function normalizeNotebookLibrary(userDataPath, rawLibrary) {
  const defaultRoot = getDefaultStorageProfileRoot(userDataPath)
  const records = Array.isArray(rawLibrary?.notebooks)
    ? rawLibrary.notebooks.map((record) => normalizeNotebookRecord(userDataPath, record)).filter(Boolean)
    : []
  const seenIds = new Set()
  const seenPaths = new Set()
  const notebooks = records.filter((record) => {
    const pathKey = path.resolve(record.notebookPath)
    if (pathKey === defaultRoot || seenIds.has(record.id) || seenPaths.has(pathKey)) return false
    seenIds.add(record.id)
    seenPaths.add(pathKey)
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
  const timestamp = nowIso()
  return {
    id: identity.notebookId,
    notebookPath: rootPath,
    createdAt: options.createdAt ?? timestamp,
    updatedAt: timestamp,
    lastOpenedAt: timestamp,
  }
}

export function initializeNotebookLibrary(userDataPath) {
  cleanupLegacyAppPrivateNotebook(userDataPath)
  const existing = readNotebookLibrary(userDataPath)
  if (existing) return writeNotebookLibrary(userDataPath, existing)
  return writeNotebookLibrary(userDataPath, {
    version: 1,
    activeNotebookId: null,
    notebooks: [],
  })
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
    : [...library.notebooks.filter((candidate) => path.resolve(candidate.notebookPath) !== path.resolve(nextRecord.notebookPath)), nextRecord]
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
    notebooks: library.notebooks.map((record) =>
      record.id === notebookId ? { ...record, lastOpenedAt: nowIso() } : record,
    ),
  })
}

export function createNotebookRecord(userDataPath, { notebookPath, serializedState }) {
  const notebookId = createNotebookId()
  const rootPath = path.resolve(notebookPath)
  const timestamp = nowIso()
  saveAppState(rootPath, serializedState, {
    userDataPath,
    userSettingsRoot: userDataPath,
    notebookId,
    syncMetadata: createSyncMetadata('notebook-created'),
  })
  return {
    id: notebookId,
    notebookPath: rootPath,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastOpenedAt: timestamp,
  }
}

export function createNotebookRecordFromExistingFolder(userDataPath, notebookRootPath) {
  const rootPath = path.resolve(notebookRootPath)
  const record = buildNotebookRecordFromFolder(userDataPath, rootPath)
  if (!record) return { ok: false, error: 'Notebook folder could not be loaded.' }
  return { ok: true, record }
}

export function createProfileFromNotebookLibrary(userDataPath, library) {
  const activeRecord = getActiveNotebookRecord(library)
  if (!activeRecord) {
    return {
      setupRequired: true,
      userDataPath,
      profileRootPath: '',
      notebookPath: '',
      notebookId: null,
      notebookName: '',
      knownNotebookPaths: [],
      notebooks: library.notebooks,
    }
  }
  const notebookPath = activeRecord.notebookPath
  return {
    userDataPath,
    profileRootPath: notebookPath,
    notebookPath,
    notebookId: activeRecord.id,
    notebookName: getStorageProfileNotebookName(notebookPath),
    knownNotebookPaths: library.notebooks.map((record) => record.notebookPath),
    notebooks: library.notebooks,
  }
}
