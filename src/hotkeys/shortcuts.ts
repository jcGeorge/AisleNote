import type { AppState, NewlineOperationId, NewlineShortcutId, ShortcutId } from '../types/app'
import { DEFAULT_COMMAND_SHORTCUTS } from '../commands/app-commands'

export const DEFAULT_SHORTCUTS: Record<ShortcutId, string> = DEFAULT_COMMAND_SHORTCUTS

export const NEWLINE_OPERATIONS: Array<{ id: NewlineOperationId; label: string }> = [
  { id: 'normalNewLine', label: 'normal new line' },
  { id: 'task', label: 'task' },
  { id: 'dashList', label: 'dash list' },
  { id: 'bulletList', label: 'bullet list' },
  { id: 'numberedList', label: 'numbered list' },
  { id: 'aisle', label: 'aisle' },
  { id: 'horizontalLine', label: 'horizontal line' },
  { id: 'codeBlock', label: 'code block' },
  { id: 'inlineCode', label: 'inline code block' },
  { id: 'blockQuote', label: 'block quote' },
  { id: 'blockIndent', label: 'block indent' },
  { id: 'strikethrough', label: 'strikethrough' },
  { id: 'operationsMenu', label: 'shortcut menu' },
]

export const NEWLINE_OPERATION_LABELS = NEWLINE_OPERATIONS.reduce<Record<NewlineOperationId, string>>(
  (labels, operation) => ({
    ...labels,
    [operation.id]: operation.label,
  }),
  {} as Record<NewlineOperationId, string>,
)

export const SHORTCUT_MENU_ELIGIBLE_OPERATIONS: NewlineOperationId[] = [
  'task',
  'dashList',
  'bulletList',
  'numberedList',
  'aisle',
  'horizontalLine',
  'codeBlock',
  'inlineCode',
  'blockQuote',
  'blockIndent',
  'strikethrough',
]

const DEFAULT_SHORTCUT_MENU_OPERATIONS: NewlineOperationId[] = [
  'task',
  'dashList',
  'bulletList',
  'numberedList',
  'aisle',
  'horizontalLine',
  'codeBlock',
  'inlineCode',
  'blockQuote',
  'strikethrough',
]

export const DEFAULT_NEWLINE_SHORTCUT_SETTINGS: AppState['hotkeys']['newlineShortcuts'] = {
  shortcuts: {
    controlEnter: 'aisle',
    shiftEnter: 'task',
    commandEnter: 'operationsMenu',
  },
  menuOperations: DEFAULT_SHORTCUT_MENU_OPERATIONS,
}

const NEWLINE_OPERATION_IDS = new Set<NewlineOperationId>(NEWLINE_OPERATIONS.map((operation) => operation.id))
const SHORTCUT_MENU_ELIGIBLE_OPERATION_IDS = new Set<NewlineOperationId>(SHORTCUT_MENU_ELIGIBLE_OPERATIONS)

function normalizeShortcutValue(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : fallback
}

export function normalizeHotkeySettings(raw: unknown): AppState['hotkeys'] {
  const fallback: AppState['hotkeys'] = {
    shortcuts: DEFAULT_SHORTCUTS,
    newlineShortcuts: DEFAULT_NEWLINE_SHORTCUT_SETTINGS,
  }
  if (!raw || typeof raw !== 'object') return fallback
  const obj = raw as Record<string, unknown>
  const rawShortcuts = obj.shortcuts && typeof obj.shortcuts === 'object' ? (obj.shortcuts as Record<string, unknown>) : {}

  const shortcuts = Object.entries(DEFAULT_SHORTCUTS).reduce<Record<ShortcutId, string>>((acc, [key, value]) => {
    const shortcutKey = key as ShortcutId
    acc[shortcutKey] = normalizeShortcutValue(rawShortcuts[key], value)
    return acc
  }, {} as Record<ShortcutId, string>)

  return {
    shortcuts,
    newlineShortcuts: normalizeNewlineShortcutSettings(obj.newlineShortcuts),
  }
}

function normalizeNewlineOperation(value: unknown, fallback: NewlineOperationId): NewlineOperationId {
  return typeof value === 'string' && NEWLINE_OPERATION_IDS.has(value as NewlineOperationId)
    ? (value as NewlineOperationId)
    : fallback
}

function normalizeNewlineShortcutSettings(raw: unknown): AppState['hotkeys']['newlineShortcuts'] {
  if (!raw || typeof raw !== 'object') return DEFAULT_NEWLINE_SHORTCUT_SETTINGS
  const obj = raw as Record<string, unknown>
  const rawShortcutMap =
    obj.shortcuts && typeof obj.shortcuts === 'object' ? (obj.shortcuts as Record<string, unknown>) : {}
  const rawMenuOperations = Array.isArray(obj.menuOperations) ? obj.menuOperations : []
  const menuOperations = rawMenuOperations.filter(
    (operation): operation is NewlineOperationId =>
      typeof operation === 'string' &&
      SHORTCUT_MENU_ELIGIBLE_OPERATION_IDS.has(operation as NewlineOperationId),
  )
  const dedupedMenuOperations = Array.from(new Set(menuOperations)).slice(0, 10)
  const normalizedMenuOperations =
    dedupedMenuOperations.length > 0 ? [...dedupedMenuOperations] : [...DEFAULT_NEWLINE_SHORTCUT_SETTINGS.menuOperations]
  if (!normalizedMenuOperations.includes('strikethrough') && normalizedMenuOperations.length < 10) {
    normalizedMenuOperations.push('strikethrough')
  }

  return {
    shortcuts: {
      controlEnter: normalizeNewlineOperation(
        rawShortcutMap.controlEnter,
        DEFAULT_NEWLINE_SHORTCUT_SETTINGS.shortcuts.controlEnter,
      ),
      shiftEnter: normalizeNewlineOperation(
        rawShortcutMap.shiftEnter,
        DEFAULT_NEWLINE_SHORTCUT_SETTINGS.shortcuts.shiftEnter,
      ),
      commandEnter: normalizeNewlineOperation(
        rawShortcutMap.commandEnter,
        DEFAULT_NEWLINE_SHORTCUT_SETTINGS.shortcuts.commandEnter,
      ),
    },
    menuOperations: normalizedMenuOperations,
  }
}

function isModifierToken(token: string): boolean {
  return token === 'mod' || token === 'ctrl' || token === 'meta' || token === 'alt' || token === 'shift'
}

function getEventKeyToken(event: KeyboardEvent): string | null {
  if (event.code === 'Backquote') return 'Backquote'
  if (event.code === 'BracketLeft') return '['
  if (event.code === 'BracketRight') return ']'
  if (event.key === 'Tab') return 'Tab'
  if (event.key.length === 1) return event.key.toUpperCase()
  return null
}

export function eventMatchesShortcut(event: KeyboardEvent, shortcut: string, isMac: boolean): boolean {
  const tokens = shortcut
    .split('+')
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0)
  if (tokens.length === 0) return false

  const keyToken = tokens.find((token) => !isModifierToken(token))
  if (!keyToken) return false

  const requiresMod = tokens.includes('mod')
  const requiresCtrl = tokens.includes('ctrl')
  const requiresMeta = tokens.includes('meta')
  const requiresAlt = tokens.includes('alt')
  const requiresShift = tokens.includes('shift')

  const expectedCtrl = requiresCtrl || (requiresMod && !isMac)
  const expectedMeta = requiresMeta || (requiresMod && isMac)

  if (event.ctrlKey !== expectedCtrl) return false
  if (event.metaKey !== expectedMeta) return false
  if (event.altKey !== requiresAlt) return false
  if (event.shiftKey !== requiresShift) return false

  const eventToken = getEventKeyToken(event)
  if (!eventToken) return false
  return eventToken.toLowerCase() === keyToken
}

export function buildShortcutFromKeyboardEvent(event: KeyboardEvent, isMac: boolean): string | null {
  const keyToken = getEventKeyToken(event)
  if (!keyToken) return null

  const parts: string[] = []
  const usesPrimaryMod = isMac ? event.metaKey : event.ctrlKey
  if (usesPrimaryMod) parts.push('Mod')
  if (event.ctrlKey && !(usesPrimaryMod && !isMac)) parts.push('Ctrl')
  if (event.metaKey && !(usesPrimaryMod && isMac)) parts.push('Meta')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  parts.push(keyToken)
  return parts.join('+')
}

export function formatShortcutLabel(shortcut: string, isMac: boolean): string {
  return shortcut
    .split('+')
    .map((token) => {
      const lower = token.toLowerCase()
      if (lower === 'mod') return isMac ? 'cmd' : 'ctrl'
      if (lower === 'meta') return 'cmd'
      if (lower === 'ctrl') return 'ctrl'
      if (lower === 'alt') return isMac ? 'option' : 'alt'
      if (lower === 'shift') return 'shift'
      if (lower === 'backquote') return '`'
      return token.length === 1 ? token.toLowerCase() : token.toLowerCase()
    })
    .join('+')
}

export function formatFixedNewlineShortcutLabel(shortcutId: NewlineShortcutId, isMac: boolean): string {
  if (shortcutId === 'shiftEnter') return 'shift+enter'
  if (shortcutId === 'controlEnter') return isMac ? 'ctrl+enter' : 'alt+enter'
  return isMac ? 'cmd+enter' : 'ctrl+enter'
}

export function getNewlineShortcutIdForEvent(event: KeyboardEvent, isMac: boolean): NewlineShortcutId | null {
  if (event.key !== 'Enter') return null

  if (!event.ctrlKey && !event.metaKey && !event.altKey && event.shiftKey) return 'shiftEnter'

  if (isMac) {
    if (event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) return 'controlEnter'
    if (event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) return 'commandEnter'
    return null
  }

  if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) return 'controlEnter'
  if (event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) return 'commandEnter'
  return null
}
