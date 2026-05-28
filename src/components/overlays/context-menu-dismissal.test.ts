import { describe, expect, it, vi } from 'vitest'
import {
  shouldDismissContextMenuFromKey,
  shouldDismissContextMenuFromPointerTarget,
} from './context-menu-dismissal'

describe('context menu pointer dismissal', () => {
  it('dismisses when the pointer target is outside the context menu', () => {
    const closest = vi.fn(() => null)
    const target = { closest } as unknown as EventTarget

    expect(shouldDismissContextMenuFromPointerTarget(target)).toBe(true)
    expect(closest).toHaveBeenCalledWith('.tab-context-menu')
  })

  it('keeps the menu open when the pointer target is inside the context menu', () => {
    const closest = vi.fn(() => ({ className: 'tab-context-menu' }))
    const target = { closest } as unknown as EventTarget

    expect(shouldDismissContextMenuFromPointerTarget(target)).toBe(false)
    expect(closest).toHaveBeenCalledWith('.tab-context-menu')
  })

  it('checks parentElement for non-element event targets', () => {
    const closest = vi.fn(() => ({ className: 'tab-context-menu' }))
    const target = { parentElement: { closest } } as unknown as EventTarget

    expect(shouldDismissContextMenuFromPointerTarget(target)).toBe(false)
    expect(closest).toHaveBeenCalledWith('.tab-context-menu')
  })

  it('dismisses when no DOM target is available', () => {
    expect(shouldDismissContextMenuFromPointerTarget(null)).toBe(true)
  })

  it('dismisses only from the Escape key', () => {
    expect(shouldDismissContextMenuFromKey('Escape')).toBe(true)
    expect(shouldDismissContextMenuFromKey('Enter')).toBe(false)
    expect(shouldDismissContextMenuFromKey('Esc')).toBe(false)
  })
})
