import { describe, expect, it, vi } from 'vitest'
import {
  getTableOfContentsLinksFromDoc,
  getTableOfContentsLinksFromMarkdown,
} from './table-of-contents-links'
import type { ResolvedMarkdownNoteReference } from '../notes/note-references'

function markdownReference(token: string, embed = false): ResolvedMarkdownNoteReference {
  const isPreviewTarget = token.includes('Preview--def456')
  const label = isPreviewTarget ? 'Preview' : 'Linked'
  const destination = isPreviewTarget ? 'Preview--def456' : 'Linked--abc123'
  const noteId = isPreviewTarget ? 'note-preview' : 'note-linked'
  return {
    token,
    parsed: {
      token,
      embed,
      label,
      destination,
      target: destination,
      noteHandle: destination,
      suffixHandle: '',
    },
    payload: {
      id: `${embed ? 'markdown-preview' : 'markdown-link'}:${destination}`,
      target: { noteId },
    },
    target: { noteId },
    label,
    canonicalTarget: destination,
    canonicalToken: `${embed ? '!' : ''}[${label}](${destination})`,
  }
}

function docWithTextNodes(nodes: Array<{ text: string; pos: number; href?: string }>) {
  return {
    descendants(callback: (node: unknown, pos: number) => void) {
      nodes.forEach((node) => {
        callback(
          {
            isText: true,
            text: node.text,
            marks: node.href ? [{ type: { name: 'link' }, attrs: { href: node.href } }] : [],
          },
          node.pos,
        )
      })
    },
  }
}

describe('table of contents link collection', () => {
  it('collects note links, url links, and note previews from markdown', () => {
    const resolve = vi.fn((token: string) =>
      token.includes('Linked--abc123') || token.includes('Preview--def456')
        ? markdownReference(token, token.startsWith('!'))
        : null,
    )
    const links = getTableOfContentsLinksFromMarkdown(
      'aisle-a',
      '[Linked](Linked--abc123) and [site](https://example.com/path) and ![Preview](Preview--def456)',
      resolve,
    )

    expect(links.map((link) => [link.kind, link.label, link.href ?? link.target?.noteId])).toEqual([
      ['note-link', 'Linked', 'note-linked'],
      ['url-link', 'site', 'https://example.com/path'],
      ['note-preview', 'Preview', 'note-preview'],
    ])
    expect(links.map((link) => link.key)).toEqual([
      'aisle-a|link|0',
      'aisle-a|link|1',
      'aisle-a|link|2',
    ])
  })

  it('ignores headings-looking links inside fenced markdown code', () => {
    const resolve = vi.fn((token: string) =>
      token.includes('Linked--abc123') || token.includes('Preview--def456')
        ? markdownReference(token, token.startsWith('!'))
        : null,
    )
    const links = getTableOfContentsLinksFromMarkdown(
      'aisle-a',
      '```\n[Linked](Linked--abc123)\n[site](https://example.com)\n```\n\n<https://open.example>',
      resolve,
    )

    expect(links.map((link) => [link.kind, link.label])).toEqual([
      ['url-link', 'https://open.example/'],
    ])
  })

  it('collects markdown note source and external link marks from ProseMirror docs', () => {
    const resolve = vi.fn((token: string) =>
      token.includes('Linked--abc123') || token.includes('Preview--def456')
        ? markdownReference(token, token.startsWith('!'))
        : null,
    )
    const links = getTableOfContentsLinksFromDoc(
      'aisle-a',
      docWithTextNodes([
        { text: 'Linked', pos: 1, href: 'Linked--abc123' },
        { text: 'visible', pos: 25, href: 'https://example.com' },
        { text: '![Preview](Preview--def456)', pos: 40 },
      ]),
      resolve,
    )

    expect(links.map((link) => [link.kind, link.from, link.to])).toEqual([
      ['note-link', 1, 7],
      ['url-link', 25, 32],
      ['note-preview', 40, 67],
    ])
  })

  it('prunes duplicate destinations while preserving first appearance order', () => {
    const resolve = vi.fn((token: string) => token.includes('Linked--abc123') ? markdownReference(token, token.startsWith('!')) : null)
    const links = getTableOfContentsLinksFromMarkdown(
      'aisle-a',
      '[Linked](Linked--abc123) and ![Linked again](Linked--abc123) and [first](https://example.com) and <https://example.com/>',
      resolve,
    )

    expect(links.map((link) => [link.kind, link.label, link.href ?? link.target?.noteId])).toEqual([
      ['note-link', 'Linked', 'note-linked'],
      ['url-link', 'first', 'https://example.com/'],
    ])
    expect(links.map((link) => link.key)).toEqual([
      'aisle-a|link|0',
      'aisle-a|link|1',
    ])
  })

  it('does not try to resolve ordinary external link marks as note references', () => {
    const resolve = vi.fn(() => null)
    const links = getTableOfContentsLinksFromDoc(
      'aisle-a',
      docWithTextNodes([
        { text: 'copy', pos: 1, href: 'https://lucide.dev/icons/files' },
        { text: 'tableOfContents', pos: 12, href: 'https://lucide.dev/icons/table-of-contents' },
      ]),
      resolve,
    )

    expect(resolve).not.toHaveBeenCalled()
    expect(links.map((link) => [link.kind, link.label, link.href])).toEqual([
      ['url-link', 'copy', 'https://lucide.dev/icons/files'],
      ['url-link', 'tableOfContents', 'https://lucide.dev/icons/table-of-contents'],
    ])
  })
})
