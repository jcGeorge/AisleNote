import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./NotebookApp.tsx', import.meta.url), 'utf8')
const appCss = readFileSync(new URL('../App.css', import.meta.url), 'utf8')

describe('NotebookApp editable asset tools', () => {
  it('closes editable asset tool overlays only when the active note changes', () => {
    expect(source).toContain("const previousAssetToolsNoteLocationKeyRef = useRef('')")
    expect(source).toMatch(
      /useEffect\(\(\) => {\s*if \(previousAssetToolsNoteLocationKeyRef\.current === activeNoteLocationKey\) return\s*previousAssetToolsNoteLocationKeyRef\.current = activeNoteLocationKey\s*imageToolsController\.close\(\)\s*mediaToolsController\.close\(\)\s*}, \[activeNoteLocationKey, imageToolsController, mediaToolsController\]\)/,
    )
  })
})

describe('NotebookApp frontmatter modal routing', () => {
  it('blocks structured frontmatter editing when stored YAML is invalid', () => {
    expect(source).toContain("body?.frontmatterStatus === 'invalid'")
    expect(source).toContain('Frontmatter YAML is invalid. Fix the markdown block before using the structured frontmatter editor.')
  })

  it('includes fixed list controls for template settings and note rows', () => {
    expect(source).toContain('aria-label="frontmatter fixed list values"')
    expect(source).toContain('aria-label="frontmatter fixed list default values"')
    expect(source).toContain('frontmatter-fixed-list-choice')
    expect(source).not.toContain('<option value="">no options</option>')
  })
})

describe('NotebookApp sidebar search wiring', () => {
  it('routes metadata filter actions into the sidebar search panel', () => {
    expect(source).toContain('SidebarSearchPanel')
    expect(source).toContain('const [sidebarSearchMode, setSidebarSearchMode] = useState(false)')
    expect(source).toContain('const sidebarSearchVisible = sidebarSearchMode || sidebarSearchActive')
    expect(source).toContain('className={`notebook-icon-button notebook-sidebar-search-mode-toggle ${')
    expect(source).toContain('aria-label="Search notes"')
    expect(source).toContain('const toggleSidebarSearchModeFromButton = useCallback')
    expect(source).toContain('if (sidebarSearchVisible) {')
    expect(source).toContain('onClick={toggleSidebarSearchModeFromButton}')
    expect(source.match(/closeSidebarSearchMode\(\)/g)?.length).toBeGreaterThanOrEqual(3)
    expect(source).toContain('onCloseMode={closeSidebarSearchMode}')
    expect(source).toContain("activateSidebarSearchKey('synced', key)")
    expect(source).toContain("activateSidebarSearchKey('tags', key)")
    expect(source).toContain("activateSidebarSearchKey('frontmatter', getFrontmatterTemplateFilterKey(templateId))")
    expect(source).toContain('onOpenTagFilter={filterTag}')
    expect(source).toContain('onFilterTemplate={filterFrontmatterTemplateFromModal}')
    expect(source).not.toContain('notebook-sidebar-search-toggle')
    expect(source).not.toContain('frontmatterTemplateFilterAisleIds={frontmatterTemplateFilterAisleIds}')
    expect(source).not.toContain('onFilterAisleFrontmatterTemplate={filterAisleFrontmatterTemplate}')
  })
})

describe('NotebookApp sidebar resize handle', () => {
  it('uses an explicit capsule handle with double-click reset', () => {
    expect(source).toContain('const resetSidebarWidth = useCallback')
    expect(source).toContain('sidebarWidth: clampSidebarWidth(DEFAULT_UI_SETTINGS.sidebarWidth)')
    expect(source).toContain('className="notebook-sidebar-resize-handle"')
    expect(source).toContain('data-app-tooltip="Drag to resize. Double click to reset."')
    expect(source).toContain('onDoubleClick={resetSidebarWidth}')
    expect(source).toContain('className="notebook-sidebar-resize-capsule"')
    expect(appCss).toContain('--resize-handle-width: calc(1.4rem + 2px);')
    expect(appCss).toContain('--resize-handle-height: calc(4.4rem + 4px);')
    expect(appCss).toContain('--resize-handle-capsule-width: calc(0.34rem + 2px);')
    expect(appCss).toContain('--resize-handle-capsule-height: calc(3rem + 4px);')
    expect(appCss).toContain('--sidebar-resize-handle-top: calc(var(--notebook-topbar-height) + (100% - var(--notebook-topbar-height)) * 0.7);')
    expect(appCss).toContain('.notebook-sidebar {\n  flex: 0 0 auto;\n  position: relative;\n  z-index: 40;')
    expect(appCss).toContain('.notebook-sidebar-resize-handle {\n  position: absolute;\n  z-index: 6;\n  top: var(--sidebar-resize-handle-top);')
    expect(appCss).toContain('border: 1px solid var(--note-aisle-resize-border);')
    expect(appCss).toContain('background: var(--note-aisle-resize-bg);')
    expect(appCss).toContain('background: var(--note-aisle-resize-hover-bg);')
    expect(appCss).toContain('outline: 2px solid var(--note-aisle-resize-focus-outline);')
    expect(appCss).toContain('.notebook-sidebar-resize-capsule')
    expect(appCss).not.toContain('.notebook-sidebar-resize-handle::before')
  })
})

describe('NotebookApp zoom HUD', () => {
  it('shows native app zoom changes without using the toast stack', () => {
    expect(source).toContain('const [zoomHudPercent, setZoomHudPercent] = useState<number | null>(null)')
    expect(source).toContain('const zoomHudTimeoutRef = useRef<number | null>(null)')
    expect(source).toContain('window.electronAPI?.onAppZoomChanged?.((payload) => {')
    expect(source).toContain('setZoomHudPercent(Math.round(payload.percent))')
    expect(source).toContain('setZoomHudPercent(null)')
    expect(source).toContain('className="app-zoom-hud"')
    expect(appCss).toContain('.app-zoom-hud')
    expect(appCss).toContain('top: calc(var(--notebook-topbar-height) + 0.65rem);')
    expect(appCss).toContain('@keyframes zoomHudFadeIn')
  })
})

describe('NotebookApp tag autocomplete wiring', () => {
  it('connects editor tag autocomplete to the existing tag index and menu', () => {
    expect(source).toContain("import { TagAutocompleteMenu } from '../components/editor/TagAutocompleteMenu'")
    expect(source).toContain("import { useTagAutocompleteController } from '../tags/useTagAutocompleteController'")
    expect(source).toContain("const TAG_AUTOCOMPLETE_RECENT_STORAGE_KEY = 'aislenote:tag-autocomplete-recent:v1'")
    expect(source).toContain('const [tagAutocompleteRecentKeys, setTagAutocompleteRecentKeys] = useState(loadTagAutocompleteRecentKeys)')
    expect(source).toContain('const tagAutocompleteRefreshRef = useRef<(() => void) | null>(null)')
    expect(source).toContain('onTagAutocompleteQueryChange: refreshTagAutocompleteFromEditor')
    expect(source).toContain('const tagAutocompleteController = useTagAutocompleteController({')
    expect(source).toContain('getAvailableTags: () => sidebarSearchIndexes.tags.availableOptions')
    expect(source).toContain('commitActiveEditorMarkdownNow: notebookEditors.commitActiveEditorMarkdownNow')
    expect(source).toContain('tagAutocompleteRefreshRef.current = tagAutocompleteController.refreshQuery')
    expect(source).toContain('<TagAutocompleteMenu')
    expect(source).toContain('onChoose={tagAutocompleteController.acceptSuggestion}')
  })
})

describe('NotebookApp find replace wiring', () => {
  it('keeps keyboard find available while the toolbar magnifier opens notes search', () => {
    expect(source).toContain("import { FindReplacePanel } from '../components/editor/FindReplacePanel'")
    expect(source).toContain("import { getFindReplaceShortcutMode } from '../components/editor/find-replace-shortcuts'")
    expect(source).toContain('const [findReplaceOpen, setFindReplaceOpen] = useState(false)')
    expect(source).toContain("findReplaceScope: 'note'")
    expect(source).toContain('const findReplaceMatches = useMemo')
    expect(source).toContain('findVisibleMatches(')
    expect(source).toContain('if (editor) notebookEditors.commitActiveEditorMarkdownNow(editor)')
    expect(source).toContain('const openFindReplace = useCallback')
    expect(source).toContain("if (mode !== 'find') return")
    expect(source).toContain('onOpenFindReplace={focusNotesFilterFromShortcut}')
    expect(source).toContain('setFindReplaceOpen(false)')
    expect(source).toContain('<FindReplacePanel')
    expect(source).not.toContain('notebook-sidebar-search-toggle')
    expect(source).not.toContain('onOpenFindReplace={() => undefined}')
  })
})

describe('NotebookApp notebook manager wiring', () => {
  it('renames the Data storage tab to Notebooks while keeping the storage section id', () => {
    expect(source).toContain("{ id: 'storage', label: 'Notebooks' }")
    expect(source).toContain("setDataSettingsSection('storage')")
    expect(source).not.toContain("{ id: 'storage', label: 'Storage' }")
  })

  it('renders the inline notebook manager instead of the old storage summary card', () => {
    expect(source).toContain('const renderNotebookManager = () => {')
    expect(source).toContain('useStorageProfileController({')
    expect(source).toContain('beforeStorageAction: commitNotebookBeforeStorageAction')
    expect(source).toContain('commitAppStateNow(latest.state, {')
    expect(source).toContain('New Notebook')
    expect(source).toContain('Open Notebook Folder')
    expect(source).toContain('Remembered notebooks')
    expect(source).toContain('iconId="ellipsisVertical"')
    expect(source).toContain('Remove from List')
    expect(source).toContain('Delete Notebook')
    expect(source).toContain('desktop only')
    expect(source).toContain('desktopNotebookSetupRequired')
    expect(source).toContain('const renderNotebookSetupScreen = () => (')
    expect(source).toContain("const NOTEBOOK_SETUP_APP_NAME = 'AisleNote'")
    expect(source).toContain("const NOTEBOOK_SETUP_LOGO_SRC = './favicon.svg'")
    expect(source).toContain('runtimeVersionLabel')
    expect(source).toContain('Create new notebook')
    expect(source).toContain('Create a new notebook under a folder.')
    expect(source).toContain('Open notebook folder')
    expect(source).toContain('Choose an existing AisleNote notebook folder.')
    expect(source).not.toContain('Create or open a notebook')
    expect(source).not.toContain('Put that folder in iCloud, Dropbox, OneDrive')
    expect(source).not.toContain('listSearchableNoteLocations(state).length.toLocaleString()')
    expect(source).not.toContain('serializedState: getSerializedStateForStorageAction')
  })

  it('uses setup-specific theme-aware startup styling', () => {
    expect(appCss).toContain('.notebook-setup-brand')
    expect(appCss).toContain('.notebook-setup-action-row')
    expect(appCss).toContain('.notebook-setup-action-button.is-primary')
    expect(appCss).toContain('background: var(--app-page-bg)')
    expect(appCss).toContain('background: var(--app-surface-raised)')
    expect(appCss).toContain('border: 1px solid var(--app-border-muted)')
  })

  it('subscribes to the Electron Open Notebook menu navigation event', () => {
    expect(source).toContain('onOpenNotebookManager?.(openNotebookManagerSettings)')
    expect(source).toContain("openUtilityView('settings')")
    expect(source).toContain("setSettingsSection('data')")
    expect(source).toContain("setDataSettingsSection('storage')")
  })
})

describe('NotebookApp aisle insertion focus', () => {
  it('routes shortcut and context-menu aisle creation through pending editor focus', () => {
    expect(source).toContain('addAisleFromNewlineRef.current = addAisle')
    expect(source).toContain('const insertEditorContextAisle = useCallback(')
    expect(source).toContain('addAisle(side, aisleId)')
    expect(source).toContain('pendingFocusToAisleIdRef.current = createdAisleId')
    expect(source).toContain('pendingScrollToAisleIdRef.current = createdAisleId')
    expect(source).toContain('pendingCursorRestoreRef.current = {')
    expect(source).toContain('aisleId: createdAisleId')
    expect(source).toContain("focusIntent: 'aisle-activation'")
    expect(source).toContain('setActiveAisleId(createdAisleId)')
    expect(source).not.toContain('window.setTimeout(() => setActiveAisleId(aisle.id), 0)')
  })
})
