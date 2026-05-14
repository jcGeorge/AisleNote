import { describe, expect, it } from 'vitest'
import type { Tab } from '../types/app'
import { getNumberedPrimeTabTarget } from './useGlobalHotkeys'

const makeTab = (id: string): Tab => ({
  id,
  title: id,
  noteBodyId: `${id}-body`,
  homeContent: '',
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
