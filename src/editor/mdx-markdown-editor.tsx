import type { Editor } from '@toast-ui/editor'
import { createRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { MDXEditorMethods } from '@mdxeditor/editor'
import { MdxMarkdownEditorComponent } from './MdxMarkdownEditorComponent'
import { preloadMdxEditorModule } from './mdx-editor-loader'

type MdxMarkdownEditorOptions = {
  root: HTMLElement
  markdown: string
  onChange: (markdown: string) => void
  onInitialNormalize: (markdown: string) => void
  onFocus: () => void
  onReady?: (durationMs: number) => void
}

type CommandPayload = Record<string, unknown> | undefined

export type MdxMarkdownEditorHandle = {
  __tabsEditorCore: 'mdxeditor'
  focus: () => void
  destroy: () => void
  getMarkdown: () => string
  setMarkdown: (markdown: string, cursorToEnd?: boolean) => void
  insertText: (text: string) => void
  exec: (command: string, payload?: CommandPayload) => void
  getSelectedText: () => string
}

export function isMdxMarkdownEditor(editor: Editor | null): editor is Editor & MdxMarkdownEditorHandle {
  return Boolean((editor as unknown as MdxMarkdownEditorHandle | null)?.__tabsEditorCore === 'mdxeditor')
}

export function getMdxMarkdownInsertionForCommand(
  command: string,
  payload: CommandPayload,
  selectedMarkdown: string,
): string | null {
  if (
    selectedMarkdown.length === 0 &&
    (command === 'bold' || command === 'italic' || command === 'strike' || command === 'highlight' || command === 'code')
  ) {
    return null
  }
  if (command === 'bold') return `**${selectedMarkdown}**`
  if (command === 'italic') return `*${selectedMarkdown}*`
  if (command === 'strike') return `~~${selectedMarkdown}~~`
  if (command === 'highlight') return `==${selectedMarkdown}==`
  if (command === 'code') return `\`${selectedMarkdown}\``
  if (command === 'codeBlock') return `\n\n\`\`\`\n${selectedMarkdown}\n\`\`\`\n`
  if (command === 'addTable') return '\n\n|  |  |\n| --- | --- |\n|  |  |\n'
  if (command === 'hr') return '\n\n---\n\n'
  if (command === 'addImage') {
    const imageUrl = typeof payload?.imageUrl === 'string' ? payload.imageUrl : ''
    const altText = typeof payload?.altText === 'string' ? payload.altText : 'image'
    return imageUrl ? `![${altText}](${imageUrl})` : null
  }
  if (command === 'link') {
    const linkUrl = typeof payload?.linkUrl === 'string' ? payload.linkUrl : ''
    return linkUrl ? `[${selectedMarkdown || linkUrl}](${linkUrl})` : null
  }
  return null
}

export function createMdxMarkdownEditor({
  root,
  markdown,
  onChange,
  onInitialNormalize,
  onFocus,
  onReady,
}: MdxMarkdownEditorOptions): Editor {
  root.classList.add('tabs-mdxeditor-host')
  const reactHost = document.createElement('div')
  reactHost.className = 'tabs-mdxeditor-react-root'
  root.append(reactHost)
  const reactRoot: Root = createRoot(reactHost)
  const editorRef = createRef<MDXEditorMethods>()
  let latestMarkdown = markdown
  const handleFocusIn = () => {
    root.classList.add('is-mdxeditor-focused')
    onFocus()
  }
  const handleFocusOut = (event: FocusEvent) => {
    const nextTarget = event.relatedTarget
    if (nextTarget instanceof Node && root.contains(nextTarget)) return
    root.classList.remove('is-mdxeditor-focused')
  }
  root.addEventListener('focusin', handleFocusIn)
  root.addEventListener('focusout', handleFocusOut)

  const insertMarkdown = (markdownInsertion: string) => {
    const editor = editorRef.current
    if (editor) {
      editor.insertMarkdown(markdownInsertion)
      return
    }
    latestMarkdown = `${latestMarkdown}${markdownInsertion}`
    onChange(latestMarkdown)
  }

  reactRoot.render(
    <MdxMarkdownEditorComponent
      editorRef={editorRef}
      markdown={markdown}
      onInitialNormalize={(nextMarkdown) => {
        latestMarkdown = nextMarkdown
        onInitialNormalize(nextMarkdown)
      }}
      onChange={(nextMarkdown) => {
        latestMarkdown = nextMarkdown
        onChange(nextMarkdown)
      }}
      onReady={onReady}
    />,
  )

  const handle: MdxMarkdownEditorHandle = {
    __tabsEditorCore: 'mdxeditor',
    focus: () => {
      const editor = editorRef.current
      if (editor) {
        editor.focus()
        return
      }
      root.focus()
    },
    destroy: () => {
      root.removeEventListener('focusin', handleFocusIn)
      root.removeEventListener('focusout', handleFocusOut)
      root.classList.remove('tabs-mdxeditor-host')
      root.classList.remove('is-mdxeditor-focused')
      reactHost.remove()
      window.setTimeout(() => {
        reactRoot.unmount()
      }, 0)
    },
    getMarkdown: () => editorRef.current?.getMarkdown() ?? latestMarkdown,
    setMarkdown: (nextMarkdown: string, cursorToEnd = false) => {
      latestMarkdown = String(nextMarkdown ?? '')
      editorRef.current?.setMarkdown(latestMarkdown)
      if (cursorToEnd) {
        window.requestAnimationFrame(() => {
          editorRef.current?.focus(undefined, { defaultSelection: 'rootEnd' })
        })
      }
    },
    insertText: insertMarkdown,
    exec: (command: string, payload?: CommandPayload) => {
      const selectedMarkdown = handle.getSelectedText()
      const insertion = getMdxMarkdownInsertionForCommand(command, payload, selectedMarkdown)
      if (insertion !== null) insertMarkdown(insertion)
    },
    getSelectedText: () => editorRef.current?.getSelectionMarkdown() ?? '',
  }

  return handle as unknown as Editor
}

export const preloadMdxMarkdownEditorModule = preloadMdxEditorModule
