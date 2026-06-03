import { describe, expect, it, vi } from 'vitest'
import {
  ARRANGE_RAIL_CONTROL_SELECTOR,
  blurActiveArrangeRailControl,
  blurArrangeRailControl,
} from './arrange-focus-cleanup'

function makeFocusable(matches: boolean) {
  return {
    blur: vi.fn(),
    matches: vi.fn(() => matches),
  }
}

describe('arrange focus cleanup', () => {
  it('blurs arrange rail controls', () => {
    const target = makeFocusable(true)

    expect(blurArrangeRailControl(target)).toBe(true)
    expect(target.matches).toHaveBeenCalledWith(ARRANGE_RAIL_CONTROL_SELECTOR)
    expect(target.blur).toHaveBeenCalledTimes(1)
  })

  it('does not blur unrelated active elements', () => {
    const target = makeFocusable(false)

    expect(blurArrangeRailControl(target)).toBe(false)
    expect(target.matches).toHaveBeenCalledWith(ARRANGE_RAIL_CONTROL_SELECTOR)
    expect(target.blur).not.toHaveBeenCalled()
  })

  it('is a safe no-op without a focusable element', () => {
    expect(blurArrangeRailControl(null)).toBe(false)
    expect(blurArrangeRailControl({})).toBe(false)
    expect(blurActiveArrangeRailControl(null)).toBe(false)
    expect(blurActiveArrangeRailControl({ activeElement: null })).toBe(false)
  })

  it('blurs the active arrange rail control from the supplied document', () => {
    const activeElement = makeFocusable(true)

    expect(blurActiveArrangeRailControl({ activeElement: activeElement as unknown as Element })).toBe(true)
    expect(activeElement.blur).toHaveBeenCalledTimes(1)
  })
})
