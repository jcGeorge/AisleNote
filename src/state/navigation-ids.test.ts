import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_FRONTMATTER_SETTINGS } from '../frontmatter/frontmatter'
import { DEFAULT_NEWLINE_SHORTCUT_SETTINGS, DEFAULT_SHORTCUTS } from '../hotkeys/shortcuts'
import { DEFAULT_UI_SETTINGS } from '../settings/defaults'
import type { AppState, Domain, Space, WorkspaceData } from '../types/app'
import {
  collectAppNavigationEntityIds,
  collectWorkspaceNavigationEntityIds,
  createRandomId,
  createReservedIdAllocator,
  ensureUniqueId,
} from './navigation-ids'

function generator(values: string[]) {
  let index = 0
  return () => values[index++] ?? `fallback-${index}`
}

const workspace: WorkspaceData = {
  activeTabId: 'tab-live',
  tabs: [
    {
      id: 'tab-live',
      title: 'Live',
      noteBodyId: 'body-live',
      activeSubTabId: 'sub-live',
      subTabs: [{ id: 'sub-live', title: 'Sub', noteBodyId: 'body-sub-live'}],
    },
  ],
  deletedTabs: [
    {
      id: 'deleted-tab-entry',
      deletedAt: 1,
      tab: {
        id: 'tab-deleted',
        title: 'Deleted',
        noteBodyId: 'body-deleted',
        activeSubTabId: 'sub-deleted-nested',
        subTabs: [{ id: 'sub-deleted-nested', title: 'Nested', noteBodyId: 'body-deleted-nested'}],
      },
    },
  ],
  deletedSubTabs: [
    {
      id: 'deleted-sub-entry',
      parentTabId: 'tab-live',
      parentTabTitle: 'Live',
      deletedAt: 2,
      subTab: { id: 'sub-deleted', title: 'Deleted sub', noteBodyId: 'body-sub-deleted'},
    },
  ],
}

function makeSpace(id: string, data: WorkspaceData = workspace): Space {
  return {
    id,
    name: id,
    settings: { autoRemoveDeletedDays: 7 },
    data,
  }
}

function makeState(): AppState {
  const space = makeSpace('space-live')
  const domain: Domain = {
    id: 'domain-live',
    name: 'Domain',
    activeSpaceId: space.id,
    spaces: [space],
  }
  return {
    theme: 'dawn',
    activeDomainId: domain.id,
    domains: [domain],
    noteBodies: [
      {
        id: 'note-body',
        aisles: [{ id: 'aisle-slot', aisleBodyId: 'aisle-body' }],
      },
    ],
    noteAisleBodies: [{ id: 'aisle-body', markdown: '' }],
    activeSpaceId: space.id,
    spaces: [space],
    hotkeys: {
      shortcuts: DEFAULT_SHORTCUTS,
      newlineShortcuts: DEFAULT_NEWLINE_SHORTCUT_SETTINGS,
      enableMouseBackForward: true,
      enableGenericHistoryHotkeys: true,
    },
    frontmatter: DEFAULT_FRONTMATTER_SETTINGS,
    ui: DEFAULT_UI_SETTINGS,
  }
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

  it('collects navigation ids from live and trashed workspace entries', () => {
    const ids = collectWorkspaceNavigationEntityIds(workspace)

    expect(Array.from(ids)).toEqual(
      expect.arrayContaining([
        'tab-live',
        'sub-live',
        'deleted-tab-entry',
        'tab-deleted',
        'sub-deleted-nested',
        'deleted-sub-entry',
        'sub-deleted',
      ]),
    )
  })

  it('collects ids across domains, spaces, notes, aisles, and app-level projections', () => {
    const ids = collectAppNavigationEntityIds(makeState())

    expect(Array.from(ids)).toEqual(
      expect.arrayContaining([
        'domain-live',
        'space-live',
        'tab-live',
        'sub-live',
        'note-body',
        'aisle-slot',
        'aisle-body',
      ]),
    )
  })
})
