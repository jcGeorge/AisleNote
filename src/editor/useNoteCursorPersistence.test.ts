import { describe, expect, it } from 'vitest'
import {
  shouldFocusPendingCursorRestore,
  shouldFocusSavedCursorRestoreOnActivation,
} from './cursor-restore-focus'

describe('pending note cursor restore focus', () => {
  it('focuses explicit pending focus requests', () => {
    expect(shouldFocusPendingCursorRestore('aisle-1', 'aisle-1')).toBe(true)
    expect(shouldFocusPendingCursorRestore('aisle-1', 'aisle-2')).toBe(false)
    expect(shouldFocusPendingCursorRestore(null, 'aisle-1')).toBe(false)
    expect(shouldFocusPendingCursorRestore('', 'aisle-1')).toBe(false)
  })

  it('focuses saved cursor restores only when navigation requested focus', () => {
    expect(shouldFocusPendingCursorRestore(null, 'aisle-1', true)).toBe(true)
    expect(shouldFocusPendingCursorRestore('', 'aisle-1', true)).toBe(true)
    expect(shouldFocusPendingCursorRestore(null, 'aisle-1', false)).toBe(false)
    expect(shouldFocusPendingCursorRestore('aisle-2', 'aisle-1', true)).toBe(false)
  })

  it('focuses saved cursor restores after note navigation but not initial app load', () => {
    expect(
      shouldFocusSavedCursorRestoreOnActivation({
        previousNoteLocationKey: '',
        activeNoteLocationKey: 'domain::space::tab::__home__',
        previousViewMode: null,
        viewMode: 'main',
        hasSavedSelection: true,
      }),
    ).toBe(false)
    expect(
      shouldFocusSavedCursorRestoreOnActivation({
        previousNoteLocationKey: 'domain::space::one::__home__',
        activeNoteLocationKey: 'domain::space::two::__home__',
        previousViewMode: 'main',
        viewMode: 'main',
        hasSavedSelection: true,
      }),
    ).toBe(true)
  })

  it('focuses saved cursor restores when returning to the same note from another view', () => {
    expect(
      shouldFocusSavedCursorRestoreOnActivation({
        previousNoteLocationKey: 'domain::space::tab::__home__',
        activeNoteLocationKey: 'domain::space::tab::__home__',
        previousViewMode: 'settings',
        viewMode: 'main',
        hasSavedSelection: true,
      }),
    ).toBe(true)
    expect(
      shouldFocusSavedCursorRestoreOnActivation({
        previousNoteLocationKey: 'domain::space::tab::__home__',
        activeNoteLocationKey: 'domain::space::tab::__home__',
        previousViewMode: 'settings',
        viewMode: 'main',
        hasSavedSelection: false,
      }),
    ).toBe(false)
  })
})
