import { describe, expect, it } from 'vitest'
import type { AppState, Tab } from '../types/app'
import { DEFAULT_NEWLINE_SHORTCUT_SETTINGS, DEFAULT_SHORTCUTS } from './shortcuts'
import {
  getCycledAisleTarget,
  getCycledParentTabTarget,
  getDeleteFocusedSubtabShortcutIntent,
  getNumberedPrimeTabTarget,
  getRailVisibilityShortcutTarget,
  isDeleteFocusedSubtabShortcut,
} from './useGlobalHotkeys'

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

describe('aisle cycle hotkeys', () => {
  it('wraps aisle cycling in both directions', () => {
    const aisles = ['aisle-1', 'aisle-2', 'aisle-3']

    expect(getCycledAisleTarget(aisles, 'aisle-1', 1)).toBe('aisle-2')
    expect(getCycledAisleTarget(aisles, 'aisle-1', -1)).toBe('aisle-3')
    expect(getCycledAisleTarget(aisles, 'aisle-3', 1)).toBe('aisle-1')
  })

  it('falls back from a missing active aisle and ignores single-aisle notes', () => {
    expect(getCycledAisleTarget(['aisle-1', 'aisle-2'], 'missing', 1)).toBe('aisle-2')
    expect(getCycledAisleTarget(['aisle-1'], 'aisle-1', 1)).toBeNull()
    expect(getCycledAisleTarget([], 'missing', 1)).toBeNull()
  })

  it('keeps repeated aisle cycling stable in both directions', () => {
    const aisles = ['aisle-1', 'aisle-2', 'aisle-3']
    let activeAisleId = 'aisle-1'

    for (let index = 0; index < 5; index += 1) {
      activeAisleId = getCycledAisleTarget(aisles, activeAisleId, 1) ?? activeAisleId
    }
    expect(activeAisleId).toBe('aisle-3')

    for (let index = 0; index < 5; index += 1) {
      activeAisleId = getCycledAisleTarget(aisles, activeAisleId, -1) ?? activeAisleId
    }
    expect(activeAisleId).toBe('aisle-1')
  })
})

describe('rail visibility hotkeys', () => {
  const hotkeys: AppState['hotkeys'] = {
    shortcuts: DEFAULT_SHORTCUTS,
    newlineShortcuts: DEFAULT_NEWLINE_SHORTCUT_SETTINGS,
  }

  const keyboardEvent = (key: string): KeyboardEvent =>
    ({
      key,
      code: `Key${key.toUpperCase()}`,
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false,
    }) as KeyboardEvent

  it('maps saved openSpaces and openDomains shortcuts to rail visibility actions', () => {
    expect(getRailVisibilityShortcutTarget(keyboardEvent('s'), hotkeys, false)).toBe('space')
    expect(getRailVisibilityShortcutTarget(keyboardEvent('d'), hotkeys, false)).toBe('domain')
  })
})

describe('delete focused subtab hotkey', () => {
  const keyboardEvent = (
    key: string,
    modifiers: Partial<Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>> = {},
  ): KeyboardEvent =>
    ({
      key,
      code: `Key${key.toUpperCase()}`,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      ...modifiers,
    }) as KeyboardEvent

  it('matches plain primary-modifier W only', () => {
    expect(isDeleteFocusedSubtabShortcut(keyboardEvent('w', { metaKey: true }), true)).toBe(true)
    expect(isDeleteFocusedSubtabShortcut(keyboardEvent('w', { ctrlKey: true }), false)).toBe(true)
    expect(isDeleteFocusedSubtabShortcut(keyboardEvent('w', { metaKey: true, shiftKey: true }), true)).toBe(false)
    expect(isDeleteFocusedSubtabShortcut(keyboardEvent('w', { ctrlKey: true, altKey: true }), false)).toBe(false)
    expect(isDeleteFocusedSubtabShortcut(keyboardEvent('w', { ctrlKey: true }), true)).toBe(false)
  })

  it('returns disabled, delete, home-warning, and ignored intents', () => {
    expect(
      getDeleteFocusedSubtabShortcutIntent({
        event: keyboardEvent('w', { ctrlKey: true }),
        isMacPlatform: false,
        viewMode: 'main',
        arrangeActive: false,
        enabled: false,
        activeSubTabId: 'sub-1',
      }),
    ).toBe('show-tip')

    expect(
      getDeleteFocusedSubtabShortcutIntent({
        event: keyboardEvent('w', { ctrlKey: true }),
        isMacPlatform: false,
        viewMode: 'main',
        arrangeActive: false,
        enabled: true,
        activeSubTabId: 'sub-1',
      }),
    ).toBe('delete-subtab')

    expect(
      getDeleteFocusedSubtabShortcutIntent({
        event: keyboardEvent('w', { ctrlKey: true }),
        isMacPlatform: false,
        viewMode: 'main',
        arrangeActive: false,
        enabled: true,
        activeSubTabId: null,
      }),
    ).toBe('warn-home')

    expect(
      getDeleteFocusedSubtabShortcutIntent({
        event: keyboardEvent('w', { ctrlKey: true }),
        isMacPlatform: false,
        viewMode: 'settings',
        arrangeActive: false,
        enabled: true,
        activeSubTabId: 'sub-1',
      }),
    ).toBeNull()

    expect(
      getDeleteFocusedSubtabShortcutIntent({
        event: keyboardEvent('w', { ctrlKey: true }),
        isMacPlatform: false,
        viewMode: 'main',
        arrangeActive: true,
        enabled: true,
        activeSubTabId: 'sub-1',
      }),
    ).toBeNull()
  })
})
