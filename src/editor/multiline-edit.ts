import type { EditorTextLineRange, MultiLineEditState } from '../types/app'
import { Selection, TextSelection } from 'prosemirror-state'
import { canSplit } from 'prosemirror-transform'
import { findEditorTextLineRangeIndex, getEditorTextLineRanges, isCodeBlockTextLineRange } from './multiline-ranges'

export type MultiLineEditInput =
  | { type: 'insert-text'; text: string }
  | { type: 'backspace' }
  | { type: 'delete' }
  | { type: 'delete-word-backward' }
  | { type: 'delete-word-forward' }
  | { type: 'delete-to-line-start' }
  | { type: 'delete-to-line-end' }
  | { type: 'split-line' }

export type MultiLineCursorMovement =
  | 'left'
  | 'right'
  | 'word-left'
  | 'word-right'
  | 'line-start'
  | 'line-end'
  | 'up'
  | 'down'
  | 'page-up'
  | 'page-down'

export type EditorPageMovement = Extract<MultiLineCursorMovement, 'page-up' | 'page-down'>

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
    activeInlineFormats: state.activeInlineFormats ? [...state.activeInlineFormats] : undefined,
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

export function shouldApplyMultiLineBoundaryDelete(
  multiLineEdit: MultiLineEditState,
  selectedIndices: number[],
  blockRanges: EditorTextLineRange[],
): boolean {
  return selectedIndices.every((blockIndex) => {
    const range = blockRanges[blockIndex]
    return (
      range &&
      !getMultiLineSelectionRange(multiLineEdit, blockIndex, range) &&
      getMultiLineColumnOffset(multiLineEdit, blockIndex, range) >= range.length
    )
  })
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

  for (let depth = resolvedPos.depth; depth > 0; depth -= 1) {
    const node = resolvedPos.node(depth)
    if (!node?.isTextblock) continue
    if (depth === 1 && node.type?.name === 'heading') {
      const paragraphType = doc.type?.schema?.nodes?.paragraph
      const typesAfter = paragraphType ? [{ type: paragraphType }] : undefined
      if (typesAfter && canSplit(doc, pos, 1, typesAfter)) {
        return { depth: 1, typesAfter }
      }
    }
    break
  }

  return canSplit(doc, pos, 1) ? { depth: 1 } : null
}

export function buildMissingMultiLineDownTargetLinePlan(
  transaction: any,
  blockRanges: EditorTextLineRange[],
  sourceBlockIndex: number,
): MissingMultiLineDownTargetLinePlan | null {
  const sourceRange = blockRanges[sourceBlockIndex]
  if (!sourceRange || sourceBlockIndex !== blockRanges.length - 1) return null

  const insertPos = sourceRange.end
  if (isCodeBlockTextLineRange(sourceRange)) {
    return {
      transaction: transaction.insertText('\n', insertPos, insertPos),
      targetBlockIndex: sourceBlockIndex + 1,
    }
  }

  const splitPlan = getMultiLineSplitPlan(transaction.doc, insertPos)
  if (!splitPlan) return null
  return {
    transaction: transaction.split(insertPos, splitPlan.depth, splitPlan.typesAfter),
    targetBlockIndex: sourceBlockIndex + 1,
  }
}

export type EmptyMultiLineBlockDeleteTarget = {
  blockIndex: number
  from: number
  to: number
}

export type ForwardBoundaryDeletePlan = {
  transaction: any
  consumedNextLineBlockIndices: number[]
  deletedLineBlockIndices: number[]
  nextMultiLineEditState: MultiLineEditState
  nextColumnOffsets: Record<number, number>
}

export type SelectedRowDeletePlan = {
  transaction: any
  deletedLineBlockIndices: number[]
  nextColumnOffsets: Record<number, number>
}

type MissingMultiLineDownTargetLinePlan = {
  transaction: any
  targetBlockIndex: number
}

type SelectedRowDeleteContext =
  | {
      kind: 'block'
      blockIndex: number
      from: number
      to: number
    }
  | {
      kind: 'listItem'
      blockIndex: number
      listStart: number
      listEnd: number
      itemIndex: number
      listNode: any
    }
  | {
      kind: 'blockQuoteChild'
      blockIndex: number
      quoteStart: number
      quoteEnd: number
      childIndex: number
      quoteNode: any
    }

type DeleteCurrentRowContext = SelectedRowDeleteContext

type InlineBreakDeleteContext = {
  kind: 'inlineBreak'
  blockIndex: number
  from: number
  to: number
}

function getTopLevelEmptyTextBlockDeleteTarget(
  doc: any,
  blockIndex: number,
  range: EditorTextLineRange,
): EmptyMultiLineBlockDeleteTarget | null {
  if (range.length !== 0 || range.text.replace(/\u200b/g, '').length !== 0) return null

  let resolved: any
  try {
    resolved = doc.resolve(range.start)
  } catch {
    return null
  }

  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    const node = resolved.node(depth)
    if (!node?.isTextblock) continue
    if (depth !== 1 || node.content?.size !== 0) return null
    return {
      blockIndex,
      from: resolved.before(depth),
      to: resolved.after(depth),
    }
  }

  return null
}

export function getEmptyMultiLineBlockDeleteTargets(
  doc: any,
  blockRanges: EditorTextLineRange[],
  selectedIndices: number[],
): EmptyMultiLineBlockDeleteTarget[] {
  const targets = selectedIndices
    .map((blockIndex) => {
      const range = blockRanges[blockIndex]
      return range ? getTopLevelEmptyTextBlockDeleteTarget(doc, blockIndex, range) : null
    })
    .filter((target): target is EmptyMultiLineBlockDeleteTarget => Boolean(target))

  const uniqueTargets = Array.from(
    new Map(targets.map((target) => [`${target.from}:${target.to}`, target])).values(),
  ).sort((a, b) => a.blockIndex - b.blockIndex)
  const maxDeletions = Math.max(0, (doc.childCount ?? 0) - 1)
  return uniqueTargets.slice(0, maxDeletions)
}

function isCodeBlockBoundaryDeleteAllowed(range: EditorTextLineRange, nextRange: EditorTextLineRange): boolean {
  if (range.nodeType !== 'codeBlock' && nextRange.nodeType !== 'codeBlock') return true
  return range.nodeType === 'codeBlock' && nextRange.nodeType === 'codeBlock' && nextRange.start === range.end + 1
}

function isEmptyVisibleRow(range: EditorTextLineRange): boolean {
  return range.length === 0 || range.text.replace(/\u200b/g, '').trim().length === 0
}

export function shouldApplyMultiLineWholeSelectionBoundaryDelete(
  inputType: 'backspace' | 'delete',
  multiLineEdit: MultiLineEditState,
  selectedIndices: number[],
  blockRanges: EditorTextLineRange[],
): boolean {
  if (!shouldApplyMultiLineBoundaryDelete(multiLineEdit, selectedIndices, blockRanges)) return false
  if (inputType === 'delete') return true
  return selectedIndices.every((blockIndex) => {
    const range = blockRanges[blockIndex]
    return range ? isEmptyVisibleRow(range) : false
  })
}

function addDeleteCurrentRowReplacement(
  replacements: Array<{ from: number; to: number; nodes: any[] }>,
  context: DeleteCurrentRowContext | InlineBreakDeleteContext,
) {
  if (context.kind === 'inlineBreak') {
    replacements.push({ from: context.from, to: context.to, nodes: [] })
    return
  }

  if (context.kind === 'block') {
    replacements.push({ from: context.from, to: context.to, nodes: [] })
    return
  }

  if (context.kind === 'blockQuoteChild') {
    replacements.push({
      from: context.quoteStart,
      to: context.quoteEnd,
      nodes: createBlockQuoteNodesWithoutSelectedChildren(context.quoteNode, new Set([context.childIndex])),
    })
    return
  }

  replacements.push({
    from: context.listStart,
    to: context.listEnd,
    nodes: createListNodesWithoutSelectedItems(context.listNode, new Set([context.itemIndex])),
  })
}

function applyNodeReplacements(
  transaction: any,
  replacements: Array<{ from: number; to: number; nodes: any[] }>,
): any {
  let nextTransaction = transaction
  const paragraphType = transaction.doc.type?.schema?.nodes?.paragraph

  for (const replacement of replacements.sort((a, b) => b.from - a.from)) {
    const mappedFrom = nextTransaction.mapping.map(replacement.from, -1)
    const mappedTo = nextTransaction.mapping.map(replacement.to, 1)
    if (mappedTo <= mappedFrom) continue

    if (replacement.nodes.length > 0) {
      nextTransaction = nextTransaction.replaceWith(mappedFrom, mappedTo, replacement.nodes)
      continue
    }

    if (mappedFrom <= 0 && mappedTo >= nextTransaction.doc.content.size && paragraphType) {
      nextTransaction = nextTransaction.replaceWith(mappedFrom, mappedTo, paragraphType.create())
    } else {
      nextTransaction = nextTransaction.delete(mappedFrom, mappedTo)
    }
  }

  return nextTransaction
}

function getInlineBreakDeleteContext(
  doc: any,
  blockIndex: number,
  range: EditorTextLineRange,
): InlineBreakDeleteContext | null {
  if (!isEmptyVisibleRow(range) || range.nodeType === 'codeBlock') return null

  const resolved = resolveSafe(doc, range.start)
  if (!resolved) return null

  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    const node = resolved.node(depth)
    if (!node?.isTextblock || node.content?.size === 0) continue
    const contentStart = resolved.start(depth)
    const contentEnd = resolved.end(depth)

    if (range.start < contentEnd) {
      const nodeAfter = doc.nodeAt(range.start)
      if (nodeAfter?.type?.name === 'hardBreak') {
        return {
          kind: 'inlineBreak',
          blockIndex,
          from: range.start,
          to: range.start + Math.max(1, nodeAfter.nodeSize ?? 1),
        }
      }
    }

    if (range.start > contentStart) {
      const nodeBefore = resolved.nodeBefore
      if (nodeBefore?.type?.name === 'hardBreak') {
        return {
          kind: 'inlineBreak',
          blockIndex,
          from: range.start - Math.max(1, nodeBefore.nodeSize ?? 1),
          to: range.start,
        }
      }
    }
  }

  return null
}

function findPreviousSurvivingBlockIndex(blockIndex: number, removedBlockIndices: Set<number>): number | null {
  for (let index = blockIndex - 1; index >= 0; index -= 1) {
    if (!removedBlockIndices.has(index)) return index
  }
  return null
}

function findNextSurvivingBlockIndex(
  blockIndex: number,
  blockRanges: EditorTextLineRange[],
  removedBlockIndices: Set<number>,
): number | null {
  for (let index = blockIndex + 1; index < blockRanges.length; index += 1) {
    if (!removedBlockIndices.has(index)) return index
  }
  return null
}

function mapSurvivingBlockIndex(blockIndex: number, removedBlockIndices: number[]): number {
  return blockIndex - removedBlockIndices.filter((removedIndex) => removedIndex < blockIndex).length
}

function buildBoundaryDeleteMultiLineState(
  multiLineEdit: MultiLineEditState,
  blockRanges: EditorTextLineRange[],
  sourceBlockIndices: number[],
  deletedCurrentBlockIndices: number[],
  consumedNextLineBlockIndices: number[],
): MultiLineEditState {
  const removedBlockIndices = [...new Set([...deletedCurrentBlockIndices, ...consumedNextLineBlockIndices])].sort((a, b) => a - b)
  const removedSet = new Set(removedBlockIndices)
  const cursorTargets = new Map<number, number>()
  const nextBlockCount = Math.max(1, blockRanges.length - removedSet.size)

  for (const blockIndex of [...new Set(sourceBlockIndices)].sort((a, b) => a - b)) {
    const range = blockRanges[blockIndex]
    if (!range) continue

    let targetBlockIndex: number | null = blockIndex
    let targetColumnOffset = getMultiLineColumnOffset(multiLineEdit, blockIndex, range)

    if (removedSet.has(blockIndex)) {
      const previousSurvivingIndex = findPreviousSurvivingBlockIndex(blockIndex, removedSet)
      const nextSurvivingIndex = findNextSurvivingBlockIndex(blockIndex, blockRanges, removedSet)
      targetBlockIndex = previousSurvivingIndex ?? nextSurvivingIndex
      targetColumnOffset =
        previousSurvivingIndex !== null
          ? (blockRanges[previousSurvivingIndex]?.length ?? 0)
          : 0
    }

    const mappedBlockIndex =
      targetBlockIndex === null ? 0 : Math.max(0, Math.min(nextBlockCount - 1, mapSurvivingBlockIndex(targetBlockIndex, removedBlockIndices)))
    if (!cursorTargets.has(mappedBlockIndex)) {
      cursorTargets.set(mappedBlockIndex, Math.max(0, targetColumnOffset))
    }
  }

  if (cursorTargets.size === 0) {
    cursorTargets.set(0, 0)
  }

  const cursorBlockIndices = [...cursorTargets.keys()].sort((a, b) => a - b)
  const columnOffsets = cursorBlockIndices.reduce<Record<number, number>>((acc, blockIndex) => {
    acc[blockIndex] = cursorTargets.get(blockIndex) ?? 0
    return acc
  }, {})
  const anchorBlockIndex = cursorBlockIndices[0] ?? 0
  const headBlockIndex = cursorBlockIndices[cursorBlockIndices.length - 1] ?? anchorBlockIndex

  return {
    ...multiLineEdit,
    anchorBlockIndex,
    headBlockIndex,
    columnOffset: columnOffsets[headBlockIndex] ?? 0,
    columnOffsets,
    cursorBlockIndices,
    selectionAnchorOffsets: undefined,
    activeInlineFormats: undefined,
  }
}

export function buildForwardBoundaryDeletePlan(
  transaction: any,
  multiLineEdit: MultiLineEditState,
  blockRanges: EditorTextLineRange[],
  blockIndices: number[],
): ForwardBoundaryDeletePlan | null {
  const replacements: Array<{ from: number; to: number; nodes: any[] }> = []
  const deleteCurrentBlockIndices: number[] = []
  const consumedNextLineBlockIndices: number[] = []
  const nextColumnOffsets: Record<number, number> = {}
  const deleteCurrentByBlockIndex = new Map<number, DeleteCurrentRowContext>()

  for (const blockIndex of [...new Set(blockIndices)].sort((a, b) => a - b)) {
    const range = blockRanges[blockIndex]
    if (!range || !isEmptyVisibleRow(range) || range.nodeType === 'codeBlock') continue
    const currentOffset = getMultiLineColumnOffset(multiLineEdit, blockIndex, range)
    if (currentOffset < range.length) continue
    const inlineBreakContext = getInlineBreakDeleteContext(transaction.doc, blockIndex, range)
    if (inlineBreakContext) {
      addDeleteCurrentRowReplacement(replacements, inlineBreakContext)
      deleteCurrentBlockIndices.push(blockIndex)
      continue
    }
    const context = getSelectedRowDeleteContext(transaction.doc, blockIndex, range)
    if (!context) continue
    deleteCurrentByBlockIndex.set(blockIndex, context)
    deleteCurrentBlockIndices.push(blockIndex)
  }

  const listContextsByStart = new Map<number, Extract<DeleteCurrentRowContext, { kind: 'listItem' }>[]>()
  const quoteContextsByStart = new Map<number, Extract<DeleteCurrentRowContext, { kind: 'blockQuoteChild' }>[]>()
  for (const context of deleteCurrentByBlockIndex.values()) {
    if (context.kind === 'block') {
      addDeleteCurrentRowReplacement(replacements, context)
      continue
    }
    if (context.kind === 'blockQuoteChild') {
      const existing = quoteContextsByStart.get(context.quoteStart) ?? []
      existing.push(context)
      quoteContextsByStart.set(context.quoteStart, existing)
      continue
    }
    const existing = listContextsByStart.get(context.listStart) ?? []
    existing.push(context)
    listContextsByStart.set(context.listStart, existing)
  }

  for (const contextsForList of listContextsByStart.values()) {
    const first = contextsForList[0]
    replacements.push({
      from: first.listStart,
      to: first.listEnd,
      nodes: createListNodesWithoutSelectedItems(
        first.listNode,
        new Set(contextsForList.map((context) => context.itemIndex)),
      ),
    })
  }

  for (const contextsForQuote of quoteContextsByStart.values()) {
    const first = contextsForQuote[0]
    replacements.push({
      from: first.quoteStart,
      to: first.quoteEnd,
      nodes: createBlockQuoteNodesWithoutSelectedChildren(
        first.quoteNode,
        new Set(contextsForQuote.map((context) => context.childIndex)),
      ),
    })
  }

  let nextTransaction = applyNodeReplacements(transaction, replacements)
  const deletedCurrentSet = new Set(deleteCurrentBlockIndices)

  for (const blockIndex of [...new Set(blockIndices)].sort((a, b) => b - a)) {
    if (deletedCurrentSet.has(blockIndex)) continue
    const range = blockRanges[blockIndex]
    const nextRange = blockRanges[blockIndex + 1]
    if (!range || !nextRange) continue
    const currentOffset = getMultiLineColumnOffset(multiLineEdit, blockIndex, range)
    if (currentOffset < range.length) continue
    if (deletedCurrentSet.has(blockIndex + 1)) continue
    if (!isCodeBlockBoundaryDeleteAllowed(range, nextRange)) continue

    const mappedFrom = nextTransaction.mapping.map(range.end, 1)
    const mappedTo = nextTransaction.mapping.map(nextRange.start, -1)
    if (mappedTo <= mappedFrom) continue

    try {
      nextTransaction = nextTransaction.delete(mappedFrom, mappedTo)
    } catch {
      continue
    }

    consumedNextLineBlockIndices.push(blockIndex + 1)
    nextColumnOffsets[blockIndex] = currentOffset
  }

  if (consumedNextLineBlockIndices.length === 0 && deleteCurrentBlockIndices.length === 0) return null
  const uniqueConsumedNextLineBlockIndices = [...new Set(consumedNextLineBlockIndices)].sort((a, b) => a - b)
  const uniqueDeletedLineBlockIndices = [...new Set(deleteCurrentBlockIndices)].sort((a, b) => a - b)
  return {
    transaction: nextTransaction,
    consumedNextLineBlockIndices: uniqueConsumedNextLineBlockIndices,
    deletedLineBlockIndices: uniqueDeletedLineBlockIndices,
    nextMultiLineEditState: buildBoundaryDeleteMultiLineState(
      multiLineEdit,
      blockRanges,
      blockIndices,
      uniqueDeletedLineBlockIndices,
      uniqueConsumedNextLineBlockIndices,
    ),
    nextColumnOffsets,
  }
}

function resolveSafe(doc: any, position: number) {
  const docSize = Math.max(0, doc?.content?.size ?? 0)
  const safePosition = Math.max(0, Math.min(docSize, position))
  try {
    return doc.resolve?.(safePosition) ?? null
  } catch {
    return null
  }
}

function getSelectedRowDeleteContext(
  doc: any,
  blockIndex: number,
  range: EditorTextLineRange,
): SelectedRowDeleteContext | null {
  if (range.nodeType === 'codeBlock') return null

  const resolved = resolveSafe(doc, range.start)
  if (!resolved) return null

  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    const node = resolved.node(depth)
    if (node?.type?.name !== 'listItem') continue
    const listDepth = depth - 1
    const listNode = resolved.node(listDepth)
    if (!listNode || listDepth < 1) return null
    return {
      kind: 'listItem',
      blockIndex,
      listStart: resolved.before(listDepth),
      listEnd: resolved.after(listDepth),
      itemIndex: resolved.index(listDepth),
      listNode,
    }
  }

  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    const node = resolved.node(depth)
    if (!node?.isTextblock) continue
    const parentDepth = depth - 1
    const parentNode = parentDepth > 0 ? resolved.node(parentDepth) : null
    if (parentNode?.type?.name === 'blockQuote') {
      return {
        kind: 'blockQuoteChild',
        blockIndex,
        quoteStart: resolved.before(parentDepth),
        quoteEnd: resolved.after(parentDepth),
        childIndex: resolved.index(parentDepth),
        quoteNode: parentNode,
      }
    }
    if (depth !== 1) return null
    return {
      kind: 'block',
      blockIndex,
      from: resolved.before(depth),
      to: resolved.after(depth),
    }
  }

  return null
}

function createListNodesWithoutSelectedItems(listNode: any, selectedItemIndices: Set<number>): any[] {
  const nodes: any[] = []
  let runItems: any[] = []

  const flushRun = () => {
    if (runItems.length === 0) return
    nodes.push(listNode.type.create(listNode.attrs, runItems))
    runItems = []
  }

  for (let index = 0; index < listNode.childCount; index += 1) {
    if (selectedItemIndices.has(index)) {
      flushRun()
      continue
    }
    runItems.push(listNode.child(index))
  }
  flushRun()
  return nodes
}

function createBlockQuoteNodesWithoutSelectedChildren(quoteNode: any, selectedChildIndices: Set<number>): any[] {
  const children: any[] = []
  for (let index = 0; index < quoteNode.childCount; index += 1) {
    if (!selectedChildIndices.has(index)) {
      children.push(quoteNode.child(index))
    }
  }
  return children.length > 0 ? [quoteNode.type.create(quoteNode.attrs, children)] : []
}

export function buildSelectedRowDeletePlan(
  transaction: any,
  multiLineEdit: MultiLineEditState,
  blockRanges: EditorTextLineRange[],
  selectedIndices: number[],
): SelectedRowDeletePlan | null {
  const contexts: SelectedRowDeleteContext[] = []

  for (const blockIndex of selectedIndices) {
    const range = blockRanges[blockIndex]
    if (!range) return null
    const selectionRange = getMultiLineSelectionRange(multiLineEdit, blockIndex, range)
    if (!selectionRange || selectionRange.fromOffset !== 0 || selectionRange.toOffset !== range.length) return null
    const context = getSelectedRowDeleteContext(transaction.doc, blockIndex, range)
    if (!context) return null
    contexts.push(context)
  }

  if (contexts.length === 0) return null

  const replacements: Array<{ from: number; to: number; nodes: any[] }> = []
  const blockContexts = contexts.filter((context): context is Extract<SelectedRowDeleteContext, { kind: 'block' }> => context.kind === 'block')
  const listContexts = contexts.filter((context): context is Extract<SelectedRowDeleteContext, { kind: 'listItem' }> => context.kind === 'listItem')
  const quoteContexts = contexts.filter((context): context is Extract<SelectedRowDeleteContext, { kind: 'blockQuoteChild' }> => context.kind === 'blockQuoteChild')

  const blockContextsByIndex = new Map(blockContexts.map((context) => [context.blockIndex, context]))
  const blockGroups = [...new Set(blockContexts.map((context) => context.blockIndex))]
    .sort((a, b) => a - b)
    .reduce<number[][]>((groups, blockIndex) => {
      const current = groups.at(-1)
      if (current && current.at(-1) === blockIndex - 1) current.push(blockIndex)
      else groups.push([blockIndex])
      return groups
    }, [])

  for (const group of blockGroups) {
    const first = blockContextsByIndex.get(group[0])
    const last = blockContextsByIndex.get(group[group.length - 1])
    if (first && last) {
      replacements.push({ from: first.from, to: last.to, nodes: [] })
    }
  }

  const listContextsByStart = new Map<number, typeof listContexts>()
  for (const context of listContexts) {
    const existing = listContextsByStart.get(context.listStart) ?? []
    existing.push(context)
    listContextsByStart.set(context.listStart, existing)
  }

  for (const contextsForList of listContextsByStart.values()) {
    const first = contextsForList[0]
    const selectedItemIndices = new Set(contextsForList.map((context) => context.itemIndex))
    replacements.push({
      from: first.listStart,
      to: first.listEnd,
      nodes: createListNodesWithoutSelectedItems(first.listNode, selectedItemIndices),
    })
  }

  const quoteContextsByStart = new Map<number, typeof quoteContexts>()
  for (const context of quoteContexts) {
    const existing = quoteContextsByStart.get(context.quoteStart) ?? []
    existing.push(context)
    quoteContextsByStart.set(context.quoteStart, existing)
  }

  for (const contextsForQuote of quoteContextsByStart.values()) {
    const first = contextsForQuote[0]
    const selectedChildIndices = new Set(contextsForQuote.map((context) => context.childIndex))
    replacements.push({
      from: first.quoteStart,
      to: first.quoteEnd,
      nodes: createBlockQuoteNodesWithoutSelectedChildren(first.quoteNode, selectedChildIndices),
    })
  }

  if (replacements.length === 0) return null

  return {
    transaction: applyNodeReplacements(transaction, replacements),
    deletedLineBlockIndices: [...new Set(contexts.map((context) => context.blockIndex))].sort((a, b) => a - b),
    nextColumnOffsets: {},
  }
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

export function buildDeletedLineMultiLineState(
  multiLineEdit: MultiLineEditState,
  selectedIndices: number[],
  deletedIndices: number[],
  blockRanges: EditorTextLineRange[],
): MultiLineEditState {
  const sortedDeletedIndices = [...new Set(deletedIndices)].sort((a, b) => a - b)
  const deletedSet = new Set(sortedDeletedIndices)
  const deletedBefore = (blockIndex: number) => sortedDeletedIndices.filter((deletedIndex) => deletedIndex < blockIndex).length
  const nextBlockCount = Math.max(0, blockRanges.length - deletedSet.size)
  const nextSelectedIndices = selectedIndices
    .filter((blockIndex) => !deletedSet.has(blockIndex))
    .map((blockIndex) => blockIndex - deletedBefore(blockIndex))
    .filter((blockIndex, index, indices) => blockIndex >= 0 && blockIndex < nextBlockCount && indices.indexOf(blockIndex) === index)

  const firstDeletedIndex = sortedDeletedIndices[0] ?? 0
  const fallbackIndex =
    nextBlockCount > 0
      ? Math.max(0, Math.min(nextBlockCount - 1, firstDeletedIndex - deletedBefore(firstDeletedIndex)))
      : 0
  const cursorBlockIndices = nextSelectedIndices.length > 0 ? nextSelectedIndices : [fallbackIndex]
  const columnOffsets = cursorBlockIndices.reduce<Record<number, number>>((acc, blockIndex) => {
    acc[blockIndex] = 0
    return acc
  }, {})

  return {
    ...multiLineEdit,
    anchorBlockIndex: cursorBlockIndices[0] ?? fallbackIndex,
    headBlockIndex: cursorBlockIndices[cursorBlockIndices.length - 1] ?? fallbackIndex,
    columnOffset: 0,
    columnOffsets,
    cursorBlockIndices,
    selectionAnchorOffsets: undefined,
    activeInlineFormats: undefined,
  }
}

function clampRowDelta(selectedIndices: number[], blockRanges: EditorTextLineRange[], rowDelta: number): number {
  if (selectedIndices.length === 0 || blockRanges.length === 0) return 0
  const startIndex = Math.min(...selectedIndices)
  const endIndex = Math.max(...selectedIndices)
  const minDelta = -startIndex
  const maxDelta = blockRanges.length - 1 - endIndex
  return Math.max(minDelta, Math.min(maxDelta, rowDelta))
}

type MultiLineCursorRowsByDeltaOptions = {
  extendSelection?: boolean
  collapseAtBoundary?: boolean
}

function shouldCollapseCursorRowsAtBoundary(
  selectedIndices: number[],
  blockRanges: EditorTextLineRange[],
  rowDelta: number,
): boolean {
  if (selectedIndices.length < 2 || blockRanges.length === 0 || rowDelta === 0) return false
  if (rowDelta < 0) return Math.min(...selectedIndices) <= 0
  return Math.max(...selectedIndices) >= blockRanges.length - 1
}

function collapseMultiLineCursorRowsAtBoundary(
  multiLineEdit: MultiLineEditState,
  selectedIndices: number[],
  blockRanges: EditorTextLineRange[],
  rowDelta: number,
): MultiLineEditState {
  const retainedIndices = rowDelta < 0 ? selectedIndices.slice(0, -1) : selectedIndices.slice(1)
  if (retainedIndices.length === 0) {
    return {
      ...multiLineEdit,
      selectionAnchorOffsets: undefined,
    }
  }

  const nextHeadIndex = rowDelta < 0 ? retainedIndices[0] : retainedIndices[retainedIndices.length - 1]
  const nextAnchorIndex = rowDelta < 0 ? retainedIndices[retainedIndices.length - 1] : retainedIndices[0]
  const nextColumnOffsets = retainedIndices.reduce<Record<number, number>>((acc, blockIndex) => {
    const range = blockRanges[blockIndex]
    if (range) {
      acc[blockIndex] = getMultiLineColumnOffset(multiLineEdit, blockIndex, range)
    }
    return acc
  }, {})

  return {
    ...multiLineEdit,
    anchorBlockIndex: nextAnchorIndex,
    headBlockIndex: nextHeadIndex,
    columnOffset: nextColumnOffsets[nextHeadIndex] ?? multiLineEdit.columnOffset,
    columnOffsets: nextColumnOffsets,
    cursorBlockIndices: multiLineEdit.cursorBlockIndices ? retainedIndices : undefined,
    selectionAnchorOffsets: undefined,
  }
}

export function moveMultiLineCursorRowsByDelta(
  multiLineEdit: MultiLineEditState,
  selectedIndices: number[],
  blockRanges: EditorTextLineRange[],
  rowDelta: number,
  options: MultiLineCursorRowsByDeltaOptions = {},
): MultiLineEditState {
  const delta = clampRowDelta(selectedIndices, blockRanges, rowDelta)
  if (delta === 0) {
    if (
      options.collapseAtBoundary &&
      !options.extendSelection &&
      shouldCollapseCursorRowsAtBoundary(selectedIndices, blockRanges, rowDelta)
    ) {
      return collapseMultiLineCursorRowsAtBoundary(multiLineEdit, selectedIndices, blockRanges, rowDelta)
    }

    return {
      ...multiLineEdit,
      selectionAnchorOffsets: options.extendSelection ? multiLineEdit.selectionAnchorOffsets : undefined,
    }
  }

  const nextColumnOffsets: Record<number, number> = {}
  const nextCursorBlockIndices = multiLineEdit.cursorBlockIndices
    ? selectedIndices.map((blockIndex) => blockIndex + delta)
    : undefined

  for (const blockIndex of selectedIndices) {
    const range = blockRanges[blockIndex]
    const nextRange = blockRanges[blockIndex + delta]
    if (!range || !nextRange) continue
    nextColumnOffsets[blockIndex + delta] = Math.min(
      nextRange.length,
      getMultiLineColumnOffset(multiLineEdit, blockIndex, range),
    )
  }

  const nextAnchorIndex = multiLineEdit.anchorBlockIndex + delta
  const nextHeadIndex = multiLineEdit.headBlockIndex + delta

  return {
    ...multiLineEdit,
    anchorBlockIndex: nextAnchorIndex,
    headBlockIndex: nextHeadIndex,
    columnOffset: nextColumnOffsets[nextHeadIndex] ?? multiLineEdit.columnOffset,
    columnOffsets: nextColumnOffsets,
    cursorBlockIndices: nextCursorBlockIndices,
    selectionAnchorOffsets: options.extendSelection ? {} : undefined,
  }
}

function getEditorPageMovementViewportHeight(view: any): number {
  const dom = view?.dom
  const candidates = [
    dom?.closest?.('.toastui-editor-ww-container'),
    dom?.closest?.('.toastui-editor-main'),
    dom,
  ].filter(Boolean)

  for (const candidate of candidates) {
    const clientHeight = Number(candidate?.clientHeight ?? 0)
    if (clientHeight > 0) return clientHeight
    const rectHeight = Number(candidate?.getBoundingClientRect?.()?.height ?? 0)
    if (rectHeight > 0) return rectHeight
  }

  return 240
}

function getFallbackPageRowDelta(view: any, direction: -1 | 1): number {
  const viewportHeight = getEditorPageMovementViewportHeight(view)
  const estimatedLineHeight = 24
  return direction * Math.max(1, Math.floor(viewportHeight / estimatedLineHeight))
}

function getPageMovementDirection(movement: EditorPageMovement): -1 | 1 {
  return movement === 'page-up' ? -1 : 1
}

export function getSingleCursorPageMovementTargetPosition(
  view: any,
  movement: EditorPageMovement,
): number | null {
  const selection = view?.state?.selection
  const doc = view?.state?.doc
  if (!selection || !doc) return null

  const blockRanges = getEditorTextLineRanges(view)
  if (blockRanges.length === 0) return null

  const direction = getPageMovementDirection(movement)
  const fallbackDelta = getFallbackPageRowDelta(view, direction)
  const headPosition = typeof selection.head === 'number' ? selection.head : selection.to
  const currentIndex = findEditorTextLineRangeIndex(blockRanges, headPosition)
  const currentRange = blockRanges[currentIndex]
  if (!currentRange) return null

  const currentOffset = Math.max(0, Math.min(currentRange.length, headPosition - currentRange.start))
  let targetIndex = Math.max(0, Math.min(blockRanges.length - 1, currentIndex + fallbackDelta))

  if (typeof view?.coordsAtPos === 'function' && typeof view?.posAtCoords === 'function') {
    const coords = view.coordsAtPos(Math.max(currentRange.start, Math.min(currentRange.end, headPosition)))
    if (coords) {
      const viewportHeight = getEditorPageMovementViewportHeight(view)
      const targetTop = Number(coords.top ?? 0) + direction * Math.max(1, viewportHeight * 0.85)
      const targetLeft = Number(coords.left ?? 0)
      const target = view.posAtCoords({ left: targetLeft, top: targetTop })
      const targetIndexFromCoords =
        typeof target?.pos === 'number' ? findEditorTextLineRangeIndex(blockRanges, target.pos) : -1
      if (targetIndexFromCoords >= 0) {
        targetIndex = targetIndexFromCoords
      }
    }
  }

  const targetRange = blockRanges[targetIndex]
  if (!targetRange) return null
  return targetRange.start + Math.min(targetRange.length, currentOffset)
}

export function applySingleCursorPageMovement(
  view: any,
  movement: EditorPageMovement,
  extendSelection = false,
): boolean {
  const targetPosition = getSingleCursorPageMovementTargetPosition(view, movement)
  const state = view?.state
  if (!state || targetPosition === null) return false

  const docSize = Math.max(0, state.doc?.content?.size ?? 0)
  const target = Math.max(0, Math.min(docSize, targetPosition))
  const anchor = extendSelection
    ? (typeof state.selection?.anchor === 'number' ? state.selection.anchor : state.selection?.from ?? target)
    : target

  try {
    const selection = TextSelection.create(state.doc, anchor, target)
    view.dispatch?.(state.tr.setSelection(selection).scrollIntoView())
    return true
  } catch {
    try {
      const selection = Selection.near(state.doc.resolve(target), getPageMovementDirection(movement))
      view.dispatch?.(state.tr.setSelection(selection).scrollIntoView())
      return true
    } catch {
      return false
    }
  }
}

export function getMultiLinePageMovementRowDelta(
  view: any,
  multiLineEdit: MultiLineEditState,
  selectedIndices: number[],
  blockRanges: EditorTextLineRange[],
  movement: EditorPageMovement,
): number {
  const direction = getPageMovementDirection(movement)
  const fallbackDelta = getFallbackPageRowDelta(view, direction)
  const headRange = blockRanges[multiLineEdit.headBlockIndex]
  if (!headRange || typeof view?.coordsAtPos !== 'function' || typeof view?.posAtCoords !== 'function') {
    return clampRowDelta(selectedIndices, blockRanges, fallbackDelta)
  }

  const headOffset = getMultiLineColumnOffset(multiLineEdit, multiLineEdit.headBlockIndex, headRange)
  const headPos = Math.min(headRange.end, headRange.start + headOffset)
  const coords = view.coordsAtPos(headPos)
  if (!coords) return clampRowDelta(selectedIndices, blockRanges, fallbackDelta)

  const viewportHeight = getEditorPageMovementViewportHeight(view)
  const targetTop = Number(coords.top ?? 0) + direction * Math.max(1, viewportHeight * 0.85)
  const targetLeft = Number(coords.left ?? 0)
  const target = view.posAtCoords({ left: targetLeft, top: targetTop })
  const targetIndex = typeof target?.pos === 'number' ? findEditorTextLineRangeIndex(blockRanges, target.pos) : -1
  const rawDelta = targetIndex >= 0 ? targetIndex - multiLineEdit.headBlockIndex : fallbackDelta
  return clampRowDelta(selectedIndices, blockRanges, rawDelta === 0 ? fallbackDelta : rawDelta)
}

export function moveMultiLineCursorState(
  multiLineEdit: MultiLineEditState,
  selectedIndices: number[],
  blockRanges: EditorTextLineRange[],
  movement: MultiLineCursorMovement,
  options: MultiLineCursorRowsByDeltaOptions & { pageRowDelta?: number } = {},
): MultiLineEditState | null {
  if (movement === 'up' || movement === 'down' || movement === 'page-up' || movement === 'page-down') {
    const rowDelta =
      movement === 'up'
        ? -1
        : movement === 'down'
          ? 1
          : options.pageRowDelta ?? (movement === 'page-up' ? -10 : 10)
    return moveMultiLineCursorRowsByDelta(multiLineEdit, selectedIndices, blockRanges, rowDelta, {
      ...options,
      collapseAtBoundary: options.collapseAtBoundary ?? (movement === 'up' || movement === 'down'),
    })
  }

  const nextAnchorIndex = multiLineEdit.anchorBlockIndex
  const nextHeadIndex = multiLineEdit.headBlockIndex
  const nextCursorBlockIndices = multiLineEdit.cursorBlockIndices ? [...selectedIndices] : undefined
  const nextColumnOffsets: Record<number, number> = {}
  const nextSelectionAnchorOffsets: Record<number, number> | undefined = options.extendSelection ? {} : undefined

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
