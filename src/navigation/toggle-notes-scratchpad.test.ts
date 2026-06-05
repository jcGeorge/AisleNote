import { describe, expect, it } from 'vitest'
import type { ViewMode } from '../types/app'
import {
  getNextNotesScratchpadToggleState,
  getNotesScratchpadToggleIntent,
  type NotesScratchpadToggleState,
} from './toggle-notes-scratchpad'

describe('notes/scratchpad toggle intent', () => {
  it.each([
    ['main', false, 'open-scratchpad'],
    ['main', true, 'open-note'],
    ['trash', false, 'open-note'],
    ['settings', false, 'open-note'],
    ['messages', false, 'open-note'],
    ['about', false, 'open-note'],
  ] satisfies Array<[ViewMode, boolean, ReturnType<typeof getNotesScratchpadToggleIntent>]>)(
    'maps %s with scratchpad active %s to %s',
    (viewMode, scratchpadActive, intent) => {
      expect(getNotesScratchpadToggleIntent(viewMode, scratchpadActive)).toBe(intent)
    },
  )

  it('alternates indefinitely from main notes when key repeat queues before render', () => {
    let state: NotesScratchpadToggleState = { viewMode: 'main', scratchpadActive: false }

    state = getNextNotesScratchpadToggleState(state)
    expect(state).toEqual({ viewMode: 'main', scratchpadActive: true })

    state = getNextNotesScratchpadToggleState(state)
    expect(state).toEqual({ viewMode: 'main', scratchpadActive: false })

    state = getNextNotesScratchpadToggleState(state)
    expect(state).toEqual({ viewMode: 'main', scratchpadActive: true })
  })

  it('returns from non-main pages to notes before opening scratchpad', () => {
    let state: NotesScratchpadToggleState = { viewMode: 'settings', scratchpadActive: false }

    state = getNextNotesScratchpadToggleState(state)
    expect(state).toEqual({ viewMode: 'main', scratchpadActive: false })

    state = getNextNotesScratchpadToggleState(state)
    expect(state).toEqual({ viewMode: 'main', scratchpadActive: true })
  })
})
