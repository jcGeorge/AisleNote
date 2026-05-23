import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { getPickerPanelPlacement } from '../../settings/color-utils'
import { CustomThemeColorPicker } from './CustomThemeColorPicker'

function renderPicker(isOpen: boolean) {
  return renderToStaticMarkup(
    <CustomThemeColorPicker
      slotId="primary"
      label="primary"
      value="#2f67de"
      fallbackValue="#0b1528"
      isOpen={isOpen}
      onToggle={() => undefined}
      onClose={() => undefined}
      onChange={() => undefined}
    />,
  )
}

describe('CustomThemeColorPicker', () => {
  it('renders a swatch button without the app-controlled picker panel by default', () => {
    const html = renderPicker(false)

    expect(html).toContain('aria-label="primary color swatch"')
    expect(html).toContain('aria-controls="custom-theme-picker-primary"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('custom-color-picker-panel')
  })

  it('renders the saturation/darkness picker and hue slider when open', () => {
    const html = renderPicker(true)

    expect(html).toContain('custom-color-picker-panel')
    expect(html).toContain('aria-label="primary saturation and darkness"')
    expect(html).toContain('aria-label="primary hue"')
    expect(html).toContain('aria-label="primary picker hex value"')
    expect(html).toContain('aria-label="copy primary hex"')
    expect(html).toContain('#2f67de')
  })

  it('places the picker above the anchor by default', () => {
    expect(getPickerPanelPlacement({
      anchorX: 250,
      anchorY: 300,
      panelWidth: 320,
      panelHeight: 220,
      viewportWidth: 800,
      viewportHeight: 600,
    })).toMatchObject({
      placement: 'above',
      top: 72,
    })
  })

  it('places the picker below when the above placement would be cut off', () => {
    expect(getPickerPanelPlacement({
      anchorX: 250,
      anchorY: 120,
      panelWidth: 320,
      panelHeight: 220,
      viewportWidth: 800,
      viewportHeight: 600,
    }).placement).toBe('below')
  })

  it('clamps the picker horizontally inside the viewport', () => {
    expect(getPickerPanelPlacement({
      anchorX: 20,
      anchorY: 300,
      panelWidth: 320,
      panelHeight: 220,
      viewportWidth: 800,
      viewportHeight: 600,
    }).left).toBe(12)
  })
})
