import type { ToolbarLayout, ToolbarLayoutItem, ToolbarToolId } from '../types/app'
import { createRandomId } from '../state/navigation-ids'

export type { ToolbarLayout, ToolbarLayoutItem, ToolbarToolId } from '../types/app'

export const DEFAULT_TOOLBAR_LAYOUT_ID = 'default'

const createId = createRandomId

export type ToolbarLayoutRenderSegment =
  | { type: 'group'; id: string; items: ToolbarLayoutItem[] }
  | { type: 'spacer'; id: string }

export const TOOLBAR_TOOL_IDS = [
  'copy',
  'frontmatter',
  'tableOfContents',
  'aisles',
  'findReplace',
  'undo',
  'redo',
  'heading',
  'bold',
  'italic',
  'highlight',
  'strike',
  'taskList',
  'bulletList',
  'orderedList',
  'dashList',
  'blockQuote',
  'blockIndent',
  'removeBlockIndent',
  'hr',
  'link',
  'image',
  'table',
  'code',
  'codeBlock',
  'clear',
] as const satisfies readonly ToolbarToolId[]

export const TOOLBAR_TOOL_LABELS: Record<ToolbarToolId, string> = {
  copy: 'Make this a copy of',
  frontmatter: 'Frontmatter',
  tableOfContents: 'Table of contents',
  aisles: 'Aisles',
  findReplace: 'Find & replace',
  undo: 'Undo',
  redo: 'Redo',
  heading: 'Headings',
  bold: 'Bold',
  italic: 'Italic',
  highlight: 'Highlight',
  strike: 'Strikethrough',
  taskList: 'Task',
  bulletList: 'Unordered list',
  orderedList: 'Ordered list',
  dashList: 'Dash list',
  blockQuote: 'Block quote',
  blockIndent: 'Block indent',
  removeBlockIndent: 'Remove block indent',
  hr: 'Horizontal line',
  link: 'Insert link',
  image: 'Insert image',
  table: 'Insert table',
  code: 'Code',
  codeBlock: 'Insert CodeBlock',
  clear: 'Clear contents',
}

const TOOLBAR_TOOL_ID_SET = new Set<string>(TOOLBAR_TOOL_IDS)
const NOTE_TOOL_IDS = new Set<ToolbarToolId>(['copy', 'frontmatter', 'tableOfContents', 'aisles', 'findReplace'])
const HISTORY_TOOL_IDS = new Set<ToolbarToolId>(['undo', 'redo'])
const FORMAT_TOOL_IDS = new Set<ToolbarToolId>(['heading', 'bold', 'italic', 'highlight', 'strike'])

const DEFAULT_TOOLBAR_TOOL_GROUPS: ToolbarToolId[][] = [
  ['copy', 'frontmatter', 'tableOfContents', 'aisles', 'findReplace'],
  ['undo', 'redo'],
  ['heading', 'bold', 'italic', 'highlight', 'strike'],
  ['taskList', 'bulletList', 'orderedList', 'dashList'],
  ['blockQuote', 'blockIndent', 'removeBlockIndent', 'hr'],
  ['link', 'image', 'table'],
  ['code', 'codeBlock'],
  ['clear'],
]

export function isToolbarToolId(value: unknown): value is ToolbarToolId {
  return typeof value === 'string' && TOOLBAR_TOOL_ID_SET.has(value)
}

export function createToolbarToolItem(toolId: ToolbarToolId, id = createId()): ToolbarLayoutItem {
  return { id, type: 'tool', toolId }
}

export function createToolbarSpacerItem(id = createId()): ToolbarLayoutItem {
  return { id, type: 'spacer' }
}

function cloneToolbarItem(item: ToolbarLayoutItem): ToolbarLayoutItem {
  return item.type === 'tool'
    ? { id: item.id, type: 'tool', toolId: item.toolId }
    : { id: item.id, type: 'spacer' }
}

function createDefaultToolbarItems(): ToolbarLayoutItem[] {
  const items: ToolbarLayoutItem[] = []
  DEFAULT_TOOLBAR_TOOL_GROUPS.forEach((group, groupIndex) => {
    if (groupIndex > 0) {
      items.push({ id: `default-spacer-${groupIndex}`, type: 'spacer' })
    }
    group.forEach((toolId) => {
      items.push({ id: `default-tool-${toolId}`, type: 'tool', toolId })
    })
  })
  return items
}

export function getDefaultToolbarLayout(): ToolbarLayout {
  return {
    id: DEFAULT_TOOLBAR_LAYOUT_ID,
    name: 'default',
    items: createDefaultToolbarItems(),
  }
}

export function isProtectedToolbarLayoutId(layoutId: string): boolean {
  return layoutId === DEFAULT_TOOLBAR_LAYOUT_ID
}

export function normalizeToolbarLayoutItems(raw: unknown): ToolbarLayoutItem[] {
  if (!Array.isArray(raw)) return getDefaultToolbarLayout().items
  const seenToolIds = new Set<ToolbarToolId>()
  const seenItemIds = new Set<string>()
  const items: ToolbarLayoutItem[] = []

  raw.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return
    const candidate = entry as Record<string, unknown>
    const requestedId = typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim() : createId()
    const id = seenItemIds.has(requestedId) ? createId() : requestedId
    seenItemIds.add(id)

    if (candidate.type === 'tool') {
      const toolId = candidate.toolId
      if (!isToolbarToolId(toolId) || seenToolIds.has(toolId)) return
      seenToolIds.add(toolId)
      items.push({ id, type: 'tool', toolId })
      return
    }

    if (candidate.type === 'spacer') {
      items.push({ id, type: 'spacer' })
    }
  })

  return items
}

export function normalizeToolbarLayouts(raw: unknown): ToolbarLayout[] {
  if (!Array.isArray(raw)) return []
  const seenLayoutIds = new Set<string>()
  const layouts: ToolbarLayout[] = []

  raw.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return
    const candidate = entry as Record<string, unknown>
    const id = typeof candidate.id === 'string' ? candidate.id.trim() : ''
    if (!id || isProtectedToolbarLayoutId(id) || seenLayoutIds.has(id)) return
    seenLayoutIds.add(id)
    const name = typeof candidate.name === 'string' && candidate.name.trim()
      ? candidate.name.trim()
      : `toolbar ${index + 1}`
    layouts.push({
      id,
      name,
      items: normalizeToolbarLayoutItems(candidate.items),
    })
  })

  return layouts
}

export function getToolbarLayouts(customLayouts: unknown): ToolbarLayout[] {
  return [getDefaultToolbarLayout(), ...normalizeToolbarLayouts(customLayouts)]
}

export function resolveToolbarLayout(customLayouts: unknown, activeLayoutId: string | null | undefined): ToolbarLayout {
  const layouts = getToolbarLayouts(customLayouts)
  return layouts.find((layout) => layout.id === activeLayoutId) ?? layouts[0]
}

export function resolveToolbarLayoutId(customLayouts: unknown, activeLayoutId: string | null | undefined): string {
  return resolveToolbarLayout(customLayouts, activeLayoutId).id
}

export function cloneToolbarLayoutItemsForStorage(items: ToolbarLayoutItem[]): ToolbarLayoutItem[] {
  return items.map((item) =>
    item.type === 'tool'
      ? { id: createId(), type: 'tool', toolId: item.toolId }
      : { id: createId(), type: 'spacer' },
  )
}

export function createCustomToolbarLayout(name = 'coolbar', sourceItems = getDefaultToolbarLayout().items): ToolbarLayout {
  return {
    id: createId(),
    name: name.trim() || 'coolbar',
    items: cloneToolbarLayoutItemsForStorage(sourceItems),
  }
}

function normalizeToolbarName(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function toolbarNameKey(value: string): string {
  return normalizeToolbarName(value).toLocaleLowerCase()
}

function getSequencedToolbarLayoutName(baseName: string, layouts: ToolbarLayout[]): string {
  const base = normalizeToolbarName(baseName) || 'coolbar'
  const usedNames = new Set(layouts.map((layout) => toolbarNameKey(layout.name)))
  if (!usedNames.has(toolbarNameKey(base))) return base

  for (let index = 2; ; index += 1) {
    const candidate = `${base} ${index}`
    if (!usedNames.has(toolbarNameKey(candidate))) return candidate
  }
}

function getDuplicateToolbarLayoutBaseName(sourceName: string, layouts: ToolbarLayout[]): string {
  const normalizedSourceName = normalizeToolbarName(sourceName)
  const sourceNameKey = toolbarNameKey(normalizedSourceName)
  if (!normalizedSourceName || sourceNameKey === DEFAULT_TOOLBAR_LAYOUT_ID || sourceNameKey.startsWith('coolbar')) {
    return 'coolbar'
  }

  const numberedName = normalizedSourceName.match(/^(.*\S)\s+(\d+)$/)
  if (numberedName) {
    const rootName = normalizeToolbarName(numberedName[1])
    if (layouts.some((layout) => toolbarNameKey(layout.name) === toolbarNameKey(rootName))) return rootName
  }

  return normalizedSourceName
}

export function getNextCoolbarToolbarLayoutName(layouts: ToolbarLayout[]): string {
  return getSequencedToolbarLayoutName('coolbar', layouts)
}

export function getDuplicateToolbarLayoutName(sourceName: string, layouts: ToolbarLayout[]): string {
  return getSequencedToolbarLayoutName(getDuplicateToolbarLayoutBaseName(sourceName, layouts), layouts)
}

export function updateToolbarLayout(
  layouts: ToolbarLayout[] | undefined,
  layoutId: string,
  update: (layout: ToolbarLayout) => ToolbarLayout,
): ToolbarLayout[] {
  return normalizeToolbarLayouts(layouts).map((layout) => (layout.id === layoutId ? update(layout) : layout))
}

export function removeToolbarLayout(layouts: ToolbarLayout[] | undefined, layoutId: string): ToolbarLayout[] {
  if (isProtectedToolbarLayoutId(layoutId)) return normalizeToolbarLayouts(layouts)
  return normalizeToolbarLayouts(layouts).filter((layout) => layout.id !== layoutId)
}

export function moveToolbarLayoutItem(
  items: ToolbarLayoutItem[],
  itemId: string,
  direction: 'up' | 'down',
): ToolbarLayoutItem[] {
  const index = items.findIndex((item) => item.id === itemId)
  if (index < 0) return items
  const nextIndex = direction === 'up' ? index - 1 : index + 1
  if (nextIndex < 0 || nextIndex >= items.length) return items
  const nextItems = [...items]
  const [item] = nextItems.splice(index, 1)
  nextItems.splice(nextIndex, 0, item)
  return nextItems
}

export function moveToolbarLayoutItemToIndex(
  items: ToolbarLayoutItem[],
  itemId: string,
  targetIndex: number,
): ToolbarLayoutItem[] {
  const fromIndex = items.findIndex((item) => item.id === itemId)
  if (fromIndex < 0) return items
  const boundedTarget = Math.max(0, Math.min(items.length, targetIndex))
  const adjustedTarget = boundedTarget > fromIndex ? boundedTarget - 1 : boundedTarget
  if (adjustedTarget === fromIndex) return items
  const nextItems = [...items]
  const [item] = nextItems.splice(fromIndex, 1)
  nextItems.splice(Math.max(0, Math.min(nextItems.length, adjustedTarget)), 0, item)
  return nextItems
}

export function insertToolbarLayoutItemAtIndex(
  items: ToolbarLayoutItem[],
  item: ToolbarLayoutItem,
  targetIndex: number,
): ToolbarLayoutItem[] {
  if (item.type === 'tool' && items.some((candidate) => candidate.type === 'tool' && candidate.toolId === item.toolId)) {
    return items
  }
  const nextItems = [...items]
  const boundedTarget = Math.max(0, Math.min(nextItems.length, targetIndex))
  nextItems.splice(boundedTarget, 0, cloneToolbarItem(item))
  return nextItems
}

export function removeToolbarLayoutItem(items: ToolbarLayoutItem[], itemId: string): ToolbarLayoutItem[] {
  const nextItems = items.filter((item) => item.id !== itemId)
  return nextItems.length === items.length ? items : nextItems
}

export function getAvailableToolbarTools(layout: ToolbarLayout): ToolbarToolId[] {
  const used = new Set(layout.items.filter((item) => item.type === 'tool').map((item) => item.toolId))
  return TOOLBAR_TOOL_IDS.filter((toolId) => !used.has(toolId))
}

export function getToolbarLayoutGroups(items: ToolbarLayoutItem[]): ToolbarLayoutItem[][] {
  return getToolbarLayoutRenderSegments(items).flatMap((segment) => (
    segment.type === 'group' ? [segment.items] : []
  ))
}

export function getToolbarLayoutRenderSegments(items: ToolbarLayoutItem[]): ToolbarLayoutRenderSegment[] {
  const segments: ToolbarLayoutRenderSegment[] = []
  let group: ToolbarLayoutItem[] = []

  const flushGroup = () => {
    if (group.length === 0) return
    segments.push({
      type: 'group',
      id: `group-${segments.length}-${group.map((item) => item.id).join('-')}`,
      items: group,
    })
    group = []
  }

  items.forEach((item) => {
    if (item.type === 'spacer') {
      flushGroup()
      segments.push({ type: 'spacer', id: item.id })
      return
    }
    group.push(item)
  })
  flushGroup()

  return segments
}

export function getToolbarGroupClassName(group: ToolbarLayoutItem[]): string {
  const toolIds = group.flatMap((item) => (item.type === 'tool' ? [item.toolId] : []))
  return [
    'toastui-editor-toolbar-group',
    toolIds.some((toolId) => NOTE_TOOL_IDS.has(toolId)) ? 'note-tools-toolbar-group' : '',
    toolIds.some((toolId) => HISTORY_TOOL_IDS.has(toolId)) ? 'editor-history-toolbar-group' : '',
    toolIds.some((toolId) => FORMAT_TOOL_IDS.has(toolId)) ? 'note-format-toolbar-group' : '',
    toolIds.includes('clear') ? 'clear-note-toolbar-group' : '',
  ].filter(Boolean).join(' ')
}
