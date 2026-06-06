import { describe, expect, it } from 'vitest'
import { LAST_DOMAIN_TOAST, LAST_PARENT_TAB_TOAST, LAST_SPACE_TOAST, formatMovedToTrashToast } from './useAppOverlayActions'

describe('trash toast labels', () => {
  it('formats moved-to-trash toasts with item kind and name', () => {
    expect(formatMovedToTrashToast('domain', 'Work')).toBe('Domain "Work" has been moved to trash.')
    expect(formatMovedToTrashToast('space', 'Drafts')).toBe('Space "Drafts" has been moved to trash.')
    expect(formatMovedToTrashToast('parent tab', 'Roadmap')).toBe('Parent tab "Roadmap" has been moved to trash.')
    expect(formatMovedToTrashToast('tab', 'Meeting notes')).toBe('Tab "Meeting notes" has been moved to trash.')
  })

  it('describes the blocked last parent tab delete', () => {
    expect(LAST_PARENT_TAB_TOAST).toBe('At least one parent tab must remain.')
  })

  it('describes blocked last space and domain deletes', () => {
    expect(LAST_SPACE_TOAST).toBe('At least one space must remain.')
    expect(LAST_DOMAIN_TOAST).toContain('switch to another notebook first')
    expect(LAST_DOMAIN_TOAST).toContain('delete this notebook folder')
  })
})
