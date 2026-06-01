import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { StorageAlertHost } from './StorageAlertHost'

describe('StorageAlertHost', () => {
  it('renders nothing without alerts', () => {
    const html = renderToStaticMarkup(<StorageAlertHost alerts={[]} onDismissAlert={() => undefined} />)

    expect(html).toBe('')
  })

  it('renders persistent alert cards with close buttons', () => {
    const html = renderToStaticMarkup(
      <StorageAlertHost
        alerts={[
          {
            signature: 'alert-1',
            label: 'linked aisle mirror conflict',
            message: 'Linked aisle mirror files were edited differently outside the app.',
            detail: 'Used notes/example.md. Ignored notes/other.md.',
          },
        ]}
        onDismissAlert={vi.fn()}
      />,
    )

    expect(html).toContain('app-storage-alert-layer')
    expect(html).toContain('app-storage-alert-card')
    expect(html).toContain('role="alert"')
    expect(html).toContain('Close linked aisle mirror conflict')
    expect(html).toContain('Used notes/example.md')
  })
})
