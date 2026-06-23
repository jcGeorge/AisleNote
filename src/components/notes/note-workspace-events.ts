export function shouldExitArrangeModeFromNoteWorkspacePointer(arrangeModeActive: boolean, button: number) {
  return arrangeModeActive && button === 0
}

export function shouldActivateAisleFromNoteWorkspacePointer(button: number) {
  return button === 0
}

export function scheduleNoteWorkspaceArrangeExit(onExitArrangeMode: (() => void) | undefined) {
  if (!onExitArrangeMode) return
  window.setTimeout(onExitArrangeMode, 0)
}

export function getAisleActivationPointerFromNoteWorkspaceEvent(
  event: Pick<PointerEvent, 'button' | 'clientX' | 'clientY'>,
): { clientX: number; clientY: number; mode: 'coordinate' } | undefined {
  return event.button === 0 ? { clientX: event.clientX, clientY: event.clientY, mode: 'coordinate' } : undefined
}

type ClosestCapableTarget = {
  closest: (selector: string) => DomElementLike | null
}

const AISLE_ACTIVATION_SUPPRESS_SELECTOR = '[data-note-workspace-skip-aisle-activation="true"]'
const AISLE_ACTIVATION_RIGHT_SIDE_BLOCK_SELECTOR = 'table, img'
const AISLE_ACTIVATION_INTERACTIVE_SIDE_TARGET_SELECTOR = [
  'a',
  'button',
  'input',
  'textarea',
  'select',
  'img',
  '[contenteditable="false"]',
  '.image-tools',
  '.media-tools',
  '.table-tools',
  '.table-selector-segment',
  '.link-prompt',
  '.aislenote-media-player',
].join(', ')
const AISLE_ACTIVATION_TEXT_BLOCK_SELECTOR = 'p, li, h1, h2, h3, h4, h5, h6, blockquote, pre'

type DomElementLike = {
  closest?: (selector: string) => DomElementLike | null
  contains?: (target: unknown) => boolean
  dataset?: { aisleEditorKey?: string }
  getBoundingClientRect?: () => {
    top?: number
    left?: number
    right?: number
    bottom?: number
    width?: number
    height?: number
  }
  matches?: (selector: string) => boolean
  parentElement?: EventTarget | null
  querySelectorAll?: (selector: string) => ArrayLike<DomElementLike> | Iterable<DomElementLike>
  tagName?: string
  textContent?: string | null
}

function canResolveClosestElement(target: EventTarget | null): target is EventTarget & ClosestCapableTarget {
  return Boolean(target && typeof (target as Partial<ClosestCapableTarget>).closest === 'function')
}

function getClosestCapableTarget(target: EventTarget | null): ClosestCapableTarget | null {
  if (canResolveClosestElement(target)) return target
  const parentElement = (target as { parentElement?: EventTarget | null } | null)?.parentElement ?? null
  return canResolveClosestElement(parentElement) ? parentElement : null
}

function closestDomElement(target: DomElementLike | null | undefined, selector: string): DomElementLike | null {
  if (typeof target?.closest !== 'function') return null
  try {
    return target.closest(selector)
  } catch {
    return null
  }
}

function matchesDomElement(target: DomElementLike | null | undefined, selector: string): boolean {
  if (typeof target?.matches !== 'function') {
    const tagName = String(target?.tagName ?? '').toLowerCase()
    return selector.split(',').some((part) => part.trim().toLowerCase() === tagName)
  }
  try {
    return target.matches(selector)
  } catch {
    return false
  }
}

function getElementRect(element: DomElementLike) {
  if (typeof element.getBoundingClientRect !== 'function') return null
  const rawRect = element.getBoundingClientRect()
  const left = Number(rawRect.left)
  const top = Number(rawRect.top)
  const width = Number(rawRect.width ?? Number(rawRect.right) - left)
  const height = Number(rawRect.height ?? Number(rawRect.bottom) - top)
  const right = Number(rawRect.right ?? left + width)
  const bottom = Number(rawRect.bottom ?? top + height)
  if (
    !Number.isFinite(left) ||
    !Number.isFinite(top) ||
    !Number.isFinite(right) ||
    !Number.isFinite(bottom) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null
  }
  return { left, top, right, bottom }
}

function hasMeaningfulRenderedText(element: DomElementLike | null): boolean {
  return String(element?.textContent ?? '')
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
    .trim().length > 0
}

function isLikelyBlankRightSideTarget(editorRoot: DomElementLike, target: DomElementLike): boolean {
  if (target !== editorRoot && typeof editorRoot.contains === 'function' && !editorRoot.contains(target)) return false
  if (closestDomElement(target, AISLE_ACTIVATION_SUPPRESS_SELECTOR)) return false
  if (closestDomElement(target, AISLE_ACTIVATION_INTERACTIVE_SIDE_TARGET_SELECTOR)) return false
  if (closestDomElement(target, 'table')) return false

  const textBlock = closestDomElement(target, AISLE_ACTIVATION_TEXT_BLOCK_SELECTOR)
  return !textBlock || !hasMeaningfulRenderedText(textBlock)
}

function isRightSideRenderedBlock(element: DomElementLike, point: { clientX: number; clientY: number }, edgePadding = 2) {
  const rect = getElementRect(element)
  if (!rect || !Number.isFinite(point.clientX) || !Number.isFinite(point.clientY)) return false
  return point.clientX > rect.right + edgePadding && point.clientY >= rect.top && point.clientY <= rect.bottom
}

function getQueryableElements(editorRoot: DomElementLike, selector: string): DomElementLike[] {
  if (typeof editorRoot.querySelectorAll !== 'function') return []
  try {
    return Array.from(editorRoot.querySelectorAll(selector) as Iterable<DomElementLike> | ArrayLike<DomElementLike>)
  } catch {
    return []
  }
}

export function getAisleEditorKeyFromNoteWorkspacePointerTarget(target: EventTarget | null) {
  const closestTarget = getClosestCapableTarget(target)
  if (!closestTarget) return ''
  if (closestTarget.closest(AISLE_ACTIVATION_SUPPRESS_SELECTOR)) return ''
  return closestTarget.closest('[data-aisle-editor-key]')?.dataset?.aisleEditorKey ?? ''
}

export function getRightSideBlockGutterTarget(
  target: EventTarget | null,
  point: { clientX: number; clientY: number },
): 'table' | 'image' | null {
  const closestTarget = getClosestCapableTarget(target) as DomElementLike | null
  if (!closestTarget) return null
  const editorRoot = closestDomElement(closestTarget, '[data-aisle-editor-key]')
  if (!editorRoot || !isLikelyBlankRightSideTarget(editorRoot, closestTarget)) return null

  for (const element of getQueryableElements(editorRoot, AISLE_ACTIVATION_RIGHT_SIDE_BLOCK_SELECTOR)) {
    if (!isRightSideRenderedBlock(element, point)) continue
    if (matchesDomElement(element, 'img')) {
      const paragraph = closestDomElement(element, 'p')
      if (paragraph && !hasMeaningfulRenderedText(paragraph)) return 'image'
      continue
    }
    if (matchesDomElement(element, 'table')) return 'table'
  }
  return null
}
