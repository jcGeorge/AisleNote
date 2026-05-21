import { useEffect, useState, type DragEvent, type ImgHTMLAttributes } from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  EMPTY_AISLE_PREVIEW_TEXT,
  addAisleToDraftOrWarn,
  canDeleteAisleFromDraft,
  createAisleEditDraft,
  deleteAisleFromDraft,
  getAislePreviewMarkdown,
  reorderAisleDraft,
} from '../../editor/aisle-edit-draft'
import { resolveAssetDisplayUrl } from '../../markdown/image-asset-registry'
import { createNoteAisle } from '../../state/workspace'
import type { NoteAisle } from '../../types/app'
import { MarkdownPreviewParagraph } from './markdown-preview-components'

const AISLE_DRAG_MIME = 'application/x-tabs-aisle-id'
const EMPTY_STAGED_DECOUPLE_IDS: string[] = []

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

type AisleEditModalProps = {
  open: boolean
  aisles: NoteAisle[]
  linkedAisleIds?: Set<string>
  initialStagedDecoupleAisleIds?: Iterable<string>
  onCancel: () => void
  onApply: (aisles: NoteAisle[], options?: { decoupleAisleIds?: string[] }) => void
  onWarn: (message: string) => void
}

export function AisleEditModal({
  open,
  aisles,
  linkedAisleIds = new Set(),
  initialStagedDecoupleAisleIds = EMPTY_STAGED_DECOUPLE_IDS,
  onCancel,
  onApply,
  onWarn,
}: AisleEditModalProps) {
  const [draft, setDraft] = useState<NoteAisle[]>(() => createAisleEditDraft(aisles))
  const [draggingAisleId, setDraggingAisleId] = useState<string | null>(null)
  const [dropTargetAisleId, setDropTargetAisleId] = useState<string | null>(null)
  const [stagedDecoupleAisleIds, setStagedDecoupleAisleIds] = useState<Set<string>>(
    () => new Set(initialStagedDecoupleAisleIds),
  )

  useEffect(() => {
    if (!open) return
    setDraft(createAisleEditDraft(aisles))
    setDraggingAisleId(null)
    setDropTargetAisleId(null)
    setStagedDecoupleAisleIds(new Set(initialStagedDecoupleAisleIds))
  }, [aisles, initialStagedDecoupleAisleIds, open])

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onCancel()
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [onCancel, open])

  if (!open) return null

  const canDelete = canDeleteAisleFromDraft(draft)

  const getDraggedAisleId = (event: DragEvent) =>
    event.dataTransfer.getData(AISLE_DRAG_MIME) || event.dataTransfer.getData('text/plain')

  const handleDrop = (event: DragEvent, targetAisleId: string) => {
    event.preventDefault()
    const draggedAisleId = getDraggedAisleId(event)
    setDraggingAisleId(null)
    setDropTargetAisleId(null)
    if (!draggedAisleId || draggedAisleId === targetAisleId) return
    const fromIndex = draft.findIndex((aisle) => aisle.id === draggedAisleId)
    const toIndex = draft.findIndex((aisle) => aisle.id === targetAisleId)
    setDraft((previous) => reorderAisleDraft(previous, fromIndex, toIndex))
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
        <div className="aisle-edit-list" aria-label="Aisles">
          {draft.map((aisle, index) => {
            const previewMarkdown = getAislePreviewMarkdown(aisle.markdown)
            const linked = linkedAisleIds.has(aisle.id)
            const stagedDecouple = stagedDecoupleAisleIds.has(aisle.id)
            return (
              <article
                key={aisle.id}
                className={`aisle-edit-card ${draggingAisleId === aisle.id ? 'is-dragging' : ''} ${
                  dropTargetAisleId === aisle.id ? 'is-drop-target' : ''
                }`}
                draggable
                onDragStart={(event) => {
                  setDraggingAisleId(aisle.id)
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData(AISLE_DRAG_MIME, aisle.id)
                  event.dataTransfer.setData('text/plain', aisle.id)
                }}
                onDragEnd={() => {
                  setDraggingAisleId(null)
                  setDropTargetAisleId(null)
                }}
                onDragEnter={() => setDropTargetAisleId(aisle.id)}
                onDragOver={(event) => {
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                  setDropTargetAisleId(aisle.id)
                }}
                onDrop={(event) => handleDrop(event, aisle.id)}
                aria-label={`Aisle preview ${index + 1}`}
              >
                <div className={`aisle-edit-preview ${previewMarkdown.trim().length <= 0 ? 'is-empty' : ''}`}>
                  {previewMarkdown.trim().length > 0 ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      urlTransform={transformAislePreviewUrl}
                      components={aislePreviewMarkdownComponents}
                    >
                      {previewMarkdown}
                    </ReactMarkdown>
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
        <footer className="aisle-edit-modal-actions">
          <button type="button" className="btn btn-sm btn-outline-light modal-cancel-btn" onClick={onCancel}>
            cancel
          </button>
          <div className="aisle-edit-modal-primary-actions">
            <button
              type="button"
              className="btn btn-sm btn-outline-light modal-cancel-btn"
              onClick={() => setDraft((previous) => addAisleToDraftOrWarn(previous, createNoteAisle(), onWarn))}
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
