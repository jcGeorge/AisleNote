import { describe, expect, it } from 'vitest'
import { DEFAULT_FRONTMATTER_SETTINGS } from '../frontmatter/frontmatter'
import type { AppState, ArrangeSelectionState, Domain, Space, SubTab, Tab, WorkspaceData } from '../types/app'
import {
  EMPTY_ARRANGE_SELECTION,
  moveSelectedDomainsByInsertion,
  moveSelectedDomainsToTrash,
  moveSelectedItemsByInsertion,
  moveSelectedParentTabsToTrash,
  moveSelectedSpacesToDomain,
  moveSelectedSpacesToTrash,
  moveSelectedSpacesWithinDomain,
  moveSelectedSubTabsToParentTab,
  moveSelectedSubTabsToTrash,
  normalizeArrangeSelection,
  updateArrangeSelectionForClick,
} from './arrange-selection'

function subTab(id: string, title = id): SubTab {
  return {
    id,
    title,
    noteBodyId: `${id}-body`,
  }
}

function tab(id: string, title = id, subTabs: SubTab[] = [], activeSubTabId = subTabs[0]?.id ?? null): Tab {
  return {
    id,
    title,
    noteBodyId: `${id}-body`,
    activeSubTabId,
    subTabs,
  }
}

function workspace(tabs: Tab[], activeTabId = tabs[0]?.id ?? 'missing'): WorkspaceData {
  return {
    activeTabId,
    tabs,
    deletedTabs: [],
    deletedSubTabs: [],
  }
}

function space(id: string): Space {
  return {
    id,
    name: id,
    settings: { autoRemoveDeletedDays: 7 },
    data: workspace([tab(`${id}-tab`)], `${id}-tab`),
  }
}

function domain(id: string, spaces: Space[] = [space(`${id}-space`)]): Domain {
  return {
    id,
    name: id,
    activeSpaceId: spaces[0]?.id ?? `${id}-missing-space`,
    spaces,
  }
}

function appState(domains: Domain[], activeDomainId = domains[0].id, activeSpaceId = domains[0].activeSpaceId): AppState {
  const activeDomain = domains.find((entry) => entry.id === activeDomainId) ?? domains[0]
  return {
    theme: 'dark',
    activeDomainId,
    domains,
    noteBodies: [],
    activeSpaceId,
    spaces: activeDomain.spaces,
    hotkeys: {
      shortcuts: {
        toggleTabTrash: '',
        openDomains: '',
        openSpaces: '',
        newTab: '',
        newSubTab: '',
        formatStrikethrough: '',
        cycleParentTabNext: '',
        cycleParentTabPrev: '',
        cycleSubTabNext: '',
        cycleSubTabPrev: '',
        cycleAislePrev: '',
        cycleAisleNext: '',
      },
      newlineShortcuts: {
        shortcuts: {
          controlEnter: 'normalNewLine',
          shiftEnter: 'normalNewLine',
          commandEnter: 'normalNewLine',
        },
        menuOperations: [],
      },
    },
    frontmatter: DEFAULT_FRONTMATTER_SETTINGS,
    ui: {
      showParentHomeTab: true,
      stageManagerOpenDestinationAfterApply: true,
      tableAddTargetMode: 'bottom-right',
      tableDeleteTargetMode: 'bottom-right',
      tabButtonScale: 1,
      noteFontScale: 1,
      settingsSection: 'hotkeys',
      noteCursorLocations: {},
      headingCollapseState: {},
      seenTipIds: [],
      disabledTipIds: [],
    },
  }
}

const noSelection: ArrangeSelectionState = EMPTY_ARRANGE_SELECTION

describe('arrange modifier selection', () => {
  it('selects a parent range from the active parent on first shift-click', () => {
    const next = updateArrangeSelectionForClick({
      selection: noSelection,
      kind: 'parent',
      itemId: 'parent-4',
      orderedIds: ['parent-1', 'parent-2', 'parent-3', 'parent-4'],
      currentId: 'parent-2',
      modifiers: { shiftKey: true, ctrlKey: false, metaKey: false },
    })

    expect(next).toMatchObject({
      kind: 'parent',
      selectedIds: ['parent-2', 'parent-3', 'parent-4'],
      anchorId: 'parent-2',
    })
  })

  it('selects a domain range from the active domain on first shift-click', () => {
    const next = updateArrangeSelectionForClick({
      selection: noSelection,
      kind: 'domain',
      itemId: 'domain-4',
      orderedIds: ['domain-1', 'domain-2', 'domain-3', 'domain-4'],
      currentId: 'domain-2',
      modifiers: { shiftKey: true, ctrlKey: false, metaKey: false },
    })

    expect(next).toMatchObject({
      kind: 'domain',
      selectedIds: ['domain-2', 'domain-3', 'domain-4'],
      anchorId: 'domain-2',
    })
  })

  it('selects a visible active-domain space range from the active space on first shift-click', () => {
    const next = updateArrangeSelectionForClick({
      selection: noSelection,
      kind: 'space',
      domainId: 'domain-1',
      itemId: 'space-4',
      orderedIds: ['space-1', 'space-2', 'space-3', 'space-4'],
      currentId: 'space-2',
      modifiers: { shiftKey: true, ctrlKey: false, metaKey: false },
    })

    expect(next).toMatchObject({
      kind: 'space',
      domainId: 'domain-1',
      selectedIds: ['space-2', 'space-3', 'space-4'],
      anchorId: 'space-2',
    })
  })

  it('ctrl/cmd toggles domains and spaces while seeding the active same-kind item', () => {
    const domainSelection = updateArrangeSelectionForClick({
      selection: noSelection,
      kind: 'domain',
      itemId: 'domain-3',
      orderedIds: ['domain-1', 'domain-2', 'domain-3'],
      currentId: 'domain-1',
      modifiers: { shiftKey: false, ctrlKey: true, metaKey: false },
    })
    const spaceSelection = updateArrangeSelectionForClick({
      selection: noSelection,
      kind: 'space',
      domainId: 'domain-1',
      itemId: 'space-3',
      orderedIds: ['space-1', 'space-2', 'space-3'],
      currentId: 'space-1',
      modifiers: { shiftKey: false, ctrlKey: false, metaKey: true },
    })

    expect(domainSelection.selectedIds).toEqual(['domain-1', 'domain-3'])
    expect(spaceSelection.selectedIds).toEqual(['space-1', 'space-3'])
  })

  it('selects a sub-tab range from the active sub-tab on first shift-click', () => {
    const next = updateArrangeSelectionForClick({
      selection: noSelection,
      kind: 'subtab',
      parentTabId: 'parent-1',
      itemId: 'sub-4',
      orderedIds: ['sub-1', 'sub-2', 'sub-3', 'sub-4'],
      currentId: 'sub-2',
      modifiers: { shiftKey: true, ctrlKey: false, metaKey: false },
    })

    expect(next).toMatchObject({
      kind: 'subtab',
      parentTabId: 'parent-1',
      selectedIds: ['sub-2', 'sub-3', 'sub-4'],
      anchorId: 'sub-2',
    })
  })

  it('ctrl/cmd toggles while seeding the current same-kind item on first modifier click', () => {
    const first = updateArrangeSelectionForClick({
      selection: noSelection,
      kind: 'parent',
      itemId: 'parent-3',
      orderedIds: ['parent-1', 'parent-2', 'parent-3'],
      currentId: 'parent-1',
      modifiers: { shiftKey: false, ctrlKey: true, metaKey: false },
    })
    const second = updateArrangeSelectionForClick({
      selection: first,
      kind: 'parent',
      itemId: 'parent-1',
      orderedIds: ['parent-1', 'parent-2', 'parent-3'],
      currentId: 'parent-1',
      modifiers: { shiftKey: false, ctrlKey: false, metaKey: true },
    })

    expect(first.selectedIds).toEqual(['parent-1', 'parent-3'])
    expect(second.selectedIds).toEqual(['parent-3'])
  })

  it('switching selection kind clears the previous homogeneous group', () => {
    const parentSelection = updateArrangeSelectionForClick({
      selection: noSelection,
      kind: 'parent',
      itemId: 'parent-2',
      orderedIds: ['parent-1', 'parent-2'],
      currentId: 'parent-1',
      modifiers: { shiftKey: false, ctrlKey: true, metaKey: false },
    })
    const subTabSelection = updateArrangeSelectionForClick({
      selection: parentSelection,
      kind: 'subtab',
      parentTabId: 'parent-1',
      itemId: 'sub-2',
      orderedIds: ['sub-1', 'sub-2'],
      currentId: 'sub-1',
      modifiers: { shiftKey: false, ctrlKey: true, metaKey: false },
    })

    expect(parentSelection.selectedIds).toEqual(['parent-1', 'parent-2'])
    expect(subTabSelection).toMatchObject({
      kind: 'subtab',
      parentTabId: 'parent-1',
      selectedIds: ['sub-1', 'sub-2'],
    })
  })

  it('switching to domain selection clears a previous note selection', () => {
    const parentSelection = updateArrangeSelectionForClick({
      selection: noSelection,
      kind: 'parent',
      itemId: 'parent-2',
      orderedIds: ['parent-1', 'parent-2'],
      currentId: 'parent-1',
      modifiers: { shiftKey: false, ctrlKey: true, metaKey: false },
    })
    const domainSelection = updateArrangeSelectionForClick({
      selection: parentSelection,
      kind: 'domain',
      itemId: 'domain-2',
      orderedIds: ['domain-1', 'domain-2'],
      currentId: 'domain-1',
      modifiers: { shiftKey: false, ctrlKey: true, metaKey: false },
    })

    expect(domainSelection).toMatchObject({
      kind: 'domain',
      selectedIds: ['domain-1', 'domain-2'],
    })
  })

  it('normalizes active-domain space selections away when the active domain changes', () => {
    const selection = updateArrangeSelectionForClick({
      selection: noSelection,
      kind: 'space',
      domainId: 'domain-1',
      itemId: 'space-2',
      orderedIds: ['space-1', 'space-2'],
      currentId: 'space-1',
      modifiers: { shiftKey: false, ctrlKey: true, metaKey: false },
    })

    const normalized = normalizeArrangeSelection({
      selection,
      orderedParentIds: ['parent-1'],
      activeParentTabId: 'parent-1',
      orderedActiveSubTabIds: [],
      orderedDomainIds: ['domain-1', 'domain-2'],
      activeDomainId: 'domain-2',
      orderedActiveDomainSpaceIds: ['space-3'],
    })

    expect(normalized).toBe(EMPTY_ARRANGE_SELECTION)
  })
})

describe('arrange group operations', () => {
  it('reorders selected parents as one ordered block', () => {
    const parents = [tab('parent-1'), tab('parent-2'), tab('parent-3'), tab('parent-4')]
    const next = moveSelectedItemsByInsertion(parents, ['parent-2', 'parent-3'], 'parent-4', 'after')

    expect(next.map((entry) => entry.id)).toEqual(['parent-1', 'parent-4', 'parent-2', 'parent-3'])
    expect(moveSelectedItemsByInsertion(parents, ['parent-2', 'parent-3'], 'parent-3', 'after')).toBe(parents)
  })

  it('reorders selected sub-tabs as one ordered block', () => {
    const subTabs = [subTab('sub-1'), subTab('sub-2'), subTab('sub-3'), subTab('sub-4')]
    const next = moveSelectedItemsByInsertion(subTabs, ['sub-2', 'sub-3'], 'sub-1', 'before')

    expect(next.map((entry) => entry.id)).toEqual(['sub-2', 'sub-3', 'sub-1', 'sub-4'])
  })

  it('moves selected sub-tabs to another parent in source order', () => {
    const source = tab('parent-1', 'Source', [subTab('sub-1'), subTab('sub-2'), subTab('sub-3')], 'sub-2')
    const target = tab('parent-2', 'Target', [subTab('sub-4')], 'sub-4')
    const next = moveSelectedSubTabsToParentTab(workspace([source, target], source.id), source.id, ['sub-1', 'sub-3'], target.id)

    expect(next.activeTabId).toBe(target.id)
    expect(next.tabs.find((entry) => entry.id === source.id)?.subTabs.map((entry) => entry.id)).toEqual(['sub-2'])
    expect(next.tabs.find((entry) => entry.id === source.id)?.activeSubTabId).toBe('sub-2')
    expect(next.tabs.find((entry) => entry.id === target.id)?.activeSubTabId).toBe('sub-1')
    expect(next.tabs.find((entry) => entry.id === target.id)?.subTabs.map((entry) => entry.id)).toEqual([
      'sub-4',
      'sub-1',
      'sub-3',
    ])
  })

  it('moves selected parents to trash and creates a fallback when all parents are moved', () => {
    const only = tab('parent-1', 'Only')
    const fallback = tab('fallback', 'Fallback')
    const next = moveSelectedParentTabsToTrash(workspace([only], only.id), [only.id], {
      deletedAt: 123,
      createDeletedEntryId: () => 'deleted-parent-1',
      createFallbackTab: () => fallback,
    })

    expect(next.tabs).toEqual([fallback])
    expect(next.activeTabId).toBe(fallback.id)
    expect(next.deletedTabs).toEqual([{ id: 'deleted-parent-1', tab: only, deletedAt: 123 }])
  })

  it('moves selected sub-tabs to trash in parent order', () => {
    const source = tab('parent-1', 'Parent', [subTab('sub-1'), subTab('sub-2'), subTab('sub-3')], 'sub-2')
    const deletedIds = ['deleted-sub-1', 'deleted-sub-2']
    const next = moveSelectedSubTabsToTrash(workspace([source], source.id), source.id, ['sub-1', 'sub-2'], {
      deletedAt: 123,
      createDeletedEntryId: () => deletedIds.shift() ?? 'missing',
    })

    expect(next.tabs[0].activeSubTabId).toBeNull()
    expect(next.tabs[0].subTabs.map((entry) => entry.id)).toEqual(['sub-3'])
    expect(next.deletedSubTabs.map((entry) => entry.id)).toEqual(['deleted-sub-1', 'deleted-sub-2'])
    expect(next.deletedSubTabs.map((entry) => entry.subTab.id)).toEqual(['sub-1', 'sub-2'])
  })

  it('reorders selected domains as one ordered block', () => {
    const initial = appState([domain('domain-1'), domain('domain-2'), domain('domain-3'), domain('domain-4')])
    const next = moveSelectedDomainsByInsertion(initial, ['domain-2', 'domain-3'], 'domain-4', 'after')
    const noOp = moveSelectedDomainsByInsertion(initial, ['domain-2', 'domain-3'], 'domain-3', 'after')

    expect(next.domains.map((entry) => entry.id)).toEqual(['domain-1', 'domain-4', 'domain-2', 'domain-3'])
    expect(noOp.domains.map((entry) => entry.id)).toEqual(initial.domains.map((entry) => entry.id))
  })

  it('reorders selected spaces as one ordered block inside the active domain', () => {
    const spaces = [space('space-1'), space('space-2'), space('space-3'), space('space-4')]
    const initial = appState([domain('domain-1', spaces)], 'domain-1', 'space-1')
    const next = moveSelectedSpacesWithinDomain(initial, 'domain-1', ['space-2', 'space-3'], 'space-1', 'before')

    expect(next.spaces.map((entry) => entry.id)).toEqual(['space-2', 'space-3', 'space-1', 'space-4'])
    expect(next.domains[0].spaces.map((entry) => entry.id)).toEqual(['space-2', 'space-3', 'space-1', 'space-4'])
  })

  it('moves selected spaces to another domain in source order', () => {
    const initial = appState([
      domain('domain-1', [space('space-1'), space('space-2'), space('space-3')]),
      domain('domain-2', [space('space-4')]),
    ])
    const result = moveSelectedSpacesToDomain(initial, 'domain-1', ['space-1', 'space-3'], 'domain-2')

    expect(result.changed).toBe(true)
    expect(result.state.domains.find((entry) => entry.id === 'domain-1')?.spaces.map((entry) => entry.id)).toEqual(['space-2'])
    expect(result.state.domains.find((entry) => entry.id === 'domain-2')?.spaces.map((entry) => entry.id)).toEqual([
      'space-4',
      'space-1',
      'space-3',
    ])
    expect(result.state.activeDomainId).toBe('domain-2')
    expect(result.state.activeSpaceId).toBe('space-1')
  })

  it('moves selected domains to trash while blocking the last live domain', () => {
    const ids = ['deleted-domain-1', 'deleted-domain-2']
    const initial = appState([domain('domain-1'), domain('domain-2'), domain('domain-3')])
    const result = moveSelectedDomainsToTrash(initial, ['domain-1', 'domain-3'], () => ids.shift() ?? 'missing')
    const blocked = moveSelectedDomainsToTrash(appState([domain('domain-1')]), ['domain-1'])

    expect(result.changed).toBe(true)
    expect(result.state.domains.map((entry) => entry.id)).toEqual(['domain-2'])
    expect(result.state.deletedDomains?.map((entry) => entry.domain.id)).toEqual(['domain-1', 'domain-3'])
    expect(blocked.changed).toBe(false)
    expect(blocked.reason).toBe('last-domain')
  })

  it('moves selected spaces to trash while blocking the last live space', () => {
    const ids = ['deleted-space-1', 'deleted-space-2']
    const initial = appState([domain('domain-1', [space('space-1'), space('space-2'), space('space-3')])])
    const result = moveSelectedSpacesToTrash(initial, 'domain-1', ['space-1', 'space-3'], () => ids.shift() ?? 'missing')
    const blocked = moveSelectedSpacesToTrash(appState([domain('domain-1', [space('space-1')])]), 'domain-1', ['space-1'])

    expect(result.changed).toBe(true)
    expect(result.state.domains[0].spaces.map((entry) => entry.id)).toEqual(['space-2'])
    expect(result.state.deletedSpaces?.map((entry) => entry.space.id)).toEqual(['space-1', 'space-3'])
    expect(blocked.changed).toBe(false)
    expect(blocked.reason).toBe('last-space')
  })
})
