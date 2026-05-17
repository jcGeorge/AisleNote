import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEFAULT_FRONTMATTER_SETTINGS } from '../../frontmatter/frontmatter'
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
      tabButtonScale: 1,
      noteFontScale: 1,
      noteCursorLocations: {},
    },
  }
}

function renderSettingsPage(
  frontmatterDraft: FrontmatterSettings,
  frontmatterDraftDirty: boolean,
  options: {
    section?: SettingsSection
    storageProfileStatus?: StorageProfileStatus | null
  } = {},
) {
  return renderToStaticMarkup(
    <SettingsPage
      state={createState()}
      section={options.section ?? 'frontmatter'}
      isMacPlatform={false}
      shortcutDrafts={{
        toggleTabTrash: '',
        openDomains: '',
        openSpaces: '',
        newTab: '',
        newSubTab: '',
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
      showParentHomeTabDraft
      frontmatterDraft={frontmatterDraft}
      frontmatterDraftDirty={frontmatterDraftDirty}
      storageProfileStatus={options.storageProfileStatus ?? null}
      onSectionChange={() => undefined}
      onToggleShortcutEdit={() => undefined}
      onNewlineShortcutChange={() => undefined}
      onOpenNewlineMenuSettings={() => undefined}
      onMouseBackForwardChange={() => undefined}
      onGenericHistoryHotkeysChange={() => undefined}
      onAutoRemoveDaysChange={() => undefined}
      onExportSpace={() => undefined}
      onExportAll={() => undefined}
      onThemeChange={() => undefined}
      onTabButtonScaleChange={() => undefined}
      onNoteFontScaleChange={() => undefined}
      onShowParentHomeTabChange={() => undefined}
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
