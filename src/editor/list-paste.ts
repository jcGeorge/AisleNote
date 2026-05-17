import type { Node as ProseMirrorNode } from 'prosemirror-model'
import { createBulletListAttrs } from './list-markers'

export type PastedListKind = 'dashList' | 'bulletList' | 'numberedList' | 'task'

export type ParsedPastedListItem = {
  text: string
  checked?: boolean
}

export type ParsedPastedList = {
  kind: PastedListKind
  items: ParsedPastedListItem[]
  order?: number
}

type ParsedLine = ParsedPastedListItem & {
  kind: PastedListKind
  order?: number
}

function parseListLine(line: string): ParsedLine | null {
  const taskMatch = line.match(/^\s*[-*+]\s+\[([ xX])\]\s*(.*)$/)
  if (taskMatch) {
    return {
      kind: 'task',
      text: taskMatch[2].trim(),
      checked: taskMatch[1].toLowerCase() === 'x',
    }
  }

  const orderedMatch = line.match(/^\s*(\d+)[.)]\s+(.*)$/)
  if (orderedMatch) {
    return {
      kind: 'numberedList',
      order: Number(orderedMatch[1]) || 1,
      text: orderedMatch[2].trim(),
    }
  }

  const dashMatch = line.match(/^\s*-\s+(.*)$/)
  if (dashMatch) {
    return {
      kind: 'dashList',
      text: dashMatch[1].trim(),
    }
  }

  const bulletMatch = line.match(/^\s*[*+]\s+(.*)$/)
  if (bulletMatch) {
    return {
      kind: 'bulletList',
      text: bulletMatch[1].trim(),
    }
  }

  return null
}

export function parsePastedList(text: string): ParsedPastedList | null {
  const lines = String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)

  if (lines.length === 0) return null

  const parsedLines = lines.map(parseListLine)
  if (parsedLines.some((line) => line === null)) return null

  const first = parsedLines[0]
  if (!first) return null
  if (parsedLines.some((line) => line?.kind !== first.kind)) return null

  return {
    kind: first.kind,
    order: first.kind === 'numberedList' ? first.order : undefined,
    items: parsedLines.map((line) => ({
      text: line?.text ?? '',
      checked: line?.kind === 'task' ? line.checked === true : undefined,
    })),
  }
}

function createParagraph(schema: any, text: string): ProseMirrorNode {
  return schema.nodes.paragraph.create(null, text ? schema.text(text) : undefined)
}

function createListItem(schema: any, parsed: ParsedPastedList, item: ParsedPastedListItem): ProseMirrorNode {
  const attrs = parsed.kind === 'task' ? { task: true, checked: item.checked === true } : null
  return schema.nodes.listItem.create(attrs, createParagraph(schema, item.text))
}

export function createPastedListNode(schema: any, parsed: ParsedPastedList): ProseMirrorNode | null {
  if (parsed.items.length === 0) return null

  const listType = parsed.kind === 'numberedList' ? schema?.nodes?.orderedList : schema?.nodes?.bulletList
  if (!listType || !schema?.nodes?.listItem || !schema?.nodes?.paragraph) return null

  const listAttrs =
    parsed.kind === 'numberedList'
      ? { order: parsed.order ?? 1 }
      : createBulletListAttrs(parsed.kind === 'dashList' ? 'dash' : 'bullet')
  return listType.create(listAttrs, parsed.items.map((item) => createListItem(schema, parsed, item)))
}

export function insertPastedListIntoView(view: any, text: string): boolean {
  const parsed = parsePastedList(text)
  if (!parsed) return false

  const listNode = createPastedListNode(view?.state?.schema, parsed)
  if (!listNode || !view?.dispatch || !view.state?.tr) return false

  const tr = view.state.tr.replaceSelectionWith(listNode, false)
  view.dispatch(tr.scrollIntoView())
  return true
}
