import { Fragment, type ImgHTMLAttributes } from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  EMPTY_AISLE_PREVIEW_TEXT,
} from '../../editor/aisle-edit-draft'
import { RENDERED_MARKDOWN_SURFACE_CLASS } from '../../editor/rendered-markdown-surface'
import { resolveAssetDisplayUrl } from '../../markdown/image-asset-registry'
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
} from './markdown-preview-components'
import { getAislePreviewSegments } from './aisle-markdown-preview-segments'

const transformAislePreviewUrl = (url: string, key: string) => {
  if (key === 'href' && /^tabs-asset:/i.test(url)) return url
  if (key === 'src' && (/^data:image\//i.test(url) || /^blob:/i.test(url) || /^tabs-asset:/i.test(url))) {
    return resolveAssetDisplayUrl(url)
  }
  return defaultUrlTransform(url)
}

const aislePreviewMarkdownComponents = {
  a: MarkdownPreviewLink,
  h1: MarkdownPreviewHeading1,
  h2: MarkdownPreviewHeading2,
  h3: MarkdownPreviewHeading3,
  h4: MarkdownPreviewHeading4,
  h5: MarkdownPreviewHeading5,
  h6: MarkdownPreviewHeading6,
  li: MarkdownPreviewListItem,
  p: MarkdownPreviewParagraph,
  img: ({ node, ...props }: ImgHTMLAttributes<HTMLImageElement> & { node?: unknown }) => {
    void node
    return <img {...props} draggable={false} />
  },
}

type AisleMarkdownPreviewProps = {
  markdown: string
  className?: string
}

export function AisleMarkdownPreview({
  markdown,
  className = 'aisle-edit-preview',
}: AisleMarkdownPreviewProps) {
  const previewSegments = getAislePreviewSegments(markdown)

  return (
    <div className={`${className} ${RENDERED_MARKDOWN_SURFACE_CLASS} ${previewSegments.length <= 0 ? 'is-empty' : ''}`}>
      {previewSegments.length > 0 ? (
        previewSegments.map((segment, segmentIndex) => (
          <Fragment key={`${segment.type}-${segmentIndex}`}>
            {segment.type === 'markdown' ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                urlTransform={transformAislePreviewUrl}
                components={aislePreviewMarkdownComponents}
              >
                {segment.markdown}
              </ReactMarkdown>
            ) : (
              <div className="aisle-edit-context-preview">
                <span className="aisle-edit-context-preview-label">note preview</span>
                <span className="aisle-edit-context-preview-title">{segment.label}</span>
              </div>
            )}
          </Fragment>
        ))
      ) : (
        <p>{EMPTY_AISLE_PREVIEW_TEXT}</p>
      )}
    </div>
  )
}
