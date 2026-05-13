import { APP_COMMANDS } from '../../commands/app-commands'
import { formatShortcutLabel } from '../../hotkeys/shortcuts'
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
import type { AppState, AppTheme, SettingsSection, ShortcutId } from '../../types/app'

const THEME_OPTIONS: Array<{ id: AppTheme; label: string }> = [
  { id: 'dark', label: 'dark' },
  { id: 'light', label: 'light' },
  { id: 'dawn', label: 'dawn' },
  { id: 'blues', label: 'blues' },
]

type SettingsPageProps = {
  state: AppState
  section: SettingsSection
  isMacPlatform: boolean
  shortcutDrafts: Record<ShortcutId, string>
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
  onMouseBackForwardChange: (enabled: boolean) => void
  onGenericHistoryHotkeysChange: (enabled: boolean) => void
  onAutoRemoveDaysChange: (value: string, commit?: boolean) => void
  onExportSpace: (spaceId: string) => void
  onExportAll: () => void
  onThemeChange: (theme: AppTheme) => void
  onTabButtonScaleChange: (value: string) => void
  onNoteFontScaleChange: (value: string) => void
  onShowParentHomeTabChange: (enabled: boolean) => void
}

export function SettingsPage({
  state,
  section,
  isMacPlatform,
  shortcutDrafts,
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
  onMouseBackForwardChange,
  onGenericHistoryHotkeysChange,
  onAutoRemoveDaysChange,
  onExportSpace,
  onExportAll,
  onThemeChange,
  onTabButtonScaleChange,
  onNoteFontScaleChange,
  onShowParentHomeTabChange,
}: SettingsPageProps) {
  return (
    <section className="settings-page-wrap">
      <div className="settings-page-card">
        <div className="settings-section-tabs" role="tablist" aria-label="settings sections">
          {(['hotkeys', 'data', 'visuals'] as SettingsSection[]).map((settingsSection) => (
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
      </div>
    </section>
  )
}
