import { Selection, TextSelection } from 'prosemirror-state'

export type ImageNodeHit = {
  node: any
  pos: number
}

function getClampedDocPosition(view: any, position: number): number {
  const docSize = view?.state?.doc?.content?.size
  const max = typeof docSize === 'number' ? docSize : position
  return Math.max(0, Math.min(max, position))
}

export function findImageNodeHitForElement(view: any, image: HTMLImageElement): ImageNodeHit | null {
  if (!view?.dom?.contains?.(image) || !view?.state?.doc) return null

  const inspectPos = (rawPos: number) => {
    const pos = getClampedDocPosition(view, rawPos)
    const nodeAt = view.state.doc.nodeAt(pos)
    if (nodeAt?.type?.name === 'image') return { node: nodeAt, pos }

    const resolved = view.state.doc.resolve(pos)
    if (resolved.nodeAfter?.type?.name === 'image') return { node: resolved.nodeAfter, pos }
    if (resolved.nodeBefore?.type?.name === 'image') {
      return { node: resolved.nodeBefore, pos: Math.max(0, pos - resolved.nodeBefore.nodeSize) }
    }
    return null
  }

  try {
    const domPos = view.posAtDOM(image, 0)
    for (const candidatePos of [domPos, domPos - 1, domPos + 1]) {
      const hit = inspectPos(candidatePos)
      if (hit) return hit
    }
  } catch {
    // Fall back to matching the rendered image source and alt text below.
  }

  const imageUrl = image.getAttribute('src') ?? ''
  const altText = image.getAttribute('alt') ?? ''
  let fallback: ImageNodeHit | null = null
  view.state.doc.descendants((node: any, pos: number) => {
    if (fallback || node?.type?.name !== 'image') return
    const attrs = node.attrs ?? {}
    if ((attrs.imageUrl ?? '') === imageUrl && (attrs.altText ?? '') === altText) {
      fallback = { node, pos }
    }
  })
  return fallback
}

export function placeCaretAfterImageElement(
  view: any,
  image: HTMLImageElement,
  options: { focus?: boolean } = {},
): ImageNodeHit | null {
  const hit = findImageNodeHitForElement(view, image)
  if (!hit || typeof view?.dispatch !== 'function') return null

  const position = hit.pos + (hit.node?.nodeSize ?? 1)
  const doc = view.state.doc
  try {
    view.dispatch(
      view.state.tr
        .setSelection(TextSelection.create(doc, position, position))
        .setMeta('addToHistory', false),
    )
  } catch {
    try {
      view.dispatch(
        view.state.tr
          .setSelection(Selection.near(doc.resolve(getClampedDocPosition(view, position)), 1))
          .setMeta('addToHistory', false),
      )
    } catch {
      return null
    }
  }

  if (options.focus !== false) {
    view.focus?.()
  }
  return hit
}
