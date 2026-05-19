import { describe, expect, it } from 'vitest'
import type { MultiLineEditState } from '../types/app'
import { getMultiLineWidgetClearMode, hasMultiLineDecorationState } from './useMultilineEditing'

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
