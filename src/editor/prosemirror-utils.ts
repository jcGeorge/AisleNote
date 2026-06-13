import type { Editor } from '@toast-ui/editor'
import { redo, undo } from 'prosemirror-history'
import { Selection, TextSelection } from 'prosemirror-state'
import {
  buildMarkdownNoteReferenceToken,
  INTERNAL_NOTE_LINK_MARKDOWN_RE,
  type InternalNoteLinkHit,
  type ResolvedMarkdownNoteReference,
} from '../notes/note-references'
import {
  getLogicalEndpointForPosition,
  resolveLogicalEndpointPosition,
  type EditorCursorTextBlock,
} from './editor-cursor-position'
import {
  getTagAutocompleteQueryFromText,
  type TagAutocompleteQuery,
} from '../tags/tag-autocomplete'
import { isCodeMirrorMarkdownEditor } from './codemirror-markdown-editor'
import { isLexicalMarkdownEditor } from './lexical-markdown-editor'

export const CODE_BLOCK_INDENT_TEXT = '    '

export type CommandCapableEditor = Editor & {
  exec: (name: string, payload?: Record<string, unknown>) => void
  insertText: (text: string) => void
  getSelectedText: () => string
}

type ProseMirrorTextPositionMap = {
  text: string
  positions: number[]
}

export type EditorCursorSelection = {
  anchor: number
  head: number
  anchorBlock?: {
    blockIndex: number
    offset: number
  }
  headBlock?: {
    blockIndex: number
    offset: number
  }
}

export type WysiwygHistoryDirection = 'undo' | 'redo'
export type WysiwygHistoryResult = 'applied' | 'blocked' | 'unavailable'

type RunWysiwygHistoryOptions = {
  beforeDispatch?: () => void
}

type LoadedUndoBoundary = {
  doc: any
}

const MEANINGFUL_STRUCTURAL_NODE_NAMES = new Set([
  'image',
  'table',
  'tableRow',
  'tableCell',
  'tableHeader',
  'thematicBreak',
  'horizontalRule',
])

function stripBlankSentinelText(value: string): string {
  return value
    .replaceAll('\u200b', '')
    .replaceAll('\u200c', '')
    .replaceAll('\u200d', '')
    .replaceAll('\ufeff', '')
    .trim()
}

export function isProseMirrorDocMeaningful(doc: any): boolean {
  let meaningful = false
  doc?.descendants?.((node: any) => {
    if (meaningful) return false
    const typeName = String(node?.type?.name ?? '')
    if (node?.isText) {
      meaningful = stripBlankSentinelText(String(node.text ?? node.textContent ?? '')).length > 0
      return !meaningful
    }
    if (MEANINGFUL_STRUCTURAL_NODE_NAMES.has(typeName)) {
      meaningful = true
      return false
    }
    if ((node?.isAtom || node?.isLeaf) && typeName !== 'hardBreak') {
      meaningful = true
      return false
    }
    return true
  })
  return meaningful
}

const loadedUndoBoundaryByEditor = new WeakMap<object, LoadedUndoBoundary>()

function areProseMirrorDocsEqual(left: any, right: any): boolean {
  if (left === right) return true
  if (!left || !right) return false
  if (typeof left.eq === 'function') {
    try {
      return left.eq(right)
    } catch {
      return false
    }
  }
  if (typeof left.toJSON === 'function' && typeof right.toJSON === 'function') {
    try {
      return JSON.stringify(left.toJSON()) === JSON.stringify(right.toJSON())
    } catch {
      return false
    }
  }
  return false
}

export function markWysiwygLoadedUndoBoundary(editor: Editor | null): void {
  const view = getWysiwygView(editor)
  const doc = view?.state?.doc
  if (!editor || !doc) return
  if (isProseMirrorDocMeaningful(doc)) {
    loadedUndoBoundaryByEditor.set(editor, { doc })
  } else {
    loadedUndoBoundaryByEditor.delete(editor)
  }
}

export function shouldBlockWysiwygUndo(
  currentDoc: any,
  nextDoc: any,
  options: { loadedUndoBoundaryDoc?: any } = {},
): boolean {
  const loadedUndoBoundaryDoc = options.loadedUndoBoundaryDoc
  if (!loadedUndoBoundaryDoc) return false
  return (
    isProseMirrorDocMeaningful(loadedUndoBoundaryDoc) &&
    areProseMirrorDocsEqual(currentDoc, loadedUndoBoundaryDoc) &&
    !isProseMirrorDocMeaningful(nextDoc)
  )
}

export function getCodeBlockOutdentRemoveLength(text: string): number {
  if (text.startsWith('\t')) return 1
  return text.match(/^ {1,4}/)?.[0].length ?? 0
}

export function getCommandCapableEditor(editor: Editor): CommandCapableEditor {
  return editor as unknown as CommandCapableEditor
}

export function getWysiwygView(editor: Editor | null): any | null {
  return (editor as any)?.wwEditor?.view ?? null
}

export function runWysiwygHistory(
  editor: Editor | null,
  direction: WysiwygHistoryDirection,
  options: RunWysiwygHistoryOptions = {},
): WysiwygHistoryResult {
  if (isLexicalMarkdownEditor(editor)) {
    options.beforeDispatch?.()
    return editor.runHistory(direction) ? 'applied' : 'unavailable'
  }

  const view = getWysiwygView(editor)
  if (!editor || !view) return 'unavailable'
  const command = direction === 'undo' ? undo : redo
  let transaction: any | null = null
  const handled = command(view.state, (nextTransaction: any) => {
    transaction = nextTransaction
  }, view)
  if (!handled || !transaction) return 'unavailable'
  if (
    direction === 'undo' &&
    transaction.docChanged !== false &&
    shouldBlockWysiwygUndo(view.state?.doc, transaction.doc ?? view.state?.doc, {
      loadedUndoBoundaryDoc: loadedUndoBoundaryByEditor.get(editor)?.doc,
    })
  ) {
    return 'blocked'
  }
  options.beforeDispatch?.()
  view.dispatch(transaction)
  editor.focus()
  return 'applied'
}

export function getElementFromEventTarget(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target
  if (target instanceof Text) return target.parentElement
  return null
}

function clampEditorPosition(value: number, docSize: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(Math.max(0, docSize), Math.floor(value)))
}

function collectEditorTextBlocks(doc: any): EditorCursorTextBlock[] {
  const blocks: EditorCursorTextBlock[] = []
  doc?.descendants?.((node: any, pos: number) => {
    if (!node?.isTextblock) return true
    const contentSize = typeof node.content?.size === 'number' ? node.content.size : 0
    blocks.push({
      blockIndex: blocks.length,
      start: pos + 1,
      end: pos + 1 + contentSize,
      text: String(node.textContent ?? ''),
    })
    return true
  })
  return blocks
}

export function getEditorCursorSelection(editor: Editor | null): EditorCursorSelection | null {
  if (isCodeMirrorMarkdownEditor(editor)) {
    return editor.getCursorSelection()
  }
  if (isLexicalMarkdownEditor(editor)) {
    return editor.getCursorSelection()
  }

  const view = getWysiwygView(editor)
  const selection = view?.state?.selection
  if (!selection) return null

  const anchor = typeof selection.anchor === 'number' ? selection.anchor : selection.from
  const head = typeof selection.head === 'number' ? selection.head : selection.to
  if (typeof anchor !== 'number' || typeof head !== 'number') return null
  if (!Number.isFinite(anchor) || !Number.isFinite(head)) return null
  const doc = view.state.doc
  const blocks = collectEditorTextBlocks(doc)
  const docSize = doc.content.size
  const anchorBlock = getLogicalEndpointForPosition(blocks, anchor, docSize) ?? undefined
  const headBlock = getLogicalEndpointForPosition(blocks, head, docSize) ?? undefined
  return {
    anchor,
    head,
    ...(anchorBlock ? { anchorBlock } : {}),
    ...(headBlock ? { headBlock } : {}),
  }
}

export function getEditorDocSize(editor: Editor | null): number {
  if (isCodeMirrorMarkdownEditor(editor)) return editor.getDocSize()
  if (isLexicalMarkdownEditor(editor)) return editor.getDocSize()
  const view = getWysiwygView(editor)
  return view?.state?.doc?.content?.size ?? 0
}

export function restoreEditorCursorSelection(
  editor: Editor | null,
  selection: EditorCursorSelection,
  options: { focus?: boolean } = {},
): boolean {
  if (isCodeMirrorMarkdownEditor(editor)) {
    return editor.restoreCursorSelection(selection, options)
  }
  if (isLexicalMarkdownEditor(editor)) {
    return editor.restoreCursorSelection(selection, options)
  }

  const view = getWysiwygView(editor)
  if (!editor || !view?.state?.doc || typeof view.dispatch !== 'function') return false

  const doc = view.state.doc
  const docSize = typeof doc.content?.size === 'number' ? doc.content.size : 0
  const blocks = collectEditorTextBlocks(doc)
  const anchor = resolveLogicalEndpointPosition(blocks, selection.anchorBlock, docSize) ??
    clampEditorPosition(selection.anchor, docSize)
  const head = resolveLogicalEndpointPosition(blocks, selection.headBlock, docSize) ??
    clampEditorPosition(selection.head, docSize)

  try {
    const nextSelection = TextSelection.create(doc, anchor, head)
    view.dispatch(view.state.tr.setSelection(nextSelection).scrollIntoView())
  } catch {
    const nearPosition = clampEditorPosition(head, docSize)
    try {
      view.dispatch(view.state.tr.setSelection(Selection.near(doc.resolve(nearPosition), 1)).scrollIntoView())
    } catch {
      return false
    }
  }

  if (options.focus !== false) {
    try {
      editor.focus()
    } catch {
      return false
    }
  }
  return true
}

export function collectProseMirrorTextPositions(doc: any): ProseMirrorTextPositionMap {
  let text = ''
  const positions: number[] = []
  let previousTextEnd: number | null = null

  doc.descendants((node: any, pos: number) => {
    if (!node.isText || typeof node.text !== 'string') return

    if (previousTextEnd !== null && pos > previousTextEnd) {
      text += '\n'
      positions.push(-1)
    }

    for (let index = 0; index < node.text.length; index += 1) {
      text += node.text[index]
      positions.push(pos + index)
    }
    previousTextEnd = pos + node.text.length
  })

  return { text, positions }
}

export function getInternalNoteLinkHitAtDocPosition(
  doc: any,
  docPosition: number,
  resolveInternalNoteReference?: (token: string) => ResolvedMarkdownNoteReference | null,
): InternalNoteLinkHit | null {
  const docText = collectProseMirrorTextPositions(doc)
  let occurrence = 0
  for (const match of docText.text.matchAll(INTERNAL_NOTE_LINK_MARKDOWN_RE)) {
    if (match[0].startsWith('!')) continue
    const currentOccurrence = occurrence
    occurrence += 1
    const reference = resolveInternalNoteReference?.(match[0])
    if (!reference) continue

    const startIndex = match.index ?? 0
    const endIndex = startIndex + match[0].length - 1
    const from = docText.positions[startIndex]
    const last = docText.positions[endIndex]
    const rangePositions = docText.positions.slice(startIndex, endIndex + 1)
    if (from === undefined || last === undefined || from < 0 || last < from || rangePositions.some((position) => position < 0)) {
      continue
    }
    if (docPosition >= from && docPosition <= last + 1) {
      return {
        label: reference.label,
        href: match[0],
        target: {
          domainId: reference.target.domainId,
          spaceId: reference.target.spaceId,
          tabId: reference.target.tabId,
          subTabId: reference.target.subTabId,
        },
        aisleIds: reference.payload?.aisleIds ? [...reference.payload.aisleIds] : undefined,
        heading: reference.target.heading,
        startAt: reference.target.startAt,
        from,
        to: last + 1,
        occurrence: currentOccurrence,
      }
    }
  }
  return null
}

export type ExternalLinkRange = {
  from: number
  to: number
  href: string
}

export type NoteMentionQuery = {
  from: number
  to: number
  query: string
}

function isCodeNodeType(node: any): boolean {
  const typeName = String(node?.type?.name ?? '').toLocaleLowerCase()
  return Boolean(node?.type?.spec?.code) || typeName === 'codeblock' || typeName === 'code_block'
}

function hasCodeMark(marks: unknown): boolean {
  return Array.isArray(marks) && marks.some((mark: any) => mark?.type?.name === 'code' || mark?.type?.spec?.code)
}

function isCursorInInlineCode($from: any, parentOffset: number): boolean {
  if (hasCodeMark(typeof $from?.marks === 'function' ? $from.marks() : $from?.marks)) return true
  const before = typeof $from?.parent?.childBefore === 'function' ? $from.parent.childBefore(parentOffset)?.node : null
  return hasCodeMark(before?.marks)
}

export function getNoteMentionQueryAtSelection(view: any | null): NoteMentionQuery | null {
  const selection = view?.state?.selection
  if (!selection || !selection.empty) return null
  const cursorPosition = selection.from
  const parent = selection.$from?.parent
  const parentOffset = selection.$from?.parentOffset
  if (!parent?.isTextblock || typeof parentOffset !== 'number') return null

  const textBeforeCursor = String(parent.textBetween?.(0, parentOffset, '\n', '\n') ?? '')
  const match = /(^|\s)@([^@]*)$/.exec(textBeforeCursor)
  if (!match) return null

  const query = match[2] ?? ''
  if (/^\s/.test(query)) return null
  return {
    from: cursorPosition - query.length - 1,
    to: cursorPosition,
    query,
  }
}

export function getTagAutocompleteQueryAtSelection(view: any | null): TagAutocompleteQuery | null {
  const selection = view?.state?.selection
  if (!selection || !selection.empty) return null
  const cursorPosition = selection.from
  const $from = selection.$from
  const parent = $from?.parent
  const parentOffset = $from?.parentOffset
  if (!parent?.isTextblock || typeof parentOffset !== 'number') return null
  if (isCodeNodeType(parent) || isCursorInInlineCode($from, parentOffset)) return null

  const textBeforeCursor = String(parent.textBetween?.(0, parentOffset, '\n', '\n') ?? '')
  return getTagAutocompleteQueryFromText(textBeforeCursor, cursorPosition)
}

function getLinkMarkHref(mark: any): string | null {
  if (mark?.type?.name !== 'link') return null
  const href = mark.attrs?.href ?? mark.attrs?.linkUrl
  return typeof href === 'string' && href.length > 0 ? href : null
}

function linkTypeHasAttr(linkType: any, attrName: string): boolean {
  const attrs = linkType?.attrs ?? linkType?.spec?.attrs
  return Boolean(attrs && Object.prototype.hasOwnProperty.call(attrs, attrName))
}

export function getLinkMarkAttrs(linkType: any, href: string): Record<string, string> {
  if (linkTypeHasAttr(linkType, 'linkUrl')) return { linkUrl: href }
  return { href }
}

export function createLinkMark(linkType: any, href: string): any {
  return linkType.create(getLinkMarkAttrs(linkType, href))
}

function linkHrefMatches(candidate: string, expectedHref?: string) {
  if (!expectedHref) return true
  if (candidate === expectedHref) return true
  try {
    return new URL(candidate).href === new URL(expectedHref).href
  } catch {
    return false
  }
}

export function getExternalLinkRangeAtDocPosition(
  doc: any,
  docPosition: number,
  expectedHref?: string,
): ExternalLinkRange | null {
  if (!doc || typeof docPosition !== 'number' || !Number.isFinite(docPosition)) return null

  const linkTextNodes: ExternalLinkRange[] = []
  doc.descendants?.((node: any, position: number) => {
    if (!node?.isText || typeof node.text !== 'string') return true
    const href = Array.isArray(node.marks)
      ? node.marks.map(getLinkMarkHref).find((candidate: string | null): candidate is string => Boolean(candidate))
      : null
    if (!href || !linkHrefMatches(href, expectedHref)) return true
    linkTextNodes.push({
      from: position,
      to: position + node.text.length,
      href,
    })
    return true
  })

  const hitIndex = linkTextNodes.findIndex((node) => docPosition >= node.from && docPosition <= node.to)
  if (hitIndex < 0) return null

  const href = linkTextNodes[hitIndex].href
  let firstIndex = hitIndex
  let lastIndex = hitIndex

  while (
    firstIndex > 0 &&
    linkTextNodes[firstIndex - 1].href === href &&
    linkTextNodes[firstIndex - 1].to === linkTextNodes[firstIndex].from
  ) {
    firstIndex -= 1
  }

  while (
    lastIndex < linkTextNodes.length - 1 &&
    linkTextNodes[lastIndex + 1].href === href &&
    linkTextNodes[lastIndex].to === linkTextNodes[lastIndex + 1].from
  ) {
    lastIndex += 1
  }

  return {
    from: linkTextNodes[firstIndex].from,
    to: linkTextNodes[lastIndex].to,
    href,
  }
}

function getInternalNoteLinkRangeAtSelection(
  view: any | null,
  resolveInternalNoteReference: (token: string) => ResolvedMarkdownNoteReference | null,
): ExternalLinkRange | null {
  const selection = view?.state?.selection
  const doc = view?.state?.doc
  if (!selection?.empty || !doc) return null
  const position = selection.from
  if (typeof position !== 'number' || !Number.isFinite(position)) return null

  const range =
    getExternalLinkRangeAtDocPosition(doc, position) ??
    getExternalLinkRangeAtDocPosition(doc, position - 1)
  if (!range || position <= range.from || position >= range.to) return null

  const label = String(doc.textBetween?.(range.from, range.to, '', '') ?? '').trim()
  const token = buildMarkdownNoteReferenceToken({ target: range.href, label })
  return token && resolveInternalNoteReference(token) ? range : null
}

export function insertParagraphAfterInternalNoteLink(
  view: any | null,
  resolveInternalNoteReference: (token: string) => ResolvedMarkdownNoteReference | null,
): boolean {
  if (!view?.state?.doc || typeof view.dispatch !== 'function') return false
  const range = getInternalNoteLinkRangeAtSelection(view, resolveInternalNoteReference)
  if (!range) return false

  try {
    const insertAt = range.to
    let transaction = view.state.tr.split(insertAt)
    const selectionPosition = Math.max(0, Math.min(transaction.doc.content.size, insertAt + 1))
    transaction = transaction.setSelection(Selection.near(transaction.doc.resolve(selectionPosition), 1))
    if (typeof transaction.setStoredMarks === 'function') {
      transaction = transaction.setStoredMarks([])
    }
    view.dispatch(transaction.scrollIntoView())
    view.focus?.()
    return true
  } catch {
    return false
  }
}
