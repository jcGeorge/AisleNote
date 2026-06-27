import * as React from 'react'
import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
} from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { buildAisleEditorKey } from '../../editor/aisle-editor'
import { clampAisleWidth } from '../../notes/aisle-widths'
import { RENDERED_MARKDOWN_SURFACE_CLASS } from '../../editor/rendered-markdown-surface'
import type { TableOfContentsLinkItem } from '../../editor/table-of-contents'
import { recordDiagnosticEvent } from '../../diagnostics/diagnostic-logger'
import { resolveAssetDisplayUrl } from '../../markdown/image-asset-registry'
import type { AppState, NoteLocation, ResolvedNoteAisle, TabColorIndicatorPlacement } from '../../types/app'
import { ToolbarToolIcon } from '../editor/ToolbarToolIcon'
import { getAislePreviewSegments } from './aisle-markdown-preview-segments'
import { NotePreviewContent } from './NotePreviewContent'
import { AisleHorizontalScrollbar } from './AisleHorizontalScrollbar'
import { NoteTabStrip, type NoteTabRenameCommitSource, type NoteTabStripItem } from './NoteTabStrip'
import {
  MarkdownPreviewHeading1,
  MarkdownPreviewHeading2,
  MarkdownPreviewHeading3,
  MarkdownPreviewHeading4,
  MarkdownPreviewHeading5,
  MarkdownPreviewHeading6,
  MarkdownPreviewInput,
  MarkdownPreviewLink,
  MarkdownPreviewListItem,
  MarkdownPreviewParagraph,
  createMarkdownPreviewListItem,
  createMarkdownPreviewUnorderedList,
} from './markdown-preview-components'
import {
  getAisleActivationPointerFromNoteWorkspaceMouseEvent,
  getAisleActivationPointerFromNoteWorkspaceEvent,
  getAisleEditorKeyFromNoteWorkspacePointerTarget,
  getRightSideBlockGutterTarget,
  scheduleNoteWorkspaceArrangeExit,
  shouldActivateAisleFromNoteWorkspacePointer,
  shouldExitArrangeModeFromNoteWorkspacePointer,
} from './note-workspace-events'
import {
  getAislePreviewRenderMode,
  getLightweightPreviewText,
  getMarkdownWorkloadProfile,
} from './note-workspace-preview'
import { getTableOfContentsPanelKeyboardAction } from './table-of-contents-panel-keyboard'

void React

type HeadingOutlineItem = {
  key: string
  level: number
  text: string
}

const transformAislePreviewUrl = (url: string, key: string) => {
  if (key === 'href' && /^aislenote-asset:/i.test(url)) return url
  if (key === 'src' && (/^data:image\//i.test(url) || /^blob:/i.test(url) || /^aislenote-asset:/i.test(url))) {
    return resolveAssetDisplayUrl(url)
  }
  return defaultUrlTransform(url)
}

const noteWorkspacePreviewMarkdownComponents = {
  h1: MarkdownPreviewHeading1,
  h2: MarkdownPreviewHeading2,
  h3: MarkdownPreviewHeading3,
  h4: MarkdownPreviewHeading4,
  h5: MarkdownPreviewHeading5,
  h6: MarkdownPreviewHeading6,
  input: MarkdownPreviewInput,
  li: MarkdownPreviewListItem,
  p: MarkdownPreviewParagraph,
}

const NoteWorkspaceMarkdownPreview = memo(function NoteWorkspaceMarkdownPreview({
  markdown,
  appState,
  currentNoteBodyId,
  onOpenNoteReference,
}: {
  markdown: string
  appState?: AppState | null
  currentNoteBodyId: string
  onOpenNoteReference?: (target: NoteLocation) => void
}) {
  const markdownComponents = useMemo(
    () => ({
      ...noteWorkspacePreviewMarkdownComponents,
      li: createMarkdownPreviewListItem(markdown),
      ul: createMarkdownPreviewUnorderedList(markdown),
      a: (props: React.ComponentProps<typeof MarkdownPreviewLink>) => (
        <MarkdownPreviewLink {...props} appState={appState} onOpenNote={onOpenNoteReference} />
      ),
    }),
    [appState, markdown, onOpenNoteReference],
  )

  return getAislePreviewSegments(markdown, appState).map((segment, segmentIndex) => (
    <Fragment key={`${segment.type}-${segmentIndex}`}>
      {segment.type === 'markdown' ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          urlTransform={transformAislePreviewUrl}
          components={markdownComponents}
        >
          {segment.markdown}
        </ReactMarkdown>
      ) : appState ? (
        <NotePreviewContent
          appState={appState}
          target={segment.payload.target}
          currentNoteBodyId={currentNoteBodyId}
          depth={1}
          label={segment.label}
          aisleIds={segment.payload.aisleIds}
          onOpenNote={onOpenNoteReference}
        />
      ) : (
        null
      )}
    </Fragment>
  ))
})

function assignRef<T>(ref: Ref<T>, value: T | null) {
  if (typeof ref === 'function') {
    ref(value)
    return
  }

  if (ref) {
    ;(ref as MutableRefObject<T | null>).current = value
  }
}

type AisleActivationPointer = {
  clientX: number
  clientY: number
  mode: 'coordinate' | 'focus-only'
}

type NoteWorkspaceProps = {
  noteBodyId: string
  aisles: ResolvedNoteAisle[]
  activeAisleId: string
  editorReadOnly: boolean
  arrangeModeActive?: boolean
  frontmatterAisleIds?: Set<string>
  linkedAisleIds?: Set<string>
  wholeNoteLinked?: boolean
  aisleScrollRef: Ref<HTMLDivElement>
  toolbar: ReactNode
  headingPopover: ReactNode
  imageToolsOverlay: ReactNode
  tableControlsOverlay: ReactNode
  listReorderControlsOverlay?: ReactNode
  arrangeDestinationPrompt?: ReactNode
  tableOfContentsHeadingsByAisle?: Record<string, HeadingOutlineItem[]>
  tableOfContentsLinksByAisle?: Record<string, TableOfContentsLinkItem[]>
  openTableOfContentsAisleIds?: Set<string>
  aisleWidths?: Record<string, number>
  onExitArrangeMode?: () => void
  onRootChange: (node: HTMLElement | null) => void
  onAisleScroll: (scrollLeft: number) => void
  onActivateAisle: (editorKey: string, pointer?: AisleActivationPointer) => void
  onResizeAisleWidth?: (aisleId: string, width: number) => void
  onResetAisleWidth?: (aisleId: string) => void
  onAisleWidthDragCommitted?: () => void
  mountedAisleIds: Set<string>
  failedEditorMountAisleIds?: Set<string>
  suppressActiveAislePreviewFallback?: boolean
  deferInactivePreviewFallbacks?: boolean
  getPreviewMarkdownForAisle: (aisle: ResolvedNoteAisle) => string
  onCloseTableOfContentsAisle?: (aisleId: string) => void
  onSelectTableOfContentsHeading?: (aisleId: string, headingKey: string) => void
  onSelectTableOfContentsLink?: (aisleId: string, linkKey: string) => void
  onOpenAisleFrontmatter?: (aisleId: string) => void
  onOpenAisleLink?: (aisleId: string) => void
  appState?: AppState | null
  onOpenNoteReference?: (target: NoteLocation) => void
  onOpenTagFilter?: (tag: string) => void
  onSelectEditableAsset?: (target: Element) => void
  onRegisterAislePaneRoot: (aisleId: string, node: HTMLElement | null) => void
  onRegisterAisleEditorRoot: (editorKey: string, node: HTMLElement | null) => void
  tabColorIndicatorPlacement?: TabColorIndicatorPlacement
  noteTabs?: NoteTabStripItem[]
  renamingNoteTabId?: string
  noteTabRenameDraft?: string
  onSelectNoteTab?: (noteId: string) => void
  onCloseNoteTab?: (noteId: string) => void
  onPromoteNoteTab?: (noteId: string) => void
  onReorderNoteTabs?: (sourceNoteId: string, targetIndex: number) => void
  onStartNoteTabRename?: (noteId: string, title: string) => void
  onNoteTabRenameDraftChange?: (title: string) => void
  onCommitNoteTabRename?: (source: NoteTabRenameCommitSource) => void
  onCancelNoteTabRename?: () => void
}

type AisleTableOfContentsPanelProps = {
  aisleId: string
  headings: HeadingOutlineItem[]
  links: TableOfContentsLinkItem[]
  onClose: (aisleId: string) => void
  onSelectHeading: (aisleId: string, headingKey: string) => void
  onSelectLink: (aisleId: string, linkKey: string) => void
}

function AisleTableOfContentsPanel({
  aisleId,
  headings,
  links,
  onClose,
  onSelectHeading,
  onSelectLink,
}: AisleTableOfContentsPanelProps) {
  const hasHeadings = headings.length > 0
  const hasLinks = links.length > 0
  const itemCount = headings.length + links.length
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const panelClassName = [
    'aisle-toc-panel',
    hasHeadings ? 'has-headings' : '',
    hasLinks ? 'has-links' : '',
  ].filter(Boolean).join(' ')

  const setItemRef = useCallback((index: number, node: HTMLButtonElement | null) => {
    itemRefs.current[index] = node
  }, [])

  const focusItem = useCallback(
    (index: number) => {
      if (itemCount <= 0) return
      const nextIndex = Math.max(0, Math.min(itemCount - 1, index))
      setActiveIndex(nextIndex)
      itemRefs.current[nextIndex]?.focus({ preventScroll: true })
    },
    [itemCount],
  )

  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, itemCount)
    setActiveIndex(0)
    if (itemCount <= 0) return undefined
    const frame = window.requestAnimationFrame(() => {
      itemRefs.current[0]?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [aisleId, itemCount])

  let keyboardItemIndex = 0

  return (
    <div
      className="aisle-toc-panel-layer"
      data-note-workspace-skip-aisle-activation="true"
      onPointerDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
        if (event.target === event.currentTarget) {
          onClose(aisleId)
        }
      }}
    >
      <section
        className={panelClassName}
        role="dialog"
        aria-label="Table of contents"
        onKeyDown={(event) => {
          const action = getTableOfContentsPanelKeyboardAction(event.nativeEvent, activeIndex, itemCount)
          if (action.type === 'none') return
          event.preventDefault()
          event.stopPropagation()
          if (action.type === 'close') {
            onClose(aisleId)
            return
          }
          if (action.type === 'highlight') {
            focusItem(action.index)
            return
          }
          itemRefs.current[action.index]?.click()
        }}
        onPointerDown={(event) => {
          event.stopPropagation()
        }}
      >
        <div className="aisle-toc-sections">
          {hasHeadings && (
            <section className="aisle-toc-section aisle-toc-heading-section" aria-label="Table of contents headings">
              <h4 className="aisle-toc-panel-title">Headers</h4>
              <div className="aisle-toc-list aisle-toc-heading-list">
                {headings.map((heading) => {
                  const itemIndex = keyboardItemIndex
                  keyboardItemIndex += 1
                  return (
                    <button
                      key={heading.key}
                      ref={(node) => setItemRef(itemIndex, node)}
                      type="button"
                      className={`aisle-toc-heading-btn${itemIndex === activeIndex ? ' is-active' : ''}`}
                      aria-current={itemIndex === activeIndex ? 'true' : undefined}
                      style={{ '--toc-heading-indent': `${Math.max(0, heading.level - 1) * 0.78}rem` } as CSSProperties}
                      onFocus={() => setActiveIndex(itemIndex)}
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        onSelectHeading(aisleId, heading.key)
                      }}
                    >
                      {heading.text || `heading ${heading.level}`}
                    </button>
                  )
                })}
              </div>
            </section>
          )}
          {hasLinks && (
            <section className="aisle-toc-section aisle-toc-links-section" aria-label="Table of contents links">
              <h4 className="aisle-toc-panel-title">Links</h4>
              <div className="aisle-toc-list aisle-toc-link-list">
                {links.map((link) => {
                  const itemIndex = keyboardItemIndex
                  keyboardItemIndex += 1
                  return (
                    <button
                      key={link.key}
                      ref={(node) => setItemRef(itemIndex, node)}
                      type="button"
                      className={`aisle-toc-heading-btn aisle-toc-link-btn${itemIndex === activeIndex ? ' is-active' : ''}`}
                      aria-current={itemIndex === activeIndex ? 'true' : undefined}
                      onFocus={() => setActiveIndex(itemIndex)}
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        onSelectLink(aisleId, link.key)
                      }}
                    >
                      {link.label}
                    </button>
                  )
                })}
              </div>
            </section>
          )}
        </div>
      </section>
    </div>
  )
}

export function NoteWorkspace({
  noteBodyId,
  aisles,
  activeAisleId,
  editorReadOnly,
  arrangeModeActive = false,
  frontmatterAisleIds = new Set(),
  linkedAisleIds = new Set(),
  wholeNoteLinked = false,
  aisleScrollRef,
  toolbar,
  headingPopover,
  imageToolsOverlay,
  tableControlsOverlay,
  listReorderControlsOverlay = null,
  arrangeDestinationPrompt = null,
  tableOfContentsHeadingsByAisle = {},
  tableOfContentsLinksByAisle = {},
  openTableOfContentsAisleIds = new Set(),
  aisleWidths = {},
  onExitArrangeMode,
  onRootChange,
  onAisleScroll,
  onActivateAisle,
  onResizeAisleWidth = () => undefined,
  onResetAisleWidth = () => undefined,
  onAisleWidthDragCommitted = () => undefined,
  mountedAisleIds,
  suppressActiveAislePreviewFallback = false,
  deferInactivePreviewFallbacks = false,
  getPreviewMarkdownForAisle,
  onCloseTableOfContentsAisle = () => undefined,
  onSelectTableOfContentsHeading = () => undefined,
  onSelectTableOfContentsLink = () => undefined,
  onOpenAisleFrontmatter = () => undefined,
  onOpenAisleLink = () => undefined,
  appState = null,
  onOpenNoteReference,
  onOpenTagFilter = () => undefined,
  onSelectEditableAsset = () => undefined,
  onRegisterAislePaneRoot,
  onRegisterAisleEditorRoot,
  failedEditorMountAisleIds,
  tabColorIndicatorPlacement = 'bottom',
  noteTabs = [],
  renamingNoteTabId = '',
  noteTabRenameDraft = '',
  onSelectNoteTab = () => undefined,
  onCloseNoteTab = () => undefined,
  onPromoteNoteTab = () => undefined,
  onReorderNoteTabs = () => undefined,
  onStartNoteTabRename = () => undefined,
  onNoteTabRenameDraftChange = () => undefined,
  onCommitNoteTabRename = () => undefined,
  onCancelNoteTabRename = () => undefined,
}: NoteWorkspaceProps) {
  const [aisleScrollNode, setAisleScrollNode] = useState<HTMLDivElement | null>(null)
  const aisleResizeDragRef = useRef<{
    pointerId: number
    aisleId: string
    startClientX: number
    startWidth: number
    moved: boolean
  } | null>(null)
  const isSplitWorkspace = aisles.length > 1
  const inactivePreviewHydrationKey = `${noteBodyId}\n${aisles.map((aisle) => aisle.id).join('\n')}`
  const [hydratedInactivePreviewKey, setHydratedInactivePreviewKey] = useState('')
  const inactivePreviewsHydrated = hydratedInactivePreviewKey === inactivePreviewHydrationKey
  const activeAisleIdForHydrationDiagnosticsRef = useRef(activeAisleId)

  useEffect(() => {
    activeAisleIdForHydrationDiagnosticsRef.current = activeAisleId
  }, [activeAisleId])

  useEffect(() => {
    if (!deferInactivePreviewFallbacks) {
      setHydratedInactivePreviewKey(inactivePreviewHydrationKey)
      return
    }

    setHydratedInactivePreviewKey('')
    let cancelled = false
    let timeoutId: number | null = null
    let frameId: number | null = null
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const idleWindow = window as unknown as {
      requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number
      cancelIdleCallback?: (handle: number) => void
    }
    const hydrate = () => {
      if (cancelled) return
      setHydratedInactivePreviewKey(inactivePreviewHydrationKey)
      recordDiagnosticEvent('note-workspace', 'inactive-preview-hydration', {
        level: 'info',
        durationMs: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt,
        details: {
          noteBodyId,
          aisleCount: aisles.length,
          activeAisleId: activeAisleIdForHydrationDiagnosticsRef.current,
        },
      })
    }
    if (typeof idleWindow.requestIdleCallback === 'function') {
      const idleId = idleWindow.requestIdleCallback(hydrate, { timeout: 250 })
      return () => {
        cancelled = true
        idleWindow.cancelIdleCallback?.(idleId)
      }
    }
    frameId = window.requestAnimationFrame(() => {
      timeoutId = window.setTimeout(hydrate, 0)
    })
    return () => {
      cancelled = true
      if (frameId !== null) window.cancelAnimationFrame(frameId)
      if (timeoutId !== null) window.clearTimeout(timeoutId)
    }
  }, [aisles.length, deferInactivePreviewFallbacks, inactivePreviewHydrationKey, noteBodyId])

  const setAisleScrollRef = useCallback(
    (node: HTMLDivElement | null) => {
      setAisleScrollNode((currentNode) => (currentNode === node ? currentNode : node))
      assignRef(aisleScrollRef, node)
    },
    [aisleScrollRef],
  )

  const startAisleWidthDrag = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, aisleId: string) => {
      if (event.button !== 0) return
      const pane = event.currentTarget.closest<HTMLElement>('.note-aisle-pane')
      const startWidth = pane?.getBoundingClientRect().width || aisleWidths[aisleId] || 0
      const clampedStartWidth = clampAisleWidth(startWidth)
      if (clampedStartWidth === null) return
      event.preventDefault()
      event.stopPropagation()
      aisleResizeDragRef.current = {
        pointerId: event.pointerId,
        aisleId,
        startClientX: event.clientX,
        startWidth: clampedStartWidth,
        moved: false,
      }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [aisleWidths],
  )

  const updateAisleWidthDrag = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const drag = aisleResizeDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      const nextWidth = clampAisleWidth(drag.startWidth + event.clientX - drag.startClientX)
      if (nextWidth === null) return
      event.preventDefault()
      event.stopPropagation()
      if (nextWidth !== drag.startWidth) {
        drag.moved = true
        onResizeAisleWidth(drag.aisleId, nextWidth)
      }
    },
    [onResizeAisleWidth],
  )

  const finishAisleWidthDrag = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const drag = aisleResizeDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      aisleResizeDragRef.current = null
      event.preventDefault()
      event.stopPropagation()
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      if (drag.moved) {
        onAisleWidthDragCommitted()
      }
    },
    [onAisleWidthDragCommitted],
  )

  const activateAisleFromWorkspaceTarget = useCallback(
    (target: EventTarget | null, pointer?: AisleActivationPointer) => {
      const editorKey = getAisleEditorKeyFromNoteWorkspacePointerTarget(target)
      if (!editorKey) return null
      const gutterTarget = pointer ? getRightSideBlockGutterTarget(target, pointer) : null
      onActivateAisle(
        editorKey,
        pointer && gutterTarget
          ? { ...pointer, mode: 'focus-only' }
          : pointer,
      )
      return gutterTarget
    },
    [onActivateAisle],
  )

  return (
    <section
      ref={onRootChange}
      className={`note-aisles-shell ${isSplitWorkspace ? 'is-split' : 'is-single'} is-tab-indicator-${tabColorIndicatorPlacement}`}
    >
      {toolbar}
      {headingPopover}
      {imageToolsOverlay}
      {tableControlsOverlay}
      {listReorderControlsOverlay}
      {arrangeDestinationPrompt}
      <div
        ref={setAisleScrollRef}
        className="note-aisle-scroll"
        onPointerDownCapture={(event) => {
          if (shouldExitArrangeModeFromNoteWorkspacePointer(arrangeModeActive, event.button)) {
            scheduleNoteWorkspaceArrangeExit(onExitArrangeMode)
          }
          const shouldActivateAisle = shouldActivateAisleFromNoteWorkspacePointer(event.button)
          if (shouldActivateAisle && !editorReadOnly && event.target instanceof Element) {
            onSelectEditableAsset(event.target)
          }
          const pointer = shouldActivateAisle
            ? getAisleActivationPointerFromNoteWorkspaceEvent(event.nativeEvent)
            : undefined
          if (pointer) {
            const gutterTarget = activateAisleFromWorkspaceTarget(event.target, pointer)
            if (gutterTarget) {
              event.preventDefault()
            }
          }
        }}
        onMouseDownCapture={(event) => {
          if (!shouldActivateAisleFromNoteWorkspacePointer(event.button)) return
          const pointer = getAisleActivationPointerFromNoteWorkspaceMouseEvent(event.nativeEvent)
          const gutterTarget = activateAisleFromWorkspaceTarget(event.target, pointer)
          if (gutterTarget) {
            event.preventDefault()
            event.stopPropagation()
            event.nativeEvent.stopImmediatePropagation()
          }
        }}
        onClickCapture={(event) => {
          const target = event.target instanceof Element ? event.target : null
          const tagToken = target?.closest<HTMLElement>('[data-aislenote-tag]')
          const tag = tagToken?.dataset.aislenoteTag?.trim()
          if (!tag) return
          event.preventDefault()
          event.stopPropagation()
          onOpenTagFilter(tag)
        }}
        onScroll={(event) => onAisleScroll(event.currentTarget.scrollLeft)}
      >
        {aisles.map((aisle, index) => {
          const editorKey = buildAisleEditorKey(noteBodyId, aisle.id)
          const editorMountFailed = failedEditorMountAisleIds?.has(aisle.id) ?? false
          const editorMounted = mountedAisleIds.has(aisle.id) && !editorMountFailed
          const editorMountPending =
            suppressActiveAislePreviewFallback && !editorMounted && !editorMountFailed && aisle.id === activeAisleId
          const previewMarkdown = editorMounted || editorMountPending ? '' : getPreviewMarkdownForAisle(aisle)
          const previewProfile =
            previewMarkdown.length > 0
              ? getMarkdownWorkloadProfile(previewMarkdown, aisle.aisleBodyId || aisle.id)
              : null
          const previewRenderMode = getAislePreviewRenderMode({
            active: aisle.id === activeAisleId,
            arrangeModeActive,
            deferInactivePreviewFallbacks,
            editorMounted,
            editorMountPending,
            inactivePreviewsHydrated,
            profile: previewProfile,
          })
          const renderedPreviewMarkdown = previewRenderMode === 'markdown-preview' ? previewMarkdown : ''
          const lightweightPreviewText =
            previewRenderMode === 'lightweight-preview' ? getLightweightPreviewText(previewMarkdown) : ''
          const previewHydrationPending =
            previewRenderMode === 'lightweight-preview' &&
            deferInactivePreviewFallbacks &&
            !inactivePreviewsHydrated &&
            Boolean(previewProfile?.isLinkHeavy)
          const tableOfContentsHeadings = tableOfContentsHeadingsByAisle[aisle.id] ?? []
          const tableOfContentsLinks = tableOfContentsLinksByAisle[aisle.id] ?? []
          const tableOfContentsOpen =
            openTableOfContentsAisleIds.has(aisle.id) &&
            (tableOfContentsHeadings.length > 0 || tableOfContentsLinks.length > 0)
          const showLinkButton = wholeNoteLinked || linkedAisleIds.has(aisle.id)
          const showFrontmatterButton = frontmatterAisleIds.has(aisle.id)
          const customAisleWidth = isSplitWorkspace ? aisleWidths[aisle.id] : undefined
          const aislePaneStyle =
            typeof customAisleWidth === 'number'
              ? ({ '--note-aisle-width': `${customAisleWidth}px` } as CSSProperties)
              : undefined
          const aislePaneClassName = [
            'note-aisle-pane',
            aisle.id === activeAisleId ? 'is-active' : '',
            customAisleWidth ? 'has-custom-width' : '',
          ].filter(Boolean).join(' ')
          return (
            <section
              key={aisle.id}
              ref={(node) => onRegisterAislePaneRoot(aisle.id, node)}
              className={aislePaneClassName}
              style={aislePaneStyle}
              aria-label={`Aisle ${index + 1}`}
              data-aisle-id={aisle.id}
              data-aisle-editor-key={editorKey}
            >
              {isSplitWorkspace && (
                <button
                  type="button"
                  className="note-aisle-resize-btn"
                  aria-label={`Resize aisle ${index + 1}`}
                  data-app-tooltip="Drag to resize. Double click to reset."
                  data-note-workspace-skip-aisle-activation="true"
                  onPointerDown={(event) => startAisleWidthDrag(event, aisle.id)}
                  onPointerMove={updateAisleWidthDrag}
                  onPointerUp={finishAisleWidthDrag}
                  onPointerCancel={finishAisleWidthDrag}
                  onDoubleClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    onResetAisleWidth(aisle.id)
                  }}
                >
                  <span className="note-aisle-resize-capsule" aria-hidden="true" />
                </button>
              )}
              {(showLinkButton || showFrontmatterButton) && (
                <div className="note-aisle-action-layer" aria-label={`Aisle ${index + 1} actions`}>
                  {showLinkButton && (
                    <div className="note-aisle-action-wrap">
                      <button
                        type="button"
                        className="note-aisle-action-btn note-aisle-link-btn"
                        aria-label={`Open de-couple for aisle ${index + 1}`}
                        data-app-tooltip="De-couple"
                        data-note-workspace-skip-aisle-activation="true"
                        onPointerDown={(event) => {
                          event.stopPropagation()
                        }}
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          onOpenAisleLink(aisle.id)
                        }}
                      >
                        <ToolbarToolIcon toolId="link" className="note-aisle-link-icon" />
                      </button>
                    </div>
                  )}
                  {showFrontmatterButton && (
                    <div className="note-aisle-action-wrap">
                      <button
                        type="button"
                        className="note-aisle-action-btn note-aisle-frontmatter-btn"
                        aria-label={`Open frontmatter for aisle ${index + 1}`}
                        data-app-tooltip="Frontmatter"
                        data-note-workspace-skip-aisle-activation="true"
                        onPointerDown={(event) => {
                          event.stopPropagation()
                        }}
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          onOpenAisleFrontmatter(aisle.id)
                        }}
                      >
                        <span className="frontmatter-toolbar-icon note-aisle-frontmatter-icon" aria-hidden="true">fm</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
              <section className={`editor-shell note-aisle-editor-shell ${editorReadOnly ? 'editor-readonly' : ''}`}>
                {editorMounted ? (
                  <div
                    key={`${editorKey}:editor`}
                    ref={(node) => onRegisterAisleEditorRoot(editorKey, node)}
                    className="toast-editor-host"
                    data-aisle-editor-key={editorKey}
                    data-aisle-host-mode="editor"
                  />
                ) : (
                  <div
                    key={`${editorKey}:preview`}
                    className={`toast-editor-host aisle-editor-preview-fallback ${RENDERED_MARKDOWN_SURFACE_CLASS} ${
                      editorMountPending ? 'is-editor-mount-pending' : ''
                    } ${
                      editorMountFailed ? 'is-editor-mount-failed' : ''
                    } ${
                      previewHydrationPending ? 'is-preview-hydration-pending' : ''
                    } ${
                      previewRenderMode === 'lightweight-preview' ? 'is-lightweight-preview' : ''
                    }`}
                    data-aisle-host-mode="preview"
                    data-aisle-preview-mode={previewRenderMode}
                    data-aisle-editor-mount-failed={editorMountFailed ? 'true' : undefined}
                    aria-hidden={editorMountFailed ? undefined : 'true'}
                  >
                    {lightweightPreviewText.trim().length > 0 ? (
                      <pre className="aisle-editor-lightweight-preview">{lightweightPreviewText}</pre>
                    ) : renderedPreviewMarkdown.trim().length > 0 ? (
                      <NoteWorkspaceMarkdownPreview
                        markdown={renderedPreviewMarkdown}
                        appState={appState}
                        currentNoteBodyId={noteBodyId}
                        onOpenNoteReference={onOpenNoteReference}
                      />
                    ) : null}
                  </div>
                )}
              </section>
              {tableOfContentsOpen && (
                <AisleTableOfContentsPanel
                  aisleId={aisle.id}
                  headings={tableOfContentsHeadings}
                  links={tableOfContentsLinks}
                  onClose={onCloseTableOfContentsAisle}
                  onSelectHeading={onSelectTableOfContentsHeading}
                  onSelectLink={onSelectTableOfContentsLink}
                />
              )}
            </section>
          )
        })}
      </div>
      {isSplitWorkspace && (
        <AisleHorizontalScrollbar
          scrollNode={aisleScrollNode}
          aisleCount={aisles.length}
          onScrollLeftChange={onAisleScroll}
        />
      )}
      {noteTabs.length > 0 ? (
        <NoteTabStrip
          tabs={noteTabs}
          renamingNoteId={renamingNoteTabId}
          renameDraft={noteTabRenameDraft}
          onSelectTab={onSelectNoteTab}
          onCloseTab={onCloseNoteTab}
          onPromoteTab={onPromoteNoteTab}
          onReorderTabs={onReorderNoteTabs}
          onStartRenameTab={onStartNoteTabRename}
          onRenameDraftChange={onNoteTabRenameDraftChange}
          onCommitRenameTab={onCommitNoteTabRename}
          onCancelRenameTab={onCancelNoteTabRename}
        />
      ) : null}
    </section>
  )
}
