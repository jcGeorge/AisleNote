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
        { id: 'tab-1', title: 'One', noteBodyId: 'body-1', activeSubTabId: null, subTabs: [] },
        { id: 'tab-2', title: 'Two', noteBodyId: 'body-2', activeSubTabId: null, subTabs: [] },
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
      { id: 'body-1', aisles: [{ id: 'aisle-1', aisleBodyId: 'aisle-body-1' }] },
      { id: 'body-2', aisles: [{ id: 'aisle-2', aisleBodyId: 'aisle-body-2' }] },
    ],
    noteAisleBodies: [
      { id: 'aisle-body-1', markdown: 'existing' },
      { id: 'aisle-body-2', markdown: 'target' },
    ],
    hotkeys: {
      shortcuts: {
        toggleNotesTrash: '',
        toggleNotesScratchpad: '',
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

describe('copy-note modal text', () => {
  it('describes independent copy mode', () => {
    const modal: ModalState = { type: 'copy-note', mode: 'independent', destinationMode: 'replace', source, target }
    const text = getModalText(modal, createModalTextState())

    expect(text.title).toBe('make copy')
    expect(text.action).toBe('make copy')
    expect(text.body).toContain('independent copy')
  })

  it('describes synced copy mode', () => {
    const modal: ModalState = { type: 'copy-note', mode: 'linked', destinationMode: 'replace', source, target }
    const text = getModalText(modal, createModalTextState())

    expect(text.title).toBe('make copy')
    expect(text.action).toBe('make copy')
    expect(text.body).toContain('synced copy')
  })

  it('warns before pasting a synced note over aisles', () => {
    const modal: ModalState = { type: 'confirm-synced-note-paste', source, destination: target, destinationAisleId: 'aisle-2' }
    const text = getModalText(modal, createModalTextState())

    expect(text.title).toBe('paste synced note?')
    expect(text.action).toBe('paste synced note')
    expect(text.body).toContain('replace this note and all of its aisles')
    expect(text.body).toContain('synced aisle')
  })

  it('describes the synced aisle choice for single-aisle note copies', () => {
    const modal: ModalState = {
      type: 'confirm-synced-note-paste',
      source,
      destination: target,
      destinationAisleId: 'aisle-2',
      sourceAisleId: 'aisle-1',
    }
    const text = getModalText(modal, createModalTextState())

    expect(text.title).toBe('paste synced note?')
    expect(text.action).toBe('paste synced note')
    expect(text.body).toContain('one aisle')
    expect(text.body).toContain('current aisle instead')
  })
})

describe('delete target modal text', () => {
  it('describes domain deletion modes', () => {
    const modal: ModalState = { type: 'delete-target', target: { type: 'domain', domainId: 'domain-1' }, permanent: false }
    const permanentModal: ModalState = { ...modal, permanent: true }

    expect(getModalText(modal, createModalTextState())).toMatchObject({
      title: 'move domain to trash?',
      action: 'delete domain',
    })
    expect(getModalText(permanentModal, createModalTextState())).toMatchObject({
      title: 'delete domain for real?',
      action: 'delete for real',
    })
  })
})

describe('de-couple modal text', () => {
  it('describes copied data when de-coupled items keep data', () => {
    const modal: ModalState = {
      type: 'deduplicate-note',
      noteBodyId: 'body-1',
      keepLocationKeys: [],
      keepData: true,
    }
    const text = getModalText(modal, createModalTextState())

    expect(text.title).toBe('de-couple')
    expect(text.body).toBe('Select items to de-couple.')
  })

  it('describes linked aisle and whole-note link pages', () => {
    const base = {
      noteBodyId: 'body-1',
      aisleId: 'aisle-1',
      aisleBodyId: 'aisle-body-1',
      location: { domainId: 'domain-1', spaceId: 'space-1', tabId: 'tab-1', subTabId: null },
    }
    const aisleText = getModalText(
      {
        type: 'linked-aisle',
        reason: 'aisle-body',
        ...base,
        keepAisleSlotKeys: ['body-1::aisle-1'],
        keepData: true,
      },
      createModalTextState(),
    )
    const noteText = getModalText(
      {
        type: 'linked-aisle',
        reason: 'note-body',
        ...base,
        keepLocationKeys: ['domain-1::space-1::tab-1::__home__'],
        keepData: true,
      },
      createModalTextState(),
    )

    expect(aisleText).toMatchObject({ title: 'linked aisle', action: 'apply' })
    expect(aisleText.body).toBe('Select aisles to de-couple.')
    expect(noteText).toMatchObject({ title: 'linked note', action: 'apply' })
    expect(noteText.body).toBe('Select items to de-couple.')
  })
})
