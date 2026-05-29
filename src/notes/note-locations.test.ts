import { describe, expect, it } from 'vitest'
import type { AppState, Space, Tab } from '../types/app'
import {
  filterNoteSearchEntries,
  getDefaultNoteLinkLabel,
  getNoteLocationBreadcrumbLabel,
  listSearchableNoteLocations,
} from './note-locations'

function tab(id: string, title: string, noteBodyId: string, subTabs: Array<{ id: string; title: string; body: string }> = []): Tab {
  return {
    id,
    title,
    noteBodyId,
    activeSubTabId: subTabs[0]?.id ?? null,
    subTabs: subTabs.map((subTab) => ({
      id: subTab.id,
      title: subTab.title,
      noteBodyId: subTab.body,
    })),
  }
}

function space(id: string, name: string, tabs: Tab[]): Space {
  return {
    id,
    name,
    settings: { autoRemoveDeletedDays: 30 },
    data: {
      activeTabId: tabs[0]?.id ?? '',
      tabs,
      deletedTabs: [],
      deletedSubTabs: [],
    },
  }
}

function createState(): AppState {
  const activeSpace = space('space-a', 'Space A', [
    tab('parent-a', 'Parent A', 'body-parent-a', [
      { id: 'sub-a', title: 'Sub A', body: 'body-sub-a' },
      { id: 'sub-b', title: 'Sub B', body: 'body-sub-b' },
    ]),
    tab('parent-b', 'Parent B', 'body-parent-b', [{ id: 'sub-c', title: 'Sub C', body: 'body-sub-c' }]),
  ])
  const otherSpace = space('space-b', 'Space B', [
    tab('parent-c', 'Parent C', 'body-parent-c', [{ id: 'sub-d', title: 'Sub D', body: 'body-sub-d' }]),
  ])
  const archivedSpace = space('space-x', 'Archive', [
    tab('parent-x', 'Archived Parent', 'body-parent-x', [{ id: 'sub-x', title: 'Archived Sub', body: 'body-sub-x' }]),
  ])

  return {
    theme: 'dark',
    activeDomainId: 'domain-a',
    activeSpaceId: 'space-a',
    domains: [
      { id: 'domain-a', name: 'Domain A', activeSpaceId: 'space-a', spaces: [archivedSpace] },
      { id: 'domain-b', name: 'Domain B', activeSpaceId: 'space-b', spaces: [otherSpace] },
    ],
    spaces: [activeSpace, otherSpace],
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
        shortcuts: {
          controlEnter: 'normalNewLine',
          shiftEnter: 'normalNewLine',
          commandEnter: 'normalNewLine',
        },
        menuOperations: [],
      },
    },
    frontmatter: { templates: [], settingsTemplateId: '', lastAppliedTemplateId: '' },
    ui: {
      showParentHomeTab: true,
      stageManagerOpenDestinationAfterApply: true,
      lastLinkInsertMode: 'note',
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

describe('note link labels', () => {
  it('uses local names for notes in the same parent', () => {
    const state = createState()
    const source = { domainId: 'domain-a', spaceId: 'space-a', tabId: 'parent-a', subTabId: null }

    expect(getDefaultNoteLinkLabel(state, source, { ...source, subTabId: 'sub-a' })).toBe('Sub A')
    expect(getDefaultNoteLinkLabel(state, { ...source, subTabId: 'sub-a' }, { ...source, subTabId: null })).toBe('Parent A')
  })

  it('adds parent context for a different parent in the same space', () => {
    const state = createState()
    const source = { domainId: 'domain-a', spaceId: 'space-a', tabId: 'parent-a', subTabId: null }

    expect(getDefaultNoteLinkLabel(state, source, { domainId: 'domain-a', spaceId: 'space-a', tabId: 'parent-b', subTabId: 'sub-c' })).toBe(
      'Parent B > Sub C',
    )
    expect(getDefaultNoteLinkLabel(state, source, { domainId: 'domain-a', spaceId: 'space-a', tabId: 'parent-b', subTabId: null })).toBe(
      'Parent B > home',
    )
  })

  it('adds space context for another space or domain', () => {
    const state = createState()
    const source = { domainId: 'domain-a', spaceId: 'space-a', tabId: 'parent-a', subTabId: null }

    expect(getDefaultNoteLinkLabel(state, source, { domainId: 'domain-a', spaceId: 'space-b', tabId: 'parent-c', subTabId: 'sub-d' })).toBe(
      'Space B > Parent C > Sub D',
    )
    expect(getDefaultNoteLinkLabel(state, source, { domainId: 'domain-b', spaceId: 'space-b', tabId: 'parent-c', subTabId: null })).toBe(
      'Space B > Parent C > home',
    )
  })
})

describe('note search entries', () => {
  it('shows full domain, space, parent, and note labels', () => {
    const state = createState()

    expect(getNoteLocationBreadcrumbLabel(state, { domainId: 'domain-a', spaceId: 'space-a', tabId: 'parent-a', subTabId: 'sub-a' })).toBe(
      'Domain A > Space A > Parent A > Sub A',
    )
    expect(listSearchableNoteLocations(state).map((entry) => entry.label)).toContain('Domain A > Space A > Parent A > home')
  })

  it('filters case-insensitively across breadcrumb text', () => {
    const entries = listSearchableNoteLocations(createState())

    expect(filterNoteSearchEntries(entries, 'sub c').map((entry) => entry.label)).toEqual([
      'Domain A > Space A > Parent B > Sub C',
    ])
    expect(filterNoteSearchEntries(entries, 'domain b parent c', 2).map((entry) => entry.label)).toEqual([
      'Domain B > Space B > Parent C > home',
      'Domain B > Space B > Parent C > Sub D',
    ])
  })
})
