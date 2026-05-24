import { DEFAULT_NEWLINE_SHORTCUT_SETTINGS, DEFAULT_SHORTCUTS, normalizeHotkeySettings } from '../hotkeys/shortcuts'
import {
  FRONTMATTER_COMPUTED_VALUES,
  DEFAULT_FRONTMATTER_SETTINGS,
  normalizeFrontmatterData,
  normalizeFrontmatterSettings,
  splitMarkdownFrontmatter,
} from '../frontmatter/frontmatter'
import { normalizeMarkdownForPersistence } from '../markdown/markdown-utils'
import {
  DEFAULT_AUTO_REMOVE_DAYS,
  DEFAULT_UI_SETTINGS,
  APP_THEME_IDS,
  normalizeUiSettings,
} from '../settings/defaults'
import type {
  AppState,
  AppTheme,
  DeletedDomainEntry,
  DeletedSpaceEntry,
  Domain,
  FrontmatterComputedFieldMap,
  FrontmatterFieldOriginMap,
  FrontmatterMeta,
  NoteAisle,
  NoteAisleBody,
  NoteBody,
  Space,
  SubTab,
  Tab,
} from '../types/app'
import {
  getAisleBodyId,
  syncNoteAisleBodyMarkdownInState,
  syncNoteBodyAislesInState,
} from '../notes/aisle-body-state'
import {
  createDefaultDomain,
  createLegacyWrappedDomain,
  normalizeDomain,
  normalizeDomains,
  normalizeSpace,
  normalizeSpaces,
  projectActiveDomainState,
} from './domains'
import {
  applyAutoPurgeToWorkspace,
  createId,
  createTimestamp,
  getNextWorkspaceTrashAutoPurgeTime,
  normalizeWorkspaceData,
} from './workspace'
import { migrateRawAppData } from './app-migrations'

const DEFAULT_DOMAIN = createDefaultDomain()

const RAW_DEFAULT_STATE: AppState = {
  theme: 'dawn',
  activeDomainId: DEFAULT_DOMAIN.id,
  domains: [DEFAULT_DOMAIN],
  deletedDomains: [],
  deletedSpaces: [],
  noteBodies: [],
  noteAisleBodies: [],
  activeSpaceId: DEFAULT_DOMAIN.activeSpaceId,
  spaces: DEFAULT_DOMAIN.spaces,
  hotkeys: {
    shortcuts: DEFAULT_SHORTCUTS,
    newlineShortcuts: DEFAULT_NEWLINE_SHORTCUT_SETTINGS,
    enableMouseBackForward: true,
    enableGenericHistoryHotkeys: true,
  },
  frontmatter: DEFAULT_FRONTMATTER_SETTINGS,
  ui: DEFAULT_UI_SETTINGS,
}

function createNoteBodyWithId(id: string, markdown = ''): NoteBody {
  const timestamp = createTimestamp()
  const aisleBodyId = createId()
  return {
    id,
    createdAt: timestamp,
    updatedAt: timestamp,
    frontmatter: null,
    aisles: [
      {
        id: createId(),
        aisleBodyId,
        markdown: normalizeMarkdownForPersistence(markdown),
      },
    ],
  }
}

function normalizeTimestamp(value: unknown, fallback: string): string {
  if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) return fallback
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString()
}

function frontmatterTimestamp(frontmatter: NoteBody['frontmatter'], keys: string[]): unknown {
  if (!frontmatter) return undefined
  for (const key of keys) {
    const value = frontmatter[key]
    if (value != null) return value
  }
  return undefined
}

function normalizeStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const entries = Array.from(new Set(value.map((entry) => (typeof entry === 'string' ? entry.trim() : '')).filter(Boolean)))
  return entries.length > 0 ? entries : undefined
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
    if (!FRONTMATTER_COMPUTED_VALUES.includes(entry as FrontmatterComputedFieldMap[string])) return
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
  const templateDetachedKeys = normalizeStringList(candidate.templateDetachedKeys)
  if (templateDetachedKeys) meta.templateDetachedKeys = templateDetachedKeys
  return Object.keys(meta).length > 0 ? meta : undefined
}

function normalizeLegacyNoteBodyFrontmatterMeta(candidate: Record<string, unknown> | NoteBody): FrontmatterMeta | undefined {
  return normalizeFrontmatterMeta({
    templateId: candidate.frontmatterTemplateId,
    templateDerived: candidate.frontmatterTemplateDerived,
    templateFieldOrigins: candidate.frontmatterTemplateFieldOrigins,
    templateRemovedFieldIds: candidate.frontmatterTemplateRemovedFieldIds,
    computedFields: candidate.frontmatterComputedFields,
    templateDetachedKeys: candidate.frontmatterTemplateDetachedKeys,
  })
}

function mergeFrontmatterMeta(primary: FrontmatterMeta | undefined, fallback: FrontmatterMeta | undefined): FrontmatterMeta | undefined {
  if (!primary) return fallback
  if (!fallback) return primary
  return {
    ...fallback,
    ...primary,
    templateFieldOrigins: primary.templateFieldOrigins ?? fallback.templateFieldOrigins,
    templateRemovedFieldIds: primary.templateRemovedFieldIds ?? fallback.templateRemovedFieldIds,
    computedFields: primary.computedFields ?? fallback.computedFields,
    templateDetachedKeys: primary.templateDetachedKeys ?? fallback.templateDetachedKeys,
  }
}

function normalizeNoteAisleBodyRecord(
  candidate: Record<string, unknown>,
  fallbackTimestamp: string,
): NoteAisleBody | null {
  const id = typeof candidate.id === 'string' && candidate.id ? candidate.id : ''
  if (!id) return null
  const markdown = normalizeMarkdownForPersistence(typeof candidate.markdown === 'string' ? candidate.markdown : '')
  const savedFrontmatter = normalizeFrontmatterData(candidate.frontmatter)
  const split = splitMarkdownFrontmatter(markdown)
  const base = {
    id,
    createdAt: normalizeTimestamp(candidate.createdAt, fallbackTimestamp),
    updatedAt: normalizeTimestamp(candidate.updatedAt, fallbackTimestamp),
    frontmatterMeta: normalizeFrontmatterMeta(candidate.frontmatterMeta),
  }
  if (split.status === 'valid') {
    return {
      ...base,
      markdown: normalizeMarkdownForPersistence(split.markdown),
      frontmatter: split.frontmatter,
      frontmatterStatus: 'valid',
      frontmatterRaw: split.rawFrontmatter ?? undefined,
    }
  }
  if (split.status === 'invalid') {
    return {
      ...base,
      markdown,
      frontmatter: null,
      frontmatterStatus: 'invalid',
      frontmatterParseError: split.error,
      frontmatterRaw: split.rawFrontmatter ?? undefined,
    }
  }
  return {
    ...base,
    markdown,
    frontmatter: savedFrontmatter,
    frontmatterStatus: savedFrontmatter ? 'valid' : 'none',
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
        markdown: normalizeMarkdownForPersistence(typeof aisle.markdown === 'string' ? aisle.markdown : ''),
      }
    })
}

function normalizeNoteAisleBodies(raw: unknown): NoteAisleBody[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const bodies: NoteAisleBody[] = []
  const fallbackTimestamp = createTimestamp()
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const candidate = entry as Record<string, unknown>
    const body = normalizeNoteAisleBodyRecord(candidate, fallbackTimestamp)
    if (!body || seen.has(body.id)) continue
    seen.add(body.id)
    bodies.push(body)
  }
  return bodies
}

function applyLegacyFrontmatterToFirstAisle(
  aisleBody: NoteAisleBody,
  legacyFrontmatter: NoteBody['frontmatter'],
  legacyMeta: FrontmatterMeta | undefined,
): NoteAisleBody {
  const hasCanonicalFrontmatterBlock = aisleBody.frontmatterStatus === 'valid' && aisleBody.frontmatterRaw !== undefined
  const hasInvalidFrontmatter = aisleBody.frontmatterStatus === 'invalid'
  const frontmatter = hasCanonicalFrontmatterBlock || hasInvalidFrontmatter || !legacyFrontmatter
    ? aisleBody.frontmatter ?? null
    : legacyFrontmatter
  const frontmatterStatus = hasInvalidFrontmatter
    ? 'invalid'
    : frontmatter
      ? 'valid'
      : aisleBody.frontmatterStatus ?? 'none'
  return {
    ...aisleBody,
    frontmatter,
    frontmatterStatus,
    frontmatterMeta: mergeFrontmatterMeta(aisleBody.frontmatterMeta, legacyMeta),
  }
}

function clearLegacyNoteBodyFrontmatter(body: NoteBody): NoteBody {
  return {
    ...body,
    frontmatter: null,
    frontmatterTemplateId: undefined,
    frontmatterTemplateDerived: undefined,
    frontmatterTemplateFieldOrigins: undefined,
    frontmatterTemplateRemovedFieldIds: undefined,
    frontmatterComputedFields: undefined,
    frontmatterTemplateDetachedKeys: undefined,
  }
}

function normalizeNoteContent(
  rawNoteBodies: unknown,
  rawNoteAisleBodies: unknown,
): { noteBodies: NoteBody[]; noteAisleBodies: NoteAisleBody[] } {
  const noteBodies = normalizeNoteBodies(rawNoteBodies)
  const aisleBodyMap = new Map(normalizeNoteAisleBodies(rawNoteAisleBodies).map((body) => [body.id, body]))
  const fallbackTimestamp = createTimestamp()
  const syncedNoteBodies = noteBodies.map((body) => ({
    ...clearLegacyNoteBodyFrontmatter(body),
    aisles: body.aisles.map((aisle, index) => {
      const aisleBodyId = getAisleBodyId(aisle)
      const existing = aisleBodyMap.get(aisleBodyId)
      let aisleBody = existing ?? normalizeNoteAisleBodyRecord(
        {
          id: aisleBodyId,
          createdAt: body.createdAt ?? fallbackTimestamp,
          updatedAt: body.updatedAt ?? fallbackTimestamp,
          markdown: aisle.markdown,
        },
        fallbackTimestamp,
      )
      if (!aisleBody) {
        aisleBody = {
          id: aisleBodyId,
          createdAt: body.createdAt ?? fallbackTimestamp,
          updatedAt: body.updatedAt ?? fallbackTimestamp,
          markdown: aisle.markdown,
          frontmatter: null,
          frontmatterStatus: 'none',
        }
      }
      if (index === 0) {
        aisleBody = applyLegacyFrontmatterToFirstAisle(
          aisleBody,
          body.frontmatter,
          normalizeLegacyNoteBodyFrontmatterMeta(body),
        )
      }
      aisleBodyMap.set(aisleBodyId, aisleBody)
      return {
        ...aisle,
        aisleBodyId,
        markdown: aisleBody.markdown,
      }
    }),
  }))
  return { noteBodies: syncedNoteBodies, noteAisleBodies: Array.from(aisleBodyMap.values()) }
}

function normalizeNoteBodies(raw: unknown): NoteBody[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const bodies: NoteBody[] = []
  const fallbackTimestamp = createTimestamp()
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const candidate = entry as Record<string, unknown>
    const id = typeof candidate.id === 'string' && candidate.id ? candidate.id : createId()
    if (seen.has(id)) continue
    seen.add(id)
    const aisles = normalizeNoteAisles(candidate.aisles)
    const fallbackAisles =
      aisles.length > 0
        ? aisles
        : [
            {
              id: createId(),
              markdown: normalizeMarkdownForPersistence(typeof candidate.markdown === 'string' ? candidate.markdown : ''),
            },
          ]
    const frontmatter = normalizeFrontmatterData(candidate.frontmatter)
    const createdAt = normalizeTimestamp(
      candidate.createdAt ?? frontmatterTimestamp(frontmatter, ['createdAt', 'created']),
      fallbackTimestamp,
    )
    const updatedAt = normalizeTimestamp(
      candidate.updatedAt ?? frontmatterTimestamp(frontmatter, ['updatedAt', 'updated']),
      fallbackTimestamp,
    )
    bodies.push({
      id,
      createdAt,
      updatedAt,
      frontmatter,
      frontmatterTemplateId: typeof candidate.frontmatterTemplateId === 'string'
        ? candidate.frontmatterTemplateId.trim()
        : undefined,
      frontmatterTemplateDerived: typeof candidate.frontmatterTemplateDerived === 'boolean'
        ? candidate.frontmatterTemplateDerived
        : undefined,
      frontmatterTemplateFieldOrigins: normalizeFrontmatterFieldOrigins(candidate.frontmatterTemplateFieldOrigins),
      frontmatterTemplateRemovedFieldIds: normalizeStringList(candidate.frontmatterTemplateRemovedFieldIds),
      frontmatterComputedFields: normalizeFrontmatterComputedFields(candidate.frontmatterComputedFields),
      frontmatterTemplateDetachedKeys: normalizeStringList(candidate.frontmatterTemplateDetachedKeys),
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

function getFirstAisleMarkdown(noteBodies: Map<string, NoteBody>, noteBodyId: string, fallback: string): string {
  const body = noteBodies.get(noteBodyId)
  return body?.aisles[0]?.markdown ?? normalizeMarkdownForPersistence(fallback)
}

function ensureTabBodies(tab: Tab, noteBodies: Map<string, NoteBody>): Tab {
  const noteBodyId = tab.noteBodyId || createId()
  if (!noteBodies.has(noteBodyId)) {
    noteBodies.set(noteBodyId, createNoteBodyWithId(noteBodyId, tab.homeContent))
  }

  return {
    ...tab,
    noteBodyId,
    homeContent: getFirstAisleMarkdown(noteBodies, noteBodyId, tab.homeContent),
    subTabs: tab.subTabs.map((subTab) => ensureSubTabBody(subTab, noteBodies)),
  }
}

function ensureSubTabBody(subTab: SubTab, noteBodies: Map<string, NoteBody>): SubTab {
  const noteBodyId = subTab.noteBodyId || createId()
  if (!noteBodies.has(noteBodyId)) {
    noteBodies.set(noteBodyId, createNoteBodyWithId(noteBodyId, subTab.content))
  }

  return {
    ...subTab,
    noteBodyId,
    content: getFirstAisleMarkdown(noteBodies, noteBodyId, subTab.content),
  }
}

export function ensureNoteBodiesForAppState(appState: AppState): AppState {
  const projected = projectActiveDomainState(appState)
  const normalizedContent = normalizeNoteContent(projected.noteBodies, projected.noteAisleBodies)
  const noteBodies = new Map(normalizedContent.noteBodies.map((body) => [body.id, body]))

  const ensureSpaceBodies = (space: Space): Space => ({
    ...space,
    data: {
      ...space.data,
      tabs: space.data.tabs.map((tab) => ensureTabBodies(tab, noteBodies)),
      deletedTabs: space.data.deletedTabs.map((entry) => ({
        ...entry,
        tab: ensureTabBodies(entry.tab, noteBodies),
      })),
      deletedSubTabs: space.data.deletedSubTabs.map((entry) => ({
        ...entry,
        subTab: ensureSubTabBody(entry.subTab, noteBodies),
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
  const syncedContent = normalizeNoteContent(Array.from(noteBodies.values()), normalizedContent.noteAisleBodies)

  return projectActiveDomainState({
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
  })
}

export const DEFAULT_STATE: AppState = ensureNoteBodiesForAppState(RAW_DEFAULT_STATE)

function normalizeAppTheme(value: unknown): AppTheme {
  if (value === 'custom') return 'custom1'
  if (typeof value === 'string' && APP_THEME_IDS.includes(value as AppTheme)) return value as AppTheme
  if (value === 'dusk') return 'blues'
  return 'dawn'
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

  return nextPurgeAt
}

export function getAutoPurgeScheduleSignatureForAppState(appState: AppState): string {
  const projected = projectActiveDomainState(appState)
  return projected.domains
    .map((domain) =>
      [
        domain.id,
        ...domain.spaces.map((space) =>
          [
            space.id,
            space.settings.autoRemoveDeletedDays,
            ...space.data.deletedTabs.map((entry) => `tab:${entry.id}:${entry.deletedAt}`),
            ...space.data.deletedSubTabs.map((entry) => `sub:${entry.id}:${entry.deletedAt}`),
          ].join(','),
        ),
      ].join('|'),
    )
    .join('||')
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

  if (!spacesChanged && !domainsChanged && projected === appState) return appState
  return projectActiveDomainState({
    ...projected,
    spaces,
    domains,
  })
}

export function parseSavedState(raw: string | null): AppState {
  if (!raw) return DEFAULT_STATE

  try {
    const rawParsed = JSON.parse(raw) as Record<string, unknown>
    const migration = migrateRawAppData(rawParsed)
    if (!migration.ok) return DEFAULT_STATE
    const parsed = migration.data
    const theme = normalizeAppTheme(parsed.theme)
    const parsedDomains = normalizeDomains(parsed.domains)

    if (parsedDomains.length > 0 || (Array.isArray(parsed.spaces) && parsed.spaces.length > 0)) {
      const legacySpaces = normalizeSpaces(parsed.spaces)
      const rawActiveSpaceId = typeof parsed.activeSpaceId === 'string' ? parsed.activeSpaceId : null
      const domains: Domain[] =
        parsedDomains.length > 0
          ? parsedDomains
          : [createLegacyWrappedDomain(legacySpaces, rawActiveSpaceId)]
      const rawActiveDomainId = typeof parsed.activeDomainId === 'string' ? parsed.activeDomainId : null
      const activeDomain =
        (rawActiveDomainId ? domains.find((domain) => domain.id === rawActiveDomainId) : null) ?? domains[0]
      const spaces: Space[] = legacySpaces.length > 0 ? legacySpaces : activeDomain.spaces
      const activeSpaceId =
        rawActiveSpaceId && spaces.some((space) => space.id === rawActiveSpaceId)
          ? rawActiveSpaceId
          : activeDomain.activeSpaceId && spaces.some((space) => space.id === activeDomain.activeSpaceId)
            ? activeDomain.activeSpaceId
            : spaces[0].id

      const noteContent = normalizeNoteContent(parsed.noteBodies, parsed.noteAisleBodies)

      return ensureNoteBodiesForAppState(projectActiveDomainState({
        theme,
        activeDomainId: activeDomain.id,
        domains,
        deletedDomains: normalizeDeletedDomainEntries(parsed.deletedDomains),
        deletedSpaces: normalizeDeletedSpaceEntries(parsed.deletedSpaces),
        noteBodies: noteContent.noteBodies,
        noteAisleBodies: noteContent.noteAisleBodies,
        activeSpaceId,
        spaces,
        hotkeys: normalizeHotkeySettings(parsed.hotkeys),
        frontmatter: normalizeFrontmatterSettings(parsed.frontmatter),
        ui: normalizeUiSettings(parsed.ui),
      }))
    }

    // Legacy single-workspace migration
    const migratedSpace: Space = {
      id: 'getting-started-space',
      name: 'first steps',
      settings: { autoRemoveDeletedDays: DEFAULT_AUTO_REMOVE_DAYS },
      data: applyAutoPurgeToWorkspace(normalizeWorkspaceData(parsed), DEFAULT_AUTO_REMOVE_DAYS),
    }
    const migratedDomain = createLegacyWrappedDomain([migratedSpace], migratedSpace.id)
    const noteContent = normalizeNoteContent(parsed.noteBodies, parsed.noteAisleBodies)
    return ensureNoteBodiesForAppState(projectActiveDomainState({
      theme,
      activeDomainId: migratedDomain.id,
      domains: [migratedDomain],
      deletedDomains: normalizeDeletedDomainEntries(parsed.deletedDomains),
      deletedSpaces: normalizeDeletedSpaceEntries(parsed.deletedSpaces),
      noteBodies: noteContent.noteBodies,
      noteAisleBodies: noteContent.noteAisleBodies,
      activeSpaceId: migratedSpace.id,
      spaces: [migratedSpace],
      hotkeys: normalizeHotkeySettings(parsed.hotkeys),
      frontmatter: normalizeFrontmatterSettings(parsed.frontmatter),
      ui: normalizeUiSettings(parsed.ui),
    }))
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

  projected.spaces.forEach((space) => {
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
