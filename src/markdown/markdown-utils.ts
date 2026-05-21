import type { Editor } from '@toast-ui/editor'

export const INDENT_TOKEN = '\u2060\u2003\u2003'
export const BLOCK_INDENT_TOKEN = '\u2060\u2060\u2003\u2003'
export const EDITOR_BLANK_LINE_PLACEHOLDER = '\u200b'

const INDENT_PREFIX_PATTERN = /^(?:\u2060\u2003\u2003|\u2003\u2003|\u00A0{1,4}| {1,4}|\t)/
const EXPORT_TAB_SPACES = '    '

export function getIndentPrefixLength(text: string): number {
  const match = text.match(INDENT_PREFIX_PATTERN)
  return match ? match[0].length : 0
}

export function getBlockIndentPrefixLength(text: string): number {
  return text.startsWith(BLOCK_INDENT_TOKEN) ? BLOCK_INDENT_TOKEN.length : 0
}

export function hasBlockIndentPrefix(text: string): boolean {
  return getBlockIndentPrefixLength(text) > 0
}

export function stripBlockIndentPrefix(text: string): string {
  const length = getBlockIndentPrefixLength(text)
  return length > 0 ? text.slice(length) : text
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
  next = next.replace(/!\[([^\]]*)\]\s*\n+\s*\((data:image\/[a-zA-Z0-9+.-]+;base64,[\s\S]*?)\)/g, (_all, alt: string, src: string) => {
    const collapsed = src.replace(/\s+/g, '')
    return `![${alt}](${collapsed})`
  })
  next = next.replace(/!\[([^\]]*)\]\(\s*(data:image\/[a-zA-Z0-9+.-]+;base64,[\s\S]*?)\)/g, (_all, alt: string, src: string) => {
    const collapsed = src.replace(/\s+/g, '')
    return `![${alt}](${collapsed})`
  })

  return next
}

function stripBlockIndentTokensFromQuotedLines(markdown: string): string {
  return String(markdown ?? '')
    .split('\n')
    .map((line) => {
      const match = line.match(/^((?:\s*>[ \t]?)+)(.*)$/)
      if (!match) return line
      let content = match[2]
      while (content.startsWith(BLOCK_INDENT_TOKEN)) {
        content = content.slice(BLOCK_INDENT_TOKEN.length)
      }
      return `${match[1]}${content}`
    })
    .join('\n')
}

export function normalizeMarkdownForPersistence(markdown: string): string {
  const repaired = repairBrokenDataImageMarkdown(markdown)
  const highlighted = normalizeHighlightMarkdownForPersistence(repaired)
  return stripBlockIndentTokensFromQuotedLines(highlighted).replace(/(?<!\u2060)\u2003\u2003/g, INDENT_TOKEN)
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function decodeHtmlText(value: string): string {
  if (typeof document !== 'undefined') {
    const textarea = document.createElement('textarea')
    textarea.innerHTML = value
    return textarea.value
  }
  return value
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([a-f0-9]+);/gi, (_match, code: string) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function trimSyntacticHighlightPadding(value: string): string {
  if (!value.startsWith(' ') || !value.endsWith(' ') || value.trim().length === 0) return value
  return value.slice(1, -1)
}

function transformOutsideInlineCode(line: string, transformText: (text: string) => string): string {
  let result = ''
  let plain = ''
  let index = 0
  let codeDelimiter = ''

  const flushPlain = () => {
    if (plain.length === 0) return
    result += transformText(plain)
    plain = ''
  }

  while (index < line.length) {
    if (line[index] !== '`') {
      if (codeDelimiter) {
        result += line[index]
      } else {
        plain += line[index]
      }
      index += 1
      continue
    }

    let end = index + 1
    while (end < line.length && line[end] === '`') end += 1
    const delimiter = line.slice(index, end)

    if (!codeDelimiter) {
      flushPlain()
      codeDelimiter = delimiter
      result += delimiter
      index = end
      continue
    }

    result += delimiter
    if (delimiter.length === codeDelimiter.length) {
      codeDelimiter = ''
    }
    index = end
  }

  if (!codeDelimiter) {
    flushPlain()
  } else {
    result += plain
  }

  return result
}

function transformOutsideFencedCode(markdown: string, transformLine: (line: string) => string): string {
  let activeFence: string | null = null
  return String(markdown ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => {
      const fenceBeforeLine = activeFence
      const nextFence = isFenceBoundary(line, activeFence)
      const isFenceLine = nextFence !== activeFence
      activeFence = nextFence
      if (fenceBeforeLine || isFenceLine) return line
      return transformLine(line)
    })
    .join('\n')
}

function convertHighlightMarkersToHtml(segment: string): string {
  return segment.replace(/(^|[^=])==([^\n]*?\S[^\n]*?)==(?=$|[^=])/g, (match, prefix: string, rawText: string) => {
    const text = trimSyntacticHighlightPadding(rawText)
    if (text.trim().length === 0) return match
    return `${prefix}<mark>${escapeHtmlText(text)}</mark>`
  })
}

function convertHighlightHtmlToMarkers(segment: string): string {
  return segment.replace(/<mark\b[^>]*>([\s\S]*?)<\/mark>/gi, (match, rawText: string) => {
    if (rawText.includes('\n')) return match
    const text = trimSyntacticHighlightPadding(decodeHtmlText(rawText))
    if (text.trim().length === 0) return match
    return `==${text}==`
  })
}

export function prepareMarkdownHighlightsForDisplay(markdown: string): string {
  return transformOutsideFencedCode(String(markdown ?? ''), (line) =>
    transformOutsideInlineCode(line, convertHighlightMarkersToHtml),
  )
}

export function normalizeHighlightMarkdownForPersistence(markdown: string): string {
  return transformOutsideFencedCode(String(markdown ?? ''), (line) =>
    transformOutsideInlineCode(line, convertHighlightHtmlToMarkers),
  )
}

function stripStandaloneBlankLinePlaceholders(markdown: string): string {
  return String(markdown ?? '')
    .split('\n')
    .map((line) => {
      const withoutPlaceholder = line.replaceAll(EDITOR_BLANK_LINE_PLACEHOLDER, '')
      return withoutPlaceholder.trim().length === 0 && line.includes(EDITOR_BLANK_LINE_PLACEHOLDER) ? '' : line
    })
    .join('\n')
}

export function convertInternalTabsForExport(markdown: string): string {
  return stripBlockIndentTokensFromQuotedLines(stripStandaloneBlankLinePlaceholders(markdown))
    .replaceAll(BLOCK_INDENT_TOKEN, EXPORT_TAB_SPACES)
    .replace(/\u2060\u2003\u2003/g, EXPORT_TAB_SPACES)
    .replace(/\u2003\u2003/g, EXPORT_TAB_SPACES)
    .replace(/\u00A0/g, ' ')
}

type MarkdownBlockChunk = {
  lines: string[]
}

export type BlankParagraphDisplayPlan = {
  markdown: string
  blockKinds: Array<'blank' | 'content'>
}

type MarkdownLineBlockKind = 'atomic' | 'list' | 'paragraph'

function isStandaloneBlankLinePlaceholderChunk(chunk: MarkdownBlockChunk): boolean {
  return chunk.lines.every((line) => {
    const withoutPlaceholder = line.replaceAll(EDITOR_BLANK_LINE_PLACEHOLDER, '')
    return line.includes(EDITOR_BLANK_LINE_PLACEHOLDER) && withoutPlaceholder.trim().length === 0
  })
}

function isStandaloneBlankLinePlaceholderLine(line: string): boolean {
  const withoutPlaceholder = line.replaceAll(EDITOR_BLANK_LINE_PLACEHOLDER, '')
  return line.includes(EDITOR_BLANK_LINE_PLACEHOLDER) && withoutPlaceholder.trim().length === 0
}

function isFenceBoundary(line: string, activeFence: string | null): string | null {
  const trimmed = line.trim()
  const match = trimmed.match(/^(`{3,}|~{3,})/)
  if (!match) return activeFence
  const fenceMarker = match[1][0]
  if (!activeFence) return fenceMarker
  return activeFence === fenceMarker ? null : activeFence
}

function getMarkdownLineBlockKind(line: string): MarkdownLineBlockKind {
  if (/^\s{0,3}#{1,6}(?:\s+|$)/.test(line)) return 'atomic'
  if (/^\s{0,3}(?:-{3,}|\*{3,})\s*$/.test(line)) return 'atomic'
  if (/^\s{0,3}(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s*)?/.test(line)) return 'list'
  return 'paragraph'
}

function splitMarkdownTopLevelChunks(markdown: string): MarkdownBlockChunk[] {
  const lines = String(markdown ?? '').replace(/\r\n/g, '\n').split('\n')
  const chunks: MarkdownBlockChunk[] = []
  let current: string[] = []
  let activeFence: string | null = null
  let currentKind: MarkdownLineBlockKind | null = null

  const pushCurrent = () => {
    if (current.length === 0) return
    chunks.push({ lines: current })
    current = []
    currentKind = null
  }

  lines.forEach((line) => {
    if (activeFence) {
      current.push(line)
      activeFence = isFenceBoundary(line, activeFence)
      if (!activeFence) pushCurrent()
      return
    }

    if (line.trim().length === 0) {
      pushCurrent()
      return
    }

    if (isStandaloneBlankLinePlaceholderLine(line)) {
      pushCurrent()
      chunks.push({ lines: [line] })
      return
    }

    const nextFence = isFenceBoundary(line, null)
    if (nextFence) {
      pushCurrent()
      current = [line]
      currentKind = 'atomic'
      activeFence = nextFence
      return
    }

    const nextKind = getMarkdownLineBlockKind(line)
    if (nextKind === 'atomic') {
      pushCurrent()
      chunks.push({ lines: [line] })
      return
    }

    if (currentKind === 'list') {
      if (nextKind === 'list' || /^\s+/.test(line)) {
        current.push(line)
        return
      }
      pushCurrent()
    }

    if (nextKind === 'list') {
      if (currentKind !== 'list') pushCurrent()
      currentKind = 'list'
      current.push(line)
      return
    }

    currentKind = 'paragraph'
    current.push(line)
  })
  pushCurrent()

  return chunks
}

export function isBlankParagraphNode(node: any): boolean {
  if (node?.type?.name !== 'paragraph') return false
  const text = String(node.textContent ?? '').replaceAll(EDITOR_BLANK_LINE_PLACEHOLDER, '').trim()
  if (text.length > 0) return false
  if (typeof node.childCount !== 'number' || typeof node.child !== 'function') return true
  for (let index = 0; index < node.childCount; index += 1) {
    const child = node.child(index)
    if (!child?.isText) return false
    const childText = String(child.text ?? child.textContent ?? '')
      .replaceAll(EDITOR_BLANK_LINE_PLACEHOLDER, '')
      .trim()
    if (childText.length > 0) return false
  }
  return true
}

export function prepareBlankParagraphsForEditorDisplay(markdown: string): BlankParagraphDisplayPlan {
  const chunks = splitMarkdownTopLevelChunks(markdown)
  const contentChunks: MarkdownBlockChunk[] = []
  const blockKinds = chunks.map((chunk) => {
    if (isStandaloneBlankLinePlaceholderChunk(chunk)) return 'blank' as const
    contentChunks.push(chunk)
    return 'content' as const
  })

  return {
    markdown: contentChunks.map((chunk) => chunk.lines.join('\n')).join('\n\n'),
    blockKinds,
  }
}

export function preserveBlankParagraphsFromWysiwyg(editor: Editor | null, markdown: string): string {
  const doc = (editor as any)?.wwEditor?.view?.state?.doc
  if (!doc || typeof doc.forEach !== 'function') return markdown

  const blockKinds: Array<'blank' | 'content'> = []
  doc.forEach((node: any) => {
    blockKinds.push(isBlankParagraphNode(node) ? 'blank' : 'content')
  })

  const markdownChunks = splitMarkdownTopLevelChunks(markdown)
  const contentChunks = markdownChunks.filter((chunk) => !isStandaloneBlankLinePlaceholderChunk(chunk))
  const hasPlaceholderChunks = contentChunks.length !== markdownChunks.length
  const hasBlankBlocks = blockKinds.includes('blank')

  const contentBlockCount = blockKinds.filter((kind) => kind === 'content').length
  if (contentBlockCount !== contentChunks.length) {
    if (!hasBlankBlocks && !hasPlaceholderChunks) return markdown
    return contentBlockCount === 0
      ? blockKinds.map(() => EDITOR_BLANK_LINE_PLACEHOLDER).join('\n\n')
      : markdown
  }

  if (!hasBlankBlocks && !hasPlaceholderChunks && contentChunks.length <= 1) return markdown

  let nextChunkIndex = 0
  return blockKinds
    .map((kind) => {
      if (kind === 'blank') return EDITOR_BLANK_LINE_PLACEHOLDER
      const chunk = contentChunks[nextChunkIndex]
      nextChunkIndex += 1
      return chunk?.lines.join('\n') ?? ''
    })
    .join('\n\n')
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

export function normalizeEmptyHeadingMarkersFromWysiwyg(editor: Editor | null, markdown: string): string {
  const wwView = (editor as any)?.wwEditor?.view
  if (!wwView?.state?.doc || !markdown) return markdown

  const emptyHeadingLevels: number[] = []
  wwView.state.doc.descendants((node: any) => {
    if (node?.type?.name !== 'heading') return
    const textContent = String(node.textContent ?? '').replace(/\u200b/g, '').trim()
    if (textContent) return
    const level = Number(node.attrs?.level) || 1
    emptyHeadingLevels.push(Math.min(6, Math.max(1, level)))
  })

  if (emptyHeadingLevels.length === 0) return markdown

  const remainingByLevel = new Map<number, number>()
  emptyHeadingLevels.forEach((level) => {
    remainingByLevel.set(level, (remainingByLevel.get(level) ?? 0) + 1)
  })

  let changed = false
  const nextLines = markdown.split('\n').map((line) => {
    const match = line.match(/^(\s*)(#{1,6})\s*$/)
    if (!match) return line

    const level = match[2].length
    const remaining = remainingByLevel.get(level) ?? 0
    if (remaining <= 0) return line

    remainingByLevel.set(level, remaining - 1)
    const normalized = `${match[1]}${match[2]} `
    if (normalized !== line) changed = true
    return normalized
  })

  return changed ? nextLines.join('\n') : markdown
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
