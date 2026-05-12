import type { Editor } from '@toast-ui/editor'

export const INDENT_TOKEN = '\u2060\u2003\u2003'

const INDENT_PREFIX_PATTERN = /^(?:\u2060\u2003\u2003|\u2003\u2003|\u00A0{1,4}| {1,4}|\t)/
const EXPORT_TAB_SPACES = '    '

export function getIndentPrefixLength(text: string): number {
  const match = text.match(INDENT_PREFIX_PATTERN)
  return match ? match[0].length : 0
}

export function countLeadingIndentUnits(text: string): number {
  let count = 0
  let remaining = text
  while (true) {
    const length = getIndentPrefixLength(remaining)
    if (length <= 0) return count
    count += 1
    remaining = remaining.slice(length)
  }
}

export function stripAllIndentPrefixes(text: string): string {
  let remaining = text
  while (true) {
    const length = getIndentPrefixLength(remaining)
    if (length <= 0) return remaining
    remaining = remaining.slice(length)
  }
}

export function buildNormalizedIndentPrefix(levels: number): string {
  return levels > 0 ? INDENT_TOKEN.repeat(levels) : ''
}

export function getTrailingIndentPrefixLength(text: string): number {
  const match = text.match(/(?:\u2060\u2003\u2003|\u2003\u2003|\u00A0{1,4}| {1,4}|\t)$/)
  return match ? match[0].length : 0
}

export function repairBrokenDataImageMarkdown(markdown: string): string {
  let next = String(markdown ?? '')

  next = next.replace(/!\[([^\]]*)\]\(dat\s*\n+\s*(a:image\/[a-zA-Z0-9+.-]+;base64,[^)]+)\)/g, '![$1](dat$2)')
  next = next.replace(/!\[([^\]]*)\]\(\s*(data:image\/[a-zA-Z0-9+.-]+;base64,[\s\S]*?)\)/g, (_all, alt: string, src: string) => {
    const collapsed = src.replace(/\s+/g, '')
    return `![${alt}](${collapsed})`
  })

  return next
}

export function normalizeMarkdownForPersistence(markdown: string): string {
  const repaired = repairBrokenDataImageMarkdown(markdown)
  return repaired.replace(/(?<!\u2060)\u2003\u2003/g, INDENT_TOKEN)
}

export function convertInternalTabsForExport(markdown: string): string {
  return String(markdown ?? '')
    .replace(/\u2060\u2003\u2003/g, EXPORT_TAB_SPACES)
    .replace(/\u2003\u2003/g, EXPORT_TAB_SPACES)
    .replace(/\u00A0/g, ' ')
}

export function mergeLeadingIndentsFromWysiwyg(editor: Editor | null, markdown: string): string {
  const wwView = (editor as any)?.wwEditor?.view
  if (!wwView?.state?.doc || !markdown) return markdown

  const indentedBlockQueue = new Map<string, string[]>()
  wwView.state.doc.nodesBetween(0, wwView.state.doc.content.size, (node: any) => {
    if (!node?.isTextblock) return
    const text = node.textContent ?? ''
    const indentLevels = countLeadingIndentUnits(text)
    if (indentLevels <= 0) return
    const plain = stripAllIndentPrefixes(text)
    if (!plain) return
    const indentPrefix = buildNormalizedIndentPrefix(indentLevels)
    const existing = indentedBlockQueue.get(plain) ?? []
    existing.push(indentPrefix)
    indentedBlockQueue.set(plain, existing)
  })

  if (indentedBlockQueue.size === 0) return markdown

  const nextLines = markdown.split('\n').map((line) => {
    const plain = stripAllIndentPrefixes(line)
    const queue = indentedBlockQueue.get(plain)
    if (!queue || queue.length === 0) return line
    const indentPrefix = queue.shift() ?? ''
    return `${indentPrefix}${plain}`
  })

  return nextLines.join('\n')
}

export function normalizeHeadingMarkers(markdown: string): string {
  const lines = markdown.split('\n')
  let inFencedCode = false
  let changed = false

  const nextLines = lines.map((line) => {
    if (/^\s*```/.test(line)) {
      inFencedCode = !inFencedCode
      return line
    }
    if (inFencedCode) return line

    const match = line.match(/^(\s*)(#{1,6})\s*$/)
    if (!match) return line

    const normalized = `${match[1]}${match[2]} `
    if (normalized !== line) changed = true
    return normalized
  })

  return changed ? nextLines.join('\n') : markdown
}

export function isHorizontalRuleMarkerLine(line: string): boolean {
  return /^\s*(?:-{3,}|\*{3,})\s*$/.test(line)
}

export function materializeHorizontalRuleShortcut(previousMarkdown: string, currentMarkdown: string): string | null {
  if (currentMarkdown.length <= previousMarkdown.length) return null

  let prefixLength = 0
  while (
    prefixLength < previousMarkdown.length &&
    prefixLength < currentMarkdown.length &&
    previousMarkdown[prefixLength] === currentMarkdown[prefixLength]
  ) {
    prefixLength += 1
  }

  let suffixLength = 0
  while (
    suffixLength < previousMarkdown.length - prefixLength &&
    suffixLength < currentMarkdown.length - prefixLength &&
    previousMarkdown[previousMarkdown.length - 1 - suffixLength] === currentMarkdown[currentMarkdown.length - 1 - suffixLength]
  ) {
    suffixLength += 1
  }

  const inserted = currentMarkdown.slice(prefixLength, currentMarkdown.length - suffixLength)
  const removed = previousMarkdown.slice(prefixLength, previousMarkdown.length - suffixLength)
  if (removed.length > 0) return null
  if (!inserted.includes('\n')) return null
  if (/[^\n]/.test(inserted)) return null

  const lineStart = currentMarkdown.lastIndexOf('\n', prefixLength - 1) + 1
  const lineBeforeInsertedNewline = currentMarkdown.slice(lineStart, prefixLength)
  if (!isHorizontalRuleMarkerLine(lineBeforeInsertedNewline)) return null

  const lineIndentMatch = lineBeforeInsertedNewline.match(/^(\s*)/)
  const indent = lineIndentMatch?.[1] ?? ''
  const beforeLine = currentMarkdown.slice(0, lineStart)
  const afterInsertedNewlines = currentMarkdown.slice(prefixLength + inserted.length)
  const normalizedRuleBlock = `${indent}---\n\n`
  return `${beforeLine}${normalizedRuleBlock}${afterInsertedNewlines}`
}
