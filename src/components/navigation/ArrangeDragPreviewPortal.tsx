import { useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type ArrangeDragPreviewPosition = {
  currentX: number
  currentY: number
  offsetX: number
  offsetY: number
  width: number
  height: number
}

type PreviewPortalScope = {
  className: string
  style: CSSProperties
  target: HTMLElement
}

const PREVIEW_CSS_VARIABLES = [
  '--tab-button-scale',
  '--tab-control-height',
  '--tab-arrange-preview-bg',
  '--tab-arrange-preview-border',
  '--tab-arrange-preview-text',
  '--tab-arrange-preview-shadow',
  '--subtab-arrange-preview-border',
  '--subtab-arrange-preview-shadow',
  '--space-arrange-preview-bg',
  '--space-arrange-preview-border',
  '--space-arrange-preview-text',
  '--space-arrange-preview-shadow',
  '--trash-parent-text',
  '--trash-parent-bg',
  '--trash-parent-border',
  '--trash-parent-selected-text',
  '--trash-parent-selected-bg',
  '--trash-parent-selected-border',
]

export function getArrangeDragPreviewStyle(preview: ArrangeDragPreviewPosition): CSSProperties {
  return {
    left: `${preview.currentX - preview.offsetX}px`,
    top: `${preview.currentY - preview.offsetY}px`,
    width: `${preview.width}px`,
    height: `${preview.height}px`,
  }
}

function getPreviewPortalScope(): PreviewPortalScope | null {
  if (typeof document === 'undefined' || !document.body) return null
  const appShell = document.querySelector<HTMLElement>('.app-shell')
  if (!appShell || typeof window === 'undefined') {
    return {
      className: 'arrange-drag-preview-portal-scope',
      style: {},
      target: document.body,
    }
  }

  const computed = window.getComputedStyle(appShell)
  const style = PREVIEW_CSS_VARIABLES.reduce<Record<string, string>>((nextStyle, variableName) => {
    const value = computed.getPropertyValue(variableName)
    if (value) nextStyle[variableName] = value
    return nextStyle
  }, {})

  return {
    className: `arrange-drag-preview-portal-scope ${appShell.className}`,
    style: style as CSSProperties,
    target: document.body,
  }
}

export function ArrangeDragPreviewPortal({ children }: { children: ReactNode }) {
  const [scope] = useState(getPreviewPortalScope)
  if (!scope) return <>{children}</>

  return createPortal(
    <div className={scope.className} style={scope.style}>
      {children}
    </div>,
    scope.target,
  )
}
