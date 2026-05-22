import { describe, expect, it } from 'vitest'
import { DEFAULT_FRONTMATTER_SETTINGS } from '../frontmatter/frontmatter'
import type { AppState, Domain, Space } from '../types/app'
import {
  buildStageManagerDomainAwareState,
  demoteStageManagerDomainsToSpaces,
  getStageManagerDomainSpaces,
  getStageManagerMigrateDestinationSpaces,
  migrateStageManagerSpacesToDomain,
  moveStageManagerDomainsToTrash,
  moveStageManagerSpacesToTrash,
  projectStageManagerDomains,
  promoteStageManagerSpacesToDomains,
  replaceStageManagerDomainSpaces,
} from './domain-operations'

const makeSpace = (id: string): Space => ({
  id,
  name: id,
  settings: { autoRemoveDeletedDays: 7 },
  data: { activeTabId: 'tab', tabs: [], deletedTabs: [], deletedSubTabs: [] },
})

const domainA: Domain = {
  id: 'domain-a',
  name: 'A',
  activeSpaceId: 'space-a',
  spaces: [makeSpace('space-a')],
}

const domainB: Domain = {
  id: 'domain-b',
  name: 'B',
  activeSpaceId: 'space-b',
  spaces: [makeSpace('space-b')],
}

const state: AppState = {
  theme: 'dawn',
  activeDomainId: 'domain-a',
  domains: [domainA, domainB],
  noteBodies: [],
  activeSpaceId: 'space-runtime',
  spaces: [makeSpace('space-runtime')],
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
    },
    newlineShortcuts: {
      shortcuts: {
        controlEnter: 'normalNewLine',
        shiftEnter: 'normalNewLine',
        commandEnter: 'normalNewLine',
      },
      menuOperations: [],
    },
    enableMouseBackForward: true,
    enableGenericHistoryHotkeys: true,
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
    customThemePalette: null,
    noteCursorLocations: {},
    headingCollapseState: {},
    seenTipIds: [],
    disabledTipIds: [],
  },
}

describe('stage manager domain operations', () => {
  it('projects runtime active spaces into the active domain', () => {
    const domains = projectStageManagerDomains(state)

    expect(getStageManagerDomainSpaces(domains, 'domain-a').map((space) => space.id)).toEqual(['space-runtime'])
    expect(getStageManagerDomainSpaces(domains, 'domain-b').map((space) => space.id)).toEqual(['space-b'])
  })

  it('excludes the active space from existing migrate-to-space destinations', () => {
    const renamedSpace = { ...makeSpace('getting-started-space'), name: 'mySpace' }
    const archiveSpace = { ...makeSpace('space-archive'), name: 'Archive' }
    const domains = projectStageManagerDomains({
      ...state,
      activeDomainId: 'domain-a',
      activeSpaceId: renamedSpace.id,
      spaces: [renamedSpace, archiveSpace],
      domains: [
        {
          ...domainA,
          activeSpaceId: renamedSpace.id,
          spaces: [{ ...renamedSpace, name: 'first steps' }, archiveSpace],
        },
        domainB,
      ],
    })

    expect(getStageManagerDomainSpaces(domains, 'domain-a')).toEqual([renamedSpace, archiveSpace])
    expect(
      getStageManagerMigrateDestinationSpaces({
        domains,
        migrateDomainId: 'domain-a',
        activeDomainId: 'domain-a',
        activeSpaceId: renamedSpace.id,
      }).map((space) => space.id),
    ).toEqual([archiveSpace.id])
    expect(
      getStageManagerMigrateDestinationSpaces({
        domains,
        migrateDomainId: 'domain-b',
        activeDomainId: 'domain-a',
        activeSpaceId: renamedSpace.id,
      }).map((space) => space.id),
    ).toEqual(['space-b'])
  })

  it('keeps active space valid when replacing domain spaces', () => {
    const replacement = [makeSpace('space-c')]
    const domains = replaceStageManagerDomainSpaces([domainA], 'domain-a', replacement, 'missing-space')

    expect(domains[0].activeSpaceId).toBe('space-c')
  })

  it('builds an app state from a destination domain and space', () => {
    const nextState = buildStageManagerDomainAwareState(state, [domainA, domainB], 'domain-b', 'space-b')

    expect(nextState.activeDomainId).toBe('domain-b')
    expect(nextState.activeSpaceId).toBe('space-b')
    expect(nextState.spaces).toEqual(domainB.spaces)
  })

  it('migrates selected spaces to another domain in source order', () => {
    const spaceA = makeSpace('space-a')
    const spaceB = makeSpace('space-b')
    const spaceC = makeSpace('space-c')
    const targetDomain = { ...domainB, activeSpaceId: 'space-d', spaces: [makeSpace('space-d')] }
    const nextState = {
      ...state,
      activeDomainId: 'domain-a',
      activeSpaceId: spaceA.id,
      spaces: [spaceA, spaceB, spaceC],
      domains: [
        { ...domainA, activeSpaceId: spaceA.id, spaces: [spaceA, spaceB, spaceC] },
        targetDomain,
      ],
    }

    const result = migrateStageManagerSpacesToDomain(nextState, 'domain-a', ['space-c', 'space-b'], 'domain-b')

    expect(result.changed).toBe(true)
    expect(result.state.domains.find((domain) => domain.id === 'domain-a')?.spaces.map((space) => space.id)).toEqual(['space-a'])
    expect(result.state.domains.find((domain) => domain.id === 'domain-b')?.spaces.map((space) => space.id)).toEqual([
      'space-d',
      'space-b',
      'space-c',
    ])
  })

  it('promotes selected spaces into new domains with main inner spaces', () => {
    let nextId = 0
    const spaceA = { ...makeSpace('space-a'), name: 'Keep' }
    const spaceB = { ...makeSpace('space-b'), name: 'Writing' }
    const spaceC = { ...makeSpace('space-c'), name: 'Research' }
    const nextState = {
      ...state,
      activeDomainId: 'domain-a',
      activeSpaceId: spaceA.id,
      spaces: [spaceA, spaceB, spaceC],
      domains: [{ ...domainA, activeSpaceId: spaceA.id, spaces: [spaceA, spaceB, spaceC] }],
    }

    const result = promoteStageManagerSpacesToDomains(nextState, 'domain-a', ['space-b', 'space-c'], () => `new-domain-${++nextId}`)

    expect(result.changed).toBe(true)
    expect(result.state.domains.map((domain) => domain.name)).toEqual(['A', 'Writing', 'Research'])
    expect(result.state.domains[1].spaces).toMatchObject([{ id: 'space-b', name: 'main' }])
    expect(result.state.domains[2].spaces).toMatchObject([{ id: 'space-c', name: 'main' }])
  })

  it('blocks space migration, promotion, and trash when the source domain would be empty', () => {
    const migrate = migrateStageManagerSpacesToDomain(state, 'domain-a', ['space-runtime'], 'domain-b')
    const promote = promoteStageManagerSpacesToDomains(state, 'domain-a', ['space-runtime'], () => 'new-domain')
    const trash = moveStageManagerSpacesToTrash(state, 'domain-a', ['space-runtime'], () => 'trash-entry')

    expect(migrate.reason).toBe('last-space')
    expect(promote.reason).toBe('last-space')
    expect(trash.reason).toBe('last-space')
  })

  it('demotes single-space domains into another domain and blocks invalid domain demotions', () => {
    const result = demoteStageManagerDomainsToSpaces(state, ['domain-b'], 'domain-a')
    const blockedTarget = demoteStageManagerDomainsToSpaces(state, ['domain-b'], 'domain-b')
    const blockedMultiSpace = demoteStageManagerDomainsToSpaces(
      {
        ...state,
        activeDomainId: 'domain-b',
        activeSpaceId: 'space-b',
        spaces: domainB.spaces,
        domains: [{ ...domainA, spaces: [makeSpace('space-a'), makeSpace('space-extra')] }, domainB],
      },
      ['domain-a'],
      'domain-b',
    )

    expect(result.changed).toBe(true)
    expect(result.state.domains.map((domain) => domain.id)).toEqual(['domain-a'])
    expect(result.state.domains[0].spaces.map((space) => space.name)).toEqual(['space-runtime', 'B'])
    expect(blockedTarget.reason).toBe('invalid-target')
    expect(blockedMultiSpace.reason).toBe('multi-space-domain')
  })

  it('moves selected domains to trash without removing the last live domain', () => {
    const result = moveStageManagerDomainsToTrash(state, ['domain-b'], () => 'deleted-domain')
    const blocked = moveStageManagerDomainsToTrash({ ...state, domains: [domainA] }, ['domain-a'], () => 'deleted-domain')

    expect(result.changed).toBe(true)
    expect(result.state.deletedDomains?.[0].domain.id).toBe('domain-b')
    expect(blocked.reason).toBe('last-domain')
  })
})
