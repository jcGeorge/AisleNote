import { readFileSync } from 'node:fs'
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
  ratioPresetId: 'freeform',
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
  ratioPresetId: 'youtube',
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
      onSetCropRatio={noop}
      onBeginResize={noop}
      onBeginCropDrag={noop}
    />,
  )
}

function extractRule(css: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return css.match(new RegExp(`${escapedSelector}\\s*\\{[^}]+\\}`))?.[0] ?? ''
}

function extractLastRule(css: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return css.match(new RegExp(`${escapedSelector}\\s*\\{[^}]+\\}`, 'g'))?.at(-1) ?? ''
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

  it('renders the flipped resize icon in the normal image resize handle', () => {
    const html = renderOverlay(baseImageTools)

    expect(html).toContain('class="resize-corner-icon"')
    expect(html).toContain('class="resize-corner-icon-background"')
    expect(html).toContain('stroke="currentColor"')
    expect(html).toContain('stroke-width="2"')
    expect(html).toContain('transform="translate(0 24) scale(1 -1)"')
    expect(html).toContain('aria-label="Resize image"')
  })

  it('only shows apply and cancel controls while crop is active', () => {
    const html = renderOverlay({ ...baseImageTools, menuMode: 'transform' }, activeCrop)

    expect(html).toContain('apply')
    expect(html).toContain('cancel')
    expect(html).toContain('YouTube 16:9')
    expect(html).toContain('Reels 9:16')
    expect(html).not.toContain('aria-label="Transform"')
    expect(html).not.toContain('>transform</button>')
    expect(html).not.toContain('Rotate clockwise')
  })

  it('renders the flipped resize icon only in the crop corner handle', () => {
    const html = renderOverlay(baseImageTools, activeCrop)

    expect(html).toContain('class="inline-crop-resize-handle"')
    expect(html).toContain('class="resize-corner-icon"')
    expect(html).toContain('class="resize-corner-icon-background"')
    expect(html).toContain('stroke-width="2"')
    expect(html).toContain('transform="translate(0 24) scale(1 -1)"')
    expect(html).toContain('inline-crop-edge-handle inline-crop-edge-handle-n')
    expect(html).toContain('inline-crop-edge-handle inline-crop-edge-handle-e')
    expect(html).toContain('inline-crop-edge-handle inline-crop-edge-handle-s')
    expect(html).toContain('inline-crop-edge-handle inline-crop-edge-handle-w')
  })

  it('keeps tool button active state border-only with rail-like rounding', () => {
    const css = readFileSync(new URL('../../styles/editor-shell.css', import.meta.url), 'utf8')

    expect(css).toContain('border-radius: calc(0.42rem * var(--tab-button-scale, 1));')
    expect(css).toContain('.image-tool-btn:active')
    expect(css).toContain('border-color: var(--editor-link-text);')
    expect(css).toContain('background: var(--image-tool-btn-bg) !important;')
  })

  it('uses svg resize icons while preserving striped crop edge handles', () => {
    const css = readFileSync(new URL('../../styles/editor-shell.css', import.meta.url), 'utf8')
    const dawnCss = readFileSync(new URL('../../styles/themes/dawn.css', import.meta.url), 'utf8')
    const lightCss = readFileSync(new URL('../../styles/themes/light.css', import.meta.url), 'utf8')
    const resizeHandleRule = extractRule(css, '.image-resize-handle')
    const resizeIconRule = extractRule(css, '.resize-corner-icon')
    const resizeIconBackgroundRule = extractRule(css, '.resize-corner-icon-background')
    const cropIconBackgroundRule = extractRule(css, '.inline-crop-resize-handle .resize-corner-icon-background')
    const cropCornerRule = extractLastRule(css, '.inline-crop-resize-handle')
    const cropEdgeRule = extractRule(css, '.inline-crop-edge-handle')
    const dawnResizeHandleRule = extractRule(dawnCss, '.theme-dawn .image-resize-handle')
    const dawnCropCornerRule = extractRule(dawnCss, '.theme-dawn .inline-crop-resize-handle')
    const dawnCropEdgeRule = extractRule(dawnCss, '.theme-dawn .inline-crop-edge-handle')
    const lightResizeHandleRule = extractRule(lightCss, '.theme-light .image-resize-handle')
    const lightCropCornerRule = extractRule(lightCss, '.theme-light .inline-crop-resize-handle')
    const lightCropEdgeRule = extractRule(lightCss, '.theme-light .inline-crop-edge-handle')

    expect(css).toContain('.resize-corner-icon')
    expect(resizeIconRule).toContain('width: 24px;')
    expect(resizeIconRule).toContain('height: 24px;')
    expect(resizeIconBackgroundRule).toContain('fill: var(--image-tool-handle-bg);')
    expect(resizeIconBackgroundRule).toContain('stroke: none;')
    expect(cropIconBackgroundRule).toContain('fill: var(--image-tool-crop-handle-bg);')
    expect(css).toContain('color: var(--image-tool-handle-stripe);')
    expect(resizeHandleRule).toContain('border: 0;')
    expect(resizeHandleRule).toContain('background: transparent;')
    expect(resizeHandleRule).toContain('box-shadow: none;')
    expect(cropCornerRule).toContain('border: 0;')
    expect(cropCornerRule).toContain('background: transparent;')
    expect(cropCornerRule).toContain('box-shadow: none;')
    expect(cropEdgeRule).toContain('border-radius: 999px;')
    expect(css).not.toContain('.image-resize-handle::before')
    expect(css).not.toContain('.inline-crop-resize-handle::before')
    expect(css).toContain('.inline-crop-edge-handle::before')
    expect(dawnResizeHandleRule).toBe('')
    expect(dawnCropCornerRule).toBe('')
    expect(dawnCropEdgeRule).toContain('background: var(--image-tool-crop-handle-bg);')
    expect(dawnCss).not.toContain('.theme-dawn .image-resize-handle::before')
    expect(dawnCss).not.toContain('.theme-dawn .inline-crop-resize-handle::before')
    expect(lightResizeHandleRule).toBe('')
    expect(lightCropCornerRule).toBe('')
    expect(lightCropEdgeRule).toContain('background: var(--image-tool-crop-handle-bg);')
    expect(lightCss).not.toContain('.theme-light .image-resize-handle::before')
    expect(lightCss).not.toContain('.theme-light .inline-crop-resize-handle::before')
  })
})
