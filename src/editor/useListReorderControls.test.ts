import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getListReorderHandlePlacement } from './useListReorderControls'

const source = readFileSync(new URL('./useListReorderControls.ts', import.meta.url), 'utf8')

describe('list reorder controls', () => {
  it('places a row-height handle on the list left rail, outside the item text and marker area', () => {
    expect(
      getListReorderHandlePlacement(
        { top: 40, left: 120, width: 220, height: 28 },
        { top: 40, left: 96, width: 244, height: 84 },
        { top: 42, left: 132, width: 180, height: 18 },
        1000,
        800,
      ),
    ).toEqual({
      top: 42,
      left: 78,
      width: 14,
      height: 18,
    })
  })

  it('left-aligns sibling handles to the same list rail even when item text has different x positions', () => {
    const first = getListReorderHandlePlacement(
      { top: 40, left: 120, width: 220, height: 28 },
      { top: 40, left: 96, width: 244, height: 84 },
      { top: 42, left: 132, width: 180, height: 18 },
      1000,
      800,
    )
    const second = getListReorderHandlePlacement(
      { top: 68, left: 124, width: 216, height: 28 },
      { top: 40, left: 96, width: 244, height: 84 },
      { top: 70, left: 148, width: 164, height: 18 },
      1000,
      800,
    )

    expect(first.left).toBe(78)
    expect(second.left).toBe(78)
  })

  it('keeps handles inside the viewport', () => {
    expect(
      getListReorderHandlePlacement(
        { top: 1, left: 6, width: 220, height: 28 },
        { top: 1, left: 6, width: 220, height: 28 },
        { top: 1, left: 6, width: 180, height: 18 },
        120,
        80,
      ),
    ).toEqual({
      top: 8,
      left: 8,
      width: 14,
      height: 18,
    })
  })

  it('keeps tall handles inside the editor host bounds between toolbar and tabs', () => {
    expect(
      getListReorderHandlePlacement(
        { top: 20, left: 120, width: 220, height: 90 },
        { top: 20, left: 96, width: 244, height: 90 },
        { top: 20, left: 132, width: 180, height: 90 },
        1000,
        800,
        { top: 44, bottom: 156 },
      ),
    ).toEqual({
      top: 44,
      left: 78,
      width: 14,
      height: 90,
    })

    expect(
      getListReorderHandlePlacement(
        { top: 120, left: 120, width: 220, height: 60 },
        { top: 120, left: 96, width: 244, height: 60 },
        { top: 120, left: 132, width: 180, height: 60 },
        1000,
        800,
        { top: 44, bottom: 156 },
      ),
    ).toEqual({
      top: 96,
      left: 78,
      width: 14,
      height: 60,
    })
  })

  it('filters list handles by rendered list kind and starts drag from handle segments only', () => {
    expect(source).toContain("querySelectorAll<HTMLElement>('li')")
    expect(source).toContain('getRenderedListItemKind(listItemElement)')
    expect(source).toContain('getDirectReorderListItems(listElement, kind)')
    expect(source).toContain('beginListHandleGesture')
    expect(source).toContain('segment.itemElement')
    expect(source).toContain('moveCapturedListItemBranchInEditor(')
    expect(source).toContain('placeTaskCaretAtParagraphEnd(view, editor, sourceElement)')
    expect(source).not.toContain('getListTextDragElement(')
  })

  it('keeps same-kind nearby nested list targeting from the existing branch-move path', () => {
    expect(source).toContain('getPointerCompatibleListElement(')
    expect(source).toContain('getNearestCompatibleListElement(')
    expect(source).toContain('getTaskDropTargetFromList(')
    expect(source).toContain('getTopReorderListElement(listElement, view.dom)')
  })
})
