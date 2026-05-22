import { useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type PreviewPortalScope = {
  className: string
  style: CSSProperties
  target: HTMLElement
}

const PREVIEW_CSS_VARIABLES = [
  '--tab-button-scale',
  '--tab-control-height',
  '--domain-rail-accent',
  '--domain-rail-text',
  '--domain-rail-bg',
  '--domain-rail-border',
  '--domain-rail-hover-text',
  '--domain-rail-hover-bg',
  '--domain-rail-hover-border',
  '--domain-rail-selected-text',
  '--domain-rail-selected-bg',
  '--domain-rail-selected-border',
  '--space-rail-accent',
  '--space-rail-text',
  '--space-rail-bg',
  '--space-rail-border',
  '--space-rail-hover-text',
  '--space-rail-hover-bg',
  '--space-rail-hover-border',
  '--space-rail-selected-text',
  '--space-rail-selected-bg',
  '--space-rail-selected-border',
  '--parent-rail-accent',
  '--parent-rail-text',
  '--parent-rail-bg',
  '--parent-rail-border',
  '--parent-rail-hover-text',
  '--parent-rail-hover-bg',
  '--parent-rail-hover-border',
  '--parent-rail-selected-text',
  '--parent-rail-selected-bg',
  '--parent-rail-selected-border',
  '--subtab-rail-accent',
  '--subtab-rail-text',
  '--subtab-rail-bg',
  '--subtab-rail-border',
  '--subtab-rail-hover-text',
  '--subtab-rail-hover-bg',
  '--subtab-rail-hover-border',
  '--subtab-rail-selected-text',
  '--subtab-rail-selected-bg',
  '--subtab-rail-selected-border',
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
