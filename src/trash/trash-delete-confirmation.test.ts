import { describe, expect, it } from 'vitest'
import {
  shouldConfirmTrashDeleteForReal,
  shouldShowTrashDeleteConfirmationTip,
} from './trash-delete-confirmation'

describe('trash delete confirmation helpers', () => {
  it('defaults delete-for-real confirmation on', () => {
    expect(shouldConfirmTrashDeleteForReal({})).toBe(true)
    expect(shouldConfirmTrashDeleteForReal({ trashDeleteForRealRequiresConfirmation: true })).toBe(true)
    expect(shouldConfirmTrashDeleteForReal({ trashDeleteForRealRequiresConfirmation: false })).toBe(false)
  })

  it('allows the confirmation-setting tip whenever confirmation is enabled', () => {
    expect(
      shouldShowTrashDeleteConfirmationTip({
        trashDeleteForRealRequiresConfirmation: true,
      }),
    ).toBe(true)
    expect(
      shouldShowTrashDeleteConfirmationTip({
        trashDeleteForRealRequiresConfirmation: false,
      }),
    ).toBe(false)
  })
})
