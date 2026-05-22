import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  listStorageRecoverySnapshots,
  loadAppStateResult,
  pruneStorageRecoverySnapshots,
  RECOVERY_SNAPSHOT_MAX_ACTIVE_DAYS,
  RECOVERY_SNAPSHOT_MAX_PER_DAY,
  restoreStorageRecoverySnapshot,
  saveAppState,
  writeAssetToProfile,
  writeImageAssetToProfile,
} from './app-state-storage.mjs'
import { STORAGE_PATH_SEGMENT_MAX_LENGTH } from '../src/storage/storage-path-segments.js'

function createTempUserDataPath() {
  return mkdtempSync(path.join(os.tmpdir(), 'tabs-user-data-'))
}

function withTempUserDataPath(run) {
  const userDataPath = createTempUserDataPath()
  try {
    return run(userDataPath)
  } finally {
    rmSync(userDataPath, { recursive: true, force: true })
  }
}

const customThemePaletteFixture = {
  canvas: '#0b1528',
  page: '#142642',
  surface: '#0f1b32',
  surfaceRaised: '#101d34',
  text: '#e9ecef',
  mutedText: '#9fb3d7',
  border: '#2f4672',
  primary: '#8844cc',
  secondary: '#1f9b67',
  danger: '#963442',
  warning: '#d9a441',
  success: '#2fb36d',
}

function serializedAppState() {
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
          homeContent: 'hello',
          activeSubTabId: null,
          subTabs: [],
        },
      ],
      deletedTabs: [],
      deletedSubTabs: [],
    },
  }

  return JSON.stringify({
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
    noteBodies: [
      {
        id: 'body-1',
        frontmatter: { created: '2024-01-01' },
        frontmatterTemplateId: 'template-1',
        frontmatterTemplateDerived: true,
        frontmatterTemplateFieldOrigins: {
          created: { templateId: 'template-1', fieldId: 'field-1' },
        },
        frontmatterTemplateRemovedFieldIds: ['field-2'],
        frontmatterComputedFields: { created: 'createdAt' },
        aisles: [{ id: 'aisle-1', markdown: 'hello' }],
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
      showParentHomeTab: true,
      stageManagerOpenDestinationAfterApply: true,
      tabButtonScale: 1,
      noteFontScale: 1,
      settingsSection: 'frontmatter',
      customThemePalette: customThemePaletteFixture,
      noteCursorLocations: {},
    },
    activeSpaceId: space.id,
    spaces: [space],
  })
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function createRecoverySnapshotDirectory(userDataPath, timestamp) {
  const snapshotPath = path.join(userDataPath, 'storage-recovery', `notes-data-${timestamp}`)
  mkdirSync(snapshotPath, { recursive: true })
  writeFileSync(path.join(snapshotPath, 'marker.txt'), String(timestamp), 'utf8')
  const snapshotDate = new Date(timestamp)
  utimesSync(snapshotPath, snapshotDate, snapshotDate)
  return snapshotPath
}

function buildTimestamp(dayOffset, hour = 12, minute = 0) {
  return new Date(2024, 0, 1 + dayOffset, hour, minute).getTime()
}

function serializedAppStateWithMarkdown(markdown) {
  const state = JSON.parse(serializedAppState())
  state.noteBodies[0].aisles[0].markdown = markdown
  return JSON.stringify(state)
}

afterEach(() => {
  vi.useRealTimers()
})

function getStoredWorkspacePaths(profileRootPath, indexes = {}) {
  const domainIndex = indexes.domainIndex ?? 0
  const spaceIndex = indexes.spaceIndex ?? 0
  const root = path.join(profileRootPath, 'notes-data')
  const rootManifest = readJson(path.join(root, 'manifest.json'))
  const domainEntry = rootManifest.domains[domainIndex]
  const domainRoot = path.join(root, 'domains', domainEntry.path)
  const domainManifest = readJson(path.join(domainRoot, 'manifest.json'))
  const spaceEntry = domainManifest.spaces[spaceIndex]
  const spaceRoot = path.join(domainRoot, spaceEntry.path)
  const spaceManifest = readJson(path.join(spaceRoot, 'manifest.json'))
  return {
    root,
    rootManifest,
    domainEntry,
    domainRoot,
    domainManifest,
    spaceEntry,
    spaceRoot,
    spaceManifest,
  }
}

function getVisibleLength(value) {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  return Array.from(segmenter.segment(value)).length
}

function expectRelativePathWithinSegmentLimit(relativePath) {
  for (const segment of relativePath.split('/').filter(Boolean)) {
    expect(getVisibleLength(segment)).toBeLessThanOrEqual(STORAGE_PATH_SEGMENT_MAX_LENGTH)
  }
}

describe('Electron app state storage load result', () => {
  it('returns serialized state for a valid hybrid profile', () =>
    withTempUserDataPath((userDataPath) => {
      saveAppState(userDataPath, serializedAppState())

      const result = loadAppStateResult(userDataPath)

      expect(result.ok).toBe(true)
      expect(result.source).toBe('hybrid')
      expect(result.serializedState).toEqual(expect.any(String))
      const parsed = JSON.parse(result.serializedState)
      expect(parsed.domains).toHaveLength(1)
      expect(parsed.noteBodies).toHaveLength(1)
      expect(parsed.noteBodies[0].frontmatter).toEqual({ created: '2024-01-01' })
      expect(parsed.noteBodies[0].frontmatterTemplateId).toBe('template-1')
      expect(parsed.noteBodies[0].frontmatterTemplateDerived).toBe(true)
      expect(parsed.noteBodies[0].frontmatterTemplateFieldOrigins).toEqual({
        created: { templateId: 'template-1', fieldId: 'field-1' },
      })
      expect(parsed.noteBodies[0].frontmatterTemplateRemovedFieldIds).toEqual(['field-2'])
      expect(parsed.noteBodies[0].frontmatterComputedFields).toEqual({ created: 'createdAt' })
      expect(parsed.frontmatter.settingsTemplateId).toBe('template-1')
      expect(parsed.frontmatter.lastAppliedTemplateId).toBe('template-1')
      expect(parsed.ui.settingsSection).toBeUndefined()
      expect(parsed.ui.customThemePalette.primary).toBe('#8844cc')
    }))

  it('round-trips the custom theme through hybrid storage', () =>
    withTempUserDataPath((userDataPath) => {
      const state = JSON.parse(serializedAppState())
      state.theme = 'custom'

      saveAppState(userDataPath, JSON.stringify(state))

      const result = loadAppStateResult(userDataPath)
      expect(result.ok).toBe(true)
      const parsed = JSON.parse(result.serializedState)
      expect(parsed.theme).toBe('custom')
      expect(parsed.ui.customThemePalette).toEqual(customThemePaletteFixture)
    }))

  it('writes app settings and per-space settings into notes-data manifests', () =>
    withTempUserDataPath((userDataPath) => {
      const state = JSON.parse(serializedAppState())
      state.theme = 'custom'
      state.hotkeys = {
        ...state.hotkeys,
        shortcuts: {
          ...state.hotkeys?.shortcuts,
          newTab: 'Ctrl+Alt+N',
          newSubTab: 'Ctrl+Alt+M',
        },
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
      }
      state.ui = {
        ...state.ui,
        showParentHomeTab: false,
        stageManagerOpenDestinationAfterApply: false,
        settingsSection: 'toolbar',
        lastNoteCopyMode: 'linked',
        decoupledItemsKeepData: false,
        tableAddTargetMode: 'active-cell',
        tableDeleteTargetMode: 'active-cell',
      }
      state.domains[0].spaces[0].settings = { autoRemoveDeletedDays: 21 }
      state.spaces = state.domains[0].spaces

      saveAppState(userDataPath, JSON.stringify(state))

      const { rootManifest, spaceManifest } = getStoredWorkspacePaths(userDataPath)
      const profileSettings = readJson(path.join(userDataPath, 'notes-data', 'profile-settings.json'))
      const result = loadAppStateResult(userDataPath)
      expect(result.ok).toBe(true)
      const parsed = JSON.parse(result.serializedState)

      expect(rootManifest.globalSettings.theme).toBe('custom')
      expect(rootManifest.globalSettings.ui.settingsSection).toBeUndefined()
      expect(rootManifest.globalSettings.ui.lastNoteCopyMode).toBe('linked')
      expect(profileSettings.schemaVersion).toBe(1)
      expect(profileSettings.settings.ui.lastNoteCopyMode).toBe('linked')
      expect(profileSettings.settings.ui.settingsSection).toBeUndefined()
      expect(profileSettings.settings.ui.tabButtonScale).toBeUndefined()
      expect(rootManifest.globalSettings.hotkeys.enableMouseBackForward).toBe(false)
      expect(rootManifest.globalSettings.hotkeys.shortcuts.newTab).toBe('Ctrl+Alt+N')
      expect(rootManifest.globalSettings.frontmatter.settingsTemplateId).toBe('template-1')
      expect(spaceManifest.settings).toEqual({ autoRemoveDeletedDays: 21 })
      expect(parsed.ui.settingsSection).toBeUndefined()
      expect(parsed.hotkeys.shortcuts.newTab).toBe('Ctrl+Alt+N')
      expect(parsed.hotkeys.enableMouseBackForward).toBe(false)
      expect(parsed.frontmatter.settingsTemplateId).toBe('template-1')
      expect(parsed.domains[0].spaces[0].settings).toEqual({ autoRemoveDeletedDays: 21 })
    }))

  it('prefers profile settings and falls back to legacy root global settings', () =>
    withTempUserDataPath((userDataPath) => {
      saveAppState(userDataPath, serializedAppState())
      const rootPath = path.join(userDataPath, 'notes-data')
      const manifestPath = path.join(rootPath, 'manifest.json')
      const profileSettingsPath = path.join(rootPath, 'profile-settings.json')
      const rootManifest = readJson(manifestPath)
      const profileSettings = readJson(profileSettingsPath)

      writeFileSync(
        manifestPath,
        `${JSON.stringify({ ...rootManifest, globalSettings: { ...rootManifest.globalSettings, theme: 'light' } }, null, 2)}\n`,
        'utf8',
      )
      writeFileSync(
        profileSettingsPath,
        `${JSON.stringify({ ...profileSettings, settings: { ...profileSettings.settings, theme: 'blues' } }, null, 2)}\n`,
        'utf8',
      )

      expect(JSON.parse(loadAppStateResult(userDataPath).serializedState).theme).toBe('blues')

      rmSync(profileSettingsPath, { force: true })

      expect(JSON.parse(loadAppStateResult(userDataPath).serializedState).theme).toBe('light')
    }))

  it('round-trips rearranged parent and sub-tab order through notes-data storage', () =>
    withTempUserDataPath((userDataPath) => {
      const state = JSON.parse(serializedAppState())
      const space = state.domains[0].spaces[0]
      space.data.activeTabId = 'tab-b'
      space.data.tabs = [
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
      ]
      state.spaces = state.domains[0].spaces
      state.noteBodies = [
        { id: 'body-b', aisles: [{ id: 'aisle-b', markdown: 'b' }] },
        { id: 'body-b2', aisles: [{ id: 'aisle-b2', markdown: 'b2' }] },
        { id: 'body-b1', aisles: [{ id: 'aisle-b1', markdown: 'b1' }] },
        { id: 'body-a', aisles: [{ id: 'aisle-a', markdown: 'a' }] },
      ]

      saveAppState(userDataPath, JSON.stringify(state))

      const { spaceManifest } = getStoredWorkspacePaths(userDataPath)
      const result = loadAppStateResult(userDataPath)
      expect(result.ok).toBe(true)
      const parsed = JSON.parse(result.serializedState)
      const parsedTabs = parsed.domains[0].spaces[0].data.tabs

      expect(spaceManifest.tabs.map((tab) => tab.id)).toEqual(['tab-b', 'tab-a'])
      expect(spaceManifest.tabs[0].subTabs.map((subTab) => subTab.id)).toEqual(['sub-b2', 'sub-b1'])
      expect(parsedTabs.map((tab) => tab.id)).toEqual(['tab-b', 'tab-a'])
      expect(parsedTabs[0].subTabs.map((subTab) => subTab.id)).toEqual(['sub-b2', 'sub-b1'])
    }))

  it('writes v3 human-readable domain paths without synced backups or note body folders', () =>
    withTempUserDataPath((userDataPath) => {
      saveAppState(userDataPath, serializedAppState())

      const root = path.join(userDataPath, 'notes-data')
      const manifest = readJson(path.join(root, 'manifest.json'))

      expect(manifest.schemaVersion).toBe(3)
      expect(manifest.domains[0]).toMatchObject({
        id: 'domain-1',
        title: 'Domain',
      })
      expect(manifest.domains[0].path).toMatch(/^Domain--[a-f0-9]{6}$/)
      expect(existsSync(path.join(root, 'domains', manifest.domains[0].path, 'Space--'))).toBe(false)
      expect(existsSync(path.join(root, 'domains'))).toBe(true)
      expect(existsSync(path.join(root, 'topics'))).toBe(false)
      expect(existsSync(path.join(root, 'note-bodies'))).toBe(false)
      expect(existsSync(path.join(userDataPath, 'notes-data.bak'))).toBe(false)
    }))

  it('uses distinct readable paths for duplicate names', () =>
    withTempUserDataPath((userDataPath) => {
      const state = JSON.parse(serializedAppState())
      state.domains = [
        { ...state.domains[0], id: 'domain-a', name: 'Same Name' },
        { ...state.domains[0], id: 'domain-b', name: 'Same Name' },
      ]

      saveAppState(userDataPath, JSON.stringify(state))
      const manifest = readJson(path.join(userDataPath, 'notes-data', 'manifest.json'))

      expect(manifest.domains).toHaveLength(2)
      expect(manifest.domains[0].path).toMatch(/^Same Name--[a-f0-9]{6}$/)
      expect(manifest.domains[1].path).toMatch(/^Same Name--[a-f0-9]{6}$/)
      expect(manifest.domains[0].path).not.toBe(manifest.domains[1].path)
    }))

  it('stores prime tabs and sub-tabs inline under the domain and space hierarchy', () =>
    withTempUserDataPath((userDataPath) => {
      const state = JSON.parse(serializedAppState())
      state.domains[0].spaces[0].data.tabs[0].subTabs = [
        { id: 'sub-1', title: 'Sub Tab', noteBodyId: 'body-sub', content: 'sub fallback' },
      ]
      state.noteBodies.push({ id: 'body-sub', aisles: [{ id: 'aisle-sub', markdown: 'sub body' }] })

      saveAppState(userDataPath, JSON.stringify(state))
      const root = path.join(userDataPath, 'notes-data')
      const rootManifest = readJson(path.join(root, 'manifest.json'))
      const domainManifest = readJson(path.join(root, 'domains', rootManifest.domains[0].path, 'manifest.json'))
      const spacePath = domainManifest.spaces[0].path
      const spaceRoot = path.join(root, 'domains', rootManifest.domains[0].path, spacePath)
      const spaceManifest = readJson(path.join(spaceRoot, 'manifest.json'))
      const tab = spaceManifest.tabs[0]

      expect(tab.path).toMatch(/^Tab--[a-f0-9]{6}$/)
      expect(tab.homeNoteFile).toBe(`${tab.path}/home.md`)
      expect(tab.subTabs[0].path).toMatch(new RegExp(`^${tab.path}/Sub Tab--[a-f0-9]{6}$`))
      expect(tab.subTabs[0].file).toBe(`${tab.subTabs[0].path}/home.md`)
      expect(readFileSync(path.join(spaceRoot, tab.subTabs[0].file), 'utf8')).toBe('sub body')
    }))

  it('round-trips linked aisle bodies through hybrid storage', () =>
    withTempUserDataPath((userDataPath) => {
      const state = JSON.parse(serializedAppState())
      const space = state.domains[0].spaces[0]
      space.data.tabs.push({
        id: 'tab-2',
        title: 'Linked Tab',
        noteBodyId: 'body-2',
        homeContent: 'stale second fallback',
        activeSubTabId: null,
        subTabs: [],
      })
      state.noteAisleBodies = [{ id: 'shared-aisle-body', markdown: 'shared aisle text' }]
      state.noteBodies = [
        { id: 'body-1', aisles: [{ id: 'aisle-1', aisleBodyId: 'shared-aisle-body', markdown: 'stale first mirror' }] },
        { id: 'body-2', aisles: [{ id: 'aisle-2', aisleBodyId: 'shared-aisle-body', markdown: 'stale second mirror' }] },
      ]

      saveAppState(userDataPath, JSON.stringify(state))

      const { root, rootManifest } = getStoredWorkspacePaths(userDataPath)
      const aisleBodyEntry = rootManifest.noteAisleBodies.find((body) => body.id === 'shared-aisle-body')
      expect(aisleBodyEntry).toMatchObject({ id: 'shared-aisle-body', file: expect.any(String) })
      expect(readFileSync(path.join(root, aisleBodyEntry.file), 'utf8')).toBe('shared aisle text')
      expect(JSON.stringify(rootManifest.noteBodies)).toContain('"aisleBodyId":"shared-aisle-body"')

      const result = loadAppStateResult(userDataPath)
      expect(result.ok).toBe(true)
      const parsed = JSON.parse(result.serializedState)
      const bodyOne = parsed.noteBodies.find((body) => body.id === 'body-1')
      const bodyTwo = parsed.noteBodies.find((body) => body.id === 'body-2')

      expect(bodyOne.aisles[0].aisleBodyId).toBe('shared-aisle-body')
      expect(bodyTwo.aisles[0].aisleBodyId).toBe('shared-aisle-body')
      expect(parsed.noteAisleBodies.find((body) => body.id === 'shared-aisle-body').markdown).toBe('shared aisle text')
    }))

  it('round-trips renamed workspace data, frontmatter, trash, and note body identity', () =>
    withTempUserDataPath((userDataPath) => {
      const state = JSON.parse(serializedAppState())
      const space = state.domains[0].spaces[0]
      const tab = space.data.tabs[0]
      state.domains[0].name = 'Renamed Domain'
      space.name = 'Renamed Space'
      tab.title = 'Renamed Parent'
      tab.activeSubTabId = 'sub-renamed'
      tab.subTabs = [
        { id: 'sub-renamed', title: 'Renamed Child', noteBodyId: 'body-sub-renamed', content: 'stale child fallback' },
      ]
      space.data.deletedTabs = [
        {
          id: 'deleted-parent-entry',
          deletedAt: 10,
          tab: {
            id: 'deleted-parent',
            title: 'Deleted Parent',
            noteBodyId: 'body-deleted-parent',
            homeContent: 'stale deleted parent fallback',
            activeSubTabId: 'deleted-child',
            subTabs: [
              {
                id: 'deleted-child',
                title: 'Deleted Child',
                noteBodyId: 'body-deleted-child',
                content: 'stale deleted child fallback',
              },
            ],
          },
        },
      ]
      space.data.deletedSubTabs = [
        {
          id: 'deleted-loose-entry',
          parentTabId: tab.id,
          parentTabTitle: tab.title,
          deletedAt: 20,
          subTab: {
            id: 'deleted-loose-child',
            title: 'Deleted Loose Child',
            noteBodyId: 'body-deleted-loose',
            content: 'stale deleted loose fallback',
          },
        },
      ]
      state.noteBodies[0] = {
        ...state.noteBodies[0],
        frontmatter: {
          status: 'ready',
          due: null,
          starts: null,
          created: '2024-01-01',
        },
        frontmatterTemplateRemovedFieldIds: ['field-2'],
        aisles: [
          { id: 'aisle-1', markdown: 'renamed parent body' },
          { id: 'aisle-2', markdown: 'second aisle survives' },
        ],
      }
      state.noteBodies.push(
        { id: 'body-sub-renamed', aisles: [{ id: 'aisle-sub-renamed', markdown: 'renamed child body' }] },
        { id: 'body-deleted-parent', aisles: [{ id: 'aisle-deleted-parent', markdown: 'deleted parent body' }] },
        { id: 'body-deleted-child', aisles: [{ id: 'aisle-deleted-child', markdown: 'deleted child body' }] },
        { id: 'body-deleted-loose', aisles: [{ id: 'aisle-deleted-loose', markdown: 'deleted loose body' }] },
      )

      saveAppState(userDataPath, JSON.stringify(state))
      const result = loadAppStateResult(userDataPath)

      expect(result.ok).toBe(true)
      const parsed = JSON.parse(result.serializedState)
      const parsedDomain = parsed.domains.find((domain) => domain.id === 'domain-1')
      const parsedSpace = parsedDomain.spaces.find((candidate) => candidate.id === 'space-1')
      const parsedTab = parsedSpace.data.tabs.find((candidate) => candidate.id === 'tab-1')
      const parsedSubTab = parsedTab.subTabs.find((candidate) => candidate.id === 'sub-renamed')
      const bodyById = new Map(parsed.noteBodies.map((body) => [body.id, body]))

      expect(parsedDomain.name).toBe('Renamed Domain')
      expect(parsedSpace.name).toBe('Renamed Space')
      expect(parsedTab).toMatchObject({
        id: 'tab-1',
        title: 'Renamed Parent',
        noteBodyId: 'body-1',
        activeSubTabId: 'sub-renamed',
        homeContent: 'renamed parent body',
      })
      expect(parsedSubTab).toMatchObject({
        id: 'sub-renamed',
        title: 'Renamed Child',
        noteBodyId: 'body-sub-renamed',
        content: 'renamed child body',
      })
      expect(bodyById.get('body-1')).toMatchObject({
        frontmatter: {
          status: 'ready',
          due: null,
          starts: null,
          created: '2024-01-01',
        },
        frontmatterTemplateId: 'template-1',
        frontmatterTemplateDerived: true,
        frontmatterComputedFields: { created: 'createdAt' },
        frontmatterTemplateRemovedFieldIds: ['field-2'],
        aisles: [
          { id: 'aisle-1', markdown: 'renamed parent body' },
          { id: 'aisle-2', markdown: 'second aisle survives' },
        ],
      })
      expect(parsedSpace.data.deletedTabs[0]).toMatchObject({
        id: 'deleted-parent-entry',
        deletedAt: 10,
        tab: {
          id: 'deleted-parent',
          title: 'Deleted Parent',
          noteBodyId: 'body-deleted-parent',
          homeContent: 'deleted parent body',
          activeSubTabId: 'deleted-child',
          subTabs: [
            {
              id: 'deleted-child',
              title: 'Deleted Child',
              noteBodyId: 'body-deleted-child',
              content: 'deleted child body',
            },
          ],
        },
      })
      expect(parsedSpace.data.deletedSubTabs[0]).toMatchObject({
        id: 'deleted-loose-entry',
        parentTabId: 'tab-1',
        parentTabTitle: 'Renamed Parent',
        deletedAt: 20,
        subTab: {
          id: 'deleted-loose-child',
          title: 'Deleted Loose Child',
          noteBodyId: 'body-deleted-loose',
          content: 'deleted loose body',
        },
      })
    }))

  it('caps generated v2 path segments while preserving app titles and ids', () =>
    withTempUserDataPath((userDataPath) => {
      const longTitle = 'Very Long Cross Platform Folder Name With Emoji 👨‍👩‍👧‍👦 And Symbols <>:"/\\|?* '.repeat(4).trim()
      const state = JSON.parse(serializedAppState())
      state.domains[0].name = longTitle
      state.domains[0].spaces[0].name = longTitle
      state.domains[0].spaces[0].data.tabs[0].title = longTitle
      state.domains[0].spaces[0].data.tabs[0].subTabs = [
        { id: 'sub-long', title: longTitle, noteBodyId: 'body-sub-long', content: 'sub fallback' },
      ]
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
          parentTabId: 'tab-1',
          parentTabTitle: longTitle,
          deletedAt: 2,
          subTab: { id: 'deleted-loose-sub-long', title: longTitle, noteBodyId: 'body-deleted-loose-sub', content: 'deleted loose sub' },
        },
      ]
      state.noteBodies[0].aisles.push({ id: 'aisle-long', markdown: 'second aisle' })
      state.noteBodies.push(
        { id: 'body-sub-long', aisles: [{ id: 'aisle-sub-long', markdown: 'sub body' }] },
        { id: 'body-deleted-tab', aisles: [{ id: 'aisle-deleted-tab', markdown: 'deleted tab' }] },
        { id: 'body-deleted-sub', aisles: [{ id: 'aisle-deleted-sub', markdown: 'deleted sub' }] },
        { id: 'body-deleted-loose-sub', aisles: [{ id: 'aisle-deleted-loose-sub', markdown: 'deleted loose sub' }] },
        { id: 'body-orphan-long', aisles: [{ id: 'aisle-orphan-long', markdown: 'orphan' }] },
      )

      saveAppState(userDataPath, JSON.stringify(state))

      const root = path.join(userDataPath, 'notes-data')
      const rootManifest = readJson(path.join(root, 'manifest.json'))
      const domainEntry = rootManifest.domains[0]
      const domainManifest = readJson(path.join(root, 'domains', domainEntry.path, 'manifest.json'))
      const spaceEntry = domainManifest.spaces[0]
      const spaceRoot = path.join(root, 'domains', domainEntry.path, spaceEntry.path)
      const spaceManifest = readJson(path.join(spaceRoot, 'manifest.json'))
      const trashManifest = readJson(path.join(spaceRoot, 'trash', 'manifest.json'))
      const tab = spaceManifest.tabs[0]
      const bodyRecord = rootManifest.noteBodies.find((body) => body.id === 'body-1')
      const orphanRecord = rootManifest.noteBodies.find((body) => body.id === 'body-orphan-long')
      const generatedPaths = [
        `domains/${domainEntry.path}`,
        `domains/${domainEntry.path}/${spaceEntry.path}`,
        `domains/${domainEntry.path}/${spaceEntry.path}/${tab.path}`,
        `domains/${domainEntry.path}/${spaceEntry.path}/${tab.subTabs[0].path}`,
        bodyRecord.aisles[1].file,
        orphanRecord.aisles[0].file,
        `domains/${domainEntry.path}/${spaceEntry.path}/trash/${spaceManifest.trashManifestFile}`,
        `domains/${domainEntry.path}/${spaceEntry.path}/trash/${trashManifest.items[0].path}`,
        `domains/${domainEntry.path}/${spaceEntry.path}/trash/${trashManifest.items[0].subTabs[0].path}`,
        `domains/${domainEntry.path}/${spaceEntry.path}/trash/${trashManifest.items[1].path}`,
      ]

      expect(domainEntry.title).toBe(longTitle)
      expect(domainManifest.title).toBe(longTitle)
      expect(spaceManifest.title).toBe(longTitle)
      expect(tab.title).toBe(longTitle)
      expect(tab.subTabs[0].title).toBe(longTitle)
      expect(domainEntry.path).toMatch(/--[a-f0-9]{6}$/)
      expect(spaceEntry.path).toMatch(/--[a-f0-9]{6}$/)
      expect(tab.path).toMatch(/--[a-f0-9]{6}$/)
      expect(path.posix.basename(tab.subTabs[0].path)).toMatch(/--[a-f0-9]{6}$/)
      expect(path.posix.basename(bodyRecord.aisles[1].file)).toMatch(/--[a-f0-9]{6}\.md$/)
      generatedPaths.forEach(expectRelativePathWithinSegmentLimit)
    }))

  it('rejects an existing v1 profile instead of migrating it', () =>
    withTempUserDataPath((userDataPath) => {
      const root = path.join(userDataPath, 'notes-data')
      mkdirSync(root, { recursive: true })
      writeFileSync(
        path.join(root, 'manifest.json'),
        JSON.stringify({
          schemaVersion: 1,
        }),
        'utf8',
      )

      expect(loadAppStateResult(userDataPath)).toMatchObject({
        ok: false,
        serializedState: null,
        source: 'hybrid',
        error: 'Existing app state could not be loaded.',
        health: 'error',
        issues: [expect.objectContaining({ code: 'unsupported-root-manifest', severity: 'error' })],
      })
    }))

  it('fails existing profiles with provider conflict folders', () =>
    withTempUserDataPath((userDataPath) => {
      const root = path.join(userDataPath, 'notes-data')
      mkdirSync(path.join(root, 'topics 2'), { recursive: true })
      writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ schemaVersion: 2 }), 'utf8')

      expect(loadAppStateResult(userDataPath)).toMatchObject({
        ok: false,
        source: 'hybrid',
        conflicts: ['notes-data/topics 2'],
        health: 'error',
        issues: [expect.objectContaining({ code: 'cloud-conflict', severity: 'error' })],
      })
    }))

  it('returns an empty writable result when no profile exists', () =>
    withTempUserDataPath((userDataPath) => {
      expect(loadAppStateResult(userDataPath)).toEqual({
        ok: true,
        serializedState: null,
        source: 'empty',
      })
    }))

  it('returns a failed result for an existing corrupt root manifest', () =>
    withTempUserDataPath((userDataPath) => {
      const root = path.join(userDataPath, 'notes-data')
      mkdirSync(root, { recursive: true })
      writeFileSync(path.join(root, 'manifest.json'), '{nope', 'utf8')

      expect(loadAppStateResult(userDataPath)).toMatchObject({
        ok: false,
        serializedState: null,
        source: 'hybrid',
        error: 'Existing app state could not be loaded.',
        health: 'error',
        issues: [expect.objectContaining({ code: 'corrupt-root-manifest', severity: 'error' })],
      })
    }))

  it('returns a failed result for an unsupported existing profile', () =>
    withTempUserDataPath((userDataPath) => {
      const root = path.join(userDataPath, 'notes-data')
      mkdirSync(root, { recursive: true })
      writeFileSync(path.join(root, 'manifest.json'), '{"schemaVersion":999}', 'utf8')

      expect(loadAppStateResult(userDataPath)).toMatchObject({
        ok: false,
        serializedState: null,
        source: 'hybrid',
        error: 'Existing app state could not be loaded.',
        schemaVersion: 999,
        health: 'error',
        issues: [expect.objectContaining({ code: 'unsupported-root-manifest', severity: 'error' })],
      })
    }))

  it('loads missing markdown files as empty content with a warning', () =>
    withTempUserDataPath((userDataPath) => {
      saveAppState(userDataPath, serializedAppState())
      const { spaceRoot, spaceManifest } = getStoredWorkspacePaths(userDataPath)
      rmSync(path.join(spaceRoot, spaceManifest.tabs[0].homeNoteFile), { force: true })

      const result = loadAppStateResult(userDataPath)

      expect(result).toMatchObject({
        ok: true,
        source: 'hybrid',
        health: 'warning',
      })
      expect(result.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: 'missing-markdown',
          severity: 'warning',
          path: expect.stringContaining('/home.md'),
        }),
      ]))
      const parsed = JSON.parse(result.serializedState)
      expect(parsed.domains[0].spaces[0].data.tabs[0].homeContent).toBe('')
      expect(parsed.noteBodies[0].aisles[0].markdown).toBe('')
    }))

  it('keeps markdown references for missing image assets with a warning', () =>
    withTempUserDataPath((userDataPath) => {
      const state = JSON.parse(serializedAppState())
      state.noteBodies[0].aisles[0].markdown = 'image ![pixel](data:image/png;base64,iVBORw0KGgo=)'
      saveAppState(userDataPath, JSON.stringify(state))
      rmSync(path.join(userDataPath, 'notes-data', 'assets'), { recursive: true, force: true })

      const result = loadAppStateResult(userDataPath)
      const parsed = JSON.parse(result.serializedState)

      expect(result).toMatchObject({
        ok: true,
        source: 'hybrid',
        health: 'warning',
      })
      expect(result.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: 'missing-asset',
          severity: 'warning',
          path: expect.stringContaining('notes-data/assets/'),
        }),
      ]))
      expect(parsed.noteBodies[0].aisles[0].markdown).toContain('![pixel](')
      expect(parsed.noteBodies[0].aisles[0].markdown).not.toContain('data:image/')
    }))

  it('loads and re-saves image assets as stable refs without inlining bytes', () =>
    withTempUserDataPath((userDataPath) => {
      const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])
      const asset = writeImageAssetToProfile(userDataPath, bytes, 'png')
      const state = JSON.parse(serializedAppState())
      state.noteBodies[0].aisles[0].markdown = `image ![pixel](${asset.url})`

      saveAppState(userDataPath, JSON.stringify(state))

      const assetPath = path.join(userDataPath, 'notes-data', asset.assetPath)
      expect(readFileSync(assetPath)).toEqual(bytes)

      const result = loadAppStateResult(userDataPath)
      const parsed = JSON.parse(result.serializedState)
      expect(parsed.noteBodies[0].aisles[0].markdown).toContain('tabs-asset:///assets/')
      expect(parsed.noteBodies[0].aisles[0].markdown).not.toContain('data:image/')

      saveAppState(userDataPath, result.serializedState)
      expect(readFileSync(assetPath)).toEqual(bytes)
    }))

  it('loads and re-saves non-image asset links as stable refs', () =>
    withTempUserDataPath((userDataPath) => {
      const bytes = Buffer.from([0x25, 0x50, 0x44, 0x46, 1, 2, 3])
      const asset = writeAssetToProfile(userDataPath, bytes, 'pdf')
      const state = JSON.parse(serializedAppState())
      state.noteBodies[0].aisles[0].markdown = `[report](${asset.url})`

      saveAppState(userDataPath, JSON.stringify(state))

      const assetPath = path.join(userDataPath, 'notes-data', asset.assetPath)
      expect(readFileSync(assetPath)).toEqual(bytes)

      const result = loadAppStateResult(userDataPath)
      const parsed = JSON.parse(result.serializedState)
      expect(parsed.noteBodies[0].aisles[0].markdown).toContain('tabs-asset:///assets/')

      saveAppState(userDataPath, result.serializedState)
      expect(readFileSync(assetPath)).toEqual(bytes)
    }))

  it('loads missing trash manifests as empty trash with a warning', () =>
    withTempUserDataPath((userDataPath) => {
      const state = JSON.parse(serializedAppState())
      state.domains[0].spaces[0].data.deletedTabs = [
        {
          id: 'deleted-parent-entry',
          deletedAt: 1,
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
      state.noteBodies.push({ id: 'body-deleted-parent', aisles: [{ id: 'aisle-deleted-parent', markdown: 'deleted body' }] })
      saveAppState(userDataPath, JSON.stringify(state))
      const { spaceRoot, spaceManifest } = getStoredWorkspacePaths(userDataPath)
      rmSync(path.join(spaceRoot, spaceManifest.trashManifestFile), { force: true })

      const result = loadAppStateResult(userDataPath)
      const parsed = JSON.parse(result.serializedState)

      expect(result).toMatchObject({
        ok: true,
        health: 'warning',
        issues: [expect.objectContaining({ code: 'missing-trash-manifest', severity: 'warning' })],
      })
      expect(parsed.domains[0].spaces[0].data.deletedTabs).toEqual([])
      expect(parsed.domains[0].spaces[0].data.deletedSubTabs).toEqual([])
    }))

  it('loads corrupt trash manifests as empty trash with a warning', () =>
    withTempUserDataPath((userDataPath) => {
      const state = JSON.parse(serializedAppState())
      state.domains[0].spaces[0].data.deletedSubTabs = [
        {
          id: 'deleted-sub-entry',
          parentTabId: 'tab-1',
          parentTabTitle: 'Tab',
          deletedAt: 2,
          subTab: {
            id: 'deleted-sub',
            title: 'Deleted Sub',
            noteBodyId: 'body-deleted-sub',
            content: 'deleted sub body',
          },
        },
      ]
      state.noteBodies.push({ id: 'body-deleted-sub', aisles: [{ id: 'aisle-deleted-sub', markdown: 'deleted sub body' }] })
      saveAppState(userDataPath, JSON.stringify(state))
      const { spaceRoot, spaceManifest } = getStoredWorkspacePaths(userDataPath)
      writeFileSync(path.join(spaceRoot, spaceManifest.trashManifestFile), '{bad', 'utf8')

      const result = loadAppStateResult(userDataPath)
      const parsed = JSON.parse(result.serializedState)

      expect(result).toMatchObject({
        ok: true,
        health: 'warning',
        issues: [expect.objectContaining({ code: 'corrupt-trash-manifest', severity: 'warning' })],
      })
      expect(parsed.domains[0].spaces[0].data.deletedTabs).toEqual([])
      expect(parsed.domains[0].spaces[0].data.deletedSubTabs).toEqual([])
    }))

  it('skips corrupt space manifests while preserving readable spaces', () =>
    withTempUserDataPath((userDataPath) => {
      const state = JSON.parse(serializedAppState())
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
              homeContent: 'second',
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
      state.noteBodies.push({ id: 'body-2', aisles: [{ id: 'aisle-2', markdown: 'second' }] })
      saveAppState(userDataPath, JSON.stringify(state))
      const { domainRoot, domainManifest } = getStoredWorkspacePaths(userDataPath)
      writeFileSync(path.join(domainRoot, domainManifest.spaces[0].path, 'manifest.json'), '{bad', 'utf8')

      const result = loadAppStateResult(userDataPath)
      const parsed = JSON.parse(result.serializedState)

      expect(result).toMatchObject({
        ok: true,
        health: 'warning',
        issues: [expect.objectContaining({ code: 'corrupt-space-manifest', severity: 'warning' })],
      })
      expect(parsed.domains[0].spaces).toHaveLength(1)
      expect(parsed.domains[0].spaces[0].id).toBe('space-2')
      expect(parsed.activeSpaceId).toBe('space-2')
    }))

  it('skips corrupt domain manifests while preserving readable domains', () =>
    withTempUserDataPath((userDataPath) => {
      const state = JSON.parse(serializedAppState())
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
              homeContent: 'second',
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
      state.noteBodies.push({ id: 'body-2', aisles: [{ id: 'aisle-2', markdown: 'second' }] })
      saveAppState(userDataPath, JSON.stringify(state))
      const rootManifest = readJson(path.join(userDataPath, 'notes-data', 'manifest.json'))
      writeFileSync(path.join(userDataPath, 'notes-data', 'domains', rootManifest.domains[0].path, 'manifest.json'), '{bad', 'utf8')

      const result = loadAppStateResult(userDataPath)
      const parsed = JSON.parse(result.serializedState)

      expect(result).toMatchObject({
        ok: true,
        health: 'warning',
        issues: [expect.objectContaining({ code: 'corrupt-domain-manifest', severity: 'warning' })],
      })
      expect(parsed.domains).toHaveLength(1)
      expect(parsed.domains[0].id).toBe('domain-2')
      expect(parsed.activeDomainId).toBe('domain-2')
    }))

  it('blocks writes when no domains are readable', () =>
    withTempUserDataPath((userDataPath) => {
      saveAppState(userDataPath, serializedAppState())
      const rootManifest = readJson(path.join(userDataPath, 'notes-data', 'manifest.json'))
      writeFileSync(path.join(userDataPath, 'notes-data', 'domains', rootManifest.domains[0].path, 'manifest.json'), '{bad', 'utf8')

      expect(loadAppStateResult(userDataPath)).toMatchObject({
        ok: false,
        serializedState: null,
        source: 'hybrid',
        health: 'error',
        issues: expect.arrayContaining([
          expect.objectContaining({ code: 'corrupt-domain-manifest', severity: 'warning' }),
          expect.objectContaining({ code: 'no-readable-domains', severity: 'error' }),
        ]),
      })
    }))

  it('creates interrupted-save recovery snapshots outside the synced notes-data tree', () =>
    withTempUserDataPath((userDataPath) => {
      const profileRootPath = mkdtempSync(path.join(os.tmpdir(), 'tabs-profile-'))
      try {
        const firstState = JSON.parse(serializedAppState())
        const secondState = { ...firstState, theme: 'light' }
        saveAppState(profileRootPath, JSON.stringify(firstState), { userDataPath })
        saveAppState(profileRootPath, JSON.stringify(secondState), { userDataPath })

        const snapshots = listStorageRecoverySnapshots(userDataPath)

        expect(snapshots.length).toBeGreaterThanOrEqual(1)
        expect(snapshots[0].path).toContain(path.join(userDataPath, 'storage-recovery'))
        expect(snapshots[0].path).not.toContain(path.join(profileRootPath, 'notes-data', 'storage-recovery'))
        expect(existsSync(path.join(profileRootPath, 'storage-recovery'))).toBe(false)
      } finally {
        rmSync(profileRootPath, { recursive: true, force: true })
      }
    }))

  it('skips recovery snapshots for routine autosaves', () =>
    withTempUserDataPath((userDataPath) => {
      const profileRootPath = mkdtempSync(path.join(os.tmpdir(), 'tabs-profile-'))
      try {
        saveAppState(profileRootPath, serializedAppStateWithMarkdown('first'), { userDataPath })
        saveAppState(profileRootPath, serializedAppStateWithMarkdown('second'), {
          userDataPath,
          snapshotMode: 'skip',
        })
        saveAppState(profileRootPath, serializedAppStateWithMarkdown('third'), {
          userDataPath,
          snapshotMode: 'skip',
        })

        const snapshots = listStorageRecoverySnapshots(userDataPath)
        const parsed = JSON.parse(loadAppStateResult(profileRootPath).serializedState)

        expect(snapshots).toHaveLength(0)
        expect(parsed.noteBodies[0].aisles[0].markdown).toBe('third')
      } finally {
        rmSync(profileRootPath, { recursive: true, force: true })
      }
    }))

  it('creates a recovery snapshot for quiet-period debounced autosaves', () =>
    withTempUserDataPath((userDataPath) => {
      const profileRootPath = mkdtempSync(path.join(os.tmpdir(), 'tabs-profile-'))
      try {
        saveAppState(profileRootPath, serializedAppStateWithMarkdown('first'), { userDataPath })
        saveAppState(profileRootPath, serializedAppStateWithMarkdown('quiet'), {
          userDataPath,
          snapshotMode: 'debounced',
        })

        const snapshots = listStorageRecoverySnapshots(userDataPath)
        const parsed = JSON.parse(loadAppStateResult(profileRootPath).serializedState)

        expect(snapshots.length).toBeGreaterThanOrEqual(1)
        expect(snapshots[0].path).toContain(path.join(userDataPath, 'storage-recovery'))
        expect(parsed.noteBodies[0].aisles[0].markdown).toBe('quiet')
      } finally {
        rmSync(profileRootPath, { recursive: true, force: true })
      }
    }))

  it('prunes recovery snapshots to the earliest and latest snapshot per active day', () =>
    withTempUserDataPath((userDataPath) => {
      const timestamps = [1, 2, 3, 4, 5].map((hour) => buildTimestamp(0, hour))
      timestamps.forEach((timestamp) => createRecoverySnapshotDirectory(userDataPath, timestamp))

      const result = pruneStorageRecoverySnapshots(userDataPath)
      const snapshots = listStorageRecoverySnapshots(userDataPath)
      const keptNames = snapshots.map((snapshot) => snapshot.name)

      expect(result).toMatchObject({ removed: 3, kept: RECOVERY_SNAPSHOT_MAX_PER_DAY })
      expect(snapshots).toHaveLength(2)
      expect(keptNames).toContain(`notes-data-${timestamps[0]}`)
      expect(keptNames).toContain(`notes-data-${timestamps[timestamps.length - 1]}`)
      expect(existsSync(path.join(userDataPath, 'storage-recovery', `notes-data-${timestamps[2]}`))).toBe(false)
    }))

  it('prunes recovery snapshots to the latest 30 active days while skipping inactive days', () =>
    withTempUserDataPath((userDataPath) => {
      const timestamps = Array.from(
        { length: RECOVERY_SNAPSHOT_MAX_ACTIVE_DAYS + 1 },
        (_, index) => buildTimestamp(index * 2),
      )
      timestamps.forEach((timestamp) => createRecoverySnapshotDirectory(userDataPath, timestamp))

      pruneStorageRecoverySnapshots(userDataPath)
      const snapshots = listStorageRecoverySnapshots(userDataPath)
      const keptNames = snapshots.map((snapshot) => snapshot.name)

      expect(snapshots).toHaveLength(RECOVERY_SNAPSHOT_MAX_ACTIVE_DAYS)
      expect(keptNames).not.toContain(`notes-data-${timestamps[0]}`)
      expect(keptNames).toContain(`notes-data-${timestamps[1]}`)
      expect(keptNames).toContain(`notes-data-${timestamps[timestamps.length - 1]}`)
    }))

  it('restores the latest valid recovery snapshot', () =>
    withTempUserDataPath((userDataPath) => {
      const profileRootPath = mkdtempSync(path.join(os.tmpdir(), 'tabs-profile-'))
      try {
        const firstState = JSON.parse(serializedAppState())
        const secondState = { ...firstState, theme: 'light' }
        saveAppState(profileRootPath, JSON.stringify(firstState), { userDataPath })
        saveAppState(profileRootPath, JSON.stringify(secondState), { userDataPath })

        const restoreResult = restoreStorageRecoverySnapshot(profileRootPath, userDataPath)
        const loadResult = loadAppStateResult(profileRootPath)
        const parsed = JSON.parse(loadResult.serializedState)

        expect(restoreResult).toMatchObject({
          ok: true,
          loadResult: { ok: true },
        })
        expect(parsed.theme).toBe('dawn')
      } finally {
        rmSync(profileRootPath, { recursive: true, force: true })
      }
    }))

  it('restores the latest valid recovery snapshot after retention pruning', () =>
    withTempUserDataPath((userDataPath) => {
      const profileRootPath = mkdtempSync(path.join(os.tmpdir(), 'tabs-profile-'))
      try {
        vi.useFakeTimers()
        const timestamps = Array.from(
          { length: RECOVERY_SNAPSHOT_MAX_ACTIVE_DAYS + 2 },
          (_, index) => buildTimestamp(index),
        )

        timestamps.forEach((timestamp, index) => {
          vi.setSystemTime(timestamp)
          saveAppState(profileRootPath, serializedAppStateWithMarkdown(`note-${index}`), { userDataPath })
        })

        const snapshotsBeforeRestore = listStorageRecoverySnapshots(userDataPath)
        vi.setSystemTime(timestamps[timestamps.length - 1] + 1)
        const restoreResult = restoreStorageRecoverySnapshot(profileRootPath, userDataPath)
        const loadResult = loadAppStateResult(profileRootPath)
        const parsed = JSON.parse(loadResult.serializedState)

        expect(snapshotsBeforeRestore).toHaveLength(RECOVERY_SNAPSHOT_MAX_ACTIVE_DAYS)
        expect(restoreResult).toMatchObject({
          ok: true,
          loadResult: { ok: true },
        })
        expect(parsed.noteBodies[0].aisles[0].markdown).toBe(`note-${timestamps.length - 2}`)
        expect(listStorageRecoverySnapshots(userDataPath).length).toBeLessThanOrEqual(
          RECOVERY_SNAPSHOT_MAX_ACTIVE_DAYS * RECOVERY_SNAPSHOT_MAX_PER_DAY,
        )
      } finally {
        rmSync(profileRootPath, { recursive: true, force: true })
      }
    }))
})
