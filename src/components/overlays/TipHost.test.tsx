import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { TIP_DEFINITIONS, getTipDefinition } from '../../tips/tips'
import { TipHost } from './TipHost'

describe('TipHost', () => {
  it('renders nothing without tips', () => {
    const html = renderToStaticMarkup(<TipHost tips={[]} onDismissTip={() => undefined} />)

    expect(html).toBe('')
  })

  it('renders persistent stacked tips with dismiss buttons', () => {
    const html = renderToStaticMarkup(
      <TipHost
        tips={TIP_DEFINITIONS.map((tip) => getTipDefinition(tip.id, { isMacPlatform: true }))}
        onDismissTip={vi.fn()}
      />,
    )

    expect(html).toContain('app-tip-layer')
    expect(html).toContain('app-tip-card')
    expect(html).toContain('Dismiss task undo tip')
    expect(html).toContain('Dismiss delete subtab shortcut tip')
    expect(html).toContain('Cmd+Z')
    expect(html).not.toContain('tab creation')
    expect(html).not.toContain('press Tab')
    expect(html).toContain('command+w')
  })
})
