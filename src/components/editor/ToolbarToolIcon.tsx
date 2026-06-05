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

function secondaryStroke(className?: string): string {
  return joinClassNames(SECONDARY_STROKE_CLASS, className)
}

function secondaryFill(className?: string): string {
  return joinClassNames(SECONDARY_FILL_CLASS, className)
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
      <path className={secondaryStroke()} d="M8 7.5V5.6c0-1.1.9-2 2-2h7.2c1.1 0 2 .9 2 2v10.1c0 1.1-.9 2-2 2h-1.8" />
      <path className={primaryStroke()} d="M4.8 8.2c0-1.1.9-2 2-2H14c1.1 0 2 .9 2 2v10.2c0 1.1-.9 2-2 2H6.8c-1.1 0-2-.9-2-2Z" />
      <path className={primaryStroke()} d="M12.2 6.2v4h3.8" />
    </>,
  ),
  frontmatter: textIcon('fm'),
  tableOfContents: svgIcon(
    <>
      <path className={primaryStroke()} d="M8 6h10.5" />
      <path className={primaryStroke()} d="M8 10h8.5" />
      <path className={primaryStroke()} d="M8 14h6.5" />
      <path className={primaryStroke()} d="M8 18h10.5" />
      <path className={secondaryStroke()} d="M4.8 6h.1" />
      <path className={secondaryStroke()} d="M4.8 10h.1" />
      <path className={secondaryStroke()} d="M4.8 14h.1" />
      <path className={secondaryStroke()} d="M4.8 18h.1" />
    </>,
  ),
  aisles: svgIcon(
    <>
      <path className={primaryStroke('toolbar-tool-icon-heavy')} d="M8 5.6 28 2.4v27.2L8 24.4Z" />
      <path className={primaryStroke()} d="M8 13.2h20" />
      <path className={primaryStroke()} d="M8 22.1l20 4" />
      <path className={secondaryStroke('toolbar-tool-icon-heavy')} d="M11.4 9.9h5v3.3h-5z" />
      <path className={secondaryStroke('toolbar-tool-icon-heavy')} d="M16.4 8.7h6.1v4.5" />
      <path className={secondaryStroke('toolbar-tool-icon-heavy')} d="M11.4 18.1h4.8v5.2" />
      <path className={secondaryStroke('toolbar-tool-icon-heavy')} d="M16.2 17.5h5v6.7" />
      <path className={secondaryStroke('toolbar-tool-icon-heavy')} d="M21.2 17h4.8v8.2" />
    </>,
    '0 0 36 32',
  ),
  findReplace: svgIcon(
    <>
      <path className={primaryStroke()} d="M10.5 5.3a5.2 5.2 0 1 0 0 10.4 5.2 5.2 0 0 0 0-10.4Z" />
      <path className={primaryStroke()} d="m14.5 14.5 4.7 4.7" />
      <path className={secondaryStroke()} d="M15.9 6.8h3.3v3.3" />
      <path className={secondaryStroke()} d="m19.2 6.8-4.4 4.4" />
    </>,
  ),
  undo: svgIcon(
    <>
      <path className={primaryStroke('toolbar-tool-icon-heavy')} d="M8.5 8.2h6a5.6 5.6 0 1 1-4.2 9.3" />
      <path className={primaryStroke('toolbar-tool-icon-heavy')} d="M8.5 4.8v3.4h3.4" />
    </>,
  ),
  redo: svgIcon(
    <>
      <path className={primaryStroke('toolbar-tool-icon-heavy')} d="M15.5 8.2h-6a5.6 5.6 0 1 0 4.2 9.3" />
      <path className={primaryStroke('toolbar-tool-icon-heavy')} d="M15.5 4.8v3.4h-3.4" />
    </>,
  ),
  heading: textIcon('H'),
  bold: textIcon('B', 'toolbar-tool-text-bold'),
  italic: textIcon('I', 'toolbar-tool-text-italic'),
  highlight: textIcon(
    <>
      <span className="toolbar-tool-text-primary">H</span>
      <span className="toolbar-tool-text-accent" />
    </>,
    'toolbar-tool-text-highlight',
  ),
  strike: textIcon(
    <>
      <span className="toolbar-tool-text-primary">S</span>
      <span className="toolbar-tool-text-strike-line" />
    </>,
    'toolbar-tool-text-strike',
  ),
  taskList: svgIcon(
    <>
      <rect className={secondaryFill()} x="4.4" y="4.9" width="4.6" height="4.6" rx="1" />
      <path className={primaryStroke()} d="m5.4 7.2 1.1 1.1 2-2" />
      <path className={primaryStroke()} d="M11.5 7.2h7.4" />
      <rect className={primaryStroke()} x="4.4" y="14.5" width="4.6" height="4.6" rx="1" />
      <path className={primaryStroke()} d="M11.5 16.8h7.4" />
    </>,
  ),
  bulletList: svgIcon(
    <>
      <path className={primaryStroke('toolbar-tool-icon-dot')} d="M5.5 7h.1" />
      <path className={primaryStroke('toolbar-tool-icon-dot')} d="M5.5 12h.1" />
      <path className={primaryStroke('toolbar-tool-icon-dot')} d="M5.5 17h.1" />
      <path className={primaryStroke()} d="M9.2 7h9.3" />
      <path className={primaryStroke()} d="M9.2 12h9.3" />
      <path className={primaryStroke()} d="M9.2 17h9.3" />
    </>,
  ),
  orderedList: svgIcon(
    <>
      <text className="toolbar-tool-icon-text-primary toolbar-tool-icon-list-number" x="4.3" y="8.6">1</text>
      <text className="toolbar-tool-icon-text-primary toolbar-tool-icon-list-number" x="4.1" y="17.9">2</text>
      <path className={primaryStroke()} d="M9.2 7h9.3" />
      <path className={primaryStroke()} d="M9.2 12h9.3" />
      <path className={primaryStroke()} d="M9.2 17h9.3" />
    </>,
  ),
  dashList: svgIcon(
    <>
      <path className={primaryStroke()} d="M4.8 7h2.4" />
      <path className={primaryStroke()} d="M4.8 12h2.4" />
      <path className={primaryStroke()} d="M4.8 17h2.4" />
      <path className={primaryStroke()} d="M10 7h9" />
      <path className={primaryStroke()} d="M10 12h9" />
      <path className={primaryStroke()} d="M10 17h9" />
    </>,
  ),
  blockQuote: svgIcon(
    <>
      <path className={primaryStroke()} d="M7.8 8.2c-1.8.8-2.8 2-2.8 3.9v3.3h4.2v-4.1H7.1c.1-.8.6-1.4 1.5-1.9Z" />
      <path className={primaryStroke()} d="M15.4 8.2c-1.8.8-2.8 2-2.8 3.9v3.3h4.2v-4.1h-2.1c.1-.8.6-1.4 1.5-1.9Z" />
    </>,
  ),
  blockIndent: svgIcon(
    <>
      <path className={primaryStroke()} d="M4.6 6h14.8" />
      <path className={primaryStroke()} d="M12 12h7.4" />
      <path className={primaryStroke()} d="M4.6 18h14.8" />
      <path className={secondaryStroke('toolbar-tool-icon-heavy')} d="m5.2 9.4 3 2.6-3 2.6" />
    </>,
  ),
  removeBlockIndent: svgIcon(
    <>
      <path className={primaryStroke()} d="M4.6 6h14.8" />
      <path className={primaryStroke()} d="M12 12h7.4" />
      <path className={primaryStroke()} d="M4.6 18h14.8" />
      <path className={secondaryStroke('toolbar-tool-icon-heavy')} d="m8.2 9.4-3 2.6 3 2.6" />
    </>,
  ),
  hr: svgIcon(<path className={primaryStroke('toolbar-tool-icon-heavy')} d="M5 12h14" />),
  link: svgIcon(
    <>
      <path className={primaryStroke()} d="M9.8 13.8 8.4 15.2a3.5 3.5 0 0 1-5-5L6 7.6a3.5 3.5 0 0 1 5 0" />
      <path className={primaryStroke()} d="m14.2 10.2 1.4-1.4a3.5 3.5 0 0 1 5 5L18 16.4a3.5 3.5 0 0 1-5 0" />
      <path className={secondaryStroke()} d="m8.8 15.2 6.4-6.4" />
    </>,
  ),
  image: svgIcon(
    <>
      <rect className={primaryStroke()} x="4.3" y="5" width="15.4" height="14" rx="1.8" />
      <path className={secondaryFill()} d="m5.7 17 4.5-4.6 3.2 3.2 1.8-1.9 3.2 3.3Z" />
      <path className={secondaryStroke()} d="m5.7 17 4.5-4.6 3.2 3.2 1.8-1.9 3.2 3.3" />
      <circle className={secondaryFill()} cx="15.5" cy="8.8" r="1.5" />
    </>,
  ),
  table: svgIcon(
    <>
      <rect className={secondaryFill()} x="5" y="5" width="14" height="14" rx="1.2" />
      <rect className={primaryStroke()} x="5" y="5" width="14" height="14" rx="1.2" />
      <path className={primaryStroke()} d="M5 10h14" />
      <path className={primaryStroke()} d="M5 14.5h14" />
      <path className={primaryStroke()} d="M10 5v14" />
      <path className={primaryStroke()} d="M14.5 5v14" />
    </>,
  ),
  code: svgIcon(
    <>
      <path className={primaryStroke('toolbar-tool-icon-heavy')} d="m9.2 8-4 4 4 4" />
      <path className={primaryStroke('toolbar-tool-icon-heavy')} d="m14.8 8 4 4-4 4" />
      <path className={secondaryStroke()} d="m12.8 6.8-1.6 10.4" />
    </>,
  ),
  codeBlock: textIcon(
    <>
      <span className="toolbar-tool-text-primary">&lt;/&gt;</span>
      <span className="toolbar-tool-text-secondary">CB</span>
    </>,
    'toolbar-tool-text-code-block',
  ),
  clear: svgIcon(
    <>
      <path className={primaryStroke()} d="M9 6.5h10.2c1 0 1.8.8 1.8 1.8v7.4c0 1-.8 1.8-1.8 1.8H9L3.4 12Z" />
      <path className={secondaryStroke('toolbar-tool-icon-heavy')} d="m12 9.5 5 5" />
      <path className={secondaryStroke('toolbar-tool-icon-heavy')} d="m17 9.5-5 5" />
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
