import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { EditorSelection, EditorState } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  keymap,
} from '@codemirror/view'
import type { Editor } from '@toast-ui/editor'

type CodeMirrorMarkdownEditorOptions = {
  root: HTMLElement
  markdown: string
  onChange: (markdown: string) => void
  onFocus: () => void
}

type CommandPayload = Record<string, unknown> | undefined

export type CodeMirrorMarkdownEditorHandle = {
  __tabsEditorCore: 'codemirror'
  focus: () => void
  destroy: () => void
  getMarkdown: () => string
  setMarkdown: (markdown: string, cursorToEnd?: boolean) => void
  insertText: (text: string) => void
  exec: (command: string, payload?: CommandPayload) => void
  getSelectedText: () => string
}

export function isCodeMirrorMarkdownEditor(editor: Editor | null): editor is Editor & CodeMirrorMarkdownEditorHandle {
  return Boolean((editor as unknown as CodeMirrorMarkdownEditorHandle | null)?.__tabsEditorCore === 'codemirror')
}

export function createCodeMirrorMarkdownEditor({
  root,
  markdown: markdownText,
  onChange,
  onFocus,
}: CodeMirrorMarkdownEditorOptions): Editor {
  root.classList.add('tabs-codemirror-host')
  const view = new EditorView({
    parent: root,
    state: EditorState.create({
      doc: markdownText,
      extensions: [
        history(),
        drawSelection(),
        highlightActiveLine(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown(),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChange(update.state.doc.toString())
          if (update.focusChanged && update.view.hasFocus) onFocus()
        }),
      ],
    }),
  })

  const replaceSelection = (text: string) => {
    const changes = view.state.changeByRange((range) => ({
      changes: { from: range.from, to: range.to, insert: text },
      range: EditorSelection.cursor(range.from + text.length),
    }))
    view.dispatch({ ...changes, scrollIntoView: true })
  }

  const wrapSelection = (prefix: string, suffix = prefix) => {
    const changes = view.state.changeByRange((range) => {
      const selected = view.state.doc.sliceString(range.from, range.to)
      const insert = `${prefix}${selected}${suffix}`
      return {
        changes: { from: range.from, to: range.to, insert },
        range: EditorSelection.range(range.from + prefix.length, range.from + prefix.length + selected.length),
      }
    })
    view.dispatch({ ...changes, scrollIntoView: true })
  }

  const handle: CodeMirrorMarkdownEditorHandle = {
    __tabsEditorCore: 'codemirror',
    focus: () => view.focus(),
    destroy: () => {
      root.classList.remove('tabs-codemirror-host')
      view.destroy()
    },
    getMarkdown: () => view.state.doc.toString(),
    setMarkdown: (nextMarkdown: string, cursorToEnd = false) => {
      const next = String(nextMarkdown ?? '')
      const position = cursorToEnd ? next.length : Math.min(view.state.selection.main.from, next.length)
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: next },
        selection: EditorSelection.cursor(position),
        scrollIntoView: true,
      })
    },
    insertText: replaceSelection,
    exec: (command: string, payload?: CommandPayload) => {
      if (command === 'bold') {
        wrapSelection('**')
        return
      }
      if (command === 'italic') {
        wrapSelection('*')
        return
      }
      if (command === 'strike') {
        wrapSelection('~~')
        return
      }
      if (command === 'highlight') {
        wrapSelection('==')
        return
      }
      if (command === 'addTable') {
        replaceSelection('\n\n|  |  |\n| --- | --- |\n|  |  |\n')
        return
      }
      if (command === 'addImage') {
        const imageUrl = typeof payload?.imageUrl === 'string' ? payload.imageUrl : ''
        const altText = typeof payload?.altText === 'string' ? payload.altText : 'image'
        if (imageUrl) replaceSelection(`![${altText}](${imageUrl})`)
        return
      }
      if (command === 'link') {
        const linkUrl = typeof payload?.linkUrl === 'string' ? payload.linkUrl : ''
        const selected = handle.getSelectedText()
        if (linkUrl) replaceSelection(`[${selected || linkUrl}](${linkUrl})`)
      }
    },
    getSelectedText: () => view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to),
  }

  return handle as unknown as Editor
}
