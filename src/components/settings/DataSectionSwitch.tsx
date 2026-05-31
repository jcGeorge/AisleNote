import type { DataSettingsSection } from '../../types/app'

const DATA_SECTION_OPTIONS: Array<{ id: DataSettingsSection; label: string }> = [
  { id: 'notebook', label: 'backup' },
  { id: 'settings', label: 'settings' },
  { id: 'storage', label: 'notebook' },
  { id: 'trash', label: 'trash' },
]

type DataSectionSwitchProps = {
  dataSection: DataSettingsSection
  onDataSectionChange: (section: DataSettingsSection) => void
}

export function DataSectionSwitch({
  dataSection,
  onDataSectionChange,
}: DataSectionSwitchProps) {
  return (
    <div className="settings-hotkey-row">
      <span className="settings-hotkey-label" id="settings-data-section-label">
        data
      </span>
      <div className="settings-segmented-control settings-data-section-control" role="radiogroup" aria-labelledby="settings-data-section-label">
        {DATA_SECTION_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={dataSection === option.id}
            className={`settings-segmented-option ${dataSection === option.id ? 'is-selected' : ''}`}
            onClick={() => onDataSectionChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
