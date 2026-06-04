import { afterEach, describe, expect, it, vi } from 'vitest'
import { getActiveAisleRefSyncValue } from '../editor/aisle-activation'
import type { AppState, Tab } from '../types/app'
import { DEFAULT_NEWLINE_SHORTCUT_SETTINGS, DEFAULT_SHORTCUTS } from './shortcuts'
import {
  AISLE_BRACKET_CHORD_GUARD_MS,
  createAisleBracketCycleGuard,
  getAisleCycleBracketKey,
  getCycledAisleTarget,
  getCycledParentTabTarget,
  getCapturedRailVisibilityShortcutTarget,
  getDeleteFocusedSubtabShortcutIntent,
  getNumberedPrimeTabTarget,
  getNumberedPrimeTabShortcutIndex,
  getRailVisibilityShortcutTarget,
  isDeleteFocusedSubtabShortcut,
  isSettingsShortcut,
} from './useGlobalHotkeys'

const makeTab = (id: string): Tab => ({
  id,
  title: id,
  noteBodyId: `${id}-body`,
  activeSubTabId: null,
  subTabs: [],
})

const keyboardEvent = (
  key: string,
  modifiers: Partial<Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>> = {},
  code = key === ',' ? 'Comma' : `Key${key.toUpperCase()}`,
): KeyboardEvent =>
  ({
    key,
    code,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...modifiers,
  }) as KeyboardEvent

afterEach(() => {
  vi.useRealTimers()
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

  it('maps platform primary numeric shortcuts to parent tab indexes', () => {
    const tabs = Array.from({ length: 10 }, (_, index) => makeTab(`prime-${index + 1}`))
    const macFirstIndex = getNumberedPrimeTabShortcutIndex(keyboardEvent('1', { metaKey: true }), true)
    const macTenthIndex = getNumberedPrimeTabShortcutIndex(keyboardEvent('0', { metaKey: true }), true)
    const windowsFirstIndex = getNumberedPrimeTabShortcutIndex(keyboardEvent('1', { ctrlKey: true }), false)
    const windowsTenthIndex = getNumberedPrimeTabShortcutIndex(keyboardEvent('0', { ctrlKey: true }), false)

    expect(macFirstIndex).toBe(0)
    expect(macTenthIndex).toBe(9)
    expect(windowsFirstIndex).toBe(0)
    expect(windowsTenthIndex).toBe(9)
    expect(getNumberedPrimeTabTarget(tabs, macFirstIndex ?? -1)).toBe('prime-1')
    expect(getNumberedPrimeTabTarget(tabs, macTenthIndex ?? -1)).toBe('prime-10')
    expect(getNumberedPrimeTabTarget(tabs, windowsFirstIndex ?? -1)).toBe('prime-1')
    expect(getNumberedPrimeTabTarget(tabs, windowsTenthIndex ?? -1)).toBe('prime-10')
  })

  it('ignores numeric shortcuts with non-primary or mixed modifiers', () => {
    expect(getNumberedPrimeTabShortcutIndex(keyboardEvent('1', { ctrlKey: true }), true)).toBeNull()
    expect(getNumberedPrimeTabShortcutIndex(keyboardEvent('1', { metaKey: true }), false)).toBeNull()
    expect(getNumberedPrimeTabShortcutIndex(keyboardEvent('1', { metaKey: true, ctrlKey: true }), true)).toBeNull()
    expect(getNumberedPrimeTabShortcutIndex(keyboardEvent('1', { ctrlKey: true, altKey: true }), false)).toBeNull()
    expect(getNumberedPrimeTabShortcutIndex(keyboardEvent('1', { ctrlKey: true, shiftKey: true }), false)).toBeNull()
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

  it('cycles directly between aisle seven and aisle eight at the note limit', () => {
    const aisles = Array.from({ length: 8 }, (_, index) => `aisle-${index + 1}`)

    expect(getCycledAisleTarget(aisles, 'aisle-7', 1)).toBe('aisle-8')
    expect(getCycledAisleTarget(aisles, 'aisle-1', -1)).toBe('aisle-8')
  })

  it('cycles from the freshly focused aisle when the rendered active aisle is stale', () => {
    const aisles = Array.from({ length: 8 }, (_, index) => `aisle-${index + 1}`)
    const activeAisleFromFocus = getActiveAisleRefSyncValue({
      currentAisleId: 'aisle-7',
      resolvedActiveAisleId: 'aisle-8',
      activeAisleIds: aisles,
    })

    expect(getCycledAisleTarget(aisles, activeAisleFromFocus, 1)).toBe('aisle-8')
  })

  it('falls back from a missing active aisle and ignores single-aisle notes', () => {
    expect(getCycledAisleTarget(['aisle-1', 'aisle-2'], 'missing', 1)).toBe('aisle-2')
    expect(getCycledAisleTarget(Array.from({ length: 8 }, (_, index) => `aisle-${index + 1}`), 'missing', -1)).toBe('aisle-8')
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

  it('identifies physical bracket keys for guarded aisle cycling', () => {
    expect(getAisleCycleBracketKey({ code: 'BracketLeft' } as KeyboardEvent)).toBe('left')
    expect(getAisleCycleBracketKey({ code: 'BracketRight' } as KeyboardEvent)).toBe('right')
    expect(getAisleCycleBracketKey({ code: 'KeyA' } as KeyboardEvent)).toBeNull()
  })

  it('runs a single previous-aisle bracket shortcut after the chord guard', () => {
    vi.useFakeTimers()
    const cycles: (-1 | 1)[] = []
    const guard = createAisleBracketCycleGuard()

    guard.handleKeydown({ bracketKey: 'left', direction: -1, run: (direction) => cycles.push(direction) })

    vi.advanceTimersByTime(AISLE_BRACKET_CHORD_GUARD_MS - 1)
    expect(cycles).toEqual([])

    vi.advanceTimersByTime(1)
    expect(cycles).toEqual([-1])
  })

  it('runs a single next-aisle bracket shortcut after the chord guard', () => {
    vi.useFakeTimers()
    const cycles: (-1 | 1)[] = []
    const guard = createAisleBracketCycleGuard()

    guard.handleKeydown({ bracketKey: 'right', direction: 1, run: (direction) => cycles.push(direction) })

    vi.advanceTimersByTime(AISLE_BRACKET_CHORD_GUARD_MS)
    expect(cycles).toEqual([1])
  })

  it('suppresses opposite bracket keydowns during the chord guard', () => {
    vi.useFakeTimers()
    const cycles: (-1 | 1)[] = []
    const guard = createAisleBracketCycleGuard()
    const run = (direction: -1 | 1) => cycles.push(direction)

    guard.handleKeydown({ bracketKey: 'left', direction: -1, run })
    vi.advanceTimersByTime(AISLE_BRACKET_CHORD_GUARD_MS - 1)
    guard.handleKeydown({ bracketKey: 'right', direction: 1, run })
    vi.advanceTimersByTime(AISLE_BRACKET_CHORD_GUARD_MS)

    expect(cycles).toEqual([])
  })

  it('keeps dual-bracket suppression until both bracket keys are released', () => {
    vi.useFakeTimers()
    const cycles: (-1 | 1)[] = []
    const guard = createAisleBracketCycleGuard()
    const run = (direction: -1 | 1) => cycles.push(direction)

    guard.handleKeydown({ bracketKey: 'left', direction: -1, run })
    guard.handleKeydown({ bracketKey: 'right', direction: 1, run })
    guard.handleKeyup('left')
    guard.handleKeydown({ bracketKey: 'right', direction: 1, repeat: true, run })
    vi.advanceTimersByTime(AISLE_BRACKET_CHORD_GUARD_MS)
    expect(cycles).toEqual([])

    guard.handleKeyup('right')
    guard.handleKeydown({ bracketKey: 'right', direction: 1, run })
    vi.advanceTimersByTime(AISLE_BRACKET_CHORD_GUARD_MS)
    expect(cycles).toEqual([1])
  })

  it('keeps held single-bracket repeat cycling responsive after the initial guard', () => {
    vi.useFakeTimers()
    const cycles: (-1 | 1)[] = []
    const guard = createAisleBracketCycleGuard()
    const run = (direction: -1 | 1) => cycles.push(direction)

    guard.handleKeydown({ bracketKey: 'left', direction: -1, run })
    vi.advanceTimersByTime(AISLE_BRACKET_CHORD_GUARD_MS)
    guard.handleKeydown({ bracketKey: 'left', direction: -1, repeat: true, run })
    guard.handleKeydown({ bracketKey: 'left', direction: -1, repeat: true, run })

    expect(cycles).toEqual([-1, -1, -1])
  })
})

describe('rail visibility hotkeys', () => {
  const hotkeys: AppState['hotkeys'] = {
    shortcuts: DEFAULT_SHORTCUTS,
    newlineShortcuts: DEFAULT_NEWLINE_SHORTCUT_SETTINGS,
  }

  it('maps saved openSpaces and openDomains shortcuts to rail visibility actions', () => {
    expect(getRailVisibilityShortcutTarget(keyboardEvent('s', { ctrlKey: true }), hotkeys, false)).toBe('space')
    expect(getRailVisibilityShortcutTarget(keyboardEvent('d', { ctrlKey: true }), hotkeys, false)).toBe('domain')
  })

  it('falls back to default command shortcuts when persisted hotkeys are partial', () => {
    const partialHotkeys = {
      newlineShortcuts: DEFAULT_NEWLINE_SHORTCUT_SETTINGS,
    } as AppState['hotkeys']

    expect(getRailVisibilityShortcutTarget(keyboardEvent('s', { ctrlKey: true }), partialHotkeys, false)).toBe('space')
    expect(getRailVisibilityShortcutTarget(keyboardEvent('d', { ctrlKey: true }), partialHotkeys, false)).toBe('domain')
  })

  it('captures rail shortcuts before the editor unless a settings shortcut is recording', () => {
    const event = keyboardEvent('s', { ctrlKey: true })

    expect(
      getCapturedRailVisibilityShortcutTarget({
        event,
        hotkeys,
        isMacPlatform: false,
        viewMode: 'main',
        editingShortcut: null,
      }),
    ).toBe('space')

    expect(
      getCapturedRailVisibilityShortcutTarget({
        event,
        hotkeys,
        isMacPlatform: false,
        viewMode: 'settings',
        editingShortcut: 'openSpaces',
      }),
    ).toBeNull()
  })
})

describe('settings hotkey', () => {
  it('matches platform primary comma shortcuts', () => {
    expect(isSettingsShortcut(keyboardEvent(',', { metaKey: true }), true)).toBe(true)
    expect(isSettingsShortcut(keyboardEvent(',', { ctrlKey: true }), false)).toBe(true)
  })

  it('ignores comma shortcuts with non-primary or mixed modifiers', () => {
    expect(isSettingsShortcut(keyboardEvent(',', { ctrlKey: true }), true)).toBe(false)
    expect(isSettingsShortcut(keyboardEvent(',', { metaKey: true }), false)).toBe(false)
    expect(isSettingsShortcut(keyboardEvent(',', { metaKey: true, ctrlKey: true }), true)).toBe(false)
    expect(isSettingsShortcut(keyboardEvent(',', { ctrlKey: true, altKey: true }), false)).toBe(false)
    expect(isSettingsShortcut(keyboardEvent(',', { ctrlKey: true, shiftKey: true }), false)).toBe(false)
  })
})

describe('delete focused subtab hotkey', () => {
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
