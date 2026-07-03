import { describe, expect, it } from 'vitest'
import type { Editor } from '@toast-ui/editor'
import {
  BLOCK_INDENT_TOKEN,
  countBlockIndentLevels,
  countLeadingIndentUnits,
  convertInternalAisleNoteForExport,
  decodeBlockIndentHtmlForInternalMarkdown,
  encodeBlockIndentTokensForPersistence,
  EDITOR_BLANK_LINE_PLACEHOLDER,
  INDENT_TOKEN,
  isBlankParagraphNode,
  mergeLeadingIndentsFromWysiwyg,
  normalizeEscapedAnnotationLineMarkers,
  normalizeEscapedMarkdownLinks,
  normalizeHighlightMarkdownForPersistence,
  normalizeMarkdownForPersistence,
  normalizeRedundantMarkdownEscapes,
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

function hardBreakNode(): FakeNode {
  return {
    type: { name: 'hardBreak' },
    textContent: '',
  }
}

function hardBreakOnlyParagraph(): FakeNode {
  const children = [hardBreakNode()]
  return {
    type: { name: 'paragraph' },
    textContent: '',
    childCount: children.length,
    child: (index) => children[index] ?? null,
    isTextblock: true,
  }
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

const toolbarReplacementsTableFixture = [
  '# Completed items',
  '',
  'Fall in line here.',
  '',
  '| [copy](https://lucide.dev/icons/files) |  |',
  '| ---- | --- |',
  '| [tableOfContents](https://lucide.dev/icons/table-of-contents) |  |',
  '| [aisles](https://lucide.dev/icons/shelving-unit) |  |',
  '| [findReplace](https://lucide.dev/icons/search) |  |',
  '| [undo](https://lucide.dev/icons/undo) |  |',
  '| [redo](https://lucide.dev/icons/redo) |  |',
  '| [heading](https://lucide.dev/icons/heading) |  |',
  '| [bold](https://lucide.dev/icons/bold) |  |',
  '| [italic](https://lucide.dev/icons/italic) |  |',
  '| [highlight](https://lucide.dev/icons/highlighter) |  |',
  '| [strike](https://lucide.dev/icons/strikethrough) |  |',
  '| [taskList](https://lucide.dev/icons/square-check-big) |  |',
  '| [bulletList](https://lucide.dev/icons/list) |  |',
  '| [orderedList](https://lucide.dev/icons/list-ordered) |  |',
  '| [dashList](https://lucide.dev/icons/logs) |  |',
  '| [blockQuote](https://lucide.dev/icons/quote) |  |',
  '| [blockIndent](https://lucide.dev/icons/list-indent-increase) |  |',
  '| [removeBlockIndent](https://lucide.dev/icons/list-indent-decrease) |  |',
  '| [hr](https://lucide.dev/icons/minus) |  |',
  '| [link](https://lucide.dev/icons/link) |  |',
  '| [image](https://lucide.dev/icons/image) |  |',
  '| [table](https://lucide.dev/icons/grid-2x2-plus) |  |',
  '| [code](https://lucide.dev/icons/code) |  |',
  '| [codeBlock](https://lucide.dev/icons/braces) |  |',
  '| [clear](https://lucide.dev/icons/delete) |  |',
].join('\n')

describe('markdown WYSIWYG blank line preservation', () => {
  it('stores an intentional empty paragraph between two paragraphs as plain markdown', () => {
    const markdown = preserveBlankParagraphsFromWysiwyg(
      editorForBlocks([
        block('paragraph', 'one'),
        emptyParagraph(),
        block('paragraph', 'two'),
      ]),
      'one\n\ntwo',
    )

    expect(markdown).toBe('one\n\ntwo')
  })

  it('stores adjacent empty paragraphs as adjacent plain markdown blank lines', () => {
    const markdown = preserveBlankParagraphsFromWysiwyg(
      editorForBlocks([
        block('paragraph', 'one'),
        emptyParagraph(),
        emptyParagraph(),
        block('paragraph', 'two'),
      ]),
      'one\n\ntwo',
    )

    expect(markdown).toBe('one\n\n\ntwo')
  })

  it('normalizes existing blank paragraph placeholders without multiplying them', () => {
    const source = `one\n\n${EDITOR_BLANK_LINE_PLACEHOLDER}\n\ntwo`
    const markdown = preserveBlankParagraphsFromWysiwyg(
      editorForBlocks([
        block('paragraph', 'one'),
        emptyParagraph(),
        block('paragraph', 'two'),
      ]),
      source,
    )

    expect(markdown).toBe('one\n\ntwo')
  })

  it('keeps adjacent visible lines as adjacent markdown lines after editor serialization', () => {
    const markdown = preserveBlankParagraphsFromWysiwyg(
      editorForBlocks([
        block('paragraph', "hey here's a line"),
        block('paragraph', "here's another line"),
        block('paragraph', "here's a third"),
      ]),
      "hey here's a line\n\nhere's another line\n\nhere's a third",
    )

    expect(markdown).toBe("hey here's a line\nhere's another line\nhere's a third")
  })

  it('preserves a leading visual blank row before adjacent visible lines', () => {
    const markdown = preserveBlankParagraphsFromWysiwyg(
      editorForBlocks([
        emptyParagraph(),
        block('paragraph', 'okay'),
        block('paragraph', 'so'),
        block('paragraph', 'these are together.'),
      ]),
      'okay\n\nso\n\nthese are together.',
    )

    expect(markdown).toBe('\nokay\nso\nthese are together.')
  })

  it('preserves trailing visual blank rows after adjacent visible lines', () => {
    const markdown = preserveBlankParagraphsFromWysiwyg(
      editorForBlocks([
        block('paragraph', 'okay'),
        block('paragraph', 'so'),
        emptyParagraph(),
        emptyParagraph(),
      ]),
      'okay\n\nso',
    )

    expect(markdown).toBe('okay\nso\n\n')
  })

  it('strips persisted blank placeholders before markdown is passed to the editor', () => {
    expect(prepareBlankParagraphsForEditorDisplay(`one\n\n${EDITOR_BLANK_LINE_PLACEHOLDER}\n\ntwo`)).toEqual({
      markdown: 'one\n\ntwo',
      blockKinds: ['content', 'blank', 'content'],
    })
  })

  it('can serialize arbitrary blank paragraph runs as editor placeholders', () => {
    const blankCount = 4
    const markdown = ['before', ...Array.from({ length: blankCount }, () => ''), 'next'].join('\n')

    expect(prepareBlankParagraphsForEditorDisplay(markdown, { preserveBlankParagraphPlaceholders: true })).toEqual({
      markdown: [
        'before',
        '',
        EDITOR_BLANK_LINE_PLACEHOLDER,
        '',
        EDITOR_BLANK_LINE_PLACEHOLDER,
        '',
        EDITOR_BLANK_LINE_PLACEHOLDER,
        '',
        EDITOR_BLANK_LINE_PLACEHOLDER,
        '',
        'next',
      ].join('\n'),
      blockKinds: ['content', 'blank', 'blank', 'blank', 'blank', 'content'],
    })
  })

  it('can serialize table-adjacent blank paragraph runs as editor placeholders', () => {
    const markdown = [
      'before',
      '',
      '',
      '',
      '| A | B |',
      '| --- | --- |',
      '| C | D |',
    ].join('\n')

    expect(prepareBlankParagraphsForEditorDisplay(markdown, { preserveBlankParagraphPlaceholders: true })).toEqual({
      markdown: [
        'before',
        '',
        EDITOR_BLANK_LINE_PLACEHOLDER,
        '',
        EDITOR_BLANK_LINE_PLACEHOLDER,
        '',
        EDITOR_BLANK_LINE_PLACEHOLDER,
        '',
        '| A | B |',
        '| --- | --- |',
        '| C | D |',
      ].join('\n'),
      blockKinds: ['content', 'blank', 'blank', 'blank', 'content'],
    })
  })

  it('plans leading blank rows separately from parser spacing for adjacent visible lines', () => {
    expect(prepareBlankParagraphsForEditorDisplay('\nokay\nso\nthese are together.')).toEqual({
      markdown: 'okay\nso\nthese are together.',
      blockKinds: ['blank', 'content'],
    })
  })

  it('keeps the blank paragraph display plan stable across repeated load-save cycles', () => {
    let markdown = 'one\n\n\ntwo'
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

    expect(markdown).toBe('one\n\n\ntwo')
  })

  it('keeps repeated and trailing blank rows stable through display and persistence', () => {
    const source = 'one\n\n\ntwo\n\n'
    const display = prepareBlankParagraphsForEditorDisplay(source)

    expect(display).toEqual({
      markdown: 'one\n\ntwo',
      blockKinds: ['content', 'blank', 'blank', 'content', 'blank', 'blank'],
    })

    const markdown = preserveBlankParagraphsFromWysiwyg(
      editorForBlocks([
        block('paragraph', 'one'),
        emptyParagraph(),
        emptyParagraph(),
        block('paragraph', 'two'),
        emptyParagraph(),
        emptyParagraph(),
      ]),
      display.markdown,
    )

    expect(markdown).toBe(source)
    expect(normalizeMarkdownForPersistence(markdown)).toBe(source)
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

    expect(markdown).toBe('one\n\ntwo')
  })

  it('normalizes standalone html break spacer lines but keeps inline and fenced breaks', () => {
    expect(normalizeMarkdownForPersistence('one\n\n<br>\n\ntwo')).toBe('one\n\ntwo')
    expect(normalizeMarkdownForPersistence('one <br> two')).toBe('one <br> two')
    expect(normalizeMarkdownForPersistence('```\none\n<br>\ntwo\n```')).toBe('```\none\n<br>\ntwo\n```')
  })

  it('unwraps span tags outside fenced code while preserving fenced examples', () => {
    expect(normalizeMarkdownForPersistence('<span style="color: #bbbebf;">Matthew</span>')).toBe('Matthew')
    expect(normalizeMarkdownForPersistence('Before <span lang="grc">δεῖπνον</span> after')).toBe(
      'Before δεῖπνον after',
    )
    expect(normalizeMarkdownForPersistence('```\n<span style="color: #bbbebf;">Matthew</span>\n```')).toBe(
      '```\n<span style="color: #bbbebf;">Matthew</span>\n```',
    )
  })

  it('strips editor blank placeholders when typed text lands on the placeholder line', () => {
    expect(normalizeMarkdownForPersistence(`${EDITOR_BLANK_LINE_PLACEHOLDER}x`)).toBe('x')
  })

  it('preserves extra plain blank paragraphs added beside editor blank placeholders', () => {
    expect(normalizeMarkdownForPersistence([
      'one',
      '',
      EDITOR_BLANK_LINE_PLACEHOLDER,
      '',
      '',
      'two',
    ].join('\n'))).toBe([
      'one',
      '',
      '',
      'two',
    ].join('\n'))

    expect(normalizeMarkdownForPersistence([
      'one',
      '',
      EDITOR_BLANK_LINE_PLACEHOLDER,
      '',
      '',
      EDITOR_BLANK_LINE_PLACEHOLDER,
      '',
      'two',
    ].join('\n'))).toBe([
      'one',
      '',
      '',
      '',
      'two',
    ].join('\n'))
  })

  it('repairs fully escaped markdown links from persisted editor text', () => {
    const escaped = [
      String.raw`\[strike\]\(https://lucide\.dev/icons/strikethrough\)`,
      String.raw`\!\[Welcome copy\]\(Welcome%20copy--96d9e4\)`,
      String.raw`\[Welcome copy\]\(\<Welcome copy\-\-96d9e4\>\)`,
    ].join('\n')
    const repaired = [
      '[strike](https://lucide.dev/icons/strikethrough)',
      '![Welcome copy](Welcome%20copy--96d9e4)',
      '[Welcome copy](<Welcome copy--96d9e4>)',
    ].join('\n')

    expect(normalizeEscapedMarkdownLinks(escaped)).toBe(repaired)
    expect(normalizeMarkdownForPersistence(escaped)).toBe(repaired)
  })

  it('normalizes escaped annotation line markers outside code', () => {
    const markdown = [
      String.raw`\-\- And this bad boy`,
      `\`${String.raw`\-\- not an annotation`}\``,
      '```',
      String.raw`\-\- not an annotation`,
      '```',
    ].join('\n')

    const normalized = [
      '-- And this bad boy',
      `\`${String.raw`\-\- not an annotation`}\``,
      '```',
      String.raw`\-\- not an annotation`,
      '```',
    ].join('\n')

    expect(normalizeEscapedAnnotationLineMarkers(markdown)).toBe(normalized)
    expect(normalizeMarkdownForPersistence(markdown)).toBe(normalized)
  })

  it('removes redundant Toast punctuation escapes during persistence', () => {
    const escaped = [
      String.raw`-- Philipp Jakob Spener\, Pia Desideria`,
      String.raw`\-\- 1 Kings 13:1\-10`,
      String.raw`At [13:02](https://www.youtube.com/watch?v=WwL2VD2GVFk&t=782s) \- 20 with \(Theodorus Frelinghuysen\)\.`,
      String.raw`https://example.com/pastor\_steven\_anderson/soulwinning/getting\_started\.mp3`,
      String.raw`The estimate was \~three years later\.`,
    ].join('\n')
    const normalized = [
      '-- Philipp Jakob Spener, Pia Desideria',
      '-- 1 Kings 13:1-10',
      'At [13:02](https://www.youtube.com/watch?v=WwL2VD2GVFk&t=782s) - 20 with (Theodorus Frelinghuysen).',
      'https://example.com/pastor_steven_anderson/soulwinning/getting_started.mp3',
      'The estimate was ~three years later.',
    ].join('\n')

    expect(normalizeRedundantMarkdownEscapes(escaped)).toBe(normalized)
    expect(normalizeMarkdownForPersistence(escaped)).toBe(normalized)
  })

  it('keeps escapes that protect real Markdown structure', () => {
    const markdown = [
      String.raw`1\. Not an ordered list`,
      String.raw`\- Not a bullet list`,
      String.raw`\+ Not a bullet list`,
      String.raw`using \_\_\_ as a placeholder`,
      `[label](https://example.com/a\\(b\\))`,
      `\`${String.raw`keep \(code\) escaped`}\``,
      '```',
      String.raw`keep \(code\) escaped`,
      '```',
    ].join('\n')

    expect(normalizeRedundantMarkdownEscapes(markdown)).toBe(markdown)
    expect(normalizeMarkdownForPersistence(markdown)).toBe(markdown)
  })

  it('does not repair escaped markdown links inside inline or fenced code', () => {
    const escaped = String.raw`\[strike\]\(https://lucide\.dev/icons/strikethrough\)`
    const markdown = [
      `\`${escaped}\``,
      '```',
      escaped,
      '```',
    ].join('\n')

    expect(normalizeEscapedMarkdownLinks(markdown)).toBe(markdown)
  })

  it('cleans reported note preview and link spacing without hidden placeholders or standalone breaks', () => {
    const messy = [
      '![link that remains](<link that remains--14eeb9>)',
      '[link that remains](<link that remains--14eeb9>)',
      '',
      '<br>',
      'asdfasdf',
      '',
      EDITOR_BLANK_LINE_PLACEHOLDER,
      '',
      EDITOR_BLANK_LINE_PLACEHOLDER,
      'bannanaa ',
      '',
      EDITOR_BLANK_LINE_PLACEHOLDER,
      '<br>',
      'asdf',
      '',
      EDITOR_BLANK_LINE_PLACEHOLDER,
      '',
      EDITOR_BLANK_LINE_PLACEHOLDER,
      '<br>',
    ].join('\n')
    const markdown = preserveBlankParagraphsFromWysiwyg(
      editorForBlocks([
        block('paragraph', '![link that remains](<link that remains--14eeb9>)'),
        block('paragraph', '[link that remains](<link that remains--14eeb9>)'),
        block('paragraph', 'asdfasdf'),
        emptyParagraph(),
        block('paragraph', 'bannanaa '),
        emptyParagraph(),
        emptyParagraph(),
        block('paragraph', 'asdf'),
        emptyParagraph(),
        emptyParagraph(),
      ]),
      messy,
    )

    expect(markdown).toBe([
      '![link that remains](<link that remains--14eeb9>)',
      '[link that remains](<link that remains--14eeb9>)',
      'asdfasdf',
      '',
      'bannanaa ',
      '',
      '',
      'asdf',
      '',
      '',
    ].join('\n'))
    expect(markdown).not.toContain(EDITOR_BLANK_LINE_PLACEHOLDER)
    expect(markdown).not.toMatch(/^<br\s*\/?>$/im)
  })

  it('removes stale placeholder chunks after blank paragraphs are deleted', () => {
    const markdown = preserveBlankParagraphsFromWysiwyg(
      editorForBlocks([
        block('paragraph', 'one'),
        block('paragraph', 'two'),
      ]),
      `one\n\n${EDITOR_BLANK_LINE_PLACEHOLDER}\n\ntwo`,
    )

    expect(markdown).toBe('one\ntwo')
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

    expect(markdown).toBe('one\n---\n')
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

    expect(markdown).toBe('\n## Head\n\n* one\n')
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
      '### Hat Trick!\n\nhmm interesting\n- [ ] one\n- [ ] two\n    - [ ] three',
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
      '##My second header.\n\n---\nLive from a workshop in Ohio!\nAnd now for a task\n---',
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

    expect(markdown).toBe('### Hat Trick!\nhmm interesting\n- [ ] one\n- [ ] two\n    - [ ] three')
  })

  it('separates adjacent structural blocks before editor display without splitting plain soft breaks', () => {
    expect(prepareBlankParagraphsForEditorDisplay('### Hat Trick!\nhmm interesting\n- [ ] one')).toEqual({
      markdown: '### Hat Trick!\n\nhmm interesting\n\n- [ ] one',
      blockKinds: ['content', 'content', 'content'],
    })
  })

  it('keeps adjacent plain text lines as soft breaks before editor display', () => {
    expect(prepareBlankParagraphsForEditorDisplay("I dont't know\nsure, I guess.\nWait, what?")).toEqual({
      markdown: "I dont't know\nsure, I guess.\nWait, what?",
      blockKinds: ['content'],
    })
  })

  it('keeps adjacent paragraph and table blocks grouped for editor display', () => {
    const markdown = [
      'before',
      '| A | B |',
      '| --- | --- |',
      '| C | D |',
      'after',
    ].join('\n')

    expect(prepareBlankParagraphsForEditorDisplay(markdown)).toEqual({
      markdown: [
        'before',
        '',
        '| A | B |',
        '| --- | --- |',
        '| C | D |',
        '',
        'after',
      ].join('\n'),
      blockKinds: ['content', 'content', 'content'],
    })
  })

  it('keeps a single persisted blank around a table as a visible blank paragraph', () => {
    const markdown = [
      'before',
      '',
      '| A | B |',
      '| --- | --- |',
      '| C | D |',
      '',
      'after',
    ].join('\n')

    expect(prepareBlankParagraphsForEditorDisplay(markdown)).toEqual({
      markdown,
      blockKinds: ['content', 'blank', 'content', 'blank', 'content'],
    })
  })

  it('keeps extra blank rows around a table as visible blank paragraphs', () => {
    const markdown = [
      'before',
      '',
      '',
      '| A | B |',
      '| --- | --- |',
      '| C | D |',
      '',
      '',
      'after',
    ].join('\n')

    expect(prepareBlankParagraphsForEditorDisplay(markdown)).toEqual({
      markdown: [
        'before',
        '',
        '| A | B |',
        '| --- | --- |',
        '| C | D |',
        '',
        'after',
      ].join('\n'),
      blockKinds: ['content', 'blank', 'blank', 'content', 'blank', 'blank', 'content'],
    })
  })

  it('preserves visible table-adjacent blank paragraphs after WYSIWYG serialization', () => {
    const markdown = preserveBlankParagraphsFromWysiwyg(
      editorForBlocks([
        block('paragraph', 'before'),
        emptyParagraph(),
        block('table', 'A B C D'),
        emptyParagraph(),
        block('paragraph', 'after'),
      ]),
      [
        'before',
        '',
        '| A | B |',
        '| --- | --- |',
        '| C | D |',
        '',
        'after',
      ].join('\n'),
    )

    expect(markdown).toBe([
      'before',
      '',
      '| A | B |',
      '| --- | --- |',
      '| C | D |',
      '',
      'after',
    ].join('\n'))
  })

  it('preserves explicit blank markers around a table', () => {
    const markdown = preserveBlankParagraphsFromWysiwyg(
      editorForBlocks([
        block('paragraph', 'before'),
        emptyParagraph(),
        block('table', 'A B C D'),
        emptyParagraph(),
        block('paragraph', 'after'),
      ]),
      [
        'before',
        '',
        EDITOR_BLANK_LINE_PLACEHOLDER,
        '',
        '| A | B |',
        '| --- | --- |',
        '| C | D |',
        '',
        EDITOR_BLANK_LINE_PLACEHOLDER,
        '',
        'after',
      ].join('\n'),
    )

    expect(markdown).toBe([
      'before',
      '',
      '| A | B |',
      '| --- | --- |',
      '| C | D |',
      '',
      'after',
    ].join('\n'))
  })

  it('preserves multiple visible blank paragraph nodes around a table', () => {
    const markdown = preserveBlankParagraphsFromWysiwyg(
      editorForBlocks([
        block('paragraph', 'before'),
        emptyParagraph(),
        emptyParagraph(),
        block('table', 'A B C D'),
        emptyParagraph(),
        emptyParagraph(),
        block('paragraph', 'after'),
      ]),
      [
        'before',
        '',
        '',
        '| A | B |',
        '| --- | --- |',
        '| C | D |',
        '',
        '',
        'after',
      ].join('\n'),
    )

    expect(markdown).toBe([
      'before',
      '',
      '',
      '| A | B |',
      '| --- | --- |',
      '| C | D |',
      '',
      '',
      'after',
    ].join('\n'))
  })

  it('treats hard-break-only paragraphs as blank editor paragraphs', () => {
    expect(isBlankParagraphNode(hardBreakOnlyParagraph())).toBe(true)
    expect(isBlankParagraphNode(block('paragraph', 'real text'))).toBe(false)
  })

  it('preserves six hard-break blank paragraphs between text and a table', () => {
    const markdown = preserveBlankParagraphsFromWysiwyg(
      editorForBlocks([
        block('paragraph', 'before'),
        ...Array.from({ length: 6 }, () => hardBreakOnlyParagraph()),
        block('table', 'A B C D'),
      ]),
      [
        'before',
        '',
        '| A | B |',
        '| --- | --- |',
        '| C | D |',
      ].join('\n'),
    )

    expect(markdown).toBe([
      'before',
      '',
      '',
      '',
      '',
      '',
      '',
      '| A | B |',
      '| --- | --- |',
      '| C | D |',
    ].join('\n'))
  })

  it('preserves six hard-break blank paragraphs when text is typed before a table', () => {
    const markdown = preserveBlankParagraphsFromWysiwyg(
      editorForBlocks([
        block('paragraph', 'before'),
        ...Array.from({ length: 6 }, () => hardBreakOnlyParagraph()),
        block('paragraph', 'x'),
        block('table', 'A B C D'),
      ]),
      [
        'before',
        '',
        'x',
        '',
        '| A | B |',
        '| --- | --- |',
        '| C | D |',
      ].join('\n'),
    )

    expect(markdown).toBe([
      'before',
      '',
      '',
      '',
      '',
      '',
      '',
      'x',
      '| A | B |',
      '| --- | --- |',
      '| C | D |',
    ].join('\n'))
  })

  it('preserves repeated trailing blank paragraphs after a table', () => {
    const markdown = preserveBlankParagraphsFromWysiwyg(
      editorForBlocks([
        block('paragraph', 'before'),
        block('table', 'A B C D'),
        emptyParagraph(),
        emptyParagraph(),
        emptyParagraph(),
        emptyParagraph(),
      ]),
      [
        'before',
        '| A | B |',
        '| --- | --- |',
        '| C | D |',
      ].join('\n'),
    )

    expect(markdown).toBe([
      'before',
      '| A | B |',
      '| --- | --- |',
      '| C | D |',
      '',
      '',
      '',
      '',
    ].join('\n'))
  })

  it('preserves trailing blank paragraphs when raw table markdown has not been parsed yet', () => {
    const markdown = preserveBlankParagraphsFromWysiwyg(
      editorForBlocks([
        block('paragraph', 'before'),
        block('paragraph', '| A | B |'),
        block('paragraph', '| --- | --- |'),
        block('paragraph', '| C | D |'),
        emptyParagraph(),
        emptyParagraph(),
        emptyParagraph(),
        emptyParagraph(),
      ]),
      [
        'before',
        '',
        '| A | B |',
        '| --- | --- |',
        '| C | D |',
        '',
      ].join('\n'),
    )

    expect(markdown).toBe([
      'before',
      '',
      '| A | B |',
      '| --- | --- |',
      '| C | D |',
      '',
      '',
      '',
      '',
    ].join('\n'))
  })

  it('does not add parser-only table spacing to persisted paragraph-table-paragraph markdown', () => {
    expect(normalizeMarkdownForPersistence([
      'before',
      '| A | B |',
      '| --- | --- |',
      '| C | D |',
      'after',
    ].join('\n'))).toBe([
      'before',
      '| A | B |',
      '| --- | --- |',
      '| C | D |',
      'after',
    ].join('\n'))
  })

  it('keeps toolbar replacement table normalization stable and strips Toast-only parser spacing on snapshot', () => {
    const compactToolbarTableFixture = toolbarReplacementsTableFixture.replaceAll('\n\n', '\n')

    expect(normalizeMarkdownForPersistence(toolbarReplacementsTableFixture)).toBe(toolbarReplacementsTableFixture)
    expect(prepareBlankParagraphsForEditorDisplay(toolbarReplacementsTableFixture).markdown).toBe(
      toolbarReplacementsTableFixture,
    )
    expect(
      preserveBlankParagraphsFromWysiwyg(
        editorForBlocks([
          block('heading', 'Completed items'),
          block('paragraph', 'Fall in line here.'),
          block('table', 'copy tableOfContents aisles findReplace'),
        ]),
        toolbarReplacementsTableFixture,
      ),
    ).toBe(compactToolbarTableFixture)
  })

  it('does not re-persist Toast parser spacing after blank lines around a table are deleted', () => {
    const compactToolbarTableFixture = toolbarReplacementsTableFixture.replaceAll('\n\n', '\n')
    const toastSerializedWithParserSpacing = [
      '# Completed items',
      '',
      'Fall in line here.',
      '',
      '| [copy](https://lucide.dev/icons/files) |  |',
      '| ---- | --- |',
      '| [tableOfContents](https://lucide.dev/icons/table-of-contents) |  |',
      '| [aisles](https://lucide.dev/icons/shelving-unit) |  |',
      '| [findReplace](https://lucide.dev/icons/search) |  |',
      '| [undo](https://lucide.dev/icons/undo) |  |',
      '| [redo](https://lucide.dev/icons/redo) |  |',
      '| [heading](https://lucide.dev/icons/heading) |  |',
      '| [bold](https://lucide.dev/icons/bold) |  |',
      '| [italic](https://lucide.dev/icons/italic) |  |',
      '| [highlight](https://lucide.dev/icons/highlighter) |  |',
      '| [strike](https://lucide.dev/icons/strikethrough) |  |',
      '| [taskList](https://lucide.dev/icons/square-check-big) |  |',
      '| [bulletList](https://lucide.dev/icons/list) |  |',
      '| [orderedList](https://lucide.dev/icons/list-ordered) |  |',
      '| [dashList](https://lucide.dev/icons/logs) |  |',
      '| [blockQuote](https://lucide.dev/icons/quote) |  |',
      '| [blockIndent](https://lucide.dev/icons/list-indent-increase) |  |',
      '| [removeBlockIndent](https://lucide.dev/icons/list-indent-decrease) |  |',
      '| [hr](https://lucide.dev/icons/minus) |  |',
      '| [link](https://lucide.dev/icons/link) |  |',
      '| [image](https://lucide.dev/icons/image) |  |',
      '| [table](https://lucide.dev/icons/grid-2x2-plus) |  |',
      '| [code](https://lucide.dev/icons/code) |  |',
      '| [codeBlock](https://lucide.dev/icons/braces) |  |',
      '| [clear](https://lucide.dev/icons/delete) |  |',
    ].join('\n')

    expect(
      preserveBlankParagraphsFromWysiwyg(
        editorForBlocks([
          block('heading', 'Completed items'),
          block('paragraph', 'Fall in line here.'),
          block('table', 'copy tableOfContents aisles findReplace'),
        ]),
        toastSerializedWithParserSpacing,
      ),
    ).toBe(compactToolbarTableFixture)
  })

  it('does not rewrite blank lines inside fenced code blocks', () => {
    const source = '```\none\n\ntwo\n```'

    expect(
      preserveBlankParagraphsFromWysiwyg(editorForBlocks([block('codeBlock', 'one\n\ntwo')]), source),
    ).toBe(source)
  })

  it('strips standalone blank-line placeholders from export markdown', () => {
    expect(convertInternalAisleNoteForExport(`one\n\n${EDITOR_BLANK_LINE_PLACEHOLDER}\n\ntwo`)).toBe('one\n\ntwo')
  })

  it('exports block indent and paragraph indent tokens as spaces', () => {
    expect(countBlockIndentLevels(`${BLOCK_INDENT_TOKEN.repeat(2)}${INDENT_TOKEN}one`)).toBe(2)
    expect(convertInternalAisleNoteForExport(`${BLOCK_INDENT_TOKEN.repeat(2)}${INDENT_TOKEN}one`)).toBe('            one')
  })

  it('persists block indent tokens as explicit tab-block wrappers', () => {
    expect(normalizeMarkdownForPersistence(`${BLOCK_INDENT_TOKEN}one`)).toBe([
      '<div tab-block="1">',
      '',
      'one',
      '',
      '</div>',
    ].join('\n'))
  })

  it('groups adjacent same-level block indents into one wrapper', () => {
    expect(normalizeMarkdownForPersistence(`${BLOCK_INDENT_TOKEN.repeat(2)}one\n\n${BLOCK_INDENT_TOKEN.repeat(2)}two`)).toBe([
      '<div tab-block="2">',
      '',
      'one',
      '',
      'two',
      '',
      '</div>',
    ].join('\n'))
  })

  it('decodes tab-block wrappers into internal block indent tokens for display', () => {
    expect(decodeBlockIndentHtmlForInternalMarkdown([
      '<div tab-block="2">',
      '',
      '**bold** and [link](https://example.com)',
      '',
      '</div>',
    ].join('\n'))).toBe(`${BLOCK_INDENT_TOKEN.repeat(2)}**bold** and [link](https://example.com)`)
  })

  it('leaves invalid tab-block wrappers untouched', () => {
    const markdown = [
      '<div tab-block="0">',
      '',
      'one',
      '',
      '</div>',
    ].join('\n')

    expect(decodeBlockIndentHtmlForInternalMarkdown(markdown)).toBe(markdown)
    expect(normalizeMarkdownForPersistence(markdown)).toBe(markdown)
  })

  it('keeps paragraph indents distinct from block indents', () => {
    expect(normalizeMarkdownForPersistence(`${INDENT_TOKEN}one`)).toBe(`${INDENT_TOKEN}one`)
    expect(encodeBlockIndentTokensForPersistence(`${INDENT_TOKEN}one`)).toBe(`${INDENT_TOKEN}one`)
  })

  it('leaves markdown blockquotes distinct from tab-block wrappers', () => {
    expect(normalizeMarkdownForPersistence('> quote')).toBe('> quote')
    expect(normalizeMarkdownForPersistence('> quote')).not.toContain('tab-block')
  })

  it('restores paragraph indents after stacked block indent tokens', () => {
    const text = `${BLOCK_INDENT_TOKEN.repeat(2)}${INDENT_TOKEN}one`

    expect(countLeadingIndentUnits(text)).toBe(1)
    expect(stripAllIndentPrefixes(text)).toBe(`${BLOCK_INDENT_TOKEN.repeat(2)}one`)
    expect(mergeLeadingIndentsFromWysiwyg(editorForBlocks([block('paragraph', text)]), `${BLOCK_INDENT_TOKEN.repeat(2)}one`)).toBe(text)
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

  it('removes pipe-only tail rows after a valid table', () => {
    const table = [
      '| inline code --> | `here!!` |',
      '| --------------- | ------ |',
    ].join('\n')
    const source = [
      table,
      '|',
      '\\|',
      '|',
    ].join('\n')

    expect(repairBrokenMarkdownTables(source)).toBe(table)
    expect(normalizeMarkdownForPersistence(source)).toBe(table)
  })

  it('keeps table tail repair stable across repeated save cycles', () => {
    const table = [
      '| inline code --> | `here!!` |',
      '| --------------- | ------ |',
    ].join('\n')
    let markdown = table

    for (let index = 0; index < 5; index += 1) {
      markdown = normalizeMarkdownForPersistence([
        markdown,
        '|',
        '\\|',
      ].join('\n'))
      expect(markdown).toBe(table)
    }
  })

  it('does not remove standalone pipe paragraphs that are not table tails', () => {
    const source = [
      'before',
      '|',
      '\\|',
      'after',
    ].join('\n')

    expect(repairBrokenMarkdownTables(source)).toBe(source)
  })
})

describe('markdown highlight syntax', () => {
  it('prepares compact and spaced highlight markers for editor display', () => {
    expect(prepareMarkdownHighlightsForDisplay('alpha ==one== beta == two ==')).toBe(
      'alpha <mark>one</mark> beta <mark>two</mark>',
    )
  })

  it('can preserve linked highlight markers for editor post-processing', () => {
    const markdown = '==[Specs](<Specs--abcdef>)=='

    expect(prepareMarkdownHighlightsForDisplay(markdown)).toBe('<mark>[Specs](&lt;Specs--abcdef&gt;)</mark>')
    expect(prepareMarkdownHighlightsForDisplay(markdown, { preserveLinkedHighlights: true })).toBe(markdown)
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
