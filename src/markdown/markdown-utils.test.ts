import { describe, expect, it } from 'vitest'
import type { Editor } from '@toast-ui/editor'
import {
  BLOCK_INDENT_TOKEN,
  countBlockIndentLevels,
  countLeadingIndentUnits,
  convertInternalTabsForExport,
  EDITOR_BLANK_LINE_PLACEHOLDER,
  INDENT_TOKEN,
  mergeLeadingIndentsFromWysiwyg,
  normalizeHighlightMarkdownForPersistence,
  normalizeMarkdownForPersistence,
  prepareBlankParagraphsForEditorDisplay,
  prepareMarkdownHighlightsForDisplay,
  preserveBlankParagraphsFromWysiwyg,
  repairBrokenDataImageMarkdown,
  repairBrokenMarkdownTables,
  stripAllIndentPrefixes,
} from './markdown-utils'

type FakeNode = {
  type: { name: string }
  textContent?: string
  childCount?: number
  child?: (index: number) => FakeNode | null
  isText?: boolean
  isTextblock?: boolean
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
    isTextblock: typeName !== 'bulletList' && typeName !== 'orderedList',
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
            content: {
              size: blocks.length,
            },
            forEach: (visitor: (node: FakeNode) => void) => {
              blocks.forEach(visitor)
            },
            nodesBetween: (_from: number, _to: number, visitor: (node: FakeNode, position: number) => void) => {
              blocks.forEach((node, index) => visitor(node, index))
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

  it('round-trips existing blank paragraph placeholders without multiplying them', () => {
    const source = `one\n\n${EDITOR_BLANK_LINE_PLACEHOLDER}\n\ntwo`
    const markdown = preserveBlankParagraphsFromWysiwyg(
      editorForBlocks([
        block('paragraph', 'one'),
        emptyParagraph(),
        block('paragraph', 'two'),
      ]),
      source,
    )

    expect(markdown).toBe(source)
  })

  it('strips persisted blank placeholders before markdown is passed to the editor', () => {
    expect(prepareBlankParagraphsForEditorDisplay(`one\n\n${EDITOR_BLANK_LINE_PLACEHOLDER}\n\ntwo`)).toEqual({
      markdown: 'one\n\ntwo',
      blockKinds: ['content', 'blank', 'content'],
    })
  })

  it('keeps the blank paragraph display plan stable across repeated load-save cycles', () => {
    let markdown = `one\n\n${EDITOR_BLANK_LINE_PLACEHOLDER}\n\n${EDITOR_BLANK_LINE_PLACEHOLDER}\n\ntwo`
    for (let index = 0; index < 5; index += 1) {
      const display = prepareBlankParagraphsForEditorDisplay(markdown)
      expect(display).toEqual({
        markdown: 'one\n\ntwo',
        blockKinds: ['content', 'blank', 'blank', 'content'],
      })
      markdown = preserveBlankParagraphsFromWysiwyg(
        editorForBlocks([
          block('paragraph', 'one'),
          emptyParagraph(),
          emptyParagraph(),
          block('paragraph', 'two'),
        ]),
        display.markdown,
      )
    }

    expect(markdown).toBe(`one\n\n${EDITOR_BLANK_LINE_PLACEHOLDER}\n\n${EDITOR_BLANK_LINE_PLACEHOLDER}\n\ntwo`)
  })

  it('strips blank placeholders around headings and horizontal rules while preserving their positions', () => {
    const markdown = `# Head\n\n${EDITOR_BLANK_LINE_PLACEHOLDER}\n\n---\n\n${EDITOR_BLANK_LINE_PLACEHOLDER}\n\n## Next`

    expect(prepareBlankParagraphsForEditorDisplay(markdown)).toEqual({
      markdown: '# Head\n\n---\n\n## Next',
      blockKinds: ['content', 'blank', 'content', 'blank', 'content'],
    })
  })

  it('normalizes malformed placeholder separators to the live blank paragraph count', () => {
    const markdown = preserveBlankParagraphsFromWysiwyg(
      editorForBlocks([
        block('paragraph', 'one'),
        emptyParagraph(),
        block('paragraph', 'two'),
      ]),
      `one\n\n${EDITOR_BLANK_LINE_PLACEHOLDER}\n\n\n\n${EDITOR_BLANK_LINE_PLACEHOLDER}\n\ntwo`,
    )

    expect(markdown).toBe(`one\n\n${EDITOR_BLANK_LINE_PLACEHOLDER}\n\ntwo`)
  })

  it('removes stale placeholder chunks after blank paragraphs are deleted', () => {
    const markdown = preserveBlankParagraphsFromWysiwyg(
      editorForBlocks([
        block('paragraph', 'one'),
        block('paragraph', 'two'),
      ]),
      `one\n\n${EDITOR_BLANK_LINE_PLACEHOLDER}\n\ntwo`,
    )

    expect(markdown).toBe('one\n\ntwo')
  })

  it('persists one visible blank paragraph after a horizontal rule', () => {
    const source = `one\n\n---\n\n${EDITOR_BLANK_LINE_PLACEHOLDER}`
    const markdown = preserveBlankParagraphsFromWysiwyg(
      editorForBlocks([
        block('paragraph', 'one'),
        block('thematicBreak'),
        emptyParagraph(),
      ]),
      source,
    )

    expect(markdown).toBe(source)
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

  it('keeps a blank paragraph after a heading when task indentation serializes adjacent blocks', () => {
    const markdown = preserveBlankParagraphsFromWysiwyg(
      editorForBlocks([
        block('heading', 'Hat Trick!'),
        emptyParagraph(),
        block('paragraph', 'hmm interesting'),
        block('bulletList', 'onetwothree'),
      ]),
      '### Hat Trick!\nhmm interesting\n- [ ] one\n- [ ] two\n    - [ ] three',
    )

    expect(markdown).toBe(
      `### Hat Trick!\n\n${EDITOR_BLANK_LINE_PLACEHOLDER}\n\nhmm interesting\n\n- [ ] one\n- [ ] two\n    - [ ] three`,
    )
  })

  it('keeps a blank paragraph after a no-space heading before a horizontal rule in linked aisle text', () => {
    const markdown = preserveBlankParagraphsFromWysiwyg(
      editorForBlocks([
        block('heading', 'My second header.'),
        emptyParagraph(),
        block('thematicBreak'),
        block('paragraph', 'Live from a workshop in Ohio!'),
        block('paragraph', 'And now for a task'),
        block('thematicBreak'),
      ]),
      '##My second header.\n---\nLive from a workshop in Ohio!\nAnd now for a task\n---',
    )

    expect(markdown).toBe(
      `##My second header.\n\n${EDITOR_BLANK_LINE_PLACEHOLDER}\n\n---\n\nLive from a workshop in Ohio!\n\nAnd now for a task\n\n---`,
    )
  })

  it('restores top-level block separators after task indentation removes markdown blanks', () => {
    const markdown = preserveBlankParagraphsFromWysiwyg(
      editorForBlocks([
        block('heading', 'Hat Trick!'),
        block('paragraph', 'hmm interesting'),
        block('bulletList', 'onetwothree'),
      ]),
      '### Hat Trick!\nhmm interesting\n- [ ] one\n- [ ] two\n    - [ ] three',
    )

    expect(markdown).toBe('### Hat Trick!\n\nhmm interesting\n\n- [ ] one\n- [ ] two\n    - [ ] three')
  })

  it('splits adjacent heading, paragraph, and task list blocks before editor display', () => {
    expect(prepareBlankParagraphsForEditorDisplay('### Hat Trick!\nhmm interesting\n- [ ] one')).toEqual({
      markdown: '### Hat Trick!\n\nhmm interesting\n\n- [ ] one',
      blockKinds: ['content', 'content', 'content'],
    })
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
    expect(countBlockIndentLevels(`${BLOCK_INDENT_TOKEN.repeat(2)}${INDENT_TOKEN}one`)).toBe(2)
    expect(convertInternalTabsForExport(`${BLOCK_INDENT_TOKEN.repeat(2)}${INDENT_TOKEN}one`)).toBe('            one')
  })

  it('restores paragraph indents after stacked block indent tokens', () => {
    const text = `${BLOCK_INDENT_TOKEN.repeat(2)}${INDENT_TOKEN}one`

    expect(countLeadingIndentUnits(text)).toBe(1)
    expect(stripAllIndentPrefixes(text)).toBe(`${BLOCK_INDENT_TOKEN.repeat(2)}one`)
    expect(mergeLeadingIndentsFromWysiwyg(editorForBlocks([block('paragraph', text)]), `${BLOCK_INDENT_TOKEN.repeat(2)}one`)).toBe(text)
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

describe('broken markdown table repair', () => {
  it('collapses blank paragraph placeholders inside a table block', () => {
    const source = [
      'before',
      '',
      '| A | B |',
      '',
      EDITOR_BLANK_LINE_PLACEHOLDER,
      '',
      '| --- | --- |',
      '',
      EDITOR_BLANK_LINE_PLACEHOLDER,
      '',
      '| one | two |',
      '',
      'after',
    ].join('\n')

    expect(repairBrokenMarkdownTables(source)).toBe([
      'before',
      '',
      '| A | B |',
      '| --- | --- |',
      '| one | two |',
      '',
      'after',
    ].join('\n'))
  })

  it('repairs complete escaped table blocks back to markdown table syntax', () => {
    const source = [
      String.raw`\| A \| \<svg class="a\-b"\>x\</svg\> \|`,
      '',
      EDITOR_BLANK_LINE_PLACEHOLDER,
      '',
      String.raw`\| \-\-\- \| \-\-\- \|`,
      '',
      String.raw`\| B \| https://x\.test/a\-b \|`,
    ].join('\n')

    expect(repairBrokenMarkdownTables(source)).toBe([
      '| A | <svg class="a-b">x</svg> |',
      '| --- | --- |',
      '| B | https://x.test/a-b |',
    ].join('\n'))
  })

  it('leaves non-table pipe text unchanged', () => {
    const source = [
      'alpha | beta',
      '',
      EDITOR_BLANK_LINE_PLACEHOLDER,
      '',
      '| maybe | row |',
      '',
      'not a delimiter',
    ].join('\n')

    expect(repairBrokenMarkdownTables(source)).toBe(source)
  })

  it('leaves fenced code table-like text unchanged', () => {
    const source = [
      '```',
      '| A | B |',
      '',
      EDITOR_BLANK_LINE_PLACEHOLDER,
      '',
      '| --- | --- |',
      '```',
    ].join('\n')

    expect(repairBrokenMarkdownTables(source)).toBe(source)
  })

  it('preserves intentional blank paragraphs before and after a repaired table', () => {
    const source = [
      EDITOR_BLANK_LINE_PLACEHOLDER,
      '',
      '| A | B |',
      '',
      EDITOR_BLANK_LINE_PLACEHOLDER,
      '',
      '| --- | --- |',
      '',
      '| C | D |',
      '',
      EDITOR_BLANK_LINE_PLACEHOLDER,
    ].join('\n')

    expect(repairBrokenMarkdownTables(source)).toBe([
      EDITOR_BLANK_LINE_PLACEHOLDER,
      '',
      '| A | B |',
      '| --- | --- |',
      '| C | D |',
      '',
      EDITOR_BLANK_LINE_PLACEHOLDER,
    ].join('\n'))
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
