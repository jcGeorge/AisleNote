import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import {
  addAisleToDraftOrWarn,
  canDeleteAisleFromDraft,
  createAisleEditDraft,
  deleteAisleFromDraft,
  reorderAisleDraftByInsertion,
} from '../../editor/aisle-edit-draft'
import { createRandomId } from '../../state/navigation-ids'
import type { ResolvedNoteAisle } from '../../types/app'
import { DecoupleCautionStripe } from '../decouple/DecoupleCautionStripe'
import { ToolbarToolIcon } from '../editor/ToolbarToolIcon'
import { AppIcon } from '../icons/AppIcon'
import { AisleMarkdownPreview } from './AisleMarkdownPreview'
import { AisleHorizontalScrollbar } from './AisleHorizontalScrollbar'
import { getHorizontalDragAutoScrollDelta } from './aisle-horizontal-scroll'

const AISLE_DRAG_MIME = 'application/x-tabs-aisle-id'
const EMPTY_STAGED_DECOUPLE_IDS: string[] = []
const EMPTY_STAGED_FRONTMATTER_IDS: string[] = []
const AISLE_EDIT_DRAG_AUTO_SCROLL_EDGE_ZONE = 72
const AISLE_EDIT_DRAG_AUTO_SCROLL_MAX_STEP = 8

function createDraftAisle() {
  const aisleBodyId = createRandomId()
  return {
    id: createRandomId(),
    aisleBodyId,
  }
}

type AisleDropTarget = {
  aisleId: string
  position: 'before' | 'after'
}

function getPlacementNeighborId(
  itemIds: readonly string[],
  targetId: string | null | undefined,
  position: AisleDropTarget['position'] | null | undefined,
  sourceId: string | null | undefined = null,
) {
  void sourceId
  if (!targetId || !position) return null
  const orderedIds = itemIds.filter(Boolean)
  const targetIndex = orderedIds.indexOf(targetId)
  if (targetIndex < 0) return null
  return position === 'before' ? (orderedIds[targetIndex - 1] ?? null) : (orderedIds[targetIndex + 1] ?? null)
}

type AisleEditModalProps = {
  open: boolean
  aisles: ResolvedNoteAisle[]
  linkedAisleIds?: Set<string>
  frontmatterAisleIds?: Set<string>
  initialStagedDecoupleAisleIds?: Iterable<string>
  initialStagedRemoveFrontmatterAisleIds?: Iterable<string>
  getNotePreviewLabel?: unknown
  maxAisles?: number
  maxAislesWarningMessage?: string
  reclaimEmptyAisleAtLimit?: boolean
  onCancel: () => void
  onApply: (
    aisles: ResolvedNoteAisle[],
    options?: { decoupleAisleIds?: string[]; removeFrontmatterAisleIds?: string[]; activeAisleId?: string },
  ) => void
  onWarn: (message: string) => void
}

export function AisleEditModal({
  open,
  aisles,
  linkedAisleIds = new Set(),
  frontmatterAisleIds = new Set(),
  initialStagedDecoupleAisleIds = EMPTY_STAGED_DECOUPLE_IDS,
  initialStagedRemoveFrontmatterAisleIds = EMPTY_STAGED_FRONTMATTER_IDS,
  maxAisles,
  maxAislesWarningMessage,
  reclaimEmptyAisleAtLimit = false,
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
  const [stagedRemoveFrontmatterAisleIds, setStagedRemoveFrontmatterAisleIds] = useState<Set<string>>(
    () => new Set(initialStagedRemoveFrontmatterAisleIds),
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
    setStagedRemoveFrontmatterAisleIds(new Set(initialStagedRemoveFrontmatterAisleIds))
  }, [aisles, clearDragState, initialStagedDecoupleAisleIds, initialStagedRemoveFrontmatterAisleIds, open])

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
    const nextTarget = getAisleDropTarget(event, targetAisleId)
    setDropTarget((previous) =>
      previous?.aisleId === nextTarget.aisleId && previous.position === nextTarget.position ? previous : nextTarget,
    )
  }

  const toggleStagedDecoupleAisle = (aisleId: string) => {
    setStagedDecoupleAisleIds((previous) => {
      const next = new Set(previous)
      if (next.has(aisleId)) {
        next.delete(aisleId)
      } else {
        next.add(aisleId)
      }
      return next
    })
  }

  const undoStagedDecoupleAisle = (aisleId: string) => {
    setStagedDecoupleAisleIds((previous) => {
      if (!previous.has(aisleId)) return previous
      const next = new Set(previous)
      next.delete(aisleId)
      return next
    })
  }

  const toggleStagedRemoveFrontmatterAisle = (aisleId: string) => {
    setStagedRemoveFrontmatterAisleIds((previous) => {
      const next = new Set(previous)
      if (next.has(aisleId)) {
        next.delete(aisleId)
      } else {
        next.add(aisleId)
      }
      return next
    })
  }

  const deleteAisle = (aisleId: string) => {
    setDraft((previous) => deleteAisleFromDraft(previous, aisleId))
    undoStagedDecoupleAisle(aisleId)
    setStagedRemoveFrontmatterAisleIds((previous) => {
      if (!previous.has(aisleId)) return previous
      const next = new Set(previous)
      next.delete(aisleId)
      return next
    })
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
              const linked = linkedAisleIds.has(aisle.id)
              const hasFrontmatter = frontmatterAisleIds.has(aisle.id)
              const stagedDecouple = stagedDecoupleAisleIds.has(aisle.id)
              const stagedFrontmatterRemoval = stagedRemoveFrontmatterAisleIds.has(aisle.id)
              const stagedChange = stagedDecouple || stagedFrontmatterRemoval
              const cautionLabel = stagedDecouple
                ? stagedFrontmatterRemoval
                  ? 'DE-COUPLED & FM REMOVED'
                  : 'DE-COUPLED'
                : stagedFrontmatterRemoval
                  ? 'FM REMOVED'
                  : null
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
                  } ${
                    stagedDecouple ? 'is-staged-decouple' : ''
                  } ${
                    stagedFrontmatterRemoval ? 'is-staged-frontmatter-removal' : ''
                  } ${
                    stagedChange ? 'is-staged-aisle-change' : ''
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
                  {(linked || hasFrontmatter) && (
                    <div className="aisle-edit-card-action-layer" aria-label={`Aisle ${index + 1} staged actions`}>
                      {linked && (
                        <div className="note-aisle-action-wrap">
                          <button
                            type="button"
                            className={`note-aisle-action-btn note-aisle-link-btn aisle-edit-card-action-btn ${
                              stagedDecouple ? 'is-staged-removal' : ''
                            }`}
                            aria-label={`${stagedDecouple ? 'Undo de-couple' : 'Stage de-couple'} for aisle ${index + 1}`}
                            data-app-tooltip={stagedDecouple ? 'Undo de-couple' : 'Stage de-couple'}
                            onPointerDown={(event) => {
                              event.stopPropagation()
                            }}
                            onClick={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              toggleStagedDecoupleAisle(aisle.id)
                            }}
                          >
                            <ToolbarToolIcon toolId="link" className="note-aisle-link-icon" />
                          </button>
                        </div>
                      )}
                      {hasFrontmatter && (
                        <div className="note-aisle-action-wrap">
                          <button
                            type="button"
                            className={`note-aisle-action-btn note-aisle-frontmatter-btn aisle-edit-card-action-btn ${
                              stagedFrontmatterRemoval ? 'is-staged-removal' : ''
                            }`}
                            aria-label={`${stagedFrontmatterRemoval ? 'Undo frontmatter removal' : 'Stage frontmatter removal'} for aisle ${
                              index + 1
                            }`}
                            data-app-tooltip={stagedFrontmatterRemoval ? 'Undo frontmatter removal' : 'Stage frontmatter removal'}
                            onPointerDown={(event) => {
                              event.stopPropagation()
                            }}
                            onClick={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              toggleStagedRemoveFrontmatterAisle(aisle.id)
                            }}
                          >
                            <span className="frontmatter-toolbar-icon note-aisle-frontmatter-icon" aria-hidden="true">fm</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  <AisleMarkdownPreview markdown={aisle.markdown} />
                  {cautionLabel && <DecoupleCautionStripe label={cautionLabel} />}
                  {canDelete && (
                    <div className="aisle-edit-card-controls">
                      <div className="aisle-edit-card-actions">
                        <button
                          type="button"
                          className="aisle-edit-delete-btn"
                          aria-label={`Delete aisle ${index + 1}`}
                          data-app-tooltip={`Delete aisle ${index + 1}`}
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            deleteAisle(aisle.id)
                          }}
                        >
                          <AppIcon iconId="trash" className="aisle-edit-delete-icon" />
                        </button>
                      </div>
                    </div>
                  )}
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
                  addAisleToDraftOrWarn(previous, createDraftAisle(), onWarn, maxAisles, maxAislesWarningMessage, {
                    reclaimEmptyAisleAtLimit,
                  }),
                )
              }
            >
              add aisle
            </button>
            <button
              type="button"
              className="btn btn-sm modal-primary-btn"
              onClick={() =>
                onApply(draft, {
                  decoupleAisleIds: Array.from(stagedDecoupleAisleIds),
                  removeFrontmatterAisleIds: Array.from(stagedRemoveFrontmatterAisleIds),
                })
              }
            >
              apply
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}
