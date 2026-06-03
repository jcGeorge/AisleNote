import type { CSSProperties } from 'react'
import type { ArrangePreviewGhostOrigin } from '../../types/app'

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

export const FALLBACK_ARRANGE_PREVIEW_GHOST_ORIGINS: ArrangePreviewGhostOrigin[] = [
  { x: -34, y: -18 },
  { x: -58, y: 18 },
]

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function getSafeDeltaMs(deltaMs: number): number {
  if (!Number.isFinite(deltaMs)) return 16
  return clamp(deltaMs, 1, 64)
}

export function getArrangePreviewGhostConfig(index: number): ArrangePreviewFollowerConfig {
  return ARRANGE_PREVIEW_GHOST_CONFIGS[index] ?? ARRANGE_PREVIEW_GHOST_CONFIGS[0]
}

export function getArrangePreviewGhostOrigin(
  index: number,
  ghostOrigins: ArrangePreviewGhostOrigin[] | undefined,
): ArrangePreviewGhostOrigin {
  return ghostOrigins?.[index] ?? FALLBACK_ARRANGE_PREVIEW_GHOST_ORIGINS[index] ?? FALLBACK_ARRANGE_PREVIEW_GHOST_ORIGINS[0]
}

export function createArrangePreviewFollower(
  targetRect: ArrangePreviewTargetRect,
  origin: ArrangePreviewGhostOrigin,
): ArrangePreviewFollower {
  return {
    x: targetRect.left + origin.x,
    y: targetRect.top + origin.y,
    previousTargetLeft: targetRect.left,
    previousTargetTop: targetRect.top,
  }
}

export function createArrangePreviewFollowers(
  ghostCount: number,
  ghostOrigins: ArrangePreviewGhostOrigin[] | undefined,
  targetRect: ArrangePreviewTargetRect,
): ArrangePreviewFollower[] {
  return Array.from({ length: ghostCount }, (_, index) =>
    createArrangePreviewFollower(targetRect, getArrangePreviewGhostOrigin(index, ghostOrigins)),
  )
}

export function getArrangePreviewLaggedTarget(
  follower: ArrangePreviewFollower,
  targetRect: ArrangePreviewTargetRect,
  deltaMs: number,
  config: ArrangePreviewFollowerConfig,
): { x: number; y: number } {
  const safeDeltaMs = getSafeDeltaMs(deltaMs)
  const velocityX = (targetRect.left - follower.previousTargetLeft) / safeDeltaMs
  const velocityY = (targetRect.top - follower.previousTargetTop) / safeDeltaMs
  const rawLagX = -velocityX * config.lagMs
  const rawLagY = -velocityY * config.lagMs
  const rawLagDistance = Math.hypot(rawLagX, rawLagY)
  const lagScale = rawLagDistance > config.maxLag ? config.maxLag / rawLagDistance : 1

  return {
    x: targetRect.left + rawLagX * lagScale,
    y: targetRect.top + rawLagY * lagScale,
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

  return {
    x: targetIsStill && Math.abs(nextX - targetRect.left) < 0.25 ? targetRect.left : nextX,
    y: targetIsStill && Math.abs(nextY - targetRect.top) < 0.25 ? targetRect.top : nextY,
    previousTargetLeft: targetRect.left,
    previousTargetTop: targetRect.top,
  }
}

export function getArrangePreviewGhostCssProperties(
  index: number,
  follower: ArrangePreviewFollower,
  targetRect: ArrangePreviewTargetRect,
  reducedMotion = false,
): CSSProperties {
  const config = getArrangePreviewGhostConfig(index)
  return {
    '--arrange-preview-ghost-x': `${Math.round(reducedMotion ? 0 : follower.x - targetRect.left)}px`,
    '--arrange-preview-ghost-y': `${Math.round(reducedMotion ? 0 : follower.y - targetRect.top)}px`,
    '--arrange-preview-ghost-rotation': `${config.rotationDeg}deg`,
  } as CSSProperties
}
