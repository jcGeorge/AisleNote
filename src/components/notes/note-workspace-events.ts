export function shouldExitArrangeModeFromNoteWorkspacePointer(arrangeModeActive: boolean, button: number) {
  return arrangeModeActive && button === 0
}

export function scheduleNoteWorkspaceArrangeExit(onExitArrangeMode: (() => void) | undefined) {
  if (!onExitArrangeMode) return
  window.setTimeout(onExitArrangeMode, 0)
}

type ClosestCapableTarget = {
  closest: (selector: string) => { dataset?: { aisleEditorKey?: string } } | null
}

const AISLE_ACTIVATION_SUPPRESS_SELECTOR = '[data-note-workspace-skip-aisle-activation="true"]'

function canResolveClosestElement(target: EventTarget | null): target is EventTarget & ClosestCapableTarget {
  return Boolean(target && typeof (target as Partial<ClosestCapableTarget>).closest === 'function')
}

function getClosestCapableTarget(target: EventTarget | null): ClosestCapableTarget | null {
  if (canResolveClosestElement(target)) return target
  const parentElement = (target as { parentElement?: EventTarget | null } | null)?.parentElement ?? null
  return canResolveClosestElement(parentElement) ? parentElement : null
}

export function getAisleEditorKeyFromNoteWorkspacePointerTarget(target: EventTarget | null) {
  const closestTarget = getClosestCapableTarget(target)
  if (!closestTarget) return ''
  if (closestTarget.closest(AISLE_ACTIVATION_SUPPRESS_SELECTOR)) return ''
  return closestTarget.closest('[data-aisle-editor-key]')?.dataset?.aisleEditorKey ?? ''
}
