import { Fragment, Slice, type Node as ProseMirrorNode } from 'prosemirror-model'
import { createLinkMark } from './prosemirror-utils'
import {
  insertTableSelectionClipboardPayloadIntoView,
  readTableSelectionClipboardPayloadFromDataTransfer,
} from './table-selection-clipboard'

export const AISLENOTE_MARKDOWN_CLIPBOARD_MIME = 'application/x-aislenote-markdown'

export type EditorClipboardSerialization = {
  text: string
  markdown: string
}

type DataTransferReadLike = Pick<DataTransfer, 'getData'> | null | undefined
type DataTransferWriteLike = Pick<DataTransfer, 'setData'> | null | undefined

function normalizeClipboardLineEndings(value: string): string {
  return String(value ?? '').replace(/\r\n?/g, '\n')
}

export function normalizeVisualClipboardText(value: string): string {
  return normalizeClipboardLineEndings(value)
}

export function isLayoutSensitiveClipboardText(value: string | null | undefined): boolean {
  const normalized = normalizeVisualClipboardText(value ?? '')
  if (!normalized) return false
  return (
    normalized.includes('\n') ||
    normalized.includes('\t') ||
    /(^|\n)[ \t]+/.test(normalized)
  )
}

function getSingleLinePlainClipboardText(value: string | null | undefined): string | null {
  let normalized = normalizeVisualClipboardText(value ?? '')
  if (!normalized) return null
  if (normalized.endsWith('\n') && !normalized.slice(0, -1).includes('\n')) {
    normalized = normalized.slice(0, -1)
  }
  if (!normalized || normalized.includes('\n')) return null
  return normalized
}

function getNodeTypeName(node: ProseMirrorNode | null | undefined): string {
  return String(node?.type?.name ?? '')
}

function getImageNodeSource(node: ProseMirrorNode): string {
  const attrs = (node as any).attrs ?? {}
  const source = attrs.imageUrl ?? attrs.src
  return typeof source === 'string' ? source.trim() : ''
}

function getImageNodeAltText(node: ProseMirrorNode): string {
  const attrs = (node as any).attrs ?? {}
  const alt = attrs.altText ?? attrs.alt
  return typeof alt === 'string' ? alt : ''
}

function getLinkHrefFromMarks(marks: readonly any[] | null | undefined): string {
  const link = Array.isArray(marks)
    ? marks.find((mark) =>
        mark?.type?.name === 'link' &&
        (typeof mark?.attrs?.linkUrl === 'string' || typeof mark?.attrs?.href === 'string'))
    : null
  return typeof link?.attrs?.linkUrl === 'string'
    ? link.attrs.linkUrl
    : typeof link?.attrs?.href === 'string'
      ? link.attrs.href
      : ''
}

function escapeMarkdownLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\]/g, '\\]')
}

function formatMarkdownDestination(value: string): string {
  const destination = value.trim()
  if (!destination) return ''
  return /[\s<>()]/.test(destination) ? `<${destination.replace(/>/g, '\\>')}>` : destination
}

function serializeInlineMarkdown(node: ProseMirrorNode): string {
  const typeName = getNodeTypeName(node)
  if ((node as any).isText) {
    const text = String((node as any).text ?? node.textContent ?? '')
    const href = getLinkHrefFromMarks((node as any).marks)
    return href ? `[${escapeMarkdownLabel(text)}](${formatMarkdownDestination(href)})` : text
  }
  if (typeName === 'hardBreak') return '\n'
  if (typeName === 'image') {
    const source = getImageNodeSource(node)
    const alt = getImageNodeAltText(node)
    return source ? `![${escapeMarkdownLabel(alt)}](${formatMarkdownDestination(source)})` : alt
  }
  const children: string[] = []
  node.forEach((child) => {
    children.push(serializeInlineMarkdown(child))
  })
  return children.join('')
}

function serializeInlineText(node: ProseMirrorNode): string {
  const typeName = getNodeTypeName(node)
  if ((node as any).isText) return String((node as any).text ?? node.textContent ?? '')
  if (typeName === 'hardBreak') return '\n'
  if (typeName === 'image') return getImageNodeAltText(node)
  const children: string[] = []
  node.forEach((child) => {
    children.push(serializeInlineText(child))
  })
  return children.join('')
}

function serializeBlock(node: ProseMirrorNode, mode: 'text' | 'markdown'): string[] {
  const typeName = getNodeTypeName(node)
  const inline = mode === 'markdown' ? serializeInlineMarkdown(node) : serializeInlineText(node)

  if (typeName === 'heading') {
    const level = Math.min(6, Math.max(1, Number((node as any).attrs?.level) || 1))
    return mode === 'markdown' ? [`${'#'.repeat(level)} ${inline}`] : [inline]
  }
  if (typeName === 'codeBlock') {
    return mode === 'markdown' ? ['```', node.textContent ?? '', '```'] : String(node.textContent ?? '').split('\n')
  }
  if (typeName === 'bulletList' || typeName === 'orderedList') {
    const lines: string[] = []
    let index = Number((node as any).attrs?.order) || 1
    node.forEach((child) => {
      const childLines = serializeBlock(child, mode)
      const marker = typeName === 'orderedList' ? `${index}. ` : '- '
      childLines.forEach((line, lineIndex) => {
        lines.push(`${lineIndex === 0 ? marker : '  '}${line}`)
      })
      index += 1
    })
    return lines
  }
  if (typeName === 'listItem') {
    const lines: string[] = []
    node.forEach((child) => {
      lines.push(...serializeBlock(child, mode))
    })
    return lines.length > 0 ? lines : ['']
  }
  if (typeName === 'thematicBreak' || typeName === 'horizontalRule') {
    return mode === 'markdown' ? ['---'] : ['']
  }
  return [inline]
}

function serializeFragment(fragment: Fragment, mode: 'text' | 'markdown'): string {
  const lines: string[] = []
  fragment.forEach((node) => {
    lines.push(...serializeBlock(node, mode))
  })
  return normalizeVisualClipboardText(lines.join('\n'))
}

export function serializeProseMirrorSelectionForClipboard(view: any | null): EditorClipboardSerialization | null {
  const selection = view?.state?.selection
  if (!selection || selection.empty || typeof selection.content !== 'function') return null
  const fragment = selection.content().content
  if (!fragment) return null
  const text = serializeFragment(fragment, 'text')
  const markdown = serializeFragment(fragment, 'markdown')
  if (text.length === 0 && markdown.length === 0) return null
  return { text, markdown: markdown || text }
}

export function writeEditorClipboardData(
  clipboardData: DataTransferWriteLike,
  serialization: EditorClipboardSerialization,
): boolean {
  if (!clipboardData) return false
  clipboardData.setData('text/plain', serialization.text)
  clipboardData.setData(AISLENOTE_MARKDOWN_CLIPBOARD_MIME, serialization.markdown)
  return true
}

export function readAisleNoteMarkdownFromDataTransfer(dataTransfer: DataTransferReadLike): string {
  if (!dataTransfer) return ''
  try {
    return normalizeVisualClipboardText(dataTransfer.getData(AISLENOTE_MARKDOWN_CLIPBOARD_MIME) ?? '')
  } catch {
    return ''
  }
}

function createParagraphNode(schema: any, text: string): ProseMirrorNode | null {
  const paragraph = schema?.nodes?.paragraph
  if (!paragraph) return null
  return paragraph.create(null, text ? schema.text(text) : undefined)
}

export function insertVisualClipboardTextIntoView(view: any | null, text: string): boolean {
  const normalized = normalizeVisualClipboardText(text)
  if (!view?.state?.schema || !view?.dispatch || !view.state?.tr) return false
  if (normalized.length === 0) return false

  try {
    if (!normalized.includes('\n')) {
      view.dispatch(view.state.tr.insertText(normalized).scrollIntoView())
      view.focus?.()
      return true
    }

    const nodes = normalized
      .split('\n')
      .map((line) => createParagraphNode(view.state.schema, line))
      .filter((node): node is ProseMirrorNode => Boolean(node))
    if (nodes.length === 0) return false

    const slice = new Slice(Fragment.fromArray(nodes), 0, 0)
    view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView())
    view.focus?.()
    return true
  } catch {
    return false
  }
}

function unescapeMarkdownLabel(value: string): string {
  return value.replace(/\\([\\\]])/g, '$1')
}

function unformatMarkdownDestination(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('<') && trimmed.endsWith('>')) return trimmed.slice(1, -1).replace(/\\>/g, '>')
  return trimmed
}

function createInlineNodesFromMarkdown(schema: any, source: string, marks: readonly any[] = []): ProseMirrorNode[] {
  const nodes: ProseMirrorNode[] = []
  const tokenRe = /(!?)\[((?:\\.|[^\]\\])*)\]\((<[^>]*>|[^)]*)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g
  let index = 0
  for (const match of source.matchAll(tokenRe)) {
    const start = match.index ?? 0
    if (start > index) {
      nodes.push(...createInlineTextNode(schema, source.slice(index, start), marks))
    }
    if (match[2] !== undefined) {
      const embed = match[1] === '!'
      const label = unescapeMarkdownLabel(match[2] ?? '')
      const destination = unformatMarkdownDestination(match[3] ?? '')
      if (embed) {
        const imageType = schema?.nodes?.image
        if (imageType && destination) {
          try {
            nodes.push(imageType.create(getImageAttrs(imageType, destination, label)))
          } catch {
            nodes.push(...createInlineTextNode(schema, label, marks))
          }
        } else {
          nodes.push(...createInlineTextNode(schema, label, marks))
        }
      } else if (destination) {
        nodes.push(...createInlineTextNode(schema, label, addMark(schema, marks, ['link'], destination)))
      } else {
        nodes.push(...createInlineTextNode(schema, label, marks))
      }
    } else if (match[4] !== undefined) {
      nodes.push(...createInlineTextNode(schema, match[4], addMark(schema, marks, ['strong', 'bold'])))
    } else if (match[5] !== undefined) {
      nodes.push(...createInlineTextNode(schema, match[5], addMark(schema, marks, ['em', 'emph', 'italic'])))
    } else if (match[6] !== undefined) {
      nodes.push(...createInlineTextNode(schema, match[6], addMark(schema, marks, ['code'])))
    }
    index = start + match[0].length
  }
  if (index < source.length) {
    nodes.push(...createInlineTextNode(schema, source.slice(index), marks))
  }
  return nodes
}

function createMarkdownLineNode(schema: any, line: string): ProseMirrorNode | null {
  const headingMatch = line.match(/^(#{1,6})\s+(.*)$/)
  if (headingMatch && schema?.nodes?.heading) {
    try {
      return schema.nodes.heading.create(
        { level: headingMatch[1].length },
        createInlineNodesFromMarkdown(schema, headingMatch[2] ?? ''),
      )
    } catch {
      // Fall through to a paragraph.
    }
  }
  if (/^\s{0,3}(?:-{3,}|\*{3,})\s*$/.test(line)) {
    const rule = schema?.nodes?.thematicBreak ?? schema?.nodes?.horizontalRule
    if (rule) {
      try {
        return rule.create()
      } catch {
        // Fall through to a paragraph.
      }
    }
  }
  return createParagraphFromInline(schema, createInlineNodesFromMarkdown(schema, line))
}

export function insertVisualClipboardMarkdownIntoView(view: any | null, markdown: string): boolean {
  const normalized = normalizeVisualClipboardText(markdown)
  if (!view?.state?.schema || !view?.dispatch || !view.state?.tr || normalized.length === 0) return false
  const nodes = normalized
    .split('\n')
    .map((line) => createMarkdownLineNode(view.state.schema, line))
    .filter((node): node is ProseMirrorNode => Boolean(node))
  if (nodes.length === 0) return false
  try {
    view.dispatch(view.state.tr.replaceSelection(new Slice(Fragment.fromArray(nodes), 0, 0)).scrollIntoView())
    view.focus?.()
    return true
  } catch {
    return false
  }
}

function parseHtmlFragment(html: string): Document | null {
  if (typeof DOMParser === 'undefined') return null
  try {
    return new DOMParser().parseFromString(html, 'text/html')
  } catch {
    return null
  }
}

function getSchemaMark(schema: any, names: readonly string[]): any | null {
  for (const name of names) {
    const mark = schema?.marks?.[name]
    if (mark) return mark
  }
  return null
}

function addMark(schema: any, marks: readonly any[], names: readonly string[], href?: string): any[] {
  const markType = getSchemaMark(schema, names)
  if (!markType) return [...marks]
  try {
    const mark = names.includes('link') && href ? createLinkMark(markType, href) : markType.create()
    return [...marks, mark]
  } catch {
    return [...marks]
  }
}

function collapseHtmlText(value: string): string {
  return value.replace(/\s+/g, ' ')
}

function createInlineTextNode(schema: any, text: string, marks: readonly any[]): ProseMirrorNode[] {
  if (!text) return []
  try {
    return [schema.text(text, marks)]
  } catch {
    return []
  }
}

function getImageAttrs(imageType: any, source: string, alt: string): Record<string, string> {
  const attrs = imageType?.attrs ?? imageType?.spec?.attrs ?? {}
  if (Object.prototype.hasOwnProperty.call(attrs, 'imageUrl')) {
    return {
      imageUrl: source,
      ...(Object.prototype.hasOwnProperty.call(attrs, 'altText') ? { altText: alt } : {}),
    }
  }
  return {
    src: source,
    ...(Object.prototype.hasOwnProperty.call(attrs, 'alt') ? { alt } : {}),
  }
}

function createImageInlineNode(schema: any, element: HTMLImageElement): ProseMirrorNode[] {
  const source = element.getAttribute('src') ?? ''
  if (!source) return createInlineTextNode(schema, element.getAttribute('alt') ?? '', [])
  const imageType = schema?.nodes?.image
  if (!imageType) return createInlineTextNode(schema, element.getAttribute('alt') ?? source, [])
  try {
    return [imageType.create(getImageAttrs(imageType, source, element.getAttribute('alt') ?? ''))]
  } catch {
    return createInlineTextNode(schema, element.getAttribute('alt') ?? source, [])
  }
}

function collectInlineNodes(schema: any, sourceNode: Node, marks: readonly any[] = []): ProseMirrorNode[] {
  if (sourceNode.nodeType === Node.TEXT_NODE) {
    return createInlineTextNode(schema, collapseHtmlText(sourceNode.textContent ?? ''), marks)
  }
  if (!(sourceNode instanceof Element)) return []

  const tag = sourceNode.tagName.toLowerCase()
  if (tag === 'br') {
    const hardBreak = schema?.nodes?.hardBreak
    if (hardBreak) {
      try {
        return [hardBreak.create()]
      } catch {
        return []
      }
    }
    return createInlineTextNode(schema, '\n', marks)
  }
  if (tag === 'img') return createImageInlineNode(schema, sourceNode as HTMLImageElement)

  let nextMarks = marks
  if (tag === 'strong' || tag === 'b') nextMarks = addMark(schema, nextMarks, ['strong', 'bold'])
  if (tag === 'em' || tag === 'i') nextMarks = addMark(schema, nextMarks, ['em', 'emph', 'italic'])
  if (tag === 's' || tag === 'strike' || tag === 'del') nextMarks = addMark(schema, nextMarks, ['strike'])
  if (tag === 'code') nextMarks = addMark(schema, nextMarks, ['code'])
  if (tag === 'a') {
    const href = (sourceNode as HTMLAnchorElement).getAttribute('href') ?? ''
    if (href) nextMarks = addMark(schema, nextMarks, ['link'], href)
  }

  const nodes: ProseMirrorNode[] = []
  sourceNode.childNodes.forEach((child) => {
    nodes.push(...collectInlineNodes(schema, child, nextMarks))
  })
  return nodes
}

function trimInlineWhitespace(nodes: ProseMirrorNode[]): ProseMirrorNode[] {
  let firstText = nodes.findIndex((node: any) => node?.isText && typeof node.text === 'string')
  while (firstText >= 0 && /^\s*$/.test((nodes[firstText] as any).text)) {
    nodes.splice(firstText, 1)
    firstText = nodes.findIndex((node: any) => node?.isText && typeof node.text === 'string')
  }
  let lastText = -1
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node: any = nodes[index]
    if (node?.isText && typeof node.text === 'string') {
      lastText = index
      break
    }
  }
  while (lastText >= 0 && /^\s*$/.test((nodes[lastText] as any).text)) {
    nodes.splice(lastText, 1)
    lastText = -1
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
      const node: any = nodes[index]
      if (node?.isText && typeof node.text === 'string') {
        lastText = index
        break
      }
    }
  }
  if (nodes[0] && (nodes[0] as any).isText) {
    const node: any = nodes[0]
    const trimmed = node.text.replace(/^\s+/, '')
    if (trimmed !== node.text) nodes[0] = node.type.schema.text(trimmed, node.marks)
  }
  const last = nodes[nodes.length - 1] as any
  if (last?.isText) {
    const trimmed = last.text.replace(/\s+$/, '')
    if (trimmed !== last.text) nodes[nodes.length - 1] = last.type.schema.text(trimmed, last.marks)
  }
  return nodes
}

function createParagraphFromInline(schema: any, inlineNodes: ProseMirrorNode[]): ProseMirrorNode | null {
  const paragraph = schema?.nodes?.paragraph
  if (!paragraph) return null
  try {
    return paragraph.create(null, trimInlineWhitespace([...inlineNodes]))
  } catch {
    try {
      return paragraph.create()
    } catch {
      return null
    }
  }
}

function createHeadingNode(schema: any, element: Element): ProseMirrorNode | null {
  const heading = schema?.nodes?.heading
  if (!heading) return createParagraphFromInline(schema, collectInlineNodes(schema, element))
  const level = Math.min(6, Math.max(1, Number(element.tagName.slice(1)) || 1))
  try {
    return heading.create({ level }, trimInlineWhitespace(collectInlineNodes(schema, element)))
  } catch {
    return createParagraphFromInline(schema, collectInlineNodes(schema, element))
  }
}

function createCodeBlockNode(schema: any, element: Element): ProseMirrorNode | null {
  const codeBlock = schema?.nodes?.codeBlock
  if (!codeBlock) return createParagraphFromInline(schema, createInlineTextNode(schema, element.textContent ?? '', []))
  try {
    return codeBlock.create(null, element.textContent ? schema.text(element.textContent) : undefined)
  } catch {
    return null
  }
}

function createListNode(schema: any, element: Element): ProseMirrorNode | null {
  const isOrdered = element.tagName.toLowerCase() === 'ol'
  const listType = isOrdered ? schema?.nodes?.orderedList : schema?.nodes?.bulletList
  const listItemType = schema?.nodes?.listItem
  if (!listType || !listItemType) return null
  const items: ProseMirrorNode[] = []
  Array.from(element.children).forEach((child) => {
    if (child.tagName.toLowerCase() !== 'li') return
    const nestedBlocks = collectBlockNodesFromChildren(schema, child).filter((node) => getNodeTypeName(node) !== 'bulletList' && getNodeTypeName(node) !== 'orderedList')
    const content = nestedBlocks.length > 0
      ? nestedBlocks
      : [createParagraphFromInline(schema, collectInlineNodes(schema, child))].filter(Boolean) as ProseMirrorNode[]
    try {
      items.push(listItemType.create(null, content))
    } catch {
      // Skip malformed items rather than failing the entire paste.
    }
  })
  if (items.length === 0) return null
  try {
    return listType.create(isOrdered ? { order: Number(element.getAttribute('start')) || 1 } : null, items)
  } catch {
    return null
  }
}

function collectBlockNode(schema: any, element: Element): ProseMirrorNode[] {
  const tag = element.tagName.toLowerCase()
  if (/^h[1-6]$/.test(tag)) return [createHeadingNode(schema, element)].filter(Boolean) as ProseMirrorNode[]
  if (tag === 'pre') return [createCodeBlockNode(schema, element)].filter(Boolean) as ProseMirrorNode[]
  if (tag === 'ul' || tag === 'ol') {
    const list = createListNode(schema, element)
    if (list) return [list]
  }
  if (tag === 'blockquote') {
    const blocks = collectBlockNodesFromChildren(schema, element)
    return blocks.length > 0
      ? blocks.map((node) => createParagraphFromInline(schema, createInlineTextNode(schema, `> ${node.textContent ?? ''}`, []))).filter(Boolean) as ProseMirrorNode[]
      : []
  }
  if (tag === 'table') {
    const rows = Array.from(element.querySelectorAll('tr'))
      .map((row) => Array.from(row.querySelectorAll('th,td')).map((cell) => (cell.textContent ?? '').trim()))
      .filter((cells) => cells.length > 0)
    if (rows.length > 0) {
      const lines = rows.flatMap((cells, index) => {
        const line = `| ${cells.join(' | ')} |`
        return index === 0 ? [line, `| ${cells.map(() => '---').join(' | ')} |`] : [line]
      })
      return lines.map((line) => createParagraphFromInline(schema, createInlineTextNode(schema, line, []))).filter(Boolean) as ProseMirrorNode[]
    }
  }
  if (tag === 'br') return [createParagraphNode(schema, '')].filter(Boolean) as ProseMirrorNode[]

  const inlineNodes = collectInlineNodes(schema, element)
  if (inlineNodes.length > 0 || ['p', 'div'].includes(tag)) {
    return [createParagraphFromInline(schema, inlineNodes)].filter(Boolean) as ProseMirrorNode[]
  }
  return collectBlockNodesFromChildren(schema, element)
}

function collectBlockNodesFromChildren(schema: any, parent: ParentNode): ProseMirrorNode[] {
  const nodes: ProseMirrorNode[] = []
  parent.childNodes.forEach((child) => {
    if (child instanceof Element) {
      nodes.push(...collectBlockNode(schema, child))
      return
    }
    if (child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim().length > 0) {
      const paragraph = createParagraphFromInline(schema, collectInlineNodes(schema, child))
      if (paragraph) nodes.push(paragraph)
    }
  })
  return nodes
}

export function insertClipboardHtmlIntoView(view: any | null, html: string): boolean {
  const doc = parseHtmlFragment(html)
  if (!doc?.body || !view?.state?.schema || !view?.dispatch || !view.state?.tr) return false
  const nodes = collectBlockNodesFromChildren(view.state.schema, doc.body)
  if (nodes.length === 0) return false
  try {
    view.dispatch(view.state.tr.replaceSelection(new Slice(Fragment.fromArray(nodes), 0, 0)).scrollIntoView())
    view.focus?.()
    return true
  } catch {
    return false
  }
}

export function insertClipboardDataIntoView(view: any | null, dataTransfer: DataTransferReadLike): boolean {
  const tablePayload = readTableSelectionClipboardPayloadFromDataTransfer(dataTransfer)
  if (tablePayload && insertTableSelectionClipboardPayloadIntoView(view, tablePayload)) return true
  const tabsMarkdown = readAisleNoteMarkdownFromDataTransfer(dataTransfer)
  if (tabsMarkdown) return insertVisualClipboardMarkdownIntoView(view, tabsMarkdown)
  const text = dataTransfer?.getData('text/plain') ?? ''
  const singleLineText = getSingleLinePlainClipboardText(text)
  if (singleLineText !== null && insertVisualClipboardTextIntoView(view, singleLineText)) return true
  if (isLayoutSensitiveClipboardText(text) && insertVisualClipboardTextIntoView(view, text)) return true
  const html = dataTransfer?.getData('text/html') ?? ''
  if (html && insertClipboardHtmlIntoView(view, html)) return true
  return text ? insertVisualClipboardTextIntoView(view, text) : false
}

function escapeMarkdownText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\*/g, '\\*').replace(/_/g, '\\_')
}

function htmlInlineToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return collapseHtmlText(node.textContent ?? '')
  if (!(node instanceof Element)) return ''
  const tag = node.tagName.toLowerCase()
  if (tag === 'br') return '\n'
  if (tag === 'img') {
    const source = node.getAttribute('src') ?? ''
    return source ? `![${escapeMarkdownLabel(node.getAttribute('alt') ?? '')}](${formatMarkdownDestination(source)})` : ''
  }
  const content = Array.from(node.childNodes).map(htmlInlineToMarkdown).join('')
  if (tag === 'strong' || tag === 'b') return `**${content.trim()}**`
  if (tag === 'em' || tag === 'i') return `*${content.trim()}*`
  if (tag === 'code') return `\`${content.trim()}\``
  if (tag === 's' || tag === 'strike' || tag === 'del') return `~~${content.trim()}~~`
  if (tag === 'a') {
    const href = node.getAttribute('href') ?? ''
    return href ? `[${escapeMarkdownLabel(content.trim())}](${formatMarkdownDestination(href)})` : content
  }
  return content
}

function htmlElementToMarkdownBlocks(element: Element): string[] {
  const tag = element.tagName.toLowerCase()
  if (/^h[1-6]$/.test(tag)) return [`${'#'.repeat(Number(tag.slice(1)) || 1)} ${htmlInlineToMarkdown(element).trim()}`]
  if (tag === 'pre') return ['```', element.textContent ?? '', '```']
  if (tag === 'ul' || tag === 'ol') {
    return Array.from(element.children)
      .filter((child) => child.tagName.toLowerCase() === 'li')
      .map((child, index) => `${tag === 'ol' ? `${index + 1}.` : '-'} ${htmlInlineToMarkdown(child).trim()}`)
  }
  if (tag === 'table') {
    const rows = Array.from(element.querySelectorAll('tr'))
      .map((row) => Array.from(row.querySelectorAll('th,td')).map((cell) => escapeMarkdownText((cell.textContent ?? '').trim())))
      .filter((cells) => cells.length > 0)
    return rows.flatMap((cells, index) => {
      const line = `| ${cells.join(' | ')} |`
      return index === 0 ? [line, `| ${cells.map(() => '---').join(' | ')} |`] : [line]
    })
  }
  if (tag === 'br') return ['']
  const content = htmlInlineToMarkdown(element).trim()
  return [content]
}

export function convertClipboardHtmlToVisualMarkdown(html: string): string {
  const doc = parseHtmlFragment(html)
  if (!doc?.body) return ''
  const lines: string[] = []
  doc.body.childNodes.forEach((child) => {
    if (child instanceof Element) {
      lines.push(...htmlElementToMarkdownBlocks(child))
      return
    }
    const text = collapseHtmlText(child.textContent ?? '').trim()
    if (text) lines.push(text)
  })
  return normalizeVisualClipboardText(lines.join('\n'))
}
