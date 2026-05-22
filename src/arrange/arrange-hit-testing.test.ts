import { describe, expect, it } from 'vitest'
import {
  EXACT_RAIL_HIT_PADDING_PX,
  TAB_RAIL_HIT_PADDING_PX,
  getArrangeInsertionTargetFromRects,
  getArrangeItemTargetFromRects,
  getFirstArrangeRailHitFromRects,
  isPointInsideArrangeRect,
  makeArrangeHitPoint,
  type ArrangeRailHitInput,
  type ArrangeRectLike,
} from './arrange-hit-testing'

function rect(left: number, top: number, width: number, height: number): ArrangeRectLike {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  }
}

describe('arrange hit testing', () => {
  it('uses the same client coordinates for preview and hit testing without offsets', () => {
    expect(makeArrangeHitPoint(33, 44)).toEqual({ clientX: 33, clientY: 44 })
  })

  it('keeps exact domain row bounds from stealing a space-row drop', () => {
    const rails: ArrangeRailHitInput<'domain' | 'space'>[] = [
      {
        type: 'domain',
        railRect: rect(0, 0, 300, 30),
        targets: [{ id: 'domain-a', rect: rect(10, 4, 80, 22) }],
        padding: EXACT_RAIL_HIT_PADDING_PX,
      },
      {
        type: 'space',
        railRect: rect(0, 32, 300, 30),
        targets: [{ id: 'space-a', rect: rect(10, 36, 80, 22) }],
        padding: EXACT_RAIL_HIT_PADDING_PX,
      },
    ]

    const hit = getFirstArrangeRailHitFromRects(rails, makeArrangeHitPoint(20, 34))

    expect(hit).toEqual({ type: 'space', target: { targetId: 'space-a', position: 'before' } })
  })

  it('does not treat old padded domain bounds as a valid domain hit', () => {
    expect(isPointInsideArrangeRect(rect(0, 0, 300, 30), makeArrangeHitPoint(20, 34), EXACT_RAIL_HIT_PADDING_PX)).toBe(
      false,
    )
    expect(isPointInsideArrangeRect(rect(0, 0, 300, 30), makeArrangeHitPoint(20, 34), TAB_RAIL_HIT_PADDING_PX)).toBe(
      true,
    )
  })

  it('keeps forgiving parent rail padding for before/after placement only', () => {
    const rails: ArrangeRailHitInput<'parent'>[] = [
      {
        type: 'parent',
        railRect: rect(0, 60, 300, 30),
        targets: [{ id: 'parent-a', rect: rect(20, 64, 80, 22) }],
        padding: TAB_RAIL_HIT_PADDING_PX,
      },
    ]

    const hit = getFirstArrangeRailHitFromRects(rails, makeArrangeHitPoint(40, 52))

    expect(hit).toEqual({ type: 'parent', target: { targetId: 'parent-a', position: 'before' } })
  })

  it('uses clientX directly to resolve before and after positions', () => {
    const targets = [{ id: 'space-a', rect: rect(20, 20, 80, 24) }]

    expect(getArrangeInsertionTargetFromRects(targets, makeArrangeHitPoint(59, 30))).toEqual({
      targetId: 'space-a',
      position: 'before',
    })
    expect(getArrangeInsertionTargetFromRects(targets, makeArrangeHitPoint(60, 30))).toEqual({
      targetId: 'space-a',
      position: 'after',
    })
  })

  it('returns exact item hits only when the cursor is inside the item', () => {
    const targets = [
      { id: 'domain-a', rect: rect(20, 20, 80, 24) },
      { id: 'domain-b', rect: rect(120, 20, 80, 24) },
    ]

    expect(getArrangeItemTargetFromRects(targets, makeArrangeHitPoint(130, 30))).toEqual({ targetId: 'domain-b' })
    expect(getArrangeItemTargetFromRects(targets, makeArrangeHitPoint(104, 30))).toBeNull()
  })

  it('does not leak exact item hits into adjacent rows', () => {
    const targets = [
      { id: 'domain-a', rect: rect(20, 20, 80, 24) },
      { id: 'space-a', rect: rect(20, 50, 80, 24) },
    ]

    expect(getArrangeItemTargetFromRects(targets, makeArrangeHitPoint(30, 46))).toBeNull()
    expect(getArrangeItemTargetFromRects(targets, makeArrangeHitPoint(30, 52))).toEqual({ targetId: 'space-a' })
  })

  it('keeps insertion targeting available in row gaps for reordering', () => {
    const targets = [
      { id: 'domain-a', rect: rect(20, 20, 80, 24) },
      { id: 'domain-b', rect: rect(120, 20, 80, 24) },
    ]

    expect(getArrangeItemTargetFromRects(targets, makeArrangeHitPoint(104, 30))).toBeNull()
    expect(getArrangeInsertionTargetFromRects(targets, makeArrangeHitPoint(104, 30))).toEqual({
      targetId: 'domain-b',
      position: 'before',
    })
  })
})
