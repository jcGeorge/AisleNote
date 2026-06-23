import { createAppIconElement, type GeneralIconId } from '../icons/app-icons'

export type MediaControlIconName =
  | 'play'
  | 'pause'
  | 'loop'
  | 'undo'
  | 'redo'
  | 'volume-muted'
  | 'volume-medium'
  | 'volume-full'

export type MediaControlIconPath = {
  d: string
  fill?: boolean
  className?: string
}

export type MediaControlIconSpec = {
  className: string
  paths: MediaControlIconPath[]
  appIconId?: GeneralIconId
  viewBox?: string
  svgClassName?: string
}

export const MEDIA_CONTROL_ICON_VIEW_BOX = '0 0 24 24'

export const MEDIA_CONTROL_ICON_SPECS: Record<MediaControlIconName, MediaControlIconSpec> = {
  play: {
    className: 'aislenote-media-icon-play',
    appIconId: 'play',
    paths: [],
  },
  pause: {
    className: 'aislenote-media-icon-pause',
    appIconId: 'pause',
    paths: [],
  },
  loop: {
    className: 'aislenote-media-icon-loop',
    paths: [
      { d: 'm17 2 4 4-4 4' },
      { d: 'M3 11V9a4 4 0 0 1 4-4h14' },
      { d: 'm7 22-4-4 4-4' },
      { d: 'M21 13v2a4 4 0 0 1-4 4H3' },
    ],
  },
  undo: {
    className: 'aislenote-media-icon-history-undo',
    paths: [
      { d: 'M3 7v6h6' },
      { d: 'M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13' },
    ],
  },
  redo: {
    className: 'aislenote-media-icon-history-redo',
    paths: [
      { d: 'M21 7v6h-6' },
      { d: 'M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7' },
    ],
  },
  'volume-muted': {
    className: 'aislenote-media-icon-volume-muted',
    paths: [
      { d: 'M11 5 6 9H2v6h4l5 4V5Z' },
      { d: 'm16 9 6 6' },
      { d: 'm22 9-6 6' },
    ],
  },
  'volume-medium': {
    className: 'aislenote-media-icon-volume-medium',
    paths: [
      { d: 'M11 5 6 9H2v6h4l5 4V5Z' },
      { d: 'M15.5 8.5a5 5 0 0 1 0 7' },
    ],
  },
  'volume-full': {
    className: 'aislenote-media-icon-volume-full',
    paths: [
      { d: 'M11 5 6 9H2v6h4l5 4V5Z' },
      { d: 'M15.5 8.5a5 5 0 0 1 0 7' },
      { d: 'M19.1 4.9a10 10 0 0 1 0 14.2' },
    ],
  },
}

export function getMediaVolumeIconName(volumePercent: number): MediaControlIconName {
  if (!Number.isFinite(volumePercent) || volumePercent <= 0) return 'volume-muted'
  return volumePercent >= 100 ? 'volume-full' : 'volume-medium'
}

export function createMediaControlIconElement(iconName: MediaControlIconName): SVGSVGElement {
  const spec = MEDIA_CONTROL_ICON_SPECS[iconName]
  if (spec.appIconId) return createAppIconElement(spec.appIconId, { className: `aislenote-media-icon ${spec.className}` })

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('class', spec.svgClassName ?? `aislenote-media-icon ${spec.className}`)
  svg.setAttribute('viewBox', spec.viewBox ?? MEDIA_CONTROL_ICON_VIEW_BOX)
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  for (const pathSpec of spec.paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', pathSpec.d)
    if (pathSpec.className) path.setAttribute('class', pathSpec.className)
    else if (pathSpec.fill) path.setAttribute('class', 'aislenote-media-icon-fill')
    svg.append(path)
  }
  return svg
}
