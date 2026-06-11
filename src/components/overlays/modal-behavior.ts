import type { ModalState } from '../../types/app'

export function shouldModalBackdropClose(modal: ModalState): boolean {
  return modal.type !== 'frontmatter-note' && modal.type !== 'sort-tabs' && modal.type !== 'insert-note-reference'
}

export function shouldCloseModalFromBackdropGesture({
  modal,
  startedOnBackdrop,
  endedOnBackdrop,
}: {
  modal: ModalState
  startedOnBackdrop: boolean
  endedOnBackdrop: boolean
}): boolean {
  return shouldModalBackdropClose(modal) && startedOnBackdrop && endedOnBackdrop
}

export function shouldCloseGenericBackdropFromGesture({
  startedOnBackdrop,
  endedOnBackdrop,
}: {
  startedOnBackdrop: boolean
  endedOnBackdrop: boolean
}): boolean {
  return startedOnBackdrop && endedOnBackdrop
}
