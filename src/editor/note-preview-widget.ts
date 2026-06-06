import { Editor } from '@toast-ui/editor'
import { TextSelection } from 'prosemirror-state'
import {
  annotationLinePlugin,
  blockIndentPlugin,
  headingSpaceShortcutPlugin,
  highlightPlugin,
  listMarkerPlugin,
  tagAppearancePlugin,
  thematicBreakShortcutPlugin,
} from './editor-setup'
import { createMediaLinkPlugin } from './media-link-plugin'
import { NOTE_PREVIEW_EDITOR_HOST_CLASS } from './note-preview-dom'
import { collectProseMirrorTextPositions, getWysiwygView, restoreEditorCursorSelection } from './prosemirror-utils'
import {
  prepareMarkdownForEditorDisplay,
  restoreEditorBlankParagraphs,
  setEditorMarkdownForDisplay,
} from './editor-markdown-display'
import { getHeadingOutlineFromDoc } from './heading-outline'
import {
  getMarkdownLinkLabel,
  INTERNAL_NOTE_LINK_MARKDOWN_RE,
  NOTE_PREVIEW_REFERENCE_RE,
  type NotePreviewReferencePayload,
  type ResolvedWikiNoteReference,
} from '../notes/note-references'
import { MEDIA_PLAYER_SELECTOR } from '../media/media-utils'
import type { NotePreviewData } from '../notes/note-preview-data'
import type { NoteNavigationTarget, ResolvedNoteAisle } from '../types/app'
import { createAppIconElement } from '../icons/app-icons'

type NotePreviewSize = 'minimized' | 'small' | 'large'

const NOTE_PREVIEW_LINE_HEIGHT_REM = 1.5
const NOTE_PREVIEW_SMALL_HEIGHT_CAP_REM = 20 + NOTE_PREVIEW_LINE_HEIGHT_REM
const NOTE_PREVIEW_LARGE_HEIGHT_CAP_REM = 30 + NOTE_PREVIEW_LINE_HEIGHT_REM * 2
const NOTE_PREVIEW_MIN_HEIGHT_REM = NOTE_PREVIEW_LINE_HEIGHT_REM * 3
const NOTE_PREVIEW_FIT_BOTTOM_BUFFER_PX = 6
const NOTE_PREVIEW_REFRESH_INTERVAL_MS = 1000
const NOTE_PREVIEW_MEASURE_RETRY_DELAYS_MS = [40, 120, 260]
const DEFAULT_ROOT_FONT_SIZE_PX = 16

export type NotePreviewWidgetOptions = {
  sourceNoteBodyId: string
  getNotePreviewData: (payload: NotePreviewReferencePayload, sourceNoteBodyId: string) => NotePreviewData
  resolvePreviewToken?: (token: string) => NotePreviewReferencePayload | null
  resolveInternalNoteReferenceToken?: (token: string) => ResolvedWikiNoteReference | null
  navigateToNoteLocation: (target: NoteNavigationTarget) => void
  deleteNotePreview: (tokenId: string) => void
}

type PreviewHeightFitController = {
  scheduleMeasure: () => void
  scheduleDelayedMeasure: () => void
  cleanup: () => void
}

type PreviewContentMeasurement = {
  contentRoot: HTMLElement | null
  heightPx: number
  hasRenderedContent: boolean
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

function schedulePreviewCursorScroll(
  editor: Editor,
  selection: NonNullable<NotePreviewData['previewCursorSelection']>,
  attempts = 4,
) {
  if (attempts <= 0) return
  window.requestAnimationFrame(() => {
    if (restoreEditorCursorSelection(editor, selection, { focus: false })) return
    schedulePreviewCursorScroll(editor, selection, attempts - 1)
  })
}

function getPreviewStatusText(data: NotePreviewData) {
  if (data.status === 'missing') return 'note preview target is missing.'
  if (data.status === 'blocked') return 'Note preview blocked to prevent recursive rendering.'
  if (data.status === 'empty') return 'note preview is empty.'
  return ''
}

function getPreviewTitleButtonClassName(kind: NotePreviewData['titleButtons'][number]['kind']): string {
  if (kind === 'domain') return 'rail-control context-preview-title-btn compact-scope-btn compact-domain-btn is-domain'
  if (kind === 'space') return 'rail-control context-preview-title-btn compact-scope-btn compact-space-btn is-space'
  if (kind === 'parent') return 'rail-control context-preview-title-btn btn btn-sm tab-btn parent-tab-btn is-parent'
  return 'rail-control context-preview-title-btn btn btn-sm tab-btn subtab-btn is-subtab'
}

function getPreviewNavigationTarget(payload: NotePreviewReferencePayload): NoteNavigationTarget {
  return {
    ...payload.target,
    heading: payload.heading,
    aisleId: payload.heading ? undefined : payload.aisleIds?.[0],
  }
}

function stopPreviewNavigationEvent(event: Event) {
  event.preventDefault()
  event.stopPropagation()
}

function blockReadonlyPreviewEditEvent(event: Event) {
  const target = event.target instanceof Element
    ? event.target
    : event.target instanceof Text
      ? event.target.parentElement
      : null
  if (target?.closest(MEDIA_PLAYER_SELECTOR)) {
    return
  }
  event.stopPropagation()
  event.preventDefault()
}

function stopReadonlyPreviewPointerEvent(event: Event) {
  event.stopPropagation()
}

function renderReadonlyPreviewTitleContent(wrapper: HTMLElement, data: NotePreviewData) {
  wrapper.replaceChildren()
  if (data.titleButtons.length === 0) {
    const fallback = document.createElement('span')
    fallback.className = 'context-preview-title-missing'
    fallback.textContent = data.locationLabel
    wrapper.append(fallback)
    return
  }

  data.titleButtons.forEach((button) => {
    const chip = document.createElement('span')
    chip.className = getPreviewTitleButtonClassName(button.kind)
    chip.textContent = button.label
    wrapper.append(chip)
  })
}

function getPreviewHeightCapRem(previewSize: NotePreviewSize): number {
  return previewSize === 'large' ? NOTE_PREVIEW_LARGE_HEIGHT_CAP_REM : NOTE_PREVIEW_SMALL_HEIGHT_CAP_REM
}

export function getNotePreviewFittedHeightRem(
  contentHeightPx: number,
  rootFontSizePx: number,
  maxHeightRem: number,
  minHeightRem = NOTE_PREVIEW_MIN_HEIGHT_REM,
  bottomBufferPx = NOTE_PREVIEW_FIT_BOTTOM_BUFFER_PX,
): number {
  if (!Number.isFinite(contentHeightPx) || contentHeightPx <= 0) return maxHeightRem
  const rootFontSize = Number.isFinite(rootFontSizePx) && rootFontSizePx > 0 ? rootFontSizePx : DEFAULT_ROOT_FONT_SIZE_PX
  const measuredHeightPx = contentHeightPx + Math.max(0, bottomBufferPx)
  const contentHeightRem = measuredHeightPx / rootFontSize
  const clampedHeight = Math.min(maxHeightRem, Math.max(minHeightRem, contentHeightRem))
  return Math.round(clampedHeight * 100) / 100
}

function parsePixelValue(value: string | undefined): number {
  const parsed = Number.parseFloat(value ?? '')
  return Number.isFinite(parsed) ? parsed : 0
}

function getRootFontSizePx(element: HTMLElement): number {
  const ownerWindow = element.ownerDocument?.defaultView ?? window
  const fontSize = ownerWindow.getComputedStyle?.(element.ownerDocument?.documentElement ?? document.documentElement).fontSize
  const parsed = Number.parseFloat(fontSize ?? '')
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ROOT_FONT_SIZE_PX
}

function stripPreviewInvisibleText(value: string): string {
  return value
    .replaceAll('\u200b', '')
    .replaceAll('\u200c', '')
    .replaceAll('\u200d', '')
    .replaceAll('\ufeff', '')
    .replace(/\s/g, '')
}

function isPreviewMarkdownMeaningful(markdown: string): boolean {
  return stripPreviewInvisibleText(markdown).length > 0
}

function isHTMLElementLike(value: unknown): value is HTMLElement {
  return Boolean(
    value &&
      typeof (value as HTMLElement).getBoundingClientRect === 'function' &&
      typeof (value as HTMLElement).querySelectorAll === 'function',
  )
}

function getPreviewContentRoot(editorHost: HTMLElement, editor: Editor | null): HTMLElement | null {
  const wysiwygRoot = getWysiwygView(editor)?.dom
  if (isHTMLElementLike(wysiwygRoot)) return wysiwygRoot
  return editorHost.querySelector<HTMLElement>('.ProseMirror') ?? editorHost.querySelector<HTMLElement>('.toastui-editor-contents')
}

function previewContentRootHasRenderedContent(contentRoot: HTMLElement): boolean {
  if (stripPreviewInvisibleText(contentRoot.textContent ?? '')) return true
  return Boolean(contentRoot.querySelector('img, table, hr, pre, blockquote, ul, ol, li, h1, h2, h3, h4, h5, h6'))
}

function measurePreviewContentHeight(editorHost: HTMLElement, contentRoot: HTMLElement): number {
  const children = Array.from(contentRoot.children).filter(
    (child): child is HTMLElement => typeof (child as HTMLElement).getBoundingClientRect === 'function',
  )
  if (children.length === 0) {
    return contentRoot.scrollHeight || contentRoot.getBoundingClientRect().height || 0
  }

  const ownerWindow = editorHost.ownerDocument?.defaultView ?? window
  const rootTop = contentRoot.getBoundingClientRect().top
  const firstChild = children[0]
  const lastChild = children[children.length - 1]
  const firstStyle = ownerWindow.getComputedStyle?.(firstChild)
  const lastStyle = ownerWindow.getComputedStyle?.(lastChild)
  const rootStyle = ownerWindow.getComputedStyle?.(contentRoot)
  const contentTop =
    firstChild.getBoundingClientRect().top - parsePixelValue(firstStyle?.marginTop) - parsePixelValue(rootStyle?.paddingTop)
  const contentBottom =
    lastChild.getBoundingClientRect().bottom + parsePixelValue(lastStyle?.marginBottom) + parsePixelValue(rootStyle?.paddingBottom)
  const boundsHeight = Math.max(0, contentBottom - Math.min(rootTop, contentTop))
  const naturalScrollHeight =
    contentRoot.scrollHeight + parsePixelValue(firstStyle?.marginTop) + parsePixelValue(lastStyle?.marginBottom)
  return Math.max(naturalScrollHeight, boundsHeight)
}

function setPreviewMeasurementStyles(element: HTMLElement, widthPx: number) {
  element.style.setProperty('position', 'absolute', 'important')
  element.style.setProperty('left', '-10000px', 'important')
  element.style.setProperty('top', '0', 'important')
  element.style.setProperty('visibility', 'hidden', 'important')
  element.style.setProperty('pointer-events', 'none', 'important')
  element.style.setProperty('z-index', '-1', 'important')
  element.style.setProperty('overflow', 'visible', 'important')
  element.style.setProperty('height', 'auto', 'important')
  element.style.setProperty('min-height', '0', 'important')
  element.style.setProperty('max-height', 'none', 'important')
  if (widthPx > 0) element.style.setProperty('width', `${widthPx}px`, 'important')
}

function setPreviewMeasurementRootStyles(element: HTMLElement, sourceRoot: HTMLElement) {
  const ownerWindow = sourceRoot.ownerDocument?.defaultView ?? window
  const computedStyle = ownerWindow.getComputedStyle?.(sourceRoot)
  element.style.setProperty('box-sizing', 'border-box', 'important')
  element.style.setProperty('height', 'auto', 'important')
  element.style.setProperty('min-height', '0', 'important')
  element.style.setProperty('max-height', 'none', 'important')
  element.style.setProperty('overflow', 'visible', 'important')
  element.style.setProperty('overflow-x', 'visible', 'important')
  element.style.setProperty('overflow-y', 'visible', 'important')
  element.style.setProperty('padding-inline', '0', 'important')
  element.style.setProperty('padding-top', '0', 'important')
  element.style.setProperty('position', 'static', 'important')
  element.style.setProperty('width', '100%', 'important')
  if (computedStyle?.fontSize) element.style.setProperty('font-size', computedStyle.fontSize, 'important')
}

function trimPreviewMeasurementBlockMargins(element: HTMLElement) {
  const children = Array.from(element.children).filter(isHTMLElementLike)
  const firstChild = children[0]
  const lastChild = children[children.length - 1]
  firstChild?.style.setProperty('margin-top', '0', 'important')
  lastChild?.style.setProperty('margin-bottom', '0', 'important')
}

function getPreviewContentWidth(editorHost: HTMLElement, contentRoot: HTMLElement): number {
  const rootRect = contentRoot.getBoundingClientRect()
  const hostRect = editorHost.getBoundingClientRect()
  return rootRect.width || contentRoot.clientWidth || hostRect.width || editorHost.clientWidth || 0
}

function measureDetachedPreviewContentHeight(editorHost: HTMLElement, contentRoot: HTMLElement): number {
  const ownerDocument = editorHost.ownerDocument ?? document
  const inheritedParent =
    typeof editorHost.closest === 'function' ? (editorHost.closest('.app-shell') as HTMLElement | null) : null
  const measureParent = inheritedParent ?? ownerDocument.body ?? editorHost
  const widthPx = getPreviewContentWidth(editorHost, contentRoot)
  const wrapper = ownerDocument.createElement('div')
  const measurementRoot = contentRoot.cloneNode(true) as HTMLElement
  wrapper.className = 'toastui-editor context-preview-measurement-host'
  wrapper.setAttribute('aria-hidden', 'true')
  setPreviewMeasurementStyles(wrapper, widthPx)
  setPreviewMeasurementRootStyles(measurementRoot, contentRoot)
  trimPreviewMeasurementBlockMargins(measurementRoot)
  wrapper.append(measurementRoot)
  measureParent.append(wrapper)
  try {
    return measurePreviewContentHeight(editorHost, measurementRoot)
  } finally {
    wrapper.remove()
  }
}

function getPreviewContentMeasurement(editorHost: HTMLElement, editor: Editor | null): PreviewContentMeasurement {
  const contentRoot = getPreviewContentRoot(editorHost, editor)
  if (!contentRoot) {
    return { contentRoot: null, heightPx: 0, hasRenderedContent: false }
  }

  const heightPx = measureDetachedPreviewContentHeight(editorHost, contentRoot)
  return {
    contentRoot,
    heightPx,
    hasRenderedContent: previewContentRootHasRenderedContent(contentRoot) && heightPx > 0,
  }
}

function getPreviewHeightPx(heightRem: number, rootFontSizePx: number): number {
  const rootFontSize = Number.isFinite(rootFontSizePx) && rootFontSizePx > 0 ? rootFontSizePx : DEFAULT_ROOT_FONT_SIZE_PX
  return Math.round(heightRem * rootFontSize * 100) / 100
}

function applyPreviewEditorHeight(
  editorHost: HTMLElement,
  heightRem: number,
  editor: Editor | null = null,
  rootFontSizePx = getRootFontSizePx(editorHost),
) {
  const heightValue = `${heightRem}rem`
  editorHost.style.setProperty('--note-preview-editor-height', heightValue)
  ;(editor as (Editor & { setHeight?: (height: string) => void }) | null)?.setHeight?.(
    `${getPreviewHeightPx(heightRem, rootFontSizePx)}px`,
  )
}

function fitPreviewEditorHeight(
  editorHost: HTMLElement,
  maxHeightRem: number,
  getSourceMarkdown: () => string,
  editor: Editor,
): PreviewHeightFitController {
  applyPreviewEditorHeight(editorHost, maxHeightRem, editor)

  let frame = 0
  let observedContentRoot: HTMLElement | null | undefined
  let observedImages: HTMLElement[] = []
  let retryTimeouts: number[] = []
  const ownerWindow = editorHost.ownerDocument?.defaultView ?? window
  const resizeObserver =
    typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => scheduleDelayedMeasure())
  const mutationObserver =
    typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver(() => {
          scheduleDelayedMeasure()
        })

  const clearRetryTimeouts = () => {
    retryTimeouts.forEach((timeoutId) => ownerWindow.clearTimeout?.(timeoutId))
    retryTimeouts = []
  }
  const scheduleRetryMeasurements = () => {
    clearRetryTimeouts()
    retryTimeouts = NOTE_PREVIEW_MEASURE_RETRY_DELAYS_MS.map(
      (delay) => ownerWindow.setTimeout?.(() => scheduleMeasure(), delay) ?? 0,
    ).filter(Boolean)
  }
  const syncResizeObserver = (contentRoot: HTMLElement | null) => {
    if (!resizeObserver || contentRoot === observedContentRoot) return
    resizeObserver.disconnect()
    observedContentRoot = contentRoot
    resizeObserver.observe(editorHost)
    if (contentRoot) resizeObserver.observe(contentRoot)
  }
  const syncImageListeners = () => {
    const nextImages = Array.from(editorHost.querySelectorAll<HTMLElement>('img'))
    observedImages
      .filter((image) => !nextImages.includes(image))
      .forEach((image) => image.removeEventListener('load', scheduleDelayedMeasure))
    nextImages
      .filter((image) => !observedImages.includes(image))
      .forEach((image) => image.addEventListener('load', scheduleDelayedMeasure))
    observedImages = nextImages
  }
  const measure = () => {
    frame = 0
    const measurement = getPreviewContentMeasurement(editorHost, editor)
    const rootFontSizePx = getRootFontSizePx(editorHost)
    const sourceMarkdown = getSourceMarkdown()
    syncResizeObserver(measurement.contentRoot)
    syncImageListeners()
    if (
      isPreviewMarkdownMeaningful(sourceMarkdown) &&
      (!measurement.contentRoot || !measurement.hasRenderedContent || measurement.heightPx <= 0)
    ) {
      applyPreviewEditorHeight(editorHost, maxHeightRem, editor, rootFontSizePx)
      scheduleRetryMeasurements()
      return
    }
    const fittedHeightRem = getNotePreviewFittedHeightRem(
      measurement.heightPx,
      rootFontSizePx,
      maxHeightRem,
    )
    clearRetryTimeouts()
    applyPreviewEditorHeight(editorHost, fittedHeightRem, editor, rootFontSizePx)
  }

  function scheduleMeasure() {
    if (frame) ownerWindow.cancelAnimationFrame?.(frame)
    frame = ownerWindow.requestAnimationFrame?.(measure) ?? 0
    if (!frame) measure()
  }
  function scheduleDelayedMeasure() {
    scheduleRetryMeasurements()
    scheduleMeasure()
  }

  mutationObserver?.observe(editorHost, { childList: true, subtree: true })
  scheduleDelayedMeasure()

  return {
    scheduleMeasure,
    scheduleDelayedMeasure,
    cleanup: () => {
      if (frame) ownerWindow.cancelAnimationFrame?.(frame)
      clearRetryTimeouts()
      resizeObserver?.disconnect()
      mutationObserver?.disconnect()
      observedImages.forEach((image) => image.removeEventListener('load', scheduleDelayedMeasure))
      observedImages = []
    },
  }
}

export function createReadonlyNotePreviewWidgetElement(
  payload: NotePreviewReferencePayload,
  options: NotePreviewWidgetOptions,
) {
  const data = options.getNotePreviewData(payload, options.sourceNoteBodyId)
  const wrapper = document.createElement('span')
  wrapper.className = 'context-preview-navigation-widget'
  wrapper.setAttribute('contenteditable', 'false')
  wrapper.title = data.locationLabel
  if (data.status !== 'ready' && data.status !== 'empty') wrapper.setAttribute('aria-disabled', 'true')
  wrapper.classList.toggle('is-blocked', data.status === 'blocked')
  wrapper.classList.toggle('is-missing', data.status === 'missing')
  const title = document.createElement('span')
  title.className = 'context-preview-navigation-title'
  title.setAttribute('role', 'button')
  title.setAttribute('tabindex', '0')
  title.setAttribute('aria-label', `Open note preview target: ${data.locationLabel}`)
  renderReadonlyPreviewTitleContent(title, data)
  wrapper.append(title)

  let cleanupContent = () => {}

  const activate = (event: Event) => {
    stopPreviewNavigationEvent(event)
    if (data.status !== 'ready' && data.status !== 'empty') return
    options.navigateToNoteLocation(getPreviewNavigationTarget(payload))
  }

  title.addEventListener('pointerdown', stopPreviewNavigationEvent)
  title.addEventListener('mousedown', stopPreviewNavigationEvent)
  title.addEventListener('click', activate)
  title.addEventListener('keydown', (event) => {
    const keyboardEvent = event as KeyboardEvent
    if (keyboardEvent.key !== 'Enter' && keyboardEvent.key !== ' ') return
    activate(keyboardEvent)
  })

  if (data.status === 'ready' && data.selectedAisle) {
    const editorHost = document.createElement('span')
    editorHost.className = `${NOTE_PREVIEW_EDITOR_HOST_CLASS} context-preview-nested-editor-host is-readonly`
    const heightRem = NOTE_PREVIEW_SMALL_HEIGHT_CAP_REM
    const rootFontSizePx = getRootFontSizePx(editorHost)
    editorHost.style.setProperty('--note-preview-editor-height', `${heightRem}rem`)
    ;['pointerdown', 'mousedown', 'click'].forEach((eventName) => {
      editorHost.addEventListener(eventName, stopReadonlyPreviewPointerEvent)
    })
    ;['keydown', 'beforeinput', 'paste', 'drop'].forEach((eventName) => {
      editorHost.addEventListener(eventName, blockReadonlyPreviewEditEvent, true)
    })

    const editor = new Editor({
      el: editorHost,
      initialValue: prepareMarkdownForEditorDisplay(data.selectedAisle.markdown),
      initialEditType: 'wysiwyg',
      previewStyle: 'tab',
      hideModeSwitch: true,
      toolbarItems: [],
      height: `${getPreviewHeightPx(heightRem, rootFontSizePx)}px`,
      minHeight: '0px',
      autofocus: false,
      usageStatistics: false,
      plugins: [
        listMarkerPlugin,
        blockIndentPlugin,
        annotationLinePlugin,
        tagAppearancePlugin,
        highlightPlugin,
        createMediaLinkPlugin,
        headingSpaceShortcutPlugin,
        thematicBreakShortcutPlugin,
      ],
    })
    restoreEditorBlankParagraphs(editor, data.selectedAisle.markdown)
    const smartHeight = fitPreviewEditorHeight(editorHost, heightRem, () => data.selectedAisle?.markdown ?? '', editor)
    const view = getWysiwygView(editor)
    if (view?.setProps) {
      view.setProps({ editable: () => false })
      view.dom?.setAttribute?.('contenteditable', 'false')
    }
    cleanupContent = () => {
      smartHeight.cleanup()
      ;['pointerdown', 'mousedown', 'click'].forEach((eventName) => {
        editorHost.removeEventListener(eventName, stopReadonlyPreviewPointerEvent)
      })
      ;['keydown', 'beforeinput', 'paste', 'drop'].forEach((eventName) => {
        editorHost.removeEventListener(eventName, blockReadonlyPreviewEditEvent, true)
      })
      try {
        editor.destroy()
      } catch {
        // Toast UI can throw if an embedded editor is destroyed during ProseMirror widget cleanup.
      }
    }
    wrapper.append(editorHost)
  } else if (data.status !== 'ready') {
    const status = document.createElement('span')
    status.className = 'context-preview-navigation-status'
    status.textContent = getPreviewStatusText(data)
    if (status.textContent) wrapper.append(status)
  }

  ;(wrapper as HTMLElement & { destroyReadonlyPreview?: () => void }).destroyReadonlyPreview = cleanupContent
  return wrapper
}

function createReadonlyPreviewReferencePlugin(context: any, options: NotePreviewWidgetOptions) {
  const resolvePreviewToken = options.resolvePreviewToken
  const resolveInternalNoteReferenceToken = options.resolveInternalNoteReferenceToken
  if (!resolvePreviewToken || !resolveInternalNoteReferenceToken) return null

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
                for (const match of node.text.matchAll(NOTE_PREVIEW_REFERENCE_RE)) {
                  const payload = resolvePreviewToken(match[0])
                  if (!payload) continue
                  const from = pos + (match.index ?? 0)
                  const to = from + match[0].length
                  decorations.push(
                    Decoration.widget(from, () => createReadonlyNotePreviewWidgetElement(payload, options), {
                      key: `readonly-note-preview-${from}-${to}-${match[0]}`,
                      side: -1,
                      destroy: (node: HTMLElement & { destroyReadonlyPreview?: () => void }) => node.destroyReadonlyPreview?.(),
                    }),
                  )
                  decorations.push(Decoration.inline(from, to, { class: 'note-context-token-hidden' }))
                }
              })

              let internalLinkOccurrence = 0
              for (const match of docText.text.matchAll(INTERNAL_NOTE_LINK_MARKDOWN_RE)) {
                if (match[0].startsWith('!')) continue
                const occurrence = internalLinkOccurrence
                internalLinkOccurrence += 1
                const reference = resolveInternalNoteReferenceToken(match[0])
                if (!reference) continue

                const startIndex = match.index ?? 0
                const endIndex = startIndex + match[0].length - 1
                const from = docText.positions[startIndex]
                const last = docText.positions[endIndex]
                const rangePositions = docText.positions.slice(startIndex, endIndex + 1)
                if (
                  from === undefined ||
                  last === undefined ||
                  from < 0 ||
                  last < from ||
                  rangePositions.some((position) => position < 0)
                ) {
                  continue
                }

                decorations.push(
                  Decoration.widget(
                    from,
                    () =>
                      createInternalNoteLinkWidgetElement(
                        reference.label,
                        reference.target,
                        match[0],
                        options.navigateToNoteLocation,
                        { from, to: last + 1, occurrence },
                      ),
                    {
                      key: `readonly-internal-note-link-${from}-${last}-${match[0]}`,
                      side: -1,
                    },
                  ),
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

export function createNotePreviewWidgetElement(
  payload: NotePreviewReferencePayload,
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
  const sizeControl = document.createElement('span')
  sizeControl.className = 'context-bar-size-control'
  sizeControl.setAttribute('role', 'group')
  sizeControl.setAttribute('aria-label', 'Resize note preview')
  const shrinkButton = document.createElement('button')
  shrinkButton.type = 'button'
  shrinkButton.className = 'context-bar-icon-btn context-bar-size-btn context-bar-size-up-btn'
  shrinkButton.append(createAppIconElement('minimize', { className: 'context-bar-size-icon' }))
  const growButton = document.createElement('button')
  growButton.type = 'button'
  growButton.className = 'context-bar-icon-btn context-bar-size-btn context-bar-size-down-btn'
  growButton.append(createAppIconElement('maximize', { className: 'context-bar-size-icon' }))
  const deleteButton = document.createElement('button')
  deleteButton.type = 'button'
  deleteButton.className = 'context-bar-icon-btn context-bar-delete-btn'
  const deleteIcon = document.createElement('span')
  deleteIcon.className = 'aisle-edit-delete-icon context-bar-delete-icon'
  deleteButton.append(deleteIcon)
  const lowerBar = document.createElement('span')
  lowerBar.className = 'context-bar-lower'

  let previewSize: NotePreviewSize = 'small'
  let contextEditorCleanups: Array<() => void> = []
  let titleOverflowMeasureQueued = false
  let titleOverflowMeasureFrame = 0

  const measureTitleOverflow = () => {
    titleGroup.classList.toggle(
      'is-overflowing',
      titleGroup.clientWidth > 0 && titleGroup.scrollWidth > titleGroup.clientWidth + 1,
    )
  }

  const scheduleTitleOverflowMeasure = () => {
    if (titleOverflowMeasureQueued) return
    titleOverflowMeasureQueued = true
    const ownerWindow = titleGroup.ownerDocument?.defaultView ?? window
    if (ownerWindow.requestAnimationFrame) {
      const frameId = ownerWindow.requestAnimationFrame(() => {
        titleOverflowMeasureQueued = false
        titleOverflowMeasureFrame = 0
        measureTitleOverflow()
      })
      titleOverflowMeasureFrame = titleOverflowMeasureQueued ? frameId : 0
      return
    }
    titleOverflowMeasureQueued = false
    measureTitleOverflow()
  }

  const titleOverflowObserver =
    typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => scheduleTitleOverflowMeasure())
  titleOverflowObserver?.observe(titleGroup)

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
    const data = options.getNotePreviewData(payload, options.sourceNoteBodyId)
    if (data.status === 'ready' || data.status === 'empty') options.navigateToNoteLocation({ ...payload.target, heading: payload.heading })
  }

  const renderTitleButtons = (data: NotePreviewData) => {
    titleGroup.replaceChildren()
    titleGroup.title = data.locationLabel
    if (data.titleButtons.length === 0) {
      const fallback = document.createElement('span')
      fallback.className = 'context-preview-title-missing'
      fallback.textContent = data.locationLabel
      titleGroup.append(fallback)
      scheduleTitleOverflowMeasure()
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
    scheduleTitleOverflowMeasure()
  }

  const renderPreviewEditor = (data: NotePreviewData) => {
    const aisle = data.selectedAisle as ResolvedNoteAisle
    const shell = document.createElement('span')
    shell.className = 'context-bar-editor'
    const editorHost = document.createElement('span')
    editorHost.className = `${NOTE_PREVIEW_EDITOR_HOST_CLASS} is-readonly`
    const heightRem = getPreviewHeightCapRem(previewSize)
    const rootFontSizePx = getRootFontSizePx(editorHost)
    editorHost.style.setProperty('--note-preview-editor-height', `${heightRem}rem`)

    ;['pointerdown', 'mousedown', 'click'].forEach((eventName) => {
      editorHost.addEventListener(eventName, stopReadonlyPreviewPointerEvent)
    })
    ;['keydown', 'beforeinput', 'paste', 'drop'].forEach((eventName) => {
      editorHost.addEventListener(eventName, blockReadonlyPreviewEditEvent, true)
    })

    let currentAisleId = aisle.id
    let currentMarkdown = aisle.markdown
    function readonlyPreviewReferencesPlugin(context: any) {
      return createReadonlyPreviewReferencePlugin(context, options)
    }
    const referencePlugins =
      options.resolvePreviewToken && options.resolveInternalNoteReferenceToken
        ? [readonlyPreviewReferencesPlugin]
        : []
    const editor = new Editor({
      el: editorHost,
      initialValue: prepareMarkdownForEditorDisplay(currentMarkdown),
      initialEditType: 'wysiwyg',
      previewStyle: 'tab',
      hideModeSwitch: true,
      toolbarItems: [],
      height: `${getPreviewHeightPx(heightRem, rootFontSizePx)}px`,
      minHeight: '0px',
      autofocus: false,
      usageStatistics: false,
      plugins: [
        listMarkerPlugin,
        blockIndentPlugin,
        annotationLinePlugin,
        tagAppearancePlugin,
        highlightPlugin,
        createMediaLinkPlugin,
        headingSpaceShortcutPlugin,
        thematicBreakShortcutPlugin,
        ...referencePlugins,
      ],
    })
    restoreEditorBlankParagraphs(editor, currentMarkdown)
    const smartHeight = fitPreviewEditorHeight(editorHost, heightRem, () => currentMarkdown, editor)
    let currentStartKey = ''
    const schedulePreviewStartScroll = (nextData: NotePreviewData) => {
      const lastPositionSelection = nextData.previewCursorSelection
      const nextStartKey =
        payload.heading?.aisleId === currentAisleId
          ? `heading:${payload.heading.headingKey}`
          : payload.previewStart === 'last-position' && lastPositionSelection
            ? [
                'last-position',
                lastPositionSelection.anchor,
                lastPositionSelection.head,
                lastPositionSelection.updatedAt,
              ].join(':')
            : ''
      if (!nextStartKey || nextStartKey === currentStartKey) return
      currentStartKey = nextStartKey
      if (payload.heading?.aisleId === currentAisleId) {
        schedulePreviewHeadingScroll(editor, currentAisleId, payload.heading.headingKey)
      } else if (payload.previewStart === 'last-position' && lastPositionSelection) {
        schedulePreviewCursorScroll(editor, lastPositionSelection)
      }
    }
    schedulePreviewStartScroll(data)

    const view = getWysiwygView(editor)
    if (view?.setProps) {
      view.setProps({ editable: () => false })
      view.dom?.setAttribute?.('contenteditable', 'false')
    }

    const refreshPreviewEditor = () => {
      const nextData = options.getNotePreviewData(payload, options.sourceNoteBodyId)
      if (nextData.status !== 'ready' || !nextData.selectedAisle) {
        renderLowerBar()
        return
      }

      if (nextData.selectedAisle.id !== currentAisleId) {
        renderLowerBar()
        return
      }

      if (nextData.selectedAisle.markdown !== currentMarkdown) {
        currentAisleId = nextData.selectedAisle.id
        currentMarkdown = nextData.selectedAisle.markdown
        setEditorMarkdownForDisplay(editor, currentMarkdown, false)
      }
      schedulePreviewStartScroll(nextData)
      smartHeight.scheduleDelayedMeasure()
    }
    const ownerWindow = editorHost.ownerDocument?.defaultView ?? window
    const refreshInterval = ownerWindow.setInterval?.(refreshPreviewEditor, NOTE_PREVIEW_REFRESH_INTERVAL_MS) ?? 0

    contextEditorCleanups.push(() => {
      smartHeight.cleanup()
      if (refreshInterval) ownerWindow.clearInterval?.(refreshInterval)
      ;['pointerdown', 'mousedown', 'click'].forEach((eventName) => {
        editorHost.removeEventListener(eventName, stopReadonlyPreviewPointerEvent)
      })
      ;['keydown', 'beforeinput', 'paste', 'drop'].forEach((eventName) => {
        editorHost.removeEventListener(eventName, blockReadonlyPreviewEditEvent, true)
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

  const updateSizeButtons = () => {
    shrinkButton.disabled = previewSize === 'minimized'
    growButton.disabled = previewSize === 'large'
    const shrinkLabel =
      previewSize === 'large'
        ? 'Shrink note preview'
        : previewSize === 'small'
          ? 'Minimize note preview'
          : 'Note preview is minimized'
    const growLabel =
      previewSize === 'minimized'
        ? 'Show note preview'
        : previewSize === 'small'
          ? 'Expand note preview'
          : 'Note preview is fully expanded'
    shrinkButton.title = shrinkLabel
    shrinkButton.setAttribute('aria-label', shrinkLabel)
    growButton.title = growLabel
    growButton.setAttribute('aria-label', growLabel)
  }

  const renderLowerBar = () => {
    const data = options.getNotePreviewData(payload, options.sourceNoteBodyId)
    wrapper.classList.toggle('is-blocked', data.status === 'blocked')
    wrapper.classList.toggle('is-missing', data.status === 'missing')
    wrapper.classList.toggle('is-empty', data.status === 'empty')
    wrapper.classList.toggle('is-minimized', previewSize === 'minimized')
    wrapper.classList.toggle('is-small', previewSize === 'small')
    wrapper.classList.toggle('is-large', previewSize === 'large')
    renderTitleButtons(data)
    updateSizeButtons()
    deleteButton.title = 'Delete note preview'
    deleteButton.setAttribute('aria-label', deleteButton.title)
    clearLowerBar()

    lowerBar.hidden = previewSize === 'minimized'
    if (previewSize === 'minimized') return

    const statusText = getPreviewStatusText(data)
    if (statusText) {
      lowerBar.textContent = statusText
      return
    }

    const editorGroup = document.createElement('span')
    editorGroup.className = 'context-bar-editors'
    if (data.selectedAisle) editorGroup.append(renderPreviewEditor(data))
    lowerBar.append(editorGroup)
  }

  shrinkButton.addEventListener('mousedown', stopWidgetEvent)
  shrinkButton.addEventListener('click', (event) => {
    stopWidgetEvent(event)
    if (previewSize === 'large') {
      previewSize = 'small'
    } else if (previewSize === 'small') {
      previewSize = 'minimized'
    }
    renderLowerBar()
  })
  growButton.addEventListener('mousedown', stopWidgetEvent)
  growButton.addEventListener('click', (event) => {
    stopWidgetEvent(event)
    if (previewSize === 'minimized') {
      previewSize = 'small'
    } else if (previewSize === 'small') {
      previewSize = 'large'
    }
    renderLowerBar()
  })
  deleteButton.addEventListener('mousedown', stopWidgetEvent)
  deleteButton.addEventListener('click', (event) => {
    stopWidgetEvent(event)
    options.deleteNotePreview(payload.id)
  })

  sizeControl.append(shrinkButton, growButton)
  actions.append(sizeControl, deleteButton)
  topBar.append(titleGroup, actions)
  wrapper.append(topBar, lowerBar)
  renderLowerBar()
  ;(wrapper as HTMLElement & { destroyNotePreview?: () => void }).destroyNotePreview = () => {
    clearLowerBar()
    titleOverflowObserver?.disconnect()
    titleOverflowMeasureQueued = false
    if (titleOverflowMeasureFrame) {
      const ownerWindow = titleGroup.ownerDocument?.defaultView ?? window
      ownerWindow.cancelAnimationFrame?.(titleOverflowMeasureFrame)
      titleOverflowMeasureFrame = 0
    }
  }
  return wrapper
}

export function createInternalNoteLinkWidgetElement(
  label: string,
  target: NoteNavigationTarget,
  href: string,
  navigateToNoteLocation: (target: NoteNavigationTarget) => void,
  sourceRange?: { from: number; to: number; occurrence: number },
) {
  const link = document.createElement('a')
  link.className = 'internal-note-link-widget'
  link.href = '#'
  link.setAttribute('data-internal-note-link-syntax', href)
  if (sourceRange) {
    link.setAttribute('data-internal-note-link-from', String(sourceRange.from))
    link.setAttribute('data-internal-note-link-to', String(sourceRange.to))
    link.setAttribute('data-internal-note-link-occurrence', String(sourceRange.occurrence))
  }
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
