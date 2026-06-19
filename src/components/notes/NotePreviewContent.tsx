import * as React from 'react'
import type { AppState, NoteLocation } from '../../types/app'
import { getAislePreviewMarkdown } from '../../editor/aisle-edit-draft'
import { getLocationInfo } from '../../notes/note-locations'
import { getNotePreviewRenderMarkdown } from '../../notes/notebook-note-actions'
import { wouldCreatePreviewCycle } from '../../notes/note-references'
import { AppIcon } from '../icons/AppIcon'
import { ReadOnlyMarkdownViewer } from './ReadOnlyMarkdownViewer'

void React

const MAX_NOTE_PREVIEW_DEPTH = 3
const NOTE_PREVIEW_SIZE_ORDER = ['compact', 'normal', 'expanded'] as const
const NOTE_PREVIEW_MODE_ORDER = ['collapsed', ...NOTE_PREVIEW_SIZE_ORDER] as const
const NOTE_PREVIEW_RENAME_LONG_PRESS_MS = 500
const NOTE_PREVIEW_LONG_PRESS_MOVE_TOLERANCE_PX = 6

type NotePreviewSize = (typeof NOTE_PREVIEW_SIZE_ORDER)[number]
type NotePreviewMode = (typeof NOTE_PREVIEW_MODE_ORDER)[number]

function clampPreviewSizeIndex(index: number): number {
  return Math.min(NOTE_PREVIEW_MODE_ORDER.length - 1, Math.max(0, index))
}

function getNextPreviewMode(mode: NotePreviewMode, direction: -1 | 1): NotePreviewMode {
  const currentIndex = NOTE_PREVIEW_MODE_ORDER.indexOf(mode)
  return NOTE_PREVIEW_MODE_ORDER[clampPreviewSizeIndex(currentIndex + direction)]
}

function getPreviewSizeForMode(mode: NotePreviewMode): NotePreviewSize {
  return mode === 'collapsed' ? 'compact' : mode
}

function normalizePreviewLabelDraft(value: string, fallback: string): string {
  return value.replace(/\s+/g, ' ').trim() || fallback
}

function stopEditorMouseDown(event: React.MouseEvent) {
  event.preventDefault()
  event.stopPropagation()
}

export function NotePreviewContent({
  appState,
  target,
  currentNoteBodyId = '',
  depth = 0,
  onOpenNote,
  onDelete,
  label,
  aisleIds = [],
  onRenameLabel,
}: {
  appState: AppState
  target: NoteLocation
  currentNoteBodyId?: string
  depth?: number
  onOpenNote?: (target: NoteLocation) => void
  onDelete?: () => void
  label?: string
  aisleIds?: string[]
  onRenameLabel?: (label: string) => void
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
    : getNotePreviewRenderMarkdown(appState, target, currentNoteBodyId, aisleIds)
  const statusClass = preview.status === 'ok' ? '' : `is-${preview.status}`
  const [previewMode, setPreviewMode] = React.useState<NotePreviewMode>('normal')
  const [renamingLabel, setRenamingLabel] = React.useState(false)
  const [labelDraft, setLabelDraft] = React.useState('')
  const longPressRef = React.useRef<{
    pointerId: number
    startX: number
    startY: number
    timerId: number
  } | null>(null)
  const suppressNextClickRef = React.useRef(false)
  const skipNextLabelCommitRef = React.useRef(false)
  const previewSize = getPreviewSizeForMode(previewMode)
  const collapsed = previewMode === 'collapsed'
  const title = preview.title.trim() || 'note'
  const displayTitle = normalizePreviewLabelDraft(label ?? '', title)
  const canShrink = previewMode !== 'collapsed'
  const canGrow = previewMode !== 'expanded'
  const renderedMarkdown = getAislePreviewMarkdown(preview.markdown)

  const clearLabelLongPress = React.useCallback(() => {
    if (!longPressRef.current) return
    window.clearTimeout(longPressRef.current.timerId)
    longPressRef.current = null
  }, [])

  React.useEffect(() => clearLabelLongPress, [clearLabelLongPress])

  React.useEffect(() => {
    if (!renamingLabel) setLabelDraft(displayTitle)
  }, [displayTitle, renamingLabel])

  const startLabelRename = React.useCallback(() => {
    if (!onRenameLabel) return
    skipNextLabelCommitRef.current = false
    setLabelDraft(displayTitle)
    setRenamingLabel(true)
  }, [displayTitle, onRenameLabel])

  const commitLabelRename = React.useCallback(() => {
    if (skipNextLabelCommitRef.current) {
      skipNextLabelCommitRef.current = false
      return
    }
    const nextLabel = normalizePreviewLabelDraft(labelDraft, title)
    setRenamingLabel(false)
    setLabelDraft(nextLabel)
    if (nextLabel !== displayTitle) onRenameLabel?.(nextLabel)
  }, [displayTitle, labelDraft, onRenameLabel, title])

  const cancelLabelRename = React.useCallback(() => {
    skipNextLabelCommitRef.current = true
    setRenamingLabel(false)
    setLabelDraft(displayTitle)
  }, [displayTitle])

  const beginLabelLongPress = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (!onRenameLabel || renamingLabel || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
      return
    }
    clearLabelLongPress()
    const pointerId = event.pointerId
    const startX = event.clientX
    const startY = event.clientY
    const timerId = window.setTimeout(() => {
      longPressRef.current = null
      suppressNextClickRef.current = true
      startLabelRename()
    }, NOTE_PREVIEW_RENAME_LONG_PRESS_MS)
    longPressRef.current = {
      pointerId,
      startX,
      startY,
      timerId,
    }
  }

  const updateLabelLongPress = (event: React.PointerEvent<HTMLButtonElement>) => {
    const pending = longPressRef.current
    if (!pending || pending.pointerId !== event.pointerId) return
    const moved =
      Math.abs(event.clientX - pending.startX) > NOTE_PREVIEW_LONG_PRESS_MOVE_TOLERANCE_PX ||
      Math.abs(event.clientY - pending.startY) > NOTE_PREVIEW_LONG_PRESS_MOVE_TOLERANCE_PX
    if (moved) clearLabelLongPress()
  }

  const finishLabelLongPress = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (longPressRef.current?.pointerId === event.pointerId) clearLabelLongPress()
  }

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
          {renamingLabel && onRenameLabel ? (
            <input
              className="context-preview-title-input"
              value={labelDraft}
              autoFocus
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => setLabelDraft(event.target.value)}
              onBlur={commitLabelRename}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  event.currentTarget.blur()
                }
                if (event.key === 'Escape') {
                  event.preventDefault()
                  cancelLabelRename()
                }
              }}
              onMouseDown={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              aria-label={`Rename note preview label ${displayTitle}`}
            />
          ) : onOpenNote && preview.status !== 'missing' ? (
            <button
              type="button"
              className="context-preview-title-btn note-preview-title-btn"
              onMouseDown={(event) => event.stopPropagation()}
              onPointerDown={beginLabelLongPress}
              onPointerMove={updateLabelLongPress}
              onPointerUp={finishLabelLongPress}
              onPointerCancel={finishLabelLongPress}
              onPointerLeave={finishLabelLongPress}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                if (suppressNextClickRef.current) {
                  suppressNextClickRef.current = false
                  return
                }
                onOpenNote(target)
              }}
              title={onRenameLabel ? 'Open note. Press and hold to rename this preview label.' : 'Open note'}
            >
              {displayTitle}
            </button>
          ) : (
            <span className="context-preview-title-missing">{displayTitle}</span>
          )}
        </div>
        <div className="context-bar-actions" aria-label="Note preview controls">
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
              setPreviewMode((mode) => getNextPreviewMode(mode, -1))
            }}
          >
            <AppIcon iconId="minimize" className="context-bar-size-icon" />
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
              setPreviewMode((mode) => getNextPreviewMode(mode, 1))
            }}
          >
            <AppIcon iconId="maximize" className="context-bar-size-icon" />
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
          <ReadOnlyMarkdownViewer
            markdown={renderedMarkdown}
            appState={appState}
            onOpenNote={onOpenNote}
          />
        ) : (
          <p className="context-preview-navigation-status">
            {preview.status === 'missing' ? 'Missing note preview target.' : 'Preview blocked to avoid a cycle.'}
          </p>
        )}
      </div>
    </article>
  )
}
