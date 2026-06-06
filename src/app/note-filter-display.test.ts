import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  appendVisibleNoteFilterCount,
  getVisibleNoteFilterCount,
  getVisibleNoteFilterCountLabel,
} from './note-filter-display'

const appControllerSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), './useAppController.tsx'), 'utf8')

describe('note filter display counts', () => {
  it('hides saved filter counts while filter mode is inactive', () => {
    const savedFilterCounts = [
      { kind: 'tags', label: 'scratchpad', count: 2 },
      { kind: 'synced', label: 'linked note', count: 3 },
      { kind: 'frontmatter', label: 'home', count: 4 },
    ]

    savedFilterCounts.forEach(({ label, count }) => {
      expect(getVisibleNoteFilterCount(false, count)).toBe(0)
      expect(appendVisibleNoteFilterCount(false, label, count)).toBe(label)
      expect(getVisibleNoteFilterCountLabel(false, count)).toBe('')
    })
  })

  it('shows saved filter counts while filter mode is active', () => {
    expect(getVisibleNoteFilterCount(true, 4)).toBe(4)
    expect(appendVisibleNoteFilterCount(true, 'home', 4)).toBe('home (4)')
    expect(getVisibleNoteFilterCountLabel(true, 4)).toBe('4')
  })

  it('routes every rail count label through the active filter display gate', () => {
    expect(appControllerSource).not.toContain('appendNoteFilterCount(')
    expect(appControllerSource.match(/appendVisibleNoteFilterCount\(\s*tagFilterActive/g) ?? []).toHaveLength(5)
    expect(appControllerSource).toContain('scratchpadTagCountLabel={getVisibleNoteFilterCountLabel(tagFilterActive')
  })
})
