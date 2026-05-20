import { Editor } from '@toast-ui/editor'
import {
  annotationLinePlugin,
  blockIndentPlugin,
  headingSpaceShortcutPlugin,
  highlightPlugin,
  listMarkerPlugin,
  thematicBreakShortcutPlugin,
} from './editor-setup'
import {
  collectProseMirrorTextPositions,
  getWysiwygView,
} from './prosemirror-utils'
import { NOTE_PREVIEW_EDITOR_HOST_CLASS } from './note-preview-dom'
import {
  decodeContextPayload,
  getMarkdownLinkLabel,
  INTERNAL_NOTE_LINK_MARKDOWN_RE,
  NOTE_CONTEXT_REFERENCE_RE,
  type NoteContextReferencePayload,
  parseInternalNoteUrl,
} from '../notes/note-references'
import type { NoteAisle, NoteLocation } from '../types/app'
import { prepareMarkdownHighlightsForDisplay } from '../markdown/markdown-utils'

const NOTE_PREVIEW_DEFAULT_HEIGHT_REM = 20
const NOTE_PREVIEW_EXPANDED_HEIGHT_REM = 30

export type ContextPreviewData = {
  selectedAisles: NoteAisle[]
  recursiveBlocked: boolean
  locationLabel: string
  displayTitle: string
}

type NotePreviewPluginOptions = {
  sourceNoteBodyId: string
  getContextPreviewData: (payload: NoteContextReferencePayload, sourceNoteBodyId: string) => ContextPreviewData
  navigateToNoteLocation: (target: NoteLocation) => void
  deleteContextPreview: (tokenId: string) => void
}

function createContextPreviewWidgetElement(
  payload: NoteContextReferencePayload,
  options: NotePreviewPluginOptions,
) {
  const wrapper = document.createElement('span')
  wrapper.className = 'context-bar note-context-widget'
  wrapper.setAttribute('contenteditable', 'false')

  const topBar = document.createElement('span')
  topBar.className = 'context-bar-top'
  const titleButton = document.createElement('button')
  titleButton.type = 'button'
  titleButton.className = 'context-bar-title'
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
      initialValue: prepareMarkdownHighlightsForDisplay(aisle.markdown),
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
    wrapper.classList.toggle('is-blocked', data.recursiveBlocked)
    wrapper.classList.toggle('is-minimized', minimized)
    titleButton.textContent = data.displayTitle
    titleButton.title = data.locationLabel
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

    if (data.recursiveBlocked) {
      lowerBar.textContent = 'note preview blocked to prevent recursive rendering.'
      return
    }

    const editorGroup = document.createElement('span')
    editorGroup.className = 'context-bar-editors'
    data.selectedAisles.forEach((aisle) => {
      editorGroup.append(renderContextEditor(aisle))
    })
    lowerBar.append(editorGroup)
  }

  titleButton.addEventListener('mousedown', stopWidgetEvent)
  titleButton.addEventListener('click', (event) => {
    stopWidgetEvent(event)
    const data = options.getContextPreviewData(payload, options.sourceNoteBodyId)
    if (!data.recursiveBlocked) options.navigateToNoteLocation(payload.target)
  })
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
  topBar.append(titleButton, actions)
  wrapper.append(topBar, lowerBar)
  renderLowerBar()
  ;(wrapper as HTMLElement & { destroyNotePreview?: () => void }).destroyNotePreview = () => {
    clearLowerBar()
  }
  return wrapper
}

function createInternalNoteLinkWidgetElement(
  label: string,
  target: NoteLocation,
  href: string,
  navigateToNoteLocation: (target: NoteLocation) => void,
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

export function createContextPreviewPlugin(context: any, options: NotePreviewPluginOptions) {
  const { Plugin } = context.pmState
  const { Decoration, DecorationSet } = context.pmView
  return {
    wysiwygPlugins: [
      () =>
        new Plugin({
          props: {
            decorations: (editorState: any) => {
              const decorations: unknown[] = []
              const docText = collectProseMirrorTextPositions(editorState.doc)
              editorState.doc.descendants((node: any, pos: number) => {
                if (!node.isText || typeof node.text !== 'string') return
                for (const match of node.text.matchAll(NOTE_CONTEXT_REFERENCE_RE)) {
                  const payload = decodeContextPayload(match[1])
                  if (!payload) continue
                  const from = pos + (match.index ?? 0)
                  const to = from + match[0].length
                  decorations.push(
                    Decoration.widget(from, () => createContextPreviewWidgetElement(payload, options), {
                      key: `note-preview-${payload.id}`,
                      side: -1,
                      destroy: (node: HTMLElement & { destroyNotePreview?: () => void }) => node.destroyNotePreview?.(),
                    }),
                  )
                  decorations.push(Decoration.inline(from, to, { class: 'note-context-token-hidden' }))
                }
              })
              for (const match of docText.text.matchAll(INTERNAL_NOTE_LINK_MARKDOWN_RE)) {
                if (match[0].startsWith('!')) continue
                const target = parseInternalNoteUrl(match[2])
                if (!target) continue

                const startIndex = match.index ?? 0
                const endIndex = startIndex + match[0].length - 1
                const from = docText.positions[startIndex]
                const last = docText.positions[endIndex]
                const rangePositions = docText.positions.slice(startIndex, endIndex + 1)
                if (from === undefined || last === undefined || from < 0 || last < from || rangePositions.some((position) => position < 0)) {
                  continue
                }

                decorations.push(
                  Decoration.widget(from, () => createInternalNoteLinkWidgetElement(match[1], target, match[2], options.navigateToNoteLocation), {
                    key: `internal-note-link-${from}-${last}-${match[2]}`,
                    side: -1,
                  }),
                )
                decorations.push(Decoration.inline(from, last + 1, { class: 'internal-note-link-source-hidden' }))
              }
              return DecorationSet.create(editorState.doc, decorations)
            },
          },
        }),
    ],
  }
}
