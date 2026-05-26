import {
  IMAGE_RESIZE_METADATA_FRAGMENT_PREFIX,
  buildImageResizeMetadataFragment as buildImageResizeMetadataFragmentCore,
  normalizeImageResizeMetadataFragment as normalizeImageResizeMetadataFragmentCore,
  parseImageResizeMetadataFragment as parseImageResizeMetadataFragmentCore,
} from './image-metadata-core.js'

export type ImageResizeMetadata = {
  v: 1
  w: number
  r?: 0 | 90 | 180 | 270
  fh?: boolean
  fv?: boolean
}

function normalizeImageResizeWidth(value: unknown): number | null {
  const width = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(width)) return null
  const rounded = Math.round(width)
  return rounded > 0 ? rounded : null
}

export { IMAGE_RESIZE_METADATA_FRAGMENT_PREFIX }

export function parseImageResizeMetadataFragment(fragment: string): ImageResizeMetadata | null {
  return parseImageResizeMetadataFragmentCore(fragment) as ImageResizeMetadata | null
}

export function buildImageResizeMetadataFragment(metadata: ImageResizeMetadata): string {
  return buildImageResizeMetadataFragmentCore(metadata)
}

export function normalizeImageResizeMetadataFragment(fragment: string): string {
  return normalizeImageResizeMetadataFragmentCore(fragment)
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
  return `${imageUrl}${buildImageResizeMetadataFragment({ ...metadata, v: 1, w: width })}`
}
