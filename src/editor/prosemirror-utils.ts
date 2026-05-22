import type { Editor } from '@toast-ui/editor'
import { redo, undo } from 'prosemirror-history'
import { Selection, TextSelection } from 'prosemirror-state'
import {
  getMarkdownLinkLabel,
  INTERNAL_NOTE_LINK_MARKDOWN_RE,
  type InternalNoteLinkHit,
  parseInternalNoteReferenceUrl,
} from '../notes/note-references'
import {
  getLogicalEndpointForPosition,
  resolveLogicalEndpointPosition,
  type EditorCursorTextBlock,
} from './editor-cursor-position'

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

export function shouldBlockWysiwygUndo(currentDoc: any, nextDoc: any): boolean {
  return isProseMirrorDocMeaningful(currentDoc) && !isProseMirrorDocMeaningful(nextDoc)
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
    shouldBlockWysiwygUndo(view.state?.doc, transaction.doc ?? view.state?.doc)
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

export function restoreEditorCursorSelection(
  editor: Editor | null,
  selection: EditorCursorSelection,
  options: { focus?: boolean } = {},
): boolean {
  const view = getWysiwygView(editor)
  if (!editor || !view) return false

  const doc = view.state.doc
  const docSize = doc.content.size
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
    editor.focus()
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

export function getInternalNoteLinkHitAtDocPosition(doc: any, docPosition: number): InternalNoteLinkHit | null {
  const docText = collectProseMirrorTextPositions(doc)
  let occurrence = 0
  for (const match of docText.text.matchAll(INTERNAL_NOTE_LINK_MARKDOWN_RE)) {
    if (match[0].startsWith('!')) continue
    const reference = parseInternalNoteReferenceUrl(match[2])
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
        label: getMarkdownLinkLabel(match[1]),
        href: match[2],
        target: {
          domainId: reference.domainId,
          spaceId: reference.spaceId,
          tabId: reference.tabId,
          subTabId: reference.subTabId,
        },
        heading: reference.heading,
        from,
        to: last + 1,
        occurrence,
      }
    }
    occurrence += 1
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

function getLinkMarkHref(mark: any): string | null {
  if (mark?.type?.name !== 'link') return null
  const href = mark.attrs?.href ?? mark.attrs?.linkUrl
  return typeof href === 'string' && href.length > 0 ? href : null
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
