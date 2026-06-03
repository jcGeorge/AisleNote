import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import {
  attachArrangeWindowDragListeners,
  type ArrangeWindowDragEventTarget,
  type ArrangeWindowDragPoint,
} from './arrange-window-drag'

type FakeEventType = 'pointermove' | 'pointerup' | 'pointercancel' | 'blur'
type FakePointerEvent = {
  buttons: number
  clientX: number
  clientY: number
  preventDefault: ReturnType<typeof vi.fn>
  stopPropagation: ReturnType<typeof vi.fn>
}
type FakeListener = Parameters<ArrangeWindowDragEventTarget['addEventListener']>[1]

class FakeWindowDragTarget implements ArrangeWindowDragEventTarget {
  listeners = new Map<FakeEventType, Set<FakeListener>>()
  addEventListener = vi.fn((type: FakeEventType, listener: FakeListener, options?: boolean) => {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)?.add(listener)
    expect(options).toBe(true)
  })
  removeEventListener = vi.fn((type: FakeEventType, listener: FakeListener, options?: boolean) => {
    this.listeners.get(type)?.delete(listener)
    expect(options).toBe(true)
  })

  emit(type: FakeEventType, event = makePointerEvent()) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event)
    }
    return event
  }
}

function makePointerEvent(overrides: Partial<FakePointerEvent> = {}): FakePointerEvent {
  return {
    buttons: 1,
    clientX: 20,
    clientY: 30,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...overrides,
  }
}

function makeHandlers(options: { active?: boolean; currentPoint?: ArrangeWindowDragPoint | null } = {}) {
  return {
    isActive: vi.fn(() => options.active ?? true),
    getCurrentPoint: vi.fn(() => options.currentPoint ?? null),
    onMove: vi.fn(),
    onFinish: vi.fn(),
    onCancel: vi.fn(),
    onMarkDragged: vi.fn(),
  }
}

describe('arrange window drag listeners', () => {
  it('finishes on pointerup with event coordinates and suppresses the native event', () => {
    const target = new FakeWindowDragTarget()
    const handlers = makeHandlers()
    attachArrangeWindowDragListeners(target, handlers)
    const event = target.emit('pointerup', makePointerEvent({ clientX: 42, clientY: 64 }))

    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(event.stopPropagation).toHaveBeenCalledTimes(1)
    expect(handlers.onFinish).toHaveBeenCalledWith({ clientX: 42, clientY: 64 })
    expect(handlers.onMove).not.toHaveBeenCalled()
    expect(handlers.onCancel).not.toHaveBeenCalled()
  })

  it('moves while the pointer button is held', () => {
    const target = new FakeWindowDragTarget()
    const handlers = makeHandlers()
    attachArrangeWindowDragListeners(target, handlers)
    const event = target.emit('pointermove', makePointerEvent({ buttons: 1, clientX: 24, clientY: 36 }))

    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(handlers.onMarkDragged).toHaveBeenCalledTimes(1)
    expect(handlers.onMove).toHaveBeenCalledWith({ clientX: 24, clientY: 36 })
    expect(handlers.onFinish).not.toHaveBeenCalled()
  })

  it('finishes on pointermove without pressed buttons using the last drag coordinates', () => {
    const target = new FakeWindowDragTarget()
    const handlers = makeHandlers()
    attachArrangeWindowDragListeners(target, handlers)

    target.emit('pointermove', makePointerEvent({ buttons: 1, clientX: 31, clientY: 47 }))
    const releaseEvent = target.emit('pointermove', makePointerEvent({ buttons: 0, clientX: 90, clientY: 120 }))

    expect(releaseEvent.preventDefault).not.toHaveBeenCalled()
    expect(handlers.onFinish).toHaveBeenCalledWith({ clientX: 31, clientY: 47 })
  })

  it('falls back to the current drag point when a release is detected before any window move', () => {
    const target = new FakeWindowDragTarget()
    const handlers = makeHandlers({ currentPoint: { clientX: 12, clientY: 18 } })
    attachArrangeWindowDragListeners(target, handlers)

    target.emit('pointermove', makePointerEvent({ buttons: 0, clientX: 90, clientY: 120 }))

    expect(handlers.onFinish).toHaveBeenCalledWith({ clientX: 12, clientY: 18 })
  })

  it('cancels on pointercancel and blur', () => {
    const target = new FakeWindowDragTarget()
    const handlers = makeHandlers()
    attachArrangeWindowDragListeners(target, handlers)

    target.emit('pointercancel')
    target.emit('blur')

    expect(handlers.onCancel).toHaveBeenCalledTimes(2)
    expect(handlers.onFinish).not.toHaveBeenCalled()
  })

  it('removes every window listener during cleanup', () => {
    const target = new FakeWindowDragTarget()
    const cleanup = attachArrangeWindowDragListeners(target, makeHandlers())

    cleanup()

    expect(target.removeEventListener).toHaveBeenCalledTimes(4)
    for (const type of ['pointermove', 'pointerup', 'pointercancel', 'blur'] as const) {
      expect(target.listeners.get(type)?.size ?? 0).toBe(0)
    }
  })

  it('wires domain, space, and tab drags through the shared window listener helper', () => {
    const arrangeDir = dirname(fileURLToPath(import.meta.url))
    const source = readFileSync(join(arrangeDir, 'useArrangeMode.ts'), 'utf8')

    expect(source).toContain("import { attachArrangeWindowDragListeners } from './arrange-window-drag'")
    expect(source).toContain('const attachDomainDragWindowListeners = () => {')
    expect(source).toContain('const attachSpaceDragWindowListeners = () => {')
    expect(source).toContain('const attachTabDragWindowListeners = () => {')
    expect(source).toContain('attachDomainDragWindowListeners()')
    expect(source).toContain('attachSpaceDragWindowListeners()')
    expect(source).toContain('attachTabDragWindowListeners()')
    expect(source.match(/detachArrangeDragWindowListeners\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(5)
  })
})
