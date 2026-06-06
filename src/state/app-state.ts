import { DEFAULT_NEWLINE_SHORTCUT_SETTINGS, DEFAULT_SHORTCUTS, normalizeHotkeySettings } from '../hotkeys/shortcuts'
import {
  createDefaultFrontmatterSettings,
  getFrontmatterComputedValues,
  normalizeFrontmatterData,
  normalizeFrontmatterSettings,
  splitMarkdownFrontmatter,
} from '../frontmatter/frontmatter'
import { normalizeMarkdownForPersistence } from '../markdown/markdown-utils'
import {
  extractMarkdownTags,
  materializeComputedFrontmatterTags,
  migrateAisleTags,
} from '../tags/tags.js'
import {
  DEFAULT_AUTO_REMOVE_DAYS,
  DEFAULT_UI_SETTINGS,
  APP_THEME_IDS,
  clampAutoRemoveDays,
  normalizeUiSettings,
} from '../settings/defaults'
import type {
  AppMessage,
  AppMessageAffectedLocation,
  AppState,
  AppTheme,
  DeletedDomainEntry,
  DeletedSpaceEntry,
  FrontmatterComputedFieldMap,
  FrontmatterFieldOriginMap,
  FrontmatterMeta,
  NoteAisle,
  NoteAisleBody,
  NoteBody,
  NoteLocation,
  Space,
  SubTab,
  Tab,
  ToastHistoryEntry,
  ToastTone,
} from '../types/app'
import {
  getAisleBodyId,
  syncNoteAisleBodyMarkdownInState,
  syncNoteBodyAislesInState,
} from '../notes/aisle-body-state'
import { pruneAisleWidthsForAppState } from '../notes/aisle-widths'
import {
  createDefaultDomain,
  normalizeDomain,
  normalizeDomains,
  normalizeSpace,
  projectActiveDomainState,
} from './domains'
import {
  applyAutoPurgeToWorkspace,
  AUTO_PURGE_DAY_MS,
  createId,
  createTimestamp,
  getNextWorkspaceTrashAutoPurgeTime,
} from './workspace'
import { getWorkspaceTrashAutoPurgeCutoff } from './workspace'
import {
  SCRATCHPAD_CONTENT_TARGET_ID,
  ensureScratchpadInAppState,
  normalizeScratchpadState,
} from './scratchpad'
import { repairAppStateEntityIds } from '../import/id-repair'

const DEFAULT_DOMAIN = createDefaultDomain()
const MAX_NORMALIZED_TOAST_HISTORY_ENTRIES = 70

const RAW_DEFAULT_STATE: AppState = {
  theme: 'dawn',
  activeDomainId: DEFAULT_DOMAIN.id,
  domains: [DEFAULT_DOMAIN],
  deletedDomains: [],
  deletedSpaces: [],
  scratchpad: normalizeScratchpadState(null),
  messages: [],
  toastHistory: [],
  noteBodies: [],
  noteAisleBodies: [],
  activeSpaceId: DEFAULT_DOMAIN.activeSpaceId,
  spaces: DEFAULT_DOMAIN.spaces,
  hotkeys: {
    shortcuts: DEFAULT_SHORTCUTS,
    newlineShortcuts: DEFAULT_NEWLINE_SHORTCUT_SETTINGS,
  },
  frontmatter: createDefaultFrontmatterSettings(),
  ui: DEFAULT_UI_SETTINGS,
}

function createNoteBodyContentWithId(id: string, markdown = ''): { noteBody: NoteBody; aisleBody: NoteAisleBody } {
  const timestamp = createTimestamp()
  const aisleBodyId = createId()
  return {
    noteBody: {
      id,
      createdAt: timestamp,
      updatedAt: timestamp,
      aisles: [
        {
          id: createId(),
          aisleBodyId,
        },
      ],
    },
    aisleBody: {
      id: aisleBodyId,
      createdAt: timestamp,
      updatedAt: timestamp,
      markdown,
      tags: extractMarkdownTags(markdown),
      frontmatter: null,
      frontmatterStatus: 'none',
    },
  }
}

function normalizeTimestamp(value: unknown, fallback: string): string {
  if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) return fallback
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString()
}

function normalizeStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const entries = Array.from(new Set(value.map((entry) => (typeof entry === 'string' ? entry.trim() : '')).filter(Boolean)))
  return entries.length > 0 ? entries : undefined
}

function normalizeToastTone(value: unknown): ToastTone {
  return value === 'success' || value === 'error' ? value : 'warning'
}

function normalizeNoteLocation(value: unknown): NoteLocation | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const candidate = value as Record<string, unknown>
  const domainId = typeof candidate.domainId === 'string' ? candidate.domainId.trim() : ''
  const spaceId = typeof candidate.spaceId === 'string' ? candidate.spaceId.trim() : ''
  const tabId = typeof candidate.tabId === 'string' ? candidate.tabId.trim() : ''
  const subTabId =
    candidate.subTabId === null || candidate.subTabId === undefined
      ? null
      : typeof candidate.subTabId === 'string'
        ? candidate.subTabId.trim()
        : undefined
  if (!domainId || !spaceId || !tabId || subTabId === undefined) return undefined
  return { domainId, spaceId, tabId, subTabId: subTabId || null }
}

function normalizeAppMessageAffectedLocations(value: unknown): AppMessageAffectedLocation[] | undefined {
  if (!Array.isArray(value)) return undefined
  const locations = value.flatMap((entry): AppMessageAffectedLocation[] => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
    const candidate = entry as Record<string, unknown>
    const label = typeof candidate.label === 'string' && candidate.label.trim() ? candidate.label.trim() : 'location'
    const location = normalizeNoteLocation(candidate.location)
    const path = typeof candidate.path === 'string' && candidate.path.trim() ? candidate.path.trim() : undefined
    const noteBodyId =
      typeof candidate.noteBodyId === 'string' && candidate.noteBodyId.trim() ? candidate.noteBodyId.trim() : undefined
    const aisleBodyId =
      typeof candidate.aisleBodyId === 'string' && candidate.aisleBodyId.trim()
        ? candidate.aisleBodyId.trim()
        : undefined
    return [{ label, ...(path ? { path } : {}), ...(noteBodyId ? { noteBodyId } : {}), ...(aisleBodyId ? { aisleBodyId } : {}), ...(location ? { location } : {}) }]
  })
  return locations.length > 0 ? locations : undefined
}

function normalizeAppMessages(raw: unknown): AppMessage[] {
  if (!Array.isArray(raw)) return []
  const fallbackTimestamp = createTimestamp()
  return raw.flatMap((entry): AppMessage[] => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
    const candidate = entry as Record<string, unknown>
    const type =
      candidate.type === 'duplicate-auto-decoupled' || candidate.type === 'storage-notebook-recovered'
        ? candidate.type
        : null
    if (!type) return []
    const id = typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim() : ''
    if (!id) return []
    const signature =
      typeof candidate.signature === 'string' && candidate.signature.trim() ? candidate.signature.trim() : id
    const title =
      typeof candidate.title === 'string' && candidate.title.trim()
        ? candidate.title.trim()
        : type === 'storage-notebook-recovered'
          ? 'Started local notebook'
          : 'duplicate files de-coupled'
    const body = typeof candidate.body === 'string' ? candidate.body : ''
    const anchorPath =
      typeof candidate.anchorPath === 'string' && candidate.anchorPath.trim() ? candidate.anchorPath.trim() : undefined
    const decoupledPaths = normalizeStringList(candidate.decoupledPaths)
    const affectedLocations = normalizeAppMessageAffectedLocations(candidate.affectedLocations)
    const failedNotebookPath =
      typeof candidate.failedNotebookPath === 'string' && candidate.failedNotebookPath.trim()
        ? candidate.failedNotebookPath.trim()
        : undefined
    const failedNotebookAvailable =
      typeof candidate.failedNotebookAvailable === 'boolean' ? candidate.failedNotebookAvailable : undefined
    const activeNotebookPath =
      typeof candidate.activeNotebookPath === 'string' && candidate.activeNotebookPath.trim()
        ? candidate.activeNotebookPath.trim()
        : undefined
    const activeNotebookName =
      typeof candidate.activeNotebookName === 'string' && candidate.activeNotebookName.trim()
        ? candidate.activeNotebookName.trim()
        : undefined
    const recoveryMode =
      candidate.recoveryMode === 'disconnected-to-local' ||
      candidate.recoveryMode === 'created-local' ||
      candidate.recoveryMode === 'reset-default'
        ? candidate.recoveryMode
        : undefined
    const issueSummary = normalizeStringList(candidate.issueSummary)
    return [{
      id,
      type,
      status:
        candidate.status === 'dismissed'
          ? 'dismissed'
          : candidate.status === 'acknowledged'
            ? 'acknowledged'
            : 'unread',
      createdAt: normalizeTimestamp(candidate.createdAt, fallbackTimestamp),
      signature,
      title,
      body,
      ...(anchorPath ? { anchorPath } : {}),
      ...(decoupledPaths ? { decoupledPaths } : {}),
      ...(affectedLocations ? { affectedLocations } : {}),
      ...(failedNotebookPath ? { failedNotebookPath } : {}),
      ...(failedNotebookAvailable !== undefined ? { failedNotebookAvailable } : {}),
      ...(activeNotebookPath ? { activeNotebookPath } : {}),
      ...(activeNotebookName ? { activeNotebookName } : {}),
      ...(recoveryMode ? { recoveryMode } : {}),
      ...(issueSummary ? { issueSummary } : {}),
    }]
  })
}

function normalizeToastHistory(raw: unknown): ToastHistoryEntry[] {
  if (!Array.isArray(raw)) return []
  const fallbackTimestamp = createTimestamp()
  return raw
    .flatMap((entry): ToastHistoryEntry[] => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
      const candidate = entry as Record<string, unknown>
      const id = typeof candidate.id === 'number' && Number.isFinite(candidate.id) ? candidate.id : null
      const message = typeof candidate.message === 'string' ? candidate.message : ''
      if (id === null || !message) return []
      return [{
        id,
        createdAt: normalizeTimestamp(candidate.createdAt, fallbackTimestamp),
        message,
        tone: normalizeToastTone(candidate.tone),
      }]
    })
    .slice(-MAX_NORMALIZED_TOAST_HISTORY_ENTRIES)
}

function normalizeFrontmatterFieldOrigins(value: unknown): FrontmatterFieldOriginMap | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const origins: FrontmatterFieldOriginMap = {}
  Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
    if (!key.trim() || !entry || typeof entry !== 'object' || Array.isArray(entry)) return
    const candidate = entry as Record<string, unknown>
    const templateId = typeof candidate.templateId === 'string' ? candidate.templateId.trim() : ''
    const fieldId = typeof candidate.fieldId === 'string' ? candidate.fieldId.trim() : ''
    if (!templateId || !fieldId) return
    origins[key] = { templateId, fieldId }
  })
  return origins
}

function normalizeFrontmatterComputedFields(value: unknown): FrontmatterComputedFieldMap | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const computedFields: FrontmatterComputedFieldMap = {}
  Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
    const normalizedKey = key.trim()
    if (!normalizedKey || typeof entry !== 'string' || entry === 'none') return
    if (!getFrontmatterComputedValues().includes(entry as FrontmatterComputedFieldMap[string])) return
    computedFields[normalizedKey] = entry as FrontmatterComputedFieldMap[string]
  })
  return Object.keys(computedFields).length > 0 ? computedFields : undefined
}

function normalizeFrontmatterMeta(value: unknown): FrontmatterMeta | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const candidate = value as Record<string, unknown>
  const meta: FrontmatterMeta = {}
  if (typeof candidate.templateId === 'string') meta.templateId = candidate.templateId.trim()
  if (typeof candidate.templateDerived === 'boolean') meta.templateDerived = candidate.templateDerived
  const templateFieldOrigins = normalizeFrontmatterFieldOrigins(candidate.templateFieldOrigins)
  if (templateFieldOrigins) meta.templateFieldOrigins = templateFieldOrigins
  const templateRemovedFieldIds = normalizeStringList(candidate.templateRemovedFieldIds)
  if (templateRemovedFieldIds) meta.templateRemovedFieldIds = templateRemovedFieldIds
  const computedFields = normalizeFrontmatterComputedFields(candidate.computedFields)
  if (computedFields) meta.computedFields = computedFields
  return Object.keys(meta).length > 0 ? meta : undefined
}

function normalizeNoteAisleBodyRecord(
  candidate: Record<string, unknown>,
  fallbackTimestamp: string,
): NoteAisleBody | null {
  const id = typeof candidate.id === 'string' && candidate.id ? candidate.id : ''
  if (!id) return null
  const markdown = normalizeMarkdownForPersistence(typeof candidate.markdown === 'string' ? candidate.markdown : '')
  const savedFrontmatter = normalizeFrontmatterData(candidate.frontmatter)
  const savedFrontmatterMeta = normalizeFrontmatterMeta(candidate.frontmatterMeta)
  const split = splitMarkdownFrontmatter(markdown)
  const base = {
    id,
    createdAt: normalizeTimestamp(candidate.createdAt, fallbackTimestamp),
    updatedAt: normalizeTimestamp(candidate.updatedAt, fallbackTimestamp),
    frontmatterMeta: savedFrontmatterMeta,
  }
  if (split.status === 'valid') {
    const migrated = migrateAisleTags({
      markdown: normalizeMarkdownForPersistence(split.markdown),
      frontmatter: split.frontmatter,
      frontmatterMeta: savedFrontmatterMeta,
    })
    return {
      ...base,
      markdown: normalizeMarkdownForPersistence(migrated.markdown),
      tags: migrated.tags,
      frontmatter: migrated.frontmatter,
      frontmatterStatus: 'valid',
      frontmatterRaw: split.rawFrontmatter ?? undefined,
      frontmatterMeta: migrated.frontmatterMeta,
    }
  }
  if (split.status === 'invalid') {
    return {
      ...base,
      markdown,
      tags: extractMarkdownTags(markdown),
      frontmatter: null,
      frontmatterStatus: 'invalid',
      frontmatterParseError: split.error,
      frontmatterRaw: split.rawFrontmatter ?? undefined,
    }
  }
  const migrated = migrateAisleTags({
    markdown,
    frontmatter: savedFrontmatter,
    frontmatterMeta: savedFrontmatterMeta,
  })
  return {
    ...base,
    markdown: normalizeMarkdownForPersistence(migrated.markdown),
    tags: migrated.tags,
    frontmatter: materializeComputedFrontmatterTags(migrated.frontmatter, migrated.frontmatterMeta, migrated.tags),
    frontmatterStatus: migrated.frontmatter ? 'valid' : savedFrontmatter ? 'valid' : 'none',
    frontmatterMeta: migrated.frontmatterMeta,
  }
}

function normalizeNoteAisles(raw: unknown): NoteAisle[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((aisle): aisle is Record<string, unknown> => Boolean(aisle) && typeof aisle === 'object')
    .map((aisle) => {
      const id = typeof aisle.id === 'string' && aisle.id ? aisle.id : createId()
      return {
        id,
        aisleBodyId: typeof aisle.aisleBodyId === 'string' && aisle.aisleBodyId ? aisle.aisleBodyId : id,
      }
    })
}

function normalizeNoteAisleBodies(raw: unknown): NoteAisleBody[] {
  if (!Array.isArray(raw)) return []
  const bodies: NoteAisleBody[] = []
  const fallbackTimestamp = createTimestamp()
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const candidate = entry as Record<string, unknown>
    const body = normalizeNoteAisleBodyRecord(candidate, fallbackTimestamp)
    if (!body) continue
    bodies.push(body)
  }
  return bodies
}

function normalizeNoteContent(
  rawNoteBodies: unknown,
  rawNoteAisleBodies: unknown,
): { noteBodies: NoteBody[]; noteAisleBodies: NoteAisleBody[] } {
  const noteBodies = normalizeNoteBodies(rawNoteBodies)
  const noteAisleBodies = normalizeNoteAisleBodies(rawNoteAisleBodies)
  const aisleBodyMap = new Map<string, NoteAisleBody>()
  noteAisleBodies.forEach((body) => {
    if (!aisleBodyMap.has(body.id)) aisleBodyMap.set(body.id, body)
  })
  const fallbackTimestamp = createTimestamp()
  const syncedNoteBodies = noteBodies.map((body) => ({
    ...body,
    aisles: body.aisles.map((aisle) => {
      const aisleBodyId = getAisleBodyId(aisle)
      const existing = aisleBodyMap.get(aisleBodyId)
      let aisleBody = existing ?? normalizeNoteAisleBodyRecord(
        {
          id: aisleBodyId,
          createdAt: body.createdAt ?? fallbackTimestamp,
          updatedAt: body.updatedAt ?? fallbackTimestamp,
          markdown: '',
        },
        fallbackTimestamp,
      )
      if (!aisleBody) {
        aisleBody = {
          id: aisleBodyId,
          createdAt: body.createdAt ?? fallbackTimestamp,
          updatedAt: body.updatedAt ?? fallbackTimestamp,
          markdown: '',
          tags: [],
          frontmatter: null,
          frontmatterStatus: 'none',
        }
      }
      aisleBodyMap.set(aisleBodyId, aisleBody)
      return {
        id: aisle.id,
        aisleBodyId,
      }
    }),
  }))
  const existingIds = new Set(noteAisleBodies.map((body) => body.id))
  const generatedBodies = Array.from(aisleBodyMap.values()).filter((body) => !existingIds.has(body.id))
  return { noteBodies: syncedNoteBodies, noteAisleBodies: [...noteAisleBodies, ...generatedBodies] }
}

function normalizeNoteBodies(raw: unknown): NoteBody[] {
  if (!Array.isArray(raw)) return []
  const bodies: NoteBody[] = []
  const fallbackTimestamp = createTimestamp()
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const candidate = entry as Record<string, unknown>
    const id = typeof candidate.id === 'string' && candidate.id ? candidate.id : createId()
    const aisles = normalizeNoteAisles(candidate.aisles)
    const fallbackAisleBodyId = createId()
    const fallbackAisles =
      aisles.length > 0
        ? aisles
        : [
            {
              id: createId(),
              aisleBodyId: fallbackAisleBodyId,
            },
          ]
    const createdAt = normalizeTimestamp(candidate.createdAt, fallbackTimestamp)
    const updatedAt = normalizeTimestamp(candidate.updatedAt, fallbackTimestamp)
    bodies.push({
      id,
      createdAt,
      updatedAt,
      aisles: fallbackAisles,
    })
  }
  return bodies
}

function normalizeDeletedSpaceEntries(raw: unknown): DeletedSpaceEntry[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .map((entry, index) => {
      const space = normalizeSpace(entry.space, index)
      if (!space) return null
      const deletedAt =
        typeof entry.deletedAt === 'number' && Number.isFinite(entry.deletedAt) ? entry.deletedAt : Date.now()
      const domainId = typeof entry.domainId === 'string' && entry.domainId ? entry.domainId : ''
      return {
        id: typeof entry.id === 'string' && entry.id ? entry.id : `deleted-space-${index}-${createId()}`,
        domainId,
        domainName:
          typeof entry.domainName === 'string' && entry.domainName.trim() ? entry.domainName : 'Unknown Domain',
        space,
        deletedAt,
      }
    })
    .filter((entry): entry is DeletedSpaceEntry => entry !== null)
}

function normalizeDeletedDomainEntries(raw: unknown): DeletedDomainEntry[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .map((entry, index) => {
      const domain = normalizeDomain(entry.domain, index)
      if (!domain) return null
      const deletedAt =
        typeof entry.deletedAt === 'number' && Number.isFinite(entry.deletedAt) ? entry.deletedAt : Date.now()
      return {
        id: typeof entry.id === 'string' && entry.id ? entry.id : `deleted-domain-${index}-${createId()}`,
        domain,
        deletedSpaces: normalizeDeletedSpaceEntries(entry.deletedSpaces),
        deletedAt,
      }
    })
    .filter((entry): entry is DeletedDomainEntry => entry !== null)
}

function ensureNoteBodyExists(
  noteBodies: Map<string, NoteBody>,
  noteAisleBodies: Map<string, NoteAisleBody>,
  noteBodyId: string,
) {
  if (noteBodies.has(noteBodyId)) return
  const content = createNoteBodyContentWithId(noteBodyId)
  noteBodies.set(noteBodyId, content.noteBody)
  noteAisleBodies.set(content.aisleBody.id, content.aisleBody)
}

function ensureTabBodies(tab: Tab, noteBodies: Map<string, NoteBody>, noteAisleBodies: Map<string, NoteAisleBody>): Tab {
  const noteBodyId = tab.noteBodyId || createId()
  ensureNoteBodyExists(noteBodies, noteAisleBodies, noteBodyId)

  return {
    ...tab,
    noteBodyId,
    subTabs: tab.subTabs.map((subTab) => ensureSubTabBody(subTab, noteBodies, noteAisleBodies)),
  }
}

function ensureSubTabBody(subTab: SubTab, noteBodies: Map<string, NoteBody>, noteAisleBodies: Map<string, NoteAisleBody>): SubTab {
  const noteBodyId = subTab.noteBodyId || createId()
  ensureNoteBodyExists(noteBodies, noteAisleBodies, noteBodyId)

  return {
    ...subTab,
    noteBodyId,
  }
}

export function ensureNoteBodiesForAppState(appState: AppState): AppState {
  const projected = projectActiveDomainState(appState)
  const normalizedContent = normalizeNoteContent(projected.noteBodies, projected.noteAisleBodies)
  const noteBodies = new Map(normalizedContent.noteBodies.map((body) => [body.id, body]))
  const noteAisleBodies = new Map(normalizedContent.noteAisleBodies.map((body) => [body.id, body]))

  const ensureSpaceBodies = (space: Space): Space => ({
    ...space,
    data: {
      ...space.data,
      tabs: space.data.tabs.map((tab) => ensureTabBodies(tab, noteBodies, noteAisleBodies)),
      deletedTabs: space.data.deletedTabs.map((entry) => ({
        ...entry,
        tab: ensureTabBodies(entry.tab, noteBodies, noteAisleBodies),
      })),
      deletedSubTabs: space.data.deletedSubTabs.map((entry) => ({
        ...entry,
        subTab: ensureSubTabBody(entry.subTab, noteBodies, noteAisleBodies),
      })),
    },
  })

  const domains = projected.domains.map((domain) => ({
    ...domain,
    spaces: domain.spaces.map((space) => ensureSpaceBodies(space)),
  }))

  const deletedSpaces = (projected.deletedSpaces ?? []).map((entry) => ({
    ...entry,
    space: ensureSpaceBodies(entry.space),
  }))

  const deletedDomains = (projected.deletedDomains ?? []).map((entry) => ({
    ...entry,
    domain: {
      ...entry.domain,
      spaces: entry.domain.spaces.map((space) => ensureSpaceBodies(space)),
    },
    deletedSpaces: entry.deletedSpaces.map((deletedSpace) => ({
      ...deletedSpace,
      space: ensureSpaceBodies(deletedSpace.space),
    })),
  }))

  const activeDomain = domains.find((domain) => domain.id === projected.activeDomainId) ?? domains[0]
  const spaces = activeDomain?.spaces ?? projected.spaces
  const syncedContent = normalizeNoteContent(Array.from(noteBodies.values()), Array.from(noteAisleBodies.values()))

  return ensureScratchpadInAppState(projectActiveDomainState({
    ...projected,
    domains,
    deletedDomains,
    deletedSpaces,
    noteBodies: syncedContent.noteBodies,
    noteAisleBodies: syncedContent.noteAisleBodies,
    activeSpaceId:
      activeDomain?.activeSpaceId && spaces.some((space) => space.id === activeDomain.activeSpaceId)
        ? activeDomain.activeSpaceId
        : projected.activeSpaceId,
    spaces,
  }))
}

export const DEFAULT_STATE: AppState = ensureNoteBodiesForAppState(RAW_DEFAULT_STATE)

function normalizeAppTheme(value: unknown): AppTheme {
  if (value === 'custom') return 'custom1'
  if (typeof value === 'string' && APP_THEME_IDS.includes(value as AppTheme)) return value as AppTheme
  return 'dawn'
}

function getSpaceAutoRemoveDeletedDays(space: Space): number {
  return space.settings.autoRemoveDeletedDays
}

function getSpaceAutoPurgeScheduleParts(space: Space): string[] {
  return [
    space.id,
    String(space.settings.autoRemoveDeletedDays),
    ...space.data.deletedTabs.map((entry) => `tab:${entry.id}:${entry.deletedAt}`),
    ...space.data.deletedSubTabs.map((entry) => `sub:${entry.id}:${entry.deletedAt}`),
  ]
}

function getDeletedEntryPurgeAt(deletedAt: number, autoRemoveDeletedDays: number): number | null {
  if (!Number.isFinite(deletedAt)) return null
  return deletedAt + clampAutoRemoveDays(autoRemoveDeletedDays) * AUTO_PURGE_DAY_MS
}

function getDeletedEntryAutoPurgeTime(deletedAt: number, autoRemoveDeletedDays: number, now: number): number | null {
  const purgeAt = getDeletedEntryPurgeAt(deletedAt, autoRemoveDeletedDays)
  if (purgeAt === null) return null
  return purgeAt <= now ? now : purgeAt
}

function isDeletedEntryExpired(deletedAt: number, autoRemoveDeletedDays: number, now: number): boolean {
  if (!Number.isFinite(deletedAt)) return false
  return deletedAt <= getWorkspaceTrashAutoPurgeCutoff(autoRemoveDeletedDays, now)
}

function getDeletedDomainPurgeAt(entry: DeletedDomainEntry): number | null {
  const purgeTimes = [
    ...(entry.domain.spaces.length > 0
      ? entry.domain.spaces.map((space) => getDeletedEntryPurgeAt(entry.deletedAt, getSpaceAutoRemoveDeletedDays(space)))
      : [getDeletedEntryPurgeAt(entry.deletedAt, DEFAULT_AUTO_REMOVE_DAYS)]),
    ...entry.deletedSpaces.map((spaceEntry) =>
      getDeletedEntryPurgeAt(spaceEntry.deletedAt, getSpaceAutoRemoveDeletedDays(spaceEntry.space)),
    ),
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  return purgeTimes.length > 0 ? Math.max(...purgeTimes) : null
}

function getDeletedDomainAutoPurgeTime(entry: DeletedDomainEntry, now: number): number | null {
  const purgeAt = getDeletedDomainPurgeAt(entry)
  if (purgeAt === null) return null
  return purgeAt <= now ? now : purgeAt
}

function isDeletedDomainExpired(entry: DeletedDomainEntry, now: number): boolean {
  const purgeAt = getDeletedDomainPurgeAt(entry)
  return purgeAt !== null && purgeAt <= now
}

function visitNextAutoPurgeTime(current: number | null, candidate: number | null, now: number): number | null {
  if (candidate === null) return current
  if (candidate <= now) return now
  if (current === null || candidate < current) return candidate
  return current
}

function getNextDeletedWorkspacePurgeTime(appState: AppState, now: number): number | null {
  let nextPurgeAt: number | null = null
  ;(appState.deletedSpaces ?? []).forEach((entry) => {
    nextPurgeAt = visitNextAutoPurgeTime(
      nextPurgeAt,
      getDeletedEntryAutoPurgeTime(entry.deletedAt, getSpaceAutoRemoveDeletedDays(entry.space), now),
      now,
    )
    nextPurgeAt = visitNextAutoPurgeTime(
      nextPurgeAt,
      getNextWorkspaceTrashAutoPurgeTime(entry.space.data, getSpaceAutoRemoveDeletedDays(entry.space), now),
      now,
    )
  })
  ;(appState.deletedDomains ?? []).forEach((entry) => {
    nextPurgeAt = visitNextAutoPurgeTime(
      nextPurgeAt,
      getDeletedDomainAutoPurgeTime(entry, now),
      now,
    )
    entry.domain.spaces.forEach((space) => {
      nextPurgeAt = visitNextAutoPurgeTime(
        nextPurgeAt,
        getNextWorkspaceTrashAutoPurgeTime(space.data, getSpaceAutoRemoveDeletedDays(space), now),
        now,
      )
    })
    entry.deletedSpaces.forEach((spaceEntry) => {
      nextPurgeAt = visitNextAutoPurgeTime(
        nextPurgeAt,
        getDeletedEntryAutoPurgeTime(spaceEntry.deletedAt, getSpaceAutoRemoveDeletedDays(spaceEntry.space), now),
        now,
      )
      nextPurgeAt = visitNextAutoPurgeTime(
        nextPurgeAt,
        getNextWorkspaceTrashAutoPurgeTime(spaceEntry.space.data, getSpaceAutoRemoveDeletedDays(spaceEntry.space), now),
        now,
      )
    })
  })
  return nextPurgeAt
}

function applyAutoPurgeToDeletedSpaceEntry(entry: DeletedSpaceEntry, now: number): DeletedSpaceEntry | null {
  const autoRemoveDeletedDays = getSpaceAutoRemoveDeletedDays(entry.space)
  if (isDeletedEntryExpired(entry.deletedAt, autoRemoveDeletedDays, now)) return null
  const data = applyAutoPurgeToWorkspace(entry.space.data, autoRemoveDeletedDays, now)
  return data === entry.space.data
    ? entry
    : {
        ...entry,
        space: {
          ...entry.space,
          data,
        },
      }
}

function applyAutoPurgeToDeletedSpaceEntries(entries: DeletedSpaceEntry[], now: number): DeletedSpaceEntry[] {
  let changed = false
  const nextEntries = entries.flatMap((entry) => {
    const nextEntry = applyAutoPurgeToDeletedSpaceEntry(entry, now)
    if (nextEntry !== entry) changed = true
    return nextEntry ? [nextEntry] : []
  })
  return changed ? nextEntries : entries
}

function applyAutoPurgeToDeletedDomainEntry(entry: DeletedDomainEntry, now: number): DeletedDomainEntry | null {
  if (isDeletedDomainExpired(entry, now)) return null

  let spacesChanged = false
  const spaces = entry.domain.spaces.map((space) => {
    const data = applyAutoPurgeToWorkspace(space.data, getSpaceAutoRemoveDeletedDays(space), now)
    if (data === space.data) return space
    spacesChanged = true
    return {
      ...space,
      data,
    }
  })
  const deletedSpaces = applyAutoPurgeToDeletedSpaceEntries(entry.deletedSpaces, now)
  if (spaces.length === 0 && deletedSpaces.length === 0) return null
  if (!spacesChanged && deletedSpaces === entry.deletedSpaces) return entry

  return {
    ...entry,
    domain: {
      ...entry.domain,
      activeSpaceId: spaces.some((space) => space.id === entry.domain.activeSpaceId)
        ? entry.domain.activeSpaceId
        : spaces[0]?.id ?? '',
      spaces,
    },
    deletedSpaces,
  }
}

function applyAutoPurgeToDeletedDomainEntries(entries: DeletedDomainEntry[], now: number): DeletedDomainEntry[] {
  let changed = false
  const nextEntries = entries.flatMap((entry) => {
    const nextEntry = applyAutoPurgeToDeletedDomainEntry(entry, now)
    if (nextEntry !== entry) changed = true
    return nextEntry ? [nextEntry] : []
  })
  return changed ? nextEntries : entries
}

export function getNextAutoPurgeTimeForAppState(appState: AppState, now = Date.now()): number | null {
  const projected = projectActiveDomainState(appState)
  let nextPurgeAt: number | null = null

  projected.domains.forEach((domain) => {
    domain.spaces.forEach((space) => {
      const spacePurgeAt = getNextWorkspaceTrashAutoPurgeTime(
        space.data,
        space.settings.autoRemoveDeletedDays,
        now,
      )
      if (spacePurgeAt === null) return
      if (spacePurgeAt <= now) {
        nextPurgeAt = now
        return
      }
      if (nextPurgeAt === null || spacePurgeAt < nextPurgeAt) {
        nextPurgeAt = spacePurgeAt
      }
    })
  })

  nextPurgeAt = visitNextAutoPurgeTime(nextPurgeAt, getNextDeletedWorkspacePurgeTime(projected, now), now)

  return nextPurgeAt
}

export function getAutoPurgeScheduleSignatureForAppState(appState: AppState): string {
  const projected = projectActiveDomainState(appState)
  const liveDomainSignature = projected.domains
    .map((domain) =>
      [
        domain.id,
        ...domain.spaces.map((space) => getSpaceAutoPurgeScheduleParts(space).join(',')),
      ].join('|'),
    )
    .join('||')
  const deletedDomainSignature = (projected.deletedDomains ?? [])
    .map((entry) =>
      [
        entry.id,
        entry.deletedAt,
        getDeletedDomainPurgeAt(entry) ?? '',
        ...entry.domain.spaces.map((space) => getSpaceAutoPurgeScheduleParts(space).join(':')),
        ...entry.deletedSpaces.map((spaceEntry) =>
          [spaceEntry.id, spaceEntry.deletedAt, ...getSpaceAutoPurgeScheduleParts(spaceEntry.space)].join(':'),
        ),
      ].join(','),
    )
    .join('|')
  const deletedSpaceSignature = (projected.deletedSpaces ?? [])
    .map((entry) => [entry.id, entry.deletedAt, ...getSpaceAutoPurgeScheduleParts(entry.space)].join(':'))
    .join('|')
  return [liveDomainSignature, deletedDomainSignature, deletedSpaceSignature].join('::deleted-workspace::')
}

export function applyAutoPurgeToAppState(appState: AppState, now = Date.now()): AppState {
  const projected = projectActiveDomainState(appState)
  let spacesChanged = false
  const spaces = projected.spaces.map((space) => {
    const nextData = applyAutoPurgeToWorkspace(space.data, space.settings.autoRemoveDeletedDays, now)
    if (nextData === space.data) return space
    spacesChanged = true
    return {
      ...space,
      data: nextData,
    }
  })
  let domainsChanged = false
  const domains = projected.domains.map((domain) => {
    const sourceSpaces = domain.id === projected.activeDomainId ? spaces : domain.spaces
    let domainSpacesChanged = domain.id === projected.activeDomainId && spacesChanged
    const nextSpaces = sourceSpaces.map((space) => {
      if (domain.id === projected.activeDomainId && spacesChanged) return space
      const nextData = applyAutoPurgeToWorkspace(space.data, space.settings.autoRemoveDeletedDays, now)
      if (nextData === space.data) return space
      domainSpacesChanged = true
      return {
        ...space,
        data: nextData,
      }
    })

    if (!domainSpacesChanged) return domain
    domainsChanged = true
    return {
      ...domain,
      spaces: nextSpaces,
    }
  })
  const projectedDeletedDomains = projected.deletedDomains ?? []
  const projectedDeletedSpaces = projected.deletedSpaces ?? []
  const deletedDomains = applyAutoPurgeToDeletedDomainEntries(projectedDeletedDomains, now)
  const deletedSpaces = applyAutoPurgeToDeletedSpaceEntries(projectedDeletedSpaces, now)

  const hasWorkspaceChanges =
    spacesChanged ||
    domainsChanged ||
    deletedDomains !== projectedDeletedDomains ||
    deletedSpaces !== projectedDeletedSpaces ||
    projected !== appState
  const nextState = hasWorkspaceChanges
    ? projectActiveDomainState({
        ...projected,
        spaces,
        domains,
        deletedDomains,
        deletedSpaces,
      })
    : appState
  const previousAisleWidths = nextState.ui.aisleWidths ?? {}
  const aisleWidths = pruneAisleWidthsForAppState(previousAisleWidths, nextState)
  if (aisleWidths === previousAisleWidths) return nextState
  return {
    ...nextState,
    ui: {
      ...nextState.ui,
      aisleWidths,
    },
  }
}

export function parseSavedState(raw: string | null): AppState {
  if (!raw) return DEFAULT_STATE

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const theme = normalizeAppTheme(parsed.theme)
    const parsedDomains = normalizeDomains(parsed.domains)
    if (parsedDomains.length === 0) return DEFAULT_STATE

    const rawActiveDomainId = typeof parsed.activeDomainId === 'string' ? parsed.activeDomainId : null
    const activeDomain =
      (rawActiveDomainId ? parsedDomains.find((domain) => domain.id === rawActiveDomainId) : null) ?? parsedDomains[0]
    const spaces: Space[] = Array.isArray(parsed.spaces) && parsed.spaces.length > 0
      ? activeDomain.spaces
      : activeDomain.spaces
    const rawActiveSpaceId = typeof parsed.activeSpaceId === 'string' ? parsed.activeSpaceId : null
    const activeSpaceId =
      rawActiveSpaceId && spaces.some((space) => space.id === rawActiveSpaceId)
        ? rawActiveSpaceId
        : activeDomain.activeSpaceId && spaces.some((space) => space.id === activeDomain.activeSpaceId)
          ? activeDomain.activeSpaceId
          : spaces[0]?.id ?? ''

    const noteContent = normalizeNoteContent(parsed.noteBodies, parsed.noteAisleBodies)
    const normalizedState = projectActiveDomainState({
      theme,
      activeDomainId: activeDomain.id,
      domains: parsedDomains,
      deletedDomains: normalizeDeletedDomainEntries(parsed.deletedDomains),
      deletedSpaces: normalizeDeletedSpaceEntries(parsed.deletedSpaces),
      scratchpad: normalizeScratchpadState(parsed.scratchpad),
      messages: normalizeAppMessages(parsed.messages),
      toastHistory: normalizeToastHistory(parsed.toastHistory),
      noteBodies: noteContent.noteBodies,
      noteAisleBodies: noteContent.noteAisleBodies,
      activeSpaceId,
      spaces,
      hotkeys: normalizeHotkeySettings(parsed.hotkeys),
      frontmatter: normalizeFrontmatterSettings(parsed.frontmatter),
      ui: normalizeUiSettings(parsed.ui),
    })
    const repairedState = repairAppStateEntityIds(normalizedState).state
    return ensureNoteBodiesForAppState(repairedState)
  } catch {
    return DEFAULT_STATE
  }
}

export function applyMarkdownToAppState(
  previous: AppState,
  spaceId: string,
  tabId: string,
  subTabId: string | null,
  aisleId: string,
  markdown: string,
  options: { aisleBodyId?: string | null } = {},
): AppState {
  const normalizedMarkdown = normalizeMarkdownForPersistence(markdown)
  const projected = ensureNoteBodiesForAppState(previous)
  let targetNoteBodyId: string | null = null

  if (spaceId === SCRATCHPAD_CONTENT_TARGET_ID && tabId === SCRATCHPAD_CONTENT_TARGET_ID) {
    targetNoteBodyId = normalizeScratchpadState(projected.scratchpad).noteBodyId
  }

  if (!targetNoteBodyId) projected.spaces.forEach((space) => {
    if (space.id !== spaceId) return space

    const data = space.data
    data.tabs.forEach((tab) => {
      if (tab.id !== tabId) return tab

      if (subTabId === null) {
        targetNoteBodyId = tab.noteBodyId
        return tab
      }

      tab.subTabs.forEach((sub) => {
        if (sub.id !== subTabId) return sub
        targetNoteBodyId = sub.noteBodyId
        return sub
      })
    })
  })

  if (!targetNoteBodyId) return projected
  const targetBody = projected.noteBodies.find((body) => body.id === targetNoteBodyId)
  if (!targetBody) return projected

  const explicitAisleBodyId = typeof options.aisleBodyId === 'string' ? options.aisleBodyId.trim() : ''
  if (explicitAisleBodyId && targetBody.aisles.some((aisle) => getAisleBodyId(aisle) === explicitAisleBodyId)) {
    return syncNoteAisleBodyMarkdownInState(projected, explicitAisleBodyId, normalizedMarkdown)
  }

  const targetAisleId = aisleId || targetBody.aisles[0]?.id || createId()
  const targetAisle = targetBody.aisles.find((aisle, index) => aisle.id === targetAisleId || (!aisleId && index === 0))
  if (targetAisle) {
    return syncNoteAisleBodyMarkdownInState(projected, getAisleBodyId(targetAisle), normalizedMarkdown)
  }

  if (aisleId) return projected

  return syncNoteBodyAislesInState(projected, targetNoteBodyId, [
    ...targetBody.aisles,
    { id: targetAisleId, aisleBodyId: createId(), markdown: normalizedMarkdown },
  ])
}
