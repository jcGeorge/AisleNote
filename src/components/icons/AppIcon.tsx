import { createElement } from 'react'
import {
  APP_ICON_DEFINITIONS,
  APP_ICON_FLIP_HORIZONTAL_TRANSFORM,
  APP_ICON_STROKE_WIDTH,
  APP_ICON_VIEW_BOX,
  getAppIconClassName,
  type GeneralIconId,
} from '../../icons/app-icons'

type AppIconProps = {
  iconId: GeneralIconId
  className?: string
  flipHorizontal?: boolean
}

export function AppIcon({ iconId, className = '', flipHorizontal = false }: AppIconProps) {
  const shapes = APP_ICON_DEFINITIONS[iconId].shapes.map((shape, index) => {
    const { tag, ...attrs } = shape
    return createElement(tag, { key: `${iconId}-${index}`, ...attrs })
  })

  return createElement(
    'svg',
    {
      className: getAppIconClassName(iconId, className),
      viewBox: APP_ICON_VIEW_BOX,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: Number(APP_ICON_STROKE_WIDTH),
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': 'true',
      focusable: 'false',
      'data-app-icon': iconId,
    },
    flipHorizontal ? createElement('g', { transform: APP_ICON_FLIP_HORIZONTAL_TRANSFORM }, shapes) : shapes,
  )
}
