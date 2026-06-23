import {
  getMediaTransformMetadata,
  type MediaTransformMetadata,
} from './media-metadata'
import { MEDIA_PLAYER_CLASS_NAME, type MediaKind } from './media-utils'

export const DEFAULT_VIDEO_ASPECT_RATIO = 16 / 9

type StyleMap = Record<string, string>

function hasMediaTransform(metadata: MediaTransformMetadata | null) {
  return Boolean(metadata?.r || metadata?.fh || metadata?.fv)
}

function getSafeNaturalAspectRatio(naturalAspectRatio = DEFAULT_VIDEO_ASPECT_RATIO): number {
  return Number.isFinite(naturalAspectRatio) && naturalAspectRatio > 0 ? naturalAspectRatio : DEFAULT_VIDEO_ASPECT_RATIO
}

export function getMediaPlayerClassName(kind: MediaKind, metadata: MediaTransformMetadata | null): string {
  return [
    MEDIA_PLAYER_CLASS_NAME,
    `is-${kind}`,
    metadata?.w ? 'has-media-width' : '',
    hasMediaTransform(metadata) ? 'has-media-transform' : '',
  ]
    .filter(Boolean)
    .join(' ')
}

export function getMediaRootStyle(metadata: MediaTransformMetadata | null): StyleMap {
  if (!metadata?.w) return {}
  return {
    width: `${metadata.w}px`,
    maxWidth: '100%',
  }
}

export function getMediaViewportAspectRatio(
  metadata: MediaTransformMetadata | null,
  naturalAspectRatio = DEFAULT_VIDEO_ASPECT_RATIO,
): number {
  const naturalRatio = getSafeNaturalAspectRatio(naturalAspectRatio)
  return metadata?.r === 90 || metadata?.r === 270 ? 1 / naturalRatio : naturalRatio
}

export function getMediaViewportStyle(
  metadata: MediaTransformMetadata | null,
  naturalAspectRatio = DEFAULT_VIDEO_ASPECT_RATIO,
): StyleMap {
  return {
    aspectRatio: String(getMediaViewportAspectRatio(metadata, naturalAspectRatio)),
  }
}

export function getMediaFrameStyle(
  metadata: MediaTransformMetadata | null,
  naturalAspectRatio = DEFAULT_VIDEO_ASPECT_RATIO,
): StyleMap {
  const transforms: string[] = []
  if (metadata?.r) transforms.push(`rotate(${metadata.r}deg)`)
  if (metadata?.fh) transforms.push('scaleX(-1)')
  if (metadata?.fv) transforms.push('scaleY(-1)')
  if (metadata?.r === 90 || metadata?.r === 270) {
    const naturalRatio = getSafeNaturalAspectRatio(naturalAspectRatio)
    return {
      width: `${naturalRatio * 100}%`,
      height: `${(1 / naturalRatio) * 100}%`,
      top: '50%',
      left: '50%',
      transform: ['translate(-50%, -50%)', ...transforms].join(' '),
      transformOrigin: 'center center',
    }
  }
  if (transforms.length === 0) return {}
  return {
    transform: transforms.join(' '),
    transformOrigin: 'center center',
  }
}

export function getMediaVideoStyle(metadata: MediaTransformMetadata | null): StyleMap {
  void metadata
  return {}
}

export function getVideoNaturalAspectRatio(video: HTMLVideoElement | null | undefined): number {
  if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) return DEFAULT_VIDEO_ASPECT_RATIO
  return video.videoWidth / video.videoHeight
}

function assignStyles(element: HTMLElement, styles: StyleMap) {
  Object.assign(element.style, styles)
}

export function applyMediaMetadataToPlayer(
  wrapper: HTMLElement,
  sourceUrl: string,
  naturalAspectRatio = DEFAULT_VIDEO_ASPECT_RATIO,
) {
  const metadata = getMediaTransformMetadata(sourceUrl)
  wrapper.className = getMediaPlayerClassName((wrapper.dataset.mediaKind as MediaKind | undefined) ?? 'video', metadata)
  wrapper.removeAttribute('style')
  assignStyles(wrapper, getMediaRootStyle(metadata))

  const viewport = wrapper.querySelector<HTMLElement>('.aislenote-media-viewport')
  const frame = wrapper.querySelector<HTMLElement>('.aislenote-media-frame')
  const video = wrapper.querySelector<HTMLVideoElement>('video.aislenote-media-video')
  if (viewport) {
    viewport.removeAttribute('style')
    assignStyles(viewport, getMediaViewportStyle(metadata, naturalAspectRatio))
  }
  if (frame) {
    frame.removeAttribute('style')
    assignStyles(frame, getMediaFrameStyle(metadata, naturalAspectRatio))
  }
  if (video) {
    video.removeAttribute('style')
    assignStyles(video, getMediaVideoStyle(metadata))
  }
}
