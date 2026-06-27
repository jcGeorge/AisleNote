import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDefaultAppState } from './default-app-state.js'
import {
  collectAppNavigationEntityIds,
  createRandomId,
  createReservedIdAllocator,
  ensureUniqueId,
} from './navigation-ids'

function generator(values: string[]) {
  let index = 0
  return () => values[index++] ?? `fallback-${index}`
}

describe('navigation id helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses crypto.randomUUID when available', () => {
    const uuid = '00000000-0000-4000-8000-000000000000'
    const spy = vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(uuid)

    expect(createRandomId()).toBe(uuid)
    expect(spy).toHaveBeenCalledOnce()
  })

  it('retries generated ids until one is unique', () => {
    const next = ensureUniqueId(new Set(['existing', 'also-existing']), generator(['existing', 'also-existing', 'unique']))

    expect(next).toBe('unique')
  })

  it('reserves ids generated during the same action', () => {
    const allocate = createReservedIdAllocator(['existing'], generator(['existing', 'fresh', 'fresh', 'fresh-2']))

    expect(allocate()).toBe('fresh')
    expect(allocate()).toBe('fresh-2')
  })

  it('collects ids across vault items, note bodies, aisles, and app-level projections', () => {
    const state = createDefaultAppState()
    state.vault.activeNoteId = 'note-live'
    state.vault.items = [
      {
        type: 'folder',
        id: 'folder-live',
        title: 'Live folder',
        children: [
          {
            type: 'note',
            id: 'note-live',
            title: 'Live note',
            noteBodyId: 'body-live',
          },
        ],
      },
    ]
    state.vault.deletedItems = [
      {
        id: 'deleted-entry',
        deletedAt: 1,
        originalParentFolderId: null,
        originalIndex: 0,
        item: {
          type: 'note',
          id: 'note-deleted',
          title: 'Deleted note',
          noteBodyId: 'body-deleted',
        },
      },
    ]
    state.noteBodies = [
      {
        id: 'body-live',
        aisles: [{ id: 'aisle-slot', aisleBodyId: 'aisle-body' }],
      },
    ]
    state.noteAisleBodies = [{ id: 'aisle-body', markdown: '' }]
    state.frontmatter.templates = [
      {
        id: 'template-id',
        name: 'Template',
        fields: [{ id: 'field-id', key: 'status', type: 'text', defaultValue: '', computed: 'none' }],
      },
    ]
    state.ui.toolbarLayouts = [
      {
        id: 'toolbar-layout',
        name: 'Toolbar',
        items: [{ id: 'toolbar-item', type: 'tool', toolId: 'bold' }],
      },
    ]

    const ids = collectAppNavigationEntityIds(state)

    expect(Array.from(ids)).toEqual(
      expect.arrayContaining([
        'folder-live',
        'note-live',
        'body-live',
        'deleted-entry',
        'note-deleted',
        'body-deleted',
        'aisle-slot',
        'aisle-body',
        'template-id',
        'field-id',
        'toolbar-layout',
        'toolbar-item',
      ]),
    )
  })
})
