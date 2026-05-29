import { describe, expect, it } from 'vitest'
import {
  getCursorRestoreFocusIntent,
  getSavedCursorRestoreIntentOnActivation,
  shouldFocusPendingCursorRestore,
  shouldFocusSavedCursorRestoreOnActivation,
} from './cursor-restore-focus'
import { getPersistableCursorSelectionForActiveEditor } from './useNoteCursorPersistence'
import { shouldFocusForEditorIntent } from './focus-intent'

describe('pending note cursor restore focus', () => {
  it('focuses explicit pending focus requests', () => {
    expect(shouldFocusPendingCursorRestore('aisle-1', 'aisle-1')).toBe(true)
    expect(getCursorRestoreFocusIntent({ pendingFocusAisleId: 'aisle-1', targetAisleId: 'aisle-1' })).toBe('aisle-activation')
    expect(shouldFocusPendingCursorRestore('aisle-1', 'aisle-2')).toBe(false)
    expect(shouldFocusPendingCursorRestore(null, 'aisle-1')).toBe(false)
    expect(shouldFocusPendingCursorRestore('', 'aisle-1')).toBe(false)
  })

  it('focuses saved cursor restores only when navigation requested focus', () => {
    expect(shouldFocusPendingCursorRestore(null, 'aisle-1', true)).toBe(true)
    expect(
      getCursorRestoreFocusIntent({
        pendingFocusAisleId: null,
        targetAisleId: 'aisle-1',
        savedFocusIntent: 'note-navigation',
      }),
    ).toBe('note-navigation')
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
      getSavedCursorRestoreIntentOnActivation({
        previousNoteLocationKey: '',
        activeNoteLocationKey: 'domain::space::tab::__home__',
        previousViewMode: null,
        viewMode: 'main',
        hasSavedSelection: true,
      }),
    ).toBe('none')
    expect(
      shouldFocusSavedCursorRestoreOnActivation({
        previousNoteLocationKey: 'domain::space::one::__home__',
        activeNoteLocationKey: 'domain::space::two::__home__',
        previousViewMode: 'main',
        viewMode: 'main',
        hasSavedSelection: true,
      }),
    ).toBe(true)
    expect(
      getSavedCursorRestoreIntentOnActivation({
        previousNoteLocationKey: 'domain::space::one::__home__',
        activeNoteLocationKey: 'domain::space::two::__home__',
        previousViewMode: 'main',
        viewMode: 'main',
        hasSavedSelection: true,
      }),
    ).toBe('note-navigation')
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

  it('keeps initial-load and none intents silent', () => {
    expect(shouldFocusForEditorIntent('initial-load')).toBe(false)
    expect(shouldFocusForEditorIntent('none')).toBe(false)
    expect(shouldFocusForEditorIntent('toolbar-command')).toBe(true)
  })
})

describe('active editor cursor persistence', () => {
  it('persists cursor selections only when the editor belongs to the active aisle', () => {
    expect(
      getPersistableCursorSelectionForActiveEditor({
        activeAisleId: 'aisle-2',
        activeEditorAisleId: 'aisle-2',
        rawSelection: { anchor: 99, head: 3 },
        docSize: 10,
        updatedAt: 12,
      }),
    ).toEqual({ anchor: 10, head: 3, updatedAt: 12 })

    expect(
      getPersistableCursorSelectionForActiveEditor({
        activeAisleId: 'aisle-2',
        activeEditorAisleId: 'aisle-1',
        rawSelection: { anchor: 4, head: 4 },
        docSize: 10,
        updatedAt: 12,
      }),
    ).toBeNull()
  })
})
