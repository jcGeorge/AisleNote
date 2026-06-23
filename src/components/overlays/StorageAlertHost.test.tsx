import React from 'react'
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

  it('renders alert actions when provided', () => {
    const html = renderToStaticMarkup(
      <StorageAlertHost
        alerts={[
          {
            signature: 'recovery-1',
            label: 'notebook recovered',
            message: 'Tabs reset the notebook because the folder could not be loaded.',
            actionLabel: 'open previous notebook folder',
          },
        ]}
        onDismissAlert={vi.fn()}
        onAlertAction={vi.fn()}
      />,
    )

    expect(html).toContain('notebook recovered')
    expect(html).toContain('open previous notebook folder')
    expect(html).not.toContain('app-storage-alert-detail')
    expect(html).not.toContain('The previous folder was left untouched')
  })
})
