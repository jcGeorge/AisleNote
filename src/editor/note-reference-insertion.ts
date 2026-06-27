import { TextSelection } from 'prosemirror-state'
import {
  formatEditorMarkdownNoteReferenceHref,
  parseMarkdownNoteReferenceToken,
} from '../notes/note-references'
import { createLinkMark } from './prosemirror-utils'

export type MarkdownNoteReferenceInsertionRange = {
  from: number
  to: number
}

function getSafeInsertionRange(view: any, range?: MarkdownNoteReferenceInsertionRange | null): MarkdownNoteReferenceInsertionRange | null {
  const docSize = Number(view?.state?.doc?.content?.size)
  if (!Number.isFinite(docSize)) return null
  const selection = view?.state?.selection
  const rawFrom = typeof range?.from === 'number' ? range.from : selection?.from
  const rawTo = typeof range?.to === 'number' ? range.to : selection?.to ?? rawFrom
  if (typeof rawFrom !== 'number' || typeof rawTo !== 'number') return null

  const from = Math.max(0, Math.min(docSize, Math.floor(Math.min(rawFrom, rawTo))))
  const to = Math.max(from, Math.min(docSize, Math.floor(Math.max(rawFrom, rawTo))))
  return { from, to }
}

function getFallbackNoteReferenceLabel(parsed: { label: string; noteHandle: string }): string {
  return parsed.label.trim() || parsed.noteHandle.replace(/--[0-9a-f]{6}(?:-\d+)?$/i, '').trim() || 'linked note'
}

export function insertMarkdownNoteReferenceTokenIntoView(
  view: any | null,
  token: string,
  range?: MarkdownNoteReferenceInsertionRange | null,
): boolean {
  const parsed = parseMarkdownNoteReferenceToken(token)
  const insertionRange = getSafeInsertionRange(view, range)
  if (!parsed || !insertionRange || !view?.state?.tr || typeof view.dispatch !== 'function') return false

  try {
    let transaction = view.state.tr
    let nextCursor = insertionRange.from

    if (parsed.embed) {
      transaction = transaction.insertText(token, insertionRange.from, insertionRange.to)
      nextCursor = insertionRange.from + token.length
    } else {
      const linkType = view.state.schema?.marks?.link
      if (!linkType) return false
      const label = getFallbackNoteReferenceLabel(parsed)
      const href = formatEditorMarkdownNoteReferenceHref(parsed.target)
      const linkMark = createLinkMark(linkType, href)
      transaction = transaction.replaceWith(insertionRange.from, insertionRange.to, view.state.schema.text(label, [linkMark]))
      nextCursor = insertionRange.from + label.length
    }

    const cursor = Math.max(0, Math.min(transaction.doc.content.size, nextCursor))
    transaction = transaction.setSelection(TextSelection.create(transaction.doc, cursor, cursor)).scrollIntoView()
    view.dispatch(transaction)
    view.focus?.()
    return true
  } catch {
    return false
  }
}
