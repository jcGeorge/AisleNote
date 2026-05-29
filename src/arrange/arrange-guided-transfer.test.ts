import { describe, expect, it } from 'vitest'
import { DEFAULT_FRONTMATTER_SETTINGS } from '../frontmatter/frontmatter'
import type { AppState, ArrangeHierarchyDropRequest, Domain, Space, SubTab, Tab, TabArrangeDragPreview } from '../types/app'
import {
  getFirstParentTabInSpace,
  getFirstSpaceInDomain,
  resolveArrangeDomainDestination,
  resolveArrangeHierarchyDrop,
  resolveArrangePromptDomainConfirmation,
  resolveArrangePromptSpaceSelection,
} from './arrange-guided-transfer'

function subTab(id: string): SubTab {
  return {
    id,
    title: id,
    noteBodyId: `${id}-body`,
  }
}

function tab(id: string, subTabs: SubTab[] = []): Tab {
  return {
    id,
    title: id,
    noteBodyId: `${id}-body`,
    activeSubTabId: subTabs[0]?.id ?? null,
    subTabs,
  }
}

function space(id: string, tabs: Tab[]): Space {
  return {
    id,
    name: id,
    settings: { autoRemoveDeletedDays: 7 },
    data: {
      activeTabId: tabs[0]?.id ?? '',
      tabs,
      deletedTabs: [],
      deletedSubTabs: [],
    },
  }
}

function domain(id: string, spaces: Space[], activeSpaceId = spaces[0]?.id ?? ''): Domain {
  return {
    id,
    name: id,
    activeSpaceId,
    spaces,
  }
}

function appState(domains: Domain[], activeDomainId = domains[0].id, activeSpaceId = domains[0].activeSpaceId): AppState {
  const activeDomain = domains.find((entry) => entry.id === activeDomainId) ?? domains[0]
  return {
    theme: 'dark',
    activeDomainId,
    activeSpaceId,
    spaces: activeDomain.spaces,
    domains,
    deletedDomains: [],
    deletedSpaces: [],
    noteBodies: [],
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
        shortcuts: { controlEnter: 'normalNewLine', shiftEnter: 'normalNewLine', commandEnter: 'normalNewLine' },
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
      settingsSection: 'visuals',
      noteCursorLocations: {},
      headingCollapseState: {},
      seenTipIds: [],
      disabledTipIds: [],
    },
  }
}

const preview: TabArrangeDragPreview = {
  item: { type: 'tab', tabId: 'parent-a' },
  label: 'Parent A',
  variant: 'parent',
  currentX: 10,
  currentY: 20,
  offsetX: 4,
  offsetY: 5,
  width: 100,
  height: 30,
}

const parentToDomain: ArrangeHierarchyDropRequest = {
  sourceDomainId: 'domain-a',
  sourceSpaceId: 'source',
  item: { type: 'parent', parentTabIds: ['parent-a'] },
  target: { type: 'domain', domainId: 'domain-b' },
}

const subTabToDomain: ArrangeHierarchyDropRequest = {
  sourceDomainId: 'domain-a',
  sourceSpaceId: 'source',
  item: { type: 'subtab', parentTabId: 'parent-a', subTabIds: ['sub-a'] },
  target: { type: 'domain', domainId: 'domain-b' },
}

describe('arrange guided transfer resolution', () => {
  it('reads the first space and first parent independently from the active space', () => {
    const state = appState([
      domain(
        'domain-a',
        [space('first-space', [tab('first-parent')]), space('active-space', [tab('active-parent')])],
        'active-space',
      ),
    ])

    expect(getFirstSpaceInDomain(state, 'domain-a')?.space.id).toBe('first-space')
    expect(getFirstParentTabInSpace(state, 'domain-a', 'first-space')?.id).toBe('first-parent')
  })

  it('keeps direct parent-to-space drops as immediate append moves', () => {
    const state = appState([domain('domain-a', [space('source', [tab('parent-a')]), space('target', [tab('parent-b')])])])

    const resolution = resolveArrangeHierarchyDrop(
      state,
      {
        ...parentToDomain,
        target: { type: 'space', domainId: 'domain-a', spaceId: 'target' },
      },
      preview,
    )

    expect(resolution).toMatchObject({
      type: 'move-parent-to-space',
      targetDomainId: 'domain-a',
      targetSpaceId: 'target',
    })
  })

  it('turns parent-to-domain drops into parent placement, even with one target space', () => {
    const state = appState([
      domain('domain-a', [space('source', [tab('parent-a')])], 'source'),
      domain('domain-b', [space('target', [tab('parent-b')])], 'target'),
    ])

    const resolution = resolveArrangeDomainDestination(state, parentToDomain, preview, 'domain-b')

    expect(resolution).toMatchObject({
      type: 'prompt',
      focus: { domainId: 'domain-b', spaceId: 'target' },
      prompt: {
        mode: 'space-or-parent-placement',
        targetDomainId: 'domain-b',
        targetSpaceId: 'target',
      },
    })
  })

  it('auto-completes a sub-tab domain drop when the only target space has one parent', () => {
    const state = appState([
      domain('domain-a', [space('source', [tab('parent-a', [subTab('sub-a')])])], 'source'),
      domain('domain-b', [space('target', [tab('parent-b')])], 'target'),
    ])

    const resolution = resolveArrangeDomainDestination(state, subTabToDomain, preview, 'domain-b')

    expect(resolution).toMatchObject({
      type: 'move-subtabs-to-parent',
      targetDomainId: 'domain-b',
      targetSpaceId: 'target',
      targetParentTabId: 'parent-b',
    })
  })

  it('allows immediate parent selection for sub-tab domain drops with multiple spaces', () => {
    const state = appState([
      domain('domain-a', [space('source', [tab('parent-a', [subTab('sub-a')])])], 'source'),
      domain(
        'domain-b',
        [space('target-a', [tab('parent-b'), tab('parent-c')]), space('target-b', [tab('parent-d')])],
        'target-a',
      ),
    ])

    const resolution = resolveArrangeDomainDestination(state, subTabToDomain, preview, 'domain-b')

    expect(resolution).toMatchObject({
      type: 'prompt',
      focus: { domainId: 'domain-b', spaceId: 'target-a' },
      prompt: {
        mode: 'space-or-parent',
        targetDomainId: 'domain-b',
        targetSpaceId: 'target-a',
      },
    })
  })

  it('auto-completes sub-tab prompt space selection when that space has one parent', () => {
    const state = appState([
      domain('domain-a', [space('source', [tab('parent-a', [subTab('sub-a')])])], 'source'),
      domain(
        'domain-b',
        [space('target-a', [tab('parent-b'), tab('parent-c')]), space('target-b', [tab('parent-d')])],
        'target-a',
      ),
    ])
    const promptResolution = resolveArrangeDomainDestination(state, subTabToDomain, preview, 'domain-b')
    if (promptResolution.type !== 'prompt') throw new Error('expected prompt')

    const resolution = resolveArrangePromptSpaceSelection(state, promptResolution.prompt, 'target-b')

    expect(resolution).toMatchObject({
      type: 'move-subtabs-to-parent',
      targetDomainId: 'domain-b',
      targetSpaceId: 'target-b',
      targetParentTabId: 'parent-d',
    })
  })

  it('confirms a carried parent drop on the same domain by appending to that domain first space', () => {
    const state = appState([
      domain('domain-a', [space('source', [tab('parent-a')])], 'source'),
      domain(
        'domain-b',
        [space('first-space', [tab('first-parent')]), space('active-space', [tab('active-parent')])],
        'active-space',
      ),
    ])
    const promptResolution = resolveArrangeDomainDestination(state, parentToDomain, preview, 'domain-b')
    if (promptResolution.type !== 'prompt') throw new Error('expected prompt')

    const resolution = resolveArrangePromptDomainConfirmation(state, promptResolution.prompt, 'domain-b')

    expect(resolution).toMatchObject({
      type: 'move-parent-to-space',
      targetDomainId: 'domain-b',
      targetSpaceId: 'first-space',
    })
    if (resolution.type !== 'move-parent-to-space') throw new Error('expected parent move')
    expect(resolution.placement).toBeUndefined()
  })

  it('confirms a carried sub-tab drop on the same domain by appending to the first parent in the first space', () => {
    const state = appState([
      domain('domain-a', [space('source', [tab('parent-a', [subTab('sub-a')])])], 'source'),
      domain(
        'domain-b',
        [space('first-space', [tab('first-parent')]), space('active-space', [tab('active-parent'), tab('other-parent')])],
        'active-space',
      ),
    ])
    const promptResolution = resolveArrangeDomainDestination(state, subTabToDomain, preview, 'domain-b')
    if (promptResolution.type !== 'prompt') throw new Error('expected prompt')

    const resolution = resolveArrangePromptDomainConfirmation(state, promptResolution.prompt, 'domain-b')

    expect(resolution).toMatchObject({
      type: 'move-subtabs-to-parent',
      targetDomainId: 'domain-b',
      targetSpaceId: 'first-space',
      targetParentTabId: 'first-parent',
    })
  })

  it('keeps a different-domain guided click as a focus-changing prompt', () => {
    const state = appState([
      domain('domain-a', [space('source', [tab('parent-a')])], 'source'),
      domain('domain-b', [space('domain-b-space', [tab('domain-b-parent')])], 'domain-b-space'),
      domain('domain-c', [space('domain-c-space', [tab('domain-c-parent')])], 'domain-c-space'),
    ])
    const promptResolution = resolveArrangeDomainDestination(state, parentToDomain, preview, 'domain-b')
    if (promptResolution.type !== 'prompt') throw new Error('expected prompt')

    const resolution = resolveArrangePromptDomainConfirmation(state, promptResolution.prompt, 'domain-c')

    expect(resolution).toMatchObject({
      type: 'prompt',
      focus: { domainId: 'domain-c', spaceId: 'domain-c-space' },
      prompt: {
        targetDomainId: 'domain-c',
        targetSpaceId: 'domain-c-space',
      },
    })
  })

  it('leaves malformed same-domain confirmations unchanged when the target has no readable destination', () => {
    const state = appState([
      domain('domain-a', [space('source', [tab('parent-a', [subTab('sub-a')])])], 'source'),
      domain('domain-b', [space('empty-space', []), space('active-space', [tab('active-parent')])], 'active-space'),
    ])
    const promptResolution = resolveArrangeDomainDestination(state, subTabToDomain, preview, 'domain-b')
    if (promptResolution.type !== 'prompt') throw new Error('expected prompt')

    expect(resolveArrangePromptDomainConfirmation(state, promptResolution.prompt, 'missing-domain')).toMatchObject({
      type: 'none',
    })
    expect(resolveArrangePromptDomainConfirmation(state, promptResolution.prompt, 'domain-b')).toMatchObject({
      type: 'none',
    })
  })
})
