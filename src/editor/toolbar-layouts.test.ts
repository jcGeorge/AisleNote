import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TOOLBAR_LAYOUT_ID,
  createCustomToolbarLayout,
  getDuplicateToolbarLayoutName,
  insertToolbarLayoutItemAtIndex,
  getDefaultToolbarLayout,
  getNextCoolbarToolbarLayoutName,
  getToolbarLayouts,
  getToolbarGroupClassName,
  getToolbarLayoutGroups,
  getToolbarLayoutRenderSegments,
  moveToolbarLayoutItemToIndex,
  normalizeToolbarLayoutItems,
  normalizeToolbarLayouts,
  removeToolbarLayoutItem,
  resolveToolbarLayout,
  resolveToolbarLayoutId,
} from './toolbar-layouts'

describe('toolbar layout model', () => {
  it('synthesizes a protected cleaner default layout', () => {
    const layout = getDefaultToolbarLayout()
    const toolIds = layout.items.flatMap((item) => (item.type === 'tool' ? [item.toolId] : []))

    expect(layout).toMatchObject({ id: DEFAULT_TOOLBAR_LAYOUT_ID, name: 'default' })
    expect(toolIds.slice(0, 4)).toEqual(['copy', 'frontmatter', 'tableOfContents', 'aisles'])
    expect(toolIds.slice(4, 6)).toEqual(['undo', 'redo'])
    expect(toolIds).toContain('clear')
    expect(layout.items.filter((item) => item.type === 'spacer').length).toBeGreaterThan(0)
  })

  it('normalizes custom layouts and ignores attempts to persist the protected default', () => {
    const layouts = normalizeToolbarLayouts([
      {
        id: DEFAULT_TOOLBAR_LAYOUT_ID,
        name: 'bad default',
        items: [{ id: 'copy', type: 'tool', toolId: 'copy' }],
      },
      {
        id: 'custom',
        name: '  desktop  ',
        items: [
          { id: 'copy', type: 'tool', toolId: 'copy' },
          { id: 'duplicate-copy', type: 'tool', toolId: 'copy' },
          { id: 'spacer', type: 'spacer' },
          { id: 'missing', type: 'tool', toolId: 'gone' },
          { id: 'bold', type: 'tool', toolId: 'bold' },
        ],
      },
    ])

    expect(layouts).toHaveLength(1)
    expect(layouts[0].id).toBe('custom')
    expect(layouts[0].name).toBe('desktop')
    expect(layouts[0].items).toEqual([
      { id: 'copy', type: 'tool', toolId: 'copy' },
      { id: 'spacer', type: 'spacer' },
      { id: 'bold', type: 'tool', toolId: 'bold' },
    ])
  })

  it('keeps empty, spacer-only, and invalid-tool custom layouts intentional', () => {
    expect(normalizeToolbarLayoutItems([])).toEqual([])

    expect(normalizeToolbarLayoutItems([{ id: 'one', type: 'spacer' }])).toEqual([
      { id: 'one', type: 'spacer' },
    ])

    expect(normalizeToolbarLayoutItems([
      { id: 'one', type: 'spacer' },
      { id: 'bad', type: 'tool', toolId: 'missing' },
    ])).toEqual([{ id: 'one', type: 'spacer' }])
  })

  it('falls back to default items when persisted layout items are missing or invalid shape', () => {
    expect(normalizeToolbarLayoutItems(null).some((item) => item.type === 'tool' && item.toolId === 'copy')).toBe(true)
    expect(normalizeToolbarLayoutItems({}).some((item) => item.type === 'tool' && item.toolId === 'copy')).toBe(true)
  })

  it('resolves missing active layout ids to default without mutating custom layouts', () => {
    const custom = createCustomToolbarLayout('mobile', [
      { id: 'tool-bold', type: 'tool', toolId: 'bold' },
      { id: 'tool-italic', type: 'tool', toolId: 'italic' },
    ])

    expect(resolveToolbarLayout([custom], custom.id).name).toBe('mobile')
    expect(resolveToolbarLayoutId([custom], custom.id)).toBe(custom.id)
    expect(resolveToolbarLayout([custom], 'missing').id).toBe(DEFAULT_TOOLBAR_LAYOUT_ID)
    expect(resolveToolbarLayoutId([custom], 'missing')).toBe(DEFAULT_TOOLBAR_LAYOUT_ID)
    expect(getToolbarLayouts([custom]).map((layout) => layout.id)).toEqual([DEFAULT_TOOLBAR_LAYOUT_ID, custom.id])
  })

  it('generates coolbar names for new and default-duplicate toolbar layouts', () => {
    const layouts = [
      getDefaultToolbarLayout(),
      { id: 'one', name: 'coolbar', items: getDefaultToolbarLayout().items },
      { id: 'two', name: 'Coolbar 2', items: getDefaultToolbarLayout().items },
    ]

    expect(getNextCoolbarToolbarLayoutName([getDefaultToolbarLayout()])).toBe('coolbar')
    expect(getNextCoolbarToolbarLayoutName(layouts)).toBe('coolbar 3')
    expect(getDuplicateToolbarLayoutName('default', layouts)).toBe('coolbar 3')
    expect(getDuplicateToolbarLayoutName('coolbar custom', layouts)).toBe('coolbar 3')
  })

  it('generates duplicate toolbar names from the source base name', () => {
    const layouts = [
      getDefaultToolbarLayout(),
      { id: 'testing', name: 'testing', items: getDefaultToolbarLayout().items },
      { id: 'testing-two', name: 'testing 2', items: getDefaultToolbarLayout().items },
      { id: 'q4', name: 'Q4 2026', items: getDefaultToolbarLayout().items },
    ]

    expect(getDuplicateToolbarLayoutName('testing', layouts)).toBe('testing 3')
    expect(getDuplicateToolbarLayoutName('testing 2', layouts)).toBe('testing 3')
    expect(getDuplicateToolbarLayoutName('Q4 2026', layouts)).toBe('Q4 2026 2')
  })

  it('moves toolbar items to explicit insertion positions', () => {
    const items = [
      { id: 'copy', type: 'tool' as const, toolId: 'copy' as const },
      { id: 'gap', type: 'spacer' as const },
      { id: 'bold', type: 'tool' as const, toolId: 'bold' as const },
      { id: 'italic', type: 'tool' as const, toolId: 'italic' as const },
    ]

    expect(moveToolbarLayoutItemToIndex(items, 'copy', 3).map((item) => item.id)).toEqual(['gap', 'bold', 'copy', 'italic'])
    expect(moveToolbarLayoutItemToIndex(items, 'copy', 4).map((item) => item.id)).toEqual(['gap', 'bold', 'italic', 'copy'])
    expect(moveToolbarLayoutItemToIndex(items, 'italic', 0).map((item) => item.id)).toEqual(['italic', 'copy', 'gap', 'bold'])
    expect(moveToolbarLayoutItemToIndex(items, 'gap', 4).map((item) => item.id)).toEqual(['copy', 'bold', 'italic', 'gap'])
  })

  it('inserts palette items at the targeted toolbar position', () => {
    const items = [
      { id: 'copy', type: 'tool' as const, toolId: 'copy' as const },
      { id: 'italic', type: 'tool' as const, toolId: 'italic' as const },
    ]

    expect(
      insertToolbarLayoutItemAtIndex(items, { id: 'bold', type: 'tool', toolId: 'bold' }, 1).map((item) => item.id),
    ).toEqual(['copy', 'bold', 'italic'])
    expect(
      insertToolbarLayoutItemAtIndex(items, { id: 'spacer', type: 'spacer' }, 3).map((item) => item.id),
    ).toEqual(['copy', 'italic', 'spacer'])
  })

  it('removes toolbar tools and spacers from layouts', () => {
    const items = [
      { id: 'copy', type: 'tool' as const, toolId: 'copy' as const },
      { id: 'gap', type: 'spacer' as const },
      { id: 'bold', type: 'tool' as const, toolId: 'bold' as const },
    ]

    expect(removeToolbarLayoutItem(items, 'copy').map((item) => item.id)).toEqual(['gap', 'bold'])
    expect(removeToolbarLayoutItem(items, 'gap').map((item) => item.id)).toEqual(['copy', 'bold'])
    expect(removeToolbarLayoutItem(items, 'missing')).toBe(items)
    expect(removeToolbarLayoutItem([{ id: 'copy', type: 'tool' as const, toolId: 'copy' as const }], 'copy')).toEqual([])
  })

  it('groups toolbar items on spacers and assigns shared toolbar group classes', () => {
    const groups = getToolbarLayoutGroups([
      { id: 'copy', type: 'tool', toolId: 'copy' },
      { id: 'gap', type: 'spacer' },
      { id: 'bold', type: 'tool', toolId: 'bold' },
      { id: 'clear', type: 'tool', toolId: 'clear' },
    ])

    expect(groups.map((group) => group.map((item) => item.id))).toEqual([['copy'], ['bold', 'clear']])
    expect(getToolbarGroupClassName(groups[0])).toContain('note-tools-toolbar-group')
    expect(getToolbarGroupClassName(groups[1])).toContain('note-format-toolbar-group')
    expect(getToolbarGroupClassName(groups[1])).toContain('clear-note-toolbar-group')
  })

  it('keeps each spacer as a render segment so multiple spacers add visible width', () => {
    const segments = getToolbarLayoutRenderSegments([
      { id: 'leading-gap', type: 'spacer' },
      { id: 'copy', type: 'tool', toolId: 'copy' },
      { id: 'gap-one', type: 'spacer' },
      { id: 'gap-two', type: 'spacer' },
      { id: 'bold', type: 'tool', toolId: 'bold' },
      { id: 'trailing-gap', type: 'spacer' },
    ])

    expect(segments.map((segment) => (
      segment.type === 'spacer' ? `spacer:${segment.id}` : `group:${segment.items.map((item) => item.id).join(',')}`
    ))).toEqual([
      'spacer:leading-gap',
      'group:copy',
      'spacer:gap-one',
      'spacer:gap-two',
      'group:bold',
      'spacer:trailing-gap',
    ])
  })
})
