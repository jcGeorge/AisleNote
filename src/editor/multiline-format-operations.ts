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

type ListItemRowContext = {
  kind: 'listItem'
  blockIndex: number
  text: string
  listStart: number
  listEnd: number
  itemIndex: number
  listNode: ProseMirrorNode
  itemNode: ProseMirrorNode
}

type BlockQuoteRowContext = {
  kind: 'blockQuoteChild'
  blockIndex: number
  text: string
  quoteStart: number
  quoteEnd: number
  childIndex: number
  quoteNode: ProseMirrorNode
  childNode: ProseMirrorNode
}

type CodeBlockLineRowContext = {
  kind: 'codeBlockLine'
  blockIndex: number
  text: string
  codeStart: number
  codeEnd: number
  lineIndex: number
  codeNode: ProseMirrorNode
}

type BlockFormatRowContext =
  | (TopLevelTextBlockContext & { kind: 'textBlock' })
  | ListItemRowContext
  | BlockQuoteRowContext
  | CodeBlockLineRowContext

type MultiLineOperationPlan = {
  transaction: any
  nextState: MultiLineEditState
}

type MultiLineHeadingOperationOptions = {
  textByBlockIndex?: Map<number, string>
}

type MultiLineBlockQuoteOperationOptions = {
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

function getListItemDepth(resolved: any): number | null {
  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    if (resolved.node(depth)?.type?.name === 'listItem') return depth
  }
  return null
}

function getCodeBlockLineIndex(codeNode: ProseMirrorNode, codeStart: number, range: EditorTextLineRange): number {
  const lineStartOffset = Math.max(0, range.start - (codeStart + 1))
  return (codeNode.textContent.slice(0, lineStartOffset).match(/\n/g) ?? []).length
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

function getBlockFormatRowContext(
  view: any,
  blockIndex: number,
  range: EditorTextLineRange,
): BlockFormatRowContext | null {
  const doc = view?.state?.doc
  const resolved = resolveSafe(doc, range.start)
  if (!resolved) return null

  if (isCodeBlockTextLineRange(range)) {
    const codeDepth = getTextBlockDepth(resolved)
    const codeNode = codeDepth === null ? null : resolved.node(codeDepth)
    if (codeDepth !== 1 || codeNode?.type?.name !== 'codeBlock') return null
    const codeStart = resolved.before(codeDepth)
    return {
      kind: 'codeBlockLine',
      blockIndex,
      text: range.text,
      codeStart,
      codeEnd: resolved.after(codeDepth),
      lineIndex: getCodeBlockLineIndex(codeNode, codeStart, range),
      codeNode,
    }
  }

  const listItemDepth = getListItemDepth(resolved)
  if (listItemDepth !== null) {
    const listDepth = listItemDepth - 1
    const listNode = resolved.node(listDepth)
    const itemNode = resolved.node(listItemDepth)
    if (listDepth !== 1 || !listNode || !itemNode) return null
    return {
      kind: 'listItem',
      blockIndex,
      text: range.text,
      listStart: resolved.before(listDepth),
      listEnd: resolved.after(listDepth),
      itemIndex: resolved.index(listDepth),
      listNode,
      itemNode,
    }
  }

  const textBlockDepth = getTextBlockDepth(resolved)
  const node = textBlockDepth === null ? null : resolved.node(textBlockDepth)
  const nodeType = node?.type?.name
  if (textBlockDepth === null || (nodeType !== 'paragraph' && nodeType !== 'heading')) return null

  const parentDepth = textBlockDepth - 1
  const parentNode = parentDepth > 0 ? resolved.node(parentDepth) : null
  if (parentNode?.type?.name === 'blockQuote') {
    return {
      kind: 'blockQuoteChild',
      blockIndex,
      text: range.text,
      quoteStart: resolved.before(parentDepth),
      quoteEnd: resolved.after(parentDepth),
      childIndex: resolved.index(parentDepth),
      quoteNode: parentNode,
      childNode: node,
    }
  }

  if (textBlockDepth !== 1) return null

  return {
    kind: 'textBlock',
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

function getBlockFormatContexts(view: any, multiLineEdit: MultiLineEditState) {
  const context = getMultiLineFormatContext(view, multiLineEdit)
  if (!context) return null

  const contexts = context.selectedIndices.map((index) => {
    const range = context.blockRanges[index]
    return range ? getBlockFormatRowContext(view, index, range) : null
  })
  if (contexts.some((row) => row === null)) return null

  return {
    ...context,
    contexts: contexts as BlockFormatRowContext[],
  }
}

function getAdjacentIndexGroups(indices: number[]): number[][] {
  const sorted = [...new Set(indices)].sort((a, b) => a - b)
  const groups: number[][] = []

  for (const index of sorted) {
    const current = groups.at(-1)
    if (current && current.at(-1) === index - 1) current.push(index)
    else groups.push([index])
  }

  return groups
}

function createParagraphWithText(schema: any, text: string): ProseMirrorNode {
  const normalized = stripEditorPlaceholders(text)
  return schema.nodes.paragraph.create(null, normalized ? schema.text(normalized) : undefined)
}

function createBlockQuoteNodeFromLines(schema: any, lines: string[]): ProseMirrorNode | null {
  const blockQuoteType = schema.nodes.blockQuote
  const paragraphType = schema.nodes.paragraph
  if (!blockQuoteType || !paragraphType || lines.length === 0) return null
  return blockQuoteType.create(null, lines.map((line) => createParagraphWithText(schema, line)))
}

function createCodeBlockNodeFromLines(schema: any, lines: string[], attrs?: Record<string, unknown> | null): ProseMirrorNode | null {
  const codeBlockType = schema.nodes.codeBlock
  if (!codeBlockType || lines.length === 0) return null
  const text = stripEditorPlaceholders(lines.join('\n'))
  return codeBlockType.create(attrs ?? null, text ? schema.text(text) : undefined)
}

function createListNodeLikeOriginal(listNode: ProseMirrorNode, items: ProseMirrorNode[]): ProseMirrorNode | null {
  if (items.length === 0) return null
  return listNode.type.create(listNode.attrs, items)
}

function createBlockQuoteNodeLikeOriginal(quoteNode: ProseMirrorNode, children: ProseMirrorNode[]): ProseMirrorNode | null {
  if (children.length === 0) return null
  return quoteNode.type.create(quoteNode.attrs, children)
}

function createCodeBlockNodeLikeOriginal(codeNode: ProseMirrorNode, lines: string[]): ProseMirrorNode | null {
  return createCodeBlockNodeFromLines(codeNode.type.schema, lines, codeNode.attrs)
}

function createTargetBlockNodes(schema: any, operation: 'blockQuote' | 'codeBlock', lines: string[]): ProseMirrorNode[] {
  const node =
    operation === 'blockQuote'
      ? createBlockQuoteNodeFromLines(schema, lines)
      : createCodeBlockNodeFromLines(schema, lines)
  return node ? [node] : []
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

function buildTextBlockTargetReplacements(
  schema: any,
  textBlockContexts: Array<TopLevelTextBlockContext & { kind: 'textBlock' }>,
  operation: 'blockQuote' | 'codeBlock',
  textByBlockIndex: Map<number, string> | undefined,
): Array<ReplacementRange & { nodes: ProseMirrorNode[] }> {
  const contextsByBlockIndex = new Map(textBlockContexts.map((row) => [row.blockIndex, row]))
  return getAdjacentIndexGroups(textBlockContexts.map((context) => context.blockIndex))
    .map((group) => {
      const rows = group.map((blockIndex) => contextsByBlockIndex.get(blockIndex)).filter(Boolean) as TopLevelTextBlockContext[]
      const first = rows[0]
      const last = rows[rows.length - 1]
      if (!first || !last) return null

      const textOverrides = rows.map((row) => textByBlockIndex?.get(row.blockIndex))
      const shouldPreserveInlineContent =
        operation === 'blockQuote' &&
        Boolean(schema.nodes.blockQuote && schema.nodes.paragraph) &&
        textOverrides.every((text) => typeof text !== 'string')
      const nodes =
        shouldPreserveInlineContent
          ? [
              schema.nodes.blockQuote.create(
                null,
                rows.map((row) => schema.nodes.paragraph.create(null, row.node.content)),
              ),
            ]
          : createTargetBlockNodes(
              schema,
              operation,
              rows.map((row, index) => textOverrides[index] ?? row.text),
            )
      return {
        from: first.from,
        to: last.to,
        nodes,
      }
    })
    .filter((replacement): replacement is ReplacementRange & { nodes: ProseMirrorNode[] } => Boolean(replacement))
}

function buildListTargetReplacementNodes(
  schema: any,
  listNode: ProseMirrorNode,
  selectedContexts: ListItemRowContext[],
  operation: 'blockQuote' | 'codeBlock',
): ProseMirrorNode[] {
  const selectedByItemIndex = new Map(selectedContexts.map((context) => [context.itemIndex, context]))
  const nodes: ProseMirrorNode[] = []
  let runSelected: boolean | null = null
  let runItems: ProseMirrorNode[] = []
  let runContexts: ListItemRowContext[] = []

  const flushRun = () => {
    if (runSelected === null || runItems.length === 0) return
    if (!runSelected) {
      const list = createListNodeLikeOriginal(listNode, runItems)
      if (list) nodes.push(list)
    } else {
      nodes.push(...createTargetBlockNodes(schema, operation, runContexts.map((context) => context.text)))
    }
    runSelected = null
    runItems = []
    runContexts = []
  }

  for (let index = 0; index < listNode.childCount; index += 1) {
    const context = selectedByItemIndex.get(index)
    const selected = Boolean(context)
    if (runSelected !== null && runSelected !== selected) flushRun()
    runSelected = selected
    runItems.push(listNode.child(index))
    if (context) runContexts.push(context)
  }
  flushRun()

  return nodes
}

function buildListTargetReplacements(
  schema: any,
  listContexts: ListItemRowContext[],
  operation: 'blockQuote' | 'codeBlock',
): Array<ReplacementRange & { nodes: ProseMirrorNode[] }> {
  const contextsByListStart = new Map<number, ListItemRowContext[]>()
  listContexts.forEach((context) => {
    const existing = contextsByListStart.get(context.listStart) ?? []
    existing.push(context)
    contextsByListStart.set(context.listStart, existing)
  })

  return Array.from(contextsByListStart.values()).map((contexts) => {
    const first = contexts[0]
    const sortedContexts = [...contexts].sort((a, b) => a.itemIndex - b.itemIndex)
    return {
      from: first.listStart,
      to: first.listEnd,
      nodes: buildListTargetReplacementNodes(schema, first.listNode, sortedContexts, operation),
    }
  })
}

function buildQuoteTargetReplacementNodes(
  schema: any,
  quoteNode: ProseMirrorNode,
  selectedContexts: BlockQuoteRowContext[],
  operation: 'blockQuote' | 'codeBlock',
): ProseMirrorNode[] {
  if (operation === 'blockQuote') return []
  const selectedByChildIndex = new Map(selectedContexts.map((context) => [context.childIndex, context]))
  const nodes: ProseMirrorNode[] = []
  let runSelected: boolean | null = null
  let runChildren: ProseMirrorNode[] = []
  let runContexts: BlockQuoteRowContext[] = []

  const flushRun = () => {
    if (runSelected === null || runChildren.length === 0) return
    if (!runSelected) {
      const quote = createBlockQuoteNodeLikeOriginal(quoteNode, runChildren)
      if (quote) nodes.push(quote)
    } else {
      nodes.push(...createTargetBlockNodes(schema, operation, runContexts.map((context) => context.text)))
    }
    runSelected = null
    runChildren = []
    runContexts = []
  }

  for (let index = 0; index < quoteNode.childCount; index += 1) {
    const context = selectedByChildIndex.get(index)
    const selected = Boolean(context)
    if (runSelected !== null && runSelected !== selected) flushRun()
    runSelected = selected
    runChildren.push(quoteNode.child(index))
    if (context) runContexts.push(context)
  }
  flushRun()

  return nodes
}

function buildQuoteTargetReplacements(
  schema: any,
  quoteContexts: BlockQuoteRowContext[],
  operation: 'blockQuote' | 'codeBlock',
): Array<ReplacementRange & { nodes: ProseMirrorNode[] }> {
  const contextsByQuoteStart = new Map<number, BlockQuoteRowContext[]>()
  quoteContexts.forEach((context) => {
    const existing = contextsByQuoteStart.get(context.quoteStart) ?? []
    existing.push(context)
    contextsByQuoteStart.set(context.quoteStart, existing)
  })

  return Array.from(contextsByQuoteStart.values()).map((contexts) => {
    const first = contexts[0]
    const sortedContexts = [...contexts].sort((a, b) => a.childIndex - b.childIndex)
    return {
      from: first.quoteStart,
      to: first.quoteEnd,
      nodes: buildQuoteTargetReplacementNodes(schema, first.quoteNode, sortedContexts, operation),
    }
  })
}

function buildCodeBlockTargetReplacementNodes(
  schema: any,
  codeNode: ProseMirrorNode,
  selectedContexts: CodeBlockLineRowContext[],
  operation: 'blockQuote' | 'codeBlock',
): ProseMirrorNode[] {
  if (operation === 'codeBlock') return []
  const lines = codeNode.textContent.split('\n')
  const selectedByLineIndex = new Map(selectedContexts.map((context) => [context.lineIndex, context]))
  const nodes: ProseMirrorNode[] = []
  let runSelected: boolean | null = null
  let runLines: string[] = []
  let runContexts: CodeBlockLineRowContext[] = []

  const flushRun = () => {
    if (runSelected === null || runLines.length === 0) return
    if (!runSelected) {
      const codeBlock = createCodeBlockNodeLikeOriginal(codeNode, runLines)
      if (codeBlock) nodes.push(codeBlock)
    } else {
      nodes.push(...createTargetBlockNodes(schema, operation, runContexts.map((context) => context.text)))
    }
    runSelected = null
    runLines = []
    runContexts = []
  }

  lines.forEach((line, index) => {
    const context = selectedByLineIndex.get(index)
    const selected = Boolean(context)
    if (runSelected !== null && runSelected !== selected) flushRun()
    runSelected = selected
    runLines.push(line)
    if (context) runContexts.push(context)
  })
  flushRun()

  return nodes
}

function buildCodeBlockTargetReplacements(
  schema: any,
  codeContexts: CodeBlockLineRowContext[],
  operation: 'blockQuote' | 'codeBlock',
): Array<ReplacementRange & { nodes: ProseMirrorNode[] }> {
  const contextsByCodeStart = new Map<number, CodeBlockLineRowContext[]>()
  codeContexts.forEach((context) => {
    const existing = contextsByCodeStart.get(context.codeStart) ?? []
    existing.push(context)
    contextsByCodeStart.set(context.codeStart, existing)
  })

  return Array.from(contextsByCodeStart.values()).map((contexts) => {
    const first = contexts[0]
    const sortedContexts = [...contexts].sort((a, b) => a.lineIndex - b.lineIndex)
    return {
      from: first.codeStart,
      to: first.codeEnd,
      nodes: buildCodeBlockTargetReplacementNodes(schema, first.codeNode, sortedContexts, operation),
    }
  })
}

function buildMultiLineBlockFormatOperationPlan(
  view: any,
  multiLineEdit: MultiLineEditState,
  operation: 'blockQuote' | 'codeBlock',
  options: MultiLineBlockQuoteOperationOptions = {},
): MultiLineOperationPlan | null {
  const context = getBlockFormatContexts(view, multiLineEdit)
  if (!context) return null

  const schema = view.state.schema
  const textBlockContexts = context.contexts.filter(
    (row): row is TopLevelTextBlockContext & { kind: 'textBlock' } => row.kind === 'textBlock',
  )
  const listContexts = context.contexts.filter((row): row is ListItemRowContext => row.kind === 'listItem')
  const quoteContexts = context.contexts.filter((row): row is BlockQuoteRowContext => row.kind === 'blockQuoteChild')
  const codeContexts = context.contexts.filter((row): row is CodeBlockLineRowContext => row.kind === 'codeBlockLine')
  const replacements = [
    ...buildTextBlockTargetReplacements(schema, textBlockContexts, operation, options.textByBlockIndex),
    ...buildListTargetReplacements(schema, listContexts, operation),
    ...buildQuoteTargetReplacements(schema, quoteContexts, operation),
    ...buildCodeBlockTargetReplacements(schema, codeContexts, operation),
  ].filter((replacement) => replacement.nodes.length > 0)
  if (replacements.length === 0) return null

  let transaction = view.state.tr
  for (const replacement of [...replacements].sort((a, b) => b.from - a.from)) {
    transaction = transaction.replaceWith(replacement.from, replacement.to, replacement.nodes)
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

export function buildMultiLineBlockQuoteOperationPlan(
  view: any,
  multiLineEdit: MultiLineEditState,
  options: MultiLineBlockQuoteOperationOptions = {},
): MultiLineOperationPlan | null {
  return buildMultiLineBlockFormatOperationPlan(view, multiLineEdit, 'blockQuote', options)
}

export function buildMultiLineCodeBlockOperationPlan(
  view: any,
  multiLineEdit: MultiLineEditState,
): MultiLineOperationPlan | null {
  return buildMultiLineBlockFormatOperationPlan(view, multiLineEdit, 'codeBlock')
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

export function getMultiLineBlockQuoteMarkerShortcut(
  view: any,
  multiLineEdit: MultiLineEditState,
): { textByBlockIndex: Map<number, string> } | null {
  const context = getTopLevelTextBlockContexts(view, multiLineEdit)
  if (!context) return null

  const textByBlockIndex = new Map<number, string>()

  for (const blockIndex of context.selectedIndices) {
    const range = context.blockRanges[blockIndex]
    if (!range) return null
    const currentOffset = getMultiLineColumnOffset(multiLineEdit, blockIndex, range)
    const markerText = range.text.slice(0, currentOffset)
    const trailingText = stripEditorPlaceholders(range.text.slice(currentOffset))
    if (trailingText.trim().length > 0) return null

    const shortcut = getParagraphSpaceShortcut(markerText)
    if (shortcut?.kind !== 'blockQuote') return null
    textByBlockIndex.set(blockIndex, '')
  }

  return textByBlockIndex.size > 0 ? { textByBlockIndex } : null
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
