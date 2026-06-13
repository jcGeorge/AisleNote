import type { Editor } from '@toast-ui/editor'
import {
  EDITOR_BLANK_LINE_PLACEHOLDER,
  type BlankParagraphDisplayOptions,
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

export function prepareMarkdownForEditorDisplay(
  markdown: string,
  options: BlankParagraphDisplayOptions = {},
): string {
  const blankPrepared = prepareBlankParagraphsForEditorDisplay(markdown, options)
  return prepareMarkdownImagesForDisplay(prepareMarkdownHighlightsForDisplay(blankPrepared.markdown))
}

export function restoreEditorBlankParagraphs(editor: Editor | null, markdown: string): boolean {
  return measureSlowOperation('editor blank paragraph restoration', () => restoreEditorBlankParagraphsUnmeasured(editor, markdown))
}

export type EditorDisplayRestoreResult = {
  restored: boolean
  viewReady: boolean
}

export function restoreEditorDisplay(editor: Editor | null, markdown: string): EditorDisplayRestoreResult {
  const view = getWysiwygView(editor)
  const viewReady = Boolean(view?.state?.doc)
  const restored = viewReady ? restoreEditorBlankParagraphs(editor, markdown) : false
  if (viewReady) {
    markWysiwygLoadedUndoBoundary(editor)
  }
  return { restored, viewReady }
}

type TopLevelEditorNode = {
  node: any
  position: number
  nodeSize: number
  kind: 'blank' | 'content'
}

function hasMarkdownTable(markdown: string): boolean {
  const lines = String(markdown ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  for (let index = 0; index < lines.length - 1; index += 1) {
    const header = lines[index].trim()
    const delimiter = lines[index + 1].trim()
    if (
      header.startsWith('|') &&
      header.endsWith('|') &&
      delimiter.startsWith('|') &&
      delimiter.endsWith('|') &&
      delimiter
        .slice(1, -1)
        .split('|')
        .every((cell) => /^:?-{3,}:?$/.test(cell.trim().replace(/\s+/g, '')))
    ) {
      return true
    }
  }
  return false
}

function hasExplicitBlankRestoreMarker(markdown: string): boolean {
  return String(markdown ?? '')
    .split(/\r\n|\r|\n/)
    .some((line) => line.includes(EDITOR_BLANK_LINE_PLACEHOLDER) || /^<br\s*\/?>$/i.test(line.trim()))
}

function createBlankParagraphNode(paragraphType: any) {
  return paragraphType.createAndFill?.() ?? paragraphType.create()
}

function collectTopLevelEditorNodes(doc: any): TopLevelEditorNode[] {
  const topLevelNodes: TopLevelEditorNode[] = []
  let nextPosition = 0
  doc.forEach((node: any, offset?: number) => {
    const position = typeof offset === 'number' && Number.isFinite(offset) ? offset : nextPosition
    const nodeSize = typeof node?.nodeSize === 'number' && Number.isFinite(node.nodeSize) ? node.nodeSize : 1
    topLevelNodes.push({
      node,
      position,
      nodeSize,
      kind: isBlankParagraphNode(node) ? 'blank' : 'content',
    })
    nextPosition = position + nodeSize
  })
  return topLevelNodes
}

function hasExpectedBlankParagraphLayout(topLevelNodes: TopLevelEditorNode[], blockKinds: string[]): boolean {
  return (
    topLevelNodes.length === blockKinds.length &&
    blockKinds.every((kind, index) => topLevelNodes[index]?.kind === kind)
  )
}

function getContentNodeCount(blockKinds: string[]) {
  return blockKinds.filter((kind) => kind === 'content').length
}

function applyTargetedBlankParagraphRestore({
  view,
  doc,
  paragraphType,
  topLevelNodes,
  blockKinds,
}: {
  view: any
  doc: any
  paragraphType: any
  topLevelNodes: TopLevelEditorNode[]
  blockKinds: string[]
}): boolean {
  if (typeof view.state?.tr?.insert !== 'function' || typeof view.state?.tr?.delete !== 'function') return false

  try {
    let tr = view.state.tr
    let positionShift = 0
    let currentIndex = 0
    let changed = false

    const deleteCurrentBlankNode = () => {
      const current = topLevelNodes[currentIndex]
      if (!current || current.kind !== 'blank') return false
      tr = tr.delete(current.position + positionShift, current.position + current.nodeSize + positionShift)
      positionShift -= current.nodeSize
      currentIndex += 1
      changed = true
      return true
    }

    for (const expectedKind of blockKinds) {
      let current = topLevelNodes[currentIndex]
      if (expectedKind === 'content') {
        while (current?.kind === 'blank') {
          deleteCurrentBlankNode()
          current = topLevelNodes[currentIndex]
        }
        if (!current || current.kind !== 'content') return false
        currentIndex += 1
        continue
      }

      if (expectedKind !== 'blank') return false
      if (current?.kind === 'blank') {
        currentIndex += 1
        continue
      }

      const insertPosition = current
        ? current.position + positionShift
        : doc.content.size + positionShift
      const blankParagraph = createBlankParagraphNode(paragraphType)
      tr = tr.insert(insertPosition, blankParagraph)
      positionShift += typeof blankParagraph?.nodeSize === 'number' && Number.isFinite(blankParagraph.nodeSize)
        ? blankParagraph.nodeSize
        : 1
      changed = true
    }

    while (currentIndex < topLevelNodes.length) {
      if (!deleteCurrentBlankNode()) return false
    }

    if (!changed) return false
    view.dispatch(
      tr
        .setMeta('addToHistory', false)
        .setMeta('blankParagraphRestore', true),
    )
    return true
  } catch {
    return false
  }
}

function applyFullBlankParagraphRestore({
  view,
  doc,
  paragraphType,
  topLevelNodes,
  blockKinds,
}: {
  view: any
  doc: any
  paragraphType: any
  topLevelNodes: TopLevelEditorNode[]
  blockKinds: string[]
}): boolean {
  const contentNodes = topLevelNodes.filter((item) => item.kind === 'content').map((item) => item.node)
  let contentIndex = 0
  const nextNodes = blockKinds.map((kind) => {
    if (kind === 'content') {
      const node = contentNodes[contentIndex]
      contentIndex += 1
      return node
    }
    return createBlankParagraphNode(paragraphType)
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

function restoreEditorBlankParagraphsUnmeasured(editor: Editor | null, markdown: string): boolean {
  const blankPrepared = prepareBlankParagraphsForEditorDisplay(markdown)
  if (hasMarkdownTable(markdown) && !hasExplicitBlankRestoreMarker(markdown)) return false

  const view = getWysiwygView(editor)
  const doc = view?.state?.doc
  const paragraphType = view?.state?.schema?.nodes?.paragraph
  if (!view?.dispatch || !doc || typeof doc.forEach !== 'function' || !paragraphType) return false

  const topLevelNodes = collectTopLevelEditorNodes(doc)
  if (!blankPrepared.blockKinds.includes('blank') && topLevelNodes.every((item) => item.kind !== 'blank')) return false

  if (hasExpectedBlankParagraphLayout(topLevelNodes, blankPrepared.blockKinds)) {
    return false
  }

  const currentContentCount = topLevelNodes.filter((item) => item.kind === 'content').length
  const expectedContentCount = getContentNodeCount(blankPrepared.blockKinds)
  if (currentContentCount !== expectedContentCount) return false

  if (applyTargetedBlankParagraphRestore({
    view,
    doc,
    paragraphType,
    topLevelNodes,
    blockKinds: blankPrepared.blockKinds,
  })) {
    return true
  }

  return applyFullBlankParagraphRestore({
    view,
    doc,
    paragraphType,
    topLevelNodes,
    blockKinds: blankPrepared.blockKinds,
  })
}

export function setEditorMarkdownForDisplay(
  editor: Editor,
  markdown: string,
  cursorToEnd = false,
  options: BlankParagraphDisplayOptions = {},
): void {
  measureSlowOperation('editor display markdown rewrite', () => {
    editor.setMarkdown(prepareMarkdownForEditorDisplay(markdown, options), cursorToEnd)
    restoreEditorDisplay(editor, markdown)
  })
}

export function clearEditorMarkdownForDisplay(editor: Editor): void {
  setEditorMarkdownForDisplay(editor, '', false)
}
