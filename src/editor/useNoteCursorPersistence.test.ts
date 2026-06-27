import { describe, expect, it } from 'vitest'
import {
  getCursorRestoreFocusIntent,
  getSavedCursorRestoreIntentOnActivation,
  shouldFocusPendingCursorRestore,
  shouldFocusSavedCursorRestoreOnActivation,
} from './cursor-restore-focus'
import {
  getCachedOrStoredCursorSelection,
  getPendingCursorRestoreTargetAisleId,
  getPreferredCursorRestoreAisleId,
  getPersistableCursorSelectionForActiveEditor,
  isPendingCursorRestoreTargetCurrent,
  shouldClearSuppressedSavedCursorRestore,
} from './useNoteCursorPersistence'
import { shouldFocusForEditorIntent } from './focus-intent'
import type { NoteCursorSelection } from '../types/app'

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
        activeNoteLocationKey: 'note-main',
        previousViewMode: null,
        viewMode: 'main',
        hasSavedSelection: true,
      }),
    ).toBe(false)
    expect(
      getSavedCursorRestoreIntentOnActivation({
        previousNoteLocationKey: '',
        activeNoteLocationKey: 'note-main',
        previousViewMode: null,
        viewMode: 'main',
        hasSavedSelection: true,
      }),
    ).toBe('none')
    expect(
      shouldFocusSavedCursorRestoreOnActivation({
        previousNoteLocationKey: 'note-one',
        activeNoteLocationKey: 'note-two',
        previousViewMode: 'main',
        viewMode: 'main',
        hasSavedSelection: true,
      }),
    ).toBe(true)
    expect(
      getSavedCursorRestoreIntentOnActivation({
        previousNoteLocationKey: 'note-one',
        activeNoteLocationKey: 'note-two',
        previousViewMode: 'main',
        viewMode: 'main',
        hasSavedSelection: true,
      }),
    ).toBe('note-navigation')
  })

  it('focuses saved cursor restores when returning to the same note from another view', () => {
    expect(
      shouldFocusSavedCursorRestoreOnActivation({
        previousNoteLocationKey: 'note-main',
        activeNoteLocationKey: 'note-main',
        previousViewMode: 'settings',
        viewMode: 'main',
        hasSavedSelection: true,
      }),
    ).toBe(true)
    expect(
      shouldFocusSavedCursorRestoreOnActivation({
        previousNoteLocationKey: 'note-main',
        activeNoteLocationKey: 'note-main',
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

  it('suppresses saved cursor restore targets while tag navigation is pending', () => {
    const pendingCursorRestore = {
      noteLocationKey: 'note-main',
      aisleId: 'saved-aisle',
    }

    expect(
      getPendingCursorRestoreTargetAisleId({
        pendingFocusAisleId: null,
        pendingCursorRestore,
        activeNoteLocationKey: 'note-main',
        suppressSavedCursorRestore: true,
      }),
    ).toBe('')
    expect(
      shouldClearSuppressedSavedCursorRestore({
        pendingFocusAisleId: null,
        pendingCursorRestore,
        activeNoteLocationKey: 'note-main',
        suppressSavedCursorRestore: true,
      }),
    ).toBe(true)
    expect(
      getPendingCursorRestoreTargetAisleId({
        pendingFocusAisleId: 'explicit-aisle',
        pendingCursorRestore,
        activeNoteLocationKey: 'note-main',
        suppressSavedCursorRestore: true,
      }),
    ).toBe('explicit-aisle')
    expect(
      shouldClearSuppressedSavedCursorRestore({
        pendingFocusAisleId: 'explicit-aisle',
        pendingCursorRestore,
        activeNoteLocationKey: 'note-main',
        suppressSavedCursorRestore: true,
      }),
    ).toBe(false)
  })

  it('detects when a scheduled cursor restore target has gone stale', () => {
    const pendingCursorRestore = {
      noteLocationKey: 'note-main',
      aisleId: 'saved-aisle',
    }

    expect(
      isPendingCursorRestoreTargetCurrent({
        pendingFocusAisleId: null,
        pendingCursorRestore,
        activeNoteLocationKey: 'note-main',
        suppressSavedCursorRestore: false,
        expectedTargetAisleId: 'saved-aisle',
      }),
    ).toBe(true)

    expect(
      isPendingCursorRestoreTargetCurrent({
        pendingFocusAisleId: null,
        pendingCursorRestore: null,
        activeNoteLocationKey: 'note-main',
        suppressSavedCursorRestore: false,
        expectedTargetAisleId: 'saved-aisle',
      }),
    ).toBe(false)
  })

  it('prefers an explicit history aisle target over the saved active aisle', () => {
    const aisles = [
      { id: 'aisle-first' },
      { id: 'aisle-saved' },
      { id: 'aisle-history' },
    ]

    expect(
      getPreferredCursorRestoreAisleId({
        pendingFocusAisleId: 'aisle-history',
        savedActiveAisleId: 'aisle-saved',
        aisles,
      }),
    ).toBe('aisle-history')
    expect(
      getPreferredCursorRestoreAisleId({
        pendingFocusAisleId: 'aisle-missing',
        savedActiveAisleId: 'aisle-saved',
        aisles,
      }),
    ).toBe('aisle-saved')
  })
})

describe('active editor cursor persistence', () => {
  it('prefers the synchronous cursor cache over persisted cursor state', () => {
    const storedSelection = { anchor: 1, head: 1, updatedAt: 1 }
    const cachedSelection = { anchor: 8, head: 8, updatedAt: 2 }
    const noteLocationKey = 'note-main'
    const cache = new Map<string, NoteCursorSelection | null>([
      [`${noteLocationKey}::aisle-1`, cachedSelection],
    ])
    const stored = {
      [noteLocationKey]: {
        activeAisleId: 'aisle-1',
        aisles: { 'aisle-1': storedSelection },
        updatedAt: 1,
      },
    }

    expect(getCachedOrStoredCursorSelection(cache, stored, noteLocationKey, 'aisle-1')).toBe(cachedSelection)
    expect(getCachedOrStoredCursorSelection(new Map(), stored, noteLocationKey, 'aisle-1')).toBe(storedSelection)
  })

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
