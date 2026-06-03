import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { getArrangePreviewGhostOrigins } from './useArrangeMode'

const arrangeDir = dirname(fileURLToPath(import.meta.url))

describe('useArrangeMode cross-domain space moves', () => {
  it('creates a fallback space with reserved ids and still emits the cross-domain move toast', () => {
    const source = readFileSync(join(arrangeDir, 'useArrangeMode.ts'), 'utf8')

    expect(source).toContain("import { createSpace, createTab } from '../state/workspace'")
    expect(source).toContain("createFallbackSpace: () => createSpace('space', createEntityId)")
    expect(source).toContain('movedSpaces.length > 0')
    expect(source).not.toContain('sourceDomain.spaces.length - movedSpaces.length >= 1')
  })
})

describe('arrange preview ghost origins', () => {
  const createElement = (id: string, left: number, top: number) => ({
    getAttribute: (name: string) => (name === 'data-arrange-tab-id' ? id : null),
    getBoundingClientRect: () => ({
      left,
      top,
      right: left + 40,
      bottom: top + 24,
      width: 40,
      height: 24,
    }),
  })

  it('collects up to two selected item offsets from the rail, excluding the dragged item', () => {
    const elements = [
      createElement('parent-a', 20, 10),
      createElement('parent-b', 100, 50),
      createElement('parent-c', 160, 70),
      createElement('parent-d', 220, 90),
    ]
    const rail = {
      querySelectorAll: (selector: string) => (selector === '[data-arrange-tab-id]' ? elements : []),
    } as unknown as HTMLElement

    expect(
      getArrangePreviewGhostOrigins({
        rail,
        selector: '[data-arrange-tab-id]',
        attributeName: 'data-arrange-tab-id',
        selectedIds: ['parent-a', 'parent-b', 'parent-c', 'parent-d'],
        draggedId: 'parent-b',
        previewLeft: 100,
        previewTop: 50,
      }),
    ).toEqual([
      { x: -80, y: -40 },
      { x: 60, y: 20 },
    ])
  })

  it('skips missing selected nodes without blocking fallback ghost rendering', () => {
    const elements = [createElement('parent-b', 100, 50), createElement('parent-d', 220, 90)]
    const rail = {
      querySelectorAll: () => elements,
    } as unknown as HTMLElement

    expect(
      getArrangePreviewGhostOrigins({
        rail,
        selector: '[data-arrange-tab-id]',
        attributeName: 'data-arrange-tab-id',
        selectedIds: ['parent-a', 'parent-b', 'parent-c', 'parent-d'],
        draggedId: 'parent-b',
        previewLeft: 100,
        previewTop: 50,
      }),
    ).toEqual([{ x: 120, y: 40 }])
  })
})
