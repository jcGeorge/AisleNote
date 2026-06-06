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
    expect(html).toContain('data-app-icon="rotateCounterClockwise"')
    expect(html).toContain('data-app-icon="rotateClockwise"')
    expect(html).toContain('data-app-icon="flipX"')
    expect(html).toContain('data-app-icon="flipY"')
    expect(html).not.toContain('is-rotate-cw')
    expect(html).not.toContain('is-flip-horizontal')
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
    expect(html).toContain('x="0" y="0" width="24" height="24" rx="3.5"')
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
    expect(html).toContain('x="0" y="0" width="24" height="24" rx="3.5"')
    expect(html).toContain('stroke-width="2"')
    expect(html).toContain('transform="translate(0 24) scale(1 -1)"')
    expect(html).toContain('inline-crop-edge-handle inline-crop-edge-handle-n')
    expect(html).toContain('inline-crop-edge-handle inline-crop-edge-handle-e')
    expect(html).toContain('inline-crop-edge-handle inline-crop-edge-handle-s')
    expect(html).toContain('inline-crop-edge-handle inline-crop-edge-handle-w')
  })

  it('uses crop accents and 20% larger controls for image tool buttons', () => {
    const css = readFileSync(new URL('../../styles/editor-shell.css', import.meta.url), 'utf8')
    const buttonRule = extractRule(css, '.image-tool-btn')
    const buttonHoverRule = extractRule(css, '.image-tool-btn:hover')
    const buttonActiveRule = extractRule(css, '.image-tool-btn:active')
    const cropSelectRule = extractRule(css, '.image-crop-ratio-select')
    const transformButtonRule = extractRule(css, '.image-transform-btn')
    const copyButtonRule = extractRule(css, '.image-copy-btn')
    const returnButtonRule = extractRule(css, '.image-transform-return-btn')
    const transformIconRule = extractRule(css, '.image-transform-icon')
    const copyIconRule = extractRule(css, '.image-copy-icon')
    const copyIconLayerRule = extractRule(css, '.image-copy-icon::before,\n.image-copy-icon::after')

    expect(buttonRule).toContain('border: 1px solid var(--image-tool-crop-handle-border);')
    expect(buttonRule).toContain('background: var(--image-tool-crop-handle-bg);')
    expect(buttonRule).toContain('color: var(--image-tool-crop-border);')
    expect(buttonRule).toContain('font-size: 1.104em;')
    expect(buttonRule).toContain('padding: 0.264rem 0.744rem;')
    expect(buttonRule).toContain('min-width: 2.94rem;')
    expect(buttonHoverRule).toContain(
      'background: color-mix(in srgb, var(--image-tool-crop-handle-bg) 78%, var(--image-tool-crop-border));',
    )
    expect(buttonActiveRule).toContain('border-color: var(--image-tool-crop-border);')
    expect(buttonActiveRule).toContain('background: var(--image-tool-crop-handle-bg) !important;')
    expect(cropSelectRule).toContain('height: 2.1rem;')
    expect(cropSelectRule).toContain('max-width: 13.2rem;')
    expect(cropSelectRule).toContain('border: 1px solid var(--image-tool-crop-handle-border);')
    expect(cropSelectRule).toContain('background: var(--image-tool-crop-handle-bg);')
    expect(cropSelectRule).toContain('color: var(--image-tool-crop-border);')
    expect(cropSelectRule).toContain('font-size: 1.08em;')
    expect(cropSelectRule).toContain('padding: 0 1.92rem 0 0.54rem;')
    expect(transformButtonRule).toContain('width: 2.4rem;')
    expect(transformButtonRule).toContain('min-width: 2.4rem;')
    expect(transformButtonRule).toContain('height: 2.1rem;')
    expect(copyButtonRule).toContain('width: 2.4rem;')
    expect(copyButtonRule).toContain('min-width: 2.4rem;')
    expect(copyButtonRule).toContain('height: 2.1rem;')
    expect(returnButtonRule).toContain('height: 2.1rem;')
    expect(returnButtonRule).toContain('min-width: 4.14rem;')
    expect(returnButtonRule).toContain('padding: 0 0.744rem;')
    expect(transformIconRule).toContain('width: 1.344rem;')
    expect(transformIconRule).toContain('height: 1.344rem;')
    expect(copyIconRule).toContain('width: 1.26rem;')
    expect(copyIconRule).toContain('height: 1.26rem;')
    expect(copyIconLayerRule).toContain('width: 0.696rem;')
    expect(copyIconLayerRule).toContain('height: 0.84rem;')
    expect(copyIconLayerRule).toContain('background: var(--image-tool-crop-handle-bg);')
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
    const cropHorizontalEdgeRule = extractRule(css, '.inline-crop-edge-handle-n,\n.inline-crop-edge-handle-s')
    const cropVerticalEdgeRule = extractRule(css, '.inline-crop-edge-handle-e,\n.inline-crop-edge-handle-w')
    const cropHorizontalStripeRule = extractRule(
      css,
      '.inline-crop-edge-handle-n::before,\n.inline-crop-edge-handle-s::before',
    )
    const cropVerticalStripeRule = extractRule(
      css,
      '.inline-crop-edge-handle-e::before,\n.inline-crop-edge-handle-w::before',
    )
    const dawnResizeHandleRule = extractRule(dawnCss, '.theme-dawn .image-resize-handle')
    const dawnCropCornerRule = extractRule(dawnCss, '.theme-dawn .inline-crop-resize-handle')
    const dawnCropEdgeRule = extractRule(dawnCss, '.theme-dawn .inline-crop-edge-handle')
    const lightResizeHandleRule = extractRule(lightCss, '.theme-light .image-resize-handle')
    const lightCropCornerRule = extractRule(lightCss, '.theme-light .inline-crop-resize-handle')
    const lightCropEdgeRule = extractRule(lightCss, '.theme-light .inline-crop-edge-handle')

    expect(css).toContain('.resize-corner-icon')
    expect(resizeIconRule).toContain('width: 24px;')
    expect(resizeIconRule).toContain('height: 24px;')
    expect(resizeIconBackgroundRule).toContain('fill: var(--image-tool-crop-handle-bg);')
    expect(resizeIconBackgroundRule).toContain('stroke: none;')
    expect(cropIconBackgroundRule).toBe('')
    expect(css).toContain('color: var(--image-tool-crop-border);')
    expect(resizeHandleRule).toContain('border: 0;')
    expect(resizeHandleRule).toContain('background: transparent;')
    expect(resizeHandleRule).toContain('box-shadow: none;')
    expect(resizeHandleRule).toContain('color: var(--image-tool-crop-border);')
    expect(cropCornerRule).toContain('border: 0;')
    expect(cropCornerRule).toContain('background: transparent;')
    expect(cropCornerRule).toContain('box-shadow: none;')
    expect(cropCornerRule).toContain('color: var(--image-tool-crop-border);')
    expect(cropEdgeRule).toContain('border-radius: 999px;')
    expect(cropHorizontalEdgeRule).toContain('width: 46px;')
    expect(cropHorizontalEdgeRule).toContain('height: 14px;')
    expect(cropVerticalEdgeRule).toContain('width: 14px;')
    expect(cropVerticalEdgeRule).toContain('height: 46px;')
    expect(cropHorizontalStripeRule).toContain('inset: 4px 8px;')
    expect(cropVerticalStripeRule).toContain('inset: 8px 4px;')
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
