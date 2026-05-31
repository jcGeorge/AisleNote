import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { DEFAULT_FRONTMATTER_SETTINGS } from '../frontmatter/frontmatter'
import { DEFAULT_NEWLINE_SHORTCUT_SETTINGS, DEFAULT_SHORTCUTS } from '../hotkeys/shortcuts'
import { buildAssetUrl } from '../markdown/image-asset-refs.js'
import { getAisleBodyId } from '../notes/note-markdown'
import { WIKI_NOTE_REFERENCE_RE, resolveWikiReferenceToken } from '../notes/note-references'
import { DEFAULT_UI_SETTINGS } from '../settings/defaults'
import type { AppState, Domain, Space, Tab } from '../types/app'
import { mergeMarkdownFolderImport, parseMarkdownFolderZip } from './markdown-folder-import'

function createIdGenerator() {
  let next = 0
  return () => {
    next += 1
    return `md-import-${next}`
  }
}

function createTabFixture(id: string, title: string): Tab {
  return {
    id,
    title,
    noteBodyId: `body-${id}`,
    activeSubTabId: null,
    subTabs: [],
  }
}

function createSpaceFixture(id: string, name: string, tabs: Tab[]): Space {
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

function createState(markdownByTabId: Record<string, string> = {}, tabs: Tab[] = [createTabFixture('parent', 'Parent')]): AppState {
  const space = createSpaceFixture('space', 'Space', tabs)
  const domain: Domain = { id: 'domain', name: 'Domain', activeSpaceId: space.id, spaces: [space] }
  const noteBodies = tabs.map((tab) => ({
    id: tab.noteBodyId,
    aisles: [{ id: `aisle-${tab.id}`, aisleBodyId: `aisle-body-${tab.id}` }],
  }))
  return {
    theme: 'dawn',
    activeDomainId: domain.id,
    domains: [domain],
    deletedDomains: [],
    deletedSpaces: [],
    scratchpad: { noteBodyId: 'scratchpad-body', activeAisleId: 'scratchpad-aisle' },
    noteBodies,
    noteAisleBodies: tabs.map((tab) => ({
      id: `aisle-body-${tab.id}`,
      markdown: markdownByTabId[tab.id] ?? '',
      frontmatter: null,
      frontmatterStatus: 'none',
    })),
    activeSpaceId: space.id,
    spaces: [space],
    hotkeys: {
      shortcuts: DEFAULT_SHORTCUTS,
      newlineShortcuts: DEFAULT_NEWLINE_SHORTCUT_SETTINGS,
    },
    frontmatter: DEFAULT_FRONTMATTER_SETTINGS,
    ui: DEFAULT_UI_SETTINGS,
  }
}

function markdownForTab(state: AppState, tab: Tab): string {
  const noteBody = state.noteBodies.find((body) => body.id === tab.noteBodyId)
  const aisleBodyId = noteBody?.aisles[0] ? getAisleBodyId(noteBody.aisles[0]) : ''
  return state.noteAisleBodies?.find((body) => body.id === aisleBodyId)?.markdown ?? ''
}

function frontmatterForTab(state: AppState, tab: Tab) {
  const noteBody = state.noteBodies.find((body) => body.id === tab.noteBodyId)
  const aisleBodyId = noteBody?.aisles[0] ? getAisleBodyId(noteBody.aisles[0]) : ''
  return state.noteAisleBodies?.find((body) => body.id === aisleBodyId)?.frontmatter ?? null
}

describe('mergeMarkdownFolderImport', () => {
  it('strips wrapper folders and storage suffixes before matching existing containers', async () => {
    const current = createState()
    const { state, summary } = await mergeMarkdownFolderImport(
      current,
      {
        sourceId: 'source',
        files: [
          {
            relativePath: 'myImports/Domain--abc123/Space/Parent/home.md',
            markdown: '---\nstatus: imported\n---\n# Imported',
          },
        ],
      },
      { createId: createIdGenerator() },
    )
    const parent = state.domains[0].spaces[0].data.tabs[0]

    expect(state.domains).toHaveLength(1)
    expect(state.domains[0].spaces).toHaveLength(1)
    expect(markdownForTab(state, parent)).toBe('# Imported')
    expect(frontmatterForTab(state, parent)).toEqual({ status: 'imported' })
    expect(summary).toMatchObject({
      domainsCreated: 0,
      spacesCreated: 0,
      parentsCreated: 0,
      subtabsCreated: 0,
      notesImported: 1,
    })
  })

  it('keeps non-empty existing home notes and imports home.md as an imported home subtab', async () => {
    const current = createState({ parent: 'existing home' })
    const { state, summary } = await mergeMarkdownFolderImport(
      current,
      {
        sourceId: 'source',
        files: [{ relativePath: 'Domain/Space/Parent/home.md', markdown: 'imported home' }],
      },
      { createId: createIdGenerator() },
    )
    const parent = state.domains[0].spaces[0].data.tabs[0]
    const importedHome = parent.subTabs[0]

    expect(markdownForTab(state, parent)).toBe('existing home')
    expect(importedHome?.title).toBe('imported home')
    expect(summary.subtabsCreated).toBe(1)
  })

  it('creates fallback imported domains and allows duplicate subtab titles', async () => {
    const current = createState()
    const { state, summary } = await mergeMarkdownFolderImport(
      current,
      {
        sourceId: 'source',
        files: [
          { relativePath: 'Imports/New Domain/New Space/New Parent/01-note.md', markdown: 'first' },
          { relativePath: 'Imports/New Domain/New Space/New Parent/note.md', markdown: 'second' },
          { relativePath: 'Imports/New Domain/New Space/New Parent/deep/path.md', markdown: 'deep' },
        ],
      },
      { createId: createIdGenerator() },
    )
    const importedDomain = state.domains[1]
    const parent = importedDomain.spaces[0].data.tabs[0]

    expect(importedDomain.name).toBe('imported domain 1')
    expect(importedDomain.spaces[0].name).toBe('New Space')
    expect(parent.title).toBe('New Parent')
    expect(parent.subTabs.map((subTab) => subTab.title)).toEqual(['note', 'deep / path', 'note'])
    expect(summary).toMatchObject({
      domainsCreated: 1,
      spacesCreated: 1,
      parentsCreated: 1,
      subtabsCreated: 3,
      notesImported: 3,
    })
  })

  it('creates a new parent instead of guessing when parent name matches are ambiguous', async () => {
    const current = createState({}, [
      createTabFixture('dup-a', 'Dup'),
      createTabFixture('dup-b', 'Dup'),
    ])
    const { state, summary } = await mergeMarkdownFolderImport(
      current,
      {
        sourceId: 'source',
        files: [{ relativePath: 'Domain/Space/Dup/home.md', markdown: 'new dup' }],
      },
      { createId: createIdGenerator() },
    )
    const tabs = state.domains[0].spaces[0].data.tabs

    expect(tabs).toHaveLength(3)
    expect(tabs[2].title).toBe('Dup')
    expect(markdownForTab(state, tabs[2])).toBe('new dup')
    expect(summary.parentsCreated).toBe(1)
    expect(summary.warnings[0]).toContain('matched more than once')
  })

  it('copies relative assets and rewrites simple wiki and markdown note links to imported notes', async () => {
    const current = createState()
    const importedAssetUrl = buildAssetUrl('assets/copied.png')
    const { state, summary } = await mergeMarkdownFolderImport(
      current,
      {
        sourceId: 'source',
        files: [
          {
            relativePath: 'Domain/Space/Import/home.md',
            markdown: '![img](./image.png)\n[[Target|see target]]\n[go](./target.md)\n[missing](./missing.png)',
          },
          { relativePath: 'Domain/Space/Import/target.md', markdown: 'target body' },
        ],
      },
      {
        createId: createIdGenerator(),
        readAsset: (relativePath) =>
          relativePath === 'Domain/Space/Import/image.png'
            ? { bytes: new Uint8Array([1, 2, 3]).buffer, name: 'image.png', mimeType: 'image/png', extension: 'png' }
            : null,
        importAsset: () => importedAssetUrl,
      },
    )
    const parent = state.domains[0].spaces[0].data.tabs.find((tab) => tab.title === 'Import')
    const markdown = parent ? markdownForTab(state, parent) : ''
    const tokens = [...markdown.matchAll(WIKI_NOTE_REFERENCE_RE)].map((match) => match[0])

    expect(markdown).toContain(`![img](${importedAssetUrl})`)
    expect(summary.assetsImported).toBe(1)
    expect(summary.warnings.some((warning) => warning.includes('missing.png'))).toBe(true)
    expect(tokens).toHaveLength(2)
    tokens.forEach((token) => {
      const resolved = resolveWikiReferenceToken(state, token)
      expect(resolved?.payload.target.tabId).toBe(parent?.id)
      expect(resolved?.payload.target.subTabId).toBe(parent?.subTabs[0]?.id)
    })
  })

  it('imports Markdown hierarchy ZIP files through the same converter', async () => {
    const zip = new JSZip()
    zip.file('myImports/Domain/Space/Zip Parent/home.md', '![img](./image.png)\n[[Target|target]]\n[go](./target.md)')
    zip.file('myImports/Domain/Space/Zip Parent/target.md', 'target body')
    zip.file('myImports/Domain/Space/Zip Parent/image.png', new Uint8Array([1, 2, 3]))
    const parsed = await parseMarkdownFolderZip(await zip.generateAsync({ type: 'uint8array' }))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const importedAssetUrl = buildAssetUrl('assets/from-zip.png')
    const { state, summary } = await mergeMarkdownFolderImport(createState(), parsed.payload, {
      createId: createIdGenerator(),
      readAsset: (relativePath) => parsed.assets.get(relativePath) ?? null,
      importAsset: () => importedAssetUrl,
    })
    const parent = state.domains[0].spaces[0].data.tabs.find((tab) => tab.title === 'Zip Parent')
    const markdown = parent ? markdownForTab(state, parent) : ''

    expect(markdown).toContain(`![img](${importedAssetUrl})`)
    expect(summary.notesImported).toBe(2)
    expect(summary.assetsImported).toBe(1)
    expect([...markdown.matchAll(WIKI_NOTE_REFERENCE_RE)]).toHaveLength(2)
  })

  it('rejects unsafe Markdown ZIP paths', async () => {
    const zip = new JSZip()
    zip.file('../bad.md', 'bad', { createFolders: false })

    await expect(parseMarkdownFolderZip(await zip.generateAsync({ type: 'uint8array' }))).resolves.toMatchObject({
      ok: false,
      error: 'Markdown ZIP paths must not contain traversal segments.',
    })
  })
})
