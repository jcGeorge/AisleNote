import type { ReactNode, Ref } from 'react'
import { buildAisleEditorKey } from '../../editor/aisle-editor'
import type { NoteAisle } from '../../types/app'

type NoteWorkspaceProps = {
  noteBodyId: string
  aisles: NoteAisle[]
  activeAisleId: string
  editorReadOnly: boolean
  aisleScrollRef: Ref<HTMLDivElement>
  toolbar: ReactNode
  headingPopover: ReactNode
  imageToolsOverlay: ReactNode
  onRootChange: (node: HTMLElement | null) => void
  onAisleScroll: (scrollLeft: number) => void
  onActivateAisle: (editorKey: string) => void
  onRegisterAisleEditorRoot: (editorKey: string, node: HTMLElement | null) => void
}

export function NoteWorkspace({
  noteBodyId,
  aisles,
  activeAisleId,
  editorReadOnly,
  aisleScrollRef,
  toolbar,
  headingPopover,
  imageToolsOverlay,
  onRootChange,
  onAisleScroll,
  onActivateAisle,
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
      <div
        ref={aisleScrollRef}
        className="note-aisle-scroll"
        onScroll={(event) => onAisleScroll(event.currentTarget.scrollLeft)}
      >
        {aisles.map((aisle, index) => {
          const editorKey = buildAisleEditorKey(noteBodyId, aisle.id)
          return (
            <section
              key={aisle.id}
              className={`note-aisle-pane ${aisle.id === activeAisleId ? 'is-active' : ''}`}
              aria-label={`Aisle ${index + 1}`}
              data-aisle-id={aisle.id}
              data-aisle-editor-key={editorKey}
              onPointerDown={() => onActivateAisle(editorKey)}
            >
              <section className={`editor-shell note-aisle-editor-shell ${editorReadOnly ? 'editor-readonly' : ''}`}>
                <div
                  ref={(node) => onRegisterAisleEditorRoot(editorKey, node)}
                  className="toast-editor-host"
                  data-aisle-editor-key={editorKey}
                />
              </section>
            </section>
          )
        })}
      </div>
    </section>
  )
}
