export const ANNOTATION_LINE_CLASS_NAME = 'tabs-annotation-line'
export const ANNOTATION_LINE_MARKER_CLASS_NAME = 'tabs-annotation-line-marker'

type HtmlOpenTagToken = {
  type?: string
  tagName?: string
  attributes?: Record<string, unknown>
  classNames?: string[]
  [key: string]: unknown
}

export type HtmlToken = HtmlOpenTagToken | HtmlOpenTagToken[] | null

export type AnnotationLineMatch = {
  indent: string
  content: string
  markerStart: number
  markerEnd: number
  prefixEnd: number
}

function compactClassNames(classNames: unknown): string[] {
  return Array.isArray(classNames)
    ? Array.from(new Set(classNames.filter((className): className is string => typeof className === 'string')))
    : []
}

function normalizeAnnotationText(text: string) {
  return String(text ?? '').replace(/\u200b/g, '')
}

export function parseAnnotationLine(text: string): AnnotationLineMatch | null {
  const normalizedText = normalizeAnnotationText(text)
  const match = normalizedText.match(/^([ \t]*)--([ \t]+)(.*)$/)
  if (!match) return null

  const indent = match[1] ?? ''
  const markerStart = indent.length
  const markerEnd = markerStart + 2
  return {
    indent,
    markerStart,
    markerEnd,
    prefixEnd: markerEnd + (match[2]?.length ?? 0),
    content: match[3] ?? '',
  }
}

export function isAnnotationLine(text: string): boolean {
  return parseAnnotationLine(text) !== null
}

function addAnnotationClassToOpenTagToken(token: HtmlOpenTagToken): HtmlOpenTagToken {
  if (token.type !== 'openTag' || token.tagName !== 'p') return token
  const classNames = compactClassNames(token.classNames)
  if (!classNames.includes(ANNOTATION_LINE_CLASS_NAME)) classNames.push(ANNOTATION_LINE_CLASS_NAME)
  return {
    ...token,
    classNames,
  }
}

export function applyAnnotationLineClassToHtmlToken(token: unknown): unknown {
  if (Array.isArray(token)) return token.map((item) => applyAnnotationLineClassToHtmlToken(item))
  if (!token || typeof token !== 'object') return token
  return addAnnotationClassToOpenTagToken(token as HtmlOpenTagToken)
}

function getLiteralText(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const literal = (node as { literal?: unknown }).literal
  return typeof literal === 'string' ? literal : ''
}

export function getToastNodeText(node: unknown, getChildrenText?: (node: unknown) => string): string {
  if (getChildrenText) {
    try {
      const childrenText = getChildrenText(node)
      if (typeof childrenText === 'string') return childrenText
    } catch {
      // Fall back to literal/linked child traversal below.
    }
  }

  const literal = getLiteralText(node)
  if (literal) return literal

  if (!node || typeof node !== 'object') return ''
  const firstChild = (node as { firstChild?: unknown }).firstChild
  let cursor = firstChild
  let text = ''
  const seen = new Set<unknown>()
  while (cursor && typeof cursor === 'object' && !seen.has(cursor)) {
    seen.add(cursor)
    text += getLiteralText(cursor)
    cursor = (cursor as { next?: unknown }).next
  }
  return text
}

function isFirstTextChild(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false
  const parent = (node as { parent?: { firstChild?: unknown } | null }).parent
  if (!parent) return true
  let cursor = parent.firstChild
  const seen = new Set<unknown>()
  while (cursor && typeof cursor === 'object' && !seen.has(cursor)) {
    seen.add(cursor)
    if (getLiteralText(cursor)) return cursor === node
    cursor = (cursor as { next?: unknown }).next
  }
  return false
}

export function applyAnnotationMarkerToTextHtmlToken(node: unknown, token: unknown): unknown {
  const parentType = (node as { parent?: { type?: unknown } | null } | null)?.parent?.type
  if (parentType && parentType !== 'paragraph') return token

  const literal = getLiteralText(node)
  const annotationMatch = parseAnnotationLine(literal)
  if (!annotationMatch || !isFirstTextChild(node)) return token

  const originalTextToken =
    token && typeof token === 'object' && !Array.isArray(token) && (token as { type?: unknown }).type === 'text'
      ? (token as { type: string; content?: unknown })
      : { type: 'text', content: literal }

  const content = typeof originalTextToken.content === 'string' ? originalTextToken.content : literal
  const markerFrom = annotationMatch.markerStart
  const markerTo = Math.min(annotationMatch.prefixEnd, content.length)
  if (markerTo <= markerFrom) return token

  const tokens: unknown[] = []
  if (markerFrom > 0) {
    tokens.push({ ...originalTextToken, content: content.slice(0, markerFrom) })
  }
  if (markerTo < content.length) {
    tokens.push({ ...originalTextToken, content: content.slice(markerTo) })
  }
  return tokens
}
