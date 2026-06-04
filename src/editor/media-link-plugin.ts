import { createMediaPlayerElement } from '../media/media-player-dom'
import { stripMediaMetadataFromUrl } from '../media/media-metadata'
import { getMediaKindFromUrl, type MediaKind } from '../media/media-utils'
import { getLinkMarkAttrs } from './prosemirror-utils'

export type MediaLinkRange = {
  from: number
  to: number
  href: string
  label: string
  kind: MediaKind
}

export type MediaLinkDeleteDirection = 'backward' | 'forward'

function getMediaRangeIdentity(range: Pick<MediaLinkRange, 'href' | 'kind' | 'label'>): string {
  return `${range.kind}:${stripMediaMetadataFromUrl(range.href)}:${range.label}`
}

function getElementDatasetNumber(element: Element | null | undefined, name: string): number | null {
  const rawValue = element?.getAttribute(name)
  if (rawValue === null || rawValue === undefined || rawValue.trim() === '') return null
  const value = Number(rawValue)
  return Number.isFinite(value) ? Math.floor(value) : null
}

export function getMediaPlayerDocumentPosition(view: any | null, mediaPlayer: Element | null): number | null {
  if (!view || !mediaPlayer || typeof view.posAtDOM !== 'function') return null
  try {
    const position = view.posAtDOM(mediaPlayer, 0, -1)
    return Number.isFinite(position) ? Math.floor(position) : null
  } catch {
    return null
  }
}

export function getMediaLinkRangeAtPosition(doc: any, position: unknown): MediaLinkRange | null {
  if (typeof position !== 'number' || !Number.isFinite(position)) return null
  const cursor = Math.floor(position)
  return collectMediaLinkRanges(doc).find((range) => range.from === cursor) ?? null
}

export function getMediaLinkRangeForPlayer(
  view: any | null,
  mediaPlayer: Element | null,
  sourceUrl?: string,
): MediaLinkRange | null {
  const ranges = collectMediaLinkRanges(view?.state?.doc)
  if (ranges.length === 0) return null

  const widgetPosition = getMediaPlayerDocumentPosition(view, mediaPlayer)
  if (widgetPosition !== null) {
    const currentRange = ranges.find((range) => range.from === widgetPosition)
    if (currentRange) return currentRange
  }

  const sourceFrom = getElementDatasetNumber(mediaPlayer, 'data-media-source-from')
  const sourceTo = getElementDatasetNumber(mediaPlayer, 'data-media-source-to')
  if (sourceFrom !== null && sourceTo !== null) {
    const exactRange = ranges.find((range) => range.from === sourceFrom && range.to === sourceTo)
    if (exactRange) return exactRange
  }

  const source = sourceUrl ?? mediaPlayer?.getAttribute('data-media-source') ?? ''
  if (!source) return null
  const exactSource = ranges.find((range) => range.href === source)
  if (exactSource) return exactSource

  const strippedSource = stripMediaMetadataFromUrl(source)
  return ranges.find((range) => stripMediaMetadataFromUrl(range.href) === strippedSource) ?? null
}

function getTextNodeLinkMark(node: any): { href: string; title?: string } | null {
  const marks = Array.isArray(node?.marks) ? node.marks : []
  const linkMark = marks.find(
    (mark: any) =>
      mark?.type?.name === 'link' &&
      (typeof mark?.attrs?.linkUrl === 'string' || typeof mark?.attrs?.href === 'string'),
  )
  if (!linkMark) return null
  const href = String(linkMark.attrs.linkUrl ?? linkMark.attrs.href ?? '').trim()
  if (!href) return null
  return {
    href,
    ...(typeof linkMark.attrs.title === 'string' && linkMark.attrs.title ? { title: linkMark.attrs.title } : {}),
  }
}

export function collectMediaLinkRanges(doc: any): MediaLinkRange[] {
  const ranges: MediaLinkRange[] = []
  if (!doc || typeof doc.descendants !== 'function') return ranges

  doc.descendants((node: any, position: number) => {
    if (!node?.isText || typeof node.text !== 'string') return true
    const linkMark = getTextNodeLinkMark(node)
    if (!linkMark) return true
    const kind = getMediaKindFromUrl(linkMark.href)
    if (!kind) return true

    const from = position
    const to = position + node.text.length
    const previous = ranges[ranges.length - 1]
    if (previous && previous.href === linkMark.href && previous.kind === kind && previous.to === from) {
      previous.to = to
      previous.label += node.text
    } else {
      ranges.push({
        from,
        to,
        href: linkMark.href,
        label: node.text,
        kind,
      })
    }
    return true
  })

  return ranges
}

function getLinkMarkAttrsForMediaRange(view: any, range: MediaLinkRange, nextHref: string): Record<string, unknown> {
  const linkMarkType = view?.state?.schema?.marks?.link
  let attrs: Record<string, unknown> = linkMarkType ? getLinkMarkAttrs(linkMarkType, nextHref) : { linkUrl: nextHref }
  if (!linkMarkType || typeof view?.state?.doc?.nodesBetween !== 'function') return attrs

  view.state.doc.nodesBetween(range.from, range.to, (node: any) => {
    if (!node?.isText || !Array.isArray(node.marks)) return true
    const linkMark = node.marks.find((mark: any) => mark?.type === linkMarkType)
    if (linkMark?.attrs) {
      attrs = {
        ...linkMark.attrs,
        ...getLinkMarkAttrs(linkMarkType, nextHref),
      }
      return false
    }
    return true
  })
  return attrs
}

export function updateMediaLinkRangeUrl(view: any, range: MediaLinkRange, nextHref: string): boolean {
  const linkMarkType = view?.state?.schema?.marks?.link
  if (!view?.state?.tr || !view?.dispatch || !linkMarkType) return false
  try {
    const transaction = view.state.tr
      .removeMark(range.from, range.to, linkMarkType)
      .addMark(range.from, range.to, linkMarkType.create(getLinkMarkAttrsForMediaRange(view, range, nextHref)))
    view.dispatch(transaction)
    return true
  } catch {
    return false
  }
}

export function getAdjacentMediaLinkRange(
  doc: any,
  position: number,
  direction: MediaLinkDeleteDirection,
): MediaLinkRange | null {
  if (!Number.isFinite(position)) return null
  const cursor = Math.floor(position)
  return (
    collectMediaLinkRanges(doc).find((range) =>
      direction === 'forward'
        ? cursor >= range.from && cursor < range.to
        : cursor > range.from && cursor <= range.to,
    ) ?? null
  )
}

export function deleteAdjacentMediaLinkRange(view: any | null, direction: MediaLinkDeleteDirection): boolean {
  const selection = view?.state?.selection
  if (!view?.state?.doc || !view?.state?.tr || typeof view.dispatch !== 'function' || !selection?.empty) return false
  const range = getAdjacentMediaLinkRange(view.state.doc, selection.from, direction)
  if (!range) return false
  try {
    const transaction = view.state.tr.delete(range.from, range.to).scrollIntoView()
    view.dispatch(transaction)
    view.focus?.()
    return true
  } catch {
    return false
  }
}

export function createMediaLinkPlugin(context: any) {
  const { Plugin } = context.pmState
  const { Decoration, DecorationSet } = context.pmView

  return {
    wysiwygPlugins: [
      () =>
        new Plugin({
          props: {
            decorations: (editorState: any) => {
              const decorations: unknown[] = []
              const mediaRangeIdentityCounts = new Map<string, number>()
              for (const range of collectMediaLinkRanges(editorState.doc)) {
                const rangeIdentity = getMediaRangeIdentity(range)
                const occurrence = mediaRangeIdentityCounts.get(rangeIdentity) ?? 0
                mediaRangeIdentityCounts.set(rangeIdentity, occurrence + 1)
                decorations.push(
                  Decoration.widget(
                    range.from,
                    (view: any, getPos?: () => number | undefined) => {
                      let playerElement: HTMLElement | null = null
                      playerElement = createMediaPlayerElement({
                        kind: range.kind,
                        src: range.href,
                        label: range.label,
                        sourceFrom: range.from,
                        sourceTo: range.to,
                        onSourceChange: (nextSrc) => {
                          const currentRange =
                            getMediaLinkRangeAtPosition(view?.state?.doc, getPos?.()) ??
                            getMediaLinkRangeForPlayer(view, playerElement, range.href) ??
                            range
                          updateMediaLinkRangeUrl(view, currentRange, nextSrc)
                        },
                      })
                      return playerElement
                    },
                    {
                      key: `media-link-${rangeIdentity}-${occurrence}`,
                      side: -1,
                    },
                  ),
                )
                decorations.push(Decoration.inline(range.from, range.to, { class: 'tabs-media-link-source-hidden' }))
              }
              return DecorationSet.create(editorState.doc, decorations)
            },
          },
        }),
    ],
  }
}
