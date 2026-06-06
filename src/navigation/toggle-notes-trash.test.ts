import { describe, expect, it } from 'vitest'
import type { ViewMode } from '../types/app'
import {
  getNextNotesTrashToggleState,
  getNotesTrashToggleIntent,
  type NotesTrashToggleState,
} from './toggle-notes-trash'

describe('notes/trash toggle intent', () => {
  it.each([
    ['main', 'open-trash'],
    ['trash', 'open-main'],
    ['settings', 'open-main'],
    ['messages', 'open-main'],
    ['about', 'open-main'],
  ] satisfies Array<[ViewMode, ReturnType<typeof getNotesTrashToggleIntent>]>)(
    'maps %s to %s',
    (viewMode, intent) => {
      expect(getNotesTrashToggleIntent(viewMode)).toBe(intent)
    },
  )

  it('alternates indefinitely from main notes when key repeat queues before render', () => {
    let state: NotesTrashToggleState = { viewMode: 'main', scratchpadActive: false }

    state = getNextNotesTrashToggleState(state)
    expect(state).toEqual({ viewMode: 'trash', scratchpadActive: false })

    state = getNextNotesTrashToggleState(state)
    expect(state).toEqual({ viewMode: 'main', scratchpadActive: false })

    state = getNextNotesTrashToggleState(state)
    expect(state).toEqual({ viewMode: 'trash', scratchpadActive: false })
  })

  it('keeps scratchpad active when toggling notes/trash from scratchpad', () => {
    expect(getNextNotesTrashToggleState({ viewMode: 'main', scratchpadActive: true })).toEqual({
      viewMode: 'main',
      scratchpadActive: true,
    })
  })
})
