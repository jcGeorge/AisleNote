import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { MediaToolsOverlay, type MediaToolsState } from './MediaToolsOverlay'

const mediaTools: MediaToolsState = {
  visible: true,
  menuMode: 'start',
  toolbarTop: 10,
  toolbarLeft: 20,
  resizeTop: 100,
  resizeLeft: 120,
}

function renderOverlay(state: MediaToolsState) {
  const noop = vi.fn()
  return renderToStaticMarkup(
    <MediaToolsOverlay
      visible
      mediaTools={state}
      onOpenTransform={noop}
      onReturnToStart={noop}
      onTransformMedia={noop}
      onBeginResize={noop}
    />,
  )
}

describe('MediaToolsOverlay', () => {
  it('shows transform and resize controls in the start menu without video crop controls', () => {
    const html = renderOverlay(mediaTools)

    expect(html).toContain('transform')
    expect(html).toContain('Resize video')
    expect(html).toContain('class="resize-corner-icon"')
    expect(html).toContain('class="resize-corner-icon-background"')
    expect(html).toContain('stroke-width="2"')
    expect(html).toContain('transform="translate(0 24) scale(1 -1)"')
    expect(html).not.toContain('crop')
    expect(html).not.toContain('Apply crop')
  })

  it('shows video transform controls', () => {
    const html = renderOverlay({ ...mediaTools, menuMode: 'transform' })

    expect(html.match(/media-transform-btn/g)).toHaveLength(4)
    expect(html).toContain('Rotate clockwise')
    expect(html).toContain('Flip horizontal')
    expect(html).toContain('data-app-icon="rotateCounterClockwise"')
    expect(html).toContain('data-app-icon="rotateClockwise"')
    expect(html).toContain('data-app-icon="flipX"')
    expect(html).toContain('data-app-icon="flipY"')
    expect(html).not.toContain('is-rotate-cw')
    expect(html).not.toContain('is-flip-horizontal')
    expect(html).toContain('return')
    expect(html).toContain('Resize video')
  })

  it('uses a media-specific bottom-right resize handle transform', () => {
    const css = readFileSync(new URL('../../styles/editor-shell.css', import.meta.url), 'utf8')

    expect(css).toContain('.media-resize-handle')
    expect(css).toContain('transform: translate(-100%, -100%);')
    expect(css).toContain('cursor: nwse-resize;')
  })

  it('lets resized video viewports scale vertically with their width', () => {
    const css = readFileSync(new URL('../../styles/editor-content.css', import.meta.url), 'utf8')

    expect(css).toContain('.tabs-media-player.is-video.has-media-width .tabs-media-viewport')
    expect(css).toContain('.tabs-media-player.is-video.is-media-resizing .tabs-media-viewport')
    expect(css).toContain('max-height: none;')
  })
})
