import { describe, expect, it } from 'vitest'
import { DEFAULT_STATE } from '../state/app-state'
import type { AppState, FrontmatterTemplate, NoteAisleBody, NoteBody, Space, Tab } from '../types/app'
import {
  buildVisualizerGraph,
  DEFAULT_VISUALIZER_FILTER,
  getVisualizerAisleNodeId,
  getVisualizerDuplicateGroupId,
  getVisualizerLocationNodeId,
  type VisualizerFilterState,
} from './visualizer-graph'

const template: FrontmatterTemplate = {
  id: 'template-project',
  name: 'project',
  fields: [
    { id: 'field-id', key: 'id', type: 'text', defaultValue: '', computed: 'none' },
    { id: 'field-status', key: 'status', type: 'text', defaultValue: '', computed: 'none' },
  ],
}

function body(id: string, aisleId: string, aisleBodyId: string): NoteBody {
  return {
    id,
    aisles: [{ id: aisleId, aisleBodyId }],
  }
}

function aisleBody(id: string, markdown: string, patch: Partial<NoteAisleBody> = {}): NoteAisleBody {
  return {
    id,
    markdown,
    tags: [],
    frontmatter: null,
    frontmatterStatus: 'none',
    ...patch,
  }
}

function createState(): AppState {
  const parentA: Tab = {
    id: 'parent-a',
    title: 'Parent A',
    noteBodyId: 'body-home',
    activeSubTabId: null,
    subTabs: [
      {
        id: 'sub-a',
        title: 'Sub A',
        noteBodyId: 'body-sub',
      },
    ],
  }
  const parentB: Tab = {
    id: 'parent-b',
    title: 'Parent B',
    noteBodyId: 'body-home',
    activeSubTabId: null,
    subTabs: [],
  }
  const space: Space = {
    id: 'space-a',
    name: 'Space A',
    settings: { autoRemoveDeletedDays: 30 },
    data: {
      activeTabId: 'parent-a',
      tabs: [parentA, parentB],
      deletedTabs: [],
      deletedSubTabs: [],
    },
  }
  return {
    ...DEFAULT_STATE,
    activeDomainId: 'domain-a',
    activeSpaceId: 'space-a',
    domains: [
      {
        id: 'domain-a',
        name: 'Domain A',
        activeSpaceId: 'space-a',
        spaces: [space],
      },
    ],
    spaces: [space],
    frontmatter: {
      settingsTemplateId: template.id,
      lastAppliedTemplateId: template.id,
      templates: [template],
    },
    noteBodies: [
      body('body-home', 'aisle-home', 'aisle-body-home'),
      body('body-sub', 'aisle-sub', 'aisle-body-shared'),
    ],
    noteAisleBodies: [
      aisleBody('aisle-body-home', '#Cool home text', {
        tags: ['Cool'],
        frontmatter: { id: 'home-1', status: 'open' },
        frontmatterStatus: 'valid',
        frontmatterMeta: {
          templateId: template.id,
          templateDerived: true,
          templateFieldOrigins: {
            id: { templateId: template.id, fieldId: 'field-id' },
            status: { templateId: template.id, fieldId: 'field-status' },
          },
        },
      }),
      aisleBody('aisle-body-shared', '#Cool #Other sub text', { tags: ['Cool', 'Other'] }),
    ],
  }
}

function createDenseTaggedState(): AppState {
  const tabs: Tab[] = []
  const noteBodies: NoteBody[] = []
  const noteAisleBodies: NoteAisleBody[] = []

  for (let parentIndex = 0; parentIndex < 7; parentIndex += 1) {
    const parentId = `dense-parent-${parentIndex}`
    const homeBodyId = `dense-body-home-${parentIndex}`
    const homeAisleId = `dense-aisle-home-${parentIndex}`
    const homeAisleBodyId = `dense-aisle-body-home-${parentIndex}`
    noteBodies.push(body(homeBodyId, homeAisleId, homeAisleBodyId))
    noteAisleBodies.push(aisleBody(homeAisleBodyId, `#Cool parent ${parentIndex}`))

    const subTabs = [0, 1].map((subIndex) => {
      const subTabId = `dense-sub-${parentIndex}-${subIndex}`
      const subBodyId = `dense-body-sub-${parentIndex}-${subIndex}`
      const subAisleId = `dense-aisle-sub-${parentIndex}-${subIndex}`
      const subAisleBodyId = `dense-aisle-body-sub-${parentIndex}-${subIndex}`
      noteBodies.push(body(subBodyId, subAisleId, subAisleBodyId))
      noteAisleBodies.push(aisleBody(subAisleBodyId, `#Cool sub ${parentIndex} ${subIndex}`))
      return { id: subTabId, title: `Sub ${parentIndex} ${subIndex}`, noteBodyId: subBodyId }
    })

    tabs.push({
      id: parentId,
      title: `Parent ${parentIndex}`,
      noteBodyId: homeBodyId,
      activeSubTabId: subTabs[0]?.id ?? null,
      subTabs,
    })
  }

  const space: Space = {
    id: 'dense-space',
    name: 'Dense Space',
    settings: { autoRemoveDeletedDays: 30 },
    data: {
      activeTabId: tabs[0]?.id ?? '',
      tabs,
      deletedTabs: [],
      deletedSubTabs: [],
    },
  }

  return {
    ...DEFAULT_STATE,
    activeDomainId: 'dense-domain',
    activeSpaceId: space.id,
    domains: [
      {
        id: 'dense-domain',
        name: 'Dense Domain',
        activeSpaceId: space.id,
        spaces: [space],
      },
    ],
    spaces: [space],
    noteBodies,
    noteAisleBodies,
  }
}

function filter(patch: Partial<VisualizerFilterState>): VisualizerFilterState {
  return {
    ...DEFAULT_VISUALIZER_FILTER,
    ...patch,
    frontmatter: {
      ...DEFAULT_VISUALIZER_FILTER.frontmatter,
      ...(patch.frontmatter ?? {}),
    },
  }
}

function nodeCollisionRect(node: { position: { x: number; y: number } }) {
  const width = 150
  const height = 58
  return {
    left: node.position.x - width / 2,
    right: node.position.x + width / 2,
    top: node.position.y - height / 2,
    bottom: node.position.y + height / 2,
  }
}

function rectsOverlap(
  left: ReturnType<typeof nodeCollisionRect>,
  right: ReturnType<typeof nodeCollisionRect>,
): boolean {
  return left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top
}

describe('buildVisualizerGraph', () => {
  it('builds a hierarchy-first overview without subtab or relationship nodes', () => {
    const graph = buildVisualizerGraph(createState())

    expect(graph.nodes.map((node) => node.kind)).toEqual(
      expect.arrayContaining(['domain', 'space', 'parent', 'note']),
    )
    expect(graph.nodes.some((node) => node.kind === 'subtab')).toBe(false)
    expect(graph.nodes.some((node) => node.kind === 'tag')).toBe(false)
    expect(graph.edges.some((edge) => edge.kind === 'hierarchy')).toBe(true)
  })

  it('builds non-redundant graph hierarchy chips and full preview hierarchy chips', () => {
    const overviewGraph = buildVisualizerGraph(createState())
    const domainNode = overviewGraph.nodes.find((node) => node.id === 'domain:domain-a')
    const spaceNode = overviewGraph.nodes.find((node) => node.id === 'space:domain-a:space-a')
    const parentNode = overviewGraph.nodes.find((node) => node.id === 'parent:domain-a:space-a:parent-a')
    const homeNode = overviewGraph.nodes.find((node) =>
      node.id === getVisualizerLocationNodeId({ domainId: 'domain-a', spaceId: 'space-a', tabId: 'parent-a', subTabId: null }),
    )

    expect(domainNode?.hierarchyChips).toEqual([])
    expect(domainNode?.previewHierarchyChips).toEqual([{ kind: 'domain', label: 'Domain A' }])
    expect(spaceNode?.hierarchyChips).toEqual([{ kind: 'domain', label: 'Domain A' }])
    expect(spaceNode?.previewHierarchyChips).toEqual([
      { kind: 'domain', label: 'Domain A' },
      { kind: 'space', label: 'Space A' },
    ])
    expect(parentNode?.hierarchyChips).toEqual([
      { kind: 'domain', label: 'Domain A' },
      { kind: 'space', label: 'Space A' },
    ])
    expect(parentNode?.previewHierarchyChips).toEqual([
      { kind: 'domain', label: 'Domain A' },
      { kind: 'space', label: 'Space A' },
      { kind: 'parent', label: 'Parent A' },
    ])
    expect(homeNode?.hierarchyChips).toEqual([
      { kind: 'domain', label: 'Domain A' },
      { kind: 'space', label: 'Space A' },
      { kind: 'parent', label: 'Parent A' },
    ])
    expect(homeNode?.preview?.hierarchyChips).toEqual([
      { kind: 'domain', label: 'Domain A' },
      { kind: 'space', label: 'Space A' },
      { kind: 'parent', label: 'Parent A' },
      { kind: 'note', label: 'home' },
    ])

    const tagGraph = buildVisualizerGraph(createState(), filter({ mode: 'tags', selectedTagKeys: ['cool'] }))
    const subtabLocation = { domainId: 'domain-a', spaceId: 'space-a', tabId: 'parent-a', subTabId: 'sub-a' }
    const subtabNode = tagGraph.nodes.find((node) => node.id === getVisualizerLocationNodeId(subtabLocation))
    const aisleNode = tagGraph.nodes.find((node) => node.id === getVisualizerAisleNodeId(subtabLocation, 'aisle-sub'))

    expect(subtabNode?.hierarchyChips).toEqual([
      { kind: 'domain', label: 'Domain A' },
      { kind: 'space', label: 'Space A' },
      { kind: 'parent', label: 'Parent A' },
    ])
    expect(subtabNode?.preview?.hierarchyChips).toEqual([
      { kind: 'domain', label: 'Domain A' },
      { kind: 'space', label: 'Space A' },
      { kind: 'parent', label: 'Parent A' },
      { kind: 'subtab', label: 'Sub A' },
    ])
    expect(aisleNode?.hierarchyChips).toEqual([
      { kind: 'domain', label: 'Domain A' },
      { kind: 'space', label: 'Space A' },
      { kind: 'parent', label: 'Parent A' },
      { kind: 'subtab', label: 'Sub A' },
    ])
    expect(aisleNode?.preview?.hierarchyChips).toEqual([
      { kind: 'domain', label: 'Domain A' },
      { kind: 'space', label: 'Space A' },
      { kind: 'parent', label: 'Parent A' },
      { kind: 'subtab', label: 'Sub A' },
      { kind: 'aisle', label: 'aisle 1' },
    ])
  })

  it('expands selected tag occurrences into tag aisle and subtab context', () => {
    const graph = buildVisualizerGraph(createState(), filter({ mode: 'tags', selectedTagKeys: ['cool'] }))

    expect(graph.nodes.some((node) => node.id === 'tag:cool')).toBe(true)
    expect(graph.nodes.some((node) => node.kind === 'aisle')).toBe(true)
    expect(graph.nodes.some((node) => node.kind === 'subtab')).toBe(true)
    expect(graph.edges.filter((edge) => edge.kind === 'tag')).toHaveLength(3)
  })

  it('creates duplicate groups for linked note bodies', () => {
    const state = createState()
    const graph = buildVisualizerGraph(state, filter({ mode: 'duplicates' }))
    const noteGroupId = getVisualizerDuplicateGroupId('note', 'body-home')

    expect(graph.duplicateGroups.some((group) => group.id === noteGroupId && group.count === 2)).toBe(true)
    expect(graph.nodes.some((node) => node.id === noteGroupId && node.kind === 'duplicate-group')).toBe(true)
    expect(graph.edges.filter((edge) => edge.kind === 'duplicate-note')).toHaveLength(2)
  })

  it('creates duplicate groups for linked aisle bodies across visible locations', () => {
    const state = createState()
    state.noteBodies.push(body('body-extra', 'aisle-extra', 'aisle-body-shared'))
    state.domains[0].spaces[0].data.tabs.push({
      id: 'parent-c',
      title: 'Parent C',
      noteBodyId: 'body-extra',
      activeSubTabId: null,
      subTabs: [],
    })
    state.spaces = state.domains[0].spaces

    const graph = buildVisualizerGraph(state, filter({ mode: 'duplicates' }))
    const aisleGroupId = getVisualizerDuplicateGroupId('aisle', 'aisle-body-shared')

    expect(graph.duplicateGroups.some((group) => group.id === aisleGroupId && group.kind === 'aisle')).toBe(true)
    expect(graph.edges.filter((edge) => edge.kind === 'duplicate-aisle' && edge.source === aisleGroupId)).toHaveLength(2)
  })

  it('filters front matter by explicit template and includes field/type relationships', () => {
    const graph = buildVisualizerGraph(
      createState(),
      filter({
        mode: 'frontmatter',
        frontmatter: {
          ...DEFAULT_VISUALIZER_FILTER.frontmatter,
          selectedTemplateId: template.id,
        },
      }),
    )

    expect(graph.nodes.some((node) => node.id === `fm-template:${template.id}`)).toBe(true)
    expect(graph.nodes.some((node) => node.id === 'fm-field:id')).toBe(true)
    expect(graph.nodes.some((node) => node.id === 'fm-type:text')).toBe(true)
    expect(graph.edges.some((edge) => edge.kind === 'frontmatter-template')).toBe(true)
    expect(graph.edges.some((edge) => edge.kind === 'frontmatter-field')).toBe(true)
  })

  it('marks focused relationship nodes and their connected hierarchy for highlighting', () => {
    const state = createState()
    const location = { domainId: 'domain-a', spaceId: 'space-a', tabId: 'parent-a', subTabId: null }
    const noteNodeId = getVisualizerLocationNodeId(location)
    const graph = buildVisualizerGraph(state, filter({ focusedNodeId: noteNodeId }))

    expect(graph.selectedNodeIds.has(noteNodeId)).toBe(true)
    expect(graph.highlightedNodeIds.has('domain:domain-a')).toBe(true)
    expect(graph.highlightedNodeIds.has(noteNodeId)).toBe(true)
  })

  it('separates dense parent note subtab and aisle nodes without visible box collisions', () => {
    const graph = buildVisualizerGraph(createDenseTaggedState(), filter({ mode: 'tags', selectedTagKeys: ['cool'] }))
    const collisionNodes = graph.nodes.filter((node) =>
      node.kind === 'parent' || node.kind === 'note' || node.kind === 'subtab' || node.kind === 'aisle',
    )

    for (let leftIndex = 0; leftIndex < collisionNodes.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < collisionNodes.length; rightIndex += 1) {
        expect(
          rectsOverlap(nodeCollisionRect(collisionNodes[leftIndex]), nodeCollisionRect(collisionNodes[rightIndex])),
          `${collisionNodes[leftIndex].id} overlaps ${collisionNodes[rightIndex].id}`,
        ).toBe(false)
      }
    }
  })

  it('keeps collision-relaxed visualizer layout deterministic', () => {
    const firstGraph = buildVisualizerGraph(createDenseTaggedState(), filter({ mode: 'tags', selectedTagKeys: ['cool'] }))
    const secondGraph = buildVisualizerGraph(createDenseTaggedState(), filter({ mode: 'tags', selectedTagKeys: ['cool'] }))
    const getPositions = (graph: typeof firstGraph) =>
      graph.nodes
        .map((node) => [node.id, Number(node.position.x.toFixed(4)), Number(node.position.y.toFixed(4))])
        .sort((left, right) => String(left[0]).localeCompare(String(right[0])))

    expect(getPositions(firstGraph)).toEqual(getPositions(secondGraph))
  })

  it('routes hierarchy and aisle edges through top and bottom handles based on node positions', () => {
    const graph = buildVisualizerGraph(createDenseTaggedState(), filter({ mode: 'tags', selectedTagKeys: ['cool'] }))
    const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
    const routedEdges = graph.edges.filter((edge) => edge.kind === 'hierarchy' || edge.kind === 'aisle-slot')

    expect(routedEdges.length).toBeGreaterThan(0)
    routedEdges.forEach((edge) => {
      const source = nodeById.get(edge.source)
      const target = nodeById.get(edge.target)
      expect(source).toBeTruthy()
      expect(target).toBeTruthy()
      if (!source || !target) return
      const targetAboveSource = target.position.y < source.position.y
      expect(edge.sourceHandle).toBe(targetAboveSource ? 'visualizer-source-top' : 'visualizer-source-bottom')
      expect(edge.targetHandle).toBe(targetAboveSource ? 'visualizer-target-bottom' : 'visualizer-target-top')
    })
  })
})
