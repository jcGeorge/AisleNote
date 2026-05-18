import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
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

    expect(html).toContain('class="custom-color-picker-panel"')
    expect(html).toContain('aria-label="primary saturation and darkness"')
    expect(html).toContain('aria-label="primary hue"')
    expect(html).toContain('aria-label="primary picker hex value"')
    expect(html).toContain('aria-label="copy primary hex"')
    expect(html).toContain('#2f67de')
  })
})
