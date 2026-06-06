import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  loadAppStateResult,
  resolveNoteLocationRevealPath,
  saveAppState,
  writeAssetToProfile,
  writeImageAssetToProfile,
} from './app-state-storage.mjs'
import { buildPreviewToken } from '../src/markdown/note-context-tokens.js'
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
  domainRail: '#a95429',
  spaceRail: '#997b28',
  parentRail: '#2f5da8',
  subtabRail: '#2f8a5f',
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
        aisles: [{ id: 'aisle-1', aisleBodyId: 'aisle-body-1' }],
      },
    ],
    noteAisleBodies: [
      {
        id: 'aisle-body-1',
        markdown: 'hello',
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
      tabButtonScale: 1,
      noteFontScale: 1,
      settingsSection: 'frontmatter',
      selectedCustomTheme: 'custom1',
      themePalettes: {
        custom1: customThemePaletteFixture,
        dawn: {
          ...customThemePaletteFixture,
          primary: '#123456',
        },
      },
      noteCursorLocations: {},
    },
    activeSpaceId: space.id,
    spaces: [space],
  })
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function getAisleMarkdown(state, aisle) {
  if (!aisle) return ''
  const aisleBody = state.noteAisleBodies?.find((body) => body.id === aisle.aisleBodyId)
  return aisleBody?.markdown ?? ''
}

function setFirstAisleBodyMarkdown(state, markdown) {
  const firstAisle = state.noteBodies?.[0]?.aisles?.[0]
  const aisleBody = state.noteAisleBodies?.find((body) => body.id === firstAisle?.aisleBodyId)
  if (aisleBody) aisleBody.markdown = markdown
}

function serializedAppStateWithMarkdown(markdown) {
  const state = JSON.parse(serializedAppState())
  setFirstAisleBodyMarkdown(state, markdown)
  return JSON.stringify(state)
}

afterEach(() => {
  vi.useRealTimers()
})

function getStoredWorkspacePaths(profileRootPath, indexes = {}) {
  const domainIndex = indexes.domainIndex ?? 0
  const spaceIndex = indexes.spaceIndex ?? 0
  const root = profileRootPath
  const rootManifest = readJson(path.join(root, 'manifest.json'))
  const workspaceIndex = readJson(path.join(root, rootManifest.files?.workspaceIndex ?? 'workspace-index.json'))
  const noteRegistry = readJson(path.join(root, rootManifest.files?.noteRegistry ?? 'note-registry.json'))
  const noteBodiesRegistry = { noteBodies: Array.isArray(noteRegistry.noteBodies) ? noteRegistry.noteBodies : [] }
  const aisleBodiesRegistry = { aisleBodies: Array.isArray(noteRegistry.aisleBodies) ? noteRegistry.aisleBodies : [] }
  const domainEntry = workspaceIndex.domains[domainIndex]
  const domainRoot = path.join(root, 'domains', domainEntry.path)
  const domainManifest = readJson(path.join(domainRoot, 'manifest.json'))
  const spaceEntry = domainManifest.spaces[spaceIndex]
  const spaceRoot = path.join(domainRoot, spaceEntry.path)
  const spaceManifest = readJson(path.join(spaceRoot, 'manifest.json'))
  return {
    root,
    rootManifest,
    workspaceIndex,
    noteRegistry,
    noteBodiesRegistry,
    aisleBodiesRegistry,
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
      expect(parsed.noteBodies[0].frontmatter).toBeUndefined()
      expect(parsed.noteAisleBodies[0].markdown).toBe('hello')
      expect(parsed.noteAisleBodies[0].frontmatter).toEqual({ created: '2024-01-01' })
      expect(parsed.noteAisleBodies[0].frontmatterMeta).toMatchObject({
        templateId: 'template-1',
        templateDerived: true,
        templateFieldOrigins: {
          created: { templateId: 'template-1', fieldId: 'field-1' },
        },
        templateRemovedFieldIds: ['field-2'],
        computedFields: { created: 'createdAt' },
      })
      expect(parsed.noteBodies[0].frontmatterTemplateFieldOrigins).toBeUndefined()
      expect(parsed.noteAisleBodies[0].frontmatterMeta.templateFieldOrigins).toEqual({
        created: { templateId: 'template-1', fieldId: 'field-1' },
      })
      expect(parsed.frontmatter.settingsTemplateId).toBe('template-1')
      expect(parsed.frontmatter.lastAppliedTemplateId).toBe('template-1')
      expect(parsed.ui.settingsSection).toBe('frontmatter')
      expect(parsed.ui).not.toHaveProperty('customThemePalette')
      expect(parsed.ui.themePalettes.custom1.primary).toBe('#8844cc')
      expect(parsed.ui.themePalettes.dawn.primary).toBe('#123456')
    }))

  it('round-trips the custom theme through hybrid storage', () =>
    withTempUserDataPath((userDataPath) => {
      const state = JSON.parse(serializedAppState())
      state.theme = 'custom2'
      state.ui.selectedCustomTheme = 'custom2'
      state.ui.themePalettes.custom2 = {
        ...customThemePaletteFixture,
        primary: '#225599',
      }

      saveAppState(userDataPath, JSON.stringify(state))

      const result = loadAppStateResult(userDataPath)
      expect(result.ok).toBe(true)
      const parsed = JSON.parse(result.serializedState)
      expect(parsed.theme).toBe('custom2')
      expect(parsed.ui.selectedCustomTheme).toBe('custom2')
      expect(parsed.ui).not.toHaveProperty('customThemePalette')
      expect(parsed.ui.themePalettes.custom1).toEqual(customThemePaletteFixture)
      expect(parsed.ui.themePalettes.custom2.primary).toBe('#225599')
    }))

  it('round-trips inline aisle tags without forcing frontmatter', () =>
    withTempUserDataPath((userDataPath) => {
      const state = JSON.parse(serializedAppState())
      const aisleBody = state.noteAisleBodies[0]
      aisleBody.markdown = '#Project\n\nBody #Review'
      delete aisleBody.frontmatter
      delete aisleBody.frontmatterMeta
      delete aisleBody.frontmatterStatus
      delete aisleBody.tags

      saveAppState(userDataPath, JSON.stringify(state))

      const { root, aisleBodiesRegistry } = getStoredWorkspacePaths(userDataPath)
      const aisleBodyEntry = aisleBodiesRegistry.aisleBodies.find((body) => body.id === 'aisle-body-1')
      if (!aisleBodyEntry || typeof aisleBodyEntry.file !== 'string') {
        throw new Error('missing aisle body registry entry')
      }
      const storedMarkdown = readFileSync(path.join(root, aisleBodyEntry.file), 'utf8')
      const result = loadAppStateResult(userDataPath)
      const parsed = JSON.parse(result.serializedState)

      expect(storedMarkdown.startsWith('---')).toBe(false)
      expect(aisleBodyEntry.tags).toEqual(['Project', 'Review'])
      expect(parsed.noteAisleBodies.find((body) => body.id === 'aisle-body-1')?.tags).toEqual(['Project', 'Review'])
    }))

  it('migrates frontmatter tags into visible aisle markdown and keeps computed tags updated', () =>
    withTempUserDataPath((userDataPath) => {
      const state = JSON.parse(serializedAppState())
      const aisleBody = state.noteAisleBodies[0]
      aisleBody.markdown = 'Body text'
      delete aisleBody.frontmatter
      delete aisleBody.frontmatterMeta
      delete aisleBody.frontmatterStatus
      delete aisleBody.tags
      saveAppState(userDataPath, JSON.stringify(state))

      const firstPaths = getStoredWorkspacePaths(userDataPath)
      const firstAisleBodyEntry = firstPaths.aisleBodiesRegistry.aisleBodies.find((body) => body.id === 'aisle-body-1')
      if (!firstAisleBodyEntry || typeof firstAisleBodyEntry.file !== 'string') {
        throw new Error('missing aisle body registry entry')
      }
      writeFileSync(
        path.join(firstPaths.root, firstAisleBodyEntry.file),
        '---\ntags:\n  - Card\n  - Unfinished\n---\nBody text',
        'utf8',
      )

      const result = loadAppStateResult(userDataPath)
      const parsed = JSON.parse(result.serializedState)
      const parsedAisleBody = parsed.noteAisleBodies.find((body) => body.id === 'aisle-body-1')

      expect(parsedAisleBody?.markdown).toBe('#Card #Unfinished\n\nBody text')
      expect(parsedAisleBody?.tags).toEqual(['Card', 'Unfinished'])
      expect(parsedAisleBody?.frontmatter).toEqual({ tags: ['Card', 'Unfinished'] })
      expect(parsedAisleBody?.frontmatterMeta?.computedFields).toEqual({ tags: 'tags' })

      parsedAisleBody.markdown = 'Body without tags'
      parsedAisleBody.tags = []
      saveAppState(userDataPath, JSON.stringify(parsed))

      const secondPaths = getStoredWorkspacePaths(userDataPath)
      const secondAisleBodyEntry = secondPaths.aisleBodiesRegistry.aisleBodies.find((body) => body.id === 'aisle-body-1')
      if (!secondAisleBodyEntry || typeof secondAisleBodyEntry.file !== 'string') {
        throw new Error('missing aisle body registry entry')
      }
      const savedMarkdown = readFileSync(path.join(secondPaths.root, secondAisleBodyEntry.file), 'utf8')
      const reloaded = JSON.parse(loadAppStateResult(userDataPath).serializedState)
      const reloadedAisleBody = reloaded.noteAisleBodies.find((body) => body.id === 'aisle-body-1')

      expect(savedMarkdown).toBe('---\ntags: []\n---\nBody without tags')
      expect(secondAisleBodyEntry.tags).toEqual([])
      expect(reloadedAisleBody?.frontmatter).toEqual({ tags: [] })
      expect(reloadedAisleBody?.tags).toEqual([])
    }))

  it('writes app settings beside notes and per-space settings into notes manifests', () =>
    withTempUserDataPath((userDataPath) => {
      const state = JSON.parse(serializedAppState())
      state.theme = 'custom3'
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
        settingsSection: 'toolbar',
        selectedCustomTheme: 'custom3',
        lastNoteCopyMode: 'linked',
        findCaseSensitive: true,
        findReplaceMode: 'replace',
        removeNoteReferencesOnTrash: false,
        noteMentionCopyRequiresConfirmation: false,
        deleteActiveAisleShortcutEnabled: true,
        decoupledItemsKeepData: false,
        tableAddTargetMode: 'active-cell',
        tableDeleteTargetMode: 'active-cell',
        tableOfContentsScope: 'focused-aisle',
        tabRenameEnterBehavior: 'creates-another-tab',
        newAislePlacement: 'left-of-focus',
        scratchpadAisleLimit: 40,
      }
      state.domains[0].spaces[0].settings = { autoRemoveDeletedDays: 21 }
      state.spaces = state.domains[0].spaces
      state.messages = [
        {
          id: 'message-1',
          type: 'duplicate-auto-decoupled',
          status: 'unread',
          createdAt: '2026-06-01T00:00:00.000Z',
          signature: 'signature-1',
          title: 'duplicate files de-coupled',
          body: '1 changed duplicate file was de-coupled.',
        },
      ]
      state.toastHistory = [
        {
          id: 1,
          createdAt: '2026-06-01T00:01:00.000Z',
          message: 'Notebook folder updated.',
          tone: 'success',
        },
      ]

      saveAppState(userDataPath, JSON.stringify(state))

      const { root, rootManifest, spaceManifest } = getStoredWorkspacePaths(userDataPath)
      const appSettings = readJson(path.join(userDataPath, 'settings', 'app-settings.json'))
      const frontmatterSettings = readJson(path.join(root, rootManifest.files.frontmatterSettings))
      const messagesFile = readJson(path.join(root, rootManifest.files.messages))
      const result = loadAppStateResult(userDataPath)
      expect(result.ok).toBe(true)
      const parsed = JSON.parse(result.serializedState)

      expect(rootManifest.schemaVersion).toBe(1)
      expect(Object.keys(rootManifest).sort()).toEqual(['files', 'schemaVersion'])
      expect(Object.keys(rootManifest.files).sort()).toEqual([
        'deletedWorkspace',
        'editorState',
        'frontmatterSettings',
        'messages',
        'navigationState',
        'noteRegistry',
        'workspaceIndex',
      ])
      expect(existsSync(path.join(root, 'app-settings.json'))).toBe(false)
      expect(existsSync(path.join(root, 'profile-settings.json'))).toBe(false)
      expect(existsSync(path.join(root, 'appearance-settings.json'))).toBe(false)
      expect(existsSync(path.join(root, 'shortcut-settings.json'))).toBe(false)
      expect(existsSync(path.join(root, 'ui-preferences.json'))).toBe(false)
      expect(existsSync(path.join(root, 'note-bodies.json'))).toBe(false)
      expect(existsSync(path.join(root, 'aisle-bodies.json'))).toBe(false)
      expect(existsSync(path.join(root, 'orphan-note-bodies.json'))).toBe(false)
      expect(existsSync(path.join(root, 'orphan-aisle-bodies.json'))).toBe(false)
      expect(appSettings.theme).toBe('custom3')
      expect(appSettings.selectedCustomTheme).toBe('custom3')
      expect(appSettings.themePalettes.dawn.primary).toBe('#123456')
      expect(appSettings.ui.settingsSection).toBe('toolbar')
      expect(appSettings.ui.lastNoteCopyMode).toBe('linked')
      expect(appSettings.ui.findCaseSensitive).toBe(true)
      expect(appSettings.ui.findReplaceMode).toBe('replace')
      expect(appSettings.ui.removeNoteReferencesOnTrash).toBe(false)
      expect(appSettings.ui.noteMentionCopyRequiresConfirmation).toBe(false)
      expect(appSettings.ui.deleteActiveAisleShortcutEnabled).toBe(true)
      expect(appSettings.ui.tableOfContentsScope).toBe('focused-aisle')
      expect(appSettings.ui.tabRenameEnterBehavior).toBe('creates-another-tab')
      expect(appSettings.ui).not.toHaveProperty('newAislePlacement')
      expect(appSettings.scratchpadAisleLimit).toBe(40)
      expect(appSettings.hotkeys).not.toHaveProperty('enableMouseBackForward')
      expect(appSettings.hotkeys).not.toHaveProperty('enableGenericHistoryHotkeys')
      expect(appSettings.hotkeys.shortcuts.newTab).toBe('Ctrl+Alt+N')
      expect(frontmatterSettings.settingsTemplateId).toBe('template-1')
      expect(messagesFile.messages).toEqual([
        expect.objectContaining({ id: 'message-1', type: 'duplicate-auto-decoupled' }),
      ])
      expect(messagesFile.toastHistory).toEqual([
        {
          id: 1,
          createdAt: '2026-06-01T00:01:00.000Z',
          message: 'Notebook folder updated.',
          tone: 'success',
        },
      ])
      expect(spaceManifest.settings).toEqual({ autoRemoveDeletedDays: 21 })
      expect(parsed.messages).toEqual([
        expect.objectContaining({ id: 'message-1', type: 'duplicate-auto-decoupled' }),
      ])
      expect(parsed.toastHistory).toEqual([
        {
          id: 1,
          createdAt: '2026-06-01T00:01:00.000Z',
          message: 'Notebook folder updated.',
          tone: 'success',
        },
      ])
      expect(parsed.ui.settingsSection).toBe('toolbar')
      expect(parsed.ui.findCaseSensitive).toBe(true)
      expect(parsed.ui.findReplaceMode).toBe('replace')
      expect(parsed.ui.removeNoteReferencesOnTrash).toBe(false)
      expect(parsed.ui.noteMentionCopyRequiresConfirmation).toBe(false)
      expect(parsed.ui.deleteActiveAisleShortcutEnabled).toBe(true)
      expect(parsed.ui.tableOfContentsScope).toBe('focused-aisle')
      expect(parsed.ui.tabRenameEnterBehavior).toBe('creates-another-tab')
      expect(parsed.ui).not.toHaveProperty('newAislePlacement')
      expect(parsed.ui.scratchpadAisleLimit).toBe(40)
      expect(parsed.hotkeys.shortcuts.newTab).toBe('Ctrl+Alt+N')
      expect(parsed.hotkeys).not.toHaveProperty('enableMouseBackForward')
      expect(parsed.hotkeys).not.toHaveProperty('enableGenericHistoryHotkeys')
      expect(parsed.frontmatter.settingsTemplateId).toBe('template-1')
      expect(parsed.domains[0].spaces[0].settings).toEqual({ autoRemoveDeletedDays: 21 })
    }))

  it('writes only live note cursor locations to editor state', () =>
    withTempUserDataPath((userDataPath) => {
      const state = JSON.parse(serializedAppState())
      const liveKey = 'domain-1::space-1::tab-1::__home__'
      const staleKey = 'domain-1::space-1::missing-tab::__home__'
      state.ui.noteCursorLocations = {
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
      }
      state.ui.headingCollapseState = {
        'body-1': {
          'aisle-1': ['heading-a'],
          'missing-aisle': ['heading-stale'],
        },
        'missing-body': {
          'aisle-1': ['heading-stale'],
        },
      }

      saveAppState(userDataPath, JSON.stringify(state))

      const { root, rootManifest } = getStoredWorkspacePaths(userDataPath)
      const editorState = readJson(path.join(root, rootManifest.files.editorState))
      expect(editorState.noteCursorLocations[liveKey]).toEqual(state.ui.noteCursorLocations[liveKey])
      expect(editorState.noteCursorLocations[staleKey]).toBeUndefined()
      expect(editorState.headingCollapseState).toEqual({
        'body-1': {
          'aisle-1': ['heading-a'],
        },
      })
    }))

  it('prunes stale note cursor locations when loading editor state', () =>
    withTempUserDataPath((userDataPath) => {
      saveAppState(userDataPath, serializedAppState())
      const { root, rootManifest } = getStoredWorkspacePaths(userDataPath)
      const editorStatePath = path.join(root, rootManifest.files.editorState)
      const liveKey = 'domain-1::space-1::tab-1::__home__'
      const staleKey = 'domain-1::space-1::missing-tab::__home__'
      writeFileSync(
        editorStatePath,
        `${JSON.stringify(
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
        'utf8',
      )

      const result = loadAppStateResult(userDataPath)
      expect(result.ok).toBe(true)
      const parsed = JSON.parse(result.serializedState)
      expect(parsed.ui.noteCursorLocations[liveKey]).toBeDefined()
      expect(parsed.ui.noteCursorLocations[staleKey]).toBeUndefined()
      expect(parsed.ui.headingCollapseState).toEqual({ 'body-1': { 'aisle-1': ['heading'] } })
    }))

  it('ignores stale profile-settings and rejects unsupported root manifests', () =>
    withTempUserDataPath((userDataPath) => {
      saveAppState(userDataPath, serializedAppState())
      const rootPath = userDataPath
      const manifestPath = path.join(rootPath, 'manifest.json')
      const profileSettingsPath = path.join(rootPath, 'profile-settings.json')
      const rootManifest = readJson(manifestPath)
      const appSettings = readJson(path.join(userDataPath, 'settings', 'app-settings.json'))
      const frontmatterSettings = readJson(path.join(rootPath, rootManifest.files.frontmatterSettings))
      const editorState = readJson(path.join(rootPath, rootManifest.files.editorState))
      const profileSettings = {
        schemaVersion: 1,
        settings: {
          theme: 'dawn',
          hotkeys: appSettings.hotkeys,
          frontmatter: frontmatterSettings,
          ui: {
            ...appSettings,
            ...appSettings.ui,
            ...editorState,
          },
        },
      }

      writeFileSync(
        profileSettingsPath,
        `${JSON.stringify({ ...profileSettings, settings: { ...profileSettings.settings, theme: 'light' } }, null, 2)}\n`,
        'utf8',
      )

      const currentResult = loadAppStateResult(userDataPath)
      expect(currentResult.ok).toBe(true)
      expect(JSON.parse(currentResult.serializedState).theme).toBe('dawn')

      writeFileSync(
        manifestPath,
        `${JSON.stringify({ schemaVersion: 2, files: rootManifest.files }, null, 2)}\n`,
        'utf8',
      )
      expect(loadAppStateResult(userDataPath).ok).toBe(false)
    }))

  it('loads manually replaced app-settings without changing notebook content', () =>
    withTempUserDataPath((userDataPath) => {
      saveAppState(userDataPath, serializedAppState())
      const appSettingsPath = path.join(userDataPath, 'settings', 'app-settings.json')
      const appSettings = readJson(appSettingsPath)
      writeFileSync(
        appSettingsPath,
        `${JSON.stringify(
          {
            ...appSettings,
            theme: 'light',
            hotkeys: {
              ...appSettings.hotkeys,
              shortcuts: {
                ...appSettings.hotkeys.shortcuts,
                newTab: 'Ctrl+Alt+N',
              },
            },
            ui: {
              ...appSettings.ui,
              settingsSection: 'visuals',
              findCaseSensitive: true,
            },
          },
          null,
          2,
        )}\n`,
        'utf8',
      )

      const result = loadAppStateResult(userDataPath)
      expect(result.ok).toBe(true)
      const parsed = JSON.parse(result.serializedState)
      expect(parsed.theme).toBe('light')
      expect(parsed.hotkeys.shortcuts.newTab).toBe('Ctrl+Alt+N')
      expect(parsed.ui.settingsSection).toBe('visuals')
      expect(parsed.ui.findCaseSensitive).toBe(true)
      expect(parsed.frontmatter.settingsTemplateId).toBe('template-1')
      expect(parsed.noteAisleBodies[0].markdown).toBe('hello')
      expect(parsed.domains[0].spaces[0].data.tabs[0].title).toBe('Tab')
    }))

  it('uses app support user settings when loading a selected notebook folder', () =>
    withTempUserDataPath((userDataPath) => {
      const profileRootPath = mkdtempSync(path.join(os.tmpdir(), 'tabs-profile-'))
      try {
        const state = JSON.parse(serializedAppState())
        state.theme = 'light'
        saveAppState(profileRootPath, JSON.stringify(state), { userDataPath })

        const globalSettingsPath = path.join(userDataPath, 'settings', 'app-settings.json')
        const folderSettingsPath = path.join(profileRootPath, 'settings', 'app-settings.json')
        const globalSettings = readJson(globalSettingsPath)
        expect(existsSync(folderSettingsPath)).toBe(false)
        expect(globalSettings.theme).toBe('light')

        mkdirSync(path.dirname(folderSettingsPath), { recursive: true })
        writeFileSync(folderSettingsPath, `${JSON.stringify({ ...globalSettings, theme: 'light' }, null, 2)}\n`, 'utf8')
        writeFileSync(globalSettingsPath, `${JSON.stringify({ ...globalSettings, theme: 'dawn' }, null, 2)}\n`, 'utf8')

        const result = loadAppStateResult(profileRootPath, { userSettingsRoot: userDataPath })
        expect(result.ok).toBe(true)
        expect(JSON.parse(result.serializedState).theme).toBe('dawn')
      } finally {
        rmSync(profileRootPath, { recursive: true, force: true })
      }
    }))

  it('ignores and prunes notes app-settings when sibling settings are missing', () =>
    withTempUserDataPath((userDataPath) => {
      saveAppState(userDataPath, serializedAppState())
      const siblingSettingsPath = path.join(userDataPath, 'settings', 'app-settings.json')
      const legacySettingsPath = path.join(userDataPath, 'app-settings.json')
      const appSettings = readJson(siblingSettingsPath)
      rmSync(siblingSettingsPath, { force: true })
      writeFileSync(
        legacySettingsPath,
        `${JSON.stringify(
          {
            ...appSettings,
            theme: 'light',
          },
          null,
          2,
        )}\n`,
        'utf8',
      )

      const result = loadAppStateResult(userDataPath)
      expect(result.ok).toBe(true)
      expect(result.health).toBe('warning')
      expect(result.issues).toContainEqual(expect.objectContaining({ code: 'missing-app-settings', severity: 'warning' }))
      expect(JSON.parse(result.serializedState).theme).toBe('dawn')

      saveAppState(userDataPath, result.serializedState)
      expect(readJson(siblingSettingsPath).theme).toBe('dawn')
      expect(existsSync(legacySettingsPath)).toBe(false)
    }))

  it('recovers with default user settings when app-settings is missing or corrupt', () =>
    withTempUserDataPath((userDataPath) => {
      saveAppState(userDataPath, serializedAppState())
      const appSettingsPath = path.join(userDataPath, 'settings', 'app-settings.json')

      rmSync(appSettingsPath, { force: true })
      const missingResult = loadAppStateResult(userDataPath)
      expect(missingResult.ok).toBe(true)
      expect(missingResult.health).toBe('warning')
      expect(missingResult.issues).toContainEqual(expect.objectContaining({ code: 'missing-app-settings', severity: 'warning' }))
      expect(JSON.parse(missingResult.serializedState).theme).toBe('dawn')
      expect(JSON.parse(missingResult.serializedState).frontmatter.settingsTemplateId).toBe('template-1')

      writeFileSync(appSettingsPath, '{', 'utf8')
      const corruptResult = loadAppStateResult(userDataPath)
      expect(corruptResult.ok).toBe(true)
      expect(corruptResult.health).toBe('warning')
      expect(corruptResult.issues).toContainEqual(expect.objectContaining({ code: 'corrupt-app-settings', severity: 'warning' }))
      expect(JSON.parse(corruptResult.serializedState).theme).toBe('dawn')
      expect(JSON.parse(corruptResult.serializedState).noteAisleBodies[0].markdown).toBe('hello')
    }))

  it('round-trips rearranged parent and sub-tab order through notes storage', () =>
    withTempUserDataPath((userDataPath) => {
      const state = JSON.parse(serializedAppState())
      const space = state.domains[0].spaces[0]
      space.data.activeTabId = 'tab-b'
      space.data.tabs = [
        {
          id: 'tab-b',
          title: 'Beta',
          noteBodyId: 'body-b',
          activeSubTabId: 'sub-b2',
          subTabs: [
            { id: 'sub-b2', title: 'Second', noteBodyId: 'body-b2' },
            { id: 'sub-b1', title: 'First', noteBodyId: 'body-b1' },
          ],
        },
        {
          id: 'tab-a',
          title: 'Alpha',
          noteBodyId: 'body-a',
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

  it('writes current human-readable domain paths without note body folders', () =>
    withTempUserDataPath((userDataPath) => {
      saveAppState(userDataPath, serializedAppState())

      const root = userDataPath
      const manifest = readJson(path.join(root, 'manifest.json'))
      const workspaceIndex = readJson(path.join(root, manifest.files.workspaceIndex))

      expect(manifest.schemaVersion).toBe(1)
      expect(Object.keys(manifest).sort()).toEqual(['files', 'schemaVersion'])
      expect(workspaceIndex.domains[0]).toMatchObject({
        id: 'domain-1',
        title: 'Domain',
      })
      expect(workspaceIndex.domains[0].path).toMatch(/^Domain--[a-f0-9]{6}$/)
      expect(existsSync(path.join(root, 'domains', workspaceIndex.domains[0].path, 'Space--'))).toBe(false)
      expect(existsSync(path.join(root, 'domains'))).toBe(true)
      expect(existsSync(path.join(root, 'topics'))).toBe(false)
      expect(existsSync(path.join(root, 'note-bodies'))).toBe(false)
      expect(existsSync(path.join(root, 'profile-settings.json'))).toBe(false)
      expect(existsSync(path.join(userDataPath, 'notes.bak'))).toBe(false)
    }))

  it('uses distinct readable paths for duplicate names', () =>
    withTempUserDataPath((userDataPath) => {
      const state = JSON.parse(serializedAppState())
      state.domains = [
        { ...state.domains[0], id: 'domain-a', name: 'Same Name' },
        { ...state.domains[0], id: 'domain-b', name: 'Same Name' },
      ]

      saveAppState(userDataPath, JSON.stringify(state))
      const root = userDataPath
      const manifest = readJson(path.join(root, 'manifest.json'))
      const workspaceIndex = readJson(path.join(root, manifest.files.workspaceIndex))

      expect(workspaceIndex.domains).toHaveLength(2)
      expect(workspaceIndex.domains[0].path).toMatch(/^Same Name--[a-f0-9]{6}$/)
      expect(workspaceIndex.domains[1].path).toMatch(/^Same Name--[a-f0-9]{6}$/)
      expect(workspaceIndex.domains[0].path).not.toBe(workspaceIndex.domains[1].path)
    }))

  it('stores prime tabs and sub-tabs inline under the domain and space hierarchy', () =>
    withTempUserDataPath((userDataPath) => {
      const state = JSON.parse(serializedAppState())
      state.domains[0].spaces[0].data.tabs[0].subTabs = [
        { id: 'sub-1', title: 'Sub Tab', noteBodyId: 'body-sub' },
      ]
      state.noteBodies.push({ id: 'body-sub', aisles: [{ id: 'aisle-sub', aisleBodyId: 'aisle-body-sub' }] })
      state.noteAisleBodies.push({ id: 'aisle-body-sub', markdown: 'sub body' })

      saveAppState(userDataPath, JSON.stringify(state))
      const root = userDataPath
      const rootManifest = readJson(path.join(root, 'manifest.json'))
      const workspaceIndex = readJson(path.join(root, rootManifest.files.workspaceIndex))
      const domainManifest = readJson(path.join(root, 'domains', workspaceIndex.domains[0].path, 'manifest.json'))
      const spacePath = domainManifest.spaces[0].path
      const spaceRoot = path.join(root, 'domains', workspaceIndex.domains[0].path, spacePath)
      const spaceManifest = readJson(path.join(spaceRoot, 'manifest.json'))
      const tab = spaceManifest.tabs[0]

      expect(tab.path).toMatch(/^Tab--[a-f0-9]{6}$/)
      expect(tab.homeNoteFile).toBe(`${tab.path}/home.md`)
      expect(tab.subTabs[0].path).toMatch(new RegExp(`^${tab.path}/Sub Tab--[a-f0-9]{6}\\.md$`))
      expect(tab.subTabs[0].file).toBe(tab.subTabs[0].path)
      expect(readFileSync(path.join(spaceRoot, tab.subTabs[0].file), 'utf8')).toBe('sub body')
    }))

  it('stores multi-aisle notes as aisle folders and collapses back to single files', () =>
    withTempUserDataPath((userDataPath) => {
      const state = JSON.parse(serializedAppState())
      state.noteBodies[0].aisles = [
        { id: 'aisle-home-1', aisleBodyId: 'aisle-body-home-1' },
        { id: 'aisle-home-2', aisleBodyId: 'aisle-body-home-2' },
      ]
      state.noteAisleBodies = [
        { id: 'aisle-body-home-1', markdown: 'home one' },
        { id: 'aisle-body-home-2', markdown: 'home two' },
      ]
      state.domains[0].spaces[0].data.tabs[0].subTabs = [
        { id: 'sub-1', title: 'Sub Tab', noteBodyId: 'body-sub' },
      ]
      state.noteBodies.push({
        id: 'body-sub',
        aisles: [
          { id: 'aisle-sub-1', aisleBodyId: 'aisle-body-sub-1' },
          { id: 'aisle-sub-2', aisleBodyId: 'aisle-body-sub-2' },
        ],
      })
      state.noteAisleBodies.push(
        { id: 'aisle-body-sub-1', markdown: 'sub one' },
        { id: 'aisle-body-sub-2', markdown: 'sub two' },
      )

      saveAppState(userDataPath, JSON.stringify(state))
      const initial = getStoredWorkspacePaths(userDataPath)
      const initialTab = initial.spaceManifest.tabs[0]
      const initialSubTab = initialTab.subTabs[0]
      const initialHomeFolder = path.join(initial.spaceRoot, initialTab.path, 'home')
      const initialSubTabFolder = path.join(initial.spaceRoot, initialSubTab.path)
      const initialHomeBodyRecord = initial.noteBodiesRegistry.noteBodies.find((body) => body.id === 'body-1')
      const initialSubBodyRecord = initial.noteBodiesRegistry.noteBodies.find((body) => body.id === 'body-sub')

      expect(initialTab.homeNoteFile).toMatch(new RegExp(`^${initialTab.path}/home/aisle 1--[a-f0-9]{6}\\.md$`))
      expect(initialHomeBodyRecord.aisles[0].file).toMatch(/\/home\/aisle 1--[a-f0-9]{6}\.md$/)
      expect(initialHomeBodyRecord.aisles[1].file).toMatch(/\/home\/aisle 2--[a-f0-9]{6}\.md$/)
      expect(initialSubTab.path).toMatch(new RegExp(`^${initialTab.path}/Sub Tab--[a-f0-9]{6}$`))
      expect(initialSubTab.file).toMatch(new RegExp(`^${initialSubTab.path}/aisle 1--[a-f0-9]{6}\\.md$`))
      expect(initialSubBodyRecord.aisles[1].file).toMatch(/\/Sub Tab--[a-f0-9]{6}\/aisle 2--[a-f0-9]{6}\.md$/)
      expect(readFileSync(path.join(initial.spaceRoot, initialSubTab.file), 'utf8')).toBe('sub one')

      state.noteBodies[0].aisles = [{ id: 'aisle-home-1', aisleBodyId: 'aisle-body-home-1' }]
      state.noteBodies.find((body) => body.id === 'body-sub').aisles = [
        { id: 'aisle-sub-1', aisleBodyId: 'aisle-body-sub-1' },
      ]
      state.noteAisleBodies = [
        { id: 'aisle-body-home-1', markdown: 'home collapsed' },
        { id: 'aisle-body-sub-1', markdown: 'sub collapsed' },
      ]
      saveAppState(userDataPath, JSON.stringify(state))

      const collapsed = getStoredWorkspacePaths(userDataPath)
      const collapsedTab = collapsed.spaceManifest.tabs[0]
      const collapsedSubTab = collapsedTab.subTabs[0]
      expect(collapsedTab.homeNoteFile).toBe(`${collapsedTab.path}/home.md`)
      expect(collapsedSubTab.path).toMatch(new RegExp(`^${collapsedTab.path}/Sub Tab--[a-f0-9]{6}\\.md$`))
      expect(collapsedSubTab.file).toBe(collapsedSubTab.path)
      expect(readFileSync(path.join(collapsed.spaceRoot, collapsedSubTab.file), 'utf8')).toBe('sub collapsed')
      expect(existsSync(initialHomeFolder)).toBe(false)
      expect(existsSync(initialSubTabFolder)).toBe(false)
    }))

  it('round-trips linked aisle bodies through hybrid storage', () =>
    withTempUserDataPath((userDataPath) => {
      const state = JSON.parse(serializedAppState())
      const space = state.domains[0].spaces[0]
      space.data.tabs.push({
        id: 'tab-2',
        title: 'Linked Tab',
        noteBodyId: 'body-2',
        activeSubTabId: null,
        subTabs: [],
      })
      state.noteAisleBodies = [{ id: 'shared-aisle-body', markdown: 'shared aisle text' }]
      state.noteBodies = [
        { id: 'body-1', aisles: [{ id: 'aisle-1', aisleBodyId: 'shared-aisle-body' }] },
        { id: 'body-2', aisles: [{ id: 'aisle-2', aisleBodyId: 'shared-aisle-body' }] },
      ]

      saveAppState(userDataPath, JSON.stringify(state))

      const { root, noteBodiesRegistry, aisleBodiesRegistry } = getStoredWorkspacePaths(userDataPath)
      const aisleBodyEntry = aisleBodiesRegistry.aisleBodies.find((body) => body.id === 'shared-aisle-body')
      expect(aisleBodyEntry).toMatchObject({ id: 'shared-aisle-body', file: expect.any(String), contentHash: expect.any(String) })
      expect(readFileSync(path.join(root, aisleBodyEntry.file), 'utf8')).toBe('shared aisle text')
      expect(JSON.stringify(noteBodiesRegistry.noteBodies)).toContain('"aisleBodyId":"shared-aisle-body"')

      const result = loadAppStateResult(userDataPath)
      expect(result.ok).toBe(true)
      const parsed = JSON.parse(result.serializedState)
      const bodyOne = parsed.noteBodies.find((body) => body.id === 'body-1')
      const bodyTwo = parsed.noteBodies.find((body) => body.id === 'body-2')

      expect(bodyOne.aisles[0].aisleBodyId).toBe('shared-aisle-body')
      expect(bodyTwo.aisles[0].aisleBodyId).toBe('shared-aisle-body')
      expect(parsed.noteAisleBodies.find((body) => body.id === 'shared-aisle-body').markdown).toBe('shared aisle text')
    }))

  it('uses a changed non-authoritative linked aisle mirror as the shared aisle body on load', () =>
    withTempUserDataPath((userDataPath) => {
      const state = JSON.parse(serializedAppState())
      const space = state.domains[0].spaces[0]
      space.data.tabs.push({
        id: 'tab-2',
        title: 'Linked Tab',
        noteBodyId: 'body-2',
        activeSubTabId: null,
        subTabs: [],
      })
      state.noteAisleBodies = [{ id: 'shared-aisle-body', markdown: 'shared aisle text' }]
      state.noteBodies = [
        { id: 'body-1', aisles: [{ id: 'aisle-1', aisleBodyId: 'shared-aisle-body' }] },
        { id: 'body-2', aisles: [{ id: 'aisle-2', aisleBodyId: 'shared-aisle-body' }] },
      ]

      saveAppState(userDataPath, JSON.stringify(state))

      const { root, noteBodiesRegistry, aisleBodiesRegistry } = getStoredWorkspacePaths(userDataPath)
      const aisleBodyEntry = aisleBodiesRegistry.aisleBodies.find((body) => body.id === 'shared-aisle-body')
      const mirrorFile = noteBodiesRegistry.noteBodies
        .flatMap((body) => body.aisles)
        .find((aisle) => aisle.aisleBodyId === 'shared-aisle-body' && aisle.file !== aisleBodyEntry.file)?.file
      expect(aisleBodyEntry.contentHash).toEqual(expect.any(String))
      expect(mirrorFile).toBeTruthy()

      writeFileSync(path.join(root, mirrorFile), 'external mirror edit #Mirror', 'utf8')

      const result = loadAppStateResult(userDataPath)
      expect(result.ok).toBe(true)
      const parsed = JSON.parse(result.serializedState)
      const sharedAisleBody = parsed.noteAisleBodies.find((body) => body.id === 'shared-aisle-body')
      expect(sharedAisleBody.markdown).toBe('external mirror edit #Mirror')
      expect(sharedAisleBody.tags).toEqual(['Mirror'])
      expect(result.issues.some((issue) => issue.code === 'linked-aisle-mirror-auto-decoupled')).toBe(false)
    }))

  it('uses a changed duplicate whole-note mirror as the shared aisle body on load', () =>
    withTempUserDataPath((userDataPath) => {
      const state = JSON.parse(serializedAppState())
      const space = state.domains[0].spaces[0]
      space.data.tabs.push({
        id: 'tab-2',
        title: 'Duplicate Tab',
        noteBodyId: 'body-1',
        activeSubTabId: null,
        subTabs: [],
      })
      state.noteAisleBodies = [{ id: 'aisle-body-1', markdown: 'source text' }]

      saveAppState(userDataPath, JSON.stringify(state))

      const { root, spaceRoot, spaceManifest, aisleBodiesRegistry } = getStoredWorkspacePaths(userDataPath)
      const aisleBodyEntry = aisleBodiesRegistry.aisleBodies.find((body) => body.id === 'aisle-body-1')
      const duplicateFile = spaceManifest.tabs.find((tab) => tab.id === 'tab-2')?.homeNoteFile
      expect(aisleBodyEntry.contentHash).toEqual(expect.any(String))
      expect(duplicateFile).toBeTruthy()
      expect(path.relative(root, path.join(spaceRoot, duplicateFile)).split(path.sep).join('/')).not.toBe(aisleBodyEntry.file)

      writeFileSync(path.join(spaceRoot, duplicateFile), 'whole note mirror edit', 'utf8')

      const result = loadAppStateResult(userDataPath)
      expect(result.ok).toBe(true)
      const parsed = JSON.parse(result.serializedState)
      expect(parsed.noteAisleBodies.find((body) => body.id === 'aisle-body-1').markdown).toBe('whole note mirror edit')
    }))

  it('keeps the newest divergent linked aisle mirror and de-couples the older changed mirror', () =>
    withTempUserDataPath((userDataPath) => {
      const state = JSON.parse(serializedAppState())
      const space = state.domains[0].spaces[0]
      space.data.tabs.push({
        id: 'tab-2',
        title: 'Linked Tab',
        noteBodyId: 'body-2',
        activeSubTabId: null,
        subTabs: [],
      })
      state.noteAisleBodies = [{ id: 'shared-aisle-body', markdown: 'shared aisle text' }]
      state.noteBodies = [
        { id: 'body-1', aisles: [{ id: 'aisle-1', aisleBodyId: 'shared-aisle-body' }] },
        { id: 'body-2', aisles: [{ id: 'aisle-2', aisleBodyId: 'shared-aisle-body' }] },
      ]

      saveAppState(userDataPath, JSON.stringify(state))

      const { root, noteBodiesRegistry, aisleBodiesRegistry } = getStoredWorkspacePaths(userDataPath)
      const aisleBodyEntry = aisleBodiesRegistry.aisleBodies.find((body) => body.id === 'shared-aisle-body')
      const mirrorFile = noteBodiesRegistry.noteBodies
        .flatMap((body) => body.aisles)
        .find((aisle) => aisle.aisleBodyId === 'shared-aisle-body' && aisle.file !== aisleBodyEntry.file)?.file
      const canonicalPath = path.join(root, aisleBodyEntry.file)
      const mirrorPath = path.join(root, mirrorFile)
      writeFileSync(canonicalPath, 'older canonical edit #Older', 'utf8')
      writeFileSync(mirrorPath, 'newer mirror edit #Newer', 'utf8')
      utimesSync(canonicalPath, new Date(1_700_000_000_000), new Date(1_700_000_000_000))
      utimesSync(mirrorPath, new Date(1_700_000_100_000), new Date(1_700_000_100_000))

      const result = loadAppStateResult(userDataPath)
      expect(result.ok).toBe(true)
      const parsed = JSON.parse(result.serializedState)
      const issue = result.issues.find((candidate) => candidate.code === 'linked-aisle-mirror-auto-decoupled')
      const anchorAisleBody = parsed.noteAisleBodies.find((body) => body.id === 'shared-aisle-body')
      expect(anchorAisleBody.markdown).toBe('newer mirror edit #Newer')
      expect(anchorAisleBody.tags).toEqual(['Newer'])
      const decoupledBody = parsed.noteBodies.find((body) => body.id === 'body-1')
      const anchorBody = parsed.noteBodies.find((body) => body.id === 'body-2')
      const decoupledAisleBodyId = decoupledBody.aisles[0].aisleBodyId
      expect(anchorBody.aisles[0].aisleBodyId).toBe('shared-aisle-body')
      expect(decoupledAisleBodyId).not.toBe('shared-aisle-body')
      const decoupledAisleBody = parsed.noteAisleBodies.find((body) => body.id === decoupledAisleBodyId)
      expect(decoupledAisleBody.markdown).toBe('older canonical edit #Older')
      expect(decoupledAisleBody.tags).toEqual(['Older'])
      expect(parsed.messages).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: 'duplicate-auto-decoupled',
          status: 'unread',
          anchorPath: mirrorFile,
          decoupledPaths: [aisleBodyEntry.file],
        }),
      ]))
      expect(issue).toMatchObject({
        severity: 'warning',
        aisleBodyId: 'shared-aisle-body',
        anchorPath: mirrorFile,
        decoupledPaths: [aisleBodyEntry.file],
        candidateCount: 2,
        changedVersionCount: 2,
      })
    }))

  it('keeps linked mirrors together when multiple changed files have the same content', () =>
    withTempUserDataPath((userDataPath) => {
      const state = JSON.parse(serializedAppState())
      const space = state.domains[0].spaces[0]
      space.data.tabs.push({
        id: 'tab-2',
        title: 'Linked Tab',
        noteBodyId: 'body-2',
        activeSubTabId: null,
        subTabs: [],
      })
      state.noteAisleBodies = [{ id: 'shared-aisle-body', markdown: 'shared aisle text' }]
      state.noteBodies = [
        { id: 'body-1', aisles: [{ id: 'aisle-1', aisleBodyId: 'shared-aisle-body' }] },
        { id: 'body-2', aisles: [{ id: 'aisle-2', aisleBodyId: 'shared-aisle-body' }] },
      ]

      saveAppState(userDataPath, JSON.stringify(state))

      const { root, noteBodiesRegistry, aisleBodiesRegistry } = getStoredWorkspacePaths(userDataPath)
      const aisleBodyEntry = aisleBodiesRegistry.aisleBodies.find((body) => body.id === 'shared-aisle-body')
      const mirrorFile = noteBodiesRegistry.noteBodies
        .flatMap((body) => body.aisles)
        .find((aisle) => aisle.aisleBodyId === 'shared-aisle-body' && aisle.file !== aisleBodyEntry.file)?.file
      writeFileSync(path.join(root, aisleBodyEntry.file), 'same outside edit', 'utf8')
      writeFileSync(path.join(root, mirrorFile), 'same outside edit', 'utf8')

      const result = loadAppStateResult(userDataPath)
      const parsed = JSON.parse(result.serializedState)

      expect(result.issues.some((issue) => issue.code === 'linked-aisle-mirror-auto-decoupled')).toBe(false)
      expect(parsed.noteBodies.find((body) => body.id === 'body-1').aisles[0].aisleBodyId).toBe('shared-aisle-body')
      expect(parsed.noteBodies.find((body) => body.id === 'body-2').aisles[0].aisleBodyId).toBe('shared-aisle-body')
      expect(parsed.noteAisleBodies.find((body) => body.id === 'shared-aisle-body').markdown).toBe('same outside edit')
      expect(parsed.messages ?? []).toHaveLength(0)
    }))

  it('de-couples divergent duplicate whole-note mirrors and persists the message once', () =>
    withTempUserDataPath((userDataPath) => {
      const state = JSON.parse(serializedAppState())
      const space = state.domains[0].spaces[0]
      space.data.tabs.push({
        id: 'tab-2',
        title: 'Duplicate Tab',
        noteBodyId: 'body-1',
        activeSubTabId: null,
        subTabs: [],
      })

      saveAppState(userDataPath, JSON.stringify(state))

      const { root, spaceManifest, domainEntry, spaceEntry, aisleBodiesRegistry } = getStoredWorkspacePaths(userDataPath)
      const aisleBodyEntry = aisleBodiesRegistry.aisleBodies.find((body) => body.id === 'aisle-body-1')
      const duplicateHomeFile = spaceManifest.tabs.find((tab) => tab.id === 'tab-2').homeNoteFile
      const duplicateFile = path.posix.join('domains', domainEntry.path, spaceEntry.path, duplicateHomeFile)
      const canonicalPath = path.join(root, aisleBodyEntry.file)
      const duplicatePath = path.join(root, duplicateFile)
      writeFileSync(canonicalPath, 'older duplicate edit #Older', 'utf8')
      writeFileSync(duplicatePath, 'newer duplicate edit #Newer', 'utf8')
      utimesSync(canonicalPath, new Date(1_700_000_000_000), new Date(1_700_000_000_000))
      utimesSync(duplicatePath, new Date(1_700_000_100_000), new Date(1_700_000_100_000))

      const result = loadAppStateResult(userDataPath)
      expect(result.ok).toBe(true)
      const parsed = JSON.parse(result.serializedState)
      const parsedSpace = parsed.domains[0].spaces[0]
      const firstTab = parsedSpace.data.tabs.find((tab) => tab.id === 'tab-1')
      const secondTab = parsedSpace.data.tabs.find((tab) => tab.id === 'tab-2')
      const firstBody = parsed.noteBodies.find((body) => body.id === firstTab.noteBodyId)
      const firstAisleBody = parsed.noteAisleBodies.find((body) => body.id === firstBody.aisles[0].aisleBodyId)

      expect(secondTab.noteBodyId).toBe('body-1')
      expect(firstTab.noteBodyId).not.toBe('body-1')
      const linkedAisleBody = parsed.noteAisleBodies.find((body) => body.id === 'aisle-body-1')
      expect(linkedAisleBody.markdown).toBe('newer duplicate edit #Newer')
      expect(linkedAisleBody.tags).toEqual(['Newer'])
      expect(firstAisleBody.markdown).toBe('older duplicate edit #Older')
      expect(firstAisleBody.tags).toEqual(['Older'])
      expect(parsed.messages).toEqual([
        expect.objectContaining({
          type: 'duplicate-auto-decoupled',
          status: 'unread',
          anchorPath: duplicateFile,
          decoupledPaths: [aisleBodyEntry.file],
        }),
      ])

      parsed.messages[0].status = 'dismissed'
      saveAppState(userDataPath, JSON.stringify(parsed))
      const reloaded = JSON.parse(loadAppStateResult(userDataPath).serializedState)
      expect(reloaded.messages).toHaveLength(1)
      expect(reloaded.messages[0].signature).toBe(parsed.messages[0].signature)
      expect(reloaded.messages[0].status).toBe('dismissed')
    }))

  it('round-trips distinct aisle body markdown without collapsing sibling aisle files', () =>
    withTempUserDataPath((userDataPath) => {
      const state = JSON.parse(serializedAppState())
      state.noteBodies[0].aisles = [
        { id: 'aisle-home', aisleBodyId: 'body-home-aisle' },
        { id: 'aisle-two', aisleBodyId: 'body-second-aisle' },
      ]
      state.noteAisleBodies = [
        {
          id: 'body-home-aisle',
          markdown: 'left aisle draft 🚙',
          frontmatter: { created: '2024-01-01' },
        },
        { id: 'body-second-aisle', markdown: 'right aisle draft 🥺' },
      ]

      saveAppState(userDataPath, JSON.stringify(state))

      const { root, noteBodiesRegistry } = getStoredWorkspacePaths(userDataPath)
      const bodyRecord = noteBodiesRegistry.noteBodies.find((body) => body.id === 'body-1')
      expect(bodyRecord.aisles[0].file).toMatch(/\/home\/aisle 1--[a-f0-9]{6}\.md$/)
      expect(bodyRecord.aisles[1].file).toMatch(/\/home\/aisle 2--[a-f0-9]{6}\.md$/)
      expect(readFileSync(path.join(root, bodyRecord.aisles[0].file), 'utf8')).toContain('left aisle draft 🚙')
      expect(readFileSync(path.join(root, bodyRecord.aisles[0].file), 'utf8')).toContain('created: 2024-01-01')
      expect(readFileSync(path.join(root, bodyRecord.aisles[1].file), 'utf8')).toBe('right aisle draft 🥺')

      const result = loadAppStateResult(userDataPath)
      expect(result.ok).toBe(true)
      const parsed = JSON.parse(result.serializedState)
      expect(parsed.noteAisleBodies.find((body) => body.id === 'body-home-aisle').markdown).toBe('left aisle draft 🚙')
      expect(parsed.noteAisleBodies.find((body) => body.id === 'body-second-aisle').markdown).toBe('right aisle draft 🥺')
      expect(parsed.noteBodies[0].aisles.map((aisle) => getAisleMarkdown(parsed, aisle))).toEqual([
        'left aisle draft 🚙',
        'right aisle draft 🥺',
      ])
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
        { id: 'sub-renamed', title: 'Renamed Child', noteBodyId: 'body-sub-renamed' },
      ]
      space.data.deletedTabs = [
        {
          id: 'deleted-parent-entry',
          deletedAt: 10,
          tab: {
            id: 'deleted-parent',
            title: 'Deleted Parent',
            noteBodyId: 'body-deleted-parent',
            activeSubTabId: 'deleted-child',
            subTabs: [
              {
                id: 'deleted-child',
                title: 'Deleted Child',
                noteBodyId: 'body-deleted-child',
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
          },
        },
      ]
      state.noteBodies[0] = {
        ...state.noteBodies[0],
        aisles: [
          { id: 'aisle-1', aisleBodyId: 'aisle-1' },
          { id: 'aisle-2', aisleBodyId: 'aisle-2' },
        ],
      }
      state.noteBodies.push(
        { id: 'body-sub-renamed', aisles: [{ id: 'aisle-sub-renamed', aisleBodyId: 'aisle-sub-renamed' }] },
        { id: 'body-deleted-parent', aisles: [{ id: 'aisle-deleted-parent', aisleBodyId: 'aisle-deleted-parent' }] },
        { id: 'body-deleted-child', aisles: [{ id: 'aisle-deleted-child', aisleBodyId: 'aisle-deleted-child' }] },
        { id: 'body-deleted-loose', aisles: [{ id: 'aisle-deleted-loose', aisleBodyId: 'aisle-deleted-loose' }] },
      )
      state.noteAisleBodies = [
        {
          id: 'aisle-1',
          markdown: 'renamed parent body',
          frontmatter: {
            status: 'ready',
            due: null,
            starts: null,
            created: '2024-01-01',
          },
          frontmatterMeta: {
            templateId: 'template-1',
            templateDerived: true,
            computedFields: { created: 'createdAt' },
            templateRemovedFieldIds: ['field-2'],
          },
        },
        { id: 'aisle-2', markdown: 'second aisle survives' },
        { id: 'aisle-sub-renamed', markdown: 'renamed child body' },
        { id: 'aisle-deleted-parent', markdown: 'deleted parent body' },
        { id: 'aisle-deleted-child', markdown: 'deleted child body' },
        { id: 'aisle-deleted-loose', markdown: 'deleted loose body' },
      ]

      saveAppState(userDataPath, JSON.stringify(state))
      const result = loadAppStateResult(userDataPath)

      expect(result.ok).toBe(true)
      const parsed = JSON.parse(result.serializedState)
      const parsedDomain = parsed.domains.find((domain) => domain.id === 'domain-1')
      const parsedSpace = parsedDomain.spaces.find((candidate) => candidate.id === 'space-1')
      const parsedTab = parsedSpace.data.tabs.find((candidate) => candidate.id === 'tab-1')
      const parsedSubTab = parsedTab.subTabs.find((candidate) => candidate.id === 'sub-renamed')
      const bodyById = new Map(parsed.noteBodies.map((body) => [body.id, body]))
      const aisleBodyById = new Map(parsed.noteAisleBodies.map((body) => [body.id, body]))

      expect(parsedDomain.name).toBe('Renamed Domain')
      expect(parsedSpace.name).toBe('Renamed Space')
      expect(parsedTab).toMatchObject({
        id: 'tab-1',
        title: 'Renamed Parent',
        noteBodyId: 'body-1',
        activeSubTabId: 'sub-renamed',
      })
      expect(parsedSubTab).toMatchObject({
        id: 'sub-renamed',
        title: 'Renamed Child',
        noteBodyId: 'body-sub-renamed',
      })
      expect(bodyById.get('body-1')).toMatchObject({
        aisles: [
          { id: 'aisle-1', aisleBodyId: 'aisle-1' },
          { id: 'aisle-2', aisleBodyId: 'aisle-2' },
        ],
      })
      expect(aisleBodyById.get('aisle-1')).toMatchObject({
        markdown: 'renamed parent body',
        frontmatter: {
          status: 'ready',
          due: null,
          starts: null,
          created: '2024-01-01',
        },
        frontmatterMeta: {
          templateId: 'template-1',
          templateDerived: true,
          computedFields: { created: 'createdAt' },
          templateRemovedFieldIds: ['field-2'],
        },
      })
      expect(parsedSpace.data.deletedTabs[0]).toMatchObject({
        id: 'deleted-parent-entry',
        deletedAt: 10,
        tab: {
          id: 'deleted-parent',
          title: 'Deleted Parent',
          noteBodyId: 'body-deleted-parent',
          activeSubTabId: 'deleted-child',
          subTabs: [
            {
              id: 'deleted-child',
              title: 'Deleted Child',
              noteBodyId: 'body-deleted-child',
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
        },
      })
    }))

  it('caps generated storage path segments while preserving app titles and ids', () =>
    withTempUserDataPath((userDataPath) => {
      const longTitle = 'Very Long Cross Platform Folder Name With Emoji 👨‍👩‍👧‍👦 And Symbols <>:"/\\|?* '.repeat(4).trim()
      const state = JSON.parse(serializedAppState())
      state.domains[0].name = longTitle
      state.domains[0].spaces[0].name = longTitle
      state.domains[0].spaces[0].data.tabs[0].title = longTitle
      state.domains[0].spaces[0].data.tabs[0].subTabs = [
        { id: 'sub-long', title: longTitle, noteBodyId: 'body-sub-long' },
      ]
      state.domains[0].spaces[0].data.deletedTabs = [
        {
          id: 'deleted-tab-entry-long',
          deletedAt: 1,
          tab: {
            id: 'deleted-tab-long',
            title: longTitle,
            noteBodyId: 'body-deleted-tab',
            activeSubTabId: null,
            subTabs: [{ id: 'deleted-sub-long', title: longTitle, noteBodyId: 'body-deleted-sub' }],
          },
        },
      ]
      state.domains[0].spaces[0].data.deletedSubTabs = [
        {
          id: 'deleted-sub-entry-long',
          parentTabId: 'tab-1',
          parentTabTitle: longTitle,
          deletedAt: 2,
          subTab: { id: 'deleted-loose-sub-long', title: longTitle, noteBodyId: 'body-deleted-loose-sub' },
        },
      ]
      state.deletedSpaces = [
        {
          id: 'deleted-space-entry-long',
          domainId: 'domain-1',
          domainName: longTitle,
          deletedAt: 3,
          space: {
            id: 'deleted-space-long',
            name: longTitle,
            settings: { autoRemoveDeletedDays: 7 },
            data: {
              activeTabId: 'deleted-workspace-tab-long',
              tabs: [
                {
                  id: 'deleted-workspace-tab-long',
                  title: longTitle,
                  noteBodyId: 'body-deleted-workspace-long',
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
      state.noteBodies[0].aisles.push({ id: 'aisle-long', markdown: 'second aisle' })
      state.noteBodies.push(
        { id: 'body-sub-long', aisles: [{ id: 'aisle-sub-long', markdown: 'sub body' }] },
        { id: 'body-deleted-tab', aisles: [{ id: 'aisle-deleted-tab', markdown: 'deleted tab' }] },
        { id: 'body-deleted-sub', aisles: [{ id: 'aisle-deleted-sub', markdown: 'deleted sub' }] },
        { id: 'body-deleted-loose-sub', aisles: [{ id: 'aisle-deleted-loose-sub', markdown: 'deleted loose sub' }] },
        { id: 'body-deleted-workspace-long', aisles: [{ id: 'aisle-deleted-workspace-long', markdown: 'deleted workspace body' }] },
      )

      saveAppState(userDataPath, JSON.stringify(state))

      const root = userDataPath
      const rootManifest = readJson(path.join(root, 'manifest.json'))
      const workspaceIndex = readJson(path.join(root, rootManifest.files.workspaceIndex))
      const noteRegistry = readJson(path.join(root, rootManifest.files.noteRegistry))
      const domainEntry = workspaceIndex.domains[0]
      const domainManifest = readJson(path.join(root, 'domains', domainEntry.path, 'manifest.json'))
      const spaceEntry = domainManifest.spaces[0]
      const spaceRoot = path.join(root, 'domains', domainEntry.path, spaceEntry.path)
      const spaceManifest = readJson(path.join(spaceRoot, 'manifest.json'))
      const trashManifest = readJson(path.join(spaceRoot, 'trash', 'manifest.json'))
      const tab = spaceManifest.tabs[0]
      const bodyRecord = noteRegistry.noteBodies.find((body) => body.id === 'body-1')
      const deletedWorkspaceRecord = noteRegistry.noteBodies.find((body) => body.id === 'body-deleted-workspace-long')
      const generatedPaths = [
        `domains/${domainEntry.path}`,
        `domains/${domainEntry.path}/${spaceEntry.path}`,
        `domains/${domainEntry.path}/${spaceEntry.path}/${tab.path}`,
        `domains/${domainEntry.path}/${spaceEntry.path}/${tab.subTabs[0].path}`,
        bodyRecord.aisles[1].file,
        deletedWorkspaceRecord.aisles[0].file,
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
      expect(trashManifest.items[0].file).toBe(`${trashManifest.items[0].path}/home.md`)
      expect(trashManifest.items[0].subTabs[0].path).toMatch(new RegExp(`^${trashManifest.items[0].path}/.+--[a-f0-9]{6}\\.md$`))
      expect(trashManifest.items[0].subTabs[0].file).toBe(trashManifest.items[0].subTabs[0].path)
      expect(trashManifest.items[1].path).toMatch(/--[a-f0-9]{6}\.md$/)
      expect(trashManifest.items[1].file).toBe(trashManifest.items[1].path)
      expect(domainEntry.path).toMatch(/--[a-f0-9]{6}$/)
      expect(spaceEntry.path).toMatch(/--[a-f0-9]{6}$/)
      expect(tab.path).toMatch(/--[a-f0-9]{6}$/)
      expect(path.posix.basename(tab.subTabs[0].path)).toMatch(/--[a-f0-9]{6}\.md$/)
      expect(path.posix.basename(bodyRecord.aisles[1].file)).toMatch(/--[a-f0-9]{6}\.md$/)
      expect(deletedWorkspaceRecord.storageStatus).toBe('unlinked')
      generatedPaths.forEach(expectRelativePathWithinSegmentLimit)
    }))

  it('prunes unreferenced orphan note bodies while keeping deleted workspace bodies', () =>
    withTempUserDataPath((userDataPath) => {
      const state = JSON.parse(serializedAppState())
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
      state.noteAisleBodies.push(
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

      saveAppState(userDataPath, JSON.stringify(state))

      const root = userDataPath
      const rootManifest = readJson(path.join(root, 'manifest.json'))
      const noteRegistry = readJson(path.join(root, rootManifest.files.noteRegistry))
      const editorState = readJson(path.join(root, rootManifest.files.editorState))
      const noteBodyIds = noteRegistry.noteBodies.map((body) => body.id)
      const deletedWorkspaceRecord = noteRegistry.noteBodies.find((body) => body.id === 'body-deleted-workspace')
      const parsed = JSON.parse(loadAppStateResult(userDataPath).serializedState)

      expect(noteBodyIds).toContain('body-deleted-workspace')
      expect(noteBodyIds).not.toContain('body-orphan')
      expect(deletedWorkspaceRecord.storageStatus).toBe('unlinked')
      expect(editorState.headingCollapseState).toEqual({
        'body-deleted-workspace': {
          'aisle-deleted-workspace': ['deleted-heading'],
        },
      })
      expect(readFileSync(path.join(root, deletedWorkspaceRecord.aisles[0].file), 'utf8')).toBe('deleted workspace body')
      expect(parsed.noteBodies.some((body) => body.id === 'body-deleted-workspace')).toBe(true)
      expect(parsed.noteBodies.some((body) => body.id === 'body-orphan')).toBe(false)
    }))

  it('rejects a malformed current-schema topic-style profile', () =>
    withTempUserDataPath((userDataPath) => {
      const root = userDataPath
      mkdirSync(root, { recursive: true })
      writeFileSync(
        path.join(root, 'manifest.json'),
        JSON.stringify({
          schemaVersion: 1,
          topics: [{ id: 'topic-1', title: 'Topic' }],
          activeTopicId: 'topic-1',
        }),
        'utf8',
      )

      expect(loadAppStateResult(userDataPath)).toMatchObject({
        ok: false,
        serializedState: null,
        source: 'hybrid',
        error: 'Existing app state could not be loaded.',
        health: 'error',
        issues: [expect.objectContaining({ code: 'missing-root-split-files-map', severity: 'error' })],
      })
    }))

  for (const schemaVersion of [2, 3, 4, 999]) {
    it(`rejects unsupported schema ${schemaVersion} profiles`, () =>
      withTempUserDataPath((userDataPath) => {
        const root = userDataPath
        mkdirSync(root, { recursive: true })
        writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ schemaVersion }), 'utf8')

        expect(loadAppStateResult(userDataPath)).toMatchObject({
          ok: false,
          serializedState: null,
          source: 'hybrid',
          error: 'Existing app state could not be loaded.',
          schemaVersion,
          health: 'error',
          issues: [expect.objectContaining({ code: 'unsupported-root-manifest', severity: 'error' })],
        })
      }))
  }

  it('rejects current schema profiles missing required split files', () =>
    withTempUserDataPath((userDataPath) => {
      saveAppState(userDataPath, serializedAppState())
      const root = userDataPath
      const rootManifest = readJson(path.join(root, 'manifest.json'))
      rmSync(path.join(root, rootManifest.files.noteRegistry), { force: true })

      expect(loadAppStateResult(userDataPath)).toMatchObject({
        ok: false,
        serializedState: null,
        source: 'hybrid',
        health: 'error',
        issues: [expect.objectContaining({ code: 'missing-root-split-file', severity: 'error' })],
      })
    }))

  it('loads current schema profiles with optional editor split file missing', () =>
    withTempUserDataPath((userDataPath) => {
      const state = JSON.parse(serializedAppState())
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
      saveAppState(userDataPath, JSON.stringify(state))
      const root = userDataPath
      const rootManifest = readJson(path.join(root, 'manifest.json'))
      rmSync(path.join(root, rootManifest.files.editorState), { force: true })

      const result = loadAppStateResult(userDataPath)
      expect(result.ok).toBe(true)
      const parsed = JSON.parse(result.serializedState)
      expect(parsed.ui.settingsSection).toBe('toolbar')
      expect(parsed.ui.noteCursorLocations).toEqual({})
    }))

  it('rejects temporary wider schema 3 profiles', () =>
    withTempUserDataPath((userDataPath) => {
      saveAppState(userDataPath, serializedAppState())
      const root = userDataPath
      const rootManifest = readJson(path.join(root, 'manifest.json'))
      const appSettings = readJson(path.join(userDataPath, 'settings', 'app-settings.json'))
      const noteRegistry = readJson(path.join(root, rootManifest.files.noteRegistry))
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

      writeFileSync(path.join(root, 'appearance-settings.json'), `${JSON.stringify(appSettings, null, 2)}\n`, 'utf8')
      writeFileSync(path.join(root, 'shortcut-settings.json'), `${JSON.stringify(appSettings.hotkeys, null, 2)}\n`, 'utf8')
      writeFileSync(path.join(root, 'ui-preferences.json'), `${JSON.stringify(appSettings.ui, null, 2)}\n`, 'utf8')
      writeFileSync(path.join(root, 'note-bodies.json'), `${JSON.stringify({ noteBodies: noteRegistry.noteBodies }, null, 2)}\n`, 'utf8')
      writeFileSync(
        path.join(root, 'aisle-bodies.json'),
        `${JSON.stringify({ noteAisleBodies: noteRegistry.aisleBodies }, null, 2)}\n`,
        'utf8',
      )
      writeFileSync(path.join(root, 'orphan-note-bodies.json'), `${JSON.stringify({ noteBodies: [] }, null, 2)}\n`, 'utf8')
      writeFileSync(
        path.join(root, 'orphan-aisle-bodies.json'),
        `${JSON.stringify({ noteAisleBodies: [] }, null, 2)}\n`,
        'utf8',
      )
      writeFileSync(
        path.join(root, 'manifest.json'),
        `${JSON.stringify({ schemaVersion: 3, files: wideFiles }, null, 2)}\n`,
        'utf8',
      )
      rmSync(path.join(root, 'app-settings.json'), { force: true })
      rmSync(path.join(root, 'note-registry.json'), { force: true })

      const result = loadAppStateResult(userDataPath)
      expect(result.ok).toBe(false)
      expect(result.schemaVersion).toBe(3)
      expect(result.issues).toContainEqual(expect.objectContaining({ code: 'unsupported-root-manifest' }))
    }))

  it('fails existing profiles with provider conflict folders', () =>
    withTempUserDataPath((userDataPath) => {
      const root = userDataPath
      mkdirSync(path.join(root, 'topics 2'), { recursive: true })
      writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ schemaVersion: 1 }), 'utf8')

      expect(loadAppStateResult(userDataPath)).toMatchObject({
        ok: false,
        source: 'hybrid',
        conflicts: ['topics 2'],
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
      const root = userDataPath
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
      expect(parsed.domains[0].spaces[0].data.tabs[0].homeContent).toBeUndefined()
      expect(getAisleMarkdown(parsed, parsed.noteBodies[0].aisles[0])).toBe('')

      saveAppState(userDataPath, result.serializedState)
      expect(existsSync(path.join(spaceRoot, spaceManifest.tabs[0].homeNoteFile))).toBe(true)
    }))

  it('keeps markdown references for missing image assets with a warning', () =>
    withTempUserDataPath((userDataPath) => {
      const state = JSON.parse(serializedAppState())
      setFirstAisleBodyMarkdown(state, 'image ![pixel](data:image/png;base64,iVBORw0KGgo=)')
      saveAppState(userDataPath, JSON.stringify(state))
      rmSync(path.join(userDataPath, 'assets'), { recursive: true, force: true })

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
          path: expect.stringContaining('assets/'),
        }),
      ]))
      expect(getAisleMarkdown(parsed, parsed.noteBodies[0].aisles[0])).toContain('![pixel](')
      expect(getAisleMarkdown(parsed, parsed.noteBodies[0].aisles[0])).not.toContain('data:image/')
    }))

  it('loads and re-saves image assets as stable refs without inlining bytes', () =>
    withTempUserDataPath((userDataPath) => {
      const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])
      const asset = writeImageAssetToProfile(userDataPath, bytes, 'png')
      const state = JSON.parse(serializedAppState())
      setFirstAisleBodyMarkdown(state, `image ![pixel](${asset.url})`)

      saveAppState(userDataPath, JSON.stringify(state))

      const assetPath = path.join(userDataPath, asset.assetPath)
      expect(readFileSync(assetPath)).toEqual(bytes)

      const result = loadAppStateResult(userDataPath)
      const parsed = JSON.parse(result.serializedState)
      expect(getAisleMarkdown(parsed, parsed.noteBodies[0].aisles[0])).toContain('tabs-asset:///assets/')
      expect(getAisleMarkdown(parsed, parsed.noteBodies[0].aisles[0])).not.toContain('data:image/')

      saveAppState(userDataPath, result.serializedState)
      expect(readFileSync(assetPath)).toEqual(bytes)
    }))

  it('writes readable preview directives and image metadata to markdown files', () =>
    withTempUserDataPath((userDataPath) => {
      const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])
      const asset = writeImageAssetToProfile(userDataPath, bytes, 'png')
      const state = JSON.parse(serializedAppState())
      const previewToken = buildPreviewToken(state, {
        id: 'preview-1',
        target: { domainId: 'domain-1', spaceId: 'space-1', tabId: 'tab-1', subTabId: null },
      })
      setFirstAisleBodyMarkdown(state, `${previewToken}\n![pixel](${asset.url}#tabs-image=rotate=90,width=88)`)

      saveAppState(userDataPath, JSON.stringify(state))

      const { spaceRoot, spaceManifest } = getStoredWorkspacePaths(userDataPath)
      const markdownFile = path.join(spaceRoot, spaceManifest.tabs[0].homeNoteFile)
      const markdown = readFileSync(markdownFile, 'utf8')
      const result = loadAppStateResult(userDataPath)
      const parsed = JSON.parse(result.serializedState)
      const roundTrippedMarkdown = getAisleMarkdown(parsed, parsed.noteBodies[0].aisles[0])

      expect(markdown).toMatch(/!\[\[Tab--[0-9a-f]{6}\]\]/)
      expect(markdown).not.toContain('{{tabs-preview')
      expect(markdown).toContain('#tabs-image=width=88,rotate=90')
      expect(roundTrippedMarkdown).toContain('#tabs-image=width=88,rotate=90')
    }))

  it('prunes active image assets that are not referenced by saved markdown', () =>
    withTempUserDataPath((userDataPath) => {
      const keptBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 10, 20, 30])
      const staleBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 40, 50, 60])
      const keptAsset = writeImageAssetToProfile(userDataPath, keptBytes, 'png')
      const staleAsset = writeImageAssetToProfile(userDataPath, staleBytes, 'png')
      const state = JSON.parse(serializedAppState())
      setFirstAisleBodyMarkdown(state, `image ![kept](${keptAsset.url})`)

      saveAppState(userDataPath, JSON.stringify(state))

      expect(readFileSync(path.join(userDataPath, keptAsset.assetPath))).toEqual(keptBytes)
      expect(existsSync(path.join(userDataPath, staleAsset.assetPath))).toBe(false)
    }))

  it('keeps media assets referenced by escaped markdown link labels', () =>
    withTempUserDataPath((userDataPath) => {
      const keptBytes = Buffer.from([0x49, 0x44, 0x33, 10, 20, 30])
      const staleBytes = Buffer.from([0x49, 0x44, 0x33, 40, 50, 60])
      const keptAsset = writeAssetToProfile(userDataPath, keptBytes, 'mp3')
      const staleAsset = writeAssetToProfile(userDataPath, staleBytes, 'mp3')
      const state = JSON.parse(serializedAppState())
      setFirstAisleBodyMarkdown(state, `[song [demo\\].mp3](${keptAsset.url}#tabs-media=width=320)`)

      saveAppState(userDataPath, JSON.stringify(state))

      expect(readFileSync(path.join(userDataPath, keptAsset.assetPath))).toEqual(keptBytes)
      expect(existsSync(path.join(userDataPath, staleAsset.assetPath))).toBe(false)
      const stored = getStoredWorkspacePaths(userDataPath)
      const markdown = readFileSync(path.join(stored.spaceRoot, stored.spaceManifest.tabs[0].homeNoteFile), 'utf8')
      expect(markdown).toContain('#tabs-media=width=320')
    }))

  it('keeps image assets referenced only from deleted trash content', () =>
    withTempUserDataPath((userDataPath) => {
      const trashBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 70, 80, 90])
      const staleBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 100, 110, 120])
      const trashAsset = writeImageAssetToProfile(userDataPath, trashBytes, 'png')
      const staleAsset = writeImageAssetToProfile(userDataPath, staleBytes, 'png')
      const state = JSON.parse(serializedAppState())
      const space = state.domains[0].spaces[0]
      state.noteBodies.push({
        id: 'body-deleted-parent',
        aisles: [{ id: 'aisle-deleted-parent', aisleBodyId: 'aisle-body-deleted-parent' }],
      })
      state.noteAisleBodies.push({
        id: 'aisle-body-deleted-parent',
        markdown: `deleted ![trash](${trashAsset.url})`,
      })
      space.data.deletedTabs = [
        {
          id: 'deleted-parent-entry',
          deletedAt: 1,
          tab: {
            id: 'deleted-parent',
            title: 'Deleted Parent',
            noteBodyId: 'body-deleted-parent',
            activeSubTabId: null,
            subTabs: [],
          },
        },
      ]
      state.spaces = state.domains[0].spaces

      saveAppState(userDataPath, JSON.stringify(state))

      expect(readFileSync(path.join(userDataPath, trashAsset.assetPath))).toEqual(trashBytes)
      expect(existsSync(path.join(userDataPath, staleAsset.assetPath))).toBe(false)
    }))

  it('keeps media assets in trash until the trash entry is permanently removed', () =>
    withTempUserDataPath((userDataPath) => {
      const trashBytes = Buffer.from([0x49, 0x44, 0x33, 70, 80, 90])
      const trashAsset = writeAssetToProfile(userDataPath, trashBytes, 'mp3')
      const state = JSON.parse(serializedAppState())
      const space = state.domains[0].spaces[0]
      state.noteBodies.push({
        id: 'body-deleted-media',
        aisles: [{ id: 'aisle-deleted-media', aisleBodyId: 'aisle-body-deleted-media' }],
      })
      state.noteAisleBodies.push({
        id: 'aisle-body-deleted-media',
        markdown: `deleted [song](${trashAsset.url})`,
      })
      space.data.deletedTabs = [
        {
          id: 'deleted-media-entry',
          deletedAt: 1,
          tab: {
            id: 'deleted-media',
            title: 'Deleted Media',
            noteBodyId: 'body-deleted-media',
            activeSubTabId: null,
            subTabs: [],
          },
        },
      ]
      state.spaces = state.domains[0].spaces

      saveAppState(userDataPath, JSON.stringify(state))
      const assetPath = path.join(userDataPath, trashAsset.assetPath)
      expect(readFileSync(assetPath)).toEqual(trashBytes)

      space.data.deletedTabs = []
      saveAppState(userDataPath, JSON.stringify(state))
      expect(existsSync(assetPath)).toBe(false)
    }))

  it('loads and re-saves non-image asset links as stable refs', () =>
    withTempUserDataPath((userDataPath) => {
      const bytes = Buffer.from([0x25, 0x50, 0x44, 0x46, 1, 2, 3])
      const asset = writeAssetToProfile(userDataPath, bytes, 'pdf')
      const state = JSON.parse(serializedAppState())
      setFirstAisleBodyMarkdown(state, `[report](${asset.url})`)

      saveAppState(userDataPath, JSON.stringify(state))

      const assetPath = path.join(userDataPath, asset.assetPath)
      expect(readFileSync(assetPath)).toEqual(bytes)

      const result = loadAppStateResult(userDataPath)
      const parsed = JSON.parse(result.serializedState)
      expect(getAisleMarkdown(parsed, parsed.noteBodies[0].aisles[0])).toContain('tabs-asset:///assets/')

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
            activeSubTabId: null,
            subTabs: [],
          },
        },
      ]
      state.noteBodies.push({ id: 'body-deleted-parent', aisles: [{ id: 'aisle-deleted-parent', aisleBodyId: 'aisle-body-deleted-parent' }] })
      state.noteAisleBodies.push({ id: 'aisle-body-deleted-parent', markdown: 'deleted body' })
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
          },
        },
      ]
      state.noteBodies.push({ id: 'body-deleted-sub', aisles: [{ id: 'aisle-deleted-sub', aisleBodyId: 'aisle-body-deleted-sub' }] })
      state.noteAisleBodies.push({ id: 'aisle-body-deleted-sub', markdown: 'deleted sub body' })
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
      state.noteAisleBodies.push({ id: 'aisle-body-2', markdown: 'second' })
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
      state.noteAisleBodies.push({ id: 'aisle-body-2', markdown: 'second' })
      saveAppState(userDataPath, JSON.stringify(state))
      const rootManifest = readJson(path.join(userDataPath, 'manifest.json'))
      const workspaceIndex = readJson(path.join(userDataPath, rootManifest.files.workspaceIndex))
      writeFileSync(path.join(userDataPath, 'domains', workspaceIndex.domains[0].path, 'manifest.json'), '{bad', 'utf8')

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

  it('creates a blank space when a surviving domain has no readable spaces', () =>
    withTempUserDataPath((userDataPath) => {
      const state = JSON.parse(serializedAppState())
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
      saveAppState(userDataPath, JSON.stringify(state))
      const { domainRoot, domainManifest } = getStoredWorkspacePaths(userDataPath)
      rmSync(path.join(domainRoot, domainManifest.spaces[0].path), { recursive: true, force: true })

      const result = loadAppStateResult(userDataPath)
      const parsed = JSON.parse(result.serializedState)

      expect(result).toMatchObject({
        ok: true,
        health: 'warning',
        issues: expect.arrayContaining([
          expect.objectContaining({ code: 'missing-space-manifest', severity: 'warning' }),
          expect.objectContaining({ code: 'domain-has-no-readable-spaces', severity: 'warning' }),
        ]),
      })
      expect(parsed.domains).toHaveLength(1)
      expect(parsed.domains[0].id).toBe('domain-1')
      expect(parsed.domains[0].spaces).toHaveLength(1)
      expect(parsed.domains[0].spaces[0].id).not.toBe('space-1')
      expect(parsed.domains[0].spaces[0].data.tabs).toHaveLength(1)
      expect(parsed.deletedSpaces[0].space.id).toBe('deleted-space')
    }))

  it('creates a blank parent tab when a surviving space has no readable parents', () =>
    withTempUserDataPath((userDataPath) => {
      const state = JSON.parse(serializedAppState())
      state.domains[0].spaces[0].data.deletedTabs = [
        {
          id: 'deleted-parent-entry',
          tab: state.domains[0].spaces[0].data.tabs[0],
          deletedAt: 1,
        },
      ]
      saveAppState(userDataPath, JSON.stringify(state))
      const { spaceRoot, spaceManifest } = getStoredWorkspacePaths(userDataPath)
      writeFileSync(
        path.join(spaceRoot, 'manifest.json'),
        `${JSON.stringify({ ...spaceManifest, tabs: [], activeTabId: 'missing-tab' }, null, 2)}\n`,
        'utf8',
      )

      const result = loadAppStateResult(userDataPath)
      const parsed = JSON.parse(result.serializedState)
      const repairedSpace = parsed.domains[0].spaces[0]

      expect(result).toMatchObject({
        ok: true,
        health: 'warning',
        issues: expect.arrayContaining([
          expect.objectContaining({ code: 'space-has-no-readable-tabs', severity: 'warning' }),
        ]),
      })
      expect(repairedSpace.data.tabs).toHaveLength(1)
      expect(repairedSpace.data.tabs[0].title).toBe('tab')
      expect(repairedSpace.data.deletedTabs).toHaveLength(1)
      expect(repairedSpace.data.deletedTabs[0].tab.id).toBe('tab-1')

      saveAppState(userDataPath, result.serializedState)
      const repaired = getStoredWorkspacePaths(userDataPath)
      expect(repaired.spaceManifest.tabs).toHaveLength(1)
      expect(existsSync(path.join(repaired.spaceRoot, repaired.spaceManifest.tabs[0].homeNoteFile))).toBe(true)
    }))

  it('loads a blank notebook when no domains are readable', () =>
    withTempUserDataPath((userDataPath) => {
      saveAppState(userDataPath, serializedAppState())
      const rootManifest = readJson(path.join(userDataPath, 'manifest.json'))
      const workspaceIndex = readJson(path.join(userDataPath, rootManifest.files.workspaceIndex))
      const staleDomainRoot = path.join(userDataPath, 'domains', workspaceIndex.domains[0].path)
      writeFileSync(path.join(staleDomainRoot, 'manifest.json'), '{bad', 'utf8')

      const result = loadAppStateResult(userDataPath)
      const parsed = JSON.parse(result.serializedState)

      expect(result).toMatchObject({
        ok: true,
        source: 'hybrid',
        health: 'warning',
        issues: expect.arrayContaining([
          expect.objectContaining({ code: 'corrupt-domain-manifest', severity: 'warning' }),
          expect.objectContaining({ code: 'no-readable-domains', severity: 'warning' }),
        ]),
      })
      expect(parsed.domains).toHaveLength(1)
      expect(parsed.domains[0].spaces).toHaveLength(1)
      expect(parsed.domains[0].spaces[0].data.tabs).toHaveLength(1)

      saveAppState(userDataPath, result.serializedState)
      expect(existsSync(staleDomainRoot)).toBe(false)
    }))

  it('resolves single-aisle live notes to markdown files for reveal', () =>
    withTempUserDataPath((userDataPath) => {
      const state = JSON.parse(serializedAppState())
      state.domains[0].spaces[0].data.tabs[0].subTabs = [
        {
          id: 'subtab-1',
          title: 'subtab',
          noteBodyId: 'body-subtab',
        },
      ]
      state.noteBodies.push({ id: 'body-subtab', aisles: [{ id: 'aisle-subtab-1', aisleBodyId: 'aisle-body-subtab-1' }] })
      state.noteAisleBodies.push({
        id: 'aisle-body-subtab-1',
        markdown: 'subtab',
        tags: [],
        frontmatter: null,
        frontmatterStatus: 'none',
      })
      saveAppState(userDataPath, JSON.stringify(state))

      const home = resolveNoteLocationRevealPath(userDataPath, {
        type: 'live-note',
        location: { domainId: 'domain-1', spaceId: 'space-1', tabId: 'tab-1', subTabId: null },
      })
      const subtab = resolveNoteLocationRevealPath(userDataPath, {
        type: 'live-note',
        location: { domainId: 'domain-1', spaceId: 'space-1', tabId: 'tab-1', subTabId: 'subtab-1' },
      })

      expect(home.ok).toBe(true)
      expect(home.rootRelativePath.endsWith('.md')).toBe(true)
      expect(existsSync(home.absolutePath)).toBe(true)
      expect(statSync(home.absolutePath).isFile()).toBe(true)
      expect(subtab.ok).toBe(true)
      expect(subtab.rootRelativePath.endsWith('.md')).toBe(true)
      expect(existsSync(subtab.absolutePath)).toBe(true)
      expect(statSync(subtab.absolutePath).isFile()).toBe(true)
    }))

  it('resolves multi-aisle live notes to folders for reveal', () =>
    withTempUserDataPath((userDataPath) => {
      const state = JSON.parse(serializedAppState())
      state.noteBodies[0].aisles.push({ id: 'aisle-2', aisleBodyId: 'aisle-body-2' })
      state.noteAisleBodies.push({
        id: 'aisle-body-2',
        markdown: 'second aisle',
        tags: [],
        frontmatter: null,
        frontmatterStatus: 'none',
      })
      saveAppState(userDataPath, JSON.stringify(state))

      const resolved = resolveNoteLocationRevealPath(userDataPath, {
        type: 'live-note',
        location: { domainId: 'domain-1', spaceId: 'space-1', tabId: 'tab-1', subTabId: null },
      })

      expect(resolved.ok).toBe(true)
      expect(existsSync(resolved.absolutePath)).toBe(true)
      expect(statSync(resolved.absolutePath).isDirectory()).toBe(true)
    }))

  it('resolves scratchpad reveal targets by aisle count', () =>
    withTempUserDataPath((userDataPath) => {
      const state = JSON.parse(serializedAppState())
      state.scratchpad = { noteBodyId: 'scratchpad-body' }
      state.noteBodies.push({
        id: 'scratchpad-body',
        aisles: [{ id: 'scratchpad-aisle-1', aisleBodyId: 'scratchpad-aisle-body-1' }],
      })
      state.noteAisleBodies.push({
        id: 'scratchpad-aisle-body-1',
        markdown: 'scratchpad',
        tags: [],
        frontmatter: null,
        frontmatterStatus: 'none',
      })
      saveAppState(userDataPath, JSON.stringify(state))

      const single = resolveNoteLocationRevealPath(userDataPath, { type: 'scratchpad' })
      expect(single.ok).toBe(true)
      expect(single.rootRelativePath).toBe('scratchpad/scratchpad.md')
      expect(statSync(single.absolutePath).isFile()).toBe(true)

      state.noteBodies.find((body) => body.id === 'scratchpad-body').aisles.push({
        id: 'scratchpad-aisle-2',
        aisleBodyId: 'scratchpad-aisle-body-2',
      })
      state.noteAisleBodies.push({
        id: 'scratchpad-aisle-body-2',
        markdown: 'second scratchpad aisle',
        tags: [],
        frontmatter: null,
        frontmatterStatus: 'none',
      })
      saveAppState(userDataPath, JSON.stringify(state))

      const multi = resolveNoteLocationRevealPath(userDataPath, { type: 'scratchpad' })
      expect(multi.ok).toBe(true)
      expect(multi.rootRelativePath).toBe('scratchpad')
      expect(statSync(multi.absolutePath).isDirectory()).toBe(true)
    }))

})
