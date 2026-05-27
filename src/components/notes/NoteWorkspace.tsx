import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
} from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { buildAisleEditorKey } from '../../editor/aisle-editor'
import type { HeadingOutlineItem } from '../../editor/heading-outline'
import type { TableOfContentsLinkItem } from '../../editor/table-of-contents-links'
import { resolveAssetDisplayUrl } from '../../markdown/image-asset-registry'
import type { ResolvedNoteAisle } from '../../types/app'
import {
  getAisleHorizontalScrollbarGeometry,
  getScrollLeftForAisleHorizontalScrollbarPointer,
  getScrollLeftForAisleHorizontalScrollbarThumb,
  type AisleHorizontalScrollbarGeometry,
} from './aisle-horizontal-scroll'
import { MarkdownPreviewParagraph } from './markdown-preview-components'
import { scheduleNoteWorkspaceArrangeExit, shouldExitArrangeModeFromNoteWorkspacePointer } from './note-workspace-events'

const transformAislePreviewUrl = (url: string, key: string) => {
  if (key === 'href' && /^tabs-asset:/i.test(url)) return url
  if (key === 'src' && (/^data:image\//i.test(url) || /^blob:/i.test(url) || /^tabs-asset:/i.test(url))) {
    return resolveAssetDisplayUrl(url)
  }
  return defaultUrlTransform(url)
}

const noteWorkspacePreviewMarkdownComponents = {
  p: MarkdownPreviewParagraph,
}

const HIDDEN_AISLE_SCROLLBAR_GEOMETRY: AisleHorizontalScrollbarGeometry = {
  visible: false,
  thumbLeft: 0,
  thumbWidth: 0,
  maxScrollLeft: 0,
  maxThumbLeft: 0,
  trackWidth: 0,
}

function assignRef<T>(ref: Ref<T>, value: T | null) {
  if (typeof ref === 'function') {
    ref(value)
    return
  }

  if (ref) {
    ;(ref as MutableRefObject<T | null>).current = value
  }
}

function aisleScrollbarGeometryEqual(left: AisleHorizontalScrollbarGeometry, right: AisleHorizontalScrollbarGeometry) {
  return (
    left.visible === right.visible &&
    left.thumbLeft === right.thumbLeft &&
    left.thumbWidth === right.thumbWidth &&
    left.maxScrollLeft === right.maxScrollLeft &&
    left.maxThumbLeft === right.maxThumbLeft &&
    left.trackWidth === right.trackWidth
  )
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
  arrangeDestinationPrompt?: ReactNode
  tableOfContentsHeadingsByAisle?: Record<string, HeadingOutlineItem[]>
  tableOfContentsLinksByAisle?: Record<string, TableOfContentsLinkItem[]>
  openTableOfContentsAisleIds?: Set<string>
  onExitArrangeMode?: () => void
  onRootChange: (node: HTMLElement | null) => void
  onAisleScroll: (scrollLeft: number) => void
  onActivateAisle: (editorKey: string) => void
  mountedAisleIds: Set<string>
  getPreviewMarkdownForAisle: (aisle: ResolvedNoteAisle) => string
  onCloseTableOfContentsAisle?: (aisleId: string) => void
  onSelectTableOfContentsHeading?: (aisleId: string, headingKey: string) => void
  onSelectTableOfContentsLink?: (aisleId: string, linkKey: string) => void
  onOpenTableOfContentsLink?: (aisleId: string, link: TableOfContentsLinkItem) => void
  onOpenAisleFrontmatter?: (aisleId: string) => void
  onOpenAisleLink?: (aisleId: string) => void
  onRegisterAislePaneRoot: (aisleId: string, node: HTMLElement | null) => void
  onRegisterAisleEditorRoot: (editorKey: string, node: HTMLElement | null) => void
}

type AisleTableOfContentsPanelProps = {
  aisleId: string
  headings: HeadingOutlineItem[]
  links: TableOfContentsLinkItem[]
  onClose: (aisleId: string) => void
  onSelectHeading: (aisleId: string, headingKey: string) => void
  onSelectLink: (aisleId: string, linkKey: string) => void
  onOpenLink: (aisleId: string, link: TableOfContentsLinkItem) => void
}

function AisleTableOfContentsPanel({
  aisleId,
  headings,
  links,
  onClose,
  onSelectHeading,
  onSelectLink,
  onOpenLink,
}: AisleTableOfContentsPanelProps) {
  const hasHeadings = headings.length > 0
  const hasLinks = links.length > 0
  return (
    <div
      className="aisle-toc-panel-layer"
      onPointerDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
        if (event.target === event.currentTarget) {
          onClose(aisleId)
        }
      }}
    >
      <section
        className="aisle-toc-panel"
        role="dialog"
        aria-label="Table of contents"
        onPointerDown={(event) => {
          event.stopPropagation()
        }}
      >
        <div className="aisle-toc-sections">
          {hasHeadings && (
            <section className="aisle-toc-section" aria-label="Table of contents headings">
              <div className="aisle-toc-panel-title">table of contents</div>
              <div className="aisle-toc-list">
                {headings.map((heading) => (
                  <button
                    key={heading.key}
                    type="button"
                    className="aisle-toc-heading-btn"
                    style={{ '--toc-heading-indent': `${Math.max(0, heading.level - 1) * 0.78}rem` } as CSSProperties}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      onSelectHeading(aisleId, heading.key)
                    }}
                  >
                    {heading.text || `heading ${heading.level}`}
                  </button>
                ))}
              </div>
            </section>
          )}
          {hasLinks && (
            <section className="aisle-toc-section" aria-label="Table of contents links">
              <div className="aisle-toc-panel-title">links</div>
              <div className="aisle-toc-list">
                {links.map((link) => (
                  <div key={link.key} className="aisle-toc-link-row">
                    <button
                      type="button"
                      className="aisle-toc-link-open-btn"
                      aria-label={`Open ${link.label}`}
                      title="Open"
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        onOpenLink(aisleId, link)
                      }}
                    >
                      <span className="aisle-toc-link-open-icon" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="aisle-toc-heading-btn aisle-toc-link-btn"
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        onSelectLink(aisleId, link.key)
                      }}
                    >
                      {link.label}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </section>
    </div>
  )
}

type NoteAisleHorizontalScrollbarProps = {
  scrollNode: HTMLDivElement | null
  aisleCount: number
  onScrollLeftChange: (scrollLeft: number) => void
}

function NoteAisleHorizontalScrollbar({
  scrollNode,
  aisleCount,
  onScrollLeftChange,
}: NoteAisleHorizontalScrollbarProps) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const dragStateRef = useRef<{
    pointerId: number
    startClientX: number
    startThumbLeft: number
    geometry: AisleHorizontalScrollbarGeometry
  } | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const [geometry, setGeometry] = useState<AisleHorizontalScrollbarGeometry>(HIDDEN_AISLE_SCROLLBAR_GEOMETRY)

  const readGeometry = useCallback(() => {
    if (!scrollNode) return HIDDEN_AISLE_SCROLLBAR_GEOMETRY
    const trackNode = trackRef.current
    const trackRectWidth = trackNode?.getBoundingClientRect().width ?? 0
    const trackWidth = trackNode?.clientWidth || trackRectWidth || scrollNode.clientWidth
    return getAisleHorizontalScrollbarGeometry({
      scrollLeft: scrollNode.scrollLeft,
      scrollWidth: scrollNode.scrollWidth,
      clientWidth: scrollNode.clientWidth,
      trackWidth,
    })
  }, [scrollNode])

  const updateGeometryNow = useCallback(() => {
    animationFrameRef.current = null
    const nextGeometry = readGeometry()
    setGeometry((currentGeometry) =>
      aisleScrollbarGeometryEqual(currentGeometry, nextGeometry) ? currentGeometry : nextGeometry,
    )
  }, [readGeometry])

  const scheduleGeometryUpdate = useCallback(() => {
    if (animationFrameRef.current !== null) return
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      updateGeometryNow()
      return
    }
    animationFrameRef.current = window.requestAnimationFrame(updateGeometryNow)
  }, [updateGeometryNow])

  const setScrollLeft = useCallback(
    (nextScrollLeft: number) => {
      if (!scrollNode) return
      const maxScrollLeft = Math.max(0, scrollNode.scrollWidth - scrollNode.clientWidth)
      scrollNode.scrollLeft = Math.min(Math.max(nextScrollLeft, 0), maxScrollLeft)
      onScrollLeftChange(scrollNode.scrollLeft)
      scheduleGeometryUpdate()
    },
    [onScrollLeftChange, scheduleGeometryUpdate, scrollNode],
  )

  useEffect(() => {
    if (!scrollNode) {
      setGeometry(HIDDEN_AISLE_SCROLLBAR_GEOMETRY)
      return undefined
    }

    let resizeObserver: ResizeObserver | null = null
    let mutationObserver: MutationObserver | null = null

    const observeScrollChildren = () => {
      if (!resizeObserver) return
      for (const child of Array.from(scrollNode.children)) {
        if (child instanceof Element) {
          resizeObserver.observe(child)
        }
      }
    }

    scrollNode.addEventListener('scroll', scheduleGeometryUpdate, { passive: true })

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(scheduleGeometryUpdate)
      resizeObserver.observe(scrollNode)
      if (trackRef.current) {
        resizeObserver.observe(trackRef.current)
      }
      observeScrollChildren()
    }

    if (typeof MutationObserver !== 'undefined') {
      mutationObserver = new MutationObserver(() => {
        observeScrollChildren()
        scheduleGeometryUpdate()
      })
      mutationObserver.observe(scrollNode, { childList: true })
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', scheduleGeometryUpdate)
    }

    scheduleGeometryUpdate()

    return () => {
      scrollNode.removeEventListener('scroll', scheduleGeometryUpdate)
      resizeObserver?.disconnect()
      mutationObserver?.disconnect()
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', scheduleGeometryUpdate)
      }
      if (animationFrameRef.current !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [aisleCount, scheduleGeometryUpdate, scrollNode])

  const handleTrackPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || !scrollNode || !trackRef.current || !geometry.visible) return
      if ((event.target as HTMLElement).closest('.note-aisle-horizontal-scrollbar-thumb')) return
      event.preventDefault()
      const trackRect = trackRef.current.getBoundingClientRect()
      const nextScrollLeft = getScrollLeftForAisleHorizontalScrollbarPointer({
        pointerX: event.clientX,
        trackLeft: trackRect.left,
        trackWidth: trackRect.width,
        thumbWidth: geometry.thumbWidth,
        scrollWidth: scrollNode.scrollWidth,
        clientWidth: scrollNode.clientWidth,
      })
      setScrollLeft(nextScrollLeft)
    },
    [geometry.thumbWidth, geometry.visible, scrollNode, setScrollLeft],
  )

  const handleThumbPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || !scrollNode || !geometry.visible) return
      event.preventDefault()
      event.stopPropagation()
      dragStateRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startThumbLeft: geometry.thumbLeft,
        geometry,
      }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [geometry, scrollNode],
  )

  const handleThumbPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current
      if (!dragState || dragState.pointerId !== event.pointerId) return
      event.preventDefault()
      const nextThumbLeft = dragState.startThumbLeft + event.clientX - dragState.startClientX
      const nextScrollLeft = getScrollLeftForAisleHorizontalScrollbarThumb({
        thumbLeft: nextThumbLeft,
        maxThumbLeft: dragState.geometry.maxThumbLeft,
        maxScrollLeft: dragState.geometry.maxScrollLeft,
      })
      setScrollLeft(nextScrollLeft)
    },
    [setScrollLeft],
  )

  const handleThumbPointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current
    if (!dragState || dragState.pointerId !== event.pointerId) return
    dragStateRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [])

  const handleTrackKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!scrollNode || !geometry.visible) return
      const lineStep = 48
      let nextScrollLeft: number | null = null

      if (event.key === 'ArrowLeft') {
        nextScrollLeft = scrollNode.scrollLeft - lineStep
      } else if (event.key === 'ArrowRight') {
        nextScrollLeft = scrollNode.scrollLeft + lineStep
      } else if (event.key === 'PageUp') {
        nextScrollLeft = scrollNode.scrollLeft - scrollNode.clientWidth
      } else if (event.key === 'PageDown') {
        nextScrollLeft = scrollNode.scrollLeft + scrollNode.clientWidth
      } else if (event.key === 'Home') {
        nextScrollLeft = 0
      } else if (event.key === 'End') {
        nextScrollLeft = geometry.maxScrollLeft
      }

      if (nextScrollLeft === null) return
      event.preventDefault()
      setScrollLeft(nextScrollLeft)
    },
    [geometry.maxScrollLeft, geometry.visible, scrollNode, setScrollLeft],
  )

  return (
    <div
      className={`note-aisle-horizontal-scrollbar ${geometry.visible ? 'is-visible' : 'is-hidden'}`}
      aria-hidden={geometry.visible ? undefined : true}
    >
      <div
        ref={trackRef}
        className="note-aisle-horizontal-scrollbar-track"
        role="scrollbar"
        aria-label="Scroll aisles horizontally"
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={Math.round(geometry.maxScrollLeft)}
        aria-valuenow={Math.round(scrollNode?.scrollLeft ?? 0)}
        tabIndex={geometry.visible ? 0 : -1}
        onPointerDown={handleTrackPointerDown}
        onKeyDown={handleTrackKeyDown}
      >
        <div
          className="note-aisle-horizontal-scrollbar-thumb"
          style={{
            width: `${geometry.thumbWidth}px`,
            transform: `translateX(${geometry.thumbLeft}px)`,
          }}
          onPointerDown={handleThumbPointerDown}
          onPointerMove={handleThumbPointerMove}
          onPointerUp={handleThumbPointerEnd}
          onPointerCancel={handleThumbPointerEnd}
        />
      </div>
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
  arrangeDestinationPrompt = null,
  tableOfContentsHeadingsByAisle = {},
  tableOfContentsLinksByAisle = {},
  openTableOfContentsAisleIds = new Set(),
  onExitArrangeMode,
  onRootChange,
  onAisleScroll,
  onActivateAisle,
  mountedAisleIds,
  getPreviewMarkdownForAisle,
  onCloseTableOfContentsAisle = () => undefined,
  onSelectTableOfContentsHeading = () => undefined,
  onSelectTableOfContentsLink = () => undefined,
  onOpenTableOfContentsLink = () => undefined,
  onOpenAisleFrontmatter = () => undefined,
  onOpenAisleLink = () => undefined,
  onRegisterAislePaneRoot,
  onRegisterAisleEditorRoot,
}: NoteWorkspaceProps) {
  const [aisleScrollNode, setAisleScrollNode] = useState<HTMLDivElement | null>(null)
  const isSplitWorkspace = aisles.length > 1
  const setAisleScrollRef = useCallback(
    (node: HTMLDivElement | null) => {
      setAisleScrollNode((currentNode) => (currentNode === node ? currentNode : node))
      assignRef(aisleScrollRef, node)
    },
    [aisleScrollRef],
  )

  return (
    <section
      ref={onRootChange}
      className={`note-aisles-shell ${isSplitWorkspace ? 'is-split' : 'is-single'}`}
    >
      {toolbar}
      {headingPopover}
      {imageToolsOverlay}
      {tableControlsOverlay}
      {arrangeDestinationPrompt}
      <div
        ref={setAisleScrollRef}
        className="note-aisle-scroll"
        onPointerDownCapture={(event) => {
          if (shouldExitArrangeModeFromNoteWorkspacePointer(arrangeModeActive, event.button)) {
            scheduleNoteWorkspaceArrangeExit(onExitArrangeMode)
          }
        }}
        onScroll={(event) => onAisleScroll(event.currentTarget.scrollLeft)}
      >
        {aisles.map((aisle, index) => {
          const editorKey = buildAisleEditorKey(noteBodyId, aisle.id)
          const editorMounted = mountedAisleIds.has(aisle.id)
          const previewMarkdown = editorMounted ? '' : getPreviewMarkdownForAisle(aisle)
          const tableOfContentsHeadings = tableOfContentsHeadingsByAisle[aisle.id] ?? []
          const tableOfContentsLinks = tableOfContentsLinksByAisle[aisle.id] ?? []
          const tableOfContentsOpen =
            openTableOfContentsAisleIds.has(aisle.id) &&
            (tableOfContentsHeadings.length > 0 || tableOfContentsLinks.length > 0)
          const showLinkButton = wholeNoteLinked || linkedAisleIds.has(aisle.id)
          const showFrontmatterButton = frontmatterAisleIds.has(aisle.id)
          return (
            <section
              key={aisle.id}
              ref={(node) => onRegisterAislePaneRoot(aisle.id, node)}
              className={`note-aisle-pane ${aisle.id === activeAisleId ? 'is-active' : ''}`}
              aria-label={`Aisle ${index + 1}`}
              data-aisle-id={aisle.id}
              data-aisle-editor-key={editorKey}
              onPointerDown={() => onActivateAisle(editorKey)}
            >
              {(showLinkButton || showFrontmatterButton) && (
                <div className="note-aisle-action-layer" aria-label={`Aisle ${index + 1} actions`}>
                  {showLinkButton && (
                    <button
                      type="button"
                      className="note-aisle-action-btn note-aisle-link-btn"
                      aria-label={`Open link controls for aisle ${index + 1}`}
                      title="Link"
                      onPointerDown={(event) => {
                        event.stopPropagation()
                      }}
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        onOpenAisleLink(aisle.id)
                      }}
                    >
                      <span className="toastui-editor-toolbar-icons link note-aisle-link-icon" aria-hidden="true" />
                    </button>
                  )}
                  {showFrontmatterButton && (
                    <button
                      type="button"
                      className="note-aisle-action-btn note-aisle-frontmatter-btn"
                      aria-label={`Open frontmatter for aisle ${index + 1}`}
                      title="Frontmatter"
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
                  )}
                </div>
              )}
              <section className={`editor-shell note-aisle-editor-shell ${editorReadOnly ? 'editor-readonly' : ''}`}>
                {editorMounted ? (
                  <div
                    ref={(node) => onRegisterAisleEditorRoot(editorKey, node)}
                    className="toast-editor-host"
                    data-aisle-editor-key={editorKey}
                  />
                ) : (
                  <div className="toast-editor-host aisle-editor-preview-fallback" aria-hidden="true">
                    {previewMarkdown.trim().length > 0 ? (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        urlTransform={transformAislePreviewUrl}
                        components={noteWorkspacePreviewMarkdownComponents}
                      >
                        {previewMarkdown}
                      </ReactMarkdown>
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
                  onOpenLink={onOpenTableOfContentsLink}
                />
              )}
            </section>
          )
        })}
      </div>
      {isSplitWorkspace && (
        <NoteAisleHorizontalScrollbar
          scrollNode={aisleScrollNode}
          aisleCount={aisles.length}
          onScrollLeftChange={onAisleScroll}
        />
      )}
    </section>
  )
}
