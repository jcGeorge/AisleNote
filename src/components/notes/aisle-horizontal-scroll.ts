export type HorizontalPaneScrollGeometry = {
  currentScrollLeft: number
  viewportWidth: number
  paneLeft: number
  paneRight: number
  scrollWidth?: number
  alignmentMargin?: number
  alignWhenVisible?: boolean
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

function getMaxScrollLeft(scrollWidth: number | undefined, viewportWidth: number) {
  return typeof scrollWidth === 'number' && Number.isFinite(scrollWidth)
    ? Math.max(0, scrollWidth - viewportWidth)
    : Number.POSITIVE_INFINITY
}

function parseCssLength(value: string) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

function getScrollNodeInlineStartAlignmentMargin(scrollNode: HTMLElement) {
  const view = scrollNode.ownerDocument?.defaultView
  if (!view?.getComputedStyle) return 0
  const style = view.getComputedStyle(scrollNode)
  const scrollPadding =
    parseCssLength(style.getPropertyValue('scroll-padding-inline-start')) ??
    parseCssLength(style.getPropertyValue('scroll-padding-left'))
  if (scrollPadding !== null) return Math.max(0, scrollPadding)

  return Math.max(
    0,
    parseCssLength(style.getPropertyValue('padding-inline-start')) ??
      parseCssLength(style.getPropertyValue('padding-left')) ??
      0,
  )
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
  scrollWidth,
  alignmentMargin = 0,
  alignWhenVisible = false,
}: HorizontalPaneScrollGeometry) {
  if (viewportWidth <= 0) return Math.max(0, currentScrollLeft)

  const safeCurrentScrollLeft = Math.max(0, currentScrollLeft)
  const maxScrollLeft = getMaxScrollLeft(scrollWidth, viewportWidth)
  const toScrollLeft = (value: number) => clamp(value, 0, maxScrollLeft)
  const safeAlignmentMargin = Math.max(0, alignmentMargin)
  const visibleLeft = safeCurrentScrollLeft
  const visibleRight = safeCurrentScrollLeft + viewportWidth
  const paddedPaneLeft = paneLeft - safeAlignmentMargin
  const paddedPaneRight = paneRight + safeAlignmentMargin

  const paneWidth = Math.max(0, paneRight - paneLeft)
  if (paneWidth + safeAlignmentMargin * 2 > viewportWidth) {
    if (paneLeft < visibleLeft || paneRight > visibleRight) return toScrollLeft(paneLeft - safeAlignmentMargin)
    return toScrollLeft(safeCurrentScrollLeft)
  }

  if (paddedPaneLeft < visibleLeft) return toScrollLeft(paddedPaneLeft)
  if (paddedPaneRight > visibleRight) return toScrollLeft(paddedPaneRight - viewportWidth)

  if (alignWhenVisible && safeAlignmentMargin > 0) {
    const paneCenter = paneLeft + paneWidth / 2
    const viewportCenter = visibleLeft + viewportWidth / 2
    return toScrollLeft(
      paneCenter <= viewportCenter
        ? paddedPaneLeft
        : paddedPaneRight - viewportWidth,
    )
  }

  return toScrollLeft(safeCurrentScrollLeft)
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

export function scrollAislePaneIntoHorizontalView(
  scrollNode: HTMLElement,
  aisleId: string,
  options: { alignmentMargin?: number; alignWhenVisible?: boolean } = {},
) {
  let pane: HTMLElement | null = null
  for (const candidate of scrollNode.querySelectorAll<HTMLElement>('[data-aisle-id]')) {
    if (candidate.dataset.aisleId !== aisleId) continue
    pane = candidate
    break
  }
  if (!pane) return false

  const scrollRect = scrollNode.getBoundingClientRect()
  const paneRect = pane.getBoundingClientRect()
  const paneWidth = paneRect.width || pane.offsetWidth
  if (paneWidth <= 0) {
    pane.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    return true
  }

  const paneLeft = scrollNode.scrollLeft + paneRect.left - scrollRect.left
  const alignmentMargin = options.alignmentMargin ?? getScrollNodeInlineStartAlignmentMargin(scrollNode)
  const nextScrollLeft = getScrollLeftToRevealHorizontalPane({
    currentScrollLeft: scrollNode.scrollLeft,
    viewportWidth: scrollNode.clientWidth,
    scrollWidth: scrollNode.scrollWidth,
    paneLeft,
    paneRight: paneLeft + paneWidth,
    alignmentMargin,
    alignWhenVisible: options.alignWhenVisible ?? alignmentMargin > 0,
  })

  if (Math.abs(nextScrollLeft - scrollNode.scrollLeft) > 0.5) {
    scrollNode.scrollLeft = nextScrollLeft
  }
  return true
}
