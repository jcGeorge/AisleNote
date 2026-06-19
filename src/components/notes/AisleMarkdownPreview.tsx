import * as React from 'react'
import { Fragment, useMemo, type ImgHTMLAttributes } from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  EMPTY_AISLE_PREVIEW_TEXT,
  getAislePreviewMarkdown,
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
  MarkdownPreviewInput,
  MarkdownPreviewLink,
  MarkdownPreviewListItem,
  MarkdownPreviewParagraph,
  createMarkdownPreviewListItem,
  createMarkdownPreviewUnorderedList,
} from './markdown-preview-components'
import { getAislePreviewSegments } from './aisle-markdown-preview-segments'
import { NotePreviewContent } from './NotePreviewContent'
import type { AppState, NoteLocation } from '../../types/app'

void React

const transformAislePreviewUrl = (url: string, key: string) => {
  if (key === 'href' && /^tabs-asset:/i.test(url)) return url
  if (key === 'src' && (/^data:image\//i.test(url) || /^blob:/i.test(url) || /^tabs-asset:/i.test(url))) {
    return resolveAssetDisplayUrl(url)
  }
  return defaultUrlTransform(url)
}

const aislePreviewMarkdownComponents = {
  h1: MarkdownPreviewHeading1,
  h2: MarkdownPreviewHeading2,
  h3: MarkdownPreviewHeading3,
  h4: MarkdownPreviewHeading4,
  h5: MarkdownPreviewHeading5,
  h6: MarkdownPreviewHeading6,
  input: MarkdownPreviewInput,
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
  appState?: AppState | null
  currentNoteBodyId?: string
  previewDepth?: number
  onOpenNote?: (target: NoteLocation) => void
}

export function AisleMarkdownPreview({
  markdown,
  className = 'aisle-edit-preview',
  appState = null,
  currentNoteBodyId = '',
  previewDepth = 0,
  onOpenNote,
}: AisleMarkdownPreviewProps) {
  const previewMarkdown = getAislePreviewMarkdown(markdown)
  const previewSegments = getAislePreviewSegments(previewMarkdown, appState)
  const markdownComponents = useMemo(
    () => ({
      ...aislePreviewMarkdownComponents,
      li: createMarkdownPreviewListItem(previewMarkdown),
      ul: createMarkdownPreviewUnorderedList(previewMarkdown),
      a: (props: React.ComponentProps<typeof MarkdownPreviewLink>) => (
        <MarkdownPreviewLink {...props} appState={appState} onOpenNote={onOpenNote} />
      ),
    }),
    [appState, onOpenNote, previewMarkdown],
  )

  return (
    <div className={`${className} ${RENDERED_MARKDOWN_SURFACE_CLASS} ${previewSegments.length <= 0 ? 'is-empty' : ''}`}>
      {previewSegments.length > 0 ? (
        previewSegments.map((segment, segmentIndex) => (
          <Fragment key={`${segment.type}-${segmentIndex}`}>
            {segment.type === 'markdown' ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                urlTransform={transformAislePreviewUrl}
                components={markdownComponents}
              >
                {segment.markdown}
              </ReactMarkdown>
            ) : appState ? (
              <NotePreviewContent
                appState={appState}
                target={segment.payload.target}
                currentNoteBodyId={currentNoteBodyId}
                depth={previewDepth + 1}
                label={segment.label}
                aisleIds={segment.payload.aisleIds}
                onOpenNote={onOpenNote}
              />
            ) : (
              null
            )}
          </Fragment>
        ))
      ) : (
        <p>{EMPTY_AISLE_PREVIEW_TEXT}</p>
      )}
    </div>
  )
}
