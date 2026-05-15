import { NOTE_PREVIEW_EDITOR_HOST_CLASS } from './note-preview-dom'

export const CODE_BLOCK_CONTROLS_ATTR = 'data-tabs-code-block-controls'
export const CODE_BLOCK_WRAPPER_SELECTOR = '.toastui-editor-ww-code-block'

type ToastTone = 'success' | 'warning' | 'error'

type CodeBlockControlsOptions = {
  pushToast?: (message: string, tone?: ToastTone) => void
}

type TextSelectionConstructor = {
  create: (doc: unknown, anchor: number, head?: number) => unknown
}

type ProseMirrorPluginConstructor = new (spec: {
  view?: (view: CodeBlockControlsView) => {
    update?: (view: CodeBlockControlsView) => void
    destroy?: () => void
  }
  props?: {
    handleDOMEvents?: Record<string, (view: CodeBlockControlsView, event: Event) => boolean>
  }
}) => unknown

export type CodeBlockControlsView = {
  dom?: Element
  state: {
    doc: any
    schema: any
    tr: any
  }
  dispatch: (transaction: any) => void
  focus?: () => void
  nodeDOM?: (position: number) => Node | null
  posAtDOM?: (node: Node, offset: number) => number
}

function isCodeBlockNode(node: any): boolean {
  return node?.type?.name === 'codeBlock'
}

export function getCodeBlockNodeText(node: any): string | null {
  if (!isCodeBlockNode(node)) return null
  if (typeof node.textContent === 'string') return node.textContent
  if (typeof node.text === 'string') return node.text
  return ''
}

function getTopLevelNodeAtPosition(doc: any, position: number): any | null {
  if (typeof doc?.nodeAt !== 'function') return null
  return doc.nodeAt(position) ?? null
}

function getCodeBlockEndPosition(node: any, position: number): number | null {
  const nodeSize = Number(node?.nodeSize)
  if (!Number.isFinite(nodeSize) || nodeSize <= 0) return null
  return position + nodeSize
}

function createEmptyParagraph(schema: any): any | null {
  const paragraphType = schema?.nodes?.paragraph
  if (!paragraphType) return null
  if (typeof paragraphType.createAndFill === 'function') return paragraphType.createAndFill()
  if (typeof paragraphType.create === 'function') return paragraphType.create(null)
  return null
}

export function deleteCodeBlockAtPosition(
  view: CodeBlockControlsView,
  position: number,
  TextSelection?: TextSelectionConstructor,
): boolean {
  if (!Number.isFinite(position) || position < 0) return false
  const node = getTopLevelNodeAtPosition(view.state.doc, position)
  if (!isCodeBlockNode(node)) return false
  const endPosition = getCodeBlockEndPosition(node, position)
  if (endPosition === null || endPosition <= position) return false

  let transaction = view.state.tr
  const isOnlyTopLevelBlock =
    view.state.doc?.childCount === 1 &&
    typeof view.state.doc?.child === 'function' &&
    view.state.doc.child(0) === node

  if (isOnlyTopLevelBlock) {
    const paragraph = createEmptyParagraph(view.state.schema)
    if (!paragraph || typeof transaction.replaceWith !== 'function') return false
    transaction = transaction.replaceWith(position, endPosition, paragraph)
    if (TextSelection && typeof transaction.setSelection === 'function') {
      try {
        const nextDoc = transaction.doc ?? view.state.doc
        transaction = transaction.setSelection(TextSelection.create(nextDoc, position + 1, position + 1))
      } catch {
        // A valid replacement is more important than a best-effort selection reset.
      }
    }
  } else {
    if (typeof transaction.delete !== 'function') return false
    transaction = transaction.delete(position, endPosition)
  }

  if (typeof transaction.scrollIntoView === 'function') {
    transaction = transaction.scrollIntoView()
  }
  view.dispatch(transaction)
  view.focus?.()
  return true
}

function isElementLike(node: Node | null): node is Element {
  if (!node) return false
  if (typeof Element !== 'undefined') return node instanceof Element
  return typeof (node as Element).contains === 'function'
}

function elementContainsNode(element: Element, node: Node | null): boolean {
  return Boolean(node && (element === node || element.contains(node)))
}

function codeBlockPositionMatchesElement(view: CodeBlockControlsView, position: number, element: Element): boolean {
  const node = getTopLevelNodeAtPosition(view.state.doc, position)
  if (!isCodeBlockNode(node)) return false
  const renderedNode = view.nodeDOM?.(position) ?? null
  if (!renderedNode) return true
  if (isElementLike(renderedNode)) {
    return elementContainsNode(element, renderedNode) || elementContainsNode(renderedNode, element)
  }
  return elementContainsNode(element, renderedNode)
}

function nearbyPositions(position: number): number[] {
  return [position, position - 1, position + 1, position - 2, position + 2].filter((candidate) => candidate >= 0)
}

export function findCodeBlockPositionForElement(view: CodeBlockControlsView, element: Element): number | null {
  const wrapper = element.closest(CODE_BLOCK_WRAPPER_SELECTOR)
  if (!wrapper) return null

  const candidates: number[] = []
  const candidateNodes = [wrapper, wrapper.querySelector('code')].filter((node): node is Element => Boolean(node))
  for (const node of candidateNodes) {
    try {
      const position = view.posAtDOM?.(node, 0)
      if (typeof position === 'number') {
        candidates.push(...nearbyPositions(position))
      }
    } catch {
      // DOM mapping can fail while Toast UI is replacing a node view.
    }
  }

  for (const position of candidates) {
    if (codeBlockPositionMatchesElement(view, position, wrapper)) return position
  }

  let fallbackPosition: number | null = null
  view.state.doc?.descendants?.((node: any, position: number) => {
    if (fallbackPosition !== null || !isCodeBlockNode(node)) return false
    const renderedNode = view.nodeDOM?.(position) ?? null
    if (renderedNode && elementContainsNode(wrapper, renderedNode)) {
      fallbackPosition = position
      return false
    }
    return true
  })
  return fallbackPosition
}

function createIcon(kind: 'copy' | 'trash'): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', '15')
  svg.setAttribute('height', '15')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')

  const paths = kind === 'copy'
    ? [
        'M8 8h10v12H8z',
        'M6 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
      ]
    : [
        'M3 6h18',
        'M8 6V4h8v2',
        'M19 6l-1 14H6L5 6',
        'M10 11v5',
        'M14 11v5',
      ]

  for (const pathData of paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', pathData)
    svg.appendChild(path)
  }
  return svg
}

function stopControlEvent(event: Event) {
  event.preventDefault()
  event.stopPropagation()
  if (typeof event.stopImmediatePropagation === 'function') {
    event.stopImmediatePropagation()
  }
}

async function copyCodeBlockText(text: string, pushToast?: CodeBlockControlsOptions['pushToast']) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard text writes are unavailable.')
    await navigator.clipboard.writeText(text)
    pushToast?.('code copied.', 'success')
  } catch {
    pushToast?.('could not copy code.', 'warning')
  }
}

function createControlButton(kind: 'copy' | 'trash') {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = `tabs-code-block-control-btn tabs-code-block-${kind}-btn`
  button.setAttribute('aria-label', kind === 'copy' ? 'Copy code block' : 'Delete code block')
  button.title = kind === 'copy' ? 'Copy code' : 'Delete code block'
  button.appendChild(createIcon(kind))
  button.addEventListener('pointerdown', stopControlEvent)
  button.addEventListener('mousedown', stopControlEvent)
  button.addEventListener('dragstart', stopControlEvent)
  return button
}

function getRenderedCodeText(wrapper: Element): string {
  return wrapper.querySelector('code')?.textContent ?? ''
}

function createControlsElement(
  view: CodeBlockControlsView,
  wrapper: Element,
  options: CodeBlockControlsOptions,
  TextSelection: TextSelectionConstructor,
) {
  const controls = document.createElement('span')
  controls.className = 'tabs-code-block-controls'
  controls.setAttribute(CODE_BLOCK_CONTROLS_ATTR, 'true')
  controls.setAttribute('contenteditable', 'false')
  controls.addEventListener('pointerdown', stopControlEvent)
  controls.addEventListener('mousedown', stopControlEvent)
  controls.addEventListener('click', stopControlEvent)

  const copyButton = createControlButton('copy')
  const deleteButton = createControlButton('trash')

  copyButton.addEventListener('click', (event) => {
    stopControlEvent(event)
    const position = findCodeBlockPositionForElement(view, wrapper)
    const nodeText = position === null ? null : getCodeBlockNodeText(view.state.doc.nodeAt(position))
    void copyCodeBlockText(nodeText ?? getRenderedCodeText(wrapper), options.pushToast)
  })

  deleteButton.addEventListener('click', (event) => {
    stopControlEvent(event)
    const position = findCodeBlockPositionForElement(view, wrapper)
    if (position === null || !deleteCodeBlockAtPosition(view, position, TextSelection)) {
      options.pushToast?.('could not delete code block.', 'warning')
    }
  })

  controls.append(copyButton, deleteButton)
  return controls
}

function syncCodeBlockControls(
  view: CodeBlockControlsView,
  options: CodeBlockControlsOptions,
  TextSelection: TextSelectionConstructor,
) {
  const root = view.dom
  if (!root) return
  const blocks = root.querySelectorAll(CODE_BLOCK_WRAPPER_SELECTOR)
  blocks.forEach((block) => {
    if (block.closest(`.${NOTE_PREVIEW_EDITOR_HOST_CLASS}`)) return
    block.classList.add('tabs-code-block-has-controls')
    if (block.querySelector(`[${CODE_BLOCK_CONTROLS_ATTR}]`)) return
    block.appendChild(createControlsElement(view, block, options, TextSelection))
  })
}

export function createCodeBlockControlsPlugin(options: CodeBlockControlsOptions = {}) {
  return (context: {
    pmState: {
      Plugin: ProseMirrorPluginConstructor
      TextSelection: TextSelectionConstructor
    }
  }) => {
    const { Plugin, TextSelection } = context.pmState
    return {
      wysiwygPlugins: [
        () =>
          new Plugin({
            props: {
              handleDOMEvents: {
                pointerdown: (_view, event) => {
                  if (!(event.target instanceof Element)) return false
                  if (!event.target.closest(`[${CODE_BLOCK_CONTROLS_ATTR}]`)) return false
                  stopControlEvent(event)
                  return true
                },
                mousedown: (_view, event) => {
                  if (!(event.target instanceof Element)) return false
                  if (!event.target.closest(`[${CODE_BLOCK_CONTROLS_ATTR}]`)) return false
                  stopControlEvent(event)
                  return true
                },
                click: (_view, event) => {
                  if (!(event.target instanceof Element)) return false
                  if (!event.target.closest(`[${CODE_BLOCK_CONTROLS_ATTR}]`)) return false
                  stopControlEvent(event)
                  return true
                },
              },
            },
            view: (view) => {
              window.setTimeout(() => syncCodeBlockControls(view, options, TextSelection), 0)
              return {
                update: (nextView) => {
                  syncCodeBlockControls(nextView, options, TextSelection)
                },
                destroy: () => {
                  view.dom?.querySelectorAll(`[${CODE_BLOCK_CONTROLS_ATTR}]`).forEach((node) => node.remove())
                },
              }
            },
          }),
      ],
    }
  }
}
