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
import { resolveImageAssetDisplayUrl } from '../../markdown/image-asset-registry'
import { createNoteAisle } from '../../state/workspace'
import type { NoteAisle } from '../../types/app'

const AISLE_DRAG_MIME = 'application/x-tabs-aisle-id'

const transformAislePreviewUrl = (url: string, key: string) =>
  key === 'src' && (/^data:image\//i.test(url) || /^blob:/i.test(url) || /^tabs-asset:/i.test(url))
    ? resolveImageAssetDisplayUrl(url)
    : defaultUrlTransform(url)

const aislePreviewMarkdownComponents = {
  img: ({ node, ...props }: ImgHTMLAttributes<HTMLImageElement> & { node?: unknown }) => {
    void node
    return <img {...props} draggable={false} />
  },
}

type AisleEditModalProps = {
  open: boolean
  aisles: NoteAisle[]
  onCancel: () => void
  onApply: (aisles: NoteAisle[]) => void
  onWarn: (message: string) => void
}

export function AisleEditModal({
  open,
  aisles,
  onCancel,
  onApply,
  onWarn,
}: AisleEditModalProps) {
  const [draft, setDraft] = useState<NoteAisle[]>(() => createAisleEditDraft(aisles))
  const [draggingAisleId, setDraggingAisleId] = useState<string | null>(null)
  const [dropTargetAisleId, setDropTargetAisleId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setDraft(createAisleEditDraft(aisles))
    setDraggingAisleId(null)
    setDropTargetAisleId(null)
  }, [aisles, open])

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
                {canDelete && (
                  <button
                    type="button"
                    className="aisle-edit-delete-btn"
                    aria-label={`Delete aisle ${index + 1}`}
                    onClick={() => setDraft((previous) => deleteAisleFromDraft(previous, aisle.id))}
                  >
                    <span className="aisle-edit-delete-icon" aria-hidden="true" />
                  </button>
                )}
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
            <button type="button" className="btn btn-sm modal-primary-btn" onClick={() => onApply(draft)}>
              apply
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}
