import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEFAULT_FRONTMATTER_SETTINGS } from '../../frontmatter/frontmatter'
import {
  DEFAULT_CUSTOM_THEME_PALETTE,
  DEFAULT_DATA_SETTINGS_SECTION,
  DEFAULT_VISUALS_SETTINGS_SECTION,
  getThemePaletteForTheme,
} from '../../settings/defaults'
import {
  MISC_SYNCED_UI_BOOLEAN_SETTINGS,
  getSyncedUiBooleanSettings,
} from '../../settings/synced-ui-settings-registry.js'
import { DEFAULT_TOOLBAR_LAYOUT_ID, getToolbarLayouts } from '../../editor/toolbar-layouts'
import type {
  AppState,
  DataSettingsSection,
  FrontmatterSettings,
  SettingsSection,
  Space,
  StorageProfileStatus,
  UserSettingsLocationStatus,
  VisualsSettingsSection,
} from '../../types/app'
import {
  DESKTOP_DATA_CAPABILITIES,
  MOBILE_DATA_CAPABILITIES,
  type DataPlatformCapabilities,
} from '../../platform/data-platform'
import { SettingsPage } from './SettingsPage'
import {
  DEFAULT_THEME_PREVIEW_RAIL_SELECTION,
  selectThemePreviewRailSample,
  toggleThemePreviewTaskState,
} from './theme-preview-state'

const space: Space = {
  id: 'space-1',
  name: 'Space',
  settings: { autoRemoveDeletedDays: 30 },
  data: {
    activeTabId: 'tab-1',
    tabs: [{ id: 'tab-1', title: 'Tab', noteBodyId: 'body-1', activeSubTabId: null, subTabs: [] }],
    deletedTabs: [],
    deletedSubTabs: [],
  },
}

function createState(): AppState {
  return {
    theme: 'dawn',
    activeDomainId: 'domain-1',
    activeSpaceId: space.id,
    domains: [{ id: 'domain-1', name: 'Domain', activeSpaceId: space.id, spaces: [space] }],
    spaces: [space],
    noteBodies: [{ id: 'body-1', aisles: [{ id: 'aisle-1', aisleBodyId: 'aisle-body-1' }] }],
    noteAisleBodies: [{ id: 'aisle-body-1', markdown: '' }],
    hotkeys: {
      shortcuts: {
        toggleNotesTrash: '',
        toggleNotesScratchpad: '',
        toggleNotesFilter: '',
        openDomains: '',
        openSpaces: '',
        newTab: '',
        newSubTab: '',
        formatStrikethrough: '',
        cycleParentTabNext: '',
        cycleParentTabPrev: '',
        cycleSubTabNext: '',
        cycleSubTabPrev: '',
        cycleAislePrev: '',
        cycleAisleNext: '',
      },
      newlineShortcuts: {
        shortcuts: {
          controlEnter: 'normalNewLine',
          shiftEnter: 'normalNewLine',
          commandEnter: 'normalNewLine',
        },
        menuOperations: [],
      },
    },
    frontmatter: DEFAULT_FRONTMATTER_SETTINGS,
    ui: {
      tableAddTargetMode: 'bottom-right',
      tableDeleteTargetMode: 'bottom-right',
      tabButtonScale: 1,
      noteFontScale: 1,
      settingsSection: 'hotkeys',
      dataSettingsSection: 'transfer',
      visualsSettingsSection: 'theming',
      selectedCustomTheme: 'custom1',
      themePalettes: {},
      noteCursorLocations: {},
      headingCollapseState: {},
      seenTipIds: [],
      disabledTipIds: [],
    },
  }
}

function renderSettingsPage(
  frontmatterDraft: FrontmatterSettings,
  frontmatterDraftDirty: boolean,
  options: {
    section?: SettingsSection
    dataSection?: DataSettingsSection
    visualsSection?: VisualsSettingsSection
    state?: AppState
    storageProfileStatus?: StorageProfileStatus | null
    userSettingsLocationStatus?: UserSettingsLocationStatus | null
    dataCapabilities?: DataPlatformCapabilities
    toolbarEditorLayoutId?: string
    toolbarEditorShowNames?: boolean
    isMacPlatform?: boolean
    importStatus?: string
  } = {},
) {
  const state = options.state ?? createState()
  return renderToStaticMarkup(
    <SettingsPage
      state={state}
      section={options.section ?? 'frontmatter'}
      dataSection={options.dataSection ?? state.ui.dataSettingsSection ?? DEFAULT_DATA_SETTINGS_SECTION}
      visualsSection={options.visualsSection ?? state.ui.visualsSettingsSection ?? DEFAULT_VISUALS_SETTINGS_SECTION}
      isMacPlatform={options.isMacPlatform ?? false}
      shortcutDrafts={{
        toggleNotesTrash: '',
        toggleNotesScratchpad: '',
        toggleNotesFilter: '',
        openDomains: '',
        openSpaces: '',
        newTab: '',
        newSubTab: '',
        formatStrikethrough: '',
        cycleParentTabNext: '',
        cycleParentTabPrev: '',
        cycleSubTabNext: '',
        cycleSubTabPrev: '',
        cycleAislePrev: '',
        cycleAisleNext: '',
      }}
      newlineShortcutDrafts={{
        controlEnter: 'normalNewLine',
        shiftEnter: 'normalNewLine',
        commandEnter: 'normalNewLine',
      }}
      editingShortcut={null}
      settingsDaysDraft="30"
      exportStatus=""
      importStatus={options.importStatus ?? ''}
      tabButtonScaleDraft={1}
      noteFontScaleDraft={1}
      toolbarButtonScaleDraft={1}
      selectedCustomTheme={state.ui.selectedCustomTheme ?? 'custom1'}
      customThemePaletteDraft={getThemePaletteForTheme(state.theme, state.ui.themePalettes)}
      alwaysShowSpacesDraft={state.ui.alwaysShowSpaces ?? false}
      alwaysShowDomainsDraft={state.ui.alwaysShowDomains ?? false}
      showRegularNoteAisleAddButtonsDraft={state.ui.showRegularNoteAisleAddButtons ?? false}
      showRegularNoteAisleDeleteButtonDraft={state.ui.showRegularNoteAisleDeleteButton ?? false}
      tableAddTargetModeDraft={state.ui.tableAddTargetMode}
      tableDeleteTargetModeDraft={state.ui.tableDeleteTargetMode}
      tableOfContentsScopeDraft={state.ui.tableOfContentsScope ?? 'all-aisles'}
      scratchpadAisleLimitDraft={String(state.ui.scratchpadAisleLimit ?? 16)}
      scratchpadNewAisleSideDraft={state.ui.scratchpadNewAisleSide ?? 'left'}
      tabRenameEnterBehaviorDraft={state.ui.tabRenameEnterBehavior ?? 'goes-to-note'}
      trashDeleteForRealRequiresConfirmation={state.ui.trashDeleteForRealRequiresConfirmation ?? true}
      miscSyncedUiBooleanSettings={MISC_SYNCED_UI_BOOLEAN_SETTINGS.map((setting) => ({
        ...setting,
        checked: getSyncedUiBooleanSettings(state.ui)[setting.key],
      }))}
      frontmatterDraft={frontmatterDraft}
      frontmatterDraftDirty={frontmatterDraftDirty}
      toolbarLayouts={getToolbarLayouts(state.ui.toolbarLayouts)}
      toolbarEditorLayoutId={options.toolbarEditorLayoutId ?? DEFAULT_TOOLBAR_LAYOUT_ID}
      toolbarEditorShowNames={options.toolbarEditorShowNames ?? state.ui.toolbarEditorShowNames ?? false}
      dataCapabilities={options.dataCapabilities ?? DESKTOP_DATA_CAPABILITIES}
      storageProfileStatus={options.storageProfileStatus ?? null}
      userSettingsLocationStatus={options.userSettingsLocationStatus ?? null}
      onDataSectionChange={() => undefined}
      onVisualsSectionChange={() => undefined}
      onToggleShortcutEdit={() => undefined}
      onNewlineShortcutChange={() => undefined}
      onOpenShortcutMenuSettings={() => undefined}
      onAutoRemoveDaysChange={() => undefined}
      onExportUserSettings={() => undefined}
      onImportNotebook={() => undefined}
      onImportUserSettings={() => undefined}
      onImportUserSettingsFromNotebookFolder={() => undefined}
      onRevealUserSettingsFolder={() => undefined}
      onResetUserSettingsFolder={() => undefined}
      onResetUserSettingsToDefaults={() => undefined}
      onThemeChange={() => undefined}
      onSelectedCustomThemeChange={() => undefined}
      onCustomThemePaletteChange={() => undefined}
      onCustomThemePaletteImport={() => undefined}
      onCustomThemePaletteReset={() => undefined}
      onCustomThemePaletteSeedFromCurrentTheme={() => undefined}
      onTabButtonScaleChange={() => undefined}
      onNoteFontScaleChange={() => undefined}
      onToolbarButtonScaleChange={() => undefined}
      onAlwaysShowSpacesChange={() => undefined}
      onAlwaysShowDomainsChange={() => undefined}
      onShowRegularNoteAisleAddButtonsChange={() => undefined}
      onShowRegularNoteAisleDeleteButtonChange={() => undefined}
      onTableAddTargetModeChange={() => undefined}
      onTableDeleteTargetModeChange={() => undefined}
      onTableOfContentsScopeChange={() => undefined}
      onScratchpadAisleLimitChange={() => undefined}
      onScratchpadNewAisleSideChange={() => undefined}
      onTabRenameEnterBehaviorChange={() => undefined}
      onSyncedUiBooleanSettingChange={() => undefined}
      onTipEnabledChange={() => undefined}
      onSelectToolbarLayout={() => undefined}
      onCreateToolbarLayout={() => undefined}
      onDuplicateToolbarLayout={() => undefined}
      onRenameToolbarLayout={() => undefined}
      onDeleteToolbarLayout={() => undefined}
      onAddToolbarTool={() => undefined}
      onAddToolbarSpacer={() => undefined}
      onRemoveToolbarItem={() => undefined}
      onMoveToolbarItem={() => undefined}
      onMoveToolbarItemToIndex={() => undefined}
      onToolbarEditorShowNamesChange={() => undefined}
      onReadOnlyToolbarEditAttempt={() => undefined}
      onSettingsFrontmatterTemplateChange={() => undefined}
      onCreateFrontmatterTemplate={() => undefined}
      onUpdateFrontmatterTemplate={() => undefined}
      onDeleteFrontmatterTemplate={() => undefined}
      onAddFrontmatterTemplateField={() => undefined}
      onUpdateFrontmatterTemplateField={() => undefined}
      onDeleteFrontmatterTemplateField={() => undefined}
      onSaveFrontmatterTemplates={() => undefined}
      onDiscardFrontmatterTemplateChanges={() => undefined}
      onCreateNotebook={() => undefined}
      onRenameNotebook={() => undefined}
      onOpenNotebook={() => undefined}
      onSwitchNotebook={() => undefined}
      onForgetNotebook={() => undefined}
      onDeleteNotebook={() => undefined}
      onAttachNotebookSyncTarget={() => undefined}
      onDetachNotebookSyncTarget={() => undefined}
      onReconnectNotebookSyncTarget={() => undefined}
      onMoveStorageProfile={() => undefined}
      onRevealStorageProfile={() => undefined}
      onRetryStorageProfile={() => undefined}
    />,
  )
}

describe('frontmatter settings page', () => {
  it('does not render the old in-page settings section rail', () => {
    const html = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, { section: 'hotkeys' })

    expect(html).not.toContain('settings-section-tabs')
    expect(html).not.toContain('settings-section-tab')
    expect(html).toContain('hotkeys')
    expect(html).toContain('settings-shortcut-btn')
  })

  it('renders parent-tab cycle hotkey rows as unbound shortcuts', () => {
    const html = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, { section: 'hotkeys' })

    expect(html).toContain('toggle notes / trash')
    expect(html).toContain('toggle notes / scratchpad')
    expect(html).toContain('toggle notes / filter')
    expect(html).toContain('next parent tab')
    expect(html).toContain('previous parent tab')
    expect(html).toContain('next aisle')
    expect(html).toContain('previous aisle')
    expect(html).toContain('strikethrough')
    expect(html).toContain('settings-shortcut-btn')
  })

  it('renders the table of contents scope setting in misc settings', () => {
    const state = createState()
    state.ui.tableOfContentsScope = 'focused-aisle'
    const html = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, { section: 'misc', state })

    expect(html).toContain('table of contents shows for')
    expect(html).toContain('role="radiogroup" aria-labelledby="settings-table-of-contents-shows-for-label"')
    expect(html).toContain('aria-checked="false" class="settings-segmented-option ">all aisles</button>')
    expect(html).toContain('aria-checked="true" class="settings-segmented-option is-selected">focused aisle</button>')
    expect(html.indexOf('table of contents shows for')).toBeLessThan(html.indexOf('add table row or column'))
  })

  it('does not render the removed toggle target dropdown in settings', () => {
    const miscHtml = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, { section: 'misc' })
    const hotkeysHtml = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, { section: 'hotkeys' })

    expect(miscHtml).not.toContain('settings-toggle-tabs-target')
    expect(miscHtml).not.toContain('toggle tabs /')
    expect(hotkeysHtml).not.toContain('settings-toggle-tabs-target')
    expect(hotkeysHtml).toContain('toggle notes / trash')
    expect(miscHtml).not.toContain('settings-show-parent-home-tab')
    expect(miscHtml).not.toContain('show the parent&#x27;s home tab with the other sub-tabs')
  })

  it('renders the tab-name Enter behavior setting in misc settings', () => {
    const state = createState()
    state.ui.tabRenameEnterBehavior = 'creates-another-tab'
    const html = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, { section: 'misc', state })

    expect(html).toContain('pressing enter after typing new tab name')
    expect(html).toContain('role="radiogroup" aria-labelledby="settings-tab-rename-enter-behavior-label"')
    expect(html).toContain('aria-checked="false" class="settings-segmented-option ">goes to note</button>')
    expect(html).toContain('aria-checked="true" class="settings-segmented-option is-selected">creates another tab</button>')
    expect(html.indexOf('pressing enter after typing new tab name')).toBeLessThan(
      html.indexOf('remove all links to a note when it&#x27;s trashed'),
    )
  })

  it('does not render the removed normal-note aisle placement setting in misc settings', () => {
    const state = createState()
    const html = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, { section: 'misc', state })

    expect(html).not.toContain('new aisles are added to')
    expect(html).not.toContain('settings-new-aisle-placement-label')
    expect(html).not.toContain('end of aisles')
    expect(html).not.toContain('left of current')
    expect(html).not.toContain('end of note')
    expect(html).not.toContain('right of focus')
  })

  it('renders the remove-note-references-on-trash setting in misc settings', () => {
    const state = createState()
    state.ui.removeNoteReferencesOnTrash = true
    const html = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, { section: 'misc', state })

    expect(html).toContain("remove all links to a note when it&#x27;s trashed")
    expect(html).toContain('aria-label="remove all links to a note when it&#x27;s trashed"')
    expect(html).toContain('role="switch" aria-label="remove all links to a note when it&#x27;s trashed" checked=""')
    expect(html.indexOf("remove all links to a note when it&#x27;s trashed")).toBeLessThan(
      html.indexOf('add table row or column'),
    )
  })

  it('renders the @ menu copy confirmation setting in misc settings', () => {
    const state = createState()
    state.ui.noteMentionCopyRequiresConfirmation = true
    const html = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, { section: 'misc', state })

    expect(html).toContain('@ menu requires confirmation for replacing aisle with synced or independent copy')
    expect(html).toContain('aria-label="@ menu requires confirmation for replacing aisle with synced or independent copy"')
    expect(html).toContain('role="switch" aria-label="@ menu requires confirmation for replacing aisle with synced or independent copy" checked=""')
    expect(html.indexOf('@ menu requires confirmation for replacing aisle with synced or independent copy')).toBeLessThan(
      html.indexOf('add table row or column'),
    )
  })

  it('renders the active aisle shortcut setting in misc settings after @ confirmation', () => {
    const state = createState()
    state.ui.deleteActiveAisleShortcutEnabled = false
    const windowsHtml = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, { section: 'misc', state })
    const macHtml = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, {
      section: 'misc',
      state,
      isMacPlatform: true,
    })

    expect(windowsHtml).toContain('control+w deletes active aisle')
    expect(windowsHtml).toContain('aria-label="control+w deletes active aisle"')
    expect(windowsHtml).not.toContain('role="switch" aria-label="control+w deletes active aisle" checked=""')
    expect(windowsHtml.indexOf('@ menu requires confirmation for replacing aisle with synced or independent copy')).toBeLessThan(
      windowsHtml.indexOf('control+w deletes active aisle'),
    )
    expect(windowsHtml.indexOf('control+w deletes active aisle')).toBeLessThan(
      windowsHtml.indexOf('add table row or column'),
    )
    expect(macHtml).toContain('command+w deletes active aisle')
    expect(macHtml).toContain('aria-label="command+w deletes active aisle"')
  })

  it('renders scratchpad settings with the 8 aisle minimum and 40 aisle maximum', () => {
    const state = createState()
    state.ui.scratchpadAisleLimit = 16
    state.ui.scratchpadNewAisleSide = 'left'
    const html = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, { section: 'misc', state })

    expect(html).not.toContain('<p class="settings-help">user settings</p>')
    expect(html).toContain('<p class="settings-help settings-subsection-label">scratchpad</p>')
    expect(html).toContain('scratchpad')
    expect(html.match(/deletes active aisle/g) ?? []).toHaveLength(2)
    expect(html).toContain('scratchpad aisle limit')
    expect(html).toContain('type="number"')
    expect(html).toContain('min="8"')
    expect(html).toContain('max="40"')
    expect(html).toContain('value="16"')
    expect(html).toContain('command+n in scratch pad creates an aisle to the')
    expect(html).toContain('aria-checked="true" class="settings-segmented-option is-selected">left</button>')
    expect(html).toContain('aria-checked="false" class="settings-segmented-option ">right</button>')
  })

  it('renders strikethrough as a selectable new-line operation', () => {
    const html = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, { section: 'shortcuts' })

    expect(html).toContain('<option value="strikethrough">strikethrough</option>')
  })

  it('renders explicit aisle direction operations as selectable new-line operations', () => {
    const html = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, { section: 'shortcuts' })

    expect(html).toContain('<option value="aisleLeft">aisle to the left</option>')
    expect(html).toContain('<option value="aisleRight">aisle to the right</option>')
    expect(html).not.toContain('<option value="aisle">aisle</option>')
  })

  it('splits data settings into transfer, notebook, and trash sub-sections', () => {
    const transferHtml = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, { section: 'data' })
    const storageHtml = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, {
      section: 'data',
      dataSection: 'storage',
      storageProfileStatus: {
        status: 'ready',
        health: 'healthy',
        issues: [],
        profileRootPath: '/tmp/Tabs Notebook',
        notebookPath: '/tmp/Tabs Notebook',
        notebookName: 'Tabs Notebook',
        isDefault: false,
        hasProfile: true,
        canWrite: true,
        source: 'hybrid',
        schemaVersion: 2,
        knownNotebooks: [
          {
            notebookPath: '/tmp/Tabs Notebook',
            notebookName: 'Tabs Notebook',
            isActive: true,
            isDefault: false,
            exists: true,
            hasManifest: true,
            available: true,
          },
          {
            notebookPath: '/tmp/Missing Notebook',
            notebookName: 'Missing Notebook',
            isActive: false,
            isDefault: false,
            exists: false,
            hasManifest: false,
            available: false,
          },
        ],
      },
    })
    const trashHtml = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, { section: 'data', dataSection: 'trash' })

    expect(transferHtml).toContain('role="radiogroup" aria-labelledby="settings-data-section-label"')
    expect(transferHtml).toContain('aria-checked="true" class="settings-segmented-option is-selected">transfer</button>')
    expect(transferHtml).not.toContain('>settings</button>')
    expect(transferHtml).toContain('notebook import:')
    expect(transferHtml).not.toContain('export notebook folder')
    expect(transferHtml).toContain('import notebook/markdown')
    expect(transferHtml).toContain('app settings transfer:')
    expect(transferHtml).toContain('export user settings')
    expect(transferHtml).toContain('import user settings')
    expect(transferHtml).toContain('import from notebook folder')
    expect(transferHtml).toContain('User settings are stored in app-settings.json')
    expect(transferHtml).not.toContain('automatically remove deleted items after:')

    expect(storageHtml).toContain('aria-checked="true" class="settings-segmented-option is-selected">notebook</button>')
    expect(storageHtml).toContain('notebook:</p>')
    expect(storageHtml).toContain('current notebook')
    expect(storageHtml).toContain('settings-notebook-select')
    expect(storageHtml).toContain('Tabs Notebook')
    expect(storageHtml).toContain('Missing Notebook (local missing)')
    expect(storageHtml).toContain('new notebook')
    expect(storageHtml).toContain('open notebook...')
    expect(storageHtml).toContain('notebook details')
    expect(storageHtml).toContain('rename')
    expect(storageHtml).toContain('move folder')
    expect(storageHtml).toContain('open notebook folder')
    expect(storageHtml).toContain('remove from list')
    expect(storageHtml).not.toContain('switch notebook')
    expect(storageHtml).not.toContain('export notebook folder')
    expect(storageHtml).not.toContain('choose sync folder')
    expect(storageHtml).not.toContain('advanced support:')
    expect(storageHtml).not.toContain('restore latest snapshot')

    expect(trashHtml).toContain('aria-checked="true" class="settings-segmented-option is-selected">trash</button>')
    expect(trashHtml).toContain('automatically remove deleted items after:')
    expect(trashHtml).toContain('class="settings-number-input settings-number-input-half"')
    expect(trashHtml).toContain('confirm delete for real')
    expect(trashHtml).toContain('id="settings-trash-delete-confirmation"')
    expect(trashHtml).toContain('role="switch" checked=""')
    expect(trashHtml).not.toContain('choose notebook folder')
  })

  it('renders persistent user settings import failures', () => {
    const fileHtml = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, {
      section: 'data',
      dataSection: 'transfer',
      importStatus: "The file selected doesn't match our app-settings.json structure.",
    })
    const folderHtml = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, {
      section: 'data',
      dataSection: 'transfer',
      importStatus: "The folder selected doesn't contain an app-settings.json file that matches this project's structure.",
    })

    expect(fileHtml).toContain("The file selected doesn&#x27;t match our app-settings.json structure.")
    expect(folderHtml).toContain(
      "The folder selected doesn&#x27;t contain an app-settings.json file that matches this project&#x27;s structure.",
    )
  })

  it('renders user settings folder status and warnings', () => {
    const html = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, {
      section: 'data',
      dataSection: 'transfer',
      userSettingsLocationStatus: {
        status: 'warning',
        event: 'settings-sync-missing',
        settingsRootPath: '/Users/me/Cloud/Tabs Settings',
        settingsPath: '/Users/me/Cloud/Tabs Settings/settings/app-settings.json',
        localSettingsPath: '/Users/me/Library/Application Support/Tabs/settings/app-settings.json',
        isDefault: false,
        canWrite: false,
        syncStatus: 'fallback',
        source: 'local-cache',
        error: 'Settings folder does not contain settings/app-settings.json. Using local app settings.',
      },
    })

    expect(html).toContain('settings folder')
    expect(html).toContain('/Users/me/Cloud/Tabs Settings')
    expect(html).toContain('status</span><span>fallback</span>')
    expect(html).toContain('open settings folder')
    expect(html).toContain('use local settings')
    expect(html).toContain('Settings folder does not contain settings/app-settings.json. Using local app settings.')
  })

  it('hides desktop-only folder controls on mobile', () => {
    const transferHtml = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, {
      section: 'data',
      dataSection: 'transfer',
      dataCapabilities: MOBILE_DATA_CAPABILITIES,
    })
    const folderHtml = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, {
      section: 'data',
      dataSection: 'storage',
      dataCapabilities: MOBILE_DATA_CAPABILITIES,
    })

    expect(transferHtml).not.toContain('>settings</button>')
    expect(transferHtml).not.toContain('export notebook folder')
    expect(transferHtml).toContain('import notebook/markdown')
    expect(transferHtml).toContain('app settings transfer:')
    expect(transferHtml).toContain('export user settings')
    expect(transferHtml).toContain('import user settings')
    expect(transferHtml).not.toContain('import from notebook folder')
    expect(transferHtml).not.toContain('notebook folder export is desktop only')

    expect(folderHtml).toContain('local app notebook:')
    expect(folderHtml).toContain('app-private local')
    expect(folderHtml).toContain('Live notebook folders, live settings folders, and folder switching are desktop features')
    expect(folderHtml).not.toContain('new notebook')
    expect(folderHtml).not.toContain('switch notebook')
    expect(folderHtml).not.toContain('move notebook folder')
  })

  it('renders custom theme palette controls when a custom theme is selected', () => {
    const state = createState()
    state.theme = 'custom1'
    state.ui.themePalettes = {
      custom1: {
        ...DEFAULT_CUSTOM_THEME_PALETTE,
        primary: '#8844cc',
        tagText: '#315577',
        tagBg: '#dce6f6',
      },
    }
    const html = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, { section: 'visuals', state })

    expect(html).toContain('aria-checked="true" class="settings-segmented-option is-selected">theming</button>')
    expect(html).toContain('>other visuals</button>')
    expect(html).toContain('aria-label="custom theme"')
    expect(html).toContain('<option value="custom1" selected="">custom 1</option>')
    expect(html).toContain('<option value="custom2">custom 2</option>')
    expect(html).toContain('<option value="custom3">custom 3</option>')
    expect(html).toContain('aria-label="theme palette"')
    expect(html).toContain('aria-label="theme color preview"')
    expect(html).toContain('aria-label="primary color swatch"')
    expect(html).toContain('aria-label="primary hex value"')
    expect(html).toContain('aria-label="tag font color swatch"')
    expect(html).toContain('aria-label="tag font hex value"')
    expect(html).toContain('aria-label="tag back color swatch"')
    expect(html).toContain('aria-label="tag back hex value"')
    expect(html).toContain('aria-label="domain color swatch"')
    expect(html).toContain('aria-label="space color swatch"')
    expect(html).toContain('aria-label="parent tab color swatch"')
    expect(html).toContain('aria-label="sub tab color swatch"')
    expect(html).not.toContain('type="color"')
    expect(html).toContain('value="#8844cc"')
    expect(html).toContain('value="#315577"')
    expect(html).toContain('value="#dce6f6"')
    expect(html).toContain('value="#a95429"')
    expect(html).toContain('value="#997b28"')
    expect(html).toContain('value="#2f5da8"')
    expect(html).toContain('value="#2f8a5f"')
    expect(html).not.toContain('copy to custom 1')
    expect(html).toContain('reset palette')
    expect(html).toContain('export json')
    expect(html).toContain('import json')
  })

  it('renders theme preview samples in theming', () => {
    const html = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, { section: 'visuals' })
    const railIndex = html.indexOf('aria-label="theme example buttons"')
    const toolbarIndex = html.indexOf('aria-label="theme preview toolbar"')
    const editorIndex = html.indexOf('visuals-preview-editor-sample toastui-editor-contents')

    expect(railIndex).toBeGreaterThan(-1)
    expect(toolbarIndex).toBeGreaterThan(railIndex)
    expect(editorIndex).toBeGreaterThan(toolbarIndex)
    expect(html).toContain('class="visuals-theme-preview theme-dawn" aria-label="theme color preview"')
    expect(html).toContain(
      'class="visuals-preview-toolbar note-shared-toolbar is-interaction-disabled toastui-editor-toolbar" role="toolbar" aria-label="theme preview toolbar" aria-disabled="true"',
    )
    expect(html.match(/visuals-preview-toolbar-tool/g)?.length).toBe(5)
    ;['Headings', 'Dash list', 'Task', 'Insert image', 'Insert table'].forEach((label) => {
      expect(html).toContain(`data-app-tooltip="${label}" aria-label="${label}" disabled=""`)
    })
    expect(html).toContain('<h3 class="visuals-preview-heading">header</h3>')
    expect(html).toContain('<p class="visuals-preview-tag-line"><span class="tabs-tag-token">#tag</span></p>')
    expect(html).toContain('<ul class="visuals-preview-list tabs-dash-list" data-tabs-list-marker="dash"><li>dash</li></ul>')
    expect(html).toContain('<li>bullet</li>')
    expect(html).toContain('<li>number</li>')
    expect(html).not.toContain('visuals-preview-muted-text')
    expect(html).not.toContain('<p class="visuals-preview-muted-text">muted text</p>')
    expect(html).toContain(
      '<li class="task-list-item checked" data-task="" data-task-checked="" role="checkbox" aria-checked="true" tabindex="0">done task</li>',
    )
    expect(html).toContain(
      '<li class="task-list-item" data-task="" role="checkbox" aria-checked="false" tabindex="0">open task</li>',
    )
    expect(html).not.toContain('is-done')
    expect(html).toContain('danger toast')
    expect(html).toContain('warning toast')
    expect(html).toContain('success toast')
    expect(html).toContain('toastui-editor-contents')
    expect(html).toContain('class="app-toast app-toast-error visuals-preview-toast"')
    expect(html).toContain('class="app-toast app-toast-warning visuals-preview-toast"')
    expect(html).toContain('class="app-toast app-toast-success visuals-preview-toast"')
    expect(html).toContain('aria-label="theme example buttons"')
    expect(html).toContain('--visuals-preview-page:#8a744a')
    expect(html).toContain('--visuals-preview-panel-bg:#d8c9a3')
    expect(html).toContain('--nav-rail-bg:#b99a45')
    expect(html).toContain('--nav-rail-border:rgba(93, 75, 34, 0.24)')
    expect(html).toContain('--editor-toolbar-bg:#c7b37a')
    expect(html).toContain('--editor-border:#8a744a')
    expect(html).toContain('--editor-tag-text:#fff7ed')
    expect(html).toContain('--editor-tag-bg:#0f766e')
    expect(html).toContain('class="visuals-preview-rail-row is-count-2" aria-label="domain rail samples"')
    expect(html).toContain('class="visuals-preview-rail-row is-count-2" aria-label="space rail samples"')
    expect(html).toContain('class="visuals-preview-rail-row is-count-2" aria-label="parent rail samples"')
    expect(html).toContain('class="visuals-preview-rail-row is-count-2" aria-label="subtab rail samples"')
    expect(html).toContain(
      'aria-label="domain rail sample 1" aria-pressed="true" class="visuals-preview-pill compact-scope-btn compact-domain-btn is-active">domain',
    )
    expect(html).toContain(
      'aria-label="domain rail sample 2" aria-pressed="false" class="visuals-preview-pill compact-scope-btn compact-domain-btn">domain',
    )
    expect(html).not.toContain('aria-label="domain rail sample 3"')
    expect(html).toContain(
      'aria-label="space rail sample 1" aria-pressed="false" class="visuals-preview-pill compact-scope-btn compact-space-btn">space',
    )
    expect(html).toContain(
      'aria-label="space rail sample 2" aria-pressed="true" class="visuals-preview-pill compact-scope-btn compact-space-btn is-active">space',
    )
    expect(html).not.toContain('aria-label="space rail sample 3"')
    expect(html).toContain(
      'aria-label="parent rail sample 1" aria-pressed="false" aria-selected="false" class="visuals-preview-pill btn btn-sm tab-btn parent-tab-btn">parent',
    )
    expect(html).toContain(
      'aria-label="parent rail sample 2" aria-pressed="true" aria-selected="true" class="visuals-preview-pill btn btn-sm tab-btn parent-tab-btn">parent',
    )
    expect(html).not.toContain('aria-label="parent rail sample 3"')
    expect(html).toContain(
      'aria-label="subtab rail sample 1" aria-pressed="true" aria-selected="true" class="visuals-preview-pill btn btn-sm tab-btn subtab-btn">sub',
    )
    expect(html).toContain(
      'aria-label="subtab rail sample 2" aria-pressed="false" aria-selected="false" class="visuals-preview-pill btn btn-sm tab-btn subtab-btn">sub',
    )
    expect(html).not.toContain('aria-label="subtab rail sample 3"')
  })

  it('selects one theme preview rail sample per rail', () => {
    const nextSelection = selectThemePreviewRailSample(DEFAULT_THEME_PREVIEW_RAIL_SELECTION, 'domain', 1)

    expect(nextSelection.domain).toBe(1)
    expect(nextSelection.space).toBe(1)
    expect(nextSelection.parent).toBe(1)
    expect(nextSelection.subtab).toBe(0)
    expect(selectThemePreviewRailSample(nextSelection, 'domain', 1)).toBe(nextSelection)
  })

  it('toggles only the requested theme preview task', () => {
    const nextTasks = toggleThemePreviewTaskState({ done: true, open: false }, 'open')

    expect(nextTasks).toEqual({ done: true, open: true })
    expect(toggleThemePreviewTaskState(nextTasks, 'done')).toEqual({ done: false, open: true })
  })

  it('shows the copy-to-custom action only for built-in themes', () => {
    const html = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, { section: 'visuals' })

    expect(html).toContain('copy to custom 1')
    expect(html).not.toContain('seed from current theme')
  })

  it('renders the selected built-in theme palette values', () => {
    const state = createState()
    state.theme = 'dawn'
    state.ui.themePalettes = {
      dawn: {
        ...getThemePaletteForTheme('dawn', {}),
        primary: '#123456',
        parentRail: '#654321',
      },
      light: {
        ...getThemePaletteForTheme('light', {}),
        primary: '#abcdef',
      },
    }

    const dawnHtml = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, { section: 'visuals', state })
    const lightState = { ...state, theme: 'light' as const }
    const lightHtml = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, { section: 'visuals', state: lightState })

    expect(dawnHtml).toContain('value="#123456"')
    expect(dawnHtml).toContain('value="#654321"')
    expect(dawnHtml).not.toContain('value="#abcdef"')
    expect(dawnHtml).toContain('class="visuals-theme-preview theme-dawn" aria-label="theme color preview"')
    expect(dawnHtml).not.toContain('theme-custom-derived')
    expect(dawnHtml).toContain('--parent-rail-accent:#654321')
    expect(dawnHtml).toContain('--visuals-preview-page:#8a744a')
    expect(lightHtml).toContain('value="#abcdef"')
    expect(lightHtml).not.toContain('value="#123456"')
    expect(lightHtml).not.toContain('value="#654321"')
  })

  it('renders always-visible navigation switches in other visuals', () => {
    const state = createState()
    state.ui.alwaysShowSpaces = true
    const html = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, {
      section: 'visuals',
      visualsSection: 'otherVisuals',
      state,
    })

    expect(html).toContain('aria-checked="true" class="settings-segmented-option is-selected">other visuals</button>')
    expect(html).toContain('always show spaces')
    expect(html).toContain('always show domains')
    expect(html).toContain('regular note aisle add buttons')
    expect(html).toContain('regular note aisle delete button')
    expect(html).toContain('toolbar button size')
    expect(html).toContain('id="settings-toolbar-button-scale"')
    expect(html).toContain('id="settings-always-show-spaces"')
    expect(html).toContain('id="settings-always-show-domains"')
    expect(html).toContain('id="settings-regular-note-aisle-add-buttons"')
    expect(html).toContain('id="settings-regular-note-aisle-delete-button"')
    expect(html).not.toContain('id="settings-regular-note-aisle-add-buttons" class="form-check-input" type="checkbox" role="switch" checked=""')
    expect(html).not.toContain('id="settings-regular-note-aisle-delete-button" class="form-check-input" type="checkbox" role="switch" checked=""')
    expect(html).not.toContain('aria-label="theme palette"')
    expect(html).not.toContain('aria-label="theme color preview"')
  })

  it('renders misc table target controls with bottom-right defaults', () => {
    const html = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, { section: 'misc' })

    expect(html).toContain('add table row or column')
    expect(html).toContain('delete table row or column')
    expect(html.match(/>at active cell<\/button>/g)).toHaveLength(2)
    expect(html.match(/>bottom right<\/button>/g)).toHaveLength(2)
    expect(html.match(/aria-checked="true" class="settings-segmented-option is-selected">bottom right/g)).toHaveLength(2)
  })

  it('renders toolbar settings with a protected default layout', () => {
    const html = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, { section: 'toolbar' })

    expect(html).toContain('role="tabpanel" aria-label="toolbar settings"')
    expect(html).not.toContain('toolbar used')
    expect(html).not.toContain('id="settings-device-toolbar"')
    expect(html).toContain('id="settings-edit-toolbar-layout"')
    expect(html).toContain('<option value="default" selected="">default</option>')
    expect(html).not.toContain('duplicate the default layout to customize it for this device.')
    expect(html).toContain('disabled=""')
    expect(html).toContain('settings-toolbar-preview is-readonly')
    expect(html).toContain('settings-toolbar-icon-box is-readonly')
    expect(html).toContain('settings-toolbar-surface toastui-editor-defaultUI-toolbar app-shared-editor-toolbar settings-toolbar-preview-inner')
    expect(html).toContain('settings-toolbar-surface toastui-editor-defaultUI-toolbar app-shared-editor-toolbar settings-toolbar-palette-inner')
    expect(html.indexOf('settings-toolbar-preview is-readonly')).toBeLessThan(html.indexOf('settings-toolbar-icon-box'))
    expect(html).not.toContain('settings-toolbar-preview note-shared-toolbar')
    expect(html).not.toContain('settings-toolbar-icon-box note-shared-toolbar')
    expect(html).not.toContain('settings-toolbar-drop-zone')
    expect(html).toContain('aria-label="Make this a copy of"')
    expect(html).toContain('aria-label="Find &amp; replace"')
    expect(html).toContain('toolbar-tool-icon-table-of-contents')
    expect(html).toContain('toolbar-tool-icon-find-replace')
    expect(html).toContain('data-app-tooltip="spacer"')
    expect(html).toContain('>spacer</button>')
    expect(html).toContain('show icons with names')
    expect(html).toContain('aria-label="show icons with names"')
    expect(html).not.toContain('settings-toolbar-visible-tool-name')
    expect(html).not.toContain('>ToC</button>')
    expect(html).not.toContain('settings-toolbar-layout-btn')
    expect(html).not.toContain('settings-toolbar-mini-btn')
    expect(html).not.toContain('settings-toolbar-item-label')
  })

  it('renders a custom toolbar layout editor with available tools', () => {
    const state = createState()
    state.ui.toolbarLayouts = [
      {
        id: 'desktop',
        name: 'desktop',
        items: [
          { id: 'bold', type: 'tool', toolId: 'bold' },
          { id: 'gap', type: 'spacer' },
          { id: 'italic', type: 'tool', toolId: 'italic' },
        ],
      },
    ]
    const html = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, {
      section: 'toolbar',
      state,
      toolbarEditorLayoutId: 'desktop',
    })

    expect(html).toContain('<option value="desktop" selected="">desktop</option>')
    expect(html).toContain('value="desktop"')
    expect(html).toContain('settings-toolbar-preview is-editable')
    expect(html).toContain('settings-toolbar-editable-icon')
    expect(html).toContain('settings-toolbar-editable-spacer')
    expect(html).toContain('data-toolbar-layout-item="true"')
    expect(html).toContain('settings-toolbar-icon-box is-editable')
    expect(html).toContain('settings-toolbar-surface toastui-editor-defaultUI-toolbar app-shared-editor-toolbar settings-toolbar-palette-inner')
    expect(html).not.toContain('settings-toolbar-preview note-shared-toolbar')
    expect(html).not.toContain('settings-toolbar-icon-box note-shared-toolbar')
    expect(html).toContain('settings-toolbar-palette-icon')
    expect(html).toContain('note-copy-toolbar-btn is-icon-only-text-tool settings-toolbar-palette-icon')
    expect(html).not.toContain('settings-toolbar-drop-zone')
    expect(html).toContain('aria-label="Bold"')
    expect(html).toContain('aria-label="Italic"')
    expect(html).toContain('aria-label="Make this a copy of"')
    expect(html).toContain('aria-label="Find &amp; replace"')
    expect(html).toContain('toolbar-tool-icon-table-of-contents')
    expect(html).toContain('toolbar-tool-icon-find-replace')
    expect(html).toContain('data-app-tooltip="spacer"')
    expect(html).toContain('>spacer</button>')
    expect(html).toContain('show icons with names')
    expect(html).not.toContain('settings-toolbar-visible-tool-name')
    expect(html).not.toContain('>ToC</button>')
    expect(html).toContain('delete</button>')
    expect(html).not.toContain('settings-toolbar-mini-btn')
    expect(html).not.toContain('move Bold left')
    expect(html).not.toContain('remove Bold')
    expect(html).not.toContain('settings-toolbar-item-label')
    expect(html).not.toContain('duplicate the default layout to customize it for this device.')
  })

  it('keeps an empty custom toolbar layout editable with all tools in the palette', () => {
    const state = createState()
    state.ui.toolbarLayouts = [
      {
        id: 'empty',
        name: 'empty',
        items: [],
      },
    ]
    const html = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, {
      section: 'toolbar',
      state,
      toolbarEditorLayoutId: 'empty',
    })

    expect(html).toContain('<option value="empty" selected="">empty</option>')
    expect(html).toContain('settings-toolbar-preview is-editable')
    expect(html).toContain('settings-toolbar-preview-inner')
    expect(html).not.toContain('settings-toolbar-editable-icon')
    expect(html).not.toContain('settings-toolbar-editable-spacer')
    expect(html).toContain('settings-toolbar-icon-box is-editable')
    expect(html).toContain('aria-label="Make this a copy of"')
    expect(html).toContain('aria-label="Find &amp; replace"')
    expect(html).toContain('aria-label="Clear contents"')
    expect(html).toContain('data-app-tooltip="spacer"')
  })

  it('renders toolbar customizer labels when icon names are enabled', () => {
    const state = createState()
    state.ui.toolbarLayouts = [
      {
        id: 'desktop',
        name: 'desktop',
        items: [
          { id: 'bold', type: 'tool', toolId: 'bold' },
          { id: 'gap', type: 'spacer' },
          { id: 'italic', type: 'tool', toolId: 'italic' },
        ],
      },
    ]
    const html = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, {
      section: 'toolbar',
      state,
      toolbarEditorLayoutId: 'desktop',
      toolbarEditorShowNames: true,
    })

    expect(html).toContain('settings-toolbar-editor show-names')
    expect(html).toContain('checked=""')
    expect(html).toContain('settings-toolbar-named-tool settings-toolbar-editable-icon')
    expect(html).toContain('settings-toolbar-named-tool settings-toolbar-palette-icon')
    expect(html).toContain('settings-toolbar-visible-tool-name">Bold</span>')
    expect(html).toContain('settings-toolbar-visible-tool-name">Italic</span>')
    expect(html).toContain('settings-toolbar-visible-tool-name">Make this a copy of</span>')
    expect(html).toContain('>spacer</button>')
  })

  it('renders an empty tips settings panel before any tips are seen', () => {
    const html = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, { section: 'tips' })

    expect(html).toContain('Tips you have seen will appear here.')
    expect(html).not.toContain('task undo')
  })

  it('renders only seen tips with enabled state', () => {
    const state = createState()
    state.ui.seenTipIds = ['task-undo']
    state.ui.disabledTipIds = ['task-undo']
    const html = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, { section: 'tips', state })

    expect(html).toContain("Disabled tips won&#x27;t appear unless you turn them back on.")
    expect(html).toContain('task undo')
    expect(html).toContain('Click &amp; hold')
    expect(html).toContain('aria-label="task undo tip enabled"')
    expect(html).not.toContain('tab creation')
    expect(html).not.toContain('checked=""')
  })

  it('renders the auto-disabled trash confirmation tip unchecked after it is seen', () => {
    const state = createState()
    state.ui.seenTipIds = ['trash-delete-confirmation-setting']
    state.ui.disabledTipIds = ['trash-delete-confirmation-setting']
    const html = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, { section: 'tips', state })

    expect(html).toContain('trash delete confirmation setting')
    expect(html).toContain('turn off delete-for-real confirmations')
    expect(html).toContain('aria-label="trash delete confirmation setting tip enabled"')
    expect(html).not.toContain('checked=""')
  })

  it('renders platform-specific active aisle shortcut tip text', () => {
    const state = createState()
    state.ui.seenTipIds = ['delete-active-aisle-shortcut']

    const macHtml = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, true, {
      section: 'tips',
      state,
      isMacPlatform: true,
    })
    const windowsHtml = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, { section: 'tips', state })

    expect(macHtml).toContain('You can enable command+w to delete the active aisle in the misc tab of the settings.')
    expect(windowsHtml).toContain('You can enable control+w to delete the active aisle in the misc tab of the settings.')
  })

  it('renders draft template changes behind explicit save controls', () => {
    const html = renderSettingsPage(
      {
        settingsTemplateId: 'draft-template',
        lastAppliedTemplateId: '',
        templates: [
          {
            id: 'draft-template',
            name: 'draft template',
            fields: [{ id: 'field-1', key: 'status', type: 'text', defaultValue: 'draft', computed: 'none' }],
          },
        ],
      },
      true,
    )

    expect(html).toContain('draft template')
    expect(html).toContain('save template')
    expect(html).toContain('discard changes')
    expect(html).toContain('Template changes apply only after saving.')
  })

  it('renders boolean template defaults as a switch', () => {
    const html = renderSettingsPage(
      {
        settingsTemplateId: 'draft-template',
        lastAppliedTemplateId: '',
        templates: [
          {
            id: 'draft-template',
            name: 'draft template',
            fields: [{ id: 'field-1', key: 'published', type: 'boolean', defaultValue: 'true', computed: 'none' }],
          },
        ],
      },
      false,
    )

    expect(html).toContain('aria-label="frontmatter default boolean value"')
    expect(html).toContain('role="switch"')
    expect(html).toContain('checked=""')
    expect(html).not.toContain('aria-label="frontmatter default value"')
  })

  it('renders date and datetime template defaults as picker inputs', () => {
    const html = renderSettingsPage(
      {
        settingsTemplateId: 'draft-template',
        lastAppliedTemplateId: '',
        templates: [
          {
            id: 'draft-template',
            name: 'draft template',
            fields: [
              { id: 'field-1', key: 'due', type: 'date', defaultValue: '', computed: 'none' },
              { id: 'field-2', key: 'starts', type: 'datetime', defaultValue: '', computed: 'none' },
            ],
          },
        ],
      },
      false,
    )

    expect(html).toContain('type="date" class="settings-text-input frontmatter-default-input" aria-label="frontmatter default value" value=""')
    expect(html).toContain('type="datetime-local" class="settings-text-input frontmatter-default-input" aria-label="frontmatter default value" value=""')
  })

  it('renders warning notebook folder health without recovery actions', () => {
    const html = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, {
      section: 'data',
      dataSection: 'storage',
      storageProfileStatus: {
        status: 'ready',
        health: 'warning',
        issues: [
          {
            code: 'missing-markdown',
            severity: 'warning',
            path: 'domains/domain/space/tab/home.md',
            message: 'Markdown file is missing; this note was loaded as empty.',
          },
        ],
        profileRootPath: '/tmp/tabs',
        notebookPath: '/tmp/tabs',
        notebookName: 'tabs',
        isDefault: false,
        hasProfile: true,
        canWrite: true,
        source: 'hybrid',
        schemaVersion: 2,
      },
    })

    expect(html).toContain('storage-profile-card is-warning')
    expect(html).toContain('health</span><span>warning</span>')
    expect(html).toContain('schema</span><span>2</span>')
    expect(html).toContain('writable</span><span>yes</span>')
    expect(html).toContain('aria-label="notebook folder health issues"')
    expect(html).toContain('Markdown file is missing; this note was loaded as empty.')
  })

  it('renders error notebook folder health with paused writes and no restore action', () => {
    const html = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, {
      section: 'data',
      dataSection: 'storage',
      storageProfileStatus: {
        status: 'error',
        health: 'error',
        issues: [
          {
            code: 'corrupt-root-manifest',
            severity: 'error',
            path: 'manifest.json',
            message: 'Root manifest is corrupt.',
          },
        ],
        event: 'retry-error',
        profileRootPath: '/tmp/tabs',
        notebookPath: '/tmp/tabs',
        notebookName: 'tabs',
        isDefault: true,
        hasProfile: true,
        canWrite: false,
        source: 'hybrid',
        schemaVersion: null,
        error: 'Existing app state could not be loaded.',
      },
    })

    expect(html).toContain('storage-profile-card is-error')
    expect(html).toContain('health</span><span>error</span>')
    expect(html).toContain('writable</span><span>paused</span>')
    expect(html).toContain('Root manifest is corrupt.')
    expect(html).not.toContain('restore latest snapshot')
  })
})
