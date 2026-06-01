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
  viewBox?: string
  svgClassName?: string
}

export const MEDIA_CONTROL_ICON_VIEW_BOX = '0 0 24 24'

export const MEDIA_CONTROL_ICON_SPECS: Record<MediaControlIconName, MediaControlIconSpec> = {
  play: {
    className: 'tabs-media-icon-play',
    paths: [{ d: 'M8 5v14l11-7Z', fill: true }],
  },
  pause: {
    className: 'tabs-media-icon-pause',
    paths: [{ d: 'M9 6v12' }, { d: 'M15 6v12' }],
  },
  loop: {
    className: 'tabs-media-icon-loop',
    paths: [
      { d: 'm17 2 4 4-4 4' },
      { d: 'M3 11V9a4 4 0 0 1 4-4h14' },
      { d: 'm7 22-4-4 4-4' },
      { d: 'M21 13v2a4 4 0 0 1-4 4H3' },
    ],
  },
  undo: {
    className: 'tabs-media-icon-history-undo',
    viewBox: '0 0 32 32',
    svgClassName: 'editor-history-toolbar-icon',
    paths: [
      { className: 'editor-history-toolbar-arc', d: 'M9.8 16.2A9.9 9.9 0 1 1 16.8 27.3' },
      { className: 'editor-history-toolbar-head', d: 'M9.8 9.5v6.7h6.7' },
    ],
  },
  redo: {
    className: 'tabs-media-icon-history-redo',
    viewBox: '0 0 32 32',
    svgClassName: 'editor-history-toolbar-icon',
    paths: [
      { className: 'editor-history-toolbar-arc', d: 'M9.8 16.2A9.9 9.9 0 1 1 16.8 27.3' },
      { className: 'editor-history-toolbar-head', d: 'M9.8 9.5v6.7h6.7' },
    ],
  },
  'volume-muted': {
    className: 'tabs-media-icon-volume-muted',
    paths: [
      { d: 'M11 5 6 9H2v6h4l5 4V5Z' },
      { d: 'm16 9 6 6' },
      { d: 'm22 9-6 6' },
    ],
  },
  'volume-medium': {
    className: 'tabs-media-icon-volume-medium',
    paths: [
      { d: 'M11 5 6 9H2v6h4l5 4V5Z' },
      { d: 'M15.5 8.5a5 5 0 0 1 0 7' },
    ],
  },
  'volume-full': {
    className: 'tabs-media-icon-volume-full',
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
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('class', spec.svgClassName ?? `tabs-media-icon ${spec.className}`)
  svg.setAttribute('viewBox', spec.viewBox ?? MEDIA_CONTROL_ICON_VIEW_BOX)
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  for (const pathSpec of spec.paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', pathSpec.d)
    if (pathSpec.className) path.setAttribute('class', pathSpec.className)
    else if (pathSpec.fill) path.setAttribute('class', 'tabs-media-icon-fill')
    svg.append(path)
  }
  return svg
}
