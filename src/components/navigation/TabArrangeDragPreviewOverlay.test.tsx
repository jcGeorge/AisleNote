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

  it('renders the parent drag preview with existing preview classes and position styles', () => {
    const html = renderToStaticMarkup(<TabArrangeDragPreviewOverlay preview={parentPreview} />)

    expect(html).toContain('class="tab-arrange-preview is-parent"')
    expect(html).toContain('left:90px')
    expect(html).toContain('top:72px')
    expect(html).toContain('width:120px')
    expect(html).toContain('height:32px')
    expect(html).toContain('Parent A + 2')
  })

  it('renders the sub-tab drag preview with existing sub-tab preview classes', () => {
    const html = renderToStaticMarkup(<TabArrangeDragPreviewOverlay preview={subtabPreview} />)

    expect(html).toContain('class="tab-arrange-preview is-subtab"')
    expect(html).toContain('left:81px')
    expect(html).toContain('top:63px')
    expect(html).toContain('Sub A + 1')
  })
})
