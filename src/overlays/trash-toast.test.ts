import { describe, expect, it } from 'vitest'
import { formatMovedToTrashToast } from './useAppOverlayActions'

describe('trash toast labels', () => {
  it('formats moved-to-trash toasts with item kind and name', () => {
    expect(formatMovedToTrashToast('domain', 'Work')).toBe('domain "Work" has been moved to trash')
    expect(formatMovedToTrashToast('space', 'Drafts')).toBe('space "Drafts" has been moved to trash')
    expect(formatMovedToTrashToast('parent tab', 'Roadmap')).toBe('parent tab "Roadmap" has been moved to trash')
    expect(formatMovedToTrashToast('tab', 'Meeting notes')).toBe('tab "Meeting notes" has been moved to trash')
  })
})
