import { describe, expect, it } from 'vitest'
import {
  getEditorContentStateMutationVersion,
  markEditorContentStateMutation,
} from './persistence-scheduling'

describe('persistence scheduling markers', () => {
  it('tracks editor content state mutations with a monotonic version', () => {
    const initialVersion = getEditorContentStateMutationVersion()

    expect(markEditorContentStateMutation()).toBe(initialVersion + 1)
    expect(getEditorContentStateMutationVersion()).toBe(initialVersion + 1)
    expect(markEditorContentStateMutation()).toBe(initialVersion + 2)
    expect(getEditorContentStateMutationVersion()).toBe(initialVersion + 2)
  })
})
