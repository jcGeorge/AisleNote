import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CUSTOM_THEME_PALETTE } from '../../settings/defaults'
import { shouldCloseGenericBackdropFromGesture } from '../overlays/modal-behavior'
import type {
  AppTheme,
  CustomThemeId,
  CustomThemePalette,
  VisualsSettingsSection,
} from '../../types/app'
import { CustomThemeEditor } from './CustomThemeEditor'

const componentDir = dirname(fileURLToPath(import.meta.url))

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
      onCustomThemePaletteChange={() => undefined}
      onCustomThemePaletteImport={() => undefined}
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
        tagText: '#315577',
        tagBg: '#dce6f6',
        tooltipPrimary: '#ccddee',
        tooltipSecondary: '#667788',
      },
    })

    expect(html).toContain('aria-label="theme palette"')
    expect(html).toContain('aria-checked="true" class="settings-segmented-option is-selected">theming</button>')
    expect(html).toContain('>other visuals</button>')
    expect(html).toContain('role="radiogroup" aria-labelledby="settings-theme-label"')
    expect(html.match(/class="theme-switch-option/g)).toHaveLength(3)
    expect(html).toContain('>dark</button>')
    expect(html).toContain('>light</button>')
    expect(html).toContain('>dawn</button>')
    expect(html).toContain('aria-label="custom theme"')
    expect(html).toContain('<option value="custom1" selected="">custom 1</option>')
    expect(html).toContain('<option value="custom2">custom 2</option>')
    expect(html).toContain('<option value="custom3">custom 3</option>')
    expect(html).toContain('aria-label="primary color swatch"')
    expect(html).toContain('aria-label="primary hex value"')
    expect(html).toContain('aria-label="tag font color swatch"')
    expect(html).toContain('aria-label="tag font hex value"')
    expect(html).toContain('aria-label="tag back color swatch"')
    expect(html).toContain('aria-label="tag back hex value"')
    expect(html).toContain('aria-label="tooltip primary color swatch"')
    expect(html).toContain('aria-label="tooltip primary hex value"')
    expect(html).toContain('aria-label="tooltip secondary color swatch"')
    expect(html).toContain('aria-label="tooltip secondary hex value"')
    expect(html).toContain('aria-label="domain color swatch"')
    expect(html).toContain('aria-label="space color swatch"')
    expect(html).toContain('aria-label="parent tab color swatch"')
    expect(html).toContain('aria-label="sub tab color swatch"')
    expect(html).not.toContain('type="color"')
    expect(html).toContain('value="#8844cc"')
    expect(html).toContain('value="#315577"')
    expect(html).toContain('value="#dce6f6"')
    expect(html).toContain('value="#ccddee"')
    expect(html).toContain('value="#667788"')
    expect(html).toContain('value="#a95429"')
    expect(html).toContain('value="#997b28"')
    expect(html).toContain('value="#2f5da8"')
    expect(html).toContain('value="#2f8a5f"')
    expect(html).not.toContain('copy to custom 1')
    expect(html).toContain('reset palette')
    expect(html).toContain('export json')
    expect(html).toContain('import json')
  })

  it('renders the copy-to-custom action for built-in themes', () => {
    const html = renderEditor({ theme: 'dawn', selectedCustomTheme: 'custom2' })

    expect(html).toContain('aria-checked="true" class="theme-switch-option is-selected">dawn</button>')
    expect(html).toContain('<option value="custom2" selected="">custom 2</option>')
    expect(html).toContain('copy to custom 2')
    expect(html).toContain('reset palette')
  })

  it('uses a complete backdrop gesture for the json modal', () => {
    expect(shouldCloseGenericBackdropFromGesture({ startedOnBackdrop: true, endedOnBackdrop: true })).toBe(true)
    expect(shouldCloseGenericBackdropFromGesture({ startedOnBackdrop: false, endedOnBackdrop: true })).toBe(false)
    expect(shouldCloseGenericBackdropFromGesture({ startedOnBackdrop: true, endedOnBackdrop: false })).toBe(false)

    const source = readFileSync(join(componentDir, 'CustomThemeEditor.tsx'), 'utf8')
    expect(source).toContain('onMouseDown={(event) => {')
    expect(source).toContain('shouldCloseGenericBackdropFromGesture')
    expect(source).not.toContain('if (event.target === event.currentTarget) closeThemeJsonModal()')
  })
})
