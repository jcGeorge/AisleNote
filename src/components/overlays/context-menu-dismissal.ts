const CONTEXT_MENU_SELECTOR = '.tab-context-menu'

type ClosestTarget = {
  closest?: (selector: string) => unknown
  parentElement?: ClosestTarget | null
}

function closestContextMenu(target: EventTarget | null): unknown {
  if (!target || typeof target !== 'object') return null
  const candidate = target as ClosestTarget
  if (typeof candidate.closest === 'function') return candidate.closest(CONTEXT_MENU_SELECTOR)
  if (typeof candidate.parentElement?.closest === 'function') {
    return candidate.parentElement.closest(CONTEXT_MENU_SELECTOR)
  }
  return null
}

export function shouldDismissContextMenuFromPointerTarget(target: EventTarget | null): boolean {
  return !closestContextMenu(target)
}

export function shouldDismissContextMenuFromKey(key: string): boolean {
  return key === 'Escape'
}
