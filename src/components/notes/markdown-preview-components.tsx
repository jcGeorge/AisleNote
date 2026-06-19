import * as React from 'react'
import {
  Children,
  cloneElement,
  isValidElement,
  type AnchorHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
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
  return (
    <p
      {...props}
      style={blockIndentStyle}
      className={mergeClassNames(
        className,
        RENDERED_MARKDOWN_CLASS_NAMES.paragraph,
        previewChildren.blockIndentLevel > 0 ? 'tabs-block-indent' : undefined,
      )}
    >
      {renderMarkdownPreviewTags(previewChildren.children)}
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
  children,
  ...props
}: MarkdownListItemProps) {
  void node
  return (
    <li {...props} className={mergeClassNames(props.className, RENDERED_MARKDOWN_CLASS_NAMES.listItem)}>
      {renderMarkdownPreviewTags(children)}
    </li>
  )
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
