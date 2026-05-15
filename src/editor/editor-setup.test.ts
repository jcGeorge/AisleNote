import { describe, expect, it } from 'vitest'
import type { Editor } from '@toast-ui/editor'
import {
  ANNOTATION_LINE_ARROW_CLASS_NAME,
  ANNOTATION_LINE_ARROW_DOWN_CLASS_NAME,
  ANNOTATION_LINE_ARROW_UP_CLASS_NAME,
  ANNOTATION_LINE_MARKER_CLASS_NAME,
  ANNOTATION_LINE_TAIL_LEFT_CLASS_NAME,
  ANNOTATION_LINE_TAIL_RIGHT_CLASS_NAME,
} from './annotation-line'
import { shouldDeleteEmptyParagraphAtListBoundary } from './empty-paragraph-list-delete'
import { annotationLinePlugin, getActiveHeadingLevel, getParagraphSpaceShortcut } from './editor-setup'

function node(typeName: string, textContent = '', contentSize = 0) {
  return {
    type: { name: typeName },
    textContent,
    content: { size: contentSize },
  }
}

describe('empty paragraph list boundary delete guard', () => {
  it('handles Backspace from an empty paragraph after a list', () => {
    expect(
      shouldDeleteEmptyParagraphAtListBoundary({
        currentNode: node('paragraph'),
        previousNode: node('bulletList'),
        parentOffset: 0,
        direction: 'backward',
      }),
    ).toBe(true)
  })

  it('handles forward Delete from an empty paragraph before a list', () => {
    expect(
      shouldDeleteEmptyParagraphAtListBoundary({
        currentNode: node('paragraph', '', 0),
        nextNode: node('orderedList'),
        parentOffset: 0,
        direction: 'forward',
      }),
    ).toBe(true)
  })

  it('leaves text paragraphs and non-list neighbors alone', () => {
    expect(
      shouldDeleteEmptyParagraphAtListBoundary({
        currentNode: node('paragraph', 'text', 4),
        previousNode: node('bulletList'),
        parentOffset: 0,
        direction: 'backward',
      }),
    ).toBe(false)
    expect(
      shouldDeleteEmptyParagraphAtListBoundary({
        currentNode: node('paragraph'),
        previousNode: node('heading'),
        parentOffset: 0,
        direction: 'backward',
      }),
    ).toBe(false)
  })
})

function editorWithSelectionParent(typeName: string, attrs: Record<string, unknown> = {}) {
  const parent = {
    type: { name: typeName },
    attrs,
  }

  return {
    wwEditor: {
      view: {
        state: {
          selection: {
            $from: { parent },
            $to: { parent },
          },
        },
      },
    },
  } as unknown as Editor
}

describe('active heading level detection', () => {
  it('returns the active heading level at a collapsed heading cursor', () => {
    expect(getActiveHeadingLevel(editorWithSelectionParent('heading', { level: 3 }))).toBe(3)
  })

  it('returns 0 when the cursor is in a paragraph', () => {
    expect(getActiveHeadingLevel(editorWithSelectionParent('paragraph'))).toBe(0)
  })
})

describe('paragraph space shortcuts', () => {
  it('requires a bare greater-than marker before Space for block quotes', () => {
    expect(getParagraphSpaceShortcut('>')).toEqual({ kind: 'blockQuote' })
    expect(getParagraphSpaceShortcut('  >')).toEqual({ kind: 'blockQuote' })
    expect(getParagraphSpaceShortcut('>>')).toBeNull()
    expect(getParagraphSpaceShortcut('> quote')).toBeNull()
    expect(getParagraphSpaceShortcut('hello >')).toBeNull()
  })

  it('keeps existing heading and list markers', () => {
    expect(getParagraphSpaceShortcut('###')).toEqual({ kind: 'heading', level: 3 })
    expect(getParagraphSpaceShortcut('-')).toEqual({ kind: 'dashList' })
    expect(getParagraphSpaceShortcut('*')).toEqual({ kind: 'bulletList' })
    expect(getParagraphSpaceShortcut('2.')).toEqual({ kind: 'numberedList', order: 2 })
  })
})

type DecorationCall = {
  kind: 'node' | 'inline'
  from: number
  to: number
  attrs: Record<string, string>
}

function getAnnotationDecorationCalls(
  textContent: string,
  textChildren?: Array<{ text: string; position: number }>,
) {
  const calls: DecorationCall[] = []
  class FakePlugin {
    spec: any

    constructor(spec: any) {
      this.spec = spec
    }
  }

  const pluginBundle = annotationLinePlugin({
    pmState: {
      Plugin: FakePlugin,
    },
    pmView: {
      Decoration: {
        node: (from: number, to: number, attrs: Record<string, string>) => {
          calls.push({ kind: 'node', from, to, attrs })
          return calls.at(-1)
        },
        inline: (from: number, to: number, attrs: Record<string, string>) => {
          calls.push({ kind: 'inline', from, to, attrs })
          return calls.at(-1)
        },
      },
      DecorationSet: {
        create: (_doc: unknown, decorations: unknown[]) => decorations,
      },
    },
  })

  const pluginFactory = pluginBundle.wysiwygPlugins[0]
  const plugin = pluginFactory() as FakePlugin
  const contentSize = textChildren
    ? Math.max(textContent.length, ...textChildren.map((child) => child.position + child.text.length))
    : textContent.length
  const doc = {
    descendants: (visitor: (node: unknown, position: number) => unknown) => {
      visitor(
        {
          type: { name: 'paragraph' },
          textContent,
          nodeSize: contentSize + 2,
          descendants: textChildren
            ? (childVisitor: (node: unknown, position: number) => unknown) => {
                textChildren.forEach((child) => {
                  childVisitor({ isText: true, text: child.text }, child.position)
                })
              }
            : undefined,
        },
        0,
      )
    },
  }

  plugin.spec.props.decorations({ doc })
  return calls
}

function createParagraphNode(textContent: string, textChildren?: Array<{ text: string; position: number }>) {
  const contentSize = textChildren
    ? Math.max(textContent.length, ...textChildren.map((child) => child.position + child.text.length))
    : textContent.length

  return {
    type: { name: 'paragraph' },
    textContent,
    nodeSize: contentSize + 2,
    descendants: textChildren
      ? (childVisitor: (node: unknown, position: number) => unknown) => {
          textChildren.forEach((child) => {
            childVisitor({ isText: true, text: child.text }, child.position)
          })
        }
      : undefined,
  }
}

function getAnnotationAppendTransactionOps(
  textContent: string,
  textChildren?: Array<{ text: string; position: number }>,
) {
  const pluginBundle = annotationLinePlugin({
    pmState: {
      Plugin: class {
        spec: any

        constructor(spec: any) {
          this.spec = spec
        }
      },
    },
    pmView: {
      Decoration: {
        node: () => null,
        inline: () => null,
      },
      DecorationSet: {
        create: () => [],
      },
    },
  })

  const plugin = pluginBundle.wysiwygPlugins[0]() as { spec: any }
  const ops: Array<{ kind: 'delete'; from: number; to: number } | { kind: 'insertText'; text: string; position: number }> = []
  const tr = {
    delete: (from: number, to: number) => {
      ops.push({ kind: 'delete', from, to })
      return tr
    },
    insertText: (text: string, position: number) => {
      ops.push({ kind: 'insertText', text, position })
      return tr
    },
  }
  const doc = {
    descendants: (visitor: (node: unknown, position: number) => unknown) => {
      visitor(createParagraphNode(textContent, textChildren), 0)
    },
  }

  const result = plugin.spec.appendTransaction([{ docChanged: true }], {}, { doc, tr })
  return result ? ops : []
}

describe('annotation line WYSIWYG decorations', () => {
  it('decorates arrow markers anywhere in the paragraph', () => {
    const cases = [
      ['^-- note', ANNOTATION_LINE_ARROW_UP_CLASS_NAME, ANNOTATION_LINE_TAIL_RIGHT_CLASS_NAME],
      ['note --^', ANNOTATION_LINE_ARROW_UP_CLASS_NAME, ANNOTATION_LINE_TAIL_LEFT_CLASS_NAME],
      ['j v--', ANNOTATION_LINE_ARROW_DOWN_CLASS_NAME, ANNOTATION_LINE_TAIL_RIGHT_CLASS_NAME],
      ['j --v', ANNOTATION_LINE_ARROW_DOWN_CLASS_NAME, ANNOTATION_LINE_TAIL_LEFT_CLASS_NAME],
    ] as const

    cases.forEach(([source, directionClassName, tailClassName]) => {
      const nodeDecoration = getAnnotationDecorationCalls(source).find((call) => call.kind === 'node')
      expect(nodeDecoration?.attrs.class.split(' ')).toEqual(
        expect.arrayContaining([
          ANNOTATION_LINE_ARROW_CLASS_NAME,
          directionClassName,
          tailClassName,
        ]),
      )
    })
  })

  it('hides suffix and middle arrow markers in the live editor decoration range', () => {
    expect(getAnnotationDecorationCalls('asdf --^').find((call) => call.kind === 'inline')).toMatchObject({
      from: 5,
      to: 9,
      attrs: { class: ANNOTATION_LINE_MARKER_CLASS_NAME },
    })

    expect(getAnnotationDecorationCalls('one --v two').find((call) => call.kind === 'inline')).toMatchObject({
      from: 5,
      to: 9,
      attrs: { class: ANNOTATION_LINE_MARKER_CLASS_NAME },
    })
  })

  it('maps live marker hiding through split ProseMirror text children', () => {
    expect(
      getAnnotationDecorationCalls('asdf --^', [
        { text: 'asdf ', position: 0 },
        { text: '--^', position: 6 },
      ]).find((call) => call.kind === 'inline'),
    ).toMatchObject({
      from: 5,
      to: 10,
      attrs: { class: ANNOTATION_LINE_MARKER_CLASS_NAME },
    })
  })

  it('normalizes suffix arrow markers into the canonical prefix form in the live editor', () => {
    expect(getAnnotationAppendTransactionOps('asdf --^')).toEqual([
      { kind: 'delete', from: 5, to: 9 },
      { kind: 'insertText', text: '--^ ', position: 1 },
    ])
  })

  it('normalizes middle arrow markers while preserving later marker text', () => {
    expect(getAnnotationAppendTransactionOps('one --v two --^ three')).toEqual([
      { kind: 'delete', from: 5, to: 9 },
      { kind: 'insertText', text: '--v ', position: 1 },
    ])
  })

  it('normalizes suffix markers through split ProseMirror text children', () => {
    expect(
      getAnnotationAppendTransactionOps('asdf --^', [
        { text: 'asdf ', position: 0 },
        { text: '--^', position: 6 },
      ]),
    ).toEqual([
      { kind: 'delete', from: 5, to: 10 },
      { kind: 'insertText', text: '--^ ', position: 1 },
    ])
  })

  it('leaves start-of-line arrow markers and regular annotations alone', () => {
    expect(getAnnotationAppendTransactionOps('--^ asdf')).toEqual([])
    expect(getAnnotationAppendTransactionOps('-- asdf')).toEqual([])
  })
})
