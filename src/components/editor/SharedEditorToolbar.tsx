import type { RefObject } from 'react'
import type { ToolbarFormatKey, ToolbarFormatState } from './toolbar-state'

const TOOLBAR_FORMAT_LABELS: Record<ToolbarFormatKey, string> = {
  bold: 'Bold',
  italic: 'Italic',
  strike: 'Strikethrough',
}

type SharedEditorToolbarProps = {
  headingButtonRef: RefObject<HTMLButtonElement | null>
  aisleButtonRef: RefObject<HTMLButtonElement | null>
  toolbarFormatState: ToolbarFormatState
  toolbarShortcutFeedback: ToolbarFormatKey | null
  onOpenNoteReference: () => void
  onToggleAisles: () => void
  onToggleHeading: () => void
  onCommand: (command: string, payload?: Record<string, unknown>) => void
  onInsertImage: () => void
  onInsertWebLink: () => void
  onClear: () => void
}

function ToolbarIconButton({
  label,
  iconClassName,
  onClick,
  formatKey,
  toolbarFormatState,
  toolbarShortcutFeedback,
}: {
  label: string
  iconClassName: string
  onClick: () => void
  formatKey?: ToolbarFormatKey
  toolbarFormatState: ToolbarFormatState
  toolbarShortcutFeedback: ToolbarFormatKey | null
}) {
  return (
    <button
      type="button"
      className={`toastui-editor-toolbar-icons ${iconClassName} ${
        formatKey && toolbarFormatState[formatKey] ? 'active' : ''
      } ${formatKey && toolbarShortcutFeedback === formatKey ? 'is-shortcut-feedback' : ''}`}
      title={label}
      aria-label={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onClick()
      }}
    />
  )
}

export function SharedEditorToolbar({
  headingButtonRef,
  aisleButtonRef,
  toolbarFormatState,
  toolbarShortcutFeedback,
  onOpenNoteReference,
  onToggleAisles,
  onToggleHeading,
  onCommand,
  onInsertImage,
  onInsertWebLink,
  onClear,
}: SharedEditorToolbarProps) {
  const renderToolbarIconButton = (
    label: string,
    iconClassName: string,
    onClick: () => void,
    formatKey?: ToolbarFormatKey,
  ) => (
    <ToolbarIconButton
      label={label}
      iconClassName={iconClassName}
      onClick={onClick}
      formatKey={formatKey}
      toolbarFormatState={toolbarFormatState}
      toolbarShortcutFeedback={toolbarShortcutFeedback}
    />
  )

  return (
    <div
      className="note-shared-toolbar toastui-editor-toolbar"
      role="toolbar"
      aria-label="Note formatting toolbar"
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className="toastui-editor-defaultUI-toolbar app-shared-editor-toolbar">
        <div className="toastui-editor-toolbar-group note-tools-toolbar-group">
          <button
            type="button"
            className="note-link-toolbar-btn"
            aria-label="Link a note"
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onOpenNoteReference()
            }}
          >
            <span className="note-reference-toolbar-icon" aria-hidden="true">
              <span className="note-reference-toolbar-paper" />
              <span className="note-reference-toolbar-chain" />
            </span>
          </button>
          <span className="note-toolbar-menu-anchor">
            <button
              ref={aisleButtonRef}
              type="button"
              className="aisles-toolbar-btn"
              aria-label="Aisles"
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onToggleAisles()
              }}
            >
              <span className="aisles-toolbar-icon" aria-hidden="true" />
            </button>
          </span>
        </div>
        <div className="toastui-editor-toolbar-group note-format-toolbar-group">
          <span className="note-toolbar-menu-anchor">
            <button
              ref={headingButtonRef}
              type="button"
              className="toastui-editor-toolbar-icons heading"
              title="Headings"
              aria-label="Headings"
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onToggleHeading()
              }}
            />
          </span>
          {renderToolbarIconButton('Bold', 'bold', () => onCommand('bold'), 'bold')}
          {renderToolbarIconButton('Italic', 'italic', () => onCommand('italic'), 'italic')}
          {renderToolbarIconButton('Strike', 'strike', () => onCommand('strike'), 'strike')}
          {toolbarShortcutFeedback && (
            <span className="note-toolbar-shortcut-feedback" role="status">
              {TOOLBAR_FORMAT_LABELS[toolbarShortcutFeedback]}
            </span>
          )}
        </div>
        <div className="toastui-editor-toolbar-group">
          {renderToolbarIconButton('Line', 'hrline', () => onCommand('hr'))}
          {renderToolbarIconButton('Blockquote', 'quote', () => onCommand('blockQuote'))}
        </div>
        <div className="toastui-editor-toolbar-group">
          {renderToolbarIconButton('Unordered list', 'bullet-list', () => onCommand('bulletList'))}
          {renderToolbarIconButton('Ordered list', 'ordered-list', () => onCommand('orderedList'))}
          {renderToolbarIconButton('Task', 'task-list', () => onCommand('taskList'))}
        </div>
        <div className="toastui-editor-toolbar-group">
          {renderToolbarIconButton('Insert table', 'table', () => onCommand('addTable', { rowCount: 2, columnCount: 2 }))}
          {renderToolbarIconButton('Insert image', 'image', onInsertImage)}
          {renderToolbarIconButton('Insert link', 'link', onInsertWebLink)}
        </div>
        <div className="toastui-editor-toolbar-group">
          {renderToolbarIconButton('Code', 'code', () => onCommand('code'))}
          {renderToolbarIconButton('Insert CodeBlock', 'codeblock', () => onCommand('codeBlock'))}
        </div>
        <div className="toastui-editor-toolbar-group clear-note-toolbar-group">
          <button
            type="button"
            className="clear-note-toolbar-btn"
            title="Clear contents"
            aria-label="Clear contents"
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onClear()
            }}
          >
            ⌫
          </button>
        </div>
      </div>
    </div>
  )
}
