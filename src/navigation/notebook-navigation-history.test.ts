import { describe, expect, it } from 'vitest'
import {
  createNotebookNavigationHistoryState,
  navigateNotebookNavigationHistoryBy,
  pushNotebookNavigationLocation,
  type NotebookNavigationLocation,
} from './notebook-navigation-history'

const resolveAll = (location: NotebookNavigationLocation) => location

describe('notebook navigation history', () => {
  it('pushes note and aisle locations while ignoring adjacent duplicates', () => {
    let history = createNotebookNavigationHistoryState()
    history = pushNotebookNavigationLocation(history, { noteId: 'note-a', aisleId: 'aisle-a1' })
    history = pushNotebookNavigationLocation(history, { noteId: 'note-a', aisleId: 'aisle-a1' })
    history = pushNotebookNavigationLocation(history, { noteId: 'note-a', aisleId: 'aisle-a2' })
    history = pushNotebookNavigationLocation(history, { noteId: 'note-b', aisleId: 'aisle-b1' })

    expect(history.entries).toEqual([
      { noteId: 'note-a', aisleId: 'aisle-a1' },
      { noteId: 'note-a', aisleId: 'aisle-a2' },
      { noteId: 'note-b', aisleId: 'aisle-b1' },
    ])
    expect(history.index).toBe(2)
  })

  it('truncates forward history after a new location and caps the stack', () => {
    let history = createNotebookNavigationHistoryState()
    history = pushNotebookNavigationLocation(history, { noteId: 'note-a', aisleId: 'aisle-a1' }, 3)
    history = pushNotebookNavigationLocation(history, { noteId: 'note-b', aisleId: 'aisle-b1' }, 3)
    history = pushNotebookNavigationLocation(history, { noteId: 'note-c', aisleId: 'aisle-c1' }, 3)

    const back = navigateNotebookNavigationHistoryBy(history, -1, resolveAll)
    expect(back.location).toEqual({ noteId: 'note-b', aisleId: 'aisle-b1' })

    history = pushNotebookNavigationLocation(back.state, { noteId: 'note-d', aisleId: 'aisle-d1' }, 3)
    history = pushNotebookNavigationLocation(history, { noteId: 'note-e', aisleId: 'aisle-e1' }, 3)

    expect(history.entries).toEqual([
      { noteId: 'note-b', aisleId: 'aisle-b1' },
      { noteId: 'note-d', aisleId: 'aisle-d1' },
      { noteId: 'note-e', aisleId: 'aisle-e1' },
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

    expect(result.location).toEqual({ noteId: 'note-a', aisleId: 'aisle-a1' })
    expect(result.state.entries).toEqual([
      { noteId: 'note-a', aisleId: 'aisle-a1' },
      { noteId: 'note-c', aisleId: 'aisle-c1' },
    ])
    expect(result.state.index).toBe(0)
  })

  it('uses the resolver fallback for stale aisle entries', () => {
    let history = createNotebookNavigationHistoryState()
    history = pushNotebookNavigationLocation(history, { noteId: 'note-a', aisleId: 'aisle-a1' })
    history = pushNotebookNavigationLocation(history, { noteId: 'note-b', aisleId: 'aisle-missing' })
    history = pushNotebookNavigationLocation(history, { noteId: 'note-c', aisleId: 'aisle-c1' })

    const result = navigateNotebookNavigationHistoryBy(history, -1, (location) =>
      location.noteId === 'note-b' ? { noteId: 'note-b', aisleId: 'aisle-b-fallback' } : location,
    )

    expect(result.location).toEqual({ noteId: 'note-b', aisleId: 'aisle-b-fallback' })
    expect(result.state.entries[1]).toEqual({ noteId: 'note-b', aisleId: 'aisle-b-fallback' })
    expect(result.state.index).toBe(1)
  })
})
