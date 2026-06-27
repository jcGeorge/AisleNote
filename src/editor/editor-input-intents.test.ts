import { describe, expect, it } from 'vitest'
import {
  getEditorKeyboardHistoryDirection,
  resolveEditorNavigationIntent,
  resolveEditorBeforeInputIntent,
  resolveEditorKeyDownIntent,
  type EditorNavigationIntent,
  type EditorKeyDownIntentInput,
} from './editor-input-intents'

const noNavigationIntent: EditorNavigationIntent = { type: 'none' }

function keyInput(overrides: Partial<EditorKeyDownIntentInput>): EditorKeyDownIntentInput {
  return {
    key: 'a',
    isTextInputTarget: false,
    hasActiveImage: false,
    hasActiveTableCell: false,
    hasMultiLineEdit: false,
    toolbarFormatShortcut: null,
    editorHistoryDirection: null,
    newlineOperation: null,
    navigationIntent: noNavigationIntent,
    tableBoundaryDirection: null,
    multiLineSelectionDirection: null,
    ...overrides,
  }
}

describe('editor input intent resolution', () => {
  it('prioritizes editor history before newline shortcuts or normal typing', () => {
    expect(
      resolveEditorKeyDownIntent(keyInput({
        key: 'z',
        metaKey: true,
        editorHistoryDirection: 'undo',
        newlineOperation: 'task',
        hasMultiLineEdit: true,
      })),
    ).toEqual({ type: 'history', direction: 'undo' })
  })

  it('maps primary modifier undo and redo shortcuts by platform', () => {
    expect(getEditorKeyboardHistoryDirection({ key: 'z', ctrlKey: true }, false)).toBe('undo')
    expect(getEditorKeyboardHistoryDirection({ key: 'z', code: 'KeyZ', ctrlKey: true, shiftKey: true }, false)).toBe(
      'redo',
    )
    expect(getEditorKeyboardHistoryDirection({ key: 'y', ctrlKey: true }, false)).toBe('redo')
    expect(getEditorKeyboardHistoryDirection({ key: 'z', metaKey: true }, true)).toBe('undo')
    expect(getEditorKeyboardHistoryDirection({ key: 'z', metaKey: true, shiftKey: true }, true)).toBe('redo')
    expect(getEditorKeyboardHistoryDirection({ key: 'z', ctrlKey: true }, true)).toBeNull()
    expect(getEditorKeyboardHistoryDirection({ key: 'z', ctrlKey: true, altKey: true }, false)).toBeNull()
  })

  it('blocks newline shortcuts from text inputs', () => {
    expect(
      resolveEditorKeyDownIntent(keyInput({
        key: 'Enter',
        isTextInputTarget: true,
        newlineOperation: 'task',
      })),
    ).toEqual({ type: 'none' })
  })

  it('routes multiline edits before single-cursor space shortcuts', () => {
    expect(
      resolveEditorKeyDownIntent(keyInput({
        key: ' ',
        hasMultiLineEdit: true,
      })),
    ).toEqual({ type: 'multiline-space' })
  })

  it('routes plain space to the paragraph marker shortcut outside multiline mode', () => {
    expect(
      resolveEditorKeyDownIntent(keyInput({
        key: ' ',
        hasMultiLineEdit: false,
      })),
    ).toEqual({ type: 'paragraph-space-shortcut' })
  })

  it('keeps table boundary movement ahead of generic page or multiline handling', () => {
    expect(
      resolveEditorKeyDownIntent(keyInput({
        key: 'ArrowRight',
        tableBoundaryDirection: 'after',
        navigationIntent: { type: 'page-movement', movement: 'page-down', extendSelection: false },
      })),
    ).toEqual({ type: 'table-boundary-caret', direction: 'after' })
  })

  it('routes normal document-boundary navigation only outside multiline mode', () => {
    expect(
      resolveEditorKeyDownIntent(keyInput({
        key: 'ArrowUp',
        navigationIntent: {
          type: 'document-boundary',
          direction: 'start',
          extendSelection: false,
        },
      })),
    ).toEqual({ type: 'document-boundary-selection', direction: 'start', extendSelection: false })
    expect(
      resolveEditorKeyDownIntent(keyInput({
        key: 'ArrowDown',
        navigationIntent: {
          type: 'document-boundary',
          direction: 'end',
          extendSelection: true,
        },
      })),
    ).toEqual({ type: 'document-boundary-selection', direction: 'end', extendSelection: true })
    expect(
      resolveEditorKeyDownIntent(keyInput({
        key: 'ArrowDown',
        hasMultiLineEdit: true,
        navigationIntent: {
          type: 'document-boundary',
          direction: 'end',
          extendSelection: false,
        },
      })),
    ).toEqual({ type: 'multiline-move', movement: 'down' })
  })

  it('resolves mac document and page navigation from event fields only', () => {
    expect(
      resolveEditorNavigationIntent({
        key: 'ArrowUp',
        code: 'ArrowUp',
        metaKey: true,
        isMacPlatform: true,
      }),
    ).toEqual({ type: 'document-boundary', direction: 'start', extendSelection: false })
    expect(
      resolveEditorNavigationIntent({
        key: 'ArrowDown',
        code: 'ArrowDown',
        metaKey: true,
        shiftKey: true,
        isMacPlatform: true,
      }),
    ).toEqual({ type: 'document-boundary', direction: 'end', extendSelection: true })
    expect(
      resolveEditorNavigationIntent({
        key: 'ArrowDown',
        code: 'ArrowDown',
        altKey: true,
        isMacPlatform: true,
      }),
    ).toEqual({ type: 'native', reason: 'paragraph-boundary' })
    expect(
      resolveEditorNavigationIntent({
        key: 'ArrowDown',
        code: 'ArrowDown',
        hasFnModifier: true,
        isMacPlatform: true,
      }),
    ).toEqual({ type: 'page-movement', movement: 'page-down', extendSelection: false })
  })

  it('routes table tab navigation before multiline and generic tab indentation', () => {
    expect(
      resolveEditorKeyDownIntent(keyInput({
        key: 'Tab',
        hasActiveTableCell: true,
        hasMultiLineEdit: true,
      })),
    ).toEqual({ type: 'table-cell-navigation', direction: 'forward' })
    expect(
      resolveEditorKeyDownIntent(keyInput({
        key: 'Tab',
        shiftKey: true,
        hasActiveTableCell: true,
      })),
    ).toEqual({ type: 'table-cell-navigation', direction: 'backward' })
  })

  it('does not route modified or text-input tabs to table navigation', () => {
    expect(
      resolveEditorKeyDownIntent(keyInput({
        key: 'Tab',
        altKey: true,
        hasActiveTableCell: true,
      })),
    ).toEqual({ type: 'none' })
    expect(
      resolveEditorKeyDownIntent(keyInput({
        key: 'Tab',
        isTextInputTarget: true,
        hasActiveTableCell: true,
      })),
    ).toEqual({ type: 'none' })
  })

  it('resolves beforeinput history and multiline text without mounting the editor hook', () => {
    expect(resolveEditorBeforeInputIntent({ inputType: 'historyUndo', hasMultiLineEdit: true })).toEqual({
      type: 'history',
      direction: 'undo',
    })
    expect(resolveEditorBeforeInputIntent({ inputType: 'insertText', data: '#', hasMultiLineEdit: true })).toEqual({
      type: 'multiline-inline-text',
      text: '#',
    })
  })
})
