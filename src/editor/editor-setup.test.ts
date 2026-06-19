import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import type { Editor } from '@toast-ui/editor'
import { Fragment, Schema } from 'prosemirror-model'
import { EditorState, Plugin, Selection, TextSelection } from 'prosemirror-state'
import {
  ANNOTATION_LINE_ARROW_CLASS_NAME,
  ANNOTATION_LINE_ARROW_DOWN_CLASS_NAME,
  ANNOTATION_LINE_ARROW_LEFT_CLASS_NAME,
  ANNOTATION_LINE_ARROW_RIGHT_CLASS_NAME,
  ANNOTATION_LINE_ARROW_UP_CLASS_NAME,
  ANNOTATION_INLINE_ARROW_CLASS_NAME,
  ANNOTATION_LINE_MARKER_CLASS_NAME,
  ANNOTATION_LINE_TAIL_LEFT_CLASS_NAME,
  ANNOTATION_LINE_TAIL_RIGHT_CLASS_NAME,
} from './annotation-line'
import { shouldDeleteEmptyParagraphAtListBoundary } from './empty-paragraph-list-delete'
import {
  applyParagraphSpaceShortcut,
  applyTypedCodeBlockShortcut,
  annotationLinePlugin,
  BLOCK_INDENT_BOUNDARY_ACTIVE_CLASS_NAME,
  BLOCK_INDENT_CLASS_NAME,
  BLOCK_INDENT_TOKEN_HIDDEN_CLASS_NAME,
  blockIndentPlugin,
  deleteEmptyListItemBackward,
  getActiveHeadingLevel,
  getArrowMarkerDeletionRange,
  getArrowMarkerNavigationPosition,
  getArrowMarkerSelectionSnapPosition,
  getBlockIndentBoundaryArrowDownPosition,
  getBlockIndentBoundaryNavigationPosition,
  getBlockIndentClickBoundaryPosition,
  getBlockIndentDecorationRanges,
  getBlockIndentVisibleLineStartPosition,
  getClosedHighlightMarkerShortcut,
  getParagraphSpaceShortcut,
  getToastUiToolbarTooltipLabelFromClassName,
  getTagDecorationRanges,
  EDITOR_SPELLCHECK_ROOT_SELECTOR,
  headingSpaceShortcutPlugin,
  highlightPlugin,
  installEditorSpellcheck,
  normalizeBlockIndentBoundaryPosition,
  normalizeBlockIndentSelectionBoundaries,
  TAG_JUMP_HIGHLIGHT_META,
  TAG_JUMP_TARGET_CLASS_NAME,
  thematicBreakShortcutPlugin,
  tagAppearancePlugin,
  toggleHighlightMark,
  uncheckedTaskEnterPlugin,
} from './editor-setup'
import { getBulletListMarkerFromAttrs } from './list-markers'
import { BLOCK_INDENT_TOKEN, INDENT_TOKEN } from '../markdown/markdown-utils'
import { TAG_TOKEN_CLASS_NAME } from '../tags/tags.js'

const editorSetupSource = readFileSync(fileURLToPath(new URL('./editor-setup.ts', import.meta.url)), 'utf8')
const notebookAisleEditorsSource = readFileSync(fileURLToPath(new URL('./useNotebookAisleEditors.ts', import.meta.url)), 'utf8')

function node(typeName: string, textContent = '', contentSize = 0) {
  return {
    type: { name: typeName },
    textContent,
    content: { size: contentSize },
  }
}

describe('imperative editor toolbar tooltips', () => {
  it('maps Toast UI toolbar icon classes to app tooltip labels', () => {
    expect(getToastUiToolbarTooltipLabelFromClassName('toastui-editor-toolbar-icons heading')).toBe('Headings')
    expect(getToastUiToolbarTooltipLabelFromClassName('toastui-editor-toolbar-icons bullet-list')).toBe('Bullet list')
    expect(getToastUiToolbarTooltipLabelFromClassName('toastui-editor-toolbar-icons codeblock')).toBe('Code block')
    expect(getToastUiToolbarTooltipLabelFromClassName('toastui-editor-toolbar-icons unknown')).toBeNull()
  })

  it('uses app tooltip attributes for app-created toolbar buttons', () => {
    expect(editorSetupSource).toContain('export function installToolbarAppTooltips(root: HTMLElement)')
    expect(editorSetupSource).toContain("button.setAttribute('data-app-tooltip', tooltipLabel)")
    expect(editorSetupSource).toContain("button.setAttribute('data-app-tooltip', 'Clear contents')")
    expect(editorSetupSource).toContain(
      "createToolbarTextButton('aisles-toolbar-btn', 'aisles', 'A', options.onAisles, 'Aisles')",
    )
    expect(editorSetupSource).toContain("button.removeAttribute('title')")
    expect(notebookAisleEditorsSource).toContain('installToolbarAppTooltips(root)')
  })

  it('does not bind app-created toolbar buttons to the Toast UI internal tooltip', () => {
    expect(editorSetupSource).not.toContain('bindToolbarTooltip')
    expect(editorSetupSource).not.toContain("querySelector('.toastui-editor-tooltip')")
    expect(editorSetupSource).not.toContain("tooltip.style.display = 'block'")
  })

  it('enables native spellcheck on editable Toast UI ProseMirror roots', () => {
    const editableRoot = { setAttribute: vi.fn(), spellcheck: false }
    const root = {
      querySelectorAll: vi.fn((selector: string) => {
        expect(selector).toBe(EDITOR_SPELLCHECK_ROOT_SELECTOR)
        return [editableRoot]
      }),
    } as unknown as HTMLElement

    const cleanup = installEditorSpellcheck(root)

    expect(editableRoot.setAttribute).toHaveBeenCalledWith('spellcheck', 'true')
    expect(editableRoot.spellcheck).toBe(true)
    cleanup()
  })

  it('installs editor spellcheck for notebook aisle editors', () => {
    expect(editorSetupSource).toContain(
      "export const EDITOR_SPELLCHECK_ROOT_SELECTOR = '.toastui-editor .ProseMirror[contenteditable=\"true\"]'",
    )
    expect(notebookAisleEditorsSource).toContain('installEditorSpellcheck(root)')
  })
})

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

  it('deletes a terminal preview before an empty paragraph on forward Delete', () => {
    const bindings = getParagraphSpaceBindings()
    const preview = paragraphShortcutSchema.nodes.paragraph.create(null, paragraphShortcutSchema.text('![Linked](Linked--123abc)'))
    const empty = paragraphShortcutSchema.nodes.paragraph.create()
    const heading = paragraphShortcutSchema.nodes.heading.create({ level: 2 }, paragraphShortcutSchema.text('After'))
    const doc = paragraphShortcutSchema.nodes.doc.create(null, [preview, empty, heading])
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, preview.nodeSize + 1),
    })
    let nextState = state

    expect(bindings.Delete(state, (tr: unknown) => {
      nextState = state.apply(tr as any)
    })).toBe(true)

    expect(nextState.doc.childCount).toBe(2)
    expect(nextState.doc.child(0).textContent).toBe('')
    expect(nextState.doc.child(1).textContent).toBe('After')
    expect(nextState.selection.from).toBe(1)
  })

  it('keeps a terminal preview when forward Delete runs from a separated blank paragraph', () => {
    const bindings = getParagraphSpaceBindings()
    const preview = paragraphShortcutSchema.nodes.paragraph.create(null, paragraphShortcutSchema.text('![Linked](Linked--123abc)'))
    const firstEmpty = paragraphShortcutSchema.nodes.paragraph.create()
    const secondEmpty = paragraphShortcutSchema.nodes.paragraph.create()
    const heading = paragraphShortcutSchema.nodes.heading.create({ level: 2 }, paragraphShortcutSchema.text('After'))
    const doc = paragraphShortcutSchema.nodes.doc.create(null, [preview, firstEmpty, secondEmpty, heading])
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, preview.nodeSize + firstEmpty.nodeSize + 1),
    })
    let nextState = state

    expect(bindings.Delete(state, (tr: unknown) => {
      nextState = state.apply(tr as any)
    })).toBe(true)

    expect(nextState.doc.childCount).toBe(3)
    expect(nextState.doc.child(0).textContent).toBe('![Linked](Linked--123abc)')
    expect(nextState.doc.child(1).textContent).toBe('')
    expect(nextState.doc.child(2).textContent).toBe('After')
  })

  it('deletes a terminal code block from Backspace at the start of following text', () => {
    const bindings = getParagraphSpaceBindings()
    const codeBlock = paragraphShortcutSchema.nodes.codeBlock.create(null, paragraphShortcutSchema.text('code'))
    const after = paragraphShortcutSchema.nodes.paragraph.create(null, paragraphShortcutSchema.text('After'))
    const doc = paragraphShortcutSchema.nodes.doc.create(null, [codeBlock, after])
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, codeBlock.nodeSize + 1),
    })
    let nextState = state

    expect(bindings.Backspace(state, (tr: unknown) => {
      nextState = state.apply(tr as any)
    })).toBe(true)

    expect(nextState.doc.childCount).toBe(1)
    expect(nextState.doc.child(0).type.name).toBe('paragraph')
    expect(nextState.doc.child(0).textContent).toBe('After')
    expect(nextState.selection.from).toBe(1)
  })

  it('deletes a terminal table from forward Delete in an empty spacer', () => {
    const bindings = getParagraphSpaceBindings()
    const table = paragraphShortcutSchema.nodes.table.create(null, [
      paragraphShortcutSchema.nodes.paragraph.create(null, paragraphShortcutSchema.text('Cell')),
    ])
    const empty = paragraphShortcutSchema.nodes.paragraph.create()
    const after = paragraphShortcutSchema.nodes.paragraph.create(null, paragraphShortcutSchema.text('After'))
    const doc = paragraphShortcutSchema.nodes.doc.create(null, [table, empty, after])
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, table.nodeSize + 1),
    })
    let nextState = state

    expect(bindings.Delete(state, (tr: unknown) => {
      nextState = state.apply(tr as any)
    })).toBe(true)

    expect(nextState.doc.childCount).toBe(2)
    expect(nextState.doc.child(0).textContent).toBe('')
    expect(nextState.doc.child(1).textContent).toBe('After')
    expect(nextState.selection.from).toBe(1)
  })

  it('leaves normal blank-line Delete behavior unchanged outside previews', () => {
    const bindings = getParagraphSpaceBindings()
    const before = paragraphShortcutSchema.nodes.paragraph.create(null, paragraphShortcutSchema.text('Before'))
    const empty = paragraphShortcutSchema.nodes.paragraph.create()
    const after = paragraphShortcutSchema.nodes.paragraph.create(null, paragraphShortcutSchema.text('After'))
    const doc = paragraphShortcutSchema.nodes.doc.create(null, [before, empty, after])
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, before.nodeSize + 1),
    })

    expect(bindings.Delete(state)).toBe(false)
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
      attrs: {
        htmlAttrs: { default: null },
        classNames: { default: null },
      },
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
      attrs: {
        task: { default: null },
        checked: { default: null },
      },
      toDOM: () => ['li', 0],
    },
    codeBlock: {
      group: 'block',
      content: 'text*',
      marks: '',
      code: true,
      toDOM: () => ['pre', ['code', 0]],
    },
    table: {
      group: 'block',
      content: 'paragraph*',
      toDOM: () => ['table', ['tbody', 0]],
    },
    thematicBreak: {
      group: 'block',
      toDOM: () => ['hr'],
    },
  },
})

function getTextBlockEnd(doc: any, text: string): number {
  let position: number | null = null
  doc.descendants((node: any, nodePosition: number) => {
    if (!node?.isTextblock || node.textContent !== text) return true
    position = nodePosition + 1 + node.content.size
    return false
  })
  if (position === null) throw new Error(`could not find text block "${text}"`)
  return position
}

function getParagraphSpaceBindings() {
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
  return pluginBundle.wysiwygPlugins[0]() as Record<string, any>
}

function getParagraphSpaceTextInputPlugin() {
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
  return pluginBundle.wysiwygPlugins[1]() as { props?: { handleTextInput?: (view: any, from: number, to: number, text: string) => boolean } }
}

function getThematicBreakBindings() {
  const pluginBundle = thematicBreakShortcutPlugin({
    pmKeymap: {
      keymap: (bindings: Record<string, unknown>) => bindings,
    },
    pmModel: {
      Fragment: Fragment as unknown as {
        fromArray: (nodes: unknown[]) => unknown
      },
    },
    pmState: {
      Selection: Selection as unknown as {
        near: (resolvedPos: unknown, bias?: number) => unknown
      },
    },
    instance: {} as any,
  })
  return pluginBundle.wysiwygPlugins[0]() as Record<string, any>
}

function getTaskEnterBindings() {
  const pluginBundle = uncheckedTaskEnterPlugin({
    pmKeymap: {
      keymap: (bindings: Record<string, unknown>) => bindings,
    },
  })
  return pluginBundle.wysiwygPlugins[0]() as Record<string, any>
}

function applyParagraphSpaceShortcutToText(text: string, cursorOffset: number) {
  const doc = paragraphShortcutSchema.nodes.doc.create(null, [
    paragraphShortcutSchema.nodes.paragraph.create(null, paragraphShortcutSchema.text(text)),
  ])
  const state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, 1 + cursorOffset),
  })
  let nextState = state
  const handled = applyParagraphSpaceShortcut(state, (transaction: any) => {
    nextState = state.apply(transaction)
  })
  return { handled, state: nextState }
}

function textNode(text: string) {
  return text.length > 0 ? paragraphShortcutSchema.text(text) : undefined
}

function createShortcutView(doc: any, selectionPosition: number) {
  const state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, selectionPosition),
  })
  let nextState = state
  const view = {
    state,
    dispatch: (transaction: any) => {
      nextState = state.apply(transaction)
    },
  }
  return { state, get nextState() { return nextState }, view }
}

function taskListItem(text: string, children: any[] = [], attrs: Record<string, unknown> = {}) {
  const paragraphNode = text
    ? paragraphShortcutSchema.nodes.paragraph.create(null, paragraphShortcutSchema.text(text))
    : paragraphShortcutSchema.nodes.paragraph.create()
  return paragraphShortcutSchema.nodes.listItem.create(
    {
      task: true,
      checked: false,
      ...attrs,
    },
    [paragraphNode, ...children],
  )
}

describe('task Enter behavior', () => {
  it('exits a top-level empty task to a plain paragraph instead of creating a bullet', () => {
    const list = paragraphShortcutSchema.nodes.bulletList.create(null, [
      taskListItem('one'),
      taskListItem(''),
    ])
    const doc = paragraphShortcutSchema.nodes.doc.create(null, [list])
    const emptyParagraphPosition = findParagraphPosition(doc, '')
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, emptyParagraphPosition + 1),
    })
    const bindings = getTaskEnterBindings()
    let nextState = state

    expect(bindings.Enter(state, (transaction: any) => {
      nextState = state.apply(transaction)
    })).toBe(true)

    expect(nextState.doc.childCount).toBe(2)
    expect(nextState.doc.child(0).type.name).toBe('bulletList')
    expect(nextState.doc.child(0).childCount).toBe(1)
    expect(nextState.doc.child(0).child(0).attrs).toMatchObject({ task: true, checked: false })
    expect(nextState.doc.child(1).type.name).toBe('paragraph')
    expect(nextState.doc.child(1).textContent).toBe('')
    expect(nextState.selection.from).toBe(nextState.doc.child(0).nodeSize + 1)
  })

  it('lifts an indented empty task to an unindented task', () => {
    const nestedList = paragraphShortcutSchema.nodes.bulletList.create(null, [taskListItem('')])
    const list = paragraphShortcutSchema.nodes.bulletList.create(null, [
      taskListItem('parent', [nestedList]),
    ])
    const doc = paragraphShortcutSchema.nodes.doc.create(null, [list])
    const emptyParagraphPosition = findParagraphPosition(doc, '')
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, emptyParagraphPosition + 1),
    })
    const bindings = getTaskEnterBindings()
    let nextState = state

    expect(bindings.Enter(state, (transaction: any) => {
      nextState = state.apply(transaction)
    })).toBe(true)

    const nextList = nextState.doc.child(0)
    expect(nextList.type.name).toBe('bulletList')
    expect(nextList.childCount).toBe(2)
    expect(nextList.child(0).textContent).toBe('parent')
    expect(nextList.child(0).childCount).toBe(1)
    expect(nextList.child(1).attrs).toMatchObject({ task: true, checked: false })
    expect(nextList.child(1).textContent).toBe('')
  })

  it('leaves non-empty unchecked tasks to native Enter behavior', () => {
    const list = paragraphShortcutSchema.nodes.bulletList.create(null, [taskListItem('one')])
    const doc = paragraphShortcutSchema.nodes.doc.create(null, [list])
    const paragraphEnd = getTextBlockEnd(doc, 'one')
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, paragraphEnd),
    })

    expect(getTaskEnterBindings().Enter(state)).toBe(false)
  })
})

describe('paragraph space shortcut WYSIWYG behavior', () => {
  it('turns a heading marker at the start of an existing text line into a heading on Space', () => {
    const doc = paragraphShortcutSchema.nodes.doc.create(null, [
      paragraphShortcutSchema.nodes.paragraph.create(null, paragraphShortcutSchema.text('#Existing text')),
    ])
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 2),
    })
    let nextState = state

    expect(applyParagraphSpaceShortcut(state, (transaction: any) => {
      nextState = state.apply(transaction)
    })).toBe(true)

    expect(nextState.doc.child(0).type.name).toBe('heading')
    expect(nextState.doc.child(0).attrs.level).toBe(1)
    expect(nextState.doc.child(0).textContent).toBe('Existing text')
    expect(nextState.selection.from).toBe(1)
  })

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
    const bindings = getParagraphSpaceBindings()
    let nextState = state

    expect(bindings.Space(state, (transaction: any) => {
      nextState = state.apply(transaction)
    })).toBe(true)

    expect(nextState.doc.child(0).type.name).toBe('blockQuote')
    expect(nextState.doc.child(0).child(0).type.name).toBe('paragraph')
    expect(nextState.doc.child(0).textContent).toBe('')
  })

  it('turns a bare greater-than marker into a blockquote from typed Space input', () => {
    const doc = paragraphShortcutSchema.nodes.doc.create(null, [
      paragraphShortcutSchema.nodes.paragraph.create(null, paragraphShortcutSchema.text('>')),
    ])
    let state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 2),
    })
    const plugin = getParagraphSpaceTextInputPlugin()
    const view = {
      get state() {
        return state
      },
      dispatch: (transaction: any) => {
        state = state.apply(transaction)
      },
    }

    expect(plugin.props?.handleTextInput?.(view, 2, 2, ' ')).toBe(true)

    expect(state.doc.child(0).type.name).toBe('blockQuote')
    expect(state.doc.child(0).textContent).toBe('')
  })

  it('turns an ordered-list marker at the start of existing text into a numbered list', () => {
    const result = applyParagraphSpaceShortcutToText('1.Existing text', 2)

    expect(result.handled).toBe(true)
    expect(result.state.doc.child(0).type.name).toBe('orderedList')
    expect(result.state.doc.child(0).attrs.order).toBe(1)
    expect(result.state.doc.child(0).textContent).toBe('Existing text')
  })

  it('turns bullet and dash markers at the start of existing text into matching list items', () => {
    const bullet = applyParagraphSpaceShortcutToText('*Existing text', 1)
    const dash = applyParagraphSpaceShortcutToText('-Existing text', 1)

    expect(bullet.handled).toBe(true)
    expect(bullet.state.doc.child(0).type.name).toBe('bulletList')
    expect(getBulletListMarkerFromAttrs(bullet.state.doc.child(0).attrs)).toBe('bullet')
    expect(bullet.state.doc.child(0).textContent).toBe('Existing text')

    expect(dash.handled).toBe(true)
    expect(dash.state.doc.child(0).type.name).toBe('bulletList')
    expect(getBulletListMarkerFromAttrs(dash.state.doc.child(0).attrs)).toBe('dash')
    expect(dash.state.doc.child(0).textContent).toBe('Existing text')
  })

  it('turns a blockquote marker at the start of existing text into a quote containing that text', () => {
    const result = applyParagraphSpaceShortcutToText('>Existing text', 1)

    expect(result.handled).toBe(true)
    expect(result.state.doc.child(0).type.name).toBe('blockQuote')
    expect(result.state.doc.child(0).child(0).type.name).toBe('paragraph')
    expect(result.state.doc.child(0).textContent).toBe('Existing text')
  })

  it('does not convert non-bare inline markers in existing text', () => {
    const result = applyParagraphSpaceShortcutToText('hello >Existing text', 7)

    expect(result.handled).toBe(false)
    expect(result.state.doc.child(0).type.name).toBe('paragraph')
    expect(result.state.doc.child(0).textContent).toBe('hello >Existing text')
  })

  it('creates a horizontal rule on Enter without opting out of ProseMirror history', () => {
    const doc = paragraphShortcutSchema.nodes.doc.create(null, [
      paragraphShortcutSchema.nodes.paragraph.create(null, paragraphShortcutSchema.text('---')),
    ])
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, getTextBlockEnd(doc, '---')),
    })
    const bindings = getThematicBreakBindings()
    let dispatchedTransaction: any = null
    let nextState = state

    expect(bindings.Enter(state, (transaction: any) => {
      dispatchedTransaction = transaction
      nextState = state.apply(transaction)
    })).toBe(true)

    expect(dispatchedTransaction?.getMeta?.('addToHistory')).not.toBe(false)
    expect(nextState.doc.child(0).type.name).toBe('thematicBreak')
    expect(nextState.doc.child(1).type.name).toBe('paragraph')
  })

  it.each([
    ['1.', 'orderedList'],
    ['*', 'bulletList'],
    ['-', 'bulletList'],
    ['>', 'blockQuote'],
    ['#', 'heading'],
  ])('keeps %s marker shortcuts working immediately after a horizontal rule', (marker, expectedNodeType) => {
    const doc = paragraphShortcutSchema.nodes.doc.create(null, [
      paragraphShortcutSchema.nodes.thematicBreak.create(),
      paragraphShortcutSchema.nodes.paragraph.create(null, paragraphShortcutSchema.text(marker)),
    ])
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, getTextBlockEnd(doc, marker)),
    })
    const bindings = getParagraphSpaceBindings()
    let nextState = state

    expect(bindings.Space(state, (transaction: any) => {
      nextState = state.apply(transaction)
    })).toBe(true)

    expect(nextState.doc.child(0).type.name).toBe('thematicBreak')
    expect(nextState.doc.child(1).type.name).toBe(expectedNodeType)
  })
})

describe('typed code block shortcut WYSIWYG behavior', () => {
  it('turns triple backticks on a whitespace-only line into an empty code block', () => {
    const doc = paragraphShortcutSchema.nodes.doc.create(null, [
      paragraphShortcutSchema.nodes.paragraph.create(null, paragraphShortcutSchema.text('  ``')),
    ])
    const fixture = createShortcutView(doc, getTextBlockEnd(doc, '  ``'))

    expect(applyTypedCodeBlockShortcut(fixture.view, fixture.view.state.selection.from, fixture.view.state.selection.from, '`')).toBe(true)

    const nextState = fixture.nextState
    expect(nextState.doc.childCount).toBe(1)
    expect(nextState.doc.child(0).type.name).toBe('codeBlock')
    expect(nextState.doc.child(0).textContent).toBe('')
    expect(nextState.selection.from).toBe(1)
  })

  it('moves the code block to a new line when text already exists before the marker', () => {
    const doc = paragraphShortcutSchema.nodes.doc.create(null, [
      paragraphShortcutSchema.nodes.paragraph.create(null, paragraphShortcutSchema.text('hello ``')),
    ])
    const fixture = createShortcutView(doc, getTextBlockEnd(doc, 'hello ``'))

    expect(applyTypedCodeBlockShortcut(fixture.view, fixture.view.state.selection.from, fixture.view.state.selection.from, '`')).toBe(true)

    const nextState = fixture.nextState
    expect(nextState.doc.childCount).toBe(2)
    expect(nextState.doc.child(0).type.name).toBe('paragraph')
    expect(nextState.doc.child(0).textContent).toBe('hello ')
    expect(nextState.doc.child(1).type.name).toBe('codeBlock')
    expect(nextState.doc.child(1).textContent).toBe('')
    expect(nextState.selection.from).toBe(nextState.doc.child(0).nodeSize + 1)
  })

  it('does not trigger in the middle of a paragraph', () => {
    const doc = paragraphShortcutSchema.nodes.doc.create(null, [
      paragraphShortcutSchema.nodes.paragraph.create(null, paragraphShortcutSchema.text('hello `` after')),
    ])
    const fixture = createShortcutView(doc, 1 + 'hello ``'.length)

    expect(applyTypedCodeBlockShortcut(fixture.view, fixture.view.state.selection.from, fixture.view.state.selection.from, '`')).toBe(false)
    const nextState = fixture.nextState
    expect(nextState.doc.child(0).textContent).toBe('hello `` after')
  })

  it('does not trigger inside an existing code block', () => {
    const doc = paragraphShortcutSchema.nodes.doc.create(null, [
      paragraphShortcutSchema.nodes.codeBlock.create(null, textNode('``')),
    ])
    const fixture = createShortcutView(doc, getTextBlockEnd(doc, '``'))

    expect(applyTypedCodeBlockShortcut(fixture.view, fixture.view.state.selection.from, fixture.view.state.selection.from, '`')).toBe(false)
    const nextState = fixture.nextState
    expect(nextState.doc.child(0).type.name).toBe('codeBlock')
    expect(nextState.doc.child(0).textContent).toBe('``')
  })
})

const highlightSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    text: { group: 'inline' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      toDOM: () => ['p', 0],
    },
  },
  marks: {
    mark: {
      attrs: {
        htmlAttrs: { default: {} },
        htmlInline: { default: true },
      },
      toDOM: () => ['mark', 0],
    },
    code: {
      toDOM: () => ['code', 0],
    },
  },
})

function highlightParagraph(text: string) {
  return highlightSchema.nodes.paragraph.create(null, text ? highlightSchema.text(text) : undefined)
}

function getTextMarkNames(doc: any) {
  const names: string[] = []
  doc.descendants((node: any) => {
    if (!node?.isText) return true
    node.marks?.forEach((mark: any) => names.push(mark.type.name))
    return true
  })
  return names
}

describe('highlight plugin', () => {
  it('detects compact and spaced typed highlight markers', () => {
    expect(getClosedHighlightMarkerShortcut('==one==')).toEqual({ markerStart: 0, markerEnd: 7, text: 'one' })
    expect(getClosedHighlightMarkerShortcut('start == one ==')).toEqual({
      markerStart: 6,
      markerEnd: 15,
      text: 'one',
    })
    expect(getClosedHighlightMarkerShortcut('== ==')).toBeNull()
  })

  it('toggles the highlight mark over a selection', () => {
    const doc = highlightSchema.nodes.doc.create(null, [highlightParagraph('note')])
    let state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1, 5),
    })

    expect(toggleHighlightMark(state, (transaction) => {
      state = state.apply(transaction as any)
    })).toBe(true)
    expect(getTextMarkNames(state.doc)).toEqual(['mark'])

    expect(toggleHighlightMark(state, (transaction) => {
      state = state.apply(transaction as any)
    })).toBe(true)
    expect(getTextMarkNames(state.doc)).toEqual([])
  })

  it('converts typed highlight markers into marked text', () => {
    const pluginBundle = highlightPlugin({ pmState: { Plugin } })
    const plugin = pluginBundle.wysiwygPlugins[0]() as Plugin
    const doc = highlightSchema.nodes.doc.create(null, [highlightParagraph('== note =')])
    let state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 10),
    })
    const view = {
      get state() {
        return state
      },
      dispatch: (transaction: any) => {
        state = state.apply(transaction)
      },
    }

    expect((plugin.props.handleTextInput as any)?.(view, 10, 10, '=', () => false)).toBe(true)
    expect(state.doc.textContent).toBe('note')
    expect(getTextMarkNames(state.doc)).toEqual(['mark'])
  })

  it('leaves typed markers inside code marks alone', () => {
    const codeMark = highlightSchema.marks.code.create()
    const doc = highlightSchema.nodes.doc.create(null, [
      highlightSchema.nodes.paragraph.create(null, highlightSchema.text('== note =', [codeMark])),
    ])
    const pluginBundle = highlightPlugin({ pmState: { Plugin } })
    const plugin = pluginBundle.wysiwygPlugins[0]() as Plugin
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 10),
    })

    expect((plugin.props.handleTextInput as any)?.({ state }, 10, 10, '=', () => false)).toBe(false)
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

function getBlockIndentDecorationCalls(
  textContent: string,
  textChildren?: Array<{ text: string; position: number }>,
  selection?: { empty: boolean; from: number },
) {
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
  const plugin = pluginBundle.wysiwygPlugins[0]() as FakePlugin

  plugin.spec.props.decorations({ doc: blockIndentDoc(textContent, textChildren), selection })
  return calls
}

function blockIndentEditorDoc(textContent: string) {
  return paragraphShortcutSchema.nodes.doc.create(null, [
    paragraphShortcutSchema.nodes.paragraph.create(null, paragraphShortcutSchema.text(textContent)),
  ])
}

function getBlockIndentTestPlugin() {
  const pluginBundle = blockIndentPlugin({
    pmState: {
      Plugin,
    },
    pmView: {
      Decoration: {
        node: () => null,
        inline: () => null,
        widget: () => null,
      },
      DecorationSet: {
        create: (_doc: unknown, decorations: unknown[]) => decorations,
      },
    },
  })
  return pluginBundle.wysiwygPlugins[0]() as Plugin
}

function blockIndentKeyboardEvent(
  key: string,
  modifiers: Partial<Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>> = {},
): KeyboardEvent {
  return {
    key,
    code: key,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    preventDefault: vi.fn(),
    getModifierState: () => false,
    ...modifiers,
  } as unknown as KeyboardEvent
}

function createBlockIndentBoundaryKeydownView() {
  const previousParagraph = paragraphShortcutSchema.nodes.paragraph.create(null, paragraphShortcutSchema.text('before'))
  const indentedParagraph = paragraphShortcutSchema.nodes.paragraph.create(
    null,
    paragraphShortcutSchema.text(`${BLOCK_INDENT_TOKEN}visible`),
  )
  const nextParagraph = paragraphShortcutSchema.nodes.paragraph.create(null, paragraphShortcutSchema.text('next'))
  const doc = paragraphShortcutSchema.nodes.doc.create(null, [previousParagraph, indentedParagraph, nextParagraph])
  const tokenTo = previousParagraph.nodeSize + 1 + BLOCK_INDENT_TOKEN.length
  let state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, tokenTo),
  })
  const element = {
    ownerDocument: {
      defaultView: {
        getComputedStyle: () => ({
          fontSize: '16px',
          lineHeight: '20px',
          paddingLeft: '28px',
        }),
      },
    },
    getBoundingClientRect: () => ({
      left: 100,
      top: 50,
      bottom: 74,
      height: 24,
    }),
  }
  const dispatch = vi.fn((transaction: any) => {
    state = state.apply(transaction)
  })
  const posAtCoords = vi.fn(() => ({ pos: previousParagraph.nodeSize + indentedParagraph.nodeSize + 1 }))
  const view = {
    get state() {
      return state
    },
    dispatch,
    nodeDOM: vi.fn(() => element),
    posAtCoords,
  }

  return { view, dispatch, posAtCoords }
}

function tagDoc(children: Array<{
  text: string
  position: number
  marks?: Array<{ type?: { name?: string; spec?: Record<string, unknown> } }>
  parentType?: { name?: string; spec?: Record<string, unknown> }
}>) {
  return {
    descendants: (visitor: (node: unknown, pos: number, parent?: unknown) => unknown) => {
      children.forEach((child) => {
        visitor(
          {
            isText: true,
            text: child.text,
            marks: child.marks ?? [],
            type: { name: 'text' },
          },
          child.position,
          { type: child.parentType ?? { name: 'paragraph' } },
        )
      })
    },
  }
}

function getTagDecorationCalls(doc: unknown, jumpMeta?: unknown) {
  const calls: DecorationCall[] = []
  class FakePlugin {
    spec: any

    constructor(spec: any) {
      this.spec = spec
    }
  }

  const pluginBundle = tagAppearancePlugin({
    pmState: {
      Plugin: FakePlugin,
    },
    pmView: {
      Decoration: {
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

  const jumpMetas = jumpMeta === undefined ? [] : Array.isArray(jumpMeta) ? jumpMeta : [jumpMeta]
  jumpMetas.forEach((meta) => {
    plugin.spec.state.apply(
      {
        getMeta: (key: string) => (key === TAG_JUMP_HIGHLIGHT_META ? meta : undefined),
      },
      null,
    )
  })
  plugin.spec.props.decorations({ doc })
  return calls
}

describe('block indent WYSIWYG decorations', () => {
  it('finds only the block indent marker range and leaves paragraph indents stackable', () => {
    const ranges = getBlockIndentDecorationRanges(blockIndentDoc(`${BLOCK_INDENT_TOKEN.repeat(2)}${INDENT_TOKEN}one`))

    expect(ranges).toEqual([
      {
        nodeFrom: 0,
        nodeTo: BLOCK_INDENT_TOKEN.length * 2 + INDENT_TOKEN.length + 3 + 2,
        tokenFrom: 1,
        tokenTo: 1 + BLOCK_INDENT_TOKEN.length * 2,
        level: 2,
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
        attrs: { class: BLOCK_INDENT_CLASS_NAME, style: '--tabs-block-indent-level: 1;' },
      },
      {
        kind: 'inline',
        from: 1,
        to: 1 + BLOCK_INDENT_TOKEN.length,
        attrs: { class: BLOCK_INDENT_TOKEN_HIDDEN_CLASS_NAME },
      },
    ])
  })

  it('marks the paragraph active at the first visible block indent character boundary', () => {
    const tokenTo = 1 + BLOCK_INDENT_TOKEN.length
    const calls = getBlockIndentDecorationCalls(`${BLOCK_INDENT_TOKEN}one`, [
      { text: BLOCK_INDENT_TOKEN, position: 0 },
      { text: 'one', position: BLOCK_INDENT_TOKEN.length },
    ], { empty: true, from: tokenTo })

    expect(calls.some((call) => call.kind === 'widget')).toBe(false)
    expect(calls.find((call) => call.kind === 'node')?.attrs?.class).toBe(
      `${BLOCK_INDENT_CLASS_NAME} ${BLOCK_INDENT_BOUNDARY_ACTIVE_CLASS_NAME}`,
    )
  })

  it('does not mark the paragraph active outside the first visible boundary', () => {
    const tokenTo = 1 + BLOCK_INDENT_TOKEN.length

    expect(getBlockIndentDecorationCalls(`${BLOCK_INDENT_TOKEN}one`, undefined, { empty: true, from: tokenTo + 1 })
      .find((call) => call.kind === 'node')?.attrs?.class).toBe(BLOCK_INDENT_CLASS_NAME)
    expect(getBlockIndentDecorationCalls(`${BLOCK_INDENT_TOKEN}one`, undefined, { empty: false, from: tokenTo })
      .find((call) => call.kind === 'node')?.attrs?.class).toBe(BLOCK_INDENT_CLASS_NAME)
    expect(getBlockIndentDecorationCalls('one', undefined, { empty: true, from: 1 })
      .find((call) => call.kind === 'node')).toBeUndefined()
  })

  it('snaps hidden-token cursor positions to the first visible character', () => {
    const doc = blockIndentEditorDoc(`${BLOCK_INDENT_TOKEN.repeat(2)}one`)
    const tokenFrom = 1
    const tokenTo = 1 + BLOCK_INDENT_TOKEN.length * 2

    expect(normalizeBlockIndentBoundaryPosition(doc, tokenFrom)).toBe(tokenTo)
    expect(normalizeBlockIndentBoundaryPosition(doc, tokenTo - 1)).toBe(tokenTo)
    expect(normalizeBlockIndentBoundaryPosition(doc, tokenTo)).toBe(tokenTo)
    expect(normalizeBlockIndentBoundaryPosition(doc, tokenTo + 1)).toBe(tokenTo + 1)
  })

  it('keeps normal paragraph cursor positions unchanged', () => {
    const doc = blockIndentEditorDoc('normal')

    expect(normalizeBlockIndentBoundaryPosition(doc, 1)).toBe(1)
    expect(normalizeBlockIndentSelectionBoundaries(doc, { anchor: 1, head: 4 })).toBeNull()
  })

  it('clamps non-collapsed selection endpoints out of hidden block indent tokens', () => {
    const doc = blockIndentEditorDoc(`${BLOCK_INDENT_TOKEN}visible`)
    const tokenFrom = 1
    const tokenTo = 1 + BLOCK_INDENT_TOKEN.length
    const visibleEnd = tokenTo + 'visible'.length

    expect(normalizeBlockIndentSelectionBoundaries(doc, { anchor: tokenFrom, head: visibleEnd })).toEqual({
      anchor: tokenTo,
      head: visibleEnd,
    })
    expect(normalizeBlockIndentSelectionBoundaries(doc, { anchor: visibleEnd, head: tokenFrom + 1 })).toEqual({
      anchor: visibleEnd,
      head: tokenTo,
    })
  })

  it('moves left and up from the first visible block indent character with a real selection', () => {
    const previousParagraph = paragraphShortcutSchema.nodes.paragraph.create(null, paragraphShortcutSchema.text('before'))
    const indentedParagraph = paragraphShortcutSchema.nodes.paragraph.create(
      null,
      paragraphShortcutSchema.text(`${BLOCK_INDENT_TOKEN}visible`),
    )
    const doc = paragraphShortcutSchema.nodes.doc.create(null, [previousParagraph, indentedParagraph])
    const tokenFrom = previousParagraph.nodeSize + 1
    const tokenTo = tokenFrom + BLOCK_INDENT_TOKEN.length
    const selection = { empty: true, from: tokenTo }

    expect(getBlockIndentBoundaryNavigationPosition(doc, selection, 'ArrowLeft')).toBeLessThan(tokenFrom)
    expect(getBlockIndentBoundaryNavigationPosition(doc, selection, 'ArrowUp')).toBeLessThan(tokenFrom)
    expect(getBlockIndentBoundaryNavigationPosition(doc, selection, 'ArrowDown')).toBeNull()
  })

  it('moves down from the first visible block indent character using the visible text column', () => {
    const indentedParagraph = paragraphShortcutSchema.nodes.paragraph.create(
      null,
      paragraphShortcutSchema.text(`${BLOCK_INDENT_TOKEN}first line wraps`),
    )
    const nextParagraph = paragraphShortcutSchema.nodes.paragraph.create(null, paragraphShortcutSchema.text('next'))
    const doc = paragraphShortcutSchema.nodes.doc.create(null, [indentedParagraph, nextParagraph])
    const tokenTo = 1 + BLOCK_INDENT_TOKEN.length
    const posAtCoords = vi.fn(() => ({ pos: indentedParagraph.nodeSize + 1 }))
    const element = {
      ownerDocument: {
        defaultView: {
          getComputedStyle: () => ({
            fontSize: '16px',
            lineHeight: '20px',
            paddingLeft: '28px',
          }),
        },
      },
      getBoundingClientRect: () => ({
        left: 100,
        top: 50,
        bottom: 74,
        height: 24,
      }),
    }
    const view = {
      state: {
        doc,
        selection: { empty: true, from: tokenTo },
      },
      nodeDOM: vi.fn(() => element),
      posAtCoords,
    }

    expect(getBlockIndentBoundaryArrowDownPosition(view)).toBe(indentedParagraph.nodeSize + 1)
    expect(view.nodeDOM).toHaveBeenCalledWith(0)
    expect(posAtCoords).toHaveBeenCalledWith({ left: 129, top: 81 })
  })

  it('handles plain ArrowDown from the block indent boundary through the plugin', () => {
    const plugin = getBlockIndentTestPlugin()
    const { view, dispatch, posAtCoords } = createBlockIndentBoundaryKeydownView()
    const event = blockIndentKeyboardEvent('ArrowDown')

    expect((plugin.props.handleKeyDown as any)?.(view, event)).toBe(true)

    expect(event.preventDefault).toHaveBeenCalled()
    expect(posAtCoords).toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalled()
  })

  it.each([
    ['Command Down', 'ArrowDown', { metaKey: true }],
    ['Option Down', 'ArrowDown', { altKey: true }],
    ['Shift Down', 'ArrowDown', { shiftKey: true }],
    ['Control Down', 'ArrowDown', { ctrlKey: true }],
    ['Command Up', 'ArrowUp', { metaKey: true }],
    ['Option Up', 'ArrowUp', { altKey: true }],
  ])('lets %s fall through at the block indent boundary', (_label, key, modifiers) => {
    const plugin = getBlockIndentTestPlugin()
    const { view, dispatch, posAtCoords } = createBlockIndentBoundaryKeydownView()
    const event = blockIndentKeyboardEvent(
      key,
      modifiers as Partial<Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>>,
    )

    expect((plugin.props.handleKeyDown as any)?.(view, event)).toBe(false)

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(posAtCoords).not.toHaveBeenCalled()
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('moves home-style navigation to the visible start of a block-indented paragraph', () => {
    const doc = blockIndentEditorDoc(`${BLOCK_INDENT_TOKEN}visible`)
    const tokenTo = 1 + BLOCK_INDENT_TOKEN.length

    expect(getBlockIndentVisibleLineStartPosition(doc, { empty: true, from: tokenTo + 3 }, 'line-start')).toBe(tokenTo)
    expect(getBlockIndentVisibleLineStartPosition(doc, { empty: true, from: tokenTo + 1 }, 'word-boundary')).toBe(tokenTo)
    expect(getBlockIndentVisibleLineStartPosition(doc, { empty: true, from: tokenTo + 3 }, 'word-boundary')).toBeNull()
    expect(getBlockIndentVisibleLineStartPosition(doc, { empty: true, from: tokenTo })).toBe(tokenTo)
    expect(getBlockIndentVisibleLineStartPosition(doc, { empty: false, from: tokenTo + 3 })).toBeNull()
    expect(getBlockIndentVisibleLineStartPosition(blockIndentEditorDoc('visible'), { empty: true, from: 4 })).toBeNull()
  })

  it('maps clicks near the visible start of a block-indented paragraph to the first visible character boundary', () => {
    const doc = blockIndentEditorDoc(`${BLOCK_INDENT_TOKEN}visible`)
    const tokenTo = 1 + BLOCK_INDENT_TOKEN.length
    const posAtCoords = vi.fn(() => ({ pos: tokenTo + 2 }))
    const element = {
      ownerDocument: {
        defaultView: {
          getComputedStyle: () => ({
            paddingLeft: '28px',
          }),
        },
      },
      getBoundingClientRect: () => ({
        left: 100,
        top: 50,
        right: 500,
        bottom: 80,
        height: 30,
      }),
    }
    const view = {
      state: { doc },
      nodeDOM: vi.fn(() => element),
      posAtCoords,
    }

    expect(getBlockIndentClickBoundaryPosition(view, { clientX: 129, clientY: 62 })).toBe(tokenTo)
    expect(getBlockIndentClickBoundaryPosition(view, { clientX: 170, clientY: 62 })).toBeNull()
    expect(view.nodeDOM).toHaveBeenCalledWith(0)
  })

  it('normalizes plugin selections that land inside a hidden block indent token', () => {
    const plugin = getBlockIndentTestPlugin()
    const doc = blockIndentEditorDoc(`${BLOCK_INDENT_TOKEN}one`)
    const tokenTo = 1 + BLOCK_INDENT_TOKEN.length
    const oldState = EditorState.create({
      doc,
      selection: TextSelection.create(doc, tokenTo),
    })
    const hiddenState = EditorState.create({
      doc,
      selection: TextSelection.create(doc, tokenTo - 1),
    })

    const transaction = plugin.spec.appendTransaction?.([], oldState, hiddenState)
    expect(transaction).not.toBeNull()
    const nextState = hiddenState.apply(transaction as any)

    expect(nextState.selection.from).toBe(tokenTo)
  })

  it('normalizes the caret after native Delete leaves it before a remaining block indent token', () => {
    const plugin = getBlockIndentTestPlugin()
    const doc = blockIndentEditorDoc(`${BLOCK_INDENT_TOKEN}after`)
    const tokenFrom = 1
    const tokenTo = 1 + BLOCK_INDENT_TOKEN.length
    const oldState = EditorState.create({ doc })
    const deleteResultState = EditorState.create({
      doc,
      selection: TextSelection.create(doc, tokenFrom),
    })

    const transaction = plugin.spec.appendTransaction?.([], oldState, deleteResultState)
    expect(transaction).not.toBeNull()
    const nextState = deleteResultState.apply(transaction as any)

    expect(nextState.selection.from).toBe(tokenTo)
    expect(nextState.doc.child(0).textContent).toBe(`${BLOCK_INDENT_TOKEN}after`)
  })

  it('inserts printable text at the first visible character from an invalid hidden-token caret', () => {
    const plugin = getBlockIndentTestPlugin()
    const doc = blockIndentEditorDoc(`${BLOCK_INDENT_TOKEN}after`)
    const tokenFrom = 1
    const tokenTo = 1 + BLOCK_INDENT_TOKEN.length
    let state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, tokenFrom),
    })
    const view = {
      get state() {
        return state
      },
      dispatch: (transaction: any) => {
        state = state.apply(transaction)
      },
    }

    expect((plugin.props.handleTextInput as any)?.(view, tokenFrom, tokenFrom, 'X')).toBe(true)

    expect(state.doc.child(0).textContent).toBe(`${BLOCK_INDENT_TOKEN}Xafter`)
    expect(state.selection.from).toBe(tokenTo + 1)
  })
})

describe('tag WYSIWYG decorations', () => {
  it('maps authored hashtag ranges through ProseMirror text positions', () => {
    expect(getTagDecorationRanges(tagDoc([
      { text: 'Read #Tag-3 and #asdf', position: 1 },
    ]))).toEqual([
      { from: 6, to: 12, text: '#Tag-3', tag: 'Tag-3' },
      { from: 17, to: 22, text: '#asdf', tag: 'asdf' },
    ])
  })

  it('skips inline code marks and code block parents', () => {
    const codeMark = { type: { name: 'code' } }
    expect(getTagDecorationRanges(tagDoc([
      { text: '#Visible', position: 1 },
      { text: '#Inline', position: 12, marks: [codeMark] },
      { text: '#Fenced', position: 24, parentType: { name: 'codeBlock', spec: { code: true } } },
    ]))).toEqual([
      { from: 1, to: 9, text: '#Visible', tag: 'Visible' },
    ])
  })

  it('creates inline decorations with the shared tag token class and tag metadata', () => {
    expect(getTagDecorationCalls(tagDoc([{ text: '#Tag-3', position: 4 }]))).toEqual([
      {
        kind: 'inline',
        from: 4,
        to: 10,
        attrs: { class: TAG_TOKEN_CLASS_NAME, 'data-tabs-tag': 'Tag-3', 'data-app-tooltip': 'filter by tag' },
      },
    ])
  })

  it('adds and clears the transient tag jump glow class by transaction metadata', () => {
    const doc = tagDoc([{ text: '#one #two', position: 1 }])
    const highlighted = getTagDecorationCalls(doc, { from: 1, to: 5, requestId: 1 })

    expect(highlighted).toEqual([
      {
        kind: 'inline',
        from: 1,
        to: 5,
        attrs: {
          class: `${TAG_TOKEN_CLASS_NAME} ${TAG_JUMP_TARGET_CLASS_NAME}`,
          'data-tabs-tag': 'one',
          'data-app-tooltip': 'filter by tag',
        },
      },
      {
        kind: 'inline',
        from: 6,
        to: 10,
        attrs: { class: TAG_TOKEN_CLASS_NAME, 'data-tabs-tag': 'two', 'data-app-tooltip': 'filter by tag' },
      },
    ])
    expect(getTagDecorationCalls(doc, [{ from: 1, to: 5, requestId: 1 }, null]).map((call) => call.attrs?.class)).toEqual([
      TAG_TOKEN_CLASS_NAME,
      TAG_TOKEN_CLASS_NAME,
    ])
  })
})

describe('annotation line WYSIWYG decorations', () => {
  it('hides only the double-dash marker for live annotation lines so the separator space remains editable', () => {
    expect(getAnnotationDecorationCalls('-- text').find((call) => call.kind === 'inline')).toMatchObject({
      from: 1,
      to: 3,
      attrs: { class: expect.stringContaining(ANNOTATION_LINE_MARKER_CLASS_NAME) },
    })
  })

  it('adds inline arrow replacement classes anywhere in the paragraph', () => {
    const cases = [
      ['^-- note', ANNOTATION_LINE_ARROW_UP_CLASS_NAME, ANNOTATION_LINE_TAIL_RIGHT_CLASS_NAME],
      ['note --^', ANNOTATION_LINE_ARROW_UP_CLASS_NAME, ANNOTATION_LINE_TAIL_LEFT_CLASS_NAME],
      ['j v--', ANNOTATION_LINE_ARROW_DOWN_CLASS_NAME, ANNOTATION_LINE_TAIL_RIGHT_CLASS_NAME],
      ['j --v', ANNOTATION_LINE_ARROW_DOWN_CLASS_NAME, ANNOTATION_LINE_TAIL_LEFT_CLASS_NAME],
      ['j -->', ANNOTATION_LINE_ARROW_RIGHT_CLASS_NAME, ANNOTATION_LINE_TAIL_LEFT_CLASS_NAME],
      ['j <--', ANNOTATION_LINE_ARROW_LEFT_CLASS_NAME, ANNOTATION_LINE_TAIL_RIGHT_CLASS_NAME],
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
    expect(getAnnotationDecorationCalls('asdf -->').find((call) => call.kind === 'inline')).toMatchObject({
      from: 6,
      to: 9,
      attrs: { class: expect.stringContaining(ANNOTATION_LINE_MARKER_CLASS_NAME) },
    })

    expect(getAnnotationDecorationCalls('one <-- two').find((call) => call.kind === 'inline')).toMatchObject({
      from: 5,
      to: 8,
      attrs: { class: expect.stringContaining(ANNOTATION_LINE_MARKER_CLASS_NAME) },
    })
  })

  it('maps live marker hiding through split ProseMirror text children', () => {
    expect(
      getAnnotationDecorationCalls('asdf -->', [
        { text: 'asdf ', position: 0 },
        { text: '-->', position: 6 },
      ]).find((call) => call.kind === 'inline'),
    ).toMatchObject({
      from: 7,
      to: 10,
      attrs: { class: expect.stringContaining(ANNOTATION_LINE_MARKER_CLASS_NAME) },
    })
  })

  it('replaces every arrow marker in place without moving text', () => {
    const calls = getAnnotationDecorationCalls('one --^ two v-- three --> four <-- five')
    const inlineDecorations = calls.filter((call) => call.kind === 'inline')

    expect(inlineDecorations.map((call) => ({ from: call.from, to: call.to }))).toEqual([
      { from: 5, to: 8 },
      { from: 13, to: 16 },
      { from: 23, to: 26 },
      { from: 32, to: 35 },
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
    const calls = getAnnotationDecorationCalls('--> note')
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
      doc: editorDoc('asdf -->'),
      selection: { empty: true, from: 9, to: 9 },
    }, 'Backspace')).toEqual({ from: 6, to: 9 })
  })

  it('deletes the full arrow marker when deleting from its left edge', () => {
    expect(getArrowMarkerDeletionRange({
      doc: editorDoc('asdf <--'),
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
      doc: editorDoc('asdf -->'),
      selection: { empty: true, from: 6 },
    }, 'ArrowRight')).toBe(9)
  })

  it('skips the full arrow marker when moving left from its right edge', () => {
    expect(getArrowMarkerNavigationPosition({
      doc: editorDoc('asdf <--'),
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
