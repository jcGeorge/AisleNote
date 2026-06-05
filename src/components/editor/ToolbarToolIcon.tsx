import type { ReactNode } from 'react'
import type { ToolbarToolId } from '../../types/app'

export type ToolbarIconDefinition =
  | {
      type: 'svg'
      viewBox?: string
      content: ReactNode
    }
  | {
      type: 'text'
      className?: string
      content: ReactNode
    }

const PRIMARY_STROKE_CLASS = 'toolbar-tool-icon-primary-stroke'
const SECONDARY_STROKE_CLASS = 'toolbar-tool-icon-secondary-stroke'
const PRIMARY_FILL_CLASS = 'toolbar-tool-icon-primary-fill'
const SECONDARY_FILL_CLASS = 'toolbar-tool-icon-secondary-fill'

export const TOOLBAR_ICON_COLOR_CLASSES = {
  primaryStroke: PRIMARY_STROKE_CLASS,
  secondaryStroke: SECONDARY_STROKE_CLASS,
  primaryFill: PRIMARY_FILL_CLASS,
  secondaryFill: SECONDARY_FILL_CLASS,
} as const

function joinClassNames(...classNames: Array<string | undefined>): string {
  return classNames.filter(Boolean).join(' ')
}

function primaryStroke(className?: string): string {
  return joinClassNames(PRIMARY_STROKE_CLASS, className)
}

function svgIcon(content: ReactNode, viewBox?: string): ToolbarIconDefinition {
  return { type: 'svg', viewBox, content }
}

function textIcon(content: ReactNode, className?: string): ToolbarIconDefinition {
  return { type: 'text', className, content }
}

function getToolbarIconClassName(toolId: ToolbarToolId, className = ''): string {
  const kebabToolId = toolId.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)
  return ['toolbar-tool-icon', `toolbar-tool-icon-${kebabToolId}`, className].filter(Boolean).join(' ')
}

export const TOOLBAR_ICON_DEFINITIONS = {
  copy: svgIcon(
    <>
      <path className={primaryStroke()} d="M15 2h-4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8" />
      <path className={primaryStroke()} d="M16.706 2.706A2.4 2.4 0 0 0 15 2v5a1 1 0 0 0 1 1h5a2.4 2.4 0 0 0-.706-1.706z" />
      <path className={primaryStroke()} d="M5 7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 1.732-1" />
    </>,
  ),
  frontmatter: textIcon('fm'),
  tableOfContents: svgIcon(
    <>
      <path className={primaryStroke()} d="M16 5H3" />
      <path className={primaryStroke()} d="M16 12H3" />
      <path className={primaryStroke()} d="M16 19H3" />
      <path className={primaryStroke()} d="M21 5h.01" />
      <path className={primaryStroke()} d="M21 12h.01" />
      <path className={primaryStroke()} d="M21 19h.01" />
    </>,
  ),
  aisles: svgIcon(
    <>
      <path className={primaryStroke()} d="M12 12V9a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3" />
      <path className={primaryStroke()} d="M16 20v-3a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v3" />
      <path className={primaryStroke()} d="M20 22V2" />
      <path className={primaryStroke()} d="M4 12h16" />
      <path className={primaryStroke()} d="M4 20h16" />
      <path className={primaryStroke()} d="M4 2v20" />
      <path className={primaryStroke()} d="M4 4h16" />
    </>,
  ),
  findReplace: svgIcon(
    <>
      <path className={primaryStroke()} d="m21 21-4.34-4.34" />
      <circle className={primaryStroke()} cx="11" cy="11" r="8" />
    </>,
  ),
  undo: svgIcon(
    <>
      <path className={primaryStroke()} d="M3 7v6h6" />
      <path className={primaryStroke()} d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
    </>,
  ),
  redo: svgIcon(
    <>
      <path className={primaryStroke()} d="M21 7v6h-6" />
      <path className={primaryStroke()} d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
    </>,
  ),
  heading: svgIcon(
    <>
      <path className={primaryStroke()} d="M6 12h12" />
      <path className={primaryStroke()} d="M6 20V4" />
      <path className={primaryStroke()} d="M18 20V4" />
    </>,
  ),
  bold: svgIcon(<path className={primaryStroke()} d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8" />),
  italic: svgIcon(
    <>
      <line className={primaryStroke()} x1="19" x2="10" y1="4" y2="4" />
      <line className={primaryStroke()} x1="14" x2="5" y1="20" y2="20" />
      <line className={primaryStroke()} x1="15" x2="9" y1="4" y2="20" />
    </>,
  ),
  highlight: svgIcon(
    <>
      <path className={primaryStroke()} d="m9 11-6 6v3h9l3-3" />
      <path className={primaryStroke()} d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
    </>,
  ),
  strike: svgIcon(
    <>
      <path className={primaryStroke()} d="M16 4H9a3 3 0 0 0-2.83 4" />
      <path className={primaryStroke()} d="M14 12a4 4 0 0 1 0 8H6" />
      <line className={primaryStroke()} x1="4" x2="20" y1="12" y2="12" />
    </>,
  ),
  taskList: svgIcon(
    <>
      <path className={primaryStroke()} d="M21 10.656V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12.344" />
      <path className={primaryStroke()} d="m9 11 3 3L22 4" />
    </>,
  ),
  bulletList: svgIcon(
    <>
      <path className={primaryStroke()} d="M3 5h.01" />
      <path className={primaryStroke()} d="M3 12h.01" />
      <path className={primaryStroke()} d="M3 19h.01" />
      <path className={primaryStroke()} d="M8 5h13" />
      <path className={primaryStroke()} d="M8 12h13" />
      <path className={primaryStroke()} d="M8 19h13" />
    </>,
  ),
  orderedList: svgIcon(
    <>
      <path className={primaryStroke()} d="M11 5h10" />
      <path className={primaryStroke()} d="M11 12h10" />
      <path className={primaryStroke()} d="M11 19h10" />
      <path className={primaryStroke()} d="M4 4h1v5" />
      <path className={primaryStroke()} d="M4 9h2" />
      <path className={primaryStroke()} d="M6.5 20H3.4c0-1 2.6-1.925 2.6-3.5a1.5 1.5 0 0 0-2.6-1.02" />
    </>,
  ),
  dashList: svgIcon(
    <>
      <path className={primaryStroke()} d="M3 5h4" />
      <path className={primaryStroke()} d="M3 12h4" />
      <path className={primaryStroke()} d="M3 19h4" />
      <path className={primaryStroke()} d="M11 5h10" />
      <path className={primaryStroke()} d="M11 12h10" />
      <path className={primaryStroke()} d="M11 19h10" />
    </>,
  ),
  blockQuote: svgIcon(
    <>
      <path className={primaryStroke()} d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z" />
      <path className={primaryStroke()} d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z" />
    </>,
  ),
  blockIndent: svgIcon(
    <>
      <path className={primaryStroke()} d="M21 5H11" />
      <path className={primaryStroke()} d="M21 12H11" />
      <path className={primaryStroke()} d="M21 19H11" />
      <path className={primaryStroke()} d="m3 8 4 4-4 4" />
    </>,
  ),
  removeBlockIndent: svgIcon(
    <>
      <path className={primaryStroke()} d="M21 5H11" />
      <path className={primaryStroke()} d="M21 12H11" />
      <path className={primaryStroke()} d="M21 19H11" />
      <path className={primaryStroke()} d="m7 8-4 4 4 4" />
    </>,
  ),
  hr: svgIcon(<path className={primaryStroke()} d="M5 12h14" />),
  link: svgIcon(
    <>
      <path className={primaryStroke()} d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path className={primaryStroke()} d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </>,
  ),
  image: svgIcon(
    <>
      <rect className={primaryStroke()} width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle className={primaryStroke()} cx="9" cy="9" r="2" />
      <path className={primaryStroke()} d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </>,
  ),
  table: svgIcon(
    <>
      <path className={primaryStroke()} d="M12 3v17a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1H3" />
      <path className={primaryStroke()} d="M16 19h6" />
      <path className={primaryStroke()} d="M19 22v-6" />
    </>,
  ),
  code: svgIcon(
    <>
      <path className={primaryStroke()} d="m16 18 6-6-6-6" />
      <path className={primaryStroke()} d="m8 6-6 6 6 6" />
    </>,
  ),
  codeBlock: svgIcon(
    <>
      <path className={primaryStroke()} d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1" />
      <path className={primaryStroke()} d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1" />
    </>,
  ),
  clear: svgIcon(
    <>
      <path className={primaryStroke()} d="M10 5a2 2 0 0 0-1.344.519l-6.328 5.74a1 1 0 0 0 0 1.481l6.328 5.741A2 2 0 0 0 10 19h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" />
      <path className={primaryStroke()} d="m12 9 6 6" />
      <path className={primaryStroke()} d="m18 9-6 6" />
    </>,
  ),
} satisfies Record<ToolbarToolId, ToolbarIconDefinition>

export type ToolbarToolIconProps = {
  toolId: ToolbarToolId
  active?: boolean
  className?: string
}

export function ToolbarToolIcon({ toolId, className = '' }: ToolbarToolIconProps) {
  const definition = TOOLBAR_ICON_DEFINITIONS[toolId]

  if (definition.type === 'text') {
    return (
      <span
        className={getToolbarIconClassName(toolId, joinClassNames('toolbar-tool-text-icon', definition.className, className))}
        aria-hidden="true"
      >
        {definition.content}
      </span>
    )
  }

  return (
    <svg
      className={getToolbarIconClassName(toolId, className)}
      viewBox={definition.viewBox ?? '0 0 24 24'}
      aria-hidden="true"
      focusable="false"
    >
      {definition.content}
    </svg>
  )
}
