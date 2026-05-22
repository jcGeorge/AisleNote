import { useEffect, useState } from 'react'
import { APP_COMMANDS } from '../../commands/app-commands'
import {
  formatFixedNewlineShortcutLabel,
  formatShortcutLabel,
  NEWLINE_OPERATION_LABELS,
  NEWLINE_OPERATIONS,
} from '../../hotkeys/shortcuts'
import {
  MAX_AUTO_REMOVE_DAYS,
  MAX_NOTE_FONT_SCALE,
  MAX_TAB_BUTTON_SCALE,
  MIN_AUTO_REMOVE_DAYS,
  MIN_NOTE_FONT_SCALE,
  MIN_TAB_BUTTON_SCALE,
  NOTE_FONT_SCALE_STEP,
  TAB_BUTTON_SCALE_STEP,
  CUSTOM_THEME_PALETTE_SLOTS,
  DEFAULT_CUSTOM_THEME_PALETTE,
  SETTINGS_SECTIONS,
  normalizeHexColor,
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
  CustomThemePalette,
  CustomThemePaletteSlot,
  FrontmatterSettings,
  FrontmatterTemplate,
  FrontmatterTemplateField,
  NewlineOperationId,
  NewlineShortcutId,
  SettingsSection,
  ShortcutId,
  StorageProfileStatus,
  TableControlTargetMode,
  TipId,
  ToolbarLayout,
} from '../../types/app'
import { CustomThemeColorPicker } from './CustomThemeColorPicker'
import { ToolbarSettingsPanel } from './ToolbarSettingsPanel'

const THEME_OPTIONS: Array<{ id: AppTheme; label: string }> = [
  { id: 'dark', label: 'dark' },
  { id: 'light', label: 'light' },
  { id: 'dawn', label: 'dawn' },
  { id: 'blues', label: 'blues' },
  { id: 'custom', label: 'custom' },
]

const CUSTOM_THEME_SLOT_LABELS: Record<CustomThemePaletteSlot, string> = {
  canvas: 'canvas',
  page: 'page',
  surface: 'surface',
  surfaceRaised: 'surface raised',
  text: 'text',
  mutedText: 'muted text',
  border: 'border',
  primary: 'primary',
  secondary: 'secondary',
  danger: 'danger',
  warning: 'warning',
  success: 'success',
}

const NEWLINE_SHORTCUT_ROWS: Array<{ id: NewlineShortcutId; label: string }> = [
  { id: 'controlEnter', label: 'aisle shortcut' },
  { id: 'shiftEnter', label: 'task shortcut' },
  { id: 'commandEnter', label: 'menu shortcut' },
]

const TABLE_CONTROL_TARGET_OPTIONS: Array<{ id: TableControlTargetMode; label: string }> = [
  { id: 'active-cell', label: 'at active cell' },
  { id: 'bottom-right', label: 'bottom right' },
]

function isFrontmatterBooleanTrue(value: string) {
  const normalized = value.trim().toLowerCase()
  return normalized === 'true' || normalized === 'yes' || normalized === 'on' || normalized === '1'
}

type SettingsPageProps = {
  state: AppState
  section: SettingsSection
  isMacPlatform: boolean
  shortcutDrafts: Record<ShortcutId, string>
  newlineShortcutDrafts: Record<NewlineShortcutId, NewlineOperationId>
  editingShortcut: ShortcutId | null
  mouseBackForwardEnabled: boolean
  genericHistoryHotkeysEnabled: boolean
  settingsDaysDraft: string
  activeSpaceId: string
  exportStatus: string
  tabButtonScaleDraft: number
  noteFontScaleDraft: number
  customThemePaletteDraft: CustomThemePalette
  showParentHomeTabDraft: boolean
  alwaysShowSpacesDraft: boolean
  alwaysShowDomainsDraft: boolean
  tableAddTargetModeDraft: TableControlTargetMode
  tableDeleteTargetModeDraft: TableControlTargetMode
  frontmatterDraft: FrontmatterSettings
  frontmatterDraftDirty: boolean
  toolbarLayouts: ToolbarLayout[]
  toolbarEditorLayoutId: string
  toolbarEditorShowNames: boolean
  storageProfileStatus: StorageProfileStatus | null
  onSectionChange: (section: SettingsSection) => void
  onToggleShortcutEdit: (shortcutId: ShortcutId) => void
  onNewlineShortcutChange: (shortcutId: NewlineShortcutId, operation: NewlineOperationId) => void
  onOpenShortcutMenuSettings: () => void
  onMouseBackForwardChange: (enabled: boolean) => void
  onGenericHistoryHotkeysChange: (enabled: boolean) => void
  onAutoRemoveDaysChange: (value: string, commit?: boolean) => void
  onExportSpace: (spaceId: string) => void
  onExportAll: () => void
  onThemeChange: (theme: AppTheme) => void
  onCustomThemePaletteChange: (slot: CustomThemePaletteSlot, value: string) => void
  onCustomThemePaletteReset: () => void
  onCustomThemePaletteSeedFromCurrentTheme: () => void
  onTabButtonScaleChange: (value: string) => void
  onNoteFontScaleChange: (value: string) => void
  onShowParentHomeTabChange: (enabled: boolean) => void
  onAlwaysShowSpacesChange: (enabled: boolean) => void
  onAlwaysShowDomainsChange: (enabled: boolean) => void
  onTableAddTargetModeChange: (mode: TableControlTargetMode) => void
  onTableDeleteTargetModeChange: (mode: TableControlTargetMode) => void
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
  onChooseStorageFolder: () => void
  onMoveStorageProfile: () => void
  onRevealStorageProfile: () => void
  onRetryStorageProfile: () => void
  onRestoreStorageRecoverySnapshot: () => void
}

export function SettingsPage({
  state,
  section,
  isMacPlatform,
  shortcutDrafts,
  newlineShortcutDrafts,
  editingShortcut,
  mouseBackForwardEnabled,
  genericHistoryHotkeysEnabled,
  settingsDaysDraft,
  activeSpaceId,
  exportStatus,
  tabButtonScaleDraft,
  noteFontScaleDraft,
  customThemePaletteDraft,
  showParentHomeTabDraft,
  alwaysShowSpacesDraft,
  alwaysShowDomainsDraft,
  tableAddTargetModeDraft,
  tableDeleteTargetModeDraft,
  frontmatterDraft,
  frontmatterDraftDirty,
  toolbarLayouts,
  toolbarEditorLayoutId,
  toolbarEditorShowNames,
  storageProfileStatus,
  onSectionChange,
  onToggleShortcutEdit,
  onNewlineShortcutChange,
  onOpenShortcutMenuSettings,
  onMouseBackForwardChange,
  onGenericHistoryHotkeysChange,
  onAutoRemoveDaysChange,
  onExportSpace,
  onExportAll,
  onThemeChange,
  onCustomThemePaletteChange,
  onCustomThemePaletteReset,
  onCustomThemePaletteSeedFromCurrentTheme,
  onTabButtonScaleChange,
  onNoteFontScaleChange,
  onShowParentHomeTabChange,
  onAlwaysShowSpacesChange,
  onAlwaysShowDomainsChange,
  onTableAddTargetModeChange,
  onTableDeleteTargetModeChange,
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
  onChooseStorageFolder,
  onMoveStorageProfile,
  onRevealStorageProfile,
  onRetryStorageProfile,
  onRestoreStorageRecoverySnapshot,
}: SettingsPageProps) {
  const [activeColorPickerSlot, setActiveColorPickerSlot] = useState<CustomThemePaletteSlot | null>(null)
  const activeFrontmatterTemplate =
    frontmatterDraft.templates.find((template) => template.id === frontmatterDraft.settingsTemplateId) ??
    frontmatterDraft.templates[0]
  const storageHealth =
    storageProfileStatus?.health ?? (storageProfileStatus?.status === 'error' ? 'error' : 'healthy')
  const storageIssues = storageProfileStatus?.issues ?? []
  const storageProfileCardClassName = [
    'storage-profile-card',
    storageHealth === 'error' ? 'is-error' : '',
    storageHealth === 'warning' ? 'is-warning' : '',
  ].filter(Boolean).join(' ')
  const getPaletteColorPickerValue = (slot: CustomThemePaletteSlot) =>
    normalizeHexColor(customThemePaletteDraft[slot]) ?? DEFAULT_CUSTOM_THEME_PALETTE[slot]

  useEffect(() => {
    if (section !== 'visuals') setActiveColorPickerSlot(null)
  }, [section])

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
        <div className="settings-segmented-control" role="radiogroup" aria-labelledby={labelId}>
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

  return (
    <section className="settings-page-wrap">
      <div className="settings-page-card">
        <div className="settings-section-tabs" role="tablist" aria-label="settings sections">
          {SETTINGS_SECTIONS.map((settingsSection) => (
            <button
              key={settingsSection}
              type="button"
              role="tab"
              aria-selected={section === settingsSection}
              className={`settings-section-tab ${section === settingsSection ? 'is-active' : ''}`}
              onClick={() => onSectionChange(settingsSection)}
            >
              {settingsSection}
            </button>
          ))}
        </div>

        {section === 'hotkeys' && (
          <div className="settings-section-panel" role="tabpanel">
            <p>hotkeys ({isMacPlatform ? 'mac' : 'windows'}):</p>
            <p className="settings-help">synced profile settings</p>
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
            <p className="settings-help">select a hotkey to enter new combination, escape to cancel.</p>
            <div className="settings-hotkey-row">
              <label className="settings-hotkey-label" htmlFor="settings-mouse-back-forward">
                enable mouse back/forward buttons
              </label>
              <div className="form-check form-switch settings-switch">
                <input
                  id="settings-mouse-back-forward"
                  className="form-check-input"
                  type="checkbox"
                  role="switch"
                  checked={mouseBackForwardEnabled}
                  onChange={(event) => onMouseBackForwardChange(event.target.checked)}
                />
              </div>
            </div>
            <div className="settings-hotkey-row">
              <label className="settings-hotkey-label" htmlFor="settings-generic-history-hotkeys">
                enable generic back/forward hotkeys
              </label>
              <div className="form-check form-switch settings-switch">
                <input
                  id="settings-generic-history-hotkeys"
                  className="form-check-input"
                  type="checkbox"
                  role="switch"
                  checked={genericHistoryHotkeysEnabled}
                  onChange={(event) => onGenericHistoryHotkeysChange(event.target.checked)}
                />
              </div>
            </div>
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
            <p className="settings-help">numbered menu entries use 1-9, then 0.</p>
          </div>
        )}

        {section === 'data' && (
          <div className="settings-section-panel" role="tabpanel">
            <p>cloud and storage:</p>
            <p className="settings-help">notes, arrangement, and synced profile settings live in this folder.</p>
            <div className={storageProfileCardClassName}>
              <div className="storage-profile-row">
                <span className="settings-hotkey-label">current folder</span>
                <code className="storage-profile-path">
                  {storageProfileStatus?.profileRootPath ?? 'desktop storage unavailable'}
                </code>
              </div>
              <div className="storage-profile-row">
                <span className="settings-hotkey-label">status</span>
                <span>{storageProfileStatus ? (storageProfileStatus.status === 'ready' ? 'ready' : 'error') : 'browser local'}</span>
              </div>
              <div className="storage-profile-row">
                <span className="settings-hotkey-label">health</span>
                <span>{storageProfileStatus ? storageHealth : 'local'}</span>
              </div>
              <div className="storage-profile-row">
                <span className="settings-hotkey-label">schema</span>
                <span>{storageProfileStatus?.schemaVersion ?? 'n/a'}</span>
              </div>
              <div className="storage-profile-row">
                <span className="settings-hotkey-label">writable</span>
                <span>{storageProfileStatus ? (storageProfileStatus.canWrite ? 'yes' : 'paused') : 'browser local'}</span>
              </div>
              <div className="storage-profile-row">
                <span className="settings-hotkey-label">recovery snapshots</span>
                <span>{storageProfileStatus?.recoverySnapshotCount ?? 0}</span>
              </div>
              {storageProfileStatus?.error && <p className="settings-help storage-profile-error">{storageProfileStatus.error}</p>}
              {storageIssues.length > 0 && (
                <div className="storage-profile-issues" aria-label="storage health issues">
                  {storageIssues.map((issue, index) => (
                    <p
                      key={`${issue.code}-${issue.path ?? index}`}
                      className={`settings-help storage-profile-issue ${issue.severity === 'error' ? 'is-error' : 'is-warning'}`}
                    >
                      {issue.message}
                      {issue.path ? ` (${issue.path})` : ''}
                    </p>
                  ))}
                </div>
              )}
              <div className="settings-page-actions">
                <button type="button" className="btn btn-sm settings-action-btn" onClick={onChooseStorageFolder}>
                  choose sync folder
                </button>
                <button type="button" className="btn btn-sm settings-action-btn" onClick={onMoveStorageProfile}>
                  move current data
                </button>
                <button type="button" className="btn btn-sm settings-action-btn" onClick={onRevealStorageProfile}>
                  reveal folder
                </button>
                <button type="button" className="btn btn-sm settings-action-btn" onClick={onExportAll}>
                  export backup
                </button>
                <button
                  type="button"
                  className="btn btn-sm settings-action-btn"
                  onClick={onRetryStorageProfile}
                >
                  retry
                </button>
                <button
                  type="button"
                  className="btn btn-sm settings-action-btn"
                  onClick={onRestoreStorageRecoverySnapshot}
                  disabled={!storageProfileStatus || (storageProfileStatus.recoverySnapshotCount ?? 0) <= 0}
                >
                  restore latest snapshot
                </button>
              </div>
              <p className="settings-help">
                choose a local iCloud Drive, Dropbox, OneDrive, Google Drive, or plain folder; tabs stores a portable
                <code>notes-data</code> profile inside it.
              </p>
            </div>
            <div className="settings-divider" />
            <p>automatically remove deleted items after:</p>
            <div className="settings-field-row">
              <input
                type="number"
                className="settings-number-input settings-number-input-half"
                min={MIN_AUTO_REMOVE_DAYS}
                max={MAX_AUTO_REMOVE_DAYS}
                step={1}
                value={settingsDaysDraft}
                onChange={(event) => onAutoRemoveDaysChange(event.target.value)}
                onBlur={() => onAutoRemoveDaysChange(settingsDaysDraft, true)}
              />
              <span className="settings-field-suffix">days</span>
            </div>
            <div className="settings-divider" />
            <div className="settings-page-actions">
              <button type="button" className="btn btn-sm settings-action-btn" onClick={() => onExportSpace(activeSpaceId)}>
                export space
              </button>
              <button type="button" className="btn btn-sm settings-action-btn" onClick={onExportAll}>
                export all
              </button>
            </div>
            <p className="settings-help">exports convert internal tab markers to four spaces for clean markdown files.</p>
            {exportStatus && <p className="settings-help">{exportStatus}</p>}
          </div>
        )}

        {section === 'visuals' && (
          <div className="settings-section-panel" role="tabpanel">
            <p className="settings-help">theme settings sync with your notes profile; size sliders are this-device settings.</p>
            <div className="settings-hotkey-row">
              <span className="settings-hotkey-label" id="settings-theme-label">
                theme
              </span>
              <div className="theme-switch" role="radiogroup" aria-labelledby="settings-theme-label">
                {THEME_OPTIONS.map((theme) => (
                  <button
                    key={theme.id}
                    type="button"
                    role="radio"
                    aria-checked={state.theme === theme.id}
                    className={`theme-switch-option ${state.theme === theme.id ? 'is-selected' : ''}`}
                    onClick={() => onThemeChange(theme.id)}
                  >
                    {theme.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="custom-theme-editor" aria-label="custom theme palette">
              <div className="custom-theme-editor-header">
                <span className="settings-hotkey-label">custom palette</span>
                <div className="custom-theme-actions">
                  {state.theme !== 'custom' && (
                    <button
                      type="button"
                      className="btn btn-sm settings-action-btn"
                      onClick={onCustomThemePaletteSeedFromCurrentTheme}
                    >
                      copy to custom
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-sm settings-action-btn"
                    onClick={onCustomThemePaletteReset}
                  >
                    reset palette
                  </button>
                </div>
              </div>
              <div className="custom-theme-grid">
                {CUSTOM_THEME_PALETTE_SLOTS.map((slot) => (
                  <div className="custom-theme-slot" key={slot}>
                    <span className="custom-theme-slot-label">{CUSTOM_THEME_SLOT_LABELS[slot]}</span>
                    <CustomThemeColorPicker
                      slotId={slot}
                      label={CUSTOM_THEME_SLOT_LABELS[slot]}
                      value={getPaletteColorPickerValue(slot)}
                      fallbackValue={DEFAULT_CUSTOM_THEME_PALETTE[slot]}
                      isOpen={activeColorPickerSlot === slot}
                      onToggle={() => setActiveColorPickerSlot((current) => (current === slot ? null : slot))}
                      onClose={() => setActiveColorPickerSlot((current) => (current === slot ? null : current))}
                      onChange={(value) => onCustomThemePaletteChange(slot, value)}
                    />
                    <input
                      className="settings-text-input custom-theme-hex-input"
                      type="text"
                      value={customThemePaletteDraft[slot]}
                      spellCheck={false}
                      inputMode="text"
                      aria-label={`${CUSTOM_THEME_SLOT_LABELS[slot]} hex value`}
                      onChange={(event) => onCustomThemePaletteChange(slot, event.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>
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
            <div className="settings-hotkey-row">
              <label
                className="settings-hotkey-label"
                htmlFor="settings-show-parent-home-tab"
                title='adds a fixed first sub-tab named "home" for each parent tab.'
              >
                show the parent's home tab with the other sub-tabs
              </label>
              <div className="form-check form-switch settings-switch">
                <input
                  id="settings-show-parent-home-tab"
                  className="form-check-input"
                  type="checkbox"
                  role="switch"
                  checked={showParentHomeTabDraft}
                  onChange={(event) => onShowParentHomeTabChange(event.target.checked)}
                />
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
            <p className="settings-help">synced profile settings</p>
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
            <p className="settings-help">template changes apply only after saving.</p>

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
                        title={field.computed !== 'none' ? 'computed values cannot be manually changed.' : undefined}
                        aria-label={field.computed !== 'none' ? 'computed values cannot be manually changed.' : undefined}
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
            <p className="settings-help">synced profile settings</p>
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
          </div>
        )}

        {section === 'tips' && (
          <div className="settings-section-panel" role="tabpanel" aria-label="tips settings">
            <p className="settings-help">seen tips are this-device settings; disabled tips sync with your notes profile.</p>
            {state.ui.seenTipIds.length === 0 ? (
              <p className="settings-help">tips you have seen will appear here.</p>
            ) : (
              <div className="settings-hotkeys-list">
                {state.ui.seenTipIds.map((tipId) => {
                  const tip = getTipDefinition(tipId)
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
            <p className="settings-help">toolbar layouts sync with your notes profile; the active toolbar is this-device.</p>
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
