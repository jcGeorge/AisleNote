import { describe, expect, it } from 'vitest'
import { shouldFocusPendingCursorRestore } from './cursor-restore-focus'

describe('pending note cursor restore focus', () => {
  it('focuses only explicit pending focus requests', () => {
    expect(shouldFocusPendingCursorRestore('aisle-1', 'aisle-1')).toBe(true)
    expect(shouldFocusPendingCursorRestore('aisle-1', 'aisle-2')).toBe(false)
    expect(shouldFocusPendingCursorRestore(null, 'aisle-1')).toBe(false)
    expect(shouldFocusPendingCursorRestore('', 'aisle-1')).toBe(false)
  })
})
