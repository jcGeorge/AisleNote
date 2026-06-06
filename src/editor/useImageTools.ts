/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useRef, useState, type MouseEvent, type MutableRefObject, type PointerEvent as ReactPointerEvent } from 'react'
import type { Editor } from '@toast-ui/editor'
import type { InlineCropDragMode } from '../components/editor/ImageToolsOverlay'
import {
  DEFAULT_CROP_RATIO_PRESET_ID,
  fitCropRectToRatio,
  getCropRatioValue,
  normalizeCropRatioPresetId,
  type CropRatioPresetId,
} from './crop-ratios'
import {
  syncImageDisplayMetadata,
  syncImageDisplayMetadataInRoot,
} from './image-dom-metadata'
import { getImageToolPlacement, isUsableImageToolPlacementRect } from './image-tool-placement'
import {
  getImageResizeMetadata,
  stripImageResizeMetadataFromUrl,
  withImageResizeMetadata,
} from '../markdown/image-metadata'
import { importImageBlobAsAssetUrl } from '../markdown/image-asset-registry'
import {
  drawImageTransform,
  getImageTransformDimensions,
  getImageTransformDisplayWidth,
  type ImageTransformOperation,
  withImageDisplayWidthPreservingTransformMetadata,
  withImageTransformAssetDisplayWidth,
} from './image-transform'
import { recordDiagnosticEvent } from '../diagnostics/diagnostic-logger'
import { isInsideReadonlyNotePreview } from './note-preview-dom'
import { getWysiwygView } from './prosemirror-utils'
import {
  findImageNodeHitForElement,
  placeCaretAfterImageElement,
} from './image-node-selection'
import { logSlowOperation } from '../performance/performance-logging'
import type { ImageToolsState, InlineCropState, ToastTone } from '../types/app'

export const CLOSED_IMAGE_TOOLS_STATE: ImageToolsState = {
  visible: false,
  menuMode: 'start',
  toolbarTop: 0,
  toolbarLeft: 0,
  resizeTop: 0,
  resizeLeft: 0,
}

export const CLOSED_INLINE_CROP_STATE: InlineCropState = {
  active: false,
  ratioPresetId: DEFAULT_CROP_RATIO_PRESET_ID,
  relX: 0,
  relY: 0,
  relWidth: 1,
  relHeight: 1,
  top: 0,
  left: 0,
  width: 0,
  height: 0,
}

export type InlineCropCloseReason =
  | 'apply'
  | 'cancel'
  | 'manual'
  | 'missing-image'
  | 'readonly-note-preview'
  | 'restart'
  | 'selected-image-changed'
  | 'selected-image-missing'
  | 'unusable-image-rect'

export function getInlineCropCloseDiagnosticDetails(
  reason: InlineCropCloseReason,
  activeImageConnected: boolean,
  details: Record<string, unknown> = {},
) {
  return {
    reason,
    activeImageConnected,
    ...details,
  }
}

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

export function shouldSkipImageToolsClose({
  imageTools,
  inlineCrop,
  hasActiveImage,
  hasActiveImageLookup,
  hasImageResize,
  imageRebindInProgress,
}: {
  imageTools: ImageToolsState
  inlineCrop: InlineCropState
  hasActiveImage: boolean
  hasActiveImageLookup: boolean
  hasImageResize: boolean
  imageRebindInProgress: boolean
}): boolean {
  return (
    !imageTools.visible &&
    !inlineCrop.active &&
    !hasActiveImage &&
    !hasActiveImageLookup &&
    !hasImageResize &&
    !imageRebindInProgress
  )
}

type UseImageToolsParams = {
  editorRef: MutableRefObject<Editor | null>
  editorEventRootRef: MutableRefObject<HTMLElement | null>
  activateEditorFromEventTarget: (target: EventTarget | null) => void
  commitCurrentEditorContent: () => void
  commitActiveEditorMarkdownNow: (editor: Editor) => void
  pushToast: (message: string, tone?: ToastTone, durationMs?: number) => void
}

export function useImageTools({
  editorRef,
  editorEventRootRef,
  activateEditorFromEventTarget,
  commitCurrentEditorContent,
  commitActiveEditorMarkdownNow,
  pushToast,
}: UseImageToolsParams) {
  const [imageTools, setImageTools] = useState<ImageToolsState>(CLOSED_IMAGE_TOOLS_STATE)
  const [inlineCrop, setInlineCrop] = useState<InlineCropState>(CLOSED_INLINE_CROP_STATE)
  const activeImageRef = useRef<HTMLImageElement | null>(null)
  const activeImageLookupRef = useRef<{ sourceUrl: string; altText: string | null; position: number | null } | null>(null)
  const imageResizeRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const imageRebindInProgressRef = useRef(false)
  const imageRebindTokenRef = useRef(0)
  const imageToolsRef = useRef<ImageToolsState>(imageTools)
  const inlineCropRef = useRef<InlineCropState>(inlineCrop)
  const inlineCropDragRef = useRef<{
    mode: InlineCropDragMode | null
    startX: number
    startY: number
    startRelX: number
    startRelY: number
    startRelWidth: number
    startRelHeight: number
  }>({ mode: null, startX: 0, startY: 0, startRelX: 0, startRelY: 0, startRelWidth: 1, startRelHeight: 1 })
  const inlineCropOpenedAtRef = useRef<number | null>(null)

  const syncEditorImageDisplayMetadata = () => {
    syncImageDisplayMetadataInRoot(editorEventRootRef.current)
  }

  const updateImageTools = (updater: ImageToolsState | ((previous: ImageToolsState) => ImageToolsState)) => {
    const previous = imageToolsRef.current
    const nextImageTools =
      typeof updater === 'function'
        ? (updater as (previous: ImageToolsState) => ImageToolsState)(previous)
        : updater
    imageToolsRef.current = nextImageTools
    setImageTools(nextImageTools)
    return nextImageTools
  }

  const updateInlineCrop = (updater: InlineCropState | ((previous: InlineCropState) => InlineCropState)) => {
    const previous = inlineCropRef.current
    const nextInlineCrop =
      typeof updater === 'function'
        ? (updater as (previous: InlineCropState) => InlineCropState)(previous)
        : updater
    inlineCropRef.current = nextInlineCrop
    setInlineCrop(nextInlineCrop)
    return nextInlineCrop
  }

  const resetInlineCropDrag = () => {
    inlineCropDragRef.current = {
      mode: null,
      startX: 0,
      startY: 0,
      startRelX: 0,
      startRelY: 0,
      startRelWidth: 1,
      startRelHeight: 1,
    }
  }

  const getInlineCropOpenDurationMs = () =>
    inlineCropOpenedAtRef.current === null ? null : nowMs() - inlineCropOpenedAtRef.current

  const finishInlineCropDiagnostics = (
    event: string,
    reason: InlineCropCloseReason,
    details: Record<string, unknown> = {},
  ) => {
    const durationMs = getInlineCropOpenDurationMs()
    inlineCropOpenedAtRef.current = null
    if (durationMs === null) return
    recordDiagnosticEvent('image-tools', event, {
      durationMs,
      details: getInlineCropCloseDiagnosticDetails(reason, Boolean(activeImageRef.current?.isConnected), details),
    })
  }

  const startInlineCropDiagnostics = (image: HTMLImageElement, rect: DOMRect) => {
    inlineCropOpenedAtRef.current = nowMs()
    recordDiagnosticEvent('image-tools', 'crop-start', {
      details: {
        renderedWidth: Math.round(rect.width),
        renderedHeight: Math.round(rect.height),
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
      },
    })
  }

  const getSelectedImageRatioBounds = (image: HTMLImageElement, rect: DOMRect | { width: number; height: number }) => ({
    width: image.naturalWidth > 0 ? image.naturalWidth : rect.width,
    height: image.naturalHeight > 0 ? image.naturalHeight : rect.height,
  })

  const updateInlineCropFromPixels = (
    imageRect: DOMRect,
    cropRect: { x: number; y: number; width: number; height: number },
    ratioPresetId = normalizeCropRatioPresetId(inlineCropRef.current.ratioPresetId),
  ) => {
    updateInlineCrop((previous) => ({
      ...previous,
      ratioPresetId,
      relX: imageRect.width > 0 ? cropRect.x / imageRect.width : 0,
      relY: imageRect.height > 0 ? cropRect.y / imageRect.height : 0,
      relWidth: imageRect.width > 0 ? cropRect.width / imageRect.width : previous.relWidth,
      relHeight: imageRect.height > 0 ? cropRect.height / imageRect.height : previous.relHeight,
      top: imageRect.top + cropRect.y,
      left: imageRect.left + cropRect.x,
      width: cropRect.width,
      height: cropRect.height,
    }))
  }

  const captureScrollSnapshot = (source: HTMLElement | null) => {
    const elements: Array<{ element: HTMLElement; top: number; left: number }> = []
    const seen = new Set<HTMLElement>()
    let current = source?.parentElement ?? null
    while (current) {
      if (
        !seen.has(current) &&
        (current.scrollHeight > current.clientHeight || current.scrollWidth > current.clientWidth)
      ) {
        seen.add(current)
        elements.push({ element: current, top: current.scrollTop, left: current.scrollLeft })
      }
      current = current.parentElement
    }

    const scrollingElement = document.scrollingElement
    if (scrollingElement instanceof HTMLElement && !seen.has(scrollingElement)) {
      elements.push({ element: scrollingElement, top: scrollingElement.scrollTop, left: scrollingElement.scrollLeft })
    }

    return {
      windowTop: window.scrollY,
      windowLeft: window.scrollX,
      elements,
    }
  }

  const restoreScrollSnapshot = (snapshot: ReturnType<typeof captureScrollSnapshot>) => {
    snapshot.elements.forEach(({ element, top, left }) => {
      element.scrollTop = top
      element.scrollLeft = left
    })
    window.scrollTo(snapshot.windowLeft, snapshot.windowTop)
  }

  const focusEditorWithoutScrolling = (scrollSnapshot: ReturnType<typeof captureScrollSnapshot>) => {
    const view = getWysiwygView(editorRef.current)
    if (view?.dom instanceof HTMLElement) {
      view.dom.focus({ preventScroll: true })
    } else {
      editorRef.current?.focus()
    }
    restoreScrollSnapshot(scrollSnapshot)
  }

  const startInlineCropDrag = (mode: InlineCropDragMode, clientX: number, clientY: number) => {
    const crop = inlineCropRef.current
    if (!crop.active) return false
    inlineCropDragRef.current = {
      mode,
      startX: clientX,
      startY: clientY,
      startRelX: crop.relX,
      startRelY: crop.relY,
      startRelWidth: crop.relWidth,
      startRelHeight: crop.relHeight,
    }
    return true
  }

  const close = (reason: InlineCropCloseReason = 'manual') => {
    if (
      shouldSkipImageToolsClose({
        imageTools: imageToolsRef.current,
        inlineCrop: inlineCropRef.current,
        hasActiveImage: Boolean(activeImageRef.current),
        hasActiveImageLookup: Boolean(activeImageLookupRef.current),
        hasImageResize: Boolean(imageResizeRef.current),
        imageRebindInProgress: imageRebindInProgressRef.current,
      })
    ) {
      return
    }
    const cropWasActive = inlineCropRef.current.active
    const activeImageConnectedBeforeClose = Boolean(activeImageRef.current?.isConnected)
    imageRebindTokenRef.current += 1
    imageRebindInProgressRef.current = false
    activeImageRef.current = null
    activeImageLookupRef.current = null
    imageResizeRef.current = null
    if (cropWasActive) {
      finishInlineCropDiagnostics('crop-close', reason, {
        activeImageConnected: activeImageConnectedBeforeClose,
      })
    } else {
      inlineCropOpenedAtRef.current = null
    }
    resetInlineCropDrag()
    updateInlineCrop(CLOSED_INLINE_CROP_STATE)
    updateImageTools(CLOSED_IMAGE_TOOLS_STATE)
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !inlineCropRef.current.active) return
      if (event.cancelable) {
        event.preventDefault()
      }
      event.stopPropagation()
      close('selected-image-missing')
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [])

  useEffect(() => {
    let observer: MutationObserver | null = null
    let frameId = 0
    let retryId = 0
    let cancelled = false

    const scheduleSync = () => {
      if (frameId) return
      frameId = window.requestAnimationFrame(() => {
        frameId = 0
        syncEditorImageDisplayMetadata()
      })
    }

    const runSyncAndScheduleFollowUp = () => {
      syncEditorImageDisplayMetadata()
      scheduleSync()
    }

    const attachObserver = () => {
      if (cancelled) return
      const root = editorEventRootRef.current
      if (!root) {
        retryId = window.setTimeout(attachObserver, 100)
        return
      }

      syncEditorImageDisplayMetadata()
      observer = new MutationObserver(runSyncAndScheduleFollowUp)
      observer.observe(root, {
        attributes: true,
        attributeFilter: ['src'],
        childList: true,
        subtree: true,
      })
    }

    attachObserver()
    return () => {
      cancelled = true
      if (observer) observer.disconnect()
      if (frameId) window.cancelAnimationFrame(frameId)
      if (retryId) window.clearTimeout(retryId)
    }
  }, [])

  const closeIfSelectedImageMissing = () => {
    let image = activeImageRef.current
    if (!image) return
    const editorRoot = editorEventRootRef.current
    if (!image.isConnected || (editorRoot && !editorRoot.contains(image))) {
      image = recoverActiveImage()
      if (image?.isConnected && (!editorRoot || editorRoot.contains(image))) return
      if (imageRebindInProgressRef.current) return
      recordDiagnosticEvent('image-tools', 'selected-image-missing-close', {
        level: 'warning',
        details: {
          hadEditorRoot: Boolean(editorRoot),
          rebindInProgress: imageRebindInProgressRef.current,
          hadLookup: Boolean(activeImageLookupRef.current),
        },
      })
      close('selected-image-missing')
    }
  }

  const refreshPosition = (options: { closeOnMissing?: boolean } = {}) => {
    // During a resize drag, the live width intentionally differs from the last committed metadata.
    if (!imageResizeRef.current) {
      syncEditorImageDisplayMetadata()
    }
    let image = activeImageRef.current
    if (!image || !image.isConnected) {
      image = recoverActiveImage()
    }
    if (!image || !image.isConnected) {
      if (options.closeOnMissing !== false) {
        close('missing-image')
      }
      return false
    }
    const rect = image.getBoundingClientRect()
    if (!isUsableImageToolPlacementRect(rect)) {
      if (options.closeOnMissing !== false && !imageRebindInProgressRef.current) {
        close('unusable-image-rect')
      }
      return false
    }
    const placement = getImageToolPlacement(rect)
    updateImageTools((previous) => ({
      visible: true,
      menuMode: previous.visible ? previous.menuMode : 'start',
      toolbarTop: placement.toolbarTop,
      toolbarLeft: placement.toolbarLeft,
      resizeTop: placement.resizeTop,
      resizeLeft: placement.resizeLeft,
    }))

    updateInlineCrop((previous) => {
      if (!previous.active) return previous
      const ratioPresetId = normalizeCropRatioPresetId(previous.ratioPresetId)
      const sourceBounds = getSelectedImageRatioBounds(image, rect)
      const ratio = getCropRatioValue(ratioPresetId, sourceBounds.width, sourceBounds.height)
      const nextCropRect = fitCropRectToRatio(
        {
          x: previous.relX * rect.width,
          y: previous.relY * rect.height,
          width: Math.max(24, previous.relWidth * rect.width),
          height: Math.max(24, previous.relHeight * rect.height),
        },
        { width: rect.width, height: rect.height },
        ratio,
      )
      return {
        ...previous,
        ratioPresetId,
        relX: rect.width > 0 ? nextCropRect.x / rect.width : 0,
        relY: rect.height > 0 ? nextCropRect.y / rect.height : 0,
        relWidth: rect.width > 0 ? nextCropRect.width / rect.width : previous.relWidth,
        relHeight: rect.height > 0 ? nextCropRect.height / rect.height : previous.relHeight,
        top: rect.top + nextCropRect.y,
        left: rect.left + nextCropRect.x,
        width: nextCropRect.width,
        height: nextCropRect.height,
      }
    })
    return true
  }

  const select = (image: HTMLImageElement) => {
    if (isInsideReadonlyNotePreview(image)) {
      close('readonly-note-preview')
      return
    }
    if (inlineCropRef.current.active && activeImageRef.current !== image) {
      finishInlineCropDiagnostics('crop-close', 'selected-image-changed', {
        nextImageConnected: image.isConnected,
      })
      resetInlineCropDrag()
      updateInlineCrop(CLOSED_INLINE_CROP_STATE)
    }
    const imageRect = image.getBoundingClientRect()
    recordDiagnosticEvent('image-tools', 'select-image', {
      details: {
        connected: image.isConnected,
        complete: image.complete,
        renderedWidth: Math.round(imageRect.width),
        renderedHeight: Math.round(imageRect.height),
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
      },
    })
    const scrollSnapshot = captureScrollSnapshot(image)
    const sourceUrl = image.getAttribute('src') ?? image.src
    const altText = image.alt || null
    activeImageRef.current = image
    activeImageLookupRef.current = {
      sourceUrl,
      altText,
      position: activeImageLookupRef.current?.position ?? null,
    }
    syncImageDisplayMetadata(image)
    activateEditorFromEventTarget(image)
    restoreScrollSnapshot(scrollSnapshot)
    const view = getWysiwygView(editorRef.current)
    const hit = view ? placeCaretAfterImageElement(view, image, { focus: false }) : null
    if (view && hit) {
      activeImageLookupRef.current = {
        sourceUrl,
        altText,
        position: hit.pos,
      }
      restoreScrollSnapshot(scrollSnapshot)
    }
    focusEditorWithoutScrolling(scrollSnapshot)
    updateImageTools((previous) => ({ ...previous, menuMode: 'start' }))
    refreshPosition()
    restoreScrollSnapshot(scrollSnapshot)
    window.requestAnimationFrame(() => {
      restoreScrollSnapshot(scrollSnapshot)
      refreshPosition({ closeOnMissing: false })
      restoreScrollSnapshot(scrollSnapshot)
    })
  }

  const buildClipboardImagePayload = async (image: HTMLImageElement) => {
    if (!image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error('image load failed'))
      })
    }

    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height
    if (width <= 0 || height <= 0) return null

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return null

    const sourceImage = new Image()
    sourceImage.src = stripImageResizeMetadataFromUrl(image.getAttribute('src') ?? image.src)
    await new Promise<void>((resolve, reject) => {
      sourceImage.onload = () => resolve()
      sourceImage.onerror = () => reject(new Error('image load failed'))
    })

    context.drawImage(sourceImage, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((nextBlob) => resolve(nextBlob), 'image/png')
    })
    if (!blob) return null

    return {
      blob,
      dataUrl: canvas.toDataURL('image/png'),
    }
  }

  const copySelectedToClipboard = async () => {
    const image = activeImageRef.current
    if (!image) {
      pushToast('No image selected to copy.', 'warning')
      return false
    }

    try {
      const payload = await buildClipboardImagePayload(image)
      if (!payload) throw new Error('clipboard image payload failed')

      if (window.electronAPI?.copyImageDataUrl) {
        const result = await window.electronAPI.copyImageDataUrl(payload.dataUrl)
        if (!result?.ok) {
          throw new Error(result?.error ?? 'clipboard write failed')
        }
      } else if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ [payload.blob.type]: payload.blob })])
      } else {
        throw new Error('clipboard image write unsupported')
      }

      pushToast('Image copied.', 'success')
      return true
    } catch {
      pushToast('Could not copy image.', 'warning')
      return false
    }
  }

  const getRenderedImageAtPosition = (view: any, position: number): HTMLImageElement | null => {
    const renderedNode = view?.nodeDOM?.(position) ?? null
    if (renderedNode instanceof HTMLImageElement) return renderedNode
    if (renderedNode instanceof Element) {
      const image = renderedNode.querySelector('img')
      return image instanceof HTMLImageElement ? image : null
    }
    return null
  }

  const findRenderedImageBySource = (sourceUrl: string, altText?: string | null): HTMLImageElement | null => {
    const root = editorEventRootRef.current
    if (!root) return null
    const expectedAlt = altText ?? ''
    for (const image of root.querySelectorAll('img')) {
      if (!(image instanceof HTMLImageElement)) continue
      if (isInsideReadonlyNotePreview(image)) continue
      const candidateUrl = image.getAttribute('src') ?? image.src
      if (candidateUrl !== sourceUrl && image.src !== sourceUrl) continue
      if (expectedAlt && image.alt !== expectedAlt) continue
      return image
    }
    return null
  }

  const rebindActiveImage = (
    sourceUrl: string,
    fallback: HTMLImageElement | null,
    altText?: string | null,
    position?: number | null,
  ): HTMLImageElement | null => {
    const view = getWysiwygView(editorRef.current)
    const renderedImage =
      (typeof position === 'number' ? getRenderedImageAtPosition(view, position) : null) ??
      findRenderedImageBySource(sourceUrl, altText) ??
      (fallback?.isConnected ? fallback : null)
    if (renderedImage) {
      activeImageRef.current = renderedImage
      activeImageLookupRef.current = {
        sourceUrl,
        altText: altText ?? (renderedImage.alt || null),
        position: position ?? activeImageLookupRef.current?.position ?? null,
      }
    }
    return renderedImage
  }

  const recoverActiveImage = (): HTMLImageElement | null => {
    const lookup = activeImageLookupRef.current
    if (!lookup) return null
    return rebindActiveImage(lookup.sourceUrl, activeImageRef.current, lookup.altText, lookup.position)
  }

  const scheduleImageRebindAndRefresh = (
    sourceUrl: string,
    fallback: HTMLImageElement,
    altText: string | null,
    token: number,
    options: {
      menuMode?: ImageToolsState['menuMode']
      position?: number | null
      scrollSnapshot?: ReturnType<typeof captureScrollSnapshot>
    } = {},
  ) => {
    let attempts = 0
    const minAttempts = 3
    const maxAttempts = 6
    recordDiagnosticEvent('image-tools', 'image-rebind-scheduled', {
      details: {
        token,
        hasPosition: typeof options.position === 'number',
        menuMode: options.menuMode,
      },
    })

    const attemptRefresh = () => {
      if (imageRebindTokenRef.current !== token) return
      attempts += 1

      const renderedImage = rebindActiveImage(sourceUrl, fallback, altText, options.position)
      if (renderedImage) {
        syncImageDisplayMetadata(renderedImage)
      }
      updateImageTools((previous) =>
        previous.visible && options.menuMode ? { ...previous, menuMode: options.menuMode } : previous,
      )

      if (options.scrollSnapshot) {
        restoreScrollSnapshot(options.scrollSnapshot)
      }
      const refreshed = refreshPosition({ closeOnMissing: false })
      if (options.scrollSnapshot) {
        restoreScrollSnapshot(options.scrollSnapshot)
      }
      if ((refreshed && attempts >= minAttempts) || attempts >= maxAttempts) {
        imageRebindInProgressRef.current = false
        recordDiagnosticEvent('image-tools', refreshed ? 'image-rebind-complete' : 'image-rebind-failed', {
          level: refreshed ? 'info' : 'warning',
          details: {
            token,
            attempts,
            refreshed,
          },
        })
        return
      }
      window.requestAnimationFrame(attemptRefresh)
    }

    window.requestAnimationFrame(attemptRefresh)
    window.setTimeout(() => {
      if (imageRebindTokenRef.current === token && imageRebindInProgressRef.current) {
        attemptRefresh()
      }
    }, 80)
  }

  const updateEditorImageNode = (
    image: HTMLImageElement,
    attrs: { imageUrl?: string; altText?: string | null },
    options: { preserveScroll?: boolean; scrollSnapshot?: ReturnType<typeof captureScrollSnapshot> } = {},
  ) => {
    const scrollSnapshot =
      options.preserveScroll === false ? null : (options.scrollSnapshot ?? captureScrollSnapshot(image))
    activateEditorFromEventTarget(image)
    const currentEditor = editorRef.current
    const view = getWysiwygView(currentEditor)
    if (!currentEditor || !view) {
      if (scrollSnapshot) restoreScrollSnapshot(scrollSnapshot)
      return { updated: false, image: null, position: null }
    }

    const hit = findImageNodeHitForElement(view, image)
    if (!hit) {
      if (scrollSnapshot) restoreScrollSnapshot(scrollSnapshot)
      return { updated: false, image: null, position: null }
    }

    view.dispatch(
      view.state.tr.setNodeMarkup(hit.pos, null, {
        ...(hit.node.attrs ?? {}),
        ...attrs,
      }),
    )
    if (scrollSnapshot) restoreScrollSnapshot(scrollSnapshot)
    const renderedImage =
      getRenderedImageAtPosition(view, hit.pos) ??
      (attrs.imageUrl ? findRenderedImageBySource(attrs.imageUrl, attrs.altText) : null)
    if (renderedImage) {
      activeImageRef.current = renderedImage
      activeImageLookupRef.current = {
        sourceUrl: attrs.imageUrl ?? (renderedImage.getAttribute('src') ?? renderedImage.src),
        altText: attrs.altText ?? (renderedImage.alt || null),
        position: hit.pos,
      }
    }
    commitActiveEditorMarkdownNow(currentEditor)
    if (scrollSnapshot) {
      restoreScrollSnapshot(scrollSnapshot)
      window.requestAnimationFrame(() => restoreScrollSnapshot(scrollSnapshot))
    }
    return { updated: true, image: renderedImage, position: hit.pos }
  }

  const deleteSelectedImage = () => {
    const image = activeImageRef.current
    if (!image || !image.isConnected) return false
    activateEditorFromEventTarget(image)
    const currentEditor = editorRef.current
    const view = getWysiwygView(currentEditor)
    if (!currentEditor || !view) return false

    const hit = findImageNodeHitForElement(view, image)
    if (!hit) return false

    view.dispatch(view.state.tr.delete(hit.pos, hit.pos + hit.node.nodeSize).scrollIntoView())
    commitActiveEditorMarkdownNow(currentEditor)
    close()
    return true
  }

  const commitResizedImage = async () => {
    const resizeCommitStartedAt = nowMs()
    try {
      let image = activeImageRef.current
      if (!image || !image.isConnected) {
        image = recoverActiveImage()
      }
      if (!image || !image.isConnected) {
        commitCurrentEditorContent()
        return
      }

      const rect = image.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) {
        commitCurrentEditorContent()
        return
      }

      try {
        const scrollSnapshot = captureScrollSnapshot(image)
        const rebindToken = imageRebindTokenRef.current + 1
        imageRebindTokenRef.current = rebindToken
        imageRebindInProgressRef.current = true
        const displayWidth = Math.max(8, Math.round(rect.width))
        const sourceUrl = image.getAttribute('src') ?? image.src
        const nextImageUrl = withImageDisplayWidthPreservingTransformMetadata(sourceUrl, displayWidth)
        const updateResult = updateEditorImageNode(image, { imageUrl: nextImageUrl, altText: image.alt || null }, { scrollSnapshot })
        const selectedImage =
          updateResult.image ??
          rebindActiveImage(nextImageUrl, image, image.alt || null, updateResult.position) ??
          image
        if (!updateResult.updated) {
          image.src = nextImageUrl
          commitCurrentEditorContent()
        }
        activeImageRef.current = selectedImage
        activeImageLookupRef.current = {
          sourceUrl: nextImageUrl,
          altText: selectedImage.alt || null,
          position: updateResult.position,
        }
        syncImageDisplayMetadata(selectedImage)
        restoreScrollSnapshot(scrollSnapshot)
        refreshPosition({ closeOnMissing: false })
        restoreScrollSnapshot(scrollSnapshot)
        scheduleImageRebindAndRefresh(nextImageUrl, selectedImage, selectedImage.alt || null, rebindToken, {
          position: updateResult.position,
          scrollSnapshot,
        })
      } catch {
        imageRebindInProgressRef.current = false
        commitCurrentEditorContent()
      }
    } finally {
      logSlowOperation('image resize commit', nowMs() - resizeCommitStartedAt)
    }
  }

  const beginResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (inlineCrop.active) return
    let image = activeImageRef.current
    if (!image || !image.isConnected) {
      image = recoverActiveImage()
    }
    if (!image || !image.isConnected) return
    imageResizeRef.current = {
      startX: event.clientX,
      startWidth: image.getBoundingClientRect().width || image.width || image.naturalWidth || 160,
    }
    recordDiagnosticEvent('image-tools', 'resize-start', {
      details: {
        startWidth: imageResizeRef.current.startWidth,
      },
    })
  }

  const continueResize = (clientX: number) => {
    const image = activeImageRef.current?.isConnected ? activeImageRef.current : recoverActiveImage()
    const resize = imageResizeRef.current
    if (!image || !resize) return
    const nextWidth = Math.max(80, Math.round(resize.startWidth + (clientX - resize.startX)))
    image.style.width = `${nextWidth}px`
    image.style.maxWidth = '100%'
    image.style.height = 'auto'
    image.setAttribute('width', String(nextWidth))
    refreshPosition()
  }

  const startCrop = () => {
    const image = activeImageRef.current
    if (!image || !image.isConnected) return
    if (inlineCropRef.current.active) {
      finishInlineCropDiagnostics('crop-close', 'restart')
    }
    const rect = image.getBoundingClientRect()
    startInlineCropDiagnostics(image, rect)
    const width = Math.max(24, rect.width * 0.8)
    const height = Math.max(24, rect.height * 0.8)
    const left = rect.left + (rect.width - width) / 2
    const top = rect.top + (rect.height - height) / 2
    updateInlineCrop({
      active: true,
      ratioPresetId: DEFAULT_CROP_RATIO_PRESET_ID,
      relX: rect.width > 0 ? (left - rect.left) / rect.width : 0,
      relY: rect.height > 0 ? (top - rect.top) / rect.height : 0,
      relWidth: rect.width > 0 ? width / rect.width : 0.8,
      relHeight: rect.height > 0 ? height / rect.height : 0.8,
      top,
      left,
      width,
      height,
    })
  }

  const openTransformMenu = () => {
    if (inlineCropRef.current.active) return
    updateImageTools((previous) => (previous.visible ? { ...previous, menuMode: 'transform' } : previous))
  }

  const returnToStartMenu = () => {
    updateImageTools((previous) => (previous.visible ? { ...previous, menuMode: 'start' } : previous))
  }

  const cancelCrop = () => {
    resetInlineCropDrag()
    finishInlineCropDiagnostics('crop-cancel', 'cancel')
    updateInlineCrop((previous) => ({ ...previous, active: false, top: 0, left: 0, width: 0, height: 0 }))
  }

  const setCropRatio = (presetId: CropRatioPresetId) => {
    const image = activeImageRef.current?.isConnected ? activeImageRef.current : recoverActiveImage()
    const crop = inlineCropRef.current
    if (!image || !crop.active) return false

    const rect = image.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return false

    const sourceBounds = getSelectedImageRatioBounds(image, rect)
    const ratio = getCropRatioValue(presetId, sourceBounds.width, sourceBounds.height)
    const nextCropRect = fitCropRectToRatio(
      {
        x: crop.relX * rect.width,
        y: crop.relY * rect.height,
        width: Math.max(24, crop.relWidth * rect.width),
        height: Math.max(24, crop.relHeight * rect.height),
      },
      { width: rect.width, height: rect.height },
      ratio,
    )
    updateInlineCropFromPixels(rect, nextCropRect, presetId)
    return true
  }

  const applyCrop = async () => {
    const cropApplyStartedAt = nowMs()
    const image = activeImageRef.current?.isConnected ? activeImageRef.current : recoverActiveImage()
    const crop = inlineCropRef.current
    if (!image || !crop.active || !image.src) return
    recordDiagnosticEvent('image-tools', 'crop-apply-start', {
      details: {
        cropWidth: Math.round(crop.width),
        cropHeight: Math.round(crop.height),
        relX: crop.relX,
        relY: crop.relY,
        relWidth: crop.relWidth,
        relHeight: crop.relHeight,
      },
    })

    const sourceImage = new Image()
    sourceImage.src = stripImageResizeMetadataFromUrl(image.getAttribute('src') ?? image.src)
    await new Promise<void>((resolve, reject) => {
      sourceImage.onload = () => resolve()
      sourceImage.onerror = () => reject(new Error('image load failed'))
    })

    const naturalWidth = sourceImage.naturalWidth
    const naturalHeight = sourceImage.naturalHeight
    if (naturalWidth <= 0 || naturalHeight <= 0) return

    const rect = image.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return

    const widthPx = crop.width
    const heightPx = crop.height
    const xPx = crop.left - rect.left
    const yPx = crop.top - rect.top

    const sourceLeft = Math.max(0, Math.min(naturalWidth, (xPx / rect.width) * naturalWidth))
    const sourceTop = Math.max(0, Math.min(naturalHeight, (yPx / rect.height) * naturalHeight))
    const sourceRight = Math.max(sourceLeft, Math.min(naturalWidth, ((xPx + widthPx) / rect.width) * naturalWidth))
    const sourceBottom = Math.max(sourceTop, Math.min(naturalHeight, ((yPx + heightPx) / rect.height) * naturalHeight))
    const sourceX = Math.max(0, Math.min(naturalWidth - 1, Math.floor(sourceLeft)))
    const sourceY = Math.max(0, Math.min(naturalHeight - 1, Math.floor(sourceTop)))
    const sourceEndX = Math.max(sourceX + 1, Math.min(naturalWidth, Math.ceil(sourceRight)))
    const sourceEndY = Math.max(sourceY + 1, Math.min(naturalHeight, Math.ceil(sourceBottom)))
    const sourceWidth = sourceEndX - sourceX
    const sourceHeight = sourceEndY - sourceY
    const renderedWidth = Math.max(8, Math.round(crop.width))
    const renderedHeight = Math.max(8, Math.round(crop.height))

    const canvas = document.createElement('canvas')
    canvas.width = sourceWidth
    canvas.height = sourceHeight
    const context = canvas.getContext('2d')
    if (!context) return

    context.imageSmoothingEnabled = false
    context.drawImage(sourceImage, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight)
    const cropBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((nextBlob) => resolve(nextBlob), 'image/png')
    })
    if (!cropBlob) return
    const cropAssetUrl = await importImageBlobAsAssetUrl(cropBlob, 'cropped-image.png')
    if (!cropAssetUrl) {
      pushToast('Could not crop image.', 'warning')
      return
    }
    const nextImageUrl = withImageResizeMetadata(cropAssetUrl, { v: 1, w: renderedWidth })

    const scrollSnapshot = captureScrollSnapshot(image)
    const rebindToken = imageRebindTokenRef.current + 1
    imageRebindTokenRef.current = rebindToken
    imageRebindInProgressRef.current = true
    const updateResult = updateEditorImageNode(image, { imageUrl: nextImageUrl, altText: image.alt || null }, { scrollSnapshot })
    const selectedImage =
      updateResult.image ??
      rebindActiveImage(nextImageUrl, image, image.alt || null, updateResult.position) ??
      image
    if (!updateResult.updated) {
      image.src = nextImageUrl
      commitCurrentEditorContent()
    }
    activeImageRef.current = selectedImage
    activeImageLookupRef.current = {
      sourceUrl: nextImageUrl,
      altText: selectedImage.alt || null,
      position: updateResult.position,
    }
    selectedImage.src = nextImageUrl
    selectedImage.style.width = `${renderedWidth}px`
    selectedImage.style.height = `${renderedHeight}px`
    selectedImage.setAttribute('width', String(renderedWidth))
    selectedImage.setAttribute('height', String(renderedHeight))
    selectedImage.style.maxWidth = 'none'
    resetInlineCropDrag()
    finishInlineCropDiagnostics('crop-apply', 'apply')
    updateInlineCrop((previous) => ({ ...previous, active: false, top: 0, left: 0, width: 0, height: 0 }))
    restoreScrollSnapshot(scrollSnapshot)
    refreshPosition({ closeOnMissing: false })
    restoreScrollSnapshot(scrollSnapshot)
    scheduleImageRebindAndRefresh(nextImageUrl, selectedImage, selectedImage.alt || null, rebindToken, {
      position: updateResult.position,
      scrollSnapshot,
    })
    const cropApplyDurationMs = nowMs() - cropApplyStartedAt
    logSlowOperation('image crop apply', cropApplyDurationMs)
    recordDiagnosticEvent('image-tools', 'crop-apply-end', {
      durationMs: cropApplyDurationMs,
      details: {
        renderedWidth,
        renderedHeight,
        sourceWidth,
        sourceHeight,
      },
    })
  }

  const renderImageTransformCanvas = (
    source: CanvasImageSource,
    sourceWidth: number,
    sourceHeight: number,
    operation: ImageTransformOperation,
  ) => {
    const dimensions = getImageTransformDimensions(sourceWidth, sourceHeight, operation)
    const canvas = document.createElement('canvas')
    canvas.width = dimensions.width
    canvas.height = dimensions.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('canvas context unavailable')

    context.imageSmoothingEnabled = false
    drawImageTransform(context, source, sourceWidth, sourceHeight, operation)
    return { canvas, width: dimensions.width, height: dimensions.height }
  }

  const renderImageWithExistingTransformMetadata = (
    sourceImage: HTMLImageElement,
    sourceUrl: string,
    sourceWidth: number,
    sourceHeight: number,
  ) => {
    const sourceMetadata = getImageResizeMetadata(sourceUrl)
    let current: { image: CanvasImageSource; width: number; height: number } = {
      image: sourceImage,
      width: sourceWidth,
      height: sourceHeight,
    }

    const applyTransform = (operation: ImageTransformOperation) => {
      const next = renderImageTransformCanvas(current.image, current.width, current.height, operation)
      current = {
        image: next.canvas,
        width: next.width,
        height: next.height,
      }
    }

    if (sourceMetadata?.r === 90) {
      applyTransform('rotate-cw')
    } else if (sourceMetadata?.r === 180) {
      applyTransform('rotate-cw')
      applyTransform('rotate-cw')
    } else if (sourceMetadata?.r === 270) {
      applyTransform('rotate-ccw')
    }
    if (sourceMetadata?.fh) applyTransform('flip-horizontal')
    if (sourceMetadata?.fv) applyTransform('flip-vertical')

    return current
  }

  const canvasToPngBlob = (canvas: HTMLCanvasElement) =>
    new Promise<Blob | null>((resolve) => {
      canvas.toBlob((nextBlob) => resolve(nextBlob), 'image/png')
    })

  const transformSelectedImage = async (operation: ImageTransformOperation) => {
    const transformStartedAt = nowMs()
    const image = activeImageRef.current?.isConnected ? activeImageRef.current : recoverActiveImage()
    if (!image || !image.isConnected || !image.src || inlineCropRef.current.active) return false
    recordDiagnosticEvent('image-tools', 'transform-start', {
      details: {
        operation,
        renderedWidth: Math.round(image.getBoundingClientRect().width),
        renderedHeight: Math.round(image.getBoundingClientRect().height),
      },
    })

    const rebindToken = imageRebindTokenRef.current + 1
    imageRebindTokenRef.current = rebindToken
    imageRebindInProgressRef.current = true
    try {
      const scrollSnapshot = captureScrollSnapshot(image)
      const sourceUrl = image.getAttribute('src') ?? image.src
      const sourceImage = new Image()
      sourceImage.src = stripImageResizeMetadataFromUrl(sourceUrl)
      await new Promise<void>((resolve, reject) => {
        sourceImage.onload = () => resolve()
        sourceImage.onerror = () => reject(new Error('image load failed'))
      })

      const sourceWidth = sourceImage.naturalWidth || sourceImage.width
      const sourceHeight = sourceImage.naturalHeight || sourceImage.height
      if (sourceWidth <= 0 || sourceHeight <= 0) throw new Error('invalid image dimensions')

      const existingTransform = renderImageWithExistingTransformMetadata(sourceImage, sourceUrl, sourceWidth, sourceHeight)
      const transformed = renderImageTransformCanvas(
        existingTransform.image,
        existingTransform.width,
        existingTransform.height,
        operation,
      )
      const transformBlob = await canvasToPngBlob(transformed.canvas)
      if (!transformBlob) throw new Error('image transform encode failed')
      const transformedAssetUrl = await importImageBlobAsAssetUrl(transformBlob, 'transformed-image.png')
      if (!transformedAssetUrl) throw new Error('image transform import failed')

      const renderedWidth = image.getBoundingClientRect().width || image.width || sourceWidth
      const nextImageUrl = withImageTransformAssetDisplayWidth(
        transformedAssetUrl,
        sourceUrl,
        renderedWidth,
        existingTransform.width,
        transformed.width,
        operation,
      )
      const displayWidth = getImageTransformDisplayWidth(nextImageUrl, renderedWidth)

      const updateResult = updateEditorImageNode(image, { imageUrl: nextImageUrl, altText: image.alt || null }, { scrollSnapshot })
      const selectedImage =
        updateResult.image ??
        rebindActiveImage(nextImageUrl, image, image.alt || null, updateResult.position) ??
        image
      if (!updateResult.updated) {
        image.src = nextImageUrl
        commitCurrentEditorContent()
      }
      activeImageRef.current = selectedImage
      activeImageLookupRef.current = {
        sourceUrl: nextImageUrl,
        altText: selectedImage.alt || null,
        position: updateResult.position,
      }
      selectedImage.src = nextImageUrl
      selectedImage.style.width = `${displayWidth}px`
      selectedImage.style.height = 'auto'
      selectedImage.style.maxWidth = '100%'
      selectedImage.setAttribute('width', String(displayWidth))
      selectedImage.removeAttribute('height')
      updateImageTools((previous) => (previous.visible ? { ...previous, menuMode: 'transform' } : previous))
      restoreScrollSnapshot(scrollSnapshot)
      refreshPosition({ closeOnMissing: false })
      restoreScrollSnapshot(scrollSnapshot)
      scheduleImageRebindAndRefresh(nextImageUrl, selectedImage, selectedImage.alt || null, rebindToken, {
        menuMode: 'transform',
        position: updateResult.position,
        scrollSnapshot,
      })
      const transformDurationMs = nowMs() - transformStartedAt
      logSlowOperation('image transform', transformDurationMs)
      recordDiagnosticEvent('image-tools', 'transform-end', {
        durationMs: transformDurationMs,
        details: {
          operation,
          renderedWidth,
          displayWidth,
          transformedWidth: transformed.width,
          transformedHeight: transformed.height,
        },
      })
      return true
    } catch {
      if (imageRebindTokenRef.current === rebindToken) {
        imageRebindInProgressRef.current = false
      }
      recordDiagnosticEvent('image-tools', 'transform-failed', {
        level: 'warning',
        durationMs: nowMs() - transformStartedAt,
        details: {
          operation,
        },
      })
      pushToast('Could not transform image.', 'warning')
      return false
    }
  }

  const beginCropMouseDrag = (mode: InlineCropDragMode, event: MouseEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    startInlineCropDrag(mode, event.clientX, event.clientY)
  }

  useEffect(() => {
    const stopCropMouseEvent = (event: globalThis.MouseEvent) => {
      if (event.cancelable) {
        event.preventDefault()
      }
      event.stopPropagation()
      event.stopImmediatePropagation()
    }

    const applyInlineCropDrag = (clientX: number, clientY: number) => {
      const drag = inlineCropDragRef.current
      const crop = inlineCropRef.current
      if (!drag.mode || !crop.active) return false

      const image = activeImageRef.current
      if (!image || !image.isConnected) return false
      const rect = image.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return false

      const startX = drag.startRelX * rect.width
      const startY = drag.startRelY * rect.height
      const startWidth = Math.max(24, drag.startRelWidth * rect.width)
      const startHeight = Math.max(24, drag.startRelHeight * rect.height)
      const dx = clientX - drag.startX
      const dy = clientY - drag.startY

      const commitCropPixels = (x: number, y: number, width: number, height: number) => {
        const ratioPresetId = normalizeCropRatioPresetId(crop.ratioPresetId)
        const sourceBounds = getSelectedImageRatioBounds(image, rect)
        const ratio = getCropRatioValue(ratioPresetId, sourceBounds.width, sourceBounds.height)
        const nextCropRect = fitCropRectToRatio(
          { x, y, width, height },
          { width: rect.width, height: rect.height },
          ratio,
        )
        updateInlineCropFromPixels(rect, nextCropRect, ratioPresetId)
      }

      if (drag.mode === 'move') {
        const nextX = Math.max(0, Math.min(rect.width - startWidth, startX + dx))
        const nextY = Math.max(0, Math.min(rect.height - startHeight, startY + dy))
        commitCropPixels(nextX, nextY, startWidth, startHeight)
        return true
      }

      if (drag.mode === 'resize-e') {
        commitCropPixels(startX, startY, startWidth + dx, startHeight)
        return true
      }

      if (drag.mode === 'resize-s') {
        commitCropPixels(startX, startY, startWidth, startHeight + dy)
        return true
      }

      if (drag.mode === 'resize-se') {
        commitCropPixels(startX, startY, startWidth + dx, startHeight + dy)
        return true
      }

      if (drag.mode === 'resize-w') {
        const nextX = Math.max(0, Math.min(startX + startWidth - 24, startX + dx))
        commitCropPixels(nextX, startY, startWidth + startX - nextX, startHeight)
        return true
      }

      if (drag.mode === 'resize-n') {
        const nextY = Math.max(0, Math.min(startY + startHeight - 24, startY + dy))
        commitCropPixels(startX, nextY, startWidth, startHeight + startY - nextY)
        return true
      }

      return true
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (imageResizeRef.current) {
        continueResize(event.clientX)
      }
    }

    const handlePointerUp = () => {
      if (imageResizeRef.current) {
        const image = activeImageRef.current?.isConnected ? activeImageRef.current : recoverActiveImage()
        const rect = image?.getBoundingClientRect()
        recordDiagnosticEvent('image-tools', 'resize-end', {
          details: {
            renderedWidth: rect ? Math.round(rect.width) : null,
            renderedHeight: rect ? Math.round(rect.height) : null,
          },
        })
        imageResizeRef.current = null
        void commitResizedImage()
      }
    }

    const handleMouseMove = (event: globalThis.MouseEvent) => {
      if (applyInlineCropDrag(event.clientX, event.clientY)) {
        stopCropMouseEvent(event)
      }
    }

    const handleMouseUp = (event: globalThis.MouseEvent) => {
      const hadCropDrag = Boolean(inlineCropDragRef.current.mode && inlineCropRef.current.active)
      if (hadCropDrag) {
        stopCropMouseEvent(event)
      }
      resetInlineCropDrag()
    }

    const listenerOptions: AddEventListenerOptions = { capture: true }
    document.addEventListener('pointermove', handlePointerMove, listenerOptions)
    document.addEventListener('pointerup', handlePointerUp, listenerOptions)
    document.addEventListener('pointercancel', handlePointerUp, listenerOptions)
    document.addEventListener('mousemove', handleMouseMove, listenerOptions)
    document.addEventListener('mouseup', handleMouseUp, listenerOptions)
    return () => {
      document.removeEventListener('pointermove', handlePointerMove, listenerOptions)
      document.removeEventListener('pointerup', handlePointerUp, listenerOptions)
      document.removeEventListener('pointercancel', handlePointerUp, listenerOptions)
      document.removeEventListener('mousemove', handleMouseMove, listenerOptions)
      document.removeEventListener('mouseup', handleMouseUp, listenerOptions)
    }
  }, [])

  return {
    imageTools,
    inlineCrop,
    activeImageRef,
    isCropActive: () => inlineCropRef.current.active,
    close,
    closeIfSelectedImageMissing,
    refreshPosition,
    select,
    copySelectedToClipboard,
    deleteSelectedImage,
    beginResize,
    startCrop,
    openTransformMenu,
    returnToStartMenu,
    transformSelectedImage,
    cancelCrop,
    setCropRatio,
    applyCrop,
    beginCropMouseDrag,
  }
}
