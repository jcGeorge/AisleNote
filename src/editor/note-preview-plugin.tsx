import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { AppState, NoteLocation } from '../types/app'
import {
  NOTE_PREVIEW_REFERENCE_RE,
  parsePreviewToken,
  type NotePreviewReferencePayload,
} from '../notes/note-references'
import { NotePreviewContent } from '../components/notes/NotePreviewContent'
import { measureSlowOperation } from '../performance/performance-logging'

void React

export type NotePreviewRange = {
  from: number
  to: number
  widgetFrom: number
  hideFrom: number
  hideTo: number
  hideAsBlock: boolean
  token: string
  payload: NotePreviewReferencePayload
}

const notePreviewRangeCache = new WeakMap<object, NotePreviewRange[]>()

function getSolePreviewBlockRange(
  doc: any,
  from: number,
  to: number,
  token: string,
): { from: number; to: number } | null {
  if (typeof doc?.resolve !== 'function') return null

  try {
    const resolved = doc.resolve(from)
    for (let depth = resolved.depth; depth > 0; depth -= 1) {
      const node = typeof resolved.node === 'function' ? resolved.node(depth) : null
      if (!node?.isTextblock) continue
      if (String(node.textContent ?? '').trim() !== token) return null

      const blockFrom = resolved.before(depth)
      const blockTo = resolved.after(depth)
      if (
        Number.isFinite(blockFrom) &&
        Number.isFinite(blockTo) &&
        blockFrom <= from &&
        blockTo >= to
      ) {
        return { from: blockFrom, to: blockTo }
      }
      return null
    }
  } catch {
    return null
  }

  return null
}

function collectNotePreviewRangesUncached(doc: any, appState: AppState | null): NotePreviewRange[] {
  const ranges: NotePreviewRange[] = []
  if (!doc || !appState || typeof doc.descendants !== 'function') return ranges

  doc.descendants((node: any, position: number) => {
    if (!node?.isText || typeof node.text !== 'string') return true
    const referenceRe = new RegExp(NOTE_PREVIEW_REFERENCE_RE.source, 'g')
    for (const match of node.text.matchAll(referenceRe)) {
      const token = match[0]
      if (!token.startsWith('!')) continue
      const payload = parsePreviewToken(token, appState)
      if (!payload) continue
      const offset = match.index ?? 0
      const from = position + offset
      const to = from + token.length
      const blockRange = getSolePreviewBlockRange(doc, from, to, token)
      ranges.push({
        from,
        to,
        widgetFrom: blockRange?.from ?? from,
        hideFrom: blockRange?.from ?? from,
        hideTo: blockRange?.to ?? to,
        hideAsBlock: Boolean(blockRange),
        token,
        payload,
      })
    }
    return true
  })

  return ranges
}

export function collectNotePreviewRanges(doc: any, appState: AppState | null): NotePreviewRange[] {
  if (!doc || typeof doc.descendants !== 'function') return []
  if (typeof doc === 'object' || typeof doc === 'function') {
    const cachedRanges = notePreviewRangeCache.get(doc)
    if (cachedRanges) return cachedRanges
    const ranges = collectNotePreviewRangesUncached(doc, appState)
    notePreviewRangeCache.set(doc, ranges)
    return ranges
  }
  return collectNotePreviewRangesUncached(doc, appState)
}

export function deleteNotePreviewRangeFromView(view: any, range: Pick<NotePreviewRange, 'from' | 'to'>): boolean {
  if (!view?.state?.tr || typeof view.dispatch !== 'function') return false
  const docSize = view.state.doc?.content?.size ?? range.to
  const from = Math.max(0, Math.min(docSize, Math.floor(Math.min(range.from, range.to))))
  const to = Math.max(from, Math.min(docSize, Math.floor(Math.max(range.from, range.to))))
  if (to <= from || typeof view.state.tr.delete !== 'function') return false
  let transaction = view.state.tr.delete(from, to)
  if (typeof transaction?.scrollIntoView === 'function') transaction = transaction.scrollIntoView()
  view.dispatch(transaction)
  if (typeof view.focus === 'function') view.focus()
  return true
}

export function createNotePreviewPlugin({
  getAppState,
  getCurrentNoteBodyId,
  onOpenNote,
}: {
  getAppState?: () => AppState
  getCurrentNoteBodyId?: () => string
  onOpenNote?: (target: NoteLocation) => void
}) {
  return (context: any) => {
    const { Plugin } = context.pmState
    const { Decoration, DecorationSet } = context.pmView
    let cachedDecorationDoc: any = null
    let cachedDecorationAppState: AppState | null = null
    let cachedDecorationSet: unknown = null

    return {
      wysiwygPlugins: [
        () =>
          new Plugin({
            props: {
              decorations: (editorState: any) => {
                const doc = editorState.doc
                const appState = getAppState?.() ?? null
                if (doc === cachedDecorationDoc && appState === cachedDecorationAppState && cachedDecorationSet) return cachedDecorationSet
                const currentNoteBodyId = getCurrentNoteBodyId?.() ?? ''
                const decorationSet = measureSlowOperation('note-preview decorations', () => {
                  const decorations: unknown[] = []
                  const roots = new WeakMap<Element, Root>()
                  collectNotePreviewRanges(doc, appState).forEach((range, index) => {
                    decorations.push(
                      Decoration.widget(
                        range.widgetFrom,
                        (view: any) => {
                          const host = document.createElement('div')
                          host.className = 'tabs-note-preview-widget-host'
                          host.contentEditable = 'false'
                          host.setAttribute('data-note-preview-widget', 'true')
                          host.setAttribute('data-note-workspace-skip-aisle-activation', 'true')
                          const root = createRoot(host)
                          roots.set(host, root)
                          if (appState) {
                            root.render(
                              <NotePreviewContent
                                appState={appState}
                                target={range.payload.target}
                                currentNoteBodyId={currentNoteBodyId}
                                onOpenNote={onOpenNote}
                                onDelete={() => deleteNotePreviewRangeFromView(view, range)}
                              />,
                            )
                          }
                          return host
                        },
                        {
                          key: `note-preview-${range.from}-${range.to}-${index}`,
                          side: -1,
                          destroy: (node: Element) => {
                            roots.get(node)?.unmount()
                          },
                        },
                      ),
                    )
                    if (range.hideAsBlock && typeof Decoration.node === 'function') {
                      decorations.push(Decoration.node(range.hideFrom, range.hideTo, { class: 'tabs-note-preview-source-block-hidden' }))
                    } else {
                      decorations.push(Decoration.inline(range.hideFrom, range.hideTo, { class: 'tabs-note-preview-source-hidden' }))
                    }
                  })
                  return DecorationSet.create(doc, decorations)
                })
                cachedDecorationDoc = doc
                cachedDecorationAppState = appState
                cachedDecorationSet = decorationSet
                return decorationSet
              },
            },
          }),
      ],
    }
  }
}
