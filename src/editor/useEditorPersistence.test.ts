import { describe, expect, it, vi } from 'vitest'
import type { Editor } from '@toast-ui/editor'
import { getSnapshotEditorMarkdown } from './useEditorPersistence'

describe('editor persistence snapshot helpers', () => {
  it('reads fresh editor markdown for close-time snapshots', () => {
    const editor = { getMarkdown: () => 'fresh' } as unknown as Editor
    const getNormalizedEditorMarkdown = vi.fn((target: Editor) => (target as unknown as { getMarkdown: () => string }).getMarkdown())

    expect(getSnapshotEditorMarkdown(editor, 'cached', getNormalizedEditorMarkdown)).toBe('fresh')
    expect(getNormalizedEditorMarkdown).toHaveBeenCalledWith(editor)
  })

  it('falls back to cached markdown if the live editor cannot be read', () => {
    const editor = {} as unknown as Editor
    const getNormalizedEditorMarkdown = vi.fn(() => {
      throw new Error('editor unavailable')
    })

    expect(getSnapshotEditorMarkdown(editor, 'cached', getNormalizedEditorMarkdown)).toBe('cached')
  })
})
