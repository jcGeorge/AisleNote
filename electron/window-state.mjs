import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export const WINDOW_STATE_FILE = 'window-state.json'
const WINDOW_STATE_VERSION = 1
const DEFAULT_SAVE_DEBOUNCE_MS = 250
const MINIMUM_VISIBLE_LENGTH = 100
const DEFAULT_FALLBACK_WIDTH = 1200
const DEFAULT_FALLBACK_HEIGHT = 800

export function getWindowStatePath(userDataPath) {
  return path.join(userDataPath, WINDOW_STATE_FILE)
}

function readWindowState(userDataPath) {
  const statePath = getWindowStatePath(userDataPath)
  try {
    if (!existsSync(statePath)) return null
    const parsed = JSON.parse(readFileSync(statePath, 'utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function writeWindowState(userDataPath, state) {
  const statePath = getWindowStatePath(userDataPath)
  mkdirSync(path.dirname(statePath), { recursive: true })
  const tempPath = path.join(path.dirname(statePath), `.${path.basename(statePath)}.${process.pid}.${Date.now()}.tmp`)
  writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  renameSync(tempPath, statePath)
}

function normalizeNumber(value) {
  if (!Number.isFinite(value)) return null
  return Math.round(value)
}

function normalizeBounds(bounds, defaults) {
  if (!bounds || typeof bounds !== 'object') return null
  const x = normalizeNumber(bounds.x)
  const y = normalizeNumber(bounds.y)
  const width = normalizeNumber(bounds.width)
  const height = normalizeNumber(bounds.height)
  if (x === null || y === null || width === null || height === null) return null
  if (width <= 0 || height <= 0) return null
  return {
    x,
    y,
    width: Math.max(width, defaults.minWidth),
    height: Math.max(height, defaults.minHeight),
  }
}

function getDisplayWorkAreas(screen) {
  const displays = typeof screen?.getAllDisplays === 'function' ? screen.getAllDisplays() : []
  return displays
    .map((display) => display?.workArea)
    .filter((workArea) =>
      Number.isFinite(workArea?.x) &&
      Number.isFinite(workArea?.y) &&
      Number.isFinite(workArea?.width) &&
      Number.isFinite(workArea?.height) &&
      workArea.width > 0 &&
      workArea.height > 0
    )
}

function getPrimaryWorkArea(screen) {
  const primaryWorkArea = typeof screen?.getPrimaryDisplay === 'function'
    ? screen.getPrimaryDisplay()?.workArea
    : null
  if (
    Number.isFinite(primaryWorkArea?.x) &&
    Number.isFinite(primaryWorkArea?.y) &&
    Number.isFinite(primaryWorkArea?.width) &&
    Number.isFinite(primaryWorkArea?.height) &&
    primaryWorkArea.width > 0 &&
    primaryWorkArea.height > 0
  ) {
    return primaryWorkArea
  }
  return getDisplayWorkAreas(screen)[0] ?? { x: 0, y: 0, width: DEFAULT_FALLBACK_WIDTH, height: DEFAULT_FALLBACK_HEIGHT }
}

function getCenteredDefaultBounds(screen, defaults) {
  const workArea = getPrimaryWorkArea(screen)
  const width = Math.max(defaults.width, defaults.minWidth)
  const height = Math.max(defaults.height, defaults.minHeight)
  return {
    x: Math.round(workArea.x + Math.max(0, workArea.width - width) / 2),
    y: Math.round(workArea.y + Math.max(0, workArea.height - height) / 2),
    width,
    height,
  }
}

function getVisibleIntersectionLength(start, length, areaStart, areaLength) {
  const end = start + length
  const areaEnd = areaStart + areaLength
  return Math.max(0, Math.min(end, areaEnd) - Math.max(start, areaStart))
}

function isVisibleOnAnyDisplay(bounds, screen) {
  return getDisplayWorkAreas(screen).some((workArea) => {
    const visibleWidth = getVisibleIntersectionLength(bounds.x, bounds.width, workArea.x, workArea.width)
    const visibleHeight = getVisibleIntersectionLength(bounds.y, bounds.height, workArea.y, workArea.height)
    return visibleWidth >= MINIMUM_VISIBLE_LENGTH && visibleHeight >= MINIMUM_VISIBLE_LENGTH
  })
}

export function loadWindowState(userDataPath, screen, defaults) {
  const defaultBounds = getCenteredDefaultBounds(screen, defaults)
  const storedState = readWindowState(userDataPath)
  if (storedState?.version !== WINDOW_STATE_VERSION) {
    return { bounds: defaultBounds, isMaximized: false }
  }
  const bounds = normalizeBounds(storedState?.bounds, defaults)
  if (!bounds || !isVisibleOnAnyDisplay(bounds, screen)) {
    return { bounds: defaultBounds, isMaximized: false }
  }
  return {
    bounds,
    isMaximized: storedState?.isMaximized === true,
  }
}

function getWindowBounds(window) {
  const bounds = typeof window?.getNormalBounds === 'function'
    ? window.getNormalBounds()
    : typeof window?.getBounds === 'function'
      ? window.getBounds()
      : null
  return normalizeBounds(bounds, { minWidth: 1, minHeight: 1 })
}

export function saveWindowState(userDataPath, window) {
  if (typeof window?.isDestroyed === 'function' && window.isDestroyed()) return false
  if (typeof window?.isMinimized === 'function' && window.isMinimized()) return false
  if (typeof window?.isFullScreen === 'function' && window.isFullScreen()) return false

  const bounds = getWindowBounds(window)
  if (!bounds) return false

  try {
    writeWindowState(userDataPath, {
      version: WINDOW_STATE_VERSION,
      bounds,
      isMaximized: typeof window?.isMaximized === 'function' ? window.isMaximized() === true : false,
    })
    return true
  } catch {
    return false
  }
}

export function watchWindowState(userDataPath, window, options = {}) {
  const debounceMs = Number.isFinite(options.debounceMs) ? Math.max(0, options.debounceMs) : DEFAULT_SAVE_DEBOUNCE_MS
  let timeoutId = null
  let closed = false

  const flushSave = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
    if (!closed) saveWindowState(userDataPath, window)
  }

  const scheduleSave = () => {
    if (closed) return
    if (timeoutId !== null) clearTimeout(timeoutId)
    timeoutId = setTimeout(flushSave, debounceMs)
  }

  const events = ['move', 'resize', 'maximize', 'unmaximize']
  events.forEach((eventName) => window?.on?.(eventName, scheduleSave))

  const close = () => {
    if (closed) return
    closed = true
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
    events.forEach((eventName) => window?.removeListener?.(eventName, scheduleSave))
    window?.removeListener?.('closed', close)
  }

  window?.once?.('closed', close)

  return { close, flushSave }
}
