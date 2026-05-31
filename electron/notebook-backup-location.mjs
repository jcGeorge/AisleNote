import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { getStorageProfileNotesPath } from './storage-profile.mjs'

export const NOTEBOOK_BACKUP_CONFIG_FILE = 'notebook-backup-location.json'
export const NOTEBOOK_BACKUP_MANAGED_DIR = 'Tabs Backups'
export const NOTEBOOK_BACKUP_INTERVAL_MS = 4 * 60 * 60 * 1000
export const NOTEBOOK_BACKUP_RETENTION_COUNT = 30

const DEFAULT_CONFIG = Object.freeze({
  enabled: false,
  destinationRootPath: null,
  lastAttemptAt: null,
  lastSuccessfulAt: null,
  lastError: null,
  lastBackupPath: null,
})

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeTimestamp(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function normalizeBackupConfig(value) {
  if (!isRecord(value)) return { ...DEFAULT_CONFIG }
  const destinationRootPath =
    typeof value.destinationRootPath === 'string' && value.destinationRootPath.trim()
      ? path.resolve(value.destinationRootPath)
      : null
  return {
    enabled: Boolean(value.enabled && destinationRootPath),
    destinationRootPath,
    lastAttemptAt: normalizeTimestamp(value.lastAttemptAt),
    lastSuccessfulAt: normalizeTimestamp(value.lastSuccessfulAt),
    lastError: typeof value.lastError === 'string' && value.lastError.trim() ? value.lastError : null,
    lastBackupPath:
      typeof value.lastBackupPath === 'string' && value.lastBackupPath.trim()
        ? path.resolve(value.lastBackupPath)
        : null,
  }
}

function getNotebookBackupConfigPath(userDataPath) {
  return path.join(userDataPath, NOTEBOOK_BACKUP_CONFIG_FILE)
}

function readJsonFile(filePath) {
  try {
    if (!existsSync(filePath)) return null
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function writeJsonFileAtomic(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true })
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  )
  writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(tempPath, filePath)
}

function writeBinaryFileAtomic(filePath, bytes) {
  mkdirSync(path.dirname(filePath), { recursive: true })
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  )
  writeFileSync(tempPath, bytes)
  renameSync(tempPath, filePath)
}

function resolvePath(value) {
  return typeof value === 'string' && value.trim() ? path.resolve(value) : null
}

function isSamePath(left, right) {
  const resolvedLeft = resolvePath(left)
  const resolvedRight = resolvePath(right)
  return Boolean(resolvedLeft && resolvedRight && resolvedLeft === resolvedRight)
}

function isSameOrInsidePath(candidatePath, parentPath) {
  const candidate = resolvePath(candidatePath)
  const parent = resolvePath(parentPath)
  if (!candidate || !parent) return false
  const relative = path.relative(parent, candidate)
  return relative === '' || Boolean(relative && !relative.startsWith('..') && !path.isAbsolute(relative))
}

function safePathSegment(value) {
  const normalized = String(value ?? '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
  return normalized.length > 0 ? normalized.slice(0, 80) : 'Notebook'
}

export function getNotebookBackupManagedFolderPath(destinationRootPath, activeNotebookRootPath) {
  const destinationRoot = path.resolve(destinationRootPath)
  const notebookRoot = path.resolve(activeNotebookRootPath)
  const notebookName = safePathSegment(path.basename(notebookRoot) || 'Notebook')
  const hash = createHash('sha256').update(notebookRoot).digest('hex').slice(0, 8)
  return path.join(destinationRoot, NOTEBOOK_BACKUP_MANAGED_DIR, `${notebookName}-${hash}`)
}

export function validateNotebookBackupDestination(destinationRootPath, activeNotebookRootPath) {
  const destinationRoot = resolvePath(destinationRootPath)
  const notebookRoot = resolvePath(activeNotebookRootPath)
  if (!destinationRoot) {
    return { ok: false, error: 'Choose a backup folder.' }
  }
  if (!notebookRoot) {
    return { ok: false, error: 'Active notebook folder is unavailable.' }
  }
  if (isSamePath(destinationRoot, notebookRoot)) {
    return {
      ok: false,
      error: 'The active notebook folder cannot be used as its backup folder. Choose a different folder.',
    }
  }
  const notesPath = getStorageProfileNotesPath(notebookRoot)
  if (isSameOrInsidePath(destinationRoot, notesPath)) {
    return {
      ok: false,
      error: 'Backup folders cannot be inside the active notes folder. Choose a different folder.',
    }
  }
  return { ok: true }
}

export function readNotebookBackupConfig(userDataPath) {
  return normalizeBackupConfig(readJsonFile(getNotebookBackupConfigPath(path.resolve(userDataPath))))
}

export function writeNotebookBackupConfig(userDataPath, config) {
  const normalized = normalizeBackupConfig(config)
  writeJsonFileAtomic(getNotebookBackupConfigPath(path.resolve(userDataPath)), normalized)
  return normalized
}

export function configureNotebookBackupDestination(userDataPath, destinationRootPath) {
  const existing = readNotebookBackupConfig(userDataPath)
  return writeNotebookBackupConfig(userDataPath, {
    ...existing,
    enabled: true,
    destinationRootPath: path.resolve(destinationRootPath),
    lastError: null,
  })
}

export function resetNotebookBackupDestination(userDataPath) {
  rmSync(getNotebookBackupConfigPath(path.resolve(userDataPath)), { force: true })
  return { ...DEFAULT_CONFIG }
}

export function createNotebookBackupStatus(userDataPath, activeNotebookRootPath, config = readNotebookBackupConfig(userDataPath), options = {}) {
  const now = typeof options.now === 'number' ? options.now : Date.now()
  const enabled = Boolean(config.enabled && config.destinationRootPath)
  const managedFolderPath =
    enabled && config.destinationRootPath
      ? getNotebookBackupManagedFolderPath(config.destinationRootPath, activeNotebookRootPath)
      : null
  const destinationReachable = Boolean(config.destinationRootPath && existsSync(config.destinationRootPath))
  const validation = enabled
    ? validateNotebookBackupDestination(config.destinationRootPath, activeNotebookRootPath)
    : { ok: true }
  const lastSuccessfulAt = normalizeTimestamp(config.lastSuccessfulAt)
  const nextBackupAt = lastSuccessfulAt === null ? null : lastSuccessfulAt + NOTEBOOK_BACKUP_INTERVAL_MS
  const status = !enabled
    ? 'disabled'
    : !validation.ok || config.lastError || !destinationReachable
      ? 'warning'
      : 'ready'
  const error =
    (!validation.ok ? validation.error : null) ||
    config.lastError ||
    (enabled && !destinationReachable ? 'Backup folder could not be reached.' : null)
  return {
    status,
    event: options.event ?? 'ready',
    enabled,
    destinationRootPath: config.destinationRootPath,
    managedFolderPath,
    intervalMs: NOTEBOOK_BACKUP_INTERVAL_MS,
    retentionCount: NOTEBOOK_BACKUP_RETENTION_COUNT,
    lastAttemptAt: normalizeTimestamp(config.lastAttemptAt),
    lastSuccessfulAt,
    lastBackupPath: config.lastBackupPath,
    nextBackupAt,
    canWrite: enabled && validation.ok && destinationReachable && !config.lastError,
    ...(error ? { error } : {}),
    ...(options.lastSkippedReason ? { lastSkippedReason: options.lastSkippedReason } : {}),
  }
}

function createTimestamp(now) {
  const date = new Date(now)
  const pad = (value) => String(value).padStart(2, '0')
  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('')
}

function getUniqueBackupPath(managedFolderPath, now) {
  const baseName = `tabs-notebook-${createTimestamp(now)}`
  let candidate = path.join(managedFolderPath, `${baseName}.zip`)
  let counter = 2
  while (existsSync(candidate)) {
    candidate = path.join(managedFolderPath, `${baseName}-${counter}.zip`)
    counter += 1
  }
  return candidate
}

function normalizeBytes(value) {
  if (value instanceof ArrayBuffer) return Buffer.from(value)
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength)
  if (Buffer.isBuffer(value)) return value
  return null
}

function listManagedBackupArchives(managedFolderPath) {
  if (!existsSync(managedFolderPath)) return []
  return readdirSync(managedFolderPath)
    .filter((entry) => /^tabs-notebook-\d{4}-\d{2}-\d{2}-\d{6}(?:-\d+)?\.zip$/.test(entry))
    .map((entry) => {
      const absolutePath = path.join(managedFolderPath, entry)
      let mtimeMs = 0
      try {
        mtimeMs = statSync(absolutePath).mtimeMs
      } catch {
        mtimeMs = 0
      }
      return { absolutePath, entry, mtimeMs }
    })
    .sort((left, right) => {
      const nameOrder = right.entry.localeCompare(left.entry)
      if (nameOrder !== 0) return nameOrder
      return right.mtimeMs - left.mtimeMs
    })
}

export function pruneNotebookBackupArchives(managedFolderPath, retentionCount = NOTEBOOK_BACKUP_RETENTION_COUNT) {
  const archives = listManagedBackupArchives(managedFolderPath)
  const pruned = []
  archives.slice(retentionCount).forEach((archive) => {
    try {
      rmSync(archive.absolutePath, { force: true })
      pruned.push(archive.absolutePath)
    } catch {
      // Retention failures should not make the backup itself look failed.
    }
  })
  return pruned
}

function writeBackupFailure(userDataPath, config, activeNotebookRootPath, message, event, now) {
  const nextConfig = writeNotebookBackupConfig(userDataPath, {
    ...config,
    lastAttemptAt: now,
    lastError: message,
  })
  return {
    ok: false,
    error: message,
    status: createNotebookBackupStatus(userDataPath, activeNotebookRootPath, nextConfig, { event }),
  }
}

export function writeNotebookBackupArchive(
  userDataPath,
  activeNotebookRootPath,
  archiveBytes,
  options = {},
) {
  const trigger = options.trigger === 'automatic' ? 'automatic' : 'manual'
  const now = typeof options.now === 'number' ? options.now : Date.now()
  const config = readNotebookBackupConfig(userDataPath)
  if (!config.enabled || !config.destinationRootPath) {
    const status = createNotebookBackupStatus(userDataPath, activeNotebookRootPath, config, {
      event: trigger === 'automatic' ? 'automatic-backup-skipped' : 'manual-backup-unconfigured',
      lastSkippedReason: 'not-configured',
    })
    return trigger === 'automatic'
      ? { ok: true, skipped: true, status }
      : { ok: false, skipped: true, error: 'Notebook backups are not configured.', status }
  }

  const validation = validateNotebookBackupDestination(config.destinationRootPath, activeNotebookRootPath)
  if (!validation.ok) {
    return writeBackupFailure(
      userDataPath,
      config,
      activeNotebookRootPath,
      validation.error,
      'backup-destination-rejected',
      now,
    )
  }

  if (
    trigger === 'automatic' &&
    typeof config.lastSuccessfulAt === 'number' &&
    now - config.lastSuccessfulAt < NOTEBOOK_BACKUP_INTERVAL_MS
  ) {
    return {
      ok: true,
      skipped: true,
      status: createNotebookBackupStatus(userDataPath, activeNotebookRootPath, config, {
        event: 'automatic-backup-skipped',
        lastSkippedReason: 'interval',
        now,
      }),
    }
  }

  const bytes = normalizeBytes(archiveBytes)
  if (!bytes || bytes.byteLength <= 0) {
    return writeBackupFailure(
      userDataPath,
      config,
      activeNotebookRootPath,
      'Notebook archive payload is empty.',
      'backup-write-failed',
      now,
    )
  }

  if (!existsSync(config.destinationRootPath)) {
    return writeBackupFailure(
      userDataPath,
      config,
      activeNotebookRootPath,
      'Backup folder could not be reached.',
      'backup-destination-unreachable',
      now,
    )
  }

  const managedFolderPath = getNotebookBackupManagedFolderPath(
    config.destinationRootPath,
    activeNotebookRootPath,
  )
  try {
    const backupPath = getUniqueBackupPath(managedFolderPath, now)
    writeBinaryFileAtomic(backupPath, bytes)
    const nextConfig = writeNotebookBackupConfig(userDataPath, {
      ...config,
      enabled: true,
      lastAttemptAt: now,
      lastSuccessfulAt: now,
      lastError: null,
      lastBackupPath: backupPath,
    })
    const prunedPaths = pruneNotebookBackupArchives(managedFolderPath, NOTEBOOK_BACKUP_RETENTION_COUNT)
    return {
      ok: true,
      skipped: false,
      backupPath,
      prunedPaths,
      status: createNotebookBackupStatus(userDataPath, activeNotebookRootPath, nextConfig, {
        event: trigger === 'automatic' ? 'automatic-backup-saved' : 'manual-backup-saved',
        now,
      }),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Notebook backup could not be written.'
    return writeBackupFailure(userDataPath, config, activeNotebookRootPath, message, 'backup-write-failed', now)
  }
}
