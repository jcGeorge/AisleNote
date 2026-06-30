import { Schema } from 'prosemirror-model'
import { EditorState, TextSelection } from 'prosemirror-state'
import { describe, expect, it, vi } from 'vitest'
import {
  applyListToolbarCommand,
  applyStructuralListIndent,
  convertSelectedDashListsToOrderedList,
  convertSelectedOrderedListsToTaskList,
  getCompatibleListSiblingRange,
  getToolbarListKindForNode,
  selectionTouchesListItem,
  selectionUsesOnlyListKind,
} from './list-marker-commands'

function node(typeName: string, attrs: Record<string, unknown> | null = null, extra: Record<string, unknown> = {}) {
  return {
    type: { name: typeName },
    attrs,
    ...extra,
  }
}

function listNode(
  typeName: 'bulletList' | 'orderedList',
  attrs: Record<string, unknown> | null,
  itemAttrs: Array<Record<string, unknown> | null>,
) {
  const children = itemAttrs.map((attrsForItem) => node('listItem', attrsForItem))
  return {
    ...node(typeName, attrs),
    childCount: children.length,
    child: (index: number) => children[index],
  }
}

function parent(children: ReturnType<typeof node>[]) {
  return {
    childCount: children.length,
    child: (index: number) => children[index],
  }
}

const listCommandSchema = new Schema({
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
  },
})

function pmParagraph(text: string) {
  return listCommandSchema.nodes.paragraph.create(null, listCommandSchema.text(text))
}

function pmListItem(text: string, children: any[] = []) {
  return listCommandSchema.nodes.listItem.create(null, [pmParagraph(text), ...children])
}

function createStateView(doc: any, selectionPosition: number) {
  let state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, selectionPosition, selectionPosition),
  })
  const view: any = {
    get state() {
      return state
    },
    dispatch: vi.fn((transaction) => {
      state = state.apply(transaction)
    }),
  }
  return view
}

function getTextSelectionPosition(doc: any, text: string): number {
  let position = 1
  doc.descendants((node: any, pos: number) => {
    if (node.isText && node.text === text) {
      position = pos + 1
      return false
    }
    return true
  })
  return position
}

function getTextRange(doc: any, text: string): { from: number; to: number } {
  let from = 1
  let to = 1
  doc.descendants((node: any, pos: number) => {
    if (node.isText && node.text === text) {
      from = pos
      to = pos + text.length
      return false
    }
    return true
  })
  return { from, to }
}

function listItemParagraphTexts(listNode: any): string[] {
  const texts: string[] = []
  for (let index = 0; index < listNode.childCount; index += 1) {
    texts.push(listNode.child(index).child(0).textContent)
  }
  return texts
}

function createViewWithSelection(doc: any, from: number, to: number) {
  let state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, from, to),
  })
  const view: any = {
    get state() {
      return state
    },
    dispatch: vi.fn((transaction) => {
      state = state.apply(transaction)
    }),
  }
  return view
}

function resolved(ancestors: ReturnType<typeof node>[]) {
  return {
    depth: ancestors.length - 1,
    node: (depth: number) => ancestors[depth] ?? null,
    before: (depth: number) => depth * 10,
  }
}

function collapsedView(ancestors: ReturnType<typeof node>[]) {
  const $pos = resolved(ancestors)
  return {
    state: {
      selection: {
        empty: true,
        from: 1,
        to: 1,
        $from: $pos,
        $to: $pos,
      },
    },
  }
}

describe('toolbar list command detection', () => {
  it('detects task list selections separately from plain bullet lists', () => {
    const view = collapsedView([
      node('doc'),
      node('bulletList'),
      node('listItem', { task: true, checked: true }),
      node('paragraph', null, { isTextblock: true }),
    ])

    expect(selectionUsesOnlyListKind(view, 'taskList')).toBe(true)
    expect(selectionUsesOnlyListKind(view, 'bulletList')).toBe(false)
  })

  it('detects bullet, dash, and numbered list selections by their exact kind', () => {
    const bulletView = collapsedView([
      node('doc'),
      node('bulletList'),
      node('listItem'),
      node('paragraph', null, { isTextblock: true }),
    ])
    const dashView = collapsedView([
      node('doc'),
      node('bulletList', { htmlAttrs: { 'data-aislenote-list-marker': 'dash' } }),
      node('listItem'),
      node('paragraph', null, { isTextblock: true }),
    ])
    const numberedView = collapsedView([
      node('doc'),
      node('orderedList'),
      node('listItem'),
      node('paragraph', null, { isTextblock: true }),
    ])

    expect(selectionUsesOnlyListKind(bulletView, 'bulletList')).toBe(true)
    expect(selectionUsesOnlyListKind(bulletView, 'dashList')).toBe(false)
    expect(selectionUsesOnlyListKind(dashView, 'dashList')).toBe(true)
    expect(selectionUsesOnlyListKind(dashView, 'bulletList')).toBe(false)
    expect(selectionUsesOnlyListKind(numberedView, 'orderedList')).toBe(true)
  })

  it('treats unmarked nested bullets inside dash lists as dash list selections', () => {
    const nestedDashView = collapsedView([
      node('doc'),
      node('bulletList', { htmlAttrs: { 'data-aislenote-list-marker': 'dash' } }),
      node('listItem'),
      node('bulletList'),
      node('listItem'),
      node('paragraph', null, { isTextblock: true }),
    ])

    expect(selectionUsesOnlyListKind(nestedDashView, 'dashList')).toBe(true)
    expect(selectionUsesOnlyListKind(nestedDashView, 'bulletList')).toBe(false)
  })

  it('does not treat normal paragraphs as active lists', () => {
    const view = collapsedView([node('doc'), node('paragraph', null, { isTextblock: true })])

    expect(selectionUsesOnlyListKind(view, 'bulletList')).toBe(false)
    expect(selectionUsesOnlyListKind(view, 'taskList')).toBe(false)
  })

  it('detects list selections for structural tab indentation', () => {
    const listView = collapsedView([
      node('doc'),
      node('bulletList'),
      node('listItem'),
      node('paragraph', null, { isTextblock: true }),
    ])
    const paragraphView = collapsedView([node('doc'), node('paragraph', null, { isTextblock: true })])

    expect(selectionTouchesListItem(listView)).toBe(true)
    expect(selectionTouchesListItem(paragraphView)).toBe(false)
  })

  it('runs structural list indent commands only inside lists', () => {
    const execCalls: string[] = []
    const editor = {
      focus: () => undefined,
      exec: (command: string) => execCalls.push(command),
      wwEditor: {
        view: collapsedView([
          node('doc'),
          node('orderedList'),
          node('listItem'),
          node('paragraph', null, { isTextblock: true }),
        ]),
      },
    }

    expect(applyStructuralListIndent(editor as any, false)).toBe(true)
    expect(applyStructuralListIndent(editor as any, true)).toBe(true)
    expect(execCalls).toEqual(['indent', 'outdent'])
  })

  it('does not run structural list indentation for mixed list and paragraph selections', () => {
    const doc = listCommandSchema.nodes.doc.create(null, [
      listCommandSchema.nodes.bulletList.create(null, pmListItem('one')),
      pmParagraph('two'),
    ])
    const one = getTextRange(doc, 'one')
    const two = getTextRange(doc, 'two')
    const view = createViewWithSelection(doc, one.from, two.to)
    const editor = {
      focus: vi.fn(),
      exec: vi.fn(),
      wwEditor: {
        view,
      },
    }

    expect(applyStructuralListIndent(editor as any, false)).toBe(false)
    expect(editor.focus).not.toHaveBeenCalled()
    expect(editor.exec).not.toHaveBeenCalled()
  })

  it('preserves dash markers when structurally indenting dash list items', () => {
    const transaction = {
      setNodeMarkup: vi.fn(() => transaction),
      scrollIntoView: vi.fn(() => transaction),
    }
    const dispatch = vi.fn()
    const view: any = {
      ...collapsedView([
        node('doc'),
        node('bulletList', { htmlAttrs: { 'data-aislenote-list-marker': 'dash' } }),
        node('listItem'),
        node('paragraph', null, { isTextblock: true }),
      ]),
      dispatch,
    }
    view.state.tr = transaction
    const editor = {
      focus: () => undefined,
      exec: vi.fn(),
      wwEditor: {
        view,
      },
    }

    expect(applyStructuralListIndent(editor as any, false)).toBe(true)

    expect(editor.exec).toHaveBeenCalledWith('indent')
    expect(transaction.setNodeMarkup).toHaveBeenCalledWith(
      10,
      undefined,
      expect.objectContaining({
        htmlAttrs: { 'data-aislenote-list-marker': 'dash' },
      }),
    )
    expect(dispatch).toHaveBeenCalledWith(transaction)
  })

  it('preserves dash markers when indenting inside inherited nested dash lists', () => {
    const transaction = {
      setNodeMarkup: vi.fn(() => transaction),
      scrollIntoView: vi.fn(() => transaction),
    }
    const dispatch = vi.fn()
    const view: any = {
      ...collapsedView([
        node('doc'),
        node('bulletList', { htmlAttrs: { 'data-aislenote-list-marker': 'dash' } }),
        node('listItem'),
        node('bulletList'),
        node('listItem'),
        node('paragraph', null, { isTextblock: true }),
      ]),
      dispatch,
    }
    view.state.tr = transaction
    const editor = {
      focus: () => undefined,
      exec: vi.fn(),
      wwEditor: {
        view,
      },
    }

    expect(applyStructuralListIndent(editor as any, false)).toBe(true)

    expect(editor.exec).toHaveBeenCalledWith('indent')
    expect(transaction.setNodeMarkup).toHaveBeenCalledWith(
      30,
      undefined,
      expect.objectContaining({
        htmlAttrs: { 'data-aislenote-list-marker': 'dash' },
      }),
    )
  })

  it('classifies list node kinds without mixing task, bullet, dash, and numbered lists', () => {
    expect(getToolbarListKindForNode(listNode('bulletList', null, [{ task: true }, { task: true }]))).toBe('taskList')
    expect(getToolbarListKindForNode(listNode('bulletList', null, [null]))).toBe('bulletList')
    expect(
      getToolbarListKindForNode(
        listNode('bulletList', { htmlAttrs: { 'data-aislenote-list-marker': 'dash' } }, [null]),
      ),
    ).toBe('dashList')
    expect(getToolbarListKindForNode(listNode('orderedList', null, [null]))).toBe('orderedList')
    expect(getToolbarListKindForNode(listNode('bulletList', null, [{ task: true }, null]))).toBeNull()
  })

  it('finds only adjacent same-kind lists for merge', () => {
    const bullet = listNode('bulletList', null, [null])
    const dash = listNode('bulletList', { htmlAttrs: { 'data-aislenote-list-marker': 'dash' } }, [null])
    const ordered = listNode('orderedList', null, [null])
    const paragraph = node('paragraph')

    expect(getCompatibleListSiblingRange(parent([bullet, bullet, bullet]), 1, 'bulletList')).toEqual({
      startIndex: 0,
      endIndex: 2,
    })
    expect(getCompatibleListSiblingRange(parent([bullet, paragraph, bullet]), 2, 'bulletList')).toEqual({
      startIndex: 2,
      endIndex: 2,
    })
    expect(getCompatibleListSiblingRange(parent([bullet, dash, bullet]), 1, 'dashList')).toEqual({
      startIndex: 1,
      endIndex: 1,
    })
    expect(getCompatibleListSiblingRange(parent([ordered, ordered]), 0, 'orderedList')).toEqual({
      startIndex: 0,
      endIndex: 1,
    })
  })

  it('converts a selected dash list to an ordered list structurally', () => {
    const dashList = listCommandSchema.nodes.bulletList.create(
      { htmlAttrs: { 'data-aislenote-list-marker': 'dash' } },
      [pmListItem('one'), pmListItem('two')],
    )
    const doc = listCommandSchema.nodes.doc.create(null, [dashList])
    const view = createStateView(doc, getTextSelectionPosition(doc, 'one'))

    expect(convertSelectedDashListsToOrderedList(view)).toBe(true)

    expect(view.state.doc.child(0).type.name).toBe('orderedList')
    expect(view.state.doc.child(0).attrs.order).toBe(1)
    expect(view.state.doc.child(0).child(0).textContent).toBe('one')
    expect(view.state.doc.child(0).child(1).textContent).toBe('two')
    expect(view.dispatch).toHaveBeenCalledTimes(1)
  })

  it('converts nested dash children when converting a parent dash list to ordered', () => {
    const nestedDashList = listCommandSchema.nodes.bulletList.create(null, [pmListItem('child')])
    const dashList = listCommandSchema.nodes.bulletList.create(
      { htmlAttrs: { 'data-aislenote-list-marker': 'dash' } },
      [pmListItem('parent', [nestedDashList]), pmListItem('sibling')],
    )
    const doc = listCommandSchema.nodes.doc.create(null, [dashList])
    const view = createStateView(doc, getTextSelectionPosition(doc, 'parent'))

    expect(convertSelectedDashListsToOrderedList(view)).toBe(true)

    const topList = view.state.doc.child(0)
    const nestedList = topList.child(0).child(1)
    expect(topList.type.name).toBe('orderedList')
    expect(nestedList.type.name).toBe('orderedList')
    expect(nestedList.child(0).textContent).toBe('child')
    expect(topList.child(1).textContent).toBe('sibling')
  })

  it('converts an inherited nested dash list to an ordered list at the nested level', () => {
    const nestedBulletList = listCommandSchema.nodes.bulletList.create(null, [pmListItem('child')])
    const dashList = listCommandSchema.nodes.bulletList.create(
      { htmlAttrs: { 'data-aislenote-list-marker': 'dash' } },
      [pmListItem('parent', [nestedBulletList])],
    )
    const doc = listCommandSchema.nodes.doc.create(null, [dashList])
    const view = createStateView(doc, getTextSelectionPosition(doc, 'child'))

    expect(convertSelectedDashListsToOrderedList(view)).toBe(true)

    const topList = view.state.doc.child(0)
    const nestedList = topList.child(0).child(1)
    expect(topList.type.name).toBe('bulletList')
    expect(nestedList.type.name).toBe('orderedList')
    expect(nestedList.child(0).textContent).toBe('child')
  })

  it('converts nested ordered children when converting a parent numbered list to tasks', () => {
    const nestedOrderedList = listCommandSchema.nodes.orderedList.create({ order: 1 }, [pmListItem('child')])
    const orderedList = listCommandSchema.nodes.orderedList.create({ order: 1 }, [
      pmListItem('parent', [nestedOrderedList]),
      pmListItem('sibling'),
    ])
    const doc = listCommandSchema.nodes.doc.create(null, [orderedList])
    const view = createStateView(doc, getTextSelectionPosition(doc, 'parent'))

    expect(convertSelectedOrderedListsToTaskList(view)).toBe(true)

    const topList = view.state.doc.child(0)
    const nestedList = topList.child(0).child(1)
    expect(topList.type.name).toBe('bulletList')
    expect(topList.child(0).attrs.task).toBe(true)
    expect(topList.child(0).attrs.checked).toBe(false)
    expect(topList.child(1).attrs.task).toBe(true)
    expect(nestedList.type.name).toBe('bulletList')
    expect(nestedList.child(0).attrs.task).toBe(true)
    expect(nestedList.child(0).textContent).toBe('child')
  })

  it('converts a selected nested ordered list to tasks without changing the parent numbered list', () => {
    const nestedOrderedList = listCommandSchema.nodes.orderedList.create({ order: 1 }, [pmListItem('child')])
    const orderedList = listCommandSchema.nodes.orderedList.create({ order: 1 }, [
      pmListItem('parent', [nestedOrderedList]),
    ])
    const doc = listCommandSchema.nodes.doc.create(null, [orderedList])
    const view = createStateView(doc, getTextSelectionPosition(doc, 'child'))

    expect(convertSelectedOrderedListsToTaskList(view)).toBe(true)

    const topList = view.state.doc.child(0)
    const nestedList = topList.child(0).child(1)
    expect(topList.type.name).toBe('orderedList')
    expect(nestedList.type.name).toBe('bulletList')
    expect(nestedList.child(0).attrs.task).toBe(true)
    expect(nestedList.child(0).textContent).toBe('child')
  })

  it('uses structural conversion for numbered-to-task so nested letters do not remain', () => {
    const nestedOrderedList = listCommandSchema.nodes.orderedList.create({ order: 1 }, [pmListItem('child')])
    const orderedList = listCommandSchema.nodes.orderedList.create({ order: 1 }, [
      pmListItem('parent', [nestedOrderedList]),
    ])
    const doc = listCommandSchema.nodes.doc.create(null, [orderedList])
    const view = createStateView(doc, getTextSelectionPosition(doc, 'parent'))
    const exec = vi.fn()
    const editor = {
      focus: vi.fn(),
      exec,
      getSelectedText: () => '',
      getMarkdown: () => '1. parent\n   1. child',
      setMarkdown: vi.fn(),
      wwEditor: {
        view,
      },
    }

    expect(applyListToolbarCommand(editor as any, 'taskList')).toBe(true)

    expect(exec).not.toHaveBeenCalledWith('taskList')
    const topList = view.state.doc.child(0)
    const nestedList = topList.child(0).child(1)
    expect(topList.type.name).toBe('bulletList')
    expect(topList.child(0).attrs.task).toBe(true)
    expect(nestedList.type.name).toBe('bulletList')
    expect(nestedList.child(0).attrs.task).toBe(true)
  })

  it('restores highlighted text selection after converting a numbered list to tasks', () => {
    const orderedList = listCommandSchema.nodes.orderedList.create({ order: 1 }, [
      pmListItem('one'),
      pmListItem('two'),
      pmListItem('closing'),
    ])
    const doc = listCommandSchema.nodes.doc.create(null, [orderedList])
    const oneRange = getTextRange(doc, 'one')
    const twoRange = getTextRange(doc, 'two')
    const view = createViewWithSelection(doc, oneRange.from, twoRange.to)
    const editor = {
      focus: vi.fn(),
      exec: vi.fn(),
      getSelectedText: () => 'one\ntwo',
      getMarkdown: () => '1. one\n2. two\n3. closing',
      setMarkdown: vi.fn(),
      wwEditor: {
        view,
      },
    }

    expect(applyListToolbarCommand(editor as any, 'taskList')).toBe(true)

    expect(editor.exec).not.toHaveBeenCalledWith('taskList')
    expect(view.state.doc.child(0).type.name).toBe('bulletList')
    expect(view.state.doc.child(0).child(0).attrs.task).toBe(true)
    expect(view.state.selection.from).toBe(getTextRange(view.state.doc, 'one').from)
    expect(view.state.selection.to).toBe(getTextRange(view.state.doc, 'two').to)
  })

  it('restores logical selection after unwrapping matching list items through markdown', () => {
    const list = listCommandSchema.nodes.bulletList.create(null, [pmListItem('one'), pmListItem('two')])
    const listDoc = listCommandSchema.nodes.doc.create(null, [list, pmParagraph('closing')])
    const oneRange = getTextRange(listDoc, 'one')
    const twoRange = getTextRange(listDoc, 'two')
    const view = createViewWithSelection(listDoc, oneRange.from, twoRange.to)
    const plainDoc = listCommandSchema.nodes.doc.create(null, [
      pmParagraph('one'),
      pmParagraph('two'),
      pmParagraph('closing'),
    ])
    const editor = {
      focus: vi.fn(),
      exec: vi.fn(),
      getSelectedText: () => 'one\ntwo',
      getMarkdown: () => '* one\n* two\n\nclosing',
      setMarkdown: vi.fn(() => {
        view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, plainDoc.content))
      }),
      wwEditor: {
        view,
      },
    }

    expect(applyListToolbarCommand(editor as any, 'bulletList')).toBe(true)

    expect(editor.setMarkdown).toHaveBeenCalledWith('one\n\ntwo\n\nclosing', false)
    expect(view.state.doc.child(0).textContent).toBe('one')
    expect(view.state.doc.child(1).textContent).toBe('two')
    expect(view.state.selection.from).toBe(getTextRange(view.state.doc, 'one').from)
    expect(view.state.selection.to).toBe(getTextRange(view.state.doc, 'two').to)
    expect(view.state.selection.to).toBeLessThan(view.state.doc.content.size)
  })

  it('converts selected paragraphs to tasks without collapsing the selection', () => {
    const paragraphDoc = listCommandSchema.nodes.doc.create(null, [
      pmParagraph('one'),
      pmParagraph('two'),
      pmParagraph('closing'),
    ])
    const oneRange = getTextRange(paragraphDoc, 'one')
    const twoRange = getTextRange(paragraphDoc, 'two')
    const view = createViewWithSelection(paragraphDoc, oneRange.from, twoRange.to)
    const editor = {
      focus: vi.fn(),
      exec: vi.fn(),
      getSelectedText: () => 'one\ntwo',
      getMarkdown: () => 'one\n\ntwo\n\nclosing',
      setMarkdown: vi.fn(),
      wwEditor: {
        view,
      },
    }

    expect(applyListToolbarCommand(editor as any, 'taskList')).toBe(true)

    expect(editor.exec).not.toHaveBeenCalledWith('taskList')
    expect(view.state.doc.child(0).type.name).toBe('bulletList')
    expect(listItemParagraphTexts(view.state.doc.child(0))).toEqual(['one', 'two'])
    expect(view.state.doc.child(0).child(0).attrs).toMatchObject({ task: true, checked: false })
    expect(view.state.doc.child(0).child(1).attrs).toMatchObject({ task: true, checked: false })
    expect(view.state.doc.child(1).textContent).toBe('closing')
    expect(view.state.selection.from).toBe(getTextRange(view.state.doc, 'one').from)
    expect(view.state.selection.to).toBe(getTextRange(view.state.doc, 'two').to)
  })

  it.each([
    [
      'bullet',
      () => listCommandSchema.nodes.bulletList.create(null, [pmListItem('one'), pmListItem('two'), pmListItem('closing')]),
    ],
    [
      'dash',
      () =>
        listCommandSchema.nodes.bulletList.create(
          { htmlAttrs: { 'data-aislenote-list-marker': 'dash' } },
          [pmListItem('one'), pmListItem('two'), pmListItem('closing')],
        ),
    ],
    [
      'numbered',
      () =>
        listCommandSchema.nodes.orderedList.create(
          { order: 1 },
          [pmListItem('one'), pmListItem('two'), pmListItem('closing')],
        ),
    ],
  ])('converts selected %s rows to tasks without collapsing the selection', (_label, createList) => {
    const doc = listCommandSchema.nodes.doc.create(null, [createList()])
    const oneRange = getTextRange(doc, 'one')
    const twoRange = getTextRange(doc, 'two')
    const view = createViewWithSelection(doc, oneRange.from, twoRange.to)
    const editor = {
      focus: vi.fn(),
      exec: vi.fn(),
      getSelectedText: () => 'one\ntwo',
      getMarkdown: () => '',
      setMarkdown: vi.fn(),
      wwEditor: {
        view,
      },
    }

    expect(applyListToolbarCommand(editor as any, 'taskList')).toBe(true)

    expect(editor.exec).not.toHaveBeenCalledWith('taskList')
    expect(view.state.doc.child(0).type.name).toBe('bulletList')
    expect(listItemParagraphTexts(view.state.doc.child(0))).toEqual(['one', 'two'])
    expect(view.state.doc.child(0).child(0).attrs).toMatchObject({ task: true, checked: false })
    expect(view.state.doc.child(0).child(1).attrs).toMatchObject({ task: true, checked: false })
    expect(view.state.selection.from).toBe(getTextRange(view.state.doc, 'one').from)
    expect(view.state.selection.to).toBe(getTextRange(view.state.doc, 'two').to)
  })

  it('restores highlighted text selection after converting paragraphs to an ordered list', () => {
    const paragraphDoc = listCommandSchema.nodes.doc.create(null, [
      pmParagraph('one'),
      pmParagraph('two'),
      pmParagraph('closing'),
    ])
    const oneRange = getTextRange(paragraphDoc, 'one')
    const twoRange = getTextRange(paragraphDoc, 'two')
    const view = createViewWithSelection(paragraphDoc, oneRange.from, twoRange.to)
    const orderedDoc = listCommandSchema.nodes.doc.create(null, [
      listCommandSchema.nodes.orderedList.create({ order: 1 }, [pmListItem('one'), pmListItem('two')]),
      pmParagraph('closing'),
    ])
    const editor = {
      focus: vi.fn(),
      exec: vi.fn((command: string) => {
        if (command !== 'orderedList') return
        const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, orderedDoc.content)
        const endRange = getTextRange(tr.doc, 'closing')
        view.dispatch(tr.setSelection(TextSelection.create(tr.doc, endRange.to, endRange.to)))
      }),
      getSelectedText: () => 'one\ntwo',
      getMarkdown: () => 'one\n\ntwo\n\nclosing',
      setMarkdown: vi.fn(),
      wwEditor: {
        view,
      },
    }

    expect(applyListToolbarCommand(editor as any, 'orderedList')).toBe(true)

    expect(editor.exec).not.toHaveBeenCalledWith('orderedList')
    expect(view.state.doc.child(0).type.name).toBe('orderedList')
    expect(view.state.selection.from).toBe(getTextRange(view.state.doc, 'one').from)
    expect(view.state.selection.to).toBe(getTextRange(view.state.doc, 'two').to)
    expect(view.state.selection.to).toBeLessThan(view.state.doc.content.size)
  })
})
