import * as React from 'react'
import type { ImgHTMLAttributes } from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { AppState, NoteLocation } from '../../types/app'
import { getLocationInfo } from '../../notes/note-locations'
import { getNotePreviewRenderMarkdown } from '../../notes/notebook-note-actions'
import { wouldCreatePreviewCycle } from '../../notes/note-references'
import { RENDERED_MARKDOWN_SURFACE_CLASS } from '../../editor/rendered-markdown-surface'
import { resolveAssetDisplayUrl } from '../../markdown/image-asset-registry'
import { normalizeEscapedMarkdownLinks } from '../../markdown/markdown-utils'
import { AppIcon } from '../icons/AppIcon'
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

void React

const MAX_NOTE_PREVIEW_DEPTH = 3
const NOTE_PREVIEW_SIZE_ORDER = ['compact', 'normal', 'expanded'] as const

type NotePreviewSize = (typeof NOTE_PREVIEW_SIZE_ORDER)[number]

function clampPreviewSizeIndex(index: number): number {
  return Math.min(NOTE_PREVIEW_SIZE_ORDER.length - 1, Math.max(0, index))
}

function getNextPreviewSize(size: NotePreviewSize, direction: -1 | 1): NotePreviewSize {
  const currentIndex = NOTE_PREVIEW_SIZE_ORDER.indexOf(size)
  return NOTE_PREVIEW_SIZE_ORDER[clampPreviewSizeIndex(currentIndex + direction)]
}

function stopEditorMouseDown(event: React.MouseEvent) {
  event.preventDefault()
  event.stopPropagation()
}

const transformNotePreviewUrl = (url: string, key: string) => {
  if (key === 'href' && /^tabs-asset:/i.test(url)) return url
  if (key === 'src' && (/^data:image\//i.test(url) || /^blob:/i.test(url) || /^tabs-asset:/i.test(url))) {
    return resolveAssetDisplayUrl(url)
  }
  return defaultUrlTransform(url)
}

const notePreviewMarkdownComponents = {
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

export function NotePreviewContent({
  appState,
  target,
  currentNoteBodyId = '',
  depth = 0,
  onOpenNote,
  onDelete,
}: {
  appState: AppState
  target: NoteLocation
  currentNoteBodyId?: string
  depth?: number
  onOpenNote?: (target: NoteLocation) => void
  onDelete?: () => void
}) {
  const info = getLocationInfo(appState, target)
  const blocked =
    depth >= MAX_NOTE_PREVIEW_DEPTH ||
    (currentNoteBodyId && info.noteBodyId && wouldCreatePreviewCycle(appState, info.noteBodyId, currentNoteBodyId))
  const preview = blocked
    ? {
        status: 'blocked' as const,
        title: info.title,
        breadcrumb: info.note ? info.title : '',
        markdown: '',
      }
    : getNotePreviewRenderMarkdown(appState, target, currentNoteBodyId)
  const statusClass = preview.status === 'ok' ? '' : `is-${preview.status}`
  const [previewSize, setPreviewSize] = React.useState<NotePreviewSize>('normal')
  const [collapsed, setCollapsed] = React.useState(false)
  const breadcrumb = preview.breadcrumb.trim()
  const title = preview.title.trim()
  const showBreadcrumb = Boolean(breadcrumb && (preview.status !== 'ok' || breadcrumb !== title))
  const canShrink = previewSize !== 'compact'
  const canGrow = previewSize !== 'expanded'

  return (
    <article
      className={`note-context-widget note-preview-widget is-size-${previewSize} ${collapsed ? 'is-collapsed' : ''} ${statusClass}`.trim()}
      data-note-preview-note-id={target.noteId}
      data-note-preview-size={previewSize}
      contentEditable={false}
      suppressContentEditableWarning
    >
      <div className="context-bar-top">
        <div className="context-bar-title">
          {onOpenNote && preview.status !== 'missing' ? (
            <button type="button" className="context-preview-title-btn" onClick={() => onOpenNote(target)}>
              {preview.title}
            </button>
          ) : (
            <span className="context-preview-title-missing">{preview.title}</span>
          )}
        </div>
        {showBreadcrumb ? <span className="context-preview-navigation-status">{preview.breadcrumb}</span> : null}
        <div className="context-bar-actions" aria-label="Note preview controls">
          <div className="context-bar-size-control" aria-label="Note preview size">
            <button
              type="button"
              className="context-bar-icon-btn context-preview-size-btn"
              aria-label="Make note preview smaller"
              title="Make note preview smaller"
              disabled={!canShrink}
              onMouseDown={stopEditorMouseDown}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                setPreviewSize((size) => getNextPreviewSize(size, -1))
              }}
            >
              <AppIcon iconId="minus" className="context-bar-size-icon" />
            </button>
            <button
              type="button"
              className="context-bar-icon-btn context-preview-size-btn"
              aria-label="Make note preview larger"
              title="Make note preview larger"
              disabled={!canGrow}
              onMouseDown={stopEditorMouseDown}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                setPreviewSize((size) => getNextPreviewSize(size, 1))
              }}
            >
              <AppIcon iconId="plus" className="context-bar-size-icon" />
            </button>
          </div>
          <button
            type="button"
            className="context-bar-icon-btn context-preview-collapse-btn"
            aria-label={collapsed ? 'Expand note preview' : 'Collapse note preview'}
            title={collapsed ? 'Expand note preview' : 'Collapse note preview'}
            aria-expanded={!collapsed}
            onMouseDown={stopEditorMouseDown}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              setCollapsed((current) => !current)
            }}
          >
            <AppIcon iconId={collapsed ? 'maximize' : 'minimize'} className="context-bar-size-icon" />
          </button>
          {onDelete ? (
            <button
              type="button"
              className="context-bar-icon-btn context-bar-delete-btn context-preview-delete-btn"
              aria-label="Delete note preview"
              title="Delete note preview"
              onMouseDown={stopEditorMouseDown}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onDelete()
              }}
            >
              <AppIcon iconId="trash" className="context-bar-delete-icon" />
            </button>
          ) : null}
        </div>
      </div>
      <div className="context-bar-lower" hidden={collapsed}>
        {preview.status === 'ok' ? (
          <div className={`context-preview-editor-host ${RENDERED_MARKDOWN_SURFACE_CLASS}`}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              urlTransform={transformNotePreviewUrl}
              components={notePreviewMarkdownComponents}
            >
              {normalizeEscapedMarkdownLinks(preview.markdown)}
            </ReactMarkdown>
          </div>
        ) : (
          <p className="context-preview-navigation-status">
            {preview.status === 'missing' ? 'Missing note preview target.' : 'Preview blocked to avoid a cycle.'}
          </p>
        )}
      </div>
    </article>
  )
}
