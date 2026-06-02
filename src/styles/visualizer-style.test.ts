import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function extractRule(css: string, selector: string): string {
  const index = css.indexOf(`${selector} {`)
  expect(index, `missing selector ${selector}`).toBeGreaterThanOrEqual(0)
  const start = css.indexOf('{', index)
  const end = css.indexOf('}', start)
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return css.slice(start + 1, end)
}

describe('visualizer styles', () => {
  const css = readFileSync(new URL('./visualizer.css', import.meta.url), 'utf8')

  it('fills the view below the top bar without the utility card layout', () => {
    const viewRule = extractRule(css, '.visualizer-view')
    const graphRule = extractRule(css, '.visualizer-graph-panel')

    expect(viewRule).toContain('flex: 1 1 auto;')
    expect(viewRule).toContain('position: relative;')
    expect(viewRule).toContain('overflow: hidden;')
    expect(viewRule).toContain('padding: 0;')
    expect(graphRule).toContain('width: 100%;')
    expect(graphRule).toContain('height: 100%;')
    expect(graphRule).toContain('border: 0;')
    expect(css).not.toContain('.visualizer-view-card')
  })

  it('keeps hierarchy chips from changing compact graph node dimensions', () => {
    const nodeRule = extractRule(css, '.visualizer-node')
    const hierarchyRule = extractRule(css, '.visualizer-node-hierarchy')
    const chipRule = extractRule(css, '.visualizer-hierarchy-chip')
    const countRule = extractRule(css, '.visualizer-node-count')

    expect(nodeRule).toContain('width: fit-content;')
    expect(nodeRule).toContain('min-width: 4.75rem;')
    expect(nodeRule).toContain('max-width: 8.25rem;')
    expect(nodeRule).toContain('height: 2.75rem;')
    expect(nodeRule).toContain('padding: 0.26rem 0.38rem;')
    expect(nodeRule).toContain('overflow: visible;')
    expect(hierarchyRule).toContain('position: absolute;')
    expect(hierarchyRule).toContain('bottom: calc(100% + 0.34rem);')
    expect(hierarchyRule).toContain('left: 0;')
    expect(hierarchyRule).toContain('justify-items: start;')
    expect(hierarchyRule).toContain('opacity: 0;')
    expect(hierarchyRule).toContain('pointer-events: none;')
    expect(hierarchyRule).toContain('visibility: hidden;')
    expect(css).toContain('.visualizer-node:hover .visualizer-node-hierarchy,')
    expect(css).toContain('.visualizer-node:focus-visible .visualizer-node-hierarchy,')
    expect(css).toContain('.visualizer-node.is-selected .visualizer-node-hierarchy {')
    expect(chipRule).toContain('--rail-control-min-width: 0;')
    expect(chipRule).toContain('pointer-events: none;')
    expect(countRule).toContain('position: absolute;')
    expect(css).not.toContain('.visualizer-node-kind')
    expect(css).not.toContain('.visualizer-node-detail')
  })

  it('styles React Flow controls and attribution with app theme tokens', () => {
    const controlsRule = extractRule(css, '.visualizer-controls button')
    const minimapRule = extractRule(css, '.visualizer-minimap')
    const minimapMaskRule = extractRule(css, '.visualizer-minimap .react-flow__minimap-mask')
    const minimapNodeRule = extractRule(css, '.visualizer-minimap .react-flow__minimap-node')
    const attributionRule = extractRule(css, '.visualizer-graph-panel .react-flow__attribution')
    const attributionLinkRule = extractRule(css, '.visualizer-graph-panel .react-flow__attribution a')

    expect(minimapRule).toContain('right: 0.75rem !important;')
    expect(minimapRule).toContain('bottom: 2.2rem !important;')
    expect(minimapRule).toContain('background: var(--settings-page-bg) !important;')
    expect(css).toContain('.visualizer-minimap svg {')
    expect(css).toContain('background: color-mix(in srgb, var(--settings-page-bg) 86%, var(--app-surface-raised)) !important;')
    expect(minimapMaskRule).toContain('fill: color-mix(in srgb, var(--settings-page-bg) 56%, transparent) !important;')
    expect(minimapMaskRule).toContain('stroke: var(--app-primary-border) !important;')
    expect(minimapMaskRule).toContain('stroke-width: 1.5px !important;')
    expect(minimapNodeRule).toContain('stroke-width: 1px !important;')
    expect(controlsRule).toContain('background: var(--settings-card-bg) !important;')
    expect(controlsRule).toContain('color: var(--settings-card-text) !important;')
    expect(attributionRule).toContain('background: var(--settings-card-bg) !important;')
    expect(attributionRule).toContain('color: var(--settings-card-text) !important;')
    expect(attributionLinkRule).toContain('color: var(--settings-card-text) !important;')
  })
})
