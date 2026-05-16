import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEFAULT_FRONTMATTER_SETTINGS } from '../../frontmatter/frontmatter'
import type { AppState, FrontmatterSettings, Space } from '../../types/app'
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

function renderSettingsPage(frontmatterDraft: FrontmatterSettings, frontmatterDraftDirty: boolean) {
  return renderToStaticMarkup(
    <SettingsPage
      state={createState()}
      section="frontmatter"
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
      storageProfileStatus={null}
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
})
