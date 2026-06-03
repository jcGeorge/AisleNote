import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { getArrangePreviewGhostItems } from './useArrangeMode'

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

describe('useArrangeMode arrange preview labels', () => {
  it('keeps multi-drag preview labels as the original dragged item text', () => {
    const source = readFileSync(join(arrangeDir, 'useArrangeMode.ts'), 'utf8')

    expect(source).not.toContain('+ ${dragIds.length - 1}')
    expect(source).not.toContain('getArrangeDragPreviewWidth')
    expect(source).toContain('const previewLabel = domain.name')
    expect(source).toContain('const previewLabel = space.name')
    expect(source).toContain('const previewLabel = label')
    expect(source.match(/width: rect\.width/g)).toHaveLength(3)
  })
})

describe('arrange preview ghost items', () => {
  const createElement = (id: string, left: number, top: number, width = 40, height = 24) => ({
    getAttribute: (name: string) => (name === 'data-arrange-tab-id' ? id : null),
    getBoundingClientRect: () => ({
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height,
    }),
  })

  it('collects every selected ghost item from the rail, excluding the dragged item', () => {
    const elements = [
      createElement('parent-a', 20, 10, 44, 24),
      createElement('parent-b', 100, 50),
      createElement('parent-c', 160, 70, 52, 28),
      createElement('parent-d', 220, 90, 64, 30),
    ]
    const rail = {
      querySelectorAll: (selector: string) => (selector === '[data-arrange-tab-id]' ? elements : []),
    } as unknown as HTMLElement
    const labels = new Map([
      ['parent-a', 'Parent A'],
      ['parent-b', 'Parent B'],
      ['parent-c', 'Parent C'],
      ['parent-d', 'Parent D'],
    ])

    expect(
      getArrangePreviewGhostItems({
        rail,
        selector: '[data-arrange-tab-id]',
        attributeName: 'data-arrange-tab-id',
        selectedIds: ['parent-a', 'parent-b', 'parent-c', 'parent-d'],
        draggedId: 'parent-b',
        getLabel: (id) => labels.get(id),
        previewLeft: 100,
        previewTop: 50,
        fallbackWidth: 40,
        fallbackHeight: 24,
      }),
    ).toEqual([
      { id: 'parent-a', label: 'Parent A', x: -80, y: -40, width: 44, height: 24 },
      { id: 'parent-c', label: 'Parent C', x: 60, y: 20, width: 52, height: 28 },
      { id: 'parent-d', label: 'Parent D', x: 120, y: 40, width: 64, height: 30 },
    ])
  })

  it('creates fallback ghost items when selected DOM nodes are missing', () => {
    const elements = [createElement('parent-b', 100, 50), createElement('parent-d', 220, 90)]
    const rail = {
      querySelectorAll: () => elements,
    } as unknown as HTMLElement
    const labels = new Map([
      ['parent-a', 'Parent A'],
      ['parent-b', 'Parent B'],
      ['parent-c', 'Parent C'],
      ['parent-d', 'Parent D'],
    ])

    expect(
      getArrangePreviewGhostItems({
        rail,
        selector: '[data-arrange-tab-id]',
        attributeName: 'data-arrange-tab-id',
        selectedIds: ['parent-a', 'parent-b', 'parent-c', 'parent-d'],
        draggedId: 'parent-b',
        getLabel: (id) => labels.get(id),
        previewLeft: 100,
        previewTop: 50,
        fallbackWidth: 40,
        fallbackHeight: 24,
      }),
    ).toEqual([
      { id: 'parent-a', label: 'Parent A', x: -34, y: -18, width: 40, height: 24 },
      { id: 'parent-c', label: 'Parent C', x: -58, y: 18, width: 40, height: 24 },
      { id: 'parent-d', label: 'Parent D', x: 120, y: 40, width: 40, height: 24 },
    ])
  })
})
