/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps */
import { useEffect, useRef, useState, type MouseEvent, type MutableRefObject, type PointerEvent as ReactPointerEvent } from 'react'
import type { Editor } from '@toast-ui/editor'
import type { InlineCropDragMode } from '../components/editor/ImageToolsOverlay'
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
    cropTop: 0,
    cropLeft: 0,
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
  const imageResizeRef = useRef<{ startX: number; startWidth: number } | null>(null)
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
    activeImageRef.current = null
    imageResizeRef.current = null
    resetInlineCropDrag()
    updateInlineCrop({ active: false, relX: 0, relY: 0, relWidth: 1, relHeight: 1, top: 0, left: 0, width: 0, height: 0 })
    setImageTools({ visible: false, cropTop: 0, cropLeft: 0, resizeTop: 0, resizeLeft: 0 })
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

  const closeIfSelectedImageMissing = () => {
    const image = activeImageRef.current
    if (!image) return
    const editorRoot = editorEventRootRef.current
    if (!image.isConnected || (editorRoot && !editorRoot.contains(image))) {
      close()
    }
  }

  const refreshPosition = () => {
    const image = activeImageRef.current
    if (!image || !image.isConnected) {
      close()
      return
    }
    const rect = image.getBoundingClientRect()
    setImageTools({
      visible: true,
      cropTop: Math.max(8, rect.top + 4),
      cropLeft: Math.max(8, rect.left + 4),
      resizeTop: Math.max(8, rect.bottom - 2),
      resizeLeft: Math.max(8, rect.right - 2),
    })

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
  }

  const select = (image: HTMLImageElement) => {
    activeImageRef.current = image
    activateEditorFromEventTarget(image)
    editorRef.current?.focus()
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

    context.drawImage(image, 0, 0, width, height)
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

  const updateEditorImageNode = (image: HTMLImageElement, attrs: { imageUrl?: string; altText?: string | null }) => {
    activateEditorFromEventTarget(image)
    const currentEditor = editorRef.current
    const view = getWysiwygView(currentEditor)
    if (!currentEditor || !view) return false

    const hit = findImageNodeHitForElement(view, image)
    if (!hit) return false

    view.dispatch(
      view.state.tr
        .setNodeMarkup(hit.pos, null, {
          ...(hit.node.attrs ?? {}),
          ...attrs,
        })
        .scrollIntoView(),
    )
    commitActiveEditorMarkdownNow(currentEditor)
    return true
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

  const renderImageToDataUrl = async (image: HTMLImageElement, width: number, height: number) => {
    const sourceImage = new Image()
    sourceImage.src = image.src
    await new Promise<void>((resolve, reject) => {
      sourceImage.onload = () => resolve()
      sourceImage.onerror = () => reject(new Error('image load failed'))
    })

    const outputWidth = Math.max(8, Math.round(width))
    const outputHeight = Math.max(8, Math.round(height))
    const canvas = document.createElement('canvas')
    canvas.width = outputWidth
    canvas.height = outputHeight
    const context = canvas.getContext('2d')
    if (!context) return null

    context.drawImage(sourceImage, 0, 0, outputWidth, outputHeight)
    return canvas.toDataURL('image/png')
  }

  const commitResizedImage = async () => {
    const image = activeImageRef.current
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
      const nextDataUrl = await renderImageToDataUrl(image, rect.width, rect.height)
      if (!nextDataUrl) {
        commitCurrentEditorContent()
        return
      }
      if (!updateEditorImageNode(image, { imageUrl: nextDataUrl, altText: image.alt || null })) {
        image.src = nextDataUrl
        commitCurrentEditorContent()
      }
      refreshPosition()
    } catch {
      commitCurrentEditorContent()
    }
  }

  const beginResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (inlineCrop.active) return
    const image = activeImageRef.current
    if (!image || !image.isConnected) return
    imageResizeRef.current = {
      startX: event.clientX,
      startWidth: image.getBoundingClientRect().width || image.width || image.naturalWidth || 160,
    }
  }

  const continueResize = (clientX: number) => {
    const image = activeImageRef.current
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

  const cancelCrop = () => {
    resetInlineCropDrag()
    updateInlineCrop((previous) => ({ ...previous, active: false, top: 0, left: 0, width: 0, height: 0 }))
  }

  const applyCrop = async () => {
    const image = activeImageRef.current
    const crop = inlineCropRef.current
    if (!image || !crop.active || !image.src) return

    const sourceImage = new Image()
    sourceImage.src = image.src
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
    const nextDataUrl = canvas.toDataURL('image/png')

    if (!updateEditorImageNode(image, { imageUrl: nextDataUrl, altText: image.alt || null })) {
      image.src = nextDataUrl
      commitCurrentEditorContent()
    }
    image.style.width = `${renderedWidth}px`
    image.style.height = `${renderedHeight}px`
    image.setAttribute('width', String(renderedWidth))
    image.setAttribute('height', String(renderedHeight))
    image.style.maxWidth = 'none'
    cancelCrop()
    refreshPosition()
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
    cancelCrop,
    applyCrop,
    beginCropMouseDrag,
  }
}
