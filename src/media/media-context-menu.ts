import { parseAssetUrl } from '../markdown/image-asset-refs.js'
import { MEDIA_PLAYER_SELECTOR, getMediaKindFromUrl, type MediaKind } from './media-utils'

export const MEDIA_REVEAL_CONTEXT_MENU_EVENT = 'aislenote-media-reveal-context-menu'

export type MediaRevealContextMenuDetail = {
  x: number
  y: number
  source: string
  kind: MediaKind
}

export function getMediaRevealTargetFromPlayer(mediaPlayer: Element | null): { source: string; kind: MediaKind } | null {
  if (!mediaPlayer) return null
  const source = mediaPlayer.getAttribute('data-media-source')?.trim() ?? ''
  if (!source || !parseAssetUrl(source)) return null

  const detectedKind = getMediaKindFromUrl(source)
  const declaredKind = mediaPlayer.getAttribute('data-media-kind')
  const kind = declaredKind === 'audio' || declaredKind === 'video' ? declaredKind : detectedKind
  if (!kind || detectedKind !== kind) return null
  return { source, kind }
}

export function getMediaRevealContextMenuDetailFromTarget(
  target: Element | null,
  x: number,
  y: number,
): MediaRevealContextMenuDetail | null {
  const mediaPlayer = target?.closest(MEDIA_PLAYER_SELECTOR) ?? null
  const revealTarget = getMediaRevealTargetFromPlayer(mediaPlayer)
  return revealTarget ? { ...revealTarget, x, y } : null
}

export function dispatchMediaRevealContextMenuEvent(target: Element, detail: MediaRevealContextMenuDetail): boolean {
  const ownerWindow = target.ownerDocument?.defaultView
  if (!ownerWindow) return false
  return ownerWindow.dispatchEvent(
    new CustomEvent<MediaRevealContextMenuDetail>(MEDIA_REVEAL_CONTEXT_MENU_EVENT, {
      detail,
    }),
  )
}
