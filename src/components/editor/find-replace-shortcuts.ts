export type SearchShortcutTarget = 'note' | 'sidebar'

type SearchShortcutEvent = Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>

export function getSearchShortcutTarget(
  event: SearchShortcutEvent,
  isMacPlatform: boolean,
): SearchShortcutTarget | null {
  if (event.altKey || event.key.toLowerCase() !== 'f') return null
  const hasPlatformModifier = isMacPlatform
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey
  if (!hasPlatformModifier) return null
  return event.shiftKey ? 'sidebar' : 'note'
}
