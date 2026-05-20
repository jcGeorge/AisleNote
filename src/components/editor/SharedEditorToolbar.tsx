import type { RefObject } from 'react'
import type { ToolbarFormatKey, ToolbarFormatState, ToolbarHeadingLevel } from './toolbar-state'

const TOOLBAR_FORMAT_LABELS: Record<ToolbarFormatKey, string> = {
  bold: 'Bold',
  italic: 'Italic',
  strike: 'Strikethrough',
}

type SharedEditorToolbarProps = {
  headingButtonRef: RefObject<HTMLButtonElement | null>
  aisleButtonRef: RefObject<HTMLButtonElement | null>
  toolbarFormatState: ToolbarFormatState
  activeHeadingLevel: ToolbarHeadingLevel
  toolbarShortcutFeedback: ToolbarFormatKey | null
  onOpenCopy: () => void
  onOpenFrontmatter: () => void
  onToggleAisles: () => void
  onToggleHeading: () => void
  onCommand: (command: string, payload?: Record<string, unknown>) => void
  onHistory: (direction: 'undo' | 'redo') => void
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
  onClick: (button: HTMLButtonElement) => void
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
        onClick(event.currentTarget)
      }}
    />
  )
}

function HistoryToolbarButton({
  direction,
  label,
  onHistory,
}: {
  direction: 'undo' | 'redo'
  label: string
  onHistory: (direction: 'undo' | 'redo') => void
}) {
  return (
    <button
      type="button"
      className={`editor-history-toolbar-btn editor-history-toolbar-btn-${direction}`}
      title={label}
      aria-label={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onHistory(direction)
      }}
    >
      <svg className="editor-history-toolbar-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M8 7H5v3" />
        <path d="M5.5 9.5A7 7 0 1 1 7 17" />
      </svg>
    </button>
  )
}

export function SharedEditorToolbar({
  headingButtonRef,
  aisleButtonRef,
  toolbarFormatState,
  activeHeadingLevel,
  toolbarShortcutFeedback,
  onOpenCopy,
  onOpenFrontmatter,
  onToggleAisles,
  onToggleHeading,
  onCommand,
  onHistory,
  onInsertImage,
  onInsertWebLink,
  onClear,
}: SharedEditorToolbarProps) {
  const renderToolbarIconButton = (
    label: string,
    iconClassName: string,
    onClick: (button: HTMLButtonElement) => void,
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
            className="note-copy-toolbar-btn"
            title="Make copy"
            aria-label="Make copy"
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onOpenCopy()
            }}
          >
            <span className="note-copy-toolbar-icon" aria-hidden="true">
              <span className="note-copy-toolbar-page note-copy-toolbar-page-back" />
              <span className="note-copy-toolbar-page note-copy-toolbar-page-front" />
              <span className="note-copy-toolbar-chain" />
            </span>
          </button>
          <button
            type="button"
            className="frontmatter-toolbar-btn"
            title="Frontmatter"
            aria-label="Frontmatter"
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onOpenFrontmatter()
            }}
          >
            <span className="frontmatter-toolbar-icon" aria-hidden="true" />
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
        <div className="toastui-editor-toolbar-group editor-history-toolbar-group">
          <HistoryToolbarButton direction="undo" label="Undo" onHistory={onHistory} />
          <HistoryToolbarButton direction="redo" label="Redo" onHistory={onHistory} />
        </div>
        <div className="toastui-editor-toolbar-group note-format-toolbar-group">
          <span className="note-toolbar-menu-anchor">
            <button
              ref={headingButtonRef}
              type="button"
              className={`toastui-editor-toolbar-icons heading ${
                typeof activeHeadingLevel === 'number' && activeHeadingLevel > 0 ? 'active' : ''
              }`}
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
          {renderToolbarIconButton('Strikethrough', 'strike', () => onCommand('strike'), 'strike')}
          {toolbarShortcutFeedback && (
            <span className="note-toolbar-shortcut-feedback" role="status">
              {TOOLBAR_FORMAT_LABELS[toolbarShortcutFeedback]}
            </span>
          )}
        </div>
        <div className="toastui-editor-toolbar-group">
          {renderToolbarIconButton('Horizontal line', 'hrline', () => onCommand('hr'))}
          {renderToolbarIconButton('Block quote', 'quote', () => onCommand('blockQuote'))}
          {renderToolbarIconButton('Block indent', 'indent', () => onCommand('blockIndent'))}
          {renderToolbarIconButton('Remove block indent', 'outdent', () => onCommand('removeBlockIndent'))}
        </div>
        <div className="toastui-editor-toolbar-group">
          {renderToolbarIconButton('Dash list', 'dash-list', () => onCommand('dashList'))}
          {renderToolbarIconButton('Unordered list', 'bullet-list', () => onCommand('bulletList'))}
          {renderToolbarIconButton('Ordered list', 'ordered-list', () => onCommand('orderedList'))}
          {renderToolbarIconButton('Task', 'task-list', () => onCommand('taskList'))}
        </div>
        <div className="toastui-editor-toolbar-group">
          {renderToolbarIconButton('Insert table', 'table', () => onCommand('addTable', { rowCount: 2, columnCount: 2 }))}
          {renderToolbarIconButton('Insert image', 'image', () => onInsertImage())}
          {renderToolbarIconButton('Insert link', 'link', () => onInsertWebLink())}
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
