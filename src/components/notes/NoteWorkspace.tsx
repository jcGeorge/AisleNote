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
import { recordDiagnosticEvent } from '../../diagnostics/diagnostic-logger'
import { resolveAssetDisplayUrl } from '../../markdown/image-asset-registry'
import type { AppState, NoteLocation, ResolvedNoteAisle } from '../../types/app'
import { ToolbarToolIcon } from '../editor/ToolbarToolIcon'
import { AppIcon } from '../icons/AppIcon'
import { getAislePreviewSegments } from './aisle-markdown-preview-segments'
import { NotePreviewContent } from './NotePreviewContent'
import { AisleHorizontalScrollbar } from './AisleHorizontalScrollbar'
import {
  MarkdownPreviewHeading1,
  MarkdownPreviewHeading2,
  MarkdownPreviewHeading3,
  MarkdownPreviewHeading4,
  MarkdownPreviewHeading5,
  MarkdownPreviewHeading6,
  MarkdownPreviewLink,
  MarkdownPreviewListItem,
  MarkdownPreviewParagraph,
} from './markdown-preview-components'
import {
  getAisleActivationPointerFromNoteWorkspaceEvent,
  getAisleEditorKeyFromNoteWorkspacePointerTarget,
  scheduleNoteWorkspaceArrangeExit,
  shouldExitArrangeModeFromNoteWorkspacePointer,
} from './note-workspace-events'
import {
  getAislePreviewRenderMode,
  getLightweightPreviewText,
  getMarkdownWorkloadProfile,
} from './note-workspace-preview'

void React

type HeadingOutlineItem = {
  key: string
  level: number
  text: string
}

type TableOfContentsLinkItem = {
  key: string
  label: string
  href?: string
}

const transformAislePreviewUrl = (url: string, key: string) => {
  if (key === 'href' && /^tabs-asset:/i.test(url)) return url
  if (key === 'src' && (/^data:image\//i.test(url) || /^blob:/i.test(url) || /^tabs-asset:/i.test(url))) {
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
      a: (props: React.ComponentProps<typeof MarkdownPreviewLink>) => (
        <MarkdownPreviewLink {...props} appState={appState} onOpenNote={onOpenNoteReference} />
      ),
    }),
    [appState, onOpenNoteReference],
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

type NoteAisleControls = {
  showAddButtons?: boolean
  showDeleteButton?: boolean
  onAddAisleLeft: () => void
  onAddAisleRight: () => void
  onDeleteActiveAisle: () => void
}

type AisleActivationPointer = {
  clientX: number
  clientY: number
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
  suppressActiveAislePreviewFallback?: boolean
  deferInactivePreviewFallbacks?: boolean
  getPreviewMarkdownForAisle: (aisle: ResolvedNoteAisle) => string
  onCloseTableOfContentsAisle?: (aisleId: string) => void
  onSelectTableOfContentsHeading?: (aisleId: string, headingKey: string) => void
  onSelectTableOfContentsLink?: (aisleId: string, linkKey: string) => void
  onOpenTableOfContentsLink?: (aisleId: string, link: TableOfContentsLinkItem) => void
  onOpenAisleFrontmatter?: (aisleId: string) => void
  onOpenAisleLink?: (aisleId: string) => void
  appState?: AppState | null
  onOpenNoteReference?: (target: NoteLocation) => void
  onOpenTagFilter?: (tag: string) => void
  onSelectEditableAsset?: (target: Element) => void
  scratchpadAisleControls?: NoteAisleControls
  regularNoteAisleControls?: NoteAisleControls
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
                      data-app-tooltip="Open"
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
  onOpenTableOfContentsLink = () => undefined,
  onOpenAisleFrontmatter = () => undefined,
  onOpenAisleLink = () => undefined,
  appState = null,
  onOpenNoteReference,
  onOpenTagFilter = () => undefined,
  onSelectEditableAsset = () => undefined,
  scratchpadAisleControls,
  regularNoteAisleControls,
  onRegisterAislePaneRoot,
  onRegisterAisleEditorRoot,
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

  return (
    <section
      ref={onRootChange}
      className={`note-aisles-shell ${isSplitWorkspace ? 'is-split' : 'is-single'}`}
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
          if (!editorReadOnly && event.target instanceof Element) {
            onSelectEditableAsset(event.target)
          }
          const editorKey = getAisleEditorKeyFromNoteWorkspacePointerTarget(event.target)
          if (editorKey) {
            onActivateAisle(editorKey, getAisleActivationPointerFromNoteWorkspaceEvent(event.nativeEvent))
          }
        }}
        onClickCapture={(event) => {
          const target = event.target instanceof Element ? event.target : null
          const tagToken = target?.closest<HTMLElement>('[data-tabs-tag]')
          const tag = tagToken?.dataset.tabsTag?.trim()
          if (!tag) return
          event.preventDefault()
          event.stopPropagation()
          onOpenTagFilter(tag)
        }}
        onScroll={(event) => onAisleScroll(event.currentTarget.scrollLeft)}
      >
        {aisles.map((aisle, index) => {
          const editorKey = buildAisleEditorKey(noteBodyId, aisle.id)
          const editorMounted = mountedAisleIds.has(aisle.id)
          const editorMountPending = suppressActiveAislePreviewFallback && !editorMounted && aisle.id === activeAisleId
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
          const aisleControls = scratchpadAisleControls ?? regularNoteAisleControls
          const showAisleAddButtons = aisleControls?.showAddButtons ?? true
          const showAisleDeleteButton = aisleControls?.showDeleteButton ?? false
          const showAisleControls = Boolean(
            aisleControls && aisle.id === activeAisleId && (showAisleAddButtons || showAisleDeleteButton),
          )
          const aisleControlsLabel = scratchpadAisleControls ? 'Scratchpad aisle' : 'Aisle'
          const customAisleWidth = isSplitWorkspace ? aisleWidths[aisle.id] : undefined
          const aislePaneStyle =
            typeof customAisleWidth === 'number'
              ? ({ '--note-aisle-width': `${customAisleWidth}px` } as CSSProperties)
              : undefined
          return (
            <section
              key={aisle.id}
              ref={(node) => onRegisterAislePaneRoot(aisle.id, node)}
              className={`note-aisle-pane ${aisle.id === activeAisleId ? 'is-active' : ''} ${
                customAisleWidth ? 'has-custom-width' : ''
              }`}
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
                      previewHydrationPending ? 'is-preview-hydration-pending' : ''
                    } ${
                      previewRenderMode === 'lightweight-preview' ? 'is-lightweight-preview' : ''
                    }`}
                    data-aisle-host-mode="preview"
                    data-aisle-preview-mode={previewRenderMode}
                    aria-hidden="true"
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
              {showAisleControls && aisleControls && (
                <div
                  className="note-scratchpad-aisle-controls"
                  aria-label={`${aisleControlsLabel} ${index + 1} controls`}
                >
                  {showAisleAddButtons && (
                    <button
                      type="button"
                      className="note-scratchpad-aisle-control-btn note-scratchpad-aisle-add-btn note-scratchpad-aisle-add-left-btn"
                      aria-label={`Add aisle to left of aisle ${index + 1}`}
                      data-app-tooltip="Add aisle left"
                      data-note-workspace-skip-aisle-activation="true"
                      onPointerDown={(event) => {
                        event.stopPropagation()
                      }}
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        aisleControls.onAddAisleLeft()
                      }}
                    >
                      <AppIcon iconId="aisleRight" className="note-scratchpad-aisle-add-icon" flipHorizontal />
                    </button>
                  )}
                  {showAisleDeleteButton && (
                    <button
                      type="button"
                      className="note-scratchpad-aisle-control-btn note-scratchpad-aisle-delete-btn"
                      aria-label={`Delete aisle ${index + 1}`}
                      data-app-tooltip="Delete aisle"
                      data-note-workspace-skip-aisle-activation="true"
                      onPointerDown={(event) => {
                        event.stopPropagation()
                      }}
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        aisleControls.onDeleteActiveAisle()
                      }}
                    >
                      <AppIcon iconId="trash" className="aisle-edit-delete-icon note-scratchpad-aisle-delete-icon" />
                    </button>
                  )}
                  {showAisleAddButtons && (
                    <button
                      type="button"
                      className="note-scratchpad-aisle-control-btn note-scratchpad-aisle-add-btn note-scratchpad-aisle-add-right-btn"
                      aria-label={`Add aisle to right of aisle ${index + 1}`}
                      data-app-tooltip="Add aisle right"
                      data-note-workspace-skip-aisle-activation="true"
                      onPointerDown={(event) => {
                        event.stopPropagation()
                      }}
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        aisleControls.onAddAisleRight()
                      }}
                    >
                      <AppIcon iconId="aisleRight" className="note-scratchpad-aisle-add-icon" />
                    </button>
                  )}
                </div>
              )}
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
        <AisleHorizontalScrollbar
          scrollNode={aisleScrollNode}
          aisleCount={aisles.length}
          onScrollLeftChange={onAisleScroll}
        />
      )}
    </section>
  )
}
