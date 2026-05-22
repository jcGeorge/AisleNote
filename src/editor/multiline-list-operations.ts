import { Fragment, type Node as ProseMirrorNode } from 'prosemirror-model'
import type { EditorTextLineRange, MultiLineEditState } from '../types/app'
import { createBulletListAttrs, getBulletListMarkerFromAttrs } from './list-markers'
import { getMultiLineSelectedBlockIndices, getMultiLineColumnOffset } from './multiline-edit'
import { getEditorTextLineRanges, isCodeBlockTextLineRange } from './multiline-ranges'
import { getParagraphSpaceShortcut } from './editor-setup'

export type MultiLineListOperation = 'task' | 'dashList' | 'bulletList' | 'numberedList'

type ReplacementRange = {
  from: number
  to: number
}

type TextBlockRowContext = ReplacementRange & {
  kind: 'textBlock'
  blockIndex: number
  text: string
}

type ListItemRowContext = {
  kind: 'listItem'
  blockIndex: number
  text: string
  currentOperation: MultiLineListOperation
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

type RowContext = TextBlockRowContext | ListItemRowContext | BlockQuoteRowContext | CodeBlockLineRowContext

type MultiLineListOperationOptions = {
  textByBlockIndex?: Map<number, string>
}

type MultiLineListOperationPlan = {
  transaction: any
  nextState: MultiLineEditState
}

function stripEditorPlaceholders(text: string): string {
  return text.replace(/\u200b/g, '')
}

export function getAdjacentIndexGroups(indices: number[]): number[][] {
  const sorted = [...new Set(indices)].sort((a, b) => a - b)
  const groups: number[][] = []

  sorted.forEach((index) => {
    const current = groups.at(-1)
    if (current && current.at(-1) === index - 1) {
      current.push(index)
      return
    }
    groups.push([index])
  })

  return groups
}

function createParagraph(schema: any, text: string): ProseMirrorNode {
  return schema.nodes.paragraph.create(null, text ? schema.text(text) : undefined)
}

function getListAttrsForOperation(operation: MultiLineListOperation): Record<string, unknown> | null {
  return operation === 'numberedList'
    ? { order: 1 }
    : createBulletListAttrs(operation === 'dashList' ? 'dash' : 'bullet')
}

function getListItemAttrsForOperation(
  operation: MultiLineListOperation,
  previousAttrs: Record<string, unknown> | null | undefined = null,
): Record<string, unknown> | null {
  const nextAttrs = { ...(previousAttrs ?? {}) }
  if (operation === 'task') {
    return {
      ...nextAttrs,
      task: true,
      checked: nextAttrs.checked === true,
    }
  }

  delete nextAttrs.task
  delete nextAttrs.checked
  return Object.keys(nextAttrs).length > 0 ? nextAttrs : null
}

function createListItem(schema: any, operation: MultiLineListOperation, text: string): ProseMirrorNode {
  const attrs = getListItemAttrsForOperation(operation)
  return schema.nodes.listItem.create(attrs, createParagraph(schema, text))
}

function copyListItemForOperation(itemNode: ProseMirrorNode, operation: MultiLineListOperation): ProseMirrorNode {
  return itemNode.type.create(
    getListItemAttrsForOperation(operation, itemNode.attrs),
    itemNode.content,
  )
}

export function createMultiLineListNode(
  schema: any,
  operation: MultiLineListOperation,
  lines: string[],
): ProseMirrorNode | null {
  if (lines.length === 0) return null
  const listType = operation === 'numberedList' ? schema.nodes.orderedList : schema.nodes.bulletList
  if (!listType || !schema.nodes.listItem || !schema.nodes.paragraph) return null

  const listAttrs = getListAttrsForOperation(operation)
  return listType.create(listAttrs, lines.map((line) => createListItem(schema, operation, stripEditorPlaceholders(line).trim())))
}

function createListNodeFromItems(schema: any, operation: MultiLineListOperation, items: ProseMirrorNode[]): ProseMirrorNode | null {
  if (items.length === 0) return null
  const listType = operation === 'numberedList' ? schema.nodes.orderedList : schema.nodes.bulletList
  if (!listType) return null
  return listType.create(getListAttrsForOperation(operation), Fragment.fromArray(items))
}

function createListNodeLikeOriginal(listNode: ProseMirrorNode, items: ProseMirrorNode[]): ProseMirrorNode | null {
  if (items.length === 0) return null
  return listNode.type.create(listNode.attrs, Fragment.fromArray(items))
}

function createBlockQuoteNodeLikeOriginal(quoteNode: ProseMirrorNode, children: ProseMirrorNode[]): ProseMirrorNode | null {
  if (children.length === 0) return null
  return quoteNode.type.create(quoteNode.attrs, Fragment.fromArray(children))
}

function createCodeBlockNodeLikeOriginal(codeNode: ProseMirrorNode, lines: string[]): ProseMirrorNode | null {
  if (lines.length === 0) return null
  const text = lines.join('\n')
  return codeNode.type.create(codeNode.attrs, text ? codeNode.type.schema.text(text) : undefined)
}

function getListItemTextBlocks(itemNode: ProseMirrorNode): ProseMirrorNode[] {
  const blocks: ProseMirrorNode[] = []
  itemNode.forEach((child) => {
    blocks.push(child)
  })
  return blocks
}

function getListItemOperation(listNode: ProseMirrorNode, itemNode: ProseMirrorNode): MultiLineListOperation | null {
  if (listNode.type.name === 'orderedList') return 'numberedList'
  if (listNode.type.name !== 'bulletList') return null
  if (itemNode.attrs?.task) return 'task'
  return getBulletListMarkerFromAttrs(listNode.attrs) === 'dash' ? 'dashList' : 'bulletList'
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

function getRowContext(view: any, blockIndex: number, range: EditorTextLineRange): RowContext | null {
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
    const currentOperation = getListItemOperation(listNode, itemNode)
    if (!currentOperation) return null
    return {
      kind: 'listItem',
      blockIndex,
      text: range.text,
      currentOperation,
      listStart: resolved.before(listDepth),
      listEnd: resolved.after(listDepth),
      itemIndex: resolved.index(listDepth),
      listNode,
      itemNode,
    }
  }

  const textBlockDepth = getTextBlockDepth(resolved)
  const textBlock = textBlockDepth === null ? null : resolved.node(textBlockDepth)
  if (textBlockDepth === null || (textBlock?.type?.name !== 'paragraph' && textBlock?.type?.name !== 'heading')) return null

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
    }
  }

  if (textBlockDepth !== 1) return null

  return {
    kind: 'textBlock',
    blockIndex,
    text: range.text,
    from: resolved.before(textBlockDepth),
    to: resolved.after(textBlockDepth),
  }
}

function buildParagraphReplacements(
  schema: any,
  paragraphContexts: TextBlockRowContext[],
  operation: MultiLineListOperation,
  textByBlockIndex: Map<number, string> | undefined,
): Array<ReplacementRange & { nodes: ProseMirrorNode[] }> {
  const contextsByBlockIndex = new Map(paragraphContexts.map((context) => [context.blockIndex, context]))
  return getAdjacentIndexGroups(paragraphContexts.map((context) => context.blockIndex))
    .map((group) => {
      const contexts = group.map((blockIndex) => contextsByBlockIndex.get(blockIndex)).filter(Boolean) as TextBlockRowContext[]
      const first = contexts[0]
      const last = contexts[contexts.length - 1]
      const listNode = createMultiLineListNode(
        schema,
        operation,
        contexts.map((context) => textByBlockIndex?.get(context.blockIndex) ?? context.text),
      )
      return first && last && listNode
        ? {
            from: first.from,
            to: last.to,
            nodes: [listNode],
          }
        : null
    })
    .filter((replacement): replacement is ReplacementRange & { nodes: ProseMirrorNode[] } => Boolean(replacement))
}

function buildTransformedSelectedListRun(
  schema: any,
  operation: MultiLineListOperation,
  contexts: ListItemRowContext[],
  textByBlockIndex: Map<number, string> | undefined,
): ProseMirrorNode[] {
  const togglesToParagraphs = contexts.every((context) => context.currentOperation === operation)
  if (togglesToParagraphs) {
    return contexts.flatMap((context) => {
      const textOverride = textByBlockIndex?.get(context.blockIndex)
      if (typeof textOverride === 'string') return [createParagraph(schema, textOverride)]
      const blocks = getListItemTextBlocks(context.itemNode)
      return blocks.length > 0 ? blocks : [createParagraph(schema, context.text)]
    })
  }

  const items = contexts.map((context) => {
    const textOverride = textByBlockIndex?.get(context.blockIndex)
    return typeof textOverride === 'string'
      ? createListItem(schema, operation, textOverride)
      : copyListItemForOperation(context.itemNode, operation)
  })
  const listNode = createListNodeFromItems(schema, operation, items)
  return listNode ? [listNode] : []
}

function buildListReplacementNodes(
  schema: any,
  listNode: ProseMirrorNode,
  selectedContexts: ListItemRowContext[],
  operation: MultiLineListOperation,
  textByBlockIndex: Map<number, string> | undefined,
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
      nodes.push(...buildTransformedSelectedListRun(schema, operation, runContexts, textByBlockIndex))
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
    const item = listNode.child(index)
    runItems.push(item)
    if (context) runContexts.push(context)
  }
  flushRun()

  return nodes
}

function buildQuoteReplacementNodes(
  schema: any,
  quoteNode: ProseMirrorNode,
  selectedContexts: BlockQuoteRowContext[],
  operation: MultiLineListOperation,
  textByBlockIndex: Map<number, string> | undefined,
): ProseMirrorNode[] {
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
      const list = createMultiLineListNode(
        schema,
        operation,
        runContexts.map((context) => textByBlockIndex?.get(context.blockIndex) ?? context.text),
      )
      if (list) nodes.push(list)
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

function buildCodeBlockReplacementNodes(
  schema: any,
  codeNode: ProseMirrorNode,
  selectedContexts: CodeBlockLineRowContext[],
  operation: MultiLineListOperation,
  textByBlockIndex: Map<number, string> | undefined,
): ProseMirrorNode[] {
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
      const list = createMultiLineListNode(
        schema,
        operation,
        runContexts.map((context) => textByBlockIndex?.get(context.blockIndex) ?? context.text),
      )
      if (list) nodes.push(list)
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

function buildListReplacements(
  schema: any,
  listContexts: ListItemRowContext[],
  operation: MultiLineListOperation,
  textByBlockIndex: Map<number, string> | undefined,
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
      nodes: buildListReplacementNodes(schema, first.listNode, sortedContexts, operation, textByBlockIndex),
    }
  })
}

function buildQuoteReplacements(
  schema: any,
  quoteContexts: BlockQuoteRowContext[],
  operation: MultiLineListOperation,
  textByBlockIndex: Map<number, string> | undefined,
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
      nodes: buildQuoteReplacementNodes(schema, first.quoteNode, sortedContexts, operation, textByBlockIndex),
    }
  })
}

function buildCodeBlockReplacements(
  schema: any,
  codeContexts: CodeBlockLineRowContext[],
  operation: MultiLineListOperation,
  textByBlockIndex: Map<number, string> | undefined,
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
      nodes: buildCodeBlockReplacementNodes(schema, first.codeNode, sortedContexts, operation, textByBlockIndex),
    }
  })
}

function getMultiLineListOperationContexts(view: any, multiLineEdit: MultiLineEditState) {
  const blockRanges = getEditorTextLineRanges(view)
  if (blockRanges.length === 0) return null

  const selectedIndices = getMultiLineSelectedBlockIndices(multiLineEdit, blockRanges)
  if (selectedIndices.length < 1) return null

  const contexts = selectedIndices.map((index) => {
    const range = blockRanges[index]
    return range ? getRowContext(view, index, range) : null
  })
  if (contexts.some((context) => context === null)) return null

  return {
    blockRanges,
    selectedIndices,
    contexts: contexts as RowContext[],
  }
}

export function buildMultiLineListOperationPlan(
  view: any,
  multiLineEdit: MultiLineEditState,
  operation: MultiLineListOperation,
  options: MultiLineListOperationOptions = {},
): MultiLineListOperationPlan | null {
  const context = getMultiLineListOperationContexts(view, multiLineEdit)
  if (!context) return null

  const schema = view.state.schema
  const paragraphContexts = context.contexts.filter((row): row is TextBlockRowContext => row.kind === 'textBlock')
  const listContexts = context.contexts.filter((row): row is ListItemRowContext => row.kind === 'listItem')
  const quoteContexts = context.contexts.filter((row): row is BlockQuoteRowContext => row.kind === 'blockQuoteChild')
  const codeContexts = context.contexts.filter((row): row is CodeBlockLineRowContext => row.kind === 'codeBlockLine')
  const replacements = [
    ...buildParagraphReplacements(schema, paragraphContexts, operation, options.textByBlockIndex),
    ...buildListReplacements(schema, listContexts, operation, options.textByBlockIndex),
    ...buildQuoteReplacements(schema, quoteContexts, operation, options.textByBlockIndex),
    ...buildCodeBlockReplacements(schema, codeContexts, operation, options.textByBlockIndex),
  ].filter((replacement) => replacement.nodes.length > 0)
  if (replacements.length === 0) return null

  let transaction = view.state.tr
  for (const replacement of [...replacements].sort((a, b) => b.from - a.from)) {
    transaction = transaction.replaceWith(replacement.from, replacement.to, replacement.nodes)
  }

  const nextColumnOffsets = context.selectedIndices.reduce<Record<number, number>>((acc, index) => {
    const range = context.blockRanges[index]
    if (!range) return acc
    acc[index] = stripEditorPlaceholders(options.textByBlockIndex?.get(index) ?? range.text).trim().length
    return acc
  }, { ...(multiLineEdit.columnOffsets ?? {}) })

  return {
    transaction,
    nextState: {
      ...multiLineEdit,
      columnOffset:
        nextColumnOffsets[multiLineEdit.headBlockIndex] ??
        (context.blockRanges[multiLineEdit.headBlockIndex]
          ? getMultiLineColumnOffset(multiLineEdit, multiLineEdit.headBlockIndex, context.blockRanges[multiLineEdit.headBlockIndex])
          : multiLineEdit.columnOffset),
      columnOffsets: nextColumnOffsets,
      selectionAnchorOffsets: undefined,
    },
  }
}

export function getMultiLineListMarkerShortcut(
  view: any,
  multiLineEdit: MultiLineEditState,
): { operation: MultiLineListOperation; textByBlockIndex: Map<number, string> } | null {
  const context = getMultiLineListOperationContexts(view, multiLineEdit)
  if (!context) return null
  if (context.contexts.some((row) => row.kind !== 'textBlock')) return null

  let operation: MultiLineListOperation | null = null
  const textByBlockIndex = new Map<number, string>()

  for (const blockIndex of context.selectedIndices) {
    const range = context.blockRanges[blockIndex]
    if (!range) return null
    const currentOffset = getMultiLineColumnOffset(multiLineEdit, blockIndex, range)
    const markerText = range.text.slice(0, currentOffset)
    const trailingText = stripEditorPlaceholders(range.text.slice(currentOffset))
    if (trailingText.trim().length > 0) return null

    const shortcut = getParagraphSpaceShortcut(markerText)
    const nextOperation =
      shortcut?.kind === 'dashList' || shortcut?.kind === 'bulletList' || shortcut?.kind === 'numberedList'
        ? shortcut.kind
        : null
    if (!nextOperation) return null
    if (operation && operation !== nextOperation) return null
    operation = nextOperation
    textByBlockIndex.set(blockIndex, trailingText.trimStart())
  }

  return operation ? { operation, textByBlockIndex } : null
}
