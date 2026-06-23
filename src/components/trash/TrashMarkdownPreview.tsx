import * as React from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { RENDERED_MARKDOWN_SURFACE_CLASS } from '../../editor/rendered-markdown-surface'
import { resolveAssetDisplayUrl } from '../../markdown/image-asset-registry'
import { normalizeEscapedMarkdownLinks } from '../../markdown/markdown-utils'
import {
  MarkdownPreviewHeading1,
  MarkdownPreviewHeading2,
  MarkdownPreviewHeading3,
  MarkdownPreviewHeading4,
  MarkdownPreviewHeading5,
  MarkdownPreviewHeading6,
  MarkdownPreviewLink,
  MarkdownPreviewListItem,
  MarkdownPreviewParagraph,
} from '../notes/markdown-preview-components'

void React

type TrashMarkdownPreviewProps = {
  markdown: string
}

const trashMarkdownPreviewComponents = {
  a: MarkdownPreviewLink,
  h1: MarkdownPreviewHeading1,
  h2: MarkdownPreviewHeading2,
  h3: MarkdownPreviewHeading3,
  h4: MarkdownPreviewHeading4,
  h5: MarkdownPreviewHeading5,
  h6: MarkdownPreviewHeading6,
  li: MarkdownPreviewListItem,
  p: MarkdownPreviewParagraph,
}

const transformTrashPreviewUrl = (url: string, key: string) => {
  if (key === 'href' && /^aislenote-asset:/i.test(url)) return url
  if (key === 'src' && (/^data:image\//i.test(url) || /^blob:/i.test(url) || /^aislenote-asset:/i.test(url))) {
    return resolveAssetDisplayUrl(url)
  }
  return defaultUrlTransform(url)
}

export function TrashMarkdownPreview({ markdown }: TrashMarkdownPreviewProps) {
  return (
    <section className="editor-shell trash-markdown-preview-shell" aria-label="Trash note preview">
      <div
        className={`aisle-editor-preview-fallback trash-markdown-preview ${RENDERED_MARKDOWN_SURFACE_CLASS}`}
        data-trash-markdown-preview="true"
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={trashMarkdownPreviewComponents}
          urlTransform={transformTrashPreviewUrl}
        >
          {normalizeEscapedMarkdownLinks(markdown)}
        </ReactMarkdown>
      </div>
    </section>
  )
}
