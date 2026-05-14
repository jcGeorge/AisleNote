export type BulletListMarker = 'bullet' | 'dash'

export const DASH_LIST_CLASS_NAME = 'tabs-dash-list'
export const DASH_LIST_MARKER_ATTR = 'data-tabs-list-marker'
export const DASH_LIST_MARKER_VALUE = 'dash'

type BulletListNodeAttrs = {
  htmlAttrs?: Record<string, unknown> | null
  classNames?: string[] | null
  [key: string]: unknown
}

type HtmlOpenTagToken = {
  type?: string
  tagName?: string
  attributes?: Record<string, unknown>
  classNames?: string[]
  [key: string]: unknown
}

type ProseMirrorNodeLike = {
  type?: { name?: string }
  attrs?: BulletListNodeAttrs | null
}

type ProseMirrorResolvedPosLike = {
  depth: number
  node: (depth: number) => ProseMirrorNodeLike | null
  before: (depth: number) => number
}

type ProseMirrorSelectionLike = {
  from: number
  to: number
  $from?: ProseMirrorResolvedPosLike
  $to?: ProseMirrorResolvedPosLike
}

type ProseMirrorTransactionLike = {
  setNodeMarkup: (
    position: number,
    type?: unknown,
    attrs?: BulletListNodeAttrs | null,
  ) => ProseMirrorTransactionLike
  scrollIntoView: () => ProseMirrorTransactionLike
}

type ProseMirrorViewLike = {
  state: {
    selection: ProseMirrorSelectionLike
    doc: {
      nodesBetween?: (
        from: number,
        to: number,
        callback: (node: ProseMirrorNodeLike, position: number) => boolean | void,
      ) => void
    }
    tr: ProseMirrorTransactionLike
  }
  dispatch: (transaction: ProseMirrorTransactionLike) => void
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function compactHtmlAttrs(attrs: Record<string, unknown>): Record<string, unknown> | null {
  const entries = Object.entries(attrs).filter(([, value]) => value !== null && value !== undefined)
  return entries.length > 0 ? Object.fromEntries(entries) : null
}

function compactClassNames(classNames: unknown): string[] {
  return Array.isArray(classNames)
    ? Array.from(new Set(classNames.filter((className): className is string => typeof className === 'string')))
    : []
}

export function getBulletListMarkerFromMarkdownChar(markerChar: unknown): BulletListMarker {
  return markerChar === '-' ? 'dash' : 'bullet'
}

export function getBulletListMarkerFromAttrs(attrs: unknown): BulletListMarker {
  const nodeAttrs = toRecord(attrs)
  const htmlAttrs = toRecord(nodeAttrs.htmlAttrs)
  if (htmlAttrs[DASH_LIST_MARKER_ATTR] === DASH_LIST_MARKER_VALUE) return 'dash'
  if (compactClassNames(nodeAttrs.classNames).includes(DASH_LIST_CLASS_NAME)) return 'dash'
  return 'bullet'
}

export function getBulletListMarkdownDelimiter(attrs: unknown): '-' | '*' {
  return getBulletListMarkerFromAttrs(attrs) === 'dash' ? '-' : '*'
}

export function setBulletListMarkerAttrs(
  attrs: BulletListNodeAttrs | null | undefined,
  marker: BulletListMarker,
): BulletListNodeAttrs | null {
  const nextAttrs: BulletListNodeAttrs = attrs ? { ...attrs } : {}
  const nextHtmlAttrs = { ...toRecord(nextAttrs.htmlAttrs) }
  const nextClassNames = compactClassNames(nextAttrs.classNames).filter(
    (className) => className !== DASH_LIST_CLASS_NAME,
  )

  delete nextHtmlAttrs[DASH_LIST_MARKER_ATTR]

  if (marker === 'dash') {
    nextHtmlAttrs[DASH_LIST_MARKER_ATTR] = DASH_LIST_MARKER_VALUE
    nextClassNames.push(DASH_LIST_CLASS_NAME)
  }

  nextAttrs.htmlAttrs = compactHtmlAttrs(nextHtmlAttrs)
  nextAttrs.classNames = nextClassNames.length > 0 ? nextClassNames : null

  return Object.values(nextAttrs).some((value) => value !== null && value !== undefined) ? nextAttrs : null
}

export function createBulletListAttrs(marker: BulletListMarker): BulletListNodeAttrs | null {
  return setBulletListMarkerAttrs(null, marker)
}

function addDashMarkerToOpenTagToken(token: HtmlOpenTagToken): HtmlOpenTagToken {
  if (token.type !== 'openTag' || token.tagName !== 'ul') return token
  const attributes = { ...toRecord(token.attributes), [DASH_LIST_MARKER_ATTR]: DASH_LIST_MARKER_VALUE }
  const classNames = compactClassNames(token.classNames)
  if (!classNames.includes(DASH_LIST_CLASS_NAME)) classNames.push(DASH_LIST_CLASS_NAME)
  return {
    ...token,
    attributes,
    classNames,
  }
}

export function applyBulletListMarkerToHtmlToken(token: unknown, marker: BulletListMarker): unknown {
  if (marker !== 'dash') return token
  if (Array.isArray(token)) return token.map((item) => applyBulletListMarkerToHtmlToken(item, marker))
  if (!token || typeof token !== 'object') return token
  return addDashMarkerToOpenTagToken(token as HtmlOpenTagToken)
}

function addAncestorBulletLists(
  resolvedPos: ProseMirrorResolvedPosLike | undefined,
  positions: Map<number, ProseMirrorNodeLike>,
) {
  if (!resolvedPos) return
  for (let depth = resolvedPos.depth; depth > 0; depth -= 1) {
    const node = resolvedPos.node(depth)
    if (node?.type?.name === 'bulletList') {
      positions.set(resolvedPos.before(depth), node)
    }
  }
}

function collectSelectedBulletLists(view: ProseMirrorViewLike): Map<number, ProseMirrorNodeLike> {
  const { selection, doc } = view.state
  const positions = new Map<number, ProseMirrorNodeLike>()
  addAncestorBulletLists(selection.$from, positions)
  addAncestorBulletLists(selection.$to, positions)

  if (selection.from !== selection.to && doc.nodesBetween) {
    const from = Math.min(selection.from, selection.to)
    const to = Math.max(selection.from, selection.to)
    doc.nodesBetween(from, to, (node, position) => {
      if (node.type?.name === 'bulletList') positions.set(position, node)
      return true
    })
  }

  return positions
}

export function setSelectedBulletListsMarker(view: unknown, marker: BulletListMarker): boolean {
  const proseMirrorView = view as ProseMirrorViewLike | null
  if (!proseMirrorView?.state?.selection || !proseMirrorView.dispatch) return false

  const selectedLists = collectSelectedBulletLists(proseMirrorView)
  if (selectedLists.size === 0) return false

  let transaction = proseMirrorView.state.tr
  selectedLists.forEach((node, position) => {
    transaction = transaction.setNodeMarkup(position, undefined, setBulletListMarkerAttrs(node.attrs, marker))
  })
  proseMirrorView.dispatch(transaction.scrollIntoView())
  return true
}
