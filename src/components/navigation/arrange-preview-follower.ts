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
  settleOffsetX: number
  settleOffsetY: number
}

export const ARRANGE_PREVIEW_GHOST_CONFIGS: ArrangePreviewFollowerConfig[] = [
  { lagMs: 55, maxLag: 72, smoothingMs: 58, rotationDeg: -8, settleOffsetX: -8, settleOffsetY: -3 },
  { lagMs: 75, maxLag: 96, smoothingMs: 72, rotationDeg: 8, settleOffsetX: 8, settleOffsetY: 3 },
  { lagMs: 55, maxLag: 72, smoothingMs: 58, rotationDeg: -12, settleOffsetX: -12, settleOffsetY: 5 },
  { lagMs: 75, maxLag: 96, smoothingMs: 72, rotationDeg: 12, settleOffsetX: 12, settleOffsetY: -5 },
]

export const ARRANGE_PREVIEW_PRIMARY_CONFIG: ArrangePreviewFollowerConfig = {
  lagMs: 38,
  maxLag: 56,
  smoothingMs: 48,
  rotationDeg: 0,
  settleOffsetX: 0,
  settleOffsetY: 0,
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function getSafeDeltaMs(deltaMs: number): number {
  if (!Number.isFinite(deltaMs)) return 16
  return clamp(deltaMs, 1, 64)
}

export function getArrangePreviewGhostConfig(index: number): ArrangePreviewFollowerConfig {
  return ARRANGE_PREVIEW_GHOST_CONFIGS[index % ARRANGE_PREVIEW_GHOST_CONFIGS.length]
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

export function createArrangePreviewPrimaryFollower(targetRect: ArrangePreviewTargetRect): ArrangePreviewFollower {
  return {
    x: targetRect.left,
    y: targetRect.top,
    previousTargetLeft: targetRect.left,
    previousTargetTop: targetRect.top,
    width: targetRect.width,
    height: targetRect.height,
  }
}

export function createArrangePreviewFollowers(
  ghostItems: ArrangePreviewGhostItem[] | undefined,
  targetRect: ArrangePreviewTargetRect,
): ArrangePreviewFollower[] {
  return (ghostItems ?? []).map((ghostItem) => createArrangePreviewFollower(targetRect, ghostItem))
}

function getSettledGhostTarget(
  follower: ArrangePreviewFollower,
  targetRect: ArrangePreviewTargetRect,
  config: ArrangePreviewFollowerConfig,
) {
  return {
    left: targetRect.left + (targetRect.width - follower.width) / 2 + config.settleOffsetX,
    top: targetRect.top + (targetRect.height - follower.height) / 2 + config.settleOffsetY,
  }
}

export function getArrangePreviewLaggedTarget(
  follower: ArrangePreviewFollower,
  targetRect: ArrangePreviewTargetRect,
  deltaMs: number,
  config: ArrangePreviewFollowerConfig,
): { x: number; y: number } {
  const safeDeltaMs = getSafeDeltaMs(deltaMs)
  const settledTarget = getSettledGhostTarget(follower, targetRect, config)
  const previousSettledTarget = {
    left: follower.previousTargetLeft + (targetRect.width - follower.width) / 2 + config.settleOffsetX,
    top: follower.previousTargetTop + (targetRect.height - follower.height) / 2 + config.settleOffsetY,
  }
  const velocityX = (settledTarget.left - previousSettledTarget.left) / safeDeltaMs
  const velocityY = (settledTarget.top - previousSettledTarget.top) / safeDeltaMs
  const rawLagX = -velocityX * config.lagMs
  const rawLagY = -velocityY * config.lagMs
  const rawLagDistance = Math.hypot(rawLagX, rawLagY)
  const lagScale = rawLagDistance > config.maxLag ? config.maxLag / rawLagDistance : 1

  return {
    x: settledTarget.left + rawLagX * lagScale,
    y: settledTarget.top + rawLagY * lagScale,
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
  const settledTarget = getSettledGhostTarget(follower, targetRect, config)

  return {
    x: targetIsStill && Math.abs(nextX - settledTarget.left) < 0.25 ? settledTarget.left : nextX,
    y: targetIsStill && Math.abs(nextY - settledTarget.top) < 0.25 ? settledTarget.top : nextY,
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
  const settledTarget = getSettledGhostTarget(follower, targetRect, config)
  const x = reducedMotion ? settledTarget.left - targetRect.left : follower.x - targetRect.left
  const y = reducedMotion ? settledTarget.top - targetRect.top : follower.y - targetRect.top
  return {
    '--arrange-preview-ghost-x': `${Math.round(x)}px`,
    '--arrange-preview-ghost-y': `${Math.round(y)}px`,
    '--arrange-preview-ghost-rotation': `${config.rotationDeg}deg`,
  } as CSSProperties
}

export function getArrangePreviewPrimaryCssProperties(
  follower: ArrangePreviewFollower,
  targetRect: ArrangePreviewTargetRect,
  reducedMotion = false,
): CSSProperties {
  const x = reducedMotion ? 0 : follower.x - targetRect.left
  const y = reducedMotion ? 0 : follower.y - targetRect.top
  return {
    '--arrange-preview-primary-x': `${Math.round(x)}px`,
    '--arrange-preview-primary-y': `${Math.round(y)}px`,
  } as CSSProperties
}
