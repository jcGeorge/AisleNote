import { describe, expect, it } from 'vitest'
import type { Editor } from '@toast-ui/editor'
import {
  BLOCK_INDENT_TOKEN,
  convertInternalTabsForExport,
  EDITOR_BLANK_LINE_PLACEHOLDER,
  INDENT_TOKEN,
  normalizeHighlightMarkdownForPersistence,
  normalizeMarkdownForPersistence,
  prepareMarkdownHighlightsForDisplay,
  preserveBlankParagraphsFromWysiwyg,
  repairBrokenDataImageMarkdown,
} from './markdown-utils'

type FakeNode = {
  type: { name: string }
  textContent?: string
  childCount?: number
  child?: (index: number) => FakeNode | null
  isText?: boolean
  text?: string
}

function textNode(text: string): FakeNode {
  return {
    type: { name: 'text' },
    isText: true,
    text,
    textContent: text,
  }
}

function block(typeName: string, textContent = ''): FakeNode {
  const children = textContent ? [textNode(textContent)] : []
  return {
    type: { name: typeName },
    textContent,
    childCount: children.length,
    child: (index) => children[index] ?? null,
  }
}

function emptyParagraph(): FakeNode {
  return block('paragraph')
}

function editorForBlocks(blocks: FakeNode[]): Editor {
  return {
    wwEditor: {
      view: {
        state: {
          doc: {
            forEach: (visitor: (node: FakeNode) => void) => {
              blocks.forEach(visitor)
            },
          },
        },
      },
    },
  } as unknown as Editor
}

describe('markdown WYSIWYG blank line preservation', () => {
  it('stores an intentional empty paragraph between two paragraphs', () => {
    const markdown = preserveBlankParagraphsFromWysiwyg(
      editorForBlocks([
        block('paragraph', 'one'),
        emptyParagraph(),
        block('paragraph', 'two'),
      ]),
      'one\n\ntwo',
    )

    expect(markdown).toBe(`one\n\n${EDITOR_BLANK_LINE_PLACEHOLDER}\n\ntwo`)
  })

  it('stores adjacent empty paragraphs as separate placeholder chunks', () => {
    const markdown = preserveBlankParagraphsFromWysiwyg(
      editorForBlocks([
        block('paragraph', 'one'),
        emptyParagraph(),
        emptyParagraph(),
        block('paragraph', 'two'),
      ]),
      'one\n\ntwo',
    )

    expect(markdown).toBe(`one\n\n${EDITOR_BLANK_LINE_PLACEHOLDER}\n\n${EDITOR_BLANK_LINE_PLACEHOLDER}\n\ntwo`)
  })

  it('preserves empty paragraphs around headings and lists', () => {
    const markdown = preserveBlankParagraphsFromWysiwyg(
      editorForBlocks([
        emptyParagraph(),
        block('heading', 'Head'),
        emptyParagraph(),
        block('bulletList', 'one'),
        emptyParagraph(),
      ]),
      '## Head\n\n* one',
    )

    expect(markdown).toBe(`${EDITOR_BLANK_LINE_PLACEHOLDER}\n\n## Head\n\n${EDITOR_BLANK_LINE_PLACEHOLDER}\n\n* one\n\n${EDITOR_BLANK_LINE_PLACEHOLDER}`)
  })

  it('does not rewrite blank lines inside fenced code blocks', () => {
    const source = '```\none\n\ntwo\n```'

    expect(
      preserveBlankParagraphsFromWysiwyg(editorForBlocks([block('codeBlock', 'one\n\ntwo')]), source),
    ).toBe(source)
  })

  it('strips standalone blank-line placeholders from export markdown', () => {
    expect(convertInternalTabsForExport(`one\n\n${EDITOR_BLANK_LINE_PLACEHOLDER}\n\ntwo`)).toBe('one\n\n\n\ntwo')
  })

  it('exports block indent and paragraph indent tokens as spaces', () => {
    expect(convertInternalTabsForExport(`${BLOCK_INDENT_TOKEN}${INDENT_TOKEN}one`)).toBe('        one')
  })

  it('strips legacy block indent tokens from quoted lines during persistence and export', () => {
    expect(normalizeMarkdownForPersistence(`> ${BLOCK_INDENT_TOKEN}quote\n${BLOCK_INDENT_TOKEN}normal`)).toBe(
      `> quote\n${BLOCK_INDENT_TOKEN}normal`,
    )
    expect(convertInternalTabsForExport(`> ${BLOCK_INDENT_TOKEN}quote\n${BLOCK_INDENT_TOKEN}normal`)).toBe(
      '> quote\n    normal',
    )
  })
})

describe('data image markdown repair', () => {
  it('repairs data image syntax split between the alt text and URL', () => {
    expect(repairBrokenDataImageMarkdown('![image.png]\n(data:image/png;base64,abc)')).toBe(
      '![image.png](data:image/png;base64,abc)',
    )
  })
})

describe('markdown highlight syntax', () => {
  it('prepares compact and spaced highlight markers for editor display', () => {
    expect(prepareMarkdownHighlightsForDisplay('alpha ==one== beta == two ==')).toBe(
      'alpha <mark>one</mark> beta <mark>two</mark>',
    )
  })

  it('escapes highlighted text while preparing editor display', () => {
    expect(prepareMarkdownHighlightsForDisplay('==a < b & c==')).toBe('<mark>a &lt; b &amp; c</mark>')
  })

  it('normalizes editor mark tags back to persisted markdown markers', () => {
    expect(normalizeHighlightMarkdownForPersistence('alpha <mark>one</mark> beta <mark class="x"> two </mark>')).toBe(
      'alpha ==one== beta ==two==',
    )
    expect(normalizeMarkdownForPersistence('<mark>one</mark>')).toBe('==one==')
  })

  it('does not convert highlight markers inside fenced code or inline code', () => {
    const fenced = 'before ==one==\n```\n==two==\n```\nafter `==three==`'

    expect(prepareMarkdownHighlightsForDisplay(fenced)).toBe(
      'before <mark>one</mark>\n```\n==two==\n```\nafter `==three==`',
    )
    expect(normalizeHighlightMarkdownForPersistence('`<mark>code</mark>`\n```\n<mark>code</mark>\n```')).toBe(
      '`<mark>code</mark>`\n```\n<mark>code</mark>\n```',
    )
  })

  it('leaves empty highlight markers alone', () => {
    expect(prepareMarkdownHighlightsForDisplay('== ==')).toBe('== ==')
    expect(normalizeHighlightMarkdownForPersistence('<mark> </mark>')).toBe('<mark> </mark>')
  })
})
