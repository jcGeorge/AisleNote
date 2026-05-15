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
} from '../../settings/defaults'
import { FRONTMATTER_COMPUTED_VALUES, FRONTMATTER_FIELD_TYPES } from '../../frontmatter/frontmatter'
import type {
  AppState,
  AppTheme,
  FrontmatterTemplate,
  FrontmatterTemplateField,
  NewlineOperationId,
  NewlineShortcutId,
  SettingsSection,
  ShortcutId,
} from '../../types/app'

const THEME_OPTIONS: Array<{ id: AppTheme; label: string }> = [
  { id: 'dark', label: 'dark' },
  { id: 'light', label: 'light' },
  { id: 'dawn', label: 'dawn' },
  { id: 'blues', label: 'blues' },
]

const NEWLINE_SHORTCUT_ROWS: Array<{ id: NewlineShortcutId; label: string }> = [
  { id: 'controlEnter', label: 'aisle shortcut' },
  { id: 'shiftEnter', label: 'task shortcut' },
  { id: 'commandEnter', label: 'menu shortcut' },
]

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
  showParentHomeTabDraft: boolean
  onSectionChange: (section: SettingsSection) => void
  onToggleShortcutEdit: (shortcutId: ShortcutId) => void
  onNewlineShortcutChange: (shortcutId: NewlineShortcutId, operation: NewlineOperationId) => void
  onOpenNewlineMenuSettings: () => void
  onMouseBackForwardChange: (enabled: boolean) => void
  onGenericHistoryHotkeysChange: (enabled: boolean) => void
  onAutoRemoveDaysChange: (value: string, commit?: boolean) => void
  onExportSpace: (spaceId: string) => void
  onExportAll: () => void
  onThemeChange: (theme: AppTheme) => void
  onTabButtonScaleChange: (value: string) => void
  onNoteFontScaleChange: (value: string) => void
  onShowParentHomeTabChange: (enabled: boolean) => void
  onActiveFrontmatterTemplateChange: (templateId: string) => void
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
  showParentHomeTabDraft,
  onSectionChange,
  onToggleShortcutEdit,
  onNewlineShortcutChange,
  onOpenNewlineMenuSettings,
  onMouseBackForwardChange,
  onGenericHistoryHotkeysChange,
  onAutoRemoveDaysChange,
  onExportSpace,
  onExportAll,
  onThemeChange,
  onTabButtonScaleChange,
  onNoteFontScaleChange,
  onShowParentHomeTabChange,
  onActiveFrontmatterTemplateChange,
  onCreateFrontmatterTemplate,
  onUpdateFrontmatterTemplate,
  onDeleteFrontmatterTemplate,
  onAddFrontmatterTemplateField,
  onUpdateFrontmatterTemplateField,
  onDeleteFrontmatterTemplateField,
}: SettingsPageProps) {
  const activeFrontmatterTemplate =
    state.frontmatter.templates.find((template) => template.id === state.frontmatter.activeTemplateId) ??
    state.frontmatter.templates[0]

  return (
    <section className="settings-page-wrap">
      <div className="settings-page-card">
        <div className="settings-section-tabs" role="tablist" aria-label="settings sections">
          {(['hotkeys', 'shortcuts', 'data', 'visuals', 'frontmatter'] as SettingsSection[]).map((settingsSection) => (
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
              <button type="button" className="btn btn-sm settings-action-btn" onClick={onOpenNewlineMenuSettings}>
                configure
              </button>
            </div>
            <p className="settings-help">numbered menu entries use 1-9, then 0.</p>
          </div>
        )}

        {section === 'data' && (
          <div className="settings-section-panel" role="tabpanel">
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
                show parent home tab with the other sub-tabs
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
            <p className="settings-help">
              when enabled, a locked <code>home</code> sub-tab appears first. it cannot be renamed or deleted.
            </p>
          </div>
        )}

        {section === 'frontmatter' && (
          <div className="settings-section-panel" role="tabpanel">
            <div className="settings-hotkey-row">
              <label className="settings-hotkey-label" htmlFor="settings-frontmatter-template">
                template
              </label>
              <select
                id="settings-frontmatter-template"
                className="settings-select-input settings-shortcut-select"
                value={activeFrontmatterTemplate?.id ?? ''}
                onChange={(event) => onActiveFrontmatterTemplateChange(event.target.value)}
              >
                {state.frontmatter.templates.map((template) => (
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
                disabled={!activeFrontmatterTemplate || state.frontmatter.templates.length <= 1}
              >
                delete template
              </button>
            </div>

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
                  {activeFrontmatterTemplate.fields.map((field) => (
                    <div key={field.id} className="frontmatter-template-field-row">
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
                        onChange={(event) =>
                          onUpdateFrontmatterTemplateField(activeFrontmatterTemplate.id, field.id, {
                            type: event.target.value as FrontmatterTemplateField['type'],
                          })
                        }
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
                        {FRONTMATTER_COMPUTED_VALUES.map((computed) => (
                          <option key={computed} value={computed}>
                            {computed}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        className="settings-text-input frontmatter-default-input"
                        value={field.defaultValue}
                        aria-label="frontmatter default value"
                        placeholder="default"
                        onChange={(event) =>
                          onUpdateFrontmatterTemplateField(activeFrontmatterTemplate.id, field.id, {
                            defaultValue: event.target.value,
                          })
                        }
                      />
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
      </div>
    </section>
  )
}
