import { describe, expect, it } from 'vitest'
import type { Tab } from '../types/app'
import { getCycledParentTabTarget, getNumberedPrimeTabTarget } from './useGlobalHotkeys'

const makeTab = (id: string): Tab => ({
  id,
  title: id,
  noteBodyId: `${id}-body`,
  activeSubTabId: null,
  subTabs: [],
})

describe('global numbered hotkeys', () => {
  it('maps numeric shortcuts to prime tabs by visible order', () => {
    const tabs = [makeTab('prime-1'), makeTab('prime-2'), makeTab('prime-3')]

    expect(getNumberedPrimeTabTarget(tabs, 0)).toBe('prime-1')
    expect(getNumberedPrimeTabTarget(tabs, 1)).toBe('prime-2')
    expect(getNumberedPrimeTabTarget(tabs, 2)).toBe('prime-3')
  })

  it('ignores numeric shortcuts beyond the available prime tabs', () => {
    expect(getNumberedPrimeTabTarget([makeTab('prime-1')], 9)).toBeNull()
  })
})

describe('parent tab cycle hotkeys', () => {
  it('wraps parent tab cycling in both directions', () => {
    const tabs = [makeTab('prime-1'), makeTab('prime-2'), makeTab('prime-3')]

    expect(getCycledParentTabTarget(tabs, 'prime-1', 1)).toBe('prime-2')
    expect(getCycledParentTabTarget(tabs, 'prime-1', -1)).toBe('prime-3')
    expect(getCycledParentTabTarget(tabs, 'prime-3', 1)).toBe('prime-1')
  })

  it('falls back to the first visible parent tab when the active tab is missing', () => {
    const tabs = [makeTab('prime-1'), makeTab('prime-2')]

    expect(getCycledParentTabTarget(tabs, 'missing', 1)).toBe('prime-2')
    expect(getCycledParentTabTarget([], 'missing', 1)).toBeNull()
  })
})
