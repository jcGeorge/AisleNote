import { Children, type HTMLAttributes, type ReactNode } from 'react'
import { BLOCK_INDENT_TOKEN } from '../../markdown/markdown-utils'

type MarkdownParagraphProps = HTMLAttributes<HTMLParagraphElement> & {
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
