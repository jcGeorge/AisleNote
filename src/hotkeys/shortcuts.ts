import type { AppState, ShortcutId } from '../types/app'
import { DEFAULT_COMMAND_SHORTCUTS } from '../commands/app-commands'

export const DEFAULT_SHORTCUTS: Record<ShortcutId, string> = DEFAULT_COMMAND_SHORTCUTS

function normalizeShortcutValue(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : fallback
}

export function normalizeHotkeySettings(raw: unknown): AppState['hotkeys'] {
  const fallback: AppState['hotkeys'] = {
    shortcuts: DEFAULT_SHORTCUTS,
    enableMouseBackForward: true,
    enableGenericHistoryHotkeys: true,
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
    enableMouseBackForward: typeof obj.enableMouseBackForward === 'boolean' ? obj.enableMouseBackForward : true,
    enableGenericHistoryHotkeys:
      typeof obj.enableGenericHistoryHotkeys === 'boolean' ? obj.enableGenericHistoryHotkeys : true,
  }
}

function isModifierToken(token: string): boolean {
  return token === 'mod' || token === 'ctrl' || token === 'meta' || token === 'alt' || token === 'shift'
}

function getEventKeyToken(event: KeyboardEvent): string | null {
  if (event.code === 'Backquote') return 'Backquote'
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
