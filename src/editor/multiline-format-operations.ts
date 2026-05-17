import type { Node as ProseMirrorNode } from 'prosemirror-model'
import type { EditorTextLineRange, MultiLineEditState, MultiLineInlineFormat } from '../types/app'
import {
  getMultiLineColumnOffset,
  getMultiLineSelectedBlockIndices,
  getMultiLineSelectionRanges,
} from './multiline-edit'
import { getParagraphSpaceShortcut } from './editor-setup'
import { getEditorTextLineRanges, isCodeBlockTextLineRange } from './multiline-ranges'

export type MultiLineHeadingLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6

type ReplacementRange = {
  from: number
  to: number
}

type TopLevelTextBlockContext = ReplacementRange & {
  blockIndex: number
  text: string
  node: ProseMirrorNode
  nodeType: 'paragraph' | 'heading'
}

type MultiLineOperationPlan = {
  transaction: any
  nextState: MultiLineEditState
}

type MultiLineHeadingOperationOptions = {
  textByBlockIndex?: Map<number, string>
}

type InlineMarkerShortcut = {
  format: MultiLineInlineFormat
  marker: '**' | '*' | '_' | '~~'
  textByBlockIndex: Map<number, string>
}

const INLINE_FORMAT_MARK_NAMES: Record<MultiLineInlineFormat, string> = {
  bold: 'strong',
  italic: 'emph',
  strike: 'strike',
}

function stripEditorPlaceholders(text: string): string {
  return text.replace(/\u200b/g, '')
}

function getInlineFormatMarkType(schema: any, format: MultiLineInlineFormat) {
  return schema?.marks?.[INLINE_FORMAT_MARK_NAMES[format]] ?? null
}

export function getActiveInlineFormatMarks(schema: any, formats: MultiLineInlineFormat[] | undefined) {
  return (formats ?? [])
    .map((format) => getInlineFormatMarkType(schema, format))
    .filter(Boolean)
    .map((markType: any) => markType.create())
}

export function applyActiveInlineFormatsToStoredMarks(
  transaction: any,
  schema: any,
  formats: MultiLineInlineFormat[] | undefined,
) {
  return transaction.setStoredMarks(getActiveInlineFormatMarks(schema, formats))
}

export function applyActiveInlineFormatsToInsertedText(
  transaction: any,
  schema: any,
  from: number,
  text: string,
  formats: MultiLineInlineFormat[] | undefined,
) {
  if (text.length === 0) return transaction
  let nextTransaction = transaction
  const to = from + text.length
  for (const format of Object.keys(INLINE_FORMAT_MARK_NAMES) as MultiLineInlineFormat[]) {
    const markType = getInlineFormatMarkType(schema, format)
    if (markType) {
      nextTransaction = nextTransaction.removeMark(from, to, markType)
    }
  }
  for (const format of formats ?? []) {
    const markType = getInlineFormatMarkType(schema, format)
    if (markType) {
      nextTransaction = nextTransaction.addMark(from, to, markType.create())
    }
  }
  return nextTransaction
}

function toggleActiveInlineFormat(
  multiLineEdit: MultiLineEditState,
  format: MultiLineInlineFormat,
): MultiLineInlineFormat[] | undefined {
  const current = new Set(multiLineEdit.activeInlineFormats ?? [])
  if (current.has(format)) {
    current.delete(format)
  } else {
    current.add(format)
  }
  return current.size > 0 ? Array.from(current) : undefined
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

function getTextBlockDepth(resolved: any): number | null {
  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    if (resolved.node(depth)?.isTextblock) return depth
  }
  return null
}

function getTopLevelTextBlockContext(
  view: any,
  blockIndex: number,
  range: EditorTextLineRange,
): TopLevelTextBlockContext | null {
  if (isCodeBlockTextLineRange(range)) return null

  const resolved = resolveSafe(view?.state?.doc, range.start)
  if (!resolved) return null
  const textBlockDepth = getTextBlockDepth(resolved)
  const node = textBlockDepth === null ? null : resolved.node(textBlockDepth)
  const nodeType = node?.type?.name
  if (textBlockDepth !== 1 || (nodeType !== 'paragraph' && nodeType !== 'heading')) return null

  return {
    blockIndex,
    text: range.text,
    node,
    nodeType,
    from: resolved.before(textBlockDepth),
    to: resolved.after(textBlockDepth),
  }
}

function getMultiLineFormatContext(view: any, multiLineEdit: MultiLineEditState) {
  const blockRanges = getEditorTextLineRanges(view)
  if (blockRanges.length === 0) return null

  const selectedIndices = getMultiLineSelectedBlockIndices(multiLineEdit, blockRanges)
  if (selectedIndices.length < 2) return null

  return {
    blockRanges,
    selectedIndices,
  }
}

function getTopLevelTextBlockContexts(view: any, multiLineEdit: MultiLineEditState) {
  const context = getMultiLineFormatContext(view, multiLineEdit)
  if (!context) return null

  const contexts = context.selectedIndices.map((index) => {
    const range = context.blockRanges[index]
    return range ? getTopLevelTextBlockContext(view, index, range) : null
  })
  if (contexts.some((row) => row === null)) return null

  return {
    ...context,
    contexts: contexts as TopLevelTextBlockContext[],
  }
}

export function buildMultiLineHeadingOperationPlan(
  view: any,
  multiLineEdit: MultiLineEditState,
  level: MultiLineHeadingLevel,
  options: MultiLineHeadingOperationOptions = {},
): MultiLineOperationPlan | null {
  const context = getTopLevelTextBlockContexts(view, multiLineEdit)
  if (!context) return null

  const schema = view.state.schema
  const nodeType = level === 0 ? schema.nodes.paragraph : schema.nodes.heading
  if (!nodeType) return null

  let transaction = view.state.tr
  for (const row of [...context.contexts].sort((a, b) => b.from - a.from)) {
    const textOverride = options.textByBlockIndex?.get(row.blockIndex)
    const content =
      typeof textOverride === 'string'
        ? textOverride
          ? schema.text(stripEditorPlaceholders(textOverride))
          : undefined
        : row.node.content
    const attrs = level === 0 ? null : { level, headingType: 'atx' }
    transaction = transaction.replaceWith(row.from, row.to, nodeType.create(attrs, content))
  }

  const nextColumnOffsets = context.selectedIndices.reduce<Record<number, number>>((acc, index) => {
    const range = context.blockRanges[index]
    if (!range) return acc
    const textOverride = options.textByBlockIndex?.get(index)
    acc[index] =
      typeof textOverride === 'string'
        ? stripEditorPlaceholders(textOverride).length
        : Math.min(range.length, getMultiLineColumnOffset(multiLineEdit, index, range))
    return acc
  }, { ...(multiLineEdit.columnOffsets ?? {}) })

  return {
    transaction,
    nextState: {
      ...multiLineEdit,
      columnOffset: nextColumnOffsets[multiLineEdit.headBlockIndex] ?? multiLineEdit.columnOffset,
      columnOffsets: nextColumnOffsets,
      selectionAnchorOffsets: undefined,
    },
  }
}

export function getMultiLineHeadingMarkerShortcut(
  view: any,
  multiLineEdit: MultiLineEditState,
): { level: MultiLineHeadingLevel; textByBlockIndex: Map<number, string> } | null {
  const context = getTopLevelTextBlockContexts(view, multiLineEdit)
  if (!context) return null
  if (context.contexts.some((row) => row.nodeType !== 'paragraph')) return null

  let level: MultiLineHeadingLevel | null = null
  const textByBlockIndex = new Map<number, string>()

  for (const blockIndex of context.selectedIndices) {
    const range = context.blockRanges[blockIndex]
    if (!range) return null
    const currentOffset = getMultiLineColumnOffset(multiLineEdit, blockIndex, range)
    const markerText = range.text.slice(0, currentOffset)
    const trailingText = stripEditorPlaceholders(range.text.slice(currentOffset))
    if (trailingText.trim().length > 0) return null

    const shortcut = getParagraphSpaceShortcut(markerText)
    if (shortcut?.kind !== 'heading') return null
    const nextLevel = shortcut.level as MultiLineHeadingLevel
    if (level !== null && level !== nextLevel) return null
    level = nextLevel
    textByBlockIndex.set(blockIndex, '')
  }

  return level === null ? null : { level, textByBlockIndex }
}

function rangeIsFullyMarked(doc: any, from: number, to: number, markType: any): boolean {
  let textLength = 0
  let markedLength = 0

  doc.nodesBetween(from, to, (node: any, position: number) => {
    if (!node?.isText || typeof node.text !== 'string') return true
    const segmentFrom = Math.max(from, position)
    const segmentTo = Math.min(to, position + node.text.length)
    if (segmentTo <= segmentFrom) return false
    const segmentLength = segmentTo - segmentFrom
    textLength += segmentLength
    if (node.marks?.some((mark: any) => mark?.type === markType)) {
      markedLength += segmentLength
    }
    return false
  })

  return textLength > 0 && markedLength === textLength
}

export function buildMultiLineInlineFormatPlan(
  view: any,
  multiLineEdit: MultiLineEditState,
  format: MultiLineInlineFormat,
): MultiLineOperationPlan | null {
  const context = getMultiLineFormatContext(view, multiLineEdit)
  if (!context) return null

  const markType = getInlineFormatMarkType(view.state.schema, format)
  if (!markType) return null

  const selectionRanges = getMultiLineSelectionRanges(multiLineEdit, context.selectedIndices, context.blockRanges)
  if (selectionRanges.length === 0) {
    return {
      transaction: view.state.tr.setMeta('addToHistory', false),
      nextState: {
        ...multiLineEdit,
        activeInlineFormats: toggleActiveInlineFormat(multiLineEdit, format),
      },
    }
  }
  if (selectionRanges.some((range) => isCodeBlockTextLineRange(context.blockRanges[range.blockIndex]))) return null

  const shouldRemove = selectionRanges.every((range) =>
    rangeIsFullyMarked(view.state.doc, range.from, range.to, markType),
  )
  let transaction = view.state.tr
  selectionRanges.forEach((range) => {
    transaction = shouldRemove
      ? transaction.removeMark(range.from, range.to, markType)
      : transaction.addMark(range.from, range.to, markType.create())
  })

  return {
    transaction,
    nextState: {
      ...multiLineEdit,
      activeInlineFormats: undefined,
    },
  }
}

function parseClosedInlineMarker(text: string): Omit<InlineMarkerShortcut, 'textByBlockIndex'> & { text: string } | null {
  const normalized = stripEditorPlaceholders(text)
  const boldMatch = normalized.match(/^\*\*(.+)\*\*$/)
  if (boldMatch?.[1]?.trim()) return { format: 'bold', marker: '**', text: boldMatch[1] }

  const strikeMatch = normalized.match(/^~~(.+)~~$/)
  if (strikeMatch?.[1]?.trim()) return { format: 'strike', marker: '~~', text: strikeMatch[1] }

  const starItalicMatch = normalized.match(/^\*(.+)\*$/)
  if (starItalicMatch?.[1]?.trim() && !starItalicMatch[1].startsWith('*') && !starItalicMatch[1].endsWith('*')) {
    return { format: 'italic', marker: '*', text: starItalicMatch[1] }
  }

  const underscoreItalicMatch = normalized.match(/^_(.+)_$/)
  if (underscoreItalicMatch?.[1]?.trim()) return { format: 'italic', marker: '_', text: underscoreItalicMatch[1] }

  return null
}

export function getMultiLineInlineMarkerShortcut(
  view: any,
  multiLineEdit: MultiLineEditState,
  inputText: string,
): InlineMarkerShortcut | null {
  const context = getMultiLineFormatContext(view, multiLineEdit)
  if (!context || inputText.length !== 1) return null
  if (getMultiLineSelectionRanges(multiLineEdit, context.selectedIndices, context.blockRanges).length > 0) return null

  let format: MultiLineInlineFormat | null = null
  let marker: InlineMarkerShortcut['marker'] | null = null
  const textByBlockIndex = new Map<number, string>()

  for (const blockIndex of context.selectedIndices) {
    const range = context.blockRanges[blockIndex]
    if (!range || isCodeBlockTextLineRange(range)) return null

    const currentOffset = getMultiLineColumnOffset(multiLineEdit, blockIndex, range)
    const beforeText = range.text.slice(0, currentOffset)
    const afterText = range.text.slice(currentOffset)
    if (stripEditorPlaceholders(afterText).trim().length > 0) return null

    const parsed = parseClosedInlineMarker(beforeText + inputText + afterText)
    if (!parsed) return null
    if ((format && format !== parsed.format) || (marker && marker !== parsed.marker)) return null
    format = parsed.format
    marker = parsed.marker
    textByBlockIndex.set(blockIndex, parsed.text)
  }

  return format && marker ? { format, marker, textByBlockIndex } : null
}

export function buildMultiLineInlineMarkerOperationPlan(
  view: any,
  multiLineEdit: MultiLineEditState,
  inputText: string,
): MultiLineOperationPlan | null {
  const shortcut = getMultiLineInlineMarkerShortcut(view, multiLineEdit, inputText)
  if (!shortcut) return null
  const context = getMultiLineFormatContext(view, multiLineEdit)
  if (!context) return null

  const markType = getInlineFormatMarkType(view.state.schema, shortcut.format)
  if (!markType) return null

  let transaction = view.state.tr
  for (const blockIndex of [...context.selectedIndices].sort((a, b) => b - a)) {
    const range = context.blockRanges[blockIndex]
    if (!range) continue
    const text = shortcut.textByBlockIndex.get(blockIndex) ?? ''
    const replacement = text ? view.state.schema.text(text, [markType.create()]) : undefined
    transaction =
      replacement === undefined
        ? transaction.delete(range.start, range.end)
        : transaction.replaceWith(range.start, range.end, replacement)
  }

  const nextColumnOffsets = context.selectedIndices.reduce<Record<number, number>>((acc, index) => {
    acc[index] = shortcut.textByBlockIndex.get(index)?.length ?? 0
    return acc
  }, { ...(multiLineEdit.columnOffsets ?? {}) })

  return {
    transaction,
    nextState: {
      ...multiLineEdit,
      columnOffset: nextColumnOffsets[multiLineEdit.headBlockIndex] ?? multiLineEdit.columnOffset,
      columnOffsets: nextColumnOffsets,
      selectionAnchorOffsets: undefined,
      activeInlineFormats: undefined,
    },
  }
}
