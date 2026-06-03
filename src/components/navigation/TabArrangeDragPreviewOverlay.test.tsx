import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { TabArrangeDragPreview } from '../../types/app'
import { getArrangeDragPreviewStyle } from './arrange-drag-preview-style'
import { TabArrangeDragPreviewOverlay } from './TabArrangeDragPreviewOverlay'

const navigationDir = dirname(fileURLToPath(import.meta.url))

const parentPreview: TabArrangeDragPreview = {
  item: { type: 'tab', tabId: 'parent-a' },
  label: 'Parent A',
  variant: 'parent',
  currentX: 100,
  currentY: 80,
  offsetX: 10,
  offsetY: 8,
  width: 120,
  height: 32,
}

const subtabPreview: TabArrangeDragPreview = {
  item: { type: 'subtab', parentTabId: 'parent-a', subTabId: 'sub-a' },
  label: 'Sub A',
  variant: 'subtab',
  currentX: 90,
  currentY: 70,
  offsetX: 9,
  offsetY: 7,
  width: 110,
  height: 30,
}

describe('tab arrange drag preview overlay', () => {
  it('mirrors rail font-scale variables into the drag preview portal', () => {
    const source = readFileSync(join(navigationDir, 'ArrangeDragPreviewPortal.tsx'), 'utf8')

    expect(source).toContain("'--tab-button-scale'")
    expect(source).toContain("'--note-font-scale'")
    expect(source).toContain("'--app-text-scale'")
    expect(source).toContain("'--rail-control-font-size'")
    expect(source).toContain("'--rail-control-line-height'")
    expect(source).toContain("'--rail-control-padding'")
    expect(source).toContain("'--rail-control-radius'")
  })

  it('computes viewport preview position from client coordinates and grab offset', () => {
    expect(getArrangeDragPreviewStyle(parentPreview)).toMatchObject({
      left: '90px',
      top: '72px',
      width: '120px',
      height: '32px',
    })
  })

  it('renders the parent drag preview with focused rail styling and position styles', () => {
    const html = renderToStaticMarkup(<TabArrangeDragPreviewOverlay preview={parentPreview} />)

    expect(html).toContain('class="arrange-preview-stack')
    expect(html).toContain('data-drag-count="1"')
    expect(html).toContain(
      'tab-arrange-preview is-parent tab-btn parent-tab-btn is-selected arrange-preview-card arrange-preview-primary',
    )
    expect(html).toContain('left:90px')
    expect(html).toContain('top:72px')
    expect(html).toContain('width:120px')
    expect(html).toContain('height:32px')
    expect(html).not.toContain('arrange-preview-ghost')
    expect(html).toContain('Parent A')
  })

  it('renders the sub-tab drag preview with focused rail styling', () => {
    const html = renderToStaticMarkup(<TabArrangeDragPreviewOverlay preview={subtabPreview} />)

    expect(html).toContain(
      'tab-arrange-preview is-subtab tab-btn subtab-btn is-selected arrange-preview-card arrange-preview-primary',
    )
    expect(html).toContain('left:81px')
    expect(html).toContain('top:63px')
    expect(html).toContain('Sub A')
  })

  it('renders one real ghost card per additional selected tab without moving the preview root', () => {
    const html = renderToStaticMarkup(
      <TabArrangeDragPreviewOverlay
        preview={{
          ...parentPreview,
          dragCount: 4,
          ghostItems: [
            { id: 'parent-b', label: 'Parent B', x: -24, y: 0, width: 96, height: 32 },
            { id: 'parent-c', label: 'Parent C', x: 48, y: 0, width: 132, height: 32 },
            { id: 'parent-d', label: 'Parent D', x: 88, y: 12, width: 72, height: 28 },
          ],
        }}
      />,
    )

    expect(html).toContain('class="arrange-preview-stack is-stacked"')
    expect(html).toContain('data-drag-count="4"')
    expect(html).toContain('left:90px')
    expect(html).toContain('top:72px')
    expect(html).toContain('width:120px')
    expect(html).toContain('height:32px')
    expect(html).toContain(
      'tab-arrange-preview is-parent tab-btn parent-tab-btn is-selected arrange-preview-card arrange-preview-ghost is-ghost-1',
    )
    expect(html).toContain(
      'tab-arrange-preview is-parent tab-btn parent-tab-btn is-selected arrange-preview-card arrange-preview-ghost is-ghost-2',
    )
    expect(html).toContain(
      'tab-arrange-preview is-parent tab-btn parent-tab-btn is-selected arrange-preview-card arrange-preview-ghost is-ghost-3',
    )
    expect(html).toContain('--arrange-preview-ghost-x:-24px')
    expect(html).toContain('--arrange-preview-ghost-y:0px')
    expect(html).toContain('--arrange-preview-ghost-rotation:-30deg')
    expect(html).toContain('--arrange-preview-ghost-x:48px')
    expect(html).toContain('--arrange-preview-ghost-rotation:30deg')
    expect(html).toContain('width:96px')
    expect(html).toContain('height:32px')
    expect(html).toContain('width:132px')
    expect(html).toContain('width:72px')
    expect(html).toContain('height:28px')
    expect(html).toContain('arrange-preview-primary')
    expect(html.match(/Parent A/g)).toHaveLength(1)
    expect(html).toContain('Parent B')
    expect(html).toContain('Parent C')
    expect(html).toContain('Parent D')
    expect(html).not.toContain('Parent A +')
  })
})
