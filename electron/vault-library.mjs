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
  getStorageProfileVaultName,
  STORAGE_PROFILE_CONFIG_FILE,
} from './storage-profile.mjs'

export const VAULT_LIBRARY_CONFIG_FILE = 'vault-library.json'

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

function getVaultLibraryConfigPath(userDataPath) {
  return path.join(userDataPath, VAULT_LIBRARY_CONFIG_FILE)
}

export function readVaultRootManifest(vaultRootPath) {
  return readJsonFile(path.join(getHybridStorageRoot(vaultRootPath), 'manifest.json'))
}

function createVaultId() {
  return `vault-${randomUUID()}`
}

function cleanupLegacyAppPrivateVault(userDataPath) {
  const defaultRoot = getDefaultStorageProfileRoot(userDataPath)
  try {
    rmSync(defaultRoot, { recursive: true, force: true })
  } catch {
    // Best-effort cleanup only; external vault folders are never touched here.
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

function hasVaultManifest(vaultPath) {
  return Boolean(vaultPath && existsSync(path.join(getHybridStorageRoot(vaultPath), 'manifest.json')))
}

export function ensureVaultFolderIdentity(userDataPath, vaultRootPath, requestedVaultId = null) {
  const rootPath = path.resolve(vaultRootPath)
  const manifest = readVaultRootManifest(rootPath)
  const existingVaultId = typeof manifest?.vaultId === 'string' && manifest.vaultId.trim()
    ? manifest.vaultId.trim()
    : ''
  if (existingVaultId) {
    return { ok: true, vaultId: existingVaultId, upgraded: false }
  }

  const vaultId = typeof requestedVaultId === 'string' && requestedVaultId.trim()
    ? requestedVaultId.trim()
    : createVaultId()
  const loadResult = loadAppStateResult(rootPath, { userSettingsRoot: userDataPath })
  if (!loadResult.ok || typeof loadResult.serializedState !== 'string') {
    return {
      ok: false,
      error: loadResult.error ?? 'Vault folder could not be loaded.',
    }
  }

  saveAppState(rootPath, loadResult.serializedState, {
    userDataPath,
    userSettingsRoot: userDataPath,
    vaultId,
    assetSourceRoot: rootPath,
    syncMetadata: createSyncMetadata('schema-upgraded'),
  })
  return { ok: true, vaultId, upgraded: true }
}

function chooseVaultPathForLegacyRecord(record) {
  const directPath = normalizePath(record?.vaultPath)
  if (directPath) return directPath

  const syncTargetPath = normalizePath(record?.syncTargetPath)
  if (hasVaultManifest(syncTargetPath)) return syncTargetPath

  const localMirrorPath = normalizePath(record?.localMirrorPath)
  if (hasVaultManifest(localMirrorPath)) return localMirrorPath

  return syncTargetPath ?? localMirrorPath
}

function normalizeVaultRecord(_userDataPath, record) {
  const id = typeof record?.id === 'string' && record.id.trim() ? record.id.trim() : ''
  const vaultPath = chooseVaultPathForLegacyRecord(record)
  if (!id || !vaultPath) return null
  return {
    id,
    vaultPath,
    createdAt: typeof record?.createdAt === 'string' ? record.createdAt : nowIso(),
    updatedAt: typeof record?.updatedAt === 'string' ? record.updatedAt : nowIso(),
    lastOpenedAt: typeof record?.lastOpenedAt === 'string' ? record.lastOpenedAt : undefined,
    lastError: typeof record?.lastError === 'string' ? record.lastError : undefined,
  }
}

function normalizeVaultLibrary(userDataPath, rawLibrary) {
  const defaultRoot = getDefaultStorageProfileRoot(userDataPath)
  const records = Array.isArray(rawLibrary?.vaults)
    ? rawLibrary.vaults.map((record) => normalizeVaultRecord(userDataPath, record)).filter(Boolean)
    : []
  const seenIds = new Set()
  const seenPaths = new Set()
  const vaults = records.filter((record) => {
    const pathKey = path.resolve(record.vaultPath)
    if (pathKey === defaultRoot || seenIds.has(record.id) || seenPaths.has(pathKey)) return false
    seenIds.add(record.id)
    seenPaths.add(pathKey)
    return true
  })
  const activeVaultId =
    typeof rawLibrary?.activeVaultId === 'string' &&
    vaults.some((record) => record.id === rawLibrary.activeVaultId)
      ? rawLibrary.activeVaultId
      : vaults[0]?.id ?? null
  return {
    version: 1,
    activeVaultId,
    vaults,
  }
}

export function readVaultLibrary(userDataPath) {
  const rawLibrary = readJsonFile(getVaultLibraryConfigPath(userDataPath))
  return rawLibrary ? normalizeVaultLibrary(userDataPath, rawLibrary) : null
}

export function writeVaultLibrary(userDataPath, library) {
  const normalized = normalizeVaultLibrary(userDataPath, library)
  writeJsonFile(getVaultLibraryConfigPath(userDataPath), normalized)
  return normalized
}

function buildVaultRecordFromFolder(userDataPath, vaultRootPath, options = {}) {
  const rootPath = path.resolve(vaultRootPath)
  const loadResult = loadAppStateResult(rootPath, { userSettingsRoot: userDataPath })
  if (!loadResult.ok || typeof loadResult.serializedState !== 'string') return null

  const identity = ensureVaultFolderIdentity(userDataPath, rootPath)
  if (!identity.ok) return null
  const timestamp = nowIso()
  return {
    id: identity.vaultId,
    vaultPath: rootPath,
    createdAt: options.createdAt ?? timestamp,
    updatedAt: timestamp,
    lastOpenedAt: timestamp,
  }
}

export function initializeVaultLibrary(userDataPath) {
  cleanupLegacyAppPrivateVault(userDataPath)
  const existing = readVaultLibrary(userDataPath)
  if (existing) return writeVaultLibrary(userDataPath, existing)
  return writeVaultLibrary(userDataPath, {
    version: 1,
    activeVaultId: null,
    vaults: [],
  })
}

export function getActiveVaultRecord(library) {
  return library.vaults.find((record) => record.id === library.activeVaultId) ?? null
}

export function upsertVaultRecord(userDataPath, library, record, options = {}) {
  const nextRecord = normalizeVaultRecord(userDataPath, {
    ...record,
    updatedAt: nowIso(),
  })
  if (!nextRecord) return library
  const vaults = library.vaults.some((candidate) => candidate.id === nextRecord.id)
    ? library.vaults.map((candidate) => (candidate.id === nextRecord.id ? nextRecord : candidate))
    : [...library.vaults.filter((candidate) => path.resolve(candidate.vaultPath) !== path.resolve(nextRecord.vaultPath)), nextRecord]
  return writeVaultLibrary(userDataPath, {
    version: 1,
    activeVaultId: options.activate === false ? library.activeVaultId : nextRecord.id,
    vaults,
  })
}

export function removeVaultRecord(userDataPath, library, vaultId) {
  const vaults = library.vaults.filter((record) => record.id !== vaultId)
  const activeVaultId = library.activeVaultId === vaultId
    ? vaults[0]?.id ?? null
    : library.activeVaultId
  return writeVaultLibrary(userDataPath, {
    version: 1,
    activeVaultId,
    vaults,
  })
}

export function setActiveVaultId(userDataPath, library, vaultId) {
  if (!library.vaults.some((record) => record.id === vaultId)) return library
  return writeVaultLibrary(userDataPath, {
    ...library,
    activeVaultId: vaultId,
    vaults: library.vaults.map((record) =>
      record.id === vaultId ? { ...record, lastOpenedAt: nowIso() } : record,
    ),
  })
}

export function createVaultRecord(userDataPath, { vaultPath, serializedState }) {
  const vaultId = createVaultId()
  const rootPath = path.resolve(vaultPath)
  const timestamp = nowIso()
  saveAppState(rootPath, serializedState, {
    userDataPath,
    userSettingsRoot: userDataPath,
    vaultId,
    syncMetadata: createSyncMetadata('vault-created'),
  })
  return {
    id: vaultId,
    vaultPath: rootPath,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastOpenedAt: timestamp,
  }
}

export function createVaultRecordFromExistingFolder(userDataPath, vaultRootPath) {
  const rootPath = path.resolve(vaultRootPath)
  const record = buildVaultRecordFromFolder(userDataPath, rootPath)
  if (!record) return { ok: false, error: 'Vault folder could not be loaded.' }
  return { ok: true, record }
}

export function createProfileFromVaultLibrary(userDataPath, library) {
  const activeRecord = getActiveVaultRecord(library)
  if (!activeRecord) {
    return {
      setupRequired: true,
      userDataPath,
      profileRootPath: '',
      vaultPath: '',
      vaultId: null,
      vaultName: '',
      knownVaultPaths: [],
      vaults: library.vaults,
    }
  }
  const vaultPath = activeRecord.vaultPath
  return {
    userDataPath,
    profileRootPath: vaultPath,
    vaultPath,
    vaultId: activeRecord.id,
    vaultName: getStorageProfileVaultName(vaultPath),
    knownVaultPaths: library.vaults.map((record) => record.vaultPath),
    vaults: library.vaults,
  }
}
