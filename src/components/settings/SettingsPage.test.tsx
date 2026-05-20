import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEFAULT_FRONTMATTER_SETTINGS } from '../../frontmatter/frontmatter'
import { DEFAULT_CUSTOM_THEME_PALETTE } from '../../settings/defaults'
import type { AppState, FrontmatterSettings, SettingsSection, Space, StorageProfileStatus } from '../../types/app'
import { SettingsPage } from './SettingsPage'

const space: Space = {
  id: 'space-1',
  name: 'Space',
  settings: { autoRemoveDeletedDays: 30 },
  data: {
    activeTabId: 'tab-1',
    tabs: [{ id: 'tab-1', title: 'Tab', noteBodyId: 'body-1', homeContent: '', activeSubTabId: null, subTabs: [] }],
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
    noteBodies: [{ id: 'body-1', frontmatter: null, aisles: [{ id: 'aisle-1', markdown: '' }] }],
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
      customThemePalette: null,
      noteCursorLocations: {},
    },
  }
}

function renderSettingsPage(
  frontmatterDraft: FrontmatterSettings,
  frontmatterDraftDirty: boolean,
  options: {
    section?: SettingsSection
    state?: AppState
    storageProfileStatus?: StorageProfileStatus | null
  } = {},
) {
  const state = options.state ?? createState()
  return renderToStaticMarkup(
    <SettingsPage
      state={state}
      section={options.section ?? 'frontmatter'}
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
      customThemePaletteDraft={state.ui.customThemePalette ?? DEFAULT_CUSTOM_THEME_PALETTE}
      showParentHomeTabDraft
      tableAddTargetModeDraft={state.ui.tableAddTargetMode}
      tableDeleteTargetModeDraft={state.ui.tableDeleteTargetMode}
      frontmatterDraft={frontmatterDraft}
      frontmatterDraftDirty={frontmatterDraftDirty}
      storageProfileStatus={options.storageProfileStatus ?? null}
      onSectionChange={() => undefined}
      onToggleShortcutEdit={() => undefined}
      onNewlineShortcutChange={() => undefined}
      onOpenShortcutMenuSettings={() => undefined}
      onMouseBackForwardChange={() => undefined}
      onGenericHistoryHotkeysChange={() => undefined}
      onAutoRemoveDaysChange={() => undefined}
      onExportSpace={() => undefined}
      onExportAll={() => undefined}
      onThemeChange={() => undefined}
      onCustomThemePaletteChange={() => undefined}
      onCustomThemePaletteReset={() => undefined}
      onCustomThemePaletteSeedFromCurrentTheme={() => undefined}
      onTabButtonScaleChange={() => undefined}
      onNoteFontScaleChange={() => undefined}
      onShowParentHomeTabChange={() => undefined}
      onTableAddTargetModeChange={() => undefined}
      onTableDeleteTargetModeChange={() => undefined}
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
  it('renders settings tabs in alphabetical order with toolbar included', () => {
    const html = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, { section: 'hotkeys' })

    expect(html).toContain('>toolbar</button>')
    expect(html.indexOf('>data</button>')).toBeLessThan(html.indexOf('>frontmatter</button>'))
    expect(html.indexOf('>frontmatter</button>')).toBeLessThan(html.indexOf('>hotkeys</button>'))
    expect(html.indexOf('>hotkeys</button>')).toBeLessThan(html.indexOf('>misc</button>'))
    expect(html.indexOf('>misc</button>')).toBeLessThan(html.indexOf('>shortcuts</button>'))
    expect(html.indexOf('>shortcuts</button>')).toBeLessThan(html.indexOf('>toolbar</button>'))
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

  it('renders custom theme palette controls when the custom theme is selected', () => {
    const state = createState()
    state.theme = 'custom'
    state.ui.customThemePalette = {
      ...DEFAULT_CUSTOM_THEME_PALETTE,
      primary: '#8844cc',
    }
    const html = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, { section: 'visuals', state })

    expect(html).toContain('>custom</button>')
    expect(html).toContain('aria-label="custom theme palette"')
    expect(html).toContain('aria-label="primary color swatch"')
    expect(html).toContain('aria-label="primary hex value"')
    expect(html).not.toContain('type="color"')
    expect(html).toContain('value="#8844cc"')
    expect(html).not.toContain('copy to custom')
    expect(html).toContain('reset palette')
  })

  it('shows the copy-to-custom action only for built-in themes', () => {
    const html = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, { section: 'visuals' })

    expect(html).toContain('copy to custom')
    expect(html).not.toContain('seed from current theme')
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

  it('renders a toolbar settings panel placeholder', () => {
    const html = renderSettingsPage(DEFAULT_FRONTMATTER_SETTINGS, false, { section: 'toolbar' })

    expect(html).toContain('aria-selected="true" class="settings-section-tab is-active">toolbar</button>')
    expect(html).toContain('role="tabpanel" aria-label="toolbar settings"')
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
