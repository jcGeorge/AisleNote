import type { CSSProperties, ReactNode, Ref } from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { buildAisleEditorKey } from '../../editor/aisle-editor'
import type { HeadingOutlineItem } from '../../editor/heading-outline'
import { resolveAssetDisplayUrl } from '../../markdown/image-asset-registry'
import type { ResolvedNoteAisle } from '../../types/app'
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
  openTableOfContentsAisleIds?: Set<string>
  onExitArrangeMode?: () => void
  onRootChange: (node: HTMLElement | null) => void
  onAisleScroll: (scrollLeft: number) => void
  onActivateAisle: (editorKey: string) => void
  mountedAisleIds: Set<string>
  getPreviewMarkdownForAisle: (aisle: ResolvedNoteAisle) => string
  onCloseTableOfContentsAisle?: (aisleId: string) => void
  onSelectTableOfContentsHeading?: (aisleId: string, headingKey: string) => void
  onOpenAisleFrontmatter?: (aisleId: string) => void
  onOpenAisleLink?: (aisleId: string) => void
  onRegisterAislePaneRoot: (aisleId: string, node: HTMLElement | null) => void
  onRegisterAisleEditorRoot: (editorKey: string, node: HTMLElement | null) => void
}

type AisleTableOfContentsPanelProps = {
  aisleId: string
  headings: HeadingOutlineItem[]
  onClose: (aisleId: string) => void
  onSelectHeading: (aisleId: string, headingKey: string) => void
}

function AisleTableOfContentsPanel({
  aisleId,
  headings,
  onClose,
  onSelectHeading,
}: AisleTableOfContentsPanelProps) {
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
  openTableOfContentsAisleIds = new Set(),
  onExitArrangeMode,
  onRootChange,
  onAisleScroll,
  onActivateAisle,
  mountedAisleIds,
  getPreviewMarkdownForAisle,
  onCloseTableOfContentsAisle = () => undefined,
  onSelectTableOfContentsHeading = () => undefined,
  onOpenAisleFrontmatter = () => undefined,
  onOpenAisleLink = () => undefined,
  onRegisterAislePaneRoot,
  onRegisterAisleEditorRoot,
}: NoteWorkspaceProps) {
  return (
    <section
      ref={onRootChange}
      className={`note-aisles-shell ${aisles.length <= 1 ? 'is-single' : 'is-split'}`}
    >
      {toolbar}
      {headingPopover}
      {imageToolsOverlay}
      {tableControlsOverlay}
      {arrangeDestinationPrompt}
      <div
        ref={aisleScrollRef}
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
          const tableOfContentsOpen = openTableOfContentsAisleIds.has(aisle.id) && tableOfContentsHeadings.length > 0
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
                  onClose={onCloseTableOfContentsAisle}
                  onSelectHeading={onSelectTableOfContentsHeading}
                />
              )}
            </section>
          )
        })}
      </div>
    </section>
  )
}
