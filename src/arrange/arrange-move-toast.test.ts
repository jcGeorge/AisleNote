import { describe, expect, it } from 'vitest'
import { formatArrangeCrossDomainMoveToast } from './arrange-move-toast'

describe('arrange cross-domain move toasts', () => {
  it('formats single moved item messages with the item name and target domain', () => {
    expect(formatArrangeCrossDomainMoveToast('space', ['Research'], 'Work')).toBe('Research has been moved to Work')
    expect(formatArrangeCrossDomainMoveToast('parent', ['Roadmap'], 'Work')).toBe('Roadmap has been moved to Work')
    expect(formatArrangeCrossDomainMoveToast('subtab', ['Tasks'], 'Work')).toBe('Tasks has been moved to Work')
  })

  it('formats multi-select messages as count summaries', () => {
    expect(formatArrangeCrossDomainMoveToast('space', ['Drafts', 'Notes', 'Ideas'], 'Work')).toBe(
      '3 spaces have been moved to Work',
    )
    expect(formatArrangeCrossDomainMoveToast('parent', ['Roadmap', 'Planning'], 'Work')).toBe(
      '2 parent tabs have been moved to Work',
    )
    expect(formatArrangeCrossDomainMoveToast('subtab', ['Todo', 'Done'], 'Work')).toBe(
      '2 subtabs have been moved to Work',
    )
  })

  it('returns no message when no item or destination domain is available', () => {
    expect(formatArrangeCrossDomainMoveToast('space', [], 'Work')).toBeNull()
    expect(formatArrangeCrossDomainMoveToast('space', ['Research'], '')).toBeNull()
    expect(formatArrangeCrossDomainMoveToast('space', ['Research'], null)).toBeNull()
  })

  it('uses a type label for an unnamed single moved item', () => {
    expect(formatArrangeCrossDomainMoveToast('parent', ['   '], 'Work')).toBe('parent tab has been moved to Work')
  })
})
