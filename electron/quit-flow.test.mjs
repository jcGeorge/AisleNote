import { describe, expect, it, vi } from 'vitest'
import { finishCloseAfterFlush } from './quit-flow.mjs'

describe('Electron quit flow', () => {
  it('resumes app quit after a close flush when quit was requested', () => {
    const app = { quit: vi.fn() }
    const window = { isDestroyed: vi.fn(() => false), close: vi.fn() }

    expect(finishCloseAfterFlush({ app, window, quitRequested: true })).toBe('quit')
    expect(app.quit).toHaveBeenCalledOnce()
    expect(window.close).not.toHaveBeenCalled()
  })

  it('closes only the window after a normal close flush', () => {
    const app = { quit: vi.fn() }
    const window = { isDestroyed: vi.fn(() => false), close: vi.fn() }

    expect(finishCloseAfterFlush({ app, window, quitRequested: false })).toBe('close-window')
    expect(window.close).toHaveBeenCalledOnce()
    expect(app.quit).not.toHaveBeenCalled()
  })

  it('does nothing for normal close when the window is already destroyed', () => {
    const app = { quit: vi.fn() }
    const window = { isDestroyed: vi.fn(() => true), close: vi.fn() }

    expect(finishCloseAfterFlush({ app, window, quitRequested: false })).toBe('window-destroyed')
    expect(window.close).not.toHaveBeenCalled()
    expect(app.quit).not.toHaveBeenCalled()
  })
})
