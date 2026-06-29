import { describe, expect, it } from 'vitest'
import { parseSavedState } from './app-state'
import { DEFAULT_SCRATCHPAD_MARKDOWN, createDefaultAppState } from './default-app-state.js'

describe('default app state', () => {
  it('creates a schema-2 vault state', () => {
    const state = createDefaultAppState()
    const scratchpadBody = state.noteBodies.find((body) => body.id === state.scratchpad?.noteBodyId)
    const scratchpadAisleBody = state.noteAisleBodies.find(
      (body) => body.id === scratchpadBody?.aisles[0]?.aisleBodyId,
    )

    expect(state.vault.items[0]).toMatchObject({ type: 'note', title: 'Welcome' })
    expect(state.vault.settings.autoRemoveDeletedDays).toBe(7)
    expect(state.theme).toBe('dark')
    expect(state.noteAisleBodies[0]).toMatchObject({ markdown: '' })
    expect(scratchpadAisleBody?.markdown).toBe(DEFAULT_SCRATCHPAD_MARKDOWN)
    expect(state.ui).not.toHaveProperty('scratchpadAisleLimit')
    expect(state.ui).not.toHaveProperty('trashDeleteForRealRequiresConfirmation')
    expect(state.ui.tableAddTargetMode).toBe('bottom-right')
    expect(state.ui.tableDeleteTargetMode).toBe('bottom-right')
    expect(state.ui.tabColorIndicatorPlacement).toBe('bottom')
    expect(state.hotkeys.shortcuts).toMatchObject({
      cyclePinnedNoteTabNext: 'ctrl+tab',
      cyclePinnedNoteTabPrev: 'ctrl+shift+tab',
      reopenClosedNoteTab: 'mod+shift+t',
      formatHighlight: 'mod+shift+h',
      pastePlainText: 'mod+shift+v',
      cycleAislePrev: 'mod+alt+arrowleft',
      cycleAisleNext: 'mod+alt+arrowright',
    })
    expect(state.hotkeys.newlineShortcuts.shortcuts).toEqual({
      controlEnter: 'operationsMenu',
      shiftEnter: 'task',
      commandEnter: 'aisleRight',
    })
    expect(state.hotkeys.newlineShortcuts.menuOperations).toEqual([
      'task',
      'aisleLeft',
      'aisleRight',
      'horizontalLine',
      'codeBlock',
      'inlineCode',
      'blockQuote',
      'strikethrough',
    ])
  })

  it('hydrates persisted Misc segmented setting choices from saved app state', () => {
    const state = createDefaultAppState()
    state.ui.tableAddTargetMode = 'active-cell'
    state.ui.tableDeleteTargetMode = 'bottom-right'
    state.ui.tableOfContentsScope = 'focused-aisle'
    state.ui.tabColorIndicatorPlacement = 'top'

    const parsed = parseSavedState(JSON.stringify(state))

    expect(parsed.ui.tableAddTargetMode).toBe('active-cell')
    expect(parsed.ui.tableDeleteTargetMode).toBe('bottom-right')
    expect(parsed.ui.tableOfContentsScope).toBe('focused-aisle')
    expect(parsed.ui.tabColorIndicatorPlacement).toBe('top')
  })

  it('hydrates persisted newline shortcut choices from saved app state', () => {
    const state = createDefaultAppState()
    state.hotkeys.newlineShortcuts.shortcuts.controlEnter = 'tableOfContents'
    state.hotkeys.newlineShortcuts.menuOperations = ['tableOfContents', 'blockQuote']

    const parsed = parseSavedState(JSON.stringify(state))

    expect(parsed.hotkeys.newlineShortcuts.shortcuts.controlEnter).toBe('tableOfContents')
    expect(parsed.hotkeys.newlineShortcuts.menuOperations).toEqual([
      'tableOfContents',
      'blockQuote',
      'strikethrough',
    ])
  })

  it('normalizes command shortcuts while pruning unknown shortcut ids', () => {
    const state = createDefaultAppState()
    state.hotkeys.shortcuts = {
      closeCurrentNote: 'Mod+Alt+W',
      removedShortcut: 'Ctrl+Tab',
    }

    const parsed = parseSavedState(JSON.stringify(state))

    expect(parsed.hotkeys.shortcuts).not.toHaveProperty('removedShortcut')
    expect(parsed.hotkeys.shortcuts.closeCurrentNote).toBe('Mod+Alt+W')
    expect(parsed.hotkeys.shortcuts.cyclePinnedNoteTabNext).toBe('Ctrl+Tab')
    expect(parsed.hotkeys.shortcuts.cyclePinnedNoteTabPrev).toBe('Ctrl+Shift+Tab')
    expect(parsed.hotkeys.shortcuts.reopenClosedNoteTab).toBe('Mod+Shift+T')
    expect(parsed.hotkeys.shortcuts.formatHighlight).toBe('Mod+Shift+H')
    expect(parsed.hotkeys.shortcuts.pastePlainText).toBe('Mod+Shift+V')
    expect(parsed.hotkeys.shortcuts.cycleAislePrev).toBe('Mod+Alt+ArrowLeft')
    expect(parsed.hotkeys.shortcuts.cycleAisleNext).toBe('Mod+Alt+ArrowRight')
  })

  it('migrates persisted legacy aisle default shortcuts', () => {
    const state = createDefaultAppState()
    state.hotkeys.shortcuts.cycleAislePrev = 'Alt+['
    state.hotkeys.shortcuts.cycleAisleNext = 'mod+ctrl+arrowright'

    const parsed = parseSavedState(JSON.stringify(state))

    expect(parsed.hotkeys.shortcuts.cycleAislePrev).toBe('Mod+Alt+ArrowLeft')
    expect(parsed.hotkeys.shortcuts.cycleAisleNext).toBe('Mod+Alt+ArrowRight')
  })
})
