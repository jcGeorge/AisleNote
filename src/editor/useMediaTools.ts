/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent } from 'react'
import type { Editor } from '@toast-ui/editor'
import type { MediaToolsState } from '../components/editor/MediaToolsOverlay'
import type { ImageTransformOperation } from './image-transform'
import {
  getImageToolPlacement,
  getVideoViewportResizeToolPlacement,
  isUsableImageToolPlacementRect,
} from './image-tool-placement'
import { collectMediaLinkRanges, type MediaLinkRange } from './media-link-plugin'
import { isInsideReadonlyNotePreview } from './note-preview-dom'
import { getWysiwygView } from './prosemirror-utils'
import {
  getMediaTransformMetadata,
  isTabsAssetMediaUrl,
  withMediaTransformMetadata,
  type MediaTransformMetadata,
} from '../media/media-metadata'
import {
  DEFAULT_VIDEO_ASPECT_RATIO,
  applyMediaMetadataToPlayer,
  getMediaViewportAspectRatio,
  getVideoNaturalAspectRatio,
} from '../media/media-rendering'
import { getMediaKindFromUrl, MEDIA_PLAYER_CLASS_NAME } from '../media/media-utils'

export const CLOSED_MEDIA_TOOLS_STATE: MediaToolsState = {
  visible: false,
  menuMode: 'start',
  toolbarTop: 0,
  toolbarLeft: 0,
  resizeTop: 0,
  resizeLeft: 0,
}

type UseMediaToolsParams = {
  editorRef: MutableRefObject<Editor | null>
  editorEventRootRef: MutableRefObject<HTMLElement | null>
  activateEditorFromEventTarget: (target: EventTarget | null) => void
  commitCurrentEditorContent: () => void
  commitActiveEditorMarkdownNow: (editor: Editor) => void
}

type VideoPlaybackSnapshot = {
  currentTime: number
  loop: boolean
  paused: boolean
}

export type MediaResizeStart = {
  startX: number
  startY: number
  startWidth: number
  aspectRatio: number
}

function getSafeResizeAspectRatio(aspectRatio: number): number {
  return Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : DEFAULT_VIDEO_ASPECT_RATIO
}

export function getNextMediaResizeWidth(
  resize: MediaResizeStart,
  clientX: number,
  clientY: number,
  minWidth = 160,
): number {
  const horizontalDelta = clientX - resize.startX
  const verticalDelta = (clientY - resize.startY) * getSafeResizeAspectRatio(resize.aspectRatio)
  const dominantDelta = Math.abs(verticalDelta) > Math.abs(horizontalDelta) ? verticalDelta : horizontalDelta
  return Math.max(minWidth, Math.round(resize.startWidth + dominantDelta))
}

function getDatasetNumber(element: HTMLElement, name: string): number | null {
  const value = Number(element.dataset[name])
  return Number.isFinite(value) ? value : null
}

function getSourceUrl(player: HTMLElement) {
  return player.dataset.mediaSource ?? ''
}

function getCurrentMetadata(sourceUrl: string): MediaTransformMetadata {
  return getMediaTransformMetadata(sourceUrl) ?? { v: 1 }
}

function findMediaLinkRange(view: any, player: HTMLElement, sourceUrl: string): MediaLinkRange | null {
  const ranges = collectMediaLinkRanges(view?.state?.doc)
  const from = getDatasetNumber(player, 'mediaSourceFrom')
  const to = getDatasetNumber(player, 'mediaSourceTo')
  if (from !== null && to !== null) {
    const exact = ranges.find((range) => range.from === from && range.to === to)
    if (exact) return exact
  }
  return ranges.find((range) => range.href === sourceUrl) ?? null
}

function getLinkMarkAttrsForRange(view: any, range: MediaLinkRange): Record<string, unknown> {
  const linkMarkType = view?.state?.schema?.marks?.link
  let attrs: Record<string, unknown> = { linkUrl: range.href }
  if (!linkMarkType || typeof view?.state?.doc?.nodesBetween !== 'function') return attrs

  view.state.doc.nodesBetween(range.from, range.to, (node: any) => {
    if (!node?.isText || !Array.isArray(node.marks)) return true
    const linkMark = node.marks.find((mark: any) => mark?.type === linkMarkType)
    if (linkMark?.attrs) {
      attrs = { ...linkMark.attrs }
      return false
    }
    return true
  })
  return attrs
}

function getUpdatedRotation(current: MediaTransformMetadata, operation: ImageTransformOperation): MediaTransformMetadata['r'] {
  const rotation = current.r ?? 0
  if (operation === 'rotate-cw') {
    const next = (rotation + 90) % 360
    return next === 0 ? undefined : (next as MediaTransformMetadata['r'])
  }
  if (operation === 'rotate-ccw') {
    const next = (rotation + 270) % 360
    return next === 0 ? undefined : (next as MediaTransformMetadata['r'])
  }
  return current.r
}

function captureVideoPlayback(player: HTMLElement): VideoPlaybackSnapshot | null {
  const video = player.querySelector<HTMLVideoElement>('video.tabs-media-video')
  if (!video) return null
  return {
    currentTime: Number.isFinite(video.currentTime) ? video.currentTime : 0,
    loop: video.loop,
    paused: video.paused,
  }
}

function restoreVideoPlayback(player: HTMLElement, snapshot: VideoPlaybackSnapshot | null) {
  if (!snapshot) return
  const video = player.querySelector<HTMLVideoElement>('video.tabs-media-video')
  if (!video) return
  video.loop = snapshot.loop
  if (Number.isFinite(snapshot.currentTime) && snapshot.currentTime > 0) {
    try {
      video.currentTime = snapshot.currentTime
    } catch {
      // Browsers can reject early seeks before metadata is ready.
    }
  }
  if (!snapshot.paused) {
    void video.play().catch(() => undefined)
  }
}

export function useMediaTools({
  editorRef,
  editorEventRootRef,
  activateEditorFromEventTarget,
  commitCurrentEditorContent,
  commitActiveEditorMarkdownNow,
}: UseMediaToolsParams) {
  const [mediaTools, setMediaTools] = useState<MediaToolsState>(CLOSED_MEDIA_TOOLS_STATE)
  const activeMediaRef = useRef<HTMLElement | null>(null)
  const activeMediaLookupRef = useRef<{ sourceUrl: string; from: number | null; to: number | null } | null>(null)
  const mediaResizeRef = useRef<MediaResizeStart | null>(null)
  const mediaToolsRef = useRef(mediaTools)

  const updateMediaTools = (updater: MediaToolsState | ((previous: MediaToolsState) => MediaToolsState)) => {
    const previous = mediaToolsRef.current
    const nextMediaTools =
      typeof updater === 'function' ? (updater as (previous: MediaToolsState) => MediaToolsState)(previous) : updater
    mediaToolsRef.current = nextMediaTools
    setMediaTools(nextMediaTools)
    return nextMediaTools
  }

  const close = () => {
    if (
      !mediaToolsRef.current.visible &&
      !activeMediaRef.current &&
      !activeMediaLookupRef.current &&
      !mediaResizeRef.current
    ) {
      return
    }
    activeMediaRef.current?.classList.remove('is-media-resizing')
    activeMediaRef.current = null
    activeMediaLookupRef.current = null
    mediaResizeRef.current = null
    updateMediaTools(CLOSED_MEDIA_TOOLS_STATE)
  }

  const recoverActiveMedia = (): HTMLElement | null => {
    const lookup = activeMediaLookupRef.current
    const root = editorEventRootRef.current
    if (!lookup || !root) return null
    for (const candidate of root.querySelectorAll<HTMLElement>(`.${MEDIA_PLAYER_CLASS_NAME}.is-video`)) {
      if (isInsideReadonlyNotePreview(candidate)) continue
      const sourceUrl = getSourceUrl(candidate)
      const from = getDatasetNumber(candidate, 'mediaSourceFrom')
      const to = getDatasetNumber(candidate, 'mediaSourceTo')
      if (sourceUrl === lookup.sourceUrl || (from === lookup.from && to === lookup.to)) {
        activeMediaRef.current = candidate
        return candidate
      }
    }
    return null
  }

  const refreshPosition = (options: { closeOnMissing?: boolean } = {}) => {
    let media = activeMediaRef.current
    if (!media || !media.isConnected) {
      media = recoverActiveMedia()
    }
    const editorRoot = editorEventRootRef.current
    if (!media || !media.isConnected || (editorRoot && !editorRoot.contains(media))) {
      if (options.closeOnMissing !== false) close()
      return false
    }
    const rect = media.getBoundingClientRect()
    if (!isUsableImageToolPlacementRect(rect)) {
      if (options.closeOnMissing !== false) close()
      return false
    }
    const placement = getImageToolPlacement(rect)
    const viewportRect = media.querySelector<HTMLElement>('.tabs-media-viewport')?.getBoundingClientRect()
    const resizePlacement =
      viewportRect && isUsableImageToolPlacementRect(viewportRect)
        ? getVideoViewportResizeToolPlacement(viewportRect)
        : getVideoViewportResizeToolPlacement(rect)
    updateMediaTools((previous) => ({
      visible: true,
      menuMode: previous.visible ? previous.menuMode : 'start',
      toolbarTop: placement.toolbarTop,
      toolbarLeft: placement.toolbarLeft,
      resizeTop: resizePlacement.resizeTop,
      resizeLeft: resizePlacement.resizeLeft,
    }))
    return true
  }

  const select = (media: HTMLElement) => {
    const sourceUrl = getSourceUrl(media)
    if (isInsideReadonlyNotePreview(media) || media.dataset.mediaKind !== 'video' || getMediaKindFromUrl(sourceUrl) !== 'video') {
      close()
      return
    }
    if (!sourceUrl || !isTabsAssetMediaUrl(sourceUrl)) {
      close()
      return
    }
    activeMediaRef.current = media
    activeMediaLookupRef.current = {
      sourceUrl,
      from: getDatasetNumber(media, 'mediaSourceFrom'),
      to: getDatasetNumber(media, 'mediaSourceTo'),
    }
    activateEditorFromEventTarget(media)
    updateMediaTools((previous) => ({ ...previous, menuMode: 'start' }))
    refreshPosition()
    window.requestAnimationFrame(() => refreshPosition({ closeOnMissing: false }))
  }

  const updateSelectedMediaUrl = (nextUrl: string) => {
    let media = activeMediaRef.current?.isConnected ? activeMediaRef.current : recoverActiveMedia()
    const currentEditor = editorRef.current
    const view = getWysiwygView(currentEditor)
    if (!media || !currentEditor || !view) {
      commitCurrentEditorContent()
      return false
    }
    const sourceUrl = getSourceUrl(media)
    const range = findMediaLinkRange(view, media, sourceUrl)
    const linkMarkType = view.state.schema.marks.link
    if (!range || !linkMarkType) {
      commitCurrentEditorContent()
      return false
    }

    const playback = captureVideoPlayback(media)
    const attrs = getLinkMarkAttrsForRange(view, range)
    const transaction = view.state.tr
      .removeMark(range.from, range.to, linkMarkType)
      .addMark(range.from, range.to, linkMarkType.create({ ...attrs, linkUrl: nextUrl }))
    view.dispatch(transaction)
    commitActiveEditorMarkdownNow(currentEditor)

    media = media.isConnected ? media : recoverActiveMedia()
    if (!media) {
      commitCurrentEditorContent()
      return false
    }
    media.dataset.mediaSource = nextUrl
    activeMediaLookupRef.current = {
      sourceUrl: nextUrl,
      from: range.from,
      to: range.to,
    }
    const video = media.querySelector<HTMLVideoElement>('video.tabs-media-video')
    applyMediaMetadataToPlayer(media, nextUrl, getVideoNaturalAspectRatio(video))
    restoreVideoPlayback(media, playback)
    window.requestAnimationFrame(() => refreshPosition({ closeOnMissing: false }))
    return true
  }

  const updateSelectedMetadata = (updater: (metadata: MediaTransformMetadata) => Partial<MediaTransformMetadata> | null) => {
    const media = activeMediaRef.current?.isConnected ? activeMediaRef.current : recoverActiveMedia()
    if (!media) return false
    const sourceUrl = getSourceUrl(media)
    const currentMetadata = getCurrentMetadata(sourceUrl)
    const nextMetadata = updater(currentMetadata)
    if (!nextMetadata) return false
    return updateSelectedMediaUrl(withMediaTransformMetadata(sourceUrl, { ...currentMetadata, ...nextMetadata, v: 1 }))
  }

  const beginResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const media = activeMediaRef.current?.isConnected ? activeMediaRef.current : recoverActiveMedia()
    if (!media) return
    const sourceUrl = getSourceUrl(media)
    const video = media.querySelector<HTMLVideoElement>('video.tabs-media-video')
    const aspectRatio = getMediaViewportAspectRatio(getCurrentMetadata(sourceUrl), getVideoNaturalAspectRatio(video))
    media.classList.add('is-media-resizing')
    mediaResizeRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startWidth: media.getBoundingClientRect().width || 320,
      aspectRatio,
    }
  }

  const continueResize = (clientX: number, clientY: number) => {
    const media = activeMediaRef.current?.isConnected ? activeMediaRef.current : recoverActiveMedia()
    const resize = mediaResizeRef.current
    if (!media || !resize) return
    const nextWidth = getNextMediaResizeWidth(resize, clientX, clientY)
    media.classList.add('is-media-resizing')
    media.style.width = `${nextWidth}px`
    media.style.maxWidth = '100%'
    refreshPosition({ closeOnMissing: false })
  }

  const commitResize = () => {
    const media = activeMediaRef.current?.isConnected ? activeMediaRef.current : recoverActiveMedia()
    if (!media) {
      commitCurrentEditorContent()
      return
    }
    const displayWidth = Math.max(80, Math.round(media.getBoundingClientRect().width || 0))
    if (!displayWidth) {
      commitCurrentEditorContent()
      return
    }
    updateSelectedMetadata(() => ({ w: displayWidth }))
  }

  const openTransformMenu = () => {
    updateMediaTools((previous) => (previous.visible ? { ...previous, menuMode: 'transform' } : previous))
  }

  const returnToStartMenu = () => {
    updateMediaTools((previous) => (previous.visible ? { ...previous, menuMode: 'start' } : previous))
  }

  const transformSelectedMedia = (operation: ImageTransformOperation) => {
    return updateSelectedMetadata((currentMetadata) => {
      if (operation === 'flip-horizontal') return { fh: !currentMetadata.fh }
      if (operation === 'flip-vertical') return { fv: !currentMetadata.fv }
      return { r: getUpdatedRotation(currentMetadata, operation) }
    })
  }

  const closeIfSelectedMediaMissing = () => {
    const media = activeMediaRef.current
    const editorRoot = editorEventRootRef.current
    if (!media || (media.isConnected && (!editorRoot || editorRoot.contains(media)))) return
    if (!recoverActiveMedia()) close()
  }

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (mediaResizeRef.current) {
        continueResize(event.clientX, event.clientY)
      }
    }

    const handlePointerUp = () => {
      if (mediaResizeRef.current) {
        const media = activeMediaRef.current?.isConnected ? activeMediaRef.current : recoverActiveMedia()
        mediaResizeRef.current = null
        commitResize()
        media?.classList.remove('is-media-resizing')
      }
    }

    const listenerOptions: AddEventListenerOptions = { capture: true }
    document.addEventListener('pointermove', handlePointerMove, listenerOptions)
    document.addEventListener('pointerup', handlePointerUp, listenerOptions)
    document.addEventListener('pointercancel', handlePointerUp, listenerOptions)
    return () => {
      document.removeEventListener('pointermove', handlePointerMove, listenerOptions)
      document.removeEventListener('pointerup', handlePointerUp, listenerOptions)
      document.removeEventListener('pointercancel', handlePointerUp, listenerOptions)
    }
  }, [])

  return {
    mediaTools,
    activeMediaRef,
    close,
    closeIfSelectedMediaMissing,
    refreshPosition,
    select,
    beginResize,
    openTransformMenu,
    returnToStartMenu,
    transformSelectedMedia,
  }
}
