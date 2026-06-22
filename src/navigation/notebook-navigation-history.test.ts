import { describe, expect, it } from 'vitest'
import {
  createNotebookNavigationHistoryState,
  navigateNotebookNavigationHistoryBy,
  pushNotebookNavigationLocation,
  resolveNotebookNavigationLocation,
  type NotebookNavigationLocation,
} from './notebook-navigation-history'
import type { AppState } from '../types/app'

const resolveAll = (location: NotebookNavigationLocation) => location

describe('notebook navigation history', () => {
  it('pushes note-only locations while ignoring same-note aisle changes', () => {
    let history = createNotebookNavigationHistoryState()
    history = pushNotebookNavigationLocation(history, { noteId: 'note-a', aisleId: 'aisle-a1' })
    history = pushNotebookNavigationLocation(history, { noteId: 'note-a', aisleId: 'aisle-a1' })
    history = pushNotebookNavigationLocation(history, { noteId: 'note-a', aisleId: 'aisle-a2' })
    history = pushNotebookNavigationLocation(history, { noteId: 'note-b', aisleId: 'aisle-b1' })

    expect(history.entries).toEqual([
      { noteId: 'note-a' },
      { noteId: 'note-b' },
    ])
    expect(history.index).toBe(1)
  })

  it('truncates forward history after a new location and caps the stack', () => {
    let history = createNotebookNavigationHistoryState()
    history = pushNotebookNavigationLocation(history, { noteId: 'note-a', aisleId: 'aisle-a1' }, 3)
    history = pushNotebookNavigationLocation(history, { noteId: 'note-b', aisleId: 'aisle-b1' }, 3)
    history = pushNotebookNavigationLocation(history, { noteId: 'note-c', aisleId: 'aisle-c1' }, 3)

    const back = navigateNotebookNavigationHistoryBy(history, -1, resolveAll)
    expect(back.location).toEqual({ noteId: 'note-b' })

    history = pushNotebookNavigationLocation(back.state, { noteId: 'note-d', aisleId: 'aisle-d1' }, 3)
    history = pushNotebookNavigationLocation(history, { noteId: 'note-e', aisleId: 'aisle-e1' }, 3)

    expect(history.entries).toEqual([
      { noteId: 'note-b' },
      { noteId: 'note-d' },
      { noteId: 'note-e' },
    ])
    expect(history.index).toBe(2)
  })

  it('skips stale note entries during back navigation', () => {
    let history = createNotebookNavigationHistoryState()
    history = pushNotebookNavigationLocation(history, { noteId: 'note-a', aisleId: 'aisle-a1' })
    history = pushNotebookNavigationLocation(history, { noteId: 'note-stale', aisleId: 'aisle-stale' })
    history = pushNotebookNavigationLocation(history, { noteId: 'note-c', aisleId: 'aisle-c1' })

    const result = navigateNotebookNavigationHistoryBy(history, -1, (location) =>
      location.noteId === 'note-stale' ? null : location,
    )

    expect(result.location).toEqual({ noteId: 'note-a' })
    expect(result.state.entries).toEqual([
      { noteId: 'note-a' },
      { noteId: 'note-c' },
    ])
    expect(result.state.index).toBe(0)
  })

  it('uses the resolver to validate history entries without storing resolved aisles', () => {
    let history = createNotebookNavigationHistoryState()
    history = pushNotebookNavigationLocation(history, { noteId: 'note-a', aisleId: 'aisle-a1' })
    history = pushNotebookNavigationLocation(history, { noteId: 'note-b', aisleId: 'aisle-missing' })
    history = pushNotebookNavigationLocation(history, { noteId: 'note-c', aisleId: 'aisle-c1' })

    const result = navigateNotebookNavigationHistoryBy(history, -1, (location) =>
      location.noteId === 'note-b' ? { noteId: 'note-b', aisleId: 'aisle-b-fallback' } : location,
    )

    expect(result.location).toEqual({ noteId: 'note-b' })
    expect(result.state.entries[1]).toEqual({ noteId: 'note-b' })
    expect(result.state.index).toBe(1)
  })

  it('resolves note-only navigation to the saved active aisle', () => {
    const state = {
      notebook: {
        activeNoteId: 'note-a',
        items: [{ type: 'note', id: 'note-a', title: 'A', noteBodyId: 'body-a' }],
        deletedItems: [],
        settings: { autoRemoveDeletedDays: 30 },
      },
      noteBodies: [
        {
          id: 'body-a',
          aisles: [
            { id: 'aisle-first', aisleBodyId: 'body-first' },
            { id: 'aisle-saved', aisleBodyId: 'body-saved' },
          ],
        },
      ],
      ui: {
        noteCursorLocations: {
          'note-a': {
            activeAisleId: 'aisle-saved',
            aisles: {},
            updatedAt: 1,
          },
        },
      },
    } as AppState

    expect(resolveNotebookNavigationLocation(state, { noteId: 'note-a' })).toEqual({
      noteId: 'note-a',
      aisleId: 'aisle-saved',
    })
    expect(resolveNotebookNavigationLocation(state, { noteId: 'note-a', aisleId: 'aisle-first' })).toEqual({
      noteId: 'note-a',
      aisleId: 'aisle-first',
    })
  })
})
