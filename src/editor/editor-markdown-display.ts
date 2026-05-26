import type { Editor } from '@toast-ui/editor'
import {
  isBlankParagraphNode,
  mergeLeadingIndentsFromWysiwyg,
  normalizeEmptyHeadingMarkersFromWysiwyg,
  normalizeMarkdownForPersistence,
  prepareBlankParagraphsForEditorDisplay,
  prepareMarkdownHighlightsForDisplay,
  preserveBlankParagraphsFromWysiwyg,
} from '../markdown/markdown-utils'
import {
  normalizeMarkdownImageSourcesForPersistence,
  prepareMarkdownImagesForDisplay,
} from '../markdown/image-asset-registry'
import { measureSlowOperation } from '../performance/performance-logging'
import { getWysiwygView, markWysiwygLoadedUndoBoundary } from './prosemirror-utils'

export function getEditorMarkdownForPersistence(editor: Editor): string {
  return normalizeMarkdownImageSourcesForPersistence(
    normalizeEmptyHeadingMarkersFromWysiwyg(
      editor,
      preserveBlankParagraphsFromWysiwyg(
        editor,
        normalizeMarkdownForPersistence(mergeLeadingIndentsFromWysiwyg(editor, editor.getMarkdown())),
      ),
    ),
  )
}

export function prepareMarkdownForEditorDisplay(markdown: string): string {
  const blankPrepared = prepareBlankParagraphsForEditorDisplay(markdown)
  return prepareMarkdownImagesForDisplay(prepareMarkdownHighlightsForDisplay(blankPrepared.markdown))
}

export function restoreEditorBlankParagraphs(editor: Editor | null, markdown: string): boolean {
  return measureSlowOperation('editor blank paragraph restoration', () => restoreEditorBlankParagraphsUnmeasured(editor, markdown))
}

function restoreEditorBlankParagraphsUnmeasured(editor: Editor | null, markdown: string): boolean {
  const blankPrepared = prepareBlankParagraphsForEditorDisplay(markdown)
  if (!blankPrepared.blockKinds.includes('blank')) return false

  const view = getWysiwygView(editor)
  const doc = view?.state?.doc
  const paragraphType = view?.state?.schema?.nodes?.paragraph
  if (!view?.dispatch || !doc || typeof doc.forEach !== 'function' || !paragraphType) return false

  const contentNodes: any[] = []
  doc.forEach((node: any) => {
    if (!isBlankParagraphNode(node)) {
      contentNodes.push(node)
    }
  })

  const expectedContentCount = blankPrepared.blockKinds.filter((kind) => kind === 'content').length
  if (contentNodes.length !== expectedContentCount) return false

  let contentIndex = 0
  const nextNodes = blankPrepared.blockKinds.map((kind) => {
    if (kind === 'content') {
      const node = contentNodes[contentIndex]
      contentIndex += 1
      return node
    }
    return paragraphType.createAndFill?.() ?? paragraphType.create()
  })

  try {
    view.dispatch(
      view.state.tr
        .replaceWith(0, doc.content.size, nextNodes)
        .setMeta('addToHistory', false)
        .setMeta('blankParagraphRestore', true),
    )
    return true
  } catch {
    return false
  }
}

export function setEditorMarkdownForDisplay(editor: Editor, markdown: string, cursorToEnd = false): void {
  measureSlowOperation('editor display markdown rewrite', () => {
    editor.setMarkdown(prepareMarkdownForEditorDisplay(markdown), cursorToEnd)
    restoreEditorBlankParagraphs(editor, markdown)
    markWysiwygLoadedUndoBoundary(editor)
  })
}

export function clearEditorMarkdownForDisplay(editor: Editor): void {
  setEditorMarkdownForDisplay(editor, '', false)
}
