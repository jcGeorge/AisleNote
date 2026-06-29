import { describe, expect, it } from 'vitest'
import type { AppState } from '../types/app'
import { DEFAULT_NEWLINE_SHORTCUT_SETTINGS, DEFAULT_SHORTCUTS } from './shortcuts'
import {
  createVaultMouseHistoryNavigationRecord,
  getVaultHistoryNavigationDirection,
  getVaultHotkeyIntent,
  getVaultMouseHistoryNavigationDirection,
  shouldSuppressVaultMouseHistoryFollowup,
  shouldIgnoreVaultHotkeyEvent,
  updateVaultMouseHistoryNavigationRecordForFollowup,
} from './useVaultHotkeys'

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

function editorTarget(): EventTarget {
  return {
    closest: (selector: string) => selector.includes('.ProseMirror') ? {} : null,
  } as unknown as EventTarget
}

describe('vault hotkey intents', () => {
  it('resolves mod comma to open settings on mac and windows', () => {
    expect(getVaultHotkeyIntent({
      event: keyboardEvent(',', { code: 'Comma', metaKey: true }),
      hotkeys: defaultHotkeys,
      isMacPlatform: true,
      viewMode: 'main',
    })).toBe('openSettings')

    expect(getVaultHotkeyIntent({
      event: keyboardEvent(',', { code: 'Comma', ctrlKey: true }),
      hotkeys: defaultHotkeys,
      isMacPlatform: false,
      viewMode: 'main',
    })).toBe('openSettings')
  })

  it('resolves vault creation, aisle, and strikethrough shortcuts', () => {
    const hotkeys: AppState['hotkeys'] = {
      ...defaultHotkeys,
      shortcuts: {
        ...DEFAULT_SHORTCUTS,
        formatStrikethrough: 'Mod+Shift+X',
      },
    }

    expect(getVaultHotkeyIntent({
      event: keyboardEvent('n', { code: 'KeyN', metaKey: true }),
      hotkeys,
      isMacPlatform: true,
      viewMode: 'main',
    })).toBe('newNote')
    expect(getVaultHotkeyIntent({
      event: keyboardEvent('N', { code: 'KeyN', metaKey: true, shiftKey: true }),
      hotkeys,
      isMacPlatform: true,
      viewMode: 'main',
    })).toBe('newFolder')
    expect(getVaultHotkeyIntent({
      event: keyboardEvent('w', { code: 'KeyW', metaKey: true }),
      hotkeys,
      isMacPlatform: true,
      viewMode: 'main',
    })).toBe('closeCurrentNote')
    expect(getVaultHotkeyIntent({
      event: keyboardEvent('w', { code: 'KeyW', ctrlKey: true }),
      hotkeys,
      isMacPlatform: false,
      viewMode: 'main',
    })).toBe('closeCurrentNote')
    expect(getVaultHotkeyIntent({
      event: keyboardEvent('t', { code: 'KeyT', metaKey: true }),
      hotkeys,
      isMacPlatform: true,
      viewMode: 'main',
    })).toBe('toggleNotesTrash')
    expect(getVaultHotkeyIntent({
      event: keyboardEvent('ArrowLeft', { code: 'ArrowLeft', metaKey: true, altKey: true }),
      hotkeys,
      isMacPlatform: true,
      viewMode: 'main',
    })).toBe('cycleAislePrev')
    expect(getVaultHotkeyIntent({
      event: keyboardEvent('ArrowRight', { code: 'ArrowRight', metaKey: true, altKey: true }),
      hotkeys,
      isMacPlatform: true,
      viewMode: 'main',
    })).toBe('cycleAisleNext')
    expect(getVaultHotkeyIntent({
      event: keyboardEvent('X', { code: 'KeyX', metaKey: true, shiftKey: true }),
      hotkeys,
      isMacPlatform: true,
      viewMode: 'main',
    })).toBe('formatStrikethrough')
    expect(getVaultHotkeyIntent({
      event: keyboardEvent('H', { code: 'KeyH', metaKey: true, shiftKey: true }),
      hotkeys,
      isMacPlatform: true,
      viewMode: 'main',
    })).toBe('formatHighlight')
    expect(getVaultHotkeyIntent({
      event: keyboardEvent('H', { code: 'KeyH', ctrlKey: true, shiftKey: true }),
      hotkeys,
      isMacPlatform: false,
      viewMode: 'main',
    })).toBe('formatHighlight')
    expect(getVaultHotkeyIntent({
      event: keyboardEvent('V', { code: 'KeyV', metaKey: true, shiftKey: true, target: editorTarget() }),
      hotkeys,
      isMacPlatform: true,
      viewMode: 'main',
    })).toBe('pastePlainText')
    expect(getVaultHotkeyIntent({
      event: keyboardEvent('V', { code: 'KeyV', ctrlKey: true, shiftKey: true, target: editorTarget() }),
      hotkeys,
      isMacPlatform: false,
      viewMode: 'main',
    })).toBe('pastePlainText')
    expect(getVaultHotkeyIntent({
      event: keyboardEvent('Tab', { code: 'Tab', ctrlKey: true }),
      hotkeys,
      isMacPlatform: true,
      viewMode: 'main',
    })).toBe('cyclePinnedNoteTabNext')
    expect(getVaultHotkeyIntent({
      event: keyboardEvent('Tab', { code: 'Tab', ctrlKey: true, shiftKey: true }),
      hotkeys,
      isMacPlatform: true,
      viewMode: 'main',
    })).toBe('cyclePinnedNoteTabPrev')
    expect(getVaultHotkeyIntent({
      event: keyboardEvent('T', { code: 'KeyT', metaKey: true, shiftKey: true }),
      hotkeys,
      isMacPlatform: true,
      viewMode: 'main',
    })).toBe('reopenClosedNoteTab')
    expect(getVaultHotkeyIntent({
      event: keyboardEvent('T', { code: 'KeyT', ctrlKey: true, shiftKey: true }),
      hotkeys,
      isMacPlatform: false,
      viewMode: 'main',
    })).toBe('reopenClosedNoteTab')
  })

  it('exposes scratchpad toggle but keeps main-editor-only commands in the main view', () => {
    expect(getVaultHotkeyIntent({
      event: keyboardEvent('s', { code: 'KeyS', metaKey: true }),
      hotkeys: defaultHotkeys,
      isMacPlatform: true,
      viewMode: 'main',
    })).toBe('toggleNotesScratchpad')
    expect(getVaultHotkeyIntent({
      event: keyboardEvent('s', { code: 'KeyS', metaKey: true }),
      hotkeys: defaultHotkeys,
      isMacPlatform: true,
      viewMode: 'settings',
    })).toBe('toggleNotesScratchpad')
    expect(getVaultHotkeyIntent({
      event: keyboardEvent('ArrowLeft', { code: 'ArrowLeft', metaKey: true, altKey: true }),
      hotkeys: defaultHotkeys,
      isMacPlatform: true,
      viewMode: 'settings',
    })).toBeNull()
    expect(getVaultHotkeyIntent({
      event: keyboardEvent('w', { code: 'KeyW', metaKey: true }),
      hotkeys: defaultHotkeys,
      isMacPlatform: true,
      viewMode: 'settings',
    })).toBeNull()
    expect(getVaultHotkeyIntent({
      event: keyboardEvent('Tab', { code: 'Tab', ctrlKey: true }),
      hotkeys: defaultHotkeys,
      isMacPlatform: true,
      viewMode: 'settings',
    })).toBeNull()
    expect(getVaultHotkeyIntent({
      event: keyboardEvent('T', { code: 'KeyT', metaKey: true, shiftKey: true }),
      hotkeys: defaultHotkeys,
      isMacPlatform: true,
      viewMode: 'settings',
    })).toBeNull()
    expect(getVaultHotkeyIntent({
      event: keyboardEvent('H', { code: 'KeyH', metaKey: true, shiftKey: true }),
      hotkeys: defaultHotkeys,
      isMacPlatform: true,
      viewMode: 'settings',
    })).toBeNull()
    expect(getVaultHotkeyIntent({
      event: keyboardEvent('V', { code: 'KeyV', metaKey: true, shiftKey: true, target: editorTarget() }),
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

    expect(shouldIgnoreVaultHotkeyEvent(event)).toBe(true)
    expect(getVaultHotkeyIntent({
      event,
      hotkeys: defaultHotkeys,
      isMacPlatform: true,
      viewMode: 'main',
    })).toBeNull()
  })

  it('requires the paste-as-plain-text hotkey to start from editor content and allows reassignment', () => {
    const editableTarget = {
      closest: (selector: string) => selector.includes('input') ? {} : null,
    } as unknown as EventTarget
    const reassignedHotkeys: AppState['hotkeys'] = {
      ...defaultHotkeys,
      shortcuts: {
        ...DEFAULT_SHORTCUTS,
        pastePlainText: 'Mod+Alt+V',
      },
    }

    expect(getVaultHotkeyIntent({
      event: keyboardEvent('V', { code: 'KeyV', metaKey: true, shiftKey: true, target: editableTarget }),
      hotkeys: defaultHotkeys,
      isMacPlatform: true,
      viewMode: 'main',
    })).toBeNull()
    expect(getVaultHotkeyIntent({
      event: keyboardEvent('V', { code: 'KeyV', metaKey: true, shiftKey: true, target: editorTarget() }),
      hotkeys: reassignedHotkeys,
      isMacPlatform: true,
      viewMode: 'main',
    })).toBeNull()
    expect(getVaultHotkeyIntent({
      event: keyboardEvent('v', { code: 'KeyV', metaKey: true, altKey: true, target: editorTarget() }),
      hotkeys: reassignedHotkeys,
      isMacPlatform: true,
      viewMode: 'main',
    })).toBe('pastePlainText')
  })

  it('recognizes restored history navigation keys without using Mac command arrows', () => {
    expect(getVaultHistoryNavigationDirection(
      keyboardEvent('[', { code: 'BracketLeft', metaKey: true }),
      true,
    )).toBe(-1)
    expect(getVaultHistoryNavigationDirection(
      keyboardEvent(']', { code: 'BracketRight', metaKey: true }),
      true,
    )).toBe(1)
    expect(getVaultHistoryNavigationDirection(
      keyboardEvent('ArrowLeft', { code: 'ArrowLeft', altKey: true }),
      false,
    )).toBe(-1)
    expect(getVaultHistoryNavigationDirection(
      keyboardEvent('ArrowRight', { code: 'ArrowRight', altKey: true }),
      false,
    )).toBe(1)
    expect(getVaultHistoryNavigationDirection(
      keyboardEvent('BrowserBack', { code: 'BrowserBack' }),
      true,
    )).toBe(-1)
    expect(getVaultHistoryNavigationDirection(
      keyboardEvent('BrowserForward', { code: 'BrowserForward' }),
      false,
    )).toBe(1)
    expect(getVaultHistoryNavigationDirection(
      keyboardEvent('ArrowLeft', { code: 'ArrowLeft', metaKey: true }),
      true,
    )).toBeNull()
    expect(getVaultHistoryNavigationDirection(
      keyboardEvent('ArrowRight', { code: 'ArrowRight', metaKey: true }),
      true,
    )).toBeNull()
  })

  it('recognizes mouse side buttons for history navigation', () => {
    expect(getVaultMouseHistoryNavigationDirection({ button: 3 })).toBe(-1)
    expect(getVaultMouseHistoryNavigationDirection({ button: 4 })).toBe(1)
    expect(getVaultMouseHistoryNavigationDirection({ button: 0 })).toBeNull()
    expect(getVaultMouseHistoryNavigationDirection({ button: 3, defaultPrevented: true })).toBeNull()
  })

  it('creates early mouse history records for side buttons only', () => {
    expect(createVaultMouseHistoryNavigationRecord({ button: 3 })).toEqual({ button: 3, released: false })
    expect(createVaultMouseHistoryNavigationRecord({ button: 4 })).toEqual({ button: 4, released: false })
    expect(createVaultMouseHistoryNavigationRecord({ button: 0 })).toBeNull()
  })

  it('dedupes later mouse events from the same side-button navigation', () => {
    const record = createVaultMouseHistoryNavigationRecord({ button: 3 })

    expect(shouldSuppressVaultMouseHistoryFollowup({ button: 3 }, record, 'press')).toBe(true)
    expect(shouldSuppressVaultMouseHistoryFollowup({ button: 4 }, record, 'press')).toBe(false)

    const released = updateVaultMouseHistoryNavigationRecordForFollowup(record, 'release')
    expect(released).toEqual({ button: 3, released: true })
    expect(shouldSuppressVaultMouseHistoryFollowup({ button: 3 }, released, 'press')).toBe(false)
    expect(shouldSuppressVaultMouseHistoryFollowup({ button: 3 }, released, 'auxclick')).toBe(true)
    expect(updateVaultMouseHistoryNavigationRecordForFollowup(released, 'auxclick')).toBeNull()
  })
})
