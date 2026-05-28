import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  getAisleHorizontalScrollbarGeometry,
  getScrollLeftForAisleHorizontalScrollbarPointer,
  getScrollLeftForAisleHorizontalScrollbarThumb,
  type AisleHorizontalScrollbarGeometry,
} from './aisle-horizontal-scroll'

const HIDDEN_AISLE_SCROLLBAR_GEOMETRY: AisleHorizontalScrollbarGeometry = {
  visible: false,
  thumbLeft: 0,
  thumbWidth: 0,
  maxScrollLeft: 0,
  maxThumbLeft: 0,
  trackWidth: 0,
}

function aisleScrollbarGeometryEqual(left: AisleHorizontalScrollbarGeometry, right: AisleHorizontalScrollbarGeometry) {
  return (
    left.visible === right.visible &&
    left.thumbLeft === right.thumbLeft &&
    left.thumbWidth === right.thumbWidth &&
    left.maxScrollLeft === right.maxScrollLeft &&
    left.maxThumbLeft === right.maxThumbLeft &&
    left.trackWidth === right.trackWidth
  )
}

type AisleHorizontalScrollbarProps = {
  scrollNode: HTMLDivElement | null
  aisleCount: number
  ariaLabel?: string
  rootClassName?: string
  onScrollLeftChange?: (scrollLeft: number) => void
}

export function AisleHorizontalScrollbar({
  scrollNode,
  aisleCount,
  ariaLabel = 'Scroll aisles horizontally',
  rootClassName = '',
  onScrollLeftChange = () => undefined,
}: AisleHorizontalScrollbarProps) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const dragStateRef = useRef<{
    pointerId: number
    startClientX: number
    startThumbLeft: number
    geometry: AisleHorizontalScrollbarGeometry
  } | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const [geometry, setGeometry] = useState<AisleHorizontalScrollbarGeometry>(HIDDEN_AISLE_SCROLLBAR_GEOMETRY)

  const readGeometry = useCallback(() => {
    if (!scrollNode) return HIDDEN_AISLE_SCROLLBAR_GEOMETRY
    const trackNode = trackRef.current
    const trackRectWidth = trackNode?.getBoundingClientRect().width ?? 0
    const trackWidth = trackNode?.clientWidth || trackRectWidth || scrollNode.clientWidth
    return getAisleHorizontalScrollbarGeometry({
      scrollLeft: scrollNode.scrollLeft,
      scrollWidth: scrollNode.scrollWidth,
      clientWidth: scrollNode.clientWidth,
      trackWidth,
    })
  }, [scrollNode])

  const updateGeometryNow = useCallback(() => {
    animationFrameRef.current = null
    const nextGeometry = readGeometry()
    setGeometry((currentGeometry) =>
      aisleScrollbarGeometryEqual(currentGeometry, nextGeometry) ? currentGeometry : nextGeometry,
    )
  }, [readGeometry])

  const scheduleGeometryUpdate = useCallback(() => {
    if (animationFrameRef.current !== null) return
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      updateGeometryNow()
      return
    }
    animationFrameRef.current = window.requestAnimationFrame(updateGeometryNow)
  }, [updateGeometryNow])

  const setScrollLeft = useCallback(
    (nextScrollLeft: number) => {
      if (!scrollNode) return
      const maxScrollLeft = Math.max(0, scrollNode.scrollWidth - scrollNode.clientWidth)
      scrollNode.scrollLeft = Math.min(Math.max(nextScrollLeft, 0), maxScrollLeft)
      onScrollLeftChange(scrollNode.scrollLeft)
      scheduleGeometryUpdate()
    },
    [onScrollLeftChange, scheduleGeometryUpdate, scrollNode],
  )

  useEffect(() => {
    if (!scrollNode) {
      setGeometry(HIDDEN_AISLE_SCROLLBAR_GEOMETRY)
      return undefined
    }

    let resizeObserver: ResizeObserver | null = null
    let mutationObserver: MutationObserver | null = null

    const observeScrollChildren = () => {
      if (!resizeObserver) return
      for (const child of Array.from(scrollNode.children)) {
        if (child instanceof Element) {
          resizeObserver.observe(child)
        }
      }
    }

    scrollNode.addEventListener('scroll', scheduleGeometryUpdate, { passive: true })

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(scheduleGeometryUpdate)
      resizeObserver.observe(scrollNode)
      if (trackRef.current) {
        resizeObserver.observe(trackRef.current)
      }
      observeScrollChildren()
    }

    if (typeof MutationObserver !== 'undefined') {
      mutationObserver = new MutationObserver(() => {
        observeScrollChildren()
        scheduleGeometryUpdate()
      })
      mutationObserver.observe(scrollNode, { childList: true })
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', scheduleGeometryUpdate)
    }

    scheduleGeometryUpdate()

    return () => {
      scrollNode.removeEventListener('scroll', scheduleGeometryUpdate)
      resizeObserver?.disconnect()
      mutationObserver?.disconnect()
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', scheduleGeometryUpdate)
      }
      if (animationFrameRef.current !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [aisleCount, scheduleGeometryUpdate, scrollNode])

  const handleTrackPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || !scrollNode || !trackRef.current || !geometry.visible) return
      if ((event.target as HTMLElement).closest('.note-aisle-horizontal-scrollbar-thumb')) return
      event.preventDefault()
      const trackRect = trackRef.current.getBoundingClientRect()
      const nextScrollLeft = getScrollLeftForAisleHorizontalScrollbarPointer({
        pointerX: event.clientX,
        trackLeft: trackRect.left,
        trackWidth: trackRect.width,
        thumbWidth: geometry.thumbWidth,
        scrollWidth: scrollNode.scrollWidth,
        clientWidth: scrollNode.clientWidth,
      })
      setScrollLeft(nextScrollLeft)
    },
    [geometry.thumbWidth, geometry.visible, scrollNode, setScrollLeft],
  )

  const handleThumbPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || !scrollNode || !geometry.visible) return
      event.preventDefault()
      event.stopPropagation()
      dragStateRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startThumbLeft: geometry.thumbLeft,
        geometry,
      }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [geometry, scrollNode],
  )

  const handleThumbPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current
      if (!dragState || dragState.pointerId !== event.pointerId) return
      event.preventDefault()
      const nextThumbLeft = dragState.startThumbLeft + event.clientX - dragState.startClientX
      const nextScrollLeft = getScrollLeftForAisleHorizontalScrollbarThumb({
        thumbLeft: nextThumbLeft,
        maxThumbLeft: dragState.geometry.maxThumbLeft,
        maxScrollLeft: dragState.geometry.maxScrollLeft,
      })
      setScrollLeft(nextScrollLeft)
    },
    [setScrollLeft],
  )

  const handleThumbPointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current
    if (!dragState || dragState.pointerId !== event.pointerId) return
    dragStateRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [])

  const handleTrackKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!scrollNode || !geometry.visible) return
      const lineStep = 48
      let nextScrollLeft: number | null = null

      if (event.key === 'ArrowLeft') {
        nextScrollLeft = scrollNode.scrollLeft - lineStep
      } else if (event.key === 'ArrowRight') {
        nextScrollLeft = scrollNode.scrollLeft + lineStep
      } else if (event.key === 'PageUp') {
        nextScrollLeft = scrollNode.scrollLeft - scrollNode.clientWidth
      } else if (event.key === 'PageDown') {
        nextScrollLeft = scrollNode.scrollLeft + scrollNode.clientWidth
      } else if (event.key === 'Home') {
        nextScrollLeft = 0
      } else if (event.key === 'End') {
        nextScrollLeft = geometry.maxScrollLeft
      }

      if (nextScrollLeft === null) return
      event.preventDefault()
      setScrollLeft(nextScrollLeft)
    },
    [geometry.maxScrollLeft, geometry.visible, scrollNode, setScrollLeft],
  )

  const extraRootClassName = rootClassName ? ` ${rootClassName}` : ''

  return (
    <div
      className={`note-aisle-horizontal-scrollbar${extraRootClassName} ${
        geometry.visible ? 'is-visible' : 'is-hidden'
      }`}
      aria-hidden={geometry.visible ? undefined : true}
    >
      <div
        ref={trackRef}
        className="note-aisle-horizontal-scrollbar-track"
        role="scrollbar"
        aria-label={ariaLabel}
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={Math.round(geometry.maxScrollLeft)}
        aria-valuenow={Math.round(scrollNode?.scrollLeft ?? 0)}
        tabIndex={geometry.visible ? 0 : -1}
        onPointerDown={handleTrackPointerDown}
        onKeyDown={handleTrackKeyDown}
      >
        <div
          className="note-aisle-horizontal-scrollbar-thumb"
          style={{
            width: `${geometry.thumbWidth}px`,
            transform: `translateX(${geometry.thumbLeft}px)`,
          }}
          onPointerDown={handleThumbPointerDown}
          onPointerMove={handleThumbPointerMove}
          onPointerUp={handleThumbPointerEnd}
          onPointerCancel={handleThumbPointerEnd}
        />
      </div>
    </div>
  )
}
