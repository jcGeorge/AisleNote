import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { DEFAULT_FRONTMATTER_SETTINGS } from '../frontmatter/frontmatter'
import { DEFAULT_NEWLINE_SHORTCUT_SETTINGS, DEFAULT_SHORTCUTS } from '../hotkeys/shortcuts'
import { buildAssetUrl } from '../markdown/image-asset-refs.js'
import { getAisleBodyId } from '../notes/note-markdown'
import { MARKDOWN_NOTE_REFERENCE_RE, resolveMarkdownNoteReferenceToken } from '../notes/note-references'
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
  it('strips wrapper folders and storage suffixes while importing into a new appended domain', async () => {
    const current = createState({ parent: 'current home' })
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
    const existingParent = state.domains[0].spaces[0].data.tabs[0]
    const importedDomain = state.domains[1]
    const importedSpace = importedDomain.spaces[0]
    const importedParent = importedSpace.data.tabs[0]

    expect(state.activeDomainId).toBe(current.activeDomainId)
    expect(state.activeSpaceId).toBe(current.activeSpaceId)
    expect(state.domains).toHaveLength(2)
    expect(markdownForTab(state, existingParent)).toBe('current home')
    expect(importedDomain.name).toBe('Domain')
    expect(importedDomain.id).not.toBe(current.domains[0].id)
    expect(importedSpace.name).toBe('Space')
    expect(importedSpace.id).not.toBe(current.domains[0].spaces[0].id)
    expect(importedParent.title).toBe('Parent')
    expect(importedParent.id).not.toBe(existingParent.id)
    expect(markdownForTab(state, importedParent)).toBe('# Imported')
    expect(frontmatterForTab(state, importedParent)).toEqual({ status: 'imported' })
    expect(summary).toMatchObject({
      domainsCreated: 1,
      spacesCreated: 1,
      parentsCreated: 1,
      subtabsCreated: 0,
      notesImported: 1,
    })
  })

  it('applies imported home notes only to empty parents created inside the isolated import', async () => {
    const current = createState({ parent: 'existing home' })
    const { state, summary } = await mergeMarkdownFolderImport(
      current,
      {
        sourceId: 'source',
        files: [{ relativePath: 'Domain/Space/Parent/home.md', markdown: 'imported home' }],
      },
      { createId: createIdGenerator() },
    )
    const existingParent = state.domains[0].spaces[0].data.tabs[0]
    const importedParent = state.domains[1].spaces[0].data.tabs[0]

    expect(markdownForTab(state, existingParent)).toBe('existing home')
    expect(markdownForTab(state, importedParent)).toBe('imported home')
    expect(importedParent.subTabs).toHaveLength(0)
    expect(summary.parentsCreated).toBe(1)
    expect(summary.subtabsCreated).toBe(0)
  })

  it('mirrors source domain names and allows duplicate subtab titles', async () => {
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

    expect(importedDomain.name).toBe('New Domain')
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

  it('creates separate appended domains for multiple source domains', async () => {
    const current = createState()
    const { state, summary } = await mergeMarkdownFolderImport(
      current,
      {
        sourceId: 'source',
        files: [
          { relativePath: 'Imports/Alpha Domain/Space/Parent/home.md', markdown: 'alpha home' },
          { relativePath: 'Imports/Alpha Domain/Second Space/Other/home.md', markdown: 'alpha other' },
          { relativePath: 'Imports/Beta Domain/Space/Parent/home.md', markdown: 'beta home' },
        ],
      },
      { createId: createIdGenerator() },
    )

    expect(state.domains.map((domain) => domain.name)).toEqual(['Domain', 'Alpha Domain', 'Beta Domain'])
    const alphaSpace = state.domains[1].spaces.find((space) => space.name === 'Space')
    const alphaSecondSpace = state.domains[1].spaces.find((space) => space.name === 'Second Space')
    const betaSpace = state.domains[2].spaces.find((space) => space.name === 'Space')

    expect(state.domains[1].spaces.map((space) => space.name).sort()).toEqual(['Second Space', 'Space'])
    expect(state.domains[2].spaces.map((space) => space.name)).toEqual(['Space'])
    expect(alphaSpace ? markdownForTab(state, alphaSpace.data.tabs[0]) : '').toBe('alpha home')
    expect(alphaSecondSpace ? markdownForTab(state, alphaSecondSpace.data.tabs[0]) : '').toBe('alpha other')
    expect(betaSpace ? markdownForTab(state, betaSpace.data.tabs[0]) : '').toBe('beta home')
    expect(summary).toMatchObject({
      domainsCreated: 2,
      spacesCreated: 3,
      parentsCreated: 3,
      notesImported: 3,
    })
  })

  it('never merges into existing duplicate domain, space, or parent names', async () => {
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
    const existingTabs = state.domains[0].spaces[0].data.tabs
    const importedParent = state.domains[1].spaces[0].data.tabs[0]

    expect(existingTabs.map((tab) => tab.id)).toEqual(['dup-a', 'dup-b'])
    expect(existingTabs.map((tab) => markdownForTab(state, tab))).toEqual(['', ''])
    expect(state.domains[1].name).toBe('Domain')
    expect(state.domains[1].spaces[0].name).toBe('Space')
    expect(importedParent.title).toBe('Dup')
    expect(markdownForTab(state, importedParent)).toBe('new dup')
    expect(summary.domainsCreated).toBe(1)
    expect(summary.spacesCreated).toBe(1)
    expect(summary.parentsCreated).toBe(1)
    expect(summary.warnings).toEqual([])
  })

  it('copies relative assets and rewrites local markdown note links to imported notes', async () => {
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
    const importedDomain = state.domains[1]
    const importedSpace = importedDomain.spaces[0]
    const parent = importedSpace.data.tabs.find((tab) => tab.title === 'Import')
    const markdown = parent ? markdownForTab(state, parent) : ''
    const tokens = [...markdown.matchAll(MARKDOWN_NOTE_REFERENCE_RE)]
      .map((match) => match[0])
      .filter((token) => resolveMarkdownNoteReferenceToken(state, token))

    expect(markdown).toContain(`![img](${importedAssetUrl})`)
    expect(markdown).toContain('[[Target|see target]]')
    expect(summary.assetsImported).toBe(1)
    expect(summary.warnings.some((warning) => warning.includes('missing.png'))).toBe(true)
    expect(tokens).toHaveLength(1)
    tokens.forEach((token) => {
      const resolved = resolveMarkdownNoteReferenceToken(state, token)
      expect(resolved?.payload.target.domainId).toBe(importedDomain.id)
      expect(resolved?.payload.target.spaceId).toBe(importedSpace.id)
      expect(resolved?.payload.target.tabId).toBe(parent?.id)
      expect(resolved?.payload.target.subTabId).toBe(parent?.subTabs[0]?.id)
    })
  })

  it('imports Markdown hierarchy ZIP files through the same converter', async () => {
    const zip = new JSZip()
    zip.file('myImports/Domain/Space/Zip Parent/home.md', '![img](./image.png)\n[[Target|target]]\n[go](./target.md)')
    zip.file('myImports/Domain/Space/Zip Parent/target.md', 'target body')
    zip.file('myImports/Domain/Space/Zip Parent/image.png', new Uint8Array([1, 2, 3]))
    zip.file('myImports/Domain/Space/Zip Parent/song.opus', new Uint8Array([4, 5, 6]))
    zip.file('myImports/Domain/Space/Zip Parent/clip.m4v', new Uint8Array([7, 8, 9]))
    const parsed = await parseMarkdownFolderZip(await zip.generateAsync({ type: 'uint8array' }))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.assets.get('myImports/Domain/Space/Zip Parent/song.opus')).toMatchObject({
      name: 'song.opus',
      mimeType: 'audio/ogg',
      extension: 'opus',
    })
    expect(parsed.assets.get('myImports/Domain/Space/Zip Parent/clip.m4v')).toMatchObject({
      name: 'clip.m4v',
      mimeType: 'video/mp4',
      extension: 'm4v',
    })

    const importedAssetUrl = buildAssetUrl('assets/from-zip.png')
    const { state, summary } = await mergeMarkdownFolderImport(createState(), parsed.payload, {
      createId: createIdGenerator(),
      readAsset: (relativePath) => parsed.assets.get(relativePath) ?? null,
      importAsset: () => importedAssetUrl,
    })
    const parent = state.domains[1].spaces[0].data.tabs.find((tab) => tab.title === 'Zip Parent')
    const markdown = parent ? markdownForTab(state, parent) : ''

    expect(markdown).toContain(`![img](${importedAssetUrl})`)
    expect(summary.notesImported).toBe(2)
    expect(summary.assetsImported).toBe(1)
    expect(markdown).toContain('[[Target|target]]')
    expect([...markdown.matchAll(MARKDOWN_NOTE_REFERENCE_RE)].filter((match) => resolveMarkdownNoteReferenceToken(state, match[0]))).toHaveLength(1)
  })

  it('keeps the current notebook unchanged and warns when no Markdown files are selected', async () => {
    const current = createState({ parent: 'current home' })
    const { state, summary } = await mergeMarkdownFolderImport(
      current,
      {
        sourceId: 'source',
        files: [{ relativePath: 'Domain/Space/Parent/image.png', markdown: 'not markdown' }],
      },
      { createId: createIdGenerator() },
    )

    expect(state.domains).toEqual(current.domains)
    expect(markdownForTab(state, state.domains[0].spaces[0].data.tabs[0])).toBe('current home')
    expect(summary.notesImported).toBe(0)
    expect(summary.warnings).toEqual(['selected folder did not contain Markdown files.'])
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
