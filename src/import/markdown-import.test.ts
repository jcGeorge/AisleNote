import { describe, expect, it } from 'vitest'
import { getAisleMarkdown } from '../notes/note-markdown'
import { findNotebookNote } from '../state/notebook'
import { buildMarkdownImportState, importMarkdownNotebook, type MarkdownImportAssetPayload } from './markdown-import'

function deterministicIds() {
  let next = 0
  return () => {
    next += 1
    return `id-${next}`
  }
}

function getMarkdownForTitle(result: ReturnType<typeof buildMarkdownImportState>, title: string): string {
  const note = findNotebookNote(result.state.notebook.items, result.sources.find((source) => source.title === title)?.noteId ?? '')
  const body = result.state.noteBodies.find((candidate) => candidate.id === note?.note.noteBodyId)
  const aisle = body?.aisles[0]
  return aisle ? getAisleMarkdown(aisle, result.state.noteAisleBodies) : ''
}

function getImportedMarkdownForTitle(result: Awaited<ReturnType<typeof importMarkdownNotebook>>, title: string): string {
  const stack = [...result.state.notebook.items]
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

    expect(result.state.notebook.items.map((item) => item.title)).toEqual(['Books', 'Root'])
    const books = result.state.notebook.items[0]
    expect(books?.type).toBe('folder')
    if (books?.type === 'folder') {
      expect(books.children.map((item) => item.title)).toEqual(['Intro', 'Ontology'])
      expect(books.children[1]?.type).toBe('folder')
    }
    expect(result.state.notebook.activeNoteId).toBe(result.sources[0]?.noteId)
    expect(result.state.scratchpad?.noteBodyId).toBeTruthy()
    expect(result.summary).toMatchObject({ folders: 2, notes: 3, noteBodies: 3 })
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
    const result = await importMarkdownNotebook([
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
    const result = await importMarkdownNotebook([
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
    const result = await importMarkdownNotebook([
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
        return `tabs-asset:///${asset.relativePath}`
      },
    })
    const markdown = getImportedMarkdownForTitle(result, 'Etc')

    expect(markdown).toContain('![Pasted Graphic.png](tabs-asset:///Z-Assets/Pasted Graphic.png)')
    expect(markdown).toContain('![local](tabs-asset:///Ministry/local.png)')
    expect(markdown).toContain('[report](tabs-asset:///Ministry/Flag/docs/report.pdf)')
    expect(markdown).toContain('![[Missing.png]]')
    expect(imported).toHaveLength(3)
    expect(result.summary.importedAssets).toBe(3)
    expect(result.summary.missingAssets).toBe(1)
  })
})
