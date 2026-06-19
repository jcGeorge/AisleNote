import * as React from 'react'
import {
  Children,
  cloneElement,
  isValidElement,
  type AnchorHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react'
import { BLOCK_INDENT_TOKEN, countBlockIndentLevels } from '../../markdown/markdown-utils'
import { MediaPlayer } from '../../media/MediaPlayer'
import { getMediaKindFromUrl, isPotentialMediaUrl } from '../../media/media-utils'
import { normalizeExternalWebUrl, openExternalWebUrl } from '../../notes/external-links'
import { resolveMarkdownNoteReferenceDestination } from '../../notes/note-references'
import { TAG_TOKEN_CLASS_NAME } from '../../tags/tags.js'
import type { AppState, NoteLocation } from '../../types/app'
import {
  getAnnotationInlineArrowClassNames,
  getAnnotationLineClassNames,
  parseAnnotationLineMarkers,
  type AnnotationLineMatch,
} from '../../editor/annotation-line'
import {
  RENDERED_MARKDOWN_CLASS_NAMES,
  getRenderedMarkdownInlineTextParts,
  getRenderedMarkdownHeadingClassName,
} from '../../editor/rendered-markdown-surface'

void React

type MarkdownParagraphProps = HTMLAttributes<HTMLParagraphElement> & {
  node?: unknown
  children?: ReactNode
}

type MarkdownHeadingProps = HTMLAttributes<HTMLHeadingElement> & {
  node?: unknown
  children?: ReactNode
}

type MarkdownLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  node?: unknown
  children?: ReactNode
  appState?: AppState | null
  onOpenNote?: (target: NoteLocation) => void
}

type MarkdownListItemProps = HTMLAttributes<HTMLLIElement> & {
  node?: unknown
  children?: ReactNode
}

type MarkdownInputProps = InputHTMLAttributes<HTMLInputElement> & {
  node?: unknown
}

type MarkdownUnorderedListProps = HTMLAttributes<HTMLUListElement> & {
  node?: {
    position?: {
      start?: {
        line?: number
      }
    }
  }
  children?: ReactNode
}

type BlockIndentStyle = CSSProperties & {
  '--tabs-block-indent-level'?: number
}

function mergeClassNames(...classNames: Array<string | undefined>) {
  return classNames.filter(Boolean).join(' ') || undefined
}

function stripBlockIndentTokenFromPreviewChildren(children: ReactNode): {
  blockIndentLevel: number
  children: ReactNode
} {
  const childArray = Children.toArray(children)
  const firstChild = childArray[0]
  if (typeof firstChild !== 'string' || !firstChild.startsWith(BLOCK_INDENT_TOKEN)) {
    return { blockIndentLevel: 0, children }
  }
  const blockIndentLevel = countBlockIndentLevels(firstChild)

  return {
    blockIndentLevel,
    children: [firstChild.slice(blockIndentLevel * BLOCK_INDENT_TOKEN.length), ...childArray.slice(1)],
  }
}

function getReactNodeText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (!node) return ''
  if (Array.isArray(node)) return node.map(getReactNodeText).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return getReactNodeText(node.props.children)
  return ''
}

function renderInlineText(value: string, keyPrefix: string): ReactNode {
  const parts = getRenderedMarkdownInlineTextParts(value)
  if (parts.length === 1 && parts[0].kind === 'text') return parts[0].text

  return parts.map((part, index) => {
    if (part.kind === 'text') return part.text
    if (part.kind === 'highlight') {
      return (
        <span key={`${keyPrefix}-highlight-${index}`} className={RENDERED_MARKDOWN_CLASS_NAMES.highlight}>
          {part.text}
        </span>
      )
    }
    return (
      <span
        key={`${keyPrefix}-tag-${index}`}
        className={TAG_TOKEN_CLASS_NAME}
        data-tabs-tag={part.tag}
        data-app-tooltip="filter by tag"
      >
        {part.text}
      </span>
    )
  })
}

function isCodePreviewElement(node: ReactNode): boolean {
  if (!isValidElement(node)) return false
  return node.type === 'code' || node.type === 'pre'
}

function renderMarkdownPreviewTagsWithKey(node: ReactNode, keyPrefix: string): ReactNode {
  if (typeof node === 'string') return renderInlineText(node, keyPrefix)
  if (typeof node === 'number') return renderInlineText(String(node), keyPrefix)
  if (!node || typeof node === 'boolean') return node
  if (Array.isArray(node)) {
    return Children.map(node, (child, index) => renderMarkdownPreviewTagsWithKey(child, `${keyPrefix}-${index}`))
  }
  if (!isValidElement<{ children?: ReactNode }>(node) || isCodePreviewElement(node)) return node

  const element = node as ReactElement<{ children?: ReactNode }>
  if (!('children' in element.props)) return element
  return cloneElement(
    element,
    undefined,
    renderMarkdownPreviewTagsWithKey(element.props.children, `${keyPrefix}-child`),
  )
}

function renderMarkdownPreviewTags(children: ReactNode): ReactNode {
  return renderMarkdownPreviewTagsWithKey(children, 'preview')
}

function getAnnotationArrowText(match: AnnotationLineMatch): string {
  if (match.marker.kind !== 'arrow') return ''
  if (match.marker.arrowDirection === 'up') return '\u21b0'
  if (match.marker.arrowDirection === 'down') return '\u21b2'
  if (match.marker.arrowDirection === 'left') return '\u2190'
  return '\u2192'
}

function renderAnnotationText(value: string, matches: AnnotationLineMatch[]): ReactNode {
  if (matches.length === 0) return renderInlineText(value, 'preview-annotation')

  const nodes: ReactNode[] = []
  let cursor = 0
  matches.forEach((match, index) => {
    const removeStart = match.marker.kind === 'arrow' ? match.markerStart : match.markerRemovalStart
    const removeEnd = match.marker.kind === 'arrow' ? match.markerEnd : match.markerRemovalEnd
    if (removeStart > cursor) nodes.push(renderInlineText(value.slice(cursor, removeStart), `preview-annotation-${index}-before`))
    if (match.marker.kind === 'arrow') {
      nodes.push(
        <span
          key={`preview-annotation-arrow-${index}`}
          className={mergeClassNames(...getAnnotationInlineArrowClassNames(match))}
          aria-hidden="true"
        >
          {getAnnotationArrowText(match)}
        </span>,
      )
    }
    cursor = Math.max(cursor, removeEnd)
  })
  if (cursor < value.length) nodes.push(renderInlineText(value.slice(cursor), 'preview-annotation-after'))
  return nodes
}

function isPotentialInternalNoteHref(href: string): boolean {
  const normalized = normalizePotentialInternalNoteHref(href)
  if (!normalized) return false
  if (/^(?:https?:|mailto:|tel:|data:|blob:|tabs-asset:|#|\/|\.)/i.test(normalized)) return false
  return true
}

function normalizePotentialInternalNoteHref(href: string): string {
  const normalized = href.trim()
  if (!normalized) return ''
  try {
    const decoded = decodeURIComponent(normalized)
    if (decoded.startsWith('<') && decoded.endsWith('>')) return decoded
  } catch {
    // Keep the original value if it is not URI encoded.
  }
  return normalized
}

export function MarkdownPreviewParagraph({
  node,
  className,
  style,
  children,
  ...props
}: MarkdownParagraphProps) {
  void node
  const previewChildren = stripBlockIndentTokenFromPreviewChildren(children)
  const blockIndentStyle: BlockIndentStyle | undefined =
    previewChildren.blockIndentLevel > 0
      ? { ...style, '--tabs-block-indent-level': previewChildren.blockIndentLevel }
      : style
  const annotationText = getReactNodeText(previewChildren.children)
  const annotationMatches = parseAnnotationLineMarkers(annotationText)
  const annotationLineMatch = annotationMatches.find((match) => match.marker.kind === 'line') ?? null
  return (
    <p
      {...props}
      style={blockIndentStyle}
      className={mergeClassNames(
        className,
        RENDERED_MARKDOWN_CLASS_NAMES.paragraph,
        previewChildren.blockIndentLevel > 0 ? 'tabs-block-indent' : undefined,
        annotationLineMatch ? getAnnotationLineClassNames(annotationLineMatch).join(' ') : undefined,
      )}
    >
      {annotationMatches.length > 0
        ? renderAnnotationText(annotationText, annotationMatches)
        : renderMarkdownPreviewTags(previewChildren.children)}
    </p>
  )
}

function renderMarkdownPreviewHeading(
  Tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6',
  { node, children, className, ...props }: MarkdownHeadingProps,
) {
  void node
  const level = Number(Tag.slice(1))
  return (
    <Tag {...props} className={mergeClassNames(className, getRenderedMarkdownHeadingClassName(level))}>
      {renderMarkdownPreviewTags(children)}
    </Tag>
  )
}

export function MarkdownPreviewHeading1(props: MarkdownHeadingProps) {
  return renderMarkdownPreviewHeading('h1', props)
}

export function MarkdownPreviewHeading2(props: MarkdownHeadingProps) {
  return renderMarkdownPreviewHeading('h2', props)
}

export function MarkdownPreviewHeading3(props: MarkdownHeadingProps) {
  return renderMarkdownPreviewHeading('h3', props)
}

export function MarkdownPreviewHeading4(props: MarkdownHeadingProps) {
  return renderMarkdownPreviewHeading('h4', props)
}

export function MarkdownPreviewHeading5(props: MarkdownHeadingProps) {
  return renderMarkdownPreviewHeading('h5', props)
}

export function MarkdownPreviewHeading6(props: MarkdownHeadingProps) {
  return renderMarkdownPreviewHeading('h6', props)
}

export function MarkdownPreviewListItem({
  node,
  className,
  children,
  ...props
}: MarkdownListItemProps) {
  void node
  return (
    <li {...props} className={mergeClassNames(className, RENDERED_MARKDOWN_CLASS_NAMES.listItem)}>
      {renderMarkdownPreviewTags(children)}
    </li>
  )
}

export function createMarkdownPreviewListItem(markdown: string) {
  const dashListItemLines = new Set<number>()
  String(markdown ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .forEach((line, index) => {
      if (/^\s*-\s+(?!\[[ xX]\]\s)/.test(line)) dashListItemLines.add(index + 1)
    })

  return function MarkdownPreviewListItemWithMarker({
    node,
    className,
    children,
    ...props
  }: MarkdownListItemProps) {
    const line = (node as { position?: { start?: { line?: number } } } | undefined)?.position?.start?.line ?? 0
    return (
      <li
        {...props}
        className={mergeClassNames(
          className,
          RENDERED_MARKDOWN_CLASS_NAMES.listItem,
          dashListItemLines.has(line) ? 'tabs-dash-list-item' : undefined,
        )}
      >
        {renderMarkdownPreviewTags(children)}
      </li>
    )
  }
}

export function createMarkdownPreviewUnorderedList(markdown: string) {
  const dashListLines = new Set<number>()
  String(markdown ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .forEach((line, index) => {
      if (/^\s*-\s+(?!\[[ xX]\]\s)/.test(line)) dashListLines.add(index + 1)
    })

  return function MarkdownPreviewUnorderedList({
    node,
    className,
    children,
    ...props
  }: MarkdownUnorderedListProps) {
    const line = node?.position?.start?.line ?? 0
    return (
      <ul {...props} className={mergeClassNames(className, dashListLines.has(line) ? 'tabs-dash-list' : undefined)}>
        {children}
      </ul>
    )
  }
}

export function MarkdownPreviewInput({
  node,
  type,
  checked,
  disabled,
  ...props
}: MarkdownInputProps) {
  void node
  if (type !== 'checkbox') return <input {...props} type={type} checked={checked} disabled={disabled} />
  return <input {...props} type="checkbox" checked={Boolean(checked)} readOnly />
}

export function MarkdownPreviewLink({
  node,
  href,
  children,
  appState = null,
  onOpenNote,
  ...props
}: MarkdownLinkProps) {
  void node
  const kind = href && isPotentialMediaUrl(href) ? getMediaKindFromUrl(href) : null
  if (href && kind) {
    return <MediaPlayer src={href} kind={kind} label={getReactNodeText(children).trim()} />
  }
  const noteReference = href && appState && isPotentialInternalNoteHref(href)
    ? resolveMarkdownNoteReferenceDestination(appState, normalizePotentialInternalNoteHref(href), getReactNodeText(children), false)
    : null
  const noteTarget = noteReference?.target ?? null
  const externalUrl = href ? normalizeExternalWebUrl(href) : null

  return (
    <a
      {...props}
      href={href}
      className={mergeClassNames(props.className, RENDERED_MARKDOWN_CLASS_NAMES.link)}
      data-note-reference={noteTarget ? 'true' : undefined}
      target={externalUrl ? '_blank' : props.target}
      rel={externalUrl ? 'noopener noreferrer' : props.rel}
      onClick={noteTarget && onOpenNote ? (event) => {
        event.preventDefault()
        event.stopPropagation()
        onOpenNote(noteTarget)
      } : externalUrl ? (event) => {
        event.preventDefault()
        event.stopPropagation()
        openExternalWebUrl(externalUrl)
      } : props.onClick}
    >
      {children}
    </a>
  )
}
