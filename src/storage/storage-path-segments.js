export const STORAGE_PATH_SEGMENT_MAX_LENGTH = 48
export const STORAGE_PATH_SEGMENT_MAX_BYTES = 180

const STORAGE_PATH_ID_LENGTH = 6
const DEFAULT_FALLBACK = 'item'
const illegalPathCharacters = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*'])

function utf8ByteLength(value) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value).length
  return unescape(encodeURIComponent(value)).length
}

function splitGraphemes(value) {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    return Array.from(segmenter.segment(value), (entry) => entry.segment)
  }
  return Array.from(value)
}

function trimPathSegmentEdges(value) {
  return value.replace(/^\.+|\.+$/g, '').trim()
}

export function sanitizeStoragePathName(value, fallback = DEFAULT_FALLBACK) {
  const normalize = (source) => String(source ?? '')
    .split('')
    .map((character) => (illegalPathCharacters.has(character) || character.charCodeAt(0) < 32 ? ' ' : character))
    .join('')
    .replace(/\s+/g, ' ')
  return trimPathSegmentEdges(normalize(value)) || trimPathSegmentEdges(normalize(fallback)) || DEFAULT_FALLBACK
}

export function createStoragePathShortId(value) {
  const source = String(value ?? '')
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619) >>> 0
  }
  return hash.toString(16).padStart(8, '0').slice(0, STORAGE_PATH_ID_LENGTH)
}

function truncateReadableName(value, maxLength, maxBytes) {
  let nextValue = ''
  let nextLength = 0
  for (const grapheme of splitGraphemes(value)) {
    const candidate = `${nextValue}${grapheme}`
    if (nextLength + 1 > maxLength) break
    if (utf8ByteLength(candidate) > maxBytes) break
    nextValue = candidate
    nextLength += 1
  }
  return trimPathSegmentEdges(nextValue)
}

function getReadableName({ title, fallback, terminalSuffix }) {
  const maxReadableLength = Math.max(1, STORAGE_PATH_SEGMENT_MAX_LENGTH - terminalSuffix.length)
  const maxReadableBytes = Math.max(1, STORAGE_PATH_SEGMENT_MAX_BYTES - utf8ByteLength(terminalSuffix))
  const sanitized = sanitizeStoragePathName(title, fallback)
  const truncated = truncateReadableName(sanitized, maxReadableLength, maxReadableBytes)
  if (truncated) return truncated
  const fallbackName = sanitizeStoragePathName(fallback, DEFAULT_FALLBACK)
  return truncateReadableName(fallbackName, maxReadableLength, maxReadableBytes) || DEFAULT_FALLBACK.slice(0, maxReadableLength)
}

export function buildStoragePathSegment(title, id, fallback, options = {}) {
  const collisionSuffix = typeof options.collisionSuffix === 'string' ? options.collisionSuffix : ''
  const extension = typeof options.extension === 'string' ? options.extension : ''
  const terminalSuffix = `--${createStoragePathShortId(id)}${collisionSuffix}${extension}`
  const readableName = getReadableName({ title, fallback, terminalSuffix })
  return `${readableName}${terminalSuffix}`
}

export function buildStoragePathFileName(title, id, fallback, extension) {
  const normalizedExtension = extension ? (extension.startsWith('.') ? extension : `.${extension}`) : ''
  return buildStoragePathSegment(title, id, fallback, { extension: normalizedExtension })
}

export function createStoragePathAllocator() {
  const used = new Set()
  return (title, id, fallback) => {
    let candidate = buildStoragePathSegment(title, id, fallback)
    let index = 2
    while (used.has(candidate)) {
      candidate = buildStoragePathSegment(title, id, fallback, { collisionSuffix: `-${index}` })
      index += 1
    }
    used.add(candidate)
    return candidate
  }
}

export function createStoragePathFileNameAllocator(extension) {
  const normalizedExtension = extension ? (extension.startsWith('.') ? extension : `.${extension}`) : ''
  const used = new Set()
  return (title, id, fallback) => {
    let candidate = buildStoragePathSegment(title, id, fallback, { extension: normalizedExtension })
    let index = 2
    while (used.has(candidate)) {
      candidate = buildStoragePathSegment(title, id, fallback, {
        collisionSuffix: `-${index}`,
        extension: normalizedExtension,
      })
      index += 1
    }
    used.add(candidate)
    return candidate
  }
}
