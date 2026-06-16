import { describe, expect, it } from 'vitest'
import { createDefaultAppState } from './default-app-state.js'

describe('default app state', () => {
  it('creates a schema-2 notebook state without legacy hierarchy fields', () => {
    const state = createDefaultAppState()

    expect(state).not.toHaveProperty('domains')
    expect(state).not.toHaveProperty('spaces')
    expect(state).not.toHaveProperty('activeDomainId')
    expect(state).not.toHaveProperty('activeSpaceId')
    expect(state.notebook.items[0]).toMatchObject({ type: 'note', title: 'Welcome' })
    expect(state.noteAisleBodies[0]).toMatchObject({ markdown: '' })
    expect(state.ui.scratchpadAisleLimit).toBe(16)
    expect(state.ui).not.toHaveProperty('trashDeleteForRealRequiresConfirmation')
  })
})
