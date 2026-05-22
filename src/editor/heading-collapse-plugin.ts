import {
  getHeadingBoundaryGapsFromMarkdown,
  getHeadingCollapseBlocksFromDoc,
  getHeadingCollapseSections,
  type HeadingCollapseBlock,
  type HeadingCollapseRange,
} from './heading-outline'

const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6'
const LONG_PRESS_DELAY_MS = 500
const LONG_PRESS_CANCEL_DISTANCE_PX = 6
export const HEADING_COLLAPSE_HEADING_CLASS = 'tabs-heading-collapse-heading'
export const HEADING_COLLAPSE_COLLAPSED_CLASS = 'tabs-heading-collapse-heading-collapsed'
export const HEADING_COLLAPSE_HIDDEN_CLASS = 'tabs-heading-collapse-hidden'
export const HEADING_COLLAPSE_PRESERVED_GAP_CLASS = 'tabs-heading-collapse-preserved-gap-before'
export const HEADING_COLLAPSE_KEY_ATTRIBUTE = 'data-heading-collapse-key'

type HeadingCollapsePluginOptions = {
  aisleId: string
  getCollapsedHeadingKeys: (aisleId: string) => ReadonlySet<string>
  getMarkdown: (aisleId: string) => string
  onToggleHeading: (aisleId: string, headingKey: string) => void
  onExpandHeading: (aisleId: string, headingKey: string) => void
}

type PendingLongPress = {
  pointerId: number
  startX: number
  startY: number
  headingKey: string
  timer: number
}

type HeadingCollapseEnterState = {
  doc: unknown
  selection?: {
    empty?: boolean
    $from?: {
      pos?: number
      depth?: number
      parent?: unknown
      before?: (depth: number) => number
      after?: (depth: number) => number
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isPrimaryPointer(event: PointerEvent) {
  return event.button === 0 && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
}

function isPlainEnterEvent(event: KeyboardEvent) {
  return (
    (event.key === 'Enter' || event.code === 'Enter') &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !event.isComposing
  )
}

function getNodeTypeName(node: unknown) {
  return isRecord(node) && isRecord(node.type) && typeof node.type.name === 'string' ? node.type.name : ''
}

function getHeadingKeyFromEventTarget(target: EventTarget | null, root: HTMLElement): string | null {
  const element = target instanceof Element ? target : target instanceof Text ? target.parentElement : null
  const heading = element?.closest(HEADING_SELECTOR)
  if (!(heading instanceof HTMLElement) || !root.contains(heading)) return null
  return heading.getAttribute(HEADING_COLLAPSE_KEY_ATTRIBUTE)
}

function getSelectionHeadingBlock(
  blocks: HeadingCollapseBlock[],
  selection: NonNullable<HeadingCollapseEnterState['selection']>,
): HeadingCollapseBlock | null {
  const $from = selection.$from
  if (!$from || getNodeTypeName($from.parent) !== 'heading') return null

  const depth = typeof $from.depth === 'number' ? $from.depth : null
  const from = depth !== null && typeof $from.before === 'function' ? $from.before(depth) : null
  const to = depth !== null && typeof $from.after === 'function' ? $from.after(depth) : null
  const pos = typeof $from.pos === 'number' ? $from.pos : null

  return (
    blocks.find((block) => {
      if (!block.heading) return false
      if (from !== null && to !== null && block.start === from && block.end === to) return true
      return pos !== null && block.start < pos && pos < block.end
    }) ?? null
  )
}

function getSelectionAfterHeadingBlock(
  blocks: HeadingCollapseBlock[],
  selection: NonNullable<HeadingCollapseEnterState['selection']>,
): HeadingCollapseBlock | null {
  const pos = typeof selection.$from?.pos === 'number' ? selection.$from.pos : null
  if (pos === null) return null
  return blocks.find((block) => Boolean(block.heading) && block.end === pos) ?? null
}

export function getCollapsedHeadingKeyForEnter(
  state: HeadingCollapseEnterState,
  aisleId: string,
  collapsedHeadingKeys: ReadonlySet<string>,
): string | null {
  const selection = state.selection
  if (!selection?.empty) return null

  const blocks = getHeadingCollapseBlocksFromDoc(aisleId, state.doc)
  const block = getSelectionHeadingBlock(blocks, selection) ?? getSelectionAfterHeadingBlock(blocks, selection)
  const headingKey = block?.heading?.key ?? null
  return headingKey && collapsedHeadingKeys.has(headingKey) ? headingKey : null
}

function getPointerDistance(event: PointerEvent, pending: PendingLongPress) {
  return Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY)
}

function classNames(...values: Array<string | false>) {
  return values.filter(Boolean).join(' ')
}

function getHeadingDecorationAttrs(headingKey: string, collapsed: boolean, preservedGapLineCount = 0) {
  const normalizedGapLineCount = Math.min(6, Math.max(0, preservedGapLineCount))
  return {
    class: classNames(
      HEADING_COLLAPSE_HEADING_CLASS,
      collapsed && HEADING_COLLAPSE_COLLAPSED_CLASS,
      normalizedGapLineCount > 0 && HEADING_COLLAPSE_PRESERVED_GAP_CLASS,
    ),
    [HEADING_COLLAPSE_KEY_ATTRIBUTE]: headingKey,
    'data-heading-collapsed': collapsed ? 'true' : 'false',
    ...(normalizedGapLineCount > 0
      ? { style: `--tabs-heading-preserved-gap-lines: ${normalizedGapLineCount}` }
      : {}),
  }
}

function getHiddenRangeDecorationKey(range: HeadingCollapseRange, index: number) {
  return `heading-collapse-hidden-${range.from}-${range.to}-${index}`
}

export function headingCollapsePlugin(context: {
  pmState: {
    Plugin: new (spec: Record<string, unknown>) => unknown
  }
  pmView: {
    Decoration: {
      node: (from: number, to: number, attrs: Record<string, string>, spec?: Record<string, unknown>) => unknown
    }
    DecorationSet: {
      create: (doc: unknown, decorations: unknown[]) => unknown
    }
  }
}, options: HeadingCollapsePluginOptions) {
  const { Plugin } = context.pmState
  const { Decoration, DecorationSet } = context.pmView

  return {
    wysiwygPlugins: [
      () => {
        let pendingLongPress: PendingLongPress | null = null

        const clearPendingLongPress = () => {
          if (!pendingLongPress) return
          window.clearTimeout(pendingLongPress.timer)
          pendingLongPress = null
        }

        return new Plugin({
          view: () => ({
            destroy: clearPendingLongPress,
          }),
          props: {
            decorations: (state: { doc: unknown }) => {
              const blocks = getHeadingCollapseBlocksFromDoc(options.aisleId, state.doc)
              const collapsedHeadingKeys = options.getCollapsedHeadingKeys(options.aisleId)
              const collapsedSections = getHeadingCollapseSections(blocks, collapsedHeadingKeys)
              const boundaryGaps = getHeadingBoundaryGapsFromMarkdown(options.aisleId, options.getMarkdown(options.aisleId))
              const preservedGapLineCounts = new Map<string, number>()
              const decorations: unknown[] = []

              collapsedSections.forEach((section) => {
                const boundaryHeadingKey = section.boundaryHeading?.key
                if (!boundaryHeadingKey || section.hasRetainedBlankParagraphsBeforeBoundary) return
                const boundaryGapLineCount = boundaryGaps.get(boundaryHeadingKey) ?? 0
                if (boundaryGapLineCount <= 0) return
                preservedGapLineCounts.set(
                  boundaryHeadingKey,
                  Math.max(preservedGapLineCounts.get(boundaryHeadingKey) ?? 0, boundaryGapLineCount),
                )
              })

              blocks.forEach((block) => {
                if (!block.heading) return
                const collapsed = collapsedHeadingKeys.has(block.heading.key)
                decorations.push(
                  Decoration.node(
                    block.start,
                    block.end,
                    getHeadingDecorationAttrs(
                      block.heading.key,
                      collapsed,
                      preservedGapLineCounts.get(block.heading.key) ?? 0,
                    ),
                    { key: `heading-collapse-heading-${block.heading.key}` },
                  ),
                )
              })

              collapsedSections.forEach((section) => {
                section.hiddenRanges.forEach((range, index) => {
                  decorations.push(
                    Decoration.node(
                      range.from,
                      range.to,
                      { class: HEADING_COLLAPSE_HIDDEN_CLASS },
                      { key: getHiddenRangeDecorationKey(range, index) },
                    ),
                  )
                })
              })

              return DecorationSet.create(state.doc, decorations)
            },
            handleDOMEvents: {
              keydown: (view: { state: HeadingCollapseEnterState }, event: KeyboardEvent) => {
                if (!isPlainEnterEvent(event)) return false
                const headingKey = getCollapsedHeadingKeyForEnter(
                  view.state,
                  options.aisleId,
                  options.getCollapsedHeadingKeys(options.aisleId),
                )
                if (!headingKey) return false
                options.onExpandHeading(options.aisleId, headingKey)
                return false
              },
              pointerdown: (view: { dom: HTMLElement }, event: PointerEvent) => {
                clearPendingLongPress()
                if (!isPrimaryPointer(event)) return false
                const headingKey = getHeadingKeyFromEventTarget(event.target, view.dom)
                if (!headingKey) return false

                pendingLongPress = {
                  pointerId: event.pointerId,
                  startX: event.clientX,
                  startY: event.clientY,
                  headingKey,
                  timer: window.setTimeout(() => {
                    const toggledKey = pendingLongPress?.headingKey
                    pendingLongPress = null
                    if (toggledKey) {
                      options.onToggleHeading(options.aisleId, toggledKey)
                    }
                  }, LONG_PRESS_DELAY_MS),
                }
                return false
              },
              pointermove: (_view: unknown, event: PointerEvent) => {
                if (!pendingLongPress || pendingLongPress.pointerId !== event.pointerId) return false
                if (getPointerDistance(event, pendingLongPress) > LONG_PRESS_CANCEL_DISTANCE_PX) {
                  clearPendingLongPress()
                }
                return false
              },
              pointerup: (_view: unknown, event: PointerEvent) => {
                if (!pendingLongPress || pendingLongPress.pointerId !== event.pointerId) return false
                clearPendingLongPress()
                return false
              },
              pointercancel: (_view: unknown, event: PointerEvent) => {
                if (!pendingLongPress || pendingLongPress.pointerId !== event.pointerId) return false
                clearPendingLongPress()
                return false
              },
              dragstart: () => {
                clearPendingLongPress()
                return false
              },
            },
          },
        })
      },
    ],
  }
}
