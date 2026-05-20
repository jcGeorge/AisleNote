import type { ReactNode, Ref } from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { buildAisleEditorKey } from '../../editor/aisle-editor'
import { resolveImageAssetDisplayUrl } from '../../markdown/image-asset-registry'
import type { NoteAisle } from '../../types/app'
import { MarkdownPreviewParagraph } from './markdown-preview-components'
import { scheduleNoteWorkspaceArrangeExit, shouldExitArrangeModeFromNoteWorkspacePointer } from './note-workspace-events'

const transformAislePreviewUrl = (url: string, key: string) =>
  key === 'src' && (/^data:image\//i.test(url) || /^blob:/i.test(url) || /^tabs-asset:/i.test(url))
    ? resolveImageAssetDisplayUrl(url)
    : defaultUrlTransform(url)

const noteWorkspacePreviewMarkdownComponents = {
  p: MarkdownPreviewParagraph,
}

type NoteWorkspaceProps = {
  noteBodyId: string
  aisles: NoteAisle[]
  activeAisleId: string
  editorReadOnly: boolean
  arrangeModeActive?: boolean
  aisleScrollRef: Ref<HTMLDivElement>
  toolbar: ReactNode
  headingPopover: ReactNode
  imageToolsOverlay: ReactNode
  tableControlsOverlay: ReactNode
  onExitArrangeMode?: () => void
  onRootChange: (node: HTMLElement | null) => void
  onAisleScroll: (scrollLeft: number) => void
  onActivateAisle: (editorKey: string) => void
  mountedAisleIds: Set<string>
  getPreviewMarkdownForAisle: (aisle: NoteAisle) => string
  onRegisterAislePaneRoot: (aisleId: string, node: HTMLElement | null) => void
  onRegisterAisleEditorRoot: (editorKey: string, node: HTMLElement | null) => void
}

export function NoteWorkspace({
  noteBodyId,
  aisles,
  activeAisleId,
  editorReadOnly,
  arrangeModeActive = false,
  aisleScrollRef,
  toolbar,
  headingPopover,
  imageToolsOverlay,
  tableControlsOverlay,
  onExitArrangeMode,
  onRootChange,
  onAisleScroll,
  onActivateAisle,
  mountedAisleIds,
  getPreviewMarkdownForAisle,
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
            </section>
          )
        })}
      </div>
    </section>
  )
}
