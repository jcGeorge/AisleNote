import { Fragment, type ImgHTMLAttributes } from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  EMPTY_AISLE_PREVIEW_TEXT,
  getAislePreviewMarkdown,
} from '../../editor/aisle-edit-draft'
import { resolveAssetDisplayUrl } from '../../markdown/image-asset-registry'
import {
  NOTE_PREVIEW_REFERENCE_RE,
  getPreviewReferenceTokenLengthAt,
  parseMarkdownNoteReferenceToken,
} from '../../notes/note-references'
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

type AislePreviewSegment =
  | { type: 'markdown'; markdown: string }
  | { type: 'context-preview'; label: string }

export function getAislePreviewSegments(markdown: string): AislePreviewSegment[] {
  const previewMarkdown = getAislePreviewMarkdown(markdown)
  const segments: AislePreviewSegment[] = []
  let lastIndex = 0
  NOTE_PREVIEW_REFERENCE_RE.lastIndex = 0

  for (const match of previewMarkdown.matchAll(NOTE_PREVIEW_REFERENCE_RE)) {
    const parsed = getPreviewReferenceTokenLengthAt(match[0], 0) === match[0].length
      ? parseMarkdownNoteReferenceToken(match[0])
      : null
    if (!parsed?.embed) continue
    const start = match.index ?? 0
    const before = previewMarkdown.slice(lastIndex, start)
    if (before.trim()) segments.push({ type: 'markdown', markdown: before })

    const fallbackLabel = parsed.label
    segments.push({ type: 'context-preview', label: fallbackLabel || 'note preview' })
    lastIndex = start + match[0].length
  }

  NOTE_PREVIEW_REFERENCE_RE.lastIndex = 0
  const after = previewMarkdown.slice(lastIndex)
  if (after.trim()) segments.push({ type: 'markdown', markdown: after })
  return segments
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
    <div className={`${className} ${previewSegments.length <= 0 ? 'is-empty' : ''}`}>
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
