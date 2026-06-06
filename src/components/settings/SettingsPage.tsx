import { useState } from 'react'
import { APP_COMMANDS } from '../../commands/app-commands'
import {
  formatFixedNewlineShortcutLabel,
  formatShortcutLabel,
  NEWLINE_OPERATION_LABELS,
  NEWLINE_OPERATIONS,
} from '../../hotkeys/shortcuts'
import {
  MAX_NOTE_FONT_SCALE,
  MAX_TAB_BUTTON_SCALE,
  MAX_TOOLBAR_BUTTON_SCALE,
  MIN_NOTE_FONT_SCALE,
  MIN_TAB_BUTTON_SCALE,
  MIN_TOOLBAR_BUTTON_SCALE,
  NOTE_FONT_SCALE_STEP,
  TAB_BUTTON_SCALE_STEP,
  TOOLBAR_BUTTON_SCALE_STEP,
} from '../../settings/defaults'
import {
  FRONTMATTER_FIELD_TYPES,
  getFrontmatterDatePickerValue,
  getFrontmatterDatetimePickerValue,
  getFrontmatterDraftValueForType,
  getFrontmatterComputedValuesForFieldType,
  isFrontmatterComputedValueCompatibleWithFieldType,
} from '../../frontmatter/frontmatter'
import { getTipDefinition } from '../../tips/tips'
import type {
  AppState,
  AppTheme,
  CustomThemeId,
  CustomThemePalette,
  CustomThemePaletteSlot,
  DataSettingsSection,
  FrontmatterSettings,
  FrontmatterTemplate,
  FrontmatterTemplateField,
  NewlineOperationId,
  NewlineShortcutId,
  ScratchpadNewAisleSide,
  SettingsSection,
  ShortcutId,
  StorageProfileStatus,
  TableControlTargetMode,
  TableOfContentsScope,
  TabRenameEnterBehavior,
  TipId,
  ToolbarLayout,
  UserSettingsLocationStatus,
  VisualsSettingsSection,
} from '../../types/app'
import { MAX_SCRATCHPAD_AISLE_LIMIT, MIN_SCRATCHPAD_AISLE_LIMIT } from '../../state/scratchpad'
import { CustomThemeEditor } from './CustomThemeEditor'
import { DataSettingsPanel } from './DataSettingsPanel'
import { ThemePreview } from './ThemePreview'
import { ToolbarSettingsPanel } from './ToolbarSettingsPanel'
import { VisualsSectionSwitch } from './VisualsSectionSwitch'
import type {
  SyncedUiBooleanSettingKey,
  SyncedUiBooleanSettingView,
} from '../../settings/synced-ui-settings-registry.js'
import type { DataPlatformCapabilities } from '../../platform/data-platform'
import {
  DEFAULT_THEME_PREVIEW_RAIL_SELECTION,
  DEFAULT_THEME_PREVIEW_TASK_STATE,
  selectThemePreviewRailSample,
  toggleThemePreviewTaskState,
  type ThemePreviewRail,
  type ThemePreviewRailSample,
  type ThemePreviewRailSelection,
  type ThemePreviewTask,
  type ThemePreviewTaskState,
} from './theme-preview-state'

const NEWLINE_SHORTCUT_ROWS: Array<{ id: NewlineShortcutId; label: string }> = [
  { id: 'controlEnter', label: 'aisle shortcut' },
  { id: 'shiftEnter', label: 'task shortcut' },
  { id: 'commandEnter', label: 'menu shortcut' },
]

const TABLE_CONTROL_TARGET_OPTIONS: Array<{ id: TableControlTargetMode; label: string }> = [
  { id: 'active-cell', label: 'at active cell' },
  { id: 'bottom-right', label: 'bottom right' },
]

const TABLE_OF_CONTENTS_SCOPE_OPTIONS: Array<{ id: TableOfContentsScope; label: string }> = [
  { id: 'all-aisles', label: 'all aisles' },
  { id: 'focused-aisle', label: 'focused aisle' },
]

const TAB_RENAME_ENTER_BEHAVIOR_OPTIONS: Array<{ id: TabRenameEnterBehavior; label: string }> = [
  { id: 'goes-to-note', label: 'goes to note' },
  { id: 'creates-another-tab', label: 'creates another tab' },
]

const SCRATCHPAD_NEW_AISLE_SIDE_OPTIONS: Array<{ id: ScratchpadNewAisleSide; label: string }> = [
  { id: 'left', label: 'left' },
  { id: 'right', label: 'right' },
]

function isFrontmatterBooleanTrue(value: string) {
  const normalized = value.trim().toLowerCase()
  return normalized === 'true' || normalized === 'yes' || normalized === 'on' || normalized === '1'
}

type SettingsPageProps = {
  state: AppState
  section: SettingsSection
  dataSection: DataSettingsSection
  visualsSection: VisualsSettingsSection
  isMacPlatform: boolean
  shortcutDrafts: Record<ShortcutId, string>
  newlineShortcutDrafts: Record<NewlineShortcutId, NewlineOperationId>
  editingShortcut: ShortcutId | null
  settingsDaysDraft: string
  exportStatus: string
  importStatus: string
  tabButtonScaleDraft: number
  noteFontScaleDraft: number
  toolbarButtonScaleDraft: number
  selectedCustomTheme: CustomThemeId
  customThemePaletteDraft: CustomThemePalette
  alwaysShowSpacesDraft: boolean
  alwaysShowDomainsDraft: boolean
  tableAddTargetModeDraft: TableControlTargetMode
  tableDeleteTargetModeDraft: TableControlTargetMode
  tableOfContentsScopeDraft: TableOfContentsScope
  scratchpadAisleLimitDraft: string
  scratchpadNewAisleSideDraft: ScratchpadNewAisleSide
  tabRenameEnterBehaviorDraft: TabRenameEnterBehavior
  miscSyncedUiBooleanSettings: SyncedUiBooleanSettingView[]
  frontmatterDraft: FrontmatterSettings
  frontmatterDraftDirty: boolean
  toolbarLayouts: ToolbarLayout[]
  toolbarEditorLayoutId: string
  toolbarEditorShowNames: boolean
  dataCapabilities: DataPlatformCapabilities
  storageProfileStatus: StorageProfileStatus | null
  userSettingsLocationStatus: UserSettingsLocationStatus | null
  onDataSectionChange: (section: DataSettingsSection) => void
  onVisualsSectionChange: (section: VisualsSettingsSection) => void
  onToggleShortcutEdit: (shortcutId: ShortcutId) => void
  onNewlineShortcutChange: (shortcutId: NewlineShortcutId, operation: NewlineOperationId) => void
  onOpenShortcutMenuSettings: () => void
  onAutoRemoveDaysChange: (value: string, commit?: boolean) => void
  onExportUserSettings: () => void
  onImportNotebook: () => void
  onImportUserSettings: () => void
  onImportUserSettingsFromNotebookFolder: () => void
  onRevealUserSettingsFolder: () => void
  onResetUserSettingsFolder: () => void
  onResetUserSettingsToDefaults: () => void
  onThemeChange: (theme: AppTheme) => void
  onSelectedCustomThemeChange: (theme: CustomThemeId) => void
  onCustomThemePaletteChange: (slot: CustomThemePaletteSlot, value: string) => void
  onCustomThemePaletteImport: (palette: CustomThemePalette) => void
  onCustomThemePaletteReset: () => void
  onCustomThemePaletteSeedFromCurrentTheme: () => void
  onTabButtonScaleChange: (value: string) => void
  onNoteFontScaleChange: (value: string) => void
  onToolbarButtonScaleChange: (value: string) => void
  onAlwaysShowSpacesChange: (enabled: boolean) => void
  onAlwaysShowDomainsChange: (enabled: boolean) => void
  onTableAddTargetModeChange: (mode: TableControlTargetMode) => void
  onTableDeleteTargetModeChange: (mode: TableControlTargetMode) => void
  onTableOfContentsScopeChange: (scope: TableOfContentsScope) => void
  onScratchpadAisleLimitChange: (value: string, commit?: boolean) => void
  onScratchpadNewAisleSideChange: (side: ScratchpadNewAisleSide) => void
  onTabRenameEnterBehaviorChange: (behavior: TabRenameEnterBehavior) => void
  onSyncedUiBooleanSettingChange: (key: SyncedUiBooleanSettingKey, enabled: boolean) => void
  onTipEnabledChange: (tipId: TipId, enabled: boolean) => void
  onSelectToolbarLayout: (layoutId: string) => void
  onCreateToolbarLayout: () => void
  onDuplicateToolbarLayout: (layoutId: string) => void
  onRenameToolbarLayout: (layoutId: string, name: string) => void
  onDeleteToolbarLayout: (layoutId: string) => void
  onAddToolbarTool: (layoutId: string, toolId: string, targetIndex?: number) => void
  onAddToolbarSpacer: (layoutId: string, targetIndex?: number) => void
  onRemoveToolbarItem: (layoutId: string, itemId: string) => void
  onMoveToolbarItem: (layoutId: string, itemId: string, direction: 'up' | 'down') => void
  onMoveToolbarItemToIndex: (layoutId: string, itemId: string, targetIndex: number) => void
  onToolbarEditorShowNamesChange: (enabled: boolean) => void
  onReadOnlyToolbarEditAttempt: () => void
  onSettingsFrontmatterTemplateChange: (templateId: string) => void
  onCreateFrontmatterTemplate: () => void
  onUpdateFrontmatterTemplate: (templateId: string, patch: Partial<Pick<FrontmatterTemplate, 'name'>>) => void
  onDeleteFrontmatterTemplate: (templateId: string) => void
  onAddFrontmatterTemplateField: (templateId: string) => void
  onUpdateFrontmatterTemplateField: (
    templateId: string,
    fieldId: string,
    patch: Partial<FrontmatterTemplateField>,
  ) => void
  onDeleteFrontmatterTemplateField: (templateId: string, fieldId: string) => void
  onSaveFrontmatterTemplates: () => void
  onDiscardFrontmatterTemplateChanges: () => void
  onCreateNotebook: () => void
  onRenameNotebook: () => void
  onOpenNotebook: () => void
  onSwitchNotebook: (notebookPath: string) => void
  onForgetNotebook: (notebookPath: string) => void
  onMoveStorageProfile: () => void
  onRevealStorageProfile: () => void
  onRetryStorageProfile: () => void
}

export function SettingsPage({
  state,
  section,
  dataSection,
  visualsSection,
  isMacPlatform,
  shortcutDrafts,
  newlineShortcutDrafts,
  editingShortcut,
  settingsDaysDraft,
  exportStatus,
  importStatus,
  tabButtonScaleDraft,
  noteFontScaleDraft,
  toolbarButtonScaleDraft,
  selectedCustomTheme,
  customThemePaletteDraft,
  alwaysShowSpacesDraft,
  alwaysShowDomainsDraft,
  tableAddTargetModeDraft,
  tableDeleteTargetModeDraft,
  tableOfContentsScopeDraft,
  scratchpadAisleLimitDraft,
  scratchpadNewAisleSideDraft,
  tabRenameEnterBehaviorDraft,
  miscSyncedUiBooleanSettings,
  frontmatterDraft,
  frontmatterDraftDirty,
  toolbarLayouts,
  toolbarEditorLayoutId,
  toolbarEditorShowNames,
  dataCapabilities,
  storageProfileStatus,
  userSettingsLocationStatus,
  onDataSectionChange,
  onVisualsSectionChange,
  onToggleShortcutEdit,
  onNewlineShortcutChange,
  onOpenShortcutMenuSettings,
  onAutoRemoveDaysChange,
  onExportUserSettings,
  onImportNotebook,
  onImportUserSettings,
  onImportUserSettingsFromNotebookFolder,
  onRevealUserSettingsFolder,
  onResetUserSettingsFolder,
  onResetUserSettingsToDefaults,
  onThemeChange,
  onSelectedCustomThemeChange,
  onCustomThemePaletteChange,
  onCustomThemePaletteImport,
  onCustomThemePaletteReset,
  onCustomThemePaletteSeedFromCurrentTheme,
  onTabButtonScaleChange,
  onNoteFontScaleChange,
  onToolbarButtonScaleChange,
  onAlwaysShowSpacesChange,
  onAlwaysShowDomainsChange,
  onTableAddTargetModeChange,
  onTableDeleteTargetModeChange,
  onTableOfContentsScopeChange,
  onScratchpadAisleLimitChange,
  onScratchpadNewAisleSideChange,
  onTabRenameEnterBehaviorChange,
  onSyncedUiBooleanSettingChange,
  onTipEnabledChange,
  onSelectToolbarLayout,
  onCreateToolbarLayout,
  onDuplicateToolbarLayout,
  onRenameToolbarLayout,
  onDeleteToolbarLayout,
  onAddToolbarTool,
  onAddToolbarSpacer,
  onRemoveToolbarItem,
  onMoveToolbarItem,
  onMoveToolbarItemToIndex,
  onToolbarEditorShowNamesChange,
  onReadOnlyToolbarEditAttempt,
  onSettingsFrontmatterTemplateChange,
  onCreateFrontmatterTemplate,
  onUpdateFrontmatterTemplate,
  onDeleteFrontmatterTemplate,
  onAddFrontmatterTemplateField,
  onUpdateFrontmatterTemplateField,
  onDeleteFrontmatterTemplateField,
  onSaveFrontmatterTemplates,
  onDiscardFrontmatterTemplateChanges,
  onCreateNotebook,
  onRenameNotebook,
  onOpenNotebook,
  onSwitchNotebook,
  onForgetNotebook,
  onMoveStorageProfile,
  onRevealStorageProfile,
  onRetryStorageProfile,
}: SettingsPageProps) {
  const [themePreviewRailSelection, setThemePreviewRailSelection] = useState<ThemePreviewRailSelection>(
    DEFAULT_THEME_PREVIEW_RAIL_SELECTION,
  )
  const [themePreviewTasks, setThemePreviewTasks] = useState<ThemePreviewTaskState>(DEFAULT_THEME_PREVIEW_TASK_STATE)
  const activeFrontmatterTemplate =
    frontmatterDraft.templates.find((template) => template.id === frontmatterDraft.settingsTemplateId) ??
    frontmatterDraft.templates[0]
  const selectThemePreviewRail = (rail: ThemePreviewRail, sample: ThemePreviewRailSample) => {
    setThemePreviewRailSelection((previous) => selectThemePreviewRailSample(previous, rail, sample))
  }

  const toggleThemePreviewTask = (task: ThemePreviewTask) => {
    setThemePreviewTasks((previous) => toggleThemePreviewTaskState(previous, task))
  }

  const renderFrontmatterDefaultControl = (templateId: string, field: FrontmatterTemplateField) => {
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
              onUpdateFrontmatterTemplateField(templateId, field.id, {
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
            onUpdateFrontmatterTemplateField(templateId, field.id, {
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
          onUpdateFrontmatterTemplateField(templateId, field.id, {
            defaultValue: event.target.value,
          })
        }
      />
    )
  }

  const renderTableControlTargetSetting = (
    label: string,
    value: TableControlTargetMode,
    onChange: (mode: TableControlTargetMode) => void,
  ) => {
    const labelId = `settings-${label.replace(/\s+/g, '-')}-label`
    return (
      <div className="settings-hotkey-row">
        <span className="settings-hotkey-label" id={labelId}>
          {label}
        </span>
        <div className="settings-segmented-control settings-flag-segmented-control" role="radiogroup" aria-labelledby={labelId}>
          {TABLE_CONTROL_TARGET_OPTIONS.map((option) => (
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

  const renderTableOfContentsScopeSetting = () => {
    const labelId = 'settings-table-of-contents-shows-for-label'
    return (
      <div className="settings-hotkey-row">
        <span className="settings-hotkey-label" id={labelId}>
          table of contents shows for
        </span>
        <div className="settings-segmented-control settings-flag-segmented-control" role="radiogroup" aria-labelledby={labelId}>
          {TABLE_OF_CONTENTS_SCOPE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={tableOfContentsScopeDraft === option.id}
              className={`settings-segmented-option ${tableOfContentsScopeDraft === option.id ? 'is-selected' : ''}`}
              onClick={() => onTableOfContentsScopeChange(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  const renderTabRenameEnterBehaviorSetting = () => {
    const labelId = 'settings-tab-rename-enter-behavior-label'
    return (
      <div className="settings-hotkey-row">
        <span className="settings-hotkey-label" id={labelId}>
          pressing enter after typing tab name
        </span>
        <div className="settings-segmented-control settings-flag-segmented-control" role="radiogroup" aria-labelledby={labelId}>
          {TAB_RENAME_ENTER_BEHAVIOR_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={tabRenameEnterBehaviorDraft === option.id}
              className={`settings-segmented-option ${tabRenameEnterBehaviorDraft === option.id ? 'is-selected' : ''}`}
              onClick={() => onTabRenameEnterBehaviorChange(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  const renderScratchpadAisleLimitSetting = () => (
    <div className="settings-hotkey-row">
      <span className="settings-hotkey-label">scratchpad aisle limit</span>
      <div className="settings-field-row">
        <input
          type="number"
          className="settings-number-input settings-number-input-half"
          min={MIN_SCRATCHPAD_AISLE_LIMIT}
          max={MAX_SCRATCHPAD_AISLE_LIMIT}
          step={1}
          value={scratchpadAisleLimitDraft}
          onChange={(event) => onScratchpadAisleLimitChange(event.target.value)}
          onBlur={() => onScratchpadAisleLimitChange(scratchpadAisleLimitDraft, true)}
        />
        <span className="settings-field-suffix">aisles</span>
      </div>
    </div>
  )

  const renderScratchpadNewAisleSideSetting = () => {
    const labelId = 'settings-scratchpad-new-aisle-side-label'
    return (
      <div className="settings-hotkey-row">
        <span className="settings-hotkey-label" id={labelId}>
          command+n in scratch pad creates an aisle to the
        </span>
        <div className="settings-segmented-control settings-flag-segmented-control" role="radiogroup" aria-labelledby={labelId}>
          {SCRATCHPAD_NEW_AISLE_SIDE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={scratchpadNewAisleSideDraft === option.id}
              className={`settings-segmented-option ${scratchpadNewAisleSideDraft === option.id ? 'is-selected' : ''}`}
              onClick={() => onScratchpadNewAisleSideChange(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  const renderMiscSyncedUiBooleanSetting = (setting: SyncedUiBooleanSettingView) => {
    const label =
      setting.key === 'deleteActiveAisleShortcutEnabled'
        ? `${isMacPlatform ? 'command' : 'control'}+w deletes active aisle`
        : setting.label
    return (
      <div key={setting.key} className="settings-hotkey-row">
        <span className="settings-hotkey-label">{label}</span>
        <div className="form-check form-switch settings-switch">
          <input
            className="form-check-input"
            type="checkbox"
            role="switch"
            checked={setting.checked}
            aria-label={label}
            onChange={(event) => onSyncedUiBooleanSettingChange(setting.key, event.target.checked)}
          />
        </div>
      </div>
    )
  }

  return (
    <section className="settings-page-wrap">
      <div className="settings-page-card">
        {section === 'hotkeys' && (
          <div className="settings-section-panel" role="tabpanel">
            <p>hotkeys ({isMacPlatform ? 'mac' : 'windows'}):</p>
            <p className="settings-help">user settings</p>
            <div className="settings-hotkeys-list">
              {APP_COMMANDS.map(({ id: shortcutId, label }) => (
                <div key={shortcutId} className="settings-hotkey-row">
                  <span className="settings-hotkey-label">{label}</span>
                  <button
                    type="button"
                    className={`settings-shortcut-btn ${editingShortcut === shortcutId ? 'is-recording' : ''}`}
                    onClick={() => onToggleShortcutEdit(shortcutId)}
                  >
                    {editingShortcut === shortcutId ? 'press keys...' : formatShortcutLabel(shortcutDrafts[shortcutId], isMacPlatform)}
                  </button>
                </div>
              ))}
            </div>
            <p className="settings-help">Select a hotkey to enter new combination, escape to cancel.</p>
          </div>
        )}

        {section === 'shortcuts' && (
          <div className="settings-section-panel" role="tabpanel">
            <p>shortcuts ({isMacPlatform ? 'mac' : 'windows'}):</p>
            <div className="settings-hotkeys-list">
              {NEWLINE_SHORTCUT_ROWS.map((row) => (
                <label key={row.id} className="settings-hotkey-row" htmlFor={`settings-newline-${row.id}`}>
                  <span className="settings-hotkey-label">
                    {formatFixedNewlineShortcutLabel(row.id, isMacPlatform)}
                  </span>
                  <select
                    id={`settings-newline-${row.id}`}
                    className="settings-select-input settings-shortcut-select"
                    value={newlineShortcutDrafts[row.id]}
                    onChange={(event) => onNewlineShortcutChange(row.id, event.target.value as NewlineOperationId)}
                    aria-label={row.label}
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
              <button type="button" className="btn btn-sm settings-action-btn" onClick={onOpenShortcutMenuSettings}>
                configure
              </button>
            </div>
            <p className="settings-help">Numbered menu entries use 1-9, then 0.</p>
          </div>
        )}

        {section === 'data' && (
          <DataSettingsPanel
            dataSection={dataSection}
            settingsDaysDraft={settingsDaysDraft}
            exportStatus={exportStatus}
            importStatus={importStatus}
            dataCapabilities={dataCapabilities}
            storageProfileStatus={storageProfileStatus}
            userSettingsLocationStatus={userSettingsLocationStatus}
            onDataSectionChange={onDataSectionChange}
            onAutoRemoveDaysChange={onAutoRemoveDaysChange}
            onExportUserSettings={onExportUserSettings}
            onImportNotebook={onImportNotebook}
            onImportUserSettings={onImportUserSettings}
            onImportUserSettingsFromNotebookFolder={onImportUserSettingsFromNotebookFolder}
            onRevealUserSettingsFolder={onRevealUserSettingsFolder}
            onResetUserSettingsFolder={onResetUserSettingsFolder}
            onResetUserSettingsToDefaults={onResetUserSettingsToDefaults}
            onCreateNotebook={onCreateNotebook}
            onRenameNotebook={onRenameNotebook}
            onOpenNotebook={onOpenNotebook}
            onSwitchNotebook={onSwitchNotebook}
            onForgetNotebook={onForgetNotebook}
            onMoveStorageProfile={onMoveStorageProfile}
            onRevealStorageProfile={onRevealStorageProfile}
            onRetryStorageProfile={onRetryStorageProfile}
          />
        )}

        {section === 'visuals' && visualsSection === 'theming' && (
          <div className="settings-section-panel" role="tabpanel">
            <div className="visuals-theme-layout">
              <ThemePreview
                theme={state.theme}
                customThemePaletteDraft={customThemePaletteDraft}
                tabButtonScaleDraft={tabButtonScaleDraft}
                noteFontScaleDraft={noteFontScaleDraft}
                railSelection={themePreviewRailSelection}
                tasks={themePreviewTasks}
                onRailSampleSelect={selectThemePreviewRail}
                onTaskToggle={toggleThemePreviewTask}
              />
              <CustomThemeEditor
                theme={state.theme}
                visualsSection={visualsSection}
                selectedCustomTheme={selectedCustomTheme}
                customThemePaletteDraft={customThemePaletteDraft}
                onVisualsSectionChange={onVisualsSectionChange}
                onThemeChange={onThemeChange}
                onSelectedCustomThemeChange={onSelectedCustomThemeChange}
                onCustomThemePaletteChange={onCustomThemePaletteChange}
                onCustomThemePaletteImport={onCustomThemePaletteImport}
                onCustomThemePaletteReset={onCustomThemePaletteReset}
                onCustomThemePaletteSeedFromCurrentTheme={onCustomThemePaletteSeedFromCurrentTheme}
              />
            </div>
          </div>
        )}

        {section === 'visuals' && visualsSection === 'otherVisuals' && (
          <div className="settings-section-panel" role="tabpanel">
            <VisualsSectionSwitch
              visualsSection={visualsSection}
              onVisualsSectionChange={onVisualsSectionChange}
            />
            <div className="settings-hotkey-row settings-slider-row">
              <label className="settings-hotkey-label" htmlFor="settings-tab-button-scale">
                tab button size
              </label>
              <div className="settings-slider-wrap">
                <input
                  id="settings-tab-button-scale"
                  className="form-range settings-range-input"
                  type="range"
                  min={MIN_TAB_BUTTON_SCALE}
                  max={MAX_TAB_BUTTON_SCALE}
                  step={TAB_BUTTON_SCALE_STEP}
                  value={tabButtonScaleDraft}
                  onChange={(event) => onTabButtonScaleChange(event.target.value)}
                />
                <span className="settings-range-value">{Math.round(tabButtonScaleDraft * 100)}%</span>
              </div>
            </div>
            <div className="settings-hotkey-row settings-slider-row">
              <label className="settings-hotkey-label" htmlFor="settings-note-font-scale">
                note font size
              </label>
              <div className="settings-slider-wrap">
                <input
                  id="settings-note-font-scale"
                  className="form-range settings-range-input"
                  type="range"
                  min={MIN_NOTE_FONT_SCALE}
                  max={MAX_NOTE_FONT_SCALE}
                  step={NOTE_FONT_SCALE_STEP}
                  value={noteFontScaleDraft}
                  onChange={(event) => onNoteFontScaleChange(event.target.value)}
                />
                <span className="settings-range-value">{Math.round(noteFontScaleDraft * 100)}%</span>
              </div>
            </div>
            <div className="settings-hotkey-row settings-slider-row">
              <label className="settings-hotkey-label" htmlFor="settings-toolbar-button-scale">
                toolbar button size
              </label>
              <div className="settings-slider-wrap">
                <input
                  id="settings-toolbar-button-scale"
                  className="form-range settings-range-input"
                  type="range"
                  min={MIN_TOOLBAR_BUTTON_SCALE}
                  max={MAX_TOOLBAR_BUTTON_SCALE}
                  step={TOOLBAR_BUTTON_SCALE_STEP}
                  value={toolbarButtonScaleDraft}
                  onChange={(event) => onToolbarButtonScaleChange(event.target.value)}
                />
                <span className="settings-range-value">{Math.round(toolbarButtonScaleDraft * 100)}%</span>
              </div>
            </div>
            <div className="settings-hotkey-row">
              <label className="settings-hotkey-label" htmlFor="settings-always-show-spaces">
                always show spaces
              </label>
              <div className="form-check form-switch settings-switch">
                <input
                  id="settings-always-show-spaces"
                  className="form-check-input"
                  type="checkbox"
                  role="switch"
                  checked={alwaysShowSpacesDraft}
                  onChange={(event) => onAlwaysShowSpacesChange(event.target.checked)}
                />
              </div>
            </div>
            <div className="settings-hotkey-row">
              <label className="settings-hotkey-label" htmlFor="settings-always-show-domains">
                always show domains
              </label>
              <div className="form-check form-switch settings-switch">
                <input
                  id="settings-always-show-domains"
                  className="form-check-input"
                  type="checkbox"
                  role="switch"
                  checked={alwaysShowDomainsDraft}
                  onChange={(event) => onAlwaysShowDomainsChange(event.target.checked)}
                />
              </div>
            </div>
          </div>
        )}

        {section === 'frontmatter' && (
          <div className="settings-section-panel" role="tabpanel">
            <p className="settings-help">notebook metadata</p>
            <div className="settings-hotkey-row">
              <label className="settings-hotkey-label" htmlFor="settings-frontmatter-template">
                template
              </label>
              <select
                id="settings-frontmatter-template"
                className="settings-select-input settings-shortcut-select"
                value={activeFrontmatterTemplate?.id ?? ''}
                onChange={(event) => onSettingsFrontmatterTemplateChange(event.target.value)}
              >
                {frontmatterDraft.templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="settings-page-actions">
              <button type="button" className="btn btn-sm settings-action-btn" onClick={onCreateFrontmatterTemplate}>
                new template
              </button>
              <button
                type="button"
                className="btn btn-sm settings-action-btn"
                onClick={() => activeFrontmatterTemplate && onDeleteFrontmatterTemplate(activeFrontmatterTemplate.id)}
                disabled={!activeFrontmatterTemplate || frontmatterDraft.templates.length <= 1}
              >
                delete template
              </button>
              <button
                type="button"
                className="btn btn-sm settings-action-btn"
                onClick={onDiscardFrontmatterTemplateChanges}
                disabled={!frontmatterDraftDirty}
              >
                discard changes
              </button>
              <button
                type="button"
                className="btn btn-sm settings-action-btn"
                onClick={onSaveFrontmatterTemplates}
                disabled={!frontmatterDraftDirty}
              >
                save template
              </button>
            </div>
            <p className="settings-help">Template changes apply only after saving.</p>

            {activeFrontmatterTemplate && (
              <>
                <label className="settings-modal-field">
                  <span>name</span>
                  <input
                    type="text"
                    className="settings-text-input"
                    value={activeFrontmatterTemplate.name}
                    onChange={(event) => onUpdateFrontmatterTemplate(activeFrontmatterTemplate.id, { name: event.target.value })}
                  />
                </label>
                <div className="settings-divider" />
                <div className="frontmatter-template-fields">
                  <div className="frontmatter-template-field-row frontmatter-template-field-header" aria-hidden="true">
                    <span>key</span>
                    <span>type</span>
                    <span>computed</span>
                    <span>default</span>
                    <span>lock</span>
                    <span>action</span>
                  </div>
                  {activeFrontmatterTemplate.fields.map((field) => (
                    <div key={field.id} className={`frontmatter-template-field-row ${field.computed !== 'none' ? 'is-computed' : ''}`}>
                      <input
                        type="text"
                        className="settings-text-input frontmatter-key-input"
                        value={field.key}
                        aria-label="frontmatter key"
                        onChange={(event) =>
                          onUpdateFrontmatterTemplateField(activeFrontmatterTemplate.id, field.id, { key: event.target.value })
                        }
                      />
                      <select
                        className="settings-select-input frontmatter-type-select"
                        value={field.type}
                        aria-label="frontmatter type"
                        onChange={(event) => {
                          const type = event.target.value as FrontmatterTemplateField['type']
                          onUpdateFrontmatterTemplateField(activeFrontmatterTemplate.id, field.id, {
                            type,
                            defaultValue: type === 'boolean'
                              ? (isFrontmatterBooleanTrue(field.defaultValue) ? 'true' : 'false')
                              : type === 'date' || type === 'datetime'
                                ? getFrontmatterDraftValueForType(type, field.defaultValue)
                              : field.defaultValue,
                            computed: isFrontmatterComputedValueCompatibleWithFieldType(field.computed, type)
                              ? field.computed
                              : 'none',
                          })
                        }}
                      >
                        {FRONTMATTER_FIELD_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                      <select
                        className="settings-select-input frontmatter-computed-select"
                        value={field.computed}
                        aria-label="frontmatter computed value"
                        onChange={(event) =>
                          onUpdateFrontmatterTemplateField(activeFrontmatterTemplate.id, field.id, {
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
                      {renderFrontmatterDefaultControl(activeFrontmatterTemplate.id, field)}
                      <span
                        className={`frontmatter-computed-lock ${field.computed !== 'none' ? 'is-visible' : ''}`}
                        aria-label={field.computed !== 'none' ? 'Computed values cannot be manually changed.' : undefined}
                        data-app-tooltip={field.computed !== 'none' ? 'Computed values cannot be manually changed.' : undefined}
                      >
                        {field.computed !== 'none' ? 'lock' : ''}
                      </span>
                      <button
                        type="button"
                        className="btn btn-sm settings-action-btn"
                        onClick={() => onDeleteFrontmatterTemplateField(activeFrontmatterTemplate.id, field.id)}
                      >
                        remove
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn btn-sm settings-action-btn"
                  onClick={() => onAddFrontmatterTemplateField(activeFrontmatterTemplate.id)}
                >
                  add field
                </button>
              </>
            )}
          </div>
        )}

        {section === 'misc' && (
          <div className="settings-section-panel" role="tabpanel">
            {renderTableOfContentsScopeSetting()}
            {renderTabRenameEnterBehaviorSetting()}
            {miscSyncedUiBooleanSettings.map((setting) => renderMiscSyncedUiBooleanSetting(setting))}
            {renderTableControlTargetSetting(
              'add table row or column',
              tableAddTargetModeDraft,
              onTableAddTargetModeChange,
            )}
            {renderTableControlTargetSetting(
              'delete table row or column',
              tableDeleteTargetModeDraft,
              onTableDeleteTargetModeChange,
            )}
            <p className="settings-help settings-subsection-label">scratchpad</p>
            {renderScratchpadAisleLimitSetting()}
            {renderScratchpadNewAisleSideSetting()}
          </div>
        )}

        {section === 'tips' && (
          <div className="settings-section-panel" role="tabpanel" aria-label="tips settings">
            <p className="settings-help">Seen tips are this-device settings; disabled tips are user settings.</p>
            {state.ui.seenTipIds.length === 0 ? (
              <p className="settings-help">Tips you have seen will appear here.</p>
            ) : (
              <div className="settings-hotkeys-list">
                {state.ui.seenTipIds.map((tipId) => {
                  const tip = getTipDefinition(tipId, { isMacPlatform })
                  const enabled = !state.ui.disabledTipIds.includes(tipId)
                  return (
                    <div key={tipId} className="settings-hotkey-row settings-tip-row">
                      <div className="settings-tip-copy">
                        <span className="settings-hotkey-label">{tip.label}</span>
                        <span className="settings-help">{tip.message}</span>
                      </div>
                      <div className="form-check form-switch settings-switch">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          role="switch"
                          checked={enabled}
                          aria-label={`${tip.label} tip enabled`}
                          onChange={(event) => onTipEnabledChange(tipId, event.target.checked)}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {section === 'toolbar' && (
          <div className="settings-section-panel" role="tabpanel" aria-label="toolbar settings">
            <p className="settings-help">Toolbar layouts are user settings; the active toolbar is set per device.</p>
            <ToolbarSettingsPanel
              toolbarLayouts={toolbarLayouts}
              toolbarEditorLayoutId={toolbarEditorLayoutId}
              toolbarEditorShowNames={toolbarEditorShowNames}
              onSelectToolbarLayout={onSelectToolbarLayout}
              onCreateToolbarLayout={onCreateToolbarLayout}
              onDuplicateToolbarLayout={onDuplicateToolbarLayout}
              onRenameToolbarLayout={onRenameToolbarLayout}
              onDeleteToolbarLayout={onDeleteToolbarLayout}
              onAddToolbarTool={onAddToolbarTool}
              onAddToolbarSpacer={onAddToolbarSpacer}
              onRemoveToolbarItem={onRemoveToolbarItem}
              onMoveToolbarItem={onMoveToolbarItem}
              onMoveToolbarItemToIndex={onMoveToolbarItemToIndex}
              onToolbarEditorShowNamesChange={onToolbarEditorShowNamesChange}
              onReadOnlyToolbarEditAttempt={onReadOnlyToolbarEditAttempt}
            />
          </div>
        )}
      </div>
    </section>
  )
}
