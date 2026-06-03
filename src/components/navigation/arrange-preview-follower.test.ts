import { describe, expect, it } from 'vitest'
import {
  ARRANGE_PREVIEW_GHOST_CONFIGS,
  createArrangePreviewFollowers,
  getArrangePreviewGhostCssProperties,
  getArrangePreviewLaggedTarget,
  updateArrangePreviewFollower,
  type ArrangePreviewFollower,
  type ArrangePreviewTargetRect,
} from './arrange-preview-follower'

const target = (left: number, top = 0): ArrangePreviewTargetRect => ({
  left,
  top,
  width: 120,
  height: 32,
})

describe('arrange preview follower', () => {
  it('starts ghosts from selected item source offsets', () => {
    const followers = createArrangePreviewFollowers(
      2,
      [
        { x: -32, y: 4 },
        { x: 64, y: -8 },
      ],
      target(100, 40),
    )

    expect(followers[0]).toMatchObject({ x: 68, y: 44, previousTargetLeft: 100, previousTargetTop: 40 })
    expect(followers[1]).toMatchObject({ x: 164, y: 32, previousTargetLeft: 100, previousTargetTop: 40 })
  })

  it('moves only partway toward the dragged item on the first frame', () => {
    const [follower] = createArrangePreviewFollowers(1, [{ x: -40, y: 0 }], target(0))
    const next = updateArrangePreviewFollower(follower, target(40), 16, ARRANGE_PREVIEW_GHOST_CONFIGS[0])

    expect(next.x).toBeGreaterThan(follower.x)
    expect(next.x).toBeLessThan(40)
  })

  it('uses pointer velocity so faster movement trails farther behind', () => {
    const baseFollower: ArrangePreviewFollower = {
      x: 0,
      y: 0,
      previousTargetLeft: 0,
      previousTargetTop: 0,
    }
    const fast = updateArrangePreviewFollower(baseFollower, target(40), 16, ARRANGE_PREVIEW_GHOST_CONFIGS[0])
    const slow = updateArrangePreviewFollower(baseFollower, target(40), 64, ARRANGE_PREVIEW_GHOST_CONFIGS[0])

    expect(40 - fast.x).toBeGreaterThan(40 - slow.x)
  })

  it('catches up when the dragged item stops', () => {
    let follower = updateArrangePreviewFollower(
      {
        x: -40,
        y: 0,
        previousTargetLeft: 0,
        previousTargetTop: 0,
      },
      target(80),
      16,
      ARRANGE_PREVIEW_GHOST_CONFIGS[0],
    )

    for (let index = 0; index < 80; index += 1) {
      follower = updateArrangePreviewFollower(follower, target(80), 16, ARRANGE_PREVIEW_GHOST_CONFIGS[0])
    }

    expect(follower.x).toBeCloseTo(80, 1)
    expect(follower.y).toBeCloseTo(0, 1)
  })

  it('clamps the velocity lag target', () => {
    const laggedTarget = getArrangePreviewLaggedTarget(
      {
        x: 0,
        y: 0,
        previousTargetLeft: 0,
        previousTargetTop: 0,
      },
      target(1000),
      16,
      ARRANGE_PREVIEW_GHOST_CONFIGS[0],
    )

    expect(1000 - laggedTarget.x).toBeCloseTo(72, 5)
  })

  it('emits centered reduced-motion styles with alternating rotation', () => {
    const [follower] = createArrangePreviewFollowers(1, [{ x: -40, y: 10 }], target(100, 50))

    expect(getArrangePreviewGhostCssProperties(0, follower, target(100, 50), true)).toMatchObject({
      '--arrange-preview-ghost-x': '0px',
      '--arrange-preview-ghost-y': '0px',
      '--arrange-preview-ghost-rotation': '-30deg',
    })
    expect(getArrangePreviewGhostCssProperties(1, follower, target(100, 50), true)).toMatchObject({
      '--arrange-preview-ghost-rotation': '30deg',
    })
  })
})
