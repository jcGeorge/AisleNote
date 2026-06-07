import { describe, expect, it, vi } from 'vitest'
import {
  createAppStateCoordinator,
  createSerializedStateFingerprint,
  LOAD_FAILED_SAVE_ERROR,
} from './app-state-coordinator.mjs'

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
    expect(save).toHaveBeenCalledWith('/tmp/tabs', '{"theme":"dawn"}', { userDataPath: '/tmp/tabs' })
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

  it('remembers canonical post-save state when disk normalization changes the renderer payload', () => {
    let loadedSerializedState = '{"theme":"dawn"}'
    const coordinator = createAppStateCoordinator({
      userDataPath: '/tmp/tabs',
      load: () => ({ ok: true, serializedState: loadedSerializedState, source: 'hybrid' }),
      save: vi.fn((_profileRootPath, _serializedState) => {
        loadedSerializedState = '{"theme":"light","normalized":true}'
      }),
      canonicalizeAfterSave: true,
    })

    expect(coordinator.saveRevisionedState({ serializedState: '{"theme":"light"}', baseRevision: 1 })).toEqual({
      ok: true,
      serializedState: '{"theme":"light"}',
      revision: 2,
    })

    expect(coordinator.reloadProfileRoot('/tmp/tabs')).toEqual({
      ok: true,
      serializedState: '{"theme":"light","normalized":true}',
      source: 'hybrid',
      revision: 2,
      unchanged: true,
      externalEchoIgnored: true,
    })
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

  it('reloads valid external profile changes and increments revision', () => {
    let serializedState = '{"theme":"dawn"}'
    const coordinator = createAppStateCoordinator({
      userDataPath: '/tmp/tabs',
      load: () => ({ ok: true, serializedState, source: 'hybrid' }),
      save: vi.fn(),
    })

    serializedState = '{"theme":"light"}'

    expect(coordinator.reloadProfileRoot('/tmp/tabs')).toEqual({
      ok: true,
      serializedState: '{"theme":"light"}',
      source: 'hybrid',
      revision: 2,
    })
  })

  it('keeps revision stable when a reload returns identical serialized state', () => {
    const coordinator = createAppStateCoordinator({
      userDataPath: '/tmp/tabs',
      load: () => ({ ok: true, serializedState: '{"theme":"dawn"}', source: 'hybrid' }),
      save: vi.fn(),
    })

    expect(coordinator.reloadProfileRoot('/tmp/tabs')).toEqual({
      ok: true,
      serializedState: '{"theme":"dawn"}',
      source: 'hybrid',
      revision: 1,
      unchanged: true,
    })
    expect(coordinator.getLoadResult().revision).toBe(1)
  })

  it('treats reordered JSON as the same state fingerprint', () => {
    expect(createSerializedStateFingerprint('{"b":2,"a":1}')).toBe(createSerializedStateFingerprint('{"a":1,"b":2}'))
  })

  it('ignores recent app-save echoes without reverting the current coordinator state', () => {
    let now = 1_000
    let loadedSerializedState = '{"theme":"initial"}'
    const coordinator = createAppStateCoordinator({
      userDataPath: '/tmp/tabs',
      load: () => ({ ok: true, serializedState: loadedSerializedState, source: 'hybrid' }),
      save: vi.fn((_profileRootPath, serializedState) => {
        loadedSerializedState = serializedState
      }),
      now: () => now,
      recentAppSaveEchoTtlMs: 10_000,
    })

    expect(coordinator.saveRevisionedState({ serializedState: '{"theme":"dawn"}', baseRevision: 1 })).toMatchObject({
      ok: true,
      revision: 2,
    })
    expect(coordinator.saveRevisionedState({ serializedState: '{"theme":"light"}', baseRevision: 2 })).toMatchObject({
      ok: true,
      revision: 3,
    })

    loadedSerializedState = '{"theme":"dawn"}'
    now += 1_000

    expect(coordinator.reloadProfileRoot('/tmp/tabs')).toEqual({
      ok: true,
      serializedState: '{"theme":"light"}',
      source: 'hybrid',
      revision: 3,
      unchanged: true,
      externalEchoIgnored: true,
    })
  })

  it('loads expired app-save echoes as external changes', () => {
    let now = 1_000
    let loadedSerializedState = '{"theme":"initial"}'
    const coordinator = createAppStateCoordinator({
      userDataPath: '/tmp/tabs',
      load: () => ({ ok: true, serializedState: loadedSerializedState, source: 'hybrid' }),
      save: vi.fn((_profileRootPath, serializedState) => {
        loadedSerializedState = serializedState
      }),
      now: () => now,
      recentAppSaveEchoTtlMs: 10,
    })

    expect(coordinator.saveRevisionedState({ serializedState: '{"theme":"dawn"}', baseRevision: 1 })).toMatchObject({
      ok: true,
      revision: 2,
    })
    expect(coordinator.saveRevisionedState({ serializedState: '{"theme":"light"}', baseRevision: 2 })).toMatchObject({
      ok: true,
      revision: 3,
    })

    loadedSerializedState = '{"theme":"dawn"}'
    now += 20

    expect(coordinator.reloadProfileRoot('/tmp/tabs')).toEqual({
      ok: true,
      serializedState: '{"theme":"dawn"}',
      source: 'hybrid',
      revision: 4,
    })
  })

  it('blocks saves after a corrupt external profile reload', () => {
    let corrupt = false
    const save = vi.fn()
    const coordinator = createAppStateCoordinator({
      userDataPath: '/tmp/tabs',
      load: () =>
        corrupt
          ? {
              ok: false,
              serializedState: null,
              source: 'hybrid',
              error: 'Existing app state could not be loaded.',
            }
          : { ok: true, serializedState: '{"theme":"dawn"}', source: 'hybrid' },
      save,
    })

    corrupt = true

    expect(coordinator.reloadProfileRoot('/tmp/tabs')).toEqual({
      ok: false,
      serializedState: null,
      source: 'hybrid',
      error: 'Existing app state could not be loaded.',
      revision: 1,
    })
    expect(coordinator.saveRevisionedState({ serializedState: '{"theme":"light"}', baseRevision: 1 })).toEqual({
      ok: false,
      reason: 'load-failed',
      error: LOAD_FAILED_SAVE_ERROR,
      currentRevision: 1,
      serializedState: '{"theme":"dawn"}',
    })
    expect(save).not.toHaveBeenCalled()
  })
})
