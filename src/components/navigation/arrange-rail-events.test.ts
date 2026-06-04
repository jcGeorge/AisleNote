import { describe, expect, it } from 'vitest'
import {
  getArrangeRailContextMenuPolicy,
  getArrangeRailPointerDownAction,
  getSelectionClickModifiers,
  hasArrangeSelectionModifier,
} from './arrange-rail-events'

describe('arrange rail event policy', () => {
  it('normalizes selection modifiers', () => {
    expect(getSelectionClickModifiers({ metaKey: true })).toEqual({
      shiftKey: false,
      ctrlKey: false,
      metaKey: true,
    })
    expect(hasArrangeSelectionModifier({ shiftKey: false, ctrlKey: false, metaKey: false })).toBe(false)
    expect(hasArrangeSelectionModifier({ shiftKey: true })).toBe(true)
  })

  it('routes pointer-downs through shared arrange actions', () => {
    expect(getArrangeRailPointerDownAction({ button: 2 })).toBe('ignore')
    expect(getArrangeRailPointerDownAction({ button: 0, disabled: true })).toBe('ignore')
    expect(getArrangeRailPointerDownAction({ button: 0, metaKey: true })).toBe('clear-press-timer')
    expect(getArrangeRailPointerDownAction({ button: 0 })).toBe('track-arrange')
  })

  it('routes context menus through shared arrange cancel policy', () => {
    expect(getArrangeRailContextMenuPolicy({ disabled: true, arrangeActive: true })).toEqual({ action: 'ignore' })
    expect(getArrangeRailContextMenuPolicy({ arrangeActive: false })).toEqual({
      action: 'open-menu',
      cancelArrange: false,
      forceMenu: false,
    })
    expect(getArrangeRailContextMenuPolicy({ arrangeActive: true })).toEqual({
      action: 'open-menu',
      cancelArrange: true,
      forceMenu: true,
    })
  })
})
