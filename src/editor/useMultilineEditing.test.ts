import { describe, expect, it, vi } from 'vitest'
import type { Editor } from '@toast-ui/editor'
import type { MultiLineEditState } from '../types/app'
import {
  getMultiLineWidgetClearMode,
  getStructuralListIndentCommitMarkdown,
  hasMultiLineDecorationState,
} from './useMultilineEditing'

const activeMultiLineState: MultiLineEditState = {
  anchorBlockIndex: 0,
  headBlockIndex: 1,
  columnOffset: 0,
}

describe('multiline editing clear behavior', () => {
  it('does not dispatch widget cleanup when no multiline edit is active', () => {
    expect(getMultiLineWidgetClearMode(null, false)).toBe('none')
  })

  it('defers widget cleanup for normal pointer-driven clears', () => {
    expect(getMultiLineWidgetClearMode(activeMultiLineState, false, { deferWidgetClear: true })).toBe('defer')
  })

  it('keeps collapse-to-head clears immediate even when defer is requested', () => {
    expect(getMultiLineWidgetClearMode(activeMultiLineState, true, { deferWidgetClear: true })).toBe('immediate')
  })

  it('detects whether a deferred widget clear has live decorations to remove', () => {
    expect(hasMultiLineDecorationState(undefined)).toBe(false)
    expect(hasMultiLineDecorationState({ cursors: [], selections: [] })).toBe(false)
    expect(hasMultiLineDecorationState({ cursors: [12], selections: [] })).toBe(true)
    expect(hasMultiLineDecorationState({ cursors: [], selections: [{ from: 3, to: 8 }] })).toBe(true)
  })
})

describe('structural list indentation commits', () => {
  it('uses normalized editor markdown instead of raw Toast UI markdown', () => {
    const getMarkdown = vi.fn(() => '### Head\ntext\n- [ ] task')
    const editor = { getMarkdown } as unknown as Editor
    const getNormalizedEditorMarkdown = vi.fn(() => '### Head\n\ntext\n\n- [ ] task')

    expect(getStructuralListIndentCommitMarkdown(editor, getNormalizedEditorMarkdown)).toBe(
      '### Head\n\ntext\n\n- [ ] task',
    )
    expect(getNormalizedEditorMarkdown).toHaveBeenCalledWith(editor)
    expect(getMarkdown).not.toHaveBeenCalled()
  })
})
