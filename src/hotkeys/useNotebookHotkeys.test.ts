import { describe, expect, it } from 'vitest'
import type { AppState } from '../types/app'
import { DEFAULT_NEWLINE_SHORTCUT_SETTINGS, DEFAULT_SHORTCUTS } from './shortcuts'
import {
  createNotebookMouseHistoryNavigationRecord,
  getNotebookHistoryNavigationDirection,
  getNotebookHotkeyIntent,
  getNotebookMouseHistoryNavigationDirection,
  shouldSuppressNotebookMouseHistoryFollowup,
  shouldIgnoreNotebookHotkeyEvent,
  updateNotebookMouseHistoryNavigationRecordForFollowup,
} from './useNotebookHotkeys'

const defaultHotkeys: AppState['hotkeys'] = {
  shortcuts: DEFAULT_SHORTCUTS,
  newlineShortcuts: DEFAULT_NEWLINE_SHORTCUT_SETTINGS,
}

function keyboardEvent(
  key: string,
  options: Partial<KeyboardEvent> = {},
): KeyboardEvent {
  return {
    key,
    code: options.code ?? key,
    ctrlKey: options.ctrlKey ?? false,
    metaKey: options.metaKey ?? false,
    altKey: options.altKey ?? false,
    shiftKey: options.shiftKey ?? false,
    defaultPrevented: options.defaultPrevented ?? false,
    target: options.target ?? null,
  } as KeyboardEvent
}

describe('notebook hotkey intents', () => {
  it('resolves mod comma to open settings on mac and windows', () => {
    expect(getNotebookHotkeyIntent({
      event: keyboardEvent(',', { code: 'Comma', metaKey: true }),
      hotkeys: defaultHotkeys,
      isMacPlatform: true,
      viewMode: 'main',
    })).toBe('openSettings')

    expect(getNotebookHotkeyIntent({
      event: keyboardEvent(',', { code: 'Comma', ctrlKey: true }),
      hotkeys: defaultHotkeys,
      isMacPlatform: false,
      viewMode: 'main',
    })).toBe('openSettings')
  })

  it('resolves notebook creation, filtering, aisle, and strikethrough shortcuts', () => {
    const hotkeys: AppState['hotkeys'] = {
      ...defaultHotkeys,
      shortcuts: {
        ...DEFAULT_SHORTCUTS,
        toggleNotesFilter: 'Mod+F',
        formatStrikethrough: 'Mod+Shift+X',
      },
    }

    expect(getNotebookHotkeyIntent({
      event: keyboardEvent('n', { code: 'KeyN', metaKey: true }),
      hotkeys,
      isMacPlatform: true,
      viewMode: 'main',
    })).toBe('newNote')
    expect(getNotebookHotkeyIntent({
      event: keyboardEvent('N', { code: 'KeyN', metaKey: true, shiftKey: true }),
      hotkeys,
      isMacPlatform: true,
      viewMode: 'main',
    })).toBe('newFolder')
    expect(getNotebookHotkeyIntent({
      event: keyboardEvent('w', { code: 'KeyW', metaKey: true }),
      hotkeys,
      isMacPlatform: true,
      viewMode: 'main',
    })).toBe('closeCurrentNote')
    expect(getNotebookHotkeyIntent({
      event: keyboardEvent('w', { code: 'KeyW', ctrlKey: true }),
      hotkeys,
      isMacPlatform: false,
      viewMode: 'main',
    })).toBe('closeCurrentNote')
    expect(getNotebookHotkeyIntent({
      event: keyboardEvent('t', { code: 'KeyT', metaKey: true }),
      hotkeys,
      isMacPlatform: true,
      viewMode: 'main',
    })).toBe('toggleNotesTrash')
    expect(getNotebookHotkeyIntent({
      event: keyboardEvent('f', { code: 'KeyF', metaKey: true }),
      hotkeys,
      isMacPlatform: true,
      viewMode: 'main',
    })).toBe('toggleNotesFilter')
    expect(getNotebookHotkeyIntent({
      event: keyboardEvent('[', { code: 'BracketLeft', altKey: true }),
      hotkeys,
      isMacPlatform: true,
      viewMode: 'main',
    })).toBe('cycleAislePrev')
    expect(getNotebookHotkeyIntent({
      event: keyboardEvent(']', { code: 'BracketRight', altKey: true }),
      hotkeys,
      isMacPlatform: true,
      viewMode: 'main',
    })).toBe('cycleAisleNext')
    expect(getNotebookHotkeyIntent({
      event: keyboardEvent('X', { code: 'KeyX', metaKey: true, shiftKey: true }),
      hotkeys,
      isMacPlatform: true,
      viewMode: 'main',
    })).toBe('formatStrikethrough')
    expect(getNotebookHotkeyIntent({
      event: keyboardEvent('Tab', { code: 'Tab', ctrlKey: true }),
      hotkeys,
      isMacPlatform: true,
      viewMode: 'main',
    })).toBe('cyclePinnedNoteTabNext')
    expect(getNotebookHotkeyIntent({
      event: keyboardEvent('Tab', { code: 'Tab', ctrlKey: true, shiftKey: true }),
      hotkeys,
      isMacPlatform: true,
      viewMode: 'main',
    })).toBe('cyclePinnedNoteTabPrev')
    expect(getNotebookHotkeyIntent({
      event: keyboardEvent('T', { code: 'KeyT', metaKey: true, shiftKey: true }),
      hotkeys,
      isMacPlatform: true,
      viewMode: 'main',
    })).toBe('reopenClosedNoteTab')
    expect(getNotebookHotkeyIntent({
      event: keyboardEvent('T', { code: 'KeyT', ctrlKey: true, shiftKey: true }),
      hotkeys,
      isMacPlatform: false,
      viewMode: 'main',
    })).toBe('reopenClosedNoteTab')
  })

  it('exposes scratchpad toggle but keeps main-editor-only commands in the main view', () => {
    expect(getNotebookHotkeyIntent({
      event: keyboardEvent('s', { code: 'KeyS', metaKey: true }),
      hotkeys: defaultHotkeys,
      isMacPlatform: true,
      viewMode: 'main',
    })).toBe('toggleNotesScratchpad')
    expect(getNotebookHotkeyIntent({
      event: keyboardEvent('s', { code: 'KeyS', metaKey: true }),
      hotkeys: defaultHotkeys,
      isMacPlatform: true,
      viewMode: 'settings',
    })).toBe('toggleNotesScratchpad')
    expect(getNotebookHotkeyIntent({
      event: keyboardEvent('[', { code: 'BracketLeft', altKey: true }),
      hotkeys: defaultHotkeys,
      isMacPlatform: true,
      viewMode: 'settings',
    })).toBeNull()
    expect(getNotebookHotkeyIntent({
      event: keyboardEvent('w', { code: 'KeyW', metaKey: true }),
      hotkeys: defaultHotkeys,
      isMacPlatform: true,
      viewMode: 'settings',
    })).toBeNull()
    expect(getNotebookHotkeyIntent({
      event: keyboardEvent('Tab', { code: 'Tab', ctrlKey: true }),
      hotkeys: defaultHotkeys,
      isMacPlatform: true,
      viewMode: 'settings',
    })).toBeNull()
    expect(getNotebookHotkeyIntent({
      event: keyboardEvent('T', { code: 'KeyT', metaKey: true, shiftKey: true }),
      hotkeys: defaultHotkeys,
      isMacPlatform: true,
      viewMode: 'settings',
    })).toBeNull()
  })

  it('does not hijack unmodified printable typing inside editable targets', () => {
    const editableTarget = {
      closest: (selector: string) => selector.includes('input') ? {} : null,
    } as unknown as EventTarget
    const event = keyboardEvent('a', { code: 'KeyA', target: editableTarget })

    expect(shouldIgnoreNotebookHotkeyEvent(event)).toBe(true)
    expect(getNotebookHotkeyIntent({
      event,
      hotkeys: defaultHotkeys,
      isMacPlatform: true,
      viewMode: 'main',
    })).toBeNull()
  })

  it('recognizes restored history navigation keys without using Mac command arrows', () => {
    expect(getNotebookHistoryNavigationDirection(
      keyboardEvent('[', { code: 'BracketLeft', metaKey: true }),
      true,
    )).toBe(-1)
    expect(getNotebookHistoryNavigationDirection(
      keyboardEvent(']', { code: 'BracketRight', metaKey: true }),
      true,
    )).toBe(1)
    expect(getNotebookHistoryNavigationDirection(
      keyboardEvent('ArrowLeft', { code: 'ArrowLeft', altKey: true }),
      false,
    )).toBe(-1)
    expect(getNotebookHistoryNavigationDirection(
      keyboardEvent('ArrowRight', { code: 'ArrowRight', altKey: true }),
      false,
    )).toBe(1)
    expect(getNotebookHistoryNavigationDirection(
      keyboardEvent('BrowserBack', { code: 'BrowserBack' }),
      true,
    )).toBe(-1)
    expect(getNotebookHistoryNavigationDirection(
      keyboardEvent('BrowserForward', { code: 'BrowserForward' }),
      false,
    )).toBe(1)
    expect(getNotebookHistoryNavigationDirection(
      keyboardEvent('ArrowLeft', { code: 'ArrowLeft', metaKey: true }),
      true,
    )).toBeNull()
    expect(getNotebookHistoryNavigationDirection(
      keyboardEvent('ArrowRight', { code: 'ArrowRight', metaKey: true }),
      true,
    )).toBeNull()
  })

  it('recognizes mouse side buttons for history navigation', () => {
    expect(getNotebookMouseHistoryNavigationDirection({ button: 3 })).toBe(-1)
    expect(getNotebookMouseHistoryNavigationDirection({ button: 4 })).toBe(1)
    expect(getNotebookMouseHistoryNavigationDirection({ button: 0 })).toBeNull()
    expect(getNotebookMouseHistoryNavigationDirection({ button: 3, defaultPrevented: true })).toBeNull()
  })

  it('creates early mouse history records for side buttons only', () => {
    expect(createNotebookMouseHistoryNavigationRecord({ button: 3 })).toEqual({ button: 3, released: false })
    expect(createNotebookMouseHistoryNavigationRecord({ button: 4 })).toEqual({ button: 4, released: false })
    expect(createNotebookMouseHistoryNavigationRecord({ button: 0 })).toBeNull()
  })

  it('dedupes later mouse events from the same side-button navigation', () => {
    const record = createNotebookMouseHistoryNavigationRecord({ button: 3 })

    expect(shouldSuppressNotebookMouseHistoryFollowup({ button: 3 }, record, 'press')).toBe(true)
    expect(shouldSuppressNotebookMouseHistoryFollowup({ button: 4 }, record, 'press')).toBe(false)

    const released = updateNotebookMouseHistoryNavigationRecordForFollowup(record, 'release')
    expect(released).toEqual({ button: 3, released: true })
    expect(shouldSuppressNotebookMouseHistoryFollowup({ button: 3 }, released, 'press')).toBe(false)
    expect(shouldSuppressNotebookMouseHistoryFollowup({ button: 3 }, released, 'auxclick')).toBe(true)
    expect(updateNotebookMouseHistoryNavigationRecordForFollowup(released, 'auxclick')).toBeNull()
  })
})
