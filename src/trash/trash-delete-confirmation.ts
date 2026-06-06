import type { AppState } from '../types/app'

export const TRASH_DELETE_CONFIRMATION_TIP_ID = 'trash-delete-confirmation-setting'

type TrashDeleteConfirmationUi = Pick<
  AppState['ui'],
  'trashDeleteForRealRequiresConfirmation'
>

export function shouldConfirmTrashDeleteForReal(
  ui: Pick<TrashDeleteConfirmationUi, 'trashDeleteForRealRequiresConfirmation'>,
) {
  return ui.trashDeleteForRealRequiresConfirmation ?? true
}

export function shouldShowTrashDeleteConfirmationTip(ui: TrashDeleteConfirmationUi) {
  return shouldConfirmTrashDeleteForReal(ui)
}
