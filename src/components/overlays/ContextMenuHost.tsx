import type { ContextMenuState } from '../../types/app'

type ContextMenuHostProps = {
  contextMenu: ContextMenuState | null
  canDeleteSpace: boolean
  canDeleteDomain: boolean
  duplicateCount: number
  onClose: () => void
  onEnterArrangeMode: () => void
  onDuplicateSpace: () => void
  onRenameSpace: () => void
  onRenameDomain: () => void
  onCopyImage: () => void
  onOpenInternalNoteLink: () => void
  onRenameInternalNoteLink: () => void
  onOpenDeleteModal: (permanent: boolean) => void
  onOpenDeduplicateModal: () => void
  onOpenCopyModal: () => void
  onMoveToTrash: () => void
}

export function ContextMenuHost({
  contextMenu,
  canDeleteSpace,
  canDeleteDomain,
  duplicateCount,
  onClose,
  onEnterArrangeMode,
  onDuplicateSpace,
  onRenameSpace,
  onRenameDomain,
  onCopyImage,
  onOpenInternalNoteLink,
  onRenameInternalNoteLink,
  onOpenDeleteModal,
  onOpenDeduplicateModal,
  onOpenCopyModal,
  onMoveToTrash,
}: ContextMenuHostProps) {
  if (!contextMenu) return null

  return (
    <div
      className="tab-context-menu"
      style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
      role="menu"
      onClick={(event) => event.stopPropagation()}
    >
      {contextMenu.type === 'space' ? (
        <>
          <button type="button" className="tab-context-delete" onClick={onEnterArrangeMode}>
            arrange
          </button>
          <button type="button" className="tab-context-delete" onClick={onDuplicateSpace}>
            duplicate
          </button>
          <button type="button" className="tab-context-delete" onClick={onRenameSpace}>
            rename
          </button>
          <button
            type="button"
            className="tab-context-delete"
            onClick={() => {
              if (!canDeleteSpace) {
                onClose()
                return
              }
              onOpenDeleteModal(false)
            }}
            disabled={!canDeleteSpace}
          >
            delete
          </button>
        </>
      ) : contextMenu.type === 'domain' ? (
        <>
          <button type="button" className="tab-context-delete" onClick={onEnterArrangeMode}>
            arrange
          </button>
          <button type="button" className="tab-context-delete" onClick={onRenameDomain}>
            rename
          </button>
          <button
            type="button"
            className="tab-context-delete"
            onClick={() => {
              if (!canDeleteDomain) {
                onClose()
                return
              }
              onOpenDeleteModal(false)
            }}
            disabled={!canDeleteDomain}
          >
            delete
          </button>
        </>
      ) : contextMenu.type === 'image' ? (
        <button type="button" className="tab-context-delete" onClick={onCopyImage}>
          copy image
        </button>
      ) : contextMenu.type === 'internal-note-link' ? (
        <>
          <button type="button" className="tab-context-delete" onClick={onOpenInternalNoteLink}>
            open linked note
          </button>
          <button type="button" className="tab-context-delete" onClick={onRenameInternalNoteLink}>
            edit link name
          </button>
        </>
      ) : contextMenu.type === 'trash-tab' || contextMenu.type === 'trash-subtab' ? (
        <button type="button" className="tab-context-delete tab-context-danger" onClick={() => onOpenDeleteModal(true)}>
          delete for real
        </button>
      ) : contextMenu.type === 'home-tab' ? (
        <button type="button" className="tab-context-delete" onClick={onOpenCopyModal}>
          make copy
        </button>
      ) : (
        <>
          <button type="button" className="tab-context-delete" onClick={onEnterArrangeMode}>
            arrange
          </button>
          <button type="button" className="tab-context-delete" onClick={onOpenCopyModal}>
            make copy
          </button>
          {duplicateCount > 1 && (
            <button type="button" className="tab-context-delete" onClick={onOpenDeduplicateModal}>
              de-couple
            </button>
          )}
          <button type="button" className="tab-context-delete" onClick={onMoveToTrash}>
            move to trash
          </button>
          <button type="button" className="tab-context-delete tab-context-danger" onClick={() => onOpenDeleteModal(true)}>
            delete now
          </button>
        </>
      )}
    </div>
  )
}
