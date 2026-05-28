import { Fragment, useCallback, useEffect, useRef, useState, type DragEvent, type ImgHTMLAttributes } from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  EMPTY_AISLE_PREVIEW_TEXT,
  addAisleToDraftOrWarn,
  canDeleteAisleFromDraft,
  createAisleEditDraft,
  deleteAisleFromDraft,
  getAislePreviewMarkdown,
  reorderAisleDraftByInsertion,
} from '../../editor/aisle-edit-draft'
import { getPlacementNeighborId } from '../../arrange/arrange-utils'
import { resolveAssetDisplayUrl } from '../../markdown/image-asset-registry'
import {
  NOTE_PREVIEW_REFERENCE_RE,
  getWikiReferenceDisplayText,
  parseWikiReferenceToken,
} from '../../notes/note-references'
import { createNoteAisle } from '../../state/workspace'
import type { ResolvedNoteAisle } from '../../types/app'
import { AisleHorizontalScrollbar } from './AisleHorizontalScrollbar'
import { getHorizontalDragAutoScrollDelta } from './aisle-horizontal-scroll'
import { MarkdownPreviewParagraph } from './markdown-preview-components'

const AISLE_DRAG_MIME = 'application/x-tabs-aisle-id'
const EMPTY_STAGED_DECOUPLE_IDS: string[] = []
const AISLE_EDIT_DRAG_AUTO_SCROLL_EDGE_ZONE = 72
const AISLE_EDIT_DRAG_AUTO_SCROLL_MAX_STEP = 8

type AisleDropTarget = {
  aisleId: string
  position: 'before' | 'after'
}

const transformAislePreviewUrl = (url: string, key: string) => {
  if (key === 'href' && /^tabs-asset:/i.test(url)) return url
  if (key === 'src' && (/^data:image\//i.test(url) || /^blob:/i.test(url) || /^tabs-asset:/i.test(url))) {
    return resolveAssetDisplayUrl(url)
  }
  return defaultUrlTransform(url)
}

const aislePreviewMarkdownComponents = {
  p: MarkdownPreviewParagraph,
  img: ({ node, ...props }: ImgHTMLAttributes<HTMLImageElement> & { node?: unknown }) => {
    void node
    return <img {...props} draggable={false} />
  },
}

type AislePreviewSegment =
  | { type: 'markdown'; markdown: string }
  | { type: 'context-preview'; label: string }

function getAislePreviewSegments(markdown: string): AislePreviewSegment[] {
  const previewMarkdown = getAislePreviewMarkdown(markdown)
  const segments: AislePreviewSegment[] = []
  let lastIndex = 0
  NOTE_PREVIEW_REFERENCE_RE.lastIndex = 0

  for (const match of previewMarkdown.matchAll(NOTE_PREVIEW_REFERENCE_RE)) {
    const start = match.index ?? 0
    const before = previewMarkdown.slice(lastIndex, start)
    if (before.trim()) segments.push({ type: 'markdown', markdown: before })

    const fallbackLabel = parseWikiReferenceToken(match[0])?.embed ? getWikiReferenceDisplayText(match[0]) : ''
    segments.push({ type: 'context-preview', label: fallbackLabel || 'note preview' })
    lastIndex = start + match[0].length
  }

  NOTE_PREVIEW_REFERENCE_RE.lastIndex = 0
  const after = previewMarkdown.slice(lastIndex)
  if (after.trim()) segments.push({ type: 'markdown', markdown: after })
  return segments
}

type AisleEditModalProps = {
  open: boolean
  aisles: ResolvedNoteAisle[]
  linkedAisleIds?: Set<string>
  initialStagedDecoupleAisleIds?: Iterable<string>
  getNotePreviewLabel?: unknown
  maxAisles?: number
  maxAislesWarningMessage?: string
  onCancel: () => void
  onApply: (aisles: ResolvedNoteAisle[], options?: { decoupleAisleIds?: string[]; activeAisleId?: string }) => void
  onWarn: (message: string) => void
}

export function AisleEditModal({
  open,
  aisles,
  linkedAisleIds = new Set(),
  initialStagedDecoupleAisleIds = EMPTY_STAGED_DECOUPLE_IDS,
  maxAisles,
  maxAislesWarningMessage,
  onCancel,
  onApply,
  onWarn,
}: AisleEditModalProps) {
  const [draft, setDraft] = useState<ResolvedNoteAisle[]>(() => createAisleEditDraft(aisles))
  const [draggingAisleId, setDraggingAisleId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<AisleDropTarget | null>(null)
  const [aisleListNode, setAisleListNode] = useState<HTMLDivElement | null>(null)
  const dragPointerXRef = useRef<number | null>(null)
  const [stagedDecoupleAisleIds, setStagedDecoupleAisleIds] = useState<Set<string>>(
    () => new Set(initialStagedDecoupleAisleIds),
  )

  const setAisleListRef = useCallback((node: HTMLDivElement | null) => {
    setAisleListNode((currentNode) => (currentNode === node ? currentNode : node))
  }, [])

  const clearDragState = useCallback(() => {
    dragPointerXRef.current = null
    setDraggingAisleId(null)
    setDropTarget(null)
  }, [])

  useEffect(() => {
    if (!open) return
    setDraft(createAisleEditDraft(aisles))
    clearDragState()
    setStagedDecoupleAisleIds(new Set(initialStagedDecoupleAisleIds))
  }, [aisles, clearDragState, initialStagedDecoupleAisleIds, open])

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      clearDragState()
      onCancel()
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [clearDragState, onCancel, open])

  useEffect(() => {
    if (!open || !draggingAisleId || !aisleListNode) return undefined

    let animationFrame: number | null = null
    let cancelled = false

    const step = () => {
      if (cancelled) return

      const pointerX = dragPointerXRef.current
      if (pointerX !== null) {
        const rect = aisleListNode.getBoundingClientRect()
        const maxScrollLeft = Math.max(0, aisleListNode.scrollWidth - aisleListNode.clientWidth)
        const delta = getHorizontalDragAutoScrollDelta({
          pointerX,
          containerLeft: rect.left,
          containerRight: rect.right,
          currentScrollLeft: aisleListNode.scrollLeft,
          maxScrollLeft,
          edgeZoneWidth: AISLE_EDIT_DRAG_AUTO_SCROLL_EDGE_ZONE,
          maxStep: AISLE_EDIT_DRAG_AUTO_SCROLL_MAX_STEP,
        })

        if (delta !== 0) {
          aisleListNode.scrollLeft = Math.min(Math.max(aisleListNode.scrollLeft + delta, 0), maxScrollLeft)
        }
      }

      animationFrame = window.requestAnimationFrame(step)
    }

    animationFrame = window.requestAnimationFrame(step)

    return () => {
      cancelled = true
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame)
      }
    }
  }, [aisleListNode, draggingAisleId, open])

  useEffect(() => {
    if (!open || !draggingAisleId) return undefined

    const handleDocumentDragOver = (event: globalThis.DragEvent) => {
      dragPointerXRef.current = event.clientX
    }

    document.addEventListener('dragover', handleDocumentDragOver, true)
    return () => document.removeEventListener('dragover', handleDocumentDragOver, true)
  }, [draggingAisleId, open])

  if (!open) return null

  const canDelete = canDeleteAisleFromDraft(draft)
  const dropNeighborAisleId = getPlacementNeighborId(
    draft.map((aisle) => aisle.id),
    dropTarget?.aisleId,
    dropTarget?.position,
    draggingAisleId,
  )

  const getDraggedAisleId = (event: DragEvent) =>
    event.dataTransfer.getData(AISLE_DRAG_MIME) || event.dataTransfer.getData('text/plain')

  const handleDrop = (event: DragEvent, targetAisleId: string) => {
    event.preventDefault()
    const draggedAisleId = getDraggedAisleId(event)
    const target = dropTarget?.aisleId === targetAisleId ? dropTarget : getAisleDropTarget(event, targetAisleId)
    clearDragState()
    if (!draggedAisleId || draggedAisleId === targetAisleId) return
    const fromIndex = draft.findIndex((aisle) => aisle.id === draggedAisleId)
    const toIndex = draft.findIndex((aisle) => aisle.id === target.aisleId)
    setDraft((previous) => reorderAisleDraftByInsertion(previous, fromIndex, toIndex, target.position))
  }

  const getAisleDropTarget = (event: DragEvent, targetAisleId: string): AisleDropTarget => {
    const targetElement = event.currentTarget as HTMLElement
    const rect = targetElement.getBoundingClientRect()
    const position = event.clientX < rect.left + rect.width / 2 ? 'before' : 'after'
    return { aisleId: targetAisleId, position }
  }

  const updateDropTarget = (event: DragEvent, targetAisleId: string) => {
    if (draggingAisleId === targetAisleId) {
      setDropTarget(null)
      return
    }
    const nextTarget = getAisleDropTarget(event, targetAisleId)
    setDropTarget((previous) =>
      previous?.aisleId === nextTarget.aisleId && previous.position === nextTarget.position ? previous : nextTarget,
    )
  }

  const stageDecoupleAisle = (aisleId: string) => {
    setStagedDecoupleAisleIds((previous) => new Set([...previous, aisleId]))
  }

  const undoStagedDecoupleAisle = (aisleId: string) => {
    setStagedDecoupleAisleIds((previous) => {
      const next = new Set(previous)
      next.delete(aisleId)
      return next
    })
  }

  const deleteAisle = (aisleId: string) => {
    setDraft((previous) => deleteAisleFromDraft(previous, aisleId))
    undoStagedDecoupleAisle(aisleId)
  }

  return (
    <div className="aisle-edit-modal-backdrop">
      <section
        className="aisle-edit-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Edit aisles"
      >
        <div className="aisle-edit-scroll-shell">
          <div
            ref={setAisleListRef}
            className="aisle-edit-list"
            aria-label="Aisles"
            onDragOver={(event) => {
              if (draggingAisleId) {
                dragPointerXRef.current = event.clientX
              }
            }}
          >
            {draft.map((aisle, index) => {
              const previewSegments = getAislePreviewSegments(aisle.markdown)
              const linked = linkedAisleIds.has(aisle.id)
              const stagedDecouple = stagedDecoupleAisleIds.has(aisle.id)
              return (
                <article
                  key={aisle.id}
                  className={`aisle-edit-card ${draggingAisleId === aisle.id ? 'is-dragging' : ''} ${
                    dropTarget?.aisleId === aisle.id ? `is-drop-target-${dropTarget.position}` : ''
                  } ${
                    dropNeighborAisleId === aisle.id && dropTarget?.position === 'after'
                      ? 'is-drop-neighbor-before'
                      : ''
                  } ${
                    dropNeighborAisleId === aisle.id && dropTarget?.position === 'before'
                      ? 'is-drop-neighbor-after'
                      : ''
                  }`}
                  draggable
                  onDragStart={(event) => {
                    setDraggingAisleId(aisle.id)
                    dragPointerXRef.current = event.clientX
                    event.dataTransfer.effectAllowed = 'move'
                    event.dataTransfer.setData(AISLE_DRAG_MIME, aisle.id)
                    event.dataTransfer.setData('text/plain', aisle.id)
                  }}
                  onDragEnd={clearDragState}
                  onDragEnter={(event) => updateDropTarget(event, aisle.id)}
                  onDragOver={(event) => {
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                    updateDropTarget(event, aisle.id)
                  }}
                  onDrop={(event) => handleDrop(event, aisle.id)}
                  aria-label={`Aisle preview ${index + 1}`}
                >
                  <div className={`aisle-edit-preview ${previewSegments.length <= 0 ? 'is-empty' : ''}`}>
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
                  <div className="aisle-edit-card-controls">
                    <div className="aisle-edit-card-status">
                      {stagedDecouple ? (
                        <span className="aisle-edit-status-badge is-staged">will de-couple</span>
                      ) : linked ? (
                        <span className="aisle-edit-status-badge">linked</span>
                      ) : null}
                    </div>
                    <div className="aisle-edit-card-actions">
                      {stagedDecouple ? (
                        <button
                          type="button"
                          className="aisle-edit-link-action"
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            undoStagedDecoupleAisle(aisle.id)
                          }}
                        >
                          undo
                        </button>
                      ) : linked ? (
                        <button
                          type="button"
                          className="aisle-edit-link-action"
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            stageDecoupleAisle(aisle.id)
                          }}
                        >
                          de-couple
                        </button>
                      ) : null}
                      {canDelete && (
                        <button
                          type="button"
                          className="aisle-edit-delete-btn"
                          aria-label={`Delete aisle ${index + 1}`}
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            deleteAisle(aisle.id)
                          }}
                        >
                          <span className="aisle-edit-delete-icon" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
          <AisleHorizontalScrollbar
            scrollNode={aisleListNode}
            aisleCount={draft.length}
            rootClassName="aisle-edit-horizontal-scrollbar"
            ariaLabel="Scroll edit aisles horizontally"
          />
        </div>
        <footer className="aisle-edit-modal-actions">
          <button type="button" className="btn btn-sm btn-outline-light modal-cancel-btn" onClick={onCancel}>
            cancel
          </button>
          <div className="aisle-edit-modal-primary-actions">
            <button
              type="button"
              className="btn btn-sm btn-outline-light modal-cancel-btn"
              onClick={() =>
                setDraft((previous) =>
                  addAisleToDraftOrWarn(previous, createNoteAisle(), onWarn, maxAisles, maxAislesWarningMessage),
                )
              }
            >
              add aisle
            </button>
            <button
              type="button"
              className="btn btn-sm modal-primary-btn"
              onClick={() => onApply(draft, { decoupleAisleIds: Array.from(stagedDecoupleAisleIds) })}
            >
              apply
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}
