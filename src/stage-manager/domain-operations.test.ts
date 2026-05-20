import { describe, expect, it } from 'vitest'
import { DEFAULT_FRONTMATTER_SETTINGS } from '../frontmatter/frontmatter'
import type { AppState, Domain, Space } from '../types/app'
import {
  buildStageManagerDomainAwareState,
  getStageManagerDomainSpaces,
  getStageManagerMigrateDestinationSpaces,
  projectStageManagerDomains,
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
          spaces: [{ ...renamedSpace, name: 'getting started' }, archiveSpace],
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
})
