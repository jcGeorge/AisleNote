export type HorizontalPaneScrollGeometry = {
  currentScrollLeft: number
  viewportWidth: number
  paneLeft: number
  paneRight: number
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
