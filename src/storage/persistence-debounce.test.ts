import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPersistenceDebounceController } from './persistence-debounce'

afterEach(() => {
  vi.useRealTimers()
})

describe('createPersistenceDebounceController', () => {
  it('coalesces rapid updates into one debounced durable save', () => {
    vi.useFakeTimers()
    const serialize = vi.fn((value: { body: string }) => JSON.stringify(value))
    const save = vi.fn()
    const controller = createPersistenceDebounceController({
      debounceMs: 1_000,
      maxWaitMs: 5_000,
      serialize,
      save,
    })

    controller.schedule({ body: 'a' })
    vi.advanceTimersByTime(600)
    controller.schedule({ body: 'ab' })
    vi.advanceTimersByTime(999)

    expect(serialize).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)

    expect(serialize).toHaveBeenCalledOnce()
    expect(save).toHaveBeenCalledWith('{"body":"ab"}', { snapshotMode: 'debounced' })
    expect(controller.hasPending()).toBe(false)
  })

  it('writes without a recovery snapshot at max wait and snapshots after the quiet period', () => {
    vi.useFakeTimers()
    const serialize = vi.fn((value: { body: string }) => JSON.stringify(value))
    const save = vi.fn()
    const controller = createPersistenceDebounceController({
      debounceMs: 1_000,
      maxWaitMs: 3_000,
      serialize,
      save,
    })

    controller.schedule({ body: 'a' })
    vi.advanceTimersByTime(900)
    controller.schedule({ body: 'ab' })
    vi.advanceTimersByTime(900)
    controller.schedule({ body: 'abc' })
    vi.advanceTimersByTime(900)
    controller.schedule({ body: 'abcd' })
    vi.advanceTimersByTime(300)

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenLastCalledWith('{"body":"abcd"}', { snapshotMode: 'skip' })
    expect(controller.hasPending()).toBe(true)

    vi.advanceTimersByTime(700)

    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith('{"body":"abcd"}', { snapshotMode: 'debounced' })
    expect(controller.hasPending()).toBe(false)
  })

  it('flushes pending updates synchronously and clears scheduled saves', () => {
    vi.useFakeTimers()
    const save = vi.fn()
    const controller = createPersistenceDebounceController({
      debounceMs: 1_000,
      maxWaitMs: 5_000,
      serialize: (value: { body: string }) => JSON.stringify(value),
      save,
    })

    controller.schedule({ body: 'draft' })
    controller.flush()
    vi.runAllTimers()

    expect(save).toHaveBeenCalledOnce()
    expect(save).toHaveBeenCalledWith('{"body":"draft"}', { snapshotMode: 'force', preferSync: true })
    expect(controller.hasPending()).toBe(false)
  })

  it('does not serialize image-heavy states until the durable save fires', () => {
    vi.useFakeTimers()
    const imageMarkdown = `![hero](data:image/png;base64,${'a'.repeat(100_000)})`
    const serialize = vi.fn((value: { noteBodies: Array<{ aisles: Array<{ markdown: string }> }> }) =>
      JSON.stringify(value),
    )
    const save = vi.fn()
    const controller = createPersistenceDebounceController({
      debounceMs: 1_000,
      maxWaitMs: 5_000,
      serialize,
      save,
    })

    for (let index = 0; index < 20; index += 1) {
      controller.schedule({
        noteBodies: [{ aisles: [{ markdown: `${imageMarkdown}\n${index}` }] }],
      })
    }

    expect(serialize).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1_000)

    expect(serialize).toHaveBeenCalledOnce()
    expect(save).toHaveBeenCalledOnce()
    expect(JSON.parse(save.mock.calls[0][0]).noteBodies[0].aisles[0].markdown).toContain('\n19')
  })
})
