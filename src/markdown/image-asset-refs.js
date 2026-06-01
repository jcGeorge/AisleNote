export const IMAGE_ASSET_URL_SCHEME = 'tabs-asset:'
export const IMAGE_ASSET_URL_PREFIX = 'tabs-asset:///'
export const IMAGE_MARKDOWN_PATTERN = /!\[((?:\\.|[^\]\\])*)\]\(([^)]+)\)/g
export const MARKDOWN_LINK_PATTERN = /(!?)\[((?:\\.|[^\]\\])*)\]\(([^)]+)\)/g

export function normalizeImageAssetPath(value) {
  const source = String(value ?? '').replace(/\\/g, '/').trim()
  const withoutLeadingRoot = source.replace(/^\/+/, '').replace(/^notes\//, '')
  const segments = withoutLeadingRoot
    .split('/')
    .filter((segment) => segment.length > 0 && segment !== '.')
    .reduce((acc, segment) => {
      if (segment === '..') return acc
      acc.push(segment)
      return acc
    }, [])
  return segments.join('/')
}

export function buildImageAssetUrl(assetPath) {
  const normalizedPath = normalizeImageAssetPath(assetPath)
  return normalizedPath ? `${IMAGE_ASSET_URL_PREFIX}${encodeURI(normalizedPath)}` : ''
}

export const normalizeAssetPath = normalizeImageAssetPath
export const buildAssetUrl = buildImageAssetUrl

export function parseImageAssetUrl(url) {
  const source = String(url ?? '').trim()
  if (!source.startsWith(IMAGE_ASSET_URL_SCHEME)) return null

  try {
    const parsed = new URL(source)
    const rawPath = parsed.hostname
      ? `${parsed.hostname}${parsed.pathname}`
      : parsed.pathname
    const normalizedPath = normalizeImageAssetPath(decodeURIComponent(rawPath))
    return normalizedPath || null
  } catch {
    const withoutPrefix = source.startsWith(IMAGE_ASSET_URL_PREFIX)
      ? source.slice(IMAGE_ASSET_URL_PREFIX.length)
      : source.slice(IMAGE_ASSET_URL_SCHEME.length)
    const normalizedPath = normalizeImageAssetPath(decodeURIComponent(withoutPrefix.split('#')[0] ?? ''))
    return normalizedPath || null
  }
}

export const parseAssetUrl = parseImageAssetUrl

export function isImageAssetUrl(url) {
  return parseImageAssetUrl(url) !== null
}

export const isAssetUrl = isImageAssetUrl

export function rewriteMarkdownImageSources(markdown, mapSource) {
  return String(markdown ?? '').replace(IMAGE_MARKDOWN_PATTERN, (fullMatch, altText, srcRaw) => {
    const nextSource = mapSource(String(srcRaw ?? '').trim(), { altText, fullMatch })
    return typeof nextSource === 'string' && nextSource.length > 0 ? `![${altText}](${nextSource})` : fullMatch
  })
}

export function rewriteMarkdownLinkSources(markdown, mapSource) {
  return String(markdown ?? '').replace(MARKDOWN_LINK_PATTERN, (fullMatch, imageBang, label, srcRaw) => {
    const nextSource = mapSource(String(srcRaw ?? '').trim(), {
      label,
      image: imageBang === '!',
      fullMatch,
    })
    return typeof nextSource === 'string' && nextSource.length > 0
      ? `${imageBang}[${label}](${nextSource})`
      : fullMatch
  })
}
