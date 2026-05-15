import { describe, expect, it, vi } from 'vitest'
import { createAppStateCoordinator, LOAD_FAILED_SAVE_ERROR } from './app-state-coordinator.mjs'

describe('Electron app state coordinator', () => {
  it('sets revision 1 for an initial serialized load', () => {
    const coordinator = createAppStateCoordinator({
      userDataPath: '/tmp/tabs',
      load: () => ({ ok: true, serializedState: '{"theme":"dawn"}', source: 'hybrid' }),
      save: vi.fn(),
    })

    expect(coordinator.getLoadResult()).toEqual({
      ok: true,
      serializedState: '{"theme":"dawn"}',
      source: 'hybrid',
      revision: 1,
    })
  })

  it('allows first save from an empty profile at revision 0', () => {
    const save = vi.fn()
    const coordinator = createAppStateCoordinator({
      userDataPath: '/tmp/tabs',
      load: () => ({ ok: true, serializedState: null, source: 'empty' }),
      save,
    })

    expect(coordinator.saveRevisionedState({ serializedState: '{"theme":"dawn"}', baseRevision: 0 })).toEqual({
      ok: true,
      serializedState: '{"theme":"dawn"}',
      revision: 1,
    })
    expect(save).toHaveBeenCalledWith('/tmp/tabs', '{"theme":"dawn"}')
  })

  it('increments revision after a matching save', () => {
    const coordinator = createAppStateCoordinator({
      userDataPath: '/tmp/tabs',
      load: () => ({ ok: true, serializedState: '{"theme":"dawn"}', source: 'hybrid' }),
      save: vi.fn(),
    })

    expect(coordinator.saveRevisionedState({ serializedState: '{"theme":"light"}', baseRevision: 1 })).toEqual({
      ok: true,
      serializedState: '{"theme":"light"}',
      revision: 2,
    })
    expect(coordinator.getLoadResult().revision).toBe(2)
  })

  it('rejects stale revision saves without persisting', () => {
    const save = vi.fn()
    const coordinator = createAppStateCoordinator({
      userDataPath: '/tmp/tabs',
      load: () => ({ ok: true, serializedState: '{"theme":"dawn"}', source: 'hybrid' }),
      save,
    })

    expect(coordinator.saveRevisionedState({ serializedState: '{"theme":"light"}', baseRevision: 0 })).toEqual({
      ok: false,
      reason: 'stale-revision',
      error: 'App state revision is stale.',
      currentRevision: 1,
      serializedState: '{"theme":"dawn"}',
    })
    expect(save).not.toHaveBeenCalled()
  })

  it('blocks saves after a failed load', () => {
    const save = vi.fn()
    const coordinator = createAppStateCoordinator({
      userDataPath: '/tmp/tabs',
      load: () => ({
        ok: false,
        serializedState: null,
        source: 'hybrid',
        error: 'Existing app state could not be loaded.',
      }),
      save,
    })

    expect(coordinator.saveRevisionedState({ serializedState: '{"theme":"dawn"}', baseRevision: 0 })).toEqual({
      ok: false,
      reason: 'load-failed',
      error: LOAD_FAILED_SAVE_ERROR,
      currentRevision: 0,
      serializedState: null,
    })
    expect(save).not.toHaveBeenCalled()
  })
})
