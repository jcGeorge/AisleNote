export const MEDIA_PLAYBACK_SETTINGS_SELECTOR = '.aislenote-media-speed-wrap, .aislenote-media-volume-wrap'
export type MediaPlaybackPopupAlignment = 'center' | 'left'

const MEDIA_PLAYBACK_POPUP_GAP_PX = 5
const MEDIA_PLAYBACK_POPUP_VIEWPORT_PADDING_PX = 8

type ClosestCapable = {
  closest?: (selector: string) => unknown
}

type ContainsCapable = {
  contains?: (node: unknown) => boolean
}

type PopoverCapable = HTMLElement & {
  showPopover?: () => void
  hidePopover?: () => void
}

type PopupRect = {
  left: number
  top: number
  width: number
  height: number
}

type PopupSize = {
  width: number
  height: number
}

type PopupViewport = {
  width: number
  height: number
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(Math.max(value, min), max)
}

export function getMediaPlaybackSettingsElement(target: EventTarget | null): unknown {
  if (!target) return null
  const closest = (target as ClosestCapable).closest
  if (typeof closest !== 'function') return null
  return closest.call(target, MEDIA_PLAYBACK_SETTINGS_SELECTOR) ?? null
}

export function isMediaPlaybackSettingsTarget(target: EventTarget | null): boolean {
  return Boolean(getMediaPlaybackSettingsElement(target))
}

export function isMediaPlaybackSettingsTargetForPlayer(
  player: EventTarget | null,
  target: EventTarget | null,
): boolean {
  if (!player) return false
  const settingsElement = getMediaPlaybackSettingsElement(target)
  if (!settingsElement) return false
  const contains = (player as ContainsCapable).contains
  return typeof contains === 'function' ? contains.call(player, settingsElement) : false
}

export function getMediaPlaybackPopupFixedPosition(
  anchorRect: PopupRect,
  popupSize: PopupSize,
  viewport: PopupViewport,
  alignment: MediaPlaybackPopupAlignment,
): { left: number; top: number } {
  const rawLeft =
    alignment === 'left'
      ? anchorRect.left
      : anchorRect.left + anchorRect.width / 2 - popupSize.width / 2
  return {
    left: clamp(
      rawLeft,
      MEDIA_PLAYBACK_POPUP_VIEWPORT_PADDING_PX,
      viewport.width - popupSize.width - MEDIA_PLAYBACK_POPUP_VIEWPORT_PADDING_PX,
    ),
    top: clamp(
      anchorRect.top - popupSize.height - MEDIA_PLAYBACK_POPUP_GAP_PX,
      MEDIA_PLAYBACK_POPUP_VIEWPORT_PADDING_PX,
      viewport.height - popupSize.height - MEDIA_PLAYBACK_POPUP_VIEWPORT_PADDING_PX,
    ),
  }
}

function isPopoverOpen(element: HTMLElement): boolean {
  try {
    return typeof element.matches === 'function' && element.matches(':popover-open')
  } catch {
    return false
  }
}

function hidePopupElement(element: HTMLElement) {
  const popup = element as PopoverCapable
  if (typeof popup.hidePopover === 'function' && isPopoverOpen(element)) {
    try {
      popup.hidePopover()
    } catch {
      // Fall back to hidden positioning below.
    }
  }
  element.hidden = true
  element.removeAttribute('data-aislenote-media-popup-open')
  element.style.removeProperty('position')
  element.style.removeProperty('left')
  element.style.removeProperty('right')
  element.style.removeProperty('top')
  element.style.removeProperty('bottom')
  element.style.removeProperty('transform')
  element.style.removeProperty('margin')
}

export function syncMediaPlaybackPopupElement(
  element: HTMLElement | null,
  anchor: HTMLElement | null,
  open: boolean,
  alignment: MediaPlaybackPopupAlignment,
) {
  if (!element) return
  if (!open || !anchor) {
    hidePopupElement(element)
    return
  }

  element.hidden = false
  element.setAttribute('data-aislenote-media-popup-open', 'true')
  const popup = element as PopoverCapable
  if (typeof popup.showPopover === 'function' && !isPopoverOpen(element)) {
    try {
      popup.showPopover()
    } catch {
      // The fixed fallback still handles stacking where popover is unavailable.
    }
  }

  const ownerWindow = element.ownerDocument.defaultView
  const viewport = {
    width: ownerWindow?.innerWidth ?? element.ownerDocument.documentElement.clientWidth,
    height: ownerWindow?.innerHeight ?? element.ownerDocument.documentElement.clientHeight,
  }
  const anchorRect = anchor.getBoundingClientRect()
  const popupRect = element.getBoundingClientRect()
  const popupSize = {
    width: popupRect.width || element.offsetWidth,
    height: popupRect.height || element.offsetHeight,
  }
  const position = getMediaPlaybackPopupFixedPosition(anchorRect, popupSize, viewport, alignment)
  element.style.position = 'fixed'
  element.style.left = `${position.left}px`
  element.style.right = 'auto'
  element.style.top = `${position.top}px`
  element.style.bottom = 'auto'
  element.style.transform = 'none'
  element.style.margin = '0'
}
