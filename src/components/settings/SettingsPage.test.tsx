import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEFAULT_FRONTMATTER_SETTINGS } from '../../frontmatter/frontmatter'
import {
  DEFAULT_CUSTOM_THEME_PALETTE,
  DEFAULT_VISUALS_SETTINGS_SECTION,
  getThemePaletteForTheme,
} from '../../settings/defaults'
import { DEFAULT_TOOLBAR_LAYOUT_ID, getToolbarLayouts } from '../../editor/toolbar-layouts'
import type {
  AppState,
  FrontmatterSettings,
  SettingsSection,
  Space,
  StorageProfileStatus,
  VisualsSettingsSection,
} from '../../types/app'
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
        toggleTabTrash: '',
        openDomains: '',
        openSpaces: '',
        newTab: '',
        newSubTab: '',
        formatStrikethrough: '',
        cycleParentTabNext: '',
        cycleParentTabPrev: '',
        cycleSubTabNext: '',
        cycleSubTabPrev: '',
      },
      newlineShortcuts: {
        shortcuts: {
          controlEnter: 'normalNewLine',
          shiftEnter: 'normalNewLine',
          commandEnter: 'normalNewLine',
        },
        menuOperations: [],
      },
      enableMouseBackForward: true,
      enableGenericHistoryHotkeys: true,
    },
    frontmatter: DEFAULT_FRONTMATTER_SETTINGS,
    ui: {
      showParentHomeTab: true,
      stageManagerOpenDestinationAfterApply: true,
      tableAddTargetMode: 'bottom-right',
      tableDeleteTargetMode: 'bottom-right',
      tabButtonScale: 1,
      noteFontScale: 1,
      settingsSection: 'hotkeys',
      visualsSettingsSection: 'theming',
      selectedCustomTheme: 'custom1',
      customThemePalette: null,
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
    visualsSection?: VisualsSettingsSection
    state?: AppState
    storageProfileStatus?: StorageProfileStatus | null
    toolbarEditorLayoutId?: string
    toolbarEditorShowNames?: boolean
  } = {},
) {
  const state = options.state ?? createState()
  return renderToStaticMarkup(
    <SettingsPage
      state={state}
      section={options.section ?? 'frontmatter'}
      visualsSection={options.visualsSection ?? state.ui.visualsSettingsSection ?? DEFAULT_VISUALS_SETTINGS_SECTION}
      isMacPlatform={false}
      shortcutDrafts={{
        toggleTabTrash: '',
        openDomains: '',
        openSpaces: '',
        newTab: '',
        newSubTab: '',
        formatStrikethrough: '',
        cycleParentTabNext: '',
        cycleParentTabPrev: '',
        cycleSubTabNext: '',
        cycleSubTabPrev: '',
      }}
      newlineShortcutDrafts={{
        controlEnter: 'normalNewLine',
        shiftEnter: 'normalNewLine',
        commandEnter: 'normalNewLine',
      }}
      editingShortcut={null}
      mouseBackForwardEnabled
      genericHistoryHotkeysEnabled
      settingsDaysDraft="30"
      activeSpaceId={space.id}
      exportStatus=""
      tabButtonScaleDraft={1}
      noteFontScaleDraft={1}
      selectedCustomTheme={state.ui.selectedCustomTheme ?? 'custom1'}
      customThemePaletteDraft={getThemePaletteForTheme(state.theme, state.ui.themePalettes, state.ui.customThemePalette)}
      showParentHomeTabDraft
      alwaysShowSpacesDraft={state.ui.alwaysShowSpaces ?? false}
      alwaysShowDomainsDraft={state.ui.alwaysShowDomains ?? false}
      tableAddTargetModeDraft={state.ui.tableAddTargetMode}
      tableDeleteTargetModeDraft={state.ui.tableDeleteTargetMode}
      frontmatterDraft={frontmatterDraft}
      frontmatterDraftDirty={frontmatterDraftDirty}
      toolbarLayouts={getToolbarLayouts(state.ui.toolbarLayouts)}
      toolbarEditorLayoutId={options.toolbarEditorLayoutId ?? DEFAULT_TOOLBAR_LAYOUT_ID}
      toolbarEditorShowNames={options.toolbarEditorShowNames ?? state.ui.toolbarEditorShowNames ?? false}
      storageProfileStatus={options.storageProfileStatus ?? null}
      onSectionChange={() => undefined}
      onVisualsSectionChange={() => undefined}
      onToggleShortcutEdit={() => undefined}
      onNewlineShortcutChange={() => undefined}
      onOpenShortcutMenuSettings={() => undefined}
      onMouseBackForwardChange={() => undefined}
      onGenericHistoryHotkeysChange={() => undefined}
      onAutoRemoveDaysChange={() => undefined}
      onExportSpace={() => undefined}
      onExportAll={() => undefined}
      onThemeChange={() => undefined}
      onSelectedCustomThemeChange={() => undefined}
      onCustomThemePaletteChange={() => undefined}
      onCustomThemePaletteImport={() => undefined}
      onCustomThemePaletteReset={() => undefined}
      onCustomThemePaletteSeedFromCurrentTheme={() => undefined}
      onTabButtonScaleChange={() => undefined}
      onNoteFontScaleChange={() => undefined}
      onShowParentHomeTabChange={() => undefined}
      onAlwaysShowSpacesChange={() => undefined}
      onAlwaysShowDomainsChange={() => undefined}
      onTableAddTargetModeChange={() => undefined}
      onTableDeleteTargetModeChange={() => undefined}
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
      onChooseStorageFolder={() => undefined}
      onMoveStorageProfile={() => undefined}
      onRevealStorageProfile={() => undefined}
      onRetryStorageProfile={() => undefined}
      onRestoreStorageRecoverySnapshot={() => undefined}
    />,
  )
}

describe('frontmatter settings page', () => {
  it('renders settings tabs in alphabetical order with toolbar and visuals included', () => {
    const html = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, { section: 'hotkeys' })

    expect(html).toContain('>toolbar</button>')
    expect(html).not.toContain('>theming</button>')
    expect(html.indexOf('>data</button>')).toBeLessThan(html.indexOf('>frontmatter</button>'))
    expect(html.indexOf('>frontmatter</button>')).toBeLessThan(html.indexOf('>hotkeys</button>'))
    expect(html.indexOf('>hotkeys</button>')).toBeLessThan(html.indexOf('>misc</button>'))
    expect(html.indexOf('>misc</button>')).toBeLessThan(html.indexOf('>shortcuts</button>'))
    expect(html.indexOf('>shortcuts</button>')).toBeLessThan(html.indexOf('>tips</button>'))
    expect(html.indexOf('>tips</button>')).toBeLessThan(html.indexOf('>toolbar</button>'))
    expect(html.indexOf('>toolbar</button>')).toBeLessThan(html.indexOf('>visuals</button>'))
  })

  it('renders parent-tab cycle hotkey rows as unbound shortcuts', () => {
    const html = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, { section: 'hotkeys' })

    expect(html).toContain('next parent tab')
    expect(html).toContain('previous parent tab')
    expect(html).toContain('strikethrough')
    expect(html).toContain('settings-shortcut-btn')
  })

  it('renders strikethrough as a selectable new-line operation', () => {
    const html = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, { section: 'shortcuts' })

    expect(html).toContain('<option value="strikethrough">strikethrough</option>')
  })

  it('renders custom theme palette controls when a custom theme is selected', () => {
    const state = createState()
    state.theme = 'custom1'
    state.ui.customThemePalette = {
      ...DEFAULT_CUSTOM_THEME_PALETTE,
      primary: '#8844cc',
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
    expect(html).toContain('aria-label="domain color swatch"')
    expect(html).toContain('aria-label="space color swatch"')
    expect(html).toContain('aria-label="parent tab color swatch"')
    expect(html).toContain('aria-label="sub tab color swatch"')
    expect(html).not.toContain('type="color"')
    expect(html).toContain('value="#8844cc"')
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
      expect(html).toContain(`title="${label}" aria-label="${label}" disabled=""`)
    })
    expect(html).toContain('<h3 class="visuals-preview-heading">header</h3>')
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

  it('renders blues theme preview with the light editor background', () => {
    const state = createState()
    state.theme = 'blues'
    const html = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, { section: 'visuals', state })

    expect(html).toContain('--visuals-preview-page:#314563')
    expect(html).toContain('--visuals-preview-panel-bg:#aeb8c6')
    expect(html).toContain('--nav-rail-bg:#8797b0')
    expect(html).toContain('--nav-rail-border:rgba(47, 65, 98, 0.24)')
    expect(html).toContain('--editor-toolbar-bg:#8fa0b8')
    expect(html).toContain('--editor-border:#61728f')
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
        ...DEFAULT_CUSTOM_THEME_PALETTE,
        primary: '#123456',
      },
      light: {
        ...DEFAULT_CUSTOM_THEME_PALETTE,
        primary: '#abcdef',
      },
    }

    const dawnHtml = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, { section: 'visuals', state })
    const lightState = { ...state, theme: 'light' as const }
    const lightHtml = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, { section: 'visuals', state: lightState })

    expect(dawnHtml).toContain('value="#123456"')
    expect(dawnHtml).not.toContain('value="#abcdef"')
    expect(lightHtml).toContain('value="#abcdef"')
    expect(lightHtml).not.toContain('value="#123456"')
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
    expect(html).toContain('id="settings-always-show-spaces"')
    expect(html).toContain('id="settings-always-show-domains"')
    expect(html).not.toContain('aria-label="theme palette"')
    expect(html).not.toContain('aria-label="theme color preview"')
  })

  it('renders misc table target controls with bottom-right defaults', () => {
    const html = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, { section: 'misc' })

    expect(html).toContain('>misc</button>')
    expect(html).toContain('add table row or column')
    expect(html).toContain('delete table row or column')
    expect(html.match(/>at active cell<\/button>/g)).toHaveLength(2)
    expect(html.match(/>bottom right<\/button>/g)).toHaveLength(2)
    expect(html.match(/aria-checked="true" class="settings-segmented-option is-selected">bottom right/g)).toHaveLength(2)
  })

  it('renders toolbar settings with a protected default layout', () => {
    const html = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, { section: 'toolbar' })

    expect(html).toContain('aria-selected="true" class="settings-section-tab is-active">toolbar</button>')
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
    expect(html).toContain('aria-label="Make copy"')
    expect(html).toContain('table-of-contents-toolbar-icon')
    expect(html).toContain('title="spacer"')
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
    expect(html).toContain('aria-label="Make copy"')
    expect(html).toContain('table-of-contents-toolbar-icon')
    expect(html).toContain('title="spacer"')
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
    expect(html).toContain('aria-label="Make copy"')
    expect(html).toContain('aria-label="Clear contents"')
    expect(html).toContain('title="spacer"')
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
    expect(html).toContain('settings-toolbar-visible-tool-name">Make copy</span>')
    expect(html).toContain('>spacer</button>')
  })

  it('renders an empty tips settings panel before any tips are seen', () => {
    const html = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, { section: 'tips' })

    expect(html).toContain('aria-selected="true" class="settings-section-tab is-active">tips</button>')
    expect(html).toContain('tips you have seen will appear here.')
    expect(html).not.toContain('task undo')
  })

  it('renders only seen tips with enabled state', () => {
    const state = createState()
    state.ui.seenTipIds = ['task-undo']
    state.ui.disabledTipIds = ['task-undo']
    const html = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, { section: 'tips', state })

    expect(html).toContain('task undo')
    expect(html).toContain('Cmd+Z')
    expect(html).toContain('aria-label="task undo tip enabled"')
    expect(html).not.toContain('tab creation')
    expect(html).not.toContain('checked=""')
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
    expect(html).toContain('template changes apply only after saving.')
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

  it('renders warning storage health with recovery actions', () => {
    const html = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, {
      section: 'data',
      storageProfileStatus: {
        status: 'ready',
        health: 'warning',
        issues: [
          {
            code: 'missing-markdown',
            severity: 'warning',
            path: 'notes-data/domains/domain/space/tab/home.md',
            message: 'Markdown file is missing; this note was loaded as empty.',
          },
        ],
        profileRootPath: '/tmp/tabs',
        notesDataPath: '/tmp/tabs/notes-data',
        isDefault: false,
        hasProfile: true,
        canWrite: true,
        source: 'hybrid',
        schemaVersion: 2,
        recoverySnapshotCount: 2,
        latestRecoverySnapshotPath: '/tmp/tabs/storage-recovery/notes-data-1',
      },
    })

    expect(html).toContain('storage-profile-card is-warning')
    expect(html).toContain('health</span><span>warning</span>')
    expect(html).toContain('schema</span><span>2</span>')
    expect(html).toContain('writable</span><span>yes</span>')
    expect(html).toContain('recovery snapshots</span><span>2</span>')
    expect(html).toContain('aria-label="storage health issues"')
    expect(html).toContain('Markdown file is missing; this note was loaded as empty.')
    expect(html).toContain('export backup')
    expect(html).toContain('restore latest snapshot</button>')
  })

  it('renders error storage health with paused writes and disabled restore when no snapshots exist', () => {
    const html = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, {
      section: 'data',
      storageProfileStatus: {
        status: 'error',
        health: 'error',
        issues: [
          {
            code: 'corrupt-root-manifest',
            severity: 'error',
            path: 'notes-data/manifest.json',
            message: 'Root manifest is corrupt.',
          },
        ],
        event: 'retry-error',
        profileRootPath: '/tmp/tabs',
        notesDataPath: '/tmp/tabs/notes-data',
        isDefault: true,
        hasProfile: true,
        canWrite: false,
        source: 'hybrid',
        schemaVersion: null,
        recoverySnapshotCount: 0,
        error: 'Existing app state could not be loaded.',
      },
    })

    expect(html).toContain('storage-profile-card is-error')
    expect(html).toContain('health</span><span>error</span>')
    expect(html).toContain('writable</span><span>paused</span>')
    expect(html).toContain('Root manifest is corrupt.')
    expect(html).toContain('restore latest snapshot</button>')
    expect(html).toContain('disabled=""')
  })
})
