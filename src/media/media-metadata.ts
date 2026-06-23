import { parseAssetUrl } from '../markdown/image-asset-refs.js'
import {
  normalizeStoredMediaPlaybackSpeed,
  normalizeStoredMediaVolumePercent,
} from './media-playback-settings'

export const MEDIA_METADATA_FRAGMENT_PREFIX = '#aislenote-media='

export type MediaTransformMetadata = {
  v: 1
  w?: number
  r?: 0 | 90 | 180 | 270
  fh?: boolean
  fv?: boolean
  speed?: number
  volume?: number
}

function normalizeDisplayWidth(value: unknown): number | undefined {
  const width = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(width)) return undefined
  const rounded = Math.round(width)
  return rounded > 0 ? rounded : undefined
}

function normalizeRotation(value: unknown): 0 | 90 | 180 | 270 | undefined {
  const rotation = typeof value === 'number' ? value : Number(value)
  if (rotation === 90 || rotation === 180 || rotation === 270) return rotation
  if (rotation === 0) return undefined
  return undefined
}

export function normalizeMediaTransformMetadata(
  metadata: Partial<MediaTransformMetadata> | null | undefined,
): MediaTransformMetadata | null {
  if (!metadata) return null
  const width = normalizeDisplayWidth(metadata.w)
  const rotation = normalizeRotation(metadata.r)
  const speed = normalizeStoredMediaPlaybackSpeed(metadata.speed)
  const volume = normalizeStoredMediaVolumePercent(metadata.volume)

  const normalized: MediaTransformMetadata = {
    v: 1,
    ...(width ? { w: width } : {}),
    ...(rotation ? { r: rotation } : {}),
    ...(metadata.fh ? { fh: true } : {}),
    ...(metadata.fv ? { fv: true } : {}),
    ...(speed ? { speed } : {}),
    ...(volume !== undefined ? { volume } : {}),
  }

  return Object.keys(normalized).length > 1 ? normalized : null
}

function parseReadableMediaMetadata(value: string): MediaTransformMetadata | null {
  const raw: Partial<MediaTransformMetadata> = { v: 1 }
  const parts = String(value ?? '').split(',').map((part) => part.trim()).filter(Boolean)
  if (parts.length === 0) return null

  for (const part of parts) {
    const separatorIndex = part.indexOf('=')
    const key = separatorIndex >= 0 ? part.slice(0, separatorIndex) : part
    const rawValue = separatorIndex >= 0 ? part.slice(separatorIndex + 1) : ''

    if (key === 'width') raw.w = Number(rawValue)
    else if (key === 'rotate') raw.r = Number(rawValue) as MediaTransformMetadata['r']
    else if (key === 'speed') raw.speed = Number(rawValue)
    else if (key === 'volume') raw.volume = Number(rawValue)
    else if (part === 'flip-horizontal') raw.fh = true
    else if (part === 'flip-vertical') raw.fv = true
    else if (key === 'crop' || key === 'ratio') continue
    else {
      return null
    }
  }

  return normalizeMediaTransformMetadata(raw)
}

export function parseMediaMetadataFragment(fragment: string): MediaTransformMetadata | null {
  if (!String(fragment ?? '').startsWith(MEDIA_METADATA_FRAGMENT_PREFIX)) return null
  return parseReadableMediaMetadata(String(fragment).slice(MEDIA_METADATA_FRAGMENT_PREFIX.length))
}

export function buildMediaMetadataFragment(metadata: Partial<MediaTransformMetadata> | null | undefined): string {
  const normalized = normalizeMediaTransformMetadata(metadata)
  if (!normalized) return ''
  const parts: string[] = []
  if (normalized.w) parts.push(`width=${normalized.w}`)
  if (normalized.r) parts.push(`rotate=${normalized.r}`)
  if (normalized.fh) parts.push('flip-horizontal')
  if (normalized.fv) parts.push('flip-vertical')
  if (normalized.speed) parts.push(`speed=${normalized.speed}`)
  if (normalized.volume !== undefined) parts.push(`volume=${normalized.volume}`)
  return `${MEDIA_METADATA_FRAGMENT_PREFIX}${parts.join(',')}`
}

export function splitMediaMetadataFromUrl(url: string): {
  mediaUrl: string
  metadata: MediaTransformMetadata | null
  metadataFragment: string
} {
  const source = String(url ?? '')
  const index = source.indexOf(MEDIA_METADATA_FRAGMENT_PREFIX)
  if (index < 0) {
    return { mediaUrl: source, metadata: null, metadataFragment: '' }
  }

  const metadataFragment = source.slice(index)
  return {
    mediaUrl: source.slice(0, index),
    metadata: parseMediaMetadataFragment(metadataFragment),
    metadataFragment,
  }
}

export function stripMediaMetadataFromUrl(url: string): string {
  return splitMediaMetadataFromUrl(url).mediaUrl
}

export function getMediaTransformMetadata(url: string): MediaTransformMetadata | null {
  return splitMediaMetadataFromUrl(url).metadata
}

export function withMediaTransformMetadata(
  url: string,
  metadata: Partial<MediaTransformMetadata> | null | undefined,
): string {
  const mediaUrl = stripMediaMetadataFromUrl(url)
  const fragment = buildMediaMetadataFragment(metadata)
  return fragment ? `${mediaUrl}${fragment}` : mediaUrl
}

export function isAisleNoteAssetMediaUrl(url: string): boolean {
  return Boolean(parseAssetUrl(stripMediaMetadataFromUrl(url)))
}
