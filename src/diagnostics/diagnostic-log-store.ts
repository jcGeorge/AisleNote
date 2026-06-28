import {
  DIAGNOSTIC_LOG_MAX_ENTRIES_PER_DAY,
  DIAGNOSTIC_LOG_RETENTION_DAYS,
  type DiagnosticLogEntry,
  isDiagnosticDayKey,
  normalizeDiagnosticLogEntry,
  orderDiagnosticDaysForDisplay,
} from './diagnostic-log'

const DIAGNOSTIC_LOG_DAYS_STORAGE_KEY = 'aislenote:diagnostic-log:v1:days'
const DIAGNOSTIC_LOG_DAY_STORAGE_PREFIX = 'aislenote:diagnostic-log:v1:day:'

type DiagnosticLogChangeListener = (entry: DiagnosticLogEntry) => void
type DiagnosticLogDeleteResult =
  | {
      ok: true
      days: string[]
    }
  | {
      ok: false
      days: string[]
      error: string
    }

const listeners = new Set<DiagnosticLogChangeListener>()

function getDayStorageKey(dayKey: string): string {
  return `${DIAGNOSTIC_LOG_DAY_STORAGE_PREFIX}${dayKey}`
}

function readJsonArray(storage: Pick<Storage, 'getItem'>, key: string): unknown[] {
  try {
    const raw = storage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeJsonArray(storage: Pick<Storage, 'setItem'>, key: string, value: unknown[]): void {
  storage.setItem(key, JSON.stringify(value))
}

function removeStorageKey(storage: Pick<Storage, 'removeItem'> | undefined, key: string): void {
  try {
    storage?.removeItem(key)
  } catch {
    // Diagnostics must never make app interactions fail.
  }
}

function getBrowserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function hasElectronDiagnosticsApi(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean(
    window.electronAPI?.appendDiagnosticLogEntry &&
    window.electronAPI?.listDiagnosticLogDays &&
    window.electronAPI?.readDiagnosticLogEntries,
  )
}

function notifyDiagnosticLogChange(entry: DiagnosticLogEntry): void {
  listeners.forEach((listener) => listener(entry))
}

function readBrowserDiagnosticDays(storage = getBrowserStorage()): string[] {
  if (!storage) return []
  return orderDiagnosticDaysForDisplay(readJsonArray(storage, DIAGNOSTIC_LOG_DAYS_STORAGE_KEY).filter(isDiagnosticDayKey))
}

function writeBrowserDiagnosticDays(days: string[], storage: Storage): string[] {
  const retainedDays = orderDiagnosticDaysForDisplay(days).slice(0, DIAGNOSTIC_LOG_RETENTION_DAYS)
  writeJsonArray(storage, DIAGNOSTIC_LOG_DAYS_STORAGE_KEY, retainedDays)
  const retainedDaySet = new Set(retainedDays)
  days.forEach((dayKey) => {
    if (!retainedDaySet.has(dayKey)) removeStorageKey(storage, getDayStorageKey(dayKey))
  })
  return retainedDays
}

function appendBrowserDiagnosticLogEntry(entry: DiagnosticLogEntry, storage = getBrowserStorage()): void {
  if (!storage) return
  const dayKey = entry.dayKey
  const entries = readJsonArray(storage, getDayStorageKey(dayKey))
    .map(normalizeDiagnosticLogEntry)
    .filter((candidate): candidate is DiagnosticLogEntry => Boolean(candidate))
  entries.push(entry)
  writeJsonArray(storage, getDayStorageKey(dayKey), entries.slice(-DIAGNOSTIC_LOG_MAX_ENTRIES_PER_DAY))
  writeBrowserDiagnosticDays([dayKey, ...readBrowserDiagnosticDays(storage)], storage)
}

function deleteBrowserDiagnosticLogDay(dayKey: string, storage = getBrowserStorage()): DiagnosticLogDeleteResult {
  if (!storage) return { ok: true, days: [] }
  if (!isDiagnosticDayKey(dayKey)) return { ok: false, error: 'invalid-day', days: readBrowserDiagnosticDays(storage) }
  removeStorageKey(storage, getDayStorageKey(dayKey))
  return {
    ok: true,
    days: writeBrowserDiagnosticDays(
      readBrowserDiagnosticDays(storage).filter((day) => day !== dayKey),
      storage,
    ),
  }
}

function deleteAllBrowserDiagnosticLogs(storage = getBrowserStorage()): DiagnosticLogDeleteResult {
  if (!storage) return { ok: true, days: [] }
  readBrowserDiagnosticDays(storage).forEach((dayKey) => removeStorageKey(storage, getDayStorageKey(dayKey)))
  removeStorageKey(storage, DIAGNOSTIC_LOG_DAYS_STORAGE_KEY)
  return { ok: true, days: [] }
}

export async function appendDiagnosticLogEntry(entry: DiagnosticLogEntry): Promise<void> {
  try {
    if (hasElectronDiagnosticsApi()) {
      const result = await window.electronAPI!.appendDiagnosticLogEntry!(entry)
      if (result?.ok) {
        notifyDiagnosticLogChange(entry)
        return
      }
    }
    appendBrowserDiagnosticLogEntry(entry)
    notifyDiagnosticLogChange(entry)
  } catch {
    try {
      appendBrowserDiagnosticLogEntry(entry)
      notifyDiagnosticLogChange(entry)
    } catch {
      // Diagnostics should never become user-visible failures.
    }
  }
}

export async function listDiagnosticLogDays(): Promise<string[]> {
  try {
    if (hasElectronDiagnosticsApi()) {
      const result = await window.electronAPI!.listDiagnosticLogDays!()
      if (result?.ok) return orderDiagnosticDaysForDisplay(result.days)
    }
  } catch {
    // Fall back to localStorage below.
  }
  return readBrowserDiagnosticDays()
}

export async function readDiagnosticLogEntries(dayKey: string): Promise<DiagnosticLogEntry[]> {
  if (!isDiagnosticDayKey(dayKey)) return []
  try {
    if (hasElectronDiagnosticsApi()) {
      const result = await window.electronAPI!.readDiagnosticLogEntries!({ dayKey })
      if (result?.ok) {
        return result.entries
          .map(normalizeDiagnosticLogEntry)
          .filter((entry): entry is DiagnosticLogEntry => Boolean(entry))
      }
    }
  } catch {
    // Fall back to localStorage below.
  }

  const storage = getBrowserStorage()
  if (!storage) return []
  return readJsonArray(storage, getDayStorageKey(dayKey))
    .map(normalizeDiagnosticLogEntry)
    .filter((entry): entry is DiagnosticLogEntry => Boolean(entry))
}

export async function deleteDiagnosticLogDay(dayKey: string): Promise<DiagnosticLogDeleteResult> {
  try {
    if (typeof window !== 'undefined' && window.electronAPI?.deleteDiagnosticLogDay) {
      const result = await window.electronAPI.deleteDiagnosticLogDay({ dayKey })
      return result?.ok
        ? { ok: true, days: orderDiagnosticDaysForDisplay(result.days) }
        : {
            ok: false,
            error: result?.error ?? 'delete-failed',
            days: orderDiagnosticDaysForDisplay(result?.days ?? []),
          }
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'delete-failed',
      days: await listDiagnosticLogDays(),
    }
  }
  return deleteBrowserDiagnosticLogDay(dayKey)
}

export async function deleteAllDiagnosticLogs(): Promise<DiagnosticLogDeleteResult> {
  try {
    if (typeof window !== 'undefined' && window.electronAPI?.deleteAllDiagnosticLogs) {
      const result = await window.electronAPI.deleteAllDiagnosticLogs()
      return result?.ok
        ? { ok: true, days: orderDiagnosticDaysForDisplay(result.days) }
        : {
            ok: false,
            error: result?.error ?? 'delete-failed',
            days: orderDiagnosticDaysForDisplay(result?.days ?? []),
          }
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'delete-failed',
      days: await listDiagnosticLogDays(),
    }
  }
  return deleteAllBrowserDiagnosticLogs()
}

export function subscribeDiagnosticLogChanges(listener: DiagnosticLogChangeListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function writeBrowserDiagnosticLogEntriesForTest(
  dayKey: string,
  entries: DiagnosticLogEntry[],
  storage: Storage,
): void {
  if (!isDiagnosticDayKey(dayKey)) return
  writeJsonArray(storage, getDayStorageKey(dayKey), entries.slice(-DIAGNOSTIC_LOG_MAX_ENTRIES_PER_DAY))
  writeBrowserDiagnosticDays([dayKey, ...readBrowserDiagnosticDays(storage)], storage)
}
