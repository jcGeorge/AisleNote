import { describe, expect, it } from 'vitest'
import { createDefaultAppState } from '../state/default-app-state.js'
import type { AppState } from '../types/app'
import { findVisibleMatches } from './find-replace'

function createState(): AppState {
  const state = createDefaultAppState({
    idGenerator: (() => {
      let index = 0
      return () => `id-${index += 1}`
    })(),
  }) as AppState
  const noteId = state.vault.activeNoteId
  const noteBodyId = state.vault.items[0]?.type === 'note' ? state.vault.items[0].noteBodyId : ''
  return {
    ...state,
    vault: {
      ...state.vault,
      activeNoteId: noteId,
      items: [
        {
          type: 'note',
          id: noteId,
          title: 'Current',
          noteBodyId,
        },
        {
          type: 'note',
          id: 'other-note',
          title: 'Other',
          noteBodyId: 'other-body',
        },
      ],
    },
    noteBodies: [
      {
        id: noteBodyId,
        aisles: [
          { id: 'current-aisle-1', aisleBodyId: 'current-aisle-body-1' },
          { id: 'current-aisle-2', aisleBodyId: 'current-aisle-body-2' },
        ],
      },
      {
        id: 'other-body',
        aisles: [{ id: 'other-aisle', aisleBodyId: 'other-aisle-body' }],
      },
      {
        id: state.scratchpad?.noteBodyId ?? 'scratchpad-body',
        aisles: [{ id: 'scratchpad-aisle', aisleBodyId: 'scratchpad-aisle-body' }],
      },
    ],
    noteAisleBodies: [
      { id: 'current-aisle-body-1', markdown: 'alpha in the first aisle' },
      { id: 'current-aisle-body-2', markdown: 'alpha in the second aisle' },
      { id: 'other-aisle-body', markdown: 'alpha in another note' },
      { id: 'scratchpad-aisle-body', markdown: 'alpha in scratchpad' },
    ],
  }
}

describe('findVisibleMatches', () => {
  it('searches every aisle of the current note without including scratchpad results in note scope', () => {
    const state = createState()
    const matches = findVisibleMatches(state, { noteId: state.vault.activeNoteId }, 'note', 'alpha', {
      caseSensitive: false,
      wholeWord: false,
      regex: false,
    })

    expect(matches.map((match) => match.aisleId)).toEqual(['current-aisle-1', 'current-aisle-2'])
    expect(matches.every((match) => match.location.noteId === state.vault.activeNoteId)).toBe(true)
  })

  it('includes scratchpad only when searching vault scope', () => {
    const state = createState()
    const matches = findVisibleMatches(state, { noteId: state.vault.activeNoteId }, 'vault', 'alpha', {
      caseSensitive: false,
      wholeWord: false,
      regex: false,
    })

    expect(matches.map((match) => match.aisleId)).toEqual([
      'current-aisle-1',
      'current-aisle-2',
      'other-aisle',
      'scratchpad-aisle',
    ])
  })
})
