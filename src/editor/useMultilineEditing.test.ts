import { describe, expect, it, vi } from 'vitest'
import type { Editor } from '@toast-ui/editor'
import type { MultiLineEditState } from '../types/app'
import {
  getMultiLineWidgetClearMode,
  getStructuralListIndentCommitMarkdown,
  getTabIndentCommitMarkdown,
  hasMultiLineDecorationState,
  shouldApplyBlockIndentOperationForTab,
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

  it('uses normalized editor markdown for Tab indentation near blank paragraphs and tables', () => {
    const getMarkdown = vi.fn(() => `> quote\n\n| A |\n| --- |`)
    const editor = { getMarkdown } as unknown as Editor
    const getNormalizedEditorMarkdown = vi.fn(() => `> \u2060\u2003\u2003quote\n\n\u200b\n\n| A |\n| --- |`)

    expect(getTabIndentCommitMarkdown(editor, getNormalizedEditorMarkdown)).toBe(
      `> \u2060\u2003\u2003quote\n\n\u200b\n\n| A |\n| --- |`,
    )
    expect(getNormalizedEditorMarkdown).toHaveBeenCalledWith(editor)
    expect(getMarkdown).not.toHaveBeenCalled()
  })
})

describe('tab indentation routing', () => {
  it('keeps Tab inside quoted content as inline indentation', () => {
    expect(
      shouldApplyBlockIndentOperationForTab({
        outdent: false,
        isCollapsedSelection: true,
        touchesBlockQuoteRows: true,
      }),
    ).toBe(false)
    expect(
      shouldApplyBlockIndentOperationForTab({
        outdent: false,
        isCollapsedSelection: false,
        touchesBlockQuoteRows: true,
      }),
    ).toBe(false)
  })

  it('keeps structural block indent for normal multi-line Tab selections only', () => {
    expect(
      shouldApplyBlockIndentOperationForTab({
        outdent: false,
        isCollapsedSelection: false,
        touchesBlockQuoteRows: false,
      }),
    ).toBe(true)
    expect(
      shouldApplyBlockIndentOperationForTab({
        outdent: false,
        isCollapsedSelection: true,
        touchesBlockQuoteRows: false,
      }),
    ).toBe(false)
    expect(
      shouldApplyBlockIndentOperationForTab({
        outdent: true,
        isCollapsedSelection: false,
        touchesBlockQuoteRows: false,
      }),
    ).toBe(false)
  })
})
