import type { EditorTextLineRange, MultiLineEditState } from '../types/app'
import { canSplit } from 'prosemirror-transform'

export type MultiLineEditInput =
  | { type: 'insert-text'; text: string }
  | { type: 'backspace' }
  | { type: 'delete' }
  | { type: 'delete-word-backward' }
  | { type: 'delete-word-forward' }
  | { type: 'delete-to-line-start' }
  | { type: 'delete-to-line-end' }
  | { type: 'split-line' }

export type MultiLineCursorMovement = 'left' | 'right' | 'word-left' | 'word-right' | 'line-start' | 'line-end' | 'up' | 'down'

export type MultiLineSelectionRange = {
  blockIndex: number
  from: number
  to: number
  fromOffset: number
  toOffset: number
  text: string
}

export function cloneMultiLineEditState(state: MultiLineEditState): MultiLineEditState {
  return {
    ...state,
    columnOffsets: state.columnOffsets ? { ...state.columnOffsets } : undefined,
    cursorBlockIndices: state.cursorBlockIndices ? [...state.cursorBlockIndices] : undefined,
    selectionAnchorOffsets: state.selectionAnchorOffsets ? { ...state.selectionAnchorOffsets } : undefined,
  }
}

export function getMultiLineSelectedBlockIndices(
  multiLineEdit: MultiLineEditState,
  blockRanges: EditorTextLineRange[],
): number[] {
  if (multiLineEdit.cursorBlockIndices?.length) {
    return [...new Set(multiLineEdit.cursorBlockIndices)]
      .filter((index) => Number.isInteger(index) && index >= 0 && index < blockRanges.length)
      .sort((a, b) => a - b)
  }

  const startIndex = Math.min(multiLineEdit.anchorBlockIndex, multiLineEdit.headBlockIndex)
  const endIndex = Math.max(multiLineEdit.anchorBlockIndex, multiLineEdit.headBlockIndex)
  return Array.from({ length: endIndex - startIndex + 1 }, (_, index) => startIndex + index).filter((index) => blockRanges[index])
}

export function getMultiLineColumnOffset(
  multiLineEdit: MultiLineEditState,
  blockIndex: number,
  range: EditorTextLineRange,
): number {
  return Math.max(0, Math.min(range.length, multiLineEdit.columnOffsets?.[blockIndex] ?? multiLineEdit.columnOffset))
}

export function getMultiLineHeadColumnOffset(
  multiLineEdit: MultiLineEditState,
  blockRanges: EditorTextLineRange[],
): number {
  const headRange = blockRanges[multiLineEdit.headBlockIndex]
  return headRange ? getMultiLineColumnOffset(multiLineEdit, multiLineEdit.headBlockIndex, headRange) : multiLineEdit.columnOffset
}

export function getMultiLineSelectionRange(
  multiLineEdit: MultiLineEditState,
  blockIndex: number,
  range: EditorTextLineRange,
): MultiLineSelectionRange | null {
  const rawAnchorOffset = multiLineEdit.selectionAnchorOffsets?.[blockIndex]
  if (typeof rawAnchorOffset !== 'number') return null

  const anchorOffset = Math.max(0, Math.min(range.length, rawAnchorOffset))
  const cursorOffset = getMultiLineColumnOffset(multiLineEdit, blockIndex, range)
  const fromOffset = Math.min(anchorOffset, cursorOffset)
  const toOffset = Math.max(anchorOffset, cursorOffset)
  if (fromOffset === toOffset) return null

  return {
    blockIndex,
    from: range.start + fromOffset,
    to: range.start + toOffset,
    fromOffset,
    toOffset,
    text: range.text.slice(fromOffset, toOffset),
  }
}

export function getMultiLineSelectionRanges(
  multiLineEdit: MultiLineEditState,
  selectedIndices: number[],
  blockRanges: EditorTextLineRange[],
): MultiLineSelectionRange[] {
  return selectedIndices
    .map((blockIndex) => {
      const range = blockRanges[blockIndex]
      return range ? getMultiLineSelectionRange(multiLineEdit, blockIndex, range) : null
    })
    .filter((range): range is MultiLineSelectionRange => Boolean(range))
}

export function findPreviousWordColumn(text: string, column: number): number {
  let index = Math.max(0, Math.min(text.length, column))
  while (index > 0 && /\s/.test(text[index - 1] ?? '')) index -= 1
  while (index > 0 && !/\s/.test(text[index - 1] ?? '')) index -= 1
  return index
}

export function findNextWordColumn(text: string, column: number): number {
  let index = Math.max(0, Math.min(text.length, column))
  while (index < text.length && /\s/.test(text[index] ?? '')) index += 1
  while (index < text.length && !/\s/.test(text[index] ?? '')) index += 1
  return index
}

export function getMultiLineSplitPlan(doc: any, pos: number): { depth: number; typesAfter?: any[] } | null {
  const resolvedPos = doc.resolve(pos)
  const listItemNode = resolvedPos.depth >= 2 ? resolvedPos.node(resolvedPos.depth - 1) : null

  if (listItemNode?.type?.name === 'listItem') {
    const nextType = pos === resolvedPos.end() ? listItemNode.contentMatchAt(0).defaultType : null
    const typesAfter = nextType ? [null, { type: nextType }] : undefined
    if (canSplit(doc, pos, 2, typesAfter)) {
      return { depth: 2, typesAfter }
    }
  }

  return canSplit(doc, pos, 1) ? { depth: 1 } : null
}

export function buildSplitLineMultiLineState(
  multiLineEdit: MultiLineEditState,
  selectedIndices: number[],
): MultiLineEditState {
  const sortedIndices = [...selectedIndices].sort((a, b) => a - b)
  const continuationByOriginal = new Map<number, number>()
  sortedIndices.forEach((blockIndex, ordinal) => {
    continuationByOriginal.set(blockIndex, blockIndex + ordinal + 1)
  })

  const cursorBlockIndices = sortedIndices.map((blockIndex) => continuationByOriginal.get(blockIndex) ?? blockIndex + 1)
  const anchorBlockIndex =
    continuationByOriginal.get(multiLineEdit.anchorBlockIndex) ?? cursorBlockIndices[0] ?? multiLineEdit.anchorBlockIndex
  const headBlockIndex =
    continuationByOriginal.get(multiLineEdit.headBlockIndex) ??
    cursorBlockIndices[cursorBlockIndices.length - 1] ??
    multiLineEdit.headBlockIndex
  const columnOffsets = cursorBlockIndices.reduce<Record<number, number>>((acc, blockIndex) => {
    acc[blockIndex] = 0
    return acc
  }, {})

  return {
    anchorBlockIndex,
    headBlockIndex,
    columnOffset: 0,
    columnOffsets,
    cursorBlockIndices,
  }
}

export function moveMultiLineCursorState(
  multiLineEdit: MultiLineEditState,
  selectedIndices: number[],
  blockRanges: EditorTextLineRange[],
  movement: MultiLineCursorMovement,
  options: { extendSelection?: boolean } = {},
): MultiLineEditState | null {
  const startIndex = Math.min(...selectedIndices)
  const endIndex = Math.max(...selectedIndices)
  let nextAnchorIndex = multiLineEdit.anchorBlockIndex
  let nextHeadIndex = multiLineEdit.headBlockIndex
  let nextCursorBlockIndices = multiLineEdit.cursorBlockIndices ? [...selectedIndices] : undefined
  const nextColumnOffsets: Record<number, number> = {}
  const nextSelectionAnchorOffsets: Record<number, number> | undefined = options.extendSelection ? {} : undefined

  if (movement === 'up' || movement === 'down') {
    const delta = movement === 'up' ? -1 : 1
    if ((movement === 'up' && startIndex <= 0) || (movement === 'down' && endIndex >= blockRanges.length - 1)) {
      return {
        ...multiLineEdit,
        selectionAnchorOffsets: options.extendSelection ? multiLineEdit.selectionAnchorOffsets : undefined,
      }
    }

    nextAnchorIndex = multiLineEdit.anchorBlockIndex + delta
    nextHeadIndex = multiLineEdit.headBlockIndex + delta
    nextCursorBlockIndices = multiLineEdit.cursorBlockIndices ? selectedIndices.map((blockIndex) => blockIndex + delta) : undefined

    for (const blockIndex of selectedIndices) {
      const range = blockRanges[blockIndex]
      const nextRange = blockRanges[blockIndex + delta]
      if (!range || !nextRange) continue
      nextColumnOffsets[blockIndex + delta] = Math.min(nextRange.length, getMultiLineColumnOffset(multiLineEdit, blockIndex, range))
    }
  } else {
    for (const blockIndex of selectedIndices) {
      const range = blockRanges[blockIndex]
      if (!range) continue
      const currentOffset = getMultiLineColumnOffset(multiLineEdit, blockIndex, range)
      if (nextSelectionAnchorOffsets) {
        nextSelectionAnchorOffsets[blockIndex] = multiLineEdit.selectionAnchorOffsets?.[blockIndex] ?? currentOffset
      }
      nextColumnOffsets[blockIndex] =
        movement === 'left'
          ? Math.max(0, currentOffset - 1)
          : movement === 'right'
            ? Math.min(range.length, currentOffset + 1)
            : movement === 'word-left'
              ? findPreviousWordColumn(range.text, currentOffset)
              : movement === 'word-right'
                ? findNextWordColumn(range.text, currentOffset)
                : movement === 'line-start'
                  ? 0
                  : range.length
    }
  }

  return {
    ...multiLineEdit,
    anchorBlockIndex: nextAnchorIndex,
    headBlockIndex: nextHeadIndex,
    columnOffset: nextColumnOffsets[nextHeadIndex] ?? multiLineEdit.columnOffset,
    columnOffsets: nextColumnOffsets,
    cursorBlockIndices: nextCursorBlockIndices,
    selectionAnchorOffsets: nextSelectionAnchorOffsets,
  }
}
