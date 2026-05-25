import { describe, expect, it } from 'vitest'
import {
  resolveEditorBeforeInputIntent,
  resolveEditorKeyDownIntent,
  type EditorKeyDownIntentInput,
} from './editor-input-intents'

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
    tableBoundaryDirection: null,
    multiLineSelectionDirection: null,
    pageMovement: null,
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
        pageMovement: 'page-down',
      })),
    ).toEqual({ type: 'table-boundary-caret', direction: 'after' })
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
