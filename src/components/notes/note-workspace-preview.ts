const HEAVY_PREVIEW_LINK_THRESHOLD = 5
const HEAVY_PREVIEW_TABLE_ROW_THRESHOLD = 6
const MAX_WORKLOAD_PROFILE_CACHE_ENTRIES = 300
const LIGHTWEIGHT_PREVIEW_MAX_LINES = 160
const LIGHTWEIGHT_PREVIEW_MAX_CHARS = 12_000

const MARKDOWN_LINK_RE = /(!?)\[([^\]\n]*)\]\(([^)\s]+)(?:\s+["'][^)]*["'])?\)/g
const MARKDOWN_AUTOLINK_RE = /<((?:https?:\/\/)[^<>\s]+)>/gi
const MEDIA_EXTENSION_RE = /\.(?:avif|gif|jpe?g|m4a|mov|mp3|mp4|ogg|png|svg|wav|webm|webp)(?:[?#]|$)/i

export type MarkdownWorkloadProfile = {
  markdownLength: number
  markdownLinkCount: number
  externalLinkCount: number
  tableRowCount: number
  hasMediaCandidate: boolean
  hasNotePreviewCandidate: boolean
  hasInternalNoteCandidate: boolean
  isLinkHeavy: boolean
}

export type AislePreviewRenderMode = 'editor' | 'markdown-preview' | 'lightweight-preview' | 'empty-pending'

type CachedMarkdownWorkloadProfile = {
  markdown: string
  profile: MarkdownWorkloadProfile
}

const markdownWorkloadProfileCache = new Map<string, CachedMarkdownWorkloadProfile>()

function normalizeDestination(value: string) {
  return String(value ?? '').trim().replace(/^<|>$/g, '')
}

function isExternalDestination(destination: string) {
  return /^https?:\/\//i.test(destination)
}

function isMediaCandidateDestination(destination: string) {
  return /^(?:data:image\/|blob:|tabs-asset:)/i.test(destination) || MEDIA_EXTENSION_RE.test(destination)
}

function isInternalNoteCandidateDestination(destination: string) {
  if (!destination || isExternalDestination(destination)) return false
  if (/^(?:data:|blob:|tabs-asset:|mailto:|tel:|#)/i.test(destination)) return false
  return true
}

function createMarkdownWorkloadProfile(markdown: string): MarkdownWorkloadProfile {
  const source = String(markdown ?? '')
  let markdownLinkCount = 0
  let externalLinkCount = 0
  let hasMediaCandidate = false
  let hasNotePreviewCandidate = false
  let hasInternalNoteCandidate = false

  for (const match of source.matchAll(MARKDOWN_LINK_RE)) {
    const isImage = match[1] === '!'
    const destination = normalizeDestination(match[3] ?? '')
    if (!isImage) markdownLinkCount += 1
    if (isExternalDestination(destination)) {
      if (!isImage) externalLinkCount += 1
    } else if (isInternalNoteCandidateDestination(destination)) {
      hasInternalNoteCandidate = true
      if (isImage) hasNotePreviewCandidate = true
    }
    if (isImage || isMediaCandidateDestination(destination)) {
      hasMediaCandidate = true
    }
  }

  for (const match of source.matchAll(MARKDOWN_AUTOLINK_RE)) {
    if (isExternalDestination(normalizeDestination(match[1] ?? ''))) {
      markdownLinkCount += 1
      externalLinkCount += 1
    }
  }

  let tableRowCount = 0
  for (const line of source.split('\n')) {
    if (line.includes('|')) tableRowCount += 1
  }

  const isLinkHeavy =
    externalLinkCount >= HEAVY_PREVIEW_LINK_THRESHOLD ||
    markdownLinkCount >= HEAVY_PREVIEW_LINK_THRESHOLD ||
    (tableRowCount >= HEAVY_PREVIEW_TABLE_ROW_THRESHOLD && markdownLinkCount > 0)

  return {
    markdownLength: source.length,
    markdownLinkCount,
    externalLinkCount,
    tableRowCount,
    hasMediaCandidate,
    hasNotePreviewCandidate,
    hasInternalNoteCandidate,
    isLinkHeavy,
  }
}

function rememberMarkdownWorkloadProfile(cacheKey: string, markdown: string, profile: MarkdownWorkloadProfile) {
  markdownWorkloadProfileCache.set(cacheKey, { markdown, profile })
  if (markdownWorkloadProfileCache.size <= MAX_WORKLOAD_PROFILE_CACHE_ENTRIES) return
  const firstKey = markdownWorkloadProfileCache.keys().next().value
  if (typeof firstKey === 'string') markdownWorkloadProfileCache.delete(firstKey)
}

export function getMarkdownWorkloadProfile(markdown: string, cacheKey = ''): MarkdownWorkloadProfile {
  const source = String(markdown ?? '')
  if (!cacheKey) return createMarkdownWorkloadProfile(source)
  const cached = markdownWorkloadProfileCache.get(cacheKey)
  if (cached?.markdown === source) return cached.profile
  const profile = createMarkdownWorkloadProfile(source)
  rememberMarkdownWorkloadProfile(cacheKey, source, profile)
  return profile
}

export function isMarkdownPreviewLikelyExpensive(markdown: string): boolean {
  return getMarkdownWorkloadProfile(markdown).isLinkHeavy
}

export function getAislePreviewRenderMode({
  active,
  arrangeModeActive,
  deferInactivePreviewFallbacks,
  editorMounted,
  editorMountPending,
  inactivePreviewsHydrated,
  profile,
}: {
  active: boolean
  arrangeModeActive: boolean
  deferInactivePreviewFallbacks: boolean
  editorMounted: boolean
  editorMountPending: boolean
  inactivePreviewsHydrated: boolean
  profile: MarkdownWorkloadProfile | null
}): AislePreviewRenderMode {
  if (editorMounted) return 'editor'
  if (editorMountPending) return 'empty-pending'
  if (!profile) return 'markdown-preview'
  if (!active && arrangeModeActive && profile.markdownLength > 0 && profile.externalLinkCount > 0) return 'lightweight-preview'
  void deferInactivePreviewFallbacks
  void inactivePreviewsHydrated
  return 'markdown-preview'
}

export function getLightweightPreviewText(markdown: string): string {
  const source = String(markdown ?? '').replace(/\r\n?/g, '\n')
  const normalized = source
    .replace(MARKDOWN_LINK_RE, (_match, imagePrefix: string, label: string, destination: string) => {
      if (imagePrefix === '!') return label ? `[image: ${label}]` : '[image]'
      return label || normalizeDestination(destination)
    })
    .replace(MARKDOWN_AUTOLINK_RE, '$1')
  const lines = normalized.split('\n')
  const clippedLines = lines.slice(0, LIGHTWEIGHT_PREVIEW_MAX_LINES)
  let text = clippedLines.join('\n')
  if (text.length > LIGHTWEIGHT_PREVIEW_MAX_CHARS) {
    text = `${text.slice(0, LIGHTWEIGHT_PREVIEW_MAX_CHARS).trimEnd()}\n...`
  } else if (lines.length > clippedLines.length) {
    text = `${text.trimEnd()}\n...`
  }
  return text
}
