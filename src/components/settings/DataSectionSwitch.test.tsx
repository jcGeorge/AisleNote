import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DataSectionSwitch } from './DataSectionSwitch'

describe('DataSectionSwitch', () => {
  it('renders the data section radios with the selected state', () => {
    const html = renderToStaticMarkup(
      <DataSectionSwitch dataSection="storage" onDataSectionChange={() => undefined} />,
    )

    expect(html).toContain('id="settings-data-section-label"')
    expect(html).toContain('role="radiogroup" aria-labelledby="settings-data-section-label"')
    expect(html).toContain('aria-checked="false" class="settings-segmented-option ">transfer</button>')
    expect(html).toContain('aria-checked="false" class="settings-segmented-option ">settings</button>')
    expect(html).toContain('aria-checked="true" class="settings-segmented-option is-selected">notebook</button>')
    expect(html).toContain('aria-checked="false" class="settings-segmented-option ">trash</button>')
  })
})
