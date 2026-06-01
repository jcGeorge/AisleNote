export type ScheduledAisleFocusScroll = {
  firstFrameId: number | null
  followupFrameId: number | null
}

type AnimationFrameScheduler = {
  requestAnimationFrame: (callback: FrameRequestCallback) => number
  cancelAnimationFrame: (handle: number) => void
}

type FocusedAisleScrollOptions = {
  scheduled: ScheduledAisleFocusScroll
  aisleId: string
  noteBodyId: string
  scheduler: AnimationFrameScheduler
  getCurrentNoteBodyId: () => string
  hasAisle: (aisleId: string) => boolean
  scrollAisleIntoHorizontalView: (aisleId: string) => boolean
  onInvalidAisle?: (aisleId: string) => void
}

export function cancelScheduledAisleFocusScroll(
  scheduled: ScheduledAisleFocusScroll,
  scheduler: Pick<AnimationFrameScheduler, 'cancelAnimationFrame'>,
) {
  if (scheduled.firstFrameId !== null) {
    scheduler.cancelAnimationFrame(scheduled.firstFrameId)
    scheduled.firstFrameId = null
  }
  if (scheduled.followupFrameId !== null) {
    scheduler.cancelAnimationFrame(scheduled.followupFrameId)
    scheduled.followupFrameId = null
  }
}

export function scheduleFocusedAisleScroll({
  scheduled,
  aisleId,
  noteBodyId,
  scheduler,
  getCurrentNoteBodyId,
  hasAisle,
  scrollAisleIntoHorizontalView,
  onInvalidAisle,
}: FocusedAisleScrollOptions) {
  cancelScheduledAisleFocusScroll(scheduled, scheduler)

  const canAttemptScroll = () => {
    if (!noteBodyId || getCurrentNoteBodyId() !== noteBodyId) return false
    if (hasAisle(aisleId)) return true
    onInvalidAisle?.(aisleId)
    return false
  }

  scheduled.firstFrameId = scheduler.requestAnimationFrame(() => {
    scheduled.firstFrameId = null
    if (!canAttemptScroll()) return

    scrollAisleIntoHorizontalView(aisleId)
    scheduled.followupFrameId = scheduler.requestAnimationFrame(() => {
      scheduled.followupFrameId = null
      if (!canAttemptScroll()) return
      scrollAisleIntoHorizontalView(aisleId)
    })
  })
}
