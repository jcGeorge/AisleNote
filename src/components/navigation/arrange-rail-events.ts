import type { SelectionClickModifiers } from '../../types/app'

type ArrangeRailModifierEvent = {
  shiftKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
}

type ArrangeRailPointerDownOptions = ArrangeRailModifierEvent & {
  button: number
  disabled?: boolean
}

export type ArrangeRailPointerDownAction = 'ignore' | 'clear-press-timer' | 'track-arrange'

export type ArrangeRailContextMenuPolicy =
  | { action: 'ignore' }
  | { action: 'open-menu'; cancelArrange: boolean; forceMenu: boolean }

export function getSelectionClickModifiers(event: ArrangeRailModifierEvent): SelectionClickModifiers {
  return {
    shiftKey: Boolean(event.shiftKey),
    ctrlKey: Boolean(event.ctrlKey),
    metaKey: Boolean(event.metaKey),
  }
}

export function hasArrangeSelectionModifier(event: ArrangeRailModifierEvent): boolean {
  return Boolean(event.shiftKey || event.ctrlKey || event.metaKey)
}

export function getArrangeRailPointerDownAction({
  button,
  disabled = false,
  ...event
}: ArrangeRailPointerDownOptions): ArrangeRailPointerDownAction {
  if (disabled || button !== 0) return 'ignore'
  return hasArrangeSelectionModifier(event) ? 'clear-press-timer' : 'track-arrange'
}

export function getArrangeRailContextMenuPolicy({
  disabled = false,
  arrangeActive,
}: {
  disabled?: boolean
  arrangeActive: boolean
}): ArrangeRailContextMenuPolicy {
  if (disabled) return { action: 'ignore' }
  return {
    action: 'open-menu',
    cancelArrange: arrangeActive,
    forceMenu: arrangeActive,
  }
}
