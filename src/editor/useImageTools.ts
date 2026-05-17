/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useRef, useState, type MouseEvent, type MutableRefObject, type PointerEvent as ReactPointerEvent } from 'react'
import type { Editor } from '@toast-ui/editor'
import type { InlineCropDragMode } from '../components/editor/ImageToolsOverlay'
import { getImageToolPlacement, isUsableImageToolPlacementRect } from './image-tool-placement'
import {
  getImageResizeMetadata,
  stripImageResizeMetadataFromUrl,
  withImageResizeMetadata,
} from '../markdown/image-metadata'
import {
  drawImageTransform,
  getImageTransformDimensions,
  getImageTransformDisplayWidth,
  type ImageTransformOperation,
  withImageTransformDisplayWidth,
} from './image-transform'
import { isInsideReadonlyNotePreview } from './note-preview-dom'
import { getWysiwygView } from './prosemirror-utils'
import type { ImageToolsState, InlineCropState, ToastTone } from '../types/app'

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
  const [imageTools, setImageTools] = useState<ImageToolsState>({
    visible: false,
    menuMode: 'start',
    toolbarTop: 0,
    toolbarLeft: 0,
    resizeTop: 0,
    resizeLeft: 0,
  })
  const [inlineCrop, setInlineCrop] = useState<InlineCropState>({
    active: false,
    relX: 0,
    relY: 0,
    relWidth: 1,
    relHeight: 1,
    top: 0,
    left: 0,
    width: 0,
    height: 0,
  })
  const activeImageRef = useRef<HTMLImageElement | null>(null)
  const activeImageLookupRef = useRef<{ sourceUrl: string; altText: string | null; position: number | null } | null>(null)
  const imageResizeRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const imageRebindInProgressRef = useRef(false)
  const imageRebindTokenRef = useRef(0)
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

  const syncImageDisplayMetadata = (image: HTMLImageElement) => {
    const metadata = getImageResizeMetadata(image.getAttribute('src') ?? image.src)
    if (!metadata) return false

    image.style.width = `${metadata.w}px`
    image.style.height = 'auto'
    image.style.maxWidth = '100%'
    image.setAttribute('width', String(metadata.w))
    image.removeAttribute('height')
    return true
  }

  const syncEditorImageDisplayMetadata = () => {
    const root = editorEventRootRef.current
    if (!root) return
    root.querySelectorAll('img').forEach((image) => {
      if (image instanceof HTMLImageElement) {
        syncImageDisplayMetadata(image)
      }
    })
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

  const close = () => {
    imageRebindTokenRef.current += 1
    imageRebindInProgressRef.current = false
    activeImageRef.current = null
    activeImageLookupRef.current = null
    imageResizeRef.current = null
    resetInlineCropDrag()
    updateInlineCrop({ active: false, relX: 0, relY: 0, relWidth: 1, relHeight: 1, top: 0, left: 0, width: 0, height: 0 })
    setImageTools({
      visible: false,
      menuMode: 'start',
      toolbarTop: 0,
      toolbarLeft: 0,
      resizeTop: 0,
      resizeLeft: 0,
    })
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !inlineCropRef.current.active) return
      if (event.cancelable) {
        event.preventDefault()
      }
      event.stopPropagation()
      close()
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

    const attachObserver = () => {
      if (cancelled) return
      const root = editorEventRootRef.current
      if (!root) {
        retryId = window.setTimeout(attachObserver, 100)
        return
      }

      syncEditorImageDisplayMetadata()
      observer = new MutationObserver(scheduleSync)
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
      close()
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
        close()
      }
      return false
    }
    const rect = image.getBoundingClientRect()
    if (!isUsableImageToolPlacementRect(rect)) {
      if (options.closeOnMissing !== false && !imageRebindInProgressRef.current) {
        close()
      }
      return false
    }
    const placement = getImageToolPlacement(rect)
    setImageTools((previous) => ({
      visible: true,
      menuMode: previous.visible ? previous.menuMode : 'start',
      toolbarTop: placement.toolbarTop,
      toolbarLeft: placement.toolbarLeft,
      resizeTop: placement.resizeTop,
      resizeLeft: placement.resizeLeft,
    }))

    updateInlineCrop((previous) => {
      if (!previous.active) return previous
      const width = Math.max(24, previous.relWidth * rect.width)
      const height = Math.max(24, previous.relHeight * rect.height)
      const x = Math.max(0, Math.min(rect.width - width, previous.relX * rect.width))
      const y = Math.max(0, Math.min(rect.height - height, previous.relY * rect.height))
      return {
        ...previous,
        relX: rect.width > 0 ? x / rect.width : 0,
        relY: rect.height > 0 ? y / rect.height : 0,
        relWidth: rect.width > 0 ? width / rect.width : previous.relWidth,
        relHeight: rect.height > 0 ? height / rect.height : previous.relHeight,
        top: rect.top + y,
        left: rect.left + x,
        width,
        height,
      }
    })
    return true
  }

  const select = (image: HTMLImageElement) => {
    if (isInsideReadonlyNotePreview(image)) {
      close()
      return
    }
    activeImageRef.current = image
    activeImageLookupRef.current = {
      sourceUrl: image.getAttribute('src') ?? image.src,
      altText: image.alt || null,
      position: activeImageLookupRef.current?.position ?? null,
    }
    syncImageDisplayMetadata(image)
    activateEditorFromEventTarget(image)
    editorRef.current?.focus()
    setImageTools((previous) => ({ ...previous, menuMode: 'start' }))
    refreshPosition()
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
      pushToast('no image selected to copy.', 'warning')
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

      pushToast('image copied.', 'success')
      return true
    } catch {
      pushToast('could not copy image.', 'warning')
      return false
    }
  }

  const findImageNodeHitForElement = (view: any, image: HTMLImageElement): { node: any; pos: number } | null => {
    if (!view?.dom?.contains(image)) return null
    const docSize = view.state.doc.content.size
    const clampPos = (pos: number) => Math.max(0, Math.min(docSize, pos))
    const inspectPos = (rawPos: number) => {
      const pos = clampPos(rawPos)
      const nodeAt = view.state.doc.nodeAt(pos)
      if (nodeAt?.type?.name === 'image') return { node: nodeAt, pos }

      const resolved = view.state.doc.resolve(pos)
      if (resolved.nodeAfter?.type?.name === 'image') return { node: resolved.nodeAfter, pos }
      if (resolved.nodeBefore?.type?.name === 'image') {
        return { node: resolved.nodeBefore, pos: Math.max(0, pos - resolved.nodeBefore.nodeSize) }
      }
      return null
    }

    try {
      const domPos = view.posAtDOM(image, 0)
      for (const candidatePos of [domPos, domPos - 1, domPos + 1]) {
        const hit = inspectPos(candidatePos)
        if (hit) return hit
      }
    } catch {
      // Fall back to matching below.
    }

    const imageUrl = image.getAttribute('src') ?? ''
    const altText = image.getAttribute('alt') ?? ''
    let fallback: { node: any; pos: number } | null = null
    view.state.doc.descendants((node: any, pos: number) => {
      if (fallback || node?.type?.name !== 'image') return
      const attrs = node.attrs ?? {}
      if ((attrs.imageUrl ?? '') === imageUrl && (attrs.altText ?? '') === altText) {
        fallback = { node, pos }
      }
    })
    return fallback
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

    const attemptRefresh = () => {
      if (imageRebindTokenRef.current !== token) return
      attempts += 1

      const renderedImage = rebindActiveImage(sourceUrl, fallback, altText, options.position)
      if (renderedImage) {
        syncImageDisplayMetadata(renderedImage)
      }
      setImageTools((previous) =>
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
      const nextImageUrl = withImageResizeMetadata(sourceUrl, { v: 1, w: displayWidth })
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
    const rect = image.getBoundingClientRect()
    const width = Math.max(24, rect.width * 0.8)
    const height = Math.max(24, rect.height * 0.8)
    const left = rect.left + (rect.width - width) / 2
    const top = rect.top + (rect.height - height) / 2
    updateInlineCrop({
      active: true,
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
    setImageTools((previous) => (previous.visible ? { ...previous, menuMode: 'transform' } : previous))
  }

  const returnToStartMenu = () => {
    setImageTools((previous) => (previous.visible ? { ...previous, menuMode: 'start' } : previous))
  }

  const cancelCrop = () => {
    resetInlineCropDrag()
    updateInlineCrop((previous) => ({ ...previous, active: false, top: 0, left: 0, width: 0, height: 0 }))
  }

  const applyCrop = async () => {
    const image = activeImageRef.current?.isConnected ? activeImageRef.current : recoverActiveImage()
    const crop = inlineCropRef.current
    if (!image || !crop.active || !image.src) return

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
    const nextDataUrl = withImageResizeMetadata(canvas.toDataURL('image/png'), { v: 1, w: renderedWidth })

    const scrollSnapshot = captureScrollSnapshot(image)
    const rebindToken = imageRebindTokenRef.current + 1
    imageRebindTokenRef.current = rebindToken
    imageRebindInProgressRef.current = true
    const updateResult = updateEditorImageNode(image, { imageUrl: nextDataUrl, altText: image.alt || null }, { scrollSnapshot })
    const selectedImage =
      updateResult.image ??
      rebindActiveImage(nextDataUrl, image, image.alt || null, updateResult.position) ??
      image
    if (!updateResult.updated) {
      image.src = nextDataUrl
      commitCurrentEditorContent()
    }
    activeImageRef.current = selectedImage
    activeImageLookupRef.current = {
      sourceUrl: nextDataUrl,
      altText: selectedImage.alt || null,
      position: updateResult.position,
    }
    selectedImage.src = nextDataUrl
    selectedImage.style.width = `${renderedWidth}px`
    selectedImage.style.height = `${renderedHeight}px`
    selectedImage.setAttribute('width', String(renderedWidth))
    selectedImage.setAttribute('height', String(renderedHeight))
    selectedImage.style.maxWidth = 'none'
    cancelCrop()
    restoreScrollSnapshot(scrollSnapshot)
    refreshPosition({ closeOnMissing: false })
    restoreScrollSnapshot(scrollSnapshot)
    scheduleImageRebindAndRefresh(nextDataUrl, selectedImage, selectedImage.alt || null, rebindToken, {
      position: updateResult.position,
      scrollSnapshot,
    })
  }

  const transformSelectedImage = async (operation: ImageTransformOperation) => {
    const image = activeImageRef.current?.isConnected ? activeImageRef.current : recoverActiveImage()
    if (!image || !image.isConnected || !image.src || inlineCropRef.current.active) return false

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

      const dimensions = getImageTransformDimensions(sourceWidth, sourceHeight, operation)
      const canvas = document.createElement('canvas')
      canvas.width = dimensions.width
      canvas.height = dimensions.height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('canvas context unavailable')

      context.imageSmoothingEnabled = false
      drawImageTransform(context, sourceImage, sourceWidth, sourceHeight, operation)

      const renderedWidth = image.getBoundingClientRect().width || image.width || sourceWidth
      const nextDataUrl = withImageTransformDisplayWidth(
        canvas.toDataURL('image/png'),
        sourceUrl,
        renderedWidth,
        sourceWidth,
        dimensions.width,
        operation,
      )
      const displayWidth = getImageTransformDisplayWidth(nextDataUrl, renderedWidth)

      const updateResult = updateEditorImageNode(image, { imageUrl: nextDataUrl, altText: image.alt || null }, { scrollSnapshot })
      const selectedImage =
        updateResult.image ??
        rebindActiveImage(nextDataUrl, image, image.alt || null, updateResult.position) ??
        image
      if (!updateResult.updated) {
        image.src = nextDataUrl
        commitCurrentEditorContent()
      }
      activeImageRef.current = selectedImage
      activeImageLookupRef.current = {
        sourceUrl: nextDataUrl,
        altText: selectedImage.alt || null,
        position: updateResult.position,
      }
      selectedImage.src = nextDataUrl
      selectedImage.style.width = `${displayWidth}px`
      selectedImage.style.height = 'auto'
      selectedImage.style.maxWidth = '100%'
      selectedImage.setAttribute('width', String(displayWidth))
      selectedImage.removeAttribute('height')
      setImageTools((previous) => (previous.visible ? { ...previous, menuMode: 'transform' } : previous))
      restoreScrollSnapshot(scrollSnapshot)
      refreshPosition({ closeOnMissing: false })
      restoreScrollSnapshot(scrollSnapshot)
      scheduleImageRebindAndRefresh(nextDataUrl, selectedImage, selectedImage.alt || null, rebindToken, {
        menuMode: 'transform',
        position: updateResult.position,
        scrollSnapshot,
      })
      return true
    } catch {
      if (imageRebindTokenRef.current === rebindToken) {
        imageRebindInProgressRef.current = false
      }
      pushToast('could not transform image.', 'warning')
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
        const nextX = Math.max(0, Math.min(rect.width - width, x))
        const nextY = Math.max(0, Math.min(rect.height - height, y))
        const nextWidth = Math.max(24, Math.min(width, rect.width - nextX))
        const nextHeight = Math.max(24, Math.min(height, rect.height - nextY))
        updateInlineCrop((previous) => ({
          ...previous,
          relX: rect.width > 0 ? nextX / rect.width : 0,
          relY: rect.height > 0 ? nextY / rect.height : 0,
          relWidth: rect.width > 0 ? nextWidth / rect.width : previous.relWidth,
          relHeight: rect.height > 0 ? nextHeight / rect.height : previous.relHeight,
          top: rect.top + nextY,
          left: rect.left + nextX,
          width: nextWidth,
          height: nextHeight,
        }))
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
    applyCrop,
    beginCropMouseDrag,
  }
}
