import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { VisualsSectionSwitch } from './VisualsSectionSwitch'

describe('VisualsSectionSwitch', () => {
  it('renders the visuals section radios with the selected state', () => {
    const html = renderToStaticMarkup(
      <VisualsSectionSwitch visualsSection="otherVisuals" onVisualsSectionChange={() => undefined} />,
    )

    expect(html).toContain('id="settings-visuals-section-label"')
    expect(html).toContain('role="radiogroup" aria-labelledby="settings-visuals-section-label"')
    expect(html).toContain('aria-checked="false" class="settings-segmented-option ">theming</button>')
    expect(html).toContain('aria-checked="true" class="settings-segmented-option is-selected">other visuals</button>')
  })
})
