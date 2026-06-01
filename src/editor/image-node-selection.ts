import { Selection, TextSelection } from 'prosemirror-state'

export type ImageNodeHit = {
  node: any
  pos: number
}

export type ImageBlankClickPoint = {
  left: number
  top: number
}

function getClampedDocPosition(view: any, position: number): number {
  const docSize = view?.state?.doc?.content?.size
  const max = typeof docSize === 'number' ? docSize : position
  return Math.max(0, Math.min(max, position))
}

function isBlankSentinelText(text: string): boolean {
  return String(text ?? '').replace(/\u200b/g, '').trim().length === 0
}

function isImageElement(element: Element): element is HTMLImageElement {
  if (typeof element.matches === 'function') return element.matches('img')
  return String((element as { tagName?: string }).tagName ?? '').toLowerCase() === 'img'
}

function isImageOnlyParagraphForHit(view: any, hit: ImageNodeHit): boolean {
  try {
    const parent = view.state.doc.resolve(hit.pos).parent
    if (parent?.type?.name !== 'paragraph' || typeof parent.child !== 'function') return false
    const childCount = Number(parent.childCount ?? 0)
    if (childCount <= 0) return false

    let hasImage = false
    for (let index = 0; index < childCount; index += 1) {
      const child = parent.child(index)
      const typeName = child?.type?.name
      if (typeName === 'image') {
        hasImage = true
        continue
      }
      if ((child?.isText || typeName === 'text') && isBlankSentinelText(child.text ?? child.textContent ?? '')) {
        continue
      }
      return false
    }
    return hasImage
  } catch {
    return false
  }
}

function isImageRelatedBlankTarget(view: any, target: Element | null, image: HTMLImageElement): boolean {
  if (!target) return false
  if (target === view?.dom) return true
  const paragraph = typeof image.closest === 'function' ? image.closest('p') : null
  return Boolean(paragraph && (target === paragraph || paragraph.contains?.(target)))
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

export function findImageElementForSameLineBlankClick(
  view: any,
  target: Element | null,
  point: ImageBlankClickPoint,
  edgePadding = 2,
): HTMLImageElement | null {
  if (!view?.dom || typeof view.dom.querySelectorAll !== 'function') return null
  if (!Number.isFinite(point.left) || !Number.isFinite(point.top)) return null

  const candidates = (Array.from(view.dom.querySelectorAll('img')) as Element[])
    .filter(isImageElement)
    .map((image) => {
      if (!isImageRelatedBlankTarget(view, target, image)) return null
      if (typeof image.getBoundingClientRect !== 'function') return null
      const rect = image.getBoundingClientRect()
      if (point.top < rect.top || point.top > rect.bottom || point.left <= rect.right + edgePadding) return null
      const hit = findImageNodeHitForElement(view, image)
      if (!hit || !isImageOnlyParagraphForHit(view, hit)) return null
      return { image, distance: point.left - rect.right }
    })
    .filter((candidate): candidate is { image: HTMLImageElement; distance: number } => Boolean(candidate))
    .sort((left, right) => left.distance - right.distance)

  return candidates[0]?.image ?? null
}
