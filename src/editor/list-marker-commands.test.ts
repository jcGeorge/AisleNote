import { describe, expect, it, vi } from 'vitest'
import {
  applyStructuralListIndent,
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
      node('bulletList', { htmlAttrs: { 'data-tabs-list-marker': 'dash' } }),
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
      node('bulletList', { htmlAttrs: { 'data-tabs-list-marker': 'dash' } }),
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

  it('preserves dash markers when structurally indenting dash list items', () => {
    const transaction = {
      setNodeMarkup: vi.fn(() => transaction),
      scrollIntoView: vi.fn(() => transaction),
    }
    const dispatch = vi.fn()
    const view: any = {
      ...collapsedView([
        node('doc'),
        node('bulletList', { htmlAttrs: { 'data-tabs-list-marker': 'dash' } }),
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
        htmlAttrs: { 'data-tabs-list-marker': 'dash' },
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
        node('bulletList', { htmlAttrs: { 'data-tabs-list-marker': 'dash' } }),
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
        htmlAttrs: { 'data-tabs-list-marker': 'dash' },
      }),
    )
  })

  it('classifies list node kinds without mixing task, bullet, dash, and numbered lists', () => {
    expect(getToolbarListKindForNode(listNode('bulletList', null, [{ task: true }, { task: true }]))).toBe('taskList')
    expect(getToolbarListKindForNode(listNode('bulletList', null, [null]))).toBe('bulletList')
    expect(
      getToolbarListKindForNode(
        listNode('bulletList', { htmlAttrs: { 'data-tabs-list-marker': 'dash' } }, [null]),
      ),
    ).toBe('dashList')
    expect(getToolbarListKindForNode(listNode('orderedList', null, [null]))).toBe('orderedList')
    expect(getToolbarListKindForNode(listNode('bulletList', null, [{ task: true }, null]))).toBeNull()
  })

  it('finds only adjacent same-kind lists for merge', () => {
    const bullet = listNode('bulletList', null, [null])
    const dash = listNode('bulletList', { htmlAttrs: { 'data-tabs-list-marker': 'dash' } }, [null])
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
})
