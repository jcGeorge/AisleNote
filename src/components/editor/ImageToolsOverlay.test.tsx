import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ImageToolsState, InlineCropState } from '../../types/app'
import { ImageToolsOverlay } from './ImageToolsOverlay'

const baseImageTools: ImageToolsState = {
  visible: true,
  menuMode: 'start',
  toolbarTop: 10,
  toolbarLeft: 20,
  resizeTop: 100,
  resizeLeft: 120,
}

const inactiveCrop: InlineCropState = {
  active: false,
  relX: 0,
  relY: 0,
  relWidth: 1,
  relHeight: 1,
  top: 0,
  left: 0,
  width: 0,
  height: 0,
}

const activeCrop: InlineCropState = {
  active: true,
  relX: 0.1,
  relY: 0.1,
  relWidth: 0.8,
  relHeight: 0.8,
  top: 16,
  left: 24,
  width: 80,
  height: 60,
}

function renderOverlay(imageTools: ImageToolsState, inlineCrop: InlineCropState = inactiveCrop) {
  const noop = vi.fn()
  return renderToStaticMarkup(
    <ImageToolsOverlay
      visible
      imageTools={imageTools}
      inlineCrop={inlineCrop}
      onStartCrop={noop}
      onOpenTransform={noop}
      onCopyImage={noop}
      onReturnToStart={noop}
      onTransformImage={noop}
      onApplyCrop={noop}
      onCancelCrop={noop}
      onBeginResize={noop}
      onBeginCropDrag={noop}
    />,
  )
}

describe('ImageToolsOverlay transform menu', () => {
  it('shows crop and transform in the start menu', () => {
    const html = renderOverlay(baseImageTools)

    expect(html).toContain('crop')
    expect(html).toContain('transform')
    expect(html).toContain('Copy image')
    expect(html).not.toContain('Rotate clockwise')
  })

  it('shows four transform icon buttons plus return in transform mode', () => {
    const html = renderOverlay({ ...baseImageTools, menuMode: 'transform' })

    expect(html.match(/image-transform-btn/g)).toHaveLength(4)
    expect(html).toContain('Rotate counterclockwise')
    expect(html).toContain('Rotate clockwise')
    expect(html).toContain('Flip horizontal')
    expect(html).toContain('Flip vertical')
    expect(html).toContain('return')
    expect(html).not.toContain('cancel')
  })

  it('does not render a transparent selected-image-width hit zone', () => {
    const html = renderOverlay(baseImageTools)

    expect(html).not.toContain('min-width:')
  })

  it('only shows apply and cancel controls while crop is active', () => {
    const html = renderOverlay({ ...baseImageTools, menuMode: 'transform' }, activeCrop)

    expect(html).toContain('apply')
    expect(html).toContain('cancel')
    expect(html).not.toContain('transform')
    expect(html).not.toContain('Rotate clockwise')
  })
})
