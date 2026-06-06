import { useState } from 'react'
import {
  CUSTOM_THEME_PALETTE_SLOTS,
  DEFAULT_CUSTOM_THEME_PALETTE,
  isCustomTheme,
  normalizeHexColor,
} from '../../settings/defaults'
import { parseThemeSettingsImport, serializeThemeSettings } from '../../settings/theme-transfer'
import type {
  AppTheme,
  CustomThemeId,
  CustomThemePalette,
  CustomThemePaletteSlot,
  VisualsSettingsSection,
} from '../../types/app'
import { CustomThemeColorPicker } from './CustomThemeColorPicker'
import { VisualsSectionSwitch } from './VisualsSectionSwitch'

const THEME_OPTIONS: Array<{ id: AppTheme; label: string }> = [
  { id: 'dark', label: 'dark' },
  { id: 'light', label: 'light' },
  { id: 'dawn', label: 'dawn' },
]

const CUSTOM_THEME_OPTIONS: Array<{ id: CustomThemeId; label: string }> = [
  { id: 'custom1', label: 'custom 1' },
  { id: 'custom2', label: 'custom 2' },
  { id: 'custom3', label: 'custom 3' },
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
  tagText: 'tag font',
  tagBg: 'tag back',
  tooltipPrimary: 'tooltip primary',
  tooltipSecondary: 'tooltip secondary',
  domainRail: 'domain',
  spaceRail: 'space',
  parentRail: 'parent tab',
  subtabRail: 'sub tab',
}

type CustomThemeEditorProps = {
  theme: AppTheme
  visualsSection: VisualsSettingsSection
  selectedCustomTheme: CustomThemeId
  customThemePaletteDraft: CustomThemePalette
  onVisualsSectionChange: (section: VisualsSettingsSection) => void
  onThemeChange: (theme: AppTheme) => void
  onSelectedCustomThemeChange: (theme: CustomThemeId) => void
  onCustomThemePaletteChange: (slot: CustomThemePaletteSlot, value: string) => void
  onCustomThemePaletteImport: (palette: CustomThemePalette) => void
  onCustomThemePaletteReset: () => void
  onCustomThemePaletteSeedFromCurrentTheme: () => void
}

function getCustomThemeLabel(theme: CustomThemeId) {
  return CUSTOM_THEME_OPTIONS.find((option) => option.id === theme)?.label ?? 'custom 1'
}

function getPaletteColorPickerValue(palette: CustomThemePalette, slot: CustomThemePaletteSlot) {
  return normalizeHexColor(palette[slot]) ?? DEFAULT_CUSTOM_THEME_PALETTE[slot]
}

export function CustomThemeEditor({
  theme,
  visualsSection,
  selectedCustomTheme,
  customThemePaletteDraft,
  onVisualsSectionChange,
  onThemeChange,
  onSelectedCustomThemeChange,
  onCustomThemePaletteChange,
  onCustomThemePaletteImport,
  onCustomThemePaletteReset,
  onCustomThemePaletteSeedFromCurrentTheme,
}: CustomThemeEditorProps) {
  const [activeColorPickerSlot, setActiveColorPickerSlot] = useState<CustomThemePaletteSlot | null>(null)
  const [themeJsonModal, setThemeJsonModal] = useState<'export' | 'import' | null>(null)
  const [themeImportJson, setThemeImportJson] = useState('')
  const [themeTransferStatus, setThemeTransferStatus] = useState('')
  const getPaletteValue = (slot: CustomThemePaletteSlot) => getPaletteColorPickerValue(customThemePaletteDraft, slot)
  const exportedThemeJson = serializeThemeSettings(customThemePaletteDraft)

  const closeThemeJsonModal = () => {
    setThemeJsonModal(null)
    setThemeTransferStatus('')
  }

  const copyExportedThemeJson = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard text writes are unavailable.')
      await navigator.clipboard.writeText(exportedThemeJson)
      setThemeTransferStatus('Theme JSON copied.')
    } catch {
      setThemeTransferStatus('Could not copy theme JSON.')
    }
  }

  const importThemeJson = () => {
    const result = parseThemeSettingsImport(themeImportJson, customThemePaletteDraft)
    if (!result.ok) {
      setThemeTransferStatus(result.error)
      return
    }

    onCustomThemePaletteImport(result.palette)
    setThemeImportJson('')
    setThemeTransferStatus('Theme JSON imported.')
  }

  return (
    <div className="custom-theme-editor" aria-label="theme palette">
      <VisualsSectionSwitch
        visualsSection={visualsSection}
        onVisualsSectionChange={onVisualsSectionChange}
      />
      <div className="settings-hotkey-row settings-theme-selection-row">
        <span className="settings-hotkey-label" id="settings-theme-label">
          theme
        </span>
        <div className="theme-selection-controls">
          <div className="theme-switch" role="radiogroup" aria-labelledby="settings-theme-label">
            {THEME_OPTIONS.map((themeOption) => (
              <button
                key={themeOption.id}
                type="button"
                role="radio"
                aria-checked={theme === themeOption.id}
                className={`theme-switch-option ${theme === themeOption.id ? 'is-selected' : ''}`}
                onClick={() => onThemeChange(themeOption.id)}
              >
                {themeOption.label}
              </button>
            ))}
          </div>
          <select
            className="settings-select-input custom-theme-select"
            value={selectedCustomTheme}
            aria-label="custom theme"
            onChange={(event) => onSelectedCustomThemeChange(event.target.value as CustomThemeId)}
          >
            {CUSTOM_THEME_OPTIONS.map((themeOption) => (
              <option key={themeOption.id} value={themeOption.id}>
                {themeOption.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="custom-theme-editor-header">
        <span className="settings-hotkey-label">theme palette</span>
        <div className="custom-theme-actions">
          {!isCustomTheme(theme) && (
            <button
              type="button"
              className="btn btn-sm settings-action-btn"
              onClick={onCustomThemePaletteSeedFromCurrentTheme}
            >
              copy to {getCustomThemeLabel(selectedCustomTheme)}
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
              value={getPaletteValue(slot)}
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
      <div className="custom-theme-transfer-actions">
        <button
          type="button"
          className="btn btn-sm settings-action-btn"
          onClick={() => {
            setThemeJsonModal('export')
            setThemeTransferStatus('')
          }}
        >
          export json
        </button>
        <button
          type="button"
          className="btn btn-sm settings-action-btn"
          onClick={() => {
            setThemeJsonModal('import')
            setThemeTransferStatus('')
          }}
        >
          import json
        </button>
      </div>
      {themeJsonModal && (
        <div
          className="delete-modal-backdrop custom-theme-json-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeThemeJsonModal()
          }}
        >
          <div
            className="delete-modal settings-modal custom-theme-json-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="custom-theme-json-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id="custom-theme-json-modal-title">
              {themeJsonModal === 'export' ? 'export json' : 'import json'}
            </h2>
            <textarea
              id={themeJsonModal === 'export' ? 'custom-theme-export-json' : 'custom-theme-import-json'}
              className="settings-text-input custom-theme-json-textarea"
              value={themeJsonModal === 'export' ? exportedThemeJson : themeImportJson}
              readOnly={themeJsonModal === 'export'}
              spellCheck={false}
              onChange={(event) => {
                if (themeJsonModal !== 'import') return
                setThemeImportJson(event.target.value)
                setThemeTransferStatus('')
              }}
            />
            {themeTransferStatus && <p className="settings-help custom-theme-json-status">{themeTransferStatus}</p>}
            <div className="delete-modal-actions custom-theme-json-modal-actions">
              <button
                type="button"
                className="btn btn-sm settings-action-btn modal-cancel-btn"
                onClick={closeThemeJsonModal}
              >
                close
              </button>
              {themeJsonModal === 'export' ? (
                <button
                  type="button"
                  className="btn btn-sm settings-action-btn modal-primary-btn"
                  onClick={() => void copyExportedThemeJson()}
                >
                  copy json
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-sm settings-action-btn modal-primary-btn"
                  onClick={importThemeJson}
                  disabled={themeImportJson.trim().length === 0}
                >
                  import json
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
