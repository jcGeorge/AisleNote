import { describe, expect, it } from 'vitest'
import { shouldFocusAislePointerActivation, shouldUseFastSameAisleActivation } from './aisle-activation'

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
})
