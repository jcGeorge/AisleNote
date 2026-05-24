import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CUSTOM_THEME_PALETTE } from '../../settings/defaults'
import type {
  AppTheme,
  CustomThemeId,
  CustomThemePalette,
  CustomThemePaletteSlot,
  VisualsSettingsSection,
} from '../../types/app'
import { CustomThemeEditor } from './CustomThemeEditor'

function renderEditor({
  theme = 'custom1',
  visualsSection = 'theming',
  selectedCustomTheme = 'custom1',
  palette = DEFAULT_CUSTOM_THEME_PALETTE,
}: {
  theme?: AppTheme
  visualsSection?: VisualsSettingsSection
  selectedCustomTheme?: CustomThemeId
  palette?: CustomThemePalette
} = {}) {
  return renderToStaticMarkup(
    <CustomThemeEditor
      theme={theme}
      visualsSection={visualsSection}
      selectedCustomTheme={selectedCustomTheme}
      customThemePaletteDraft={palette}
      onVisualsSectionChange={() => undefined}
      onThemeChange={() => undefined}
      onSelectedCustomThemeChange={() => undefined}
      onCustomThemePaletteChange={(_slot: CustomThemePaletteSlot, _value: string) => undefined}
      onCustomThemePaletteReset={() => undefined}
      onCustomThemePaletteSeedFromCurrentTheme={() => undefined}
    />,
  )
}

describe('CustomThemeEditor', () => {
  it('renders custom theme selectors, palette slots, swatches, and hex inputs', () => {
    const html = renderEditor({
      palette: {
        ...DEFAULT_CUSTOM_THEME_PALETTE,
        primary: '#8844cc',
      },
    })

    expect(html).toContain('aria-label="theme palette"')
    expect(html).toContain('aria-checked="true" class="settings-segmented-option is-selected">theming</button>')
    expect(html).toContain('>other visuals</button>')
    expect(html).toContain('role="radiogroup" aria-labelledby="settings-theme-label"')
    expect(html).toContain('aria-label="custom theme"')
    expect(html).toContain('<option value="custom1" selected="">custom 1</option>')
    expect(html).toContain('<option value="custom2">custom 2</option>')
    expect(html).toContain('<option value="custom3">custom 3</option>')
    expect(html).toContain('aria-label="primary color swatch"')
    expect(html).toContain('aria-label="primary hex value"')
    expect(html).toContain('aria-label="domain color swatch"')
    expect(html).toContain('aria-label="space color swatch"')
    expect(html).toContain('aria-label="parent tab color swatch"')
    expect(html).toContain('aria-label="sub tab color swatch"')
    expect(html).not.toContain('type="color"')
    expect(html).toContain('value="#8844cc"')
    expect(html).toContain('value="#a95429"')
    expect(html).toContain('value="#997b28"')
    expect(html).toContain('value="#2f5da8"')
    expect(html).toContain('value="#2f8a5f"')
    expect(html).not.toContain('copy to custom 1')
    expect(html).toContain('reset palette')
  })

  it('renders the copy-to-custom action for built-in themes', () => {
    const html = renderEditor({ theme: 'dawn', selectedCustomTheme: 'custom2' })

    expect(html).toContain('aria-checked="true" class="theme-switch-option is-selected">dawn</button>')
    expect(html).toContain('<option value="custom2" selected="">custom 2</option>')
    expect(html).toContain('copy to custom 2')
    expect(html).toContain('reset palette')
  })
})
