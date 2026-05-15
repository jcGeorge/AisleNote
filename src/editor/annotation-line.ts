export const ANNOTATION_LINE_CLASS_NAME = 'tabs-annotation-line'
export const ANNOTATION_LINE_MARKER_CLASS_NAME = 'tabs-annotation-line-marker'
export const ANNOTATION_LINE_ARROW_CLASS_NAME = 'tabs-annotation-line-arrow'
export const ANNOTATION_LINE_ARROW_UP_CLASS_NAME = 'tabs-annotation-line-arrow-up'
export const ANNOTATION_LINE_ARROW_DOWN_CLASS_NAME = 'tabs-annotation-line-arrow-down'
export const ANNOTATION_LINE_TAIL_LEFT_CLASS_NAME = 'tabs-annotation-line-tail-left'
export const ANNOTATION_LINE_TAIL_RIGHT_CLASS_NAME = 'tabs-annotation-line-tail-right'

type AnnotationLineMarker =
  | { kind: 'line'; raw: '--' }
  | {
      kind: 'arrow'
      raw: '^--' | '--^' | 'v--' | '--v'
      arrowDirection: 'up' | 'down'
      tailDirection: 'left' | 'right'
    }

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
  marker: AnnotationLineMarker
  content: string
  markerStart: number
  markerEnd: number
  markerRemovalStart: number
  markerRemovalEnd: number
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

function parseAnnotationMarker(raw: string): AnnotationLineMarker | null {
  if (raw === '--') return { kind: 'line', raw }
  if (raw === '^--') return { kind: 'arrow', raw, arrowDirection: 'up', tailDirection: 'right' }
  if (raw === '--^') return { kind: 'arrow', raw, arrowDirection: 'up', tailDirection: 'left' }
  if (raw === 'v--') return { kind: 'arrow', raw, arrowDirection: 'down', tailDirection: 'right' }
  if (raw === '--v') return { kind: 'arrow', raw, arrowDirection: 'down', tailDirection: 'left' }
  return null
}

function getWhitespaceRunStart(text: string, position: number) {
  let cursor = position
  while (cursor > 0 && /[ \t]/.test(text[cursor - 1] ?? '')) cursor -= 1
  return cursor
}

function getWhitespaceRunEnd(text: string, position: number) {
  let cursor = position
  while (cursor < text.length && /[ \t]/.test(text[cursor] ?? '')) cursor += 1
  return cursor
}

function removeMarkerText(text: string, from: number, to: number) {
  return `${text.slice(0, from)}${text.slice(to)}`.trim()
}

function buildAnnotationMatch(
  normalizedText: string,
  marker: AnnotationLineMarker,
  markerStart: number,
  markerEnd: number,
  markerRemovalStart: number,
  markerRemovalEnd: number,
): AnnotationLineMatch {
  const indent = normalizedText.match(/^[ \t]*/)?.[0] ?? ''
  return {
    indent,
    marker,
    markerStart,
    markerEnd,
    markerRemovalStart,
    markerRemovalEnd,
    prefixEnd: markerRemovalEnd,
    content: removeMarkerText(normalizedText, markerRemovalStart, markerRemovalEnd),
  }
}

function parseArrowAnnotationLine(normalizedText: string): AnnotationLineMatch | null {
  const match = /(\^--|--\^|v--|--v)/.exec(normalizedText)
  if (!match) return null
  const marker = parseAnnotationMarker(match[1] ?? '')
  if (!marker) return null

  const markerStart = match.index
  const markerEnd = markerStart + marker.raw.length
  const leadingWhitespaceStart = getWhitespaceRunStart(normalizedText, markerStart)
  const trailingWhitespaceEnd = getWhitespaceRunEnd(normalizedText, markerEnd)
  const hasLeadingWhitespace = leadingWhitespaceStart < markerStart
  const hasTrailingWhitespace = trailingWhitespaceEnd > markerEnd
  const markerRemovalStart = markerStart === 0 || hasTrailingWhitespace ? markerStart : hasLeadingWhitespace ? leadingWhitespaceStart : markerStart
  const markerRemovalEnd = hasTrailingWhitespace ? trailingWhitespaceEnd : markerEnd
  return buildAnnotationMatch(
    normalizedText,
    marker,
    markerStart,
    markerEnd,
    markerRemovalStart,
    markerRemovalEnd,
  )
}

function parseLineAnnotationLine(normalizedText: string): AnnotationLineMatch | null {
  const match = normalizedText.match(/^([ \t]*)--([ \t]+)(.*)$/)
  if (!match) return null
  const marker = parseAnnotationMarker('--')
  if (!marker) return null
  const indent = match[1] ?? ''
  const markerStart = indent.length
  const markerEnd = markerStart + marker.raw.length
  const markerRemovalEnd = markerEnd + (match[2]?.length ?? 0)
  return buildAnnotationMatch(
    normalizedText,
    marker,
    markerStart,
    markerEnd,
    markerStart,
    markerRemovalEnd,
  )
}

export function parseAnnotationLine(text: string): AnnotationLineMatch | null {
  const normalizedText = normalizeAnnotationText(text)
  return parseArrowAnnotationLine(normalizedText) ?? parseLineAnnotationLine(normalizedText)
}

export function isAnnotationLine(text: string): boolean {
  return parseAnnotationLine(text) !== null
}

export function getAnnotationLineClassNames(match: AnnotationLineMatch): string[] {
  const classNames = [ANNOTATION_LINE_CLASS_NAME]
  if (match.marker.kind !== 'arrow') return classNames
  classNames.push(
    ANNOTATION_LINE_ARROW_CLASS_NAME,
    match.marker.arrowDirection === 'up' ? ANNOTATION_LINE_ARROW_UP_CLASS_NAME : ANNOTATION_LINE_ARROW_DOWN_CLASS_NAME,
    match.marker.tailDirection === 'left' ? ANNOTATION_LINE_TAIL_LEFT_CLASS_NAME : ANNOTATION_LINE_TAIL_RIGHT_CLASS_NAME,
  )
  return classNames
}

function addAnnotationClassToOpenTagToken(token: HtmlOpenTagToken, match: AnnotationLineMatch | null): HtmlOpenTagToken {
  if (token.type !== 'openTag' || token.tagName !== 'p') return token
  const classNames = compactClassNames(token.classNames)
  const nextClassNames = match ? getAnnotationLineClassNames(match) : [ANNOTATION_LINE_CLASS_NAME]
  nextClassNames.forEach((className) => {
    if (!classNames.includes(className)) classNames.push(className)
  })
  return {
    ...token,
    classNames,
  }
}

export function applyAnnotationLineClassToHtmlToken(token: unknown, match: AnnotationLineMatch | null = null): unknown {
  if (Array.isArray(token)) return token.map((item) => applyAnnotationLineClassToHtmlToken(item, match))
  if (!token || typeof token !== 'object') return token
  return addAnnotationClassToOpenTagToken(token as HtmlOpenTagToken, match)
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

function getTextOffsetInParent(node: unknown): number | null {
  if (!node || typeof node !== 'object') return null
  const parent = (node as { parent?: { firstChild?: unknown } | null }).parent
  if (!parent) return 0
  let cursor = parent.firstChild
  const seen = new Set<unknown>()
  let offset = 0
  while (cursor && typeof cursor === 'object' && !seen.has(cursor)) {
    seen.add(cursor)
    const literal = getLiteralText(cursor)
    if (cursor === node) return offset
    offset += literal.length
    cursor = (cursor as { next?: unknown }).next
  }
  return null
}

export function applyAnnotationMarkerToTextHtmlToken(node: unknown, token: unknown): unknown {
  const parent = (node as { parent?: { type?: unknown; firstChild?: unknown } | null } | null)?.parent ?? null
  const parentType = parent?.type
  if (parentType && parentType !== 'paragraph') return token

  const literal = getLiteralText(node)
  const parentText = parent ? getToastNodeText(parent) : literal
  const annotationMatch = parseAnnotationLine(parentText || literal)
  if (!annotationMatch) return token

  const originalTextToken =
    token && typeof token === 'object' && !Array.isArray(token) && (token as { type?: unknown }).type === 'text'
      ? (token as { type: string; content?: unknown })
      : { type: 'text', content: literal }

  const content = typeof originalTextToken.content === 'string' ? originalTextToken.content : literal
  const offset = getTextOffsetInParent(node)
  if (offset === null) return token
  const markerFrom = Math.max(0, annotationMatch.markerRemovalStart - offset)
  const markerTo = Math.min(content.length, annotationMatch.markerRemovalEnd - offset)
  if (markerTo <= markerFrom || markerTo <= 0 || markerFrom >= content.length) return token

  const tokens: unknown[] = []
  if (markerFrom > 0) {
    tokens.push({ ...originalTextToken, content: content.slice(0, markerFrom) })
  }
  if (markerTo < content.length) {
    tokens.push({ ...originalTextToken, content: content.slice(markerTo) })
  }
  return tokens
}
