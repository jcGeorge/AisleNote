import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  APP_TOOLTIP_HOVER_DELAY_MS,
  AppTooltipLayer,
  getAppTooltipDelay,
  getAppTooltipPosition,
  type TooltipRect,
} from './AppTooltipLayer'

function rect(values: TooltipRect): TooltipRect {
  return values
}

describe('AppTooltipLayer helpers', () => {
  it('keeps app hover labels independent from button scale variables', () => {
    const html = renderToStaticMarkup(createElement(AppTooltipLayer))

    expect(html).toContain('class="app-tooltip-layer"')
    expect(html).not.toContain('--toolbar-button-scale')
    expect(html).not.toContain('--tab-button-scale')
    expect(html).not.toContain('--app-tooltip-font-size')
  })

  it('delays pointer tooltips and shows focus tooltips immediately', () => {
    expect(getAppTooltipDelay('pointer')).toBe(APP_TOOLTIP_HOVER_DELAY_MS)
    expect(getAppTooltipDelay('focus')).toBe(0)
  })

  it('positions tooltips above the target by default', () => {
    expect(getAppTooltipPosition(
      rect({ top: 80, right: 140, bottom: 104, left: 100, width: 40, height: 24 }),
      rect({ top: 0, right: 0, bottom: 0, left: 0, width: 80, height: 20 }),
      320,
      240,
    )).toEqual({ left: 80, top: 52, placement: 'top' })
  })

  it('places tooltips below the target when there is no room above', () => {
    expect(getAppTooltipPosition(
      rect({ top: 12, right: 140, bottom: 36, left: 100, width: 40, height: 24 }),
      rect({ top: 0, right: 0, bottom: 0, left: 0, width: 80, height: 20 }),
      320,
      240,
    )).toEqual({ left: 80, top: 44, placement: 'bottom' })
  })

  it('clamps tooltip positions inside the viewport', () => {
    expect(getAppTooltipPosition(
      rect({ top: 220, right: 306, bottom: 244, left: 286, width: 20, height: 24 }),
      rect({ top: 0, right: 0, bottom: 0, left: 0, width: 120, height: 32 }),
      300,
      240,
    )).toEqual({ left: 172, top: 180, placement: 'top' })
  })
})
