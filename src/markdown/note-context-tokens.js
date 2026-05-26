import { buildStoragePathSegment, createStoragePathAllocator, createStoragePathShortId, sanitizeStoragePathName } from '../storage/storage-path-segments.js'

export const WIKI_NOTE_REFERENCE_RE = /!?\[\[[^\]\n|]+(?:\|[^\]\n]+)?\]\]/g
export const NOTE_CONTEXT_REFERENCE_RE = /!\[\[[^\]\n|]+(?:\|[^\]\n]+)?\]\]/g

const WIKI_NOTE_REFERENCE_TOKEN_RE = /^(!?)\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]$/
const SHORT_HASH_RE = /--([0-9a-f]{6})(?:-\d+)?$/i
const FENCE_BOUNDARY_RE = /^\s*(`{3,}|~{3,})/
const MARKDOWN_HEADING_RE = /^ {0,3}(#{1,6})(?:[ \t]+(.*)|[ \t]*)$/
const EMPTY_EDITOR_PLACEHOLDER_RE = /\u200b/g
const PREVIEW_LAST_POSITION_SUFFIX_HANDLE = 'last position'

function ensureArray(value) {
  return Array.isArray(value) ? value : []
}

function getDomainsWithActiveProjection(appState) {
  const domains = ensureArray(appState?.domains)
  const activeDomainId = typeof appState?.activeDomainId === 'string' ? appState.activeDomainId : ''
  return domains.map((domain) => {
    if (domain?.id !== activeDomainId) return domain
    return {
      ...domain,
      activeSpaceId: typeof appState?.activeSpaceId === 'string' ? appState.activeSpaceId : domain?.activeSpaceId,
      spaces: ensureArray(appState?.spaces).length > 0 ? appState.spaces : ensureArray(domain?.spaces),
    }
  })
}

function normalizeLocation(target) {
  if (
    !target ||
    typeof target.domainId !== 'string' ||
    typeof target.spaceId !== 'string' ||
    typeof target.tabId !== 'string' ||
    (typeof target.subTabId !== 'string' && target.subTabId !== null)
  ) {
    return null
  }
  return {
    domainId: target.domainId,
    spaceId: target.spaceId,
    tabId: target.tabId,
    subTabId: target.subTabId,
  }
}

function buildLocationKey(location) {
  return [location.domainId, location.spaceId, location.tabId, location.subTabId ?? '__home__'].join('::')
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

function getNoteTitle(tab, subTab) {
  return subTab?.title ?? tab?.title ?? 'note'
}

function getNoteDisplayName(tab, subTab) {
  return subTab?.title ?? tab?.title ?? 'note'
}

function createNoteEntry({
  appState,
  domain,
  space,
  tab,
  subTab,
  noteAllocator,
}) {
  const locationId = subTab?.id ?? tab?.id
  const noteBodyId = subTab?.noteBodyId ?? tab?.noteBodyId ?? ''
  if (!locationId || !noteBodyId) return null

  const target = {
    domainId: domain.id,
    spaceId: space.id,
    tabId: tab.id,
    subTabId: subTab?.id ?? null,
  }
  const title = getNoteTitle(tab, subTab)
  const displayName = getNoteDisplayName(tab, subTab)
  const handle = buildWikiHandle(displayName, locationId, 'note', noteAllocator)
  const noteBody = getNoteBody(appState, noteBodyId)
  const suffixAllocator = createStoragePathAllocator()
  const suffixEntries = []
  const aisleEntries = []
  const headingEntries = []

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
    domainName: domain?.name ?? domain?.title ?? 'domain',
    spaceName: space?.name ?? space?.title ?? 'space',
    parentName: tab?.title ?? 'parent',
    noteName: subTab?.title ?? tab?.title ?? 'note',
    suffixIndexes,
    suffixByAisleId,
    suffixByHeadingKey,
  }
}

export function buildWikiReferenceIndex(appState) {
  const noteAllocator = createStoragePathAllocator()
  const notes = []

  for (const domain of getDomainsWithActiveProjection(appState)) {
    if (!domain?.id) continue
    for (const space of ensureArray(domain?.spaces)) {
      if (!space?.id) continue
      for (const tab of ensureArray(space?.data?.tabs)) {
        if (!tab?.id) continue
        const homeEntry = createNoteEntry({ appState, domain, space, tab, subTab: null, noteAllocator })
        if (homeEntry) notes.push(homeEntry)
        for (const subTab of ensureArray(tab?.subTabs)) {
          const subTabEntry = createNoteEntry({ appState, domain, space, tab, subTab, noteAllocator })
          if (subTabEntry) notes.push(subTabEntry)
        }
      }
    }
  }

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

function buildWikiReferenceId(parsed) {
  const target = `${parsed.noteHandle}${parsed.suffixHandle ? `#${parsed.suffixHandle}` : ''}`
  return `${parsed.embed ? 'wiki-preview' : 'wiki-link'}:${target}`
}

export function getWikiReferenceDisplayText(token) {
  const parsed = parseWikiReferenceToken(token)
  if (!parsed) return ''
  if (parsed.alias) return parsed.alias
  if (parsed.embed && normalizeSyntheticSuffixHandle(parsed.suffixHandle) === PREVIEW_LAST_POSITION_SUFFIX_HANDLE) {
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

  const isLastPositionPreview =
    parsed.embed && normalizeSyntheticSuffixHandle(parsed.suffixHandle) === PREVIEW_LAST_POSITION_SUFFIX_HANDLE
  const suffix = parsed.suffixHandle && !isLastPositionPreview ? resolveIndexedHandle(note.suffixIndexes, parsed.suffixHandle) : null
  if (parsed.suffixHandle && !suffix && !isLastPositionPreview) return null

  const payload = {
    id: buildWikiReferenceId(parsed),
    target: { ...note.target },
    ...(suffix?.aisleIds?.length ? { aisleIds: [...suffix.aisleIds] } : {}),
    ...(suffix?.heading ? { heading: { ...suffix.heading } } : {}),
    ...(isLastPositionPreview ? { previewStart: 'last-position' } : {}),
  }
  const navigationTarget = {
    ...note.target,
    ...(suffix?.type === 'aisle' && suffix?.aisleId ? { aisleId: suffix.aisleId } : {}),
    ...(suffix?.heading ? { heading: { ...suffix.heading } } : {}),
  }
  const displayLabel = parsed.alias || note.displayName
  const canonicalTarget = `${note.handle}${isLastPositionPreview ? `#${PREVIEW_LAST_POSITION_SUFFIX_HANDLE}` : suffix ? `#${suffix.handle}` : ''}`
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

export function parseContextToken(token, appState) {
  const parsed = parseWikiReferenceToken(token)
  if (!parsed?.embed) return null
  return resolveWikiReferenceToken(appState, token)?.payload ?? null
}

export function parseContextReferences(markdown, appState) {
  const references = []
  for (const match of String(markdown ?? '').matchAll(NOTE_CONTEXT_REFERENCE_RE)) {
    const payload = parseContextToken(match[0], appState)
    if (!payload) continue
    references.push({ token: match[0], payload })
  }
  return references
}

export function replaceContextReferences(markdown, appState, replacer) {
  return String(markdown ?? '').replace(NOTE_CONTEXT_REFERENCE_RE, (token) => {
    const payload = parseContextToken(token, appState)
    return payload ? replacer(token, payload) : token
  })
}

export function getContextReferenceTokenLengthAt(text, offset) {
  const match = String(text ?? '').slice(offset).match(/^!\[\[[^\]\n|]+(?:\|[^\]\n]+)?\]\]/)
  return match && parseWikiReferenceToken(match[0])?.embed ? match[0].length : 0
}

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

export function getCanonicalWikiTargetForPayload(appState, payload) {
  const target = normalizeLocation(payload?.target ?? payload)
  if (!target) return null
  const index = buildWikiReferenceIndex(appState)
  const note = index.noteByLocationKey.get(buildLocationKey(target))
  if (!note) return null
  if (payload?.previewStart === 'last-position') {
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
  return canonical ? buildWikiReferenceToken({ embed: true, target: canonical.target }) : ''
}

export function buildInternalNoteLinkToken(appState, target, alias = '') {
  const canonical = getCanonicalWikiTargetForPayload(appState, target)
  if (!canonical) return ''
  const normalizedAlias = sanitizeWikiAlias(alias)
  const shouldUseAlias = normalizedAlias && normalizedAlias !== canonical.note.displayName
  return buildWikiReferenceToken({
    embed: false,
    target: canonical.target,
    alias: shouldUseAlias ? normalizedAlias : '',
  })
}

export function normalizeContextReferenceTokensForMarkdown(markdown, appState) {
  return String(markdown ?? '').replace(WIKI_NOTE_REFERENCE_RE, (token) => {
    const resolved = resolveWikiReferenceToken(appState, token)
    if (!resolved) return token
    const alias = resolved.parsed.embed
      ? ''
      : resolved.parsed.alias && resolved.parsed.alias !== resolved.note.displayName
        ? resolved.parsed.alias
        : ''
    return buildWikiReferenceToken({
      embed: resolved.parsed.embed,
      target: resolved.canonicalTarget,
      alias,
    })
  })
}
