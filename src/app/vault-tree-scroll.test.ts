import { describe, expect, it } from 'vitest'
import { getVaultTreeRevealScrollTop } from './vault-tree-scroll'

describe('vault tree row reveal scroll geometry', () => {
  it('keeps the current scroll when the row is already fully visible', () => {
    expect(
      getVaultTreeRevealScrollTop(
        { scrollTop: 120, clientHeight: 240, scrollHeight: 1000 },
        { top: 160, bottom: 192 },
      ),
    ).toBe(120)
  })

  it('scrolls up only enough to reveal a row above the viewport', () => {
    expect(
      getVaultTreeRevealScrollTop(
        { scrollTop: 240, clientHeight: 240, scrollHeight: 1000 },
        { top: 96, bottom: 128 },
      ),
    ).toBe(96)
  })

  it('scrolls down only enough to reveal a row below the viewport', () => {
    expect(
      getVaultTreeRevealScrollTop(
        { scrollTop: 120, clientHeight: 240, scrollHeight: 1000 },
        { top: 420, bottom: 452 },
      ),
    ).toBe(212)
  })

  it('clamps the reveal position to the available scroll range', () => {
    expect(
      getVaultTreeRevealScrollTop(
        { scrollTop: 700, clientHeight: 240, scrollHeight: 900 },
        { top: 880, bottom: 912 },
      ),
    ).toBe(660)
  })
})
