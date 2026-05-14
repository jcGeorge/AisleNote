import type { Editor } from '@toast-ui/editor'
import { Selection, TextSelection } from 'prosemirror-state'
import {
  getMarkdownLinkLabel,
  INTERNAL_NOTE_LINK_MARKDOWN_RE,
  type InternalNoteLinkHit,
  parseInternalNoteUrl,
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

export function restoreEditorCursorSelection(editor: Editor | null, selection: EditorCursorSelection): boolean {
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

  editor.focus()
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
    const target = parseInternalNoteUrl(match[2])
    if (!target) continue

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
        target,
        from,
        to: last + 1,
        occurrence,
      }
    }
    occurrence += 1
  }
  return null
}
