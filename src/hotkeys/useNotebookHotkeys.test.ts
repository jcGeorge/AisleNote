import { describe, expect, it } from 'vitest'
import type { AppState } from '../types/app'
import { DEFAULT_NEWLINE_SHORTCUT_SETTINGS, DEFAULT_SHORTCUTS } from './shortcuts'
import {
  getNotebookHotkeyIntent,
  shouldIgnoreNotebookHotkeyEvent,
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
  })

  it('does not expose scratchpad or main-editor commands as utility-shell intents', () => {
    expect(getNotebookHotkeyIntent({
      event: keyboardEvent('/', { code: 'Slash', metaKey: true }),
      hotkeys: defaultHotkeys,
      isMacPlatform: true,
      viewMode: 'main',
    })).toBeNull()
    expect(getNotebookHotkeyIntent({
      event: keyboardEvent('[', { code: 'BracketLeft', altKey: true }),
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
})
