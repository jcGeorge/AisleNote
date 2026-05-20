import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEFAULT_FRONTMATTER_SETTINGS } from '../../frontmatter/frontmatter'
import type { AppState, ModalState, Space } from '../../types/app'
import { makeFrontmatterRowsManual, normalizeFrontmatterModalRows } from './frontmatter-modal-state'
import { shouldModalBackdropClose } from './modal-behavior'
import { ModalHost } from './ModalHost'

const space: Space = {
  id: 'space-1',
  name: 'Space',
  settings: { autoRemoveDeletedDays: 30 },
  data: {
    activeTabId: 'tab-1',
    tabs: [{ id: 'tab-1', title: 'Tab', noteBodyId: 'body-1', homeContent: '', activeSubTabId: null, subTabs: [] }],
    deletedTabs: [],
    deletedSubTabs: [],
  },
}

function createState(): AppState {
  return {
    theme: 'dawn',
    activeDomainId: 'domain-1',
    activeSpaceId: space.id,
    domains: [{ id: 'domain-1', name: 'Domain', activeSpaceId: space.id, spaces: [space] }],
    spaces: [space],
    noteBodies: [{ id: 'body-1', frontmatter: null, aisles: [{ id: 'aisle-1', markdown: '' }] }],
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
      tabButtonScale: 1,
      noteFontScale: 1,
      settingsSection: 'hotkeys',
      customThemePalette: null,
      noteCursorLocations: {},
    },
  }
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
      onConfirm={() => undefined}
    />,
  )
}

function renderModal(modal: ModalState) {
  const state = createState()
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
      onConfirm={() => undefined}
    />,
  )
}

describe('sort modal rendering', () => {
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
      location: { domainId: 'domain-1', spaceId: 'space-1', tabId: 'tab-1', subTabId: null },
      selectedTemplateId: '',
      templateDerived: false,
      isTemplateSuggestionDraft: false,
      rows: [],
    })).toBe(false)
    expect(shouldModalBackdropClose({ type: 'shortcut-menu-settings' })).toBe(true)
  })
})

describe('link modal rendering', () => {
  const source = { domainId: 'domain-1', spaceId: 'space-1', tabId: 'tab-1', subTabId: null }

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
    expect(html).toContain('>note</button>')
    expect(html).toContain('>url</button>')
    expect(html).toContain('>link</button>')
    expect(html).toContain('>preview</button>')
    expect(html).toContain('value="Tab"')
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
        href: '#tabs-note/body-1?domainId=domain-1&spaceId=space-1&tabId=tab-1',
        target: source,
      },
    })

    expect(html).toContain('edit link')
    expect(html).toContain('note-reference-locked-target')
    expect(html).toContain('Domain &gt; Space &gt; Tab &gt; home')
    expect(html).toContain('value="Existing"')
    expect(html).not.toContain('aria-label="Link type"')
    expect(html).not.toContain('aria-label="Note reference type"')
    expect(html).not.toContain('>url</button>')
    expect(html).not.toContain('>preview</button>')
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

describe('frontmatter modal rendering', () => {
  it('renders one note-level derived switch and no row sync switches', () => {
    const html = renderFrontmatterModal({
      type: 'frontmatter-note',
      noteBodyId: 'body-1',
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
