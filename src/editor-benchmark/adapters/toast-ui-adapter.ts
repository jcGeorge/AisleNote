import { Editor } from '@toast-ui/editor'
import '@toast-ui/editor/dist/toastui-editor.css'
import { prepareMarkdownForEditorDisplay, restoreEditorBlankParagraphs } from '../../editor/editor-markdown-display'
import type { EditorBenchmarkAdapter, MountedEditorBenchmark } from '../types'
import { focusInsideTableText, focusOutsideTableText, waitForAnimationFrame, waitForEditable } from './dom'

export const toastUiAdapter: EditorBenchmarkAdapter = {
  id: 'toast-ui',
  name: 'Toast UI Editor baseline',
  kind: 'wysiwyg-markdown',
  featureGaps: [
    'Baseline uses Toast UI WYSIWYG and app display prep/blank restore, without app media/note-preview plugins.',
  ],
  migrationRisk: 'Low if retained, but current app diagnostics already show constructor/change/blank-restore costs.',
  async mount(container, markdownText) {
    container.classList.add('editor-benchmark-toastui')
    const editor = new Editor({
      el: container,
      initialValue: prepareMarkdownForEditorDisplay(markdownText),
      initialEditType: 'wysiwyg',
      previewStyle: 'tab',
      hideModeSwitch: true,
      toolbarItems: [],
      height: '360px',
      autofocus: false,
      usageStatistics: false,
    })

    await waitForEditable(container)
    restoreEditorBlankParagraphs(editor, markdownText)
    await waitForAnimationFrame()

    return {
      focusOutsideTable: () => focusOutsideTableText(container),
      focusInsideTable: () => focusInsideTableText(container),
      serializeMarkdown: () => editor.getMarkdown(),
      destroy: () => editor.destroy(),
    } satisfies MountedEditorBenchmark
  },
}
