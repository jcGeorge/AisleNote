import { Editor } from '@toast-ui/editor'
import { normalizeMarkdownForPersistence } from '../markdown/markdown-utils'
import { sanitizeEditorHtml } from './editor-sanitizer'

export type TransientToastEditor = {
  setHTML: (html: string, cursorToEnd?: boolean) => void
  insertText: (text: string) => void
  getMarkdown: () => string
  destroy: () => void
  focus?: () => void
}

export function runWithTransientToastEditor(run: (editor: TransientToastEditor) => void): string {
  if (typeof document === 'undefined') throw new Error('clipboard markdown conversion requires a DOM')

  const el = document.createElement('div')
  el.setAttribute('aria-hidden', 'true')
  el.style.position = 'fixed'
  el.style.left = '-10000px'
  el.style.top = '-10000px'
  el.style.width = '1px'
  el.style.height = '1px'
  el.style.overflow = 'hidden'
  document.body.appendChild(el)

  const editor = new Editor({
    el,
    initialValue: '',
    initialEditType: 'wysiwyg',
    previewStyle: 'tab',
    hideModeSwitch: true,
    customHTMLSanitizer: sanitizeEditorHtml,
    toolbarItems: [],
    height: '1px',
    usageStatistics: false,
  }) as unknown as TransientToastEditor

  try {
    run(editor)
    return normalizeMarkdownForPersistence(editor.getMarkdown())
  } finally {
    editor.destroy()
    el.remove()
  }
}
