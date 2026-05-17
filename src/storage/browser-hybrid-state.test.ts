import { describe, expect, it } from 'vitest'
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
  const domainEntry = getRecord(Array.isArray(rootManifest.domains) ? rootManifest.domains[0] : null)
  const domainRoot = `notes-data/domains/${String(domainEntry.path)}`
  const domainManifest = getTextFileJson(fileMap, `${domainRoot}/manifest.json`)
  const spaceEntry = getRecord(Array.isArray(domainManifest.spaces) ? domainManifest.spaces[0] : null)
  const spaceRoot = `${domainRoot}/${String(spaceEntry.path)}`
  const spaceManifest = getTextFileJson(fileMap, `${spaceRoot}/manifest.json`)
  return {
    rootManifest,
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
    const firstDomain = getRecord(Array.isArray(rootManifest?.domains) ? rootManifest.domains[0] : null)
    const paths = Array.from(fileMap.keys())
    const serialized = readSerializedStateFromHybridFileMap(fileMap)
    const roundTripped = parseSavedState(serialized)
    const homeBody = roundTripped.noteBodies.find((body) => body.id === 'body-tab')
    const subBody = roundTripped.noteBodies.find((body) => body.id === 'body-sub')

    expect(rootManifest?.schemaVersion).toBe(2)
    expect(firstDomain.path).toEqual(expect.stringMatching(/^humble beginnings--[a-f0-9]{6}$/))
    expect(paths.some((path) => path.startsWith('notes-data/domains/'))).toBe(true)
    expect(paths.some((path) => path.startsWith('notes-data/topics/'))).toBe(false)
    expect(paths.some((path) => path.startsWith('notes-data/note-bodies/'))).toBe(false)
    expect(paths.some((path) => /\/Tab--[a-f0-9]{6}\/home\.md$/.test(path))).toBe(true)
    expect(paths.some((path) => /\/Tab--[a-f0-9]{6}\/Sub--[a-f0-9]{6}\/home\.md$/.test(path))).toBe(true)
    expect(serialized).not.toBeNull()
    expect(homeBody?.aisles[0]?.markdown).toBe('home body')
    expect(homeBody?.frontmatter).toEqual({ created: '2024-01-01' })
    expect(homeBody?.frontmatterTemplateId).toBe('template-1')
    expect(homeBody?.frontmatterTemplateDerived).toBe(true)
    expect(homeBody?.frontmatterTemplateFieldOrigins).toEqual({
      created: { templateId: 'template-1', fieldId: 'field-1' },
    })
    expect(homeBody?.frontmatterTemplateRemovedFieldIds).toEqual(['field-2'])
    expect(homeBody?.frontmatterComputedFields).toEqual({ created: 'createdAt' })
    expect(subBody?.aisles[0]?.markdown).toBe('sub body')
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

  it('caps generated v2 path segments without truncating app titles', () => {
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
                  deletedTabs: [
                    {
                      id: 'deleted-tab-entry-long',
                      deletedAt: 1,
                      tab: {
                        id: 'deleted-tab-long',
                        title: longTitle,
                        noteBodyId: 'body-deleted-tab',
                        homeContent: 'deleted tab',
                        activeSubTabId: null,
                        subTabs: [
                          { id: 'deleted-sub-long', title: longTitle, noteBodyId: 'body-deleted-sub', content: 'deleted sub' },
                        ],
                      },
                    },
                  ],
                  deletedSubTabs: [
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
                  ],
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

    const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify(state))
    const rootManifest = getTextFileJson(fileMap, 'notes-data/manifest.json')
    const domainEntry = getRecord(Array.isArray(rootManifest.domains) ? rootManifest.domains[0] : null)
    const domainManifest = getTextFileJson(fileMap, `notes-data/domains/${String(domainEntry.path)}/manifest.json`)
    const spaceEntry = getRecord(Array.isArray(domainManifest.spaces) ? domainManifest.spaces[0] : null)
    const spaceManifest = getTextFileJson(
      fileMap,
      `notes-data/domains/${String(domainEntry.path)}/${String(spaceEntry.path)}/manifest.json`,
    )
    const firstTab = getRecord(Array.isArray(spaceManifest.tabs) ? spaceManifest.tabs[0] : null)
    const firstSubTab = getRecord(Array.isArray(firstTab.subTabs) ? firstTab.subTabs[0] : null)

    Array.from(fileMap.keys()).forEach(expectPathSegmentsWithinLimit)
    expect(domainEntry.title).toBe(longTitle)
    expect(domainManifest.title).toBe(longTitle)
    expect(spaceManifest.title).toBe(longTitle)
    expect(firstTab.title).toBe(longTitle)
    expect(firstSubTab.title).toBe(longTitle)
    expect(domainEntry.path).toEqual(expect.stringMatching(/--[a-f0-9]{6}$/))
    expect(spaceEntry.path).toEqual(expect.stringMatching(/--[a-f0-9]{6}$/))
    expect(firstTab.path).toEqual(expect.stringMatching(/--[a-f0-9]{6}$/))
    expect(firstSubTab.path).toEqual(expect.stringMatching(/--[a-f0-9]{6}$/))
  })

  it('does not read v1 topic/note-body file maps', () => {
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
    const firstDomain = getRecord(Array.isArray(rootManifest.domains) ? rootManifest.domains[0] : null)
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
