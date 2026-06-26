export type NotebookTreeRevealViewport = {
  scrollTop: number
  clientHeight: number
  scrollHeight: number
}

export type NotebookTreeRevealRow = {
  top: number
  bottom: number
}

function clampScrollTop(scrollTop: number, maxScrollTop: number): number {
  if (!Number.isFinite(scrollTop)) return 0
  return Math.min(Math.max(scrollTop, 0), Math.max(0, maxScrollTop))
}

export function getNotebookTreeRevealScrollTop(
  viewport: NotebookTreeRevealViewport,
  row: NotebookTreeRevealRow,
): number {
  const currentScrollTop = clampScrollTop(viewport.scrollTop, viewport.scrollHeight - viewport.clientHeight)
  const viewportHeight = Math.max(0, viewport.clientHeight)
  const viewportBottom = currentScrollTop + viewportHeight
  const maxScrollTop = Math.max(0, viewport.scrollHeight - viewportHeight)

  if (row.top >= currentScrollTop && row.bottom <= viewportBottom) return currentScrollTop
  if (row.top < currentScrollTop) return clampScrollTop(row.top, maxScrollTop)
  return clampScrollTop(row.bottom - viewportHeight, maxScrollTop)
}
