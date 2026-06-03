import { describe, expect, it } from 'vitest'
import {
  ARRANGE_PREVIEW_GHOST_CONFIGS,
  ARRANGE_PREVIEW_PRIMARY_CONFIG,
  createArrangePreviewFollowers,
  createArrangePreviewPrimaryFollower,
  getArrangePreviewGhostConfig,
  getArrangePreviewGhostCssProperties,
  getArrangePreviewLaggedTarget,
  getArrangePreviewPrimaryCssProperties,
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
      [
        { id: 'a', label: 'A', x: -32, y: 4, width: 90, height: 24 },
        { id: 'b', label: 'B', x: 64, y: -8, width: 140, height: 36 },
      ],
      target(100, 40),
    )

    expect(followers[0]).toMatchObject({
      x: 68,
      y: 44,
      width: 90,
      height: 24,
      previousTargetLeft: 100,
      previousTargetTop: 40,
    })
    expect(followers[1]).toMatchObject({
      x: 164,
      y: 32,
      width: 140,
      height: 36,
      previousTargetLeft: 100,
      previousTargetTop: 40,
    })
  })

  it('starts the primary follower at the dragged preview target', () => {
    expect(createArrangePreviewPrimaryFollower(target(100, 40))).toMatchObject({
      x: 100,
      y: 40,
      width: 120,
      height: 32,
      previousTargetLeft: 100,
      previousTargetTop: 40,
    })
  })

  it('moves only partway toward the dragged item on the first frame', () => {
    const [follower] = createArrangePreviewFollowers(
      [{ id: 'a', label: 'A', x: -40, y: 0, width: 120, height: 32 }],
      target(0),
    )
    const next = updateArrangePreviewFollower(follower, target(80), 16, ARRANGE_PREVIEW_GHOST_CONFIGS[0])

    expect(next.x).toBeGreaterThan(follower.x)
    expect(next.x).toBeLessThan(72)
  })

  it('moves the primary preview only partway toward the pointer on the first frame', () => {
    const follower = createArrangePreviewPrimaryFollower(target(0))
    const next = updateArrangePreviewFollower(follower, target(80), 16, ARRANGE_PREVIEW_PRIMARY_CONFIG)

    expect(next.x).toBeGreaterThan(follower.x)
    expect(next.x).toBeLessThan(80)
    expect(next.y).toBe(0)
  })

  it('uses pointer velocity so faster movement trails farther behind', () => {
    const baseFollower: ArrangePreviewFollower = {
      x: 0,
      y: 0,
      previousTargetLeft: 0,
      previousTargetTop: 0,
      width: 120,
      height: 32,
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
        width: 120,
        height: 32,
      },
      target(80),
      16,
      ARRANGE_PREVIEW_GHOST_CONFIGS[0],
    )

    for (let index = 0; index < 80; index += 1) {
      follower = updateArrangePreviewFollower(follower, target(80), 16, ARRANGE_PREVIEW_GHOST_CONFIGS[0])
    }

    expect(follower.x).toBeCloseTo(72, 1)
    expect(follower.y).toBeCloseTo(-3, 1)
  })

  it('clamps the velocity lag target', () => {
    const laggedTarget = getArrangePreviewLaggedTarget(
      {
        x: 0,
        y: 0,
        previousTargetLeft: 0,
        previousTargetTop: 0,
        width: 120,
        height: 32,
      },
      target(1000),
      16,
      ARRANGE_PREVIEW_GHOST_CONFIGS[0],
    )

    expect(992 - laggedTarget.x).toBeCloseTo(72, 5)
  })

  it('emits settled reduced-motion styles with subtle offsets and rotations', () => {
    const [follower] = createArrangePreviewFollowers(
      [{ id: 'a', label: 'A', x: -40, y: 10, width: 80, height: 20 }],
      target(100, 50),
    )

    expect(getArrangePreviewGhostCssProperties(0, follower, target(100, 50), true)).toMatchObject({
      '--arrange-preview-ghost-x': '12px',
      '--arrange-preview-ghost-y': '3px',
      '--arrange-preview-ghost-rotation': '-8deg',
    })
    expect(getArrangePreviewGhostCssProperties(1, follower, target(100, 50), true)).toMatchObject({
      '--arrange-preview-ghost-x': '28px',
      '--arrange-preview-ghost-y': '9px',
      '--arrange-preview-ghost-rotation': '8deg',
    })
  })

  it('keeps a follower stable in viewport space when the preview root moves between frames', () => {
    const follower: ArrangePreviewFollower = {
      x: 68,
      y: 44,
      width: 90,
      height: 24,
      previousTargetLeft: 100,
      previousTargetTop: 40,
    }
    const initialStyle = getArrangePreviewGhostCssProperties(0, follower, target(100, 40))
    const movedStyle = getArrangePreviewGhostCssProperties(0, follower, target(140, 52))
    const initialVariables = initialStyle as Record<string, string>
    const movedVariables = movedStyle as Record<string, string>
    const initialViewportLeft = 100 + Number.parseInt(initialVariables['--arrange-preview-ghost-x'], 10)
    const movedViewportLeft = 140 + Number.parseInt(movedVariables['--arrange-preview-ghost-x'], 10)
    const initialViewportTop = 40 + Number.parseInt(initialVariables['--arrange-preview-ghost-y'], 10)
    const movedViewportTop = 52 + Number.parseInt(movedVariables['--arrange-preview-ghost-y'], 10)

    expect(initialViewportLeft).toBe(68)
    expect(movedViewportLeft).toBe(68)
    expect(initialViewportTop).toBe(44)
    expect(movedViewportTop).toBe(44)
  })

  it('keeps the primary follower stable in viewport space when the preview root moves between frames', () => {
    const follower = createArrangePreviewPrimaryFollower(target(100, 40))
    const initialStyle = getArrangePreviewPrimaryCssProperties(follower, target(100, 40))
    const movedStyle = getArrangePreviewPrimaryCssProperties(follower, target(140, 52))
    const initialVariables = initialStyle as Record<string, string>
    const movedVariables = movedStyle as Record<string, string>
    const initialViewportLeft = 100 + Number.parseInt(initialVariables['--arrange-preview-primary-x'], 10)
    const movedViewportLeft = 140 + Number.parseInt(movedVariables['--arrange-preview-primary-x'], 10)
    const initialViewportTop = 40 + Number.parseInt(initialVariables['--arrange-preview-primary-y'], 10)
    const movedViewportTop = 52 + Number.parseInt(movedVariables['--arrange-preview-primary-y'], 10)

    expect(initialViewportLeft).toBe(100)
    expect(movedViewportLeft).toBe(100)
    expect(initialViewportTop).toBe(40)
    expect(movedViewportTop).toBe(40)
    expect(getArrangePreviewPrimaryCssProperties(follower, target(140, 52), true)).toMatchObject({
      '--arrange-preview-primary-x': '0px',
      '--arrange-preview-primary-y': '0px',
    })
  })

  it('repeats the subtle spread pattern for every ghost index', () => {
    const follower: ArrangePreviewFollower = {
      x: 0,
      y: 0,
      width: 120,
      height: 32,
      previousTargetLeft: 0,
      previousTargetTop: 0,
    }

    expect(getArrangePreviewGhostConfig(0)).toMatchObject({ settleOffsetX: -8, settleOffsetY: -3 })
    expect(getArrangePreviewGhostConfig(1)).toMatchObject({ settleOffsetX: 8, settleOffsetY: 3 })
    expect(getArrangePreviewGhostConfig(2)).toMatchObject({ settleOffsetX: -12, settleOffsetY: 5 })
    expect(getArrangePreviewGhostConfig(3)).toMatchObject({ settleOffsetX: 12, settleOffsetY: -5 })
    expect(getArrangePreviewGhostConfig(4)).toMatchObject({ settleOffsetX: -8, settleOffsetY: -3 })
    expect(getArrangePreviewGhostCssProperties(0, follower, target(0), true)).toMatchObject({
      '--arrange-preview-ghost-rotation': '-8deg',
    })
    expect(getArrangePreviewGhostCssProperties(1, follower, target(0), true)).toMatchObject({
      '--arrange-preview-ghost-rotation': '8deg',
    })
    expect(getArrangePreviewGhostCssProperties(2, follower, target(0), true)).toMatchObject({
      '--arrange-preview-ghost-rotation': '-12deg',
    })
    expect(getArrangePreviewGhostCssProperties(3, follower, target(0), true)).toMatchObject({
      '--arrange-preview-ghost-rotation': '12deg',
    })
    expect(getArrangePreviewGhostCssProperties(4, follower, target(0), true)).toMatchObject({
      '--arrange-preview-ghost-rotation': '-8deg',
    })
  })
})
