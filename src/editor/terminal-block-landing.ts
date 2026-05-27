import { NOTE_PREVIEW_REFERENCE_RE, parseWikiReferenceToken } from '../notes/note-references'

export const TERMINAL_BLOCK_LANDING_ZONE_ATTR = 'data-tabs-terminal-block-landing-zone'
export const TERMINAL_BLOCK_LANDING_ZONE_CLASS = 'tabs-terminal-block-landing-zone'

type TerminalBlockLandingKind = 'codeBlock' | 'notePreview'

export type TerminalBlockLandingTarget = {
  kind: TerminalBlockLandingKind
  position: number
}

function getDocEnd(doc: any): number {
  if (typeof doc?.content?.size === 'number') return doc.content.size
  let size = 0
  for (let index = 0; index < (doc?.childCount ?? 0); index += 1) {
    size += doc.child(index)?.nodeSize ?? 0
  }
  return size
}

export function isNotePreviewOnlyParagraphText(text: string): boolean {
  const normalized = String(text ?? '').replace(/\u200b/g, '').trim()
  if (!normalized) return false

  let hasValidToken = false
  const remaining = normalized.replace(NOTE_PREVIEW_REFERENCE_RE, (token) => {
    if (!parseWikiReferenceToken(token)?.embed) return token
    hasValidToken = true
    return ''
  })
  NOTE_PREVIEW_REFERENCE_RE.lastIndex = 0
  return hasValidToken && remaining.trim().length === 0
}

export function getTerminalBlockLandingTarget(doc: any): TerminalBlockLandingTarget | null {
  const childCount = Number(doc?.childCount ?? 0)
  if (childCount <= 0 || typeof doc?.child !== 'function') return null

  const lastNode = doc.child(childCount - 1)
  if (lastNode?.type?.name === 'codeBlock') {
    return { kind: 'codeBlock', position: getDocEnd(doc) }
  }

  if (lastNode?.type?.name === 'paragraph' && isNotePreviewOnlyParagraphText(lastNode.textContent ?? '')) {
    return { kind: 'notePreview', position: getDocEnd(doc) }
  }

  return null
}

export function isInsideTerminalBlockLandingZone(target: Element | null): boolean {
  return Boolean(target?.closest(`[${TERMINAL_BLOCK_LANDING_ZONE_ATTR}]`))
}

function normalizeInsertedTextLines(text: string): string[] {
  if (text.length === 0) return ['']
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
}

function createTerminalLandingParagraphNodes(schema: any, text: string) {
  const paragraphType = schema.nodes.paragraph
  return normalizeInsertedTextLines(text).map((line) =>
    paragraphType.create(null, line.length > 0 ? schema.text(line) : undefined),
  )
}

export function insertTerminalLandingParagraphs(
  view: any,
  TextSelection: { create: (doc: unknown, anchor: number, head?: number) => unknown },
  text = '',
): boolean {
  const { state } = view
  const target = getTerminalBlockLandingTarget(state.doc)
  const insertPos = target?.position ?? getDocEnd(state.doc)
  const paragraphNodes = createTerminalLandingParagraphNodes(state.schema, text)
  if (paragraphNodes.length === 0) return false

  let lastParagraphStart = insertPos
  for (let index = 0; index < paragraphNodes.length - 1; index += 1) {
    lastParagraphStart += paragraphNodes[index].nodeSize
  }
  const lastParagraph = paragraphNodes[paragraphNodes.length - 1]
  const selectionPos = lastParagraphStart + 1 + (lastParagraph.content?.size ?? 0)

  let tr = state.tr.insert(insertPos, paragraphNodes)
  tr = tr.setSelection(TextSelection.create(tr.doc, selectionPos, selectionPos)).scrollIntoView()
  view.dispatch(tr)
  view.focus?.()
  return true
}

function shouldHandlePrintableKey(event: KeyboardEvent): boolean {
  return event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey
}

function createLandingZoneElement(
  view: any,
  TextSelection: { create: (doc: unknown, anchor: number, head?: number) => unknown },
) {
  const element = document.createElement('span')
  element.className = TERMINAL_BLOCK_LANDING_ZONE_CLASS
  element.tabIndex = 0
  element.setAttribute(TERMINAL_BLOCK_LANDING_ZONE_ATTR, 'true')
  element.setAttribute('contenteditable', 'false')
  element.setAttribute('role', 'textbox')
  element.setAttribute('aria-label', 'Add text after this block')

  const stop = (event: Event) => {
    event.stopPropagation()
  }

  element.addEventListener('pointerdown', stop)
  element.addEventListener('mousedown', stop)
  element.addEventListener('click', (event) => {
    event.stopPropagation()
    element.focus()
  })
  element.addEventListener('focus', () => {
    element.classList.add('is-active')
  })
  element.addEventListener('blur', () => {
    element.classList.remove('is-active')
  })
  element.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      element.blur()
      return
    }

    if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault()
      event.stopPropagation()
      insertTerminalLandingParagraphs(view, TextSelection)
      return
    }

    if (!shouldHandlePrintableKey(event)) return
    event.preventDefault()
    event.stopPropagation()
    insertTerminalLandingParagraphs(view, TextSelection, event.key)
  })
  element.addEventListener('beforeinput', (event) => {
    const inputEvent = event as InputEvent
    if (inputEvent.isComposing) return
    if (inputEvent.inputType !== 'insertText' && inputEvent.inputType !== 'insertCompositionText') return
    const text = inputEvent.data ?? ''
    if (!text) return
    inputEvent.preventDefault()
    inputEvent.stopPropagation()
    insertTerminalLandingParagraphs(view, TextSelection, text)
  })
  element.addEventListener('paste', (event) => {
    const pasteEvent = event as ClipboardEvent
    const text = pasteEvent.clipboardData?.getData('text/plain') ?? ''
    if (text.length === 0) return
    pasteEvent.preventDefault()
    pasteEvent.stopPropagation()
    insertTerminalLandingParagraphs(view, TextSelection, text)
  })

  return element
}

export function terminalBlockLandingPlugin(context: {
  pmState: {
    Plugin: new (spec: {
      props?: {
        decorations?: (state: { doc: any }) => unknown
      }
    }) => unknown
    TextSelection: { create: (doc: unknown, anchor: number, head?: number) => unknown }
  }
  pmView: {
    Decoration: {
      widget: (
        pos: number,
        toDOM: (view: unknown) => HTMLElement,
        spec?: Record<string, unknown>,
      ) => unknown
    }
    DecorationSet: {
      create: (doc: unknown, decorations: unknown[]) => unknown
    }
  }
}) {
  const { Plugin, TextSelection } = context.pmState
  const { Decoration, DecorationSet } = context.pmView

  return {
    wysiwygPlugins: [
      () =>
        new Plugin({
          props: {
            decorations: (state: { doc: any }) => {
              const target = getTerminalBlockLandingTarget(state.doc)
              if (!target) return DecorationSet.create(state.doc, [])
              return DecorationSet.create(state.doc, [
                Decoration.widget(
                  target.position,
                  (view) => createLandingZoneElement(view, TextSelection),
                  {
                    key: `terminal-block-landing-${target.kind}-${target.position}`,
                    side: 1,
                    ignoreSelection: true,
                    stopEvent: (event: Event) =>
                      event.type === 'keydown' ||
                      event.type === 'beforeinput' ||
                      event.type === 'paste' ||
                      event.type === 'click' ||
                      event.type === 'mousedown' ||
                      event.type === 'pointerdown',
                  },
                ),
              ])
            },
          },
        }),
    ],
  }
}
