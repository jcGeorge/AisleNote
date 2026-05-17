import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadAppStateResult, saveAppState } from './app-state-storage.mjs'
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
    activeSpaceId: space.id,
    spaces: [space],
  })
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
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
    }))

  it('writes v2 human-readable domain paths without synced backups or note body folders', () =>
    withTempUserDataPath((userDataPath) => {
      saveAppState(userDataPath, serializedAppState())

      const root = path.join(userDataPath, 'notes-data')
      const manifest = readJson(path.join(root, 'manifest.json'))

      expect(manifest.schemaVersion).toBe(2)
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

      expect(loadAppStateResult(userDataPath)).toEqual({
        ok: false,
        serializedState: null,
        source: 'hybrid',
        error: 'Existing app state could not be loaded.',
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

  it('returns a failed result for an existing corrupt profile', () =>
    withTempUserDataPath((userDataPath) => {
      const root = path.join(userDataPath, 'notes-data')
      mkdirSync(root, { recursive: true })
      writeFileSync(path.join(root, 'manifest.json'), '{nope', 'utf8')

      expect(loadAppStateResult(userDataPath)).toEqual({
        ok: false,
        serializedState: null,
        source: 'hybrid',
        error: 'Existing app state could not be loaded.',
      })
    }))

  it('returns a failed result for an unsupported existing profile', () =>
    withTempUserDataPath((userDataPath) => {
      const root = path.join(userDataPath, 'notes-data')
      mkdirSync(root, { recursive: true })
      writeFileSync(path.join(root, 'manifest.json'), '{"schemaVersion":999}', 'utf8')

      expect(loadAppStateResult(userDataPath)).toEqual({
        ok: false,
        serializedState: null,
        source: 'hybrid',
        error: 'Existing app state could not be loaded.',
      })
    }))
})
