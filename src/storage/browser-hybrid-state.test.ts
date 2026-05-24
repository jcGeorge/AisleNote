import { describe, expect, it } from 'vitest'
import { buildImageAssetUrl } from '../markdown/image-asset-refs.js'
import { registerAssetBytes, registerImageAssetBytes } from '../markdown/image-asset-registry'
import { DEFAULT_CUSTOM_THEME_PALETTE } from '../settings/defaults'
import { parseSavedState } from '../state/app-state'
import { buildHybridFileMapFromSerializedState, readSerializedStateFromHybridFileMap } from './browser-hybrid-state'
import { STORAGE_PATH_SEGMENT_MAX_LENGTH } from './storage-path-segments.js'

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function getVisibleLength(value: string) {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  return Array.from(segmenter.segment(value)).length
}

function expectPathSegmentsWithinLimit(pathValue: string) {
  for (const segment of pathValue.split('/').filter(Boolean)) {
    expect(getVisibleLength(segment)).toBeLessThanOrEqual(STORAGE_PATH_SEGMENT_MAX_LENGTH)
  }
}

function getTextFileJson(fileMap: ReturnType<typeof buildHybridFileMapFromSerializedState>, path: string) {
  const entry = fileMap.get(path)
  return entry?.kind === 'text' ? (JSON.parse(entry.text) as Record<string, unknown>) : {}
}

function getRootSplitFileJson(
  fileMap: ReturnType<typeof buildHybridFileMapFromSerializedState>,
  rootManifest: Record<string, unknown>,
  key: string,
  fallbackFile: string,
) {
  const files = getRecord(rootManifest.files)
  const fileName = typeof files[key] === 'string' ? files[key] : fallbackFile
  return getTextFileJson(fileMap, `notes-data/${fileName}`)
}

function createBrowserStorageState() {
  const space = {
    id: 'space-1',
    name: 'Space',
    settings: { autoRemoveDeletedDays: 7 },
    data: {
      activeTabId: 'tab-1',
      tabs: [
        {
          id: 'tab-1',
          title: 'Tab',
          noteBodyId: 'body-1',
          homeContent: 'home fallback',
          activeSubTabId: null,
          subTabs: [],
        },
      ],
      deletedTabs: [],
      deletedSubTabs: [],
    },
  }

  return parseSavedState(
    JSON.stringify({
      theme: 'dawn',
      activeDomainId: 'domain-1',
      domains: [
        {
          id: 'domain-1',
          name: 'Domain',
          activeSpaceId: space.id,
          spaces: [space],
        },
      ],
      noteBodies: [{ id: 'body-1', aisles: [{ id: 'aisle-1', markdown: 'home body' }] }],
      activeSpaceId: space.id,
      spaces: [space],
    }),
  )
}

function getBrowserWorkspacePaths(fileMap: ReturnType<typeof buildHybridFileMapFromSerializedState>) {
  const rootManifest = getTextFileJson(fileMap, 'notes-data/manifest.json')
  const workspaceIndex = getRootSplitFileJson(fileMap, rootManifest, 'workspaceIndex', 'workspace-index.json')
  const domainEntry = getRecord(Array.isArray(workspaceIndex.domains) ? workspaceIndex.domains[0] : null)
  const domainRoot = `notes-data/domains/${String(domainEntry.path)}`
  const domainManifest = getTextFileJson(fileMap, `${domainRoot}/manifest.json`)
  const spaceEntry = getRecord(Array.isArray(domainManifest.spaces) ? domainManifest.spaces[0] : null)
  const spaceRoot = `${domainRoot}/${String(spaceEntry.path)}`
  const spaceManifest = getTextFileJson(fileMap, `${spaceRoot}/manifest.json`)
  return {
    rootManifest,
    workspaceIndex,
    domainEntry,
    domainRoot,
    domainManifest,
    spaceEntry,
    spaceRoot,
    spaceManifest,
  }
}

describe('browser hybrid storage', () => {
  it('round trips markdown note bodies through the manifest file map', () => {
    const state = parseSavedState(
      JSON.stringify({
        theme: 'custom',
        spaces: [
          {
            id: 'space-1',
            name: 'Space',
            data: {
              activeTabId: 'tab-1',
              tabs: [
                {
                  id: 'tab-1',
                  title: 'Tab',
                  noteBodyId: 'body-tab',
                  homeContent: 'home mirror',
                  activeSubTabId: 'sub-1',
                  subTabs: [
                    {
                      id: 'sub-1',
                      title: 'Sub',
                      noteBodyId: 'body-sub',
                      content: 'sub mirror',
                    },
                  ],
                },
              ],
              deletedTabs: [],
              deletedSubTabs: [],
            },
          },
        ],
        noteBodies: [
          {
            id: 'body-tab',
            frontmatter: { created: '2024-01-01' },
            frontmatterTemplateId: 'template-1',
            frontmatterTemplateDerived: true,
            frontmatterTemplateFieldOrigins: {
              created: { templateId: 'template-1', fieldId: 'field-1' },
            },
            frontmatterTemplateRemovedFieldIds: ['field-2'],
            frontmatterComputedFields: { created: 'createdAt' },
            aisles: [{ id: 'aisle-tab', markdown: 'home body' }],
          },
          { id: 'body-sub', aisles: [{ id: 'aisle-sub', markdown: 'sub body' }] },
        ],
        frontmatter: {
          settingsTemplateId: 'template-1',
          lastAppliedTemplateId: 'template-1',
          templates: [
            {
              id: 'template-1',
              name: 'template',
              fields: [{ id: 'field-1', key: 'status', type: 'text', defaultValue: 'draft', computed: 'none' }],
            },
          ],
        },
        ui: {
          settingsSection: 'visuals',
          customThemePalette: {
            ...DEFAULT_CUSTOM_THEME_PALETTE,
            primary: '#8844cc',
          },
          themePalettes: {
            custom: {
              ...DEFAULT_CUSTOM_THEME_PALETTE,
              primary: '#8844cc',
            },
            dawn: {
              ...DEFAULT_CUSTOM_THEME_PALETTE,
              primary: '#123456',
            },
          },
          noteCursorLocations: {
            'domain::space-1::tab-1::__home__': {
              activeAisleId: 'aisle-tab',
              aisles: {
                'aisle-tab': {
                  anchor: 1,
                  head: 3,
                  anchorBlock: { blockIndex: 0, offset: 1 },
                  headBlock: { blockIndex: 0, offset: 3 },
                  updatedAt: 100,
                },
              },
              updatedAt: 100,
            },
          },
        },
      }),
    )

    const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify(state))
    const rootManifestEntry = fileMap.get('notes-data/manifest.json')
    const rootManifest =
      rootManifestEntry?.kind === 'text' ? (JSON.parse(rootManifestEntry.text) as Record<string, unknown>) : null
    const workspaceIndex = getRootSplitFileJson(fileMap, getRecord(rootManifest), 'workspaceIndex', 'workspace-index.json')
    const appSettings = getRootSplitFileJson(fileMap, getRecord(rootManifest), 'appSettings', 'app-settings.json')
    const editorState = getRootSplitFileJson(fileMap, getRecord(rootManifest), 'editorState', 'editor-state.json')
    const noteRegistry = getRootSplitFileJson(fileMap, getRecord(rootManifest), 'noteRegistry', 'note-registry.json')
    const firstDomain = getRecord(Array.isArray(workspaceIndex.domains) ? workspaceIndex.domains[0] : null)
    const paths = Array.from(fileMap.keys())
    const serialized = readSerializedStateFromHybridFileMap(fileMap)
    const roundTripped = parseSavedState(serialized)
    const homeBody = roundTripped.noteBodies.find((body) => body.id === 'body-tab')
    const homeAisleBody = roundTripped.noteAisleBodies?.find((body) => body.id === homeBody?.aisles[0]?.aisleBodyId)
    const subBody = roundTripped.noteBodies.find((body) => body.id === 'body-sub')

    expect(rootManifest?.schemaVersion).toBe(3)
    expect(Object.keys(getRecord(rootManifest)).sort()).toEqual(['files', 'schemaVersion'])
    expect(Object.keys(getRecord(rootManifest?.files)).sort()).toEqual([
      'appSettings',
      'deletedWorkspace',
      'editorState',
      'frontmatterSettings',
      'navigationState',
      'noteRegistry',
      'workspaceIndex',
    ])
    expect(fileMap.has('notes-data/profile-settings.json')).toBe(false)
    expect(fileMap.has('notes-data/appearance-settings.json')).toBe(false)
    expect(fileMap.has('notes-data/shortcut-settings.json')).toBe(false)
    expect(fileMap.has('notes-data/ui-preferences.json')).toBe(false)
    expect(fileMap.has('notes-data/note-bodies.json')).toBe(false)
    expect(fileMap.has('notes-data/aisle-bodies.json')).toBe(false)
    expect(fileMap.has('notes-data/orphan-note-bodies.json')).toBe(false)
    expect(fileMap.has('notes-data/orphan-aisle-bodies.json')).toBe(false)
    expect(firstDomain.path).toEqual(expect.stringMatching(/^humble beginnings--[a-f0-9]{6}$/))
    expect(paths.some((path) => path.startsWith('notes-data/domains/'))).toBe(true)
    expect(paths.some((path) => path.startsWith('notes-data/topics/'))).toBe(false)
    expect(paths.some((path) => path.startsWith('notes-data/note-bodies/'))).toBe(false)
    expect(paths.some((path) => /\/Tab--[a-f0-9]{6}\/home\.md$/.test(path))).toBe(true)
    expect(paths.some((path) => /\/Tab--[a-f0-9]{6}\/Sub--[a-f0-9]{6}\.md$/.test(path))).toBe(true)
    expect(serialized).not.toBeNull()
    expect(homeBody?.aisles[0]?.markdown).toBe('home body')
    expect(homeBody?.frontmatter).toBeNull()
    expect(homeAisleBody?.frontmatter).toEqual({ created: '2024-01-01' })
    expect(homeAisleBody?.frontmatterMeta).toMatchObject({
      templateId: 'template-1',
      templateDerived: true,
      templateFieldOrigins: {
        created: { templateId: 'template-1', fieldId: 'field-1' },
      },
      templateRemovedFieldIds: ['field-2'],
      computedFields: { created: 'createdAt' },
    })
    expect(JSON.stringify(noteRegistry.noteBodies)).not.toContain('"frontmatter"')
    expect(subBody?.aisles[0]?.markdown).toBe('sub body')
    expect(roundTripped.theme).toBe('custom1')
    expect(roundTripped.ui.customThemePalette).toEqual({
      ...DEFAULT_CUSTOM_THEME_PALETTE,
      primary: '#8844cc',
    })
    expect(roundTripped.ui.themePalettes?.custom1?.primary).toBe('#8844cc')
    expect(roundTripped.ui.themePalettes?.dawn?.primary).toBe('#123456')
    expect(getRecord(appSettings.themePalettes).custom1).toMatchObject({
      primary: '#8844cc',
    })
    expect(getRecord(appSettings.themePalettes).dawn).toMatchObject({
      primary: '#123456',
    })
    expect(getRecord(appSettings.ui).settingsSection).toBe('visuals')
    expect(getRecord(editorState.noteCursorLocations)['domain::space-1::tab-1::__home__']).toEqual({
      activeAisleId: 'aisle-tab',
      aisles: {
        'aisle-tab': {
          anchor: 1,
          head: 3,
          anchorBlock: { blockIndex: 0, offset: 1 },
          headBlock: { blockIndex: 0, offset: 3 },
          updatedAt: 100,
        },
      },
      updatedAt: 100,
    })
    expect(roundTripped.ui.settingsSection).toBe('visuals')
    expect(roundTripped.frontmatter.settingsTemplateId).toBe('template-1')
    expect(roundTripped.frontmatter.lastAppliedTemplateId).toBe('template-1')
    expect(roundTripped.ui.noteCursorLocations['domain::space-1::tab-1::__home__']).toEqual({
      activeAisleId: 'aisle-tab',
      aisles: {
        'aisle-tab': {
          anchor: 1,
          head: 3,
          anchorBlock: { blockIndex: 0, offset: 1 },
          headBlock: { blockIndex: 0, offset: 3 },
          updatedAt: 100,
        },
      },
      updatedAt: 100,
    })
  })

  it('persists app settings and per-space settings in hybrid notes-data manifests', () => {
    const state = parseSavedState(
      JSON.stringify({
        theme: 'custom2',
        activeDomainId: 'domain-1',
        activeSpaceId: 'space-1',
        domains: [
          {
            id: 'domain-1',
            name: 'Domain',
            activeSpaceId: 'space-1',
            spaces: [
              {
                id: 'space-1',
                name: 'Space',
                settings: { autoRemoveDeletedDays: 21 },
                data: {
                  activeTabId: 'tab-1',
                  tabs: [
                    {
                      id: 'tab-1',
                      title: 'Tab',
                      noteBodyId: 'body-1',
                      homeContent: '',
                      activeSubTabId: null,
                      subTabs: [],
                    },
                  ],
                  deletedTabs: [],
                  deletedSubTabs: [],
                },
              },
            ],
          },
        ],
        noteBodies: [{ id: 'body-1', aisles: [{ id: 'aisle-1', markdown: 'body' }] }],
        hotkeys: {
          shortcuts: { newTab: 'Ctrl+Alt+N', newSubTab: 'Ctrl+Alt+M' },
          newlineShortcuts: {
            shortcuts: {
              controlEnter: 'horizontalLine',
              shiftEnter: 'task',
              commandEnter: 'operationsMenu',
            },
            menuOperations: ['task', 'aisle', 'strikethrough'],
          },
          enableMouseBackForward: false,
          enableGenericHistoryHotkeys: false,
        },
        frontmatter: {
          settingsTemplateId: 'template-1',
          lastAppliedTemplateId: 'template-1',
          templates: [
            {
              id: 'template-1',
              name: 'template',
              fields: [{ id: 'field-1', key: 'status', type: 'text', defaultValue: 'draft', computed: 'none' }],
            },
          ],
        },
        ui: {
          showParentHomeTab: false,
          stageManagerOpenDestinationAfterApply: false,
          settingsSection: 'toolbar',
          selectedCustomTheme: 'custom2',
          lastNoteCopyMode: 'linked',
          decoupledItemsKeepData: false,
          tableAddTargetMode: 'active-cell',
          tableDeleteTargetMode: 'active-cell',
          tabButtonScale: 1.3,
          noteFontScale: 1.2,
          themePalettes: {
            dawn: {
              ...DEFAULT_CUSTOM_THEME_PALETTE,
              primary: '#123456',
            },
          },
        },
      }),
    )

    const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify(state))
    const { rootManifest, spaceManifest } = getBrowserWorkspacePaths(fileMap)
    const appSettings = getRootSplitFileJson(fileMap, rootManifest, 'appSettings', 'app-settings.json')
    const frontmatterSettings = getRootSplitFileJson(fileMap, rootManifest, 'frontmatterSettings', 'frontmatter-settings.json')
    const roundTripped = parseSavedState(readSerializedStateFromHybridFileMap(fileMap) ?? '')

    expect(Object.keys(rootManifest).sort()).toEqual(['files', 'schemaVersion'])
    expect(fileMap.has('notes-data/profile-settings.json')).toBe(false)
    expect(appSettings.theme).toBe('custom2')
    expect(appSettings.selectedCustomTheme).toBe('custom2')
    expect(getRecord(appSettings.themePalettes).dawn).toMatchObject({ primary: '#123456' })
    expect(appSettings.tabButtonScale).toBe(1.3)
    expect(appSettings.noteFontScale).toBe(1.2)
    expect(getRecord(appSettings.ui).settingsSection).toBe('toolbar')
    expect(getRecord(appSettings.ui).lastNoteCopyMode).toBe('linked')
    expect(getRecord(appSettings.ui).showParentHomeTab).toBe(false)
    expect(getRecord(appSettings.hotkeys).enableMouseBackForward).toBe(false)
    expect(getRecord(getRecord(appSettings.hotkeys).shortcuts).newTab).toBe('Ctrl+Alt+N')
    expect(frontmatterSettings.settingsTemplateId).toBe('template-1')
    expect(spaceManifest.settings).toEqual({ autoRemoveDeletedDays: 21 })
    expect(roundTripped.ui.settingsSection).toBe('toolbar')
    expect(roundTripped.theme).toBe('custom2')
    expect(roundTripped.ui.selectedCustomTheme).toBe('custom2')
    expect(roundTripped.ui.tabButtonScale).toBe(1.3)
    expect(roundTripped.ui.noteFontScale).toBe(1.2)
    expect(roundTripped.ui.themePalettes?.dawn?.primary).toBe('#123456')
    expect(roundTripped.hotkeys.shortcuts.newTab).toBe('Ctrl+Alt+N')
    expect(roundTripped.hotkeys.enableMouseBackForward).toBe(false)
    expect(roundTripped.frontmatter.settingsTemplateId).toBe('template-1')
    expect(roundTripped.domains[0]?.spaces[0]?.settings).toEqual({ autoRemoveDeletedDays: 21 })
  })

  it('prefers synced profile settings while keeping legacy root global settings as fallback', () => {
    const state = createBrowserStorageState()
    const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify({ ...state, theme: 'dawn' }))
    const rootManifest = getTextFileJson(fileMap, 'notes-data/manifest.json')
    const workspaceIndex = getRootSplitFileJson(fileMap, rootManifest, 'workspaceIndex', 'workspace-index.json')
    const navigationState = getRootSplitFileJson(fileMap, rootManifest, 'navigationState', 'navigation-state.json')
    const appSettings = getRootSplitFileJson(fileMap, rootManifest, 'appSettings', 'app-settings.json')
    const frontmatterSettings = getRootSplitFileJson(fileMap, rootManifest, 'frontmatterSettings', 'frontmatter-settings.json')
    const editorState = getRootSplitFileJson(fileMap, rootManifest, 'editorState', 'editor-state.json')
    const deletedWorkspace = getRootSplitFileJson(fileMap, rootManifest, 'deletedWorkspace', 'deleted-workspace.json')
    const noteRegistry = getRootSplitFileJson(fileMap, rootManifest, 'noteRegistry', 'note-registry.json')
    const profileSettings = {
      schemaVersion: 1,
      settings: {
        theme: 'dawn',
        hotkeys: appSettings.hotkeys,
        frontmatter: frontmatterSettings,
        ui: {
          ...appSettings,
          ...getRecord(appSettings.ui),
          ...editorState,
        },
      },
    }
    const legacyRootManifest = {
      schemaVersion: 2,
      globalSettings: {
        ...profileSettings.settings,
        theme: 'light',
      },
      domains: workspaceIndex.domains,
      deletedDomains: deletedWorkspace.deletedDomains,
      deletedSpaces: deletedWorkspace.deletedSpaces,
      noteBodies: noteRegistry.noteBodies,
      noteAisleBodies: noteRegistry.aisleBodies,
      activeDomainId: navigationState.activeDomainId,
    }

    fileMap.set('notes-data/manifest.json', {
      path: 'notes-data/manifest.json',
      kind: 'text',
      text: `${JSON.stringify(legacyRootManifest, null, 2)}\n`,
    })
    fileMap.set('notes-data/profile-settings.json', {
      path: 'notes-data/profile-settings.json',
      kind: 'text',
      text: `${JSON.stringify({ ...profileSettings, settings: { ...profileSettings.settings, theme: 'blues' } }, null, 2)}\n`,
    })

    expect(parseSavedState(readSerializedStateFromHybridFileMap(fileMap)).theme).toBe('blues')

    fileMap.delete('notes-data/profile-settings.json')

    expect(parseSavedState(readSerializedStateFromHybridFileMap(fileMap)).theme).toBe('light')
  })

  it('persists rearranged parent and sub-tab order in hybrid notes-data storage', () => {
    const state = parseSavedState(
      JSON.stringify({
        activeDomainId: 'domain-1',
        activeSpaceId: 'space-1',
        domains: [
          {
            id: 'domain-1',
            name: 'Domain',
            activeSpaceId: 'space-1',
            spaces: [
              {
                id: 'space-1',
                name: 'Space',
                data: {
                  activeTabId: 'tab-b',
                  tabs: [
                    {
                      id: 'tab-b',
                      title: 'Beta',
                      noteBodyId: 'body-b',
                      homeContent: '',
                      activeSubTabId: 'sub-b2',
                      subTabs: [
                        { id: 'sub-b2', title: 'Second', noteBodyId: 'body-b2', content: '' },
                        { id: 'sub-b1', title: 'First', noteBodyId: 'body-b1', content: '' },
                      ],
                    },
                    {
                      id: 'tab-a',
                      title: 'Alpha',
                      noteBodyId: 'body-a',
                      homeContent: '',
                      activeSubTabId: null,
                      subTabs: [],
                    },
                  ],
                  deletedTabs: [],
                  deletedSubTabs: [],
                },
              },
            ],
          },
        ],
        noteBodies: [
          { id: 'body-b', aisles: [{ id: 'aisle-b', markdown: 'b' }] },
          { id: 'body-b2', aisles: [{ id: 'aisle-b2', markdown: 'b2' }] },
          { id: 'body-b1', aisles: [{ id: 'aisle-b1', markdown: 'b1' }] },
          { id: 'body-a', aisles: [{ id: 'aisle-a', markdown: 'a' }] },
        ],
      }),
    )

    const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify(state))
    const { spaceManifest } = getBrowserWorkspacePaths(fileMap)
    const manifestTabs = Array.isArray(spaceManifest.tabs) ? spaceManifest.tabs.map(getRecord) : []
    const roundTripped = parseSavedState(readSerializedStateFromHybridFileMap(fileMap) ?? '')
    const roundTrippedTabs = roundTripped.domains[0]?.spaces[0]?.data.tabs ?? []

    expect(manifestTabs.map((tab) => tab.id)).toEqual(['tab-b', 'tab-a'])
    expect((Array.isArray(manifestTabs[0]?.subTabs) ? manifestTabs[0].subTabs.map(getRecord) : []).map((subTab) => subTab.id)).toEqual([
      'sub-b2',
      'sub-b1',
    ])
    expect(roundTrippedTabs.map((tab) => tab.id)).toEqual(['tab-b', 'tab-a'])
    expect(roundTrippedTabs[0]?.subTabs.map((subTab) => subTab.id)).toEqual(['sub-b2', 'sub-b1'])
  })

  it('round trips shared aisle body ids through the manifest file map', () => {
    const state = parseSavedState(
      JSON.stringify({
        theme: 'dawn',
        spaces: [
          {
            id: 'space-1',
            name: 'Space',
            data: {
              activeTabId: 'tab-1',
              tabs: [
                {
                  id: 'tab-1',
                  title: 'One',
                  noteBodyId: 'body-1',
                  homeContent: '',
                  activeSubTabId: null,
                  subTabs: [],
                },
                {
                  id: 'tab-2',
                  title: 'Two',
                  noteBodyId: 'body-2',
                  homeContent: '',
                  activeSubTabId: null,
                  subTabs: [],
                },
              ],
              deletedTabs: [],
              deletedSubTabs: [],
            },
          },
        ],
        noteAisleBodies: [{ id: 'shared-aisle-body', markdown: 'shared aisle text' }],
        noteBodies: [
          {
            id: 'body-1',
            aisles: [{ id: 'aisle-1', aisleBodyId: 'shared-aisle-body', markdown: 'shared aisle text' }],
          },
          {
            id: 'body-2',
            aisles: [{ id: 'aisle-2', aisleBodyId: 'shared-aisle-body', markdown: 'shared aisle text' }],
          },
        ],
      }),
    )

    const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify(state))
    const rootManifest = getTextFileJson(fileMap, 'notes-data/manifest.json')
    const noteRegistry = getRootSplitFileJson(fileMap, rootManifest, 'noteRegistry', 'note-registry.json')
    const serialized = readSerializedStateFromHybridFileMap(fileMap)
    const roundTripped = parseSavedState(serialized)
    const bodyOne = roundTripped.noteBodies.find((body) => body.id === 'body-1')
    const bodyTwo = roundTripped.noteBodies.find((body) => body.id === 'body-2')
    const manifestBodies = Array.isArray(noteRegistry.noteBodies) ? noteRegistry.noteBodies : []

    expect(bodyOne?.aisles[0]?.aisleBodyId).toBe('shared-aisle-body')
    expect(bodyTwo?.aisles[0]?.aisleBodyId).toBe('shared-aisle-body')
    expect(roundTripped.noteAisleBodies?.find((body) => body.id === 'shared-aisle-body')?.markdown).toBe('shared aisle text')
    expect(JSON.stringify(manifestBodies)).toContain('"aisleBodyId":"shared-aisle-body"')
  })

  it('round trips distinct aisle body markdown without collapsing sibling aisles', () => {
    const state = createBrowserStorageState()
    state.noteBodies[0].aisles = [
      { id: 'aisle-home', aisleBodyId: 'body-home-aisle', markdown: 'stale home mirror' },
      { id: 'aisle-two', aisleBodyId: 'body-second-aisle', markdown: 'stale second mirror' },
    ]
    state.noteAisleBodies = [
      { id: 'body-home-aisle', markdown: 'left aisle draft 🚙' },
      { id: 'body-second-aisle', markdown: 'right aisle draft 🥺' },
    ]

    const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify(state))
    const rootManifest = getTextFileJson(fileMap, 'notes-data/manifest.json')
    const noteRegistry = getRootSplitFileJson(fileMap, rootManifest, 'noteRegistry', 'note-registry.json')
    const bodyRecord = getRecord(
      (Array.isArray(noteRegistry.noteBodies) ? noteRegistry.noteBodies : [])
        .find((entry) => getRecord(entry).id === 'body-1'),
    )
    const aisleFiles = (Array.isArray(bodyRecord.aisles) ? bodyRecord.aisles : [])
      .map(getRecord)
      .map((aisle) => String(aisle.file))

    expect(aisleFiles[0]).toMatch(/\/home\/aisle 1--[a-f0-9]{6}\.md$/)
    expect(aisleFiles[1]).toMatch(/\/home\/aisle 2--[a-f0-9]{6}\.md$/)
    expect(fileMap.get(`notes-data/${aisleFiles[0]}`)).toMatchObject({ kind: 'text', text: 'left aisle draft 🚙' })
    expect(fileMap.get(`notes-data/${aisleFiles[1]}`)).toMatchObject({ kind: 'text', text: 'right aisle draft 🥺' })

    const roundTripped = parseSavedState(readSerializedStateFromHybridFileMap(fileMap) ?? '')
    expect(roundTripped.noteAisleBodies?.find((body) => body.id === 'body-home-aisle')?.markdown).toBe('left aisle draft 🚙')
    expect(roundTripped.noteAisleBodies?.find((body) => body.id === 'body-second-aisle')?.markdown).toBe('right aisle draft 🥺')
    expect(roundTripped.noteBodies[0].aisles.map((aisle) => aisle.markdown)).toEqual([
      'left aisle draft 🚙',
      'right aisle draft 🥺',
    ])
  })

  it('uses shared aisle body markdown instead of stale linked aisle mirrors', () => {
    const currentMarkdown = 'Hat Trick!\n\n---\n\n\u200b'
    const staleMarkdown = 'Hat Trick!\n\n\u200b\n\n\n\n\u200b\n\n---\n\n\u200b'
    const state = parseSavedState(
      JSON.stringify({
        theme: 'dawn',
        spaces: [
          {
            id: 'space-1',
            name: 'Space',
            data: {
              activeTabId: 'tab-1',
              tabs: [
                {
                  id: 'tab-1',
                  title: 'One',
                  noteBodyId: 'body-1',
                  homeContent: '',
                  activeSubTabId: null,
                  subTabs: [],
                },
                {
                  id: 'tab-2',
                  title: 'Two',
                  noteBodyId: 'body-2',
                  homeContent: '',
                  activeSubTabId: null,
                  subTabs: [],
                },
              ],
              deletedTabs: [],
              deletedSubTabs: [],
            },
          },
        ],
        noteAisleBodies: [{ id: 'shared-aisle-body', markdown: currentMarkdown }],
        noteBodies: [
          {
            id: 'body-1',
            aisles: [{ id: 'aisle-1', aisleBodyId: 'shared-aisle-body', markdown: currentMarkdown }],
          },
          {
            id: 'body-2',
            aisles: [{ id: 'aisle-2', aisleBodyId: 'shared-aisle-body', markdown: currentMarkdown }],
          },
        ],
      }),
    )
    const bodyTwo = state.noteBodies.find((body) => body.id === 'body-2')
    if (bodyTwo?.aisles[0]) {
      bodyTwo.aisles[0].markdown = staleMarkdown
    }

    const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify(state))
    const rootManifest = getTextFileJson(fileMap, 'notes-data/manifest.json')
    const noteRegistry = getRootSplitFileJson(fileMap, rootManifest, 'noteRegistry', 'note-registry.json')
    const noteAisleBodyEntries = Array.isArray(noteRegistry.aisleBodies) ? noteRegistry.aisleBodies : []
    const sharedAisleBody = getRecord(noteAisleBodyEntries.find((entry) => getRecord(entry).id === 'shared-aisle-body'))
    const sharedAisleBodyFile = String(sharedAisleBody.file)
    const noteBodyEntries = Array.isArray(noteRegistry.noteBodies) ? noteRegistry.noteBodies.map(getRecord) : []
    const linkedAisleFiles = noteBodyEntries
      .flatMap((body) => (Array.isArray(body.aisles) ? body.aisles.map(getRecord) : []))
      .filter((aisle) => aisle.aisleBodyId === 'shared-aisle-body')
      .map((aisle) => String(aisle.file))
    const staleLinkedFile = linkedAisleFiles.find((file) => file !== sharedAisleBodyFile)
    if (staleLinkedFile) {
      fileMap.set(`notes-data/${staleLinkedFile}`, {
        path: `notes-data/${staleLinkedFile}`,
        kind: 'text',
        text: staleMarkdown,
      })
    }

    const serialized = readSerializedStateFromHybridFileMap(fileMap)
    const roundTripped = parseSavedState(serialized)
    const roundTrippedBodyOne = roundTripped.noteBodies.find((body) => body.id === 'body-1')
    const roundTrippedBodyTwo = roundTripped.noteBodies.find((body) => body.id === 'body-2')

    expect(sharedAisleBodyFile).toBeTruthy()
    expect(roundTripped.noteAisleBodies?.find((body) => body.id === 'shared-aisle-body')?.markdown).toBe(currentMarkdown)
    expect(roundTrippedBodyOne?.aisles[0]?.markdown).toBe(currentMarkdown)
    expect(roundTrippedBodyTwo?.aisles[0]?.markdown).toBe(currentMarkdown)
  })

  it('caps generated storage path segments without truncating app titles', () => {
    const longTitle = 'Very Long Cross Platform Folder Name With Emoji 👨‍👩‍👧‍👦 And Symbols <>:"/\\|?* '.repeat(4).trim()
    const state = parseSavedState(
      JSON.stringify({
        theme: 'dawn',
        activeDomainId: 'domain-long',
        domains: [
          {
            id: 'domain-long',
            name: longTitle,
            activeSpaceId: 'space-long',
            spaces: [
              {
                id: 'space-long',
                name: longTitle,
                settings: { autoRemoveDeletedDays: 7 },
                data: {
                  activeTabId: 'tab-long',
                  tabs: [
                    {
                      id: 'tab-long',
                      title: longTitle,
                      noteBodyId: 'body-tab-long',
                      homeContent: 'home',
                      activeSubTabId: 'sub-long',
                      subTabs: [{ id: 'sub-long', title: longTitle, noteBodyId: 'body-sub-long', content: 'sub' }],
                    },
                  ],
                  deletedTabs: [],
                  deletedSubTabs: [],
                },
              },
            ],
          },
        ],
        noteBodies: [
          {
            id: 'body-tab-long',
            aisles: [
              { id: 'aisle-home-long', markdown: 'home' },
              { id: 'aisle-second-long', markdown: 'second aisle' },
            ],
          },
          { id: 'body-sub-long', aisles: [{ id: 'aisle-sub-long', markdown: 'sub' }] },
          { id: 'body-deleted-tab', aisles: [{ id: 'aisle-deleted-tab', markdown: 'deleted tab' }] },
          { id: 'body-deleted-sub', aisles: [{ id: 'aisle-deleted-sub', markdown: 'deleted sub' }] },
          { id: 'body-deleted-loose-sub', aisles: [{ id: 'aisle-deleted-loose-sub', markdown: 'deleted loose sub' }] },
          { id: 'body-orphan-long', aisles: [{ id: 'aisle-orphan-long', markdown: 'orphan' }] },
        ],
      }),
    )
    state.domains[0].spaces[0].data.deletedTabs = [
      {
        id: 'deleted-tab-entry-long',
        deletedAt: 1,
        tab: {
          id: 'deleted-tab-long',
          title: longTitle,
          noteBodyId: 'body-deleted-tab',
          homeContent: 'deleted tab',
          activeSubTabId: null,
          subTabs: [{ id: 'deleted-sub-long', title: longTitle, noteBodyId: 'body-deleted-sub', content: 'deleted sub' }],
        },
      },
    ]
    state.domains[0].spaces[0].data.deletedSubTabs = [
      {
        id: 'deleted-sub-entry-long',
        parentTabId: 'tab-long',
        parentTabTitle: longTitle,
        deletedAt: 2,
        subTab: {
          id: 'deleted-loose-sub-long',
          title: longTitle,
          noteBodyId: 'body-deleted-loose-sub',
          content: 'deleted loose sub',
        },
      },
    ]

    const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify(state))
    const rootManifest = getTextFileJson(fileMap, 'notes-data/manifest.json')
    const workspaceIndex = getRootSplitFileJson(fileMap, rootManifest, 'workspaceIndex', 'workspace-index.json')
    const domainEntry = getRecord(Array.isArray(workspaceIndex.domains) ? workspaceIndex.domains[0] : null)
    const domainManifest = getTextFileJson(fileMap, `notes-data/domains/${String(domainEntry.path)}/manifest.json`)
    const spaceEntry = getRecord(Array.isArray(domainManifest.spaces) ? domainManifest.spaces[0] : null)
    const spaceManifest = getTextFileJson(
      fileMap,
      `notes-data/domains/${String(domainEntry.path)}/${String(spaceEntry.path)}/manifest.json`,
    )
    const trashManifest = getTextFileJson(
      fileMap,
      `notes-data/domains/${String(domainEntry.path)}/${String(spaceEntry.path)}/trash/manifest.json`,
    )
    const firstTab = getRecord(Array.isArray(spaceManifest.tabs) ? spaceManifest.tabs[0] : null)
    const firstSubTab = getRecord(Array.isArray(firstTab.subTabs) ? firstTab.subTabs[0] : null)
    const deletedParent = getRecord(Array.isArray(trashManifest.items) ? trashManifest.items[0] : null)
    const deletedNestedSubTab = getRecord(Array.isArray(deletedParent.subTabs) ? deletedParent.subTabs[0] : null)
    const deletedLooseSubTab = getRecord(Array.isArray(trashManifest.items) ? trashManifest.items[1] : null)

    Array.from(fileMap.keys()).forEach(expectPathSegmentsWithinLimit)
    expect(domainEntry.title).toBe(longTitle)
    expect(domainManifest.title).toBe(longTitle)
    expect(spaceManifest.title).toBe(longTitle)
    expect(firstTab.title).toBe(longTitle)
    expect(firstSubTab.title).toBe(longTitle)
    expect(deletedParent.file).toBe(`${String(deletedParent.path)}/home.md`)
    expect(String(deletedNestedSubTab.path).startsWith(`${String(deletedParent.path)}/`)).toBe(true)
    expect(deletedNestedSubTab.path).toEqual(expect.stringMatching(/--[a-f0-9]{6}\.md$/))
    expect(deletedNestedSubTab.file).toBe(deletedNestedSubTab.path)
    expect(deletedLooseSubTab.path).toEqual(expect.stringMatching(/--[a-f0-9]{6}\.md$/))
    expect(deletedLooseSubTab.file).toBe(deletedLooseSubTab.path)
    expect(domainEntry.path).toEqual(expect.stringMatching(/--[a-f0-9]{6}$/))
    expect(spaceEntry.path).toEqual(expect.stringMatching(/--[a-f0-9]{6}$/))
    expect(firstTab.path).toEqual(expect.stringMatching(/--[a-f0-9]{6}$/))
    expect(firstSubTab.path).toEqual(expect.stringMatching(/--[a-f0-9]{6}\.md$/))
  })

  it('does not read malformed topic/note-body file maps', () => {
    const fileMap = new Map([
      [
        'notes-data/manifest.json',
        {
          path: 'notes-data/manifest.json',
          kind: 'text' as const,
          text: JSON.stringify({
            schemaVersion: 1,
            topics: [{ id: 'domain-1', title: 'Domain' }],
            activeTopicId: 'domain-1',
          }),
        },
      ],
      [
        'notes-data/topics/domain-1/manifest.json',
        {
          path: 'notes-data/topics/domain-1/manifest.json',
          kind: 'text' as const,
          text: JSON.stringify({ id: 'domain-1', title: 'Domain', spaces: [] }),
        },
      ],
    ])

    expect(readSerializedStateFromHybridFileMap(fileMap)).toBeNull()
  })

  for (const schemaVersion of [4, 999]) {
    it(`does not read unsupported schema ${schemaVersion} file maps`, () => {
      const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify(createBrowserStorageState()))
      const rootManifest = getTextFileJson(fileMap, 'notes-data/manifest.json')
      fileMap.set('notes-data/manifest.json', {
        path: 'notes-data/manifest.json',
        kind: 'text',
        text: `${JSON.stringify({ ...rootManifest, schemaVersion }, null, 2)}\n`,
      })

      expect(readSerializedStateFromHybridFileMap(fileMap)).toBeNull()
    })
  }

  it('does not read schema 3 file maps missing required split files', () => {
    const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify(createBrowserStorageState()))
    const rootManifest = getTextFileJson(fileMap, 'notes-data/manifest.json')
    const files = getRecord(rootManifest.files)

    fileMap.delete(`notes-data/${String(files.noteRegistry)}`)

    expect(readSerializedStateFromHybridFileMap(fileMap)).toBeNull()
  })

  it('loads schema 3 file maps with optional editor split file missing', () => {
    const state = createBrowserStorageState()
    state.ui.settingsSection = 'toolbar'
    state.ui.noteCursorLocations = {
      'domain::space-1::tab-1::__home__': {
        activeAisleId: 'aisle-1',
        aisles: {
          'aisle-1': {
            anchor: 1,
            head: 1,
            updatedAt: 1,
          },
        },
        updatedAt: 1,
      },
    }
    const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify(state))
    const rootManifest = getTextFileJson(fileMap, 'notes-data/manifest.json')
    const files = getRecord(rootManifest.files)

    fileMap.delete(`notes-data/${String(files.editorState)}`)

    const roundTripped = parseSavedState(readSerializedStateFromHybridFileMap(fileMap) ?? '')
    expect(roundTripped.domains).toHaveLength(1)
    expect(roundTripped.ui.settingsSection).toBe('toolbar')
    expect(roundTripped.ui.noteCursorLocations).toEqual({})
  })

  it('loads temporary wider schema 3 file maps', () => {
    const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify(createBrowserStorageState()))
    const rootManifest = getTextFileJson(fileMap, 'notes-data/manifest.json')
    const appSettings = getRootSplitFileJson(fileMap, rootManifest, 'appSettings', 'app-settings.json')
    const noteRegistry = getRootSplitFileJson(fileMap, rootManifest, 'noteRegistry', 'note-registry.json')
    const wideFiles = {
      workspaceIndex: 'workspace-index.json',
      navigationState: 'navigation-state.json',
      appearanceSettings: 'appearance-settings.json',
      shortcutSettings: 'shortcut-settings.json',
      frontmatterSettings: 'frontmatter-settings.json',
      uiPreferences: 'ui-preferences.json',
      editorState: 'editor-state.json',
      deletedWorkspace: 'deleted-workspace.json',
      noteBodies: 'note-bodies.json',
      aisleBodies: 'aisle-bodies.json',
      orphanNoteBodies: 'orphan-note-bodies.json',
      orphanAisleBodies: 'orphan-aisle-bodies.json',
    }

    fileMap.set('notes-data/appearance-settings.json', {
      path: 'notes-data/appearance-settings.json',
      kind: 'text',
      text: `${JSON.stringify(appSettings, null, 2)}\n`,
    })
    fileMap.set('notes-data/shortcut-settings.json', {
      path: 'notes-data/shortcut-settings.json',
      kind: 'text',
      text: `${JSON.stringify(getRecord(appSettings.hotkeys), null, 2)}\n`,
    })
    fileMap.set('notes-data/ui-preferences.json', {
      path: 'notes-data/ui-preferences.json',
      kind: 'text',
      text: `${JSON.stringify(getRecord(appSettings.ui), null, 2)}\n`,
    })
    fileMap.set('notes-data/note-bodies.json', {
      path: 'notes-data/note-bodies.json',
      kind: 'text',
      text: `${JSON.stringify({ noteBodies: noteRegistry.noteBodies }, null, 2)}\n`,
    })
    fileMap.set('notes-data/aisle-bodies.json', {
      path: 'notes-data/aisle-bodies.json',
      kind: 'text',
      text: `${JSON.stringify({ noteAisleBodies: noteRegistry.aisleBodies }, null, 2)}\n`,
    })
    fileMap.set('notes-data/orphan-note-bodies.json', {
      path: 'notes-data/orphan-note-bodies.json',
      kind: 'text',
      text: `${JSON.stringify({ noteBodies: [] }, null, 2)}\n`,
    })
    fileMap.set('notes-data/orphan-aisle-bodies.json', {
      path: 'notes-data/orphan-aisle-bodies.json',
      kind: 'text',
      text: `${JSON.stringify({ noteAisleBodies: [] }, null, 2)}\n`,
    })
    fileMap.set('notes-data/manifest.json', {
      path: 'notes-data/manifest.json',
      kind: 'text',
      text: `${JSON.stringify({ schemaVersion: 3, files: wideFiles }, null, 2)}\n`,
    })
    fileMap.delete('notes-data/app-settings.json')
    fileMap.delete('notes-data/note-registry.json')

    const roundTripped = parseSavedState(readSerializedStateFromHybridFileMap(fileMap) ?? '')
    expect(roundTripped.domains).toHaveLength(1)
    expect(roundTripped.noteBodies[0]?.aisles[0]?.markdown).toBe('home body')
  })

  it('loads missing markdown files as empty content', () => {
    const state = createBrowserStorageState()
    const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify(state))
    const { spaceRoot, spaceManifest } = getBrowserWorkspacePaths(fileMap)
    const firstTab = getRecord(Array.isArray(spaceManifest.tabs) ? spaceManifest.tabs[0] : null)
    fileMap.delete(`${spaceRoot}/${String(firstTab.homeNoteFile)}`)

    const serialized = readSerializedStateFromHybridFileMap(fileMap)
    const roundTripped = parseSavedState(serialized ?? '')

    expect(serialized).toEqual(expect.any(String))
    expect(roundTripped.noteBodies[0]?.aisles[0]?.markdown).toBe('')
    expect(roundTripped.domains[0]?.spaces[0]?.data.tabs[0]?.homeContent).toBe('')
  })

  it('keeps markdown references for missing image assets', () => {
    const state = createBrowserStorageState()
    state.noteBodies[0].aisles[0].markdown = 'image ![pixel](data:image/png;base64,iVBORw0KGgo=)'
    if (state.noteAisleBodies?.[0]) {
      state.noteAisleBodies[0].markdown = state.noteBodies[0].aisles[0].markdown
    }
    const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify(state))
    Array.from(fileMap.keys())
      .filter((path) => path.startsWith('notes-data/assets/'))
      .forEach((path) => fileMap.delete(path))

    const serialized = readSerializedStateFromHybridFileMap(fileMap)
    const roundTripped = parseSavedState(serialized ?? '')

    expect(serialized).toEqual(expect.any(String))
    expect(roundTripped.noteBodies[0]?.aisles[0]?.markdown).toContain('![pixel](')
    expect(roundTripped.noteBodies[0]?.aisles[0]?.markdown).not.toContain('data:image/')
  })

  it('round trips registered image asset refs without data URLs', () => {
    const state = createBrowserStorageState()
    const bytes = new Uint8Array([1, 2, 3, 4])
    const assetPath = 'assets/asset-browser-test.png'
    registerImageAssetBytes(assetPath, bytes, 'image/png')
    state.noteBodies[0].aisles[0].markdown = `image ![pixel](${buildImageAssetUrl(assetPath)})`
    if (state.noteAisleBodies?.[0]) {
      state.noteAisleBodies[0].markdown = state.noteBodies[0].aisles[0].markdown
    }

    const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify(state))
    const assetEntry = fileMap.get(`notes-data/${assetPath}`)
    const serialized = readSerializedStateFromHybridFileMap(fileMap)
    const roundTripped = parseSavedState(serialized ?? '')

    expect(assetEntry?.kind).toBe('binary')
    expect(assetEntry?.kind === 'binary' ? Array.from(assetEntry.bytes) : []).toEqual(Array.from(bytes))
    expect(roundTripped.noteBodies[0]?.aisles[0]?.markdown).toContain(buildImageAssetUrl(assetPath))
    expect(roundTripped.noteBodies[0]?.aisles[0]?.markdown).not.toContain('data:image/')
  })

  it('round trips registered non-image asset links', () => {
    const state = createBrowserStorageState()
    const bytes = new Uint8Array([9, 8, 7, 6])
    const assetPath = 'assets/asset-browser-report.pdf'
    registerAssetBytes(assetPath, bytes, 'application/pdf')
    state.noteBodies[0].aisles[0].markdown = `[report](${buildImageAssetUrl(assetPath)})`
    if (state.noteAisleBodies?.[0]) {
      state.noteAisleBodies[0].markdown = state.noteBodies[0].aisles[0].markdown
    }

    const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify(state))
    const assetEntry = fileMap.get(`notes-data/${assetPath}`)
    const serialized = readSerializedStateFromHybridFileMap(fileMap)
    const roundTripped = parseSavedState(serialized ?? '')

    expect(assetEntry?.kind).toBe('binary')
    expect(assetEntry?.kind === 'binary' ? Array.from(assetEntry.bytes) : []).toEqual(Array.from(bytes))
    expect(roundTripped.noteBodies[0]?.aisles[0]?.markdown).toContain(buildImageAssetUrl(assetPath))
  })

  it('loads corrupt trash manifests as empty trash', () => {
    const state = createBrowserStorageState()
    state.domains[0].spaces[0].data.deletedTabs = [
      {
        id: 'deleted-parent-entry',
        deletedAt: 10,
        tab: {
          id: 'deleted-parent',
          title: 'Deleted Parent',
          noteBodyId: 'body-deleted-parent',
          homeContent: 'deleted body',
          activeSubTabId: null,
          subTabs: [],
        },
      },
    ]
    state.noteBodies.push({ id: 'body-deleted-parent', frontmatter: null, aisles: [{ id: 'aisle-deleted', markdown: 'deleted body' }] })
    const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify(state))
    const { spaceRoot, spaceManifest } = getBrowserWorkspacePaths(fileMap)
    const trashManifestPath = `${spaceRoot}/${String(spaceManifest.trashManifestFile)}`
    fileMap.set(trashManifestPath, { path: trashManifestPath, kind: 'text', text: '{bad' })

    const serialized = readSerializedStateFromHybridFileMap(fileMap)
    const roundTripped = parseSavedState(serialized ?? '')

    expect(serialized).toEqual(expect.any(String))
    expect(roundTripped.domains[0]?.spaces[0]?.data.deletedTabs).toEqual([])
    expect(roundTripped.domains[0]?.spaces[0]?.data.deletedSubTabs).toEqual([])
  })

  it('skips corrupt space manifests while preserving readable spaces', () => {
    const state = createBrowserStorageState()
    const secondSpace = {
      id: 'space-2',
      name: 'Second Space',
      settings: { autoRemoveDeletedDays: 14 },
      data: {
        activeTabId: 'tab-2',
        tabs: [
          {
            id: 'tab-2',
            title: 'Second Tab',
            noteBodyId: 'body-2',
            homeContent: 'second fallback',
            activeSubTabId: null,
            subTabs: [],
          },
        ],
        deletedTabs: [],
        deletedSubTabs: [],
      },
    }
    state.domains[0].spaces.push(secondSpace)
    state.spaces = state.domains[0].spaces
    state.noteBodies.push({ id: 'body-2', frontmatter: null, aisles: [{ id: 'aisle-2', markdown: 'second body' }] })
    const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify(state))
    const { domainRoot, domainManifest } = getBrowserWorkspacePaths(fileMap)
    const firstSpace = getRecord(Array.isArray(domainManifest.spaces) ? domainManifest.spaces[0] : null)
    const firstSpaceManifestPath = `${domainRoot}/${String(firstSpace.path)}/manifest.json`
    fileMap.set(firstSpaceManifestPath, { path: firstSpaceManifestPath, kind: 'text', text: '{bad' })

    const serialized = readSerializedStateFromHybridFileMap(fileMap)
    const roundTripped = parseSavedState(serialized ?? '')

    expect(serialized).toEqual(expect.any(String))
    expect(roundTripped.domains[0]?.spaces).toHaveLength(1)
    expect(roundTripped.domains[0]?.spaces[0]?.id).toBe('space-2')
    expect(roundTripped.activeSpaceId).toBe('space-2')
  })

  it('skips corrupt domain manifests while preserving readable domains', () => {
    const state = createBrowserStorageState()
    const secondSpace = {
      id: 'space-2',
      name: 'Second Space',
      settings: { autoRemoveDeletedDays: 14 },
      data: {
        activeTabId: 'tab-2',
        tabs: [
          {
            id: 'tab-2',
            title: 'Second Tab',
            noteBodyId: 'body-2',
            homeContent: 'second fallback',
            activeSubTabId: null,
            subTabs: [],
          },
        ],
        deletedTabs: [],
        deletedSubTabs: [],
      },
    }
    state.domains.push({
      id: 'domain-2',
      name: 'Second Domain',
      activeSpaceId: 'space-2',
      spaces: [secondSpace],
    })
    state.noteBodies.push({ id: 'body-2', frontmatter: null, aisles: [{ id: 'aisle-2', markdown: 'second body' }] })
    const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify(state))
    const rootManifest = getTextFileJson(fileMap, 'notes-data/manifest.json')
    const workspaceIndex = getRootSplitFileJson(fileMap, rootManifest, 'workspaceIndex', 'workspace-index.json')
    const firstDomain = getRecord(Array.isArray(workspaceIndex.domains) ? workspaceIndex.domains[0] : null)
    const firstDomainManifestPath = `notes-data/domains/${String(firstDomain.path)}/manifest.json`
    fileMap.set(firstDomainManifestPath, { path: firstDomainManifestPath, kind: 'text', text: '{bad' })

    const serialized = readSerializedStateFromHybridFileMap(fileMap)
    const roundTripped = parseSavedState(serialized ?? '')

    expect(serialized).toEqual(expect.any(String))
    expect(roundTripped.domains).toHaveLength(1)
    expect(roundTripped.domains[0]?.id).toBe('domain-2')
    expect(roundTripped.activeDomainId).toBe('domain-2')
  })
})
