import { describe, expect, it } from 'vitest'
import { DEFAULT_FRONTMATTER_SETTINGS } from '../../frontmatter/frontmatter'
import type { AppState, ModalState, NoteLocation, Space } from '../../types/app'
import { getModalText } from './modal-text'

const source: NoteLocation = {
  domainId: 'domain-1',
  spaceId: 'space-1',
  tabId: 'tab-1',
  subTabId: null,
}

const target: NoteLocation = {
  domainId: 'domain-1',
  spaceId: 'space-1',
  tabId: 'tab-2',
  subTabId: null,
}

function createModalTextState(): AppState {
  const space: Space = {
    id: 'space-1',
    name: 'Space',
    settings: { autoRemoveDeletedDays: 30 },
    data: {
      activeTabId: 'tab-1',
      tabs: [
        { id: 'tab-1', title: 'One', noteBodyId: 'body-1', homeContent: '', activeSubTabId: null, subTabs: [] },
        { id: 'tab-2', title: 'Two', noteBodyId: 'body-2', homeContent: '', activeSubTabId: null, subTabs: [] },
      ],
      deletedTabs: [],
      deletedSubTabs: [],
    },
  }

  return {
    theme: 'dark',
    activeDomainId: 'domain-1',
    activeSpaceId: 'space-1',
    domains: [{ id: 'domain-1', name: 'Domain', activeSpaceId: 'space-1', spaces: [space] }],
    spaces: [space],
    noteBodies: [
      { id: 'body-1', frontmatter: null, aisles: [{ id: 'aisle-1', markdown: 'existing' }] },
      { id: 'body-2', frontmatter: null, aisles: [{ id: 'aisle-2', markdown: 'target' }] },
    ],
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
    },
  }
}

describe('copy-note modal text', () => {
  it('describes independent copy mode', () => {
    const modal: ModalState = { type: 'copy-note', mode: 'independent', source, target }
    const text = getModalText(modal, createModalTextState())

    expect(text.title).toBe('make copy')
    expect(text.action).toBe('make copy')
    expect(text.body).toContain('independent copy')
  })

  it('describes linked copy mode', () => {
    const modal: ModalState = { type: 'copy-note', mode: 'linked', source, target }
    const text = getModalText(modal, createModalTextState())

    expect(text.title).toBe('make copy')
    expect(text.action).toBe('make copy')
    expect(text.body).toContain('linked copy')
  })
})
