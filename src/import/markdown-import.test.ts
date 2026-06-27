import { describe, expect, it } from 'vitest'
import type { AppState, VaultFolder } from '../types/app'
import { getAisleMarkdown } from '../notes/note-markdown'
import { DEFAULT_SCRATCHPAD_MARKDOWN, createDefaultAppState } from '../state/default-app-state.js'
import { findVaultFolder, findVaultNote } from '../state/vault'
import {
  buildMarkdownImportState,
  importMarkdownIntoExistingVault,
  importMarkdownVault,
  type MarkdownImportAssetPayload,
} from './markdown-import'

function deterministicIds() {
  let next = 0
  return () => {
    next += 1
    return `id-${next}`
  }
}

function idSequence(ids: string[]) {
  let index = 0
  return () => ids[index++] ?? `id-${index}`
}

function getMarkdownForTitle(result: ReturnType<typeof buildMarkdownImportState>, title: string): string {
  const note = findVaultNote(result.state.vault.items, result.sources.find((source) => source.title === title)?.noteId ?? '')
  const body = result.state.noteBodies.find((candidate) => candidate.id === note?.note.noteBodyId)
  const aisle = body?.aisles[0]
  return aisle ? getAisleMarkdown(aisle, result.state.noteAisleBodies) : ''
}

function getImportedMarkdownForTitle(result: Awaited<ReturnType<typeof importMarkdownVault>>, title: string): string {
  const stack = [...result.state.vault.items]
  let noteSource = stack.shift()
  while (noteSource) {
    if (noteSource.type === 'note' && noteSource.title === title) break
    if (noteSource.type === 'folder') stack.unshift(...noteSource.children)
    noteSource = stack.shift()
  }
  if (!noteSource || noteSource.type !== 'note') return ''
  const body = result.state.noteBodies.find((candidate) => candidate.id === noteSource.noteBodyId)
  const aisle = body?.aisles[0]
  return aisle ? getAisleMarkdown(aisle, result.state.noteAisleBodies) : ''
}

function getMarkdownForNoteId(state: AppState, noteId: string): string {
  const note = findVaultNote(state.vault.items, noteId)
  const body = state.noteBodies.find((candidate) => candidate.id === note?.note.noteBodyId)
  const aisle = body?.aisles[0]
  return aisle ? getAisleMarkdown(aisle, state.noteAisleBodies) : ''
}

describe('Markdown folder import', () => {
  it('builds a deterministic folder tree and preserves the default scratchpad', () => {
    const result = buildMarkdownImportState([
      { relativePath: 'Root.md', markdown: 'root' },
      { relativePath: 'Books/Ontology/Thesis.md', markdown: 'thesis' },
      { relativePath: 'Books/Intro.md', markdown: 'intro' },
    ], {
      idGenerator: deterministicIds(),
      now: () => '2026-06-22T00:00:00.000Z',
    })

    expect(result.state.vault.items.map((item) => item.title)).toEqual(['Books', 'Root'])
    const books = result.state.vault.items[0]
    expect(books?.type).toBe('folder')
    if (books?.type === 'folder') {
      expect(books.children.map((item) => item.title)).toEqual(['Intro', 'Ontology'])
      expect(books.children[1]?.type).toBe('folder')
    }
    expect(result.state.vault.activeNoteId).toBe(result.sources[0]?.noteId)
    expect(result.state.vault.openTabs).toEqual([
      { noteId: result.sources[0]?.noteId, status: 'temporary' },
    ])
    expect(result.state.scratchpad?.noteBodyId).toBeTruthy()
    const scratchpadBody = result.state.noteBodies.find((body) => body.id === result.state.scratchpad?.noteBodyId)
    const scratchpadAisle = scratchpadBody?.aisles[0]
    expect(scratchpadAisle ? getAisleMarkdown(scratchpadAisle, result.state.noteAisleBodies) : '').toBe(
      DEFAULT_SCRATCHPAD_MARKDOWN,
    )
    expect(result.summary).toMatchObject({ folders: 2, notes: 3, noteBodies: 3 })
  })

  it('adds a Markdown import as a fresh top-level folder without replacing existing vault folders', async () => {
    const state = createDefaultAppState() as AppState
    const retainedNoteId = state.vault.activeNoteId
    state.vault.items = [
      ...state.vault.items,
      { type: 'folder', id: 'folder-projects', title: 'Projects', children: [] },
      { type: 'folder', id: 'existing-duplicate-folder', title: 'Import Source', children: [] },
    ]
    state.vault.openTabs = [{ noteId: retainedNoteId, status: 'retained' }]
    state.vault.deletedItems = [{
      id: 'deleted-1',
      deletedAt: 1,
      item: { type: 'folder', id: 'deleted-folder', title: 'Deleted', children: [] },
      originalParentFolderId: null,
      originalIndex: 1,
    }]
    const existingNoteBodies = state.noteBodies.length
    const existingAisleBodies = state.noteAisleBodies.length

    const result = await importMarkdownIntoExistingVault(state, [
      { relativePath: 'Intro.md', markdown: 'See [[Detail]].' },
      { relativePath: 'Nested/Detail.md', markdown: 'detail' },
    ], {
      rootName: 'Import Source',
      idGenerator: idSequence([
        'existing-duplicate-folder',
        'import-root',
        'import-note-intro',
        'import-body-intro',
        'import-aisle-intro',
        'import-aisle-body-intro',
        'import-folder-nested',
        'import-note-detail',
        'import-body-detail',
        'import-aisle-detail',
        'import-aisle-body-detail',
      ]),
      now: () => '2026-06-22T00:00:00.000Z',
    })

    const duplicateFolders = result.state.vault.items.filter(
      (item): item is VaultFolder => item.type === 'folder' && item.title === 'Import Source',
    )
    const importedFolder = findVaultFolder(result.state.vault.items, result.rootFolderId)?.folder

    expect(result.rootFolderId).toBe('import-root')
    expect(duplicateFolders.map((folder) => folder.id)).toEqual(['existing-duplicate-folder', 'import-root'])
    expect(importedFolder?.children.map((item) => item.title)).toEqual(['Intro', 'Nested'])
    expect(findVaultFolder(result.state.vault.items, 'folder-projects')?.folder.title).toBe('Projects')
    expect(result.state.vault.deletedItems).toEqual(state.vault.deletedItems)
    expect(result.state.vault.settings).toEqual(state.vault.settings)
    expect(result.state.scratchpad).toEqual(state.scratchpad)
    expect(result.state.noteBodies).toHaveLength(existingNoteBodies + 2)
    expect(result.state.noteAisleBodies).toHaveLength(existingAisleBodies + 2)
    expect(result.state.vault.activeNoteId).toBe('import-note-intro')
    expect(result.state.vault.openTabs).toEqual([
      { noteId: retainedNoteId, status: 'retained' },
      { noteId: 'import-note-intro', status: 'temporary' },
    ])
    expect(getMarkdownForNoteId(result.state, 'import-note-intro')).toContain('[Detail]')
    expect(result.summary).toMatchObject({ folders: 2, notes: 2, noteBodies: 2 })
  })

  it('splits valid frontmatter, migrates tags, and keeps invalid frontmatter in markdown', () => {
    const result = buildMarkdownImportState([
      {
        relativePath: 'Tagged.md',
        markdown: '---\ntags:\n  - Card\nstatus: draft\n---\nBody text',
      },
      {
        relativePath: 'Broken.md',
        markdown: '---\nstatus: [broken\n---\nBody text',
      },
    ], {
      idGenerator: deterministicIds(),
      now: () => '2026-06-22T00:00:00.000Z',
    })
    const taggedSource = result.sources.find((source) => source.title === 'Tagged')
    const brokenSource = result.sources.find((source) => source.title === 'Broken')
    const tagged = result.state.noteAisleBodies?.find((body) => body.id === taggedSource?.aisleBodyId)
    const broken = result.state.noteAisleBodies?.find((body) => body.id === brokenSource?.aisleBodyId)

    expect(tagged?.frontmatter).toEqual({ tags: ['Card'], status: 'draft' })
    expect(tagged?.frontmatterStatus).toBe('valid')
    expect(getMarkdownForTitle(result, 'Tagged')).toBe('#Card\n\nBody text')
    expect(broken?.frontmatterStatus).toBe('invalid')
    expect(getMarkdownForTitle(result, 'Broken')).toContain('status: [broken')
  })

  it('rewrites resolvable Obsidian note links and reports unresolved references', async () => {
    const result = await importMarkdownVault([
      { relativePath: 'Notes/Source.md', markdown: 'See [[Target|the target]] and ![[Target#Intro]] and [[Missing]].' },
      { relativePath: 'Notes/Target.md', markdown: '# Intro\nTarget body' },
    ], {
      idGenerator: deterministicIds(),
      now: () => '2026-06-22T00:00:00.000Z',
    })
    const markdown = getImportedMarkdownForTitle(result, 'Source')

    expect(markdown).toContain('[the target]')
    expect(markdown).toContain('![Intro]')
    expect(markdown).toContain('[[Missing]]')
    expect(result.summary.unresolvedReferences).toBe(1)
  })

  it('leaves ambiguous Obsidian note links unresolved with a warning', async () => {
    const result = await importMarkdownVault([
      { relativePath: 'A/Dupe.md', markdown: 'a' },
      { relativePath: 'B/Dupe.md', markdown: 'b' },
      { relativePath: 'Source.md', markdown: '[[Dupe]]' },
    ], {
      idGenerator: deterministicIds(),
      now: () => '2026-06-22T00:00:00.000Z',
    })

    expect(getImportedMarkdownForTitle(result, 'Source')).toBe('[[Dupe]]')
    expect(result.summary.unresolvedReferences).toBe(1)
    expect(result.summary.warnings[0]).toContain('Ambiguous note reference')
  })

  it('rewrites wiki assets and local Markdown asset links from selected and vault roots', async () => {
    const imported: MarkdownImportAssetPayload[] = []
    const assets: MarkdownImportAssetPayload[] = [
      {
        assetRootId: 'vault',
        relativePath: 'Z-Assets/Pasted Graphic.png',
        bytes: new Uint8Array([1]).buffer,
        fileName: 'Pasted Graphic.png',
        mimeType: 'image/png',
      },
      {
        assetRootId: 'source',
        relativePath: 'Ministry/local.png',
        bytes: new Uint8Array([2]).buffer,
        fileName: 'local.png',
        mimeType: 'image/png',
      },
      {
        assetRootId: 'source',
        relativePath: 'Ministry/Flag/docs/report.pdf',
        bytes: new Uint8Array([3]).buffer,
        fileName: 'report.pdf',
        mimeType: 'application/pdf',
      },
    ]
    const result = await importMarkdownVault([
      {
        relativePath: 'Ministry/Flag/Etc.md',
        markdown: '![[Pasted Graphic.png]]\n![local](../local.png)\n[report](docs/report.pdf)\n![[Missing.png]]',
      },
    ], {
      idGenerator: deterministicIds(),
      now: () => '2026-06-22T00:00:00.000Z',
      assetRoots: [
        { id: 'source', name: 'Christianity', sourceBasePath: '' },
        { id: 'vault', name: 'Obsidian', sourceBasePath: 'Christianity' },
      ],
      assets,
      importAsset: async (asset) => {
        imported.push(asset)
        return `aislenote-asset:///${asset.relativePath}`
      },
    })
    const markdown = getImportedMarkdownForTitle(result, 'Etc')

    expect(markdown).toContain('![Pasted Graphic.png](aislenote-asset:///Z-Assets/Pasted Graphic.png)')
    expect(markdown).toContain('![local](aislenote-asset:///Ministry/local.png)')
    expect(markdown).toContain('[report](aislenote-asset:///Ministry/Flag/docs/report.pdf)')
    expect(markdown).toContain('![[Missing.png]]')
    expect(imported).toHaveLength(3)
    expect(result.summary.importedAssets).toBe(3)
    expect(result.summary.missingAssets).toBe(1)
  })
})
