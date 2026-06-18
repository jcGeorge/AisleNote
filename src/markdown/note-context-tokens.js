import { buildStoragePathSegment, createStoragePathAllocator, createStoragePathShortId, sanitizeStoragePathName } from '../storage/storage-path-segments.js'

export const WIKI_NOTE_REFERENCE_RE = /!?\[\[[^\]\n|]+(?:\|[^\]\n]+)?\]\]/g
export const MARKDOWN_NOTE_REFERENCE_RE = /!?\[((?:\\.|[^\]\\])*)\]\((<[^>\n]*>|[^)\n]+)\)/g
export const NOTE_CONTEXT_REFERENCE_RE = MARKDOWN_NOTE_REFERENCE_RE
export const NOTE_PREVIEW_REFERENCE_RE = NOTE_CONTEXT_REFERENCE_RE

const WIKI_NOTE_REFERENCE_TOKEN_RE = /^(!?)\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]$/
const MARKDOWN_NOTE_REFERENCE_TOKEN_RE = /^(!?)\[((?:\\.|[^\]\\])*)\]\((<[^>\n]*>|[^)\n]+)\)$/
const ESCAPED_MARKDOWN_NOTE_REFERENCE_RE = /(!?)\\?\[((?:\\.|[^\]\\])*)\\?\]\\\(((?:\\[^)]|[^)\n])*)\\\)/g
const SHORT_HASH_RE = /--([0-9a-f]{6})(?:-\d+)?$/i
const FENCE_BOUNDARY_RE = /^\s*(`{3,}|~{3,})/
const MARKDOWN_HEADING_RE = /^ {0,3}(#{1,6})(?:[ \t]+(.*)|[ \t]*)$/
const EMPTY_EDITOR_PLACEHOLDER_RE = /\u200b/g
const PREVIEW_LAST_POSITION_SUFFIX_HANDLE = 'last position'

function ensureArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeLocation(target) {
  if (!target || typeof target.noteId !== 'string') {
    return null
  }
  return {
    noteId: target.noteId,
  }
}

function buildLocationKey(location) {
  return location.noteId
}

function getAisleMarkdown(aisle, noteAisleBodies) {
  const bodyId = aisle?.aisleBodyId
  if (!bodyId) return ''
  const body = ensureArray(noteAisleBodies).find((candidate) => candidate?.id === bodyId)
  return typeof body?.markdown === 'string' ? body.markdown : ''
}

function getNoteBody(appState, noteBodyId) {
  return ensureArray(appState?.noteBodies).find((body) => body?.id === noteBodyId) ?? null
}

function normalizeHeadingText(value) {
  return String(value ?? '')
    .replace(EMPTY_EDITOR_PLACEHOLDER_RE, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripClosingHeadingMarkers(text) {
  return text.replace(/[ \t]+#+[ \t]*$/, '')
}

function buildHeadingKey(aisleId, level, text, occurrence) {
  return [
    encodeURIComponent(aisleId),
    `h${Math.min(6, Math.max(1, level))}`,
    String(Math.max(0, occurrence)),
    encodeURIComponent(normalizeHeadingText(text)),
  ].join('|')
}

function getNextFenceState(line, activeFence) {
  const match = line.match(FENCE_BOUNDARY_RE)
  if (!match) return activeFence
  const marker = match[1][0]
  if (!activeFence) return marker
  return activeFence === marker ? null : activeFence
}

function getHeadingOutlineFromMarkdown(aisleId, markdown) {
  const headings = []
  const occurrences = new Map()
  let activeFence = null

  String(markdown ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .forEach((line) => {
      const fenceBeforeLine = activeFence
      activeFence = getNextFenceState(line, activeFence)
      if (fenceBeforeLine) return

      const match = line.match(MARKDOWN_HEADING_RE)
      if (!match) return
      const level = match[1].length
      const text = normalizeHeadingText(stripClosingHeadingMarkers(match[2] ?? ''))
      const occurrenceBaseKey = `${level}\n${text}`
      const occurrence = occurrences.get(occurrenceBaseKey) ?? 0
      occurrences.set(occurrenceBaseKey, occurrence + 1)
      headings.push({
        aisleId,
        level,
        text,
        occurrence,
        key: buildHeadingKey(aisleId, level, text, occurrence),
      })
    })

  return headings
}

function sanitizeWikiHandleName(value, fallback) {
  const sanitized = sanitizeStoragePathName(value, fallback)
    .replace(/[\[\]#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return sanitized || sanitizeStoragePathName(fallback, 'item')
}

function buildWikiHandle(title, id, fallback, allocator = null) {
  const safeTitle = sanitizeWikiHandleName(title, fallback)
  return allocator
    ? allocator(safeTitle, id, fallback)
    : buildStoragePathSegment(safeTitle, id, fallback)
}

function extractHandleShortId(handle) {
  const match = String(handle ?? '').trim().match(SHORT_HASH_RE)
  return match?.[1]?.toLowerCase() ?? ''
}

function normalizeSyntheticSuffixHandle(handle) {
  return String(handle ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function stripHandleShortId(handle) {
  return String(handle ?? '').replace(SHORT_HASH_RE, '').trim()
}

function sanitizeMarkdownLinkLabel(value, fallback = 'linked note') {
  return String(value ?? '')
    .replace(/[\r\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || fallback
}

export function escapeMarkdownReferenceLabel(label) {
  return sanitizeMarkdownLinkLabel(label)
    .replace(/\\/g, '\\\\')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
}

export function unescapeMarkdownReferenceLabel(label) {
  return String(label ?? '').replace(/\\([\\[\]])/g, '$1').trim()
}

export function formatMarkdownNoteReferenceDestination(target) {
  const normalized = String(target ?? '').trim()
  if (!normalized) return ''
  const escaped = normalized.replace(/>/g, '\\>')
  return /[\s()<>]/.test(normalized) ? `<${escaped}>` : normalized
}

export function parseMarkdownNoteReferenceDestination(destination) {
  const normalized = String(destination ?? '').trim()
  if (!normalized) return ''
  let unwrapped = normalized
  for (let unwrapCount = 0; unwrapCount < 3; unwrapCount += 1) {
    if (!unwrapped.startsWith('<') || !unwrapped.endsWith('>')) break
    unwrapped = unwrapped.slice(1, -1).replace(/\\>/g, '>').trim()
  }
  try {
    return decodeURIComponent(unwrapped)
  } catch {
    return unwrapped
  }
}

function unescapeSerializedMarkdownReferencePart(value) {
  return String(value ?? '').replace(/\\([\\[\]()<>#\-])/g, '$1').trim()
}

export function formatEditorMarkdownNoteReferenceHref(target) {
  const normalized = String(target ?? '').trim()
  if (!normalized) return ''
  try {
    return encodeURI(normalized)
  } catch {
    return normalized.replace(/\s/g, '%20')
  }
}

function splitMarkdownNoteReferenceTarget(destination) {
  const targetSource = parseMarkdownNoteReferenceDestination(destination)
  if (!targetSource) return null
  const hashIndex = targetSource.indexOf('#')
  const noteHandle = (hashIndex >= 0 ? targetSource.slice(0, hashIndex) : targetSource).trim()
  const suffixHandle = hashIndex >= 0 ? targetSource.slice(hashIndex + 1).trim() : ''
  if (!noteHandle) return null
  return { target: targetSource, noteHandle, suffixHandle }
}

function getDefaultMarkdownReferenceLabel({ note, suffix, suffixHandle }) {
  if (normalizeSyntheticSuffixHandle(suffixHandle) === PREVIEW_LAST_POSITION_SUFFIX_HANDLE) {
    return stripHandleShortId(note?.handle) || note?.displayName || 'note'
  }
  if (suffix?.label) return suffix.label
  if (suffixHandle) return stripHandleShortId(suffixHandle) || suffixHandle
  return note?.displayName || stripHandleShortId(note?.handle) || 'note'
}

function getParsedMarkdownReferenceDefaultLabel(parsed) {
  if (!parsed) return ''
  if (normalizeSyntheticSuffixHandle(parsed.suffixHandle) === PREVIEW_LAST_POSITION_SUFFIX_HANDLE) {
    return stripHandleShortId(parsed.noteHandle) || parsed.noteHandle
  }
  const source = parsed.suffixHandle || parsed.noteHandle
  return stripHandleShortId(source) || source
}

function setShortIdIndex(index, shortId, entry) {
  if (!shortId) return
  if (!index.has(shortId)) {
    index.set(shortId, entry)
    return
  }
  if (index.get(shortId) !== entry) index.set(shortId, null)
}

function buildHandleIndexes(entries) {
  const byExact = new Map()
  const byShortId = new Map()
  entries.forEach((entry) => {
    byExact.set(entry.handle, entry)
    setShortIdIndex(byShortId, entry.shortId, entry)
  })
  return { byExact, byShortId }
}

function resolveIndexedHandle(indexes, handle) {
  const normalizedHandle = String(handle ?? '').trim()
  if (!normalizedHandle) return null
  const exact = indexes.byExact.get(normalizedHandle)
  if (exact) return exact
  const shortId = extractHandleShortId(normalizedHandle)
  return shortId ? indexes.byShortId.get(shortId) ?? null : null
}

function walkNotebookNotes(items, visitor, path = []) {
  for (const item of ensureArray(items)) {
    if (!item?.id) continue
    const nextPath = [...path, item]
    if (item.type === 'note') {
      visitor(item, nextPath)
      continue
    }
    if (item.type === 'folder') {
      walkNotebookNotes(item.children, visitor, nextPath)
    }
  }
}

function getNoteTitle(note) {
  return note?.title ?? 'note'
}

function getNoteDisplayName(note) {
  return note?.title ?? 'note'
}

function createNoteEntry({
  appState,
  note,
  path,
  noteAllocator,
}) {
  const locationId = note?.id
  const noteBodyId = note?.noteBodyId ?? ''
  if (!locationId || !noteBodyId) return null

  const target = {
    noteId: note.id,
  }
  const title = getNoteTitle(note)
  const displayName = getNoteDisplayName(note)
  const handle = buildWikiHandle(displayName, locationId, 'note', noteAllocator)
  const noteBody = getNoteBody(appState, noteBodyId)
  const suffixAllocator = createStoragePathAllocator()
  const suffixEntries = []
  const aisleEntries = []
  const headingEntries = []
  const folderPath = ensureArray(path)
    .slice(0, -1)
    .map((segment) => segment?.title)
    .filter(Boolean)
    .join('/')

  ensureArray(noteBody?.aisles).forEach((aisle, index) => {
    if (!aisle?.id) return
    const aisleLabel = `aisle ${index + 1}`
    const aisleHandle = buildWikiHandle(aisleLabel, aisle.id, 'aisle', suffixAllocator)
    const aisleEntry = {
      type: 'aisle',
      handle: aisleHandle,
      shortId: createStoragePathShortId(aisle.id),
      aisleId: aisle.id,
      aisleIds: [aisle.id],
      label: aisleLabel,
    }
    suffixEntries.push(aisleEntry)
    aisleEntries.push(aisleEntry)

    getHeadingOutlineFromMarkdown(aisle.id, getAisleMarkdown(aisle, appState?.noteAisleBodies)).forEach((heading) => {
      const headingHandle = buildWikiHandle(heading.text || 'heading', heading.key, 'heading', suffixAllocator)
      const headingEntry = {
        type: 'heading',
        handle: headingHandle,
        shortId: createStoragePathShortId(heading.key),
        aisleId: aisle.id,
        aisleIds: [aisle.id],
        heading: { aisleId: aisle.id, headingKey: heading.key },
        label: heading.text || 'heading',
      }
      suffixEntries.push(headingEntry)
      headingEntries.push(headingEntry)
    })
  })

  const suffixIndexes = buildHandleIndexes(suffixEntries)
  const suffixByAisleId = new Map(aisleEntries.map((entry) => [entry.aisleId, entry]))
  const suffixByHeadingKey = new Map(headingEntries.map((entry) => [entry.heading.headingKey, entry]))

  return {
    handle,
    shortId: createStoragePathShortId(locationId),
    target,
    locationKey: buildLocationKey(target),
    noteBodyId,
    title,
    displayName,
    folderName: folderPath.split('/').filter(Boolean).at(-1) ?? '',
    folderPath,
    noteName: note?.title ?? 'note',
    suffixIndexes,
    suffixByAisleId,
    suffixByHeadingKey,
  }
}

export function buildWikiReferenceIndex(appState) {
  const noteAllocator = createStoragePathAllocator()
  const notes = []

  walkNotebookNotes(appState?.notebook?.items, (note, path) => {
    const entry = createNoteEntry({ appState, note, path, noteAllocator })
    if (entry) notes.push(entry)
  })

  const noteIndexes = buildHandleIndexes(notes)
  const noteByLocationKey = new Map(notes.map((entry) => [entry.locationKey, entry]))
  return { notes, noteIndexes, noteByLocationKey }
}

export function parseWikiReferenceToken(token) {
  const match = String(token ?? '').trim().match(WIKI_NOTE_REFERENCE_TOKEN_RE)
  if (!match) return null
  const targetSource = match[2].trim()
  if (!targetSource) return null
  const hashIndex = targetSource.indexOf('#')
  const noteHandle = (hashIndex >= 0 ? targetSource.slice(0, hashIndex) : targetSource).trim()
  const suffixHandle = hashIndex >= 0 ? targetSource.slice(hashIndex + 1).trim() : ''
  if (!noteHandle) return null
  return {
    token: match[0],
    embed: match[1] === '!',
    target: targetSource,
    noteHandle,
    suffixHandle,
    alias: typeof match[3] === 'string' && match[3].trim() ? match[3].trim() : '',
  }
}

export function parseMarkdownNoteReferenceToken(token) {
  const match = String(token ?? '').trim().match(MARKDOWN_NOTE_REFERENCE_TOKEN_RE)
  if (!match) return null
  const targetParts = splitMarkdownNoteReferenceTarget(match[3])
  if (!targetParts) return null
  return {
    token: match[0],
    embed: match[1] === '!',
    label: unescapeMarkdownReferenceLabel(match[2]),
    destination: match[3],
    ...targetParts,
  }
}

function buildWikiReferenceId(parsed) {
  const target = `${parsed.noteHandle}${parsed.suffixHandle ? `#${parsed.suffixHandle}` : ''}`
  return `${parsed.embed ? 'wiki-preview' : 'wiki-link'}:${target}`
}

function buildMarkdownReferenceId(parsed) {
  const target = `${parsed.noteHandle}${parsed.suffixHandle ? `#${parsed.suffixHandle}` : ''}`
  return `${parsed.embed ? 'markdown-preview' : 'markdown-link'}:${target}`
}

export function getWikiReferenceDisplayText(token) {
  const parsed = parseWikiReferenceToken(token)
  if (!parsed) return ''
  if (parsed.alias) return parsed.alias
  if (normalizeSyntheticSuffixHandle(parsed.suffixHandle) === PREVIEW_LAST_POSITION_SUFFIX_HANDLE) {
    return parsed.noteHandle.replace(SHORT_HASH_RE, '').trim() || parsed.noteHandle.trim()
  }
  const source = parsed.suffixHandle || parsed.noteHandle
  return source.replace(SHORT_HASH_RE, '').trim() || source.trim()
}

export function resolveWikiReferenceToken(appState, token) {
  const parsed = parseWikiReferenceToken(token)
  if (!parsed) return null
  const index = buildWikiReferenceIndex(appState)
  const note = resolveIndexedHandle(index.noteIndexes, parsed.noteHandle)
  if (!note) return null

  const isLastPositionReference = normalizeSyntheticSuffixHandle(parsed.suffixHandle) === PREVIEW_LAST_POSITION_SUFFIX_HANDLE
  const suffix = parsed.suffixHandle && !isLastPositionReference ? resolveIndexedHandle(note.suffixIndexes, parsed.suffixHandle) : null
  if (parsed.suffixHandle && !suffix && !isLastPositionReference) return null

  const payload = {
    id: buildWikiReferenceId(parsed),
    target: { ...note.target },
    ...(suffix?.aisleIds?.length ? { aisleIds: [...suffix.aisleIds] } : {}),
    ...(suffix?.heading ? { heading: { ...suffix.heading } } : {}),
    ...(parsed.embed && isLastPositionReference ? { previewStart: 'last-position' } : {}),
  }
  const navigationTarget = {
    ...note.target,
    ...(suffix?.type === 'aisle' && suffix?.aisleId ? { aisleId: suffix.aisleId } : {}),
    ...(suffix?.heading ? { heading: { ...suffix.heading } } : {}),
    ...(!parsed.embed && !suffix ? { startAt: isLastPositionReference ? 'last-position' : 'top' } : {}),
    ...(!parsed.embed && suffix && !suffix.heading ? { startAt: 'top' } : {}),
  }
  const displayLabel = parsed.alias || note.displayName
  const canonicalTarget = `${note.handle}${isLastPositionReference ? `#${PREVIEW_LAST_POSITION_SUFFIX_HANDLE}` : suffix ? `#${suffix.handle}` : ''}`
  return {
    token: parsed.token,
    parsed,
    note,
    suffix,
    payload,
    target: navigationTarget,
    label: displayLabel,
    canonicalTarget,
    canonicalToken: buildWikiReferenceToken({
      embed: parsed.embed,
      target: canonicalTarget,
      alias: parsed.embed ? '' : parsed.alias,
    }),
  }
}

export function resolveMarkdownNoteReferenceToken(appState, token) {
  const parsed = parseMarkdownNoteReferenceToken(token)
  if (!parsed) return null
  const index = buildWikiReferenceIndex(appState)
  const note = resolveIndexedHandle(index.noteIndexes, parsed.noteHandle)
  if (!note) return null

  const isLastPositionReference = normalizeSyntheticSuffixHandle(parsed.suffixHandle) === PREVIEW_LAST_POSITION_SUFFIX_HANDLE
  const suffix = parsed.suffixHandle && !isLastPositionReference ? resolveIndexedHandle(note.suffixIndexes, parsed.suffixHandle) : null
  if (parsed.suffixHandle && !suffix && !isLastPositionReference) return null

  const payload = {
    id: buildMarkdownReferenceId(parsed),
    target: { ...note.target },
    ...(suffix?.aisleIds?.length ? { aisleIds: [...suffix.aisleIds] } : {}),
    ...(suffix?.heading ? { heading: { ...suffix.heading } } : {}),
    ...(parsed.embed && isLastPositionReference ? { previewStart: 'last-position' } : {}),
  }
  const navigationTarget = {
    ...note.target,
    ...(suffix?.type === 'aisle' && suffix?.aisleId ? { aisleId: suffix.aisleId } : {}),
    ...(suffix?.heading ? { heading: { ...suffix.heading } } : {}),
    ...(!parsed.embed && !suffix ? { startAt: isLastPositionReference ? 'last-position' : 'top' } : {}),
    ...(!parsed.embed && suffix && !suffix.heading ? { startAt: 'top' } : {}),
  }
  const canonicalTarget = `${note.handle}${isLastPositionReference ? `#${PREVIEW_LAST_POSITION_SUFFIX_HANDLE}` : suffix ? `#${suffix.handle}` : ''}`
  const label = parsed.label || getDefaultMarkdownReferenceLabel({ note, suffix, suffixHandle: parsed.suffixHandle })
  return {
    token: parsed.token,
    parsed,
    note,
    suffix,
    payload,
    target: navigationTarget,
    label,
    canonicalTarget,
    canonicalToken: buildMarkdownNoteReferenceToken({
      embed: parsed.embed,
      target: canonicalTarget,
      label,
    }),
  }
}

export function resolveMarkdownNoteReferenceDestination(appState, destination, label = '', embed = false) {
  const target = parseMarkdownNoteReferenceDestination(destination)
  if (!target) return null
  return resolveMarkdownNoteReferenceToken(
    appState,
    buildMarkdownNoteReferenceToken({
      embed,
      target,
      label: label || 'linked note',
    }),
  )
}

export function parseContextToken(token, appState) {
  const parsed = parseMarkdownNoteReferenceToken(token)
  if (!parsed?.embed) return null
  return resolveMarkdownNoteReferenceToken(appState, token)?.payload ?? null
}

export const parsePreviewToken = parseContextToken

export function parseContextReferences(markdown, appState) {
  const references = []
  for (const match of String(markdown ?? '').matchAll(NOTE_CONTEXT_REFERENCE_RE)) {
    const payload = parseContextToken(match[0], appState)
    if (!payload) continue
    references.push({ token: match[0], payload })
  }
  return references
}

export const parsePreviewReferences = parseContextReferences

export function replaceContextReferences(markdown, appState, replacer) {
  return String(markdown ?? '').replace(NOTE_CONTEXT_REFERENCE_RE, (token) => {
    const payload = parseContextToken(token, appState)
    return payload ? replacer(token, payload) : token
  })
}

export const replacePreviewReferences = replaceContextReferences

export function getContextReferenceTokenLengthAt(text, offset) {
  const source = String(text ?? '').slice(offset)
  const match = source.match(/^!\[((?:\\.|[^\]\\])*)\]\((<[^>\n]*>|[^)\n]+)\)/)
  const parsed = match ? parseMarkdownNoteReferenceToken(match[0]) : null
  return parsed?.embed && extractHandleShortId(parsed.noteHandle) ? match[0].length : 0
}

export const getPreviewReferenceTokenLengthAt = getContextReferenceTokenLengthAt

function sanitizeWikiAlias(value) {
  return String(value ?? '')
    .replace(/[\]\r\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildWikiReferenceToken({ embed = false, target, alias = '' }) {
  const normalizedTarget = String(target ?? '').trim()
  if (!normalizedTarget) return ''
  const normalizedAlias = embed ? '' : sanitizeWikiAlias(alias)
  return `${embed ? '!' : ''}[[${normalizedTarget}${normalizedAlias ? `|${normalizedAlias}` : ''}]]`
}

export function buildMarkdownNoteReferenceToken({ embed = false, target, label = '' }) {
  const normalizedTarget = String(target ?? '').trim()
  if (!normalizedTarget) return ''
  const normalizedLabel = escapeMarkdownReferenceLabel(label || stripHandleShortId(normalizedTarget) || 'linked note')
  const destination = formatMarkdownNoteReferenceDestination(normalizedTarget)
  return `${embed ? '!' : ''}[${normalizedLabel}](${destination})`
}

export function getCanonicalWikiTargetForPayload(appState, payload) {
  const target = normalizeLocation(payload?.target ?? payload)
  if (!target) return null
  const index = buildWikiReferenceIndex(appState)
  const note = index.noteByLocationKey.get(buildLocationKey(target))
  if (!note) return null
  if (payload?.previewStart === 'last-position' || payload?.startAt === 'last-position') {
    return {
      note,
      suffix: null,
      target: `${note.handle}#${PREVIEW_LAST_POSITION_SUFFIX_HANDLE}`,
    }
  }
  const headingKey = payload?.heading?.headingKey
  const headingSuffix = headingKey ? note.suffixByHeadingKey.get(headingKey) : null
  const aisleId = Array.isArray(payload?.aisleIds) ? payload.aisleIds[0] : ''
  const aisleSuffix = !headingSuffix && aisleId ? note.suffixByAisleId.get(aisleId) : null
  const suffix = headingSuffix ?? aisleSuffix ?? null
  return {
    note,
    suffix,
    target: `${note.handle}${suffix ? `#${suffix.handle}` : ''}`,
  }
}

export function buildContextToken(appState, payload) {
  const canonical = getCanonicalWikiTargetForPayload(appState, payload)
  return canonical
    ? buildMarkdownNoteReferenceToken({
        embed: true,
        target: canonical.target,
        label: getDefaultMarkdownReferenceLabel({
          note: canonical.note,
          suffix: canonical.suffix,
          suffixHandle: canonical.target.split('#')[1] ?? '',
        }),
      })
    : ''
}

export const buildPreviewToken = buildContextToken

export function buildInternalNoteLinkToken(appState, target, alias = '') {
  const canonical = getCanonicalWikiTargetForPayload(appState, target)
  if (!canonical) return ''
  const normalizedAlias = sanitizeMarkdownLinkLabel(alias, '')
  return buildMarkdownNoteReferenceToken({
    embed: false,
    target: canonical.target,
    label: normalizedAlias || getDefaultMarkdownReferenceLabel({
      note: canonical.note,
      suffix: canonical.suffix,
      suffixHandle: canonical.target.split('#')[1] ?? '',
    }),
  })
}

export function normalizeContextReferenceTokensForMarkdown(markdown, appState) {
  const normalizeToken = (token) => {
    const resolved = resolveMarkdownNoteReferenceToken(appState, token)
    if (!resolved) return token
    const parsedDefaultLabel = getParsedMarkdownReferenceDefaultLabel(resolved.parsed)
    const currentDefaultLabel = getDefaultMarkdownReferenceLabel({
      note: resolved.note,
      suffix: resolved.suffix,
      suffixHandle: resolved.canonicalTarget.split('#')[1] ?? '',
    })
    const label = resolved.parsed.label && resolved.parsed.label !== parsedDefaultLabel
      ? resolved.parsed.label
      : currentDefaultLabel
    return buildMarkdownNoteReferenceToken({
      embed: resolved.parsed.embed,
      target: resolved.canonicalTarget,
      label,
    })
  }

  const repairedEscapedTokens = String(markdown ?? '').replace(
    ESCAPED_MARKDOWN_NOTE_REFERENCE_RE,
    (source, embedMarker, label, destination) => {
      const token = buildMarkdownNoteReferenceToken({
        embed: embedMarker === '!',
        target: parseMarkdownNoteReferenceDestination(unescapeSerializedMarkdownReferencePart(destination)),
        label: unescapeMarkdownReferenceLabel(label),
      })
      if (!token || !resolveMarkdownNoteReferenceToken(appState, token)) return source
      return normalizeToken(token)
    },
  )

  return repairedEscapedTokens.replace(MARKDOWN_NOTE_REFERENCE_RE, (token) => {
    return normalizeToken(token)
  })
}

export function prepareMarkdownNoteReferencesForEditor(markdown, appState) {
  return normalizeContextReferenceTokensForMarkdown(markdown, appState).replace(MARKDOWN_NOTE_REFERENCE_RE, (token) => {
    const resolved = resolveMarkdownNoteReferenceToken(appState, token)
    if (!resolved) return token
    return buildMarkdownNoteReferenceToken({
      embed: resolved.parsed.embed,
      target: formatEditorMarkdownNoteReferenceHref(resolved.canonicalTarget),
      label: resolved.label,
    })
  })
}

export const normalizePreviewReferenceTokensForMarkdown = normalizeContextReferenceTokensForMarkdown
