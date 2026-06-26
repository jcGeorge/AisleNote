export type FindReplaceMatchPositionInput = {
  visibleFrom: number
  visibleTo: number
  markdownFrom?: number
  markdownTo?: number
}

export type FindReplaceActiveMatchInput = FindReplaceMatchPositionInput & {
  requestId: number
}

export type FindReplaceActiveMatchRange = {
  from: number
  to: number
  requestId: number
}

type EditorVisibleTextIndex = {
  text: string
  positions: number[]
}

export const FIND_REPLACE_ACTIVE_MATCH_META = 'aislenote-find-replace-active-match'
export const FIND_REPLACE_ACTIVE_MATCH_CLASS_NAME = 'aislenote-find-replace-active-match'
export const FIND_REPLACE_ACTIVE_MATCH_PULSE_CLASS_NAME = 'aislenote-find-replace-active-match-pulse'

function appendVisibleChar(index: EditorVisibleTextIndex, char: string, position: number) {
  index.text += char
  index.positions.push(position)
}

function appendVisibleText(index: EditorVisibleTextIndex, text: string, startPosition: number) {
  for (let offset = 0; offset < text.length; offset += 1) {
    appendVisibleChar(index, text[offset], startPosition + offset)
  }
}

function buildEditorVisibleTextIndex(doc: any): EditorVisibleTextIndex {
  const index: EditorVisibleTextIndex = { text: '', positions: [] }
  if (!doc || typeof doc.descendants !== 'function') return index

  let hasTextBlock = false
  doc.descendants((node: any, position: number) => {
    if (!node?.isTextblock) return true

    if (hasTextBlock) appendVisibleChar(index, '\n', -1)
    hasTextBlock = true

    if (typeof node.descendants !== 'function') {
      if (typeof node.textContent === 'string') appendVisibleText(index, node.textContent, position + 1)
      return false
    }

    node.descendants((child: any, childPosition: number) => {
      if (child?.isText && typeof child.text === 'string') {
        appendVisibleText(index, child.text, position + 1 + childPosition)
        return true
      }
      if (child?.type?.name === 'hardBreak') appendVisibleChar(index, '\n', -1)
      return true
    })
    return false
  })

  return index
}

function getMappedStartPosition(index: EditorVisibleTextIndex, visibleFrom: number): number | null {
  const start = Math.max(0, Math.floor(visibleFrom))
  for (let offset = start; offset < index.positions.length; offset += 1) {
    const position = index.positions[offset]
    if (position >= 0) return position
  }
  return null
}

function getMappedEndPosition(index: EditorVisibleTextIndex, visibleTo: number): number | null {
  const start = Math.min(index.positions.length - 1, Math.floor(visibleTo) - 1)
  for (let offset = start; offset >= 0; offset -= 1) {
    const position = index.positions[offset]
    if (position >= 0) return position + 1
  }
  return null
}

function normalizeDocRange(doc: any, from: unknown, to: unknown): { from: number; to: number } | null {
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null
  const docSize = Number.isFinite(doc?.content?.size) ? Number(doc.content.size) : 0
  const safeFrom = Math.max(0, Math.min(docSize, Math.floor(Number(from))))
  const safeTo = Math.max(safeFrom, Math.min(docSize, Math.floor(Number(to))))
  return safeTo > safeFrom ? { from: safeFrom, to: safeTo } : null
}

export function resolveFindReplaceEditorRange(
  doc: any,
  match: FindReplaceMatchPositionInput,
): { from: number; to: number } | null {
  const visibleIndex = buildEditorVisibleTextIndex(doc)
  const from = getMappedStartPosition(visibleIndex, match.visibleFrom)
  const to = getMappedEndPosition(visibleIndex, match.visibleTo)
  if (from !== null && to !== null && to > from) return { from, to }
  return normalizeDocRange(doc, match.markdownFrom, match.markdownTo)
}

function normalizeActiveMatchRange(value: unknown, doc: any): FindReplaceActiveMatchRange | null {
  if (!value || typeof value !== 'object') return null
  const range = value as Partial<FindReplaceActiveMatchRange>
  const normalized = normalizeDocRange(doc, range.from, range.to)
  if (!normalized || !Number.isFinite(range.requestId)) return null
  return {
    ...normalized,
    requestId: Number(range.requestId),
  }
}

export function findReplaceActiveMatchPlugin(context: {
  pmState: {
    Plugin: new (spec: {
      state?: {
        init: () => FindReplaceActiveMatchRange | null
        apply: (transaction: any, value: FindReplaceActiveMatchRange | null) => FindReplaceActiveMatchRange | null
      }
      props?: {
        decorations?: (state: { doc: any }) => unknown
      }
    }) => unknown
  }
  pmView: {
    Decoration: {
      inline: (from: number, to: number, attrs: Record<string, string>, spec?: Record<string, unknown>) => unknown
    }
    DecorationSet: {
      create: (doc: unknown, decorations: unknown[]) => unknown
    }
  }
}) {
  const { Plugin } = context.pmState
  const { Decoration, DecorationSet } = context.pmView

  return {
    wysiwygPlugins: [
      () => {
        let activeRange: FindReplaceActiveMatchRange | null = null

        return new Plugin({
          state: {
            init: () => null,
            apply: (transaction: any, value: FindReplaceActiveMatchRange | null) => {
              if (!transaction || typeof transaction.getMeta !== 'function') return value
              const meta = transaction.getMeta(FIND_REPLACE_ACTIVE_MATCH_META)
              if (meta === undefined) return value
              activeRange = normalizeActiveMatchRange(meta, transaction.doc)
              return activeRange
            },
          },
          props: {
            decorations: (state: { doc: any }) => {
              const range = normalizeActiveMatchRange(activeRange, state.doc)
              return DecorationSet.create(
                state.doc,
                range
                  ? [
                      Decoration.inline(
                        range.from,
                        range.to,
                        {
                          class: `${FIND_REPLACE_ACTIVE_MATCH_CLASS_NAME} ${FIND_REPLACE_ACTIVE_MATCH_PULSE_CLASS_NAME}`,
                        },
                        { key: `find-replace-active-match-${range.requestId}-${range.from}-${range.to}` },
                      ),
                    ]
                  : [],
              )
            },
          },
        })
      },
    ],
  }
}
