import { Children, isValidElement, type AnchorHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react'
import { BLOCK_INDENT_TOKEN } from '../../markdown/markdown-utils'
import { MediaPlayer } from '../../media/MediaPlayer'
import { getMediaKindFromUrl } from '../../media/media-utils'

type MarkdownParagraphProps = HTMLAttributes<HTMLParagraphElement> & {
  node?: unknown
  children?: ReactNode
}

type MarkdownLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  node?: unknown
  children?: ReactNode
}

function mergeClassNames(...classNames: Array<string | undefined>) {
  return classNames.filter(Boolean).join(' ') || undefined
}

function stripBlockIndentTokenFromPreviewChildren(children: ReactNode): {
  blockIndented: boolean
  children: ReactNode
} {
  const childArray = Children.toArray(children)
  const firstChild = childArray[0]
  if (typeof firstChild !== 'string' || !firstChild.startsWith(BLOCK_INDENT_TOKEN)) {
    return { blockIndented: false, children }
  }

  return {
    blockIndented: true,
    children: [firstChild.slice(BLOCK_INDENT_TOKEN.length), ...childArray.slice(1)],
  }
}

function getReactNodeText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (!node) return ''
  if (Array.isArray(node)) return node.map(getReactNodeText).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return getReactNodeText(node.props.children)
  return ''
}

export function MarkdownPreviewParagraph({
  node,
  className,
  children,
  ...props
}: MarkdownParagraphProps) {
  void node
  const previewChildren = stripBlockIndentTokenFromPreviewChildren(children)
  return (
    <p
      {...props}
      className={mergeClassNames(className, previewChildren.blockIndented ? 'tabs-block-indent' : undefined)}
    >
      {previewChildren.children}
    </p>
  )
}

export function MarkdownPreviewLink({
  node,
  href,
  children,
  ...props
}: MarkdownLinkProps) {
  void node
  const kind = href ? getMediaKindFromUrl(href) : null
  if (href && kind) {
    return <MediaPlayer src={href} kind={kind} label={getReactNodeText(children).trim()} />
  }

  return (
    <a {...props} href={href}>
      {children}
    </a>
  )
}
