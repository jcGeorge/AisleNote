import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ARRANGE_DRAG_PREVIEW_POINTER_OFFSET_PX } from '../components/navigation/arrange-drag-preview-style'
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

  it('offsets drag preview ghost origins without changing pointer hit testing', () => {
    const source = readFileSync(join(arrangeDir, 'useArrangeMode.ts'), 'utf8')

    expect(source).toContain(
      "getArrangeDragPreviewBelowPointerTop,\n  getArrangeDragPreviewCenteredLeft,",
    )
    expect(source.match(/previewLeft: getArrangeDragPreviewCenteredLeft\(event\.clientX, rect\.width\)/g)).toHaveLength(3)
    expect(source.match(/previewTop: getArrangeDragPreviewBelowPointerTop\(event\.clientY, rect\.height\)/g)).toHaveLength(3)
    expect(source).toContain('updateTabDropTarget(item, event.clientX, event.clientY)')
    expect(source).toContain('updateTabDropTarget(drag.item, clientX, clientY)')
    expect(source).toContain('updateDomainDropTarget(event.clientX, event.clientY)')
    expect(source).toContain('updateDomainDropTarget(clientX, clientY)')
    expect(source).toContain('updateSpaceDropTarget(event.clientX, event.clientY)')
    expect(source).toContain('updateSpaceDropTarget(clientX, clientY)')
  })
})

describe('useArrangeMode arrange focus cleanup', () => {
  it('blurs arrange rail controls on live drag start and cleanup', () => {
    const source = readFileSync(join(arrangeDir, 'useArrangeMode.ts'), 'utf8')

    expect(source).toContain("import { blurActiveArrangeRailControl, blurArrangeRailControl } from './arrange-focus-cleanup'")
    expect(source.match(/blurArrangeRailControl\(event\.currentTarget\)/g)).toHaveLength(3)
    expect(source).toContain('const clearDomainPointerDrag = () => {')
    expect(source).toContain('const clearSpacePointerDrag = () => {')
    expect(source).toContain('const clearTabPointerDrag = () => {')
    expect(source.match(/blurActiveArrangeRailControl\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(5)
  })
})

describe('useArrangeMode arrange selection active replacement', () => {
  it('reassigns active context when the active arrange item is toggled out', () => {
    const source = readFileSync(join(arrangeDir, 'useArrangeMode.ts'), 'utf8')

    expect(source).toContain("import { resolveArrangeSelectionClick } from './arrange-active-context'")
    expect(source).toContain("import { projectActiveDomainState, setActiveDomain, setActiveSpaceInActiveDomain } from '../state/domains'")
    expect(source).toContain(
      "import { selectPrimeTabWithMemory, selectSubTabWithMemory } from '../state/navigation-memory'",
    )
    expect(source).toContain('const applyArrangeSelectionActiveReplacement = (')
    expect(source).toContain('const handleArrangeSelectionClick = ({')
    expect(source).toContain('const { nextSelection, activeReplacementId } = resolveArrangeSelectionClick({')
    expect(source).toContain('applyArrangeSelectionActiveReplacement(kind, activeReplacementId)')
    expect(source).toContain("if (kind === 'domain') {")
    expect(source).toContain('setState((previous) => setActiveDomain(previous, replacementId))')
    expect(source).toContain("if (kind === 'space') {")
    expect(source).toContain('setState((previous) => setActiveSpaceInActiveDomain(previous, replacementId))')
    expect(source).toContain("if (kind === 'parent') {")
    expect(source).toContain('updateActiveSpaceData((data) => selectPrimeTabWithMemory(data, replacementId))')
    expect(source).toContain("if (kind === 'subtab') {")
    expect(source).toContain('updateActiveSpaceData((data) => selectSubTabWithMemory(data, replacementId))')
    expect(source.match(/handleArrangeSelectionClick\(\{/g)).toHaveLength(4)
  })
})

describe('useArrangeMode live drag lifecycle policy', () => {
  it('uses explicit finish kinds and shared cleanup policy', () => {
    const source = readFileSync(join(arrangeDir, 'useArrangeMode.ts'), 'utf8')

    expect(source).toContain("import {\n  clearArrangeModeLiveDragState,\n  shouldClearArrangeSelectionAfterLiveDragFinish,")
    expect(source).toContain('const completeArrangeLiveDrag = ({')
    expect(source).toContain("finishKind: 'noop'")
    expect(source).toContain("finishKind = 'reorder'")
    expect(source).toContain("finishKind = 'cross-domain-move'")
    expect(source).toContain("'hierarchy-drop'")
    expect(source).toContain("'blocked'")
    expect(source).toContain('shouldClearArrangeSelectionAfterLiveDragFinish({ itemKind, finishKind })')
    expect(source).toContain('resetArrangeLiveDragMode(resetScope)')
    expect(source.match(/return finishKind/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
    expect(source.match(/if \(!drag\) return null/g)).toHaveLength(3)
  })
})

describe('useArrangeMode no-op drag selection cleanup', () => {
  it('preserves domain and space multi-selection when insertion drops do not move anything', () => {
    const source = readFileSync(join(arrangeDir, 'useArrangeMode.ts'), 'utf8')

    expect(source).toContain('function wouldInsertionMoveItems')
    expect(source).toContain('const didMoveDomain = wouldInsertionMoveItems(')
    expect(source).toContain('if (didMoveDomain) {')
    expect(source).toContain('const didMoveSpace = wouldInsertionMoveItems(')
    expect(source).toContain('if (didMoveSpace) {')
    expect(source).not.toContain('suppressNextDomainArrangeExitClick()\n    clearSelection()\n    clearDomainPointerDrag()')
    expect(source).not.toContain('suppressNextSpaceArrangeExitClick()\n    clearSelection()\n    clearSpacePointerDrag()')
  })

  it('keeps selection clearing for actual cross-domain space moves and skips same-domain no-ops', () => {
    const source = readFileSync(join(arrangeDir, 'useArrangeMode.ts'), 'utf8')

    expect(source).toContain('const shouldNotifyCrossDomainMove =')
    expect(source).toContain('if (shouldNotifyCrossDomainMove) {')
    expect(source).toContain('moveSelectedSpacesToDomain(previous, drag.sourceDomainId, dragIds, domainTarget.targetId')
    expect(source).toContain('onArrangeSpaceMovedAcrossDomains?.(')
    expect(source).toContain('clearSelection()')
  })

  it('treats sub-tab drops on the source parent as no-op cleanup', () => {
    const source = readFileSync(join(arrangeDir, 'useArrangeMode.ts'), 'utf8')

    expect(source).toContain('if (parentTarget && parentTarget.targetId !== item.parentTabId) {')
    expect(source).toContain('moveSubTabsToParent(item.parentTabId, dragIds, parentTarget.targetId)')
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
        previewTop: 50 + ARRANGE_DRAG_PREVIEW_POINTER_OFFSET_PX,
        fallbackWidth: 40,
        fallbackHeight: 24,
      }),
    ).toEqual([
      { id: 'parent-a', label: 'Parent A', x: -80, y: -72, width: 44, height: 24 },
      { id: 'parent-c', label: 'Parent C', x: 60, y: -12, width: 52, height: 28 },
      { id: 'parent-d', label: 'Parent D', x: 120, y: 8, width: 64, height: 30 },
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
        previewTop: 50 + ARRANGE_DRAG_PREVIEW_POINTER_OFFSET_PX,
        fallbackWidth: 40,
        fallbackHeight: 24,
      }),
    ).toEqual([
      { id: 'parent-a', label: 'Parent A', x: -34, y: -18, width: 40, height: 24 },
      { id: 'parent-c', label: 'Parent C', x: -58, y: 18, width: 40, height: 24 },
      { id: 'parent-d', label: 'Parent D', x: 120, y: 8, width: 40, height: 24 },
    ])
  })
})
