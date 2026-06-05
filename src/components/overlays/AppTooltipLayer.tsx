/* eslint-disable react-refresh/only-export-components */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'

export const APP_TOOLTIP_HOVER_DELAY_MS = 320
const APP_TOOLTIP_EDGE_GAP = 8
const APP_TOOLTIP_TARGET_GAP = 8

type TooltipTrigger = 'focus' | 'pointer'
type TooltipPlacement = 'top' | 'bottom'

type TooltipState = {
  target: HTMLElement
  text: string
  position: TooltipPosition | null
}

export type TooltipRect = Pick<DOMRect, 'top' | 'right' | 'bottom' | 'left' | 'width' | 'height'>

export type TooltipPosition = {
  left: number
  top: number
  placement: TooltipPlacement
}

export function getAppTooltipDelay(trigger: TooltipTrigger): number {
  return trigger === 'pointer' ? APP_TOOLTIP_HOVER_DELAY_MS : 0
}

export function getAppTooltipTextFromElement(element: Element | null): string {
  if (typeof HTMLElement === 'undefined') return ''
  if (!(element instanceof HTMLElement)) return ''
  return element.dataset.appTooltip?.trim() ?? ''
}

export function getAppTooltipPosition(
  targetRect: TooltipRect,
  tooltipRect: TooltipRect,
  viewportWidth: number,
  viewportHeight: number,
): TooltipPosition {
  const tooltipWidth = tooltipRect.width || 1
  const tooltipHeight = tooltipRect.height || 1
  const centeredLeft = targetRect.left + targetRect.width / 2 - tooltipWidth / 2
  const maxLeft = Math.max(APP_TOOLTIP_EDGE_GAP, viewportWidth - tooltipWidth - APP_TOOLTIP_EDGE_GAP)
  const left = Math.min(maxLeft, Math.max(APP_TOOLTIP_EDGE_GAP, centeredLeft))
  const topPlacementTop = targetRect.top - tooltipHeight - APP_TOOLTIP_TARGET_GAP
  const bottomPlacementTop = targetRect.bottom + APP_TOOLTIP_TARGET_GAP
  const canPlaceAbove = topPlacementTop >= APP_TOOLTIP_EDGE_GAP
  const placement: TooltipPlacement = canPlaceAbove ? 'top' : 'bottom'
  const unclampedTop = canPlaceAbove ? topPlacementTop : bottomPlacementTop
  const maxTop = Math.max(APP_TOOLTIP_EDGE_GAP, viewportHeight - tooltipHeight - APP_TOOLTIP_EDGE_GAP)
  const top = Math.min(maxTop, Math.max(APP_TOOLTIP_EDGE_GAP, unclampedTop))

  return { left, top, placement }
}

function getTooltipTargetFromEventTarget(target: EventTarget | null): HTMLElement | null {
  if (typeof Element === 'undefined') return null
  if (!(target instanceof Element)) return null
  const candidate = target.closest<HTMLElement>('[data-app-tooltip]')
  if (!candidate) return null
  if (!getAppTooltipTextFromElement(candidate)) return null
  if (candidate.closest('.tooltips-disabled')) return null
  return candidate
}

export function AppTooltipLayer({ disabled = false }: { disabled?: boolean }) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const hoverTimerRef = useRef<number | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current === null) return
    window.clearTimeout(hoverTimerRef.current)
    hoverTimerRef.current = null
  }, [])

  const hideTooltip = useCallback(() => {
    clearHoverTimer()
    setTooltip(null)
  }, [clearHoverTimer])

  const showTooltip = useCallback((target: HTMLElement) => {
    const text = getAppTooltipTextFromElement(target)
    if (!text) return
    setTooltip({ target, text, position: null })
  }, [])

  const scheduleTooltip = useCallback((
    target: HTMLElement,
    trigger: TooltipTrigger,
  ) => {
    if (disabled) return
    clearHoverTimer()
    const delay = getAppTooltipDelay(trigger)
    if (delay === 0) {
      showTooltip(target)
      return
    }
    hoverTimerRef.current = window.setTimeout(() => {
      hoverTimerRef.current = null
      showTooltip(target)
    }, delay)
  }, [clearHoverTimer, disabled, showTooltip])

  useEffect(() => {
    if (disabled) hideTooltip()
  }, [disabled, hideTooltip])

  useEffect(() => {
    if (typeof document === 'undefined') return undefined

    const handlePointerOver = (event: PointerEvent) => {
      const target = getTooltipTargetFromEventTarget(event.target)
      if (!target) return
      scheduleTooltip(target, 'pointer')
    }

    const handlePointerOut = (event: PointerEvent) => {
      const target = getTooltipTargetFromEventTarget(event.target)
      if (!target) return
      const relatedTarget = event.relatedTarget instanceof Node ? event.relatedTarget : null
      if (relatedTarget && target.contains(relatedTarget)) return
      hideTooltip()
    }

    const handleFocusIn = (event: FocusEvent) => {
      const target = getTooltipTargetFromEventTarget(event.target)
      if (!target) return
      scheduleTooltip(target, 'focus')
    }

    const handleFocusOut = (event: FocusEvent) => {
      const target = getTooltipTargetFromEventTarget(event.target)
      if (!target) return
      hideTooltip()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hideTooltip()
    }

    document.addEventListener('pointerover', handlePointerOver)
    document.addEventListener('pointerout', handlePointerOut)
    document.addEventListener('focusin', handleFocusIn)
    document.addEventListener('focusout', handleFocusOut)
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('scroll', hideTooltip, true)
    window.addEventListener('resize', hideTooltip)

    return () => {
      document.removeEventListener('pointerover', handlePointerOver)
      document.removeEventListener('pointerout', handlePointerOut)
      document.removeEventListener('focusin', handleFocusIn)
      document.removeEventListener('focusout', handleFocusOut)
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('scroll', hideTooltip, true)
      window.removeEventListener('resize', hideTooltip)
      clearHoverTimer()
    }
  }, [clearHoverTimer, hideTooltip, scheduleTooltip])

  useEffect(() => {
    if (!tooltip || typeof document === 'undefined') return undefined
    if (typeof MutationObserver === 'undefined') return undefined
    const observer = new MutationObserver(() => {
      if (!tooltip.target.isConnected) hideTooltip()
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [hideTooltip, tooltip])

  useLayoutEffect(() => {
    if (!tooltip) return
    const tooltipNode = tooltipRef.current
    if (!tooltipNode || !tooltip.target.isConnected) {
      hideTooltip()
      return
    }
    const position = getAppTooltipPosition(
      tooltip.target.getBoundingClientRect(),
      tooltipNode.getBoundingClientRect(),
      window.innerWidth,
      window.innerHeight,
    )
    setTooltip((current) => {
      if (!current || current.target !== tooltip.target) return current
      if (
        current.position &&
        current.position.left === position.left &&
        current.position.top === position.top &&
        current.position.placement === position.placement
      ) {
        return current
      }
      return { ...current, position }
    })
  }, [hideTooltip, tooltip?.target, tooltip?.text])

  return (
    <div
      className="app-tooltip-layer"
      aria-hidden="true"
    >
      {tooltip && (
        <div
          ref={tooltipRef}
          className={`app-tooltip app-tooltip-${tooltip.position?.placement ?? 'top'} ${
            tooltip.position ? 'is-positioned' : ''
          }`}
          style={{
            left: tooltip.position?.left ?? 0,
            top: tooltip.position?.top ?? 0,
          } as CSSProperties}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  )
}
