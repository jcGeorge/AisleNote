import { describe, expect, it } from 'vitest'
import { getNotebookTreeRevealScrollTop } from './notebook-tree-scroll'

describe('notebook tree row reveal scroll geometry', () => {
  it('keeps the current scroll when the row is already fully visible', () => {
    expect(
      getNotebookTreeRevealScrollTop(
        { scrollTop: 120, clientHeight: 240, scrollHeight: 1000 },
        { top: 160, bottom: 192 },
      ),
    ).toBe(120)
  })

  it('scrolls up only enough to reveal a row above the viewport', () => {
    expect(
      getNotebookTreeRevealScrollTop(
        { scrollTop: 240, clientHeight: 240, scrollHeight: 1000 },
        { top: 96, bottom: 128 },
      ),
    ).toBe(96)
  })

  it('scrolls down only enough to reveal a row below the viewport', () => {
    expect(
      getNotebookTreeRevealScrollTop(
        { scrollTop: 120, clientHeight: 240, scrollHeight: 1000 },
        { top: 420, bottom: 452 },
      ),
    ).toBe(212)
  })

  it('clamps the reveal position to the available scroll range', () => {
    expect(
      getNotebookTreeRevealScrollTop(
        { scrollTop: 700, clientHeight: 240, scrollHeight: 900 },
        { top: 880, bottom: 912 },
      ),
    ).toBe(660)
  })
})
