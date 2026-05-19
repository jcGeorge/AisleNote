import { describe, expect, it } from 'vitest'
import type { Editor } from '@toast-ui/editor'
import { Schema } from 'prosemirror-model'
import { EditorState, Selection, TextSelection } from 'prosemirror-state'
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
  applyParagraphSpaceShortcut,
  annotationLinePlugin,
  BLOCK_INDENT_CLASS_NAME,
  BLOCK_INDENT_TOKEN_HIDDEN_CLASS_NAME,
  blockIndentPlugin,
  deleteEmptyListItemBackward,
  getActiveHeadingLevel,
  getArrowMarkerDeletionRange,
  getArrowMarkerNavigationPosition,
  getArrowMarkerSelectionSnapPosition,
  getBlockIndentDecorationRanges,
  getParagraphSpaceShortcut,
  headingSpaceShortcutPlugin,
} from './editor-setup'
import { BLOCK_INDENT_TOKEN, INDENT_TOKEN } from '../markdown/markdown-utils'

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

const paragraphShortcutSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    text: { group: 'inline' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      toDOM: () => ['p', 0],
    },
    blockQuote: {
      group: 'block',
      content: 'block+',
      toDOM: () => ['blockquote', 0],
    },
    heading: {
      group: 'block',
      content: 'inline*',
      attrs: {
        level: { default: 1 },
        headingType: { default: 'atx' },
      },
      toDOM: () => ['h1', 0],
    },
    bulletList: {
      group: 'block',
      content: 'listItem+',
      toDOM: () => ['ul', 0],
    },
    orderedList: {
      group: 'block',
      content: 'listItem+',
      attrs: {
        order: { default: 1 },
      },
      toDOM: () => ['ol', 0],
    },
    listItem: {
      content: 'paragraph block*',
      toDOM: () => ['li', 0],
    },
  },
})

describe('paragraph space shortcut WYSIWYG behavior', () => {
  it('turns a bare asterisk marker into a bullet list on Space', () => {
    const doc = paragraphShortcutSchema.nodes.doc.create(null, [
      paragraphShortcutSchema.nodes.paragraph.create(null, paragraphShortcutSchema.text('*')),
    ])
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 2),
    })
    let nextState = state

    expect(applyParagraphSpaceShortcut(state, (transaction: any) => {
      nextState = state.apply(transaction)
    })).toBe(true)

    expect(nextState.doc.child(0).type.name).toBe('bulletList')
    expect(nextState.doc.child(0).child(0).type.name).toBe('listItem')
    expect(nextState.doc.child(0).textContent).toBe('')
  })

  it('turns a bare greater-than marker into a blockquote on Space', () => {
    const doc = paragraphShortcutSchema.nodes.doc.create(null, [
      paragraphShortcutSchema.nodes.paragraph.create(null, paragraphShortcutSchema.text('>')),
    ])
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 2),
    })
    const pluginBundle = headingSpaceShortcutPlugin({
      pmKeymap: {
        keymap: (bindings: Record<string, unknown>) => bindings,
      },
      pmState: {
        Selection: Selection as unknown as {
          near: (resolvedPos: unknown, bias?: number) => unknown
        },
        TextSelection: TextSelection as unknown as {
          create: (doc: unknown, anchor: number, head?: number) => unknown
        },
      },
    })
    const bindings = pluginBundle.wysiwygPlugins[0]() as Record<string, any>
    let nextState = state

    expect(bindings.Space(state, (transaction: any) => {
      nextState = state.apply(transaction)
    })).toBe(true)

    expect(nextState.doc.child(0).type.name).toBe('blockQuote')
    expect(nextState.doc.child(0).child(0).type.name).toBe('paragraph')
    expect(nextState.doc.child(0).textContent).toBe('')
  })
})

const listBackspaceSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    text: { group: 'inline' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      toDOM: () => ['p', 0],
    },
    bulletList: {
      group: 'block',
      content: 'listItem+',
      toDOM: () => ['ul', 0],
    },
    orderedList: {
      group: 'block',
      content: 'listItem+',
      toDOM: () => ['ol', 0],
    },
    listItem: {
      content: 'paragraph block*',
      toDOM: () => ['li', 0],
    },
  },
})

function pmParagraph(text: string) {
  return text
    ? listBackspaceSchema.nodes.paragraph.create(null, listBackspaceSchema.text(text))
    : listBackspaceSchema.nodes.paragraph.create()
}

function pmListItem(text: string) {
  return listBackspaceSchema.nodes.listItem.create(null, pmParagraph(text))
}

function findParagraphPosition(doc: any, textContent: string): number {
  let found = -1
  doc.descendants((candidate: any, position: number) => {
    if (candidate.type.name === 'paragraph' && candidate.textContent === textContent && found < 0) {
      found = position
      return false
    }
    return true
  })
  return found
}

describe('empty list item Backspace behavior', () => {
  it('deletes an empty middle list item and places the cursor at the previous item end', () => {
    const list = listBackspaceSchema.nodes.bulletList.create(null, [
      pmListItem('asdf 1'),
      pmListItem(''),
      pmListItem('asdf 3'),
    ])
    const doc = listBackspaceSchema.nodes.doc.create(null, [list])
    const emptyParagraphPosition = findParagraphPosition(doc, '')
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, emptyParagraphPosition + 1),
    })
    let nextState = state

    expect(deleteEmptyListItemBackward(state, (tr) => {
      nextState = state.apply(tr as any)
    })).toBe(true)

    const nextList = nextState.doc.child(0)
    const previousParagraphPosition = findParagraphPosition(nextState.doc, 'asdf 1')
    expect(nextList.childCount).toBe(2)
    expect(nextList.child(0).textContent).toBe('asdf 1')
    expect(nextList.child(1).textContent).toBe('asdf 3')
    expect(nextState.selection.from).toBe(previousParagraphPosition + 1 + 'asdf 1'.length)
  })

  it('leaves non-empty and first list items to native Backspace behavior', () => {
    const list = listBackspaceSchema.nodes.bulletList.create(null, [
      pmListItem(''),
      pmListItem('text'),
    ])
    const doc = listBackspaceSchema.nodes.doc.create(null, [list])
    const firstParagraphPosition = findParagraphPosition(doc, '')
    const textParagraphPosition = findParagraphPosition(doc, 'text')

    expect(deleteEmptyListItemBackward(EditorState.create({
      doc,
      selection: TextSelection.create(doc, firstParagraphPosition + 1),
    }))).toBe(false)

    expect(deleteEmptyListItemBackward(EditorState.create({
      doc,
      selection: TextSelection.create(doc, textParagraphPosition + 1),
    }))).toBe(false)
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
  selectionFrom?: number,
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

  plugin.spec.props.decorations({
    doc,
    selection: typeof selectionFrom === 'number' ? { empty: true, from: selectionFrom } : undefined,
  })
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

function blockIndentDoc(textContent: string, textChildren?: Array<{ text: string; position: number }>) {
  const contentSize = textChildren
    ? Math.max(textContent.length, ...textChildren.map((child) => child.position + child.text.length))
    : textContent.length
  return {
    descendants: (visitor: (node: unknown, pos: number) => unknown) => {
      visitor(
        {
          isTextblock: true,
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
}

function getBlockIndentDecorationCalls(textContent: string, textChildren?: Array<{ text: string; position: number }>) {
  const calls: DecorationCall[] = []
  class FakePlugin {
    spec: any

    constructor(spec: any) {
      this.spec = spec
    }
  }

  const pluginBundle = blockIndentPlugin({
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
  const plugin = pluginBundle.wysiwygPlugins[0]() as FakePlugin

  plugin.spec.props.decorations({ doc: blockIndentDoc(textContent, textChildren) })
  return calls
}

describe('block indent WYSIWYG decorations', () => {
  it('finds only the block indent marker range and leaves paragraph indents stackable', () => {
    const ranges = getBlockIndentDecorationRanges(blockIndentDoc(`${BLOCK_INDENT_TOKEN}${INDENT_TOKEN}one`))

    expect(ranges).toEqual([
      {
        nodeFrom: 0,
        nodeTo: BLOCK_INDENT_TOKEN.length + INDENT_TOKEN.length + 3 + 2,
        tokenFrom: 1,
        tokenTo: 1 + BLOCK_INDENT_TOKEN.length,
      },
    ])
  })

  it('adds a block-level class and hides the storage marker token', () => {
    const calls = getBlockIndentDecorationCalls(`${BLOCK_INDENT_TOKEN}one`, [
      { text: BLOCK_INDENT_TOKEN, position: 0 },
      { text: 'one', position: BLOCK_INDENT_TOKEN.length },
    ])

    expect(calls).toEqual([
      {
        kind: 'node',
        from: 0,
        to: BLOCK_INDENT_TOKEN.length + 3 + 2,
        attrs: { class: BLOCK_INDENT_CLASS_NAME },
      },
      {
        kind: 'inline',
        from: 1,
        to: 1 + BLOCK_INDENT_TOKEN.length,
        attrs: { class: BLOCK_INDENT_TOKEN_HIDDEN_CLASS_NAME },
      },
    ])
  })
})

describe('annotation line WYSIWYG decorations', () => {
  it('adds inline arrow replacement classes anywhere in the paragraph', () => {
    const cases = [
      ['^-- note', ANNOTATION_LINE_ARROW_UP_CLASS_NAME, ANNOTATION_LINE_TAIL_RIGHT_CLASS_NAME],
      ['note --^', ANNOTATION_LINE_ARROW_UP_CLASS_NAME, ANNOTATION_LINE_TAIL_LEFT_CLASS_NAME],
      ['j v--', ANNOTATION_LINE_ARROW_DOWN_CLASS_NAME, ANNOTATION_LINE_TAIL_RIGHT_CLASS_NAME],
      ['j --v', ANNOTATION_LINE_ARROW_DOWN_CLASS_NAME, ANNOTATION_LINE_TAIL_LEFT_CLASS_NAME],
    ] as const

    cases.forEach(([source, directionClassName, tailClassName]) => {
      const inlineDecoration = getAnnotationDecorationCalls(source).find((call) => call.kind === 'inline')
      expect(inlineDecoration?.attrs?.class?.split(' ')).toEqual(expect.arrayContaining([
        ANNOTATION_LINE_MARKER_CLASS_NAME,
        ANNOTATION_INLINE_ARROW_CLASS_NAME,
        ANNOTATION_LINE_ARROW_CLASS_NAME,
        directionClassName,
        tailClassName,
      ]))
    })
  })

  it('hides suffix and middle arrow markers in the live editor decoration range', () => {
    expect(getAnnotationDecorationCalls('asdf --^').find((call) => call.kind === 'inline')).toMatchObject({
      from: 6,
      to: 9,
      attrs: { class: expect.stringContaining(ANNOTATION_LINE_MARKER_CLASS_NAME) },
    })

    expect(getAnnotationDecorationCalls('one --v two').find((call) => call.kind === 'inline')).toMatchObject({
      from: 5,
      to: 8,
      attrs: { class: expect.stringContaining(ANNOTATION_LINE_MARKER_CLASS_NAME) },
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
      attrs: { class: expect.stringContaining(ANNOTATION_LINE_MARKER_CLASS_NAME) },
    })
  })

  it('replaces every arrow marker in place without moving text', () => {
    const calls = getAnnotationDecorationCalls('one --^ two v-- three')
    const inlineDecorations = calls.filter((call) => call.kind === 'inline')

    expect(inlineDecorations.map((call) => ({ from: call.from, to: call.to }))).toEqual([
      { from: 5, to: 8 },
      { from: 13, to: 16 },
    ])
    inlineDecorations.forEach((call) => {
      expect(call.attrs?.class?.split(' ')).toEqual(expect.arrayContaining([
        ANNOTATION_LINE_MARKER_CLASS_NAME,
        ANNOTATION_INLINE_ARROW_CLASS_NAME,
        ANNOTATION_LINE_ARROW_CLASS_NAME,
      ]))
    })
  })

  it('places a start-of-line arrow replacement after the paragraph-start cursor position', () => {
    const calls = getAnnotationDecorationCalls('--^ note')
    const inlineDecoration = calls.find((call) => call.kind === 'inline')

    expect(inlineDecoration).toMatchObject({
      from: 1,
      to: 4,
      attrs: { class: expect.stringContaining(ANNOTATION_INLINE_ARROW_CLASS_NAME) },
    })
  })

  it('adds a visible caret proxy at arrow marker boundaries', () => {
    expect(
      getAnnotationDecorationCalls('asdf --^', undefined, 6).find((call) =>
        call.kind === 'widget' && call.classNames?.includes('tabs-annotation-arrow-boundary-caret'),
      ),
    ).toMatchObject({
      from: 6,
      side: -1,
      relaxedSide: true,
    })

    expect(
      getAnnotationDecorationCalls('asdf --^', undefined, 9).find((call) =>
        call.kind === 'widget' && call.classNames?.includes('tabs-annotation-arrow-boundary-caret'),
      ),
    ).toMatchObject({
      from: 9,
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
      selection: { empty: true, from: 6 },
    }, 'ArrowUp')).toBeNull()

    expect(getArrowMarkerNavigationPosition({
      doc: editorDoc('asdf --^'),
      selection: { empty: false, from: 6 },
    }, 'ArrowRight')).toBeNull()
  })
})

describe('annotation arrow cursor normalization', () => {
  it('snaps mouse selections out of the hidden marker', () => {
    expect(getArrowMarkerSelectionSnapPosition({
      doc: editorDoc('asdf --^'),
      selection: { empty: true, from: 7 },
    })).toBe(6)

    expect(getArrowMarkerSelectionSnapPosition({
      doc: editorDoc('asdf --^'),
      selection: { empty: true, from: 8 },
    })).toBe(9)
  })

  it('leaves visible marker edges and non-arrow selections alone', () => {
    expect(getArrowMarkerSelectionSnapPosition({
      doc: editorDoc('asdf --^'),
      selection: { empty: true, from: 6 },
    })).toBeNull()

    expect(getArrowMarkerSelectionSnapPosition({
      doc: editorDoc('-- note'),
      selection: { empty: true, from: 2 },
    })).toBeNull()
  })
})
