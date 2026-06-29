import type {
  AppMessage,
  AppMessageAffectedLocation,
  AppState,
  AppTheme,
  CustomThemeId,
  DeletedVaultItem,
  FrontmatterData,
  FrontmatterMeta,
  NoteAisle,
  NoteAisleBody,
  NoteBody,
  VaultFolder,
  VaultNote,
  VaultState,
  VaultTreeItem,
  ToastHistoryEntry,
  ToastTone,
} from '../types/app'
import { syncNoteAisleBodyMarkdownInState, syncNoteBodyAislesInState } from '../notes/aisle-body-state'
import { normalizeToolbarLayouts } from '../editor/toolbar-layouts'
import { createDefaultAppState } from './default-app-state.js'
import {
  createNoteBodyWithAisle,
  ensureValidActiveNote,
  materializeSyncedNoteBodiesInState,
  normalizeVaultTabsForItems,
  purgeOldDeletedVaultItems,
} from './vault'
import { CUSTOM_THEME_IDS, normalizeThemePaletteOverrides } from '../theme/vault-themes'
import {
  MAX_NOTE_FONT_SCALE,
  MAX_TOOLBAR_BUTTON_SCALE,
  MIN_NOTE_FONT_SCALE,
  MIN_TOOLBAR_BUTTON_SCALE,
  normalizeTableControlTargetMode,
  normalizeTableOfContentsScope,
  normalizeTabColorIndicatorPlacement,
} from '../settings/defaults'
import { normalizeHotkeySettings } from '../hotkeys/shortcuts'

const APP_THEMES: AppTheme[] = ['dark', 'light', 'cheese', 'custom1', 'custom2', 'custom3']
const MAX_NORMALIZED_TOAST_HISTORY_ENTRIES = 70
export const AUTO_PURGE_DAY_MS = 24 * 60 * 60 * 1000

function createDefaultState(): AppState {
  return createDefaultAppState() as AppState
}

export const DEFAULT_STATE: AppState = createDefaultState()

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function normalizeTimestamp(value: unknown, fallback: string): string {
  if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) return fallback
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString()
}

function normalizeNumber(value: unknown, fallback: number, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, value))
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.map((entry) => (typeof entry === 'string' ? entry.trim() : '')).filter(Boolean)))
}

function normalizeToastTone(value: unknown): ToastTone {
  return value === 'success' || value === 'error' ? value : 'warning'
}

function normalizeFrontmatterData(value: unknown): FrontmatterData | null {
  if (!isRecord(value)) return null
  return { ...value }
}

function normalizeFrontmatterMeta(value: unknown): FrontmatterMeta | undefined {
  return isRecord(value) ? { ...value } : undefined
}

function extractMarkdownTags(markdown: string): string[] {
  const tags = new Set<string>()
  for (const match of markdown.matchAll(/(^|[\s([{])#([A-Za-z0-9_/-]+)/g)) {
    tags.add(match[2])
  }
  return Array.from(tags).sort((left, right) => left.localeCompare(right))
}

function normalizeNoteAisle(raw: unknown, fallbackId: string): NoteAisle | null {
  if (!isRecord(raw)) return null
  const id = normalizeString(raw.id, fallbackId)
  const aisleBodyId = normalizeString(raw.aisleBodyId)
  if (!id || !aisleBodyId) return null
  return { id, aisleBodyId }
}

function normalizeNoteBody(raw: unknown): NoteBody | null {
  if (!isRecord(raw)) return null
  const id = normalizeString(raw.id)
  if (!id) return null
  const timestamp = new Date().toISOString()
  const aisles = Array.isArray(raw.aisles)
    ? raw.aisles.flatMap((aisle, index): NoteAisle[] => {
        const normalized = normalizeNoteAisle(aisle, `${id}-aisle-${index + 1}`)
        return normalized ? [normalized] : []
      })
    : []
  if (aisles.length === 0) return null
  return {
    id,
    createdAt: normalizeTimestamp(raw.createdAt, timestamp),
    updatedAt: normalizeTimestamp(raw.updatedAt, timestamp),
    aisles,
  }
}

function normalizeNoteAisleBody(raw: unknown): NoteAisleBody | null {
  if (!isRecord(raw)) return null
  const id = normalizeString(raw.id)
  if (!id) return null
  const markdown = typeof raw.markdown === 'string' ? raw.markdown : ''
  const timestamp = new Date().toISOString()
  return {
    id,
    createdAt: normalizeTimestamp(raw.createdAt, timestamp),
    updatedAt: normalizeTimestamp(raw.updatedAt, timestamp),
    markdown,
    tags: normalizeStringList(raw.tags).length > 0 ? normalizeStringList(raw.tags) : extractMarkdownTags(markdown),
    frontmatter: normalizeFrontmatterData(raw.frontmatter),
    frontmatterStatus:
      raw.frontmatterStatus === 'valid' || raw.frontmatterStatus === 'invalid' || raw.frontmatterStatus === 'none'
        ? raw.frontmatterStatus
        : 'none',
    frontmatterParseError: typeof raw.frontmatterParseError === 'string' ? raw.frontmatterParseError : undefined,
    frontmatterRaw: typeof raw.frontmatterRaw === 'string' ? raw.frontmatterRaw : undefined,
    frontmatterMeta: normalizeFrontmatterMeta(raw.frontmatterMeta),
  }
}

function normalizeVaultItem(raw: unknown): VaultTreeItem | null {
  if (!isRecord(raw)) return null
  const id = normalizeString(raw.id)
  const title = normalizeString(raw.title, raw.type === 'folder' ? 'Untitled folder' : 'Untitled')
  if (!id) return null
  if (raw.type === 'folder') {
    const children = Array.isArray(raw.children) ? raw.children.flatMap((child) => {
      const normalized = normalizeVaultItem(child)
      return normalized ? [normalized] : []
    }) : []
    return {
      type: 'folder',
      id,
      title,
      children,
    } satisfies VaultFolder
  }
  if (raw.type === 'note') {
    const noteBodyId = normalizeString(raw.noteBodyId)
    if (!noteBodyId) return null
    return {
      type: 'note',
      id,
      title,
      noteBodyId,
    } satisfies VaultNote
  }
  return null
}

function normalizeDeletedVaultItem(raw: unknown): DeletedVaultItem | null {
  if (!isRecord(raw)) return null
  const id = normalizeString(raw.id)
  const item = normalizeVaultItem(raw.item)
  if (!id || !item) return null
  return {
    id,
    deletedAt: normalizeNumber(raw.deletedAt, Date.now(), 0),
    item,
    originalParentFolderId: typeof raw.originalParentFolderId === 'string' ? raw.originalParentFolderId : null,
    originalIndex: Math.max(0, Math.floor(normalizeNumber(raw.originalIndex, 0, 0))),
  }
}

function normalizeVaultState(raw: unknown, fallback: VaultState): VaultState | null {
  if (!isRecord(raw) || !Array.isArray(raw.items)) return null
  const items = raw.items.flatMap((item): VaultTreeItem[] => {
    const normalized = normalizeVaultItem(item)
    return normalized ? [normalized] : []
  })
  if (items.length === 0) return null
  const deletedItems = Array.isArray(raw.deletedItems)
    ? raw.deletedItems.flatMap((entry): DeletedVaultItem[] => {
        const normalized = normalizeDeletedVaultItem(entry)
        return normalized ? [normalized] : []
      })
    : []
  return ensureValidActiveNote({
    activeNoteId: normalizeString(raw.activeNoteId, fallback.activeNoteId),
    openTabs: normalizeVaultTabsForItems(
      raw.openTabs,
      items,
      normalizeString(raw.activeNoteId, fallback.activeNoteId),
    ),
    items,
    deletedItems,
    settings: {
      autoRemoveDeletedDays: normalizeNumber(
        isRecord(raw.settings) ? raw.settings.autoRemoveDeletedDays : undefined,
        fallback.settings.autoRemoveDeletedDays,
        1,
        3650,
      ),
    },
  })
}

function normalizeAppMessageAffectedLocations(value: unknown): AppMessageAffectedLocation[] | undefined {
  if (!Array.isArray(value)) return undefined
  const locations = value.flatMap((entry): AppMessageAffectedLocation[] => {
    if (!isRecord(entry)) return []
    const label = normalizeString(entry.label, 'location')
    const noteId = isRecord(entry.location) ? normalizeString(entry.location.noteId) : ''
    return [
      {
        label,
        path: typeof entry.path === 'string' ? entry.path : undefined,
        noteBodyId: typeof entry.noteBodyId === 'string' ? entry.noteBodyId : undefined,
        aisleBodyId: typeof entry.aisleBodyId === 'string' ? entry.aisleBodyId : undefined,
        location: noteId ? { noteId } : undefined,
      },
    ]
  })
  return locations.length > 0 ? locations : undefined
}

function normalizeAppMessages(raw: unknown): AppMessage[] {
  if (!Array.isArray(raw)) return []
  const fallbackTimestamp = new Date().toISOString()
  return raw.flatMap((entry): AppMessage[] => {
    if (!isRecord(entry)) return []
    const type =
      entry.type === 'duplicate-auto-decoupled' || entry.type === 'storage-vault-recovered' ? entry.type : null
    const id = normalizeString(entry.id)
    if (!type || !id) return []
    return [
      {
        id,
        type,
        status: entry.status === 'dismissed' ? 'dismissed' : entry.status === 'acknowledged' ? 'acknowledged' : 'unread',
        createdAt: normalizeTimestamp(entry.createdAt, fallbackTimestamp),
        signature: normalizeString(entry.signature, id),
        title: normalizeString(entry.title, type === 'storage-vault-recovered' ? 'Recovered vault' : 'Duplicate note decoupled'),
        body: typeof entry.body === 'string' ? entry.body : '',
        anchorPath: typeof entry.anchorPath === 'string' ? entry.anchorPath : undefined,
        decoupledPaths: normalizeStringList(entry.decoupledPaths),
        affectedLocations: normalizeAppMessageAffectedLocations(entry.affectedLocations),
        failedVaultPath: typeof entry.failedVaultPath === 'string' ? entry.failedVaultPath : undefined,
        failedVaultAvailable:
          typeof entry.failedVaultAvailable === 'boolean' ? entry.failedVaultAvailable : undefined,
        activeVaultPath: typeof entry.activeVaultPath === 'string' ? entry.activeVaultPath : undefined,
        activeVaultName: typeof entry.activeVaultName === 'string' ? entry.activeVaultName : undefined,
        recoveryMode:
          entry.recoveryMode === 'disconnected-to-local' ||
          entry.recoveryMode === 'created-local' ||
          entry.recoveryMode === 'reset-default'
            ? entry.recoveryMode
            : undefined,
        issueSummary: normalizeStringList(entry.issueSummary),
      },
    ]
  })
}

function normalizeToastHistory(raw: unknown): ToastHistoryEntry[] {
  if (!Array.isArray(raw)) return []
  const fallbackTimestamp = new Date().toISOString()
  return raw
    .flatMap((entry): ToastHistoryEntry[] => {
      if (!isRecord(entry)) return []
      const id = typeof entry.id === 'number' && Number.isFinite(entry.id) ? entry.id : null
      const message = typeof entry.message === 'string' ? entry.message : ''
      if (id === null || !message) return []
      return [
        {
          id,
          createdAt: normalizeTimestamp(entry.createdAt, fallbackTimestamp),
          message,
          tone: normalizeToastTone(entry.tone),
        },
      ]
    })
    .slice(-MAX_NORMALIZED_TOAST_HISTORY_ENTRIES)
}

function collectNoteBodyIdsFromItems(items: VaultTreeItem[], ids = new Set<string>()): Set<string> {
  for (const item of items) {
    if (item.type === 'note') {
      ids.add(item.noteBodyId)
    } else {
      collectNoteBodyIdsFromItems(item.children, ids)
    }
  }
  return ids
}

function collectAisleBodyIds(noteBodies: NoteBody[]): Set<string> {
  const ids = new Set<string>()
  noteBodies.forEach((body) => body.aisles.forEach((aisle) => ids.add(aisle.aisleBodyId)))
  return ids
}

function ensureVaultBodies(state: AppState): AppState {
  const noteBodyMap = new Map(state.noteBodies.map((body) => [body.id, body]))
  const aisleBodyMap = new Map((state.noteAisleBodies ?? []).map((body) => [body.id, body]))
  const requiredNoteBodyIds = collectNoteBodyIdsFromItems(state.vault.items)
  const noteBodies = [...state.noteBodies]
  const noteAisleBodies = [...(state.noteAisleBodies ?? [])]

  requiredNoteBodyIds.forEach((noteBodyId) => {
    if (noteBodyMap.has(noteBodyId)) return
    const { noteBody, aisleBody } = createNoteBodyWithAisle('')
    const body = { ...noteBody, id: noteBodyId }
    noteBodies.push(body)
    noteAisleBodies.push(aisleBody)
    noteBodyMap.set(body.id, body)
    aisleBodyMap.set(aisleBody.id, aisleBody)
  })

  collectAisleBodyIds(noteBodies).forEach((aisleBodyId) => {
    if (aisleBodyMap.has(aisleBodyId)) return
    noteAisleBodies.push({
      id: aisleBodyId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      markdown: '',
      tags: [],
      frontmatter: null,
      frontmatterStatus: 'none',
    })
  })

  return {
    ...state,
    noteBodies,
    noteAisleBodies,
  }
}

export function normalizeAppState(raw: unknown): AppState {
  const fallback = createDefaultState()
  if (!isRecord(raw)) return fallback
  const vault = normalizeVaultState(raw.vault, fallback.vault)
  if (!vault) return fallback

  const noteBodies = Array.isArray(raw.noteBodies)
    ? raw.noteBodies.flatMap((body): NoteBody[] => {
        const normalized = normalizeNoteBody(body)
        return normalized ? [normalized] : []
      })
    : []
  const noteAisleBodies = Array.isArray(raw.noteAisleBodies)
    ? raw.noteAisleBodies.flatMap((body): NoteAisleBody[] => {
        const normalized = normalizeNoteAisleBody(body)
        return normalized ? [normalized] : []
      })
    : []

  const sidebarWidth = normalizeNumber(isRecord(raw.ui) ? raw.ui.sidebarWidth : undefined, fallback.ui.sidebarWidth, 212, 520)
  const ui = isRecord(raw.ui) ? raw.ui : {}
  const selectedCustomTheme =
    typeof ui.selectedCustomTheme === 'string' && CUSTOM_THEME_IDS.includes(ui.selectedCustomTheme as CustomThemeId)
      ? (ui.selectedCustomTheme as CustomThemeId)
      : fallback.ui.selectedCustomTheme
  const hotkeys = isRecord(raw.hotkeys) ? raw.hotkeys : {}
  const normalizedHotkeys = normalizeHotkeySettings(hotkeys)
  return materializeSyncedNoteBodiesInState(ensureVaultBodies({
    theme: APP_THEMES.includes(raw.theme as AppTheme) ? (raw.theme as AppTheme) : fallback.theme,
    vault,
    scratchpad: isRecord(raw.scratchpad)
      ? {
          noteBodyId: normalizeString(raw.scratchpad.noteBodyId, fallback.scratchpad?.noteBodyId ?? ''),
          activeAisleId: normalizeString(raw.scratchpad.activeAisleId) || undefined,
        }
      : fallback.scratchpad,
    messages: normalizeAppMessages(raw.messages),
    toastHistory: normalizeToastHistory(raw.toastHistory),
    noteBodies,
    noteAisleBodies,
    hotkeys: {
      shortcuts: normalizedHotkeys.shortcuts,
      newlineShortcuts: normalizedHotkeys.newlineShortcuts,
    },
    frontmatter: isRecord(raw.frontmatter)
      ? {
          templates: Array.isArray(raw.frontmatter.templates) ? raw.frontmatter.templates as AppState['frontmatter']['templates'] : [],
          settingsTemplateId: normalizeString(raw.frontmatter.settingsTemplateId),
          lastAppliedTemplateId: normalizeString(raw.frontmatter.lastAppliedTemplateId),
        }
      : fallback.frontmatter,
    ui: {
      ...fallback.ui,
      sidebarCollapsed: typeof ui.sidebarCollapsed === 'boolean' ? ui.sidebarCollapsed : fallback.ui.sidebarCollapsed,
      sidebarWidth,
      collapsedFolderIds: normalizeStringList(ui.collapsedFolderIds),
      tableAddTargetMode: normalizeTableControlTargetMode(ui.tableAddTargetMode),
      tableDeleteTargetMode: normalizeTableControlTargetMode(ui.tableDeleteTargetMode),
      tableOfContentsScope: normalizeTableOfContentsScope(ui.tableOfContentsScope),
      tabColorIndicatorPlacement: normalizeTabColorIndicatorPlacement(ui.tabColorIndicatorPlacement),
      noteFontScale: normalizeNumber(ui.noteFontScale, fallback.ui.noteFontScale, MIN_NOTE_FONT_SCALE, MAX_NOTE_FONT_SCALE),
      toolbarButtonScale: normalizeNumber(
        ui.toolbarButtonScale,
        fallback.ui.toolbarButtonScale ?? 1,
        MIN_TOOLBAR_BUTTON_SCALE,
        MAX_TOOLBAR_BUTTON_SCALE,
      ),
      selectedCustomTheme,
      themePalettes: normalizeThemePaletteOverrides(ui.themePalettes),
      noteCursorLocations: isRecord(ui.noteCursorLocations) ? ui.noteCursorLocations as AppState['ui']['noteCursorLocations'] : {},
      headingCollapseState: isRecord(ui.headingCollapseState) ? ui.headingCollapseState as AppState['ui']['headingCollapseState'] : {},
      aisleWidths: isRecord(ui.aisleWidths) ? ui.aisleWidths as AppState['ui']['aisleWidths'] : {},
      toolbarLayouts: normalizeToolbarLayouts(ui.toolbarLayouts),
      toolbarEditorShowNames: typeof ui.toolbarEditorShowNames === 'boolean' ? ui.toolbarEditorShowNames : fallback.ui.toolbarEditorShowNames,
      noteDropAutoExpandsFolders:
        typeof ui.noteDropAutoExpandsFolders === 'boolean'
          ? ui.noteDropAutoExpandsFolders
          : fallback.ui.noteDropAutoExpandsFolders,
    },
  }))
}

export function parseSavedState(serializedState: string | null | undefined): AppState {
  if (!serializedState) return createDefaultState()
  try {
    return normalizeAppState(JSON.parse(serializedState))
  } catch {
    return createDefaultState()
  }
}

export function applyAutoPurgeToAppState(state: AppState, now = Date.now()): AppState {
  const vault = purgeOldDeletedVaultItems(state.vault, now)
  return vault === state.vault ? state : { ...state, vault }
}

export function getNextAutoPurgeTimeForAppState(state: AppState, now = Date.now()): number | null {
  const days = state.vault.settings.autoRemoveDeletedDays
  if (!Number.isFinite(days) || days <= 0 || state.vault.deletedItems.length === 0) return null
  const oldestDeletedAt = state.vault.deletedItems.reduce(
    (oldest, entry) => Math.min(oldest, entry.deletedAt),
    Number.POSITIVE_INFINITY,
  )
  return Number.isFinite(oldestDeletedAt) ? Math.max(now, oldestDeletedAt + days * AUTO_PURGE_DAY_MS) : null
}

export function getAutoPurgeScheduleSignatureForAppState(state: AppState): string {
  const deletedSignature = state.vault.deletedItems
    .map((entry) => `${entry.id}:${entry.deletedAt}`)
    .sort()
    .join('|')
  return `${state.vault.settings.autoRemoveDeletedDays}:${deletedSignature}`
}

export function applyMarkdownToAppState(
  previous: AppState,
  noteId: string,
  aisleId: string,
  markdown: string,
  options: { syncAisleStructure?: boolean } = {},
): AppState {
  const note = findNote(previous.vault.items, noteId)
  if (!note) return previous
  const noteBody = previous.noteBodies.find((body) => body.id === note.noteBodyId)
  if (!noteBody) return previous
  const aisle = noteBody.aisles.find((candidate) => candidate.id === aisleId)
  if (!aisle) return previous
  let next = syncNoteAisleBodyMarkdownInState(previous, aisle.aisleBodyId, markdown)
  if (options.syncAisleStructure) {
    const body = next.noteBodies.find((candidate) => candidate.id === noteBody.id)
    if (body) next = syncNoteBodyAislesInState(next, body.id, body.aisles)
  }
  return next
}

function findNote(items: VaultTreeItem[], noteId: string): VaultNote | null {
  for (const item of items) {
    if (item.type === 'note' && item.id === noteId) return item
    if (item.type === 'folder') {
      const child = findNote(item.children, noteId)
      if (child) return child
    }
  }
  return null
}
