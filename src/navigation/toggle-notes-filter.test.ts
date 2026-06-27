import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  getNextNotesFilterExitState,
  getNotesFilterToggleIntent,
  isNotesFilterModeActive,
} from './toggle-notes-filter'

const vaultAppSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../app/VaultApp.tsx'),
  'utf8',
)

describe('notes/filter toggle intent', () => {
  it('treats active or open main-view filters as filter mode', () => {
    expect(isNotesFilterModeActive({ viewMode: 'main', filterActive: true, filterMenuOpen: false })).toBe(true)
    expect(isNotesFilterModeActive({ viewMode: 'main', filterActive: false, filterMenuOpen: true })).toBe(true)
  })

  it('does not treat inactive filters or non-main views as filter mode', () => {
    expect(isNotesFilterModeActive({ viewMode: 'main', filterActive: false, filterMenuOpen: false })).toBe(false)
    expect(isNotesFilterModeActive({ viewMode: 'trash', filterActive: true, filterMenuOpen: true })).toBe(false)
  })

  it('toggles between exiting the current filter mode and opening filter mode', () => {
    expect(getNotesFilterToggleIntent({ viewMode: 'main', filterActive: true, filterMenuOpen: false })).toBe(
      'exit-filter',
    )
    expect(getNotesFilterToggleIntent({ viewMode: 'main', filterActive: false, filterMenuOpen: false })).toBe(
      'open-filter',
    )
    expect(getNotesFilterToggleIntent({ viewMode: 'settings', filterActive: true, filterMenuOpen: true })).toBe(
      'open-filter',
    )
  })

  it('exits filter mode without changing the active note target', () => {
    expect(
      getNextNotesFilterExitState({
        viewMode: 'main',
        scratchpadActive: false,
        filterActive: true,
        filterMenuOpen: true,
      }),
    ).toEqual({
      viewMode: 'main',
      scratchpadActive: false,
      filterActive: false,
      filterMenuOpen: false,
    })
  })

  it('exits filter mode without changing the active scratchpad target', () => {
    expect(
      getNextNotesFilterExitState({
        viewMode: 'main',
        scratchpadActive: true,
        filterActive: true,
        filterMenuOpen: false,
      }),
    ).toEqual({
      viewMode: 'main',
      scratchpadActive: true,
      filterActive: false,
      filterMenuOpen: false,
    })
  })

  it('routes note target toggles through the filter exit guard before normal toggle behavior', () => {
    expect(vaultAppSource).toContain('const toggleNotesScratchpadFromShortcut = useCallback(() => {')
    expect(vaultAppSource).toContain('closeSidebarSearchMode()')
    expect(vaultAppSource).toContain('toggleNotesFilter: focusNotesFilterFromShortcut')
  })
})
