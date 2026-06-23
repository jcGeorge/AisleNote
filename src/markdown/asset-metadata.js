import { normalizeImageResizeMetadataFragment } from './image-metadata-core.js'

const IMAGE_METADATA_FRAGMENT_PREFIX = '#aislenote-image='
const MEDIA_METADATA_FRAGMENT_PREFIX = '#aislenote-media='

export function splitAssetMetadataFromUrl(url) {
  const source = String(url ?? '')
  const imageIndex = source.indexOf(IMAGE_METADATA_FRAGMENT_PREFIX)
  const mediaIndex = source.indexOf(MEDIA_METADATA_FRAGMENT_PREFIX)
  const indexes = [imageIndex, mediaIndex].filter((index) => index >= 0)
  if (indexes.length === 0) {
    return { assetUrl: source, metadataFragment: '' }
  }

  const index = Math.min(...indexes)
  const metadataFragment = source.slice(index)
  return {
    assetUrl: source.slice(0, index),
    metadataFragment: metadataFragment.startsWith(IMAGE_METADATA_FRAGMENT_PREFIX)
      ? normalizeImageResizeMetadataFragment(metadataFragment)
      : metadataFragment,
  }
}
