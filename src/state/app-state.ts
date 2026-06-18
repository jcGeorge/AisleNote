import type {
  AppMessage,
  AppMessageAffectedLocation,
  AppState,
  AppTheme,
  CustomThemeId,
  DeletedNotebookItem,
  FrontmatterData,
  FrontmatterMeta,
  NoteAisle,
  NoteAisleBody,
  NoteBody,
  NotebookFolder,
  NotebookNote,
  NotebookState,
  NotebookTreeItem,
  ToastHistoryEntry,
  ToastTone,
} from '../types/app'
import { syncNoteAisleBodyMarkdownInState, syncNoteBodyAislesInState } from '../notes/aisle-body-state'
import { normalizeToolbarLayouts } from '../editor/toolbar-layouts'
import {
  createDefaultAppState,
  DEFAULT_SHORTCUTS as DEFAULT_APP_SHORTCUTS,
} from './default-app-state.js'
import { createNoteBodyWithAisle, ensureValidActiveNote, purgeOldDeletedNotebookItems } from './notebook'
import { CUSTOM_THEME_IDS, normalizeThemePaletteOverrides } from '../theme/notebook-themes'
import {
  MAX_NOTE_FONT_SCALE,
  MAX_TOOLBAR_BUTTON_SCALE,
  MIN_NOTE_FONT_SCALE,
  MIN_TOOLBAR_BUTTON_SCALE,
} from '../settings/defaults'

const APP_THEMES: AppTheme[] = ['dark', 'light', 'dawn', 'custom1', 'custom2', 'custom3']
const MAX_NORMALIZED_TOAST_HISTORY_ENTRIES = 70
export const AUTO_PURGE_DAY_MS = 24 * 60 * 60 * 1000

const DEFAULT_SHORTCUTS = DEFAULT_APP_SHORTCUTS as AppState['hotkeys']['shortcuts']

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

function normalizeNotebookItem(raw: unknown): NotebookTreeItem | null {
  if (!isRecord(raw)) return null
  const id = normalizeString(raw.id)
  const title = normalizeString(raw.title, raw.type === 'folder' ? 'Untitled folder' : 'Untitled')
  if (!id) return null
  if (raw.type === 'folder') {
    const children = Array.isArray(raw.children) ? raw.children.flatMap((child) => {
      const normalized = normalizeNotebookItem(child)
      return normalized ? [normalized] : []
    }) : []
    return {
      type: 'folder',
      id,
      title,
      children,
    } satisfies NotebookFolder
  }
  if (raw.type === 'note') {
    const noteBodyId = normalizeString(raw.noteBodyId)
    if (!noteBodyId) return null
    return {
      type: 'note',
      id,
      title,
      noteBodyId,
    } satisfies NotebookNote
  }
  return null
}

function normalizeDeletedNotebookItem(raw: unknown): DeletedNotebookItem | null {
  if (!isRecord(raw)) return null
  const id = normalizeString(raw.id)
  const item = normalizeNotebookItem(raw.item)
  if (!id || !item) return null
  return {
    id,
    deletedAt: normalizeNumber(raw.deletedAt, Date.now(), 0),
    item,
    originalParentFolderId: typeof raw.originalParentFolderId === 'string' ? raw.originalParentFolderId : null,
    originalIndex: Math.max(0, Math.floor(normalizeNumber(raw.originalIndex, 0, 0))),
  }
}

function normalizeNotebookState(raw: unknown, fallback: NotebookState): NotebookState | null {
  if (!isRecord(raw) || !Array.isArray(raw.items)) return null
  const items = raw.items.flatMap((item): NotebookTreeItem[] => {
    const normalized = normalizeNotebookItem(item)
    return normalized ? [normalized] : []
  })
  if (items.length === 0) return null
  const deletedItems = Array.isArray(raw.deletedItems)
    ? raw.deletedItems.flatMap((entry): DeletedNotebookItem[] => {
        const normalized = normalizeDeletedNotebookItem(entry)
        return normalized ? [normalized] : []
      })
    : []
  return ensureValidActiveNote({
    activeNoteId: normalizeString(raw.activeNoteId, fallback.activeNoteId),
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
      entry.type === 'duplicate-auto-decoupled' || entry.type === 'storage-notebook-recovered' ? entry.type : null
    const id = normalizeString(entry.id)
    if (!type || !id) return []
    return [
      {
        id,
        type,
        status: entry.status === 'dismissed' ? 'dismissed' : entry.status === 'acknowledged' ? 'acknowledged' : 'unread',
        createdAt: normalizeTimestamp(entry.createdAt, fallbackTimestamp),
        signature: normalizeString(entry.signature, id),
        title: normalizeString(entry.title, type === 'storage-notebook-recovered' ? 'Started local notebook' : 'Duplicate note decoupled'),
        body: typeof entry.body === 'string' ? entry.body : '',
        anchorPath: typeof entry.anchorPath === 'string' ? entry.anchorPath : undefined,
        decoupledPaths: normalizeStringList(entry.decoupledPaths),
        affectedLocations: normalizeAppMessageAffectedLocations(entry.affectedLocations),
        failedNotebookPath: typeof entry.failedNotebookPath === 'string' ? entry.failedNotebookPath : undefined,
        failedNotebookAvailable:
          typeof entry.failedNotebookAvailable === 'boolean' ? entry.failedNotebookAvailable : undefined,
        activeNotebookPath: typeof entry.activeNotebookPath === 'string' ? entry.activeNotebookPath : undefined,
        activeNotebookName: typeof entry.activeNotebookName === 'string' ? entry.activeNotebookName : undefined,
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

function collectNoteBodyIdsFromItems(items: NotebookTreeItem[], ids = new Set<string>()): Set<string> {
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

function ensureNotebookBodies(state: AppState): AppState {
  const noteBodyMap = new Map(state.noteBodies.map((body) => [body.id, body]))
  const aisleBodyMap = new Map((state.noteAisleBodies ?? []).map((body) => [body.id, body]))
  const requiredNoteBodyIds = collectNoteBodyIdsFromItems(state.notebook.items)
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
  const notebook = normalizeNotebookState(raw.notebook, fallback.notebook)
  if (!notebook) return fallback

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

  const sidebarWidth = normalizeNumber(isRecord(raw.ui) ? raw.ui.sidebarWidth : undefined, fallback.ui.sidebarWidth, 220, 520)
  const ui = isRecord(raw.ui) ? raw.ui : {}
  const selectedCustomTheme =
    typeof ui.selectedCustomTheme === 'string' && CUSTOM_THEME_IDS.includes(ui.selectedCustomTheme as CustomThemeId)
      ? (ui.selectedCustomTheme as CustomThemeId)
      : fallback.ui.selectedCustomTheme
  return ensureNotebookBodies({
    theme: APP_THEMES.includes(raw.theme as AppTheme) ? (raw.theme as AppTheme) : fallback.theme,
    notebook,
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
      shortcuts: {
        ...DEFAULT_SHORTCUTS,
        ...(isRecord(raw.hotkeys) && isRecord(raw.hotkeys.shortcuts) ? raw.hotkeys.shortcuts : {}),
      },
      newlineShortcuts: fallback.hotkeys.newlineShortcuts,
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
    },
  })
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
  const notebook = purgeOldDeletedNotebookItems(state.notebook, now)
  return notebook === state.notebook ? state : { ...state, notebook }
}

export function getNextAutoPurgeTimeForAppState(state: AppState, now = Date.now()): number | null {
  const days = state.notebook.settings.autoRemoveDeletedDays
  if (!Number.isFinite(days) || days <= 0 || state.notebook.deletedItems.length === 0) return null
  const oldestDeletedAt = state.notebook.deletedItems.reduce(
    (oldest, entry) => Math.min(oldest, entry.deletedAt),
    Number.POSITIVE_INFINITY,
  )
  return Number.isFinite(oldestDeletedAt) ? Math.max(now, oldestDeletedAt + days * AUTO_PURGE_DAY_MS) : null
}

export function getAutoPurgeScheduleSignatureForAppState(state: AppState): string {
  const deletedSignature = state.notebook.deletedItems
    .map((entry) => `${entry.id}:${entry.deletedAt}`)
    .sort()
    .join('|')
  return `${state.notebook.settings.autoRemoveDeletedDays}:${deletedSignature}`
}

export function applyMarkdownToAppState(
  previous: AppState,
  noteId: string,
  aisleId: string,
  markdown: string,
  options: { syncAisleStructure?: boolean } = {},
): AppState {
  const note = findNote(previous.notebook.items, noteId)
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

function findNote(items: NotebookTreeItem[], noteId: string): NotebookNote | null {
  for (const item of items) {
    if (item.type === 'note' && item.id === noteId) return item
    if (item.type === 'folder') {
      const child = findNote(item.children, noteId)
      if (child) return child
    }
  }
  return null
}
