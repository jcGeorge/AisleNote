import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { DEFAULT_FRONTMATTER_SETTINGS } from '../frontmatter/frontmatter'
import { DEFAULT_NEWLINE_SHORTCUT_SETTINGS, DEFAULT_SHORTCUTS } from '../hotkeys/shortcuts'
import { buildAssetUrl } from '../markdown/image-asset-refs.js'
import { registerAssetBytes } from '../markdown/image-asset-registry'
import { getAisleMarkdown } from '../notes/note-markdown'
import { DEFAULT_UI_SETTINGS } from '../settings/defaults'
import type { AppState, FrontmatterSettings, NoteAisleBody, NoteBody } from '../types/app'
import {
  NOTEBOOK_ARCHIVE_MANIFEST,
  buildNotebookArchive,
  materializeNotebookImportAssets,
  mergeImportedNotebookState,
  parseNotebookArchive,
} from './notebook-archive'

function createIdGenerator() {
  let next = 0
  return () => {
    next += 1
    return `notebook-import-id-${next}`
  }
}

function createFrontmatterSettings(): FrontmatterSettings {
  return {
    templates: [
      {
        id: 'template',
        name: 'Imported template',
        fields: [
          { id: 'field', key: 'status', type: 'text', defaultValue: 'draft', computed: 'none' },
        ],
      },
    ],
    settingsTemplateId: 'template',
    lastAppliedTemplateId: 'template',
  }
}

function noteBody(id: string, aisles: NoteBody['aisles']): NoteBody {
  return { id, aisles }
}

function aisleBody(id: string, markdown: string): NoteAisleBody {
  return { id, markdown, frontmatter: null, frontmatterStatus: 'none' }
}

function createNotebookState(): AppState {
  const firstTab = {
    id: 'tab',
    title: 'Aisle 1--abcxyz',
    noteBodyId: 'body-home',
    activeSubTabId: 'sub',
    subTabs: [
      { id: 'sub', title: 'Same Name', noteBodyId: 'body-sub' },
      { id: 'sub-2', title: 'Same Name', noteBodyId: 'body-shared' },
    ],
  }
  const secondTab = {
    id: 'tab-2',
    title: 'Aisle 1--abcxyz',
    noteBodyId: 'body-shared',
    activeSubTabId: null,
    subTabs: [],
  }
  const space = {
    id: 'space',
    name: 'Space',
    settings: { autoRemoveDeletedDays: 30 },
    data: {
      activeTabId: 'tab',
      tabs: [firstTab, secondTab],
      deletedTabs: [
        {
          id: 'deleted-tab-entry',
          deletedAt: 10,
          tab: {
            id: 'deleted-tab',
            title: 'Deleted',
            noteBodyId: 'body-deleted',
            activeSubTabId: null,
            subTabs: [],
          },
        },
      ],
      deletedSubTabs: [],
    },
  }
  return {
    theme: 'dark',
    activeDomainId: 'domain',
    domains: [{ id: 'domain', name: 'Domain', activeSpaceId: 'space', spaces: [space] }],
    deletedDomains: [],
    deletedSpaces: [],
    scratchpad: { noteBodyId: 'body-scratchpad', activeAisleId: 'aisle-scratchpad' },
    noteBodies: [
      noteBody('body-home', [
        { id: 'aisle-home', aisleBodyId: 'aisle-body-home' },
        { id: 'aisle-home-extra', aisleBodyId: 'aisle-body-home-extra' },
      ]),
      noteBody('body-sub', [{ id: 'aisle-sub', aisleBodyId: 'aisle-body-sub' }]),
      noteBody('body-shared', [
        { id: 'aisle-shared-a', aisleBodyId: 'aisle-body-shared' },
        { id: 'aisle-shared-b', aisleBodyId: 'aisle-body-shared' },
      ]),
      noteBody('body-deleted', [{ id: 'aisle-deleted', aisleBodyId: 'aisle-body-deleted' }]),
      noteBody('body-scratchpad', [{ id: 'aisle-scratchpad', aisleBodyId: 'aisle-body-scratchpad' }]),
    ],
    noteAisleBodies: [
      aisleBody('aisle-body-home', `home with asset [report](${buildAssetUrl('assets/report.pdf')})`),
      aisleBody('aisle-body-home-extra', 'second aisle'),
      aisleBody('aisle-body-sub', 'subtab body'),
      aisleBody('aisle-body-shared', 'shared body'),
      aisleBody('aisle-body-deleted', 'deleted body'),
      aisleBody('aisle-body-scratchpad', 'scratchpad body'),
    ],
    activeSpaceId: 'space',
    spaces: [space],
    hotkeys: {
      shortcuts: DEFAULT_SHORTCUTS,
      newlineShortcuts: DEFAULT_NEWLINE_SHORTCUT_SETTINGS,
    },
    frontmatter: createFrontmatterSettings(),
    ui: {
      ...DEFAULT_UI_SETTINGS,
      noteCursorLocations: {},
      headingCollapseState: {},
    },
  }
}

describe('notebook archive', () => {
  it('exports a readable tabs-notebook manifest with collision-safe paths and multi-aisle files', async () => {
    registerAssetBytes('assets/report.pdf', new Uint8Array([1, 2, 3]), 'application/pdf')
    const exported = await buildNotebookArchive({ state: createNotebookState(), exportedAt: '2026-05-29T00:00:00.000Z' })
    const zip = await JSZip.loadAsync(exported.bytes)
    const manifest = JSON.parse(await zip.file(NOTEBOOK_ARCHIVE_MANIFEST)!.async('string'))
    const tabFiles = manifest.domains[0].spaces[0].data.tabs.map((tab: { homeFile: string }) => tab.homeFile)
    const firstBody = manifest.noteBodies.find((body: { id: string }) => body.id === 'body-home')
    const sharedBody = manifest.noteBodies.find((body: { id: string }) => body.id === 'body-shared')

    expect(manifest.format).toBe('tabs-notebook')
    expect(manifest.version).toBe(1)
    expect(manifest).not.toHaveProperty('settings')
    expect(tabFiles[0]).toMatch(/home\.md$/)
    expect(new Set(tabFiles).size).toBe(tabFiles.length)
    expect(firstBody.aisles.map((aisle: { file: string }) => aisle.file)).toHaveLength(2)
    expect(sharedBody.aisles[0].file).toBe(sharedBody.aisles[1].file)
    expect(manifest.assets[0].file).toMatch(/^assets\/report\.pdf$/)
    expect(zip.file(manifest.assets[0].file)).not.toBeNull()
    expect(zip.file(manifest.scratchpad.files[0])).not.toBeNull()
  })

  it('parses, materializes assets, and merges imported domains without applying user settings', async () => {
    registerAssetBytes('assets/report.pdf', new Uint8Array([1, 2, 3]), 'application/pdf')
    const current = createNotebookState()
    current.theme = 'dawn'
    current.frontmatter = DEFAULT_FRONTMATTER_SETTINGS
    current.noteAisleBodies = current.noteAisleBodies?.map((body) =>
      body.id === 'aisle-body-scratchpad' ? { ...body, markdown: 'current scratchpad body' } : body,
    )
    const exported = await buildNotebookArchive({ state: createNotebookState() })
    const parsed = await parseNotebookArchive(exported.bytes)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const materialized = await materializeNotebookImportAssets(parsed.archive, {
      importAsset: (asset) => buildAssetUrl(`assets/imported-${asset.extension}`),
    })
    const merged = mergeImportedNotebookState(current, materialized, {
      createId: createIdGenerator(),
    })
    const importedDomain = merged.state.domains[1]
    const importedHomeBody = merged.state.noteBodies.find((body) => body.id === importedDomain.spaces[0].data.tabs[0].noteBodyId)
    const importedHomeMarkdown = importedHomeBody
      ? getAisleMarkdown(importedHomeBody.aisles[0], merged.state.noteAisleBodies)
      : ''

    expect(merged.state.domains).toHaveLength(2)
    expect(importedDomain.id).not.toBe('domain')
    expect(importedDomain.spaces[0].id).not.toBe('space')
    expect(merged.state.theme).toBe('dawn')
    expect(merged.state.scratchpad).toEqual(current.scratchpad)
    expect(merged.state.frontmatter.templates.some((template) => template.name === 'Imported template')).toBe(true)
    expect(importedHomeMarkdown).toContain(buildAssetUrl('assets/imported-pdf'))
    expect(merged.state.noteAisleBodies?.some((body) => body.markdown === 'scratchpad body')).toBe(false)

    const mergedWithOptions = mergeImportedNotebookState(current, materialized, {
      includeScratchpad: true,
      createId: createIdGenerator(),
    })
    const scratchpadBody = mergedWithOptions.state.noteBodies.find((body) => body.id === mergedWithOptions.state.scratchpad?.noteBodyId)
    const scratchpadMarkdown = scratchpadBody
      ? getAisleMarkdown(scratchpadBody.aisles[0], mergedWithOptions.state.noteAisleBodies)
      : ''

    expect(mergedWithOptions.state.theme).toBe('dawn')
    expect(mergedWithOptions.summary.appliedScratchpad).toBe(true)
    expect(scratchpadMarkdown).toBe('scratchpad body')
  })

  it('rejects unsafe, unsupported, and incomplete archives', async () => {
    const exported = await buildNotebookArchive({ state: createNotebookState() })
    const validZip = await JSZip.loadAsync(exported.bytes)
    const manifest = JSON.parse(await validZip.file(NOTEBOOK_ARCHIVE_MANIFEST)!.async('string'))

    const traversalZip = new JSZip()
    traversalZip.file(NOTEBOOK_ARCHIVE_MANIFEST, JSON.stringify(manifest))
    traversalZip.file('../evil.md', 'nope')
    const traversalResult = await parseNotebookArchive(await traversalZip.generateAsync({ type: 'uint8array' }))
    expect(traversalResult.ok).toBe(false)
    if (traversalResult.ok) throw new Error('expected traversal archive to fail')
    expect(traversalResult.issues.some((issue) => issue.code === 'path-traversal' || issue.code === 'absolute-path')).toBe(true)

    const unsupportedZip = new JSZip()
    unsupportedZip.file(NOTEBOOK_ARCHIVE_MANIFEST, JSON.stringify({ ...manifest, version: 999 }))
    const unsupportedResult = await parseNotebookArchive(await unsupportedZip.generateAsync({ type: 'uint8array' }))
    expect(unsupportedResult.ok).toBe(false)
    if (unsupportedResult.ok) throw new Error('expected unsupported archive to fail')
    expect(unsupportedResult.issues.some((issue) => issue.code === 'unsupported-version')).toBe(true)

    const missingZip = await JSZip.loadAsync(exported.bytes)
    missingZip.remove(manifest.noteAisleBodies[0].file)
    const missingResult = await parseNotebookArchive(await missingZip.generateAsync({ type: 'uint8array' }))
    expect(missingResult.ok).toBe(false)
    if (missingResult.ok) throw new Error('expected incomplete archive to fail')
    expect(missingResult.issues.some((issue) => issue.code === 'missing-file')).toBe(true)
  })
})
