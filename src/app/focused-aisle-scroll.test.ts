import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  cancelScheduledAisleFocusScroll,
  scheduleFocusedAisleScroll,
  type ScheduledAisleFocusScroll,
} from './focused-aisle-scroll'

const vaultAppSource = readFileSync(new URL('./VaultApp.tsx', import.meta.url), 'utf8')

function createFrameScheduler() {
  let nextFrameId = 1
  const frames = new Map<number, FrameRequestCallback>()
  const scheduler = {
    requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
      const frameId = nextFrameId
      nextFrameId += 1
      frames.set(frameId, callback)
      return frameId
    }),
    cancelAnimationFrame: vi.fn((frameId: number) => {
      frames.delete(frameId)
    }),
  }

  return {
    scheduler,
    get frameCount() {
      return frames.size
    },
    flushNextFrame() {
      const next = frames.entries().next()
      if (next.done) return false
      const [frameId, callback] = next.value
      frames.delete(frameId)
      callback(16)
      return true
    },
  }
}

describe('focused aisle scroll scheduling', () => {
  it('runs a follow-up scroll so aisle alignment wins after cursor scrolling', () => {
    const frames = createFrameScheduler()
    const scheduled: ScheduledAisleFocusScroll = { firstFrameId: null, followupFrameId: null }
    let scrollLeft = 0
    const scrollAisleIntoHorizontalView = vi.fn(() => {
      scrollLeft = 480
      return true
    })

    scheduleFocusedAisleScroll({
      scheduled,
      aisleId: 'aisle-2',
      noteBodyId: 'body-1',
      scheduler: frames.scheduler,
      getCurrentNoteBodyId: () => 'body-1',
      hasAisle: (aisleId) => aisleId === 'aisle-2',
      scrollAisleIntoHorizontalView,
    })

    expect(frames.frameCount).toBe(1)
    expect(frames.flushNextFrame()).toBe(true)
    expect(scrollLeft).toBe(480)

    scrollLeft = 120
    expect(frames.flushNextFrame()).toBe(true)

    expect(scrollLeft).toBe(480)
    expect(scrollAisleIntoHorizontalView).toHaveBeenCalledTimes(2)
    expect(scrollAisleIntoHorizontalView).toHaveBeenNthCalledWith(1, 'aisle-2')
    expect(scrollAisleIntoHorizontalView).toHaveBeenNthCalledWith(2, 'aisle-2')
    expect(scheduled.firstFrameId).toBeNull()
    expect(scheduled.followupFrameId).toBeNull()
  })

  it('cancels pending focus scroll frames before scheduling a new target', () => {
    const frames = createFrameScheduler()
    const scheduled: ScheduledAisleFocusScroll = { firstFrameId: null, followupFrameId: null }
    const scrollAisleIntoHorizontalView = vi.fn(() => true)

    scheduleFocusedAisleScroll({
      scheduled,
      aisleId: 'aisle-1',
      noteBodyId: 'body-1',
      scheduler: frames.scheduler,
      getCurrentNoteBodyId: () => 'body-1',
      hasAisle: () => true,
      scrollAisleIntoHorizontalView,
    })
    scheduleFocusedAisleScroll({
      scheduled,
      aisleId: 'aisle-2',
      noteBodyId: 'body-1',
      scheduler: frames.scheduler,
      getCurrentNoteBodyId: () => 'body-1',
      hasAisle: () => true,
      scrollAisleIntoHorizontalView,
    })

    expect(frames.scheduler.cancelAnimationFrame).toHaveBeenCalledTimes(1)
    expect(frames.frameCount).toBe(1)
    expect(frames.flushNextFrame()).toBe(true)

    expect(scrollAisleIntoHorizontalView).toHaveBeenCalledTimes(1)
    expect(scrollAisleIntoHorizontalView).toHaveBeenCalledWith('aisle-2')
  })

  it('can cancel both scheduled frames during cleanup', () => {
    const frames = createFrameScheduler()
    const scheduled: ScheduledAisleFocusScroll = { firstFrameId: null, followupFrameId: null }
    const scrollAisleIntoHorizontalView = vi.fn(() => true)

    scheduleFocusedAisleScroll({
      scheduled,
      aisleId: 'aisle-2',
      noteBodyId: 'body-1',
      scheduler: frames.scheduler,
      getCurrentNoteBodyId: () => 'body-1',
      hasAisle: () => true,
      scrollAisleIntoHorizontalView,
    })
    expect(frames.flushNextFrame()).toBe(true)

    cancelScheduledAisleFocusScroll(scheduled, frames.scheduler)

    expect(frames.scheduler.cancelAnimationFrame).toHaveBeenCalledTimes(1)
    expect(frames.frameCount).toBe(0)
    expect(scheduled.firstFrameId).toBeNull()
    expect(scheduled.followupFrameId).toBeNull()
  })

  it('routes pending vault navigation aisle scrolls through focused aisle scroll scheduling', () => {
    expect(vaultAppSource).toContain('pendingScrollToAisleIdRef.current = resolvedLocation.aisleId || null')
    expect(vaultAppSource).toContain('scheduleAisleFocusScroll(targetNoteBodyId, resolvedLocation.aisleId)')
    expect(vaultAppSource).toContain('scheduleFocusedAisleScroll({')
    expect(vaultAppSource).toContain('scrollAislePaneIntoHorizontalView(scrollNode, aisleId)')
    expect(vaultAppSource).toContain('const queueAisleFocusScroll = useCallback')
    expect(vaultAppSource).toContain('pendingScrollToAisleIdRef.current = aisleId')
    expect(vaultAppSource).toContain('scheduleAisleFocusScroll(noteBodyId, aisleId)')
    expect(vaultAppSource).toContain('cancelScheduledAisleFocusScroll(scheduledAisleFocusScrollRef.current, window)')
  })

  it('queues focused scroll for pointer aisle activation without relying on switched active state', () => {
    const start = vaultAppSource.indexOf('onActivateAisle={(editorKey, pointer) => {')
    const end = vaultAppSource.indexOf('onResizeAisleWidth=', start)
    const activationSource = vaultAppSource.slice(start, end)

    expect(activationSource).toContain('if (pointer && targetAisleId) {')
    expect(activationSource).toContain('queueAisleFocusScroll(activeModel.noteBody.id, targetAisleId)')
    expect(activationSource).not.toContain('shouldAlignSwitchedAisle')
    expect(activationSource).not.toContain('targetAisleId !== activeAisleIdRef.current')
  })

  it('queues focused scroll when keyboard cycling changes the active aisle', () => {
    const start = vaultAppSource.indexOf('const cycleActiveAisle = useCallback')
    const end = vaultAppSource.indexOf('const runShortcutMenuOperation = useCallback', start)
    const cycleSource = vaultAppSource.slice(start, end)

    expect(cycleSource).toContain('setActiveAisleId(nextAisle.id)')
    expect(cycleSource).toContain('queueAisleFocusScroll(activeModel.noteBody.id, nextAisle.id)')
    expect(cycleSource).toContain('[activeModel, queueAisleFocusScroll, vaultEditors, renderedActiveAisleId]')
  })
})
