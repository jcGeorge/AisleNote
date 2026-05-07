import { type DragEvent as ReactDragEvent, type MouseEvent, type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Editor } from '@toast-ui/editor'
import JSZip from 'jszip'
import '@toast-ui/editor/dist/toastui-editor.css'
import './App.css'
import { appStateStore } from './storage/app-state-store'

type AppTheme = 'dark' | 'light'
type ViewMode = 'spaces' | 'main' | 'trash' | 'settings'
type ShortcutId = 'toggleTabTrash' | 'openSpaces' | 'newSubTab' | 'cycleSubTabNext' | 'cycleSubTabPrev'

type SubTab = {
  id: string
  title: string
  content: string
}

type Tab = {
  id: string
  title: string
  homeContent: string
  activeSubTabId: string | null
  subTabs: SubTab[]
}

type DeletedSubTabEntry = {
  id: string
  parentTabId: string
  parentTabTitle: string
  subTab: SubTab
  deletedAt: number
}

type DeletedTabEntry = {
  id: string
  tab: Tab
  deletedAt: number
}

type WorkspaceData = {
  activeTabId: string
  tabs: Tab[]
  deletedTabs: DeletedTabEntry[]
  deletedSubTabs: DeletedSubTabEntry[]
}

type SpaceSettings = {
  autoRemoveDeletedDays: number
}

type Space = {
  id: string
  name: string
  settings: SpaceSettings
  data: WorkspaceData
}

type AppState = {
  theme: AppTheme
  activeSpaceId: string
  spaces: Space[]
  hotkeys: {
    shortcuts: Record<ShortcutId, string>
    enableMouseBackForward: boolean
    enableGenericHistoryHotkeys: boolean
  }
  ui: {
    showParentHomeTab: boolean
  }
}

type PendingContent = {
  spaceId: string
  tabId: string
  subTabId: string | null
  markdown: string
}

type PendingCreatedEdit =
  | { type: 'tab'; id: string; previousTabId: string }
  | { type: 'subtab'; id: string; parentTabId: string; previousSubTabId: string | null }

type ArrangeSource = 'context' | 'press'
type ArrangeInsertPosition = 'before' | 'after'

type ArrangeDragItem =
  | { type: 'tab'; tabId: string }
  | { type: 'subtab'; parentTabId: string; subTabId: string }

type ArrangeModeState = {
  active: boolean
  source: ArrangeSource | null
  dragItem: ArrangeDragItem | null
  overParentTabId: string | null
  overParentInsert: ArrangeInsertPosition | null
  overSubTabId: string | null
  overSubTabInsert: ArrangeInsertPosition | null
}

type ToastTone = 'success' | 'warning' | 'error'

type ToastState = {
  id: number
  message: string
  tone: ToastTone
}

type ImageToolsState = {
  visible: boolean
  cropTop: number
  cropLeft: number
  resizeTop: number
  resizeLeft: number
}

type InlineCropState = {
  active: boolean
  relX: number
  relY: number
  relWidth: number
  relHeight: number
  top: number
  left: number
  width: number
  height: number
}

type LinkPromptState = {
  open: boolean
  top: number
  left: number
  url: string
  text: string
}

type ContextMenuState =
  | { x: number; y: number; type: 'tab'; tabId: string }
  | { x: number; y: number; type: 'subtab'; tabId: string; subTabId: string }
  | {
      x: number
      y: number
      type: 'trash-tab'
      source: 'deleted-tab' | 'subtabs-only'
      deletedTabEntryId: string | null
      parentTabId: string
    }
  | {
      x: number
      y: number
      type: 'trash-subtab'
      source: 'deleted-tab' | 'subtabs-only'
      deletedTabEntryId: string | null
      parentTabId: string
      subTabId: string
    }
  | { x: number; y: number; type: 'space'; spaceId: string }

type DeleteTarget =
  | { type: 'tab'; tabId: string }
  | { type: 'subtab'; tabId: string; subTabId: string }
  | { type: 'trash-tab'; source: 'deleted-tab' | 'subtabs-only'; deletedTabEntryId: string | null; parentTabId: string }
  | {
      type: 'trash-subtab'
      source: 'deleted-tab' | 'subtabs-only'
      deletedTabEntryId: string | null
      parentTabId: string
      subTabId: string
    }
  | { type: 'space'; spaceId: string }

type ModalState =
  | { type: 'delete-target'; target: DeleteTarget; permanent: boolean }
  | { type: 'trash-delete-all' }
  | { type: 'trash-restore-all' }

type TrashParentBucket = {
  id: string
  title: string
  source: 'deleted-tab' | 'subtabs-only'
  deletedTabEntryId: string | null
  parentTabId: string
  homeContent: string
  subTabs: SubTab[]
}

type NavLocation = {
  viewMode: ViewMode
  activeSpaceId: string
  mainTabId: string
  mainSubTabId: string | null
  trashTabId: string
  trashSubTabId: string | null
}

const TRASH_HOME_ID = '__trash_home__'
const DEFAULT_AUTO_REMOVE_DAYS = 7
const MIN_AUTO_REMOVE_DAYS = 1
const MAX_AUTO_REMOVE_DAYS = 365
const ARRANGE_PRESS_DELAY_MS = 380
const DEFAULT_ARRANGE_MODE: ArrangeModeState = {
  active: false,
  source: null,
  dragItem: null,
  overParentTabId: null,
  overParentInsert: null,
  overSubTabId: null,
  overSubTabInsert: null,
}
const DEFAULT_SHORTCUTS: Record<ShortcutId, string> = {
  toggleTabTrash: 'Mod+T',
  openSpaces: 'Mod+S',
  newSubTab: 'Mod+N',
  cycleSubTabNext: 'Ctrl+Tab',
  cycleSubTabPrev: 'Ctrl+Shift+Tab',
}
const INDENT_TOKEN = '\u2060\u2003\u2003'
const INDENT_PREFIX_PATTERN = /^(?:\u2060\u2003\u2003|\u2003\u2003|\u00A0{1,4}| {1,4}|\t)/
const EXPORT_TAB_SPACES = '    '
const DEFAULT_UI_SETTINGS: AppState['ui'] = {
  showParentHomeTab: true,
}

function normalizeShortcutValue(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : fallback
}

function normalizeHotkeySettings(raw: unknown): AppState['hotkeys'] {
  const fallback: AppState['hotkeys'] = {
    shortcuts: DEFAULT_SHORTCUTS,
    enableMouseBackForward: true,
    enableGenericHistoryHotkeys: true,
  }
  if (!raw || typeof raw !== 'object') return fallback
  const obj = raw as Record<string, unknown>
  const rawShortcuts = obj.shortcuts && typeof obj.shortcuts === 'object' ? (obj.shortcuts as Record<string, unknown>) : {}

  const shortcuts = Object.entries(DEFAULT_SHORTCUTS).reduce<Record<ShortcutId, string>>((acc, [key, value]) => {
    const shortcutKey = key as ShortcutId
    acc[shortcutKey] = normalizeShortcutValue(rawShortcuts[key], value)
    return acc
  }, {} as Record<ShortcutId, string>)

  return {
    shortcuts,
    enableMouseBackForward: typeof obj.enableMouseBackForward === 'boolean' ? obj.enableMouseBackForward : true,
    enableGenericHistoryHotkeys:
      typeof obj.enableGenericHistoryHotkeys === 'boolean' ? obj.enableGenericHistoryHotkeys : true,
  }
}

function normalizeUiSettings(raw: unknown): AppState['ui'] {
  if (!raw || typeof raw !== 'object') return DEFAULT_UI_SETTINGS
  const obj = raw as Record<string, unknown>
  return {
    showParentHomeTab:
      typeof obj.showParentHomeTab === 'boolean' ? obj.showParentHomeTab : DEFAULT_UI_SETTINGS.showParentHomeTab,
  }
}

function isModifierToken(token: string): boolean {
  return token === 'mod' || token === 'ctrl' || token === 'meta' || token === 'alt' || token === 'shift'
}

function getIndentPrefixLength(text: string): number {
  const match = text.match(INDENT_PREFIX_PATTERN)
  return match ? match[0].length : 0
}

function countLeadingIndentUnits(text: string): number {
  let count = 0
  let remaining = text
  while (true) {
    const length = getIndentPrefixLength(remaining)
    if (length <= 0) return count
    count += 1
    remaining = remaining.slice(length)
  }
}

function stripAllIndentPrefixes(text: string): string {
  let remaining = text
  while (true) {
    const length = getIndentPrefixLength(remaining)
    if (length <= 0) return remaining
    remaining = remaining.slice(length)
  }
}

function buildNormalizedIndentPrefix(levels: number): string {
  return levels > 0 ? INDENT_TOKEN.repeat(levels) : ''
}

function getTrailingIndentPrefixLength(text: string): number {
  const match = text.match(/(?:\u2060\u2003\u2003|\u2003\u2003|\u00A0{1,4}| {1,4}|\t)$/)
  return match ? match[0].length : 0
}

function repairBrokenDataImageMarkdown(markdown: string): string {
  let next = String(markdown ?? '')

  next = next.replace(/!\[([^\]]*)\]\(dat\s*\n+\s*(a:image\/[a-zA-Z0-9+.-]+;base64,[^)]+)\)/g, '![$1](dat$2)')
  next = next.replace(/!\[([^\]]*)\]\(\s*(data:image\/[a-zA-Z0-9+.-]+;base64,[\s\S]*?)\)/g, (_all, alt: string, src: string) => {
    const collapsed = src.replace(/\s+/g, '')
    return `![${alt}](${collapsed})`
  })

  return next
}

function normalizeMarkdownForPersistence(markdown: string): string {
  const repaired = repairBrokenDataImageMarkdown(markdown)
  return repaired.replace(/(?<!\u2060)\u2003\u2003/g, INDENT_TOKEN)
}

function convertInternalTabsForExport(markdown: string): string {
  return String(markdown ?? '')
    .replace(/\u2060\u2003\u2003/g, EXPORT_TAB_SPACES)
    .replace(/\u2003\u2003/g, EXPORT_TAB_SPACES)
    .replace(/\u00A0/g, ' ')
}

function mergeLeadingIndentsFromWysiwyg(editor: Editor | null, markdown: string): string {
  const wwView = (editor as any)?.wwEditor?.view
  if (!wwView?.state?.doc || !markdown) return markdown

  const indentedBlockQueue = new Map<string, string[]>()
  wwView.state.doc.nodesBetween(0, wwView.state.doc.content.size, (node: any) => {
    if (!node?.isTextblock) return
    const text = node.textContent ?? ''
    const indentLevels = countLeadingIndentUnits(text)
    if (indentLevels <= 0) return
    const plain = stripAllIndentPrefixes(text)
    if (!plain) return
    const indentPrefix = buildNormalizedIndentPrefix(indentLevels)
    const existing = indentedBlockQueue.get(plain) ?? []
    existing.push(indentPrefix)
    indentedBlockQueue.set(plain, existing)
  })

  if (indentedBlockQueue.size === 0) return markdown

  const nextLines = markdown.split('\n').map((line) => {
    const plain = stripAllIndentPrefixes(line)
    const queue = indentedBlockQueue.get(plain)
    if (!queue || queue.length === 0) return line
    const indentPrefix = queue.shift() ?? ''
    return `${indentPrefix}${plain}`
  })

  return nextLines.join('\n')
}

function getEventKeyToken(event: KeyboardEvent): string | null {
  if (event.code === 'Backquote') return 'Backquote'
  if (event.key === 'Tab') return 'Tab'
  if (event.key.length === 1) return event.key.toUpperCase()
  return null
}

function eventMatchesShortcut(event: KeyboardEvent, shortcut: string, isMac: boolean): boolean {
  const tokens = shortcut
    .split('+')
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0)
  if (tokens.length === 0) return false

  const keyToken = tokens.find((token) => !isModifierToken(token))
  if (!keyToken) return false

  const requiresMod = tokens.includes('mod')
  const requiresCtrl = tokens.includes('ctrl')
  const requiresMeta = tokens.includes('meta')
  const requiresAlt = tokens.includes('alt')
  const requiresShift = tokens.includes('shift')

  const expectedCtrl = requiresCtrl || (requiresMod && !isMac)
  const expectedMeta = requiresMeta || (requiresMod && isMac)

  if (event.ctrlKey !== expectedCtrl) return false
  if (event.metaKey !== expectedMeta) return false
  if (event.altKey !== requiresAlt) return false
  if (event.shiftKey !== requiresShift) return false

  const eventToken = getEventKeyToken(event)
  if (!eventToken) return false
  return eventToken.toLowerCase() === keyToken
}

function buildShortcutFromKeyboardEvent(event: KeyboardEvent, isMac: boolean): string | null {
  const keyToken = getEventKeyToken(event)
  if (!keyToken) return null

  const parts: string[] = []
  const usesPrimaryMod = isMac ? event.metaKey : event.ctrlKey
  if (usesPrimaryMod) parts.push('Mod')
  if (event.ctrlKey && !(usesPrimaryMod && !isMac)) parts.push('Ctrl')
  if (event.metaKey && !(usesPrimaryMod && isMac)) parts.push('Meta')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  parts.push(keyToken)
  return parts.join('+')
}

function formatShortcutLabel(shortcut: string, isMac: boolean): string {
  return shortcut
    .split('+')
    .map((token) => {
      const lower = token.toLowerCase()
      if (lower === 'mod') return isMac ? 'cmd' : 'ctrl'
      if (lower === 'meta') return 'cmd'
      if (lower === 'ctrl') return 'ctrl'
      if (lower === 'alt') return isMac ? 'option' : 'alt'
      if (lower === 'shift') return 'shift'
      if (lower === 'backquote') return '`'
      return token.length === 1 ? token.toLowerCase() : token.toLowerCase()
    })
    .join('+')
}

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function getArrangeInsertPositionFromClientX(clientX: number, rect: DOMRect): ArrangeInsertPosition {
  return clientX < rect.left + rect.width / 2 ? 'before' : 'after'
}

function moveItemByInsertion<T>(
  items: T[],
  fromIndex: number,
  targetIndex: number,
  position: ArrangeInsertPosition,
): T[] {
  if (fromIndex < 0 || targetIndex < 0 || fromIndex === targetIndex) return items
  const nextItems = [...items]
  const [movedItem] = nextItems.splice(fromIndex, 1)
  const rawInsertIndex = targetIndex + (position === 'after' ? 1 : 0)
  const insertIndex = fromIndex < rawInsertIndex ? rawInsertIndex - 1 : rawInsertIndex
  nextItems.splice(insertIndex, 0, movedItem)
  return nextItems
}

function getArrangeRailInsertionTarget(
  rail: HTMLElement,
  selector: string,
  attributeName: string,
  clientX: number,
  clientY: number,
): { targetId: string; position: ArrangeInsertPosition } | null {
  const elements = Array.from(rail.querySelectorAll<HTMLElement>(selector))
  if (elements.length === 0) return null

  const rects = elements.map((element) => ({
    element,
    rect: element.getBoundingClientRect(),
    id: element.getAttribute(attributeName) ?? '',
  }))
  const validRects = rects.filter((entry) => entry.id)
  if (validRects.length === 0) return null

  const closestRowAnchor = validRects.reduce((closest, current) => {
    const closestDistance = Math.abs(clientY - (closest.rect.top + closest.rect.height / 2))
    const currentDistance = Math.abs(clientY - (current.rect.top + current.rect.height / 2))
    return currentDistance < closestDistance ? current : closest
  })

  const rowRects = validRects
    .filter((entry) => Math.abs(entry.rect.top - closestRowAnchor.rect.top) <= 6)
    .sort((left, right) => left.rect.left - right.rect.left)

  if (rowRects.length === 0) return null

  for (const entry of rowRects) {
    const midpoint = entry.rect.left + entry.rect.width / 2
    if (clientX < midpoint) {
      return {
        targetId: entry.id,
        position: 'before',
      }
    }
  }

  const lastEntry = rowRects[rowRects.length - 1]
  return {
    targetId: lastEntry.id,
    position: 'after',
  }
}

function createSubTab(title = 'tab', content?: string): SubTab {
  return {
    id: createId(),
    title,
    content: content ?? '',
  }
}

function createTab(title = 'tab'): Tab {
  return {
    id: createId(),
    title,
    homeContent: '',
    activeSubTabId: null,
    subTabs: [],
  }
}

function clampAutoRemoveDays(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_AUTO_REMOVE_DAYS
  return Math.min(MAX_AUTO_REMOVE_DAYS, Math.max(MIN_AUTO_REMOVE_DAYS, Math.floor(value)))
}

function normalizeHeadingMarkers(markdown: string): string {
  const lines = markdown.split('\n')
  let inFencedCode = false
  let changed = false

  const nextLines = lines.map((line) => {
    if (/^\s*```/.test(line)) {
      inFencedCode = !inFencedCode
      return line
    }
    if (inFencedCode) return line

    const match = line.match(/^\s*(#{1,6})(.*)$/)
    if (!match) return line

    const hashes = match[1]
    const remainder = match[2]
    if (remainder.length > 0 && !/^\s/.test(remainder)) return line

    const normalized = remainder.trim().length > 0 ? `${hashes} ${remainder.trim()}` : `${hashes} `
    if (normalized !== line) changed = true
    return normalized
  })

  return changed ? nextLines.join('\n') : markdown
}

function isHorizontalRuleMarkerLine(line: string): boolean {
  return /^\s*(?:-{3,}|\*{3,})\s*$/.test(line)
}

function materializeHorizontalRuleShortcut(previousMarkdown: string, currentMarkdown: string): string | null {
  if (currentMarkdown.length <= previousMarkdown.length) return null

  let prefixLength = 0
  while (
    prefixLength < previousMarkdown.length &&
    prefixLength < currentMarkdown.length &&
    previousMarkdown[prefixLength] === currentMarkdown[prefixLength]
  ) {
    prefixLength += 1
  }

  let suffixLength = 0
  while (
    suffixLength < previousMarkdown.length - prefixLength &&
    suffixLength < currentMarkdown.length - prefixLength &&
    previousMarkdown[previousMarkdown.length - 1 - suffixLength] === currentMarkdown[currentMarkdown.length - 1 - suffixLength]
  ) {
    suffixLength += 1
  }

  const inserted = currentMarkdown.slice(prefixLength, currentMarkdown.length - suffixLength)
  const removed = previousMarkdown.slice(prefixLength, previousMarkdown.length - suffixLength)
  if (removed.length > 0) return null
  if (!inserted.includes('\n')) return null
  if (/[^\n]/.test(inserted)) return null

  const lineStart = currentMarkdown.lastIndexOf('\n', prefixLength - 1) + 1
  const lineBeforeInsertedNewline = currentMarkdown.slice(lineStart, prefixLength)
  if (!isHorizontalRuleMarkerLine(lineBeforeInsertedNewline)) return null

  const lineIndentMatch = lineBeforeInsertedNewline.match(/^(\s*)/)
  const indent = lineIndentMatch?.[1] ?? ''
  const beforeLine = currentMarkdown.slice(0, lineStart)
  const afterInsertedNewlines = currentMarkdown.slice(prefixLength + inserted.length)
  const normalizedRuleBlock = `${indent}---\n\n`
  return `${beforeLine}${normalizedRuleBlock}${afterInsertedNewlines}`
}

function thematicBreakShortcutPlugin(context: {
  pmKeymap: { keymap: (bindings: Record<string, unknown>) => unknown }
  pmModel: { Fragment: { fromArray: (nodes: unknown[]) => unknown } }
  pmState: {
    Selection: { near: (resolvedPos: unknown, bias?: number) => unknown }
  }
  instance: {
    getMarkdown: () => string
    setMarkdown: (markdown: string, cursorToEnd?: boolean) => void
    setSelection: (start: number | [number, number], end?: number | [number, number]) => void
    convertPosToMatchEditorMode: (
      start: number | [number, number],
      end?: number | [number, number],
      mode?: 'markdown' | 'wysiwyg',
    ) => [number | [number, number], number | [number, number]]
    isWysiwygMode: () => boolean
  }
}) {
  const { keymap } = context.pmKeymap
  const { Fragment } = context.pmModel
  const { Selection } = context.pmState

  return {
    wysiwygPlugins: [
      () =>
        keymap({
          Enter: (state: {
            selection: {
              empty: boolean
              $from: {
                parent: { textContent: string; type: { name: string } }
                depth: number
                before: (depth: number) => number
                after: (depth: number) => number
              }
            }
            schema: { nodes: Record<string, { create: () => unknown } | undefined> }
            tr: {
              replaceWith: (from: number, to: number, content: unknown) => unknown
              doc: { resolve: (pos: number) => unknown; content: { size: number } }
              setSelection: (selection: unknown) => unknown
              scrollIntoView: () => unknown
            }
          }, dispatch?: (tr: unknown) => void) => {
            const { selection, schema, tr } = state
            if (!selection.empty) return false

            const { $from } = selection
            if ($from.parent.type.name !== 'paragraph') return false

            const currentLine = ($from.parent.textContent ?? '').replace(/\u200b/g, '')
            if (!isHorizontalRuleMarkerLine(currentLine)) return false

            const thematicBreakNode = schema.nodes.thematicBreak?.create()
            const paragraphNode = schema.nodes.paragraph?.create()
            if (!thematicBreakNode || !paragraphNode) return false

            const blockDepth = $from.depth
            const from = $from.before(blockDepth)
            const to = $from.after(blockDepth)

            const nextTr = tr.replaceWith(from, to, Fragment.fromArray([thematicBreakNode, paragraphNode])) as {
              doc: { resolve: (pos: number) => unknown; content: { size: number } }
              setSelection: (selection: unknown) => unknown
              scrollIntoView: () => unknown
            }

            const selectionPos = Math.min(from + 2, nextTr.doc.content.size)
            const nextSelection = Selection.near(nextTr.doc.resolve(selectionPos), 1)
            const nextTrWithSelection = nextTr.setSelection(nextSelection) as {
              scrollIntoView: () => unknown
            }
            dispatch?.(nextTrWithSelection.scrollIntoView())
            return true
          },
        }),
    ],
  }
}

const EDITOR_TOOLBAR_ITEMS: string[][] = [
  ['heading', 'bold', 'italic', 'strike'],
  ['hr', 'quote'],
  ['ul', 'ol', 'task'],
  ['table', 'image', 'link'],
  ['code', 'codeblock'],
]

let renameInputMeasureContext: CanvasRenderingContext2D | null = null

function createDefaultWorkspaceData(): WorkspaceData {
  const welcomeTabId = 'home-tab'
  return {
    activeTabId: welcomeTabId,
    tabs: [
      {
        id: welcomeTabId,
        title: 'Welcome',
        homeContent:
          '- This is the hidden home note for this top-level tab.\n- Click this parent tab to edit this note.\n- Sub-tabs are separate notes and start empty.\n',
        activeSubTabId: null,
        subTabs: [createSubTab('Checklist', '1. Add parent tab\n2. Add sub-tab\n3. Each note keeps separate content\n')],
      },
    ],
    deletedTabs: [],
    deletedSubTabs: [],
  }
}

function createSpace(name: string): Space {
  return {
    id: createId(),
    name,
    settings: { autoRemoveDeletedDays: DEFAULT_AUTO_REMOVE_DAYS },
    data: createDefaultWorkspaceData(),
  }
}

function applyAutoPurgeToWorkspace(data: WorkspaceData, autoRemoveDeletedDays: number): WorkspaceData {
  const cutoff = Date.now() - clampAutoRemoveDays(autoRemoveDeletedDays) * 24 * 60 * 60 * 1000
  return {
    ...data,
    deletedTabs: data.deletedTabs.filter((entry) => entry.deletedAt >= cutoff),
    deletedSubTabs: data.deletedSubTabs.filter((entry) => entry.deletedAt >= cutoff),
  }
}

function normalizeWorkspaceData(raw: unknown): WorkspaceData {
  const fallback = createDefaultWorkspaceData()
  if (!raw || typeof raw !== 'object') return fallback

  const obj = raw as Record<string, unknown>
  const rawTabs = Array.isArray(obj.tabs) ? obj.tabs : []
  const tabs: Tab[] = rawTabs
    .map((rawTab, index) => {
      if (!rawTab || typeof rawTab !== 'object') return null
      const tabLike = rawTab as Record<string, unknown>
      const tabId = typeof tabLike.id === 'string' ? tabLike.id : `tab-${index}-${createId()}`
      const tabTitle = typeof tabLike.title === 'string' && tabLike.title.trim() ? tabLike.title : `Tab ${index + 1}`
      const rawSubTabs = Array.isArray(tabLike.subTabs) ? tabLike.subTabs : []
      const normalizedSubTabs: Array<SubTab & { isHome: boolean }> = rawSubTabs
        .filter((sub): sub is Record<string, unknown> => Boolean(sub) && typeof sub === 'object')
        .map((sub, subIndex) => ({
          id: typeof sub.id === 'string' ? sub.id : `${tabId}-sub-${subIndex}-${createId()}`,
          title: typeof sub.title === 'string' && sub.title.trim() ? sub.title : `Note ${subIndex + 1}`,
          content: typeof sub.content === 'string' ? sub.content : '',
          isHome: Boolean(sub.isHome),
        }))
      const legacyHome = normalizedSubTabs.find((sub) => sub.isHome)
      const visibleSubTabs = normalizedSubTabs
        .filter((sub) => !sub.isHome)
        .map(({ id, title, content }) => ({ id, title, content: normalizeMarkdownForPersistence(content) }))
      const explicitHome = typeof tabLike.homeContent === 'string' ? tabLike.homeContent : ''
      const homeContent = normalizeMarkdownForPersistence(explicitHome || legacyHome?.content || '')
      const rawActiveSubTabId = typeof tabLike.activeSubTabId === 'string' ? tabLike.activeSubTabId : null
      const activeSubTabId =
        rawActiveSubTabId && visibleSubTabs.some((sub) => sub.id === rawActiveSubTabId) ? rawActiveSubTabId : null
      return {
        id: tabId,
        title: tabTitle,
        homeContent,
        activeSubTabId,
        subTabs: visibleSubTabs,
      }
    })
    .filter((tab): tab is Tab => tab !== null)

  const safeTabs = tabs.length > 0 ? tabs : fallback.tabs
  const rawActiveTabId = typeof obj.activeTabId === 'string' ? obj.activeTabId : null
  const activeTabId = rawActiveTabId && safeTabs.some((tab) => tab.id === rawActiveTabId) ? rawActiveTabId : safeTabs[0].id

  const rawDeletedTabs = Array.isArray(obj.deletedTabs) ? obj.deletedTabs : []
  const deletedTabs: DeletedTabEntry[] = rawDeletedTabs
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .map((entry, index) => {
      // Backward compatibility:
      // old shape: deletedTabs: Tab[]
      // new shape: deletedTabs: { id, tab, deletedAt }[]
      const maybeTab = entry.tab && typeof entry.tab === 'object' ? (entry.tab as Record<string, unknown>) : entry
      const id = typeof entry.id === 'string' ? entry.id : `deleted-tab-${index}-${createId()}`
      const title = typeof maybeTab.title === 'string' && maybeTab.title.trim() ? maybeTab.title : `deleted tab ${index + 1}`
      const homeContent = normalizeMarkdownForPersistence(typeof maybeTab.homeContent === 'string' ? maybeTab.homeContent : '')
      const rawSubTabs = Array.isArray(maybeTab.subTabs) ? maybeTab.subTabs : []
      const subTabs: SubTab[] = rawSubTabs
        .filter((sub): sub is Record<string, unknown> => Boolean(sub) && typeof sub === 'object')
        .map((sub, subIndex) => ({
          id: typeof sub.id === 'string' ? sub.id : `${id}-sub-${subIndex}-${createId()}`,
          title: typeof sub.title === 'string' && sub.title.trim() ? sub.title : `Note ${subIndex + 1}`,
          content: normalizeMarkdownForPersistence(typeof sub.content === 'string' ? sub.content : ''),
        }))
      const rawDeletedActive = typeof maybeTab.activeSubTabId === 'string' ? maybeTab.activeSubTabId : null
      const activeSubTabId = rawDeletedActive && subTabs.some((sub) => sub.id === rawDeletedActive) ? rawDeletedActive : null
      const tabId = typeof maybeTab.id === 'string' ? maybeTab.id : `deleted-tab-inner-${index}-${createId()}`
      const deletedAt =
        typeof entry.deletedAt === 'number' && Number.isFinite(entry.deletedAt) ? entry.deletedAt : Date.now()
      return {
        id,
        deletedAt,
        tab: {
          id: tabId,
          title,
          homeContent,
          activeSubTabId,
          subTabs,
        },
      }
    })

  const rawDeletedSubTabs = Array.isArray(obj.deletedSubTabs) ? obj.deletedSubTabs : []
  const deletedSubTabs: DeletedSubTabEntry[] = rawDeletedSubTabs
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .map((entry, index) => {
      const sub = entry.subTab && typeof entry.subTab === 'object' ? (entry.subTab as Record<string, unknown>) : {}
      return {
        id: typeof entry.id === 'string' ? entry.id : `deleted-subtab-${index}-${createId()}`,
        parentTabId: typeof entry.parentTabId === 'string' ? entry.parentTabId : `unknown-parent-${index}`,
        parentTabTitle:
          typeof entry.parentTabTitle === 'string' && entry.parentTabTitle.trim() ? entry.parentTabTitle : 'Unknown Tab',
        deletedAt:
          typeof entry.deletedAt === 'number' && Number.isFinite(entry.deletedAt) ? entry.deletedAt : Date.now(),
        subTab: {
          id: typeof sub.id === 'string' ? sub.id : `deleted-note-${index}-${createId()}`,
          title: typeof sub.title === 'string' && sub.title.trim() ? sub.title : `deleted note ${index + 1}`,
          content: normalizeMarkdownForPersistence(typeof sub.content === 'string' ? sub.content : ''),
        },
      }
    })

  return {
    activeTabId,
    tabs: safeTabs,
    deletedTabs,
    deletedSubTabs,
  }
}

const DEFAULT_STATE: AppState = {
  theme: 'dark',
  activeSpaceId: 'getting-started-space',
  spaces: [
    {
      id: 'getting-started-space',
      name: 'Getting Started',
      settings: { autoRemoveDeletedDays: DEFAULT_AUTO_REMOVE_DAYS },
      data: createDefaultWorkspaceData(),
    },
  ],
  hotkeys: {
    shortcuts: DEFAULT_SHORTCUTS,
    enableMouseBackForward: true,
    enableGenericHistoryHotkeys: true,
  },
  ui: DEFAULT_UI_SETTINGS,
}

function parseSavedState(raw: string | null): AppState {
  if (!raw) return DEFAULT_STATE

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const theme: AppTheme = parsed.theme === 'light' ? 'light' : 'dark'

    if (Array.isArray(parsed.spaces) && parsed.spaces.length > 0) {
      const spaces: Space[] = parsed.spaces
        .filter((space): space is Record<string, unknown> => Boolean(space) && typeof space === 'object')
        .map((space, index) => {
          const id = typeof space.id === 'string' ? space.id : `space-${index}-${createId()}`
          const name = typeof space.name === 'string' && space.name.trim() ? space.name : `Space ${index + 1}`
          const rawSettings =
            space.settings && typeof space.settings === 'object' ? (space.settings as Record<string, unknown>) : {}
          const settings: SpaceSettings = {
            autoRemoveDeletedDays: clampAutoRemoveDays(
              typeof rawSettings.autoRemoveDeletedDays === 'number'
                ? rawSettings.autoRemoveDeletedDays
                : DEFAULT_AUTO_REMOVE_DAYS,
            ),
          }
          const data = applyAutoPurgeToWorkspace(normalizeWorkspaceData(space.data), settings.autoRemoveDeletedDays)
          return {
            id,
            name,
            settings,
            data,
          }
        })

      if (spaces.length === 0) return { ...DEFAULT_STATE, theme }

      const rawActiveSpaceId = typeof parsed.activeSpaceId === 'string' ? parsed.activeSpaceId : null
      const activeSpaceId =
        rawActiveSpaceId && spaces.some((space) => space.id === rawActiveSpaceId) ? rawActiveSpaceId : spaces[0].id

      return {
        theme,
        activeSpaceId,
        spaces,
        hotkeys: normalizeHotkeySettings(parsed.hotkeys),
        ui: normalizeUiSettings(parsed.ui),
      }
    }

    // Legacy single-workspace migration
    const migratedSpace: Space = {
      id: 'getting-started-space',
      name: 'Getting Started',
      settings: { autoRemoveDeletedDays: DEFAULT_AUTO_REMOVE_DAYS },
      data: applyAutoPurgeToWorkspace(normalizeWorkspaceData(parsed), DEFAULT_AUTO_REMOVE_DAYS),
    }
    return {
      theme,
      activeSpaceId: migratedSpace.id,
      spaces: [migratedSpace],
      hotkeys: normalizeHotkeySettings(parsed.hotkeys),
      ui: normalizeUiSettings(parsed.ui),
    }
  } catch {
    return DEFAULT_STATE
  }
}

function applyMarkdownToAppState(
  previous: AppState,
  spaceId: string,
  tabId: string,
  subTabId: string | null,
  markdown: string,
): AppState {
  const normalizedMarkdown = normalizeMarkdownForPersistence(markdown)
  let stateChanged = false

  const spaces = previous.spaces.map((space) => {
    if (space.id !== spaceId) return space

    let spaceChanged = false
    const data = space.data
    const tabs = data.tabs.map((tab) => {
      if (tab.id !== tabId) return tab

      if (subTabId === null) {
        if (tab.homeContent === normalizedMarkdown) return tab
        spaceChanged = true
        return { ...tab, homeContent: normalizedMarkdown }
      }

      let tabChanged = false
      const subTabs = tab.subTabs.map((sub) => {
        if (sub.id !== subTabId || sub.content === normalizedMarkdown) return sub
        tabChanged = true
        return { ...sub, content: normalizedMarkdown }
      })

      if (!tabChanged) return tab
      spaceChanged = true
      return { ...tab, subTabs }
    })

    if (!spaceChanged) return space
    stateChanged = true
    return { ...space, data: { ...data, tabs } }
  })

  return stateChanged ? { ...previous, spaces } : previous
}

function App() {
  const initialSerializedState = useMemo(() => appStateStore.load(), [])
  const [state, setState] = useState<AppState>(() => parseSavedState(initialSerializedState))
  const [storageHydrated, setStorageHydrated] = useState(() => typeof appStateStore.hydrate !== 'function')
  const [viewMode, setViewMode] = useState<ViewMode>('spaces')
  const [editing, setEditing] = useState<{ type: 'tab' | 'subtab' | 'space'; id: string } | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [modal, setModal] = useState<ModalState | null>(null)
  const [spaceDeleteAcknowledge, setSpaceDeleteAcknowledge] = useState(false)
  const [settingsDaysDraft, setSettingsDaysDraft] = useState<string>(String(DEFAULT_AUTO_REMOVE_DAYS))
  const isMacPlatform = typeof navigator !== 'undefined' ? /mac/i.test(navigator.platform) : false
  const [shortcutDrafts, setShortcutDrafts] = useState<Record<ShortcutId, string>>(DEFAULT_SHORTCUTS)
  const [editingShortcut, setEditingShortcut] = useState<ShortcutId | null>(null)
  const [mouseBackForwardEnabledDraft, setMouseBackForwardEnabledDraft] = useState(true)
  const [genericHistoryHotkeysEnabledDraft, setGenericHistoryHotkeysEnabledDraft] = useState(true)
  const [showParentHomeTabDraft, setShowParentHomeTabDraft] = useState(DEFAULT_UI_SETTINGS.showParentHomeTab)
  const [menuOpen, setMenuOpen] = useState(false)
  const [trashTabId, setTrashTabId] = useState<string>(TRASH_HOME_ID)
  const [trashSubTabId, setTrashSubTabId] = useState<string | null>(null)
  const [arrangeMode, setArrangeMode] = useState<ArrangeModeState>(DEFAULT_ARRANGE_MODE)
  const [exportStatus, setExportStatus] = useState<string>('')
  const [toast, setToast] = useState<ToastState | null>(null)
  const [imageTools, setImageTools] = useState<ImageToolsState>({
    visible: false,
    cropTop: 0,
    cropLeft: 0,
    resizeTop: 0,
    resizeLeft: 0,
  })
  const [inlineCrop, setInlineCrop] = useState<InlineCropState>({
    active: false,
    relX: 0,
    relY: 0,
    relWidth: 1,
    relHeight: 1,
    top: 0,
    left: 0,
    width: 0,
    height: 0,
  })
  const [linkPrompt, setLinkPrompt] = useState<LinkPromptState>({
    open: false,
    top: 0,
    left: 0,
    url: '',
    text: '',
  })
  const linkPromptInputRef = useRef<HTMLInputElement | null>(null)

  const editorMountRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<Editor | null>(null)
  const primaryTabRailRef = useRef<HTMLDivElement | null>(null)
  const subTabRailRef = useRef<HTMLDivElement | null>(null)
  const activeImageRef = useRef<HTMLImageElement | null>(null)
  const imageResizeRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const inlineCropDragRef = useRef<{
    mode: 'move' | 'resize' | null
    startX: number
    startY: number
    startRelX: number
    startRelY: number
    startRelWidth: number
    startRelHeight: number
  }>({ mode: null, startX: 0, startY: 0, startRelX: 0, startRelY: 0, startRelWidth: 1, startRelHeight: 1 })

  const pendingContentRef = useRef<PendingContent | null>(null)
  const pendingCreatedEditRef = useRef<PendingCreatedEdit | null>(null)
  const skipRenameBlurRef = useRef<{ type: 'tab' | 'subtab' | 'space'; id: string } | null>(null)
  const arrangePressTimerRef = useRef<number | null>(null)
  const suppressArrangeClickRef = useRef<Set<string>>(new Set())
  const saveTimerRef = useRef<number | null>(null)
  const toastTimerRef = useRef<number | null>(null)
  const normalizingContentRef = useRef(false)
  const lastEditorMarkdownRef = useRef('')
  const stateRef = useRef(state)
  const initialStateJsonRef = useRef<string>(JSON.stringify(parseSavedState(initialSerializedState)))
  const stateDirtySinceBootRef = useRef(false)

  const activeSpaceIdRef = useRef<string>('')
  const activeTabIdRef = useRef<string>('')
  const activeSubTabIdRef = useRef<string | null>(null)
  const isMainViewRef = useRef(true)
  const navHistoryRef = useRef<NavLocation[]>([])
  const navIndexRef = useRef(-1)
  const isHistoryNavigationRef = useRef(false)
  const lastTabLikeViewRef = useRef<'main' | 'trash'>('main')
  stateRef.current = state

  useEffect(() => {
    if (typeof appStateStore.hydrate !== 'function') return

    let disposed = false
    Promise.resolve(
      appStateStore.hydrate((serializedState) => {
        if (disposed || stateDirtySinceBootRef.current) return
        const nextState = parseSavedState(serializedState)
        const nextSerializedState = JSON.stringify(nextState)
        initialStateJsonRef.current = nextSerializedState
        if (nextSerializedState === JSON.stringify(stateRef.current)) return
        setState(nextState)
      }),
    ).finally(() => {
      if (!disposed) {
        setStorageHydrated(true)
      }
    })

    return () => {
      disposed = true
    }
  }, [])

  useEffect(() => {
    const serializedState = JSON.stringify(state)
    stateDirtySinceBootRef.current = serializedState !== initialStateJsonRef.current
    if (!storageHydrated) return
    appStateStore.save(serializedState)
  }, [state, storageHydrated])

  useEffect(() => {
    const closeOverlays = () => {
      setContextMenu(null)
      setMenuOpen(false)
    }
    window.addEventListener('click', closeOverlays)
    window.addEventListener('resize', closeOverlays)
    window.addEventListener('scroll', closeOverlays, true)
    return () => {
      window.removeEventListener('click', closeOverlays)
      window.removeEventListener('resize', closeOverlays)
      window.removeEventListener('scroll', closeOverlays, true)
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current)
    }
    toastTimerRef.current = window.setTimeout(() => {
      toastTimerRef.current = null
      setToast(null)
    }, 2000)

    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current)
        toastTimerRef.current = null
      }
    }
  }, [toast])

  useEffect(() => {
    const isSpaceDeleteModal = modal?.type === 'delete-target' && modal.target.type === 'space'
    if (!isSpaceDeleteModal) {
      setSpaceDeleteAcknowledge(false)
    }
  }, [modal])

  const activeSpace = useMemo(
    () => state.spaces.find((space) => space.id === state.activeSpaceId) ?? state.spaces[0],
    [state.activeSpaceId, state.spaces],
  )

  const workspace = activeSpace.data

  const clearArrangePressTimer = () => {
    if (arrangePressTimerRef.current !== null) {
      window.clearTimeout(arrangePressTimerRef.current)
      arrangePressTimerRef.current = null
    }
  }

  const markArrangeClickSuppressed = (...keys: string[]) => {
    keys.forEach((key) => suppressArrangeClickRef.current.add(key))
  }

  const consumeArrangeClickSuppression = (key: string) => {
    if (!suppressArrangeClickRef.current.has(key)) return false
    suppressArrangeClickRef.current.delete(key)
    return true
  }

  const enterArrangeMode = (source: ArrangeSource, dragItem: ArrangeDragItem | null = null, suppressClickKey?: string) => {
    flushPendingContent()
    clearArrangePressTimer()
    setMenuOpen(false)
    setContextMenu(null)
    setEditing(null)
    if (suppressClickKey) {
      markArrangeClickSuppressed(suppressClickKey)
    }
    setArrangeMode({
      active: true,
      source,
      dragItem,
      overParentTabId: null,
      overParentInsert: null,
      overSubTabId: null,
      overSubTabInsert: null,
    })
  }

  const exitArrangeMode = () => {
    clearArrangePressTimer()
    suppressArrangeClickRef.current.clear()
    setArrangeMode(DEFAULT_ARRANGE_MODE)
  }

  const startArrangePress = (
    event: ReactPointerEvent<HTMLButtonElement>,
    dragItem: ArrangeDragItem | null,
    suppressClickKey: string,
  ) => {
    if (viewMode !== 'main' || editing || arrangeMode.active) return
    if (event.button !== 0) return
    clearArrangePressTimer()
    arrangePressTimerRef.current = window.setTimeout(() => {
      arrangePressTimerRef.current = null
      enterArrangeMode('press', dragItem, suppressClickKey)
    }, ARRANGE_PRESS_DELAY_MS)
  }

  const buildArrangeDragItemFromContextMenu = (): ArrangeDragItem | null => {
    if (!contextMenu) return null
    if (contextMenu.type === 'tab') {
      return { type: 'tab', tabId: contextMenu.tabId }
    }
    if (contextMenu.type === 'subtab') {
      return {
        type: 'subtab',
        parentTabId: contextMenu.tabId,
        subTabId: contextMenu.subTabId,
      }
    }
    return null
  }

  const enterArrangeModeFromContext = () => {
    const dragItem = buildArrangeDragItemFromContextMenu()
    if (!dragItem) return
    enterArrangeMode('context', dragItem)
  }

  const beginArrangeTabDrag = (event: ReactDragEvent<HTMLButtonElement>, tabId: string) => {
    if (!arrangeMode.active || viewMode !== 'main') return
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', tabId)
    markArrangeClickSuppressed(`tab:${tabId}`)
    setArrangeMode((previous) => ({
      ...previous,
      dragItem: { type: 'tab', tabId },
      overParentTabId: tabId,
      overParentInsert: 'after',
      overSubTabId: null,
      overSubTabInsert: null,
    }))
  }

  const handleArrangeTabDragOver = (event: ReactDragEvent<HTMLButtonElement>, tabId: string) => {
    if (!arrangeMode.active || !arrangeMode.dragItem) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    const position = getArrangeInsertPositionFromClientX(event.clientX, event.currentTarget.getBoundingClientRect())
    setArrangeMode((previous) =>
      previous.overParentTabId === tabId &&
      previous.overParentInsert === (previous.dragItem?.type === 'tab' ? position : previous.overParentInsert)
        ? previous
        : {
            ...previous,
            overParentTabId: tabId,
            overParentInsert: previous.dragItem?.type === 'tab' ? position : null,
            overSubTabId: null,
            overSubTabInsert: null,
          },
    )
  }

  const handleArrangeTabDrop = (event: ReactDragEvent<HTMLButtonElement>, targetTabId: string) => {
    if (!arrangeMode.active || !arrangeMode.dragItem) return
    event.preventDefault()
    if (arrangeMode.dragItem.type === 'tab') {
      const draggedTabId = arrangeMode.dragItem.tabId
      const position = getArrangeInsertPositionFromClientX(event.clientX, event.currentTarget.getBoundingClientRect())
      markArrangeClickSuppressed(`tab:${draggedTabId}`, `tab:${targetTabId}`)
      if (draggedTabId !== targetTabId) {
        updateActiveSpaceData((data) => {
          const fromIndex = data.tabs.findIndex((tab) => tab.id === draggedTabId)
          const toIndex = data.tabs.findIndex((tab) => tab.id === targetTabId)
          if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return data

          return {
            ...data,
            tabs: moveItemByInsertion(data.tabs, fromIndex, toIndex, position),
          }
        })
      }
    } else {
      const { parentTabId: sourceParentTabId, subTabId } = arrangeMode.dragItem
      markArrangeClickSuppressed(`subtab:${subTabId}`, `tab:${targetTabId}`)
      if (sourceParentTabId !== targetTabId) {
        updateActiveSpaceData((data) => {
          const sourceParent = data.tabs.find((tab) => tab.id === sourceParentTabId)
          const targetParent = data.tabs.find((tab) => tab.id === targetTabId)
          if (!sourceParent || !targetParent) return data
          const movedSubTab = sourceParent.subTabs.find((subTab) => subTab.id === subTabId)
          if (!movedSubTab) return data
          if (targetParent.subTabs.some((subTab) => subTab.id === subTabId)) return data

          return {
            ...data,
            tabs: data.tabs.map((tab) => {
              if (tab.id === sourceParentTabId) {
                return {
                  ...tab,
                  activeSubTabId: tab.activeSubTabId === subTabId ? null : tab.activeSubTabId,
                  subTabs: tab.subTabs.filter((subTab) => subTab.id !== subTabId),
                }
              }
              if (tab.id === targetTabId) {
                return {
                  ...tab,
                  subTabs: [...tab.subTabs, movedSubTab],
                }
              }
              return tab
            }),
          }
        })
      }
    }

    setArrangeMode((previous) =>
      previous.active
        ? {
            ...previous,
            dragItem: null,
            overParentTabId: null,
            overParentInsert: null,
            overSubTabId: null,
            overSubTabInsert: null,
          }
        : previous,
    )
  }

  const handleArrangeTabRailDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!arrangeMode.active || arrangeMode.dragItem?.type !== 'tab') return
    if (event.target !== event.currentTarget) return
    const rail = primaryTabRailRef.current
    if (!rail) return
    const insertionTarget = getArrangeRailInsertionTarget(
      rail,
      '[data-arrange-tab-id]',
      'data-arrange-tab-id',
      event.clientX,
      event.clientY,
    )
    if (!insertionTarget) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setArrangeMode((previous) => ({
      ...previous,
      overParentTabId: insertionTarget.targetId,
      overParentInsert: insertionTarget.position,
      overSubTabId: null,
      overSubTabInsert: null,
    }))
  }

  const handleArrangeTabRailDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!arrangeMode.active || arrangeMode.dragItem?.type !== 'tab') return
    if (event.target !== event.currentTarget) return
    const rail = primaryTabRailRef.current
    if (!rail) return
    const insertionTarget = getArrangeRailInsertionTarget(
      rail,
      '[data-arrange-tab-id]',
      'data-arrange-tab-id',
      event.clientX,
      event.clientY,
    )
    if (!insertionTarget) return
    event.preventDefault()
    const draggedTabId = arrangeMode.dragItem.tabId
    markArrangeClickSuppressed(`tab:${draggedTabId}`, `tab:${insertionTarget.targetId}`)
    if (draggedTabId !== insertionTarget.targetId) {
      updateActiveSpaceData((data) => {
        const fromIndex = data.tabs.findIndex((tab) => tab.id === draggedTabId)
        const toIndex = data.tabs.findIndex((tab) => tab.id === insertionTarget.targetId)
        if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return data
        return {
          ...data,
          tabs: moveItemByInsertion(data.tabs, fromIndex, toIndex, insertionTarget.position),
        }
      })
    }
    setArrangeMode((previous) =>
      previous.active
        ? {
            ...previous,
            dragItem: null,
            overParentTabId: null,
            overParentInsert: null,
            overSubTabId: null,
            overSubTabInsert: null,
          }
        : previous,
    )
  }

  const endArrangeTabDrag = () => {
    setArrangeMode((previous) =>
      previous.active
        ? {
            ...previous,
            dragItem: null,
            overParentTabId: null,
            overParentInsert: null,
            overSubTabId: null,
            overSubTabInsert: null,
          }
        : previous,
    )
  }

  const beginArrangeSubTabDrag = (event: ReactDragEvent<HTMLButtonElement>, parentTabId: string, subTabId: string) => {
    if (!arrangeMode.active || viewMode !== 'main') return
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', subTabId)
    markArrangeClickSuppressed(`subtab:${subTabId}`)
    setArrangeMode((previous) => ({
      ...previous,
      dragItem: { type: 'subtab', parentTabId, subTabId },
      overParentTabId: null,
      overParentInsert: null,
      overSubTabId: subTabId,
      overSubTabInsert: 'after',
    }))
  }

  const handleArrangeSubTabDragOver = (event: ReactDragEvent<HTMLButtonElement>, subTabId: string) => {
    if (!arrangeMode.active || arrangeMode.dragItem?.type !== 'subtab') return
    if (arrangeMode.dragItem.parentTabId !== activeTab.id) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    const position = getArrangeInsertPositionFromClientX(event.clientX, event.currentTarget.getBoundingClientRect())
    setArrangeMode((previous) =>
      previous.overSubTabId === subTabId && previous.overSubTabInsert === position
        ? previous
        : {
            ...previous,
            overParentTabId: null,
            overParentInsert: null,
            overSubTabId: subTabId,
            overSubTabInsert: position,
          },
    )
  }

  const handleArrangeSubTabDrop = (event: ReactDragEvent<HTMLButtonElement>, targetSubTabId: string) => {
    if (!arrangeMode.active || arrangeMode.dragItem?.type !== 'subtab') return
    if (arrangeMode.dragItem.parentTabId !== activeTab.id) return
    event.preventDefault()
    const draggedSubTabId = arrangeMode.dragItem.subTabId
    const position = getArrangeInsertPositionFromClientX(event.clientX, event.currentTarget.getBoundingClientRect())
    markArrangeClickSuppressed(`subtab:${draggedSubTabId}`, `subtab:${targetSubTabId}`)
    if (draggedSubTabId !== targetSubTabId) {
      updateActiveSpaceData((data) => ({
        ...data,
        tabs: data.tabs.map((tab) => {
          if (tab.id !== activeTab.id) return tab
          const fromIndex = tab.subTabs.findIndex((subTab) => subTab.id === draggedSubTabId)
          const toIndex = tab.subTabs.findIndex((subTab) => subTab.id === targetSubTabId)
          if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return tab

          return {
            ...tab,
            subTabs: moveItemByInsertion(tab.subTabs, fromIndex, toIndex, position),
          }
        }),
      }))
    }

    setArrangeMode((previous) =>
      previous.active
        ? {
            ...previous,
            dragItem: null,
            overParentTabId: null,
            overParentInsert: null,
            overSubTabId: null,
            overSubTabInsert: null,
          }
        : previous,
    )
  }

  const handleArrangeSubTabRailDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!arrangeMode.active || arrangeMode.dragItem?.type !== 'subtab') return
    if (arrangeMode.dragItem.parentTabId !== activeTab.id) return
    if (event.target !== event.currentTarget) return
    const rail = subTabRailRef.current
    if (!rail) return
    const insertionTarget = getArrangeRailInsertionTarget(
      rail,
      '[data-arrange-subtab-id]',
      'data-arrange-subtab-id',
      event.clientX,
      event.clientY,
    )
    if (!insertionTarget) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setArrangeMode((previous) => ({
      ...previous,
      overParentTabId: null,
      overParentInsert: null,
      overSubTabId: insertionTarget.targetId,
      overSubTabInsert: insertionTarget.position,
    }))
  }

  const handleArrangeSubTabRailDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!arrangeMode.active || arrangeMode.dragItem?.type !== 'subtab') return
    if (arrangeMode.dragItem.parentTabId !== activeTab.id) return
    if (event.target !== event.currentTarget) return
    const rail = subTabRailRef.current
    if (!rail) return
    const insertionTarget = getArrangeRailInsertionTarget(
      rail,
      '[data-arrange-subtab-id]',
      'data-arrange-subtab-id',
      event.clientX,
      event.clientY,
    )
    if (!insertionTarget) return
    event.preventDefault()
    const draggedSubTabId = arrangeMode.dragItem.subTabId
    markArrangeClickSuppressed(`subtab:${draggedSubTabId}`, `subtab:${insertionTarget.targetId}`)
    if (draggedSubTabId !== insertionTarget.targetId) {
      updateActiveSpaceData((data) => ({
        ...data,
        tabs: data.tabs.map((tab) => {
          if (tab.id !== activeTab.id) return tab
          const fromIndex = tab.subTabs.findIndex((subTab) => subTab.id === draggedSubTabId)
          const toIndex = tab.subTabs.findIndex((subTab) => subTab.id === insertionTarget.targetId)
          if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return tab
          return {
            ...tab,
            subTabs: moveItemByInsertion(tab.subTabs, fromIndex, toIndex, insertionTarget.position),
          }
        }),
      }))
    }
    setArrangeMode((previous) =>
      previous.active
        ? {
            ...previous,
            dragItem: null,
            overParentTabId: null,
            overParentInsert: null,
            overSubTabId: null,
            overSubTabInsert: null,
          }
        : previous,
    )
  }

  const handleArrangeHomeSubTabDragOver = (event: ReactDragEvent<HTMLButtonElement>) => {
    if (!arrangeMode.active || arrangeMode.dragItem?.type !== 'subtab') return
    if (arrangeMode.dragItem.parentTabId !== activeTab.id) return
    const firstSubTab = activeTab.subTabs[0]
    if (!firstSubTab) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setArrangeMode((previous) =>
      previous.overSubTabId === firstSubTab.id && previous.overSubTabInsert === 'before'
        ? previous
        : {
            ...previous,
            overParentTabId: null,
            overParentInsert: null,
            overSubTabId: firstSubTab.id,
            overSubTabInsert: 'before',
          },
    )
  }

  const handleArrangeHomeSubTabDrop = (event: ReactDragEvent<HTMLButtonElement>) => {
    if (!arrangeMode.active || arrangeMode.dragItem?.type !== 'subtab') return
    if (arrangeMode.dragItem.parentTabId !== activeTab.id) return
    const firstSubTab = activeTab.subTabs[0]
    if (!firstSubTab) return
    event.preventDefault()
    const draggedSubTabId = arrangeMode.dragItem.subTabId
    markArrangeClickSuppressed(`subtab:${draggedSubTabId}`, `home:${activeTab.id}`)
    if (draggedSubTabId !== firstSubTab.id) {
      updateActiveSpaceData((data) => ({
        ...data,
        tabs: data.tabs.map((tab) => {
          if (tab.id !== activeTab.id) return tab
          const fromIndex = tab.subTabs.findIndex((subTab) => subTab.id === draggedSubTabId)
          const toIndex = tab.subTabs.findIndex((subTab) => subTab.id === firstSubTab.id)
          if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return tab
          return {
            ...tab,
            subTabs: moveItemByInsertion(tab.subTabs, fromIndex, toIndex, 'before'),
          }
        }),
      }))
    }
    setArrangeMode((previous) =>
      previous.active
        ? {
            ...previous,
            dragItem: null,
            overParentTabId: null,
            overParentInsert: null,
            overSubTabId: null,
            overSubTabInsert: null,
          }
        : previous,
    )
  }

  const endArrangeSubTabDrag = () => {
    setArrangeMode((previous) =>
      previous.active
        ? {
            ...previous,
            dragItem: null,
            overParentTabId: null,
            overParentInsert: null,
            overSubTabId: null,
            overSubTabInsert: null,
          }
        : previous,
    )
  }

  useEffect(() => {
    if (viewMode === 'settings') {
      setSettingsDaysDraft(String(activeSpace.settings.autoRemoveDeletedDays))
      setShortcutDrafts(state.hotkeys.shortcuts)
      setMouseBackForwardEnabledDraft(state.hotkeys.enableMouseBackForward)
      setGenericHistoryHotkeysEnabledDraft(state.hotkeys.enableGenericHistoryHotkeys)
      setShowParentHomeTabDraft(state.ui.showParentHomeTab)
      setEditingShortcut(null)
    }
  }, [viewMode, activeSpace.settings.autoRemoveDeletedDays, state.hotkeys, state.ui.showParentHomeTab])

  useEffect(() => () => clearArrangePressTimer(), [])

  useEffect(() => {
    if (viewMode === 'main') return
    setArrangeMode((previous) => (previous.active ? DEFAULT_ARRANGE_MODE : previous))
  }, [viewMode])

  const activeTab = useMemo(
    () => workspace.tabs.find((tab) => tab.id === workspace.activeTabId) ?? workspace.tabs[0],
    [workspace.activeTabId, workspace.tabs],
  )

  const activeSubTab = useMemo(
    () =>
      activeTab.activeSubTabId
        ? activeTab.subTabs.find((sub) => sub.id === activeTab.activeSubTabId) ?? null
        : null,
    [activeTab],
  )

  useEffect(() => {
    if (!arrangeMode.active || viewMode !== 'main') return

    setArrangeMode((previous) => {
      if (!previous.active) return previous

      const validParentTabIds = new Set(workspace.tabs.map((tab) => tab.id))
      let nextDragItem = previous.dragItem
      let nextOverParentTabId = previous.overParentTabId
      let nextOverParentInsert = previous.overParentInsert
      let nextOverSubTabId = previous.overSubTabId
      let nextOverSubTabInsert = previous.overSubTabInsert

      if (nextDragItem?.type === 'tab' && !validParentTabIds.has(nextDragItem.tabId)) {
        nextDragItem = null
      }

      const currentDragItem = nextDragItem
      if (currentDragItem?.type === 'subtab') {
        const sourceParent = workspace.tabs.find((tab) => tab.id === currentDragItem.parentTabId)
        if (!sourceParent || !sourceParent.subTabs.some((subTab) => subTab.id === currentDragItem.subTabId)) {
          nextDragItem = null
        }
      }

      if (nextOverParentTabId && !validParentTabIds.has(nextOverParentTabId)) {
        nextOverParentTabId = null
        nextOverParentInsert = null
      }

      if (nextOverSubTabId && !activeTab.subTabs.some((subTab) => subTab.id === nextOverSubTabId)) {
        nextOverSubTabId = null
        nextOverSubTabInsert = null
      }

      if (nextDragItem?.type !== 'tab' && nextOverParentInsert) {
        nextOverParentInsert = null
      }

      if (nextDragItem?.type !== 'subtab' && nextOverSubTabInsert) {
        nextOverSubTabInsert = null
      }

      if (
        nextDragItem === previous.dragItem &&
        nextOverParentTabId === previous.overParentTabId &&
        nextOverParentInsert === previous.overParentInsert &&
        nextOverSubTabId === previous.overSubTabId &&
        nextOverSubTabInsert === previous.overSubTabInsert
      ) {
        return previous
      }

      return {
        ...previous,
        dragItem: nextDragItem,
        overParentTabId: nextOverParentTabId,
        overParentInsert: nextOverParentInsert,
        overSubTabId: nextOverSubTabId,
        overSubTabInsert: nextOverSubTabInsert,
      }
    })
  }, [arrangeMode.active, viewMode, workspace.tabs, activeTab.subTabs])

  const activeContent = activeSubTab ? activeSubTab.content : activeTab.homeContent

  const trashParentTabs = useMemo(() => {
    const buckets: TrashParentBucket[] = workspace.deletedTabs.map((entry) => ({
      id: entry.id,
      title: entry.tab.title,
      source: 'deleted-tab',
      deletedTabEntryId: entry.id,
      parentTabId: entry.tab.id,
      homeContent: entry.tab.homeContent,
      subTabs: entry.tab.subTabs,
    }))

    const deletedParentIds = new Set(workspace.deletedTabs.map((entry) => entry.tab.id))
    const subtabsOnlyMap = new Map<string, { title: string; entries: DeletedSubTabEntry[] }>()
    for (const entry of workspace.deletedSubTabs) {
      if (deletedParentIds.has(entry.parentTabId)) continue
      if (!subtabsOnlyMap.has(entry.parentTabId)) {
        subtabsOnlyMap.set(entry.parentTabId, { title: entry.parentTabTitle, entries: [] })
      }
      subtabsOnlyMap.get(entry.parentTabId)?.entries.push(entry)
    }

    for (const [parentTabId, group] of subtabsOnlyMap.entries()) {
      buckets.push({
        id: `subtabs-only-${parentTabId}`,
        title: group.title,
        source: 'subtabs-only',
        deletedTabEntryId: null,
        parentTabId,
        homeContent: `# ${group.title}\n\ndeleted sub-tabs from this tab are shown below.`,
        subTabs: group.entries.map((entry) => ({
          id: entry.id,
          title: entry.subTab.title,
          content: entry.subTab.content,
        })),
      })
    }

    return buckets
  }, [workspace.deletedTabs, workspace.deletedSubTabs])

  const selectedTrashTab = useMemo(
    () => (trashTabId === TRASH_HOME_ID ? null : trashParentTabs.find((entry) => entry.id === trashTabId) ?? null),
    [trashTabId, trashParentTabs],
  )

  const trashSubTabs = useMemo(() => (selectedTrashTab ? selectedTrashTab.subTabs : []), [selectedTrashTab])

  const selectedTrashSubTab = useMemo(
    () => (trashSubTabId ? trashSubTabs.find((sub) => sub.id === trashSubTabId) ?? null : null),
    [trashSubTabId, trashSubTabs],
  )

  const trashHomeContent = `# Trash\n\nItems moved here are pending deletion.\n\n- Use **Restore All** to move everything back into notes.\n- Use **delete all** to permanently remove all items in Trash.\n- This Trash note is read-only.`

  const trashContent = selectedTrashSubTab
    ? selectedTrashSubTab.content
    : selectedTrashTab
      ? selectedTrashTab.homeContent
      : trashHomeContent

  const displayContent = viewMode === 'trash' ? trashContent : activeContent

  activeSpaceIdRef.current = activeSpace.id
  activeTabIdRef.current = activeTab.id
  activeSubTabIdRef.current = activeSubTab?.id ?? null
  isMainViewRef.current = viewMode === 'main'

  const updateActiveSpaceData = (updater: (data: WorkspaceData) => WorkspaceData) => {
    setState((previous) => ({
      ...previous,
      spaces: previous.spaces.map((space) =>
        space.id === previous.activeSpaceId ? { ...space, data: updater(space.data) } : space,
      ),
    }))
  }

  const areNavLocationsEqual = (a: NavLocation, b: NavLocation) =>
    a.viewMode === b.viewMode &&
    a.activeSpaceId === b.activeSpaceId &&
    a.mainTabId === b.mainTabId &&
    a.mainSubTabId === b.mainSubTabId &&
    a.trashTabId === b.trashTabId &&
    a.trashSubTabId === b.trashSubTabId

  const buildNavLocation = (): NavLocation => ({
    viewMode,
    activeSpaceId: activeSpace.id,
    mainTabId: workspace.activeTabId,
    mainSubTabId: activeTab.activeSubTabId,
    trashTabId,
    trashSubTabId,
  })

  const applyNavLocation = (location: NavLocation) => {
    setState((previous) => {
      const fallbackSpace = previous.spaces[0]
      const resolvedSpace =
        previous.spaces.find((space) => space.id === location.activeSpaceId) ?? fallbackSpace
      const resolvedSpaceId = resolvedSpace?.id ?? previous.activeSpaceId

      const spaces = previous.spaces.map((space) => {
        if (space.id !== resolvedSpaceId) return space
        const data = space.data
        const resolvedTabId = data.tabs.some((tab) => tab.id === location.mainTabId)
          ? location.mainTabId
          : data.tabs[0]?.id ?? data.activeTabId

        const tabs = data.tabs.map((tab) => {
          if (tab.id !== resolvedTabId) return tab
          const resolvedSubTabId =
            location.mainSubTabId && tab.subTabs.some((sub) => sub.id === location.mainSubTabId)
              ? location.mainSubTabId
              : null
          return tab.activeSubTabId === resolvedSubTabId ? tab : { ...tab, activeSubTabId: resolvedSubTabId }
        })

        return {
          ...space,
          data: {
            ...data,
            activeTabId: resolvedTabId,
            tabs,
          },
        }
      })

      return {
        ...previous,
        activeSpaceId: resolvedSpaceId,
        spaces,
      }
    })

    setTrashTabId(location.trashTabId)
    setTrashSubTabId(location.trashSubTabId)
    setViewMode(location.viewMode)
    setMenuOpen(false)
    setContextMenu(null)
    setEditing(null)
  }

  const navigateHistoryBy = (delta: number) => {
    const history = navHistoryRef.current
    if (history.length === 0) return
    const nextIndex = navIndexRef.current + delta
    if (nextIndex < 0 || nextIndex >= history.length) return
    flushPendingContent()
    navIndexRef.current = nextIndex
    isHistoryNavigationRef.current = true
    applyNavLocation(history[nextIndex])
  }

  const navigateToLastTabLikeLocation = () => {
    const history = navHistoryRef.current
    for (let index = navIndexRef.current - 1; index >= 0; index -= 1) {
      const candidate = history[index]
      if (candidate.viewMode !== 'main' && candidate.viewMode !== 'trash') continue
      flushPendingContent()
      navIndexRef.current = index
      isHistoryNavigationRef.current = true
      applyNavLocation(candidate)
      return true
    }
    return false
  }

  const applyContentToTarget = (spaceId: string, tabId: string, subTabId: string | null, markdown: string) => {
    setState((previous) => applyMarkdownToAppState(previous, spaceId, tabId, subTabId, markdown))
  }

  const buildStateWithLatestEditorContent = () => {
    let nextState = stateRef.current
    const pending = pendingContentRef.current
    if (pending) {
      return applyMarkdownToAppState(nextState, pending.spaceId, pending.tabId, pending.subTabId, pending.markdown)
    }

    if (!isMainViewRef.current) return nextState

    if (!editorRef.current) return nextState
    const markdown = lastEditorMarkdownRef.current

    nextState = applyMarkdownToAppState(
      nextState,
      activeSpaceIdRef.current,
      activeTabIdRef.current,
      activeSubTabIdRef.current,
      markdown,
    )
    return nextState
  }

  const persistLatestStateSnapshot = () => {
    const latestState = buildStateWithLatestEditorContent()
    appStateStore.save(JSON.stringify(latestState))
  }

  useEffect(() => {
    window.__tabsGetLatestAppState = () => JSON.stringify(buildStateWithLatestEditorContent())
    return () => {
      delete window.__tabsGetLatestAppState
    }
  }, [])

  const flushPendingContent = () => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }

    if (pendingContentRef.current) {
      const pending = pendingContentRef.current
      pendingContentRef.current = null
      applyContentToTarget(pending.spaceId, pending.tabId, pending.subTabId, pending.markdown)
      return
    }

    if (!isMainViewRef.current) return

    if (!editorRef.current) return
    const markdown = lastEditorMarkdownRef.current
    applyContentToTarget(activeSpaceIdRef.current, activeTabIdRef.current, activeSubTabIdRef.current, markdown)
  }

  const scheduleContentCommit = (markdown: string, spaceId: string, tabId: string, subTabId: string | null) => {
    const normalizedMarkdown = normalizeMarkdownForPersistence(markdown)
    lastEditorMarkdownRef.current = normalizedMarkdown
    pendingContentRef.current = { spaceId, tabId, subTabId, markdown: normalizedMarkdown }

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
    }

    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null
      if (!pendingContentRef.current) return
      const next = pendingContentRef.current
      pendingContentRef.current = null
      applyContentToTarget(next.spaceId, next.tabId, next.subTabId, next.markdown)
    }, 180)
  }

  const isTrashHomeSelected = viewMode === 'trash' && trashTabId === TRASH_HOME_ID
  const isEditorView = viewMode === 'main' || (viewMode === 'trash' && !isTrashHomeSelected)

  const commitCurrentEditorContent = () => {
    if (!isMainViewRef.current) return
    if (!editorRef.current) return
    const markdown = lastEditorMarkdownRef.current
    scheduleContentCommit(markdown, activeSpaceIdRef.current, activeTabIdRef.current, activeSubTabIdRef.current)
  }

  useEffect(() => {
    const flushOnExit = () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      persistLatestStateSnapshot()
    }

    window.addEventListener('beforeunload', flushOnExit)
    window.addEventListener('pagehide', flushOnExit)
    return () => {
      window.removeEventListener('beforeunload', flushOnExit)
      window.removeEventListener('pagehide', flushOnExit)
    }
  }, [])

  const tryApplyMultilineIndent = (outdent: boolean) => {
    const currentEditor = editorRef.current as
      | (Editor & {
          wwEditor?: {
            view?: any
          }
        })
      | null

    const view = currentEditor?.wwEditor?.view
    if (!currentEditor || !view) {
      return false
    }

    const { state } = view
    const { from, to, $from } = state.selection
    const isCollapsedSelection = from === to
    const selectedText = state.doc.textBetween(from, to, '\n')

    if (!selectedText.includes('\n')) {
      let tr: any = state.tr

      if (outdent) {
        const parentText = $from.parent.textContent ?? ''
        const parentStart = $from.start()
        const offsetInParent = Math.max(0, from - parentStart)
        const beforeCursor = parentText.slice(0, offsetInParent)
        const inlinePrefixLength = getTrailingIndentPrefixLength(beforeCursor)
        if (inlinePrefixLength > 0) {
          tr = tr.delete(from - inlinePrefixLength, from)
        } else {
          const linePrefixLength = getIndentPrefixLength(parentText)
          if (linePrefixLength <= 0) return false
          tr = tr.delete(parentStart, parentStart + linePrefixLength)
        }
      } else if (isCollapsedSelection) {
        tr = tr.insertText(INDENT_TOKEN, from)
      } else {
        tr = tr.insertText(INDENT_TOKEN, from)
      }

      const nextCaret = tr.mapping.map(from, 1)
      const nextFrom = tr.mapping.map(from, 1)
      const nextTo = tr.mapping.map(to, 1)
      view.dispatch(tr)
      const markdownAfterInlineIndent = normalizeMarkdownForPersistence(
        mergeLeadingIndentsFromWysiwyg(currentEditor, currentEditor.getMarkdown()),
      )
      lastEditorMarkdownRef.current = markdownAfterInlineIndent
      scheduleContentCommit(
        markdownAfterInlineIndent,
        activeSpaceIdRef.current,
        activeTabIdRef.current,
        activeSubTabIdRef.current,
      )
      window.requestAnimationFrame(() => {
        if (isCollapsedSelection) {
          ;(currentEditor as any).setSelection?.(nextCaret, nextCaret)
        } else {
          ;(currentEditor as any).setSelection?.(nextFrom, nextTo)
        }
        currentEditor.focus()
      })
      return true
    }

    const blockTargets: Array<{ pos: number; removeLength: number }> = []
    const seenBlockPositions = new Set<number>()
    const addBlockTarget = (node: any, contentStartPos: number) => {
      if (!node?.isTextblock || seenBlockPositions.has(contentStartPos)) return
      seenBlockPositions.add(contentStartPos)
      const text = node.textContent ?? ''
      const removeLength = outdent ? getIndentPrefixLength(text) : 0
      if (!outdent || removeLength > 0) {
        blockTargets.push({ pos: contentStartPos, removeLength })
      }
    }

    if (from === to) {
      addBlockTarget($from.parent, $from.start())
    } else {
      state.doc.nodesBetween(from, to, (node: any, pos: number) => {
        if (!node.isTextblock) return
        addBlockTarget(node, pos + 1)
        return false
      })
      if (blockTargets.length === 0) {
        addBlockTarget($from.parent, $from.start())
      }
    }

    if (blockTargets.length === 0) return false

    let tr: any = state.tr
    for (const target of [...blockTargets].sort((a, b) => b.pos - a.pos)) {
      tr = outdent ? tr.delete(target.pos, target.pos + target.removeLength) : tr.insertText(INDENT_TOKEN, target.pos)
    }

    const nextFrom = tr.mapping.map(from, -1)
    const nextTo = tr.mapping.map(to, 1)
    const nextCaret = tr.mapping.map(from, outdent ? -1 : 1)
    view.dispatch(tr)
    const markdownAfterIndent = normalizeMarkdownForPersistence(
      mergeLeadingIndentsFromWysiwyg(currentEditor, currentEditor.getMarkdown()),
    )
    lastEditorMarkdownRef.current = markdownAfterIndent
    scheduleContentCommit(
      markdownAfterIndent,
      activeSpaceIdRef.current,
      activeTabIdRef.current,
      activeSubTabIdRef.current,
    )
    window.requestAnimationFrame(() => {
      if (isCollapsedSelection) {
        ;(currentEditor as any).setSelection?.(nextCaret, nextCaret)
      } else {
        ;(currentEditor as any).setSelection?.(nextFrom, nextTo)
      }
      currentEditor.focus()
    })
    return true
  }

  const isLikelyUrl = (value: string) => {
    try {
      const normalized = value.trim()
      const url = new URL(normalized)
      return url.protocol === 'http:' || url.protocol === 'https:'
    } catch {
      return false
    }
  }

  const openLinkPrompt = (url: string, top: number, left: number, text?: string) => {
    setLinkPrompt({
      open: true,
      top,
      left,
      url,
      text: text && text.trim().length > 0 ? text : '',
    })
    window.setTimeout(() => {
      const input = linkPromptInputRef.current
      if (!input) return
      input.focus()
      input.select()
    }, 10)
  }

  const closeLinkPrompt = () => {
    setLinkPrompt({ open: false, top: 0, left: 0, url: '', text: '' })
  }

  const insertNamedLinkFromPrompt = () => {
    if (!linkPrompt.url) return
    const label = linkPrompt.text.trim() || linkPrompt.url
    const markdownLink = `[${label}](${linkPrompt.url})`
    editorRef.current?.focus()
    document.execCommand('insertText', false, markdownLink)
    closeLinkPrompt()
    commitCurrentEditorContent()
  }

  const closeImageTools = () => {
    activeImageRef.current = null
    imageResizeRef.current = null
    inlineCropDragRef.current = {
      mode: null,
      startX: 0,
      startY: 0,
      startRelX: 0,
      startRelY: 0,
      startRelWidth: 1,
      startRelHeight: 1,
    }
    setInlineCrop({ active: false, relX: 0, relY: 0, relWidth: 1, relHeight: 1, top: 0, left: 0, width: 0, height: 0 })
    setImageTools({ visible: false, cropTop: 0, cropLeft: 0, resizeTop: 0, resizeLeft: 0 })
  }

  const refreshImageToolsPosition = () => {
    const image = activeImageRef.current
    if (!image || !image.isConnected) {
      closeImageTools()
      return
    }
    const rect = image.getBoundingClientRect()
    setImageTools({
      visible: true,
      cropTop: Math.max(8, rect.top + 4),
      cropLeft: Math.max(8, rect.left + 4),
      resizeTop: Math.max(8, rect.bottom - 2),
      resizeLeft: Math.max(8, rect.right - 2),
    })

    setInlineCrop((previous) => {
      if (!previous.active) return previous
      const width = Math.max(24, previous.relWidth * rect.width)
      const height = Math.max(24, previous.relHeight * rect.height)
      const x = Math.max(0, Math.min(rect.width - width, previous.relX * rect.width))
      const y = Math.max(0, Math.min(rect.height - height, previous.relY * rect.height))
      return {
        ...previous,
        relX: rect.width > 0 ? x / rect.width : 0,
        relY: rect.height > 0 ? y / rect.height : 0,
        relWidth: rect.width > 0 ? width / rect.width : previous.relWidth,
        relHeight: rect.height > 0 ? height / rect.height : previous.relHeight,
        top: rect.top + y,
        left: rect.left + x,
        width,
        height,
      }
    })
  }

  const selectImageForTools = (image: HTMLImageElement) => {
    activeImageRef.current = image
    refreshImageToolsPosition()
  }

  const beginImageResize = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (inlineCrop.active) return
    const image = activeImageRef.current
    if (!image || !image.isConnected) return
    imageResizeRef.current = {
      startX: event.clientX,
      startWidth: image.getBoundingClientRect().width || image.width || image.naturalWidth || 160,
    }
  }

  const continueImageResize = (clientX: number) => {
    const image = activeImageRef.current
    const resize = imageResizeRef.current
    if (!image || !resize) return
    const nextWidth = Math.max(80, Math.round(resize.startWidth + (clientX - resize.startX)))
    image.style.width = `${nextWidth}px`
    image.style.maxWidth = '100%'
    image.style.height = 'auto'
    image.setAttribute('width', String(nextWidth))
    refreshImageToolsPosition()
  }

  const startInlineCrop = () => {
    const image = activeImageRef.current
    if (!image || !image.isConnected) return
    const rect = image.getBoundingClientRect()
    setInlineCrop({
      active: true,
      relX: 0,
      relY: 0,
      relWidth: 1,
      relHeight: 1,
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    })
  }

  const cancelInlineCrop = () => {
    inlineCropDragRef.current = {
      mode: null,
      startX: 0,
      startY: 0,
      startRelX: 0,
      startRelY: 0,
      startRelWidth: 1,
      startRelHeight: 1,
    }
    setInlineCrop((previous) => ({ ...previous, active: false, top: 0, left: 0, width: 0, height: 0 }))
  }

  const applyInlineCrop = async () => {
    const image = activeImageRef.current
    if (!image || !inlineCrop.active || !image.src) return

    const sourceImage = new Image()
    sourceImage.src = image.src
    await new Promise<void>((resolve, reject) => {
      sourceImage.onload = () => resolve()
      sourceImage.onerror = () => reject(new Error('image load failed'))
    })

    const naturalWidth = sourceImage.naturalWidth
    const naturalHeight = sourceImage.naturalHeight
    if (naturalWidth <= 0 || naturalHeight <= 0) return

    const rect = image.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return

    const widthPx = inlineCrop.width
    const heightPx = inlineCrop.height
    const xPx = inlineCrop.left - rect.left
    const yPx = inlineCrop.top - rect.top

    const sourceX = Math.max(0, Math.min(naturalWidth, (xPx / rect.width) * naturalWidth))
    const sourceY = Math.max(0, Math.min(naturalHeight, (yPx / rect.height) * naturalHeight))
    const sourceWidth = Math.max(8, Math.min((widthPx / rect.width) * naturalWidth, naturalWidth - sourceX))
    const sourceHeight = Math.max(8, Math.min((heightPx / rect.height) * naturalHeight, naturalHeight - sourceY))
    const outputWidth = Math.max(8, Math.round(sourceWidth))
    const outputHeight = Math.max(8, Math.round(sourceHeight))

    const canvas = document.createElement('canvas')
    canvas.width = outputWidth
    canvas.height = outputHeight
    const context = canvas.getContext('2d')
    if (!context) return

    context.drawImage(sourceImage, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, outputWidth, outputHeight)
    const nextDataUrl = canvas.toDataURL('image/png')

    const renderedWidth = inlineCrop.width
    const renderedHeight = inlineCrop.height
    image.src = nextDataUrl
    image.style.width = `${Math.round(renderedWidth)}px`
    image.style.height = `${Math.round(renderedHeight)}px`
    image.setAttribute('width', String(Math.round(renderedWidth)))
    image.setAttribute('height', String(Math.round(renderedHeight)))
    image.style.maxWidth = 'none'
    cancelInlineCrop()
    refreshImageToolsPosition()
    commitCurrentEditorContent()
  }

  const beginInlineCropDrag = (mode: 'move' | 'resize', event: React.PointerEvent<HTMLElement>) => {
    if (!inlineCrop.active) return
    event.preventDefault()
    event.stopPropagation()
    inlineCropDragRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      startRelX: inlineCrop.relX,
      startRelY: inlineCrop.relY,
      startRelWidth: inlineCrop.relWidth,
      startRelHeight: inlineCrop.relHeight,
    }
  }

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (imageResizeRef.current) {
        continueImageResize(event.clientX)
      }

      const drag = inlineCropDragRef.current
      if (!drag.mode || !inlineCrop.active) return
      const image = activeImageRef.current
      if (!image || !image.isConnected) return
      const rect = image.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return

      const startX = drag.startRelX * rect.width
      const startY = drag.startRelY * rect.height
      const startWidth = Math.max(24, drag.startRelWidth * rect.width)
      const startHeight = Math.max(24, drag.startRelHeight * rect.height)
      const dx = event.clientX - drag.startX
      const dy = event.clientY - drag.startY

      if (drag.mode === 'move') {
        const nextX = Math.max(0, Math.min(rect.width - startWidth, startX + dx))
        const nextY = Math.max(0, Math.min(rect.height - startHeight, startY + dy))
        setInlineCrop((previous) => ({
          ...previous,
          relX: rect.width > 0 ? nextX / rect.width : 0,
          relY: rect.height > 0 ? nextY / rect.height : 0,
          top: rect.top + nextY,
          left: rect.left + nextX,
          width: startWidth,
          height: startHeight,
        }))
        return
      }

      const nextWidth = Math.max(24, Math.min(rect.width - startX, startWidth + dx))
      const nextHeight = Math.max(24, Math.min(rect.height - startY, startHeight + dy))
      setInlineCrop((previous) => ({
        ...previous,
        relWidth: rect.width > 0 ? nextWidth / rect.width : previous.relWidth,
        relHeight: rect.height > 0 ? nextHeight / rect.height : previous.relHeight,
        top: rect.top + startY,
        left: rect.left + startX,
        width: nextWidth,
        height: nextHeight,
      }))
    }

    const handlePointerUp = () => {
      if (imageResizeRef.current) {
        imageResizeRef.current = null
        commitCurrentEditorContent()
      }
      inlineCropDragRef.current = {
        mode: null,
        startX: 0,
        startY: 0,
        startRelX: 0,
        startRelY: 0,
        startRelWidth: 1,
        startRelHeight: 1,
      }
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [inlineCrop.active])

  useEffect(() => {
    if (!isEditorView) return
    if (!editorMountRef.current || editorRef.current) return

    lastEditorMarkdownRef.current = displayContent
    editorRef.current = new Editor({
      el: editorMountRef.current,
      initialValue: displayContent,
      initialEditType: 'wysiwyg',
      previewStyle: 'tab',
      hideModeSwitch: true,
      toolbarItems: EDITOR_TOOLBAR_ITEMS,
      height: '100%',
      usageStatistics: false,
      plugins: [thematicBreakShortcutPlugin],
      hooks: {
        addImageBlobHook: (blob: Blob | File, callback: (url: string, text?: string) => void) => {
          const reader = new FileReader()
          reader.onload = () => {
            const dataUrl = typeof reader.result === 'string' ? reader.result : ''
            if (!dataUrl) return
            callback(dataUrl, blob instanceof File ? blob.name : 'image')
            window.setTimeout(() => commitCurrentEditorContent(), 30)
          }
          reader.readAsDataURL(blob)
        },
      },
      events: {
        change: () => {
          if (!isMainViewRef.current) return
          const currentEditor = editorRef.current
          if (!currentEditor) return
          const markdown = normalizeMarkdownForPersistence(
            mergeLeadingIndentsFromWysiwyg(currentEditor, currentEditor.getMarkdown()),
          )
          const previousMarkdown = lastEditorMarkdownRef.current

          if (normalizingContentRef.current) {
            normalizingContentRef.current = false
            const normalizedMarkdown = lastEditorMarkdownRef.current
            scheduleContentCommit(
              normalizedMarkdown,
              activeSpaceIdRef.current,
              activeTabIdRef.current,
              activeSubTabIdRef.current,
            )
            return
          }

          const normalized = normalizeHeadingMarkers(markdown)
          if (normalized !== markdown) {
            normalizingContentRef.current = true
            lastEditorMarkdownRef.current = normalized
            currentEditor.setMarkdown(normalized, false)
            return
          }

          const materializedHorizontalRule = materializeHorizontalRuleShortcut(previousMarkdown, markdown)
          if (materializedHorizontalRule && materializedHorizontalRule !== markdown) {
            normalizingContentRef.current = true
            lastEditorMarkdownRef.current = materializedHorizontalRule
            currentEditor.setMarkdown(materializedHorizontalRule, false)
            return
          }

          lastEditorMarkdownRef.current = markdown
          scheduleContentCommit(markdown, activeSpaceIdRef.current, activeTabIdRef.current, activeSubTabIdRef.current)
        },
      },
    })

    return () => {
      flushPendingContent()
      closeImageTools()
      editorRef.current?.destroy()
      editorRef.current = null
    }
  }, [isEditorView])

  useEffect(() => {
    if (viewMode !== 'main') {
      closeImageTools()
      closeLinkPrompt()
      return
    }

    const root = editorMountRef.current
    if (!root) return

    const handlePointerDown = (event: Event) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) {
        closeImageTools()
        closeLinkPrompt()
        return
      }
      if (
        target.closest('.image-tools') ||
        target.closest('.image-resize-handle') ||
        target.closest('.inline-crop-box') ||
        target.closest('.inline-crop-resize-handle') ||
        target.closest('.link-prompt')
      ) {
        return
      }
      const image = target.closest('img')
      if (image instanceof HTMLImageElement) {
        selectImageForTools(image)
        return
      }
      const anchor = target.closest('a')
      if (anchor instanceof HTMLAnchorElement) {
        event.preventDefault()
        const rect = anchor.getBoundingClientRect()
        const href = anchor.getAttribute('href') ?? ''
        const text = anchor.textContent ?? ''
        openLinkPrompt(href, Math.max(8, rect.bottom + 6), Math.max(8, rect.left), text)
        return
      }
      closeImageTools()
      closeLinkPrompt()
    }

    const handleScrollOrResize = () => {
      if (!activeImageRef.current) return
      refreshImageToolsPosition()
    }

    const handlePaste = (event: Event) => {
      const pasteEvent = event as ClipboardEvent
      const text = pasteEvent.clipboardData?.getData('text/plain')?.trim() ?? ''
      if (!text || !isLikelyUrl(text)) return

      const selection = window.getSelection()
      if (!selection || !selection.rangeCount) return
      const rangeRect = selection.getRangeAt(0).getBoundingClientRect()
      pasteEvent.preventDefault()
      openLinkPrompt(
        text,
        Math.max(8, rangeRect.bottom + 8),
        Math.max(8, rangeRect.left),
        '',
      )
    }

    const handleKeyDown = (event: Event) => {
      const keyboardEvent = event as KeyboardEvent
      if (keyboardEvent.key !== 'Tab' || keyboardEvent.altKey || keyboardEvent.ctrlKey || keyboardEvent.metaKey) return
      const handled = tryApplyMultilineIndent(keyboardEvent.shiftKey)
      if (!handled) return
      keyboardEvent.preventDefault()
      keyboardEvent.stopPropagation()
    }

    root.addEventListener('pointerdown', handlePointerDown, true)
    root.addEventListener('paste', handlePaste, true)
    root.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('scroll', handleScrollOrResize, true)
    window.addEventListener('resize', handleScrollOrResize)
    return () => {
      root.removeEventListener('pointerdown', handlePointerDown, true)
      root.removeEventListener('paste', handlePaste, true)
      root.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('scroll', handleScrollOrResize, true)
      window.removeEventListener('resize', handleScrollOrResize)
    }
  }, [viewMode, displayContent])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const instance = editorRef.current
    if (!instance) return

    const existing = instance.getMarkdown()
    if (existing !== displayContent) {
      lastEditorMarkdownRef.current = displayContent
      instance.setMarkdown(displayContent, false)
    }
  }, [displayContent, viewMode, activeSpace.id, activeTab.id, activeSubTab?.id, trashTabId, trashSubTabId])

  const commitRename = (type: 'tab' | 'subtab' | 'space', id: string, nextTitle: string) => {
    if (type !== 'space') {
      flushPendingContent()
    }
    const title = nextTitle.trim()
    setEditing(null)
    if (type !== 'space' && pendingCreatedEditRef.current?.type === type && pendingCreatedEditRef.current.id === id) {
      pendingCreatedEditRef.current = null
    }
    if (!title) return

    if (type === 'space') {
      setState((previous) => ({
        ...previous,
        spaces: previous.spaces.map((space) => (space.id === id ? { ...space, name: title } : space)),
      }))
      return
    }

    const focusEditorSoon = () => {
      if (viewMode !== 'main') return
      window.requestAnimationFrame(() => {
        editorRef.current?.focus()
      })
    }

    if (type === 'tab') {
      updateActiveSpaceData((data) => ({
        ...data,
        tabs: data.tabs.map((tab) => (tab.id === id ? { ...tab, title } : tab)),
      }))
      focusEditorSoon()
      return
    }

    updateActiveSpaceData((data) => ({
      ...data,
      tabs: data.tabs.map((tab) => {
        if (tab.id !== data.activeTabId) return tab
        return {
          ...tab,
          subTabs: tab.subTabs.map((sub) => {
            if (sub.id !== id) return sub
            const pending = pendingContentRef.current
            const pendingMatches =
              pending &&
              pending.spaceId === activeSpaceIdRef.current &&
              pending.tabId === data.activeTabId &&
              pending.subTabId === id
            const latest = pendingMatches ? pending.markdown : editorRef.current ? lastEditorMarkdownRef.current : sub.content
            return { ...sub, title, content: latest }
          }),
        }
      }),
    }))

    pendingContentRef.current = null
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }

    focusEditorSoon()
  }

  const shouldSkipRenameBlur = (type: 'tab' | 'subtab' | 'space', id: string) => {
    const next = skipRenameBlurRef.current
    if (!next || next.type !== type || next.id !== id) return false
    skipRenameBlurRef.current = null
    return true
  }

  const discardPendingCreatedEdit = (type: 'tab' | 'subtab', id: string) => {
    const pending = pendingCreatedEditRef.current
    if (!pending || pending.type !== type || pending.id !== id) {
      setEditing(null)
      return
    }

    pendingCreatedEditRef.current = null
    setEditing(null)

    if (pending.type === 'tab') {
      updateActiveSpaceData((data) => {
        const remainingTabs = data.tabs.filter((tab) => tab.id !== id)
        const fallbackTabId =
          remainingTabs.find((tab) => tab.id === pending.previousTabId)?.id ?? remainingTabs[0]?.id ?? data.activeTabId
        return {
          ...data,
          activeTabId: fallbackTabId,
          tabs: remainingTabs,
        }
      })
      return
    }

    updateActiveSpaceData((data) => ({
      ...data,
      tabs: data.tabs.map((tab) => {
        if (tab.id !== pending.parentTabId) return tab
        const remainingSubTabs = tab.subTabs.filter((subTab) => subTab.id !== id)
        const fallbackSubTabId =
          remainingSubTabs.find((subTab) => subTab.id === pending.previousSubTabId)?.id ?? null
        return {
          ...tab,
          activeSubTabId: fallbackSubTabId,
          subTabs: remainingSubTabs,
        }
      }),
    }))
  }

  const cancelRename = (type: 'tab' | 'subtab' | 'space', id: string) => {
    skipRenameBlurRef.current = { type, id }
    if (type === 'space') {
      setEditing(null)
      return
    }
    discardPendingCreatedEdit(type, id)
  }

  const addTab = () => {
    flushPendingContent()
    const newTab = {
      ...createTab('tab'),
      homeContent: '',
    }

    updateActiveSpaceData((data) => ({
      ...data,
      activeTabId: newTab.id,
      tabs: [...data.tabs, newTab],
    }))

    pendingCreatedEditRef.current = { type: 'tab', id: newTab.id, previousTabId: workspace.activeTabId }
    setEditing({ type: 'tab', id: newTab.id })
  }

  const addSubTab = () => {
    flushPendingContent()
    const newSubTab = createSubTab('tab', '')

    updateActiveSpaceData((data) => ({
      ...data,
      tabs: data.tabs.map((tab) =>
        tab.id === data.activeTabId
          ? { ...tab, activeSubTabId: newSubTab.id, subTabs: [...tab.subTabs, newSubTab] }
          : tab,
      ),
    }))

    pendingCreatedEditRef.current = {
      type: 'subtab',
      id: newSubTab.id,
      parentTabId: activeTab.id,
      previousSubTabId: activeTab.activeSubTabId,
    }
    setEditing({ type: 'subtab', id: newSubTab.id })
  }

  const selectTab = (tabId: string) => {
    flushPendingContent()
    updateActiveSpaceData((data) => ({
      ...data,
      activeTabId: tabId,
      tabs: data.tabs.map((tab) => (tab.id === tabId ? { ...tab, activeSubTabId: null } : tab)),
    }))
  }

  const selectSubTab = (subTabId: string) => {
    flushPendingContent()
    updateActiveSpaceData((data) => ({
      ...data,
      tabs: data.tabs.map((tab) =>
        tab.id === data.activeTabId ? { ...tab, activeSubTabId: subTabId } : tab,
      ),
    }))
  }

  const selectParentHomeTab = () => {
    flushPendingContent()
    updateActiveSpaceData((data) => ({
      ...data,
      tabs: data.tabs.map((tab) =>
        tab.id === data.activeTabId ? { ...tab, activeSubTabId: null } : tab,
      ),
    }))
  }

  const openSpace = (spaceId: string) => {
    flushPendingContent()
    setState((previous) => ({ ...previous, activeSpaceId: spaceId }))
    setViewMode('main')
    setMenuOpen(false)
    setContextMenu(null)
    setEditing(null)
  }

  const addSpace = () => {
    flushPendingContent()
    const newSpace = createSpace('New Space')
    setState((previous) => ({
      ...previous,
      activeSpaceId: newSpace.id,
      spaces: [...previous.spaces, newSpace],
    }))
    setViewMode('spaces')
    setEditing({ type: 'space', id: newSpace.id })
    setMenuOpen(false)
  }

  const toggleTheme = () => {
    setState((previous) => ({ ...previous, theme: previous.theme === 'dark' ? 'light' : 'dark' }))
    setMenuOpen(false)
  }

  const openSpacesView = () => {
    flushPendingContent()
    setViewMode('spaces')
    setMenuOpen(false)
    setContextMenu(null)
  }

  const toggleTrashView = () => {
    flushPendingContent()
    setMenuOpen(false)
    setContextMenu(null)

    setViewMode((previous) => {
      if (previous === 'trash') return 'main'
      setTrashTabId(TRASH_HOME_ID)
      setTrashSubTabId(null)
      return 'trash'
    })
  }

  const openSettings = () => {
    if (viewMode === 'spaces') return
    flushPendingContent()
    setMenuOpen(false)
    setContextMenu(null)
    setViewMode('settings')
  }

  const updateAutoRemoveDaysSetting = (rawValue: string, normalizeInvalid = false) => {
    setSettingsDaysDraft(rawValue)
    const parsed = Number.parseInt(rawValue, 10)
    if (!Number.isFinite(parsed)) {
      if (normalizeInvalid) {
        setSettingsDaysDraft(String(activeSpace.settings.autoRemoveDeletedDays))
      }
      return
    }

    const nextDays = clampAutoRemoveDays(parsed)
    setState((previous) => ({
      ...previous,
      spaces: previous.spaces.map((space) =>
        space.id === previous.activeSpaceId
          ? {
              ...space,
              settings: { ...space.settings, autoRemoveDeletedDays: nextDays },
              data: applyAutoPurgeToWorkspace(space.data, nextDays),
            }
          : space,
      ),
    }))
    if (String(nextDays) !== rawValue.trim()) {
      setSettingsDaysDraft(String(nextDays))
    }
  }

  const updateMouseBackForwardSetting = (checked: boolean) => {
    setMouseBackForwardEnabledDraft(checked)
    setState((previous) => ({
      ...previous,
      hotkeys: {
        ...previous.hotkeys,
        enableMouseBackForward: checked,
      },
    }))
  }

  const updateGenericHistoryHotkeysSetting = (checked: boolean) => {
    setGenericHistoryHotkeysEnabledDraft(checked)
    setState((previous) => ({
      ...previous,
      hotkeys: {
        ...previous.hotkeys,
        enableGenericHistoryHotkeys: checked,
      },
    }))
  }

  const updateShowParentHomeTabSetting = (checked: boolean) => {
    setShowParentHomeTabDraft(checked)
    setState((previous) => ({
      ...previous,
      ui: {
        ...previous.ui,
        showParentHomeTab: checked,
      },
    }))
  }

  const updateShortcutSetting = (shortcutId: ShortcutId, nextShortcut: string) => {
    setShortcutDrafts((previous) => ({ ...previous, [shortcutId]: nextShortcut }))
    setState((previous) => ({
      ...previous,
      hotkeys: {
        ...previous.hotkeys,
        shortcuts: {
          ...previous.hotkeys.shortcuts,
          [shortcutId]: nextShortcut,
        },
      },
    }))
  }

  const sanitizeName = (value: string): string => {
    const safe = value.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, '').replace(/\s+/g, ' ')
    return safe.length > 0 ? safe : 'untitled'
  }

  const decodeDataUrl = (dataUrl: string): Uint8Array | null => {
    const commaIndex = dataUrl.indexOf(',')
    if (commaIndex < 0) return null
    const base64 = dataUrl.slice(commaIndex + 1)
    try {
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
      return bytes
    } catch {
      return null
    }
  }

  const rewriteMarkdownImages = (markdown: string, spaceFolder: string, imageBank: Map<string, Uint8Array>) => {
    let counter = imageBank.size + 1
    const exportReadyMarkdown = convertInternalTabsForExport(markdown)
    const nextMarkdown = exportReadyMarkdown.replace(/!\[([^\]]*)\]\((data:image\/[^)]+)\)/g, (_all, alt: string, src: string) => {
      const extensionMatch = src.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,/)
      const extRaw = extensionMatch?.[1]?.toLowerCase() ?? 'png'
      const ext = extRaw === 'jpeg' ? 'jpg' : extRaw.replace(/[^a-z0-9]/g, '') || 'png'
      const fileName = `image-${String(counter).padStart(4, '0')}.${ext}`
      counter += 1
      const bytes = decodeDataUrl(src)
      if (bytes) {
        imageBank.set(`${spaceFolder}/assets/${fileName}`, bytes)
      }
      return `![${alt}](${`assets/${fileName}`})`
    })
    return nextMarkdown
  }

  const exportData = async (scope: 'space' | 'all') => {
    try {
      setExportStatus('building export...')
      const latestState = buildStateWithLatestEditorContent()
      const exportState: AppState =
        scope === 'space'
          ? {
              ...latestState,
              activeSpaceId: activeSpace.id,
              spaces: latestState.spaces.filter((space) => space.id === activeSpace.id),
            }
          : latestState
      const defaultName = scope === 'space' ? `${sanitizeName(activeSpace.name)}-export.zip` : 'notes-export-all.zip'

      if (window.electronAPI?.exportAppState) {
        const result = await window.electronAPI.exportAppState({
          defaultPath: defaultName,
          serializedState: JSON.stringify(exportState),
        })
        if (result?.canceled) {
          setExportStatus('export canceled')
          return
        }
        if (result?.error) {
          setExportStatus('export failed')
          return
        }
        setExportStatus('export saved')
        return
      }

      const zip = new JSZip()
      const spacesToExport = scope === 'space' ? [activeSpace] : exportState.spaces
      const imageBank = new Map<string, Uint8Array>()
      const manifest = {
        exportedAt: new Date().toISOString(),
        scope,
        version: 1,
        theme: exportState.theme,
        spaces: [] as Array<{
          id: string
          name: string
          settings: SpaceSettings
          activeTabId: string
          tabs: Array<{ id: string; title: string; homeNote: string; subTabs: Array<{ id: string; title: string; file: string }> }>
        }>,
      }

      for (const space of spacesToExport) {
        const spaceFolder = `spaces/${sanitizeName(space.name)}-${space.id.slice(0, 8)}`
        const tabManifest: Array<{ id: string; title: string; homeNote: string; subTabs: Array<{ id: string; title: string; file: string }> }> = []

        for (const tab of space.data.tabs) {
          const tabFolder = `${spaceFolder}/${sanitizeName(tab.title)}-${tab.id.slice(0, 8)}`
          const homeMarkdown = rewriteMarkdownImages(tab.homeContent ?? '', spaceFolder, imageBank)
          zip.file(`${tabFolder}/home.md`, homeMarkdown)

          const subManifest: Array<{ id: string; title: string; file: string }> = []
          tab.subTabs.forEach((subTab, index) => {
            const subFileName = `${String(index + 1).padStart(2, '0')}-${sanitizeName(subTab.title)}.md`
            const rewritten = rewriteMarkdownImages(subTab.content ?? '', spaceFolder, imageBank)
            zip.file(`${tabFolder}/${subFileName}`, rewritten)
            subManifest.push({ id: subTab.id, title: subTab.title, file: subFileName })
          })

          tabManifest.push({
            id: tab.id,
            title: tab.title,
            homeNote: 'home.md',
            subTabs: subManifest,
          })
        }

        manifest.spaces.push({
          id: space.id,
          name: space.name,
          settings: space.settings,
          activeTabId: space.data.activeTabId,
          tabs: tabManifest,
        })
      }

      imageBank.forEach((bytes, path) => {
        zip.file(path, bytes)
      })
      zip.file('manifest.json', JSON.stringify(manifest, null, 2))
      zip.file(
        'README.txt',
        'This export contains markdown notes by space/tab and a manifest.json with metadata. Images are in assets/.',
      )

      const zipBytes = await zip.generateAsync({ type: 'uint8array' })
      const exportArray = Uint8Array.from(zipBytes)
      const exportBuffer = exportArray.buffer as ArrayBuffer

      if (window.electronAPI?.saveFile) {
        const result = await window.electronAPI.saveFile({
          defaultPath: defaultName,
          data: exportBuffer,
        })
        if (result?.canceled) {
          setExportStatus('export canceled')
          return
        }
        setExportStatus('export saved')
        return
      }

      const blob = new Blob([exportBuffer], { type: 'application/zip' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = defaultName
      anchor.click()
      URL.revokeObjectURL(url)
      setExportStatus('export saved')
    } catch {
      setExportStatus('export failed')
    }
  }

  const getShortcutIndex = (key: string): number | null => {
    if (key >= '1' && key <= '9') return Number(key) - 1
    if (key === '0') return 9
    return null
  }

  const autoSizeRenameInput = (input: HTMLInputElement) => {
    if (!renameInputMeasureContext) {
      renameInputMeasureContext = document.createElement('canvas').getContext('2d')
    }

    const computed = window.getComputedStyle(input)
    const minWidth = Number.parseFloat(computed.minWidth) || 0
    const maxWidth = Number.parseFloat(computed.maxWidth) || Number.POSITIVE_INFINITY
    const horizontalChrome =
      (Number.parseFloat(computed.paddingLeft) || 0) +
      (Number.parseFloat(computed.paddingRight) || 0) +
      (Number.parseFloat(computed.borderLeftWidth) || 0) +
      (Number.parseFloat(computed.borderRightWidth) || 0)

    const value = input.value || ' '
    const context = renameInputMeasureContext
    if (!context) {
      input.style.width = `${Math.max(minWidth, 0)}px`
      return
    }

    context.font = computed.font
    const letterSpacing = Number.parseFloat(computed.letterSpacing)
    const extraLetterSpacing = Number.isFinite(letterSpacing) ? Math.max(0, value.length - 1) * letterSpacing : 0
    const textWidth = context.measureText(value).width + extraLetterSpacing
    const nextWidth = Math.min(maxWidth, Math.max(minWidth, Math.ceil(textWidth + horizontalChrome + 2)))
    input.style.width = `${nextWidth}px`
  }

  const openContextMenuForTab = (event: MouseEvent<HTMLButtonElement>, tabId: string) => {
    if (viewMode !== 'main') return
    event.preventDefault()
    setMenuOpen(false)
    setContextMenu({ type: 'tab', tabId, x: event.clientX, y: event.clientY })
  }

  const openContextMenuForSubTab = (event: MouseEvent<HTMLButtonElement>, tabId: string, subTabId: string) => {
    if (viewMode !== 'main') return
    event.preventDefault()
    setMenuOpen(false)
    setContextMenu({ type: 'subtab', tabId, subTabId, x: event.clientX, y: event.clientY })
  }

  const openContextMenuForTrashTab = (event: MouseEvent<HTMLButtonElement>, trashParent: TrashParentBucket) => {
    if (viewMode !== 'trash') return
    event.preventDefault()
    setMenuOpen(false)
    setContextMenu({
      type: 'trash-tab',
      source: trashParent.source,
      deletedTabEntryId: trashParent.deletedTabEntryId,
      parentTabId: trashParent.parentTabId,
      x: event.clientX,
      y: event.clientY,
    })
  }

  const openContextMenuForTrashSubTab = (
    event: MouseEvent<HTMLButtonElement>,
    trashParent: TrashParentBucket,
    currentSubTabId: string,
  ) => {
    if (viewMode !== 'trash') return
    event.preventDefault()
    setMenuOpen(false)
    setContextMenu({
      type: 'trash-subtab',
      source: trashParent.source,
      deletedTabEntryId: trashParent.deletedTabEntryId,
      parentTabId: trashParent.parentTabId,
      subTabId: currentSubTabId,
      x: event.clientX,
      y: event.clientY,
    })
  }

  const openContextMenuForSpace = (event: MouseEvent<HTMLButtonElement>, spaceId: string) => {
    if (viewMode !== 'spaces') return
    event.preventDefault()
    setMenuOpen(false)
    setContextMenu({ type: 'space', spaceId, x: event.clientX, y: event.clientY })
  }

  const buildDeleteTargetFromContextMenu = (): DeleteTarget | null => {
    if (!contextMenu) return null
    return contextMenu.type === 'tab'
      ? { type: 'tab', tabId: contextMenu.tabId }
      : contextMenu.type === 'subtab'
        ? { type: 'subtab', tabId: contextMenu.tabId, subTabId: contextMenu.subTabId }
        : contextMenu.type === 'trash-tab'
          ? {
              type: 'trash-tab',
              source: contextMenu.source,
              deletedTabEntryId: contextMenu.deletedTabEntryId,
              parentTabId: contextMenu.parentTabId,
            }
          : contextMenu.type === 'trash-subtab'
            ? {
                type: 'trash-subtab',
                source: contextMenu.source,
                deletedTabEntryId: contextMenu.deletedTabEntryId,
                parentTabId: contextMenu.parentTabId,
                subTabId: contextMenu.subTabId,
              }
            : { type: 'space', spaceId: contextMenu.spaceId }
  }

  const openDeleteModalFromContext = (permanent: boolean) => {
    const target = buildDeleteTargetFromContextMenu()
    if (!target) return
    setModal({ type: 'delete-target', target, permanent })
    setContextMenu(null)
  }

  const deleteFromContext = () => {
    const target = buildDeleteTargetFromContextMenu()
    if (!target) return
    setContextMenu(null)
    deleteTarget(target, false)
  }

  const beginRenameSpaceFromContext = () => {
    if (!contextMenu || contextMenu.type !== 'space') return
    setEditing({ type: 'space', id: contextMenu.spaceId })
    setContextMenu(null)
  }

  const deleteSpace = (spaceId: string) => {
    setState((previous) => {
      if (previous.spaces.length <= 1) return previous
      const remaining = previous.spaces.filter((space) => space.id !== spaceId)
      const nextActive =
        previous.activeSpaceId === spaceId ? remaining[0]?.id ?? previous.activeSpaceId : previous.activeSpaceId
      return {
        ...previous,
        activeSpaceId: nextActive,
        spaces: remaining,
      }
    })
  }

  const deleteTarget = (target: DeleteTarget, permanent: boolean) => {
    flushPendingContent()
    let nextToastMessage: string | null = null

    if (target.type === 'space') {
      deleteSpace(target.spaceId)
      return
    }

    updateActiveSpaceData((data) => {
      if (target.type === 'trash-tab') {
        if (target.source === 'subtabs-only') {
          return {
            ...data,
            deletedSubTabs: data.deletedSubTabs.filter((entry) => entry.parentTabId !== target.parentTabId),
          }
        }

        return {
          ...data,
          deletedTabs: data.deletedTabs.filter((entry) => entry.id !== target.deletedTabEntryId),
        }
      }

      if (target.type === 'trash-subtab') {
        if (target.source === 'deleted-tab' && target.deletedTabEntryId) {
          return {
            ...data,
            deletedTabs: data.deletedTabs.map((entry) =>
              entry.id !== target.deletedTabEntryId
                ? entry
                : {
                    ...entry,
                    tab: {
                      ...entry.tab,
                      subTabs: entry.tab.subTabs.filter((sub) => sub.id !== target.subTabId),
                    },
                  },
            ),
          }
        }

        return {
          ...data,
          deletedSubTabs: data.deletedSubTabs.filter((entry) => entry.id !== target.subTabId),
        }
      }

      if (target.type === 'tab') {
        const tabToDelete = data.tabs.find((tab) => tab.id === target.tabId)
        if (!tabToDelete) return data
        if (!permanent) {
          nextToastMessage = 'tab has been moved to trash.'
        }

        const remaining = data.tabs.filter((tab) => tab.id !== target.tabId)
        const deletedTabs = permanent
          ? data.deletedTabs
          : [
              ...data.deletedTabs,
              {
                id: createId(),
                tab: tabToDelete,
                deletedAt: Date.now(),
              },
            ]

        if (remaining.length === 0) {
          const fallback = createTab('tab')
          return {
            ...data,
            activeTabId: fallback.id,
            tabs: [fallback],
            deletedTabs,
          }
        }

        const nextActiveId = data.activeTabId === target.tabId ? remaining[0].id : data.activeTabId
        return {
          ...data,
          activeTabId: nextActiveId,
          tabs: remaining.map((tab) => (tab.id === nextActiveId ? { ...tab, activeSubTabId: null } : tab)),
          deletedTabs,
        }
      }

      const parent = data.tabs.find((tab) => tab.id === target.tabId)
      if (!parent) return data
      const subToDelete = parent.subTabs.find((sub) => sub.id === target.subTabId)
      if (!subToDelete) return data
      if (!permanent) {
        nextToastMessage = 'tab has been moved to trash.'
      }

      return {
        ...data,
        tabs: data.tabs.map((tab) =>
          tab.id === target.tabId
            ? {
                ...tab,
                activeSubTabId: tab.activeSubTabId === target.subTabId ? null : tab.activeSubTabId,
                subTabs: tab.subTabs.filter((sub) => sub.id !== target.subTabId),
              }
            : tab,
        ),
        deletedSubTabs: permanent
          ? data.deletedSubTabs
          : [
              ...data.deletedSubTabs,
              {
                id: createId(),
                parentTabId: parent.id,
                parentTabTitle: parent.title,
                subTab: subToDelete,
                deletedAt: Date.now(),
              },
            ],
      }
    })
    if (target.type === 'trash-tab') {
      setTrashTabId(TRASH_HOME_ID)
      setTrashSubTabId(null)
    }
    if (target.type === 'trash-subtab') {
      setTrashSubTabId(null)
    }
    if (nextToastMessage) {
      setToast({
        id: Date.now(),
        message: nextToastMessage,
        tone: 'success',
      })
    }
  }

  const restoreAllTrash = () => {
    updateActiveSpaceData((data) => {
      let tabs = [...data.tabs]
      for (const entry of data.deletedTabs) {
        if (tabs.some((tab) => tab.id === entry.tab.id)) continue
        tabs = [...tabs, entry.tab]
      }

      for (const entry of data.deletedSubTabs) {
        const parentIndex = tabs.findIndex((tab) => tab.id === entry.parentTabId)
        if (parentIndex >= 0) {
          const parent = tabs[parentIndex]
          if (!parent.subTabs.some((sub) => sub.id === entry.subTab.id)) {
            tabs[parentIndex] = { ...parent, subTabs: [...parent.subTabs, entry.subTab] }
          }
        } else {
          tabs = [
            ...tabs,
            {
              id: entry.parentTabId,
              title: entry.parentTabTitle,
              homeContent: '',
              activeSubTabId: null,
              subTabs: [entry.subTab],
            },
          ]
        }
      }

      return {
        ...data,
        activeTabId: tabs.some((tab) => tab.id === data.activeTabId) ? data.activeTabId : tabs[0].id,
        tabs,
        deletedTabs: [],
        deletedSubTabs: [],
      }
    })

    setTrashTabId(TRASH_HOME_ID)
    setTrashSubTabId(null)
  }

  const deleteAllTrash = () => {
    updateActiveSpaceData((data) => ({ ...data, deletedTabs: [], deletedSubTabs: [] }))
    setTrashTabId(TRASH_HOME_ID)
    setTrashSubTabId(null)
  }

  const confirmModal = () => {
    if (!modal) return

    if (modal.type === 'delete-target') {
      deleteTarget(modal.target, modal.permanent)
    }

    if (modal.type === 'trash-restore-all') restoreAllTrash()
    if (modal.type === 'trash-delete-all') deleteAllTrash()

    setModal(null)
  }

  const modalText = (() => {
    if (!modal) return { title: '', body: '', action: 'Confirm' }

    if (modal.type === 'trash-delete-all') {
      return {
        title: 'delete all Trash?',
        body: 'This permanently removes every deleted tab and sub-tab in this space.',
        action: 'delete all',
      }
    }

    if (modal.type === 'trash-restore-all') {
      return {
        title: 'Restore All Trash?',
        body: 'This restores every deleted tab and sub-tab in this space.',
        action: 'Restore All',
      }
    }

    if (modal.target.type === 'space') {
      if (state.spaces.length <= 1) {
        return {
          title: 'Cannot delete Space',
          body: 'At least one space must remain.',
          action: 'OK',
        }
      }
      return {
        title: 'delete Space?',
        body: 'deleted Spaces cannot be recovered, are you sure you want to do this?',
        action: 'delete Space',
      }
    }

    if (modal.target.type === 'trash-tab' && modal.target.source === 'subtabs-only') {
      return {
        title: 'delete Sub-tabs For Real?',
        body: 'This permanently deletes the trashed sub-tabs under this tab. The parent tab (and its other sub-tabs) will remain.',
        action: 'delete For Real',
      }
    }

    return modal.permanent
      ? {
          title: 'delete For Real?',
          body: 'This permanently deletes the selected item and skips Trash.',
          action: 'delete For Real',
        }
      : {
          title: 'Move To Trash?',
          body: 'This moves the selected item into Trash.',
          action: 'delete',
        }
  })()

  const editorReadOnly = viewMode !== 'main'

  const canDeleteSpace = state.spaces.length > 1
  const requiresSpaceDeleteAcknowledge = modal?.type === 'delete-target' && modal.target.type === 'space' && canDeleteSpace
  const canConfirmModal = !requiresSpaceDeleteAcknowledge || spaceDeleteAcknowledge

  useEffect(() => {
    if (viewMode === 'main' || viewMode === 'trash') {
      lastTabLikeViewRef.current = viewMode
    }
  }, [viewMode])

  useEffect(() => {
    const snapshot = buildNavLocation()
    const history = navHistoryRef.current

    if (isHistoryNavigationRef.current) {
      isHistoryNavigationRef.current = false
      return
    }

    if (history.length === 0) {
      history.push(snapshot)
      navIndexRef.current = 0
      return
    }

    const current = history[navIndexRef.current]
    if (current && areNavLocationsEqual(current, snapshot)) return

    history.splice(navIndexRef.current + 1)
    history.push(snapshot)
    navIndexRef.current = history.length - 1
  }, [viewMode, activeSpace.id, workspace.activeTabId, activeTab.activeSubTabId, trashTabId, trashSubTabId])

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (viewMode === 'settings' && editingShortcut) {
        event.preventDefault()
        if (event.key === 'Escape') {
          setEditingShortcut(null)
          return
        }
        const nextShortcut = buildShortcutFromKeyboardEvent(event, isMacPlatform)
        if (!nextShortcut) return
        updateShortcutSetting(editingShortcut, nextShortcut)
        setEditingShortcut(null)
        return
      }

      if (arrangeMode.active && event.key === 'Escape') {
        event.preventDefault()
        exitArrangeMode()
        return
      }

      const isSettingsShortcut =
        isMacPlatform &&
        event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey &&
        (event.key === ',' || event.code === 'Comma')
      if (isSettingsShortcut) {
        event.preventDefault()
        openSettings()
        return
      }

      const isCommandBracketBack =
        event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && event.key === '['
      const isCommandBracketForward =
        event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && event.key === ']'
      const isAltArrowBack =
        !isMacPlatform && event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey && event.key === 'ArrowLeft'
      const isAltArrowForward =
        !isMacPlatform && event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey && event.key === 'ArrowRight'
      const isBrowserBackKey = event.key === 'BrowserBack'
      const isBrowserForwardKey = event.key === 'BrowserForward'

      if (
        state.hotkeys.enableGenericHistoryHotkeys &&
        (isCommandBracketBack || isAltArrowBack || isBrowserBackKey)
      ) {
        event.preventDefault()
        navigateHistoryBy(-1)
        return
      }

      if (
        state.hotkeys.enableGenericHistoryHotkeys &&
        (isCommandBracketForward || isAltArrowForward || isBrowserForwardKey)
      ) {
        event.preventDefault()
        navigateHistoryBy(1)
        return
      }

      const isTabTrashShortcut = eventMatchesShortcut(event, state.hotkeys.shortcuts.toggleTabTrash, isMacPlatform)
      if (isTabTrashShortcut) {
        event.preventDefault()
        if (viewMode === 'main' || viewMode === 'trash') {
          toggleTrashView()
          return
        }
        if (navigateToLastTabLikeLocation()) return
        setViewMode(lastTabLikeViewRef.current)
        setMenuOpen(false)
        setContextMenu(null)
        return
      }

      const isHistoryBackShortcut =
        (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.code === 'Backquote'
      if (isHistoryBackShortcut) {
        event.preventDefault()
        navigateHistoryBy(-1)
        return
      }

      const isHistoryForwardShortcut =
        (event.metaKey || event.ctrlKey) && !event.altKey && event.shiftKey && event.code === 'Backquote'
      if (isHistoryForwardShortcut) {
        event.preventDefault()
        navigateHistoryBy(1)
        return
      }

      const isSpacesShortcut = eventMatchesShortcut(event, state.hotkeys.shortcuts.openSpaces, isMacPlatform)
      if (isSpacesShortcut) {
        event.preventDefault()
        openSpacesView()
        return
      }

      if (viewMode !== 'main') return

      if (arrangeMode.active) return

      const isCommandNewSubTab = eventMatchesShortcut(event, state.hotkeys.shortcuts.newSubTab, isMacPlatform)
      if (isCommandNewSubTab) {
        event.preventDefault()
        addSubTab()
        return
      }

      const shortcutIndex = getShortcutIndex(event.key)
      const usesCommand = event.metaKey && !event.ctrlKey && !event.altKey
      const childJumpModifierMatch = usesCommand

      if (childJumpModifierMatch && !event.shiftKey && shortcutIndex !== null) {
        event.preventDefault()

        const childTargets: Array<string | null> = [null, ...activeTab.subTabs.map((sub) => sub.id)]
        const nextChild = childTargets[shortcutIndex]
        if (nextChild === undefined) return
        if (nextChild === null) {
          selectTab(activeTab.id)
          return
        }
        selectSubTab(nextChild)
        return
      }

      const childTargets: Array<string | null> = [null, ...activeTab.subTabs.map((sub) => sub.id)]
      if (childTargets.length === 0) return

      const isCycleNextShortcut = eventMatchesShortcut(event, state.hotkeys.shortcuts.cycleSubTabNext, isMacPlatform)
      const isCyclePrevShortcut = eventMatchesShortcut(event, state.hotkeys.shortcuts.cycleSubTabPrev, isMacPlatform)
      if (!isCycleNextShortcut && !isCyclePrevShortcut) return

      event.preventDefault()

      const currentIndex = activeTab.activeSubTabId ? childTargets.findIndex((id) => id === activeTab.activeSubTabId) : 0
      const safeCurrentIndex = currentIndex >= 0 ? currentIndex : 0
      const direction = isCyclePrevShortcut ? -1 : 1
      const nextIndex = (safeCurrentIndex + direction + childTargets.length) % childTargets.length
      const nextChild = childTargets[nextIndex]

      if (nextChild === null) {
        selectTab(activeTab.id)
        return
      }

      selectSubTab(nextChild)
    }

    const handleMouseNavigation = (event: globalThis.MouseEvent) => {
      if (!state.hotkeys.enableMouseBackForward) return
      if (event.button === 3) {
        event.preventDefault()
        navigateHistoryBy(-1)
        return
      }
      if (event.button === 4) {
        event.preventDefault()
        navigateHistoryBy(1)
      }
    }

    window.addEventListener('keydown', handleKeydown)
    window.addEventListener('mouseup', handleMouseNavigation)
    return () => {
      window.removeEventListener('keydown', handleKeydown)
      window.removeEventListener('mouseup', handleMouseNavigation)
    }
  }, [viewMode, workspace.tabs, activeTab.id, activeTab.subTabs, activeTab.activeSubTabId, editingShortcut, isMacPlatform, state.hotkeys, arrangeMode.active])

  const primaryTablistProps =
    viewMode === 'settings'
      ? {}
      : ({
          role: 'tablist',
          'aria-label': 'Primary tabs',
        } as const)

  const topbarActions =
    [
      ...(viewMode === 'trash'
        ? [
            {
              key: 'trash-home',
              label: 'trash',
              selected: trashTabId === TRASH_HOME_ID,
              className: 'btn btn-sm tab-btn trash-home-tab topbar-action-btn',
              onClick: () => {
                setTrashTabId(TRASH_HOME_ID)
                setTrashSubTabId(null)
              },
            },
          ]
        : []),
      ...(arrangeMode.active
        ? [
            {
              key: 'end-arrangement',
              label: 'end arrangement',
              selected: false,
              className: 'btn btn-sm topbar-action-btn topbar-end-arrangement-btn',
              onClick: exitArrangeMode,
            },
          ]
        : []),
    ]

  const arrangeableParentTabClassName = arrangeMode.active && viewMode === 'main' ? 'is-arrangeable' : ''
  const arrangeableSubTabClassName = arrangeMode.active && viewMode === 'main' ? 'is-arrangeable' : ''
  const draggingParentTabId = arrangeMode.active && arrangeMode.dragItem?.type === 'tab' ? arrangeMode.dragItem.tabId : null
  const draggingSubTabId = arrangeMode.active && arrangeMode.dragItem?.type === 'subtab' ? arrangeMode.dragItem.subTabId : null

  return (
    <main
      className={`app-shell ${state.theme === 'light' ? 'theme-light' : 'theme-dark'} ${viewMode === 'trash' ? 'view-trash' : 'view-main'}`}
    >
      {viewMode !== 'spaces' && (
        <header className={`tabbar ${arrangeMode.active && viewMode === 'main' ? 'is-arranging' : ''}`}>
          <div className="tabbar-row">
            <div
              ref={primaryTabRailRef}
              className="tabbar-scroll tabbar-primary"
              onDragOver={handleArrangeTabRailDragOver}
              onDrop={handleArrangeTabRailDrop}
              {...primaryTablistProps}
            >
              {viewMode === 'settings' && <span className="settings-page-title">settings</span>}

              {viewMode === 'main' &&
                workspace.tabs.map((tab) =>
                  editing?.type === 'tab' && editing.id === tab.id ? (
                    <input
                      key={tab.id}
                    className="tab-rename-input"
                    defaultValue={tab.title}
                    autoFocus
                    onFocus={(event) => {
                      autoSizeRenameInput(event.currentTarget)
                      event.currentTarget.select()
                    }}
                    onInput={(event) => autoSizeRenameInput(event.currentTarget)}
                    onBlur={(event) => {
                      if (shouldSkipRenameBlur('tab', tab.id)) return
                      commitRename('tab', tab.id, event.target.value)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') commitRename('tab', tab.id, (event.target as HTMLInputElement).value)
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        cancelRename('tab', tab.id)
                      }
                    }}
                    />
                  ) : (
                    (() => {
                      const isArrangeMoveTarget =
                        arrangeMode.active &&
                        arrangeMode.dragItem?.type === 'subtab' &&
                        arrangeMode.overParentTabId === tab.id
                      const isArrangeBeforeTarget =
                        arrangeMode.active &&
                        arrangeMode.dragItem?.type === 'tab' &&
                        arrangeMode.overParentTabId === tab.id &&
                        arrangeMode.overParentInsert === 'before'
                      const isArrangeAfterTarget =
                        arrangeMode.active &&
                        arrangeMode.dragItem?.type === 'tab' &&
                        arrangeMode.overParentTabId === tab.id &&
                        arrangeMode.overParentInsert === 'after'
                      return (
                        <button
                          key={tab.id}
                          data-arrange-tab-id={tab.id}
                          type="button"
                          role="tab"
                          aria-selected={tab.id === activeTab.id}
                          draggable={arrangeMode.active}
                          className={`btn btn-sm ${tab.id === activeTab.id ? 'btn-primary' : 'btn-outline-secondary'} tab-btn parent-tab-btn ${arrangeableParentTabClassName} ${isArrangeMoveTarget ? 'is-arrange-target' : ''} ${isArrangeBeforeTarget ? 'is-arrange-target-before' : ''} ${isArrangeAfterTarget ? 'is-arrange-target-after' : ''} ${draggingParentTabId === tab.id ? 'is-dragging' : ''}`}
                          onClick={() => {
                            if (consumeArrangeClickSuppression(`tab:${tab.id}`)) return
                            selectTab(tab.id)
                          }}
                          onDoubleClick={() => {
                            if (arrangeMode.active) return
                            setEditing({ type: 'tab', id: tab.id })
                          }}
                          onContextMenu={(event) => openContextMenuForTab(event, tab.id)}
                          onPointerDown={(event) => startArrangePress(event, { type: 'tab', tabId: tab.id }, `tab:${tab.id}`)}
                          onPointerUp={clearArrangePressTimer}
                          onPointerLeave={clearArrangePressTimer}
                          onPointerCancel={clearArrangePressTimer}
                          onDragStart={(event) => beginArrangeTabDrag(event, tab.id)}
                          onDragOver={(event) => handleArrangeTabDragOver(event, tab.id)}
                          onDrop={(event) => handleArrangeTabDrop(event, tab.id)}
                          onDragEnd={endArrangeTabDrag}
                        >
                          {tab.title}
                        </button>
                      )
                    })()
                  ),
                )}

              {viewMode === 'trash' && (
                <>
                  {trashParentTabs.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      role="tab"
                      aria-selected={trashTabId === entry.id}
                      className={`btn btn-sm tab-btn trash-parent-tab ${trashTabId === entry.id ? 'is-selected' : ''}`}
                      onClick={() => {
                        setTrashTabId(entry.id)
                        setTrashSubTabId(null)
                      }}
                      onContextMenu={(event) => openContextMenuForTrashTab(event, entry)}
                    >
                      {entry.title}
                    </button>
                  ))}
                </>
              )}

              {viewMode === 'main' && !arrangeMode.active && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-light add-tab-btn"
                  onClick={addTab}
                  title="Add tab"
                >
                  +
                </button>
              )}
            </div>

            <div className="tabbar-controls">
              {topbarActions.length > 0 && (
                <div className="topbar-actions" role="group" aria-label="Top bar actions">
                  {topbarActions.map((action) => (
                    <button
                      key={action.key}
                      type="button"
                      aria-pressed={action.selected}
                      className={`${action.className} ${action.selected ? 'is-selected' : ''}`}
                      onClick={action.onClick}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}

              <div className="menu-wrap" onClick={(event) => event.stopPropagation()}>
                <button type="button" className="menu-btn" onClick={() => setMenuOpen((open) => !open)} aria-label="Menu">
                  ☰
                </button>
                {menuOpen && (
                  <div className="menu-dropdown">
                    <button type="button" className="menu-item" onClick={openSpacesView}>
                      spaces
                    </button>
                    <button type="button" className="menu-item" onClick={toggleTrashView}>
                      {viewMode === 'trash' ? 'tabs' : 'trash'}
                    </button>
                    <button type="button" className="menu-item" onClick={toggleTheme}>
                      {state.theme === 'dark' ? 'light mode' : 'dark mode'}
                    </button>
                    <button type="button" className="menu-item" onClick={openSettings}>
                      settings
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>
      )}

      {viewMode === 'spaces' ? (
        <section className="spaces-grid-wrap">
          <div className="spaces-grid">
            {state.spaces.map((space) =>
              editing?.type === 'space' && editing.id === space.id ? (
                <input
                  key={space.id}
                  className="space-rename-input"
                  defaultValue={space.name}
                  autoFocus
                  onBlur={(event) => {
                    if (shouldSkipRenameBlur('space', space.id)) return
                    commitRename('space', space.id, event.target.value)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      commitRename('space', space.id, (event.target as HTMLInputElement).value)
                      openSpace(space.id)
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      cancelRename('space', space.id)
                    }
                  }}
                />
              ) : (
                <button
                  key={space.id}
                  type="button"
                  className={`space-card ${space.id === state.activeSpaceId ? 'is-active' : ''}`}
                  onClick={() => openSpace(space.id)}
                  onContextMenu={(event) => openContextMenuForSpace(event, space.id)}
                >
                  <span className="space-card-name">{space.name}</span>
                </button>
              ),
            )}
            <button type="button" className="space-card space-card-add" onClick={addSpace} aria-label="Add space">
              +
            </button>
          </div>
        </section>
      ) : viewMode === 'settings' ? (
        <section className="settings-page-wrap">
          <div className="settings-page-card">
            <h2>settings</h2>
            <p>automatically remove deleted items after:</p>
            <div className="settings-field-row">
              <input
                type="number"
                className="settings-number-input"
                min={MIN_AUTO_REMOVE_DAYS}
                max={MAX_AUTO_REMOVE_DAYS}
                step={1}
                value={settingsDaysDraft}
                onChange={(event) => updateAutoRemoveDaysSetting(event.target.value)}
                onBlur={() => updateAutoRemoveDaysSetting(settingsDaysDraft, true)}
              />
              <span className="settings-field-suffix">days</span>
            </div>
            <p className="settings-help">
              min {MIN_AUTO_REMOVE_DAYS} day, max {MAX_AUTO_REMOVE_DAYS} days. default is {DEFAULT_AUTO_REMOVE_DAYS}.
            </p>
            <div className="settings-divider" />
            <p>hotkeys ({isMacPlatform ? 'mac' : 'windows'}):</p>
            <div className="settings-hotkeys-list">
              {(
                [
                  ['toggleTabTrash', 'toggle tabs/trash'],
                  ['openSpaces', 'open spaces'],
                  ['newSubTab', 'new sub tab'],
                  ['cycleSubTabNext', 'next sub tab'],
                  ['cycleSubTabPrev', 'previous sub tab'],
                ] as Array<[ShortcutId, string]>
              ).map(([shortcutId, label]) => (
                <div key={shortcutId} className="settings-hotkey-row">
                  <span className="settings-hotkey-label">{label}</span>
                  <button
                    type="button"
                    className={`settings-shortcut-btn ${editingShortcut === shortcutId ? 'is-recording' : ''}`}
                    onClick={() => setEditingShortcut((current) => (current === shortcutId ? null : shortcutId))}
                  >
                    {editingShortcut === shortcutId
                      ? 'press keys...'
                      : formatShortcutLabel(shortcutDrafts[shortcutId], isMacPlatform)}
                  </button>
                </div>
              ))}
            </div>
            <p className="settings-help">click a hotkey and press a new key combination. press escape to cancel.</p>
            <div className="settings-hotkey-row">
              <label className="settings-hotkey-label" htmlFor="settings-mouse-back-forward">
                enable mouse back/forward buttons
              </label>
              <div className="form-check form-switch settings-switch">
                <input
                  id="settings-mouse-back-forward"
                  className="form-check-input"
                  type="checkbox"
                  role="switch"
                  checked={mouseBackForwardEnabledDraft}
                  onChange={(event) => updateMouseBackForwardSetting(event.target.checked)}
                />
              </div>
            </div>
            <div className="settings-hotkey-row">
              <label className="settings-hotkey-label" htmlFor="settings-generic-history-hotkeys">
                enable generic back/forward hotkeys
              </label>
              <div className="form-check form-switch settings-switch">
                <input
                  id="settings-generic-history-hotkeys"
                  className="form-check-input"
                  type="checkbox"
                  role="switch"
                  checked={genericHistoryHotkeysEnabledDraft}
                  onChange={(event) => updateGenericHistoryHotkeysSetting(event.target.checked)}
                />
              </div>
            </div>
            <p className="settings-help">
              generic hotkeys: {isMacPlatform ? 'cmd+[ and cmd+]' : 'alt+left and alt+right'}.
            </p>
            <div className="settings-hotkey-row">
              <label
                className="settings-hotkey-label"
                htmlFor="settings-show-parent-home-tab"
                title='adds a fixed first sub-tab named "home" for each parent tab.'
              >
                show parent home tab with the other sub-tabs
              </label>
              <div className="form-check form-switch settings-switch">
                <input
                  id="settings-show-parent-home-tab"
                  className="form-check-input"
                  type="checkbox"
                  role="switch"
                  checked={showParentHomeTabDraft}
                  onChange={(event) => updateShowParentHomeTabSetting(event.target.checked)}
                />
              </div>
            </div>
            <p className="settings-help">
              when enabled, a locked <code>home</code> sub-tab appears first. it cannot be renamed or deleted.
            </p>
            <div className="settings-page-actions">
              <button type="button" className="btn btn-sm btn-outline-light" onClick={() => exportData('space')}>
                export space
              </button>
              <button type="button" className="btn btn-sm btn-outline-light" onClick={() => exportData('all')}>
                export all
              </button>
            </div>
            <p className="settings-help">exports convert internal tab markers to four spaces for clean markdown files.</p>
            {exportStatus && <p className="settings-help">{exportStatus}</p>}
          </div>
        </section>
      ) : (
        <>
          {(viewMode === 'main' || (viewMode === 'trash' && Boolean(selectedTrashTab))) && (
            <header
              className={`subtabbar ${arrangeMode.active && viewMode === 'main' ? 'is-arranging' : ''}`}
              role="tablist"
              aria-label="Nested note tabs"
            >
              <div ref={subTabRailRef} className="tabbar-scroll" onDragOver={handleArrangeSubTabRailDragOver} onDrop={handleArrangeSubTabRailDrop}>
                {viewMode === 'main' && state.ui.showParentHomeTab && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={!activeSubTab}
                    className={`btn btn-sm ${!activeSubTab ? 'btn-info' : 'btn-outline-info'} tab-btn subtab-btn home-subtab-btn ${arrangeableSubTabClassName} ${arrangeMode.active ? 'is-arrange-fixed' : ''} ${
                      arrangeMode.active &&
                      arrangeMode.dragItem?.type === 'subtab' &&
                      arrangeMode.dragItem.parentTabId === activeTab.id &&
                      activeTab.subTabs[0] &&
                      arrangeMode.overSubTabId === activeTab.subTabs[0].id &&
                      arrangeMode.overSubTabInsert === 'before'
                        ? 'is-arrange-home-target'
                        : ''
                    }`}
                    onClick={() => {
                      if (consumeArrangeClickSuppression(`home:${activeTab.id}`)) return
                      selectParentHomeTab()
                    }}
                    title="home note"
                    onPointerDown={(event) => startArrangePress(event, null, `home:${activeTab.id}`)}
                    onPointerUp={clearArrangePressTimer}
                    onPointerLeave={clearArrangePressTimer}
                    onPointerCancel={clearArrangePressTimer}
                    onDragOver={handleArrangeHomeSubTabDragOver}
                    onDrop={handleArrangeHomeSubTabDrop}
                  >
                    home
                  </button>
                )}

                {viewMode === 'main' &&
                  activeTab.subTabs.map((subTab) =>
                    editing?.type === 'subtab' && editing.id === subTab.id ? (
                      <input
                        key={subTab.id}
                        className="tab-rename-input"
                        defaultValue={subTab.title}
                        autoFocus
                        onFocus={(event) => {
                          autoSizeRenameInput(event.currentTarget)
                          event.currentTarget.select()
                        }}
                        onInput={(event) => autoSizeRenameInput(event.currentTarget)}
                        onBlur={(event) => {
                          if (shouldSkipRenameBlur('subtab', subTab.id)) return
                          commitRename('subtab', subTab.id, event.target.value)
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') commitRename('subtab', subTab.id, (event.target as HTMLInputElement).value)
                          if (event.key === 'Escape') {
                            event.preventDefault()
                            cancelRename('subtab', subTab.id)
                          }
                        }}
                      />
                    ) : (
                      <button
                        key={subTab.id}
                        data-arrange-subtab-id={subTab.id}
                        type="button"
                        role="tab"
                        aria-selected={subTab.id === activeSubTab?.id}
                        draggable={arrangeMode.active}
                        className={`btn btn-sm ${subTab.id === activeSubTab?.id ? 'btn-info' : 'btn-outline-info'} tab-btn subtab-btn ${arrangeableSubTabClassName} ${
                          arrangeMode.active &&
                          arrangeMode.dragItem?.type === 'subtab' &&
                          arrangeMode.dragItem.parentTabId === activeTab.id &&
                          arrangeMode.overSubTabId === subTab.id &&
                          arrangeMode.overSubTabInsert === 'before'
                            ? 'is-arrange-target-before'
                            : ''
                        } ${
                          arrangeMode.active &&
                          arrangeMode.dragItem?.type === 'subtab' &&
                          arrangeMode.dragItem.parentTabId === activeTab.id &&
                          arrangeMode.overSubTabId === subTab.id &&
                          arrangeMode.overSubTabInsert === 'after'
                            ? 'is-arrange-target-after'
                            : ''
                        } ${draggingSubTabId === subTab.id ? 'is-dragging' : ''}`}
                        onClick={() => {
                          if (consumeArrangeClickSuppression(`subtab:${subTab.id}`)) return
                          selectSubTab(subTab.id)
                        }}
                        onDoubleClick={() => {
                          if (arrangeMode.active) return
                          setEditing({ type: 'subtab', id: subTab.id })
                        }}
                        onContextMenu={(event) => openContextMenuForSubTab(event, activeTab.id, subTab.id)}
                        onPointerDown={(event) =>
                          startArrangePress(event, { type: 'subtab', parentTabId: activeTab.id, subTabId: subTab.id }, `subtab:${subTab.id}`)
                        }
                        onPointerUp={clearArrangePressTimer}
                        onPointerLeave={clearArrangePressTimer}
                        onPointerCancel={clearArrangePressTimer}
                        onDragStart={(event) => beginArrangeSubTabDrag(event, activeTab.id, subTab.id)}
                        onDragOver={(event) => handleArrangeSubTabDragOver(event, subTab.id)}
                        onDrop={(event) => handleArrangeSubTabDrop(event, subTab.id)}
                        onDragEnd={endArrangeSubTabDrag}
                      >
                        {subTab.title}
                      </button>
                    ),
                  )}

                {viewMode === 'trash' &&
                  trashSubTabs.map((subTab) => (
                    <button
                      key={subTab.id}
                      type="button"
                      role="tab"
                      aria-selected={subTab.id === selectedTrashSubTab?.id}
                      className={`btn btn-sm tab-btn trash-subtab-btn ${subTab.id === selectedTrashSubTab?.id ? 'is-selected' : ''}`}
                      onClick={() => setTrashSubTabId(subTab.id)}
                      onContextMenu={(event) => {
                        if (!selectedTrashTab) return
                        openContextMenuForTrashSubTab(event, selectedTrashTab, subTab.id)
                      }}
                    >
                      {subTab.title}
                    </button>
                  ))}

                {viewMode === 'main' && !arrangeMode.active && (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-light add-tab-btn"
                    onClick={addSubTab}
                    title="Add note tab"
                  >
                    +
                  </button>
                )}
              </div>
            </header>
          )}

          {isTrashHomeSelected ? (
            <section className="trash-home-note">
              <p>Items moved here are pending deletion.</p>
              <ul>
                <li>Use <strong>Restore All</strong> to move everything back into notes.</li>
                <li>Use <strong>delete all</strong> to permanently remove all items in Trash.</li>
                <li>This Trash note is read-only.</li>
              </ul>
              <div className="trash-home-actions">
                <button type="button" className="btn btn-sm btn-outline-light" onClick={() => setModal({ type: 'trash-restore-all' })}>
                  restore all
                </button>
                <button type="button" className="btn btn-sm btn-danger" onClick={() => setModal({ type: 'trash-delete-all' })}>
                  delete all
                </button>
              </div>
            </section>
          ) : (
            <section className={`editor-shell ${editorReadOnly ? 'editor-readonly' : ''}`}>
              <div ref={editorMountRef} className="toast-editor-host" />
              {viewMode === 'main' && imageTools.visible && (
                <>
                  <div className="image-tools" style={{ top: `${imageTools.cropTop}px`, left: `${imageTools.cropLeft}px` }}>
                    {!inlineCrop.active ? (
                      <button type="button" className="image-tool-btn" onClick={startInlineCrop} title="Crop">
                        crop
                      </button>
                    ) : (
                      <>
                        <button type="button" className="image-tool-btn" onClick={applyInlineCrop} title="Apply crop">
                          apply
                        </button>
                        <button type="button" className="image-tool-btn" onClick={cancelInlineCrop} title="Cancel crop">
                          cancel
                        </button>
                      </>
                    )}
                  </div>
                  {!inlineCrop.active && (
                    <button
                      type="button"
                      className="image-resize-handle"
                      style={{ top: `${imageTools.resizeTop}px`, left: `${imageTools.resizeLeft}px` }}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={(event) => event.preventDefault()}
                      onPointerDown={beginImageResize}
                      aria-label="Resize image"
                      title="Drag to resize"
                    />
                  )}
                  {inlineCrop.active && (
                    <div
                      className="inline-crop-box"
                      style={{
                        top: `${inlineCrop.top}px`,
                        left: `${inlineCrop.left}px`,
                        width: `${inlineCrop.width}px`,
                        height: `${inlineCrop.height}px`,
                      }}
                      onPointerDown={(event) => beginInlineCropDrag('move', event)}
                    >
                      <button
                        type="button"
                        className="inline-crop-resize-handle"
                        onPointerDown={(event) => beginInlineCropDrag('resize', event)}
                        onClick={(event) => event.preventDefault()}
                        aria-label="Resize crop area"
                        title="Drag to resize crop area"
                      />
                    </div>
                  )}
                </>
              )}
              {viewMode === 'main' && linkPrompt.open && (
                <div
                  className="link-prompt"
                  style={{ top: `${linkPrompt.top}px`, left: `${linkPrompt.left}px` }}
                  onMouseDown={(event) => event.stopPropagation()}
                >
                  <input
                    ref={linkPromptInputRef}
                    className="link-prompt-input"
                    value={linkPrompt.text}
                    placeholder="link name"
                    onChange={(event) => setLinkPrompt((previous) => ({ ...previous, text: event.target.value }))}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        insertNamedLinkFromPrompt()
                      } else if (event.key === 'Escape') {
                        event.preventDefault()
                        closeLinkPrompt()
                      }
                    }}
                  />
                  <button type="button" className="link-prompt-btn" onClick={insertNamedLinkFromPrompt}>
                    done
                  </button>
                </div>
              )}
              {editorReadOnly && <div className="editor-lock" aria-hidden="true" />}
            </section>
          )}
        </>
      )}

      {contextMenu && (
        <div
          className="tab-context-menu"
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          role="menu"
          onClick={(event) => event.stopPropagation()}
        >
          {contextMenu.type === 'space' ? (
            <>
              <button type="button" className="tab-context-delete" onClick={beginRenameSpaceFromContext}>
                Rename Space
              </button>
              <button
                type="button"
                className="tab-context-delete"
                onClick={() => {
                  if (!canDeleteSpace) {
                    setContextMenu(null)
                    return
                  }
                  openDeleteModalFromContext(false)
                }}
                disabled={!canDeleteSpace}
              >
                delete Space
              </button>
            </>
          ) : contextMenu.type === 'trash-tab' || contextMenu.type === 'trash-subtab' ? (
            <button
              type="button"
              className="tab-context-delete tab-context-danger"
              onClick={() => openDeleteModalFromContext(true)}
            >
              delete for real
            </button>
          ) : (
            <>
              <button type="button" className="tab-context-delete" onClick={enterArrangeModeFromContext}>
                arrange
              </button>
              <button type="button" className="tab-context-delete" onClick={deleteFromContext}>
                delete
              </button>
              <button
                type="button"
                className="tab-context-delete tab-context-danger"
                onClick={() => openDeleteModalFromContext(true)}
              >
                delete for real
              </button>
            </>
          )}
        </div>
      )}

      {modal && (
        <div className="delete-modal-backdrop" onClick={() => setModal(null)}>
          <div className="delete-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h2>{modalText.title}</h2>
            <p>{modalText.body}</p>
            {requiresSpaceDeleteAcknowledge && (
              <label className="delete-ack-row">
                <input
                  type="checkbox"
                  checked={spaceDeleteAcknowledge}
                  onChange={(event) => setSpaceDeleteAcknowledge(event.target.checked)}
                />
                <span>I understand this data cannot be recovered.</span>
              </label>
            )}
            <div className="delete-modal-actions">
              <button type="button" className="btn btn-sm btn-outline-light modal-cancel-btn" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                disabled={!canConfirmModal}
                onClick={() => {
                  if (modal.type === 'delete-target' && modal.target.type === 'space' && state.spaces.length <= 1) {
                    setModal(null)
                    return
                  }
                  confirmModal()
                }}
              >
                {modalText.action}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="app-toast-layer" aria-live="polite" aria-atomic="true">
          <div key={toast.id} className={`app-toast app-toast-${toast.tone}`}>
            {toast.message}
          </div>
        </div>
      )}

    </main>
  )
}

export default App
