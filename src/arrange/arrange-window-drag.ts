export type ArrangeWindowDragPoint = {
  clientX: number
  clientY: number
}

type ArrangeWindowDragPointerEvent = {
  buttons: number
  clientX: number
  clientY: number
  preventDefault: () => void
  stopPropagation: () => void
}

type ArrangeWindowDragListener = ((event: ArrangeWindowDragPointerEvent) => void) | (() => void)

export type ArrangeWindowDragEventTarget = {
  addEventListener: (type: 'pointermove' | 'pointerup' | 'pointercancel' | 'blur', listener: ArrangeWindowDragListener, options?: boolean) => void
  removeEventListener: (type: 'pointermove' | 'pointerup' | 'pointercancel' | 'blur', listener: ArrangeWindowDragListener, options?: boolean) => void
}

export type ArrangeWindowDragHandlers = {
  isActive: () => boolean
  getCurrentPoint: () => ArrangeWindowDragPoint | null
  onMove: (point: ArrangeWindowDragPoint) => void
  onFinish: (point: ArrangeWindowDragPoint) => void
  onCancel: () => void
  onMarkDragged?: () => void
}

export function attachArrangeWindowDragListeners(
  target: ArrangeWindowDragEventTarget,
  handlers: ArrangeWindowDragHandlers,
) {
  let lastPoint = handlers.getCurrentPoint()

  const handleWindowPointerMove = (event: ArrangeWindowDragPointerEvent) => {
    if (!handlers.isActive()) return
    handlers.onMarkDragged?.()

    if (event.buttons === 0) {
      handlers.onFinish(lastPoint ?? handlers.getCurrentPoint() ?? { clientX: event.clientX, clientY: event.clientY })
      return
    }

    event.preventDefault()
    lastPoint = { clientX: event.clientX, clientY: event.clientY }
    handlers.onMove(lastPoint)
  }

  const handleWindowPointerUp = (event: ArrangeWindowDragPointerEvent) => {
    if (!handlers.isActive()) return
    event.preventDefault()
    event.stopPropagation()
    lastPoint = { clientX: event.clientX, clientY: event.clientY }
    handlers.onFinish(lastPoint)
  }

  const handleWindowPointerCancel = () => {
    if (!handlers.isActive()) return
    handlers.onCancel()
  }

  target.addEventListener('pointermove', handleWindowPointerMove, true)
  target.addEventListener('pointerup', handleWindowPointerUp, true)
  target.addEventListener('pointercancel', handleWindowPointerCancel, true)
  target.addEventListener('blur', handleWindowPointerCancel, true)

  return () => {
    target.removeEventListener('pointermove', handleWindowPointerMove, true)
    target.removeEventListener('pointerup', handleWindowPointerUp, true)
    target.removeEventListener('pointercancel', handleWindowPointerCancel, true)
    target.removeEventListener('blur', handleWindowPointerCancel, true)
  }
}
