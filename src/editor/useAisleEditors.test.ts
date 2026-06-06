import { describe, expect, it } from 'vitest'
import {
  AISLE_ACTIVATION_WARNING_THRESHOLD_MS,
  createAisleActivationDiagnosticSummary,
  getActiveAisleRefSyncValue,
  mergeAisleActivationDiagnosticSummary,
  resolveProgrammaticAisleRewriteMarkdown,
  shouldClearPendingCursorRestoreForAisleActivation,
  shouldDeferAisleCycleForMouseActivation,
  shouldFocusAislePointerActivation,
  shouldUseFastSameAisleActivation,
} from './aisle-activation'
import { EDITOR_BLANK_LINE_PLACEHOLDER } from '../markdown/markdown-utils'

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

  it('does not force focus for pointer activation', () => {
    expect(shouldFocusAislePointerActivation('aisle-1', 'aisle-1')).toBe(false)
    expect(shouldFocusAislePointerActivation('aisle-1', 'aisle-2')).toBe(false)
    expect(shouldFocusAislePointerActivation('aisle-1', '')).toBe(false)
  })

  it('clears pending cursor restore only for pointer activation', () => {
    expect(shouldClearPendingCursorRestoreForAisleActivation('pointer')).toBe(true)
    expect(shouldClearPendingCursorRestoreForAisleActivation('focus')).toBe(false)
    expect(shouldClearPendingCursorRestoreForAisleActivation('programmatic')).toBe(false)
    expect(shouldClearPendingCursorRestoreForAisleActivation(undefined)).toBe(false)
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

  it('merges same-frame activation diagnostics into one summary', () => {
    const summary = createAisleActivationDiagnosticSummary({
      requestedAisleId: 'aisle-2',
      previousAisleId: 'aisle-1',
      source: 'pointer',
      result: 'switched-aisle',
      durationMs: 18,
      focus: false,
      flushPrevious: true,
      mountedEditorCount: 3,
    })

    expect(mergeAisleActivationDiagnosticSummary(summary, {
      requestedAisleId: 'aisle-2',
      previousAisleId: 'aisle-1',
      source: 'focus',
      result: 'fast-same-aisle',
      durationMs: AISLE_ACTIVATION_WARNING_THRESHOLD_MS + 1,
      focus: true,
      flushPrevious: true,
      mountedEditorCount: 4,
    })).toEqual({
      requestedAisleId: 'aisle-2',
      previousAisleId: 'aisle-1',
      count: 2,
      sources: ['pointer', 'focus'],
      results: ['switched-aisle', 'fast-same-aisle'],
      maxDurationMs: AISLE_ACTIVATION_WARNING_THRESHOLD_MS + 1,
      focusRequested: true,
      flushPreviousRequested: true,
      mountedEditorCount: 4,
    })
  })
})

describe('programmatic aisle editor rewrites', () => {
  it('commits cached markdown instead of transient editor markdown', () => {
    const expectedMarkdown = [
      'Intro',
      '',
      EDITOR_BLANK_LINE_PLACEHOLDER,
      '',
      '- [ ] icon',
      '',
      EDITOR_BLANK_LINE_PLACEHOLDER,
      '',
      'Outro',
    ].join('\n')
    const transientMarkdown = [
      'Intro',
      '',
      '- [ ] icon',
      '',
      'Outro',
    ].join('\n')

    expect(resolveProgrammaticAisleRewriteMarkdown({
      isProgrammaticRewrite: true,
      expectedMarkdown,
      currentMarkdown: transientMarkdown,
    })).toBe(expectedMarkdown)
  })

  it('ignores normal editor changes', () => {
    expect(resolveProgrammaticAisleRewriteMarkdown({
      isProgrammaticRewrite: false,
      expectedMarkdown: 'expected',
      currentMarkdown: 'current',
    })).toBeNull()
  })
})
