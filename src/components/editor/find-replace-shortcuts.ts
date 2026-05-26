export type FindReplaceShortcutMode = 'find' | 'replace'

type FindReplaceShortcutEvent = Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>

export function getFindReplaceShortcutMode(
  event: FindReplaceShortcutEvent,
  isMacPlatform: boolean,
): FindReplaceShortcutMode | null {
  if (event.altKey || event.key.toLowerCase() !== 'f') return null
  const hasPlatformModifier = isMacPlatform
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey
  if (!hasPlatformModifier) return null
  return event.shiftKey ? 'replace' : 'find'
}
