import type { NoteNavigationTarget } from '../types/app'
import { normalizeExternalWebUrl } from '../notes/external-links'
import {
  getWikiReferenceDisplayText,
  WIKI_NOTE_REFERENCE_RE,
  type ResolvedWikiNoteReference,
} from '../notes/note-references'
import { collectProseMirrorTextPositions } from './prosemirror-utils'

export type TableOfContentsLinkKind = 'note-link' | 'url-link' | 'note-preview'

export type TableOfContentsLinkItem = {
  aisleId: string
  key: string
  kind: TableOfContentsLinkKind
  label: string
  href?: string
  target?: NoteNavigationTarget
  from?: number
  to?: number
}

type PendingTableOfContentsLinkItem = Omit<TableOfContentsLinkItem, 'key'> & {
  order: number
}

type ResolveWikiReference = (token: string) => ResolvedWikiNoteReference | null

const MARKDOWN_LINK_RE = /!?\[([^\]\n]+)\]\(([^)\s]+)(?:\s+["'][^)]*["'])?\)/g
const MARKDOWN_AUTOLINK_RE = /<((?:https?:\/\/)[^<>\s]+)>/g
const FENCE_BOUNDARY_RE = /^\s*(`{3,}|~{3,})/

function buildLinkKey(aisleId: string, index: number) {
  return `${encodeURIComponent(aisleId)}|link|${index}`
}

function normalizeLinkLabel(value: string, fallback: string) {
  return value
    .replace(/!\[|\[|\]/g, '')
    .replace(/\\([\\[\]])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim() || fallback
}

function finalizeLinkItems(aisleId: string, items: PendingTableOfContentsLinkItem[]): TableOfContentsLinkItem[] {
  return [...items]
    .sort((left, right) => left.order - right.order)
    .map((item, index) => ({
      aisleId: item.aisleId,
      key: buildLinkKey(aisleId, index),
      kind: item.kind,
      label: item.label,
      ...(item.href ? { href: item.href } : {}),
      ...(item.target ? { target: item.target } : {}),
      ...(typeof item.from === 'number' ? { from: item.from } : {}),
      ...(typeof item.to === 'number' ? { to: item.to } : {}),
    }))
}

function getLinkMarkHref(mark: any): string | null {
  if (mark?.type?.name !== 'link') return null
  const href = mark.attrs?.href ?? mark.attrs?.linkUrl
  return typeof href === 'string' && href.length > 0 ? href : null
}

function collectExternalDocLinkItems(aisleId: string, doc: any): PendingTableOfContentsLinkItem[] {
  const textNodes: Array<{ from: number; to: number; href: string; text: string }> = []
  doc?.descendants?.((node: any, position: number) => {
    if (!node?.isText || typeof node.text !== 'string') return true
    const href = Array.isArray(node.marks)
      ? node.marks.map(getLinkMarkHref).find((candidate: string | null): candidate is string => Boolean(candidate))
      : null
    const normalizedHref = href ? normalizeExternalWebUrl(href) : null
    if (!normalizedHref) return true
    textNodes.push({
      from: position,
      to: position + node.text.length,
      href: normalizedHref,
      text: node.text,
    })
    return true
  })

  const items: PendingTableOfContentsLinkItem[] = []
  for (let index = 0; index < textNodes.length; index += 1) {
    const first = textNodes[index]
    let last = first
    let text = first.text
    while (
      index < textNodes.length - 1 &&
      textNodes[index + 1].href === first.href &&
      textNodes[index + 1].from === last.to
    ) {
      index += 1
      last = textNodes[index]
      text += last.text
    }
    items.push({
      aisleId,
      kind: 'url-link',
      label: normalizeLinkLabel(text, first.href),
      href: first.href,
      from: first.from,
      to: last.to,
      order: first.from,
    })
  }
  return items
}

function collectWikiReferenceItemsFromText(
  aisleId: string,
  text: string,
  resolveWikiReference: ResolveWikiReference,
  getPosition: (index: number) => number | undefined,
): PendingTableOfContentsLinkItem[] {
  const items: PendingTableOfContentsLinkItem[] = []
  for (const match of text.matchAll(WIKI_NOTE_REFERENCE_RE)) {
    const token = match[0]
    const reference = resolveWikiReference(token)
    if (!reference) continue
    const startIndex = match.index ?? 0
    const endIndex = startIndex + token.length - 1
    const from = getPosition(startIndex)
    const last = getPosition(endIndex)
    const kind: TableOfContentsLinkKind = reference.parsed.embed ? 'note-preview' : 'note-link'
    items.push({
      aisleId,
      kind,
      label:
        kind === 'note-preview'
          ? getWikiReferenceDisplayText(token) || reference.label || 'note preview'
          : reference.label || getWikiReferenceDisplayText(token) || 'linked note',
      target: reference.target,
      ...(typeof from === 'number' && from >= 0 ? { from } : {}),
      ...(typeof from === 'number' && typeof last === 'number' && from >= 0 && last >= from ? { to: last + 1 } : {}),
      order: typeof from === 'number' && from >= 0 ? from : startIndex,
    })
  }
  return items
}

export function getTableOfContentsLinksFromDoc(
  aisleId: string,
  doc: any,
  resolveWikiReference: ResolveWikiReference,
): TableOfContentsLinkItem[] {
  const docText = collectProseMirrorTextPositions(doc)
  const items = [
    ...collectWikiReferenceItemsFromText(aisleId, docText.text, resolveWikiReference, (index) => docText.positions[index]),
    ...collectExternalDocLinkItems(aisleId, doc),
  ]
  return finalizeLinkItems(aisleId, items)
}

function forEachMarkdownSegmentOutsideFences(markdown: string, callback: (segment: string, start: number) => void) {
  const normalized = String(markdown ?? '').replace(/\r\n/g, '\n')
  let activeFence: string | null = null
  let segmentStart = 0
  let segment = ''
  let offset = 0

  normalized.split('\n').forEach((line, lineIndex, lines) => {
    const lineWithBreak = lineIndex < lines.length - 1 ? `${line}\n` : line
    const fenceBeforeLine = activeFence
    const match = line.match(FENCE_BOUNDARY_RE)
    if (match) {
      const marker = match[1][0]
      activeFence = activeFence ? (activeFence === marker ? null : activeFence) : marker
    }

    if (fenceBeforeLine || activeFence) {
      if (segment) {
        callback(segment, segmentStart)
        segment = ''
      }
      offset += lineWithBreak.length
      segmentStart = offset
      return
    }

    if (!segment) segmentStart = offset
    segment += lineWithBreak
    offset += lineWithBreak.length
  })

  if (segment) callback(segment, segmentStart)
}

export function getTableOfContentsLinksFromMarkdown(
  aisleId: string,
  markdown: string,
  resolveWikiReference: ResolveWikiReference,
): TableOfContentsLinkItem[] {
  const items: PendingTableOfContentsLinkItem[] = []
  forEachMarkdownSegmentOutsideFences(markdown, (segment, segmentStart) => {
    items.push(
      ...collectWikiReferenceItemsFromText(aisleId, segment, resolveWikiReference, (index) => segmentStart + index),
    )

    for (const match of segment.matchAll(MARKDOWN_LINK_RE)) {
      if (match[0].startsWith('!')) continue
      const href = normalizeExternalWebUrl(match[2] ?? '')
      if (!href) continue
      const start = segmentStart + (match.index ?? 0)
      items.push({
        aisleId,
        kind: 'url-link',
        label: normalizeLinkLabel(match[1] ?? '', href),
        href,
        order: start,
      })
    }

    for (const match of segment.matchAll(MARKDOWN_AUTOLINK_RE)) {
      const href = normalizeExternalWebUrl(match[1] ?? '')
      if (!href) continue
      const start = segmentStart + (match.index ?? 0)
      items.push({
        aisleId,
        kind: 'url-link',
        label: href,
        href,
        order: start,
      })
    }
  })
  return finalizeLinkItems(aisleId, items)
}
