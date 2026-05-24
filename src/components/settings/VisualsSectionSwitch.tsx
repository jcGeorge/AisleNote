import type { VisualsSettingsSection } from '../../types/app'

const VISUALS_SECTION_OPTIONS: Array<{ id: VisualsSettingsSection; label: string }> = [
  { id: 'theming', label: 'theming' },
  { id: 'otherVisuals', label: 'other visuals' },
]

type VisualsSectionSwitchProps = {
  visualsSection: VisualsSettingsSection
  onVisualsSectionChange: (section: VisualsSettingsSection) => void
}

export function VisualsSectionSwitch({
  visualsSection,
  onVisualsSectionChange,
}: VisualsSectionSwitchProps) {
  return (
    <div className="settings-hotkey-row">
      <span className="settings-hotkey-label" id="settings-visuals-section-label">
        visuals
      </span>
      <div className="settings-segmented-control" role="radiogroup" aria-labelledby="settings-visuals-section-label">
        {VISUALS_SECTION_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={visualsSection === option.id}
            className={`settings-segmented-option ${visualsSection === option.id ? 'is-selected' : ''}`}
            onClick={() => onVisualsSectionChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
