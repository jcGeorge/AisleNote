import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export const DIAGNOSTIC_LOG_RETENTION_DAYS = 14
export const DIAGNOSTIC_LOG_MAX_ENTRIES_PER_DAY = 5000
const DIAGNOSTIC_LOG_COMPACT_EVERY_WRITES = 100

const VALID_LEVELS = new Set(['debug', 'info', 'warning', 'error'])
const MAX_STRING_LENGTH = 240
const MAX_OBJECT_KEYS = 32
const MAX_ARRAY_ITEMS = 24
const MAX_DETAILS_DEPTH = 3
const REDACTED_DETAIL_KEY_RE = /(^markdown$|markdown|clipboard|dataurl|data-url|^html$|^text$|^contents?$|selectiontext)/i

function isDiagnosticDayKey(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function getDiagnosticDayKey(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function clampString(value) {
  if (value.startsWith('data:')) return '[redacted data url]'
  return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}...` : value
}

function sanitizeDetailValue(value, depth) {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return clampString(value)
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean') return value
  if (Array.isArray(value)) {
    if (depth >= MAX_DETAILS_DEPTH) return `[array:${value.length}]`
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeDetailValue(item, depth + 1))
  }
  if (typeof value === 'object') {
    if (depth >= MAX_DETAILS_DEPTH) return '[object]'
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, MAX_OBJECT_KEYS)
        .flatMap(([key, entry]) => {
          const trimmedKey = clampString(String(key ?? '').trim())
          if (!trimmedKey) return []
          return [
            [
              trimmedKey,
              REDACTED_DETAIL_KEY_RE.test(trimmedKey)
                ? '[redacted]'
                : sanitizeDetailValue(entry, depth + 1),
            ],
          ]
        }),
    )
  }
  return String(value)
}

function sanitizeDiagnosticDetails(details) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return undefined
  const sanitized = sanitizeDetailValue(details, 0)
  return sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized) && Object.keys(sanitized).length > 0
    ? sanitized
    : undefined
}

function normalizeRequiredString(value, maxLength = MAX_STRING_LENGTH) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed
}

function normalizeOptionalString(value) {
  return typeof value === 'string' && value.trim() ? clampString(value.trim()) : undefined
}

function normalizeDurationMs(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.max(0, Number(value.toFixed(1)))
}

function normalizeDiagnosticLogEntry(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const id = normalizeRequiredString(raw.id, 120)
  const createdAt = normalizeRequiredString(raw.createdAt, 40)
  const sessionId = normalizeRequiredString(raw.sessionId, 120)
  const area = normalizeRequiredString(raw.area)
  const event = normalizeRequiredString(raw.event)
  if (!id || !createdAt || !sessionId || !area || !event) return null

  const createdDate = new Date(createdAt)
  const normalizedCreatedAt = Number.isNaN(createdDate.getTime()) ? new Date().toISOString() : createdDate.toISOString()
  const dayKey = isDiagnosticDayKey(raw.dayKey) ? raw.dayKey : getDiagnosticDayKey(new Date(normalizedCreatedAt))
  const level = VALID_LEVELS.has(raw.level) ? raw.level : 'info'
  const details = sanitizeDiagnosticDetails(raw.details)
  const durationMs = normalizeDurationMs(raw.durationMs)
  const message = normalizeOptionalString(raw.message)

  return {
    id,
    createdAt: normalizedCreatedAt,
    dayKey,
    sessionId,
    level,
    area,
    event,
    ...(durationMs !== undefined ? { durationMs } : {}),
    ...(message ? { message } : {}),
    ...(details ? { details } : {}),
  }
}

function getDiagnosticsRoot(userDataPath) {
  return path.join(userDataPath, 'diagnostics')
}

function getDiagnosticDayFile(userDataPath, dayKey) {
  return path.join(getDiagnosticsRoot(userDataPath), `${dayKey}.ndjson`)
}

function ensureDiagnosticsRoot(userDataPath) {
  mkdirSync(getDiagnosticsRoot(userDataPath), { recursive: true })
}

function listDiagnosticDays(userDataPath) {
  const root = getDiagnosticsRoot(userDataPath)
  if (!existsSync(root)) return []
  return readdirSync(root)
    .flatMap((fileName) => {
      const match = fileName.match(/^(\d{4}-\d{2}-\d{2})\.ndjson$/)
      return match ? [match[1]] : []
    })
    .sort((left, right) => right.localeCompare(left))
}

function pruneDiagnosticDays(userDataPath) {
  const days = listDiagnosticDays(userDataPath)
  const retainedDays = days.slice(0, DIAGNOSTIC_LOG_RETENTION_DAYS)
  const retained = new Set(retainedDays)
  days.forEach((dayKey) => {
    if (!retained.has(dayKey)) {
      rmSync(getDiagnosticDayFile(userDataPath, dayKey), { force: true })
    }
  })
  return retainedDays
}

function readDiagnosticEntries(userDataPath, dayKey) {
  if (!isDiagnosticDayKey(dayKey)) return []
  const filePath = getDiagnosticDayFile(userDataPath, dayKey)
  if (!existsSync(filePath)) return []
  return readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .flatMap((line) => {
      if (!line.trim()) return []
      try {
        const entry = normalizeDiagnosticLogEntry(JSON.parse(line))
        return entry ? [entry] : []
      } catch {
        return []
      }
    })
    .slice(-DIAGNOSTIC_LOG_MAX_ENTRIES_PER_DAY)
}

function compactDiagnosticDayFile(userDataPath, dayKey) {
  const entries = readDiagnosticEntries(userDataPath, dayKey).slice(-DIAGNOSTIC_LOG_MAX_ENTRIES_PER_DAY)
  writeFileSync(getDiagnosticDayFile(userDataPath, dayKey), entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n')
}

export function registerDiagnosticIpc({ ipcMain, app, shell = null }) {
  const userDataPath = app.getPath('userData')
  const writesSinceCompactByDay = new Map()

  ipcMain.handle('append-diagnostic-log-entry', async (_event, payload = {}) => {
    const entry = normalizeDiagnosticLogEntry(payload)
    if (!entry) return { ok: false, error: 'invalid-payload' }
    try {
      ensureDiagnosticsRoot(userDataPath)
      appendFileSync(getDiagnosticDayFile(userDataPath, entry.dayKey), `${JSON.stringify(entry)}\n`, 'utf8')
      const writesSinceCompact = (writesSinceCompactByDay.get(entry.dayKey) ?? 0) + 1
      if (writesSinceCompact >= DIAGNOSTIC_LOG_COMPACT_EVERY_WRITES) {
        compactDiagnosticDayFile(userDataPath, entry.dayKey)
        writesSinceCompactByDay.set(entry.dayKey, 0)
      } else {
        writesSinceCompactByDay.set(entry.dayKey, writesSinceCompact)
      }
      pruneDiagnosticDays(userDataPath)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'write-failed' }
    }
  })

  ipcMain.handle('list-diagnostic-log-days', async () => {
    try {
      return { ok: true, days: pruneDiagnosticDays(userDataPath) }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'read-failed', days: [] }
    }
  })

  ipcMain.handle('read-diagnostic-log-entries', async (_event, payload = {}) => {
    if (!isDiagnosticDayKey(payload.dayKey)) return { ok: false, error: 'invalid-day', entries: [] }
    try {
      return { ok: true, entries: readDiagnosticEntries(userDataPath, payload.dayKey) }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'read-failed', entries: [] }
    }
  })

  ipcMain.handle('open-diagnostics-folder', async () => {
    if (!shell || typeof shell.openPath !== 'function') return { ok: false, error: 'unavailable' }
    try {
      ensureDiagnosticsRoot(userDataPath)
      const error = await shell.openPath(getDiagnosticsRoot(userDataPath))
      return error ? { ok: false, error } : { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'open-failed' }
    }
  })
}
