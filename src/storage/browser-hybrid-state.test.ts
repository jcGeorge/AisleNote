import { describe, expect, it } from 'vitest'
import { buildImageAssetUrl } from '../markdown/image-asset-refs.js'
import { registerAssetBytes, registerImageAssetBytes } from '../markdown/image-asset-registry'
import { DEFAULT_CUSTOM_THEME_PALETTE } from '../settings/defaults'
import { parseSavedState } from '../state/app-state'
import { getAisleMarkdown } from '../notes/note-markdown'
import { buildPreviewToken } from '../notes/note-references'
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

function getTextFile(fileMap: ReturnType<typeof buildHybridFileMapFromSerializedState>, path: string) {
  const entry = fileMap.get(path)
  return entry?.kind === 'text' ? entry.text : ''
}

function getRootSplitFileJson(
  fileMap: ReturnType<typeof buildHybridFileMapFromSerializedState>,
  rootManifest: Record<string, unknown>,
  key: string,
  fallbackFile: string,
) {
  const files = getRecord(rootManifest.files)
  const fileName = typeof files[key] === 'string' ? files[key] : fallbackFile
  return getTextFileJson(fileMap, `notes/${fileName}`)
}

function getUserSettingsFileJson(fileMap: ReturnType<typeof buildHybridFileMapFromSerializedState>) {
  return getTextFileJson(fileMap, 'settings/app-settings.json')
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
      noteBodies: [{ id: 'body-1', aisles: [{ id: 'aisle-1', aisleBodyId: 'aisle-body-1' }] }],
      noteAisleBodies: [{ id: 'aisle-body-1', markdown: 'home body' }],
      activeSpaceId: space.id,
      spaces: [space],
    }),
  )
}

function setFirstAisleBodyMarkdown(state: ReturnType<typeof createBrowserStorageState>, markdown: string) {
  const firstAisle = state.noteBodies[0]?.aisles[0]
  const aisleBody = firstAisle
    ? state.noteAisleBodies?.find((body) => body.id === firstAisle.aisleBodyId)
    : null
  if (aisleBody) aisleBody.markdown = markdown
}

function getFirstAisleBodyMarkdown(state: ReturnType<typeof createBrowserStorageState>) {
  const firstAisle = state.noteBodies[0]?.aisles[0]
  return firstAisle ? getAisleMarkdown(firstAisle, state.noteAisleBodies) : ''
}

function getBrowserWorkspacePaths(fileMap: ReturnType<typeof buildHybridFileMapFromSerializedState>) {
  const rootManifest = getTextFileJson(fileMap, 'notes/manifest.json')
  const workspaceIndex = getRootSplitFileJson(fileMap, rootManifest, 'workspaceIndex', 'workspace-index.json')
  const domainEntry = getRecord(Array.isArray(workspaceIndex.domains) ? workspaceIndex.domains[0] : null)
  const domainRoot = `notes/domains/${String(domainEntry.path)}`
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

function parseModernBrowserState(raw: Record<string, unknown>) {
  if (Array.isArray(raw.domains)) return parseSavedState(JSON.stringify(raw))
  const spaces = Array.isArray(raw.spaces) && raw.spaces.length > 0
    ? raw.spaces
    : [{
        id: 'space-1',
        name: 'Space',
        data: { activeTabId: 'tab-1', tabs: [], deletedTabs: [], deletedSubTabs: [] },
      }]
  const activeSpaceId = typeof raw.activeSpaceId === 'string' ? raw.activeSpaceId : String((spaces[0] as { id?: string }).id ?? '')
  const domainId = typeof raw.activeDomainId === 'string' ? raw.activeDomainId : 'domain-1'
  const domain = {
    id: domainId,
    name: 'Domain',
    activeSpaceId,
    spaces,
  }
  return parseSavedState(JSON.stringify({
    ...raw,
    activeDomainId: domain.id,
    domains: [domain],
    activeSpaceId,
    spaces,
  }))
}

describe('browser hybrid storage', () => {
  it('round trips markdown note bodies through the manifest file map', () => {
    const state = parseModernBrowserState({
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
                  activeSubTabId: 'sub-1',
                  subTabs: [
                    {
                      id: 'sub-1',
                      title: 'Sub',
                      noteBodyId: 'body-sub',
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
            aisles: [{ id: 'aisle-tab', aisleBodyId: 'aisle-body-tab' }],
          },
          { id: 'body-sub', aisles: [{ id: 'aisle-sub', aisleBodyId: 'aisle-body-sub' }] },
        ],
        noteAisleBodies: [
          {
            id: 'aisle-body-tab',
            markdown: 'home body',
            frontmatter: { created: '2024-01-01' },
            frontmatterMeta: {
              templateId: 'template-1',
              templateDerived: true,
              templateFieldOrigins: {
                created: { templateId: 'template-1', fieldId: 'field-1' },
              },
              templateRemovedFieldIds: ['field-2'],
              computedFields: { created: 'createdAt' },
            },
          },
          { id: 'aisle-body-sub', markdown: 'sub body' },
        ],
        messages: [
          {
            id: 'message-1',
            type: 'duplicate-auto-decoupled',
            status: 'unread',
            createdAt: '2026-06-01T00:00:00.000Z',
            signature: 'signature-1',
            title: 'duplicate files de-coupled',
            body: '1 changed duplicate file was de-coupled.',
          },
        ],
        toastHistory: [
          {
            id: 1,
            createdAt: '2026-06-01T00:01:00.000Z',
            message: 'notebook folder updated.',
            tone: 'success',
          },
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
          themePalettes: {
            custom1: {
              ...DEFAULT_CUSTOM_THEME_PALETTE,
              primary: '#8844cc',
            },
            dawn: {
              ...DEFAULT_CUSTOM_THEME_PALETTE,
              primary: '#123456',
            },
          },
          noteCursorLocations: {
            'domain-1::space-1::tab-1::__home__': {
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
            'domain-1::space-1::missing-tab::__home__': {
              activeAisleId: 'aisle-stale',
              aisles: {
                'aisle-stale': {
                  anchor: 2,
                  head: 2,
                  updatedAt: 200,
                },
              },
              updatedAt: 200,
            },
          },
          headingCollapseState: {
            'body-tab': {
              'aisle-tab': ['heading-a'],
              'missing-aisle': ['heading-stale'],
            },
            'missing-body': {
              'aisle-tab': ['heading-stale'],
            },
          },
        },
      })

    const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify(state))
    const rootManifestEntry = fileMap.get('notes/manifest.json')
    const rootManifest =
      rootManifestEntry?.kind === 'text' ? (JSON.parse(rootManifestEntry.text) as Record<string, unknown>) : null
    const workspaceIndex = getRootSplitFileJson(fileMap, getRecord(rootManifest), 'workspaceIndex', 'workspace-index.json')
    const appSettings = getUserSettingsFileJson(fileMap)
    const editorState = getRootSplitFileJson(fileMap, getRecord(rootManifest), 'editorState', 'editor-state.json')
    const messagesFile = getRootSplitFileJson(fileMap, getRecord(rootManifest), 'messages', 'messages.json')
    const noteRegistry = getRootSplitFileJson(fileMap, getRecord(rootManifest), 'noteRegistry', 'note-registry.json')
    const firstDomain = getRecord(Array.isArray(workspaceIndex.domains) ? workspaceIndex.domains[0] : null)
    const paths = Array.from(fileMap.keys())
    const serialized = readSerializedStateFromHybridFileMap(fileMap)
    const roundTripped = parseSavedState(serialized)
    const homeBody = roundTripped.noteBodies.find((body) => body.id === 'body-tab')
    const homeAisleBody = roundTripped.noteAisleBodies?.find((body) => body.id === homeBody?.aisles[0]?.aisleBodyId)
    const subBody = roundTripped.noteBodies.find((body) => body.id === 'body-sub')

    expect(rootManifest?.schemaVersion).toBe(1)
    expect(Object.keys(getRecord(rootManifest)).sort()).toEqual(['files', 'schemaVersion'])
    expect(Object.keys(getRecord(rootManifest?.files)).sort()).toEqual([
      'deletedWorkspace',
      'editorState',
      'frontmatterSettings',
      'messages',
      'navigationState',
      'noteRegistry',
      'workspaceIndex',
    ])
    expect(fileMap.has('notes/profile-settings.json')).toBe(false)
    expect(fileMap.has('notes/app-settings.json')).toBe(false)
    expect(fileMap.has('settings/app-settings.json')).toBe(true)
    expect(fileMap.has('notes/appearance-settings.json')).toBe(false)
    expect(fileMap.has('notes/shortcut-settings.json')).toBe(false)
    expect(fileMap.has('notes/ui-preferences.json')).toBe(false)
    expect(fileMap.has('notes/note-bodies.json')).toBe(false)
    expect(fileMap.has('notes/aisle-bodies.json')).toBe(false)
    expect(fileMap.has('notes/orphan-note-bodies.json')).toBe(false)
    expect(fileMap.has('notes/orphan-aisle-bodies.json')).toBe(false)
    expect(firstDomain.path).toEqual(expect.stringMatching(/^Domain--[a-f0-9]{6}$/))
    expect(paths.some((path) => path.startsWith('notes/domains/'))).toBe(true)
    expect(paths.some((path) => path.startsWith('notes/topics/'))).toBe(false)
    expect(paths.some((path) => path.startsWith('notes/note-bodies/'))).toBe(false)
    expect(paths.some((path) => /\/Tab--[a-f0-9]{6}\/home\.md$/.test(path))).toBe(true)
    expect(paths.some((path) => /\/Tab--[a-f0-9]{6}\/Sub--[a-f0-9]{6}\.md$/.test(path))).toBe(true)
    expect(messagesFile.messages).toEqual([
      expect.objectContaining({ id: 'message-1', type: 'duplicate-auto-decoupled' }),
    ])
    expect(messagesFile.toastHistory).toEqual([
      {
        id: 1,
        createdAt: '2026-06-01T00:01:00.000Z',
        message: 'notebook folder updated.',
        tone: 'success',
      },
    ])
    expect(serialized).not.toBeNull()
    expect(roundTripped.messages).toEqual([
      expect.objectContaining({ id: 'message-1', type: 'duplicate-auto-decoupled' }),
    ])
    expect(roundTripped.toastHistory).toEqual([
      {
        id: 1,
        createdAt: '2026-06-01T00:01:00.000Z',
        message: 'notebook folder updated.',
        tone: 'success',
      },
    ])
    expect(homeBody?.aisles[0] ? getAisleMarkdown(homeBody.aisles[0], roundTripped.noteAisleBodies) : '').toBe('home body')
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
    expect(subBody?.aisles[0] ? getAisleMarkdown(subBody.aisles[0], roundTripped.noteAisleBodies) : '').toBe('sub body')
    expect(roundTripped.theme).toBe('custom1')
    expect(roundTripped.ui).not.toHaveProperty('customThemePalette')
    expect(roundTripped.ui.themePalettes?.custom1?.primary).toBe('#8844cc')
    expect(roundTripped.ui.themePalettes?.dawn?.primary).toBe('#123456')
    expect(getRecord(appSettings.themePalettes).custom1).toMatchObject({
      primary: '#8844cc',
    })
    expect(getRecord(appSettings.themePalettes).dawn).toMatchObject({
      primary: '#123456',
    })
    expect(getRecord(appSettings.ui).settingsSection).toBe('visuals')
    expect(getRecord(editorState.noteCursorLocations)['domain-1::space-1::tab-1::__home__']).toEqual({
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
    expect(getRecord(editorState.noteCursorLocations)['domain-1::space-1::missing-tab::__home__']).toBeUndefined()
    expect(editorState.headingCollapseState).toEqual({
      'body-tab': {
        'aisle-tab': ['heading-a'],
      },
    })
    expect(roundTripped.ui.settingsSection).toBe('visuals')
    expect(roundTripped.frontmatter.settingsTemplateId).toBe('template-1')
    expect(roundTripped.frontmatter.lastAppliedTemplateId).toBe('template-1')
    expect(roundTripped.ui.noteCursorLocations['domain-1::space-1::tab-1::__home__']).toEqual({
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
    expect(roundTripped.ui.noteCursorLocations['domain-1::space-1::missing-tab::__home__']).toBeUndefined()
    expect(roundTripped.ui.headingCollapseState).toEqual({
      'body-tab': {
        'aisle-tab': ['heading-a'],
      },
    })
  })

  it('stores scratchpad markdown under the scratchpad folder and reads it back', () => {
    const state = createBrowserStorageState()
    const scratchpadBody = state.noteBodies.find((body) => body.id === state.scratchpad?.noteBodyId)
    const scratchpadAisle = scratchpadBody?.aisles[0]
    const scratchpadAisleBody = state.noteAisleBodies?.find((body) => body.id === scratchpadAisle?.aisleBodyId)
    if (!scratchpadAisleBody) throw new Error('missing scratchpad fixture body')
    scratchpadAisleBody.markdown = 'scratch note'

    const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify(state))
    const { workspaceIndex } = getBrowserWorkspacePaths(fileMap)
    const serialized = readSerializedStateFromHybridFileMap(fileMap)
    const roundTripped = parseSavedState(serialized ?? '')
    const roundTrippedBody = roundTripped.noteBodies.find((body) => body.id === roundTripped.scratchpad?.noteBodyId)
    const roundTrippedAisle = roundTrippedBody?.aisles[0]

    expect(getRecord(workspaceIndex.scratchpad).noteBodyId).toBe(state.scratchpad?.noteBodyId)
    expect(fileMap.get('notes/scratchpad/scratchpad.md')).toMatchObject({ kind: 'text', text: 'scratch note' })
    expect(roundTrippedAisle ? getAisleMarkdown(roundTrippedAisle, roundTripped.noteAisleBodies) : '').toBe('scratch note')
  })

  it('persists app settings and per-space settings in hybrid notes manifests', () => {
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
        noteBodies: [{ id: 'body-1', aisles: [{ id: 'aisle-1', aisleBodyId: 'aisle-body-1' }] }],
        noteAisleBodies: [{ id: 'aisle-body-1', markdown: 'body' }],
        hotkeys: {
          shortcuts: { newTab: 'Ctrl+Alt+N', newSubTab: 'Ctrl+Alt+M' },
          newlineShortcuts: {
            shortcuts: {
              controlEnter: 'horizontalLine',
              shiftEnter: 'task',
              commandEnter: 'operationsMenu',
            },
            menuOperations: ['task', 'aisleRight', 'strikethrough'],
          },
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
          dataSettingsSection: 'storage',
          selectedCustomTheme: 'custom2',
          lastNoteCopyMode: 'linked',
          findCaseSensitive: true,
          findWholeWord: true,
          findRegex: true,
          findReplaceMode: 'replace',
          removeNoteReferencesOnTrash: false,
          noteMentionCopyRequiresConfirmation: false,
          deleteSubtabShortcutEnabled: true,
          decoupledItemsKeepData: false,
          visualizerHomeNodesResideInParent: true,
          visualizerLayoutMode: 'strict-rings',
          tableAddTargetMode: 'active-cell',
          tableDeleteTargetMode: 'active-cell',
          tableOfContentsScope: 'focused-aisle',
          tabRenameEnterBehavior: 'creates-another-tab',
          newAislePlacement: 'left-of-focus',
          scratchpadAisleLimit: 40,
          tabButtonScale: 1.3,
          noteFontScale: 1.2,
          tooltipScale: 1.25,
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
    const appSettings = getUserSettingsFileJson(fileMap)
    const frontmatterSettings = getRootSplitFileJson(fileMap, rootManifest, 'frontmatterSettings', 'frontmatter-settings.json')
    const roundTripped = parseSavedState(readSerializedStateFromHybridFileMap(fileMap) ?? '')

    expect(Object.keys(rootManifest).sort()).toEqual(['files', 'schemaVersion'])
    expect(fileMap.has('notes/profile-settings.json')).toBe(false)
    expect(fileMap.has('notes/app-settings.json')).toBe(false)
    expect(fileMap.has('settings/app-settings.json')).toBe(true)
    expect(appSettings.theme).toBe('custom2')
    expect(appSettings.selectedCustomTheme).toBe('custom2')
    expect(getRecord(appSettings.themePalettes).dawn).toMatchObject({ primary: '#123456' })
    expect(appSettings.tabButtonScale).toBe(1.3)
    expect(appSettings.noteFontScale).toBe(1.2)
    expect(appSettings.tooltipScale).toBe(1.25)
    expect(getRecord(appSettings.ui).settingsSection).toBe('toolbar')
    expect(getRecord(appSettings.ui).dataSettingsSection).toBe('storage')
    expect(getRecord(appSettings.ui).lastNoteCopyMode).toBe('linked')
    expect(getRecord(appSettings.ui).findCaseSensitive).toBe(true)
    expect(getRecord(appSettings.ui).findWholeWord).toBe(true)
    expect(getRecord(appSettings.ui).findRegex).toBe(true)
    expect(getRecord(appSettings.ui).findReplaceMode).toBe('replace')
    expect(getRecord(appSettings.ui).removeNoteReferencesOnTrash).toBe(false)
    expect(getRecord(appSettings.ui).noteMentionCopyRequiresConfirmation).toBe(false)
    expect(getRecord(appSettings.ui).deleteSubtabShortcutEnabled).toBe(true)
    expect(getRecord(appSettings.ui).visualizerHomeNodesResideInParent).toBe(true)
    expect(getRecord(appSettings.ui).visualizerLayoutMode).toBe('strict-rings')
    expect(getRecord(appSettings.ui).tableOfContentsScope).toBe('focused-aisle')
    expect(getRecord(appSettings.ui).tabRenameEnterBehavior).toBe('creates-another-tab')
    expect(getRecord(appSettings.ui)).not.toHaveProperty('newAislePlacement')
    expect(appSettings.scratchpadAisleLimit).toBe(40)
    expect(getRecord(appSettings.ui).showParentHomeTab).toBe(false)
    expect(getRecord(appSettings.hotkeys)).not.toHaveProperty('enableMouseBackForward')
    expect(getRecord(appSettings.hotkeys)).not.toHaveProperty('enableGenericHistoryHotkeys')
    expect(getRecord(getRecord(appSettings.hotkeys).shortcuts).newTab).toBe('Ctrl+Alt+N')
    expect(getRecord(getRecord(getRecord(appSettings.hotkeys).newlineShortcuts).shortcuts).controlEnter).toBe('horizontalLine')
    expect(getRecord(getRecord(appSettings.hotkeys).newlineShortcuts).menuOperations).toEqual([
      'task',
      'aisleRight',
      'strikethrough',
    ])
    expect(frontmatterSettings.settingsTemplateId).toBe('template-1')
    expect(spaceManifest.settings).toEqual({ autoRemoveDeletedDays: 21 })
    expect(roundTripped.ui.settingsSection).toBe('toolbar')
    expect(roundTripped.theme).toBe('custom2')
    expect(roundTripped.ui.selectedCustomTheme).toBe('custom2')
    expect(roundTripped.ui.tabButtonScale).toBe(1.3)
    expect(roundTripped.ui.noteFontScale).toBe(1.2)
    expect(roundTripped.ui.tooltipScale).toBe(1.25)
    expect(roundTripped.ui.dataSettingsSection).toBe('storage')
    expect(roundTripped.ui.findCaseSensitive).toBe(true)
    expect(roundTripped.ui.findWholeWord).toBe(true)
    expect(roundTripped.ui.findRegex).toBe(true)
    expect(roundTripped.ui.findReplaceMode).toBe('replace')
    expect(roundTripped.ui.removeNoteReferencesOnTrash).toBe(false)
    expect(roundTripped.ui.noteMentionCopyRequiresConfirmation).toBe(false)
    expect(roundTripped.ui.deleteSubtabShortcutEnabled).toBe(true)
    expect(roundTripped.ui.visualizerHomeNodesResideInParent).toBe(true)
    expect(roundTripped.ui.visualizerLayoutMode).toBe('strict-rings')
    expect(roundTripped.ui.tableOfContentsScope).toBe('focused-aisle')
    expect(roundTripped.ui.tabRenameEnterBehavior).toBe('creates-another-tab')
    expect(roundTripped.ui).not.toHaveProperty('newAislePlacement')
    expect(roundTripped.ui.scratchpadAisleLimit).toBe(40)
    expect(roundTripped.ui.themePalettes?.dawn?.primary).toBe('#123456')
    expect(roundTripped.hotkeys.shortcuts.newTab).toBe('Ctrl+Alt+N')
    expect(roundTripped.hotkeys.newlineShortcuts.menuOperations).toEqual(['task', 'aisleRight', 'strikethrough'])
    expect(roundTripped.hotkeys).not.toHaveProperty('enableMouseBackForward')
    expect(roundTripped.hotkeys).not.toHaveProperty('enableGenericHistoryHotkeys')
    expect(roundTripped.frontmatter.settingsTemplateId).toBe('template-1')
    expect(roundTripped.domains[0]?.spaces[0]?.settings).toEqual({ autoRemoveDeletedDays: 21 })
  })

  it('ignores stale profile-settings and rejects unsupported root manifests', () => {
    const state = createBrowserStorageState()
    const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify({ ...state, theme: 'dawn' }))
    const rootManifest = getTextFileJson(fileMap, 'notes/manifest.json')
    const appSettings = getUserSettingsFileJson(fileMap)
    const frontmatterSettings = getRootSplitFileJson(fileMap, rootManifest, 'frontmatterSettings', 'frontmatter-settings.json')
    const editorState = getRootSplitFileJson(fileMap, rootManifest, 'editorState', 'editor-state.json')
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

    fileMap.set('notes/profile-settings.json', {
      path: 'notes/profile-settings.json',
      kind: 'text',
      text: `${JSON.stringify({ ...profileSettings, settings: { ...profileSettings.settings, theme: 'light' } }, null, 2)}\n`,
    })

    const serialized = readSerializedStateFromHybridFileMap(fileMap)
    expect(serialized).toEqual(expect.any(String))
    expect(parseSavedState(serialized).theme).toBe('dawn')

    fileMap.set('notes/manifest.json', {
      path: 'notes/manifest.json',
      kind: 'text',
      text: `${JSON.stringify({ schemaVersion: 2, files: rootManifest.files }, null, 2)}\n`,
    })
    expect(readSerializedStateFromHybridFileMap(fileMap)).toBeNull()
  })

  it('persists rearranged parent and sub-tab order in hybrid notes storage', () => {
    const state = parseModernBrowserState({
        activeDomainId: 'domain-1',
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
                  activeSubTabId: 'sub-b2',
                  subTabs: [
                    { id: 'sub-b2', title: 'Second', noteBodyId: 'body-b2'},
                    { id: 'sub-b1', title: 'First', noteBodyId: 'body-b1'},
                  ],
                },
                {
                  id: 'tab-a',
                  title: 'Alpha',
                  noteBodyId: 'body-a',
                  activeSubTabId: null,
                  subTabs: [],
                },
              ],
              deletedTabs: [],
              deletedSubTabs: [],
            },
          },
        ],
        noteBodies: [
          { id: 'body-b', aisles: [{ id: 'aisle-b', aisleBodyId: 'aisle-body-b' }] },
          { id: 'body-b2', aisles: [{ id: 'aisle-b2', aisleBodyId: 'aisle-body-b2' }] },
          { id: 'body-b1', aisles: [{ id: 'aisle-b1', aisleBodyId: 'aisle-body-b1' }] },
          { id: 'body-a', aisles: [{ id: 'aisle-a', aisleBodyId: 'aisle-body-a' }] },
        ],
        noteAisleBodies: [
          { id: 'aisle-body-b', markdown: 'b' },
          { id: 'aisle-body-b2', markdown: 'b2' },
          { id: 'aisle-body-b1', markdown: 'b1' },
          { id: 'aisle-body-a', markdown: 'a' },
        ],
      })

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
    const state = parseModernBrowserState({
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
                  activeSubTabId: null,
                  subTabs: [],
                },
                {
                  id: 'tab-2',
                  title: 'Two',
                  noteBodyId: 'body-2',
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
            aisles: [{ id: 'aisle-1', aisleBodyId: 'shared-aisle-body' }],
          },
          {
            id: 'body-2',
            aisles: [{ id: 'aisle-2', aisleBodyId: 'shared-aisle-body' }],
          },
        ],
      })

    const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify(state))
    const rootManifest = getTextFileJson(fileMap, 'notes/manifest.json')
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

  it('round trips inline aisle tags without forcing frontmatter', () => {
    const state = createBrowserStorageState()
    const aisleBody = state.noteAisleBodies?.find((body) => body.id === 'aisle-body-1')
    if (!aisleBody) throw new Error('missing aisle body')
    aisleBody.markdown = '#Project\n\nBody #Review'
    delete aisleBody.frontmatter
    delete aisleBody.frontmatterMeta
    delete aisleBody.frontmatterStatus
    delete aisleBody.tags

    const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify(state))
    const rootManifest = getTextFileJson(fileMap, 'notes/manifest.json')
    const noteRegistry = getRootSplitFileJson(fileMap, rootManifest, 'noteRegistry', 'note-registry.json')
    const aisleBodyEntry = getRecord(
      (Array.isArray(noteRegistry.aisleBodies) ? noteRegistry.aisleBodies : [])
        .find((entry) => getRecord(entry).id === 'aisle-body-1'),
    )
    const aisleFile = typeof aisleBodyEntry.file === 'string' ? aisleBodyEntry.file : ''
    const serialized = readSerializedStateFromHybridFileMap(fileMap)
    const roundTripped = parseSavedState(serialized)

    expect(getTextFile(fileMap, `notes/${aisleFile}`).startsWith('---')).toBe(false)
    expect(aisleBodyEntry.tags).toEqual(['Project', 'Review'])
    expect(roundTripped.noteAisleBodies?.find((body) => body.id === 'aisle-body-1')?.tags).toEqual(['Project', 'Review'])
  })

  it('migrates frontmatter tags into visible aisle markdown and keeps computed tags updated', () => {
    const state = createBrowserStorageState()
    const aisleBody = state.noteAisleBodies?.find((body) => body.id === 'aisle-body-1')
    if (!aisleBody) throw new Error('missing aisle body')
    aisleBody.markdown = 'Body text'
    delete aisleBody.frontmatter
    delete aisleBody.frontmatterMeta
    delete aisleBody.frontmatterStatus
    delete aisleBody.tags

    const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify(state))
    const rootManifest = getTextFileJson(fileMap, 'notes/manifest.json')
    const noteRegistry = getRootSplitFileJson(fileMap, rootManifest, 'noteRegistry', 'note-registry.json')
    const aisleBodyEntry = getRecord(
      (Array.isArray(noteRegistry.aisleBodies) ? noteRegistry.aisleBodies : [])
        .find((entry) => getRecord(entry).id === 'aisle-body-1'),
    )
    const aisleFile = typeof aisleBodyEntry.file === 'string' ? aisleBodyEntry.file : ''
    fileMap.set(`notes/${aisleFile}`, {
      path: `notes/${aisleFile}`,
      kind: 'text',
      text: '---\ntags:\n  - Card\n  - Unfinished\n---\nBody text',
    })

    const roundTripped = parseSavedState(readSerializedStateFromHybridFileMap(fileMap) ?? '')
    const roundTrippedAisleBody = roundTripped.noteAisleBodies?.find((body) => body.id === 'aisle-body-1')
    if (!roundTrippedAisleBody) throw new Error('missing round-tripped aisle body')

    expect(roundTrippedAisleBody.markdown).toBe('#Card #Unfinished\n\nBody text')
    expect(roundTrippedAisleBody.tags).toEqual(['Card', 'Unfinished'])
    expect(roundTrippedAisleBody.frontmatter).toEqual({ tags: ['Card', 'Unfinished'] })
    expect(roundTrippedAisleBody.frontmatterMeta?.computedFields).toEqual({ tags: 'tags' })

    roundTrippedAisleBody.markdown = 'Body without tags'
    roundTrippedAisleBody.tags = []
    const savedMap = buildHybridFileMapFromSerializedState(JSON.stringify(roundTripped))
    const savedRootManifest = getTextFileJson(savedMap, 'notes/manifest.json')
    const savedNoteRegistry = getRootSplitFileJson(savedMap, savedRootManifest, 'noteRegistry', 'note-registry.json')
    const savedAisleBodyEntry = getRecord(
      (Array.isArray(savedNoteRegistry.aisleBodies) ? savedNoteRegistry.aisleBodies : [])
        .find((entry) => getRecord(entry).id === 'aisle-body-1'),
    )
    const savedAisleFile = typeof savedAisleBodyEntry.file === 'string' ? savedAisleBodyEntry.file : ''
    const reloaded = parseSavedState(readSerializedStateFromHybridFileMap(savedMap) ?? '')

    expect(getTextFile(savedMap, `notes/${savedAisleFile}`)).toBe('---\ntags: []\n---\nBody without tags')
    expect(savedAisleBodyEntry.tags).toEqual([])
    expect(reloaded.noteAisleBodies?.find((body) => body.id === 'aisle-body-1')?.frontmatter).toEqual({ tags: [] })
    expect(reloaded.noteAisleBodies?.find((body) => body.id === 'aisle-body-1')?.tags).toEqual([])
  })

  it('round trips distinct aisle body markdown without collapsing sibling aisles', () => {
    const state = createBrowserStorageState()
    state.noteBodies[0].aisles = [
      { id: 'aisle-home', aisleBodyId: 'body-home-aisle' },
      { id: 'aisle-two', aisleBodyId: 'body-second-aisle' },
    ]
    state.noteAisleBodies = [
      { id: 'body-home-aisle', markdown: 'left aisle draft 🚙' },
      { id: 'body-second-aisle', markdown: 'right aisle draft 🥺' },
    ]

    const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify(state))
    const rootManifest = getTextFileJson(fileMap, 'notes/manifest.json')
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
    expect(fileMap.get(`notes/${aisleFiles[0]}`)).toMatchObject({ kind: 'text', text: 'left aisle draft 🚙' })
    expect(fileMap.get(`notes/${aisleFiles[1]}`)).toMatchObject({ kind: 'text', text: 'right aisle draft 🥺' })

    const roundTripped = parseSavedState(readSerializedStateFromHybridFileMap(fileMap) ?? '')
    expect(roundTripped.noteAisleBodies?.find((body) => body.id === 'body-home-aisle')?.markdown).toBe('left aisle draft 🚙')
    expect(roundTripped.noteAisleBodies?.find((body) => body.id === 'body-second-aisle')?.markdown).toBe('right aisle draft 🥺')
    expect(roundTripped.noteBodies[0].aisles.map((aisle) => getAisleMarkdown(aisle, roundTripped.noteAisleBodies))).toEqual([
      'left aisle draft 🚙',
      'right aisle draft 🥺',
    ])
  })

  it('uses shared aisle body markdown instead of stale linked aisle mirrors', () => {
    const currentMarkdown = 'Hat Trick!\n\n---\n\n\u200b'
    const staleMarkdown = 'Hat Trick!\n\n\u200b\n\n\n\n\u200b\n\n---\n\n\u200b'
    const state = parseModernBrowserState({
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
                  activeSubTabId: null,
                  subTabs: [],
                },
                {
                  id: 'tab-2',
                  title: 'Two',
                  noteBodyId: 'body-2',
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
            aisles: [{ id: 'aisle-1', aisleBodyId: 'shared-aisle-body' }],
          },
          {
            id: 'body-2',
            aisles: [{ id: 'aisle-2', aisleBodyId: 'shared-aisle-body' }],
          },
        ],
      })
    const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify(state))
    const rootManifest = getTextFileJson(fileMap, 'notes/manifest.json')
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
      fileMap.set(`notes/${staleLinkedFile}`, {
        path: `notes/${staleLinkedFile}`,
        kind: 'text',
        text: staleMarkdown,
      })
    }

    const serialized = readSerializedStateFromHybridFileMap(fileMap)
    const roundTripped = parseSavedState(serialized)
    const roundTrippedBodyOne = roundTripped.noteBodies.find((body) => body.id === 'body-1')
    const roundTrippedBodyTwo = roundTripped.noteBodies.find((body) => body.id === 'body-2')

    expect(sharedAisleBodyFile).toBeTruthy()
    expect(sharedAisleBody.contentHash).toEqual(expect.any(String))
    expect(roundTripped.noteAisleBodies?.find((body) => body.id === 'shared-aisle-body')?.markdown).toBe(currentMarkdown)
    expect(roundTrippedBodyOne?.aisles[0] ? getAisleMarkdown(roundTrippedBodyOne.aisles[0], roundTripped.noteAisleBodies) : '').toBe(currentMarkdown)
    expect(roundTrippedBodyTwo?.aisles[0] ? getAisleMarkdown(roundTrippedBodyTwo.aisles[0], roundTripped.noteAisleBodies) : '').toBe(currentMarkdown)
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
                      activeSubTabId: 'sub-long',
                      subTabs: [{ id: 'sub-long', title: longTitle, noteBodyId: 'body-sub-long'}],
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
          activeSubTabId: null,
          subTabs: [{ id: 'deleted-sub-long', title: longTitle, noteBodyId: 'body-deleted-sub'}],
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
        },
      },
    ]

    const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify(state))
    const rootManifest = getTextFileJson(fileMap, 'notes/manifest.json')
    const workspaceIndex = getRootSplitFileJson(fileMap, rootManifest, 'workspaceIndex', 'workspace-index.json')
    const domainEntry = getRecord(Array.isArray(workspaceIndex.domains) ? workspaceIndex.domains[0] : null)
    const domainManifest = getTextFileJson(fileMap, `notes/domains/${String(domainEntry.path)}/manifest.json`)
    const spaceEntry = getRecord(Array.isArray(domainManifest.spaces) ? domainManifest.spaces[0] : null)
    const spaceManifest = getTextFileJson(
      fileMap,
      `notes/domains/${String(domainEntry.path)}/${String(spaceEntry.path)}/manifest.json`,
    )
    const trashManifest = getTextFileJson(
      fileMap,
      `notes/domains/${String(domainEntry.path)}/${String(spaceEntry.path)}/trash/manifest.json`,
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

  it('prunes unreferenced orphan note bodies while keeping deleted workspace bodies', () => {
    const state = createBrowserStorageState()
    state.deletedSpaces = [
      {
        id: 'deleted-space-entry',
        domainId: 'domain-1',
        domainName: 'Domain',
        deletedAt: Date.UTC(2026, 4, 20),
        space: {
          id: 'deleted-space',
          name: 'Deleted Space',
          settings: { autoRemoveDeletedDays: 7 },
          data: {
            activeTabId: 'deleted-tab',
            tabs: [
              {
                id: 'deleted-tab',
                title: 'Deleted Tab',
                noteBodyId: 'body-deleted-workspace',
                activeSubTabId: null,
                subTabs: [],
              },
            ],
            deletedTabs: [],
            deletedSubTabs: [],
          },
        },
      },
    ]
    state.noteBodies.push(
      {
        id: 'body-deleted-workspace',
        aisles: [{ id: 'aisle-deleted-workspace', aisleBodyId: 'aisle-body-deleted-workspace' }],
      },
      { id: 'body-orphan', aisles: [{ id: 'aisle-orphan', aisleBodyId: 'aisle-body-orphan' }] },
    )
    state.noteAisleBodies?.push(
      { id: 'aisle-body-deleted-workspace', markdown: 'deleted workspace body' },
      { id: 'aisle-body-orphan', markdown: 'orphan body' },
    )
    state.ui.headingCollapseState = {
      'body-deleted-workspace': {
        'aisle-deleted-workspace': ['deleted-heading'],
      },
      'body-orphan': {
        'aisle-orphan': ['orphan-heading'],
      },
    }

    const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify(state))
    const rootManifest = getTextFileJson(fileMap, 'notes/manifest.json')
    const noteRegistry = getRootSplitFileJson(fileMap, rootManifest, 'noteRegistry', 'note-registry.json')
    const editorState = getRootSplitFileJson(fileMap, rootManifest, 'editorState', 'editor-state.json')
    const noteBodyEntries = Array.isArray(noteRegistry.noteBodies) ? noteRegistry.noteBodies.map(getRecord) : []
    const noteBodyIds = noteBodyEntries.map((body) => body.id)
    const deletedWorkspaceRecord = getRecord(noteBodyEntries.find((body) => body.id === 'body-deleted-workspace'))
    const aisle = getRecord(Array.isArray(deletedWorkspaceRecord.aisles) ? deletedWorkspaceRecord.aisles[0] : null)
    const serialized = readSerializedStateFromHybridFileMap(fileMap)
    const roundTripped = parseSavedState(serialized)

    expect(noteBodyIds).toContain('body-deleted-workspace')
    expect(noteBodyIds).not.toContain('body-orphan')
    expect(deletedWorkspaceRecord.storageStatus).toBe('unlinked')
    expect(editorState.headingCollapseState).toEqual({
      'body-deleted-workspace': {
        'aisle-deleted-workspace': ['deleted-heading'],
      },
    })
    expect(fileMap.get(`notes/${String(aisle.file)}`)).toMatchObject({
      kind: 'text',
      text: 'deleted workspace body',
    })
    expect(roundTripped.noteBodies.some((body) => body.id === 'body-deleted-workspace')).toBe(true)
    expect(roundTripped.noteBodies.some((body) => body.id === 'body-orphan')).toBe(false)
  })

  it('does not read malformed topic/note-body file maps', () => {
    const fileMap = new Map([
      [
        'notes/manifest.json',
        {
          path: 'notes/manifest.json',
          kind: 'text' as const,
          text: JSON.stringify({
            schemaVersion: 1,
            topics: [{ id: 'domain-1', title: 'Domain' }],
            activeTopicId: 'domain-1',
          }),
        },
      ],
      [
        'notes/topics/domain-1/manifest.json',
        {
          path: 'notes/topics/domain-1/manifest.json',
          kind: 'text' as const,
          text: JSON.stringify({ id: 'domain-1', title: 'Domain', spaces: [] }),
        },
      ],
    ])

    expect(readSerializedStateFromHybridFileMap(fileMap)).toBeNull()
  })

  for (const schemaVersion of [2, 3, 4, 999]) {
    it(`does not read unsupported schema ${schemaVersion} file maps`, () => {
      const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify(createBrowserStorageState()))
      const rootManifest = getTextFileJson(fileMap, 'notes/manifest.json')
      fileMap.set('notes/manifest.json', {
        path: 'notes/manifest.json',
        kind: 'text',
        text: `${JSON.stringify({ ...rootManifest, schemaVersion }, null, 2)}\n`,
      })

      expect(readSerializedStateFromHybridFileMap(fileMap)).toBeNull()
    })
  }

  it('does not read current schema file maps missing required split files', () => {
    const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify(createBrowserStorageState()))
    const rootManifest = getTextFileJson(fileMap, 'notes/manifest.json')
    const files = getRecord(rootManifest.files)

    fileMap.delete(`notes/${String(files.noteRegistry)}`)

    expect(readSerializedStateFromHybridFileMap(fileMap)).toBeNull()
  })

  it('loads current schema file maps with optional editor split file missing', () => {
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
    const rootManifest = getTextFileJson(fileMap, 'notes/manifest.json')
    const files = getRecord(rootManifest.files)

    fileMap.delete(`notes/${String(files.editorState)}`)

    const roundTripped = parseSavedState(readSerializedStateFromHybridFileMap(fileMap) ?? '')
    expect(roundTripped.domains).toHaveLength(1)
    expect(roundTripped.ui.settingsSection).toBe('toolbar')
    expect(roundTripped.ui.noteCursorLocations).toEqual({})
  })

  it('loads current schema file maps with portable app-settings missing', () => {
    const state = createBrowserStorageState()
    state.theme = 'light'
    const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify(state))

    fileMap.delete('settings/app-settings.json')

    const roundTripped = parseSavedState(readSerializedStateFromHybridFileMap(fileMap) ?? '')
    expect(roundTripped.domains).toHaveLength(1)
    expect(roundTripped.theme).toBe('dawn')
    expect(roundTripped.domains[0].spaces[0].data.tabs[0].title).toBe('Tab')
    expect(getFirstAisleBodyMarkdown(roundTripped)).toBe('home body')
  })

  it('ignores notes app-settings in browser file maps', () => {
    const state = createBrowserStorageState()
    state.theme = 'light'
    const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify(state))
    const appSettings = getUserSettingsFileJson(fileMap)
    fileMap.delete('settings/app-settings.json')
    fileMap.set('notes/app-settings.json', {
      path: 'notes/app-settings.json',
      kind: 'text',
      text: `${JSON.stringify({ ...appSettings, theme: 'light' }, null, 2)}\n`,
    })

    const roundTripped = parseSavedState(readSerializedStateFromHybridFileMap(fileMap) ?? '')
    expect(roundTripped.theme).toBe('dawn')
    expect(getFirstAisleBodyMarkdown(roundTripped)).toBe('home body')
  })

  it('prunes stale note cursor locations when loading editor state', () => {
    const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify(createBrowserStorageState()))
    const rootManifest = getTextFileJson(fileMap, 'notes/manifest.json')
    const files = getRecord(rootManifest.files)
    const editorStateFile = typeof files.editorState === 'string' ? files.editorState : 'editor-state.json'
    const liveKey = 'domain-1::space-1::tab-1::__home__'
    const staleKey = 'domain-1::space-1::missing-tab::__home__'
    fileMap.set(`notes/${editorStateFile}`, {
      path: `notes/${editorStateFile}`,
      kind: 'text',
      text: `${JSON.stringify(
        {
          noteCursorLocations: {
            [liveKey]: {
              activeAisleId: 'aisle-1',
              aisles: {
                'aisle-1': { anchor: 1, head: 1, updatedAt: 1 },
              },
              updatedAt: 1,
            },
            [staleKey]: {
              activeAisleId: 'aisle-stale',
              aisles: {
                'aisle-stale': { anchor: 2, head: 2, updatedAt: 2 },
              },
              updatedAt: 2,
            },
          },
          headingCollapseState: {
            'body-1': {
              'aisle-1': ['heading'],
              'missing-aisle': ['stale'],
            },
            'missing-body': {
              'aisle-1': ['stale'],
            },
          },
        },
        null,
        2,
      )}\n`,
    })

    const roundTripped = parseSavedState(readSerializedStateFromHybridFileMap(fileMap) ?? '')
    expect(roundTripped.ui.noteCursorLocations[liveKey]).toBeDefined()
    expect(roundTripped.ui.noteCursorLocations[staleKey]).toBeUndefined()
    expect(roundTripped.ui.headingCollapseState).toEqual({ 'body-1': { 'aisle-1': ['heading'] } })
  })

  it('rejects temporary wider schema 3 file maps', () => {
    const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify(createBrowserStorageState()))
    const rootManifest = getTextFileJson(fileMap, 'notes/manifest.json')
    const appSettings = getUserSettingsFileJson(fileMap)
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

    fileMap.set('notes/appearance-settings.json', {
      path: 'notes/appearance-settings.json',
      kind: 'text',
      text: `${JSON.stringify(appSettings, null, 2)}\n`,
    })
    fileMap.set('notes/shortcut-settings.json', {
      path: 'notes/shortcut-settings.json',
      kind: 'text',
      text: `${JSON.stringify(getRecord(appSettings.hotkeys), null, 2)}\n`,
    })
    fileMap.set('notes/ui-preferences.json', {
      path: 'notes/ui-preferences.json',
      kind: 'text',
      text: `${JSON.stringify(getRecord(appSettings.ui), null, 2)}\n`,
    })
    fileMap.set('notes/note-bodies.json', {
      path: 'notes/note-bodies.json',
      kind: 'text',
      text: `${JSON.stringify({ noteBodies: noteRegistry.noteBodies }, null, 2)}\n`,
    })
    fileMap.set('notes/aisle-bodies.json', {
      path: 'notes/aisle-bodies.json',
      kind: 'text',
      text: `${JSON.stringify({ noteAisleBodies: noteRegistry.aisleBodies }, null, 2)}\n`,
    })
    fileMap.set('notes/orphan-note-bodies.json', {
      path: 'notes/orphan-note-bodies.json',
      kind: 'text',
      text: `${JSON.stringify({ noteBodies: [] }, null, 2)}\n`,
    })
    fileMap.set('notes/orphan-aisle-bodies.json', {
      path: 'notes/orphan-aisle-bodies.json',
      kind: 'text',
      text: `${JSON.stringify({ noteAisleBodies: [] }, null, 2)}\n`,
    })
    fileMap.set('notes/manifest.json', {
      path: 'notes/manifest.json',
      kind: 'text',
      text: `${JSON.stringify({ schemaVersion: 3, files: wideFiles }, null, 2)}\n`,
    })
    fileMap.delete('notes/app-settings.json')
    fileMap.delete('notes/note-registry.json')

    expect(readSerializedStateFromHybridFileMap(fileMap)).toBeNull()
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
    expect(getFirstAisleBodyMarkdown(roundTripped)).toBe('')
  })

  it('keeps markdown references for missing image assets', () => {
    const state = createBrowserStorageState()
    setFirstAisleBodyMarkdown(state, 'image ![pixel](data:image/png;base64,iVBORw0KGgo=)')
    const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify(state))
    Array.from(fileMap.keys())
      .filter((path) => path.startsWith('notes/assets/'))
      .forEach((path) => fileMap.delete(path))

    const serialized = readSerializedStateFromHybridFileMap(fileMap)
    const roundTripped = parseSavedState(serialized ?? '')

    expect(serialized).toEqual(expect.any(String))
    expect(getFirstAisleBodyMarkdown(roundTripped)).toContain('![pixel](')
    expect(getFirstAisleBodyMarkdown(roundTripped)).not.toContain('data:image/')
  })

  it('round trips registered image asset refs without data URLs', () => {
    const state = createBrowserStorageState()
    const bytes = new Uint8Array([1, 2, 3, 4])
    const assetPath = 'assets/asset-browser-test.png'
    registerImageAssetBytes(assetPath, bytes, 'image/png')
    setFirstAisleBodyMarkdown(state, `image ![pixel](${buildImageAssetUrl(assetPath)})`)

    const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify(state))
    const assetEntry = fileMap.get(`notes/${assetPath}`)
    const serialized = readSerializedStateFromHybridFileMap(fileMap)
    const roundTripped = parseSavedState(serialized ?? '')

    expect(assetEntry?.kind).toBe('binary')
    expect(assetEntry?.kind === 'binary' ? Array.from(assetEntry.bytes) : []).toEqual(Array.from(bytes))
    expect(getFirstAisleBodyMarkdown(roundTripped)).toContain(buildImageAssetUrl(assetPath))
    expect(getFirstAisleBodyMarkdown(roundTripped)).not.toContain('data:image/')
  })

  it('writes readable preview directives and image metadata to markdown files', () => {
    const state = createBrowserStorageState()
    const bytes = new Uint8Array([1, 2, 3, 4])
    const assetPath = 'assets/asset-browser-readable.png'
    registerImageAssetBytes(assetPath, bytes, 'image/png')
    const previewToken = buildPreviewToken(state, {
      id: 'preview-1',
      target: { domainId: 'domain-1', spaceId: 'space-1', tabId: 'tab-1', subTabId: null },
    })
    setFirstAisleBodyMarkdown(
      state,
      `${previewToken}\n![pixel](${buildImageAssetUrl(assetPath)}#tabs-image=rotate=90,width=88)`,
    )

    const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify(state))
    const { spaceRoot, spaceManifest } = getBrowserWorkspacePaths(fileMap)
    const firstTab = getRecord(Array.isArray(spaceManifest.tabs) ? spaceManifest.tabs[0] : null)
    const markdownEntry = fileMap.get(`${spaceRoot}/${String(firstTab.homeNoteFile)}`)
    const serialized = readSerializedStateFromHybridFileMap(fileMap)
    const roundTripped = parseSavedState(serialized ?? '')

    expect(markdownEntry?.kind).toBe('text')
    const markdownText = markdownEntry?.kind === 'text' ? markdownEntry.text : ''
    expect(markdownText).toMatch(/!\[\[Tab--[0-9a-f]{6}\]\]/)
    expect(markdownText).not.toContain('{{tabs-preview')
    expect(markdownText).toContain('#tabs-image=width=88,rotate=90')
    expect(getFirstAisleBodyMarkdown(roundTripped)).toContain('#tabs-image=width=88,rotate=90')
  })

  it('round trips registered non-image asset links', () => {
    const state = createBrowserStorageState()
    const bytes = new Uint8Array([9, 8, 7, 6])
    const assetPath = 'assets/asset-browser-report.pdf'
    registerAssetBytes(assetPath, bytes, 'application/pdf')
    setFirstAisleBodyMarkdown(state, `[report](${buildImageAssetUrl(assetPath)})`)

    const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify(state))
    const assetEntry = fileMap.get(`notes/${assetPath}`)
    const serialized = readSerializedStateFromHybridFileMap(fileMap)
    const roundTripped = parseSavedState(serialized ?? '')

    expect(assetEntry?.kind).toBe('binary')
    expect(assetEntry?.kind === 'binary' ? Array.from(assetEntry.bytes) : []).toEqual(Array.from(bytes))
    expect(getFirstAisleBodyMarkdown(roundTripped)).toContain(buildImageAssetUrl(assetPath))
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
          activeSubTabId: null,
          subTabs: [],
        },
      },
    ]
    state.noteBodies.push({ id: 'body-deleted-parent', aisles: [{ id: 'aisle-deleted', aisleBodyId: 'aisle-body-deleted' }] })
    state.noteAisleBodies?.push({ id: 'aisle-body-deleted', markdown: 'deleted body' })
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
    state.noteBodies.push({ id: 'body-2', aisles: [{ id: 'aisle-2', aisleBodyId: 'aisle-body-2' }] })
    state.noteAisleBodies?.push({ id: 'aisle-body-2', markdown: 'second body' })
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
    state.noteBodies.push({ id: 'body-2', aisles: [{ id: 'aisle-2', aisleBodyId: 'aisle-body-2' }] })
    state.noteAisleBodies?.push({ id: 'aisle-body-2', markdown: 'second body' })
    const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify(state))
    const rootManifest = getTextFileJson(fileMap, 'notes/manifest.json')
    const workspaceIndex = getRootSplitFileJson(fileMap, rootManifest, 'workspaceIndex', 'workspace-index.json')
    const firstDomain = getRecord(Array.isArray(workspaceIndex.domains) ? workspaceIndex.domains[0] : null)
    const firstDomainManifestPath = `notes/domains/${String(firstDomain.path)}/manifest.json`
    fileMap.set(firstDomainManifestPath, { path: firstDomainManifestPath, kind: 'text', text: '{bad' })

    const serialized = readSerializedStateFromHybridFileMap(fileMap)
    const roundTripped = parseSavedState(serialized ?? '')

    expect(serialized).toEqual(expect.any(String))
    expect(roundTripped.domains).toHaveLength(1)
    expect(roundTripped.domains[0]?.id).toBe('domain-2')
    expect(roundTripped.activeDomainId).toBe('domain-2')
  })

  it('creates a blank notebook when no domains are readable', () => {
    const state = createBrowserStorageState()
    const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify(state))
    const rootManifest = getTextFileJson(fileMap, 'notes/manifest.json')
    const workspaceIndex = getRootSplitFileJson(fileMap, rootManifest, 'workspaceIndex', 'workspace-index.json')
    const firstDomain = getRecord(Array.isArray(workspaceIndex.domains) ? workspaceIndex.domains[0] : null)
    const staleDomainRoot = `notes/domains/${String(firstDomain.path)}`
    fileMap.set(`${staleDomainRoot}/manifest.json`, { path: `${staleDomainRoot}/manifest.json`, kind: 'text', text: '{bad' })

    const serialized = readSerializedStateFromHybridFileMap(fileMap)
    const roundTripped = parseSavedState(serialized ?? '')
    const saved = buildHybridFileMapFromSerializedState(serialized ?? '')

    expect(serialized).toEqual(expect.any(String))
    expect(roundTripped.domains).toHaveLength(1)
    expect(roundTripped.domains[0]?.spaces).toHaveLength(1)
    expect(roundTripped.domains[0]?.spaces[0]?.data.tabs).toHaveLength(1)
    expect(saved.has(`${staleDomainRoot}/manifest.json`)).toBe(false)
  })

  it('creates a blank space when a surviving domain has no readable spaces', () => {
    const state = createBrowserStorageState()
    state.deletedSpaces = [
      {
        id: 'deleted-space-entry',
        domainId: 'domain-1',
        domainName: 'Domain',
        space: {
          id: 'deleted-space',
          name: 'Deleted Space',
          settings: { autoRemoveDeletedDays: 7 },
          data: { activeTabId: 'deleted-tab', tabs: [], deletedTabs: [], deletedSubTabs: [] },
        },
        deletedAt: 1,
      },
    ]
    const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify(state))
    const { domainManifest, domainRoot } = getBrowserWorkspacePaths(fileMap)
    const firstSpace = getRecord(Array.isArray(domainManifest.spaces) ? domainManifest.spaces[0] : null)
    fileMap.delete(`${domainRoot}/${String(firstSpace.path)}/manifest.json`)

    const serialized = readSerializedStateFromHybridFileMap(fileMap)
    const roundTripped = parseSavedState(serialized ?? '')

    expect(serialized).toEqual(expect.any(String))
    expect(roundTripped.domains[0]?.id).toBe('domain-1')
    expect(roundTripped.domains[0]?.spaces).toHaveLength(1)
    expect(roundTripped.domains[0]?.spaces[0]?.id).not.toBe('space-1')
    expect(roundTripped.domains[0]?.spaces[0]?.data.tabs).toHaveLength(1)
    expect(roundTripped.deletedSpaces?.[0]?.space.id).toBe('deleted-space')
  })

  it('creates a blank parent tab when a surviving space has no readable parents', () => {
    const state = createBrowserStorageState()
    state.domains[0].spaces[0].data.deletedTabs = [
      {
        id: 'deleted-parent-entry',
        tab: state.domains[0].spaces[0].data.tabs[0],
        deletedAt: Date.now(),
      },
    ]
    state.spaces = state.domains[0].spaces
    const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify(state))
    const { spaceManifest, spaceRoot } = getBrowserWorkspacePaths(fileMap)
    fileMap.set(`${spaceRoot}/manifest.json`, {
      path: `${spaceRoot}/manifest.json`,
      kind: 'text',
      text: `${JSON.stringify({ ...spaceManifest, tabs: [], activeTabId: 'missing-tab' }, null, 2)}\n`,
    })

    const serialized = readSerializedStateFromHybridFileMap(fileMap)
    const roundTripped = parseSavedState(serialized ?? '')
    const repairedSpace = roundTripped.domains[0]?.spaces[0]
    const saved = buildHybridFileMapFromSerializedState(serialized ?? '')
    const savedPaths = getBrowserWorkspacePaths(saved)
    const savedTabs = Array.isArray(savedPaths.spaceManifest.tabs) ? savedPaths.spaceManifest.tabs : []

    expect(serialized).toEqual(expect.any(String))
    expect(repairedSpace?.data.tabs).toHaveLength(1)
    expect(repairedSpace?.data.tabs[0]?.title).toBe('tab')
    expect(repairedSpace?.data.deletedTabs).toHaveLength(1)
    expect(repairedSpace?.data.deletedTabs[0]?.tab.id).toBe('tab-1')
    expect(savedTabs).toHaveLength(1)
    expect(saved.has(`${savedPaths.spaceRoot}/${String(getRecord(savedTabs[0]).homeNoteFile)}`)).toBe(true)
  })
})
