import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { Editor } from '@toast-ui/editor'
import '@toast-ui/editor/dist/toastui-editor.css'
import type {
  AppState,
  AppTheme,
  CustomThemeId,
  CustomThemePaletteSlot,
  FrontmatterData,
  NoteAisle,
  NoteAisleBody,
  NoteBody,
  NotebookTreeItem,
  ResolvedNoteAisle,
  ViewMode,
} from '../types/app'
import {
  clearAisleFrontmatterInState,
  resolveNoteBody,
  syncNoteBodyAisleStructureInState,
  syncNoteAisleBodyMarkdownInState,
} from '../notes/aisle-body-state'
import {
  parseFrontmatterYaml,
  stringifyFrontmatterYaml,
} from '../frontmatter/frontmatter'
import {
  buildNoteLocationKey,
  filterNoteSearchEntries,
  listSearchableNoteLocations,
} from '../notes/note-locations'
import { getAisleIdFromAisleEditorKey } from '../editor/aisle-editor'
import { DEFAULT_TOOLBAR_LAYOUT_ID, resolveToolbarLayout } from '../editor/toolbar-layouts'
import { resetAisleWidthForLocation, setAisleWidthForLocation } from '../notes/aisle-widths'
import { NoteWorkspace } from '../components/notes/NoteWorkspace'
import { SharedEditorToolbar } from '../components/editor/SharedEditorToolbar'
import { EditorToolbarPopovers } from '../components/editor/EditorToolbarPopovers'
import { TableControlsOverlay } from '../components/editor/TableControlsOverlay'
import { AisleEditModal } from '../components/notes/AisleEditModal'
import { useEditorToolbarState } from '../editor/useEditorToolbarState'
import { useNotebookAisleEditors } from '../editor/useNotebookAisleEditors'
import { useTableControls } from '../editor/useTableControls'
import {
  buildTableOfContentsPanels,
  TABLE_OF_CONTENTS_EMPTY_MESSAGE,
  type TableOfContentsPanelsState,
} from '../editor/table-of-contents'
import { MAX_AISLE_WARNING_MESSAGE, MAX_NOTE_AISLES } from '../editor/aisle-edit-draft'
import { parseSavedState } from '../state/app-state'
import { createRandomId, createReservedIdAllocator } from '../state/navigation-ids'
import {
  BUILT_IN_THEME_PALETTE_SEEDS,
  CUSTOM_THEME_IDS,
  CUSTOM_THEME_PALETTE_LABELS,
  CUSTOM_THEME_PALETTE_SLOTS,
  getCustomThemeVariables,
  getStoredCustomThemePalette,
  getThemeClassName,
  isCustomTheme,
  normalizeCustomThemePalette,
} from '../theme/notebook-themes'
import {
  collectNotebookIds,
  createNoteBodyWithAisle,
  createNotebookFolderInState,
  createNotebookNoteInState,
  decoupleNotebookAisleBodyInState,
  decoupleNotebookNoteBodyInState,
  deleteNotebookItemInState,
  findNotebookNote,
  getContainingFolderId,
  getFirstNotebookNote,
  getNotebookNoteFolderPath,
  insertNotebookItem,
  isNoteBodyLinked,
  renameNotebookItem,
  restoreDeletedNotebookItemInState,
} from '../state/notebook'

const BROWSER_STATE_KEY = 'tabs:app-state-cache:v2'
const SAVE_DELAY_MS = 350
const SIDEBAR_MIN_WIDTH = 220
const SIDEBAR_MAX_WIDTH = 520

const THEME_LABELS: Record<AppTheme, string> = {
  dark: 'Dark',
  light: 'Light',
  dawn: 'Dawn',
  custom1: 'Custom 1',
  custom2: 'Custom 2',
  custom3: 'Custom 3',
}

type LoadedState = {
  state: AppState
  revision: number
}

type ActiveNoteModel = {
  noteId: string
  title: string
  noteBody: NoteBody
  resolved: NonNullable<ReturnType<typeof resolveNoteBody>>
  linked: boolean
  folderPath: string
}

type MutableNotebookFolder = {
  type: 'folder'
  id: string
  title: string
  children: NotebookTreeItem[]
}

type NotebookAisleContextMenuState = {
  x: number
  y: number
  aisleId: string
}

type NotebookFrontmatterModalState = {
  aisleId: string
  aisleBodyId: string
  initialYaml: string
}

function loadInitialState(): LoadedState {
  try {
    const result = window.electronAPI?.loadAppStateResult?.()
    if (result?.ok) {
      return {
        state: parseSavedState(result.serializedState),
        revision: result.revision,
      }
    }
    if (result && !result.ok) {
      return {
        state: parseSavedState(null),
        revision: result.revision,
      }
    }
  } catch {
    // Fall through to browser cache.
  }

  try {
    return {
      state: parseSavedState(localStorage.getItem(BROWSER_STATE_KEY)),
      revision: 0,
    }
  } catch {
    return {
      state: parseSavedState(null),
      revision: 0,
    }
  }
}

function saveSerializedState(serializedState: string, revision: number): number {
  try {
    if (window.electronAPI?.saveAppState) {
      const result = window.electronAPI.saveAppState({ serializedState, baseRevision: revision })
      if (result?.ok) return result.revision
      return typeof result?.currentRevision === 'number' ? result.currentRevision : revision
    }
  } catch {
    // Browser cache fallback keeps development usable if Electron save fails.
  }

  try {
    localStorage.setItem(BROWSER_STATE_KEY, serializedState)
  } catch {
    // Local cache writes are best-effort in the browser.
  }
  return revision
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

function stripMarkdownExtension(fileName: string): string {
  return fileName.replace(/\.(md|markdown)$/i, '')
}

function buildStateFromMarkdownFolder(files: Array<{ relativePath: string; markdown: string }>): AppState {
  const baseState = parseSavedState(null)
  const rootItems: NotebookTreeItem[] = []
  const foldersByPath = new Map<string, MutableNotebookFolder>()
  const noteBodies: NoteBody[] = []
  const noteAisleBodies: NoteAisleBody[] = []
  let activeNoteId = ''

  const getFolder = (parts: string[]): MutableNotebookFolder | null => {
    if (parts.length === 0) return null
    let parentItems = rootItems
    let folderPath = ''
    let folder: MutableNotebookFolder | null = null
    for (const part of parts) {
      folderPath = folderPath ? `${folderPath}/${part}` : part
      folder = foldersByPath.get(folderPath) ?? null
      if (!folder) {
        folder = {
          type: 'folder',
          id: createRandomId(),
          title: part,
          children: [],
        }
        foldersByPath.set(folderPath, folder)
        parentItems.push(folder)
      }
      parentItems = folder.children
    }
    return folder
  }

  files
    .map((file) => ({
      ...file,
      parts: file.relativePath.replace(/\\/g, '/').split('/').filter(Boolean),
    }))
    .filter((file) => file.parts.length > 0)
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
    .forEach((file) => {
      const fileName = file.parts[file.parts.length - 1]
      const folder = getFolder(file.parts.slice(0, -1))
      const parentItems = folder ? folder.children : rootItems
      const { noteBody, aisleBody } = createNoteBodyWithAisle(file.markdown)
      const noteId = createRandomId()
      parentItems.push({
        type: 'note',
        id: noteId,
        title: stripMarkdownExtension(fileName),
        noteBodyId: noteBody.id,
      })
      activeNoteId ||= noteId
      noteBodies.push(noteBody)
      noteAisleBodies.push(aisleBody)
    })

  const scratchpadBodyId = baseState.scratchpad?.noteBodyId
  const scratchpadBodies = scratchpadBodyId ? baseState.noteBodies.filter((body) => body.id === scratchpadBodyId) : []
  const scratchpadAisleBodyIds = new Set(
    scratchpadBodies.flatMap((body) => body.aisles.map((aisle) => aisle.aisleBodyId)),
  )
  const scratchpadAisleBodies = (baseState.noteAisleBodies ?? []).filter((body) => scratchpadAisleBodyIds.has(body.id))

  return {
    ...baseState,
    notebook: {
      ...baseState.notebook,
      activeNoteId,
      items: rootItems,
      deletedItems: [],
    },
    noteBodies: [...noteBodies, ...scratchpadBodies],
    noteAisleBodies: [...noteAisleBodies, ...scratchpadAisleBodies],
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
  rawYaml: string,
): AppState {
  const timestamp = new Date().toISOString()
  const existingBodies = state.noteAisleBodies ?? []
  const nextBodies = existingBodies.map((body) =>
    body.id === aisleBodyId
      ? {
          ...body,
          updatedAt: timestamp,
          frontmatter,
          frontmatterStatus: frontmatter ? 'valid' as const : 'none' as const,
          frontmatterParseError: undefined,
          frontmatterRaw: rawYaml.trim() ? rawYaml : undefined,
        }
      : body,
  )
  return {
    ...state,
    noteAisleBodies: nextBodies,
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

function TreeItemRow({
  item,
  depth,
  activeNoteId,
  collapsedFolderIds,
  query,
  onSelectNote,
  onToggleFolder,
  onRename,
  onDelete,
}: {
  item: NotebookTreeItem
  depth: number
  activeNoteId: string
  collapsedFolderIds: Set<string>
  query: string
  onSelectNote: (noteId: string) => void
  onToggleFolder: (folderId: string) => void
  onRename: (itemId: string, title: string) => void
  onDelete: (itemId: string) => void
}) {
  const isFolder = item.type === 'folder'
  const collapsed = isFolder && collapsedFolderIds.has(item.id)
  const titleMatches = !query || item.title.toLowerCase().includes(query.toLowerCase())
  const children = isFolder ? item.children : []

  if (!titleMatches && !isFolder) return null

  return (
    <>
      <div
        className={`notebook-tree-row ${item.type === 'note' && item.id === activeNoteId ? 'is-active' : ''}`}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
      >
        <button
          className="notebook-tree-main"
          type="button"
          onClick={() => (item.type === 'folder' ? onToggleFolder(item.id) : onSelectNote(item.id))}
          onDoubleClick={() => {
            const nextTitle = window.prompt('Rename', item.title)
            if (nextTitle !== null) onRename(item.id, nextTitle)
          }}
          title={item.type === 'folder' ? 'Toggle folder' : 'Open note'}
        >
          <span className="notebook-tree-disclosure">{isFolder ? (collapsed ? '+' : '-') : ''}</span>
          <span className="notebook-tree-title">{item.title}</span>
        </button>
        <button
          className="notebook-tree-action"
          type="button"
          onClick={() => {
            const nextTitle = window.prompt('Rename', item.title)
            if (nextTitle !== null) onRename(item.id, nextTitle)
          }}
          title="Rename"
        >
          Rename
        </button>
        <button
          className="notebook-tree-action"
          type="button"
          onClick={() => onDelete(item.id)}
          title="Move to trash"
        >
          Trash
        </button>
      </div>
      {isFolder && !collapsed
        ? children.map((child) => (
            <TreeItemRow
              key={child.id}
              item={child}
              depth={depth + 1}
              activeNoteId={activeNoteId}
              collapsedFolderIds={collapsedFolderIds}
              query={query}
              onSelectNote={onSelectNote}
              onToggleFolder={onToggleFolder}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))
        : null}
    </>
  )
}

function NotebookAisleContextMenu({
  menu,
  canDecoupleNote,
  canDecoupleAisle,
  onClose,
  onDecoupleNote,
  onDecoupleAisle,
}: {
  menu: NotebookAisleContextMenuState | null
  canDecoupleNote: boolean
  canDecoupleAisle: boolean
  onClose: () => void
  onDecoupleNote: () => void
  onDecoupleAisle: () => void
}) {
  if (!menu) return null
  return (
    <div
      className="tab-context-menu"
      role="menu"
      style={{ top: `${menu.y}px`, left: `${menu.x}px` }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {canDecoupleNote ? (
        <button
          type="button"
          className="tab-context-delete"
          onClick={() => {
            onDecoupleNote()
            onClose()
          }}
        >
          De-couple note
        </button>
      ) : canDecoupleAisle ? (
        <button
          type="button"
          className="tab-context-delete"
          onClick={() => {
            onDecoupleAisle()
            onClose()
          }}
        >
          De-couple aisle
        </button>
      ) : (
        <button type="button" className="tab-context-delete" disabled>
          No synced item
        </button>
      )}
    </div>
  )
}

function NotebookFrontmatterModal({
  modal,
  onCancel,
  onSave,
}: {
  modal: NotebookFrontmatterModalState | null
  onCancel: () => void
  onSave: (yaml: string) => string | null
}) {
  const [yaml, setYaml] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!modal) return
    setYaml(modal.initialYaml)
    setError('')
  }, [modal])

  if (!modal) return null

  return (
    <div className="modal-backdrop notebook-modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        className="modal-card notebook-frontmatter-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Frontmatter"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-card-header">
          <h2>Frontmatter</h2>
        </header>
        <textarea
          className="notebook-frontmatter-editor"
          value={yaml}
          onChange={(event) => {
            setYaml(event.target.value)
            setError('')
          }}
          spellCheck={false}
        />
        {error ? <p className="notebook-frontmatter-error">{error}</p> : null}
        <footer className="modal-card-footer">
          <button type="button" className="btn btn-sm settings-action-btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-sm settings-action-btn"
            onClick={() => {
              const nextError = onSave(yaml)
              if (nextError) setError(nextError)
            }}
          >
            Save
          </button>
        </footer>
      </section>
    </div>
  )
}

function NotebookThemeSettings({
  state,
  onMutateState,
}: {
  state: AppState
  onMutateState: (updater: (previous: AppState) => AppState) => void
}) {
  const selectedCustomTheme = state.ui.selectedCustomTheme ?? 'custom1'
  const selectedPalette = getStoredCustomThemePalette(state.ui.themePalettes, selectedCustomTheme)

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
      ui: {
        ...previous.ui,
        selectedCustomTheme: themeId,
      },
    }))
  }

  const updatePaletteSlot = (slot: CustomThemePaletteSlot, value: string) => {
    onMutateState((previous) => {
      const themeId = previous.ui.selectedCustomTheme ?? selectedCustomTheme
      const currentPalette = getStoredCustomThemePalette(previous.ui.themePalettes, themeId)
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
              BUILT_IN_THEME_PALETTE_SEEDS[themeId],
            ),
          },
        },
      }
    })
  }

  const resetSelectedPalette = () => {
    onMutateState((previous) => {
      const themeId = previous.ui.selectedCustomTheme ?? selectedCustomTheme
      return {
        ...previous,
        ui: {
          ...previous.ui,
          themePalettes: {
            ...(previous.ui.themePalettes ?? {}),
            [themeId]: BUILT_IN_THEME_PALETTE_SEEDS[themeId],
          },
        },
      }
    })
  }

  const updateUiScale = (key: 'noteFontScale' | 'toolbarButtonScale', value: number) => {
    onMutateState((previous) => ({
      ...previous,
      ui: {
        ...previous.ui,
        [key]: value,
      },
    }))
  }

  return (
    <section className="notebook-settings-section" aria-label="Visual theme settings">
      <div className="notebook-settings-grid">
        <label>
          Active theme
          <select value={state.theme} onChange={(event) => updateTheme(event.target.value as AppTheme)}>
            {(['dark', 'light', 'dawn', ...CUSTOM_THEME_IDS] as AppTheme[]).map((themeId) => (
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
          <input
            type="range"
            min={0.75}
            max={1.6}
            step={0.05}
            value={state.ui.noteFontScale}
            onChange={(event) => updateUiScale('noteFontScale', Number(event.target.value))}
          />
        </label>
        <label>
          Toolbar button scale
          <input
            type="range"
            min={0.75}
            max={1.6}
            step={0.05}
            value={state.ui.toolbarButtonScale ?? 1}
            onChange={(event) => updateUiScale('toolbarButtonScale', Number(event.target.value))}
          />
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
      <div className="notebook-palette-editor" aria-label="Custom palette editor">
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
  const loadedStateRef = useRef<LoadedState | null>(null)
  if (!loadedStateRef.current) loadedStateRef.current = loadInitialState()
  const [state, setState] = useState<AppState>(loadedStateRef.current.state)
  const [viewMode, setViewMode] = useState<ViewMode>('main')
  const [query, setQuery] = useState('')
  const [activeAisleId, setActiveAisleId] = useState('')
  const [aisleContextMenu, setAisleContextMenu] = useState<NotebookAisleContextMenuState | null>(null)
  const [aisleEditModalOpen, setAisleEditModalOpen] = useState(false)
  const [frontmatterModal, setFrontmatterModal] = useState<NotebookFrontmatterModalState | null>(null)
  const [tableOfContentsPanels, setTableOfContentsPanels] = useState<TableOfContentsPanelsState | null>(null)
  const revisionRef = useRef(loadedStateRef.current.revision)
  const stateRef = useRef(state)
  const saveTimerRef = useRef<number | null>(null)
  const hasMountedRef = useRef(false)
  const aisleScrollRef = useRef<HTMLDivElement | null>(null)
  const workspaceRootRef = useRef<HTMLElement | null>(null)
  const editorRef = useRef<Editor | null>(null)
  const sidebarResizeRef = useRef<{
    pointerId: number
    startClientX: number
    startWidth: number
  } | null>(null)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  const toolbarState = useEditorToolbarState({
    viewMode,
    isMacPlatform: /Mac|iPhone|iPad|iPod/i.test(navigator.platform),
    editorRef,
    stateRef,
  })

  const activeModel = useMemo(() => getActiveNoteModel(state), [state])
  const collapsedFolderIds = useMemo(() => new Set(state.ui.collapsedFolderIds), [state.ui.collapsedFolderIds])
  const filteredNotes = useMemo(
    () => filterNoteSearchEntries(listSearchableNoteLocations(state), query, 40),
    [query, state],
  )
  const activeAisleIdsSignature = activeModel?.resolved.aisles.map((aisle) => aisle.id).join('|') ?? ''
  const renderedActiveAisleId = useMemo(() => {
    if (!activeModel) return ''
    if (activeModel.resolved.aisles.some((aisle) => aisle.id === activeAisleId)) return activeAisleId
    return activeModel.resolved.aisles[0]?.id ?? ''
  }, [activeAisleId, activeModel])
  const activeAisle = useMemo(
    () => activeModel?.resolved.aisles.find((aisle) => aisle.id === renderedActiveAisleId) ?? null,
    [activeModel, renderedActiveAisleId],
  )
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
        ...getCustomThemeVariables(state),
        '--note-font-scale': String(state.ui.noteFontScale),
        '--toolbar-button-scale': String(state.ui.toolbarButtonScale ?? 1),
      }) as CSSProperties,
    [state],
  )
  const toolbarLayout = useMemo(
    () => resolveToolbarLayout(state.ui.toolbarLayouts, DEFAULT_TOOLBAR_LAYOUT_ID),
    [state.ui.toolbarLayouts],
  )
  const activeAisleWidthLocationKey = activeModel ? buildNoteLocationKey({ noteId: activeModel.noteId }) : ''
  const activeAisleWidths = activeAisleWidthLocationKey ? state.ui.aisleWidths?.[activeAisleWidthLocationKey] ?? {} : {}
  const canDecoupleActiveAisle = Boolean(
    activeAisle && !activeModel?.linked && (aisleBodyReferenceCounts.get(activeAisle.aisleBodyId) ?? 0) > 1,
  )

  const flushSave = useCallback((nextState: AppState) => {
    const serializedState = JSON.stringify(nextState)
    revisionRef.current = saveSerializedState(serializedState, revisionRef.current)
  }, [])

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      return undefined
    }
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null
      flushSave(state)
    }, SAVE_DELAY_MS)
    return undefined
  }, [flushSave, state])

  useEffect(() => {
    const flushOnUnload = () => flushSave(state)
    window.addEventListener('beforeunload', flushOnUnload)
    return () => window.removeEventListener('beforeunload', flushOnUnload)
  }, [flushSave, state])

  useEffect(() => {
    if (!activeModel) return
    if (!activeModel.resolved.aisles.some((aisle) => aisle.id === activeAisleId)) {
      setActiveAisleId(activeModel.resolved.aisles[0]?.id ?? '')
    }
  }, [activeAisleId, activeAisleIdsSignature, activeModel])

  const mutateState = useCallback((updater: (previous: AppState) => AppState) => {
    setState((previous) => updater(previous))
  }, [])

  const commitAisleMarkdown = useCallback(
    (aisleBodyId: string, markdown: string) => {
      mutateState((previous) => syncNoteAisleBodyMarkdownInState(previous, aisleBodyId, markdown))
    },
    [mutateState],
  )

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
  })

  const tableControlsController = useTableControls({
    visible: viewMode === 'main' && !aisleEditModalOpen,
    editorRef,
    editorEventRootRef: workspaceRootRef,
    commitActiveEditorMarkdownNow: notebookEditors.commitActiveEditorMarkdownNow,
    syncToolbarFormatState: toolbarState.syncToolbarFormatState,
  })

  const createNote = useCallback(() => {
    mutateState((previous) => createNotebookNoteInState(previous, 'Untitled').state)
    setViewMode('main')
  }, [mutateState])

  const createFolder = useCallback(() => {
    mutateState((previous) => createNotebookFolderInState(previous, 'Untitled folder').state)
  }, [mutateState])

  const importNotebook = useCallback(() => {
    if (!window.electronAPI?.openNotebookImportSource) {
      window.alert('Notebook import is only available in the desktop app.')
      return
    }
    void window.electronAPI.openNotebookImportSource().then((result) => {
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
      if (result.kind === 'markdown-folder') {
        setState(buildStateFromMarkdownFolder(result.files))
        setViewMode('main')
        return
      }
      window.alert('Selected file is not a schema 2 notebook or Markdown folder.')
    })
  }, [])

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

  const deleteItem = useCallback(
    (itemId: string) => {
      mutateState((previous) => deleteNotebookItemInState(previous, itemId))
    },
    [mutateState],
  )

  const restoreDeletedItem = useCallback(
    (deletedItemId: string) => {
      mutateState((previous) => restoreDeletedNotebookItemInState(previous, deletedItemId))
      setViewMode('main')
    },
    [mutateState],
  )

  const permanentlyDeleteDeletedItem = useCallback(
    (deletedItemId: string) => {
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
      mutateState((previous) => ({
        ...previous,
        notebook: {
          ...previous.notebook,
          activeNoteId: noteId,
        },
      }))
      setViewMode('main')
    },
    [mutateState],
  )

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
    (side: 'left' | 'right' | 'end', nearAisleId?: string) => {
      if (!activeModel) return
      mutateState((previous) => {
        const notePath = findNotebookNote(previous.notebook.items, activeModel.noteId)
        const body = notePath ? previous.noteBodies.find((candidate) => candidate.id === notePath.note.noteBodyId) : null
        if (!body) return previous
        const idGenerator = createReservedIdAllocator(collectNotebookIds(previous))
        const { aisle, body: aisleBody } = createNewAisleBody(idGenerator)
        const activeIndex = body.aisles.findIndex((candidate) => candidate.id === nearAisleId)
        const insertIndex =
          side === 'end'
            ? body.aisles.length
            : side === 'left'
              ? Math.max(0, activeIndex)
              : Math.max(0, activeIndex + 1)
        window.setTimeout(() => setActiveAisleId(aisle.id), 0)
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
    },
    [activeModel, mutateState],
  )

  const deleteAisle = useCallback(
    (aisleId: string) => {
      if (!activeModel || activeModel.noteBody.aisles.length <= 1) return
      mutateState((previous) => {
        const body = previous.noteBodies.find((candidate) => candidate.id === activeModel.noteBody.id)
        const aisle = body?.aisles.find((candidate) => candidate.id === aisleId)
        if (!body || !aisle || body.aisles.length <= 1) return previous
        const noteBodies = previous.noteBodies.map((candidate) =>
          candidate.id === body.id
            ? {
                ...candidate,
                updatedAt: new Date().toISOString(),
                aisles: candidate.aisles.filter((item) => item.id !== aisleId),
              }
            : candidate,
        )
        const stillReferenced = noteBodies.some((candidate) =>
          candidate.aisles.some((item) => item.aisleBodyId === aisle.aisleBodyId),
        )
        window.setTimeout(() => {
          const nextAisle = body.aisles.find((candidate) => candidate.id !== aisleId)
          setActiveAisleId(nextAisle?.id ?? '')
        }, 0)
        return {
          ...previous,
          noteBodies,
          noteAisleBodies: stillReferenced
            ? previous.noteAisleBodies
            : (previous.noteAisleBodies ?? []).filter((bodyEntry) => bodyEntry.id !== aisle.aisleBodyId),
        }
      })
    },
    [activeModel, mutateState],
  )

  const createSyncedCopy = useCallback(() => {
    if (!activeModel) return
    mutateState((previous) => {
      const parentFolderId = getContainingFolderId(previous.notebook.items, activeModel.noteId)
      const idGenerator = createReservedIdAllocator(collectNotebookIds(previous))
      const noteId = idGenerator()
      const note = {
        type: 'note' as const,
        id: noteId,
        title: `${activeModel.title} copy`,
        noteBodyId: activeModel.noteBody.id,
      }
      return {
        ...previous,
        notebook: {
          ...insertNotebookItem(previous.notebook, note, parentFolderId),
          activeNoteId: noteId,
        },
      }
    })
    setViewMode('main')
  }, [activeModel, mutateState])

  const decoupleActiveNote = useCallback(() => {
    if (!activeModel || !activeModel.linked) return
    mutateState((previous) => decoupleNotebookNoteBodyInState(previous, activeModel.noteId))
  }, [activeModel, mutateState])

  const decoupleAisle = useCallback(
    (aisleId: string) => {
      if (!activeModel) return
      mutateState((previous) => decoupleNotebookAisleBodyInState(previous, activeModel.noteId, aisleId))
    },
    [activeModel, mutateState],
  )

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

  const openFrontmatterModalForAisle = useCallback(
    (aisleId = renderedActiveAisleId) => {
      if (!activeModel || !aisleId) return
      const aisle = activeModel.resolved.aisles.find((candidate) => candidate.id === aisleId)
      if (!aisle) return
      const body = getAisleBodyById(state, aisle.aisleBodyId)
      setFrontmatterModal({
        aisleId,
        aisleBodyId: aisle.aisleBodyId,
        initialYaml: body?.frontmatterRaw ?? stringifyFrontmatterYaml(body?.frontmatter ?? null),
      })
    },
    [activeModel, renderedActiveAisleId, state],
  )

  const saveFrontmatter = useCallback(
    (yaml: string) => {
      if (!frontmatterModal) return 'Frontmatter editor is not open.'
      const parsed = parseFrontmatterYaml(yaml)
      if (!parsed.ok) return parsed.message
      mutateState((previous) =>
        updateAisleBodyFrontmatterInState(previous, frontmatterModal.aisleBodyId, parsed.data, yaml),
      )
      setFrontmatterModal(null)
      return null
    },
    [frontmatterModal, mutateState],
  )

  const openTableOfContents = useCallback(() => {
    if (!activeModel) return
    const panels = buildTableOfContentsPanels(
      activeModel.noteBody.id,
      activeModel.resolved.aisles,
      notebookEditors.getHeadingOutlineForAisle,
      {
        scope: state.ui.tableOfContentsScope ?? 'all-aisles',
        focusedAisleId: renderedActiveAisleId,
      },
    )
    if (!panels) {
      window.alert(TABLE_OF_CONTENTS_EMPTY_MESSAGE)
      return
    }
    setTableOfContentsPanels(panels)
  }, [activeModel, notebookEditors, renderedActiveAisleId, state.ui.tableOfContentsScope])

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

  const openTableOfContentsLink = useCallback((_aisleId: string, link: { href?: string }) => {
    if (link.href) window.open(link.href, '_blank', 'noopener,noreferrer')
  }, [])

  const tableControlsOverlay = (
    <TableControlsOverlay
      visible={viewMode === 'main' && !aisleEditModalOpen}
      tableControls={tableControlsController.tableControls}
      onAddRow={() => tableControlsController.runTableControlOperation('add-row', state.ui.tableAddTargetMode)}
      onRemoveRow={() => tableControlsController.runTableControlOperation('remove-row', state.ui.tableDeleteTargetMode)}
      onAddColumn={() => tableControlsController.runTableControlOperation('add-column', state.ui.tableAddTargetMode)}
      onRemoveColumn={() => tableControlsController.runTableControlOperation('remove-column', state.ui.tableDeleteTargetMode)}
    />
  )

  const openCopyMenu = useCallback(() => {
    setAisleContextMenu(null)
    toolbarState.setHeadingMenuOpen(false)
    toolbarState.setCopyMenuOpen((open) => !open)
    toolbarState.refreshToolbarPopoverPosition('copy')
  }, [toolbarState])

  const openHeadingMenu = useCallback(() => {
    setAisleContextMenu(null)
    toolbarState.setCopyMenuOpen(false)
    toolbarState.setHeadingMenuOpen((open) => !open)
    toolbarState.refreshToolbarPopoverPosition('heading')
  }, [toolbarState])

  const openAisleContextMenuAt = useCallback((aisleId: string, x: number, y: number) => {
    setActiveAisleId(aisleId)
    toolbarState.closeToolbarPopovers()
    setAisleContextMenu({ aisleId, x, y })
  }, [toolbarState])

  const openAisleActionMenu = useCallback(
    (aisleId: string) => {
      const pane = Array.from(workspaceRootRef.current?.querySelectorAll<HTMLElement>('.note-aisle-pane') ?? [])
        .find((candidate) => candidate.dataset.aisleId === aisleId)
      const rect = pane?.getBoundingClientRect()
      openAisleContextMenuAt(aisleId, rect ? Math.max(8, rect.right - 168) : 24, rect ? rect.top + 42 : 80)
    },
    [openAisleContextMenuAt],
  )

  const openAisleContextMenuFromPointer = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      const target = event.target instanceof Element ? event.target : null
      if (!target || target.closest('.note-shared-toolbar') || target.closest('.tab-context-menu')) return
      const pane = target.closest<HTMLElement>('.note-aisle-pane')
      const aisleId = pane?.dataset.aisleId
      if (!aisleId) return
      event.preventDefault()
      openAisleContextMenuAt(aisleId, event.clientX, event.clientY)
    },
    [openAisleContextMenuAt],
  )

  useEffect(() => {
    const closeFloatingUi = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null
      if (
        target?.closest('.tab-context-menu') ||
        target?.closest('.note-toolbar-copy-popover') ||
        target?.closest('.note-toolbar-heading-popover') ||
        target?.closest('.note-shared-toolbar')
      ) {
        return
      }
      setAisleContextMenu(null)
      toolbarState.closeToolbarPopovers()
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setAisleContextMenu(null)
      toolbarState.closeToolbarPopovers()
    }
    document.addEventListener('pointerdown', closeFloatingUi)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeFloatingUi)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [toolbarState])

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
      onOpenFindReplace={() => undefined}
      onToggleHeading={openHeadingMenu}
      onCommand={notebookEditors.runCommand}
      onHistory={(direction) => notebookEditors.runCommand(direction)}
      onInsertImage={notebookEditors.insertImageFile}
      onInsertWebLink={notebookEditors.insertPromptedLink}
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
        createSyncedCopy()
        toolbarState.setCopyMenuOpen(false)
      }}
      onOpenDeduplicateModal={() => {
        if (activeModel.linked) decoupleActiveNote()
        else if (renderedActiveAisleId) decoupleAisle(renderedActiveAisleId)
        toolbarState.setCopyMenuOpen(false)
      }}
    />
  ) : null

  return (
    <div
      className={`app-shell notebook-shell ${getThemeClassName(state.theme)}`}
      data-theme={state.theme}
      style={rootStyle}
    >
      <aside
        className={`notebook-sidebar ${state.ui.sidebarCollapsed ? 'is-collapsed' : ''}`}
        style={{ width: state.ui.sidebarCollapsed ? 48 : state.ui.sidebarWidth }}
      >
        <div className="notebook-sidebar-header">
          <button
            className="notebook-icon-button"
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
            title="Toggle sidebar"
          >
            =
          </button>
          {!state.ui.sidebarCollapsed ? <h1>Notebook</h1> : null}
        </div>
        {!state.ui.sidebarCollapsed ? (
          <>
            <div className="notebook-sidebar-actions">
              <button type="button" onClick={createNote}>New note</button>
              <button type="button" onClick={createFolder}>New folder</button>
              <button type="button" onClick={importNotebook}>Import</button>
              <button type="button" onClick={exportNotebook}>Export</button>
            </div>
            <input
              className="notebook-search-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search notes"
            />
            <nav className="notebook-utility-nav">
              <button type="button" className={viewMode === 'main' ? 'is-active' : ''} onClick={() => setViewMode('main')}>
                Notes
              </button>
              <button type="button" className={viewMode === 'trash' ? 'is-active' : ''} onClick={() => setViewMode('trash')}>
                Trash
              </button>
              <button type="button" className={viewMode === 'messages' ? 'is-active' : ''} onClick={() => setViewMode('messages')}>
                Messages
              </button>
              <button type="button" className={viewMode === 'settings' ? 'is-active' : ''} onClick={() => setViewMode('settings')}>
                Settings
              </button>
            </nav>
            <div className="notebook-tree" role="tree">
              {query
                ? filteredNotes.map((entry) => (
                    <button
                      key={buildNoteLocationKey(entry)}
                      className={`notebook-search-result ${entry.noteId === state.notebook.activeNoteId ? 'is-active' : ''}`}
                      type="button"
                      onClick={() => setActiveNote(entry.noteId)}
                    >
                      <span>{entry.noteName}</span>
                      {entry.folderPath ? <small>{entry.folderPath}</small> : null}
                    </button>
                  ))
                : state.notebook.items.map((item) => (
                    <TreeItemRow
                      key={item.id}
                      item={item}
                      depth={0}
                      activeNoteId={state.notebook.activeNoteId}
                      collapsedFolderIds={collapsedFolderIds}
                      query={query}
                      onSelectNote={setActiveNote}
                      onToggleFolder={toggleFolder}
                      onRename={renameItem}
                      onDelete={deleteItem}
                    />
                  ))}
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
      </aside>
      <main className="notebook-main">
        {viewMode === 'main' ? (
          activeModel ? (
            <section
              className="notebook-editor-surface"
              aria-label={activeModel.title}
              onContextMenu={openAisleContextMenuFromPointer}
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
                imageToolsOverlay={null}
                tableControlsOverlay={tableControlsOverlay}
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
                onActivateAisle={(editorKey) => {
                  setActiveAisleId(getAisleIdFromAisleEditorKey(editorKey))
                  notebookEditors.activateAisleEditor(editorKey)
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
                onSelectTableOfContentsLink={() => undefined}
                onOpenTableOfContentsLink={openTableOfContentsLink}
                onOpenAisleFrontmatter={openFrontmatterModalForAisle}
                onOpenAisleLink={openAisleActionMenu}
                regularNoteAisleControls={{
                  showAddButtons: state.ui.showRegularNoteAisleAddButtons ?? true,
                  showDeleteButton: (state.ui.showRegularNoteAisleDeleteButton ?? true) && activeModel.resolved.aisles.length > 1,
                  onAddAisleLeft: () => addAisle('left', renderedActiveAisleId),
                  onAddAisleRight: () => addAisle('right', renderedActiveAisleId),
                  onDeleteActiveAisle: () => deleteAisle(renderedActiveAisleId),
                }}
                aisleWidths={activeAisleWidths}
                onRegisterAislePaneRoot={notebookEditors.registerAislePaneRoot}
                onRegisterAisleEditorRoot={notebookEditors.registerAisleEditorRoot}
              />
              <NotebookAisleContextMenu
                menu={aisleContextMenu}
                canDecoupleNote={activeModel.linked}
                canDecoupleAisle={canDecoupleActiveAisle}
                onClose={() => setAisleContextMenu(null)}
                onDecoupleNote={decoupleActiveNote}
                onDecoupleAisle={() => decoupleAisle(aisleContextMenu?.aisleId ?? renderedActiveAisleId)}
              />
            </section>
          ) : (
            <section className="notebook-empty-state">
              <h2>No notes</h2>
              <button type="button" onClick={createNote}>Create note</button>
            </section>
          )
        ) : null}
        {viewMode === 'trash' ? (
          <section className="notebook-panel">
            <header>
              <h2>Trash</h2>
            </header>
            {state.notebook.deletedItems.length === 0 ? <p>No deleted items.</p> : null}
            {state.notebook.deletedItems.map((entry) => (
              <div className="notebook-trash-row" key={entry.id}>
                <span>{entry.item.title}</span>
                <button type="button" onClick={() => restoreDeletedItem(entry.id)}>Restore</button>
                <button type="button" onClick={() => permanentlyDeleteDeletedItem(entry.id)}>Delete</button>
              </div>
            ))}
          </section>
        ) : null}
        {viewMode === 'messages' ? (
          <section className="notebook-panel">
            <header>
              <h2>Messages</h2>
            </header>
            {(state.messages ?? []).length === 0 ? <p>No messages.</p> : null}
            {(state.messages ?? []).map((message) => (
              <article className="notebook-message" key={message.id}>
                <h3>{message.title}</h3>
                <p>{message.body}</p>
              </article>
            ))}
          </section>
        ) : null}
        {viewMode === 'settings' ? (
          <section className="notebook-panel notebook-settings-panel">
            <header>
              <h2>Settings</h2>
            </header>
            <NotebookThemeSettings state={state} onMutateState={mutateState} />
            <section className="notebook-settings-section" aria-label="Notebook settings">
              <div className="notebook-settings-grid">
                <label>
                  Trash auto-remove days
                  <input
                    type="number"
                    min={1}
                    max={3650}
                    value={state.notebook.settings.autoRemoveDeletedDays}
                    onChange={(event) =>
                      mutateState((previous) => ({
                        ...previous,
                        notebook: {
                          ...previous.notebook,
                          settings: {
                            ...previous.notebook.settings,
                            autoRemoveDeletedDays: Number(event.target.value),
                          },
                        },
                      }))
                    }
                  />
                </label>
              </div>
            </section>
          </section>
        ) : null}
      </main>
      <NotebookFrontmatterModal
        modal={frontmatterModal}
        onCancel={() => setFrontmatterModal(null)}
        onSave={saveFrontmatter}
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
