export type VaultTreeRevealViewport = {
  scrollTop: number
  clientHeight: number
  scrollHeight: number
  bottomInset?: number
}

export type VaultTreeRevealRow = {
  top: number
  bottom: number
}

function clampScrollTop(scrollTop: number, maxScrollTop: number): number {
  if (!Number.isFinite(scrollTop)) return 0
  return Math.min(Math.max(scrollTop, 0), Math.max(0, maxScrollTop))
}

export function getVaultTreeRevealScrollTop(
  viewport: VaultTreeRevealViewport,
  row: VaultTreeRevealRow,
): number {
  const viewportHeight = Math.max(0, viewport.clientHeight)
  const bottomInset = Math.max(0, viewport.bottomInset ?? 0)
  const visibleViewportHeight = Math.max(0, viewportHeight - bottomInset)
  const maxScrollTop = Math.max(0, viewport.scrollHeight - viewportHeight)
  const currentScrollTop = clampScrollTop(viewport.scrollTop, maxScrollTop)
  const viewportBottom = currentScrollTop + visibleViewportHeight

  if (row.top >= currentScrollTop && row.bottom <= viewportBottom) return currentScrollTop
  if (row.top < currentScrollTop) return clampScrollTop(row.top, maxScrollTop)
  return clampScrollTop(row.bottom - visibleViewportHeight, maxScrollTop)
}
