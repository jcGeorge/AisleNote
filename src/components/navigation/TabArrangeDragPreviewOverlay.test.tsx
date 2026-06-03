import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { TabArrangeDragPreview } from '../../types/app'
import { getArrangeDragPreviewStyle } from './arrange-drag-preview-style'
import { TabArrangeDragPreviewOverlay } from './TabArrangeDragPreviewOverlay'

const parentPreview: TabArrangeDragPreview = {
  item: { type: 'tab', tabId: 'parent-a' },
  label: 'Parent A + 2',
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
  label: 'Sub A + 1',
  variant: 'subtab',
  currentX: 90,
  currentY: 70,
  offsetX: 9,
  offsetY: 7,
  width: 110,
  height: 30,
}

describe('tab arrange drag preview overlay', () => {
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
    expect(html).toContain('Parent A + 2')
  })

  it('renders the sub-tab drag preview with focused rail styling', () => {
    const html = renderToStaticMarkup(<TabArrangeDragPreviewOverlay preview={subtabPreview} />)

    expect(html).toContain(
      'tab-arrange-preview is-subtab tab-btn subtab-btn is-selected arrange-preview-card arrange-preview-primary',
    )
    expect(html).toContain('left:81px')
    expect(html).toContain('top:63px')
    expect(html).toContain('Sub A + 1')
  })

  it('renders ghost cards for multi-item tab drags without moving the preview root', () => {
    const html = renderToStaticMarkup(
      <TabArrangeDragPreviewOverlay
        preview={{
          ...parentPreview,
          dragCount: 3,
          ghostOrigins: [
            { x: -24, y: 0 },
            { x: 48, y: 0 },
          ],
        }}
      />,
    )

    expect(html).toContain('class="arrange-preview-stack is-stacked"')
    expect(html).toContain('data-drag-count="3"')
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
    expect(html).toContain('--arrange-preview-ghost-x:-24px')
    expect(html).toContain('--arrange-preview-ghost-y:0px')
    expect(html).toContain('--arrange-preview-ghost-rotation:-30deg')
    expect(html).toContain('--arrange-preview-ghost-x:48px')
    expect(html).toContain('--arrange-preview-ghost-rotation:30deg')
    expect(html).toContain('arrange-preview-primary')
    expect(html.match(/Parent A \+ 2/g)).toHaveLength(3)
  })
})
