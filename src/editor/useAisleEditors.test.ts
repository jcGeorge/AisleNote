import { describe, expect, it } from 'vitest'
import {
  getActiveAisleRefSyncValue,
  shouldDeferAisleCycleForMouseActivation,
  shouldFocusAislePointerActivation,
  shouldUseFastSameAisleActivation,
} from './aisle-activation'

describe('aisle editor activation', () => {
  it('uses the fast path only when the current mounted aisle is already active', () => {
    expect(
      shouldUseFastSameAisleActivation({
        switchingAisle: false,
        editorRefMatches: true,
        pluginKeyMatches: true,
        activeAisleStateMatches: true,
      }),
    ).toBe(true)

    expect(
      shouldUseFastSameAisleActivation({
        switchingAisle: true,
        editorRefMatches: true,
        pluginKeyMatches: true,
        activeAisleStateMatches: true,
      }),
    ).toBe(false)
    expect(
      shouldUseFastSameAisleActivation({
        switchingAisle: false,
        editorRefMatches: false,
        pluginKeyMatches: true,
        activeAisleStateMatches: true,
      }),
    ).toBe(false)
    expect(
      shouldUseFastSameAisleActivation({
        switchingAisle: false,
        editorRefMatches: true,
        pluginKeyMatches: false,
        activeAisleStateMatches: true,
      }),
    ).toBe(false)
    expect(
      shouldUseFastSameAisleActivation({
        switchingAisle: false,
        editorRefMatches: true,
        pluginKeyMatches: true,
        activeAisleStateMatches: false,
      }),
    ).toBe(false)
  })

  it('does not force focus for pointer activation on the already-active aisle', () => {
    expect(shouldFocusAislePointerActivation('aisle-1', 'aisle-1')).toBe(false)
    expect(shouldFocusAislePointerActivation('aisle-1', 'aisle-2')).toBe(true)
    expect(shouldFocusAislePointerActivation('aisle-1', '')).toBe(false)
  })

  it('preserves a freshly focused aisle when the resolved aisle is stale but still valid', () => {
    const aisles = Array.from({ length: 8 }, (_, index) => `aisle-${index + 1}`)

    expect(
      getActiveAisleRefSyncValue({
        currentAisleId: 'aisle-7',
        resolvedActiveAisleId: 'aisle-8',
        activeAisleIds: aisles,
      }),
    ).toBe('aisle-7')
  })

  it('falls back to the resolved aisle when the current ref is no longer valid', () => {
    expect(
      getActiveAisleRefSyncValue({
        currentAisleId: 'aisle-missing',
        resolvedActiveAisleId: 'aisle-8',
        activeAisleIds: Array.from({ length: 8 }, (_, index) => `aisle-${index + 1}`),
      }),
    ).toBe('aisle-8')
  })

  it('defers aisle cycling only during unsettled mouse activation for the current aisle', () => {
    expect(shouldDeferAisleCycleForMouseActivation({ aisleId: 'aisle-7', settled: false }, 'aisle-7')).toBe(true)
    expect(shouldDeferAisleCycleForMouseActivation({ aisleId: 'aisle-7', settled: true }, 'aisle-7')).toBe(false)
    expect(shouldDeferAisleCycleForMouseActivation({ aisleId: 'aisle-7', settled: false }, 'aisle-8')).toBe(false)
    expect(shouldDeferAisleCycleForMouseActivation(null, 'aisle-7')).toBe(false)
  })
})
