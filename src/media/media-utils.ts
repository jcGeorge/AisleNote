import { parseAssetUrl } from '../markdown/image-asset-refs.js'
import { getRegisteredAssetMimeType, resolveAssetDisplayUrl } from '../markdown/image-asset-registry'
import { stripMediaMetadataFromUrl } from './media-metadata'

export type MediaKind = 'audio' | 'video'
export type MediaFileLike = {
  type?: string
  name?: string
}
export type MediaKeyboardAction = 'toggle-playback' | 'seek-backward' | 'seek-forward' | 'volume-down' | 'volume-up'
export type MediaKeyboardActionInput = {
  key?: string
  code?: string
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
}

export const MEDIA_SEEK_STEP_SECONDS = 10
export const MEDIA_PLAYER_CLASS_NAME = 'aislenote-media-player'
export const MEDIA_PLAYER_SELECTOR = `.${MEDIA_PLAYER_CLASS_NAME}`
export const MEDIA_PLAYBACK_ERROR_TEXT = 'Could not play media.'
export const MEDIA_LOAD_ERROR_TEXT = 'Could not load media.'

const AUDIO_EXTENSIONS = new Set(['aac', 'flac', 'm4a', 'mp3', 'oga', 'ogg', 'opus', 'wav', 'weba'])
const VIDEO_EXTENSIONS = new Set(['m4v', 'mov', 'mp4', 'ogv', 'webm'])
const MEDIA_URL_HINT_RE = /(?:^data:(?:audio|video)\/|^aislenote-asset:|#aislenote-media=|\.(?:aac|flac|m4a|mp3|oga|ogg|opus|wav|weba|m4v|mov|mp4|ogv|webm)(?:[?#]|$))/i

export function getMediaKindFromMimeType(mimeType: string): MediaKind | null {
  const normalized = mimeType.trim().toLowerCase()
  if (normalized.startsWith('audio/')) return 'audio'
  if (normalized.startsWith('video/')) return 'video'
  return null
}

export function getMediaKindFromFile(file: MediaFileLike): MediaKind | null {
  const mimeKind = file.type ? getMediaKindFromMimeType(file.type) : null
  if (mimeKind) return mimeKind
  return file.name ? getMediaKindFromUrl(file.name) : null
}

export function isPotentialMediaUrl(url: string): boolean {
  const source = String(url ?? '').trim()
  if (!source) return false
  if (/^aislenote-asset:/i.test(source)) return true
  return MEDIA_URL_HINT_RE.test(source)
}

function getExtensionFromUrl(value: string): string {
  const source = String(value ?? '').trim()
  if (!source) return ''

  if (source.startsWith('data:')) return ''

  try {
    const parsed = new URL(source, 'https://aislenote.local')
    const segment = decodeURIComponent(parsed.pathname.split('/').pop() ?? '')
    return segment.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase() ?? ''
  } catch {
    const withoutFragment = source.split('#')[0] ?? ''
    const withoutQuery = withoutFragment.split('?')[0] ?? ''
    return withoutQuery.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase() ?? ''
  }
}

export function getMediaKindFromUrl(url: string): MediaKind | null {
  const rawSource = String(url ?? '').trim()
  if (!isPotentialMediaUrl(rawSource)) return null
  const source = stripMediaMetadataFromUrl(rawSource)
  if (!source) return null

  const dataMimeMatch = source.match(/^data:([^;,]+)/i)
  if (dataMimeMatch) {
    return getMediaKindFromMimeType(dataMimeMatch[1] ?? '')
  }

  const assetPath = parseAssetUrl(source)
  if (assetPath) {
    const registeredKind = getMediaKindFromMimeType(getRegisteredAssetMimeType(assetPath))
    if (registeredKind) return registeredKind
    const assetExtension = assetPath.split('.').pop()?.toLowerCase() ?? ''
    if (AUDIO_EXTENSIONS.has(assetExtension)) return 'audio'
    if (VIDEO_EXTENSIONS.has(assetExtension)) return 'video'
    return null
  }

  const extension = getExtensionFromUrl(source)
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio'
  if (VIDEO_EXTENSIONS.has(extension)) return 'video'
  return null
}

export function resolveMediaDisplayUrl(url: string): string {
  return resolveAssetDisplayUrl(stripMediaMetadataFromUrl(url))
}

export function getMediaDisplayTitle(label: string, kind: MediaKind): string {
  const source = String(label ?? '').trim()
  if (!source) return kind
  const match = source.match(/^(.*)\.([a-zA-Z0-9]+)$/)
  if (!match) return source
  const title = match[1] ?? ''
  const extension = (match[2] ?? '').toLowerCase()
  if (!title) return source
  if (AUDIO_EXTENSIONS.has(extension) || VIDEO_EXTENSIONS.has(extension)) return title
  return source
}

export function formatMediaTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const totalSeconds = Math.floor(seconds)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainingSeconds = totalSeconds % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
  }
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

export function getMediaSeekTime(currentTime: number, deltaSeconds: number, duration?: number): number {
  const current = Number.isFinite(currentTime) ? currentTime : 0
  const delta = Number.isFinite(deltaSeconds) ? deltaSeconds : 0
  const upperBound = Number.isFinite(duration) && Number(duration) > 0 ? Number(duration) : Number.POSITIVE_INFINITY
  return Math.min(Math.max(current + delta, 0), upperBound)
}

export function getMediaSliderDisplayValue(currentTime: number, currentSliderValue: string, pointerActive: boolean): string {
  if (pointerActive) return currentSliderValue
  return String(Number.isFinite(currentTime) ? currentTime : 0)
}

export function getMediaKeyboardAction(input: MediaKeyboardActionInput): MediaKeyboardAction | null {
  if (input.altKey || input.ctrlKey || input.metaKey) return null
  if (input.key === 'ArrowLeft' || input.code === 'ArrowLeft') return 'seek-backward'
  if (input.key === 'ArrowRight' || input.code === 'ArrowRight') return 'seek-forward'
  if (input.key === 'ArrowDown' || input.code === 'ArrowDown') return 'volume-down'
  if (input.key === 'ArrowUp' || input.code === 'ArrowUp') return 'volume-up'
  if (input.key === ' ' || input.key === 'Spacebar' || input.key === 'Space' || input.code === 'Space') {
    return 'toggle-playback'
  }
  return null
}
