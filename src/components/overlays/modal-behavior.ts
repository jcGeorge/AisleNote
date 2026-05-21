import type { ModalState } from '../../types/app'

export function shouldModalBackdropClose(modal: ModalState): boolean {
  return modal.type !== 'frontmatter-note' && modal.type !== 'sort-tabs' && modal.type !== 'insert-note-reference'
}
