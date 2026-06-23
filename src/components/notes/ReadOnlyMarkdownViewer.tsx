import * as React from 'react'
import {
  annotationLinePlugin,
  blockIndentPlugin,
  highlightPlugin,
  listMarkerPlugin,
  tagAppearancePlugin,
} from '../../editor/editor-setup'
import { prepareMarkdownForEditorDisplay, restoreEditorDisplay } from '../../editor/editor-markdown-display'
import { sanitizeEditorHtml } from '../../editor/editor-sanitizer'
import { normalizeExternalWebUrl, openExternalWebUrl } from '../../notes/external-links'
import { resolveMarkdownNoteReferenceDestination } from '../../notes/note-references'
import type { AppState, NoteLocation } from '../../types/app'

void React

type ToastEditorLike = {
  destroy?: () => void
}

type ReadOnlyMarkdownViewerProps = {
  markdown: string
  className?: string
  appState?: AppState | null
  onOpenNote?: (target: NoteLocation) => void
}

function getElementFromEventTarget(target: EventTarget | null): Element | null {
  return typeof Element !== 'undefined' && target instanceof Element ? target : null
}

function normalizePotentialInternalNoteHref(href: string): string {
  const normalized = href.trim()
  if (!normalized) return ''
  try {
    const decoded = decodeURIComponent(normalized)
    if (decoded.startsWith('<') && decoded.endsWith('>')) return decoded
  } catch {
    // Keep the original value if it is not URI encoded.
  }
  return normalized
}

function resolvePreviewNoteLinkTarget(appState: AppState | null | undefined, href: string, label: string) {
  if (!appState) return null
  const normalized = normalizePotentialInternalNoteHref(href)
  if (!normalized) return null
  return resolveMarkdownNoteReferenceDestination(appState, normalized, label, false)?.target ?? null
}

function stopReadonlyTaskMutation(event: Event) {
  const target = getElementFromEventTarget(event.target)
  if (!target?.closest('.task-list-item')) return
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()
}

function stopReadonlyEditorMutation(event: Event) {
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()
}

function disableEditorEditing(host: HTMLElement) {
  const editorRoot = host.querySelector<HTMLElement>('.ProseMirror')
  if (!editorRoot) return
  editorRoot.setAttribute('contenteditable', 'false')
  editorRoot.setAttribute('aria-readonly', 'true')
  editorRoot.setAttribute('tabindex', '-1')
}

export function ReadOnlyMarkdownViewer({
  markdown,
  className = 'context-preview-editor-host',
  appState = null,
  onOpenNote,
}: ReadOnlyMarkdownViewerProps) {
  const hostRef = React.useRef<HTMLDivElement | null>(null)
  const displayMarkdown = React.useMemo(() => prepareMarkdownForEditorDisplay(markdown), [markdown])

  React.useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined

    let disposed = false
    let editor: ToastEditorLike | null = null
    host.innerHTML = ''
    host.addEventListener('mousedown', stopReadonlyTaskMutation, true)
    host.addEventListener('beforeinput', stopReadonlyEditorMutation, true)
    host.addEventListener('paste', stopReadonlyEditorMutation, true)
    host.addEventListener('drop', stopReadonlyEditorMutation, true)

    void import('@toast-ui/editor').then((toastEditorModule) => {
      if (disposed || !hostRef.current) return
      const EditorConstructor = toastEditorModule.Editor
      const mountedEditor = new EditorConstructor({
        el: host,
        initialValue: displayMarkdown,
        initialEditType: 'wysiwyg',
        previewStyle: 'tab',
        hideModeSwitch: true,
        toolbarItems: [],
        height: '100%',
        autofocus: false,
        usageStatistics: false,
        customHTMLSanitizer: sanitizeEditorHtml,
        plugins: [
          listMarkerPlugin,
          blockIndentPlugin,
          annotationLinePlugin,
          tagAppearancePlugin,
          highlightPlugin,
        ],
      })
      editor = mountedEditor
      restoreEditorDisplay(mountedEditor, markdown)
      disableEditorEditing(host)
      window.requestAnimationFrame(() => {
        if (!disposed) disableEditorEditing(host)
      })
    })

    return () => {
      disposed = true
      host.removeEventListener('mousedown', stopReadonlyTaskMutation, true)
      host.removeEventListener('beforeinput', stopReadonlyEditorMutation, true)
      host.removeEventListener('paste', stopReadonlyEditorMutation, true)
      host.removeEventListener('drop', stopReadonlyEditorMutation, true)
      try {
        editor?.destroy?.()
      } finally {
        host.innerHTML = ''
      }
    }
  }, [displayMarkdown])

  const handleClick = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.button !== 0) return
    const target = getElementFromEventTarget(event.target)
    const anchor = target?.closest<HTMLAnchorElement>('a[href]') ?? null
    if (!anchor || !event.currentTarget.contains(anchor)) return

    const href = anchor.getAttribute('href')?.trim() ?? ''
    if (!href) return

    const noteTarget = resolvePreviewNoteLinkTarget(appState, href, anchor.textContent ?? '')
    if (noteTarget && onOpenNote) {
      event.preventDefault()
      event.stopPropagation()
      onOpenNote(noteTarget)
      return
    }

    const externalUrl = normalizeExternalWebUrl(href)
    if (externalUrl && openExternalWebUrl(externalUrl)) {
      event.preventDefault()
      event.stopPropagation()
    }
  }, [appState, onOpenNote])

  return (
    <div
      ref={hostRef}
      className={`${className} aislenote-note-preview-readonly-viewer`.trim()}
      onClick={handleClick}
      data-note-preview-readonly-viewer="true"
    />
  )
}
