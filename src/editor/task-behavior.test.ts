import { Schema } from 'prosemirror-model'
import { EditorState } from 'prosemirror-state'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  EMPTY_LIST_ITEM_PLACEHOLDER,
  moveListItemBranchInMarkdown,
  reorderListMarkdownLines,
  unwrapMatchingListItemsMarkdown,
} from './list-reorder-markdown'
import {
  TASK_REORDER_SELECTION_SUPPRESSION_CLASS,
  captureListItemBranchInEditor,
  createTaskReorderSelectionSuppressionController,
  getListReorderPointerDecision,
  mergeInlineRectsIntoLineRects,
  moveCapturedListItemBranchInEditor,
  moveListItemBranchInEditor,
  scheduleTaskReorderNativeSelectionClear,
  setTaskReorderDocumentSelectionSuppressed,
  shouldSuppressListReorderSelectStart,
  shouldUseManualListCaretPlacement,
} from './task-behavior'

const listTestSchema = new Schema({
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

function paragraph(text: string) {
  return text
    ? listTestSchema.nodes.paragraph.create(null, listTestSchema.text(text))
    : listTestSchema.nodes.paragraph.create()
}

function listItem(text: string, children: any[] = []) {
  return listTestSchema.nodes.listItem.create(null, [paragraph(text), ...children])
}

function getTopLevelListTexts(doc: any): string[] {
  const list = doc.child(1)
  return getListTexts(list)
}

function getListTexts(list: any): string[] {
  const texts: string[] = []
  for (let index = 0; index < (list?.childCount ?? 0); index += 1) {
    texts.push(list.child(index).child(0).textContent)
  }
  return texts
}

function createListMoveView(doc: any, positions: Map<HTMLElement, number>) {
  let state = EditorState.create({ doc })
  const view: any = {
    get state() {
      return state
    },
    posAtDOM: (element: HTMLElement) => {
      const position = positions.get(element)
      if (position === undefined) throw new Error('missing DOM position')
      return position
    },
    dispatch: vi.fn((transaction) => {
      state = state.apply(transaction)
    }),
  }
  return view
}

function createClassList() {
  const classes = new Set<string>()
  return {
    toggle: (className: string, force?: boolean) => {
      if (force) classes.add(className)
      else classes.delete(className)
      return classes.has(className)
    },
    contains: (className: string) => classes.has(className),
  }
}

function stubSelectionSuppressionEnvironment() {
  let selectionChangeHandler: ((event: Event) => void) | null = null
  const frameCallbacks: Array<(time: number) => void> = []
  const timeoutCallbacks: Array<() => void> = []
  const documentElementClassList = createClassList()
  const bodyClassList = createClassList()
  const windowRemoveAllRanges = vi.fn()
  const documentRemoveAllRanges = vi.fn()
  const addEventListener = vi.fn((eventName: string, handler: EventListenerOrEventListenerObject) => {
    if (eventName !== 'selectionchange') return
    selectionChangeHandler =
      typeof handler === 'function' ? handler : (event: Event) => handler.handleEvent(event)
  })
  const removeEventListener = vi.fn((eventName: string) => {
    if (eventName === 'selectionchange') selectionChangeHandler = null
  })

  vi.stubGlobal('window', {
    getSelection: () => ({ removeAllRanges: windowRemoveAllRanges }),
    requestAnimationFrame: (callback: (time: number) => void) => {
      frameCallbacks.push(callback)
      return frameCallbacks.length
    },
    cancelAnimationFrame: vi.fn(),
    setTimeout: (callback: () => void) => {
      timeoutCallbacks.push(callback)
      return timeoutCallbacks.length
    },
    clearTimeout: vi.fn(),
  })
  vi.stubGlobal('document', {
    documentElement: { classList: documentElementClassList },
    body: { classList: bodyClassList },
    getSelection: () => ({ removeAllRanges: documentRemoveAllRanges }),
    addEventListener,
    removeEventListener,
  })

  return {
    documentElementClassList,
    bodyClassList,
    windowRemoveAllRanges,
    documentRemoveAllRanges,
    addEventListener,
    removeEventListener,
    flushScheduledSelectionClears: () => {
      while (frameCallbacks.length > 0) {
        frameCallbacks.shift()?.(0)
      }
      while (timeoutCallbacks.length > 0) {
        timeoutCallbacks.shift()?.()
      }
    },
    fireSelectionChange: () => {
      selectionChangeHandler?.({} as Event)
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('list markdown reordering', () => {
  it('reorders task lines within one contiguous cluster', () => {
    const markdown = '- [ ] one\n- [x] two\n- [ ] three'

    expect(reorderListMarkdownLines(markdown, ['one', 'two', 'three'], 'task', 1, 0)).toBe(
      '- [x] two\n- [ ] one\n- [ ] three',
    )
  })

  it('reorders bullet and dash lists without crossing blank separators', () => {
    expect(reorderListMarkdownLines('* one\n* two\n* three', ['one', 'two', 'three'], 'bullet', 0, 3)).toBe(
      '* two\n* three\n* one',
    )
    expect(reorderListMarkdownLines('- one\n\n- two', ['one', 'two'], 'dash', 0, 2)).toBeNull()
  })

  it('keeps empty bullet and dash items parseable after moving them to the top', () => {
    expect(reorderListMarkdownLines('* one\n* two\n*', ['one', 'two', ''], 'bullet', 2, 0)).toBe(
      `* ${EMPTY_LIST_ITEM_PLACEHOLDER}\n* one\n* two`,
    )
    expect(reorderListMarkdownLines('- one\n- two\n-', ['one', 'two', ''], 'dash', 2, 0)).toBe(
      `- ${EMPTY_LIST_ITEM_PLACEHOLDER}\n- one\n- two`,
    )
  })

  it('renumbers ordered list prefixes after reorder', () => {
    const markdown = '3. alpha\n4. beta\n5. gamma'

    expect(reorderListMarkdownLines(markdown, ['alpha', 'beta', 'gamma'], 'numbered', 2, 0)).toBe(
      '3. gamma\n4. alpha\n5. beta',
    )
  })

  it('moves a list item branch at the same level', () => {
    const markdown = '* one\n* two\n    * child\n* three'

    expect(moveListItemBranchInMarkdown(markdown, 'bullet', ['one', 'two', 'three'], 1, ['one', 'two', 'three'], 3)).toBe(
      '* one\n* three\n* two\n    * child',
    )
  })

  it('preserves surrounding blank lines and headings when moving a list branch', () => {
    const markdown = '* first\n\n## Break\n\n* one\n* two\n* three\n\nclosing'

    expect(
      moveListItemBranchInMarkdown(
        markdown,
        'bullet',
        ['one', 'two', 'three'],
        1,
        ['one', 'two', 'three'],
        3,
      ),
    ).toBe('* first\n\n## Break\n\n* one\n* three\n* two\n\nclosing')
  })

  it('moves a branch into an existing nested list group', () => {
    const markdown = '* one\n    * child a\n    * child b\n* two\n* three'

    expect(
      moveListItemBranchInMarkdown(
        markdown,
        'bullet',
        ['one', 'two', 'three'],
        2,
        ['child a', 'child b'],
        1,
      ),
    ).toBe('* one\n    * child a\n    * three\n    * child b\n* two')
  })

  it('does not move branches across list clusters or kinds', () => {
    expect(moveListItemBranchInMarkdown('* one\n\n* two', 'bullet', ['one'], 0, ['two'], 1)).toBeNull()
    expect(moveListItemBranchInMarkdown('* one\n- two', 'bullet', ['one'], 0, ['two'], 1)).toBeNull()
  })

  it('renumbers ordered list groups after branch moves', () => {
    const markdown = '5. alpha\n6. beta\n    1. child\n7. gamma'

    expect(
      moveListItemBranchInMarkdown(markdown, 'numbered', ['alpha', 'beta', 'gamma'], 2, ['alpha', 'beta', 'gamma'], 1),
    ).toBe('5. alpha\n6. gamma\n7. beta\n    1. child')
  })

  it('unwraps fully selected matching list items and keeps partial branches unchanged', () => {
    expect(unwrapMatchingListItemsMarkdown('* one\n* two', 'one\ntwo', 'bullet')).toBe('one\ntwo')
    expect(unwrapMatchingListItemsMarkdown('* parent\n    * child', 'parent', 'bullet')).toBeNull()
    expect(unwrapMatchingListItemsMarkdown('* parent\n    * child', 'parent\nchild', 'bullet')).toBe('parent\n    child')
  })
})

describe('list reorder pointer handling', () => {
  it('merges inline mark fragments into one visual line before trailing-space checks', () => {
    expect(
      mergeInlineRectsIntoLineRects([
        { top: 10, bottom: 24, left: 20, right: 72, width: 52, height: 14 },
        { top: 10, bottom: 24, left: 72, right: 132, width: 60, height: 14 },
      ]),
    ).toEqual([{ top: 10, bottom: 24, left: 20, right: 132, width: 112, height: 14 }])
  })

  it('keeps separate wrapped lines separate when merging inline fragments', () => {
    expect(
      mergeInlineRectsIntoLineRects([
        { top: 10, bottom: 24, left: 20, right: 72, width: 52, height: 14 },
        { top: 30, bottom: 44, left: 20, right: 92, width: 72, height: 14 },
      ]),
    ).toEqual([
      { top: 10, bottom: 24, left: 20, right: 72, width: 52, height: 14 },
      { top: 30, bottom: 44, left: 20, right: 92, width: 72, height: 14 },
    ])
  })

  it('does not suppress normal text clicks or horizontal text selection movement', () => {
    expect(getListReorderPointerDecision(0, 0)).toEqual({
      shouldCancelReorder: false,
      shouldSuppressSelection: false,
      shouldStartDrag: false,
    })
    expect(getListReorderPointerDecision(20, 2)).toEqual({
      shouldCancelReorder: true,
      shouldSuppressSelection: false,
      shouldStartDrag: false,
    })
  })

  it('suppresses native selection on early vertical reorder movement before drag starts', () => {
    expect(getListReorderPointerDecision(1, 4)).toEqual({
      shouldCancelReorder: false,
      shouldSuppressSelection: true,
      shouldStartDrag: false,
    })
    expect(getListReorderPointerDecision(2, 8)).toEqual({
      shouldCancelReorder: false,
      shouldSuppressSelection: true,
      shouldStartDrag: true,
    })
    expect(getListReorderPointerDecision(10, 8)).toEqual({
      shouldCancelReorder: false,
      shouldSuppressSelection: true,
      shouldStartDrag: true,
    })
  })

  it('does not block selectstart until a reorder drag is active', () => {
    expect(shouldSuppressListReorderSelectStart(false)).toBe(false)
    expect(shouldSuppressListReorderSelectStart(true)).toBe(true)
  })

  it('toggles document-level selection suppression for active drags', () => {
    const { documentElementClassList, bodyClassList } = stubSelectionSuppressionEnvironment()

    setTaskReorderDocumentSelectionSuppressed(true)
    expect(documentElementClassList.contains(TASK_REORDER_SELECTION_SUPPRESSION_CLASS)).toBe(true)
    expect(bodyClassList.contains(TASK_REORDER_SELECTION_SUPPRESSION_CLASS)).toBe(true)

    setTaskReorderDocumentSelectionSuppressed(false)
    expect(documentElementClassList.contains(TASK_REORDER_SELECTION_SUPPRESSION_CLASS)).toBe(false)
    expect(bodyClassList.contains(TASK_REORDER_SELECTION_SUPPRESSION_CLASS)).toBe(false)
  })

  it('clears drag selection immediately and after the browser selection pass', () => {
    const environment = stubSelectionSuppressionEnvironment()
    const onComplete = vi.fn()

    scheduleTaskReorderNativeSelectionClear(onComplete)

    expect(environment.windowRemoveAllRanges).toHaveBeenCalledTimes(1)
    expect(environment.documentRemoveAllRanges).toHaveBeenCalledTimes(1)
    expect(onComplete).not.toHaveBeenCalled()

    environment.flushScheduledSelectionClears()

    expect(environment.windowRemoveAllRanges).toHaveBeenCalledTimes(3)
    expect(environment.documentRemoveAllRanges).toHaveBeenCalledTimes(3)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('keeps selection suppression through selectionchange and delayed release', () => {
    const environment = stubSelectionSuppressionEnvironment()
    const controller = createTaskReorderSelectionSuppressionController()

    controller.begin()
    expect(controller.isActive()).toBe(true)
    expect(environment.documentElementClassList.contains(TASK_REORDER_SELECTION_SUPPRESSION_CLASS)).toBe(true)
    expect(environment.bodyClassList.contains(TASK_REORDER_SELECTION_SUPPRESSION_CLASS)).toBe(true)
    expect(environment.addEventListener).toHaveBeenCalledWith('selectionchange', expect.any(Function), true)

    environment.windowRemoveAllRanges.mockClear()
    environment.documentRemoveAllRanges.mockClear()
    environment.fireSelectionChange()

    expect(environment.windowRemoveAllRanges).toHaveBeenCalledTimes(1)
    expect(environment.documentRemoveAllRanges).toHaveBeenCalledTimes(1)

    controller.endAfterBrowserPass()
    expect(environment.documentElementClassList.contains(TASK_REORDER_SELECTION_SUPPRESSION_CLASS)).toBe(true)

    environment.flushScheduledSelectionClears()

    expect(controller.isActive()).toBe(false)
    expect(environment.documentElementClassList.contains(TASK_REORDER_SELECTION_SUPPRESSION_CLASS)).toBe(false)
    expect(environment.bodyClassList.contains(TASK_REORDER_SELECTION_SUPPRESSION_CLASS)).toBe(false)
    expect(environment.removeEventListener).toHaveBeenCalledWith('selectionchange', expect.any(Function), true)
  })

  it('does not clear native selection when cleanup never entered suppression', () => {
    const environment = stubSelectionSuppressionEnvironment()
    const controller = createTaskReorderSelectionSuppressionController()

    controller.endImmediately()

    expect(environment.windowRemoveAllRanges).not.toHaveBeenCalled()
    expect(environment.documentRemoveAllRanges).not.toHaveBeenCalled()
    expect(environment.documentElementClassList.contains(TASK_REORDER_SELECTION_SUPPRESSION_CLASS)).toBe(false)
    expect(environment.bodyClassList.contains(TASK_REORDER_SELECTION_SUPPRESSION_CLASS)).toBe(false)
  })

  it('can clean up non-drag list clicks without clearing the placed caret', () => {
    const environment = stubSelectionSuppressionEnvironment()
    const controller = createTaskReorderSelectionSuppressionController()

    controller.endWithoutClearing()
    environment.flushScheduledSelectionClears()

    expect(environment.windowRemoveAllRanges).not.toHaveBeenCalled()
    expect(environment.documentRemoveAllRanges).not.toHaveBeenCalled()
    expect(controller.isActive()).toBe(false)
  })

  it('still clears native selection when an active suppression gesture is cancelled', () => {
    const environment = stubSelectionSuppressionEnvironment()
    const controller = createTaskReorderSelectionSuppressionController()
    controller.begin()
    environment.windowRemoveAllRanges.mockClear()
    environment.documentRemoveAllRanges.mockClear()

    controller.endImmediately()
    environment.flushScheduledSelectionClears()

    expect(environment.windowRemoveAllRanges).toHaveBeenCalledTimes(1)
    expect(environment.documentRemoveAllRanges).toHaveBeenCalledTimes(1)
    expect(controller.isActive()).toBe(false)
    expect(environment.documentElementClassList.contains(TASK_REORDER_SELECTION_SUPPRESSION_CLASS)).toBe(false)
  })

  it('uses manual caret placement only for trailing whitespace clicks inside the item', () => {
    expect(shouldUseManualListCaretPlacement(true, true)).toBe(true)
    expect(shouldUseManualListCaretPlacement(false, true)).toBe(false)
    expect(shouldUseManualListCaretPlacement(true, false)).toBe(false)
  })

  it('moves list item branches structurally without replacing surrounding blocks', () => {
    const nestedList = listTestSchema.nodes.bulletList.create(null, [listItem('child')])
    const list = listTestSchema.nodes.bulletList.create(null, [
      listItem('one'),
      listItem('two', [nestedList]),
      listItem('three'),
    ])
    const doc = listTestSchema.nodes.doc.create(null, [paragraph('before'), list, paragraph('after')])
    const listElement = {} as HTMLElement
    const itemElements = [{}, {}, {}] as HTMLElement[]
    const positions = new Map<HTMLElement, number>([[listElement, 8]])
    doc.descendants((node, position) => {
      if (node.type.name !== 'listItem') return
      const text = node.child(0).textContent
      const index = ['one', 'two', 'three'].indexOf(text)
      const element = itemElements[index]
      if (element) positions.set(element, position)
    })
    const view = createListMoveView(doc, positions)

    expect(
      moveListItemBranchInEditor(view, itemElements[1], listElement, 1, listElement, itemElements, 3),
    ).toBe(true)

    expect(view.state.doc.child(0).textContent).toBe('before')
    expect(view.state.doc.child(2).textContent).toBe('after')
    expect(getTopLevelListTexts(view.state.doc)).toEqual(['one', 'three', 'two'])
    expect(view.state.doc.child(1).child(2).child(1).type.name).toBe('bulletList')
    expect(view.dispatch.mock.calls[0][0].scrolledIntoView).toBe(false)
  })

  it('moves from a captured source branch even if source DOM lookup fails later', () => {
    const list = listTestSchema.nodes.bulletList.create(null, [
      listItem('one'),
      listItem('two'),
      listItem('three'),
    ])
    const doc = listTestSchema.nodes.doc.create(null, [paragraph('before'), list, paragraph('after')])
    const listElement = {} as HTMLElement
    const itemElements = [{}, {}, {}] as HTMLElement[]
    const positions = new Map<HTMLElement, number>([[listElement, 8]])
    doc.descendants((node, position) => {
      if (node.type.name !== 'listItem') return
      const text = node.child(0).textContent
      const index = ['one', 'two', 'three'].indexOf(text)
      const element = itemElements[index]
      if (element) positions.set(element, position)
    })
    const view = createListMoveView(doc, positions)
    const captured = captureListItemBranchInEditor(view, itemElements[1])
    expect(captured).not.toBeNull()

    positions.delete(itemElements[1])
    expect(
      moveCapturedListItemBranchInEditor(view, captured!, 1, listElement, itemElements, 3),
    ).toBe(true)

    expect(getTopLevelListTexts(view.state.doc)).toEqual(['one', 'three', 'two'])
  })

  it('moves list item branches into existing nested groups structurally', () => {
    const nestedList = listTestSchema.nodes.bulletList.create(null, [
      listItem('child a'),
      listItem('child b'),
    ])
    const list = listTestSchema.nodes.bulletList.create(null, [
      listItem('one', [nestedList]),
      listItem('two'),
      listItem('three'),
    ])
    const doc = listTestSchema.nodes.doc.create(null, [paragraph('before'), list, paragraph('after')])
    const topListElement = {} as HTMLElement
    const nestedListElement = {} as HTMLElement
    const itemElements = {
      one: {} as HTMLElement,
      two: {} as HTMLElement,
      three: {} as HTMLElement,
      childA: {} as HTMLElement,
      childB: {} as HTMLElement,
    }
    const positions = new Map<HTMLElement, number>()
    const listElements = [topListElement, nestedListElement]
    let listIndex = 0
    doc.descendants((node, position) => {
      if (node.type.name === 'bulletList') {
        const element = listElements[listIndex]
        if (element) positions.set(element, position)
        listIndex += 1
        return true
      }
      if (node.type.name !== 'listItem') return
      const text = node.child(0).textContent
      if (text === 'one') positions.set(itemElements.one, position)
      if (text === 'two') positions.set(itemElements.two, position)
      if (text === 'three') positions.set(itemElements.three, position)
      if (text === 'child a') positions.set(itemElements.childA, position)
      if (text === 'child b') positions.set(itemElements.childB, position)
    })
    const view = createListMoveView(doc, positions)

    expect(
      moveListItemBranchInEditor(
        view,
        itemElements.three,
        topListElement,
        2,
        nestedListElement,
        [itemElements.childA, itemElements.childB],
        1,
      ),
    ).toBe(true)

    const topList = view.state.doc.child(1)
    const nextNestedList = topList.child(0).child(1)
    expect(getListTexts(topList)).toEqual(['one', 'two'])
    expect(getListTexts(nextNestedList)).toEqual(['child a', 'three', 'child b'])
  })

  it('does not dispatch when structural list move validation fails', () => {
    const list = listTestSchema.nodes.bulletList.create(null, [listItem('one'), listItem('two')])
    const doc = listTestSchema.nodes.doc.create(null, [paragraph('before'), list, paragraph('after')])
    const listElement = {} as HTMLElement
    const itemElements = [{}, {}] as HTMLElement[]
    const positions = new Map<HTMLElement, number>([
      [listElement, 8],
      [itemElements[0], 9],
    ])
    const view = createListMoveView(doc, positions)

    expect(
      moveListItemBranchInEditor(view, itemElements[1], listElement, 1, listElement, itemElements, 0),
    ).toBe(false)
    expect(view.dispatch).not.toHaveBeenCalled()
  })
})
