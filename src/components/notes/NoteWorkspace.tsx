import {
  useCallback,
  useState,
  type CSSProperties,
  type MutableRefObject,
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
import { ToolbarToolIcon } from '../editor/ToolbarToolIcon'
import { AppIcon } from '../icons/AppIcon'
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
  getAisleEditorKeyFromNoteWorkspacePointerTarget,
  scheduleNoteWorkspaceArrangeExit,
  shouldExitArrangeModeFromNoteWorkspacePointer,
} from './note-workspace-events'

const transformAislePreviewUrl = (url: string, key: string) => {
  if (key === 'href' && /^tabs-asset:/i.test(url)) return url
  if (key === 'src' && (/^data:image\//i.test(url) || /^blob:/i.test(url) || /^tabs-asset:/i.test(url))) {
    return resolveAssetDisplayUrl(url)
  }
  return defaultUrlTransform(url)
}

const noteWorkspacePreviewMarkdownComponents = {
  a: MarkdownPreviewLink,
  h1: MarkdownPreviewHeading1,
  h2: MarkdownPreviewHeading2,
  h3: MarkdownPreviewHeading3,
  h4: MarkdownPreviewHeading4,
  h5: MarkdownPreviewHeading5,
  h6: MarkdownPreviewHeading6,
  li: MarkdownPreviewListItem,
  p: MarkdownPreviewParagraph,
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

type ScratchpadAisleControls = {
  canDeleteActiveAisle: boolean
  onAddAisleLeft: () => void
  onAddAisleRight: () => void
  onDeleteActiveAisle: () => void
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
  onOpenAisleFrontmatterFilter?: (aisleId: string) => void
  onOpenAisleLink?: (aisleId: string) => void
  onOpenAisleSyncedFilter?: (aisleId: string) => void
  onOpenTagFilter?: (tag: string) => void
  scratchpadAisleControls?: ScratchpadAisleControls
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
  onOpenAisleFrontmatterFilter = () => undefined,
  onOpenAisleLink = () => undefined,
  onOpenAisleSyncedFilter = () => undefined,
  onOpenTagFilter = () => undefined,
  scratchpadAisleControls,
  onRegisterAislePaneRoot,
  onRegisterAisleEditorRoot,
}: NoteWorkspaceProps) {
  const [aisleScrollNode, setAisleScrollNode] = useState<HTMLDivElement | null>(null)
  const [actionMenu, setActionMenu] = useState<{ type: 'frontmatter' | 'link'; aisleId: string } | null>(null)
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
          const target = event.target instanceof Element ? event.target : null
          if (!target?.closest('.note-aisle-action-layer')) {
            setActionMenu(null)
          }
          if (shouldExitArrangeModeFromNoteWorkspacePointer(arrangeModeActive, event.button)) {
            scheduleNoteWorkspaceArrangeExit(onExitArrangeMode)
          }
          const editorKey = getAisleEditorKeyFromNoteWorkspacePointerTarget(event.target)
          if (editorKey) {
            onActivateAisle(editorKey)
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
          const previewMarkdown = editorMounted ? '' : getPreviewMarkdownForAisle(aisle)
          const tableOfContentsHeadings = tableOfContentsHeadingsByAisle[aisle.id] ?? []
          const tableOfContentsLinks = tableOfContentsLinksByAisle[aisle.id] ?? []
          const tableOfContentsOpen =
            openTableOfContentsAisleIds.has(aisle.id) &&
            (tableOfContentsHeadings.length > 0 || tableOfContentsLinks.length > 0)
          const showLinkButton = wholeNoteLinked || linkedAisleIds.has(aisle.id)
          const showFrontmatterButton = frontmatterAisleIds.has(aisle.id)
          const showScratchpadAisleControls = Boolean(scratchpadAisleControls && aisle.id === activeAisleId)
          return (
            <section
              key={aisle.id}
              ref={(node) => onRegisterAislePaneRoot(aisle.id, node)}
              className={`note-aisle-pane ${aisle.id === activeAisleId ? 'is-active' : ''}`}
              aria-label={`Aisle ${index + 1}`}
              data-aisle-id={aisle.id}
              data-aisle-editor-key={editorKey}
            >
              {(showLinkButton || showFrontmatterButton) && (
                <div className="note-aisle-action-layer" aria-label={`Aisle ${index + 1} actions`}>
                  {showLinkButton && (
                    <div className="note-aisle-action-wrap">
                      <button
                        type="button"
                        className="note-aisle-action-btn note-aisle-link-btn"
                        aria-label={`Open link controls for aisle ${index + 1}`}
                        data-app-tooltip="Link"
                        aria-expanded={actionMenu?.type === 'link' && actionMenu.aisleId === aisle.id}
                        data-note-workspace-skip-aisle-activation="true"
                        onPointerDown={(event) => {
                          event.stopPropagation()
                        }}
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          setActionMenu((current) =>
                            current?.type === 'link' && current.aisleId === aisle.id ? null : { type: 'link', aisleId: aisle.id },
                          )
                        }}
                      >
                        <ToolbarToolIcon toolId="link" className="note-aisle-link-icon" />
                      </button>
                      {actionMenu?.type === 'link' && actionMenu.aisleId === aisle.id && (
                        <div className="note-aisle-action-menu" role="menu" aria-label={`Link actions for aisle ${index + 1}`}>
                          <button
                            type="button"
                            className="note-aisle-action-menu-item"
                            onClick={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              setActionMenu(null)
                              onOpenAisleLink(aisle.id)
                            }}
                          >
                            de-couple
                          </button>
                          <button
                            type="button"
                            className="note-aisle-action-menu-item"
                            onClick={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              setActionMenu(null)
                              onOpenAisleSyncedFilter(aisle.id)
                            }}
                          >
                            synced filter
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {showFrontmatterButton && (
                    <div className="note-aisle-action-wrap">
                      <button
                        type="button"
                        className="note-aisle-action-btn note-aisle-frontmatter-btn"
                        aria-label={`Open frontmatter for aisle ${index + 1}`}
                        data-app-tooltip="Frontmatter"
                        aria-expanded={actionMenu?.type === 'frontmatter' && actionMenu.aisleId === aisle.id}
                        data-note-workspace-skip-aisle-activation="true"
                        onPointerDown={(event) => {
                          event.stopPropagation()
                        }}
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          setActionMenu((current) =>
                            current?.type === 'frontmatter' && current.aisleId === aisle.id
                              ? null
                              : { type: 'frontmatter', aisleId: aisle.id },
                          )
                        }}
                      >
                        <span className="frontmatter-toolbar-icon note-aisle-frontmatter-icon" aria-hidden="true">fm</span>
                      </button>
                      {actionMenu?.type === 'frontmatter' && actionMenu.aisleId === aisle.id && (
                        <div className="note-aisle-action-menu" role="menu" aria-label={`Frontmatter actions for aisle ${index + 1}`}>
                          <button
                            type="button"
                            className="note-aisle-action-menu-item"
                            onClick={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              setActionMenu(null)
                              onOpenAisleFrontmatter(aisle.id)
                            }}
                          >
                            edit frontmatter
                          </button>
                          <button
                            type="button"
                            className="note-aisle-action-menu-item"
                            onClick={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              setActionMenu(null)
                              onOpenAisleFrontmatterFilter(aisle.id)
                            }}
                          >
                            fm filter
                          </button>
                        </div>
                      )}
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
                    className="toast-editor-host aisle-editor-preview-fallback"
                    data-aisle-host-mode="preview"
                    aria-hidden="true"
                  >
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
              {showScratchpadAisleControls && scratchpadAisleControls && (
                <div className="note-scratchpad-aisle-controls" aria-label={`Scratchpad aisle ${index + 1} controls`}>
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
                      scratchpadAisleControls.onAddAisleLeft()
                    }}
                  >
                    <AppIcon iconId="aisleRight" className="note-scratchpad-aisle-add-icon" flipHorizontal />
                  </button>
                  {scratchpadAisleControls.canDeleteActiveAisle && (
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
                        scratchpadAisleControls.onDeleteActiveAisle()
                      }}
                    >
                      <span className="aisle-edit-delete-icon note-scratchpad-aisle-delete-icon" aria-hidden="true" />
                    </button>
                  )}
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
                      scratchpadAisleControls.onAddAisleRight()
                    }}
                  >
                    <AppIcon iconId="aisleRight" className="note-scratchpad-aisle-add-icon" />
                  </button>
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
