import * as React from 'react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { Editor } from '@toast-ui/editor'
import '@toast-ui/editor/dist/toastui-editor.css'
import type {
  AppState,
  AppTheme,
  AboutSection,
  CustomThemeId,
  CustomThemePaletteSlot,
  DataSettingsSection,
  DeletedNotebookItem,
  FrontmatterData,
  FrontmatterSaveOptions,
  FrontmatterTemplate,
  FrontmatterTemplateField,
  FindReplaceScope,
  MessagesSection,
  LinkPromptState,
  NoteAisle,
  NoteAisleBody,
  NoteBody,
  NoteFilterSettings,
  NoteLocation,
  NoteNavigationTarget,
  KnownNotebook,
  NotebookTreeItem,
  NewlineOperationId,
  NewlineShortcutId,
  ResolvedNoteAisle,
  SettingsSection,
  ShortcutId,
  TableControlTargetMode,
  TableOfContentsScope,
  TipId,
  ToastTone,
  ViewMode,
} from '../types/app'
import {
  clearAisleFrontmatterInState,
  resolveNoteBody,
  syncNoteBodyAisleStructureInState,
  syncNoteAisleBodyMarkdownInState,
} from '../notes/aisle-body-state'
import {
  FRONTMATTER_FIELD_TYPES,
  getFrontmatterComputedValuesForFieldType,
  getFrontmatterDatePickerValue,
  getFrontmatterDatetimePickerValue,
  getFrontmatterDraftValueForType,
  isFrontmatterComputedValueCompatibleWithFieldType,
  normalizeFrontmatterFixedListOptions,
  resolveFrontmatterFixedListValues,
  stringifyFrontmatterYaml,
} from '../frontmatter/frontmatter'
import {
  buildFrontmatterDataFromRows,
  buildFrontmatterMeta,
  buildFrontmatterModalDraftForAisle,
  buildFrontmatterRowsForAisle,
  disableInvalidComputedFrontmatterRows,
  makeFrontmatterRowsManual,
  normalizeFrontmatterDraftRows,
  resolveFrontmatterRowComputedForType,
  type FrontmatterRowDraft,
} from '../frontmatter/frontmatter-state'
import {
  buildNoteLocationKey,
  filterNoteSearchEntries,
  listSearchableNoteLocations,
} from '../notes/note-locations'
import { buildAisleEditorKey, getAisleIdFromAisleEditorKey } from '../editor/aisle-editor'
import { shouldClearPendingCursorRestoreForAisleActivation } from '../editor/aisle-activation'
import {
  DEFAULT_TOOLBAR_LAYOUT_ID,
  createCustomToolbarLayout,
  createToolbarSpacerItem,
  createToolbarToolItem,
  getDefaultToolbarLayout,
  getDuplicateToolbarLayoutName,
  getNextCoolbarToolbarLayoutName,
  getToolbarLayouts,
  insertToolbarLayoutItemAtIndex,
  isProtectedToolbarLayoutId,
  isToolbarToolId,
  moveToolbarLayoutItem,
  moveToolbarLayoutItemToIndex,
  normalizeToolbarLayouts,
  removeToolbarLayout,
  removeToolbarLayoutItem,
  resolveToolbarLayout,
  resolveToolbarLayoutId,
  updateToolbarLayout,
} from '../editor/toolbar-layouts'
import { resetAisleWidthForLocation, setAisleWidthForLocation } from '../notes/aisle-widths'
import { NoteWorkspace } from '../components/notes/NoteWorkspace'
import { scrollAislePaneIntoHorizontalView } from '../components/notes/aisle-horizontal-scroll'
import { SharedEditorToolbar } from '../components/editor/SharedEditorToolbar'
import { LinkPrompt } from '../components/editor/LinkPrompt'
import { ShortcutMenu } from '../components/editor/ShortcutMenu'
import { EditorToolbarPopovers } from '../components/editor/EditorToolbarPopovers'
import { TagAutocompleteMenu } from '../components/editor/TagAutocompleteMenu'
import { FindReplacePanel } from '../components/editor/FindReplacePanel'
import { getFindReplaceShortcutMode } from '../components/editor/find-replace-shortcuts'
import { TableControlsOverlay } from '../components/editor/TableControlsOverlay'
import { ListReorderControlsOverlay } from '../components/editor/ListReorderControlsOverlay'
import { ImageToolsOverlay } from '../components/editor/ImageToolsOverlay'
import { MediaToolsOverlay } from '../components/editor/MediaToolsOverlay'
import { AisleEditModal } from '../components/notes/AisleEditModal'
import {
  NotebookEditorContextMenu,
  getNotebookEditorContextMenuAisleIdFromTarget,
  type NotebookEditorAisleInsertSide,
  type NotebookEditorClipboardAction,
  type NotebookEditorContextMenuState,
  type NotebookEditorCopyAsKind,
  type NotebookEditorCopyAsMode,
  type NotebookEditorPasteDestination,
} from '../components/overlays/NotebookEditorContextMenu'
import { AppIcon } from '../components/icons/AppIcon'
import { SidebarSearchPanel } from '../components/navigation/SidebarSearchPanel'
import { AboutView } from '../components/about/AboutView'
import { MessagesView } from '../components/messages/MessagesView'
import { TrashMarkdownPreview } from '../components/trash/TrashMarkdownPreview'
import { ToolbarSettingsPanel } from '../components/settings/ToolbarSettingsPanel'
import { ShortcutMenuSettingsPanel } from '../components/settings/ShortcutMenuSettingsPanel'
import { clampContextMenuPosition, type MenuPosition, type MenuSize, type MenuViewport } from '../components/overlays/context-menu-position'
import { useEditorToolbarState } from '../editor/useEditorToolbarState'
import { useNotebookAisleEditors } from '../editor/useNotebookAisleEditors'
import { useImageTools } from '../editor/useImageTools'
import { useMediaTools } from '../editor/useMediaTools'
import type { NoteMentionQuery } from '../editor/prosemirror-utils'
import { useNoteCursorPersistence, usePendingNoteCursorRestore } from '../editor/useNoteCursorPersistence'
import { useTableControls } from '../editor/useTableControls'
import { useListReorderControls } from '../editor/useListReorderControls'
import {
  DEFAULT_SHORTCUTS,
  NEWLINE_OPERATIONS,
  NEWLINE_OPERATION_LABELS,
  buildShortcutFromKeyboardEvent,
  formatFixedNewlineShortcutLabel,
  formatShortcutLabel,
  normalizeHotkeySettings,
} from '../hotkeys/shortcuts'
import { useNotebookHotkeys } from '../hotkeys/useNotebookHotkeys'
import {
  cancelScheduledAisleFocusScroll,
  scheduleFocusedAisleScroll,
  type ScheduledAisleFocusScroll,
} from './focused-aisle-scroll'
import {
  resolveNotebookNavigationLocation,
  useNotebookNavigationHistory,
  type NotebookNavigationLocation,
} from '../navigation/notebook-navigation-history'
import { getTipDefinition } from '../tips/tips'
import {
  buildTableOfContentsPanels,
  TABLE_OF_CONTENTS_EMPTY_MESSAGE,
  type TableOfContentsPanelsState,
} from '../editor/table-of-contents'
import { MAX_AISLE_WARNING_MESSAGE, MAX_NOTE_AISLES } from '../editor/aisle-edit-draft'
import { parseSavedState } from '../state/app-state'
import { createRandomId, createReservedIdAllocator } from '../state/navigation-ids'
import { importMarkdownNotebook } from '../import/markdown-import'
import { usePersistentAppState } from '../storage/usePersistentAppState'
import { useStorageProfileController } from '../storage/useStorageProfileController'
import {
  APP_THEME_IDS,
  CUSTOM_THEME_IDS,
  CUSTOM_THEME_PALETTE_LABELS,
  CUSTOM_THEME_PALETTE_SLOTS,
  getCustomThemePaletteSeed,
  getThemePaletteForTheme,
  getThemePaletteVariables,
  getThemeClassName,
  isCustomTheme,
  normalizeCustomThemePalette,
} from '../theme/notebook-themes'
import {
  MAX_NOTE_FONT_SCALE,
  MAX_TOOLBAR_BUTTON_SCALE,
  MIN_NOTE_FONT_SCALE,
  MIN_TOOLBAR_BUTTON_SCALE,
  NOTE_FONT_SCALE_STEP,
  TOOLBAR_BUTTON_SCALE_STEP,
  DEFAULT_UI_SETTINGS,
  clampNoteFontScale,
  clampToolbarButtonScale,
} from '../settings/defaults'
import {
  collectNotebookIds,
  createNotebookFolderInState,
  createNotebookNoteInState,
  deleteNotebookItemInState,
  findNotebookFolder,
  findNotebookItem,
  findNotebookNote,
  getContainingFolderId,
  getFirstNotebookNote,
  getNotebookNoteFolderPath,
  isNoteBodyLinked,
  moveNotebookItem,
  moveNotebookItems,
  renameNotebookItem,
  restoreDeletedNotebookItemInState,
} from '../state/notebook'
import {
  NotebookNoteActionPicker,
  getCopyModeForNoteAction,
  getReferenceKindForNoteAction,
  type NotebookNoteActionPickerAction,
  type NotebookNoteActionPickerActionOptions,
  type NotebookNoteActionPickerAnchor,
  type NotebookNoteActionPickerAisleOption,
} from '../components/overlays/NotebookNoteActionPicker'
import { NotebookDecoupleDialog } from '../components/overlays/NotebookDecoupleDialog'
import {
  buildNotebookNoteReferenceInsertionText,
  getNotebookAisleDecoupleRows,
  replaceActiveNoteBodyFromTargetNote,
  replaceFocusedAisleFromTargetNote,
} from '../notes/notebook-note-actions'
import {
  applyFindReplacementToState,
  findVisibleMatches,
  getFindReplaceQueryError,
  type FindReplaceMatch,
} from '../notes/find-replace'
import {
  buildAisleSlotKey,
  decoupleAisleSlotsInState,
  listLinkedAisleSlotsForAisleBody,
} from '../notes/aisle-links'
import {
  getFrontmatterTemplateFilterKey,
  getSyncedAisleFilterKey,
} from '../filters/note-filter'
import {
  buildSidebarSearchIndexes,
  buildSidebarSearchResultGroups,
  clearActiveSidebarSearchPrefix,
  getSidebarSearchSelectedTokens,
  getSidebarSearchSuggestions,
  mergeSidebarSearchTokens,
  parseSidebarSearchInput,
  type SidebarSearchFilterKind,
  type SidebarSearchResult,
  type SidebarSearchSuggestion,
  type SidebarSearchToken,
} from '../filters/sidebar-search'
import { normalizeTagKey } from '../tags/tag-filter'
import { normalizeTagAutocompleteRecentKeys } from '../tags/tag-autocomplete'
import { useTagAutocompleteController } from '../tags/useTagAutocompleteController'
import {
  applyNotebookStructureClipboardPayload,
  buildNotebookStructureClipboardPayload,
  readNotebookStructureClipboardPayloadFromNavigator,
  writeNotebookStructureClipboardPayload,
  type NotebookStructureClipboardPayload,
} from '../notes/notebook-structure-clipboard'
import {
  DEFAULT_SCRATCHPAD_AISLE_LIMIT,
  MAX_SCRATCHPAD_AISLE_LIMIT,
  MIN_SCRATCHPAD_AISLE_LIMIT,
  clampScratchpadAisleLimit,
} from '../state/scratchpad-limits'
import {
  applyNotebookEditorMarkdownSnapshotsToState,
  commitNotebookAisleMarkdownInState,
} from './notebook-editor-persistence'
import { CLOSED_LINK_PROMPT_STATE, closeLinkPromptState } from './linkPromptState'
import { MEDIA_PLAYER_SELECTOR } from '../media/media-utils'
import { openExternalWebUrl } from '../notes/external-links'

void React

const SIDEBAR_MIN_WIDTH = 220
const SIDEBAR_MAX_WIDTH = 520
const NOTEBOOK_FOCUS_BOUNDARY_FLUSH_DELAY_MS = 60

function getDefaultNoteFilterSettings(): NonNullable<AppState['ui']['noteFilter']> {
  return DEFAULT_UI_SETTINGS.noteFilter ?? {
    active: false,
    kind: 'tags',
    tags: { selectedKeys: [], sortMode: 'az' },
    synced: { selectedKeys: [] },
    frontmatter: { selectedKeys: [] },
    media: { selectedKeys: [] },
  }
}

const SIDEBAR_SEARCH_FILTER_KINDS: SidebarSearchFilterKind[] = ['tags', 'synced', 'frontmatter']

function hasSidebarSearchFilterKeys(filter: NoteFilterSettings): boolean {
  return SIDEBAR_SEARCH_FILTER_KINDS.some((kind) => filter[kind].selectedKeys.length > 0)
}

function addSidebarSearchFilterKey(
  currentFilter: NoteFilterSettings | null | undefined,
  kind: SidebarSearchFilterKind,
  key: string,
): NoteFilterSettings {
  const fallback = getDefaultNoteFilterSettings()
  const base = currentFilter?.active ? currentFilter : fallback
  const selectedKeys = Array.from(new Set([...base[kind].selectedKeys, key].filter(Boolean)))
  return {
    ...base,
    active: true,
    kind,
    [kind]: {
      ...base[kind],
      selectedKeys,
    },
  } as NoteFilterSettings
}

function addSidebarSearchFilterTokens(
  currentFilter: NoteFilterSettings | null | undefined,
  tokens: SidebarSearchToken[],
): NoteFilterSettings {
  return tokens.reduce(
    (filter, token) => addSidebarSearchFilterKey(filter, token.kind, token.key),
    currentFilter ?? getDefaultNoteFilterSettings(),
  )
}

function removeSidebarSearchFilterToken(
  currentFilter: NoteFilterSettings | null | undefined,
  token: SidebarSearchToken,
): NoteFilterSettings {
  const base = currentFilter ?? getDefaultNoteFilterSettings()
  const next = {
    ...base,
    [token.kind]: {
      ...base[token.kind],
      selectedKeys: base[token.kind].selectedKeys.filter((key) => key !== token.key),
    },
  } as NoteFilterSettings
  return {
    ...next,
    active: hasSidebarSearchFilterKeys(next),
  }
}

function clearSidebarSearchFilter(currentFilter: NoteFilterSettings | null | undefined): NoteFilterSettings {
  const noteFilter = currentFilter ?? getDefaultNoteFilterSettings()
  return {
    ...noteFilter,
    active: false,
    tags: { ...noteFilter.tags, selectedKeys: [] },
    synced: { ...noteFilter.synced, selectedKeys: [] },
    frontmatter: { ...noteFilter.frontmatter, selectedKeys: [] },
    media: { ...noteFilter.media, selectedKeys: [] },
  }
}

function revealNotebookTreeForCreatedItem(
  ui: AppState['ui'],
  expandedFolderIds: Array<string | null | undefined>,
): AppState['ui'] {
  const expandedIds = new Set(expandedFolderIds.filter((folderId): folderId is string => Boolean(folderId)))
  return {
    ...ui,
    sidebarCollapsed: false,
    noteFilter: clearSidebarSearchFilter(ui.noteFilter),
    collapsedFolderIds:
      expandedIds.size > 0
        ? ui.collapsedFolderIds.filter((folderId) => !expandedIds.has(folderId))
        : ui.collapsedFolderIds,
  }
}

const THEME_LABELS: Record<AppTheme, string> = {
  dark: 'Dark',
  light: 'Light',
  dawn: 'Dawn',
  custom1: 'Custom 1',
  custom2: 'Custom 2',
  custom3: 'Custom 3',
}

const ACTIVE_TOOLBAR_LAYOUT_STORAGE_KEY = 'tabs:notebook-active-toolbar-layout:v1'
const TAG_AUTOCOMPLETE_RECENT_STORAGE_KEY = 'tabs:tag-autocomplete-recent:v1'
const NOTEBOOK_SETUP_APP_NAME = 'Tabs'
const NOTEBOOK_SETUP_LOGO_SRC = './favicon.svg'

const UTILITY_VIEW_MODES = ['settings', 'messages', 'about', 'trash'] as const
type UtilityViewMode = typeof UTILITY_VIEW_MODES[number]

const SETTINGS_SECTION_TABS: Array<{ id: SettingsSection; label: string }> = [
  { id: 'data', label: 'Data' },
  { id: 'visuals', label: 'Themes' },
  { id: 'toolbar', label: 'Toolbar' },
  { id: 'hotkeys', label: 'Hotkeys' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'frontmatter', label: 'Frontmatter' },
  { id: 'misc', label: 'Misc' },
  { id: 'tips', label: 'Tips' },
]

const DATA_SECTION_TABS: Array<{ id: DataSettingsSection; label: string }> = [
  { id: 'transfer', label: 'Transfer' },
  { id: 'storage', label: 'Notebooks' },
  { id: 'trash', label: 'Trash' },
]

const MESSAGE_SECTION_TABS: Array<{ id: MessagesSection; label: string }> = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'toast-history', label: 'Toast history' },
  { id: 'diagnostics', label: 'Diagnostics' },
]

const ABOUT_SECTION_TABS: Array<{ id: AboutSection; label: string }> = [
  { id: 'home', label: 'About' },
  { id: 'tooltip-sources', label: 'Tooltip sources' },
]

const HOTKEY_ROWS: Array<{ id: ShortcutId; label: string }> = [
  { id: 'openSettings', label: 'Open settings' },
  { id: 'toggleNotesTrash', label: 'Toggle notes / trash' },
  { id: 'toggleNotesFilter', label: 'Toggle filter' },
  { id: 'newNote', label: 'New note' },
  { id: 'newFolder', label: 'New folder' },
  { id: 'formatStrikethrough', label: 'Strikethrough' },
  { id: 'cycleAislePrev', label: 'Previous aisle' },
  { id: 'cycleAisleNext', label: 'Next aisle' },
]

const NEWLINE_SHORTCUT_ROWS: Array<{ id: NewlineShortcutId; label: string }> = [
  { id: 'controlEnter', label: 'Control enter' },
  { id: 'shiftEnter', label: 'Shift enter' },
  { id: 'commandEnter', label: 'Command enter' },
]

const TABLE_TARGET_OPTIONS: Array<{ id: TableControlTargetMode; label: string }> = [
  { id: 'active-cell', label: 'Active cell' },
  { id: 'bottom-right', label: 'Bottom right' },
]

const TABLE_OF_CONTENTS_SCOPE_OPTIONS: Array<{ id: TableOfContentsScope; label: string }> = [
  { id: 'all-aisles', label: 'All aisles' },
  { id: 'focused-aisle', label: 'Current aisle' },
]

const SETTINGS_SECTION_SET = new Set<SettingsSection>(SETTINGS_SECTION_TABS.map((tab) => tab.id))
const DATA_SECTION_SET = new Set<DataSettingsSection>(DATA_SECTION_TABS.map((tab) => tab.id))
const DELETED_AT_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

function isUtilityViewMode(viewMode: ViewMode): viewMode is UtilityViewMode {
  return (UTILITY_VIEW_MODES as readonly string[]).includes(viewMode)
}

function loadNotebookActiveToolbarLayoutId(): string {
  try {
    return window.localStorage?.getItem(ACTIVE_TOOLBAR_LAYOUT_STORAGE_KEY)?.trim() || DEFAULT_TOOLBAR_LAYOUT_ID
  } catch {
    return DEFAULT_TOOLBAR_LAYOUT_ID
  }
}

function saveNotebookActiveToolbarLayoutId(layoutId: string): void {
  try {
    window.localStorage?.setItem(ACTIVE_TOOLBAR_LAYOUT_STORAGE_KEY, layoutId.trim() || DEFAULT_TOOLBAR_LAYOUT_ID)
  } catch {
    // Device-local toolbar choice should not block the app.
  }
}

function loadTagAutocompleteRecentKeys(): string[] {
  try {
    if (typeof window === 'undefined') return []
    const raw = window.localStorage?.getItem(TAG_AUTOCOMPLETE_RECENT_STORAGE_KEY)
    return normalizeTagAutocompleteRecentKeys(raw ? JSON.parse(raw) : [])
  } catch {
    return []
  }
}

function saveTagAutocompleteRecentKeys(keys: string[]): void {
  try {
    if (typeof window === 'undefined') return
    window.localStorage?.setItem(
      TAG_AUTOCOMPLETE_RECENT_STORAGE_KEY,
      JSON.stringify(normalizeTagAutocompleteRecentKeys(keys)),
    )
  } catch {
    // Device-local tag suggestion recency should not block editing.
  }
}

function createFrontmatterTemplateId(): string {
  return createRandomId()
}

function isFrontmatterBooleanTrue(value: string) {
  const normalized = value.trim().toLowerCase()
  return normalized === 'true' || normalized === 'yes' || normalized === 'on' || normalized === '1'
}

function getFrontmatterTypeLabel(type: FrontmatterTemplateField['type']) {
  return type === 'fixedList' ? 'fixed list' : type
}

function getEditableFixedListOptions(options: unknown, fallbackValue?: unknown): string[] {
  const normalizedOptions = normalizeFrontmatterFixedListOptions(options)
  if (normalizedOptions.length > 0) return normalizedOptions
  const fallbackOptions = normalizeFrontmatterFixedListOptions(fallbackValue)
  return fallbackOptions
}

function formatDeletedAt(timestamp: number): string {
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? 'Unknown' : DELETED_AT_FORMATTER.format(date)
}

function getDeletedAtTitle(timestamp: number): string | undefined {
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function getNotebookItemDisplayTitle(item: NotebookTreeItem): string {
  return item.title.trim() || 'Untitled'
}

function getDeletedNotebookNoteMarkdown(entry: DeletedNotebookItem, state: AppState): string {
  const item = entry.item
  if (item.type !== 'note') return ''
  const noteBody = state.noteBodies.find((body) => body.id === item.noteBodyId)
  const resolved = resolveNoteBody(noteBody, state.noteAisleBodies)
  return resolved?.aisles.map((aisle) => aisle.markdown).join('\n\n') ?? ''
}

type ActiveNoteModel = {
  noteId: string
  title: string
  noteBody: NoteBody
  resolved: NonNullable<ReturnType<typeof resolveNoteBody>>
  linked: boolean
  folderPath: string
}

type NotebookAisleContextMenuState = {
  x: number
  y: number
  aisleId: string
}

type NotebookShortcutMenuState = {
  aisleId: string
  top: number
  left: number
  activeIndex: number
}

export type NotebookFrontmatterModalState = {
  noteBodyId: string
  aisleId: string
  aisleBodyId: string
  location: NoteLocation
  aisles: Array<{ id: string; aisleBodyId: string; label: string }>
  rows: FrontmatterRowDraft[]
  selectedTemplateId: string
  templateDerived: boolean
  isTemplateSuggestionDraft: boolean
}

type NoteActionPickerSource = 'mention' | 'toolbar-link' | 'context-note-link' | 'context-note-preview' | 'whole-note-copy'

type NoteActionPickerState = {
  source: NoteActionPickerSource
  title: string
  query: string
  actions: NotebookNoteActionPickerAction[]
  mentionRange?: NoteMentionQuery
  insertRange?: LinkPromptState['editRange']
  anchor?: NotebookNoteActionPickerAnchor | null
  urlEnabled?: boolean
}

type DecoupleDialogState = {
  kind: 'aisle'
  aisleId: string
  aisleBodyId: string
  currentKey: string
  keepKeys: string[]
  keepData: boolean
  error?: string
}

function getActiveNoteModel(state: AppState): ActiveNoteModel | null {
  const notePath = findNotebookNote(state.notebook.items, state.notebook.activeNoteId)
  const fallbackNote = notePath?.note ?? getFirstNotebookNote(state.notebook.items)
  if (!fallbackNote) return null
  const noteBody = state.noteBodies.find((body) => body.id === fallbackNote.noteBodyId)
  const resolved = resolveNoteBody(noteBody, state.noteAisleBodies)
  if (!noteBody || !resolved) return null
  const folderPath = getNotebookNoteFolderPath(state.notebook.items, fallbackNote.id)
    .map((segment) => segment.title)
    .join(' / ')
  return {
    noteId: fallbackNote.id,
    title: fallbackNote.title,
    noteBody,
    resolved,
    linked: isNoteBodyLinked(state.notebook.items, fallbackNote.noteBodyId),
    folderPath,
  }
}

function getPreferredNotebookAisleId(
  state: AppState,
  noteId: string,
  aisles: readonly Pick<NoteAisle, 'id'>[],
): string {
  if (!noteId || aisles.length === 0) return ''
  const savedLocation = state.ui.noteCursorLocations[noteId] ?? null
  return savedLocation && aisles.some((aisle) => aisle.id === savedLocation.activeAisleId)
    ? savedLocation.activeAisleId
    : aisles[0]?.id ?? ''
}

function getAisleIdFromNavigationTarget(target: NoteLocation): string {
  const navigationTarget = target as NoteLocation & Partial<Pick<NoteNavigationTarget, 'aisleId' | 'aisleIds' | 'heading'>>
  return navigationTarget.aisleId?.trim() || navigationTarget.heading?.aisleId?.trim() || navigationTarget.aisleIds?.[0]?.trim() || ''
}

function collectDeletedNoteBodyIds(item: NotebookTreeItem, ids = new Set<string>()): Set<string> {
  if (item.type === 'note') {
    ids.add(item.noteBodyId)
    return ids
  }
  item.children.forEach((child) => collectDeletedNoteBodyIds(child, ids))
  return ids
}

function getReferencedNoteBodyIds(items: NotebookTreeItem[], ids = new Set<string>()): Set<string> {
  items.forEach((item) => {
    if (item.type === 'note') {
      ids.add(item.noteBodyId)
    } else {
      getReferencedNoteBodyIds(item.children, ids)
    }
  })
  return ids
}

function pruneUnreferencedBodies(state: AppState): AppState {
  const visibleBodyIds = getReferencedNoteBodyIds(state.notebook.items)
  state.notebook.deletedItems.forEach((entry) => collectDeletedNoteBodyIds(entry.item, visibleBodyIds))
  const noteBodies = state.noteBodies.filter((body) => visibleBodyIds.has(body.id) || body.id === state.scratchpad?.noteBodyId)
  const aisleBodyIds = new Set<string>()
  noteBodies.forEach((body) => body.aisles.forEach((aisle) => aisleBodyIds.add(aisle.aisleBodyId)))
  return {
    ...state,
    noteBodies,
    noteAisleBodies: (state.noteAisleBodies ?? []).filter((body) => aisleBodyIds.has(body.id)),
  }
}

function createNewAisleBody(idGenerator: () => string, markdown = ''): { aisle: NoteAisle; body: NoteAisleBody } {
  const timestamp = new Date().toISOString()
  const aisleBodyId = idGenerator()
  return {
    aisle: {
      id: idGenerator(),
      aisleBodyId,
    },
    body: {
      id: aisleBodyId,
      createdAt: timestamp,
      updatedAt: timestamp,
      markdown,
      tags: [],
      frontmatter: null,
      frontmatterStatus: 'none',
    },
  }
}

function getAisleBodyReferenceCounts(noteBodies: NoteBody[]): Map<string, number> {
  const counts = new Map<string, number>()
  noteBodies.forEach((body) => {
    body.aisles.forEach((aisle) => {
      counts.set(aisle.aisleBodyId, (counts.get(aisle.aisleBodyId) ?? 0) + 1)
    })
  })
  return counts
}

function clampSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return 280
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)))
}

function getAisleBodyById(state: AppState, aisleBodyId: string): NoteAisleBody | null {
  return (state.noteAisleBodies ?? []).find((body) => body.id === aisleBodyId) ?? null
}

function updateAisleBodyFrontmatterInState(
  state: AppState,
  aisleBodyId: string,
  frontmatter: FrontmatterData | null,
  saveOptions?: FrontmatterSaveOptions,
): AppState {
  const timestamp = new Date().toISOString()
  const existingBodies = state.noteAisleBodies ?? []
  const templateId = saveOptions?.templateId?.trim() || ''
  const frontmatterRaw = frontmatter ? stringifyFrontmatterYaml(frontmatter) : undefined
  const nextBodies = existingBodies.map((body) =>
    body.id === aisleBodyId
      ? {
          ...body,
          updatedAt: timestamp,
          frontmatter,
          frontmatterStatus: frontmatter ? 'valid' as const : 'none' as const,
          frontmatterParseError: undefined,
          frontmatterRaw,
          frontmatterMeta: buildFrontmatterMeta(frontmatter, saveOptions),
        }
      : body,
  )
  return {
    ...state,
    noteAisleBodies: nextBodies,
    frontmatter: {
      ...state.frontmatter,
      lastAppliedTemplateId: templateId && frontmatter ? templateId : '',
    },
  }
}

function cloneAisleBodyForDraft(
  source: NoteAisleBody | undefined,
  aisleBodyId: string,
  markdown: string,
  timestamp: string,
): NoteAisleBody {
  return {
    ...(source ?? {}),
    id: aisleBodyId,
    createdAt: timestamp,
    updatedAt: timestamp,
    markdown,
    tags: [...(source?.tags ?? [])],
    frontmatter:
      source?.frontmatter && typeof source.frontmatter === 'object'
        ? { ...source.frontmatter }
        : source?.frontmatter ?? null,
    frontmatterMeta:
      source?.frontmatterMeta && typeof source.frontmatterMeta === 'object'
        ? { ...source.frontmatterMeta }
        : source?.frontmatterMeta,
    frontmatterStatus: source?.frontmatterStatus ?? (source?.frontmatter ? 'valid' : 'none'),
  }
}

const NOTEBOOK_TREE_RENAME_LONG_PRESS_MS = 500
const NOTEBOOK_TREE_LONG_PRESS_MOVE_TOLERANCE_PX = 6
const SHORTCUT_MENU_ESTIMATED_WIDTH = 256
const SHORTCUT_MENU_ESTIMATED_VERTICAL_PADDING = 16
const SHORTCUT_MENU_ESTIMATED_ITEM_HEIGHT = 36

type NotebookTreeDropPosition = 'before' | 'after' | 'inside' | 'root'

type NotebookTreeDropTarget = {
  parentFolderId: string | null
  index: number
  targetItemId: string | null
  position: NotebookTreeDropPosition
}

type NotebookTreeContextMenuState = {
  x: number
  y: number
  itemId: string
  itemType: NotebookTreeItem['type']
  itemTitle: string
}

type NotebookTreeNoteSelectionMode = 'replace' | 'toggle' | 'range'
type NotebookTreeRenameCommitSource = 'enter' | 'blur' | 'tab'

type PendingCreatedTreeRename =
  | {
      kind: 'note'
      itemId: string
      noteBodyId: string
      aisleId: string
    }
  | {
      kind: 'folder'
      itemId: string
      returnNoteBodyId: string
      returnAisleId: string
    }

function getNotebookMenuViewportSize(): MenuViewport {
  if (typeof window === 'undefined') return { width: 0, height: 0 }
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  }
}

function getNotebookMenuElementSize(element: HTMLElement): MenuSize {
  const rect = element.getBoundingClientRect()
  return {
    width: rect.width,
    height: rect.height,
  }
}

export function getNotebookSidebarRevealLabel(platform: string | undefined): string {
  const normalizedPlatform = String(platform ?? '').toLowerCase()
  if (normalizedPlatform === 'darwin' || normalizedPlatform.includes('mac')) return 'Reveal in Finder'
  if (normalizedPlatform === 'win32' || normalizedPlatform.includes('win')) return 'Show in File Explorer'
  return 'Show in Files'
}

function getNotebookTreeDropTargetFromEvent(
  event: ReactDragEvent<HTMLElement>,
  item: NotebookTreeItem,
  parentFolderId: string | null,
  index: number,
): NotebookTreeDropTarget {
  const rect = event.currentTarget.getBoundingClientRect()
  const relativeY = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5
  if (item.type === 'folder' && relativeY >= 0.25 && relativeY <= 0.75) {
    return {
      parentFolderId: item.id,
      index: item.children.length,
      targetItemId: item.id,
      position: 'inside',
    }
  }
  const before = item.type === 'folder' ? relativeY < 0.25 : relativeY < 0.5
  return {
    parentFolderId,
    index: before ? index : index + 1,
    targetItemId: item.id,
    position: before ? 'before' : 'after',
  }
}

function areNotebookTreeDropTargetsEqual(left: NotebookTreeDropTarget | null, right: NotebookTreeDropTarget | null): boolean {
  return (
    left?.parentFolderId === right?.parentFolderId &&
    left?.index === right?.index &&
    left?.targetItemId === right?.targetItemId &&
    left?.position === right?.position
  )
}

function getVisibleNotebookTreeNoteIds(items: NotebookTreeItem[], collapsedFolderIds: Set<string>): string[] {
  const noteIds: string[] = []
  items.forEach((item) => {
    if (item.type === 'note') {
      noteIds.push(item.id)
      return
    }
    if (!collapsedFolderIds.has(item.id)) {
      noteIds.push(...getVisibleNotebookTreeNoteIds(item.children, collapsedFolderIds))
    }
  })
  return noteIds
}

function getNotebookTreeRangeNoteIds(noteIds: string[], anchorNoteId: string, targetNoteId: string): string[] {
  const targetIndex = noteIds.indexOf(targetNoteId)
  if (targetIndex < 0) return [targetNoteId]
  const anchorIndex = noteIds.indexOf(anchorNoteId)
  if (anchorIndex < 0) return [targetNoteId]
  const startIndex = Math.min(anchorIndex, targetIndex)
  const endIndex = Math.max(anchorIndex, targetIndex)
  return noteIds.slice(startIndex, endIndex + 1)
}

function NotebookTreeContextMenu({
  menu,
  revealLabel,
  canReveal,
  onClose,
  onCreateNote,
  onCreateFolder,
  onReveal,
  onRename,
  onDelete,
}: {
  menu: NotebookTreeContextMenuState | null
  revealLabel: string
  canReveal: boolean
  onClose: () => void
  onCreateNote: () => void
  onCreateFolder: () => void
  onReveal: () => void
  onRename: () => void
  onDelete: () => void
}) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [rootPosition, setRootPosition] = useState<MenuPosition>({ left: 0, top: 0 })

  useLayoutEffect(() => {
    if (!menu) return

    const updateRootPosition = () => {
      const element = rootRef.current
      setRootPosition(
        clampContextMenuPosition(
          { x: menu.x, y: menu.y },
          element ? getNotebookMenuElementSize(element) : { width: 0, height: 0 },
          getNotebookMenuViewportSize(),
        ),
      )
    }

    updateRootPosition()
    window.addEventListener('resize', updateRootPosition)
    return () => window.removeEventListener('resize', updateRootPosition)
  }, [menu])

  if (!menu) return null

  const runAction = (action: () => void) => {
    action()
    onClose()
  }
  const deleteLabel = menu.itemType === 'folder' ? 'Delete folder' : 'Delete note'

  return (
    <div
      ref={rootRef}
      className="tab-context-menu"
      role="menu"
      style={{ top: `${rootPosition.top}px`, left: `${rootPosition.left}px` }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button type="button" className="tab-context-delete" onClick={() => runAction(onCreateNote)}>
        New note
      </button>
      <button type="button" className="tab-context-delete" onClick={() => runAction(onCreateFolder)}>
        New folder
      </button>
      <div className="tab-context-separator" role="separator" />
      <button type="button" className="tab-context-delete" onClick={() => runAction(onRename)}>
        Rename
      </button>
      <button type="button" className="tab-context-delete" onClick={() => runAction(onDelete)}>
        {deleteLabel}
      </button>
      <button
        type="button"
        className={`tab-context-delete ${canReveal ? '' : 'is-disabled'}`.trim()}
        aria-disabled={canReveal ? undefined : 'true'}
        disabled={!canReveal}
        onClick={() => runAction(onReveal)}
      >
        {revealLabel}
      </button>
    </div>
  )
}

function TreeItemRow({
  item,
  depth,
  parentFolderId,
  index,
  activeNoteId,
  renamingItemId,
  renameDraft,
  draggingItemId,
  draggingNoteIds,
  selectedNoteIds,
  createdRenameItemId,
  dropTarget,
  collapsedFolderIds,
  query,
  onSelectNote,
  onSelectFolder,
  onToggleFolder,
  onStartRename,
  onRenameDraftChange,
  onCommitRename,
  onCancelRename,
  onOpenContextMenu,
  onDragItemStart,
  onDragItemEnd,
  onUpdateDropTarget,
  onDropItem,
}: {
  item: NotebookTreeItem
  depth: number
  parentFolderId: string | null
  index: number
  activeNoteId: string
  renamingItemId: string
  renameDraft: string
  draggingItemId: string
  draggingNoteIds: Set<string>
  selectedNoteIds: Set<string>
  createdRenameItemId: string
  dropTarget: NotebookTreeDropTarget | null
  collapsedFolderIds: Set<string>
  query: string
  onSelectNote: (noteId: string, mode: NotebookTreeNoteSelectionMode) => void
  onSelectFolder: (folderId: string) => void
  onToggleFolder: (folderId: string) => void
  onStartRename: (itemId: string, title: string) => void
  onRenameDraftChange: (title: string) => void
  onCommitRename: (source: NotebookTreeRenameCommitSource) => void
  onCancelRename: () => void
  onOpenContextMenu: (menu: NotebookTreeContextMenuState) => void
  onDragItemStart: (itemId: string) => void
  onDragItemEnd: () => void
  onUpdateDropTarget: (target: NotebookTreeDropTarget | null) => void
  onDropItem: (target: NotebookTreeDropTarget) => void
}) {
  const isFolder = item.type === 'folder'
  const collapsed = isFolder && collapsedFolderIds.has(item.id)
  const children = isFolder ? item.children : []
  const folderIconId = isFolder && !collapsed && children.length > 0 ? 'folderOpen' : 'folder'
  const active = item.type === 'note' && item.id === activeNoteId
  const selected = item.type === 'note' && selectedNoteIds.has(item.id)
  const renaming = item.id === renamingItemId
  const tabCreatesNext = item.id === createdRenameItemId
  const dropPosition = dropTarget?.targetItemId === item.id ? dropTarget.position : null
  const titleMatches = !query || item.title.toLowerCase().includes(query.toLowerCase())
  const longPressRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    timerId: number
  } | null>(null)
  const suppressNextClickRef = useRef(false)

  const clearLongPress = useCallback(() => {
    if (!longPressRef.current) return
    window.clearTimeout(longPressRef.current.timerId)
    longPressRef.current = null
  }, [])

  useEffect(() => clearLongPress, [clearLongPress])

  const beginLongPressRename = (event: ReactPointerEvent<HTMLElement>) => {
    if (renaming || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
    clearLongPress()
    const pointerId = event.pointerId
    const startX = event.clientX
    const startY = event.clientY
    const timerId = window.setTimeout(() => {
      longPressRef.current = null
      suppressNextClickRef.current = true
      onStartRename(item.id, item.title)
    }, NOTEBOOK_TREE_RENAME_LONG_PRESS_MS)
    longPressRef.current = {
      pointerId,
      startX,
      startY,
      timerId,
    }
  }

  const updateLongPressRename = (event: ReactPointerEvent<HTMLElement>) => {
    const pending = longPressRef.current
    if (!pending || pending.pointerId !== event.pointerId) return
    const moved =
      Math.abs(event.clientX - pending.startX) > NOTEBOOK_TREE_LONG_PRESS_MOVE_TOLERANCE_PX ||
      Math.abs(event.clientY - pending.startY) > NOTEBOOK_TREE_LONG_PRESS_MOVE_TOLERANCE_PX
    if (moved) clearLongPress()
  }

  const finishLongPressRename = (event: ReactPointerEvent<HTMLElement>) => {
    if (longPressRef.current?.pointerId === event.pointerId) clearLongPress()
  }

  const handleDragStart = (event: ReactDragEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target : null
    if (renaming || target?.closest('.notebook-tree-rename-input')) {
      event.preventDefault()
      return
    }
    clearLongPress()
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('application/x-tabs-notebook-item', item.id)
    if (item.type === 'note') {
      const noteIds = selectedNoteIds.has(item.id) ? Array.from(selectedNoteIds) : [item.id]
      event.dataTransfer.setData('application/x-tabs-notebook-note-ids', JSON.stringify(noteIds))
    }
    event.dataTransfer.setData('text/plain', item.id)
    onDragItemStart(item.id)
  }

  const handleDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!draggingItemId || draggingItemId === item.id || draggingNoteIds.has(item.id)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    onUpdateDropTarget(getNotebookTreeDropTargetFromEvent(event, item, parentFolderId, index))
  }

  const handleDragLeave = (event: ReactDragEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    if (dropTarget?.targetItemId === item.id) onUpdateDropTarget(null)
  }

  const handleDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!draggingItemId || draggingItemId === item.id || draggingNoteIds.has(item.id)) return
    event.preventDefault()
    event.stopPropagation()
    onDropItem(getNotebookTreeDropTargetFromEvent(event, item, parentFolderId, index))
  }

  if (!titleMatches && !isFolder) return null

  return (
    <>
      <div
        className={[
          'notebook-tree-row',
          `is-${item.type}`,
          active ? 'is-active' : '',
          selected ? 'is-selected' : '',
          renaming ? 'is-renaming' : '',
          draggingItemId === item.id || draggingNoteIds.has(item.id) ? 'is-dragging' : '',
          dropPosition === 'before' ? 'is-drop-before' : '',
          dropPosition === 'after' ? 'is-drop-after' : '',
          dropPosition === 'inside' ? 'is-drop-inside' : '',
        ].filter(Boolean).join(' ')}
        role="treeitem"
        aria-selected={active || selected}
        aria-expanded={isFolder ? !collapsed : undefined}
        style={{ '--tree-depth': depth } as CSSProperties}
        draggable={!renaming}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onDragEnd={onDragItemEnd}
        onContextMenu={(event) => {
          event.preventDefault()
          event.stopPropagation()
          clearLongPress()
          onOpenContextMenu({
            x: event.clientX,
            y: event.clientY,
            itemId: item.id,
            itemType: item.type,
            itemTitle: item.title,
          })
        }}
      >
        {renaming ? (
          <div className="notebook-tree-main is-renaming">
            {isFolder ? (
              <span className="notebook-tree-folder-icon" aria-hidden="true">
                <AppIcon iconId={folderIconId} className="notebook-tree-folder-icon-svg" />
              </span>
            ) : null}
            <input
              className="notebook-tree-rename-input"
              value={renameDraft}
              autoFocus
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => onRenameDraftChange(event.target.value)}
              onBlur={() => onCommitRename('blur')}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  onCommitRename('enter')
                }
                if (event.key === 'Tab' && !event.shiftKey && tabCreatesNext) {
                  event.preventDefault()
                  onCommitRename('tab')
                }
                if (event.key === 'Escape') {
                  event.preventDefault()
                  onCancelRename()
                }
              }}
              onPointerDown={(event) => event.stopPropagation()}
              aria-label={`Rename ${item.title}`}
            />
          </div>
        ) : (
          <button
            className="notebook-tree-main"
            type="button"
            onPointerDown={beginLongPressRename}
            onPointerMove={updateLongPressRename}
            onPointerUp={finishLongPressRename}
            onPointerCancel={finishLongPressRename}
            onPointerLeave={finishLongPressRename}
            onClick={(event) => {
              if (suppressNextClickRef.current) {
                suppressNextClickRef.current = false
                event.preventDefault()
                return
              }
              if (item.type === 'folder') {
                onSelectFolder(item.id)
                onToggleFolder(item.id)
              } else {
                onSelectNote(
                  item.id,
                  event.shiftKey ? 'range' : event.metaKey || event.ctrlKey ? 'toggle' : 'replace',
                )
              }
            }}
            title={item.type === 'folder' ? 'Toggle folder' : 'Open note'}
          >
            {isFolder ? (
              <span className="notebook-tree-folder-icon" aria-hidden="true">
                <AppIcon iconId={folderIconId} className="notebook-tree-folder-icon-svg" />
              </span>
            ) : null}
            <span className="notebook-tree-title">{item.title}</span>
          </button>
        )}
      </div>
      {isFolder && !collapsed ? (
        <div className="notebook-tree-children" role="group" style={{ '--tree-depth': depth } as CSSProperties}>
          {children.map((child, childIndex) => (
            <TreeItemRow
              key={child.id}
              item={child}
              depth={depth + 1}
              parentFolderId={item.id}
              index={childIndex}
              activeNoteId={activeNoteId}
              renamingItemId={renamingItemId}
              renameDraft={renameDraft}
              draggingItemId={draggingItemId}
              draggingNoteIds={draggingNoteIds}
              selectedNoteIds={selectedNoteIds}
              createdRenameItemId={createdRenameItemId}
              dropTarget={dropTarget}
              collapsedFolderIds={collapsedFolderIds}
              query={query}
              onSelectNote={onSelectNote}
              onSelectFolder={onSelectFolder}
              onToggleFolder={onToggleFolder}
              onStartRename={onStartRename}
              onRenameDraftChange={onRenameDraftChange}
              onCommitRename={onCommitRename}
              onCancelRename={onCancelRename}
              onOpenContextMenu={onOpenContextMenu}
              onDragItemStart={onDragItemStart}
              onDragItemEnd={onDragItemEnd}
              onUpdateDropTarget={onUpdateDropTarget}
              onDropItem={onDropItem}
            />
          ))}
        </div>
      ) : null}
    </>
  )
}

function NotebookAisleContextMenu({
  menu,
  canDecoupleAisle,
  onClose,
  onFilterSyncedAisle,
  onQuickDecoupleAisle,
  onShowSyncedAisle,
}: {
  menu: NotebookAisleContextMenuState | null
  canDecoupleAisle: boolean
  onClose: () => void
  onFilterSyncedAisle: () => void
  onQuickDecoupleAisle: () => void
  onShowSyncedAisle: () => void
}) {
  if (!menu || !canDecoupleAisle) return null
  const runAction = (action: () => void) => {
    action()
    onClose()
  }
  return (
    <div
      className="tab-context-menu"
      role="menu"
      style={{ top: `${menu.y}px`, left: `${menu.x}px` }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        type="button"
        className="tab-context-delete"
        onClick={() => runAction(onFilterSyncedAisle)}
      >
        filter synced aisle
      </button>
      <button
        type="button"
        className="tab-context-delete"
        onClick={() => runAction(onQuickDecoupleAisle)}
      >
        decouple aisle
      </button>
      <button
        type="button"
        className="tab-context-delete"
        onClick={() => runAction(onShowSyncedAisle)}
      >
        show synced aisles
      </button>
    </div>
  )
}

export function NotebookFrontmatterModal({
  modal,
  templates,
  onCancel,
  onChange,
  onSave,
  onSelectAisle,
  onSelectTemplate,
  onToggleTemplateDerived,
  onEditTemplate,
  onFilterTemplate,
}: {
  modal: NotebookFrontmatterModalState | null
  templates: FrontmatterTemplate[]
  onCancel: () => void
  onChange: (modal: NotebookFrontmatterModalState) => void
  onSave: (modal: NotebookFrontmatterModalState) => string[] | string | null
  onSelectAisle: (modal: NotebookFrontmatterModalState, aisleId: string) => NotebookFrontmatterModalState | string | null
  onSelectTemplate: (modal: NotebookFrontmatterModalState, templateId: string) => NotebookFrontmatterModalState
  onToggleTemplateDerived: (modal: NotebookFrontmatterModalState, templateDerived: boolean) => NotebookFrontmatterModalState
  onEditTemplate: (templateId: string) => void
  onFilterTemplate: (modal: NotebookFrontmatterModalState) => void
}) {
  const [error, setError] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])

  useEffect(() => {
    if (!modal) return
    setError('')
    setWarnings([])
  }, [modal?.noteBodyId, modal?.aisleBodyId])

  if (!modal) return null

  const selectedTemplate = templates.find((template) => template.id === modal.selectedTemplateId) ?? null
  const updateModal = (nextModal: NotebookFrontmatterModalState) => {
    setError('')
    setWarnings([])
    onChange(nextModal)
  }
  const updateRows = (updater: (rows: FrontmatterRowDraft[]) => FrontmatterRowDraft[]) => {
    updateModal(normalizeFrontmatterDraftRows(modal, updater(modal.rows)))
  }
  const updateRow = (rowId: string, patch: Partial<FrontmatterRowDraft>) => {
    updateRows((rows) => rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)))
  }
  const createRowKey = () => {
    const existingKeys = new Set(modal.rows.map((row) => row.key.trim()).filter(Boolean))
    let key = 'field'
    let index = 2
    while (existingKeys.has(key)) {
      key = `field ${index}`
      index += 1
    }
    return key
  }
  const isComputedEnabled = (row: FrontmatterRowDraft) => row.computedEnabled ?? row.computed !== 'none'
  const isComputedLocked = (row: FrontmatterRowDraft) => Boolean(row.computedLocked || (row.derived && row.computed !== 'none'))
  const isKeyTypeLocked = (row: FrontmatterRowDraft) => Boolean(row.derived)
  const getRowFieldTypes = (row: FrontmatterRowDraft) =>
    row.type === 'fixedList' || (row.fixedListOptions?.length ?? 0) > 0
      ? FRONTMATTER_FIELD_TYPES
      : FRONTMATTER_FIELD_TYPES.filter((type) => type !== 'fixedList')
  const getRowValueInputType = (type: FrontmatterRowDraft['type']) => {
    if (type === 'number') return 'number'
    if (type === 'date') return 'date'
    if (type === 'datetime') return 'datetime-local'
    return 'text'
  }
  const getRowValueInputValue = (row: FrontmatterRowDraft) => {
    if (row.type === 'date') return getFrontmatterDatePickerValue(row.value)
    if (row.type === 'datetime') return getFrontmatterDatetimePickerValue(row.value)
    return row.value
  }
  const computedLockedMessage = (row: FrontmatterRowDraft) =>
    row.derived
      ? 'Computed fields from templates are changed in frontmatter settings.'
      : 'Computed fields are recalculated automatically.'
  const templateLockedMessage = 'Template field names and types are changed in frontmatter settings.'

  const renderValueControl = (row: FrontmatterRowDraft) => {
    if (isComputedEnabled(row)) {
      const computedOptions = getFrontmatterComputedValuesForFieldType(row.type).filter((computed) => computed !== 'none')
      return (
        <select
          className="settings-select-input frontmatter-row-value-input"
          value={row.computed !== 'none' && isFrontmatterComputedValueCompatibleWithFieldType(row.computed, row.type) ? row.computed : ''}
          aria-label="computed frontmatter value"
          disabled={isComputedLocked(row)}
          data-app-tooltip={isComputedLocked(row) ? computedLockedMessage(row) : undefined}
          onChange={(event) => {
            const computed = event.target.value === '' ? 'none' : event.target.value as FrontmatterRowDraft['computed']
            updateRow(row.id, {
              computed,
              computedLocked: Boolean(row.derived && computed !== 'none'),
              locked: Boolean(row.derived),
            })
          }}
        >
          <option value="">computed value</option>
          {computedOptions.map((computed) => (
            <option key={computed} value={computed}>
              {computed}
            </option>
          ))}
        </select>
      )
    }

    if (row.type === 'fixedList') {
      const options = normalizeFrontmatterFixedListOptions(row.fixedListOptions)
      const selectedValues = resolveFrontmatterFixedListValues(options, row.value)
      const selectedValueSet = new Set(selectedValues)
      const selectedSummary = selectedValues.length > 0 ? selectedValues.join(', ') : 'select from drop-down'
      return (
        <details className="frontmatter-fixed-list-dropdown frontmatter-row-value-input">
          <summary
            className="settings-select-input frontmatter-fixed-list-trigger"
            aria-label="frontmatter fixed list values"
            title={selectedSummary}
          >
            <span className="frontmatter-fixed-list-trigger-label">{selectedSummary}</span>
          </summary>
          <div className="frontmatter-fixed-list-menu" role="group" aria-label="frontmatter fixed list options">
            {options.length > 0 ? (
              options.map((option) => {
                const checked = selectedValueSet.has(option)
                return (
                  <label key={option} className="frontmatter-fixed-list-choice">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => {
                        const nextValueSet = new Set(selectedValues)
                        if (event.target.checked) {
                          nextValueSet.add(option)
                        } else {
                          nextValueSet.delete(option)
                        }
                        const nextValues = options.filter((candidate) => nextValueSet.has(candidate))
                        updateRow(row.id, { value: nextValues.join(', ') })
                      }}
                    />
                    <span>{option}</span>
                  </label>
                )
              })
            ) : (
              <span className="frontmatter-fixed-list-empty">No fixed-list options</span>
            )}
          </div>
        </details>
      )
    }

    if (row.type === 'boolean') {
      const checked = isFrontmatterBooleanTrue(row.value)
      return (
        <label className="frontmatter-boolean-switch form-check form-switch settings-switch frontmatter-row-value-input">
          <input
            className="form-check-input"
            type="checkbox"
            role="switch"
            checked={checked}
            aria-label="frontmatter boolean value"
            onChange={(event) => updateRow(row.id, { value: event.target.checked ? 'true' : 'false' })}
          />
          <span className="frontmatter-boolean-switch-label">{checked ? 'true' : 'false'}</span>
        </label>
      )
    }

    return (
      <input
        type={getRowValueInputType(row.type)}
        className="settings-text-input frontmatter-row-value-input"
        value={getRowValueInputValue(row)}
        aria-label="frontmatter value"
        placeholder={row.type === 'list' ? 'one, two' : 'value'}
        onChange={(event) => updateRow(row.id, { value: event.target.value })}
      />
    )
  }

  const renderComputedControl = (row: FrontmatterRowDraft) => {
    const checked = isComputedEnabled(row)
    return (
      <label className="frontmatter-computed-switch form-check form-switch settings-switch">
        <input
          className="form-check-input"
          type="checkbox"
          role="switch"
          checked={checked}
          aria-label="frontmatter computed"
          disabled={Boolean(row.derived || isComputedLocked(row))}
          data-app-tooltip={row.derived || isComputedLocked(row) ? computedLockedMessage(row) : undefined}
          onChange={(event) => {
            updateRow(row.id, {
              computedEnabled: event.target.checked,
              computed: event.target.checked ? row.computed : 'none',
              computedLocked: Boolean(row.derived && event.target.checked && row.computed !== 'none'),
              locked: Boolean(row.derived),
            })
          }}
        />
      </label>
    )
  }

  return (
    <div className="modal-backdrop notebook-modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        className="modal-card notebook-frontmatter-modal frontmatter-note-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Frontmatter"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-card-header">
          <h2>Frontmatter</h2>
          <div className="frontmatter-modal-header-actions">
            {selectedTemplate && modal.templateDerived && !modal.isTemplateSuggestionDraft ? (
              <button
                type="button"
                className="btn btn-sm settings-action-btn frontmatter-filter-template-btn"
                onClick={() => onFilterTemplate(modal)}
              >
                Filter on template
              </button>
            ) : null}
          </div>
        </header>
        <div className="notebook-frontmatter-body">
          <div className="frontmatter-note-toolbar">
            {modal.aisles.length > 1 ? (
              <select
                className="settings-select-input"
                value={modal.aisleId}
                aria-label="frontmatter aisle"
                onChange={(event) => {
                  const next = onSelectAisle(modal, event.target.value)
                  if (typeof next === 'string') {
                    setError(next)
                    setWarnings([])
                    return
                  }
                  if (next) updateModal(next)
                }}
              >
                {modal.aisles.map((aisle) => (
                  <option key={aisle.id} value={aisle.id}>
                    {aisle.label}
                  </option>
                ))}
              </select>
            ) : null}
            <select
              className="settings-select-input"
              value={modal.selectedTemplateId}
              aria-label="frontmatter template"
              onChange={(event) => updateModal(onSelectTemplate(modal, event.target.value))}
            >
              <option value="">no template</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-sm settings-action-btn"
              disabled={!modal.selectedTemplateId}
              onClick={() => onEditTemplate(modal.selectedTemplateId)}
            >
              Edit template
            </button>
            <label className="frontmatter-derived-switch">
              <span>derived</span>
              <input
                type="checkbox"
                role="switch"
                checked={Boolean(modal.selectedTemplateId && modal.templateDerived)}
                disabled={!modal.selectedTemplateId}
                aria-label="derive frontmatter from selected template"
                onChange={(event) => updateModal(onToggleTemplateDerived(modal, event.target.checked))}
              />
            </label>
            <button
              type="button"
              className="btn btn-sm settings-action-btn"
              onClick={() =>
                updateRows((rows) => [
                  ...rows,
                  {
                    id: createRandomId(),
                    key: createRowKey(),
                    type: 'text',
                    value: '',
                    computed: 'none',
                    computedEnabled: false,
                    computedLocked: false,
                    locked: false,
                    derived: false,
                  },
                ])
              }
            >
              Add row
            </button>
          </div>
          {modal.isTemplateSuggestionDraft && selectedTemplate ? (
            <div className="frontmatter-template-suggestion-banner" role="note">
              Suggested from "{selectedTemplate.name}". These rows are not saved on this aisle yet.
            </div>
          ) : null}
          <div className="frontmatter-row-editor" aria-label="frontmatter rows">
            <div className="frontmatter-row frontmatter-row-header" aria-hidden="true">
              <span>key</span>
              <span>type</span>
              <span>value</span>
              <span>computed</span>
              <span>derived</span>
              <span>action</span>
            </div>
            {modal.rows.length > 0 ? (
              modal.rows.map((row) => {
                const derivedTitle = row.derived && selectedTemplate ? selectedTemplate.name : undefined
                return (
                  <div key={row.id} className={`frontmatter-row ${row.derived ? 'is-derived' : ''} ${isComputedLocked(row) ? 'is-locked' : ''}`}>
                    <input
                      type="text"
                      className="settings-text-input frontmatter-row-key-input"
                      value={row.key}
                      aria-label="frontmatter key"
                      readOnly={isKeyTypeLocked(row)}
                      data-app-tooltip={isKeyTypeLocked(row) ? templateLockedMessage : undefined}
                      onChange={(event) => {
                        if (isKeyTypeLocked(row)) return
                        updateRow(row.id, { key: event.target.value })
                      }}
                    />
                    <select
                      className="settings-select-input frontmatter-row-type-select"
                      value={row.type}
                      aria-label="frontmatter type"
                      disabled={isKeyTypeLocked(row)}
                      data-app-tooltip={isKeyTypeLocked(row) ? templateLockedMessage : undefined}
                      onChange={(event) => {
                        const nextType = event.target.value as FrontmatterRowDraft['type']
                        const nextComputed = resolveFrontmatterRowComputedForType(row, nextType)
                        const nextFixedListOptions = nextType === 'fixedList'
                          ? getEditableFixedListOptions(row.fixedListOptions, row.value)
                          : undefined
                        updateRow(row.id, {
                          type: nextType,
                          value: nextType === 'boolean'
                            ? (isFrontmatterBooleanTrue(row.value) ? 'true' : 'false')
                            : nextType === 'date' || nextType === 'datetime'
                              ? getFrontmatterDraftValueForType(nextType, row.value)
                              : nextType === 'fixedList'
                                ? resolveFrontmatterFixedListValues(nextFixedListOptions, row.value).join(', ')
                              : row.value,
                          computed: nextComputed,
                          computedEnabled: isComputedEnabled(row) && nextComputed !== 'none',
                          computedLocked: Boolean(row.derived && nextComputed !== 'none'),
                          locked: Boolean(row.derived),
                          fixedListOptions: nextFixedListOptions,
                        })
                      }}
                    >
                      {getRowFieldTypes(row).map((type) => (
                        <option key={type} value={type}>
                          {getFrontmatterTypeLabel(type)}
                        </option>
                      ))}
                    </select>
                    {renderValueControl(row)}
                    {renderComputedControl(row)}
                    <span
                      className={`frontmatter-derived-indicator ${row.derived ? 'is-derived' : ''}`}
                      aria-label={derivedTitle ? `derived from ${derivedTitle}` : 'not derived from a template'}
                      data-app-tooltip={derivedTitle}
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(row.derived)}
                        readOnly
                        tabIndex={-1}
                        aria-label={derivedTitle ? `derived from ${derivedTitle}` : 'not derived from a template'}
                      />
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm settings-action-btn frontmatter-row-remove-btn"
                      aria-label={`Remove ${row.key || 'frontmatter row'}`}
                      data-app-tooltip="Remove row"
                      onClick={() => updateRows((rows) => rows.filter((candidate) => candidate.id !== row.id))}
                    >
                      <AppIcon iconId="trash" className="frontmatter-row-remove-icon" />
                    </button>
                  </div>
                )
              })
            ) : (
              <div className="frontmatter-empty-state">No frontmatter rows</div>
            )}
          </div>
        </div>
        {error ? <p className="notebook-frontmatter-error">{error}</p> : null}
        {warnings.length > 0 ? (
          <div className="notebook-frontmatter-warning-list">
            {warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        ) : null}
        <footer className="modal-card-footer">
          <button type="button" className="btn btn-sm settings-action-btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-sm settings-action-btn"
            onClick={() => {
              const result = onSave(modal)
              if (typeof result === 'string') {
                setError(result)
                setWarnings([])
              } else if (Array.isArray(result)) {
                setError('')
                setWarnings(result)
              }
            }}
          >
            {modal.isTemplateSuggestionDraft && modal.selectedTemplateId ? 'Add frontmatter' : 'Save'}
          </button>
        </footer>
      </section>
    </div>
  )
}

function NotebookSettingsSwitch({
  label,
  description,
  checked,
  onChange,
  id,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
  id?: string
}) {
  return (
    <div className="settings-hotkey-row notebook-settings-switch-row">
      <div className="settings-tip-copy">
        <span className="settings-hotkey-label">{label}</span>
        {description ? <span className="settings-help">{description}</span> : null}
      </div>
      <div className="form-check form-switch settings-switch">
        <input
          id={id}
          className="form-check-input"
          type="checkbox"
          role="switch"
          checked={checked}
          aria-label={label}
          onChange={(event) => onChange(event.target.checked)}
        />
      </div>
    </div>
  )
}

function formatScalePercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function formatRangeProgress(value: number, min: number, max: number): string {
  const range = max - min
  if (range <= 0) return '0%'
  const progress = Math.min(100, Math.max(0, ((value - min) / range) * 100))
  return `${Number(progress.toFixed(4))}%`
}

function getRangeProgressStyle(value: number, min: number, max: number): CSSProperties {
  return {
    '--settings-range-progress': formatRangeProgress(value, min, max),
  } as CSSProperties
}

function NotebookThemeSettings({
  state,
  onMutateState,
}: {
  state: AppState
  onMutateState: (updater: (previous: AppState) => AppState) => void
}) {
  const selectedCustomTheme = state.ui.selectedCustomTheme ?? 'custom1'
  const selectedPalette = getThemePaletteForTheme(state.theme, state.ui.themePalettes)
  const noteFontScale = clampNoteFontScale(state.ui.noteFontScale)
  const toolbarButtonScale = clampToolbarButtonScale(state.ui.toolbarButtonScale ?? 1)

  const updateTheme = (theme: AppTheme) => {
    onMutateState((previous) => ({
      ...previous,
      theme,
      ui: {
        ...previous.ui,
        selectedCustomTheme: isCustomTheme(theme) ? theme : previous.ui.selectedCustomTheme,
      },
    }))
  }

  const updateSelectedCustomTheme = (themeId: CustomThemeId) => {
    onMutateState((previous) => ({
      ...previous,
      theme: isCustomTheme(previous.theme) ? themeId : previous.theme,
      ui: {
        ...previous.ui,
        selectedCustomTheme: themeId,
      },
    }))
  }

  const updatePaletteSlot = (slot: CustomThemePaletteSlot, value: string) => {
    onMutateState((previous) => {
      const themeId = previous.theme
      const currentPalette = getThemePaletteForTheme(themeId, previous.ui.themePalettes)
      return {
        ...previous,
        ui: {
          ...previous.ui,
          themePalettes: {
            ...(previous.ui.themePalettes ?? {}),
            [themeId]: normalizeCustomThemePalette(
              {
                ...currentPalette,
                [slot]: value,
              },
              getCustomThemePaletteSeed(themeId),
            ),
          },
        },
      }
    })
  }

  const resetSelectedPalette = () => {
    onMutateState((previous) => {
      const themeId = previous.theme
      return {
        ...previous,
        ui: {
          ...previous.ui,
          themePalettes: {
            ...(previous.ui.themePalettes ?? {}),
            [themeId]: getCustomThemePaletteSeed(themeId),
          },
        },
      }
    })
  }

  const updateUiScale = (key: 'noteFontScale' | 'toolbarButtonScale', value: number) => {
    const nextValue = key === 'noteFontScale' ? clampNoteFontScale(value) : clampToolbarButtonScale(value)
    onMutateState((previous) => ({
      ...previous,
      ui: {
        ...previous.ui,
        [key]: nextValue,
      },
    }))
  }

  return (
    <section className="notebook-settings-section" aria-label="Visual theme settings">
      <div className="notebook-settings-grid">
        <label>
          Active theme
          <select value={state.theme} onChange={(event) => updateTheme(event.target.value as AppTheme)}>
            {APP_THEME_IDS.map((themeId) => (
              <option key={themeId} value={themeId}>
                {THEME_LABELS[themeId]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Custom palette
          <select
            value={selectedCustomTheme}
            onChange={(event) => updateSelectedCustomTheme(event.target.value as CustomThemeId)}
          >
            {CUSTOM_THEME_IDS.map((themeId) => (
              <option key={themeId} value={themeId}>
                {THEME_LABELS[themeId]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Note font scale
          <div className="settings-slider-wrap">
            <input
              id="note-font-scale"
              className="settings-range-input"
              type="range"
              min={MIN_NOTE_FONT_SCALE}
              max={MAX_NOTE_FONT_SCALE}
              step={NOTE_FONT_SCALE_STEP}
              value={noteFontScale}
              style={getRangeProgressStyle(noteFontScale, MIN_NOTE_FONT_SCALE, MAX_NOTE_FONT_SCALE)}
              aria-describedby="note-font-scale-value"
              onChange={(event) => updateUiScale('noteFontScale', Number(event.target.value))}
            />
            <span id="note-font-scale-value" className="settings-range-value">
              {formatScalePercent(noteFontScale)}
            </span>
          </div>
        </label>
        <label>
          Toolbar button scale
          <div className="settings-slider-wrap">
            <input
              id="toolbar-button-scale"
              className="settings-range-input"
              type="range"
              min={MIN_TOOLBAR_BUTTON_SCALE}
              max={MAX_TOOLBAR_BUTTON_SCALE}
              step={TOOLBAR_BUTTON_SCALE_STEP}
              value={toolbarButtonScale}
              style={getRangeProgressStyle(toolbarButtonScale, MIN_TOOLBAR_BUTTON_SCALE, MAX_TOOLBAR_BUTTON_SCALE)}
              aria-describedby="toolbar-button-scale-value"
              onChange={(event) => updateUiScale('toolbarButtonScale', Number(event.target.value))}
            />
            <span id="toolbar-button-scale-value" className="settings-range-value">
              {formatScalePercent(toolbarButtonScale)}
            </span>
          </div>
        </label>
      </div>
      <div className="notebook-theme-preview" aria-label="Theme preview">
        <div className="notebook-theme-preview-sidebar">
          <span />
          <strong>Notebook</strong>
          <button type="button">Active note</button>
          <button type="button">Folder item</button>
        </div>
        <div className="notebook-theme-preview-editor">
          <div className="notebook-theme-preview-toolbar">
            <span />
            <span />
            <span />
          </div>
          <div className="notebook-theme-preview-page">
            <strong>Editor surface</strong>
            <p>Markdown, aisle overlays, and menus inherit the active theme tokens.</p>
          </div>
        </div>
      </div>
      <div className="notebook-palette-editor" aria-label="Active theme palette editor">
        {CUSTOM_THEME_PALETTE_SLOTS.map((slot) => (
          <label key={slot}>
            {CUSTOM_THEME_PALETTE_LABELS[slot]}
            <input
              type="color"
              value={selectedPalette[slot]}
              onChange={(event) => updatePaletteSlot(slot, event.target.value)}
            />
          </label>
        ))}
      </div>
      <button type="button" className="notebook-settings-action" onClick={resetSelectedPalette}>
        Reset selected palette
      </button>
    </section>
  )
}

export function NotebookApp() {
  const { state, setState, stateRef, externalStateLoadVersion, commitAppStateNow } = usePersistentAppState()
  const [viewMode, setViewMode] = useState<ViewMode>('main')
  const [settingsSection, setSettingsSectionState] = useState<SettingsSection>(() =>
    SETTINGS_SECTION_SET.has(state.ui.settingsSection) ? state.ui.settingsSection : 'data',
  )
  const [dataSettingsSection, setDataSettingsSectionState] = useState<DataSettingsSection>(() =>
    DATA_SECTION_SET.has(state.ui.dataSettingsSection ?? 'transfer') ? state.ui.dataSettingsSection ?? 'transfer' : 'transfer',
  )
  const [messagesSection, setMessagesSection] = useState<MessagesSection>('inbox')
  const [aboutSection, setAboutSection] = useState<AboutSection>('home')
  const [activeToolbarLayoutId, setActiveToolbarLayoutIdState] = useState(loadNotebookActiveToolbarLayoutId)
  const [toolbarEditorLayoutId, setToolbarEditorLayoutId] = useState(activeToolbarLayoutId)
  const [query, setQuery] = useState('')
  const [sidebarSearchMode, setSidebarSearchMode] = useState(false)
  const [activeAisleId, setActiveAisleId] = useState('')
  const [selectedFolderId, setSelectedFolderId] = useState('')
  const [renamingTreeItemId, setRenamingTreeItemId] = useState('')
  const [treeRenameDraft, setTreeRenameDraft] = useState('')
  const [draggingTreeItemId, setDraggingTreeItemId] = useState('')
  const [draggingTreeNoteIds, setDraggingTreeNoteIds] = useState<string[]>([])
  const [selectedTreeNoteIds, setSelectedTreeNoteIds] = useState<string[]>([])
  const [treeSelectionAnchorNoteId, setTreeSelectionAnchorNoteId] = useState('')
  const [treeDropTarget, setTreeDropTarget] = useState<NotebookTreeDropTarget | null>(null)
  const [aisleContextMenu, setAisleContextMenu] = useState<NotebookAisleContextMenuState | null>(null)
  const [editorContextMenu, setEditorContextMenu] = useState<NotebookEditorContextMenuState | null>(null)
  const [treeContextMenu, setTreeContextMenu] = useState<NotebookTreeContextMenuState | null>(null)
  const [shortcutMenu, setShortcutMenu] = useState<NotebookShortcutMenuState | null>(null)
  const [noteActionPicker, setNoteActionPicker] = useState<NoteActionPickerState | null>(null)
  const [openNotebookActionMenuKey, setOpenNotebookActionMenuKey] = useState('')
  const [decoupleDialog, setDecoupleDialog] = useState<DecoupleDialogState | null>(null)
  const [linkPrompt, setLinkPrompt] = useState<LinkPromptState>(CLOSED_LINK_PROMPT_STATE)
  const [findReplaceOpen, setFindReplaceOpen] = useState(false)
  const [findReplaceFocusRequestId, setFindReplaceFocusRequestId] = useState(0)
  const [findReplaceQuery, setFindReplaceQuery] = useState('')
  const [findReplaceReplacement, setFindReplaceReplacement] = useState('')
  const [findReplaceActiveIndex, setFindReplaceActiveIndex] = useState(0)
  const [tagAutocompleteRecentKeys, setTagAutocompleteRecentKeys] = useState(loadTagAutocompleteRecentKeys)
  const [aisleEditModalOpen, setAisleEditModalOpen] = useState(false)
  const [frontmatterModal, setFrontmatterModal] = useState<NotebookFrontmatterModalState | null>(null)
  const [frontmatterDraft, setFrontmatterDraft] = useState<AppState['frontmatter']>(() => state.frontmatter)
  const [frontmatterFixedListOptionDrafts, setFrontmatterFixedListOptionDrafts] = useState<Record<string, string>>({})
  const [editingShortcut, setEditingShortcut] = useState<ShortcutId | null>(null)
  const [shortcutMenuSettingsOpen, setShortcutMenuSettingsOpen] = useState(false)
  const [tableOfContentsPanels, setTableOfContentsPanels] = useState<TableOfContentsPanelsState | null>(null)
  const [expandedTrashItemId, setExpandedTrashItemId] = useState('')
  const [runtimeVersion, setRuntimeVersion] = useState('')
  const aisleScrollRef = useRef<HTMLDivElement | null>(null)
  const workspaceRootRef = useRef<HTMLElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const linkPromptInputRef = useRef<HTMLInputElement | null>(null)
  const editorRef = useRef<Editor | null>(null)
  const dismissedMentionStartRef = useRef<number | null>(null)
  const activeAisleIdRef = useRef('')
  const activeNoteLocationKeyRef = useRef('')
  const previousAssetToolsNoteLocationKeyRef = useRef('')
  const isMainViewRef = useRef(true)
  const pendingScrollToAisleIdRef = useRef<string | null>(null)
  const pendingFocusToAisleIdRef = useRef<string | null>(null)
  const pendingNavigationTopAisleIdRef = useRef<string | null>(null)
  const pendingFindReplaceRevealRef = useRef<FindReplaceMatch | null>(null)
  const scheduledAisleFocusScrollRef = useRef<ScheduledAisleFocusScroll>({ firstFrameId: null, followupFrameId: null })
  const navigateToNotebookLocationRef = useRef<(location: NotebookNavigationLocation) => boolean>(() => false)
  const pendingCreatedEditRef = useRef<unknown>(null)
  const pendingCreatedTreeRenameRef = useRef<PendingCreatedTreeRename | null>(null)
  const skipTreeRenameBlurItemIdRef = useRef('')
  const addAisleFromNewlineRef = useRef<((side: 'left' | 'right', aisleId: string, markdown: string) => void) | null>(null)
  const openTableOfContentsForAisleRef = useRef<((aisleId: string) => void) | null>(null)
  const tagAutocompleteRefreshRef = useRef<(() => void) | null>(null)
  const frontmatterStateSnapshotRef = useRef(state.frontmatter)
  const skipNextTreeRenameCommitRef = useRef(false)
  const sidebarResizeRef = useRef<{
    pointerId: number
    startClientX: number
    startWidth: number
  } | null>(null)
  const isMacPlatform = /Mac|iPhone|iPad|iPod/i.test(navigator.platform)
  const sidebarRevealLabel = useMemo(
    () => getNotebookSidebarRevealLabel(
      typeof window !== 'undefined'
        ? window.electronAPI?.platform ?? (isMacPlatform ? 'darwin' : navigator.platform)
        : undefined,
    ),
    [isMacPlatform],
  )

  useEffect(() => () => {
    cancelScheduledAisleFocusScroll(scheduledAisleFocusScrollRef.current, window)
  }, [])

  const toolbarState = useEditorToolbarState({
    viewMode,
    isMacPlatform,
    editorRef,
    stateRef,
  })

  const activeModel = useMemo(() => getActiveNoteModel(state), [state])
  const collapsedFolderIds = useMemo(() => new Set(state.ui.collapsedFolderIds), [state.ui.collapsedFolderIds])
  const visibleTreeNoteIds = useMemo(
    () => getVisibleNotebookTreeNoteIds(state.notebook.items, collapsedFolderIds),
    [collapsedFolderIds, state.notebook.items],
  )
  const selectedTreeNoteIdSet = useMemo(() => new Set(selectedTreeNoteIds), [selectedTreeNoteIds])
  const draggingTreeNoteIdSet = useMemo(() => new Set(draggingTreeNoteIds), [draggingTreeNoteIds])
  const noteFilterSettings = state.ui.noteFilter ?? getDefaultNoteFilterSettings()
  const sidebarSearchIndexes = useMemo(() => buildSidebarSearchIndexes(state), [state])
  const parsedSidebarSearch = useMemo(
    () => parseSidebarSearchInput(query, sidebarSearchIndexes),
    [query, sidebarSearchIndexes],
  )
  const sidebarSearchSelectedTokens = useMemo(
    () => mergeSidebarSearchTokens(
      getSidebarSearchSelectedTokens(noteFilterSettings, sidebarSearchIndexes),
      parsedSidebarSearch.tokens,
    ),
    [noteFilterSettings, parsedSidebarSearch.tokens, sidebarSearchIndexes],
  )
  const sidebarSearchSuggestions = useMemo(
    () => getSidebarSearchSuggestions(query, sidebarSearchIndexes, sidebarSearchSelectedTokens),
    [query, sidebarSearchIndexes, sidebarSearchSelectedTokens],
  )
  const sidebarSearchResultGroups = useMemo(
    () =>
      buildSidebarSearchResultGroups({
        state,
        query,
        filter: noteFilterSettings,
        indexes: sidebarSearchIndexes,
      }),
    [noteFilterSettings, query, sidebarSearchIndexes, state],
  )
  const sidebarSearchActive = query.trim().length > 0 || sidebarSearchSelectedTokens.length > 0
  const sidebarSearchVisible = sidebarSearchMode || sidebarSearchActive
  const noteActionEntries = useMemo(() => {
    if (!noteActionPicker) return []
    const activeNoteId = activeModel?.noteId ?? state.notebook.activeNoteId
    return filterNoteSearchEntries(
      listSearchableNoteLocations(state).filter((entry) => entry.noteId !== activeNoteId),
      noteActionPicker.query,
      12,
    )
  }, [activeModel?.noteId, noteActionPicker, state])
  const getNoteActionPickerAislesForNote = useCallback((noteId: string): NotebookNoteActionPickerAisleOption[] => {
    const note = findNotebookNote(state.notebook.items, noteId)?.note
    const noteBody = note ? state.noteBodies.find((body) => body.id === note.noteBodyId) : null
    return noteBody?.aisles.map((aisle, index) => ({ id: aisle.id, label: `aisle ${index + 1}` })) ?? []
  }, [state.noteBodies, state.notebook.items])
  const activeAisleIdsSignature = activeModel?.resolved.aisles.map((aisle) => aisle.id).join('|') ?? ''
  const activeNoteLocationKey = activeModel?.noteId ?? ''
  const activeNoteAisles = activeModel?.noteBody.aisles ?? []
  const savedActiveAisleId = activeModel
    ? getPreferredNotebookAisleId(state, activeModel.noteId, activeModel.noteBody.aisles)
    : ''
  const renderedActiveAisleId = useMemo(() => {
    if (!activeModel) return ''
    if (activeModel.resolved.aisles.some((aisle) => aisle.id === activeAisleId)) return activeAisleId
    if (savedActiveAisleId && activeModel.resolved.aisles.some((aisle) => aisle.id === savedActiveAisleId)) {
      return savedActiveAisleId
    }
    return activeModel.resolved.aisles[0]?.id ?? ''
  }, [activeAisleId, activeModel, savedActiveAisleId])
  const aisleBodyReferenceCounts = useMemo(() => getAisleBodyReferenceCounts(state.noteBodies), [state.noteBodies])
  const linkedAisleIds = useMemo(() => {
    if (!activeModel) return new Set<string>()
    return new Set(
      activeModel.resolved.aisles
        .filter((aisle) => (aisleBodyReferenceCounts.get(aisle.aisleBodyId) ?? 0) > 1)
        .map((aisle) => aisle.id),
    )
  }, [activeModel, aisleBodyReferenceCounts])
  const frontmatterAisleIds = useMemo(() => {
    if (!activeModel) return new Set<string>()
    return new Set(
      activeModel.resolved.aisles
        .filter((aisle) => {
          const body = getAisleBodyById(state, aisle.aisleBodyId)
          return Boolean(body?.frontmatter || body?.frontmatterRaw || body?.frontmatterStatus === 'invalid')
        })
        .map((aisle) => aisle.id),
    )
  }, [activeModel, state])
  const rootStyle = useMemo(
    () =>
      ({
        ...getThemePaletteVariables(state),
        '--note-font-scale': String(state.ui.noteFontScale),
        '--toolbar-button-scale': String(state.ui.toolbarButtonScale ?? 1),
      }) as CSSProperties,
    [state],
  )
  const toolbarLayout = useMemo(
    () => resolveToolbarLayout(state.ui.toolbarLayouts, activeToolbarLayoutId),
    [activeToolbarLayoutId, state.ui.toolbarLayouts],
  )
  const toolbarLayouts = useMemo(() => getToolbarLayouts(state.ui.toolbarLayouts), [state.ui.toolbarLayouts])
  const normalizedHotkeys = useMemo(() => normalizeHotkeySettings(state.hotkeys), [state.hotkeys])
  const activeAisleWidthLocationKey = activeModel ? buildNoteLocationKey({ noteId: activeModel.noteId }) : ''
  const activeAisleWidths = activeAisleWidthLocationKey ? state.ui.aisleWidths?.[activeAisleWidthLocationKey] ?? {} : {}
  const canDecoupleAisleById = useCallback(
    (aisleId: string) => {
      const aisle = activeModel?.resolved.aisles.find((candidate) => candidate.id === aisleId)
      return Boolean(aisle && (aisleBodyReferenceCounts.get(aisle.aisleBodyId) ?? 0) > 1)
    },
    [activeModel, aisleBodyReferenceCounts],
  )

  activeAisleIdRef.current = renderedActiveAisleId
  activeNoteLocationKeyRef.current = activeNoteLocationKey
  isMainViewRef.current = viewMode === 'main'

  useEffect(() => {
    if (!activeModel) return
    if (!activeModel.resolved.aisles.some((aisle) => aisle.id === activeAisleId)) {
      setActiveAisleId(savedActiveAisleId || (activeModel.resolved.aisles[0]?.id ?? ''))
    }
  }, [activeAisleId, activeAisleIdsSignature, activeModel, savedActiveAisleId])

  useEffect(() => {
    if (!selectedFolderId) return
    if (!findNotebookFolder(state.notebook.items, selectedFolderId)) {
      setSelectedFolderId('')
    }
  }, [selectedFolderId, state.notebook.items])

  useEffect(() => {
    const visibleNoteIdSet = new Set(visibleTreeNoteIds)
    setSelectedTreeNoteIds((current) => {
      const next = current.filter((noteId) => visibleNoteIdSet.has(noteId))
      return next.length === current.length ? current : next
    })
    setDraggingTreeNoteIds((current) => {
      const next = current.filter((noteId) => visibleNoteIdSet.has(noteId))
      return next.length === current.length ? current : next
    })
    if (treeSelectionAnchorNoteId && !visibleNoteIdSet.has(treeSelectionAnchorNoteId)) {
      setTreeSelectionAnchorNoteId('')
    }
  }, [treeSelectionAnchorNoteId, visibleTreeNoteIds])

  useEffect(() => {
    if (!expandedTrashItemId) return
    if (!state.notebook.deletedItems.some((entry) => entry.id === expandedTrashItemId)) {
      setExpandedTrashItemId('')
    }
  }, [expandedTrashItemId, state.notebook.deletedItems])

  useEffect(() => {
    if (renamingTreeItemId && !findNotebookItem(state.notebook.items, renamingTreeItemId)) {
      if (pendingCreatedTreeRenameRef.current?.itemId === renamingTreeItemId) {
        pendingCreatedTreeRenameRef.current = null
        pendingCreatedEditRef.current = null
      }
      setRenamingTreeItemId('')
      setTreeRenameDraft('')
    }
    if (draggingTreeItemId && !findNotebookItem(state.notebook.items, draggingTreeItemId)) {
      setDraggingTreeItemId('')
      setDraggingTreeNoteIds([])
      setTreeDropTarget(null)
    }
    if (treeContextMenu && !findNotebookItem(state.notebook.items, treeContextMenu.itemId)) {
      setTreeContextMenu(null)
    }
  }, [draggingTreeItemId, renamingTreeItemId, state.notebook.items, treeContextMenu])

  const mutateState = useCallback((updater: (previous: AppState) => AppState) => {
    setState((previous) => updater(previous))
  }, [])

  const setActiveToolbarLayoutId = useCallback((layoutId: string) => {
    const nextLayoutId = layoutId.trim() || DEFAULT_TOOLBAR_LAYOUT_ID
    setActiveToolbarLayoutIdState(nextLayoutId)
    saveNotebookActiveToolbarLayoutId(nextLayoutId)
  }, [])

  useEffect(() => {
    const nextLayoutId = resolveToolbarLayoutId(state.ui.toolbarLayouts, activeToolbarLayoutId)
    if (nextLayoutId === activeToolbarLayoutId) return
    setActiveToolbarLayoutId(nextLayoutId)
    setToolbarEditorLayoutId(nextLayoutId)
  }, [activeToolbarLayoutId, setActiveToolbarLayoutId, state.ui.toolbarLayouts])

  useEffect(() => {
    const nextSection = SETTINGS_SECTION_SET.has(state.ui.settingsSection) ? state.ui.settingsSection : 'data'
    setSettingsSectionState(nextSection)
    const nextDataSection = DATA_SECTION_SET.has(state.ui.dataSettingsSection ?? 'transfer')
      ? state.ui.dataSettingsSection ?? 'transfer'
      : 'transfer'
    setDataSettingsSectionState(nextDataSection)
  }, [state.ui.dataSettingsSection, state.ui.settingsSection])

  useEffect(() => {
    if (JSON.stringify(frontmatterDraft) === JSON.stringify(frontmatterStateSnapshotRef.current)) {
      setFrontmatterDraft(state.frontmatter)
      setFrontmatterFixedListOptionDrafts({})
    }
    frontmatterStateSnapshotRef.current = state.frontmatter
  }, [frontmatterDraft, state.frontmatter])

  const openUtilityView = useCallback((targetViewMode: UtilityViewMode = 'settings') => {
    setViewMode(targetViewMode)
  }, [])

  const handleSidebarSettingsClick = useCallback(() => {
    if (viewMode === 'settings') {
      setViewMode('main')
      return
    }
    openUtilityView('settings')
  }, [openUtilityView, viewMode])

  const setSettingsSection = useCallback(
    (section: SettingsSection) => {
      setSettingsSectionState(section)
      mutateState((previous) => ({
        ...previous,
        ui: {
          ...previous.ui,
          settingsSection: section,
        },
      }))
    },
    [mutateState],
  )

  const setDataSettingsSection = useCallback(
    (section: DataSettingsSection) => {
      setDataSettingsSectionState(section)
      mutateState((previous) => ({
        ...previous,
        ui: {
          ...previous.ui,
          dataSettingsSection: section,
        },
      }))
    },
    [mutateState],
  )

  const openNotebookManagerSettings = useCallback(() => {
    openUtilityView('settings')
    setSettingsSection('data')
    setDataSettingsSection('storage')
  }, [openUtilityView, setDataSettingsSection, setSettingsSection])

  useEffect(() => {
    return window.electronAPI?.onOpenNotebookManager?.(openNotebookManagerSettings) ?? (() => undefined)
  }, [openNotebookManagerSettings])

  const commitToolbarLayouts = useCallback(
    (buildNextLayouts: (layouts: AppState['ui']['toolbarLayouts']) => AppState['ui']['toolbarLayouts']) => {
      mutateState((previous) => ({
        ...previous,
        ui: {
          ...previous.ui,
          toolbarLayouts: normalizeToolbarLayouts(buildNextLayouts(previous.ui.toolbarLayouts)),
        },
      }))
    },
    [mutateState],
  )

  const selectToolbarLayoutForEditing = useCallback(
    (layoutId: string) => {
      const nextLayoutId = getToolbarLayouts(stateRef.current.ui.toolbarLayouts).some((layout) => layout.id === layoutId)
        ? layoutId
        : DEFAULT_TOOLBAR_LAYOUT_ID
      setToolbarEditorLayoutId(nextLayoutId)
      setActiveToolbarLayoutId(nextLayoutId)
    },
    [setActiveToolbarLayoutId, stateRef],
  )

  const createToolbarLayoutSetting = useCallback(() => {
    const layouts = getToolbarLayouts(stateRef.current.ui.toolbarLayouts)
    const layout = createCustomToolbarLayout(getNextCoolbarToolbarLayoutName(layouts), getDefaultToolbarLayout().items)
    commitToolbarLayouts((currentLayouts) => [...normalizeToolbarLayouts(currentLayouts), layout])
    setToolbarEditorLayoutId(layout.id)
    setActiveToolbarLayoutId(layout.id)
  }, [commitToolbarLayouts, setActiveToolbarLayoutId, stateRef])

  const duplicateToolbarLayoutSetting = useCallback(
    (layoutId: string) => {
      const layouts = getToolbarLayouts(stateRef.current.ui.toolbarLayouts)
      const source = layouts.find((layout) => layout.id === layoutId) ?? getDefaultToolbarLayout()
      const layout = createCustomToolbarLayout(getDuplicateToolbarLayoutName(source.name, layouts), source.items)
      commitToolbarLayouts((currentLayouts) => [...normalizeToolbarLayouts(currentLayouts), layout])
      setToolbarEditorLayoutId(layout.id)
      setActiveToolbarLayoutId(layout.id)
    },
    [commitToolbarLayouts, setActiveToolbarLayoutId, stateRef],
  )

  const renameToolbarLayoutSetting = useCallback(
    (layoutId: string, name: string) => {
      if (isProtectedToolbarLayoutId(layoutId)) return
      commitToolbarLayouts((layouts) =>
        updateToolbarLayout(layouts, layoutId, (layout) => ({
          ...layout,
          name: name.trim() || 'toolbar',
        })),
      )
    },
    [commitToolbarLayouts],
  )

  const deleteToolbarLayoutSetting = useCallback(
    (layoutId: string) => {
      if (isProtectedToolbarLayoutId(layoutId)) return
      commitToolbarLayouts((layouts) => removeToolbarLayout(layouts, layoutId))
      if (toolbarEditorLayoutId === layoutId) setToolbarEditorLayoutId(DEFAULT_TOOLBAR_LAYOUT_ID)
      if (activeToolbarLayoutId === layoutId) setActiveToolbarLayoutId(DEFAULT_TOOLBAR_LAYOUT_ID)
    },
    [activeToolbarLayoutId, commitToolbarLayouts, setActiveToolbarLayoutId, toolbarEditorLayoutId],
  )

  const addToolbarToolSetting = useCallback(
    (layoutId: string, toolId: string, targetIndex?: number) => {
      if (isProtectedToolbarLayoutId(layoutId) || !isToolbarToolId(toolId)) return
      commitToolbarLayouts((layouts) =>
        updateToolbarLayout(layouts, layoutId, (layout) => ({
          ...layout,
          items: insertToolbarLayoutItemAtIndex(
            layout.items,
            createToolbarToolItem(toolId),
            typeof targetIndex === 'number' ? targetIndex : layout.items.length,
          ),
        })),
      )
    },
    [commitToolbarLayouts],
  )

  const addToolbarSpacerSetting = useCallback(
    (layoutId: string, targetIndex?: number) => {
      if (isProtectedToolbarLayoutId(layoutId)) return
      commitToolbarLayouts((layouts) =>
        updateToolbarLayout(layouts, layoutId, (layout) => ({
          ...layout,
          items: insertToolbarLayoutItemAtIndex(
            layout.items,
            createToolbarSpacerItem(),
            typeof targetIndex === 'number' ? targetIndex : layout.items.length,
          ),
        })),
      )
    },
    [commitToolbarLayouts],
  )

  const removeToolbarItemSetting = useCallback(
    (layoutId: string, itemId: string) => {
      if (isProtectedToolbarLayoutId(layoutId)) return
      commitToolbarLayouts((layouts) =>
        updateToolbarLayout(layouts, layoutId, (layout) => ({
          ...layout,
          items: removeToolbarLayoutItem(layout.items, itemId),
        })),
      )
    },
    [commitToolbarLayouts],
  )

  const moveToolbarItemSetting = useCallback(
    (layoutId: string, itemId: string, direction: 'up' | 'down') => {
      if (isProtectedToolbarLayoutId(layoutId)) return
      commitToolbarLayouts((layouts) =>
        updateToolbarLayout(layouts, layoutId, (layout) => ({
          ...layout,
          items: moveToolbarLayoutItem(layout.items, itemId, direction),
        })),
      )
    },
    [commitToolbarLayouts],
  )

  const moveToolbarItemToIndexSetting = useCallback(
    (layoutId: string, itemId: string, targetIndex: number) => {
      if (isProtectedToolbarLayoutId(layoutId)) return
      commitToolbarLayouts((layouts) =>
        updateToolbarLayout(layouts, layoutId, (layout) => ({
          ...layout,
          items: moveToolbarLayoutItemToIndex(layout.items, itemId, targetIndex),
        })),
      )
    },
    [commitToolbarLayouts],
  )

  const updateShortcutSetting = useCallback(
    (shortcutId: ShortcutId, value: string) => {
      mutateState((previous) => {
        const hotkeys = normalizeHotkeySettings(previous.hotkeys)
        return {
          ...previous,
          hotkeys: {
            ...hotkeys,
            shortcuts: {
              ...hotkeys.shortcuts,
              [shortcutId]: value,
            },
          },
        }
      })
    },
    [mutateState],
  )

  const updateNewlineShortcutSetting = useCallback(
    (shortcutId: NewlineShortcutId, operation: NewlineOperationId) => {
      mutateState((previous) => {
        const hotkeys = normalizeHotkeySettings(previous.hotkeys)
        return {
          ...previous,
          hotkeys: {
            ...hotkeys,
            newlineShortcuts: {
              ...hotkeys.newlineShortcuts,
              shortcuts: {
                ...hotkeys.newlineShortcuts.shortcuts,
                [shortcutId]: operation,
              },
            },
          },
        }
      })
    },
    [mutateState],
  )

  const updateShortcutMenuOperationsSetting = useCallback(
    (operations: NewlineOperationId[]) => {
      mutateState((previous) => {
        const hotkeys = normalizeHotkeySettings(previous.hotkeys)
        return {
          ...previous,
          hotkeys: {
            ...hotkeys,
            newlineShortcuts: {
              ...hotkeys.newlineShortcuts,
              menuOperations: operations,
            },
          },
        }
      })
    },
    [mutateState],
  )

  const commitAisleMarkdown = useCallback(
    (aisleBodyId: string, markdown: string) => {
      mutateState((previous) => commitNotebookAisleMarkdownInState(previous, aisleBodyId, markdown))
    },
    [mutateState],
  )

  const handleNoteMentionQueryChange = useCallback((mention: NoteMentionQuery | null, anchor: NotebookNoteActionPickerAnchor | null) => {
    void anchor
    setNoteActionPicker((current) => {
      if (!mention) {
        dismissedMentionStartRef.current = null
        return current?.source === 'mention' ? null : current
      }
      if (dismissedMentionStartRef.current === mention.from) {
        return current?.source === 'mention' ? null : current
      }
      dismissedMentionStartRef.current = null
      return {
        source: 'mention',
        title: 'Select note',
        query: mention.query,
        mentionRange: mention,
        anchor: null,
        actions: ['note-link', 'note-preview', 'independent-copy', 'synced-copy'],
      }
    })
  }, [])

  const openNoteReferenceFromEditor = useCallback(
    (target: NoteLocation) => {
      navigateToNotebookLocationRef.current({
        noteId: target.noteId,
        aisleId: getAisleIdFromNavigationTarget(target),
      })
    },
    [],
  )

  const applyNotebookStructureClipboardPaste = useCallback(
    (payload: NotebookStructureClipboardPayload, aisleId: string) => {
      let nextActiveAisleId = ''
      let blockedMessage = ''
      mutateState((previous) => {
        const result = applyNotebookStructureClipboardPayload(previous, {
          activeNoteId: previous.notebook.activeNoteId,
          focusedAisleId: aisleId,
          payload,
        })
        if (result.status === 'blocked') {
          blockedMessage = result.message
          return previous
        }
        nextActiveAisleId = result.activeAisleId ?? ''
        return pruneUnreferencedBodies(result.state)
      })
      if (blockedMessage) {
        window.alert(blockedMessage)
        return true
      }
      if (nextActiveAisleId) setActiveAisleId(nextActiveAisleId)
      return true
    },
    [mutateState],
  )

  const insertAisleFromNewlineShortcut = useCallback((side: 'left' | 'right', aisleId: string, markdown: string) => {
    addAisleFromNewlineRef.current?.(side, aisleId, markdown)
  }, [])

  const openTableOfContentsFromEditorShortcut = useCallback((aisleId: string) => {
    openTableOfContentsForAisleRef.current?.(aisleId)
  }, [])

  const openShortcutMenuFromEditor = useCallback(
    ({ aisleId, anchor }: { aisleId: string; anchor: { top: number; left: number } }) => {
      const estimatedMenuHeight =
        SHORTCUT_MENU_ESTIMATED_VERTICAL_PADDING +
        Math.max(1, normalizedHotkeys.newlineShortcuts.menuOperations.length) * SHORTCUT_MENU_ESTIMATED_ITEM_HEIGHT
      const position = clampContextMenuPosition(
        { x: anchor.left, y: anchor.top },
        { width: SHORTCUT_MENU_ESTIMATED_WIDTH, height: estimatedMenuHeight },
        getNotebookMenuViewportSize(),
      )
      toolbarState.closeToolbarPopovers()
      setAisleContextMenu(null)
      setEditorContextMenu(null)
      setTreeContextMenu(null)
      setShortcutMenu({
        aisleId,
        top: position.top,
        left: position.left,
        activeIndex: 0,
      })
    },
    [normalizedHotkeys.newlineShortcuts.menuOperations.length, toolbarState],
  )

  const openUrlLinkPrompt = useCallback((prompt: LinkPromptState) => {
    toolbarState.closeToolbarPopovers()
    setEditorContextMenu(null)
    setAisleContextMenu(null)
    setTreeContextMenu(null)
    setShortcutMenu(null)
    setNoteActionPicker(null)
    setLinkPrompt(prompt)
    window.setTimeout(() => {
      linkPromptInputRef.current?.focus()
      linkPromptInputRef.current?.select()
    }, 0)
  }, [toolbarState])

  const closeLinkPrompt = useCallback(() => {
    setLinkPrompt((current) => closeLinkPromptState(current))
  }, [])

  const refreshTagAutocompleteFromEditor = useCallback(() => {
    tagAutocompleteRefreshRef.current?.()
  }, [])

  const notebookEditors = useNotebookAisleEditors({
    viewMode,
    noteId: activeModel?.noteId ?? '',
    noteBodyId: activeModel?.noteBody.id ?? '',
    aisles: activeModel?.resolved.aisles ?? [],
    activeAisleId: renderedActiveAisleId,
    setActiveAisleId,
    aisleScrollRef,
    editorRef,
    commitAisleMarkdown,
    scheduleToolbarFormatStateSync: toolbarState.scheduleToolbarFormatStateSync,
    onNoteMentionQueryChange: handleNoteMentionQueryChange,
    onTagAutocompleteQueryChange: refreshTagAutocompleteFromEditor,
    getAppState: () => stateRef.current,
    onOpenNoteReference: openNoteReferenceFromEditor,
    onNotebookStructurePaste: applyNotebookStructureClipboardPaste,
    hotkeys: state.hotkeys,
    isMacPlatform,
    onOpenShortcutMenu: openShortcutMenuFromEditor,
    onOpenTableOfContents: openTableOfContentsFromEditorShortcut,
    onOpenUrlLinkPrompt: openUrlLinkPrompt,
    onInsertAisleFromNewline: insertAisleFromNewlineShortcut,
    externalStateLoadVersion,
  })

  const updateTagAutocompleteRecentKeys = useCallback((keys: string[]) => {
    const normalizedKeys = normalizeTagAutocompleteRecentKeys(keys)
    setTagAutocompleteRecentKeys(normalizedKeys)
    saveTagAutocompleteRecentKeys(normalizedKeys)
  }, [])

  const tagAutocompleteController = useTagAutocompleteController({
    viewMode,
    getAvailableTags: () => sidebarSearchIndexes.tags.availableOptions,
    recentTagKeys: tagAutocompleteRecentKeys,
    onRecentTagKeysChange: updateTagAutocompleteRecentKeys,
    editorRef,
    editorEventRootRef: workspaceRootRef,
    activeAisleIdRef,
    commitActiveEditorMarkdownNow: notebookEditors.commitActiveEditorMarkdownNow,
    syncToolbarFormatState: toolbarState.syncToolbarFormatState,
  })
  tagAutocompleteRefreshRef.current = tagAutocompleteController.refreshQuery

  const activateEditorFromAssetTarget = useCallback(
    (target: EventTarget | null) => {
      const element = target instanceof Element ? target : null
      const aisleId = element?.closest<HTMLElement>('.note-aisle-pane')?.dataset.aisleId?.trim()
      const noteBodyId = activeModel?.noteBody.id ?? ''
      if (!aisleId || !noteBodyId) return
      notebookEditors.activateAisleEditor(buildAisleEditorKey(noteBodyId, aisleId))
    },
    [activeModel?.noteBody.id, notebookEditors],
  )

  const commitCurrentEditorContent = useCallback(() => {
    const editor = editorRef.current
    if (editor) notebookEditors.commitActiveEditorMarkdownNow(editor)
  }, [notebookEditors])

  const pushEditorToolToast = useCallback((message: string, tone?: ToastTone) => {
    if (tone === 'warning' || tone === 'error') window.alert(message)
  }, [])

  const imageToolsController = useImageTools({
    editorRef,
    editorEventRootRef: workspaceRootRef,
    activateEditorFromEventTarget: activateEditorFromAssetTarget,
    commitCurrentEditorContent,
    commitActiveEditorMarkdownNow: notebookEditors.commitActiveEditorMarkdownNow,
    pushToast: pushEditorToolToast,
  })

  const mediaToolsController = useMediaTools({
    editorRef,
    editorEventRootRef: workspaceRootRef,
    activateEditorFromEventTarget: activateEditorFromAssetTarget,
    commitCurrentEditorContent,
    commitActiveEditorMarkdownNow: notebookEditors.commitActiveEditorMarkdownNow,
  })

  useEffect(() => {
    if (viewMode === 'main' && !aisleEditModalOpen) return
    imageToolsController.close()
    mediaToolsController.close()
  }, [aisleEditModalOpen, imageToolsController, mediaToolsController, viewMode])

  useEffect(() => {
    if (previousAssetToolsNoteLocationKeyRef.current === activeNoteLocationKey) return
    previousAssetToolsNoteLocationKeyRef.current = activeNoteLocationKey
    imageToolsController.close()
    mediaToolsController.close()
  }, [activeNoteLocationKey, imageToolsController, mediaToolsController])

  const selectEditableAssetFromWorkspace = useCallback(
    (target: Element) => {
      if (!target.closest('.toastui-editor .ProseMirror')) {
        imageToolsController.close()
        mediaToolsController.close()
        return
      }

      if (target instanceof HTMLImageElement) {
        mediaToolsController.close()
        imageToolsController.select(target)
        return
      }

      const mediaPlayer = target.closest<HTMLElement>(MEDIA_PLAYER_SELECTOR)
      if (mediaPlayer?.dataset.mediaKind === 'video') {
        imageToolsController.close()
        mediaToolsController.select(mediaPlayer)
        return
      }

      imageToolsController.close()
      mediaToolsController.close()
    },
    [imageToolsController, mediaToolsController],
  )

  const cursorPersistence = useNoteCursorPersistence({
    setState,
    editorRef,
    activeEditorAisleIdRef: notebookEditors.activeEditorAisleIdRef,
    viewMode,
    activeNoteBodyId: activeModel?.noteBody.id ?? '',
    activeNoteLocationKey,
    activeNoteAisles,
    activeAisleId: renderedActiveAisleId,
    activeAisleIdRef,
    activeNoteLocationKeyRef,
    isMainViewRef,
    noteCursorLocations: state.ui.noteCursorLocations,
    pendingFocusToAisleIdRef,
    pendingScrollToAisleIdRef,
    setActiveAisleId,
  })
  const pendingCursorRestoreRef = cursorPersistence.pendingCursorRestoreRef
  const applyActiveCursorToState = cursorPersistence.applyActiveCursorToState

  const scrollAisleIntoHorizontalView = useCallback((aisleId: string) => {
    const scrollNode = aisleScrollRef.current
    if (!scrollNode) return false
    const revealed = scrollAislePaneIntoHorizontalView(scrollNode, aisleId)
    if (revealed && pendingScrollToAisleIdRef.current === aisleId) {
      pendingScrollToAisleIdRef.current = null
    }
    return revealed
  }, [])

  const scheduleAisleFocusScroll = useCallback(
    (noteBodyId: string, aisleId: string) => {
      if (!noteBodyId || !aisleId) return
      scheduleFocusedAisleScroll({
        scheduled: scheduledAisleFocusScrollRef.current,
        aisleId,
        noteBodyId,
        scheduler: window,
        getCurrentNoteBodyId: () => getActiveNoteModel(stateRef.current)?.noteBody.id ?? '',
        hasAisle: (targetAisleId) => {
          const active = getActiveNoteModel(stateRef.current)
          return Boolean(
            active?.noteBody.id === noteBodyId &&
              active.noteBody.aisles.some((aisle) => aisle.id === targetAisleId),
          )
        },
        scrollAisleIntoHorizontalView,
        onInvalidAisle: (invalidAisleId) => {
          if (pendingScrollToAisleIdRef.current === invalidAisleId) {
            pendingScrollToAisleIdRef.current = null
          }
        },
      })
    },
    [scrollAisleIntoHorizontalView, stateRef],
  )

  useEffect(() => {
    const pendingAisleId = pendingScrollToAisleIdRef.current
    if (viewMode !== 'main' || !activeModel || !pendingAisleId) return
    if (!activeModel.noteBody.aisles.some((aisle) => aisle.id === pendingAisleId)) return
    scheduleAisleFocusScroll(activeModel.noteBody.id, pendingAisleId)
  }, [activeModel, renderedActiveAisleId, scheduleAisleFocusScroll, viewMode])

  const getLatestNotebookStateFromMountedEditors = useCallback(() => {
    const snapshots = notebookEditors.getMountedEditorMarkdownSnapshots()
    return {
      state: applyActiveCursorToState(applyNotebookEditorMarkdownSnapshotsToState(stateRef.current, snapshots)),
      pendingEditorCount: snapshots.length,
    }
  }, [applyActiveCursorToState, notebookEditors, stateRef])

  const commitNotebookBeforeStorageAction = useCallback(async () => {
    const latest = getLatestNotebookStateFromMountedEditors()
    await commitAppStateNow(latest.state, {
      preferSync: true,
      flushQueue: true,
      trigger: 'notebook-storage-action',
      pendingEditorCount: latest.pendingEditorCount,
    })
  }, [commitAppStateNow, getLatestNotebookStateFromMountedEditors])

  const pushStorageToast = useCallback((message: string, tone?: ToastTone) => {
    if (tone === 'warning' || tone === 'error') window.alert(message)
  }, [])

  const storageProfileController = useStorageProfileController({
    pushToast: pushStorageToast,
    beforeStorageAction: commitNotebookBeforeStorageAction,
  })

  const findReplaceMode = state.ui.findReplaceMode ?? 'find'
  const findReplaceScope = state.ui.findReplaceScope ?? 'note'
  const findReplaceOptions = useMemo(
    () => ({
      caseSensitive: state.ui.findCaseSensitive ?? false,
      wholeWord: state.ui.findWholeWord ?? false,
      regex: state.ui.findRegex ?? false,
    }),
    [state.ui.findCaseSensitive, state.ui.findRegex, state.ui.findWholeWord],
  )
  const findReplaceQueryError = useMemo(
    () => getFindReplaceQueryError(findReplaceQuery, findReplaceOptions),
    [findReplaceOptions, findReplaceQuery],
  )
  const findReplaceMatches = useMemo(() => {
    if (!findReplaceOpen || !activeModel || findReplaceQueryError || !findReplaceQuery.trim()) return []
    return findVisibleMatches(
      state,
      { noteId: activeModel.noteId },
      findReplaceScope,
      findReplaceQuery,
      findReplaceOptions,
    )
  }, [
    activeModel,
    findReplaceOpen,
    findReplaceOptions,
    findReplaceQuery,
    findReplaceQueryError,
    findReplaceScope,
    state,
  ])

  useEffect(() => {
    setFindReplaceActiveIndex((current) =>
      findReplaceMatches.length > 0 ? Math.min(current, findReplaceMatches.length - 1) : 0,
    )
  }, [findReplaceMatches.length])
  const findReplaceActiveMatchIndex =
    findReplaceMatches.length > 0 ? Math.min(findReplaceActiveIndex, findReplaceMatches.length - 1) : 0

  const clearNotebookNavigationTransientUi = useCallback(() => {
    setAisleContextMenu(null)
    setEditorContextMenu(null)
    setTreeContextMenu(null)
    setShortcutMenu(null)
    setNoteActionPicker(null)
    setTableOfContentsPanels(null)
    setLinkPrompt(CLOSED_LINK_PROMPT_STATE)
    toolbarState.closeToolbarPopovers()
  }, [toolbarState])

  const applyNotebookNavigationLocation = useCallback(
    (location: NotebookNavigationLocation) => {
      const snapshots = notebookEditors.getMountedEditorMarkdownSnapshots()
      const snapshotState = applyNotebookEditorMarkdownSnapshotsToState(stateRef.current, snapshots)
      const resolvedLocation = resolveNotebookNavigationLocation(snapshotState, location)
      if (!resolvedLocation) return false
      const targetNoteBodyId = findNotebookNote(snapshotState.notebook.items, resolvedLocation.noteId)?.note.noteBodyId ?? ''

      pendingFocusToAisleIdRef.current = resolvedLocation.aisleId || null
      pendingScrollToAisleIdRef.current = resolvedLocation.aisleId || null
      pendingNavigationTopAisleIdRef.current = null
      setActiveAisleId(resolvedLocation.aisleId)
      setSelectedFolderId('')
      clearNotebookNavigationTransientUi()
      mutateState((previous) => {
        const previousWithEditorContent = applyNotebookEditorMarkdownSnapshotsToState(previous, snapshots)
        const previousWithCursor = applyActiveCursorToState(previousWithEditorContent)
        if (previousWithCursor.notebook.activeNoteId === resolvedLocation.noteId) return previousWithCursor
        return {
          ...previousWithCursor,
          notebook: {
            ...previousWithCursor.notebook,
            activeNoteId: resolvedLocation.noteId,
          },
        }
      })
      setViewMode('main')
      scheduleAisleFocusScroll(targetNoteBodyId, resolvedLocation.aisleId)
      window.requestAnimationFrame(() => {
        if (pendingFocusToAisleIdRef.current !== (resolvedLocation.aisleId || null)) return
        const active = getActiveNoteModel(stateRef.current)
        if (!active || active.noteId !== resolvedLocation.noteId) return
        if (!active.noteBody.aisles.some((aisle) => aisle.id === resolvedLocation.aisleId)) return
        notebookEditors.activateAisleEditor(buildAisleEditorKey(active.noteBody.id, resolvedLocation.aisleId), {
          focus: true,
          source: 'programmatic',
        })
      })
      return true
    },
    [applyActiveCursorToState, clearNotebookNavigationTransientUi, mutateState, notebookEditors, scheduleAisleFocusScroll, stateRef],
  )

  navigateToNotebookLocationRef.current = applyNotebookNavigationLocation

  const resolveNotebookNavigationHistoryLocation = useCallback(
    (location: NotebookNavigationLocation) => resolveNotebookNavigationLocation(stateRef.current, location),
    [stateRef],
  )

  const { navigateNotebookHistoryBy } = useNotebookNavigationHistory({
    viewMode,
    activeNoteId: activeModel?.noteId ?? '',
    resolveLocation: resolveNotebookNavigationHistoryLocation,
    onApplyLocation: applyNotebookNavigationLocation,
  })

  usePendingNoteCursorRestore({
    viewMode,
    activeNoteBodyId: activeModel?.noteBody.id ?? '',
    activeNoteAisles,
    resolvedActiveAisleId: renderedActiveAisleId,
    activeNoteLocationKey,
    editing: renamingTreeItemId,
    editorRef,
    pendingCreatedEditRef,
    pendingFocusToAisleIdRef,
    pendingCursorRestoreRef,
    pendingNavigationTopAisleIdRef,
    activateAisleEditor: notebookEditors.activateAisleEditor,
  })

  const updateFindReplaceUi = useCallback(
    (patch: Partial<Pick<
      AppState['ui'],
      'findCaseSensitive' | 'findWholeWord' | 'findRegex' | 'findReplaceMode' | 'findReplaceScope'
    >>) => {
      mutateState((previous) => ({
        ...previous,
        ui: {
          ...previous.ui,
          ...patch,
        },
      }))
    },
    [mutateState],
  )

  const openFindReplace = useCallback(
    (mode: 'find' | 'replace' = 'find') => {
      if (!activeModel) return
      const editor = editorRef.current
      if (editor) notebookEditors.commitActiveEditorMarkdownNow(editor)
      setViewMode('main')
      toolbarState.closeToolbarPopovers()
      setAisleContextMenu(null)
      setEditorContextMenu(null)
      setTreeContextMenu(null)
      setShortcutMenu(null)
      setNoteActionPicker(null)
      setLinkPrompt(CLOSED_LINK_PROMPT_STATE)
      setFindReplaceOpen(true)
      setFindReplaceActiveIndex(0)
      setFindReplaceFocusRequestId((current) => current + 1)
      updateFindReplaceUi({
        findReplaceMode: mode,
        findReplaceScope: 'note',
      })
    },
    [activeModel, notebookEditors, toolbarState, updateFindReplaceUi],
  )

  const closeFindReplace = useCallback(() => {
    pendingFindReplaceRevealRef.current = null
    setFindReplaceOpen(false)
  }, [])

  const scrollPendingFindReplaceMatch = useCallback(() => {
    const match = pendingFindReplaceRevealRef.current
    if (!match || viewMode !== 'main' || !activeModel || activeModel.noteId !== match.location.noteId) return false
    if (renderedActiveAisleId !== match.aisleId || !notebookEditors.mountedAisleIds.has(match.aisleId)) return false
    pendingFindReplaceRevealRef.current = null
    notebookEditors.activateAisleEditor(buildAisleEditorKey(match.noteBodyId, match.aisleId), {
      focus: true,
      source: 'programmatic',
    })
    return notebookEditors.scrollToAisleRange(match.aisleId, match.markdownFrom, match.markdownTo)
  }, [activeModel, notebookEditors, renderedActiveAisleId, viewMode])

  useEffect(() => {
    scrollPendingFindReplaceMatch()
  }, [scrollPendingFindReplaceMatch])

  const revealFindReplaceMatch = useCallback(
    (match: FindReplaceMatch) => {
      if (match.context.noteKind === 'scratchpad') return
      pendingFindReplaceRevealRef.current = match
      if (activeModel?.noteId !== match.location.noteId) {
        applyNotebookNavigationLocation({ noteId: match.location.noteId, aisleId: match.aisleId })
        return
      }
      setViewMode('main')
      setActiveAisleId(match.aisleId)
      scheduleAisleFocusScroll(match.noteBodyId, match.aisleId)
      window.requestAnimationFrame(() => {
        scrollPendingFindReplaceMatch()
      })
    },
    [activeModel?.noteId, applyNotebookNavigationLocation, scheduleAisleFocusScroll, scrollPendingFindReplaceMatch],
  )

  const selectFindReplaceMatch = useCallback(
    (index: number) => {
      if (findReplaceMatches.length === 0) return
      const safeIndex = ((index % findReplaceMatches.length) + findReplaceMatches.length) % findReplaceMatches.length
      setFindReplaceActiveIndex(safeIndex)
      revealFindReplaceMatch(findReplaceMatches[safeIndex])
    },
    [findReplaceMatches, revealFindReplaceMatch],
  )

  const updateFindReplaceQuery = useCallback((nextQuery: string) => {
    setFindReplaceQuery(nextQuery)
    setFindReplaceActiveIndex(0)
  }, [])

  const updateFindReplaceScope = useCallback(
    (scope: FindReplaceScope) => {
      setFindReplaceActiveIndex(0)
      updateFindReplaceUi({ findReplaceScope: scope })
    },
    [updateFindReplaceUi],
  )

  const replaceFindMatches = useCallback(
    (matchesToReplace: FindReplaceMatch[]) => {
      if (matchesToReplace.length === 0 || findReplaceQueryError) return
      pendingFindReplaceRevealRef.current = null
      mutateState((previous) => {
        const snapshots = notebookEditors.getMountedEditorMarkdownSnapshots()
        const latest = applyActiveCursorToState(applyNotebookEditorMarkdownSnapshotsToState(previous, snapshots))
        return applyFindReplacementToState(latest, matchesToReplace, findReplaceReplacement).state
      })
    },
    [
      applyActiveCursorToState,
      findReplaceQueryError,
      findReplaceReplacement,
      mutateState,
      notebookEditors,
    ],
  )

  useEffect(() => {
    const handleFindReplaceShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || viewMode !== 'main' || !activeModel) return
      const mode = getFindReplaceShortcutMode(event, isMacPlatform)
      if (mode !== 'find') return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      openFindReplace('find')
    }
    window.addEventListener('keydown', handleFindReplaceShortcut, true)
    return () => {
      window.removeEventListener('keydown', handleFindReplaceShortcut, true)
    }
  }, [activeModel, isMacPlatform, openFindReplace, viewMode])

  const focusBoundaryFlushTimerRef = useRef<number | null>(null)

  const clearNotebookFocusBoundaryFlush = useCallback(() => {
    if (focusBoundaryFlushTimerRef.current === null) return
    window.clearTimeout(focusBoundaryFlushTimerRef.current)
    focusBoundaryFlushTimerRef.current = null
  }, [])

  const flushNotebookPersistenceNow = useCallback((eventName: 'blur' | 'visibilitychange' | 'beforeunload' | 'pagehide') => {
    clearNotebookFocusBoundaryFlush()
    const latest = getLatestNotebookStateFromMountedEditors()
    void commitAppStateNow(latest.state, {
      preferSync: eventName === 'beforeunload' || eventName === 'pagehide',
      flushQueue: true,
      trigger: `notebook-editor-focus-boundary:${eventName}`,
      pendingEditorCount: latest.pendingEditorCount,
    })
  }, [clearNotebookFocusBoundaryFlush, commitAppStateNow, getLatestNotebookStateFromMountedEditors])

  const scheduleNotebookFocusBoundaryFlush = useCallback((eventName: 'blur' | 'visibilitychange') => {
    if (eventName === 'visibilitychange' && document.visibilityState !== 'hidden') return
    if (focusBoundaryFlushTimerRef.current !== null) return
    focusBoundaryFlushTimerRef.current = window.setTimeout(() => {
      focusBoundaryFlushTimerRef.current = null
      flushNotebookPersistenceNow(eventName)
    }, NOTEBOOK_FOCUS_BOUNDARY_FLUSH_DELAY_MS)
  }, [flushNotebookPersistenceNow])

  useEffect(() => {
    const flushOnExit = (event: PageTransitionEvent | Event) => {
      flushNotebookPersistenceNow(event.type === 'pagehide' ? 'pagehide' : 'beforeunload')
    }
    window.addEventListener('beforeunload', flushOnExit)
    window.addEventListener('pagehide', flushOnExit)
    return () => {
      window.removeEventListener('beforeunload', flushOnExit)
      window.removeEventListener('pagehide', flushOnExit)
    }
  }, [flushNotebookPersistenceNow])

  useEffect(() => {
    const flushOnWindowBlur = () => scheduleNotebookFocusBoundaryFlush('blur')
    const flushOnHidden = () => scheduleNotebookFocusBoundaryFlush('visibilitychange')
    window.addEventListener('blur', flushOnWindowBlur)
    document.addEventListener('visibilitychange', flushOnHidden)
    return () => {
      window.removeEventListener('blur', flushOnWindowBlur)
      document.removeEventListener('visibilitychange', flushOnHidden)
      clearNotebookFocusBoundaryFlush()
    }
  }, [clearNotebookFocusBoundaryFlush, scheduleNotebookFocusBoundaryFlush])

  const tableControlsController = useTableControls({
    visible: viewMode === 'main' && !aisleEditModalOpen,
    editorRef,
    editorEventRootRef: workspaceRootRef,
    commitActiveEditorMarkdownNow: notebookEditors.commitActiveEditorMarkdownNow,
    syncToolbarFormatState: toolbarState.syncToolbarFormatState,
  })

  const listReorderControlsController = useListReorderControls({
    visible: viewMode === 'main' && !aisleEditModalOpen,
    editorRef,
    editorEventRootRef: workspaceRootRef,
    commitActiveEditorMarkdownNow: notebookEditors.commitActiveEditorMarkdownNow,
    syncToolbarFormatState: toolbarState.syncToolbarFormatState,
  })

  const beginCreatedTreeRename = useCallback((pending: PendingCreatedTreeRename, title: string) => {
    pendingCreatedTreeRenameRef.current = pending
    pendingCreatedEditRef.current = pending
    skipNextTreeRenameCommitRef.current = false
    setRenamingTreeItemId(pending.itemId)
    setTreeRenameDraft(title)
  }, [])

  const finishCreatedTreeRename = useCallback(
    (itemId: string, source: NotebookTreeRenameCommitSource) => {
      const pending = pendingCreatedTreeRenameRef.current
      if (!pending || pending.itemId !== itemId) return null
      pendingCreatedTreeRenameRef.current = null
      pendingCreatedEditRef.current = null
      if (source !== 'enter') return pending

      if (pending.kind === 'note') {
        pendingFocusToAisleIdRef.current = pending.aisleId
        pendingScrollToAisleIdRef.current = pending.aisleId
        pendingNavigationTopAisleIdRef.current = pending.aisleId
        pendingCursorRestoreRef.current = {
          noteLocationKey: pending.itemId,
          aisleId: pending.aisleId,
          selection: null,
          focus: true,
          focusIntent: 'aisle-activation',
        }
        setActiveAisleId(pending.aisleId)
        return pending
      }

      if (!pending.returnNoteBodyId || !pending.returnAisleId) return pending
      pendingFocusToAisleIdRef.current = null
      pendingScrollToAisleIdRef.current = null
      pendingNavigationTopAisleIdRef.current = null
      setActiveAisleId(pending.returnAisleId)
      window.requestAnimationFrame(() => {
        notebookEditors.activateAisleEditor(buildAisleEditorKey(pending.returnNoteBodyId, pending.returnAisleId), {
          focus: true,
          source: 'programmatic',
        })
      })
      return pending
    },
    [notebookEditors, pendingCursorRestoreRef],
  )

  const clearSidebarSearch = useCallback(() => {
    setQuery('')
    mutateState((previous) => ({
      ...previous,
      ui: {
        ...previous.ui,
        noteFilter: clearSidebarSearchFilter(previous.ui.noteFilter),
      },
    }))
  }, [mutateState])

  const closeSidebarSearchMode = useCallback(() => {
    clearSidebarSearch()
    setSidebarSearchMode(false)
  }, [clearSidebarSearch])

  const createNoteAt = useCallback((targetParentFolderId?: string | null, targetIndex?: number) => {
    const createdRenameRef: { current: PendingCreatedTreeRename | null } = { current: null }
    closeSidebarSearchMode()
    mutateState((previous) => {
      const parentFolderId = targetParentFolderId === undefined
        ? selectedFolderId && findNotebookFolder(previous.notebook.items, selectedFolderId)
          ? selectedFolderId
          : getContainingFolderId(previous.notebook.items, previous.notebook.activeNoteId)
        : targetParentFolderId && findNotebookFolder(previous.notebook.items, targetParentFolderId)
          ? targetParentFolderId
          : null
      const result = createNotebookNoteInState(previous, 'Untitled', parentFolderId, '', undefined, targetIndex)
      createdRenameRef.current = {
        kind: 'note',
        itemId: result.noteId,
        noteBodyId: result.noteBodyId,
        aisleId: result.aisleId,
      }
      return {
        ...result.state,
        ui: revealNotebookTreeForCreatedItem(result.state.ui, [parentFolderId]),
      }
    })
    const createdRename = createdRenameRef.current
    if (createdRename) {
      beginCreatedTreeRename(createdRename, 'Untitled')
      if (createdRename.kind === 'note') setActiveAisleId(createdRename.aisleId)
    }
    setSelectedFolderId('')
    setSelectedTreeNoteIds([])
    setTreeSelectionAnchorNoteId('')
    setViewMode('main')
  }, [beginCreatedTreeRename, closeSidebarSearchMode, mutateState, selectedFolderId])

  const createNote = useCallback(() => createNoteAt(), [createNoteAt])

  const createFolderAt = useCallback((targetParentFolderId?: string | null, targetIndex?: number) => {
    const createdRenameRef: { current: PendingCreatedTreeRename | null } = { current: null }
    const returnNoteBodyId = activeModel?.noteBody.id ?? ''
    const returnAisleId = renderedActiveAisleId
    closeSidebarSearchMode()
    mutateState((previous) => {
      const parentFolderId = targetParentFolderId === undefined
        ? selectedFolderId && findNotebookFolder(previous.notebook.items, selectedFolderId)
          ? selectedFolderId
          : getContainingFolderId(previous.notebook.items, previous.notebook.activeNoteId)
        : targetParentFolderId && findNotebookFolder(previous.notebook.items, targetParentFolderId)
          ? targetParentFolderId
          : null
      const result = createNotebookFolderInState(previous, 'Untitled folder', parentFolderId, undefined, targetIndex)
      createdRenameRef.current = {
        kind: 'folder',
        itemId: result.folderId,
        returnNoteBodyId,
        returnAisleId,
      }
      return {
        ...result.state,
        ui: revealNotebookTreeForCreatedItem(result.state.ui, [parentFolderId, result.folderId]),
      }
    })
    const createdRename = createdRenameRef.current
    if (createdRename) {
      beginCreatedTreeRename(createdRename, 'Untitled folder')
      setSelectedFolderId(createdRename.itemId)
    }
    setSelectedTreeNoteIds([])
    setTreeSelectionAnchorNoteId('')
    setViewMode('main')
  }, [activeModel?.noteBody.id, beginCreatedTreeRename, closeSidebarSearchMode, mutateState, renderedActiveAisleId, selectedFolderId])

  const createFolder = useCallback(() => createFolderAt(), [createFolderAt])

  const importNotebook = useCallback(() => {
    if (!window.electronAPI?.openNotebookImportSource) {
      window.alert('Notebook import is only available in the desktop app.')
      return
    }
    void window.electronAPI.openNotebookImportSource().then(async (result) => {
      if (result.canceled) return
      if (!result.ok) {
        window.alert(result.error || 'Notebook import failed.')
        return
      }
      if (result.kind === 'notebook-folder' || result.kind === 'notebook-zip') {
        setState(parseSavedState(result.serializedState))
        setViewMode('main')
        return
      }
      if (result.kind === 'markdown-folder' || result.kind === 'markdown-zip') {
        try {
          const imported = await importMarkdownNotebook(result.files, {
            assetRoots: result.assetRoots,
            assets: result.kind === 'markdown-zip' ? result.assets : undefined,
            readAsset: result.kind === 'markdown-folder' && window.electronAPI?.readFolderImportAsset
              ? (payload) => window.electronAPI!.readFolderImportAsset!({ sourceId: result.sourceId, ...payload })
              : undefined,
          })
          setState(imported.state)
        } catch (error) {
          window.alert(error instanceof Error ? error.message : 'Markdown import failed.')
          return
        }
        setViewMode('main')
        return
      }
      window.alert('Selected file is not a Tabs notebook or Markdown import source.')
    })
  }, [setState])

  const exportNotebook = useCallback(() => {
    if (!window.electronAPI?.exportNotebookFolder) {
      window.alert('Notebook export is only available in the desktop app.')
      return
    }
    void window.electronAPI.exportNotebookFolder({ serializedState: JSON.stringify(state) }).then((result) => {
      if (result.canceled || result.ok) return
      window.alert(result.error || 'Notebook export failed.')
    })
  }, [state])

  const renameItem = useCallback(
    (itemId: string, title: string) => {
      mutateState((previous) => ({
        ...previous,
        notebook: renameNotebookItem(previous.notebook, itemId, title),
      }))
    },
    [mutateState],
  )

  const startTreeRename = useCallback((itemId: string, title: string) => {
    skipNextTreeRenameCommitRef.current = false
    skipTreeRenameBlurItemIdRef.current = ''
    setRenamingTreeItemId(itemId)
    setTreeRenameDraft(title)
  }, [])

  const commitTreeRename = useCallback((source: NotebookTreeRenameCommitSource) => {
    if (source === 'blur' && skipTreeRenameBlurItemIdRef.current === renamingTreeItemId) {
      skipTreeRenameBlurItemIdRef.current = ''
      return
    }
    if (skipNextTreeRenameCommitRef.current) {
      skipNextTreeRenameCommitRef.current = false
      return
    }
    if (!renamingTreeItemId) return
    renameItem(renamingTreeItemId, treeRenameDraft)
    const pendingCreatedRename = finishCreatedTreeRename(renamingTreeItemId, source)
    if (source === 'tab' && pendingCreatedRename) {
      const entry = findNotebookItem(stateRef.current.notebook.items, pendingCreatedRename.itemId)
      skipTreeRenameBlurItemIdRef.current = renamingTreeItemId
      if (entry) {
        if (pendingCreatedRename.kind === 'note') {
          createNoteAt(entry.parentFolderId, entry.index + 1)
        } else {
          createFolderAt(entry.parentFolderId, entry.index + 1)
        }
        return
      }
    }
    if (source === 'enter') {
      skipTreeRenameBlurItemIdRef.current = renamingTreeItemId
    }
    setRenamingTreeItemId('')
    setTreeRenameDraft('')
  }, [createFolderAt, createNoteAt, finishCreatedTreeRename, renameItem, renamingTreeItemId, stateRef, treeRenameDraft])

  const cancelTreeRename = useCallback(() => {
    skipNextTreeRenameCommitRef.current = false
    skipTreeRenameBlurItemIdRef.current = renamingTreeItemId
    if (pendingCreatedTreeRenameRef.current?.itemId === renamingTreeItemId) {
      pendingCreatedTreeRenameRef.current = null
      pendingCreatedEditRef.current = null
    }
    setRenamingTreeItemId('')
    setTreeRenameDraft('')
  }, [renamingTreeItemId])

  const updateTreeDropTarget = useCallback((target: NotebookTreeDropTarget | null) => {
    setTreeDropTarget((current) => (areNotebookTreeDropTargetsEqual(current, target) ? current : target))
  }, [])

  const startTreeDrag = useCallback((itemId: string) => {
    setRenamingTreeItemId('')
    setTreeRenameDraft('')
    const entry = findNotebookItem(stateRef.current.notebook.items, itemId)
    const selectedNoteIds = selectedTreeNoteIds.includes(itemId)
      ? visibleTreeNoteIds.filter((noteId) => selectedTreeNoteIds.includes(noteId))
      : []
    const nextDraggingNoteIds = entry?.item.type === 'note'
      ? selectedNoteIds.length > 0
        ? selectedNoteIds
        : [itemId]
      : []
    if (entry?.item.type === 'note') {
      setSelectedTreeNoteIds(nextDraggingNoteIds)
      setTreeSelectionAnchorNoteId(itemId)
      setSelectedFolderId('')
    } else {
      setSelectedTreeNoteIds([])
      setTreeSelectionAnchorNoteId('')
    }
    setDraggingTreeItemId(itemId)
    setDraggingTreeNoteIds(nextDraggingNoteIds)
    setTreeDropTarget(null)
  }, [selectedTreeNoteIds, stateRef, visibleTreeNoteIds])

  const finishTreeDrag = useCallback(() => {
    setDraggingTreeItemId('')
    setDraggingTreeNoteIds([])
    setTreeDropTarget(null)
  }, [])

  const dropTreeItem = useCallback(
    (target: NotebookTreeDropTarget) => {
      const draggedItemId = draggingTreeItemId
      if (!draggedItemId) return
      const draggedNoteIds = draggingTreeNoteIds
      mutateState((previous) => {
        const notebook =
          draggedNoteIds.length > 0
            ? moveNotebookItems(previous.notebook, draggedNoteIds, target.parentFolderId, target.index)
            : moveNotebookItem(previous.notebook, draggedItemId, target.parentFolderId, target.index)
        if (notebook === previous.notebook) return previous
        return {
          ...previous,
          notebook,
          ui: target.parentFolderId
            ? {
                ...previous.ui,
                collapsedFolderIds: previous.ui.collapsedFolderIds.filter((folderId) => folderId !== target.parentFolderId),
              }
            : previous.ui,
        }
      })
      if (target.parentFolderId && draggedNoteIds.length === 0) setSelectedFolderId(target.parentFolderId)
      finishTreeDrag()
    },
    [draggingTreeItemId, draggingTreeNoteIds, finishTreeDrag, mutateState],
  )

  const getRootTreeDropTarget = useCallback(
    (): NotebookTreeDropTarget => ({
      parentFolderId: null,
      index: stateRef.current.notebook.items.length,
      targetItemId: null,
      position: 'root',
    }),
    [stateRef],
  )

  const handleRootTreeDragOver = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!draggingTreeItemId) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      updateTreeDropTarget(getRootTreeDropTarget())
    },
    [draggingTreeItemId, getRootTreeDropTarget, updateTreeDropTarget],
  )

  const handleRootTreeDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!draggingTreeItemId) return
      event.preventDefault()
      event.stopPropagation()
      dropTreeItem(getRootTreeDropTarget())
    },
    [draggingTreeItemId, dropTreeItem, getRootTreeDropTarget],
  )

  const openTreeContextMenu = useCallback(
    (menu: NotebookTreeContextMenuState) => {
      toolbarState.closeToolbarPopovers()
      setAisleContextMenu(null)
      setEditorContextMenu(null)
      setShortcutMenu(null)
      setTreeContextMenu(menu)
    },
    [toolbarState],
  )

  const deleteItem = useCallback(
    (itemId: string) => {
      mutateState((previous) => deleteNotebookItemInState(previous, itemId))
    },
    [mutateState],
  )

  const renameTreeContextItem = useCallback(() => {
    if (!treeContextMenu) return
    const entry = findNotebookItem(stateRef.current.notebook.items, treeContextMenu.itemId)
    startTreeRename(treeContextMenu.itemId, entry?.item.title ?? treeContextMenu.itemTitle)
  }, [startTreeRename, stateRef, treeContextMenu])

  const getTreeContextCreateTarget = useCallback((): { parentFolderId: string | null; index: number } | null => {
    if (!treeContextMenu) return null
    const entry = findNotebookItem(stateRef.current.notebook.items, treeContextMenu.itemId)
    if (!entry) return null
    if (entry.item.type === 'folder') {
      return {
        parentFolderId: entry.item.id,
        index: entry.item.children.length,
      }
    }
    return {
      parentFolderId: entry.parentFolderId,
      index: entry.index + 1,
    }
  }, [stateRef, treeContextMenu])

  const createTreeContextNote = useCallback(() => {
    const target = getTreeContextCreateTarget()
    if (!target) return
    createNoteAt(target.parentFolderId, target.index)
  }, [createNoteAt, getTreeContextCreateTarget])

  const createTreeContextFolder = useCallback(() => {
    const target = getTreeContextCreateTarget()
    if (!target) return
    createFolderAt(target.parentFolderId, target.index)
  }, [createFolderAt, getTreeContextCreateTarget])

  const deleteTreeContextItem = useCallback(() => {
    if (!treeContextMenu) return
    deleteItem(treeContextMenu.itemId)
  }, [deleteItem, treeContextMenu])

  const revealTreeContextItem = useCallback(() => {
    if (!treeContextMenu) return
    const revealNotebookItemLocation = window.electronAPI?.revealNotebookItemLocation
    if (typeof revealNotebookItemLocation !== 'function') {
      window.alert('Could not reveal notebook item.')
      return
    }
    const payload = {
      itemId: treeContextMenu.itemId,
      itemType: treeContextMenu.itemType,
    }
    const latest = getLatestNotebookStateFromMountedEditors()
    void Promise.resolve(commitAppStateNow(latest.state, {
      preferSync: true,
      flushQueue: true,
      trigger: 'notebook-sidebar-reveal-item',
      pendingEditorCount: latest.pendingEditorCount,
    }))
      .then(() => revealNotebookItemLocation(payload))
      .then((result) => {
        if (result.ok) return
        window.alert(result.error || 'Could not reveal notebook item.')
      })
      .catch(() => window.alert('Could not reveal notebook item.'))
  }, [commitAppStateNow, getLatestNotebookStateFromMountedEditors, treeContextMenu])

  const restoreDeletedItem = useCallback(
    (deletedItemId: string) => {
      setExpandedTrashItemId((previous) => (previous === deletedItemId ? '' : previous))
      mutateState((previous) => restoreDeletedNotebookItemInState(previous, deletedItemId))
      setViewMode('main')
    },
    [mutateState],
  )

  const permanentlyDeleteDeletedItem = useCallback(
    (deletedItemId: string) => {
      if (!window.confirm('Permanently delete this item? This cannot be undone.')) {
        return
      }
      setExpandedTrashItemId((previous) => (previous === deletedItemId ? '' : previous))
      mutateState((previous) =>
        pruneUnreferencedBodies({
          ...previous,
          notebook: {
            ...previous.notebook,
            deletedItems: previous.notebook.deletedItems.filter((entry) => entry.id !== deletedItemId),
          },
        }),
      )
    },
    [mutateState],
  )

  const setActiveNote = useCallback(
    (noteId: string) => {
      applyNotebookNavigationLocation({ noteId, aisleId: '' })
    },
    [applyNotebookNavigationLocation],
  )

  const selectSidebarTreeNote = useCallback(
    (noteId: string, mode: NotebookTreeNoteSelectionMode) => {
      setSelectedFolderId('')
      if (mode === 'range') {
        const requestedAnchorNoteId =
          treeSelectionAnchorNoteId || selectedTreeNoteIds[0] || state.notebook.activeNoteId || noteId
        const anchorNoteId = visibleTreeNoteIds.includes(requestedAnchorNoteId) ? requestedAnchorNoteId : noteId
        setSelectedTreeNoteIds(getNotebookTreeRangeNoteIds(visibleTreeNoteIds, anchorNoteId, noteId))
        setTreeSelectionAnchorNoteId(anchorNoteId)
        return
      }

      if (mode === 'toggle') {
        setSelectedTreeNoteIds((current) =>
          current.includes(noteId)
            ? current.filter((selectedNoteId) => selectedNoteId !== noteId)
            : [...current, noteId],
        )
        setTreeSelectionAnchorNoteId(noteId)
        return
      }

      setSelectedTreeNoteIds([noteId])
      setTreeSelectionAnchorNoteId(noteId)
      setActiveNote(noteId)
    },
    [selectedTreeNoteIds, setActiveNote, state.notebook.activeNoteId, treeSelectionAnchorNoteId, visibleTreeNoteIds],
  )

  const selectSidebarTreeFolder = useCallback((folderId: string) => {
    setSelectedTreeNoteIds([])
    setTreeSelectionAnchorNoteId('')
    setSelectedFolderId(folderId)
  }, [])

  const activateSidebarSearchKey = useCallback(
    (kind: SidebarSearchFilterKind, key: string) => {
      if (!key) return
      setSidebarSearchMode(true)
      mutateState((previous) => ({
        ...previous,
        ui: {
          ...previous.ui,
          sidebarCollapsed: false,
          noteFilter: addSidebarSearchFilterKey(previous.ui.noteFilter, kind, key),
        },
      }))
    },
    [mutateState],
  )

  const activateSidebarSearchTokens = useCallback(
    (tokens: SidebarSearchToken[]) => {
      if (tokens.length <= 0) return
      setSidebarSearchMode(true)
      mutateState((previous) => ({
        ...previous,
        ui: {
          ...previous.ui,
          sidebarCollapsed: false,
          noteFilter: addSidebarSearchFilterTokens(previous.ui.noteFilter, tokens),
        },
      }))
    },
    [mutateState],
  )

  const updateSidebarSearchQuery = useCallback(
    (nextQuery: string) => {
      const parsed = parseSidebarSearchInput(nextQuery, sidebarSearchIndexes)
      if (parsed.tokens.length > 0) {
        activateSidebarSearchTokens(parsed.tokens)
        setQuery(parsed.text)
        return
      }
      setQuery(nextQuery)
    },
    [activateSidebarSearchTokens, sidebarSearchIndexes],
  )

  const selectSidebarSearchSuggestion = useCallback(
    (suggestion: SidebarSearchSuggestion) => {
      activateSidebarSearchTokens([suggestion])
      setQuery((current) => clearActiveSidebarSearchPrefix(current))
      window.setTimeout(() => searchInputRef.current?.focus(), 0)
    },
    [activateSidebarSearchTokens],
  )

  const removeSidebarSearchToken = useCallback(
    (token: SidebarSearchToken) => {
      mutateState((previous) => ({
        ...previous,
        ui: {
          ...previous.ui,
          noteFilter: removeSidebarSearchFilterToken(previous.ui.noteFilter, token),
        },
      }))
    },
    [mutateState],
  )

  const openSidebarSearchResult = useCallback(
    (result: SidebarSearchResult) => {
      applyNotebookNavigationLocation({ noteId: result.noteId, aisleId: result.aisleId })
    },
    [applyNotebookNavigationLocation],
  )

  const toggleNotesTrashFromShortcut = useCallback(() => {
    setViewMode((previous) => (previous === 'trash' ? 'main' : 'trash'))
  }, [])

  const focusNotesFilterFromShortcut = useCallback(() => {
    pendingFindReplaceRevealRef.current = null
    setFindReplaceOpen(false)
    toolbarState.closeToolbarPopovers()
    setAisleContextMenu(null)
    setEditorContextMenu(null)
    setTreeContextMenu(null)
    setShortcutMenu(null)
    setNoteActionPicker(null)
    setLinkPrompt(CLOSED_LINK_PROMPT_STATE)
    setViewMode('main')
    setSidebarSearchMode(true)
    mutateState((previous) => ({
      ...previous,
      ui: {
        ...previous.ui,
        sidebarCollapsed: false,
      },
    }))
    window.setTimeout(() => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    }, 0)
  }, [mutateState, toolbarState])

  const toggleSidebarSearchModeFromButton = useCallback(() => {
    if (sidebarSearchVisible) {
      closeSidebarSearchMode()
      return
    }
    focusNotesFilterFromShortcut()
  }, [closeSidebarSearchMode, focusNotesFilterFromShortcut, sidebarSearchVisible])

  const toggleFolder = useCallback(
    (folderId: string) => {
      mutateState((previous) => {
        const collapsed = new Set(previous.ui.collapsedFolderIds)
        if (collapsed.has(folderId)) collapsed.delete(folderId)
        else collapsed.add(folderId)
        return {
          ...previous,
          ui: {
            ...previous.ui,
            collapsedFolderIds: Array.from(collapsed),
          },
        }
      })
    },
    [mutateState],
  )

  const addAisle = useCallback(
    (side: 'left' | 'right' | 'end', nearAisleId?: string, markdown = '') => {
      if (!activeModel) return
      let createdAisleId = ''
      mutateState((previous) => {
        const notePath = findNotebookNote(previous.notebook.items, activeModel.noteId)
        const body = notePath ? previous.noteBodies.find((candidate) => candidate.id === notePath.note.noteBodyId) : null
        if (!body) return previous
        const idGenerator = createReservedIdAllocator(collectNotebookIds(previous))
        const { aisle, body: aisleBody } = createNewAisleBody(idGenerator, markdown)
        createdAisleId = aisle.id
        const activeIndex = body.aisles.findIndex((candidate) => candidate.id === nearAisleId)
        const insertIndex =
          side === 'end'
            ? body.aisles.length
            : side === 'left'
              ? Math.max(0, activeIndex)
              : Math.max(0, activeIndex + 1)
        return {
          ...previous,
          noteBodies: previous.noteBodies.map((candidate) =>
            candidate.id === body.id
              ? {
                  ...candidate,
                  updatedAt: new Date().toISOString(),
                  aisles: [
                    ...candidate.aisles.slice(0, insertIndex),
                    aisle,
                    ...candidate.aisles.slice(insertIndex),
                  ],
                }
              : candidate,
          ),
          noteAisleBodies: [...(previous.noteAisleBodies ?? []), aisleBody],
        }
      })
      if (!createdAisleId) return
      pendingFocusToAisleIdRef.current = createdAisleId
      pendingScrollToAisleIdRef.current = createdAisleId
      pendingNavigationTopAisleIdRef.current = null
      pendingCursorRestoreRef.current = {
        noteLocationKey: activeNoteLocationKey,
        aisleId: createdAisleId,
        selection: null,
        focus: true,
        focusIntent: 'aisle-activation',
      }
      setActiveAisleId(createdAisleId)
    },
    [activeModel, activeNoteLocationKey, mutateState, pendingCursorRestoreRef],
  )
  addAisleFromNewlineRef.current = addAisle

  const cycleActiveAisle = useCallback(
    (direction: -1 | 1) => {
      if (!activeModel || activeModel.resolved.aisles.length === 0) return
      const currentIndex = activeModel.resolved.aisles.findIndex((aisle) => aisle.id === renderedActiveAisleId)
      const safeCurrentIndex = currentIndex >= 0 ? currentIndex : 0
      const nextIndex = (safeCurrentIndex + direction + activeModel.resolved.aisles.length) % activeModel.resolved.aisles.length
      const nextAisle = activeModel.resolved.aisles[nextIndex]
      if (!nextAisle) return
      setActiveAisleId(nextAisle.id)
      window.setTimeout(() => {
        notebookEditors.activateAisleEditor(buildAisleEditorKey(activeModel.noteBody.id, nextAisle.id), { focus: true })
      }, 0)
    },
    [activeModel, notebookEditors, renderedActiveAisleId],
  )

  const runShortcutMenuOperation = useCallback(
    (operation: NewlineOperationId) => {
      const aisleId = shortcutMenu?.aisleId || renderedActiveAisleId
      setShortcutMenu(null)
      if (!aisleId) return
      if (operation === 'tableOfContents') {
        openTableOfContentsForAisleRef.current?.(aisleId)
        return
      }
      notebookEditors.runNewlineOperation(operation, aisleId)
    },
    [notebookEditors, renderedActiveAisleId, shortcutMenu?.aisleId],
  )

  useNotebookHotkeys({
    hotkeys: state.hotkeys,
    isMacPlatform,
    viewMode,
    actions: {
      openSettings: () => openUtilityView('settings'),
      newNote: createNote,
      newFolder: createFolder,
      toggleNotesTrash: toggleNotesTrashFromShortcut,
      toggleNotesFilter: focusNotesFilterFromShortcut,
      cycleAislePrev: () => cycleActiveAisle(-1),
      cycleAisleNext: () => cycleActiveAisle(1),
      formatStrikethrough: () => {
        notebookEditors.runCommand('strike')
      },
      navigateHistoryBack: () => {
        navigateNotebookHistoryBy(-1)
      },
      navigateHistoryForward: () => {
        navigateNotebookHistoryBy(1)
      },
    },
  })

  const applySyncedFilter = useCallback(
    (key: string) => {
      if (!key) return
      activateSidebarSearchKey('synced', key)
      setAisleContextMenu(null)
      setEditorContextMenu(null)
      toolbarState.setCopyMenuOpen(false)
    },
    [activateSidebarSearchKey, toolbarState],
  )

  const filterSyncedAisle = useCallback(
    (aisleId = renderedActiveAisleId) => {
      if (!activeModel || !canDecoupleAisleById(aisleId)) return
      const aisle = activeModel.resolved.aisles.find((candidate) => candidate.id === aisleId)
      if (!aisle) return
      applySyncedFilter(getSyncedAisleFilterKey(aisle.aisleBodyId))
    },
    [activeModel, applySyncedFilter, canDecoupleAisleById, renderedActiveAisleId],
  )

  const filterTag = useCallback(
    (tag: string) => {
      const key = normalizeTagKey(tag)
      if (!key) return
      activateSidebarSearchKey('tags', key)
    },
    [activateSidebarSearchKey],
  )

  const filterAisleFrontmatterTemplate = useCallback(
    (aisleId = renderedActiveAisleId) => {
      if (!activeModel || !aisleId) return
      const aisle = activeModel.resolved.aisles.find((candidate) => candidate.id === aisleId)
      if (!aisle) return
      const body = getAisleBodyById(stateRef.current, aisle.aisleBodyId)
      const templateId = body?.frontmatterMeta?.templateId ?? ''
      if (!templateId || !body?.frontmatterMeta?.templateDerived) return
      activateSidebarSearchKey('frontmatter', getFrontmatterTemplateFilterKey(templateId))
    },
    [activeModel, activateSidebarSearchKey, renderedActiveAisleId, stateRef],
  )

  const decoupleAisle = useCallback(
    (aisleId: string) => {
      if (!activeModel || !canDecoupleAisleById(aisleId)) return
      const aisle = activeModel.resolved.aisles.find((candidate) => candidate.id === aisleId)
      if (!aisle) return
      const currentKey = buildAisleSlotKey(activeModel.noteBody.id, aisleId)
      let blockedMessage = ''
      mutateState((previous) => {
        const keepSlotKeys = new Set(
          listLinkedAisleSlotsForAisleBody(previous, aisle.aisleBodyId)
            .map((slot) => slot.key)
            .filter((key) => key !== currentKey),
        )
        const result = decoupleAisleSlotsInState(previous, aisle.aisleBodyId, keepSlotKeys, true)
        if (result.status === 'blocked') {
          blockedMessage = result.message
          return previous
        }
        return result.state
      })
      if (blockedMessage) window.alert(blockedMessage)
    },
    [activeModel, canDecoupleAisleById, mutateState],
  )

  const updateNoteActionPickerQuery = useCallback((nextQuery: string) => {
    setNoteActionPicker((current) => (current ? { ...current, query: nextQuery } : current))
  }, [])

  const closeNoteActionPicker = useCallback(() => {
    setNoteActionPicker((current) => {
      if (current?.source === 'mention' && current.mentionRange) {
        dismissedMentionStartRef.current = current.mentionRange.from
      }
      return null
    })
  }, [])

  const updateLinkPromptUrl = useCallback((url: string) => {
    setLinkPrompt((current) => ({ ...current, url }))
  }, [])

  const updateLinkPromptText = useCallback((text: string) => {
    setLinkPrompt((current) => ({ ...current, text }))
  }, [])

  const insertNamedLink = useCallback(() => {
    if (notebookEditors.insertNamedUrlLink(linkPrompt.url, linkPrompt.text, linkPrompt.editRange)) closeLinkPrompt()
  }, [closeLinkPrompt, linkPrompt.editRange, linkPrompt.text, linkPrompt.url, notebookEditors])

  const openPromptLinkUrl = useCallback(() => {
    const url = linkPrompt.url.trim()
    if (!url) return
    openExternalWebUrl(url)
  }, [linkPrompt.url])

  const openToolbarLinkPicker = useCallback(() => {
    notebookEditors.openUrlLinkPrompt()
  }, [notebookEditors])

  const openContextNoteReferencePicker = useCallback(
    (kind: 'note-link' | 'note-preview') => {
      toolbarState.closeToolbarPopovers()
      setEditorContextMenu(null)
      setAisleContextMenu(null)
      setShortcutMenu(null)
      setLinkPrompt(CLOSED_LINK_PROMPT_STATE)
      setNoteActionPicker({
        source: kind === 'note-link' ? 'context-note-link' : 'context-note-preview',
        title: kind === 'note-link' ? 'Insert note link' : 'Insert note preview',
        query: '',
        actions: [kind],
      })
    },
    [toolbarState],
  )

  const openNoteLinkFromLinkPrompt = useCallback(() => {
    toolbarState.closeToolbarPopovers()
    setEditorContextMenu(null)
    setAisleContextMenu(null)
    setShortcutMenu(null)
    setLinkPrompt(CLOSED_LINK_PROMPT_STATE)
    setNoteActionPicker({
      source: 'toolbar-link',
      title: 'Insert note reference',
      query: '',
      actions: ['note-link', 'note-preview'],
      insertRange: linkPrompt.editRange ?? null,
    })
  }, [linkPrompt.editRange, toolbarState])

  const openWholeNoteCopyPicker = useCallback(() => {
    toolbarState.closeToolbarPopovers()
    setEditorContextMenu(null)
    setAisleContextMenu(null)
    setShortcutMenu(null)
    setNoteActionPicker({
      source: 'whole-note-copy',
      title: 'Make this a copy of',
      query: '',
      actions: ['independent-copy', 'synced-copy'],
    })
  }, [toolbarState])

  const copyNotebookStructureAs = useCallback(
    (kind: NotebookEditorCopyAsKind, mode: NotebookEditorCopyAsMode, aisleId: string) => {
      const currentState = stateRef.current
      const result = buildNotebookStructureClipboardPayload(currentState, {
        activeNoteId: currentState.notebook.activeNoteId,
        kind,
        mode,
        aisleId,
      })
      if (result.status === 'blocked') {
        window.alert(result.message)
        return
      }
      void writeNotebookStructureClipboardPayload(result.payload, result.markdown)
        .then((ok) => {
          if (!ok) window.alert('Clipboard copy is unavailable here.')
        })
        .catch(() => window.alert('Clipboard copy is unavailable here.'))
    },
    [stateRef],
  )

  const pasteNotebookStructureClipboard = useCallback(
    async (aisleId: string) => {
      const payload = await readNotebookStructureClipboardPayloadFromNavigator()
      return payload ? applyNotebookStructureClipboardPaste(payload, aisleId) : false
    },
    [applyNotebookStructureClipboardPaste],
  )

  const insertNotebookNoteReference = useCallback(
    (target: NoteLocation, kind: 'note-link' | 'note-preview', options: NotebookNoteActionPickerActionOptions = {}) => {
      const token = buildNotebookNoteReferenceInsertionText(stateRef.current, target, kind, options)
      const currentPicker = noteActionPicker
      if (currentPicker?.source === 'mention' && currentPicker.mentionRange) {
        notebookEditors.replaceActiveEditorRangeWithText(currentPicker.mentionRange.from, currentPicker.mentionRange.to, token)
      } else if (currentPicker?.insertRange) {
        notebookEditors.replaceActiveEditorRangeWithText(currentPicker.insertRange.from, currentPicker.insertRange.to, token)
      } else {
        notebookEditors.insertTextAtSelection(token)
      }
      closeNoteActionPicker()
    },
    [closeNoteActionPicker, noteActionPicker, notebookEditors, stateRef],
  )

  const applyNotebookNoteCopyAction = useCallback(
    (targetNoteId: string, mode: 'independent' | 'synced') => {
      const source = noteActionPicker?.source
      let nextActiveAisleId = ''
      let blockedMessage = ''
      mutateState((previous) => {
        const result = source === 'whole-note-copy'
          ? replaceActiveNoteBodyFromTargetNote(previous, {
              activeNoteId: previous.notebook.activeNoteId,
              targetNoteId,
              mode,
            })
          : replaceFocusedAisleFromTargetNote(previous, {
              activeNoteId: previous.notebook.activeNoteId,
              focusedAisleId: renderedActiveAisleId,
              targetNoteId,
              mode,
            })
        if (result.status === 'blocked') {
          blockedMessage = result.message
          return previous
        }
        nextActiveAisleId = result.activeAisleId ?? ''
        return pruneUnreferencedBodies(result.state)
      })
      if (blockedMessage) {
        window.alert(blockedMessage)
        return
      }
      if (nextActiveAisleId) setActiveAisleId(nextActiveAisleId)
      closeNoteActionPicker()
    },
    [closeNoteActionPicker, mutateState, noteActionPicker?.source, renderedActiveAisleId],
  )

  const handleNoteActionPickerAction = useCallback(
    (action: NotebookNoteActionPickerAction, noteId: string, options: NotebookNoteActionPickerActionOptions = {}) => {
      const referenceKind = getReferenceKindForNoteAction(action)
      if (referenceKind) {
        insertNotebookNoteReference({ noteId }, referenceKind, options)
        return
      }
      const copyMode = getCopyModeForNoteAction(action)
      if (copyMode) applyNotebookNoteCopyAction(noteId, copyMode)
    },
    [applyNotebookNoteCopyAction, insertNotebookNoteReference],
  )

  const submitUrlLink = useCallback(
    (url: string) => {
      if (notebookEditors.insertUrlLink(url)) closeNoteActionPicker()
    },
    [closeNoteActionPicker, notebookEditors],
  )

  const openDecoupleAisleDialog = useCallback(
    (aisleId: string) => {
      if (!activeModel || !canDecoupleAisleById(aisleId)) return
      const aisle = activeModel.resolved.aisles.find((candidate) => candidate.id === aisleId)
      if (!aisle) return
      const latestState = stateRef.current
      const currentKey = buildAisleSlotKey(activeModel.noteBody.id, aisleId)
      const slots = listLinkedAisleSlotsForAisleBody(latestState, aisle.aisleBodyId)
      toolbarState.closeToolbarPopovers()
      setDecoupleDialog({
        kind: 'aisle',
        aisleId,
        aisleBodyId: aisle.aisleBodyId,
        currentKey,
        keepKeys: slots.map((slot) => slot.key),
        keepData: latestState.ui.decoupledItemsKeepData ?? true,
      })
    },
    [activeModel, canDecoupleAisleById, stateRef, toolbarState],
  )

  const decoupleDialogRows = useMemo(() => {
    if (!decoupleDialog) return []
    return getNotebookAisleDecoupleRows(state, decoupleDialog.aisleBodyId)
  }, [decoupleDialog, state])

  const toggleDecoupleDialogKeepKey = useCallback((key: string) => {
    setDecoupleDialog((current) => {
      if (!current) return current
      const keepKeys = current.keepKeys.includes(key)
        ? current.keepKeys.filter((candidate) => candidate !== key)
        : [...current.keepKeys, key]
      return { ...current, keepKeys, error: undefined }
    })
  }, [])

  const updateDecoupleDialogKeepData = useCallback((keepData: boolean) => {
    setDecoupleDialog((current) => (current ? { ...current, keepData, error: undefined } : current))
  }, [])

  const applyDecoupleDialog = useCallback(() => {
    if (!decoupleDialog) return
    let blockedMessage = ''
    mutateState((previous) => {
      const keepKeys = new Set(decoupleDialog.keepKeys)
      const result = decoupleAisleSlotsInState(previous, decoupleDialog.aisleBodyId, keepKeys, decoupleDialog.keepData)
      if (result.status === 'blocked') {
        blockedMessage = result.message
        return previous
      }
      return {
        ...result.state,
        ui: {
          ...result.state.ui,
          decoupledItemsKeepData: decoupleDialog.keepData,
        },
      }
    })
    if (blockedMessage) {
      setDecoupleDialog((current) => (current ? { ...current, error: blockedMessage } : current))
      return
    }
    setDecoupleDialog(null)
  }, [decoupleDialog, mutateState])

  const applyAisleEditDraftToActiveNote = useCallback(
    (
      draftAisles: ResolvedNoteAisle[],
      options: { decoupleAisleIds?: string[]; removeFrontmatterAisleIds?: string[]; activeAisleId?: string } = {},
    ) => {
      if (!activeModel || draftAisles.length === 0) return
      if (editorRef.current) notebookEditors.commitActiveEditorMarkdownNow(editorRef.current)

      mutateState((previous) => {
        const body = previous.noteBodies.find((candidate) => candidate.id === activeModel.noteBody.id)
        if (!body) return previous
        const timestamp = new Date().toISOString()
        const idGenerator = createReservedIdAllocator(collectNotebookIds(previous))
        const decoupleAisleIds = new Set(options.decoupleAisleIds ?? [])
        const removeFrontmatterAisleIds = new Set(options.removeFrontmatterAisleIds ?? [])
        const sourceAislesById = new Map(body.aisles.map((aisle) => [aisle.id, aisle]))
        const sourceBodiesById = new Map((previous.noteAisleBodies ?? []).map((aisleBody) => [aisleBody.id, aisleBody]))
        const addedAisleBodies: NoteAisleBody[] = []
        const nextAisles: NoteAisle[] = draftAisles.map((draftAisle) => {
          const sourceAisle = sourceAislesById.get(draftAisle.id)
          const sourceAisleBodyId = sourceAisle?.aisleBodyId ?? draftAisle.aisleBodyId
          const aisleBodyId = decoupleAisleIds.has(draftAisle.id) ? idGenerator() : sourceAisleBodyId || idGenerator()
          if (!sourceBodiesById.has(aisleBodyId) && !addedAisleBodies.some((candidate) => candidate.id === aisleBodyId)) {
            const sourceBody = sourceBodiesById.get(sourceAisleBodyId)
            addedAisleBodies.push(cloneAisleBodyForDraft(sourceBody, aisleBodyId, draftAisle.markdown, timestamp))
          }
          return {
            id: draftAisle.id || idGenerator(),
            aisleBodyId,
          }
        })

        let nextState: AppState = {
          ...previous,
          noteAisleBodies: [...(previous.noteAisleBodies ?? []), ...addedAisleBodies],
        }
        nextState = syncNoteBodyAisleStructureInState(nextState, body.id, nextAisles)
        draftAisles.forEach((draftAisle, index) => {
          const aisleBodyId = nextAisles[index]?.aisleBodyId
          if (aisleBodyId) nextState = syncNoteAisleBodyMarkdownInState(nextState, aisleBodyId, draftAisle.markdown)
        })
        nextAisles.forEach((aisle) => {
          if (removeFrontmatterAisleIds.has(aisle.id)) {
            nextState = clearAisleFrontmatterInState(nextState, aisle.aisleBodyId)
          }
        })
        return pruneUnreferencedBodies(nextState)
      })

      setAisleEditModalOpen(false)
      setActiveAisleId(options.activeAisleId ?? draftAisles[0]?.id ?? '')
    },
    [activeModel, mutateState, notebookEditors],
  )

  const buildFrontmatterModalForAisle = useCallback(
    (sourceState: AppState, model: ActiveNoteModel, aisleId: string): NotebookFrontmatterModalState | string | null => {
      const aisle = model.noteBody.aisles.find((candidate) => candidate.id === aisleId)
      if (!aisle) return null
      const body = getAisleBodyById(sourceState, aisle.aisleBodyId)
      if (body?.frontmatterStatus === 'invalid') {
        return 'Frontmatter YAML is invalid. Fix the markdown block before using the structured frontmatter editor.'
      }
      const location: NoteLocation = { noteId: model.noteId }
      const draft = buildFrontmatterModalDraftForAisle(sourceState, model.noteBody.id, aisle.aisleBodyId, location)
      return {
        noteBodyId: model.noteBody.id,
        aisleId,
        aisleBodyId: aisle.aisleBodyId,
        location,
        aisles: model.noteBody.aisles.map((candidate, index) => ({
          id: candidate.id,
          aisleBodyId: candidate.aisleBodyId,
          label: `aisle ${index + 1}`,
        })),
        ...draft,
      }
    },
    [],
  )

  const openFrontmatterModalForAisle = useCallback(
    (aisleId = renderedActiveAisleId) => {
      if (!activeModel || !aisleId) return
      const modal = buildFrontmatterModalForAisle(state, activeModel, aisleId)
      if (typeof modal === 'string') {
        window.alert(modal)
        return
      }
      setFrontmatterModal(modal)
    },
    [activeModel, buildFrontmatterModalForAisle, renderedActiveAisleId, state],
  )

  const selectFrontmatterAisle = useCallback(
    (modal: NotebookFrontmatterModalState, aisleId: string): NotebookFrontmatterModalState | string | null => {
      if (!activeModel) return null
      return buildFrontmatterModalForAisle(state, activeModel, aisleId) ?? modal
    },
    [activeModel, buildFrontmatterModalForAisle, state],
  )

  const selectFrontmatterTemplate = useCallback(
    (modal: NotebookFrontmatterModalState, templateId: string): NotebookFrontmatterModalState => {
      const template = state.frontmatter.templates.find((candidate) => candidate.id === templateId) ?? null
      if (!template) {
        return {
          ...modal,
          selectedTemplateId: '',
          templateDerived: false,
          isTemplateSuggestionDraft: false,
          rows: makeFrontmatterRowsManual(modal.rows),
        }
      }
      return {
        ...modal,
        selectedTemplateId: template.id,
        templateDerived: true,
        isTemplateSuggestionDraft: modal.isTemplateSuggestionDraft,
        rows: buildFrontmatterRowsForAisle(state, modal.noteBodyId, modal.aisleBodyId, modal.location, template, {
          includeExisting: false,
          derived: true,
        }),
      }
    },
    [state],
  )

  const toggleFrontmatterTemplateDerived = useCallback(
    (modal: NotebookFrontmatterModalState, templateDerived: boolean): NotebookFrontmatterModalState => {
      const template = state.frontmatter.templates.find((candidate) => candidate.id === modal.selectedTemplateId) ?? null
      if (!template) return modal
      if (!templateDerived) {
        return {
          ...modal,
          templateDerived: false,
          rows: makeFrontmatterRowsManual(modal.rows),
        }
      }
      return {
        ...modal,
        templateDerived: true,
        rows: buildFrontmatterRowsForAisle(state, modal.noteBodyId, modal.aisleBodyId, modal.location, template, {
          includeExisting: true,
          derived: true,
        }),
      }
    },
    [state],
  )

  const editFrontmatterTemplateFromModal = useCallback(
    (templateId: string) => {
      if (!templateId) return
      setFrontmatterDraft((frontmatter) => ({
        ...frontmatter,
        settingsTemplateId: templateId,
      }))
      setSettingsSection('frontmatter')
      openUtilityView('settings')
      setFrontmatterModal(null)
    },
    [openUtilityView, setSettingsSection],
  )

  const filterFrontmatterTemplateFromModal = useCallback(
    (modal: NotebookFrontmatterModalState) => {
      setFrontmatterModal(null)
      filterAisleFrontmatterTemplate(modal.aisleId)
    },
    [filterAisleFrontmatterTemplate],
  )

  const saveFrontmatter = useCallback(
    (modal: NotebookFrontmatterModalState) => {
      const computedRepair = disableInvalidComputedFrontmatterRows(modal.rows)
      if (computedRepair.warnings.length > 0) {
        setFrontmatterModal({
          ...modal,
          rows: computedRepair.rows,
        })
        return computedRepair.warnings
      }
      const result = buildFrontmatterDataFromRows(stateRef.current, modal.noteBodyId, modal.location, computedRepair.rows, {
        selectedTemplateId: modal.selectedTemplateId,
        templateDerived: modal.templateDerived,
        aisleBodyId: modal.aisleBodyId,
      })
      if (!result.ok) return result.message
      if (result.warnings.length > 0) return result.warnings
      mutateState((previous) =>
        updateAisleBodyFrontmatterInState(previous, modal.aisleBodyId, result.frontmatter, {
          templateId: modal.selectedTemplateId || null,
          templateDerived: modal.templateDerived,
          templateFieldOrigins: result.templateFieldOrigins,
          templateRemovedFieldIds: result.templateRemovedFieldIds,
          computedFields: result.computedFields,
        }),
      )
      setFrontmatterModal(null)
      return null
    },
    [mutateState, stateRef],
  )

  const openTableOfContents = useCallback((options: { scope?: TableOfContentsScope; focusedAisleId?: string } = {}) => {
    if (!activeModel) return
    const focusedAisleId = options.focusedAisleId ?? renderedActiveAisleId
    const panels = buildTableOfContentsPanels(
      activeModel.noteBody.id,
      activeModel.resolved.aisles,
      notebookEditors.getHeadingOutlineForAisle,
      {
        scope: options.scope ?? state.ui.tableOfContentsScope ?? 'all-aisles',
        focusedAisleId,
        getLinksForAisle: notebookEditors.getTableOfContentsLinksForAisle,
      },
    )
    if (!panels) {
      window.alert(TABLE_OF_CONTENTS_EMPTY_MESSAGE)
      return
    }
    setTableOfContentsPanels(panels)
  }, [activeModel, notebookEditors, renderedActiveAisleId, state.ui.tableOfContentsScope])

  const openFocusedTableOfContents = useCallback(
    (aisleId: string) => {
      if (!aisleId) return
      setActiveAisleId(aisleId)
      openTableOfContents({ scope: 'focused-aisle', focusedAisleId: aisleId })
    },
    [openTableOfContents],
  )
  openTableOfContentsForAisleRef.current = openFocusedTableOfContents

  const closeTableOfContentsAisle = useCallback((aisleId: string) => {
    setTableOfContentsPanels((current) => {
      if (!current) return current
      const openAisleIds = new Set(current.openAisleIds)
      openAisleIds.delete(aisleId)
      return openAisleIds.size > 0 ? { ...current, openAisleIds } : null
    })
  }, [])

  const selectTableOfContentsHeading = useCallback(
    (aisleId: string, headingKey: string) => {
      setActiveAisleId(aisleId)
      window.setTimeout(() => {
        notebookEditors.scrollToAisleHeading(aisleId, headingKey)
      }, 80)
    },
    [notebookEditors],
  )

  const selectTableOfContentsLink = useCallback(
    (aisleId: string, linkKey: string) => {
      setActiveAisleId(aisleId)
      window.setTimeout(() => {
        notebookEditors.scrollToAisleTableOfContentsLink(aisleId, linkKey)
      }, 80)
    },
    [notebookEditors],
  )

  const editorToolOverlaysVisible = viewMode === 'main' && !aisleEditModalOpen

  const imageToolsOverlay = (
    <>
      <ImageToolsOverlay
        visible={editorToolOverlaysVisible}
        imageTools={imageToolsController.imageTools}
        inlineCrop={imageToolsController.inlineCrop}
        onStartCrop={imageToolsController.startCrop}
        onOpenTransform={imageToolsController.openTransformMenu}
        onCopyImage={imageToolsController.copySelectedToClipboard}
        onReturnToStart={imageToolsController.returnToStartMenu}
        onTransformImage={imageToolsController.transformSelectedImage}
        onApplyCrop={imageToolsController.applyCrop}
        onCancelCrop={imageToolsController.cancelCrop}
        onSetCropRatio={imageToolsController.setCropRatio}
        onBeginResize={imageToolsController.beginResize}
        onBeginCropDrag={imageToolsController.beginCropMouseDrag}
      />
      <MediaToolsOverlay
        visible={editorToolOverlaysVisible}
        mediaTools={mediaToolsController.mediaTools}
        onOpenTransform={mediaToolsController.openTransformMenu}
        onReturnToStart={mediaToolsController.returnToStartMenu}
        onTransformMedia={mediaToolsController.transformSelectedMedia}
        onBeginResize={mediaToolsController.beginResize}
      />
    </>
  )

  const tableControlsOverlay = (
    <TableControlsOverlay
      visible={editorToolOverlaysVisible}
      tableControls={tableControlsController.tableControls}
      tableSelectionOverlay={tableControlsController.tableSelectionOverlay}
      onAddRow={() => tableControlsController.runTableControlOperation('add-row', state.ui.tableAddTargetMode)}
      onRemoveRow={() => tableControlsController.runTableControlOperation('remove-row', state.ui.tableDeleteTargetMode)}
      onAddColumn={() => tableControlsController.runTableControlOperation('add-column', state.ui.tableAddTargetMode)}
      onRemoveColumn={() => tableControlsController.runTableControlOperation('remove-column', state.ui.tableDeleteTargetMode)}
      onBeginSelectorGesture={tableControlsController.beginTableSelectorGesture}
    />
  )

  const listReorderControlsOverlay = (
    <ListReorderControlsOverlay
      visible={editorToolOverlaysVisible}
      listReorderControls={listReorderControlsController.listReorderControls}
      onBeginListHandleGesture={listReorderControlsController.beginListHandleGesture}
    />
  )

  const openCopyMenu = useCallback(() => {
    setAisleContextMenu(null)
    setEditorContextMenu(null)
    setTreeContextMenu(null)
    setShortcutMenu(null)
    toolbarState.setHeadingMenuOpen(false)
    toolbarState.setCopyMenuOpen((open) => !open)
    toolbarState.refreshToolbarPopoverPosition('copy')
  }, [toolbarState])

  const openHeadingMenu = useCallback(() => {
    setAisleContextMenu(null)
    setEditorContextMenu(null)
    setTreeContextMenu(null)
    setShortcutMenu(null)
    toolbarState.setCopyMenuOpen(false)
    toolbarState.setHeadingMenuOpen((open) => !open)
    toolbarState.refreshToolbarPopoverPosition('heading')
  }, [toolbarState])

  const openAisleContextMenuAt = useCallback(
    (aisleId: string, x: number, y: number) => {
      if (!canDecoupleAisleById(aisleId)) {
        setAisleContextMenu(null)
        setEditorContextMenu(null)
        setTreeContextMenu(null)
        setShortcutMenu(null)
        toolbarState.closeToolbarPopovers()
        return
      }
      setActiveAisleId(aisleId)
      toolbarState.closeToolbarPopovers()
      setEditorContextMenu(null)
      setTreeContextMenu(null)
      setShortcutMenu(null)
      setAisleContextMenu({ aisleId, x, y })
    },
    [canDecoupleAisleById, toolbarState],
  )

  const openEditorContextMenuAt = useCallback(
    (aisleId: string, x: number, y: number, options: { linkPrompt?: LinkPromptState | null } = {}) => {
      if (!activeModel) return
      setActiveAisleId(aisleId)
      notebookEditors.activateAisleEditor(buildAisleEditorKey(activeModel.noteBody.id, aisleId))
      toolbarState.closeToolbarPopovers()
      setAisleContextMenu(null)
      setTreeContextMenu(null)
      setShortcutMenu(null)
      setEditorContextMenu({ aisleId, x, y, linkPrompt: options.linkPrompt ?? null })
    },
    [activeModel, notebookEditors, toolbarState],
  )

  const openAisleActionMenu = useCallback(
    (aisleId: string) => {
      const pane = Array.from(workspaceRootRef.current?.querySelectorAll<HTMLElement>('.note-aisle-pane') ?? [])
        .find((candidate) => candidate.dataset.aisleId === aisleId)
      const rect = pane?.getBoundingClientRect()
      openAisleContextMenuAt(aisleId, rect ? Math.max(8, rect.right - 168) : 24, rect ? rect.top + 42 : 80)
    },
    [openAisleContextMenuAt],
  )

  const openNotebookEditorContextMenuFromPointer = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      const target = event.target instanceof Element
        ? event.target
        : typeof Text !== 'undefined' && event.target instanceof Text
          ? event.target.parentElement
          : null
      const aisleId = getNotebookEditorContextMenuAisleIdFromTarget(target)
      if (!aisleId) return
      event.preventDefault()
      const anchor = target?.closest<HTMLAnchorElement>('a[href]')
      const linkPrompt = anchor?.closest('.ProseMirror[contenteditable="true"]')
        ? notebookEditors.getLinkPromptAtClientPoint(aisleId, { clientX: event.clientX, clientY: event.clientY })
        : null
      openEditorContextMenuAt(aisleId, event.clientX, event.clientY, { linkPrompt })
    },
    [notebookEditors, openEditorContextMenuAt],
  )

  useEffect(() => {
    let canceled = false
    const getRuntimeInfo = window.electronAPI?.getRuntimeInfo
    if (!getRuntimeInfo) {
      return () => {
        canceled = true
      }
    }
    void getRuntimeInfo()
      .then((info) => {
        if (!canceled && typeof info?.version === 'string') setRuntimeVersion(info.version)
      })
      .catch(() => undefined)
    return () => {
      canceled = true
    }
  }, [])

  useEffect(() => {
    const closeFloatingUi = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null
      if (
        target?.closest('.tab-context-menu') ||
        target?.closest('.shortcut-menu') ||
        target?.closest('.note-toolbar-copy-popover') ||
        target?.closest('.note-toolbar-heading-popover') ||
        target?.closest('.note-shared-toolbar')
      ) {
        return
      }
      setAisleContextMenu(null)
      setEditorContextMenu(null)
      setTreeContextMenu(null)
      setShortcutMenu(null)
      toolbarState.closeToolbarPopovers()
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setAisleContextMenu(null)
      setEditorContextMenu(null)
      setTreeContextMenu(null)
      setShortcutMenu(null)
      toolbarState.closeToolbarPopovers()
    }
    document.addEventListener('pointerdown', closeFloatingUi)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeFloatingUi)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [toolbarState])

  useEffect(() => {
    setAisleContextMenu(null)
    setEditorContextMenu(null)
    setTreeContextMenu(null)
    setShortcutMenu(null)
  }, [activeModel?.noteId, viewMode])

  const runEditorContextClipboardAction = useCallback(
    (
      action: NotebookEditorClipboardAction,
      destination: NotebookEditorPasteDestination,
      aisleId: string,
    ) => {
      if (action === 'paste' && destination === 'here') {
        void pasteNotebookStructureClipboard(aisleId)
          .then((handled) => {
            if (!handled) notebookEditors.runClipboardAction(action)
          })
          .catch(() => notebookEditors.runClipboardAction(action))
        return
      }

      if (destination === 'here' || action === 'cut' || action === 'copy') {
        notebookEditors.runClipboardAction(action)
        return
      }

      void notebookEditors.readClipboardMarkdownForPaste(action)
        .then((result) => {
          if (!result) return
          addAisle(destination === 'new-aisle-left' ? 'left' : 'right', aisleId, result.markdown)
        })
        .catch(() => undefined)
    },
    [addAisle, notebookEditors, pasteNotebookStructureClipboard],
  )

  const insertEditorContextAisle = useCallback(
    (side: NotebookEditorAisleInsertSide, aisleId: string) => {
      addAisle(side, aisleId)
    },
    [addAisle],
  )

  const revealEditorContextLocation = useCallback(
    (aisleId: string) => {
      const noteId = stateRef.current.notebook.activeNoteId
      if (!noteId) {
        window.alert('Could not reveal note location.')
        return
      }
      const revealNoteLocation = window.electronAPI?.revealNoteLocation
      if (typeof revealNoteLocation !== 'function') {
        window.alert('Could not reveal note location.')
        return
      }
      const payload = {
        type: 'live-note' as const,
        location: { noteId },
        aisleId,
      }
      const latest = getLatestNotebookStateFromMountedEditors()
      void Promise.resolve(commitAppStateNow(latest.state, {
        preferSync: true,
        flushQueue: true,
        trigger: 'notebook-editor-reveal-location',
        pendingEditorCount: latest.pendingEditorCount,
      }))
        .then(() => revealNoteLocation(payload))
        .then((result) => {
          if (result.ok) return
          window.alert(result.error || 'Could not reveal note location.')
        })
        .catch(() => window.alert('Could not reveal note location.'))
    },
    [commitAppStateNow, getLatestNotebookStateFromMountedEditors, stateRef],
  )

  const startSidebarResize = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0 || state.ui.sidebarCollapsed) return
      event.preventDefault()
      event.stopPropagation()
      sidebarResizeRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startWidth: clampSidebarWidth(state.ui.sidebarWidth),
      }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [state.ui.sidebarCollapsed, state.ui.sidebarWidth],
  )

  const updateSidebarResize = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const drag = sidebarResizeRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      event.preventDefault()
      event.stopPropagation()
      const nextWidth = clampSidebarWidth(drag.startWidth + event.clientX - drag.startClientX)
      mutateState((previous) => ({
        ...previous,
        ui: {
          ...previous.ui,
          sidebarWidth: nextWidth,
        },
      }))
    },
    [mutateState],
  )

  const finishSidebarResize = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = sidebarResizeRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    sidebarResizeRef.current = null
    event.preventDefault()
    event.stopPropagation()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [])

  const toolbar = activeModel ? (
    <SharedEditorToolbar
      layout={toolbarLayout}
      copyButtonRef={toolbarState.copyToolbarButtonRef}
      headingButtonRef={toolbarState.headingToolbarButtonRef}
      aisleButtonRef={toolbarState.aisleToolbarButtonRef}
      toolbarFormatState={toolbarState.toolbarFormatState}
      activeHeadingLevel={toolbarState.activeHeadingLevel}
      toolbarShortcutFeedback={toolbarState.toolbarShortcutFeedback}
      onOpenCopy={openCopyMenu}
      onOpenFrontmatter={() => openFrontmatterModalForAisle()}
      onOpenTableOfContents={openTableOfContents}
      onOpenAisleEditModal={() => setAisleEditModalOpen(true)}
      onOpenFindReplace={focusNotesFilterFromShortcut}
      onToggleHeading={openHeadingMenu}
      onCommand={notebookEditors.runCommand}
      onHistory={(direction) => notebookEditors.runCommand(direction)}
      onInsertImage={notebookEditors.insertImageFile}
      onInsertWebLink={openToolbarLinkPicker}
      onClear={() => notebookEditors.runCommand('clear')}
    />
  ) : null

  const toolbarPopovers = activeModel ? (
    <EditorToolbarPopovers
      copyMenuOpen={toolbarState.copyMenuOpen}
      headingMenuOpen={toolbarState.headingMenuOpen}
      activeHeadingLevel={toolbarState.activeHeadingLevel}
      toolbarPopoverPosition={toolbarState.toolbarPopoverPosition}
      onExecuteToolbarCommand={(command, payload) => {
        notebookEditors.runCommand(command, payload)
        toolbarState.setHeadingMenuOpen(false)
      }}
      onOpenCopyModal={() => {
        openWholeNoteCopyPicker()
        toolbarState.setCopyMenuOpen(false)
      }}
      syncedItemKind={
        renderedActiveAisleId && canDecoupleAisleById(renderedActiveAisleId)
          ? 'aisle'
          : null
      }
      onFilterSyncedItem={() => {
        if (renderedActiveAisleId) filterSyncedAisle(renderedActiveAisleId)
        toolbarState.setCopyMenuOpen(false)
      }}
      onQuickDecoupleSyncedItem={() => {
        if (renderedActiveAisleId) decoupleAisle(renderedActiveAisleId)
        toolbarState.setCopyMenuOpen(false)
      }}
      onShowSyncedItems={() => {
        if (renderedActiveAisleId) openDecoupleAisleDialog(renderedActiveAisleId)
        toolbarState.setCopyMenuOpen(false)
      }}
    />
  ) : null

  const getNotebookSelector = useCallback((notebook: KnownNotebook) => ({
    notebookId: notebook.notebookId ?? undefined,
    notebookPath: notebook.notebookPath,
  }), [])

  const createNotebookFromSettings = useCallback(() => {
    const name = window.prompt('Notebook name')?.trim()
    if (!name) return
    void (async () => {
      const locationPath = await storageProfileController.chooseNotebookLocation()
      if (!locationPath) return
      await storageProfileController.createNotebook({
        name,
        locationPath,
      })
    })()
  }, [storageProfileController])

  const renameCurrentNotebookFromSettings = useCallback(() => {
    const currentName = storageProfileController.storageProfileStatus?.notebookName ?? ''
    const name = window.prompt('Notebook name', currentName)?.trim()
    if (!name || name === currentName) return
    void storageProfileController.renameNotebook(name)
  }, [storageProfileController])

  const switchNotebookFromSettings = useCallback((notebook: KnownNotebook) => {
    setOpenNotebookActionMenuKey('')
    if (!notebook.available || notebook.isActive) return
    void storageProfileController.switchNotebook(getNotebookSelector(notebook))
  }, [getNotebookSelector, storageProfileController])

  const forgetNotebookFromSettings = useCallback((notebook: KnownNotebook) => {
    setOpenNotebookActionMenuKey('')
    if (notebook.isActive) return
    const confirmed = window.confirm(`Remove "${notebook.notebookName}" from the notebook list? Files stay on disk.`)
    if (!confirmed) return
    void storageProfileController.forgetNotebook(getNotebookSelector(notebook))
  }, [getNotebookSelector, storageProfileController])

  const deleteNotebookFromSettings = useCallback((notebook?: KnownNotebook) => {
    setOpenNotebookActionMenuKey('')
    void storageProfileController.deleteNotebook(notebook ? getNotebookSelector(notebook) : undefined)
  }, [getNotebookSelector, storageProfileController])

  const runCurrentNotebookAction = useCallback((action: () => void) => {
    setOpenNotebookActionMenuKey('')
    action()
  }, [])

  const renderSegmentedTabs = <T extends string,>(
    label: string,
    tabs: Array<{ id: T; label: string }>,
    activeId: T,
    onSelect: (id: T) => void,
  ) => (
    <div className="notebook-utility-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeId === tab.id}
          className={activeId === tab.id ? 'is-active' : ''}
          onClick={() => onSelect(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )

  const renderNotebookManager = () => {
    const storageProfileStatus = storageProfileController.storageProfileStatus
    const notebookFoldersAvailable = Boolean(window.electronAPI?.getStorageProfileStatus)
    const storageHealth =
      storageProfileStatus?.health ?? (storageProfileStatus?.status === 'ready' ? 'healthy' : 'error')
    const showRetry = Boolean(storageProfileStatus && (storageProfileStatus.status === 'error' || storageHealth !== 'healthy'))
    const activeNotebookPath = storageProfileStatus?.notebookPath ?? storageProfileStatus?.profileRootPath ?? ''
    const knownNotebooks = storageProfileStatus?.knownNotebooks ?? []
    const notebookRows: KnownNotebook[] = knownNotebooks.length > 0
      ? knownNotebooks
      : storageProfileStatus && activeNotebookPath
        ? [{
            notebookId: storageProfileStatus.activeNotebookId ?? undefined,
            notebookPath: activeNotebookPath,
            notebookName: storageProfileStatus.notebookName || 'Notebook',
            isActive: true,
            exists: storageProfileStatus.hasProfile,
            hasManifest: storageProfileStatus.hasProfile,
            available: storageProfileStatus.hasProfile,
          }]
        : []

    if (!notebookFoldersAvailable) {
      return (
        <div className="notebook-settings-stack">
          <div className="notebook-manager-card">
            <div className="notebook-manager-header">
              <div>
                <span className="notebook-manager-eyebrow">current notebook</span>
                <h3>Browser notebook</h3>
                <p className="notebook-settings-help">Browser stores notebook content in local browser storage.</p>
              </div>
            </div>
            <div className="notebook-manager-meta-grid">
              <div>
                <span>storage</span>
                <strong>browser local</strong>
              </div>
              <div>
                <span>folder controls</span>
                <strong>desktop only</strong>
              </div>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="notebook-settings-stack">
        <p className="notebook-settings-help">
          The notebook is this folder on disk. To use iCloud, Dropbox, OneDrive, or another sync service, put the notebook folder in that synced location.
        </p>
        <div className={`notebook-manager-card ${storageHealth === 'error' ? 'is-error' : ''} ${storageHealth === 'warning' ? 'is-warning' : ''}`.trim()}>
          <div className="notebook-manager-header">
            <div>
              <span className="notebook-manager-eyebrow">current notebook</span>
              <h3>{storageProfileStatus?.status === 'setup-required' ? 'No notebook open' : storageProfileStatus?.notebookName || 'Notebook'}</h3>
              <code className="notebook-manager-path">{activeNotebookPath || 'Choose a notebook folder to start.'}</code>
            </div>
            <div className="notebook-settings-actions notebook-manager-primary-actions">
              <button type="button" className="notebook-settings-action" onClick={createNotebookFromSettings}>
                New Notebook
              </button>
              <button type="button" className="notebook-settings-action" onClick={() => void storageProfileController.openNotebook()}>
                Open Notebook Folder
              </button>
            </div>
          </div>
          <div className="notebook-manager-meta-grid">
            <div>
              <span>status</span>
              <strong>{storageProfileStatus?.status ?? 'loading'}</strong>
            </div>
            <div>
              <span>health</span>
              <strong>{storageProfileStatus ? storageHealth : 'loading'}</strong>
            </div>
            <div>
              <span>writable</span>
              <strong>{storageProfileStatus ? (storageProfileStatus.canWrite ? 'yes' : 'paused') : 'loading'}</strong>
            </div>
            <div>
              <span>schema</span>
              <strong>{storageProfileStatus?.schemaVersion ?? 'n/a'}</strong>
            </div>
          </div>
          {storageProfileStatus?.error ? (
            <p className="notebook-manager-error">{storageProfileStatus.error}</p>
          ) : null}
          {(storageProfileStatus?.issues ?? []).length > 0 ? (
            <div className="notebook-manager-issues" aria-label="notebook folder health issues">
              {(storageProfileStatus?.issues ?? []).map((issue, index) => (
                <p key={`${issue.code}-${issue.path ?? index}`} className={`notebook-manager-issue ${issue.severity === 'error' ? 'is-error' : 'is-warning'}`}>
                  {issue.message}{issue.path ? ` (${issue.path})` : ''}
                </p>
              ))}
            </div>
          ) : null}
          <div className="notebook-settings-actions">
            <button type="button" className="notebook-settings-action" onClick={renameCurrentNotebookFromSettings} disabled={!storageProfileStatus?.activeNotebookId}>
              Rename
            </button>
            <button type="button" className="notebook-settings-action" onClick={() => void storageProfileController.moveStorageProfile()} disabled={!storageProfileStatus?.activeNotebookId}>
              Move Folder
            </button>
            <button type="button" className="notebook-settings-action" onClick={() => void storageProfileController.revealStorageProfile()} disabled={!activeNotebookPath}>
              Reveal Folder
            </button>
            {showRetry ? (
              <button type="button" className="notebook-settings-action" onClick={() => void storageProfileController.retryStorageProfile()}>
                Retry
              </button>
            ) : null}
            <button type="button" className="notebook-settings-action is-danger" onClick={() => deleteNotebookFromSettings()} disabled={!storageProfileStatus?.activeNotebookId}>
              Delete Notebook
            </button>
          </div>
        </div>
        <div className="notebook-manager-list" aria-label="Remembered notebooks">
          <div className="notebook-manager-list-header">
            <span>Remembered notebooks</span>
          </div>
          {notebookRows.length === 0 ? (
            <p className="notebook-settings-help">No notebook folders are remembered yet.</p>
          ) : (
            notebookRows.map((notebook) => {
              const notebookKey = notebook.notebookId ?? notebook.notebookPath
              const menuOpen = openNotebookActionMenuKey === notebookKey
              return (
                <div key={notebookKey} className={`notebook-manager-row ${notebook.isActive ? 'is-active' : ''} ${notebook.available ? '' : 'is-missing'}`.trim()}>
                  <button
                    type="button"
                    className="notebook-manager-row-main"
                    disabled={!notebook.available || notebook.isActive}
                    onClick={() => switchNotebookFromSettings(notebook)}
                  >
                    <AppIcon iconId={notebook.available ? 'folderOpen' : 'folder'} className="notebook-manager-row-icon" />
                    <span className="notebook-manager-row-copy">
                      <strong>{notebook.notebookName}</strong>
                      <code>{notebook.notebookPath}</code>
                    </span>
                    <span className="notebook-manager-row-status">
                      {notebook.isActive ? 'current' : notebook.available ? 'available' : 'folder missing'}
                    </span>
                  </button>
                  <div className="notebook-manager-row-menu">
                    <button
                      type="button"
                      className="notebook-manager-kebab"
                      aria-label={`Actions for ${notebook.notebookName}`}
                      aria-expanded={menuOpen}
                      onClick={() => setOpenNotebookActionMenuKey((previous) => (previous === notebookKey ? '' : notebookKey))}
                    >
                      <AppIcon iconId="ellipsisVertical" className="notebook-manager-kebab-icon" />
                    </button>
                    {menuOpen ? (
                      <div className="notebook-manager-menu" role="menu">
                        {!notebook.isActive && notebook.available ? (
                          <button type="button" role="menuitem" onClick={() => switchNotebookFromSettings(notebook)}>
                            Switch to Notebook
                          </button>
                        ) : null}
                        {notebook.isActive ? (
                          <>
                            <button type="button" role="menuitem" onClick={() => runCurrentNotebookAction(renameCurrentNotebookFromSettings)}>
                              Rename
                            </button>
                            <button type="button" role="menuitem" onClick={() => runCurrentNotebookAction(() => void storageProfileController.moveStorageProfile())}>
                              Move Folder
                            </button>
                            <button type="button" role="menuitem" onClick={() => runCurrentNotebookAction(() => void storageProfileController.revealStorageProfile())}>
                              Reveal Folder
                            </button>
                            {showRetry ? (
                              <button type="button" role="menuitem" onClick={() => runCurrentNotebookAction(() => void storageProfileController.retryStorageProfile())}>
                                Retry
                              </button>
                            ) : null}
                          </>
                        ) : (
                          <button type="button" role="menuitem" onClick={() => forgetNotebookFromSettings(notebook)}>
                            Remove from List
                          </button>
                        )}
                        {notebook.available || notebook.isActive ? (
                          <button type="button" role="menuitem" className="is-danger" onClick={() => deleteNotebookFromSettings(notebook)}>
                            Delete Notebook
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    )
  }

  const renderDataSettings = () => (
    <section className="notebook-settings-section" aria-label="Data settings">
      {renderSegmentedTabs('Data settings sections', DATA_SECTION_TABS, dataSettingsSection, setDataSettingsSection)}
      {dataSettingsSection === 'transfer' ? (
        <div className="notebook-settings-stack">
          <div className="notebook-settings-actions">
            <button type="button" className="notebook-settings-action" onClick={importNotebook}>
              Import notebook or Markdown
            </button>
            <button type="button" className="notebook-settings-action" onClick={exportNotebook}>
              Export notebook
            </button>
          </div>
          <p className="notebook-settings-help">
            Import replaces the current notebook with a Tabs notebook, notebook ZIP, Markdown folder, or Markdown ZIP.
          </p>
        </div>
      ) : null}
      {dataSettingsSection === 'storage' ? renderNotebookManager() : null}
      {dataSettingsSection === 'trash' ? (
        <div className="notebook-settings-grid">
          <label>
            Auto-remove deleted items after
            <input
              type="number"
              min={1}
              max={3650}
              value={state.notebook.settings.autoRemoveDeletedDays}
              onChange={(event) => {
                const days = Math.max(1, Math.min(3650, Number(event.target.value) || 1))
                mutateState((previous) => ({
                  ...previous,
                  notebook: {
                    ...previous.notebook,
                    settings: {
                      ...previous.notebook.settings,
                      autoRemoveDeletedDays: days,
                    },
                  },
                }))
              }}
            />
          </label>
        </div>
      ) : null}
    </section>
  )

  const renderToolbarSettings = () => (
    <section className="notebook-settings-section" aria-label="Toolbar settings">
      <p className="notebook-settings-help">
        Drag tools and spacers in this editor to customize a layout. The note toolbar itself stays fixed.
      </p>
      <ToolbarSettingsPanel
        toolbarLayouts={toolbarLayouts}
        toolbarEditorLayoutId={toolbarEditorLayoutId}
        toolbarEditorShowNames={state.ui.toolbarEditorShowNames ?? false}
        onSelectToolbarLayout={selectToolbarLayoutForEditing}
        onCreateToolbarLayout={createToolbarLayoutSetting}
        onDuplicateToolbarLayout={duplicateToolbarLayoutSetting}
        onRenameToolbarLayout={renameToolbarLayoutSetting}
        onDeleteToolbarLayout={deleteToolbarLayoutSetting}
        onAddToolbarTool={addToolbarToolSetting}
        onAddToolbarSpacer={addToolbarSpacerSetting}
        onRemoveToolbarItem={removeToolbarItemSetting}
        onMoveToolbarItem={moveToolbarItemSetting}
        onMoveToolbarItemToIndex={moveToolbarItemToIndexSetting}
        onToolbarEditorShowNamesChange={(enabled) =>
          mutateState((previous) => ({
            ...previous,
            ui: {
              ...previous.ui,
              toolbarEditorShowNames: enabled,
            },
          }))
        }
        onReadOnlyToolbarEditAttempt={() => window.alert('Duplicate the default layout or create a new layout to edit.')}
      />
    </section>
  )

  const handleShortcutRecorderKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, shortcutId: ShortcutId) => {
    if (editingShortcut !== shortcutId) return
    if (event.key === 'Escape') {
      event.preventDefault()
      setEditingShortcut(null)
      return
    }
    const shortcut = buildShortcutFromKeyboardEvent(event.nativeEvent, isMacPlatform)
    if (!shortcut) return
    event.preventDefault()
    updateShortcutSetting(shortcutId, shortcut)
    setEditingShortcut(null)
  }

  const renderHotkeySettings = () => (
    <section className="notebook-settings-section" aria-label="Hotkey settings">
      <div className="settings-hotkeys-list">
        {HOTKEY_ROWS.map((row) => {
          const shortcut = normalizedHotkeys.shortcuts[row.id] ?? DEFAULT_SHORTCUTS[row.id] ?? ''
          const label = formatShortcutLabel(shortcut, isMacPlatform) || 'unassigned'
          return (
            <div className="settings-hotkey-row" key={row.id}>
              <span className="settings-hotkey-label">{row.label}</span>
              <button
                type="button"
                className={`settings-shortcut-btn ${editingShortcut === row.id ? 'is-recording' : ''}`}
                onClick={() => setEditingShortcut((current) => (current === row.id ? null : row.id))}
                onKeyDown={(event) => handleShortcutRecorderKeyDown(event, row.id)}
              >
                {editingShortcut === row.id ? 'press keys...' : label}
              </button>
            </div>
          )
        })}
      </div>
      <p className="notebook-settings-help">Select a hotkey to enter a new combination, escape to cancel.</p>
    </section>
  )

  const renderShortcutSettings = () => (
    <section className="notebook-settings-section" aria-label="Shortcut settings">
      <div className="settings-hotkeys-list">
        {NEWLINE_SHORTCUT_ROWS.map((row) => (
          <label className="settings-hotkey-row" key={row.id} htmlFor={`notebook-settings-newline-${row.id}`}>
            <span className="settings-hotkey-label">{formatFixedNewlineShortcutLabel(row.id, isMacPlatform)}</span>
            <select
              id={`notebook-settings-newline-${row.id}`}
              className="settings-select-input settings-shortcut-select"
              value={normalizedHotkeys.newlineShortcuts.shortcuts[row.id]}
              onChange={(event) => updateNewlineShortcutSetting(row.id, event.target.value as NewlineOperationId)}
            >
              {NEWLINE_OPERATIONS.map((operation) => (
                <option key={operation.id} value={operation.id}>
                  {operation.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="settings-divider" />
      <div className="settings-hotkey-row">
        <span className="settings-hotkey-label">{NEWLINE_OPERATION_LABELS.operationsMenu}</span>
        <button
          type="button"
          className="btn btn-sm settings-action-btn"
          onClick={() => setShortcutMenuSettingsOpen((open) => !open)}
        >
          {shortcutMenuSettingsOpen ? 'hide' : 'configure'}
        </button>
      </div>
      {shortcutMenuSettingsOpen ? (
        <ShortcutMenuSettingsPanel
          operations={normalizedHotkeys.newlineShortcuts.menuOperations}
          onChange={updateShortcutMenuOperationsSetting}
        />
      ) : null}
      <p className="notebook-settings-help">Numbered menu entries use 1-9, then 0.</p>
    </section>
  )

  const renderFrontmatterSettings = () => {
    const templates = frontmatterDraft.templates
    const activeTemplate =
      templates.find((template) => template.id === frontmatterDraft.settingsTemplateId) ?? templates[0] ?? null
    const frontmatterDraftDirty = JSON.stringify(frontmatterDraft) !== JSON.stringify(state.frontmatter)

    const updateFrontmatterDraft = (update: (frontmatter: AppState['frontmatter']) => AppState['frontmatter']) => {
      setFrontmatterDraft((previous) => update(previous))
    }

    const updateFrontmatterTemplate = (templateId: string, patch: Partial<Pick<FrontmatterTemplate, 'name'>>) => {
      updateFrontmatterDraft((frontmatter) => ({
        ...frontmatter,
        templates: frontmatter.templates.map((template) =>
          template.id === templateId
            ? {
                ...template,
                name: typeof patch.name === 'string' ? patch.name : template.name,
              }
            : template,
        ),
      }))
    }

    const updateFrontmatterTemplateField = (
      templateId: string,
      fieldId: string,
      patch: Partial<FrontmatterTemplateField>,
    ) => {
      updateFrontmatterDraft((frontmatter) => ({
        ...frontmatter,
        templates: frontmatter.templates.map((template) =>
          template.id === templateId
            ? {
                ...template,
                fields: template.fields.map((field) => {
                  if (field.id !== fieldId) return field
                  const requestedKey = typeof patch.key === 'string' ? patch.key.trim() : field.key
                  const duplicateKey = template.fields.some(
                    (candidate) => candidate.id !== fieldId && candidate.key.trim() === requestedKey,
                  )
                  const nextType = patch.type ?? field.type
                  const requestedComputed = patch.computed ?? field.computed
                  const requestedDefaultValue = patch.defaultValue ?? field.defaultValue
                  const hasPatchedOptions = Object.prototype.hasOwnProperty.call(patch, 'options')
                  const fixedListOptions = nextType === 'fixedList'
                    ? hasPatchedOptions
                      ? normalizeFrontmatterFixedListOptions(patch.options)
                      : field.type === 'fixedList'
                        ? normalizeFrontmatterFixedListOptions(field.options)
                        : getEditableFixedListOptions(field.options, requestedDefaultValue)
                    : undefined
                  const nextDefaultValue = nextType === 'boolean'
                    ? (isFrontmatterBooleanTrue(requestedDefaultValue) ? 'true' : 'false')
                    : nextType === 'fixedList'
                      ? resolveFrontmatterFixedListValues(fixedListOptions, requestedDefaultValue).join(', ')
                      : requestedDefaultValue
                  return {
                    ...field,
                    ...patch,
                    type: nextType,
                    defaultValue: nextDefaultValue,
                    computed: isFrontmatterComputedValueCompatibleWithFieldType(requestedComputed, nextType)
                      ? requestedComputed
                      : 'none',
                    key: requestedKey && !duplicateKey ? requestedKey : field.key,
                    options: fixedListOptions,
                  }
                }),
              }
            : template,
        ),
      }))
    }

    const getFixedListOptionDraftKey = (templateId: string, fieldId: string) => `${templateId}:${fieldId}`
    const getFixedListOptionDraftValue = (templateId: string, field: FrontmatterTemplateField) => {
      const draftKey = getFixedListOptionDraftKey(templateId, field.id)
      return frontmatterFixedListOptionDrafts[draftKey] ?? normalizeFrontmatterFixedListOptions(field.options).join(', ')
    }

    const renderFrontmatterDefaultControl = (templateId: string, field: FrontmatterTemplateField) => {
      if (field.type === 'fixedList') {
        const options = normalizeFrontmatterFixedListOptions(field.options)
        const selectedDefaults = resolveFrontmatterFixedListValues(options, field.defaultValue)
        const selectedDefaultSet = new Set(selectedDefaults)
        const selectedDefaultSummary = selectedDefaults.length > 0 ? selectedDefaults.join(', ') : 'default selection'
        const optionDraftKey = getFixedListOptionDraftKey(templateId, field.id)
        return (
          <div className="frontmatter-fixed-list-default">
            <input
              type="text"
              className="settings-text-input frontmatter-fixed-list-options-input"
              value={getFixedListOptionDraftValue(templateId, field)}
              aria-label="frontmatter fixed list values"
              placeholder="one, two"
              disabled={field.computed !== 'none'}
              onChange={(event) => {
                const rawOptions = event.target.value
                const nextOptions = normalizeFrontmatterFixedListOptions(rawOptions)
                setFrontmatterFixedListOptionDrafts((drafts) => ({
                  ...drafts,
                  [optionDraftKey]: rawOptions,
                }))
                updateFrontmatterTemplateField(templateId, field.id, {
                  options: nextOptions,
                  defaultValue: resolveFrontmatterFixedListValues(nextOptions, field.defaultValue).join(', '),
                })
              }}
            />
            <details className="frontmatter-fixed-list-dropdown frontmatter-default-input">
              <summary
                className="settings-select-input frontmatter-fixed-list-trigger"
                aria-label="frontmatter fixed list default values"
                title={selectedDefaultSummary}
              >
                <span className="frontmatter-fixed-list-trigger-label">{selectedDefaultSummary}</span>
              </summary>
              <div className="frontmatter-fixed-list-menu" role="group" aria-label="frontmatter fixed list default options">
                {options.length > 0 ? (
                  options.map((option) => {
                    const checked = selectedDefaultSet.has(option)
                    return (
                      <label key={option} className="frontmatter-fixed-list-choice">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={field.computed !== 'none'}
                          onChange={(event) => {
                            const nextDefaultSet = new Set(selectedDefaults)
                            if (event.target.checked) {
                              nextDefaultSet.add(option)
                            } else {
                              nextDefaultSet.delete(option)
                            }
                            const nextDefaults = options.filter((candidate) => nextDefaultSet.has(candidate))
                            updateFrontmatterTemplateField(templateId, field.id, {
                              defaultValue: nextDefaults.join(', '),
                            })
                          }}
                        />
                        <span>{option}</span>
                      </label>
                    )
                  })
                ) : (
                  <span className="frontmatter-fixed-list-empty">No fixed-list options</span>
                )}
              </div>
            </details>
          </div>
        )
      }

      if (field.type === 'boolean') {
        const checked = isFrontmatterBooleanTrue(field.defaultValue)
        return (
          <label className="frontmatter-boolean-switch form-check form-switch settings-switch frontmatter-default-input">
            <input
              className="form-check-input"
              type="checkbox"
              role="switch"
              checked={checked}
              disabled={field.computed !== 'none'}
              aria-label="frontmatter default boolean value"
              onChange={(event) =>
                updateFrontmatterTemplateField(templateId, field.id, {
                  defaultValue: event.target.checked ? 'true' : 'false',
                })
              }
            />
            <span className="frontmatter-boolean-switch-label">{checked ? 'true' : 'false'}</span>
          </label>
        )
      }

      if (field.type === 'date' || field.type === 'datetime') {
        return (
          <input
            type={field.type === 'date' ? 'date' : 'datetime-local'}
            className="settings-text-input frontmatter-default-input"
            value={field.type === 'date'
              ? getFrontmatterDatePickerValue(field.defaultValue)
              : getFrontmatterDatetimePickerValue(field.defaultValue)}
            aria-label="frontmatter default value"
            disabled={field.computed !== 'none'}
            onChange={(event) =>
              updateFrontmatterTemplateField(templateId, field.id, {
                defaultValue: event.target.value,
              })
            }
          />
        )
      }

      return (
        <input
          type="text"
          className="settings-text-input frontmatter-default-input"
          value={field.defaultValue}
          aria-label="frontmatter default value"
          placeholder={field.computed === 'none' ? 'default' : 'computed'}
          disabled={field.computed !== 'none'}
          onChange={(event) =>
            updateFrontmatterTemplateField(templateId, field.id, {
              defaultValue: event.target.value,
            })
          }
        />
      )
    }

    const saveFrontmatterTemplates = () => {
      const nextFrontmatter = frontmatterDraft
      frontmatterStateSnapshotRef.current = nextFrontmatter
      setFrontmatterFixedListOptionDrafts({})
      mutateState((previous) => ({
        ...previous,
        frontmatter: nextFrontmatter,
      }))
    }

    return (
      <section className="notebook-settings-section" aria-label="Frontmatter settings">
        <p className="notebook-settings-help">Template changes apply only after saving.</p>
        <div className="settings-hotkey-row">
          <label className="settings-hotkey-label" htmlFor="notebook-settings-frontmatter-template">
            template
          </label>
          <select
            id="notebook-settings-frontmatter-template"
            className="settings-select-input settings-shortcut-select"
            value={activeTemplate?.id ?? ''}
            onChange={(event) =>
              updateFrontmatterDraft((frontmatter) => ({
                ...frontmatter,
                settingsTemplateId: event.target.value,
              }))
            }
          >
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </div>
        <div className="notebook-settings-actions">
          <button
            type="button"
            className="notebook-settings-action"
            onClick={() => {
              const template: FrontmatterTemplate = {
                id: createFrontmatterTemplateId(),
                name: 'new template',
                fields: [],
              }
              updateFrontmatterDraft((frontmatter) => ({
                ...frontmatter,
                templates: [...frontmatter.templates, template],
                settingsTemplateId: template.id,
              }))
            }}
          >
            New template
          </button>
          <button
            type="button"
            className="notebook-settings-action"
            disabled={!activeTemplate || templates.length <= 1}
            onClick={() => {
              if (!activeTemplate) return
              updateFrontmatterDraft((frontmatter) => {
                const nextTemplates = frontmatter.templates.filter((template) => template.id !== activeTemplate.id)
                return {
                  ...frontmatter,
                  templates: nextTemplates,
                  settingsTemplateId: frontmatter.settingsTemplateId === activeTemplate.id ? '' : frontmatter.settingsTemplateId,
                  lastAppliedTemplateId:
                    frontmatter.lastAppliedTemplateId === activeTemplate.id ? '' : frontmatter.lastAppliedTemplateId,
                }
              })
            }}
          >
            Delete template
          </button>
          <button
            type="button"
            className="notebook-settings-action"
            disabled={!frontmatterDraftDirty}
            onClick={() => {
              setFrontmatterFixedListOptionDrafts({})
              setFrontmatterDraft(stateRef.current.frontmatter)
            }}
          >
            Discard changes
          </button>
          <button
            type="button"
            className="notebook-settings-action"
            disabled={!frontmatterDraftDirty}
            onClick={saveFrontmatterTemplates}
          >
            Save template
          </button>
        </div>
        {activeTemplate ? (
          <>
            <label className="settings-modal-field">
              <span>name</span>
              <input
                type="text"
                className="settings-text-input"
                value={activeTemplate.name}
                onChange={(event) => updateFrontmatterTemplate(activeTemplate.id, { name: event.target.value })}
              />
            </label>
            <div className="settings-divider" />
            <div className="frontmatter-template-fields">
              <div className="frontmatter-template-field-row frontmatter-template-field-header" aria-hidden="true">
                <span>key</span>
                <span>type</span>
                <span>computed</span>
                <span>default value</span>
                <span>lock</span>
                <span>action</span>
              </div>
              {activeTemplate.fields.map((field) => (
                <div key={field.id} className={`frontmatter-template-field-row ${field.computed !== 'none' ? 'is-computed' : ''}`}>
                  <input
                    type="text"
                    className="settings-text-input frontmatter-key-input"
                    aria-label="Frontmatter key"
                    value={field.key}
                    onChange={(event) =>
                      updateFrontmatterTemplateField(activeTemplate.id, field.id, { key: event.target.value })
                    }
                  />
                  <select
                    className="settings-select-input frontmatter-type-select"
                    aria-label="Frontmatter type"
                    value={field.type}
                    onChange={(event) => {
                      const type = event.target.value as FrontmatterTemplateField['type']
                      const options = type === 'fixedList'
                        ? getEditableFixedListOptions(field.options, field.defaultValue)
                        : undefined
                      updateFrontmatterTemplateField(activeTemplate.id, field.id, {
                        type,
                        defaultValue: type === 'boolean'
                          ? (isFrontmatterBooleanTrue(field.defaultValue) ? 'true' : 'false')
                          : type === 'date' || type === 'datetime'
                            ? getFrontmatterDraftValueForType(type, field.defaultValue)
                            : type === 'fixedList'
                              ? resolveFrontmatterFixedListValues(options, field.defaultValue).join(', ')
                            : field.defaultValue,
                        options,
                        computed: isFrontmatterComputedValueCompatibleWithFieldType(field.computed, type)
                          ? field.computed
                          : 'none',
                      })
                    }}
                  >
                    {FRONTMATTER_FIELD_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {getFrontmatterTypeLabel(type)}
                      </option>
                    ))}
                  </select>
                  <select
                    className="settings-select-input frontmatter-computed-select"
                    value={field.computed}
                    aria-label="Frontmatter computed value"
                    onChange={(event) =>
                      updateFrontmatterTemplateField(activeTemplate.id, field.id, {
                        computed: event.target.value as FrontmatterTemplateField['computed'],
                      })
                    }
                  >
                    {getFrontmatterComputedValuesForFieldType(field.type).map((computed) => (
                      <option key={computed} value={computed}>
                        {computed}
                      </option>
                    ))}
                  </select>
                  {renderFrontmatterDefaultControl(activeTemplate.id, field)}
                  <span
                    className={`frontmatter-computed-lock ${field.computed !== 'none' ? 'is-visible' : ''}`}
                    aria-label={field.computed !== 'none' ? 'Computed values cannot be manually changed.' : undefined}
                    data-app-tooltip={field.computed !== 'none' ? 'Computed values cannot be manually changed.' : undefined}
                  >
                    {field.computed !== 'none' ? <AppIcon iconId="lock" className="frontmatter-template-lock-icon" /> : null}
                  </span>
                  <button
                    type="button"
                    className="notebook-settings-action frontmatter-template-remove-btn"
                    aria-label={`Remove ${field.key || 'frontmatter field'}`}
                    data-app-tooltip="Remove field"
                    onClick={() =>
                      updateFrontmatterDraft((frontmatter) => ({
                        ...frontmatter,
                        templates: frontmatter.templates.map((template) =>
                          template.id === activeTemplate.id
                            ? {
                                ...template,
                                fields: template.fields.filter((candidate) => candidate.id !== field.id),
                              }
                            : template,
                        ),
                      }))
                    }
                  >
                    <AppIcon iconId="trash" className="frontmatter-template-remove-icon" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="notebook-settings-action"
              onClick={() => {
                const existingKeys = new Set(activeTemplate.fields.map((field) => field.key.trim()).filter(Boolean))
                let key = 'field'
                let index = 2
                while (existingKeys.has(key)) {
                  key = `field ${index}`
                  index += 1
                }
                const field: FrontmatterTemplateField = {
                  id: createFrontmatterTemplateId(),
                  key,
                  type: 'text',
                  defaultValue: '',
                  computed: 'none',
                }
                updateFrontmatterDraft((frontmatter) => ({
                  ...frontmatter,
                  templates: frontmatter.templates.map((template) =>
                    template.id === activeTemplate.id
                      ? { ...template, fields: [...template.fields, field] }
                      : template,
                  ),
                }))
              }}
            >
              Add field
            </button>
          </>
        ) : (
          <p className="notebook-settings-help">Create a template to add default frontmatter fields.</p>
        )}
      </section>
    )
  }

  const renderMiscSettings = () => {
    const renderSegmentedSetting = <T extends string,>(
      label: string,
      value: T,
      options: Array<{ id: T; label: string }>,
      onChange: (value: T) => void,
    ) => {
      const labelId = `notebook-settings-${label.replace(/\s+/g, '-')}-label`
      return (
        <div className="settings-hotkey-row">
          <span className="settings-hotkey-label" id={labelId}>
            {label}
          </span>
          <div className="settings-segmented-control settings-flag-segmented-control" role="radiogroup" aria-labelledby={labelId}>
            {options.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={value === option.id}
                className={`settings-segmented-option ${value === option.id ? 'is-selected' : ''}`}
                onClick={() => onChange(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )
    }

    return (
      <section className="notebook-settings-section" aria-label="Misc settings">
        <div className="settings-hotkeys-list">
          {renderSegmentedSetting(
            'Table add target',
            state.ui.tableAddTargetMode,
            TABLE_TARGET_OPTIONS,
            (tableAddTargetMode) =>
              mutateState((previous) => ({
                ...previous,
                ui: {
                  ...previous.ui,
                  tableAddTargetMode,
                },
              })),
          )}
          {renderSegmentedSetting(
            'Table delete target',
            state.ui.tableDeleteTargetMode,
            TABLE_TARGET_OPTIONS,
            (tableDeleteTargetMode) =>
              mutateState((previous) => ({
                ...previous,
                ui: {
                  ...previous.ui,
                  tableDeleteTargetMode,
                },
              })),
          )}
          {renderSegmentedSetting(
            'Table of contents',
            state.ui.tableOfContentsScope ?? 'all-aisles',
            TABLE_OF_CONTENTS_SCOPE_OPTIONS,
            (tableOfContentsScope) =>
              mutateState((previous) => ({
                ...previous,
                ui: {
                  ...previous.ui,
                  tableOfContentsScope,
                },
              })),
          )}
          <label className="settings-hotkey-row" htmlFor="notebook-settings-scratchpad-aisle-limit">
            <span className="settings-hotkey-label">Scratchpad aisle limit</span>
            <input
              id="notebook-settings-scratchpad-aisle-limit"
              className="settings-text-input"
              type="number"
              min={MIN_SCRATCHPAD_AISLE_LIMIT}
              max={MAX_SCRATCHPAD_AISLE_LIMIT}
              value={state.ui.scratchpadAisleLimit ?? DEFAULT_SCRATCHPAD_AISLE_LIMIT}
              onChange={(event) =>
                mutateState((previous) => ({
                  ...previous,
                  ui: {
                    ...previous.ui,
                    scratchpadAisleLimit: clampScratchpadAisleLimit(event.target.value),
                  },
                }))
              }
            />
          </label>
        </div>
      </section>
    )
  }

  const renderTipsSettings = () => (
    <section className="notebook-settings-section" aria-label="Tips settings">
      {state.ui.seenTipIds.length === 0 ? (
        <p className="notebook-settings-help">Tips you have seen will appear here.</p>
      ) : (
        <div className="notebook-settings-list">
          {state.ui.seenTipIds.map((tipId: TipId) => {
            const tip = getTipDefinition(tipId, { isMacPlatform })
            const enabled = !state.ui.disabledTipIds.includes(tipId)
            return (
              <NotebookSettingsSwitch
                key={tipId}
                label={tip.label}
                description={tip.message}
                checked={enabled}
                onChange={(checked) =>
                  mutateState((previous) => ({
                    ...previous,
                    ui: {
                      ...previous.ui,
                      disabledTipIds: checked
                        ? previous.ui.disabledTipIds.filter((id) => id !== tipId)
                        : previous.ui.disabledTipIds.includes(tipId)
                          ? previous.ui.disabledTipIds
                          : [...previous.ui.disabledTipIds, tipId],
                    },
                  }))
                }
              />
            )
          })}
        </div>
      )}
    </section>
  )

  const renderSettingsContent = () => (
    <section className="notebook-utility-content notebook-settings-panel" aria-label="Settings">
      {renderSegmentedTabs('Settings sections', SETTINGS_SECTION_TABS, settingsSection, setSettingsSection)}
      {settingsSection === 'data' ? renderDataSettings() : null}
      {settingsSection === 'visuals' ? <NotebookThemeSettings state={state} onMutateState={mutateState} /> : null}
      {settingsSection === 'toolbar' ? renderToolbarSettings() : null}
      {settingsSection === 'hotkeys' ? renderHotkeySettings() : null}
      {settingsSection === 'shortcuts' ? renderShortcutSettings() : null}
      {settingsSection === 'frontmatter' ? renderFrontmatterSettings() : null}
      {settingsSection === 'misc' ? renderMiscSettings() : null}
      {settingsSection === 'tips' ? renderTipsSettings() : null}
    </section>
  )

  const renderMessagesContent = () => (
    <section className="notebook-utility-content" aria-label="Messages">
      {renderSegmentedTabs('Messages sections', MESSAGE_SECTION_TABS, messagesSection, setMessagesSection)}
      <MessagesView
        section={messagesSection}
        messages={state.messages ?? []}
        toastHistory={state.toastHistory ?? []}
        onDismissMessage={(messageId) =>
          mutateState((previous) => ({
            ...previous,
            messages: (previous.messages ?? []).map((message) =>
              message.id === messageId ? { ...message, status: 'dismissed' } : message,
            ),
          }))
        }
        onOpenLocation={(location) => setActiveNote(location.noteId)}
      />
    </section>
  )

  const renderAboutContent = () => (
    <section className="notebook-utility-content" aria-label="About">
      {renderSegmentedTabs('About sections', ABOUT_SECTION_TABS, aboutSection, setAboutSection)}
      <AboutView section={aboutSection} />
    </section>
  )

  const renderTrashContent = () => (
    <section className="notebook-utility-content notebook-trash-panel" aria-label="Trash">
      <header className="notebook-utility-panel-header">
        <div>
          <h2>Trash</h2>
          <p>{state.notebook.deletedItems.length.toLocaleString()} deleted item{state.notebook.deletedItems.length === 1 ? '' : 's'}</p>
        </div>
      </header>
      {state.notebook.deletedItems.length === 0 ? <p className="notebook-settings-help">No deleted items.</p> : null}
      {state.notebook.deletedItems.length > 0 ? (
        <div className="notebook-trash-table" aria-label="Deleted notes">
          <div className="notebook-trash-header">
            <span>Note name</span>
            <span>Deleted at</span>
            <span>Actions</span>
          </div>
          <div className="notebook-trash-list">
            {state.notebook.deletedItems.map((entry) => {
              const title = getNotebookItemDisplayTitle(entry.item)
              const previewMarkdown = getDeletedNotebookNoteMarkdown(entry, state)
              const canPreview = entry.item.type === 'note'
              const expanded = canPreview && expandedTrashItemId === entry.id
              const previewId = `trash-preview-${entry.id}`
              return (
                <div className={`notebook-trash-item ${expanded ? 'is-expanded' : ''}`} key={entry.id}>
                  <div className="notebook-trash-row">
                    {canPreview ? (
                      <button
                        type="button"
                        className="notebook-trash-name-button"
                        onClick={() => setExpandedTrashItemId((previous) => (previous === entry.id ? '' : entry.id))}
                        aria-expanded={expanded}
                        aria-controls={previewId}
                      >
                        <span>{title}</span>
                      </button>
                    ) : (
                      <span className="notebook-trash-name-text">{title}</span>
                    )}
                    <time className="notebook-trash-date" dateTime={getDeletedAtTitle(entry.deletedAt)}>
                      {formatDeletedAt(entry.deletedAt)}
                    </time>
                    <div className="notebook-trash-actions" aria-label={`${title} actions`}>
                      <button type="button" onClick={() => restoreDeletedItem(entry.id)}>Restore</button>
                      <button type="button" onClick={() => permanentlyDeleteDeletedItem(entry.id)}>Delete</button>
                    </div>
                  </div>
                  {expanded ? (
                    <div className="notebook-trash-preview" id={previewId}>
                      {previewMarkdown.trim() ? (
                        <TrashMarkdownPreview markdown={previewMarkdown} />
                      ) : (
                        <p className="notebook-trash-empty-preview">No note content.</p>
                      )}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      ) : null}
    </section>
  )

  const renderUtilityShell = () => {
    if (!isUtilityViewMode(viewMode)) return null
    const utilityTabs: Array<{ id: UtilityViewMode; label: string }> = [
      { id: 'settings', label: 'Settings' },
      { id: 'messages', label: 'Messages' },
      { id: 'about', label: 'About' },
      { id: 'trash', label: 'Trash' },
    ]
    return (
      <section className="notebook-utility-shell" aria-label="Utilities">
        <header className="notebook-utility-header">
          {renderSegmentedTabs('Utility sections', utilityTabs, viewMode, setViewMode)}
          <button type="button" className="notebook-settings-action" onClick={() => setViewMode('main')}>
            Return to notes
          </button>
        </header>
        {viewMode === 'settings' ? renderSettingsContent() : null}
        {viewMode === 'messages' ? renderMessagesContent() : null}
        {viewMode === 'about' ? renderAboutContent() : null}
        {viewMode === 'trash' ? renderTrashContent() : null}
      </section>
    )
  }

  const desktopNotebookSetupRequired = Boolean(
    window.electronAPI?.getStorageProfileStatus &&
      storageProfileController.storageProfileStatus?.status === 'setup-required',
  )
  const runtimeVersionLabel = runtimeVersion ? `Version ${runtimeVersion}` : ''

  const renderNotebookSetupScreen = () => (
    <main className="notebook-main notebook-setup-main" aria-label="Notebook setup">
      <section className="notebook-setup-screen">
        <div className="notebook-setup-brand" aria-label={NOTEBOOK_SETUP_APP_NAME}>
          <img className="notebook-setup-logo" src={NOTEBOOK_SETUP_LOGO_SRC} alt="" aria-hidden="true" />
          <h1>{NOTEBOOK_SETUP_APP_NAME}</h1>
          {runtimeVersionLabel ? <p>{runtimeVersionLabel}</p> : null}
        </div>
        <div className="notebook-setup-panel">
          <div className="notebook-setup-action-row">
            <div className="notebook-setup-action-copy">
              <h2>Create new notebook</h2>
              <p>Create a new notebook under a folder.</p>
            </div>
            <button type="button" className="notebook-setup-action-button is-primary" onClick={createNotebookFromSettings}>
              Create
            </button>
          </div>
          <div className="notebook-setup-action-row">
            <div className="notebook-setup-action-copy">
              <h2>Open notebook folder</h2>
              <p>Choose an existing Tabs notebook folder.</p>
            </div>
            <button type="button" className="notebook-setup-action-button" onClick={() => void storageProfileController.openNotebook()}>
              Open
            </button>
          </div>
        </div>
      </section>
    </main>
  )

  return (
    <div
      className={`app-shell notebook-shell ${getThemeClassName(state.theme)}`}
      data-theme={state.theme}
      style={rootStyle}
    >
      {desktopNotebookSetupRequired ? renderNotebookSetupScreen() : (
        <>
      <aside
        className={`notebook-sidebar ${state.ui.sidebarCollapsed ? 'is-collapsed' : ''}`}
        style={{ width: state.ui.sidebarCollapsed ? 48 : state.ui.sidebarWidth }}
      >
        {!state.ui.sidebarCollapsed ? (
          <div className="notebook-sidebar-header" aria-label="Notebook actions">
            <button
              type="button"
              className="notebook-icon-button notebook-sidebar-header-action"
              onClick={createNote}
              aria-label="New note"
              title="New note"
            >
              <AppIcon iconId="filePlus" className="notebook-sidebar-header-icon" />
            </button>
            <button
              type="button"
              className="notebook-icon-button notebook-sidebar-header-action"
              onClick={createFolder}
              aria-label="New folder"
              title="New folder"
            >
              <AppIcon iconId="folderPlus" className="notebook-sidebar-header-icon" />
            </button>
            <button
              type="button"
              className={`notebook-icon-button notebook-sidebar-header-action ${
                sidebarSearchVisible ? 'is-active' : ''
              }`}
              onClick={toggleSidebarSearchModeFromButton}
              aria-label="Search notes"
              title="Search notes"
              aria-pressed={sidebarSearchVisible}
            >
              <AppIcon iconId="search" className="notebook-sidebar-header-icon" />
            </button>
          </div>
        ) : null}
        <button
          className={`notebook-icon-button notebook-sidebar-settings ${isUtilityViewMode(viewMode) ? 'is-active' : ''}`}
          type="button"
          onClick={handleSidebarSettingsClick}
          aria-label="Open settings"
          title="Open settings"
        >
          <AppIcon iconId="settings" className="notebook-sidebar-settings-icon" />
        </button>
        {!state.ui.sidebarCollapsed && sidebarSearchVisible ? (
          <SidebarSearchPanel
            inputRef={searchInputRef}
            query={query}
            active={sidebarSearchActive}
            selectedTokens={sidebarSearchSelectedTokens}
            suggestions={sidebarSearchSuggestions}
            resultGroups={sidebarSearchResultGroups}
            onQueryChange={updateSidebarSearchQuery}
            onSelectSuggestion={selectSidebarSearchSuggestion}
            onRemoveToken={removeSidebarSearchToken}
            onClear={clearSidebarSearch}
            onCloseMode={closeSidebarSearchMode}
            onOpenResult={openSidebarSearchResult}
          />
        ) : null}
        {!state.ui.sidebarCollapsed && !sidebarSearchVisible ? (
          <>
            <div className="notebook-tree" role="tree" aria-multiselectable="true">
                {state.notebook.items.map((item, itemIndex) => (
                  <TreeItemRow
                    key={item.id}
                    item={item}
                    depth={0}
                    parentFolderId={null}
                    index={itemIndex}
                    activeNoteId={state.notebook.activeNoteId}
                    renamingItemId={renamingTreeItemId}
                    renameDraft={treeRenameDraft}
                    draggingItemId={draggingTreeItemId}
                    draggingNoteIds={draggingTreeNoteIdSet}
                    selectedNoteIds={selectedTreeNoteIdSet}
                    createdRenameItemId={pendingCreatedTreeRenameRef.current?.itemId ?? ''}
                    dropTarget={treeDropTarget}
                    collapsedFolderIds={collapsedFolderIds}
                    query={query}
                    onSelectNote={selectSidebarTreeNote}
                    onSelectFolder={selectSidebarTreeFolder}
                    onToggleFolder={toggleFolder}
                    onStartRename={startTreeRename}
                    onRenameDraftChange={setTreeRenameDraft}
                    onCommitRename={commitTreeRename}
                    onCancelRename={cancelTreeRename}
                    onOpenContextMenu={openTreeContextMenu}
                    onDragItemStart={startTreeDrag}
                    onDragItemEnd={finishTreeDrag}
                    onUpdateDropTarget={updateTreeDropTarget}
                    onDropItem={dropTreeItem}
                  />
                ))}
                <div
                  className={`notebook-tree-root-drop-zone ${treeDropTarget?.position === 'root' ? 'is-drop-root' : ''}`}
                  onDragOver={handleRootTreeDragOver}
                  onDrop={handleRootTreeDrop}
                  onDragLeave={() => {
                    if (treeDropTarget?.position === 'root') updateTreeDropTarget(null)
                  }}
                  aria-hidden="true"
                />
            </div>
          </>
        ) : null}
        {!state.ui.sidebarCollapsed ? (
          <button
            type="button"
            className="notebook-sidebar-resize-handle"
            aria-label="Resize sidebar"
            title="Resize sidebar"
            onPointerDown={startSidebarResize}
            onPointerMove={updateSidebarResize}
            onPointerUp={finishSidebarResize}
            onPointerCancel={finishSidebarResize}
          />
        ) : null}
        <button
          className="notebook-icon-button notebook-sidebar-toggle"
          type="button"
          onClick={() =>
            mutateState((previous) => ({
              ...previous,
              ui: {
                ...previous.ui,
                sidebarCollapsed: !previous.ui.sidebarCollapsed,
              },
            }))
          }
          aria-label={state.ui.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={state.ui.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <AppIcon
            iconId={state.ui.sidebarCollapsed ? 'arrowRightFromLine' : 'arrowLeftFromLine'}
            className="notebook-sidebar-toggle-icon"
          />
        </button>
      </aside>
      <main className="notebook-main">
        {viewMode === 'main' ? (
          activeModel ? (
            <section
              className="notebook-editor-surface"
              aria-label={activeModel.title}
              onContextMenu={openNotebookEditorContextMenuFromPointer}
            >
              <NoteWorkspace
                noteBodyId={activeModel.noteBody.id}
                aisles={activeModel.resolved.aisles}
                activeAisleId={renderedActiveAisleId}
                editorReadOnly={false}
                linkedAisleIds={linkedAisleIds}
                wholeNoteLinked={activeModel.linked}
                frontmatterAisleIds={frontmatterAisleIds}
                aisleScrollRef={aisleScrollRef}
                toolbar={toolbar}
                headingPopover={toolbarPopovers}
                imageToolsOverlay={imageToolsOverlay}
                tableControlsOverlay={tableControlsOverlay}
                listReorderControlsOverlay={listReorderControlsOverlay}
                tableOfContentsHeadingsByAisle={
                  tableOfContentsPanels?.noteBodyId === activeModel.noteBody.id
                    ? tableOfContentsPanels.headingsByAisle
                    : undefined
                }
                tableOfContentsLinksByAisle={
                  tableOfContentsPanels?.noteBodyId === activeModel.noteBody.id
                    ? tableOfContentsPanels.linksByAisle
                    : undefined
                }
                openTableOfContentsAisleIds={
                  tableOfContentsPanels?.noteBodyId === activeModel.noteBody.id
                    ? tableOfContentsPanels.openAisleIds
                    : undefined
                }
                onRootChange={(node) => {
                  workspaceRootRef.current = node
                }}
                onAisleScroll={() => undefined}
                onActivateAisle={(editorKey, pointer) => {
                  const activationSource = pointer ? 'pointer' : undefined
                  const targetAisleId = getAisleIdFromAisleEditorKey(editorKey)
                  const shouldAlignSwitchedAisle =
                    Boolean(targetAisleId) && targetAisleId !== activeAisleIdRef.current
                  if (shouldClearPendingCursorRestoreForAisleActivation(activationSource)) {
                    pendingCursorRestoreRef.current = null
                    pendingFocusToAisleIdRef.current = null
                    pendingNavigationTopAisleIdRef.current = null
                    pendingScrollToAisleIdRef.current = null
                  }
                  setActiveAisleId(targetAisleId)
                  notebookEditors.activateAisleEditor(
                    editorKey,
                    pointer
                      ? {
                          focusAtClientPoint: pointer,
                          source: 'pointer',
                        }
                      : undefined,
                  )
                  if (shouldAlignSwitchedAisle) {
                    scheduleAisleFocusScroll(activeModel.noteBody.id, targetAisleId)
                  }
                }}
                onResizeAisleWidth={(aisleId, width) => {
                  if (!activeAisleWidthLocationKey) return
                  mutateState((previous) => ({
                    ...previous,
                    ui: {
                      ...previous.ui,
                      aisleWidths: setAisleWidthForLocation(
                        previous.ui.aisleWidths ?? {},
                        activeAisleWidthLocationKey,
                        aisleId,
                        width,
                      ),
                    },
                  }))
                }}
                onResetAisleWidth={(aisleId) => {
                  if (!activeAisleWidthLocationKey) return
                  mutateState((previous) => ({
                    ...previous,
                    ui: {
                      ...previous.ui,
                      aisleWidths: resetAisleWidthForLocation(
                        previous.ui.aisleWidths ?? {},
                        activeAisleWidthLocationKey,
                        aisleId,
                      ),
                    },
                  }))
                }}
                mountedAisleIds={notebookEditors.mountedAisleIds}
                getPreviewMarkdownForAisle={notebookEditors.getPreviewMarkdownForAisle}
                onCloseTableOfContentsAisle={closeTableOfContentsAisle}
                onSelectTableOfContentsHeading={selectTableOfContentsHeading}
                onSelectTableOfContentsLink={selectTableOfContentsLink}
                onOpenAisleFrontmatter={openFrontmatterModalForAisle}
                onOpenAisleLink={openAisleActionMenu}
                appState={state}
                onOpenNoteReference={openNoteReferenceFromEditor}
                onOpenTagFilter={filterTag}
                onSelectEditableAsset={selectEditableAssetFromWorkspace}
                aisleWidths={activeAisleWidths}
                onRegisterAislePaneRoot={notebookEditors.registerAislePaneRoot}
                onRegisterAisleEditorRoot={notebookEditors.registerAisleEditorRoot}
              />
              <NotebookAisleContextMenu
                menu={aisleContextMenu}
                canDecoupleAisle={canDecoupleAisleById(aisleContextMenu?.aisleId ?? '')}
                onClose={() => setAisleContextMenu(null)}
                onFilterSyncedAisle={() => filterSyncedAisle(aisleContextMenu?.aisleId ?? renderedActiveAisleId)}
                onQuickDecoupleAisle={() => decoupleAisle(aisleContextMenu?.aisleId ?? renderedActiveAisleId)}
                onShowSyncedAisle={() => openDecoupleAisleDialog(aisleContextMenu?.aisleId ?? renderedActiveAisleId)}
              />
              <NotebookEditorContextMenu
                menu={editorContextMenu}
                canDecoupleAisle={canDecoupleAisleById(editorContextMenu?.aisleId ?? '')}
                revealLabel={sidebarRevealLabel}
                canReveal={typeof window !== 'undefined' && typeof window.electronAPI?.revealNoteLocation === 'function'}
                onClose={() => setEditorContextMenu(null)}
                onClipboard={runEditorContextClipboardAction}
                onCommand={notebookEditors.runCommand}
                onInsertUrlLink={openToolbarLinkPicker}
                onEditLink={openUrlLinkPrompt}
                onInsertNoteLink={() => openContextNoteReferencePicker('note-link')}
                onInsertNotePreview={() => openContextNoteReferencePicker('note-preview')}
                onInsertAisle={insertEditorContextAisle}
                onInsertAttachment={notebookEditors.insertAttachmentFile}
                onCopyAs={copyNotebookStructureAs}
                onCreateSyncedCopy={openWholeNoteCopyPicker}
                onFilterSyncedAisle={filterSyncedAisle}
                onDecoupleAisle={decoupleAisle}
                onShowSyncedAisle={openDecoupleAisleDialog}
                onRevealLocation={revealEditorContextLocation}
              />
              {findReplaceOpen ? (
                <FindReplacePanel
                  replaceMode={findReplaceMode === 'replace'}
                  focusRequestId={findReplaceFocusRequestId}
                  query={findReplaceQuery}
                  replacement={findReplaceReplacement}
                  scope={findReplaceScope}
                  caseSensitive={findReplaceOptions.caseSensitive}
                  wholeWord={findReplaceOptions.wholeWord}
                  regex={findReplaceOptions.regex}
                  queryError={findReplaceQueryError}
                  matches={findReplaceMatches}
                  activeIndex={findReplaceActiveMatchIndex}
                  onReplaceModeChange={(enabled) =>
                    updateFindReplaceUi({ findReplaceMode: enabled ? 'replace' : 'find' })
                  }
                  onQueryChange={updateFindReplaceQuery}
                  onReplacementChange={setFindReplaceReplacement}
                  onScopeChange={updateFindReplaceScope}
                  onCaseSensitiveChange={(checked) => {
                    setFindReplaceActiveIndex(0)
                    updateFindReplaceUi({ findCaseSensitive: checked })
                  }}
                  onWholeWordChange={(checked) => {
                    setFindReplaceActiveIndex(0)
                    updateFindReplaceUi({ findWholeWord: checked })
                  }}
                  onRegexChange={(checked) => {
                    setFindReplaceActiveIndex(0)
                    updateFindReplaceUi({ findRegex: checked })
                  }}
                  onPrevious={() => selectFindReplaceMatch(findReplaceActiveMatchIndex - 1)}
                  onNext={() => selectFindReplaceMatch(findReplaceActiveMatchIndex + 1)}
                  onSelectMatch={selectFindReplaceMatch}
                  onReplaceCurrent={() => {
                    const match = findReplaceMatches[findReplaceActiveMatchIndex]
                    if (match) replaceFindMatches([match])
                  }}
                  onReplaceAll={() => replaceFindMatches(findReplaceMatches)}
                  onClose={closeFindReplace}
                />
              ) : null}
              {tagAutocompleteController.menu ? (
                <TagAutocompleteMenu
                  top={tagAutocompleteController.menu.top}
                  left={tagAutocompleteController.menu.left}
                  suggestions={tagAutocompleteController.menu.suggestions}
                  activeIndex={tagAutocompleteController.menu.activeIndex}
                  onHighlight={tagAutocompleteController.setActiveIndex}
                  onChoose={tagAutocompleteController.acceptSuggestion}
                />
              ) : null}
              {shortcutMenu ? (
                <ShortcutMenu
                  top={shortcutMenu.top}
                  left={shortcutMenu.left}
                  operations={normalizedHotkeys.newlineShortcuts.menuOperations}
                  activeIndex={Math.min(
                    shortcutMenu.activeIndex,
                    Math.max(0, normalizedHotkeys.newlineShortcuts.menuOperations.length - 1),
                  )}
                  onHighlight={(activeIndex) => {
                    setShortcutMenu((current) => (current ? { ...current, activeIndex } : current))
                  }}
                  onRun={runShortcutMenuOperation}
                  onClose={() => setShortcutMenu(null)}
                />
              ) : null}
            </section>
          ) : (
            <section className="notebook-empty-state">
              <h2>No notes</h2>
              <button type="button" onClick={createNote}>Create note</button>
            </section>
          )
        ) : null}
        {renderUtilityShell()}
      </main>
        </>
      )}
      {noteActionPicker ? (
        <NotebookNoteActionPicker
          title={noteActionPicker.title}
          entries={noteActionEntries}
          query={noteActionPicker.query}
          showSearchInput={noteActionPicker.source !== 'mention'}
          showHeader={noteActionPicker.source !== 'mention'}
          actions={noteActionPicker.actions}
          anchor={noteActionPicker.anchor}
          urlEnabled={noteActionPicker.urlEnabled}
          onQueryChange={updateNoteActionPickerQuery}
          onSubmitUrl={submitUrlLink}
          onAction={handleNoteActionPickerAction}
          getAislesForNote={getNoteActionPickerAislesForNote}
          onClose={closeNoteActionPicker}
        />
      ) : null}
      <LinkPrompt
        linkPromptInputRef={linkPromptInputRef}
        linkPrompt={linkPrompt}
        onLinkPromptUrlChange={updateLinkPromptUrl}
        onLinkPromptTextChange={updateLinkPromptText}
        onInsertNamedLink={insertNamedLink}
        onCloseLinkPrompt={closeLinkPrompt}
        onOpenLink={openPromptLinkUrl}
        onOpenNoteLink={openNoteLinkFromLinkPrompt}
      />
      {decoupleDialog ? (
        <NotebookDecoupleDialog
          title="Decouple aisle"
          description="Choose which synced aisles keep sharing this aisle body."
          rows={decoupleDialogRows}
          keepKeys={decoupleDialog.keepKeys}
          currentKey={decoupleDialog.currentKey}
          keepData={decoupleDialog.keepData}
          keepDataLabel="keep text in decoupled aisles?"
          error={decoupleDialog.error}
          onCancel={() => setDecoupleDialog(null)}
          onToggleKeepKey={toggleDecoupleDialogKeepKey}
          onKeepDataChange={updateDecoupleDialogKeepData}
          onApply={applyDecoupleDialog}
        />
      ) : null}
      <NotebookTreeContextMenu
        menu={treeContextMenu}
        revealLabel={sidebarRevealLabel}
        canReveal={typeof window !== 'undefined' && typeof window.electronAPI?.revealNotebookItemLocation === 'function'}
        onClose={() => setTreeContextMenu(null)}
        onCreateNote={createTreeContextNote}
        onCreateFolder={createTreeContextFolder}
        onReveal={revealTreeContextItem}
        onRename={renameTreeContextItem}
        onDelete={deleteTreeContextItem}
      />
      <NotebookFrontmatterModal
        modal={frontmatterModal}
        templates={state.frontmatter.templates}
        onCancel={() => setFrontmatterModal(null)}
        onChange={setFrontmatterModal}
        onSave={saveFrontmatter}
        onSelectAisle={selectFrontmatterAisle}
        onSelectTemplate={selectFrontmatterTemplate}
        onToggleTemplateDerived={toggleFrontmatterTemplateDerived}
        onEditTemplate={editFrontmatterTemplateFromModal}
        onFilterTemplate={filterFrontmatterTemplateFromModal}
      />
      <AisleEditModal
        open={aisleEditModalOpen && Boolean(activeModel)}
        aisles={activeModel?.resolved.aisles ?? []}
        linkedAisleIds={linkedAisleIds}
        frontmatterAisleIds={frontmatterAisleIds}
        maxAisles={MAX_NOTE_AISLES}
        maxAislesWarningMessage={MAX_AISLE_WARNING_MESSAGE}
        onCancel={() => setAisleEditModalOpen(false)}
        onApply={applyAisleEditDraftToActiveNote}
        onWarn={(message) => window.alert(message)}
      />
    </div>
  )
}
