import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { ArrangePreviewGhostOrigin } from '../../types/app'
import {
  createArrangePreviewFollowers,
  getArrangePreviewGhostConfig,
  getArrangePreviewGhostCssProperties,
  updateArrangePreviewFollower,
  type ArrangePreviewFollower,
  type ArrangePreviewTargetRect,
} from './arrange-preview-follower'

type ArrangePreviewStackProps = {
  cardClassName: string
  dragCount?: number
  ghostOrigins?: ArrangePreviewGhostOrigin[]
  style: CSSProperties
  targetRect: ArrangePreviewTargetRect
  children: ReactNode
}

function getGhostOriginKey(ghostOrigins: ArrangePreviewGhostOrigin[] | undefined): string {
  return (ghostOrigins ?? []).map((origin) => `${Math.round(origin.x)}:${Math.round(origin.y)}`).join('|')
}

function getPrefersReducedMotion(): boolean {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function ArrangePreviewStack({
  cardClassName,
  dragCount = 1,
  ghostOrigins,
  style,
  targetRect,
  children,
}: ArrangePreviewStackProps) {
  const normalizedDragCount = Math.max(1, dragCount)
  const ghostCount = Math.min(2, normalizedDragCount - 1)
  const targetRectRef = useRef(targetRect)
  const followersRef = useRef<ArrangePreviewFollower[]>([])
  const ghostOriginKey = useMemo(() => getGhostOriginKey(ghostOrigins), [ghostOrigins])
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => getPrefersReducedMotion())
  const [ghostStyles, setGhostStyles] = useState<CSSProperties[]>(() => {
    const followers = createArrangePreviewFollowers(ghostCount, ghostOrigins, targetRect)
    followersRef.current = followers
    return followers.map((follower, index) => getArrangePreviewGhostCssProperties(index, follower, targetRect))
  })

  targetRectRef.current = targetRect

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateReducedMotion = () => setPrefersReducedMotion(mediaQuery.matches)

    updateReducedMotion()
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updateReducedMotion)
      return () => mediaQuery.removeEventListener('change', updateReducedMotion)
    }

    mediaQuery.addListener(updateReducedMotion)
    return () => mediaQuery.removeListener(updateReducedMotion)
  }, [])

  useEffect(() => {
    const followers = createArrangePreviewFollowers(ghostCount, ghostOrigins, targetRectRef.current)
    followersRef.current = followers
    setGhostStyles(
      followers.map((follower, index) =>
        getArrangePreviewGhostCssProperties(index, follower, targetRectRef.current, prefersReducedMotion),
      ),
    )
  }, [ghostCount, ghostOriginKey, prefersReducedMotion, targetRect.height, targetRect.width])

  useEffect(() => {
    if (ghostCount <= 0) return
    if (
      prefersReducedMotion ||
      typeof window === 'undefined' ||
      typeof window.requestAnimationFrame !== 'function' ||
      typeof window.cancelAnimationFrame !== 'function'
    ) {
      const centeredFollowers = createArrangePreviewFollowers(ghostCount, [], targetRectRef.current).map((follower) => ({
        ...follower,
        x: targetRectRef.current.left,
        y: targetRectRef.current.top,
      }))
      followersRef.current = centeredFollowers
      setGhostStyles(
        centeredFollowers.map((follower, index) =>
          getArrangePreviewGhostCssProperties(index, follower, targetRectRef.current, true),
        ),
      )
      return
    }

    let frameId = 0
    let lastFrameTime: number | null = null

    const step = (frameTime: number) => {
      const deltaMs = lastFrameTime === null ? 16 : frameTime - lastFrameTime
      lastFrameTime = frameTime
      const currentTarget = targetRectRef.current
      const nextFollowers = followersRef.current.map((follower, index) =>
        updateArrangePreviewFollower(follower, currentTarget, deltaMs, getArrangePreviewGhostConfig(index)),
      )
      followersRef.current = nextFollowers
      setGhostStyles(
        nextFollowers.map((follower, index) => getArrangePreviewGhostCssProperties(index, follower, currentTarget)),
      )
      frameId = window.requestAnimationFrame(step)
    }

    frameId = window.requestAnimationFrame(step)
    return () => window.cancelAnimationFrame(frameId)
  }, [ghostCount, ghostOriginKey, prefersReducedMotion])

  return (
    <div
      className={`arrange-preview-stack ${ghostCount > 0 ? 'is-stacked' : ''}`}
      data-drag-count={normalizedDragCount}
      style={style}
    >
      {Array.from({ length: ghostCount }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className={`${cardClassName} arrange-preview-card arrange-preview-ghost is-ghost-${index + 1}`}
          style={ghostStyles[index]}
        >
          {children}
        </div>
      ))}
      <div className={`${cardClassName} arrange-preview-card arrange-preview-primary`}>{children}</div>
    </div>
  )
}
