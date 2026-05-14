export type ImageResizeMetadata = {
  v: 1
  w: number
}

export const IMAGE_RESIZE_METADATA_FRAGMENT_PREFIX = '#tabs-image='

function normalizeImageResizeWidth(value: unknown): number | null {
  const width = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(width)) return null
  const rounded = Math.round(width)
  return rounded > 0 ? rounded : null
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function decodeBase64Url(value: string): string | null {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}

export function parseImageResizeMetadataFragment(fragment: string): ImageResizeMetadata | null {
  if (!fragment.startsWith(IMAGE_RESIZE_METADATA_FRAGMENT_PREFIX)) return null
  const decoded = decodeBase64Url(fragment.slice(IMAGE_RESIZE_METADATA_FRAGMENT_PREFIX.length))
  if (!decoded) return null

  try {
    const raw = JSON.parse(decoded) as Partial<ImageResizeMetadata>
    const width = normalizeImageResizeWidth(raw.w)
    if (raw.v !== 1 || !width) return null
    return { v: 1, w: width }
  } catch {
    return null
  }
}

export function buildImageResizeMetadataFragment(metadata: ImageResizeMetadata): string {
  return `${IMAGE_RESIZE_METADATA_FRAGMENT_PREFIX}${encodeBase64Url(JSON.stringify({ v: 1, w: metadata.w }))}`
}

export function splitImageResizeMetadataFromUrl(url: string): {
  imageUrl: string
  metadata: ImageResizeMetadata | null
  metadataFragment: string
} {
  const source = String(url ?? '')
  const index = source.indexOf(IMAGE_RESIZE_METADATA_FRAGMENT_PREFIX)
  if (index < 0) {
    return { imageUrl: source, metadata: null, metadataFragment: '' }
  }

  const metadataFragment = source.slice(index)
  return {
    imageUrl: source.slice(0, index),
    metadata: parseImageResizeMetadataFragment(metadataFragment),
    metadataFragment,
  }
}

export function stripImageResizeMetadataFromUrl(url: string): string {
  return splitImageResizeMetadataFromUrl(url).imageUrl
}

export function getImageResizeMetadata(url: string): ImageResizeMetadata | null {
  return splitImageResizeMetadataFromUrl(url).metadata
}

export function withImageResizeMetadata(url: string, metadata: ImageResizeMetadata): string {
  const width = normalizeImageResizeWidth(metadata.w)
  const imageUrl = stripImageResizeMetadataFromUrl(url)
  if (!width) return imageUrl
  return `${imageUrl}${buildImageResizeMetadataFragment({ v: 1, w: width })}`
}
