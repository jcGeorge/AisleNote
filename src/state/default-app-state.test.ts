import { describe, expect, it } from 'vitest'
import { createDefaultAppState } from './default-app-state.js'

describe('default app state', () => {
  it('creates a schema-2 notebook state', () => {
    const state = createDefaultAppState()

    expect(state.notebook.items[0]).toMatchObject({ type: 'note', title: 'Welcome' })
    expect(state.noteAisleBodies[0]).toMatchObject({ markdown: '' })
    expect(state.ui.scratchpadAisleLimit).toBe(16)
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
})
