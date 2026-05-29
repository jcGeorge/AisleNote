import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEFAULT_FRONTMATTER_SETTINGS } from '../../frontmatter/frontmatter'
import type { AppState, ModalState, NewlineOperationId, Space } from '../../types/app'
import { makeFrontmatterRowsManual, normalizeFrontmatterModalRows } from './frontmatter-modal-state'
import { shouldModalBackdropClose } from './modal-behavior'
import { shouldSubmitInsertNoteReferenceOnEnter } from './modal-keyboard'
import { ModalHost } from './ModalHost'

const space: Space = {
  id: 'space-1',
  name: 'Space',
  settings: { autoRemoveDeletedDays: 30 },
  data: {
    activeTabId: 'tab-1',
    tabs: [{ id: 'tab-1', title: 'Tab', noteBodyId: 'body-1', activeSubTabId: null, subTabs: [] }],
    deletedTabs: [],
    deletedSubTabs: [],
  },
}

function createSpace(
  id: string,
  name: string,
  tabs: Space['data']['tabs'],
): Space {
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
  return {
    theme: 'dawn',
    activeDomainId: 'domain-1',
    activeSpaceId: space.id,
    domains: [{ id: 'domain-1', name: 'Domain', activeSpaceId: space.id, spaces: [space] }],
    spaces: [space],
    noteBodies: [{ id: 'body-1', aisles: [{ id: 'aisle-1', aisleBodyId: 'aisle-body-1' }] }],
    noteAisleBodies: [{ id: 'aisle-body-1', markdown: '', frontmatterStatus: 'none' }],
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
    frontmatter: {
      ...DEFAULT_FRONTMATTER_SETTINGS,
      settingsTemplateId: 'template-1',
      lastAppliedTemplateId: 'template-1',
      templates: [
        {
          id: 'template-1',
          name: 'template',
          fields: [{ id: 'created', key: 'created', type: 'date', defaultValue: '', computed: 'createdAt' }],
        },
      ],
    },
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
}

function createDuplicateLocationState() {
  const state = createState()
  const duplicatedSpace = {
    ...state.spaces[0],
    data: {
      ...state.spaces[0].data,
      tabs: [
        ...state.spaces[0].data.tabs,
        { id: 'tab-2', title: 'Second', noteBodyId: 'body-1', activeSubTabId: null, subTabs: [] },
      ],
    },
  }
  state.spaces = [duplicatedSpace]
  state.domains = [{ ...state.domains[0], spaces: [duplicatedSpace] }]
  return state
}

function createSortedDuplicateLocationState() {
  const state = createState()
  const alphaSpace = createSpace('space-alpha', 'Alpha Space', [
    {
      id: 'parent-alpha',
      title: 'Alpha Parent',
      noteBodyId: 'body-other',
      activeSubTabId: 'sub-zulu',
      subTabs: [
        { id: 'sub-zulu', title: 'Zulu Sub', noteBodyId: 'body-1' },
        { id: 'sub-alpha', title: 'Alpha Sub', noteBodyId: 'body-1' },
      ],
    },
    { id: 'parent-beta', title: 'Beta Parent', noteBodyId: 'body-1', activeSubTabId: null, subTabs: [] },
  ])
  const zetaSpace = createSpace('space-zeta', 'Zeta Space', [
    { id: 'parent-zeta', title: 'Zeta Parent', noteBodyId: 'body-1', activeSubTabId: null, subTabs: [] },
  ])
  const betaSpace = createSpace('space-beta', 'Alpha Space', [
    { id: 'parent-beta-domain', title: 'Alpha Parent', noteBodyId: 'body-1', activeSubTabId: null, subTabs: [] },
  ])

  state.activeDomainId = 'domain-beta'
  state.activeSpaceId = 'space-beta'
  state.spaces = [betaSpace]
  state.domains = [
    { id: 'domain-beta', name: 'Beta Domain', activeSpaceId: 'space-beta', spaces: [betaSpace] },
    { id: 'domain-alpha', name: 'Alpha Domain', activeSpaceId: 'space-alpha', spaces: [zetaSpace, alphaSpace] },
  ]
  state.noteBodies = [
    { id: 'body-1', aisles: [{ id: 'aisle-1', aisleBodyId: 'aisle-body-1' }] },
    { id: 'body-other', aisles: [{ id: 'aisle-other', aisleBodyId: 'aisle-body-other' }] },
  ]
  return state
}

function createManyDuplicateLocationState() {
  const state = createState()
  const manySpace = createSpace(
    'space-many',
    'Many Space',
    Array.from({ length: 6 }, (_, index) => ({
      id: `tab-${index + 1}`,
      title: `Tab ${index + 1}`,
      noteBodyId: 'body-1',
      activeSubTabId: null,
      subTabs: [],
    })),
  )

  state.activeSpaceId = manySpace.id
  state.spaces = [manySpace]
  state.domains = [{ ...state.domains[0], spaces: [manySpace], activeSpaceId: manySpace.id }]
  return state
}

function renderFrontmatterModal(modal: ModalState) {
  return renderToStaticMarkup(
    <ModalHost
      modal={modal}
      state={createState()}
      activeSpace={space}
      domainsForPickers={[]}
      shortcutMenuOperations={[]}
      onModalChange={() => undefined}
      onShortcutMenuOperationsChange={() => undefined}
      onEditFrontmatterTemplate={() => undefined}
      onWarn={() => undefined}
      onError={() => undefined}
      onApplyTabSort={() => undefined}
      onLinkInsertModeChange={() => undefined}
      onNoteCopyModeChange={() => undefined}
      onDeduplicateKeepDataChange={() => undefined}
      onConfirm={() => undefined}
    />,
  )
}

function renderModal(modal: ModalState, state = createState()) {
  return renderToStaticMarkup(
    <ModalHost
      modal={modal}
      state={state}
      activeSpace={space}
      domainsForPickers={state.domains}
      shortcutMenuOperations={[]}
      onModalChange={() => undefined}
      onShortcutMenuOperationsChange={() => undefined}
      onEditFrontmatterTemplate={() => undefined}
      onWarn={() => undefined}
      onError={() => undefined}
      onApplyTabSort={() => undefined}
      onLinkInsertModeChange={() => undefined}
      onNoteCopyModeChange={() => undefined}
      onDeduplicateKeepDataChange={() => undefined}
      onConfirm={() => undefined}
    />,
  )
}

function renderShortcutMenuSettingsModal(shortcutMenuOperations: NewlineOperationId[]) {
  return renderToStaticMarkup(
    <ModalHost
      modal={{ type: 'shortcut-menu-settings' }}
      state={createState()}
      activeSpace={space}
      domainsForPickers={[]}
      shortcutMenuOperations={shortcutMenuOperations}
      onModalChange={() => undefined}
      onShortcutMenuOperationsChange={() => undefined}
      onEditFrontmatterTemplate={() => undefined}
      onWarn={() => undefined}
      onError={() => undefined}
      onApplyTabSort={() => undefined}
      onLinkInsertModeChange={() => undefined}
      onNoteCopyModeChange={() => undefined}
      onDeduplicateKeepDataChange={() => undefined}
      onConfirm={() => undefined}
    />,
  )
}

describe('sort modal rendering', () => {
  it('renders the scratchpad about modal', () => {
    const html = renderModal({ type: 'scratchpad-about' })

    expect(html).toContain('about scratchpad')
    expect(html).toContain('quick standalone place to put unsorted notes')
    expect(html).toContain('stored with your other notes')
    expect(html).toContain('searching your entire notebook')
    expect(html).toContain('allows 16 aisles by default')
    expect(html).toContain('adjustable up to 32')
    expect(html).toContain('added to the left by default')
    expect(html).toContain('>return</button>')
    expect(html).not.toContain('>cancel</button>')
    expect(shouldModalBackdropClose({ type: 'scratchpad-about' })).toBe(true)
  })

  it('renders the parent sort title, close control, and sort options', () => {
    const html = renderModal({ type: 'sort-tabs', target: 'parents' })

    expect(html).toContain('sort parents')
    expect(html).toContain('aria-label="close sort modal"')
    expect(html).toContain('>a-z</button>')
    expect(html).toContain('>z-a</button>')
    expect(html).toContain('>created ascending</button>')
    expect(html).toContain('>created descending</button>')
    expect(html).toContain('>updated ascending</button>')
    expect(html).toContain('>updated descending</button>')
    expect(html).not.toContain('class="delete-modal-actions"')
  })

  it('renders the sub-tab sort title', () => {
    const html = renderModal({ type: 'sort-tabs', target: 'subtabs' })

    expect(html).toContain('sort sub-tabs')
  })

  it('does not close sort or frontmatter modals from backdrop clicks', () => {
    expect(shouldModalBackdropClose({ type: 'sort-tabs', target: 'parents' })).toBe(false)
    expect(shouldModalBackdropClose({
      type: 'frontmatter-note',
      noteBodyId: 'body-1',
      aisleId: 'aisle-1',
      aisleBodyId: 'aisle-body-1',
      location: { domainId: 'domain-1', spaceId: 'space-1', tabId: 'tab-1', subTabId: null },
      selectedTemplateId: '',
      templateDerived: false,
      isTemplateSuggestionDraft: false,
      rows: [],
    })).toBe(false)
    expect(shouldModalBackdropClose({
      type: 'insert-note-reference',
      mode: 'note',
      insertAs: 'link',
      source: { domainId: 'domain-1', spaceId: 'space-1', tabId: 'tab-1', subTabId: null },
      target: { domainId: 'domain-1', spaceId: 'space-1', tabId: 'tab-1', subTabId: null },
      noteLabel: 'Tab',
      url: '',
      urlLabel: '',
    })).toBe(false)
    expect(shouldModalBackdropClose({ type: 'shortcut-menu-settings' })).toBe(true)
  })

  it('renders explicit aisle direction commands in shortcut menu settings', () => {
    const html = renderShortcutMenuSettingsModal(['aisleLeft'])

    expect(html).toContain('aisle to the left')
    expect(html).toContain('aisle to the right')
    expect(html).toContain('dash list')
    expect(html).toContain('bullet list')
    expect(html).toContain('numbered list')
    expect(html).not.toContain('>aisle</button>')
  })
})

describe('link modal rendering', () => {
  const source = { domainId: 'domain-1', spaceId: 'space-1', tabId: 'tab-1', subTabId: null }

  function createHeadingState() {
    const state = createState()
    state.noteBodies = [
      {
        id: 'body-1',
        aisles: [
          { id: 'aisle-1', aisleBodyId: 'aisle-body-1' },
          { id: 'aisle-2', aisleBodyId: 'aisle-body-2' },
        ],
      },
    ]
    state.noteAisleBodies = [
      { id: 'aisle-body-1', markdown: '# Alpha\n\n## Beta' },
      { id: 'aisle-body-2', markdown: 'plain text\n\n## Second' },
    ]
    return state
  }

  it('submits insert/edit link text inputs on bare Enter only', () => {
    expect(shouldSubmitInsertNoteReferenceOnEnter({
      modalType: 'insert-note-reference',
      key: 'Enter',
      targetTagName: 'input',
      targetInputType: 'text',
    })).toBe(true)
    expect(shouldSubmitInsertNoteReferenceOnEnter({
      modalType: 'insert-note-reference',
      key: 'Enter',
      targetTagName: 'input',
      targetInputType: 'url',
    })).toBe(true)
    expect(shouldSubmitInsertNoteReferenceOnEnter({
      modalType: 'insert-note-reference',
      key: 'Enter',
      targetTagName: 'input',
      targetInputType: 'search',
    })).toBe(true)
    expect(shouldSubmitInsertNoteReferenceOnEnter({
      modalType: 'insert-note-reference',
      key: 'Enter',
      shiftKey: true,
      targetTagName: 'input',
      targetInputType: 'text',
    })).toBe(false)
    expect(shouldSubmitInsertNoteReferenceOnEnter({
      modalType: 'insert-note-reference',
      key: 'Escape',
      targetTagName: 'input',
      targetInputType: 'text',
    })).toBe(false)
    expect(shouldSubmitInsertNoteReferenceOnEnter({
      modalType: 'copy-note',
      key: 'Enter',
      targetTagName: 'input',
      targetInputType: 'text',
    })).toBe(false)
  })

  it('renders the shared note link and preview controls', () => {
    const html = renderModal({
      type: 'insert-note-reference',
      mode: 'note',
      insertAs: 'link',
      source,
      target: source,
      noteLabel: 'Tab',
      url: '',
      urlLabel: '',
    })

    expect(html).toContain('insert link')
    expect(html).toContain('class="delete-modal-backdrop insert-note-reference-backdrop"')
    expect(html).toContain('insert-note-reference-modal-shell')
    expect(html).toContain('>note</button>')
    expect(html).toContain('>url</button>')
    expect(html).toContain('>link</button>')
    expect(html).toContain('>preview</button>')
    expect(html).toMatch(
      /class="note-reference-option-strip note-reference-link-option-strip"[\s\S]*aria-label="Link type"[\s\S]*aria-label="Note reference type"/,
    )
    expect(html).toContain('class="note-reference-picker-divider" aria-hidden="true"')
    expect(html).toContain('note-location-picker-row')
    expect(html).not.toContain('note-location-picker-row-label')
    expect(html).toContain('note-location-picker-chip rail-control context-preview-title-btn compact-scope-btn compact-domain-btn is-domain is-selected')
    expect(html).toContain('note-location-picker-chip rail-control context-preview-title-btn compact-scope-btn compact-space-btn is-space is-selected')
    expect(html).toContain('note-location-picker-chip rail-control context-preview-title-btn btn btn-sm tab-btn parent-tab-btn is-parent is-selected')
    expect(html).toContain('note-location-picker-chip rail-control context-preview-title-btn btn btn-sm tab-btn subtab-btn is-subtab is-selected')
    expect(html).toContain('value="Tab"')
    expect(html).not.toContain('<select')
    expect(html).not.toContain('>aisle 1</button>')
  })

  it('renders URL fields for URL mode', () => {
    const html = renderModal({
      type: 'insert-note-reference',
      mode: 'url',
      insertAs: 'link',
      source,
      target: source,
      noteLabel: 'Tab',
      url: 'https://example.com',
      urlLabel: 'Example',
    })

    expect(html).toContain('placeholder="https://example.com"')
    expect(html).toContain('class="delete-modal-backdrop insert-note-reference-backdrop"')
    expect(html).toContain('insert-note-reference-modal-shell')
    expect(html).toContain('value="https://example.com"')
    expect(html).toContain('value="Example"')
  })

  it('locks note targets when editing an existing note link', () => {
    const html = renderModal({
      type: 'insert-note-reference',
      mode: 'note',
      modeLocked: true,
      insertAs: 'link',
      source,
      target: source,
      noteLabel: 'Existing',
      url: '',
      urlLabel: '',
      internalEdit: {
        label: 'Existing',
        href: '[[Tab--123abc|Existing]]',
        target: source,
      },
    })

    expect(html).toContain('edit link')
    expect(html).not.toContain('note-reference-locked-target')
    expect(html).toContain('note-location-picker-row')
    expect(html).toContain('note-location-picker-chip rail-control context-preview-title-btn compact-scope-btn compact-domain-btn is-domain is-selected')
    expect(html).toContain('note-location-picker-chip rail-control context-preview-title-btn compact-scope-btn compact-space-btn is-space is-selected')
    expect(html).toContain('note-location-picker-chip rail-control context-preview-title-btn btn btn-sm tab-btn parent-tab-btn is-parent is-selected')
    expect(html).toContain('note-location-picker-chip rail-control context-preview-title-btn btn btn-sm tab-btn subtab-btn is-subtab is-selected')
    expect(html).toContain('value="Existing"')
    expect(html).not.toContain('aria-label="Link type"')
    expect(html).not.toContain('aria-label="Note reference type"')
    expect(html).not.toContain('>url</button>')
    expect(html).not.toContain('>preview</button>')
  })

  it('renders single-aisle choices and indented headings for multi-aisle note links', () => {
    const html = renderModal(
      {
        type: 'insert-note-reference',
        mode: 'note',
        insertAs: 'link',
        source,
        target: source,
        noteLabel: 'Tab',
        url: '',
        urlLabel: '',
      },
      createHeadingState(),
    )

    expect(html).toContain('>aisle 1</button>')
    expect(html).toContain('>aisle 2</button>')
    expect(html).toContain('aria-label="Link start"')
    expect(html).toContain('>link starts at</span>')
    expect(html).toMatch(/note-reference-heading-btn is-active"[^>]*>at the top<\/button>[\s\S]*>last position<\/button>/)
    expect(html).toContain('>last position</button>')
    expect(html).toMatch(/>last position<\/button>[\s\S]*note-reference-heading-separator[\s\S]*>Alpha<\/button>/)
    expect(html).toContain('>Alpha</button>')
    expect(html).toContain('>Beta</button>')
    expect(html).toContain('--note-reference-heading-indent:0.78rem')
    expect(html).not.toContain('preview starts at')
  })

  it('renders preview start choices with top as the default and headings below a divider', () => {
    const html = renderModal(
      {
        type: 'insert-note-reference',
        mode: 'note',
        insertAs: 'preview',
        source,
        target: source,
        noteLabel: 'Tab',
        url: '',
        urlLabel: '',
      },
      createHeadingState(),
    )

    expect(html).toContain('aria-label="Preview start"')
    expect(html).toContain('>preview starts at</span>')
    expect(html).toMatch(/note-reference-heading-btn is-active"[^>]*>at the top<\/button>[\s\S]*>last position<\/button>/)
    expect(html).toMatch(/>last position<\/button>[\s\S]*note-reference-heading-separator[\s\S]*>Alpha<\/button>/)
    expect(html).toContain('>Beta</button>')
    expect(html).toContain('--note-reference-heading-indent:0.78rem')
  })

  it('keeps the link start picker visible when the selected aisle has no headings', () => {
    const state = createState()
    state.noteBodies = [
      {
        id: 'body-1',
        aisles: [
          { id: 'aisle-1', aisleBodyId: 'aisle-body-1' },
          { id: 'aisle-2', aisleBodyId: 'aisle-body-2' },
        ],
      },
    ]
    state.noteAisleBodies = [
      { id: 'aisle-body-1', markdown: 'plain text' },
      { id: 'aisle-body-2', markdown: '# Hidden on other aisle' },
    ]

    const html = renderModal(
      {
        type: 'insert-note-reference',
        mode: 'note',
        insertAs: 'link',
        source,
        target: { ...source, aisleIds: ['aisle-1'] },
        noteLabel: 'Tab',
        url: '',
        urlLabel: '',
      },
      state,
    )

    expect(html).toContain('>aisle 1</button>')
    expect(html).toContain('aria-label="Link start"')
    expect(html).toContain('>at the top</button>')
    expect(html).toContain('>last position</button>')
    expect(html).not.toContain('note-reference-heading-separator')
  })

  it('keeps the preview start picker visible when the selected aisle has no headings', () => {
    const state = createState()
    state.noteBodies = [
      {
        id: 'body-1',
        aisles: [
          { id: 'aisle-1', aisleBodyId: 'aisle-body-1' },
          { id: 'aisle-2', aisleBodyId: 'aisle-body-2' },
        ],
      },
    ]
    state.noteAisleBodies = [
      { id: 'aisle-body-1', markdown: 'plain text' },
      { id: 'aisle-body-2', markdown: '# Hidden on other aisle' },
    ]

    const html = renderModal(
      {
        type: 'insert-note-reference',
        mode: 'note',
        insertAs: 'preview',
        source,
        target: { ...source, aisleIds: ['aisle-1'] },
        noteLabel: 'Tab',
        url: '',
        urlLabel: '',
      },
      state,
    )

    expect(html).toContain('aria-label="Preview start"')
    expect(html).toContain('>at the top</button>')
    expect(html).toContain('>last position</button>')
    expect(html).not.toContain('note-reference-heading-separator')
    expect(html).not.toContain('>Hidden on other aisle</button>')
  })

  it('preselects last position for preview edits that use saved-position starts', () => {
    const html = renderModal(
      {
        type: 'insert-note-reference',
        mode: 'note',
        modeLocked: true,
        insertAs: 'preview',
        source,
        target: { ...source, previewStart: 'last-position' },
        noteLabel: 'Tab',
        url: '',
        urlLabel: '',
        editingTokenId: 'wiki-preview:Tab--123abc#last position',
      },
      createHeadingState(),
    )

    expect(html).toContain('aria-label="Preview start"')
    expect(html).toMatch(/note-reference-heading-btn "[^>]*>at the top<\/button>[\s\S]*note-reference-heading-btn is-active"[^>]*>last position<\/button>/)
  })

  it('preselects last position for note link edits that use saved-position starts', () => {
    const html = renderModal(
      {
        type: 'insert-note-reference',
        mode: 'note',
        modeLocked: true,
        insertAs: 'link',
        source,
        target: { ...source, previewStart: 'last-position' },
        noteLabel: 'Existing',
        url: '',
        urlLabel: '',
        internalEdit: {
          label: 'Existing',
          href: '[[Tab--123abc#last position|Existing]]',
          target: source,
          startAt: 'last-position',
        },
      },
      createHeadingState(),
    )

    expect(html).toContain('aria-label="Link start"')
    expect(html).toMatch(/note-reference-heading-btn "[^>]*>at the top<\/button>[\s\S]*note-reference-heading-btn is-active"[^>]*>last position<\/button>/)
  })

  it('preselects anchored headings when editing an existing note link', () => {
    const heading = { aisleId: 'aisle-2', headingKey: 'aisle-2|h2|0|Second' }
    const html = renderModal(
      {
        type: 'insert-note-reference',
        mode: 'note',
        modeLocked: true,
        insertAs: 'link',
        source,
        target: { ...source, aisleIds: ['aisle-2'], heading },
        noteLabel: 'Existing',
        url: '',
        urlLabel: '',
        internalEdit: {
          label: 'Existing',
          href: '[[Tab--123abc#Second--456def|Existing]]',
          target: source,
          heading,
        },
      },
      createHeadingState(),
    )

    expect(html).not.toContain('note-reference-locked-target')
    expect(html).toContain('note-location-picker-row')
    expect(html).toContain('>aisle 2</button>')
    expect(html).toMatch(/note-reference-heading-btn is-active"[^>]*>Second<\/button>/)
    expect(html).toContain('>last position</button>')
  })

  it('hides unavailable mode switches when editing an existing URL link', () => {
    const html = renderModal({
      type: 'insert-note-reference',
      mode: 'url',
      modeLocked: true,
      insertAs: 'link',
      source,
      target: source,
      noteLabel: 'Tab',
      url: 'https://example.com',
      urlLabel: 'Example',
      urlEditRange: { from: 1, to: 8, href: 'https://example.com' },
    })

    expect(html).toContain('edit link')
    expect(html).toContain('value="https://example.com"')
    expect(html).toContain('value="Example"')
    expect(html).not.toContain('aria-label="Link type"')
    expect(html).not.toContain('aria-label="Note reference type"')
    expect(html).not.toContain('>note</button>')
    expect(html).not.toContain('>url</button>')
  })
})

describe('de-couple modal rendering', () => {
  it('keeps apply clickable with no retained notes so confirm can show a toast', () => {
    const html = renderModal({
      type: 'deduplicate-note',
      noteBodyId: 'body-1',
      keepLocationKeys: [],
      keepData: true,
    })

    expect(html).toMatch(/<button type="button" class="btn btn-sm modal-primary-btn">apply<\/button>/)
    expect(html).toContain('decouple-location-card is-decoupled')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('<span class="decouple-location-status">de-coupled</span>')
  })

  it('renders a horizontal card strip instead of checkbox rows', () => {
    const html = renderModal({
      type: 'deduplicate-note',
      noteBodyId: 'body-1',
      keepLocationKeys: ['domain-1::space-1::tab-1::__home__'],
      keepData: true,
    })

    expect(html).toContain('Select items to de-couple.')
    expect(html).toContain('decouple-note-modal-shell')
    expect(html).toContain('style="--decouple-modal-content-width:20rem"')
    expect(html).toContain('decouple-location-list')
    expect(html).toContain('decouple-location-horizontal-scrollbar')
    expect(html).toContain('role="scrollbar"')
    expect(html).toContain('aria-label="Scroll de-couple locations horizontally"')
    expect(html).toContain('Domain')
    expect(html).toContain('Space')
    expect(html).toContain('Tab')
    expect(html).toContain('home')
    expect(html).not.toContain('decouple-location-status')
    expect(html).not.toContain('duplicate-note-list')
    expect(html).not.toContain('duplicate-note-choice')
    expect(html).not.toContain('draggable')
  })

  it('renders the persistent keep-data switch', () => {
    const html = renderModal({
      type: 'deduplicate-note',
      noteBodyId: 'body-1',
      keepLocationKeys: ['domain-1::space-1::tab-1::__home__'],
      keepData: true,
    })

    expect(html).toContain('keep data in de-coupled notes?')
    expect(html).toContain('aria-label="keep data in de-coupled notes?"')
    expect(html).toContain('checked=""')
    expect(html).toMatch(/<div class="deduplicate-keep-data-switch form-check form-switch settings-switch"><span>keep data in de-coupled notes\?<\/span><input/)
    expect(html).not.toContain('<label class="deduplicate-keep-data-switch')
  })

  it('marks omitted keep keys as selected for de-couple', () => {
    const html = renderModal(
      {
        type: 'deduplicate-note',
        noteBodyId: 'body-1',
        keepLocationKeys: ['domain-1::space-1::tab-1::__home__'],
        keepData: true,
      },
      createDuplicateLocationState(),
    )

    expect(html).toContain('aria-label="Domain / Space / Tab / home. Will stay coupled."')
    expect(html).toContain('aria-label="Domain / Space / Second / home. Will be de-coupled."')
    expect(html).toContain('decouple-location-card is-decoupled')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('<span class="decouple-location-status">de-coupled</span>')
    expect(html.match(/class="decouple-location-status"/g) ?? []).toHaveLength(1)
  })

  it('sorts de-couple cards by domain, space, parent, then subtab', () => {
    const html = renderModal(
      {
        type: 'deduplicate-note',
        noteBodyId: 'body-1',
        keepLocationKeys: [
          'domain-alpha::space-alpha::parent-alpha::sub-alpha',
          'domain-alpha::space-alpha::parent-alpha::sub-zulu',
          'domain-alpha::space-alpha::parent-beta::__home__',
          'domain-alpha::space-zeta::parent-zeta::__home__',
          'domain-beta::space-beta::parent-beta-domain::__home__',
        ],
        keepData: true,
      },
      createSortedDuplicateLocationState(),
    )

    const alphaSub = html.indexOf('Alpha Domain / Alpha Space / Alpha Parent / Alpha Sub')
    const zuluSub = html.indexOf('Alpha Domain / Alpha Space / Alpha Parent / Zulu Sub')
    const betaParent = html.indexOf('Alpha Domain / Alpha Space / Beta Parent / home')
    const zetaSpace = html.indexOf('Alpha Domain / Zeta Space / Zeta Parent / home')
    const betaDomain = html.indexOf('Beta Domain / Alpha Space / Alpha Parent / home')

    expect(alphaSub).toBeGreaterThanOrEqual(0)
    expect(alphaSub).toBeLessThan(zuluSub)
    expect(zuluSub).toBeLessThan(betaParent)
    expect(betaParent).toBeLessThan(zetaSpace)
    expect(zetaSpace).toBeLessThan(betaDomain)
  })

  it('shrinks for small duplicate sets and caps the wide layout', () => {
    const smallHtml = renderModal(
      {
        type: 'deduplicate-note',
        noteBodyId: 'body-1',
        keepLocationKeys: [
          'domain-1::space-1::tab-1::__home__',
          'domain-1::space-1::tab-2::__home__',
        ],
        keepData: true,
      },
      createDuplicateLocationState(),
    )
    const largeHtml = renderModal(
      {
        type: 'deduplicate-note',
        noteBodyId: 'body-1',
        keepLocationKeys: [
          'domain-1::space-many::tab-1::__home__',
          'domain-1::space-many::tab-2::__home__',
          'domain-1::space-many::tab-3::__home__',
          'domain-1::space-many::tab-4::__home__',
          'domain-1::space-many::tab-5::__home__',
          'domain-1::space-many::tab-6::__home__',
        ],
        keepData: true,
      },
      createManyDuplicateLocationState(),
    )

    expect(smallHtml).toContain('style="--decouple-modal-content-width:30rem"')
    expect(largeHtml).toContain('style="--decouple-modal-content-width:70rem"')
  })
})

describe('linked aisle modal rendering', () => {
  it('renders aisle-body de-couple copy', () => {
    const html = renderModal({
      type: 'linked-aisle',
      reason: 'aisle-body',
      noteBodyId: 'body-1',
      aisleId: 'aisle-1',
      aisleBodyId: 'aisle-body-1',
      location: { domainId: 'domain-1', spaceId: 'space-1', tabId: 'tab-1', subTabId: null },
    })

    expect(html).toContain('linked-aisle-modal')
    expect(html).toContain('linked aisle')
    expect(html).toContain('this aisle shares content with another aisle')
    expect(html).toMatch(/<button type="button" class="btn btn-sm modal-primary-btn">de-couple aisle<\/button>/)
    expect(html).not.toContain('decouple-note-modal-shell')
    expect(html).not.toContain('--decouple-modal-content-width')
    expect(html).not.toContain('duplicate-note-list')
  })

  it('renders note-location de-couple controls for whole-note links', () => {
    const state = createDuplicateLocationState()

    const html = renderModal(
      {
        type: 'linked-aisle',
        reason: 'note-body',
        noteBodyId: 'body-1',
        aisleId: 'aisle-1',
        aisleBodyId: 'aisle-body-1',
        location: { domainId: 'domain-1', spaceId: 'space-1', tabId: 'tab-1', subTabId: null },
        keepLocationKeys: [
          'domain-1::space-1::tab-1::__home__',
          'domain-1::space-1::tab-2::__home__',
        ],
        keepData: true,
      },
      state,
    )

    expect(html).toContain('linked note')
    expect(html).toContain('Select items to de-couple.')
    expect(html).toContain('decouple-location-list')
    expect(html).toContain('style="--decouple-modal-content-width:30rem"')
    expect(html).toContain('aria-label="Domain / Space / Tab / home. Will stay coupled."')
    expect(html).toContain('aria-label="Domain / Space / Second / home. Will stay coupled."')
    expect(html).not.toContain('duplicate-note-list')
    expect(html).toContain('keep data in de-coupled notes?')
    expect(html).toMatch(/<button type="button" class="btn btn-sm modal-primary-btn">apply<\/button>/)
  })
})

describe('copy modal rendering', () => {
  const source = { domainId: 'domain-1', spaceId: 'space-1', tabId: 'tab-1', subTabId: null }

  it('marks the independent copy mode active', () => {
    const html = renderModal({
      type: 'copy-note',
      mode: 'independent',
      destinationMode: 'replace',
      source,
      target: source,
    })

    expect(html).toContain('note-copy-modal')
    expect(html).not.toContain('insert-note-reference-backdrop')
    expect(html).not.toContain('insert-note-reference-modal-shell')
    expect(html).toMatch(/class="note-reference-option-strip"[\s\S]*aria-label="Copy type"/)
    expect(html).toContain('class="note-reference-picker-divider" aria-hidden="true"')
    expect(html).not.toContain('note-location-picker-row-label')
    expect(html).toContain('note-location-picker-chip rail-control context-preview-title-btn compact-scope-btn compact-domain-btn is-domain is-selected')
    expect(html).toContain('note-location-picker-chip rail-control context-preview-title-btn compact-scope-btn compact-space-btn is-space is-selected')
    expect(html).toContain('note-location-picker-chip rail-control context-preview-title-btn btn btn-sm tab-btn parent-tab-btn is-parent is-selected')
    expect(html).toContain('note-location-picker-chip rail-control context-preview-title-btn btn btn-sm tab-btn subtab-btn is-subtab is-selected')
    expect(html).toMatch(/note-reference-mode-btn is-active"[^>]*>independent</)
    expect(html).toContain('>synced</button>')
    expect(html).toContain('note-copy-behavior-row')
    expect(html).toContain('note-copy-behavior-mode')
    expect(html).toContain('copy behavior')
    expect(html).toMatch(/note-reference-mode-btn is-active"[^>]*>replace this note</)
    expect(html).toContain('>append as aisles</button>')
    expect(html).not.toContain('>all aisles</button>')
    expect(html).not.toContain('>aisle 1</button>')
  })

  it('marks the synced copy mode active', () => {
    const html = renderModal({
      type: 'copy-note',
      mode: 'linked',
      destinationMode: 'append',
      source,
      target: source,
    })

    expect(html).toContain('note-copy-modal')
    expect(html).toContain('>independent</button>')
    expect(html).toMatch(/note-reference-mode-btn is-active"[^>]*>synced</)
    expect(html).toMatch(/note-reference-mode-btn is-active"[^>]*>append as aisles</)
  })

  it('shows aisle choices for a selected multi-aisle note', () => {
    const state = createState()
    state.noteBodies = [
      {
        id: 'body-1',
        aisles: [
          { id: 'aisle-1', aisleBodyId: 'aisle-body-1' },
          { id: 'aisle-2', aisleBodyId: 'aisle-body-2' },
        ],
      },
    ]
    state.noteAisleBodies = [
      { id: 'aisle-body-1', markdown: '' },
      { id: 'aisle-body-2', markdown: '' },
    ]

    const html = renderModal(
      {
        type: 'copy-note',
        mode: 'independent',
        destinationMode: 'replace',
        source,
        target: source,
      },
      state,
    )

    expect(html).toContain('>all aisles</button>')
    expect(html).toContain('>aisle 1</button>')
    expect(html).toContain('>aisle 2</button>')
  })
})

describe('frontmatter modal rendering', () => {
  it('renders one note-level derived switch and no row sync switches', () => {
    const html = renderFrontmatterModal({
      type: 'frontmatter-note',
      noteBodyId: 'body-1',
      aisleId: 'aisle-1',
      aisleBodyId: 'aisle-body-1',
      location: { domainId: 'domain-1', spaceId: 'space-1', tabId: 'tab-1', subTabId: null },
      selectedTemplateId: 'template-1',
      templateDerived: true,
      isTemplateSuggestionDraft: false,
      rows: [
        {
          id: 'template:created',
          key: 'created',
          type: 'date',
          value: '2024-01-01',
          computed: 'createdAt',
          locked: true,
          templateFieldId: 'created',
          derived: true,
        },
      ],
    })

    expect(html.match(/role="switch"/g) ?? []).toHaveLength(2)
    expect(html).not.toContain('synced to template')
    expect(html).toContain('>derived</span>')
    expect(html).toContain('>computed</span>')
    expect(html).toContain('title="template"')
    expect(html).toContain('computed fields that are derived can not be changed here, edit the fm template')
    expect(html).not.toContain('computed fields, once set, can not be changed')
  })

  it('switches the modal to no template when the last derived row is removed', () => {
    const modal: Extract<ModalState, { type: 'frontmatter-note' }> = {
      type: 'frontmatter-note',
      noteBodyId: 'body-1',
      aisleId: 'aisle-1',
      aisleBodyId: 'aisle-body-1',
      location: { domainId: 'domain-1', spaceId: 'space-1', tabId: 'tab-1', subTabId: null },
      selectedTemplateId: 'template-1',
      templateDerived: true,
      isTemplateSuggestionDraft: false,
      rows: [
        {
          id: 'template:created',
          key: 'created',
          type: 'date',
          value: '2024-01-01',
          computed: 'createdAt',
          locked: true,
          templateFieldId: 'created',
          derived: true,
        },
        {
          id: 'manual:status',
          key: 'status',
          type: 'text',
          value: 'ready',
          computed: 'none',
          locked: false,
          derived: false,
        },
      ],
    }

    const next = normalizeFrontmatterModalRows(modal, modal.rows.filter((row) => !row.derived))

    expect(next.selectedTemplateId).toBe('')
    expect(next.templateDerived).toBe(false)
    expect(next.rows).toEqual([
      {
        id: 'manual:status',
        key: 'status',
        type: 'text',
        value: 'ready',
        computed: 'none',
        computedEnabled: false,
        computedLocked: false,
        locked: false,
        templateFieldId: undefined,
        derived: false,
      },
    ])
  })

  it('keeps derived computed rows computed when making rows manual', () => {
    expect(makeFrontmatterRowsManual([
      {
        id: 'template:created',
        key: 'created',
        type: 'date',
        value: '2024-01-01',
        computed: 'createdAt',
        computedEnabled: true,
        computedLocked: true,
        locked: true,
        templateFieldId: 'created',
        derived: true,
      },
    ])).toEqual([
      {
        id: 'template:created',
        key: 'created',
        type: 'date',
        value: '2024-01-01',
        computed: 'createdAt',
        computedEnabled: true,
        computedLocked: true,
        locked: true,
        templateFieldId: undefined,
        derived: false,
      },
    ])
  })

  it('renders boolean row values as a switch', () => {
    const html = renderFrontmatterModal({
      type: 'frontmatter-note',
      noteBodyId: 'body-1',
      aisleId: 'aisle-1',
      aisleBodyId: 'aisle-body-1',
      location: { domainId: 'domain-1', spaceId: 'space-1', tabId: 'tab-1', subTabId: null },
      selectedTemplateId: '',
      templateDerived: false,
      isTemplateSuggestionDraft: false,
      rows: [
        {
          id: 'manual:published',
          key: 'published',
          type: 'boolean',
          value: 'true',
          computed: 'none',
          locked: false,
          derived: false,
        },
      ],
    })

    expect(html).toContain('aria-label="frontmatter boolean value"')
    expect(html).toContain('role="switch"')
    expect(html).toContain('checked=""')
    expect(html).not.toContain('<select class="settings-select-input frontmatter-row-value-input"')
  })

  it('renders date and datetime row values as picker inputs', () => {
    const html = renderFrontmatterModal({
      type: 'frontmatter-note',
      noteBodyId: 'body-1',
      aisleId: 'aisle-1',
      aisleBodyId: 'aisle-body-1',
      location: { domainId: 'domain-1', spaceId: 'space-1', tabId: 'tab-1', subTabId: null },
      selectedTemplateId: '',
      templateDerived: false,
      isTemplateSuggestionDraft: false,
      rows: [
        {
          id: 'manual:due',
          key: 'due',
          type: 'date',
          value: '',
          computed: 'none',
          locked: false,
          derived: false,
        },
        {
          id: 'manual:starts',
          key: 'starts',
          type: 'datetime',
          value: '',
          computed: 'none',
          locked: false,
          derived: false,
        },
      ],
    })

    expect(html).toContain('type="date" class="settings-text-input frontmatter-row-value-input" aria-label="frontmatter value" placeholder="value" value=""')
    expect(html).toContain('type="datetime-local" class="settings-text-input frontmatter-row-value-input" aria-label="frontmatter value" placeholder="value" value=""')
  })

  it('renders manual computed rows with a computed switch and value dropdown', () => {
    const html = renderFrontmatterModal({
      type: 'frontmatter-note',
      noteBodyId: 'body-1',
      aisleId: 'aisle-1',
      aisleBodyId: 'aisle-body-1',
      location: { domainId: 'domain-1', spaceId: 'space-1', tabId: 'tab-1', subTabId: null },
      selectedTemplateId: '',
      templateDerived: false,
      isTemplateSuggestionDraft: false,
      rows: [
        {
          id: 'manual:title',
          key: 'title',
          type: 'text',
          value: '',
          computed: 'none',
          computedEnabled: true,
          computedLocked: false,
          locked: true,
          derived: false,
        },
      ],
    })

    expect(html).toContain('aria-label="frontmatter computed"')
    expect(html).toContain('aria-label="computed frontmatter value"')
    expect(html).toContain('value="noteTitle"')
    expect(html).toContain('value="spaceName"')
    expect(html).toContain('value="domainName"')
    expect(html).not.toContain('frontmatter-boolean-switch-label')
  })

  it('keeps the saved-computed warning for manual computed rows', () => {
    const html = renderFrontmatterModal({
      type: 'frontmatter-note',
      noteBodyId: 'body-1',
      aisleId: 'aisle-1',
      aisleBodyId: 'aisle-body-1',
      location: { domainId: 'domain-1', spaceId: 'space-1', tabId: 'tab-1', subTabId: null },
      selectedTemplateId: '',
      templateDerived: false,
      isTemplateSuggestionDraft: false,
      rows: [
        {
          id: 'manual:title',
          key: 'title',
          type: 'text',
          value: 'Tab',
          computed: 'noteTitle',
          computedEnabled: true,
          computedLocked: true,
          locked: true,
          derived: false,
        },
      ],
    })

    expect(html).toContain('computed fields, once set, can not be changed')
    expect(html).not.toContain('computed fields that are derived can not be changed here, edit the fm template')
  })

  it('renders suggested template notice and add action for unsaved template drafts', () => {
    const html = renderFrontmatterModal({
      type: 'frontmatter-note',
      noteBodyId: 'body-1',
      aisleId: 'aisle-1',
      aisleBodyId: 'aisle-body-1',
      location: { domainId: 'domain-1', spaceId: 'space-1', tabId: 'tab-1', subTabId: null },
      selectedTemplateId: 'template-1',
      templateDerived: true,
      isTemplateSuggestionDraft: true,
      rows: [
        {
          id: 'template:created',
          key: 'created',
          type: 'date',
          value: '2024-01-01',
          computed: 'createdAt',
          locked: true,
          templateFieldId: 'created',
          derived: true,
        },
      ],
    })

    expect(html).toContain('Suggested from')
    expect(html).toContain('template')
    expect(html).toContain('These rows are not saved on this note yet.')
    expect(html).toContain('add frontmatter')
  })

  it('keeps existing frontmatter modal on the normal save action without a suggestion notice', () => {
    const html = renderFrontmatterModal({
      type: 'frontmatter-note',
      noteBodyId: 'body-1',
      aisleId: 'aisle-1',
      aisleBodyId: 'aisle-body-1',
      location: { domainId: 'domain-1', spaceId: 'space-1', tabId: 'tab-1', subTabId: null },
      selectedTemplateId: 'template-1',
      templateDerived: true,
      isTemplateSuggestionDraft: false,
      rows: [
        {
          id: 'template:created',
          key: 'created',
          type: 'date',
          value: '2024-01-01',
          computed: 'createdAt',
          locked: true,
          templateFieldId: 'created',
          derived: true,
        },
      ],
    })

    expect(html).not.toContain('These rows are not saved on this note yet.')
    expect(html).toContain('save')
    expect(html).not.toContain('add frontmatter')
  })

  it('does not render a suggestion notice for no-template frontmatter', () => {
    const html = renderFrontmatterModal({
      type: 'frontmatter-note',
      noteBodyId: 'body-1',
      aisleId: 'aisle-1',
      aisleBodyId: 'aisle-body-1',
      location: { domainId: 'domain-1', spaceId: 'space-1', tabId: 'tab-1', subTabId: null },
      selectedTemplateId: '',
      templateDerived: false,
      isTemplateSuggestionDraft: false,
      rows: [],
    })

    expect(html).not.toContain('These rows are not saved on this note yet.')
    expect(html).toContain('save')
  })
})
