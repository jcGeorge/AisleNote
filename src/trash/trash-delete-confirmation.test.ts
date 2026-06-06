import { describe, expect, it } from 'vitest'
import {
  TRASH_DELETE_CONFIRMATION_TIP_ID,
  shouldConfirmTrashDeleteForReal,
  shouldShowTrashDeleteConfirmationTip,
} from './trash-delete-confirmation'

describe('trash delete confirmation helpers', () => {
  it('defaults delete-for-real confirmation on', () => {
    expect(shouldConfirmTrashDeleteForReal({})).toBe(true)
    expect(shouldConfirmTrashDeleteForReal({ trashDeleteForRealRequiresConfirmation: true })).toBe(true)
    expect(shouldConfirmTrashDeleteForReal({ trashDeleteForRealRequiresConfirmation: false })).toBe(false)
  })

  it('shows the confirmation-setting tip only once while confirmation is enabled', () => {
    expect(
      shouldShowTrashDeleteConfirmationTip({
        trashDeleteForRealRequiresConfirmation: true,
        seenTipIds: [],
      }),
    ).toBe(true)
    expect(
      shouldShowTrashDeleteConfirmationTip({
        trashDeleteForRealRequiresConfirmation: true,
        seenTipIds: [TRASH_DELETE_CONFIRMATION_TIP_ID],
      }),
    ).toBe(false)
    expect(
      shouldShowTrashDeleteConfirmationTip({
        trashDeleteForRealRequiresConfirmation: false,
        seenTipIds: [],
      }),
    ).toBe(false)
  })
})
