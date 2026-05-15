import { describe, expect, it } from 'vitest'
import type { Editor } from '@toast-ui/editor'
import {
  ANNOTATION_LINE_ARROW_CLASS_NAME,
  ANNOTATION_LINE_ARROW_DOWN_CLASS_NAME,
  ANNOTATION_LINE_ARROW_UP_CLASS_NAME,
  ANNOTATION_INLINE_ARROW_CLASS_NAME,
  ANNOTATION_LINE_MARKER_CLASS_NAME,
  ANNOTATION_LINE_TAIL_LEFT_CLASS_NAME,
  ANNOTATION_LINE_TAIL_RIGHT_CLASS_NAME,
} from './annotation-line'
import { shouldDeleteEmptyParagraphAtListBoundary } from './empty-paragraph-list-delete'
import {
  annotationLinePlugin,
  getActiveHeadingLevel,
  getArrowMarkerDeletionRange,
  getArrowMarkerNavigationPosition,
  getParagraphSpaceShortcut,
} from './editor-setup'

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
  kind: 'node' | 'inline' | 'widget'
  from: number
  to?: number
  attrs?: Record<string, string>
  classNames?: string[]
  side?: unknown
  relaxedSide?: unknown
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
        widget: (from: number, _toDOM: () => HTMLElement, spec?: Record<string, unknown>) => {
          calls.push({
            kind: 'widget',
            from,
            classNames: Array.isArray(spec?.classNames) ? spec.classNames as string[] : [],
            relaxedSide: spec?.relaxedSide,
            side: spec?.side,
          })
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

function editorDoc(textContent: string, position = 0) {
  return {
    descendants: (visitor: (node: unknown, pos: number) => unknown) => {
      visitor(
        {
          type: { name: 'paragraph' },
          textContent,
          nodeSize: textContent.length + 2,
        },
        position,
      )
    },
  }
}

describe('annotation line WYSIWYG decorations', () => {
  it('adds inline arrow widgets anywhere in the paragraph', () => {
    const cases = [
      ['^-- note', ANNOTATION_LINE_ARROW_UP_CLASS_NAME, ANNOTATION_LINE_TAIL_RIGHT_CLASS_NAME],
      ['note --^', ANNOTATION_LINE_ARROW_UP_CLASS_NAME, ANNOTATION_LINE_TAIL_LEFT_CLASS_NAME],
      ['j v--', ANNOTATION_LINE_ARROW_DOWN_CLASS_NAME, ANNOTATION_LINE_TAIL_RIGHT_CLASS_NAME],
      ['j --v', ANNOTATION_LINE_ARROW_DOWN_CLASS_NAME, ANNOTATION_LINE_TAIL_LEFT_CLASS_NAME],
    ] as const

    cases.forEach(([source, directionClassName, tailClassName]) => {
      const widgetDecoration = getAnnotationDecorationCalls(source).find((call) => call.kind === 'widget')
      expect(widgetDecoration?.classNames).toEqual(
        expect.arrayContaining([
          ANNOTATION_INLINE_ARROW_CLASS_NAME,
          ANNOTATION_LINE_ARROW_CLASS_NAME,
          directionClassName,
          tailClassName,
        ]),
      )
    })
  })

  it('hides suffix and middle arrow markers in the live editor decoration range', () => {
    expect(getAnnotationDecorationCalls('asdf --^').find((call) => call.kind === 'inline')).toMatchObject({
      from: 6,
      to: 9,
      attrs: { class: ANNOTATION_LINE_MARKER_CLASS_NAME },
    })

    expect(getAnnotationDecorationCalls('one --v two').find((call) => call.kind === 'inline')).toMatchObject({
      from: 5,
      to: 8,
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
      from: 7,
      to: 10,
      attrs: { class: ANNOTATION_LINE_MARKER_CLASS_NAME },
    })
  })

  it('adds a widget and hides the raw marker for every arrow marker without moving text', () => {
    const calls = getAnnotationDecorationCalls('one --^ two v-- three')
    const inlineDecorations = calls.filter((call) => call.kind === 'inline')
    const widgetDecorations = calls.filter((call) => call.kind === 'widget')

    expect(inlineDecorations).toEqual([
      {
        kind: 'inline',
        from: 5,
        to: 8,
        attrs: { class: ANNOTATION_LINE_MARKER_CLASS_NAME },
      },
      {
        kind: 'inline',
        from: 13,
        to: 16,
        attrs: { class: ANNOTATION_LINE_MARKER_CLASS_NAME },
      },
    ])
    expect(widgetDecorations.map((call) => call.from)).toEqual([5, 13])
    expect(widgetDecorations.map((call) => call.side)).toEqual([1, 1])
    expect(widgetDecorations.map((call) => call.relaxedSide)).toEqual([true, true])
    expect(widgetDecorations.map((call, index) => call.from === inlineDecorations[index].from)).toEqual([true, true])
  })

  it('places a start-of-line arrow widget after the paragraph-start cursor position', () => {
    const calls = getAnnotationDecorationCalls('--^ note')
    const inlineDecoration = calls.find((call) => call.kind === 'inline')
    const widgetDecoration = calls.find((call) => call.kind === 'widget')

    expect(inlineDecoration).toMatchObject({
      from: 1,
      to: 4,
      attrs: { class: ANNOTATION_LINE_MARKER_CLASS_NAME },
    })
    expect(widgetDecoration).toMatchObject({
      from: 1,
      side: 1,
      relaxedSide: true,
    })
  })
})

describe('annotation arrow deletion', () => {
  it('deletes the full arrow marker when backspacing from its right edge', () => {
    expect(getArrowMarkerDeletionRange({
      doc: editorDoc('asdf --^'),
      selection: { empty: true, from: 9, to: 9 },
    }, 'Backspace')).toEqual({ from: 6, to: 9 })
  })

  it('deletes the full arrow marker when deleting from its left edge', () => {
    expect(getArrowMarkerDeletionRange({
      doc: editorDoc('asdf --^'),
      selection: { empty: true, from: 6, to: 6 },
    }, 'Delete')).toEqual({ from: 6, to: 9 })
  })

  it('expands a partial marker selection to the full arrow marker', () => {
    expect(getArrowMarkerDeletionRange({
      doc: editorDoc('one --^ two'),
      selection: { empty: false, from: 6, to: 7 },
    }, 'Backspace')).toEqual({ from: 5, to: 8 })
  })

  it('does not intercept regular annotation lines or non-delete keys', () => {
    expect(getArrowMarkerDeletionRange({
      doc: editorDoc('-- text'),
      selection: { empty: true, from: 2, to: 2 },
    }, 'Backspace')).toBeNull()

    expect(getArrowMarkerDeletionRange({
      doc: editorDoc('asdf --^'),
      selection: { empty: true, from: 9, to: 9 },
    }, 'Enter')).toBeNull()
  })
})

describe('annotation arrow navigation', () => {
  it('skips the full arrow marker when moving right from its left edge', () => {
    expect(getArrowMarkerNavigationPosition({
      doc: editorDoc('asdf --^'),
      selection: { empty: true, from: 6 },
    }, 'ArrowRight')).toBe(9)
  })

  it('skips the full arrow marker when moving left from its right edge', () => {
    expect(getArrowMarkerNavigationPosition({
      doc: editorDoc('asdf --^'),
      selection: { empty: true, from: 9 },
    }, 'ArrowLeft')).toBe(6)
  })

  it('moves out of the full marker when the cursor is already inside it', () => {
    expect(getArrowMarkerNavigationPosition({
      doc: editorDoc('asdf --^'),
      selection: { empty: true, from: 7 },
    }, 'ArrowRight')).toBe(9)

    expect(getArrowMarkerNavigationPosition({
      doc: editorDoc('asdf --^'),
      selection: { empty: true, from: 7 },
    }, 'ArrowLeft')).toBe(6)
  })

  it('skips the matching marker when multiple arrow markers are present', () => {
    expect(getArrowMarkerNavigationPosition({
      doc: editorDoc('one --^ two v-- three'),
      selection: { empty: true, from: 13 },
    }, 'ArrowRight')).toBe(16)

    expect(getArrowMarkerNavigationPosition({
      doc: editorDoc('one --^ two v-- three'),
      selection: { empty: true, from: 16 },
    }, 'ArrowLeft')).toBe(13)
  })

  it('does not intercept regular lines, non-arrow keys, or range selections', () => {
    expect(getArrowMarkerNavigationPosition({
      doc: editorDoc('-- text'),
      selection: { empty: true, from: 2 },
    }, 'ArrowRight')).toBeNull()

    expect(getArrowMarkerNavigationPosition({
      doc: editorDoc('asdf --^'),
      selection: { empty: true, from: 6 },
    }, 'ArrowDown')).toBeNull()

    expect(getArrowMarkerNavigationPosition({
      doc: editorDoc('asdf --^'),
      selection: { empty: false, from: 6 },
    }, 'ArrowRight')).toBeNull()
  })
})
