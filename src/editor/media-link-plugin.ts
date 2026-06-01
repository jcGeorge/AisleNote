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
              for (const range of collectMediaLinkRanges(editorState.doc)) {
                decorations.push(
                  Decoration.widget(
                    range.from,
                    (view: any) =>
                      createMediaPlayerElement({
                        kind: range.kind,
                        src: range.href,
                        label: range.label,
                        sourceFrom: range.from,
                        sourceTo: range.to,
                        onSourceChange: (nextSrc) => updateMediaLinkRangeUrl(view, range, nextSrc),
                      }),
                    {
                      key: `media-link-${range.from}-${range.to}-${stripMediaMetadataFromUrl(range.href)}`,
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
