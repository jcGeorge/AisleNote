export type HorizontalPaneScrollGeometry = {
  currentScrollLeft: number
  viewportWidth: number
  paneLeft: number
  paneRight: number
}

const DEFAULT_SCROLLBAR_MIN_THUMB_WIDTH = 48

export type AisleHorizontalScrollbarGeometryInput = {
  scrollLeft: number
  scrollWidth: number
  clientWidth: number
  trackWidth: number
  minThumbWidth?: number
}

export type AisleHorizontalScrollbarGeometry = {
  visible: boolean
  thumbLeft: number
  thumbWidth: number
  maxScrollLeft: number
  maxThumbLeft: number
  trackWidth: number
}

export type AisleHorizontalScrollbarThumbScrollInput = {
  thumbLeft: number
  maxThumbLeft: number
  maxScrollLeft: number
}

export type AisleHorizontalScrollbarPointerScrollInput = {
  pointerX: number
  trackLeft: number
  trackWidth: number
  thumbWidth: number
  scrollWidth: number
  clientWidth: number
}

export type HorizontalDragAutoScrollInput = {
  pointerX: number
  containerLeft: number
  containerRight: number
  currentScrollLeft: number
  maxScrollLeft: number
  edgeZoneWidth: number
  maxStep: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function getHorizontalDragAutoScrollDelta({
  pointerX,
  containerLeft,
  containerRight,
  currentScrollLeft,
  maxScrollLeft,
  edgeZoneWidth,
  maxStep,
}: HorizontalDragAutoScrollInput) {
  const safeMaxScrollLeft = Math.max(0, maxScrollLeft)
  const safeScrollLeft = clamp(currentScrollLeft, 0, safeMaxScrollLeft)
  const safeEdgeZoneWidth = Math.max(0, edgeZoneWidth)
  const safeMaxStep = Math.max(0, maxStep)
  const containerWidth = Math.max(0, containerRight - containerLeft)
  const effectiveEdgeZoneWidth = Math.min(safeEdgeZoneWidth, containerWidth / 2)

  if (safeMaxScrollLeft <= 0 || safeMaxStep <= 0 || effectiveEdgeZoneWidth <= 0) return 0

  const leftEdgeEnd = containerLeft + effectiveEdgeZoneWidth
  if (pointerX < leftEdgeEnd && safeScrollLeft > 0) {
    const intensity = clamp((leftEdgeEnd - pointerX) / effectiveEdgeZoneWidth, 0, 1)
    return Math.max(-safeScrollLeft, -safeMaxStep * intensity)
  }

  const rightEdgeStart = containerRight - effectiveEdgeZoneWidth
  if (pointerX > rightEdgeStart && safeScrollLeft < safeMaxScrollLeft) {
    const intensity = clamp((pointerX - rightEdgeStart) / effectiveEdgeZoneWidth, 0, 1)
    return Math.min(safeMaxScrollLeft - safeScrollLeft, safeMaxStep * intensity)
  }

  return 0
}

export function getScrollLeftToRevealHorizontalPane({
  currentScrollLeft,
  viewportWidth,
  paneLeft,
  paneRight,
}: HorizontalPaneScrollGeometry) {
  if (viewportWidth <= 0) return Math.max(0, currentScrollLeft)

  const visibleLeft = currentScrollLeft
  const visibleRight = currentScrollLeft + viewportWidth
  if (paneLeft >= visibleLeft && paneRight <= visibleRight) return Math.max(0, currentScrollLeft)
  if (paneLeft < visibleLeft) return Math.max(0, paneLeft)

  const paneWidth = Math.max(0, paneRight - paneLeft)
  const nextScrollLeft = paneWidth > viewportWidth ? paneLeft : paneRight - viewportWidth
  return Math.max(0, nextScrollLeft)
}

export function getAisleHorizontalScrollbarGeometry({
  scrollLeft,
  scrollWidth,
  clientWidth,
  trackWidth,
  minThumbWidth = DEFAULT_SCROLLBAR_MIN_THUMB_WIDTH,
}: AisleHorizontalScrollbarGeometryInput): AisleHorizontalScrollbarGeometry {
  const safeScrollWidth = Math.max(0, scrollWidth)
  const safeClientWidth = Math.max(0, clientWidth)
  const safeTrackWidth = Math.max(0, trackWidth)
  const maxScrollLeft = Math.max(0, safeScrollWidth - safeClientWidth)

  if (safeClientWidth <= 0 || safeTrackWidth <= 0 || maxScrollLeft <= 0) {
    return {
      visible: false,
      thumbLeft: 0,
      thumbWidth: 0,
      maxScrollLeft,
      maxThumbLeft: 0,
      trackWidth: safeTrackWidth,
    }
  }

  const proportionalThumbWidth = safeTrackWidth * (safeClientWidth / safeScrollWidth)
  const thumbWidth = Math.min(safeTrackWidth, Math.max(Math.max(0, minThumbWidth), proportionalThumbWidth))
  const maxThumbLeft = Math.max(0, safeTrackWidth - thumbWidth)
  const clampedScrollLeft = clamp(scrollLeft, 0, maxScrollLeft)
  const thumbLeft = maxScrollLeft > 0 ? (clampedScrollLeft / maxScrollLeft) * maxThumbLeft : 0

  return {
    visible: true,
    thumbLeft,
    thumbWidth,
    maxScrollLeft,
    maxThumbLeft,
    trackWidth: safeTrackWidth,
  }
}

export function getScrollLeftForAisleHorizontalScrollbarThumb({
  thumbLeft,
  maxThumbLeft,
  maxScrollLeft,
}: AisleHorizontalScrollbarThumbScrollInput) {
  if (maxThumbLeft <= 0 || maxScrollLeft <= 0) return 0
  return (clamp(thumbLeft, 0, maxThumbLeft) / maxThumbLeft) * maxScrollLeft
}

export function getScrollLeftForAisleHorizontalScrollbarPointer({
  pointerX,
  trackLeft,
  trackWidth,
  thumbWidth,
  scrollWidth,
  clientWidth,
}: AisleHorizontalScrollbarPointerScrollInput) {
  const maxScrollLeft = Math.max(0, scrollWidth - clientWidth)
  const maxThumbLeft = Math.max(0, trackWidth - thumbWidth)
  const centeredThumbLeft = pointerX - trackLeft - thumbWidth / 2
  return getScrollLeftForAisleHorizontalScrollbarThumb({
    thumbLeft: centeredThumbLeft,
    maxThumbLeft,
    maxScrollLeft,
  })
}

export function scrollAislePaneIntoHorizontalView(scrollNode: HTMLElement, aisleId: string) {
  const pane = Array.from(scrollNode.querySelectorAll<HTMLElement>('[data-aisle-id]')).find(
    (candidate) => candidate.dataset.aisleId === aisleId,
  )
  if (!pane) return false

  const scrollRect = scrollNode.getBoundingClientRect()
  const paneRect = pane.getBoundingClientRect()
  const paneWidth = paneRect.width || pane.offsetWidth
  if (paneWidth <= 0) {
    pane.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    return true
  }

  const paneLeft = scrollNode.scrollLeft + paneRect.left - scrollRect.left
  const nextScrollLeft = getScrollLeftToRevealHorizontalPane({
    currentScrollLeft: scrollNode.scrollLeft,
    viewportWidth: scrollNode.clientWidth,
    paneLeft,
    paneRight: paneLeft + paneWidth,
  })

  if (Math.abs(nextScrollLeft - scrollNode.scrollLeft) > 0.5) {
    scrollNode.scrollLeft = nextScrollLeft
  }
  return true
}
