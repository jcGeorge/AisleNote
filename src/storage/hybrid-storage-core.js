export const DEFAULT_DOMAIN_ID = 'humble-beginnings-domain'
export const DEFAULT_DOMAIN_NAME = 'humble beginnings'
export const DEFAULT_AUTO_REMOVE_DAYS = 7
export const IMAGE_MARKDOWN_PATTERN = /!\[([^\]]*)\]\(([^)]+)\)/g
const DEFAULT_REPAIRED_SPACE_NAME = 'space'
const DEFAULT_REPAIRED_TAB_TITLE = 'tab'

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

function normalizeRepairIdSegment(value) {
  const normalized = String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
  return normalized || 'item'
}

function allocateRepairId(prefix, seed, usedIds) {
  const base = `${prefix}-${normalizeRepairIdSegment(seed)}`
  let candidate = base
  let suffix = 2
  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix}`
    suffix += 1
  }
  usedIds.add(candidate)
  return candidate
}

function addEntityId(usedIds, value) {
  if (typeof value === 'string' && value) usedIds.add(value)
}

function collectTabEntityIds(tab, usedIds) {
  if (!isRecord(tab)) return
  addEntityId(usedIds, tab.id)
  addEntityId(usedIds, tab.noteBodyId)
  ensureArray(tab.subTabs).forEach((subTab) => {
    if (!isRecord(subTab)) return
    addEntityId(usedIds, subTab.id)
    addEntityId(usedIds, subTab.noteBodyId)
  })
}

function collectWorkspaceEntityIds(data, usedIds) {
  if (!isRecord(data)) return
  addEntityId(usedIds, data.activeTabId)
  ensureArray(data.tabs).forEach((tab) => collectTabEntityIds(tab, usedIds))
  ensureArray(data.deletedTabs).forEach((entry) => {
    if (!isRecord(entry)) return
    addEntityId(usedIds, entry.id)
    if (isRecord(entry.tab)) collectTabEntityIds(entry.tab, usedIds)
  })
  ensureArray(data.deletedSubTabs).forEach((entry) => {
    if (!isRecord(entry)) return
    addEntityId(usedIds, entry.id)
    addEntityId(usedIds, entry.parentTabId)
    if (isRecord(entry.subTab)) {
      addEntityId(usedIds, entry.subTab.id)
      addEntityId(usedIds, entry.subTab.noteBodyId)
    }
  })
}

function collectSpaceEntityIds(space, usedIds) {
  if (!isRecord(space)) return
  addEntityId(usedIds, space.id)
  collectWorkspaceEntityIds(space.data, usedIds)
}

function collectDomainEntityIds(domain, usedIds) {
  if (!isRecord(domain)) return
  addEntityId(usedIds, domain.id)
  addEntityId(usedIds, domain.activeSpaceId)
  ensureArray(domain.spaces).forEach((space) => collectSpaceEntityIds(space, usedIds))
}

function collectNotebookStorageEntityIds(state) {
  const usedIds = new Set()
  ensureArray(state?.domains).forEach((domain) => collectDomainEntityIds(domain, usedIds))
  ensureArray(state?.spaces).forEach((space) => collectSpaceEntityIds(space, usedIds))
  ensureArray(state?.deletedSpaces).forEach((entry) => {
    if (!isRecord(entry)) return
    addEntityId(usedIds, entry.id)
    addEntityId(usedIds, entry.domainId)
    collectSpaceEntityIds(entry.space, usedIds)
  })
  ensureArray(state?.deletedDomains).forEach((entry) => {
    if (!isRecord(entry)) return
    addEntityId(usedIds, entry.id)
    collectDomainEntityIds(entry.domain, usedIds)
    ensureArray(entry.deletedSpaces).forEach((spaceEntry) => {
      if (!isRecord(spaceEntry)) return
      addEntityId(usedIds, spaceEntry.id)
      addEntityId(usedIds, spaceEntry.domainId)
      collectSpaceEntityIds(spaceEntry.space, usedIds)
    })
  })
  ensureArray(state?.noteBodies).forEach((body) => {
    if (!isRecord(body)) return
    addEntityId(usedIds, body.id)
    ensureArray(body.aisles).forEach((aisle) => {
      if (!isRecord(aisle)) return
      addEntityId(usedIds, aisle.id)
      addEntityId(usedIds, aisle.aisleBodyId)
    })
  })
  ensureArray(state?.noteAisleBodies).forEach((body) => {
    if (isRecord(body)) addEntityId(usedIds, body.id)
  })
  if (isRecord(state?.scratchpad)) {
    addEntityId(usedIds, state.scratchpad.noteBodyId)
    addEntityId(usedIds, state.scratchpad.activeAisleId)
  }
  return usedIds
}

function createBlankNoteBodyContent(noteBodyId, seed, usedIds) {
  const aisleId = allocateRepairId('repaired-aisle', seed, usedIds)
  const aisleBodyId = allocateRepairId('repaired-aisle-body', seed, usedIds)
  return {
    noteBody: {
      id: noteBodyId,
      aisles: [{ id: aisleId, aisleBodyId }],
    },
    noteAisleBody: {
      id: aisleBodyId,
      markdown: '',
      frontmatter: null,
      frontmatterStatus: 'none',
    },
  }
}

function hasRecordWithId(records, id) {
  return records.some((record) => isRecord(record) && record.id === id)
}

function ensureNoteBodyContent(noteBodyId, seed, noteBodies, noteAisleBodies, usedIds) {
  if (typeof noteBodyId !== 'string' || !noteBodyId) return
  let body = noteBodies.find((entry) => isRecord(entry) && entry.id === noteBodyId)
  if (!body) {
    const content = createBlankNoteBodyContent(noteBodyId, seed, usedIds)
    noteBodies.push(content.noteBody)
    noteAisleBodies.push(content.noteAisleBody)
    return
  }

  const sourceAisles = ensureArray(body.aisles).filter(isRecord)
  if (sourceAisles.length === 0) {
    const aisleId = allocateRepairId('repaired-aisle', seed, usedIds)
    const aisleBodyId = allocateRepairId('repaired-aisle-body', seed, usedIds)
    body.aisles = [{ id: aisleId, aisleBodyId }]
    noteAisleBodies.push({
      id: aisleBodyId,
      markdown: '',
      frontmatter: null,
      frontmatterStatus: 'none',
    })
    return
  }

  body.aisles = sourceAisles.map((aisle, index) => {
    const aisleId =
      typeof aisle.id === 'string' && aisle.id ? aisle.id : allocateRepairId('repaired-aisle', `${seed}-${index}`, usedIds)
    const aisleBodyId =
      typeof aisle.aisleBodyId === 'string' && aisle.aisleBodyId
        ? aisle.aisleBodyId
        : allocateRepairId('repaired-aisle-body', `${seed}-${index}`, usedIds)
    if (!hasRecordWithId(noteAisleBodies, aisleBodyId)) {
      noteAisleBodies.push({
        id: aisleBodyId,
        markdown: '',
        frontmatter: null,
        frontmatterStatus: 'none',
      })
    }
    return { ...aisle, id: aisleId, aisleBodyId }
  })
}

function normalizeLiveTabForStorage(tab, seed, noteBodies, noteAisleBodies, usedIds) {
  if (!isRecord(tab)) return null
  const tabId = typeof tab.id === 'string' && tab.id ? tab.id : ''
  if (!tabId) return null
  const noteBodyId =
    typeof tab.noteBodyId === 'string' && tab.noteBodyId
      ? tab.noteBodyId
      : allocateRepairId('repaired-note-body', `${seed}-${tabId}`, usedIds)
  ensureNoteBodyContent(noteBodyId, `${seed}-${tabId}`, noteBodies, noteAisleBodies, usedIds)
  const subTabs = ensureArray(tab.subTabs)
    .map((subTab, index) => {
      if (!isRecord(subTab) || typeof subTab.id !== 'string' || !subTab.id) return null
      const subTabNoteBodyId =
        typeof subTab.noteBodyId === 'string' && subTab.noteBodyId
          ? subTab.noteBodyId
          : allocateRepairId('repaired-note-body', `${seed}-${subTab.id}-${index}`, usedIds)
      ensureNoteBodyContent(subTabNoteBodyId, `${seed}-${subTab.id}-${index}`, noteBodies, noteAisleBodies, usedIds)
      return {
        ...subTab,
        noteBodyId: subTabNoteBodyId,
      }
    })
    .filter(Boolean)
  const activeSubTabId =
    typeof tab.activeSubTabId === 'string' && subTabs.some((subTab) => subTab.id === tab.activeSubTabId)
      ? tab.activeSubTabId
      : null
  return {
    ...tab,
    title: typeof tab.title === 'string' && tab.title.trim() ? tab.title : DEFAULT_REPAIRED_TAB_TITLE,
    noteBodyId,
    activeSubTabId,
    subTabs,
  }
}

function createBlankStorageTab(seed, noteBodies, noteAisleBodies, usedIds) {
  const tabId = allocateRepairId('repaired-tab', seed, usedIds)
  const noteBodyId = allocateRepairId('repaired-note-body', seed, usedIds)
  const content = createBlankNoteBodyContent(noteBodyId, seed, usedIds)
  noteBodies.push(content.noteBody)
  noteAisleBodies.push(content.noteAisleBody)
  return {
    id: tabId,
    title: DEFAULT_REPAIRED_TAB_TITLE,
    noteBodyId,
    activeSubTabId: null,
    subTabs: [],
  }
}

function reconcileStorageSpace(space, domainId, noteBodies, noteAisleBodies, usedIds, repairs) {
  const spaceId =
    typeof space?.id === 'string' && space.id
      ? space.id
      : allocateRepairId('repaired-space', domainId, usedIds)
  const rawData = isRecord(space?.data) ? space.data : {}
  let tabs = ensureArray(rawData.tabs)
    .map((tab, index) => normalizeLiveTabForStorage(tab, `${spaceId}-${index}`, noteBodies, noteAisleBodies, usedIds))
    .filter(Boolean)

  if (tabs.length === 0) {
    const fallback = createBlankStorageTab(spaceId, noteBodies, noteAisleBodies, usedIds)
    tabs = [fallback]
    repairs.push({
      code: 'space-has-no-readable-tabs',
      message: 'Space had no readable parent tabs; a blank parent tab was created.',
      spaceId,
    })
  }

  const activeTabId =
    typeof rawData.activeTabId === 'string' && tabs.some((tab) => tab.id === rawData.activeTabId)
      ? rawData.activeTabId
      : tabs[0].id

  return {
    ...space,
    id: spaceId,
    name: typeof space?.name === 'string' && space.name.trim() ? space.name : DEFAULT_REPAIRED_SPACE_NAME,
    settings: isRecord(space?.settings) ? space.settings : { autoRemoveDeletedDays: DEFAULT_AUTO_REMOVE_DAYS },
    data: {
      ...rawData,
      activeTabId,
      tabs,
      deletedTabs: ensureArray(rawData.deletedTabs),
      deletedSubTabs: ensureArray(rawData.deletedSubTabs),
    },
  }
}

function createBlankStorageSpace(domainId, noteBodies, noteAisleBodies, usedIds) {
  const spaceId = allocateRepairId('repaired-space', domainId, usedIds)
  const tab = createBlankStorageTab(spaceId, noteBodies, noteAisleBodies, usedIds)
  return {
    id: spaceId,
    name: DEFAULT_REPAIRED_SPACE_NAME,
    settings: { autoRemoveDeletedDays: DEFAULT_AUTO_REMOVE_DAYS },
    data: {
      activeTabId: tab.id,
      tabs: [tab],
      deletedTabs: [],
      deletedSubTabs: [],
    },
  }
}

function reconcileStorageDomain(domain, noteBodies, noteAisleBodies, usedIds, repairs) {
  const domainId =
    typeof domain?.id === 'string' && domain.id
      ? domain.id
      : allocateRepairId('repaired-domain', DEFAULT_DOMAIN_ID, usedIds)
  let spaces = ensureArray(domain?.spaces)
    .filter(isRecord)
    .map((space) => reconcileStorageSpace(space, domainId, noteBodies, noteAisleBodies, usedIds, repairs))

  if (spaces.length === 0) {
    const fallback = createBlankStorageSpace(domainId, noteBodies, noteAisleBodies, usedIds)
    spaces = [fallback]
    repairs.push({
      code: 'domain-has-no-readable-spaces',
      message: 'Domain had no readable spaces; a blank space was created.',
      domainId,
    })
  }

  const activeSpaceId =
    typeof domain?.activeSpaceId === 'string' && spaces.some((space) => space.id === domain.activeSpaceId)
      ? domain.activeSpaceId
      : spaces[0].id

  return {
    ...domain,
    id: domainId,
    name: getDomainTitle(domain ?? {}, DEFAULT_DOMAIN_NAME),
    activeSpaceId,
    spaces,
  }
}

function createBlankStorageDomain(noteBodies, noteAisleBodies, usedIds) {
  const domainId = usedIds.has(DEFAULT_DOMAIN_ID)
    ? allocateRepairId('repaired-domain', DEFAULT_DOMAIN_ID, usedIds)
    : DEFAULT_DOMAIN_ID
  usedIds.add(domainId)
  const space = createBlankStorageSpace(domainId, noteBodies, noteAisleBodies, usedIds)
  return {
    id: domainId,
    name: DEFAULT_DOMAIN_NAME,
    activeSpaceId: space.id,
    spaces: [space],
  }
}

/**
 * Ensures notebook storage never exposes an invalid live tree after files were manually deleted.
 *
 * @param {Record<string, unknown>} appState
 */
export function reconcileNotebookStorageState(appState) {
  const usedIds = collectNotebookStorageEntityIds(appState)
  const noteBodies = ensureArray(appState.noteBodies).filter(isRecord).map((body) => ({ ...body }))
  const noteAisleBodies = ensureArray(appState.noteAisleBodies).filter(isRecord).map((body) => ({ ...body }))
  const repairs = []
  let domains = ensureArray(appState.domains)
    .filter(isRecord)
    .map((domain) => reconcileStorageDomain(domain, noteBodies, noteAisleBodies, usedIds, repairs))

  if (domains.length === 0) {
    const fallback = createBlankStorageDomain(noteBodies, noteAisleBodies, usedIds)
    domains = [fallback]
    repairs.push({
      code: 'no-readable-domains',
      message: 'No readable domains were found; a blank notebook was created.',
    })
  }

  const activeDomainId =
    typeof appState.activeDomainId === 'string' && domains.some((domain) => domain.id === appState.activeDomainId)
      ? appState.activeDomainId
      : domains[0].id
  const activeDomain = domains.find((domain) => domain.id === activeDomainId) ?? domains[0]
  const activeSpaces = ensureArray(activeDomain.spaces).filter(isRecord)
  const activeSpaceId =
    typeof appState.activeSpaceId === 'string' && activeSpaces.some((space) => space.id === appState.activeSpaceId)
      ? appState.activeSpaceId
      : typeof activeDomain.activeSpaceId === 'string' && activeSpaces.some((space) => space.id === activeDomain.activeSpaceId)
        ? activeDomain.activeSpaceId
        : activeSpaces[0]?.id ?? ''

  return {
    state: {
      ...appState,
      activeDomainId,
      domains,
      noteBodies,
      noteAisleBodies,
      activeSpaceId,
      spaces: activeSpaces,
    },
    repairs,
  }
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
 * @param {Set<string>} ids
 * @param {unknown} value
 */
function addNoteBodyId(ids, value) {
  if (typeof value === 'string' && value) ids.add(value)
}

/**
 * @param {Record<string, unknown>} tab
 * @param {Set<string>} ids
 */
function collectNoteBodyIdsFromTab(tab, ids) {
  addNoteBodyId(ids, tab.noteBodyId)
  ensureArray(tab.subTabs).filter(isRecord).forEach((subTab) => {
    addNoteBodyId(ids, subTab.noteBodyId)
  })
}

/**
 * @param {unknown} data
 * @param {Set<string>} ids
 */
function collectNoteBodyIdsFromWorkspaceData(data, ids) {
  if (!isRecord(data)) return
  ensureArray(data.tabs).filter(isRecord).forEach((tab) => {
    collectNoteBodyIdsFromTab(tab, ids)
  })
  ensureArray(data.deletedTabs).filter(isRecord).forEach((entry) => {
    if (isRecord(entry.tab)) collectNoteBodyIdsFromTab(entry.tab, ids)
  })
  ensureArray(data.deletedSubTabs).filter(isRecord).forEach((entry) => {
    if (isRecord(entry.subTab)) addNoteBodyId(ids, entry.subTab.noteBodyId)
  })
}

/**
 * @param {unknown} space
 * @param {Set<string>} ids
 */
function collectNoteBodyIdsFromSpace(space, ids) {
  if (!isRecord(space)) return
  collectNoteBodyIdsFromWorkspaceData(space.data, ids)
}

/**
 * @param {unknown} entries
 * @param {Set<string>} ids
 */
function collectNoteBodyIdsFromDeletedSpaceEntries(entries, ids) {
  ensureArray(entries).filter(isRecord).forEach((entry) => {
    collectNoteBodyIdsFromSpace(entry.space, ids)
  })
}

/**
 * @param {Record<string, unknown>} appState
 * @returns {Set<string>}
 */
export function collectReferencedNoteBodyIdsFromAppState(appState) {
  const ids = new Set()
  if (isRecord(appState.scratchpad)) {
    addNoteBodyId(ids, appState.scratchpad.noteBodyId)
  }
  getDomainsFromAppState(appState).forEach((domain) => {
    ensureArray(domain.spaces).filter(isRecord).forEach((space) => {
      collectNoteBodyIdsFromSpace(space, ids)
    })
  })
  collectNoteBodyIdsFromDeletedSpaceEntries(appState.deletedSpaces, ids)
  ensureArray(appState.deletedDomains).filter(isRecord).forEach((entry) => {
    const domain = isRecord(entry.domain) ? entry.domain : {}
    ensureArray(domain.spaces).filter(isRecord).forEach((space) => {
      collectNoteBodyIdsFromSpace(space, ids)
    })
    collectNoteBodyIdsFromDeletedSpaceEntries(entry.deletedSpaces, ids)
  })
  return ids
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
