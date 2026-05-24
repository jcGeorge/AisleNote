import { Editor } from '@toast-ui/editor'
import { TextSelection } from 'prosemirror-state'
import {
  annotationLinePlugin,
  blockIndentPlugin,
  headingSpaceShortcutPlugin,
  highlightPlugin,
  listMarkerPlugin,
  thematicBreakShortcutPlugin,
} from './editor-setup'
import { NOTE_PREVIEW_EDITOR_HOST_CLASS } from './note-preview-dom'
import { getWysiwygView } from './prosemirror-utils'
import { prepareMarkdownForEditorDisplay, restoreEditorBlankParagraphs } from './editor-markdown-display'
import { getHeadingOutlineFromDoc } from './heading-outline'
import {
  getMarkdownLinkLabel,
  type NoteContextReferencePayload,
} from '../notes/note-references'
import type { ContextPreviewData } from '../notes/note-preview-data'
import type { NoteAisle, NoteNavigationTarget } from '../types/app'

const NOTE_PREVIEW_DEFAULT_HEIGHT_REM = 20
const NOTE_PREVIEW_EXPANDED_HEIGHT_REM = 30

export type NotePreviewWidgetOptions = {
  sourceNoteBodyId: string
  getContextPreviewData: (payload: NoteContextReferencePayload, sourceNoteBodyId: string) => ContextPreviewData
  navigateToNoteLocation: (target: NoteNavigationTarget) => void
  deleteContextPreview: (tokenId: string) => void
}

function scrollPreviewEditorToHeading(editor: Editor, aisleId: string, headingKey: string): boolean {
  const view = getWysiwygView(editor)
  if (!view?.state?.doc) return false
  const heading = getHeadingOutlineFromDoc(aisleId, view.state.doc).find((candidate) => candidate.key === headingKey)
  if (typeof heading?.start !== 'number') return false
  try {
    const selectionPosition = Math.min(heading.start + 1, view.state.doc.content.size)
    view.dispatch(
      view.state.tr
        .setSelection(TextSelection.create(view.state.doc, selectionPosition, selectionPosition))
        .setMeta('addToHistory', false)
        .scrollIntoView(),
    )
    return true
  } catch {
    // Stale heading keys intentionally fall back to the top of the preview.
    return false
  }
}

function schedulePreviewHeadingScroll(editor: Editor, aisleId: string, headingKey: string, attempts = 4) {
  if (!headingKey || attempts <= 0) return
  window.requestAnimationFrame(() => {
    if (scrollPreviewEditorToHeading(editor, aisleId, headingKey)) return
    schedulePreviewHeadingScroll(editor, aisleId, headingKey, attempts - 1)
  })
}

function getPreviewStatusText(data: ContextPreviewData) {
  if (data.status === 'missing') return 'note preview target is missing.'
  if (data.status === 'blocked') return 'note preview blocked to prevent recursive rendering.'
  if (data.status === 'empty') return 'note preview is empty.'
  return ''
}

function getPreviewTitleButtonClassName(kind: ContextPreviewData['titleButtons'][number]['kind']): string {
  if (kind === 'domain') return 'context-preview-title-btn compact-scope-btn compact-domain-btn is-domain'
  if (kind === 'space') return 'context-preview-title-btn compact-scope-btn compact-space-btn is-space'
  if (kind === 'parent') return 'context-preview-title-btn btn btn-sm tab-btn parent-tab-btn'
  return 'context-preview-title-btn btn btn-sm tab-btn subtab-btn'
}

export function createContextPreviewWidgetElement(
  payload: NoteContextReferencePayload,
  options: NotePreviewWidgetOptions,
) {
  const wrapper = document.createElement('span')
  wrapper.className = 'context-bar note-context-widget'
  wrapper.setAttribute('contenteditable', 'false')

  const topBar = document.createElement('span')
  topBar.className = 'context-bar-top'
  const titleGroup = document.createElement('span')
  titleGroup.className = 'context-bar-title'
  titleGroup.setAttribute('aria-label', 'Open note preview target')
  const actions = document.createElement('span')
  actions.className = 'context-bar-actions'
  const minimizeButton = document.createElement('button')
  minimizeButton.type = 'button'
  minimizeButton.className = 'context-bar-icon-btn context-bar-minimize-btn'
  const expandButton = document.createElement('button')
  expandButton.type = 'button'
  expandButton.className = 'context-bar-icon-btn'
  const deleteButton = document.createElement('button')
  deleteButton.type = 'button'
  deleteButton.className = 'context-bar-icon-btn context-bar-delete-btn'
  const lowerBar = document.createElement('span')
  lowerBar.className = 'context-bar-lower'

  let expanded = false
  let minimized = false
  let contextEditorCleanups: Array<() => void> = []

  const stopWidgetEvent = (event: Event) => {
    event.preventDefault()
    event.stopPropagation()
  }

  const clearLowerBar = () => {
    contextEditorCleanups.forEach((cleanup) => cleanup())
    contextEditorCleanups = []
    lowerBar.replaceChildren()
  }

  const activatePreviewTarget = (event: Event) => {
    stopWidgetEvent(event)
    const data = options.getContextPreviewData(payload, options.sourceNoteBodyId)
    if (data.status === 'ready' || data.status === 'empty') options.navigateToNoteLocation({ ...payload.target, heading: payload.heading })
  }

  const renderTitleButtons = (data: ContextPreviewData) => {
    titleGroup.replaceChildren()
    titleGroup.title = data.locationLabel
    if (data.titleButtons.length === 0) {
      const fallback = document.createElement('span')
      fallback.className = 'context-preview-title-missing'
      fallback.textContent = data.locationLabel
      titleGroup.append(fallback)
      return
    }

    data.titleButtons.forEach((button) => {
      const titleButton = document.createElement('button')
      titleButton.type = 'button'
      titleButton.className = getPreviewTitleButtonClassName(button.kind)
      titleButton.textContent = button.label
      titleButton.title = data.locationLabel
      titleButton.setAttribute('aria-label', `Open note preview target: ${data.locationLabel}`)
      titleButton.addEventListener('mousedown', stopWidgetEvent)
      titleButton.addEventListener('click', activatePreviewTarget)
      titleGroup.append(titleButton)
    })
  }

  const renderContextEditor = (aisle: NoteAisle) => {
    const shell = document.createElement('span')
    shell.className = 'context-bar-editor'
    const editorHost = document.createElement('span')
    editorHost.className = `${NOTE_PREVIEW_EDITOR_HOST_CLASS} is-readonly`
    const heightRem = expanded ? NOTE_PREVIEW_EXPANDED_HEIGHT_REM : NOTE_PREVIEW_DEFAULT_HEIGHT_REM
    editorHost.style.setProperty('--note-preview-editor-height', `${heightRem}rem`)

    const stopOuterEditorEvent = (event: Event) => {
      event.stopPropagation()
      if (event.type === 'keydown' || event.type === 'beforeinput' || event.type === 'paste' || event.type === 'drop') {
        event.preventDefault()
      }
    }
    ;['pointerdown', 'mousedown', 'click', 'keydown', 'beforeinput', 'paste', 'drop'].forEach((eventName) => {
      editorHost.addEventListener(eventName, stopOuterEditorEvent, true)
    })

    const editor = new Editor({
      el: editorHost,
      initialValue: prepareMarkdownForEditorDisplay(aisle.markdown),
      initialEditType: 'wysiwyg',
      previewStyle: 'tab',
      hideModeSwitch: true,
      toolbarItems: [],
      height: `${heightRem}rem`,
      autofocus: false,
      usageStatistics: false,
      plugins: [
        listMarkerPlugin,
        blockIndentPlugin,
        annotationLinePlugin,
        highlightPlugin,
        headingSpaceShortcutPlugin,
        thematicBreakShortcutPlugin,
      ],
    })
    restoreEditorBlankParagraphs(editor, aisle.markdown)
    if (payload.heading?.aisleId === aisle.id) {
      schedulePreviewHeadingScroll(editor, aisle.id, payload.heading.headingKey)
    }

    const view = getWysiwygView(editor)
    if (view?.setProps) {
      view.setProps({ editable: () => false })
      view.dom?.setAttribute?.('contenteditable', 'false')
    }

    contextEditorCleanups.push(() => {
      ;['pointerdown', 'mousedown', 'click', 'keydown', 'beforeinput', 'paste', 'drop'].forEach((eventName) => {
        editorHost.removeEventListener(eventName, stopOuterEditorEvent, true)
      })
      try {
        editor.destroy()
      } catch {
        // Toast UI can throw if an embedded editor is destroyed during ProseMirror widget cleanup.
      }
    })

    shell.append(editorHost)
    return shell
  }

  const renderLowerBar = () => {
    const data = options.getContextPreviewData(payload, options.sourceNoteBodyId)
    wrapper.classList.toggle('is-blocked', data.status === 'blocked')
    wrapper.classList.toggle('is-missing', data.status === 'missing')
    wrapper.classList.toggle('is-empty', data.status === 'empty')
    wrapper.classList.toggle('is-minimized', minimized)
    renderTitleButtons(data)
    minimizeButton.classList.toggle('is-restore', minimized)
    minimizeButton.title = minimized ? 'Restore note preview' : 'Minimize note preview'
    minimizeButton.setAttribute('aria-label', minimizeButton.title)
    expandButton.textContent = expanded ? '-' : '+'
    expandButton.title = expanded ? 'Shrink note preview' : 'Expand note preview'
    expandButton.setAttribute('aria-label', expandButton.title)
    deleteButton.title = 'Delete note preview'
    deleteButton.setAttribute('aria-label', deleteButton.title)
    clearLowerBar()

    lowerBar.hidden = minimized
    if (minimized) return

    const statusText = getPreviewStatusText(data)
    if (statusText) {
      lowerBar.textContent = statusText
      return
    }

    const editorGroup = document.createElement('span')
    editorGroup.className = 'context-bar-editors'
    data.selectedAisles.forEach((aisle) => {
      editorGroup.append(renderContextEditor(aisle))
    })
    lowerBar.append(editorGroup)
  }

  minimizeButton.addEventListener('mousedown', stopWidgetEvent)
  minimizeButton.addEventListener('click', (event) => {
    stopWidgetEvent(event)
    minimized = !minimized
    renderLowerBar()
  })
  expandButton.addEventListener('mousedown', stopWidgetEvent)
  expandButton.addEventListener('click', (event) => {
    stopWidgetEvent(event)
    expanded = !expanded
    renderLowerBar()
  })
  deleteButton.addEventListener('mousedown', stopWidgetEvent)
  deleteButton.addEventListener('click', (event) => {
    stopWidgetEvent(event)
    options.deleteContextPreview(payload.id)
  })

  actions.append(minimizeButton, expandButton, deleteButton)
  topBar.append(titleGroup, actions)
  wrapper.append(topBar, lowerBar)
  renderLowerBar()
  ;(wrapper as HTMLElement & { destroyNotePreview?: () => void }).destroyNotePreview = () => {
    clearLowerBar()
  }
  return wrapper
}

export function createInternalNoteLinkWidgetElement(
  label: string,
  target: NoteNavigationTarget,
  href: string,
  navigateToNoteLocation: (target: NoteNavigationTarget) => void,
) {
  const link = document.createElement('a')
  link.className = 'internal-note-link-widget'
  link.href = href
  link.textContent = getMarkdownLinkLabel(label)
  link.title = 'Open linked note'
  link.setAttribute('contenteditable', 'false')
  link.setAttribute('data-internal-note-link', 'true')

  const stopEditingEvent = (event: Event) => {
    event.preventDefault()
    event.stopPropagation()
  }
  const activate = (event: Event) => {
    stopEditingEvent(event)
    navigateToNoteLocation(target)
  }

  link.addEventListener('pointerdown', stopEditingEvent)
  link.addEventListener('mousedown', stopEditingEvent)
  link.addEventListener('click', activate)
  link.addEventListener('keydown', (event) => {
    const keyboardEvent = event as KeyboardEvent
    if (keyboardEvent.key !== 'Enter' && keyboardEvent.key !== ' ') return
    activate(keyboardEvent)
  })

  return link
}
