import { describe, expect, it } from 'vitest'
import { getCopyToolbarAction } from './useEditorToolbarLayer'

describe('editor toolbar copy action', () => {
  it('opens copy directly for notes without linked duplicates', () => {
    expect(getCopyToolbarAction(0)).toBe('open-copy-modal')
    expect(getCopyToolbarAction(1)).toBe('open-copy-modal')
  })

  it('opens the copy choice menu for linked duplicates', () => {
    expect(getCopyToolbarAction(2)).toBe('open-copy-menu')
    expect(getCopyToolbarAction(4)).toBe('open-copy-menu')
  })
})
