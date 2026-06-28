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
  DeletedVaultItem,
  FrontmatterData,
  FrontmatterSaveOptions,
  FrontmatterTemplate,
  FrontmatterTemplateField,
  MessagesSection,
  LinkPromptState,
  NoteAisle,
  NoteAisleBody,
  NoteBody,
  NoteLocation,
  NoteNavigationTarget,
  KnownVault,
  StorageProfileStatus,
  VaultTreeItem,
  NewlineOperationId,
  NewlineShortcutId,
  ResolvedNoteAisle,
  SettingsSection,
  ShortcutId,
  TabColorIndicatorPlacement,
  TableControlTargetMode,
  TableOfContentsScope,
  TabSortMode,
  ToolbarToolId,
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
  parseFrontmatterTemplateImport,
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
  reorderFrontmatterItemsByTargetIndex,
  reorderFrontmatterTemplateFieldsByTargetIndex,
  resolveFrontmatterRowComputedForType,
  type FrontmatterRowDraft,
} from '../frontmatter/frontmatter-state'
import {
  buildFrontmatterClipboardPayload,
  buildFrontmatterClipboardPasteForAisle,
  readFrontmatterClipboardPayloadFromNavigator,
  writeFrontmatterClipboardPayload,
  type FrontmatterClipboardPayload,
} from '../frontmatter/frontmatter-clipboard'
import {
  buildNoteLocationKey,
} from '../notes/note-locations'
import { filterNoteActionPickerEntries, getNoteActionPickerActionsForNote } from './note-action-picker-entries'
import { buildAisleEditorKey, getAisleIdFromAisleEditorKey } from '../editor/aisle-editor'
import { shouldClearPendingCursorRestoreForAisleActivation } from '../editor/aisle-activation'
import { isHeadingCollapsed, setHeadingCollapsed } from '../editor/heading-collapse-state'
import {
  DEFAULT_TOOLBAR_LAYOUT_ID,
  createCustomToolbarLayout,
  createToolbarSpacerItem,
  createToolbarToolItem,
  getDefaultToolbarLayout,
  getDuplicateToolbarLayoutName,
  getNextCoolbarToolbarLayoutName,
  getToolbarGroupClassName,
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
import type { NoteTabStripItem } from '../components/notes/NoteTabStrip'
import { scrollAislePaneIntoHorizontalView } from '../components/notes/aisle-horizontal-scroll'
import { SharedEditorToolbar } from '../components/editor/SharedEditorToolbar'
import { ToolbarToolVisual } from '../components/editor/ToolbarToolVisual'
import { ToolbarToolIcon } from '../components/editor/ToolbarToolIcon'
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
import {
  configureDiagnosticLogging,
  createMainThreadHeartbeat,
  recordDiagnosticEvent,
} from '../diagnostics/diagnostic-logger'
import {
  getDiagnosticDayKey,
  orderDiagnosticDaysForDisplay,
  type DiagnosticLogDisplayLimit,
  type DiagnosticLogEntry,
  type DiagnosticLogLevelFilter,
  type DiagnosticLogMode,
} from '../diagnostics/diagnostic-log'
import {
  deleteAllDiagnosticLogs as deleteAllStoredDiagnosticLogs,
  deleteDiagnosticLogDay,
  listDiagnosticLogDays,
  readDiagnosticLogEntries,
  subscribeDiagnosticLogChanges,
} from '../diagnostics/diagnostic-log-store'
import { AisleEditModal } from '../components/notes/AisleEditModal'
import {
  VaultEditorContextMenu,
  getVaultEditorContextMenuAisleIdFromTarget,
  type VaultEditorAisleInsertSide,
  type VaultEditorClipboardAction,
  type VaultEditorContextMenuState,
  type VaultEditorCopyAsKind,
  type VaultEditorCopyAsMode,
  type VaultEditorPasteDestination,
} from '../components/overlays/VaultEditorContextMenu'
import { TipHost } from '../components/overlays/TipHost'
import { ToastHost } from '../components/overlays/ToastHost'
import { AppIcon } from '../components/icons/AppIcon'
import {
  SidebarSearchPanel,
  type SidebarSearchOption,
  type SidebarSearchResultOpenMode,
} from '../components/navigation/SidebarSearchPanel'
import { AboutView } from '../components/about/AboutView'
import { MessagesView } from '../components/messages/MessagesView'
import { TrashMarkdownPreview } from '../components/trash/TrashMarkdownPreview'
import { ToolbarSettingsPanel } from '../components/settings/ToolbarSettingsPanel'
import { ShortcutMenuSettingsPanel } from '../components/settings/ShortcutMenuSettingsPanel'
import {
  clampContextMenuPosition,
  getSubmenuPosition,
  type MenuPosition,
  type MenuRect,
  type MenuSize,
  type MenuViewport,
} from '../components/overlays/context-menu-position'
import { useEditorToolbarState } from '../editor/useEditorToolbarState'
import { useVaultAisleEditors } from '../editor/useVaultAisleEditors'
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
import { useVaultHotkeys } from '../hotkeys/useVaultHotkeys'
import {
  cancelScheduledAisleFocusScroll,
  scheduleFocusedAisleScroll,
  type ScheduledAisleFocusScroll,
} from './focused-aisle-scroll'
import { getVaultTreeRevealScrollTop } from './vault-tree-scroll'
import {
  resolveVaultNavigationLocation,
  useVaultNavigationHistory,
  type VaultNavigationLocation,
} from '../navigation/vault-navigation-history'
import { getNextNotesScratchpadToggleState } from '../navigation/toggle-notes-scratchpad'
import { getTipDefinition } from '../tips/tips'
import {
  buildTableOfContentsPanels,
  TABLE_OF_CONTENTS_EMPTY_MESSAGE,
  type TableOfContentsPanelsState,
} from '../editor/table-of-contents'
import { MAX_AISLE_WARNING_MESSAGE, MAX_NOTE_AISLES } from '../editor/aisle-edit-draft'
import { parseSavedState } from '../state/app-state'
import { createRandomId, createReservedIdAllocator } from '../state/navigation-ids'
import { importMarkdownIntoExistingVault } from '../import/markdown-import'
import { usePersistentAppState } from '../storage/usePersistentAppState'
import { useStorageProfileController } from '../storage/useStorageProfileController'
import { useAppNotifications } from './useAppNotifications'
import {
  APP_THEME_IDS,
  CUSTOM_THEME_IDS,
  CUSTOM_THEME_PALETTE_GROUPS,
  CUSTOM_THEME_PALETTE_LABELS,
  CUSTOM_THEME_PALETTE_SLOTS,
  copyThemePaletteToCustomPalette,
  getCustomThemePaletteSeed,
  getThemePaletteForTheme,
  getThemePaletteVariables,
  getThemeClassName,
  isCustomTheme,
  normalizeCustomThemePalette,
} from '../theme/vault-themes'
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
  normalizeHexColor,
} from '../settings/defaults'
import { parseThemeSettingsImport, serializeThemeSettings } from '../settings/theme-transfer'
import {
  collectVaultIds,
  closeVaultTab,
  createVaultFolderInState,
  createVaultNoteInState,
  deleteVaultItemsInState,
  findVaultFolder,
  findVaultItem,
  findVaultNote,
  focusVaultOpenTab,
  getClosedVaultTab,
  getContainingFolderId,
  getFirstVaultNote,
  getVaultNoteFolderPath,
  getVaultRetainedTabCycleTarget,
  isNoteBodyLinked,
  moveVaultItem,
  moveVaultItems,
  openVaultRetainedTab,
  openVaultTemporaryTab,
  promoteVaultTemporaryTab,
  renameVaultItem,
  reorderVaultTabs,
  restoreClosedVaultTab,
  restoreDeletedVaultItemInState,
  sortVaultItemsInScope,
  type ClosedVaultTab,
  type VaultTabOpenDisposition,
} from '../state/vault'
import {
  VaultNoteActionPicker,
  getCopyModeForNoteAction,
  getReferenceKindForNoteAction,
  type VaultNoteActionPickerAction,
  type VaultNoteActionPickerActionOptions,
  type VaultNoteActionPickerAnchor,
  type VaultNoteActionPickerAisleOption,
  type VaultNoteActionPickerViewportRect,
} from '../components/overlays/VaultNoteActionPicker'
import { VaultDecoupleDialog } from '../components/overlays/VaultDecoupleDialog'
import {
  buildVaultNoteReferenceInsertionText,
  getVaultAisleDecoupleRows,
  replaceActiveNoteBodyFromTargetNote,
  replaceFocusedAisleFromTargetNote,
} from '../notes/vault-note-actions'
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
  buildNoteFilterIndex,
  getFrontmatterTemplateFilterKey,
  getSyncedAisleFilterKey,
} from '../filters/note-filter'
import { createVaultIndexContext } from '../filters/vault-index-context'
import {
  buildSidebarSearchIndexes,
  buildSidebarSearchResultGroups,
  completeSidebarSearchTokenQuery,
  formatSidebarSearchTokenText,
  getEmptySidebarSearchIndexes,
  getSidebarSearchSuggestions,
  getSidebarSearchTokenForKey,
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
  applyVaultStructureClipboardPayload,
  buildVaultStructureClipboardPayload,
  readVaultStructureClipboardPayloadFromNavigator,
  writeVaultStructureClipboardPayload,
  type VaultStructureClipboardPayload,
} from '../notes/vault-structure-clipboard'
import {
  SCRATCHPAD_CONTENT_TARGET_ID,
  SCRATCHPAD_CURSOR_LOCATION_KEY,
  getScratchpadActiveAisleId,
  getScratchpadNoteBody,
  resolveScratchpadNoteBody,
  setScratchpadActiveAisleId,
} from '../state/scratchpad'
import {
  applyVaultEditorMarkdownSnapshotsToState,
  commitVaultAisleMarkdownInState,
} from './vault-editor-persistence'
import { CLOSED_LINK_PROMPT_STATE, closeLinkPromptState } from './linkPromptState'
import { MEDIA_PLAYER_SELECTOR } from '../media/media-utils'
import { openExternalWebUrl } from '../notes/external-links'

void React

const SIDEBAR_MIN_WIDTH = 212
const SIDEBAR_MAX_WIDTH = 520
const VAULT_FOCUS_BOUNDARY_FLUSH_DELAY_MS = 60
const VAULT_TREE_VIRTUALIZATION_THRESHOLD = 300
const VAULT_TREE_VIRTUAL_ROW_HEIGHT = 28
const VAULT_TREE_VIRTUAL_OVERSCAN = 12

const SIDEBAR_SEARCH_HISTORY_STORAGE_KEY = 'aislenote:sidebar-search-history:v1'
const SIDEBAR_SEARCH_HISTORY_LIMIT = 10
const SIDEBAR_SEARCH_OPTIONS: SidebarSearchOption[] = [
  { tokenText: 'tag:name', description: 'search tags', insertText: 'tag:' },
  { tokenText: 'fm:key', description: 'search frontmatter keys, templates, and values', insertText: 'fm:' },
  { tokenText: 'fm:"template or phrase"', description: 'match a frontmatter phrase', insertText: 'fm:"' },
  { tokenText: 'synced:"note name"', description: 'search synced aisles', insertText: 'synced:"' },
  { tokenText: 'duplicate:"note name"', description: 'search duplicate aisles', insertText: 'duplicate:"' },
]

function normalizeSidebarSearchHistoryEntry(query: string): string {
  return query.trim().replace(/\s+/g, ' ')
}

function loadSidebarSearchHistory(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SIDEBAR_SEARCH_HISTORY_STORAGE_KEY) ?? '[]') as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((entry) => (typeof entry === 'string' ? normalizeSidebarSearchHistoryEntry(entry) : ''))
      .filter(Boolean)
      .slice(0, SIDEBAR_SEARCH_HISTORY_LIMIT)
  } catch {
    return []
  }
}

function saveSidebarSearchHistory(history: string[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SIDEBAR_SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(history))
  } catch {
    // Local storage is best-effort UI state.
  }
}

function appendSidebarSearchHistoryEntry(history: string[], query: string): string[] {
  const entry = normalizeSidebarSearchHistoryEntry(query)
  if (!entry) return history
  return [entry, ...history.filter((candidate) => candidate !== entry)].slice(0, SIDEBAR_SEARCH_HISTORY_LIMIT)
}

function revealVaultTreeForCreatedItem(
  ui: AppState['ui'],
  expandedFolderIds: Array<string | null | undefined>,
): AppState['ui'] {
  const expandedIds = new Set(expandedFolderIds.filter((folderId): folderId is string => Boolean(folderId)))
  return {
    ...ui,
    sidebarCollapsed: false,
    collapsedFolderIds:
      expandedIds.size > 0
        ? ui.collapsedFolderIds.filter((folderId) => !expandedIds.has(folderId))
        : ui.collapsedFolderIds,
  }
}

const THEME_LABELS: Record<AppTheme, string> = {
  dark: 'Dark',
  light: 'Light',
  cheese: 'Cheese',
  custom1: 'Custom 1',
  custom2: 'Custom 2',
  custom3: 'Custom 3',
}

function getVaultRowsFromStorageStatus(storageProfileStatus: StorageProfileStatus | null): KnownVault[] {
  const activeVaultPath = storageProfileStatus?.vaultPath ?? storageProfileStatus?.profileRootPath ?? ''
  const knownVaults = storageProfileStatus?.knownVaults ?? []
  if (knownVaults.length > 0) return knownVaults
  if (!storageProfileStatus || !activeVaultPath) return []
  return [{
    vaultId: storageProfileStatus.activeVaultId ?? undefined,
    vaultPath: activeVaultPath,
    vaultName: storageProfileStatus.vaultName || 'Vault',
    isActive: true,
    exists: storageProfileStatus.hasProfile,
    hasManifest: storageProfileStatus.hasProfile,
    available: storageProfileStatus.hasProfile,
  }]
}

const ACTIVE_TOOLBAR_LAYOUT_STORAGE_KEY = 'aislenote:vault-active-toolbar-layout:v1'
const TAG_AUTOCOMPLETE_RECENT_STORAGE_KEY = 'aislenote:tag-autocomplete-recent:v1'
const VAULT_SETUP_APP_NAME = 'AisleNote'
const VAULT_SETUP_LOGO_SRC = './favicon.svg'
const CLOSED_NOTE_TAB_HISTORY_LIMIT = 20
const VAULT_NAVIGATION_TIMING_DIAGNOSTIC_THRESHOLD_MS = 50
const VAULT_NAVIGATION_TIMING_WARNING_THRESHOLD_MS = 100
const VAULT_NAVIGATION_FOCUS_TIMING_DIAGNOSTIC_THRESHOLD_MS = 16
const VAULT_FRONTMATTER_TIMING_DIAGNOSTIC_THRESHOLD_MS = 16
const VAULT_FRONTMATTER_TIMING_WARNING_THRESHOLD_MS = 100

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
  { id: 'transfer', label: 'Import' },
  { id: 'storage', label: 'Vaults' },
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
  { id: 'toggleNotesScratchpad', label: 'Toggle scratchpad' },
  { id: 'newNote', label: 'New note' },
  { id: 'newFolder', label: 'New folder' },
  { id: 'closeCurrentNote', label: 'Close current note' },
  { id: 'cyclePinnedNoteTabNext', label: 'Next pinned note tab' },
  { id: 'cyclePinnedNoteTabPrev', label: 'Previous pinned note tab' },
  { id: 'reopenClosedNoteTab', label: 'Reopen closed note tab' },
  { id: 'formatStrikethrough', label: 'Strikethrough' },
  { id: 'formatHighlight', label: 'Highlight' },
  { id: 'pastePlainText', label: 'Paste as plain text' },
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
const TAB_COLOR_INDICATOR_PLACEMENT_OPTIONS: Array<{ id: TabColorIndicatorPlacement; label: string }> = [
  { id: 'bottom', label: 'Bottom' },
  { id: 'top', label: 'Top' },
]

const VAULT_TREE_SORT_OPTIONS: Array<{ id: TabSortMode; label: string }> = [
  { id: 'alpha-asc', label: 'Name ascending' },
  { id: 'alpha-desc', label: 'Name descending' },
  { id: 'updated-asc', label: 'Modified ascending' },
  { id: 'updated-desc', label: 'Modified descending' },
  { id: 'created-asc', label: 'Created ascending' },
  { id: 'created-desc', label: 'Created descending' },
]

const SETTINGS_SECTION_SET = new Set<SettingsSection>(SETTINGS_SECTION_TABS.map((tab) => tab.id))
const DATA_SECTION_SET = new Set<DataSettingsSection>(DATA_SECTION_TABS.map((tab) => tab.id))

function getVaultAppPerfNow(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

function roundVaultAppDiagnosticMs(durationMs: number): number {
  return Math.round(durationMs * 10) / 10
}

function recordVaultNavigationTiming(
  event: string,
  durationMs: number,
  details: Record<string, unknown>,
  thresholdMs = VAULT_NAVIGATION_TIMING_DIAGNOSTIC_THRESHOLD_MS,
): void {
  if (durationMs < thresholdMs) return
  recordDiagnosticEvent('navigation', event, {
    level: durationMs >= VAULT_NAVIGATION_TIMING_WARNING_THRESHOLD_MS ? 'warning' : 'info',
    durationMs: roundVaultAppDiagnosticMs(durationMs),
    details,
  })
}

function recordVaultFrontmatterTiming(
  event: string,
  durationMs: number,
  details: Record<string, unknown>,
  thresholdMs = VAULT_FRONTMATTER_TIMING_DIAGNOSTIC_THRESHOLD_MS,
): void {
  if (durationMs < thresholdMs) return
  recordDiagnosticEvent('frontmatter', event, {
    level: durationMs >= VAULT_FRONTMATTER_TIMING_WARNING_THRESHOLD_MS ? 'warning' : 'info',
    durationMs: roundVaultAppDiagnosticMs(durationMs),
    details,
  })
}
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

function loadVaultActiveToolbarLayoutId(): string {
  try {
    return window.localStorage?.getItem(ACTIVE_TOOLBAR_LAYOUT_STORAGE_KEY)?.trim() || DEFAULT_TOOLBAR_LAYOUT_ID
  } catch {
    return DEFAULT_TOOLBAR_LAYOUT_ID
  }
}

function saveVaultActiveToolbarLayoutId(layoutId: string): void {
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

function getVaultItemDisplayTitle(item: VaultTreeItem): string {
  return item.title.trim() || 'Untitled'
}

function getDeletedVaultNoteMarkdown(entry: DeletedVaultItem, state: AppState): string {
  const item = entry.item
  if (item.type !== 'note') return ''
  const noteBody = state.noteBodies.find((body) => body.id === item.noteBodyId)
  const resolved = resolveNoteBody(noteBody, state.noteAisleBodies)
  return resolved?.aisles.map((aisle) => aisle.markdown).join('\n\n') ?? ''
}

type ActiveNoteModel = {
  kind: 'note'
  noteId: string
  title: string
  noteBody: NoteBody
  resolved: NonNullable<ReturnType<typeof resolveNoteBody>>
  linked: boolean
  folderPath: string
}

type ActiveScratchpadModel = {
  kind: 'scratchpad'
  noteId: typeof SCRATCHPAD_CONTENT_TARGET_ID
  title: string
  noteBody: NoteBody
  resolved: NonNullable<ReturnType<typeof resolveNoteBody>>
  linked: false
  folderPath: ''
}

type ActiveEditorModel = ActiveNoteModel | ActiveScratchpadModel

type VaultAisleContextMenuState = {
  x: number
  y: number
  aisleId: string
}

type VaultShortcutMenuState = {
  aisleId: string
  top: number
  left: number
  activeIndex: number
}

export type VaultFrontmatterModalState = {
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

type FrontmatterTemplateImportTarget = {
  templateId: string
  templateName: string
}

const FRONTMATTER_TEMPLATE_FIELD_DRAG_MIME = 'application/x-aislenote-frontmatter-template-field'
const FRONTMATTER_ROW_DRAG_MIME = 'application/x-aislenote-frontmatter-row'
const VAULT_NOTE_ACTION_PICKER_MAX_WIDTH = 520
const VAULT_NOTE_ACTION_PICKER_VIEWPORT_GUTTER = 14
const FRONTMATTER_NOTE_MODAL_MAX_WIDTH = 960
const FRONTMATTER_NOTE_MODAL_CONTENT_GUTTER = 16

type FrontmatterListDropRect = {
  index: number
  top: number
  bottom: number
}

function clampOverlayCoordinate(value: number, min: number, max: number): number {
  if (max < min) return value
  return Math.max(min, Math.min(max, value))
}

function readCssPixelValue(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function getElementVerticalBorderHeight(element: HTMLElement): number {
  const styles = window.getComputedStyle(element)
  return readCssPixelValue(styles.borderTopWidth) + readCssPixelValue(styles.borderBottomWidth)
}

function getUtilityHeaderObservedHeight(header: HTMLElement): number {
  const styles = window.getComputedStyle(header)
  const contentHeight = Array.from(header.children).reduce((height, child) => {
    return child instanceof HTMLElement
      ? Math.max(height, child.getBoundingClientRect().height)
      : height
  }, 0)
  return Math.ceil(
    contentHeight +
      readCssPixelValue(styles.paddingTop) +
      readCssPixelValue(styles.paddingBottom) +
      readCssPixelValue(styles.borderTopWidth) +
      readCssPixelValue(styles.borderBottomWidth),
  )
}

function readObservedVaultTopbarHeight(shell: HTMLElement): number {
  const toolbarInner = shell.querySelector<HTMLElement>(
    '.note-aisles-shell > .note-shared-toolbar .app-shared-editor-toolbar',
  )
  const toolbarHeight = toolbarInner
    ? Math.ceil(
        toolbarInner.getBoundingClientRect().height +
          getElementVerticalBorderHeight(toolbarInner.closest<HTMLElement>('.note-shared-toolbar') ?? toolbarInner),
      )
    : 0
  const utilityHeader = shell.querySelector<HTMLElement>('.vault-utility-header')
  const utilityHeaderHeight = utilityHeader ? getUtilityHeaderObservedHeight(utilityHeader) : 0
  return Math.max(toolbarHeight, utilityHeaderHeight)
}

function getAislePaneRect(workspaceRoot: HTMLElement | null, aisleId: string): DOMRect | null {
  if (!workspaceRoot || !aisleId) return null
  const pane = Array.from(workspaceRoot.querySelectorAll<HTMLElement>('.note-aisle-pane'))
    .find((candidate) => candidate.dataset.aisleId === aisleId)
  return pane?.getBoundingClientRect() ?? null
}

function getCenteredAisleViewportLeft(workspaceRoot: HTMLElement | null, aisleId: string): number | null {
  const rect = getAislePaneRect(workspaceRoot, aisleId)
  if (!rect || rect.width <= 0) return null
  return rect.left + rect.width / 2
}

function getNoteContentViewportRect(workspaceRoot: HTMLElement | null): VaultNoteActionPickerViewportRect | null {
  const contentRegion = workspaceRoot?.querySelector<HTMLElement>('.note-content-region') ?? null
  const rect = contentRegion?.getBoundingClientRect()
  if (!rect || rect.width <= 0 || rect.height <= 0) return null
  return {
    top: Math.round(rect.top),
    left: Math.round(rect.left),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  }
}

function areViewportRectsEqual(
  a: VaultNoteActionPickerViewportRect | null,
  b: VaultNoteActionPickerViewportRect | null,
): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height
}

function getAisleCenteredNoteActionPickerAnchor(
  workspaceRoot: HTMLElement | null,
  aisleId: string,
  cursorAnchor: VaultNoteActionPickerAnchor | null,
): VaultNoteActionPickerAnchor | null {
  if (typeof window === 'undefined') return cursorAnchor
  const fallbackTop = Math.max(72, Math.min(160, window.innerHeight * 0.16))
  const pickerWidth = Math.min(VAULT_NOTE_ACTION_PICKER_MAX_WIDTH, Math.max(0, window.innerWidth - VAULT_NOTE_ACTION_PICKER_VIEWPORT_GUTTER * 2))
  const minLeft = VAULT_NOTE_ACTION_PICKER_VIEWPORT_GUTTER + pickerWidth / 2
  const maxLeft = window.innerWidth - VAULT_NOTE_ACTION_PICKER_VIEWPORT_GUTTER - pickerWidth / 2
  const rawLeft = getCenteredAisleViewportLeft(workspaceRoot, aisleId) ?? cursorAnchor?.left ?? window.innerWidth / 2
  return {
    top: fallbackTop,
    left: clampOverlayCoordinate(rawLeft, minLeft, maxLeft),
  }
}

function getFrontmatterNoteModalStyle(
  workspaceRoot: HTMLElement | null,
  aisleId: string,
  noteContentViewportRect: VaultNoteActionPickerViewportRect | null,
): CSSProperties | undefined {
  const contentRect = noteContentViewportRect ?? getNoteContentViewportRect(workspaceRoot)
  if (!contentRect || contentRect.width <= 0) return undefined

  const aisleViewportLeft = getCenteredAisleViewportLeft(workspaceRoot, aisleId)
  const rawLeft = aisleViewportLeft === null ? contentRect.width / 2 : aisleViewportLeft - contentRect.left
  const modalWidth = Math.min(FRONTMATTER_NOTE_MODAL_MAX_WIDTH, Math.max(0, contentRect.width - FRONTMATTER_NOTE_MODAL_CONTENT_GUTTER * 2))
  const minLeft = FRONTMATTER_NOTE_MODAL_CONTENT_GUTTER + modalWidth / 2
  const maxLeft = contentRect.width - FRONTMATTER_NOTE_MODAL_CONTENT_GUTTER - modalWidth / 2
  const left = clampOverlayCoordinate(rawLeft, minLeft, maxLeft)
  return {
    '--frontmatter-note-modal-left': `${left}px`,
    '--frontmatter-note-modal-width': `${modalWidth}px`,
  } as CSSProperties
}

function readFrontmatterListDropRects(container: HTMLElement | null, rowSelector: string): FrontmatterListDropRect[] {
  return Array.from(container?.querySelectorAll<HTMLElement>(rowSelector) ?? []).map((element, index) => {
    const rect = element.getBoundingClientRect()
    return {
      index,
      top: rect.top,
      bottom: rect.bottom,
    }
  })
}

function getFrontmatterListDropIndexFromPointer(
  rects: FrontmatterListDropRect[],
  pointerY: number,
  itemCount: number,
): number {
  const boundedItemCount = Math.max(0, itemCount)
  const itemRects = rects.slice(0, boundedItemCount)
  if (boundedItemCount === 0 || itemRects.length === 0) return 0

  for (const rect of itemRects) {
    const midpoint = rect.top + (rect.bottom - rect.top) / 2
    if (pointerY < midpoint) return rect.index
  }

  return boundedItemCount
}

type NoteActionPickerSource = 'mention' | 'toolbar-link' | 'context-note-link' | 'context-note-preview' | 'whole-note-copy'

type NoteActionPickerState = {
  source: NoteActionPickerSource
  title: string
  query: string
  actions: VaultNoteActionPickerAction[]
  mentionRange?: NoteMentionQuery
  insertRange?: LinkPromptState['editRange']
  anchor?: VaultNoteActionPickerAnchor | null
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
  const notePath = findVaultNote(state.vault.items, state.vault.activeNoteId)
  const fallbackNote = notePath?.note ?? getFirstVaultNote(state.vault.items)
  if (!fallbackNote) return null
  const noteBody = state.noteBodies.find((body) => body.id === fallbackNote.noteBodyId)
  const resolved = resolveNoteBody(noteBody, state.noteAisleBodies)
  if (!noteBody || !resolved) return null
  const folderPath = getVaultNoteFolderPath(state.vault.items, fallbackNote.id)
    .map((segment) => segment.title)
    .join(' / ')
  return {
    kind: 'note',
    noteId: fallbackNote.id,
    title: fallbackNote.title,
    noteBody,
    resolved,
    linked: isNoteBodyLinked(state.vault.items, fallbackNote.noteBodyId),
    folderPath,
  }
}

function getScratchpadEditorModel(state: AppState): ActiveScratchpadModel | null {
  const noteBody = getScratchpadNoteBody(state)
  const resolved = resolveScratchpadNoteBody(state)
  if (!noteBody || !resolved) return null
  return {
    kind: 'scratchpad',
    noteId: SCRATCHPAD_CONTENT_TARGET_ID,
    title: 'Scratchpad',
    noteBody,
    resolved,
    linked: false,
    folderPath: '',
  }
}

function getActiveEditorModel(state: AppState, scratchpadActive: boolean): ActiveEditorModel | null {
  return scratchpadActive ? getScratchpadEditorModel(state) ?? getActiveNoteModel(state) : getActiveNoteModel(state)
}

function getPreferredVaultAisleId(
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

function collectDeletedNoteBodyIds(item: VaultTreeItem, ids = new Set<string>()): Set<string> {
  if (item.type === 'note') {
    ids.add(item.noteBodyId)
    return ids
  }
  item.children.forEach((child) => collectDeletedNoteBodyIds(child, ids))
  return ids
}

function getReferencedNoteBodyIds(items: VaultTreeItem[], ids = new Set<string>()): Set<string> {
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
  const visibleBodyIds = getReferencedNoteBodyIds(state.vault.items)
  state.vault.deletedItems.forEach((entry) => collectDeletedNoteBodyIds(entry.item, visibleBodyIds))
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

const VAULT_TREE_RENAME_LONG_PRESS_MS = 500
const VAULT_TREE_LONG_PRESS_MOVE_TOLERANCE_PX = 6
const SHORTCUT_MENU_ESTIMATED_WIDTH = 256
const SHORTCUT_MENU_ESTIMATED_VERTICAL_PADDING = 16
const SHORTCUT_MENU_ESTIMATED_ITEM_HEIGHT = 36

type VaultTreeDropPosition = 'before' | 'after' | 'inside' | 'root'

type VaultTreeDropTarget = {
  parentFolderId: string | null
  index: number
  targetItemId: string | null
  position: VaultTreeDropPosition
}

type VaultTreeContextMenuState =
  | {
      kind: 'root'
      x: number
      y: number
    }
  | {
      kind: 'item'
      x: number
      y: number
      itemId: string
      itemType: VaultTreeItem['type']
      itemTitle: string
    }

type VaultTreeNoteSelectionMode = 'replace' | 'toggle' | 'range'
type VaultTreeRenameCommitSource = 'enter' | 'blur' | 'tab'
type VaultRenameSurface = 'tree' | 'tab'

function getVaultTreeContextDeleteNoteIds(
  menu: VaultTreeContextMenuState | null,
  selectedNoteIds: string[],
  visibleNoteIds: string[],
): string[] {
  if (!menu || menu.kind !== 'item' || menu.itemType !== 'note') return []
  if (!selectedNoteIds.includes(menu.itemId)) return [menu.itemId]
  const selectedNoteIdSet = new Set(selectedNoteIds)
  const noteIds = visibleNoteIds.filter((noteId) => selectedNoteIdSet.has(noteId))
  return noteIds.length > 0 ? noteIds : [menu.itemId]
}

function getVaultTreeContextDeleteLabel(menu: VaultTreeContextMenuState | null, deleteNoteCount: number): string {
  if (menu?.kind === 'item' && menu.itemType === 'folder') return 'Delete folder'
  return deleteNoteCount > 1 ? 'Delete notes' : 'Delete note'
}

type VaultTreeFlatRow = {
  item: VaultTreeItem
  depth: number
  parentFolderId: string | null
  index: number
}

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

type VaultNameDialogState =
  | {
      mode: 'create'
      initialName: string
    }
  | {
      mode: 'rename'
      initialName: string
      vault: KnownVault
    }

function getVaultMenuViewportSize(): MenuViewport {
  if (typeof window === 'undefined') return { width: 0, height: 0 }
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  }
}

function getVaultMenuElementSize(element: HTMLElement): MenuSize {
  const rect = element.getBoundingClientRect()
  return {
    width: rect.width,
    height: rect.height,
  }
}

function toVaultMenuRect(rect: DOMRect): MenuRect {
  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
    right: rect.right,
    bottom: rect.bottom,
  }
}

export function getVaultSidebarRevealLabel(platform: string | undefined): string {
  const normalizedPlatform = String(platform ?? '').toLowerCase()
  if (normalizedPlatform === 'darwin' || normalizedPlatform.includes('mac')) return 'Reveal in Finder'
  if (normalizedPlatform === 'win32' || normalizedPlatform.includes('win')) return 'Show in File Explorer'
  return 'Show in Files'
}

function getVaultTreeDropTargetFromEvent(
  event: ReactDragEvent<HTMLElement>,
  item: VaultTreeItem,
  parentFolderId: string | null,
  index: number,
): VaultTreeDropTarget {
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

function areVaultTreeDropTargetsEqual(left: VaultTreeDropTarget | null, right: VaultTreeDropTarget | null): boolean {
  return (
    left?.parentFolderId === right?.parentFolderId &&
    left?.index === right?.index &&
    left?.targetItemId === right?.targetItemId &&
    left?.position === right?.position
  )
}

function getVisibleVaultTreeNoteIds(items: VaultTreeItem[], collapsedFolderIds: Set<string>): string[] {
  const noteIds: string[] = []
  items.forEach((item) => {
    if (item.type === 'note') {
      noteIds.push(item.id)
      return
    }
    if (!collapsedFolderIds.has(item.id)) {
      noteIds.push(...getVisibleVaultTreeNoteIds(item.children, collapsedFolderIds))
    }
  })
  return noteIds
}

function vaultTreeItemContainsNoteId(item: VaultTreeItem, noteId: string): boolean {
  if (!noteId) return false
  if (item.type === 'note') return item.id === noteId
  return item.children.some((child) => vaultTreeItemContainsNoteId(child, noteId))
}

function deletedVaultItemsContainNoteId(items: VaultTreeItem[], itemIds: string[], noteId: string): boolean {
  if (!noteId) return false
  return itemIds.some((itemId) => {
    const entry = findVaultItem(items, itemId)
    return entry ? vaultTreeItemContainsNoteId(entry.item, noteId) : false
  })
}

function flattenVisibleVaultTreeRows(
  items: VaultTreeItem[],
  collapsedFolderIds: Set<string>,
  query: string,
  depth = 0,
  parentFolderId: string | null = null,
): VaultTreeFlatRow[] {
  const rows: VaultTreeFlatRow[] = []
  const normalizedQuery = query.trim().toLocaleLowerCase()
  items.forEach((item, index) => {
    if (item.type === 'note' && normalizedQuery && !item.title.toLocaleLowerCase().includes(normalizedQuery)) return
    rows.push({
      item,
      depth,
      parentFolderId,
      index,
    })
    if (item.type === 'folder' && !collapsedFolderIds.has(item.id)) {
      rows.push(...flattenVisibleVaultTreeRows(item.children, collapsedFolderIds, query, depth + 1, item.id))
    }
  })
  return rows
}

function getVaultTreeRangeNoteIds(noteIds: string[], anchorNoteId: string, targetNoteId: string): string[] {
  const targetIndex = noteIds.indexOf(targetNoteId)
  if (targetIndex < 0) return [targetNoteId]
  const anchorIndex = noteIds.indexOf(anchorNoteId)
  if (anchorIndex < 0) return [targetNoteId]
  const startIndex = Math.min(anchorIndex, targetIndex)
  const endIndex = Math.max(anchorIndex, targetIndex)
  return noteIds.slice(startIndex, endIndex + 1)
}

function VaultTreeContextMenuButton({
  children,
  className = '',
  onClick,
}: {
  children: React.ReactNode
  className?: string
  onClick: () => void
}) {
  return (
    <button type="button" className={`tab-context-delete ${className}`.trim()} onClick={onClick}>
      {children}
    </button>
  )
}

function VaultTreeContextMenuSeparator() {
  return <div className="tab-context-separator" role="separator" />
}

function VaultTreeContextSubMenu({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [panelPosition, setPanelPosition] = useState<MenuPosition>({ left: -9999, top: -9999 })

  const updatePanelPosition = useCallback(() => {
    const trigger = triggerRef.current
    const panel = panelRef.current
    if (!trigger || !panel) return
    setPanelPosition(
      getSubmenuPosition(
        toVaultMenuRect(trigger.getBoundingClientRect()),
        getVaultMenuElementSize(panel),
        getVaultMenuViewportSize(),
      ),
    )
  }, [])

  return (
    <div className="tab-context-submenu" onPointerEnter={updatePanelPosition} onFocus={updatePanelPosition}>
      <button
        ref={triggerRef}
        type="button"
        className="tab-context-delete tab-context-submenu-trigger"
        aria-haspopup="menu"
      >
        {label}
        <span aria-hidden="true">›</span>
      </button>
      <div
        ref={panelRef}
        className="tab-context-submenu-panel"
        role="menu"
        style={{ top: `${panelPosition.top}px`, left: `${panelPosition.left}px` }}
      >
        {children}
      </div>
    </div>
  )
}

function VaultTreeContextMenu({
  menu,
  revealLabel,
  canReveal,
  deleteLabel,
  onClose,
  onCreateNote,
  onCreateFolder,
  onSort,
  onReveal,
  onRename,
  onDelete,
}: {
  menu: VaultTreeContextMenuState | null
  revealLabel: string
  canReveal: boolean
  deleteLabel: string
  onClose: () => void
  onCreateNote: () => void
  onCreateFolder: () => void
  onSort: (sortMode: TabSortMode) => void
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
          element ? getVaultMenuElementSize(element) : { width: 0, height: 0 },
          getVaultMenuViewportSize(),
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
  const isItemMenu = menu.kind === 'item'

  return (
    <div
      ref={rootRef}
      className="tab-context-menu"
      role="menu"
      style={{ top: `${rootPosition.top}px`, left: `${rootPosition.left}px` }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <VaultTreeContextMenuButton onClick={() => runAction(onCreateNote)}>
        New note
      </VaultTreeContextMenuButton>
      <VaultTreeContextMenuButton onClick={() => runAction(onCreateFolder)}>
        New folder
      </VaultTreeContextMenuButton>
      <VaultTreeContextSubMenu label="Sort">
        {VAULT_TREE_SORT_OPTIONS.map((option) => (
          <VaultTreeContextMenuButton key={option.id} onClick={() => runAction(() => onSort(option.id))}>
            {option.label}
          </VaultTreeContextMenuButton>
        ))}
      </VaultTreeContextSubMenu>
      {isItemMenu ? (
        <>
          <VaultTreeContextMenuSeparator />
          <VaultTreeContextMenuButton onClick={() => runAction(onRename)}>
            Rename
          </VaultTreeContextMenuButton>
          <VaultTreeContextMenuButton onClick={() => runAction(onDelete)}>
            {deleteLabel}
          </VaultTreeContextMenuButton>
          <button
            type="button"
            className={`tab-context-delete ${canReveal ? '' : 'is-disabled'}`.trim()}
            aria-disabled={canReveal ? undefined : 'true'}
            disabled={!canReveal}
            onClick={() => runAction(onReveal)}
          >
            {revealLabel}
          </button>
        </>
      ) : null}
    </div>
  )
}

function TreeItemRow({
  item,
  depth,
  parentFolderId,
  index,
  activeFolderId,
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
  onOpenNoteRetained,
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
  renderChildren = true,
}: {
  item: VaultTreeItem
  depth: number
  parentFolderId: string | null
  index: number
  activeFolderId: string
  activeNoteId: string
  renamingItemId: string
  renameDraft: string
  draggingItemId: string
  draggingNoteIds: Set<string>
  selectedNoteIds: Set<string>
  createdRenameItemId: string
  dropTarget: VaultTreeDropTarget | null
  collapsedFolderIds: Set<string>
  query: string
  onSelectNote: (noteId: string, mode: VaultTreeNoteSelectionMode) => void
  onOpenNoteRetained: (noteId: string) => void
  onSelectFolder: (folderId: string) => void
  onToggleFolder: (folderId: string) => void
  onStartRename: (itemId: string, title: string) => void
  onRenameDraftChange: (title: string) => void
  onCommitRename: (source: VaultTreeRenameCommitSource) => void
  onCancelRename: () => void
  onOpenContextMenu: (menu: VaultTreeContextMenuState) => void
  onDragItemStart: (itemId: string) => void
  onDragItemEnd: () => void
  onUpdateDropTarget: (target: VaultTreeDropTarget | null) => void
  onDropItem: (target: VaultTreeDropTarget) => void
  renderChildren?: boolean
}) {
  const isFolder = item.type === 'folder'
  const collapsed = isFolder && collapsedFolderIds.has(item.id)
  const children = isFolder ? item.children : []
  const folderIconId = isFolder && !collapsed && children.length > 0 ? 'folderOpen' : 'folder'
  const activeNote = item.type === 'note' && item.id === activeNoteId
  const active = (item.type === 'folder' && item.id === activeFolderId) || activeNote
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
    }, VAULT_TREE_RENAME_LONG_PRESS_MS)
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
      Math.abs(event.clientX - pending.startX) > VAULT_TREE_LONG_PRESS_MOVE_TOLERANCE_PX ||
      Math.abs(event.clientY - pending.startY) > VAULT_TREE_LONG_PRESS_MOVE_TOLERANCE_PX
    if (moved) clearLongPress()
  }

  const finishLongPressRename = (event: ReactPointerEvent<HTMLElement>) => {
    if (longPressRef.current?.pointerId === event.pointerId) clearLongPress()
  }

  const handleDragStart = (event: ReactDragEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target : null
    if (renaming || target?.closest('.vault-tree-rename-input')) {
      event.preventDefault()
      return
    }
    clearLongPress()
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('application/x-aislenote-vault-item', item.id)
    if (item.type === 'note') {
      const noteIds = selectedNoteIds.has(item.id) ? Array.from(selectedNoteIds) : [item.id]
      event.dataTransfer.setData('application/x-aislenote-vault-note-ids', JSON.stringify(noteIds))
    }
    event.dataTransfer.setData('text/plain', item.id)
    onDragItemStart(item.id)
  }

  const handleDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!draggingItemId || draggingItemId === item.id || draggingNoteIds.has(item.id)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    onUpdateDropTarget(getVaultTreeDropTargetFromEvent(event, item, parentFolderId, index))
  }

  const handleDragLeave = (event: ReactDragEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    if (dropTarget?.targetItemId === item.id) onUpdateDropTarget(null)
  }

  const handleDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!draggingItemId || draggingItemId === item.id || draggingNoteIds.has(item.id)) return
    event.preventDefault()
    event.stopPropagation()
    onDropItem(getVaultTreeDropTargetFromEvent(event, item, parentFolderId, index))
  }

  if (!titleMatches && !isFolder) return null

  return (
    <>
      <div
        className={[
          'vault-tree-row',
          `is-${item.type}`,
          active ? 'is-active' : '',
          selected ? 'is-selected' : '',
          renaming ? 'is-renaming' : '',
          draggingItemId === item.id || draggingNoteIds.has(item.id) ? 'is-dragging' : '',
          dropPosition === 'before' ? 'is-drop-before' : '',
          dropPosition === 'after' ? 'is-drop-after' : '',
          dropPosition === 'inside' ? 'is-drop-inside' : '',
        ].filter(Boolean).join(' ')}
        data-vault-tree-item-id={item.id}
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
            kind: 'item',
            x: event.clientX,
            y: event.clientY,
            itemId: item.id,
            itemType: item.type,
            itemTitle: item.title,
          })
        }}
      >
        {renaming ? (
          <div className="vault-tree-main is-renaming">
            {isFolder ? (
              <span className="vault-tree-folder-icon" aria-hidden="true">
                <AppIcon iconId={folderIconId} className="vault-tree-folder-icon-svg" />
              </span>
            ) : null}
            <input
              className="vault-tree-rename-input"
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
            className="vault-tree-main"
            type="button"
            onPointerDown={beginLongPressRename}
            onPointerMove={updateLongPressRename}
            onPointerUp={finishLongPressRename}
            onPointerCancel={finishLongPressRename}
            onPointerLeave={finishLongPressRename}
            onMouseDown={(event) => {
              if (item.type !== 'note' || event.button !== 1) return
              event.preventDefault()
              event.stopPropagation()
              clearLongPress()
              onOpenNoteRetained(item.id)
            }}
            onAuxClick={(event) => {
              if (item.type !== 'note' || event.button !== 1) return
              event.preventDefault()
              event.stopPropagation()
            }}
            onDoubleClick={(event) => {
              if (item.type !== 'note' || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
                return
              }
              event.preventDefault()
              event.stopPropagation()
              clearLongPress()
              onOpenNoteRetained(item.id)
            }}
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
              <span className="vault-tree-folder-icon" aria-hidden="true">
                <AppIcon iconId={folderIconId} className="vault-tree-folder-icon-svg" />
              </span>
            ) : null}
            <span className="vault-tree-title">{item.title}</span>
          </button>
        )}
      </div>
      {renderChildren && isFolder && !collapsed ? (
        <div className="vault-tree-children" role="group" style={{ '--tree-depth': depth } as CSSProperties}>
          {children.map((child, childIndex) => (
            <MemoizedTreeItemRow
              key={child.id}
              item={child}
              depth={depth + 1}
              parentFolderId={item.id}
              index={childIndex}
              activeFolderId={activeFolderId}
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
              onOpenNoteRetained={onOpenNoteRetained}
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

const MemoizedTreeItemRow = React.memo(TreeItemRow)

function VaultAisleContextMenu({
  menu,
  canDecoupleAisle,
  onClose,
  onFilterSyncedAisle,
  onQuickDecoupleAisle,
  onShowSyncedAisle,
}: {
  menu: VaultAisleContextMenuState | null
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
        Filter synced aisle
      </button>
      <button
        type="button"
        className="tab-context-delete"
        onClick={() => runAction(onQuickDecoupleAisle)}
      >
        Decouple aisle
      </button>
      <button
        type="button"
        className="tab-context-delete"
        onClick={() => runAction(onShowSyncedAisle)}
      >
        Show synced aisles
      </button>
    </div>
  )
}

export function VaultFrontmatterModal({
  modal,
  modalStyle,
  templates,
  onCancel,
  onChange,
  onSave,
  onSelectAisle,
  onSelectTemplate,
  onToggleTemplateDerived,
  onEditTemplate,
  onFilterTemplate,
  onCopyFrontmatter,
}: {
  modal: VaultFrontmatterModalState | null
  modalStyle?: CSSProperties
  templates: FrontmatterTemplate[]
  onCancel: () => void
  onChange: (modal: VaultFrontmatterModalState) => void
  onSave: (modal: VaultFrontmatterModalState) => string[] | string | null
  onSelectAisle: (modal: VaultFrontmatterModalState, aisleId: string) => VaultFrontmatterModalState | string | null
  onSelectTemplate: (modal: VaultFrontmatterModalState, templateId: string) => VaultFrontmatterModalState
  onToggleTemplateDerived: (modal: VaultFrontmatterModalState, templateDerived: boolean) => VaultFrontmatterModalState
  onEditTemplate: (templateId: string) => void
  onFilterTemplate: (modal: VaultFrontmatterModalState) => void
  onCopyFrontmatter: (modal: VaultFrontmatterModalState) => Promise<string | null>
}) {
  const [error, setError] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const frontmatterRowListRef = useRef<HTMLDivElement | null>(null)
  const frontmatterRowRectsRef = useRef<FrontmatterListDropRect[]>([])
  const frontmatterRowDragIdRef = useRef('')
  const frontmatterRowDropIndexRef = useRef<number | null>(null)
  const [draggingFrontmatterRowId, setDraggingFrontmatterRowId] = useState('')
  const [frontmatterRowDropIndex, setFrontmatterRowDropIndex] = useState<number | null>(null)
  const clearFrontmatterRowDrag = () => {
    frontmatterRowRectsRef.current = []
    frontmatterRowDragIdRef.current = ''
    frontmatterRowDropIndexRef.current = null
    setDraggingFrontmatterRowId('')
    setFrontmatterRowDropIndex(null)
  }

  useEffect(() => {
    if (!modal) return
    setError('')
    setWarnings([])
    clearFrontmatterRowDrag()
  }, [modal?.noteBodyId, modal?.aisleBodyId])

  if (!modal) return null

  const selectedTemplate = templates.find((template) => template.id === modal.selectedTemplateId) ?? null
  const updateModal = (nextModal: VaultFrontmatterModalState) => {
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
  const updateFrontmatterRowDropIndex = (nextIndex: number | null) => {
    if (frontmatterRowDropIndexRef.current === nextIndex) return
    frontmatterRowDropIndexRef.current = nextIndex
    setFrontmatterRowDropIndex(nextIndex)
  }
  const readFrontmatterRowDragId = (event: ReactDragEvent<HTMLElement>) =>
    frontmatterRowDragIdRef.current
    || draggingFrontmatterRowId
    || event.dataTransfer.getData(FRONTMATTER_ROW_DRAG_MIME)
  const refreshFrontmatterRowRects = () => {
    frontmatterRowRectsRef.current = readFrontmatterListDropRects(
      frontmatterRowListRef.current,
      '[data-frontmatter-row-id]',
    )
    return frontmatterRowRectsRef.current
  }
  const getFrontmatterRowDropIndex = (event: ReactDragEvent<HTMLElement>) => {
    const rects =
      frontmatterRowRectsRef.current.length === modal.rows.length
        ? frontmatterRowRectsRef.current
        : refreshFrontmatterRowRects()
    return getFrontmatterListDropIndexFromPointer(rects, event.clientY, modal.rows.length)
  }
  const updateFrontmatterRowDropTarget = (event: ReactDragEvent<HTMLElement>) => {
    const sourceRowId = readFrontmatterRowDragId(event)
    if (!sourceRowId) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    updateFrontmatterRowDropIndex(getFrontmatterRowDropIndex(event))
  }
  const dropFrontmatterRow = (event: ReactDragEvent<HTMLElement>) => {
    const sourceRowId = readFrontmatterRowDragId(event)
    const targetIndex = frontmatterRowDropIndexRef.current ?? getFrontmatterRowDropIndex(event)
    event.preventDefault()
    event.stopPropagation()
    clearFrontmatterRowDrag()
    if (!sourceRowId) return
    updateRows((rows) => reorderFrontmatterItemsByTargetIndex(rows, sourceRowId, targetIndex))
  }
  const copyFrontmatter = () => {
    void onCopyFrontmatter(modal).then((message) => {
      if (message) {
        setError(message)
        setWarnings([])
        return
      }
      setError('')
      setWarnings([])
    }).catch(() => {
      setError('Clipboard copy is unavailable here.')
      setWarnings([])
    })
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
    <div
      className="modal-backdrop vault-modal-backdrop frontmatter-note-modal-backdrop"
      role="presentation"
      onMouseDown={onCancel}
    >
      <section
        className="modal-card vault-frontmatter-modal frontmatter-note-modal"
        role="dialog"
        aria-label="Frontmatter"
        style={modalStyle}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-card-header">
          <h2>Frontmatter</h2>
          <div className="frontmatter-modal-header-actions">
            <button
              type="button"
              className="btn btn-sm settings-action-btn frontmatter-copy-btn"
              onClick={(event) => {
                copyFrontmatter()
                if (event.detail > 0) event.currentTarget.blur()
              }}
            >
              Copy FM
            </button>
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
        <div className="vault-frontmatter-body">
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
          <div
            ref={frontmatterRowListRef}
            className="frontmatter-row-editor"
            aria-label="frontmatter rows"
            onDragEnter={updateFrontmatterRowDropTarget}
            onDragOver={updateFrontmatterRowDropTarget}
            onDragLeave={(event) => {
              const relatedTarget = event.relatedTarget as Node | null
              if (relatedTarget && event.currentTarget.contains(relatedTarget)) return
              if (relatedTarget) updateFrontmatterRowDropIndex(null)
            }}
            onDrop={dropFrontmatterRow}
          >
            <div className="frontmatter-row frontmatter-row-header" aria-hidden="true">
              <span />
              <span>key</span>
              <span>type</span>
              <span>value</span>
              <span>computed</span>
              <span>derived</span>
              <span>action</span>
            </div>
            {modal.rows.length > 0 ? (
              modal.rows.map((row, index) => {
                const derivedTitle = row.derived && selectedTemplate ? selectedTemplate.name : undefined
                return (
                  <div
                    key={row.id}
                    data-frontmatter-row-id={row.id}
                    className={[
                      'frontmatter-row',
                      row.derived ? 'is-derived' : '',
                      isComputedLocked(row) ? 'is-locked' : '',
                      draggingFrontmatterRowId === row.id ? 'is-dragging' : '',
                      frontmatterRowDropIndex === index ? 'is-drop-index-before' : '',
                      frontmatterRowDropIndex === modal.rows.length && index === modal.rows.length - 1 ? 'is-drop-index-after' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    <button
                      type="button"
                      className="frontmatter-row-drag-handle"
                      aria-label={`Reorder ${row.key || 'frontmatter row'}`}
                      data-app-tooltip="Drag to reorder"
                      draggable
                      onDragStart={(event) => {
                        frontmatterRowDragIdRef.current = row.id
                        frontmatterRowRectsRef.current = refreshFrontmatterRowRects()
                        setDraggingFrontmatterRowId(row.id)
                        updateFrontmatterRowDropIndex(null)
                        event.dataTransfer.effectAllowed = 'move'
                        event.dataTransfer.setData(FRONTMATTER_ROW_DRAG_MIME, row.id)
                        event.dataTransfer.setData('text/plain', row.id)
                      }}
                      onDragEnd={clearFrontmatterRowDrag}
                    >
                      <AppIcon iconId="gripVertical" className="frontmatter-row-drag-icon" />
                    </button>
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
        {error ? <p className="vault-frontmatter-error">{error}</p> : null}
        {warnings.length > 0 ? (
          <div className="vault-frontmatter-warning-list">
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

function VaultSettingsSwitch({
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
    <div className="settings-hotkey-row vault-settings-switch-row">
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

function isSixDigitHexDraft(value: string): boolean {
  return /^#?[0-9a-f]{6}$/i.test(value.trim())
}

function CustomThemePaletteSlotRow({
  label,
  value,
  onPreviewChange,
  onCommit,
}: {
  label: string
  value: string
  onPreviewChange: (value: string) => void
  onCommit: (value: string) => void
}) {
  const [hexDraft, setHexDraft] = useState(value)

  useEffect(() => {
    setHexDraft(value)
  }, [value])

  const previewHexDraft = (rawValue: string): boolean => {
    const normalized = normalizeHexColor(rawValue)
    if (!normalized) return false
    setHexDraft(normalized)
    onPreviewChange(normalized)
    return true
  }

  const commitHexDraft = (rawValue: string): boolean => {
    const normalized = normalizeHexColor(rawValue)
    if (!normalized) return false
    setHexDraft(normalized)
    onCommit(normalized)
    return true
  }

  const handleHexDraftChange = (rawValue: string) => {
    setHexDraft(rawValue)
    if (isSixDigitHexDraft(rawValue)) previewHexDraft(rawValue)
  }

  const handleHexDraftBlur = () => {
    if (commitHexDraft(hexDraft)) return
    setHexDraft(value)
  }

  const handleHexDraftKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setHexDraft(value)
      event.currentTarget.blur()
      return
    }
    if (event.key !== 'Enter') return
    event.preventDefault()
    if (commitHexDraft(hexDraft)) return
    setHexDraft(value)
  }

  return (
    <div className="custom-theme-slot">
      <span className="custom-theme-slot-label">{label}</span>
      <input
        className="custom-theme-color-input"
        type="color"
        value={value}
        aria-label={`${label} color picker`}
        onChange={(event) => onPreviewChange(event.target.value)}
        onBlur={() => onCommit(value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          onCommit(value)
        }}
      />
      <input
        className="settings-text-input custom-theme-hex-input"
        type="text"
        value={hexDraft}
        spellCheck={false}
        inputMode="text"
        autoComplete="off"
        aria-label={`${label} hex value`}
        onChange={(event) => handleHexDraftChange(event.target.value)}
        onBlur={handleHexDraftBlur}
        onKeyDown={handleHexDraftKeyDown}
      />
    </div>
  )
}

const VISUALS_THEME_TOOLBAR_PREVIEW_GROUPS: ToolbarToolId[][] = [
  ['copy', 'frontmatter', 'tableOfContents', 'aisles', 'findReplace'],
  ['heading', 'bold', 'italic', 'highlight', 'strike'],
  ['taskList', 'table'],
]

function VaultThemeSettings({
  state,
  onMutateState,
}: {
  state: AppState
  onMutateState: (updater: (previous: AppState) => AppState) => void
}) {
  const selectedCustomTheme = state.ui.selectedCustomTheme ?? 'custom1'
  const committedPalette = getThemePaletteForTheme(state.theme, state.ui.themePalettes)
  const committedPaletteSignature = CUSTOM_THEME_PALETTE_SLOTS.map((slot) => committedPalette[slot]).join('|')
  const [draftPalette, setDraftPalette] = useState(committedPalette)
  const paletteCommitTimerRef = useRef<number | null>(null)
  const canCopyActiveThemeToSelectedCustomPalette = state.theme !== selectedCustomTheme
  const [themeJsonMode, setThemeJsonMode] = useState<'import' | 'export' | null>(null)
  const [themeJsonDraft, setThemeJsonDraft] = useState('')
  const [themeJsonStatus, setThemeJsonStatus] = useState('')
  const noteFontScale = clampNoteFontScale(state.ui.noteFontScale)
  const defaultToolbarButtonScale = DEFAULT_UI_SETTINGS.toolbarButtonScale ?? 1.2
  const toolbarButtonScale = clampToolbarButtonScale(state.ui.toolbarButtonScale ?? defaultToolbarButtonScale)
  const previewScaleStyle = {
    ...getThemePaletteVariables({
      theme: state.theme,
      ui: {
        themePalettes: {
          ...(state.ui.themePalettes ?? {}),
          [state.theme]: draftPalette,
        },
      },
    }),
    '--note-font-scale': String(noteFontScale),
    '--toolbar-button-scale': String(toolbarButtonScale),
  } as CSSProperties

  const clearPaletteCommitTimer = () => {
    if (paletteCommitTimerRef.current === null) return
    window.clearTimeout(paletteCommitTimerRef.current)
    paletteCommitTimerRef.current = null
  }

  const commitThemePalette = (themeId: AppTheme, palette: typeof committedPalette) => {
    clearPaletteCommitTimer()
    onMutateState((previous) => ({
      ...previous,
      ui: {
        ...previous.ui,
        themePalettes: {
          ...(previous.ui.themePalettes ?? {}),
          [themeId]: normalizeCustomThemePalette(palette, getCustomThemePaletteSeed(themeId)),
        },
      },
    }))
  }

  const scheduleThemePaletteCommit = (themeId: AppTheme, palette: typeof committedPalette) => {
    clearPaletteCommitTimer()
    paletteCommitTimerRef.current = window.setTimeout(() => {
      paletteCommitTimerRef.current = null
      commitThemePalette(themeId, palette)
    }, 300)
  }

  useEffect(() => {
    setDraftPalette(committedPalette)
    // The palette helper returns a fresh object each render; sync drafts on value signature changes only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committedPaletteSignature, state.theme])

  useEffect(() => () => {
    clearPaletteCommitTimer()
  }, [])

  const updateTheme = (theme: AppTheme) => {
    commitThemePalette(state.theme, draftPalette)
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
      ui: {
        ...previous.ui,
        selectedCustomTheme: themeId,
      },
    }))
  }

  const updatePaletteSlot = (slot: CustomThemePaletteSlot, value: string) => {
    const themeId = state.theme
    const nextPalette = normalizeCustomThemePalette(
      {
        ...draftPalette,
        [slot]: value,
      },
      getCustomThemePaletteSeed(themeId),
    )
    setDraftPalette(nextPalette)
    scheduleThemePaletteCommit(themeId, nextPalette)
  }

  const commitPaletteSlot = (slot: CustomThemePaletteSlot, value: string) => {
    const themeId = state.theme
    const nextPalette = normalizeCustomThemePalette(
      {
        ...draftPalette,
        [slot]: value,
      },
      getCustomThemePaletteSeed(themeId),
    )
    setDraftPalette(nextPalette)
    commitThemePalette(themeId, nextPalette)
  }

  const resetSelectedPalette = () => {
    const nextPalette = getCustomThemePaletteSeed(state.theme)
    setDraftPalette(nextPalette)
    commitThemePalette(state.theme, nextPalette)
  }

  const copyActiveThemeToSelectedCustomPalette = () => {
    if (!canCopyActiveThemeToSelectedCustomPalette) return
    commitThemePalette(state.theme, draftPalette)
    onMutateState((previous) => {
      const targetTheme = previous.ui.selectedCustomTheme ?? 'custom1'
      if (previous.theme === targetTheme) return previous
      return {
        ...previous,
        ui: {
          ...previous.ui,
          themePalettes: copyThemePaletteToCustomPalette(previous.ui.themePalettes, previous.theme, targetTheme),
        },
      }
    })
  }

  const closeThemeJsonModal = () => {
    setThemeJsonMode(null)
    setThemeJsonDraft('')
    setThemeJsonStatus('')
  }

  const openExportThemeJson = () => {
    setThemeJsonMode('export')
    setThemeJsonDraft(serializeThemeSettings(draftPalette))
    setThemeJsonStatus('')
  }

  const openImportThemeJson = () => {
    setThemeJsonMode('import')
    setThemeJsonDraft('')
    setThemeJsonStatus('')
  }

  const importThemeJson = () => {
    const result = parseThemeSettingsImport(themeJsonDraft, draftPalette)
    if (!result.ok) {
      setThemeJsonStatus(result.error)
      return
    }
    const nextPalette = normalizeCustomThemePalette(result.palette, getCustomThemePaletteSeed(state.theme))
    setDraftPalette(nextPalette)
    commitThemePalette(state.theme, nextPalette)
    setThemeJsonStatus(`Imported ${result.importedSlots.length} theme color${result.importedSlots.length === 1 ? '' : 's'}.`)
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
    <section className="vault-settings-section" aria-label="Visual theme settings">
      <div className="settings-theme-copy-row">
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
        <button
          type="button"
          className="vault-settings-action settings-theme-copy-button"
          disabled={!canCopyActiveThemeToSelectedCustomPalette}
          onClick={copyActiveThemeToSelectedCustomPalette}
        >
          Copy to
        </button>
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
      </div>
      <div className="vault-settings-grid">
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
          Icon scale
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
      <div className="visuals-theme-preview" aria-label="Theme preview">
        <div className="visuals-preview-canvas" style={previewScaleStyle}>
          <aside className="visuals-preview-sidebar" aria-label="Preview vault tree">
            <div className="visuals-preview-tree" aria-hidden="true">
              <div className="visuals-preview-tree-row is-folder">
                <AppIcon iconId="folderOpen" className="visuals-preview-tree-icon" />
                <span className="visuals-preview-tree-title">Product work</span>
              </div>
              <div className="visuals-preview-tree-row is-note is-selected">
                <span className="visuals-preview-tree-title">Launch checklist</span>
              </div>
              <div className="visuals-preview-tree-row is-note">
                <span className="visuals-preview-tree-title">Customer calls</span>
              </div>
            </div>
          </aside>
          <div className="visuals-preview-workspace">
            <div className="visuals-preview-toolbar note-shared-toolbar toastui-editor-toolbar" aria-label="Preview note toolbar">
              <div className="toastui-editor-defaultUI-toolbar app-shared-editor-toolbar">
                {VISUALS_THEME_TOOLBAR_PREVIEW_GROUPS.map((group, groupIndex) => {
                  const previewItems = group.map((toolId) => ({
                    id: `visuals-preview-tool-${toolId}`,
                    type: 'tool' as const,
                    toolId,
                  }))

                  return (
                    <div
                      key={`visuals-preview-toolbar-group-${groupIndex}`}
                      className={`visuals-preview-toolbar-group ${getToolbarGroupClassName(previewItems)}`}
                    >
                      {previewItems.map((item) => (
                        <ToolbarToolVisual
                          key={item.id}
                          toolId={item.toolId}
                          iconOnlyTextTools
                          tooltipsDisabled
                          buttonProps={{
                            className: 'visuals-preview-toolbar-tool',
                            disabled: true,
                            tabIndex: -1,
                          }}
                        />
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="visuals-preview-aisles">
              <aside className="visuals-preview-control-aisle" aria-label="Preview controls">
                <div className="vault-utility-tabs visuals-preview-button-tabs" role="tablist" aria-label="Preview button states">
                  <button type="button" role="tab" aria-selected="false" tabIndex={-1}>
                    Messages
                  </button>
                  <button type="button" role="tab" aria-selected="true" className="is-active" tabIndex={-1}>
                    Settings
                  </button>
                </div>
              </aside>
              <div className="visuals-preview-panel">
                <div className="visuals-preview-note-header">
                  <div className="visuals-preview-note-title">
                    <strong>Launch checklist</strong>
                  </div>
                  <div className="visuals-preview-note-actions" aria-label="Preview aisle indicators">
                    <button
                      type="button"
                      className="note-aisle-action-btn note-aisle-link-btn visuals-preview-note-action"
                      aria-label="Synced duplicate"
                      disabled
                      tabIndex={-1}
                    >
                      <ToolbarToolIcon toolId="link" className="note-aisle-link-icon" />
                    </button>
                    <button
                      type="button"
                      className="note-aisle-action-btn note-aisle-frontmatter-btn visuals-preview-note-action"
                      aria-label="Frontmatter"
                      disabled
                      tabIndex={-1}
                    >
                      <span className="frontmatter-toolbar-icon note-aisle-frontmatter-icon" aria-hidden="true">fm</span>
                    </button>
                  </div>
                </div>
                <article className="visuals-preview-editor-sample toastui-editor-contents">
                  <h3 className="visuals-preview-heading">Release brief</h3>
                  <p className="visuals-preview-tag-line">
                    Scope tagged <span className="aislenote-tag-token">#launch</span> and{' '}
                    <span className="aislenote-tag-token">#customer</span>
                  </p>
                  <ul className="visuals-preview-list">
                    <li>Lock the announcement copy after legal review.</li>
                    <li>Attach launch images and confirm captions.</li>
                    <li>Publish support notes before the release window.</li>
                  </ul>
                </article>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="custom-theme-grid" aria-label="Active theme palette editor">
        {CUSTOM_THEME_PALETTE_GROUPS.map((group) => (
          <section className="custom-theme-group" key={group.label} aria-label={`${group.label} colors`}>
            <h3 className="custom-theme-group-title">{group.label}</h3>
            {group.slots.map((slot) => (
              <CustomThemePaletteSlotRow
                key={slot}
                label={CUSTOM_THEME_PALETTE_LABELS[slot]}
                value={draftPalette[slot]}
                onPreviewChange={(value) => updatePaletteSlot(slot, value)}
                onCommit={(value) => commitPaletteSlot(slot, value)}
              />
            ))}
          </section>
        ))}
      </div>
      <div className="custom-theme-transfer-actions">
        <div className="custom-theme-transfer-actions-left">
          <button type="button" className="vault-settings-action" onClick={resetSelectedPalette}>
            Reset selected palette
          </button>
        </div>
        <div className="custom-theme-transfer-actions-right">
          <button type="button" className="vault-settings-action" onClick={openImportThemeJson}>
            Import theme
          </button>
          <button type="button" className="vault-settings-action" onClick={openExportThemeJson}>
            Export theme
          </button>
        </div>
      </div>
      {themeJsonMode ? (
        <div className="modal-backdrop vault-modal-backdrop" role="presentation" onMouseDown={closeThemeJsonModal}>
          <div
            className="modal-card vault-frontmatter-modal custom-theme-json-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="custom-theme-json-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="modal-card-header">
              <h2 id="custom-theme-json-title">{themeJsonMode === 'export' ? 'Export theme' : 'Import theme'}</h2>
              <button type="button" className="app-close-button" aria-label="Close theme JSON" onClick={closeThemeJsonModal}>
                <AppIcon iconId="x" className="app-close-button-icon" />
              </button>
            </header>
            <div className="vault-frontmatter-body">
              <textarea
                className="settings-text-input custom-theme-json-textarea"
                value={themeJsonDraft}
                readOnly={themeJsonMode === 'export'}
                spellCheck={false}
                aria-label="Theme JSON"
                onChange={(event) => setThemeJsonDraft(event.target.value)}
              />
              {themeJsonStatus ? <p className="custom-theme-json-status">{themeJsonStatus}</p> : null}
            </div>
            <footer className="modal-card-footer custom-theme-json-modal-actions">
              <button type="button" className="vault-settings-action" onClick={closeThemeJsonModal}>
                Close
              </button>
              {themeJsonMode === 'import' ? (
                <button type="button" className="vault-settings-action" onClick={importThemeJson}>
                  Import theme
                </button>
              ) : null}
            </footer>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function VaultNameDialog({
  dialog,
  onCancel,
  onSubmit,
}: {
  dialog: VaultNameDialogState | null
  onCancel: () => void
  onSubmit: (name: string) => void
}) {
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!dialog) return
    setDraft(dialog.initialName)
    const focusId = window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 0)
    return () => window.clearTimeout(focusId)
  }, [dialog])

  if (!dialog) return null

  const title = dialog.mode === 'create' ? 'Create vault' : 'Rename vault'
  const actionLabel = dialog.mode === 'create' ? 'Choose location' : 'Rename'
  const trimmedName = draft.trim()
  const canSubmit = trimmedName.length > 0 && (dialog.mode === 'create' || trimmedName !== dialog.initialName)

  return (
    <div className="modal-backdrop vault-modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <form
        className="modal-card vault-frontmatter-modal vault-name-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vault-name-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          if (canSubmit) onSubmit(trimmedName)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel()
        }}
      >
        <header className="modal-card-header">
          <h2 id="vault-name-dialog-title">{title}</h2>
          <button type="button" className="app-close-button" aria-label="Close vault name dialog" onClick={onCancel}>
            <AppIcon iconId="x" className="app-close-button-icon" />
          </button>
        </header>
        <div className="vault-frontmatter-body">
          <label className="settings-modal-field" htmlFor="vault-name-input">
            <span>Vault name</span>
            <input
              ref={inputRef}
              id="vault-name-input"
              type="text"
              className="settings-text-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          </label>
        </div>
        <footer className="modal-card-footer">
          <button type="submit" className="vault-settings-action" disabled={!canSubmit}>
            {actionLabel}
          </button>
          <button type="button" className="vault-settings-action" onClick={onCancel}>
            Cancel
          </button>
        </footer>
      </form>
    </div>
  )
}

function FrontmatterTemplateImportDialog({
  templateName,
  onCancel,
  onImport,
}: {
  templateName: string
  onCancel: () => void
  onImport: (raw: string) => string | null
}) {
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    setDraft('')
    setStatus('')
  }, [templateName])

  const importFrontmatter = () => {
    const message = onImport(draft)
    if (message) setStatus(message)
  }

  return (
    <div className="modal-backdrop vault-modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        className="modal-card vault-frontmatter-modal frontmatter-template-import-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="frontmatter-template-import-title"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel()
        }}
      >
        <header className="modal-card-header">
          <h2 id="frontmatter-template-import-title">Import frontmatter</h2>
          <button type="button" className="app-close-button" aria-label="Close import frontmatter dialog" onClick={onCancel}>
            <AppIcon iconId="x" className="app-close-button-icon" />
          </button>
        </header>
        <div className="vault-frontmatter-body">
          <p className="frontmatter-template-import-message">This will overwrite the template:</p>
          <p className="frontmatter-template-import-name">{templateName}</p>
          <textarea
            className="settings-text-input frontmatter-template-import-textarea"
            value={draft}
            spellCheck={false}
            aria-label="Frontmatter import content"
            onChange={(event) => {
              setDraft(event.target.value)
              setStatus('')
            }}
          />
          {status ? <p className="frontmatter-template-import-status">{status}</p> : null}
        </div>
        <footer className="modal-card-footer frontmatter-template-import-modal-actions">
          <button type="button" className="vault-settings-action" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="vault-settings-action" onClick={importFrontmatter}>
            Import frontmatter
          </button>
        </footer>
      </section>
    </div>
  )
}

function FrontmatterTemplateDeleteDialog({
  templateName,
  onCancel,
  onConfirm,
}: {
  templateName: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="modal-backdrop vault-modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        className="modal-card vault-frontmatter-modal frontmatter-template-delete-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="frontmatter-template-delete-title"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel()
        }}
      >
        <header className="modal-card-header">
          <h2 id="frontmatter-template-delete-title">Delete template</h2>
          <button type="button" className="app-close-button" aria-label="Close delete template dialog" onClick={onCancel}>
            <AppIcon iconId="x" className="app-close-button-icon" />
          </button>
        </header>
        <div className="vault-frontmatter-body">
          <p className="frontmatter-template-delete-message">
            Are you sure you want to delete this template? This cannot be undone.
          </p>
          <p className="frontmatter-template-delete-name">{templateName}</p>
        </div>
        <footer className="modal-card-footer">
          <button type="button" className="vault-settings-action" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="vault-settings-action app-danger-btn" onClick={onConfirm}>
            Delete template
          </button>
        </footer>
      </section>
    </div>
  )
}

export function VaultApp() {
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
  const [activeToolbarLayoutId, setActiveToolbarLayoutIdState] = useState(loadVaultActiveToolbarLayoutId)
  const [toolbarEditorLayoutId, setToolbarEditorLayoutId] = useState(activeToolbarLayoutId)
  const [query, setQuery] = useState('')
  const [sidebarSearchHistory, setSidebarSearchHistory] = useState(loadSidebarSearchHistory)
  const [sidebarSearchMode, setSidebarSearchMode] = useState(false)
  const [scratchpadActive, setScratchpadActive] = useState(false)
  const [activeAisleId, setActiveAisleId] = useState('')
  const [activeFolderId, setActiveFolderId] = useState('')
  const [renamingTreeItemId, setRenamingTreeItemId] = useState('')
  const [renamingItemSurface, setRenamingItemSurface] = useState<VaultRenameSurface | null>(null)
  const [treeRenameDraft, setTreeRenameDraft] = useState('')
  const [draggingTreeItemId, setDraggingTreeItemId] = useState('')
  const [draggingTreeNoteIds, setDraggingTreeNoteIds] = useState<string[]>([])
  const [selectedTreeNoteIds, setSelectedTreeNoteIds] = useState<string[]>([])
  const [treeSelectionAnchorNoteId, setTreeSelectionAnchorNoteId] = useState('')
  const [treeDropTarget, setTreeDropTarget] = useState<VaultTreeDropTarget | null>(null)
  const [aisleContextMenu, setAisleContextMenu] = useState<VaultAisleContextMenuState | null>(null)
  const [editorContextMenu, setEditorContextMenu] = useState<VaultEditorContextMenuState | null>(null)
  const [treeContextMenu, setTreeContextMenu] = useState<VaultTreeContextMenuState | null>(null)
  const [shortcutMenu, setShortcutMenu] = useState<VaultShortcutMenuState | null>(null)
  const [noteActionPicker, setNoteActionPicker] = useState<NoteActionPickerState | null>(null)
  const [openVaultActionMenuKey, setOpenVaultActionMenuKey] = useState('')
  const [vaultSwitcherOpen, setVaultSwitcherOpen] = useState(false)
  const [vaultNameDialog, setVaultNameDialog] = useState<VaultNameDialogState | null>(null)
  const [decoupleDialog, setDecoupleDialog] = useState<DecoupleDialogState | null>(null)
  const [linkPrompt, setLinkPrompt] = useState<LinkPromptState>(CLOSED_LINK_PROMPT_STATE)
  const [findReplaceOpen, setFindReplaceOpen] = useState(false)
  const [findReplaceFocusRequestId, setFindReplaceFocusRequestId] = useState(0)
  const [findReplaceQuery, setFindReplaceQuery] = useState('')
  const [findReplaceReplacement, setFindReplaceReplacement] = useState('')
  const [findReplaceActiveIndex, setFindReplaceActiveIndex] = useState(0)
  const [findReplaceHighlightRequestId, setFindReplaceHighlightRequestId] = useState(0)
  const [tagAutocompleteRecentKeys, setTagAutocompleteRecentKeys] = useState(loadTagAutocompleteRecentKeys)
  const [aisleEditModalOpen, setAisleEditModalOpen] = useState(false)
  const [frontmatterModalSessions, setFrontmatterModalSessions] = useState<Record<string, VaultFrontmatterModalState>>({})
  const [frontmatterDraft, setFrontmatterDraft] = useState<AppState['frontmatter']>(() => state.frontmatter)
  const [frontmatterFixedListOptionDrafts, setFrontmatterFixedListOptionDrafts] = useState<Record<string, string>>({})
  const [frontmatterTemplateDeleteTargetId, setFrontmatterTemplateDeleteTargetId] = useState('')
  const [frontmatterTemplateImportTarget, setFrontmatterTemplateImportTarget] = useState<FrontmatterTemplateImportTarget | null>(null)
  const frontmatterTemplateFieldListRef = useRef<HTMLDivElement | null>(null)
  const frontmatterTemplateFieldRectsRef = useRef<FrontmatterListDropRect[]>([])
  const frontmatterTemplateFieldDragIdRef = useRef('')
  const frontmatterTemplateFieldDropIndexRef = useRef<number | null>(null)
  const [draggingFrontmatterTemplateFieldId, setDraggingFrontmatterTemplateFieldId] = useState('')
  const [frontmatterTemplateFieldDropIndex, setFrontmatterTemplateFieldDropIndex] = useState<number | null>(null)
  const [editingShortcut, setEditingShortcut] = useState<ShortcutId | null>(null)
  const [shortcutMenuSettingsOpen, setShortcutMenuSettingsOpen] = useState(false)
  const [tableOfContentsPanels, setTableOfContentsPanels] = useState<TableOfContentsPanelsState | null>(null)
  const [diagnosticDays, setDiagnosticDays] = useState<string[]>([])
  const [selectedDiagnosticDay, setSelectedDiagnosticDay] = useState('')
  const [diagnosticEntries, setDiagnosticEntries] = useState<DiagnosticLogEntry[]>([])
  const [diagnosticLevelFilter, setDiagnosticLevelFilter] = useState<DiagnosticLogLevelFilter>('all')
  const [diagnosticDisplayLimit, setDiagnosticDisplayLimit] = useState<DiagnosticLogDisplayLimit>(500)
  const [diagnosticMode, setDiagnosticMode] = useState<DiagnosticLogMode>('actionable')
  const [diagnosticCaptureEnabled, setDiagnosticCaptureEnabled] = useState(true)
  const [expandedTrashItemId, setExpandedTrashItemId] = useState('')
  const [runtimeVersion, setRuntimeVersion] = useState('')
  const [zoomHudPercent, setZoomHudPercent] = useState<number | null>(null)
  const [observedVaultTopbarHeight, setObservedVaultTopbarHeight] = useState(0)
  const [noteContentViewportRect, setNoteContentViewportRect] = useState<VaultNoteActionPickerViewportRect | null>(null)
  const [vaultTreeViewport, setVaultTreeViewport] = useState({ scrollTop: 0, height: 0 })
  const aisleScrollRef = useRef<HTMLDivElement | null>(null)
  const vaultShellRef = useRef<HTMLDivElement | null>(null)
  const vaultTreeScrollRef = useRef<HTMLDivElement | null>(null)
  const workspaceRootRef = useRef<HTMLElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const linkPromptInputRef = useRef<HTMLInputElement | null>(null)
  const editorRef = useRef<Editor | null>(null)
  const closedNoteTabHistoryRef = useRef<ClosedVaultTab[]>([])
  const dismissedMentionStartRef = useRef<number | null>(null)
  const activeAisleIdRef = useRef('')
  const activeNoteLocationKeyRef = useRef('')
  const viewModeRef = useRef<ViewMode>('main')
  const scratchpadActiveRef = useRef(false)
  const activeNoteTreeRevealNoteIdRef = useRef(state.vault.activeNoteId)
  const pendingActiveNoteTreeRevealIdRef = useRef('')
  const suppressActiveNoteTreeRevealForDeleteRef = useRef<string | null>(null)
  const previousAssetToolsNoteLocationKeyRef = useRef('')
  const isMainViewRef = useRef(true)
  const pendingScrollToAisleIdRef = useRef<string | null>(null)
  const pendingFocusToAisleIdRef = useRef<string | null>(null)
  const pendingNavigationTopAisleIdRef = useRef<string | null>(null)
  const pendingFindReplaceRevealRef = useRef<FindReplaceMatch | null>(null)
  const scheduledAisleFocusScrollRef = useRef<ScheduledAisleFocusScroll>({ firstFrameId: null, followupFrameId: null })
  const navigateToVaultLocationRef = useRef<(location: VaultNavigationLocation) => boolean>(() => false)
  const pendingCreatedEditRef = useRef<unknown>(null)
  const pendingCreatedTreeRenameRef = useRef<PendingCreatedTreeRename | null>(null)
  const skipTreeRenameBlurItemIdRef = useRef('')
  const addAisleFromNewlineRef = useRef<((side: 'left' | 'right', aisleId: string, markdown: string) => void) | null>(null)
  const openTableOfContentsForAisleRef = useRef<((aisleId: string) => void) | null>(null)
  const tagAutocompleteRefreshRef = useRef<(() => void) | null>(null)
  const frontmatterStateSnapshotRef = useRef(state.frontmatter)
  const selectedDiagnosticDayRef = useRef('')
  const skipNextTreeRenameCommitRef = useRef(false)
  const zoomHudTimeoutRef = useRef<number | null>(null)
  const sidebarResizeRef = useRef<{
    pointerId: number
    startClientX: number
    startWidth: number
  } | null>(null)
  const isMacPlatform = /Mac|iPhone|iPad|iPod/i.test(navigator.platform)
  const appNotifications = useAppNotifications({
    state,
    stateRef,
    setState,
    isMacPlatform,
  })
  const pushAppToastRef = useRef(appNotifications.pushToast)
  pushAppToastRef.current = appNotifications.pushToast
  const pushAppToast = useCallback((message: string, tone?: ToastTone, durationMs?: number) => {
    pushAppToastRef.current(message, tone, durationMs)
  }, [])
  const sidebarRevealLabel = useMemo(
    () => getVaultSidebarRevealLabel(
      typeof window !== 'undefined'
        ? window.electronAPI?.platform ?? (isMacPlatform ? 'darwin' : navigator.platform)
        : undefined,
    ),
    [isMacPlatform],
  )
  const updateVaultTreeViewport = useCallback(() => {
    const element = vaultTreeScrollRef.current
    if (!element) return
    const nextViewport = {
      scrollTop: element.scrollTop,
      height: element.clientHeight,
    }
    setVaultTreeViewport((current) =>
      current.scrollTop === nextViewport.scrollTop && current.height === nextViewport.height
        ? current
        : nextViewport,
    )
  }, [])
  const handleVaultTreeScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget
    const nextViewport = {
      scrollTop: element.scrollTop,
      height: element.clientHeight,
    }
    setVaultTreeViewport((current) =>
      current.scrollTop === nextViewport.scrollTop && current.height === nextViewport.height
        ? current
        : nextViewport,
    )
  }, [])
  const updateObservedVaultTopbarHeight = useCallback(() => {
    const shell = vaultShellRef.current
    const nextHeight = shell ? readObservedVaultTopbarHeight(shell) : 0
    setObservedVaultTopbarHeight((currentHeight) =>
      Math.abs(currentHeight - nextHeight) < 0.5 ? currentHeight : nextHeight,
    )
  }, [])
  const updateNoteContentViewportRect = useCallback(() => {
    const nextRect = getNoteContentViewportRect(workspaceRootRef.current)
    setNoteContentViewportRect((currentRect) =>
      areViewportRectsEqual(currentRect, nextRect) ? currentRect : nextRect,
    )
  }, [])
  const handleWorkspaceRootChange = useCallback((node: HTMLElement | null) => {
    workspaceRootRef.current = node
    window.requestAnimationFrame(updateNoteContentViewportRect)
  }, [updateNoteContentViewportRect])

  useEffect(() => () => {
    cancelScheduledAisleFocusScroll(scheduledAisleFocusScrollRef.current, window)
  }, [])

  useLayoutEffect(() => {
    updateObservedVaultTopbarHeight()
    const shell = vaultShellRef.current
    if (!shell || typeof ResizeObserver === 'undefined') return undefined

    const observedElements = [
      shell.querySelector<HTMLElement>('.note-aisles-shell > .note-shared-toolbar .app-shared-editor-toolbar'),
      shell.querySelector<HTMLElement>('.vault-utility-header .vault-utility-tabs'),
      shell.querySelector<HTMLElement>('.vault-utility-header .vault-settings-action'),
    ].filter((element): element is HTMLElement => Boolean(element))
    if (observedElements.length === 0) return undefined

    const observer = new ResizeObserver(updateObservedVaultTopbarHeight)
    observedElements.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [
    activeToolbarLayoutId,
    scratchpadActive,
    state.ui.toolbarButtonScale,
    state.ui.toolbarLayouts,
    state.vault.activeNoteId,
    updateObservedVaultTopbarHeight,
    viewMode,
  ])

  useLayoutEffect(() => {
    updateNoteContentViewportRect()
    const workspaceRoot = workspaceRootRef.current
    const contentRegion = workspaceRoot?.querySelector<HTMLElement>('.note-content-region') ?? null
    if (!workspaceRoot || !contentRegion) return undefined

    let observer: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(updateNoteContentViewportRect)
      observer.observe(workspaceRoot)
      observer.observe(contentRegion)
    }
    window.addEventListener('resize', updateNoteContentViewportRect)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', updateNoteContentViewportRect)
    }
  }, [
    scratchpadActive,
    state.ui.sidebarCollapsed,
    state.ui.sidebarWidth,
    state.vault.activeNoteId,
    updateNoteContentViewportRect,
    viewMode,
  ])

  useLayoutEffect(() => {
    updateVaultTreeViewport()
    const element = vaultTreeScrollRef.current
    if (!element || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(updateVaultTreeViewport)
    observer.observe(element)
    return () => observer.disconnect()
  }, [query, sidebarSearchMode, state.ui.sidebarCollapsed, updateVaultTreeViewport])

  useEffect(() => {
    const clearZoomHudTimeout = () => {
      if (zoomHudTimeoutRef.current === null) return
      window.clearTimeout(zoomHudTimeoutRef.current)
      zoomHudTimeoutRef.current = null
    }
    const unsubscribe = window.electronAPI?.onAppZoomChanged?.((payload) => {
      if (!Number.isFinite(payload?.percent)) return
      setZoomHudPercent(Math.round(payload.percent))
      clearZoomHudTimeout()
      zoomHudTimeoutRef.current = window.setTimeout(() => {
        setZoomHudPercent(null)
        zoomHudTimeoutRef.current = null
      }, 1400)
    })
    return () => {
      clearZoomHudTimeout()
      unsubscribe?.()
    }
  }, [])

  const applyDiagnosticDays = useCallback((days: string[], preferredDay?: string) => {
    const orderedDays = orderDiagnosticDaysForDisplay(days)
    setDiagnosticDays(orderedDays)
    if (!selectedDiagnosticDayRef.current || !orderedDays.includes(selectedDiagnosticDayRef.current)) {
      setDiagnosticEntries([])
    }
    setSelectedDiagnosticDay((currentDay) => {
      if (preferredDay && orderedDays.includes(preferredDay)) return preferredDay
      if (currentDay && orderedDays.includes(currentDay)) return currentDay
      return orderedDays[0] ?? ''
    })
  }, [])

  const loadDiagnosticDays = useCallback(async (preferredDay?: string) => {
    applyDiagnosticDays(await listDiagnosticLogDays(), preferredDay)
  }, [applyDiagnosticDays])

  useEffect(() => {
    void loadDiagnosticDays()
  }, [loadDiagnosticDays])

  useEffect(() => {
    selectedDiagnosticDayRef.current = selectedDiagnosticDay
  }, [selectedDiagnosticDay])

  useEffect(() => {
    if (!selectedDiagnosticDay) {
      setDiagnosticEntries([])
      return undefined
    }
    let canceled = false
    void readDiagnosticLogEntries(selectedDiagnosticDay)
      .then((entries) => {
        if (!canceled) setDiagnosticEntries(entries)
      })
      .catch(() => {
        if (!canceled) setDiagnosticEntries([])
      })
    return () => {
      canceled = true
    }
  }, [selectedDiagnosticDay])

  useEffect(
    () =>
      subscribeDiagnosticLogChanges((entry) => {
        setDiagnosticDays((currentDays) => orderDiagnosticDaysForDisplay([entry.dayKey, ...currentDays]))
        setSelectedDiagnosticDay((currentDay) => currentDay || entry.dayKey)
        if (selectedDiagnosticDayRef.current && selectedDiagnosticDayRef.current !== entry.dayKey) return
        setDiagnosticEntries((currentEntries) =>
          currentEntries.some((candidate) => candidate.id === entry.id) ? currentEntries : [...currentEntries, entry],
        )
      }),
    [],
  )

  useEffect(() => {
    const heartbeat = createMainThreadHeartbeat()
    heartbeat.start()
    return () => heartbeat.stop()
  }, [])

  const toolbarState = useEditorToolbarState({
    viewMode,
    isMacPlatform,
    editorRef,
    stateRef,
  })
  const closeToolbarPopoversRef = useRef(toolbarState.closeToolbarPopovers)

  useEffect(() => {
    closeToolbarPopoversRef.current = toolbarState.closeToolbarPopovers
  }, [toolbarState.closeToolbarPopovers])

  const activeVaultModel = useMemo(
    () => getActiveNoteModel(stateRef.current),
    // Recompute only when active-note inputs change; stateRef keeps the callback on the latest state object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.noteAisleBodies, state.noteBodies, state.vault.activeNoteId, state.vault.items, stateRef],
  )
  const scratchpadModel = useMemo(
    () => getScratchpadEditorModel(stateRef.current),
    // Recompute only when scratchpad editor inputs change; stateRef keeps the callback on the latest state object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.noteAisleBodies, state.noteBodies, state.scratchpad, stateRef],
  )
  const activeModel = scratchpadActive ? scratchpadModel ?? activeVaultModel : activeVaultModel
  const activeModelIsScratchpad = activeModel?.kind === 'scratchpad'
  const visibleFrontmatterModal =
    viewMode === 'main' && activeModel && activeModel.kind !== 'scratchpad'
      ? frontmatterModalSessions[activeModel.noteId] ?? null
      : null
  const updateFrontmatterModalSession = useCallback((modal: VaultFrontmatterModalState) => {
    setFrontmatterModalSessions((currentSessions) => ({
      ...currentSessions,
      [modal.location.noteId]: modal,
    }))
  }, [])
  const closeFrontmatterModalSession = useCallback((noteId?: string) => {
    const targetNoteId = noteId ?? (activeModel && activeModel.kind !== 'scratchpad' ? activeModel.noteId : '')
    if (!targetNoteId) return
    setFrontmatterModalSessions((currentSessions) => {
      if (!currentSessions[targetNoteId]) return currentSessions
      const { [targetNoteId]: _removedSession, ...nextSessions } = currentSessions
      return nextSessions
    })
  }, [activeModel])
  const noteTabItems = useMemo<NoteTabStripItem[]>(
    () =>
      (state.vault.openTabs ?? []).flatMap((tab): NoteTabStripItem[] => {
        const notePath = findVaultNote(state.vault.items, tab.noteId)
        if (!notePath) return []
        return [
          {
            noteId: tab.noteId,
            title: notePath.note.title,
            status: tab.status,
            active: tab.noteId === state.vault.activeNoteId,
          },
        ]
      }),
    [state.vault.activeNoteId, state.vault.items, state.vault.openTabs],
  )
  const collapsedFolderIds = useMemo(() => new Set(state.ui.collapsedFolderIds), [state.ui.collapsedFolderIds])
  const visibleTreeNoteIds = useMemo(
    () => getVisibleVaultTreeNoteIds(state.vault.items, collapsedFolderIds),
    [collapsedFolderIds, state.vault.items],
  )
  const vaultTreeFlatRows = useMemo(
    () => flattenVisibleVaultTreeRows(state.vault.items, collapsedFolderIds, query),
    [collapsedFolderIds, query, state.vault.items],
  )
  const useVirtualizedVaultTree = vaultTreeFlatRows.length > VAULT_TREE_VIRTUALIZATION_THRESHOLD
  const vaultTreeVirtualWindow = useMemo(() => {
    if (!useVirtualizedVaultTree) {
      return {
        rows: vaultTreeFlatRows,
        startIndex: 0,
        totalHeight: vaultTreeFlatRows.length * VAULT_TREE_VIRTUAL_ROW_HEIGHT,
      }
    }
    const viewportHeight = vaultTreeViewport.height || 640
    const startIndex = Math.max(
      0,
      Math.floor(vaultTreeViewport.scrollTop / VAULT_TREE_VIRTUAL_ROW_HEIGHT) - VAULT_TREE_VIRTUAL_OVERSCAN,
    )
    const visibleRowCount =
      Math.ceil(viewportHeight / VAULT_TREE_VIRTUAL_ROW_HEIGHT) + VAULT_TREE_VIRTUAL_OVERSCAN * 2
    return {
      rows: vaultTreeFlatRows.slice(startIndex, startIndex + visibleRowCount),
      startIndex,
      totalHeight: vaultTreeFlatRows.length * VAULT_TREE_VIRTUAL_ROW_HEIGHT,
    }
  }, [vaultTreeFlatRows, vaultTreeViewport.height, vaultTreeViewport.scrollTop, useVirtualizedVaultTree])
  const selectedTreeNoteIdSet = useMemo(() => new Set(selectedTreeNoteIds), [selectedTreeNoteIds])
  const draggingTreeNoteIdSet = useMemo(() => new Set(draggingTreeNoteIds), [draggingTreeNoteIds])
  const treeContextDeleteNoteIds = useMemo(
    () => getVaultTreeContextDeleteNoteIds(treeContextMenu, selectedTreeNoteIds, visibleTreeNoteIds),
    [treeContextMenu, selectedTreeNoteIds, visibleTreeNoteIds],
  )
  const treeContextDeleteLabel = useMemo(
    () => getVaultTreeContextDeleteLabel(treeContextMenu, treeContextDeleteNoteIds.length),
    [treeContextDeleteNoteIds.length, treeContextMenu],
  )
  const vaultIndexContext = useMemo(
    () => createVaultIndexContext(stateRef.current),
    // Rebuild only for data that affects searchable vault indexes, not theme/UI-only state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      state.frontmatter.templates,
      state.noteAisleBodies,
      state.noteBodies,
      state.vault.items,
      state.scratchpad,
      stateRef,
    ],
  )
  const sidebarSearchNeedsFullIndexes = sidebarSearchMode || query.trim().length > 0
  const tagAutocompleteFilterIndex = useMemo(
    () => buildNoteFilterIndex(vaultIndexContext.state, 'tags', [], vaultIndexContext),
    [vaultIndexContext],
  )
  const sidebarSearchIndexes = useMemo(() => {
    if (sidebarSearchNeedsFullIndexes) return buildSidebarSearchIndexes(vaultIndexContext.state, vaultIndexContext)
    return {
      ...getEmptySidebarSearchIndexes(),
      tags: tagAutocompleteFilterIndex,
    }
  }, [vaultIndexContext, sidebarSearchNeedsFullIndexes, tagAutocompleteFilterIndex])
  const parsedSidebarSearch = useMemo(
    () => parseSidebarSearchInput(query, sidebarSearchIndexes),
    [query, sidebarSearchIndexes],
  )
  const sidebarSearchSelectedTokens = parsedSidebarSearch.tokens
  const sidebarSearchSuggestions = useMemo(
    () => getSidebarSearchSuggestions(query, sidebarSearchIndexes, sidebarSearchSelectedTokens),
    [query, sidebarSearchIndexes, sidebarSearchSelectedTokens],
  )
  const sidebarSearchResultGroups = useMemo(
    () =>
      buildSidebarSearchResultGroups({
        state: vaultIndexContext.state,
        query,
        filter: null,
        indexes: sidebarSearchIndexes,
        context: vaultIndexContext,
      }),
    [vaultIndexContext, query, sidebarSearchIndexes],
  )
  const sidebarSearchMetadataActive =
    sidebarSearchSelectedTokens.length > 0 ||
    parsedSidebarSearch.frontmatterTerms.length > 0 ||
    parsedSidebarSearch.presenceTerms.length > 0
  const sidebarSearchActive = query.trim().length > 0
  const sidebarSearchVisible = sidebarSearchMode || sidebarSearchActive
  const noteActionEntries = useMemo(() => {
    if (!noteActionPicker) return []
    const activeNoteId = activeVaultModel?.noteId ?? state.vault.activeNoteId
    return filterNoteActionPickerEntries(vaultIndexContext.locations, noteActionPicker.query, {
      actions: noteActionPicker.actions,
      activeNoteId,
      limit: 12,
    })
  }, [activeVaultModel?.noteId, vaultIndexContext, noteActionPicker, state.vault.activeNoteId])
  const getNoteActionPickerActionsForNoteId = useCallback((noteId: string): VaultNoteActionPickerAction[] => {
    const activeNoteId = activeVaultModel?.noteId ?? state.vault.activeNoteId
    return getNoteActionPickerActionsForNote(noteActionPicker?.actions ?? [], noteId, activeNoteId)
  }, [activeVaultModel?.noteId, noteActionPicker?.actions, state.vault.activeNoteId])
  const getNoteActionPickerAislesForNote = useCallback((noteId: string): VaultNoteActionPickerAisleOption[] => {
    const note = findVaultNote(state.vault.items, noteId)?.note
    const noteBody = note ? state.noteBodies.find((body) => body.id === note.noteBodyId) : null
    return noteBody?.aisles.map((aisle, index) => ({ id: aisle.id, label: `aisle ${index + 1}` })) ?? []
  }, [state.noteBodies, state.vault.items])
  const activeAisleIdsSignature = activeModel?.resolved.aisles.map((aisle) => aisle.id).join('|') ?? ''
  const activeNoteLocationKey = activeModelIsScratchpad ? SCRATCHPAD_CURSOR_LOCATION_KEY : activeModel?.noteId ?? ''
  const activeNoteAisles = activeModel?.noteBody.aisles ?? []
  const savedActiveAisleId = activeModel
    ? activeModel.kind === 'scratchpad'
      ? getScratchpadActiveAisleId(state)
      : getPreferredVaultAisleId(state, activeModel.noteId, activeModel.noteBody.aisles)
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
    if (!activeModel || activeModel.kind === 'scratchpad') return new Set<string>()
    return new Set(
      activeModel.resolved.aisles
        .filter((aisle) => (aisleBodyReferenceCounts.get(aisle.aisleBodyId) ?? 0) > 1)
        .map((aisle) => aisle.id),
    )
  }, [activeModel, aisleBodyReferenceCounts])
  const frontmatterAisleIds = useMemo(() => {
    if (!activeModel || activeModel.kind === 'scratchpad') return new Set<string>()
    return new Set(
      activeModel.resolved.aisles
        .filter((aisle) => {
          const body = vaultIndexContext.aisleBodiesById.get(aisle.aisleBodyId)
          return Boolean(body?.frontmatter || body?.frontmatterRaw || body?.frontmatterStatus === 'invalid')
        })
        .map((aisle) => aisle.id),
    )
  }, [activeModel, vaultIndexContext.aisleBodiesById])
  const defaultToolbarButtonScale = DEFAULT_UI_SETTINGS.toolbarButtonScale ?? 1.2
  const rootStyle = useMemo(
    () =>
      ({
        ...getThemePaletteVariables({
          theme: state.theme,
          ui: {
            themePalettes: state.ui.themePalettes,
          },
        }),
        '--note-font-scale': String(state.ui.noteFontScale),
        '--toolbar-button-scale': String(state.ui.toolbarButtonScale ?? defaultToolbarButtonScale),
        '--vault-topbar-observed-height': `${observedVaultTopbarHeight}px`,
      }) as CSSProperties,
    [
      defaultToolbarButtonScale,
      observedVaultTopbarHeight,
      state.theme,
      state.ui.noteFontScale,
      state.ui.themePalettes,
      state.ui.toolbarButtonScale,
    ],
  )
  const toolbarLayout = useMemo(
    () => resolveToolbarLayout(state.ui.toolbarLayouts, activeToolbarLayoutId),
    [activeToolbarLayoutId, state.ui.toolbarLayouts],
  )
  const toolbarLayouts = useMemo(() => getToolbarLayouts(state.ui.toolbarLayouts), [state.ui.toolbarLayouts])
  const normalizedHotkeys = useMemo(() => normalizeHotkeySettings(state.hotkeys), [state.hotkeys])
  const activeAisleWidthLocationKey = activeModel
    ? activeModel.kind === 'scratchpad'
      ? SCRATCHPAD_CURSOR_LOCATION_KEY
      : buildNoteLocationKey({ noteId: activeModel.noteId })
    : ''
  const activeAisleWidths = activeAisleWidthLocationKey ? state.ui.aisleWidths?.[activeAisleWidthLocationKey] ?? {} : {}
  const canDecoupleAisleById = useCallback(
    (aisleId: string) => {
      if (activeModel?.kind === 'scratchpad') return false
      const aisle = activeModel?.resolved.aisles.find((candidate) => candidate.id === aisleId)
      return Boolean(aisle && (aisleBodyReferenceCounts.get(aisle.aisleBodyId) ?? 0) > 1)
    },
    [activeModel, aisleBodyReferenceCounts],
  )

  activeAisleIdRef.current = renderedActiveAisleId
  activeNoteLocationKeyRef.current = activeNoteLocationKey
  viewModeRef.current = viewMode
  scratchpadActiveRef.current = scratchpadActive
  isMainViewRef.current = viewMode === 'main'

  useEffect(() => {
    if (!activeModel) return
    if (!activeModel.resolved.aisles.some((aisle) => aisle.id === activeAisleId)) {
      setActiveAisleId(savedActiveAisleId || (activeModel.resolved.aisles[0]?.id ?? ''))
    }
  }, [activeAisleId, activeAisleIdsSignature, activeModel, savedActiveAisleId])

  useEffect(() => {
    if (!activeFolderId) return
    if (!findVaultFolder(state.vault.items, activeFolderId)) {
      setActiveFolderId('')
    }
  }, [activeFolderId, state.vault.items])

  useEffect(() => {
    setActiveFolderId(getContainingFolderId(stateRef.current.vault.items, stateRef.current.vault.activeNoteId) ?? '')
    setSelectedTreeNoteIds(stateRef.current.vault.activeNoteId ? [stateRef.current.vault.activeNoteId] : [])
    setTreeSelectionAnchorNoteId(stateRef.current.vault.activeNoteId)
  }, [state.vault.activeNoteId, stateRef])

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
    if (!state.vault.deletedItems.some((entry) => entry.id === expandedTrashItemId)) {
      setExpandedTrashItemId('')
    }
  }, [expandedTrashItemId, state.vault.deletedItems])

  useEffect(() => {
    if (renamingTreeItemId && !findVaultItem(state.vault.items, renamingTreeItemId)) {
      if (pendingCreatedTreeRenameRef.current?.itemId === renamingTreeItemId) {
        pendingCreatedTreeRenameRef.current = null
        pendingCreatedEditRef.current = null
      }
      setRenamingTreeItemId('')
      setRenamingItemSurface(null)
      setTreeRenameDraft('')
    }
    if (draggingTreeItemId && !findVaultItem(state.vault.items, draggingTreeItemId)) {
      setDraggingTreeItemId('')
      setDraggingTreeNoteIds([])
      setTreeDropTarget(null)
    }
    if (treeContextMenu?.kind === 'item' && !findVaultItem(state.vault.items, treeContextMenu.itemId)) {
      setTreeContextMenu(null)
    }
  }, [draggingTreeItemId, renamingTreeItemId, state.vault.items, treeContextMenu])

  const mutateState = useCallback((updater: (previous: AppState) => AppState) => {
    setState((previous) => updater(previous))
  }, [setState])

  useLayoutEffect(() => {
    const activeNoteId = state.vault.activeNoteId
    if (activeNoteId !== activeNoteTreeRevealNoteIdRef.current) {
      const previousActiveNoteId = activeNoteTreeRevealNoteIdRef.current
      activeNoteTreeRevealNoteIdRef.current = activeNoteId
      if (suppressActiveNoteTreeRevealForDeleteRef.current === previousActiveNoteId) {
        suppressActiveNoteTreeRevealForDeleteRef.current = null
        pendingActiveNoteTreeRevealIdRef.current = ''
      } else {
        pendingActiveNoteTreeRevealIdRef.current = activeNoteId
      }
    }

    const pendingNoteId = pendingActiveNoteTreeRevealIdRef.current
    if (!pendingNoteId) return
    if (scratchpadActive || activeModelIsScratchpad) {
      pendingActiveNoteTreeRevealIdRef.current = ''
      return
    }
    if (pendingNoteId !== activeNoteId) {
      pendingActiveNoteTreeRevealIdRef.current = ''
      return
    }
    if (state.ui.sidebarCollapsed || sidebarSearchVisible) return

    if (!findVaultNote(state.vault.items, pendingNoteId)) {
      pendingActiveNoteTreeRevealIdRef.current = ''
      return
    }

    const collapsedAncestorIds = getVaultNoteFolderPath(state.vault.items, pendingNoteId)
      .map((folder) => folder.id)
      .filter((folderId) => collapsedFolderIds.has(folderId))
    if (collapsedAncestorIds.length > 0) {
      mutateState((previous) => ({
        ...previous,
        ui: {
          ...previous.ui,
          collapsedFolderIds: previous.ui.collapsedFolderIds.filter(
            (folderId) => !collapsedAncestorIds.includes(folderId),
          ),
        },
      }))
      return
    }

    const scrollNode = vaultTreeScrollRef.current
    if (!scrollNode || scrollNode.clientHeight <= 0) return
    const sidebarFooter = scrollNode
      .closest('.vault-sidebar')
      ?.querySelector<HTMLElement>('.vault-sidebar-footer:not(.is-collapsed)')
    const obscuredBottomInset = sidebarFooter?.getBoundingClientRect().height ?? 0

    const rowIndex = vaultTreeFlatRows.findIndex(
      (row) => row.item.type === 'note' && row.item.id === pendingNoteId,
    )
    if (rowIndex < 0) {
      pendingActiveNoteTreeRevealIdRef.current = ''
      return
    }

    const rowElement = Array.from(
      scrollNode.querySelectorAll<HTMLElement>('[data-vault-tree-item-id]'),
    ).find((candidate) => candidate.dataset.vaultTreeItemId === pendingNoteId)
    const rowBounds = rowElement
      ? (() => {
          const scrollRect = scrollNode.getBoundingClientRect()
          const rowRect = rowElement.getBoundingClientRect()
          const top = scrollNode.scrollTop + rowRect.top - scrollRect.top
          return {
            top,
            bottom: top + rowRect.height,
          }
        })()
      : {
          top: rowIndex * VAULT_TREE_VIRTUAL_ROW_HEIGHT,
          bottom: (rowIndex + 1) * VAULT_TREE_VIRTUAL_ROW_HEIGHT,
        }
    const nextScrollTop = getVaultTreeRevealScrollTop(
      {
        scrollTop: scrollNode.scrollTop,
        clientHeight: scrollNode.clientHeight,
        scrollHeight: scrollNode.scrollHeight,
        bottomInset: obscuredBottomInset,
      },
      rowBounds,
    )
    if (Math.abs(nextScrollTop - scrollNode.scrollTop) > 0.5) {
      scrollNode.scrollTop = nextScrollTop
      updateVaultTreeViewport()
    }
    pendingActiveNoteTreeRevealIdRef.current = ''
  }, [
    activeModelIsScratchpad,
    collapsedFolderIds,
    mutateState,
    vaultTreeFlatRows,
    scratchpadActive,
    sidebarSearchVisible,
    state.vault.activeNoteId,
    state.vault.items,
    state.ui.sidebarCollapsed,
    updateVaultTreeViewport,
  ])

  useEffect(() => {
    if (!activeModelIsScratchpad || !renderedActiveAisleId) return
    mutateState((previous) => setScratchpadActiveAisleId(previous, renderedActiveAisleId))
  }, [activeModelIsScratchpad, mutateState, renderedActiveAisleId])

  const setActiveToolbarLayoutId = useCallback((layoutId: string) => {
    const nextLayoutId = layoutId.trim() || DEFAULT_TOOLBAR_LAYOUT_ID
    setActiveToolbarLayoutIdState(nextLayoutId)
    saveVaultActiveToolbarLayoutId(nextLayoutId)
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
      frontmatterTemplateFieldRectsRef.current = []
      frontmatterTemplateFieldDragIdRef.current = ''
      frontmatterTemplateFieldDropIndexRef.current = null
      setDraggingFrontmatterTemplateFieldId('')
      setFrontmatterTemplateFieldDropIndex(null)
      setFrontmatterTemplateDeleteTargetId('')
      setFrontmatterTemplateImportTarget(null)
    }
    frontmatterStateSnapshotRef.current = state.frontmatter
  }, [frontmatterDraft, state.frontmatter])

  const closeTransientFloatingUi = useCallback(() => {
    setVaultSwitcherOpen(false)
    setOpenVaultActionMenuKey('')
    setAisleContextMenu(null)
    setEditorContextMenu(null)
    setTreeContextMenu(null)
    setShortcutMenu(null)
    setNoteActionPicker(null)
    setLinkPrompt(CLOSED_LINK_PROMPT_STATE)
    closeToolbarPopoversRef.current()
  }, [])

  const openUtilityView = useCallback((targetViewMode: UtilityViewMode = 'settings') => {
    closeTransientFloatingUi()
    setAisleEditModalOpen(false)
    setViewMode(targetViewMode)
  }, [closeTransientFloatingUi])

  const handleSidebarSettingsClick = useCallback(() => {
    closeTransientFloatingUi()
    if (viewMode === 'settings') {
      setViewMode('main')
      return
    }
    openUtilityView('settings')
  }, [closeTransientFloatingUi, openUtilityView, viewMode])

  useEffect(() => {
    setFrontmatterModalSessions((currentSessions) => {
      const nextEntries = Object.entries(currentSessions).filter(([noteId]) => findVaultNote(state.vault.items, noteId))
      if (nextEntries.length === Object.keys(currentSessions).length) return currentSessions
      return Object.fromEntries(nextEntries)
    })
  }, [state.vault.items])

  useEffect(() => {
    setFrontmatterModalSessions({})
    setAisleEditModalOpen(false)
    closeTransientFloatingUi()
  }, [closeTransientFloatingUi, externalStateLoadVersion])

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

  const openVaultManagerSettings = useCallback(() => {
    openUtilityView('settings')
    setSettingsSection('data')
    setDataSettingsSection('storage')
  }, [openUtilityView, setDataSettingsSection, setSettingsSection])

  useEffect(() => {
    return window.electronAPI?.onOpenVaultManager?.(openVaultManagerSettings) ?? (() => undefined)
  }, [openVaultManagerSettings])

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

  const resetShortcutSettings = useCallback(() => {
    setEditingShortcut(null)
    mutateState((previous) => {
      const hotkeys = normalizeHotkeySettings(previous.hotkeys)
      return {
        ...previous,
        hotkeys: {
          ...hotkeys,
          shortcuts: { ...DEFAULT_SHORTCUTS },
        },
      }
    })
  }, [mutateState])

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
      mutateState((previous) => commitVaultAisleMarkdownInState(previous, aisleBodyId, markdown))
    },
    [mutateState],
  )

  const toggleHeadingCollapse = useCallback(
    (noteBodyId: string, aisleId: string, headingKey: string) => {
      if (!noteBodyId || !aisleId || !headingKey) return
      mutateState((previous) => {
        const nextCollapsed = !isHeadingCollapsed(previous.ui.headingCollapseState, noteBodyId, aisleId, headingKey)
        const nextHeadingCollapseState = setHeadingCollapsed(
          previous.ui.headingCollapseState,
          noteBodyId,
          aisleId,
          headingKey,
          nextCollapsed,
        )
        if (nextHeadingCollapseState === previous.ui.headingCollapseState) return previous
        return {
          ...previous,
          ui: {
            ...previous.ui,
            headingCollapseState: nextHeadingCollapseState,
          },
        }
      })
    },
    [mutateState],
  )

  const expandHeadingCollapse = useCallback(
    (noteBodyId: string, aisleId: string, headingKey: string) => {
      if (!noteBodyId || !aisleId || !headingKey) return
      mutateState((previous) => {
        const nextHeadingCollapseState = setHeadingCollapsed(
          previous.ui.headingCollapseState,
          noteBodyId,
          aisleId,
          headingKey,
          false,
        )
        if (nextHeadingCollapseState === previous.ui.headingCollapseState) return previous
        return {
          ...previous,
          ui: {
            ...previous.ui,
            headingCollapseState: nextHeadingCollapseState,
          },
        }
      })
    },
    [mutateState],
  )

  const handleNoteMentionQueryChange = useCallback((mention: NoteMentionQuery | null, anchor: VaultNoteActionPickerAnchor | null) => {
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
        anchor: getAisleCenteredNoteActionPickerAnchor(workspaceRootRef.current, renderedActiveAisleId, anchor),
        actions: ['note-link', 'note-preview', 'independent-copy', 'synced-copy'],
      }
    })
  }, [renderedActiveAisleId])

  const openNoteReferenceFromEditor = useCallback(
    (target: NoteLocation) => {
      navigateToVaultLocationRef.current({
        noteId: target.noteId,
        aisleId: getAisleIdFromNavigationTarget(target),
      })
    },
    [],
  )

  const applyVaultStructureClipboardPaste = useCallback(
    (payload: VaultStructureClipboardPayload, aisleId: string) => {
      if (scratchpadActiveRef.current) return true
      let nextActiveAisleId = ''
      let blockedMessage = ''
      mutateState((previous) => {
        const result = applyVaultStructureClipboardPayload(previous, {
          activeNoteId: previous.vault.activeNoteId,
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

  const applyFrontmatterClipboardPaste = useCallback(
    (payload: FrontmatterClipboardPayload, aisleId: string) => {
      const startedAt = getVaultAppPerfNow()
      let resultStatus = 'applied'
      let noteId = ''
      let noteBodyId = ''
      let aisleBodyId = ''
      let warningCount = 0
      if (scratchpadActiveRef.current) {
        resultStatus = 'scratchpad-ignored'
        recordVaultFrontmatterTiming(
          'frontmatter-clipboard-apply',
          getVaultAppPerfNow() - startedAt,
          {
            result: resultStatus,
            aisleId,
          },
          0,
        )
        return true
      }
      let blockedMessage = ''
      let warningMessages: string[] = []
      mutateState((previous) => {
        const notePath = findVaultNote(previous.vault.items, previous.vault.activeNoteId)
        const noteBody = notePath ? previous.noteBodies.find((body) => body.id === notePath.note.noteBodyId) ?? null : null
        const aisle = noteBody?.aisles.find((candidate) => candidate.id === aisleId) ?? null
        noteId = notePath?.note.id ?? ''
        noteBodyId = noteBody?.id ?? ''
        aisleBodyId = aisle?.aisleBodyId ?? ''
        if (!notePath || !noteBody || !aisle) {
          resultStatus = 'blocked-missing-note'
          blockedMessage = 'Open a note before pasting frontmatter.'
          return previous
        }

        const result = buildFrontmatterClipboardPasteForAisle(
          previous,
          noteBody.id,
          aisle.aisleBodyId,
          { noteId: notePath.note.id },
          payload,
        )
        if (result.status === 'blocked') {
          resultStatus = 'blocked'
          blockedMessage = result.message
          return previous
        }

        warningMessages = result.warnings
        warningCount = result.warnings.length
        resultStatus = warningCount > 0 ? 'applied-with-warnings' : 'applied'
        return updateAisleBodyFrontmatterInState(previous, aisle.aisleBodyId, result.frontmatter, result.saveOptions)
      })
      recordVaultFrontmatterTiming(
        'frontmatter-clipboard-apply',
        getVaultAppPerfNow() - startedAt,
        {
          result: resultStatus,
          noteId,
          noteBodyId,
          aisleId,
          aisleBodyId,
          warningCount,
        },
        0,
      )
      if (blockedMessage) {
        window.alert(blockedMessage)
        return true
      }
      if (warningMessages.length > 0) {
        pushAppToast(warningMessages.join('\n'), 'warning', 9000)
      }
      return true
    },
    [mutateState, pushAppToast],
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
        getVaultMenuViewportSize(),
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

  const vaultEditors = useVaultAisleEditors({
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
    headingCollapseState: state.ui.headingCollapseState,
    onToggleHeadingCollapse: toggleHeadingCollapse,
    onExpandHeadingCollapse: expandHeadingCollapse,
    onNoteMentionQueryChange: handleNoteMentionQueryChange,
    onTagAutocompleteQueryChange: refreshTagAutocompleteFromEditor,
    getAppState: () => stateRef.current,
    onOpenNoteReference: openNoteReferenceFromEditor,
    onVaultStructurePaste: applyVaultStructureClipboardPaste,
    onFrontmatterPaste: applyFrontmatterClipboardPaste,
    hotkeys: state.hotkeys,
    isMacPlatform,
    onOpenShortcutMenu: openShortcutMenuFromEditor,
    onOpenTableOfContents: openTableOfContentsFromEditorShortcut,
    onOpenUrlLinkPrompt: openUrlLinkPrompt,
    onInsertAisleFromNewline: insertAisleFromNewlineShortcut,
    pushToast: pushAppToast,
    externalStateLoadVersion,
  })

  const updateTagAutocompleteRecentKeys = useCallback((keys: string[]) => {
    const normalizedKeys = normalizeTagAutocompleteRecentKeys(keys)
    setTagAutocompleteRecentKeys(normalizedKeys)
    saveTagAutocompleteRecentKeys(normalizedKeys)
  }, [])

  const tagAutocompleteController = useTagAutocompleteController({
    viewMode,
    getAvailableTags: () => tagAutocompleteFilterIndex.availableOptions,
    recentTagKeys: tagAutocompleteRecentKeys,
    onRecentTagKeysChange: updateTagAutocompleteRecentKeys,
    editorRef,
    editorEventRootRef: workspaceRootRef,
    activeAisleIdRef,
    commitActiveEditorMarkdownNow: vaultEditors.commitActiveEditorMarkdownNow,
    syncToolbarFormatState: toolbarState.syncToolbarFormatState,
  })
  tagAutocompleteRefreshRef.current = tagAutocompleteController.refreshQuery

  const diagnosticMountedEditorCount = vaultEditors.mountedAisleIds.size
  useEffect(
    () =>
      configureDiagnosticLogging(
        () => ({
          viewMode,
          activeNoteId: activeModel?.noteId ?? state.vault.activeNoteId ?? '',
          activeNoteBodyId: activeModel?.noteBody.id ?? '',
          activeAisleId: renderedActiveAisleId,
          mountedEditorCount: diagnosticMountedEditorCount,
          openTabCount: state.vault.openTabs?.length ?? 0,
          scratchpadActive,
          messagesSection,
        }),
        () => diagnosticCaptureEnabled,
      ),
    [
      activeModel?.noteBody.id,
      activeModel?.noteId,
      diagnosticCaptureEnabled,
      diagnosticMountedEditorCount,
      messagesSection,
      renderedActiveAisleId,
      scratchpadActive,
      state.vault.activeNoteId,
      state.vault.openTabs,
      viewMode,
    ],
  )

  const openDiagnosticsFolder = useCallback(() => {
    const openFolder = typeof window !== 'undefined' ? window.electronAPI?.openDiagnosticsFolder : undefined
    if (!openFolder) {
      pushAppToast('Diagnostics folder is only available in the desktop app.', 'warning')
      return
    }
    void openFolder()
      .then((result) => {
        if (!result.ok) pushAppToast(result.error || 'Could not open diagnostics folder.', 'error')
      })
      .catch(() => pushAppToast('Could not open diagnostics folder.', 'error'))
  }, [pushAppToast])

  const deleteTodayDiagnosticLogs = useCallback(() => {
    const todayKey = getDiagnosticDayKey()
    if (!diagnosticDays.includes(todayKey)) {
      pushAppToast('No diagnostics for today.')
      return
    }
    void deleteDiagnosticLogDay(todayKey)
      .then((result) => {
        applyDiagnosticDays(result.days)
        if (result.ok) {
          pushAppToast("Deleted today's diagnostics.", 'success')
          return
        }
        pushAppToast(result.error || "Could not delete today's diagnostics.", 'error')
      })
      .catch(() => pushAppToast("Could not delete today's diagnostics.", 'error'))
  }, [applyDiagnosticDays, diagnosticDays, pushAppToast])

  const deleteAllDiagnosticLogs = useCallback(() => {
    if (diagnosticDays.length === 0) {
      pushAppToast('No diagnostic logs to delete.')
      return
    }
    void deleteAllStoredDiagnosticLogs()
      .then((result) => {
        applyDiagnosticDays(result.days)
        if (result.ok) {
          setDiagnosticEntries([])
          pushAppToast('Deleted all diagnostic logs.', 'success')
          return
        }
        pushAppToast(result.error || 'Could not delete diagnostic logs.', 'error')
      })
      .catch(() => pushAppToast('Could not delete diagnostic logs.', 'error'))
  }, [applyDiagnosticDays, diagnosticDays.length, pushAppToast])

  const activateEditorFromAssetTarget = useCallback(
    (target: EventTarget | null) => {
      const element = target instanceof Element ? target : null
      const aisleId = element?.closest<HTMLElement>('.note-aisle-pane')?.dataset.aisleId?.trim()
      const noteBodyId = activeModel?.noteBody.id ?? ''
      if (!aisleId || !noteBodyId) return
      vaultEditors.activateAisleEditor(buildAisleEditorKey(noteBodyId, aisleId))
    },
    [activeModel?.noteBody.id, vaultEditors],
  )

  const commitCurrentEditorContent = useCallback(() => {
    const editor = editorRef.current
    if (editor) vaultEditors.commitActiveEditorMarkdownNow(editor)
    vaultEditors.flushPendingEditorAppStateCommit()
  }, [vaultEditors])

  const pushEditorToolToast = pushAppToast

  const imageToolsController = useImageTools({
    editorRef,
    editorEventRootRef: workspaceRootRef,
    activateEditorFromEventTarget: activateEditorFromAssetTarget,
    commitCurrentEditorContent,
    commitActiveEditorMarkdownNow: vaultEditors.commitActiveEditorMarkdownNow,
    pushToast: pushEditorToolToast,
  })

  const mediaToolsController = useMediaTools({
    editorRef,
    editorEventRootRef: workspaceRootRef,
    activateEditorFromEventTarget: activateEditorFromAssetTarget,
    commitCurrentEditorContent,
    commitActiveEditorMarkdownNow: vaultEditors.commitActiveEditorMarkdownNow,
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
    activeEditorAisleIdRef: vaultEditors.activeEditorAisleIdRef,
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
        getCurrentNoteBodyId: () =>
          getActiveEditorModel(stateRef.current, scratchpadActiveRef.current)?.noteBody.id ?? '',
        hasAisle: (targetAisleId) => {
          const active = getActiveEditorModel(stateRef.current, scratchpadActiveRef.current)
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

  const queueAisleFocusScroll = useCallback(
    (noteBodyId: string, aisleId: string) => {
      if (!noteBodyId || !aisleId) return
      pendingScrollToAisleIdRef.current = aisleId
      scheduleAisleFocusScroll(noteBodyId, aisleId)
    },
    [scheduleAisleFocusScroll],
  )

  useEffect(() => {
    const pendingAisleId = pendingScrollToAisleIdRef.current
    if (viewMode !== 'main' || !activeModel || !pendingAisleId) return
    if (!activeModel.noteBody.aisles.some((aisle) => aisle.id === pendingAisleId)) return
    scheduleAisleFocusScroll(activeModel.noteBody.id, pendingAisleId)
  }, [activeModel, renderedActiveAisleId, scheduleAisleFocusScroll, viewMode])

  const getLatestVaultStateFromMountedEditors = useCallback(() => {
    vaultEditors.flushPendingEditorAppStateCommit()
    const snapshots = vaultEditors.getMountedEditorMarkdownSnapshots()
    return {
      state: applyActiveCursorToState(applyVaultEditorMarkdownSnapshotsToState(stateRef.current, snapshots)),
      pendingEditorCount: snapshots.length,
    }
  }, [applyActiveCursorToState, vaultEditors, stateRef])

  const printAisle = useCallback((aisleId: string) => {
    const printAisleBridge = window.electronAPI?.printAisle
    if (typeof printAisleBridge !== 'function') {
      pushAppToast('Printing is only available in the desktop app.', 'warning')
      return
    }

    const latest = getLatestVaultStateFromMountedEditors()
    const latestModel = activeModelIsScratchpad
      ? getScratchpadEditorModel(latest.state)
      : getActiveNoteModel(latest.state)
    const targetIndex = latestModel?.resolved.aisles.findIndex((aisle) => aisle.id === aisleId) ?? -1
    const targetAisle = targetIndex >= 0 ? latestModel?.resolved.aisles[targetIndex] : null

    if (!latestModel || !targetAisle) {
      pushAppToast('Could not find an aisle to print.', 'warning')
      return
    }

    void printAisleBridge({
      noteTitle: latestModel.title || 'Untitled',
      aisleLabel: `Aisle ${targetIndex + 1}`,
      markdown: targetAisle.markdown,
    })
      .then((result) => {
        if (!result.ok) pushAppToast(result.error || 'Could not print aisle.', 'error')
      })
      .catch(() => pushAppToast('Could not print aisle.', 'error'))
  }, [activeModelIsScratchpad, getLatestVaultStateFromMountedEditors, pushAppToast])

  const exportPdf = useCallback((kind: 'aisle' | 'note', aisleId: string) => {
    const exportPdfBridge = window.electronAPI?.exportPrintPdf
    if (typeof exportPdfBridge !== 'function') {
      pushAppToast('PDF export is only available in the desktop app.', 'warning')
      return
    }

    const latest = getLatestVaultStateFromMountedEditors()
    const latestModel = activeModelIsScratchpad
      ? getScratchpadEditorModel(latest.state)
      : getActiveNoteModel(latest.state)

    if (!latestModel) {
      pushAppToast('Could not find a note to export.', 'warning')
      return
    }

    const noteTitle = latestModel.title || 'Untitled'
    const targetIndex = latestModel.resolved.aisles.findIndex((aisle) => aisle.id === aisleId)
    const targetAisle = targetIndex >= 0 ? latestModel.resolved.aisles[targetIndex] : null
    const payload = kind === 'note'
      ? {
          noteTitle,
          mode: 'note' as const,
          aisles: latestModel.resolved.aisles.map((aisle, index) => ({
            label: `Aisle ${index + 1}`,
            markdown: aisle.markdown,
          })),
        }
      : targetAisle
        ? {
            noteTitle,
            mode: 'aisle' as const,
            aisleLabel: `Aisle ${targetIndex + 1}`,
            markdown: targetAisle.markdown,
          }
        : null

    if (!payload) {
      pushAppToast('Could not find an aisle to export.', 'warning')
      return
    }

    void exportPdfBridge(payload)
      .then((result) => {
        if (!result.ok) {
          pushAppToast(result.error || 'Could not export PDF.', 'error')
          return
        }
        if (!result.canceled) pushAppToast(result.filePath ? `PDF exported to ${result.filePath}` : 'PDF exported.', 'success')
      })
      .catch(() => pushAppToast('Could not export PDF.', 'error'))
  }, [activeModelIsScratchpad, getLatestVaultStateFromMountedEditors, pushAppToast])

  useEffect(() => (
    window.electronAPI?.onPrintActiveAisleRequested?.(() => printAisle(renderedActiveAisleId)) ?? (() => undefined)
  ), [printAisle, renderedActiveAisleId])

  const commitVaultBeforeStorageAction = useCallback(async () => {
    const latest = getLatestVaultStateFromMountedEditors()
    await commitAppStateNow(latest.state, {
      preferSync: true,
      flushQueue: true,
      trigger: 'vault-storage-action',
      pendingEditorCount: latest.pendingEditorCount,
    })
  }, [commitAppStateNow, getLatestVaultStateFromMountedEditors])

  const pushStorageToast = pushAppToast

  const storageProfileController = useStorageProfileController({
    pushToast: pushStorageToast,
    beforeStorageAction: commitVaultBeforeStorageAction,
  })

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
      'note',
      findReplaceQuery,
      findReplaceOptions,
    )
  }, [
    activeModel,
    findReplaceOpen,
    findReplaceOptions,
    findReplaceQuery,
    findReplaceQueryError,
    state,
  ])

  useEffect(() => {
    setFindReplaceActiveIndex((current) =>
      findReplaceMatches.length > 0 ? Math.min(current, findReplaceMatches.length - 1) : 0,
    )
  }, [findReplaceMatches.length])
  const findReplaceActiveMatchIndex =
    findReplaceMatches.length > 0 ? Math.min(findReplaceActiveIndex, findReplaceMatches.length - 1) : 0
  const findReplaceActiveMatch =
    findReplaceOpen && findReplaceMatches.length > 0
      ? findReplaceMatches[findReplaceActiveMatchIndex] ?? null
      : null
  const findReplaceActiveMatchKey = findReplaceActiveMatch
    ? [
        findReplaceQuery,
        findReplaceActiveMatch.id,
        findReplaceActiveMatch.visibleFrom,
        findReplaceActiveMatch.visibleTo,
        findReplaceActiveMatch.markdownFrom,
        findReplaceActiveMatch.markdownTo,
      ].join(':')
    : ''

  useEffect(() => {
    if (!findReplaceActiveMatchKey) return
    setFindReplaceHighlightRequestId((current) => current + 1)
  }, [findReplaceActiveMatchKey])

  useEffect(() => {
    if (!findReplaceActiveMatch) {
      vaultEditors.setActiveFindReplaceMatchHighlight(null)
      return
    }
    vaultEditors.setActiveFindReplaceMatchHighlight({
      noteBodyId: findReplaceActiveMatch.noteBodyId,
      aisleId: findReplaceActiveMatch.aisleId,
      visibleFrom: findReplaceActiveMatch.visibleFrom,
      visibleTo: findReplaceActiveMatch.visibleTo,
      markdownFrom: findReplaceActiveMatch.markdownFrom,
      markdownTo: findReplaceActiveMatch.markdownTo,
      requestId: findReplaceHighlightRequestId,
    })
  }, [findReplaceActiveMatch, findReplaceHighlightRequestId, vaultEditors])

  const clearVaultNavigationTransientUi = useCallback(() => {
    setAisleContextMenu(null)
    setEditorContextMenu(null)
    setTreeContextMenu(null)
    setShortcutMenu(null)
    setNoteActionPicker(null)
    setTableOfContentsPanels(null)
    setLinkPrompt(CLOSED_LINK_PROMPT_STATE)
    toolbarState.closeToolbarPopovers()
  }, [toolbarState])

  const applyVaultNavigationLocation = useCallback(
    (
      location: VaultNavigationLocation,
      options: { tabDisposition?: VaultTabOpenDisposition; restoreClosedTab?: ClosedVaultTab } = {},
    ) => {
      const navigationStartedAt = getVaultAppPerfNow()
      const navigationKind = options.restoreClosedTab
        ? 'restore-closed-tab'
        : options.tabDisposition ?? 'temporary'
      let phaseStartedAt = getVaultAppPerfNow()
      vaultEditors.flushPendingEditorAppStateCommit()
      const flushDurationMs = getVaultAppPerfNow() - phaseStartedAt
      phaseStartedAt = getVaultAppPerfNow()
      const snapshots = vaultEditors.getMountedEditorMarkdownSnapshots()
      const snapshotDurationMs = getVaultAppPerfNow() - phaseStartedAt
      const snapshotCount = snapshots.length
      const collapsedSnapshotCount = new Set(snapshots.map((snapshot) => snapshot.aisleBodyId).filter(Boolean)).size
      phaseStartedAt = getVaultAppPerfNow()
      const snapshotState = applyVaultEditorMarkdownSnapshotsToState(stateRef.current, snapshots)
      const snapshotApplyDurationMs = getVaultAppPerfNow() - phaseStartedAt
      phaseStartedAt = getVaultAppPerfNow()
      const resolvedLocation = resolveVaultNavigationLocation(snapshotState, location)
      const resolveDurationMs = getVaultAppPerfNow() - phaseStartedAt
      if (!resolvedLocation) {
        recordVaultNavigationTiming('vault-navigation', getVaultAppPerfNow() - navigationStartedAt, {
          result: 'unresolved',
          navigationKind,
          requestedNoteId: location.noteId,
          requestedAisleId: location.aisleId ?? '',
          flushDurationMs: roundVaultAppDiagnosticMs(flushDurationMs),
          snapshotDurationMs: roundVaultAppDiagnosticMs(snapshotDurationMs),
          snapshotApplyDurationMs: roundVaultAppDiagnosticMs(snapshotApplyDurationMs),
          resolveDurationMs: roundVaultAppDiagnosticMs(resolveDurationMs),
          snapshotCount,
          collapsedSnapshotCount,
        })
        return false
      }
      const targetNoteBodyId = findVaultNote(snapshotState.vault.items, resolvedLocation.noteId)?.note.noteBodyId ?? ''

      pendingFocusToAisleIdRef.current = resolvedLocation.aisleId || null
      pendingScrollToAisleIdRef.current = resolvedLocation.aisleId || null
      pendingNavigationTopAisleIdRef.current = null
      setActiveAisleId(resolvedLocation.aisleId)
      setActiveFolderId(getContainingFolderId(snapshotState.vault.items, resolvedLocation.noteId) ?? '')
      setSelectedTreeNoteIds([resolvedLocation.noteId])
      setTreeSelectionAnchorNoteId(resolvedLocation.noteId)
      clearVaultNavigationTransientUi()
      phaseStartedAt = getVaultAppPerfNow()
      mutateState((previous) => {
        const previousWithEditorContent = applyVaultEditorMarkdownSnapshotsToState(previous, snapshots)
        const previousWithCursor = applyActiveCursorToState(previousWithEditorContent)
        const tabDisposition = options.tabDisposition ?? 'temporary'
        const vault = options.restoreClosedTab
          ? restoreClosedVaultTab(previousWithCursor.vault, options.restoreClosedTab)
          : tabDisposition === 'retained'
            ? openVaultRetainedTab(previousWithCursor.vault, resolvedLocation.noteId)
            : tabDisposition === 'preserve'
              ? focusVaultOpenTab(previousWithCursor.vault, resolvedLocation.noteId)
              : openVaultTemporaryTab(previousWithCursor.vault, resolvedLocation.noteId)
        if (vault === previousWithCursor.vault) return previousWithCursor
        return {
          ...previousWithCursor,
          vault,
        }
      })
      const mutateStateDurationMs = getVaultAppPerfNow() - phaseStartedAt
      setViewMode('main')
      setScratchpadActive(false)
      scheduleAisleFocusScroll(targetNoteBodyId, resolvedLocation.aisleId)
      window.requestAnimationFrame(() => {
        if (pendingFocusToAisleIdRef.current !== (resolvedLocation.aisleId || null)) return
        const active = getActiveNoteModel(stateRef.current)
        if (!active || active.noteId !== resolvedLocation.noteId) return
        if (!active.noteBody.aisles.some((aisle) => aisle.id === resolvedLocation.aisleId)) return
        const focusStartedAt = getVaultAppPerfNow()
        const activated = vaultEditors.activateAisleEditor(buildAisleEditorKey(active.noteBody.id, resolvedLocation.aisleId), {
          focus: true,
          source: 'programmatic',
        })
        recordVaultNavigationTiming(
          'vault-navigation-focus-activation',
          getVaultAppPerfNow() - focusStartedAt,
          {
            navigationKind,
            noteId: resolvedLocation.noteId,
            noteBodyId: active.noteBody.id,
            aisleId: resolvedLocation.aisleId,
            activated,
            mountedEditorCount: vaultEditors.mountedAisleIds.size,
          },
          VAULT_NAVIGATION_FOCUS_TIMING_DIAGNOSTIC_THRESHOLD_MS,
        )
      })
      recordVaultNavigationTiming('vault-navigation', getVaultAppPerfNow() - navigationStartedAt, {
        result: 'applied',
        navigationKind,
        requestedNoteId: location.noteId,
        requestedAisleId: location.aisleId ?? '',
        noteId: resolvedLocation.noteId,
        noteBodyId: targetNoteBodyId,
        aisleId: resolvedLocation.aisleId,
        flushDurationMs: roundVaultAppDiagnosticMs(flushDurationMs),
        snapshotDurationMs: roundVaultAppDiagnosticMs(snapshotDurationMs),
        snapshotApplyDurationMs: roundVaultAppDiagnosticMs(snapshotApplyDurationMs),
        resolveDurationMs: roundVaultAppDiagnosticMs(resolveDurationMs),
        mutateStateDurationMs: roundVaultAppDiagnosticMs(mutateStateDurationMs),
        snapshotCount,
        collapsedSnapshotCount,
        mountedEditorCount: vaultEditors.mountedAisleIds.size,
      })
      return true
    },
    [applyActiveCursorToState, clearVaultNavigationTransientUi, mutateState, vaultEditors, scheduleAisleFocusScroll, stateRef],
  )

  const selectNoteTab = useCallback(
    (noteId: string) => {
      applyVaultNavigationLocation({ noteId, aisleId: '' }, { tabDisposition: 'preserve' })
    },
    [applyVaultNavigationLocation],
  )

  const cyclePinnedNoteTab = useCallback(
    (direction: -1 | 1) => {
      const noteId = getVaultRetainedTabCycleTarget(stateRef.current.vault, direction)
      if (!noteId || noteId === stateRef.current.vault.activeNoteId) return
      selectNoteTab(noteId)
    },
    [selectNoteTab, stateRef],
  )

  const rememberClosedNoteTab = useCallback((closedTab: ClosedVaultTab | null) => {
    if (!closedTab) return
    closedNoteTabHistoryRef.current = [
      closedTab,
      ...closedNoteTabHistoryRef.current.filter((entry) => entry.noteId !== closedTab.noteId),
    ].slice(0, CLOSED_NOTE_TAB_HISTORY_LIMIT)
  }, [])

  const reopenClosedNoteTab = useCallback(() => {
    while (closedNoteTabHistoryRef.current.length > 0) {
      const [closedTab, ...remainingClosedTabs] = closedNoteTabHistoryRef.current
      closedNoteTabHistoryRef.current = remainingClosedTabs
      if (!closedTab || !findVaultNote(stateRef.current.vault.items, closedTab.noteId)) continue
      const restored = applyVaultNavigationLocation(
        { noteId: closedTab.noteId, aisleId: '' },
        { restoreClosedTab: closedTab },
      )
      if (restored) return
    }
  }, [applyVaultNavigationLocation, stateRef])

  const promoteNoteTab = useCallback(
    (noteId: string) => {
      mutateState((previous) => ({
        ...previous,
        vault: promoteVaultTemporaryTab(previous.vault, noteId),
      }))
    },
    [mutateState],
  )

  const reorderNoteTabs = useCallback(
    (sourceNoteId: string, targetIndex: number) => {
      mutateState((previous) => ({
        ...previous,
        vault: reorderVaultTabs(previous.vault, sourceNoteId, targetIndex),
      }))
    },
    [mutateState],
  )

  const closeNoteTab = useCallback(
    (noteId: string) => {
      const navigationStartedAt = getVaultAppPerfNow()
      let phaseStartedAt = getVaultAppPerfNow()
      vaultEditors.flushPendingEditorAppStateCommit()
      const flushDurationMs = getVaultAppPerfNow() - phaseStartedAt
      phaseStartedAt = getVaultAppPerfNow()
      const snapshots = vaultEditors.getMountedEditorMarkdownSnapshots()
      const snapshotDurationMs = getVaultAppPerfNow() - phaseStartedAt
      const snapshotCount = snapshots.length
      const collapsedSnapshotCount = new Set(snapshots.map((snapshot) => snapshot.aisleBodyId).filter(Boolean)).size
      phaseStartedAt = getVaultAppPerfNow()
      const snapshotState = applyVaultEditorMarkdownSnapshotsToState(stateRef.current, snapshots)
      const snapshotApplyDurationMs = getVaultAppPerfNow() - phaseStartedAt
      phaseStartedAt = getVaultAppPerfNow()
      const closedTab = getClosedVaultTab(snapshotState.vault, noteId)
      const nextVault = closeVaultTab(snapshotState.vault, noteId)
      const activeChanged = nextVault.activeNoteId !== snapshotState.vault.activeNoteId
      const resolvedLocation = activeChanged && nextVault.activeNoteId
        ? resolveVaultNavigationLocation({ ...snapshotState, vault: nextVault }, { noteId: nextVault.activeNoteId })
        : null
      const resolveDurationMs = getVaultAppPerfNow() - phaseStartedAt

      if (activeChanged && !resolvedLocation) {
        recordVaultNavigationTiming('vault-tab-close-navigation', getVaultAppPerfNow() - navigationStartedAt, {
          result: 'unresolved',
          closedNoteId: noteId,
          activeChanged,
          flushDurationMs: roundVaultAppDiagnosticMs(flushDurationMs),
          snapshotDurationMs: roundVaultAppDiagnosticMs(snapshotDurationMs),
          snapshotApplyDurationMs: roundVaultAppDiagnosticMs(snapshotApplyDurationMs),
          resolveDurationMs: roundVaultAppDiagnosticMs(resolveDurationMs),
          snapshotCount,
          collapsedSnapshotCount,
        })
        return
      }
      rememberClosedNoteTab(closedTab)

      if (noteId === renamingTreeItemId) {
        setRenamingTreeItemId('')
        setRenamingItemSurface(null)
        setTreeRenameDraft('')
      }

      if (resolvedLocation) {
        pendingFocusToAisleIdRef.current = resolvedLocation.aisleId || null
        pendingScrollToAisleIdRef.current = resolvedLocation.aisleId || null
        pendingNavigationTopAisleIdRef.current = null
        setActiveAisleId(resolvedLocation.aisleId)
        clearVaultNavigationTransientUi()
      }

      phaseStartedAt = getVaultAppPerfNow()
      mutateState((previous) => {
        const previousWithEditorContent = applyVaultEditorMarkdownSnapshotsToState(previous, snapshots)
        const previousWithCursor = applyActiveCursorToState(previousWithEditorContent)
        const vault = closeVaultTab(previousWithCursor.vault, noteId)
        return vault === previousWithCursor.vault ? previousWithCursor : { ...previousWithCursor, vault }
      })
      const mutateStateDurationMs = getVaultAppPerfNow() - phaseStartedAt

      if (!resolvedLocation) {
        recordVaultNavigationTiming('vault-tab-close-navigation', getVaultAppPerfNow() - navigationStartedAt, {
          result: 'closed-inactive',
          closedNoteId: noteId,
          activeChanged,
          flushDurationMs: roundVaultAppDiagnosticMs(flushDurationMs),
          snapshotDurationMs: roundVaultAppDiagnosticMs(snapshotDurationMs),
          snapshotApplyDurationMs: roundVaultAppDiagnosticMs(snapshotApplyDurationMs),
          resolveDurationMs: roundVaultAppDiagnosticMs(resolveDurationMs),
          mutateStateDurationMs: roundVaultAppDiagnosticMs(mutateStateDurationMs),
          snapshotCount,
          collapsedSnapshotCount,
          mountedEditorCount: vaultEditors.mountedAisleIds.size,
        })
        return
      }
      setViewMode('main')
      setScratchpadActive(false)
      const targetNoteBodyId = findVaultNote(nextVault.items, resolvedLocation.noteId)?.note.noteBodyId ?? ''
      scheduleAisleFocusScroll(targetNoteBodyId, resolvedLocation.aisleId)
      window.requestAnimationFrame(() => {
        if (pendingFocusToAisleIdRef.current !== (resolvedLocation.aisleId || null)) return
        const active = getActiveNoteModel(stateRef.current)
        if (!active || active.noteId !== resolvedLocation.noteId) return
        if (!active.noteBody.aisles.some((aisle) => aisle.id === resolvedLocation.aisleId)) return
        const focusStartedAt = getVaultAppPerfNow()
        const activated = vaultEditors.activateAisleEditor(buildAisleEditorKey(active.noteBody.id, resolvedLocation.aisleId), {
          focus: true,
          source: 'programmatic',
        })
        recordVaultNavigationTiming(
          'vault-navigation-focus-activation',
          getVaultAppPerfNow() - focusStartedAt,
          {
            navigationKind: 'close-tab',
            noteId: resolvedLocation.noteId,
            noteBodyId: active.noteBody.id,
            aisleId: resolvedLocation.aisleId,
            activated,
            mountedEditorCount: vaultEditors.mountedAisleIds.size,
          },
          VAULT_NAVIGATION_FOCUS_TIMING_DIAGNOSTIC_THRESHOLD_MS,
        )
      })
      recordVaultNavigationTiming('vault-tab-close-navigation', getVaultAppPerfNow() - navigationStartedAt, {
        result: 'switched-active',
        closedNoteId: noteId,
        noteId: resolvedLocation.noteId,
        noteBodyId: targetNoteBodyId,
        aisleId: resolvedLocation.aisleId,
        activeChanged,
        flushDurationMs: roundVaultAppDiagnosticMs(flushDurationMs),
        snapshotDurationMs: roundVaultAppDiagnosticMs(snapshotDurationMs),
        snapshotApplyDurationMs: roundVaultAppDiagnosticMs(snapshotApplyDurationMs),
        resolveDurationMs: roundVaultAppDiagnosticMs(resolveDurationMs),
        mutateStateDurationMs: roundVaultAppDiagnosticMs(mutateStateDurationMs),
        snapshotCount,
        collapsedSnapshotCount,
        mountedEditorCount: vaultEditors.mountedAisleIds.size,
      })
    },
    [
      applyActiveCursorToState,
      clearVaultNavigationTransientUi,
      mutateState,
      vaultEditors,
      renamingTreeItemId,
      rememberClosedNoteTab,
      scheduleAisleFocusScroll,
      stateRef,
    ],
  )

  navigateToVaultLocationRef.current = applyVaultNavigationLocation

  const resolveVaultNavigationHistoryLocation = useCallback(
    (location: VaultNavigationLocation) => resolveVaultNavigationLocation(stateRef.current, location),
    [stateRef],
  )

  const applyVaultNavigationHistoryLocation = useCallback(
    (location: VaultNavigationLocation) => {
      applyVaultNavigationLocation(location, { tabDisposition: 'preserve' })
    },
    [applyVaultNavigationLocation],
  )

  const { navigateVaultHistoryBy } = useVaultNavigationHistory({
    viewMode,
    activeNoteId: activeVaultModel?.noteId ?? '',
    resolveLocation: resolveVaultNavigationHistoryLocation,
    onApplyLocation: applyVaultNavigationHistoryLocation,
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
    activateAisleEditor: vaultEditors.activateAisleEditor,
  })

  const updateFindReplaceUi = useCallback(
    (patch: Partial<Pick<
      AppState['ui'],
      'findCaseSensitive' | 'findWholeWord' | 'findRegex'
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
    () => {
      if (!activeModel) return
      const editor = editorRef.current
      if (editor) vaultEditors.commitActiveEditorMarkdownNow(editor)
      vaultEditors.flushPendingEditorAppStateCommit()
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
    },
    [activeModel, vaultEditors, toolbarState],
  )

  const closeFindReplace = useCallback(() => {
    pendingFindReplaceRevealRef.current = null
    setFindReplaceOpen(false)
  }, [])

  const scrollPendingFindReplaceMatch = useCallback(() => {
    const match = pendingFindReplaceRevealRef.current
    if (!match || viewMode !== 'main' || !activeModel || activeModel.noteId !== match.location.noteId) return false
    if (renderedActiveAisleId !== match.aisleId || !vaultEditors.mountedAisleIds.has(match.aisleId)) return false
    pendingFindReplaceRevealRef.current = null
    vaultEditors.activateAisleEditor(buildAisleEditorKey(match.noteBodyId, match.aisleId), {
      focus: true,
      source: 'programmatic',
    })
    return vaultEditors.scrollToAisleFindReplaceMatch(match.aisleId, {
      visibleFrom: match.visibleFrom,
      visibleTo: match.visibleTo,
      markdownFrom: match.markdownFrom,
      markdownTo: match.markdownTo,
    })
  }, [activeModel, vaultEditors, renderedActiveAisleId, viewMode])

  useEffect(() => {
    scrollPendingFindReplaceMatch()
  }, [scrollPendingFindReplaceMatch])

  const revealFindReplaceMatch = useCallback(
    (match: FindReplaceMatch) => {
      pendingFindReplaceRevealRef.current = match
      if (match.context.noteKind === 'scratchpad') {
        setViewMode('main')
        setScratchpadActive(true)
        setActiveAisleId(match.aisleId)
        scheduleAisleFocusScroll(match.noteBodyId, match.aisleId)
        window.requestAnimationFrame(() => {
          scrollPendingFindReplaceMatch()
        })
        return
      }
      if (activeModel?.noteId !== match.location.noteId) {
        applyVaultNavigationLocation({ noteId: match.location.noteId, aisleId: match.aisleId })
        return
      }
      setViewMode('main')
      setActiveAisleId(match.aisleId)
      scheduleAisleFocusScroll(match.noteBodyId, match.aisleId)
      window.requestAnimationFrame(() => {
        scrollPendingFindReplaceMatch()
      })
    },
    [activeModel?.noteId, applyVaultNavigationLocation, scheduleAisleFocusScroll, scrollPendingFindReplaceMatch],
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
    vaultEditors.flushPendingEditorAppStateCommit()
    setFindReplaceQuery(nextQuery)
    setFindReplaceActiveIndex(0)
  }, [vaultEditors])

  const replaceFindMatches = useCallback(
    (matchesToReplace: FindReplaceMatch[]) => {
      if (matchesToReplace.length === 0 || findReplaceQueryError) return
      pendingFindReplaceRevealRef.current = null
      mutateState((previous) => {
        const snapshots = vaultEditors.getMountedEditorMarkdownSnapshots()
        const latest = applyActiveCursorToState(applyVaultEditorMarkdownSnapshotsToState(previous, snapshots))
        return applyFindReplacementToState(latest, matchesToReplace, findReplaceReplacement).state
      })
    },
    [
      applyActiveCursorToState,
      findReplaceQueryError,
      findReplaceReplacement,
      mutateState,
      vaultEditors,
    ],
  )

  useEffect(() => {
    const handleFindReplaceShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || viewMode !== 'main' || !activeModel) return
      const mode = getFindReplaceShortcutMode(event, isMacPlatform)
      if (!mode) return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      openFindReplace()
    }
    window.addEventListener('keydown', handleFindReplaceShortcut, true)
    return () => {
      window.removeEventListener('keydown', handleFindReplaceShortcut, true)
    }
  }, [activeModel, isMacPlatform, openFindReplace, viewMode])

  const focusBoundaryFlushTimerRef = useRef<number | null>(null)

  const clearVaultFocusBoundaryFlush = useCallback(() => {
    if (focusBoundaryFlushTimerRef.current === null) return
    window.clearTimeout(focusBoundaryFlushTimerRef.current)
    focusBoundaryFlushTimerRef.current = null
  }, [])

  const flushVaultPersistenceNow = useCallback((eventName: 'blur' | 'visibilitychange' | 'beforeunload' | 'pagehide') => {
    clearVaultFocusBoundaryFlush()
    const latest = getLatestVaultStateFromMountedEditors()
    void commitAppStateNow(latest.state, {
      preferSync: eventName === 'beforeunload' || eventName === 'pagehide',
      flushQueue: true,
      trigger: `vault-editor-focus-boundary:${eventName}`,
      pendingEditorCount: latest.pendingEditorCount,
    })
  }, [clearVaultFocusBoundaryFlush, commitAppStateNow, getLatestVaultStateFromMountedEditors])

  const scheduleVaultFocusBoundaryFlush = useCallback((eventName: 'blur' | 'visibilitychange') => {
    if (eventName === 'visibilitychange' && document.visibilityState !== 'hidden') return
    if (focusBoundaryFlushTimerRef.current !== null) return
    focusBoundaryFlushTimerRef.current = window.setTimeout(() => {
      focusBoundaryFlushTimerRef.current = null
      flushVaultPersistenceNow(eventName)
    }, VAULT_FOCUS_BOUNDARY_FLUSH_DELAY_MS)
  }, [flushVaultPersistenceNow])

  useEffect(() => {
    const flushOnExit = (event: PageTransitionEvent | Event) => {
      flushVaultPersistenceNow(event.type === 'pagehide' ? 'pagehide' : 'beforeunload')
    }
    window.addEventListener('beforeunload', flushOnExit)
    window.addEventListener('pagehide', flushOnExit)
    return () => {
      window.removeEventListener('beforeunload', flushOnExit)
      window.removeEventListener('pagehide', flushOnExit)
    }
  }, [flushVaultPersistenceNow])

  useEffect(() => {
    const flushOnWindowBlur = () => scheduleVaultFocusBoundaryFlush('blur')
    const flushOnHidden = () => scheduleVaultFocusBoundaryFlush('visibilitychange')
    window.addEventListener('blur', flushOnWindowBlur)
    document.addEventListener('visibilitychange', flushOnHidden)
    return () => {
      window.removeEventListener('blur', flushOnWindowBlur)
      document.removeEventListener('visibilitychange', flushOnHidden)
      clearVaultFocusBoundaryFlush()
    }
  }, [clearVaultFocusBoundaryFlush, scheduleVaultFocusBoundaryFlush])

  const tableControlsController = useTableControls({
    visible: viewMode === 'main' && !aisleEditModalOpen,
    editorRef,
    editorEventRootRef: workspaceRootRef,
    commitActiveEditorMarkdownNow: vaultEditors.commitActiveEditorMarkdownNow,
    syncToolbarFormatState: toolbarState.syncToolbarFormatState,
  })

  const listReorderControlsController = useListReorderControls({
    visible: viewMode === 'main' && !aisleEditModalOpen,
    editorRef,
    editorEventRootRef: workspaceRootRef,
    commitActiveEditorMarkdownNow: vaultEditors.commitActiveEditorMarkdownNow,
    syncToolbarFormatState: toolbarState.syncToolbarFormatState,
  })

  const beginCreatedTreeRename = useCallback((pending: PendingCreatedTreeRename, title: string) => {
    pendingCreatedTreeRenameRef.current = pending
    pendingCreatedEditRef.current = pending
    skipNextTreeRenameCommitRef.current = false
    setRenamingTreeItemId(pending.itemId)
    setRenamingItemSurface('tree')
    setTreeRenameDraft(title)
  }, [])

  const finishCreatedTreeRename = useCallback(
    (itemId: string, source: VaultTreeRenameCommitSource) => {
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
        vaultEditors.activateAisleEditor(buildAisleEditorKey(pending.returnNoteBodyId, pending.returnAisleId), {
          focus: true,
          source: 'programmatic',
        })
      })
      return pending
    },
    [vaultEditors, pendingCursorRestoreRef],
  )

  const recordSidebarSearchHistory = useCallback((queryToRecord: string) => {
    const entry = normalizeSidebarSearchHistoryEntry(queryToRecord)
    if (!entry) return
    setSidebarSearchHistory((current) => {
      const next = appendSidebarSearchHistoryEntry(current, entry)
      saveSidebarSearchHistory(next)
      return next
    })
  }, [])

  const clearSidebarSearchHistory = useCallback(() => {
    setSidebarSearchHistory([])
    saveSidebarSearchHistory([])
  }, [])

  const clearSidebarSearch = useCallback(() => {
    recordSidebarSearchHistory(query)
    setQuery('')
  }, [query, recordSidebarSearchHistory])

  const closeSidebarSearchMode = useCallback(() => {
    clearSidebarSearch()
    setSidebarSearchMode(false)
  }, [clearSidebarSearch])

  const createNoteAt = useCallback((targetParentFolderId?: string | null, targetIndex?: number) => {
    const createdRenameRef: { current: PendingCreatedTreeRename | null } = { current: null }
    const parentFolderIdRef: { current: string | null } = { current: null }
    closeSidebarSearchMode()
    setScratchpadActive(false)
    mutateState((previous) => {
      const parentFolderId = targetParentFolderId === undefined
        ? activeFolderId && findVaultFolder(previous.vault.items, activeFolderId)
          ? activeFolderId
          : null
        : targetParentFolderId && findVaultFolder(previous.vault.items, targetParentFolderId)
          ? targetParentFolderId
          : null
      parentFolderIdRef.current = parentFolderId
      const result = createVaultNoteInState(previous, 'Untitled', parentFolderId, '', undefined, targetIndex)
      createdRenameRef.current = {
        kind: 'note',
        itemId: result.noteId,
        noteBodyId: result.noteBodyId,
        aisleId: result.aisleId,
      }
      return {
        ...result.state,
        ui: revealVaultTreeForCreatedItem(result.state.ui, [parentFolderId]),
      }
    })
    const createdRename = createdRenameRef.current
    if (createdRename) {
      beginCreatedTreeRename(createdRename, 'Untitled')
      if (createdRename.kind === 'note') setActiveAisleId(createdRename.aisleId)
    }
    setActiveFolderId(parentFolderIdRef.current ?? '')
    setSelectedTreeNoteIds([])
    setTreeSelectionAnchorNoteId('')
    setViewMode('main')
  }, [beginCreatedTreeRename, closeSidebarSearchMode, mutateState, activeFolderId])

  const createFolderAt = useCallback((targetParentFolderId?: string | null, targetIndex?: number) => {
    const createdRenameRef: { current: PendingCreatedTreeRename | null } = { current: null }
    const returnNoteBodyId = activeVaultModel?.noteBody.id ?? ''
    const returnAisleId = activeVaultModel
      ? getPreferredVaultAisleId(stateRef.current, activeVaultModel.noteId, activeVaultModel.noteBody.aisles)
      : ''
    closeSidebarSearchMode()
    setScratchpadActive(false)
    mutateState((previous) => {
      const parentFolderId = targetParentFolderId === undefined
        ? activeFolderId && findVaultFolder(previous.vault.items, activeFolderId)
          ? activeFolderId
          : null
        : targetParentFolderId && findVaultFolder(previous.vault.items, targetParentFolderId)
          ? targetParentFolderId
          : null
      const result = createVaultFolderInState(previous, 'Untitled folder', parentFolderId, undefined, targetIndex)
      createdRenameRef.current = {
        kind: 'folder',
        itemId: result.folderId,
        returnNoteBodyId,
        returnAisleId,
      }
      return {
        ...result.state,
        ui: revealVaultTreeForCreatedItem(result.state.ui, [parentFolderId, result.folderId]),
      }
    })
    const createdRename = createdRenameRef.current
    if (createdRename) {
      beginCreatedTreeRename(createdRename, 'Untitled folder')
      setActiveFolderId(createdRename.itemId)
    }
    setSelectedTreeNoteIds([])
    setTreeSelectionAnchorNoteId('')
    setViewMode('main')
  }, [activeVaultModel, beginCreatedTreeRename, closeSidebarSearchMode, mutateState, activeFolderId, stateRef])

  const importVault = useCallback(() => {
    if (!window.electronAPI?.openVaultImportSource) {
      window.alert('Vault import is only available in the desktop app.')
      return
    }
    void window.electronAPI.openVaultImportSource().then(async (result) => {
      if (result.canceled) return
      if (!result.ok) {
        window.alert(result.error || 'Vault import failed.')
        return
      }
      if (result.kind === 'vault-folder' || result.kind === 'vault-zip') {
        setState(parseSavedState(result.serializedState))
        setViewMode('main')
        return
      }
      if (result.kind === 'markdown-folder' || result.kind === 'markdown-zip') {
        try {
          const latest = getLatestVaultStateFromMountedEditors()
          const imported = await importMarkdownIntoExistingVault(latest.state, result.files, {
            rootName: result.rootName,
            assetRoots: result.assetRoots,
            assets: result.kind === 'markdown-zip' ? result.assets : undefined,
            readAsset: result.kind === 'markdown-folder' && window.electronAPI?.readFolderImportAsset
              ? (payload) => window.electronAPI!.readFolderImportAsset!({ sourceId: result.sourceId, ...payload })
              : undefined,
          })
          mutateState(() => ({
            ...imported.state,
            ui: revealVaultTreeForCreatedItem(imported.state.ui, [imported.rootFolderId]),
          }))
          setScratchpadActive(false)
          setActiveFolderId(imported.rootFolderId)
          setSelectedTreeNoteIds([])
          setTreeSelectionAnchorNoteId('')
        } catch (error) {
          window.alert(error instanceof Error ? error.message : 'Markdown import failed.')
          return
        }
        setViewMode('main')
        return
      }
      window.alert('Selected file is not an AisleNote vault or Markdown import source.')
    })
  }, [getLatestVaultStateFromMountedEditors, mutateState, setState])

  const exportVault = useCallback(() => {
    if (!window.electronAPI?.exportVaultFolder) {
      window.alert('Vault export is only available in the desktop app.')
      return
    }
    void window.electronAPI.exportVaultFolder({ serializedState: JSON.stringify(state) }).then((result) => {
      if (result.canceled || result.ok) return
      window.alert(result.error || 'Vault export failed.')
    })
  }, [state])

  const renameItem = useCallback(
    (itemId: string, title: string) => {
      mutateState((previous) => ({
        ...previous,
        vault: renameVaultItem(previous.vault, itemId, title),
      }))
    },
    [mutateState],
  )

  const startTreeRename = useCallback((itemId: string, title: string, surface: VaultRenameSurface = 'tree') => {
    skipNextTreeRenameCommitRef.current = false
    skipTreeRenameBlurItemIdRef.current = ''
    setRenamingTreeItemId(itemId)
    setRenamingItemSurface(surface)
    setTreeRenameDraft(title)
  }, [])

  const startNoteTabRename = useCallback(
    (noteId: string, title: string) => {
      startTreeRename(noteId, title, 'tab')
    },
    [startTreeRename],
  )

  const commitTreeRename = useCallback((source: VaultTreeRenameCommitSource) => {
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
      const entry = findVaultItem(stateRef.current.vault.items, pendingCreatedRename.itemId)
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
    setRenamingItemSurface(null)
    setTreeRenameDraft('')
  }, [createFolderAt, createNoteAt, finishCreatedTreeRename, renameItem, renamingTreeItemId, stateRef, treeRenameDraft])

  const commitActiveTreeRenameBeforeCreate = useCallback(() => {
    if (!renamingTreeItemId) return
    renameItem(renamingTreeItemId, treeRenameDraft)
    if (pendingCreatedTreeRenameRef.current?.itemId === renamingTreeItemId) {
      pendingCreatedTreeRenameRef.current = null
      pendingCreatedEditRef.current = null
    }
    skipNextTreeRenameCommitRef.current = false
    skipTreeRenameBlurItemIdRef.current = renamingTreeItemId
    setRenamingTreeItemId('')
    setRenamingItemSurface(null)
    setTreeRenameDraft('')
  }, [renameItem, renamingTreeItemId, treeRenameDraft])

  const createNote = useCallback(() => {
    commitActiveTreeRenameBeforeCreate()
    createNoteAt()
  }, [commitActiveTreeRenameBeforeCreate, createNoteAt])

  const createFolder = useCallback(() => {
    commitActiveTreeRenameBeforeCreate()
    createFolderAt()
  }, [commitActiveTreeRenameBeforeCreate, createFolderAt])

  const cancelTreeRename = useCallback(() => {
    skipNextTreeRenameCommitRef.current = false
    skipTreeRenameBlurItemIdRef.current = renamingTreeItemId
    if (pendingCreatedTreeRenameRef.current?.itemId === renamingTreeItemId) {
      pendingCreatedTreeRenameRef.current = null
      pendingCreatedEditRef.current = null
    }
    setRenamingTreeItemId('')
    setRenamingItemSurface(null)
    setTreeRenameDraft('')
  }, [renamingTreeItemId])

  const updateTreeDropTarget = useCallback((target: VaultTreeDropTarget | null) => {
    setTreeDropTarget((current) => (areVaultTreeDropTargetsEqual(current, target) ? current : target))
  }, [])

  const startTreeDrag = useCallback((itemId: string) => {
    setRenamingTreeItemId('')
    setRenamingItemSurface(null)
    setTreeRenameDraft('')
    const entry = findVaultItem(stateRef.current.vault.items, itemId)
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
      setActiveFolderId('')
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
    (target: VaultTreeDropTarget) => {
      const draggedItemId = draggingTreeItemId
      if (!draggedItemId) return
      const draggedNoteIds = draggingTreeNoteIds
      mutateState((previous) => {
        const shouldExpandDropParent =
          Boolean(target.parentFolderId) &&
          (draggedNoteIds.length === 0 || previous.ui.noteDropAutoExpandsFolders === true)
        const vault =
          draggedNoteIds.length > 0
            ? moveVaultItems(previous.vault, draggedNoteIds, target.parentFolderId, target.index)
            : moveVaultItem(previous.vault, draggedItemId, target.parentFolderId, target.index)
        if (vault === previous.vault) return previous
        return {
          ...previous,
          vault,
          ui: shouldExpandDropParent
            ? {
                ...previous.ui,
                collapsedFolderIds: previous.ui.collapsedFolderIds.filter((folderId) => folderId !== target.parentFolderId),
              }
            : previous.ui,
        }
      })
      if (draggedNoteIds.length === 0) setActiveFolderId(target.parentFolderId ?? '')
      finishTreeDrag()
    },
    [draggingTreeItemId, draggingTreeNoteIds, finishTreeDrag, mutateState],
  )

  const getRootTreeDropTarget = useCallback(
    (): VaultTreeDropTarget => ({
      parentFolderId: null,
      index: stateRef.current.vault.items.length,
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
    (menu: VaultTreeContextMenuState) => {
      toolbarState.closeToolbarPopovers()
      setAisleContextMenu(null)
      setEditorContextMenu(null)
      setShortcutMenu(null)
      setTreeContextMenu(menu)
    },
    [toolbarState],
  )

  const openRootTreeContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('.vault-tree-row, .tab-context-menu')) return
      event.preventDefault()
      event.stopPropagation()
      setActiveFolderId('')
      setSelectedTreeNoteIds([])
      setTreeSelectionAnchorNoteId('')
      openTreeContextMenu({
        kind: 'root',
        x: event.clientX,
        y: event.clientY,
      })
    },
    [openTreeContextMenu],
  )

  const clearActiveFolderFromRootTreeClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target : null
    if (target?.closest('.vault-tree-row, .tab-context-menu')) return
    setActiveFolderId('')
    setSelectedTreeNoteIds([])
    setTreeSelectionAnchorNoteId('')
  }, [])

  const deleteItems = useCallback(
    (itemIds: string[]) => {
      const targetItemIds = Array.from(new Set(itemIds.filter(Boolean)))
      if (targetItemIds.length === 0) return
      const targetItemIdSet = new Set(targetItemIds)
      const activeNoteId = stateRef.current.vault.activeNoteId
      if (deletedVaultItemsContainNoteId(stateRef.current.vault.items, targetItemIds, activeNoteId)) {
        suppressActiveNoteTreeRevealForDeleteRef.current = activeNoteId
      }
      mutateState((previous) => deleteVaultItemsInState(previous, targetItemIds))
      setSelectedTreeNoteIds((current) => current.filter((noteId) => !targetItemIdSet.has(noteId)))
      setDraggingTreeNoteIds((current) => current.filter((noteId) => !targetItemIdSet.has(noteId)))
      setTreeSelectionAnchorNoteId((current) => (targetItemIdSet.has(current) ? '' : current))
    },
    [mutateState, stateRef],
  )

  const renameTreeContextItem = useCallback(() => {
    if (!treeContextMenu || treeContextMenu.kind !== 'item') return
    const entry = findVaultItem(stateRef.current.vault.items, treeContextMenu.itemId)
    startTreeRename(treeContextMenu.itemId, entry?.item.title ?? treeContextMenu.itemTitle)
  }, [startTreeRename, stateRef, treeContextMenu])

  const getTreeContextCreateTarget = useCallback((): { parentFolderId: string | null; index: number } | null => {
    if (!treeContextMenu) return null
    if (treeContextMenu.kind === 'root') {
      return {
        parentFolderId: null,
        index: stateRef.current.vault.items.length,
      }
    }
    const entry = findVaultItem(stateRef.current.vault.items, treeContextMenu.itemId)
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

  const getTreeContextSortParentFolderId = useCallback(
    (items: VaultTreeItem[]): string | null | undefined => {
      if (!treeContextMenu) return undefined
      if (treeContextMenu.kind === 'root') return null
      const entry = findVaultItem(items, treeContextMenu.itemId)
      if (!entry) return undefined
      return entry.item.type === 'folder' ? entry.item.id : entry.parentFolderId
    },
    [treeContextMenu],
  )

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

  const sortTreeContextScope = useCallback((sortMode: TabSortMode) => {
    if (!treeContextMenu) return
    const dateSort =
      sortMode === 'created-asc' ||
      sortMode === 'created-desc' ||
      sortMode === 'updated-asc' ||
      sortMode === 'updated-desc'
    const snapshots = dateSort ? vaultEditors.getMountedEditorMarkdownSnapshots() : []
    mutateState((previous) => {
      const snapshotState = dateSort ? applyVaultEditorMarkdownSnapshotsToState(previous, snapshots) : previous
      const parentFolderId = getTreeContextSortParentFolderId(snapshotState.vault.items)
      if (parentFolderId === undefined) return snapshotState
      const vault = sortVaultItemsInScope(
        snapshotState.vault,
        parentFolderId,
        sortMode,
        snapshotState.noteBodies,
      )
      return vault === snapshotState.vault ? snapshotState : { ...snapshotState, vault }
    })
  }, [getTreeContextSortParentFolderId, mutateState, vaultEditors, treeContextMenu])

  const deleteTreeContextItem = useCallback(() => {
    if (!treeContextMenu || treeContextMenu.kind !== 'item') return
    deleteItems(treeContextMenu.itemType === 'note' ? treeContextDeleteNoteIds : [treeContextMenu.itemId])
  }, [deleteItems, treeContextDeleteNoteIds, treeContextMenu])

  const revealTreeContextItem = useCallback(() => {
    if (!treeContextMenu || treeContextMenu.kind !== 'item') return
    const revealVaultItemLocation = window.electronAPI?.revealVaultItemLocation
    if (typeof revealVaultItemLocation !== 'function') {
      window.alert('Could not reveal vault item.')
      return
    }
    const payload = {
      itemId: treeContextMenu.itemId,
      itemType: treeContextMenu.itemType,
    }
    const latest = getLatestVaultStateFromMountedEditors()
    void Promise.resolve(commitAppStateNow(latest.state, {
      preferSync: true,
      flushQueue: true,
      trigger: 'vault-sidebar-reveal-item',
      pendingEditorCount: latest.pendingEditorCount,
    }))
      .then(() => revealVaultItemLocation(payload))
      .then((result) => {
        if (result.ok) return
        window.alert(result.error || 'Could not reveal vault item.')
      })
      .catch(() => window.alert('Could not reveal vault item.'))
  }, [commitAppStateNow, getLatestVaultStateFromMountedEditors, treeContextMenu])

  const restoreDeletedItem = useCallback(
    (deletedItemId: string) => {
      setExpandedTrashItemId((previous) => (previous === deletedItemId ? '' : previous))
      mutateState((previous) => restoreDeletedVaultItemInState(previous, deletedItemId))
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
          vault: {
            ...previous.vault,
            deletedItems: previous.vault.deletedItems.filter((entry) => entry.id !== deletedItemId),
          },
        }),
      )
    },
    [mutateState],
  )

  const setActiveNote = useCallback(
    (noteId: string) => {
      applyVaultNavigationLocation({ noteId, aisleId: '' })
    },
    [applyVaultNavigationLocation],
  )

  const selectSidebarTreeNote = useCallback(
    (noteId: string, mode: VaultTreeNoteSelectionMode) => {
      setActiveFolderId('')
      if (mode === 'range') {
        const requestedAnchorNoteId =
          treeSelectionAnchorNoteId || selectedTreeNoteIds[0] || state.vault.activeNoteId || noteId
        const anchorNoteId = visibleTreeNoteIds.includes(requestedAnchorNoteId) ? requestedAnchorNoteId : noteId
        setSelectedTreeNoteIds(getVaultTreeRangeNoteIds(visibleTreeNoteIds, anchorNoteId, noteId))
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
    [selectedTreeNoteIds, setActiveNote, state.vault.activeNoteId, treeSelectionAnchorNoteId, visibleTreeNoteIds],
  )

  const openSidebarTreeNoteRetained = useCallback(
    (noteId: string) => {
      setActiveFolderId('')
      setSelectedTreeNoteIds([noteId])
      setTreeSelectionAnchorNoteId(noteId)
      applyVaultNavigationLocation({ noteId, aisleId: '' }, { tabDisposition: 'retained' })
    },
    [applyVaultNavigationLocation],
  )

  const selectSidebarTreeFolder = useCallback((folderId: string) => {
    setSelectedTreeNoteIds([])
    setTreeSelectionAnchorNoteId('')
    setActiveFolderId(folderId)
  }, [])

  const revealSidebarSearch = useCallback(() => {
    setSidebarSearchMode(true)
    mutateState((previous) => {
      if (!previous.ui.sidebarCollapsed) return previous
      return {
        ...previous,
        ui: {
          ...previous.ui,
          sidebarCollapsed: false,
        },
      }
    })
  }, [mutateState])

  const applySidebarSearchTokenText = useCallback(
    (tokenText: string) => {
      if (!tokenText.trim()) return
      revealSidebarSearch()
      setQuery((current) => completeSidebarSearchTokenQuery(current, tokenText))
      window.setTimeout(() => searchInputRef.current?.focus(), 0)
    },
    [revealSidebarSearch],
  )

  const activateSidebarSearchToken = useCallback(
    (token: SidebarSearchToken) => {
      applySidebarSearchTokenText(formatSidebarSearchTokenText(token))
    },
    [applySidebarSearchTokenText],
  )

  const activateSidebarSearchKey = useCallback(
    (kind: SidebarSearchFilterKind, key: string) => {
      if (!key) return
      const currentToken = getSidebarSearchTokenForKey(sidebarSearchIndexes, kind, key)
      const resolvedToken = currentToken ?? getSidebarSearchTokenForKey(
        buildSidebarSearchIndexes(vaultIndexContext.state, vaultIndexContext),
        kind,
        key,
      )
      if (!resolvedToken) return
      activateSidebarSearchToken(resolvedToken)
    },
    [activateSidebarSearchToken, vaultIndexContext, sidebarSearchIndexes],
  )

  const updateSidebarSearchQuery = useCallback(
    (nextQuery: string) => {
      vaultEditors.flushPendingEditorAppStateCommit()
      revealSidebarSearch()
      setQuery(nextQuery)
    },
    [vaultEditors, revealSidebarSearch],
  )

  const selectSidebarSearchSuggestion = useCallback(
    (suggestion: SidebarSearchSuggestion) => {
      applySidebarSearchTokenText(suggestion.tokenText)
    },
    [applySidebarSearchTokenText],
  )

  const selectSidebarSearchOption = useCallback(
    (option: SidebarSearchOption) => {
      revealSidebarSearch()
      setQuery(option.insertText)
      window.setTimeout(() => searchInputRef.current?.focus(), 0)
    },
    [revealSidebarSearch],
  )

  const selectSidebarSearchHistory = useCallback(
    (historyQuery: string) => {
      revealSidebarSearch()
      setQuery(historyQuery)
      window.setTimeout(() => searchInputRef.current?.focus(), 0)
    },
    [revealSidebarSearch],
  )

  const openSidebarSearchResult = useCallback(
    (result: SidebarSearchResult, mode?: SidebarSearchResultOpenMode) => {
      recordSidebarSearchHistory(query)
      applyVaultNavigationLocation(
        { noteId: result.noteId, aisleId: result.aisleId },
        mode === 'retained' ? { tabDisposition: 'retained' } : undefined,
      )
    },
    [applyVaultNavigationLocation, query, recordSidebarSearchHistory],
  )

  const toggleNotesTrashFromShortcut = useCallback(() => {
    setViewMode((previous) => (previous === 'trash' ? 'main' : 'trash'))
  }, [])

  const toggleNotesScratchpadFromShortcut = useCallback(() => {
    const currentScratchpadActive = scratchpadActiveRef.current
    const nextToggleState = getNextNotesScratchpadToggleState({
      viewMode: viewModeRef.current,
      scratchpadActive: currentScratchpadActive,
    })
    viewModeRef.current = nextToggleState.viewMode
    scratchpadActiveRef.current = nextToggleState.scratchpadActive
    pendingFindReplaceRevealRef.current = null
    setFindReplaceOpen(false)
    clearVaultNavigationTransientUi()
    closeSidebarSearchMode()
    setViewMode(nextToggleState.viewMode)

    if (!nextToggleState.scratchpadActive) {
      if (currentScratchpadActive) setScratchpadActive(false)
      return
    }

    const activeScratchpad = getScratchpadEditorModel(stateRef.current)
    const targetAisleId = getScratchpadActiveAisleId(stateRef.current) || (activeScratchpad?.noteBody.aisles[0]?.id ?? '')
    setScratchpadActive(true)
    setActiveFolderId('')
    setSelectedTreeNoteIds([])
    setTreeSelectionAnchorNoteId('')
    setActiveAisleId(targetAisleId)
    if (!activeScratchpad || !targetAisleId) return
    pendingFocusToAisleIdRef.current = targetAisleId
    pendingScrollToAisleIdRef.current = targetAisleId
    pendingNavigationTopAisleIdRef.current = null
    scheduleAisleFocusScroll(activeScratchpad.noteBody.id, targetAisleId)
  }, [clearVaultNavigationTransientUi, closeSidebarSearchMode, scheduleAisleFocusScroll, stateRef])

  const focusNotesFilter = useCallback(() => {
    vaultEditors.flushPendingEditorAppStateCommit()
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
  }, [mutateState, vaultEditors, toolbarState])

  const toggleSidebarSearchModeFromButton = useCallback(() => {
    if (sidebarSearchVisible) {
      closeSidebarSearchMode()
      return
    }
    focusNotesFilter()
  }, [closeSidebarSearchMode, focusNotesFilter, sidebarSearchVisible])

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
        const body = previous.noteBodies.find((candidate) => candidate.id === activeModel.noteBody.id)
        if (!body) return previous
        const idGenerator = createReservedIdAllocator(collectVaultIds(previous))
        const { aisle, body: aisleBody } = createNewAisleBody(idGenerator, markdown)
        createdAisleId = aisle.id
        const activeIndex = body.aisles.findIndex((candidate) => candidate.id === nearAisleId)
        const insertIndex =
          side === 'end'
            ? body.aisles.length
            : side === 'left'
              ? Math.max(0, activeIndex)
              : Math.max(0, activeIndex + 1)
        const nextState: AppState = {
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
        return activeModel.kind === 'scratchpad'
          ? setScratchpadActiveAisleId(nextState, createdAisleId)
          : nextState
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
      queueAisleFocusScroll(activeModel.noteBody.id, nextAisle.id)
      window.setTimeout(() => {
        vaultEditors.activateAisleEditor(buildAisleEditorKey(activeModel.noteBody.id, nextAisle.id), { focus: true })
      }, 0)
    },
    [activeModel, queueAisleFocusScroll, vaultEditors, renderedActiveAisleId],
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
      vaultEditors.runNewlineOperation(operation, aisleId)
    },
    [vaultEditors, renderedActiveAisleId, shortcutMenu?.aisleId],
  )

  useVaultHotkeys({
    hotkeys: state.hotkeys,
    isMacPlatform,
    viewMode,
    actions: {
      openSettings: () => openUtilityView('settings'),
      newNote: createNote,
      newFolder: createFolder,
      closeCurrentNote: () => {
        if (scratchpadActiveRef.current) return
        const noteId = stateRef.current.vault.activeNoteId
        if (noteId) closeNoteTab(noteId)
      },
      cyclePinnedNoteTabNext: () => cyclePinnedNoteTab(1),
      cyclePinnedNoteTabPrev: () => cyclePinnedNoteTab(-1),
      reopenClosedNoteTab,
      toggleNotesTrash: toggleNotesTrashFromShortcut,
      toggleNotesScratchpad: toggleNotesScratchpadFromShortcut,
      cycleAislePrev: () => cycleActiveAisle(-1),
      cycleAisleNext: () => cycleActiveAisle(1),
      formatStrikethrough: () => {
        vaultEditors.runCommand('strike')
      },
      formatHighlight: () => {
        vaultEditors.runCommand('highlight')
      },
      pastePlainText: () => {
        vaultEditors.runClipboardAction('pastePlainText')
      },
      navigateHistoryBack: () => {
        navigateVaultHistoryBy(-1)
      },
      navigateHistoryForward: () => {
        navigateVaultHistoryBy(1)
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
    if (vaultEditors.insertNamedUrlLink(linkPrompt.url, linkPrompt.text, linkPrompt.editRange)) closeLinkPrompt()
  }, [closeLinkPrompt, linkPrompt.editRange, linkPrompt.text, linkPrompt.url, vaultEditors])

  const openPromptLinkUrl = useCallback(() => {
    const url = linkPrompt.url.trim()
    if (!url) return
    openExternalWebUrl(url)
  }, [linkPrompt.url])

  const openToolbarLinkPicker = useCallback(() => {
    vaultEditors.openUrlLinkPrompt()
  }, [vaultEditors])

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
    if (scratchpadActiveRef.current) return
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

  const copyVaultStructureAs = useCallback(
    (kind: VaultEditorCopyAsKind, mode: VaultEditorCopyAsMode, aisleId: string) => {
      if (scratchpadActiveRef.current) return
      const currentState = stateRef.current
      const result = buildVaultStructureClipboardPayload(currentState, {
        activeNoteId: currentState.vault.activeNoteId,
        kind,
        mode,
        aisleId,
      })
      if (result.status === 'blocked') {
        window.alert(result.message)
        return
      }
      void writeVaultStructureClipboardPayload(result.payload, result.markdown)
        .then((ok) => {
          if (!ok) window.alert('Clipboard copy is unavailable here.')
        })
        .catch(() => window.alert('Clipboard copy is unavailable here.'))
    },
    [stateRef],
  )

  const pasteVaultStructureClipboard = useCallback(
    async (aisleId: string) => {
      const payload = await readVaultStructureClipboardPayloadFromNavigator()
      return payload ? applyVaultStructureClipboardPaste(payload, aisleId) : false
    },
    [applyVaultStructureClipboardPaste],
  )

  const pasteFrontmatterClipboard = useCallback(
    async (aisleId: string) => {
      const startedAt = getVaultAppPerfNow()
      let resultStatus = 'empty'
      try {
        const payload = await readFrontmatterClipboardPayloadFromNavigator(undefined, { allowYamlFallback: false })
        resultStatus = payload ? 'frontmatter-payload' : 'empty'
        return payload ? applyFrontmatterClipboardPaste(payload, aisleId) : false
      } catch {
        resultStatus = 'error'
        pushAppToast('Clipboard paste is unavailable here.', 'warning')
        return false
      } finally {
        recordVaultFrontmatterTiming(
          'frontmatter-clipboard-read',
          getVaultAppPerfNow() - startedAt,
          {
            result: resultStatus,
            aisleId,
          },
          0,
        )
      }
    },
    [applyFrontmatterClipboardPaste, pushAppToast],
  )

  const insertVaultNoteReference = useCallback(
    (target: NoteLocation, kind: 'note-link' | 'note-preview', options: VaultNoteActionPickerActionOptions = {}) => {
      const token = buildVaultNoteReferenceInsertionText(stateRef.current, target, kind, options)
      const currentPicker = noteActionPicker
      const insertRange = currentPicker?.source === 'mention'
        ? currentPicker.mentionRange ?? null
        : currentPicker?.insertRange ?? null
      if (insertRange) {
        vaultEditors.insertNoteReferenceAtSelection(token, insertRange)
      } else {
        vaultEditors.insertNoteReferenceAtSelection(token)
      }
      closeNoteActionPicker()
    },
    [closeNoteActionPicker, noteActionPicker, vaultEditors, stateRef],
  )

  const applyVaultNoteCopyAction = useCallback(
    (targetNoteId: string, mode: 'independent' | 'synced') => {
      const source = noteActionPicker?.source
      let nextActiveAisleId = ''
      let blockedMessage = ''
      mutateState((previous) => {
        const result = source === 'whole-note-copy'
          ? replaceActiveNoteBodyFromTargetNote(previous, {
              activeNoteId: previous.vault.activeNoteId,
              targetNoteId,
              mode,
            })
          : replaceFocusedAisleFromTargetNote(previous, {
              activeNoteId: previous.vault.activeNoteId,
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
    (action: VaultNoteActionPickerAction, noteId: string, options: VaultNoteActionPickerActionOptions = {}) => {
      const referenceKind = getReferenceKindForNoteAction(action)
      if (referenceKind) {
        insertVaultNoteReference({ noteId }, referenceKind, options)
        return
      }
      const copyMode = getCopyModeForNoteAction(action)
      if (copyMode) applyVaultNoteCopyAction(noteId, copyMode)
    },
    [applyVaultNoteCopyAction, insertVaultNoteReference],
  )

  const submitUrlLink = useCallback(
    (url: string) => {
      if (vaultEditors.insertUrlLink(url)) closeNoteActionPicker()
    },
    [closeNoteActionPicker, vaultEditors],
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
    return getVaultAisleDecoupleRows(state, decoupleDialog.aisleBodyId)
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
      if (editorRef.current) vaultEditors.commitActiveEditorMarkdownNow(editorRef.current)

      mutateState((previous) => {
        const body = previous.noteBodies.find((candidate) => candidate.id === activeModel.noteBody.id)
        if (!body) return previous
        const timestamp = new Date().toISOString()
        const idGenerator = createReservedIdAllocator(collectVaultIds(previous))
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
        if (activeModel.kind === 'scratchpad') {
          nextState = setScratchpadActiveAisleId(nextState, options.activeAisleId ?? nextAisles[0]?.id ?? '')
        }
        return pruneUnreferencedBodies(nextState)
      })

      setAisleEditModalOpen(false)
      setActiveAisleId(options.activeAisleId ?? draftAisles[0]?.id ?? '')
    },
    [activeModel, mutateState, vaultEditors],
  )

  const buildFrontmatterModalForAisle = useCallback(
    (sourceState: AppState, model: ActiveNoteModel, aisleId: string): VaultFrontmatterModalState | string | null => {
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
      if (!activeModel || activeModel.kind === 'scratchpad' || !aisleId) return
      const modal = buildFrontmatterModalForAisle(state, activeModel, aisleId)
      if (typeof modal === 'string') {
        window.alert(modal)
        return
      }
      if (modal) updateFrontmatterModalSession(modal)
    },
    [activeModel, buildFrontmatterModalForAisle, renderedActiveAisleId, state, updateFrontmatterModalSession],
  )

  const selectFrontmatterAisle = useCallback(
    (modal: VaultFrontmatterModalState, aisleId: string): VaultFrontmatterModalState | string | null => {
      if (!activeModel || activeModel.kind === 'scratchpad' || activeModel.noteId !== modal.location.noteId) return null
      return buildFrontmatterModalForAisle(state, activeModel, aisleId) ?? modal
    },
    [activeModel, buildFrontmatterModalForAisle, state],
  )

  const selectFrontmatterTemplate = useCallback(
    (modal: VaultFrontmatterModalState, templateId: string): VaultFrontmatterModalState => {
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
    (modal: VaultFrontmatterModalState, templateDerived: boolean): VaultFrontmatterModalState => {
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
      closeFrontmatterModalSession()
    },
    [closeFrontmatterModalSession, openUtilityView, setSettingsSection],
  )

  const filterFrontmatterTemplateFromModal = useCallback(
    (modal: VaultFrontmatterModalState) => {
      closeFrontmatterModalSession(modal.location.noteId)
      filterAisleFrontmatterTemplate(modal.aisleId)
    },
    [closeFrontmatterModalSession, filterAisleFrontmatterTemplate],
  )

  const copyFrontmatterFromModal = useCallback(
    async (modal: VaultFrontmatterModalState): Promise<string | null> => {
      const startedAt = getVaultAppPerfNow()
      let resultStatus = 'copied'
      let warningCount = 0
      try {
        const computedRepair = disableInvalidComputedFrontmatterRows(modal.rows)
        if (computedRepair.warnings.length > 0) {
          resultStatus = 'computed-repair-warning'
          warningCount = computedRepair.warnings.length
          updateFrontmatterModalSession({
            ...modal,
            rows: computedRepair.rows,
          })
          return computedRepair.warnings.join('\n')
        }
        const result = buildFrontmatterDataFromRows(stateRef.current, modal.noteBodyId, modal.location, computedRepair.rows, {
          selectedTemplateId: modal.selectedTemplateId,
          templateDerived: modal.templateDerived,
          aisleBodyId: modal.aisleBodyId,
        })
        if (!result.ok) {
          resultStatus = 'blocked'
          return result.message
        }
        if (result.warnings.length > 0) {
          resultStatus = 'warning'
          warningCount = result.warnings.length
          return result.warnings.join('\n')
        }

        const copied = await writeFrontmatterClipboardPayload(
          buildFrontmatterClipboardPayload(result.frontmatter, {
            templateId: modal.selectedTemplateId || null,
            templateDerived: modal.templateDerived,
            templateFieldOrigins: result.templateFieldOrigins,
            templateRemovedFieldIds: result.templateRemovedFieldIds,
            computedFields: result.computedFields,
          }),
        )
        resultStatus = copied ? 'copied' : 'clipboard-unavailable'
        return copied ? null : 'Clipboard copy is unavailable here.'
      } catch (error) {
        resultStatus = 'error'
        throw error
      } finally {
        recordVaultFrontmatterTiming(
          'frontmatter-clipboard-copy',
          getVaultAppPerfNow() - startedAt,
          {
            result: resultStatus,
            noteBodyId: modal.noteBodyId,
            aisleId: modal.aisleId,
            aisleBodyId: modal.aisleBodyId,
            rowCount: modal.rows.length,
            selectedTemplateId: modal.selectedTemplateId || '',
            templateDerived: modal.templateDerived,
            warningCount,
          },
          0,
        )
      }
    },
    [stateRef, updateFrontmatterModalSession],
  )

  const saveFrontmatter = useCallback(
    (modal: VaultFrontmatterModalState) => {
      const startedAt = getVaultAppPerfNow()
      let resultStatus = 'saved'
      let warningCount = 0
      try {
        const computedRepair = disableInvalidComputedFrontmatterRows(modal.rows)
        if (computedRepair.warnings.length > 0) {
          resultStatus = 'computed-repair-warning'
          warningCount = computedRepair.warnings.length
          updateFrontmatterModalSession({
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
        if (!result.ok) {
          resultStatus = 'blocked'
          return result.message
        }
        if (result.warnings.length > 0) {
          resultStatus = 'warning'
          warningCount = result.warnings.length
          return result.warnings
        }
        mutateState((previous) =>
          updateAisleBodyFrontmatterInState(previous, modal.aisleBodyId, result.frontmatter, {
            templateId: modal.selectedTemplateId || null,
            templateDerived: modal.templateDerived,
            templateFieldOrigins: result.templateFieldOrigins,
            templateRemovedFieldIds: result.templateRemovedFieldIds,
            computedFields: result.computedFields,
          }),
        )
        closeFrontmatterModalSession(modal.location.noteId)
        return null
      } finally {
        recordVaultFrontmatterTiming(
          'frontmatter-save',
          getVaultAppPerfNow() - startedAt,
          {
            result: resultStatus,
            noteBodyId: modal.noteBodyId,
            aisleId: modal.aisleId,
            aisleBodyId: modal.aisleBodyId,
            rowCount: modal.rows.length,
            selectedTemplateId: modal.selectedTemplateId || '',
            templateDerived: modal.templateDerived,
            warningCount,
          },
          0,
        )
      }
    },
    [closeFrontmatterModalSession, mutateState, stateRef, updateFrontmatterModalSession],
  )

  const openTableOfContents = useCallback((options: { scope?: TableOfContentsScope; focusedAisleId?: string } = {}) => {
    if (!activeModel) return
    const focusedAisleId = options.focusedAisleId ?? renderedActiveAisleId
    const panels = buildTableOfContentsPanels(
      activeModel.noteBody.id,
      activeModel.resolved.aisles,
      vaultEditors.getHeadingOutlineForAisle,
      {
        scope: options.scope ?? state.ui.tableOfContentsScope ?? 'all-aisles',
        focusedAisleId,
        getLinksForAisle: vaultEditors.getTableOfContentsLinksForAisle,
      },
    )
    if (!panels) {
      window.alert(TABLE_OF_CONTENTS_EMPTY_MESSAGE)
      return
    }
    setTableOfContentsPanels(panels)
  }, [activeModel, vaultEditors, renderedActiveAisleId, state.ui.tableOfContentsScope])

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
        vaultEditors.scrollToAisleHeading(aisleId, headingKey)
      }, 80)
    },
    [vaultEditors],
  )

  const selectTableOfContentsLink = useCallback(
    (aisleId: string, linkKey: string) => {
      setActiveAisleId(aisleId)
      window.setTimeout(() => {
        vaultEditors.scrollToAisleTableOfContentsLink(aisleId, linkKey)
      }, 80)
    },
    [vaultEditors],
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
      vaultEditors.activateAisleEditor(buildAisleEditorKey(activeModel.noteBody.id, aisleId))
      toolbarState.closeToolbarPopovers()
      setAisleContextMenu(null)
      setTreeContextMenu(null)
      setShortcutMenu(null)
      setEditorContextMenu({ aisleId, x, y, linkPrompt: options.linkPrompt ?? null })
    },
    [activeModel, vaultEditors, toolbarState],
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

  const openVaultEditorContextMenuFromPointer = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      const target = event.target instanceof Element
        ? event.target
        : typeof Text !== 'undefined' && event.target instanceof Text
          ? event.target.parentElement
          : null
      const aisleId = getVaultEditorContextMenuAisleIdFromTarget(target)
      if (!aisleId) return
      event.preventDefault()
      const anchor = target?.closest<HTMLAnchorElement>('a[href]')
      const linkPrompt = anchor?.closest('.ProseMirror[contenteditable="true"]')
        ? vaultEditors.getLinkPromptAtClientPoint(aisleId, { clientX: event.clientX, clientY: event.clientY })
        : null
      openEditorContextMenuAt(aisleId, event.clientX, event.clientY, { linkPrompt })
    },
    [vaultEditors, openEditorContextMenuAt],
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
        target?.closest('.note-shared-toolbar') ||
        target?.closest('.vault-sidebar-switcher') ||
        target?.closest('.vault-manager-menu') ||
        target?.closest('.vault-manager-kebab')
      ) {
        return
      }
      closeTransientFloatingUi()
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      closeTransientFloatingUi()
    }
    document.addEventListener('pointerdown', closeFloatingUi)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeFloatingUi)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [closeTransientFloatingUi])

  useEffect(() => {
    closeTransientFloatingUi()
    setAisleEditModalOpen(false)
  }, [activeModel?.noteId, closeTransientFloatingUi, viewMode])

  const runEditorContextClipboardAction = useCallback(
    (
      action: VaultEditorClipboardAction,
      destination: VaultEditorPasteDestination,
      aisleId: string,
    ) => {
      if (action === 'paste' && destination === 'here') {
        void pasteFrontmatterClipboard(aisleId)
          .then((handled) => {
            if (handled) return true
            return pasteVaultStructureClipboard(aisleId)
          })
          .then((handled) => {
            if (!handled) vaultEditors.runClipboardAction(action)
          })
          .catch(() => vaultEditors.runClipboardAction(action))
        return
      }

      if (destination === 'here' || action === 'cut' || action === 'copy') {
        vaultEditors.runClipboardAction(action)
        return
      }

      void vaultEditors.readClipboardMarkdownForPaste(action)
        .then((result) => {
          if (!result) return
          addAisle(destination === 'new-aisle-left' ? 'left' : 'right', aisleId, result.markdown)
        })
        .catch(() => undefined)
    },
    [addAisle, vaultEditors, pasteFrontmatterClipboard, pasteVaultStructureClipboard],
  )

  const insertEditorContextAisle = useCallback(
    (side: VaultEditorAisleInsertSide, aisleId: string) => {
      addAisle(side, aisleId)
    },
    [addAisle],
  )

  const revealEditorContextLocation = useCallback(
    (aisleId: string) => {
      const noteId = stateRef.current.vault.activeNoteId
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
      const latest = getLatestVaultStateFromMountedEditors()
      void Promise.resolve(commitAppStateNow(latest.state, {
        preferSync: true,
        flushQueue: true,
        trigger: 'vault-editor-reveal-location',
        pendingEditorCount: latest.pendingEditorCount,
      }))
        .then(() => revealNoteLocation(payload))
        .then((result) => {
          if (result.ok) return
          window.alert(result.error || 'Could not reveal note location.')
        })
        .catch(() => window.alert('Could not reveal note location.'))
    },
    [commitAppStateNow, getLatestVaultStateFromMountedEditors, stateRef],
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

  const resetSidebarWidth = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      mutateState((previous) => ({
        ...previous,
        ui: {
          ...previous.ui,
          sidebarWidth: clampSidebarWidth(DEFAULT_UI_SETTINGS.sidebarWidth),
        },
      }))
    },
    [mutateState],
  )

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
      onOpenFrontmatter={() => {
        closeTransientFloatingUi()
        openFrontmatterModalForAisle()
      }}
      onOpenTableOfContents={openTableOfContents}
      onOpenAisleEditModal={() => {
        closeTransientFloatingUi()
        setAisleEditModalOpen(true)
      }}
      onOpenFindReplace={focusNotesFilter}
      onToggleHeading={openHeadingMenu}
      onCommand={vaultEditors.runCommand}
      onHistory={(direction) => vaultEditors.runCommand(direction)}
      onInsertImage={vaultEditors.insertImageFile}
      onInsertWebLink={openToolbarLinkPicker}
      onClear={() => vaultEditors.runCommand('clear')}
    />
  ) : null

  const toolbarPopovers = activeModel ? (
    <EditorToolbarPopovers
      copyMenuOpen={toolbarState.copyMenuOpen}
      headingMenuOpen={toolbarState.headingMenuOpen}
      activeHeadingLevel={toolbarState.activeHeadingLevel}
      toolbarPopoverPosition={toolbarState.toolbarPopoverPosition}
      onExecuteToolbarCommand={(command, payload) => {
        vaultEditors.runCommand(command, payload)
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

  const noteWorkspaceOverlay = activeModel ? (
    <>
      <VaultFrontmatterModal
        modal={visibleFrontmatterModal}
        modalStyle={visibleFrontmatterModal ? getFrontmatterNoteModalStyle(workspaceRootRef.current, visibleFrontmatterModal.aisleId, noteContentViewportRect) : undefined}
        templates={state.frontmatter.templates}
        onCancel={() => closeFrontmatterModalSession()}
        onChange={updateFrontmatterModalSession}
        onSave={saveFrontmatter}
        onSelectAisle={selectFrontmatterAisle}
        onSelectTemplate={selectFrontmatterTemplate}
        onToggleTemplateDerived={toggleFrontmatterTemplateDerived}
        onEditTemplate={editFrontmatterTemplateFromModal}
        onFilterTemplate={filterFrontmatterTemplateFromModal}
        onCopyFrontmatter={copyFrontmatterFromModal}
      />
      <AisleEditModal
        open={aisleEditModalOpen}
        aisles={activeModel.resolved.aisles}
        linkedAisleIds={linkedAisleIds}
        frontmatterAisleIds={frontmatterAisleIds}
        maxAisles={MAX_NOTE_AISLES}
        maxAislesWarningMessage={MAX_AISLE_WARNING_MESSAGE}
        onCancel={() => setAisleEditModalOpen(false)}
        onApply={applyAisleEditDraftToActiveNote}
        onWarn={(message) => window.alert(message)}
      />
    </>
  ) : null

  const getVaultSelector = useCallback((vault: KnownVault) => ({
    vaultId: vault.vaultId ?? undefined,
    vaultPath: vault.vaultPath,
  }), [])

  const createVaultFromSettings = useCallback(() => {
    setOpenVaultActionMenuKey('')
    setVaultNameDialog({ mode: 'create', initialName: 'New Vault' })
  }, [])

  const renameVaultFromSettings = useCallback((vault: KnownVault) => {
    setOpenVaultActionMenuKey('')
    setVaultNameDialog({ mode: 'rename', initialName: vault.vaultName, vault })
  }, [])

  const submitVaultNameDialog = useCallback((name: string) => {
    const dialog = vaultNameDialog
    if (!dialog) return
    setVaultNameDialog(null)
    if (dialog.mode === 'rename') {
      if (name === dialog.initialName) return
      void storageProfileController.renameVault(name, getVaultSelector(dialog.vault))
      return
    }
    void (async () => {
      const locationPath = await storageProfileController.chooseVaultLocation()
      if (!locationPath) return
      await storageProfileController.createVault({ name, locationPath })
    })()
  }, [getVaultSelector, vaultNameDialog, storageProfileController])

  const switchVaultFromSettings = useCallback((vault: KnownVault) => {
    setOpenVaultActionMenuKey('')
    if (!vault.available || vault.isActive) return
    void storageProfileController.switchVault(getVaultSelector(vault))
  }, [getVaultSelector, storageProfileController])

  const switchVaultFromSidebar = useCallback((vault: KnownVault) => {
    setVaultSwitcherOpen(false)
    if (!vault.available || vault.isActive) return
    void storageProfileController.switchVault(getVaultSelector(vault))
  }, [getVaultSelector, storageProfileController])

  const openVaultFromSidebar = useCallback(() => {
    setVaultSwitcherOpen(false)
    void storageProfileController.openVault()
  }, [storageProfileController])

  const createVaultFromSidebar = useCallback(() => {
    setVaultSwitcherOpen(false)
    createVaultFromSettings()
  }, [createVaultFromSettings])

  const forgetVaultFromSettings = useCallback((vault: KnownVault) => {
    setOpenVaultActionMenuKey('')
    if (vault.isActive) return
    const confirmed = window.confirm(`Remove "${vault.vaultName}" from the vault list? Files stay on disk.`)
    if (!confirmed) return
    void storageProfileController.forgetVault(getVaultSelector(vault))
  }, [getVaultSelector, storageProfileController])

  const deleteVaultFromSettings = useCallback((vault?: KnownVault) => {
    setOpenVaultActionMenuKey('')
    void storageProfileController.deleteVault(vault ? getVaultSelector(vault) : undefined)
  }, [getVaultSelector, storageProfileController])

  const runCurrentVaultAction = useCallback((action: () => void) => {
    setOpenVaultActionMenuKey('')
    action()
  }, [])

  const toggleSidebarCollapsed = useCallback(() => {
    setVaultSwitcherOpen(false)
    mutateState((previous) => ({
      ...previous,
      ui: {
        ...previous.ui,
        sidebarCollapsed: !previous.ui.sidebarCollapsed,
      },
    }))
  }, [mutateState])

  const renderSegmentedTabs = <T extends string,>(
    label: string,
    tabItems: Array<{ id: T; label: string }>,
    activeId: T,
    onSelect: (id: T) => void,
  ) => (
    <div className="vault-utility-tabs" role="tablist" aria-label={label}>
      {tabItems.map((tab) => (
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

  const renderVaultManager = () => {
    const storageProfileStatus = storageProfileController.storageProfileStatus
    const vaultFoldersAvailable = Boolean(window.electronAPI?.getStorageProfileStatus)
    const storageHealth =
      storageProfileStatus?.health ?? (storageProfileStatus?.status === 'ready' ? 'healthy' : 'error')
    const showRetry = Boolean(storageProfileStatus && (storageProfileStatus.status === 'error' || storageHealth !== 'healthy'))
    const activeVaultPath = storageProfileStatus?.vaultPath ?? storageProfileStatus?.profileRootPath ?? ''
    const vaultRows = getVaultRowsFromStorageStatus(storageProfileStatus)

    if (!vaultFoldersAvailable) {
      return (
        <div className="vault-settings-stack">
          <div className="vault-manager-card">
            <div className="vault-manager-header">
              <div>
                <span className="vault-manager-eyebrow">Current vault</span>
                <h3>Browser cache</h3>
                <p className="vault-settings-help">Browser builds use local cache persistence only. Desktop vault folders are unavailable.</p>
              </div>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="vault-settings-stack">
        <p className="vault-settings-help">
          The vault is this folder on disk. New Vault creates a named folder inside the parent folder you choose. To use iCloud, Dropbox, OneDrive, or another sync service, put the vault folder in that synced location.
        </p>
        <div className={`vault-manager-card ${storageHealth === 'error' ? 'is-error' : ''} ${storageHealth === 'warning' ? 'is-warning' : ''}`.trim()}>
          <div className="vault-manager-header">
            <div>
              <span className="vault-manager-eyebrow">Current vault</span>
              <h3>{storageProfileStatus?.status === 'setup-required' ? 'No vault open' : storageProfileStatus?.vaultName || 'Vault'}</h3>
              <code className="vault-manager-path">{activeVaultPath || 'Choose a vault folder to start.'}</code>
            </div>
            <div className="vault-settings-actions vault-manager-primary-actions">
              <button type="button" className="vault-settings-action" onClick={createVaultFromSettings}>
                New Vault
              </button>
            </div>
          </div>
          {storageProfileStatus?.error ? (
            <p className="vault-manager-error">{storageProfileStatus.error}</p>
          ) : null}
          {(storageProfileStatus?.issues ?? []).length > 0 ? (
            <div className="vault-manager-issues" aria-label="vault folder health issues">
              {(storageProfileStatus?.issues ?? []).map((issue, index) => (
                <p key={`${issue.code}-${issue.path ?? index}`} className={`vault-manager-issue ${issue.severity === 'error' ? 'is-error' : 'is-warning'}`}>
                  {issue.message}{issue.path ? ` (${issue.path})` : ''}
                </p>
              ))}
            </div>
          ) : null}
        </div>
        <div className="vault-manager-list" aria-label="Vaults">
          <div className="vault-manager-list-header">
            <span>Vaults</span>
          </div>
          {vaultRows.length === 0 ? (
            <p className="vault-settings-help">No vault folders are remembered yet.</p>
          ) : (
            vaultRows.map((vault) => {
              const vaultKey = vault.vaultId ?? vault.vaultPath
              const menuOpen = openVaultActionMenuKey === vaultKey
              return (
                <div key={vaultKey} className={`vault-manager-row ${vault.isActive ? 'is-active' : ''} ${vault.available ? '' : 'is-missing'}`.trim()}>
                  <button
                    type="button"
                    className="vault-manager-row-main"
                    disabled={!vault.available || vault.isActive}
                    onClick={() => switchVaultFromSettings(vault)}
                  >
                    <AppIcon iconId={vault.available ? 'folderOpen' : 'folder'} className="vault-manager-row-icon" />
                    <span className="vault-manager-row-copy">
                      <strong>{vault.vaultName}</strong>
                      <code>{vault.vaultPath}</code>
                    </span>
                    <span className="vault-manager-row-status">
                      {vault.isActive ? 'current' : vault.available ? 'available' : 'folder missing'}
                    </span>
                  </button>
                  <div className="vault-manager-row-menu">
                    <button
                      type="button"
                      className="vault-manager-kebab"
                      aria-label={`Actions for ${vault.vaultName}`}
                      aria-expanded={menuOpen}
                      onClick={() => setOpenVaultActionMenuKey((previous) => (previous === vaultKey ? '' : vaultKey))}
                    >
                      <AppIcon iconId="ellipsisVertical" className="vault-manager-kebab-icon" />
                    </button>
                    {menuOpen ? (
                      <div className="vault-manager-menu" role="menu">
                        {vault.isActive ? (
                          <>
                            <button type="button" role="menuitem" onClick={() => renameVaultFromSettings(vault)}>
                              Rename
                            </button>
                            <button type="button" role="menuitem" onClick={() => runCurrentVaultAction(() => void storageProfileController.moveStorageProfile())}>
                              Move Folder
                            </button>
                            <button type="button" role="menuitem" onClick={() => runCurrentVaultAction(() => void storageProfileController.revealStorageProfile())}>
                              Reveal Folder
                            </button>
                            {showRetry ? (
                              <button type="button" role="menuitem" onClick={() => runCurrentVaultAction(() => void storageProfileController.retryStorageProfile())}>
                                Retry
                              </button>
                            ) : null}
                          </>
                        ) : (
                          <>
                            {vault.available ? (
                              <>
                                <button type="button" role="menuitem" onClick={() => switchVaultFromSettings(vault)}>
                                  Switch to Vault
                                </button>
                                <button type="button" role="menuitem" onClick={() => renameVaultFromSettings(vault)}>
                                  Rename
                                </button>
                              </>
                            ) : null}
                            <button type="button" role="menuitem" onClick={() => forgetVaultFromSettings(vault)}>
                              Remove from List
                            </button>
                          </>
                        )}
                        {vault.available || vault.isActive ? (
                          <button type="button" role="menuitem" className="is-danger" onClick={() => deleteVaultFromSettings(vault)}>
                            Delete Vault
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

  const renderSidebarVaultFooter = () => {
    const storageProfileStatus = storageProfileController.storageProfileStatus
    const vaultFoldersAvailable = Boolean(window.electronAPI?.getStorageProfileStatus)
    const vaultRows = getVaultRowsFromStorageStatus(storageProfileStatus)
    const activeVault = vaultRows.find((vault) => vault.isActive)
    const activeVaultName = vaultFoldersAvailable
      ? storageProfileStatus?.status === 'setup-required'
        ? 'No vault open'
        : activeVault?.vaultName ?? storageProfileStatus?.vaultName ?? 'Vault'
      : 'Browser cache'
    const activeVaultPath = activeVault?.vaultPath ?? storageProfileStatus?.vaultPath ?? ''
    const switcherTitle = activeVaultPath ? `${activeVaultName}\n${activeVaultPath}` : activeVaultName

    return (
      <div className={`vault-sidebar-footer ${state.ui.sidebarCollapsed ? 'is-collapsed' : ''}`}>
        {!state.ui.sidebarCollapsed ? (
          <div className="vault-sidebar-switcher">
            <button
              type="button"
              className="vault-sidebar-switcher-trigger"
              onClick={() => {
                if (!vaultFoldersAvailable) return
                setOpenVaultActionMenuKey('')
                setVaultSwitcherOpen((open) => !open)
              }}
              disabled={!vaultFoldersAvailable}
              aria-label={
                vaultFoldersAvailable
                  ? `Switch vault. Current vault: ${activeVaultName}`
                  : 'Browser cache'
              }
              aria-haspopup="menu"
              aria-expanded={vaultFoldersAvailable ? vaultSwitcherOpen : undefined}
              title={switcherTitle}
            >
              <span className="vault-sidebar-switcher-name">{activeVaultName}</span>
              {vaultFoldersAvailable && vaultSwitcherOpen ? (
                <AppIcon iconId="minimize" className="vault-sidebar-switcher-chevron" />
              ) : null}
            </button>
            {vaultSwitcherOpen && vaultFoldersAvailable ? (
              <div className="vault-sidebar-switcher-popover" role="menu" aria-label="Vault switcher">
                <div className="vault-sidebar-switcher-list">
                  {vaultRows.length > 0 ? (
                    vaultRows.map((vault) => (
                      <button
                        key={vault.vaultId ?? vault.vaultPath}
                        type="button"
                        role="menuitem"
                        className={`vault-sidebar-switcher-row ${vault.isActive ? 'is-active' : ''} ${vault.available ? '' : 'is-missing'}`.trim()}
                        disabled={!vault.available || vault.isActive}
                        onClick={() => switchVaultFromSidebar(vault)}
                        title={vault.vaultPath}
                      >
                        <span className="vault-sidebar-switcher-row-copy">
                          <span className="vault-sidebar-switcher-row-name">{vault.vaultName}</span>
                        </span>
                        <span className="vault-sidebar-switcher-row-status">
                          {vault.isActive ? 'current' : vault.available ? 'switch' : 'missing'}
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="vault-sidebar-switcher-empty">No remembered vaults.</p>
                  )}
                </div>
                <div className="vault-sidebar-switcher-actions" role="group" aria-label="Vault actions">
                  <button
                    type="button"
                    role="menuitem"
                    className="vault-sidebar-switcher-open"
                    onClick={openVaultFromSidebar}
                  >
                    <AppIcon iconId="folderOpen" className="vault-sidebar-switcher-row-icon" />
                    <span>Open Vault</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="vault-sidebar-switcher-new"
                    onClick={createVaultFromSidebar}
                  >
                    <AppIcon iconId="plus" className="vault-sidebar-switcher-row-icon" />
                    <span>New Vault</span>
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        <button
          className="vault-icon-button vault-sidebar-footer-action vault-sidebar-toggle"
          type="button"
          onClick={toggleSidebarCollapsed}
          aria-label={state.ui.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={state.ui.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <AppIcon
            iconId={state.ui.sidebarCollapsed ? 'arrowRightFromLine' : 'arrowLeftFromLine'}
            className="vault-sidebar-toggle-icon"
          />
        </button>
      </div>
    )
  }

  const renderDataSettings = () => (
    <section className="vault-settings-section" aria-label="Data settings">
      {renderSegmentedTabs('Data settings sections', DATA_SECTION_TABS, dataSettingsSection, setDataSettingsSection)}
      {dataSettingsSection === 'transfer' ? (
        <div className="vault-settings-stack">
          <div className="vault-settings-actions">
            <button type="button" className="vault-settings-action" onClick={importVault}>
              Import
            </button>
            <button type="button" className="vault-settings-action" onClick={exportVault}>
              Export vault
            </button>
          </div>
          <p className="vault-settings-help">
            Imports add a new top-level folder to the current vault. AisleNote vault files, Markdown folders, and ZIP files import without replacing existing notes.
          </p>
        </div>
      ) : null}
      {dataSettingsSection === 'storage' ? renderVaultManager() : null}
      {dataSettingsSection === 'trash' ? (
        <div className="vault-settings-grid">
          <label>
            Auto-remove deleted items after
            <input
              type="number"
              min={1}
              max={3650}
              value={state.vault.settings.autoRemoveDeletedDays}
              onChange={(event) => {
                const days = Math.max(1, Math.min(3650, Number(event.target.value) || 1))
                mutateState((previous) => ({
                  ...previous,
                  vault: {
                    ...previous.vault,
                    settings: {
                      ...previous.vault.settings,
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
    <section className="vault-settings-section" aria-label="Toolbar settings">
      <p className="vault-settings-help">
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
    <section className="vault-settings-section" aria-label="Hotkey settings">
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
      <div className="vault-settings-actions">
        <button type="button" className="vault-settings-action" onClick={resetShortcutSettings}>
          Reset hotkeys
        </button>
      </div>
      <p className="vault-settings-help">Select a hotkey to enter a new combination, escape to cancel.</p>
    </section>
  )

  const renderShortcutSettings = () => (
    <section className="vault-settings-section" aria-label="Shortcut settings">
      <div className="settings-hotkeys-list">
        {NEWLINE_SHORTCUT_ROWS.map((row) => (
          <label className="settings-hotkey-row" key={row.id} htmlFor={`vault-settings-newline-${row.id}`}>
            <span className="settings-hotkey-label">{formatFixedNewlineShortcutLabel(row.id, isMacPlatform)}</span>
            <select
              id={`vault-settings-newline-${row.id}`}
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
      <div className="settings-hotkey-row settings-shortcut-menu-toggle-row">
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
      <p className="vault-settings-help">Numbered menu entries use 1-9, then 0.</p>
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

    const updateFrontmatterTemplateFieldDropIndex = (nextIndex: number | null) => {
      if (frontmatterTemplateFieldDropIndexRef.current === nextIndex) return
      frontmatterTemplateFieldDropIndexRef.current = nextIndex
      setFrontmatterTemplateFieldDropIndex(nextIndex)
    }

    const clearFrontmatterTemplateFieldDrag = () => {
      frontmatterTemplateFieldRectsRef.current = []
      frontmatterTemplateFieldDragIdRef.current = ''
      frontmatterTemplateFieldDropIndexRef.current = null
      setDraggingFrontmatterTemplateFieldId('')
      setFrontmatterTemplateFieldDropIndex(null)
    }

    const selectFrontmatterTemplate = (templateId: string) => {
      clearFrontmatterTemplateFieldDrag()
      updateFrontmatterDraft((frontmatter) => ({
        ...frontmatter,
        settingsTemplateId: templateId,
      }))
    }

    const createFrontmatterTemplate = () => {
      const template: FrontmatterTemplate = {
        id: createFrontmatterTemplateId(),
        name: 'new template',
        fields: [],
      }
      clearFrontmatterTemplateFieldDrag()
      setFrontmatterTemplateDeleteTargetId('')
      setFrontmatterTemplateImportTarget(null)
      updateFrontmatterDraft((frontmatter) => ({
        ...frontmatter,
        templates: [...frontmatter.templates, template],
        settingsTemplateId: template.id,
      }))
    }

    const deleteFrontmatterTemplate = (templateId: string) => {
      if (templates.length <= 1) return
      clearFrontmatterTemplateFieldDrag()
      setFrontmatterFixedListOptionDrafts({})
      setFrontmatterTemplateDeleteTargetId('')
      setFrontmatterTemplateImportTarget(null)
      updateFrontmatterDraft((frontmatter) => {
        const nextTemplates = frontmatter.templates.filter((template) => template.id !== templateId)
        return {
          ...frontmatter,
          templates: nextTemplates,
          settingsTemplateId:
            frontmatter.settingsTemplateId === templateId
              ? nextTemplates[0]?.id ?? ''
              : frontmatter.settingsTemplateId,
          lastAppliedTemplateId:
            frontmatter.lastAppliedTemplateId === templateId ? '' : frontmatter.lastAppliedTemplateId,
        }
      })
    }

    const addFrontmatterTemplateField = () => {
      if (!activeTemplate) return
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
    }

    const openFrontmatterTemplateImport = () => {
      if (!activeTemplate) return
      clearFrontmatterTemplateFieldDrag()
      setFrontmatterTemplateDeleteTargetId('')
      setFrontmatterTemplateImportTarget({
        templateId: activeTemplate.id,
        templateName: activeTemplate.name,
      })
    }

    const importFrontmatterTemplate = (templateId: string, raw: string): string | null => {
      if (!templates.some((template) => template.id === templateId)) return 'Select a template before importing frontmatter.'
      const result = parseFrontmatterTemplateImport(raw)
      if (!result.ok) return result.message

      clearFrontmatterTemplateFieldDrag()
      setFrontmatterFixedListOptionDrafts({})
      updateFrontmatterDraft((frontmatter) => ({
        ...frontmatter,
        templates: frontmatter.templates.map((template) =>
          template.id === templateId
            ? {
                ...template,
                fields: result.fields,
              }
            : template,
        ),
        settingsTemplateId: templateId,
      }))
      setFrontmatterTemplateImportTarget(null)
      return null
    }

    const readFrontmatterTemplateFieldDragId = (event: ReactDragEvent<HTMLElement>) =>
      frontmatterTemplateFieldDragIdRef.current
      || draggingFrontmatterTemplateFieldId
      || event.dataTransfer.getData(FRONTMATTER_TEMPLATE_FIELD_DRAG_MIME)

    const refreshFrontmatterTemplateFieldRects = () => {
      frontmatterTemplateFieldRectsRef.current = readFrontmatterListDropRects(
        frontmatterTemplateFieldListRef.current,
        '[data-frontmatter-template-field-id]',
      )
      return frontmatterTemplateFieldRectsRef.current
    }

    const getFrontmatterTemplateFieldDropIndex = (event: ReactDragEvent<HTMLElement>) => {
      const fieldCount = activeTemplate?.fields.length ?? 0
      const rects =
        frontmatterTemplateFieldRectsRef.current.length === fieldCount
          ? frontmatterTemplateFieldRectsRef.current
          : refreshFrontmatterTemplateFieldRects()
      return getFrontmatterListDropIndexFromPointer(rects, event.clientY, fieldCount)
    }

    const updateFrontmatterTemplateFieldDropTarget = (event: ReactDragEvent<HTMLElement>) => {
      if (!activeTemplate) return
      const sourceFieldId = readFrontmatterTemplateFieldDragId(event)
      if (!sourceFieldId) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      updateFrontmatterTemplateFieldDropIndex(getFrontmatterTemplateFieldDropIndex(event))
    }

    const dropFrontmatterTemplateField = (event: ReactDragEvent<HTMLElement>) => {
      if (!activeTemplate) return
      const sourceFieldId = readFrontmatterTemplateFieldDragId(event)
      const targetIndex = frontmatterTemplateFieldDropIndexRef.current ?? getFrontmatterTemplateFieldDropIndex(event)
      event.preventDefault()
      event.stopPropagation()
      clearFrontmatterTemplateFieldDrag()
      if (!sourceFieldId) return
      updateFrontmatterDraft((frontmatter) => {
        const nextTemplates = reorderFrontmatterTemplateFieldsByTargetIndex(
          frontmatter.templates,
          activeTemplate.id,
          sourceFieldId,
          targetIndex,
        )
        if (nextTemplates === frontmatter.templates) return frontmatter
        return {
          ...frontmatter,
          templates: nextTemplates,
          settingsTemplateId: frontmatter.settingsTemplateId || activeTemplate.id,
        }
      })
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
      setFrontmatterTemplateImportTarget(null)
      mutateState((previous) => ({
        ...previous,
        frontmatter: nextFrontmatter,
      }))
    }
    const deleteTargetTemplate = templates.find((template) => template.id === frontmatterTemplateDeleteTargetId) ?? null

    return (
      <>
      <section className="vault-settings-section" aria-label="Frontmatter settings">
        <p className="vault-settings-help">Template changes apply only after saving.</p>
        <div className="frontmatter-template-settings-layout">
          <div className="frontmatter-template-editor">
            <div className="frontmatter-template-toolbar">
              <label className="frontmatter-template-control frontmatter-template-select-field">
                <span>template</span>
                <select
                  className="settings-select-input frontmatter-template-select"
                  value={activeTemplate?.id ?? ''}
                  disabled={templates.length === 0}
                  onChange={(event) => selectFrontmatterTemplate(event.target.value)}
                >
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="frontmatter-template-control frontmatter-template-name-field">
                <span>name</span>
                <input
                  type="text"
                  className="settings-text-input"
                  value={activeTemplate?.name ?? ''}
                  disabled={!activeTemplate}
                  onChange={(event) => {
                    if (!activeTemplate) return
                    updateFrontmatterTemplate(activeTemplate.id, { name: event.target.value })
                  }}
                />
              </label>
              <div className="frontmatter-template-actions">
                <button
                  type="button"
                  className="vault-settings-action"
                  disabled={!activeTemplate}
                  onClick={openFrontmatterTemplateImport}
                >
                  Import frontmatter
                </button>
                <button
                  type="button"
                  className="vault-settings-action"
                  onClick={createFrontmatterTemplate}
                >
                  New template
                </button>
                <button
                  type="button"
                  className="vault-settings-action"
                  disabled={!activeTemplate || templates.length <= 1}
                  onClick={() => {
                    if (activeTemplate) setFrontmatterTemplateDeleteTargetId(activeTemplate.id)
                  }}
                >
                  Delete template
                </button>
              </div>
            </div>
            <div className="settings-divider" />
            {activeTemplate ? (
              <>
                <div
                  ref={frontmatterTemplateFieldListRef}
                  className="frontmatter-template-fields"
                  onDragEnter={updateFrontmatterTemplateFieldDropTarget}
                  onDragOver={updateFrontmatterTemplateFieldDropTarget}
                  onDragLeave={(event) => {
                    const relatedTarget = event.relatedTarget as Node | null
                    if (relatedTarget && event.currentTarget.contains(relatedTarget)) return
                    if (relatedTarget) updateFrontmatterTemplateFieldDropIndex(null)
                  }}
                  onDrop={dropFrontmatterTemplateField}
                >
                  <div className="frontmatter-template-field-row frontmatter-template-field-header" aria-hidden="true">
                    <span />
                    <span>key</span>
                    <span>type</span>
                    <span>computed</span>
                    <span>default value</span>
                    <span>lock</span>
                    <span>action</span>
                  </div>
                  {activeTemplate.fields.map((field, index) => (
                    <div
                      key={field.id}
                      data-frontmatter-template-field-id={field.id}
                      className={[
                        'frontmatter-template-field-row',
                        field.computed !== 'none' ? 'is-computed' : '',
                        draggingFrontmatterTemplateFieldId === field.id ? 'is-dragging' : '',
                        frontmatterTemplateFieldDropIndex === index ? 'is-drop-index-before' : '',
                        frontmatterTemplateFieldDropIndex === activeTemplate.fields.length && index === activeTemplate.fields.length - 1
                          ? 'is-drop-index-after'
                          : '',
                      ].filter(Boolean).join(' ')}
                    >
                      <button
                        type="button"
                        className="frontmatter-template-field-drag-handle"
                        aria-label={`Reorder ${field.key || 'frontmatter field'}`}
                        data-app-tooltip="Drag to reorder"
                        draggable
                        onDragStart={(event) => {
                          frontmatterTemplateFieldDragIdRef.current = field.id
                          frontmatterTemplateFieldRectsRef.current = refreshFrontmatterTemplateFieldRects()
                          setDraggingFrontmatterTemplateFieldId(field.id)
                          updateFrontmatterTemplateFieldDropIndex(null)
                          event.dataTransfer.effectAllowed = 'move'
                          event.dataTransfer.setData(FRONTMATTER_TEMPLATE_FIELD_DRAG_MIME, field.id)
                          event.dataTransfer.setData('text/plain', field.id)
                        }}
                        onDragEnd={clearFrontmatterTemplateFieldDrag}
                      >
                        <AppIcon iconId="gripVertical" className="frontmatter-template-field-drag-icon" />
                      </button>
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
                        className="vault-settings-action frontmatter-template-remove-btn"
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
                  <div className="frontmatter-template-add-field-row">
                    <button
                      type="button"
                      className="frontmatter-template-add-field-btn"
                      aria-label="Add field"
                      data-app-tooltip="Add field"
                      onClick={addFrontmatterTemplateField}
                    >
                      <AppIcon iconId="plus" className="frontmatter-template-add-field-icon" />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <p className="vault-settings-help">Create a template to add default frontmatter fields.</p>
            )}
            <div className="frontmatter-template-footer-actions">
              <button
                type="button"
                className="vault-settings-action"
                disabled={!frontmatterDraftDirty}
                onClick={() => {
                  setFrontmatterFixedListOptionDrafts({})
                  clearFrontmatterTemplateFieldDrag()
                  setFrontmatterTemplateDeleteTargetId('')
                  setFrontmatterTemplateImportTarget(null)
                  setFrontmatterDraft(stateRef.current.frontmatter)
                }}
              >
                Discard changes
              </button>
              <button
                type="button"
                className="vault-settings-action"
                disabled={!frontmatterDraftDirty}
                onClick={saveFrontmatterTemplates}
              >
                Save template
              </button>
            </div>
          </div>
        </div>
      </section>
      {deleteTargetTemplate ? (
        <FrontmatterTemplateDeleteDialog
          templateName={deleteTargetTemplate.name}
          onCancel={() => setFrontmatterTemplateDeleteTargetId('')}
          onConfirm={() => deleteFrontmatterTemplate(deleteTargetTemplate.id)}
        />
      ) : null}
      {frontmatterTemplateImportTarget ? (
        <FrontmatterTemplateImportDialog
          templateName={frontmatterTemplateImportTarget.templateName}
          onCancel={() => setFrontmatterTemplateImportTarget(null)}
          onImport={(raw) => importFrontmatterTemplate(frontmatterTemplateImportTarget.templateId, raw)}
        />
      ) : null}
      </>
    )
  }

  const renderMiscSettings = () => {
    const renderSegmentedSetting = <T extends string,>(
      label: string,
      value: T,
      options: Array<{ id: T; label: string }>,
      onChange: (value: T) => void,
    ) => {
      const labelId = `vault-settings-${label.replace(/\s+/g, '-')}-label`
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
      <section className="vault-settings-section" aria-label="Misc settings">
        <div className="settings-hotkeys-list">
          <VaultSettingsSwitch
            id="note-drop-auto-expands-folders"
            label="Moving notes into a folder auto-expands that folder"
            checked={state.ui.noteDropAutoExpandsFolders === true}
            onChange={(noteDropAutoExpandsFolders) =>
              mutateState((previous) => ({
                ...previous,
                ui: {
                  ...previous.ui,
                  noteDropAutoExpandsFolders,
                },
              }))
            }
          />
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
          {renderSegmentedSetting(
            'Tab Color Indicator',
            state.ui.tabColorIndicatorPlacement ?? 'bottom',
            TAB_COLOR_INDICATOR_PLACEMENT_OPTIONS,
            (tabColorIndicatorPlacement) =>
              mutateState((previous) => ({
                ...previous,
                ui: {
                  ...previous.ui,
                  tabColorIndicatorPlacement,
                },
              })),
          )}
        </div>
      </section>
    )
  }

  const renderTipsSettings = () => (
    <section className="vault-settings-section" aria-label="Tips settings">
      {state.ui.seenTipIds.length === 0 ? (
        <p className="vault-settings-help">Tips you have seen will appear here.</p>
      ) : (
        <div className="vault-settings-list">
          {state.ui.seenTipIds.map((tipId: TipId) => {
            const tip = getTipDefinition(tipId, { isMacPlatform })
            const enabled = !state.ui.disabledTipIds.includes(tipId)
            return (
              <VaultSettingsSwitch
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
    <section className="vault-utility-content vault-settings-panel" aria-label="Settings">
      {renderSegmentedTabs('Settings sections', SETTINGS_SECTION_TABS, settingsSection, setSettingsSection)}
      {settingsSection === 'data' ? renderDataSettings() : null}
      {settingsSection === 'visuals' ? (
        <VaultThemeSettings state={state} onMutateState={mutateState} />
      ) : null}
      {settingsSection === 'toolbar' ? renderToolbarSettings() : null}
      {settingsSection === 'hotkeys' ? renderHotkeySettings() : null}
      {settingsSection === 'shortcuts' ? renderShortcutSettings() : null}
      {settingsSection === 'frontmatter' ? renderFrontmatterSettings() : null}
      {settingsSection === 'misc' ? renderMiscSettings() : null}
      {settingsSection === 'tips' ? renderTipsSettings() : null}
    </section>
  )

  const renderMessagesContent = () => (
    <section className="vault-utility-content vault-tabbed-utility-panel" aria-label="Messages">
      {renderSegmentedTabs('Messages sections', MESSAGE_SECTION_TABS, messagesSection, setMessagesSection)}
      <MessagesView
        section={messagesSection}
        messages={state.messages ?? []}
        toastHistory={state.toastHistory ?? []}
        diagnosticDays={diagnosticDays}
        selectedDiagnosticDay={selectedDiagnosticDay}
        diagnosticEntries={diagnosticEntries}
        diagnosticLevelFilter={diagnosticLevelFilter}
        diagnosticDisplayLimit={diagnosticDisplayLimit}
        diagnosticMode={diagnosticMode}
        diagnosticCaptureEnabled={diagnosticCaptureEnabled}
        onDiagnosticDayChange={setSelectedDiagnosticDay}
        onDiagnosticLevelFilterChange={setDiagnosticLevelFilter}
        onDiagnosticDisplayLimitChange={setDiagnosticDisplayLimit}
        onDiagnosticModeChange={setDiagnosticMode}
        onDiagnosticCaptureEnabledChange={setDiagnosticCaptureEnabled}
        onOpenDiagnosticsFolder={
          typeof window !== 'undefined' && typeof window.electronAPI?.openDiagnosticsFolder === 'function'
            ? openDiagnosticsFolder
            : undefined
        }
        onDeleteTodayDiagnosticLogs={deleteTodayDiagnosticLogs}
        onDeleteAllDiagnosticLogs={deleteAllDiagnosticLogs}
        canDeleteTodayDiagnosticLogs={diagnosticDays.includes(getDiagnosticDayKey())}
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
    <section className="vault-utility-content vault-tabbed-utility-panel" aria-label="About">
      {renderSegmentedTabs('About sections', ABOUT_SECTION_TABS, aboutSection, setAboutSection)}
      <AboutView section={aboutSection} />
    </section>
  )

  const renderTrashContent = () => (
    <section className="vault-utility-content vault-trash-panel" aria-label="Trash">
      <header className="vault-utility-panel-header">
        <div>
          <h2>Trash</h2>
          <p>{state.vault.deletedItems.length.toLocaleString()} deleted item{state.vault.deletedItems.length === 1 ? '' : 's'}</p>
        </div>
      </header>
      {state.vault.deletedItems.length === 0 ? <p className="vault-settings-help">No deleted items.</p> : null}
      {state.vault.deletedItems.length > 0 ? (
        <div className="vault-trash-table" aria-label="Deleted notes">
          <div className="vault-trash-header">
            <span>Note name</span>
            <span>Deleted at</span>
            <span>Actions</span>
          </div>
          <div className="vault-trash-list">
            {state.vault.deletedItems.map((entry) => {
              const title = getVaultItemDisplayTitle(entry.item)
              const previewMarkdown = getDeletedVaultNoteMarkdown(entry, state)
              const canPreview = entry.item.type === 'note'
              const expanded = canPreview && expandedTrashItemId === entry.id
              const previewId = `trash-preview-${entry.id}`
              return (
                <div className={`vault-trash-item ${expanded ? 'is-expanded' : ''}`} key={entry.id}>
                  <div className="vault-trash-row">
                    {canPreview ? (
                      <button
                        type="button"
                        className="vault-trash-name-button"
                        onClick={() => setExpandedTrashItemId((previous) => (previous === entry.id ? '' : entry.id))}
                        aria-expanded={expanded}
                        aria-controls={previewId}
                      >
                        <span>{title}</span>
                      </button>
                    ) : (
                      <span className="vault-trash-name-text">{title}</span>
                    )}
                    <time className="vault-trash-date" dateTime={getDeletedAtTitle(entry.deletedAt)}>
                      {formatDeletedAt(entry.deletedAt)}
                    </time>
                    <div className="vault-trash-actions" aria-label={`${title} actions`}>
                      <button type="button" onClick={() => restoreDeletedItem(entry.id)}>Restore</button>
                      <button type="button" onClick={() => permanentlyDeleteDeletedItem(entry.id)}>Delete</button>
                    </div>
                  </div>
                  {expanded ? (
                    <div className="vault-trash-preview" id={previewId}>
                      {previewMarkdown.trim() ? (
                        <TrashMarkdownPreview markdown={previewMarkdown} />
                      ) : (
                        <p className="vault-trash-empty-preview">No note content.</p>
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
      <section className="vault-utility-shell" aria-label="Utilities">
        <header className="vault-utility-header">
          {renderSegmentedTabs('Utility sections', utilityTabs, viewMode, setViewMode)}
          <button type="button" className="vault-settings-action" onClick={() => setViewMode('main')}>
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

  const desktopVaultSetupRequired = Boolean(
    window.electronAPI?.getStorageProfileStatus &&
      storageProfileController.storageProfileStatus?.status === 'setup-required',
  )
  const runtimeVersionLabel = runtimeVersion ? `Version ${runtimeVersion}` : ''

  const renderVaultSetupScreen = () => (
    <main className="vault-main vault-setup-main" aria-label="Vault setup">
      <section className="vault-setup-screen">
        <div className="vault-setup-brand" aria-label={VAULT_SETUP_APP_NAME}>
          <img className="vault-setup-logo" src={VAULT_SETUP_LOGO_SRC} alt="" aria-hidden="true" />
          <h1>{VAULT_SETUP_APP_NAME}</h1>
          {runtimeVersionLabel ? <p>{runtimeVersionLabel}</p> : null}
        </div>
        <div className="vault-setup-panel">
          <div className="vault-setup-action-row">
            <div className="vault-setup-action-copy">
              <h2>Create new vault</h2>
              <p>Name a vault, then choose where to save it.</p>
            </div>
            <button type="button" className="vault-setup-action-button is-primary" onClick={createVaultFromSettings}>
              Create
            </button>
          </div>
          <div className="vault-setup-action-row">
            <div className="vault-setup-action-copy">
              <h2>Open AisleNote vault</h2>
              <p>Choose an existing AisleNote vault.</p>
            </div>
            <button type="button" className="vault-setup-action-button" onClick={() => void storageProfileController.openVault()}>
              Open
            </button>
          </div>
        </div>
      </section>
    </main>
  )

  const scratchpadToggleLabel = viewMode === 'settings'
    ? scratchpadActive
      ? 'Return to scratchpad'
      : 'Return to notes'
    : scratchpadActive
      ? 'Return to notes'
      : 'Show scratchpad'
  const noteActionPickerViewportRect = viewMode === 'main' ? noteContentViewportRect : null
  const noteActionPickerAnchor = noteActionPicker?.anchor
    ? getAisleCenteredNoteActionPickerAnchor(workspaceRootRef.current, renderedActiveAisleId, noteActionPicker.anchor)
    : null

  return (
    <div
      ref={vaultShellRef}
      className={`app-shell vault-shell ${getThemeClassName(state.theme)}`}
      data-theme={state.theme}
      style={rootStyle}
    >
      {desktopVaultSetupRequired ? renderVaultSetupScreen() : (
        <>
      <aside
        className={`vault-sidebar ${state.ui.sidebarCollapsed ? 'is-collapsed' : ''}`}
        style={{ width: state.ui.sidebarCollapsed ? 48 : clampSidebarWidth(state.ui.sidebarWidth) }}
      >
        {!state.ui.sidebarCollapsed ? (
          <div className="vault-sidebar-header" aria-label="Vault actions">
            <button
              type="button"
              className="vault-icon-button vault-sidebar-header-action"
              onClick={createNote}
              aria-label="New note"
              title="New note"
            >
              <AppIcon iconId="filePlus" className="vault-sidebar-header-icon" />
            </button>
            <button
              type="button"
              className="vault-icon-button vault-sidebar-header-action"
              onClick={createFolder}
              aria-label="New folder"
              title="New folder"
            >
              <AppIcon iconId="folderPlus" className="vault-sidebar-header-icon" />
            </button>
          </div>
        ) : null}
        {!state.ui.sidebarCollapsed ? (
          <button
            type="button"
            className={`vault-icon-button vault-sidebar-search-mode-toggle ${
              sidebarSearchVisible ? 'is-active' : ''
            }`}
            onClick={toggleSidebarSearchModeFromButton}
            aria-label="Search notes"
            title="Search notes"
            aria-pressed={sidebarSearchVisible}
          >
            <AppIcon iconId="search" className="vault-sidebar-search-mode-toggle-icon" />
          </button>
        ) : null}
        {!state.ui.sidebarCollapsed ? (
          <button
            type="button"
            className={`vault-icon-button vault-sidebar-scratchpad-toggle ${
              scratchpadActive ? 'is-active' : ''
            }`}
            onClick={toggleNotesScratchpadFromShortcut}
            aria-label={scratchpadToggleLabel}
            title={scratchpadToggleLabel}
            aria-pressed={scratchpadActive}
          >
            <span className="vault-sidebar-scratchpad-icon" aria-hidden="true" />
          </button>
        ) : null}
        <button
          className={`vault-icon-button vault-sidebar-settings ${isUtilityViewMode(viewMode) ? 'is-active' : ''}`}
          type="button"
          onClick={handleSidebarSettingsClick}
          aria-label="Open settings"
          title="Open settings"
        >
          <AppIcon iconId="settings" className="vault-sidebar-settings-icon" />
        </button>
        {!state.ui.sidebarCollapsed && sidebarSearchVisible ? (
          <SidebarSearchPanel
            inputRef={searchInputRef}
            query={query}
            active={sidebarSearchActive}
            metadataSearchActive={sidebarSearchMetadataActive}
            suggestions={sidebarSearchSuggestions}
            searchOptions={SIDEBAR_SEARCH_OPTIONS}
            searchHistory={sidebarSearchHistory}
            resultGroups={sidebarSearchResultGroups}
            onQueryChange={updateSidebarSearchQuery}
            onSelectSuggestion={selectSidebarSearchSuggestion}
            onSelectSearchOption={selectSidebarSearchOption}
            onSelectHistory={selectSidebarSearchHistory}
            onClearHistory={clearSidebarSearchHistory}
            onClear={clearSidebarSearch}
            onClearButtonClick={closeSidebarSearchMode}
            onCloseMode={closeSidebarSearchMode}
            onOpenResult={openSidebarSearchResult}
          />
        ) : null}
        {!state.ui.sidebarCollapsed && !sidebarSearchVisible ? (
          <>
              <div
                className="vault-tree"
                ref={vaultTreeScrollRef}
                role="tree"
                aria-multiselectable="true"
                onScroll={handleVaultTreeScroll}
                onClick={clearActiveFolderFromRootTreeClick}
                onContextMenu={openRootTreeContextMenu}
              >
                {useVirtualizedVaultTree ? (
                  <div
                    className="vault-tree-virtual-spacer"
                    style={{ height: vaultTreeVirtualWindow.totalHeight }}
                  >
                    {vaultTreeVirtualWindow.rows.map((row, rowOffset) => (
                      <div
                        key={row.item.id}
                        className="vault-tree-virtual-row"
                        style={{
                          transform: `translateY(${
                            (vaultTreeVirtualWindow.startIndex + rowOffset) * VAULT_TREE_VIRTUAL_ROW_HEIGHT
                          }px)`,
                        }}
                      >
                        <MemoizedTreeItemRow
                          item={row.item}
                          depth={row.depth}
                          parentFolderId={row.parentFolderId}
                          index={row.index}
                          activeFolderId={activeFolderId}
                          activeNoteId={activeModelIsScratchpad ? '' : state.vault.activeNoteId}
                          renamingItemId={renamingItemSurface === 'tree' ? renamingTreeItemId : ''}
                          renameDraft={treeRenameDraft}
                          draggingItemId={draggingTreeItemId}
                          draggingNoteIds={draggingTreeNoteIdSet}
                          selectedNoteIds={selectedTreeNoteIdSet}
                          createdRenameItemId={pendingCreatedTreeRenameRef.current?.itemId ?? ''}
                          dropTarget={treeDropTarget}
                          collapsedFolderIds={collapsedFolderIds}
                          query={query}
                          renderChildren={false}
                          onSelectNote={selectSidebarTreeNote}
                          onOpenNoteRetained={openSidebarTreeNoteRetained}
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
                      </div>
                    ))}
                  </div>
                ) : (
                  state.vault.items.map((item, itemIndex) => (
                    <MemoizedTreeItemRow
                      key={item.id}
                      item={item}
                      depth={0}
                      parentFolderId={null}
                      index={itemIndex}
                      activeFolderId={activeFolderId}
                      activeNoteId={activeModelIsScratchpad ? '' : state.vault.activeNoteId}
                      renamingItemId={renamingItemSurface === 'tree' ? renamingTreeItemId : ''}
                      renameDraft={treeRenameDraft}
                      draggingItemId={draggingTreeItemId}
                      draggingNoteIds={draggingTreeNoteIdSet}
                      selectedNoteIds={selectedTreeNoteIdSet}
                      createdRenameItemId={pendingCreatedTreeRenameRef.current?.itemId ?? ''}
                      dropTarget={treeDropTarget}
                      collapsedFolderIds={collapsedFolderIds}
                      query={query}
                      onSelectNote={selectSidebarTreeNote}
                      onOpenNoteRetained={openSidebarTreeNoteRetained}
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
                  ))
                )}
                <div
                  className={`vault-tree-root-drop-zone ${treeDropTarget?.position === 'root' ? 'is-drop-root' : ''}`}
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
            className="vault-sidebar-resize-handle"
            aria-label="Resize sidebar"
            title="Resize sidebar"
            data-app-tooltip="Drag to resize. Double click to reset."
            onPointerDown={startSidebarResize}
            onPointerMove={updateSidebarResize}
            onPointerUp={finishSidebarResize}
            onPointerCancel={finishSidebarResize}
            onDoubleClick={resetSidebarWidth}
          >
            <span className="vault-sidebar-resize-capsule" aria-hidden="true" />
          </button>
        ) : null}
        {renderSidebarVaultFooter()}
      </aside>
      <main className="vault-main">
        {viewMode === 'main' ? (
          activeModel ? (
            <section
              className="vault-editor-surface"
              aria-label={activeModel.title}
              onContextMenu={openVaultEditorContextMenuFromPointer}
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
                noteContentOverlay={noteWorkspaceOverlay}
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
                onRootChange={handleWorkspaceRootChange}
                onAisleScroll={() => undefined}
                onActivateAisle={(editorKey, pointer) => {
                  const activationSource = pointer ? 'pointer' : undefined
                  const targetAisleId = getAisleIdFromAisleEditorKey(editorKey)
                  if (shouldClearPendingCursorRestoreForAisleActivation(activationSource)) {
                    pendingCursorRestoreRef.current = null
                    pendingFocusToAisleIdRef.current = null
                    pendingNavigationTopAisleIdRef.current = null
                    pendingScrollToAisleIdRef.current = null
                  }
                  setActiveAisleId(targetAisleId)
                  vaultEditors.activateAisleEditor(
                    editorKey,
                    pointer
                      ? {
                          focusAtClientPoint: pointer,
                          source: 'pointer',
                        }
                      : undefined,
                  )
                  if (pointer && targetAisleId) {
                    queueAisleFocusScroll(activeModel.noteBody.id, targetAisleId)
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
                mountedAisleIds={vaultEditors.mountedAisleIds}
                failedEditorMountAisleIds={vaultEditors.failedEditorMountAisleIds}
                getPreviewMarkdownForAisle={vaultEditors.getPreviewMarkdownForAisle}
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
                onRegisterAislePaneRoot={vaultEditors.registerAislePaneRoot}
                onRegisterAisleEditorRoot={vaultEditors.registerAisleEditorRoot}
                tabColorIndicatorPlacement={state.ui.tabColorIndicatorPlacement ?? 'bottom'}
                noteTabs={activeModelIsScratchpad ? [] : noteTabItems}
                renamingNoteTabId={renamingItemSurface === 'tab' ? renamingTreeItemId : ''}
                noteTabRenameDraft={treeRenameDraft}
                onSelectNoteTab={selectNoteTab}
                onCloseNoteTab={closeNoteTab}
                onPromoteNoteTab={promoteNoteTab}
                onReorderNoteTabs={reorderNoteTabs}
                onStartNoteTabRename={startNoteTabRename}
                onNoteTabRenameDraftChange={setTreeRenameDraft}
                onCommitNoteTabRename={commitTreeRename}
                onCancelNoteTabRename={cancelTreeRename}
              />
              <VaultAisleContextMenu
                menu={aisleContextMenu}
                canDecoupleAisle={canDecoupleAisleById(aisleContextMenu?.aisleId ?? '')}
                onClose={() => setAisleContextMenu(null)}
                onFilterSyncedAisle={() => filterSyncedAisle(aisleContextMenu?.aisleId ?? renderedActiveAisleId)}
                onQuickDecoupleAisle={() => decoupleAisle(aisleContextMenu?.aisleId ?? renderedActiveAisleId)}
                onShowSyncedAisle={() => openDecoupleAisleDialog(aisleContextMenu?.aisleId ?? renderedActiveAisleId)}
              />
              <VaultEditorContextMenu
                menu={editorContextMenu}
                canDecoupleAisle={canDecoupleAisleById(editorContextMenu?.aisleId ?? '')}
                revealLabel={sidebarRevealLabel}
                canReveal={typeof window !== 'undefined' && typeof window.electronAPI?.revealNoteLocation === 'function'}
                onClose={() => setEditorContextMenu(null)}
                onClipboard={runEditorContextClipboardAction}
                onCommand={vaultEditors.runCommand}
                onInsertUrlLink={openToolbarLinkPicker}
                onEditLink={openUrlLinkPrompt}
                onInsertNoteLink={() => openContextNoteReferencePicker('note-link')}
                onInsertNotePreview={() => openContextNoteReferencePicker('note-preview')}
                onInsertAisle={insertEditorContextAisle}
                onInsertAttachment={vaultEditors.insertAttachmentFile}
                onCopyAs={copyVaultStructureAs}
                onCreateSyncedCopy={openWholeNoteCopyPicker}
                onFilterSyncedAisle={filterSyncedAisle}
                onDecoupleAisle={decoupleAisle}
                onShowSyncedAisle={openDecoupleAisleDialog}
                onPrintAisle={printAisle}
                onExportPdf={exportPdf}
                onRevealLocation={revealEditorContextLocation}
              />
              {findReplaceOpen ? (
                <FindReplacePanel
                  focusRequestId={findReplaceFocusRequestId}
                  query={findReplaceQuery}
                  replacement={findReplaceReplacement}
                  caseSensitive={findReplaceOptions.caseSensitive}
                  wholeWord={findReplaceOptions.wholeWord}
                  regex={findReplaceOptions.regex}
                  queryError={findReplaceQueryError}
                  matches={findReplaceMatches}
                  activeIndex={findReplaceActiveMatchIndex}
                  onQueryChange={updateFindReplaceQuery}
                  onReplacementChange={setFindReplaceReplacement}
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
            <section className="vault-empty-state">
              <h2>No notes</h2>
              <button type="button" onClick={createNote}>Create note</button>
            </section>
          )
        ) : null}
        {renderUtilityShell()}
      </main>
        </>
      )}
      {zoomHudPercent !== null ? (
        <div className="app-zoom-hud" role="status" aria-live="polite" aria-label={`Zoom ${zoomHudPercent}%`}>
          {zoomHudPercent}%
        </div>
      ) : null}
      {noteActionPicker ? (
        <VaultNoteActionPicker
          title={noteActionPicker.title}
          entries={noteActionEntries}
          query={noteActionPicker.query}
          showSearchInput={noteActionPicker.source !== 'mention'}
          showHeader={noteActionPicker.source !== 'mention'}
          actions={noteActionPicker.actions}
          anchor={noteActionPickerAnchor}
          viewportRect={noteActionPickerViewportRect}
          urlEnabled={noteActionPicker.urlEnabled}
          onQueryChange={updateNoteActionPickerQuery}
          onSubmitUrl={submitUrlLink}
          onAction={handleNoteActionPickerAction}
          getActionsForNote={getNoteActionPickerActionsForNoteId}
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
      <VaultNameDialog
        dialog={vaultNameDialog}
        onCancel={() => setVaultNameDialog(null)}
        onSubmit={submitVaultNameDialog}
      />
      {decoupleDialog ? (
        <VaultDecoupleDialog
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
      <VaultTreeContextMenu
        menu={treeContextMenu}
        revealLabel={sidebarRevealLabel}
        canReveal={typeof window !== 'undefined' && typeof window.electronAPI?.revealVaultItemLocation === 'function'}
        deleteLabel={treeContextDeleteLabel}
        onClose={() => setTreeContextMenu(null)}
        onCreateNote={createTreeContextNote}
        onCreateFolder={createTreeContextFolder}
        onSort={sortTreeContextScope}
        onReveal={revealTreeContextItem}
        onRename={renameTreeContextItem}
        onDelete={deleteTreeContextItem}
      />
      <ToastHost
        toasts={appNotifications.toasts}
        onToastMouseEnter={appNotifications.pauseToastDismissals}
        onToastMouseLeave={appNotifications.resumeToastDismissals}
      />
      <TipHost tips={appNotifications.visibleTipDefinitions} onDismissTip={appNotifications.dismissTip} />
    </div>
  )
}
