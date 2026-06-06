export type DiagnosticLogLevel = 'debug' | 'info' | 'warning' | 'error'
export type DiagnosticLogLevelFilter = DiagnosticLogLevel | 'all'
export type DiagnosticLogDisplayLimit = 500 | 1000 | 1500 | 2000 | 'all'

export type DiagnosticLogDetails = Record<string, unknown>

export type DiagnosticLogEntry = {
  id: string
  createdAt: string
  dayKey: string
  sessionId: string
  level: DiagnosticLogLevel
  area: string
  event: string
  durationMs?: number
  message?: string
  details?: DiagnosticLogDetails
}

export type DiagnosticLogInput = {
  level?: DiagnosticLogLevel
  durationMs?: number
  message?: string
  details?: DiagnosticLogDetails
}

export const DIAGNOSTIC_LOG_RETENTION_DAYS = 14
export const DIAGNOSTIC_LOG_MAX_ENTRIES_PER_DAY = 5000
export const DIAGNOSTIC_LOG_LEVEL_FILTERS: readonly DiagnosticLogLevelFilter[] = [
  'all',
  'error',
  'warning',
  'info',
  'debug',
]
export const DIAGNOSTIC_LOG_DISPLAY_LIMITS: readonly DiagnosticLogDisplayLimit[] = [
  500,
  1000,
  1500,
  2000,
  'all',
]

const MAX_STRING_LENGTH = 240
const MAX_OBJECT_KEYS = 32
const MAX_ARRAY_ITEMS = 24
const MAX_DETAILS_DEPTH = 3
const VALID_LEVELS = new Set<DiagnosticLogLevel>(['debug', 'info', 'warning', 'error'])
const REDACTED_DETAIL_KEY_RE = /(^markdown$|markdown|clipboard|dataurl|data-url|^html$|^text$|^contents?$|selectiontext)/i

function padDatePart(value: number): string {
  return String(value).padStart(2, '0')
}

export function getDiagnosticDayKey(date = new Date()): string {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`
}

export function isDiagnosticDayKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function clampString(value: string): string {
  if (value.startsWith('data:')) return '[redacted data url]'
  return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}...` : value
}

function sanitizeDetailValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return clampString(value)
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean') return value
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) {
    if (depth >= MAX_DETAILS_DEPTH) return `[array:${value.length}]`
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeDetailValue(item, depth + 1))
  }
  if (typeof value === 'object') {
    if (depth >= MAX_DETAILS_DEPTH) return '[object]'
    const next: DiagnosticLogDetails = {}
    Object.entries(value as Record<string, unknown>)
      .slice(0, MAX_OBJECT_KEYS)
      .forEach(([key, entry]) => {
        const trimmedKey = clampString(key.trim())
        if (!trimmedKey) return
        next[trimmedKey] = REDACTED_DETAIL_KEY_RE.test(trimmedKey)
          ? '[redacted]'
          : sanitizeDetailValue(entry, depth + 1)
      })
    return next
  }
  return String(value)
}

export function sanitizeDiagnosticDetails(details: unknown): DiagnosticLogDetails | undefined {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return undefined
  const sanitized = sanitizeDetailValue(details, 0)
  if (!sanitized || typeof sanitized !== 'object' || Array.isArray(sanitized)) return undefined
  return Object.keys(sanitized).length > 0 ? sanitized as DiagnosticLogDetails : undefined
}

function normalizeRequiredString(value: unknown, maxLength = MAX_STRING_LENGTH): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? clampString(value.trim()) : undefined
}

function normalizeDurationMs(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.max(0, Number(value.toFixed(1)))
}

export function normalizeDiagnosticLogEntry(raw: unknown): DiagnosticLogEntry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const candidate = raw as Record<string, unknown>
  const id = normalizeRequiredString(candidate.id, 120)
  const createdAt = normalizeRequiredString(candidate.createdAt, 40)
  const sessionId = normalizeRequiredString(candidate.sessionId, 120)
  const area = normalizeRequiredString(candidate.area)
  const event = normalizeRequiredString(candidate.event)
  if (!id || !createdAt || !sessionId || !area || !event) return null

  const createdDate = new Date(createdAt)
  const normalizedCreatedAt = Number.isNaN(createdDate.getTime()) ? new Date().toISOString() : createdDate.toISOString()
  const dayKey = isDiagnosticDayKey(candidate.dayKey) ? candidate.dayKey : getDiagnosticDayKey(new Date(normalizedCreatedAt))
  const level = VALID_LEVELS.has(candidate.level as DiagnosticLogLevel)
    ? candidate.level as DiagnosticLogLevel
    : 'info'
  const details = sanitizeDiagnosticDetails(candidate.details)
  const durationMs = normalizeDurationMs(candidate.durationMs)
  const message = normalizeOptionalString(candidate.message)

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

export function createDiagnosticSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function createDiagnosticEntry({
  sessionId,
  area,
  event,
  input = {},
  now = new Date(),
}: {
  sessionId: string
  area: string
  event: string
  input?: DiagnosticLogInput
  now?: Date
}): DiagnosticLogEntry {
  const createdAt = now.toISOString()
  const entry = normalizeDiagnosticLogEntry({
    id: createDiagnosticSessionId(),
    createdAt,
    dayKey: getDiagnosticDayKey(now),
    sessionId,
    level: input.level ?? 'info',
    area,
    event,
    durationMs: input.durationMs,
    message: input.message,
    details: input.details,
  })
  if (!entry) {
    throw new Error('diagnostic entry normalization failed')
  }
  return entry
}

export function orderDiagnosticDaysForDisplay(days: string[]): string[] {
  return Array.from(new Set(days.filter(isDiagnosticDayKey))).sort((left, right) => right.localeCompare(left))
}

export function orderDiagnosticEntriesForDisplay(entries: DiagnosticLogEntry[]): DiagnosticLogEntry[] {
  return [...entries].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}
