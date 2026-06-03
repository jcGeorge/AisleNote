import type { CSSProperties } from 'react'
import type { ArrangePreviewGhostItem } from '../../types/app'

export type ArrangePreviewTargetRect = {
  left: number
  top: number
  width: number
  height: number
}

export type ArrangePreviewFollower = {
  x: number
  y: number
  previousTargetLeft: number
  previousTargetTop: number
  width: number
  height: number
}

export type ArrangePreviewFollowerConfig = {
  lagMs: number
  maxLag: number
  smoothingMs: number
  rotationDeg: number
}

export const ARRANGE_PREVIEW_GHOST_CONFIGS: ArrangePreviewFollowerConfig[] = [
  { lagMs: 55, maxLag: 72, smoothingMs: 58, rotationDeg: -30 },
  { lagMs: 75, maxLag: 96, smoothingMs: 72, rotationDeg: 30 },
]

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function getSafeDeltaMs(deltaMs: number): number {
  if (!Number.isFinite(deltaMs)) return 16
  return clamp(deltaMs, 1, 64)
}

export function getArrangePreviewGhostConfig(index: number): ArrangePreviewFollowerConfig {
  return {
    ...ARRANGE_PREVIEW_GHOST_CONFIGS[index % ARRANGE_PREVIEW_GHOST_CONFIGS.length],
    rotationDeg: index % 2 === 0 ? -30 : 30,
  }
}

export function createArrangePreviewFollower(
  targetRect: ArrangePreviewTargetRect,
  ghostItem: ArrangePreviewGhostItem,
): ArrangePreviewFollower {
  return {
    x: targetRect.left + ghostItem.x,
    y: targetRect.top + ghostItem.y,
    previousTargetLeft: targetRect.left,
    previousTargetTop: targetRect.top,
    width: ghostItem.width,
    height: ghostItem.height,
  }
}

export function createArrangePreviewFollowers(
  ghostItems: ArrangePreviewGhostItem[] | undefined,
  targetRect: ArrangePreviewTargetRect,
): ArrangePreviewFollower[] {
  return (ghostItems ?? []).map((ghostItem) => createArrangePreviewFollower(targetRect, ghostItem))
}

function getCenteredGhostTarget(follower: ArrangePreviewFollower, targetRect: ArrangePreviewTargetRect) {
  return {
    left: targetRect.left + (targetRect.width - follower.width) / 2,
    top: targetRect.top + (targetRect.height - follower.height) / 2,
  }
}

export function getArrangePreviewLaggedTarget(
  follower: ArrangePreviewFollower,
  targetRect: ArrangePreviewTargetRect,
  deltaMs: number,
  config: ArrangePreviewFollowerConfig,
): { x: number; y: number } {
  const safeDeltaMs = getSafeDeltaMs(deltaMs)
  const centeredTarget = getCenteredGhostTarget(follower, targetRect)
  const previousCenteredTarget = {
    left: follower.previousTargetLeft + (targetRect.width - follower.width) / 2,
    top: follower.previousTargetTop + (targetRect.height - follower.height) / 2,
  }
  const velocityX = (centeredTarget.left - previousCenteredTarget.left) / safeDeltaMs
  const velocityY = (centeredTarget.top - previousCenteredTarget.top) / safeDeltaMs
  const rawLagX = -velocityX * config.lagMs
  const rawLagY = -velocityY * config.lagMs
  const rawLagDistance = Math.hypot(rawLagX, rawLagY)
  const lagScale = rawLagDistance > config.maxLag ? config.maxLag / rawLagDistance : 1

  return {
    x: centeredTarget.left + rawLagX * lagScale,
    y: centeredTarget.top + rawLagY * lagScale,
  }
}

export function updateArrangePreviewFollower(
  follower: ArrangePreviewFollower,
  targetRect: ArrangePreviewTargetRect,
  deltaMs: number,
  config: ArrangePreviewFollowerConfig,
): ArrangePreviewFollower {
  const safeDeltaMs = getSafeDeltaMs(deltaMs)
  const laggedTarget = getArrangePreviewLaggedTarget(follower, targetRect, safeDeltaMs, config)
  const alpha = 1 - Math.exp(-safeDeltaMs / config.smoothingMs)
  const nextX = follower.x + (laggedTarget.x - follower.x) * alpha
  const nextY = follower.y + (laggedTarget.y - follower.y) * alpha
  const targetIsStill =
    Math.abs(targetRect.left - follower.previousTargetLeft) < 0.01 &&
    Math.abs(targetRect.top - follower.previousTargetTop) < 0.01
  const centeredTarget = getCenteredGhostTarget(follower, targetRect)

  return {
    x: targetIsStill && Math.abs(nextX - centeredTarget.left) < 0.25 ? centeredTarget.left : nextX,
    y: targetIsStill && Math.abs(nextY - centeredTarget.top) < 0.25 ? centeredTarget.top : nextY,
    previousTargetLeft: targetRect.left,
    previousTargetTop: targetRect.top,
    width: follower.width,
    height: follower.height,
  }
}

export function getArrangePreviewGhostCssProperties(
  index: number,
  follower: ArrangePreviewFollower,
  targetRect: ArrangePreviewTargetRect,
  reducedMotion = false,
): CSSProperties {
  const config = getArrangePreviewGhostConfig(index)
  const centeredTarget = getCenteredGhostTarget(follower, targetRect)
  const x = reducedMotion ? centeredTarget.left - targetRect.left : follower.x - targetRect.left
  const y = reducedMotion ? centeredTarget.top - targetRect.top : follower.y - targetRect.top
  return {
    '--arrange-preview-ghost-x': `${Math.round(x)}px`,
    '--arrange-preview-ghost-y': `${Math.round(y)}px`,
    '--arrange-preview-ghost-rotation': `${config.rotationDeg}deg`,
  } as CSSProperties
}
