export const IMAGE_RESIZE_METADATA_FRAGMENT_PREFIX = '#tabs-image='

function normalizeImageResizeWidth(value) {
  const width = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(width)) return null
  const rounded = Math.round(width)
  return rounded > 0 ? rounded : null
}

function normalizeMetadata(raw) {
  const width = normalizeImageResizeWidth(raw?.w ?? raw?.width)
  if (!width) return null
  const rotation = raw?.r ?? raw?.rotate
  const normalizedRotation = rotation === 90 || rotation === 180 || rotation === 270 ? rotation : undefined
  return {
    v: 1,
    w: width,
    ...(normalizedRotation ? { r: normalizedRotation } : {}),
    ...(raw?.fh === true || raw?.flipHorizontal === true ? { fh: true } : {}),
    ...(raw?.fv === true || raw?.flipVertical === true ? { fv: true } : {}),
  }
}

function parseReadableImageResizeMetadata(value) {
  const raw = {}
  const parts = String(value ?? '').split(',').map((part) => part.trim()).filter(Boolean)
  if (parts.length === 0) return null
  for (const part of parts) {
    const [key, rawValue] = part.split('=')
    if (key === 'width') raw.width = rawValue
    else if (key === 'rotate') raw.rotate = Number(rawValue)
    else if (part === 'flip-horizontal') raw.flipHorizontal = true
    else if (part === 'flip-vertical') raw.flipVertical = true
    else return null
  }
  return normalizeMetadata(raw)
}

export function parseImageResizeMetadataFragment(fragment) {
  if (!String(fragment ?? '').startsWith(IMAGE_RESIZE_METADATA_FRAGMENT_PREFIX)) return null
  return parseReadableImageResizeMetadata(String(fragment).slice(IMAGE_RESIZE_METADATA_FRAGMENT_PREFIX.length))
}

export function buildImageResizeMetadataFragment(metadata) {
  const normalized = normalizeMetadata(metadata)
  if (!normalized) return ''
  const parts = [`width=${normalized.w}`]
  if (normalized.r) parts.push(`rotate=${normalized.r}`)
  if (normalized.fh) parts.push('flip-horizontal')
  if (normalized.fv) parts.push('flip-vertical')
  return `${IMAGE_RESIZE_METADATA_FRAGMENT_PREFIX}${parts.join(',')}`
}

export function normalizeImageResizeMetadataFragment(fragment) {
  const metadata = parseImageResizeMetadataFragment(fragment)
  return metadata ? buildImageResizeMetadataFragment(metadata) : String(fragment ?? '')
}
