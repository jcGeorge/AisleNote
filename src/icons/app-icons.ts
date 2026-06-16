export const GENERAL_ICON_IDS = [
  'aisleRight',
  'play',
  'pause',
  'rotateClockwise',
  'rotateCounterClockwise',
  'flipX',
  'flipY',
  'minimize',
  'maximize',
  'settings',
  'filter',
  'plus',
  'cornerRightDown',
  'cornerRightUp',
  'cornerLeftDown',
  'cornerLeftUp',
  'arrowLeft',
  'arrowRight',
  'arrowLeftFromLine',
  'arrowRightFromLine',
] as const

export type GeneralIconId = (typeof GENERAL_ICON_IDS)[number]

type AppIconShape =
  | { tag: 'path'; d: string }
  | { tag: 'rect'; x: string; y: string; width: string; height: string; rx?: string; ry?: string }
  | { tag: 'line'; x1: string; y1: string; x2: string; y2: string }
  | { tag: 'circle'; cx: string; cy: string; r: string }

export type AppIconDefinition = {
  shapes: AppIconShape[]
}

export const APP_ICON_VIEW_BOX = '0 0 24 24'
export const APP_ICON_STROKE_WIDTH = '2'
export const APP_ICON_FLIP_HORIZONTAL_TRANSFORM = 'translate(24 0) scale(-1 1)'

export const APP_ICON_DEFINITIONS = {
  aisleRight: {
    shapes: [
      { tag: 'path', d: 'M2 7v10' },
      { tag: 'path', d: 'M6 5v14' },
      { tag: 'rect', width: '12', height: '18', x: '10', y: '3', rx: '2' },
    ],
  },
  play: {
    shapes: [{ tag: 'path', d: 'M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z' }],
  },
  pause: {
    shapes: [
      { tag: 'rect', x: '14', y: '3', width: '5', height: '18', rx: '1' },
      { tag: 'rect', x: '5', y: '3', width: '5', height: '18', rx: '1' },
    ],
  },
  rotateClockwise: {
    shapes: [
      { tag: 'path', d: 'M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8' },
      { tag: 'path', d: 'M21 3v5h-5' },
    ],
  },
  rotateCounterClockwise: {
    shapes: [
      { tag: 'path', d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' },
      { tag: 'path', d: 'M3 3v5h5' },
    ],
  },
  flipX: {
    shapes: [
      { tag: 'path', d: 'm3 7 5 5-5 5V7' },
      { tag: 'path', d: 'm21 7-5 5 5 5V7' },
      { tag: 'path', d: 'M12 20v2' },
      { tag: 'path', d: 'M12 14v2' },
      { tag: 'path', d: 'M12 8v2' },
      { tag: 'path', d: 'M12 2v2' },
    ],
  },
  flipY: {
    shapes: [
      { tag: 'path', d: 'm17 3-5 5-5-5h10' },
      { tag: 'path', d: 'm17 21-5-5-5 5h10' },
      { tag: 'path', d: 'M4 12H2' },
      { tag: 'path', d: 'M10 12H8' },
      { tag: 'path', d: 'M16 12h-2' },
      { tag: 'path', d: 'M22 12h-2' },
    ],
  },
  minimize: {
    shapes: [{ tag: 'path', d: 'm18 15-6-6-6 6' }],
  },
  maximize: {
    shapes: [{ tag: 'path', d: 'm6 9 6 6 6-6' }],
  },
  settings: {
    shapes: [
      { tag: 'path', d: 'M9.67 4.13 10.4 2h3.2l.73 2.13a8.2 8.2 0 0 1 1.34.78l2.21-.47 1.6 2.77-1.48 1.66c.08.38.13.76.13 1.13s-.05.75-.13 1.13l1.48 1.66-1.6 2.77-2.21-.47a8.2 8.2 0 0 1-1.34.78L13.6 18h-3.2l-.73-2.13a8.2 8.2 0 0 1-1.34-.78l-2.21.47-1.6-2.77L6 11.13A5.6 5.6 0 0 1 5.87 10c0-.37.05-.75.13-1.13L4.52 7.21l1.6-2.77 2.21.47a8.2 8.2 0 0 1 1.34-.78' },
      { tag: 'circle', cx: '12', cy: '10', r: '3' },
      { tag: 'path', d: 'M4 22h16' },
    ],
  },
  filter: {
    shapes: [
      { tag: 'path', d: 'm3 16 4 4 4-4' },
      { tag: 'path', d: 'M7 20V4' },
      { tag: 'path', d: 'M11 4h10' },
      { tag: 'path', d: 'M11 8h7' },
      { tag: 'path', d: 'M11 12h4' },
    ],
  },
  plus: {
    shapes: [
      { tag: 'path', d: 'M5 12h14' },
      { tag: 'path', d: 'M12 5v14' },
    ],
  },
  cornerRightDown: {
    shapes: [
      { tag: 'path', d: 'm10 15 5 5 5-5' },
      { tag: 'path', d: 'M4 4h7a4 4 0 0 1 4 4v12' },
    ],
  },
  cornerRightUp: {
    shapes: [
      { tag: 'path', d: 'm10 9 5-5 5 5' },
      { tag: 'path', d: 'M4 20h7a4 4 0 0 0 4-4V4' },
    ],
  },
  cornerLeftDown: {
    shapes: [
      { tag: 'path', d: 'm14 15-5 5-5-5' },
      { tag: 'path', d: 'M20 4h-7a4 4 0 0 0-4 4v12' },
    ],
  },
  cornerLeftUp: {
    shapes: [
      { tag: 'path', d: 'M14 9 9 4 4 9' },
      { tag: 'path', d: 'M20 20h-7a4 4 0 0 1-4-4V4' },
    ],
  },
  arrowLeft: {
    shapes: [
      { tag: 'path', d: 'M6 8L2 12L6 16' },
      { tag: 'path', d: 'M2 12H22' },
    ],
  },
  arrowRight: {
    shapes: [
      { tag: 'path', d: 'M18 8L22 12L18 16' },
      { tag: 'path', d: 'M2 12H22' },
    ],
  },
  arrowLeftFromLine: {
    shapes: [
      { tag: 'path', d: 'm9 6-6 6 6 6' },
      { tag: 'path', d: 'M3 12h14' },
      { tag: 'path', d: 'M21 19V5' },
    ],
  },
  arrowRightFromLine: {
    shapes: [
      { tag: 'path', d: 'M3 5v14' },
      { tag: 'path', d: 'M21 12H7' },
      { tag: 'path', d: 'm15 18 6-6-6-6' },
    ],
  },
} satisfies Record<GeneralIconId, AppIconDefinition>

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)
}

export function getAppIconClassName(iconId: GeneralIconId, className = ''): string {
  return ['app-icon', `app-icon-${toKebabCase(iconId)}`, className].filter(Boolean).join(' ')
}

function createSvgElement<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  if (typeof document.createElementNS === 'function') {
    return document.createElementNS('http://www.w3.org/2000/svg', tag)
  }
  return document.createElement(tag) as unknown as SVGElementTagNameMap[K]
}

export function createAppIconElement(iconId: GeneralIconId, options: { className?: string; flipHorizontal?: boolean } = {}): SVGSVGElement {
  const icon = APP_ICON_DEFINITIONS[iconId]
  const svg = createSvgElement('svg')
  svg.setAttribute('class', getAppIconClassName(iconId, options.className))
  svg.setAttribute('viewBox', APP_ICON_VIEW_BOX)
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', APP_ICON_STROKE_WIDTH)
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  svg.setAttribute('data-app-icon', iconId)

  const shapeParent = options.flipHorizontal ? createSvgElement('g') : svg
  if (options.flipHorizontal) {
    shapeParent.setAttribute('transform', APP_ICON_FLIP_HORIZONTAL_TRANSFORM)
    svg.append(shapeParent)
  }

  for (const shape of icon.shapes) {
    const element = createSvgElement(shape.tag)
    Object.entries(shape).forEach(([key, value]) => {
      if (key !== 'tag' && value !== undefined) element.setAttribute(key, value)
    })
    shapeParent.append(element)
  }

  return svg
}
