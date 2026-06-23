import { describe, expect, it } from 'vitest'
import { parseSavedState } from './app-state'
import { createDefaultAppState } from './default-app-state.js'

describe('default app state', () => {
  it('creates a schema-2 notebook state', () => {
    const state = createDefaultAppState()

    expect(state.notebook.items[0]).toMatchObject({ type: 'note', title: 'Welcome' })
    expect(state.noteAisleBodies[0]).toMatchObject({ markdown: '' })
    expect(state.ui).not.toHaveProperty('scratchpadAisleLimit')
    expect(state.ui).not.toHaveProperty('trashDeleteForRealRequiresConfirmation')
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
})
