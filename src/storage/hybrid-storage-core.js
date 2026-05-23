export const DEFAULT_DOMAIN_ID = 'humble-beginnings-domain'
export const DEFAULT_DOMAIN_NAME = 'humble beginnings'
export const DEFAULT_AUTO_REMOVE_DAYS = 7
export const IMAGE_MARKDOWN_PATTERN = /!\[([^\]]*)\]\(([^)]+)\)/g

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
export function isRecord(value) {
  return Boolean(value) && typeof value === 'object'
}

/**
 * @template T
 * @param {unknown} value
 * @returns {T[]}
 */
export function ensureArray(value) {
  return Array.isArray(value) ? value : []
}

/**
 * @param {Record<string, unknown>} domain
 * @param {string} [fallback]
 */
export function getDomainId(domain, fallback = DEFAULT_DOMAIN_ID) {
  return typeof domain.id === 'string' && domain.id ? domain.id : fallback
}

/**
 * @param {Record<string, unknown>} domain
 * @param {string} [fallback]
 */
export function getDomainTitle(domain, fallback = DEFAULT_DOMAIN_NAME) {
  if (typeof domain.name === 'string' && domain.name.trim()) return domain.name
  if (typeof domain.title === 'string' && domain.title.trim()) return domain.title
  return fallback
}

/**
 * @param {Record<string, unknown>} appState
 * @returns {Array<Record<string, unknown>>}
 */
export function getDomainsFromAppState(appState) {
  const domains = ensureArray(appState.domains).filter(isRecord)
  if (domains.length > 0) return domains

  const spaces = ensureArray(appState.spaces).filter(isRecord)
  if (spaces.length === 0) return []

  const activeSpaceId =
    typeof appState.activeSpaceId === 'string' && spaces.some((space) => space.id === appState.activeSpaceId)
      ? appState.activeSpaceId
      : typeof spaces[0]?.id === 'string'
        ? spaces[0].id
        : ''

  return [
    {
      id: DEFAULT_DOMAIN_ID,
      name: DEFAULT_DOMAIN_NAME,
      activeSpaceId,
      spaces,
    },
  ]
}

/**
 * @param {Record<string, unknown>} appState
 * @param {Array<Record<string, unknown>>} domains
 * @returns {Record<string, unknown> | null}
 */
export function getActiveDomainFromAppState(appState, domains) {
  if (domains.length === 0) return null
  if (typeof appState.activeDomainId === 'string') {
    const activeDomain = domains.find((domain) => domain.id === appState.activeDomainId)
    if (activeDomain) return activeDomain
  }
  return domains[0]
}

/**
 * @param {Record<string, unknown> | null} domain
 * @param {unknown} [fallbackActiveSpaceId]
 * @returns {Record<string, unknown> | null}
 */
export function getActiveSpaceFromDomain(domain, fallbackActiveSpaceId) {
  if (!domain) return null
  const spaces = ensureArray(domain.spaces).filter(isRecord)
  if (spaces.length === 0) return null
  const activeSpaceId =
    typeof domain.activeSpaceId === 'string'
      ? domain.activeSpaceId
      : typeof fallbackActiveSpaceId === 'string'
        ? fallbackActiveSpaceId
        : ''
  return spaces.find((space) => space.id === activeSpaceId) ?? spaces[0]
}

/**
 * @param {Record<string, unknown>} appState
 * @returns {Array<Record<string, unknown>>}
 */
export function getNoteBodiesFromAppState(appState) {
  return ensureArray(appState.noteBodies).filter(isRecord)
}

/**
 * @param {Map<string, Record<string, unknown>>} noteBodyMap
 * @param {unknown} noteBodyId
 * @param {string} fallback
 */
export function getNoteBodyFirstMarkdown(noteBodyMap, noteBodyId, fallback) {
  if (typeof noteBodyId !== 'string' || !noteBodyId) return fallback
  const body = noteBodyMap.get(noteBodyId)
  const aisles = ensureArray(body?.aisles)
  const first = aisles[0]
  return typeof first?.markdown === 'string' ? first.markdown : fallback
}

/** @param {unknown} value */
export function normalizeStorageTheme(value) {
  if (value === 'custom') return 'custom1'
  if (
    value === 'dark' ||
    value === 'light' ||
    value === 'dawn' ||
    value === 'blues' ||
    value === 'custom1' ||
    value === 'custom2' ||
    value === 'custom3'
  ) {
    return value
  }
  if (value === 'dusk') return 'blues'
  return 'dawn'
}

/** @param {Record<string, unknown>} appState */
export function getThemeForStorage(appState) {
  return normalizeStorageTheme(appState.theme)
}

/** @param {string} raw */
export function normalizeImageExtension(raw) {
  const normalized = raw.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (normalized === 'jpeg') return 'jpg'
  return normalized || 'png'
}

/** @param {unknown} raw */
export function normalizeAssetExtension(raw) {
  const normalized = String(raw ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (normalized === 'jpeg') return 'jpg'
  if (normalized === 'svgxml') return 'svg'
  if (normalized === 'quicktime') return 'mov'
  if (normalized === 'mpeg' || normalized === 'xmpeg') return 'mp3'
  return normalized || 'bin'
}

/** @param {string} mimeType */
export function getExtensionFromMimeType(mimeType) {
  if (mimeType.startsWith('image/')) return normalizeImageExtension(mimeType.slice('image/'.length))
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType === 'audio/mpeg') return 'mp3'
  if (mimeType === 'audio/mp4') return 'm4a'
  if (mimeType === 'audio/wav' || mimeType === 'audio/wave') return 'wav'
  if (mimeType === 'audio/ogg') return 'ogg'
  if (mimeType === 'video/webm') return 'webm'
  if (mimeType === 'video/mp4') return 'mp4'
  if (mimeType === 'video/quicktime') return 'mov'
  const subtype = String(mimeType ?? '').match(/^[a-zA-Z0-9+.-]+\/([a-zA-Z0-9+.-]+)$/)?.[1]
  return normalizeAssetExtension(subtype)
}

/** @param {string} extension */
export function getMimeTypeFromExtension(extension) {
  const normalized = normalizeAssetExtension(extension)
  if (normalized === 'jpg') return 'image/jpeg'
  if (normalized === 'svg') return 'image/svg+xml'
  if (normalized === 'png' || normalized === 'gif' || normalized === 'webp' || normalized === 'avif') return `image/${normalized}`
  if (normalized === 'pdf') return 'application/pdf'
  if (normalized === 'mp3') return 'audio/mpeg'
  if (normalized === 'wav') return 'audio/wav'
  if (normalized === 'm4a') return 'audio/mp4'
  if (normalized === 'ogg') return 'audio/ogg'
  if (normalized === 'webm') return 'video/webm'
  if (normalized === 'mp4') return 'video/mp4'
  if (normalized === 'mov') return 'video/quicktime'
  return 'application/octet-stream'
}
