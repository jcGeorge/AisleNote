import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ListReorderControlsOverlay } from './ListReorderControlsOverlay'
import type { ListReorderControlsState } from '../../editor/useListReorderControls'

const overlaySource = readFileSync(new URL('./ListReorderControlsOverlay.tsx', import.meta.url), 'utf8')
const editorShellCss = readFileSync(new URL('../../styles/editor-shell.css', import.meta.url), 'utf8')

const visibleControls: ListReorderControlsState = {
  visible: true,
  handles: [
    {
      key: 'bullet-1',
      kind: 'bullet',
      index: 0,
      top: 20,
      left: 10,
      width: 14,
      height: 24,
      itemElement: {} as HTMLElement,
      listElement: {} as HTMLElement,
    },
    {
      key: 'numbered-2',
      kind: 'numbered',
      index: 1,
      top: 44,
      left: 10,
      width: 14,
      height: 28,
      itemElement: {} as HTMLElement,
      listElement: {} as HTMLElement,
    },
  ],
}

function renderOverlay(options: { controlsVisible?: boolean; globalVisible?: boolean } = {}) {
  return renderToStaticMarkup(
    <ListReorderControlsOverlay
      visible={options.globalVisible ?? true}
      listReorderControls={{ ...visibleControls, visible: options.controlsVisible ?? true }}
      onBeginListHandleGesture={vi.fn()}
    />,
  )
}

describe('ListReorderControlsOverlay', () => {
  it('renders fixed row-height list handles without native draggable attributes', () => {
    const html = renderOverlay()

    expect(html).toContain('list-reorder-controls-overlay-layer')
    expect(html).toContain('list-reorder-handle list-reorder-handle-bullet')
    expect(html).toContain('list-reorder-handle list-reorder-handle-numbered')
    expect(html).toContain('aria-label="Move bullet item 1"')
    expect(html).toContain('aria-label="Move numbered item 2"')
    expect(html).toContain('data-list-reorder-kind="bullet"')
    expect(html).toContain('top:20px;left:10px;width:14px;height:24px')
    expect(html).not.toContain('draggable=')
  })

  it('routes mousedown gestures through the handle callback and uses table-selector styling tokens', () => {
    expect(overlaySource).toContain('onBeginListHandleGesture(segment, event)')
    expect(overlaySource).toContain('onMouseDown={(event) => handleMouseDown(segment, event)}')
    expect(overlaySource).not.toContain('draggable')

    expect(editorShellCss).toContain('.list-reorder-handle')
    expect(editorShellCss).toContain('var(--editor-table-selection-layer-border)')
    expect(editorShellCss).toContain('var(--editor-table-selection-layer-bg)')
    expect(editorShellCss).toContain('var(--table-tool-btn-shadow)')
    expect(editorShellCss).toContain('.task-reorder-active .list-reorder-handle')
    expect(editorShellCss).not.toContain('.list-reorder-handle::before')
  })

  it('renders nothing when inactive', () => {
    expect(renderOverlay({ controlsVisible: false })).toBe('')
    expect(renderOverlay({ globalVisible: false })).toBe('')
  })
})
