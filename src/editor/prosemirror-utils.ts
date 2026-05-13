import { Editor } from '@toast-ui/editor'
import {
  getMarkdownLinkLabel,
  INTERNAL_NOTE_LINK_MARKDOWN_RE,
  type InternalNoteLinkHit,
  parseInternalNoteUrl,
} from '../notes/note-references'

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
